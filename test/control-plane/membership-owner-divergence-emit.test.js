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

test('emit: null divergence (flag off) is a no-op', (t) => {
  const {coordinator, infoCalls} = makeCoordinator();
  coordinator._emitMembershipOwnerDivergence(null);
  t.equal(infoCalls.length, 0);
  t.end();
});

test('emit: agreeing divergence is a no-op', (t) => {
  const {coordinator, infoCalls} = makeCoordinator();
  coordinator._emitMembershipOwnerDivergence(
    buildMembershipOwnerDivergence({
      projectionNodeIds: ['a', 'b'],
      shadowNodeIds: ['a', 'b'],
    }),
  );
  t.equal(infoCalls.length, 0);
  t.end();
});

test('emit: disagreement logs once, deduped by signature', (t) => {
  const {coordinator, infoCalls} = makeCoordinator();
  const divergence = buildMembershipOwnerDivergence({
    projectionNodeIds: ['a', 'b'],
    shadowNodeIds: ['a'],
  });
  coordinator._emitMembershipOwnerDivergence(divergence);
  coordinator._emitMembershipOwnerDivergence(divergence);
  t.equal(infoCalls.length, 1, 'same signature logs only once');
  t.equal(infoCalls[0].msg, 'MEMBERSHIP_OWNER_DIVERGENCE');
  t.same(infoCalls[0].ctx.onlyInProjection, ['b']);
  t.equal(infoCalls[0].ctx.nodeId, 'node-self');
  t.end();
});

test('emit: a new divergence signature logs again', (t) => {
  const {coordinator, infoCalls} = makeCoordinator();
  coordinator._emitMembershipOwnerDivergence(
    buildMembershipOwnerDivergence({projectionNodeIds: ['a', 'b'], shadowNodeIds: ['a']}),
  );
  coordinator._emitMembershipOwnerDivergence(
    buildMembershipOwnerDivergence({projectionNodeIds: ['a'], shadowNodeIds: ['a', 'c']}),
  );
  t.equal(infoCalls.length, 2);
  t.end();
});
