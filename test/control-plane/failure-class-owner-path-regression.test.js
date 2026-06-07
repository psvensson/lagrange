/**
 * Owner-path regression tests for each closed failure class.
 *
 * For every failure class in the registry, this suite proves:
 *   1. A deterministic state snapshot triggers the corresponding
 *      invariant violation.
 *   2. evaluateInvariants() detects the violation.
 *   3. assertInvariantGate() throws for hard invariants.
 *   4. The failure class lifecycle (register → reproduced → closed)
 *      removes it from open classes.
 *   5. Closure requires all three: deterministic repro,
 *      owner-path regression, and invariant assertion.
 *
 * Requirements: 8.2 (Requirement 8)
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  registerFailureClass,
  getOpenFailureClasses,
  markReproduced,
  markClosed,
  clearRegistry,
} from '../../src/control-plane/failure-class-registry.js';
import {
  evaluateInvariants,
  assertInvariantGate,
} from '../../src/control-plane/invariant-engine.js';
import {
  FAILURE_CLASS,
  FAILURE_CLASS_STATUS,
} from '../../src/control-plane/failure-class-constants.js';
import {INVARIANT_ID} from '../../src/invariants/invariant-catalog.js';
import {
  INVARIANT_OUTCOME_SEVERITY,
  INVARIANT_GATE_ERROR_MESSAGE,
} from '../../src/control-plane/invariant-constants.js';

// ── Suite-local fixture constants ──────────────────────────────────
const FIXTURE_ENTITY_A = 'partition-regr-1';
const FIXTURE_NODE_1 = 'node-regr-1';
const FIXTURE_NODE_2 = 'node-regr-2';
const FIXTURE_WORKFLOW_A = 'wf-regr-a';
const FIXTURE_OP_1 = 'op-regr-1';
const FIXTURE_OWNER_KEY_A = 'owner-regr-a';
const STEP_HIGH = 5;
const STEP_LOW = 1;

const FIXTURE_TEST_ID_PREFIX = 'owner-path-regression';

/**
 * Build a deterministic test ID for a failure class.
 * @param {string} failureClassId
 * @return {string}
 */
function buildTestId(failureClassId) {
  return `${FIXTURE_TEST_ID_PREFIX}.${failureClassId}`;
}

// ── Failure-class-to-invariant mapping ─────────────────────────────
// Each failure class maps to the invariant it most directly violates.
const FAILURE_CLASS_INVARIANT_MAP = Object.freeze({
  [FAILURE_CLASS.DUAL_LEADER]: INVARIANT_ID.LEADER_UNIQUENESS,
  [FAILURE_CLASS.BACKWARD_STEP]: INVARIANT_ID.MONOTONIC_STEPS,
  [FAILURE_CLASS.STALE_CLAIM]: INVARIANT_ID.CLAIM_EXCLUSIVITY,
  [FAILURE_CLASS.ORPHAN_OPERATION]: INVARIANT_ID.ORPHAN_IN_FLIGHT,
  [FAILURE_CLASS.TIMEOUT_BOUNDARY]: INVARIANT_ID.MONOTONIC_STEPS,
  [FAILURE_CLASS.CDC_DIVERGENCE]: INVARIANT_ID.LEADER_UNIQUENESS,
  [FAILURE_CLASS.PUBLICATION_DRAIN_DETERMINISM]: INVARIANT_ID.PUBLICATION_DRAIN_DETERMINISTIC,
});

// ── State snapshot builders per failure class ──────────────────────
// Each returns a state snapshot that triggers the mapped invariant.

/**
 * Dual leader: two leaders for the same entity.
 * @return {Object}
 */
function buildDualLeaderState() {
  return {
    leaderRows: [
      {entityId: FIXTURE_ENTITY_A, nodeId: FIXTURE_NODE_1},
      {entityId: FIXTURE_ENTITY_A, nodeId: FIXTURE_NODE_2},
    ],
    workflows: [],
    claims: [],
    inFlightOperations: [],
    registeredOwnerKeys: new Set(),
  };
}

/**
 * Backward step: workflow transition goes backward.
 * @return {Object}
 */
