/**
 * Assignment Epoch Manager — Single Epoch Authority.
 *
 * This module is the **sole coordinator** for assignment epoch
 * transitions in the cluster. No other component may propose,
 * apply, or independently track epoch state.
 *
 * Epoch ownership boundaries:
 * - **AssignmentEpochManager** owns the in-memory epoch and all
 *   transitions (propose via CAS, apply via CDC).
 * - **config.current_epoch** (config table) is the durable,
 *   cluster-wide single source of truth for the persisted epoch.
 * - **CDC** is the sole propagation mechanism: epoch writes go to
 *   the config table partition leader, which generates a CDC event
 *   that every node's CDCEventHandler routes to its local
 *   AssignmentEpochManager via {@link applyEpoch}.
 * - **SystemTableCache.currentEpoch** is a read-only cache of the
 *   epoch *number* used only for stale-update rejection inside the
 *   cache layer. It is not an independent coordinator.
 * - Other components (BootstrapService, BootstrapAPI,
 *   CDCIntegrationService) hold *references* to this manager but
 *   do not maintain independent epoch state.
 *
 * Requirements: 3.2, 3.6, 3.7, 3.8, 5.1, 5.2, 5.3, 5.4
 *
 * @module rebalancer/assignment-epoch-manager
 */

import {EventEmitter} from 'events';
import {AssignmentEpoch} from './assignment-epoch.js';

const LOCAL_STR_EPOCHMISMATCHERROR = 'EpochMismatchError';
const LOCAL_STR_STALEEPOCHERROR = 'StaleEpochError';
const LOCAL_STR_STRING = 'string';
const LOCAL_STR_NODEID_IS_REQUIRED_AND_MUST_BE_A_NON_EMP = 'nodeId is required and must be a non-empty string';
const LOCAL_STR_INITIALEPOCH_MUST_BE_AN_ASSIGNMENTEPOCH = 'initialEpoch must be an AssignmentEpoch instance';
const LOCAL_STR_ASSIGNMENTEPOCHMANAGER_NOT_INITIALIZED = 'AssignmentEpochManager not initialized';
const LOCAL_STR_NUMBER = 'number';
const LOCAL_STR_EXPECTEDEPOCH_MUST_BE_AN_INTEGER = 'expectedEpoch must be an integer';
const LOCAL_STR_EPOCHCHANGE = 'epochChange';
const LOCAL_STR_PROPOSALRETRY = 'proposalRetry';
const LOCAL_STR_MAX_RETRIES_EXCEEDED = 'Max retries exceeded';
const LOCAL_STR_EPOCHAPPLIED = 'epochApplied';
const LOCAL_STR_CDC = 'cdc';

/**
 * Error thrown when a compare-and-swap operation fails due to
 * epoch mismatch.
 */
class EpochMismatchError extends Error {
  /**
   * Create an EpochMismatchError.
   * @param {number} expectedEpoch - The epoch that was expected.
   * @param {number} actualEpoch - The actual current epoch.
   */
  constructor(expectedEpoch, actualEpoch) {
    super(
      `Epoch mismatch: expected ${expectedEpoch}, but current epoch is ${actualEpoch}`,
    );
    this.name = LOCAL_STR_EPOCHMISMATCHERROR;
    this.expectedEpoch = expectedEpoch;
    this.actualEpoch = actualEpoch;
  }
}

/**
 * Error thrown when attempting to apply a stale (older) epoch.
 */
class StaleEpochError extends Error {
  /**
   * Create a StaleEpochError.
   * @param {number} incomingEpoch - The epoch number being applied.
   * @param {number} currentEpoch - The current epoch number.
   */
  constructor(incomingEpoch, currentEpoch) {
    super(
      `Stale epoch: incoming epoch ${incomingEpoch} is not newer than ` +
      `current epoch ${currentEpoch}`,
    );
    this.name = LOCAL_STR_STALEEPOCHERROR;
    this.incomingEpoch = incomingEpoch;
    this.currentEpoch = currentEpoch;
  }
}

/**
 * Default retry configuration for proposeEpochWithRetry.
 */
const DEFAULT_RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 100,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
};

/**
 * AssignmentEpochManager is the **single epoch authority** for the
 * cluster. It manages immutable {@link AssignmentEpoch} instances
 * with compare-and-swap (CAS) coordination.
 *
 * Ownership contract (Requirements 5.1–5.4):
 * - This class is the sole coordinator for assignment epoch
 *   transitions. No other component may propose or apply epochs
 *   independently.
 * - Epoch reads: components obtain the current epoch from this
 *   manager or from `config.current_epoch` via CDC.
 * - Epoch writes: only this manager's {@link proposeEpoch} and
 *   {@link applyEpoch} methods mutate epoch state.
 * - Epoch propagation: CDC is the single propagation mechanism.
 *   Proposed epochs are persisted to `config.current_epoch` in the
 *   config table; the resulting CDC event is delivered to every
 *   node's CDCEventHandler, which calls {@link applyEpoch}.
 *
 * Key behaviors:
 * - {@link proposeEpoch} uses CAS: only succeeds if current epoch
 *   matches expectedEpoch
 * - {@link applyEpoch} rejects epochs older than or equal to
 *   current
 * - New epoch number must be exactly one greater than previous
 * - {@link proposeEpochWithRetry} handles CAS failures with
 *   exponential backoff
 *
 * @extends EventEmitter
 */
