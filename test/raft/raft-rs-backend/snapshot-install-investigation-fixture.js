// Investigation copy: canonical handler storage paths; original fixture preserved.
// A partition group whose TARGET node is production-shaped (quest
// partition-checkpoint-epoch-generation, round 4, finding 1): the node's
// replica handler, its lifecycle state machine and its snapshot offer routing
// are the ones ReplicaHandlerSetup.create builds, over real PartitionServices
// on the raft-rs port and one database file each.
//
// Stated fixture seams, and nothing else:
//  - the network: an in-process loopback for unified addresses (a replica is
//    cut off by pointing its address at a handler that answers nothing; a
//    scenario may hold the ANSWER of a replica-admission request on its way
//    back, and the participant-release requests that cross it are counted)
//    and the in-process bulk network of snapshot-wiring-inproc-fixture.js;
//  - the control plane: the SERVICES rows live in the lifecycle state store
//    (durable rows with real versions, projected into the target node's
//    cache and, as discovery, into the founders' caches); the one
//    replica_operations row and the node's NODES row are answered from the
//    fixture's records;
//  - the election: the founders' election timers are parked and the first
//    founder campaigns; heartbeats run on the real timer.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {AddressManager} from '../../../src/address/address-manager.js';
import {ReplicaHandlerSetup} from
  '../../../src/bootstrap/shared/replica-handler-setup.js';
import {attachSnapshotCatchupDispatcher} from
  '../../../src/bootstrap/shared/snapshot-catchup-wiring.js';
import {SYSTEM_TABLE_NAME} from
  '../../../src/bootstrap/system-table-schemas-constants.js';
import {SQL_TRANSACTIONS_SCHEMA} from
  '../../../src/bootstrap/system-table-workflow-schema-definitions.js';
import {SystemTableCache} from '../../../src/cache/system-table-cache.js';
import {ConfigurationManager} from '../../../src/config/configuration-manager.js';
import {
  COLUMN,
  ENDPOINT_STATUS,
  SERVICE_TYPE,
  TABLES,
  TRANSPORT_TYPE,
} from '../../../src/constants/index.js';
import {runtimeBuildProvenance} from
  '../../../src/diagnostics/runtime-build-provenance.js';
import {HLCTimestamp} from '../../../src/hlc/hlc-timestamp.js';
import {LoggingService} from '../../../src/logging/logging-service.js';
import {PartitionService} from '../../../src/partition/partition-service.js';
import {
  PARTITION_SERVICE_MESSAGE_TYPE,
  PARTITION_SERVICE_OPERATION,
} from '../../../src/partition/partition-service-constants.js';
import {PARTICIPANT_RELEASE_TYPE} from
  '../../../src/partition/partition-participant-transaction-cutover-constants.js';
import {RAFT_OPERATION, RAFT_OPERATION_OUTCOME} from
  '../../../src/raft/raft-operation-port-constants.js';
import {COMMITTED_MEMBERSHIP_READ_PURPOSE} from
  '../../../src/raft/raft-committed-membership-constants.js';
import {committedStampOfAnswer} from
  '../../../src/raft/raft-committed-membership-stamp.js';
import {RaftRsDurableStore} from '../../../src/raft/raft-rs-durable-store.js';
import {turnChainValue} from '../../../src/raft/raft-rs-turn-answer.js';
import {
  buildReplicaCreateAdmissionToken,
  buildReplicaCreateAttemptToken,
} from '../../../src/rebalancer/replica-create-admission-token.js';
import {ReplicaOperationField} from
  '../../../src/rebalancer/replica-operation-constants.js';
import {OPERATION_METADATA_KEY, OperationType, ReplicaStatus} from
  '../../../src/rebalancer/replica-status.js';
import {createLoopbackTransport} from '../../partition/partition-service-test-support.js';
import {withFoundingStamp} from '../../partition/partition-founding-stamp.js';
import {
  createLifecycleCdcService,
  createLifecycleServiceRow,
  createLifecycleStateStore,
} from '../../test-helpers/lifecycle-state-store.js';
import {waitForCondition as waitFor} from '../bulk-transfer-socket-fixture.js';
import {TEST_BOOT_INCARNATION} from '../../test-helpers/boot-incarnation-fixture.js';
import {
  createInProcBulkNetwork,
  routerFacts,
} from '../snapshot-wiring-inproc-fixture.js';

