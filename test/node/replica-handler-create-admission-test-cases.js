import {
  createLifecycleControlPlaneGatewayForCache,
  createReplicaLifecycleStateMachineFixture,
} from '../test-helpers/lifecycle-state-store.js';
import {bindRegisteredReplicaHandler} from
  '../test-helpers/replica-handler-identity-fixture.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {ReplicaOperationField} from
  '../../src/rebalancer/replica-operation-constants.js';
import {
  buildReplicaCreateAdmissionToken,
  buildReplicaCreateAttemptToken,
} from '../../src/rebalancer/replica-create-admission-token.js';

const TEST_INITIAL_STATUS_RETRY_OPERATION_ID =
  'op-initial-create-status-retry';
const TEST_INITIAL_STATUS_RETRY_REPLICA_ID =
  'replica-initial-create-status-retry';
const TEST_INITIAL_STATUS_RETRY_PARTITION_ID = 'partition-1';
const TEST_INITIAL_STATUS_RETRY_ERROR =
  'Distributed operation failed due to participant failures';
const TEST_INITIAL_STATUS_RETRY_ERROR_CODE =
  'DISTRIBUTED_PARTICIPANT_FAILURE';
const TEST_INITIAL_STATUS_RETRY_AFTER_MS = 1;
const TEST_PRIORITY_CREATE_STATUS_OPERATION_ID =
  'op-priority-create-status-fallback';
const TEST_PRIORITY_CREATE_STATUS_PARTITION_ID = 'replica_operations-p1';
const TEST_PRIORITY_CREATE_STATUS_REPLICA_ID = 'replica_operations-p1-r4';

