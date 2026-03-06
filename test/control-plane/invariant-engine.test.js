import {test} from '../../src/test-helpers/tap.js';
import {
  checkLeaderUniqueness,
  checkMonotonicSteps,
  checkClaimExclusivity,
  checkOrphanInFlight,
  evaluateInvariants,
  isBackwardStep,
} from '../../src/control-plane/invariant-engine.js';
import {INVARIANT_ID} from '../../src/invariants/invariant-catalog.js';
import {
  INVARIANT_OUTCOME_SEVERITY,
  INVARIANT_REASON,
} from '../../src/control-plane/invariant-constants.js';

// ── Suite-local fixture constants ──────────────────────────────────
const FIXTURE_ENTITY_A = 'partition-1';
const FIXTURE_ENTITY_B = 'partition-2';
const FIXTURE_NODE_1 = 'node-1';
const FIXTURE_NODE_2 = 'node-2';
const FIXTURE_NODE_3 = 'node-3';
const FIXTURE_WORKFLOW_A = 'wf-a';
const FIXTURE_WORKFLOW_B = 'wf-b';
const FIXTURE_OP_1 = 'op-1';
const FIXTURE_OP_2 = 'op-2';
const FIXTURE_OWNER_KEY_A = 'owner-a';
const FIXTURE_OWNER_KEY_B = 'owner-b';
const STEP_1 = 1;
const STEP_2 = 2;
const STEP_3 = 3;
const STEP_STR_A = 'a_init';
const STEP_STR_B = 'b_execute';
const STEP_STR_C = 'c_finalize';

// ═══════════════════════════════════════════════════════════════════
// 1. Leader Uniqueness
// ═══════════════════════════════════════════════════════════════════

test('checkLeaderUniqueness passes when each entity has one leader',
  async (t) => {
    const result = checkLeaderUniqueness({
      leaderRows: [
        {entityId: FIXTURE_ENTITY_A, nodeId: FIXTURE_NODE_1},
        {entityId: FIXTURE_ENTITY_B, nodeId: FIXTURE_NODE_2},
      ],
    });

    t.equal(result.invariantId, INVARIANT_ID.LEADER_UNIQUENESS);
    t.equal(result.severity, INVARIANT_OUTCOME_SEVERITY.HARD);
    t.equal(result.passed, true);
    t.equal(result.reason, INVARIANT_REASON.LEADER_UNIQUE);
    t.equal(result.context, null);
    t.ok(Object.isFrozen(result));
  });

test('checkLeaderUniqueness fails when entity has multiple leaders',
  async (t) => {
    const result = checkLeaderUniqueness({
      leaderRows: [
        {entityId: FIXTURE_ENTITY_A, nodeId: FIXTURE_NODE_1},
        {entityId: FIXTURE_ENTITY_A, nodeId: FIXTURE_NODE_2},
        {entityId: FIXTURE_ENTITY_B, nodeId: FIXTURE_NODE_3},
      ],
    });

    t.equal(result.passed, false);
    t.equal(result.severity, INVARIANT_OUTCOME_SEVERITY.HARD);
    t.equal(result.reason, INVARIANT_REASON.DUPLICATE_LEADER_DETECTED);
    t.ok(result.context);
    t.equal(result.context.duplicates.length, 1);
    t.equal(result.context.duplicates[0].entityId, FIXTURE_ENTITY_A);
    t.same(
      result.context.duplicates[0].nodes,
      [FIXTURE_NODE_1, FIXTURE_NODE_2],
    );
  });

test('checkLeaderUniqueness passes on empty leader rows',
  async (t) => {
    const result = checkLeaderUniqueness({leaderRows: []});
    t.equal(result.passed, true);
    t.equal(result.reason, INVARIANT_REASON.LEADER_UNIQUE);
  });

