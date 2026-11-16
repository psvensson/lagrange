import {EventEmitter} from 'node:events';

import {test} from '../../src/test-helpers/tap.js';
import {AdminWebSocketAPI} from '../../src/admin/admin-websocket-api.js';
import {
  ADMIN_CONTROL_SNAPSHOT,
  ADMIN_ERROR_MESSAGE,
  ADMIN_ROUTE,
} from '../../src/admin/admin-constants.js';
import {
  awaitSnapshotWithRequestLifecycle,
  countInFlightReplicaOperations,
  projectServeLaneControlSnapshot,
  runSingleFlightLocalSnapshot,
} from '../../src/admin/admin-control-snapshot-serve-lane.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {COLUMN, SERVICE_TYPE, TABLES} from '../../src/constants/index.js';
import {CONTROL_PLANE_READINESS_DIMENSION} from
  '../../src/control-plane/control-plane-readiness-constants.js';
import {LoggingService} from '../../src/logging/logging-service.js';

ConfigurationManager.getInstance().initialize();
LoggingService.getInstance().initialize({level: 'error'});

const CAPTURED_AT_MS = 1740589945123;

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {promise, resolve, reject};
}

function createServeLaneCache() {
  const cache = new SystemTableCache();
  cache.applySystemTableChange(TABLES.NODES, 'INSERT', {
    id: 'node-1',
    node_id: 'node-1',
    status: 'active',
    connection_state: 'ready',
    last_heartbeat: CAPTURED_AT_MS - 500,
    ready_lease_expires_at: CAPTURED_AT_MS + 15000,
  });
  cache.applySystemTableChange(TABLES.PARTITIONS, 'INSERT', {
    [COLUMN.PARTITION_ID]: 'partition-1',
    [COLUMN.TABLE_ID]: 'table-1',
    table_name: 'events',
    state: 'NORMAL',
    [COLUMN.LEADER_NODE_ID]: 'node-1',
  });
  cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
    [COLUMN.SERVICE_ID]: 'partition-1-r1',
    [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
    [COLUMN.PARTITION_ID]: 'partition-1',
    [COLUMN.REPLICA_ID]: 'partition-1-r1',
    [COLUMN.NODE_ID]: 'node-1',
    [COLUMN.RAFT_ROLE]: 'leader',
    [COLUMN.STATUS]: 'active',
    [COLUMN.ADDRESS]: 'node-1/partition/partition-1-r1',
  });
  cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, 'INSERT', {
    endpoint_id: 'node-1-ws',
    node_id: 'node-1',
    transport_type: 'ws',
    status: 'active',
    address: 'ws://node-1:8082',
  });
  return cache;
}

function createReadinessService() {
  const entries = [{
    nodeId: 'node-1',
    dimensions: {
      [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]: false,
    },
    reasons: [{code: 'split_pending'}],
  }];
  return {
    getAllNodeReadinessSync() {
      return entries;
    },
    async getAllNodeReadiness() {
      return entries;
    },
  };
}

