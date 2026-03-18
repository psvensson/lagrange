import {test} from '../../src/test-helpers/tap.js';
import {
  CONTROL_PLANE_PHASE_SCOPE,
  CONTROL_PLANE_MUTATION_MERGE_POLICY,
  CONTROL_PLANE_MUTATION_OUTCOME,
  CONTROL_PLANE_MUTATION_OPERATION,
  ControlPlaneSystemTableGateway,
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  METRICS_LOG_TAG,
  TABLES,
} from '../../src/constants/index.js';
import {
  PressureGovernor,
  PRESSURE_WORK_CLASS,
} from '../../src/control-plane/pressure-governor.js';

test('ControlPlaneSystemTableGateway readRows uses authoritative repair-' +
  'eligible defaults', async (t) => {
  const calls = [];
  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: 'node-gateway',
    cdcIntegrationService: {
      async executeAuthoritativeSystemTableRead(
        tableName,
        sql,
        params,
        options,
      ) {
        calls.push({tableName, sql, params, options});
        return {
          success: true,
          rows: [{node_id: 'node-a'}],
        };
      },
    },
    sqlQueryEngine: {
      async executeQuery() {
        throw new Error('should not fall back to raw SQL');
      },
    },
  });

  const result = await gateway.readRows(
    TABLES.NODES,
    'SELECT * FROM nodes WHERE node_id = ?',
    ['node-a'],
  );

  t.equal(result.success, true, 'authoritative read should succeed');
  t.equal(calls.length, 1, 'authoritative path should be used once');
  t.equal(
    calls[0].options.localReadConsistency,
    'local_leader',
    'gateway should prefer local authoritative reads',
  );
  t.equal(
    calls[0].options.replicaFallbackConsistency,
    'any_replica',
    'gateway should keep bounded replica fallback',
  );
  t.equal(
    calls[0].options.queryOptions.routingReadinessDimension,
    CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
    'gateway should route internal reads through repairEligible',
  );
});

test('ControlPlaneSystemTableGateway readRows returns a typed failure when ' +
  'authoritative reads fail', async (t) => {
  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: 'node-gateway',
    cdcIntegrationService: {
      async executeAuthoritativeSystemTableRead() {
        return {
          success: false,
          error: 'authoritative read unavailable',
          rows: [],
        };
      },
    },
    sqlQueryEngine: {
      async executeQuery() {
        throw new Error('gateway should not reconstruct with SQL fallback');
      },
    },
  });

  const result = await gateway.readRows(
    TABLES.SERVICES,
    'SELECT * FROM services WHERE service_id = ?',
    ['svc-1'],
  );

  t.equal(result.success, false, 'gateway should fail closed');
  t.equal(
    result.outcome,
    'owner_not_ready',
    'gateway should return a typed owner result instead of falling back',
  );
});

test('ControlPlaneSystemTableGateway emits read telemetry with owner and ' +
  'strategy details', async (t) => {
  const metricEvents = [];
  let currentTimeMs = 1000;
  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: 'node-gateway',
    now: () => currentTimeMs,
    logger: {
      info(tag, data) {
        metricEvents.push({tag, data});
      },
    },
    cdcIntegrationService: {
      async executeAuthoritativeSystemTableRead() {
        currentTimeMs += 12;
        return {
          success: true,
          rows: [{node_id: 'node-a'}],
        };
      },
    },
  });

  await gateway.executeRead({
    owner: 'nodes-owner',
    tableName: TABLES.NODES,
    sql: 'SELECT * FROM nodes WHERE node_id = ?',
    params: ['node-a'],
    strategy: 'authoritative',
  }, {
    workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
    coalescingKey: 'nodes:node-a',
  });

  const readMetric = metricEvents.find((entry) => {
    return entry.tag === METRICS_LOG_TAG.CONTROL_PLANE_GATEWAY_READ;
  }) || null;

  t.ok(readMetric, 'read telemetry should emit one metric');
  t.equal(
    readMetric?.tag,
    METRICS_LOG_TAG.CONTROL_PLANE_GATEWAY_READ,
    'read telemetry should use the gateway read tag',
  );
  t.equal(readMetric?.data.owner, 'nodes-owner', 'owner should be included');
  t.equal(readMetric?.data.tableName, TABLES.NODES, 'table should be included');
  t.equal(readMetric?.data.outcome, 'authoritative', 'outcome should be included');
  t.equal(readMetric?.data.strategy, 'authoritative', 'strategy should be included');
  t.equal(
    readMetric?.data.workClass,
    PRESSURE_WORK_CLASS.INTERACTIVE,
    'work class should be included',
  );
  t.equal(
    readMetric?.data.coalescingKey,
    'nodes:node-a',
    'coalescing key should be included',
  );
  t.equal(readMetric?.data.latencyMs, 12, 'latency should be measured');
  t.equal(readMetric?.data.rowCount, 1, 'row count should be included');
  t.equal(
    gateway.getStats().metrics.readOutcomeCounts.authoritative,
    1,
    'read outcome counters should be tracked',
  );
  t.equal(
    gateway.getStats().metrics.maxObservedReadLatencyMs,
    12,
    'read latency metric should be tracked',
  );
});

