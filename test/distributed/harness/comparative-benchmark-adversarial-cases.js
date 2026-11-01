// Adversarial acceptance cases for the comparative benchmark chain (owner brief
// J9, J10, J12, J13 and the model-challenge amendments). Each case publishes a
// fixture campaign through the real chain (raw store -> admission -> matrix ->
// renderers -> recomputation) and asserts the outcome. Throws on the first case
// the chain does not handle.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  ADMISSION_REASON,
  CLAIM_CELL_STATUS,
  REASON_PREFIX,
} from './benchmark-claim-admission.js';
import {
  buildFixtureHeader,
  buildFixtureRun,
  fixtureTargetCell,
  publishFixtureCampaign,
  sealFixtureRun,
  setFixtureRequestOutcome,
} from './comparative-benchmark-fixtures.js';
import {FAILURE_CLASS, OPERATION_OUTCOME} from './benchmark-operation-outcome.js';
import {BENCHMARK_PROFILE_CLASS} from './benchmark-workload-dispatch.js';
import {recomputeComparativeBenchmarks} from '../../../scripts/checks/comparative-benchmark-recompute.js';

const arrayFind = Function.call.bind(Array.prototype.find);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayMap = Function.call.bind(Array.prototype.map);
const stringIncludes = Function.call.bind(String.prototype.includes);
const stringReplace = Function.call.bind(String.prototype.replace);

const CAMPAIGN = 'fixture-campaign';
const OTHER_CAMPAIGN = 'fixture-campaign-other';
const LAGRANGE = 'lagrange';
const TIDB = 'tidb-tikv';
const PG = 'pg-single-primary';
const SMOKE_SUBKIND = 'smoke';
const SMOKE_COLUMN = 'scenarioA/smoke';
const RAW_FILE = 'data/tidb-comparison/raw-observations.ndjson';

function header(campaignId = CAMPAIGN) {
  return buildFixtureHeader({campaignId});
}

function pair(targetId, options = {}) {
  return arrayMap([1, 2], (repetition) => buildFixtureRun({targetId, repetition, ...options}));
}

async function withPublication(rawRecords, check, invalidations = []) {
  const published = await publishFixtureCampaign({rawRecords, invalidations});
  try {
    return await check(published);
  } finally {
    fs.rmSync(published.root, {recursive: true, force: true});
  }
}

function assertInvalid(cell, reason, label) {
  assert.equal(cell.status, CLAIM_CELL_STATUS.INVALID_MEASUREMENT, `${label}: status`);
  assert.equal(arrayIncludes(cell.reasons, reason), true,
    `${label}: expected reason ${reason}, got ${cell.reasons.join(', ')}`);
  assert.equal(cell.metrics, null, `${label}: an invalid cell carries no metrics`);
}

async function expectInvalidLagrange(label, reason, mutate) {
  const runs = pair(LAGRANGE);
  mutate(runs[0]);
  await withPublication([header(), ...runs], ({matrix, readme}) => {
    assertInvalid(fixtureTargetCell(matrix, LAGRANGE), reason, label);
    assert.equal(stringIncludes(readme, reason), true, `${label}: the page prints the reason`);
  });
}

// J12 and the baseline: a losing arm and a failing arm stay visible.
async function caseValidNegativeResultsStayVisible() {
  const pgRuns = arrayMap(pair(PG, {hostCount: 1}), (run) => {
    for (const r of run.observations.requests) {
      setFixtureRequestOutcome(r, OPERATION_OUTCOME.TERMINAL_FAILURE, FAILURE_CLASS.PRODUCT_ERROR);
    }
    return sealFixtureRun(run);
  });
  const rawRecords = [header(), ...pair(LAGRANGE), ...pair(TIDB, {latencyMs: 400}), ...pgRuns];
  await withPublication(rawRecords, async ({root, matrix, readme}) => {
    const lagrange = fixtureTargetCell(matrix, LAGRANGE);
    const tidb = fixtureTargetCell(matrix, TIDB);
    assert.equal(lagrange.status, CLAIM_CELL_STATUS.VALID_OBSERVED, 'baseline admitted');
    assert.equal(tidb.status, CLAIM_CELL_STATUS.VALID_OBSERVED, 'J12 slower arm admitted');
    assert.equal(tidb.metrics.runs[0].latencyMs.p99, 400, 'J12 slow p99 kept as observed');
    assert.equal(stringIncludes(readme, 'p99 400.00 ms'), true, 'J12 slow arm rendered');
    const pg = fixtureTargetCell(matrix, PG);
    assert.equal(pg.status, CLAIM_CELL_STATUS.PRODUCT_FAILURE, 'J12 failing arm visible');
    assert.equal(pg.metrics.accounting.terminalFailures[FAILURE_CLASS.PRODUCT_ERROR], 240);
    assert.equal(stringIncludes(readme, 'product_error 240'), true, 'failure class printed');
    const recompute = await recomputeComparativeBenchmarks(root);
    assert.equal(recompute.ok, true, `fixture recompute: ${recompute.difference}`);
  });
}

