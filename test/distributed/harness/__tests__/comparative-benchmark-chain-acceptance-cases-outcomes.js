// Chain acceptance cases J1-J5, J15 and malformed records: the fake product's
// response class travels through the real driver, the record validator, the
// temp raw store, admission, the matrix and every renderer, and the assertion
// is made on the published matrix JSON and the rendered pages.
import assert from 'node:assert/strict';

import {
  ADMISSION_REASON,
  CLAIM_CELL_STATUS,
  REASON_PREFIX,
} from '../benchmark-claim-admission.js';
import {
  FAILURE_CLASS,
  OPERATION_OUTCOME,
  validateBenchmarkAccounting,
} from '../benchmark-operation-outcome.js';
import {OLTP_RECONCILIATION_STATUS} from '../benchmark-oltp-state-reconciliation.js';
import {BENCHMARK_RUN_STATUS} from '../benchmark-scenario-a-run.js';
import {RECORD_REJECTION, validateRunRecord} from '../raw-observation-record.js';
import {
  ChainPublication,
  assertNoNumbersRendered,
  chainHeader,
  driveArm,
  publishedTargetCell,
  reseal,
  withChain,
} from './comparative-benchmark-chain-acceptance-chain.js';
import {FAKE_PRODUCT_FAULT} from './real-product-workload-driver-fake-product.js';

const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayMap = Function.call.bind(Array.prototype.map);
const stringIncludes = Function.call.bind(String.prototype.includes);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);

const LAGRANGE = 'lagrange';
const TIDB = 'tidb-tikv';
const PG = 'pg-single-primary';
const LABEL = Object.freeze({
  [LAGRANGE]: 'Lagrange 0.4.0 (3 nodes)',
  [TIDB]: 'TiDB + TiKV v8.5.8',
  [PG]: 'PostgreSQL 17 (single primary)',
});

/**
 * Drive a pair of repetitions per target, publish them through a temp chain and
 * hand the publication to `check`.
 * @param {Array<{targetId: string, subkind?: string, mode?: string}>} arms
 * @param {Function} check
 * @param {Function} [mutate] edits the driven runs before they are stored
 * @return {Promise<*>}
 */
async function publishArms(arms, check, mutate = null) {
  const runs = [];
  for (const arm of arms) {
    for (const repetition of [1, 2]) runs.push((await driveArm({...arm, repetition})).run);
  }
  if (mutate) mutate(runs);
  const header = chainHeader(runs, [...new Set(arrayMap(arms, (a) => a.targetId))]);
  return withChain(async (chain) => {
    await chain.append([header, ...runs]).publish();
    return check(chain, runs);
  });
}

// The cell's accounting: each run recounted by the outcome owner, then summed.
function summed(runs) {
  const recounts = arrayMap(runs, (r) => validateBenchmarkAccounting(r.observations.requests));
  const total = {...recounts[0], terminalFailures: {...recounts[0].terminalFailures}};
  for (const a of recounts.slice(1)) {
    for (const [key, value] of Object.entries(a)) {
      if (typeof value === 'number') total[key] += value;
    }
    for (const [cls, n] of Object.entries(a.terminalFailures)) total.terminalFailures[cls] += n;
  }
  return total;
}

function runsOf(runs, targetId) {
  return arrayFilter(runs, (r) => r.targetId === targetId);
}

function accountingText(a) {
  return `offered ${a.offered}, issued ${a.issued}, committed ${a.committed}, ` +
    `conflict-exhausted ${a.conflictExhausted}, ` +
    `${arrayMap(Object.entries(a.terminalFailures), ([c, n]) => `${c} ${n}`).join(', ')}, ` +
    `unresolved ${a.unresolved}, unissued ${a.unissued}`;
}

function assertPublishedFailure(chain, runs, targetId, {smoke = true, reasons}) {
  const published = publishedTargetCell(chain, {targetId, label: LABEL[targetId], smoke});
  const {matrix, markdown, svgTitle} = published;
  assert.equal(matrix.status, CLAIM_CELL_STATUS.PRODUCT_FAILURE,
    `${targetId}: ${matrix.status} (${matrix.reasons.join(', ')})`);
  for (const reason of reasons) {
    assert.equal(arrayIncludes(matrix.reasons, reason), true,
      `${targetId}: reason ${reason} in ${matrix.reasons.join(', ')}`);
    assert.equal(stringIncludes(markdown, reason), true, `${targetId}: page prints ${reason}`);
    assert.equal(stringIncludes(svgTitle, reason), true, `${targetId}: SVG title names ${reason}`);
  }
  // The failure counts are the metric of a product failure: they are the counts
  // the requests themselves add up to, and the page prints exactly those.
  const total = summed(runsOf(runs, targetId));
  assert.equal(stringStartsWith(markdown, 'product-failure ('), true, markdown);
  assert.equal(stringIncludes(markdown, accountingText(total)), true,
    `${targetId}: rendered counts ${markdown} != ${accountingText(total)}`);
  assertNoNumbersRendered(markdown, `${targetId} product failure`);
  assert.equal(matrix.metrics.capacity, null, `${targetId}: no capacity figure`);
  for (const run of matrix.metrics.runs) {
    assert.equal('latencyMs' in run || 'committedPerSec' in run, false,
      `${targetId}: a failed run publishes no latency or throughput`);
  }
  return {published, total};
}