test('checkLeaderUniqueness skips rows with missing entityId or nodeId',
  async (t) => {
    const result = checkLeaderUniqueness({
      leaderRows: [
        {entityId: '', nodeId: FIXTURE_NODE_1},
        {entityId: FIXTURE_ENTITY_A, nodeId: ''},
        {entityId: null, nodeId: FIXTURE_NODE_2},
        {nodeId: FIXTURE_NODE_3},
      ],
    });
    t.equal(result.passed, true);
  });

// ═══════════════════════════════════════════════════════════════════
// 2. Monotonic Steps
// ═══════════════════════════════════════════════════════════════════

test('checkMonotonicSteps passes on forward numeric transitions',
  async (t) => {
    const result = checkMonotonicSteps({
      workflows: [{
        workflowId: FIXTURE_WORKFLOW_A,
        transitionHistory: [
          {previousStep: STEP_1, nextStep: STEP_2},
          {previousStep: STEP_2, nextStep: STEP_3},
        ],
      }],
    });

    t.equal(result.invariantId, INVARIANT_ID.MONOTONIC_STEPS);
    t.equal(result.severity, INVARIANT_OUTCOME_SEVERITY.HARD);
    t.equal(result.passed, true);
    t.equal(result.reason, INVARIANT_REASON.STEPS_MONOTONIC);
  });

test('checkMonotonicSteps fails on backward numeric transition',
  async (t) => {
    const result = checkMonotonicSteps({
      workflows: [{
        workflowId: FIXTURE_WORKFLOW_A,
        transitionHistory: [
          {previousStep: STEP_1, nextStep: STEP_2},
          {previousStep: STEP_2, nextStep: STEP_1},
        ],
      }],
    });

    t.equal(result.passed, false);
    t.equal(result.reason, INVARIANT_REASON.BACKWARD_STEP_DETECTED);
    t.equal(result.context.violations.length, 1);
    t.equal(
      result.context.violations[0].workflowId,
      FIXTURE_WORKFLOW_A,
    );
    t.equal(result.context.violations[0].previousStep, STEP_2);
    t.equal(result.context.violations[0].nextStep, STEP_1);
  });

test('checkMonotonicSteps allows backward to terminal recovery step',
  async (t) => {
    const result = checkMonotonicSteps({
      workflows: [{
        workflowId: FIXTURE_WORKFLOW_A,
        terminalRecoverySteps: new Set([STEP_1]),
        transitionHistory: [
          {previousStep: STEP_2, nextStep: STEP_1},
        ],
      }],
    });

    t.equal(result.passed, true);
    t.equal(result.reason, INVARIANT_REASON.STEPS_MONOTONIC);
  });

test('checkMonotonicSteps passes on forward string transitions',
  async (t) => {
    const result = checkMonotonicSteps({
      workflows: [{
        workflowId: FIXTURE_WORKFLOW_B,
        transitionHistory: [
          {previousStep: STEP_STR_A, nextStep: STEP_STR_B},
          {previousStep: STEP_STR_B, nextStep: STEP_STR_C},
        ],
      }],
    });
    t.equal(result.passed, true);
  });

test('checkMonotonicSteps fails on backward string transition',
  async (t) => {
    const result = checkMonotonicSteps({
      workflows: [{
        workflowId: FIXTURE_WORKFLOW_B,
        transitionHistory: [
          {previousStep: STEP_STR_C, nextStep: STEP_STR_A},
        ],
      }],
    });
    t.equal(result.passed, false);
    t.equal(result.context.violations.length, 1);
  });

test('checkMonotonicSteps skips entries with null previous or next',
  async (t) => {
    const result = checkMonotonicSteps({
      workflows: [{
        workflowId: FIXTURE_WORKFLOW_A,
        transitionHistory: [
          {previousStep: null, nextStep: STEP_1},
          {previousStep: STEP_1, nextStep: null},
        ],
      }],
    });
    t.equal(result.passed, true);
  });

