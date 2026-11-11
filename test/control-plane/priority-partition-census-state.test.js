// The census state a publication row's priority summary states, at its
// owner (membership-publication-priority-partition-summary.js) and at the
// producers and readers that consume it: the candidate derivation, the row
// builder, the owner's refresh change, the one spread rule and the serve
// decision.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  PRIORITY_PARTITION_CENSUS_STATE,
  arePriorityPartitionSummariesEqual,
  normalizePriorityPartitionSummary,
  readPriorityPartitionCensusState,
  statePriorityPartitionSummary,
} from '../../src/control-plane/membership-publication-priority-partition-summary.js';
import {
  buildMembershipPublicationRow,
  deriveMembershipPublicationCandidate,
} from '../../src/control-plane/membership-publication-planning-evidence.js';
import {
  membershipPublicationRefreshChange,
} from '../../src/control-plane/membership-publication-row-changes.js';
import {
  resolvePrioritySpreadPending,
} from '../../src/control-plane/publication-recovery-priority-spread.js';
import {
  hasPriorityRecoverySpreadGap,
} from '../../src/control-plane/priority-recovery-planning-intent.js';
import {normalizeControlPlanePublicationRow} from
  '../../src/control-plane/system-row-normalizers.js';
import {MembershipPublicationCoordinator} from
  '../../src/control-plane/membership-publication-coordinator.js';
import {
  MEMBERSHIP_PUBLICATION_READ_SOURCE,
} from '../../src/control-plane/membership-publication-row-contract.js';
import {
  SeedMap,
  createRecordingReconcileQueue,
} from '../helpers/recording-reconcile-queue.js';

const {DERIVED, NOT_DERIVED, ABSENT} = PRIORITY_PARTITION_CENSUS_STATE;
const NODES = Object.freeze(['node-1', 'node-2', 'node-3']);
const CENSUS = Object.freeze({
  satisfied: true,
  requiredDistinctNodeCount: 3,
  readyEligibleNodeCount: 3,
  totalPriorityPartitionCount: 6,
  missingPartitionIds: [],
  blockedPartitions: [],
});

function durableRow(overrides = {}) {
  return {
    publication_id: 'publication-7',
    publication_kind: 'cluster_membership',
    publication_epoch: 7,
    publication_revision: 3,
    publisher_node_id: 'node-1',
    published_active_node_ids: JSON.stringify(NODES),
    required_ack_node_ids: JSON.stringify(NODES),
    acknowledged_node_ids: JSON.stringify(NODES),
    priority_partition_summary: JSON.stringify(CENSUS),
    membership_lifecycle_summary: JSON.stringify(
      {lifecycleState: 'published_active'}),
    transition_history: '[]',
    status: 'PUBLISHED',
    updated_at: 1000,
    ...overrides,
  };
}

test('the census state reader names derived, not derived and absent', () => {
  assert.equal(readPriorityPartitionCensusState(CENSUS), DERIVED);
  assert.equal(readPriorityPartitionCensusState(
    statePriorityPartitionSummary(null)), NOT_DERIVED);
  for (const absent of [null, undefined, '', 0, [], 'not_derived']) {
    assert.equal(readPriorityPartitionCensusState(absent), ABSENT);
  }
  assert.equal(statePriorityPartitionSummary(CENSUS), CENSUS,
    'a derived census is stated as it is');
});

test('a NOT_DERIVED summary survives the row codec and normalization, and never equals a census', () => {
  const stated = statePriorityPartitionSummary(undefined);
  const decoded = normalizeControlPlanePublicationRow(durableRow({
    priority_partition_summary: JSON.stringify(stated),
  })).priorityPartitionSummary;
  assert.equal(readPriorityPartitionCensusState(decoded), NOT_DERIVED);
  const normalized = normalizePriorityPartitionSummary(decoded);
  assert.equal(readPriorityPartitionCensusState(normalized), NOT_DERIVED);
  assert.equal(normalized.satisfied, false);
  assert.equal(arePriorityPartitionSummariesEqual(stated, decoded), true);
  // The census a derivation could produce with the same counts is not it.
  assert.equal(arePriorityPartitionSummariesEqual(stated, {
    satisfied: false,
    requiredDistinctNodeCount: 0,
    readyEligibleNodeCount: 0,
    totalPriorityPartitionCount: 0,
    missingPartitionIds: [],
    blockedPartitions: [],
  }), false);
});

