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
  JOINING_PHASE,
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
  JOINING_SEED_CONTACT_OUTCOME,
} from '../node-joining-constants.js';
import {
  HTTP_STATUS,
  NUM,
} from '../../constants/index.js';
import {
  MAX_RETRYABLE_SEED_CONTACT_EVIDENCE_RETRIES,
  RETRYABLE_SEED_CONTACT_EVIDENCE_SOURCE,
  RETRYABLE_SEED_CONTACT_FAILURE_ACTION,
  formatLeaderMetadataDetails,
  isRetryableSeedContactCode,
  isRetryableSeedContactTransportFailure,
  normalizeRetryableSeedContactEvidence,
  parseBootstrapError,
  resolveBootstrapNotReadySeedContactFailureKind,
  resolveSeedContactRequestTimeoutMs,
  resolveSeedContactRetryAfterMs,
} from './contact-seed-failure-signals.js';
import {
  SeedContactFailureOwner,
} from './seed-contact-failure-owner.js';
import {
  SEED_CONTACT_SESSION_ABSENT,
  hasUntriedInitialSweepCandidate,
  resolveSeedContactCandidateAttemptTimeoutMs,
  resolveSeedContactCandidateFailureAction,
} from './seed-contact-candidate-policy.js';

function extractSeedContactStartupAuthority(value) {
  const startupAuthority =
    value?.[BOOTSTRAP_API_RESPONSE_FIELD.STARTUP_AUTHORITY] || null;
  return startupAuthority && typeof startupAuthority === 'object' ?
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
    this.seedContactDiagnostics = Object.freeze({
      phase: JOINING_PHASE.CONTACTING_SEED,
      candidateSet: Object.freeze([]),
      currentCandidate: null,
      attempt: 0,
      lastOutcome: JOINING_SEED_CONTACT_OUTCOME.IDLE,
      remainingBudgetMs: null,
      authoritySource: null,
    });
    this.failureOwner = new SeedContactFailureOwner({
      nodeId: this.nodeId,
      updateDiagnostics: (diagnostics) =>
        this.updateSeedContactDiagnostics(diagnostics),
      getDiagnostics: () => this.getSeedContactDiagnosticsSnapshot(),
      remainingBudgetMs: (context) =>
        this.remainingSeedContactBudgetMs(context),
      buildRetryableErrorOptions: (errorOptions) =>
        this.buildRetryableSeedContactErrorOptions(errorOptions),
    });
  }

  /**
   * Contact the seed node via HTTP to get bootstrap response.
   * Retries with exponential backoff on transient failures.
   * @return {Promise<void>}
   */
  async phaseContactSeed() {
    const seedContactCandidates = this.resolveSeedContactCandidates();
    if (seedContactCandidates.length === 0) {
      throw new Error(JOINING_ERROR_MSG.SEED_NODE_ADDRESS_REQUIRED);
    }
    const nodeAddress = this.delegates.getNodeAddress();
    assertCritical(nodeAddress, JOINING_ERROR_MSG.NODE_ADDRESS_REQUIRED);
    const startupMode = this.delegates.getJoinStartupMode?.();

    const bootstrapUrl =
      this.buildSeedContactBootstrapUrl(seedContactCandidates[0]);
    const logger = this.delegates.getLogger();

    logger.debug(JOINING_LOG_MSG.SEED_CONTACTING, {
      nodeId: this.nodeId,
      bootstrapUrl,
    });

    const context = this.createSeedContactContext({
      seedContactCandidates,
      nodeAddress,
      startupMode,
      logger,
    });
    this.updateSeedContactDiagnostics({
      candidateSet: seedContactCandidates,
      currentCandidate: seedContactCandidates[0],
      attempt: 0,
      lastOutcome: JOINING_SEED_CONTACT_OUTCOME.IDLE,
      remainingBudgetMs: context.retryTimeoutMs,
      authoritySource: null,
    });

    while (this.hasSeedContactBudget(context)) {
      const attempt = this.beginSeedContactAttempt(context);
      try {
        await this.executeSeedContactAttempt(context, attempt);
        return;
      } catch (error) {
        const failure = this.recordSeedContactFailure(
          context,
          attempt,
          error,
        );
        if (this.shouldRetrySeedContactFailure(failure)) {
          await this.retrySeedContactFailure(context, attempt, failure);
          continue;
        }
        this.failureOwner.throwFailure(context, attempt, failure);
      }
    }

    this.failureOwner.throwBudgetExhaustion(context);
  }

  createSeedContactContext(options) {
    const retryPolicy = this.resolveJoinRetryPolicy();
    const now = this.delegates.getNow();
    const lastBootstrapError =
      normalizeRetryableSeedContactEvidence(
        this.delegates.getLastRetryableSeedContactEvidence?.(),
      );
    const config = this.delegates.getConfig();
    return {
      ...options,
      config,
      retryTimeoutMs: retryPolicy.retryTimeoutMs,
      delayMs: retryPolicy.initialDelayMs,
      maxDelayMs: retryPolicy.maxDelayMs,
      backoffMultiplier: retryPolicy.backoffMultiplier,
      now,
      startTime: now(),
      attempt: 0,
      lastBootstrapError,
      lastBootstrapErrorSource: lastBootstrapError === null ?
        RETRYABLE_SEED_CONTACT_EVIDENCE_SOURCE.NONE :
        RETRYABLE_SEED_CONTACT_EVIDENCE_SOURCE.RETAINED,
      lastRetryableSeedContactError: SEED_CONTACT_SESSION_ABSENT,
      lastAttemptFailure: SEED_CONTACT_SESSION_ABSENT,
      lastRetryAfterMs:
        resolveSeedContactRetryAfterMs(null, lastBootstrapError),
      evidenceWindow: {
        budget: 0,
        grants: 0,
      },
      lastAttemptRequestTimeoutMs: resolveSeedContactRequestTimeoutMs({
        configuredHttpTimeoutMs: config.httpTimeoutMs,
      }),
    };
  }

  hasSeedContactBudget(context) {
    return context.now() - context.startTime < context.retryTimeoutMs;
  }

  remainingSeedContactBudgetMs(context) {
    return Math.max(
      0,
      context.retryTimeoutMs - (context.now() - context.startTime),
    );
  }

  beginSeedContactAttempt(context) {
    context.attempt += 1;
    const currentCandidate = context.seedContactCandidates[
      (context.attempt - 1) % context.seedContactCandidates.length
    ];
    const startedAtMs = context.now();
    const requestTimeoutMs =
      resolveSeedContactCandidateAttemptTimeoutMs({
        attempt: context.attempt,
        candidateCount: context.seedContactCandidates.length,
        configuredHttpTimeoutMs: context.config.httpTimeoutMs,
        remainingRetryBudgetMs:
          context.retryTimeoutMs - (startedAtMs - context.startTime),
        retryableSeedContactEvidence: context.lastBootstrapError,
      });
    context.lastAttemptRequestTimeoutMs = requestTimeoutMs;
    this.updateSeedContactDiagnostics({
      currentCandidate,
      attempt: context.attempt,
      lastOutcome: JOINING_SEED_CONTACT_OUTCOME.ATTEMPTING,
      remainingBudgetMs: this.remainingSeedContactBudgetMs(context),
    });
    return {
      currentCandidate,
      bootstrapUrl: this.buildSeedContactBootstrapUrl(currentCandidate),
      startedAtMs,
      requestTimeoutMs,
    };
  }

  buildSeedContactRequest(context, attempt) {
    const bootstrapRequest = {
      nodeId: this.nodeId,
      nodeAddress: context.nodeAddress,
      [BOOTSTRAP_API_REQUEST_FIELD.CLIENT_ATTEMPT_DEADLINE_MS]:
        attempt.startedAtMs + attempt.requestTimeoutMs,
    };
    const expectedClusterId =
      this.delegates.getExpectedClusterId?.();
    if (typeof expectedClusterId === 'string' &&
        expectedClusterId.length > 0) {
      bootstrapRequest.expectedClusterId = expectedClusterId;
    }
    if (typeof context.startupMode === 'string' &&
        context.startupMode.length > 0) {
      bootstrapRequest.startupMode = context.startupMode;
    }
    const membershipOwnerOutcome =
      this.delegates.getMembershipOwnerOutcome?.();
    if (membershipOwnerOutcome &&
        typeof membershipOwnerOutcome === 'object') {
      bootstrapRequest.membershipOwnerOutcome = membershipOwnerOutcome;
    }
    return bootstrapRequest;
  }

  async executeSeedContactAttempt(context, attempt) {
    const response = await this.delegates.getHttpPostImpl()(
      attempt.bootstrapUrl,
      this.buildSeedContactRequest(context, attempt),
      {timeoutMs: attempt.requestTimeoutMs},
    );
    this.recordSeedContactStartupAuthority(
      response,
      attempt.currentCandidate,
    );
    this.delegates.setLastRetryableSeedContactEvidence?.(null);
    if (!response.success) {
      const bootstrapError = new Error(
        this.buildBootstrapFailureError(response),
      );
      bootstrapError.bootstrapResponse = response;
      throw bootstrapError;
    }
    this.delegates.setBootstrapResponse(response);
    this.delegates.setSeedNodeAddress?.(attempt.currentCandidate);
    this.delegates.setSeedNodeId(response.seedNodeId || null);
    if (!this.delegates.getSeedNodeWsAddress() &&
        response.seedNodeWsAddress) {
      this.delegates.setSeedNodeWsAddress(response.seedNodeWsAddress);
    }
    this.updateSeedContactDiagnostics({
      lastOutcome: JOINING_SEED_CONTACT_OUTCOME.CONTACT_SUCCEEDED,
      remainingBudgetMs: this.remainingSeedContactBudgetMs(context),
    });
    context.logger.debug(JOINING_LOG_MSG.BOOTSTRAP_RESPONSE_RECEIVED, {
      nodeId: this.nodeId,
      seedNodeId: response.seedNodeId,
      strategy: response.messageGroupAssignment?.strategy,
    });
  }

  recordSeedContactStartupAuthority(value, currentCandidate) {
    const startupAuthority = extractSeedContactStartupAuthority(value);
    if (!startupAuthority) {
      return;
    }
    this.delegates.setSeedContactStartupAuthority?.(startupAuthority);
    this.updateSeedContactDiagnostics({
      authoritySource: currentCandidate,
    });
  }

  recordSeedContactFailure(context, attempt, error) {
    const classification = this.classifySeedContactFailure(
      error,
      JOINING_ERROR_MSG.httpTimeout(context.lastAttemptRequestTimeoutMs),
    );
    const parsedError = classification.parsedError;
    context.lastAttemptFailure = {
      classification,
      errorMessage: error.message,
      parsedError,
    };
    this.updateSeedContactDiagnostics({
      lastOutcome: this.resolveSeedContactAttemptOutcome(classification),
      remainingBudgetMs: this.remainingSeedContactBudgetMs(context),
    });
    this.recordSeedContactStartupAuthority(
      parsedError,
      attempt.currentCandidate,
    );
    this.recordRetryableSeedContactEvidence(context, parsedError);
    const elapsedMs = context.now() - context.startTime;
    const action = resolveSeedContactCandidateFailureAction({
      classification,
      elapsedMs,
      retryTimeoutMs: context.retryTimeoutMs,
      attempt: context.attempt,
      candidateCount: context.seedContactCandidates.length,
      hasRetryableSeedContactEvidence:
        context.lastBootstrapError !== null,
      retryableSeedContactEvidenceRetryBudget:
        context.evidenceWindow.budget,
      retryableSeedContactEvidenceSource:
        context.lastBootstrapErrorSource,
    });
    this.clearRetainedSeedContactEvidenceWhenRequested(context, action);
    return {
      action,
      classification,
      elapsedMs,
      error,
      parsedError,
    };
  }

  recordRetryableSeedContactEvidence(context, parsedError) {
    const evidence = normalizeRetryableSeedContactEvidence(parsedError);
    if (!evidence) {
      return;
    }
    context.lastBootstrapError = evidence;
    context.lastBootstrapErrorSource =
      RETRYABLE_SEED_CONTACT_EVIDENCE_SOURCE.FRESH;
    this.delegates.setLastRetryableSeedContactEvidence?.(evidence);
    if (context.evidenceWindow.grants < 1) {
      context.evidenceWindow.budget =
        MAX_RETRYABLE_SEED_CONTACT_EVIDENCE_RETRIES;
      context.evidenceWindow.grants += 1;
    }
  }

  clearRetainedSeedContactEvidenceWhenRequested(context, action) {
    if (action !== RETRYABLE_SEED_CONTACT_FAILURE_ACTION
      .CLEAR_RETAINED_EVIDENCE_AND_RETRY) {
      return;
    }
    context.lastBootstrapError = null;
    context.lastBootstrapErrorSource =
      RETRYABLE_SEED_CONTACT_EVIDENCE_SOURCE.NONE;
    this.delegates.setLastRetryableSeedContactEvidence?.(null);
  }

  shouldRetrySeedContactFailure(failure) {
    return failure.action ===
        RETRYABLE_SEED_CONTACT_FAILURE_ACTION.RETRY ||
      failure.action === RETRYABLE_SEED_CONTACT_FAILURE_ACTION
        .CLEAR_RETAINED_EVIDENCE_AND_RETRY;
  }

  async retrySeedContactFailure(context, attempt, failure) {
    if (failure.classification.retryableTimeout ||
        failure.classification.retryableTransportFailure) {
      context.lastRetryableSeedContactError = failure.error.message;
    }
    const nextDelayMs = this.computeSeedContactRetryDelayMs({
      baseDelayMs: context.delayMs,
      maxDelayMs: context.maxDelayMs,
      retryAfterMs: failure.classification.retryAfterMs,
    });
    const delayBeforeRetry =
      hasUntriedInitialSweepCandidate({
        attempt: context.attempt,
        candidateCount: context.seedContactCandidates.length,
      }) !== true;
    context.lastRetryAfterMs = nextDelayMs;
    context.logger.debug(JOINING_LOG_MSG.SEED_CONTACT_RETRYING, {
      nodeId: this.nodeId,
      bootstrapUrl: attempt.bootstrapUrl,
      attempt: context.attempt,
      elapsedMs: failure.elapsedMs,
      lastCode: failure.classification.code,
      lastStatusCode: failure.classification.statusCode,
      retryAfterMs: failure.classification.retryAfterMs,
      retryableTransportFailure:
        failure.classification.retryableTransportFailure,
      nextDelayMs: delayBeforeRetry ? nextDelayMs : 0,
      retryTimeoutMs: context.retryTimeoutMs,
    });
    if (!delayBeforeRetry) {
      return;
    }
    await this.delegates.getSleep()(nextDelayMs);
    if (context.lastBootstrapError !== null &&
        context.evidenceWindow.budget > 0) {
      context.evidenceWindow.budget -= 1;
    }
    context.delayMs = Math.min(
      Math.floor(context.delayMs * context.backoffMultiplier),
      context.maxDelayMs,
    );
  }

  updateSeedContactDiagnostics(options = {}) {
    const candidateSet = Array.isArray(options.candidateSet) ?
      options.candidateSet.filter((candidate) =>
        typeof candidate === 'string' && candidate.length > 0,
      ) :
      this.seedContactDiagnostics.candidateSet;
    const snapshot = Object.freeze({
      phase: JOINING_PHASE.CONTACTING_SEED,
      candidateSet: Object.freeze([...candidateSet]),
      currentCandidate:
        Object.prototype.hasOwnProperty.call(options, 'currentCandidate') ?
          options.currentCandidate :
          this.seedContactDiagnostics.currentCandidate,
      attempt: Number.isFinite(options.attempt) ?
        Math.max(0, Math.floor(options.attempt)) :
        this.seedContactDiagnostics.attempt,
      lastOutcome:
        typeof options.lastOutcome === 'string' &&
        options.lastOutcome.length > 0 ?
          options.lastOutcome :
          this.seedContactDiagnostics.lastOutcome,
      remainingBudgetMs: Number.isFinite(options.remainingBudgetMs) ?
        Math.max(0, Math.floor(options.remainingBudgetMs)) :
        this.seedContactDiagnostics.remainingBudgetMs,
      authoritySource:
        Object.prototype.hasOwnProperty.call(options, 'authoritySource') ?
          options.authoritySource :
          this.seedContactDiagnostics.authoritySource,
    });
    this.seedContactDiagnostics = snapshot;
    this.delegates.setSeedContactDiagnostics?.(snapshot);
    return snapshot;
  }

  getSeedContactDiagnosticsSnapshot() {
    return this.seedContactDiagnostics;
  }

  resolveSeedContactAttemptOutcome(classification = {}) {
    if (classification.retryableTransportFailure ||
        classification.retryableTimeout) {
      return JOINING_SEED_CONTACT_OUTCOME.RETRYABLE_TRANSPORT_FAILURE;
    }
    if (classification.retryable) {
      return JOINING_SEED_CONTACT_OUTCOME.RETRYABLE_SEED_RESPONSE;
    }
    return JOINING_SEED_CONTACT_OUTCOME.TERMINAL_FAILURE;
  }

  /**
   * Resolve the ordered seed-contact candidate list.
   *
   * Prefers the delegate-provided candidate list (selected candidate first);
   * falls back to the legacy single seed address so callers that only wire
   * `getSeedNodeAddress` keep their exact behavior.
   * @return {string[]}
   */
  resolveSeedContactCandidates() {
    const seedNodeAddresses = this.delegates.getSeedNodeAddresses?.();
    const candidates = Array.isArray(seedNodeAddresses) ?
      seedNodeAddresses.filter((seedAddress) =>
        typeof seedAddress === 'string' && seedAddress.length > 0,
      ) :
      [];
    if (candidates.length > 0) {
      return candidates;
    }
    const seedNodeAddress = this.delegates.getSeedNodeAddress();
    return typeof seedNodeAddress === 'string' && seedNodeAddress.length > 0 ?
      [seedNodeAddress] :
      [];
  }

  /**
   * Build the bootstrap-contact URL for one seed candidate address.
   * @param {string} seedNodeAddress
   * @return {string}
   */
  buildSeedContactBootstrapUrl(seedNodeAddress) {
    return `${seedNodeAddress}${JOINING_HTTP.BOOTSTRAP_PATH}`;
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
      config.leadershipWaitBackoffMultiplier > 1 ?
        config.leadershipWaitBackoffMultiplier :
        2;
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
    const code = typeof parsedError?.code === 'string' ?
      parsedError.code :
      null;
    const retryableCode = isRetryableSeedContactCode(code);
    const retryableTimeout =
      error?.message === retryableTimeoutErrorMessage;
    const retryableStatus =
      statusCode === HTTP_STATUS.SERVICE_UNAVAILABLE;
    const retryableTransportFailure =
      isRetryableSeedContactTransportFailure(error, {
        parsedError,
        statusCode,
      });
    // A 409 carrying a whitelisted retryable code (e.g. the lease-window
    // changed-address conflict) is retryable-with-backoff, not terminal: the
    // seed explicitly classified it as a wait. Only an untyped/unwhitelisted
    // 409 stays on the terminal path.
    const terminalValidationOrConflict =
      !retryableCode &&
      (statusCode === HTTP_STATUS.BAD_REQUEST ||
        statusCode === HTTP_STATUS.CONFLICT);

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
      retryableTransportFailure,
      retryable: retryableCode ||
        retryableTimeout ||
        retryableStatus ||
        retryableTransportFailure,
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
      1,
      Number(options.baseDelayMs) || 0,
    );
    const maxDelayMs = Math.max(
      baseDelayMs,
      Number(options.maxDelayMs) || baseDelayMs,
    );
    const retryAfterMs = Number.isFinite(options.retryAfterMs) ?
      Math.max(0, Math.floor(options.retryAfterMs)) :
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
    if (jitterRatio <= 0) {
      return Math.min(
        maxDelayMs,
        Math.max(1, Math.floor(delayMs)),
      );
    }

    const jitterRangeMs = delayMs * jitterRatio;
    const centeredRandom = (random() * 2) - 1;
    const jitterOffsetMs = Math.round(centeredRandom * jitterRangeMs);
    return Math.min(
      maxDelayMs,
      Math.max(1, Math.floor(delayMs + jitterOffsetMs)),
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
      typeof failureKind === 'string' &&
      failureKind.length > 0
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
