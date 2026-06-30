import {test} from '../../src/test-helpers/tap.js';
import {deriveMembershipPublicationCandidate} from '../../src/control-plane/membership-publication-coordinator.js';
import {buildMembershipPublicationTargetSnapshot} from '../../src/control-plane/membership-publication-target-selection.js';

// The steady-trim that drops a durably non-serving node from PUBLISHED membership is
// gated on the GLOBAL priorityRecoverySpreadGapPending flag (plus the
// observedRecoveryProjectionGap + membershipFreeze guards). When the spread gap is
// pending, the trim is held and the cluster falls back to the recovery cohort.

const STATE_STEADY_TRIM = 'projected_steady_trim';
const STATE_RECOVERY_COHORT = 'recovery_cohort';
const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
const NODE_A = 'A';
const NODE_B = 'B';
const NODE_C = 'C';
const NODE_D = 'D';
const OWNER_NORMALIZED_TRIM_PARTITION_ID = 'sql_write_operations-p1';
const OWNER_NORMALIZED_TRIM_CLOSURE_STATE =
  'closure_satisfied_stale_publication';
const PUBLICATION_EPOCH = 7;
const NEXT_PUBLICATION_EPOCH = 8;
const READY_LEASE_EXPIRES_AT = 5000;
const NOW_MS = 1000;
const REQUIRED_DISTINCT_NODE_COUNT = 3;
const READY_DISTINCT_NODE_COUNT_PENDING = 2;
const TOTAL_PRIORITY_PARTITION_COUNT = 5;
const SPREAD_GAP = 1;
const RETAINED_NODE_IDS = Object.freeze([NODE_A, NODE_B, NODE_C]);
const STALE_PUBLISHED_NODE_IDS = Object.freeze([
  ...RETAINED_NODE_IDS,
  NODE_D,
]);

const helperFns = {
  normalizeNodeIdList: (xs) =>
    [...new Set((Array.isArray(xs) ? xs : []).map((x) => String(x)))],
};

// Baseline publishes [A,B,C,D]; projection has durably dropped D (serving = [A,B,C]).
// recoveryActiveNodeIds still carries D (the cohort fallback retains it).
function baseOptions(overrides = {}) {
  return {
    explicitPublishedNodeIds: [],
    publishedBaselineNodeIds: STALE_PUBLISHED_NODE_IDS,
    projectedServingNodeIds: RETAINED_NODE_IDS,
    recoveryActiveNodeIds: STALE_PUBLISHED_NODE_IDS,
    observedActiveNodeIds: RETAINED_NODE_IDS,
    priorityRecoverySpreadGapPending: true,
    observedRecoveryProjectionGap: false,
    membershipFreezeActive: false,
    ...overrides,
  };
}

function sorted(xs) {
  return [...xs].sort();
}

function buildSettledPriorityPartitionSummary() {
  return {
    satisfied: true,
    requiredDistinctNodeCount: REQUIRED_DISTINCT_NODE_COUNT,
    readyEligibleNodeCount: REQUIRED_DISTINCT_NODE_COUNT,
    totalPriorityPartitionCount: TOTAL_PRIORITY_PARTITION_COUNT,
    missingPartitionIds: [],
    blockedPartitions: [],
  };
}

function buildPendingPriorityPartitionSummary() {
  return {
    satisfied: false,
    requiredDistinctNodeCount: REQUIRED_DISTINCT_NODE_COUNT,
    readyEligibleNodeCount: READY_DISTINCT_NODE_COUNT_PENDING,
    totalPriorityPartitionCount: TOTAL_PRIORITY_PARTITION_COUNT,
    missingPartitionIds: [],
    blockedPartitions: [
      {
        partitionId: OWNER_NORMALIZED_TRIM_PARTITION_ID,
        requiredDistinctNodeCount: REQUIRED_DISTINCT_NODE_COUNT,
        readyDistinctNodeCount: READY_DISTINCT_NODE_COUNT_PENDING,
        spreadGap: SPREAD_GAP,
      },
    ],
  };
}

function buildNodeRow(nodeId) {
  return {
    node_id: nodeId,
    status: 'active',
    connection_state: 'ready',
    ready_lease_expires_at: READY_LEASE_EXPIRES_AT,
  };
}

function buildReadinessEntry(nodeId) {
  return {
    nodeId,
    dimensions: {clusterMemberHealthy: true},
  };
}

function buildEndpointRow(nodeId) {
  return {
    endpoint_id: `${nodeId}-ws`,
    node_id: nodeId,
    transport_type: 'ws',
    status: 'active',
    address: `ws://${nodeId}:8082`,
  };
}

function buildServiceRow(nodeId) {
  return {
    service_id: `svc-${nodeId}`,
    node_id: nodeId,
    status: 'active',
  };
}

function buildPriorityRecoveryClosureWitness() {
  return {
    state: OWNER_NORMALIZED_TRIM_CLOSURE_STATE,
    prioritySpreadPending: false,
    publicationRefreshRequired: true,
    refreshedPriorityPartitionSummary: buildSettledPriorityPartitionSummary(),
  };
}

