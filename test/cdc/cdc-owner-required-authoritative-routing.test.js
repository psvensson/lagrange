import {test} from '../../src/test-helpers/tap.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {INITIAL_PARTITION_IDS, SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ControlPlaneSystemTableGateway} from
  '../../src/control-plane/control-plane-system-table-gateway.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE as MODE,
  CONTROL_PLANE_READ_LEADER_MODE as LEADER,
} from '../../src/control-plane/control-plane-system-table-gateway-constants.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {managedSleep} from '../../src/test-helpers/managed-timers.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {buildDeliveryEnvelope, deliveryAnswerOf} from
  '../../src/transport/transport-semantic-outcome.js';
import {createCommittedServeEligibilityOwner} from
  '../control-plane/serve-eligibility-test-support.js';
import {withFoundingStamp} from '../partition/partition-founding-stamp.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';
import {createLocalSystemTablePartitionServices} from
  './cdc-integration-service-test-support.js';

const TABLE = SYSTEM_TABLE_NAME.REPLICA_OPERATIONS;
const PARTITION = INITIAL_PARTITION_IDS[TABLE];
const CALLER = 'strict-read-caller';
const OWNER = 'strict-read-owner';
const OWNER_PORT = 19873;
const CALLER_PORT = 19874;
const REPLICA = 'strict-read-replica';
const ADDRESS = `${OWNER}/partition/${REPLICA}`;
const OPERATION = 'strict-read-operation';
const SQL = 'SELECT operation_id, workflow_step FROM replica_operations ' +
  'WHERE operation_id = ?';
const REFUSED_SQL = 'SELECT unavailable_column FROM replica_operations ' +
  'WHERE operation_id = ?';
const OWNER_ROW = {operation_id: OPERATION, workflow_step: 'OWNER'};
const LOCAL_ROW = {operation_id: OPERATION, workflow_step: 'LOCAL'};
const TIMEOUT_MS = 2000;
const SETUP_POLL_MS = 5;
const SETUP_POLLS = 400;

function seedRoutingCache() {
  const cache = new SystemTableCache();
  cache.applySystemTableChange(SYSTEM_TABLE_NAME.PARTITIONS, 'INSERT', {
    partition_id: PARTITION, table_id: TABLE, leader_node_id: OWNER,
  });
  cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
    service_id: REPLICA, replica_id: REPLICA, node_id: OWNER,
    partition_id: PARTITION, service_type: 'partition',
    status: 'active', address: ADDRESS,
  });
  return cache;
}

function createReadSurface({router, cache, localRead}) {
  const queryExecutor = new QueryExecutor({
    nodeId: router.nodeId,
    messageRouter: router,
    systemCache: cache,
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
  });
  const sqlQueryEngine = {queryExecutor};
  const cdc = new CDCIntegrationService({
    nodeId: router.nodeId,
    messageRouter: router,
    sqlQueryEngine,
    systemTableCache: cache,
    partitionServicesProvider: () =>
      createLocalSystemTablePartitionServices(TABLE, {executeQuery: localRead}),
  });
  cdc.initialize();
  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: router.nodeId,
    cdcIntegrationService: cdc,
    systemTableCache: cache,
    sqlQueryEngine,
  });
  return {
    read(mode, sql) {
      return gateway.readAuthoritativeRows(TABLE, sql, [OPERATION], {
        timeoutMs: TIMEOUT_MS,
        authoritativeReadMode: mode,
        leaderMode: LEADER.REQUIRED,
        localReadConsistency: 'local_leader',
        deliveryPriority: 'critical',
        workClass: 'critical',
      });
    },
  };
}

async function observeRead(surface, mode, sql, calls) {
  const request = surface.read(mode, sql);
  // Both possible first events are controlled. Always release the held leaf
  // after recording the first event so the old path can finish its assertions.
  let first;
  try {
    first = await Promise.race([
      calls.localEntered.promise.then(() => 'local probe'),
      request.then(() => 'result'),
    ]);
  } finally {
    calls.localReleased.resolve();
  }
  return {first, answer: await request};
}

