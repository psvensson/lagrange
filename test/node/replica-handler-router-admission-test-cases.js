import {
  buildReplicaCreateAdmissionToken,
  buildReplicaCreateAttemptToken,
} from '../../src/rebalancer/replica-create-admission-token.js';

function createMockRouter() {
  const registeredHandlers = new Map();
  return {
    registeredHandlers,
    router: {
      register(address, handlerFn) {
        registeredHandlers.set(address, handlerFn);
      },
      unregister(address) {
        registeredHandlers.delete(address);
      },
    },
  };
}

function seedRoutedCreateOperation(cache, seedReplicaOperation) {
  seedReplicaOperation(cache, 'op-1', {
    entity_type: 'partition',
    entity_id: 'partition-1',
    workflow_step: 'SENDING',
    completed_at: null,
    create_admission_state: null,
    create_admission_token: null,
    create_admission_replica_created_at: null,
    create_admission_attempt_token: null,
    create_admission_previous_attempt_token: null,
    create_admission_attempt_seq: null,
    create_admission_workflow_updated_at: null,
    create_admission_owner_incarnation: null,
  });
}

function buildRoutedCreateEnvelope(operation, {
  OperationType,
  ReplicaOperationMessageType,
}) {
  const createAdmissionToken = buildReplicaCreateAdmissionToken({
    operationId: operation.operation_id,
    replicaId: operation.replica_id,
    targetNodeId: operation.target_node_id,
    workflowUpdatedAt: operation.updated_at,
  });
  return {
    correlationId: 'corr-1',
    payload: {
      type: ReplicaOperationMessageType.CREATE_REPLICA,
      operationId: 'op-1',
      operationType: OperationType.ADD,
      entityType: 'partition',
      entityId: 'partition-1',
      partitionId: 'partition-1',
      replicaId: 'replica-1',
      createAdmissionToken,
      createAdmissionWorkflowUpdatedAt: operation.updated_at,
      createAdmissionAttemptToken:
        buildReplicaCreateAttemptToken(createAdmissionToken, 1),
      createAdmissionAttemptSeq: 1,
    },
  };
}

async function registerReplicaHandlerRouterAdmissionTests({
  t,
  createSeededCache,
  seedReplicaOperation,
  createMockCDCService,
  ReplicaHandler,
  tempDir,
  createMockPartitionServiceFactory,
  waitForReplicaEvent,
  SYSTEM_TABLE_NAME,
  OperationType,
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
}) {
  t.test('registerWithRouter registers handler at correct address', async (t) => {
    const cache = createSeededCache();
    seedRoutedCreateOperation(cache, seedReplicaOperation);
    const mockCDC = createMockCDCService(cache);

    const handler = new ReplicaHandler({
      nodeId: 'test-node',
      dataDir: tempDir,
      systemTableCache: cache,
      cdcIntegrationService: mockCDC,
      createPartitionService: createMockPartitionServiceFactory(),
    });

    handler.initialize();

    const created = waitForReplicaEvent(
      handler,
      'replicaCreated',
      'replicaCreationFailed',
    );

    const {router: mockRouter, registeredHandlers} = createMockRouter();

    handler.registerWithRouter(mockRouter);

    // Check handler was registered at correct address
    t.ok(
      registeredHandlers.has('test-node/service/replica-handler'),
      'handler registered at correct address',
    );

    // Test the registered handler works
    const registeredHandler = registeredHandlers.get('test-node/service/replica-handler');
    const operation = cache.get(
      SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      'op-1',
    );
    const envelope = buildRoutedCreateEnvelope(operation, {
      OperationType,
      ReplicaOperationMessageType,
    });

    const response = await registeredHandler(envelope);
    t.equal(response.acknowledged, true, 'response acknowledged');
    t.equal(response.status, ReplicaOperationResponseStatus.INITIATED,
      'create initiated');
    t.equal(response.correlationId, 'corr-1', 'correlationId preserved');

    await created;

    handler.shutdown();
  });

  t.test('unregisterFromRouter removes handler', async (t) => {
    const cache = createSeededCache();
    const mockCDC = createMockCDCService(cache);

    const handler = new ReplicaHandler({
      nodeId: 'test-node',
      dataDir: tempDir,
      systemTableCache: cache,
      cdcIntegrationService: mockCDC,
      createPartitionService: createMockPartitionServiceFactory(),
    });

    handler.initialize();

    const {router: mockRouter, registeredHandlers} = createMockRouter();

    handler.registerWithRouter(mockRouter);
    t.ok(
      registeredHandlers.has('test-node/service/replica-handler'),
      'handler registered',
    );

    handler.unregisterFromRouter(mockRouter);
    t.notOk(
      registeredHandlers.has('test-node/service/replica-handler'),
      'handler unregistered',
    );

    handler.shutdown();
  });

  t.test('registerWithRouter with RPC client notifies on response', async (t) => {
    const cache = createSeededCache();
    seedRoutedCreateOperation(cache, seedReplicaOperation);
    const mockCDC = createMockCDCService(cache);

    const handler = new ReplicaHandler({
      nodeId: 'test-node',
      dataDir: tempDir,
      systemTableCache: cache,
      cdcIntegrationService: mockCDC,
      createPartitionService: createMockPartitionServiceFactory(),
    });

    handler.initialize();

    const created = waitForReplicaEvent(
      handler,
      'replicaCreated',
      'replicaCreationFailed',
    );

    // Create mock RPC client
    const rpcResponses = [];
    const mockRpcClient = {
      handleResponse(correlationId, response) {
        rpcResponses.push({correlationId, response});
      },
    };

    const {router: mockRouter, registeredHandlers} = createMockRouter();

    handler.registerWithRouter(mockRouter, {rpcClient: mockRpcClient});

    // Test the registered handler notifies RPC client
    const registeredHandler = registeredHandlers.get('test-node/service/replica-handler');
    const operation = cache.get(
      SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      'op-1',
    );
    const envelope = buildRoutedCreateEnvelope(operation, {
      OperationType,
      ReplicaOperationMessageType,
    });

    await registeredHandler(envelope);
    await created;

    // Check RPC client was notified
    t.equal(rpcResponses.length, 1, 'RPC client notified');
    t.equal(rpcResponses[0].correlationId, 'corr-1', 'correct correlationId');
    t.equal(rpcResponses[0].response.status,
      ReplicaOperationResponseStatus.INITIATED, 'correct status');

    handler.shutdown();
  });
}

export {registerReplicaHandlerRouterAdmissionTests};
