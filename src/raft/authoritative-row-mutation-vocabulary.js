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

function extractAffectedRows(result) {
  const candidate = Number(
    result?.partitionResult?.affectedRows ?? result?.affectedRows,
  );
  return Number.isFinite(candidate) ? candidate : null;
}

function classifyMutationFailure(error) {
  const message = error?.message || '';
  if (message.includes(CACHE_VISIBILITY_ERROR_FRAGMENT)) {
    return AUTHORITATIVE_ROW_MUTATION_REASON.CACHE_VISIBILITY_GAP_UNRECOVERED;
  }
  return AUTHORITATIVE_ROW_MUTATION_REASON.AUTHORITATIVE_WRITE_FAILED;
}

// One canonical outcome per gateway verdict — a decision table, not an
// independent branch pile.
const GATEWAY_OUTCOME_MUTATION_REASON = Object.freeze(new Map([
  [CONTROL_PLANE_MUTATION_OUTCOME.DEFERRED,
    AUTHORITATIVE_ROW_MUTATION_REASON.DEFERRED],
  [CONTROL_PLANE_MUTATION_OUTCOME.REJECTED,
    AUTHORITATIVE_ROW_MUTATION_REASON.REJECTED],
  [CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY,
    AUTHORITATIVE_ROW_MUTATION_REASON.OWNER_NOT_READY],
  [CONTROL_PLANE_MUTATION_OUTCOME.OBSERVED_STATE_CHANGED,
    AUTHORITATIVE_ROW_MUTATION_REASON.OBSERVED_STATE_CHANGED],
]));

function classifyGatewayMutationOutcome(result) {
  return GATEWAY_OUTCOME_MUTATION_REASON.get(result?.outcome) ?? null;
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
  extractAffectedRows,
  normalizeMaxRetryDelayMs,
  normalizeRetryBackoffMultiplier,
  optionalFunction,
  validateMutationHelperOptions,
  withDefault,
};