test('checkMonotonicSteps passes on empty workflows', async (t) => {
  const result = checkMonotonicSteps({workflows: []});
  t.equal(result.passed, true);
});

// ═══════════════════════════════════════════════════════════════════
// 3. Claim Exclusivity
// ═══════════════════════════════════════════════════════════════════

test('checkClaimExclusivity passes when all claims are unique',
  async (t) => {
    const result = checkClaimExclusivity({
      claims: [
        {operationId: FIXTURE_OP_1, ownerKey: FIXTURE_OWNER_KEY_A},
        {operationId: FIXTURE_OP_2, ownerKey: FIXTURE_OWNER_KEY_B},
      ],
    });

    t.equal(result.invariantId, INVARIANT_ID.CLAIM_EXCLUSIVITY);
    t.equal(result.severity, INVARIANT_OUTCOME_SEVERITY.HARD);
    t.equal(result.passed, true);
    t.equal(result.reason, INVARIANT_REASON.CLAIMS_EXCLUSIVE);
  });

test('checkClaimExclusivity fails on duplicate claim', async (t) => {
  const result = checkClaimExclusivity({
    claims: [
      {operationId: FIXTURE_OP_1, ownerKey: FIXTURE_OWNER_KEY_A},
      {operationId: FIXTURE_OP_1, ownerKey: FIXTURE_OWNER_KEY_A},
    ],
  });

  t.equal(result.passed, false);
  t.equal(result.reason, INVARIANT_REASON.DUPLICATE_CLAIM_DETECTED);
  t.equal(result.context.duplicates.length, 1);
  t.equal(
    result.context.duplicates[0].operationId,
    FIXTURE_OP_1,
  );
  t.equal(
    result.context.duplicates[0].ownerKey,
    FIXTURE_OWNER_KEY_A,
  );
});

test('checkClaimExclusivity allows same op with different owner keys',
  async (t) => {
    const result = checkClaimExclusivity({
      claims: [
        {operationId: FIXTURE_OP_1, ownerKey: FIXTURE_OWNER_KEY_A},
        {operationId: FIXTURE_OP_1, ownerKey: FIXTURE_OWNER_KEY_B},
      ],
    });
    t.equal(result.passed, true);
  });

test('checkClaimExclusivity skips claims with missing fields',
  async (t) => {
    const result = checkClaimExclusivity({
      claims: [
        {operationId: '', ownerKey: FIXTURE_OWNER_KEY_A},
        {operationId: FIXTURE_OP_1, ownerKey: ''},
        {ownerKey: FIXTURE_OWNER_KEY_A},
      ],
    });
    t.equal(result.passed, true);
  });

test('checkClaimExclusivity passes on empty claims', async (t) => {
  const result = checkClaimExclusivity({claims: []});
  t.equal(result.passed, true);
});

// ═══════════════════════════════════════════════════════════════════
// 4. Orphan In-Flight
// ═══════════════════════════════════════════════════════════════════

test('checkOrphanInFlight passes when all ops have registered owners',
  async (t) => {
    const result = checkOrphanInFlight({
      inFlightOperations: [
        {operationId: FIXTURE_OP_1, ownerKey: FIXTURE_OWNER_KEY_A},
        {operationId: FIXTURE_OP_2, ownerKey: FIXTURE_OWNER_KEY_B},
      ],
      registeredOwnerKeys: new Set([
        FIXTURE_OWNER_KEY_A,
        FIXTURE_OWNER_KEY_B,
      ]),
    });

    t.equal(result.invariantId, INVARIANT_ID.ORPHAN_IN_FLIGHT);
    t.equal(result.severity, INVARIANT_OUTCOME_SEVERITY.SOFT);
    t.equal(result.passed, true);
    t.equal(result.reason, INVARIANT_REASON.NO_ORPHANS);
  });

