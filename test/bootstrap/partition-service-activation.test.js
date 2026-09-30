import {test} from '../../src/test-helpers/tap.js';
import {
  activatePartitionServiceRows,
  PARTITION_SERVICE_ACTIVATION_ERROR,
  settlePartitionServiceActiveAdmission,
} from '../../src/bootstrap/shared/partition-service-activation.js';
import {createIdentityTransport} from
  '../test-helpers/replica-handler-identity-fixture.js';

// A router holding each listed replica's exact handler (identity, not
// presence: activation fails closed on a router without the identity API).
function routerWithExactHandlers(services, registeredReplicaIds) {
  const router = createIdentityTransport();
  for (const replicaId of registeredReplicaIds) {
    router.register(`node-a/partition/${replicaId}`,
      services.get(replicaId).transportHandler);
  }
  return router;
}

function partitionReplicas(replicaIds) {
  return new Map(replicaIds.map((replicaId) => [replicaId, {
    partitionId: 'p1', initialized: true,
    transportHandler: () => replicaId}]));
}

function createActiveAdmissionService(snapshotFactory) {
  const calls = {leader: 0, role: 0, repairs: []};
  const service = {
    isLeader: true,
    role: 'leader',
    pendingRoleUpdate: 'leader',
    persistedRole: 'follower',
    pendingLeaderNodeUpdate: 'node-a',
    persistedLeaderNodeId: null,
    reassertDurableRaftRole() {
      calls.role += 1;
      return true;
    },
    reassertDurableLeaderNodeId() {
      calls.leader += 1;
      return true;
    },
    sqlQueryEngine: {
      queryExecutor: {
        getPartitionRoutingSnapshot: () => snapshotFactory(service),
        async maybeAwaitDeniedPartitionRoutingRepair(snapshot, options) {
          calls.repairs.push({snapshot, options});
          return true;
        },
      },
    },
  };
  return {calls, service};
}

test('exact ACTIVE admission reasserts current owner evidence when the ' +
  'canonical leader is absent before or during admission', async (t) => {
  for (const electionTiming of ['before', 'during']) {
    const fixture = createActiveAdmissionService((service) => {
      if (electionTiming === 'during') {
        service.isLeader = true;
        service.role = 'leader';
      }
      return {
        canonicalLeaderNodeId: null,
        canonicalLeaderRoutingGapState: 'leader_unknown',
        deniedByNodeId: {},
        activeAddressedServiceCount: 1,
        routableServiceCount: 0,
      };
    });
    if (electionTiming === 'during') {
      fixture.service.isLeader = false;
      fixture.service.role = 'follower';
    }

    const diagnostic = await settlePartitionServiceActiveAdmission({
      partitionId: 'p1',
      replicaId: 'p1-r1',
      service: fixture.service,
    });

    t.equal(fixture.calls.role, 1,
      `${electionTiming} election reasserts current durable role`);
    t.equal(fixture.calls.leader, 1,
      `${electionTiming} election reasserts canonical leader ownership`);
    t.equal(diagnostic.runtimeIsLeader, true);
    t.equal(diagnostic.canonicalLeaderNodeId, null);
    t.equal(diagnostic.activeAddressedServiceCount, 1);
    t.equal(diagnostic.routableServiceCount, 0,
      'ACTIVE plus address is explicitly not equivalent to routable');
  }
});

test('exact ACTIVE admission refreshes the readiness owner when the ' +
  'canonical leader is denied', async (t) => {
  const snapshot = {
    canonicalLeaderNodeId: 'node-a',
    canonicalLeaderRoutingGapState: 'leader_service_present',
    deniedByNodeId: {'node-a': {reasonCodes: ['routing_not_ready']}},
    activeAddressedServiceCount: 1,
    routableServiceCount: 0,
  };
  const fixture = createActiveAdmissionService(() => snapshot);
  const diagnostic = await settlePartitionServiceActiveAdmission({
    partitionId: 'p1',
    replicaId: 'p1-r1',
    service: fixture.service,
  });

  t.equal(fixture.calls.repairs.length, 1,
    'ACTIVE admission level-triggers authoritative readiness repair');
  t.equal(fixture.calls.repairs[0].snapshot, snapshot,
    'repair receives the exact discriminator snapshot');
  t.equal(fixture.calls.role, 0,
    'known canonical leadership does not manufacture a role write');
  t.equal(fixture.calls.leader, 0,
    'known canonical leadership does not manufacture a leader write');
  t.equal(diagnostic.readinessRefreshAttempted, true);
});