const TABLE = 'sir_rows';
const PARTITION_ID = 'sir_rows-p1';
// The control partition (sql_transactions-p1), a lone founder on the
// leader's node: a user partition is released after its control owner.
const CONTROL_TABLE = TABLES.SQL_TRANSACTIONS;
const CONTROL_PARTITION_ID = 'sql_transactions-p1';
const TARGET_NODE = 'sir-target-node';
const FOUNDER_NODES = Object.freeze(['sir-node-1', 'sir-node-2', 'sir-node-3']);
const NODE_INCARNATION = 101;
const CADENCE_ENTRY_THRESHOLD = 100;
const HEARTBEAT_MS = 20;
const PARKED_ELECTION_MIN_MS = 7200000;
const PARKED_ELECTION_MAX_MS = 7300000;
const SWEEP_MS = 40;
const SYNC_TIMEOUT_MS = 30000;
const RELEASE_BUDGET_MS = 10000;
const HLC_BASE_MS = 1720000000000;
const SCHEMA = Object.freeze({columns: [
  {name: 'id', type: 'TEXT', primaryKey: true},
  {name: 'payload', type: 'TEXT'},
]});
const SINGLETONS = [ConfigurationManager, LoggingService, AddressManager];
const bulkAddressOf = (nodeId) => `ws://${nodeId}:7100`;

function configure(syncTimeoutMs) {
  for (const singleton of SINGLETONS) singleton.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: TARGET_NODE},
    raft: {
      heartbeatIntervalMs: HEARTBEAT_MS,
      electionTimeoutMinMs: PARKED_ELECTION_MIN_MS,
      electionTimeoutMaxMs: PARKED_ELECTION_MAX_MS,
      snapshotThreshold: CADENCE_ENTRY_THRESHOLD,
    },
    replicaHandler: {syncTimeoutMs},
  });
  LoggingService.getInstance().initialize({level: 'error'});
}

function resetSingletons() {
  for (const singleton of SINGLETONS) singleton.resetInstance();
}

function unifiedAddress([replicaId, nodeId]) {
  return AddressManager.getInstance().format(nodeId, 'partition', replicaId);
}

// A node's cache, a real SystemTableCache: the table, the partition, the
// group's SERVICES rows and the node directory the production dial resolves
// a follower's bulk address from.
function nodeCache(world) {
  const cache = new SystemTableCache();
  for (const [tableId, schema, partitionId, replicaCount] of [
    [TABLE, SCHEMA, PARTITION_ID, world.founders.length],
    [CONTROL_TABLE, SQL_TRANSACTIONS_SCHEMA, CONTROL_PARTITION_ID, 1]]) {
    cache.applySystemTableChange(TABLES.TABLES, 'INSERT', {table_id: tableId,
      table_name: tableId, schema_definition: JSON.stringify(schema)});
    cache.applySystemTableChange(TABLES.PARTITIONS, 'INSERT', {
      partition_id: partitionId, table_id: tableId, replica_count: replicaCount,
      partition_key_start: null, partition_key_end: null, leader_node_id: null});
  }
  for (const row of initialServiceRows(world)) {
    cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', row);
  }
  for (const nodeId of [...FOUNDER_NODES, TARGET_NODE]) {
    cache.applySystemTableChange(TABLES.NODES, 'INSERT', {
      [COLUMN.NODE_ID]: nodeId, [COLUMN.BOOT_INCARNATION]: TEST_BOOT_INCARNATION});
    cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, 'INSERT', {
      endpoint_id: `${nodeId}-websocket`,
      [COLUMN.NODE_ID]: nodeId, [COLUMN.ADDRESS]: bulkAddressOf(nodeId),
      [COLUMN.BOOT_INCARNATION]: TEST_BOOT_INCARNATION,
      [COLUMN.STATUS]: ENDPOINT_STATUS.ACTIVE,
      [COLUMN.TRANSPORT_TYPE]: TRANSPORT_TYPE.WEBSOCKET});
  }
  return cache;
}

function serviceRowOf(member, partitionId = PARTITION_ID) {
  return createLifecycleServiceRow({serviceId: member[0], replicaId: member[0],
    partitionId, nodeId: member[1], status: ReplicaStatus.ACTIVE,
    address: unifiedAddress(member)});
}

