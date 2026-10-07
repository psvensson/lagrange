/**
 * Red-first replay of the 2026-10-06 PR73 five-node residual.
 *
 * Live evidence after the ledger cure had completed:
 * - RF=3, three observed service rows on three distinct nodes;
 * - priority planning said operationCreationRequired=true;
 * - a generic ADD was planned with reason increase_replica_count;
 * - authoritative topology-increase provenance was unavailable;
 * - the matching cleanup leg was therefore withheld;
 * - the coordinator correctly refused the naked ADD as
 *   replica_inventory_unusable.
 *
 * This test drives the real placement owner, MovePlanner and
 * RebalanceCoordinator topology guard. It does not propose a fix.
 */

import {test} from '../../src/test-helpers/tap.js';
import {MovePlanner} from '../../src/rebalancer/move-planner.js';
import {
  buildReplicaInventorySnapshot,
} from '../../src/rebalancer/replica-inventory.js';
import {
  buildPlacementOwnerDecision,
} from '../../src/rebalancer/placement-owner-decision.js';
import {
  EntityType,
  MoveType,
  ReplicaStatus,
} from '../../src/rebalancer/unified-rebalancer.js';
import {
  createAllowAllStorageAdmissionService,
  createMockCache,
  createTestCoordinator,
  initializeSpreadTestEnvironment,
} from './test-helpers.js';

const PARTITION_ID = 'sql_transactions-p1';
const TABLE_ID = 'sql_transactions';
const NODE_A = 'node-a';
const NODE_B = 'node-b';
const NODE_C = 'node-c';
const NODE_D = 'node-d-newcomer';
const NODE_E = 'node-e-newcomer';
const REPLICA_A = PARTITION_ID + '-r1';
const REPLICA_B = PARTITION_ID + '-r2';
const REPLICA_C = PARTITION_ID + '-r3';
const TARGET_RF = 3;
const NOW_MS = 1_000_000;
const INVENTORY_UNUSABLE_REASON = 'replica_inventory_unusable';
const GENERIC_ADD_REASON = 'increase_replica_count';

const POLICY = Object.freeze({
  targetReplicaCount: TARGET_RF,
  minReplicaCount: TARGET_RF,
  maxReplicaCount: 7,
  placementConstraints: Object.freeze({
    spreadAcrossNodes: true,
    considerCpuLoad: true,
  }),
});

function node(nodeId, cpuUsagePercent) {
  return {
    node_id: nodeId,
    status: 'active',
    connection_state: 'ready',
    ready_lease_expires_at: NOW_MS + 60_000,
    cpu_usage_percent: cpuUsagePercent,
    memory_usage_percent: 0,
    disk_usage_percent: 0,
  };
}

function replica(replicaId, nodeId, raftRole) {
  return {
    service_id: replicaId,
    service_type: 'partition',
    partition_id: PARTITION_ID,
    replica_id: replicaId,
    node_id: nodeId,
    address: 'local/partition/' + replicaId,
    status: ReplicaStatus.ACTIVE,
    raft_role: raftRole,
  };
}

function createWorld() {
  // Newcomers D/E are intentionally much "better" by ordinary suitability
  // score than incumbents A/B. Ordinary steady-state policy is nevertheless
  // already satisfied: RF=3, three healthy replicas, three distinct nodes.
  const nodes = [
    node(NODE_A, 90),
    node(NODE_B, 80),
    node(NODE_C, 70),
    node(NODE_D, 0),
    node(NODE_E, 10),
  ];
  const replicas = [
    replica(REPLICA_A, NODE_A, 'leader'),
    replica(REPLICA_B, NODE_B, 'follower'),
    replica(REPLICA_C, NODE_C, 'follower'),
  ];
  const cache = createMockCache({
    nodes,
    services: replicas,
    partitions: [{
      partition_id: PARTITION_ID,
      table_id: TABLE_ID,
      replica_count: TARGET_RF,
      leader_node_id: NODE_A,
    }],
    tables: [{
      table_id: TABLE_ID,
      table_policies: JSON.stringify(POLICY),
    }],
  });
  return {cache, nodes, replicas};
}

function forceUnavailableTopologyIncrease(baseBuilder) {
  return (options) => {
    const snapshot = baseBuilder(options);
    return {
      ...snapshot,
      provenance: {
        ...snapshot.provenance,
        committedRowsState: 'unavailable',
        consistency: 'source_unavailable',
        topologyIncreaseUsable: false,
      },
    };
  };
}

