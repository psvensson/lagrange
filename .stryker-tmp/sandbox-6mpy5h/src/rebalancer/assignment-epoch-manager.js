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
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { EventEmitter } from 'events';
import { AssignmentEpoch } from './assignment-epoch.js';

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
    if (stryMutAct_9fa48("129664")) {
      {}
    } else {
      stryCov_9fa48("129664");
      super(stryMutAct_9fa48("129665") ? `` : (stryCov_9fa48("129665"), `Epoch mismatch: expected ${expectedEpoch}, but current epoch is ${actualEpoch}`));
      this.name = stryMutAct_9fa48("129666") ? "" : (stryCov_9fa48("129666"), 'EpochMismatchError');
      this.expectedEpoch = expectedEpoch;
      this.actualEpoch = actualEpoch;
    }
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
    if (stryMutAct_9fa48("129667")) {
      {}
    } else {
      stryCov_9fa48("129667");
      super((stryMutAct_9fa48("129668") ? `` : (stryCov_9fa48("129668"), `Stale epoch: incoming epoch ${incomingEpoch} is not newer than `)) + (stryMutAct_9fa48("129669") ? `` : (stryCov_9fa48("129669"), `current epoch ${currentEpoch}`)));
      this.name = stryMutAct_9fa48("129670") ? "" : (stryCov_9fa48("129670"), 'StaleEpochError');
      this.incomingEpoch = incomingEpoch;
      this.currentEpoch = currentEpoch;
    }
  }
}

/**
 * Default retry configuration for proposeEpochWithRetry.
 */