// The SERVICES rows of a formed cluster: every founder ACTIVE.
function initialServiceRows(world) {
  return [...world.founders.map((member) => serviceRowOf(member)),
    serviceRowOf(world.control, CONTROL_PARTITION_ID)];
}

function hlc(ordinal) {
  return new HLCTimestamp(HLC_BASE_MS - ordinal * 1000, ordinal, TARGET_NODE)
    .toString();
}

async function insertRows(leader, from, to) {
  for (let ordinal = from; ordinal <= to; ordinal += 1) {
    const outcome = await turnChainValue(leader.raft.propose({
      type: PARTITION_SERVICE_OPERATION.INSERT,
      sql: `INSERT INTO ${TABLE} (id, payload) VALUES (?, ?)`,
      params: [`row-${ordinal}`, `payload-${ordinal}`],
      entryId: `entry-${ordinal}`, timestamp: hlc(ordinal)}));
    assert.equal(outcome.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
      JSON.stringify(outcome));
  }
}

function userRows(service) {
  return service.db.prepare(`SELECT id, payload FROM ${TABLE} ORDER BY id`).all();
}

function compactedIndex(service) {
  return Number(RaftRsDurableStore.readSnapshotIndexIn(service.db, PARTITION_ID));
}

// The loopback, observed at the network seam: each participant-release
// request's trigger is kept and the request passes the scenario's gate (which
// may hold it or lose it), and the answer of a replica-admission request is
// delivered once the scenario's gate lets it through.
function observedTransport(world) {
  const transport = createLoopbackTransport();
  const deliver = transport.deliver.bind(transport);
  transport.deliver = async (address, payload, options) => {
    if (payload?.type === PARTICIPANT_RELEASE_TYPE) {
      world.releaseTriggers.push(payload.trigger);
      await world.releaseRequestGate(payload);
    }
    const answer = await deliver(address, payload, options);
    if (payload?.type === PARTITION_SERVICE_MESSAGE_TYPE.ADMIT_REPLICA) {
      await world.admissionAnswerGate();
    }
    return answer;
  };
  return transport;
}

// The node's message router as the handler setup and the snapshot wiring
// consume it: the loopback's registration and delivery, the dial identity
// and the node's bulk registry.
function nodeRouter(world, nodeId) {
  if (!world.routers.has(nodeId)) {
    const registry = world.bulk.registryFor(nodeId, bulkAddressOf(nodeId));
    world.routers.set(nodeId, Object.assign(Object.create(world.transport),
      routerFacts(nodeId, bulkAddressOf(nodeId), registry)));
  }
  return world.routers.get(nodeId);
}

// Every founder's gateway answers the committed replica operation the
// joining replica is named by from the fixture's one operation record.
function answerOperationReads(world, service) {
  const gateway = service.controlPlaneSystemTableGateway;
  const read = gateway.readAuthoritativeRows.bind(gateway);
  gateway.readAuthoritativeRows = (tableName, sql, params, options) =>
    tableName === TABLES.REPLICA_OPERATIONS ?
      Promise.resolve({success: true, rows: world.operations.filter((row) =>
        row.operation_id === params?.[0]).map((row) => ({...row}))}) :
      read(tableName, sql, params, options);
}

function buildFounder(world, member, group = {partitionId: PARTITION_ID,
  table: TABLE, schema: SCHEMA, founders: world.founders}) {
  const service = new PartitionService(withFoundingStamp({
    partitionId: group.partitionId, tableId: group.table, tableName: group.table,
    replicaId: member[0], replicaIds: group.founders.map(([id]) => id),
    peerAddresses: group.founders.map(unifiedAddress), nodeId: member[1],
    transport: world.transport, schema: group.schema,
    deferElection: group.founders.length > 1,
    systemTableCache: world.caches.get(member[1]),
    dbPath: world.handlers.get(member[1]).getPartitionDbPath(group.partitionId, member[0]),
    preparedStateHoldSweepIntervalMs: SWEEP_MS}));
  fs.mkdirSync(path.dirname(service.dbPath), {recursive: true});
  answerOperationReads(world, service);
  attachSnapshotCatchupDispatcher({service,
    systemTableCache: world.caches.get(member[1]),
    messageRouter: nodeRouter(world, member[1])});
  const seam = service.onSnapshotCatchupNeeded;
  service.onSnapshotCatchupNeeded = (...notification) =>
    seam(...notification).then((result) => {
      world.dispatches.push(result);
      return result;
    });
  world.services.push(service);
  return service;
}

