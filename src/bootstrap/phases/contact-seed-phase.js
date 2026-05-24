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
  BOOTSTRAP_API_REQUEST_FIELD,
  BOOTSTRAP_API_RESPONSE_FIELD,
} from '../bootstrap-api-constants.js';
import {
  JOINING_DEFAULT,
  JOINING_ERROR_MSG,
  JOINING_HTTP,
  JOINING_LOG_MSG,
} from '../node-joining-constants.js';
import {
  HTTP_STATUS,
  NUM,
  TYPEOF,
} from '../../constants/index.js';
import {
  MAX_RETRYABLE_SEED_CONTACT_EVIDENCE_RETRIES,
  RETRYABLE_SEED_CONTACT_EVIDENCE_SOURCE,
  RETRYABLE_SEED_CONTACT_FAILURE_ACTION,
  SEED_READINESS_TIMEOUT_MSG,
  formatLeaderMetadataDetails,
  isRetryableSeedContactCode,
  normalizeRetryableSeedContactEvidence,
  parseBootstrapError,
  resolveBootstrapNotReadySeedContactFailureKind,
  resolveRetryableSeedContactFailureAction,
  resolveSeedContactAttemptTimeoutMs,
  resolveSeedContactRequestTimeoutMs,
  resolveSeedContactRetryAfterMs,
} from './contact-seed-failure-signals.js';

