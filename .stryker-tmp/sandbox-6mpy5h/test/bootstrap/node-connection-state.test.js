/**
 * Tests for BootstrapService node connection state updates.
 * Requirements: 1.2, 2.3, 2.4, 3.3
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();

  const config = ConfigurationManager.getInstance();
  config.initialize({
    node: {id: 'test-seed-node'},
    logging: {level: 'error'},
  });

  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});
}

function createMockPartition() {
  return {
    updateCalls: [],
    upsertCalls: [],
    updateData: async function(tableName, where, data) {
      this.updateCalls.push({tableName, where, data});
    },
    upsertData: async function(tableName, data) {
      this.upsertCalls.push({tableName, data});
    },
  };
}

function createSystemCache(existingNode) {
  return {
    get: (tableName, key) => {
      if (tableName !== 'nodes') {
        return null;
      }
      if (!existingNode) {
        return null;
      }
      return existingNode.node_id === key ? existingNode : null;
    },
  };
}

test('BootstrapService - node connection state updates', async (t) => {
  await t.test('upserts new node with connected state', async (t) => {
    initializeTestEnvironment();

    const bootstrap = new BootstrapService({
      nodeId: 'seed-node',
      nodeAddress: 'ws://seed-node:9999',
    });

    const nodesPartition = createMockPartition();
    bootstrap.getLeaderPartition = () => nodesPartition;
    bootstrap.messageGroupServices = new Map([['mg-1', {
      systemTableCache: createSystemCache(null),
    }]]);

    await bootstrap.upsertNodeConnectionState({
      nodeId: 'node-1',
      nodeAddress: 'ws://node-1:9001',
      connectionState: 'connected',
    });

    t.equal(nodesPartition.upsertCalls.length, 1);
    const call = nodesPartition.upsertCalls[0];
    t.equal(call.tableName, 'nodes');
    t.equal(call.data.node_id, 'node-1');
    t.equal(call.data.node_address, 'ws://node-1:9001');
    t.equal(call.data.connection_state, 'connected');
    t.equal(call.data.capabilities, '[]');
  });

  await t.test('updates existing node to ready with capabilities', async (t) => {
    initializeTestEnvironment();

    const bootstrap = new BootstrapService({
      nodeId: 'seed-node',
      nodeAddress: 'ws://seed-node:9999',
    });

    const existingNode = {
      node_id: 'node-2',
      node_address: 'ws://old-node:9002',
      last_heartbeat: 123,
    };
    const nodesPartition = createMockPartition();
    bootstrap.getLeaderPartition = () => nodesPartition;
    bootstrap.messageGroupServices = new Map([['mg-1', {
      systemTableCache: createSystemCache(existingNode),
    }]]);

    await bootstrap.upsertNodeConnectionState({
      nodeId: 'node-2',
      nodeAddress: 'ws://node-2:9002',
      connectionState: 'ready',
      capabilities: ['partition_replica'],
    });

    t.equal(nodesPartition.updateCalls.length, 1);
    const call = nodesPartition.updateCalls[0];
    t.equal(call.tableName, 'nodes');
    t.equal(call.where.node_id, 'node-2');
    t.equal(call.data.connection_state, 'ready');
    t.equal(call.data.node_address, 'ws://node-2:9002');
    t.equal(call.data.capabilities, '["partition_replica"]');
    t.equal(call.data.last_heartbeat, 123);
  });

  await t.test('NODE_READY handler updates node state', async (t) => {
    initializeTestEnvironment();

    const bootstrap = new BootstrapService({
      nodeId: 'seed-node',
      nodeAddress: 'ws://seed-node:9999',
    });

    let registeredAddress = null;
    let registeredHandler = null;
    bootstrap.messageRouter = {
      register: (address, handler) => {
        registeredAddress = address;
        registeredHandler = handler;
      },
    };

    let capturedOptions = null;
    bootstrap.upsertNodeConnectionState = async (options) => {
      capturedOptions = options;
    };

    bootstrap.registerBootstrapReadyHandler();

    t.equal(registeredAddress, 'seed-node/bootstrap/ready');
    t.ok(registeredHandler, 'should register NODE_READY handler');

    const response = await registeredHandler({
      payload: {
        type: 'NODE_READY',
        nodeId: 'node-3',
        nodeAddress: 'ws://node-3:9003',
        capabilities: ['partition_replica'],
      },
    });

    t.equal(response.acknowledged, true);
    t.equal(capturedOptions.nodeId, 'node-3');
    t.equal(capturedOptions.nodeAddress, 'ws://node-3:9003');
    t.equal(capturedOptions.connectionState, 'ready');
    t.same(capturedOptions.capabilities, ['partition_replica']);
  });
});
