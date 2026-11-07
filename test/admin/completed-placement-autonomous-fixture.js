// Component integration substrate: real SQLite production schemas behind the
// SQL/read seams; real CDC hydration, membership driver, priority visibility
// listener, publication derivation, metadata owner, gateway and persistence.
// The ADD is already terminal. This witness proves its missed-visibility handoff,
// not new ADD execution, native consensus, or fresh physical formation.
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {EventEmitter} from 'node:events';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {SYSTEM_TABLE_SCHEMAS, generateCreateTableSQL, INITIAL_PARTITION_IDS} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {TABLES} from '../../src/constants/index.js';
import {ControlPlaneSystemTableGateway} from
  '../../src/control-plane/control-plane-system-table-gateway.js';
import {createSystemMetadataOwners} from '../../src/control-plane/owners/index.js';
import {MembershipPublicationCoordinator} from
  '../../src/control-plane/membership-publication-coordinator.js';
import {UnifiedRebalancer} from '../../src/rebalancer/unified-rebalancer.js';

const NODES = ['node-1', 'node-2', 'node-3'];
const PRIORITY_TABLES = [TABLES.CONTROL_PLANE_PUBLICATIONS, TABLES.REPLICA_OPERATIONS,
  TABLES.SCHEMA_OPERATIONS, TABLES.SQL_TRANSACTIONS, TABLES.SQL_TRANSACTION_PARTICIPANTS,
  TABLES.SQL_WRITE_OPERATIONS];
const PARTITIONS = PRIORITY_TABLES.map((table) => INITIAL_PARTITION_IDS[table]);
const PARTITION = PARTITIONS[0];
const TARGET = `${PARTITION}-node-3`;
const PUBLICATION = 'autonomous-handoff-publication';
const OPERATION = 'autonomous-completed-add';
const START_MS = 200000;
const TICK_MS = 5000; // existing membership-driver default
const RECOVERY_TICKS = 8; // 40s: covers existing 30s catch-up cooldown + queue settlement
const QUIET = {debug() {}, info() {}, warn() {}, error() {}, logConsoleOnly() {}};
const SQL_TABLES = [...new Set([...Object.values(TABLES)].filter((table) =>
  SYSTEM_TABLE_SCHEMAS.some((schema) => schema.tableName === table)))];

function seed(db, cache, table, input, projection = input) {
  const row = {created_at: START_MS - 2000, updated_at: START_MS - 1000, ...input};
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name);
  const fields = Object.keys(row).filter((key) => columns.includes(key));
  const values = fields.map((key) => typeof row[key] === 'object' && row[key] !== null ?
    JSON.stringify(row[key]) : row[key]);
  db.prepare(`INSERT INTO ${table} (${fields.join(',')}) VALUES (${fields.map(() => '?').join(',')})`)
    .run(...values);
  cache.applySystemTableChange(table, 'INSERT', projection);
}

function publication(db) {
  const row = db.prepare(`SELECT * FROM ${TABLES.CONTROL_PLANE_PUBLICATIONS} WHERE publication_id = ?`)
    .get(PUBLICATION);
  return {...row, priority_partition_summary: JSON.parse(row.priority_partition_summary)};
}

function seedCompletedPlacement(db, cache) {
  for (const nodeId of NODES) {
    seed(db, cache, TABLES.NODES, {node_id: nodeId, status: 'active', connection_state: 'ready',
      node_address: `${nodeId}:8080`, cpu_cores: 4, memory_mb: 4096, disk_gb: 100, last_heartbeat: START_MS, ready_lease_expires_at: START_MS + 300000});
    seed(db, cache, TABLES.NODE_ENDPOINTS, {endpoint_id: `${nodeId}-ws`, node_id: nodeId,
      transport_type: 'ws', status: 'active', address: `ws://${nodeId}:8082`});
  }
  for (const [index, partitionId] of PARTITIONS.entries()) {
    seed(db, cache, TABLES.PARTITIONS, {partition_id: partitionId,
      table_id: PRIORITY_TABLES[index], table_name: PRIORITY_TABLES[index], replica_count: 3,
      leader_node_id: NODES[0], partition_version: 1});
    for (const nodeId of NODES) {
      const row = {service_id: `${partitionId}-${nodeId}`, replica_id: `${partitionId}-${nodeId}`,
        node_id: nodeId, partition_id: partitionId, service_type: 'partition',
        status: 'active', raft_role: nodeId === NODES[0] ? 'leader' : 'follower',
        address: `${nodeId}/partition/${partitionId}-${nodeId}`};
      seed(db, cache, TABLES.SERVICES, row, row.service_id === TARGET ?
        {...row, status: 'syncing', raft_role: 'learner'} : row);
    }
  }
  seed(db, cache, TABLES.REPLICA_OPERATIONS, {operation_id: OPERATION,
    partition_id: PARTITION, entity_id: PARTITION, entity_type: 'partition', replica_id: TARGET,
    target_node_id: NODES[2], source_node_id: NODES[0], type: 'ADD', status: 'active',
    workflow_step: 'ACTIVE', created_at: START_MS - 2000, updated_at: START_MS - 1000,
    completed_at: START_MS - 1000, steps_history: []});
  seed(db, cache, TABLES.CONTROL_PLANE_PUBLICATIONS, {publication_id: PUBLICATION,
    publication_kind: 'cluster_membership', publication_epoch: 21, publisher_node_id: NODES[0],
    transition_history: [],
    published_active_node_ids: NODES, required_ack_node_ids: NODES, acknowledged_node_ids: NODES,
    priority_partition_summary: {satisfied: false, requiredDistinctNodeCount: 3,
      readyEligibleNodeCount: 3, totalPriorityPartitionCount: PARTITIONS.length,
      missingPartitionIds: [PARTITION], blockedPartitions: [{partitionId: PARTITION,
        requiredDistinctNodeCount: 3, readyDistinctNodeCount: 2, spreadGap: 1}]},
    membership_lifecycle_summary: {lifecycleState: 'published_active', epochBoundary: 'published_membership'},
    status: 'PUBLISHED', updated_at: START_MS - 1000, published_at: START_MS - 1000,
    closed_at: START_MS - 1000});
}

