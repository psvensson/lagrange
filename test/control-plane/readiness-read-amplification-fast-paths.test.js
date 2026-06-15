/**
 * CL-012 phase-1 guards: the readiness-read amplification fast paths.
 *
 * Production witness (inclusive-time profiling, stat-gate-20260611T080523Z):
 * the seed's 20-95s event-loop gaps were microtask starvation driven by the
 * query executor's partition-routing path rebuilding full node readiness per
 * service row per routing decision (getNodeReadinessSync 72% inclusive), and
 * by diagnostics-only routing snapshots built on EVERY authoritative read
 * and EVERY gateway operation.
 *
 * Guards:
 * 1. getNodeReadinessSync stored-snapshot hits skip the heavy evidence
 *    prelude (planning-snapshot resolution, service-row scan, lifecycle,
 *    node evidence) — red pre-fix.
 * 2. Authoritative-read base diagnostics never build a routing snapshot —
 *    red pre-fix.
 * 3. Gateway operation-ledger diagnostics build the live routing snapshot
 *    only on failure signals — red pre-fix.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  installControlPlaneReadinessNodeMethods,
} from '../../src/control-plane/control-plane-readiness-service-node-methods.js';
import {
  buildSystemTableOperationDiagnostics,
} from '../../src/cdc/cdc-integration-service-authoritative-read-flow.js';
import {
  buildGatewayFallbackSystemTableRoutingDiagnostics,
} from '../../src/control-plane/control-plane-system-table-gateway-diagnostics.js';

const NODE_ID = 'node-1';

function createReadinessStub({storedSnapshot = null} = {}) {
  const calls = {
    planningSnapshot: 0,
    serviceRows: 0,
    lifecycle: 0,
    nodeEvidence: 0,
    backgroundRefresh: 0,
    fullBuild: 0,
  };
  const stub = {
    now: () => 1_760_000_000_000,
    getNodeRow: () => ({node_id: NODE_ID, status: 'active'}),
    getPublicationDiagnostics: () => ({status: 'PUBLISHED'}),
    getMembershipPublicationDiagnosticsSync: () => ({published: true}),
    shouldPersistReadinessSnapshot: () => false,
    getFresherStoredReadinessSnapshot: () => storedSnapshot,
    maybeStartBackgroundSyncReadinessRefresh: () => {
      calls.backgroundRefresh += 1;
    },
    resolveNodeMembershipPublicationPlanningAnswerSync: () => {
      calls.planningSnapshot += 1;
      return {answer: 'ok'};
    },
    getNodeServiceRows: () => {
      calls.serviceRows += 1;
      return [];
    },
    getLifecycleState: () => {
      calls.lifecycle += 1;
      return 'ACTIVE';
    },
    buildNodeEvidence: () => {
      calls.nodeEvidence += 1;
      return {};
    },
    buildMissingSelfNodeEvidence: () => ({}),
    resolveMissingNodeReadinessState: () => null,
    getCapacitySnapshotSync: () => ({}),
    buildEvaluatedNodeReadinessSnapshot: () => {
      calls.fullBuild += 1;
      return Object.freeze({dimensions: {}, reasons: []});
    },
    // WS4: the node-build path now records its duration via the store mixin (always
    // present on the real prototype); this node-only stub provides a no-op.
    recordReadinessBuildDurationMs: () => {},
  };
  installControlPlaneReadinessNodeMethods(stub);
  return {stub, calls};
}

test('CL-012 phase 1: readiness-read fast paths', async (t) => {
  await t.test(
    'stored-snapshot hit skips the heavy evidence prelude',
    async (t) => {
      const storedSnapshot = Object.freeze({
        dimensions: {serveEligible: true},
        reasons: [],
      });
      const {stub, calls} = createReadinessStub({storedSnapshot});

      const result = stub.getNodeReadinessSync(NODE_ID, {});

      t.equal(result, storedSnapshot, 'returns the stored snapshot');
      t.equal(calls.planningSnapshot, 0, 'planning resolution skipped');
      t.equal(calls.serviceRows, 0, 'service-row scan skipped');
      t.equal(calls.lifecycle, 0, 'lifecycle resolution skipped');
      t.equal(calls.nodeEvidence, 0, 'node evidence build skipped');
      t.equal(calls.fullBuild, 0, 'full snapshot build skipped');
      t.equal(
        calls.backgroundRefresh,
        1,
        'background refresh hook still invoked',
      );
    },
  );

  await t.test(
    'stored-snapshot miss still runs the full evaluation',
    async (t) => {
      const {stub, calls} = createReadinessStub({storedSnapshot: null});

      stub.getNodeReadinessSync(NODE_ID, {});

      t.equal(calls.planningSnapshot, 1, 'planning resolution runs');
      t.equal(calls.serviceRows, 1, 'service rows scanned');
      t.equal(calls.lifecycle, 1, 'lifecycle resolved');
      t.equal(calls.nodeEvidence, 1, 'node evidence built');
      t.equal(calls.fullBuild, 1, 'full snapshot built');
    },
  );

  await t.test(
    'hit-path background refresh resolves serviceRows lazily',
    async (t) => {
      const storedSnapshot = Object.freeze({dimensions: {}, reasons: []});
      const {stub, calls} = createReadinessStub({storedSnapshot});
      let observedContext = null;
      stub.maybeStartBackgroundSyncReadinessRefresh = (context) => {
        observedContext = context;
      };

      stub.getNodeReadinessSync(NODE_ID, {});

      t.equal(calls.serviceRows, 0, 'no scan before property access');
      const rows = observedContext.serviceRows;
      t.ok(Array.isArray(rows), 'getter resolves service rows on demand');
      t.equal(calls.serviceRows, 1, 'scan happens exactly on access');
    },
  );

  await t.test(
    'authoritative-read diagnostics never build a routing snapshot',
    async (t) => {
      let routingSnapshotCalls = 0;
      const service = {
        nodeId: NODE_ID,
        sqlQueryEngine: {
          queryExecutor: {
            getPartitionRoutingSnapshot: () => {
              routingSnapshotCalls += 1;
              return {canonicalLeaderNodeId: NODE_ID};
            },
          },
        },
        systemTableCache: {
          filter: () => [],
        },
      };

      const diagnostics = buildSystemTableOperationDiagnostics(
        service,
        'nodes',
        {},
      );

      t.equal(routingSnapshotCalls, 0, 'no routing snapshot built');
      t.equal(
        diagnostics.deniedByReadiness,
        false,
        'diagnostics fall back cleanly',
      );
    },
  );

  await t.test(
    'gateway fallback diagnostics gate the routing snapshot',
    async (t) => {
      let routingSnapshotCalls = 0;
      const gateway = {
        resolveSqlQueryEngine: () => ({
          queryExecutor: {
            getPartitionRoutingSnapshot: () => {
              routingSnapshotCalls += 1;
              return {
                canonicalLeaderNodeId: NODE_ID,
                serviceRowCount: 3,
                routableServiceCount: 3,
              };
            },
          },
        }),
        resolveSystemTableCache: () => null,
        resolveCdcIntegrationService: () => null,
      };

      buildGatewayFallbackSystemTableRoutingDiagnostics(
        gateway,
        'nodes',
        null,
        {includeRoutingSnapshot: false},
      );
      t.equal(
        routingSnapshotCalls,
        0,
        'success path: no routing snapshot',
      );

      buildGatewayFallbackSystemTableRoutingDiagnostics(
        gateway,
        'nodes',
        null,
        {includeRoutingSnapshot: true},
      );
      t.equal(
        routingSnapshotCalls,
        1,
        'failure path: routing snapshot built',
      );
    },
  );
});
