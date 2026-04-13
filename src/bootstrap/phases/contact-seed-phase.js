/**
 * Contact Seed Phase — handles the initial HTTP contact with the seed node
 * during the join process, including retry logic and error classification.
 *
 * Extracted from NodeJoiningService to keep the orchestrator thin.
 * The class receives required dependencies via constructor injection.
 */

import {assertCritical} from '../../utils/assert.js';
import {
  BOOTSTRAP_PIPELINE_ERROR_CODE,
} from '../bootstrap-constants.js';
import {
  JOINING_DEFAULT,
  JOINING_ERROR_MSG,
  JOINING_HTTP,
  JOINING_LOG_MSG,
} from '../node-joining-constants.js';
import {
  HTTP_STATUS,
  NUM,
  STRING,
  TYPEOF,
} from '../../constants/index.js';

const SEED_READINESS_TIMEOUT_MSG = (ms) =>
  `seed readiness timeout after ${ms}ms`;
const HTTP_ERROR_MESSAGE_PATTERN = /^HTTP (\d+):\s*(.*)$/s;

/**
 * Handles the contact-seed phase of the join process.
 */
class ContactSeedPhase {
  /**
   * @param {Object} options
   * @param {string} options.nodeId - This node's ID.
   * @param {Object} options.delegates - Callbacks into the joining
   *   service for accessing mutable state.
   */
  constructor(options = {}) {
    this.nodeId = options.nodeId;
    this.delegates = options.delegates || {};
  }