test('every reader of the spread rule holds on a NOT_DERIVED summary', () => {
  const stated = statePriorityPartitionSummary(null);
  assert.equal(hasPriorityRecoverySpreadGap(stated), true);
  assert.equal(
    resolvePrioritySpreadPending({priorityPartitionSummary: stated}), true);
  assert.equal(
    resolvePrioritySpreadPending({priorityPartitionSummary: CENSUS}), false);
});

test('a candidate planned without census inputs asks for no summary refresh, and the row admitted from it states NOT_DERIVED', () => {
  const latest = normalizeControlPlanePublicationRow(durableRow());
  const planning = {
    latestPublicationRow: latest,
    latestPublishedPublicationRow: latest,
    requiredAckNodeIds: [...NODES],
    acknowledgedNodeIds: [...NODES],
    nodeRows: [],
    nodeEndpointRows: [],
    serviceRows: [],
    partitionRows: [],
    replicaOperationRows: [],
    readinessEntries: [],
    publisherNodeId: 'node-1',
    nowMs: 2000,
  };
  const unchanged = deriveMembershipPublicationCandidate({
    ...planning,
    publishedActiveNodeIds: [...NODES],
  });
  assert.equal(unchanged.changed, false);
  assert.equal(
    readPriorityPartitionCensusState(unchanged.priorityPartitionSummary),
    ABSENT, 'the candidate derived no census');
  assert.equal(unchanged.priorityPartitionSummaryChanged, false,
    'only a derived census moves the latest row\'s summary');

  const nextEpoch = deriveMembershipPublicationCandidate({
    ...planning,
    publishedActiveNodeIds: ['node-1', 'node-2'],
    requiredAckNodeIds: ['node-1', 'node-2'],
    acknowledgedNodeIds: ['node-1', 'node-2'],
  });
  assert.equal(nextEpoch.changed, true);
  assert.equal(nextEpoch.publicationEpoch, 8);
  const admitted = buildMembershipPublicationRow({
    candidate: nextEpoch, nowMs: 2000});
  assert.equal(
    readPriorityPartitionCensusState(admitted.priority_partition_summary),
    NOT_DERIVED,
    'the new epoch never inherits the previous epoch\'s census and never carries no summary');
});

test('the row builder never builds a row without a summary', () => {
  const row = buildMembershipPublicationRow({
    candidate: {
      publicationEpoch: 8,
      publishedActiveNodeIds: [...NODES],
      requiredAckNodeIds: [...NODES],
      acknowledgedNodeIds: [],
    },
    nowMs: 2000,
  });
  assert.equal(
    readPriorityPartitionCensusState(row.priority_partition_summary),
    NOT_DERIVED);
  const withCensus = buildMembershipPublicationRow({
    candidate: {
      publicationEpoch: 8,
      publishedActiveNodeIds: [...NODES],
      requiredAckNodeIds: [...NODES],
      acknowledgedNodeIds: [],
      priorityPartitionSummary: CENSUS,
    },
    nowMs: 2000,
  });
  assert.deepEqual(withCensus.priority_partition_summary, CENSUS);
});

