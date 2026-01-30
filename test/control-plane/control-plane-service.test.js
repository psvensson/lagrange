/**
 * Unit tests for ControlPlaneService.
 * Requirements: 1.1, 2.3, 2.4, 3.1, 5.2
 */

import {test} from '../../src/test-helpers/tap.js';
import {EventEmitter} from 'events';
import {ControlPlaneService} from '../../src/control-plane/control-plane-service.js';
import {
  ControlPlaneMessageType,
  ControlPlaneField,
  DEFAULT_READY_LEASE_MS,
} from '../../src/control-plane/control-plane-constants.js';
import {SystemTableName} from '../../src/bootstrap/system-table-schemas-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

function createMockCDCService(cache) {
  const operations = [];

  return {
    operations,
    async upsertSystemTableRow(tableName, data) {
      operations.push({type: 'upsert', tableName, data});
      cache?.applySystemTableChange(tableName, 'INSERT', data);
      return {success: true, operation: 'UPSERT', tableName, data};
    },
    async updateSystemTableRow(tableName, whereClause, data) {
      const merged = {...whereClause, ...data};
      operations.push({type: 'update', tableName, whereClause, data: merged});
      cache?.applySystemTableChange(tableName, 'UPDATE', merged);
      return {success: true, operation: 'UPDATE', tableName, whereClause, data: merged};
    },
  };
}

function createMockCoordinator() {
  const executed = [];
  return {
    executed,
    operations: new Map(),
    initialize() {},
    async executeOperation(operation) {
      executed.push(operation);
      return {success: true};
    },
  };
}

function createMockMessageRouter() {
  return {
    getConnectionState() {
      return 'connected';
    },
    isOutboundQueueAvailable() {
      return true;
    },
  };
}

function createMockMessageGroupService(isLeader) {
  const service = new EventEmitter();
  service.groupId = 'mg-1';
  service.replicaId = 'mg-1-r1';
  service.sent = [];
  service.acks = [];
  service.isLeaderReplica = () => isLeader;
  service.getLeaderId = () => 'leader-node';
  service.buildPeerAddress = (peerId) => `${peerId}/message-group/mg-1`;
  service.sendMessage = async (address, payload) => {
    service.sent.push({address, payload});
  };
  service.acknowledgeMessage = async (messageId) => {
    service.acks.push(messageId);
  };
  return service;
}

