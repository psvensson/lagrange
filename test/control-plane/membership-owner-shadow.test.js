import {test} from '../../src/test-helpers/tap.js';
import {
  MEMBERSHIP_OWNER_SHADOW_ENV,
  buildMembershipOwnerDivergence,
  computeShadowActiveMemberSet,
  isMembershipOwnerShadowEnabled,
} from '../../src/control-plane/membership-owner-shadow.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';

function promotableReadiness() {
  return {
    dimensions: {
      [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: true,
    },
  };
}

function unpromotableReadiness() {
  return {
    dimensions: {
      [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: false,
      [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: true,
    },
  };
}

test('computeShadowActiveMemberSet: baseline carried forward, sorted unique', (t) => {
  const result = computeShadowActiveMemberSet({
    publishedBaselineNodeIds: ['node-c', 'node-a', 'node-a'],
  });
  t.same(result, ['node-a', 'node-c']);
  t.end();
});

test('computeShadowActiveMemberSet: unions readiness-promotable nodes', (t) => {
  const result = computeShadowActiveMemberSet({
    publishedBaselineNodeIds: ['node-a'],
    readinessByNodeId: {
      'node-b': promotableReadiness(),
    },
  });
  t.same(result, ['node-a', 'node-b']);
  t.end();
});

test('computeShadowActiveMemberSet: excludes non-promotable readiness nodes', (t) => {
  const result = computeShadowActiveMemberSet({
    publishedBaselineNodeIds: ['node-a'],
    readinessByNodeId: {
      'node-b': unpromotableReadiness(),
    },
  });
  t.same(result, ['node-a']);
  t.end();
});

test('computeShadowActiveMemberSet: excludes draining/retired members even in baseline', (t) => {
  const result = computeShadowActiveMemberSet({
    publishedBaselineNodeIds: ['node-a', 'node-b'],
    memberStatesByNodeId: {
      'node-b': 'draining',
    },
  });
  t.same(result, ['node-a']);
  t.end();
});

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

test('isMembershipOwnerShadowEnabled: default-off, opt-in by env', (t) => {
  t.equal(isMembershipOwnerShadowEnabled({}), false);
  t.equal(
    isMembershipOwnerShadowEnabled({[MEMBERSHIP_OWNER_SHADOW_ENV]: 'false'}),
    false,
  );
  t.equal(
    isMembershipOwnerShadowEnabled({[MEMBERSHIP_OWNER_SHADOW_ENV]: 'true'}),
    true,
  );
  t.end();
});