test('view=serve-lane builds compact payload directly without full diagnostics and fails 503 without cache',
  async (t) => {
    const cache = createServeLaneCache();
    cache.applySystemTableChange(TABLES.REPLICA_OPERATIONS, 'INSERT', {
      operation_id: 'op-creating-1',
      partition_id: 'partition-1',
      status: 'creating',
      workflow_step: 'CREATING',
      created_at: CAPTURED_AT_MS - 2000,
      updated_at: CAPTURED_AT_MS - 1000,
    });
    cache.applySystemTableChange(TABLES.REPLICA_OPERATIONS, 'INSERT', {
      operation_id: 'op-settled-2',
      type: 'ADD',
      partition_id: 'partition-1',
      status: 'active',
      completed_at: CAPTURED_AT_MS - 500,
    });

    const api = new AdminWebSocketAPI({
      nodeId: 'node-1',
      systemTableCache: cache,
      controlPlaneReadinessService: createReadinessService(),
      nowFn: () => CAPTURED_AT_MS,
    });
    await api.initialize(0, {listen: false});
    t.teardown(async () => {
      await api.shutdown();
    });

    let fullDiagnosticsCalls = 0;
    const origDiagnostics =
      api.controlSnapshot.buildControlPlaneDiagnosticsSnapshot.bind(
        api.controlSnapshot,
      );
    api.controlSnapshot.buildControlPlaneDiagnosticsSnapshot = async (...args) => {
      fullDiagnosticsCalls += 1;
      return origDiagnostics(...args);
    };

    let livenessSummaryCalls = 0;
    const origSummary =
      api.controlSnapshot.buildControlSnapshotReplicaOperationSummary.bind(
        api.controlSnapshot,
      );
    api.controlSnapshot.buildControlSnapshotReplicaOperationSummary = (
      ...args
    ) => {
      livenessSummaryCalls += 1;
      return origSummary(...args);
    };

    const response = await api.getFastify().inject({
      method: 'GET',
      url: `${ADMIN_ROUTE.CONTROL_SNAPSHOT}?scope=local&view=serve-lane`,
    });

    t.equal(response.statusCode, 200, 'view=serve-lane returns 200');
    t.same(
      response.json(),
      {
        schemaVersion: ADMIN_CONTROL_SNAPSHOT.SCHEMA_VERSION,
        nodeId: 'node-1',
        capturedAt: CAPTURED_AT_MS,
        nodes: ['node-1'],
        observationMode: 'local_cache',
        controlPlaneDiagnostics: {
          readinessByNodeId: {
            'node-1': {
              dimensions: {serveEligible: true},
              reasons: [{code: 'split_pending'}],
            },
          },
        },
        replicaOperations: {
          inFlightCount: 1,
        },
      },
      'view=serve-lane returns exact compact payload contract',
    );
    t.equal(
      fullDiagnosticsCalls,
      0,
      'view=serve-lane invokes buildControlPlaneDiagnosticsSnapshot 0 times',
    );
    t.equal(
      livenessSummaryCalls,
      0,
      'view=serve-lane invokes buildControlSnapshotReplicaOperationSummary 0 times',
    );

    const noCacheApi = new AdminWebSocketAPI({
      nodeId: 'node-1',
      enableAdminStream: false,
    });
    await noCacheApi.initialize(0, {listen: false});
    t.teardown(async () => {
      await noCacheApi.shutdown();
    });

    const missingCacheRes = await noCacheApi.getFastify().inject({
      method: 'GET',
      url: `${ADMIN_ROUTE.CONTROL_SNAPSHOT}?scope=local&view=serve-lane`,
    });
    t.equal(
      missingCacheRes.statusCode,
      503,
      'view=serve-lane returns 503 when systemTableCache is absent',
    );
    t.equal(
      missingCacheRes.json().error,
      ADMIN_ERROR_MESSAGE.CONTROL_SNAPSHOT_UNAVAILABLE,
      'view=serve-lane surfaces CONTROL_SNAPSHOT_UNAVAILABLE',
    );
  });

test('serve-lane helpers count in-flight replica operations and project snapshots accurately',
  async (t) => {
    const count = countInFlightReplicaOperations([
      {operation_id: 'op-1', status: 'creating', workflow_step: 'CREATING'},
      {operation_id: 'op-2', status: 'removed'},
      {operation_id: 'op-3', status: 'failed'},
      {operation_id: 'op-4', type: 'ADD', status: 'active', completed_at: 10},
    ], {nowMs: CAPTURED_AT_MS});
    t.equal(count, 1, 'countInFlightReplicaOperations counts only active in-flight rows');

    const projected = projectServeLaneControlSnapshot({
      schemaVersion: 1,
      nodeId: 'node-1',
      capturedAt: CAPTURED_AT_MS,
      nodes: ['node-1'],
      observationMode: 'local_cache',
      controlPlaneDiagnostics: {
        readinessByNodeId: {
          'node-1': {
            dimensions: {serveEligible: false, placementEligible: true},
            reasons: [{code: 'not_ready'}],
          },
        },
        extraHeavyField: ['omitted'],
      },
      replicaOperations: {
        inFlightCount: 2,
        operationTimelineById: {op1: []},
      },
    });
    t.same(projected, {
      schemaVersion: 1,
      nodeId: 'node-1',
      capturedAt: CAPTURED_AT_MS,
      nodes: ['node-1'],
      observationMode: 'local_cache',
      controlPlaneDiagnostics: {
        readinessByNodeId: {
          'node-1': {
            dimensions: {serveEligible: false},
            reasons: [{code: 'not_ready'}],
          },
        },
      },
      replicaOperations: {inFlightCount: 2},
    });
  });

