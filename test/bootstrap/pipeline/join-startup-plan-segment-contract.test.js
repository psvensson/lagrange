/**
 * Characterization and contract tests for join startup plan segments.
 *
 * These tests lock the current shape of createJoinStartupPlan() and define
 * the contract that named segments must satisfy once implemented (Task 16).
 * Tests for named segments and fast-fail validation will initially fail
 * because the implementation does not yet exist — that is expected and
 * correct for Phase 1 characterization.
 *
 * Requirements: 3.1, 3.3, 9.2
 * Design: D4.1, D4.3, D11.1
 */

import {test} from '../../../src/test-helpers/tap.js';
import {
  READINESS_CONVERGENCE_PHASE,
  createJoinStartupPlan,
} from '../../../src/bootstrap/pipeline/join-startup-plan.js';
import {
  JOIN_PLAN_SEGMENT,
  JOINING_PHASE,
} from '../../../src/bootstrap/bootstrap-constants.js';

// -- Suite-local fixture constants --

const EXPECTED_PHASE_COUNT = 6;

/**
 * Expected phase names in the current join startup plan, in order.
 * The message-group-assignment phase uses a composite name because
 * the actual phase emitted depends on the assignment strategy.
 */
const EXPECTED_PHASE_NAMES = Object.freeze([
  JOINING_PHASE.CONTACTING_SEED,
  JOINING_PHASE.CONNECTING_WEBSOCKET,
  'joining:message-group-assignment',
  JOINING_PHASE.WAITING_LEADERSHIP,
  JOINING_PHASE.QUERYING_STATE,
  READINESS_CONVERGENCE_PHASE,
]);

/**
 * Required named segment keys per design D4.1.
 * Uses the canonical JOIN_PLAN_SEGMENT constants from bootstrap-constants.
 */
const REQUIRED_SEGMENT_NAMES = Object.freeze([
  JOIN_PLAN_SEGMENT.SEED_CONTACT,
  JOIN_PLAN_SEGMENT.INFRASTRUCTURE,
  JOIN_PLAN_SEGMENT.MEMBERSHIP,
  JOIN_PLAN_SEGMENT.READINESS,
]);

/**
 * Build a minimal stub service that satisfies createJoinStartupPlan
 * without requiring real NodeJoiningService construction.
 * @return {Object} Stub service with executePhase and joiningPhaseOwners.
 */
