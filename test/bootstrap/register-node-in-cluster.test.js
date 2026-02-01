/**
 * Unit tests for NodeJoiningService.registerNodeInCluster() method.
 * Tests task 5.1: Add registerNodeInCluster() method to NodeJoiningService.
 * Tests task 13.1: Update node registration to write endpoint.
 */

import {test} from '../../src/test-helpers/tap.js';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {STATE, TABLES, TRANSPORT_TYPE, ENDPOINT_STATUS} from '../../src/constants/index.js';

test('registerNodeInCluster() - should execute INSERT query with correct parameters', async (t) => {
  // Create a mock SQL query engine
  const executedQueries = [];
  const mockQueryEngine = {
    executeQuery: async (sql, params) => {
      executedQueries.push({sql, params});
      return {success: true};
    },
  };

  // Create a mock CDC integration service
  const mockCDCService = {
    sqlQueryEngine: mockQueryEngine,
  };

  // Create NodeJoiningService instance
  const service = new NodeJoiningService({
    nodeId: 'test-node-123',
    nodeAddress: 'ws://localhost:9000',
    seedNodeAddress: 'ws://seed:8000',
  });

  // Set the mock CDC service
  service.cdcIntegrationService = mockCDCService;

  // Call registerNodeInCluster
  await service.registerNodeInCluster();

  // Verify two queries were executed (nodes + node_endpoints)
  t.equal(executedQueries.length, 2, 'should execute two queries');

  // Verify nodes table query
  const nodesQuery = executedQueries[0];
  t.ok(nodesQuery.sql.includes('INSERT INTO nodes'), 'should be INSERT INTO nodes');
  t.ok(nodesQuery.sql.includes('node_id'), 'should include node_id column');
  t.ok(nodesQuery.sql.includes('node_address'), 'should include node_address column');
  t.ok(nodesQuery.sql.includes('cpu_cores'), 'should include cpu_cores column');
  t.ok(nodesQuery.sql.includes('memory_mb'), 'should include memory_mb column');
  t.ok(nodesQuery.sql.includes('disk_gb'), 'should include disk_gb column');
  t.ok(nodesQuery.sql.includes('status'), 'should include status column');
  t.ok(nodesQuery.sql.includes('ws_connection_state'), 'should include ws_connection_state column');

  // Verify nodes parameters
  t.equal(nodesQuery.params[0], 'test-node-123', 'should use correct node_id');
  t.equal(nodesQuery.params[1], 'ws://localhost:9000', 'should use correct node_address');
  t.ok(nodesQuery.params[2] > 0, 'should have cpu_cores > 0');
  t.ok(nodesQuery.params[3] > 0, 'should have memory_mb > 0');
  t.ok(nodesQuery.params[4] > 0, 'should have disk_gb > 0');
  t.equal(nodesQuery.params[8], STATE.ACTIVE, 'should set status to ACTIVE');
  t.equal(nodesQuery.params[9], STATE.CONNECTED, 'should set ws_connection_state to CONNECTED');

  // Verify node_endpoints table query
  const endpointQuery = executedQueries[1];
  t.ok(
    endpointQuery.sql.includes(`INSERT INTO ${TABLES.NODE_ENDPOINTS}`),
    'should be INSERT INTO node_endpoints',
  );
  t.equal(endpointQuery.params[0], 'ep-test-node-123-ws', 'should use correct endpoint_id');
  t.equal(endpointQuery.params[1], 'test-node-123', 'should use correct node_id');
  t.equal(endpointQuery.params[2], TRANSPORT_TYPE.WEBSOCKET, 'should use ws transport type');
  t.equal(endpointQuery.params[3], 'ws://localhost:9000', 'should use correct address');
  t.equal(endpointQuery.params[4], 0, 'should use priority 0');
  t.equal(endpointQuery.params[6], ENDPOINT_STATUS.ACTIVE, 'should set status to active');
});

test('registerNodeInCluster() - should throw error if query fails', async (t) => {
  // Create a mock SQL query engine that fails
  const mockQueryEngine = {
    executeQuery: async () => {
      return {success: false, error: 'Database error'};
    },
  };

  // Create a mock CDC integration service
  const mockCDCService = {
    sqlQueryEngine: mockQueryEngine,
  };

  // Create NodeJoiningService instance
  const service = new NodeJoiningService({
    nodeId: 'test-node-456',
    nodeAddress: 'ws://localhost:9001',
    seedNodeAddress: 'ws://seed:8000',
  });

  // Set the mock CDC service
  service.cdcIntegrationService = mockCDCService;

  // Call registerNodeInCluster and expect it to throw
  try {
    await service.registerNodeInCluster();
    t.fail('should have thrown an error');
  } catch (error) {
    t.ok(
      error.message.includes('Failed to register node'),
      'should throw error with correct message',
    );
  }
});

test('registerNodeInCluster() - should throw error if CDC service not available', async (t) => {
  // Create NodeJoiningService instance without CDC service
  const service = new NodeJoiningService({
    nodeId: 'test-node-789',
    nodeAddress: 'ws://localhost:9002',
    seedNodeAddress: 'ws://seed:8000',
  });

  // Don't set CDC service (it's null)

  // Call registerNodeInCluster and expect it to throw
  try {
    await service.registerNodeInCluster();
    t.fail('should have thrown an error');
  } catch (error) {
    t.ok(error.message.length > 0, 'should throw error');
  }
});
