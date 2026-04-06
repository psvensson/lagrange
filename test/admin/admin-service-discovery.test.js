import {test} from '../../src/test-helpers/tap.js';
import {TABLES} from '../../src/constants/index.js';
import {AdminServiceDiscovery} from '../../src/admin/admin-service-discovery.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {PRESSURE_WORK_CLASS} from
  '../../src/control-plane/pressure-governor.js';

test('AdminServiceDiscovery routes authoritative cache repair through the ' +
  'gateway instead of mutating the cache directly', async (t) => {
  const repairCalls = [];
  const discovery = new AdminServiceDiscovery({
    nodeId: 'node-a',
    systemTableCache: {
      getAll() {
        return [];
      },
    },
    cacheMutationTarget: {
      applySystemTableChange() {
        throw new Error('service discovery must not mutate cache directly');
      },
    },
    controlPlaneSystemTableGateway: {
      reconcileAuthoritativeCacheRows(tableName, rows, options) {
        repairCalls.push({tableName, rows, options});
        return Promise.resolve({success: true, mutationCount: 3});
      },
    },
  });

  const mutationCount = await discovery.applyAuthoritativeSystemTableRows(
    TABLES.SERVICES,
    [{service_id: 'svc-1'}],
    'admin-discovery:test',
  );

  t.equal(mutationCount, 3, 'gateway-provided mutation count should propagate');
  t.equal(repairCalls.length, 1, 'service discovery should delegate once');
  t.equal(
    repairCalls[0].options.causeId,
    'admin-discovery:test',
    'service discovery should preserve the repair cause',
  );
});

test('AdminServiceDiscovery authoritative cache repair reads use control-plane recovery semantics',
  async (t) => {
    const readCalls = [];
    const discovery = new AdminServiceDiscovery({
      nodeId: 'node-a',
      systemTableCache: {
        getAll() {
          return [];
        },
      },
      cacheMutationTarget: {
        applySystemTableChange() {},
      },
      controlPlaneSystemTableGateway: {
        async executeRead(readIntent, options) {
          readCalls.push({
            tableName: readIntent?.tableName,
            routingReadinessDimension: options?.routingReadinessDimension,
          });
          return {
            success: true,
            tableName: readIntent?.tableName,
            rows: [],
          };
        },
        async reconcileAuthoritativeCacheRows() {
          return {success: true, mutationCount: 0};
        },
      },
    });

    await discovery.ensureAuthoritativeDiscoveryCacheRepair({
      reason: 'unit-test-recovery-routing',
      triggerCodes: ['discovery_node_coverage_gap'],
    });

    t.equal(readCalls.length > 0, true);
    t.equal(
      readCalls.every((call) =>
        call.routingReadinessDimension ===
          CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
      ),
      true,
      'authoritative discovery repair should route gateway reads as control-plane recovery work',
    );
  });

test('AdminServiceDiscovery control snapshot repair reads bypass pressure degradation',
  async (t) => {
    const readCalls = [];
    const discovery = new AdminServiceDiscovery({
      nodeId: 'node-a',
      systemTableCache: {
        getAll() {
          return [];
        },
      },
      cacheMutationTarget: {
        applySystemTableChange() {},
      },
      controlPlaneSystemTableGateway: {
        async executeRead(readIntent, options) {
          readCalls.push({
            tableName: readIntent?.tableName,
            allowPressureDegrade: options?.allowPressureDegrade,
            workClass: options?.workClass,
            deliveryPriority: options?.deliveryPriority,
            routingReadinessDimension: options?.routingReadinessDimension,
          });
          return {
            success: true,
            tableName: readIntent?.tableName,
            rows: [],
          };
        },
        async reconcileAuthoritativeCacheRows() {
          return {success: true, mutationCount: 0};
        },
      },
    });

    await discovery.ensureAuthoritativeDiscoveryCacheRepair({
      reason: 'control_snapshot',
      triggerCodes: ['discovery_node_coverage_gap'],
    });

    t.equal(readCalls.length > 0, true,
      'control snapshot repair should issue authoritative discovery reads');
    t.equal(
      readCalls.every((call) => call.allowPressureDegrade === false),
      true,
      'control snapshot repair should fail closed instead of degrading on pressure',
    );
    t.equal(
      readCalls.every((call) =>
        call.workClass === PRESSURE_WORK_CLASS.CRITICAL),
      true,
      'control snapshot repair should use the critical work class',
    );
    t.equal(
      readCalls.every((call) => call.deliveryPriority === 'critical'),
      true,
      'control snapshot repair should use critical delivery priority',
    );
    t.equal(
      readCalls.every((call) =>
        call.routingReadinessDimension ===
          CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE),
      true,
      'control snapshot repair should keep recovery-eligible routing semantics',
    );
  });