test('ControlPlaneSystemTableGateway updateSystemTableRow routes writes ' +
  'through repairEligible', async (t) => {
  const updateCalls = [];
  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: 'node-gateway',
    cdcIntegrationService: {
      async updateSystemTableRow(tableName, whereClause, data, options) {
        updateCalls.push({tableName, whereClause, data, options});
        return {success: true};
      },
    },
  });

  await gateway.updateSystemTableRow(
    TABLES.NODE_ENDPOINTS,
    {endpoint_id: 'ep-1'},
    {address: 'ws://127.0.0.1:8080'},
  );

  t.equal(updateCalls.length, 1, 'write should be delegated once');
  t.equal(
    updateCalls[0].options.routingReadinessDimension,
    CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
    'control-plane writes should use repairEligible',
  );
});

test('ControlPlaneSystemTableGateway emits mutation telemetry with owner and ' +
  'coalescing details', async (t) => {
  const metricEvents = [];
  let currentTimeMs = 2000;
  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: 'node-gateway',
    now: () => currentTimeMs,
    logger: {
      info(tag, data) {
        metricEvents.push({tag, data});
      },
    },
    cdcIntegrationService: {
      async updateSystemTableRow() {
        currentTimeMs += 7;
        return {success: true};
      },
    },
  });

  await gateway.submitMutation({
    owner: 'services-owner',
    operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
    tableName: TABLES.SERVICES,
    whereClause: {service_id: 'svc-1'},
    data: {status: 'active'},
  }, {
    workClass: PRESSURE_WORK_CLASS.BACKGROUND,
    coalescingKey: 'services:svc-1',
    mergePolicy: CONTROL_PLANE_MUTATION_MERGE_POLICY.SINGLE_FLIGHT,
  });

  const mutationMetric = metricEvents.find((entry) => {
    return entry.tag === METRICS_LOG_TAG.CONTROL_PLANE_GATEWAY_MUTATION;
  }) || null;

  t.ok(mutationMetric, 'mutation telemetry should emit one metric');
  t.equal(
    mutationMetric?.tag,
    METRICS_LOG_TAG.CONTROL_PLANE_GATEWAY_MUTATION,
    'mutation telemetry should use the gateway mutation tag',
  );
  t.equal(mutationMetric?.data.owner, 'services-owner', 'owner should be included');
  t.equal(mutationMetric?.data.tableName, TABLES.SERVICES, 'table should be included');
  t.equal(
    mutationMetric?.data.operation,
    CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
    'operation should be included',
  );
  t.equal(
    mutationMetric?.data.outcome,
    CONTROL_PLANE_MUTATION_OUTCOME.APPLIED,
    'outcome should be included',
  );
  t.equal(
    mutationMetric?.data.workClass,
    PRESSURE_WORK_CLASS.BACKGROUND,
    'work class should be included',
  );
  t.equal(
    mutationMetric?.data.coalescingKey,
    'services:svc-1',
    'coalescing key should be included',
  );
  t.equal(
    mutationMetric?.data.mergePolicy,
    CONTROL_PLANE_MUTATION_MERGE_POLICY.SINGLE_FLIGHT,
    'merge policy should be included',
  );
  t.equal(mutationMetric?.data.latencyMs, 7, 'latency should be measured');
  t.equal(
    gateway.getStats().metrics.mutationOutcomeCounts.applied,
    1,
    'mutation outcome counters should be tracked',
  );
  t.equal(
    gateway.getStats().metrics.maxObservedMutationLatencyMs,
    7,
    'mutation latency metric should be tracked',
  );
});