test('checkOrphanInFlight fails when op has unregistered owner key',
  async (t) => {
    const result = checkOrphanInFlight({
      inFlightOperations: [
        {operationId: FIXTURE_OP_1, ownerKey: FIXTURE_OWNER_KEY_A},
        {operationId: FIXTURE_OP_2, ownerKey: FIXTURE_OWNER_KEY_B},
      ],
      registeredOwnerKeys: new Set([FIXTURE_OWNER_KEY_A]),
    });

    t.equal(result.passed, false);
    t.equal(result.reason, INVARIANT_REASON.ORPHAN_DETECTED);
    t.equal(result.context.orphans.length, 1);
    t.equal(result.context.orphans[0].operationId, FIXTURE_OP_2);
    t.equal(result.context.orphans[0].ownerKey, FIXTURE_OWNER_KEY_B);
  });

test('checkOrphanInFlight fails when op has no owner key',
  async (t) => {
    const result = checkOrphanInFlight({
      inFlightOperations: [
        {operationId: FIXTURE_OP_1},
      ],
      registeredOwnerKeys: new Set([FIXTURE_OWNER_KEY_A]),
    });

    t.equal(result.passed, false);
    t.equal(result.context.orphans.length, 1);
    t.equal(result.context.orphans[0].ownerKey, null);
  });

test('checkOrphanInFlight passes on empty operations', async (t) => {
  const result = checkOrphanInFlight({
    inFlightOperations: [],
    registeredOwnerKeys: new Set(),
  });
  t.equal(result.passed, true);
});

// ═══════════════════════════════════════════════════════════════════
// 5. isBackwardStep helper
// ═══════════════════════════════════════════════════════════════════

test('isBackwardStep detects numeric backward', async (t) => {
  t.equal(isBackwardStep(STEP_3, STEP_1), true);
  t.equal(isBackwardStep(STEP_1, STEP_3), false);
  t.equal(isBackwardStep(STEP_2, STEP_2), false);
});

test('isBackwardStep detects string backward', async (t) => {
  t.equal(isBackwardStep(STEP_STR_C, STEP_STR_A), true);
  t.equal(isBackwardStep(STEP_STR_A, STEP_STR_C), false);
  t.equal(isBackwardStep(STEP_STR_B, STEP_STR_B), false);
});

// ═══════════════════════════════════════════════════════════════════
// 6. evaluateInvariants — full set evaluation
// ═══════════════════════════════════════════════════════════════════

test('evaluateInvariants returns all four invariant results on ' +
  'valid state', async (t) => {
  const results = evaluateInvariants({
    leaderRows: [
      {entityId: FIXTURE_ENTITY_A, nodeId: FIXTURE_NODE_1},
    ],
    workflows: [{
      workflowId: FIXTURE_WORKFLOW_A,
      transitionHistory: [
        {previousStep: STEP_1, nextStep: STEP_2},
      ],
    }],
    claims: [
      {operationId: FIXTURE_OP_1, ownerKey: FIXTURE_OWNER_KEY_A},
    ],
    inFlightOperations: [
      {operationId: FIXTURE_OP_1, ownerKey: FIXTURE_OWNER_KEY_A},
    ],
    registeredOwnerKeys: new Set([FIXTURE_OWNER_KEY_A]),
  });

  t.equal(results.length, 4);
  t.ok(Object.isFrozen(results));

  const ids = results.map((r) => r.invariantId);
  t.ok(ids.includes(INVARIANT_ID.LEADER_UNIQUENESS));
  t.ok(ids.includes(INVARIANT_ID.MONOTONIC_STEPS));
  t.ok(ids.includes(INVARIANT_ID.CLAIM_EXCLUSIVITY));
  t.ok(ids.includes(INVARIANT_ID.ORPHAN_IN_FLIGHT));

  for (const result of results) {
    t.equal(result.passed, true, `${result.invariantId} should pass`);
  }
});

