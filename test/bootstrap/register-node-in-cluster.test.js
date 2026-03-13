/**
 * Unit tests for NodeJoiningService.registerNodeInCluster() method.
 * Tests task 5.1: Add registerNodeInCluster() method to NodeJoiningService.
 * Tests task 13.1: Update node registration to write endpoint.
 */

import {test} from '../../src/test-helpers/tap.js';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {
  ENDPOINT_STATUS,
  SERVICE_STATUS,
  STATE,
  TABLES,
  TRANSPORT_TYPE,
} from '../../src/constants/index.js';

test('registerNodeInCluster() - should publish admission via NODE_STATE_UPDATE and upsert endpoints',
  async (t) => {
  const upsertCalls = [];
  const nodeStateUpdates = [];
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
  service.sendControlPlaneNodeStateUpdate = async (options) => {
    nodeStateUpdates.push(options);
  };

  // Call registerNodeInCluster
  await service.registerNodeInCluster();

  t.equal(nodeStateUpdates.length, 1, 'should publish one node admission update');
  const nodeCall = nodeStateUpdates[0];
  t.equal(nodeCall.state, STATE.CONNECTED, 'should publish CONNECTED admission state');
  t.equal(nodeCall.nodeRow.node_id, 'test-node-123', 'should use correct node_id');
  t.equal(
    nodeCall.nodeRow.node_address,
    'ws://localhost:9000',
    'should use correct node_address',
  );
  t.ok(nodeCall.nodeRow.cpu_cores > 0, 'should have cpu_cores > 0');
  t.ok(nodeCall.nodeRow.memory_mb > 0, 'should have memory_mb > 0');
  t.ok(nodeCall.nodeRow.disk_gb > 0, 'should have disk_gb > 0');
  t.equal(
    nodeCall.nodeRow.status,
    SERVICE_STATUS.ACTIVE,
    'should publish ACTIVE status through the node-row payload',
  );
  t.notOk(
    Number.isFinite(nodeCall.nodeRow.ready_lease_expires_at),
    'join admission should not assign the ready lease before ready signaling',
  );

  const endpointCall = upsertCalls.find((call) =>
    call.tableName === TABLES.NODE_ENDPOINTS);
  t.ok(endpointCall, 'should upsert node_endpoints table');
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

test('registerNodeInCluster() - should canonicalize raw node address to websocket endpoint', async (t) => {
  const upsertCalls = [];
  const mockCDCService = {
    sqlQueryEngine: {},
    upsertSystemTableRow: async (tableName, rowData) => {
      upsertCalls.push({tableName, rowData});
      return {success: true};
    },
  };

  const service = new NodeJoiningService({
    nodeId: 'test-node-canonical-endpoint',
    nodeAddress: 'joiner-host:8080',
    seedNodeAddress: 'ws://seed:8000',
  });
  service.cdcIntegrationService = mockCDCService;
  service.sendControlPlaneNodeStateUpdate = async () => {};

  await service.registerNodeInCluster();

  const endpointCall = upsertCalls.find((call) =>
    call.tableName === TABLES.NODE_ENDPOINTS,
  );
  t.ok(endpointCall, 'should upsert node_endpoints table');
  t.equal(
    endpointCall?.rowData?.address,
    'ws://joiner-host:8082',
    'join-time endpoint registration should publish canonical websocket address',
  );
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
  service.sendControlPlaneNodeStateUpdate = async () => {};

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

test('registerNodeInCluster() - should skip cache waits before CDC subscriptions are active',
  async (t) => {
    const upsertCalls = [];
    const mockCDCService = {
      sqlQueryEngine: {},
      upsertSystemTableRow: async (tableName, rowData, options) => {
        upsertCalls.push({tableName, rowData, options});
        return {success: true};
      },
    };

  const service = new NodeJoiningService({
    nodeId: 'test-node-join-cache-wait',
    nodeAddress: 'ws://localhost:9003',
    seedNodeAddress: 'ws://seed:8000',
    wsPort: 9003,
  });
  service.cdcIntegrationService = mockCDCService;
  service.seedJoinTimeCacheRow = () => {};
  service.sendControlPlaneNodeStateUpdate = async () => {};
  service.getNodeStorageBudgetService = () => ({
    resolveBudgetRow: (nodeRow) => ({
      budgetRow: nodeRow,
      resolution: {
        isValid: true,
        budgetBytes: 1024,
        source: 'test',
        diskBytes: 1024,
      },
    }),
  });

    await service.registerNodeInCluster();

    t.ok(upsertCalls.length > 0, 'should upsert endpoint rows during registration');
    t.ok(
      upsertCalls.every((call) => call.options?.skipCacheWait === true),
      'join-time endpoint upserts should skip cache waits before subscriptions are active',
    );
  });

test('registerNodeInCluster() - should route node admission through NODE_STATE_UPDATE owner path',
  async (t) => {
    const nodeStateUpdates = [];
    const service = new NodeJoiningService({
      nodeId: 'test-node-owner-path',
      nodeAddress: 'ws://localhost:9010',
      seedNodeAddress: 'ws://seed:8000',
    });

    service.cdcIntegrationService = {
      sqlQueryEngine: {},
      upsertSystemTableRow: async () => ({success: true}),
    };
    service.sendControlPlaneNodeStateUpdate = async (options) => {
      nodeStateUpdates.push(options);
    };

    await service.registerNodeInCluster();

    t.equal(nodeStateUpdates.length, 1, 'should publish one node-state update');
    t.equal(
      nodeStateUpdates[0].state,
      STATE.CONNECTED,
      'membership publication should use CONNECTED state until ready signaling completes',
    );
  t.equal(
    nodeStateUpdates[0].nodeRow.node_id,
    'test-node-owner-path',
    'membership publication should carry the canonical node row',
  );
  t.equal(
    service.joinMembershipPublished,
    true,
    'successful membership publication should mark join membership as published',
  );
});

test('registerNodeInCluster() - should fail narrowly on seed participant failure before endpoint publication',
  async (t) => {
    const upsertCalls = [];
    const participantFailure = new Error(
      'Distributed operation failed due to participant failures',
    );
    participantFailure.code = 'DISTRIBUTED_PARTICIPANT_FAILURE';
    participantFailure.retryAfterMs = 250;

    const service = new NodeJoiningService({
      nodeId: 'test-node-seed-restart-failure',
      nodeAddress: 'ws://localhost:9011',
      seedNodeAddress: 'ws://seed:8000',
    });

    service.cdcIntegrationService = {
      sqlQueryEngine: {},
      upsertSystemTableRow: async (tableName, rowData) => {
        upsertCalls.push({tableName, rowData});
        return {success: true};
      },
    };
    service.getNodeStorageBudgetService = () => ({
      resolveBudgetRow: (nodeRow) => ({
        budgetRow: nodeRow,
        resolution: {
          isValid: true,
          budgetBytes: 1024,
          source: 'test',
          diskBytes: 1024,
        },
      }),
    });
    service.sendControlPlaneNodeStateUpdate = async () => {
      throw participantFailure;
    };

    const error = await t.rejects(
      service.registerNodeInCluster(),
      /Failed to register node: Distributed operation failed due to participant failures/,
      'seed restart-style admission failures should surface through registerNodeInCluster',
    );

    t.equal(
      error?.code,
      'DISTRIBUTED_PARTICIPANT_FAILURE',
      'join registration should preserve the participant-failure code',
    );
    t.equal(
      error?.retryAfterMs,
      250,
      'join registration should preserve retry-after hints from the owner path',
    );
    t.equal(
      error?.cause,
      participantFailure,
      'join registration should retain the original owner-path failure as cause',
    );
    t.equal(
      service.joinMembershipPublished,
      false,
      'membership should not be marked published when admission fails',
    );
    t.equal(
      service.messageGroupServiceEndpointsPublished,
      false,
      'endpoint publication should not be marked complete when admission fails',
    );
    t.equal(
      upsertCalls.length,
      0,
      'join registration should stop before endpoint upserts when admission fails',
    );
  });
