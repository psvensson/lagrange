import {test} from '../../src/test-helpers/tap.js';
import {STARTUP_JOIN_MODE} from '../../src/bootstrap/rejoin-hints-constants.js';
import {
  MembershipLifecycleController,
  MEMBERSHIP_LIFECYCLE_INTENT,
  resolveMembershipJoinIntentType,
} from '../../src/control-plane/membership-lifecycle-controller.js';

test('MembershipLifecycleController resolves join and durable rejoin intent types canonically', async (t) => {
  t.equal(
    resolveMembershipJoinIntentType(STARTUP_JOIN_MODE.FRESH_JOIN),
    MEMBERSHIP_LIFECYCLE_INTENT.JOIN_ADMISSION,
  );
  t.equal(
    resolveMembershipJoinIntentType(STARTUP_JOIN_MODE.DURABLE_REJOIN),
    MEMBERSHIP_LIFECYCLE_INTENT.RESTART_REENTRY,
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
  });

  t.equal(submissions.length, 1);
  t.match(result, {
    accepted: true,
    intent: {
      intentType: MEMBERSHIP_LIFECYCLE_INTENT.RESTART_REENTRY,
      nodeId: 'node-1',
      startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
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