test('evaluateInvariants detects multiple violations in one call',
  async (t) => {
    const results = evaluateInvariants({
      leaderRows: [
        {entityId: FIXTURE_ENTITY_A, nodeId: FIXTURE_NODE_1},
        {entityId: FIXTURE_ENTITY_A, nodeId: FIXTURE_NODE_2},
      ],
      workflows: [{
        workflowId: FIXTURE_WORKFLOW_A,
        transitionHistory: [
          {previousStep: STEP_3, nextStep: STEP_1},
        ],
      }],
      claims: [
        {operationId: FIXTURE_OP_1, ownerKey: FIXTURE_OWNER_KEY_A},
        {operationId: FIXTURE_OP_1, ownerKey: FIXTURE_OWNER_KEY_A},
      ],
      inFlightOperations: [
        {operationId: FIXTURE_OP_2, ownerKey: FIXTURE_OWNER_KEY_B},
      ],
      registeredOwnerKeys: new Set(),
    });

    t.equal(results.length, 4);
    const failed = results.filter((r) => !r.passed);
    t.equal(failed.length, 4, 'all four invariants should fail');
  });

test('evaluateInvariants handles null/undefined state gracefully',
  async (t) => {
    const results = evaluateInvariants(null);
    t.equal(results.length, 4);
    for (const result of results) {
      t.equal(result.passed, true);
    }
  });

// ═══════════════════════════════════════════════════════════════════
// 7. buildInvariantDiagnosticsBundle
// ═══════════════════════════════════════════════════════════════════

import {
  buildInvariantDiagnosticsBundle,
} from '../../src/control-plane/invariant-engine.js';
import {
  INVARIANT_BUNDLE_FIELD,
} from '../../src/control-plane/invariant-constants.js';

const FIXTURE_OWNER_KEY_DIAG = 'owner-diag-1';
const FIXTURE_OP_DIAG = 'op-diag-1';

test('buildInvariantDiagnosticsBundle summarizes all-passing results',
  async (t) => {
    const results = evaluateInvariants({
      leaderRows: [
        {entityId: FIXTURE_ENTITY_A, nodeId: FIXTURE_NODE_1},
      ],
      workflows: [{
        workflowId: FIXTURE_WORKFLOW_A,
        transitionHistory: [
          {previousStep: STEP_1, nextStep: STEP_2},
        ],
      }],
      claims: [
        {operationId: FIXTURE_OP_1, ownerKey: FIXTURE_OWNER_KEY_A},
      ],
      inFlightOperations: [
        {operationId: FIXTURE_OP_1, ownerKey: FIXTURE_OWNER_KEY_A},
      ],
      registeredOwnerKeys: new Set([FIXTURE_OWNER_KEY_A]),
    });

    const bundle = buildInvariantDiagnosticsBundle(results);

    t.ok(Object.isFrozen(bundle));
    t.equal(bundle.summary.total, 4);
    t.equal(bundle.summary.passed, 4);
    t.equal(bundle.summary.failed, 0);
    t.equal(bundle.summary.hardFailures, 0);
    t.equal(bundle.summary.softFailures, 0);
    t.equal(bundle.breaches.length, 0);
    t.ok(Object.isFrozen(bundle.breaches));
    t.ok(typeof bundle.timestamp === 'number');
  });

test('buildInvariantDiagnosticsBundle separates hard and soft failures',
  async (t) => {
    const results = evaluateInvariants({
      leaderRows: [
        {entityId: FIXTURE_ENTITY_A, nodeId: FIXTURE_NODE_1},
        {entityId: FIXTURE_ENTITY_A, nodeId: FIXTURE_NODE_2},
      ],
      workflows: [],
      claims: [],
      inFlightOperations: [
        {operationId: FIXTURE_OP_1},
      ],
      registeredOwnerKeys: new Set(),
    });

    const bundle = buildInvariantDiagnosticsBundle(results);

    t.equal(bundle.summary.total, 4);
    t.equal(bundle.summary.passed, 2);
    t.equal(bundle.summary.failed, 2);
    t.equal(bundle.summary.hardFailures, 1);
    t.equal(bundle.summary.softFailures, 1);
    t.equal(bundle.breaches.length, 2);
  });

