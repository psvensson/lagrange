// AUDIT-WITNESS-KIND: guard-grid
// This file drives owners over constructed states. It proves GUARD
// behaviour, never that a production producer can reach that state.
// The state grid that enumerates every case the bootstrap overflow budget
// admits today (quest critical-spread-overflow-budget-audit, receipt
// budget-admitted-cases-enumerated-by-state-grid).
//
// Both owners are the real ones: the budget comes from
// src/control-plane/priority-recovery-completion.js (the owner that decides
// it) and the decision from src/partition/learner-promotion-count-check.js
// (the owner that spends it). A row is BUDGET-ADMITTED when the count check
// grants it with the budget the completion owner returned and refuses it
// with the budget at zero.
//
// The grid is the arithmetic dimension only. The partition dimension is
// measured on the real promotion guard by the unmintable-partition witnesses
// registered on learner-promotion-count-check-inputs.test.js, and the
// producer dimension by the add-like producer census.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateLearnerPromotionCountCheck,
} from '../../src/partition/learner-promotion-count-check.js';
import {
  buildPriorityRecoveryCompletion,
} from '../../src/control-plane/priority-recovery-completion.js';
import {
  MATRIX_JSON,
  readJsonArtifact,
} from '../rebalancer/overflow-budget-audit-support.js';
import {
  arithmeticAdmissionClassReceipt,
  emitAndAssertReceipts,
} from '../rebalancer/overflow-budget-receipt-emission.js';

// The stated domain. It is wider than any reachable membership, and the
// matrix carries the code argument for why nothing outside it can add a
// class: the budget the completion owner returns is the constant 2 or 0, and
// it enters the cap as one additive term, so an admitted row is always over
// the budget-free cap by 1 or 2 whatever the counts are.
const GRID_TARGETS = Object.freeze([0, 1, 2, 3, 4, 5]);
const GRID_VOTERS = Object.freeze([0, 1, 2, 3, 4, 5, 6, 7]);
const GRID_LEARNERS = Object.freeze([0, 1, 2, 3]);
const GRID_BOOLEANS = Object.freeze([false, true]);
const GRID_ACTIVE_OPERATION_COUNTS = Object.freeze([0, 1, 2]);
const NO_BUDGET = 0;
const WOULD_EXCEED = 'would_exceed_target_replica_count';
const WOULD_BE_EVEN = 'would_cause_even_voter_count';
const BUDGET_CONSTANT = 2;

function completionFor(row) {
  return buildPriorityRecoveryCompletion({
    assessment: {
      planner: {ready: row.plannerReady, spreadGap: 0},
      activeOperationContexts: [],
    },
    targetReplicaCount: row.targetReplicaCount,
    activeVoterCount: row.activeVoterCount,
    learnerCount: row.learnerCount,
    activeOperationCount: row.activeOperationCount,
    priorityRecoveryActive: row.priorityRecoveryActive,
  });
}

function countCheckInputs(row, temporaryOverflowVoterBudget) {
  return {
    targetReplicaCount: row.targetReplicaCount,
    activeVoterCount: row.activeVoterCount,
    learnerCount: row.learnerCount,
    isJoiningExistingGroup: row.isJoiningExistingGroup,
    hasOwnedAddLikeOperation: row.hasOwnedAddLikeOperation,
    isCriticalSystemPartition: row.isCriticalSystemPartition,
    temporaryOverflowVoterBudget,
  };
}