function makeReadCalls(partition = null) {
  const localEntered = Promise.withResolvers();
  const localReleased = Promise.withResolvers();
  const owner = [];
  let localCount = 0;
  return {
    localEntered,
    localReleased,
    owner,
    get localCount() {
      return localCount;
    },
    async readLocal(sql, params) {
      localCount += 1;
      localEntered.resolve();
      await localReleased.promise;
      return partition ? partition.executeQuery(sql, params) : {success: true, rows: [LOCAL_ROW]};
    },
  };
}

test('strict CDC reads route to the registered owner while a local query is held',
  async (t) => {
    ConfigurationManager.getInstance().initialize({});
    LoggingService.getInstance().initialize({level: 'error'});
    const callerRouter = new MessageRouter({
      nodeId: CALLER, wsPort: CALLER_PORT, inProcess: true,
      bootIncarnation: TEST_BOOT_INCARNATION,
    });
    const ownerRouter = new MessageRouter({
      nodeId: OWNER, wsPort: OWNER_PORT, inProcess: true,
      bootIncarnation: TEST_BOOT_INCARNATION,
    });
    const cache = seedRoutingCache();
    const partition = new PartitionService(withFoundingStamp({
      partitionId: PARTITION, replicaId: REPLICA, nodeId: OWNER,
      tableName: TABLE, tableId: TABLE, dbPath: ':memory:',
      transport: ownerRouter,
      systemTableCache: cache,
      schema: {columns: [
        {name: 'operation_id', type: 'TEXT', primaryKey: true},
        {name: 'workflow_step', type: 'TEXT'},
      ]},
    }));

    try {
      await callerRouter.initialize({startServer: true});
      await ownerRouter.initialize({startServer: true});
      await callerRouter.connectToNode(OWNER, ownerRouter.advertisedAddress);
      // Recovery reads give a disconnected candidate a one-millisecond
      // probe. Exercise the ready owner path over an actual connected pair.
      t.equal(callerRouter.getConnectionState(OWNER), 'connected',
        'the remote owner has a live node connection');
      await partition.initialize();
      partition.raft.campaign();
      t.equal(partition.raft.readStatus().role, 'leader', 'native owner is leader');
      t.equal(ownerRouter.getRegisteredHandler(ADDRESS), partition.transportHandler,
        'the exact native owner transport handler is registered');
      partition.db.prepare('INSERT INTO replica_operations ' +
        '(operation_id, workflow_step) VALUES (?, ?)')
        .run(OWNER_ROW.operation_id, OWNER_ROW.workflow_step);

      const cases = [
        {label: 'remote success', mode: MODE.OWNER_RPC_REQUIRED, sql: SQL, success: true},
        {label: 'remote refusal', mode: MODE.OWNER_RPC_REQUIRED, sql: REFUSED_SQL},
        {label: 'remote unavailable', mode: MODE.OWNER_RPC_REQUIRED, sql: SQL, unavailable: true},
        {label: 'same-host owner', mode: MODE.OWNER_RPC_REQUIRED, sql: SQL, success: true, localOwner: true},
        {label: 'preferred owner', mode: MODE.OWNER_RPC_PREFERRED, sql: SQL, success: true},
        {label: 'preferred local', mode: MODE.OWNER_LOCAL_PREFERRED_OWNER_RPC_FALLBACK,
          sql: SQL, success: true, localResult: true},
      ];
      for (const scenario of cases) {
        await t.test(scenario.label, async (t) => {
          const router = scenario.localOwner ? ownerRouter : callerRouter;
          const calls = makeReadCalls(scenario.localOwner ? partition : null);
          // Only channel transit is controlled. SQL, authority witness and
          // delivery acknowledgment come from the registered native responder.
          router.setQueryMessageGroupServiceResolver(() => ({
            async sendMessage(address, message, options) {
              const budget = options.transportDeliveryOptions;
              const delivery = scenario.unavailable ?
                buildDeliveryEnvelope({acknowledged: false, noHandler: true}) :
                await ownerRouter.deliverLocal(address, 'held-read-delivery',
                  message, null, budget).then(({result, answer}) =>
                  buildDeliveryEnvelope(result, answer));
              calls.owner.push({address, budget, answer: deliveryAnswerOf(delivery)});
              return {delivery};
            },
          }));
          const surface = createReadSurface({router, cache, localRead: calls.readLocal});
          const {first, answer} = await observeRead(surface, scenario.mode, scenario.sql, calls);
          const strict = scenario.mode === MODE.OWNER_RPC_REQUIRED;
          t.equal(first, strict ? 'result' : 'local probe',
            'only a permitted local mode enters the held local query');
          t.equal(calls.localCount, strict ? 0 : 1, 'count local probes');
          t.equal(answer.success, scenario.success === true);
          const rows = scenario.localResult ? [LOCAL_ROW] : [OWNER_ROW];
          t.same(answer.rows, scenario.success ? rows : []);
          t.equal(answer.source, scenario.localResult ? 'local_partition_replica' : 'owner_rpc_lane');
          t.equal(answer.localReadHit, scenario.localResult === true);
          t.equal(answer.systemTableDiagnostics?.localReadHit, scenario.localResult === true);
          t.equal(answer.systemTableDiagnostics?.routedToNode,
            scenario.localResult ? null : OWNER);
          t.equal(answer.systemTableDiagnostics?.queryTimeoutMs, TIMEOUT_MS);
          if (scenario.localResult) {
            t.equal(calls.owner.length, 0);
          } else {
            t.ok(calls.owner.length > 0, 'owner routing reaches the real query transport');
            t.ok(calls.owner.every(({address, budget}) => address === ADDRESS &&
              budget.timeoutMs > 0 && budget.timeoutMs <= TIMEOUT_MS &&
              budget.deliveryPriority === 'critical'));
            if (scenario.unavailable) {
              t.ok(calls.owner.every(({answer}) => !answer?.success));
            } else {
              t.equal(calls.owner[0]?.answer?.success, scenario.success === true);
              if (scenario.success) t.equal(calls.owner.length, 1, 'one owner delivery');
            }
          }
        });
      }
    } finally {
      await partition.shutdown();
      await Promise.all([callerRouter.shutdown(), ownerRouter.shutdown()]);
      LoggingService.resetInstance();
      ConfigurationManager.resetInstance();
    }
  });

