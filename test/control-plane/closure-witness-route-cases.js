// The row sets that drive the REAL membership-publication candidate
// derivation down each of the three closure-evidence routes, shared by the
// pure-derivation witness and by the end-to-end guard host so neither copies
// the other's fixtures (quest closure-witness-route-observed).
//
// The shape is the recorded 2026-09-19 refusal's: four voters of a critical
// control-plane partition on two nodes, a third node holding the catch-up
// learner, and one in-flight ADD per critical partition targeting it.

const NOW_MS = Date.parse('2026-09-19T08:10:28.458Z');
const NODE_A = 'node-a';
const NODE_B = 'node-b';
const LEARNER_NODE = 'node-l';
const NODE_D = 'node-d';
const NODE_E = 'node-e';
const NODE_IDS = Object.freeze([NODE_A, NODE_B, LEARNER_NODE, NODE_D, NODE_E]);
const SUBJECT_PARTITION_ID = 'schema_operations-p1';
const CRITICAL_PARTITION_IDS = Object.freeze([
  SUBJECT_PARTITION_ID,
  'sql_transactions-p1',
  'sql_transaction_participants-p1',
  'sql_write_operations-p1',
]);
const SPREAD_PARTITION_IDS = Object.freeze([
  'control_plane_publications-p1',
  'replica_operations-p1',
]);
const PARTITION_ID_SUFFIX_LENGTH = -3;
const REPLICA_COUNT = 3;
const HEARTBEAT_AGE_MS = 500;
const ROW_AGE_MS = 1000;
const OPERATION_AGE_MS = 5000;
const READY_LEASE_MS = 60000;
const NODE_AGE_MS = 60000;
const PUBLICATION_EPOCH = 4;
const SERVICE_ADDRESS_PORT = ':7000';
const SERVICE_ADDRESS_SCHEME = 'ws://';

// The four routes the witnesses drive. `retainedSatisfied` is the live
// suspect: a retained witness that already carries a refreshed summary, so
// the closure choice takes it without the node's own rows saying anything.
const CLOSURE_ROUTE_CASE = Object.freeze({
  BUILT_CLOSURE_REFRESHED: 'built-closure-refreshed',
  BUILT_CLOSURE_PENDING: 'built-closure-pending',
  NONE_NO_OPERATION_ROWS: 'none-no-operation-rows',
  RETAINED_SATISFIED_WITNESS: 'retained-satisfied-witness',
});
const CLOSURE_ROUTE_CASE_IDS = Object.freeze(Object.values(CLOSURE_ROUTE_CASE));

function serviceRow(partitionId, replicaIndex, nodeId, raftRole, status) {
  return {
    service_id: `${partitionId}-r${replicaIndex}`,
    replica_id: `${partitionId}-r${replicaIndex}`,
    partition_id: partitionId,
    service_type: 'partition',
    node_id: nodeId,
    status: status || 'active',
    raft_role: raftRole,
    address: `${SERVICE_ADDRESS_SCHEME}${nodeId}${SERVICE_ADDRESS_PORT}`,
    updated_at: NOW_MS - ROW_AGE_MS,
  };
}

// `voterVisibleTarget` is the only row that differs between the two built
// cases: with it the in-flight ADD's target is voter-visible and the spread
// completion certifies, without it the partition stays recovering-in-flight.
function buildServiceRows(voterVisibleTarget) {
  const rows = [];
  for (const partitionId of CRITICAL_PARTITION_IDS) {
    rows.push(
      serviceRow(partitionId, 1, NODE_A, 'leader'),
      serviceRow(partitionId, 2, NODE_A, 'follower'),
      serviceRow(partitionId, 3, NODE_A, 'follower'),
      serviceRow(partitionId, 4, NODE_B, 'follower'),
    );
    if (voterVisibleTarget === true) {
      rows.push(serviceRow(partitionId, 5, LEARNER_NODE, 'follower', 'syncing'));
    }
  }
  for (const partitionId of SPREAD_PARTITION_IDS) {
    rows.push(
      serviceRow(partitionId, 1, NODE_A, 'leader'),
      serviceRow(partitionId, 2, NODE_B, 'follower'),
      serviceRow(partitionId, 3, NODE_D, 'follower'),
    );
  }
  return rows;
}

