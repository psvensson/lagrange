/**
 * Owner ruling 2026-10-05: a satisfied-in-flight REPLACE blocks planning.
 * At most one unresolved replica operation per partition: a REPLACE still
 * using its legitimate remove-dispatch grace may count for the spread, but a
 * second operation on its partition is neither planned nor created until the
 * first reaches its own terminal state. "Spread satisfied" never answers
 * "may another operation be planned".
 *
 *   W1  the R1 state (REPLACE in remove-dispatch grace, spread reads
 *       spread_satisfied_in_flight): every per-partition admission refuses a
 *       second operation, with a typed reason; another partition is admitted
 *       and the cluster ADD budget stays open for it;
 *   W2  owner-driven end to end, the REPLACE target already counted by the
 *       census ({A:3,B:1}, REPLACE A->B);
 *   W3  owner-driven end to end, the target not yet counted (the grace);
 *   W4  every admission of the census refuses while the REPLACE is
 *       unresolved (parameterised over W2 and W3 at every step);
 *   W5  supersede of the SAME operation: re-planning its intent returns it
 *       (no refusal, no second row); a failed operation is terminal and a
 *       new one is then admitted;
 *   W6  the terminal event wakes the partition's planner (no timer fires).
 *
 * Every step is driven through the real RebalanceCoordinator and its
 * operation workflow owner; the transport is the REPLACE witness double and
 * the census is the real derived priority partition summary over the
 * fixture's services rows.
 */
import {test} from '../../src/test-helpers/tap.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {
  REBALANCER_SKIP_REASON,
} from '../../src/rebalancer/rebalancer-constants.js';
import {RECONCILE_REASON} from '../../src/workflow/reconcile-queue-constants.js';
import {
  buildDerivedPriorityPartitionSummary,
} from '../../src/control-plane/membership-publication-priority-partition-summary.js';
import {
  buildPriorityRecoveryOperationAssessment,
  doesPriorityRecoveryOperationHoldAddBudget,
  hasPriorityRecoverySpreadGap,
  shouldPriorityRecoveryOperationBlockPlanning,
} from '../../src/control-plane/priority-recovery-snapshot.js';
import {
  PRIORITY_RECOVERY_SEMANTIC_STATE,
} from '../../src/control-plane/priority-recovery-diagnostics-constants.js';
import {
  buildPriorityRecoveryCompletion,
} from '../../src/control-plane/priority-recovery-completion.js';
import {
  evaluateLearnerPromotionCountCheck,
} from '../../src/partition/learner-promotion-count-check.js';
import {
  buildEffectivePlacement,
  selectSerialPriorityMove,
} from '../../src/rebalancer/effective-placement-serial-priority-planner.js';
import {WAIT_BOUND_SPENT_EVENT} from '../../src/logging/wait-bound-spent.js';
import {createTestCoordinator, createTestRebalancer} from './test-helpers.js';
import {
  createReplaceWitness,
  deliveredReplaceWitnessResponse,
} from './replace-witness-fixture.js';

const PARTITION_ID = 'schema_operations-p1';
const OTHER_PARTITION_ID = 'sql_transactions-p1';
const NODE_A = 'node-a';
const NODE_B = 'node-b';
const NODE_C = 'node-c';
const NODE_D = 'node-d';
const NODES = Object.freeze([NODE_A, NODE_B, NODE_C, NODE_D]);
const SOURCE_REPLICA_ID = `${PARTITION_ID}-r2`;
const TARGET_REPLICA_COUNT = 3;
const READY_LEASE_MS = 600000;
const WOULD_EXCEED = 'would_exceed_target_replica_count';
const ROLE_LEADER = 'leader';
const ROLE_FOLLOWER = 'follower';
const ROLE_LEARNER = 'learner';
const DELIVERY_INITIATED = 'initiated';
const ENTITY_PARTITION = 'partition';
const SPREAD_REASON = 'spread_replicas';

function replicaRow(replicaId, nodeId, role, status = ReplicaStatus.ACTIVE) {
  return {
    service_id: replicaId,
    replica_id: replicaId,
    service_type: ENTITY_PARTITION,
    partition_id: PARTITION_ID,
    node_id: nodeId,
    status,
    raft_role: role,
    address: `${nodeId}/partition/${replicaId}`,
  };
}