test('ControlPlaneSystemTableGateway emits shared pressure diagnostics with ' +
  'control-plane resource keys', async (t) => {
  const metricEvents = [];
  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: 'pressure-gateway-node',
    logger: {
      info(tag, data) {
        metricEvents.push({tag, data});
      },
    },
    messageRouter: {
      getOutboundPressureSummary() {
        return {
          backpressured: true,
          saturatedNodeCount: 1,
          totalPending: 64,
          maxPendingUtilization: 1,
        };
      },
    },
  });

  await gateway.executeRead({
    tableName: TABLES.NODES,
    strategy: 'cache',
  }, {
    workClass: PRESSURE_WORK_CLASS.BACKGROUND,
  });

  const pressureMetric = metricEvents.find((entry) => {
    return entry.tag === METRICS_LOG_TAG.PRESSURE_POLICY;
  }) || null;

  t.ok(pressureMetric, 'pressure policy metric should be emitted');
  t.same(
    pressureMetric?.data?.resourceKeys,
    ['control-plane:read', `control-plane:table:${TABLES.NODES}`],
    'pressure diagnostics should preserve control-plane resource keys',
  );
  t.equal(
    pressureMetric?.data?.capacityPartition,
    'control-plane',
    'pressure diagnostics should preserve the control-plane partition',
  );
});

test('ControlPlaneSystemTableGateway logs typed defer reasons for harness ' +
  'playback', async (t) => {
  const warnings = [];
  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: 'defer-gateway-node',
    logger: {
      info() {},
      warn(message, data) {
        warnings.push({message, data});
      },
    },
    messageRouter: {
      getOutboundPressureSummary() {
        return {
          backpressured: true,
          saturatedNodeCount: 1,
          totalPending: 64,
          maxPendingUtilization: 1,
        };
      },
    },
  });

  const result = await gateway.executeRead({
    tableName: TABLES.NODES,
    strategy: 'cache',
  }, {
    workClass: PRESSURE_WORK_CLASS.BACKGROUND,
    allowPressureDegrade: false,
    allowPressureDefer: true,
    pressureRetryAfterMs: 275,
  });

  t.equal(result.outcome, 'deferred', 'gateway should surface deferred outcome');
  t.equal(warnings.length, 1, 'gateway should emit one harness-friendly warning');
  t.equal(
    warnings[0].message,
    'Control-plane metadata read deferred',
    'warning should identify the deferred gateway path',
  );
  t.equal(
    warnings[0].data.pressureReason,
    'transport_backpressure',
    'warning should include the typed defer reason',
  );
  t.equal(
    warnings[0].data.retryAfterMs,
    275,
    'warning should include retry hints for the harness',
  );
});

test('ControlPlaneSystemTableGateway submitMutation centralizes write ingress',
  async (t) => {
    const updateCalls = [];
    const gateway = new ControlPlaneSystemTableGateway({
      nodeId: 'node-gateway',
      cdcIntegrationService: {
        async updateSystemTableRow(tableName, whereClause, data, options) {
          updateCalls.push({tableName, whereClause, data, options});
          return {success: true};
        },
      },
    });

    await gateway.submitMutation({
      operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
      tableName: TABLES.SERVICES,
      whereClause: {service_id: 'svc-1'},
      data: {status: 'active'},
    }, {
      workClass: 'background',
      allowPressureDefer: true,
      coalescingKey: 'services:svc-1',
    });

    t.equal(updateCalls.length, 1, 'central mutation ingress should delegate once');
    t.same(
      updateCalls[0].whereClause,
      {service_id: 'svc-1'},
      'central mutation ingress should preserve the where clause',
    );
    t.equal(
      updateCalls[0].options.coalescingKey,
      'services:svc-1',
      'central mutation ingress should preserve gateway write options',
    );
  });

