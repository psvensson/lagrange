/**
 * Seed Contact Failure Owner — owns terminal retry, pressure, and retained
 * evidence outcomes after the contact phase classifies one failed attempt.
 */

import {
  BOOTSTRAP_PIPELINE_ERROR_CODE,
} from '../bootstrap-constants.js';
import {
  JOINING_ERROR_MSG,
  JOINING_LOG_MSG,
  JOINING_SEED_CONTACT_FAILURE_KIND,
  JOINING_SEED_CONTACT_OUTCOME,
} from '../node-joining-constants.js';
import {
  RETRYABLE_SEED_CONTACT_FAILURE_ACTION,
  SEED_READINESS_TIMEOUT_MSG,
  formatLeaderMetadataDetails,
  isSeedContactPressureEvidence,
  resolveBootstrapNotReadySeedContactFailureKind,
} from './contact-seed-failure-signals.js';
import {
  SEED_CONTACT_SESSION_ABSENT,
} from './seed-contact-candidate-policy.js';

class SeedContactFailureOwner {
  constructor(options = {}) {
    this.nodeId = options.nodeId;
    this.updateDiagnostics = options.updateDiagnostics;
    this.getDiagnostics = options.getDiagnostics;
    this.remainingBudgetMs = options.remainingBudgetMs;
    this.buildRetryableErrorOptions =
      options.buildRetryableErrorOptions;
  }

  throwFailure(context, attempt, failure) {
    if (failure.action === RETRYABLE_SEED_CONTACT_FAILURE_ACTION.SURFACE) {
      this.throwSurfacedFailure(context, failure);
    }
    this.throwTerminalFailure(context, attempt, failure);
  }

  throwSurfacedFailure(context, failure) {
    const message = JOINING_ERROR_MSG.contactSeedFailed(
      failure.error.message,
    );
    const evidence =
      failure.parsedError || context.lastBootstrapError;
    if (this.isUnavailableFailure(failure)) {
      throw this.buildUnavailableError(context, message, evidence);
    }
    if (isSeedContactPressureEvidence(evidence)) {
      throw this.buildPressureError(context, message, evidence);
    }
    if (evidence?.code ===
        BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE) {
      throw this.buildRetryableError(
        JOINING_ERROR_MSG.leaderMetadataIncomplete(
          formatLeaderMetadataDetails(evidence),
        ),
        {
          retryAfterMs: context.lastRetryAfterMs,
          parsedError: evidence,
          code: evidence.code,
        },
      );
    }
    if (evidence?.code ===
        BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY) {
      throw this.buildBootstrapNotReadyError(context, evidence);
    }
    throw this.buildRetryableError(
      message,
      this.buildRetryableErrorOptions({
        retryAfterMs: context.lastRetryAfterMs,
        parsedError: evidence,
        code: evidence?.code,
      }),
    );
  }

  isUnavailableFailure(failure) {
    return failure.classification.retryableTimeout ||
      failure.classification.retryableTransportFailure ||
      (
        !failure.parsedError &&
        failure.classification.retryableStatus
      );
  }

  throwTerminalFailure(context, attempt, failure) {
    const classification = failure.classification;
    if (classification.terminalValidationOrConflict) {
      this.updateDiagnostics({
        lastOutcome: JOINING_SEED_CONTACT_OUTCOME.TERMINAL_FAILURE,
      });
      context.logger.warn(JOINING_LOG_MSG.SEED_CONTACT_TERMINAL, {
        nodeId: this.nodeId,
        bootstrapUrl: attempt.bootstrapUrl,
        attempt: context.attempt,
        elapsedMs: failure.elapsedMs,
        statusCode: classification.statusCode,
        code: classification.code,
        error: failure.error.message,
      });
    }
    if (this.shouldPreserveRetryableOutcome(context, failure)) {
      this.throwPreservedRetryableOutcome(context, failure);
    }
    this.throwParsedOrGenericFailure(context, attempt, failure);
  }

  shouldPreserveRetryableOutcome(context, failure) {
    return failure.classification.terminalValidationOrConflict !== true &&
      (
        context.lastBootstrapError !== null ||
        context.lastRetryableSeedContactError !==
          SEED_CONTACT_SESSION_ABSENT
      );
  }

  throwPreservedRetryableOutcome(context, failure) {
    const message = JOINING_ERROR_MSG.contactSeedFailed(
      failure.error.message,
    );
    if (context.lastBootstrapError === null &&
        context.lastRetryableSeedContactError !==
          SEED_CONTACT_SESSION_ABSENT) {
      throw this.buildUnavailableError(context, message);
    }
    throw this.buildRetryableError(
      message,
      this.buildRetryableErrorOptions({
        retryAfterMs: context.lastRetryAfterMs,
        parsedError: context.lastBootstrapError,
        code: context.lastBootstrapError?.code,
      }),
    );
  }

  throwParsedOrGenericFailure(context, attempt, failure) {
    if (failure.parsedError?.code ===
        BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE) {
      throw new Error(
        JOINING_ERROR_MSG.leaderMetadataIncomplete(
          formatLeaderMetadataDetails(failure.parsedError),
        ),
      );
    }
    if (failure.parsedError?.code ===
        BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY) {
      throw new Error(
        JOINING_ERROR_MSG.bootstrapNotReady(failure.parsedError.phase),
      );
    }
    context.logger.error(JOINING_LOG_MSG.SEED_CONTACT_FAILED, {
      nodeId: this.nodeId,
      bootstrapUrl: attempt.bootstrapUrl,
      error: failure.error.message,
    });
    throw new Error(
      JOINING_ERROR_MSG.contactSeedFailed(failure.error.message),
    );
  }

