/**
 * REPLACE owner-lease verdict: causal property (quest
 * replace-source-removal-owner, narrowed scope 2026-09-25; record
 * quest-records/replace-source-removal-owner/evidence-lease-verdict.md).
 *
 * The owner (the REPLACE's target node) is alive and its ACTIVE row carries
 * a live lease. The harness pre-stamps that lease with the lease record's
 * rule (updatedAt + TTL); it is NOT a lease the owner's own ACTIVE write
 * renewed: renewOperationOwnerLeaseAfterCommittedTransition has no caller,
 * and only the insert touch and the gateway UPDATE payload stamp a lease
 * (the raw-SQL fallback UPDATE does not). The STOPPING-phase fence below
 * rests on the same pre-stamped lease. A remote drain sweep (the seed) lands while the
 * REPLACE is ACTIVE, and again while it is STOPPING. The REPLACE must reach
 * its terminal through its own STOPPING step: the owner dispatches the
 * source removal (REMOVE_REPLICA, reason replace_source_removal), the source
 * retires, and only then is the REPLACE REMOVED. The SLO path this removes
 * (finding-slo-residual-remove-safety.md) is the seed releasing the REPLACE
 * at ACTIVE with its source still a voter, which leaves the source to a
 * planner REMOVE.
 *
 * Two coordinators share one durable store (cache + SQL gateway); both read
 * one controlled owner clock; nothing sleeps on the wall clock. The seed's
 * routing heuristic is driven both ways through its readiness authority.
 */

import {test} from '../../src/test-helpers/tap.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  ReplicaOperationField,
  ReplicaOperationMessageType,
  ReplicaOperationReason,
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {
  OperationType,
  ReplicaStatus,
  buildPriorityDrainReadinessService,
  createTestCoordinator,
  installActualReplicaObservationResolver,
} from './rebalance-coordinator-stopping-reconcile-fixtures.js';
import {
  LEASE_CELL,
  LEASE_VERDICT_NODE,
  LEASE_VERDICT_NOW_MS,
  LEASE_VERDICT_OPERATION_ID,
  LEASE_VERDICT_PARTITION_ID,
  LEASE_VERDICT_REPLICA,
  buildLeaseVerdictReadinessService,
  buildLeaseVerdictOperationRow,
  buildLeaseVerdictServiceRows,
} from './replace-owner-lease-verdict-harness.js';

const CAUSAL_STEP_ADVANCE_MS = 1_000;

function buildSourceNode(world, sharedCache) {
  // The source node's executor, at its lowest seam: REMOVE_REPLICA moves the
  // source row to REMOVING; retire() completes it (the services-row DELETE).
  return {
    receive(payload) {
      if (
        payload?.[ReplicaOperationField.TYPE] ===
          ReplicaOperationMessageType.REMOVE_REPLICA &&
        payload?.[ReplicaOperationField.REPLICA_ID] ===
          LEASE_VERDICT_REPLICA.SOURCE
      ) {
        world.source = ReplicaStatus.REMOVING;
        sharedCache.merge(
          SYSTEM_TABLE_NAME.SERVICES,
          LEASE_VERDICT_REPLICA.SOURCE,
          {status: ReplicaStatus.REMOVING},
        );
      }
    },
    retire() {
      world.source = null;
      sharedCache.delete(
        SYSTEM_TABLE_NAME.SERVICES,
        LEASE_VERDICT_REPLICA.SOURCE,
      );
    },
  };
}

function createCausalCluster(seedOwnerRoutingReady) {
  const world = {source: ReplicaStatus.ACTIVE, nowMs: LEASE_VERDICT_NOW_MS};
  const clock = {now: () => world.nowMs};
  const ownerDispatches = [];
  const seedDispatches = [];
  let sourceNode = null;
  const owner = createTestCoordinator({
    nodeId: LEASE_VERDICT_NODE.TARGET,
    enableTimeouts: false,
    messageRouter: {
      async deliver(target, payload) {
        ownerDispatches.push({target, payload});
        sourceNode.receive(payload);
        return {
          acknowledged: true,
          status: ReplicaOperationResponseStatus.INITIATED,
        };
      },
    },
    // The owner sees itself healthy; its own lease is live.
    controlPlaneReadinessService:
      buildPriorityDrainReadinessService(LEASE_VERDICT_PARTITION_ID),
    cacheData: {
      services: buildLeaseVerdictServiceRows(ReplicaStatus.ACTIVE),
      replicaOperations: [buildLeaseVerdictOperationRow({
        step: WORKFLOW_STEP.ACTIVE,
        leaseCell: LEASE_CELL.LIVE,
      })],
    },
  });
  sourceNode = buildSourceNode(world, owner.systemTableCache);
  const seed = createTestCoordinator({
    nodeId: LEASE_VERDICT_NODE.SEED,
    enableTimeouts: false,
    systemTableCache: owner.systemTableCache,
    sqlQueryEngine: owner.sqlQueryEngine,
    controlPlaneSystemTableGateway:
      owner.repository.controlPlaneSystemTableGateway,
    cdcIntegrationService: owner.cdcIntegrationService,
    messageRouter: {
      async deliver(target, payload) {
        seedDispatches.push({target, payload});
        return {
          acknowledged: true,
          status: ReplicaOperationResponseStatus.INITIATED,
        };
      },
    },
    controlPlaneReadinessService:
      buildLeaseVerdictReadinessService(
        seedOwnerRoutingReady,
        LEASE_VERDICT_NODE.TARGET,
      ),
  });
  for (const coordinator of [owner, seed]) {
    coordinator.workflowOwner.timeSource = clock;
    installActualReplicaObservationResolver(
      coordinator,
      async (replicaId) => replicaId === LEASE_VERDICT_REPLICA.SOURCE ?
        world.source :
        ReplicaStatus.ACTIVE,
    );
  }
  // The replacement leads (the owner's precondition for removing its
  // source). SUPERSEDED (R09) by the owner decision of 2026-09-25 (approved
  // REPLACE design, amendment-1 step 2, BR11): this was modelled as completed
  // replacement-election evidence in the owner's evidence map (CL-043); a
  // REPLACE's leader is now read fresh from its target replica, which the
  // fixture witness answers from the partition's leader row.
  owner.systemTableCache.merge(
    SYSTEM_TABLE_NAME.PARTITIONS,
    LEASE_VERDICT_PARTITION_ID,
    {partition_id: LEASE_VERDICT_PARTITION_ID,
      leader_node_id: LEASE_VERDICT_NODE.TARGET},
  );
  return {owner, seed, world, sourceNode, ownerDispatches, seedDispatches};
}