function* gridRows() {
  for (const targetReplicaCount of GRID_TARGETS) {
    for (const activeVoterCount of GRID_VOTERS) {
      for (const learnerCount of GRID_LEARNERS) {
        for (const isJoiningExistingGroup of GRID_BOOLEANS) {
          for (const hasOwnedAddLikeOperation of GRID_BOOLEANS) {
            for (const isCriticalSystemPartition of GRID_BOOLEANS) {
              for (const activeOperationCount of GRID_ACTIVE_OPERATION_COUNTS) {
                for (const plannerReady of GRID_BOOLEANS) {
                  for (const priorityRecoveryActive of GRID_BOOLEANS) {
                    yield {targetReplicaCount, activeVoterCount, learnerCount,
                      isJoiningExistingGroup, hasOwnedAddLikeOperation,
                      isCriticalSystemPartition, activeOperationCount,
                      plannerReady, priorityRecoveryActive};
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

// The lead's ruling: the class is keyed on the GUARD-VISIBLE discriminators,
// not on the formula that defines admission - keying it on the formula made
// the round-1 assertion a tautology. A state's class therefore depends on
// what the guard can actually see about it.
function admissionClassId(row, withBudget, without) {
  const allowance = withBudget.allowances.replacement ||
    withBudget.allowances.singleVoterExpansion;
  const overBy = withBudget.votersAfterPromotion -
    without.maxAllowedVotersAfterPromotion;
  return [
    allowance ? 'allowance' : 'no_allowance',
    `over_by_${overBy}`,
    row.hasOwnedAddLikeOperation ?
      'owned_operation_visible' :
      'no_owned_operation',
    row.isJoiningExistingGroup ? 'joining' : 'not_joining',
    row.activeOperationCount === 0 ?
      'no_counted_operation' :
      'counted_operation',
  ].join('__');
}

// Extracted so the test body stays under the complexity ratchet: one
// admitted row checked against the class the matrix records for it.
function assertClassMatchesState(entry, recorded, overBy) {
  assert.equal(recorded.overBy, overBy,
    `matrix overBy on: ${entry.classId}`);
  assert.equal(recorded.allowanceInForce,
    entry.withBudget.allowances.replacement ||
      entry.withBudget.allowances.singleVoterExpansion,
    `matrix allowance on: ${entry.classId}`);
  assert.equal(recorded.ownedAddLikeOperationVisible,
    entry.row.hasOwnedAddLikeOperation,
    `matrix owned-operation discriminator on: ${entry.classId}`);
  assert.equal(recorded.joining, entry.row.isJoiningExistingGroup,
    `matrix joining discriminator on: ${entry.classId}`);
  assert.equal(recorded.anyCountedOperation,
    entry.row.activeOperationCount !== 0,
    `matrix counted-operation discriminator on: ${entry.classId}`);
}

function measureAdmittedRows() {
  const admitted = [];
  let total = 0;
  let budgetRows = 0;
  for (const row of gridRows()) {
    total += 1;
    const budget = completionFor(row).temporaryOverflowVoterBudget;
    if (budget > NO_BUDGET) {
      budgetRows += 1;
    }
    const withBudget =
      evaluateLearnerPromotionCountCheck(countCheckInputs(row, budget));
    const without =
      evaluateLearnerPromotionCountCheck(countCheckInputs(row, NO_BUDGET));
    if (without.refused && !withBudget.refused) {
      admitted.push({row, budget, withBudget, without,
        classId: admissionClassId(row, withBudget, without)});
    }
  }
  return {admitted, total, budgetRows};
}

const THIS_FILE = 'test/partition/overflow-budget-admitted-case-grid.test.js';
const THIS_TEST =
  'every budget-admitted state grid row maps to exactly one admission class';
const EMIT_KEY = 'admitted-case-grid';

test('every budget-admitted state grid row maps to exactly one admission class',
  () => {
    const matrix = readJsonArtifact(MATRIX_JSON);
    const {admitted, total, budgetRows} = measureAdmittedRows();
    assert.ok(admitted.length > 0, 'the grid admits at least one row');
    assert.equal(total, matrix.method.grid.rowCount,
      'the matrix records the measured grid size');
    assert.equal(budgetRows, matrix.method.grid.rowsWithBudget,
      'the matrix records how many grid rows carry a non-zero budget');
    assert.equal(admitted.length, matrix.method.grid.admittedRowCount,
      'the matrix records the measured budget-admitted row count');
    const classesById = new Map(
      matrix.admissionClasses.map((entry) => [entry.id, entry]),
    );
    const seenClasses = new Set();
    for (const entry of admitted) {
      // Only the critical branch can spend the budget: a non-critical
      // partition zeroes the allowance before the cap is built.
      assert.equal(entry.row.isCriticalSystemPartition, true,
        'a budget-admitted row is always on the critical branch');
      assert.equal(entry.budget, BUDGET_CONSTANT,
        'the budget the completion owner returns is the one constant');
      // The budget never decides the even-voter gate: its own precondition
      // (activeVoterCount >= targetReplicaCount) makes the cap comparison
      // refuse first whenever no allowance is in force, and any allowance
      // already opens the even gate.
      assert.equal(entry.without.refusalReason, WOULD_EXCEED,
        'a budget-admitted row is refused for the cap, never for the even ' +
          `gate (${WOULD_BE_EVEN})`);
      const overBy = entry.withBudget.votersAfterPromotion -
        entry.without.maxAllowedVotersAfterPromotion;
      assert.ok(overBy >= 1 && overBy <= BUDGET_CONSTANT,
        `an admitted row is over the budget-free cap by 1 or 2: ${overBy}`);
      const recorded = classesById.get(entry.classId);
      assert.ok(recorded,
        `the matrix carries the admission class: ${entry.classId}`);
      // Every discriminator the class is keyed on is the state's own, so a
      // class cannot be satisfied by a state it does not describe.
      assertClassMatchesState(entry, recorded, overBy);
      seenClasses.add(entry.classId);
      // Exactly one matrix admission class claims this grid row.
      const claiming = matrix.admissionClasses.filter((candidate) =>
        candidate.id === entry.classId);
      assert.equal(claiming.length, 1,
        `exactly one admission class claims: ${entry.classId}`);
    }
    assert.deepEqual([...seenClasses].sort(),
      matrix.admissionClasses.map((entry) => entry.id).sort(),
      'every recorded admission class is measured and no measured class is ' +
        'missing from the matrix');
    // Every admission class is claimed by at least one matrix row, and every
    // matrix row that depends on the budget names classes that exist.
    for (const classId of seenClasses) {
      const rows = matrix.rows.filter((row) =>
        Array.isArray(row.admissionClasses) &&
        row.admissionClasses.includes(classId));
      assert.ok(rows.length > 0,
        `at least one matrix row claims the admission class: ${classId}`);
    }
    const producerIds = new Set(matrix.producers.map((entry) => entry.id));
    for (const row of matrix.rows) {
      for (const classId of row.admissionClasses || []) {
        assert.ok(seenClasses.has(classId),
          `matrix row ${row.id} names a measured admission class: ${classId}`);
        // Every row claiming a class has a producer from the census.
        assert.ok(row.producers.length > 0 &&
          row.producers.every((producerId) => producerIds.has(producerId)),
        `a row claiming a class has censused producers: ${row.id}`);
      }
      if (row.currentBudgetDependency === 'depends') {
        assert.ok((row.admissionClasses || []).length > 0,
          `a depending row names its admission classes: ${row.id}`);
      }
    }
    // The lead's ruling: the classes with NO owned add-like operation are the
    // operation-not-visible rows', and no producer-backed row may claim them.
    const opLessClasses = matrix.admissionClasses
      .filter((entry) => !entry.ownedAddLikeOperationVisible)
      .map((entry) => entry.id);
    for (const classId of opLessClasses) {
      const claiming = matrix.rows.filter((row) =>
        (row.admissionClasses || []).includes(classId));
      assert.ok(claiming.length > 0,
        `an operation-not-visible class is claimed: ${classId}`);
      for (const row of claiming) {
        assert.ok(row.id.endsWith('-operation-not-visible-to-the-guard'),
          'only an operation-not-visible row claims an op-less class: ' +
            `${row.id} / ${classId}`);
      }
    }
    // The receipts this grid is the witness for: the ARITHMETIC dimension,
    // one per admission class, from the counts just measured. This grid has
    // no partition dimension, and the receipts say so by carrying none.
    const witness = {file: THIS_FILE, test: THIS_TEST};
    emitAndAssertReceipts(EMIT_KEY, [...seenClasses].sort()
      .map((admissionClassId) => arithmeticAdmissionClassReceipt({
        admissionClassId,
        witness,
        result: {
          statesEnumerated: total,
          statesWithANonZeroBudget: budgetRows,
          // Admitted == granted with the budget the completion owner
          // returned AND refused with it forced to zero: that conjunction
          // is what put the state in this class.
          admittedStates: admitted
            .filter((entry) => entry.classId === admissionClassId).length,
        },
      })));
  });