test('5 concurrent view=serve-lane and 5 concurrent view=full share 1 in-flight build and never serve stale cache after settlement',
  async (t) => {
    const cache = createServeLaneCache();
    const api = new AdminWebSocketAPI({
      nodeId: 'node-1',
      systemTableCache: cache,
      controlPlaneReadinessService: createReadinessService(),
      nowFn: () => CAPTURED_AT_MS,
    });
    await api.initialize(0, {listen: false});
    t.teardown(async () => {
      await api.shutdown();
    });

    let serveLaneReadinessCalls = 0;
    let serveLaneGate = createDeferred();
    const origResolveReadiness =
      api.controlSnapshot.resolveControlPlaneReadinessEntries.bind(
        api.controlSnapshot,
      );
    api.controlSnapshot.resolveControlPlaneReadinessEntries = async (
      ...args
    ) => {
      serveLaneReadinessCalls += 1;
      await serveLaneGate.promise;
      return origResolveReadiness(...args);
    };

    const serveLaneRequests = Array.from({length: 5}, () =>
      api.getFastify().inject({
        method: 'GET',
        url: `${ADMIN_ROUTE.CONTROL_SNAPSHOT}?scope=local&view=serve-lane`,
      }));
    await new Promise((resolve) => setImmediate(resolve));
    t.equal(
      serveLaneReadinessCalls,
      1,
      '5 concurrent view=serve-lane requests share 1 underlying build while in flight',
    );
    serveLaneGate.resolve();
    const serveLaneResponses = await Promise.all(serveLaneRequests);
    for (const res of serveLaneResponses) {
      t.equal(res.statusCode, 200, 'concurrent serve-lane response is 200');
      t.equal(res.json().replicaOperations.inFlightCount, 0);
    }

    cache.applySystemTableChange(TABLES.REPLICA_OPERATIONS, 'INSERT', {
      operation_id: 'op-post-settle-1',
      partition_id: 'partition-1',
      status: 'creating',
      workflow_step: 'CREATING',
      created_at: CAPTURED_AT_MS - 100,
      updated_at: CAPTURED_AT_MS - 50,
    });
    serveLaneGate = createDeferred();
    serveLaneGate.resolve();
    const postSettleServeLaneRes = await api.getFastify().inject({
      method: 'GET',
      url: `${ADMIN_ROUTE.CONTROL_SNAPSHOT}?scope=local&view=serve-lane`,
    });
    t.equal(
      serveLaneReadinessCalls,
      2,
      'post-settlement serve-lane request runs a fresh build instead of serving cached result',
    );
    t.equal(
      postSettleServeLaneRes.json().replicaOperations.inFlightCount,
      1,
      'post-settlement serve-lane request observes newly mutated cache state immediately',
    );

    let fullBuildCalls = 0;
    let fullGate = createDeferred();
    const origBuildLocal =
      api.controlSnapshot.buildLocalControlSnapshot.bind(api.controlSnapshot);
    api.controlSnapshot.buildLocalControlSnapshot = async (...args) => {
      fullBuildCalls += 1;
      await fullGate.promise;
      return origBuildLocal(...args);
    };

    const fullRequests = Array.from({length: 5}, () =>
      api.getFastify().inject({
        method: 'GET',
        url: `${ADMIN_ROUTE.CONTROL_SNAPSHOT}?scope=local&view=full&timeoutMs=5000`,
      }));
    await new Promise((resolve) => setImmediate(resolve));
    t.equal(
      fullBuildCalls,
      1,
      '5 concurrent view=full requests share 1 underlying build while in flight',
    );
    fullGate.resolve();
    const fullResponses = await Promise.all(fullRequests);
    for (const res of fullResponses) {
      t.equal(res.statusCode, 200, 'concurrent view=full response is 200');
      t.equal(res.json().replicaOperations.inFlightCount, 1);
    }

    cache.applySystemTableChange(TABLES.REPLICA_OPERATIONS, 'UPDATE', {
      operation_id: 'op-post-settle-1',
      partition_id: 'partition-1',
      type: 'ADD',
      status: 'active',
      completed_at: CAPTURED_AT_MS,
    });
    fullGate = createDeferred();
    fullGate.resolve();
    const postSettleFullRes = await api.getFastify().inject({
      method: 'GET',
      url: `${ADMIN_ROUTE.CONTROL_SNAPSHOT}?scope=local&view=full&timeoutMs=5000`,
    });
    t.equal(
      fullBuildCalls,
      2,
      'post-settlement view=full request runs a fresh build',
    );
    t.equal(
      postSettleFullRes.json().replicaOperations.inFlightCount,
      0,
      'post-settlement view=full request observes newly mutated cache state immediately',
    );

    let nonCoalescedRuns = 0;
    const owner = api.controlSnapshot;
    const gateA = createDeferred();
    const forcedA = runSingleFlightLocalSnapshot(
      owner,
      'forced-test',
      async () => {
        nonCoalescedRuns += 1;
        await gateA.promise;
        return {run: 1};
      },
      {forceAuthoritativeRepair: true},
    );
    const forcedB = runSingleFlightLocalSnapshot(
      owner,
      'forced-test',
      async () => {
        nonCoalescedRuns += 1;
        await gateA.promise;
        return {run: 2};
      },
      {forceAuthoritativeRepair: true},
    );
    gateA.resolve();
    await Promise.all([forcedA, forcedB]);
    t.equal(
      nonCoalescedRuns,
      2,
      'forceAuthoritativeRepair bypasses single-flight coalescing',
    );
  });