  /**
   * Contact the seed node via HTTP to get bootstrap response.
   * Retries with exponential backoff on transient failures.
   * @return {Promise<void>}
   */
  async phaseContactSeed() {
    const seedNodeAddress = this.delegates.getSeedNodeAddress();
    if (!seedNodeAddress) {
      throw new Error(JOINING_ERROR_MSG.SEED_NODE_ADDRESS_REQUIRED);
    }
    const nodeAddress = this.delegates.getNodeAddress();
    assertCritical(nodeAddress, JOINING_ERROR_MSG.NODE_ADDRESS_REQUIRED);
    const startupMode = this.delegates.getJoinStartupMode?.();

    const bootstrapUrl =
      `${seedNodeAddress}${JOINING_HTTP.BOOTSTRAP_PATH}`;
    const logger = this.delegates.getLogger();

    logger.debug(JOINING_LOG_MSG.SEED_CONTACTING, {
      nodeId: this.nodeId,
      bootstrapUrl,
    });

    const retryPolicy = this.resolveJoinRetryPolicy();
    const retryTimeoutMs = retryPolicy.retryTimeoutMs;
    let delayMs = retryPolicy.initialDelayMs;
    const maxDelayMs = retryPolicy.maxDelayMs;
    const backoffMultiplier = retryPolicy.backoffMultiplier;
    const now = this.delegates.getNow();
    const startTime = now();
    let attempt = 0;
    let lastBootstrapError = null;
    let lastRetryableSeedContactError = null;
    let lastRetryAfterMs = null;
    const config = this.delegates.getConfig();
    const retryableTimeoutErrorMessage = JOINING_ERROR_MSG.httpTimeout(
      config.httpTimeoutMs,
    );
    const buildRetryableSeedContactError = (message, options = {}) => {
      const retryableError = new Error(message);
      retryableError.deferRetry = true;
      if (Number.isFinite(options.retryAfterMs) &&
          options.retryAfterMs > NUM.ZERO) {
        retryableError.retryAfterMs = Math.floor(options.retryAfterMs);
      }
      if (options.parsedError) {
        retryableError.bootstrapResponse = options.parsedError;
      }
      if (typeof options.code === TYPEOF.STRING &&
          options.code.length > NUM.ZERO) {
        retryableError.code = options.code;
      }
      return retryableError;
    };

    while (now() - startTime < retryTimeoutMs) {
      attempt += 1;
      try {
        const httpPostImpl = this.delegates.getHttpPostImpl();
        const bootstrapRequest = {
          nodeId: this.nodeId,
          nodeAddress,
        };
        if (typeof startupMode === TYPEOF.STRING &&
            startupMode.length > NUM.ZERO) {
          bootstrapRequest.startupMode = startupMode;
        }
        const response = await httpPostImpl(bootstrapUrl, bootstrapRequest);

        if (!response.success) {
          const bootstrapError = new Error(
            this.buildBootstrapFailureError(response),
          );
          bootstrapError.bootstrapResponse = response;
          throw bootstrapError;
        }

        this.delegates.setBootstrapResponse(response);
        this.delegates.setSeedNodeId(response.seedNodeId || null);
        if (!this.delegates.getSeedNodeWsAddress() &&
            response.seedNodeWsAddress) {
          this.delegates.setSeedNodeWsAddress(
            response.seedNodeWsAddress,
          );
        }

        logger.debug(JOINING_LOG_MSG.BOOTSTRAP_RESPONSE_RECEIVED, {
          nodeId: this.nodeId,
          seedNodeId: response.seedNodeId,
          strategy: response.messageGroupAssignment?.strategy,
        });
        return;
      } catch (error) {
        const classification = this.classifySeedContactFailure(
          error,
          retryableTimeoutErrorMessage,
        );
        const parsedError = classification.parsedError;
        const elapsedMs = now() - startTime;
        if (classification.retryable && elapsedMs < retryTimeoutMs) {
          if (classification.retryableCode) {
            lastBootstrapError = parsedError;
          }
          if (classification.retryableTimeout) {
            lastRetryableSeedContactError = error.message;
          }
          const nextDelayMs = this.computeSeedContactRetryDelayMs({
            baseDelayMs: delayMs,
            maxDelayMs,
            retryAfterMs: classification.retryAfterMs,
          });
          lastRetryAfterMs = nextDelayMs;
          logger.debug(JOINING_LOG_MSG.SEED_CONTACT_RETRYING, {
            nodeId: this.nodeId,
            bootstrapUrl,
            attempt,
            elapsedMs,
            lastCode: classification.code,
            lastStatusCode: classification.statusCode,
            retryAfterMs: classification.retryAfterMs,
            nextDelayMs,
            retryTimeoutMs,
          });
          const sleep = this.delegates.getSleep();
          await sleep(nextDelayMs);
          delayMs = Math.min(
            Math.floor(delayMs * backoffMultiplier),
            maxDelayMs,
          );
          continue;
        }

        if (classification.retryable) {
          if (parsedError?.code ===
              BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE) {
            throw buildRetryableSeedContactError(
              JOINING_ERROR_MSG.leaderMetadataIncomplete(
                formatLeaderMetadataDetails(parsedError),
              ),
              {
                retryAfterMs: lastRetryAfterMs,
                parsedError,
                code: classification.code,
              },
            );
          }

          if (parsedError?.code ===
              BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY) {
            throw buildRetryableSeedContactError(
              JOINING_ERROR_MSG.bootstrapNotReady(parsedError.phase),
              {
                retryAfterMs: lastRetryAfterMs,
                parsedError,
                code: classification.code,
              },
            );
          }

          throw buildRetryableSeedContactError(
            JOINING_ERROR_MSG.contactSeedFailed(error.message),
            {
              retryAfterMs: lastRetryAfterMs,
              parsedError,
            },
          );
        }

        if (classification.terminalValidationOrConflict) {
          logger.warn(JOINING_LOG_MSG.SEED_CONTACT_TERMINAL, {
            nodeId: this.nodeId,
            bootstrapUrl,
            attempt,
            elapsedMs,
            statusCode: classification.statusCode,
            code: classification.code,
            error: error.message,
          });
        }

        if (parsedError) {
          if (parsedError.code ===
              BOOTSTRAP_PIPELINE_ERROR_CODE
                .LEADER_METADATA_INCOMPLETE) {
            throw new Error(
              JOINING_ERROR_MSG.leaderMetadataIncomplete(
                formatLeaderMetadataDetails(parsedError),
              ),
            );
          }

          if (parsedError.code ===
              BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY) {
            throw new Error(
              JOINING_ERROR_MSG.bootstrapNotReady(parsedError.phase),
            );
          }
        }

        logger.error(JOINING_LOG_MSG.SEED_CONTACT_FAILED, {
          nodeId: this.nodeId,
          bootstrapUrl,
          error: error.message,
        });
        throw new Error(
          JOINING_ERROR_MSG.contactSeedFailed(error.message),
        );
      }
    }

    if (lastBootstrapError?.code ===
        BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE) {
      throw buildRetryableSeedContactError(
        JOINING_ERROR_MSG.leaderMetadataIncomplete(
          formatLeaderMetadataDetails(lastBootstrapError),
        ),
        {
          retryAfterMs: lastRetryAfterMs,
          parsedError: lastBootstrapError,
          code: lastBootstrapError.code,
        },
      );
    }

    if (lastBootstrapError?.code ===
        BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY) {
      throw buildRetryableSeedContactError(
        JOINING_ERROR_MSG.bootstrapNotReady(lastBootstrapError.phase),
        {
          retryAfterMs: lastRetryAfterMs,
          parsedError: lastBootstrapError,
          code: lastBootstrapError.code,
        },
      );
    }

    if (lastRetryableSeedContactError) {
      throw buildRetryableSeedContactError(
        JOINING_ERROR_MSG.contactSeedFailed(
          lastRetryableSeedContactError,
        ),
        {
          retryAfterMs: lastRetryAfterMs,
        },
      );
    }

    throw new Error(JOINING_ERROR_MSG.contactSeedFailed(
      SEED_READINESS_TIMEOUT_MSG(retryTimeoutMs),
    ));
  }