// J9: a plausible but wrong identity is refused.
async function caseWrongIdentity() {
  await expectInvalidLagrange('J9 harness sha', ADMISSION_REASON.IDENTITY_MISMATCH, (run) => {
    run.identity.harness.gitCommit = 'b'.repeat(40);
    sealFixtureRun(run);
  });
  await expectInvalidLagrange('J9 image swap', ADMISSION_REASON.IDENTITY_CHANGED_DURING_WINDOW,
    (run) => {
      run.identity.productsAfterWindow[0].imageId = `sha256:${'9'.repeat(64)}`;
      sealFixtureRun(run);
    });
  await expectInvalidLagrange('J9 unbound proof', ADMISSION_REASON.SEMANTIC_GATE_UNBOUND,
    (run) => {
      run.correctness.semanticGate.binding.containerId = 'ctr-leftover';
      sealFixtureRun(run);
    });
  await expectInvalidLagrange('wrong container', ADMISSION_REASON.ENDPOINT_NOT_BOUND, (run) => {
    run.deployment.endpoint.containerId = 'ctr-leftover';
    run.correctness.semanticGate.binding.containerId = 'ctr-leftover';
    sealFixtureRun(run);
  });
}

// J10: edits to counts, elapsed time, latencies, bytes or final state are detected.
async function caseEditedObservations() {
  await expectInvalidLagrange('J10 counts', `${REASON_PREFIX.RECORD_REJECTED}accounting-mismatch`,
    (run) => {
      run.observations.accounting.committed -= 1;
      run.observations.accounting.unresolved += 1;
    });
  await expectInvalidLagrange('J10 elapsed', ADMISSION_REASON.RAW_DIGEST_MISMATCH, (run) => {
    run.observations.window.scheduledMs /= 2;
  });
  await expectInvalidLagrange('J10 latency', ADMISSION_REASON.RAW_DIGEST_MISMATCH, (run) => {
    run.observations.requests[0].attempts[0].endedMs -= 1;
  });
  await expectInvalidLagrange('J10 bytes', ADMISSION_REASON.RAW_DIGEST_MISMATCH, (run) => {
    run.observations.network = {scope: 'host-nic-total', byHost: {'lab-host-1': 1}};
  });
  await expectInvalidLagrange('J10 final state', ADMISSION_REASON.RAW_DIGEST_MISMATCH, (run) => {
    run.correctness.finalState.after.tableRows.orders += 5;
  });
  await expectInvalidLagrange('unreconciled state', ADMISSION_REASON.FINAL_STATE_UNRECONCILED,
    (run) => {
      run.correctness.finalState.after.tableRows.orders -= 7;
      sealFixtureRun(run, {keepFinalState: true});
    });
  await expectInvalidLagrange('wrong operations', ADMISSION_REASON.EXECUTED_OPERATIONS_MISMATCH,
    (run) => {
      run.plan.operationSliceDigest = `sha256:${'7'.repeat(64)}`;
      sealFixtureRun(run, {keepPlan: true});
    });
}

// J13: a mixed-campaign row, a duplicate claim and edited generated output fail.
async function caseMixedAndEditedPublication() {
  const runs = pair(LAGRANGE);
  const other = buildFixtureRun({campaignId: OTHER_CAMPAIGN, repetition: 3});
  await withPublication([header(), header(OTHER_CAMPAIGN), ...runs, other], ({matrix}) => {
    assertInvalid(fixtureTargetCell(matrix, LAGRANGE), ADMISSION_REASON.MIXED_CAMPAIGN,
      'J13 mixed campaign');
  });
  const dup = buildFixtureRun({repetition: 1});
  dup.runId = `${dup.runId}-again`;
  await withPublication([header(), ...runs, sealFixtureRun(dup)], ({matrix}) => {
    assertInvalid(fixtureTargetCell(matrix, LAGRANGE), ADMISSION_REASON.DUPLICATE_CLAIM,
      'duplicate claim');
  });
  await withPublication([header(), ...pair(LAGRANGE)], async ({root}) => {
    const readmePath = path.join(root, 'docs/benchmarks/README.md');
    fs.writeFileSync(readmePath, stringReplace(fs.readFileSync(readmePath, 'utf8'),
      /invalid-measurement/u, 'valid-observed'));
    const recompute = await recomputeComparativeBenchmarks(root);
    assert.equal(recompute.ok, false, 'J13 edited page must fail recomputation');
    assert.match(recompute.difference, /docs\/benchmarks\/README\.md differs/u);
  });
}