// S0 witness 1 (fallback-read closure). Owner path: gateway.readAuthoritativeRows
// -> executeAuthoritativeSystemTableRead (leader REQUIRED). The node that hosts
// the ledger leader must get its owner fact from that in-process replica: the
// read may not wait for leader publication or for query routing, which are
// what recovery restores.
// Real: gateway, CDC flow, QueryExecutor, MessageRouter, a single-voter
// raft-rs PartitionService (the witness producer). Substituted: query channel
// transit only (recorded). Ceiling: one process, one voter; the rows are
// seeded straight into the replica's database.
function seedLeaderHostCache(leaderNodeId) {
  const cache = new SystemTableCache();
  cache.applySystemTableChange(SYSTEM_TABLE_NAME.PARTITIONS, 'INSERT', {
    partition_id: PARTITION, table_id: TABLE,
    ...(leaderNodeId === null ? {} : {leader_node_id: leaderNodeId}),
  });
  cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
    service_id: REPLICA, replica_id: REPLICA, node_id: OWNER,
    partition_id: PARTITION, service_type: 'partition',
    status: 'active', address: ADDRESS,
  });
  return cache;
}

function createLeaderHostGateway({router, cache, partition, withQueryEngine}) {
  const sqlQueryEngine = withQueryEngine ? {queryExecutor: new QueryExecutor({
    nodeId: router.nodeId,
    messageRouter: router,
    systemCache: cache,
    controlPlaneReadinessService: createCommittedServeEligibilityOwner(),
  })} : null;
  const cdc = new CDCIntegrationService({
    nodeId: router.nodeId,
    messageRouter: router,
    systemTableCache: cache,
    partitionServicesProvider: () => new Map([[partition.replicaId, partition]]),
    ...(sqlQueryEngine ? {sqlQueryEngine} : {}),
  });
  cdc.initialize();
  return new ControlPlaneSystemTableGateway({
    nodeId: router.nodeId,
    cdcIntegrationService: cdc,
    systemTableCache: cache,
    ...(sqlQueryEngine ? {sqlQueryEngine} : {}),
  });
}

