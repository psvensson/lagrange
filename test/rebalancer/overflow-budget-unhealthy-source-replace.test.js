// AUDIT-WITNESS-KIND: real-chain
// Every reachability claim in this file runs the real producer, the real
// operation representation, the real coordinator/repository path and the
// real guard. Nothing between the producer and the guard is hand-built.
// The priority-recovery relocation REPLACE, traced in ONE drive and
// classified (quest critical-spread-overflow-budget-audit, receipt
// unhealthy-source-replace-traced-and-classified).
//
// CORRECTION carried by this file, round 1. The cure condition is named
// UNHEALTHY_SOURCE_AT_TARGET and that is a misnomer: the source is selected
// FROM the HEALTHY replicas, preferring one on a node that hosts more than
// one, and the target is an UNOCCUPIED eligible node. A failed replica is
// filtered out before the selection runs and can never be the source. What
// the move cures is a DISTINCT-NODE SPREAD gap, by a REPLACE rather than an
// ADD - the same condition the cure policy classifies for ADD, decided in a
// second module.
//
// CORRECTION carried by this file, round 2. The CHAIN - a second relocation
// while the first still drains - is not an availability mechanism. The
// planner SERIALIZES REPLACE on critical partitions to one in flight, and
// its stated reason is that more "only builds a mutual-defer standoff". And
// the chain is reachable only through the census disagreement: with four
// ACTIVE voters the follow-up builder suppresses, and only a prior target
// still SYNCING in a voter role yields a second REPLACE. Both are driven
// below, in one drive, and the guard's membership is derived from the same
// state rather than stitched by hand.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EntityType,
  MoveType,
  ReplicaStatus,
} from '../../src/rebalancer/unified-rebalancer.js';
import {
  PLACEMENT_CURE_CONDITION,
  classifyPriorityRecoveryFollowUpCureCondition,
  resolvePlacementCure,
} from '../../src/rebalancer/replica-placement-cure-policy.js';
import {
  MOVE_REASON, REBALANCER_MOVE_TYPE,
} from '../../src/rebalancer/rebalancer-constants.js';
import {
  buildReplicaInventorySnapshot,
} from '../../src/rebalancer/replica-inventory.js';
import {
  FOLLOWER_ROLE,
  LEADER_ROLE,
  LEARNER_ROLE,
  MATRIX_JSON,
  createWiredRebalancer,
  readJsonArtifact,
  runPromotionGuard,
} from './overflow-budget-audit-support.js';
import {
  emitAndAssertReceipts,
  guardStateDriveReceipt,
  producerReachabilityReceipt,
  sliceProvenanceReceipt,
} from './overflow-budget-receipt-emission.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

if (!ConfigurationManager.getInstance().isInitialized()) {
  ConfigurationManager.getInstance().initialize({});
}
if (!LoggingService.getInstance().isInitialized()) {
  LoggingService.getInstance().initialize({level: 'error'});
}

const PARTITION_ID = 'sql_transactions-p1';
const TABLE_ID = 'sql_transactions';
const CO_LOCATED_NODE = 'node-a';
const SECOND_NODE = 'node-b';
const PRIOR_TARGET_NODE = 'node-c';
const SPARE_NODE = 'node-d';
const NODE_IDS = Object.freeze(
  [CO_LOCATED_NODE, SECOND_NODE, PRIOR_TARGET_NODE, SPARE_NODE]);
const TARGET = 3;
const BUDGET = 2;
const WOULD_EXCEED = 'would_exceed_target_replica_count';
const THIS_FILE =
  'test/rebalancer/overflow-budget-unhealthy-source-replace.test.js';
const THIS_TEST =
  'the priority-recovery relocation REPLACE is traced end to end and classified';
// The owner this test DRIVES, named at the call site of the drive. It is not
// looked up from a matrix row, and no row id appears in this file's emission.
const RELOCATION_PRODUCER = 'follow-up-unhealthy-source-replace';
const HANDOFF_SLICE = 'relocation-handoff';
const EMIT_KEY = 'unhealthy-source-replace';
const PRIOR_TARGET_REPLICA = 'r-prior';

