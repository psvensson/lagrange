import {test} from '../../src/test-helpers/tap.js';
import {
  MembershipPublicationCoordinatorReads,
} from '../../src/control-plane/membership-publication-coordinator-reads.js';
import {
  buildMembershipOwnerDivergence,
} from '../../src/control-plane/membership-owner-shadow.js';

function makeCoordinator() {
  const infoCalls = [];
  const coordinator = new MembershipPublicationCoordinatorReads({
    nodeId: 'node-self',
    logger: {info: (msg, ctx) => infoCalls.push({msg, ctx})},
  });
  return {coordinator, infoCalls};
}

function diff(projectionNodeIds, shadowNodeIds) {
  return buildMembershipOwnerDivergence({projectionNodeIds, shadowNodeIds});
}

test('emit: null divergence (flag off) is a no-op', (t) => {
  const {coordinator, infoCalls} = makeCoordinator();
  coordinator._emitMembershipOwnerDivergence(null);
  t.equal(infoCalls.length, 0);
  t.end();
});

test('emit: a stable state logs once, then dedups', (t) => {
  const {coordinator, infoCalls} = makeCoordinator();
  const d = diff(['a', 'b'], ['a']);
  coordinator._emitMembershipOwnerDivergence(d);
  coordinator._emitMembershipOwnerDivergence(d);
  t.equal(infoCalls.length, 1, 'same state logs only once');
  t.equal(infoCalls[0].msg, 'MEMBERSHIP_OWNER_DIVERGENCE');
  t.equal(infoCalls[0].ctx.agree, false);
  t.same(infoCalls[0].ctx.onlyInProjection, ['b']);
  t.ok(Number.isFinite(infoCalls[0].ctx.instanceEpoch), 'carries instance marker');
  t.equal(infoCalls[0].ctx.isWriteLeader, false, 'tags write-leader role (false without cache)');
  t.end();
});

test('emit: settle-to-agree IS emitted (the disambiguation fix)', (t) => {
  const {coordinator, infoCalls} = makeCoordinator();
  coordinator._emitMembershipOwnerDivergence(diff(['a', 'b'], ['a']));
  coordinator._emitMembershipOwnerDivergence(diff(['a', 'b'], ['a', 'b']));
  t.equal(infoCalls.length, 2, 'disagree then agree both logged');
  t.equal(infoCalls[1].ctx.agree, true, 'last emit shows the quiescent agree state');
  t.end();
});

test('emit: consecutive agree dedups (only the transition logs)', (t) => {
  const {coordinator, infoCalls} = makeCoordinator();
  coordinator._emitMembershipOwnerDivergence(diff(['a'], ['a']));
  coordinator._emitMembershipOwnerDivergence(diff(['a'], ['a']));
  t.equal(infoCalls.length, 1);
  t.equal(infoCalls[0].ctx.agree, true);
  t.end();
});

test('emit: a new disagreement signature logs again', (t) => {
  const {coordinator, infoCalls} = makeCoordinator();
  coordinator._emitMembershipOwnerDivergence(diff(['a', 'b'], ['a']));
  coordinator._emitMembershipOwnerDivergence(diff(['a'], ['a', 'c']));
  t.equal(infoCalls.length, 2);
  t.end();
});

test('emit: instanceEpoch is stable across emits from one instance', (t) => {
  const {coordinator, infoCalls} = makeCoordinator();
  coordinator._emitMembershipOwnerDivergence(diff(['a', 'b'], ['a']));
  coordinator._emitMembershipOwnerDivergence(diff(['a'], ['a', 'c']));
  t.equal(infoCalls[0].ctx.instanceEpoch, infoCalls[1].ctx.instanceEpoch);
  t.end();
});