test('timeoutMs expiry on view=serve-lane and view=full returns deterministic 503 after starting 1 build',
  async (t) => {
    const cache = createServeLaneCache();
    const api = new AdminWebSocketAPI({
      nodeId: 'node-1',
      systemTableCache: cache,
      controlPlaneReadinessService: createReadinessService(),
      nowFn: () => CAPTURED_AT_MS,
    });
    await api.initialize(0, {listen: false});
    t.teardown(async () => {
      await api.shutdown();
    });

    let serveLaneBuilds = 0;
    const serveLaneGate = createDeferred();
    const origReadiness =
      api.controlSnapshot.resolveControlPlaneReadinessEntries.bind(
        api.controlSnapshot,
      );
    api.controlSnapshot.resolveControlPlaneReadinessEntries = async (...args) => {
      serveLaneBuilds += 1;
      await serveLaneGate.promise;
      return origReadiness(...args);
    };

    const serveLaneTimeoutRes = await api.getFastify().inject({
      method: 'GET',
      url: `${ADMIN_ROUTE.CONTROL_SNAPSHOT}?scope=local&view=serve-lane&timeoutMs=25`,
    });
    t.equal(serveLaneTimeoutRes.statusCode, 503, 'serve-lane timeout returns 503');
    t.equal(
      serveLaneTimeoutRes.json().error,
      ADMIN_ERROR_MESSAGE.queryTimeout(25),
      'serve-lane timeout returns deterministic timeout refusal message',
    );
    t.equal(
      serveLaneBuilds,
      1,
      'serve-lane timeout starts exactly 1 build and never launches a 2nd build',
    );
    serveLaneGate.resolve();
    await new Promise((resolve) => setImmediate(resolve));

    let fullBuilds = 0;
    const fullGate = createDeferred();
    const origBuildLocal =
      api.controlSnapshot.buildLocalControlSnapshot.bind(api.controlSnapshot);
    api.controlSnapshot.buildLocalControlSnapshot = async (...args) => {
      fullBuilds += 1;
      await fullGate.promise;
      return origBuildLocal(...args);
    };

    const fullTimeoutRes = await api.getFastify().inject({
      method: 'GET',
      url: `${ADMIN_ROUTE.CONTROL_SNAPSHOT}?scope=local&view=full&timeoutMs=25`,
    });
    t.equal(fullTimeoutRes.statusCode, 503, 'view=full timeout returns 503');
    t.equal(
      fullTimeoutRes.json().error,
      ADMIN_ERROR_MESSAGE.queryTimeout(25),
      'view=full timeout returns deterministic timeout refusal message',
    );
    t.equal(
      fullBuilds,
      1,
      'view=full timeout starts exactly 1 build and never launches a 2nd build',
    );
    fullGate.resolve();
    await new Promise((resolve) => setImmediate(resolve));

    const repairGate = createDeferred();
    let repairFallbackCalls = 0;
    api.controlSnapshot.resolveLocalControlSnapshot = async () => {
      await repairGate.promise;
      return {};
    };
    api.controlSnapshot.buildLocalControlSnapshot = async () => {
      repairFallbackCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 60));
      return {};
    };
    await t.rejects(
      api.controlSnapshot.resolveBoundedLocalControlSnapshot({
        allowAuthoritativeRepair: true,
        queryTimeoutMs: 20,
      }),
      /Query timeout after 20ms/,
      'allowAuthoritativeRepair fallback is bounded by remaining budget and fails closed on expiry',
    );
    t.equal(
      repairFallbackCalls,
      1,
      'allowAuthoritativeRepair path runs at most 1 bounded fallback and never retries unboundedly',
    );
    repairGate.resolve();
  });