function seedRow(index, nodeId, role) {
  return replicaRow(`${PARTITION_ID}-r${index}`, nodeId, role);
}

function readyNode(nodeId) {
  return {
    node_id: nodeId,
    status: ReplicaStatus.ACTIVE,
    connection_state: 'ready',
    ready_lease_expires_at: Date.now() + READY_LEASE_MS,
  };
}

function servicesOf(coordinator) {
  return coordinator.systemTableCache.getAll('services')
    .filter((row) => row.partition_id === PARTITION_ID);
}

// The census: the real derived priority partition summary over the rows.
function census(coordinator) {
  return buildDerivedPriorityPartitionSummary({
    serviceRows: servicesOf(coordinator),
    partitionRows: [],
    readinessByNodeId: {},
    projectedServingNodeIds: NODES,
    locallyEligibleNodeIds: NODES,
    publishedActiveNodeIds: NODES,
  });
}

function partitionCensus(coordinator) {
  return census(coordinator)?.blockedPartitions
    ?.find((partition) => partition.partitionId === PARTITION_ID) || null;
}

function distinctHolderCount(coordinator) {
  const holders = partitionCensus(coordinator)?.readyReplicaCountByNodeId;
  return holders ? Object.keys(holders).length : TARGET_REPLICA_COUNT;
}

function planningSnapshot(coordinator) {
  return {
    publishedActiveNodeIds: NODES,
    projectedServingNodeIds: NODES,
    locallyEligibleNodeIds: NODES,
    priorityPartitionSummary: census(coordinator),
  };
}

function unresolvedOperations(coordinator) {
  return coordinator.systemTableCache.getAll('replica_operations')
    .filter((row) =>
      (row.partition_id || row.partitionId) === PARTITION_ID &&
      !coordinator.isOperationTerminal(coordinator.repository.rowToOperation(
        row)));
}

function captureSpentWaits(...loggers) {
  const spent = [];
  for (const logger of loggers) {
    for (const level of ['error', 'warn']) {
      const original = logger[level].bind(logger);
      logger[level] = (message, payload, ...rest) => {
        if (JSON.stringify([message, payload]).includes(
          WAIT_BOUND_SPENT_EVENT)) {
          spent.push({message, payload});
        }
        return original(message, payload, ...rest);
      };
    }
  }
  return spent;
}

async function createWorld({seed}) {
  const witness = createReplaceWitness({addressedLeads: true});
  const heldTimers = [];
  const coordinator = createTestCoordinator({
    nodeId: NODE_B,
    enableTimeouts: false,
    replaceWitness: false,
    messageRouter: {
      async deliver(_target, payload) {
        const answered = witness.answer(payload);
        if (answered) {
          return deliveredReplaceWitnessResponse(answered);
        }
        return {acknowledged: true, status: DELIVERY_INITIATED};
      },
      getConnectionState: () => 'connected',
      pingNode: async () => true,
      isOutboundQueueAvailable: () => true,
    },
    setTimeoutFn(fn, delayMs) {
      const handle = {fn, delayMs, unref() {}};
      heldTimers.push(handle);
      return handle;
    },
    clearTimeoutFn() {},
    cacheData: {
      nodes: NODES.map(readyNode),
      services: seed,
      partitions: [{
        partition_id: PARTITION_ID,
        table_id: 'schema_operations',
        leader_node_id: NODE_A,
      }],
    },
  });
  coordinator.initialize();
  const owner = coordinator.workflowOwner;
  owner.getPriorityRecoveryDecisionSnapshotForOperation = async () => null;
  owner.readAvailablePriorityRecoveryPlanningSnapshotForOperation =
    async () => planningSnapshot(coordinator);
  const spentWaits = captureSpentWaits(coordinator.logger, owner.logger);
  const operation = await coordinator.createOperation({
    type: OperationType.REPLACE,
    partitionId: PARTITION_ID,
    entityType: ENTITY_PARTITION,
    entityId: PARTITION_ID,
    nodeId: NODE_B,
    sourceNodeId: NODE_A,
    replicaId: SOURCE_REPLICA_ID,
    enforceConcurrentOperationBudget: true,
  });
  return {coordinator, owner, witness, operation, heldTimers, spentWaits};
}

