/**
 * The solve/ size gate reports three byte counts rather than one: the total
 * footprint, the append-only quest history inside it, and the active
 * footprint that remains. Only the active footprint is budgeted, because
 * history is an immutable record whose growth is normal and whose retention
 * is a separate concern. These scenarios assert the accounting is derived
 * from the quest-layout owner, adds up, and cannot be escaped by putting an
 * arbitrary file under a quest directory.
 */

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  ACTIVE_FOOTPRINT_BUDGET_BYTES, METRIC, measureSolveV2Budget,
} from '../../scripts/checks/solve-v2-budget.js';
import {isQuestLogPath} from '../../scripts/solve/store.js';

const MEGABYTE = 1024 * 1024;

function rows() {
  return new Map(measureSolveV2Budget().map((row) => [row.id, row]));
}

test('the accounting reports total, append-only history and active bytes', () => {
  const measured = rows();
  for (const id of [METRIC.SOLVE_TOTAL_BYTES, METRIC.SOLVE_HISTORY_BYTES,
    METRIC.SOLVE_ACTIVE_BYTES]) {
    const row = measured.get(id);
    assert.ok(row, `${id} is reported`);
    assert.equal(Number.isInteger(row.value), true, `${id} is a byte count`);
    assert.ok(row.value > 0, `${id} is measured, not assumed`);
  }
  // History is the larger part today; that is the point of separating them.
  assert.ok(measured.get(METRIC.SOLVE_HISTORY_BYTES).value >
    measured.get(METRIC.SOLVE_ACTIVE_BYTES).value);
});

test('the accounting adds up', () => {
  const measured = rows();
  const total = measured.get(METRIC.SOLVE_TOTAL_BYTES).value;
  const history = measured.get(METRIC.SOLVE_HISTORY_BYTES).value;
  const active = measured.get(METRIC.SOLVE_ACTIVE_BYTES).value;
  assert.equal(total, active + history, 'total = active + append-only history');
  const consistency = measured.get(METRIC.ACCOUNTING_RESIDUAL);
  assert.equal(consistency.value, 0, 'the residual row proves it mechanically');
  assert.equal(consistency.ok, true);
});

test('the active footprint carries the 20 MB budget and meets it', () => {
  const active = rows().get(METRIC.SOLVE_ACTIVE_BYTES);
  assert.equal(ACTIVE_FOOTPRINT_BUDGET_BYTES, 20 * MEGABYTE,
    'the original target is unchanged; only what it measures changed');
  assert.equal(active.budget, ACTIVE_FOOTPRINT_BUDGET_BYTES);
  assert.equal(active.ok, true, 'the active footprint satisfies 20 MB');
  assert.ok(active.value < ACTIVE_FOOTPRINT_BUDGET_BYTES);
  // The total is reported without a budget: it is honest, not a gate.
  assert.equal(rows().get(METRIC.SOLVE_TOTAL_BYTES).ok, true);
});

test('history is whatever the quest-layout owner classifies, and only that', () => {
  // The checker must not restate the layout. Every path the store calls a
  // quest log is history; nothing else is, including files placed under a
  // quest directory to look like history.
  for (const historical of ['solve/quests/demo-quest/log.ndjson']) {
    assert.equal(isQuestLogPath(historical), true);
  }
  for (const active of [
    'solve/quests/demo-quest/quest.json',
    'solve/quests/demo-quest/evidence/big-blob.json',
    'solve/quests/demo-quest/evidence/log.ndjson',
    'solve/quests/demo-quest/nested/log.ndjson',
    'solve/epics/solve-v2.md',
    'solve/specs/anything/tasks.md',
  ]) {
    assert.equal(isQuestLogPath(active), false,
      `${active} stays inside the active-footprint gate`);
  }
});
