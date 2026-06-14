/**
 * Unit tests for MessageGroupService.
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  createTestTransport,
  createTrafficReadinessState,
  registerMessageGroupServiceLifecycleHooks,
  setTestPortBase,
} from './message-group-service-test-support.js';
import {
  MessageGroupService,
  MessageStatus,
  RaftRole,
} from '../../src/message-group/message-group-service.js';
import {
  MESSAGE_GROUP_LEADER_IDENTITY_SOURCE,
  MESSAGE_GROUP_LEADER_IDENTITY_STATE,
} from '../../src/message-group/message-group-forwarding-owner.js';
import {
} from '../../src/message-group/constants.js';
import {
  SYSTEM_TABLE_NAME,
  INITIAL_PARTITION_IDS,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  LIFECYCLE_PHASE,
  LIFECYCLE_REASON,
} from '../../src/bootstrap/lifecycle-controller-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {
  COLUMN,
  CDC_OPERATION,
  SERVICE_TYPE,
  SERVICE_STATUS,
  STATE,
  TABLES,
} from '../../src/constants/index.js';
import {
} from '../../src/raft/constants.js';
import {
  ControlPlaneMessageType,
} from '../../src/control-plane/control-plane-constants.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
} from '../../src/control-plane/control-plane-workload-profile.js';
import {
} from '../../src/control-plane/pressure-governor.js';

const TEST_CRITICAL_TRANSPORT_PARTITION_ADDRESS =
  'seed-node/partition/control_plane_publications-p1-r1';

setTestPortBase(24600);
registerMessageGroupServiceLifecycleHooks();

test('MessageGroupService - publishes leader state as follower metadata in services table', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  const updates = [];
  const mockCdcIntegrationService = {
    updateSystemTableRow: async (tableName, whereClause, data, options) => {
      updates.push({tableName, whereClause, data, options});
      return {success: true};
    },
  };
  const systemTableCache = new SystemTableCache();
  const servicesPartitionId = INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SERVICES];
  systemTableCache.applySystemTableChange(TABLES.PARTITIONS, CDC_OPERATION.INSERT, {
    [COLUMN.PARTITION_ID]: servicesPartitionId,
    [COLUMN.TABLE_ID]: SYSTEM_TABLE_NAME.SERVICES,
    [COLUMN.LEADER_NODE_ID]: nodeId,
  });
  systemTableCache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.INSERT, {
    [COLUMN.SERVICE_ID]: 'services-leader',
    [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
    [COLUMN.PARTITION_ID]: servicesPartitionId,
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.RAFT_ROLE]: RaftRole.LEADER,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.ADDRESS]: `${nodeId}/partition/services-leader`,
  });

  try {
    const service = new MessageGroupService({
      groupId: 'mg-1',
      replicaId: 'mg-1-r1',
      nodeId,
      transport: router,
      cdcIntegrationService: mockCdcIntegrationService,
    });

    await service.initialize();
    service.systemTableCache = systemTableCache;
    service.setCdcIntegrationService(mockCdcIntegrationService);

    await new Promise((resolve) => setImmediate(resolve));

    const roleUpdate = updates.find(
      (update) =>
        update.tableName === SYSTEM_TABLE_NAME.SERVICES &&
        update.whereClause?.service_id === 'mg-1-r1' &&
        update.data?.raft_role === RaftRole.FOLLOWER,
    );

    t.ok(roleUpdate, 'raft role update should be persisted via CDC');
    t.same(
      roleUpdate?.options?.expectedCacheFields,
      {
        raft_role: RaftRole.FOLLOWER,
      },
      'raft role cache wait should converge only the role field',
    );
    t.equal(
      roleUpdate?.options?.routingReadinessDimension,
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
      'raft role persistence should route through control-plane recovery readiness',
    );
    t.equal(
      roleUpdate?.options?.deliveryPriority,
      'background',
      'message-group raft-role publication should be advisory background metadata',
    );
    t.equal(
      roleUpdate?.options?.workClass,
      'background',
      'message-group raft-role publication should use background admission',
    );
    t.equal(
      roleUpdate?.options?.allowPressureDefer,
      true,
      'message-group raft-role publication should defer under pressure',
    );
    t.notOk(
      updates.some((update) => update.data?.raft_role === RaftRole.LEADER),
      'leader authority should not be republished through services.raft_role',
    );

    await service.shutdown();
  } finally {
    await cleanup();
  }
});

test('MessageGroupService - demotes non-control-plane role publication to background', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  const updates = [];
  const mockCdcIntegrationService = {
    updateSystemTableRow: async (tableName, whereClause, data, options) => {
      updates.push({tableName, whereClause, data, options});
      return {success: true};
    },
  };
  const systemTableCache = new SystemTableCache();
  const servicesPartitionId = INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SERVICES];
  systemTableCache.applySystemTableChange(TABLES.PARTITIONS, CDC_OPERATION.INSERT, {
    [COLUMN.PARTITION_ID]: servicesPartitionId,
    [COLUMN.TABLE_ID]: SYSTEM_TABLE_NAME.SERVICES,
    [COLUMN.LEADER_NODE_ID]: nodeId,
  });
  systemTableCache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.INSERT, {
    [COLUMN.SERVICE_ID]: 'services-leader',
    [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
    [COLUMN.PARTITION_ID]: servicesPartitionId,
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.RAFT_ROLE]: RaftRole.LEADER,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.ADDRESS]: `${nodeId}/partition/services-leader`,
  });

  try {
    const service = new MessageGroupService({
      groupId: 'mg-user-1',
      replicaId: 'mg-user-1-r1',
      nodeId,
      transport: router,
      cdcIntegrationService: mockCdcIntegrationService,
    });

    await service.initialize();
    service.systemTableCache = systemTableCache;
    service.setCdcIntegrationService(mockCdcIntegrationService);

    await new Promise((resolve) => setImmediate(resolve));

    const roleUpdate = updates.find(
      (update) =>
        update.tableName === SYSTEM_TABLE_NAME.SERVICES &&
        update.whereClause?.service_id === 'mg-user-1-r1' &&
        update.data?.raft_role === RaftRole.FOLLOWER,
    );

    t.ok(roleUpdate, 'non-control-plane role update should still be persisted');
    t.equal(
      roleUpdate?.options?.deliveryPriority,
      'background',
      'non-control-plane message-group role publication should not consume the critical lane',
    );

    await service.shutdown();
  } finally {
    await cleanup();
  }
});

test('MessageGroupService - publishes candidate role as follower metadata', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  const updates = [];
  const mockCdcIntegrationService = {
    updateSystemTableRow: async (tableName, whereClause, data, options) => {
      updates.push({tableName, whereClause, data, options});
      return {success: true};
    },
  };
  const systemTableCache = new SystemTableCache();
  const servicesPartitionId = INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SERVICES];
  systemTableCache.applySystemTableChange(TABLES.PARTITIONS, CDC_OPERATION.INSERT, {
    [COLUMN.PARTITION_ID]: servicesPartitionId,
    [COLUMN.TABLE_ID]: SYSTEM_TABLE_NAME.SERVICES,
    [COLUMN.LEADER_NODE_ID]: nodeId,
  });
  systemTableCache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.INSERT, {
    [COLUMN.SERVICE_ID]: 'services-leader',
    [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
    [COLUMN.PARTITION_ID]: servicesPartitionId,
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.RAFT_ROLE]: RaftRole.LEADER,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.ADDRESS]: `${nodeId}/partition/services-leader`,
  });
  systemTableCache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.INSERT, {
    [COLUMN.SERVICE_ID]: 'mg-1-r1',
    [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
    [COLUMN.GROUP_ID]: 'mg-1',
    [COLUMN.REPLICA_ID]: 'mg-1-r1',
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.RAFT_ROLE]: RaftRole.CANDIDATE,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.ADDRESS]: `${nodeId}/message-group/mg-1-r1`,
    [COLUMN.UPDATED_AT]: 1,
  });

  try {
    const service = new MessageGroupService({
      groupId: 'mg-1',
      replicaId: 'mg-1-r1',
      nodeId,
      transport: router,
      cdcIntegrationService: mockCdcIntegrationService,
    });

    await service.initialize();
    service.systemTableCache = systemTableCache;
    service.setCdcIntegrationService(mockCdcIntegrationService);
    updates.length = 0;

    service.queueRoleUpdate(RaftRole.CANDIDATE);
    await new Promise((resolve) => setImmediate(resolve));

    const candidateUpdate = updates.find(
      (update) =>
        update.tableName === SYSTEM_TABLE_NAME.SERVICES &&
        update.whereClause?.service_id === 'mg-1-r1',
    );

    t.ok(
      candidateUpdate,
      'candidate publication should normalize stale cache metadata back to follower',
    );
    t.equal(
      candidateUpdate?.data?.raft_role,
      RaftRole.FOLLOWER,
      'candidate publication should rewrite advisory metadata to follower',
    );
    t.equal(
      service.persistedRole,
      RaftRole.FOLLOWER,
      'candidate publication should still converge the advisory metadata role to follower',
    );
    t.notOk(
      updates.some((update) => update.data?.raft_role === RaftRole.CANDIDATE),
      'candidate metadata should not be written to services',
    );

    await service.shutdown();
  } finally {
    await cleanup();
  }
});

test(
  'MessageGroupService - can suppress global raft-role publication for local-only groups',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    const updates = [];
    const mockCdcIntegrationService = {
      updateSystemTableRow: async (tableName, whereClause, data, options) => {
        updates.push({tableName, whereClause, data, options});
        return {success: true};
      },
    };
    const systemTableCache = new SystemTableCache();
    const servicesPartitionId = INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SERVICES];
    systemTableCache.applySystemTableChange(TABLES.PARTITIONS, CDC_OPERATION.INSERT, {
      [COLUMN.PARTITION_ID]: servicesPartitionId,
      [COLUMN.TABLE_ID]: SYSTEM_TABLE_NAME.SERVICES,
      [COLUMN.LEADER_NODE_ID]: nodeId,
    });
    systemTableCache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.INSERT, {
      [COLUMN.SERVICE_ID]: 'services-leader',
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
      [COLUMN.PARTITION_ID]: servicesPartitionId,
      [COLUMN.NODE_ID]: nodeId,
      [COLUMN.RAFT_ROLE]: RaftRole.LEADER,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.ADDRESS]: `${nodeId}/partition/services-leader`,
    });

    try {
      const service = new MessageGroupService({
        groupId: 'mg-local-only',
        replicaId: 'mg-local-only-r1',
        nodeId,
        transport: router,
        cdcIntegrationService: mockCdcIntegrationService,
        publishRoleMetadata: false,
      });

      await service.initialize();
      service.systemTableCache = systemTableCache;
      service.setCdcIntegrationService(mockCdcIntegrationService);
      service.queueRoleUpdate(RaftRole.LEADER);
      await new Promise((resolve) => setImmediate(resolve));

      t.notOk(
        updates.find((update) => update.tableName === SYSTEM_TABLE_NAME.SERVICES),
        'role publication should stay local when global role metadata is disabled',
      );

      await service.shutdown();
    } finally {
      await cleanup();
    }
  },
);

test(
  'MessageGroupService - rewrites stale leader cache metadata to follower',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    let updateCalls = 0;
    const mockCdcIntegrationService = {
      updateSystemTableRow: async () => {
        updateCalls += 1;
        return {success: true};
      },
    };
    const systemTableCache = new SystemTableCache();
    const servicesPartitionId = INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SERVICES];
    systemTableCache.applySystemTableChange(TABLES.PARTITIONS, CDC_OPERATION.INSERT, {
      [COLUMN.PARTITION_ID]: servicesPartitionId,
      [COLUMN.TABLE_ID]: SYSTEM_TABLE_NAME.SERVICES,
      [COLUMN.LEADER_NODE_ID]: nodeId,
    });
    systemTableCache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.INSERT, {
      [COLUMN.SERVICE_ID]: 'services-leader',
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
      [COLUMN.PARTITION_ID]: servicesPartitionId,
      [COLUMN.NODE_ID]: nodeId,
      [COLUMN.RAFT_ROLE]: RaftRole.LEADER,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.ADDRESS]: `${nodeId}/partition/services-leader`,
    });
    systemTableCache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.INSERT, {
      [COLUMN.SERVICE_ID]: 'mg-1-r1',
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
      [COLUMN.GROUP_ID]: 'mg-1',
      [COLUMN.REPLICA_ID]: 'mg-1-r1',
      [COLUMN.RAFT_ROLE]: RaftRole.LEADER,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.ADDRESS]: `${nodeId}/message-group/mg-1-r1`,
      [COLUMN.UPDATED_AT]: Date.now(),
    });

    try {
      const service = new MessageGroupService({
        groupId: 'mg-1',
        replicaId: 'mg-1-r1',
        nodeId,
        transport: router,
        cdcIntegrationService: mockCdcIntegrationService,
      });

      service.systemTableCache = systemTableCache;
      service.pendingRoleUpdate = RaftRole.LEADER;
      service.persistedRole = null;

      await service.flushRoleUpdate();

      t.equal(updateCalls, 1, 'stale leader metadata should be rewritten once');
      t.equal(service.persistedRole, RaftRole.FOLLOWER, 'persisted role should converge to follower metadata');
      t.equal(service.pendingRoleUpdate, null, 'pending role should clear once cache matches');
    } finally {
      await cleanup();
    }
  },
);

test('MessageGroupService - flushes services role update when local services leader exists',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    const updates = [];
    const mockCdcIntegrationService = {
      canWriteSystemTableLocally: (tableName) => tableName === SYSTEM_TABLE_NAME.SERVICES,
      updateSystemTableRow: async (tableName, whereClause, data) => {
        updates.push({tableName, whereClause, data});
        return {success: true};
      },
    };

    try {
      const service = new MessageGroupService({
        groupId: 'mg-1',
        replicaId: 'mg-1-r1',
        nodeId,
        transport: router,
        cdcIntegrationService: mockCdcIntegrationService,
      });

      service.systemTableCache = new SystemTableCache();
      service.pendingRoleUpdate = RaftRole.LEADER;
      service.persistedRole = null;

      const result = await service.flushRoleUpdate();

      t.equal(result.reason, 'applied', 'should persist when the local services leader owns the write');
      t.equal(updates.length, 1, 'should issue one services-table write');
      t.equal(updates[0].tableName, SYSTEM_TABLE_NAME.SERVICES, 'should target services');
      t.same(updates[0].whereClause, {
        [COLUMN.SERVICE_ID]: 'mg-1-r1',
      }, 'should update the local message-group service row');
      t.equal(
        updates[0].data?.raft_role,
        RaftRole.FOLLOWER,
        'canonical leader ownership should publish follower metadata only',
      );
      t.notOk(
        Object.prototype.hasOwnProperty.call(updates[0].data, 'status'),
        'role persistence should not rewrite lifecycle status',
      );
      t.equal(service.pendingRoleUpdate, null, 'pending role should clear after success');
      t.equal(service.persistedRole, RaftRole.FOLLOWER, 'persisted role should track the published metadata role');
    } finally {
      await cleanup();
    }
  },
);

test('MessageGroupService - flushes message-group leader update when local owner exists',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    const updates = [];
    const mockCdcIntegrationService = {
      canWriteSystemTableLocally: (tableName) =>
        tableName === SYSTEM_TABLE_NAME.MESSAGE_GROUPS,
      updateSystemTableRow: async (tableName, whereClause, data) => {
        updates.push({tableName, whereClause, data});
        return {success: true};
      },
    };

    try {
      const service = new MessageGroupService({
        groupId: 'mg-1',
        replicaId: 'mg-1-r1',
        nodeId,
        transport: router,
        cdcIntegrationService: mockCdcIntegrationService,
      });

      service.systemTableCache = new SystemTableCache();
      service.isLeader = true;
      service.pendingLeaderNodeUpdate = nodeId;
      service.persistedLeaderNodeId = null;

      const result = await service.flushLeaderNodeUpdate();

      t.equal(
        result.reason,
        'applied',
        'should persist when the local message_groups leader owns the write',
      );
      t.equal(updates.length, 1, 'should issue one message_groups-table write');
      t.equal(
        updates[0].tableName,
        SYSTEM_TABLE_NAME.MESSAGE_GROUPS,
        'should target message_groups',
      );
      t.same(updates[0].whereClause, {
        [COLUMN.GROUP_ID]: 'mg-1',
      }, 'should update the local message-group owner row');
      t.equal(
        updates[0].data?.[COLUMN.LEADER_NODE_ID],
        nodeId,
        'should publish the elected leader node id',
      );
      t.equal(
        service.pendingLeaderNodeUpdate,
        null,
        'pending leader update should clear after success',
      );
      t.equal(
        service.persistedLeaderNodeId,
        nodeId,
        'persisted leader update should track the published owner metadata',
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  'MessageGroupService - join convergence forward targeting reuses pending ' +
    'and persisted leader publication hints before cache catches up',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();

    try {
      const service = new MessageGroupService({
        groupId: 'mg-leader-hint-forward-target',
        replicaId: 'mg-leader-hint-forward-target-r2',
        nodeId,
        replicaIds: [
          'mg-leader-hint-forward-target-r1',
          'mg-leader-hint-forward-target-r2',
          'mg-leader-hint-forward-target-r3',
        ],
        peerAddresses: [
          'seed-node/message-group/mg-leader-hint-forward-target-r1',
          'seed-node/message-group/mg-leader-hint-forward-target-r2',
          'seed-node/message-group/mg-leader-hint-forward-target-r3',
        ],
        transport: router,
      });

      service.pendingLeaderNodeUpdate = 'seed-node';
      service.persistedLeaderNodeId = null;
      const pendingLeaderIdentity =
        service.forwardingOwner.resolveCanonicalLeaderIdentityFromCache();

      const pendingTarget =
        service.resolveJoinConvergenceBootstrapForwardTarget();
      t.equal(
        pendingLeaderIdentity.state,
        MESSAGE_GROUP_LEADER_IDENTITY_STATE.PUBLICATION_PENDING,
        'pending leader publication should surface an explicit leader-identity state',
      );
      t.equal(
        pendingLeaderIdentity.source,
        MESSAGE_GROUP_LEADER_IDENTITY_SOURCE.PENDING_PUBLICATION,
        'pending leader publication should surface an explicit leader-identity source',
      );
      t.equal(
        pendingTarget?.address,
        'seed-node/message-group/mg-leader-hint-forward-target-r1',
        'join convergence should reuse the pending leader publication hint before the cache row catches up',
      );

      service.pendingLeaderNodeUpdate = null;
      service.persistedLeaderNodeId = 'seed-node';
      const persistedLeaderIdentity =
        service.forwardingOwner.resolveCanonicalLeaderIdentityFromCache();

      const persistedTarget =
        service.resolveJoinConvergenceBootstrapForwardTarget();
      t.equal(
        persistedLeaderIdentity.state,
        MESSAGE_GROUP_LEADER_IDENTITY_STATE.PUBLICATION_PERSISTED,
        'persisted leader publication should surface an explicit leader-identity state',
      );
      t.equal(
        persistedLeaderIdentity.source,
        MESSAGE_GROUP_LEADER_IDENTITY_SOURCE.PERSISTED_PUBLICATION,
        'persisted leader publication should surface an explicit leader-identity source',
      );
      t.equal(
        persistedTarget?.address,
        'seed-node/message-group/mg-leader-hint-forward-target-r1',
        'join convergence should keep using the persisted leader publication hint when the cache still lags',
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  'MessageGroupService - publishes role metadata before traffic ready when services leader is local',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    const updates = [];
    const readinessState = createTrafficReadinessState();
    const mockCdcIntegrationService = {
      canWriteSystemTableLocally: (tableName) =>
        tableName === SYSTEM_TABLE_NAME.SERVICES,
      updateSystemTableRow: async (tableName, whereClause, data) => {
        updates.push({tableName, whereClause, data});
        return {success: true};
      },
    };

    try {
      const service = new MessageGroupService({
        groupId: 'mg-1',
        replicaId: 'mg-1-r1',
        nodeId,
        transport: router,
        cdcIntegrationService: mockCdcIntegrationService,
        bootstrapReadinessState: readinessState,
      });

      service.systemTableCache = new SystemTableCache();
      service.systemTableCache.applySystemTableChange(
        TABLES.NODES,
        CDC_OPERATION.INSERT,
        {
          [COLUMN.NODE_ID]: nodeId,
          [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
          [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
          [COLUMN.LAST_HEARTBEAT]: Date.now(),
          [COLUMN.READY_LEASE_EXPIRES_AT]: null,
        },
      );
      service.pendingRoleUpdate = RaftRole.LEADER;
      service.persistedRole = null;

      const publishResult = await service.flushRoleUpdate();
      t.equal(
        publishResult.reason,
        'applied',
        'role publication should not wait on lifecycle readiness once the local services leader can accept the write',
      );
      t.equal(
        updates.length,
        1,
        'service metadata should publish immediately when the local services leader is available',
      );

      const now = Date.now();
      service.systemTableCache.applySystemTableChange(
        TABLES.NODES,
        CDC_OPERATION.UPDATE,
        {
          [COLUMN.NODE_ID]: nodeId,
          [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
          [COLUMN.CONNECTION_STATE]: STATE.READY,
          [COLUMN.LAST_HEARTBEAT]: now,
          [COLUMN.READY_LEASE_EXPIRES_AT]: now + 60_000,
        },
      );

      readinessState.transitionTo(LIFECYCLE_PHASE.CONTROL_READY, {
        ready: false,
        reasons: [LIFECYCLE_REASON.LEADER_METADATA_INCOMPLETE],
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      const noopResult = await service.flushRoleUpdate();
      t.equal(noopResult.reason, 'noop', 'no duplicate write is needed after the initial publish succeeds');
      t.equal(updates.length, 1, 'later readiness transitions should not create duplicate role writes');
    } finally {
      await cleanup();
    }
  },
);

test(
  'MessageGroupService - defers rebalancer initialization until traffic ready',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    const readinessState = createTrafficReadinessState();
    let service = null;

    try {
      service = new MessageGroupService({
        groupId: 'mg-ready-gate',
        replicaId: 'mg-ready-gate-r1',
        nodeId,
        transport: router,
        bootstrapReadinessState: readinessState,
      });

      service.initialized = true;
      service.systemTableCache = {
        get: () => null,
        getAll: () => [],
        filter: () => [],
      };
      service.cdcIntegrationService = {
        sqlQueryEngine: {
          executeQuery: async () => ({success: true, rows: []}),
        },
      };
      service.tablePolicyService = {};
      service.rebalanceCoordinator = {
        initialize: () => {},
      };
      service.isLeaderReplica = () => true;

      readinessState.transitionTo(LIFECYCLE_PHASE.CONTROL_READY, {
        ready: false,
        reasons: [LIFECYCLE_REASON.LEADER_METADATA_INCOMPLETE],
      });
      service.maybeInitializeRebalancer();
      t.notOk(
        service.rebalancer,
        'should not initialize message-group rebalancer before traffic-ready lifecycle',
      );

      readinessState.transitionTo(LIFECYCLE_PHASE.TRAFFIC_READY, {
        ready: true,
        reasons: [],
      });
      service.maybeInitializeRebalancer();
      t.ok(
        service.rebalancer,
        'should initialize message-group rebalancer after traffic-ready lifecycle',
      );
    } finally {
      await service?.shutdown?.();
      await cleanup();
    }
  },
);

test('MessageGroupService - persists leader node updates to message groups table', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  const updates = [];
  const mockCdcIntegrationService = {
    updateSystemTableRow: async (tableName, whereClause, data, options) => {
      updates.push({tableName, whereClause, data, options});
      return {success: true};
    },
  };
  const systemTableCache = new SystemTableCache();
  const messageGroupsPartitionId = INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.MESSAGE_GROUPS];
  systemTableCache.applySystemTableChange(TABLES.PARTITIONS, CDC_OPERATION.INSERT, {
    [COLUMN.PARTITION_ID]: messageGroupsPartitionId,
    [COLUMN.TABLE_ID]: SYSTEM_TABLE_NAME.MESSAGE_GROUPS,
    [COLUMN.LEADER_NODE_ID]: nodeId,
  });
  systemTableCache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.INSERT, {
    [COLUMN.SERVICE_ID]: 'message-groups-leader',
    [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
    [COLUMN.PARTITION_ID]: messageGroupsPartitionId,
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.RAFT_ROLE]: RaftRole.LEADER,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.ADDRESS]: `${nodeId}/partition/message-groups-leader`,
  });

  try {
    const service = new MessageGroupService({
      groupId: 'mg-1',
      replicaId: 'mg-1-r1',
      nodeId,
      transport: router,
      cdcIntegrationService: mockCdcIntegrationService,
    });

    await service.initialize();
    service.systemTableCache = systemTableCache;
    service.setCdcIntegrationService(mockCdcIntegrationService);

    await new Promise((resolve) => setImmediate(resolve));

    const leaderUpdate = updates.find(
      (update) =>
        update.tableName === SYSTEM_TABLE_NAME.MESSAGE_GROUPS &&
        update.whereClause?.[COLUMN.GROUP_ID] === 'mg-1' &&
        update.data?.[COLUMN.LEADER_NODE_ID] === nodeId,
    );

    t.ok(leaderUpdate, 'leader node update should be persisted via CDC');
    t.same(
      leaderUpdate?.options?.expectedCacheFields,
      {[COLUMN.LEADER_NODE_ID]: nodeId},
      'leader cache wait should only require canonical leader identity',
    );
    t.equal(
      leaderUpdate?.options?.routingReadinessDimension,
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
      'leader node persistence should route through control-plane recovery readiness',
    );
    t.equal(
      leaderUpdate?.options?.deliveryPriority,
      'critical',
      'control-plane message-group leader publication should stay on the critical lane',
    );

    await service.shutdown();
  } finally {
    await cleanup();
  }
});

test('MessageGroupService - sendMessage creates message envelope', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  try {
    const service = new MessageGroupService({
      groupId: 'mg-1',
      replicaId: 'mg-1-r1',
      nodeId,
      transport: router,
    });

    await service.initialize();

    const result = await service.sendMessage('target-service', {
      type: 'TEST',
      data: 'hello',
    });

    t.ok(result.messageId, 'Should return messageId');
    t.ok(result.status, 'Should return status');

    await service.shutdown();
  } finally {
    await cleanup();
  }
});

test('MessageGroupService - QUERY direct-only delivery clears pending envelope ' +
  'after success',
async (t) => {
  const transport = {
    async deliver() {
      return {
        acknowledged: true,
        success: true,
        rows: [{value: 1}],
      };
    },
    async initialize() {},
    async shutdown() {},
    setServiceNodeResolver() {},
  };

  const service = new MessageGroupService({
    groupId: 'mg-query-cleanup-success',
    replicaId: 'mg-query-cleanup-success-r1',
    nodeId: 'node-query-cleanup-success',
    transport,
  });

  service.initialized = true;
  service.retryMaxAttempts = 1;
  service.sleep = async () => {};

  const result = await service.sendMessage('node-x/partition/p1', {
    type: 'QUERY',
    sql: 'SELECT 1',
    params: [],
  });

  t.equal(result.status, MessageStatus.DELIVERED,
    'query delivery should succeed directly');
  t.equal(service.pendingMessages.size, 0,
    'direct-only success should not retain pending envelopes');
});

test('MessageGroupService - QUERY payload uses fast non-durable delivery path',
  async (t) => {
    let deliverCalls = 0;
    const transport = {
      async deliver() {
        deliverCalls += 1;
        return {
          acknowledged: false,
          error: 'Message timeout',
        };
      },
      async initialize() {},
      async shutdown() {},
      setServiceNodeResolver() {},
    };

    const service = new MessageGroupService({
      groupId: 'mg-query-fast-path',
      replicaId: 'mg-query-fast-path-r1',
      nodeId: 'node-query-fast-path',
      transport,
    });

    service.initialized = true;
    service.retryMaxAttempts = 4;
    service.sleep = async () => {};

    let persistCalls = 0;
    service.persistToRaftLog = async () => {
      persistCalls += 1;
      return {success: true};
    };

    await t.rejects(
      service.sendMessage('node-x/partition/p1', {
        type: 'QUERY',
        sql: 'SELECT 1',
        params: [],
      }),
      /Message timeout/,
      'query message failure should fail fast instead of being persisted',
    );

    t.equal(deliverCalls, 1, 'query message should not retry transport delivery');
    t.equal(
      persistCalls,
      0,
      'query message should not be persisted to raft when direct delivery fails',
    );
    t.equal(service.pendingMessages.size, 0,
      'query fast-path failure should not retain pending envelopes');
  });

test('MessageGroupService - QUERY payload preserves deferred retry metadata',
  async (t) => {
    let deliverCalls = 0;
    const transport = {
      async deliver() {
        deliverCalls += 1;
        return {
          acknowledged: false,
          error: 'No connection to node seed',
          errorCode: 'ROUTER_NO_CONNECTION',
          deferRetry: true,
          retryAfterMs: 250,
        };
      },
      async initialize() {},
      async shutdown() {},
      setServiceNodeResolver() {},
    };

    const service = new MessageGroupService({
      groupId: 'mg-query-deferred',
      replicaId: 'mg-query-deferred-r1',
      nodeId: 'node-query-deferred',
      transport,
    });

    service.initialized = true;
    service.retryMaxAttempts = 4;
    service.sleep = async () => {};

    let persistCalls = 0;
    service.persistToRaftLog = async () => {
      persistCalls += 1;
      return {success: true};
    };

    try {
      await service.sendMessage('node-x/partition/p1', {
        type: 'QUERY',
        sql: 'SELECT 1',
        params: [],
      });
      t.fail('query delivery should reject when transport defers');
    } catch (error) {
      t.equal(deliverCalls, 1,
        'query message should not multiply direct retries when transport defers');
      t.equal(error?.code, 'ROUTER_NO_CONNECTION',
        'query failure should preserve the transport error code');
      t.equal(error?.deferRetry, true,
        'query failure should preserve the defer-retry hint');
      t.equal(error?.retryAfterMs, 250,
        'query failure should preserve retryAfterMs for upstream owners');
      t.equal(persistCalls, 0,
        'query delivery should still skip raft persistence on direct failure');
      t.equal(service.pendingMessages.size, 0,
        'deferred direct-only query failure should not retain pending envelopes');
    }
  });

test('MessageGroupService - QUERY payload preserves deferred retry metadata from thrown transport errors',
  async (t) => {
    let deliverCalls = 0;
    const transport = {
      async deliver() {
        deliverCalls += 1;
        const error = new Error('Connection to node seed closed');
        error.code = 'ROUTER_CONNECTION_CLOSED';
        error.deferRetry = true;
        error.retryAfterMs = 300;
        throw error;
      },
      async initialize() {},
      async shutdown() {},
      setServiceNodeResolver() {},
    };

    const service = new MessageGroupService({
      groupId: 'mg-query-deferred-throw',
      replicaId: 'mg-query-deferred-throw-r1',
      nodeId: 'node-query-deferred-throw',
      transport,
    });

    service.initialized = true;
    service.retryMaxAttempts = 4;
    service.sleep = async () => {};

    try {
      await service.sendMessage('node-x/partition/p1', {
        type: 'QUERY',
        sql: 'SELECT 1',
        params: [],
      });
      t.fail('query delivery should reject when thrown transport error defers');
    } catch (error) {
      t.equal(deliverCalls, 1,
        'query message should not multiply direct retries on thrown deferred errors');
      t.equal(error?.code, 'ROUTER_CONNECTION_CLOSED',
        'thrown deferred errors should preserve the transport error code');
      t.equal(error?.deferRetry, true,
        'thrown deferred errors should preserve defer-retry hints');
      t.equal(error?.retryAfterMs, 300,
        'thrown deferred errors should preserve retryAfterMs for upstream owners');
      t.equal(service.pendingMessages.size, 0,
        'thrown deferred query failure should not retain pending envelopes');
    }
  });

test('MessageGroupService - QUERY payload forwards transport delivery options',
  async (t) => {
    const capturedOptions = [];
    const transport = {
      async deliver(_targetService, _message, options) {
        capturedOptions.push(options);
        return {
          acknowledged: true,
          success: true,
          rows: [],
        };
      },
      async initialize() {},
      async shutdown() {},
      setServiceNodeResolver() {},
    };

    const service = new MessageGroupService({
      groupId: 'mg-query-delivery-options',
      replicaId: 'mg-query-delivery-options-r1',
      nodeId: 'node-query-delivery-options',
      transport,
    });

    service.initialized = true;
    service.persistToRaftLog = async () => ({success: true});

    const result = await service.sendMessage(
      TEST_CRITICAL_TRANSPORT_PARTITION_ADDRESS,
      {
        type: 'QUERY',
        sql: 'SELECT 1',
        params: [],
      },
      {
        transportDeliveryOptions: {
          timeoutMs: 4321,
        },
      },
    );

    t.equal(result.acknowledged, true,
      'query delivery should still succeed');
    t.equal(capturedOptions.length, 1,
      'query delivery should perform one direct transport attempt');
    t.equal(capturedOptions[0]?.timeoutMs, 4321,
      'query delivery should forward timeoutMs to the underlying transport');
    t.equal(capturedOptions[0]?.deliveryPriority, 'critical',
      'query delivery should preserve critical delivery priority for critical transport targets');
  });

test('MessageGroupService - idempotent control-plane payloads use direct-only delivery',
  async (t) => {
    let deliverCalls = 0;
    const transport = {
      async deliver() {
        deliverCalls += 1;
        return {
          acknowledged: false,
          error: 'No connection to node seed',
          errorCode: 'ROUTER_NO_CONNECTION',
          deferRetry: true,
          retryAfterMs: 250,
        };
      },
      async initialize() {},
      async shutdown() {},
      setServiceNodeResolver() {},
    };

    const service = new MessageGroupService({
      groupId: 'mg-control-plane-direct',
      replicaId: 'mg-control-plane-direct-r1',
      nodeId: 'node-control-plane-direct',
      transport,
    });

    service.initialized = true;
    service.retryMaxAttempts = 4;
    service.sleep = async () => {};

    let persistCalls = 0;
    service.persistToRaftLog = async () => {
      persistCalls += 1;
      return {success: true};
    };

    try {
      await service.sendMessage('seed-node/message-group/mg-1-r1', {
        type: ControlPlaneMessageType.REPLICA_OPERATION_DISPATCH,
        operationId: 'op-1',
      });
      t.fail('control-plane delivery should reject when transport defers');
    } catch (error) {
      t.equal(deliverCalls, 1,
        'control-plane message should not multiply direct retries');
      t.equal(error?.code, 'ROUTER_NO_CONNECTION',
        'control-plane failure should preserve the transport error code');
      t.equal(error?.deferRetry, true,
        'control-plane failure should preserve defer-retry hints');
      t.equal(error?.retryAfterMs, 250,
        'control-plane failure should preserve retryAfterMs for upstream owners');
      t.equal(persistCalls, 0,
        'idempotent control-plane messages should not be persisted to raft');
      t.equal(service.pendingMessages.size, 0,
        'direct-only control-plane failure should not retain pending envelopes');
    }
  });
