import {test} from '../../src/test-helpers/tap.js';
import {
  MEMBERSHIP_OWNER_OUTCOME_TYPE,
  MEMBERSHIP_OWNER_REASON,
  STARTUP_JOIN_MODE,
  TOPOLOGY_MEMBERSHIP_OWNER_CONTRACT,
} from '../../src/bootstrap/rejoin-hints-constants.js';
import {
  buildMembershipOwnerOutcome,
  MembershipLifecycleController,
  MEMBERSHIP_LIFECYCLE_INTENT,
  resolveMembershipOwnerOutcomeType,
  resolveMembershipJoinIntentType,
} from '../../src/control-plane/membership-lifecycle-controller.js';
import {
  MEMBERSHIP_LIFECYCLE_STATE,
  NODE_PARTICIPATION_ADMISSION_STATE,
  NODE_PARTICIPATION_STATE,
  NODE_RUNTIME_PARTICIPATION_STATE,
  RECOVERY_PROTOCOL_STATE,
  buildNodeRuntimeParticipationProjection,
  isNodeRuntimeParticipationBlocked,
} from '../../src/control-plane/membership-lifecycle-constants.js';

const TEST_INVALID_STARTUP_MODE = 'bogus';

test('MembershipLifecycleController resolves join and durable rejoin intent types canonically', async (t) => {
  t.equal(
    resolveMembershipJoinIntentType(STARTUP_JOIN_MODE.FRESH_JOIN),
    MEMBERSHIP_LIFECYCLE_INTENT.JOIN_ADMISSION,
  );
  t.equal(
    resolveMembershipJoinIntentType(STARTUP_JOIN_MODE.DURABLE_REJOIN),
    MEMBERSHIP_LIFECYCLE_INTENT.RESTART_REENTRY,
  );
  t.equal(
    resolveMembershipOwnerOutcomeType(STARTUP_JOIN_MODE.DURABLE_REJOIN),
    MEMBERSHIP_OWNER_OUTCOME_TYPE.RESTART_REENTRY,
  );
});

test('MembershipLifecycleController fails closed on invalid startup mode', async (t) => {
  const outcome = buildMembershipOwnerOutcome({
    startupMode: TEST_INVALID_STARTUP_MODE,
  });

  t.match(outcome, {
    semanticOwner: TOPOLOGY_MEMBERSHIP_OWNER_CONTRACT.SEMANTIC_OWNER,
    boundary: TOPOLOGY_MEMBERSHIP_OWNER_CONTRACT.BOUNDARY,
    outcomeType: MEMBERSHIP_OWNER_OUTCOME_TYPE.BLOCKED_STARTUP,
    startupMode: STARTUP_JOIN_MODE.FRESH_JOIN,
    reasonCode: MEMBERSHIP_OWNER_REASON.INVALID_STARTUP_MODE,
  });
  t.equal(
    resolveMembershipOwnerOutcomeType(TEST_INVALID_STARTUP_MODE),
    MEMBERSHIP_OWNER_OUTCOME_TYPE.BLOCKED_STARTUP,
  );
  t.equal(
    resolveMembershipJoinIntentType(TEST_INVALID_STARTUP_MODE),
    MEMBERSHIP_LIFECYCLE_INTENT.JOIN_ADMISSION,
  );
});

