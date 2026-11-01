// The final-state reconciliation formula has one owner
// (benchmark-oltp-state-reconciliation.js): the run records its verdict with
// it and admission recomputes the verdict with the same function, so a record
// and its admission can never disagree on what the committed set explains.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {describe, it} from 'node:test';

import {
  ADMISSION_REASON,
  CLAIM_CELL_STATUS,
} from '../benchmark-claim-admission.js';
import {
  OLTP_RECONCILIATION_STATUS,
  reconcileOltpFinalState,
} from '../benchmark-oltp-state-reconciliation.js';
import {OPERATION_OUTCOME} from '../benchmark-operation-outcome.js';
import {
  buildFixtureHeader,
  buildFixtureRun,
  fixtureTargetCell,
  publishFixtureCampaign,
  sealFixtureRun,
} from '../comparative-benchmark-fixtures.js';
import {OLTP_OPERATION_KIND} from '../oltp-baseline-workload.js';

const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayMap = Function.call.bind(Array.prototype.map);

const SCALE = Object.freeze({districtsPerWarehouse: 2});
const LAGRANGE = 'lagrange';

function request(operationKind, outcome, effectSummary = {}) {
  return {operationKind, outcome, effectSummary};
}

function snapshot(rowCounts) {
  return {snapshot: {stateSha256: 'x', rowCounts, state: []}};
}

const BEFORE = Object.freeze({orders: 10, history: 5, new_order: 4, order_line: 40});

describe('final-state reconciliation owner', () => {
  it('a committed effect missing from state is a mismatch, never explained by an ' +
    'unresolved request', () => {
    const records = [
      request(OLTP_OPERATION_KIND.NEW_ORDER, OPERATION_OUTCOME.COMMITTED, {lineCount: 5}),
      request(OLTP_OPERATION_KIND.NEW_ORDER, OPERATION_OUTCOME.UNRESOLVED),
    ];
    // The committed new order's rows are absent: every delta is zero.
    const result = reconcileOltpFinalState(records, snapshot(BEFORE), snapshot(BEFORE), SCALE);
    assert.equal(result.status, OLTP_RECONCILIATION_STATUS.MISMATCH);
  });

  it('an excess within what the unresolved requests could apply is unresolved effects',
    () => {
      const records = [
        request(OLTP_OPERATION_KIND.NEW_ORDER, OPERATION_OUTCOME.COMMITTED, {lineCount: 5}),
        request(OLTP_OPERATION_KIND.NEW_ORDER, OPERATION_OUTCOME.UNRESOLVED),
      ];
      const after = {orders: 12, history: 5, new_order: 6, order_line: 49};
      const result = reconcileOltpFinalState(records, snapshot(BEFORE), snapshot(after), SCALE);
      assert.equal(result.status, OLTP_RECONCILIATION_STATUS.UNRESOLVED_EFFECTS_OBSERVED);
    });
});

async function admittedFinalState(mutate) {
  const runs = arrayMap([1, 2], (repetition) => {
    const run = buildFixtureRun({repetition});
    mutate(run.correctness.finalState);
    return sealFixtureRun(run, {keepFinalState: true});
  });
  const header = buildFixtureHeader({campaignId: 'fixture-campaign', targetIds: [LAGRANGE]});
  const published = await publishFixtureCampaign({rawRecords: [header, ...runs]});
  fs.rmSync(published.root, {recursive: true, force: true});
  return fixtureTargetCell(published.matrix, LAGRANGE);
}

describe('admission recomputes the verdict with the reconciliation owner', () => {
  it('an order_line delta the committed new orders do not explain is unreconciled',
    async () => {
      const cell = await admittedFinalState((finalState) => {
        finalState.after.tableRows.order_line += 1;
      });
      assert.equal(cell.status, CLAIM_CELL_STATUS.INVALID_MEASUREMENT);
      assert.equal(arrayIncludes(cell.reasons, ADMISSION_REASON.FINAL_STATE_UNRECONCILED),
        true, cell.reasons.join(', '));
    });

  it('a recorded status that the owner does not reproduce is unreconciled', async () => {
    const cell = await admittedFinalState((finalState) => {
      finalState.status = OLTP_RECONCILIATION_STATUS.UNRESOLVED_EFFECTS_OBSERVED;
    });
    assert.equal(arrayIncludes(cell.reasons, ADMISSION_REASON.FINAL_STATE_UNRECONCILED),
      true, cell.reasons.join(', '));
  });

  it('a sealed fixture run reconciles exactly', async () => {
    const cell = await admittedFinalState(() => {});
    assert.equal(cell.status, CLAIM_CELL_STATUS.VALID_OBSERVED, cell.reasons.join(', '));
  });
});
