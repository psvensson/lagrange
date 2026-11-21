// The planner node of a three-node control plane, composed from the
// production owners the coordinator's topology guard consumes, around a real
// SERVICES partition: services-p1 is a three-replica rs-raft group formed by
// the partition group fixture (a real elected leader and real followers), and
// each replica is hosted on its own node's real MessageRouter.
//
// Production objects on the subject path: RebalanceCoordinator (composed by
// the shared rebalancer test composer), ControlPlaneSystemTableGateway,
// CDCIntegrationService and its authoritative read flow, SystemTableCache,
// QueryExecutor, MessageRouter and PartitionService (executeLocalQuery,
// buildRemoteReadAuthorityWitness, its transport handler).
//
// Substituted, and nothing else:
// - the channel transit between two nodes' routers, i.e. the hop behind
//   executeOnPartition: the planner router's query transport hands a delivery
//   (its remaining duration and abort signal) to the target node's router
//   (deliverLocal to the replica's own registered transport handler); a hop
//   to a node a case declares unreachable is answered "no handler";
// - the replica-operation ledger (replica_operations, storage_reservations),
//   which is not the subject: the coordinator SQL store fixture, answered at
//   the engine, at executeOnPartition and by the planner node's local ledger
//   leader replica, with the fixture leader witness;
//   A ledger write answers as the ledger leader's apply answers it: with the
//   producer's durable commit receipt (buildDurableCommitWitness over the
//   entry id derived from the named write's key, at a fixture log position),
//   so the named-write settlement judges it as it judges a real one;
// - the coordinator's non-subject collaborators as createTestCoordinator
//   supplies them (readiness, storage admission and accounting, policy,
//   dispatch router, transaction coordinator); a host opened with
//   `readyNodes` also publishes the three nodes as ready in its cache;
// - for the planner's own turn (openPlannerTurn): the planning gates, the
//   policy, the state evaluation and the move calculation (the turn plans the
//   one ADD while the ledger holds no operation for the service). The
//   production checkRebalance, its cadence, its scheduled retry and its move
//   execution run, on a virtual clock.
// The planner node's ReplicaHandler is constructed (never initialized) and
// holds the planner's services-p1 replica, as bootstrap attaches it, so the
// CDC service's in-process read arm consults the production owner of the
// replicas the node hosts.
// Consensus traffic between the replicas runs on the group fixture's
// loopback. The SERVICES table content is seeded into each replica's
// database directly (it is table content, not the subject). The planner's
// cache carries the published shape: partition SERVICES rows from the
// production row builder (which publishes every partition replica as a
// follower) and the leader only in partitions.leader_node_id.
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_NAME,
  getSchemaByTableName,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {CDC_OPERATION, NODE_STATE, SERVICE_STATUS, TABLES} from
  '../../src/constants/index.js';
import {UNIFIED_SERVICE_TYPE} from '../../src/constants/unified-service-lifecycle.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_READ_LEADER_MODE,
  ControlPlaneSystemTableGateway,
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {CONTROL_PLANE_READINESS_DIMENSION} from
  '../../src/control-plane/control-plane-readiness-constants.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ReplicaHandler} from '../../src/node/replica-handler.js';
import {PartitionServiceRowOwner} from
  '../../src/partition/partition-service-row-owner.js';
import {buildDurableCommitWitness} from '../../src/partition/partition-write-kernel.js';
import {deriveParticipantEntryId} from
  '../../src/query/distributed/distributed-write-coordinator.js';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {RAFT_LEADERSHIP_TRANSFER_SUCCESSOR, RAFT_OPERATION_OUTCOME} from
  '../../src/raft/raft-operation-port-constants.js';
import {turnChainValue} from '../../src/raft/raft-rs-turn-answer.js';
import {ENTITY_SERVICE_ROW_READ_SQL} from
  '../../src/rebalancer/entity-service-row-read.js';
import {MOVE_REASON} from '../../src/rebalancer/rebalancer-constants.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {EntityType, MoveType} from '../../src/rebalancer/unified-rebalancer.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {buildDeliveryEnvelope, deliveryAnswerOf} from
  '../../src/transport/transport-semantic-outcome.js';
import {createPostgresWireDefinition} from '../../src/wasm-service/meta-service-factory.js';
import {serializeServiceDefinition} from '../../src/wasm-service/wasm-service-models.js';
import {createCommittedServeEligibilityOwner} from
  '../control-plane/serve-eligibility-test-support.js';