  throwBudgetExhaustion(context) {
    const lastFailure = context.lastAttemptFailure;
    const hasLastFailure =
      lastFailure !== SEED_CONTACT_SESSION_ABSENT;
    const lastFailureMessage = hasLastFailure ?
      lastFailure.errorMessage :
      SEED_READINESS_TIMEOUT_MSG(context.retryTimeoutMs);
    const message = JOINING_ERROR_MSG.contactSeedFailed(
      lastFailureMessage,
    );
    const finalBootstrapError =
      hasLastFailure && lastFailure.parsedError ?
        lastFailure.parsedError :
        context.lastBootstrapError;
    if (hasLastFailure && this.isUnavailableFailure(lastFailure)) {
      throw this.buildUnavailableError(
        context,
        message,
        finalBootstrapError,
      );
    }
    if (isSeedContactPressureEvidence(finalBootstrapError)) {
      throw this.buildPressureError(
        context,
        message,
        finalBootstrapError,
      );
    }
    if (finalBootstrapError) {
      this.throwFinalBootstrapError(context, finalBootstrapError);
    }
    if (context.lastRetryableSeedContactError !==
        SEED_CONTACT_SESSION_ABSENT) {
      throw this.buildUnavailableError(
        context,
        JOINING_ERROR_MSG.contactSeedFailed(
          context.lastRetryableSeedContactError,
        ),
      );
    }
    throw this.buildUnavailableError(context, message);
  }

  throwFinalBootstrapError(context, finalBootstrapError) {
    if (finalBootstrapError.code ===
        BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE) {
      throw this.buildRetryableError(
        JOINING_ERROR_MSG.leaderMetadataIncomplete(
          formatLeaderMetadataDetails(finalBootstrapError),
        ),
        {
          retryAfterMs: context.lastRetryAfterMs,
          parsedError: finalBootstrapError,
          code: finalBootstrapError.code,
        },
      );
    }
    if (finalBootstrapError.code ===
        BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY) {
      throw this.buildBootstrapNotReadyError(
        context,
        finalBootstrapError,
      );
    }
  }

  buildRetryableError(message, options = {}) {
    const retryableError = new Error(message);
    retryableError.deferRetry = true;
    if (Number.isFinite(options.retryAfterMs) &&
        options.retryAfterMs > 0) {
      retryableError.retryAfterMs = Math.floor(options.retryAfterMs);
    }
    if (options.parsedError) {
      retryableError.bootstrapResponse = options.parsedError;
    }
    if (typeof options.code === 'string' && options.code.length > 0) {
      retryableError.code = options.code;
    }
    if (typeof options.failureKind === 'string' &&
        options.failureKind.length > 0) {
      retryableError.seedContactFailureKind = options.failureKind;
    }
    retryableError.seedContactDiagnostics = this.getDiagnostics();
    return retryableError;
  }

  buildPressureError(context, message, parsedError = null) {
    this.updateDiagnostics({
      lastOutcome: JOINING_SEED_CONTACT_OUTCOME.SEED_CONTACT_PRESSURE,
      remainingBudgetMs: this.remainingBudgetMs(context),
    });
    const pressureError = this.buildRetryableError(message, {
      retryAfterMs: context.lastRetryAfterMs,
      parsedError,
      code: JOINING_SEED_CONTACT_FAILURE_KIND.SEED_CONTACT_PRESSURE,
      failureKind: JOINING_SEED_CONTACT_FAILURE_KIND.SEED_CONTACT_PRESSURE,
    });
    pressureError.seedContactPressureCause =
      resolveBootstrapNotReadySeedContactFailureKind(parsedError);
    return pressureError;
  }

  buildUnavailableError(context, message, retainedEvidence = null) {
    this.updateDiagnostics({
      lastOutcome: JOINING_SEED_CONTACT_OUTCOME.SEED_CONTACT_UNAVAILABLE,
      remainingBudgetMs: this.remainingBudgetMs(context),
    });
    const retainedFailureKind =
      isSeedContactPressureEvidence(retainedEvidence) ?
        null :
        resolveBootstrapNotReadySeedContactFailureKind(retainedEvidence);
    return this.buildRetryableError(message, {
      retryAfterMs: context.lastRetryAfterMs,
      parsedError: retainedEvidence,
      code: JOINING_SEED_CONTACT_FAILURE_KIND.SEED_CONTACT_UNAVAILABLE,
      failureKind: retainedFailureKind ||
        JOINING_SEED_CONTACT_FAILURE_KIND.SEED_CONTACT_UNAVAILABLE,
    });
  }

  buildBootstrapNotReadyError(context, parsedError) {
    const failureKind =
      resolveBootstrapNotReadySeedContactFailureKind(parsedError);
    return this.buildRetryableError(
      JOINING_ERROR_MSG.bootstrapNotReady(parsedError.phase),
      {
        retryAfterMs: context.lastRetryAfterMs,
        parsedError,
        code: parsedError.code,
        failureKind,
      },
    );
  }
}

export {
  SeedContactFailureOwner,
};