function createPlanner(world) {
  const provider = {
    isLeader: true,
    nodeId: NODE_A,
    replicaId: REPLICA_A,
    systemTableCache: world.cache,
    nowFn: () => NOW_MS,
    getAvailableNodes: () => world.nodes,
    getCurrentReplicas: () => world.replicas,
    getHealthyReplicas: (rows) =>
      rows.filter((row) => row.status === ReplicaStatus.ACTIVE),
    getInFlightOperations: () => [],
    getGlobalTopologyBlockingInFlightOperations: () => [],
    getPartitionDescriptorEpochEvidence: () => null,
    hasPendingMove: () => false,
    hasPendingAddForNode: () => false,
    isSystemPartitionEntity: () => true,
  };
  return new MovePlanner({
    entityId: PARTITION_ID,
    entityType: EntityType.PARTITION,
    moveStateProvider: provider,
    storageAdmissionService: createAllowAllStorageAdmissionService(),
    accountingService: {estimateReplicaBytes: () => 1},
    replicaInventoryBuilder:
      forceUnavailableTopologyIncrease(buildReplicaInventorySnapshot),
  });
}

test(
  'PR73 recovery authority cannot be reinterpreted as an unpaired generic ' +
  'placement migration when RF and spread are already satisfied',
  async (t) => {
    initializeSpreadTestEnvironment(NODE_A);
    const world = createWorld();
    const planner = createPlanner(world);

    t.equal(
      planner.isSuboptimalState(world.replicas, POLICY, world.nodes),
      false,
      'ordinary placement has no work: RF=3 and three distinct nodes',
    );

    const targetState = await planner.calculateTargetState(
      world.replicas,
      POLICY,
    );

    t.same(
      [...targetState.targetNodes].sort(),
      [NODE_C, NODE_D, NODE_E].sort(),
      'generic suitability ranking displaces healthy incumbents A/B',
    );
    t.equal(
      targetState.topologyTransitionSnapshot.inventory.provenance
        .topologyIncreaseUsable,
      false,
      'fixture pins the live unavailable topology-increase provenance',
    );

    const moves = planner.calculateMoves(world.replicas, targetState);
    const addMoves = moves.filter((move) => move.type === MoveType.ADD);
    const removeMoves = moves.filter((move) => move.type === MoveType.REMOVE);

    t.ok(
      addMoves.length > 0,
      'current planner emits a count-increasing leg for the migration',
    );
    t.same(
      [...new Set(addMoves.map((move) => move.reason))],
      [GENERIC_ADD_REASON],
      'the migration ADD is generic, not recovery/cure typed',
    );
    t.equal(
      removeMoves.length,
      0,
      'unusable topology provenance suppresses the matching cleanup leg',
    );

    const coordinator = createTestCoordinator({
      nodeId: NODE_A,
      systemTableCache: world.cache,
      storageAdmissionService: createAllowAllStorageAdmissionService(),
      sqlQueryResults: {
        'FROM services': {
          success: false,
          error: 'authoritative services owner unavailable',
        },
      },
    });

    try {
      let createError = null;
      try {
        await coordinator.createOperation({
          ...addMoves[0],
          type: MoveType.ADD,
          partitionId: PARTITION_ID,
          entityType: EntityType.PARTITION,
          entityId: PARTITION_ID,
          emitOperationCreated: false,
          enforceConcurrentOperationBudget: true,
        });
      } catch (error) {
        createError = error;
      }

      t.ok(createError, 'the topology owner refuses the naked ADD');
      t.ok(
        JSON.stringify(createError?.admissionResult || createError || {})
          .includes(INVENTORY_UNUSABLE_REASON),
        'refusal is the live replica_inventory_unusable boundary',
      );
    } finally {
      if (typeof coordinator.shutdown === 'function') {
        coordinator.shutdown();
      }
    }

    // Historical counterfactual only: the placement owner still contains the
    // C-2 incumbent-retention primitive, although MovePlanner does not wire
    // this input today. This proves mechanism fit; it does NOT authorize
    // enabling the old lever.
    const retained = buildPlacementOwnerDecision({
      candidateNodes: world.nodes,
      currentReplicas: world.replicas,
      targetCount: TARGET_RF,
      policy: POLICY,
      retainHealthyIncumbents: true,
    });
    t.same(
      [...retained.intent.targetNodeIds].sort(),
      [NODE_A, NODE_B, NODE_C].sort(),
      'existing owner primitive retains the already-healthy incumbent cohort',
    );

    t.equal(
      addMoves.length,
      0,
      'RED-ON-CURRENT: a recovery-authorized planning pass must not invent ' +
        'an unpaired generic placement ADD when ordinary placement is already satisfied',
    );
  },
);
