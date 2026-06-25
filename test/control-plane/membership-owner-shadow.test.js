import {test} from '../../src/test-helpers/tap.js';
import {
  buildMembershipOwnerDivergence,
} from '../../src/control-plane/membership-owner-shadow.js';

// The owner-shadow probe and authoritative flip (and their `computeShadowActiveMemberSet`
// owner rule) were retired after the single-owner cutover thesis was refuted. The pure
// `buildMembershipOwnerDivergence` diff is retained because the FD-upgrade SWIM
// divergence probe reuses it; these tests pin that diff's contract.

test('buildMembershipOwnerDivergence: agree when identical', (t) => {
  const diff = buildMembershipOwnerDivergence({
    projectionNodeIds: ['node-a', 'node-b'],
    shadowNodeIds: ['node-b', 'node-a'],
  });
  t.equal(diff.agree, true);
  t.equal(diff.divergenceCount, 0);
  t.same(diff.onlyInProjection, []);
  t.same(diff.onlyInShadow, []);
  t.end();
});

test('buildMembershipOwnerDivergence: onlyInProjection is the load-bearing direction', (t) => {
  const diff = buildMembershipOwnerDivergence({
    projectionNodeIds: ['node-a', 'node-b'],
    shadowNodeIds: ['node-a'],
  });
  t.equal(diff.agree, false);
  t.same(diff.onlyInProjection, ['node-b']);
  t.same(diff.onlyInShadow, []);
  t.equal(diff.projectionCount, 2);
  t.equal(diff.shadowCount, 1);
  t.equal(diff.divergenceCount, 1);
  t.end();
});

test('buildMembershipOwnerDivergence: onlyInShadow captures owner-included extras', (t) => {
  const diff = buildMembershipOwnerDivergence({
    projectionNodeIds: ['node-a'],
    shadowNodeIds: ['node-a', 'node-c'],
  });
  t.equal(diff.agree, false);
  t.same(diff.onlyInShadow, ['node-c']);
  t.same(diff.onlyInProjection, []);
  t.end();
});