// A voter row in the shape the rebalancer's own health filter accepts for a
// SYSTEM partition: addressable, on a ready node, in a VOTER raft role (the
// role vocabulary is the raft one, not the word "voter").
function replica(replicaId, nodeId, status = ReplicaStatus.ACTIVE,
  raftRole = FOLLOWER_ROLE) {
  return {
    service_id: replicaId,
    replica_id: replicaId,
    partition_id: PARTITION_ID,
    service_type: EntityType.PARTITION,
    node_id: nodeId,
    address: `addr-${replicaId}`,
    raft_role: raftRole,
    status,
  };
}

// THE state. Three healthy voters, two of them co-located, plus the target
// of a PRIOR relocation whose source has not yet been removed. Its status is
// the whole question: ACTIVE means the suppressor sees four; SYNCING in a
// voter role means the suppressor sees three and the other two censuses see
// four.
function chainState(priorTargetStatus) {
  const rows = [
    replica('r-1', CO_LOCATED_NODE, ReplicaStatus.ACTIVE, LEADER_ROLE),
    replica('r-2', CO_LOCATED_NODE),
    replica('r-3', SECOND_NODE),
  ];
  if (priorTargetStatus) {
    rows.push(replica(PRIOR_TARGET_REPLICA, PRIOR_TARGET_NODE,
      priorTargetStatus));
  }
  return rows;
}

function followUpDecision() {
  return {
    decisionSnapshot: {
      partitionId: PARTITION_ID,
      semanticState: 'needs_operation',
      progress: {nextRequiredAction: 'create_recovery_operation'},
      planner: {requiredDistinctNodeCount: TARGET},
      admission: {effectiveEligibleNodeIds: NODE_IDS},
      publication: {recoveryActiveNodeIds: NODE_IDS},
    },
  };
}

function wire(services) {
  return createWiredRebalancer({
    partitionId: PARTITION_ID, tableId: TABLE_ID, nodeIds: NODE_IDS,
    services, target: TARGET,
  });
}

function buildFollowUpMove(services) {
  const wired = wire(services);
  try {
    return wired.rebalancer.buildPriorityRecoveryFollowUpMove({
      decision: followUpDecision(), currentReplicas: services,
    });
  } finally {
    wired.rebalancer.shutdown();
  }
}

// The guard's membership is DERIVED from the drive: the same rows the
// builder saw, plus the learner the coordinator's operation created. Nothing
// is stitched by hand.
function guardRowsFromDrive(services, learnerReplicaId, learnerNodeId) {
  return [
    ...services.map((row) => ({...row})),
    {
      service_id: learnerReplicaId,
      replica_id: learnerReplicaId,
      partition_id: PARTITION_ID,
      service_type: 'partition',
      status: ReplicaStatus.ACTIVE,
      raft_role: LEARNER_ROLE,
      node_id: learnerNodeId,
    },
  ];
}

// The learner the drive produced is the one the DURABLE row names. A REPLACE
// does not reuse the source replica id: the coordinator derives a new
// replica identity for the target (rebalance-replace-intent-identity.js:
// buildReplicaId), and the source row stays in the membership until the
// remove-dispatch phase. Taking the id from the row rather than from the
// move is what makes this a membership the drive produced.
function guardOptions(services, operationRow, extra = {}) {
  const learnerReplicaId = operationRow.replica_id;
  const learnerNodeId = operationRow.target_node_id;
  return {
    partitionId: PARTITION_ID,
    replicaId: learnerReplicaId,
    learnerNodeId,
    serviceRows: guardRowsFromDrive(services, learnerReplicaId, learnerNodeId),
    operationRows: [operationRow],
    partitionRow: {partition_id: PARTITION_ID, replica_count: TARGET},
    priorityPartitionSummary: {
      satisfied: false, requiredDistinctNodeCount: TARGET,
      readyEligibleNodeCount: TARGET,
      blockedPartitions: [{partitionId: PARTITION_ID,
        requiredDistinctNodeCount: TARGET, readyDistinctNodeCount: 2,
        spreadGap: 1}],
      missingPartitionIds: [],
    },
    recoveryPending: true,
    ...extra,
  };
}