function persisted(world) {
  return world.coordinator.getOperation(world.operation.operationId);
}

function assessment(world, operation) {
  return buildPriorityRecoveryOperationAssessment({
    operation,
    priorityPartitionSummary: census(world.coordinator),
    effectiveEligibleNodeIds: NODES,
    nowMs: Date.now(),
  });
}

function laneContext(moveType, partitionId, extra = {}) {
  return {
    move: {
      type: moveType,
      partitionId,
      entityType: ENTITY_PARTITION,
      entityId: partitionId,
      enforceConcurrentOperationBudget: true,
      ...extra,
    },
    normalizedMoveType: moveType,
    entityType: ENTITY_PARTITION,
    entityId: partitionId,
    partitionId,
  };
}

function secondMove(type, partitionId, extra = {}) {
  return {
    type,
    partitionId,
    entityType: ENTITY_PARTITION,
    entityId: partitionId,
    reason: SPREAD_REASON,
    enforceConcurrentOperationBudget: true,
    ...extra,
  };
}

// The second operations a planner could ask for on the REPLACE's partition.
const SECOND_OPERATIONS = Object.freeze([
  {name: 'ADD', move: secondMove(OperationType.ADD, PARTITION_ID, {
    nodeId: NODE_C,
  })},
  {name: 'REPLACE', move: secondMove(OperationType.REPLACE, PARTITION_ID, {
    nodeId: NODE_D,
    sourceNodeId: NODE_A,
    replicaId: `${PARTITION_ID}-r1`,
  })},
  {name: 'REMOVE', move: secondMove(OperationType.REMOVE, PARTITION_ID, {
    nodeId: NODE_A,
    replicaId: `${PARTITION_ID}-r1`,
  })},
]);

// Every coordinator creation gate a new operation passes (the same set
// createOperationInternal runs), short of persistence.
async function creationGateRefusal(coordinator, move) {
  return refusal(coordinator.runOperationCreationAdmissionGates(move, {
    entityType: move.entityType,
    entityId: move.entityId,
    partitionId: move.partitionId,
  }));
}

async function refusal(promise) {
  try {
    await promise;
    return null;
  } catch (error) {
    return error;
  }
}

// W4: every admission of the census, asked about a second operation on the
// REPLACE's partition while the REPLACE is unresolved.
async function assertEveryAdmissionRefuses(t, world, label) {
  const {coordinator} = world;
  const operation = await persisted(world);
  t.notOk(coordinator.isOperationTerminal(operation),
    `${label}: the REPLACE is unresolved`);
  t.equal(
    shouldPriorityRecoveryOperationBlockPlanning(assessment(world, operation)),
    true, `${label}: planning admission (the owner predicate) refuses`);

  for (const second of SECOND_OPERATIONS) {
    const refused = await creationGateRefusal(coordinator, second.move);
    t.ok(refused, `${label}: the creation gates refuse a second ${
      second.name} (${refused?.rebalanceSkipReason || refused?.message})`);
    t.ok(refused?.rebalanceSkipReason,
      `${label}: ... with a typed reason`);
  }

  const rebalancer = createTestRebalancer({
    entityId: PARTITION_ID,
    nodeId: NODE_B,
    systemTableCache: coordinator.systemTableCache,
  });
  rebalancer.readAvailablePriorityRecoveryPlanningSnapshot =
    async () => planningSnapshot(coordinator);
  const nonBlocking =
    await rebalancer.buildNonBlockingPriorityOperationIdSet([operation]);
  t.notOk(nonBlocking.has(operation.operationId),
    `${label}: the topology-settling non-blocking set does not exempt it`);
  await rebalancer.shutdown();

  const capturedAtMs = Date.now();
  const placement = buildEffectivePlacement({
    inventory: coordinator.replicaInventoryBuilder({
      entityType: ENTITY_PARTITION,
      entityId: PARTITION_ID,
      capturedAtMs,
      committedRowsObservation: {
        state: 'present',
        rows: servicesOf(coordinator),
        observedAtMs: capturedAtMs,
      },
      inFlightOperationObservation: {
        state: 'present',
        operations: [operation],
        observedAtMs: capturedAtMs,
      },
    }),
    targetState: {targetReplicaCount: TARGET_REPLICA_COUNT, targetNodes: NODES},
    unresolvedOperations: [operation],
  });
  const serial = selectSerialPriorityMove({
    placement,
    candidates: [{type: 'ADD', reason: SPREAD_REASON, nodeId: NODE_C}],
  });
  t.equal(serial.newMoveCount, 0,
    `${label}: the serial planner emits no new move`);

  const replanned = await coordinator.createOperation({
    type: OperationType.ADD,
    partitionId: PARTITION_ID,
    entityType: ENTITY_PARTITION,
    entityId: PARTITION_ID,
    nodeId: NODE_C,
    reason: SPREAD_REASON,
    enforceConcurrentOperationBudget: true,
  }).catch((error) => error);
  t.equal(unresolvedOperations(coordinator).length, 1,
    `${label}: no second operation row opens (create answered ` +
    `${replanned?.operationId === operation.operationId ? 'with the REPLACE' :
      replanned?.rebalanceSkipReason || replanned?.message})`);

  const otherPartition = await creationGateRefusal(coordinator,
    secondMove(OperationType.ADD, OTHER_PARTITION_ID, {nodeId: NODE_C}));
  t.equal(otherPartition, null,
    `${label}: another partition is admitted (the invariant is per partition)`);
}

