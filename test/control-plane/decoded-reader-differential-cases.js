/**
 * The decoded-reader differential (quest system-table-row-decoders, round-4
 * ruling 2026-11-09): for every decoded reader of nodes, services and
 * replica_operations rows, and for every non-key column of the table's
 * stored schema, a full row lacking that one column is applied as a CDC
 * UPDATE to a real SystemTableCache that does not hold the key (the RD-1
 * shape: the cache stores the partial row; the candidate marks it with the
 * observed columns), and the reader is run on what the cache holds.
 *
 * HEAD 730225bf1 ran its own reader on the raw partial row; its answers are
 * frozen in test/fixtures/decoded-reader-differential/head-730225bf1.json.
 * The candidate's reader on the marked row must give the same answer, or the
 * same refusal code. Each case has a `head` adapter (HEAD's entry point,
 * used only to regenerate the fixture) and a `current` adapter (this tree's
 * entry point to the same reader); both return plain JSON through `answer`.
 * Regenerate (only when HEAD's answer itself is meant to change, never to
 * make the test pass):
 *   git -C <repo> archive 730225bf1 | tar -x -C <dir>
 *   ln -s <repo>/node_modules <dir>/node_modules
 *   node test/control-plane/decoded-reader-differential.test.js \
 *     --write-head-fixture <dir>
 */
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const NOW_MS = 1_000_000;
const LEASE_FUTURE_MS = NOW_MS + 60_000;
const PRIORITY_PARTITION_ID = 'replica_operations-p1';
const SUBJECT_NODE_ID = 'n-3';
const SUBJECT_SERVICE_ID = 's-3';
const SUBJECT_OPERATION_ID = 'op-3';
const NOT_OBSERVED_TOKEN = 'SYMBOL';
const UNKNOWN_STATUS = 'not_a_status';
const UNDEFINED_TOKEN = 'UNDEFINED';

// Full stored rows: every column carries a value (a NULL column could not
// show the difference between a missing key and a stored NULL).
function nodesRow(nodeId, overrides = {}) {
  return {
    node_id: nodeId,
    node_address: `ws://${nodeId}:8080`,
    cpu_cores: 4,
    memory_mb: 4096,
    disk_gb: 64,
    cpu_usage_percent: 1.5,
    memory_usage_percent: 2.5,
    disk_usage_percent: 3.5,
    status: 'active',
    connection_state: 'ready',
    capabilities: '[]',
    last_heartbeat: NOW_MS - 1_000,
    boot_incarnation: 1,
    ready_lease_expires_at: LEASE_FUTURE_MS,
    storage_budget_bytes: 1024,
    storage_budget_source: 'configured',
    storage_budget_updated_at: NOW_MS - 5_000,
    latency_group_id: 'lg-1',
    last_latency_check_at: NOW_MS - 5_000,
    latency_assignment_state: 'assigned',
    created_at: 1,
    ...overrides,
  };
}

function servicesRow(serviceId, nodeId, overrides = {}) {
  return {
    service_id: serviceId,
    service_type: 'partition',
    node_id: nodeId,
    partition_id: PRIORITY_PARTITION_ID,
    group_id: 'g-1',
    replica_id: serviceId,
    raft_role: 'follower',
    status: 'active',
    state_entered_at: 5,
    previous_state: 'syncing',
    trigger_reason: 'tr',
    error_message: 'em',
    cleanup_token: 'ct',
    create_attempt_token: 'cat',
    address: `ws://${nodeId}:8080`,
    created_at: 2,
    updated_at: 3,
    ...overrides,
  };
}

function replicaOperationsRow(overrides = {}) {
  return {
    operation_id: SUBJECT_OPERATION_ID,
    type: 'ADD',
    partition_id: PRIORITY_PARTITION_ID,
    entity_type: 'message_group',
    entity_id: 'mg-1',
    membership_publication_epoch: 7,
    message_group_membership_owner_claim: 'oc',
    message_group_membership_permit: 'pm',
    source_replica_id: 'sr',
    message_group_membership_lane_key: 'lk',
    message_group_membership_phase: 'ph',
    message_group_membership_obligation_state: 'os',
    message_group_membership_identity: 'id',
    message_group_learner_stamp: 'ls',
    message_group_voter_stamp: 'vs',
    message_group_removal_stamp: 'rs',
    message_group_source_lifecycle_claim: 'lc',
    create_admission_state: 'cs',
    create_admission_token: 'ct',
    create_admission_replica_created_at: 11,
    create_admission_attempt_token: 'at',
    create_admission_previous_attempt_token: 'pt',
    create_admission_attempt_seq: 2,
    create_admission_workflow_updated_at: 12,
    create_admission_owner_incarnation: 3,
    replica_id: 'r-3',
    target_claim_key: 'tc',
    source_node_id: 'n-1',
    target_node_id: SUBJECT_NODE_ID,
    status: 'pending',
    workflow_step: 'PENDING',
    created_at: 1,
    updated_at: 2,
    completed_at: 4,
    lease_expires_at: LEASE_FUTURE_MS,
    error_message: 'em',
    steps_history: '[{"step":"PENDING"}]',
    ...overrides,
  };
}

const NULLABLE_SERVICES_COLUMNS = Object.freeze(['partition_id', 'group_id', 'replica_id',
  'raft_role', 'state_entered_at', 'previous_state', 'trigger_reason', 'error_message',
  'cleanup_token', 'create_attempt_token', 'address']);