// J1: nothing answers; the watchdog closes the run.
async function caseJ1AllUnresolved() {
  await publishArms([{targetId: LAGRANGE, mode: FAKE_PRODUCT_FAULT.SILENT},
    {targetId: LAGRANGE, subkind: 'main', mode: FAKE_PRODUCT_FAULT.SILENT}],
  (chain, runs) => {
    for (const run of runs) {
      const {observations} = run;
      assert.equal(observations.runStatus, BENCHMARK_RUN_STATUS.WATCHDOG_STOPPED);
      assert.equal(observations.accounting.committed, 0);
      assert.ok(observations.accounting.unresolved >= 1, 'in-flight requests are unresolved');
      assert.equal(observations.accounting.unresolved + observations.accounting.unissued,
        observations.accounting.offered, 'complete unresolved accounting');
      assert.equal(observations.latency.count, 0, 'no successful-latency sample');
    }
    const reasons = [ADMISSION_REASON.WATCHDOG_STOPPED, ADMISSION_REASON.NO_COMMITTED_OPERATIONS];
    assertPublishedFailure(chain, arrayFilter(runs, (r) => r.subkind === 'smoke'), LAGRANGE,
      {reasons});
    assertPublishedFailure(chain, arrayFilter(runs, (r) => r.subkind === 'main'), LAGRANGE,
      {smoke: false, reasons});
  });
}

// J2: the data path never opens; nothing substitutes for it.
async function caseJ2DataPathBroken() {
  let products = [];
  const runs = [];
  for (const repetition of [1, 2]) {
    const driven = await driveArm({targetId: LAGRANGE, repetition,
      mode: FAKE_PRODUCT_FAULT.NEVER_OPEN});
    products.push(driven.product);
    runs.push(driven.run);
  }
  for (const product of products) {
    assert.equal(product.state.connections, 0, 'no session was opened');
    assert.deepEqual(product.state.statements, [], 'no substitute statement reached the product');
  }
  for (const run of runs) {
    assert.equal(run.observations.runStatus, BENCHMARK_RUN_STATUS.SETUP_FAILED);
    assert.equal(run.observations.setup.failureClass, FAILURE_CLASS.TRANSPORT_FAILURE);
    assert.equal(run.observations.accounting.issued, 0, 'no request was issued');
  }
  products = null;
  await withChain(async (chain) => {
    await chain.append([chainHeader(runs, [LAGRANGE]), ...runs]).publish();
    const {published} = assertPublishedFailure(chain, runs, LAGRANGE,
      {reasons: [ADMISSION_REASON.DATASET_PREPARATION_FAILED]});
    assert.equal(stringIncludes(published.markdown, 'transport_failure'), true);
    assert.equal(stringIncludes(published.markdown, 'ECONNREFUSED'), true);
  });
}

// J3: a product error is never a commit.
async function caseJ3ProductError() {
  await publishArms([{targetId: LAGRANGE, mode: FAKE_PRODUCT_FAULT.ERROR_ENVELOPE},
    {targetId: TIDB, mode: FAKE_PRODUCT_FAULT.ERROR_ENVELOPE}], (chain, runs) => {
    for (const targetId of [LAGRANGE, TIDB]) {
      const {total} = assertPublishedFailure(chain, runs, targetId,
        {reasons: [ADMISSION_REASON.NO_COMMITTED_OPERATIONS]});
      assert.ok(total.terminalFailures[FAILURE_CLASS.PRODUCT_ERROR] >= 1, targetId);
      assert.equal(total.committed, 0, `${targetId}: an error response is not a commit`);
    }
  });
}