function buildBackwardStepState() {
  return {
    leaderRows: [],
    workflows: [{
      workflowId: FIXTURE_WORKFLOW_A,
      transitionHistory: [
        {previousStep: STEP_HIGH, nextStep: STEP_LOW},
      ],
    }],
    claims: [],
    inFlightOperations: [],
    registeredOwnerKeys: new Set(),
  };
}

/**
 * Stale claim: duplicate active claim for same op + owner key.
 * @return {Object}
 */
function buildStaleClaimState() {
  return {
    leaderRows: [],
    workflows: [],
    claims: [
      {operationId: FIXTURE_OP_1, ownerKey: FIXTURE_OWNER_KEY_A},
      {operationId: FIXTURE_OP_1, ownerKey: FIXTURE_OWNER_KEY_A},
    ],
    inFlightOperations: [],
    registeredOwnerKeys: new Set(),
  };
}

/**
 * Orphan operation: in-flight op without registered owner key.
 * @return {Object}
 */
function buildOrphanOperationState() {
  return {
    leaderRows: [],
    workflows: [],
    claims: [],
    inFlightOperations: [
      {operationId: FIXTURE_OP_1, ownerKey: FIXTURE_OWNER_KEY_A},
    ],
    registeredOwnerKeys: new Set(),
  };
}

/**
 * Timeout boundary: manifests as backward step when timeout
 * causes retry from a later step back to an earlier one.
 * @return {Object}
 */
function buildTimeoutBoundaryState() {
  return {
    leaderRows: [],
    workflows: [{
      workflowId: FIXTURE_WORKFLOW_A,
      transitionHistory: [
        {previousStep: STEP_HIGH, nextStep: STEP_LOW},
      ],
    }],
    claims: [],
    inFlightOperations: [],
    registeredOwnerKeys: new Set(),
  };
}

/**
 * CDC divergence: manifests as dual leader when stale CDC
 * propagation causes two nodes to appear as leaders.
 * @return {Object}
 */
function buildCdcDivergenceState() {
  return {
    leaderRows: [
      {entityId: FIXTURE_ENTITY_A, nodeId: FIXTURE_NODE_1},
      {entityId: FIXTURE_ENTITY_A, nodeId: FIXTURE_NODE_2},
    ],
    workflows: [],
    claims: [],
    inFlightOperations: [],
    registeredOwnerKeys: new Set(),
  };
}

function buildPublicationDrainDeterminismState() {
  return {
    isPublicationOwner: true,
    missingPublishedCount: 1,
    scheduledReconcileObligationEnabled: false,
  };
}

const STATE_BUILDERS = Object.freeze({
  [FAILURE_CLASS.DUAL_LEADER]: buildDualLeaderState,
  [FAILURE_CLASS.BACKWARD_STEP]: buildBackwardStepState,
  [FAILURE_CLASS.STALE_CLAIM]: buildStaleClaimState,
  [FAILURE_CLASS.ORPHAN_OPERATION]: buildOrphanOperationState,
  [FAILURE_CLASS.TIMEOUT_BOUNDARY]: buildTimeoutBoundaryState,
  [FAILURE_CLASS.CDC_DIVERGENCE]: buildCdcDivergenceState,
  [FAILURE_CLASS.PUBLICATION_DRAIN_DETERMINISM]: buildPublicationDrainDeterminismState,
});

// ── Descriptions per failure class ─────────────────────────────────
const FAILURE_CLASS_DESCRIPTIONS = Object.freeze({
  [FAILURE_CLASS.DUAL_LEADER]:
    'Two leaders observed for same partition during rebalance',
  [FAILURE_CLASS.BACKWARD_STEP]:
    'Backward workflow step transition under node churn',
  [FAILURE_CLASS.STALE_CLAIM]:
    'Stale claim overwrites newer transition',
  [FAILURE_CLASS.ORPHAN_OPERATION]:
    'In-flight operation without owner key after leader change',
  [FAILURE_CLASS.TIMEOUT_BOUNDARY]:
    'Timeout boundary hit causes backward retry step',
  [FAILURE_CLASS.CDC_DIVERGENCE]:
    'CDC propagation lag causes dual leader visibility',
  [FAILURE_CLASS.PUBLICATION_DRAIN_DETERMINISM]:
    'Publication owner missingPublishedCount > 0 without active scheduled reconcile tick',
});