async function driveEndToEnd(t, {seed, targetCountedAtRemoveDispatch}) {
  const world = await createWorld({seed});
  const {coordinator, owner, witness, operation} = world;
  const targetReplicaId = operation.replicaId;
  const target = (status, role) =>
    replicaRow(targetReplicaId, NODE_B, role, status);
  const wakes = [];
  const rebalancer = createTestRebalancer({
    entityId: PARTITION_ID,
    nodeId: NODE_B,
    systemTableCache: coordinator.systemTableCache,
    setTimeoutFn(fn, delayMs) {
      const handle = {fn, delayMs, unref() {}};
      world.heldTimers.push(handle);
      return handle;
    },
    clearTimeoutFn() {},
  });
  rebalancer.isLeader = true;
  rebalancer.enqueueRebalanceCheck = (reason) => {
    wakes.push(reason);
    return true;
  };
  rebalancer.enqueueMembershipPublicationReconcile = () => true;
  rebalancer.bindCoordinatorProgressListeners(coordinator);
  try {
    await assertEveryAdmissionRefuses(t, world, 'created (PENDING)');

    await coordinator.executeOperation(operation);
    t.equal((await persisted(world)).workflowStep, WORKFLOW_STEP.CREATING,
      'the owner dispatched the target create');
    await assertEveryAdmissionRefuses(t, world, 'CREATING');

    coordinator.systemTableCache.upsert('services',
      target(ReplicaStatus.SYNCING, ROLE_LEARNER));
    const learnerCompletion = buildPriorityRecoveryCompletion({
      assessment: assessment(world, await persisted(world)),
      targetReplicaCount: TARGET_REPLICA_COUNT,
      activeVoterCount: seed.length,
      learnerCount: 1,
      priorityRecoveryActive: hasPriorityRecoverySpreadGap(
        census(coordinator)),
    });
    const promotion = evaluateLearnerPromotionCountCheck({
      targetReplicaCount: TARGET_REPLICA_COUNT,
      activeVoterCount: seed.length,
      learnerCount: 1,
      isJoiningExistingGroup: true,
      hasOwnedAddLikeOperation: true,
      isCriticalSystemPartition: true,
      temporaryOverflowVoterBudget:
        learnerCompletion.temporaryOverflowVoterBudget,
    });
    t.not(promotion.refusalReason, WOULD_EXCEED,
      'the target learner promotion is never refused as over target');

    // Target voter-ready: the owner moves the REPLACE into source removal.
    coordinator.systemTableCache.upsert('services',
      target(ReplicaStatus.ACTIVE, ROLE_FOLLOWER));
    const syncing = await persisted(world);
    syncing.workflowStep = WORKFLOW_STEP.SYNCING;
    syncing.status = ReplicaStatus.SYNCING;
    await coordinator.reconcileSyncingOperation(syncing);
    const removeDispatch = await persisted(world);
    t.ok(coordinator.isReplaceRemoveDispatchPhase(removeDispatch),
      'the owner reached the REPLACE remove-dispatch phase');
    if (!targetCountedAtRemoveDispatch) {
      // The target's row lags its voter state (the ACTIVE/learner window):
      // the census does not count it yet; the REPLACE holds the grace.
      coordinator.systemTableCache.upsert('services',
        target(ReplicaStatus.ACTIVE, ROLE_LEARNER));
    }
    const graceAssessment = assessment(world, removeDispatch);
    if (targetCountedAtRemoveDispatch) {
      t.same(partitionCensus(coordinator)?.readyReplicaCountByNodeId,
        {[NODE_A]: 3, [NODE_B]: 1},
        'the census already counts the target ({A:3,B:1})');
      t.not(graceAssessment.semanticState,
        PRIORITY_RECOVERY_SEMANTIC_STATE.SPREAD_SATISFIED_IN_FLIGHT,
        'a counted target is not credited again');
    } else {
      t.equal(graceAssessment.semanticState,
        PRIORITY_RECOVERY_SEMANTIC_STATE.SPREAD_SATISFIED_IN_FLIGHT,
        'the uncounted target holds the remove-dispatch grace (R1)');
      t.equal(doesPriorityRecoveryOperationHoldAddBudget(graceAssessment),
        false, 'the grace still releases the cross-partition ADD budget');
    }
    await assertEveryAdmissionRefuses(t, world, 'remove-dispatch');

    // The source removal commits; the owner completes the REPLACE.
    const holdersBeforeTrim = distinctHolderCount(coordinator);
    witness.commitRemoval();
    coordinator.systemTableCache.upsert('services',
      target(ReplicaStatus.ACTIVE, ROLE_FOLLOWER));
    coordinator.systemTableCache.delete('services', SOURCE_REPLICA_ID);
    t.ok(distinctHolderCount(coordinator) >= Math.min(holdersBeforeTrim,
      TARGET_REPLICA_COUNT), 'the source trim keeps the spread floor');
    const wakesBeforeTerminal = wakes.length;
    await owner.completeOperation(await persisted(world));
    const terminal = await persisted(world);
    t.equal(terminal.workflowStep, WORKFLOW_STEP.REMOVED,
      'the owner drove the REPLACE to its terminal state');
    t.ok(coordinator.isOperationTerminal(terminal), 'terminal by its status');

    // W6: the terminal event itself wakes the partition's planner. Every
    // timer in this world is held and never run, so the wake cannot have
    // come from a timer.
    t.ok(wakes.slice(wakesBeforeTerminal).includes(
      RECONCILE_REASON.PRIORITY_RECOVERY_PROGRESS),
    'W6: the terminal event enqueues the partition planner');

    // Planning resumes: nothing unresolved is left on the partition, and the
    // gates that refused a second operation now admit the next one.
    t.equal(unresolvedOperations(coordinator).length, 0,
      'no unresolved operation is left on the partition');
    for (const lane of [
      'ensureCriticalPartitionCreateLaneAvailable',
      'ensureEntityAddLikeCreateLaneAvailable',
    ]) {
      t.equal(await refusal(coordinator[lane](
        laneContext(OperationType.ADD, PARTITION_ID, {nodeId: NODE_D}))),
      null, `planning resumes after the terminal event: ${lane} admits`);
    }
    t.equal(await refusal(coordinator.ensurePriorityControlPlaneRemoveLaneAvailable(
      laneContext(OperationType.REMOVE, PARTITION_ID, {
        nodeId: NODE_A,
        replicaId: `${PARTITION_ID}-r1`,
      }))), null,
    'planning resumes after the terminal event: the remove lane admits');
    t.same(world.spentWaits, [], 'no wait bound was spent');
  } finally {
    rebalancer.unbindCoordinatorProgressListeners();
    await rebalancer.shutdown();
    await coordinator.shutdown();
  }
}

