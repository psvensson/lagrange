// Superseded under R09 by owner decision O1 (2026-09-26): a new partition
// replica's membership and join mode come from its committed-membership stamp
// (GENESIS for a founder, COMMITTED for a join), never from the services rows
// this node observes. The rows remain the address book (the viability filter
// still shapes addresses and the leader hint), and a create without a stamp is
// refused STAMP_INVALID - there is no row-derived fallback.

import {
  committedStampFor,
  genesisStampFor,
  withBootstrapStamp,
} from './replica-handler-bootstrap-stamps.js';
import {bindRegisteredReplicaHandler} from
  '../test-helpers/replica-handler-identity-fixture.js';
import {
  buildReplicaCreateAdmissionToken,
  buildReplicaCreateAttemptToken,
} from '../../src/rebalancer/replica-create-admission-token.js';
import {SYSTEM_TABLE_NAME as SYSTEM_TABLE_NAMES} from
  '../../src/bootstrap/system-table-schemas-constants.js';

function withOperationAdmission(cache, request) {
  const row = cache.get(
    SYSTEM_TABLE_NAMES.REPLICA_OPERATIONS,
    request.operationId,
  );
  const token = buildReplicaCreateAdmissionToken({
    operationId: row.operation_id,
    replicaId: request.replicaId,
    targetNodeId: row.target_node_id,
    workflowUpdatedAt: row.updated_at,
  });
  return {
    ...request,
    entityType: row.entity_type || 'partition',
    entityId: row.entity_id || request.partitionId,
    createAdmissionToken: token,
    createAdmissionWorkflowUpdatedAt: row.updated_at,
    createAdmissionAttemptToken: buildReplicaCreateAttemptToken(token, 1),
    createAdmissionAttemptSeq: 1,
  };
}