export async function registerReplicaHandlerCreateAdmissionTests({
  t,
  ReplicaHandler,
  ReplicaStatus,
  ReplicaStateMachine,
  SYSTEM_TABLE_NAME,
  createMockCDCService,
  createSeededCache,
  createMetadataOnlyCache,
  seedReplicaOperation,
  waitForReplicaEvent,
  getTempDir,
  ReplicaOperationResponseStatus,
}) {
  t.test(
    'two same-boot handlers share one admission lane and physical worker',
    async (t) => {
      const cache = createSeededCache();
      seedReplicaOperation(cache, 'op-shared-handler', {
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
      const operationRow = structuredClone(cache.get(
        SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        'op-shared-handler',
      ));
      const lifecycleGateway = createLifecycleControlPlaneGatewayForCache(
        cache,
      );
      const matches = (row, where) => Object.entries(where).every(
        ([field, value]) => row?.[field] === value,
      );
      const gateway = {
        async readAuthoritativeRows(tableName, sql, params) {
          if (tableName === SYSTEM_TABLE_NAME.NODES) {
            return {success: true, rows: [{
              node_id: 'test-node',
              boot_incarnation: 101,
            }]};
          }
          if (tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) {
            if (sql.includes('WHERE operation_id = ?')) {
              return {success: true, rows:
                operationRow.operation_id === params[0] ? [operationRow] : []};
            }
            if (params.length === 1) {
              return {success: true, rows:
                operationRow.target_node_id === params[0] &&
                operationRow.create_admission_state ? [operationRow] : []};
            }
            return {success: true, rows:
              operationRow.replica_id === params[0] &&
                operationRow.target_node_id === params[1] ?
                [operationRow] : []};
          }
          return lifecycleGateway.readAuthoritativeRows(
            tableName,
            sql,
            params,
          );
        },
        async updateSystemTableRow(tableName, where, data) {
          if (tableName !== SYSTEM_TABLE_NAME.REPLICA_OPERATIONS ||
              !matches(operationRow, where)) {
            return {success: true, outcome: 'no_op'};
          }
          Object.assign(operationRow, data);
          return {success: true, outcome: 'applied'};
        },
        submitMutation: lifecycleGateway.submitMutation,
      };
      const mockCDC = createMockCDCService(cache);
      let physicalStarts = 0;
      let releasePhysicalStart;
      const physicalStartGate = new Promise((resolve) => {
        releasePhysicalStart = resolve;
      });
      const createPartitionService = async (options) => {
        physicalStarts += 1;
        await physicalStartGate;
        return bindRegisteredReplicaHandler({
          partitionId: options.partitionId,
          replicaId: options.replicaId,
          initialized: true,
          role: 'follower',
          async shutdown() {},
          async syncFromLeader() {},
        }, options);
      };
      const makeHandler = () => new ReplicaHandler({
        nodeId: 'test-node',
        ownerIncarnation: 101,
        cdcIntegrationService: mockCDC,
        controlPlaneSystemTableGateway: gateway,
        systemTableCache: cache,
        createPartitionService,
        dataDir: getTempDir(),
      });
      const first = makeHandler();
      const second = makeHandler();
      const completed = new Promise((resolve, reject) => {
        for (const handler of [first, second]) {
          handler.once('replicaCreated', resolve);
          handler.once('replicaCreationFailed', (event) => {
            reject(new Error(event?.error || 'replica creation failed'));
          });
        }
      });
      first.initialize();
      second.initialize();
      await Promise.all([
        first.awaitReplicaCreateAdmissionRecoveryBarrier(),
        second.awaitReplicaCreateAdmissionRecoveryBarrier(),
      ]);
      const workflowUpdatedAt = operationRow.updated_at;
      const admissionToken = buildReplicaCreateAdmissionToken({
        operationId: operationRow.operation_id,
        replicaId: operationRow.replica_id,
        targetNodeId: operationRow.target_node_id,
        workflowUpdatedAt,
      });
      const request = {
        [ReplicaOperationField.OPERATION_ID]: operationRow.operation_id,
        [ReplicaOperationField.OPERATION_TYPE]: OperationType.ADD,
        [ReplicaOperationField.ENTITY_TYPE]: operationRow.entity_type,
        [ReplicaOperationField.ENTITY_ID]: operationRow.entity_id,
        [ReplicaOperationField.PARTITION_ID]: operationRow.partition_id,
        [ReplicaOperationField.REPLICA_ID]: operationRow.replica_id,
        [ReplicaOperationField.CREATE_ADMISSION_TOKEN]: admissionToken,
        [ReplicaOperationField.CREATE_ADMISSION_WORKFLOW_UPDATED_AT]:
          workflowUpdatedAt,
        [ReplicaOperationField.CREATE_ADMISSION_ATTEMPT_TOKEN]:
          buildReplicaCreateAttemptToken(admissionToken, 1),
        [ReplicaOperationField.CREATE_ADMISSION_ATTEMPT_SEQ]: 1,
      };
      const responses = await Promise.all([
        first.handleCreateReplica(request),
        second.handleCreateReplica(request),
      ]);
      for (let turn = 0; physicalStarts === 0 && turn < 20; turn += 1) {
        await new Promise((resolve) => setImmediate(resolve));
      }
      t.equal(physicalStarts, 1, 'one physical partition factory starts');
      t.same(
        responses.map((response) => response.status).sort(),
        [
          ReplicaOperationResponseStatus.INITIATED,
          ReplicaOperationResponseStatus.IN_PROGRESS,
        ].sort(),
        'duplicate handler joins the admitted in-progress work',
      );
      operationRow.completed_at = workflowUpdatedAt + 1;
      releasePhysicalStart();
      await completed;
      t.equal(
        operationRow.create_admission_state,
        'ACTIVE',
        'admission-first work reaches ACTIVE after ordinary terminal settlement',
      );
      await Promise.all([first.shutdown(), second.shutdown()]);
    },
  );

  t.test(
    'handleCreateReplica - wins durable admission before ACK or runtime open',
    async (t) => {
      const cache = createSeededCache();
      seedReplicaOperation(cache, 'op-slow-pending');
      const mockCDC = createMockCDCService(cache);
      let releasePendingStatus = null;
      let pendingStatusStarted = false;
      const createdReplicaIds = [];

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        cdcIntegrationService: mockCDC,
        systemTableCache: cache,
        createPartitionService: async (options) => {
          createdReplicaIds.push(options.replicaId);
          return bindRegisteredReplicaHandler({
            partitionId: options.partitionId,
            replicaId: options.replicaId,
            initialized: true,
            role: 'follower',
            async shutdown() {},
            async syncFromLeader() {},
          }, options);
        },
        replicaStateMachine: createReplicaLifecycleStateMachineFixture({
          async transition(replicaId, newStatus) {
            if (replicaId === 'replica-slow' &&
                newStatus === ReplicaStatus.PENDING) {
              pendingStatusStarted = true;
              await new Promise((resolve) => {
                releasePendingStatus = resolve;
              });
            }
          },
        }),
        dataDir: getTempDir(),
      });

      handler.initialize();

      const responsePromise = handler.handleCreateReplica({
        operationId: 'op-slow-pending',
        partitionId: 'partition-1',
        replicaId: 'replica-slow',
      });

      let responseSettled = false;
      responsePromise.finally(() => {
        responseSettled = true;
      });
      t.same(
        createdReplicaIds,
        [],
        'replica creation should not begin before pending persistence is released',
      );

      await new Promise((resolve) => setImmediate(resolve));
      t.equal(
        pendingStatusStarted,
        true,
        'durable insert admission begins before the response settles',
      );
      t.equal(responseSettled, false,
        'CREATE_REPLICA does not ACK before durable identity admission');
      t.type(
        releasePendingStatus,
        'function',
        'pending admission exposes the deterministic release gate',
      );

      const created = waitForReplicaEvent(
        handler,
        'replicaCreated',
        'replicaCreationFailed',
      );
      releasePendingStatus();
      const response = await responsePromise;
      t.equal(
        response.status,
        ReplicaOperationResponseStatus.INITIATED,
        'ACK follows durable ownership admission',
      );
      await created;

      t.same(
        createdReplicaIds,
        ['replica-slow'],
        'replica creation should continue after pending persistence completes',
      );

      await handler.shutdown();
    },
  );

  t.test(
    'handleCreateReplica - retries retryable initial status persistence ' +
    'before creating replica',
    async (t) => {
      const cache = createSeededCache();
      seedReplicaOperation(cache, TEST_INITIAL_STATUS_RETRY_OPERATION_ID);
      const mockCDC = createMockCDCService(cache);
      const createdReplicaIds = [];
      const transitions = [];
      let pendingAttempts = 0;

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        cdcIntegrationService: mockCDC,
        systemTableCache: cache,
        createPartitionService: async (options) => {
          createdReplicaIds.push(options.replicaId);
          return bindRegisteredReplicaHandler({
            partitionId: options.partitionId,
            replicaId: options.replicaId,
            initialized: true,
            async shutdown() {},
            async syncFromLeader() {},
          }, options);
        },
        replicaStateMachine: createReplicaLifecycleStateMachineFixture({
          async transition(replicaId, newStatus) {
            transitions.push({replicaId, newStatus});
            if (
              replicaId === TEST_INITIAL_STATUS_RETRY_REPLICA_ID &&
              newStatus === ReplicaStatus.PENDING &&
              pendingAttempts === 0
            ) {
              pendingAttempts += 1;
              const error = new Error(TEST_INITIAL_STATUS_RETRY_ERROR);
              error.code = TEST_INITIAL_STATUS_RETRY_ERROR_CODE;
              error.errorCode = TEST_INITIAL_STATUS_RETRY_ERROR_CODE;
              error.deferRetry = true;
              error.retryAfterMs = TEST_INITIAL_STATUS_RETRY_AFTER_MS;
              throw error;
            }
            if (newStatus === ReplicaStatus.PENDING) {
              pendingAttempts += 1;
            }
          },
        }),
        dataDir: getTempDir(),
      });

      handler.initialize();

      const created = waitForReplicaEvent(
        handler,
        'replicaCreated',
        'replicaCreationFailed',
      );

      const response = await handler.handleCreateReplica({
        operationId: TEST_INITIAL_STATUS_RETRY_OPERATION_ID,
        partitionId: TEST_INITIAL_STATUS_RETRY_PARTITION_ID,
        replicaId: TEST_INITIAL_STATUS_RETRY_REPLICA_ID,
      });

      t.equal(
        response.status,
        ReplicaOperationResponseStatus.INITIATED,
        'CREATE_REPLICA should still ACK before initial status retry drains',
      );

      await created;

      t.same(
        createdReplicaIds,
        [TEST_INITIAL_STATUS_RETRY_REPLICA_ID],
        'replica creation should continue after retryable initial status pressure',
      );
      t.same(
        transitions
          .filter((transition) =>
            transition.replicaId === TEST_INITIAL_STATUS_RETRY_REPLICA_ID,
          )
          .map((transition) => transition.newStatus),
        [
          ReplicaStatus.PENDING,
          ReplicaStatus.PENDING,
          ReplicaStatus.CREATING,
          ReplicaStatus.SYNCING,
          ReplicaStatus.ACTIVE,
        ],
        'initial PENDING should retry before CREATING/SYNCING/ACTIVE progress',
      );

      await handler.shutdown();
    },
  );

  t.test(
    'handleCreateReplica - priority control-plane create starts before ' +
    'durable lifecycle status writes',
    async (t) => {
      const cache = createSeededCache({
        tableId: 'replica_operations',
        tableName: 'replica_operations',
        partitionId: TEST_PRIORITY_CREATE_STATUS_PARTITION_ID,
      });
      seedReplicaOperation(
        cache,
        TEST_PRIORITY_CREATE_STATUS_OPERATION_ID,
        {
          partitionId: TEST_PRIORITY_CREATE_STATUS_PARTITION_ID,
          replicaId: TEST_PRIORITY_CREATE_STATUS_REPLICA_ID,
        },
      );
      const mockCDC = createMockCDCService(cache);
      let creatingWriteCount = 0;
      const serviceMutationOperations = [];
      const replicaStateMachine = new ReplicaStateMachine({
        nodeId: 'test-node',
        systemTableCache: cache,
        controlPlaneSystemTableGateway:
          createLifecycleControlPlaneGatewayForCache(cache, {
            beforeMutation(mutation) {
              if (mutation.tableName === SYSTEM_TABLE_NAME.SERVICES) {
                serviceMutationOperations.push({
                  operation: mutation.operation,
                  status: mutation.row?.status || mutation.data?.status || null,
                });
              }
              if (
                mutation.tableName === SYSTEM_TABLE_NAME.SERVICES &&
              mutation.operation === 'update' &&
              mutation.data?.status === ReplicaStatus.CREATING
              ) {
                creatingWriteCount += 1;
              }
            },
            afterMutation(mutation) {
              if (mutation.tableName !== SYSTEM_TABLE_NAME.SERVICES ||
                  mutation.operation !== 'update' ||
                  mutation.data?.status !== ReplicaStatus.CREATING) {
                return;
              }
              const error = new Error(TEST_INITIAL_STATUS_RETRY_ERROR);
              error.code = TEST_INITIAL_STATUS_RETRY_ERROR_CODE;
              error.errorCode = TEST_INITIAL_STATUS_RETRY_ERROR_CODE;
              error.deferRetry = true;
              error.retryAfterMs = TEST_INITIAL_STATUS_RETRY_AFTER_MS;
              throw error;
            },
          }),
      });
      let handler = null;
      const createdReplicaIds = [];
      let localStatusAtFactory = null;
      let stateMachineStatusAtFactory = null;
      let deferCdcPropagationHandshakeAtFactory = null;
      handler = new ReplicaHandler({
        nodeId: 'test-node',
        cdcIntegrationService: mockCDC,
        systemTableCache: cache,
        replicaStateMachine,
        createPartitionService: async (options) => {
          createdReplicaIds.push(options.replicaId);
          deferCdcPropagationHandshakeAtFactory =
            options.deferCdcPropagationHandshake;
          localStatusAtFactory =
            handler.getLocalReplica(options.replicaId)?.status || null;
          stateMachineStatusAtFactory =
            replicaStateMachine.getState(options.replicaId)?.state || null;
          return bindRegisteredReplicaHandler({
            partitionId: options.partitionId,
            replicaId: options.replicaId,
            initialized: true,
            async shutdown() {},
            async syncFromLeader() {},
          }, options);
        },
        dataDir: getTempDir(),
      });

      handler.initialize();

      const created = waitForReplicaEvent(
        handler,
        'replicaCreated',
        'replicaCreationFailed',
      );

      const response = await handler.handleCreateReplica({
        operationId: TEST_PRIORITY_CREATE_STATUS_OPERATION_ID,
        operationType: 'REMOVE',
        partitionId: TEST_PRIORITY_CREATE_STATUS_PARTITION_ID,
        replicaId: TEST_PRIORITY_CREATE_STATUS_REPLICA_ID,
      });

      t.equal(
        response.status,
        ReplicaOperationResponseStatus.INITIATED,
        'CREATE_REPLICA should ACK before durable lifecycle status drains',
      );

      await created;

      t.equal(
        creatingWriteCount,
        1,
        'priority create wins durable identity before local CREATING fallback',
      );
      t.same(
        serviceMutationOperations
          .filter((mutation) =>
            mutation.status === ReplicaStatus.SYNCING ||
            mutation.status === ReplicaStatus.ACTIVE,
          ),
        [
          {operation: 'update', status: ReplicaStatus.SYNCING},
          {operation: 'update', status: ReplicaStatus.ACTIVE},
        ],
        'post-start lifecycle writes remain source-generation CAS updates',
      );
      t.same(
        createdReplicaIds,
        [TEST_PRIORITY_CREATE_STATUS_REPLICA_ID],
        'replica creation should continue before durable status propagation',
      );
      t.equal(
        localStatusAtFactory,
        ReplicaStatus.CREATING,
        'local replica should be advanced to CREATING before service startup',
      );
      t.equal(
        stateMachineStatusAtFactory,
        ReplicaStatus.CREATING,
        'state machine should leave PENDING before service startup',
      );
      t.equal(
        deferCdcPropagationHandshakeAtFactory,
        true,
        'priority control-plane create should not block lifecycle on CDC handshake',
      );
      t.equal(
        cache.get(
          SYSTEM_TABLE_NAME.SERVICES,
          TEST_PRIORITY_CREATE_STATUS_REPLICA_ID,
        )?.status,
        ReplicaStatus.ACTIVE,
        'later lifecycle writes should converge the services row to ACTIVE',
      );

      await handler.shutdown();
    },
  );

  t.test('shutdown prevents queued createReplicaAsync work from starting', async (t) => {
    const cache = createSeededCache();
    seedReplicaOperation(cache, 'op-shutdown');
    const mockCDC = createMockCDCService(cache);
    let createCalls = 0;

    const handler = new ReplicaHandler({
      nodeId: 'test-node',
      cdcIntegrationService: mockCDC,
      systemTableCache: cache,
      dataDir: getTempDir(),
      createPartitionService: async () => {
        createCalls += 1;
        return {
          async shutdown() {},
          async syncFromLeader() {},
        };
      },
    });

    handler.initialize();
    await handler.handleCreateReplica({
      operationId: 'op-shutdown',
      partitionId: 'partition-1',
      replicaId: 'replica-shutdown',
    });

    await handler.shutdown();
    await new Promise((resolve) => setImmediate(resolve));

    t.equal(createCalls, 0, 'shutdown should block queued replica creation');
    t.equal(
      handler.inProgressOperations.size,
      0,
      'shutdown should clear queued in-progress operations',
    );
  });

  t.test(
    'handleCreateReplica - passes lifecycle stage callback options to partition factory',
    async (t) => {
      const cache = createSeededCache();
      seedReplicaOperation(cache, 'op-1');
      const mockCDC = createMockCDCService(cache);
      let capturedOptions = null;

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        cdcIntegrationService: mockCDC,
        systemTableCache: cache,
        dataDir: getTempDir(),
        createPartitionService: async (options) => {
          capturedOptions = options;
          return bindRegisteredReplicaHandler({
            partitionId: options.partitionId,
            replicaId: options.replicaId,
            initialized: true,
            async shutdown() {},
            async syncFromLeader() {},
          }, options);
        },
      });

      handler.initialize();

      const created = waitForReplicaEvent(
        handler,
        'replicaCreated',
        'replicaCreationFailed',
      );

      await handler.handleCreateReplica({
        operationId: 'op-1',
        partitionId: 'partition-1',
        replicaId: 'replica-1',
      });
      await created;

      t.equal(capturedOptions.suppressLifecycleLogs, true,
        'lifecycle logs are suppressed for dynamic replica creation');
      t.equal(typeof capturedOptions.onInitializationStage, 'function',
        'stage callback is passed to partition service factory');
      t.equal(capturedOptions.resolveHandlerRetirementLane(),
        handler.replicaStateMachine,
        'the executor-created runtime retires its handler through the ' +
        'executor lifecycle owner that runs its handler-bound ACTIVE');

      handler.shutdown();
    },
  );

  t.test(
    'handleCreateReplica - first replica should not be treated as joining existing group',
    async (t) => {
      const cache = createMetadataOnlyCache();
      seedReplicaOperation(cache, 'op-1');
      const mockCDC = createMockCDCService(cache);
      let capturedOptions = null;

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        cdcIntegrationService: mockCDC,
        systemTableCache: cache,
        dataDir: getTempDir(),
        createPartitionService: async (options) => {
          capturedOptions = options;
          return bindRegisteredReplicaHandler({
            partitionId: options.partitionId,
            replicaId: options.replicaId,
            initialized: true,
            async shutdown() {},
            async syncFromLeader() {},
          }, options);
        },
      });

      handler.initialize();

      const created = waitForReplicaEvent(
        handler,
        'replicaCreated',
        'replicaCreationFailed',
      );

      await handler.handleCreateReplica({
        operationId: 'op-1',
        partitionId: 'partition-1',
        replicaId: 'replica-1',
      });
      await created;

      t.ok(capturedOptions, 'partition factory should receive create options');
      t.equal(
        capturedOptions.isJoiningExistingGroup,
        false,
        'first replica should bootstrap leadership instead of learner join mode',
      );

      handler.shutdown();
    },
  );

  t.test(
    'priority create observes a lost CREATING acknowledgement without ' +
      'inventing local-only authority',
    async (t) => {
      const cache = createSeededCache({
        tableId: 'replica_operations',
        tableName: 'replica_operations',
        partitionId: TEST_PRIORITY_CREATE_STATUS_PARTITION_ID,
      });
      seedReplicaOperation(cache, TEST_PRIORITY_CREATE_STATUS_OPERATION_ID, {
        partitionId: TEST_PRIORITY_CREATE_STATUS_PARTITION_ID,
        replicaId: TEST_PRIORITY_CREATE_STATUS_REPLICA_ID,
      });
      const mockCDC = createMockCDCService(cache);
      const serviceMutations = [];
      const replicaStateMachine = new ReplicaStateMachine({
        nodeId: 'test-node',
        systemTableCache: cache,
        controlPlaneSystemTableGateway:
          createLifecycleControlPlaneGatewayForCache(cache, {
            beforeMutation(mutation) {
              const mutationStatus =
              mutation.row?.status || mutation.data?.status || null;
              if (mutation.tableName === SYSTEM_TABLE_NAME.SERVICES) {
                serviceMutations.push({
                  operation: mutation.operation,
                  status: mutationStatus,
                });
              }
            },
            afterMutation(mutation) {
              const mutationStatus =
                mutation.row?.status || mutation.data?.status || null;
              if (mutation.tableName !== SYSTEM_TABLE_NAME.SERVICES ||
                  mutationStatus !== ReplicaStatus.CREATING) {
                return;
              }
              const error = new Error(TEST_INITIAL_STATUS_RETRY_ERROR);
              error.code = TEST_INITIAL_STATUS_RETRY_ERROR_CODE;
              error.errorCode = TEST_INITIAL_STATUS_RETRY_ERROR_CODE;
              error.deferRetry = true;
              error.retryAfterMs = TEST_INITIAL_STATUS_RETRY_AFTER_MS;
              throw error;
            },
          }),
      });
      let rowAtFactory = null;
      let localOnlyAtFactory = null;
      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        cdcIntegrationService: mockCDC,
        systemTableCache: cache,
        replicaStateMachine,
        createPartitionService: async (options) => {
          rowAtFactory = cache.get(
            SYSTEM_TABLE_NAME.SERVICES,
            options.replicaId,
          );
          localOnlyAtFactory = replicaStateMachine.isServiceRowLocalOnly(
            options.replicaId,
          );
          return bindRegisteredReplicaHandler({
            partitionId: options.partitionId,
            replicaId: options.replicaId,
            initialized: true,
            async shutdown() {},
            async syncFromLeader() {},
          }, options);
        },
        dataDir: getTempDir(),
      });
      handler.initialize();

      const created = waitForReplicaEvent(
        handler,
        'replicaCreated',
        'replicaCreationFailed',
      );
      await handler.handleCreateReplica({
        operationId: TEST_PRIORITY_CREATE_STATUS_OPERATION_ID,
        // REMOVE skips the voter-ready activation gate (not under test
        // here); the row-seeding path under test is operation-agnostic.
        operationType: 'REMOVE',
        partitionId: TEST_PRIORITY_CREATE_STATUS_PARTITION_ID,
        replicaId: TEST_PRIORITY_CREATE_STATUS_REPLICA_ID,
      });
      await created;

      t.ok(rowAtFactory, 'local services row seeded before service start');
      t.equal(
        rowAtFactory.status,
        ReplicaStatus.CREATING,
        'seeded row reflects local truth',
      );
      t.ok(
        typeof rowAtFactory.address === 'string' &&
          rowAtFactory.address.length > 0,
        'seeded row carries the routable address voter-ready requires',
      );
      t.equal(
        localOnlyAtFactory,
        false,
        'exact destination observation resolves the lost acknowledgement ' +
          'without inventing local-only authority',
      );
      const syncingMutation = serviceMutations.find(
        (mutation) => mutation.status === ReplicaStatus.SYNCING,
      );
      t.equal(
        syncingMutation?.operation,
        'update',
        'lifecycle writes cannot turn cache uncertainty into UPSERT authority',
      );
      t.equal(
        replicaStateMachine.isServiceRowLocalOnly(
          TEST_PRIORITY_CREATE_STATUS_REPLICA_ID,
        ),
        false,
        'durable commit clears the local-only marker',
      );

      await handler.shutdown();
    },
  );
}