test('buildInvariantDiagnosticsBundle includes breach context with ' +
  'owner key and operation id', async (t) => {
  const results = [
    {
      invariantId: INVARIANT_ID.CLAIM_EXCLUSIVITY,
      severity: INVARIANT_OUTCOME_SEVERITY.HARD,
      passed: false,
      reason: INVARIANT_REASON.DUPLICATE_CLAIM_DETECTED,
      context: {
        ownerKey: FIXTURE_OWNER_KEY_DIAG,
        operationId: FIXTURE_OP_DIAG,
        duplicates: [{
          operationId: FIXTURE_OP_DIAG,
          ownerKey: FIXTURE_OWNER_KEY_DIAG,
        }],
      },
    },
  ];

  const bundle = buildInvariantDiagnosticsBundle(results);

  t.equal(bundle.breaches.length, 1);
  const breach = bundle.breaches[0];
  t.equal(breach.invariantId, INVARIANT_ID.CLAIM_EXCLUSIVITY);
  t.equal(breach.severity, INVARIANT_OUTCOME_SEVERITY.HARD);
  t.equal(breach.reason, INVARIANT_REASON.DUPLICATE_CLAIM_DETECTED);
  t.equal(breach.ownerKey, FIXTURE_OWNER_KEY_DIAG);
  t.equal(breach.operationId, FIXTURE_OP_DIAG);
  t.ok(breach.context);
  t.ok(Object.isFrozen(breach));
  t.ok(Object.isFrozen(breach.context));
});

test('buildInvariantDiagnosticsBundle handles null owner key and ' +
  'operation id in context', async (t) => {
  const results = [
    {
      invariantId: INVARIANT_ID.LEADER_UNIQUENESS,
      severity: INVARIANT_OUTCOME_SEVERITY.HARD,
      passed: false,
      reason: INVARIANT_REASON.DUPLICATE_LEADER_DETECTED,
      context: {
        duplicates: [{
          entityId: FIXTURE_ENTITY_A,
          nodes: [FIXTURE_NODE_1, FIXTURE_NODE_2],
        }],
      },
    },
  ];

  const bundle = buildInvariantDiagnosticsBundle(results);

  t.equal(bundle.breaches.length, 1);
  t.equal(bundle.breaches[0].ownerKey, null);
  t.equal(bundle.breaches[0].operationId, null);
});

test('buildInvariantDiagnosticsBundle handles empty results array',
  async (t) => {
    const bundle = buildInvariantDiagnosticsBundle([]);

    t.equal(bundle.summary.total, 0);
    t.equal(bundle.summary.passed, 0);
    t.equal(bundle.summary.failed, 0);
    t.equal(bundle.summary.hardFailures, 0);
    t.equal(bundle.summary.softFailures, 0);
    t.equal(bundle.breaches.length, 0);
  });

test('buildInvariantDiagnosticsBundle handles null input gracefully',
  async (t) => {
    const bundle = buildInvariantDiagnosticsBundle(null);

    t.equal(bundle.summary.total, 0);
    t.equal(bundle.summary.passed, 0);
    t.equal(bundle.summary.failed, 0);
    t.equal(bundle.breaches.length, 0);
  });

test('buildInvariantDiagnosticsBundle uses INVARIANT_BUNDLE_FIELD ' +
  'constants for field names', async (t) => {
  const bundle = buildInvariantDiagnosticsBundle([]);

  t.ok(INVARIANT_BUNDLE_FIELD.SUMMARY in bundle);
  t.ok(INVARIANT_BUNDLE_FIELD.BREACHES in bundle);
  t.ok(INVARIANT_BUNDLE_FIELD.TIMESTAMP in bundle);
  t.ok(INVARIANT_BUNDLE_FIELD.TOTAL in bundle.summary);
  t.ok(INVARIANT_BUNDLE_FIELD.PASSED in bundle.summary);
  t.ok(INVARIANT_BUNDLE_FIELD.FAILED in bundle.summary);
  t.ok(INVARIANT_BUNDLE_FIELD.HARD_FAILURES in bundle.summary);
  t.ok(INVARIANT_BUNDLE_FIELD.SOFT_FAILURES in bundle.summary);
});

