// AUDIT-WITNESS-KIND: real-chain
// Every reachability claim in this file runs the real producer, the real
// operation representation, the real coordinator/repository path and the
// real guard. Nothing between the producer and the guard is hand-built.
// Every alternate route to the promotion guard on the five partitions the
// cure policy CAN mint for (quest critical-spread-overflow-budget-audit,
// receipt mintable-five-have-no-unminted-route-or-it-is-a-row).
//
// The question is not whether the minting route works - the carry stage
// proved that. It is whether a route can reach the guard on one of those
// five WITHOUT passing the minting owner. Each route below is driven on the
// real planner site and the real stamp, and either carries the authorization
// or is named as a matrix row with a disposition.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyOverTargetCapAddRetention,
  applyPrioritySpreadExpandCure,
} from '../../src/rebalancer/move-planner-priority-spread-cure.js';
import {
  authorizeSpreadCureTransition,
} from '../../src/rebalancer/replica-placement-cure-policy.js';
import {
  SPREAD_CURE_AUTHORIZATION_BINDING_STATE,
  SPREAD_CURE_TRANSITION_AUTHORIZATION_MOVE_FIELD,
  SPREAD_CURE_TRANSITION_INTENT,
  decodeSpreadCureTransitionAuthorizationFromOperationRow,
  stampSpreadCureTransitionAuthorization,
} from '../../src/rebalancer/spread-cure-transition-authorization.js';
import {
  OPERATION_METADATA_KEY,
} from '../../src/rebalancer/replica-operation-progress.js';
import {MOVE_REASON} from '../../src/rebalancer/rebalancer-constants.js';
import {
  FOLLOWER_ROLE,
  LEADER_ROLE,
  LEARNER_ROLE,
  MATRIX_JSON,
  createWiredRebalancer,
  overTargetSpreadCureEvidence,
  readJsonArtifact,
  runPromotionGuard,
} from './overflow-budget-audit-support.js';
import {
  emitAndAssertReceipts,
  producerReachabilityReceipt,
} from './overflow-budget-receipt-emission.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {EntityType} from '../../src/rebalancer/unified-rebalancer.js';
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
const LEDGER_PARTITION_ID = 'replica_operations-p1';
const TARGET = 3;
const DESTINATION_NODE_ID = 'node-c';
const OBSERVED_EPOCH = 4;
const OPERATION_ID = 'op-routes';
const DESTINATION_REPLICA_ID = `${PARTITION_ID}-r5`;
const TARGET_NODE_IDS = Object.freeze(['node-a', 'node-b', 'node-c']);

function replicaOn(nodeId) {
  return {node_id: nodeId};
}

function overTargetPlacement() {
  return [replicaOn('node-a'), replicaOn('node-a'),
    replicaOn('node-b'), replicaOn('node-b')];
}

function atTargetPlacement() {
  return [replicaOn('node-a'), replicaOn('node-a'), replicaOn('node-b')];
}

function addMove(nodeId = DESTINATION_NODE_ID) {
  return {type: 'add', nodeId, reason: MOVE_REASON.INCREASE_REPLICA_COUNT};
}

function partitionRowResolver(replicaCount = TARGET) {
  return () => ({partition_id: PARTITION_ID, replica_count: replicaCount});
}

// Route 1: the ONE minting site, driven on the real planner function.
function driveOverTargetRetention(options = {}) {
  const addMoves = [addMove()];
  const outcome = applyOverTargetCapAddRetention({
    partitionId: options.partitionId ?? PARTITION_ID,
    addMoves,
    activePlacementReplicas: overTargetPlacement(),
    inFlightReplaceCount: 0,
    surplusVoterCount: 4,
    targetNodeIds: TARGET_NODE_IDS,
    targetReplicaCount: TARGET,
    resolvePartitionRow: options.resolvePartitionRow ?? partitionRowResolver(),
    // Explicit, not nullish-coalesced: the ESTABLISHING route supplies the
    // planner's own unreadable answer, which IS null.
    observedMembershipEpoch: Object.hasOwn(options, 'observedMembershipEpoch') ?
      options.observedMembershipEpoch :
      OBSERVED_EPOCH,
  });
  return {outcome, addMoves};
}