test('the owner\'s refresh never replaces a derived census with NOT_DERIVED, and states NOT_DERIVED on a row that has no summary', () => {
  const offered = statePriorityPartitionSummary(null);
  const lifecycle = {lifecycleState: 'published_active',
    projectedServingNodeIds: [...NODES]};
  const overCensus = membershipPublicationRefreshChange({
    priorityPartitionSummary: offered,
    membershipLifecycleSummary: lifecycle,
    acknowledgedNodeIds: [...NODES],
    now: () => 2000,
  })(durableRow());
  assert.deepEqual(
    normalizePriorityPartitionSummary(
      normalizeControlPlanePublicationRow(overCensus).priorityPartitionSummary),
    normalizePriorityPartitionSummary(CENSUS),
    'the durable census stands');

  const overAbsent = membershipPublicationRefreshChange({
    priorityPartitionSummary: offered,
    membershipLifecycleSummary: lifecycle,
    acknowledgedNodeIds: [...NODES],
    now: () => 2000,
  })(durableRow({priority_partition_summary: null}));
  assert.equal(readPriorityPartitionCensusState(
    normalizeControlPlanePublicationRow(overAbsent).priorityPartitionSummary),
  NOT_DERIVED);

  const derivedOverNotDerived = membershipPublicationRefreshChange({
    priorityPartitionSummary: CENSUS,
    membershipLifecycleSummary: lifecycle,
    acknowledgedNodeIds: [...NODES],
    now: () => 2000,
  })(durableRow({priority_partition_summary: JSON.stringify(offered)}));
  assert.equal(readPriorityPartitionCensusState(
    normalizeControlPlanePublicationRow(derivedOverNotDerived)
      .priorityPartitionSummary), DERIVED);
  assert.equal(
    normalizeControlPlanePublicationRow(derivedOverNotDerived)
      .priorityPartitionSummary.satisfied, true);
});

// The owner driver's tick on the publications leader, with the planning
// snapshot it would read (the planning evidence is not under test): what it
// asks its queue for.
async function driverRequestsFor(latestPublicationRow) {
  const enqueued = [];
  const coordinator = new MembershipPublicationCoordinator({
    nodeId: 'node-1',
    reconcileQueue: createRecordingReconcileQueue(
      {pending: new SeedMap(), enqueued}),
    systemTableCache: {getAll: () => [], get: () => null},
    cdcIntegrationService: {canWriteSystemTableLocally: () => true},
    resolveIsControlPlanePublicationsWriteLeader: () => true,
    now: () => 5000,
    logger: {debug() {}, info() {}, warn() {}, error() {},
      logConsoleOnly() {}},
  });
  coordinator.readPublicationPlanningSnapshot = async () => ({
    latestPublicationRow,
    latestPublishedPublicationRow: latestPublicationRow,
    nodeRows: [],
    readinessByNodeId: {},
  });
  try {
    await coordinator.driveOwnerMembershipReconcile();
  } finally {
    coordinator.stopOwnerMembershipDriver();
  }
  return enqueued;
}

test('the owner driver asks for a full reconcile while the latest durable row states NOT_DERIVED, and for nothing once the census is derived', async () => {
  const notDerived = await driverRequestsFor(durableRow({
    priority_partition_summary:
      JSON.stringify(statePriorityPartitionSummary(null)),
  }));
  assert.deepEqual(notDerived.map((entry) => entry.reason),
    ['priority_census_not_derived']);
  const [request] = notDerived;
  assert.equal(request.context.readSource,
    MEMBERSHIP_PUBLICATION_READ_SOURCE.AUTHORITATIVE_PREFERRED,
    'the full reconcile reads the durable owner');
  assert.equal(request.context.publicationActiveGateHandoff, undefined,
    'no handoff: the reconcile reads the census inputs');
  assert.equal(request.context.allowEmptyPreloadedRows, undefined);
  assert.equal(request.context.serviceRows, undefined);

  assert.deepEqual(await driverRequestsFor(durableRow()), [],
    'a derived census owes nothing');
  assert.deepEqual(
    await driverRequestsFor(durableRow({priority_partition_summary: null})),
    [], 'the driver asks only on the state the owner names');
});