async function autonomousHandoffFixture(t) {
  const db = new Database(':memory:');
  let cdc = null;
  let membership = null;
  let rebalancer = null;
  const drives = new Set();
  t.after(async () => {
    if (membership?.ownerMembershipDriverTimer) {
      membership.ownerMembershipDriverClearInterval(membership.ownerMembershipDriverTimer);
    }
    try {
      await Promise.allSettled([...drives]);
      await membership?.reconcileQueue.awaitCurrentWorkIdle();
      await rebalancer?.awaitCurrentWorkIdle();
    } finally {
      membership?.stopOwnerMembershipDriver();
      rebalancer?.shutdown();
      cdc?.markShuttingDown();
      db.close();
    }
  });
  const cache = new SystemTableCache();
  const clock = new VirtualTimeSource({startMs: START_MS});
  for (const table of SQL_TABLES) {
    const schema = SYSTEM_TABLE_SCHEMAS.find((candidate) => candidate.tableName === table);
    db.exec(generateCreateTableSQL(schema));
  }
  seedCompletedPlacement(db, cache);
  const f = {db, cache, clock, blocked: true, failedReads: 0, pendingTicks: 0,
    writes: [], errors: [], hydrations: []};
  const logger = {...QUIET, error: (...args) => f.errors.push(args)};
  const engine = {async executeQuery(sql, params = []) {
    if (/^SELECT\b/iu.test(sql.trim())) return {success: true, rows: db.prepare(sql).all(...params)};
    const result = db.prepare(sql).run(...params);
    f.writes.push({sql, changes: result.changes, atMs: clock.now()});
    return {success: true, rows: [], affectedRows: result.changes};
  }};
  cdc = new CDCIntegrationService({nodeId: NODES[0], sqlQueryEngine: engine,
    systemTableCache: cache, timeSource: clock});
  cdc.initialize();
  cdc.bootstrapMode = false;
  cdc.logger = logger;
  // Explicit component authoritative-read seam. Production repair/mutation
  // decisions are untouched; a settled read refusal is the sole finite fault.
  const read = async (table, sql, params = []) => {
    if (table === TABLES.SERVICES && f.blocked) {
      f.failedReads += 1;
      return {success: false, error: 'FINITE_SERVICES_READ_UNAVAILABLE',
        errorCode: 'AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE'};
    }
    return engine.executeQuery(sql, params);
  };
  cdc.executeAuthoritativeSystemTableRead = read;
  const hydrate = cdc.hydrateCdcPropagatedTablesFromAuthority.bind(cdc);
  cdc.hydrateCdcPropagatedTablesFromAuthority = async (options) => {
    const result = await hydrate(options);
    f.hydrations.push({options, result, blocked: f.blocked});
    return result;
  };
  const gateway = new ControlPlaneSystemTableGateway({nodeId: NODES[0],
    systemTableCache: cache, cdcIntegrationService: cdc, sqlQueryEngine: engine});
  gateway.readAuthoritativeRows = read;
  const owners = createSystemMetadataOwners({controlPlaneSystemTableGateway: gateway});
  membership = new MembershipPublicationCoordinator({nodeId: NODES[0],
    systemTableCache: cache, cdcIntegrationService: cdc,
    controlPlanePublicationsOwner: owners.controlPlanePublicationsOwner,
    resolveIsControlPlanePublicationsWriteLeader: () => true,
    now: () => clock.now(), logger});
  // The existing priority cache listener is installed by the real constructor.
  // No planner start/new placement is requested: the placement already completed.
  rebalancer = new UnifiedRebalancer({entityId: PARTITION, entityType: 'partition',
    nodeId: NODES[0], systemTableCache: cache, cdcIntegrationService: cdc,
    controlPlaneSystemTableGateway: gateway, sqlQueryEngine: engine,
    tablePolicyService: {}, messageRouter: {}, rebalanceCoordinator: new EventEmitter(),
    controlPlaneReadinessService: {membershipPublicationService: membership},
    nowFn: () => clock.now(), setTimeoutFn: clock.setTimeout.bind(clock),
    clearTimeoutFn: clock.clearTimeout.bind(clock)});
  rebalancer.logger = logger;
  rebalancer.isLeader = true;
  const drive = membership.driveOwnerMembershipReconcile.bind(membership);
  membership.driveOwnerMembershipReconcile = () => {
    f.pendingTicks += 1;
    const pending = drive().finally(() => {
      f.pendingTicks -= 1;
      drives.delete(pending);
    });
    drives.add(pending);
    return pending;
  };
  membership.startOwnerMembershipDriver({timeSource: clock});
  return Object.assign(f, {membership, cdc, rebalancer,
    publication: () => publication(db),
    operation: () => db.prepare(`SELECT * FROM ${TABLES.REPLICA_OPERATIONS} WHERE operation_id = ?`).get(OPERATION),
    target: () => cache.get(TABLES.SERVICES, TARGET)});
}

async function tick(f) {
  f.clock.advance(TICK_MS);
  for (let step = 0; step < 30; step += 1) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.pendingTicks, 0, 'the owner tick must settle');
}

export {autonomousHandoffFixture, tick, RECOVERY_TICKS};