test('ControlPlaneSystemTableGateway supportsReadRows only when a readable ' +
  'backend is configured', async (t) => {
  const emptyGateway = new ControlPlaneSystemTableGateway();
  t.equal(
    emptyGateway.supportsReadRows(),
    false,
    'gateway without authoritative or SQL owner should not claim readability',
  );

  const authoritativeGateway = new ControlPlaneSystemTableGateway({
    cdcIntegrationService: {
      async executeAuthoritativeSystemTableRead() {
        return {success: true, rows: []};
      },
    },
  });
  t.equal(
    authoritativeGateway.supportsReadRows(),
    true,
    'authoritative owner should make the gateway readable',
  );

  const sqlGateway = new ControlPlaneSystemTableGateway({
    sqlQueryEngine: {
      async executeQuery() {
        return {success: true, rows: []};
      },
    },
  });
  t.equal(
    sqlGateway.supportsReadRows(),
    true,
    'SQL owner should make the gateway readable',
  );
});

test('ControlPlaneSystemTableGateway submitMutation replace_pending keeps ' +
  'only the newest pending mutation for one coalescing key', async (t) => {
  const updateCalls = [];
  const releaseUpdates = [];
  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: 'node-gateway',
    cdcIntegrationService: {
      async updateSystemTableRow(tableName, whereClause, data, options) {
        updateCalls.push({tableName, whereClause, data, options});
        await new Promise((resolve) => {
          releaseUpdates.push(resolve);
        });
        return {
          success: true,
          partitionResult: {affectedRows: 1},
        };
      },
    },
  });

  const firstMutation = gateway.submitMutation({
    operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
    tableName: TABLES.SERVICES,
    whereClause: {service_id: 'svc-1'},
    data: {status: 'creating'},
  }, {
    coalescingKey: 'services:svc-1',
    mergePolicy: CONTROL_PLANE_MUTATION_MERGE_POLICY.REPLACE_PENDING,
  });

  const secondMutation = gateway.submitMutation({
    operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
    tableName: TABLES.SERVICES,
    whereClause: {service_id: 'svc-1'},
    data: {status: 'syncing'},
  }, {
    coalescingKey: 'services:svc-1',
    mergePolicy: CONTROL_PLANE_MUTATION_MERGE_POLICY.REPLACE_PENDING,
  });

  const thirdMutation = gateway.submitMutation({
    operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
    tableName: TABLES.SERVICES,
    whereClause: {service_id: 'svc-1'},
    data: {status: 'active'},
  }, {
    coalescingKey: 'services:svc-1',
    mergePolicy: CONTROL_PLANE_MUTATION_MERGE_POLICY.REPLACE_PENDING,
  });

  await Promise.resolve();

  t.equal(updateCalls.length, 1, 'only the first write should start immediately');
  t.equal(
    gateway.getStats().retainedRequests.inFlightMutations,
    1,
    'gateway should retain one tracked in-flight mutation',
  );

  releaseUpdates.shift()();
  const firstResult = await firstMutation;
  const secondResult = await secondMutation;

  t.equal(
    secondResult.outcome,
    CONTROL_PLANE_MUTATION_OUTCOME.NO_OP,
    'superseded pending mutation should resolve as no_op',
  );
  t.equal(firstResult.outcome, CONTROL_PLANE_MUTATION_OUTCOME.APPLIED,
    'first mutation should still apply');

  await Promise.resolve();
  t.equal(updateCalls.length, 2, 'only the latest pending mutation should run next');
  t.same(
    updateCalls[1].data,
    {status: 'active'},
    'the newest pending mutation should replace the older pending mutation',
  );
  t.equal(
    gateway.getStats().metrics.mutationReplacePendingQueuedCount,
    2,
    'gateway should count queued replace_pending mutations',
  );
  t.equal(
    gateway.getStats().metrics.mutationReplacePendingSupersededCount,
    1,
    'gateway should count superseded pending mutations',
  );
  t.equal(
    gateway.getStats().metrics.maxObservedPendingReplaceMutationRequests,
    1,
    'gateway should keep at most one pending replacement per key',
  );

  releaseUpdates.shift()();
  const thirdResult = await thirdMutation;
  t.equal(thirdResult.outcome, CONTROL_PLANE_MUTATION_OUTCOME.APPLIED,
    'latest pending mutation should eventually apply');
});

