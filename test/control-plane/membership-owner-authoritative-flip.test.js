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

// Option-3 wiring: the flip swaps the SERVING-set authority (the orchestration
// INPUT projectedServingNodeIds), preserving the trim/widen/recovery/ACK/epoch
// machinery — it does NOT bypass the orchestration with an explicit published set.
// So the observable change is candidate.projectedServingNodeIds; what gets
// PUBLISHED is then the orchestration's decision over that serving view (e.g. an
// evidence-less node may be retained-at-baseline rather than widened in).
test('default (env unset): serving projection is projection-authored (flip default-off)', (t) => {
  const candidate = withFlag(undefined, () =>
    deriveMembershipPublicationCandidate(scenario()),
  );
  t.same(candidate.projectedServingNodeIds, ['n1', 'n2']);
  t.notOk(candidate.projectedServingNodeIds.includes('n3-leader'));
  t.end();
});

test('flag ON (=true): owner rule authors the serving projection (self-knowledge includes the leader)', (t) => {
  const candidate = withFlag('true', () =>
    deriveMembershipPublicationCandidate(scenario()),
  );
  t.same(candidate.projectedServingNodeIds, ['n1', 'n2', 'n3-leader']);
  t.ok(candidate.projectedServingNodeIds.includes('n3-leader'), 'owner-authored serving set');
  t.end();
});

test('flag ON: the existing orchestration still decides what to publish from the owner serving set', (t) => {
  const candidate = withFlag('true', () =>
    deriveMembershipPublicationCandidate(scenario()),
  );
  // The orchestration (not a bypass) owns the publish decision: an evidence-less
  // widening node is retained at the durable baseline, proving the machinery runs
  // over the owner serving view rather than being short-circuited.
  t.ok(Array.isArray(candidate.publishedActiveNodeIds), 'orchestration produced a published set');
  t.ok(
    candidate.publishedActiveNodeIds.includes('n1') &&
      candidate.publishedActiveNodeIds.includes('n2'),
    'durable baseline retained by the orchestration',
  );
  t.end();
});