function operationRowsFor(world, sql, params) {
  const rows = world.operations.map((row) => ({...row}));
  if (sql.includes('WHERE operation_id = ?')) {
    return rows.filter((row) => row.operation_id === params[0]);
  }
  if (sql.includes('entity_type = ?')) {
    return rows.filter((row) => row.target_node_id === params[0] &&
      row.entity_type === params[1] && row.create_admission_state);
  }
  return rows.filter((row) => row.replica_id === params[0] &&
    row.target_node_id === params[1]);
}

// A node's control plane: the cluster's SERVICES rows live in the one
// lifecycle store, every write projected into every node's cache.
function nodeControlPlane(world, nodeId) {
  const store = world.store;
  const project = (key) => {
    const row = store.durableRow(TABLES.SERVICES, key);
    world.rowStates.push(`${key}:${row?.status ?? 'deleted'}`);
    for (const cache of world.caches.values()) {
      cache.applySystemTableChange(TABLES.SERVICES,
        row ? 'UPDATE' : 'DELETE', row ?? {service_id: key});
    }
  };
  const lifecycle = createLifecycleCdcService({store});
  const projected = (write, keyOf) => async (tableName, ...rest) => {
    const result = await write(tableName, ...rest);
    if (tableName === TABLES.SERVICES) project(keyOf(...rest));
    return result;
  };
  const updateServices = projected(lifecycle.updateSystemTableRow,
    (where) => where.service_id);
  const readRows = async (tableName, sql, params, options) => {
    if (tableName === SYSTEM_TABLE_NAME.NODES) {
      return {success: true, rows: [{node_id: nodeId,
        boot_incarnation: NODE_INCARNATION}]};
    }
    if (tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) {
      return {success: true, rows: operationRowsFor(world, sql, params)};
    }
    return lifecycle.readAuthoritativeRows(tableName, sql, params, options);
  };
  return {
    ...lifecycle,
    readAuthoritativeRows: readRows,
    executeAuthoritativeSystemTableRead: readRows,
    insertSystemTableRow: projected(lifecycle.insertSystemTableRow,
      (row) => row.service_id),
    deleteSystemTableRow: projected(lifecycle.deleteSystemTableRow,
      (where) => where.service_id),
    async updateSystemTableRow(tableName, where, data) {
      if (tableName !== SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) {
        return updateServices(tableName, where, data);
      }
      const row = world.operations.find((candidate) => Object.entries(where)
        .every(([field, value]) => candidate[field] === value));
      if (!row) return {success: true, outcome: 'no_op'};
      Object.assign(row, data);
      return {success: true, outcome: 'applied'};
    },
  };
}

// A node as production builds it: ReplicaHandlerSetup.create with the node's
// router (bulk registry included, so the offer routing is armed by the
// setup) and a partition factory that constructs and initializes.
function armNode(world, nodeId) {
  const cache = world.caches.get(nodeId);
  const setup = ReplicaHandlerSetup.create({
    nodeId, ownerIncarnation: NODE_INCARNATION,
    messageRouter: nodeRouter(world, nodeId),
    cdcIntegrationService: nodeControlPlane(world, nodeId),
    systemTableCache: cache, dataDir: path.join(world.workDir, nodeId),
    createPartitionService: async (options) => {
      // A scenario's fault at the factory boundary (throw, or hold the open).
      await world.factoryHook(options, nodeId);
      const service = new PartitionService({...options,
        transport: world.transport, systemTableCache: cache,
        preparedStateHoldSweepIntervalMs: SWEEP_MS});
      await service.initialize();
      answerOperationReads(world, service);
      world.services.push(service);
      world.created.push(service);
      return service;
    },
  });
  world.handlers.set(nodeId, setup.replicaHandler);
  world.stateMachines.push(setup.replicaStateMachine);
}

// The founding group is released the way an operator releases one: the
// leader's node runs the real participant cutover over the founders'
// handlers, which gives the group its write origin (a later ADD is then a
// join of a released group, as on a running cluster).
async function releaseFoundingGroup(world) {
  const build = await runtimeBuildProvenance();
  const answer = await world.handlers.get(world.leader.nodeId)
    .participantReleaseRecovery.releaseOperator({partitionId: PARTITION_ID,
      targetBuildDigest: build.digest,
      deadlineAtMs: Date.now() + RELEASE_BUDGET_MS});
  assert.equal(answer.outcome, 'cut_over',
    `setup: the founding group is released: ${JSON.stringify(answer)}`);
}