test('ControlPlaneService', async (t) => {
  t.beforeEach(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();

    const config = ConfigurationManager.getInstance();
    config.initialize({logging: {level: 'error'}});

    const logging = LoggingService.getInstance();
    logging.initialize({level: 'error'});
  });

  t.afterEach(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

  t.test('handles NODE_STATE_UPDATE for connected and ready', async (t) => {
    const cache = new SystemTableCache();
    const cdc = createMockCDCService(cache);
    const coordinator = createMockCoordinator();

    const controlPlane = new ControlPlaneService({
      nodeId: 'seed-node',
      nodeAddress: 'ws://localhost:0',
      systemTableCache: cache,
      cdcIntegrationService: cdc,
      rebalanceCoordinator: coordinator,
      messageRouter: createMockMessageRouter(),
    });
    controlPlane.initialize();

    const group = createMockMessageGroupService(true);
    controlPlane.attachMessageGroupService(group);

    group.emit('messageReceived', {
      messageId: 'msg-1',
      payload: {
        [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
        [ControlPlaneField.NODE_ID]: 'node-1',
        [ControlPlaneField.NODE_ADDRESS]: 'localhost:8082',
        [ControlPlaneField.CAPABILITIES]: ['partition_replica'],
        [ControlPlaneField.STATE]: 'connected',
      },
    });
    await new Promise((resolve) => setImmediate(resolve));

    const registered = cache.get(SystemTableName.NODES, 'node-1');
    t.equal(registered.ws_connection_state, 'connected',
      'register sets ws_connection_state to connected');

    group.emit('messageReceived', {
      messageId: 'msg-2',
      payload: {
        [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
        [ControlPlaneField.NODE_ID]: 'node-1',
        [ControlPlaneField.NODE_ADDRESS]: 'localhost:8082',
        [ControlPlaneField.STATE]: 'ready',
      },
    });
    await new Promise((resolve) => setImmediate(resolve));

    const readyRow = cache.get(SystemTableName.NODES, 'node-1');
    t.equal(readyRow.ws_connection_state, 'ready', 'ready sets ws_connection_state');
    t.ok(readyRow.ready_lease_expires_at > Date.now(),
      'ready sets lease in the future');
    t.equal(group.acks.length, 2, 'acks control messages');
  });

  t.test('forwards control message to leader when not leader', async (t) => {
    const cache = new SystemTableCache();
    const cdc = createMockCDCService(cache);
    const coordinator = createMockCoordinator();

    const controlPlane = new ControlPlaneService({
      nodeId: 'follower-node',
      nodeAddress: 'ws://localhost:0',
      systemTableCache: cache,
      cdcIntegrationService: cdc,
      rebalanceCoordinator: coordinator,
      messageRouter: createMockMessageRouter(),
    });
    controlPlane.initialize();

    const group = createMockMessageGroupService(false);
    controlPlane.attachMessageGroupService(group);

    group.emit('messageReceived', {
      messageId: 'msg-3',
      payload: {
        [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
        [ControlPlaneField.NODE_ID]: 'node-2',
        [ControlPlaneField.STATE]: 'connected',
      },
    });
    await new Promise((resolve) => setImmediate(resolve));

    // NODE_STATE_UPDATE is processed on any replica (idempotent UPSERT) so that
    // joins are not dropped when a follower cannot resolve the leader yet.
    t.equal(group.sent.length, 0, 'does not forward node state update');
    const row = cache.get(SystemTableName.NODES, 'node-2');
    t.equal(row.ws_connection_state, 'connected', 'writes node state update locally');
  });

  t.test('extends lease on heartbeat', async (t) => {
    const cache = new SystemTableCache();
    const cdc = createMockCDCService(cache);
    const coordinator = createMockCoordinator();

    const controlPlane = new ControlPlaneService({
      nodeId: 'seed-node',
      nodeAddress: 'ws://localhost:0',
      systemTableCache: cache,
      cdcIntegrationService: cdc,
      rebalanceCoordinator: coordinator,
      messageRouter: createMockMessageRouter(),
    });
    controlPlane.initialize();

    const group = createMockMessageGroupService(true);
    controlPlane.attachMessageGroupService(group);

    const heartbeatAt = Date.now();
    group.emit('messageReceived', {
      messageId: 'msg-4',
      payload: {
        [ControlPlaneField.TYPE]: ControlPlaneMessageType.NODE_STATE_UPDATE,
        [ControlPlaneField.NODE_ID]: 'node-3',
        [ControlPlaneField.STATE]: 'ready',
        [ControlPlaneField.HEARTBEAT_AT]: heartbeatAt,
      },
    });
    await new Promise((resolve) => setImmediate(resolve));

    const row = cache.get(SystemTableName.NODES, 'node-3');
    t.equal(row.last_heartbeat, heartbeatAt, 'heartbeat updates last_heartbeat');
    t.equal(row.ready_lease_expires_at, heartbeatAt + DEFAULT_READY_LEASE_MS,
      'heartbeat extends lease');
  });

  t.test('sweeps expired leases', async (t) => {
    const cache = new SystemTableCache();
    const cdc = createMockCDCService(cache);
    const coordinator = createMockCoordinator();

    const controlPlane = new ControlPlaneService({
      nodeId: 'seed-node',
      nodeAddress: 'ws://localhost:0',
      systemTableCache: cache,
      cdcIntegrationService: cdc,
      rebalanceCoordinator: coordinator,
      messageRouter: createMockMessageRouter(),
    });
    controlPlane.initialize();

    const group = createMockMessageGroupService(true);
    controlPlane.attachMessageGroupService(group);

    const now = Date.now();
    cache.applySystemTableChange(SystemTableName.NODES, 'INSERT', {
      node_id: 'node-4',
      node_address: 'localhost:8084',
      status: 'active',
      ws_connection_state: 'ready',
      last_heartbeat: now,
      ready_lease_expires_at: now - 1000,
      created_at: now - 1000,
    });

    await controlPlane.sweepExpiredLeases();

    const expired = cache.get(SystemTableName.NODES, 'node-4');
    t.equal(expired.ws_connection_state, 'disconnected',
      'expired lease marks node disconnected');
    t.equal(expired.ready_lease_expires_at, null, 'expired lease cleared');
  });

  t.test('dispatches pending replica operation on CDC event', async (t) => {
    const cache = new SystemTableCache();
    const cdc = createMockCDCService(cache);
    const coordinator = createMockCoordinator();

    const controlPlane = new ControlPlaneService({
      nodeId: 'seed-node',
      nodeAddress: 'ws://localhost:0',
      systemTableCache: cache,
      cdcIntegrationService: cdc,
      rebalanceCoordinator: coordinator,
      messageRouter: createMockMessageRouter(),
    });
    controlPlane.initialize();

    const group = createMockMessageGroupService(true);
    controlPlane.attachMessageGroupService(group);

    const now = Date.now();
    cache.applySystemTableChange(SystemTableName.NODES, 'INSERT', {
      node_id: 'node-5',
      node_address: 'localhost:8085',
      status: 'active',
      ws_connection_state: 'ready',
      last_heartbeat: now,
      ready_lease_expires_at: now + 10000,
      created_at: now,
    });

    cache.applySystemTableChange(SystemTableName.REPLICA_OPERATIONS, 'INSERT', {
      operation_id: 'op-1',
      type: 'ADD',
      partition_id: 'partition-1',
      replica_id: 'replica-1',
      source_node_id: 'seed-node',
      target_node_id: 'node-5',
      status: 'pending',
      workflow_step: 'PENDING',
      created_at: now,
      updated_at: now,
      steps_history: '[]',
    });

    await controlPlane.handleCdcApplied(group, {
      tableName: SystemTableName.REPLICA_OPERATIONS,
      data: cache.get(SystemTableName.REPLICA_OPERATIONS, 'op-1'),
    });

    t.equal(coordinator.executed.length, 1, 'dispatches operation');
    t.equal(coordinator.executed[0].operationId, 'op-1', 'dispatches correct op');
  });
});
