/**
 * Contact Seed Phase - First phase of joining node bootstrap.
 *
 * Contacts the seed node via HTTP to get bootstrap response containing:
 * - System table snapshots for cache hydration
 * - Message group assignment strategy
 * - Seed node connection information
 *
 * Requirements: 2.6, 2.7, 2.8
 */

import {EventEmitter} from 'events';
import {LoggingService} from '../../logging/logging-service.js';
import {assertCritical} from '../../utils/assert.js';
import {NUM, STRING, TYPEOF} from '../../constants/index.js';
import {BOOTSTRAP_SUBSYSTEM, BOOTSTRAP_PIPELINE_ERROR_CODE} from '../bootstrap-constants.js';
import {
  JOINING_DEFAULT,
  JOINING_ERROR_MSG,
  JOINING_ERROR_NAME,
  JOINING_HTTP,
  JOINING_LOG_MSG,
} from '../node-joining-constants.js';

/**
 * Phase constants for contact seed setup.
 */
const CONTACT_SEED_PHASE = Object.freeze({
  NAME: 'contact_seed',
  EVENT_START: 'contact_seed:start',
  EVENT_COMPLETE: 'contact_seed:complete',
  EVENT_FAILED: 'contact_seed:failed',
});

/**
 * ContactSeedPhase handles the first phase of joining node bootstrap.
 * Contacts the seed node via HTTP to get bootstrap response.
 */
class ContactSeedPhase extends EventEmitter {
  /**
   * Create contact seed phase.
   * @param {Object} options - Configuration options.
   * @param {string} options.nodeId - Node ID (REQUIRED).
   * @param {string} options.nodeAddress - Node address (REQUIRED).
   * @param {string} options.seedNodeAddress - Seed node HTTP address (REQUIRED).
   * @param {string} options.seedNodeWsAddress - Seed node WebSocket address (optional).
   * @param {Object} options.config - Configuration options.
   * @param {Function} options.httpPost - Optional HTTP POST implementation override.
   */
  constructor(options = {}) {
    super();

    this.nodeId = assertCritical(
      options.nodeId,
      'nodeId is required for ContactSeedPhase',
    );
    this.nodeAddress = assertCritical(
      options.nodeAddress,
      'nodeAddress is required for ContactSeedPhase',
    );
    this.seedNodeAddress = assertCritical(
      options.seedNodeAddress,
      'seedNodeAddress is required for ContactSeedPhase',
    );
    this.seedNodeWsAddress = options.seedNodeWsAddress || null;
    this.config = {...JOINING_DEFAULT, ...options.config};

    // Allow tests to bypass real network I/O
    this.httpPostImpl = typeof options.httpPost === TYPEOF.FUNCTION ?
      options.httpPost :
      this.httpPost.bind(this);

    // Result data
    this.bootstrapResponse = null;
    this.seedNodeId = null;

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(BOOTSTRAP_SUBSYSTEM.NODE_JOINING) : console;
  }

  /**
   * Execute the contact seed phase.
   * @return {Promise<Object>} Phase result with bootstrap response.
   */
  async execute() {
    const startTime = Date.now();

    this.emit(CONTACT_SEED_PHASE.EVENT_START, {
      nodeId: this.nodeId,
      seedNodeAddress: this.seedNodeAddress,
    });

    try {
      const bootstrapUrl = `${this.seedNodeAddress}${JOINING_HTTP.BOOTSTRAP_PATH}`;

      this.logger.debug(JOINING_LOG_MSG.SEED_CONTACTING, {
        nodeId: this.nodeId,
        bootstrapUrl,
      });

      const response = await this.httpPostImpl(bootstrapUrl, {
        nodeId: this.nodeId,
        nodeAddress: this.nodeAddress,
      });

      if (!response.success) {
        throw new Error(this.buildBootstrapFailureError(response));
      }

      this.bootstrapResponse = response;
      this.seedNodeId = response.seedNodeId || null;

      // Use seed node WebSocket address from response if not provided
      if (!this.seedNodeWsAddress && response.seedNodeWsAddress) {
        this.seedNodeWsAddress = response.seedNodeWsAddress;
      }

      this.logger.debug(JOINING_LOG_MSG.BOOTSTRAP_RESPONSE_RECEIVED, {
        nodeId: this.nodeId,
        seedNodeId: response.seedNodeId,
        strategy: response.messageGroupAssignment?.strategy,
      });

      const duration = Date.now() - startTime;

      const result = {
        phaseName: CONTACT_SEED_PHASE.NAME,
        duration,
        services: {},
        metadata: {
          bootstrapResponse: this.bootstrapResponse,
          seedNodeId: this.seedNodeId,
          seedNodeWsAddress: this.seedNodeWsAddress,
          messageGroupAssignment: response.messageGroupAssignment,
        },
      };

      this.emit(CONTACT_SEED_PHASE.EVENT_COMPLETE, result);

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      // Handle specific bootstrap error codes
      const parsedError = this.parseBootstrapError(error);
      if (parsedError) {
        if (parsedError.code === BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE) {
          const detailedError = new Error(
            JOINING_ERROR_MSG.leaderMetadataIncomplete(
              this.formatLeaderMetadataDetails(parsedError),
            ),
          );
          this.emitFailure(duration, detailedError);
          throw detailedError;
        }

        if (parsedError.code === BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY) {
          const detailedError = new Error(
            JOINING_ERROR_MSG.bootstrapNotReady(parsedError.phase),
          );
          this.emitFailure(duration, detailedError);
          throw detailedError;
        }
      }

      this.logger.error(JOINING_LOG_MSG.SEED_CONTACT_FAILED, {
        nodeId: this.nodeId,
        seedNodeAddress: this.seedNodeAddress,
        error: error.message,
      });

      this.emitFailure(duration, error);
      throw error;
    }
  }

