/**
 * Tests for Admin WebSocket API.
 * Requirements: 32.1-32.39
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  connectAndReceive,
  createMockQueryEngine,
  createPopulatedCache,
  seedRoutedTableDiscoveryRows,
  seedServiceDiscoveryRows,
  seedTableDiscoveryRowsWithLocalCandidate,
  seedTableDiscoveryRowsWithLocalFollower,
  seedTableDiscoveryRowsWithLocalLearner,
  stageFutureBenchmarkSplitChildren,
  waitForMessage,
} from './admin-websocket-api-test-support.js';
import {AdminWebSocketAPI, MessageType} from
  '../../src/admin/admin-websocket-api.js';
import {
} from '../../src/admin/admin-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {TABLES} from '../../src/constants/index.js';
import {
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
} from '../../src/control-plane/control-plane-snapshot-owner.js';

// Initialize services for tests
ConfigurationManager.getInstance().initialize();
LoggingService.getInstance().initialize({level: 'error'});

test('AdminWebSocketAPI - table-scoped discovery readiness marks missing schema',
  async (t) => {
    const cache = createPopulatedCache();
    seedServiceDiscoveryRows(cache);
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: cache,
      sqlQueryEngine: createMockQueryEngine(),
    });

    await api.initialize(0, {listen: false});
    const response = await api.getFastify().inject({
      method: 'GET',
      url: '/api/admin/discovery/services?' +
        'serviceId=sys-postgres-wire&protocol=postgresql&tableName=benchmark_events',
    });
    const payload = response.json();

    t.equal(response.statusCode, 200, 'should return 200');
    const readiness = payload.services[0].replicas[0].readiness;
    t.equal(readiness.schemaReady, false, 'missing table should mark schema not ready');
    t.equal(readiness.workloadReady, false, 'missing table should block workload readiness');
    t.equal(readiness.topologyReady, true, 'topology can still be ready when schema is missing');
    t.equal(
      readiness.benchmarkReady,
      false,
      'benchmark readiness should fail when schema is missing',
    );
    t.equal(
      readiness.reasons.some((reason) => reason.code === 'schema_table_missing'),
      true,
      'readiness reasons should include schema_table_missing',
    );

    await api.shutdown();
  });

test(
  'AdminWebSocketAPI - table-scoped discovery keeps routed replicas schema ready',
  async (t) => {
    const cache = createPopulatedCache();
    seedRoutedTableDiscoveryRows(cache);
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: cache,
      sqlQueryEngine: createMockQueryEngine(),
    });

    await api.initialize(0, {listen: false});
    const response = await api.getFastify().inject({
      method: 'GET',
      url: '/api/admin/discovery/services?' +
        'serviceId=sys-postgres-wire&protocol=postgresql&tableName=benchmark_events',
    });
    const payload = response.json();

    t.equal(response.statusCode, 200, 'should return 200');
    const replicas = Array.isArray(payload?.services?.[0]?.replicas) ?
      payload.services[0].replicas :
      [];
    const readinessByNodeId = new Map(replicas.map((replica) => [
      String(replica?.nodeId || ''),
      replica?.readiness || null,
    ]));

    t.equal(
      readinessByNodeId.get('node-1')?.schemaReady,
      true,
      'node-1 should remain schema ready',
    );
    t.equal(
      readinessByNodeId.get('node-2')?.routingReady,
      true,
      'node-2 should remain routing ready',
    );
    t.equal(
      readinessByNodeId.get('node-2')?.schemaReady,
      true,
      'node-2 should remain schema ready via routed partition ownership',
    );
    t.equal(
      readinessByNodeId.get('node-2')?.reasons?.some((reason) =>
        reason.code === 'schema_partition_unavailable'),
      false,
      'node-2 should not be excluded for lacking local partition replica',
    );

    await api.shutdown();
  },
);

test(
  'AdminWebSocketAPI - table-scoped discovery honors canonical partition leaders when replica roles are stale',
  async (t) => {
    const cache = createPopulatedCache();
    seedTableDiscoveryRowsWithLocalFollower(cache);
    cache.applySystemTableChange(TABLES.PARTITIONS, 'UPDATE', {
      id: 'partition-benchmark-events-1',
      partition_id: 'partition-benchmark-events-1',
      leader_node_id: 'node-1',
    });
    cache.applySystemTableChange(TABLES.SERVICES, 'UPDATE', {
      id: 'service-benchmark-events-node-1',
      service_type: 'partition',
      partition_id: 'partition-benchmark-events-1',
      node_id: 'node-1',
      status: 'active',
      raft_role: 'follower',
      address: '10.0.0.1:7001',
    });
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: cache,
      sqlQueryEngine: createMockQueryEngine(),
    });

    await api.initialize(0, {listen: false});
    const response = await api.getFastify().inject({
      method: 'GET',
      url: '/api/admin/discovery/services?' +
        'serviceId=sys-postgres-wire&protocol=postgresql&tableName=benchmark_events',
    });
    const payload = response.json();

    t.equal(response.statusCode, 200, 'should return 200');
    const replicas = Array.isArray(payload?.services?.[0]?.replicas) ?
      payload.services[0].replicas :
      [];
    const readinessByNodeId = new Map(replicas.map((replica) => [
      String(replica?.nodeId || ''),
      replica?.readiness || null,
    ]));
    const admissionByNodeId = new Map(replicas.map((replica) => [
      String(replica?.nodeId || ''),
      replica?.benchmarkAdmission || null,
    ]));

    t.equal(
      readinessByNodeId.get('node-1')?.leadershipStable,
      true,
      'canonical partition owner metadata should keep leadership stable',
    );
    t.equal(
      readinessByNodeId.get('node-1')?.benchmarkReady,
      true,
      'canonical leader host should remain benchmark ready despite stale raft_role',
    );
    t.equal(
      readinessByNodeId.get('node-2')?.benchmarkReady,
      true,
      'routed peer should remain benchmark ready when canonical leader coverage is intact',
    );
    t.equal(
      readinessByNodeId.get('node-1')?.reasons?.some((reason) =>
        reason.code === 'leadership_unstable'),
      false,
      'canonical leader coverage should suppress stale leader-role false negatives',
    );
    t.equal(
      admissionByNodeId.get('node-1')?.state,
      'ready',
      'benchmark admission should stay ready on the canonical leader host',
    );
    t.equal(
      admissionByNodeId.get('node-2')?.state,
      'ready',
      'benchmark admission should stay ready on routed peers',
    );

    await api.shutdown();
  },
);

test(
  'AdminWebSocketAPI - table-scoped discovery honors fresh bootstrap leader routing when cache leader metadata lags',
  async (t) => {
    const cache = createPopulatedCache();
    seedTableDiscoveryRowsWithLocalFollower(cache);
    cache.applySystemTableChange(TABLES.PARTITIONS, 'UPDATE', {
      id: 'partition-benchmark-events-1',
      partition_id: 'partition-benchmark-events-1',
      leader_node_id: null,
      created_at: 123,
      updated_at: 123,
    });
    cache.applySystemTableChange(TABLES.SERVICES, 'UPDATE', {
      id: 'service-benchmark-events-node-1',
      service_type: 'partition',
      partition_id: 'partition-benchmark-events-1',
      node_id: 'node-1',
      status: 'active',
      raft_role: 'follower',
      address: '10.0.0.1:7001',
    });
    cache.applySystemTableChange(TABLES.SERVICES, 'UPDATE', {
      id: 'service-benchmark-events-node-2',
      service_type: 'partition',
      partition_id: 'partition-benchmark-events-1',
      node_id: 'node-2',
      status: 'active',
      raft_role: 'follower',
      address: '10.0.0.2:7001',
    });
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: cache,
      sqlQueryEngine: {
        ...createMockQueryEngine(),
        queryExecutor: {
          getPartitionRoutingSnapshot(partitionId) {
            t.equal(
              partitionId,
              'partition-benchmark-events-1',
              'discovery should consult routing metadata for the benchmark partition',
            );
            return {
              partitionId,
              canonicalLeaderNodeId: 'node-1',
              canonicalLeaderServiceCount: 1,
            };
          },
        },
      },
    });

    await api.initialize(0, {listen: false});
    const response = await api.getFastify().inject({
      method: 'GET',
      url: '/api/admin/discovery/services?' +
        'serviceId=sys-postgres-wire&protocol=postgresql&tableName=benchmark_events',
    });
    const payload = response.json();

    t.equal(response.statusCode, 200, 'should return 200');
    const replicas = Array.isArray(payload?.services?.[0]?.replicas) ?
      payload.services[0].replicas :
      [];
    const readinessByNodeId = new Map(replicas.map((replica) => [
      String(replica?.nodeId || ''),
      replica?.readiness || null,
    ]));
    const admissionByNodeId = new Map(replicas.map((replica) => [
      String(replica?.nodeId || ''),
      replica?.benchmarkAdmission || null,
    ]));

    t.equal(
      readinessByNodeId.get('node-1')?.leadershipStable,
      true,
      'bootstrap routing leader should keep leadership stable before cache convergence',
    );
    t.equal(
      readinessByNodeId.get('node-1')?.benchmarkReady,
      true,
      'leader-hosting node should remain benchmark ready during fresh bootstrap',
    );
    t.equal(
      readinessByNodeId.get('node-2')?.benchmarkReady,
      true,
      'local follower should remain benchmark ready during fresh bootstrap',
    );
    t.equal(
      readinessByNodeId.get('node-1')?.reasons?.some((reason) =>
        reason.code === 'leadership_unstable'),
      false,
      'fresh bootstrap routing should suppress leadership instability',
    );
    t.equal(
      admissionByNodeId.get('node-1')?.state,
      'ready',
      'benchmark admission should stay ready on the bootstrap leader host',
    );
    t.equal(
      admissionByNodeId.get('node-2')?.state,
      'ready',
      'benchmark admission should stay ready on the bootstrap follower host',
    );

    await api.shutdown();
  },
);

test(
  'AdminWebSocketAPI - table-scoped discovery excludes staged split children before cutover',
  async (t) => {
    const cache = createPopulatedCache();
    seedTableDiscoveryRowsWithLocalFollower(cache);
    stageFutureBenchmarkSplitChildren(cache, {
      activePartitionVersion: 1,
      partitionCount: 1,
    });
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: cache,
      sqlQueryEngine: createMockQueryEngine(),
    });

    await api.initialize(0, {listen: false});
    const response = await api.getFastify().inject({
      method: 'GET',
      url: '/api/admin/discovery/services?' +
        'serviceId=sys-postgres-wire&protocol=postgresql&tableName=benchmark_events',
    });
    const payload = response.json();

    t.equal(response.statusCode, 200, 'should return 200');
    const replicas = Array.isArray(payload?.services?.[0]?.replicas) ?
      payload.services[0].replicas :
      [];
    const readinessByNodeId = new Map(replicas.map((replica) => [
      String(replica?.nodeId || ''),
      replica?.readiness || null,
    ]));
    const admissionByNodeId = new Map(replicas.map((replica) => [
      String(replica?.nodeId || ''),
      replica?.benchmarkAdmission || null,
    ]));

    t.equal(
      readinessByNodeId.get('node-1')?.schemaReady,
      true,
      'active source partition coverage should keep schema ready before cutover',
    );
    t.equal(
      readinessByNodeId.get('node-1')?.leadershipStable,
      true,
      'staged child rows should not destabilize leadership before cutover',
    );
    t.equal(
      readinessByNodeId.get('node-1')?.benchmarkReady,
      true,
      'active source leader should remain benchmark ready before cutover',
    );
    t.equal(
      readinessByNodeId.get('node-2')?.benchmarkReady,
      true,
      'routed peer should remain benchmark ready before cutover',
    );
    t.equal(
      readinessByNodeId.get('node-1')?.reasons?.some((reason) =>
        reason.code === 'schema_partition_unavailable'),
      false,
      'staged child rows should not create schema coverage gaps before cutover',
    );
    t.equal(
      readinessByNodeId.get('node-1')?.reasons?.some((reason) =>
        reason.code === 'leadership_unstable'),
      false,
      'staged child rows should not create leadership instability before cutover',
    );
    t.equal(
      admissionByNodeId.get('node-1')?.state,
      'ready',
      'benchmark admission should stay ready on the active source leader before cutover',
    );
    t.equal(
      admissionByNodeId.get('node-2')?.state,
      'ready',
      'benchmark admission should stay ready on routed peers before cutover',
    );

    await api.shutdown();
  },
);

test(
  'AdminWebSocketAPI - table-scoped discovery excludes local learner replicas from benchmark readiness',
  async (t) => {
    const cache = createPopulatedCache();
    seedTableDiscoveryRowsWithLocalLearner(cache);
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: cache,
      sqlQueryEngine: createMockQueryEngine(),
    });

    await api.initialize(0, {listen: false});
    const response = await api.getFastify().inject({
      method: 'GET',
      url: '/api/admin/discovery/services?' +
        'serviceId=sys-postgres-wire&protocol=postgresql&tableName=benchmark_events',
    });
    const payload = response.json();

    t.equal(response.statusCode, 200, 'should return 200');
    const replicas = Array.isArray(payload?.services?.[0]?.replicas) ?
      payload.services[0].replicas :
      [];
    const readinessByNodeId = new Map(replicas.map((replica) => [
      String(replica?.nodeId || ''),
      replica?.readiness || null,
    ]));

    t.equal(
      readinessByNodeId.get('node-1')?.benchmarkReady,
      true,
      'leader-hosting node should remain benchmark ready',
    );
    t.equal(
      readinessByNodeId.get('node-2')?.routingReady,
      true,
      'learner-hosting node should remain routing ready',
    );
    t.equal(
      readinessByNodeId.get('node-2')?.schemaReady,
      true,
      'learner-hosting node should remain schema ready via cluster routing',
    );
    t.equal(
      readinessByNodeId.get('node-2')?.topologyReady,
      false,
      'local learner replica should block topology readiness',
    );
    t.equal(
      readinessByNodeId.get('node-2')?.benchmarkReady,
      false,
      'local learner replica should block benchmark readiness',
    );
    t.equal(
      readinessByNodeId.get('node-2')?.reasons?.some((reason) =>
        reason.code === 'local_replica_not_voter_ready'),
      true,
      'readiness reasons should expose the local learner exclusion',
    );

    await api.shutdown();
  },
);

test(
  'AdminWebSocketAPI - table-scoped discovery excludes local candidate replicas from benchmark readiness',
  async (t) => {
    const cache = createPopulatedCache();
    seedTableDiscoveryRowsWithLocalCandidate(cache);
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: cache,
      sqlQueryEngine: createMockQueryEngine(),
    });

    await api.initialize(0, {listen: false});
    const response = await api.getFastify().inject({
      method: 'GET',
      url: '/api/admin/discovery/services?' +
        'serviceId=sys-postgres-wire&protocol=postgresql&tableName=benchmark_events',
    });
    const payload = response.json();

    t.equal(response.statusCode, 200, 'should return 200');
    const replicas = Array.isArray(payload?.services?.[0]?.replicas) ?
      payload.services[0].replicas :
      [];
    const readinessByNodeId = new Map(replicas.map((replica) => [
      String(replica?.nodeId || ''),
      replica?.readiness || null,
    ]));

    t.equal(
      readinessByNodeId.get('node-1')?.benchmarkReady,
      true,
      'leader-hosting node should remain benchmark ready',
    );
    t.equal(
      readinessByNodeId.get('node-2')?.routingReady,
      true,
      'candidate-hosting node should remain routing ready',
    );
    t.equal(
      readinessByNodeId.get('node-2')?.schemaReady,
      true,
      'candidate-hosting node should remain schema ready via cluster routing',
    );
    t.equal(
      readinessByNodeId.get('node-2')?.topologyReady,
      false,
      'local candidate replica should block topology readiness',
    );
    t.equal(
      readinessByNodeId.get('node-2')?.benchmarkReady,
      false,
      'local candidate replica should block benchmark readiness',
    );
    t.equal(
      readinessByNodeId.get('node-2')?.reasons?.some((reason) =>
        reason.code === 'local_replica_not_voter_ready'),
      true,
      'readiness reasons should expose the local candidate exclusion',
    );
    t.equal(
      replicas.find((replica) => replica?.nodeId === 'node-2')?.benchmarkAdmission?.state,
      'blocked',
      'candidate-hosting node should publish blocked benchmark admission state',
    );
    t.equal(
      replicas.find((replica) => replica?.nodeId === 'node-2')
        ?.benchmarkAdmission?.reasons?.some((reason) =>
          reason.code === 'local_replica_not_voter_ready'),
      true,
      'benchmark admission should expose stable local replica blocker reasons',
    );

    await api.shutdown();
  },
);

test(
  'AdminWebSocketAPI - table-scoped discovery degrades failed replace movements with operation ids',
  async (t) => {
    const cache = createPopulatedCache();
    seedTableDiscoveryRowsWithLocalFollower(cache);
    cache.applySystemTableChange(TABLES.REPLICA_OPERATIONS, 'INSERT', {
      operation_id: 'op-replace-failed',
      type: 'REPLACE',
      partition_id: 'partition-benchmark-events-1',
      entity_type: 'partition',
      entity_id: 'partition-benchmark-events-1',
      source_node_id: 'node-1',
      target_node_id: 'node-2',
      status: 'failed',
      workflow_step: 'FAILED',
      error_message: 'replica.moved failed',
    });
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: cache,
      sqlQueryEngine: createMockQueryEngine(),
    });

    await api.initialize(0, {listen: false});
    const response = await api.getFastify().inject({
      method: 'GET',
      url: '/api/admin/discovery/services?' +
        'serviceId=sys-postgres-wire&protocol=postgresql&tableName=benchmark_events',
    });
    const payload = response.json();

    t.equal(response.statusCode, 200, 'should return 200');
    const replicas = Array.isArray(payload?.services?.[0]?.replicas) ?
      payload.services[0].replicas :
      [];
    const admissionByNodeId = new Map(replicas.map((replica) => [
      String(replica?.nodeId || ''),
      replica?.benchmarkAdmission || null,
    ]));

    t.equal(
      admissionByNodeId.get('node-2')?.state,
      'blocked',
      'failed replace target should be blocked for benchmark admission',
    );
    t.equal(
      admissionByNodeId.get('node-2')?.degradationState,
      'move_failed',
      'failed replace should classify benchmark admission as move_failed',
    );
    t.same(
      admissionByNodeId.get('node-2')?.degradedByOperationIds,
      ['op-replace-failed'],
      'failed replace should expose owning operation id',
    );
    t.equal(
      admissionByNodeId.get('node-2')?.reasons?.some((reason) =>
        reason.code === 'replica_operation_failed'),
      true,
      'failed replace should surface replica_operation_failed reason',
    );

    await api.shutdown();
  },
);

test(
  'AdminWebSocketAPI - table-scoped discovery degrades pending promotion outcomes',
  async (t) => {
    const cache = createPopulatedCache();
    seedTableDiscoveryRowsWithLocalFollower(cache);
    cache.applySystemTableChange(TABLES.REPLICA_OPERATIONS, 'INSERT', {
      operation_id: 'op-add-pending',
      type: 'ADD',
      partition_id: 'partition-benchmark-events-1',
      entity_type: 'partition',
      entity_id: 'partition-benchmark-events-1',
      source_node_id: 'node-1',
      target_node_id: 'node-2',
      status: 'creating',
      workflow_step: 'CREATING',
    });
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: cache,
      sqlQueryEngine: createMockQueryEngine(),
    });

    await api.initialize(0, {listen: false});
    const response = await api.getFastify().inject({
      method: 'GET',
      url: '/api/admin/discovery/services?' +
        'serviceId=sys-postgres-wire&protocol=postgresql&tableName=benchmark_events',
    });
    const payload = response.json();

    t.equal(response.statusCode, 200, 'should return 200');
    const replicas = Array.isArray(payload?.services?.[0]?.replicas) ?
      payload.services[0].replicas :
      [];
    const readinessByNodeId = new Map(replicas.map((replica) => [
      String(replica?.nodeId || ''),
      replica?.readiness || null,
    ]));
    const admissionByNodeId = new Map(replicas.map((replica) => [
      String(replica?.nodeId || ''),
      replica?.benchmarkAdmission || null,
    ]));

    t.equal(
      admissionByNodeId.get('node-2')?.state,
      'blocked',
      'pending promotion target should be blocked for benchmark admission',
    );
    t.equal(
      admissionByNodeId.get('node-2')?.degradationState,
      'promotion_pending',
      'ADD creating should classify benchmark admission as promotion_pending',
    );
    t.same(
      admissionByNodeId.get('node-2')?.degradedByOperationIds,
      ['op-add-pending'],
      'pending promotion should expose owning operation id',
    );
    t.equal(
      admissionByNodeId.get('node-2')?.reasons?.some((reason) =>
        reason.code === 'replica_operation_in_flight'),
      true,
      'pending promotion should surface in-flight replica operation reason',
    );
    t.equal(
      readinessByNodeId.get('node-1')?.topologyReady,
      true,
      'unaffected source replica should remain topology ready',
    );
    t.equal(
      readinessByNodeId.get('node-1')?.benchmarkReady,
      true,
      'unaffected source replica should remain benchmark ready',
    );
    t.equal(
      readinessByNodeId.get('node-1')?.reasons?.some((reason) =>
        reason.code === 'replica_operations_in_flight'),
      false,
      'unaffected source replica should not inherit global replica-op blockers',
    );
    t.equal(
      admissionByNodeId.get('node-1')?.state,
      'ready',
      'pending promotion source should stay admitted when it is route-safe',
    );
    t.equal(
      admissionByNodeId.get('node-1')?.degradationState,
      'healthy',
      'pending promotion source should not inherit target degradation',
    );
    t.same(
      admissionByNodeId.get('node-1')?.degradedByOperationIds,
      [],
      'pending promotion source should not expose target operation ids',
    );

    await api.shutdown();
  },
);

test(
  'AdminWebSocketAPI - table-scoped discovery blocks failed promotion target without degrading source',
  async (t) => {
    const cache = createPopulatedCache();
    seedTableDiscoveryRowsWithLocalFollower(cache);
    cache.applySystemTableChange(TABLES.REPLICA_OPERATIONS, 'INSERT', {
      operation_id: 'op-add-failed',
      type: 'ADD',
      partition_id: 'partition-benchmark-events-1',
      entity_type: 'partition',
      entity_id: 'partition-benchmark-events-1',
      source_node_id: 'node-1',
      target_node_id: 'node-2',
      status: 'failed',
      workflow_step: 'FAILED',
    });
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: cache,
      sqlQueryEngine: createMockQueryEngine(),
    });

    await api.initialize(0, {listen: false});
    const response = await api.getFastify().inject({
      method: 'GET',
      url: '/api/admin/discovery/services?' +
        'serviceId=sys-postgres-wire&protocol=postgresql&tableName=benchmark_events',
    });
    const payload = response.json();

    t.equal(response.statusCode, 200, 'should return 200');
    const replicas = Array.isArray(payload?.services?.[0]?.replicas) ?
      payload.services[0].replicas :
      [];
    const admissionByNodeId = new Map(replicas.map((replica) => [
      String(replica?.nodeId || ''),
      replica?.benchmarkAdmission || null,
    ]));

    t.equal(
      admissionByNodeId.get('node-2')?.state,
      'blocked',
      'failed promotion target should be blocked for benchmark admission',
    );
    t.equal(
      admissionByNodeId.get('node-2')?.degradationState,
      'promotion_failed',
      'failed ADD should classify benchmark admission as promotion_failed',
    );
    t.same(
      admissionByNodeId.get('node-2')?.degradedByOperationIds,
      ['op-add-failed'],
      'failed promotion target should expose owning operation id',
    );
    t.equal(
      admissionByNodeId.get('node-2')?.reasons?.some((reason) =>
        reason.code === 'replica_operation_failed'),
      true,
      'failed promotion target should surface failure reason',
    );
    t.equal(
      admissionByNodeId.get('node-1')?.state,
      'ready',
      'failed promotion source should remain benchmark-ready',
    );
    t.equal(
      admissionByNodeId.get('node-1')?.degradationState,
      'healthy',
      'failed promotion source should not inherit target degradation',
    );
    t.same(
      admissionByNodeId.get('node-1')?.degradedByOperationIds,
      [],
      'failed promotion source should not expose target operation ids',
    );
    t.equal(
      admissionByNodeId.get('node-1')?.reasons?.some((reason) =>
        reason.code === 'replica_operation_failed'),
      false,
      'failed promotion source should not surface failure reason',
    );

    await api.shutdown();
  },
);

test(
  'AdminWebSocketAPI - table-scoped discovery ignores completed promotion rows',
  async (t) => {
    const cache = createPopulatedCache();
    seedTableDiscoveryRowsWithLocalFollower(cache);
    cache.applySystemTableChange(TABLES.REPLICA_OPERATIONS, 'INSERT', {
      operation_id: 'op-add-complete',
      type: 'ADD',
      partition_id: 'partition-benchmark-events-1',
      entity_type: 'partition',
      entity_id: 'partition-benchmark-events-1',
      target_node_id: 'node-2',
      status: 'active',
      workflow_step: 'ACTIVE',
      completed_at: 1741000000000,
    });
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: cache,
      sqlQueryEngine: createMockQueryEngine(),
    });

    await api.initialize(0, {listen: false});
    const response = await api.getFastify().inject({
      method: 'GET',
      url: '/api/admin/discovery/services?' +
        'serviceId=sys-postgres-wire&protocol=postgresql&tableName=benchmark_events',
    });
    const payload = response.json();

    t.equal(response.statusCode, 200, 'should return 200');
    const replicas = Array.isArray(payload?.services?.[0]?.replicas) ?
      payload.services[0].replicas :
      [];
    const admissionByNodeId = new Map(replicas.map((replica) => [
      String(replica?.nodeId || ''),
      replica?.benchmarkAdmission || null,
    ]));

    t.equal(
      admissionByNodeId.get('node-2')?.state,
      'ready',
      'completed promotion target should not stay blocked for benchmark admission',
    );
    t.equal(
      admissionByNodeId.get('node-2')?.degradationState,
      'healthy',
      'completed ADD rows should not classify benchmark admission as promotion_pending',
    );
    t.same(
      admissionByNodeId.get('node-2')?.degradedByOperationIds,
      [],
      'completed promotion should not expose stale operation ids',
    );
    t.equal(
      admissionByNodeId.get('node-2')?.reasons?.some((reason) =>
        reason.code === 'replica_operation_in_flight'),
      false,
      'completed promotion should not surface in-flight replica operation reason',
    );

    await api.shutdown();
  },
);

test(
  'AdminWebSocketAPI - table-scoped discovery clears degradation only when blocking operation rows disappear',
  async (t) => {
    const cache = createPopulatedCache();
    seedTableDiscoveryRowsWithLocalFollower(cache);
    const failedOperationRow = {
      operation_id: 'op-replace-failed',
      type: 'REPLACE',
      partition_id: 'partition-benchmark-events-1',
      entity_type: 'partition',
      entity_id: 'partition-benchmark-events-1',
      source_node_id: 'node-1',
      target_node_id: 'node-2',
      status: 'failed',
      workflow_step: 'FAILED',
    };
    cache.applySystemTableChange(
      TABLES.REPLICA_OPERATIONS,
      'INSERT',
      failedOperationRow,
    );
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: cache,
      sqlQueryEngine: createMockQueryEngine(),
    });

    await api.initialize(0, {listen: false});
    const firstResponse = await api.getFastify().inject({
      method: 'GET',
      url: '/api/admin/discovery/services?' +
        'serviceId=sys-postgres-wire&protocol=postgresql&tableName=benchmark_events',
    });
    const firstReplicas = firstResponse.json().services[0].replicas;
    const blockedAdmission = firstReplicas.find((replica) =>
      replica?.nodeId === 'node-2')?.benchmarkAdmission;
    t.equal(blockedAdmission?.state, 'blocked', 'failed operation should block initially');

    cache.applySystemTableChange(
      TABLES.REPLICA_OPERATIONS,
      'DELETE',
      {operation_id: 'op-replace-failed'},
    );
    cache.applySystemTableChange(TABLES.REPLICA_OPERATIONS, 'INSERT', {
      operation_id: 'op-unrelated-failed',
      type: 'REPLACE',
      partition_id: 'partition-unrelated-1',
      entity_type: 'partition',
      entity_id: 'partition-unrelated-1',
      source_node_id: 'node-3',
      target_node_id: 'node-4',
      status: 'failed',
      workflow_step: 'FAILED',
    });

    const secondResponse = await api.getFastify().inject({
      method: 'GET',
      url: '/api/admin/discovery/services?' +
        'serviceId=sys-postgres-wire&protocol=postgresql&tableName=benchmark_events',
    });
    const secondReplicas = secondResponse.json().services[0].replicas;
    const clearedAdmission = secondReplicas.find((replica) =>
      replica?.nodeId === 'node-2')?.benchmarkAdmission;

    t.equal(
      clearedAdmission?.state,
      'ready',
      'degradation should clear once the blocking node operation disappears',
    );
    t.equal(
      clearedAdmission?.degradationState,
      'healthy',
      'cleared admission should return to healthy degradation state',
    );
    t.same(
      clearedAdmission?.degradedByOperationIds,
      [],
      'unrelated failed operations should not keep stale degradation ids',
    );

    await api.shutdown();
  },
);

test(
  'AdminWebSocketAPI - table-scoped discovery ignores unrelated failed operations on same node',
  async (t) => {
    const cache = createPopulatedCache();
    seedTableDiscoveryRowsWithLocalFollower(cache);
    cache.applySystemTableChange(TABLES.REPLICA_OPERATIONS, 'INSERT', {
      operation_id: 'op-unrelated-failed',
      type: 'REPLACE',
      partition_id: 'partition-unrelated-1',
      entity_type: 'message_group',
      entity_id: 'partition-unrelated-1',
      source_node_id: 'node-1',
      target_node_id: 'node-2',
      status: 'failed',
      workflow_step: 'FAILED',
    });
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: cache,
      sqlQueryEngine: createMockQueryEngine(),
    });

    await api.initialize(0, {listen: false});
    const response = await api.getFastify().inject({
      method: 'GET',
      url: '/api/admin/discovery/services?' +
        'serviceId=sys-postgres-wire&protocol=postgresql&tableName=benchmark_events',
    });
    const payload = response.json();

    t.equal(response.statusCode, 200, 'should return 200');
    const replicas = Array.isArray(payload?.services?.[0]?.replicas) ?
      payload.services[0].replicas :
      [];
    const admission = replicas.find((replica) =>
      replica?.nodeId === 'node-2')?.benchmarkAdmission || null;

    t.equal(
      admission?.state,
      'ready',
      'unrelated failed operations should not block benchmark admission',
    );
    t.equal(
      admission?.degradationState,
      'healthy',
      'unrelated failed operations should not set move_failed',
    );
    t.same(
      admission?.degradedByOperationIds,
      [],
      'unrelated failed operations should not leak operation ids',
    );
    t.equal(
      admission?.reasons?.some((reason) =>
        reason.code === 'replica_operation_failed'),
      false,
      'unrelated failed operations should not add replica-operation failure reasons',
    );

    await api.shutdown();
  },
);

test(
  'AdminWebSocketAPI - local discovery does not require CDC subscribers for user tables',
  async (t) => {
    const cache = createPopulatedCache();
    seedTableDiscoveryRowsWithLocalFollower(cache);
    const api = new AdminWebSocketAPI({
      nodeId: 'node-2',
      systemTableCache: cache,
      sqlQueryEngine: createMockQueryEngine(),
      partitionServices: new Map([
        ['partition-benchmark-events-1', {
          partitionId: 'partition-benchmark-events-1',
          getCDCSubscriptionDiagnostics() {
            return {
              subscriberCount: 0,
              bufferedEvents: 0,
              bufferReplayInFlight: false,
            };
          },
        }],
      ]),
    });

    await api.initialize(0, {listen: false});
    const {ws} = await connectAndReceive(api);

    ws.send(JSON.stringify({
      type: MessageType.QUERY,
      queryId: 'q-local-cdc-subscriber-missing',
      sql: 'SELECT * FROM service_discovery_local(\'benchmark_events\')',
    }));
    const response = await waitForMessage(ws);

    t.equal(response.type, MessageType.QUERY_RESULT, 'should return query_result');
    const replicas = Array.isArray(response?.results?.[0]?.services?.[0]?.replicas) ?
      response.results[0].services[0].replicas :
      [];
    const readinessByNodeId = new Map(replicas.map((replica) => [
      String(replica?.nodeId || ''),
      replica?.readiness || null,
    ]));

    t.equal(
      readinessByNodeId.get('node-1')?.benchmarkReady,
      true,
      'remote leader should remain benchmark ready',
    );
    t.equal(
      readinessByNodeId.get('node-2')?.routingReady,
      true,
      'local follower should remain routing ready',
    );
    t.equal(
      readinessByNodeId.get('node-2')?.schemaReady,
      true,
      'local follower should remain schema ready',
    );
    t.equal(
      readinessByNodeId.get('node-2')?.topologyReady,
      true,
      'user-table local followers should remain topology ready without system CDC subscribers',
    );
    t.equal(
      readinessByNodeId.get('node-2')?.benchmarkReady,
      true,
      'user-table local followers should remain benchmark ready without system CDC subscribers',
    );
    t.equal(
      readinessByNodeId.get('node-2')?.reasons?.some((reason) =>
        reason.code === 'local_cdc_subscriber_missing'),
      false,
      'user-table readiness should not report missing system CDC subscribers',
    );

    ws.close();
    await api.shutdown();
  },
);

test(
  'AdminWebSocketAPI - table-scoped discovery ignores stale ADD rows once exact target replica services are active',
  async (t) => {
    const cache = createPopulatedCache();
    seedRoutedTableDiscoveryRows(cache);
    cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
      id: 'partition-benchmark-events-1-r2',
      service_id: 'partition-benchmark-events-1-r2',
      service_type: 'partition',
      partition_id: 'partition-benchmark-events-1',
      replica_id: 'partition-benchmark-events-1-r2',
      node_id: 'node-2',
      status: 'active',
      raft_role: 'follower',
      address: '10.0.0.2:7001',
    });
    cache.applySystemTableChange(TABLES.REPLICA_OPERATIONS, 'INSERT', {
      operation_id: 'op-add-stale-active-replica',
      type: 'ADD',
      partition_id: 'partition-benchmark-events-1',
      entity_type: 'partition',
      entity_id: 'partition-benchmark-events-1',
      source_node_id: 'node-1',
      target_node_id: 'node-2',
      replica_id: 'partition-benchmark-events-1-r2',
      status: 'creating',
      workflow_step: 'CREATING',
    });
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: cache,
      sqlQueryEngine: createMockQueryEngine(),
    });

    const result = await api.buildServiceDiscoveryQueryResult({
      tableName: 'benchmark_events',
    });
    const snapshot = result?.rows?.[0] || null;
    const replicas = snapshot?.services?.[0]?.replicas || [];
    const targetReplica = replicas.find((replica) =>
      replica?.nodeId === 'node-2');

    t.equal(
      snapshot?.replicaOperations?.inFlightCount,
      0,
      'discovery summary should not count stale ADD rows once the exact target replica is active',
    );
    t.equal(
      targetReplica?.readiness?.benchmarkReady,
      true,
      'target replica should stay benchmark ready once canonical services show the ADD completed',
    );
    t.equal(
      targetReplica?.readiness?.reasons?.some((reason) =>
        reason.code === 'replica_operation_in_flight'),
      false,
      'target replica should not surface stale in-flight replica-operation reasons',
    );
    t.equal(
      targetReplica?.benchmarkAdmission?.state,
      'ready',
      'benchmark admission should not keep blocking on a stale ADD row after the target replica is active',
    );
  },
);
