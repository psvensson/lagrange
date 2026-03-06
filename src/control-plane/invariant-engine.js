/**
 * Control-Plane Invariant Engine — evaluates a canonical set of
 * control-plane correctness invariants against a state snapshot.
 *
 * Each invariant check returns a typed result:
 *   {invariantId, severity, passed, reason, context}
 *
 * Severity is tagged as 'hard' or 'soft':
 *   - hard: must fail deterministic test gates
 *   - soft: diagnostic warning, does not gate
 *
 * Requirements: 7.1 (Requirement 7)
 */

import {INVARIANT_ID} from '../invariants/invariant-catalog.js';
import {
  INVARIANT_BUNDLE_FIELD,
  INVARIANT_GATE_ERROR_MESSAGE,
  INVARIANT_OUTCOME_SEVERITY,
  INVARIANT_REASON,
} from './invariant-constants.js';

/**
 * Build a frozen invariant result object.
 *
 * @param {Object} options
 * @param {string} options.invariantId - One of INVARIANT_ID.
 * @param {string} options.severity - INVARIANT_OUTCOME_SEVERITY.
 * @param {boolean} options.passed - Whether the invariant holds.
 * @param {string} options.reason - INVARIANT_REASON code.
 * @param {Object} [options.context] - Additional diagnostic context.
 * @return {Object} Frozen invariant result.
 */
function buildInvariantResult(options) {
  return Object.freeze({
    invariantId: options.invariantId,
    severity: options.severity,
    passed: options.passed,
    reason: options.reason,
    context: options.context ?
      Object.freeze({...options.context}) :
      null,
  });
}

/**
 * Check leader uniqueness across owner rows.
 *
 * Each partition or message group must have at most one canonical
 * leader. The state snapshot provides `leaderRows`: an array of
 * objects with at least `{entityId, nodeId}`.
 *
 * @param {Object} state - State snapshot.
 * @param {Array<Object>} state.leaderRows - Owner rows with leader
 *   claims. Each must have `entityId` and `nodeId`.
 * @return {Object} Frozen invariant result.
 */
function checkLeaderUniqueness(state) {
  const rows = Array.isArray(state?.leaderRows) ?
    state.leaderRows :
    [];

  const leadersByEntity = new Map();
  for (const row of rows) {
    const entityId = row?.entityId;
    const nodeId = row?.nodeId;
    if (typeof entityId !== 'string' || entityId.length === 0) {
      continue;
    }
    if (typeof nodeId !== 'string' || nodeId.length === 0) {
      continue;
    }
    if (!leadersByEntity.has(entityId)) {
      leadersByEntity.set(entityId, []);
    }
    leadersByEntity.get(entityId).push(nodeId);
  }

  const duplicates = [];
  for (const [entityId, nodes] of leadersByEntity) {
    if (nodes.length > 1) {
      duplicates.push({entityId, nodes: Object.freeze([...nodes])});
    }
  }

  if (duplicates.length > 0) {
    return buildInvariantResult({
      invariantId: INVARIANT_ID.LEADER_UNIQUENESS,
      severity: INVARIANT_OUTCOME_SEVERITY.HARD,
      passed: false,
      reason: INVARIANT_REASON.DUPLICATE_LEADER_DETECTED,
      context: {duplicates: Object.freeze(duplicates)},
    });
  }

  return buildInvariantResult({
    invariantId: INVARIANT_ID.LEADER_UNIQUENESS,
    severity: INVARIANT_OUTCOME_SEVERITY.HARD,
    passed: true,
    reason: INVARIANT_REASON.LEADER_UNIQUE,
  });
}

/**
 * Check workflow step monotonicity.
 *
 * Workflow transitions must not move backward unless through an
 * explicit terminal recovery step. The state snapshot provides
 * `workflows`: an array of workflow objects, each with a
 * `transitionHistory` array of `{previousStep, nextStep}` and
 * an optional `terminalRecoverySteps` set of allowed backward
 * target steps.
 *
 * Step ordering uses numeric comparison when both steps are
 * finite numbers, and lexicographic comparison otherwise.
 *
 * @param {Object} state - State snapshot.
 * @param {Array<Object>} state.workflows - Workflow records.
 * @return {Object} Frozen invariant result.
 */