// Amendment 6: a ledger entry appended after publication flips the cell.
async function caseLateInvalidation() {
  const runs = pair(LAGRANGE);
  const entry = {
    id: 'inv-0001', recordedAt: '2026-11-02T00:00:00.000Z',
    scope: {file: RAW_FILE, campaignGitCommit: null, receiptIds: [runs[0].runId]},
    reasons: [ADMISSION_REASON.TIMEOUT_COUNTED_AS_SUCCESS], defectIds: ['D01'],
    note: 'fixture late invalidation', recordedBy: 'fixture',
  };
  await withPublication([header(), ...runs], ({matrix}) => {
    const cell = fixtureTargetCell(matrix, LAGRANGE);
    assert.equal(cell.status, CLAIM_CELL_STATUS.VALID_OBSERVED, 'one live run remains');
    assert.equal(arrayIncludes(cell.reasons, ADMISSION_REASON.INSUFFICIENT_SAMPLES), true,
      'one repetition is not sufficient for a capacity figure');
    assert.equal(cell.metrics.capacity, null, 'no capacity figure from one repetition');
  }, [entry]);
  const both = {...entry, scope: {...entry.scope, receiptIds: arrayMap(runs, (r) => r.runId)}};
  await withPublication([header(), ...runs], ({matrix}) => {
    assertInvalid(fixtureTargetCell(matrix, LAGRANGE), `${REASON_PREFIX.INVALIDATED}inv-0001`,
      'late invalidation');
  }, [both]);
}

// Amendment 3: a smoke profile publishes counts only.
async function caseSmokeHasNoCapacity() {
  const smokeRuns = pair(LAGRANGE, {profileClass: BENCHMARK_PROFILE_CLASS.SMOKE,
    subkind: SMOKE_SUBKIND});
  await withPublication([header(), ...smokeRuns],
    ({matrix, readme}) => {
      const cell = fixtureTargetCell(matrix, LAGRANGE, SMOKE_COLUMN);
      assert.equal(cell.status, CLAIM_CELL_STATUS.VALID_OBSERVED);
      assert.equal(arrayIncludes(cell.reasons, ADMISSION_REASON.SMOKE_PROFILE), true);
      assert.equal(cell.metrics.capacity, null);
      assert.equal(stringIncludes(readme, 'committed/s'), false, 'no capacity text for smoke');
    });
}

// D11: a scale-out claim never admits a run, whatever family it executed.
async function caseScaleoutClaimNeverAdmitted() {
  const run = buildFixtureRun({subkind: 'fixed-3node'});
  await withPublication([header(), run], ({matrix}) => {
    const exp = arrayFind(matrix.experiments,
      (e) => e.experimentId === 'scaleout-3to5-node-rf3');
    const cell = arrayFind(exp.rows, (r) => r.rowId === 'fixed/lagrange').cells['3-node'];
    assert.equal(cell.status, CLAIM_CELL_STATUS.NOT_MEASURED);
    assert.equal(arrayIncludes(cell.reasons, ADMISSION_REASON.CLAIM_KIND_NOT_OBSERVED), true);
  });
}

const ADVERSARIAL_CASES = Object.freeze({
  'J12-valid-negative-results-visible': caseValidNegativeResultsStayVisible,
  'J9-wrong-identity': caseWrongIdentity,
  'J10-edited-observations': caseEditedObservations,
  'J13-mixed-or-edited-publication': caseMixedAndEditedPublication,
  'late-invalidation-flips-cell': caseLateInvalidation,
  'smoke-has-no-capacity': caseSmokeHasNoCapacity,
  'D11-scaleout-never-admitted': caseScaleoutClaimNeverAdmitted,
});

async function runAdversarialCases(names = Object.keys(ADVERSARIAL_CASES)) {
  for (const name of names) await ADVERSARIAL_CASES[name]();
}

export {ADVERSARIAL_CASES, runAdversarialCases};