test('the priority-recovery relocation REPLACE is traced end to end and classified',
  async () => {
    const matrix = readJsonArtifact(MATRIX_JSON);
    // ---- 1. THE DECISION, on the real follow-up owner -------------------
    const firstRelocation = buildFollowUpMove(chainState(null));
    assert.equal(firstRelocation.type, MoveType.REPLACE,
      'three healthy replicas, two co-located, produce a REPLACE');
    assert.equal(firstRelocation.reason, MOVE_REASON.REPLACE_REPLICA);
    assert.equal(firstRelocation.sourceNodeId, CO_LOCATED_NODE,
      'the SOURCE is on the node that hosts more than one replica');
    assert.ok(['r-1', 'r-2'].includes(firstRelocation.replicaId),
      'and it is one of the healthy replicas on that node');
    assert.equal(
      chainState(null).some((row) => row.node_id === firstRelocation.nodeId),
      false, 'the TARGET hosts none of this partition\'s replicas');
    // A FAILED replica can never be the source: it is filtered out before
    // the selection runs, so "unhealthy source" is a misnomer.
    const withFailed = chainState(null)
      .map((row) => (row.replica_id === 'r-3' ?
        {...row, status: ReplicaStatus.FAILED} : row));
    assert.notEqual(buildFollowUpMove(withFailed).replicaId, 'r-3',
      'the failed replica is never selected as the REPLACE source');
    // ---- 2. THE CHAIN, and what it is reachable through -----------------
    // Prior target ACTIVE: the suppressor's census reads four and the
    // builder refuses. No chain.
    const activePrior = buildFollowUpMove(chainState(ReplicaStatus.ACTIVE));
    assert.equal(activePrior.followUpMoveState, 'over_replication_suppressed',
      'with the prior target ACTIVE the builder suppresses the second ' +
        'relocation');
    assert.equal(activePrior.type, undefined, 'and emits no move');
    // Prior target still SYNCING in a voter role: the suppressor's census
    // reads three, the other two read four, and a SECOND relocation is
    // created. The chain exists ONLY through that disagreement.
    const chained = chainState(ReplicaStatus.SYNCING);
    const secondRelocation = buildFollowUpMove(chained);
    assert.equal(secondRelocation.type, MoveType.REPLACE,
      'with the prior target SYNCING a second relocation IS created');
    assert.equal(secondRelocation.followUpMoveState, 'move_created');
    // ---- 3. THE COORDINATOR, in the SAME drive --------------------------
    const executing = wire(chained);
    let created = null;
    try {
      const result =
        await executing.rebalancer.executeMoveViaCoordinator(secondRelocation);
      created = result && result.operationId ? result : null;
    } finally {
      executing.rebalancer.shutdown();
      await executing.coordinator.shutdown();
    }
    assert.ok(created && created.operationId && created.replicaId,
      'the real coordinator created the second relocation operation');
    assert.equal(String(created.operation).toLowerCase(), MoveType.REPLACE);
    const createdRow = executing.coordinator.systemTableCache
      .get('replica_operations', created.operationId);
    assert.ok(createdRow, 'and persisted a replica_operations row for it');
    assert.equal(createdRow.replica_id.startsWith('replace-replica-'), true,
      'the REPLACE names a NEW target replica identity, not the source');
    assert.equal(createdRow.source_node_id, CO_LOCATED_NODE,
      'walking a replica off the doubly-occupied node');
    const operationRow = {
      ...createdRow,
      status: 'in_progress',
      workflow_step: 'ADD_REPLICA',
    };
    // ---- 4. THE GUARD, over the membership this drive produced ----------
    // Counted where the evaluations happen, so the receipt below states how
    // many ran rather than asserting that they did.
    const evaluations = {actualBudget: 0, budgetForcedToZero: 0};
    const granted = await runPromotionGuard(
      guardOptions(chained, operationRow));
    evaluations.actualBudget += 1;
    assert.equal(granted.observation.activeVoterCount, TARGET + 1,
      'the guard counts the SYNCING prior target as a voter, so the ' +
        'partition is already one over target when the chained target ' +
        'asks to promote');
    assert.equal(granted.granted, true,
      'the chained relocation target is granted today');
    assert.equal(granted.observation.temporaryOverflowVoterBudget, BUDGET,
      'with the overflow budget in force');
    const refused = await runPromotionGuard(
      guardOptions(chained, operationRow, {zeroBudget: true}));
    evaluations.budgetForcedToZero += 1;
    assert.equal(refused.granted, false,
      'and refused with the budget forced to zero in a completion-owner ' +
        'double');
    const refusalLine = refused.logLines.find((line) =>
      line.fields && line.fields.reason === WOULD_EXCEED);
    assert.ok(refusalLine, 'for exceeding the target replica count');
    assert.equal(refusalLine.fields.maxAllowedVotersAfterPromotion, TARGET + 1,
      'the replacement allowance alone stops one voter short');
    // The FIRST relocation, on the same drive shape without the prior
    // target, needs no budget at all: it is the +1 hand-off the replacement
    // allowance already covers.
    const firstExecuting = wire(chainState(null));
    let firstCreated = null;
    try {
      const result = await firstExecuting.rebalancer
        .executeMoveViaCoordinator(firstRelocation);
      firstCreated = result && result.operationId ? result : null;
    } finally {
      firstExecuting.rebalancer.shutdown();
      await firstExecuting.coordinator.shutdown();
    }
    assert.ok(firstCreated, 'the first relocation is created too');
    const firstRow = {
      ...firstExecuting.coordinator.systemTableCache
        .get('replica_operations', firstCreated.operationId),
      status: 'in_progress',
      workflow_step: 'ADD_REPLICA',
    };
    const handoff = await runPromotionGuard(guardOptions(
      chainState(null), firstRow, {zeroBudget: true}));
    assert.equal(handoff.granted, true,
      'the count-neutral hand-off itself needs no budget');
    // ---- 5. THE CENSUS DISAGREEMENT, on the real inventory owner --------
    const promotionWindow = buildReplicaInventorySnapshot({
      entityType: 'partition', entityId: PARTITION_ID,
      committedRowsObservation: {rows: chained},
      inFlightOperationObservation: {operations: []},
      capturedAtMs: 1,
    });
    assert.equal(promotionWindow.accounting.activeCount, TARGET,
      'the suppressor census reads at target');
    assert.equal(promotionWindow.accounting.activeVoterCount, TARGET + 1,
      'the over-creation cap census reads one over target');
    // ---- 6. THE CURE TYPING ---------------------------------------------
    assert.equal(classifyPriorityRecoveryFollowUpCureCondition({
      healthyReplicaCount: TARGET, targetReplicaCount: TARGET,
      hasSelectableSourceReplica: true,
    }), PLACEMENT_CURE_CONDITION.UNHEALTHY_SOURCE_AT_TARGET);
    assert.equal(classifyPriorityRecoveryFollowUpCureCondition({
      healthyReplicaCount: TARGET - 1, targetReplicaCount: TARGET,
      hasSelectableSourceReplica: true,
    }), PLACEMENT_CURE_CONDITION.UNDER_REPRESENTATION,
    'too few replicas is never REPLACE-curable');
    assert.deepEqual({...resolvePlacementCure(
      PLACEMENT_CURE_CONDITION.UNHEALTHY_SOURCE_AT_TARGET)},
    {moveType: REBALANCER_MOVE_TYPE.REPLACE,
      moveReason: MOVE_REASON.REPLACE_REPLICA});
    // ---- 7. THE CLASSIFICATION, as the matrix records it -----------------
    const classification = matrix.replaceClassification;
    assert.ok(classification.correctionToRound1.includes('misnomer'));
    assert.ok(classification.correctionToRound2.includes('serialization'),
      'the matrix records the round-2 correction to the chain reading');
    assert.equal(classification.handoffOverReplication,
      'implementation-artifact');
    assert.equal(classification.chainedReplacementOverReplication,
      'serialization-defect',
      'the chain is a serialization defect, never an availability mechanism');
    assert.equal(classification.budgetReliance, 'accidental');
    assert.equal(classification.guardInfersFromTopology, false);
    assert.ok(classification.isItASpreadCure.startsWith('PROVEN yes'));
    assert.ok(classification.censusDisagreementScope.includes(
      'is the only way the chain is reached'),
    'the matrix says the census disagreement IS what the chain needs');
    assert.ok(classification.quotedOwnerWords.some((quote) =>
      quote.includes('mutual-defer standoff')),
    'and quotes the serialization passage');
    assert.ok(classification.labAttribution.label === 'INFERRED',
      'the lab attribution of the second relocation is labelled INFERRED');
    assert.equal(classification.labAttribution.producerAttributed, false,
      'and attributes the lab lines to no producer at all');
    assert.equal(classification.labAttribution.settleMechanism,
      'owner_unavailable_released');
    // ---- 8. THE SPLIT, as the owner's rule 1 requires it -----------------
    // The admission class is TWO rows per partition class: the ordinary
    // hand-off overlap, which needs no budget, and the additional overlap
    // two membership views disagreeing produced, which is a consistency
    // finding and is never authorized.
    const handoffRows = matrix.rows.filter((row) =>
      row.id.endsWith('-relocation-handoff-overlap'));
    const disagreementRows = matrix.rows.filter((row) =>
      row.id.endsWith('-relocation-census-disagreement-overlap'));
    assert.equal(handoffRows.length, 2);
    assert.equal(disagreementRows.length, 2);
    for (const row of handoffRows) {
      assert.equal(row.semanticOwner,
        'src/rebalancer/unified-rebalancer-follow-up-move.js');
      assert.equal(row.currentBudgetDependency, 'does_not_depend',
        'the ordinary hand-off overlap is covered by the replacement ' +
          'allowance and needs no budget');
      assert.ok(row.budgetIndependenceMeasurement.statesInWhichItHolds
        .length > 0, 'with a differential over the complete stated domain');
      assert.equal(row.proposedAuthorizationKind, 'none',
        'mechanism is not authority: no separate kind is proposed');
    }
    for (const row of disagreementRows) {
      assert.equal(row.enforcementDisposition, 'still-unclassified');
      assert.equal(row.currentBudgetDependency, 'depends');
      assert.equal(row.semanticOwner, 'none_identified');
      assert.equal(row.proposedAuthorizationKind, 'none');
      assert.equal(row.requirementToClassify,
        'determine whether the two membership views are allowed to ' +
        'disagree in this state; if not, repair the owner/census boundary ' +
        'rather than authorize the resulting second transition',
        'and it carries the owner\'s requirement verbatim');
      assert.equal(row.repairGroup, 'resolve-membership-census-disagreement');
    }
    // ---- 9. THE RECEIPTS THIS DRIVE IS THE WITNESS FOR -------------------
    // What the RUN observed: which owner was driven, on which partition,
    // what the real builder produced, and that the state it created is a
    // relocation hand-off the guard admits with the budget at zero. No row
    // is read; which rows may cite this is the validator's question.
    const witness = {file: THIS_FILE, test: THIS_TEST};
    const emitted = [
      producerReachabilityReceipt({
        producerId: RELOCATION_PRODUCER,
        partitionId: PARTITION_ID,
        observedOperationType: String(firstRelocation.type).toUpperCase(),
        witness,
        facts: {
          moveReason: firstRelocation.reason,
          sourceNodeId: firstRelocation.sourceNodeId,
          operationReplicaId: firstRow.replica_id,
          operationSourceNodeId: createdRow.source_node_id,
          chainedFollowUpMoveState: secondRelocation.followUpMoveState,
          priorTargetActiveSuppresses: activePrior.type === undefined,
          activeVoterCountAtTheGuard: granted.observation.activeVoterCount,
          grantedWithBudget: granted.granted,
          grantedWithBudgetForcedToZero: refused.granted,
        },
      }),
      guardStateDriveReceipt({
        producerId: RELOCATION_PRODUCER,
        partitionId: PARTITION_ID,
        witness,
        facts: {
          activeVoterCountAtTheGuard: granted.observation.activeVoterCount,
          budgetAtTheGuard: granted.observation.temporaryOverflowVoterBudget,
          decidedWithBudget: granted.granted,
          decidedWithBudgetForcedToZero: refused.granted,
        },
      }),
      sliceProvenanceReceipt({
        sliceId: HANDOFF_SLICE,
        producerId: RELOCATION_PRODUCER,
        partitionId: PARTITION_ID,
        observedOperationType: String(firstRelocation.type).toUpperCase(),
        witness,
        facts: {
          voterCensusEqualsTarget:
            handoff.observation.activeVoterCount === TARGET,
          learnerOwnsTheOperation: firstRow.target_node_id !== undefined,
          admittedWithBudgetForcedToZero: handoff.granted,
        },
      }),
    ];
    emitAndAssertReceipts(EMIT_KEY, emitted);
  });
