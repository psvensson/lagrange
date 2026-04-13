/**
 * Integration test: replica_operations owner-read transport readiness.
 *
 * Proves the real seed bootstrap wiring can express the remaining
 * seed-local owner-read failure without the distributed harness.
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {
  CONTROL_PLANE_PARTICIPATION_DECISION,
  CONTROL_PLANE_PARTICIPATION_KIND,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_REASON,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  initializeTestEnvironment,
  cleanupTestEnvironment,
  getUniquePort,
} from './helpers/cluster-test-helpers.js';

const REPLICA_OPERATIONS_PROBE_SQL =
  'SELECT * FROM replica_operations WHERE 1 = 0';

function createLocalQueryTransportReadiness(ready) {
  return ready ?
    {
      ready: true,
      state: 'ready',
      reason: null,
      retryAfterMs: null,
    } :
    {
      ready: false,
      state: 'deferred',
      reason: 'Query/data-plane message-group transport is not configured',
      retryAfterMs: 250,
    };
}

test('replica_operations owner-read defers until local query transport is ready',
  async (t) => {
    t.beforeEach(() => {
      initializeTestEnvironment({
        rebalancer: {
          periodicCheckIntervalMs: 600000,
          periodicCheckJitterMs: 100,
          stabilizationPeriodMs: 10000,
        },
      });
    });

    t.afterEach(async () => {
      await cleanupTestEnvironment();
    });

    const seedNodeId = '550e8400-e29b-41d4-a716-446655440271';
    const seedWsPort = getUniquePort();
    const bootstrapService = new BootstrapService({
      nodeId: seedNodeId,
      nodeAddress: `ws://localhost:${seedWsPort}`,
      wsPort: seedWsPort,
    });

    let bootstrapResult = null;
    let restoreReadiness = () => {};

    try {
      bootstrapResult = await bootstrapService.bootstrap();
      t.equal(bootstrapResult.success, true, 'seed bootstrap should succeed');
      if (!bootstrapResult.success) {
        return;
      }

      const coordinator = bootstrapService.rebalanceCoordinator;
      t.ok(coordinator, 'seed bootstrap should expose a rebalance coordinator');
      if (!coordinator) {
        return;
      }

      const readinessService = coordinator.controlPlaneReadinessService;
      t.ok(readinessService,
        'seed rebalance coordinator should expose canonical readiness');
      if (!readinessService) {
        return;
      }

      const messageRouter = bootstrapResult.messageRouter;
      let localQueryTransportReady = false;
      const originalGetReadiness =
        typeof messageRouter?.getQueryDataPlaneTransportReadiness === 'function' ?
          messageRouter.getQueryDataPlaneTransportReadiness.bind(messageRouter) :
          null;
      messageRouter.getQueryDataPlaneTransportReadiness = () =>
        createLocalQueryTransportReadiness(localQueryTransportReady);
      restoreReadiness = () => {
        if (originalGetReadiness) {
          messageRouter.getQueryDataPlaneTransportReadiness =
            originalGetReadiness;
        }
      };

      const deferredParticipation =
        readinessService.getControlPlaneParticipationSync(seedNodeId, {
          participationKind:
            CONTROL_PLANE_PARTICIPATION_KIND.REPLICA_OPERATION_OWNER_READ,
          decisionDimension:
            CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
        });
      t.equal(
        deferredParticipation.decision,
        CONTROL_PLANE_PARTICIPATION_DECISION.DEFER,
        'owner-read participation should defer while local query transport is unavailable',
      );
      t.equal(
        deferredParticipation.reasonCode,
        CONTROL_PLANE_READINESS_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY,
        'owner-read participation should preserve the canonical transport blocker',
      );
      t.equal(
        deferredParticipation.retryAfterMs,
        250,
        'owner-read participation should preserve the retry-after hint',
      );
      t.equal(
        deferredParticipation.localExecutionAllowed,
        true,
        'owner-read participation should explicitly allow the local-safe execution path',
      );

      const deferredRead = await coordinator.executeReplicaOperationsRead(
        REPLICA_OPERATIONS_PROBE_SQL,
      );
      t.equal(deferredRead.success, true,
        'owner-read SQL should use the local-safe path while query transport is deferred');
      t.ok(Array.isArray(deferredRead.rows),
        'local-safe owner-read should still return a row array');

      localQueryTransportReady = true;
      const readyParticipation =
        readinessService.getControlPlaneParticipationSync(seedNodeId, {
          participationKind:
            CONTROL_PLANE_PARTICIPATION_KIND.REPLICA_OPERATION_OWNER_READ,
          decisionDimension:
            CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
        });
      t.equal(
        readyParticipation.decision,
        CONTROL_PLANE_PARTICIPATION_DECISION.READY,
        'owner-read participation should recover once local query transport is ready',
      );

      const recoveredRead = await coordinator.executeReplicaOperationsRead(
        REPLICA_OPERATIONS_PROBE_SQL,
      );
      t.equal(recoveredRead.success, true,
        'owner-read SQL should recover once local query transport is ready');
      t.ok(Array.isArray(recoveredRead.rows),
        'recovered owner-read should return a row array');
    } finally {
      restoreReadiness();
      await bootstrapService.shutdown().catch(() => {});
    }
  });