// J4: a well-formed answer with the wrong content is a correctness failure,
// and a run that observed one is a visible product failure.
async function caseJ4CorrectnessFailure() {
  for (const mode of [FAKE_PRODUCT_FAULT.WRONG_VALUE, FAKE_PRODUCT_FAULT.MISSING_ROW,
    FAKE_PRODUCT_FAULT.ZERO_AFFECTED]) {
    await publishArms([{targetId: LAGRANGE, mode}], (chain, runs) => {
      const {total} = assertPublishedFailure(chain, runs, LAGRANGE,
        {reasons: [ADMISSION_REASON.CORRECTNESS_FAILURES_OBSERVED]});
      assert.ok(total.terminalFailures[FAILURE_CLASS.CORRECTNESS_FAILURE] >= 1, mode);
      for (const run of runs) {
        assert.equal(run.correctness.finalState.status, OLTP_RECONCILIATION_STATUS.RECONCILED,
          `${mode}: the committed set explains the final state`);
      }
    });
  }
}

// J5: the commit ran but its answer was lost; nothing retries it and the final
// state shows each effect at most once.
async function caseJ5AmbiguousCommit() {
  await publishArms([{targetId: LAGRANGE, mode: FAKE_PRODUCT_FAULT.COMMIT_ACK_LOST},
    {targetId: TIDB, mode: FAKE_PRODUCT_FAULT.COMMIT_ACK_LOST},
    {targetId: PG, mode: FAKE_PRODUCT_FAULT.COMMIT_ACK_LOST}], (chain, runs) => {
    for (const run of runs) {
      const unresolved = arrayFilter(run.observations.requests,
        (r) => r.outcome === OPERATION_OUTCOME.UNRESOLVED);
      assert.ok(unresolved.length >= 1, run.runId);
      for (const request of unresolved) {
        assert.equal(request.failureClass, FAILURE_CLASS.AMBIGUOUS_COMMIT);
        assert.equal(request.attempts.length, 1, `${request.opId} was retried`);
      }
      const finalState = run.correctness.finalState;
      assert.equal(finalState.status, OLTP_RECONCILIATION_STATUS.UNRESOLVED_EFFECTS_OBSERVED);
      assert.ok(finalState.deltas.orders <= finalState.unresolvedRequests.newOrders,
        `${run.runId}: an ambiguous new order shows its effect at most once`);
      assert.ok(finalState.deltas.history <= finalState.unresolvedRequests.payments,
        `${run.runId}: an ambiguous payment shows its effect at most once`);
    }
    for (const targetId of [LAGRANGE, TIDB, PG]) {
      const {total, published} = assertPublishedFailure(chain, runs, targetId,
        {reasons: [ADMISSION_REASON.NO_COMMITTED_OPERATIONS,
          ADMISSION_REASON.UNRESOLVED_EFFECTS_OBSERVED]});
      assert.equal(total.ambiguousCommits, total.unresolved, targetId);
      assert.equal(stringIncludes(published.markdown, `unresolved ${total.unresolved}`),
        true);
    }
  });
  // An effect applied twice (a duplicated retry) exceeds what the unresolved
  // requests can explain: the record is refused, whatever its status says.
  await publishArms([{targetId: LAGRANGE, mode: FAKE_PRODUCT_FAULT.COMMIT_ACK_LOST}],
    (chain) => {
      const {matrix, markdown} = publishedTargetCell(chain,
        {targetId: LAGRANGE, label: LABEL[LAGRANGE], smoke: true});
      assert.equal(matrix.status, CLAIM_CELL_STATUS.INVALID_MEASUREMENT);
      assert.equal(arrayIncludes(matrix.reasons, ADMISSION_REASON.FINAL_STATE_UNRECONCILED),
        true, matrix.reasons.join(', '));
      assertNoNumbersRendered(markdown, 'duplicated effect');
    }, (runs) => {
      const finalState = runs[0].correctness.finalState;
      finalState.after.tableRows.orders += finalState.unresolvedRequests.newOrders + 1;
      reseal(runs[0]);
    });
}

// J15: the product disappears after the pre-measurement snapshot.
async function caseJ15ProductRemoved() {
  await publishArms([{targetId: LAGRANGE, mode: FAKE_PRODUCT_FAULT.PRODUCT_REMOVED}],
    (chain, runs) => {
      for (const run of runs) {
        const a = run.observations.accounting;
        assert.equal(a.committed, 0, 'nothing completes after the product is gone');
        assert.equal(a.terminalFailures[FAILURE_CLASS.TRANSPORT_FAILURE], a.issued);
        assert.equal(run.correctness.finalState, null, 'the post-run state is unobservable');
        assert.equal(run.correctness.finalStateObservation.status,
          OLTP_RECONCILIATION_STATUS.UNOBSERVED);
      }
      // Without the post-run state nothing the run claims can be reconciled: the
      // cell is an invalid measurement and carries no figure at all.
      const {matrix, markdown} = publishedTargetCell(chain,
        {targetId: LAGRANGE, label: LABEL[LAGRANGE], smoke: true});
      assert.equal(matrix.status, CLAIM_CELL_STATUS.INVALID_MEASUREMENT);
      assert.equal(arrayIncludes(matrix.reasons, ADMISSION_REASON.FINAL_STATE_MISSING), true,
        matrix.reasons.join(', '));
      assert.equal(matrix.metrics, null);
      assert.equal(stringIncludes(markdown, CLAIM_CELL_STATUS.VALID_OBSERVED), false);
      assertNoNumbersRendered(markdown, 'removed product');
    });
}

