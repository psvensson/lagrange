// AUDIT-WITNESS-KIND: guard-grid
// This file drives owners over constructed states. It proves GUARD
// behaviour, never that a production producer can reach that state.
// The three carried-forward details the carry stage's verification left for
// this audit, each settled as a test-backed FINDING and not as a fix (quest
// critical-spread-overflow-budget-audit, receipt
// carried-forward-details-settled-as-findings).
//
//   1. when the partition row's declared replication authority is read, and
//      whether it can change between the mint and the promotion;
//   2. whether the operation or record TYPE is part of authority identity;
//   3. what quantity the authorized count actually bounds.
//
// Nothing is renamed, moved or bound here. The proposals are the owner's to
// take.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyOverTargetCapAddRetention,
} from '../../src/rebalancer/move-planner-priority-spread-cure.js';
import {
  SPREAD_CURE_TRANSITION_AUTHORIZATION_MOVE_FIELD,
  evaluateSpreadCureTransitionAuthorization,
  decodeSpreadCureTransitionAuthorizationFromOperationRow,
  stampSpreadCureTransitionAuthorization,
} from '../../src/rebalancer/spread-cure-transition-authorization.js';
import {
  buildReplicaInventorySnapshot,
} from '../../src/rebalancer/replica-inventory.js';
import {OperationType, ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {MOVE_REASON} from '../../src/rebalancer/rebalancer-constants.js';
import {
  MATRIX_JSON,
  readJsonArtifact,
} from './overflow-budget-audit-support.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

if (!ConfigurationManager.getInstance().isInitialized()) {
  ConfigurationManager.getInstance().initialize({});
}
if (!LoggingService.getInstance().isInitialized()) {
  LoggingService.getInstance().initialize({level: 'error'});
}

const MOVE_FIELD = SPREAD_CURE_TRANSITION_AUTHORIZATION_MOVE_FIELD;
const PARTITION_ID = 'sql_transactions-p1';
const TARGET = 3;
const RAISED_TARGET = 5;
const OBSERVED_EPOCH = 4;
const DESTINATION_NODE_ID = 'node-c';
const DESTINATION_REPLICA_ID = `${PARTITION_ID}-r5`;
const ADD_OPERATION_ID = 'op-add';
const SUCCESSOR_OPERATION_ID = 'op-successor';
const RF_MISMATCH = 'authorization_desired_rf_mismatch';
const OPERATION_MISMATCH = 'authorization_operation_mismatch';
const HONOURED = 'authorization_honoured';
const LEADER = 'leader';
const FOLLOWER = 'follower';

function replicaOn(nodeId) {
  return {node_id: nodeId};
}

function mintOverTargetCure(resolvePartitionRow, observedMembershipEpoch) {
  const addMoves = [{type: 'add', nodeId: DESTINATION_NODE_ID,
    reason: MOVE_REASON.INCREASE_REPLICA_COUNT}];
  applyOverTargetCapAddRetention({
    partitionId: PARTITION_ID,
    addMoves,
    activePlacementReplicas: [replicaOn('node-a'), replicaOn('node-a'),
      replicaOn('node-b'), replicaOn('node-b')],
    inFlightReplaceCount: 0,
    surplusVoterCount: 4,
    targetNodeIds: ['node-a', 'node-b', 'node-c'],
    targetReplicaCount: TARGET,
    resolvePartitionRow,
    observedMembershipEpoch,
  });
  return addMoves[0][MOVE_FIELD] ?? null;
}

function stampedRow(authorization, operationId, type) {
  const operation = {stepsHistory: [{step: 'ADD_REPLICA'}]};
  stampSpreadCureTransitionAuthorization(operation, {
    authorization,
    destinationReplicaId: DESTINATION_REPLICA_ID,
    operationId,
  });
  return {
    operation_id: operationId,
    partition_id: PARTITION_ID,
    type,
    steps_history: JSON.stringify(operation.stepsHistory),
  };
}

function evaluateRow(row, partitionDesiredReplicationFactor) {
  return evaluateSpreadCureTransitionAuthorization({
    binding: decodeSpreadCureTransitionAuthorizationFromOperationRow(row),
    operationId: row.operation_id,
    localNodeId: DESTINATION_NODE_ID,
    localReplicaId: DESTINATION_REPLICA_ID,
    partitionDesiredReplicationFactor,
    // The fence is supplied here so the outcome is the COMPLETE honoured
    // one; the carry stage's guard supplies none, which is its own finding.
    partitionMembershipEpoch: OBSERVED_EPOCH,
    votersAfterPromotion: 5,
  });
}

function inventoryRow(index, nodeId, status, raftRole) {
  return {replica_id: `${PARTITION_ID}-r${index}`, partition_id: PARTITION_ID,
    node_id: nodeId, status, raft_role: raftRole};
}

test('the partition-row read, the row type and the authorized count are settled',
  () => {
    const matrix = readJsonArtifact(MATRIX_JSON);
    const findings = matrix.carriedForwardFindings;
    assert.ok(findings, 'the matrix carries the three findings');

    // ---- 1. THE PARTITION-ROW READ'S TIMING -------------------------------
    // The row is read at MINT time, inside the policy owner, and it is read
    // even when nothing is minted: the resolver is called once for a plan
    // that reaches the cure condition and then fails to mint.
    let resolverCalls = 0;
    const countingResolver = (replicaCount) => () => {
      resolverCalls += 1;
      return {partition_id: PARTITION_ID, replica_count: replicaCount};
    };
    const minted = mintOverTargetCure(countingResolver(TARGET), OBSERVED_EPOCH);
    assert.ok(minted, 'the mint reads the row and states its factor');
    assert.equal(minted.desiredReplicationFactor, TARGET);
    assert.equal(resolverCalls, 1, 'the row is read exactly once per mint');
    resolverCalls = 0;
    assert.equal(mintOverTargetCure(countingResolver(TARGET), null), null,
      'nothing is minted when the planner has no epoch');
    assert.equal(resolverCalls, 1,
      'but the row was READ anyway: the resolver is called when the cure ' +
        'condition holds, not when a record is produced');
    // The window: the guard re-reads the partition row at promotion time, so
    // a row whose replica_count changed between the two reads turns a valid
    // authorization into a refusal. The direction is FAIL-CLOSED - it never
    // grants a transition the row no longer declares.
    const row = stampedRow(minted, ADD_OPERATION_ID, OperationType.ADD);
    assert.equal(evaluateRow(row, TARGET).reason, HONOURED);
    assert.equal(evaluateRow(row, RAISED_TARGET).reason, RF_MISMATCH,
      'a partition row changed after the mint refuses, never grants');
    assert.equal(findings.partitionRowReadTiming.failureDirection,
      'fail-closed');
    assert.equal(findings.partitionRowReadTiming.movingTheReadClosesTheWindow,
      false);

    // ---- 2. IS THE ROW TYPE PART OF AUTHORITY IDENTITY? -------------------
    // An authorization minted for an ADD, carried on a REPLACE row with the
    // same operation id and destination, is honoured: the evaluation never
    // looks at the type.
    const replaceRow =
      stampedRow(minted, ADD_OPERATION_ID, OperationType.REPLACE);
    assert.equal(evaluateRow(replaceRow, TARGET).reason, HONOURED,
      'the evaluation ignores the operation type entirely');
    assert.deepEqual(
      {...evaluateRow(replaceRow, TARGET)},
      {...evaluateRow(row, TARGET)},
      'an ADD row and a REPLACE row carrying the same record evaluate ' +
        'identically');
    // A record reused across a RE-CREATED operation is caught, but only
    // because the successor carries a new operation id - not because it is a
    // different type.
    const successorRow =
      stampedRow(minted, SUCCESSOR_OPERATION_ID, OperationType.REPLACE);
    assert.equal(
      evaluateSpreadCureTransitionAuthorization({
        binding: decodeSpreadCureTransitionAuthorizationFromOperationRow(
          successorRow),
        operationId: SUCCESSOR_OPERATION_ID,
        localNodeId: DESTINATION_NODE_ID,
        localReplicaId: DESTINATION_REPLICA_ID,
        partitionDesiredReplicationFactor: TARGET,
        partitionMembershipEpoch: OBSERVED_EPOCH,
        votersAfterPromotion: 5,
      }).reason, HONOURED,
      'a record re-stamped onto a successor operation is honoured for it');
    assert.equal(
      evaluateSpreadCureTransitionAuthorization({
        binding: decodeSpreadCureTransitionAuthorizationFromOperationRow(row),
        operationId: SUCCESSOR_OPERATION_ID,
        localNodeId: DESTINATION_NODE_ID,
        localReplicaId: DESTINATION_REPLICA_ID,
        partitionDesiredReplicationFactor: TARGET,
        partitionMembershipEpoch: OBSERVED_EPOCH,
        votersAfterPromotion: 5,
      }).reason, OPERATION_MISMATCH,
      'a record naming the OLD operation is refused for the successor');
    assert.equal(findings.rowTypeIdentity.typeIsCheckedToday, false);
    assert.equal(findings.rowTypeIdentity.recommendation,
      'bind-the-type-before-a-second-kind-exists');

    // ---- 3. WHAT THE AUTHORIZED COUNT BOUNDS ------------------------------
    // The mint states observedVoterCount = the planner's surplusVoterCount,
    // which is max(active count, active voter count). The two terms differ
    // in the promotion window, and the authorized bound inherits the max.
    const promotionWindow = buildReplicaInventorySnapshot({
      entityType: 'partition', entityId: PARTITION_ID,
      committedRowsObservation: {rows: [
        inventoryRow(1, 'node-a', ReplicaStatus.ACTIVE, LEADER),
        inventoryRow(2, 'node-a', ReplicaStatus.ACTIVE, FOLLOWER),
        inventoryRow(3, 'node-b', ReplicaStatus.ACTIVE, FOLLOWER),
        inventoryRow(4, 'node-b', ReplicaStatus.SYNCING, FOLLOWER),
      ]},
      inFlightOperationObservation: {operations: []},
      capturedAtMs: 1,
    });
    assert.equal(promotionWindow.accounting.activeCount, 3);
    assert.equal(promotionWindow.accounting.activeVoterCount, 4);
    assert.notEqual(promotionWindow.accounting.activeCount,
      promotionWindow.accounting.activeVoterCount,
      'the two terms of the max differ in the promotion window');
    // A row that is ACTIVE by status but NOT a voter is the other direction:
    // it inflates activeCount above activeVoterCount, so the max is not a
    // voter census either way.
    const activeNonVoter = buildReplicaInventorySnapshot({
      entityType: 'partition', entityId: PARTITION_ID,
      committedRowsObservation: {rows: [
        inventoryRow(1, 'node-a', ReplicaStatus.ACTIVE, LEADER),
        inventoryRow(2, 'node-a', ReplicaStatus.ACTIVE, FOLLOWER),
        inventoryRow(3, 'node-b', ReplicaStatus.ACTIVE, FOLLOWER),
        inventoryRow(4, 'node-b', ReplicaStatus.ACTIVE, 'learner'),
      ]},
      inFlightOperationObservation: {operations: []},
      capturedAtMs: 1,
    });
    assert.equal(activeNonVoter.accounting.activeCount, 4);
    assert.equal(activeNonVoter.accounting.activeVoterCount, 3);
    assert.ok(Math.max(activeNonVoter.accounting.activeCount,
      activeNonVoter.accounting.activeVoterCount) >
      activeNonVoter.accounting.activeVoterCount,
    'an active non-voter inflates the max above the voter census');
    // The minted bound is that max plus one, so it is not a voter bound.
    assert.equal(minted.observedVoterCount, 4);
    assert.equal(minted.authorizedResultingVoterCount, 5);
    // The owner's decision 6 asks for an adversarial case where the two
    // views disagree in membership IDENTITY, not only in count, so that the
    // max may undercount the UNION. It exists, and the real inventory owner
    // computes it itself.
    const disjointIdentities = buildReplicaInventorySnapshot({
      entityType: 'partition', entityId: PARTITION_ID,
      committedRowsObservation: {rows: [
        inventoryRow(1, 'node-a', ReplicaStatus.ACTIVE, 'learner'),
        inventoryRow(2, 'node-b', ReplicaStatus.ACTIVE, 'learner'),
        inventoryRow(3, 'node-c', ReplicaStatus.SYNCING, FOLLOWER),
        inventoryRow(4, 'node-d', ReplicaStatus.SYNCING, FOLLOWER),
      ]},
      inFlightOperationObservation: {operations: []},
      capturedAtMs: 1,
    });
    assert.equal(disjointIdentities.accounting.activeCount, 2);
    assert.equal(disjointIdentities.accounting.activeVoterCount, 2);
    assert.deepEqual([...disjointIdentities.voterReplicaIds].sort(),
      [`${PARTITION_ID}-r3`, `${PARTITION_ID}-r4`]);
    assert.deepEqual([...disjointIdentities.learnerReplicaIds].sort(),
      [`${PARTITION_ID}-r1`, `${PARTITION_ID}-r2`],
      'the two views count the same NUMBER of replicas and none of the ' +
        'same ones');
    assert.equal(Math.max(disjointIdentities.accounting.activeCount,
      disjointIdentities.accounting.activeVoterCount), 2);
    assert.equal(disjointIdentities.accounting.occupiedCount, 4,
      'while the owner\'s own occupied count says four replicas hold this ' +
        'partition: the max undercounts the union by two');
    assert.equal(findings.authorizedCount.membershipIdentityDisagreement
      .maxUndercountsTheUnionBy, 2,
    'and the matrix records that adversarial case as a finding');
    assert.equal(findings.authorizedCount.boundedQuantity,
      'effective-membership-during-transition');
    assert.equal(findings.authorizedCount.isAVoterCensus, false);
    assert.ok(findings.authorizedCount.nameHypothesis,
      'the name is recorded as a LABELLED HYPOTHESIS');
    assert.ok(findings.authorizedCount.nameHypothesisLabel
      .includes('not a proposal of record'),
    'and never as a proposal of record: the owner\'s decision 9 forbids ' +
      'choosing a formula or a name in this audit');
    assert.equal(matrix.membershipCeiling.status, 'not-established');
    assert.equal(matrix.membershipCeiling.setIdentityCasesForTheLaterQuest
      .length, 5, 'the five set-identity cases are recorded for the later ' +
      'membership-ceiling quest');
  });