test('ControlPlaneSystemTableGateway submitMutation single-flights ' +
  'identical mutations in the gateway', async (t) => {
  const updateCalls = [];
  let releaseMutation = null;
  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: 'node-gateway',
    cdcIntegrationService: {
      async updateSystemTableRow(tableName, whereClause, data, options) {
        updateCalls.push({tableName, whereClause, data, options});
        await new Promise((resolve) => {
          releaseMutation = resolve;
        });
        return {
          success: true,
          partitionResult: {affectedRows: 1},
        };
      },
    },
  });

  const firstMutation = gateway.submitMutation({
    operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
    tableName: TABLES.SERVICES,
    whereClause: {service_id: 'svc-1'},
    data: {status: 'active'},
  });
  const secondMutation = gateway.submitMutation({
    operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
    tableName: TABLES.SERVICES,
    whereClause: {service_id: 'svc-1'},
    data: {status: 'active'},
  });

  await Promise.resolve();

  t.equal(updateCalls.length, 1,
    'identical gateway mutations should collapse to one in-flight write');

  releaseMutation();
  const [firstResult, secondResult] = await Promise.all([
    firstMutation,
    secondMutation,
  ]);
  t.same(firstResult, secondResult,
    'single-flighted mutations should resolve with the same result');
  t.equal(
    gateway.getStats().metrics.mutationSingleFlightJoinCount,
    1,
    'gateway should record one mutation single-flight join',
  );
  t.equal(
    gateway.getStats().metrics.maxObservedInFlightMutationRequests,
    1,
    'gateway should bound tracked in-flight mutation retention to one key here',
  );
});

test('ControlPlaneSystemTableGateway readRows disables SQL fallback under ' +
  'pressure degrade', async (t) => {
  let sqlFallbackUsed = false;
  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: 'node-gateway',
    messageRouter: {
      getOutboundPressureSummary() {
        return {
          backpressured: true,
          saturatedNodeCount: 1,
          totalPending: 64,
          maxPendingUtilization: 1,
        };
      },
    },
    cdcIntegrationService: {
      async executeAuthoritativeSystemTableRead(
        _tableName,
        _sql,
        _params,
        options,
      ) {
        t.equal(
          options.allowSqlFallback,
          false,
          'pressure degrade should disable routed SQL fallback',
        );
        return {
          success: false,
          error: 'local authoritative row unavailable',
          rows: [],
        };
      },
    },
    sqlQueryEngine: {
      async executeQuery() {
        sqlFallbackUsed = true;
        return {
          success: true,
          rows: [{node_id: 'node-a'}],
        };
      },
    },
  });

  const result = await gateway.readRows(
    TABLES.NODES,
    'SELECT * FROM nodes WHERE node_id = ?',
    ['node-a'],
    {
      workClass: PRESSURE_WORK_CLASS.BACKGROUND,
    },
  );

  t.equal(sqlFallbackUsed, false, 'gateway should not issue routed SQL fallback');
  t.equal(result.success, false, 'degraded read should fail closed');
  t.equal(
    result.errorCode,
    'CONTROL_PLANE_PRESSURE_DEGRADED',
    'gateway should return a typed degraded result',
  );
});

