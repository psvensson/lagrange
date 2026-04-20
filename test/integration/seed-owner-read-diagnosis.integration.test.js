/**
 * Integration tests that discriminate seed-side owner-read failure causes.
 */

import {test} from '../../src/test-helpers/tap.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {BOOTSTRAP_API_HANDOFF_STATUS} from '../../src/bootstrap/bootstrap-api-constants.js';
import {BootstrapReadinessState} from '../../src/bootstrap/bootstrap-readiness-state.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  CONTROL_PLANE_PARTICIPATION_KIND,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_REASON,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {NodeService} from '../../src/node/node-service.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {NodeStatus} from '../../src/rebalancer/unified-rebalancer.js';
import {SERVICE_STATUS, STATE} from '../../src/constants/index.js';
import {
  initializeTestEnvironment,
  cleanupTestEnvironment,
  getUniquePort,
  waitFor,
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
      reasonCode: 'query_transport_not_ready',
      errorCode: 'ROUTER_QUERY_TRANSPORT_NOT_READY',
      retryAfterMs: 250,
    };
}

function installLocalQueryTransportOverride(messageRouter) {
  let localQueryTransportReady = true;
  const original =
    typeof messageRouter?.getQueryDataPlaneTransportReadiness === 'function' ?
      messageRouter.getQueryDataPlaneTransportReadiness.bind(messageRouter) :
      null;
  messageRouter.getQueryDataPlaneTransportReadiness = () =>
    createLocalQueryTransportReadiness(localQueryTransportReady);
  return {
    setReady(nextReady) {
      localQueryTransportReady = nextReady === true;
    },
    restore() {
      if (original) {
        messageRouter.getQueryDataPlaneTransportReadiness = original;
      }
    },
  };
}

async function createSeedFixture() {
  const seedNodeId = '550e8400-e29b-41d4-a716-446655440281';
  const seedWsPort = getUniquePort();
  const readinessState = new BootstrapReadinessState({
    readyStableWindowMs: 0,
    demotionFailureThreshold: 1,
    retryAfterMs: 100,
  });
  if (typeof readinessState.setMaxListeners === 'function') {
    readinessState.setMaxListeners(0);
  }
  const bootstrapService = new BootstrapService({
    nodeId: seedNodeId,
    nodeAddress: `ws://localhost:${seedWsPort}`,
    wsPort: seedWsPort,
    readinessState,
  });

  const bootstrapResult = await bootstrapService.bootstrap();
  if (!bootstrapResult.success) {
    throw new Error('seed bootstrap should succeed');
  }

  const systemTableCache = NodeService.getInstance().getSystemTableCache();
  const sqlQueryEngine = new SQLQueryEngine({
    systemCache: systemTableCache,
    messageRouter: bootstrapResult.messageRouter,
    nodeId: seedNodeId,
  });

  const seedApi = new BootstrapAPI({
    seedNodeId,
    seedNodeAddress: `ws://localhost:${seedWsPort}`,
    seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
    messageGroupServices: bootstrapResult.messageGroupServices,
    partitionServices: bootstrapResult.partitionServices,
    systemTableCache,
    messageRouter: bootstrapResult.messageRouter,
    epochManager: bootstrapResult.epochManager,
    bootstrapService,
    readinessState,
  });
  await seedApi.initialize(0, {listen: false});
  seedApi.setSqlQueryEngine(sqlQueryEngine);

  return {
    seedNodeId,
    bootstrapService,
    bootstrapResult,
    systemTableCache,
    sqlQueryEngine,
    seedApi,
    coordinator: bootstrapService.rebalanceCoordinator,
    cdcIntegrationService: bootstrapService.cdcIntegrationService,
  };
}

async function cleanupSeedFixture(fixture) {
  if (fixture?.seedApi) {
    await fixture.seedApi.shutdown().catch(() => {});
  }
  if (fixture?.bootstrapService) {
    await fixture.bootstrapService.shutdown().catch(() => {});
  }
}

async function readReadyz(seedApi) {
  const response = await seedApi.getFastify().inject({
    method: 'GET',
    url: '/readyz',
  });
  return {
    statusCode: response.statusCode,
    body: response.body ? JSON.parse(response.body) : null,
  };
}

