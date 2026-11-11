import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
} from
  '../../src/control-plane/control-plane-system-table-gateway-constants.js';
import {createImmediatePressureGovernor} from
  './control-plane-system-table-gateway-pressure-test-fixture.js';

// The gateway's read side: SQL fallback under pressure, typed read deferral,
// bootstrap snapshot scope, read single-flight and delivery priority, routing
// gap diagnostics, and bounded read retention with its diagnostics.
export function registerControlPlaneSystemTableGatewayReadTailTests({
  test,
  TABLES,
  PressureGovernor,
  PRESSURE_WORK_CLASS,
  ControlPlaneSystemTableGateway,
  CONTROL_PLANE_PHASE_SCOPE,
  METRICS_LOG_TAG,
  GATEWAY_ROUTING_GAP_OWNER_MISSING,
  GATEWAY_ROUTING_IDENTITY_MISSING,
}) {
  test('ControlPlaneSystemTableGateway readRows disables SQL fallback under ' +
    'pressure degrade', async (t) => {
    let sqlFallbackUsed = false;
    const gateway = new ControlPlaneSystemTableGateway({
      nodeId: 'node-gateway',
      pressureGovernor: createImmediatePressureGovernor(),
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
            options.readAuthority.authoritativeReadMode,
            CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_PREFERRED,
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
        },
        expectedOutcome: 'deferred',
        expectedAction: 'defer',
      },
    ];

    for (const testCase of cases) {
      let authoritativeCalls = 0;
      const gateway = new ControlPlaneSystemTableGateway({
        nodeId: `node-gateway-${testCase.name}`,
        pressureGovernor: createImmediatePressureGovernor(),
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
        admit(request) {
          return Promise.resolve(this.evaluate(request));
        },
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

    while (callCount === 0) {
      await new Promise((resolve) => setImmediate(resolve));
    }

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

  test('ControlPlaneSystemTableGateway readRows preserves delivery priority ' +
    'in authoritative read execution', async (t) => {
    let callCount = 0;
    const gateway = new ControlPlaneSystemTableGateway({
      nodeId: 'node-gateway',
      pressureGovernor: {
        configure() {},
        admit(request) {
          return Promise.resolve(this.evaluate(request));
        },
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
        async executeAuthoritativeSystemTableRead(_tableName, _sql, _params, options) {
          callCount++;
          return {
            success: true,
            rows: [{node_id: 'node-a'}],
            deliveryPriority: options?.queryOptions?.deliveryPriority || null,
          };
        },
      },
    });

    const result = await gateway.readRows(
      TABLES.NODES,
      'SELECT * FROM nodes WHERE node_id = ?',
      ['node-a'],
      {deliveryPriority: 'critical'},
    );

    t.equal(callCount, 1, 'gateway should execute one authoritative read');
    t.equal(
      result.deliveryPriority,
      'critical',
      'gateway should preserve delivery priority in authoritative read execution',
    );
  });

  test('ControlPlaneSystemTableGateway fallback diagnostics prefer the shared routing gap over stale partition leaders',
    async (t) => {
      const gateway = new ControlPlaneSystemTableGateway({
        nodeId: 'node-gateway',
        systemTableCache: {
          filter(tableName, predicate) {
            if (tableName === TABLES.PARTITIONS) {
              return [{
                partition_id: 'replica_operations-p1',
                table_name: TABLES.REPLICA_OPERATIONS,
                leader_node_id: 'stale-node',
              }].filter(predicate);
            }
            if (tableName === TABLES.SERVICES) {
              return [{
                partition_id: 'replica_operations-p1',
                service_type: 'partition',
                node_id: 'node-a',
                status: 'active',
                address: 'node-a/partition/replica_operations-p1-r1',
              }].filter(predicate);
            }
            return [];
          },
        },
        sqlQueryEngine: {
          queryExecutor: {
            getPartitionRoutingSnapshot(receivedPartitionId) {
              t.equal(
                receivedPartitionId,
                'replica_operations-p1',
                'gateway should consult the shared routing snapshot for fallback diagnostics',
              );
              return {
                partitionId: receivedPartitionId,
                canonicalLeaderIdentityState:
                  GATEWAY_ROUTING_IDENTITY_MISSING,
                canonicalLeaderRoutingGapState:
                  GATEWAY_ROUTING_GAP_OWNER_MISSING,
                serviceRowCount: 1,
                routableServiceCount: 1,
                deniedByNodeId: {},
              };
            },
          },
        },
      });

      const diagnostics =
        gateway.buildFallbackSystemTableRoutingDiagnostics(
          TABLES.REPLICA_OPERATIONS,
        );

      t.equal(
        diagnostics.leaderNodeId,
        undefined,
        'gateway should not leak a stale partition-row leader once the shared routing owner reports an owner gap',
      );
      t.equal(
        diagnostics.canonicalLeaderIdentityState,
        GATEWAY_ROUTING_IDENTITY_MISSING,
        'gateway should preserve the shared leader-identity state',
      );
      t.equal(
        diagnostics.canonicalLeaderRoutingGapState,
        GATEWAY_ROUTING_GAP_OWNER_MISSING,
        'gateway should preserve the shared leader-gap state',
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
        admit(request) {
          return Promise.resolve(this.evaluate(request));
        },
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
    while (releaseRead === null) {
      await new Promise((resolve) => setImmediate(resolve));
    }

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
}
