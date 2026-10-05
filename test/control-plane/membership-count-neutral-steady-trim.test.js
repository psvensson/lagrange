import {test} from '../../src/test-helpers/tap.js';
import {
  MembershipPublicationCoordinator,
  deriveMembershipPublicationCandidate,
} from '../../src/control-plane/membership-publication-coordinator.js';
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

// SUPERSEDED #7 and #8 (owner decisions 2026-10-04, "delete the second
// authority" and decision 4). Before: a closure witness in the deleted
// stale-publication state (prioritySpreadPending false, refresh required)
// cleared the durable spread gap on the SAME derivation, so the stale member
// trimmed at once ("owner-normalized closure allows stale published members
// to trim"; epoch 8; acks from the retained members only). A non-pending
// witness now says nothing about spread: the durable gap holds the trim for
// one reconcile, that reconcile writes the census-refreshed summary, and the
// next one trims. The protected property - a durably non-serving member is
// retired once spread is real - is asserted on the second hop below.
const PRIORITY_TABLE_IDS = Object.freeze([
  'control_plane_publications',
  'replica_operations',
  'schema_operations',
  'sql_transaction_participants',
  'sql_transactions',
  'sql_write_operations',
]);

function buildSpreadPriorityServiceRows() {
  return PRIORITY_TABLE_IDS.flatMap((tableId) =>
    RETAINED_NODE_IDS.map((nodeId, index) => ({
      service_id: `${tableId}-r${index + 1}`,
      node_id: nodeId,
      partition_id: `${tableId}-p1`,
      service_type: 'partition',
      status: 'active',
      raft_role: index === 0 ? 'leader' : 'follower',
      address: `${nodeId}/partition/${tableId}-p1`,
    })));
}

function deriveTrimCandidate(priorityPartitionSummary, planningSnapshot = {}) {
  const publicationRow = buildStalePublicationRow(priorityPartitionSummary);
  return deriveMembershipPublicationCandidate({
    publisherNodeId: 'seed-node',
    latestPublicationRow: publicationRow,
    latestPublishedPublicationRow: publicationRow,
    ...planningSnapshot,
    nodeRows: RETAINED_NODE_IDS.map(buildNodeRow),
    readinessEntries: RETAINED_NODE_IDS.map(buildReadinessEntry),
    nodeEndpointRows: RETAINED_NODE_IDS.map(buildEndpointRow),
    partitionRows: PRIORITY_TABLE_IDS.map((tableId) => ({
      table_id: tableId,
      table_name: tableId,
      partition_id: `${tableId}-p1`,
      state: 'NORMAL',
    })),
    serviceRows: [
      ...RETAINED_NODE_IDS.map(buildServiceRow),
      ...buildSpreadPriorityServiceRows(),
    ],
    nowMs: NOW_MS,
  });
}

test('stale-member trim takes one reconcile hop: held, refreshed, then trimmed',
  (t) => {
    const first = deriveTrimCandidate(buildPendingPriorityPartitionSummary());
    t.same(sorted(first.publishedActiveNodeIds), STALE_PUBLISHED_NODE_IDS,
      'hop 1: the durable spread gap holds the trim');
    t.equal(first.changed, false, 'hop 1 publishes no new membership');
    t.equal(first.priorityPartitionSummary.satisfied, true,
      'hop 1: the fresh census is spread');
    t.equal(first.priorityPartitionSummaryChanged, true,
      'hop 1 writes the census-refreshed summary');

    const second = deriveTrimCandidate(first.priorityPartitionSummary);
    assertOwnerNormalizedTrimCandidate(t, second);
    t.end();
  });

test('a non-pending closure witness never clears a durable spread gap',
  (t) => {
    const satisfiedWitness = {
      state: 'closure_satisfied_fresh',
      blockedPartitionIds: [],
      unresolvedSemanticStateIds: [],
    };
    for (const planningSnapshot of [
      {priorityRecoveryClosureWitness: satisfiedWitness},
      {
        priorityRecoveryPlanningSnapshot: {
          priorityRecoveryDecisionSnapshots: {closureWitness: satisfiedWitness},
        },
      },
    ]) {
      const candidate = deriveTrimCandidate(
        buildPendingPriorityPartitionSummary(),
        planningSnapshot,
      );
      t.same(sorted(candidate.publishedActiveNodeIds), STALE_PUBLISHED_NODE_IDS,
        'the trim stays held on the durable gap');
      t.equal(candidate.priorityPartitionSummaryChanged, true,
        'and the refresh that ends the hold is written');
    }
    t.end();
  });

// Owner decision 4 (2026-10-04): the hop is ended by an EVENT. The reconcile
// that writes the refreshed summary (clearing the durable gap) enqueues the
// next reconcile itself, carrying the row it wrote; it does not wait for the
// owner driver's periodic tick.
test('the summary refresh that clears the durable gap enqueues the trimming reconcile',
  async (t) => {
    let durableRow = {
      publication_id: 'publication-7',
      publication_kind: 'cluster_membership',
      ...buildStalePublicationRow(buildPendingPriorityPartitionSummary()),
      updated_at: NOW_MS,
      published_at: NOW_MS,
      closed_at: NOW_MS,
    };
    const upserts = [];
    const enqueued = [];
    const coordinator = new MembershipPublicationCoordinator({
      nodeId: NODE_A,
      controlPlanePublicationsOwner: {
        async listPublications() {
          return {rows: [durableRow]};
        },
        async upsertPublication(row) {
          upserts.push(row);
          durableRow = {...durableRow, ...row};
        },
      },
      systemTableCache: {
        getAll(tableName) {
          if (tableName === 'nodes') {
            return RETAINED_NODE_IDS.map(buildNodeRow);
          }
          if (tableName === 'node_endpoints') {
            return RETAINED_NODE_IDS.map(buildEndpointRow);
          }
          if (tableName === 'services') {
            return [
              ...RETAINED_NODE_IDS.map(buildServiceRow),
              ...buildSpreadPriorityServiceRows(),
            ];
          }
          if (tableName === 'partitions') {
            return PRIORITY_TABLE_IDS.map((tableId) => ({
              table_id: tableId,
              table_name: tableId,
              partition_id: `${tableId}-p1`,
              state: 'NORMAL',
            }));
          }
          if (tableName === 'control_plane_publications') {
            return [durableRow];
          }
          return [];
        },
      },
      now: () => NOW_MS,
    });
    coordinator.enqueueClusterMembershipReconcile = (reason, context) => {
      enqueued.push({reason, context});
      return true;
    };

    const first = await coordinator.reconcileClusterMembership();
    t.same(sorted(first.publicationRow.publishedActiveNodeIds),
      STALE_PUBLISHED_NODE_IDS, 'hop 1 holds the trim');
    t.equal(first.publicationRow.priorityPartitionSummary?.satisfied, true,
      'hop 1 writes the census-refreshed summary');
    t.same(enqueued.map((entry) => entry.reason), ['priority_summary_refreshed'],
      'the refresh write enqueues the next reconcile itself');

    const second = await coordinator.reconcileClusterMembership(
      enqueued[0].context,
    );
    t.same(sorted(second.candidate.publishedActiveNodeIds), RETAINED_NODE_IDS,
      'hop 2 trims the durably non-serving member');
    t.equal(second.candidate.publicationEpoch, NEXT_PUBLICATION_EPOCH);
    t.equal(enqueued.length, 1, 'no further self-enqueue: the hop is bounded');
  });