// ═══════════════════════════════════════════════════════════════════
// 8. assertInvariantGate — deterministic hard invariant gate
// ═══════════════════════════════════════════════════════════════════

import {
  assertInvariantGate,
} from '../../src/control-plane/invariant-engine.js';
import {
  INVARIANT_GATE_ERROR_MESSAGE,
} from '../../src/control-plane/invariant-constants.js';

test('assertInvariantGate passes when all invariants pass',
  async (t) => {
    const results = evaluateInvariants({
      leaderRows: [
        {entityId: FIXTURE_ENTITY_A, nodeId: FIXTURE_NODE_1},
      ],
      workflows: [{
        workflowId: FIXTURE_WORKFLOW_A,
        transitionHistory: [
          {previousStep: STEP_1, nextStep: STEP_2},
        ],
      }],
      claims: [
        {operationId: FIXTURE_OP_1, ownerKey: FIXTURE_OWNER_KEY_A},
      ],
      inFlightOperations: [
        {operationId: FIXTURE_OP_1, ownerKey: FIXTURE_OWNER_KEY_A},
      ],
      registeredOwnerKeys: new Set([FIXTURE_OWNER_KEY_A]),
    });

    assertInvariantGate(results);
    t.pass('gate did not throw on all-passing results');
  });

test('assertInvariantGate throws on leader uniqueness violation',
  async (t) => {
    const results = evaluateInvariants({
      leaderRows: [
        {entityId: FIXTURE_ENTITY_A, nodeId: FIXTURE_NODE_1},
        {entityId: FIXTURE_ENTITY_A, nodeId: FIXTURE_NODE_2},
      ],
      workflows: [],
      claims: [],
      inFlightOperations: [],
      registeredOwnerKeys: new Set(),
    });

    try {
      assertInvariantGate(results);
      t.fail('gate should have thrown');
    } catch (err) {
      t.equal(err.message, INVARIANT_GATE_ERROR_MESSAGE);
      t.ok(err.diagnosticsBundle);
      t.ok(
        err.diagnosticsBundle.summary.hardFailures >= 1,
        'should report at least one hard failure',
      );
    }
  });

test('assertInvariantGate throws on monotonic steps violation',
  async (t) => {
    const results = evaluateInvariants({
      leaderRows: [
        {entityId: FIXTURE_ENTITY_A, nodeId: FIXTURE_NODE_1},
      ],
      workflows: [{
        workflowId: FIXTURE_WORKFLOW_A,
        transitionHistory: [
          {previousStep: STEP_3, nextStep: STEP_1},
        ],
      }],
      claims: [],
      inFlightOperations: [],
      registeredOwnerKeys: new Set(),
    });

    try {
      assertInvariantGate(results);
      t.fail('gate should have thrown');
    } catch (err) {
      t.equal(err.message, INVARIANT_GATE_ERROR_MESSAGE);
      t.ok(err.diagnosticsBundle);
      t.ok(
        err.diagnosticsBundle.summary.hardFailures >= 1,
        'should report at least one hard failure',
      );
    }
  });