  /**
   * Resolve bounded retry policy for join-time HTTP operations.
   * @return {Object}
   */
  resolveJoinRetryPolicy() {
    const config = this.delegates.getConfig();
    const retryTimeoutMs =
      Number.isFinite(config.leadershipWaitTimeoutMs) ?
        Math.max(
          config.leadershipWaitTimeoutMs,
          config.httpTimeoutMs,
        ) :
        config.httpTimeoutMs;
    const initialDelayMs =
      Number.isFinite(config.leadershipWaitInitialDelayMs) ?
        Math.max(NUM.TEN, config.leadershipWaitInitialDelayMs) :
        NUM.HUNDRED;
    const maxDelayMs =
      Number.isFinite(config.leadershipWaitMaxDelayMs) ?
        Math.max(initialDelayMs, config.leadershipWaitMaxDelayMs) :
        initialDelayMs;
    const backoffMultiplier =
      Number.isFinite(config.leadershipWaitBackoffMultiplier) &&
      config.leadershipWaitBackoffMultiplier > NUM.ONE ?
        config.leadershipWaitBackoffMultiplier :
        NUM.TWO;
    return {
      retryTimeoutMs,
      initialDelayMs,
      maxDelayMs,
      backoffMultiplier,
    };
  }

  /**
   * Classify one seed contact failure for retry/backoff behavior.
   * @param {Error} error
   * @param {string} retryableTimeoutErrorMessage
   * @return {Object}
   */
  classifySeedContactFailure(error, retryableTimeoutErrorMessage) {
    const parsedError = error.bootstrapResponse ||
      parseBootstrapError(error);
    const statusCode = Number.isFinite(error?.statusCode) ?
      Math.floor(error.statusCode) :
      (Number.isFinite(parsedError?.statusCode) ?
        Math.floor(parsedError.statusCode) :
        null);
    const code = typeof parsedError?.code === TYPEOF.STRING ?
      parsedError.code :
      null;
    const retryableCode =
      code === BOOTSTRAP_PIPELINE_ERROR_CODE
        .LEADER_METADATA_INCOMPLETE ||
      code === BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY ||
      code === BOOTSTRAP_PIPELINE_ERROR_CODE
        .SERVICE_REGISTRATION_CACHE_VISIBILITY_TIMEOUT;
    const retryableTimeout =
      error?.message === retryableTimeoutErrorMessage;
    const retryableStatus =
      statusCode === HTTP_STATUS.SERVICE_UNAVAILABLE;
    const terminalValidationOrConflict =
      statusCode === HTTP_STATUS.BAD_REQUEST ||
      statusCode === HTTP_STATUS.CONFLICT;

    return {
      parsedError,
      statusCode,
      code,
      retryAfterMs: resolveSeedContactRetryAfterMs(
        error,
        parsedError,
      ),
      retryableCode,
      retryableTimeout,
      retryableStatus,
      retryable: retryableCode || retryableTimeout || retryableStatus,
      terminalValidationOrConflict,
    };
  }

  /**
   * Compute retry delay using bootstrap hints + bounded jitter.
   * @param {Object} options
   * @param {number} options.baseDelayMs
   * @param {number} options.maxDelayMs
   * @param {number|null} options.retryAfterMs
   * @return {number}
   */
  computeSeedContactRetryDelayMs(options = {}) {
    const baseDelayMs = Math.max(
      NUM.ONE,
      Number(options.baseDelayMs) || NUM.ZERO,
    );
    const maxDelayMs = Math.max(
      baseDelayMs,
      Number(options.maxDelayMs) || baseDelayMs,
    );
    const retryAfterMs = Number.isFinite(options.retryAfterMs) ?
      Math.max(NUM.ZERO, Math.floor(options.retryAfterMs)) :
      null;
    const candidateDelayMs = retryAfterMs === null ?
      baseDelayMs :
      Math.min(maxDelayMs, Math.max(baseDelayMs, retryAfterMs));
    const jitteredDelayMs = this.applySeedContactRetryJitter(
      candidateDelayMs,
      maxDelayMs,
    );
    if (retryAfterMs === null) {
      return jitteredDelayMs;
    }
    return Math.max(retryAfterMs, jitteredDelayMs);
  }

