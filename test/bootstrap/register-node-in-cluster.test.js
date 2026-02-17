/**
 * Unit tests for NodeJoiningService.registerNodeInCluster() method.
 * Tests task 5.1: Add registerNodeInCluster() method to NodeJoiningService.
 * Tests task 13.1: Update node registration to write endpoint.
 */

import {test} from '../../src/test-helpers/tap.js';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {ENDPOINT_STATUS, SERVICE_STATUS, STATE, TABLES, TRANSPORT_TYPE} from '../../src/constants/index.js';

test('registerNodeInCluster() - should execute UPSERT writes with correct data', async (t) => {
  const upsertCalls = [];
  const mockCDCService = {
    sqlQueryEngine: {},
    upsertSystemTableRow: async (tableName, rowData) => {
      upsertCalls.push({tableName, rowData});
      return {success: true};
    },
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

  t.equal(upsertCalls.length, 2, 'should execute two upserts');

  const nodeCall = upsertCalls[0];
  t.equal(nodeCall.tableName, TABLES.NODES, 'should upsert nodes table');
  t.equal(nodeCall.rowData.node_id, 'test-node-123', 'should use correct node_id');
  t.equal(nodeCall.rowData.node_address, 'ws://localhost:9000', 'should use correct node_address');
  t.ok(nodeCall.rowData.cpu_cores > 0, 'should have cpu_cores > 0');
  t.ok(nodeCall.rowData.memory_mb > 0, 'should have memory_mb > 0');
  t.ok(nodeCall.rowData.disk_gb > 0, 'should have disk_gb > 0');
  t.equal(nodeCall.rowData.status, SERVICE_STATUS.ACTIVE, 'should set status to ACTIVE');
  t.equal(nodeCall.rowData.connection_state, STATE.CONNECTED,
    'should set connection_state to CONNECTED');

  const endpointCall = upsertCalls[1];
  t.equal(
    endpointCall.tableName,
    TABLES.NODE_ENDPOINTS,
    'should upsert node_endpoints table',
  );
  t.equal(
    endpointCall.rowData.endpoint_id,
    'ep-test-node-123-ws',
    'should use correct endpoint_id',
  );
  t.equal(endpointCall.rowData.node_id, 'test-node-123', 'should use correct node_id');
  t.equal(endpointCall.rowData.transport_type, TRANSPORT_TYPE.WEBSOCKET,
    'should use ws transport type');
  t.equal(endpointCall.rowData.address, 'ws://localhost:9000', 'should use correct address');
  t.equal(endpointCall.rowData.priority, 0, 'should use priority 0');
  t.equal(endpointCall.rowData.status, ENDPOINT_STATUS.ACTIVE, 'should set status to active');
});

test('registerNodeInCluster() - should throw error if query fails', async (t) => {
  const mockCDCService = {
    sqlQueryEngine: {},
    upsertSystemTableRow: async () => {
      return {success: false, error: 'Database error'};
    },
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