test('assertInvariantGate throws on claim exclusivity violation',
  async (t) => {
    const results = evaluateInvariants({
      leaderRows: [
        {entityId: FIXTURE_ENTITY_A, nodeId: FIXTURE_NODE_1},
      ],
      workflows: [],
      claims: [
        {operationId: FIXTURE_OP_1, ownerKey: FIXTURE_OWNER_KEY_A},
        {operationId: FIXTURE_OP_1, ownerKey: FIXTURE_OWNER_KEY_A},
      ],
      inFlightOperations: [],
      registeredOwnerKeys: new Set(),
    });

    try {
      assertInvariantGate(results);
      t.fail('gate should have thrown');
    } catch (err) {
      t.equal(err.message, INVARIANT_GATE_ERROR_MESSAGE);
      t.ok(err.diagnosticsBundle);
      t.ok(
        err.diagnosticsBundle.summary.hardFailures >= 1,
        'should report at least one hard failure',
      );
    }
  });

test('assertInvariantGate does NOT throw on orphan in-flight ' +
  'violation alone', async (t) => {
  const results = evaluateInvariants({
    leaderRows: [
      {entityId: FIXTURE_ENTITY_A, nodeId: FIXTURE_NODE_1},
    ],
    workflows: [],
    claims: [],
    inFlightOperations: [
      {operationId: FIXTURE_OP_1},
    ],
    registeredOwnerKeys: new Set(),
  });

  // Verify orphan actually failed (soft) but gate does not throw.
  const orphanResult = results.find(
    (r) => r.invariantId === INVARIANT_ID.ORPHAN_IN_FLIGHT,
  );
  t.equal(orphanResult.passed, false, 'orphan invariant should fail');
  t.equal(
    orphanResult.severity,
    INVARIANT_OUTCOME_SEVERITY.SOFT,
    'orphan invariant is soft',
  );

  assertInvariantGate(results);
  t.pass('gate did not throw on soft-only failure');
});

test('assertInvariantGate error includes diagnostics bundle with ' +
  'breach details', async (t) => {
  const results = evaluateInvariants({
    leaderRows: [
      {entityId: FIXTURE_ENTITY_A, nodeId: FIXTURE_NODE_1},
      {entityId: FIXTURE_ENTITY_A, nodeId: FIXTURE_NODE_2},
    ],
    workflows: [{
      workflowId: FIXTURE_WORKFLOW_A,
      transitionHistory: [
        {previousStep: STEP_3, nextStep: STEP_1},
      ],
    }],
    claims: [
      {operationId: FIXTURE_OP_1, ownerKey: FIXTURE_OWNER_KEY_A},
      {operationId: FIXTURE_OP_1, ownerKey: FIXTURE_OWNER_KEY_A},
    ],
    inFlightOperations: [],
    registeredOwnerKeys: new Set(),
  });

  try {
    assertInvariantGate(results);
    t.fail('gate should have thrown');
  } catch (err) {
    t.equal(err.message, INVARIANT_GATE_ERROR_MESSAGE);
    const bundle = err.diagnosticsBundle;
    t.ok(bundle, 'error should have diagnosticsBundle');
    t.ok(Object.isFrozen(bundle), 'bundle should be frozen');

    // Three hard invariants failed.
    t.equal(bundle.summary.hardFailures, 3);
    t.equal(bundle.breaches.length, 3);

    const breachIds = bundle.breaches.map((b) => b.invariantId);
    t.ok(
      breachIds.includes(INVARIANT_ID.LEADER_UNIQUENESS),
      'breaches include leader uniqueness',
    );
    t.ok(
      breachIds.includes(INVARIANT_ID.MONOTONIC_STEPS),
      'breaches include monotonic steps',
    );
    t.ok(
      breachIds.includes(INVARIANT_ID.CLAIM_EXCLUSIVITY),
      'breaches include claim exclusivity',
    );

    // Each breach has context.
    for (const breach of bundle.breaches) {
      t.equal(
        breach.severity,
        INVARIANT_OUTCOME_SEVERITY.HARD,
        `${breach.invariantId} breach is hard`,
      );
      t.ok(breach.context, `${breach.invariantId} breach has context`);
    }

    t.ok(
      typeof bundle.timestamp === 'number',
      'bundle has numeric timestamp',
    );
  }
});