export async function registerReplicaHandlerCreateTopologyTests({
  t,
  ReplicaHandler,
  ReplicaStatus,
  SYSTEM_TABLE_NAME,
  SERVICE_STATUS,
  RAFT_ROLE,
  createMockCDCService,
  createMockPartitionServiceFactory,
  createSeededCache,
  createMetadataOnlyCache,
  seedReplicaOperation,
  waitForReplicaEvent,
  getTempDir,
}) {
  t.test(
    'handleCreateReplica - provisional sibling rows without leader should not force learner join mode',
    async (t) => {
      const partitionId = 'partition-1';
      const cache = createMetadataOnlyCache({partitionId});
      seedReplicaOperation(cache, 'op-1', {partitionId, replicaId: 'replica-1'});
      const now = Date.now();
      for (const serviceId of ['replica-1', 'replica-2', 'replica-3']) {
        cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
          service_id: serviceId,
          service_type: 'partition',
          partition_id: partitionId,
          node_id: `node-${serviceId}`,
          status: ReplicaStatus.CREATING,
          address: `node-${serviceId}/partition/${serviceId}`,
          created_at: now,
          updated_at: now,
        });
      }

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

      await handler.handleCreateReplica(withBootstrapStamp({
        operationId: 'op-1',
        partitionId,
        replicaId: 'replica-1',
      }, genesisStampFor(['replica-1', 'replica-2', 'replica-3'])));
      await created;

      t.ok(capturedOptions, 'partition factory should receive create options');
      t.equal(
        capturedOptions.isJoiningExistingGroup,
        false,
        'a GENESIS founder bootstraps voters whatever the rows show',
      );

      handler.shutdown();
    },
  );

  t.test(
    'handleCreateReplica - active sibling rows without raft roles should not force learner join mode',
    async (t) => {
      const partitionId = 'partition-1';
      const cache = createMetadataOnlyCache({partitionId});
      seedReplicaOperation(cache, 'op-1', {partitionId, replicaId: 'replica-1'});
      const now = Date.now();
      for (const serviceId of ['replica-1', 'replica-2', 'replica-3']) {
        cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
          service_id: serviceId,
          service_type: 'partition',
          partition_id: partitionId,
          node_id: `node-${serviceId}`,
          status: ReplicaStatus.ACTIVE,
          raft_role: null,
          address: `node-${serviceId}/partition/${serviceId}`,
          created_at: now,
          updated_at: now,
        });
      }

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

      await handler.handleCreateReplica(withBootstrapStamp({
        operationId: 'op-1',
        partitionId,
        replicaId: 'replica-1',
      }, genesisStampFor(['replica-1', 'replica-2', 'replica-3'])));
      await created;

      t.ok(capturedOptions, 'partition factory should receive create options');
      t.equal(
        capturedOptions.isJoiningExistingGroup,
        false,
        'active rows without explicit voter roles never make a founder a joiner',
      );

      handler.shutdown();
    },
  );

  t.test(
    'resolveReplicaContext - roleless active rows should not invent a leader or voters',
    async (t) => {
      const partitionId = 'partition-1';
      const cache = createMetadataOnlyCache({partitionId});
      const now = Date.now();
      for (const serviceId of ['replica-1', 'replica-2', 'replica-3']) {
        cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
          service_id: serviceId,
          service_type: 'partition',
          partition_id: partitionId,
          node_id: `node-${serviceId}`,
          status: ReplicaStatus.ACTIVE,
          address: `node-${serviceId}/partition/${serviceId}`,
          created_at: now,
          updated_at: now,
        });
      }

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        cdcIntegrationService: createMockCDCService(cache),
        systemTableCache: cache,
        dataDir: getTempDir(),
        createPartitionService: createMockPartitionServiceFactory(),
      });

      handler.initialize();

      const context = handler.resolveReplicaContext(partitionId, 'replica-1',
        {bootstrapMembership: genesisStampFor(['replica-1', 'replica-2', 'replica-3'])});

      t.equal(
        context.leaderAddress,
        null,
        'should not infer a leader from missing raft_role metadata',
      );
      t.equal(
        context.existingReplicaCount,
        0,
        'should not count roleless active rows as established voters',
      );

      handler.shutdown();
    },
  );

  t.test(
    'resolveReplicaContext - fresh partition bootstrap should not turn later peers into learners',
    async (t) => {
      const partitionId = 'partition-1';
      const tableId = 'table-1';
      const cache = createMetadataOnlyCache({partitionId, tableId});
      const now = Date.now();
      cache.applySystemTableChange(SYSTEM_TABLE_NAME.PARTITIONS, 'INSERT', {
        partition_id: partitionId,
        table_id: tableId,
        partition_key_start: null,
        partition_key_end: null,
        leader_node_id: null,
        created_at: now,
        updated_at: now,
      });
      cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
        service_id: 'replica-2',
        service_type: 'partition',
        partition_id: partitionId,
        node_id: 'node-2',
        status: ReplicaStatus.ACTIVE,
        raft_role: RAFT_ROLE.LEADER,
        address: 'node-2/partition/replica-2',
        created_at: now,
        updated_at: now,
      });
      cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
        service_id: 'replica-3',
        service_type: 'partition',
        partition_id: partitionId,
        node_id: 'node-3',
        status: ReplicaStatus.PENDING,
        raft_role: null,
        address: 'node-3/partition/replica-3',
        created_at: now,
        updated_at: now,
      });

      const handler = new ReplicaHandler({
        nodeId: 'node-1',
        cdcIntegrationService: createMockCDCService(cache),
        systemTableCache: cache,
        dataDir: getTempDir(),
        createPartitionService: createMockPartitionServiceFactory(),
      });

      handler.initialize();

      const context = handler.resolveReplicaContext(partitionId, 'replica-1',
        {bootstrapMembership: genesisStampFor(['replica-1', 'replica-2', 'replica-3'])});

      t.equal(
        context.existingReplicaCount,
        0,
        'fresh partitions without persisted leader metadata should keep the initial cohort in bootstrap mode',
      );
      t.equal(
        context.leaderAddress,
        null,
        'without canonical leader_node_id the handler should not invent a leader address',
      );

      handler.shutdown();
    },
  );

  t.test(
    'handleCreateReplica - stale leader rows on a not-ready node should not force learner join mode',
    async (t) => {
      const partitionId = 'partition-1';
      const cache = createSeededCache({
        partitionId,
        leaderNodeId: 'dead-node',
        leaderReplicaId: 'replica-2',
      });
      seedReplicaOperation(cache, 'op-1', {partitionId, replicaId: 'replica-1'});

      const now = Date.now();
      cache.applySystemTableChange(SYSTEM_TABLE_NAME.NODES, 'INSERT', {
        node_id: 'dead-node',
        status: SERVICE_STATUS.ACTIVE,
        last_heartbeat: now - 1000,
        ready_lease_expires_at: now - 1,
      });
      cache.applySystemTableChange(SYSTEM_TABLE_NAME.NODES, 'INSERT', {
        node_id: 'live-node',
        status: SERVICE_STATUS.ACTIVE,
        last_heartbeat: now,
        ready_lease_expires_at: now + 60_000,
      });
      cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
        service_id: 'replica-3',
        service_type: 'partition',
        partition_id: partitionId,
        node_id: 'dead-node',
        status: ReplicaStatus.ACTIVE,
        raft_role: RAFT_ROLE.FOLLOWER,
        address: 'dead-node/partition/replica-3',
        created_at: now,
        updated_at: now,
      });
      cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
        service_id: 'replica-4',
        service_type: 'partition',
        partition_id: partitionId,
        node_id: 'live-node',
        status: ReplicaStatus.ACTIVE,
        raft_role: RAFT_ROLE.FOLLOWER,
        address: 'live-node/partition/replica-4',
        created_at: now,
        updated_at: now,
      });

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

      await handler.handleCreateReplica(withBootstrapStamp({
        operationId: 'op-1',
        partitionId,
        replicaId: 'replica-1',
      }, committedStampFor(['replica-2', 'replica-3', 'replica-4'])));
      await created;

      t.ok(capturedOptions, 'partition factory should receive create options');
      t.equal(
        capturedOptions.leaderAddress,
        null,
        'expired node readiness should suppress stale leader addresses',
      );
      t.equal(
        capturedOptions.isJoiningExistingGroup,
        true,
        'the COMMITTED stamp, not stale leader rows, decides the join mode: ' +
          'rows never re-form a group (O1)',
      );

      handler.shutdown();
    },
  );

  t.test(
    'handleCreateReplica - priority recovery excludes disconnected stale peers',
    async (t) => {
      const partitionId = 'replica_operations-p1';
      const cache = createSeededCache({
        tableId: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        partitionId,
        leaderNodeId: 'dead-node',
        leaderReplicaId: 'replica_operations-p1-r2',
      });
      seedReplicaOperation(cache, 'op-1', {
        partitionId,
        replicaId: 'replica_operations-p1-r4',
      });

      const now = Date.now();
      for (const nodeId of ['dead-node', 'live-node']) {
        cache.applySystemTableChange(SYSTEM_TABLE_NAME.NODES, 'INSERT', {
          node_id: nodeId,
          status: SERVICE_STATUS.ACTIVE,
          last_heartbeat: now,
          ready_lease_expires_at: now + 60_000,
        });
      }
      cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
        service_id: 'replica_operations-p1-r3',
        service_type: 'partition',
        partition_id: partitionId,
        node_id: 'dead-node',
        status: ReplicaStatus.ACTIVE,
        raft_role: RAFT_ROLE.FOLLOWER,
        address: 'dead-node/partition/replica_operations-p1-r3',
        created_at: now,
        updated_at: now,
      });
      cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
        service_id: 'replica_operations-p1-r5',
        service_type: 'partition',
        partition_id: partitionId,
        node_id: 'live-node',
        status: ReplicaStatus.ACTIVE,
        raft_role: RAFT_ROLE.FOLLOWER,
        address: 'live-node/partition/replica_operations-p1-r5',
        created_at: now,
        updated_at: now,
      });

      const mockCDC = createMockCDCService(cache);
      let capturedOptions = null;
      let resolveFactoryCalled = null;
      const factoryCalled = new Promise((resolve) => {
        resolveFactoryCalled = resolve;
      });

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        cdcIntegrationService: mockCDC,
        systemTableCache: cache,
        messageRouter: {
          getConnectionState(nodeId) {
            return nodeId === 'dead-node' ? 'disconnected' : 'connected';
          },
        },
        dataDir: getTempDir(),
        createPartitionService: async (options) => {
          capturedOptions = options;
          resolveFactoryCalled();
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

      await handler.handleCreateReplica(withBootstrapStamp(
        withOperationAdmission(cache, {
          operationId: 'op-1',
          operationType: 'REPLACE',
          partitionId,
          replicaId: 'replica_operations-p1-r4',
        }), committedStampFor(['replica_operations-p1-r2',
          'replica_operations-p1-r3', 'replica_operations-p1-r5'])));
      await factoryCalled;
      await created;

      t.ok(capturedOptions, 'partition factory should receive create options');
      t.equal(
        capturedOptions.leaderAddress,
        null,
        'disconnected priority leader should not be used as a join target',
      );
      t.notOk(
        capturedOptions.peerAddresses.includes(
          'dead-node/partition/replica_operations-p1-r3',
        ),
        'disconnected stale peer should be excluded from priority recovery topology',
      );
      t.ok(
        capturedOptions.peerAddresses.includes(
          'live-node/partition/replica_operations-p1-r5',
        ),
        'connected peer should remain available for priority recovery topology',
      );
      t.equal(
        capturedOptions.isJoiningExistingGroup,
        true,
        'a COMMITTED stamp is a join: disconnected leader metadata no longer ' +
          're-forms the group from rows (O1)',
      );
      t.equal(
        cache.get(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, 'op-1')
          ?.create_admission_state,
        'ACTIVE',
        'the operation-ledger replica repair reaches an exact durable ' +
          'admission outcome through surviving ledger authority',
      );

      await handler.shutdown();
    },
  );

  t.test(
    'handleCreateReplica - ready leader should still use learner join mode',
    async (t) => {
      const cache = createSeededCache();
      seedReplicaOperation(cache, 'op-1');

      const now = Date.now();
      cache.applySystemTableChange(SYSTEM_TABLE_NAME.NODES, 'INSERT', {
        node_id: 'leader-node',
        status: SERVICE_STATUS.ACTIVE,
        last_heartbeat: now,
        ready_lease_expires_at: now + 60_000,
      });

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

      await handler.handleCreateReplica(withBootstrapStamp({
        operationId: 'op-1',
        partitionId: 'partition-1',
        replicaId: 'replica-1',
      }, committedStampFor(['leader-replica'])));
      await created;

      t.ok(capturedOptions, 'partition factory should receive create options');
      t.equal(
        capturedOptions.leaderAddress,
        'leader-node/partition/leader-replica',
        'ready leader metadata should still provide a join target',
      );
      t.equal(
        capturedOptions.isJoiningExistingGroup,
        true,
        'healthy leader metadata should preserve learner join mode',
      );

      handler.shutdown();
    },
  );

  t.test(
    'handleCreateReplica - explicit bootstrap cohort should seed full peer topology ' +
      'for a fresh partition',
    async (t) => {
      const partitionId = 'partition-1';
      const tableId = 'table-1';
      const cache = createMetadataOnlyCache({partitionId, tableId});
      seedReplicaOperation(cache, 'op-1', {partitionId, replicaId: 'replica-1'});
      const now = Date.now();
      cache.applySystemTableChange(SYSTEM_TABLE_NAME.PARTITIONS, 'INSERT', {
        partition_id: partitionId,
        table_id: tableId,
        partition_key_start: null,
        partition_key_end: null,
        leader_node_id: null,
        created_at: now,
        updated_at: now,
      });
      const bootstrapReplicaIds = ['replica-1', 'replica-2', 'replica-3'];
      const bootstrapPeerAddresses = [
        'node-1/partition/replica-1',
        'node-2/partition/replica-2',
        'node-3/partition/replica-3',
      ];
      let capturedOptions = null;

      const handler = new ReplicaHandler({
        nodeId: 'node-1',
        cdcIntegrationService: createMockCDCService(cache),
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

      await handler.handleCreateReplica(withBootstrapStamp({
        operationId: 'op-1',
        partitionId,
        replicaId: 'replica-1',
        replicaIds: bootstrapReplicaIds,
        peerAddresses: bootstrapPeerAddresses,
      }, genesisStampFor(bootstrapReplicaIds)));
      await created;

      t.ok(capturedOptions, 'partition factory should receive create options');
      t.same(
        capturedOptions.replicaIds.slice().sort(),
        bootstrapReplicaIds.slice().sort(),
        'fresh bootstrap uses the GENESIS founding cohort',
      );
      t.same(
        capturedOptions.peerAddresses.slice().sort(),
        bootstrapPeerAddresses.slice().sort(),
        'fresh bootstrap should use the explicit peer addresses for the cohort',
      );
      t.equal(
        capturedOptions.isJoiningExistingGroup,
        false,
        'explicit bootstrap topology should still remain in bootstrap mode',
      );

      handler.shutdown();
    },
  );

  t.test(
    'CL-013: explicit REPLACE join into an established partition consumes ' +
      'dispatched topology hints — full cohort, never self-only',
    async (t) => {
      const partitionId = 'partition-1';
      const tableId = 'table-1';
      const cache = createMetadataOnlyCache({partitionId, tableId});
      seedReplicaOperation(cache, 'op-1', {partitionId, replicaId: 'replica-4'});
      const createdAt = Date.now() - 60000;
      // Established partition: leader set, updated after creation — the
      // fresh-bootstrap window is CLOSED (the live CL-013 witness state).
      cache.applySystemTableChange(SYSTEM_TABLE_NAME.PARTITIONS, 'INSERT', {
        partition_id: partitionId,
        table_id: tableId,
        partition_key_start: null,
        partition_key_end: null,
        leader_node_id: 'node-seed',
        created_at: createdAt,
        updated_at: createdAt + 5000,
      });
      // No sibling SERVICES rows visible locally (cache lag / viability
      // filtering) — only the dispatched hints know the group.
      const bootstrapReplicaIds = ['replica-1', 'replica-2', 'replica-3', 'replica-4'];
      const bootstrapPeerAddresses = [
        'node-seed/partition/replica-1',
        'node-seed/partition/replica-2',
        'node-seed/partition/replica-3',
        'node-learner/partition/replica-4',
      ];
      let capturedOptions = null;

      const handler = new ReplicaHandler({
        nodeId: 'node-learner',
        cdcIntegrationService: createMockCDCService(cache),
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
      await handler.handleCreateReplica(withBootstrapStamp(
        withOperationAdmission(cache, {
          operationId: 'op-1',
          operationType: 'REPLACE',
          partitionId,
          replicaId: 'replica-4',
          replicaIds: bootstrapReplicaIds,
          peerAddresses: bootstrapPeerAddresses,
        }), committedStampFor(['replica-1', 'replica-2', 'replica-3'])));
      await created;

      t.ok(capturedOptions, 'partition factory invoked');
      t.same(
        capturedOptions.replicaIds.slice().sort(),
        bootstrapReplicaIds.slice().sort(),
        'the stamped committed members plus the target, whatever the cache',
      );
      t.same(
        capturedOptions.peerAddresses.slice().sort(),
        bootstrapPeerAddresses.slice().sort(),
        'dispatched peer addresses consumed',
      );
      t.equal(
        capturedOptions.isJoiningExistingGroup,
        true,
        'a COMMITTED stamp is a join; no row view re-forms the group (O1)',
      );
      t.ok(
        capturedOptions.replicaIds.length > 1,
        'never a self-only topology',
      );

      handler.shutdown();
    },
  );

  t.test(
    'an explicit REPLACE resolves the same bootstrap membership as any join ' +
      '(owner decision D1): no operation type narrows it',
    async (t) => {
      const partitionId = 'replica_operations-p1';
      const tableId = SYSTEM_TABLE_NAME.REPLICA_OPERATIONS;
      const cache = createMetadataOnlyCache({partitionId, tableId});
      const createdAt = Date.now() - 60000;
      cache.applySystemTableChange(SYSTEM_TABLE_NAME.PARTITIONS, 'UPDATE', {
        partition_id: partitionId,
        table_id: tableId,
        partition_key_start: null,
        partition_key_end: null,
        leader_node_id: 'node-1',
        created_at: createdAt,
        updated_at: createdAt + 5000,
      });
      const stampedReplicaIds = [
        'replica_operations-p1-r1',
        'replica_operations-p1-r4',
        'replica_operations-p1-r3',
      ];
      // A member this node observes that the stamp predates.
      const laterObservedReplicaId = 'replica_operations-p1-r2';
      for (const [index, serviceId] of [
        ...stampedReplicaIds,
        laterObservedReplicaId,
      ].entries()) {
        cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
          service_id: serviceId,
          service_type: 'partition',
          partition_id: partitionId,
          node_id: `node-${index + 1}`,
          status: ReplicaStatus.ACTIVE,
          raft_role: index === 0 ? RAFT_ROLE.LEADER : RAFT_ROLE.FOLLOWER,
          address: `node-${index + 1}/partition/${serviceId}`,
          created_at: createdAt,
          updated_at: createdAt,
        });
      }
      // The dispatched stamp is the group's membership at creation plus the
      // target; the REPLACE source (r3 here) is in it while it is a member.
      const targetReplicaId = 'replica_operations-p1-r5';
      const bootstrapReplicaIds = [...stampedReplicaIds, targetReplicaId];
      const bootstrapPeerAddresses = [
        'node-1/partition/replica_operations-p1-r1',
        'node-2/partition/replica_operations-p1-r4',
        'node-3/partition/replica_operations-p1-r3',
        `node-target/partition/${targetReplicaId}`,
      ];
      const handler = new ReplicaHandler({
        nodeId: 'node-target',
        cdcIntegrationService: createMockCDCService(cache),
        systemTableCache: cache,
        dataDir: getTempDir(),
        createPartitionService: createMockPartitionServiceFactory(),
      });
      handler.initialize();
      const resolveAs = (explicitOperationType) =>
        handler.resolveReplicaContext(partitionId, targetReplicaId, {
          explicitOperationType,
          bootstrapReplicaIds,
          bootstrapPeerAddresses,
          bootstrapMembership: committedStampFor(stampedReplicaIds),
        });

      const replaceContext = resolveAs('REPLACE');
      const addContext = resolveAs('ADD');
      t.same(
        replaceContext.replicaIds.slice().sort(),
        addContext.replicaIds.slice().sort(),
        'a REPLACE target resolves the membership an ADD target resolves',
      );
      t.same(
        replaceContext.peerAddresses.slice().sort(),
        addContext.peerAddresses.slice().sort(),
        'and the same peer addresses',
      );
      for (const replicaId of bootstrapReplicaIds) {
        t.ok(
          replaceContext.replicaIds.includes(replicaId),
          `the member ${replicaId} stays in the bootstrap`,
        );
      }
      t.notOk(
        replaceContext.replicaIds.includes(laterObservedReplicaId),
        'a row the stamp does not name adds no member (O1: rows are the ' +
          'address book only)',
      );

      handler.shutdown();
    },
  );

  t.test(
    'CL-013 (superseded, O1): a REPLACE join without a stamp is refused ' +
      'instead of solo-bootstrapping an isolated group',
    async (t) => {
      const partitionId = 'partition-1';
      const tableId = 'table-1';
      const cache = createMetadataOnlyCache({partitionId, tableId});
      seedReplicaOperation(cache, 'op-1', {partitionId, replicaId: 'replica-4'});
      const createdAt = Date.now() - 60000;
      cache.applySystemTableChange(SYSTEM_TABLE_NAME.PARTITIONS, 'INSERT', {
        partition_id: partitionId,
        table_id: tableId,
        partition_key_start: null,
        partition_key_end: null,
        leader_node_id: 'node-seed',
        created_at: createdAt,
        updated_at: createdAt + 5000,
      });
      let capturedOptions = null;

      const handler = new ReplicaHandler({
        nodeId: 'node-learner',
        cdcIntegrationService: createMockCDCService(cache),
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
      handler.syncTimeoutMs = 250;

      const outcome = waitForReplicaEvent(
        handler,
        'replicaCreationFailed',
        'replicaCreated',
      );
      await handler.handleCreateReplica(withOperationAdmission(cache, {
        operationId: 'op-1',
        operationType: 'REPLACE',
        partitionId,
        replicaId: 'replica-4',
      }));
      const failure = await outcome;

      t.equal(
        capturedOptions,
        null,
        'no partition service created - solo bootstrap prevented',
      );
      t.match(
        String(failure?.error || failure?.message || failure),
        /membership-stamp-invalid/,
        'a create without a stamp is refused STAMP_INVALID (O1)',
      );

      handler.shutdown();
    },
  );

  t.test(
    'CL-013 (superseded, O1): a non-REPLACE create without a stamp has no ' +
      'row-derived fallback',
    async (t) => {
      const partitionId = 'partition-1';
      const tableId = 'table-1';
      const cache = createMetadataOnlyCache({partitionId, tableId});
      seedReplicaOperation(cache, 'op-1', {partitionId, replicaId: 'replica-4'});
      const createdAt = Date.now() - 60000;
      cache.applySystemTableChange(SYSTEM_TABLE_NAME.PARTITIONS, 'INSERT', {
        partition_id: partitionId,
        table_id: tableId,
        partition_key_start: null,
        partition_key_end: null,
        leader_node_id: 'node-seed',
        created_at: createdAt,
        updated_at: createdAt + 5000,
      });
      let capturedOptions = null;

      const handler = new ReplicaHandler({
        nodeId: 'node-learner',
        cdcIntegrationService: createMockCDCService(cache),
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

      const refused = waitForReplicaEvent(
        handler,
        'replicaCreationFailed',
        'replicaCreated',
      );
      await handler.handleCreateReplica({
        operationId: 'op-1',
        partitionId,
        replicaId: 'replica-4',
      });
      const failure = await refused;

      t.equal(capturedOptions, null,
        'no row-derived fallback: nothing is created without a stamp (O1)');
      t.match(String(failure?.error || failure), /membership-stamp-invalid/,
        'refused STAMP_INVALID');

      handler.shutdown();
    },
  );
}