function buildReplicaOperationRows() {
  return CRITICAL_PARTITION_IDS.map((partitionId, index) => ({
    operation_id: `op-${index}`,
    id: `op-${index}`,
    entity_type: 'partition',
    entity_id: partitionId,
    partition_id: partitionId,
    type: 'ADD',
    status: 'syncing',
    workflow_step: 'SYNCING',
    target_node_id: LEARNER_NODE,
    replica_id: `${partitionId}-r5`,
    created_at: NOW_MS - OPERATION_AGE_MS,
    updated_at: NOW_MS - ROW_AGE_MS,
    steps_history: [{step: 'SYNCING', timestamp: NOW_MS - ROW_AGE_MS}],
  }));
}

function buildPartitionRows() {
  return [...CRITICAL_PARTITION_IDS, ...SPREAD_PARTITION_IDS].map(
    (partitionId) => ({
      partition_id: partitionId,
      table_id: partitionId.slice(0, PARTITION_ID_SUFFIX_LENGTH),
      replica_count: REPLICA_COUNT,
    }),
  );
}

function buildNodeRows() {
  return NODE_IDS.map((nodeId) => ({
    node_id: nodeId,
    status: 'active',
    connection_state: 'ready',
    last_heartbeat: NOW_MS - HEARTBEAT_AGE_MS,
    ready_lease_expires_at: NOW_MS + READY_LEASE_MS,
    created_at: NOW_MS - NODE_AGE_MS,
  }));
}

function buildReadinessEntries() {
  return NODE_IDS.map((nodeId) => ({
    node_id: nodeId,
    nodeId,
    ready: true,
    phase: 'TRAFFIC_READY',
    reasons: [],
    draining: false,
  }));
}

function buildPublicationRow() {
  return {
    publication_epoch: PUBLICATION_EPOCH,
    status: 'PUBLISHED',
    published_active_node_ids: [...NODE_IDS],
    required_ack_node_ids: [...NODE_IDS],
    acknowledged_node_ids: [...NODE_IDS],
  };
}

// One case's derivation options. `priorityRecoveryPlanningSnapshot` is the
// only way the retained route is reachable: the closure evidence owner takes
// that witness outright, before it reads a single local row.
function buildClosureRouteCaseInput(caseId, retainedClosureWitness = null) {
  const withoutOperations = caseId === CLOSURE_ROUTE_CASE.NONE_NO_OPERATION_ROWS;
  const voterVisibleTarget =
    caseId === CLOSURE_ROUTE_CASE.BUILT_CLOSURE_REFRESHED;
  const publicationRow = buildPublicationRow();
  return {
    publisherNodeId: LEARNER_NODE,
    nowMs: NOW_MS,
    sourceTopologyEpoch: 1,
    sourceSnapshotVersion: 1,
    latestPublicationRow: publicationRow,
    latestPublishedPublicationRow: publicationRow,
    nodeRows: buildNodeRows(),
    readinessEntries: buildReadinessEntries(),
    serviceRows: buildServiceRows(voterVisibleTarget),
    partitionRows: buildPartitionRows(),
    replicaOperationRows: withoutOperations ? [] : buildReplicaOperationRows(),
    connectedNodeIds: [...NODE_IDS],
    priorityRecoveryPlanningSnapshot:
      caseId === CLOSURE_ROUTE_CASE.RETAINED_SATISFIED_WITNESS &&
      retainedClosureWitness ?
        {priorityRecoveryClosureWitness: retainedClosureWitness} :
        null,
  };
}

// The same rows as system-table rows, for a host whose REAL readiness service
// derives the candidate itself.
function buildClosureRouteCacheRows(caseId) {
  const input = buildClosureRouteCaseInput(caseId);
  return Object.freeze({
    nowMs: NOW_MS,
    nodeRows: input.nodeRows,
    serviceRows: input.serviceRows,
    partitionRows: input.partitionRows,
    replicaOperationRows: input.replicaOperationRows,
    publicationRow: {
      ...input.latestPublicationRow,
      publication_id: 'publication-1',
      publication_kind: 'cluster_membership',
      publisher_node_id: NODE_A,
      created_at: NOW_MS - ROW_AGE_MS,
      updated_at: NOW_MS - ROW_AGE_MS,
    },
  });
}

export {
  CLOSURE_ROUTE_CASE,
  CLOSURE_ROUTE_CASE_IDS,
  LEARNER_NODE,
  NOW_MS,
  SUBJECT_PARTITION_ID,
  buildClosureRouteCacheRows,
  buildClosureRouteCaseInput,
};
