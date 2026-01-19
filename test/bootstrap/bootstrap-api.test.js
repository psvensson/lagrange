/**
 * Tests for Bootstrap API.
 * Requirements: 1.2, 7.2, 7.3, 7.4
 */

import {test} from 'tap';
import {BootstrapAPI, BootstrapStrategy} from '../../src/bootstrap/bootstrap-api.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

// Initialize configuration and logging for tests
function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: 'test-seed-node', restApiPort: 9999},
      logging: {level: 'error'},
    });
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

test('BootstrapAPI - initialization', async (t) => {
  initializeTestEnvironment();

  const api = new BootstrapAPI({
    seedNodeId: 'seed-node-1',
    seedNodeAddress: 'ws://localhost:8080',
  });

  t.equal(api.isInitialized(), false, 'should not be initialized before init');

  // Initialize on random port
  await api.initialize(0);

  t.equal(api.isInitialized(), true, 'should be initialized after init');
  t.ok(api.getFastify(), 'should have fastify instance');

  await api.shutdown();
  t.equal(api.isInitialized(), false, 'should not be initialized after shutdown');
});

test('BootstrapAPI - health endpoint', async (t) => {
  initializeTestEnvironment();

  const api = new BootstrapAPI({
    seedNodeId: 'seed-node-1',
    seedNodeAddress: 'ws://localhost:8080',
  });

  await api.initialize(0);

  const response = await api.getFastify().inject({
    method: 'GET',
    url: '/health',
  });

  t.equal(response.statusCode, 200, 'should return 200');
  const body = JSON.parse(response.body);
  t.equal(body.status, 'healthy', 'should return healthy status');
  t.equal(body.nodeId, 'seed-node-1', 'should return seed node ID');

  await api.shutdown();
});

test('BootstrapAPI - bootstrap validation', async (t) => {
  initializeTestEnvironment();

  const api = new BootstrapAPI({
    seedNodeId: 'seed-node-1',
    seedNodeAddress: 'ws://localhost:8080',
  });

  await api.initialize(0);

  // Test missing nodeId
  let response = await api.getFastify().inject({
    method: 'POST',
    url: '/bootstrap',
    payload: {nodeAddress: 'ws://localhost:9090'},
  });

  t.equal(response.statusCode, 400, 'should return 400 for missing nodeId');
  let body = JSON.parse(response.body);
  t.ok(body.error.includes('nodeId'), 'error should mention nodeId');

  // Test invalid nodeId
  response = await api.getFastify().inject({
    method: 'POST',
    url: '/bootstrap',
    payload: {nodeId: 'invalid-uuid', nodeAddress: 'ws://localhost:9090'},
  });

  t.equal(response.statusCode, 400, 'should return 400 for invalid nodeId');
  body = JSON.parse(response.body);
  t.ok(body.error.includes('UUID'), 'error should mention UUID');

  // Test missing nodeAddress
  response = await api.getFastify().inject({
    method: 'POST',
    url: '/bootstrap',
    payload: {nodeId: '550e8400-e29b-41d4-a716-446655440000'},
  });

  t.equal(response.statusCode, 400, 'should return 400 for missing nodeAddress');
  body = JSON.parse(response.body);
  t.ok(body.error.includes('nodeAddress'), 'error should mention nodeAddress');

  await api.shutdown();
});

test('BootstrapAPI - bootstrap conflict detection', async (t) => {
  initializeTestEnvironment();

  const api = new BootstrapAPI({
    seedNodeId: 'seed-node-1',
    seedNodeAddress: 'ws://localhost:8080',
  });

  await api.initialize(0);

  // First bootstrap should succeed
  const nodeId = '550e8400-e29b-41d4-a716-446655440000';
  let response = await api.getFastify().inject({
    method: 'POST',
    url: '/bootstrap',
    payload: {nodeId, nodeAddress: 'ws://localhost:9090'},
  });

  t.equal(response.statusCode, 200, 'first bootstrap should succeed');

  // Second bootstrap with same nodeId should fail
  response = await api.getFastify().inject({
    method: 'POST',
    url: '/bootstrap',
    payload: {nodeId, nodeAddress: 'ws://localhost:9091'},
  });

  t.equal(response.statusCode, 409, 'duplicate nodeId should return 409');
  const body = JSON.parse(response.body);
  t.ok(body.error.includes('already registered'), 'error should mention already registered');

  // Bootstrap with seed node ID should fail
  response = await api.getFastify().inject({
    method: 'POST',
    url: '/bootstrap',
    payload: {
      nodeId: 'seed-node-1',
      nodeAddress: 'ws://localhost:9092',
    },
  });

  // seed-node-1 is not a valid UUID, so it should fail validation first
  t.equal(response.statusCode, 400, 'seed node ID should fail validation');

  await api.shutdown();
});