import {formAdmittedGroup} from '../partition/partition-admitted-group-fixture.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';
import {
  buildMockPolicyAuthorityWitness,
  createCoordinatorSqlStore,
  createTestCoordinator,
  createTestRebalancer,
} from './test-helpers.js';

const NODE = Object.freeze({
  PLANNER: 'planner-node',
  PEER_A: 'peer-node-a',
  PEER_B: 'peer-node-b',
});
const NODE_ORDER = Object.freeze([NODE.PLANNER, NODE.PEER_A, NODE.PEER_B]);
const SERVICES_PARTITION_ID = INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SERVICES];
const REPLICA_ID_BY_NODE = Object.freeze({
  [NODE.PEER_A]: `${SERVICES_PARTITION_ID}-r1`,
  [NODE.PLANNER]: `${SERVICES_PARTITION_ID}-r2`,
  [NODE.PEER_B]: `${SERVICES_PARTITION_ID}-r3`,
});
const RUNTIME_SERVICE_ID = 'sys-postgres-wire';
const RUNTIME_SERVICE = UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE;
const RUNTIME_REPLICA_PATTERN = `${RUNTIME_SERVICE_ID}-r%`;
const DESIRED_RUNTIME_REPLICA_COUNT = 1;
const LEDGER_PARTITION_IDS = Object.freeze(new Set([
  INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.REPLICA_OPERATIONS],
  INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.STORAGE_RESERVATIONS],
]));
const LEDGER_STATEMENT =
  /\b(?:from|into|update)\s+(replica_operations|storage_reservations)\b/iu;
// The fixture ledger leader's term; its log positions count from 1.
const LEDGER_TERM = 1;
// The planner turn's cadence (rebalancer config) and its virtual step.
const PLANNER_CHECK_INTERVAL_MS = 5000;
const PLANNER_CHECK_JITTER_MS = 100;
const PLANNER_TURN_STEP_MS = 1000;
const PLANNER_TURN_START_DELAY_MS = 120000;
const PLANNER_TURN_POLICY = Object.freeze({targetReplicaCount: 1, minReplicaCount: 1,
  maxReplicaCount: 1, placementConstraints: Object.freeze({spreadAcrossNodes: true})});
const READY_LEASE_MS = 3600000;
const PLANNER_TURN_START_REASON = 'planner-turn-start';
const REFUSES_CREATION = () => {
  throw new Error('the guard fixture creates no replica');
};
const GROUP_TEMP_PREFIX = 'topology-guard-inventory-';
const GROUP_FORMATION_BUDGET_MS = 10000;
// The strict probe's own bound; the guard's read keeps the coordinator's.
const STRICT_READ_TIMEOUT_MS = 2000;
const STRICT_OWNER_READ_OPTIONS = Object.freeze({
  authoritativeReadMode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
  leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
  timeoutMs: STRICT_READ_TIMEOUT_MS,
});
const CROSS_NODE_HOP_MESSAGE_ID = 'topology-guard-inventory-hop';
const ADDRESS_SEPARATOR = '/';
const PARTITION_NOT_SERVED = 'fixture serves no partition ';
const ENGINE_STATEMENT_NOT_SERVED =
  'fixture engine serves the replica-operation ledger only';
const SERVICES_COLUMNS = Object.freeze(new Set(
  getSchemaByTableName(SYSTEM_TABLE_NAME.SERVICES).columns.map(({name}) => name)));
const LEDGER_ROW_SQL = 'SELECT * FROM replica_operations WHERE entity_id = ? ' +
  'ORDER BY operation_id';
const QUIET_LOG_LEVEL = 'error';

function initializeGuardEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: NODE.PLANNER},
    rebalancer: {periodicCheckIntervalMs: PLANNER_CHECK_INTERVAL_MS,
      periodicCheckJitterMs: PLANNER_CHECK_JITTER_MS}});
  LoggingService.getInstance().initialize({level: QUIET_LOG_LEVEL});
}

function resetGuardEnvironment() {
  LoggingService.resetInstance();
  ConfigurationManager.resetInstance();
}

// The request the unified rebalancer builds for this move
// (unified-rebalancer-move-execution.js buildCoordinatorOperationRequest),
// as the planner node sent it in the GCP formation run.
function buildPlannerAddRequest() {
  return {
    type: OperationType.ADD,
    partitionId: RUNTIME_SERVICE_ID,
    entityType: RUNTIME_SERVICE,
    entityId: RUNTIME_SERVICE_ID,
    nodeId: NODE.PLANNER,
    replicaId: null,
    moveReason: MOVE_REASON.INCREASE_REPLICA_COUNT,
    enforceConcurrentOperationBudget: true,
  };
}