test('HTTP client disconnect resolves cleanly without calling reply.send or leaking rejections',
  async (t) => {
    const cache = createServeLaneCache();
    const api = new AdminWebSocketAPI({
      nodeId: 'node-1',
      systemTableCache: cache,
      controlPlaneReadinessService: createReadinessService(),
      nowFn: () => CAPTURED_AT_MS,
    });

    const unhandledRejections = [];
    const onUnhandled = (reason) => {
      unhandledRejections.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);
    t.teardown(() => {
      process.off('unhandledRejection', onUnhandled);
    });

    const pendingBuild = createDeferred();
    api.controlSnapshot.resolveControlPlaneReadinessEntries = async () =>
      pendingBuild.promise;

    const reqRaw = new EventEmitter();
    reqRaw.destroyed = false;
    const resRaw = new EventEmitter();
    resRaw.destroyed = false;
    resRaw.writableEnded = false;

    let codeCalls = 0;
    let sendCalls = 0;
    const reply = {
      raw: resRaw,
      code() {
        codeCalls += 1;
        return reply;
      },
      send() {
        sendCalls += 1;
        return reply;
      },
    };
    const request = {raw: reqRaw, query: {}};

    const servePromise = api.serveControlSnapshotView(
      request,
      reply,
      ADMIN_CONTROL_SNAPSHOT.QUERY_VIEW_SERVE_LANE,
      5000,
    );
    await new Promise((resolve) => setImmediate(resolve));
    resRaw.emit('close');
    await servePromise;

    t.equal(codeCalls, 0, 'disconnected request does not call reply.code');
    t.equal(sendCalls, 0, 'disconnected request does not call reply.send');

    pendingBuild.reject(new Error('late_build_failure_after_disconnect'));
    await new Promise((resolve) => setTimeout(resolve, 10));
    t.same(
      unhandledRejections,
      [],
      'late build rejection after client disconnect produces zero unhandled rejections',
    );

    const destroyedLifecycle = await awaitSnapshotWithRequestLifecycle(
      Promise.resolve({ok: true}),
      {
        request: {raw: {destroyed: true}},
        reply: {raw: new EventEmitter()},
        timeoutMs: 500,
      },
    );
    t.same(
      destroyedLifecycle,
      {disconnected: true, snapshot: null},
      'already-destroyed request returns disconnected immediately',
    );
  });