// ═══════════════════════════════════════════════════════════════════
// 1. Per-failure-class owner-path regression
// ═══════════════════════════════════════════════════════════════════

// Hard invariant failure classes: gate must throw.
const HARD_FAILURE_CLASSES = Object.freeze([
  FAILURE_CLASS.DUAL_LEADER,
  FAILURE_CLASS.BACKWARD_STEP,
  FAILURE_CLASS.STALE_CLAIM,
  FAILURE_CLASS.TIMEOUT_BOUNDARY,
  FAILURE_CLASS.CDC_DIVERGENCE,
  FAILURE_CLASS.PUBLICATION_DRAIN_DETERMINISM,
]);

// Soft invariant failure classes: gate must NOT throw.
const SOFT_FAILURE_CLASSES = Object.freeze([
  FAILURE_CLASS.ORPHAN_OPERATION,
]);

for (const failureClassId of HARD_FAILURE_CLASSES) {
  test(`owner-path regression: ${failureClassId} — invariant ` +
    'violation detected and gate throws', async (t) => {
    t.teardown(() => clearRegistry());

    const invariantId = FAILURE_CLASS_INVARIANT_MAP[failureClassId];
    const testId = buildTestId(failureClassId);
    const state = STATE_BUILDERS[failureClassId]();

    // 1. Register the failure class.
    const entry = registerFailureClass({
      failureClassId,
      invariantId,
      description: FAILURE_CLASS_DESCRIPTIONS[failureClassId],
    });
    t.equal(entry.status, FAILURE_CLASS_STATUS.OPEN);

    // 2. Evaluate invariants against the violating snapshot.
    const results = evaluateInvariants(state);
    const matched = results.find(
      (r) => r.invariantId === invariantId,
    );
    t.ok(matched, `invariant ${invariantId} should be in results`);
    t.equal(matched.passed, false,
      `invariant ${invariantId} should fail`);
    t.equal(matched.severity, INVARIANT_OUTCOME_SEVERITY.HARD,
      `invariant ${invariantId} should be hard`);

    // 3. Assert the gate throws for this hard invariant.
    try {
      assertInvariantGate(results);
      t.fail('gate should have thrown');
    } catch (err) {
      t.equal(err.message, INVARIANT_GATE_ERROR_MESSAGE);
      t.ok(err.diagnosticsBundle);
      t.ok(err.diagnosticsBundle.summary.hardFailures >= 1);
    }

    // 4. Mark reproduced and then closed.
    markReproduced(failureClassId, testId);
    const closed = markClosed(failureClassId);
    t.equal(closed.status, FAILURE_CLASS_STATUS.CLOSED);

    // 5. Verify no longer in open classes.
    const open = getOpenFailureClasses();
    const stillOpen = open.some(
      (e) => e.failureClassId === failureClassId,
    );
    t.notOk(stillOpen,
      `${failureClassId} should not be in open classes`);
  });
}

for (const failureClassId of SOFT_FAILURE_CLASSES) {
  test(`owner-path regression: ${failureClassId} — invariant ` +
    'violation detected but gate does not throw (soft)',
  async (t) => {
    t.teardown(() => clearRegistry());

    const invariantId = FAILURE_CLASS_INVARIANT_MAP[failureClassId];
    const testId = buildTestId(failureClassId);
    const state = STATE_BUILDERS[failureClassId]();

    // 1. Register the failure class.
    const entry = registerFailureClass({
      failureClassId,
      invariantId,
      description: FAILURE_CLASS_DESCRIPTIONS[failureClassId],
    });
    t.equal(entry.status, FAILURE_CLASS_STATUS.OPEN);

    // 2. Evaluate invariants against the violating snapshot.
    const results = evaluateInvariants(state);
    const matched = results.find(
      (r) => r.invariantId === invariantId,
    );
    t.ok(matched, `invariant ${invariantId} should be in results`);
    t.equal(matched.passed, false,
      `invariant ${invariantId} should fail`);
    t.equal(matched.severity, INVARIANT_OUTCOME_SEVERITY.SOFT,
      `invariant ${invariantId} should be soft`);

    // 3. Gate must NOT throw for soft-only violations.
    assertInvariantGate(results);
    t.pass('gate did not throw on soft-only failure');

    // 4. Mark reproduced and then closed.
    markReproduced(failureClassId, testId);
    const closed = markClosed(failureClassId);
    t.equal(closed.status, FAILURE_CLASS_STATUS.CLOSED);

    // 5. Verify no longer in open classes.
    const open = getOpenFailureClasses();
    const stillOpen = open.some(
      (e) => e.failureClassId === failureClassId,
    );
    t.notOk(stillOpen,
      `${failureClassId} should not be in open classes`);
  });
}

