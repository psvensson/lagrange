/**
 * ACK delivery integration tests using real WebSockets.
 * Requirements: 3.2, 3.3, 6.1, 6.2, 6.3, 6.4
 */

import {test} from '../../src/test-helpers/tap.js';
import {EventEmitter} from 'events';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {AddressManager} from '../../src/address/address-manager.js';
import {ServiceThreadManager} from '../../src/threading/service-thread-manager.js';
import {MessageGroupService} from '../../src/message-group/message-group-service.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {SystemTableName} from '../../src/bootstrap/system-table-schemas-constants.js';
import {ReplicaLifecycleManager} from '../../src/node/replica-lifecycle-manager.js';
import {MessageRouter} from '../../src/transport/message-router.js';

let portCounter = 33000;

function initEnv() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  NodeService.resetInstance();
  AddressManager.resetInstance();
  ServiceThreadManager.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: 'test-node'},
    logging: {level: 'error'},
    transport: {wsHost: '127.0.0.1'},
    raft: {electionTimeoutMinMs: 100, electionTimeoutMaxMs: 200, heartbeatIntervalMs: 50},
    rebalancer: {periodicCheckIntervalMs: 60000, periodicCheckJitterMs: 100},
  });
  LoggingService.getInstance().initialize({level: 'error'});
}

async function cleanEnv() {
  await NodeService.getInstance().shutdown().catch(() => {});
  await ServiceThreadManager.getInstance().shutdown().catch(() => {});
  NodeService.resetInstance();
  ServiceThreadManager.resetInstance();
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  AddressManager.resetInstance();
}

function schema(name) {
  return {tableName: name, columns: [{name: 'id', type: 'TEXT', primaryKey: true}]};
}

function createMockCDCService(cache) {
  return {
    async insertSystemTableRow(tableName, data) {
      cache.applySystemTableChange(tableName, 'INSERT', data);
      return {success: true, operation: 'INSERT', tableName, data};
    },
    async updateSystemTableRow(tableName, whereClause, data) {
      const merged = {...whereClause, ...data};
      cache.applySystemTableChange(tableName, 'UPDATE', merged);
      return {success: true, operation: 'UPDATE', tableName, whereClause, data: merged};
    },
    async upsertSystemTableRow(tableName, data) {
      cache.applySystemTableChange(tableName, 'INSERT', data);
      return {success: true, operation: 'UPSERT', tableName, data};
    },
  };
}

async function wait(cond, ms = 1500) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (await cond()) return true;
    await new Promise((r) => setTimeout(r, 20));
  }
  return false;
}

test('ACK delivery via real WebSocket', {timeout: 5000}, async (t) => {
  initEnv();
  const res = {};
  try {
    const nodeId = 'ack-node';
    const port = portCounter++;
    res.router = new MessageRouter({nodeId, wsPort: port});
    await res.router.initialize({startServer: true});

    res.mg = new MessageGroupService({
      groupId: 'mg-ack',
      replicaId: 'mg-ack-r1',
      nodeId,
      replicaIds: ['mg-ack-r1'],
      peerAddresses: [`${nodeId}/message-group/mg-ack-r1`],
      transport: res.router,
    });
    res.router.register(`${nodeId}/message-group/mg-ack-r1`, (e) => res.mg.receiveMessage(e));
    await res.mg.initialize();
    await wait(() => res.mg.isLeaderReplica());

    res.part = new PartitionService({
      partitionId: 'p1',
      tableId: 't1',
      tableName: 't1',
      schema: schema('t1'),
      keyRange: {start: null, end: null},
      replicaId: 'p1-r1',
      replicaIds: ['p1-r1'],
      nodeId,
      transport: res.router,
      dbPath: ':memory:',
      messageGroupService: res.mg,
      messageRouter: res.router,
      systemTableCache: new SystemTableCache(),
    });
    await res.part.initialize();
    await wait(() => res.part.isLeader);

    const systemTableCache = new SystemTableCache();
    const cdcIntegrationService = createMockCDCService(systemTableCache);
    const now = Date.now();
    systemTableCache.applySystemTableChange(SystemTableName.TABLES, 'INSERT', {
      table_id: 't1',
      table_name: 't1',
      schema_definition: JSON.stringify(schema('t1')),
    });
    systemTableCache.applySystemTableChange(SystemTableName.PARTITIONS, 'INSERT', {
      partition_id: 'p1',
      table_id: 't1',
      partition_key_start: null,
      partition_key_end: null,
      leader_node_id: nodeId,
    });
    systemTableCache.applySystemTableChange(SystemTableName.SERVICES, 'INSERT', {
      service_id: 'p1-r1',
      service_type: 'partition',
      partition_id: 'p1',
      node_id: nodeId,
      raft_role: 'leader',
      status: 'active',
      address: `${nodeId}/partition/p1-r1`,
      created_at: now,
      updated_at: now,
    });

    const created = [];
    res.lc = new ReplicaLifecycleManager({
      nodeId,
      systemTableCache,
      cdcIntegrationService,
      createPartitionService: async (o) => {
        created.push(o.replicaId);
        const m = new EventEmitter();
        m.initialize = async () => {};
        m.shutdown = async () => {};
        return m;
      },
      dataDir: './test-data',
    });
    res.lc.initialize();

    res.router.register(`${nodeId}/lifecycle/manager`, async (env) => {
      let msg = env;
      while (msg.payload) msg = msg.payload;
      if (msg.type === 'CREATE_REPLICA') {
        const ack = await res.lc.handleCreateReplica(msg);
        return {acknowledged: true, ...ack};
      }
      return {acknowledged: true};
    });

    const ack = await res.part.deliverWithAck(
      res.router,
      `${nodeId}/lifecycle/manager`,
      {
        type: 'CREATE_REPLICA',
        request_id: 'req-1',
        partition_id: 'p1',
        table_name: 't1',
        replica_id: 'new-r',
        leader_address: nodeId,
        key_range: {start: null, end: null},
        schema: schema('t1'),
        timestamp: Date.now(),
      },
      2000,
    );

    t.ok(ack, 'received ACK');
    t.equal(ack.request_id, 'req-1', 'correct request_id');
    t.equal(ack.status, 'initiated', 'status initiated');
    await wait(() => created.length === 1, 2000);
    t.equal(created.length, 1, 'replica created');
  } finally {
    if (res.lc) res.lc.shutdown();
    if (res.part) {
      res.part.rebalancer?.cancelScheduledCheck();
      await res.part.shutdown().catch(() => {});
    }
    if (res.mg) await res.mg.shutdown().catch(() => {});
    if (res.router) await res.router.shutdown().catch(() => {});
    await cleanEnv();
  }
});
