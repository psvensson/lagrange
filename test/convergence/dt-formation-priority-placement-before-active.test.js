import t from 'tap';
import {UnifiedRebalancer} from '../../src/rebalancer/unified-rebalancer.js';
import {
  REBALANCER_ENTITY_TYPE,
  REBALANCER_MOVE_TYPE,
} from '../../src/rebalancer/rebalancer-constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {
  isTerminalStep,
} from '../../src/rebalancer/replica-operation-progress.js';
import {createReplaceWitness} from '../rebalancer/replace-witness-fixture.js';
import {buildMockPolicyAuthorityWitness} from '../rebalancer/test-helpers.js';
import {
  createTimeoutTestCoordinator,
} from '../rebalancer/timeout-test-coordinator.js';
import {
  isLedgerQuorumConcentratedPartition,
} from '../../src/rebalancer/operation-ledger-hold-policy.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {
  SERVE_ELIGIBILITY_STATE,
} from '../../src/control-plane/serve-eligibility-owner.js';
import {
  LEDGER_PARTITION_ID,
  SEED_NODE_ID,
  JOINER_1_NODE_ID,
  JOINER_NODE_IDS,
  applyRow,
  buildFormationCache,
  buildOwnerDerivedStartupAuthoritySnapshot,
  buildRealLedgerPlanner,
  currentLedgerReplicas,
  initializeEnvironment,
  resetEnvironment,
} from './formation-barrier-test-fixture.js';

async function executeLedgerFormationTick({
  cache,
  coordinator,
  executionState,
  planner,
  events,
  witness,
}) {
  if (executionState.pendingOperation) {
    await coordinator.completeOperation(
      executionState.pendingOperation.operation,
    );
    executionState.pendingOperation = null;
    return;
  }
  const replicas = currentLedgerReplicas(cache);
  const targetState = await planner.calculateTargetState(replicas, {
    targetReplicaCount: 3,
    placementConstraints: {
      spreadAcrossNodes: true,
    },
  });
  const moves = planner.calculateMoves(replicas, targetState);
  const move = moves[0] || null;
  if (!move) {
    throw new Error(
      `Expected a real ledger formation move, got ${JSON.stringify(moves)}`,
    );
  }
  const operation = await coordinator.createOperation({
    type: move.type,
    partitionId: LEDGER_PARTITION_ID,
    entityType: REBALANCER_ENTITY_TYPE.PARTITION,
    entityId: LEDGER_PARTITION_ID,
    nodeId: move.nodeId,
    replicaId:
      move.type === REBALANCER_MOVE_TYPE.ADD ?
        `${LEDGER_PARTITION_ID}-r4` :
        move.replicaId,
    sourceNodeId: move.sourceNodeId,
  });

  const sourceReplicaId = move.sourceReplicaId || move.replicaId;
  if (move.type === REBALANCER_MOVE_TYPE.REPLACE) {
    const sourceRow = cache.get('services', sourceReplicaId);
    cache.applySystemTableChange('services', 'UPDATE', {
      ...sourceRow,
      node_id: move.nodeId,
    });
    witness.commitRemoval();
  } else if (move.type === REBALANCER_MOVE_TYPE.ADD) {
    const targetReplicaId = operation.replicaId;
    applyRow(cache, 'services', {
      service_id: targetReplicaId,
      replica_id: targetReplicaId,
      partition_id: LEDGER_PARTITION_ID,
      node_id: move.nodeId,
      service_type: REBALANCER_ENTITY_TYPE.PARTITION,
      status: ReplicaStatus.ACTIVE,
      raft_role: 'follower',
    });
  } else if (move.type === REBALANCER_MOVE_TYPE.REMOVE) {
    cache.applySystemTableChange('services', 'DELETE', {
      service_id: sourceReplicaId,
    });
  } else {
    throw new Error(`Unexpected ledger formation move ${move.type}`);
  }
  events.push({
    type: move.type,
    targetNodeId: move.nodeId,
    operationId: operation.operationId,
    concentratedAfterPhysicalMove:
      isLedgerQuorumConcentratedPartition(cache, LEDGER_PARTITION_ID),
    terminalAtPhysicalSpread: isTerminalStep(
      operation.type,
      operation.workflowStep,
    ),
    joinersPublicReady: cache
      .filter('nodes', (node) => node.node_id !== SEED_NODE_ID)
      .every((node) => Number.isFinite(node.ready_lease_expires_at)),
  });
  executionState.pendingOperation = {move, operation};
}