test('gateway.readAuthoritativeRows leader-REQUIRED: the in-process ledger leader answers ' +
  'without a published leader or a query engine',
async (t) => {
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
  const router = new MessageRouter({
    nodeId: OWNER, wsPort: OWNER_PORT, inProcess: true,
    bootIncarnation: TEST_BOOT_INCARNATION,
  });
  const partition = new PartitionService(withFoundingStamp({
    partitionId: PARTITION, replicaId: REPLICA, nodeId: OWNER,
    tableName: TABLE, tableId: TABLE, dbPath: ':memory:',
    transport: router,
    systemTableCache: seedLeaderHostCache(OWNER),
    schema: {columns: [
      {name: 'operation_id', type: 'TEXT', primaryKey: true},
      {name: 'workflow_step', type: 'TEXT'},
    ]},
  }));
  try {
    await router.initialize({startServer: true});
    await partition.initialize();
    partition.raft.campaign();
    const leadsAndApplied = () => {
      const status = partition.raft.readStatus();
      return status.role === 'leader' && partition.role === 'leader' &&
        status.commitIndex === status.appliedIndex;
    };
    for (let poll = 0; poll < SETUP_POLLS && !leadsAndApplied(); poll += 1) {
      await managedSleep(t, SETUP_POLL_MS);
    }
    t.equal(leadsAndApplied(), true,
      'setup: the hosted native replica leads and has applied what it committed');
    partition.db.prepare('INSERT INTO replica_operations ' +
      '(operation_id, workflow_step) VALUES (?, ?)')
      .run(OWNER_ROW.operation_id, OWNER_ROW.workflow_step);
    const transit = [];
    router.setQueryMessageGroupServiceResolver(() => ({
      async sendMessage(address, message, options) {
        const delivery = await router.deliverLocal(address, 'leader-host-read-delivery',
          message, null, options.transportDeliveryOptions).then(({result, answer}) =>
          buildDeliveryEnvelope(result, answer));
        transit.push({address, success: deliveryAnswerOf(delivery)?.success === true});
        return {delivery};
      },
    }));
    const cases = [
      {label: 'the routing snapshot names no canonical leader',
        leaderNodeId: null, withQueryEngine: true},
      {label: 'no query engine exists yet (seed before cache hydration)',
        leaderNodeId: OWNER, withQueryEngine: false},
    ];
    for (const scenario of cases) {
      await t.test(scenario.label, async (t) => {
        transit.length = 0;
        const gateway = createLeaderHostGateway({
          router, partition, cache: seedLeaderHostCache(scenario.leaderNodeId),
          withQueryEngine: scenario.withQueryEngine,
        });
        const answer = await gateway.readAuthoritativeRows(TABLE, SQL, [OPERATION], {
          timeoutMs: TIMEOUT_MS,
          authoritativeReadMode: MODE.OWNER_RPC_REQUIRED,
          leaderMode: LEADER.REQUIRED,
          localReadConsistency: 'local_leader',
          deliveryPriority: 'critical',
          workClass: 'critical',
        });
        const witness = answer.readAuthorityWitness;
        t.comment(JSON.stringify({observed: {success: answer.success, error: answer.error,
          source: answer.source, rows: answer.rows, witness, transit}}));
        t.equal(answer.success, true,
          'the node hosting the leader gets its owner fact (today: unavailable)');
        t.same(answer.rows, [OWNER_ROW], 'the leader replica\'s rows');
        t.equal(answer.rowSetComplete, true, 'the serving replica declares the row set complete');
        t.equal(witness?.role, 'leader', 'the answer carries the serving replica\'s leader witness');
        t.equal(witness?.partitionId, PARTITION);
        t.equal(witness?.servingNodeId, OWNER);
        t.equal(witness?.servingReplicaId, REPLICA);
        t.ok(Number.isSafeInteger(witness?.term) && witness.term >= 1, 'witness term');
        t.ok(Number.isSafeInteger(witness?.appliedIndex) &&
          witness.appliedIndex === witness?.commitIndex,
        'the witness names an applied index equal to its commit index');
        t.equal(transit.length, 0, 'the in-process leader is read without query transit');
      });
    }
  } finally {
    await partition.shutdown();
    await router.shutdown();
    LoggingService.resetInstance();
    ConfigurationManager.resetInstance();
  }
});
