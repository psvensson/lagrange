/**
 * Diagnostics conversion and hard gate helpers for invariant results.
 */

import {createInvariantRecord} from '../invariants/invariant-catalog.js';
import {
  INVARIANT_BUNDLE_FIELD,
  INVARIANT_ENGINE_SUBSYSTEM,
  INVARIANT_GATE_ERROR_MESSAGE,
  INVARIANT_OUTCOME_SEVERITY,
} from './invariant-constants.js';

const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_STRING = 'string';
const LOCAL_NUM_ZERO = 0;
const INVARIANT_ENTITY_ID_CONTEXT_FIELDS = Object.freeze([
  'operationId',
  'workflowId',
  'transitionId',
  'entityId',
  'nodeId',
  'consumer',
]);

/**
 * Determine whether a value is a non-empty plain object.
 * @param {*} value
 * @return {boolean}
 */
function isRecord(value) {
  return value !== null &&
    typeof value === LOCAL_STR_OBJECT &&
    !Array.isArray(value);
}

/**
 * Resolve a stable entity id from invariant context when possible.
 * @param {Object} result - Invariant result.
 * @return {string|null}
 */
function resolveInvariantEntityId(result) {
  const context = isRecord(result?.context) ? result.context : null;
  if (!context) {
    return null;
  }
  for (const field of INVARIANT_ENTITY_ID_CONTEXT_FIELDS) {
    if (typeof context[field] === LOCAL_STR_STRING && context[field].length > LOCAL_NUM_ZERO) {
      return context[field];
    }
  }
  return null;
}

/**
 * Convert control-plane invariant results into invariant-catalog records
 * suitable for diagnostics bundles and harness artifacts.
 *
 * @param {Array<Object>} invariantResults - Results from evaluateInvariants().
 * @return {Array<Object>} Frozen array of invariant records.
 */
function buildInvariantArtifactRecords(invariantResults) {
  const results = Array.isArray(invariantResults) ?
    invariantResults :
    [];

  const records = results.map((result) => {
    const context = isRecord(result?.context) ?
      {...result.context} :
      {};
    return createInvariantRecord({
      invariantId: result?.invariantId,
      passed: result?.passed !== false,
      entityId: resolveInvariantEntityId(result),
      owningSubsystem: INVARIANT_ENGINE_SUBSYSTEM,
      reasonCode: result?.reason,
      observed: context,
      details: {
        ...context,
        controlPlaneSeverity: result?.severity || null,
      },
    });
  });

  return Object.freeze(records);
}

/**
 * Build a diagnostics bundle from invariant evaluation results.
 *
 * @param {Array<Object>} invariantResults - Results from evaluateInvariants().
 * @return {Object} Frozen diagnostics bundle.
 */
function buildInvariantDiagnosticsBundle(invariantResults) {
  const results = Array.isArray(invariantResults) ?
    invariantResults :
    [];
  const artifactRecords = buildInvariantArtifactRecords(results);

  let passed = LOCAL_NUM_ZERO;
  let failed = LOCAL_NUM_ZERO;
  let hardFailures = LOCAL_NUM_ZERO;
  let softFailures = LOCAL_NUM_ZERO;
  const breaches = [];

  for (const result of results) {
    if (result?.passed) {
      passed++;
    } else {
      failed++;
      if (result?.severity === INVARIANT_OUTCOME_SEVERITY.HARD) {
        hardFailures++;
      } else {
        softFailures++;
      }
      breaches.push(Object.freeze({
        invariantId: result?.invariantId || null,
        severity: result?.severity || null,
        reason: result?.reason || null,
        ownerKey: result?.context?.ownerKey || null,
        operationId: result?.context?.operationId || null,
        context: result?.context ?
          Object.freeze({...result.context}) :
          null,
      }));
    }
  }

  return Object.freeze({
    [INVARIANT_BUNDLE_FIELD.SUMMARY]: Object.freeze({
      [INVARIANT_BUNDLE_FIELD.TOTAL]: results.length,
      [INVARIANT_BUNDLE_FIELD.PASSED]: passed,
      [INVARIANT_BUNDLE_FIELD.FAILED]: failed,
      [INVARIANT_BUNDLE_FIELD.HARD_FAILURES]: hardFailures,
      [INVARIANT_BUNDLE_FIELD.SOFT_FAILURES]: softFailures,
    }),
    [INVARIANT_BUNDLE_FIELD.BREACHES]: Object.freeze(breaches),
    [INVARIANT_BUNDLE_FIELD.ARTIFACT_RECORDS]: artifactRecords,
    [INVARIANT_BUNDLE_FIELD.TIMESTAMP]: Date.now(),
  });
}

/**
 * Assert that no hard invariant has failed. Throws a typed error
 * with the diagnostics bundle attached when any hard invariant breaches.
 *
 * @param {Array<Object>} invariantResults - Results from evaluateInvariants().
 * @throws {Error} When any hard invariant failed.
 */
function assertInvariantGate(invariantResults) {
  const results = Array.isArray(invariantResults) ?
    invariantResults :
    [];

  const hasHardFailure = results.some(
    (r) => r?.severity === INVARIANT_OUTCOME_SEVERITY.HARD &&
      r?.passed === false,
  );

  if (!hasHardFailure) {
    return;
  }

  const bundle = buildInvariantDiagnosticsBundle(results);
  const error = new Error(INVARIANT_GATE_ERROR_MESSAGE);
  error.diagnosticsBundle = bundle;
  throw error;
}

export {
  assertInvariantGate,
  buildInvariantArtifactRecords,
  buildInvariantDiagnosticsBundle,
};
