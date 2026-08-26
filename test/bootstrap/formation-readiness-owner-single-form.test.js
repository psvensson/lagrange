import t from 'tap';
import {
  LEDGER_PARTITION_ID,
  buildFormationBarrierOwner,
  buildFormationCache,
  initializeEnvironment,
  resetEnvironment,
} from '../convergence/formation-barrier-test-fixture.js';
import {
  buildStartupAuthoritySnapshotFromPlanningAnswer,
} from '../../src/control-plane/startup-authority-snapshot-owner.js';
import {NodeJoiningReadySignalReadiness} from
  '../../src/bootstrap/node-joining-ready-signal-readiness.js';

function withReady(startupAuthority, ready) {
  return Object.freeze({
    ...startupAuthority,
    state: ready ? 'ready' : 'recovery_pending',
    ready,
    authorityAvailable: true,
  });
}

t.test('the real startup-authority owner emits the formation release verdict',
  async (t) => {
    const priorityPartitionSummary = {
      satisfied: true,
      missingPartitionIds: [],
      blockedPartitions: [],
      blockedPartitionCount: 0,
      largestSpreadGap: 0,
      totalSpreadGap: 0,
    };
    const startupAuthority = buildStartupAuthoritySnapshotFromPlanningAnswer({
      publicationEpoch: 2,
      publicationStatus: 'PUBLISHED',
      publicationObservationState: 'authoritative',
      recoveryProtocolState: 'steady_published',
      priorityPartitionSummary,
      recoveryActiveNodeIds: ['seed-node', 'joining-node', 'joining-node-2'],
      membershipLifecycleSummary: {
        formationPlacementNodeIds: [
          'seed-node',
          'joining-node',
          'joining-node-2',
        ],
      },
      requiredAckNodeIds: ['seed-node', 'joining-node', 'joining-node-2'],
      acknowledgedNodeIds: ['seed-node', 'joining-node', 'joining-node-2'],
      pendingAckNodeIds: [],
      pendingAckCount: 0,
      missingPublishedNodeIds: [],
      targetParticipation: {nodeId: 'seed-node', reasons: []},
    });

    t.equal(startupAuthority.authorityAvailable, true);
    t.equal(startupAuthority.ready, true,
      'published, acknowledged, durably spread priority placement is ready');
  });

t.test('formation loop passes its poll cadence as the seed projection request ' +
  'budget', async (t) => {
  const owner = Object.create(NodeJoiningReadySignalReadiness.prototype);
  let observedRequestTimeoutMs = null;
  owner.nodeId = 'joining-node';
  owner.seedNodeId = 'seed-node';
  owner.startupMode = 'fresh_join';
  owner.config = {
    priorityPlacementFormationDiscoveryMs: 0,
    priorityPlacementFormationPollMs: 500,
    priorityPlacementFormationTimeoutMs: 120_000,
    heartbeatIntervalMs: 1_000,
  };
  owner.now = () => 1_000;
  owner.sleep = async () => {};
  owner.logger = {info() {}, warn() {}, error() {}};
  owner.rebalanceCoordinator = {
    controlPlaneReadinessService: {
      getStartupAuthoritySnapshotSync: () => ({}),
    },
  };
  owner.getOperationLedgerFormationBarrierSnapshot = async (
    requestTimeoutMs,
  ) => {
    observedRequestTimeoutMs = requestTimeoutMs;
    return {
      now: 1_000,
      targetReplicaCount: 3,
      startupAuthorityReady: true,
      candidateNodeIds: ['seed-node', 'joining-node', 'joining-node-2'],
      preReadyCandidateNodeIds: ['joining-node', 'joining-node-2'],
    };
  };
  await owner.awaitOperationLedgerFormationBarrier();
  t.equal(observedRequestTimeoutMs, 500,
    'the 500ms poll cannot inherit the generic 10s join HTTP timeout');
});

t.test('seed base projection latches discovery without authorizing release',
  async (t) => {
    initializeEnvironment();
    const cache = buildFormationCache();
    let now = 1_000;
    let requestCount = 0;
    const states = [];
    const owner = buildFormationBarrierOwner({
      cache,
      now: () => now,
      isStartupAuthorityReady: () => true,
      sleep: async (delayMs) => {
        now += delayMs;
      },
    });
    const readinessService =
      owner.rebalanceCoordinator.controlPlaneReadinessService;
    owner.httpGetJson = async () => {
      requestCount += 1;
      const authority = readinessService.getStartupAuthoritySnapshotSync();
      return {
        statusCode: 503,
        body: {
          startupAuthority: requestCount === 1 ?
            {...authority, formationReleaseHandoff: null} :
            {
              ...authority,
              formationReleaseHandoff: {
                state: 'active',
                releaseAuthorized: true,
              },
            },
        },
      };
    };
    owner.logger.info = (_message, fields) => states.push(fields.state);

    try {
      await owner.awaitOperationLedgerFormationBarrier();
      t.equal(requestCount, 2,
        'the base projection discovers the cohort but cannot release it');
      t.same(states, [
        'waiting_for_startup_authority',
        'ledger_spread_satisfied',
      ], 'the cohort latches before the durable handoff authorizes release');
      t.equal(states.includes('bypassed_insufficient_formation_cohort'), false,
        'discovery is not bypassed while the durable handoff is pending');
    } finally {
      resetEnvironment();
    }
  });