// The planner's move itself, for the planner's own execution entry.
function buildPlannerAddMove() {
  return {
    type: MoveType.ADD,
    partitionId: RUNTIME_SERVICE_ID,
    entityType: EntityType.RUNTIME_SERVICE,
    entityId: RUNTIME_SERVICE_ID,
    nodeId: NODE.PLANNER,
    reason: MOVE_REASON.INCREASE_REPLICA_COUNT,
  };
}

function insertTableRow(db, tableName, row) {
  const entries = Object.entries(row).filter(([column, value]) =>
    SERVICES_COLUMNS.has(column) && value !== undefined);
  db.prepare(`INSERT INTO ${tableName} (${entries.map(([column]) => column).join(', ')}) ` +
    `VALUES (${entries.map(() => '?').join(', ')})`).run(...entries.map(([, value]) => value));
}

// The production publication of one partition replica's SERVICES row.
function publishedPartitionRow(replica) {
  return PartitionServiceRowOwner.buildServiceRow({
    partitionId: SERVICES_PARTITION_ID,
    replicaId: replica.replicaId,
    nodeId: replica.nodeId,
    service: replica,
    status: SERVICE_STATUS.ACTIVE,
  });
}

function buildRuntimeOccupantRow(nodeId, nowMs) {
  return {
    service_id: `${RUNTIME_SERVICE_ID}-r1`,
    service_type: RUNTIME_SERVICE,
    node_id: nodeId,
    status: SERVICE_STATUS.ACTIVE,
    created_at: nowMs,
    updated_at: nowMs,
  };
}

async function startRouters(ports) {
  const routers = new Map();
  for (const nodeId of NODE_ORDER) {
    const router = new MessageRouter({nodeId, wsPort: ports.getPort(),
      inProcess: true, bootIncarnation: TEST_BOOT_INCARNATION});
    routers.set(nodeId, router);
    await router.initialize({startServer: true});
  }
  const planner = routers.get(NODE.PLANNER);
  for (const nodeId of NODE_ORDER.filter((id) => id !== NODE.PLANNER)) {
    await planner.connectToNode(nodeId, routers.get(nodeId).advertisedAddress);
  }
  return routers;
}

// Count, per replica, the statements its local arm ran (executeLocalQuery)
// and the requests its receiver answered (handleRemoteQuery): observation
// only, the production methods run unchanged.
function countReplicaReads(replica) {
  const counts = {local: 0, receiver: 0};
  const executeLocalQuery = replica.executeLocalQuery.bind(replica);
  const handleRemoteQuery = replica.handleRemoteQuery.bind(replica);
  replica.executeLocalQuery = (...args) => {
    counts.local += 1;
    return executeLocalQuery(...args);
  };
  replica.handleRemoteQuery = (...args) => {
    counts.receiver += 1;
    return handleRemoteQuery(...args);
  };
  return counts;
}

/**
 * Form services-p1 with `leaderNodeId` leading, host each replica on its
 * node's router and seed the SERVICES table content into every replica.
 * @param {Object} options - {leaderNodeId, ports}: ports is the test file's
 *   port allocator.
 * @return {Promise<Object>} The world; close() releases it.
 */