const PEER_NODE_ROWS = Object.freeze([nodesRow('n-1'), nodesRow('n-2')]);
const PEER_SERVICE_ROWS = Object.freeze([
  servicesRow('s-1', 'n-1', {raft_role: 'leader'}),
  servicesRow('s-2', 'n-2'),
]);

/**
 * The modules a reader adapter needs, imported from one tree.
 * @param {string} root the tree's root directory
 * @return {Promise<Object>} the modules by short name
 */
async function loadTreeModules(root) {
  const load = (relative) => import(pathToFileURL(path.join(root, relative)).href);
  const [config, logging, cache, topology, mesh, joinSnapshot, activeNode,
    criticalTopology, globalProjection, tableImpact, recoveryOwner,
    operationRepository, readinessConstants, schemas, cdcSql, budgetPlanning,
    inventory] = await Promise.all([
    load('src/config/configuration-manager.js'),
    load('src/logging/logging-service.js'),
    load('src/cache/system-table-cache.js'),
    load('src/bootstrap/bootstrap-topology-snapshot.js'),
    load('src/bootstrap/join-readiness-mesh-connectivity-methods.js'),
    load('src/bootstrap/join-readiness-snapshot-methods.js'),
    load('src/control-plane/active-node-projection.js'),
    load('src/rebalancer/unified-rebalancer-critical-topology-methods.js'),
    load('src/control-plane/readiness-planning-global-projection.js'),
    load('src/control-plane/readiness-planning-table-impact-classification.js'),
    load('src/control-plane/priority-recovery-scheduling-owner-policy.js'),
    load('src/rebalancer/replica-operation-repository.js'),
    load('src/control-plane/control-plane-readiness-constants.js'),
    load('src/bootstrap/system-table-schemas-constants.js'),
    load('src/partition/partition-cdc-parameterized-sql.js'),
    load('src/rebalancer/unified-rebalancer-budget-planning.js'),
    load('src/rebalancer/replica-inventory.js'),
  ]);
  config.ConfigurationManager.getInstance().initialize({node: {id: 'n-1'}});
  logging.LoggingService.getInstance().initialize({level: 'error'});
  return {root, load, cache, topology, mesh, joinSnapshot, activeNode,
    criticalTopology, globalProjection, tableImpact, recoveryOwner,
    operationRepository, readinessConstants, schemas, cdcSql, budgetPlanning, inventory};
}

// A JSON-safe answer: a Symbol (a leaked named state) and undefined are
// spelled out, Sets and Maps listed; a thrown error is its code.
function encodeValue(value) {
  if (typeof value === 'symbol') return NOT_OBSERVED_TOKEN;
  if (value === undefined) return UNDEFINED_TOKEN;
  if (value instanceof Set) return [...value].map(encodeValue);
  if (value instanceof Map) {
    return [...value.entries()].map(([key, entry]) => [encodeValue(key), encodeValue(entry)]);
  }
  if (Array.isArray(value)) return value.map(encodeValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort()
      .map((key) => [key, encodeValue(value[key])]));
  }
  return value;
}

function answer(run) {
  try {
    return {ok: encodeValue(run())};
  } catch (error) {
    return {refused: String(error?.code ?? error?.name ?? 'error')};
  }
}

function cacheHolding(mods, tableName, peerRows, subjectRow) {
  const systemTableCache = new mods.cache.SystemTableCache();
  for (const row of peerRows) {
    systemTableCache.applySystemTableChange(tableName, mods.cache.CDC_OPERATIONS.INSERT, row);
  }
  systemTableCache.applySystemTableChange(tableName, mods.cache.CDC_OPERATIONS.UPDATE,
    subjectRow);
  return systemTableCache;
}

function sourceRowsByTable(rowsByTable) {
  const byTable = new Map();
  for (const [tableName, {key, rows}] of Object.entries(rowsByTable)) {
    byTable.set(tableName, new Map(rows.map((row) => [row[key], row])));
  }
  return byTable;
}

// The critical-topology entry point over a stub rebalancer: every
// collaborator answers a fixed, ready topology, so only the nodes rows
// decide the blocker.
function criticalTopologyBlocker(mods, systemTableCache) {
  class StubRebalancer {}
  mods.criticalTopology.applyUnifiedRebalancerCriticalTopologyMethods(StubRebalancer);
  const rebalancer = Object.assign(new StubRebalancer(), {
    nodeId: 'n-1',
    systemTableCache,
    controlPlaneReadinessService: {getNodeReadinessSync: () => ({ready: true})},
    isSystemPartitionEntity: () => true,
    getStartupAuthorityNodeIdSet: () => new Set(),
    shouldBypassLocalPriorityControlPlaneStartupReadiness: () => false,
    resolveNodeReadinessDecisionDimension: () => 'ready',
    isReadinessDimensionSatisfied: () => true,
    isFormationCohortSpreadCureTarget: () => false,
    resolveCriticalSystemRequiredHealthyNodeCount: (count) => count,
    isRecoveryLanePartition: () => false,
    shouldRequireFullControlPlanePublicationEndpointVisibility: () => true,
    resolveConnectedClusterNodeIds: () => new Set(['n-1', 'n-2', SUBJECT_NODE_ID]),
    getPublishedActiveNodeIdSet: () => new Set(),
    getCriticalSystemEndpointVisibilityPolicy: () => ({}),
    evaluateCriticalSystemEndpointVisibility: () => ({ready: true}),
    // One in-flight operation, so the blocker names the active node ids.
    collectCriticalSystemInFlightReplicaOperations: () =>
      ({count: 1, details: [], source: 'stub'}),
  });
  return rebalancer.getCriticalSystemTopologySettlingBlocker();
}