test('W1: the R1 state blocks a second operation on its partition only',
  async (t) => {
    const world = await createWorld({
      seed: [
        seedRow(1, NODE_A, ROLE_LEADER),
        seedRow(2, NODE_A, ROLE_FOLLOWER),
        seedRow(3, NODE_C, ROLE_FOLLOWER),
      ],
    });
    const {coordinator, operation} = world;
    try {
      await coordinator.executeOperation(operation);
      coordinator.systemTableCache.upsert('services', replicaRow(
        operation.replicaId, NODE_B, ROLE_FOLLOWER));
      const syncing = await persisted(world);
      syncing.workflowStep = WORKFLOW_STEP.SYNCING;
      syncing.status = ReplicaStatus.SYNCING;
      await coordinator.reconcileSyncingOperation(syncing);
      coordinator.systemTableCache.upsert('services', replicaRow(
        operation.replicaId, NODE_B, ROLE_LEARNER));
      const r1 = await persisted(world);
      const r1Assessment = assessment(world, r1);
      t.equal(r1Assessment.semanticState,
        PRIORITY_RECOVERY_SEMANTIC_STATE.SPREAD_SATISFIED_IN_FLIGHT,
        'spread reads satisfied-in-flight (the grace keeps its spread role)');
      t.equal(shouldPriorityRecoveryOperationBlockPlanning(r1Assessment), true,
        'the unresolved REPLACE blocks planning on its partition');
      for (const second of SECOND_OPERATIONS) {
        const refused = await creationGateRefusal(coordinator, second.move);
        t.ok(refused?.rebalanceSkipReason,
          `a second ${second.name} is refused with a typed reason (${
            refused?.rebalanceSkipReason})`);
      }
      t.equal(
        await coordinator.canStartPriorityAddOperation({
          partitionId: OTHER_PARTITION_ID,
        }),
        true,
        'the cluster ADD budget stays open for another partition');
      t.equal(await creationGateRefusal(coordinator,
        secondMove(OperationType.ADD, OTHER_PARTITION_ID, {nodeId: NODE_D})),
      null, 'another partition is admitted');
    } finally {
      await coordinator.shutdown();
    }
  });