/**
 * Three founders on three nodes, the first leading, and the target node
 * armed by ReplicaHandlerSetup.create.
 * @param {Object} options {establishedOnTarget: boolean, syncTimeoutMs?} -
 *   true places the third founder on the target node; syncTimeoutMs is the
 *   handler's existing create deadline, configured for the scenario. Every founder is registered with its
 *   node's handler as an established ACTIVE replica.
 * @param {Function} fn - The scenario, given the world.
 */
async function withInstallWorld(options, fn) {
  configure(options.syncTimeoutMs ?? SYNC_TIMEOUT_MS);
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sir-'));
  const founderNodes = options.establishedOnTarget ?
    [FOUNDER_NODES[0], FOUNDER_NODES[1], TARGET_NODE] : FOUNDER_NODES;
  const world = {workDir, releaseTriggers: [],
    admissionAnswerGate: async () => {}, releaseRequestGate: async () => {},
    bulk: createInProcBulkNetwork(), routers: new Map(), services: [],
    created: [], dispatches: [], operations: [], rowStates: [],
    caches: new Map(), handlers: new Map(), stateMachines: [],
    factoryHook: async () => {},
    control: [`${CONTROL_PARTITION_ID}-r1`, FOUNDER_NODES[0]],
    founders: founderNodes.map((nodeId, index) =>
      [`${PARTITION_ID}-r${index + 1}`, nodeId])};
  world.transport = observedTransport(world);
  const nodeIds = [...FOUNDER_NODES, TARGET_NODE];
  for (const nodeId of nodeIds) world.caches.set(nodeId, nodeCache(world));
  world.store = createLifecycleStateStore({services: initialServiceRows(world)});
  const keepAlive = setInterval(() => {}, 250);
  try {
    for (const nodeId of nodeIds) armNode(world, nodeId);
    world.handler = world.handlers.get(TARGET_NODE);
    await formFoundingGroups(world);
    await fn(world);
  } finally {
    clearInterval(keepAlive);
    await closeWorld(world);
    resetSingletons();
  }
}

// The founders of the partition and the lone control founder, each hosted by
// its node's handler as an established replica; the first founder leads and
// the group is released.
async function formFoundingGroups(world) {
  const founders = world.founders.map((member) => buildFounder(world, member));
  [world.leader, world.voter, world.third] = founders;
  const control = buildFounder(world, world.control, {
    partitionId: CONTROL_PARTITION_ID, table: CONTROL_TABLE,
    schema: SQL_TRANSACTIONS_SCHEMA, founders: [world.control]});
  for (const service of [...founders, control]) {
    await service.initialize();
    world.handlers.get(service.nodeId).registerExistingReplica({
      replicaId: service.replicaId, partitionId: service.partitionId,
      tableName: service.tableName, status: ReplicaStatus.ACTIVE, service});
  }
  await waitFor(() => control.raft.readStatus().role === 'leader',
    'the lone control founder leads');
  for (const handler of world.handlers.values()) {
    await handler.awaitReplicaCreateAdmissionRecoveryBarrier();
  }
  await turnChainValue(world.leader.raft.campaign());
  await waitFor(() => world.leader.raft.readStatus().role === 'leader' &&
    founders.every((service) => service.raft.readStatus().appliedIndex >= 1),
  'the first founder leads the group');
  // The founders' deferred tick scheduling starts once the group is formed
  // (the election timers are parked; the leader's heartbeats now run).
  for (const service of founders) service.startElection();
  await releaseFoundingGroup(world);
}

async function closeWorld(world) {
  for (const router of world.routers.values()) {
    router.bulkChannelRegistry.closeAll();
  }
  for (const stateMachine of world.stateMachines) {
    stateMachine.stopTimeoutChecker();
  }
  for (const handler of world.handlers.values()) {
    await handler.shutdown().catch(() => {});
  }
  for (const service of [...world.services].reverse()) {
    if (!service.isShutdown) await service.shutdown().catch(() => {});
  }
  fs.rmSync(world.workDir, {recursive: true, force: true});
}

// The current local service of a replica on the target node, as the node's
// handler holds it.
function targetService(world, replicaId) {
  return world.handler.localServices.get(replicaId) ?? null;
}