async function openServicesWorld({leaderNodeId, ports}) {
  const memberOrder = [leaderNodeId,
    ...NODE_ORDER.filter((nodeId) => nodeId !== leaderNodeId)];
  const group = await formAdmittedGroup({
    partitionId: SERVICES_PARTITION_ID,
    members: memberOrder.map((nodeId) => [REPLICA_ID_BY_NODE[nodeId], nodeId]),
    tempPrefix: GROUP_TEMP_PREFIX,
    budgetMs: GROUP_FORMATION_BUDGET_MS,
    serviceOptions: {
      tableId: SYSTEM_TABLE_NAME.SERVICES,
      tableName: SYSTEM_TABLE_NAME.SERVICES,
      schema: structuredClone(getSchemaByTableName(SYSTEM_TABLE_NAME.SERVICES)),
      suppressLifecycleLogs: true,
    },
  });
  let routers = new Map();
  const close = async () => {
    await Promise.allSettled([...routers.values()].map((router) => router.shutdown()));
    await group.dispose();
  };
  try {
    // The group fixture waits on the consensus core's role; the CDC read
    // routing reads the service's own role, which the core's events set.
    const settled = await group.waitFor(() => group.services.every((replica) =>
      replica.getRole() === (replica.nodeId === leaderNodeId ?
        RAFT_ROLE.LEADER : RAFT_ROLE.FOLLOWER)));
    if (!settled) {
      throw new Error(`setup: ${SERVICES_PARTITION_ID} service roles did not settle: ` +
        JSON.stringify(group.services.map((replica) => [replica.nodeId, replica.getRole()])));
    }
    routers = await startRouters(ports);
    const readCounts = new Map(group.services.map((replica) =>
      [replica.nodeId, countReplicaReads(replica)]));
    for (const replica of group.services) {
      routers.get(replica.nodeId).register(replica.unifiedAddress, replica.transportHandler);
    }
    const publishedRows = group.services.map(publishedPartitionRow);
    for (const replica of group.services) {
      for (const row of publishedRows) {
        insertTableRow(replica.db, SYSTEM_TABLE_NAME.SERVICES, row);
      }
    }
    const replicaOn = (nodeId) => group.services.find((replica) =>
      replica.nodeId === nodeId) || null;
    return Object.freeze({
      leaderNodeId,
      replicas: group.services,
      publishedRows,
      replicaOn,
      routerOf: (nodeId) => routers.get(nodeId) || null,
      connectionStateOf: (nodeId) =>
        routers.get(NODE.PLANNER).getConnectionState(nodeId),
      // A row the leader holds that the lagging replicas do not.
      seedLeaderOnlyRow: (row) => insertTableRow(
        replicaOn(leaderNodeId).db, SYSTEM_TABLE_NAME.SERVICES, row),
      tableRowsOn: (nodeId, sql, params = []) =>
        replicaOn(nodeId).db.prepare(sql).all(...params),
      readCountsOf: (nodeId) => Object.freeze({...readCounts.get(nodeId)}),
      // Actual raft leadership moves; no projection is told.
      async transferLeadership(fromNodeId, toNodeId) {
        const from = replicaOn(fromNodeId);
        const to = replicaOn(toNodeId);
        const requested = await turnChainValue(from.requestLeadershipTransfer({
          successor: RAFT_LEADERSHIP_TRANSFER_SUCCESSOR.NAMED,
          replicaIdentity: to.replicaId}));
        if (requested?.outcome !== RAFT_OPERATION_OUTCOME.CORE_OK) {
          throw new Error(`setup: transfer refused ${JSON.stringify(requested)}`);
        }
        const moved = await group.waitFor(() =>
          from.raft.readStatus().role === RAFT_ROLE.FOLLOWER &&
          to.raft.readStatus().role === RAFT_ROLE.LEADER &&
          from.raft.readStatus().leaderId === to.replicaId);
        if (!moved) throw new Error('setup: services-p1 leadership did not move');
      },
      close,
    });
  } catch (error) {
    await close();
    throw error;
  }
}

function seedReadyNodes(cache) {
  for (const nodeId of NODE_ORDER) {
    cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.INSERT, {node_id: nodeId,
      status: NODE_STATE.ACTIVE, connection_state: NODE_STATE.READY,
      ready_lease_expires_at: Date.now() + READY_LEASE_MS});
  }
}

function seedPlannerCache(cache, world) {
  cache.applySystemTableChange(TABLES.PARTITIONS, CDC_OPERATION.INSERT, {
    partition_id: SERVICES_PARTITION_ID,
    table_id: SYSTEM_TABLE_NAME.SERVICES,
    leader_node_id: world.leaderNodeId,
  });
  for (const row of world.publishedRows) {
    cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.INSERT, row);
  }
  cache.applySystemTableChange(TABLES.SERVICE_DEFINITIONS, CDC_OPERATION.INSERT, {
    ...serializeServiceDefinition(createPostgresWireDefinition()),
    replica_count: DESIRED_RUNTIME_REPLICA_COUNT,
  });
}

function withAffectedRows(result) {
  return Number.isSafeInteger(result?.changes) ?
    {...result, affectedRows: result.changes} : result;
}

// A committed ledger write as the ledger leader's apply answers it: the
// statement's count and the producer's durable commit receipt for the entry
// the named write's key derives on the statement's partition.
function withLedgerCommitReceipt(result, sql, options, nextLogIndex) {
  const answer = withAffectedRows(result);
  const key = options?.idempotencyKey;
  const [, tableName] = String(sql).match(LEDGER_STATEMENT) ?? [];
  if (answer?.success !== true || !Number.isSafeInteger(answer.affectedRows) ||
      typeof key !== 'string' || tableName === undefined) {
    return answer;
  }
  const partitionId = INITIAL_PARTITION_IDS[tableName.toLowerCase()];
  return {...answer, partitionId, durableCommitWitness: buildDurableCommitWitness({
    partitionId, leaderNodeId: NODE.PLANNER,
    leaderReplicaId: `${partitionId}-${NODE.PLANNER}`,
    logEntry: {term: LEDGER_TERM, index: nextLogIndex(),
      data: {entryId: deriveParticipantEntryId(key, partitionId), idempotencyKey: key}}})};
}