// ═══════════════════════════════════════════════════════════════════
// 2. Closure requires all three: repro, regression, invariant
// ═══════════════════════════════════════════════════════════════════

test('closure requires reproduced status — cannot close open class',
  async (t) => {
    t.teardown(() => clearRegistry());

    // Register without a deterministic test ID → status is open.
    registerFailureClass({
      failureClassId: FAILURE_CLASS.DUAL_LEADER,
      invariantId: INVARIANT_ID.LEADER_UNIQUENESS,
      description: FAILURE_CLASS_DESCRIPTIONS[FAILURE_CLASS.DUAL_LEADER],
    });

    // Attempting to close an open class must throw.
    t.throws(() => markClosed(FAILURE_CLASS.DUAL_LEADER), {
      message:
        'Cannot close a failure class that is not in reproduced ' +
        'status',
    });

    // Must still be in open classes.
    const open = getOpenFailureClasses();
    t.ok(
      open.some(
        (e) => e.failureClassId === FAILURE_CLASS.DUAL_LEADER,
      ),
    );
  });

test('closure requires deterministic test ID — markReproduced ' +
  'rejects empty test ID', async (t) => {
  t.teardown(() => clearRegistry());

  registerFailureClass({
    failureClassId: FAILURE_CLASS.BACKWARD_STEP,
    invariantId: INVARIANT_ID.MONOTONIC_STEPS,
    description:
      FAILURE_CLASS_DESCRIPTIONS[FAILURE_CLASS.BACKWARD_STEP],
  });

  t.throws(
    () => markReproduced(FAILURE_CLASS.BACKWARD_STEP, ''),
    {
      message:
        'deterministicTestId is required and must be a ' +
        'non-empty string',
    },
  );
});

test('full closure lifecycle requires all three steps in order',
  async (t) => {
    t.teardown(() => clearRegistry());

    const classId = FAILURE_CLASS.STALE_CLAIM;
    const invariantId = INVARIANT_ID.CLAIM_EXCLUSIVITY;
    const testId = buildTestId(classId);

    // Step 1: Register (open, no repro).
    const entry = registerFailureClass({
      failureClassId: classId,
      invariantId,
      description: FAILURE_CLASS_DESCRIPTIONS[classId],
    });
    t.equal(entry.status, FAILURE_CLASS_STATUS.OPEN);

    // Cannot close without repro.
    t.throws(() => markClosed(classId));

    // Step 2: Deterministic repro — invariant violation confirmed.
    const state = STATE_BUILDERS[classId]();
    const results = evaluateInvariants(state);
    const matched = results.find(
      (r) => r.invariantId === invariantId,
    );
    t.equal(matched.passed, false);

    // Step 3: Owner-path regression — gate throws.
    try {
      assertInvariantGate(results);
      t.fail('gate should have thrown');
    } catch (err) {
      t.equal(err.message, INVARIANT_GATE_ERROR_MESSAGE);
    }

    // Step 4: Mark reproduced with test ID.
    markReproduced(classId, testId);

    // Step 5: Close.
    const closed = markClosed(classId);
    t.equal(closed.status, FAILURE_CLASS_STATUS.CLOSED);
    t.equal(closed.deterministicTestId, testId);

    // Verify removed from open classes.
    const open = getOpenFailureClasses();
    t.notOk(open.some((e) => e.failureClassId === classId));
  });