function checkMonotonicSteps(state) {
  const workflows = Array.isArray(state?.workflows) ?
    state.workflows :
    [];

  const violations = [];
  for (const workflow of workflows) {
    const history = Array.isArray(workflow?.transitionHistory) ?
      workflow.transitionHistory :
      [];
    const recoverySteps = workflow?.terminalRecoverySteps instanceof Set ?
      workflow.terminalRecoverySteps :
      new Set();
    const workflowId = workflow?.workflowId || null;

    for (const entry of history) {
      const prev = entry?.previousStep;
      const next = entry?.nextStep;
      if (prev == null || next == null) {
        continue;
      }
      if (recoverySteps.has(next)) {
        continue;
      }
      if (isBackwardStep(prev, next)) {
        violations.push(Object.freeze({
          workflowId,
          previousStep: prev,
          nextStep: next,
        }));
      }
    }
  }

  if (violations.length > 0) {
    return buildInvariantResult({
      invariantId: INVARIANT_ID.MONOTONIC_STEPS,
      severity: INVARIANT_OUTCOME_SEVERITY.HARD,
      passed: false,
      reason: INVARIANT_REASON.BACKWARD_STEP_DETECTED,
      context: {violations: Object.freeze(violations)},
    });
  }

  return buildInvariantResult({
    invariantId: INVARIANT_ID.MONOTONIC_STEPS,
    severity: INVARIANT_OUTCOME_SEVERITY.HARD,
    passed: true,
    reason: INVARIANT_REASON.STEPS_MONOTONIC,
  });
}

/**
 * Determine whether a step transition is backward.
 * Uses numeric comparison when both values are finite numbers,
 * lexicographic comparison otherwise.
 *
 * @param {*} prev - Previous step value.
 * @param {*} next - Next step value.
 * @return {boolean} True when next < prev.
 */
function isBackwardStep(prev, next) {
  if (Number.isFinite(prev) && Number.isFinite(next)) {
    return next < prev;
  }
  return String(next) < String(prev);
}

/**
 * Check claim exclusivity by operation id and owner key.
 *
 * Each (operationId, ownerKey) pair must have at most one active
 * claim. The state snapshot provides `claims`: an array of
 * `{operationId, ownerKey}` objects.
 *
 * @param {Object} state - State snapshot.
 * @param {Array<Object>} state.claims - Active claim records.
 * @return {Object} Frozen invariant result.
 */
function checkClaimExclusivity(state) {
  const claims = Array.isArray(state?.claims) ?
    state.claims :
    [];

  const seen = new Map();
  const duplicates = [];

  for (const claim of claims) {
    const opId = claim?.operationId;
    const ownerKey = claim?.ownerKey;
    if (typeof opId !== 'string' || opId.length === 0) {
      continue;
    }
    if (typeof ownerKey !== 'string' || ownerKey.length === 0) {
      continue;
    }
    const compositeKey = `${opId}:${ownerKey}`;
    const count = (seen.get(compositeKey) || 0) + 1;
    seen.set(compositeKey, count);
    if (count === 2) {
      duplicates.push(Object.freeze({operationId: opId, ownerKey}));
    }
  }

  if (duplicates.length > 0) {
    return buildInvariantResult({
      invariantId: INVARIANT_ID.CLAIM_EXCLUSIVITY,
      severity: INVARIANT_OUTCOME_SEVERITY.HARD,
      passed: false,
      reason: INVARIANT_REASON.DUPLICATE_CLAIM_DETECTED,
      context: {duplicates: Object.freeze(duplicates)},
    });
  }

  return buildInvariantResult({
    invariantId: INVARIANT_ID.CLAIM_EXCLUSIVITY,
    severity: INVARIANT_OUTCOME_SEVERITY.HARD,
    passed: true,
    reason: INVARIANT_REASON.CLAIMS_EXCLUSIVE,
  });
}