async function waitForLocalReplicaOperationsLeader(bootstrapService) {
  let leader = null;
  const ready = await waitFor(() => {
    leader = bootstrapService.getLeaderPartition(
      SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
    );
    return Boolean(leader);
  }, 3000, 25);
  return ready ? leader : null;
}

test('Seed owner-read diagnosis integration', async (t) => {
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

  await t.test('local leader query and owner-read both stay available ' +
    'through the local-safe path while query transport is deferred',
    async (t) => {
      let fixture = null;
      let transportOverride = null;

      try {
        fixture = await createSeedFixture();
        transportOverride = installLocalQueryTransportOverride(
          fixture.bootstrapResult.messageRouter,
        );
        transportOverride.setReady(false);

        const leaderPartition =
          await waitForLocalReplicaOperationsLeader(fixture.bootstrapService);
        t.ok(leaderPartition,
          'seed should expose a local leader for replica_operations');
        if (!leaderPartition) {
          return;
        }

        const participation =
          fixture.coordinator.controlPlaneReadinessService
            .getControlPlaneParticipationSync(
              fixture.seedNodeId,
              {
                participationKind:
                  CONTROL_PLANE_PARTICIPATION_KIND.REPLICA_OPERATION_OWNER_READ,
                decisionDimension:
                  CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
              },
            );
        t.equal(participation.decision, 'defer',
          'canonical participation should still report the transport defer');
        t.equal(participation.localExecutionAllowed, true,
          'canonical participation should expose the local-safe execution bypass');

        const ownerRead = await fixture.coordinator.executeReplicaOperationsRead(
          REPLICA_OPERATIONS_PROBE_SQL,
        );
        t.equal(ownerRead.success, true,
          'owner-read should succeed through the local-safe path while transport is deferred');
        t.ok(Array.isArray(ownerRead.rows),
          'owner-read should still return a row array');

        const localRead = await leaderPartition.executeQuery(
          REPLICA_OPERATIONS_PROBE_SQL,
        );
        t.equal(localRead.success, true,
          'direct local leader query should still succeed');
        t.ok(Array.isArray(localRead.rows),
          'direct local leader query should return rows');
      } finally {
        transportOverride?.restore();
        await cleanupSeedFixture(fixture);
      }
    });

  await t.test('seed readiness and owner-read recover immediately after transport-ready flip',
    async (t) => {
      let fixture = null;
      let transportOverride = null;

      try {
        fixture = await createSeedFixture();
        transportOverride = installLocalQueryTransportOverride(
          fixture.bootstrapResult.messageRouter,
        );
        transportOverride.setReady(false);

        const blockedProbe = await readReadyz(fixture.seedApi);
        t.equal(blockedProbe.statusCode, 503,
          'readyz should report unavailable while local query transport is deferred');
        t.ok(
          blockedProbe.body?.reasons?.includes(
            CONTROL_PLANE_READINESS_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY,
          ),
          'readyz should surface the transport blocker',
        );

        const blockedRead = await fixture.coordinator.executeReplicaOperationsRead(
          REPLICA_OPERATIONS_PROBE_SQL,
        );
        t.equal(blockedRead.success, true,
          'owner-read should still succeed through the local-safe path before the transport-ready flip');

        transportOverride.setReady(true);

        const probeRecovered = await waitFor(async () => {
          const result = await readReadyz(fixture.seedApi);
          return result.statusCode === 200 && result.body?.ready === true;
        }, 3000, 25);
        t.equal(probeRecovered, true,
          'readyz should recover promptly after the transport-ready flip');

        const participation =
          fixture.coordinator.controlPlaneReadinessService
            .getControlPlaneParticipationSync(
              fixture.seedNodeId,
              {
                participationKind:
                  CONTROL_PLANE_PARTICIPATION_KIND.REPLICA_OPERATION_OWNER_READ,
                decisionDimension:
                  CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
              },
            );
        t.equal(participation.eligible, true,
          'canonical participation should recover after the transport-ready flip');

        const recoveredRead = await fixture.coordinator.executeReplicaOperationsRead(
          REPLICA_OPERATIONS_PROBE_SQL,
        );
        t.equal(recoveredRead.success, true,
          'owner-read should recover after the transport-ready flip');
      } finally {
        transportOverride?.restore();
        await cleanupSeedFixture(fixture);
      }
    });

  await t.test('move-assignment reconciliation still advances while owner-read transport is deferred',
    async (t) => {
      let fixture = null;
      let transportOverride = null;
      let removedSourceService = null;

      try {
        fixture = await createSeedFixture();
        transportOverride = installLocalQueryTransportOverride(
          fixture.bootstrapResult.messageRouter,
        );
        transportOverride.setReady(false);

        const assignment =
          await fixture.seedApi.determineAndReserveMessageGroupAssignment(
            'joiner-probe-node',
          );
        t.equal(assignment?.strategy, 'MOVE_REPLICA',
          'fixture should reserve a MOVE_REPLICA assignment');
        t.ok(assignment?.assignmentId,
          'fixture should persist an assignment id');
        if (!assignment?.assignmentId || !assignment?.replicaToMove) {
          return;
        }

        const reservationLookup =
          await fixture.seedApi.getMoveReplicaAssignmentReservationById(
            assignment.assignmentId,
          );
        const reservation = reservationLookup?.reservation || null;
        t.ok(reservation, 'should rehydrate the assignment reservation');
        if (!reservation) {
          return;
        }

        const now = Date.now() + 10000;
        fixture.systemTableCache.applySystemTableChange(
          SYSTEM_TABLE_NAME.NODES,
          'UPSERT',
          {
            node_id: reservation.targetNodeId,
            node_address: 'ws://joiner-probe-node:9001',
            cpu_cores: 4,
            memory_mb: 1024,
            disk_gb: 10,
            cpu_usage_percent: 10,
            memory_usage_percent: 10,
            disk_usage_percent: 10,
            status: NodeStatus.ACTIVE,
            connection_state: STATE.READY,
            capabilities: '[]',
            last_heartbeat: now,
            ready_lease_expires_at: now + 10000,
            created_at: now,
            updated_at: now,
          },
        );
        fixture.systemTableCache.applySystemTableChange(
          SYSTEM_TABLE_NAME.SERVICES,
          'UPSERT',
          {
            service_id: reservation.replicaId,
            node_id: reservation.targetNodeId,
            partition_id: reservation.groupId,
            group_id: reservation.groupId,
            service_type: 'message_group',
            status: SERVICE_STATUS.ACTIVE,
            address:
              `${reservation.targetNodeId}/message-group/${reservation.replicaId}`,
            raft_role: 'leader',
            created_at: now,
            updated_at: now,
          },
        );

        removedSourceService =
          fixture.bootstrapResult.messageGroupServices.get(reservation.replicaId) || null;
        fixture.bootstrapResult.messageGroupServices.delete(reservation.replicaId);

        const deferredRead = await fixture.coordinator.executeReplicaOperationsRead(
          REPLICA_OPERATIONS_PROBE_SQL,
        );
        t.equal(deferredRead.success, true,
          'owner-read should still use the local-safe path during reconciliation pressure');

        await fixture.seedApi.expireMoveReplicaAssignmentReservations();

        const reconciledLookup =
          await fixture.seedApi.getMoveReplicaAssignmentReservationById(
            assignment.assignmentId,
          );
        const reconciled = reconciledLookup?.reservation || null;
        t.equal(
          reconciled?.status,
          BOOTSTRAP_API_HANDOFF_STATUS.COMMITTED,
          'move-assignment reconciliation should still reach the committed handoff status',
        );
        t.ok(
          Array.isArray(reconciled?.stepsHistory) &&
            reconciled.stepsHistory.some((step) =>
              step?.phase === 'observed_committed' &&
              step?.status === BOOTSTRAP_API_HANDOFF_STATUS.COMMITTED,
            ),
          'reservation history should record the observed committed transition',
        );
        t.equal(
          fixture.seedApi.shouldReconcileMoveReplicaAssignmentReservationToCommitted(
            reconciled || reservation,
          ),
          false,
          'reservation should no longer require reconciliation after observed commit',
        );
      } finally {
        if (removedSourceService) {
          fixture?.bootstrapResult?.messageGroupServices?.set(
            removedSourceService.replicaId,
            removedSourceService,
          );
        }
        transportOverride?.restore();
        await cleanupSeedFixture(fixture);
      }
    });
});
