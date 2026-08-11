/**
 * Typed vocabulary and pure classification helpers for the
 * authoritative-row mutation flow — the stateless layer of
 * AuthoritativeRowMutationHelper (src/raft/authoritative-row-mutation-helper.js),
 * extracted so the stateful helper stays within the source size cap.
 */

import {TIME_MS} from '../constants/index.js';
import {
  CONTROL_PLANE_MUTATION_OUTCOME,
} from '../control-plane/control-plane-system-table-gateway.js';
import {classifyControlPlaneMutationResult} from
  '../control-plane/control-plane-mutation-outcome-classifier.js';

const objectCreate = Object.create;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectHasOwn = Object.hasOwn;
const numberIsFinite = Number.isFinite;
const DATA_DESCRIPTOR_VALUE_PROPERTY = 'value';
const RETRY_AFTER_MS_PROPERTY = 'retryAfterMs';

const CACHE_VISIBILITY_ERROR_FRAGMENT = 'Cache update not observed';
const AUTHORITATIVE_ROW_MUTATION_REASON = Object.freeze({
  APPLIED: 'applied',
  AUTHORITATIVE_CONFIRM_UNAVAILABLE: 'authoritative-confirm-unavailable',
  AUTHORITATIVE_WRITE_FAILED: 'authoritative-write-failed',
  CACHE_VISIBILITY_GAP_RECOVERED: 'cache-visibility-gap-recovered',
  CACHE_VISIBILITY_GAP_UNRECOVERED: 'cache-visibility-gap-unrecovered',
  DEFERRED: 'deferred',
  IN_FLIGHT: 'in-flight',
  NOOP: 'noop',
  OBSERVED_STATE_CHANGED: 'observed-state-changed',
  OWNER_NOT_READY: 'owner-not-ready',
  REJECTED: 'rejected',
  SKIPPED: 'skipped',
});
const AUTHORITATIVE_ROW_MUTATION_ERROR_MSG = Object.freeze({
  MISSING_BUILD_UPDATE_DATA:
    'AuthoritativeRowMutationHelper requires buildUpdateData',
  MISSING_BUILD_WHERE_CLAUSE:
    'AuthoritativeRowMutationHelper requires buildWhereClause',
  MISSING_READ_VALUE_FROM_CACHE:
    'AuthoritativeRowMutationHelper requires readValueFromCache',
  MISSING_TABLE_NAME: 'AuthoritativeRowMutationHelper requires tableName',
});
const AUTHORITATIVE_ROW_MUTATION_RETRY = Object.freeze({
  BACKOFF_MULTIPLIER: 2,
  MAX_DELAY_MS: TIME_MS.SECOND * 30,
});
// Typed causes for a publication deferred at the authoritative probe —
// previously indistinguishable from not-converged (quest
// partition-leader-row-publication-integrity).
const AUTHORITATIVE_PROBE_DEFER_CAUSE = Object.freeze({
  READ_FAILED: 'read-failed',
  ROW_UNAVAILABLE: 'row-unavailable',
});

function classifyMutationFailure(error) {
  const message = error?.message || '';
  if (message.includes(CACHE_VISIBILITY_ERROR_FRAGMENT)) {
    return AUTHORITATIVE_ROW_MUTATION_REASON.CACHE_VISIBILITY_GAP_UNRECOVERED;
  }
  return AUTHORITATIVE_ROW_MUTATION_REASON.AUTHORITATIVE_WRITE_FAILED;
}

// Every frozen gateway outcome has one explicit Raft disposition. Apply and
// zero-row truth remain owned by classifyControlPlaneMutationResult; this
// table is consulted only after canonical apply is false, so APPLIED and
// PENDING_VISIBILITY represent contradictory failed envelopes here.
const GATEWAY_OUTCOME_MUTATION_REASON = objectCreate(null);
GATEWAY_OUTCOME_MUTATION_REASON[CONTROL_PLANE_MUTATION_OUTCOME.APPLIED] =
  AUTHORITATIVE_ROW_MUTATION_REASON.REJECTED;
GATEWAY_OUTCOME_MUTATION_REASON[CONTROL_PLANE_MUTATION_OUTCOME.NO_OP] =
  AUTHORITATIVE_ROW_MUTATION_REASON.NOOP;