test('ControlPlaneSystemTableGateway executeRead returns typed defer and ' +
  'reject outcomes under pressure', async (t) => {
  const cases = [
    {
      name: 'defer',
      options: {
        workClass: PRESSURE_WORK_CLASS.BACKGROUND,
        allowPressureDegrade: false,
        allowPressureDefer: true,
      },
      expectedOutcome: 'deferred',
      expectedAction: 'defer',
    },
    {
      name: 'reject',
      options: {
        workClass: PRESSURE_WORK_CLASS.BACKGROUND,
        allowPressureDegrade: false,
      },
      expectedOutcome: 'rejected',
      expectedAction: 'reject',
    },
  ];

  for (const testCase of cases) {
    let authoritativeCalls = 0;
    const gateway = new ControlPlaneSystemTableGateway({
      nodeId: `node-gateway-${testCase.name}`,
      messageRouter: {
        getOutboundPressureSummary() {
          return {
            backpressured: true,
            saturatedNodeCount: 1,
            totalPending: 64,
            maxPendingUtilization: 1,
          };
        },
      },
      cdcIntegrationService: {
        async executeAuthoritativeSystemTableRead() {
          authoritativeCalls++;
          return {
            success: true,
            rows: [{node_id: 'node-a'}],
          };
        },
      },
    });

    const result = await gateway.executeRead({
      tableName: TABLES.NODES,
      strategy: 'authoritative',
      sql: 'SELECT * FROM nodes WHERE node_id = ?',
      params: ['node-a'],
    }, testCase.options);

    t.equal(authoritativeCalls, 0,
      `${testCase.name}: pressure outcome should stop the authoritative read`);
    t.equal(result.success, false,
      `${testCase.name}: pressure outcome should fail closed`);
    t.equal(result.outcome, testCase.expectedOutcome,
      `${testCase.name}: gateway should expose the typed read outcome`);
    t.equal(result.pressureAction, testCase.expectedAction,
      `${testCase.name}: gateway should preserve the underlying pressure action`);
  }
});

test('ControlPlaneSystemTableGateway restricts bootstrap snapshot reads to ' +
  'explicit bootstrap/join phase scopes', async (t) => {
  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: 'node-gateway',
    pressureGovernor: new PressureGovernor({
      nodeId: 'node-gateway',
    }),
  });

  const deniedResult = await gateway.executeRead({
    tableName: TABLES.NODES,
    strategy: 'bootstrap_snapshot',
    bootstrapSnapshotRows: [{node_id: 'node-a'}],
  });

  t.equal(deniedResult.success, false,
    'runtime callers should not read bootstrap snapshots without an explicit phase scope');
  t.equal(
    deniedResult.error,
    'bootstrap_snapshot_phase_scope_required',
    'bootstrap snapshot reads should fail closed without bootstrap/join scope',
  );

  const allowedResult = await gateway.executeRead({
    tableName: TABLES.NODES,
    strategy: 'bootstrap_snapshot',
    bootstrapSnapshotRows: [{node_id: 'node-a'}],
    phaseScope: CONTROL_PLANE_PHASE_SCOPE.JOIN,
  });

  t.equal(allowedResult.success, true,
    'explicit join scope should allow bootstrap snapshot reads');
  t.equal(allowedResult.rows.length, 1,
    'bootstrap snapshot read should return supplied rows when scope is explicit');
});

test('ControlPlaneSystemTableGateway readRows single-flights identical ' +
  'control-plane reads', async (t) => {
  let releaseRead = null;
  let callCount = 0;
  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: 'node-gateway',
    pressureGovernor: {
      configure() {},
      evaluate() {
        return {
          action: 'allow',
          reason: 'test-allow',
          summary: null,
          retryAfterMs: 0,
        };
      },
    },
    cdcIntegrationService: {
      async executeAuthoritativeSystemTableRead() {
        callCount++;
        await new Promise((resolve) => {
          releaseRead = resolve;
        });
        return {
          success: true,
          rows: [{node_id: 'node-a'}],
        };
      },
    },
    sqlQueryEngine: {
      async executeQuery() {
        throw new Error('should not fall back to raw SQL');
      },
    },
  });

  const firstRead = gateway.readRows(
    TABLES.NODES,
    'SELECT * FROM nodes WHERE node_id = ?',
    ['node-a'],
  );
  const secondRead = gateway.readRows(
    TABLES.NODES,
    'SELECT * FROM nodes WHERE node_id = ?',
    ['node-a'],
  );

  await Promise.resolve();

  t.equal(callCount, 1, 'identical authoritative reads should collapse in flight');

  releaseRead();
  const [firstResult, secondResult] = await Promise.all([firstRead, secondRead]);
  t.same(firstResult, secondResult, 'coalesced reads should share one result');
  t.equal(
    gateway.getStats().metrics.readSingleFlightJoinCount,
    1,
    'gateway should record one read single-flight join',
  );
  t.equal(
    gateway.getStats().metrics.maxObservedInFlightReadRequests,
    1,
    'gateway should keep one tracked read request for the shared key',
  );
});