function readinessOptions(mods, nodeRows) {
  const dimension = mods.readinessConstants.CONTROL_PLANE_READINESS_DIMENSION;
  return {
    nodeRows,
    nowMs: NOW_MS,
    allowControlPlaneRecoveryEligibleProjection: true,
    allowLivenessFallbackProjection: true,
    readinessEntries: nodeRows.map((row) => ({
      nodeId: row.node_id,
      dimensions: {[dimension.CONTROL_PLANE_RECOVERY_ELIGIBLE]: false},
    })),
  };
}

const NODES_CASES = Object.freeze({
  'nodes:bootstrap-topology-active-node-ids': (mods, systemTableCache) =>
    mods.topology.buildBootstrapTopologySnapshotEnvelope({
      systemTableCache, hydrationTables: ['nodes'], now: () => NOW_MS,
    }).topologySnapshotMeta.activeNodeIds,
  'nodes:mesh-connectivity-node-id-and-status': (mods, systemTableCache) => {
    const methods = mods.mesh.createJoinReadinessMeshConnectivityMethods();
    const row = systemTableCache.get('nodes', SUBJECT_NODE_ID);
    return [methods.resolveMeshConnectivityNodeId(row),
      methods.resolveMeshConnectivityNodeStatus(row)];
  },
  'nodes:join-readiness-cache-and-readiness-active-node-ids': (mods, systemTableCache) => {
    const methods = mods.joinSnapshot.createJoinReadinessEvaluatorSnapshotMethods();
    const rows = systemTableCache.getAll('nodes');
    const dimension = mods.readinessConstants.CONTROL_PLANE_READINESS_DIMENSION;
    const readinessService = {getNodeReadinessSync: () => ({
      dimensions: {[dimension.CONTROL_PLANE_RECOVERY_ELIGIBLE]: true},
    })};
    return [methods.getCacheActiveNodeIds.value.call({}, rows),
      methods.getReadinessActiveNodeIds.value.call({}, readinessService, rows)];
  },
  'nodes:canonically-active-node': (mods, systemTableCache) => {
    const rows = systemTableCache.getAll('nodes');
    const row = systemTableCache.get('nodes', SUBJECT_NODE_ID);
    return [mods.activeNode.isCanonicallyActiveNode(row, {nowMs: NOW_MS}),
      mods.activeNode.isCanonicallyActiveNode(row, readinessOptions(mods, rows))];
  },
  'nodes:projected-active-node-ids': (mods, systemTableCache) => {
    const rows = systemTableCache.getAll('nodes');
    return [mods.activeNode.resolveProjectedActiveNodeIds({nodeRows: rows, nowMs: NOW_MS}),
      mods.activeNode.resolveProjectedActiveNodeIds(readinessOptions(mods, rows))];
  },
  'nodes:critical-topology-settling-blocker': (mods, systemTableCache) =>
    criticalTopologyBlocker(mods, systemTableCache),
});

function globalProjectionSourceRows(systemTableCache) {
  return sourceRowsByTable({
    nodes: {key: 'node_id', rows: [...PEER_NODE_ROWS, nodesRow(SUBJECT_NODE_ID)]},
    services: {key: 'service_id', rows: systemTableCache.getAll('services')},
    partitions: {key: 'partition_id', rows: []},
  });
}

// The planning records compare among themselves only; a stored NULL reads
// '' at HEAD and ROW_ABSENT (null) since round 2 (verified), so records are
// compared with null spelled ''.
function comparableProjection(projection) {
  const encoded = encodeValue(projection);
  if (Array.isArray(encoded?.priorityServices)) {
    encoded.priorityServices = encoded.priorityServices.map((record) =>
      Object.fromEntries(Object.entries(record).map(([field, value]) =>
        [field, value === null ? '' : value])));
  }
  return encoded;
}

const SERVICES_CASES = Object.freeze({
  'services:canonical-active-service': (mods, systemTableCache, current) => {
    const rows = systemTableCache.getAll('services');
    const serviceRows = current ? current.decodeServicesRows(rows) : rows;
    return ['n-1', SUBJECT_NODE_ID, ''].map((nodeId) =>
      mods.activeNode.hasCanonicalActiveService(nodeId, serviceRows));
  },
  'services:planning-global-projection-full-build': (mods, systemTableCache) =>
    comparableProjection(mods.globalProjection.buildDirectGlobalProjection(
      globalProjectionSourceRows(systemTableCache))),
  'services:planning-global-projection-incremental': (mods, systemTableCache) => {
    const before = globalProjectionSourceRows(systemTableCache);
    const fullSubject = servicesRow(SUBJECT_SERVICE_ID, SUBJECT_NODE_ID);
    before.get('services').set(SUBJECT_SERVICE_ID, fullSubject);
    const previous = mods.globalProjection.buildDirectGlobalProjection(before);
    const after = globalProjectionSourceRows(systemTableCache);
    return comparableProjection(mods.globalProjection.buildDirectGlobalProjection(after,
      previous, 'services', {
        previousRecord: fullSubject,
        currentRecord: systemTableCache.get('services', SUBJECT_SERVICE_ID),
      }));
  },
  'services:planning-table-impact': (mods, systemTableCache) => {
    const before = globalProjectionSourceRows(systemTableCache);
    const fullSubject = servicesRow(SUBJECT_SERVICE_ID, SUBJECT_NODE_ID);
    before.get('services').set(SUBJECT_SERVICE_ID, fullSubject);
    const previous = mods.globalProjection.buildDirectGlobalProjection(before);
    const current = mods.globalProjection.buildDirectGlobalProjection(
      globalProjectionSourceRows(systemTableCache));
    return mods.tableImpact.classifyShadowTableImpact('services', fullSubject,
      systemTableCache.get('services', SUBJECT_SERVICE_ID), previous, current);
  },
  // The previous row stores NULL where the partial row lacks a nullable
  // column: HEAD read missing and NULL alike, so the change is no semantic
  // change; a reading that tells them apart would rebuild.
  'services:planning-table-impact-missing-versus-null': (mods, systemTableCache) => {
    const partial = systemTableCache.get('services', SUBJECT_SERVICE_ID);
    const previous = servicesRow(SUBJECT_SERVICE_ID, SUBJECT_NODE_ID, {raft_role: 'leader'});
    for (const column of NULLABLE_SERVICES_COLUMNS) {
      if (!Object.hasOwn(partial, column)) previous[column] = null;
    }
    const before = globalProjectionSourceRows(systemTableCache);
    before.get('services').set(SUBJECT_SERVICE_ID, previous);
    const projection = mods.globalProjection.buildDirectGlobalProjection(before);
    return mods.tableImpact.classifyShadowTableImpact('services', previous, partial,
      projection, projection);
  },
  'services:priority-recovery-scheduling-owners': (mods, systemTableCache) =>
    mods.recoveryOwner.buildPriorityRecoverySchedulingOwnersByPartitionId({
      partitionIds: [PRIORITY_PARTITION_ID],
      serviceRows: [systemTableCache.get('services', SUBJECT_SERVICE_ID)],
      availableNodeIds: ['n-1', 'n-2', SUBJECT_NODE_ID],
    }),
});