test('W1b: spread satisfied never opens the create lane for a second ' +
  'operation on the partition of an unresolved operation', async (t) => {
  const addOperationId = 'unresolved-add-r3';
  const now = Date.now();
  const coordinator = createTestCoordinator({
    nodeId: NODE_B,
    enableTimeouts: false,
    cacheData: {
      nodes: NODES.map(readyNode),
      services: [
        seedRow(1, NODE_A, ROLE_LEADER),
        seedRow(2, NODE_C, ROLE_FOLLOWER),
        seedRow(3, NODE_D, ROLE_FOLLOWER),
      ],
      replicaOperations: [{
        operation_id: addOperationId,
        type: OperationType.ADD,
        partition_id: PARTITION_ID,
        entity_type: ENTITY_PARTITION,
        entity_id: PARTITION_ID,
        replica_id: `${PARTITION_ID}-r3`,
        source_node_id: NODE_A,
        target_node_id: NODE_D,
        status: ReplicaStatus.SYNCING,
        workflow_step: WORKFLOW_STEP.SYNCING,
        created_at: now,
        updated_at: now,
        completed_at: null,
        steps_history: JSON.stringify([
          {step: WORKFLOW_STEP.SYNCING, timestamp: now},
        ]),
      }],
    },
  });
  coordinator.initialize();
  const owner = coordinator.workflowOwner;
  owner.getPriorityRecoveryDecisionSnapshotForOperation = async () => null;
  owner.getPriorityRecoveryDecisionSnapshotForPartitionOperations =
    async () => null;
  owner.readAvailablePriorityRecoveryPlanningSnapshotForOperation =
    async () => planningSnapshot(coordinator);
  try {
    const add = await coordinator.getOperation(addOperationId);
    t.notOk(coordinator.isOperationTerminal(add), 'the ADD is unresolved');
    t.equal(partitionCensus(coordinator), null,
      'the census already reads the partition spread');
    t.equal(buildPriorityRecoveryOperationAssessment({
      operation: add,
      priorityPartitionSummary: census(coordinator),
      effectiveEligibleNodeIds: NODES,
      nowMs: Date.now(),
    }).spreadCompletion.satisfied, true, 'the spread reads satisfied');
    const lane = await refusal(
      coordinator.ensureCriticalPartitionCreateLaneAvailable(
        laneContext(OperationType.REPLACE, PARTITION_ID, {
          nodeId: NODE_B,
          sourceNodeId: NODE_A,
        })));
    t.equal(lane?.rebalanceSkipReason,
      REBALANCER_SKIP_REASON.BUDGET_EXCEEDED,
      'the critical create lane refuses a second add-like operation (typed)');
    t.equal(lane?.conflictingOperationId, addOperationId,
      'the refusal names the unresolved ADD');
    t.equal(await coordinator.shouldIgnoreCriticalAddBudgetOperation(add),
      true, 'its satisfied spread still releases the cross-partition ' +
      'ADD budget slot (a resource answer, not a planning answer)');
    t.equal(await refusal(
      coordinator.ensureCriticalPartitionCreateLaneAvailable(
        laneContext(OperationType.ADD, OTHER_PARTITION_ID, {nodeId: NODE_B}))),
    null, 'another partition is admitted');
  } finally {
    await coordinator.shutdown();
  }
});

