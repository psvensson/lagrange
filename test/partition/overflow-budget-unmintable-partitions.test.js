// AUDIT-WITNESS-KIND: guard-grid
// This file drives owners over constructed states. It proves GUARD
// behaviour, never that a production producer can reach that state.
// Every bootstrap-critical partition the cure policy cannot mint for, audited
// on the REAL promotion guard (quest critical-spread-overflow-budget-audit,
// receipt every-unmintable-partition-is-audited).
//
// The grid below IS the exhaustive domain the proved-unreachable rows state.
// It drives the real learner-promotion methods bag, the real priority-recovery
// completion owner and the real count check over every declared system-table
// partition, and compares each state against a DOUBLE of the completion owner
// whose budget is forced to zero. Nothing in src changes.
//
// A partition, a readiness shape or a summary shape added later moves this
// grid, so the dispositions cannot quietly go stale.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  INITIAL_PARTITION_IDS,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  evaluateLearnerPromotionCountCheck,
} from '../../src/partition/learner-promotion-count-check.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {
  FOLLOWER_ROLE,
  LEADER_ROLE,
  LEARNER_ROLE,
  MATRIX_JSON,
  createPromotionGuardContext,
  guardServiceRow,
  measurePartitionSets,
  readJsonArtifact,
  runPromotionGuard,
} from '../rebalancer/overflow-budget-audit-support.js';
import {
  emitAndAssertReceipts,
  guardReachabilityReceipt,
  sliceDifferentialReceipt,
  sliceMatcher,
} from '../rebalancer/overflow-budget-receipt-emission.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

if (!ConfigurationManager.getInstance().isInitialized()) {
  ConfigurationManager.getInstance().initialize({});
}
if (!LoggingService.getInstance().isInitialized()) {
  LoggingService.getInstance().initialize({level: 'error'});
}

// The stated domain. The matrix's proved-unreachable rows name this grid and
// these ranges; the validator checks that they do.
const GRID = Object.freeze({
  voters: Object.freeze([1, 2, 3, 4, 5, 6, 7]),
  learners: Object.freeze([1, 2, 3]),
  targets: Object.freeze([1, 2, 3, 4, 5]),
  operations: Object.freeze([0, 1, 2]),
  summaries: Object.freeze(
    ['absent', 'null', 'satisfied', 'gapSelf', 'gapOther', 'missing']),
  recoveryPending: Object.freeze([true, false]),
  joining: Object.freeze([true, false]),
  operationTypes: Object.freeze([OperationType.ADD, OperationType.REPLACE]),
  ownedByThisLearner: Object.freeze([true, false]),
});
const LEARNER_NODE_ID = 'node-L';
const OTHER_PARTITION_ID = 'schema_operations-p1';
const REQUIRED_DISTINCT_NODE_COUNT = 3;
const NO_BUDGET = 0;
const TARGET_REPLICA_COUNT = 3;
const OVER_TARGET_VOTER_COUNT = 4;
const WOULD_EXCEED = 'would_exceed_target_replica_count';
const THIS_FILE = 'test/partition/overflow-budget-unmintable-partitions.test.js';
const THIS_TEST =
  'every unmintable admitted partition is audited on the real guard';
const EMIT_KEY = 'unmintable-partitions';
// The slices this grid enumerates. The PREDICATE is the registry's, so a
// receipt speaks for exactly the states the registry describes - this file
// does not get to decide what "the hand-off states" means.
const MEASURED_SLICES = Object.freeze(['whole-stated-grid',
  'relocation-handoff', 'census-moved', 'producer-add-at-target']);
const SLICE_MATCHERS = Object.freeze(MEASURED_SLICES
  .map((sliceId) => Object.freeze({sliceId, matches: sliceMatcher(sliceId)})));

function emptySliceCounters() {
  return {statesEnumerated: 0, evaluationsWithActualBudget: 0,
    evaluationsWithBudgetForcedToZero: 0, admissionDifferences: 0,
    statesWhereTheCompletionOwnerWasConsulted: 0,
    statesWithANonZeroBudget: 0, budgetAdmittedStates: 0};
}