function answerLedgerPartitionStatement(store, partitionId, sql, params) {
  const result = store.execute(sql, params);
  if (result.success !== true) return {...result, rowSetComplete: false};
  return Array.isArray(result.rows) ?
    {...result, readAuthorityWitness: buildMockPolicyAuthorityWitness(partitionId)} :
    withAffectedRows(result);
}

// As on the wire, only the remaining duration and the caller's abort cross to
// the target router; that router's delivery lifetime is its own
// (message-router-delivery-lifetime.js refuses another router's lifetime).
async function crossNodeHop(context, address, message, options) {
  const nodeId = String(address).split(ADDRESS_SEPARATOR)[0];
  const target = context.world.routerOf(nodeId);
  const refused = target === null || context.unreachable.has(nodeId);
  const {deliveryLifetime, signal} = options.transportDeliveryOptions;
  const remainingMs = deliveryLifetime.remainingMs();
  const delivery = refused ?
    buildDeliveryEnvelope({acknowledged: false, noHandler: true}) :
    await target.deliverLocal(address, CROSS_NODE_HOP_MESSAGE_ID, message, null,
      {timeoutMs: remainingMs, signal}).then(({result, answer}) =>
      buildDeliveryEnvelope(result, answer));
  context.observed.hops.push(Object.freeze({address, nodeId, refused, remainingMs,
    answer: deliveryAnswerOf(delivery)}));
  return {delivery};
}

// The planner node's own leader replica of a ledger partition, as the CDC
// read flow sees a hosted partition service: the coordinator's ledger reads
// in OWNER_LOCAL_ONLY mode (repository default) need a local replica, as the
// planner node in the GCP run led replica_operations-p1. It exposes no write
// method, so ledger writes take the engine path to the same store.
function createLocalLedgerReplica(store, partitionId) {
  return Object.freeze({
    partitionId,
    replicaId: `${partitionId}-${NODE.PLANNER}`,
    initialized: true,
    getRole: () => RAFT_ROLE.LEADER,
    buildRemoteReadAuthorityWitness: () => buildMockPolicyAuthorityWitness(partitionId),
    executeLocalQuery: async (sql, params = []) =>
      answerLedgerPartitionStatement(store, partitionId, sql, params),
  });
}

function tapServicesReads(gateway, observed) {
  const readAuthoritativeRows = gateway.readAuthoritativeRows.bind(gateway);
  gateway.readAuthoritativeRows = async (tableName, sql, params = [], options = {}) => {
    const result = await readAuthoritativeRows(tableName, sql, params, options);
    if (tableName === SYSTEM_TABLE_NAME.SERVICES) {
      observed.servicesReads.push(Object.freeze({sql, params: [...params],
        options: {...options}, result}));
    }
    return result;
  };
}

async function settle(run) {
  try {
    return Object.freeze({value: await run(), error: null});
  } catch (error) {
    return Object.freeze({value: null, error});
  }
}

/**
 * The planner's own turn for the runtime service on `clock`: the production
 * checkRebalance, its cadence and its scheduled retry, executing the move
 * through the production executeMoveViaCoordinator; the planning itself is
 * substituted (header). Turns come only from the rebalancer's own queue and
 * timer; nothing else enqueues a check after start().
 * @param {Object} t - The case's tap test.
 * @param {Object} host - {cache, coordinator, ledgerRows}.
 * @param {Object} options - {clock, scheduledRetry}: scheduledRetry false
 *   disables the turn's scheduled retry (anti-vacuity arm).
 * @param {Array} rebalancers - The host's rebalancers (shut down with it).
 * @return {Object} {start, advance, stop, results}.
 */
