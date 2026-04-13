/**
 * Unit tests for NodeJoiningService.registerNodeInCluster() method.
 * Tests task 5.1: Add registerNodeInCluster() method to NodeJoiningService.
 * Tests task 13.1: Update node registration to write endpoint.
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {STARTUP_JOIN_MODE} from
  '../../src/bootstrap/rejoin-hints-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {
  ENDPOINT_STATUS,
  SERVICE_STATUS,
  STATE,
  TABLES,
  TRANSPORT_TYPE,
} from '../../src/constants/index.js';
import {META_SERVICE_ID} from '../../src/constants/wasm-meta.js';
import {NodeService} from '../../src/node/node-service.js';

test('registerNodeInCluster() - should create the canonical nodes row and upsert endpoints',
  async (t) => {
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
  service.sendControlPlaneNodeStateUpdate = async () => {
    throw new Error('legacy node-state owner path should not be used');
  };

  // Call registerNodeInCluster
  await service.registerNodeInCluster();

  const nodeCall = upsertCalls.find((call) =>
    call.tableName === TABLES.NODES,
  );
  t.ok(nodeCall, 'should create one canonical nodes row during registration');
  t.equal(nodeCall.rowData.node_id, 'test-node-123', 'should use correct node_id');
  t.equal(
    nodeCall.rowData.node_address,
    'ws://localhost:9000',
    'should use correct node_address',
  );
  t.ok(nodeCall.rowData.cpu_cores > 0, 'should have cpu_cores > 0');
  t.ok(nodeCall.rowData.memory_mb > 0, 'should have memory_mb > 0');
  t.ok(nodeCall.rowData.disk_gb > 0, 'should have disk_gb > 0');
  t.equal(
    nodeCall.rowData.status,
    SERVICE_STATUS.ACTIVE,
    'should persist ACTIVE status in the canonical nodes row',
  );
  t.equal(
    nodeCall.rowData.connection_state,
    STATE.CONNECTED,
    'should persist CONNECTED admission state in the canonical nodes row',
  );
  t.notOk(
    Number.isFinite(nodeCall.rowData.ready_lease_expires_at),
    'join registration should not assign the ready lease before ready signaling',
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
  service.sendControlPlaneNodeStateUpdate = async () => {
    throw new Error('legacy node-state owner path should not be used');
  };

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

test('registerNodeInCluster() - should publish explicit advertised websocket endpoint when configured', async (t) => {
  const upsertCalls = [];
  const mockCDCService = {
    sqlQueryEngine: {},
    upsertSystemTableRow: async (tableName, rowData) => {
      upsertCalls.push({tableName, rowData});
      return {success: true};
    },
  };

  const service = new NodeJoiningService({
    nodeId: 'test-node-explicit-endpoint',
    nodeAddress: 'joiner-host:8080',
    advertisedNodeWsAddress: 'ws://172.20.0.42:8082',
    seedNodeAddress: 'ws://seed:8000',
  });
  service.cdcIntegrationService = mockCDCService;
  service.sendControlPlaneNodeStateUpdate = async () => {
    throw new Error('legacy node-state owner path should not be used');
  };

  await service.registerNodeInCluster();

  const endpointCall = upsertCalls.find((call) =>
    call.tableName === TABLES.NODE_ENDPOINTS,
  );
  t.ok(endpointCall, 'should upsert node_endpoints table');
  t.equal(
    endpointCall?.rowData?.address,
    'ws://172.20.0.42:8082',
    'explicit advertised websocket address should be published canonically',
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
  service.sendControlPlaneNodeStateUpdate = async () => {
    throw new Error('legacy node-state owner path should not be used');
  };

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
  service.sendControlPlaneNodeStateUpdate = async () => {
    throw new Error('legacy node-state owner path should not be used');
  };
  service.getNodeStorageBudgetService = () => ({
    resolveBudgetRow: (nodeRow) => ({
      budgetRow: {
        ...nodeRow,
        storage_budget_bytes: 1024,
        storage_budget_source: 'test',
        storage_budget_updated_at: nodeRow.created_at,
      },
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

test('registerNodeInCluster() - should use the registration owner path for nodes row creation',
  async (t) => {
    const upsertCalls = [];
    const service = new NodeJoiningService({
      nodeId: 'test-node-owner-path',
      nodeAddress: 'ws://localhost:9010',
      seedNodeAddress: 'ws://seed:8000',
    });

    service.cdcIntegrationService = {
      sqlQueryEngine: {},
      upsertSystemTableRow: async (tableName, rowData) => {
        upsertCalls.push({tableName, rowData});
        return {success: true};
      },
    };
    service.sendControlPlaneNodeStateUpdate = async () => {
      throw new Error('legacy node-state owner path should not be used');
    };

    await service.registerNodeInCluster();

    const nodeUpserts = upsertCalls.filter((call) => call.tableName === TABLES.NODES);
    t.equal(nodeUpserts.length, 1, 'should create exactly one canonical nodes row');
    t.equal(
      nodeUpserts[0].rowData.connection_state,
      STATE.CONNECTED,
      'registration should persist CONNECTED until ready signaling completes',
    );
    t.equal(
      nodeUpserts[0].rowData.node_id,
      'test-node-owner-path',
      'registration should create the canonical node row directly',
    );
    t.equal(
      service.getRegisteredJoinNodeId(),
      'test-node-owner-path',
      'successful registration should expose join membership from the canonical nodes cache row',
    );
  });

test('registerNodeInCluster() - should retry transient participant failures during node admission',
  async (t) => {
    const upsertCalls = [];
    const participantFailure = new Error(
      'Distributed operation failed due to participant failures',
    );
    participantFailure.code = 'DISTRIBUTED_PARTICIPANT_FAILURE';
    participantFailure.retryAfterMs = 250;

    const service = new NodeJoiningService({
      nodeId: 'test-node-admission-retry',
      nodeAddress: 'ws://localhost:9012',
      seedNodeAddress: 'ws://seed:8000',
    });
    service.config.joinAdmissionWriteRetryTimeoutMs = 1000;
    service.sleep = async () => {};

    let nodeWriteAttempts = 0;
    service.cdcIntegrationService = {
      sqlQueryEngine: {},
      upsertSystemTableRow: async (tableName, rowData) => {
        upsertCalls.push({tableName, rowData});
        if (tableName === TABLES.NODES) {
          nodeWriteAttempts += 1;
          if (nodeWriteAttempts === 1) {
            throw participantFailure;
          }
        }
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
      throw new Error('legacy node-state owner path should not be used');
    };

    await service.registerNodeInCluster();

    t.equal(
      nodeWriteAttempts,
      2,
      'join admission should retry the canonical nodes write once after a retryable failure',
    );
    t.equal(
      service.getRegisteredJoinNodeId(),
      'test-node-admission-retry',
      'membership should be visible from the canonical nodes cache row after the retried admission succeeds',
    );
    t.equal(service.hasPublishedLocalServiceEndpoints(), true,
      'endpoint publication should still complete after the retried admission succeeds');
    t.ok(
      upsertCalls.some((call) => call.tableName === TABLES.NODE_ENDPOINTS),
      'endpoint publication should continue after the nodes write retry succeeds',
    );
  });

test('registerNodeInCluster() - should retry admission at phase scope when the first routed attempt exhausts the inner retry budget',
  async (t) => {
    const participantFailure = new Error(
      'Distributed operation failed due to participant failures',
    );
    participantFailure.code = 'DISTRIBUTED_PARTICIPANT_FAILURE';

    const service = new NodeJoiningService({
      nodeId: 'test-node-phase-admission-retry',
      nodeAddress: 'ws://localhost:9013',
      seedNodeAddress: 'ws://seed:8000',
    });

    let nowMs = 0;
    let nodeWriteAttempts = 0;
    service.now = () => nowMs;
    service.sleep = async (delayMs) => {
      nowMs += delayMs;
    };
    service.config.joinAdmissionWriteRetryTimeoutMs = 2000;
    service.config.joinRegistrationMaxAttempts = 2;

    service.cdcIntegrationService = {
      sqlQueryEngine: {},
      upsertSystemTableRow: async (tableName) => {
        if (tableName === TABLES.NODES) {
          nodeWriteAttempts += 1;
          if (nodeWriteAttempts === 1) {
            nowMs = 5000;
            throw participantFailure;
          }
        }
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
      throw new Error('legacy node-state owner path should not be used');
    };

    await service.registerNodeInCluster();

    t.equal(
      nodeWriteAttempts,
      2,
      'phase-scoped join admission should rerun node registration after the first routed attempt ages out the inner retry budget',
    );
    t.equal(
      service.getRegisteredJoinNodeId(),
      'test-node-phase-admission-retry',
      'phase-scoped retry should still complete canonical membership registration',
    );
    t.equal(service.hasPublishedLocalServiceEndpoints(), true,
      'phase-scoped retry should still complete endpoint publication');
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
    service.config.joinAdmissionWriteRetryTimeoutMs = 0;

    service.cdcIntegrationService = {
      sqlQueryEngine: {},
      upsertSystemTableRow: async (tableName, rowData) => {
        if (tableName === TABLES.NODES) {
          throw participantFailure;
        }
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
      throw new Error('legacy node-state owner path should not be used');
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
      service.getRegisteredJoinNodeId(),
      null,
      'membership should not appear in cache when admission fails',
    );
    t.equal(service.hasPublishedLocalServiceEndpoints(), false,
      'endpoint publication should not appear in cache when admission fails');
    t.equal(
      upsertCalls.length,
      0,
      'join registration should stop before endpoint upserts when admission fails',
    );
  });

test('registerNodeInCluster() - should reuse canonical membership during durable rejoin while refreshing the canonical nodes row',
  async (t) => {
    NodeService.resetInstance();
    t.after(() => NodeService.resetInstance());

    const upsertCalls = [];
    const nodeId = 'test-node-durable-rejoin';
    const nodeAddress = 'joiner-host:8080';
    const cache = new SystemTableCache();
    cache.applySystemTableChange(TABLES.NODES, 'INSERT', {
      node_id: nodeId,
      node_address: nodeAddress,
      status: SERVICE_STATUS.ACTIVE,
      connection_state: STATE.DISCONNECTED,
    });
    cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, 'INSERT', {
      endpoint_id: `ep-${nodeId}-ws`,
      node_id: nodeId,
      transport_type: TRANSPORT_TYPE.WEBSOCKET,
      address: 'ws://joiner-host:8082',
      priority: 0,
      metadata: '{}',
      status: ENDPOINT_STATUS.ACTIVE,
    });
    cache.applySystemTableChange(TABLES.SERVICE_ENDPOINTS, 'INSERT', {
      endpoint_id: `${META_SERVICE_ID.POSTGRES_WIRE}-ep-${nodeId}`,
      service_id: META_SERVICE_ID.POSTGRES_WIRE,
      node_id: nodeId,
      protocol: 'tcp',
      address: 'joiner-host',
      port: 5432,
      metadata: '{}',
    });
    NodeService.getInstance().setSystemCacheProxy(cache);

    const service = new NodeJoiningService({
      nodeId,
      nodeAddress,
      seedNodeAddress: 'ws://seed:8000',
      wsPort: 8082,
      startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
    });
    service.cdcIntegrationService = {
      sqlQueryEngine: {},
      executeAuthoritativeSystemTableRead: async (tableName) => {
        if (tableName === TABLES.NODES) {
          return {
            success: true,
            rows: [{
              node_id: nodeId,
              node_address: nodeAddress,
              status: SERVICE_STATUS.ACTIVE,
              connection_state: STATE.DISCONNECTED,
            }],
          };
        }
        if (tableName === TABLES.NODE_ENDPOINTS) {
          return {
            success: true,
            rows: [{
              endpoint_id: `ep-${nodeId}-ws`,
              node_id: nodeId,
              transport_type: TRANSPORT_TYPE.WEBSOCKET,
              address: 'ws://joiner-host:8082',
              priority: 0,
              metadata: '{}',
              status: ENDPOINT_STATUS.ACTIVE,
            }],
          };
        }
        if (tableName === TABLES.SERVICE_ENDPOINTS) {
          return {
            success: true,
            rows: [{
              endpoint_id: `${META_SERVICE_ID.POSTGRES_WIRE}-ep-${nodeId}`,
              service_id: META_SERVICE_ID.POSTGRES_WIRE,
              node_id: nodeId,
              protocol: 'tcp',
              address: 'joiner-host',
              port: 5432,
              metadata: '{}',
            }],
          };
        }
        return {success: true, rows: []};
      },
      upsertSystemTableRow: async (tableName, rowData) => {
        upsertCalls.push({tableName, rowData});
        return {success: true};
      },
    };
    service.sendControlPlaneNodeStateUpdate = async () => {
      throw new Error('legacy node-state owner path should not be used');
    };

    const result = await service.registerNodeInCluster();

    t.equal(
      upsertCalls.length,
      1,
      'durable rejoin should refresh the canonical nodes row so peers learn the node is connected but not yet ready',
    );
    t.equal(
      upsertCalls[0]?.tableName,
      TABLES.NODES,
      'durable rejoin should only refresh the canonical nodes row when endpoint metadata is already reusable',
    );
    t.equal(
      upsertCalls[0]?.rowData?.connection_state,
      STATE.CONNECTED,
      'durable rejoin refresh should preserve CONNECTED admission state',
    );
    t.notOk(
      Number.isFinite(upsertCalls[0]?.rowData?.ready_lease_expires_at),
      'durable rejoin refresh should explicitly clear the ready lease until READY signaling completes',
    );
    t.equal(
      result?.reusedExistingMembership,
      true,
      'durable rejoin should report that it reused canonical membership',
    );
    t.equal(
      result?.resolution?.source,
      'durable_rejoin_existing_membership',
      'durable rejoin should explain why fresh admission writes were skipped',
    );
    t.equal(
      service.getRegisteredJoinNodeId(),
      nodeId,
      'durable rejoin should satisfy join membership from canonical cache evidence',
    );
    t.equal(service.hasPublishedLocalServiceEndpoints(), true,
      'durable rejoin should satisfy endpoint publication from canonical cache evidence');

    const nodeRows = cache.getAll(TABLES.NODES);
    const reusedNodeRow = nodeRows.find((row) => row.node_id === nodeId);
    t.equal(
      reusedNodeRow?.connection_state,
      STATE.CONNECTED,
      'durable rejoin should locally project the cached node row back to CONNECTED',
    );
  });

test('registerNodeInCluster() - should not treat cache-only durable rejoin metadata as canonical proof',
  async (t) => {
    NodeService.resetInstance();
    t.after(() => NodeService.resetInstance());

    const upsertCalls = [];
    const nodeId = 'test-node-durable-rejoin-cache-only';
    const nodeAddress = 'joiner-cache-only:8080';
    const cache = new SystemTableCache();
    cache.applySystemTableChange(TABLES.NODES, 'INSERT', {
      node_id: nodeId,
      node_address: nodeAddress,
      status: SERVICE_STATUS.ACTIVE,
      connection_state: STATE.DISCONNECTED,
    });
    cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, 'INSERT', {
      endpoint_id: `ep-${nodeId}-ws`,
      node_id: nodeId,
      transport_type: TRANSPORT_TYPE.WEBSOCKET,
      address: 'ws://joiner-cache-only:8082',
      priority: 0,
      metadata: '{}',
      status: ENDPOINT_STATUS.ACTIVE,
    });
    cache.applySystemTableChange(TABLES.SERVICE_ENDPOINTS, 'INSERT', {
      endpoint_id: `${META_SERVICE_ID.POSTGRES_WIRE}-ep-${nodeId}`,
      service_id: META_SERVICE_ID.POSTGRES_WIRE,
      node_id: nodeId,
      protocol: 'tcp',
      address: 'joiner-cache-only',
      port: 5432,
      metadata: '{}',
    });
    NodeService.getInstance().setSystemCacheProxy(cache);

    const service = new NodeJoiningService({
      nodeId,
      nodeAddress,
      seedNodeAddress: 'ws://seed:8000',
      wsPort: 8082,
      startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
    });
    service.cdcIntegrationService = {
      sqlQueryEngine: {},
      executeAuthoritativeSystemTableRead: async () => {
        return {success: true, rows: []};
      },
      upsertSystemTableRow: async (tableName, rowData) => {
        upsertCalls.push({tableName, rowData});
        return {success: true};
      },
    };
    service.sendControlPlaneNodeStateUpdate = async () => {
      throw new Error('legacy node-state owner path should not be used');
    };

    const result = await service.registerNodeInCluster();

    t.equal(
      result?.reusedExistingMembership,
      undefined,
      'cache-only metadata must not be treated as canonical durable rejoin proof',
    );
    t.ok(
      upsertCalls.some((call) => call.tableName === TABLES.NODE_ENDPOINTS),
      'registration should fall back to fresh admission writes when authoritative rejoin rows are absent',
    );
  });

test('registerNodeInCluster() - should fall back to fresh admission writes when durable rejoin node metadata drifted',
  async (t) => {
    NodeService.resetInstance();
    t.after(() => NodeService.resetInstance());

    const upsertCalls = [];
    const nodeId = 'test-node-durable-rejoin-drift';
    const cache = new SystemTableCache();
    cache.applySystemTableChange(TABLES.NODES, 'INSERT', {
      node_id: nodeId,
      node_address: 'old-host:8080',
      status: SERVICE_STATUS.ACTIVE,
      connection_state: STATE.DISCONNECTED,
    });
    cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, 'INSERT', {
      endpoint_id: `ep-${nodeId}-ws`,
      node_id: nodeId,
      transport_type: TRANSPORT_TYPE.WEBSOCKET,
      address: 'ws://old-host:8082',
      priority: 0,
      metadata: '{}',
      status: ENDPOINT_STATUS.ACTIVE,
    });
    cache.applySystemTableChange(TABLES.SERVICE_ENDPOINTS, 'INSERT', {
      endpoint_id: `${META_SERVICE_ID.POSTGRES_WIRE}-ep-${nodeId}`,
      service_id: META_SERVICE_ID.POSTGRES_WIRE,
      node_id: nodeId,
      protocol: 'tcp',
      address: 'old-host',
      port: 5432,
      metadata: '{}',
    });
    NodeService.getInstance().setSystemCacheProxy(cache);

    const service = new NodeJoiningService({
      nodeId,
      nodeAddress: 'new-host:8080',
      seedNodeAddress: 'ws://seed:8000',
      wsPort: 8082,
      startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
    });
    service.cdcIntegrationService = {
      sqlQueryEngine: {},
      upsertSystemTableRow: async (tableName, rowData) => {
        upsertCalls.push({tableName, rowData});
        return {success: true};
      },
    };
    service.sendControlPlaneNodeStateUpdate = async () => {
      throw new Error('legacy node-state owner path should not be used');
    };

    await service.registerNodeInCluster();

    t.ok(
      upsertCalls.some((call) => call.tableName === TABLES.NODES),
      'durable rejoin should perform fresh admission writes when node address metadata drifted',
    );
  });