// The base (13d772ae1) planning predicate, which the cluster-wide ADD budget
// keeps byte-for-byte, stated as its truth table (nothing imported from base):
//   1. no assessment object                         -> holds the slot
//   2. completion.state === operation_visibility_deferred -> holds
//      (an unread authoritative operation never gives its slot back, even
//      when the spread reads satisfied)
//   3. spreadCompletion.satisfied === true          -> releases
//   4. semanticState === coordination_mismatch      -> releases
//   5. otherwise                                    -> holds
function baseBudgetHoldsSlot(assessment) {
  if (!assessment || typeof assessment !== 'object') {
    return true;
  }
  if (assessment.completion?.state === 'operation_visibility_deferred') {
    return true;
  }
  if (assessment.spreadCompletion?.satisfied === true) {
    return false;
  }
  return assessment.semanticState !== 'coordination_mismatch';
}

const ABSENT = Symbol('absent');
const BUDGET_COMPLETIONS = Object.freeze([
  ABSENT, {}, ...[
    'converged', 'spread_satisfied_in_flight',
    'temporary_over_target_allowed', 'operation_visibility_deferred',
    'blocked', 'unknown_state',
  ].map((state) => ({state})),
]);
const BUDGET_SPREADS = Object.freeze([
  ABSENT, {satisfied: true}, {satisfied: false}, {satisfied: 'true'}, {},
]);
const BUDGET_SEMANTIC_STATES = Object.freeze([
  ABSENT, ...Object.values(PRIORITY_RECOVERY_SEMANTIC_STATE),
]);
const BUDGET_OPERATION_SHAPES = Object.freeze([
  OperationType.ADD, OperationType.REPLACE, OperationType.REMOVE,
].flatMap((type) => [
  WORKFLOW_STEP.PENDING, WORKFLOW_STEP.CREATING, WORKFLOW_STEP.STOPPING,
].map((workflowStep) => ({type, workflowStep}))));

function* budgetAssessmentCases() {
  for (const nonObject of [null, undefined, 'assessment', 0, true]) {
    yield {name: `non-object ${String(nonObject)}`, assessment: nonObject};
  }
  for (const completion of BUDGET_COMPLETIONS) {
    for (const spreadCompletion of BUDGET_SPREADS) {
      for (const semanticState of BUDGET_SEMANTIC_STATES) {
        for (const operationContext of BUDGET_OPERATION_SHAPES) {
          const assessment = {operationContext};
          const parts = [];
          for (const [key, value] of Object.entries(
            {completion, spreadCompletion, semanticState})) {
            if (value !== ABSENT) {
              assessment[key] = value;
            }
            parts.push(`${key}=${value === ABSENT ? '-' : JSON.stringify(value)}`);
          }
          yield {
            name: `${parts.join(' ')} ${operationContext.type}@${
              operationContext.workflowStep}`,
            assessment,
          };
        }
      }
    }
  }
}

