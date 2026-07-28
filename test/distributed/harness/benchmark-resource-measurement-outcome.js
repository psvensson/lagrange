import {
  BENCHMARK_RESOURCE_MEASUREMENT_OUTCOME_STATE,
  BENCHMARK_RESOURCE_MEASUREMENT_REASON,
  BENCHMARK_RESOURCE_MEASUREMENT_RETRY,
} from './benchmark-resource-contract-constants.js';
import {types} from 'node:util';
import {
  hasExactOwnDataKeys,
} from './benchmark-semantic-integrity.js';

export {
  BENCHMARK_RESOURCE_MEASUREMENT_OUTCOME_STATE,
  BENCHMARK_RESOURCE_MEASUREMENT_REASON,
  BENCHMARK_RESOURCE_MEASUREMENT_RETRY,
};

const transientReasons = new Set([
  'resolver.resolve:artifact_missing',
  'rootReceipt:root_missing',
]);
const preservedInvalidReasons = new Set([
  BENCHMARK_RESOURCE_MEASUREMENT_REASON.EVIDENCE_INVALID,
  BENCHMARK_RESOURCE_MEASUREMENT_REASON.IMMUTABLE_RESOLUTION_DRIFT,
  BENCHMARK_RESOURCE_MEASUREMENT_REASON.PRICE_EVIDENCE_INVALID,
]);
const allowedReasonsByState = Object.freeze({
  [BENCHMARK_RESOURCE_MEASUREMENT_OUTCOME_STATE.MEASURING]: new Set([
    BENCHMARK_RESOURCE_MEASUREMENT_REASON.EVIDENCE_COMPLETE,
  ]),
  [BENCHMARK_RESOURCE_MEASUREMENT_OUTCOME_STATE.NON_MEASURING]: new Set([
    BENCHMARK_RESOURCE_MEASUREMENT_REASON.EVIDENCE_NOT_CLAIM_ELIGIBLE,
  ]),
  [BENCHMARK_RESOURCE_MEASUREMENT_OUTCOME_STATE.INVALID]: new Set([
    BENCHMARK_RESOURCE_MEASUREMENT_REASON.EVIDENCE_INVALID,
    BENCHMARK_RESOURCE_MEASUREMENT_REASON.IMMUTABLE_RESOLUTION_DRIFT,
    BENCHMARK_RESOURCE_MEASUREMENT_REASON.PRICE_EVIDENCE_INVALID,
  ]),
  [BENCHMARK_RESOURCE_MEASUREMENT_OUTCOME_STATE.STALE_INELIGIBLE]: new Set([
    BENCHMARK_RESOURCE_MEASUREMENT_REASON.EVIDENCE_NOT_YET_VALID,
    BENCHMARK_RESOURCE_MEASUREMENT_REASON.EVIDENCE_EXPIRED,
    BENCHMARK_RESOURCE_MEASUREMENT_REASON.PROFILE_IDENTITY_MISMATCH,
    BENCHMARK_RESOURCE_MEASUREMENT_REASON.PRICE_EVIDENCE_NOT_YET_VALID,
    BENCHMARK_RESOURCE_MEASUREMENT_REASON.PRICE_EVIDENCE_EXPIRED,
  ]),
  [BENCHMARK_RESOURCE_MEASUREMENT_OUTCOME_STATE.TRANSIENT]: new Set([
    BENCHMARK_RESOURCE_MEASUREMENT_REASON.OBSERVATION_MISSING,
  ]),
});
const objectFreeze = Object.freeze;
const reflectApply = Reflect.apply;
const setHasMethod = Set.prototype.has;
const outcomeKeys = Object.freeze(['state', 'reason']);
const reasonKeys = Object.freeze(['code', 'retry']);
const localText = Object.freeze({
  STATE_INVALID: 'measurementOutcome:state',
  REASON_CODE_TEXT_REQUIRED:
    'measurementOutcome.reason.code:text_required',
  VALID: 'valid',
  INVALID: 'measurementOutcome:invalid',
});