test(
  'AdminServiceDiscovery does not report applied repair when any authoritative read fails',
  async (t) => {
    const reconcileCalls = [];
    const readCalls = [];
    const warnings = [];
    const discovery = new AdminServiceDiscovery({
      nodeId: 'node-a',
      systemTableCache: {
        getAll() {
          return [];
        },
      },
      cacheMutationTarget: {
        applySystemTableChange() {},
      },
      controlPlaneSystemTableGateway: {
        async executeRead(readIntent) {
          const tableName = String(readIntent?.tableName || '');
          readCalls.push(tableName);
          if (tableName === TABLES.SERVICES) {
            return {
              success: false,
              error: 'authoritative_services_unavailable',
            };
          }
          return {
            success: true,
            tableName,
            rows: [],
          };
        },
        async reconcileAuthoritativeCacheRows(tableName, rows, options) {
          reconcileCalls.push({tableName, rows, options});
          return {success: true, mutationCount: 1};
        },
      },
    });
    discovery.logger = {
      warn(message, fields) {
        warnings.push({message, fields});
      },
      info() {},
    };

    const repair = await discovery.ensureAuthoritativeDiscoveryCacheRepair({
      reason: 'unit-test-partial-read-failure',
    });

    t.equal(repair.applied, false, 'repair should fail when any table read fails');
    t.equal(repair.tableCount, 0,
      'failed repair should not apply partial cache mutations');
    t.equal(
      Array.isArray(repair.failedTables) &&
        repair.failedTables.includes(TABLES.SERVICES),
      true,
      'failed table should be surfaced in repair diagnostics',
    );
    t.equal(reconcileCalls.length, 0,
      'repair should not mutate cache state after a read-stage failure');
    t.equal(readCalls.length > 0, true,
      'repair should attempt authoritative table reads through the gateway');
    t.equal(warnings.length, 1,
      'failed repair should emit one bounded warning');
    t.equal(
      warnings[0]?.fields?.requestedTableCount,
      repair.requestedTableCount,
      'warning should preserve requested table count',
    );
    t.same(
      warnings[0]?.fields?.failedTables,
      repair.failedTables,
      'warning should preserve failed table names',
    );
    t.equal(
      warnings[0]?.fields?.errorCount,
      repair.errorCount,
      'warning should preserve the error count',
    );
    t.same(
      warnings[0]?.fields?.errorCodes,
      ['authoritative_services_unavailable'],
      'warning should emit a bounded error-code summary',
    );
  },
);

test(
  'AdminServiceDiscovery classifies participant-failure repair cause chains',
  async (t) => {
    const warnings = [];
    const participantFailure = {
      success: false,
      errorCode: 'DISTRIBUTED_PARTICIPANT_FAILURE',
      error: 'Distributed operation failed due to participant failures',
      retryAfterMs: 250,
      participantFailures: [{
        partitionId: 'services-p1',
        participantNodeId: 'node-pressure',
        participantAddress: 'ws://node-pressure:7001',
        errorCode: 'CONTROL_PLANE_PRESSURE_DEGRADED',
        error: 'Outbound queue for node node-pressure is saturated',
        durationMs: 412,
        retryAfterMs: 250,
        backpressured: true,
        failedTable: TABLES.SERVICES,
      }],
      firstFailedParticipant: {
        partitionId: 'services-p1',
        participantNodeId: 'node-pressure',
        participantAddress: 'ws://node-pressure:7001',
        errorCode: 'CONTROL_PLANE_PRESSURE_DEGRADED',
        error: 'Outbound queue for node node-pressure is saturated',
        durationMs: 412,
        retryAfterMs: 250,
        backpressured: true,
        failedTable: TABLES.SERVICES,
      },
    };
    const discovery = new AdminServiceDiscovery({
      nodeId: 'node-a',
      systemTableCache: {
        getAll() {
          return [];
        },
      },
      cacheMutationTarget: {
        applySystemTableChange() {},
      },
      controlPlaneSystemTableGateway: {
        async executeRead(readIntent) {
          const tableName = String(readIntent?.tableName || '');
          if (tableName === TABLES.SERVICES) {
            return participantFailure;
          }
          return {
            success: true,
            tableName,
            rows: [],
          };
        },
        async reconcileAuthoritativeCacheRows() {
          return {success: true, mutationCount: 1};
        },
      },
    });
    discovery.logger = {
      warn(message, fields) {
        warnings.push({message, fields});
      },
      info() {},
    };

    await discovery.ensureAuthoritativeDiscoveryCacheRepair({
      reason: 'unit-test-participant-cause-chain',
    });

    t.equal(warnings.length, 1, 'failed repair should emit one bounded warning');
    t.same(
      warnings[0]?.fields?.causeChain,
      ['query_participant_failure', 'control_plane_backpressure'],
      'warning should classify participant failure and backpressure',
    );
    t.equal(
      warnings[0]?.fields?.firstFailedParticipant?.participantNodeId,
      'node-pressure',
      'warning should preserve the first failed participant',
    );
  },
);