function openPlannerTurn(t, host, {clock, scheduledRetry = true}, rebalancers) {
  const rebalancer = createTestRebalancer({entityId: RUNTIME_SERVICE_ID,
    entityType: EntityType.RUNTIME_SERVICE, nodeId: NODE.PLANNER,
    systemTableCache: host.cache, rebalanceCoordinator: host.coordinator,
    nowFn: () => clock.now(), setTimeoutFn: clock.setTimeout.bind(clock),
    clearTimeoutFn: clock.clearTimeout.bind(clock)});
  rebalancers.push(rebalancer);
  const results = [];
  rebalancer.getCheckRebalanceBlocker = async () => null;
  rebalancer.getPolicy = async () => PLANNER_TURN_POLICY;
  rebalancer.evaluateState = async () => true;
  rebalancer.rebalance = async () => {
    const moves = host.ledgerRows().length === 0 ? [buildPlannerAddMove()] : [];
    const executed = [];
    for (const move of moves) {
      const result = await rebalancer.executeMoveViaCoordinator(move);
      executed.push(result);
      results.push(result);
    }
    return rebalancer.buildRebalanceResult(true, {moves: executed});
  };
  if (!scheduledRetry) rebalancer.scheduleNextCheck = () => {};
  const advance = async (durationMs) => {
    for (let elapsed = 0; elapsed < durationMs; elapsed += PLANNER_TURN_STEP_MS) {
      clock.advance(PLANNER_TURN_STEP_MS);
      await rebalancer.awaitCurrentWorkIdle();
    }
  };
  return Object.freeze({
    results,
    async start() {
      rebalancer.initialize();
      rebalancer.clusterReadinessConfirmed = true;
      rebalancer.isLeader = true;
      clock.advance(PLANNER_TURN_START_DELAY_MS);
      rebalancer.enqueueRebalanceCheck(PLANNER_TURN_START_REASON);
      await rebalancer.awaitCurrentWorkIdle();
    },
    advance,
    async stop() {
      rebalancer.shutdown();
      await rebalancer.awaitCurrentWorkIdle();
      t.comment(`planner turn stopped with ${clock.pendingTimerCount()} virtual timers`);
    },
  });
}

/**
 * The planner node's owners for one case, on the world's services-p1 group.
 * @param {Object} t - The case's tap test (owns the teardown).
 * @param {Object} world - openServicesWorld().
 * @param {Object} [options] - {unreachableNodeIds, readyNodes}: nodes whose
 *   hop refuses (setReachable changes it later); whether the host's cache
 *   publishes the three nodes as ready.
 * @return {Object} The host.
 */