function allowedReason(state, reasonCode) {
  const allowed = allowedReasonsByState[state];
  return allowed !== undefined &&
    reflectApply(setHasMethod, allowed, [reasonCode]);
}

export function createBenchmarkResourceMeasurementOutcome(
  state,
  reasonCode,
) {
  if (allowedReasonsByState[state] === undefined) {
    throw new TypeError(localText.STATE_INVALID);
  }
  if (!allowedReason(state, reasonCode)) {
    throw new TypeError(localText.REASON_CODE_TEXT_REQUIRED);
  }
  const retry = state ===
    BENCHMARK_RESOURCE_MEASUREMENT_OUTCOME_STATE.TRANSIENT ?
    BENCHMARK_RESOURCE_MEASUREMENT_RETRY.RETRYABLE :
    BENCHMARK_RESOURCE_MEASUREMENT_RETRY.NEVER;
  return objectFreeze({
    state,
    reason: objectFreeze({code: reasonCode, retry}),
  });
}

export function inspectBenchmarkResourceMeasurementOutcome(outcome) {
  if (
    types.isProxy(outcome) ||
    !hasExactOwnDataKeys(outcome, outcomeKeys) ||
    types.isProxy(outcome.reason) ||
    !hasExactOwnDataKeys(outcome.reason, reasonKeys)
  ) {
    return {valid: false, reason: localText.INVALID};
  }
  const valid =
    allowedReason(outcome.state, outcome.reason.code) &&
    (
      outcome.state ===
        BENCHMARK_RESOURCE_MEASUREMENT_OUTCOME_STATE.TRANSIENT
    ) === (
      outcome.reason.retry ===
        BENCHMARK_RESOURCE_MEASUREMENT_RETRY.RETRYABLE
    ) &&
    (
      outcome.reason.retry ===
        BENCHMARK_RESOURCE_MEASUREMENT_RETRY.RETRYABLE ||
      outcome.reason.retry ===
        BENCHMARK_RESOURCE_MEASUREMENT_RETRY.NEVER
    );
  return {valid, reason: valid ? localText.VALID : localText.INVALID};
}

export function benchmarkResourceAcceptedMeasurementOutcome(claimEligible) {
  return createBenchmarkResourceMeasurementOutcome(
    claimEligible ?
      BENCHMARK_RESOURCE_MEASUREMENT_OUTCOME_STATE.MEASURING :
      BENCHMARK_RESOURCE_MEASUREMENT_OUTCOME_STATE.NON_MEASURING,
    claimEligible ?
      BENCHMARK_RESOURCE_MEASUREMENT_REASON.EVIDENCE_COMPLETE :
      BENCHMARK_RESOURCE_MEASUREMENT_REASON.EVIDENCE_NOT_CLAIM_ELIGIBLE,
  );
}

export function benchmarkResourceRejectedMeasurementOutcome(reasonCode) {
  const transient = reflectApply(setHasMethod, transientReasons, [reasonCode]);
  const preservedInvalid = reflectApply(
    setHasMethod,
    preservedInvalidReasons,
    [reasonCode],
  );
  return createBenchmarkResourceMeasurementOutcome(
    transient ?
      BENCHMARK_RESOURCE_MEASUREMENT_OUTCOME_STATE.TRANSIENT :
      BENCHMARK_RESOURCE_MEASUREMENT_OUTCOME_STATE.INVALID,
    transient ?
      BENCHMARK_RESOURCE_MEASUREMENT_REASON.OBSERVATION_MISSING :
      (
        preservedInvalid ?
          reasonCode :
          BENCHMARK_RESOURCE_MEASUREMENT_REASON.EVIDENCE_INVALID
      ),
  );
}

export function benchmarkResourceStaleMeasurementOutcome(reasonCode) {
  return createBenchmarkResourceMeasurementOutcome(
    BENCHMARK_RESOURCE_MEASUREMENT_OUTCOME_STATE.STALE_INELIGIBLE,
    reasonCode,
  );
}