test('MembershipLifecycleController delegates join intent with normalized lifecycle summary', async (t) => {
  const submissions = [];
  const controller = new MembershipLifecycleController({
    nodeId: 'node-1',
    startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
    now: () => 123,
    delegates: {
      onJoinIntent: ({intent}) => {
        submissions.push(intent);
        return {accepted: true, intent};
      },
    },
  });

  const result = await controller.submitJoinIntent({
    joinSessionId: 'session-1',
    nodeAddress: 'ws://node-1',
    seedNodeAddress: 'http://seed',
    recoveryEpoch: 'node-1:epoch-7',
    membershipOwnerOutcome: buildMembershipOwnerOutcome({
      startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
    }),
  });

  t.equal(submissions.length, 1);
  t.match(result, {
    accepted: true,
    intent: {
      intentType: MEMBERSHIP_LIFECYCLE_INTENT.RESTART_REENTRY,
      nodeId: 'node-1',
      startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
      membershipOwnerOutcome: {
        semanticOwner: TOPOLOGY_MEMBERSHIP_OWNER_CONTRACT.SEMANTIC_OWNER,
        boundary: TOPOLOGY_MEMBERSHIP_OWNER_CONTRACT.BOUNDARY,
        outcomeType: MEMBERSHIP_OWNER_OUTCOME_TYPE.RESTART_REENTRY,
      },
      joinSessionId: 'session-1',
      requestedAt: 123,
      reasonCode: 'restart_reentry_requested',
      membershipLifecycleSummary: {
        lifecycleState: 'caught_up',
        memberStatesByNodeId: {
          'node-1': 'catching_up',
        },
        recoveryEpochByNodeId: {
          'node-1': 'node-1:epoch-7',
        },
      },
    },
  });
});

test('MembershipLifecycleController delegates drain and removal intent through one owner path', async (t) => {
  const submissions = [];
  const controller = new MembershipLifecycleController({
    nodeId: 'node-2',
    now: () => 456,
    delegates: {
      onDrainIntent: ({intent}) => {
        submissions.push(intent);
        return {phase: 'draining', reasons: [intent.reasonCode]};
      },
      onRemovalIntent: ({intent}) => {
        submissions.push(intent);
        return {removed: true, intent};
      },
    },
  });

  const drainResult = await controller.submitDrainIntent({
    drainDeadlineMs: 999,
    reasonCode: 'operator_shutdown',
    signal: 'SIGTERM',
  });
  const removalResult = await controller.submitRemovalIntent({
    reasonCode: 'cluster_membership_cleanup',
  });

  t.match(drainResult, {
    phase: 'draining',
    reasons: ['operator_shutdown'],
  });
  t.match(removalResult, {
    removed: true,
    intent: {
      intentType: MEMBERSHIP_LIFECYCLE_INTENT.REMOVAL,
      membershipLifecycleSummary: {
        lifecycleState: 'removed',
        memberStatesByNodeId: {
          'node-2': 'retired',
        },
      },
    },
  });
  t.same(
    submissions.map((intent) => intent.intentType),
    [
      MEMBERSHIP_LIFECYCLE_INTENT.DRAIN,
      MEMBERSHIP_LIFECYCLE_INTENT.REMOVAL,
    ],
  );
});

test('membership runtime participation projection normalizes boot and rejoin state', async (t) => {
  t.same(
    buildNodeRuntimeParticipationProjection({
      lifecycleState: MEMBERSHIP_LIFECYCLE_STATE.CAUGHT_UP,
      participationState: NODE_PARTICIPATION_STATE.RECOVERY_PENDING_PUBLISH,
      recoveryProtocolState: RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING,
    }),
    {
      state: NODE_RUNTIME_PARTICIPATION_STATE.RECOVERING,
      admissionState: NODE_PARTICIPATION_ADMISSION_STATE.UNAVAILABLE,
    },
    'durable rejoin recovery should project to one recovering state',
  );

  t.same(
    buildNodeRuntimeParticipationProjection({
      lifecycleState: MEMBERSHIP_LIFECYCLE_STATE.PUBLISHED_ACTIVE,
      admissionState: NODE_PARTICIPATION_ADMISSION_STATE.BLOCKED,
    }),
    {
      state: NODE_RUNTIME_PARTICIPATION_STATE.BLOCKED,
      admissionState: NODE_PARTICIPATION_ADMISSION_STATE.BLOCKED,
    },
    'admission blocks should dominate published membership evidence',
  );

  t.ok(
    isNodeRuntimeParticipationBlocked({
      participation: {
        state: NODE_PARTICIPATION_STATE.PUBLISHED_ACTIVE,
        admissionState: NODE_PARTICIPATION_ADMISSION_STATE.BLOCKED,
      },
    }),
    'active-node projection can consume the same blocker helper',
  );
});