function openPlannerHost(t, world, {unreachableNodeIds = [], readyNodes = false} = {}) {
  const observed = {servicesReads: [], ownerRpc: [], hops: [], engineRefusals: []};
  const cache = new SystemTableCache();
  seedPlannerCache(cache, world);
  if (readyNodes) seedReadyNodes(cache);
  const store = createCoordinatorSqlStore(cache);
  let ledgerLogIndex = 0;
  const nextLedgerLogIndex = () => {
    ledgerLogIndex += 1;
    return ledgerLogIndex;
  };
  const router = world.routerOf(NODE.PLANNER);
  const queryExecutor = new QueryExecutor({nodeId: NODE.PLANNER, messageRouter: router,
    systemCache: cache, controlPlaneReadinessService: createCommittedServeEligibilityOwner()});
  const hopContext = {world, observed, unreachable: new Set(unreachableNodeIds)};
  router.setQueryMessageGroupServiceResolver(() => ({
    sendMessage: (address, message, options) =>
      crossNodeHop(hopContext, address, message, options),
  }));
  const sqlQueryEngine = {
    queryExecutor: {
      async executeOnPartition(partitionId, sql, params = [], ...rest) {
        if (partitionId === SERVICES_PARTITION_ID) {
          observed.ownerRpc.push(Object.freeze({sql, params: [...params],
            preferLeader: rest[1] === true}));
          return queryExecutor.executeOnPartition(partitionId, sql, params, ...rest);
        }
        if (LEDGER_PARTITION_IDS.has(partitionId)) {
          return answerLedgerPartitionStatement(store, partitionId, sql, params);
        }
        return {success: false, rows: [], rowSetComplete: false,
          error: `${PARTITION_NOT_SERVED}${partitionId}`};
      },
    },
    async executeQuery(sql, params = [], options = {}) {
      if (!LEDGER_STATEMENT.test(String(sql))) {
        observed.engineRefusals.push(String(sql));
        return {success: false, rows: [], rowSetComplete: false,
          error: ENGINE_STATEMENT_NOT_SERVED};
      }
      return withLedgerCommitReceipt(store.execute(sql, params), sql, options,
        nextLedgerLogIndex);
    },
  };
  const hostedPartitions = new Map([
    [SERVICES_PARTITION_ID, world.replicaOn(NODE.PLANNER)],
    ...[...LEDGER_PARTITION_IDS].map((partitionId) =>
      [partitionId, createLocalLedgerReplica(store, partitionId)]),
  ]);
  const cdc = new CDCIntegrationService({nodeId: NODE.PLANNER, systemTableCache: cache,
    sqlQueryEngine, messageRouter: router,
    partitionServicesProvider: () => hostedPartitions});
  cdc.initialize();
  // The production owner of the replicas the node hosts binds itself to the
  // CDC service at construction; it holds the planner's services-p1 replica.
  const replicaHandler = new ReplicaHandler({nodeId: NODE.PLANNER, systemTableCache: cache,
    cdcIntegrationService: cdc, createPartitionService: REFUSES_CREATION});
  const plannerReplica = world.replicaOn(NODE.PLANNER);
  replicaHandler.localServices.set(plannerReplica.replicaId, plannerReplica);
  const gateway = new ControlPlaneSystemTableGateway({nodeId: NODE.PLANNER,
    cdcIntegrationService: cdc, systemTableCache: cache, sqlQueryEngine});
  tapServicesReads(gateway, observed);
  const coordinator = createTestCoordinator({nodeId: NODE.PLANNER, systemTableCache: cache,
    controlPlaneSystemTableGateway: gateway, sqlQueryEngine, cdcIntegrationService: cdc,
    enableTimeouts: false});
  const rebalancers = [];
  t.teardown(async () => {
    for (const rebalancer of rebalancers) rebalancer.shutdown();
    await coordinator.shutdown();
    cdc.markShuttingDown();
    router.setQueryMessageGroupServiceResolver(null);
    store.suspend();
  });

  const mark = () => Object.freeze(Object.fromEntries(
    Object.entries(observed).map(([key, entries]) => [key, entries.length])));
  const since = (marked) => Object.freeze(Object.fromEntries(
    Object.entries(observed).map(([key, entries]) => [key, entries.slice(marked[key])])));

  return Object.freeze({
    cache, store, cdc, gateway, coordinator, queryExecutor, observed,
    // A node's channel becomes reachable or unreachable; nothing is told.
    setReachable(nodeId, reachable) {
      if (reachable) hopContext.unreachable.delete(nodeId);
      else hopContext.unreachable.add(nodeId);
    },
    openPlannerTurn: (turnOptions) => openPlannerTurn(t, {cache, coordinator,
      ledgerRows: () => store.execute(LEDGER_ROW_SQL, [RUNTIME_SERVICE_ID]).rows},
    turnOptions, rebalancers),
    async createAdd(request = buildPlannerAddRequest()) {
      const marked = mark();
      const outcome = await settle(() => coordinator.createOperation(request));
      return Object.freeze({operation: outcome.value, error: outcome.error,
        ...since(marked)});
    },
    async planAdd() {
      const marked = mark();
      const outcome = await settle(() => {
        const rebalancer = createTestRebalancer({entityId: RUNTIME_SERVICE_ID,
          entityType: EntityType.RUNTIME_SERVICE, nodeId: NODE.PLANNER,
          systemTableCache: cache, rebalanceCoordinator: coordinator});
        rebalancers.push(rebalancer);
        return rebalancer.executeMoveViaCoordinator(buildPlannerAddMove());
      });
      return Object.freeze({result: outcome.value, error: outcome.error, ...since(marked)});
    },
    // The read the priority surplus REMOVE fence makes
    // (rebalance-coordinator-topology-guard-methods.js), with its own bound.
    async readServicesStrictly() {
      const marked = mark();
      const outcome = await settle(() =>
        coordinator.getAuthoritativeEntityServiceRowsObservation({
          partitionId: RUNTIME_SERVICE_ID, entityType: RUNTIME_SERVICE,
          entityId: RUNTIME_SERVICE_ID, readOptions: STRICT_OWNER_READ_OPTIONS}));
      return Object.freeze({observation: outcome.value, error: outcome.error,
        ...since(marked)});
    },
    ledgerRows: () => store.execute(LEDGER_ROW_SQL, [RUNTIME_SERVICE_ID]).rows,
    route() {
      const routing = settleSync(() => queryExecutor.getPartitionRoutingSnapshot(
        SERVICES_PARTITION_ID,
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE));
      const leader = world.replicaOn(world.leaderNodeId);
      const planner = world.replicaOn(NODE.PLANNER);
      return Object.freeze({
        publishedLeaderNodeId:
          cache.get(TABLES.PARTITIONS, SERVICES_PARTITION_ID)?.leader_node_id,
        publishedRaftRoles: cache.filter(TABLES.SERVICES, (row) =>
          row.partition_id === SERVICES_PARTITION_ID).map((row) =>
          [row.node_id, row.raft_role]),
        routingCanonicalLeaderNodeId: routing.value?.canonicalLeaderNodeId,
        routingError: routing.error?.message,
        correctTarget: {nodeId: leader.nodeId, replicaId: leader.replicaId,
          address: leader.unifiedAddress, consensusRole: leader.raft.readStatus().role},
        plannerReplica: {nodeId: planner.nodeId, replicaId: planner.replicaId,
          role: planner.getRole(), consensusRole: planner.raft.readStatus().role},
      });
    },
  });
}