test(
  'AdminServiceDiscovery classifies control-plane backpressure repair cause chains',
  async (t) => {
    const warnings = [];
    const discovery = new AdminServiceDiscovery({
      nodeId: 'node-a',
      systemTableCache: {
        getAll() {
          return [];
        },
      },
      cacheMutationTarget: {
        applySystemTableChange() {},
      },
      controlPlaneSystemTableGateway: {
        async executeRead(readIntent) {
          const tableName = String(readIntent?.tableName || '');
          if (tableName === TABLES.SERVICES) {
            return {
              success: false,
              errorCode: 'CONTROL_PLANE_PRESSURE_DEGRADED',
              error: 'control_plane_pressure_degraded',
              retryAfterMs: 500,
            };
          }
          return {
            success: true,
            tableName,
            rows: [],
          };
        },
        async reconcileAuthoritativeCacheRows() {
          return {success: true, mutationCount: 1};
        },
      },
    });
    discovery.logger = {
      warn(message, fields) {
        warnings.push({message, fields});
      },
      info() {},
    };

    await discovery.ensureAuthoritativeDiscoveryCacheRepair({
      reason: 'unit-test-backpressure-cause-chain',
    });

    t.equal(warnings.length, 1, 'failed repair should emit one bounded warning');
    t.same(
      warnings[0]?.fields?.causeChain,
      ['control_plane_backpressure'],
      'warning should classify control-plane backpressure directly',
    );
  },
);

test(
  'AdminServiceDiscovery preserves local query transport gating diagnostics ' +
    'from authoritative read failures',
  async (t) => {
    const warnings = [];
    const discovery = new AdminServiceDiscovery({
      nodeId: 'node-a',
      systemTableCache: {
        getAll() {
          return [];
        },
      },
      cacheMutationTarget: {
        applySystemTableChange() {},
      },
      controlPlaneSystemTableGateway: {
        async executeRead(readIntent) {
          const tableName = String(readIntent?.tableName || '');
          if (tableName === TABLES.SERVICES) {
            return {
              success: false,
              errorCode: 'ROUTER_QUERY_TRANSPORT_NOT_READY',
              error: 'query ingress owner not ready',
              retryAfterMs: 321,
              source: 'query_transport_preflight',
              localQueryTransport: {
                state: 'deferred',
                ready: false,
                reason: 'query ingress owner not ready',
                retryAfterMs: 321,
              },
            };
          }
          return {
            success: true,
            tableName,
            rows: [],
          };
        },
        async reconcileAuthoritativeCacheRows() {
          return {success: true, mutationCount: 1};
        },
      },
    });
    discovery.logger = {
      warn(message, fields) {
        warnings.push({message, fields});
      },
      info() {},
    };

    const repair = await discovery.ensureAuthoritativeDiscoveryCacheRepair({
      reason: 'unit-test-query-transport-gating',
    });

    t.equal(repair.applied, false, 'repair should fail closed on transport gating');
    t.equal(
      repair.readSource,
      'query_transport_preflight',
      'repair result should preserve the bounded authoritative read source',
    );
    t.same(
      repair.localQueryTransport,
      {
        state: 'deferred',
        ready: false,
        reason: 'query ingress owner not ready',
        retryAfterMs: 321,
      },
      'repair result should preserve local query transport gating context',
    );
    t.equal(warnings.length, 1, 'failed repair should emit one bounded warning');
    t.equal(
      warnings[0]?.fields?.readSource,
      'query_transport_preflight',
      'warning should preserve the bounded authoritative read source',
    );
    t.same(
      warnings[0]?.fields?.localQueryTransport,
      {
        state: 'deferred',
        ready: false,
        reason: 'query ingress owner not ready',
        retryAfterMs: 321,
      },
      'warning should preserve local query transport gating context',
    );
  },
);

test('AdminServiceDiscovery marks repair as applied only after all tables are reconciled',
  async (t) => {
    const reconcileCalls = [];
    const discovery = new AdminServiceDiscovery({
      nodeId: 'node-a',
      systemTableCache: {
        getAll() {
          return [];
        },
      },
      cacheMutationTarget: {
        applySystemTableChange() {},
      },
      controlPlaneSystemTableGateway: {
        async executeRead(readIntent) {
          return {
            success: true,
            tableName: String(readIntent?.tableName || ''),
            rows: [],
          };
        },
        async reconcileAuthoritativeCacheRows(tableName, rows, options) {
          reconcileCalls.push({tableName, rows, options});
          return {success: true, mutationCount: 1};
        },
      },
    });

    const repair = await discovery.ensureAuthoritativeDiscoveryCacheRepair({
      reason: 'unit-test-full-success',
    });

    t.equal(repair.applied, true,
      'repair should report applied only when all requested tables succeed');
    t.equal(
      repair.tableCount,
      repair.tableNames.length,
      'applied repair should report all reconciled tables',
    );
    t.equal(
      reconcileCalls.length,
      repair.tableNames.length,
      'applied repair should reconcile every requested table',
    );
  });