t.test(
  'production membership and startup-authority owners include connected ' +
    'pre-lease joiners only in the open priority-recovery cohort',
  async (t) => {
    const {planningAnswer, startupAuthority} =
      buildOwnerDerivedStartupAuthoritySnapshot();

    t.same(
      planningAnswer.projectionDiagnostics.livenessFallbackIncludedNodeIds,
      [...JOINER_NODE_IDS, SEED_NODE_ID].sort(),
      'fresh active+connected registration rows enter the bounded recovery projection',
    );
    t.equal(
      startupAuthority.authorityAvailable,
      true,
      'the canonical startup owner remains available while priority spread is pending',
    );
    t.same(
      startupAuthority.canonicalStartupNodeIds,
      [...JOINER_NODE_IDS, SEED_NODE_ID].sort(),
      'the priority rebalancer consumes the owner-authored cohort',
    );
    t.notOk(
      startupAuthority.ready,
      'owner-derived startup recovery does not imply public readiness',
    );
  },
);

t.test(
  'real placement and coordinator owners use one ledger REPLACE then ' +
    'expand-drain over READY joiners to cure ledger concentration',
  async (t) => {
    initializeEnvironment();
    const cache = buildFormationCache();
    const fixture = createTimeoutTestCoordinator();
    fixture.coordinator.systemTableCache = cache;
    const witness = createReplaceWitness({addressedLeads: true});
    const router = fixture.coordinator.messageRouter;
    const baseDeliver = router.deliver.bind(router);
    router.deliver = async (target, payload, options) =>
      witness.deliveryFor(payload) ?? baseDeliver(target, payload, options);
    const gateway = fixture.coordinator.controlPlaneSystemTableGateway;
    const baseReadAuthoritativeRows =
      gateway.readAuthoritativeRows.bind(gateway);
    gateway.readAuthoritativeRows = async (tableName, sql, params, options) => {
      if (
        tableName === 'services' &&
        options?.authoritativeReadMode ===
          CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED
      ) {
        return {
          success: true,
          source: 'owner_rpc_lane',
          rows: currentLedgerReplicas(cache),
          rowSetComplete: true,
          readAuthorityWitness: buildMockPolicyAuthorityWitness('services-p1'),
        };
      }
      return baseReadAuthoritativeRows(tableName, sql, params, options);
    };
    const planner = buildRealLedgerPlanner(
      cache,
      fixture.trackedOperations,
    );
    const events = [];
    const executionState = {pendingOperation: null};
    const isFormationCureDone = () =>
      !isLedgerQuorumConcentratedPartition(cache, LEDGER_PARTITION_ID) &&
      [...fixture.trackedOperations.values()].every((operation) =>
        isTerminalStep(operation.type, operation.workflow_step),
      );

    try {
      for (let tick = 0; tick < 12 && !isFormationCureDone(); tick += 1) {
        await executeLedgerFormationTick({
          cache,
          coordinator: fixture.coordinator,
          executionState,
          planner,
          events,
          witness,
        });
      }

      t.equal(
        events.length,
        3,
        'the concentrated 3/0/0 shape uses REPLACE, ADD, then safe REMOVE',
      );
      t.same(
        events.map((event) => event.type),
        [
          REBALANCER_MOVE_TYPE.REPLACE,
          REBALANCER_MOVE_TYPE.ADD,
          REBALANCER_MOVE_TYPE.REMOVE,
        ],
        'the real owners avoid a second exclusive ledger REPLACE',
      );
      t.equal(
        events[1].concentratedAfterPhysicalMove,
        true,
        'the unchanged four-voter quorum floor keeps 2-1-1 concentrated',
      );
      t.equal(
        events[2].concentratedAfterPhysicalMove,
        false,
        'standalone-safe REMOVE releases concentration at 1-1-1',
      );
      t.notOk(
        events.some((event) => event.terminalAtPhysicalSpread),
        'the regression preserves production DELETE-before-terminal ordering',
      );
      t.ok(
        events.every((event) => event.joinersPublicReady),
        'joiners hold their local READY leases while ledger placement spreads',
      );
      const spreadNodeIds = new Set(
        currentLedgerReplicas(cache).map((row) => row.node_id),
      );
      t.equal(
        spreadNodeIds.size,
        3,
        'the actual services rows finish at one ledger voter per node',
      );
      t.ok(
        spreadNodeIds.has(SEED_NODE_ID),
        'the count-neutral cure keeps one ledger voter on the seed',
      );
      t.equal(
        [...fixture.trackedOperations.values()].filter(
          (operation) =>
            !isTerminalStep(operation.type, operation.workflow_step),
        ).length,
        0,
        'all durable coordinator operations are terminal',
      );
    } finally {
      await fixture.coordinator.shutdown();
      resetEnvironment();
    }
  },
);

