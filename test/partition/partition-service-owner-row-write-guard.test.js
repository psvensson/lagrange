/**
 * PartitionService owner-row metadata writes (services role, partitions
 * leader): each confirms against the durable row its CDC service reads
 * authoritatively and is guarded by the observed row state.
 * Moved from partition-service.test.js (file-size ratchet).
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {
  PartitionService,
  RaftRole,
  CDCOperation,
} from '../../src/partition/partition-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {COLUMN, TABLES} from '../../src/constants/index.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {withFoundingStamp} from './partition-founding-stamp.js';
import {
  authoritativeSystemTableRead,
  partitionCollaboratorOptions,
} from '../helpers/partition-service-fixture.js';

// A durable store holding the given row of one system table.
function durableRows(tableName, row) {
  const store = new SystemTableCache();
  store.applySystemTableChange(tableName, CDCOperation.INSERT, row);
  return store;
}

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: 'test-node'}});
  const logger = LoggingService.getInstance();
  logger.initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

test('PartitionService - leader mutation helper guards owner writes with observed row state',
  async (t) => {
    const systemTableCache = new SystemTableCache();
    systemTableCache.applySystemTableChange(TABLES.PARTITIONS, CDCOperation.INSERT, {
      [COLUMN.PARTITION_ID]: 'guarded-partition-1',
      [COLUMN.TABLE_ID]: 'guarded_table',
      [COLUMN.LEADER_NODE_ID]: 'node-1',
      [COLUMN.UPDATED_AT]: 77,
    });

    let capturedWhereClause = null;
    const partition = new PartitionService(partitionCollaboratorOptions(withFoundingStamp({
      partitionId: 'guarded-partition-1',
      tableId: 'guarded_table',
      tableName: 'guarded_table',
      replicaId: 'guarded-partition-1-r1',
      replicaIds: ['guarded-partition-1-r1'],
      nodeId: 'node-1',
      dbPath: ':memory:',
      suppressLifecycleLogs: true,
      systemTableCache,
      cdcIntegrationService: {
        executeAuthoritativeSystemTableRead:
          authoritativeSystemTableRead(systemTableCache),
        updateSystemTableRow: async (_tableName, whereClause) => {
          capturedWhereClause = whereClause;
          return {success: true};
        },
      },
    })));

    partition.isLeader = true;
    partition.isPartitionsLeaderAvailable = () => true;
    partition.leaderNodeMutationHelper.pendingValue = 'node-2';

    await partition.leaderNodeMutationHelper.flush();

    t.same(capturedWhereClause, {
      [COLUMN.PARTITION_ID]: 'guarded-partition-1',
      [COLUMN.LEADER_NODE_ID]: 'node-1',
      [COLUMN.UPDATED_AT]: 77,
    }, 'leader owner writes should include the observed owner-row guard fields');

    await partition.shutdown();
  });

test('PartitionService - flushes services role update when local services leader exists',
  async (t) => {
    const updates = [];
    const partition = new PartitionService(partitionCollaboratorOptions(withFoundingStamp({
      partitionId: 'services-p1',
      tableId: 'services',
      tableName: 'services',
      replicaId: 'services-p1-r1',
      replicaIds: ['services-p1-r1'],
      nodeId: 'node-1',
      dbPath: ':memory:',
      suppressLifecycleLogs: true,
      systemTableCache: new SystemTableCache(),
      cdcIntegrationService: {
        // The durable services row the role write confirms and guards from
        // (registered, no role published yet).
        executeAuthoritativeSystemTableRead: authoritativeSystemTableRead(
          durableRows(TABLES.SERVICES, {
            service_id: 'services-p1-r1',
            service_type: 'partition',
            partition_id: 'services-p1',
            replica_id: 'services-p1-r1',
            node_id: 'node-1',
            [COLUMN.STATUS]: ReplicaStatus.ACTIVE,
          })),
        canWriteSystemTableLocally: (tableName) => tableName === SYSTEM_TABLE_NAME.SERVICES,
        updateSystemTableRow: async (tableName, whereClause, data) => {
          updates.push({tableName, whereClause, data});
          return {success: true};
        },
      },
    })));

    partition.pendingRoleUpdate = RaftRole.LEADER;
    partition.persistedRole = null;

    const result = await partition.flushRoleUpdate();

    t.equal(result.reason, 'applied', 'should persist when the local services leader owns the write');
    t.equal(updates.length, 1, 'should issue one services-table write');
    t.equal(updates[0].tableName, SYSTEM_TABLE_NAME.SERVICES, 'should target services');
    t.same(updates[0].whereClause, {
      service_id: 'services-p1-r1',
      service_type: 'partition',
      partition_id: 'services-p1',
      replica_id: 'services-p1-r1',
      node_id: 'node-1',
    }, 'should fence the role write to the full replica identity');
    t.equal(
      updates[0].data?.raft_role,
      RaftRole.FOLLOWER,
      'canonical leader ownership should publish follower metadata only',
    );
    t.equal(partition.pendingRoleUpdate, null, 'should clear pending role after success');
    t.equal(partition.persistedRole, RaftRole.FOLLOWER, 'should track the published metadata role');

    await partition.shutdown();
  });

test('PartitionService - flushes partition leader update when local partitions leader exists',
  async (t) => {
    const updates = [];
    const partition = new PartitionService(partitionCollaboratorOptions(withFoundingStamp({
      partitionId: 'partitions-p1',
      tableId: 'partitions',
      tableName: 'partitions',
      replicaId: 'partitions-p1-r1',
      replicaIds: ['partitions-p1-r1'],
      nodeId: 'node-1',
      dbPath: ':memory:',
      suppressLifecycleLogs: true,
      systemTableCache: new SystemTableCache(),
      cdcIntegrationService: {
        // The durable partitions row the leader write confirms and guards
        // from (no leader published yet).
        executeAuthoritativeSystemTableRead: authoritativeSystemTableRead(
          durableRows(TABLES.PARTITIONS, {
            [COLUMN.PARTITION_ID]: 'partitions-p1',
            [COLUMN.TABLE_ID]: 'partitions',
            [COLUMN.UPDATED_AT]: 1,
          })),
        canWriteSystemTableLocally: (tableName) =>
          tableName === SYSTEM_TABLE_NAME.PARTITIONS,
        updateSystemTableRow: async (tableName, whereClause, data) => {
          updates.push({tableName, whereClause, data});
          return {success: true};
        },
      },
    })));

    partition.isLeader = true;
    partition.pendingLeaderNodeUpdate = 'node-1';
    partition.persistedLeaderNodeId = null;

    const result = await partition.flushLeaderNodeUpdate();

    t.equal(
      result.reason,
      'applied',
      'should persist when the local partitions leader owns the write',
    );
    t.equal(updates.length, 1, 'should issue one partitions-table write');
    t.equal(
      updates[0].tableName,
      SYSTEM_TABLE_NAME.PARTITIONS,
      'should target partitions',
    );
    // Guarded by the observed durable row, as every leader owner write is.
    t.same(updates[0].whereClause, {
      [COLUMN.PARTITION_ID]: 'partitions-p1',
      [COLUMN.UPDATED_AT]: 1,
    }, 'should update the local partitions owner row');
    t.equal(
      updates[0].data?.[COLUMN.LEADER_NODE_ID],
      'node-1',
      'should publish the elected leader node id',
    );
    t.equal(
      partition.pendingLeaderNodeUpdate,
      null,
      'pending leader update should clear after success',
    );
    t.equal(
      partition.persistedLeaderNodeId,
      'node-1',
      'persisted leader update should track the published owner metadata',
    );

    await partition.shutdown();
  });