  /**
   * Emit failure event.
   * @param {number} duration - Phase duration in ms.
   * @param {Error} error - The error that occurred.
   * @private
   */
  emitFailure(duration, error) {
    this.emit(CONTACT_SEED_PHASE.EVENT_FAILED, {
      phaseName: CONTACT_SEED_PHASE.NAME,
      duration,
      error: error.message,
    });
  }

  /**
   * Clean up resources on failure.
   * @return {Promise<void>}
   */
  async cleanup() {
    // No resources to clean up in this phase
    this.bootstrapResponse = null;
    this.seedNodeId = null;
  }

  /**
   * Make an HTTP POST request.
   * @param {string} url - URL to post to.
   * @param {Object} body - Request body.
   * @return {Promise<Object>} Response body.
   * @private
   */
  async httpPost(url, body) {
    const controller = new globalThis.AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.config.httpTimeoutMs,
    );

    try {
      const response = await fetch(url, {
        method: JOINING_HTTP.METHOD_POST,
        headers: {
          [JOINING_HTTP.HEADER_CONTENT_TYPE]: JOINING_HTTP.CONTENT_TYPE_JSON,
          [JOINING_HTTP.HEADER_CONNECTION]: JOINING_HTTP.CONNECTION_CLOSE,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(JOINING_ERROR_MSG.httpStatus(response.status, errorBody));
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === JOINING_ERROR_NAME.ABORT) {
        throw new Error(JOINING_ERROR_MSG.httpTimeout(this.config.httpTimeoutMs));
      }

      throw error;
    }
  }

  /**
   * Parse bootstrap HTTP error bodies.
   * @param {Error} error - The error to parse.
   * @return {Object|null} Parsed error object or null.
   * @private
   */
  parseBootstrapError(error) {
    if (!error || typeof error.message !== TYPEOF.STRING) {
      return null;
    }

    const match = error.message.match(/^HTTP \d+:\s*(.*)$/s);
    if (!match) {
      return null;
    }

    try {
      return JSON.parse(match[NUM.ONE]);
    } catch (_parseError) {
      return null;
    }
  }

  /**
   * Build a consistent error message for bootstrap failures.
   * @param {Object} response - The bootstrap response.
   * @return {string} Error message.
   * @private
   */
  buildBootstrapFailureError(response) {
    if (response?.code === BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE) {
      return JOINING_ERROR_MSG.leaderMetadataIncomplete(
        this.formatLeaderMetadataDetails(response),
      );
    }

    if (response?.code === BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY) {
      return JOINING_ERROR_MSG.bootstrapNotReady(response.phase);
    }

    return response?.error || JOINING_ERROR_MSG.BOOTSTRAP_REQUEST_FAILED;
  }

  /**
   * Format leader metadata details for error reporting.
   * @param {Object} details - Error details object.
   * @return {string} Formatted details string.
   * @private
   */
  formatLeaderMetadataDetails(details) {
    const parts = [];

    if (Array.isArray(details.missingPartitionLeaders) &&
        details.missingPartitionLeaders.length > NUM.ZERO) {
      parts.push(`missingPartitionLeaders=${details.missingPartitionLeaders.join(',')}`);
    }
    if (Array.isArray(details.missingMessageGroupLeaders) &&
        details.missingMessageGroupLeaders.length > NUM.ZERO) {
      parts.push(
        `missingMessageGroupLeaders=${details.missingMessageGroupLeaders.join(',')}`,
      );
    }
    if (Array.isArray(details.missingPartitionLeaderNodes) &&
        details.missingPartitionLeaderNodes.length > NUM.ZERO) {
      parts.push(
        `missingPartitionLeaderNodes=${details.missingPartitionLeaderNodes.join(',')}`,
      );
    }
    if (Array.isArray(details.missingMessageGroupLeaderNodes) &&
        details.missingMessageGroupLeaderNodes.length > NUM.ZERO) {
      parts.push(
        `missingMessageGroupLeaderNodes=${details.missingMessageGroupLeaderNodes.join(',')}`,
      );
    }

    return parts.length > NUM.ZERO ? parts.join(' ') : STRING.UNKNOWN;
  }

  /**
   * Get the bootstrap response.
   * @return {Object|null} Bootstrap response or null.
   */
  getBootstrapResponse() {
    return this.bootstrapResponse;
  }

  /**
   * Get the seed node ID.
   * @return {string|null} Seed node ID or null.
   */
  getSeedNodeId() {
    return this.seedNodeId;
  }

  /**
   * Get the seed node WebSocket address.
   * @return {string|null} Seed node WebSocket address or null.
   */
  getSeedNodeWsAddress() {
    return this.seedNodeWsAddress;
  }
}

export {ContactSeedPhase, CONTACT_SEED_PHASE};