/**
 * Check for orphan in-flight operations without owner keys.
 *
 * Every in-flight operation must have a corresponding owner key
 * in the reconcile queue. The state snapshot provides:
 *   - `inFlightOperations`: array of `{operationId, ownerKey?}`
 *   - `registeredOwnerKeys`: Set of owner keys with active
 *     reconcile registrations.
 *
 * @param {Object} state - State snapshot.
 * @param {Array<Object>} state.inFlightOperations - In-flight ops.
 * @param {Set<string>} state.registeredOwnerKeys - Active keys.
 * @return {Object} Frozen invariant result.
 */
function checkOrphanInFlight(state) {
  const operations = Array.isArray(state?.inFlightOperations) ?
    state.inFlightOperations :
    [];
  const registered = state?.registeredOwnerKeys instanceof Set ?
    state.registeredOwnerKeys :
    new Set();

  const orphans = [];
  for (const op of operations) {
    const opId = op?.operationId;
    const ownerKey = op?.ownerKey;
    if (typeof opId !== 'string' || opId.length === 0) {
      continue;
    }
    const hasOwner = typeof ownerKey === 'string' &&
      ownerKey.length > 0 &&
      registered.has(ownerKey);
    if (!hasOwner) {
      orphans.push(Object.freeze({
        operationId: opId,
        ownerKey: ownerKey || null,
      }));
    }
  }

  if (orphans.length > 0) {
    return buildInvariantResult({
      invariantId: INVARIANT_ID.ORPHAN_IN_FLIGHT,
      severity: INVARIANT_OUTCOME_SEVERITY.SOFT,
      passed: false,
      reason: INVARIANT_REASON.ORPHAN_DETECTED,
      context: {orphans: Object.freeze(orphans)},
    });
  }

  return buildInvariantResult({
    invariantId: INVARIANT_ID.ORPHAN_IN_FLIGHT,
    severity: INVARIANT_OUTCOME_SEVERITY.SOFT,
    passed: true,
    reason: INVARIANT_REASON.NO_ORPHANS,
  });
}

/**
 * Evaluate the full canonical invariant set against a state
 * snapshot.
 *
 * @param {Object} state - Combined state snapshot containing
 *   fields consumed by each individual invariant check.
 * @return {Array<Object>} Array of frozen invariant results.
 */
function evaluateInvariants(state) {
  const snapshot = state && typeof state === 'object' ? state : {};
  return Object.freeze([
    checkLeaderUniqueness(snapshot),
    checkMonotonicSteps(snapshot),
    checkClaimExclusivity(snapshot),
    checkOrphanInFlight(snapshot),
  ]);
}

/**
 * Build a diagnostics bundle from invariant evaluation results.
 *
 * The bundle includes a summary of pass/fail counts separated by
 * severity, and a breaches array with full context including owner
 * key and operation id when available.
 *
 * Requirements: 7.2 (Requirement 7, 9)
 *
 * @param {Array<Object>} invariantResults - Results from
 *   evaluateInvariants().
 * @return {Object} Frozen diagnostics bundle.
 */
function buildInvariantDiagnosticsBundle(invariantResults) {
  const results = Array.isArray(invariantResults) ?
    invariantResults :
    [];

  let passed = 0;
  let failed = 0;
  let hardFailures = 0;
  let softFailures = 0;
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
    [INVARIANT_BUNDLE_FIELD.TIMESTAMP]: Date.now(),
  });
}

/**
 * Assert that no hard invariant has failed. Throws a typed error
 * with the diagnostics bundle attached when any hard invariant
 * breaches.
 *
 * Soft-only failures do not trigger the gate.
 *
 * Requirements: 7.3 (Requirement 7)
 *
 * @param {Array<Object>} invariantResults - Results from
 *   evaluateInvariants().
 * @throws {Error} When any result has severity 'hard' and
 *   passed === false. The error includes a `diagnosticsBundle`
 *   property.
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
  buildInvariantDiagnosticsBundle,
  buildInvariantResult,
  checkClaimExclusivity,
  checkLeaderUniqueness,
  checkMonotonicSteps,
  checkOrphanInFlight,
  evaluateInvariants,
  isBackwardStep,
};
