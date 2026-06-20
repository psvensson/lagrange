import {test} from '../../src/test-helpers/tap.js';
import {
  MembershipLifecycleController,
  MEMBERSHIP_LIFECYCLE_INTENT,
} from '../../src/control-plane/membership-lifecycle-controller.js';
import {
  MEMBERSHIP_LIFECYCLE_STATE,
} from '../../src/control-plane/membership-lifecycle-constants.js';

function makeController() {
  let tick = 0;
  return new MembershipLifecycleController({
    nodeId: 'node-self',
    now: () => {
      tick += 1;
      return tick;
    },
  });
}

test('applyMemberTransition: legal step is applied and recorded', (t) => {
  const controller = makeController();
  const result = controller.applyMemberTransition(
    'node-a',
    MEMBERSHIP_LIFECYCLE_STATE.ADMITTED,
  );
  t.equal(result.applied, true);
  t.equal(result.fromState, MEMBERSHIP_LIFECYCLE_STATE.ABSENT);
  t.equal(result.toState, MEMBERSHIP_LIFECYCLE_STATE.ADMITTED);
  t.equal(
    controller.getMemberLifecycleState('node-a'),
    MEMBERSHIP_LIFECYCLE_STATE.ADMITTED,
  );
  t.equal(controller.memberTransitionHistory.length, 1);
  t.end();
});

test('applyMemberTransition: illegal step is rejected, not forced', (t) => {
  const controller = makeController();
  // ABSENT -> PUBLISHED_ACTIVE is not a legal transition.
  const result = controller.applyMemberTransition(
    'node-a',
    MEMBERSHIP_LIFECYCLE_STATE.PUBLISHED_ACTIVE,
  );
  t.equal(result.applied, false);
  t.equal(result.outcome, 'invalid_transition');
  t.equal(
    controller.getMemberLifecycleState('node-a'),
    MEMBERSHIP_LIFECYCLE_STATE.ABSENT,
  );
  t.equal(controller.memberTransitionHistory.length, 0);
  t.end();
});

test('applyMemberTransition: same-state is a noop', (t) => {
  const controller = makeController();
  controller.applyMemberTransition('node-a', MEMBERSHIP_LIFECYCLE_STATE.ADMITTED);
  const result = controller.applyMemberTransition(
    'node-a',
    MEMBERSHIP_LIFECYCLE_STATE.ADMITTED,
  );
  t.equal(result.applied, false);
  t.equal(result.outcome, 'noop');
  t.end();
});

test('submitJoinIntent advances the member to ADMITTED', async (t) => {
  const controller = makeController();
  await controller.submitJoinIntent({nodeId: 'node-a', startupMode: 'fresh_join'});
  t.equal(
    controller.getMemberLifecycleState('node-a'),
    MEMBERSHIP_LIFECYCLE_STATE.ADMITTED,
  );
  t.end();
});

test('restart re-entry seeds PUBLISHED_ACTIVE then transitions to PROVISIONING', (t) => {
  const controller = makeController();
  const result = controller.advanceMemberForIntent({
    intentType: MEMBERSHIP_LIFECYCLE_INTENT.RESTART_REENTRY,
    nodeId: 'node-a',
  });
  t.equal(result.applied, true);
  t.equal(result.fromState, MEMBERSHIP_LIFECYCLE_STATE.PUBLISHED_ACTIVE);
  t.equal(result.toState, MEMBERSHIP_LIFECYCLE_STATE.PROVISIONING);
  t.end();
});

test('drain from PUBLISHED_ACTIVE is legal; drain from ABSENT is rejected', (t) => {
  const controller = makeController();
  controller.memberLifecycleStates.set(
    'node-a',
    MEMBERSHIP_LIFECYCLE_STATE.PUBLISHED_ACTIVE,
  );
  const ok = controller.advanceMemberForIntent({
    intentType: MEMBERSHIP_LIFECYCLE_INTENT.DRAIN,
    nodeId: 'node-a',
  });
  t.equal(ok.applied, true);
  t.equal(ok.toState, MEMBERSHIP_LIFECYCLE_STATE.DRAINING);

  const rejected = controller.advanceMemberForIntent({
    intentType: MEMBERSHIP_LIFECYCLE_INTENT.DRAIN,
    nodeId: 'node-b',
  });
  t.equal(rejected.applied, false);
  t.equal(rejected.outcome, 'invalid_transition');
  t.end();
});

test('unknown intent type yields unknown_intent outcome', (t) => {
  const controller = makeController();
  const result = controller.advanceMemberForIntent({
    intentType: 'not_a_real_intent',
    nodeId: 'node-a',
  });
  t.equal(result.applied, false);
  t.equal(result.outcome, 'unknown_intent');
  t.end();
});

test('empty nodeId on restart re-entry does not pollute the shadow map', (t) => {
  const controller = makeController();
  const result = controller.advanceMemberForIntent({
    intentType: MEMBERSHIP_LIFECYCLE_INTENT.RESTART_REENTRY,
    nodeId: '',
  });
  t.equal(result.applied, false);
  t.equal(result.outcome, 'unknown_intent');
  t.same(controller.snapshotMemberLifecycleStates(), {});
  t.end();
});

test('submitJoinIntent still returns the intent unchanged (additive machine)', async (t) => {
  const controller = makeController();
  const intent = await controller.submitJoinIntent({
    nodeId: 'node-a',
    startupMode: 'fresh_join',
  });
  t.equal(intent.intentType, MEMBERSHIP_LIFECYCLE_INTENT.JOIN_ADMISSION);
  t.equal(intent.nodeId, 'node-a');
  t.end();
});
