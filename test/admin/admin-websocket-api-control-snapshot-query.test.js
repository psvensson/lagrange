/**
 * Tests for Admin WebSocket API.
 * Requirements: 32.1-32.39
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  connectAndReceive,
  createAuthoritativeCacheGateway,
  createAuthoritativeRepairCache,
  createMockQueryEngine,
  createPopulatedCache,
  createSystemTableRepairQueryEngine,
  getAuthoritativeRepairReadTables,
  waitForMessage,
} from './admin-websocket-api-test-support.js';
import {AdminWebSocketAPI, MessageType} from
  '../../src/admin/admin-websocket-api.js';
import {
  ADMIN_CONTROL_SNAPSHOT,
} from '../../src/admin/admin-constants.js';
import {createReadOnlyCache} from '../../src/cache/read-only-system-table-cache.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {COLUMN, TABLES, SERVICE_TYPE} from '../../src/constants/index.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE,
  CONTROL_PLANE_SNAPSHOT_REFRESH_STATE,
} from '../../src/control-plane/control-plane-snapshot-owner.js';
import {
  DEFAULT_AUTHORITATIVE_REPAIR_TABLES,
} from '../../src/admin/admin-authoritative-repair-policy.js';

// Initialize services for tests
ConfigurationManager.getInstance().initialize();
LoggingService.getInstance().initialize({level: 'error'});

const ERROR_UNEXPECTED_AUTHORITATIVE_PUBLISHED_MEMBERSHIP_READ =
  'unexpected_authoritative_published_membership_read';
const TEST_LOCAL_SYSTEM_OBSERVATION_QUERY_ID =
  'q-snapshot-local-services-observation';
const TEST_LOCAL_SYSTEM_OBSERVATION_SQL =
  'SELECT * FROM services WHERE service_type = \'partition\'';
const TEST_LOCAL_SYSTEM_OBSERVATION_GAP_SERVICE_ID =
  'svc-gap-partition-node-2';
const TEST_LOCAL_SYSTEM_OBSERVATION_GAP_NODE_ID =
  'node-gap-partition-2';
const TEST_LOCAL_SYSTEM_OBSERVATION_LOCAL_NODE_ID =
  'node-1';
const TEST_LOCAL_SYSTEM_OBSERVATION_GAP_PARTITION_ID =
  'partition-1';
const TEST_LOCAL_SYSTEM_OBSERVATION_GAP_REPLICA_ID =
  'partition-gap-r1';
const TEST_LOCAL_SYSTEM_OBSERVATION_GAP_ADDRESS =
  'node-gap-partition-2/partition/partition-1-r4';
const TEST_LOCAL_SYSTEM_OBSERVATION_ACTIVE_STATUS =
  'active';
const TEST_LOCAL_SYSTEM_OBSERVATION_LANE =
  'snapshot';

test('AdminWebSocketAPI - local control snapshot query avoids distributed fanout',
  async (t) => {
    let executeRequestCalls = 0;
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: createPopulatedCache(),
      sqlQueryEngine: {
        executeRequest: async () => {
          executeRequestCalls++;
          return {success: true, rows: [{id: 'unexpected'}]};
        },
      },
    });

    await api.initialize(0, {listen: false});
    const {ws} = await connectAndReceive(api);

    const startedAt = Date.now();
    ws.send(JSON.stringify({
      type: MessageType.QUERY,
      queryId: 'q-control-snapshot',
      sql: 'SELECT * FROM control_snapshot_local()',
    }));

    const response = await waitForMessage(ws);
    const elapsedMs = Date.now() - startedAt;

    t.equal(response.type, MessageType.QUERY_RESULT, 'should return query_result');
    t.equal(response.queryId, 'q-control-snapshot', 'should preserve query id');
    t.equal(elapsedMs < 100, true, 'query should complete within local bound');
    t.equal(Array.isArray(response.results), true, 'query result should include rows');
    t.equal(response.results.length, 1, 'query should return one snapshot row');
    t.equal(response.results[0].schemaVersion, 1, 'query should expose snapshot schema');
    t.equal(typeof response.results[0].voterCounts, 'object',
      'query result should include voter-count map');
    t.equal(executeRequestCalls, 0,
      'local control snapshot query should not execute distributed SQL requests');

    ws.close();
    await api.shutdown();
  });

test(
  'AdminWebSocketAPI - snapshot lane control snapshot query stays local ' +
    'under stale cache conditions',
  async (t) => {
    const nowMs = 1740589945123;
    const staleHeartbeatMs = nowMs - 45000;
    const writableCache = createAuthoritativeRepairCache('node-local');
    writableCache.applySystemTableChange(TABLES.NODES, 'UPDATE', {
      id: 'node-local',
      node_id: 'node-local',
      address: 'localhost:8080',
      node_address: 'localhost:8080',
      status: 'active',
      connection_state: 'ready',
      last_heartbeat: staleHeartbeatMs,
      ready_lease_expires_at: staleHeartbeatMs + 15000,
    });

    const repairEngine = createSystemTableRepairQueryEngine({
      [TABLES.NODES]: writableCache.getAll(TABLES.NODES),
      [TABLES.PARTITIONS]: writableCache.getAll(TABLES.PARTITIONS),
      [TABLES.SERVICES]: writableCache.getAll(TABLES.SERVICES),
      [TABLES.TABLES]: writableCache.getAll(TABLES.TABLES),
      [TABLES.NODE_ENDPOINTS]: writableCache.getAll(TABLES.NODE_ENDPOINTS),
      [TABLES.SERVICE_DEFINITIONS]:
        writableCache.getAll(TABLES.SERVICE_DEFINITIONS),
      [TABLES.SERVICE_ENDPOINTS]:
        writableCache.getAll(TABLES.SERVICE_ENDPOINTS),
      [TABLES.REPLICA_OPERATIONS]:
        writableCache.getAll(TABLES.REPLICA_OPERATIONS),
    });
    const readinessCalls = [];
    const api = new AdminWebSocketAPI({
      nodeId: 'node-local',
      systemTableCache: createReadOnlyCache(writableCache),
      cacheMutationTarget: writableCache,
      sqlQueryEngine: repairEngine,
      controlPlaneReadinessService: {
        async getAllNodeReadiness(options) {
          readinessCalls.push(options);
          return [];
        },
      },
      nowFn: () => nowMs,
    });

    const result = await api.executeLocalQueryEnvelope(
      {
        queryId: 'q-snapshot-local-only',
        sql: 'SELECT * FROM control_snapshot_local()',
        params: [],
      },
      {
        clientInfo: {
          lane: 'snapshot',
        },
      },
    );

    t.equal(result.success, true, 'snapshot lane query should succeed');
    t.equal(
      repairEngine.executeRequestCalls.length,
      0,
      'snapshot lane query should not trigger authoritative repair reads',
    );
    t.equal(readinessCalls.length > 0, true,
      'snapshot lane query should consult readiness diagnostics');
    t.equal(
      readinessCalls.every((options) =>
        options?.allowAuthoritativeRefresh === false &&
        options?.allowStaleOnCacheChange === true &&
        options?.maxCachedAgeMs === 5000),
      true,
      'snapshot lane query should keep readiness diagnostics local',
    );
  },
);

test(
  'AdminWebSocketAPI - snapshot lane raw system-table observation stays ' +
    'local under shared metadata coverage gaps',
  async (t) => {
    const writableCache = createPopulatedCache();
    writableCache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
      [COLUMN.SERVICE_ID]: TEST_LOCAL_SYSTEM_OBSERVATION_GAP_SERVICE_ID,
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
      [COLUMN.NODE_ID]: TEST_LOCAL_SYSTEM_OBSERVATION_GAP_NODE_ID,
      [COLUMN.PARTITION_ID]: TEST_LOCAL_SYSTEM_OBSERVATION_GAP_PARTITION_ID,
      [COLUMN.REPLICA_ID]: TEST_LOCAL_SYSTEM_OBSERVATION_GAP_REPLICA_ID,
      [COLUMN.STATUS]: TEST_LOCAL_SYSTEM_OBSERVATION_ACTIVE_STATUS,
      [COLUMN.ADDRESS]: TEST_LOCAL_SYSTEM_OBSERVATION_GAP_ADDRESS,
    });

    const repairEngine = createSystemTableRepairQueryEngine({
      [TABLES.SERVICES]: writableCache.getAll(TABLES.SERVICES),
    });
    const api = new AdminWebSocketAPI({
      nodeId: TEST_LOCAL_SYSTEM_OBSERVATION_LOCAL_NODE_ID,
      systemTableCache: createReadOnlyCache(writableCache),
      cacheMutationTarget: writableCache,
      sqlQueryEngine: repairEngine,
    });

    const result = await api.executeLocalQueryEnvelope(
      {
        queryId: TEST_LOCAL_SYSTEM_OBSERVATION_QUERY_ID,
        sql: TEST_LOCAL_SYSTEM_OBSERVATION_SQL,
        params: [],
      },
      {
        clientInfo: {
          lane: TEST_LOCAL_SYSTEM_OBSERVATION_LANE,
        },
      },
    );

    t.equal(result.success, true, 'snapshot lane raw observation should succeed');
    t.equal(
      repairEngine.executeRequestCalls.length,
      0,
      'snapshot lane raw observation should not reopen authoritative SQL work',
    );
    t.equal(
      result.rows.some((row) => {
        return String(
          row?.[COLUMN.SERVICE_ID] ||
          row?.service_id ||
          row?.serviceId ||
          row?.id ||
          '',
        ) === TEST_LOCAL_SYSTEM_OBSERVATION_GAP_SERVICE_ID;
      }),
      true,
      'snapshot lane raw observation should preserve the local cache view while repair remains deferred',
    );
  },
);

test(
  'AdminWebSocketAPI - snapshot lane control snapshot does not escalate ' +
    'published-membership recovery authoritatively',
  async (t) => {
    const nowMs = 1740589945123;
    const writableCache = createAuthoritativeRepairCache('node-local');
    writableCache.applySystemTableChange(TABLES.CONTROL_PLANE_PUBLICATIONS, 'INSERT', {
      publication_id: 'publication-8',
      publication_kind: 'cluster_membership',
      publication_epoch: 8,
      status: 'OPEN',
      published_active_node_ids: ['node-local', 'node-2'],
      required_ack_node_ids: ['node-local', 'node-2'],
      acknowledged_node_ids: ['node-local'],
    });

    const publishedReadOptions = [];
    const api = new AdminWebSocketAPI({
      nodeId: 'node-local',
      systemTableCache: createReadOnlyCache(writableCache),
      cacheMutationTarget: writableCache,
      controlPlaneReadinessService: {
        async getAllNodeReadiness(_options) {
          return [{
            nodeId: 'node-local',
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
            },
            membershipPublication: {
              publicationEpoch: 8,
              status: 'OPEN',
              publishedActiveNodeIds: ['node-local', 'node-2'],
              requiredAckNodeIds: ['node-local', 'node-2'],
              acknowledgedNodeIds: ['node-local'],
            },
          }];
        },
        membershipPublicationService: {
          getLatestClusterPublicationSync() {
            return {
              publication_id: 'publication-8',
              publication_kind: 'cluster_membership',
              publication_epoch: 8,
              status: 'OPEN',
              published_active_node_ids: ['node-local', 'node-2'],
              required_ack_node_ids: ['node-local', 'node-2'],
              acknowledged_node_ids: ['node-local'],
            };
          },
          getLatestPublishedClusterPublicationSync() {
            return null;
          },
          async getLatestPublishedClusterPublication(options = {}) {
            publishedReadOptions.push(options);
            if (options.preferAuthoritativeRead === true) {
              throw new Error(
                ERROR_UNEXPECTED_AUTHORITATIVE_PUBLISHED_MEMBERSHIP_READ,
              );
            }
            return null;
          },
        },
      },
      nowFn: () => nowMs,
    });

    const result = await api.executeLocalQueryEnvelope(
      {
        queryId: 'q-snapshot-no-authoritative-membership-recovery',
        sql: 'SELECT * FROM control_snapshot_local()',
        params: [],
      },
      {
        clientInfo: {
          lane: 'snapshot',
        },
      },
    );

    t.equal(result.success, true, 'snapshot lane query should succeed');
    t.same(
      publishedReadOptions,
      [],
      'snapshot lane query should not reopen published-membership recovery reads',
    );
    t.match(
      result.rows?.[0]?.controlPlaneDiagnostics?.publishedMembershipObservation,
      {
        publicationObservation: {
          state: 'unavailable',
        },
      },
      'snapshot lane query should expose missing durable published membership explicitly instead of escalating',
    );
  },
);

test('AdminWebSocketAPI - forced control snapshot query routes through ' +
  'authoritative repair path', async (t) => {
  const writableCache = createPopulatedCache();
  const repairEngine = createSystemTableRepairQueryEngine({
    [TABLES.NODES]: writableCache.getAll(TABLES.NODES),
    [TABLES.PARTITIONS]: writableCache.getAll(TABLES.PARTITIONS),
    [TABLES.SERVICES]: writableCache.getAll(TABLES.SERVICES),
    [TABLES.TABLES]: writableCache.getAll(TABLES.TABLES),
    [TABLES.NODE_ENDPOINTS]: writableCache.getAll(TABLES.NODE_ENDPOINTS),
    [TABLES.SERVICE_DEFINITIONS]:
      writableCache.getAll(TABLES.SERVICE_DEFINITIONS),
    [TABLES.SERVICE_ENDPOINTS]:
      writableCache.getAll(TABLES.SERVICE_ENDPOINTS),
    [TABLES.REPLICA_OPERATIONS]:
      writableCache.getAll(TABLES.REPLICA_OPERATIONS),
  });
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    systemTableCache: createReadOnlyCache(writableCache),
    cacheMutationTarget: writableCache,
    controlPlaneSystemTableGateway: createAuthoritativeCacheGateway(writableCache, {
      queryEngine: repairEngine,
    }),
    sqlQueryEngine: repairEngine,
  });

  const result = await api.executeLocalQueryEnvelope({
    queryId: 'q-force-control-snapshot',
    sql: ADMIN_CONTROL_SNAPSHOT.QUERY_SQL_FORCE_REPAIR,
    params: [],
  });
  t.equal(result.success, true, 'forced control snapshot query should succeed');
  t.equal(Array.isArray(result.rows), true, 'forced query should return one snapshot row');
  t.equal(
    repairEngine.executeRequestCalls.includes(`SELECT * FROM ${TABLES.PARTITIONS}`),
    true,
    'forced control snapshot query should run authoritative repair reads',
  );
});

test(
  'AdminWebSocketAPI - snapshot lane forced control snapshot keeps readiness local while repairing discovery',
  async (t) => {
    const nowMs = 1740589945123;
    const staleHeartbeatMs = nowMs - 45000;
    const writableCache = createAuthoritativeRepairCache('node-local');
    writableCache.applySystemTableChange(TABLES.NODES, 'UPDATE', {
      id: 'node-local',
      node_id: 'node-local',
      address: 'localhost:8080',
      node_address: 'localhost:8080',
      status: 'active',
      connection_state: 'ready',
      last_heartbeat: staleHeartbeatMs,
      ready_lease_expires_at: staleHeartbeatMs + 15000,
    });

    const authoritativeNodes = [{
      ...writableCache.get(TABLES.NODES, 'node-local'),
      last_heartbeat: nowMs - 1000,
      ready_lease_expires_at: nowMs + 15000,
    }];
    const repairEngine = createSystemTableRepairQueryEngine({
      [TABLES.NODES]: authoritativeNodes,
      [TABLES.PARTITIONS]: writableCache.getAll(TABLES.PARTITIONS),
      [TABLES.SERVICES]: writableCache.getAll(TABLES.SERVICES),
      [TABLES.TABLES]: writableCache.getAll(TABLES.TABLES),
      [TABLES.NODE_ENDPOINTS]: writableCache.getAll(TABLES.NODE_ENDPOINTS),
      [TABLES.SERVICE_DEFINITIONS]:
        writableCache.getAll(TABLES.SERVICE_DEFINITIONS),
      [TABLES.SERVICE_ENDPOINTS]:
        writableCache.getAll(TABLES.SERVICE_ENDPOINTS),
      [TABLES.REPLICA_OPERATIONS]:
        writableCache.getAll(TABLES.REPLICA_OPERATIONS),
    });
    const readinessCalls = [];
    const api = new AdminWebSocketAPI({
      nodeId: 'node-local',
      systemTableCache: createReadOnlyCache(writableCache),
      cacheMutationTarget: writableCache,
      controlPlaneSystemTableGateway: createAuthoritativeCacheGateway(
        writableCache,
        {
          queryEngine: repairEngine,
        },
      ),
      sqlQueryEngine: repairEngine,
      controlPlaneReadinessService: {
        async getAllNodeReadiness(options) {
          readinessCalls.push(options);
          return [];
        },
      },
      nowFn: () => nowMs,
    });

    const result = await api.executeLocalQueryEnvelope(
      {
        queryId: 'q-snapshot-force-local-readiness',
        sql: ADMIN_CONTROL_SNAPSHOT.QUERY_SQL_FORCE_REPAIR,
        params: [],
      },
      {
        clientInfo: {
          lane: 'snapshot',
        },
      },
    );

    t.equal(result.success, true, 'forced snapshot lane query should succeed');
    t.equal(
      repairEngine.executeRequestCalls.includes(`SELECT * FROM ${TABLES.NODES}`),
      true,
      'forced snapshot lane query should still run authoritative repair reads',
    );
    t.equal(readinessCalls.length > 0, true,
      'forced snapshot lane query should consult readiness diagnostics');
    t.equal(
      readinessCalls.every((options) =>
        options?.allowAuthoritativeRefresh === false &&
        options?.allowStaleOnCacheChange === true &&
        options?.maxCachedAgeMs === 5000),
      true,
      'forced snapshot lane query should keep readiness diagnostics on the local cached path before and after repair',
    );
  },
);

test(
  'AdminWebSocketAPI - forced control snapshot query fails when authoritative repair cannot apply',
  async (t) => {
    const writableCache = createPopulatedCache();
    const authoritativeGateway = createAuthoritativeCacheGateway(writableCache, {
      readRowsByTable: {
        [TABLES.PARTITIONS]: async () => {
          throw new Error('authoritative_partitions_unavailable');
        },
      },
    });
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: createReadOnlyCache(writableCache),
      cacheMutationTarget: writableCache,
      controlPlaneSystemTableGateway: authoritativeGateway,
      sqlQueryEngine: createMockQueryEngine(),
    });

    await t.rejects(
      api.buildControlSnapshotQueryResult({
        forceAuthoritativeRepair: true,
      }),
      /authoritative control snapshot repair failed/i,
      'forced control snapshot should fail closed when authoritative repair cannot complete',
    );
  },
);

test(
  'AdminWebSocketAPI - control snapshot builder stays local unless force repair is explicit',
  async (t) => {
    const nowMs = 1740589945123;
    const staleHeartbeatMs = nowMs - 45000;
    const writableCache = createAuthoritativeRepairCache('node-local');
    writableCache.applySystemTableChange(TABLES.NODES, 'UPDATE', {
      id: 'node-local',
      node_id: 'node-local',
      address: 'localhost:8080',
      node_address: 'localhost:8080',
      status: 'active',
      connection_state: 'ready',
      last_heartbeat: staleHeartbeatMs,
      ready_lease_expires_at: staleHeartbeatMs + 15000,
    });

    const authoritativeNodes = [
      {
        ...writableCache.get(TABLES.NODES, 'node-local'),
        last_heartbeat: nowMs - 1000,
      },
    ];
    const repairEngine = createSystemTableRepairQueryEngine({
      [TABLES.NODES]: authoritativeNodes,
      [TABLES.PARTITIONS]: writableCache.getAll(TABLES.PARTITIONS),
      [TABLES.SERVICES]: writableCache.getAll(TABLES.SERVICES),
      [TABLES.TABLES]: writableCache.getAll(TABLES.TABLES),
      [TABLES.NODE_ENDPOINTS]: writableCache.getAll(TABLES.NODE_ENDPOINTS),
      [TABLES.SERVICE_DEFINITIONS]:
        writableCache.getAll(TABLES.SERVICE_DEFINITIONS),
      [TABLES.SERVICE_ENDPOINTS]:
        writableCache.getAll(TABLES.SERVICE_ENDPOINTS),
      [TABLES.REPLICA_OPERATIONS]:
        writableCache.getAll(TABLES.REPLICA_OPERATIONS),
    });

    const api = new AdminWebSocketAPI({
      nodeId: 'node-local',
      systemTableCache: createReadOnlyCache(writableCache),
      cacheMutationTarget: writableCache,
      sqlQueryEngine: repairEngine,
      nowFn: () => nowMs,
    });

    const result = await api.buildControlSnapshotQueryResult();

    t.equal(result.success, true, 'local control snapshot should still succeed');
    t.equal(
      repairEngine.executeRequestCalls.length,
      0,
      'non-forced control snapshot builder should not trigger authoritative reads',
    );
    t.equal(
      writableCache.get(TABLES.NODES, 'node-local')?.last_heartbeat,
      staleHeartbeatMs,
      'non-forced control snapshot builder should preserve local cache state',
    );
  },
);

test(
  'AdminWebSocketAPI - forced control snapshot repairs partition topology gaps',
  async (t) => {
    const tableId = 'table-benchmark-events';
    const sourcePartitionId = 'partition-benchmark-events-v1';
    const leftPartitionId = 'partition-benchmark-events-left';
    const rightPartitionId = 'partition-benchmark-events-right';

    const writableCache = createPopulatedCache();
    writableCache.applySystemTableChange(TABLES.TABLES, 'INSERT', {
      id: tableId,
      table_id: tableId,
      name: 'benchmark_events',
      table_name: 'benchmark_events',
      active_partition_version: 2,
      partition_count: 2,
      partition_transition_state: 'split_cutover_active',
      partition_transition_metadata: JSON.stringify({
        workflowId: 'split-table-benchmark-events-v2',
        sourcePartitionId,
        targetPartitionVersion: 2,
        targetPartitionIds: [leftPartitionId, rightPartitionId],
      }),
    });
    writableCache.applySystemTableChange(TABLES.PARTITIONS, 'INSERT', {
      id: sourcePartitionId,
      partition_id: sourcePartitionId,
      table_id: tableId,
      table_name: 'benchmark_events',
      partition_version: 1,
      state: 'NORMAL',
    });

    const authoritativePartitions = [
      ...writableCache.getAll(TABLES.PARTITIONS),
      {
        id: leftPartitionId,
        partition_id: leftPartitionId,
        table_id: tableId,
        table_name: 'benchmark_events',
        partition_version: 2,
        state: 'NORMAL',
      },
      {
        id: rightPartitionId,
        partition_id: rightPartitionId,
        table_id: tableId,
        table_name: 'benchmark_events',
        partition_version: 2,
        state: 'NORMAL',
      },
    ];

    const repairEngine = createSystemTableRepairQueryEngine({
      [TABLES.NODES]: writableCache.getAll(TABLES.NODES),
      [TABLES.PARTITIONS]: authoritativePartitions,
      [TABLES.SERVICES]: writableCache.getAll(TABLES.SERVICES),
      [TABLES.TABLES]: writableCache.getAll(TABLES.TABLES),
      [TABLES.NODE_ENDPOINTS]: writableCache.getAll(TABLES.NODE_ENDPOINTS),
      [TABLES.SERVICE_DEFINITIONS]: writableCache.getAll(TABLES.SERVICE_DEFINITIONS),
      [TABLES.SERVICE_ENDPOINTS]: writableCache.getAll(TABLES.SERVICE_ENDPOINTS),
      [TABLES.REPLICA_OPERATIONS]: writableCache.getAll(TABLES.REPLICA_OPERATIONS),
    });

    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: createReadOnlyCache(writableCache),
      cacheMutationTarget: writableCache,
      controlPlaneSystemTableGateway: createAuthoritativeCacheGateway(writableCache, {
        queryEngine: repairEngine,
      }),
      sqlQueryEngine: repairEngine,
    });

    const result = await api.buildControlSnapshotQueryResult({
      forceAuthoritativeRepair: true,
    });
    const snapshot = result?.rows?.[0] || null;
    const partitionIds = Array.isArray(snapshot?.partitions) ?
      snapshot.partitions :
      [];

    t.equal(
      partitionIds.includes(leftPartitionId),
      true,
      'control snapshot should include repaired left child partition',
    );
    t.equal(
      partitionIds.includes(rightPartitionId),
      true,
      'control snapshot should include repaired right child partition',
    );
    t.equal(
      repairEngine.executeRequestCalls.includes(`SELECT * FROM ${TABLES.PARTITIONS}`),
      true,
      'control snapshot repair should query authoritative partitions rows',
    );
  },
);

test(
  'AdminWebSocketAPI - local control snapshot excludes staged split children before cutover',
  async (t) => {
    const nodeId = 'node-local';
    const tableId = 'table-benchmark-events';
    const sourcePartitionId = 'partition-benchmark-events-v1';
    const leftPartitionId = 'partition-benchmark-events-left';
    const rightPartitionId = 'partition-benchmark-events-right';
    const writableCache = createAuthoritativeRepairCache(nodeId);
    writableCache.applySystemTableChange(TABLES.TABLES, 'INSERT', {
      id: tableId,
      table_id: tableId,
      name: 'benchmark_events',
      table_name: 'benchmark_events',
      active_partition_version: 1,
      partition_count: 1,
      partition_transition_state: 'split_backfilling',
      partition_transition_metadata: JSON.stringify({
        workflowId: 'split-table-benchmark-events-v2',
        sourcePartitionId,
        targetPartitionVersion: 2,
        targetPartitionIds: [leftPartitionId, rightPartitionId],
      }),
    });
    writableCache.applySystemTableChange(TABLES.PARTITIONS, 'INSERT', {
      id: sourcePartitionId,
      partition_id: sourcePartitionId,
      table_id: tableId,
      table_name: 'benchmark_events',
      partition_version: 1,
      state: 'NORMAL',
      leader_node_id: nodeId,
    });
    writableCache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
      service_id: `${sourcePartitionId}-r1`,
      service_type: 'partition',
      node_id: nodeId,
      partition_id: sourcePartitionId,
      replica_id: `${sourcePartitionId}-r1`,
      raft_role: 'leader',
      status: 'active',
      address: `${nodeId}/partition/${sourcePartitionId}-r1`,
    });
    writableCache.applySystemTableChange(TABLES.PARTITIONS, 'INSERT', {
      id: leftPartitionId,
      partition_id: leftPartitionId,
      table_id: tableId,
      table_name: 'benchmark_events',
      partition_version: 2,
      state: 'NORMAL',
      leader_node_id: null,
    });
    writableCache.applySystemTableChange(TABLES.PARTITIONS, 'INSERT', {
      id: rightPartitionId,
      partition_id: rightPartitionId,
      table_id: tableId,
      table_name: 'benchmark_events',
      partition_version: 2,
      state: 'NORMAL',
      leader_node_id: null,
    });
    const api = new AdminWebSocketAPI({
      nodeId,
      systemTableCache: writableCache,
      sqlQueryEngine: createMockQueryEngine(),
    });

    const result = await api.buildControlSnapshotQueryResult();
    const snapshot = result?.rows?.[0] || null;
    const partitionIds = Array.isArray(snapshot?.partitions) ?
      snapshot.partitions :
      [];

    t.equal(
      partitionIds.includes(sourcePartitionId),
      true,
      'control snapshot should keep the active source partition visible',
    );
    t.equal(
      partitionIds.includes(leftPartitionId),
      false,
      'control snapshot should hide staged left child partitions before cutover',
    );
    t.equal(
      partitionIds.includes(rightPartitionId),
      false,
      'control snapshot should hide staged right child partitions before cutover',
    );
    t.equal(
      snapshot?.leaders?.[sourcePartitionId],
      nodeId,
      'control snapshot should keep the active source leader published',
    );
    t.equal(
      Object.prototype.hasOwnProperty.call(
        snapshot?.leaders || {},
        leftPartitionId,
      ),
      false,
      'control snapshot should not publish staged child leaders before cutover',
    );
    t.equal(
      snapshot?.voterCounts?.[sourcePartitionId],
      1,
      'control snapshot should keep the active source voter count published',
    );
    t.equal(
      Object.prototype.hasOwnProperty.call(
        snapshot?.voterCounts || {},
        leftPartitionId,
      ),
      false,
      'control snapshot should not publish staged child voter counts before cutover',
    );
  },
);

test(
  'AdminWebSocketAPI - forced control snapshot repairs stale replica operations through the canonical repair scope',
  async (t) => {
    const nowMs = 1740589945123;
    const writableCache = createAuthoritativeRepairCache('node-local');
    writableCache.applySystemTableChange(TABLES.REPLICA_OPERATIONS, 'INSERT', {
      operation_id: 'op-stale-replace',
      partition_id: `${TABLES.NODES}-p1`,
      entity_id: `${TABLES.NODES}-p1`,
      source_node_id: 'node-local',
      target_node_id: 'node-peer',
      type: 'REPLACE',
      status: 'creating',
      workflow_step: 'CREATING',
      created_at: nowMs - 180000,
      updated_at: nowMs - 180000,
    });

    const repairEngine = createSystemTableRepairQueryEngine({
      [TABLES.NODES]: writableCache.getAll(TABLES.NODES),
      [TABLES.PARTITIONS]: writableCache.getAll(TABLES.PARTITIONS),
      [TABLES.SERVICES]: writableCache.getAll(TABLES.SERVICES),
      [TABLES.TABLES]: writableCache.getAll(TABLES.TABLES),
      [TABLES.NODE_ENDPOINTS]: writableCache.getAll(TABLES.NODE_ENDPOINTS),
      [TABLES.SERVICE_DEFINITIONS]:
        writableCache.getAll(TABLES.SERVICE_DEFINITIONS),
      [TABLES.SERVICE_ENDPOINTS]:
        writableCache.getAll(TABLES.SERVICE_ENDPOINTS),
      [TABLES.REPLICA_OPERATIONS]: [],
    });

    const api = new AdminWebSocketAPI({
      nodeId: 'node-local',
      systemTableCache: createReadOnlyCache(writableCache),
      cacheMutationTarget: writableCache,
      controlPlaneSystemTableGateway: createAuthoritativeCacheGateway(writableCache, {
        queryEngine: repairEngine,
      }),
      sqlQueryEngine: repairEngine,
      nowFn: () => nowMs,
    });

    const result = await api.buildControlSnapshotQueryResult({
      forceAuthoritativeRepair: true,
    });

    t.equal(
      result?.rows?.[0]?.replicaOperations?.staleInFlightCount,
      0,
      'repair should refresh stale replica-operation liveness from the authoritative rows',
    );
    t.same(
      getAuthoritativeRepairReadTables(repairEngine.executeRequestCalls),
      [...DEFAULT_AUTHORITATIVE_REPAIR_TABLES].sort(),
      'forced snapshot repair should use the canonical authoritative table scope',
    );
  },
);

test(
  'AdminWebSocketAPI - forced control snapshot degrades when stale replica-operation repair fails',
  async (t) => {
    const nowMs = 1740589945123;
    const writableCache = createAuthoritativeRepairCache('node-local');

    writableCache.applySystemTableChange(TABLES.NODES, 'UPDATE', {
      id: 'node-local',
      node_id: 'node-local',
      address: 'localhost:8080',
      node_address: 'localhost:8080',
      status: 'active',
      connection_state: 'ready',
      last_heartbeat: nowMs - 1000,
      ready_lease_expires_at: nowMs + 15000,
    });
    writableCache.applySystemTableChange(TABLES.REPLICA_OPERATIONS, 'INSERT', {
      operation_id: 'op-stale-local',
      partition_id: `${TABLES.NODES}-p1`,
      entity_type: 'partition',
      entity_id: `${TABLES.NODES}-p1`,
      operation_type: 'ADD',
      status: 'creating',
      target_node_id: 'node-peer',
      workflow_step: 'CREATING',
      created_at: nowMs - 180000,
      updated_at: nowMs - 180000,
    });

    const failingReplicaOpEngine = {
      executeRequestCalls: [],
      async executeRequest(request) {
        const statement = String(request?.statement || '').trim();
        this.executeRequestCalls.push(statement);
        if (/^select \* from replica_operations$/i.test(statement)) {
          return {
            success: false,
            rows: [],
            count: 0,
            error: 'replica_operations_timeout',
          };
        }
        return {success: true, rows: [], count: 0};
      },
    };

    const api = new AdminWebSocketAPI({
      nodeId: 'node-local',
      systemTableCache: createReadOnlyCache(writableCache),
      cacheMutationTarget: writableCache,
      controlPlaneSystemTableGateway: createAuthoritativeCacheGateway(
        writableCache,
        {
          queryEngine: failingReplicaOpEngine,
        },
      ),
      sqlQueryEngine: failingReplicaOpEngine,
      nowFn: () => nowMs,
    });

    const result = await api.buildControlSnapshotQueryResult({
      forceAuthoritativeRepair: true,
    });

    t.equal(
      result?.success,
      true,
      'forced control snapshot should still succeed when only replica-operation repair fails',
    );
    t.equal(
      result?.rows?.[0]?.replicaOperations?.staleInFlightCount,
      0,
      'failed advisory repair should not publish an unverified stale operation as live',
    );
    t.same(
      getAuthoritativeRepairReadTables(failingReplicaOpEngine.executeRequestCalls),
      [...DEFAULT_AUTHORITATIVE_REPAIR_TABLES].sort(),
      'degraded forced repair should retain the canonical authoritative table scope',
    );
  },
);

test(
  'AdminWebSocketAPI - forced control snapshot tolerates active projection undercoverage',
  async (t) => {
    const nowMs = 1740589945123;
    const writableCache = createAuthoritativeRepairCache('node-local');

    writableCache.applySystemTableChange(TABLES.NODES, 'UPDATE', {
      id: 'node-local',
      node_id: 'node-local',
      address: 'localhost:8080',
      node_address: 'localhost:8080',
      status: 'active',
      connection_state: 'ready',
      last_heartbeat: nowMs - 1000,
      ready_lease_expires_at: nowMs + 15000,
    });
    writableCache.applySystemTableChange(TABLES.NODES, 'INSERT', {
      id: 'node-peer',
      node_id: 'node-peer',
      address: 'localhost:8081',
      node_address: 'localhost:8081',
      status: 'active',
      connection_state: 'ready',
      last_heartbeat: nowMs - 60000,
      ready_lease_expires_at: nowMs - 1000,
    });
    writableCache.applySystemTableChange(TABLES.REPLICA_OPERATIONS, 'INSERT', {
      operation_id: 'op-stale-local',
      partition_id: `${TABLES.NODES}-p1`,
      entity_type: 'partition',
      entity_id: `${TABLES.NODES}-p1`,
      operation_type: 'ADD',
      status: 'creating',
      target_node_id: 'node-peer',
      workflow_step: 'CREATING',
      created_at: nowMs - 180000,
      updated_at: nowMs - 180000,
    });

    const repairEngine = createSystemTableRepairQueryEngine({
      [TABLES.NODES]: writableCache.getAll(TABLES.NODES),
      [TABLES.PARTITIONS]: writableCache.getAll(TABLES.PARTITIONS),
      [TABLES.SERVICES]: writableCache.getAll(TABLES.SERVICES),
      [TABLES.TABLES]: writableCache.getAll(TABLES.TABLES),
      [TABLES.NODE_ENDPOINTS]: writableCache.getAll(TABLES.NODE_ENDPOINTS),
      [TABLES.SERVICE_DEFINITIONS]:
        writableCache.getAll(TABLES.SERVICE_DEFINITIONS),
      [TABLES.SERVICE_ENDPOINTS]:
        writableCache.getAll(TABLES.SERVICE_ENDPOINTS),
      [TABLES.REPLICA_OPERATIONS]:
        writableCache.getAll(TABLES.REPLICA_OPERATIONS),
    });

    const api = new AdminWebSocketAPI({
      nodeId: 'node-local',
      systemTableCache: createReadOnlyCache(writableCache),
      cacheMutationTarget: writableCache,
      controlPlaneSystemTableGateway: createAuthoritativeCacheGateway(
        writableCache,
        {
          queryEngine: repairEngine,
        },
      ),
      sqlQueryEngine: repairEngine,
      messageRouter: {
        getConnectedNodes() {
          return ['node-peer'];
        },
      },
      nowFn: () => nowMs,
    });

    const result = await api.buildControlSnapshotQueryResult({
      forceAuthoritativeRepair: true,
    });

    t.equal(
      result?.success,
      true,
      'forced control snapshot should still return one snapshot while active projection is catching up',
    );
    t.equal(
      Object.prototype.hasOwnProperty.call(
        result?.rows?.[0]?.authoritativeRepair || {},
        'activeProjectionCoverageGap',
      ),
      false,
      'forced control snapshot should not publish the retired projection coverage field',
    );
    t.ok(
      getAuthoritativeRepairReadTables(repairEngine.executeRequestCalls)
        .includes(TABLES.NODES),
      'active projection coverage gaps should still widen repair scope beyond replica_operations',
    );
  },
);

test(
  'AdminWebSocketAPI - forced control snapshot repairs stale active node heartbeat rows',
  async (t) => {
    const nowMs = 1740589945123;
    const staleHeartbeatMs = nowMs - 45000;
    const freshHeartbeatMs = nowMs - 1000;
    const writableCache = createAuthoritativeRepairCache('node-local');

    writableCache.applySystemTableChange(TABLES.NODES, 'UPDATE', {
      id: 'node-local',
      node_id: 'node-local',
      address: 'localhost:8080',
      node_address: 'localhost:8080',
      status: 'active',
      connection_state: 'ready',
      last_heartbeat: staleHeartbeatMs,
      ready_lease_expires_at: staleHeartbeatMs + 15000,
    });
    writableCache.applySystemTableChange(TABLES.NODES, 'INSERT', {
      id: 'node-peer',
      node_id: 'node-peer',
      address: 'localhost:8081',
      node_address: 'localhost:8081',
      status: 'active',
      connection_state: 'ready',
      last_heartbeat: staleHeartbeatMs,
      ready_lease_expires_at: staleHeartbeatMs + 15000,
    });

    const authoritativeNodes = [
      {
        ...writableCache.get(TABLES.NODES, 'node-local'),
        last_heartbeat: freshHeartbeatMs,
        ready_lease_expires_at: freshHeartbeatMs + 15000,
      },
      {
        ...writableCache.get(TABLES.NODES, 'node-peer'),
        last_heartbeat: freshHeartbeatMs,
        ready_lease_expires_at: freshHeartbeatMs + 15000,
      },
    ];
    const repairEngine = createSystemTableRepairQueryEngine({
      [TABLES.NODES]: authoritativeNodes,
      [TABLES.PARTITIONS]: writableCache.getAll(TABLES.PARTITIONS),
      [TABLES.SERVICES]: writableCache.getAll(TABLES.SERVICES),
      [TABLES.TABLES]: writableCache.getAll(TABLES.TABLES),
      [TABLES.NODE_ENDPOINTS]: writableCache.getAll(TABLES.NODE_ENDPOINTS),
      [TABLES.SERVICE_DEFINITIONS]:
        writableCache.getAll(TABLES.SERVICE_DEFINITIONS),
      [TABLES.SERVICE_ENDPOINTS]:
        writableCache.getAll(TABLES.SERVICE_ENDPOINTS),
      [TABLES.REPLICA_OPERATIONS]:
        writableCache.getAll(TABLES.REPLICA_OPERATIONS),
    });

    const api = new AdminWebSocketAPI({
      nodeId: 'node-local',
      systemTableCache: createReadOnlyCache(writableCache),
      cacheMutationTarget: writableCache,
      controlPlaneSystemTableGateway: createAuthoritativeCacheGateway(writableCache, {
        queryEngine: repairEngine,
      }),
      sqlQueryEngine: repairEngine,
      nowFn: () => nowMs,
    });

    await api.buildControlSnapshotQueryResult({
      forceAuthoritativeRepair: true,
    });

    t.equal(
      repairEngine.executeRequestCalls.includes(`SELECT * FROM ${TABLES.NODES}`),
      true,
      'control snapshot repair should query authoritative nodes rows when active heartbeats are stale',
    );
    t.equal(
      writableCache.get(TABLES.NODES, 'node-local')?.last_heartbeat,
      freshHeartbeatMs,
      'local node heartbeat should be refreshed from the authoritative repair rows',
    );
    t.equal(
      writableCache.get(TABLES.NODES, 'node-peer')?.last_heartbeat,
      freshHeartbeatMs,
      'peer node heartbeat should be refreshed from the authoritative repair rows',
    );
  },
);

test(
  'AdminWebSocketAPI - local control snapshot defers shared metadata node coverage repair',
  async (t) => {
    const writableCache = createAuthoritativeRepairCache('node-local');
    const now = Date.now();
    writableCache.applySystemTableChange(TABLES.NODES, 'UPDATE', {
      id: 'node-local',
      node_id: 'node-local',
      address: 'localhost:8080',
      node_address: 'localhost:8080',
      status: 'active',
      connection_state: 'ready',
      last_heartbeat: now,
      ready_lease_expires_at: now + 10000,
    });
    writableCache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
      service_id: 'peer-service-r1',
      service_type: 'partition',
      node_id: 'node-peer',
      partition_id: 'peer-table-p1',
      replica_id: 'peer-table-p1-r1',
      raft_role: 'leader',
      status: 'active',
      address: 'node-peer/partition/peer-table-p1-r1',
    });
    writableCache.applySystemTableChange(TABLES.NODE_ENDPOINTS, 'INSERT', {
      endpoint_id: 'endpoint-node-local',
      node_id: 'node-local',
      transport_type: 'ws',
      address: 'ws://node-local:8082',
      status: 'active',
    });
    writableCache.applySystemTableChange(TABLES.NODE_ENDPOINTS, 'INSERT', {
      endpoint_id: 'endpoint-node-peer',
      node_id: 'node-peer',
      transport_type: 'ws',
      address: 'ws://node-peer:8082',
      status: 'active',
    });

    const authoritativeNodes = [
      ...writableCache.getAll(TABLES.NODES),
      {
        id: 'node-peer',
        node_id: 'node-peer',
        address: 'localhost:8081',
        node_address: 'localhost:8081',
        status: 'active',
        connection_state: 'ready',
        last_heartbeat: now,
        ready_lease_expires_at: now + 10000,
      },
    ];
    const repairEngine = createSystemTableRepairQueryEngine({
      [TABLES.NODES]: authoritativeNodes,
      [TABLES.PARTITIONS]: writableCache.getAll(TABLES.PARTITIONS),
      [TABLES.SERVICES]: writableCache.getAll(TABLES.SERVICES),
      [TABLES.TABLES]: writableCache.getAll(TABLES.TABLES),
      [TABLES.NODE_ENDPOINTS]: writableCache.getAll(TABLES.NODE_ENDPOINTS),
      [TABLES.SERVICE_DEFINITIONS]:
        writableCache.getAll(TABLES.SERVICE_DEFINITIONS),
      [TABLES.SERVICE_ENDPOINTS]:
        writableCache.getAll(TABLES.SERVICE_ENDPOINTS),
      [TABLES.REPLICA_OPERATIONS]:
        writableCache.getAll(TABLES.REPLICA_OPERATIONS),
    });

    const api = new AdminWebSocketAPI({
      nodeId: 'node-local',
      systemTableCache: createReadOnlyCache(writableCache),
      cacheMutationTarget: writableCache,
      controlPlaneSystemTableGateway: createAuthoritativeCacheGateway(writableCache, {
        queryEngine: repairEngine,
      }),
      sqlQueryEngine: repairEngine,
    });

    const result = await api.buildControlSnapshotQueryResult();

    t.equal(result.success, true, 'control snapshot should succeed');
    t.same(
      result.rows[0].nodes.sort(),
      ['node-local'],
      'default control snapshot should return the local view while shared repair is still pending',
    );
    t.match(
      result.rows[0].snapshotObservation,
      {
        state: CONTROL_PLANE_SNAPSHOT_OBSERVATION_STATE.DEFERRED_REFRESH,
        refreshState: CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.DEFERRED,
      },
      'default control snapshot should expose deferred repair explicitly',
    );
    t.equal(
      writableCache.get(TABLES.NODES, 'node-peer'),
      undefined,
      'default control snapshot should not mutate cache state on the read path',
    );
    t.equal(
      repairEngine.executeRequestCalls.includes(`SELECT * FROM ${TABLES.NODES}`),
      false,
      'default control snapshot should not issue synchronous authoritative node repairs',
    );
  },
);