function buildStalePublicationRow(priorityPartitionSummary) {
  return {
    publication_epoch: PUBLICATION_EPOCH,
    status: PUBLICATION_STATUS_PUBLISHED,
    published_active_node_ids: STALE_PUBLISHED_NODE_IDS,
    required_ack_node_ids: STALE_PUBLISHED_NODE_IDS,
    acknowledged_node_ids: STALE_PUBLISHED_NODE_IDS,
    priority_partition_summary: priorityPartitionSummary,
  };
}

function buildOwnerNormalizedTrimCandidate(priorityRecoveryPlanningSnapshot) {
  const publicationRow = buildStalePublicationRow(
    buildPendingPriorityPartitionSummary(),
  );
  return deriveMembershipPublicationCandidate({
    publisherNodeId: 'seed-node',
    latestPublicationRow: publicationRow,
    latestPublishedPublicationRow: publicationRow,
    priorityRecoveryPlanningSnapshot,
    nodeRows: RETAINED_NODE_IDS.map(buildNodeRow),
    readinessEntries: RETAINED_NODE_IDS.map(buildReadinessEntry),
    nodeEndpointRows: RETAINED_NODE_IDS.map(buildEndpointRow),
    serviceRows: RETAINED_NODE_IDS.map(buildServiceRow),
    nowMs: NOW_MS,
  });
}

function assertOwnerNormalizedTrimCandidate(t, candidate) {
  t.same(
    candidate.publishedActiveNodeIds,
    RETAINED_NODE_IDS,
    'owner-normalized closure allows stale published members to trim',
  );
  t.equal(
    candidate.publicationEpoch,
    NEXT_PUBLICATION_EPOCH,
    'owner-closed trim advances the publication epoch',
  );
  t.same(
    candidate.requiredAckNodeIds,
    RETAINED_NODE_IDS,
    'owner-closed trim requires only retained serving members',
  );
}

test('spread-gap pending holds the trim -> stale node stays published', (t) => {
  const snap = buildMembershipPublicationTargetSnapshot(baseOptions(), helperFns);
  t.equal(snap.state, STATE_RECOVERY_COHORT, 'falls to recovery cohort');
  t.same(sorted(snap.nodeIds), STALE_PUBLISHED_NODE_IDS, 'D NOT trimmed');
  t.end();
});

test('owner-normalized spread closure lets steady trim retire stale publication', (t) => {
  const snap = buildMembershipPublicationTargetSnapshot(
    baseOptions({
      priorityRecoverySpreadGapPending: true,
      priorityRecoverySpreadPending: false,
    }),
    helperFns,
  );
  t.equal(snap.state, STATE_STEADY_TRIM, 'owner closure permits steady trim');
  t.same(sorted(snap.nodeIds), RETAINED_NODE_IDS, 'D trimmed');
  t.end();
});

test('NO spread gap: trim is allowed and engages', (t) => {
  const snap = buildMembershipPublicationTargetSnapshot(
    baseOptions({priorityRecoverySpreadGapPending: false}),
    helperFns,
  );
  t.equal(snap.state, STATE_STEADY_TRIM, 'baseline trim path engages');
  t.same(sorted(snap.nodeIds), RETAINED_NODE_IDS, 'D trimmed');
  t.end();
});

test('observedRecoveryProjectionGap blocks the trim', (t) => {
  const snap = buildMembershipPublicationTargetSnapshot(
    baseOptions({
      priorityRecoverySpreadGapPending: false,
      observedRecoveryProjectionGap: true,
    }),
    helperFns,
  );
  t.equal(snap.state, STATE_RECOVERY_COHORT, 'observed-projection-gap guard preserved');
  t.end();
});

test('membershipFreezeActive blocks the trim', (t) => {
  const snap = buildMembershipPublicationTargetSnapshot(
    baseOptions({
      priorityRecoverySpreadGapPending: false,
      membershipFreezeActive: true,
    }),
    helperFns,
  );
  t.equal(snap.state, STATE_RECOVERY_COHORT, 'membership-freeze guard preserved');
  t.end();
});

test('no trim debt (serving == baseline) → no spurious trim', (t) => {
  const snap = buildMembershipPublicationTargetSnapshot(
    baseOptions({
      projectedServingNodeIds: STALE_PUBLISHED_NODE_IDS,
      priorityRecoverySpreadGapPending: false,
    }),
    helperFns,
  );
  // serving == baseline → publishedTrimDebt false → not steady trim
  t.not(snap.state, STATE_STEADY_TRIM, 'no trim when nothing to trim');
  t.end();
});

test('candidate derivation consumes owner-normalized priority closure for stale trims',
  (t) => {
    const closureWitness = buildPriorityRecoveryClosureWitness();
    assertOwnerNormalizedTrimCandidate(
      t,
      buildOwnerNormalizedTrimCandidate({
        priorityRecoveryDecisionSnapshots: {
          closureWitness,
        },
      }),
    );
    t.end();
  });

test('candidate derivation consumes closure-only owner evidence for stale trims',
  (t) => {
    assertOwnerNormalizedTrimCandidate(
      t,
      buildOwnerNormalizedTrimCandidate({
        priorityRecoveryClosureWitness: buildPriorityRecoveryClosureWitness(),
      }),
    );
    t.end();
  });