function durableStatus(world, replicaId) {
  return world.store.durableRow(TABLES.SERVICES, replicaId)?.status ?? null;
}

// The distinct lifecycle states a replica's durable row went through.
function rowStatesOf(world, replicaId) {
  return world.rowStates.filter((entry) => entry.startsWith(`${replicaId}:`))
    .map((entry) => entry.slice(replicaId.length + 1))
    .filter((state, index, states) => state !== states[index - 1]);
}

// A lifecycle state entered by another owner (a removal, a cleanup): the
// durable row moves without this node's state machine.
async function enterRowState(world, replicaId, status) {
  const row = world.store.durableRow(TABLES.SERVICES, replicaId);
  await world.store.gateway.updateSystemTableRow(TABLES.SERVICES,
    {service_id: replicaId}, {status, previous_state: row.status,
      state_entered_at: row.state_entered_at + 1});
}

// The target node's recreation record of one replica.
function recreationOf(world, replicaId) {
  return world.handler.snapshotInstallOwner.readDiagnostics().replicas
    .find((record) => record.replicaId === replicaId) ?? null;
}

// The leader's catch-up driver sweeps as if `elapsedMs` had passed since its
// records settled (its re-ask bounds are 30 s and 5 min).
function reaskAfter(world, elapsedMs) {
  return world.leader.runSnapshotCatchupReaskTick(Date.now() + elapsedMs);
}

// A factory fault for the target node's NEXT open of one replica: `fault`
// runs once, before the service is constructed (throw, or await a gate).
function faultNextOpen(world, replicaId, fault) {
  let armed = true;
  world.factoryHook = async (options, nodeId) => {
    if (armed && nodeId === TARGET_NODE && options.replicaId === replicaId) {
      armed = false;
      await fault();
    }
  };
}

// The target node's next open of the replica is held until the gate opens.
function holdNextOpen(world, replicaId) {
  const gate = Promise.withResolvers();
  const reached = Promise.withResolvers();
  faultNextOpen(world, replicaId, async () => {
    reached.resolve();
    await gate.promise;
  });
  return {open: gate.resolve, reached: reached.promise};
}

// The pre-shutdown admission of every install orchestration on the target
// node is held at a gate (in production that await is the authoritative
// lifecycle read, a control-plane round trip of unbounded duration). Each
// entry: {service, descriptor, reached, open(), admission}.
function gateAdmissions(world) {
  const real = world.handler.snapshotInstallOwner;
  const gates = [];
  world.handler.snapshotInstallOwner = Object.freeze({...real,
    episodeFor(service) {
      const seam = real.episodeFor(service);
      const gate = Promise.withResolvers();
      const reached = Promise.withResolvers();
      const entry = {service, open: gate.resolve, reached: reached.promise,
        admission: null};
      gates.push(entry);
      return Object.freeze({...seam,
        async admit(descriptor) {
          entry.descriptor = descriptor;
          reached.resolve();
          await gate.promise;
          entry.admission = await seam.admit(descriptor);
          return entry.admission;
        },
      });
    }});
  return gates;
}

// One call of `target[method]` is held at a gate: the first one made while
// `when()` holds. Earlier and later calls pass straight through. Answers
// {reached, open()}; the held call runs the real method once the gate opens.
function holdCall(target, method, when) {
  const real = target[method];
  const gate = Promise.withResolvers();
  const reached = Promise.withResolvers();
  let armed = true;
  target[method] = async function heldCall(...args) {
    if (armed && when()) {
      armed = false;
      reached.resolve();
      await gate.promise;
    }
    return real.apply(this, args);
  };
  return {open: gate.resolve, reached: reached.promise};
}

// One authoritative read of a replica's lifecycle row is held at the control
// plane (in production a round trip of unbounded duration): the first one
// made while `when()` holds. Every other read passes.
function holdLifecycleRead(world, replicaId, when) {
  const gate = Promise.withResolvers();
  const reached = Promise.withResolvers();
  let armed = true;
  world.store.setBeforeAuthoritativeRead(async (tableName, params) => {
    if (armed && tableName === TABLES.SERVICES && params.includes(replicaId) &&
        when()) {
      armed = false;
      reached.resolve();
      await gate.promise;
    }
  });
  return {open: gate.resolve, reached: reached.promise};
}