test('R1: the cluster ADD budget predicate is the base planning predicate ' +
  'byte-for-byte (differential over the assessment cross product)', (t) => {
  const differing = [];
  let caseCount = 0;
  for (const {name, assessment} of budgetAssessmentCases()) {
    caseCount += 1;
    const head = doesPriorityRecoveryOperationHoldAddBudget(assessment);
    const base = baseBudgetHoldsSlot(assessment);
    if (head !== base) {
      differing.push({name, head, base});
    }
  }
  t.equal(caseCount, 5 + BUDGET_COMPLETIONS.length * BUDGET_SPREADS.length *
    BUDGET_SEMANTIC_STATES.length * BUDGET_OPERATION_SHAPES.length,
  `the whole cross product ran (${caseCount} cases)`);
  t.same(differing, [], 'no case differs from the base answer');
  t.equal(doesPriorityRecoveryOperationHoldAddBudget({
    completion: {state: 'operation_visibility_deferred'},
    spreadCompletion: {satisfied: true},
    semanticState: PRIORITY_RECOVERY_SEMANTIC_STATE.SPREAD_SATISFIED_IN_FLIGHT,
  }), true, 'an authoritatively deferred operation keeps its budget slot ' +
    'even when its spread reads satisfied');
  t.end();
});

test('W2: owner-driven REPLACE whose target the census already counts ' +
  '({A:3,B:1}, A->B) - no second operation from creation to terminal',
async (t) => {
  await driveEndToEnd(t, {
    seed: [
      seedRow(1, NODE_A, ROLE_LEADER),
      seedRow(2, NODE_A, ROLE_FOLLOWER),
      seedRow(3, NODE_A, ROLE_FOLLOWER),
    ],
    targetCountedAtRemoveDispatch: true,
  });
});

test('W3: owner-driven REPLACE with a not-yet-counted target (the grace) - ' +
  'no second operation from creation to terminal', async (t) => {
  await driveEndToEnd(t, {
    seed: [
      seedRow(1, NODE_A, ROLE_LEADER),
      seedRow(2, NODE_A, ROLE_FOLLOWER),
      seedRow(3, NODE_C, ROLE_FOLLOWER),
    ],
    targetCountedAtRemoveDispatch: false,
  });
});

test('W5: supersede of the same operation is not a second operation',
  async (t) => {
    const world = await createWorld({
      seed: [
        seedRow(1, NODE_A, ROLE_LEADER),
        seedRow(2, NODE_A, ROLE_FOLLOWER),
        seedRow(3, NODE_C, ROLE_FOLLOWER),
      ],
    });
    const {coordinator, operation} = world;
    try {
      await coordinator.executeOperation(operation);
      const again = await coordinator.createOperation({
        type: OperationType.REPLACE,
        partitionId: PARTITION_ID,
        entityType: ENTITY_PARTITION,
        entityId: PARTITION_ID,
        nodeId: NODE_B,
        sourceNodeId: NODE_A,
        replicaId: SOURCE_REPLICA_ID,
        enforceConcurrentOperationBudget: true,
      });
      t.equal(again.operationId, operation.operationId,
        're-planning the same intent re-arms the same operation');
      t.equal(unresolvedOperations(coordinator).length, 1,
        'no second row');
      await coordinator.failOperation(await persisted(world),
        'superseded by the test');
      t.ok(coordinator.isOperationTerminal(await persisted(world)),
        'the failed operation is terminal');
      const replacement = await coordinator.createOperation({
        type: OperationType.ADD,
        partitionId: PARTITION_ID,
        entityType: ENTITY_PARTITION,
        entityId: PARTITION_ID,
        nodeId: NODE_D,
        reason: SPREAD_REASON,
        enforceConcurrentOperationBudget: true,
      });
      t.not(replacement.operationId, operation.operationId,
        'a new operation is admitted once the first is terminal');
    } finally {
      await coordinator.shutdown();
    }
  });
