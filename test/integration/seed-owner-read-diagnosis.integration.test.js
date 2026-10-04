/**
 * Integration tests that discriminate seed-side owner-read failure causes.
 */

import {test} from '../../src/test-helpers/tap.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {BootstrapReadinessState} from '../../src/bootstrap/bootstrap-readiness-state.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  CONTROL_PLANE_PARTICIPATION_KIND,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_REASON,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {NodeService} from '../../src/node/node-service.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {
  createVirginSeedBootstrapService,
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
  const bootstrapService = await createVirginSeedBootstrapService({
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

      // The sync participation view is served from the readiness planning
      // snapshot, which refreshes in the background; poll until the snapshot
      // reflects the injected transport defer.
      let participation = null;
      const observedTransportDefer = await waitFor(() => {
        participation =
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
        return participation.decision === 'defer';
      }, 5000, 50);
      t.equal(observedTransportDefer, true,
        'canonical participation should report the transport defer');
      t.equal(
        participation.reasonCode,
        CONTROL_PLANE_READINESS_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY,
        'transport defer should carry the canonical transport reason code',
      );
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

        // The sync participation view refreshes from the background
        // planning snapshot; poll until it converges on eligibility.
        const participationRecovered = await waitFor(() => {
          const participation =
            fixture.coordinator.controlPlaneReadinessService
              .getControlPlaneParticipationSync(
                fixture.seedNodeId,
                {
                  participationKind:
                    CONTROL_PLANE_PARTICIPATION_KIND
                      .REPLICA_OPERATION_OWNER_READ,
                  decisionDimension:
                    CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
                },
              );
          return participation.eligible === true;
        }, 5000, 50);
        t.equal(participationRecovered, true,
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
});