async function readDurableReplace(cluster) {
  const operation =
    await cluster.owner.getOperation(LEASE_VERDICT_OPERATION_ID);
  return {
    workflowStep: operation?.workflowStep || null,
    steps: (operation?.stepsHistory || []).map((entry) => entry.step),
    sourcePresent: cluster.world.source !== null,
  };
}

function sourceRemovalDispatches(dispatches) {
  return dispatches.filter(({payload}) =>
    payload?.[ReplicaOperationField.TYPE] ===
      ReplicaOperationMessageType.REMOVE_REPLICA &&
    payload?.[ReplicaOperationField.REPLICA_ID] ===
      LEASE_VERDICT_REPLICA.SOURCE);
}

for (const seedOwnerRoutingReady of [false, true]) {
  test('causal: a remote drain sweep during a live-leased ACTIVE REPLACE ' +
    'leaves source removal to the REPLACE\'s own STOPPING step (seed ' +
    `heuristic ${seedOwnerRoutingReady ? 'ready' : 'unready'})`, async (t) => {
    const cluster = createCausalCluster(seedOwnerRoutingReady);
    const {owner, seed, world} = cluster;
    const timeline = [];
    const sweep = async (coordinator) => {
      await coordinator.workflowOwner.checkTimeouts();
      const observed = await readDurableReplace(cluster);
      timeline.push(observed);
      return observed;
    };
    try {
      const afterSeedAtActive = await sweep(seed);
      t.same(
        {step: afterSeedAtActive.workflowStep, source: afterSeedAtActive.sourcePresent},
        {step: WORKFLOW_STEP.ACTIVE, source: true},
        'the seed sweep at ACTIVE neither releases nor fails the live-leased REPLACE',
      );

      world.nowMs += CAUSAL_STEP_ADVANCE_MS;
      const afterOwnerAtActive = await sweep(owner);
      t.equal(
        afterOwnerAtActive.workflowStep,
        WORKFLOW_STEP.STOPPING,
        'the owner advances its own REPLACE into STOPPING',
      );

      world.nowMs += CAUSAL_STEP_ADVANCE_MS;
      t.equal(
        (await sweep(seed)).workflowStep,
        WORKFLOW_STEP.STOPPING,
        'a seed sweep during STOPPING with the source still present does not settle it',
      );

      cluster.sourceNode.retire();
      world.nowMs += CAUSAL_STEP_ADVANCE_MS;
      await sweep(owner);
      const terminal = await sweep(seed);
      t.equal(terminal.workflowStep, WORKFLOW_STEP.REMOVED, 'the REPLACE completes');
      t.same(
        terminal.steps.slice(-3),
        [WORKFLOW_STEP.ACTIVE, WORKFLOW_STEP.STOPPING, WORKFLOW_STEP.REMOVED],
        'the terminal is reached through the REPLACE\'s own STOPPING step',
      );
      const firstTerminal = timeline.find((observed) =>
        observed.workflowStep === WORKFLOW_STEP.REMOVED ||
        observed.workflowStep === WORKFLOW_STEP.FAILED);
      t.equal(
        firstTerminal?.sourcePresent,
        false,
        'the source had already left when the REPLACE first became terminal',
      );

      const removals = sourceRemovalDispatches(cluster.ownerDispatches);
      t.same(
        removals.map(({payload}) => ({
          operationId: payload[ReplicaOperationField.OPERATION_ID],
          reason: payload[ReplicaOperationField.REASON],
        })),
        [{
          operationId: LEASE_VERDICT_OPERATION_ID,
          reason: ReplicaOperationReason.REPLACE_SOURCE_REMOVAL,
        }],
        'the source was removed once, by the REPLACE itself',
      );
      t.same(
        sourceRemovalDispatches(cluster.seedDispatches),
        [],
        'the remote seed never removes the source',
      );
      const durableOperations = owner.systemTableCache
        .getAll(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS)
        .map((row) => ({id: row.operation_id, type: row.type}));
      t.same(
        durableOperations,
        [{id: LEASE_VERDICT_OPERATION_ID, type: OperationType.REPLACE}],
        'no other operation (no planner REMOVE) exists for the source',
      );
    } finally {
      await seed.shutdown();
      await owner.shutdown();
    }
  });
}