test('BootstrapAPI - successful bootstrap with CREATE_SELF_HOSTED', async (t) => {
  initializeTestEnvironment();

  const api = new BootstrapAPI({
    seedNodeId: 'seed-node-1',
    seedNodeAddress: 'ws://localhost:8080',
    messageGroupServices: new Map(),
  });

  await api.initialize(0);

  const nodeId = '550e8400-e29b-41d4-a716-446655440001';
  const response = await api.getFastify().inject({
    method: 'POST',
    url: '/bootstrap',
    payload: {nodeId, nodeAddress: 'ws://localhost:9090'},
  });

  t.equal(response.statusCode, 200, 'bootstrap should succeed');

  const body = JSON.parse(response.body);
  t.equal(body.success, true, 'should return success');
  t.equal(body.seedNodeId, 'seed-node-1', 'should return seed node ID');
  t.ok(body.messageGroupAssignment, 'should have message group assignment');
  t.equal(
    body.messageGroupAssignment.strategy,
    BootstrapStrategy.CREATE_SELF_HOSTED,
    'should use CREATE_SELF_HOSTED strategy when no movable replicas',
  );
  t.equal(body.messageGroupAssignment.replicaCount, 3, 'should have 3 replicas');
  t.ok(body.clusterConfig, 'should have cluster config');
  t.ok(body.timestamp, 'should have timestamp');

  await api.shutdown();
});

test('BootstrapAPI - bootstrap with MOVE_REPLICA strategy', async (t) => {
  initializeTestEnvironment();

  // Create mock message group services with 2+ replicas on same node
  const messageGroupServices = new Map();
  const mockService = {
    groupId: 'mg-1',
    nodeId: 'seed-node-1',
    replicaId: 'mg-1-r1',
  };
  messageGroupServices.set('mg-1-r1', mockService);
  messageGroupServices.set('mg-1-r2', {...mockService, replicaId: 'mg-1-r2'});
  messageGroupServices.set('mg-1-r3', {...mockService, replicaId: 'mg-1-r3'});

  const api = new BootstrapAPI({
    seedNodeId: 'seed-node-1',
    seedNodeAddress: 'ws://localhost:8080',
    messageGroupServices,
  });

  await api.initialize(0);

  const nodeId = '550e8400-e29b-41d4-a716-446655440002';
  const response = await api.getFastify().inject({
    method: 'POST',
    url: '/bootstrap',
    payload: {nodeId, nodeAddress: 'ws://localhost:9090'},
  });

  t.equal(response.statusCode, 200, 'bootstrap should succeed');

  const body = JSON.parse(response.body);
  t.equal(body.success, true, 'should return success');
  t.ok(body.messageGroupAssignment, 'should have message group assignment');
  t.equal(
    body.messageGroupAssignment.strategy,
    BootstrapStrategy.MOVE_REPLICA,
    'should use MOVE_REPLICA strategy when movable replicas exist',
  );
  t.equal(body.messageGroupAssignment.groupId, 'mg-1', 'should target existing group');
  t.equal(
    body.messageGroupAssignment.sourceNodeId,
    'seed-node-1',
    'should identify source node',
  );
  t.ok(body.messageGroupAssignment.replicaToMove, 'should identify replica to move');
  t.ok(body.messageGroupAssignment.replicaAddresses, 'should have replica addresses');

  await api.shutdown();
});

test('BootstrapAPI - cluster state endpoint', async (t) => {
  initializeTestEnvironment();

  const api = new BootstrapAPI({
    seedNodeId: 'seed-node-1',
    seedNodeAddress: 'ws://localhost:8080',
  });

  await api.initialize(0);

  // Bootstrap a node first
  const nodeId = '550e8400-e29b-41d4-a716-446655440003';
  await api.getFastify().inject({
    method: 'POST',
    url: '/bootstrap',
    payload: {nodeId, nodeAddress: 'ws://localhost:9090'},
  });

  // Get cluster state
  const response = await api.getFastify().inject({
    method: 'GET',
    url: '/cluster/state',
  });

  t.equal(response.statusCode, 200, 'should return 200');

  const body = JSON.parse(response.body);
  t.equal(body.seedNodeId, 'seed-node-1', 'should return seed node ID');
  t.equal(body.nodeCount, 2, 'should have 2 nodes (seed + new)');
  t.ok(Array.isArray(body.nodes), 'should have nodes array');
  t.ok(body.nodes.find((n) => n.isSeed), 'should have seed node');
  t.ok(body.nodes.find((n) => n.nodeId === nodeId), 'should have new node');

  await api.shutdown();
});
