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

t.test(
  'formation consumes only the startup-authority owner verdict',
  async (t) => {
    initializeEnvironment();
    const cache = buildFormationCache();
    let now = 1000;
    let legacyPlacementReadCount = 0;
    let legacyOperationReadCount = 0;
    const owner = buildFormationBarrierOwner({
      cache,
      now: () => now,
      sleep: async (delayMs) => {
        now += delayMs;
        startupAuthority = withReady(startupAuthority, true);
      },
    });
    let startupAuthority = withReady(
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