// The rebalancer's replica readers over a stub entity (the priority
// partition): getCurrentReplicas (selection and the terminal-create
// projection, one terminal ADD naming the subject replica), then the
// healthy and ready-occupied sets for an ordinary and a system entity. At
// HEAD the replicas are raw cache rows, now projected replicas; each is
// summarised by the fields both spell (`summary` per tree).
function rebalancerReplicaSets(mods, systemTableCache, summary) {
  const sets = {};
  for (const systemEntity of [false, true]) {
    const rebalancer = Object.assign(
      Object.create(mods.budgetPlanning.UnifiedRebalancerBudgetPlanning.prototype), {
        entityType: 'partition',
        entityId: PRIORITY_PARTITION_ID,
        nodeId: 'n-1',
        systemTableCache,
        isSystemPartitionEntity: () => systemEntity,
        getAvailableNodes: () => ['n-1', 'n-2', SUBJECT_NODE_ID]
          .map((nodeId) => ({node_id: nodeId})),
        isNodeProcessAlive: () => false,
        getTerminalRetiredReplicaIds: () => new Set(),
        getTerminalSuccessfulCreateOperations: () =>
          [{target_node_id: SUBJECT_NODE_ID, replica_id: SUBJECT_SERVICE_ID}],
        getReplicaIdFromOperationRow: () => SUBJECT_SERVICE_ID,
      });
    const current = rebalancer.getCurrentReplicas();
    sets[systemEntity ? 'system' : 'ordinary'] = {
      current: current.map(summary),
      healthy: rebalancer.getHealthyReplicas(current).map(summary),
      readyOccupied: rebalancer.getReadyNodeOccupiedReplicas(current).map(summary),
    };
  }
  return sets;
}

const HEAD_ROW_SUMMARY = (row) => [row.replica_id || row.service_id,
  String(row.node_id ?? ''), String(row.status ?? ''), String(row.raft_role ?? row.raftRole ?? '')];
const PROJECTED_REPLICA_SUMMARY = (replica) => [replica.replicaId,
  String(replica.nodeId ?? ''), String(replica.status ?? ''), String(replica.raftRole ?? '')];

const CONSUMER_CASES = Object.freeze({
  'services:rebalancer-current-healthy-ready-occupied': (mods, systemTableCache, current) =>
    rebalancerReplicaSets(mods, systemTableCache,
      current ? PROJECTED_REPLICA_SUMMARY : HEAD_ROW_SUMMARY),
  'services:replica-inventory-snapshot': (mods, systemTableCache, current) => {
    const rows = systemTableCache.getAll('services');
    return mods.inventory.buildReplicaInventorySnapshot({
      capturedAtMs: NOW_MS,
      committedRowsObservation: {state: 'present',
        rows: current ? current.projectReplicasFromServicesRows(rows) : rows},
      inFlightOperationObservation: {state: 'present', operations: []},
    });
  },
});

const REPLICA_OPERATIONS_CASES = Object.freeze({
  'replica_operations:row-to-operation': (mods, systemTableCache) =>
    Object.create(mods.operationRepository.ReplicaOperationRepository.prototype)
      .rowToOperation(systemTableCache.get('replica_operations', SUBJECT_OPERATION_ID)),
});

const TABLE_CASES = Object.freeze([
  Object.freeze({table: 'nodes', key: 'node_id', cases: NODES_CASES,
    peers: PEER_NODE_ROWS, subject: () => nodesRow(SUBJECT_NODE_ID)}),
  Object.freeze({table: 'services', key: 'service_id',
    cases: {...SERVICES_CASES, ...CONSUMER_CASES},
    peers: PEER_SERVICE_ROWS,
    subject: () => servicesRow(SUBJECT_SERVICE_ID, SUBJECT_NODE_ID, {raft_role: 'leader'})}),
  Object.freeze({table: 'replica_operations', key: 'operation_id',
    cases: REPLICA_OPERATIONS_CASES, peers: [], subject: () => replicaOperationsRow()}),
]);