function buildStubJoinService() {
  return {
    executePhase(_phaseName, phaseFunction) {
      return phaseFunction();
    },
    joiningPhaseOwners: {
      contactSeed: async () => {},
      connectWebSocket: async () => {},
      createSelfHostedMessageGroup: async () => {},
      joinExistingMessageGroup: async () => {},
      waitForLeadership: async () => {},
      querySystemState: async () => {},
    },
    joinReadinessEvaluator: {
      waitForCanonicalJoinReadinessConvergence: async () => {},
    },
    bootstrapResponse: {
      messageGroupAssignment: {
        strategy: 'CREATE_SELF_HOSTED',
        groupId: 'mg-stub',
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Characterization: current plan shape (uses createJoinStartupPlan owner)
// ---------------------------------------------------------------------------

test('createJoinStartupPlan - produces expected number of phases', async (t) => {
  const service = buildStubJoinService();
  const plan = createJoinStartupPlan(service);

  t.ok(Array.isArray(plan.phases), 'plan.phases should be an array');
  t.equal(
    plan.phases.length,
    EXPECTED_PHASE_COUNT,
    `plan should contain exactly ${EXPECTED_PHASE_COUNT} phases`,
  );
});

test('createJoinStartupPlan - phase names match expected order', async (t) => {
  const service = buildStubJoinService();
  const plan = createJoinStartupPlan(service);

  const phaseNames = plan.phases.map((phase) => phase.name);
  t.same(
    phaseNames,
    [...EXPECTED_PHASE_NAMES],
    'phase names should match the canonical join plan order',
  );
});

test('createJoinStartupPlan - every phase has a name and run function', async (t) => {
  const service = buildStubJoinService();
  const plan = createJoinStartupPlan(service);

  for (let i = 0; i < plan.phases.length; i++) {
    const phase = plan.phases[i];
    t.ok(
      typeof phase.name === 'string' && phase.name.length > 0,
      `phase[${i}] should have a non-empty name`,
    );
    t.ok(
      typeof phase.run === 'function',
      `phase[${i}] (${phase.name}) should have a run function`,
    );
  }
});

test('createJoinStartupPlan - phases are executable without error', async (t) => {
  const service = buildStubJoinService();
  const plan = createJoinStartupPlan(service);

  for (const phase of plan.phases) {
    await t.resolves(
      Promise.resolve(phase.run()),
      `phase ${phase.name} should execute without throwing`,
    );
  }
});

// ---------------------------------------------------------------------------
// Contract: named segments (Req 3.1, Design D4.1)
// These tests define the contract that Task 16 must satisfy.
// They will fail until named segments are added to the plan.
// ---------------------------------------------------------------------------

test('createJoinStartupPlan - plan exposes segments object', async (t) => {
  const service = buildStubJoinService();
  const plan = createJoinStartupPlan(service);

  t.ok(
    plan.segments !== null &&
      plan.segments !== undefined &&
      typeof plan.segments === 'object',
    'plan should expose a segments object (Req 3.1, D4.1)',
  );
});

test('createJoinStartupPlan - segments contain all required names', async (t) => {
  const service = buildStubJoinService();
  const plan = createJoinStartupPlan(service);

  // Guard: segments must exist before checking keys
  if (!plan.segments || typeof plan.segments !== 'object') {
    t.fail('plan.segments is missing — cannot verify segment names');
    return;
  }

  const segmentKeys = Object.keys(plan.segments);
  for (const requiredName of REQUIRED_SEGMENT_NAMES) {
    t.ok(
      segmentKeys.includes(requiredName),
      `segments should include required key "${requiredName}" (Req 3.1)`,
    );
  }
});

test('createJoinStartupPlan - each segment is a non-empty array of phases', async (t) => {
  const service = buildStubJoinService();
  const plan = createJoinStartupPlan(service);

  if (!plan.segments || typeof plan.segments !== 'object') {
    t.fail('plan.segments is missing — cannot verify segment contents');
    return;
  }

  for (const segmentName of REQUIRED_SEGMENT_NAMES) {
    const segment = plan.segments[segmentName];
    t.ok(
      Array.isArray(segment) && segment.length > 0,
      `segment "${segmentName}" should be a non-empty array (D4.1)`,
    );
  }
});

test('createJoinStartupPlan - membership and readiness segments do not alias the same phase', async (t) => {
  const service = buildStubJoinService();
  const plan = createJoinStartupPlan(service);

  t.not(
    plan.segments[JOIN_PLAN_SEGMENT.MEMBERSHIP][0],
    plan.segments[JOIN_PLAN_SEGMENT.READINESS][0],
    'membership and readiness should be anchored to distinct phase objects',
  );
  t.equal(
    plan.segments[JOIN_PLAN_SEGMENT.READINESS][0]?.name,
    READINESS_CONVERGENCE_PHASE,
    'readiness should expose its own convergence phase',
  );
});

// ---------------------------------------------------------------------------
// Contract: fast-fail validation (Req 3.3, Design D4.3)
// These tests define the contract that Task 18 must satisfy.
// They will fail until assertJoinPlanSegments is implemented.
// ---------------------------------------------------------------------------

test('assertJoinPlanSegments - is importable from join-startup-plan', async (t) => {
  let assertFn;
  try {
    const mod =
      await import('../../../src/bootstrap/pipeline/join-startup-plan.js');
    assertFn = mod.assertJoinPlanSegments;
  } catch (_importError) {
    // Import itself may fail if module shape changes; that is fine.
  }

  t.ok(
    typeof assertFn === 'function',
    'assertJoinPlanSegments should be an exported function (Req 3.3, D4.3)',
  );
});

test('assertJoinPlanSegments - throws when a required segment is missing', async (t) => {
  let assertFn;
  try {
    const mod =
      await import('../../../src/bootstrap/pipeline/join-startup-plan.js');
    assertFn = mod.assertJoinPlanSegments;
  } catch (_importError) {
    t.fail('could not import join-startup-plan module');
    return;
  }

  if (typeof assertFn !== 'function') {
    t.fail('assertJoinPlanSegments is not yet exported — expected for Phase 1');
    return;
  }

  // Build a plan with one required segment deliberately removed
  const incompleteSegments = {};
  for (const name of REQUIRED_SEGMENT_NAMES) {
    incompleteSegments[name] = [{name: `stub-${name}`, run: async () => {}}];
  }
  // Remove one segment to trigger fast-fail
  delete incompleteSegments[REQUIRED_SEGMENT_NAMES[0]];

  const incompletePlan = {
    phases: [],
    segments: incompleteSegments,
  };

  t.throws(
    () => assertFn(incompletePlan),
    'should throw when a required segment is missing (Req 3.3)',
  );
});

test('assertJoinPlanSegments - throws when a required segment is empty', async (t) => {
  let assertFn;
  try {
    const mod =
      await import('../../../src/bootstrap/pipeline/join-startup-plan.js');
    assertFn = mod.assertJoinPlanSegments;
  } catch (_importError) {
    t.fail('could not import join-startup-plan module');
    return;
  }

  if (typeof assertFn !== 'function') {
    t.fail('assertJoinPlanSegments is not yet exported — expected for Phase 1');
    return;
  }

  // Build a plan with one required segment set to empty array
  const emptySegmentPlan = {
    phases: [],
    segments: {},
  };
  for (const name of REQUIRED_SEGMENT_NAMES) {
    emptySegmentPlan.segments[name] = [
      {name: `stub-${name}`, run: async () => {}},
    ];
  }
  // Make one segment empty to trigger fast-fail
  emptySegmentPlan.segments[REQUIRED_SEGMENT_NAMES[0]] = [];

  t.throws(
    () => assertFn(emptySegmentPlan),
    'should throw when a required segment is empty (Req 3.3, D4.3)',
  );
});

test('assertJoinPlanSegments - does not throw for a valid complete plan', async (t) => {
  let assertFn;
  try {
    const mod =
      await import('../../../src/bootstrap/pipeline/join-startup-plan.js');
    assertFn = mod.assertJoinPlanSegments;
  } catch (_importError) {
    t.fail('could not import join-startup-plan module');
    return;
  }

  if (typeof assertFn !== 'function') {
    t.fail('assertJoinPlanSegments is not yet exported — expected for Phase 1');
    return;
  }

  const validPlan = {
    phases: [],
    segments: {},
  };
  for (const name of REQUIRED_SEGMENT_NAMES) {
    validPlan.segments[name] = [{name: `stub-${name}`, run: async () => {}}];
  }

  t.doesNotThrow(
    () => assertFn(validPlan),
    'should not throw when all required segments are present and non-empty',
  );
});