t.test(
  'pre-ready nodes are never placement targets for priority or ordinary ' +
    'partitions',
  async (t) => {
    initializeEnvironment();
    try {
      const now = Date.now();
      const nodeRows = [
        {
          node_id: SEED_NODE_ID,
          status: ReplicaStatus.ACTIVE,
          connection_state: 'ready',
          ready_lease_expires_at: now + 60000,
        },
        {
          node_id: JOINER_1_NODE_ID,
          status: ReplicaStatus.ACTIVE,
          connection_state: 'connected',
          ready_lease_expires_at: null,
        },
      ];
      for (const entityId of [LEDGER_PARTITION_ID, 'ordinary-p1']) {
        const rebalancer = new UnifiedRebalancer({
          entityId,
          entityType: REBALANCER_ENTITY_TYPE.PARTITION,
          nodeId: SEED_NODE_ID,
          systemTableCache: {
            get: () => null,
            getAll: (tableName) => (tableName === 'nodes' ? nodeRows : []),
            filter: () => [],
          },
          cdcIntegrationService: {
            insertSystemTableRow: async () => ({success: true}),
            updateSystemTableRow: async () => ({success: true}),
          },
          tablePolicyService: {
            getPolicyForPartition: () => ({
              minReplicaCount: 3,
              targetReplicaCount: 3,
            }),
          },
          messageRouter: {
            getConnectionState: () => 'connected',
            isOutboundQueueAvailable: () => true,
            getConnectedNodes: () => [SEED_NODE_ID, JOINER_1_NODE_ID],
          },
          rebalanceCoordinator: {
            getStats: () => ({inFlightOperations: 0, totalOperations: 0}),
          },
          sqlQueryEngine: {
            executeQuery: async () => ({success: true, rows: []}),
          },
          controlPlaneReadinessService: {
            answerCommittedNodes: () => ({
              state: SERVE_ELIGIBILITY_STATE.READY,
              epoch: {
                publicationEpoch: 1,
                publicationId: 'cluster_membership-1',
                readAtMs: 0,
              },
              nodeRows,
            }),
            getNodeReadinessSync: (nodeId) => ({
              nodeId,
              dimensions: {
                [CONTROL_PLANE_READINESS_DIMENSION
                  .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
                [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
              },
              reasons: [],
            }),
            getStartupAuthoritySnapshotSync: () => ({
              authorityAvailable: true,
              canonicalStartupNodeIds: [SEED_NODE_ID, JOINER_1_NODE_ID],
            }),
          },
        });
        t.same(
          rebalancer.getAvailableNodes().map((node) => node.node_id),
          [SEED_NODE_ID],
          `${entityId} admits only READY-leased nodes`,
        );
      }
    } finally {
      resetEnvironment();
    }
  },
);