// The message-group membership branch selection CAS, verbatim from
// src/rebalancer/replica-operation-message-group-membership-authorization.js
// (branchSelectionSql with the open-settlement predicate; the test asserts
// the source still holds this text). It SETs the three membership columns
// its WHERE also guards, so the CDC read-back by the post-update WHERE
// values misses and the change carries only the SET and WHERE columns.
const MEMBERSHIP_BRANCH_SELECTION_SQL = `UPDATE replica_operations SET message_group_membership_phase = ?,
  message_group_membership_permit = ?, message_group_membership_obligation_state = ?
  WHERE operation_id = ? AND type = ? AND partition_id = ? AND entity_type = ?
  AND entity_id = ? AND source_replica_id = ? AND replica_id = ?
  AND source_node_id = ? AND target_node_id = ?
  AND message_group_membership_lane_key = ? AND message_group_membership_identity = ?
  AND message_group_source_lifecycle_claim = ? AND message_group_membership_owner_claim = ?
  AND status = ? AND workflow_step = ? AND completed_at IS NULL
  AND message_group_membership_phase = ? AND message_group_membership_permit = ?
  AND message_group_membership_obligation_state = ? AND message_group_learner_stamp = ?
  AND message_group_voter_stamp IS NULL AND message_group_removal_stamp IS NULL`;

const QUIET_LOGGER = Object.freeze({debug() {}, info() {}, warn() {}, error() {}});

/**
 * The membership branch selection run on a real SQLite replica_operations
 * table, through the real CDC change extraction (extractParamUpdateData /
 * fetchUpdatedRow) into a real SystemTableCache that does not hold the
 * operation, then read by rowToOperation.
 * @param {Object} mods loadTreeModules of the tree
 * @param {Function} Database the better-sqlite3 constructor
 * @return {Object} `{changes, payloadColumns, operation}` (answer-encoded)
 */
function membershipBranchSelectionAnswer(mods, Database) {
  const stored = replicaOperationsRow({
    message_group_membership_phase: 'p0', message_group_membership_permit: 'm0',
    message_group_membership_obligation_state: 'o0', message_group_voter_stamp: null,
    message_group_removal_stamp: null, completed_at: null,
  });
  const db = new Database(':memory:');
  db.exec(mods.schemas.generateCreateTableSQL(mods.schemas.REPLICA_OPERATIONS_SCHEMA));
  const columns = Object.keys(stored);
  db.prepare(`INSERT INTO replica_operations (${columns.join(', ')}) VALUES ` +
    `(${columns.map(() => '?').join(', ')})`).run(...columns.map((column) => stored[column]));
  const params = ['p1', 'm1', 'o1', stored.operation_id, stored.type, stored.partition_id,
    stored.entity_type, stored.entity_id, stored.source_replica_id, stored.replica_id,
    stored.source_node_id, stored.target_node_id, stored.message_group_membership_lane_key,
    stored.message_group_membership_identity, stored.message_group_source_lifecycle_claim,
    stored.message_group_membership_owner_claim, stored.status, stored.workflow_step,
    'p0', 'm0', 'o0', stored.message_group_learner_stamp];
  const {changes} = db.prepare(MEMBERSHIP_BRANCH_SELECTION_SQL).run(...params);
  const payload = mods.cdcSql.extractParamUpdateData({
    sql: MEMBERSHIP_BRANCH_SELECTION_SQL, params, tableName: 'replica_operations',
    logger: QUIET_LOGGER,
    fetchUpdatedRow: (tableName, whereClause) => mods.cdcSql.fetchUpdatedRow({
      tableName, whereClause, db, logger: QUIET_LOGGER}),
  });
  db.close();
  const systemTableCache = cacheHolding(mods, 'replica_operations', [], payload);
  return {
    changes,
    payloadColumns: Object.keys(payload).sort(),
    operation: answer(() => Object.create(
      mods.operationRepository.ReplicaOperationRepository.prototype)
      .rowToOperation(systemTableCache.get('replica_operations', SUBJECT_OPERATION_ID))),
  };
}

/**
 * Every case's answer for every dropped column (and the full row), on one
 * tree.
 * @param {Object} mods loadTreeModules of the tree
 * @param {Object|null} current this tree's extra modules for `current`
 *   adapters (null when answering for HEAD)
 * @return {Object} `{case: {column: answer}}`
 */
function answerEveryCase(mods, current) {
  const answers = {};
  for (const {table, key, cases, peers, subject} of TABLE_CASES) {
    const columns = Object.keys(subject()).filter((column) => column !== key);
    for (const [name, reader] of Object.entries(cases)) {
      answers[name] = {};
      for (const dropped of ['(none)', ...columns]) {
        const row = subject();
        delete row[dropped];
        const systemTableCache = cacheHolding(mods, table, peers, row);
        answers[name][dropped] = answer(() => reader(mods, systemTableCache, current));
      }
    }
  }
  return answers;
}

// Behaviour cases (rounds 4b and 5, lead decision 2026-11-09 after round
// 4c): fixed reads of full rows, each answered by HEAD's reader and by this
// tree's on the same rows. The decoders read like HEAD (round 5): a stored
// value is kept as stored, an unknown or differently-cased closed-domain
// value and a wrongly-typed value decode to ROW_UNRECOGNISED carrying the
// raw value, and every reader compares exactly as HEAD did (lower-cased
// where HEAD's normaliser lower-cased, raw where HEAD compared raw). So
// every reader, single-row and multi-row, single-row decodes inside loops,
// filter predicates and maps included, gives HEAD's answer on every case;
// nothing is refused that HEAD accepted.
function cacheHoldingRows(mods, tableName, rows) {
  const systemTableCache = new mods.cache.SystemTableCache();
  for (const row of rows) {
    systemTableCache.applySystemTableChange(tableName, mods.cache.CDC_OPERATIONS.INSERT, row);
  }
  return systemTableCache;
}