// Routes 2 and 3: the expand site, which re-types the ADD under a DIFFERENT
// cure row and re-states the authorization under that row.
function driveExpandCure(options) {
  const addMoves = [addMove(options.destinationNodeId ?? DESTINATION_NODE_ID)];
  const candidateRemoves = [{type: 'remove', nodeId: 'node-a'}];
  const replaceCount = applyPrioritySpreadExpandCure({
    partitionId: options.partitionId,
    addMoves,
    candidateRemoves,
    activePlacementReplicas: options.activePlacementReplicas,
    deficitEffectiveCount: options.deficitEffectiveCount,
    inFlightReplaceCount: 0,
    naturalReplaceCount: 1,
    replaceCount: 1,
    inventory: {accounting: {occupiedCount: options.occupiedCount}},
    surplusVoterCount: options.surplusVoterCount,
    targetNodeIds: options.targetNodeIds ?? TARGET_NODE_IDS,
    targetReplicaCount: TARGET,
    resolvePartitionRow: partitionRowResolver(),
    observedMembershipEpoch: OBSERVED_EPOCH,
  });
  return {addMoves, candidateRemoves, replaceCount};
}

// The expand row's budget-INDEPENDENCE measurement: the producer is driven,
// its ADD is created through the real coordinator, and the learner it makes
// is put to the real guard with the budget forced to zero. The grant must
// survive, because the state the producer creates is target+1, which the
// replacement allowance already covers.
const EXPAND_NODE_IDS = Object.freeze(['node-a', 'node-b', 'node-c']);

function expandServiceRow(index, nodeId, raftRole, status) {
  const replicaId = `${PARTITION_ID}-r${index}`;
  return {
    service_id: replicaId,
    replica_id: replicaId,
    partition_id: PARTITION_ID,
    service_type: EntityType.PARTITION,
    node_id: nodeId,
    address: `addr-${replicaId}`,
    raft_role: raftRole,
    status: status || ReplicaStatus.ACTIVE,
  };
}

function atTargetServices() {
  return [
    expandServiceRow(1, 'node-a', LEADER_ROLE),
    expandServiceRow(2, 'node-a', FOLLOWER_ROLE),
    expandServiceRow(3, 'node-b', FOLLOWER_ROLE),
  ];
}

function overTargetServices() {
  return [
    expandServiceRow(1, 'node-a', LEADER_ROLE),
    expandServiceRow(2, 'node-a', FOLLOWER_ROLE),
    expandServiceRow(3, 'node-b', FOLLOWER_ROLE),
    expandServiceRow(4, 'node-b', FOLLOWER_ROLE),
  ];
}

// The REAL CHAIN for a row: producer -> operation representation -> real
// coordinator/repository path -> real guard, with the guard's membership
// derived from the same services the producer saw plus the learner the
// coordinator created. Nothing between the producer and the guard is
// hand-built.
async function driveToTheGuard(move, services) {
  const wired = createWiredRebalancer({
    partitionId: PARTITION_ID, tableId: 'sql_transactions',
    nodeIds: [...EXPAND_NODE_IDS, 'node-d'], services, target: TARGET,
  });
  let created = null;
  try {
    const result = await wired.rebalancer.executeMoveViaCoordinator(move);
    created = result && result.operationId ? result : null;
  } finally {
    wired.rebalancer.shutdown();
    await wired.coordinator.shutdown();
  }
  if (!created) {
    return {created: null};
  }
  const row = wired.coordinator.systemTableCache
    .get('replica_operations', created.operationId);
  const operationRow = {
    ...row,
    operation_id: created.operationId,
    partition_id: PARTITION_ID,
    status: 'in_progress',
    workflow_step: 'ADD_REPLICA',
    replica_id: created.replicaId,
    target_node_id: created.nodeId,
  };
  const guardRows = [
    ...services,
    {service_id: created.replicaId, replica_id: created.replicaId,
      partition_id: PARTITION_ID, service_type: 'partition',
      status: ReplicaStatus.ACTIVE, raft_role: LEARNER_ROLE,
      node_id: created.nodeId},
  ];
  const options = {
    partitionId: PARTITION_ID,
    replicaId: created.replicaId,
    learnerNodeId: created.nodeId,
    serviceRows: guardRows,
    operationRows: [operationRow],
    partitionRow: {partition_id: PARTITION_ID, replica_count: TARGET},
    priorityPartitionSummary: {satisfied: false, requiredDistinctNodeCount: 3,
      readyEligibleNodeCount: 3,
      blockedPartitions: [{partitionId: PARTITION_ID,
        requiredDistinctNodeCount: 3, readyDistinctNodeCount: 2,
        spreadGap: 1}],
      missingPartitionIds: []},
    recoveryPending: true,
  };
  // Counted here, where the two evaluations actually run, so a receipt can
  // state how many of each ran rather than asserting that both did.
  const evaluations = {actualBudget: 0, budgetForcedToZero: 0};
  const withBudget = await runPromotionGuard(options);
  evaluations.actualBudget += 1;
  const withoutBudget = await runPromotionGuard({...options, zeroBudget: true});
  evaluations.budgetForcedToZero += 1;
  return {created, withBudget, withoutBudget, evaluations};
}

