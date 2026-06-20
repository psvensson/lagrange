// Phase 2 authority flip — when LAGRANGE_MEMBERSHIP_OWNER_AUTHORITATIVE is on, the
// owner rule AUTHORS the published active-member set (routed through the existing
// EXPLICIT_PUBLICATION decision), and publishedActiveNodeIds + downstream artifacts
// derive from it. Default-off must preserve the projection-authored behavior.
import {test} from '../../src/test-helpers/tap.js';
import {
  deriveMembershipPublicationCandidate,
} from '../../src/control-plane/membership-publication-planning-evidence.js';
import {
  MEMBERSHIP_OWNER_AUTHORITATIVE_ENV,
} from '../../src/control-plane/membership-owner-shadow.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION as DIM,
} from '../../src/control-plane/control-plane-readiness-constants.js';

function promotable(nodeId) {
  return {
    nodeId,
    dimensions: {
      [DIM.CLUSTER_MEMBER_HEALTHY]: true,
      [DIM.CONTROL_PLANE_WRITABLE]: true,
      [DIM.REPAIR_ELIGIBLE]: true,
      [DIM.SERVE_ELIGIBLE]: true,
    },
  };
}
function nodeRow(nodeId) {
  return {node_id: nodeId, status: 'active', last_heartbeat: Date.now()};
}

// 'n3-leader' is alive (the publisher/local node) but NOT in the published
// baseline and has no node/readiness row — so the projection excludes it while
// the owner rule includes it via self-knowledge. That divergence makes the flip
// observable in the candidate's published set.
function scenario() {
  return {
    publicationKind: 'cluster_membership',
    publisherNodeId: 'n3-leader',
    nodeRows: [nodeRow('n1'), nodeRow('n2')],
    readinessEntries: [promotable('n1'), promotable('n2')],
    latestPublishedPublicationRow: {
      publication_epoch: 5,
      status: 'PUBLISHED',
      published_active_node_ids: ['n1', 'n2'],
    },
    latestPublicationRow: {
      publication_epoch: 5,
      status: 'PUBLISHED',
      published_active_node_ids: ['n1', 'n2'],
    },
    nowMs: Date.now(),
  };
}

function withFlag(value, fn) {
  const prior = process.env[MEMBERSHIP_OWNER_AUTHORITATIVE_ENV];
  if (value === undefined) {
    delete process.env[MEMBERSHIP_OWNER_AUTHORITATIVE_ENV];
  } else {
    process.env[MEMBERSHIP_OWNER_AUTHORITATIVE_ENV] = value;
  }
  try {
    return fn();
  } finally {
    if (prior === undefined) {
      delete process.env[MEMBERSHIP_OWNER_AUTHORITATIVE_ENV];
    } else {
      process.env[MEMBERSHIP_OWNER_AUTHORITATIVE_ENV] = prior;
    }
  }
}

test('default (env unset): published set is projection-authored (flip is default-off)', (t) => {
  const candidate = withFlag(undefined, () =>
    deriveMembershipPublicationCandidate(scenario()),
  );
  t.same(candidate.publishedActiveNodeIds, ['n1', 'n2']);
  t.notOk(candidate.publishedActiveNodeIds.includes('n3-leader'));
  t.end();
});

test('flag ON (=true): owner rule authors the published set (self-knowledge includes the leader)', (t) => {
  const candidate = withFlag('true', () =>
    deriveMembershipPublicationCandidate(scenario()),
  );
  t.same(candidate.publishedActiveNodeIds, ['n1', 'n2', 'n3-leader']);
  t.ok(candidate.publishedActiveNodeIds.includes('n3-leader'), 'owner-authored');
  t.end();
});

test('flag ON: downstream artifacts derive from the owner set (consistency)', (t) => {
  const candidate = withFlag('true', () =>
    deriveMembershipPublicationCandidate(scenario()),
  );
  // requiredAckNodeIds defaults to the published set — must reflect the owner set,
  // proving downstream flows from the same authored set (not the projection).
  t.ok(
    candidate.requiredAckNodeIds.includes('n3-leader'),
    'ack requirements derive from the owner-authored published set',
  );
  // membership changed vs the [n1,n2] baseline -> a new epoch is derived.
  t.equal(candidate.changed, true, 'authored membership change bumps the epoch');
  t.ok(candidate.publicationEpoch > 5, 'epoch advanced from baseline');
  t.end();
});