function extractSeedContactStartupAuthority(value) {
  const startupAuthority =
    value?.[BOOTSTRAP_API_RESPONSE_FIELD.STARTUP_AUTHORITY] || null;
  return startupAuthority && typeof startupAuthority === TYPEOF.OBJECT ?
    startupAuthority :
    null;
}

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
    let attempt = NUM.ZERO;
    let lastBootstrapError =
      normalizeRetryableSeedContactEvidence(
        this.delegates.getLastRetryableSeedContactEvidence?.(),
      );
    let lastBootstrapErrorSource = lastBootstrapError === null ?
      RETRYABLE_SEED_CONTACT_EVIDENCE_SOURCE.NONE :
      RETRYABLE_SEED_CONTACT_EVIDENCE_SOURCE.RETAINED;
    let lastRetryableSeedContactError = null;
    let lastRetryAfterMs =
      resolveSeedContactRetryAfterMs(null, lastBootstrapError);
    const evidenceWindow = {
      budget: NUM.ZERO,
      grants: NUM.ZERO,
    };
    const config = this.delegates.getConfig();
    let lastAttemptRequestTimeoutMs = resolveSeedContactRequestTimeoutMs({
      configuredHttpTimeoutMs: config.httpTimeoutMs,
    });
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
      if (typeof options.failureKind === TYPEOF.STRING &&
          options.failureKind.length > NUM.ZERO) {
        retryableError.seedContactFailureKind = options.failureKind;
      }
      return retryableError;
    };

    while (now() - startTime < retryTimeoutMs) {
      attempt += NUM.ONE;
      try {
        const httpPostImpl = this.delegates.getHttpPostImpl();
        const attemptStartedAtMs = now();
        const elapsedAtAttemptStartMs = attemptStartedAtMs - startTime;
        const requestTimeoutMs = resolveSeedContactAttemptTimeoutMs({
          configuredHttpTimeoutMs: config.httpTimeoutMs,
          remainingRetryBudgetMs: retryTimeoutMs - elapsedAtAttemptStartMs,
          retryableSeedContactEvidence: lastBootstrapError,
        });
        lastAttemptRequestTimeoutMs = requestTimeoutMs;
        const bootstrapRequest = {
          nodeId: this.nodeId,
          nodeAddress,
          [BOOTSTRAP_API_REQUEST_FIELD.CLIENT_ATTEMPT_DEADLINE_MS]:
            attemptStartedAtMs + requestTimeoutMs,
        };
        if (typeof startupMode === TYPEOF.STRING &&
            startupMode.length > NUM.ZERO) {
          bootstrapRequest.startupMode = startupMode;
        }
        const membershipOwnerOutcome =
          this.delegates.getMembershipOwnerOutcome?.();
        if (membershipOwnerOutcome &&
            typeof membershipOwnerOutcome === TYPEOF.OBJECT) {
          bootstrapRequest.membershipOwnerOutcome = membershipOwnerOutcome;
        }
        const response = await httpPostImpl(
          bootstrapUrl,
          bootstrapRequest,
          {timeoutMs: requestTimeoutMs},
        );
        const responseStartupAuthority =
          extractSeedContactStartupAuthority(response);
        if (responseStartupAuthority) {
          this.delegates.setSeedContactStartupAuthority?.(
            responseStartupAuthority,
          );
        }
        this.delegates.setLastRetryableSeedContactEvidence?.(null);

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
        const retryableTimeoutErrorMessage = JOINING_ERROR_MSG.httpTimeout(
          lastAttemptRequestTimeoutMs,
        );
        const classification = this.classifySeedContactFailure(
          error,
          retryableTimeoutErrorMessage,
        );
        const parsedError = classification.parsedError;
        const parsedStartupAuthority =
          extractSeedContactStartupAuthority(parsedError);
        if (parsedStartupAuthority) {
          this.delegates.setSeedContactStartupAuthority?.(
            parsedStartupAuthority,
          );
        }
        const retryableSeedContactEvidence =
          normalizeRetryableSeedContactEvidence(parsedError);
        if (retryableSeedContactEvidence) {
          lastBootstrapError = retryableSeedContactEvidence;
          lastBootstrapErrorSource =
            RETRYABLE_SEED_CONTACT_EVIDENCE_SOURCE.FRESH;
          this.delegates.setLastRetryableSeedContactEvidence?.(
            retryableSeedContactEvidence,
          );
          if (evidenceWindow.grants < NUM.ONE) {
            evidenceWindow.budget =
              MAX_RETRYABLE_SEED_CONTACT_EVIDENCE_RETRIES;
            evidenceWindow.grants += NUM.ONE;
          }
        }
        const elapsedMs = now() - startTime;
        const retryableSeedContactFailureAction =
          resolveRetryableSeedContactFailureAction({
            classification,
            elapsedMs,
            retryTimeoutMs,
            hasRetryableSeedContactEvidence: lastBootstrapError !== null,
            retryableSeedContactEvidenceRetryBudget: evidenceWindow.budget,
            retryableSeedContactEvidenceSource: lastBootstrapErrorSource,
          });
        if (retryableSeedContactFailureAction ===
            RETRYABLE_SEED_CONTACT_FAILURE_ACTION
              .CLEAR_RETAINED_EVIDENCE_AND_RETRY) {
          lastBootstrapError = null;
          lastBootstrapErrorSource =
            RETRYABLE_SEED_CONTACT_EVIDENCE_SOURCE.NONE;
          this.delegates.setLastRetryableSeedContactEvidence?.(null);
        }
        if (retryableSeedContactFailureAction ===
              RETRYABLE_SEED_CONTACT_FAILURE_ACTION.RETRY ||
            retryableSeedContactFailureAction ===
              RETRYABLE_SEED_CONTACT_FAILURE_ACTION
                .CLEAR_RETAINED_EVIDENCE_AND_RETRY) {
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
          if (lastBootstrapError !== null && evidenceWindow.budget > NUM.ZERO) {
            evidenceWindow.budget -= NUM.ONE;
          }
          delayMs = Math.min(
            Math.floor(delayMs * backoffMultiplier),
            maxDelayMs,
          );
          continue;
        }

        if (retryableSeedContactFailureAction ===
            RETRYABLE_SEED_CONTACT_FAILURE_ACTION.SURFACE) {
          const surfacedRetryableSeedContactEvidence =
            parsedError || lastBootstrapError;
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
            const failureKind =
              resolveBootstrapNotReadySeedContactFailureKind(parsedError);
            throw buildRetryableSeedContactError(
              JOINING_ERROR_MSG.bootstrapNotReady(parsedError.phase),
              {
                retryAfterMs: lastRetryAfterMs,
                parsedError,
                code: classification.code,
                failureKind,
              },
            );
          }

          throw buildRetryableSeedContactError(
            JOINING_ERROR_MSG.contactSeedFailed(error.message),
            this.buildRetryableSeedContactErrorOptions({
              retryAfterMs: lastRetryAfterMs,
              parsedError: surfacedRetryableSeedContactEvidence,
              code: surfacedRetryableSeedContactEvidence?.code,
            }),
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

        const shouldPreserveRetryableSeedContactOutcome =
          classification.terminalValidationOrConflict !== true &&
          (lastBootstrapError !== null ||
            lastRetryableSeedContactError !== null);
        if (shouldPreserveRetryableSeedContactOutcome) {
          throw buildRetryableSeedContactError(
            JOINING_ERROR_MSG.contactSeedFailed(error.message),
            this.buildRetryableSeedContactErrorOptions({
              retryAfterMs: lastRetryAfterMs,
              parsedError: lastBootstrapError,
              code: lastBootstrapError?.code,
            }),
          );
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
      const failureKind =
        resolveBootstrapNotReadySeedContactFailureKind(lastBootstrapError);
      throw buildRetryableSeedContactError(
        JOINING_ERROR_MSG.bootstrapNotReady(lastBootstrapError.phase),
        {
          retryAfterMs: lastRetryAfterMs,
          parsedError: lastBootstrapError,
          code: lastBootstrapError.code,
          failureKind,
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
    const retryableCode = isRetryableSeedContactCode(code);
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

  buildRetryableSeedContactErrorOptions(options = {}) {
    const retryableErrorOptions = {
      ...options,
    };
    const failureKind =
      resolveBootstrapNotReadySeedContactFailureKind(options.parsedError);
    if (
      typeof failureKind === TYPEOF.STRING &&
      failureKind.length > NUM.ZERO
    ) {
      retryableErrorOptions.failureKind = failureKind;
    }
    return retryableErrorOptions;
  }
}

export {
  ContactSeedPhase,
  parseBootstrapError,
  formatLeaderMetadataDetails,
  resolveSeedContactRetryAfterMs,
};