// The priority-partition census over the services rows (HEAD: the raw rows
// through its census normaliser; here: projected replicas, the
// candidate-derivation read).
const CENSUS_CASES = Object.freeze({
  'services:priority-partition-census': async (mods, systemTableCache, current) => {
    const {buildDerivedPriorityPartitionSummary} = await mods.load(
      'src/control-plane/membership-publication-priority-partition-summary.js');
    const rows = systemTableCache.getAll('services');
    const nodeIds = ['n-1', 'n-2', SUBJECT_NODE_ID];
    return buildDerivedPriorityPartitionSummary({
      serviceRows: current ? current.projectReplicasFromServicesRows(rows) : rows,
      partitionRows: [{partition_id: PRIORITY_PARTITION_ID, table_id: 'replica_operations',
        leader_node_id: 'n-1'}],
      readinessByNodeId: {},
      projectedServingNodeIds: nodeIds,
      locallyEligibleNodeIds: nodeIds,
      publishedActiveNodeIds: nodeIds,
    }, {});
  },
});

const ALL_SERVICES_READERS = Object.freeze({...SERVICES_CASES, ...CONSUMER_CASES,
  ...CENSUS_CASES});

const subjectService = (overrides) => servicesRow(SUBJECT_SERVICE_ID, SUBJECT_NODE_ID,
  {raft_role: 'leader', ...overrides});
const MEMBERSHIP_OBLIGATION_UNKNOWN = 'unknown';
const MESSAGE_GROUP_LANE_KEY = 'lk';
// The behaviour cases' operation rows: open (no completed_at), on one
// message group whose membership obligation is unknown, so every loop site
// below reaches its single-row decode for every row.
const operationRow = (operationId, overrides = {}) => replicaOperationsRow({
  operation_id: operationId, completed_at: null,
  message_group_membership_obligation_state: MEMBERSHIP_OBLIGATION_UNKNOWN, ...overrides});
const REPLACE_ROW = Object.freeze({type: 'REPLACE', replica_id: 'r-1'});

// A repository over the cached replica_operations rows: its cache-first
// reads read the cache, its SQL reads answer the same rows.
function operationsRepository(mods, systemTableCache, overrides = {}) {
  return Object.assign(Object.create(
    mods.operationRepository.ReplicaOperationRepository.prototype), {
    systemTableCache,
    nodeId: 'n-1',
    logger: QUIET_LOGGER,
    timeSource: {now: () => NOW_MS},
    executeReplicaOperationsRead: async () =>
      ({success: true, rows: systemTableCache.getAll('replica_operations')}),
    ...overrides,
  });
}