// The receipts this grid is the witness for. It reads NO matrix row: it
// emits what it measured, per slice and per partition, and the kind of each
// receipt follows from the numbers. Which rows may cite which of these is
// the validator's question, not this file's.
function gridReceipts(bySliceByPartition) {
  const witness = {file: THIS_FILE, test: THIS_TEST};
  const receipts = [];
  for (const [partitionId, bySlice] of Object.entries(bySliceByPartition)) {
    for (const sliceId of MEASURED_SLICES) {
      receipts.push(sliceDifferentialReceipt({
        partitionId, sliceId, witness, result: bySlice[sliceId],
      }));
    }
    const whole = bySlice['whole-stated-grid'];
    if (whole.statesWhereTheCompletionOwnerWasConsulted > 0) {
      receipts.push(guardReachabilityReceipt({
        partitionId, witness, result: whole,
      }));
    }
  }
  return receipts;
}

function spreadGap(partitionId) {
  return {
    satisfied: false,
    requiredDistinctNodeCount: REQUIRED_DISTINCT_NODE_COUNT,
    readyEligibleNodeCount: REQUIRED_DISTINCT_NODE_COUNT,
    blockedPartitions: [{partitionId,
      requiredDistinctNodeCount: REQUIRED_DISTINCT_NODE_COUNT,
      readyDistinctNodeCount: 2, spreadGap: 1}],
    missingPartitionIds: [],
  };
}

// Six summary shapes. `gapOther` is the cross-partition one: the summary is
// read whole, so ANOTHER partition's spread gap switches the budget on for
// this one.
function summaryFor(kind, partitionId) {
  if (kind === 'absent') {
    return undefined;
  }
  if (kind === 'null') {
    return null;
  }
  if (kind === 'satisfied') {
    return {satisfied: true,
      requiredDistinctNodeCount: REQUIRED_DISTINCT_NODE_COUNT,
      readyEligibleNodeCount: REQUIRED_DISTINCT_NODE_COUNT,
      blockedPartitions: [], missingPartitionIds: []};
  }
  if (kind === 'gapSelf') {
    return spreadGap(partitionId);
  }
  if (kind === 'gapOther') {
    return spreadGap(OTHER_PARTITION_ID);
  }
  return {satisfied: false,
    requiredDistinctNodeCount: REQUIRED_DISTINCT_NODE_COUNT,
    readyEligibleNodeCount: REQUIRED_DISTINCT_NODE_COUNT,
    blockedPartitions: [], missingPartitionIds: [partitionId]};
}

function membershipRows(partitionId, voters, learners) {
  const rows = [];
  for (let index = 1; index <= voters; index += 1) {
    rows.push(guardServiceRow(partitionId, index, `node-${index % 3}`,
      index === 1 ? LEADER_ROLE : FOLLOWER_ROLE));
  }
  rows.push(guardServiceRow(partitionId, 99, LEARNER_NODE_ID, LEARNER_ROLE));
  for (let extra = 1; extra < learners; extra += 1) {
    rows.push(guardServiceRow(partitionId, 100 + extra, `node-x${extra}`,
      LEARNER_ROLE));
  }
  return rows;
}

function operationRows(partitionId, count, operationType, owned) {
  const rows = [];
  for (let index = 0; index < count; index += 1) {
    const mine = owned && index === 0;
    rows.push({
      operation_id: `op-${index}`,
      partition_id: partitionId,
      type: operationType,
      status: 'in_progress',
      workflow_step: 'ADD_REPLICA',
      replica_id: mine ? `${partitionId}-r99` : `${partitionId}-r${100 + index}`,
      target_node_id: mine ? LEARNER_NODE_ID : `node-x${index}`,
    });
  }
  return rows;
}

function stateOptions(partitionId, state) {
  return {
    partitionId,
    serviceRows: membershipRows(partitionId, state.voters, state.learners),
    operationRows: operationRows(partitionId, state.operations,
      state.operationType, state.owned),
    partitionRow: {partition_id: partitionId, replica_count: state.target},
    priorityPartitionSummary: summaryFor(state.summary, partitionId),
    recoveryPending: state.recoveryPending,
    isJoiningExistingGroup: state.joining,
  };
}