test('ControlPlaneSystemTableGateway readRows bounds tracked read retention ' +
  'and records bypass metrics', async (t) => {
  let firstRelease = null;
  let secondRelease = null;
  let callCount = 0;
  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: 'node-gateway',
    maxTrackedReadRequests: 1,
    pressureGovernor: {
      configure() {},
      evaluate() {
        return {
          action: 'allow',
          reason: 'test-allow',
          summary: null,
          retryAfterMs: 0,
        };
      },
    },
    cdcIntegrationService: {
      async executeAuthoritativeSystemTableRead(_tableName, _sql, params) {
        callCount++;
        await new Promise((resolve) => {
          if (params[0] === 'node-a') {
            firstRelease = resolve;
            return;
          }
          secondRelease = resolve;
        });
        return {
          success: true,
          rows: [{node_id: params[0]}],
        };
      },
    },
  });

  const firstRead = gateway.readRows(
    TABLES.NODES,
    'SELECT * FROM nodes WHERE node_id = ?',
    ['node-a'],
  );
  await Promise.resolve();
  const secondRead = gateway.readRows(
    TABLES.NODES,
    'SELECT * FROM nodes WHERE node_id = ?',
    ['node-b'],
  );

  await Promise.resolve();

  const statsWhileBusy = gateway.getStats();
  t.equal(callCount, 2, 'second distinct read should bypass tracking at capacity');
  t.equal(
    statsWhileBusy.retainedRequests.inFlightReads,
    1,
    'gateway should retain only one tracked read request at the configured limit',
  );
  t.equal(
    statsWhileBusy.metrics.readTrackingBypassCount,
    1,
    'gateway should record one read-tracking bypass at capacity',
  );

  firstRelease();
  secondRelease();
  await Promise.all([firstRead, secondRead]);
});

test('ControlPlaneSystemTableGateway emits bounded retention diagnostics for ' +
  'in-flight work', async (t) => {
  const metricEvents = [];
  let releaseRead = null;
  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: 'retention-node',
    logger: {
      info(tag, data) {
        metricEvents.push({tag, data});
      },
    },
    cdcIntegrationService: {
      async executeAuthoritativeSystemTableRead() {
        await new Promise((resolve) => {
          releaseRead = resolve;
        });
        return {
          success: true,
          rows: [{node_id: 'node-a'}],
        };
      },
    },
  });

  const readPromise = gateway.readRows(
    TABLES.NODES,
    'SELECT * FROM nodes WHERE node_id = ?',
    ['node-a'],
  );
  await Promise.resolve();

  const retentionMetrics = metricEvents.filter((entry) => {
    return entry.tag === METRICS_LOG_TAG.CONTROL_PLANE_GATEWAY_RETENTION;
  });
  const busyMetric = retentionMetrics.find((entry) => {
    return entry.data?.retainedRequests?.inFlightReads === 1;
  }) || null;

  t.ok(busyMetric, 'retention diagnostics should include in-flight work');
  t.equal(
    busyMetric?.data?.retainedRequests?.total,
    1,
    'retention diagnostics should report total retained work',
  );
  t.equal(
    busyMetric?.data?.boundedByTrackedCapacity,
    true,
    'retention diagnostics should confirm bounded retention',
  );
  t.equal(
    busyMetric?.data?.retainedRequestCapacity,
    gateway.getStats().limits.maxTrackedReadRequests +
      gateway.getStats().limits.maxTrackedQueryRequests +
      gateway.getStats().limits.maxTrackedMutationRequests +
      gateway.getStats().limits.maxPendingReplaceMutationRequests,
    'retention diagnostics should expose tracked capacity',
  );

  releaseRead();
  await readPromise;

  const idleMetric = metricEvents.find((entry) => {
    return entry.tag === METRICS_LOG_TAG.CONTROL_PLANE_GATEWAY_RETENTION &&
      entry.data?.retainedRequests?.total === 0 &&
      entry.data?.maxObservedRetainedRequestCount >= 1;
  }) || null;
  t.ok(idleMetric, 'retention diagnostics should include the release back to idle');
});