// Malformed records are refused, never coerced: the validator throws a typed
// code and the published cell names it.
const MALFORMED = Object.freeze([
  // JSON cannot hold a non-finite number: the stored line carries null.
  ['non-finite timing', RECORD_REJECTION.INVALID_TIMING, (run) => {
    run.observations.requests[0].attempts[0].endedMs = JSON.parse(JSON.stringify(Number.NaN));
  }],
  ['infinite rate', RECORD_REJECTION.INVALID_TIMING, (run) => {
    run.plan.offeredRatePerSec = JSON.parse(JSON.stringify(Number.POSITIVE_INFINITY));
  }],
  ['negative timing', RECORD_REJECTION.INVALID_TIMING, (run) => {
    run.observations.window.drainMs = -1;
  }],
  ['numeric string', RECORD_REJECTION.INVALID_TIMING, (run) => {
    run.plan.offeredRatePerSec = String(run.plan.offeredRatePerSec);
  }],
  ['negative latency', RECORD_REJECTION.ACCOUNTING_INVARIANT, (run) => {
    run.observations.requests[0].latencyMs = -1;
  }],
  ['duplicate operation id', RECORD_REJECTION.DUPLICATE_OP_ID, (run) => {
    run.observations.requests[1].opId = run.observations.requests[0].opId;
  }],
  ['inconsistent counts', RECORD_REJECTION.ACCOUNTING_MISMATCH, (run) => {
    run.observations.accounting.committed -= 1;
    run.observations.accounting.unresolved += 1;
  }],
  ['fractional count', RECORD_REJECTION.INVALID_COUNT, (run) => {
    run.plan.repetition = 1.5;
  }],
  ['missing required field', RECORD_REJECTION.INVALID_TEXT, (run) => {
    delete run.plan.semanticProfileId;
  }],
]);

async function caseMalformedRecordsRejected() {
  for (const [label, code, mutate] of MALFORMED) {
    const driven = [];
    for (const repetition of [1, 2]) {
      driven.push((await driveArm({targetId: LAGRANGE,
        repetition})).run);
    }
    const header = chainHeader(driven, [LAGRANGE]);
    mutate(driven[0]);
    reseal(driven[0]);
    assert.throws(() => validateRunRecord(driven[0]), (err) => err.code === code,
      `${label}: refused with ${code}`);
    const chain = new ChainPublication();
    try {
      await chain.append([header, ...driven]).publish();
      const {matrix, markdown} = publishedTargetCell(chain,
        {targetId: LAGRANGE, label: LABEL[LAGRANGE], smoke: true});
      assert.equal(matrix.status, CLAIM_CELL_STATUS.INVALID_MEASUREMENT, label);
      assert.equal(stringIncludes(markdown, `${REASON_PREFIX.RECORD_REJECTED}${code}`), true,
        `${label}: ${markdown}`);
      assert.equal(matrix.metrics, null, `${label}: no metric from a refused record`);
    } finally {
      chain.close();
    }
  }
  assert.equal(arrayEvery(MALFORMED, ([, code]) => typeof code === 'string'), true);
}

const OUTCOME_CASES = Object.freeze([
  ['J1 every response unresolved: product-failure with counts, never a number',
    caseJ1AllUnresolved],
  ['J2 data path broken: transport failure, no substitute request', caseJ2DataPathBroken],
  ['J3 product error envelope: product_error, never committed', caseJ3ProductError],
  ['J4 wrong value, missing row, zero affected rows: correctness_failure',
    caseJ4CorrectnessFailure],
  ['J5 lost commit answer: ambiguous_commit retained, effect at most once',
    caseJ5AmbiguousCommit],
  ['J15 product removed mid-run: no successful completion', caseJ15ProductRemoved],
  ['malformed numbers, duplicate ids, inconsistent counts, missing fields are refused',
    caseMalformedRecordsRejected],
]);

export {LABEL, OUTCOME_CASES};