function* gridStates() {
  for (const voters of GRID.voters) {
    for (const learners of GRID.learners) {
      for (const target of GRID.targets) {
        for (const operations of GRID.operations) {
          for (const summary of GRID.summaries) {
            for (const recoveryPending of GRID.recoveryPending) {
              for (const joining of GRID.joining) {
                for (const operationType of GRID.operationTypes) {
                  for (const owned of GRID.ownedByThisLearner) {
                    yield {voters, learners, target, operations, summary,
                      recoveryPending, joining, operationType, owned};
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}

// The state a SINGLE promote-then-remove hand-off creates: the voter census
// is exactly at target and this learner owns the add-like operation that put
// it there. It is the complete stated domain the `does_not_depend` rows rest
// on, and it is a RESTRICTION of this grid rather than a second construction.
function isHandoffState(state) {
  return state.voters === state.target && state.owned &&
    state.operations > 0;
}

function measureOnePartition(partitionId) {
  const measured = {states: 0, consulted: 0, nonZeroBudget: 0, admitted: 0,
    decisionDiffersWithoutBudget: 0, handoffStates: 0, handoffDiffers: 0,
    // Incremented at the two evaluation sites below, so a receipt's claim
    // that every state was evaluated twice is a COUNT of what ran.
    evaluationsWithActualBudget: 0, evaluationsWithBudgetForcedToZero: 0,
    handoffEvaluationsWithActualBudget: 0,
    handoffEvaluationsWithBudgetForcedToZero: 0,
    // The census halves the census-conditional value claims.
    censusMovedStates: 0, censusMovedDiffers: 0};
  // One definition of difference for every receipt below: the guard's
  // ADMISSION decision changed when the budget was forced to zero, counted
  // over the states of each slice and no others.
  const bySlice = {};
  for (const {sliceId} of SLICE_MATCHERS) {
    bySlice[sliceId] = emptySliceCounters();
  }
  for (const state of gridStates()) {
    const driven =
      createPromotionGuardContext(stateOptions(partitionId, state));
    const observation = driven.context.observeLearnerPromotionCountCheck();
    measured.states += 1;
    if (observation.priorityRecovery !== null) {
      measured.consulted += 1;
    }
    if ((observation.temporaryOverflowVoterBudget ?? NO_BUDGET) > NO_BUDGET) {
      measured.nonZeroBudget += 1;
    }
    const withBudget = evaluateLearnerPromotionCountCheck(observation);
    measured.evaluationsWithActualBudget += 1;
    const without = evaluateLearnerPromotionCountCheck(
      {...observation, temporaryOverflowVoterBudget: NO_BUDGET});
    measured.evaluationsWithBudgetForcedToZero += 1;
    if (withBudget.refused !== without.refused ||
        withBudget.maxAllowedVotersAfterPromotion !==
          without.maxAllowedVotersAfterPromotion) {
      measured.decisionDiffersWithoutBudget += 1;
    }
    if (without.refused && !withBudget.refused) {
      measured.admitted += 1;
    }
    const admissionDiffers = withBudget.refused !== without.refused;
    const consulted = observation.priorityRecovery !== null;
    const nonZeroBudget =
      (observation.temporaryOverflowVoterBudget ?? NO_BUDGET) > NO_BUDGET;
    for (const {sliceId, matches} of SLICE_MATCHERS) {
      if (!matches(state)) {
        continue;
      }
      const counters = bySlice[sliceId];
      counters.statesEnumerated += 1;
      counters.evaluationsWithActualBudget += 1;
      counters.evaluationsWithBudgetForcedToZero += 1;
      if (admissionDiffers) {
        counters.admissionDifferences += 1;
      }
      if (consulted) {
        counters.statesWhereTheCompletionOwnerWasConsulted += 1;
      }
      if (nonZeroBudget) {
        counters.statesWithANonZeroBudget += 1;
      }
      if (without.refused && !withBudget.refused) {
        counters.budgetAdmittedStates += 1;
      }
    }
    if (isHandoffState(state)) {
      measured.handoffStates += 1;
      measured.handoffEvaluationsWithActualBudget += 1;
      measured.handoffEvaluationsWithBudgetForcedToZero += 1;
      if (withBudget.refused !== without.refused) {
        measured.handoffDiffers += 1;
      }
    }
    // The census HAS moved when the voter census stands above the declared
    // target: the state a second, unplanned transition would meet.
    if (state.voters > state.target) {
      measured.censusMovedStates += 1;
      if (withBudget.refused !== without.refused) {
        measured.censusMovedDiffers += 1;
      }
    }
  }
  return {measured, bySlice};
}

// The full guard, not just its observation: a deterministic slice per
// partition driven through runLearnerPromotionCheck with and without the
// zero-budget double, so the grid's arithmetic claim is tied to the guard's
// own decision.
const FULL_GUARD_SLICE = Object.freeze([
  {voters: 3, learners: 1, target: 3, operations: 1, summary: 'gapSelf',
    recoveryPending: true, joining: false, operationType: OperationType.ADD,
    owned: true},
  {voters: 4, learners: 1, target: 3, operations: 1, summary: 'gapSelf',
    recoveryPending: true, joining: false, operationType: OperationType.ADD,
    owned: true},
  {voters: 4, learners: 1, target: 3, operations: 1, summary: 'gapOther',
    recoveryPending: false, joining: true, operationType: OperationType.REPLACE,
    owned: true},
  {voters: 4, learners: 1, target: 3, operations: 0, summary: 'gapSelf',
    recoveryPending: true, joining: false, operationType: OperationType.ADD,
    owned: false},
  {voters: 5, learners: 2, target: 3, operations: 2, summary: 'missing',
    recoveryPending: true, joining: true, operationType: OperationType.REPLACE,
    owned: true},
]);

async function fullGuardDiffers(partitionId, state) {
  const options = stateOptions(partitionId, state);
  const withBudget = await runPromotionGuard(options);
  const without = await runPromotionGuard({...options, zeroBudget: true});
  return withBudget.granted !== without.granted;
}

test('every unmintable admitted partition is audited on the real guard',
  async () => {
    const matrix = readJsonArtifact(MATRIX_JSON);
    const sets = measurePartitionSets();
    const ledgerPartitionId = matrix.partitionSets.operationLedger;
    const unreachable = sets.all
      .filter((partitionId) => !sets.budgetEvaluated.includes(partitionId));
    const consulted = [];
    const byPartition = {};
    let gridStateCount = 0;
    for (const partitionId of Object.values(INITIAL_PARTITION_IDS)) {
      const {measured, bySlice} = measureOnePartition(partitionId);
      byPartition[partitionId] = bySlice;
      gridStateCount = measured.states;
      if (measured.consulted > 0) {
        consulted.push(partitionId);
      }
      // The hand-off differential, over the COMPLETE stated domain and on
      // every partition: in every state a single promote-then-remove
      // hand-off creates, the admission boundary is identical with the
      // budget at its actual value and with it forced to zero. This is the
      // receipt the does_not_depend rows name, and it is measured here
      // rather than asserted anywhere.
      assert.ok(measured.handoffStates > 0,
        `the grid contains hand-off states on: ${partitionId}`);
      assert.equal(measured.handoffDiffers, 0,
        'no hand-off state changes its admission when the budget is forced ' +
          `to zero on: ${partitionId}`);
      if (sets.budgetEvaluated.includes(partitionId)) {
        assert.ok(measured.admitted > 0,
          `the budget admits states on: ${partitionId}`);
        continue;
      }
      // The proved-unreachable claim, over the whole stated domain.
      assert.equal(measured.consulted, 0,
        `the completion owner is never consulted on: ${partitionId}`);
      assert.equal(measured.nonZeroBudget, 0,
        `the budget is never non-zero on: ${partitionId}`);
      assert.equal(measured.decisionDiffersWithoutBudget, 0,
        `no state's cap or decision depends on the budget on: ${partitionId}`);
      assert.equal(measured.admitted, 0,
        `no state is budget-admitted on: ${partitionId}`);
    }
    assert.deepEqual([...consulted].sort(), [...sets.budgetEvaluated].sort(),
      'the completion owner is consulted on exactly the six ' +
        'priority-control-plane partitions');
    // The full guard agrees with the observation-level grid: on an
    // unreachable partition the zero-budget double changes no decision, and
    // on the ledger it does.
    for (const partitionId of unreachable) {
      for (const state of FULL_GUARD_SLICE) {
        assert.equal(await fullGuardDiffers(partitionId, state), false,
          `the full guard decides identically without the budget on: ${
            partitionId}`);
      }
    }
    // ...and on EVERY budget-evaluated partition the zero-budget double
    // flips at least one real decision of the full guard. That is the
    // measurement every `depends` row's evidence rests on.
    for (const partitionId of sets.budgetEvaluated) {
      const flips = [];
      for (const state of FULL_GUARD_SLICE) {
        if (await fullGuardDiffers(partitionId, state)) {
          flips.push(state);
        }
      }
      assert.ok(flips.length > 0,
        'the zero-budget double flips a real decision of the full guard ' +
          `on: ${partitionId}`);
    }
    // ...and the matrix's does_not_depend rows name THIS measurement as
    // their receipt, over the domain just measured.
    const independent = matrix.rows.filter((row) =>
      row.currentBudgetDependency === 'does_not_depend');
    assert.ok(independent.length > 0);
    for (const row of independent) {
      assert.equal(row.budgetIndependenceMeasurement.test.split(':')[0],
        'test/partition/overflow-budget-unmintable-partitions.test.js',
        `the independence receipt is this grid: ${row.id}`);
    }
    // The matrix records the domain this grid actually ran.
    const domain = matrix.method.unreachableGrid;
    assert.equal(domain.test,
      'test/partition/overflow-budget-unmintable-partitions.test.js');
    assert.equal(domain.statesPerPartition, gridStateCount);
    assert.equal(domain.partitionCount, sets.all.length);
    assert.deepEqual(domain.ranges, JSON.parse(JSON.stringify(GRID)));
    // Every owner-named row and the grouped remainder carry their six
    // answers, and the ledger is the one owner-named partition the budget
    // reaches.
    // Each of the owner's seven partitions is covered. The ledger is split
    // by producer, so it has several rows; the other six have one each.
    const ownerRows = matrix.rows.filter((row) => row.ownerNamedPartition);
    const ownerNamed = new Set(
      ownerRows.map((row) => row.ownerNamedPartition));
    assert.equal(ownerNamed.size, matrix.method.ownerNamedPartitionCount,
      'every owner-named partition has at least one row');
    assert.deepEqual([...ownerNamed].sort(),
      [...matrix.partitionSets.ownerNamedSeven].sort());
    // Answer six is never written beside the dependency: it FOLLOWS it, so
    // a row cannot answer the question one way and classify itself another.
    const ANSWER_SIX = {
      depends: true,
      depends_only_when_census_moved: 'only_when_the_census_moved',
      does_not_depend: false,
      unknown_producer_not_driven: 'unknown',
      unreachable_in_stated_domain: false,
    };
    for (const row of ownerRows) {
      assert.ok(row.sixAnswers, `six answers on: ${row.id}`);
      assert.equal(row.sixAnswers.budgetRemovalChangesTheDecision,
        ANSWER_SIX[row.currentBudgetDependency],
        `answer six follows the dependency on: ${row.id}`);
      if (!row.partitionClass.includes(ledgerPartitionId)) {
        assert.equal(row.currentBudgetDependency,
          'unreachable_in_stated_domain',
          `and six of the owner's seven cannot reach the budget: ${row.id}`);
      }
    }
    // The ledger's own over-target REPLACE target: granted today, refused
    // with the budget forced to zero, at the replacement cap alone.
    const ledgerOptions = stateOptions(ledgerPartitionId, {
      voters: OVER_TARGET_VOTER_COUNT, learners: 1,
      target: TARGET_REPLICA_COUNT, operations: 1, summary: 'gapSelf',
      recoveryPending: true, joining: false,
      operationType: OperationType.REPLACE, owned: true});
    const ledgerGranted = await runPromotionGuard(ledgerOptions);
    assert.equal(ledgerGranted.granted, true,
      'the ledger REPLACE target is granted today');
    const ledgerRefused =
      await runPromotionGuard({...ledgerOptions, zeroBudget: true});
    assert.equal(ledgerRefused.granted, false,
      'and refused with the budget at zero');
    const refusal = ledgerRefused.logLines.find((line) =>
      line.fields && line.fields.reason === WOULD_EXCEED);
    assert.ok(refusal, 'for exceeding the target replica count');
    assert.equal(refusal.fields.maxAllowedVotersAfterPromotion,
      TARGET_REPLICA_COUNT + 1, 'at the replacement cap alone');
    // The receipts this grid is the witness for, emitted from the aggregates
    // measured above and compared with the committed evidence file.
    emitAndAssertReceipts(EMIT_KEY, gridReceipts(byPartition));
  });