  /**
   * Apply bounded symmetric jitter to one retry delay.
   * @param {number} delayMs
   * @param {number} maxDelayMs
   * @return {number}
   */
  applySeedContactRetryJitter(delayMs, maxDelayMs) {
    const config = this.delegates.getConfig();
    const random = this.delegates.getRandom();
    const jitterRatio =
      Number.isFinite(config.leadershipWaitJitterRatio) ?
        config.leadershipWaitJitterRatio :
        JOINING_DEFAULT.leadershipWaitJitterRatio;
    if (jitterRatio <= NUM.ZERO) {
      return Math.min(
        maxDelayMs,
        Math.max(NUM.ONE, Math.floor(delayMs)),
      );
    }

    const jitterRangeMs = delayMs * jitterRatio;
    const centeredRandom = (random() * NUM.TWO) - NUM.ONE;
    const jitterOffsetMs = Math.round(centeredRandom * jitterRangeMs);
    return Math.min(
      maxDelayMs,
      Math.max(NUM.ONE, Math.floor(delayMs + jitterOffsetMs)),
    );
  }

  /**
   * Build a consistent error message for bootstrap failures.
   * @param {Object} response
   * @return {string}
   */
  buildBootstrapFailureError(response) {
    if (response?.code ===
        BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE) {
      return JOINING_ERROR_MSG.leaderMetadataIncomplete(
        formatLeaderMetadataDetails(response),
      );
    }

    if (response?.code ===
        BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY) {
      return JOINING_ERROR_MSG.bootstrapNotReady(response.phase);
    }

    return response?.error ||
      JOINING_ERROR_MSG.BOOTSTRAP_REQUEST_FAILED;
  }
}

/**
 * Resolve retry hint (ms) from parsed body and transport metadata.
 * Pure function — no instance state needed.
 * @param {Error} error
 * @param {Object|null} parsedError
 * @return {number|null}
 */
function resolveSeedContactRetryAfterMs(error, parsedError) {
  const hintCandidates = [
    error?.retryAfterMs,
    parsedError?.retryAfterMs,
    parsedError?.retry_after_ms,
  ];
  for (const hint of hintCandidates) {
    if (!Number.isFinite(hint)) {
      continue;
    }
    return Math.max(NUM.ZERO, Math.floor(hint));
  }
  return null;
}

/**
 * Parse bootstrap HTTP error bodies from the default HTTP client.
 * Pure function — no instance state needed.
 * @param {Error} error
 * @return {Object|null}
 */
function parseBootstrapError(error) {
  if (!error) {
    return null;
  }

  if (error.responseJson &&
      typeof error.responseJson === TYPEOF.OBJECT) {
    const parsedFromJson = {...error.responseJson};
    if (Number.isFinite(error.statusCode) &&
        !Number.isFinite(parsedFromJson.statusCode)) {
      parsedFromJson.statusCode = Math.floor(error.statusCode);
    }
    if (Number.isFinite(error.retryAfterMs) &&
        !Number.isFinite(parsedFromJson.retryAfterMs)) {
      parsedFromJson.retryAfterMs = Math.floor(error.retryAfterMs);
    }
    return parsedFromJson;
  }

  if (typeof error.message !== TYPEOF.STRING) {
    return null;
  }

  const match = error.message.match(HTTP_ERROR_MESSAGE_PATTERN);
  if (!match) {
    return null;
  }

  const statusCode = Number.parseInt(match[1], 10);
  try {
    const parsed = JSON.parse(match[2]);
    if (Number.isFinite(statusCode) &&
        !Number.isFinite(parsed.statusCode)) {
      parsed.statusCode = statusCode;
    }
    return parsed;
  } catch (_parseError) {
    if (!Number.isFinite(statusCode)) {
      return null;
    }
    return {statusCode};
  }
}

/**
 * Format leader metadata details for error reporting.
 * Pure function — no instance state needed.
 * @param {Object} details
 * @return {string}
 */
function formatLeaderMetadataDetails(details) {
  const parts = [];
  if (Array.isArray(details.missingPartitionLeaders) &&
      details.missingPartitionLeaders.length > NUM.ZERO) {
    parts.push('missingPartitionLeaders=' +
      details.missingPartitionLeaders.join(','));
  }
  if (Array.isArray(details.missingMessageGroupLeaders) &&
      details.missingMessageGroupLeaders.length > NUM.ZERO) {
    parts.push('missingMessageGroupLeaders=' +
      details.missingMessageGroupLeaders.join(','));
  }
  if (Array.isArray(details.missingPartitionLeaderNodes) &&
      details.missingPartitionLeaderNodes.length > NUM.ZERO) {
    parts.push('missingPartitionLeaderNodes=' +
      details.missingPartitionLeaderNodes.join(','));
  }
  if (Array.isArray(details.missingMessageGroupLeaderNodes) &&
      details.missingMessageGroupLeaderNodes.length > NUM.ZERO) {
    parts.push('missingMessageGroupLeaderNodes=' +
      details.missingMessageGroupLeaderNodes.join(','));
  }

  return parts.length > NUM.ZERO ? parts.join(' ') : STRING.UNKNOWN;
}

export {
  ContactSeedPhase,
  parseBootstrapError,
  formatLeaderMetadataDetails,
  resolveSeedContactRetryAfterMs,
};