test('join discovery is evaluated only after exact ACTIVE installation',
  async (t) => {
    let installed = false;
    const snapshots = [];
    const service = {
      partitionId: 'p1',
      initialized: true,
      sqlQueryEngine: {
        queryExecutor: {
          getPartitionRoutingSnapshot() {
            snapshots.push(installed);
            return {
              canonicalLeaderNodeId: 'node-a',
              deniedByNodeId: {},
              activeAddressedServiceCount: installed ? 1 : 0,
              routableServiceCount: installed ? 1 : 0,
            };
          },
        },
      },
    };
    const activatedCount = await activatePartitionServiceRows({
      nodeId: 'node-a',
      systemTableWriter: {
        async updateSystemTableRow() {
          return {success: true, partitionResult: {affectedRows: 1}};
        },
      },
      replicaStateMachine: {
        async activateRegisteredReplica() {
          installed = true;
          return {status: 'active'};
        },
      },
      isReplicaHandlerRegistered: () => true,
      partitionServices: new Map([['p1-r1', service]]),
    });

    t.equal(activatedCount, 1);
    t.same(snapshots, [true],
      'discovery/readiness observes only the installed exact generation');
  });

test('activatePartitionServiceRows requires initialized runtime',
  async (t) => {
    await t.rejects(
      activatePartitionServiceRows({
        nodeId: 'node-a',
        systemTableWriter: {
          updateSystemTableRow: async () => ({success: true}),
          upsertSystemTableRow: async () => ({success: true}),
        },
        replicaStateMachine: {activateRegisteredReplica: async () => ({})},
        messageRouter: {
          isRegistered: () => true,
        },
        partitionServices: new Map([
          ['p1-r1', {
            partitionId: 'p1',
            initialized: false,
          }],
        ]),
      }),
      new Error(
        PARTITION_SERVICE_ACTIVATION_ERROR.runtimeRequired('p1-r1'),
      ),
      'activation should fail closed until local partition runtime is ready',
    );
  });

test('activatePartitionServiceRows requires per-replica handler registration',
  async (t) => {
    const activated = [];
    const twoReplicas = partitionReplicas(['p1-r1', 'p1-r2']);
    await t.rejects(
      activatePartitionServiceRows({
        nodeId: 'node-a',
        systemTableWriter: {
          updateSystemTableRow: async () => ({success: true}),
          upsertSystemTableRow: async () => ({success: true}),
        },
        replicaStateMachine: {
          async activateRegisteredReplica(options) {
            activated.push(options.replicaId);
            return {};
          },
        },
        messageRouter: routerWithExactHandlers(twoReplicas, ['p1-r1']),
        partitionServices: twoReplicas,
      }),
      new Error(
        PARTITION_SERVICE_ACTIVATION_ERROR
          .replicaHandlerRequired('p1-r2'),
      ),
      'activation should fail closed until every partition handler is routable',
    );
    t.same(activated, [],
      'all handler prerequisites are preflighted before the first mutation');
  });

test('activatePartitionServiceRows retains pressure admission failures as debt',
  async (t) => {
    const deferred = [];
    const oneReplica = partitionReplicas(['p1-r1']);

    await t.rejects(
      activatePartitionServiceRows({
        nodeId: 'node-a',
        systemTableWriter: {
          updateSystemTableRow: async () => {
            const error = new Error('control_plane_pressure_degraded');
            error.code = 'CONTROL_PLANE_PRESSURE_DEGRADED';
            error.deferRetry = true;
            error.retryAfterMs = 250;
            throw error;
          },
          upsertSystemTableRow: async () => {
            const error = new Error('control_plane_pressure_degraded');
            error.code = 'CONTROL_PLANE_PRESSURE_DEGRADED';
            error.deferRetry = true;
            error.retryAfterMs = 250;
            throw error;
          },
        },
        replicaStateMachine: {
          async activateRegisteredReplica() {
            const error = new Error('control_plane_pressure_degraded');
            error.code = 'CONTROL_PLANE_PRESSURE_DEGRADED';
            error.deferRetry = true;
            error.retryAfterMs = 250;
            throw error;
          },
        },
        messageRouter: routerWithExactHandlers(oneReplica, ['p1-r1']),
        partitionServices: oneReplica,
        onDeferredActivation: (details) => deferred.push(details),
      }),
      {code: 'CONTROL_PLANE_PRESSURE_DEGRADED'},
      'seed/join activation must return retryable debt to its workflow owner',
    );

    t.equal(
      deferred.length,
      1,
      'pressure admission deferral should be surfaced via deferred callback',
    );
    t.equal(
      deferred[0]?.replicaId,
      'p1-r1',
      'callback should identify the deferred partition replica',
    );
  });