class AssignmentEpochManager extends EventEmitter {
  /**
   * Create a new AssignmentEpochManager.
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - The ID of this node (for proposing epochs).
   * @param {Function} [options.timestampProvider] - Function that returns HLC timestamp.
   * @param {Function} [options.delayFn] - Function for delays (for testing).
   */
  constructor(options = {}) {
    super();

    if (!options.nodeId || typeof options.nodeId !== LOCAL_STR_STRING) {
      throw new Error(LOCAL_STR_NODEID_IS_REQUIRED_AND_MUST_BE_A_NON_EMP);
    }

    this._nodeId = options.nodeId;
    this._timestampProvider = options.timestampProvider || (() => Date.now().toString());
    this._currentEpoch = null;
    this._delayFn = options.delayFn || ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  /**
   * Initialize the manager with an initial epoch.
   * @param {AssignmentEpoch} [initialEpoch] - Optional initial epoch.
   *   If not provided, creates an initial epoch (epoch 0) with empty assignments.
   */
  initialize(initialEpoch = null) {
    if (initialEpoch) {
      if (!(initialEpoch instanceof AssignmentEpoch)) {
        throw new Error(LOCAL_STR_INITIALEPOCH_MUST_BE_AN_ASSIGNMENTEPOCH);
      }
      this._currentEpoch = initialEpoch;
    } else {
      this._currentEpoch = AssignmentEpoch.createInitial(
        this._timestampProvider(),
        this._nodeId,
      );
    }
  }

  /**
   * Check if the manager has been initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    return this._currentEpoch !== null;
  }

  /**
   * Get the current epoch.
   * @return {AssignmentEpoch} The current epoch.
   * @throws {Error} If manager is not initialized.
   */
  getCurrentEpoch() {
    if (!this._currentEpoch) {
      throw new Error(LOCAL_STR_ASSIGNMENTEPOCHMANAGER_NOT_INITIALIZED);
    }
    return this._currentEpoch;
  }

  /**
   * Get assignments for a specific partition.
   * @param {string} partitionId - The partition ID.
   * @return {string[]|undefined} Array of node IDs or undefined if not found.
   * @throws {Error} If manager is not initialized.
   */
  getPartitionAssignments(partitionId) {
    return this.getCurrentEpoch().getPartitionAssignments(partitionId);
  }

  /**
   * Get all partitions assigned to a specific node.
   * @param {string} nodeId - The node ID.
   * @return {string[]} Array of partition IDs assigned to this node.
   * @throws {Error} If manager is not initialized.
   */
  getNodeAssignments(nodeId) {
    return this.getCurrentEpoch().getNodeAssignments(nodeId);
  }

  /**
   * Propose a new epoch with updated assignments (CAS).
   *
   * This is the **only** mechanism for creating a new epoch
   * locally. The caller must persist the resulting epoch to
   * `config.current_epoch` so that CDC propagates it cluster-wide.
   *
   * Uses compare-and-swap: only succeeds if current epoch matches
   * expected.
   *
   * @param {number} expectedEpoch - The epoch number we expect to
   *   be current.
   * @param {Object} newAssignments - The new partition assignments.
   * @return {{success: boolean, epoch?: AssignmentEpoch,
   *   error?: string}} Result object with success status and
   *   either the new epoch or error message.
   */
  proposeEpoch(expectedEpoch, newAssignments) {
    if (!this._currentEpoch) {
      return {
        success: false,
        error: LOCAL_STR_ASSIGNMENTEPOCHMANAGER_NOT_INITIALIZED,
      };
    }

    // Validate expectedEpoch type
    if (typeof expectedEpoch !== LOCAL_STR_NUMBER || !Number.isInteger(expectedEpoch)) {
      return {
        success: false,
        error: LOCAL_STR_EXPECTEDEPOCH_MUST_BE_AN_INTEGER,
      };
    }

    // Compare-and-swap: check if current epoch matches expected
    const currentEpochNumber = this._currentEpoch.epoch;
    if (currentEpochNumber !== expectedEpoch) {
      return {
        success: false,
        error: `Epoch mismatch: expected ${expectedEpoch}, ` +
               `but current epoch is ${currentEpochNumber}`,
        currentEpoch: currentEpochNumber,
      };
    }

    // Create new epoch with incremented epoch number
    try {
      const newEpoch = AssignmentEpoch.createNext(
        this._currentEpoch,
        newAssignments,
        this._timestampProvider(),
        this._nodeId,
      );

      // Atomically update current epoch
      this._currentEpoch = newEpoch;

      // Emit epoch change event
      this.emit(LOCAL_STR_EPOCHCHANGE, {
        previousEpoch: expectedEpoch,
        newEpoch: newEpoch.epoch,
        proposedBy: this._nodeId,
        timestamp: newEpoch.timestamp,
      });

      return {
        success: true,
        epoch: newEpoch,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Propose a new epoch with retry logic and exponential backoff.
   * Handles CAS failures by fetching the latest epoch and retrying.
   *
   * @param {Object} newAssignments - The new partition assignments.
   * @param {Object} [options] - Retry configuration options.
   * @param {number} [options.maxRetries=3] - Maximum number of retry attempts.
   * @param {number} [options.initialDelayMs=100] - Initial delay in milliseconds.
   * @param {number} [options.maxDelayMs=5000] - Maximum delay in milliseconds.
   * @param {number} [options.backoffMultiplier=2] - Multiplier for exponential backoff.
   * @return {Promise<{success: boolean, epoch?: AssignmentEpoch, error?: string,
   *   attempts: number}>} Result object with success status, epoch or error,
   *   and number of attempts made.
   */
  async proposeEpochWithRetry(newAssignments, options = {}) {
    const config = {
      maxRetries: options.maxRetries ?? DEFAULT_RETRY_CONFIG.maxRetries,
      initialDelayMs: options.initialDelayMs ?? DEFAULT_RETRY_CONFIG.initialDelayMs,
      maxDelayMs: options.maxDelayMs ?? DEFAULT_RETRY_CONFIG.maxDelayMs,
      backoffMultiplier: options.backoffMultiplier ??
        DEFAULT_RETRY_CONFIG.backoffMultiplier,
    };

    let attempts = 0;
    let currentDelay = config.initialDelayMs;

    while (attempts <= config.maxRetries) {
      attempts++;

      // Get current epoch for CAS
      let expectedEpoch;
      try {
        expectedEpoch = this.getCurrentEpoch().epoch;
      } catch (error) {
        return {
          success: false,
          error: error.message,
          attempts,
        };
      }

      // Attempt to propose
      const result = this.proposeEpoch(expectedEpoch, newAssignments);

      if (result.success) {
        return {
          success: true,
          epoch: result.epoch,
          attempts,
        };
      }

      // Check if we've exhausted retries
      if (attempts > config.maxRetries) {
        return {
          success: false,
          error: result.error,
          attempts,
        };
      }

      // Emit retry event
      this.emit(LOCAL_STR_PROPOSALRETRY, {
        attempt: attempts,
        maxRetries: config.maxRetries,
        expectedEpoch,
        currentEpoch: result.currentEpoch,
        error: result.error,
        nextDelayMs: currentDelay,
      });

      // Wait with exponential backoff
      await this._delayFn(currentDelay);

      // Calculate next delay with cap
      currentDelay = Math.min(
        currentDelay * config.backoffMultiplier,
        config.maxDelayMs,
      );
    }

    // Should not reach here, but return failure just in case
    return {
      success: false,
      error: LOCAL_STR_MAX_RETRIES_EXCEEDED,
      attempts,
    };
  }

  /**
   * Apply an epoch received via CDC — the sole propagation path.
   *
   * CDC events from `config.current_epoch` are the **only**
   * mechanism by which remote epoch proposals reach this manager.
   * CDCEventHandler parses the event and calls this method.
   *
   * Only applies if the incoming epoch is newer than current.
   *
   * @param {AssignmentEpoch} epoch - The epoch to apply.
   * @return {boolean} True if applied (newer than current), false
   *   otherwise.
   */
  applyEpoch(epoch) {
    if (!(epoch instanceof AssignmentEpoch)) {
      return false;
    }

    // If not initialized, accept any valid epoch
    if (!this._currentEpoch) {
      this._currentEpoch = epoch;
      this.emit(LOCAL_STR_EPOCHAPPLIED, {
        epoch: epoch.epoch,
        source: LOCAL_STR_CDC,
        timestamp: epoch.timestamp,
      });
      return true;
    }

    // Only apply if incoming epoch is strictly newer
    if (epoch.epoch <= this._currentEpoch.epoch) {
      return false;
    }

    const previousEpoch = this._currentEpoch.epoch;
    this._currentEpoch = epoch;

    // Emit epoch applied event
    this.emit(LOCAL_STR_EPOCHAPPLIED, {
      previousEpoch,
      epoch: epoch.epoch,
      source: LOCAL_STR_CDC,
      timestamp: epoch.timestamp,
    });

    return true;
  }
}

export {
  AssignmentEpochManager,
  EpochMismatchError,
  StaleEpochError,
  DEFAULT_RETRY_CONFIG,
};