const DEFAULT_RETRY_CONFIG = stryMutAct_9fa48("129671") ? {} : (stryCov_9fa48("129671"), {
  maxRetries: 3,
  initialDelayMs: 100,
  maxDelayMs: 5000,
  backoffMultiplier: 2
});

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
    if (stryMutAct_9fa48("129672")) {
      {}
    } else {
      stryCov_9fa48("129672");
      super();
      if (stryMutAct_9fa48("129675") ? !options.nodeId && typeof options.nodeId !== 'string' : stryMutAct_9fa48("129674") ? false : stryMutAct_9fa48("129673") ? true : (stryCov_9fa48("129673", "129674", "129675"), (stryMutAct_9fa48("129676") ? options.nodeId : (stryCov_9fa48("129676"), !options.nodeId)) || (stryMutAct_9fa48("129678") ? typeof options.nodeId === 'string' : stryMutAct_9fa48("129677") ? false : (stryCov_9fa48("129677", "129678"), typeof options.nodeId !== (stryMutAct_9fa48("129679") ? "" : (stryCov_9fa48("129679"), 'string')))))) {
        if (stryMutAct_9fa48("129680")) {
          {}
        } else {
          stryCov_9fa48("129680");
          throw new Error(stryMutAct_9fa48("129681") ? "" : (stryCov_9fa48("129681"), 'nodeId is required and must be a non-empty string'));
        }
      }
      this._nodeId = options.nodeId;
      this._timestampProvider = stryMutAct_9fa48("129684") ? options.timestampProvider && (() => Date.now().toString()) : stryMutAct_9fa48("129683") ? false : stryMutAct_9fa48("129682") ? true : (stryCov_9fa48("129682", "129683", "129684"), options.timestampProvider || (stryMutAct_9fa48("129685") ? () => undefined : (stryCov_9fa48("129685"), () => Date.now().toString())));
      this._currentEpoch = null;
      this._delayFn = stryMutAct_9fa48("129688") ? options.delayFn && (ms => new Promise(r => setTimeout(r, ms))) : stryMutAct_9fa48("129687") ? false : stryMutAct_9fa48("129686") ? true : (stryCov_9fa48("129686", "129687", "129688"), options.delayFn || (stryMutAct_9fa48("129689") ? () => undefined : (stryCov_9fa48("129689"), ms => new Promise(stryMutAct_9fa48("129690") ? () => undefined : (stryCov_9fa48("129690"), r => setTimeout(r, ms))))));
    }
  }

  /**
   * Initialize the manager with an initial epoch.
   * @param {AssignmentEpoch} [initialEpoch] - Optional initial epoch.
   *   If not provided, creates an initial epoch (epoch 0) with empty assignments.
   */
  initialize(initialEpoch = null) {
    if (stryMutAct_9fa48("129691")) {
      {}
    } else {
      stryCov_9fa48("129691");
      if (stryMutAct_9fa48("129693") ? false : stryMutAct_9fa48("129692") ? true : (stryCov_9fa48("129692", "129693"), initialEpoch)) {
        if (stryMutAct_9fa48("129694")) {
          {}
        } else {
          stryCov_9fa48("129694");
          if (stryMutAct_9fa48("129697") ? false : stryMutAct_9fa48("129696") ? true : stryMutAct_9fa48("129695") ? initialEpoch instanceof AssignmentEpoch : (stryCov_9fa48("129695", "129696", "129697"), !(initialEpoch instanceof AssignmentEpoch))) {
            if (stryMutAct_9fa48("129698")) {
              {}
            } else {
              stryCov_9fa48("129698");
              throw new Error(stryMutAct_9fa48("129699") ? "" : (stryCov_9fa48("129699"), 'initialEpoch must be an AssignmentEpoch instance'));
            }
          }
          this._currentEpoch = initialEpoch;
        }
      } else {
        if (stryMutAct_9fa48("129700")) {
          {}
        } else {
          stryCov_9fa48("129700");
          this._currentEpoch = AssignmentEpoch.createInitial(this._timestampProvider(), this._nodeId);
        }
      }
    }
  }

  /**
   * Check if the manager has been initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    if (stryMutAct_9fa48("129701")) {
      {}
    } else {
      stryCov_9fa48("129701");
      return stryMutAct_9fa48("129704") ? this._currentEpoch === null : stryMutAct_9fa48("129703") ? false : stryMutAct_9fa48("129702") ? true : (stryCov_9fa48("129702", "129703", "129704"), this._currentEpoch !== null);
    }
  }

  /**
   * Get the current epoch.
   * @return {AssignmentEpoch} The current epoch.
   * @throws {Error} If manager is not initialized.
   */
  getCurrentEpoch() {
    if (stryMutAct_9fa48("129705")) {
      {}
    } else {
      stryCov_9fa48("129705");
      if (stryMutAct_9fa48("129708") ? false : stryMutAct_9fa48("129707") ? true : stryMutAct_9fa48("129706") ? this._currentEpoch : (stryCov_9fa48("129706", "129707", "129708"), !this._currentEpoch)) {
        if (stryMutAct_9fa48("129709")) {
          {}
        } else {
          stryCov_9fa48("129709");
          throw new Error(stryMutAct_9fa48("129710") ? "" : (stryCov_9fa48("129710"), 'AssignmentEpochManager not initialized'));
        }
      }
      return this._currentEpoch;
    }
  }

  /**
   * Get assignments for a specific partition.
   * @param {string} partitionId - The partition ID.
   * @return {string[]|undefined} Array of node IDs or undefined if not found.
   * @throws {Error} If manager is not initialized.
   */
  getPartitionAssignments(partitionId) {
    if (stryMutAct_9fa48("129711")) {
      {}
    } else {
      stryCov_9fa48("129711");
      return this.getCurrentEpoch().getPartitionAssignments(partitionId);
    }
  }

  /**
   * Get all partitions assigned to a specific node.
   * @param {string} nodeId - The node ID.
   * @return {string[]} Array of partition IDs assigned to this node.
   * @throws {Error} If manager is not initialized.
   */
  getNodeAssignments(nodeId) {
    if (stryMutAct_9fa48("129712")) {
      {}
    } else {
      stryCov_9fa48("129712");
      return this.getCurrentEpoch().getNodeAssignments(nodeId);
    }
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
    if (stryMutAct_9fa48("129713")) {
      {}
    } else {
      stryCov_9fa48("129713");
      if (stryMutAct_9fa48("129716") ? false : stryMutAct_9fa48("129715") ? true : stryMutAct_9fa48("129714") ? this._currentEpoch : (stryCov_9fa48("129714", "129715", "129716"), !this._currentEpoch)) {
        if (stryMutAct_9fa48("129717")) {
          {}
        } else {
          stryCov_9fa48("129717");
          return stryMutAct_9fa48("129718") ? {} : (stryCov_9fa48("129718"), {
            success: stryMutAct_9fa48("129719") ? true : (stryCov_9fa48("129719"), false),
            error: stryMutAct_9fa48("129720") ? "" : (stryCov_9fa48("129720"), 'AssignmentEpochManager not initialized')
          });
        }
      }

      // Validate expectedEpoch type
      if (stryMutAct_9fa48("129723") ? typeof expectedEpoch !== 'number' && !Number.isInteger(expectedEpoch) : stryMutAct_9fa48("129722") ? false : stryMutAct_9fa48("129721") ? true : (stryCov_9fa48("129721", "129722", "129723"), (stryMutAct_9fa48("129725") ? typeof expectedEpoch === 'number' : stryMutAct_9fa48("129724") ? false : (stryCov_9fa48("129724", "129725"), typeof expectedEpoch !== (stryMutAct_9fa48("129726") ? "" : (stryCov_9fa48("129726"), 'number')))) || (stryMutAct_9fa48("129727") ? Number.isInteger(expectedEpoch) : (stryCov_9fa48("129727"), !Number.isInteger(expectedEpoch))))) {
        if (stryMutAct_9fa48("129728")) {
          {}
        } else {
          stryCov_9fa48("129728");
          return stryMutAct_9fa48("129729") ? {} : (stryCov_9fa48("129729"), {
            success: stryMutAct_9fa48("129730") ? true : (stryCov_9fa48("129730"), false),
            error: stryMutAct_9fa48("129731") ? "" : (stryCov_9fa48("129731"), 'expectedEpoch must be an integer')
          });
        }
      }

      // Compare-and-swap: check if current epoch matches expected
      const currentEpochNumber = this._currentEpoch.epoch;
      if (stryMutAct_9fa48("129734") ? currentEpochNumber === expectedEpoch : stryMutAct_9fa48("129733") ? false : stryMutAct_9fa48("129732") ? true : (stryCov_9fa48("129732", "129733", "129734"), currentEpochNumber !== expectedEpoch)) {
        if (stryMutAct_9fa48("129735")) {
          {}
        } else {
          stryCov_9fa48("129735");
          return stryMutAct_9fa48("129736") ? {} : (stryCov_9fa48("129736"), {
            success: stryMutAct_9fa48("129737") ? true : (stryCov_9fa48("129737"), false),
            error: (stryMutAct_9fa48("129738") ? `` : (stryCov_9fa48("129738"), `Epoch mismatch: expected ${expectedEpoch}, `)) + (stryMutAct_9fa48("129739") ? `` : (stryCov_9fa48("129739"), `but current epoch is ${currentEpochNumber}`)),
            currentEpoch: currentEpochNumber
          });
        }
      }

      // Create new epoch with incremented epoch number
      try {
        if (stryMutAct_9fa48("129740")) {
          {}
        } else {
          stryCov_9fa48("129740");
          const newEpoch = AssignmentEpoch.createNext(this._currentEpoch, newAssignments, this._timestampProvider(), this._nodeId);

          // Atomically update current epoch
          this._currentEpoch = newEpoch;

          // Emit epoch change event
          this.emit(stryMutAct_9fa48("129741") ? "" : (stryCov_9fa48("129741"), 'epochChange'), stryMutAct_9fa48("129742") ? {} : (stryCov_9fa48("129742"), {
            previousEpoch: expectedEpoch,
            newEpoch: newEpoch.epoch,
            proposedBy: this._nodeId,
            timestamp: newEpoch.timestamp
          }));
          return stryMutAct_9fa48("129743") ? {} : (stryCov_9fa48("129743"), {
            success: stryMutAct_9fa48("129744") ? false : (stryCov_9fa48("129744"), true),
            epoch: newEpoch
          });
        }
      } catch (error) {
        if (stryMutAct_9fa48("129745")) {
          {}
        } else {
          stryCov_9fa48("129745");
          return stryMutAct_9fa48("129746") ? {} : (stryCov_9fa48("129746"), {
            success: stryMutAct_9fa48("129747") ? true : (stryCov_9fa48("129747"), false),
            error: error.message
          });
        }
      }
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
    if (stryMutAct_9fa48("129748")) {
      {}
    } else {
      stryCov_9fa48("129748");
      const config = stryMutAct_9fa48("129749") ? {} : (stryCov_9fa48("129749"), {
        maxRetries: stryMutAct_9fa48("129750") ? options.maxRetries && DEFAULT_RETRY_CONFIG.maxRetries : (stryCov_9fa48("129750"), options.maxRetries ?? DEFAULT_RETRY_CONFIG.maxRetries),
        initialDelayMs: stryMutAct_9fa48("129751") ? options.initialDelayMs && DEFAULT_RETRY_CONFIG.initialDelayMs : (stryCov_9fa48("129751"), options.initialDelayMs ?? DEFAULT_RETRY_CONFIG.initialDelayMs),
        maxDelayMs: stryMutAct_9fa48("129752") ? options.maxDelayMs && DEFAULT_RETRY_CONFIG.maxDelayMs : (stryCov_9fa48("129752"), options.maxDelayMs ?? DEFAULT_RETRY_CONFIG.maxDelayMs),
        backoffMultiplier: stryMutAct_9fa48("129753") ? options.backoffMultiplier && DEFAULT_RETRY_CONFIG.backoffMultiplier : (stryCov_9fa48("129753"), options.backoffMultiplier ?? DEFAULT_RETRY_CONFIG.backoffMultiplier)
      });
      let attempts = 0;
      let currentDelay = config.initialDelayMs;
      while (stryMutAct_9fa48("129756") ? attempts > config.maxRetries : stryMutAct_9fa48("129755") ? attempts < config.maxRetries : stryMutAct_9fa48("129754") ? false : (stryCov_9fa48("129754", "129755", "129756"), attempts <= config.maxRetries)) {
        if (stryMutAct_9fa48("129757")) {
          {}
        } else {
          stryCov_9fa48("129757");
          stryMutAct_9fa48("129758") ? attempts-- : (stryCov_9fa48("129758"), attempts++);

          // Get current epoch for CAS
          let expectedEpoch;
          try {
            if (stryMutAct_9fa48("129759")) {
              {}
            } else {
              stryCov_9fa48("129759");
              expectedEpoch = this.getCurrentEpoch().epoch;
            }
          } catch (error) {
            if (stryMutAct_9fa48("129760")) {
              {}
            } else {
              stryCov_9fa48("129760");
              return stryMutAct_9fa48("129761") ? {} : (stryCov_9fa48("129761"), {
                success: stryMutAct_9fa48("129762") ? true : (stryCov_9fa48("129762"), false),
                error: error.message,
                attempts
              });
            }
          }

          // Attempt to propose
          const result = this.proposeEpoch(expectedEpoch, newAssignments);
          if (stryMutAct_9fa48("129764") ? false : stryMutAct_9fa48("129763") ? true : (stryCov_9fa48("129763", "129764"), result.success)) {
            if (stryMutAct_9fa48("129765")) {
              {}
            } else {
              stryCov_9fa48("129765");
              return stryMutAct_9fa48("129766") ? {} : (stryCov_9fa48("129766"), {
                success: stryMutAct_9fa48("129767") ? false : (stryCov_9fa48("129767"), true),
                epoch: result.epoch,
                attempts
              });
            }
          }

          // Check if we've exhausted retries
          if (stryMutAct_9fa48("129771") ? attempts <= config.maxRetries : stryMutAct_9fa48("129770") ? attempts >= config.maxRetries : stryMutAct_9fa48("129769") ? false : stryMutAct_9fa48("129768") ? true : (stryCov_9fa48("129768", "129769", "129770", "129771"), attempts > config.maxRetries)) {
            if (stryMutAct_9fa48("129772")) {
              {}
            } else {
              stryCov_9fa48("129772");
              return stryMutAct_9fa48("129773") ? {} : (stryCov_9fa48("129773"), {
                success: stryMutAct_9fa48("129774") ? true : (stryCov_9fa48("129774"), false),
                error: result.error,
                attempts
              });
            }
          }

          // Emit retry event
          this.emit(stryMutAct_9fa48("129775") ? "" : (stryCov_9fa48("129775"), 'proposalRetry'), stryMutAct_9fa48("129776") ? {} : (stryCov_9fa48("129776"), {
            attempt: attempts,
            maxRetries: config.maxRetries,
            expectedEpoch,
            currentEpoch: result.currentEpoch,
            error: result.error,
            nextDelayMs: currentDelay
          }));

          // Wait with exponential backoff
          await this._delayFn(currentDelay);

          // Calculate next delay with cap
          currentDelay = stryMutAct_9fa48("129777") ? Math.max(currentDelay * config.backoffMultiplier, config.maxDelayMs) : (stryCov_9fa48("129777"), Math.min(stryMutAct_9fa48("129778") ? currentDelay / config.backoffMultiplier : (stryCov_9fa48("129778"), currentDelay * config.backoffMultiplier), config.maxDelayMs));
        }
      }

      // Should not reach here, but return failure just in case
      return stryMutAct_9fa48("129779") ? {} : (stryCov_9fa48("129779"), {
        success: stryMutAct_9fa48("129780") ? true : (stryCov_9fa48("129780"), false),
        error: stryMutAct_9fa48("129781") ? "" : (stryCov_9fa48("129781"), 'Max retries exceeded'),
        attempts
      });
    }
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
    if (stryMutAct_9fa48("129782")) {
      {}
    } else {
      stryCov_9fa48("129782");
      if (stryMutAct_9fa48("129785") ? false : stryMutAct_9fa48("129784") ? true : stryMutAct_9fa48("129783") ? epoch instanceof AssignmentEpoch : (stryCov_9fa48("129783", "129784", "129785"), !(epoch instanceof AssignmentEpoch))) {
        if (stryMutAct_9fa48("129786")) {
          {}
        } else {
          stryCov_9fa48("129786");
          return stryMutAct_9fa48("129787") ? true : (stryCov_9fa48("129787"), false);
        }
      }

      // If not initialized, accept any valid epoch
      if (stryMutAct_9fa48("129790") ? false : stryMutAct_9fa48("129789") ? true : stryMutAct_9fa48("129788") ? this._currentEpoch : (stryCov_9fa48("129788", "129789", "129790"), !this._currentEpoch)) {
        if (stryMutAct_9fa48("129791")) {
          {}
        } else {
          stryCov_9fa48("129791");
          this._currentEpoch = epoch;
          this.emit(stryMutAct_9fa48("129792") ? "" : (stryCov_9fa48("129792"), 'epochApplied'), stryMutAct_9fa48("129793") ? {} : (stryCov_9fa48("129793"), {
            epoch: epoch.epoch,
            source: stryMutAct_9fa48("129794") ? "" : (stryCov_9fa48("129794"), 'cdc'),
            timestamp: epoch.timestamp
          }));
          return stryMutAct_9fa48("129795") ? false : (stryCov_9fa48("129795"), true);
        }
      }

      // Only apply if incoming epoch is strictly newer
      if (stryMutAct_9fa48("129799") ? epoch.epoch > this._currentEpoch.epoch : stryMutAct_9fa48("129798") ? epoch.epoch < this._currentEpoch.epoch : stryMutAct_9fa48("129797") ? false : stryMutAct_9fa48("129796") ? true : (stryCov_9fa48("129796", "129797", "129798", "129799"), epoch.epoch <= this._currentEpoch.epoch)) {
        if (stryMutAct_9fa48("129800")) {
          {}
        } else {
          stryCov_9fa48("129800");
          return stryMutAct_9fa48("129801") ? true : (stryCov_9fa48("129801"), false);
        }
      }
      const previousEpoch = this._currentEpoch.epoch;
      this._currentEpoch = epoch;

      // Emit epoch applied event
      this.emit(stryMutAct_9fa48("129802") ? "" : (stryCov_9fa48("129802"), 'epochApplied'), stryMutAct_9fa48("129803") ? {} : (stryCov_9fa48("129803"), {
        previousEpoch,
        epoch: epoch.epoch,
        source: stryMutAct_9fa48("129804") ? "" : (stryCov_9fa48("129804"), 'cdc'),
        timestamp: epoch.timestamp
      }));
      return stryMutAct_9fa48("129805") ? false : (stryCov_9fa48("129805"), true);
    }
  }
}
export { AssignmentEpochManager, EpochMismatchError, StaleEpochError, DEFAULT_RETRY_CONFIG };