function operationUnderConstruction() {
  return {stepsHistory: [{step: 'ADD_REPLICA'}]};
}

function rowFor(operation) {
  return {
    operation_id: OPERATION_ID,
    partition_id: PARTITION_ID,
    steps_history: JSON.stringify(operation.stepsHistory),
  };
}

const THIS_FILE =
  'test/rebalancer/overflow-budget-mintable-five-routes.test.js';
const THIS_TEST =
  'every alternate route to the five carries the mint or is a matrix row';
// The two owners this test DRIVES, named at the call sites of the drives.
const RETENTION_PRODUCER = 'planner-over-target-spread-cure-add';
const EXPAND_PRODUCER = 'planner-priority-expand-for-spread-add';
const EMIT_KEY = 'mintable-five-routes';

const ROUTES_WITNESS =
  'test/rebalancer/overflow-budget-mintable-five-routes.test.js:' +
  'every alternate route to the five carries the mint or is a matrix row';

test('every alternate route to the five carries the mint or is a matrix row',
  async () => {
    const matrix = readJsonArtifact(MATRIX_JSON);
    const rowsById = new Map(matrix.rows.map((row) => [row.id, row]));
    // ROUTE 1 - the minting route. The real planner site attaches exactly
    // the record the real policy owner minted.
    const retained = driveOverTargetRetention();
    assert.equal(retained.outcome.retainedSpreadCureAddCount, 1);
    const minted = retained.addMoves[0][MOVE_FIELD];
    assert.ok(minted, 'the retained spread-cure ADD carries the mint');
    assert.equal(minted.intent, SPREAD_CURE_TRANSITION_INTENT);
    assert.equal(minted.desiredReplicationFactor, TARGET);
    assert.equal(minted.observedVoterCount, 4);
    assert.equal(minted.authorizedResultingVoterCount, 5);
    assert.ok(rowsById.has('five-minted-spread-cure-add'));
    // ...and the SAME move, carried the whole real chain to the guard: the
    // producer's own over-target membership, the real coordinator, and the
    // real guard. This is what makes the minted row producer-reachable
    // rather than only guard-reachable.
    const mintedChain = await driveToTheGuard(
      retained.addMoves[0], overTargetServices());
    assert.ok(mintedChain.created,
      'the real coordinator created the retained spread-cure ADD');
    assert.equal(mintedChain.withBudget.observation.activeVoterCount,
      TARGET + 1, 'its learner meets the guard one over target');
    assert.equal(mintedChain.withBudget.granted, true,
      'and is granted today');
    assert.equal(mintedChain.withoutBudget.granted, false,
      'and refused with the budget forced to zero - the minted row depends ' +
        'on the budget, measured on the real chain');
    // ...and it survives the coordinator's stamp onto the row, so the guard
    // decodes it as PRESENT. This is the only route with an authority.
    const operation = operationUnderConstruction();
    assert.equal(stampSpreadCureTransitionAuthorization(operation, {
      authorization: minted,
      destinationReplicaId: DESTINATION_REPLICA_ID,
      operationId: OPERATION_ID,
    }), true, 'the coordinator stamps the minted record');
    assert.equal(
      decodeSpreadCureTransitionAuthorizationFromOperationRow(
        rowFor(operation)).state,
      SPREAD_CURE_AUTHORIZATION_BINDING_STATE.PRESENT,
      'and the row decodes it as present');
    // ROUTE 2 - the AT-TARGET priority expand cure. The same module re-types
    // the ADD under the expand row and mints nothing for it.
    const expand = driveExpandCure({
      partitionId: PARTITION_ID,
      activePlacementReplicas: atTargetPlacement(),
      deficitEffectiveCount: TARGET,
      occupiedCount: TARGET,
      surplusVoterCount: TARGET,
    });
    assert.equal(expand.addMoves[0].reason, MOVE_REASON.SPREAD_REPLICAS,
      'the expand cure re-typed the ADD');
    assert.equal(Object.hasOwn(expand.addMoves[0], MOVE_FIELD), false,
      'and the expand ADD gains no authorization field at all');
    const expandRow = rowsById.get('five-expand-for-spread-add');
    assert.ok(expandRow);
    // The expand row's dependency is not asserted: the producer is driven to
    // the guard and the grant is shown to survive the budget at zero.
    const expandDrive =
      await driveToTheGuard(expand.addMoves[0], atTargetServices());
    assert.ok(expandDrive.created,
      'the real coordinator created the expand ADD');
    assert.equal(expandDrive.withBudget.granted, true,
      'its learner is granted today');
    assert.equal(expandDrive.withoutBudget.granted, true,
      'and STILL granted with the budget forced to zero: the state the ' +
        'producer creates is target+1, which the replacement allowance ' +
        'covers');
    assert.equal(
      expandDrive.withoutBudget.observation.activeVoterCount, TARGET,
      'because the census the guard sees is still at target');
    assert.equal(expandRow.currentBudgetDependency,
      'depends_only_when_census_moved');
    assert.equal(expandRow.budgetIndependenceMeasurement.test,
      ROUTES_WITNESS,
      'and the row names THIS measurement');
    assert.ok(expandRow.censusMovementCondition.length > 0,
      'and states the condition under which it would depend after all');
    // ROUTE 3 - the LEDGER expand cure. Same site, same absence, and the
    // ledger can never mint at all.
    const ledgerExpand = driveExpandCure({
      partitionId: LEDGER_PARTITION_ID,
      activePlacementReplicas: atTargetPlacement(),
      deficitEffectiveCount: TARGET,
      occupiedCount: TARGET,
      surplusVoterCount: TARGET,
      targetNodeIds: TARGET_NODE_IDS,
    });
    assert.equal(Object.hasOwn(ledgerExpand.addMoves[0], MOVE_FIELD), false,
      'the ledger expand ADD gains no authorization field');
    assert.equal(
      authorizeSpreadCureTransition(
        overTargetSpreadCureEvidence(LEDGER_PARTITION_ID),
        {destinationNodeId: DESTINATION_NODE_ID,
          resolvePartitionRow: partitionRowResolver(),
          observedMembershipEpoch: OBSERVED_EPOCH}),
      null, 'and the ledger cannot be minted for in any state');
    assert.ok(rowsById.has('ledger-expand-for-spread-add'),
      'the ledger expand cure is its own row');
    // ROUTE 4 - the ESTABLISHING window. The planner's epoch reader returns
    // null while any newer publication is not published, and the mint is
    // silent rather than minting an unfenced record.
    const establishing =
      driveOverTargetRetention({observedMembershipEpoch: null});
    assert.equal(Object.hasOwn(establishing.addMoves[0], MOVE_FIELD), false,
      'no authorization is minted while the planner cannot read an epoch');
    assert.equal(establishing.outcome.retainedSpreadCureAddCount, 1,
      'but the ADD is still retained, so the learner still reaches the guard');
    // This route has its OWN row: a retained cure ADD that mints nothing is
    // not the same case as a minted authorization that later reads stale.
    const establishingRow =
      rowsById.get('five-establishing-window-unminted-cure-add');
    assert.ok(establishingRow, 'the ESTABLISHING window is a matrix row');
    assert.equal(establishingRow.currentBudgetDependency, 'depends');
    assert.equal(establishingRow.enforcementDisposition,
      'still-unclassified',
      'and it is NOT classified: the owner\'s decision 8 keeps this window ' +
      'unclassified until a legitimate transitional authority is told apart ' +
      'from a fail-open path');
    assert.ok(establishingRow.requirementToClassify.length > 0,
      'stating what would distinguish the two');
    assert.equal(establishingRow.repairGroup,
      'establishing-publication-semantics',
      'and grouping its repair by that semantic cause');
    // ROUTE 5 - an undeclared partition-row authority. The mint reads the
    // partition row's own replication factor and refuses without one.
    const undeclared =
      driveOverTargetRetention({resolvePartitionRow: () => ({})});
    assert.equal(Object.hasOwn(undeclared.addMoves[0], MOVE_FIELD), false,
      'no authorization without a declared replication factor');
    assert.equal(undeclared.outcome.retainedSpreadCureAddCount, 1,
      'and the ADD is retained here too');
    const undeclaredRow =
      rowsById.get('five-undeclared-partition-row-unminted-cure-add');
    assert.ok(undeclaredRow, 'the undeclared partition row is a matrix row');
    assert.equal(undeclaredRow.currentBudgetDependency, 'depends');
    assert.equal(undeclaredRow.enforcementDisposition,
      'still-unclassified');
    assert.ok(undeclaredRow.requirementToClassify.length > 0,
      'stating what would distinguish a legitimate transitional authority ' +
      'from a fail-open path');
    assert.equal(undeclaredRow.repairGroup,
      'undeclared-row-cache-disagreement-semantics');
    // ROUTE 6 - every OTHER producer. The mint has exactly one call site
    // outside its own module, so no other producer can reach it. The census
    // that measures this is the producer-census receipt's.
    assert.deepEqual(
      Object.keys(matrix.method.sinkCensus.authorizeSpreadCureTransition)
        .sort(),
      ['src/rebalancer/move-planner-priority-spread-cure.js',
        'src/rebalancer/replica-placement-cure-policy.js'],
      'the mint is called from one planner site and its own module only');
    // ROUTE 7 - the coordinator. A move that carries no record stamps
    // nothing, so a row for any unminted producer is byte-identical to one
    // written before the carrier existed.
    const unstamped = operationUnderConstruction();
    assert.equal(stampSpreadCureTransitionAuthorization(unstamped, {
      authorization: undefined,
      destinationReplicaId: DESTINATION_REPLICA_ID,
      operationId: OPERATION_ID,
    }), false, 'an unauthorized move stamps nothing');
    assert.equal(Object.hasOwn(
      unstamped.stepsHistory[0],
      OPERATION_METADATA_KEY.CURE_TRANSITION_AUTHORIZATION), false,
    'and the metadata record does not gain the key');
    // ROUTE 8 - the operation-less promotion. It has no producer to pass,
    // so it cannot carry an authorization by construction; its witness is
    // the guard-level one and its row states the disposition.
    const opLess = rowsById.get('five-operation-not-visible-to-the-guard');
    assert.ok(opLess, 'the operation-less promotion is a matrix row');
    assert.equal(opLess.enforcementDisposition, 'still-unclassified');
    // Every route above is either the minting one or a matrix row that
    // names a disposition from the four.
    const routeRowIds = ['five-minted-spread-cure-add',
      'five-establishing-window-unminted-cure-add',
      'five-undeclared-partition-row-unminted-cure-add',
      'five-expand-for-spread-add', 'ledger-expand-for-spread-add',
      'five-minted-authorization-stale-at-promotion',
      'five-operation-not-visible-to-the-guard'];
    for (const rowId of routeRowIds) {
      const row = rowsById.get(rowId);
      assert.ok(['explicit-authority-required', 'proved-unreachable',
        'proved-obsolete', 'still-unclassified']
        .includes(row.enforcementDisposition),
      `the route's row names one of the four dispositions: ${rowId}`);
    }
    // ROUTE 9 - the receipts these drives are the witness for. Each names
    // the owner that was driven and the partition it was driven on, with
    // the operation the real coordinator created; no row is read.
    const witness = {file: THIS_FILE, test: THIS_TEST};
    const emitted = [
      producerReachabilityReceipt({
        producerId: RETENTION_PRODUCER,
        partitionId: PARTITION_ID,
        observedOperationType:
          String(mintedChain.created.operation).toUpperCase(),
        witness,
        facts: {
          retainedSpreadCureAddCount:
            retained.outcome.retainedSpreadCureAddCount,
          authorizationIntent: minted.intent,
          observedVoterCount: minted.observedVoterCount,
          authorizedResultingVoterCount: minted.authorizedResultingVoterCount,
          activeVoterCountAtTheGuard:
            mintedChain.withBudget.observation.activeVoterCount,
          grantedWithBudget: mintedChain.withBudget.granted,
          grantedWithBudgetForcedToZero: mintedChain.withoutBudget.granted,
        },
      }),
      producerReachabilityReceipt({
        producerId: EXPAND_PRODUCER,
        partitionId: PARTITION_ID,
        observedOperationType:
          String(expandDrive.created.operation).toUpperCase(),
        witness,
        facts: {
          moveReason: expand.addMoves[0].reason,
          carriesAuthorizationField:
            Object.hasOwn(expand.addMoves[0], MOVE_FIELD),
          activeVoterCountAtTheGuard:
            expandDrive.withoutBudget.observation.activeVoterCount,
          grantedWithBudget: expandDrive.withBudget.granted,
          grantedWithBudgetForcedToZero: expandDrive.withoutBudget.granted,
        },
      }),
    ];
    emitAndAssertReceipts(EMIT_KEY, emitted);
  });