// Cut a replica off: its unified address takes every message and answers
// nothing; reconnect() points the address at the replica's CURRENT service.
function cutOff(world, service) {
  const address = service.getUnifiedAddress();
  world.transport.register(address, () => {});
  return () => world.transport.register(address, service.transportHandler);
}

// The leader writes rows on the majority and its own sweep compacts its log
// past the threshold. Answers the compacted boundary.
async function writeAndCompact(world, from, to) {
  await insertRows(world.leader, from, to);
  await waitFor(() => userRows(world.leader).length === to &&
    userRows(world.voter).length === to, `${to} rows on the majority`);
  const head = Number(RaftRsDurableStore.readDurableRecordIn(
    world.leader.db, PARTITION_ID).appliedIndex);
  await waitFor(() => compactedIndex(world.leader) > 0 &&
    head - compactedIndex(world.leader) < CADENCE_ENTRY_THRESHOLD,
  'the leader\'s own sweep compacts its log past the threshold').catch((error) =>
    assert.fail(`${error.message}: cadence ${JSON.stringify(
      world.leader.getSnapshotCatchupDiagnostics().cadence)}`));
  return compactedIndex(world.leader);
}

// The committed ADD operation of a new replica on the target node, stamped
// with the COMMITTED membership the group's leader answers, and the CREATE
// request the operation owner dispatches for it.
async function committedAddRequest(world, replicaId) {
  const answer = await world.leader.raft[RAFT_OPERATION.READ_COMMITTED_MEMBERSHIP](
    {purpose: COMMITTED_MEMBERSHIP_READ_PURPOSE.BOOTSTRAP});
  const stamp = committedStampOfAnswer(answer);
  assert.notEqual(stamp, null,
    `the leader answers its committed membership: ${JSON.stringify(answer)}`);
  const operationId = `add-op-${replicaId}`;
  const now = Date.now();
  world.operations.push({operation_id: operationId, type: OperationType.ADD,
    entity_type: SERVICE_TYPE.PARTITION, entity_id: PARTITION_ID,
    partition_id: PARTITION_ID, replica_id: replicaId,
    source_node_id: world.founders[0][1], target_node_id: TARGET_NODE,
    status: ReplicaStatus.PENDING, workflow_step: 'SENDING',
    created_at: now, updated_at: now, completed_at: null,
    steps_history: JSON.stringify(
      [{[OPERATION_METADATA_KEY.BOOTSTRAP_MEMBERSHIP]: stamp}]),
    create_admission_state: null, create_admission_token: null,
    create_admission_replica_created_at: null,
    create_admission_attempt_token: null,
    create_admission_previous_attempt_token: null,
    create_admission_attempt_seq: null,
    create_admission_workflow_updated_at: null,
    create_admission_owner_incarnation: null});
  const admissionToken = buildReplicaCreateAdmissionToken({operationId,
    replicaId, targetNodeId: TARGET_NODE, workflowUpdatedAt: now});
  return {operationId, request: {
    [ReplicaOperationField.OPERATION_ID]: operationId,
    [ReplicaOperationField.OPERATION_TYPE]: OperationType.ADD,
    [ReplicaOperationField.ENTITY_TYPE]: SERVICE_TYPE.PARTITION,
    [ReplicaOperationField.ENTITY_ID]: PARTITION_ID,
    [ReplicaOperationField.PARTITION_ID]: PARTITION_ID,
    [ReplicaOperationField.REPLICA_ID]: replicaId,
    [ReplicaOperationField.CREATE_ADMISSION_TOKEN]: admissionToken,
    [ReplicaOperationField.CREATE_ADMISSION_WORKFLOW_UPDATED_AT]: now,
    [ReplicaOperationField.CREATE_ADMISSION_ATTEMPT_TOKEN]:
      buildReplicaCreateAttemptToken(admissionToken, 1),
    [ReplicaOperationField.CREATE_ADMISSION_ATTEMPT_SEQ]: 1,
    [ReplicaOperationField.BOOTSTRAP_MEMBERSHIP]: stamp,
  }};
}

export {
  CADENCE_ENTRY_THRESHOLD,
  PARTITION_ID,
  committedAddRequest,
  cutOff,
  durableStatus,
  enterRowState,
  faultNextOpen,
  gateAdmissions,
  holdCall,
  holdLifecycleRead,
  holdNextOpen,
  reaskAfter,
  recreationOf,
  rowStatesOf,
  targetService,
  userRows,
  waitFor,
  withInstallWorld,
  writeAndCompact,
};