t.test(
  'formation consumes only the startup-authority owner verdict',
  async (t) => {
    initializeEnvironment();
    const cache = buildFormationCache();
    let now = 1000;
    let legacyPlacementReadCount = 0;
    let legacyOperationReadCount = 0;
    let startupAuthority = null;
    const owner = buildFormationBarrierOwner({
      cache,
      now: () => now,
      sleep: async (delayMs) => {
        now += delayMs;
        startupAuthority = withReady(startupAuthority, true);
      },
    });
    startupAuthority = withReady(
      owner.rebalanceCoordinator.controlPlaneReadinessService
        .getStartupAuthoritySnapshotSync(),
      false,
    );
    owner.rebalanceCoordinator.controlPlaneReadinessService
      .getStartupAuthoritySnapshotSync = () => startupAuthority;
    owner.rebalanceCoordinator.controlPlaneReadinessService
      .getAuthoritativeControlPlaneView = () => ({
        canRead: () => true,
        readReadinessOwnerRows: async () => {
          legacyPlacementReadCount++;
          return {success: false, rows: []};
        },
      });
    owner.rebalanceCoordinator.getEntityAuthoritativeOperationObservation =
      async () => {
        legacyOperationReadCount++;
        return {state: 'empty', operations: [], deferredOutcome: null};
      };
    owner.config.priorityPlacementFormationTimeoutMs = 4;

    try {
      const error = await owner.awaitOperationLedgerFormationBarrier()
        .then(() => null, (failure) => failure);
      t.equal(error, null,
        'the canonical owner release is not vetoed by a second placement form');
      t.equal(legacyPlacementReadCount, 0,
        'bootstrap has no independent placement-read authority');
      t.equal(legacyOperationReadCount, 0,
        'bootstrap has no independent operation-drain authority');
    } finally {
      resetEnvironment();
    }
  },
);

t.test(
  'legacy-looking spread cannot override a pending startup-authority verdict',
  async (t) => {
    initializeEnvironment();
    const cache = buildFormationCache();
    let now = 2000;
    const owner = buildFormationBarrierOwner({
      cache,
      now: () => now,
      sleep: async (delayMs) => {
        now += delayMs;
      },
    });
    const pendingAuthority = withReady(
      owner.rebalanceCoordinator.controlPlaneReadinessService
        .getStartupAuthoritySnapshotSync(),
      false,
    );
    owner.rebalanceCoordinator.controlPlaneReadinessService
      .getStartupAuthoritySnapshotSync = () => pendingAuthority;
    owner.rebalanceCoordinator.controlPlaneReadinessService
      .getAuthoritativeControlPlaneView = () => ({
        canRead: () => true,
        readReadinessOwnerRows: async () => ({
          success: true,
          source: 'owner_rpc_lane',
          rows: [
            ['r1', 'seed-node'],
            ['r2', 'joining-node-2'],
            ['r3', 'joining-node-3'],
          ].map(([replicaId, nodeId]) => ({
            service_id: `${LEDGER_PARTITION_ID}-${replicaId}`,
            replica_id: `${LEDGER_PARTITION_ID}-${replicaId}`,
            partition_id: LEDGER_PARTITION_ID,
            node_id: nodeId,
            service_type: 'partition',
            status: 'active',
            raft_role: replicaId === 'r1' ? 'leader' : 'follower',
          })),
        }),
      });
    owner.rebalanceCoordinator.getEntityAuthoritativeOperationObservation =
      async () => ({state: 'empty', operations: [], deferredOutcome: null});
    owner.config.priorityPlacementFormationTimeoutMs = 3;

    try {
      const error = await owner.awaitOperationLedgerFormationBarrier()
        .then(() => null, (failure) => failure);
      t.match(error, {
        code: 'OPERATION_LEDGER_FORMATION_BARRIER_TIMEOUT',
        retryable: true,
      }, 'only the canonical owner can release an engaged barrier');
    } finally {
      resetEnvironment();
    }
  },
);