GATEWAY_OUTCOME_MUTATION_REASON[
  CONTROL_PLANE_MUTATION_OUTCOME.PENDING_VISIBILITY
] = AUTHORITATIVE_ROW_MUTATION_REASON.REJECTED;
GATEWAY_OUTCOME_MUTATION_REASON[CONTROL_PLANE_MUTATION_OUTCOME.DEFERRED] =
  AUTHORITATIVE_ROW_MUTATION_REASON.DEFERRED;
GATEWAY_OUTCOME_MUTATION_REASON[CONTROL_PLANE_MUTATION_OUTCOME.REJECTED] =
  AUTHORITATIVE_ROW_MUTATION_REASON.REJECTED;
GATEWAY_OUTCOME_MUTATION_REASON[
  CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY
] = AUTHORITATIVE_ROW_MUTATION_REASON.OWNER_NOT_READY;
GATEWAY_OUTCOME_MUTATION_REASON[
  CONTROL_PLANE_MUTATION_OUTCOME.OBSERVED_STATE_CHANGED
] = AUTHORITATIVE_ROW_MUTATION_REASON.OBSERVED_STATE_CHANGED;
objectFreeze(GATEWAY_OUTCOME_MUTATION_REASON);

function readOwnRetryAfterMs(result, valid) {
  if (!valid) return 0;
  let descriptor;
  try {
    descriptor = objectGetOwnPropertyDescriptor(result, RETRY_AFTER_MS_PROPERTY);
  } catch {
    return 0;
  }
  if (!descriptor ||
    !objectHasOwn(descriptor, DATA_DESCRIPTOR_VALUE_PROPERTY) ||
    !numberIsFinite(descriptor.value) || descriptor.value <= 0) {
    return 0;
  }
  return descriptor.value;
}

function classifyGatewayMutationOutcome(result) {
  const classification = classifyControlPlaneMutationResult(result);
  let reason = AUTHORITATIVE_ROW_MUTATION_REASON.REJECTED;
  if (classification.zeroAffectedRows) {
    reason = AUTHORITATIVE_ROW_MUTATION_REASON.OBSERVED_STATE_CHANGED;
  } else if (classification.applied) {
    reason = AUTHORITATIVE_ROW_MUTATION_REASON.APPLIED;
  } else if (classification.known) {
    reason = GATEWAY_OUTCOME_MUTATION_REASON[
      classification.outcome
    ];
  }
  const resultDisposition = objectCreate(null);
  resultDisposition.applied = classification.applied;
  resultDisposition.reason = reason;
  resultDisposition.retryAfterMs = readOwnRetryAfterMs(
    result,
    classification.valid,
  );
  return objectFreeze(resultDisposition);
}

function validateMutationHelperOptions(options) {
  if (!options.tableName) {
    throw new Error(AUTHORITATIVE_ROW_MUTATION_ERROR_MSG.MISSING_TABLE_NAME);
  }
  if (typeof options.buildWhereClause !== 'function') {
    throw new Error(
      AUTHORITATIVE_ROW_MUTATION_ERROR_MSG.MISSING_BUILD_WHERE_CLAUSE,
    );
  }
  if (typeof options.buildUpdateData !== 'function') {
    throw new Error(
      AUTHORITATIVE_ROW_MUTATION_ERROR_MSG.MISSING_BUILD_UPDATE_DATA,
    );
  }
  if (typeof options.readValueFromCache !== 'function') {
    throw new Error(
      AUTHORITATIVE_ROW_MUTATION_ERROR_MSG.MISSING_READ_VALUE_FROM_CACHE,
    );
  }
}

function normalizeRetryBackoffMultiplier(value) {
  if (Number.isFinite(value) && value >= 1) {
    return value;
  }
  return AUTHORITATIVE_ROW_MUTATION_RETRY.BACKOFF_MULTIPLIER;
}

function normalizeMaxRetryDelayMs(value) {
  if (Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return AUTHORITATIVE_ROW_MUTATION_RETRY.MAX_DELAY_MS;
}

function optionalFunction(value) {
  return typeof value === 'function' ? value : null;
}

function withDefault(value, fallback) {
  return value === undefined ? fallback : value;
}

export {
  AUTHORITATIVE_PROBE_DEFER_CAUSE,
  AUTHORITATIVE_ROW_MUTATION_REASON,
  AUTHORITATIVE_ROW_MUTATION_RETRY,
  classifyGatewayMutationOutcome,
  classifyMutationFailure,
  normalizeMaxRetryDelayMs,
  normalizeRetryBackoffMultiplier,
  optionalFunction,
  validateMutationHelperOptions,
  withDefault,
};