// The rowToOperation readers (the census of single-row decodes inside loops,
// filter predicates and maps, round 5; quest notes): each runs its
// production loop over the cached rows.
const REPLICA_OPERATIONS_LOOP_CASES = Object.freeze({
  'replica_operations:row-to-operation-subject': (mods, systemTableCache) =>
    operationsRepository(mods, systemTableCache)
      .rowToOperation(systemTableCache.get('replica_operations', SUBJECT_OPERATION_ID)),
  'replica_operations:operations-by-entity': (mods, systemTableCache) =>
    operationsRepository(mods, systemTableCache).getOperationsByEntity('message_group', 'mg-1'),
  'replica_operations:operations-by-entity-sql': (mods, systemTableCache) =>
    operationsRepository(mods, systemTableCache, {systemTableCache: null})
      .getOperationsByEntity('message_group', 'mg-1'),
  'replica_operations:all-operations': (mods, systemTableCache) =>
    operationsRepository(mods, systemTableCache).getAllOperations(),
  'replica_operations:entity-in-flight-replica-ids': (mods, systemTableCache) =>
    operationsRepository(mods, systemTableCache)
      .getEntityInFlightReplicaIds({entityType: 'message_group', entityId: 'mg-1'}),
  'replica_operations:terminal-failed-create-cleanup': (mods, systemTableCache) =>
    operationsRepository(mods, systemTableCache).queryTerminalFailedCreateCleanupOperations(),
  'replica_operations:concurrent-remove-count-sql': (mods, systemTableCache) =>
    operationsRepository(mods, systemTableCache, {systemTableCache: null})
      .getConcurrentRemoveCount(),
  'replica_operations:incomplete-operations': (mods, systemTableCache) =>
    operationsRepository(mods, systemTableCache)
      .mapAndSortIncompleteOperations(systemTableCache.getAll('replica_operations')),
  'replica_operations:cluster-wide-incomplete': (mods, systemTableCache) =>
    operationsRepository(mods, systemTableCache).queryClusterWideIncompleteOperations(),
  'replica_operations:existing-in-flight-operation': (mods, systemTableCache) =>
    operationsRepository(mods, systemTableCache).queryExistingInFlightOperation(
      PRIORITY_PARTITION_ID, SUBJECT_NODE_ID, 'message_group', 'mg-1', {},
      () => true),
  // The authoritative membership debt census over the same rows.
  'replica_operations:membership-debt-census': (mods, systemTableCache) =>
    operationsRepository(mods, systemTableCache)
      .queryAuthoritativeMessageGroupMembershipDebtOperations(),
  // The coordinator's cache-visible entity operations (budget admission).
  'replica_operations:budget-admission-cache-visible-operations': async (mods,
    systemTableCache) => {
    const {applyRebalanceCoordinatorPriorityBudgetAdmissionMethods} = await mods.load(
      'src/rebalancer/rebalance-coordinator-priority-budget-admission.js');
    class Coordinator {}
    applyRebalanceCoordinatorPriorityBudgetAdmissionMethods(Coordinator);
    const repository = operationsRepository(mods, systemTableCache);
    return Object.assign(new Coordinator(), {
      repository,
      rowToOperation: (row) => repository.rowToOperation(row),
      getEntityInFlightOperationRows: () => systemTableCache.getAll('replica_operations'),
    }).getCacheVisibleEntityOperations({entityType: 'message_group', entityId: 'mg-1'});
  },
  // The replace-owner wake loop (operation-workflow-replace-owner-wake.js
  // wakeRemoteReplaceOwners): a consensus observation on the partition wakes
  // the remote owner of every open REPLACE row whose target is the replica.
  'replica_operations:replace-owner-wake-loop': async (mods, systemTableCache) => {
    const wake = await mods.load('src/rebalancer/operation-workflow-replace-owner-wake.js');
    const woken = [];
    const listeners = [];
    const owner = {
      isShuttingDown: false,
      repository: operationsRepository(mods, systemTableCache, {
        isOperationLocallyOwned: () => false,
        getReplaceTargetReplicaId: (operation) => operation.replicaId,
      }),
      wakeCoordinatorCreatedRemoteOwner: async (operation) => {
        woken.push([operation.operationId, operation.type, operation.status]);
        return true;
      },
    };
    // The loop runs in a detached promise: a throw out of it is an
    // unhandled rejection, recorded here as the loop's answer.
    const aborted = [];
    const recordAbort = (error) => aborted.push(String(error?.code ?? error?.name));
    process.on('unhandledRejection', recordAbort);
    wake.attachReplicaConsensusEvents(owner,
      {subscribe: (listener) => listeners.push(listener) && (() => {})});
    for (const listener of listeners) {
      listener({partitionId: PRIORITY_PARTITION_ID, replicaId: 'r-1'});
    }
    await new Promise((resolve) => setImmediate(resolve));
    process.off('unhandledRejection', recordAbort);
    wake.shutdownReplaceOwnerWake(owner);
    return aborted.length === 0 ? woken : {woken, aborted};
  },
  // The membership recovery hint predicate (operation-workflow-message-group-
  // membership-recovery.js replicatedRowOwesLearnerTurn) over the cache: the
  // periodic cache-hint sweep, the operation-row wake and the services-row
  // lane wake.
  'replica_operations:membership-recovery-hint-predicate': async (mods, systemTableCache) => {
    const recovery = await mods.load(
      'src/rebalancer/operation-workflow-message-group-membership-recovery.js');
    const owner = {
      isShuttingDown: false,
      nodeId: 'n-1',
      logger: QUIET_LOGGER,
      repository: operationsRepository(mods, systemTableCache, {
        hasReplicaOperationCacheObservationBoundary: () => true,
      }),
    };
    return {
      sweep: await recovery.reconcileMessageGroupMembershipDebt(owner,
        recovery.DEBT_CENSUS.CACHE_HINT),
      operationRowWake: await recovery.wakeMessageGroupMembershipDebtForRow(owner,
        'replica_operations', 'UPDATE',
        systemTableCache.get('replica_operations', SUBJECT_OPERATION_ID)),
      servicesRowWake: await recovery.wakeMessageGroupMembershipDebtForRow(owner,
        'services', 'UPDATE', {service_type: 'message_group', status: 'active',
          group_id: MESSAGE_GROUP_LANE_KEY}),
    };
  },
  // The observed-progress predicate (operation-workflow-recovery-observation.js
  // findObservedProgressOperationIds) for an ACTIVE services row of the
  // REPLACE target.
  'replica_operations:observed-progress-predicate': async (mods, systemTableCache) => {
    const {OperationWorkflowRecoveryObservation} = await mods.load(
      'src/rebalancer/operation-workflow-recovery-observation.js');
    return Object.assign(Object.create(OperationWorkflowRecoveryObservation.prototype), {
      nodeId: 'n-1',
      logger: QUIET_LOGGER,
      repository: operationsRepository(mods, systemTableCache),
    }).findObservedProgressOperationIds({service_id: 'r-1', node_id: SUBJECT_NODE_ID,
      partition_id: PRIORITY_PARTITION_ID, status: 'active'}, 'UPDATE');
  },
});