test('ControlPlaneSystemTableGateway submitMutation rejects replace_pending ' +
  'work when tracked mutation capacity is exhausted', async (t) => {
  const updateCalls = [];
  const releaseUpdates = [];
  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: 'node-gateway',
    maxTrackedMutationRequests: 1,
    cdcIntegrationService: {
      async updateSystemTableRow(tableName, whereClause, data, options) {
        updateCalls.push({tableName, whereClause, data, options});
        await new Promise((resolve) => {
          releaseUpdates.push(resolve);
        });
        return {
          success: true,
          partitionResult: {affectedRows: 1},
        };
      },
    },
  });

  const firstMutation = gateway.submitMutation({
    operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
    tableName: TABLES.SERVICES,
    whereClause: {service_id: 'svc-1'},
    data: {status: 'syncing'},
  }, {
    coalescingKey: 'services:svc-1',
    mergePolicy: CONTROL_PLANE_MUTATION_MERGE_POLICY.REPLACE_PENDING,
  });

  await Promise.resolve();

  const secondResult = await gateway.submitMutation({
    operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
    tableName: TABLES.SERVICES,
    whereClause: {service_id: 'svc-2'},
    data: {status: 'active'},
  }, {
    coalescingKey: 'services:svc-2',
    mergePolicy: CONTROL_PLANE_MUTATION_MERGE_POLICY.REPLACE_PENDING,
  });

  t.equal(updateCalls.length, 1, 'gateway should not retain a second tracked mutation');
  t.equal(secondResult.success, false, 'saturated tracked mutation should be rejected');
  t.equal(
    secondResult.outcome,
    CONTROL_PLANE_MUTATION_OUTCOME.REJECTED,
    'saturated tracked mutation should fail with a typed rejected outcome',
  );
  t.equal(
    gateway.getStats().metrics.mutationTrackingRejectedCount,
    1,
    'gateway should count mutation tracking saturation',
  );
  t.equal(
    gateway.getStats().retainedRequests.inFlightMutations,
    1,
    'gateway should keep tracked mutation retention at the configured bound',
  );

  releaseUpdates.shift()();
  const firstResult = await firstMutation;
  t.equal(firstResult.outcome, CONTROL_PLANE_MUTATION_OUTCOME.APPLIED,
    'first tracked mutation should still complete normally');
});

test('ControlPlaneSystemTableGateway executeQuery defers opted-in raw ' +
  'system-table reads under pressure', async (t) => {
  let sqlCalls = 0;
  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: 'node-gateway',
    messageRouter: {
      getOutboundPressureSummary() {
        return {
          backpressured: true,
          saturatedNodeCount: 1,
          totalPending: 64,
          maxPendingUtilization: 1,
        };
      },
    },
    sqlQueryEngine: {
      async executeQuery() {
        sqlCalls++;
        return {
          success: true,
          rows: [{total_count: 0}],
        };
      },
    },
  });

  const result = await gateway.executeQuery(
    'SELECT * FROM replica_operations WHERE status = ?',
    ['pending'],
    {
      controlPlaneTableName: TABLES.REPLICA_OPERATIONS,
      controlPlaneOperationKind: 'read',
      workClass: PRESSURE_WORK_CLASS.BACKGROUND,
      allowPressureDefer: true,
      deliveryPriority: 'background',
    },
  );

  t.equal(result.success, false, 'background raw query should fail closed');
  t.equal(
    result.errorCode,
    'CONTROL_PLANE_PRESSURE_DEGRADED',
    'gateway should expose typed pressure admission failures',
  );
  t.equal(sqlCalls, 0, 'deferred raw reads should not hit routed SQL');
});
