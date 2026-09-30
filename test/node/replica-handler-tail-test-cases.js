import {registerReplicaHandlerTailMoreTests} from './replica-handler-tail-more-test-cases.js';

export async function registerReplicaHandlerTailTests({
  t,
  fs,
  path,
  os,
  ReplicaHandler,
  OperationType,
  ReplicaStatus,
  SYSTEM_TABLE_NAME,
  SystemTableCache,
  ConfigurationManager,
  LoggingService,
  ReplicaStateMachine,
  SERVICE_STATUS,
  WORKFLOW_STEP,
  ReplicaOperationField,
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
  RAFT_ROLE,
  TEST_STEP_DOWN_OPERATION_ID,
  TEST_STEP_DOWN_PARTITION_ID,
  TEST_STEP_DOWN_REPLICA_ID,
  TEST_STEP_DOWN_REASON,
  TEST_STEP_DOWN_TARGET_ELECTION_REASON,
  TEST_STEP_DOWN_CORRELATION_ID,
  TEST_STATUS_RETRY_PARTITION_ID,
  TEST_STATUS_RETRY_REPLICA_ID,
  TEST_STATUS_RETRY_OPERATION_ID,
  TEST_STATUS_RETRY_SERVICE_ID,
  TEST_STATUS_RETRY_SERVICE_ADDRESS,
  TEST_STATUS_RETRY_ERROR,
  TEST_ACTIVE_REPAIR_OPERATION_ID,
  TEST_ACTIVE_REPAIR_PARTITION_ID,
  TEST_ACTIVE_REPAIR_REPLICA_ID,
  TEST_ACTIVE_REPAIR_NODE_ID,
  TEST_REMOVE_DELETE_FAILURE_OPERATION_ID,
  TEST_REMOVE_DELETE_FAILURE_PARTITION_ID,
  TEST_REMOVE_DELETE_FAILURE_REPLICA_ID,
  TEST_REMOVE_DELETE_FAILURE_REASON,
  TEST_REMOVE_DELETE_FAILURE_MESSAGE,
  TEST_REMOVED_CLEANUP_OPERATION_ID,
  TEST_REMOVED_CLEANUP_PARTITION_ID,
  TEST_REMOVED_CLEANUP_REPLICA_ID,
  TEST_REMOVED_CLEANUP_REASON,
  TEST_REMOVED_CLEANUP_DEFERRED_ERROR,
  createMockCDCService,
  createMockPartitionServiceFactory,
  createSeededCache,
  createMetadataOnlyCache,
  createServiceOnlyCache,
  seedReplicaOperation,
  applyGatewayMutationToCache,
  waitForReplicaEvent,
  tempDir,
}) {
  t.test('handleCreateReplica - idempotent for same operationId', async (t) => {
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

    // Pre-populate in-progress operation
    handler.inProgressOperations.set('op-1', {
      type: ReplicaOperationMessageType.CREATE_REPLICA,
      replicaId: 'replica-1',
      partitionId: 'partition-1',
      startedAt: Date.now(),
    });

    const request = {
      operationId: 'op-1',
      partitionId: 'partition-1',
      replicaId: 'replica-1',
    };

    const response = await handler.handleCreateReplica(request);

    t.equal(response.status, ReplicaOperationResponseStatus.IN_PROGRESS,
      'in_progress');
    t.equal(response.operationId, 'op-1', 'operationId in response');

    handler.shutdown();
  });

  t.test('handleCreateReplica - retries metadata resolution during cache lag',
    async (t) => {
      const partitionId = 'partition-1';
      const replicaId = 'replica-1';
      const operationId = 'op-1';
      const tableId = 'table-1';
      const tableName = 'test_table';
      const cache = createServiceOnlyCache({partitionId});
      seedReplicaOperation(cache, operationId, {partitionId, replicaId});
      const mockCDC = createMockCDCService(cache);

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        cdcIntegrationService: mockCDC,
        systemTableCache: cache,
        createPartitionService: createMockPartitionServiceFactory(),
        dataDir: tempDir,
      });

      handler.initialize();
      const created = waitForReplicaEvent(
        handler,
        'replicaCreated',
        'replicaCreationFailed',
      );

      const delayedMetadataSeedTimer = setTimeout(() => {
        cache.applySystemTableChange(SYSTEM_TABLE_NAME.TABLES, 'INSERT', {
          table_id: tableId,
          table_name: tableName,
          schema_definition: JSON.stringify({
            columns: [{name: 'id', type: 'TEXT', primaryKey: true}],
          }),
        });
        cache.applySystemTableChange(SYSTEM_TABLE_NAME.PARTITIONS, 'INSERT', {
          partition_id: partitionId,
          table_id: tableId,
          partition_key_start: null,
          partition_key_end: null,
          leader_node_id: 'leader-node',
        });
      }, 50);
      t.teardown(() => clearTimeout(delayedMetadataSeedTimer));

      const response = await handler.handleCreateReplica({
        operationId,
        partitionId,
        replicaId,
      });
      t.equal(response.status, ReplicaOperationResponseStatus.INITIATED,
        'create request should be acknowledged');

      await created;

      const failedOperationUpdates = mockCDC.operations.filter((operation) =>
        operation.type === 'update' &&
        operation.tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS &&
        operation.data?.workflow_step === 'FAILED',
      );
      t.equal(failedOperationUpdates.length, 0,
        'replica operation should not fail during transient metadata lag');

      const serviceRow = cache.get(SYSTEM_TABLE_NAME.SERVICES, replicaId);
      t.equal(serviceRow?.status, ReplicaStatus.ACTIVE,
        'replica should become ACTIVE after delayed metadata propagation');

      handler.shutdown();
    });
  t.test(
    'handleCreateReplica - hydrates missing metadata from authoritative system table SQL',
    async (t) => {
      const partitionId = 'partition-1';
      const replicaId = 'replica-1';
      const operationId = 'op-1';
      const tableId = 'table-1';
      const tableName = 'test_table';
      const cache = createServiceOnlyCache({partitionId});
      seedReplicaOperation(cache, operationId, {partitionId, replicaId});
      const mockCDC = createMockCDCService(cache, {
        executeSQL: async (sql, params = []) => {
          if (String(sql).includes('FROM partitions') &&
              params[0] === partitionId) {
            return {
              success: true,
              rows: [{
                partition_id: partitionId,
                table_id: tableId,
                partition_key_start: null,
                partition_key_end: null,
                leader_node_id: 'leader-node',
              }],
            };
          }
          if (String(sql).includes('FROM tables') &&
              params[0] === tableId) {
            return {
              success: true,
              rows: [{
                table_id: tableId,
                table_name: tableName,
                schema_definition: JSON.stringify({
                  columns: [{name: 'id', type: 'TEXT', primaryKey: true}],
                }),
              }],
            };
          }
          if (String(sql).includes('FROM services') &&
              params[0] === partitionId) {
            return {
              success: true,
              rows: [{
                service_id: 'leader-replica',
                service_type: 'partition',
                partition_id: partitionId,
                node_id: 'leader-node',
                raft_role: 'leader',
                status: ReplicaStatus.ACTIVE,
                address: 'leader-node/partition/leader-replica',
                created_at: Date.now(),
                updated_at: Date.now(),
              }],
            };
          }
          return {success: true, rows: []};
        },
      });

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        cdcIntegrationService: mockCDC,
        systemTableCache: cache,
        createPartitionService: createMockPartitionServiceFactory(),
        dataDir: tempDir,
      });
      handler.syncTimeoutMs = 300;
      handler.initialize();

      const created = waitForReplicaEvent(
        handler,
        'replicaCreated',
        'replicaCreationFailed',
      );

      const response = await handler.handleCreateReplica({
        operationId,
        partitionId,
        replicaId,
      });
      t.equal(response.status, ReplicaOperationResponseStatus.INITIATED,
        'create request should be acknowledged');

      await created;

      const tableRow = cache.get(SYSTEM_TABLE_NAME.TABLES, tableId);
      t.notOk(tableRow,
        'authoritative metadata should stay on the handler path instead of mutating cache');
      const partitionRow = cache.get(SYSTEM_TABLE_NAME.PARTITIONS, partitionId);
      t.notOk(partitionRow,
        'partition metadata should not be patched directly into cache');

      const serviceRow = cache.get(SYSTEM_TABLE_NAME.SERVICES, replicaId);
      t.equal(serviceRow?.status, ReplicaStatus.ACTIVE,
        'replica should become ACTIVE after metadata hydration');

      const metadataQueries = mockCDC.operations.filter((operation) =>
        operation.type === 'executeSQL',
      );
      t.ok(metadataQueries.length >= 2,
        'handler should query authoritative system tables during metadata hydration');

      handler.shutdown();
    },
  );

  t.test(
    'handleCreateReplica - uses bootstrap metadata payload when cache rows ' +
      'have not propagated yet',
    async (t) => {
      const partitionId = 'partition-bootstrap';
      const replicaId = 'partition-bootstrap-r2';
      const operationId = 'op-bootstrap';
      const tableId = 'table-bootstrap';
      const tableName = 'split_bootstrap_events';
      const cache = new SystemTableCache();
      seedReplicaOperation(cache, operationId, {
        partitionId,
        replicaId,
        targetNodeId: 'test-node',
      });
      const mockCDC = createMockCDCService(cache);

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        cdcIntegrationService: mockCDC,
        systemTableCache: cache,
        createPartitionService: createMockPartitionServiceFactory(),
        dataDir: tempDir,
      });
      handler.syncTimeoutMs = 200;
      handler.initialize();

      const created = waitForReplicaEvent(
        handler,
        'replicaCreated',
        'replicaCreationFailed',
      );

      const response = await handler.handleCreateReplica({
        operationId,
        partitionId,
        replicaId,
        replicaIds: [
          'partition-bootstrap-r1',
          'partition-bootstrap-r2',
          'partition-bootstrap-r3',
        ],
        peerAddresses: [
          'node-a/partition/partition-bootstrap-r1',
          'test-node/partition/partition-bootstrap-r2',
          'node-c/partition/partition-bootstrap-r3',
        ],
        bootstrapTableMetadata: {
          table_id: tableId,
          table_name: tableName,
          schema_definition: JSON.stringify({
            columns: [{name: 'event_id', type: 'TEXT', primaryKey: true}],
          }),
        },
        bootstrapPartitionMetadata: {
          partition_id: partitionId,
          table_id: tableId,
          table_name: tableName,
          partition_key_start: null,
          partition_key_end: 'm',
          partition_version: 2,
          replica_count: 3,
          size_bytes: 0,
          leader_node_id: null,
          state: 'NORMAL',
          created_at: 100,
          updated_at: 100,
        },
      });
      t.equal(response.status, ReplicaOperationResponseStatus.INITIATED,
        'create request should be acknowledged');

      await created;

      const tableRow = cache.get(SYSTEM_TABLE_NAME.TABLES, tableId);
      t.notOk(tableRow,
        'bootstrap table metadata should remain operation-scoped');
      const partitionRow = cache.get(SYSTEM_TABLE_NAME.PARTITIONS, partitionId);
      t.notOk(partitionRow,
        'bootstrap partition metadata should not patch cache directly');

      const serviceRow = cache.get(SYSTEM_TABLE_NAME.SERVICES, replicaId);
      t.equal(serviceRow?.status, ReplicaStatus.ACTIVE,
        'replica should become ACTIVE from bootstrap metadata alone');

      const metadataQueries = mockCDC.operations.filter((operation) =>
        operation.type === 'executeSQL',
      );
      t.equal(metadataQueries.length, 0,
        'handler should not need authoritative metadata SQL when bootstrap metadata is provided');

      handler.shutdown();
    },
  );

  t.test('handleRemoveReplica - returns not_found for missing replica',
    async (t) => {
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

      const request = {
        operationId: 'op-1',
        partitionId: 'partition-1',
        replicaId: 'nonexistent-replica',
        reason: 'rebalancing',
      };

      const response = await handler.handleRemoveReplica(request);

      t.equal(response.status, ReplicaOperationResponseStatus.NOT_FOUND,
        'not_found');
      t.equal(response.replicaId, 'nonexistent-replica',
        'replicaId in response');

      handler.shutdown();
    });

  t.test('handleRemoveReplica never infers cleanup authority from a missing ' +
    'local replica',
    async (t) => {
      const TEST_MISSING_CLEANUP_OPERATION_ID =
        'missing-local-cleanup-op';
      const TEST_MISSING_CLEANUP_PARTITION_ID =
        'missing-local-cleanup-partition-1';
      const TEST_MISSING_CLEANUP_REPLICA_ID =
        'missing-local-cleanup-replica-1';
      const TEST_MISSING_CLEANUP_NODE_ID = 'test-node';
      const TEST_MISSING_CLEANUP_REASON = 'replace_source_removal';
      const TEST_MISSING_CLEANUP_SERVICE_TYPE = 'partition';
      const TEST_MISSING_CLEANUP_SERVICE_ADDRESS =
        TEST_MISSING_CLEANUP_NODE_ID + '/partition/' +
        TEST_MISSING_CLEANUP_REPLICA_ID;
      const cache = createSeededCache();
      cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
        service_id: TEST_MISSING_CLEANUP_REPLICA_ID,
        service_type: TEST_MISSING_CLEANUP_SERVICE_TYPE,
        partition_id: TEST_MISSING_CLEANUP_PARTITION_ID,
        node_id: TEST_MISSING_CLEANUP_NODE_ID,
        replica_id: TEST_MISSING_CLEANUP_REPLICA_ID,
        group_id: null,
        raft_role: RAFT_ROLE.FOLLOWER,
        status: ReplicaStatus.FAILED,
        address: TEST_MISSING_CLEANUP_SERVICE_ADDRESS,
        created_at: Date.now(),
        state_entered_at: Date.now(),
        updated_at: Date.now(),
      });
      const mockCDC = createMockCDCService(cache);
      const originalCacheGet = cache.get.bind(cache);
      cache.get = (tableName, key) => {
        if (
          tableName === SYSTEM_TABLE_NAME.SERVICES &&
          key === TEST_MISSING_CLEANUP_REPLICA_ID
        ) {
          return null;
        }
        return originalCacheGet(tableName, key);
      };

      const handler = new ReplicaHandler({
        nodeId: TEST_MISSING_CLEANUP_NODE_ID,
        dataDir: tempDir,
        systemTableCache: cache,
        cdcIntegrationService: mockCDC,
        createPartitionService: createMockPartitionServiceFactory(),
      });

      handler.initialize();
      let cleanupCalls = 0;
      handler.cleanupReplicaResources = async () => {
        cleanupCalls += 1;
      };

      const response = await handler.handleRemoveReplica({
        operationId: TEST_MISSING_CLEANUP_OPERATION_ID,
        partitionId: TEST_MISSING_CLEANUP_PARTITION_ID,
        replicaId: TEST_MISSING_CLEANUP_REPLICA_ID,
        reason: TEST_MISSING_CLEANUP_REASON,
      });

      t.equal(
        response.status,
        ReplicaOperationResponseStatus.NOT_FOUND,
        'missing local replica should keep the existing response contract',
      );
      t.equal(
        originalCacheGet(
          SYSTEM_TABLE_NAME.SERVICES,
          TEST_MISSING_CLEANUP_REPLICA_ID,
        )?.status,
        ReplicaStatus.FAILED,
        'missing local state cannot erase a durable FAILED row',
      );
      t.notOk(
        mockCDC.operations.some((op) =>
          op.type === 'delete' &&
          op.tableName === SYSTEM_TABLE_NAME.SERVICES &&
          op.whereClause?.service_id === TEST_MISSING_CLEANUP_REPLICA_ID &&
          op.whereClause?.service_type === TEST_MISSING_CLEANUP_SERVICE_TYPE &&
          op.whereClause?.partition_id ===
            TEST_MISSING_CLEANUP_PARTITION_ID &&
          op.whereClause?.node_id === TEST_MISSING_CLEANUP_NODE_ID,
        ),
        'missing local state cannot route an authoritative services-row delete',
      );
      t.equal(cleanupCalls, 0,
        'missing local state cannot authorize filesystem cleanup');

      handler.shutdown();
    });

  t.test(
    'handleRemoveReplica - rejects partition identity mismatch without ' +
    'touching local state',
    async (t) => {
      const cache = createSeededCache();
      seedReplicaOperation(cache, 'op-mismatch', {type: 'REMOVE'});
      const mockCDC = createMockCDCService(cache);

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        cdcIntegrationService: mockCDC,
        systemTableCache: cache,
        dataDir: tempDir,
        createPartitionService: createMockPartitionServiceFactory(),
      });

      handler.initialize();

      // Pre-populate a local replica whose recorded partition differs from
      // the removal request's partitionId.
      handler.localReplicas.set('replica-1', {
        replicaId: 'replica-1',
        partitionId: 'partition-1',
        status: ReplicaStatus.ACTIVE,
        service: {
          async shutdown() {},
        },
      });

      const response = await handler.handleRemoveReplica({
        operationId: 'op-mismatch',
        partitionId: 'partition-other',
        replicaId: 'replica-1',
        reason: 'rebalancing',
      });

      t.equal(response.status, ReplicaOperationResponseStatus.ERROR,
        'mismatched partitionId is rejected');
      t.ok(
        typeof response.error === 'string' &&
        response.error.includes('partition-1') &&
        response.error.includes('partition-other'),
        'error names both the local and requested partition',
      );

      const localReplica = handler.getLocalReplica('replica-1');
      t.equal(localReplica.status, ReplicaStatus.ACTIVE,
        'local replica status is untouched');
      t.equal(localReplica.partitionId, 'partition-1',
        'local replica metadata is untouched');
      t.notOk(
        mockCDC.operations.some((op) =>
          op.type === 'delete' &&
          op.tableName === SYSTEM_TABLE_NAME.SERVICES,
        ),
        'no services-row delete was attempted',
      );
      t.notOk(
        handler.inProgressOperations.has('op-mismatch'),
        'no removal operation was tracked',
      );

      handler.shutdown();
    },
  );

  t.test('handleRemoveReplica - returns initiated for existing replica',
    async (t) => {
      const cache = createSeededCache();
      cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
        service_id: 'replica-1',
        service_type: 'partition',
        partition_id: 'partition-1',
        node_id: 'test-node',
        replica_id: 'replica-1',
        group_id: null,
        status: ReplicaStatus.ACTIVE,
        address: 'test-node/partition/replica-1',
        created_at: 100,
        state_entered_at: 100,
        updated_at: 100,
      });
      seedReplicaOperation(cache, 'op-1', {type: 'REMOVE'});
      const mockCDC = createMockCDCService(cache);

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        cdcIntegrationService: mockCDC,
        systemTableCache: cache,
        dataDir: tempDir,
        createPartitionService: createMockPartitionServiceFactory(),
      });

      handler.initialize();

      const removed = waitForReplicaEvent(
        handler,
        'replicaRemoved',
        'replicaRemovalFailed',
      );

      // Create partition directory structure for cleanup
      const partitionDir = path.join(tempDir, 'partitions', 'partition-1');
      fs.mkdirSync(partitionDir, {recursive: true});

      // Pre-populate local replica
      handler.localReplicas.set('replica-1', {
        replicaId: 'replica-1',
        partitionId: 'partition-1',
        status: ReplicaStatus.ACTIVE,
        service: {
          async shutdown() {},
        },
      });

      const request = {
        operationId: 'op-1',
        partitionId: 'partition-1',
        replicaId: 'replica-1',
        reason: 'rebalancing',
      };

      const response = await handler.handleRemoveReplica(request);

      t.equal(response.status, ReplicaOperationResponseStatus.INITIATED,
        'initiated');
      t.equal(response.replicaId, 'replica-1', 'replicaId in response');
      t.equal(response.operationId, 'op-1', 'operationId in response');

      // Check local replica status updated
      const localReplica = handler.getLocalReplica('replica-1');
      t.equal(localReplica.status, ReplicaStatus.REMOVING, 'status is removing');

      await removed;

      handler.shutdown();
    });

  t.test('handleRemoveReplica finalizes local state tracking after durable delete',
    async (t) => {
      const cache = createSeededCache();
      cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
        service_id: 'replica-1',
        service_type: 'partition',
        partition_id: 'partition-1',
        node_id: 'test-node',
        replica_id: 'replica-1',
        group_id: null,
        status: ReplicaStatus.ACTIVE,
        address: 'test-node/partition/replica-1',
        created_at: 100,
        state_entered_at: 100,
        updated_at: 100,
      });
      seedReplicaOperation(cache, 'op-1', {type: 'REMOVE'});
      const mockCDC = createMockCDCService(cache);
      let nowValue = 1000;
      const replicaStateMachine = new ReplicaStateMachine({
        nodeId: 'test-node',
        cdcIntegrationService: mockCDC,
        removingTimeoutMs: 50,
        now: () => nowValue,
      });

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        cdcIntegrationService: mockCDC,
        systemTableCache: cache,
        dataDir: tempDir,
        createPartitionService: createMockPartitionServiceFactory(),
        replicaStateMachine,
      });

      handler.initialize();

      const removed = waitForReplicaEvent(
        handler,
        'replicaRemoved',
        'replicaRemovalFailed',
      );

      const partitionDir = path.join(tempDir, 'partitions', 'partition-1');
      fs.mkdirSync(partitionDir, {recursive: true});

      handler.localReplicas.set('replica-1', {
        replicaId: 'replica-1',
        partitionId: 'partition-1',
        status: ReplicaStatus.ACTIVE,
        service: {
          async shutdown() {},
        },
      });

      await handler.handleRemoveReplica({
        operationId: 'op-1',
        partitionId: 'partition-1',
        replicaId: 'replica-1',
        reason: 'rebalancing',
      });

      await removed;

      nowValue = 1200;
      t.equal(replicaStateMachine.checkTimeoutsNow(), 0,
        'durable removal should not later time out from the removing state');
      t.equal(replicaStateMachine.getState('replica-1'), null,
        'durably removed replicas should be cleared from local tracking');

      handler.shutdown();
    });

  t.test('handleRemoveReplica preserves local runtime when durable delete fails',
    async (t) => {
      const cache = createSeededCache();
      cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
        service_id: TEST_REMOVE_DELETE_FAILURE_REPLICA_ID,
        service_type: 'partition',
        partition_id: TEST_REMOVE_DELETE_FAILURE_PARTITION_ID,
        node_id: TEST_ACTIVE_REPAIR_NODE_ID,
        replica_id: TEST_REMOVE_DELETE_FAILURE_REPLICA_ID,
        group_id: null,
        raft_role: 'follower',
        status: ReplicaStatus.ACTIVE,
        address:
          `${TEST_ACTIVE_REPAIR_NODE_ID}/partition/` +
          `${TEST_REMOVE_DELETE_FAILURE_REPLICA_ID}`,
        created_at: Date.now(),
        state_entered_at: Date.now(),
        updated_at: Date.now(),
      });

      const mockCDC = createMockCDCService(cache);
      mockCDC.deleteSystemTableRow = async (tableName, whereClause) => {
        mockCDC.operations.push({type: 'delete', tableName, whereClause});
        throw new Error(TEST_REMOVE_DELETE_FAILURE_MESSAGE);
      };

      const handler = new ReplicaHandler({
        nodeId: TEST_ACTIVE_REPAIR_NODE_ID,
        dataDir: tempDir,
        systemTableCache: cache,
        cdcIntegrationService: mockCDC,
        createPartitionService: createMockPartitionServiceFactory(),
      });

      handler.initialize();

      let shutdownCalls = 0;
      const trackedService = {
        async shutdown() {
          shutdownCalls += 1;
        },
      };
      handler.localServices.set(
        TEST_REMOVE_DELETE_FAILURE_REPLICA_ID,
        trackedService,
      );
      handler.localReplicas.set(TEST_REMOVE_DELETE_FAILURE_REPLICA_ID, {
        replicaId: TEST_REMOVE_DELETE_FAILURE_REPLICA_ID,
        partitionId: TEST_REMOVE_DELETE_FAILURE_PARTITION_ID,
        status: ReplicaStatus.ACTIVE,
        service: trackedService,
      });

      const removalFailed = new Promise((resolve) => {
        handler.once('replicaRemovalFailed', resolve);
      });

      const response = await handler.handleRemoveReplica({
        operationId: TEST_REMOVE_DELETE_FAILURE_OPERATION_ID,
        partitionId: TEST_REMOVE_DELETE_FAILURE_PARTITION_ID,
        replicaId: TEST_REMOVE_DELETE_FAILURE_REPLICA_ID,
        reason: TEST_REMOVE_DELETE_FAILURE_REASON,
      });

      const failedEvent = await removalFailed;

      t.equal(response.status, ReplicaOperationResponseStatus.INITIATED,
        'remove request should still ACK immediately');
      t.equal(
        failedEvent.replicaId,
        TEST_REMOVE_DELETE_FAILURE_REPLICA_ID,
        'failure event should identify the stalled replica',
      );
      t.equal(shutdownCalls, 1,
        'runtime is stopped while the cleanup marker excludes recreation');
      t.ok(
        handler.localServices.has(TEST_REMOVE_DELETE_FAILURE_REPLICA_ID),
        'tracked service should remain available for retry',
      );
      t.ok(
        cache.get(
          SYSTEM_TABLE_NAME.SERVICES,
          TEST_REMOVE_DELETE_FAILURE_REPLICA_ID,
        ),
        'authoritative service row should remain until delete succeeds',
      );
      t.equal(
        cache.get(SYSTEM_TABLE_NAME.SERVICES,
          TEST_REMOVE_DELETE_FAILURE_REPLICA_ID)?.status,
        'cleanup_owned',
        'a release failure preserves durable cleanup ownership',
      );
      t.equal(
        handler.getLocalReplica(TEST_REMOVE_DELETE_FAILURE_REPLICA_ID)?.status,
        ReplicaStatus.REMOVING,
        'local lifecycle remains aligned with the durable removal intent',
      );

      handler.shutdown();
    });

  t.test('handleRemoveReplica - returns in_progress for removing replica',
    async (t) => {
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

      // Pre-populate local replica in removing state
      handler.localReplicas.set('replica-1', {
        replicaId: 'replica-1',
        partitionId: 'partition-1',
        status: ReplicaStatus.REMOVING,
      });
      handler.inProgressOperations.set('op-1', {
        type: ReplicaOperationMessageType.REMOVE_REPLICA,
        replicaId: 'replica-1',
        partitionId: 'partition-1',
        startedAt: Date.now(),
      });

      const request = {
        operationId: 'op-1',
        partitionId: 'partition-1',
        replicaId: 'replica-1',
        reason: 'rebalancing',
      };

      const response = await handler.handleRemoveReplica(request);

      t.equal(response.status, ReplicaOperationResponseStatus.IN_PROGRESS,
        'in_progress');
      t.equal(response.replicaId, 'replica-1', 'replicaId in response');

      handler.shutdown();
    });

  t.test('handleRemoveReplica - resumes stalled removing replica',
    async (t) => {
      const TEST_STALLED_REMOVE_OPERATION_ID = 'op-resume-removing';
      const TEST_STALLED_REMOVE_PARTITION_ID = 'partition-resume-removing';
      const TEST_STALLED_REMOVE_REPLICA_ID = 'replica-resume-removing';
      const TEST_STALLED_REMOVE_NODE_ID = 'test-node';
      const TEST_STALLED_REMOVE_REASON = 'rebalancing';
      const TEST_STALLED_REMOVE_ADDRESS =
        TEST_STALLED_REMOVE_NODE_ID + '/partition/' +
        TEST_STALLED_REMOVE_REPLICA_ID;
      const cache = createSeededCache();
      seedReplicaOperation(cache, TEST_STALLED_REMOVE_OPERATION_ID, {
        type: OperationType.REMOVE,
        partitionId: TEST_STALLED_REMOVE_PARTITION_ID,
        replicaId: TEST_STALLED_REMOVE_REPLICA_ID,
      });
      cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
        service_id: TEST_STALLED_REMOVE_REPLICA_ID,
        service_type: 'partition',
        partition_id: TEST_STALLED_REMOVE_PARTITION_ID,
        node_id: TEST_STALLED_REMOVE_NODE_ID,
        replica_id: TEST_STALLED_REMOVE_REPLICA_ID,
        group_id: null,
        raft_role: RAFT_ROLE.FOLLOWER,
        status: ReplicaStatus.REMOVING,
        address: TEST_STALLED_REMOVE_ADDRESS,
        created_at: Date.now(),
        state_entered_at: Date.now(),
        updated_at: Date.now(),
      });
      const mockCDC = createMockCDCService(cache);

      const handler = new ReplicaHandler({
        nodeId: TEST_STALLED_REMOVE_NODE_ID,
        dataDir: tempDir,
        systemTableCache: cache,
        cdcIntegrationService: mockCDC,
        createPartitionService: createMockPartitionServiceFactory(),
      });

      handler.initialize();
      handler.localReplicas.set(TEST_STALLED_REMOVE_REPLICA_ID, {
        replicaId: TEST_STALLED_REMOVE_REPLICA_ID,
        partitionId: TEST_STALLED_REMOVE_PARTITION_ID,
        status: ReplicaStatus.REMOVING,
        service: {
          async shutdown() {},
        },
      });

      const removed = waitForReplicaEvent(
        handler,
        'replicaRemoved',
        'replicaRemovalFailed',
      );
      const response = await handler.handleRemoveReplica({
        operationId: TEST_STALLED_REMOVE_OPERATION_ID,
        partitionId: TEST_STALLED_REMOVE_PARTITION_ID,
        replicaId: TEST_STALLED_REMOVE_REPLICA_ID,
        reason: TEST_STALLED_REMOVE_REASON,
      });
      await removed;

      t.equal(
        response.status,
        ReplicaOperationResponseStatus.IN_PROGRESS,
        'stalled removing replay should preserve idempotent response shape',
      );
      t.equal(
        handler.inProgressOperations.size,
        0,
        'resumed removal should clear operation tracking after completion',
      );
      t.ok(
        mockCDC.operations.some(
          (operation) =>
            operation.type === 'delete' &&
            operation.tableName === SYSTEM_TABLE_NAME.SERVICES,
        ),
        'resumed removal should delete the durable service row',
      );
      t.notOk(
        mockCDC.operations.some(
          (operation) =>
            operation.type === 'update' &&
            operation.data.status === ReplicaStatus.REMOVING,
        ),
        'resumed removal should not replay an invalid removing transition',
      );

      handler.shutdown();
    });

  t.test('handleRemoveReplica - returns completed for removed replica',
    async (t) => {
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

      // Pre-populate local replica in removed state
      handler.localReplicas.set('replica-1', {
        replicaId: 'replica-1',
        partitionId: 'partition-1',
        status: ReplicaStatus.REMOVED,
      });

      const request = {
        operationId: 'op-1',
        partitionId: 'partition-1',
        replicaId: 'replica-1',
        reason: 'rebalancing',
      };

      const response = await handler.handleRemoveReplica(request);

      t.equal(response.status, ReplicaOperationResponseStatus.ERROR,
        'generationless local terminal state fails closed');
      t.equal(response.replicaId, 'replica-1', 'replicaId in response');

      handler.shutdown();
    });

  t.test('handleRemoveReplica refuses generationless removed cache miss cleanup',
    async (t) => {
      const TEST_CACHE_MISS_REMOVED_OPERATION_ID =
        'removed-cache-miss-cleanup-op';
      const TEST_CACHE_MISS_REMOVED_PARTITION_ID =
        'removed-cache-miss-partition-1';
      const TEST_CACHE_MISS_REMOVED_REPLICA_ID =
        'removed-cache-miss-replica-1';
      const TEST_CACHE_MISS_REMOVED_NODE_ID = 'test-node';
      const TEST_CACHE_MISS_REMOVED_REASON = 'replace_source_removal';
      const cache = createSeededCache();
      const mockCDC = createMockCDCService(cache);

      const handler = new ReplicaHandler({
        nodeId: TEST_CACHE_MISS_REMOVED_NODE_ID,
        dataDir: tempDir,
        systemTableCache: cache,
        cdcIntegrationService: mockCDC,
        createPartitionService: createMockPartitionServiceFactory(),
      });

      handler.initialize();
      handler.localReplicas.set(TEST_CACHE_MISS_REMOVED_REPLICA_ID, {
        replicaId: TEST_CACHE_MISS_REMOVED_REPLICA_ID,
        partitionId: TEST_CACHE_MISS_REMOVED_PARTITION_ID,
        status: ReplicaStatus.REMOVED,
      });

      const response = await handler.handleRemoveReplica({
        operationId: TEST_CACHE_MISS_REMOVED_OPERATION_ID,
        partitionId: TEST_CACHE_MISS_REMOVED_PARTITION_ID,
        replicaId: TEST_CACHE_MISS_REMOVED_REPLICA_ID,
        reason: TEST_CACHE_MISS_REMOVED_REASON,
      });

      t.equal(
        response.status,
        ReplicaOperationResponseStatus.ERROR,
        'generic absence cannot prove deletion of a particular generation',
      );
      t.notOk(
        mockCDC.operations.some((op) =>
          op.type === 'delete' &&
          op.tableName === SYSTEM_TABLE_NAME.SERVICES &&
          op.whereClause?.service_id === TEST_CACHE_MISS_REMOVED_REPLICA_ID &&
          op.whereClause?.service_type === 'partition' &&
          op.whereClause?.partition_id === TEST_CACHE_MISS_REMOVED_PARTITION_ID &&
          op.whereClause?.node_id === TEST_CACHE_MISS_REMOVED_NODE_ID,
        ),
        'generationless absence cannot authorize a services-row delete',
      );

      handler.shutdown();
    });

  t.test('handleRemoveReplica refuses local REMOVED cleanup when the durable ' +
    'row is still ACTIVE',
    async (t) => {
      const cache = createSeededCache();
      cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
        service_id: TEST_REMOVED_CLEANUP_REPLICA_ID,
        service_type: 'partition',
        partition_id: TEST_REMOVED_CLEANUP_PARTITION_ID,
        node_id: TEST_ACTIVE_REPAIR_NODE_ID,
        replica_id: TEST_REMOVED_CLEANUP_REPLICA_ID,
        group_id: null,
        raft_role: 'follower',
        status: ReplicaStatus.ACTIVE,
        address:
          `${TEST_ACTIVE_REPAIR_NODE_ID}/partition/` +
          `${TEST_REMOVED_CLEANUP_REPLICA_ID}`,
        created_at: Date.now(),
        state_entered_at: Date.now(),
        updated_at: Date.now(),
      });
      const mockCDC = createMockCDCService(cache);

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        dataDir: tempDir,
        systemTableCache: cache,
        cdcIntegrationService: mockCDC,
        createPartitionService: createMockPartitionServiceFactory(),
      });

      handler.initialize();
      let shutdownCalls = 0;
      const trackedService = {
        async shutdown() {
          shutdownCalls += 1;
        },
      };
      handler.localReplicas.set(TEST_REMOVED_CLEANUP_REPLICA_ID, {
        replicaId: TEST_REMOVED_CLEANUP_REPLICA_ID,
        partitionId: TEST_REMOVED_CLEANUP_PARTITION_ID,
        status: ReplicaStatus.REMOVED,
        service: trackedService,
      });
      handler.localServices.set(TEST_REMOVED_CLEANUP_REPLICA_ID, trackedService);

      const response = await handler.handleRemoveReplica({
        operationId: TEST_REMOVED_CLEANUP_OPERATION_ID,
        partitionId: TEST_REMOVED_CLEANUP_PARTITION_ID,
        replicaId: TEST_REMOVED_CLEANUP_REPLICA_ID,
        reason: TEST_REMOVED_CLEANUP_REASON,
      });

      t.equal(response.status, ReplicaOperationResponseStatus.ERROR,
        'handler-local terminal status cannot override durable ACTIVE');
      t.ok(cache.get(
        SYSTEM_TABLE_NAME.SERVICES,
        TEST_REMOVED_CLEANUP_REPLICA_ID,
      ), 'the non-removing durable row remains authoritative');
      t.equal(shutdownCalls, 0,
        'runtime cleanup is fenced without durable REMOVING authority');
      t.ok(handler.localServices.has(TEST_REMOVED_CLEANUP_REPLICA_ID),
        'the tracked service remains available for a valid removal redrive');
      t.notOk(
        mockCDC.operations.some((op) =>
          op.type === 'delete' &&
          op.tableName === SYSTEM_TABLE_NAME.SERVICES &&
          op.whereClause?.service_id === TEST_REMOVED_CLEANUP_REPLICA_ID &&
          op.whereClause?.service_type === 'partition' &&
          op.whereClause?.partition_id === TEST_REMOVED_CLEANUP_PARTITION_ID &&
          op.whereClause?.node_id === TEST_ACTIVE_REPAIR_NODE_ID,
        ),
        'no services-row delete may bypass durable REMOVING',
      );

      handler.shutdown();
    });

  t.test('handleRemoveReplica keeps durable removal unambiguous when local cleanup is deferred',
    async (t) => {
      const cache = createSeededCache();
      cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
        service_id: TEST_REMOVED_CLEANUP_REPLICA_ID,
        service_type: 'partition',
        partition_id: TEST_REMOVED_CLEANUP_PARTITION_ID,
        node_id: TEST_ACTIVE_REPAIR_NODE_ID,
        replica_id: TEST_REMOVED_CLEANUP_REPLICA_ID,
        group_id: null,
        raft_role: 'follower',
        status: ReplicaStatus.ACTIVE,
        address:
          `${TEST_ACTIVE_REPAIR_NODE_ID}/partition/` +
          `${TEST_REMOVED_CLEANUP_REPLICA_ID}`,
        created_at: Date.now(),
        state_entered_at: Date.now(),
        updated_at: Date.now(),
      });
      const mockCDC = createMockCDCService(cache);
      const handler = new ReplicaHandler({
        nodeId: TEST_ACTIVE_REPAIR_NODE_ID,
        dataDir: tempDir,
        systemTableCache: cache,
        cdcIntegrationService: mockCDC,
        createPartitionService: createMockPartitionServiceFactory(),
      });

      handler.initialize();
      let shutdownCalls = 0;
      const trackedService = {
        async shutdown() {
          shutdownCalls += 1;
        },
      };
      handler.cleanupReplicaResources = async () => {
        throw new Error(TEST_REMOVED_CLEANUP_DEFERRED_ERROR);
      };
      handler.localServices.set(
        TEST_REMOVED_CLEANUP_REPLICA_ID,
        trackedService,
      );
      handler.localReplicas.set(TEST_REMOVED_CLEANUP_REPLICA_ID, {
        replicaId: TEST_REMOVED_CLEANUP_REPLICA_ID,
        partitionId: TEST_REMOVED_CLEANUP_PARTITION_ID,
        status: ReplicaStatus.ACTIVE,
        service: trackedService,
      });

      const removalFailed = new Promise((resolve) => {
        handler.once('replicaRemovalFailed', resolve);
      });

      const response = await handler.handleRemoveReplica({
        operationId: TEST_REMOVED_CLEANUP_OPERATION_ID,
        partitionId: TEST_REMOVED_CLEANUP_PARTITION_ID,
        replicaId: TEST_REMOVED_CLEANUP_REPLICA_ID,
        reason: TEST_REMOVED_CLEANUP_REASON,
      });
      await removalFailed;

      t.equal(
        response.status,
        ReplicaOperationResponseStatus.INITIATED,
        'remove request should still ACK before deferred cleanup replay',
      );
      t.equal(
        shutdownCalls,
        1,
        'durable removal should still attempt one local runtime shutdown',
      );
      t.equal(cache.get(
        SYSTEM_TABLE_NAME.SERVICES,
        TEST_REMOVED_CLEANUP_REPLICA_ID,
      )?.status, 'cleanup_owned',
      'durable marker remains until cleanup positively completes');
      t.equal(
        handler.getLocalReplica(TEST_REMOVED_CLEANUP_REPLICA_ID)?.status,
        ReplicaStatus.REMOVING,
        'local state cannot terminalize while durable cleanup is incomplete',
      );
      t.equal(
        handler.getLocalReplica(TEST_REMOVED_CLEANUP_REPLICA_ID)?.service,
        trackedService,
        'local runtime should be retained for replayable cleanup instead of making truth ambiguous',
      );
      t.ok(
        handler.localServices.has(TEST_REMOVED_CLEANUP_REPLICA_ID),
        'tracked runtime should remain available for later cleanup reconciliation',
      );

      handler.shutdown();
    });


  await registerReplicaHandlerTailMoreTests({
    t,
    fs,
    path,
    os,
    ReplicaHandler,
    OperationType,
    ReplicaStatus,
    SYSTEM_TABLE_NAME,
    SystemTableCache,
    ConfigurationManager,
    LoggingService,
    ReplicaStateMachine,
    SERVICE_STATUS,
    WORKFLOW_STEP,
    ReplicaOperationField,
    ReplicaOperationMessageType,
    ReplicaOperationResponseStatus,
    RAFT_ROLE,
    TEST_STEP_DOWN_OPERATION_ID,
    TEST_STEP_DOWN_PARTITION_ID,
    TEST_STEP_DOWN_REPLICA_ID,
    TEST_STEP_DOWN_REASON,
    TEST_STEP_DOWN_TARGET_ELECTION_REASON,
    TEST_STEP_DOWN_CORRELATION_ID,
    TEST_STATUS_RETRY_PARTITION_ID,
    TEST_STATUS_RETRY_REPLICA_ID,
    TEST_STATUS_RETRY_OPERATION_ID,
    TEST_STATUS_RETRY_SERVICE_ID,
    TEST_STATUS_RETRY_SERVICE_ADDRESS,
    TEST_STATUS_RETRY_ERROR,
    TEST_ACTIVE_REPAIR_OPERATION_ID,
    TEST_ACTIVE_REPAIR_PARTITION_ID,
    TEST_ACTIVE_REPAIR_REPLICA_ID,
    TEST_ACTIVE_REPAIR_NODE_ID,
    TEST_REMOVE_DELETE_FAILURE_OPERATION_ID,
    TEST_REMOVE_DELETE_FAILURE_PARTITION_ID,
    TEST_REMOVE_DELETE_FAILURE_REPLICA_ID,
    TEST_REMOVE_DELETE_FAILURE_REASON,
    TEST_REMOVE_DELETE_FAILURE_MESSAGE,
    TEST_REMOVED_CLEANUP_OPERATION_ID,
    TEST_REMOVED_CLEANUP_PARTITION_ID,
    TEST_REMOVED_CLEANUP_REPLICA_ID,
    TEST_REMOVED_CLEANUP_REASON,
    TEST_REMOVED_CLEANUP_DEFERRED_ERROR,
    createMockCDCService,
    createMockPartitionServiceFactory,
    createSeededCache,
    createMetadataOnlyCache,
    createServiceOnlyCache,
    seedReplicaOperation,
    applyGatewayMutationToCache,
    waitForReplicaEvent,
    tempDir,
  });
}