const BEHAVIOUR_CASES = Object.freeze({
  'services:upper-case-service-type': Object.freeze({
    table: 'services', readers: ALL_SERVICES_READERS,
    rows: () => [...PEER_SERVICE_ROWS, subjectService({service_type: 'PARTITION'})],
  }),
  'services:empty-replica-id': Object.freeze({
    table: 'services', readers: ALL_SERVICES_READERS,
    rows: () => [...PEER_SERVICE_ROWS, subjectService({replica_id: ''})],
  }),
  'services:unknown-status': Object.freeze({
    table: 'services', readers: ALL_SERVICES_READERS,
    rows: () => [...PEER_SERVICE_ROWS, subjectService({status: UNKNOWN_STATUS})],
  }),
  // Known values stored in another case (the unvalidated register-service
  // body): HEAD's normalisers lower-cased them, its raw readers did not.
  'services:upper-case-known-values': Object.freeze({
    table: 'services', readers: ALL_SERVICES_READERS,
    rows: () => [servicesRow('s-1', 'n-1', {raft_role: 'LEADER', status: 'Active'}),
      servicesRow('s-2', 'n-2', {status: 'ACTIVE'}),
      subjectService({status: 'ACTIVE', raft_role: 'LEADER'})],
  }),
  'services:unknown-raft-role': Object.freeze({
    table: 'services', readers: ALL_SERVICES_READERS,
    rows: () => [...PEER_SERVICE_ROWS, subjectService({raft_role: 'witness'})],
  }),
  'services:wrong-type-and-null-status': Object.freeze({
    table: 'services', readers: ALL_SERVICES_READERS,
    rows: () => [...PEER_SERVICE_ROWS,
      subjectService({created_at: 'yesterday', group_id: 7, status: null})],
  }),
  'services:empty-status': Object.freeze({
    table: 'services', readers: ALL_SERVICES_READERS,
    rows: () => [...PEER_SERVICE_ROWS, subjectService({status: ''})],
  }),
  'nodes:unknown-status': Object.freeze({
    table: 'nodes', readers: NODES_CASES,
    rows: () => [...PEER_NODE_ROWS, nodesRow(SUBJECT_NODE_ID, {status: UNKNOWN_STATUS})],
  }),
  'nodes:upper-case-known-values': Object.freeze({
    table: 'nodes', readers: NODES_CASES,
    rows: () => [nodesRow('n-1', {status: 'Active'}), nodesRow('n-2'),
      nodesRow(SUBJECT_NODE_ID, {status: 'ACTIVE', connection_state: 'READY'})],
  }),
  'nodes:unknown-connection-state': Object.freeze({
    table: 'nodes', readers: NODES_CASES,
    rows: () => [...PEER_NODE_ROWS, nodesRow(SUBJECT_NODE_ID, {connection_state: 'weird'})],
  }),
  'nodes:wrong-type-lease-and-null-connection-state': Object.freeze({
    table: 'nodes', readers: NODES_CASES,
    rows: () => [...PEER_NODE_ROWS, nodesRow(SUBJECT_NODE_ID,
      {ready_lease_expires_at: String(LEASE_FUTURE_MS), connection_state: null})],
  }),
  'replica_operations:known-values': Object.freeze({
    table: 'replica_operations', readers: REPLICA_OPERATIONS_LOOP_CASES,
    rows: () => [operationRow('op-1', REPLACE_ROW), operationRow('op-2'),
      operationRow(SUBJECT_OPERATION_ID)],
  }),
  'replica_operations:unknown-status': Object.freeze({
    table: 'replica_operations', readers: REPLICA_OPERATIONS_LOOP_CASES,
    rows: () => [operationRow('op-1', REPLACE_ROW),
      operationRow('op-2', {...REPLACE_ROW, status: UNKNOWN_STATUS}),
      operationRow(SUBJECT_OPERATION_ID, {status: UNKNOWN_STATUS})],
  }),
  'replica_operations:upper-case-known-values': Object.freeze({
    table: 'replica_operations', readers: REPLICA_OPERATIONS_LOOP_CASES,
    rows: () => [operationRow('op-1', REPLACE_ROW),
      operationRow('op-2', {...REPLACE_ROW, status: 'PENDING'}),
      operationRow(SUBJECT_OPERATION_ID, {status: 'PENDING', type: 'add'})],
  }),
  'replica_operations:unknown-step-and-wrong-types': Object.freeze({
    table: 'replica_operations', readers: REPLICA_OPERATIONS_LOOP_CASES,
    rows: () => [operationRow('op-1', REPLACE_ROW),
      operationRow('op-2', {...REPLACE_ROW, workflow_step: 'WEIRD_STEP'}),
      operationRow(SUBJECT_OPERATION_ID, {type: 'SPLIT', lease_expires_at: 'soon',
        created_at: '5'})],
  }),
  'replica_operations:null-steps-history': Object.freeze({
    table: 'replica_operations', readers: REPLICA_OPERATIONS_LOOP_CASES,
    rows: () => [operationRow('op-1', REPLACE_ROW),
      operationRow(SUBJECT_OPERATION_ID, {steps_history: null})],
  }),
});

async function answerAsync(run) {
  try {
    return {ok: encodeValue(await run())};
  } catch (error) {
    return {refused: String(error?.code ?? error?.name ?? 'error')};
  }
}

/**
 * Every behaviour case's answer per reader, on one tree.
 * @param {Object} mods loadTreeModules of the tree
 * @param {Object|null} current this tree's extra modules (null for HEAD)
 * @return {Promise<Object>} `{case: {reader: answer}}`
 */
async function answerBehaviourCases(mods, current) {
  const answers = {};
  for (const [name, {table, readers, rows}] of Object.entries(BEHAVIOUR_CASES)) {
    answers[name] = {};
    for (const [readerName, reader] of Object.entries(readers)) {
      const systemTableCache = cacheHoldingRows(mods, table, rows());
      answers[name][readerName] = await answerAsync(() =>
        reader(mods, systemTableCache, current));
    }
  }
  return answers;
}

export {
  BEHAVIOUR_CASES,
  MEMBERSHIP_BRANCH_SELECTION_SQL,
  NOW_MS,
  PRIORITY_PARTITION_ID,
  SUBJECT_OPERATION_ID,
  answer,
  answerBehaviourCases,
  answerEveryCase,
  encodeValue,
  loadTreeModules,
  membershipBranchSelectionAnswer,
  replicaOperationsRow,
};