function settleSync(run) {
  try {
    return {value: run(), error: null};
  } catch (error) {
    return {value: null, error};
  }
}

// The guard's SERVICES inventory read (entity-service-row-read.js), whatever
// mode it is issued in.
function isGuardServicesRead(read) {
  return read?.sql === ENTITY_SERVICE_ROW_READ_SQL.RUNTIME_SERVICE &&
    read.params[0] === RUNTIME_SERVICE && read.params[1] === RUNTIME_REPLICA_PATTERN;
}

function isGuardOwnerRpc(call) {
  return call?.sql === ENTITY_SERVICE_ROW_READ_SQL.RUNTIME_SERVICE;
}

// What an owned reconsideration of a refusal looks like at this boundary: a
// retry deadline or a named next action the refusal itself carries.
function reconsiderationOf(error) {
  const admission = error?.admissionResult;
  const retryAfterMs = [admission?.topologySnapshot?.authoritativeRetryAfterMs,
    admission?.retryAfterMs, error?.retryAfterMs].find((value) =>
    Number.isFinite(value) && value > 0);
  const nextAction = [admission?.nextAction, error?.nextAction].find((value) =>
    typeof value === 'string' && value.length > 0);
  return retryAfterMs === undefined && nextAction === undefined ? null :
    Object.freeze({retryAfterMs, nextAction});
}

function refusalOf(error) {
  if (!error) return null;
  const admission = error.admissionResult;
  const snapshot = admission?.topologySnapshot;
  return {
    message: error.message,
    reason: admission?.reason,
    blockingReasons: admission?.blockingReasons,
    decisionType: admission?.decisionType,
    rebalanceSkipReason: error.rebalanceSkipReason,
    errorReasonCode: error.reasonCode,
    authoritativeAvailable: snapshot?.authoritativeAvailable,
    authoritativeReasonCode: snapshot?.authoritativeReasonCode,
    authoritativeRetryAfterMs: snapshot?.authoritativeRetryAfterMs,
    inventoryProvenance: snapshot?.inventoryProvenance,
    reconsideration: reconsiderationOf(error),
  };
}

// Every field a planner retry could observe of a refusal, byte for byte.
function refusalFingerprint(error) {
  return JSON.stringify({message: error?.message, admissionResult: error?.admissionResult,
    rebalanceSkipReason: error?.rebalanceSkipReason, reasonCode: error?.reasonCode,
    retryAfterMs: error?.retryAfterMs, nextAction: error?.nextAction});
}

function summarizeServicesRead(read) {
  if (!read) return null;
  const result = read.result;
  const diagnostics = result?.systemTableDiagnostics;
  return {
    mode: {authoritativeReadMode: read.options.authoritativeReadMode,
      leaderMode: read.options.leaderMode},
    success: result?.success,
    rowSetComplete: result?.rowSetComplete,
    partial: result?.partial,
    rows: result?.rows,
    source: result?.source,
    localReadHit: result?.localReadHit,
    localReplicaFallbackHit: result?.localReplicaFallbackHit,
    outcome: result?.outcome,
    strategyUsed: result?.strategyUsed,
    error: result?.error,
    errorCode: result?.errorCode,
    reasonCode: result?.reasonCode,
    readAuthorityWitness: result?.readAuthorityWitness,
    readAuthorityWitnesses: result?.readAuthorityWitnesses,
    diagnostics: diagnostics && {leaderNodeId: diagnostics.leaderNodeId,
      localReadHit: diagnostics.localReadHit,
      localReplicaFallbackHit: diagnostics.localReplicaFallbackHit,
      routedToNode: diagnostics.routedToNode},
  };
}

export {
  NODE,
  RUNTIME_SERVICE,
  RUNTIME_SERVICE_ID,
  SERVICES_PARTITION_ID,
  buildRuntimeOccupantRow,
  initializeGuardEnvironment,
  isGuardOwnerRpc,
  isGuardServicesRead,
  openPlannerHost,
  openServicesWorld,
  reconsiderationOf,
  refusalFingerprint,
  refusalOf,
  resetGuardEnvironment,
  summarizeServicesRead,
};
