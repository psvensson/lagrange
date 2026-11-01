// Comparative benchmark chain: v2 record validation, claim admission through the
// real publication path (raw store -> admission -> matrix -> renderers), the
// append-only invalidation ledger and the offline recomputation check.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';

import {
  ADMISSION_REASON,
  CELL_STATUS_MAPPING,
  CLAIM_CELL_STATUS,
  campaignOutcomeOfCells,
} from '../benchmark-claim-admission.js';
import {appendInvalidationEntries} from '../benchmark-invalidation-ledger.js';
import {
  buildFixtureHeader,
  buildFixtureRun,
  fixtureTargetCell,
  publishFixtureCampaign,
  sealFixtureRun,
  setFixtureRequestOutcome,
  toNdjson,
  writeFixtureRoot,
} from '../comparative-benchmark-fixtures.js';
import {formatNum} from '../comparative-landing-svg-renderer.js';
import {FAILURE_CLASS, OPERATION_OUTCOME} from '../benchmark-operation-outcome.js';
import {BENCHMARK_RUN_STATUS} from '../benchmark-scenario-a-run.js';
import {BENCHMARK_PROFILE_CLASS} from '../benchmark-workload-dispatch.js';
import {OLTP_SCENARIO_A_SEMANTIC_GATE_STATUS} from '../oltp-scenario-a-semantic-gate.js';
import {
  EXECUTION_TARGET,
  READINESS_STATE,
  RECORD_REJECTION,
  computeV1PayloadDigest,
  validateRunRecord,
} from '../raw-observation-record.js';
import {SCENARIO_OUTCOME} from '../scenario-outcome.js';
import {ADVERSARIAL_CASES} from
  '../comparative-benchmark-adversarial-cases.js';
import {recomputeComparativeBenchmarks} from
  '../../../../scripts/checks/comparative-benchmark-recompute.js';

const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayMap = Function.call.bind(Array.prototype.map);
const stringIncludes = Function.call.bind(String.prototype.includes);
const stringReplace = Function.call.bind(String.prototype.replace);

const LAGRANGE = 'lagrange';
const TIDB = 'tidb-tikv';

function pair(options = {}) {
  return arrayMap([1, 2], (repetition) => buildFixtureRun({repetition, ...options}));
}

async function publish(rawRecords, invalidations = []) {
  const published = await publishFixtureCampaign({rawRecords, invalidations});
  fs.rmSync(published.root, {recursive: true, force: true});
  return published;
}

async function publishedLagrangeCell(mutate, options = {}) {
  const runs = pair(options);
  mutate(runs[0]);
  sealFixtureRun(runs[0], {keepPlan: true, keepFinalState: true});
  const {matrix, readme} = await publish([buildFixtureHeader({campaignId:
    'fixture-campaign'}), ...runs]);
  return {cell: fixtureTargetCell(matrix, LAGRANGE), readme};
}

function assertRejected(run, code) {
  assert.throws(() => validateRunRecord(run), (err) => err.code === code);
}

describe('raw observation record v2 validator', () => {
  it('accepts a complete fixture run', () => {
    assert.doesNotThrow(() => validateRunRecord(buildFixtureRun()));
  });

  it('throws on non-finite or negative timings instead of coercing them', () => {
    const nan = buildFixtureRun();
    nan.observations.requests[0].attempts[0].endedMs = Number.NaN;
    assertRejected(nan, RECORD_REJECTION.INVALID_TIMING);
    const negative = buildFixtureRun();
    negative.observations.window.drainMs = -1;
    assertRejected(negative, RECORD_REJECTION.INVALID_TIMING);
    const text = buildFixtureRun();
    text.plan.offeredRatePerSec = '100';
    assertRejected(text, RECORD_REJECTION.INVALID_TIMING);
  });

  it('throws on duplicate opIds, missing fields and inconsistent counts', () => {
    const dup = buildFixtureRun();
    dup.observations.requests[1].opId = dup.observations.requests[0].opId;
    assertRejected(dup, RECORD_REJECTION.DUPLICATE_OP_ID);
    const missing = buildFixtureRun();
    delete missing.deployment.dataset.verification.expectedLogicalChecksum;
    assertRejected(missing, RECORD_REJECTION.INVALID_TEXT);
    const counts = buildFixtureRun();
    counts.observations.accounting.offered += 1;
    assertRejected(counts, RECORD_REJECTION.ACCOUNTING_MISMATCH);
    const contradiction = buildFixtureRun();
    contradiction.observations.requests[0].completedAtMs = null;
    assertRejected(contradiction, RECORD_REJECTION.ACCOUNTING_INVARIANT);
    const recount = buildFixtureRun();
    recount.observations.accounting.committed -= 1;
    recount.observations.accounting.unresolved += 1;
    assertRejected(recount, RECORD_REJECTION.ACCOUNTING_MISMATCH);
    const fraction = buildFixtureRun();
    fraction.deployment.dataset.verification.observedTableRows.warehouse = 0.5;
    assertRejected(fraction, RECORD_REJECTION.INVALID_COUNT);
    const unexplained = buildFixtureRun();
    setFixtureRequestOutcome(unexplained.observations.requests[0], OPERATION_OUTCOME.UNRESOLVED,
      null);
    assertRejected(unexplained, RECORD_REJECTION.INVALID_ENUM);
  });

  it('refuses an execution target outside lab and gcp', () => {
    const local = buildFixtureRun();
    local.executionTarget = 'local-js-oracle';
    assertRejected(local, RECORD_REJECTION.INVALID_ENUM);
  });
});

describe('claim admission through the publication path', () => {
  it('admits a sufficient capacity run and renders its observed numbers', async () => {
    const {matrix, readme} = await publish([
      buildFixtureHeader({campaignId: 'fixture-campaign'}), ...pair()]);
    const cell = fixtureTargetCell(matrix, LAGRANGE);
    assert.equal(cell.status, CLAIM_CELL_STATUS.VALID_OBSERVED);
    assert.deepEqual(cell.reasons, []);
    assert.equal(cell.metrics.capacity.byRate[0].repetitions, 2);
    assert.equal(stringIncludes(readme, 'committed/s min'), true);
  });

  const invalidCases = [
    ['readiness exhausted', ADMISSION_REASON.READINESS_UNVERIFIED, (run) => {
      run.deployment.readiness.state = READINESS_STATE.EXHAUSTED;
    }],
    ['dataset snapshot mismatch', ADMISSION_REASON.DATASET_UNVERIFIED, (run) => {
      run.deployment.dataset.verification.observedTableRows.warehouse = 0;
    }],
    ['non-canonical retry policy', ADMISSION_REASON.NON_CANONICAL_WORKLOAD, (run) => {
      run.plan.retryPolicyId = 'exponential-backoff-v1';
    }],
    ['closed-loop profile', ADMISSION_REASON.NON_CANONICAL_WORKLOAD, (run) => {
      run.plan.openLoopProfileId = 'closed-loop-v1';
    }],
    ['semantic gate absent', ADMISSION_REASON.SEMANTIC_GATE_MISSING, (run) => {
      run.correctness.semanticGate = null;
    }],
    ['semantic gate incomplete', ADMISSION_REASON.SEMANTIC_GATE_NOT_PASSED, (run) => {
      run.correctness.semanticGate.status = 'incomplete';
    }],
    ['final state absent', ADMISSION_REASON.FINAL_STATE_MISSING, (run) => {
      run.correctness.finalState = null;
    }],
    ['sentinel image identity', ADMISSION_REASON.IDENTITY_MISSING, (run) => {
      run.identity.products[1].imageId = 'mismatched';
      run.identity.productsAfterWindow[1].imageId = 'mismatched';
    }],
    ['product container not running', ADMISSION_REASON.IDENTITY_NOT_RUNNING, (run) => {
      run.deployment.roles = run.deployment.roles.slice(1);
    }],
    ['load generator on a product host', ADMISSION_REASON.LOAD_GENERATOR_ON_PRODUCT_HOST,
      (run) => {
        run.deployment.loadGenerator.host = run.deployment.roles[1].host;
      }],
    ['restart during the window', ADMISSION_REASON.RESTART_DURING_WINDOW, (run) => {
      run.deployment.events = [{kind: 'restart', at: '2026-11-01T12:01:00.000Z'}];
    }],
    ['teardown not closed', ADMISSION_REASON.CLOSURE_INCOMPLETE, (run) => {
      run.deployment.closure = {status: 'incomplete', unclosed: ['ctr-2']};
    }],
    ['collapsed topology', ADMISSION_REASON.TOPOLOGY_MISMATCH, (run) => {
      for (const h of run.deployment.hosts) h.bootId = 'same-machine';
    }],
    ['delay formula in the plan', ADMISSION_REASON.DELAY_OR_BYTE_FORMULA, (run) => {
      run.plan.warmup = {delayFormula: 'execMs + stages * 2 * oneWayMs'};
    }],
    ['wrong dispatch family', ADMISSION_REASON.WRONG_DISPATCH_FAMILY, (run) => {
      run.scenario = 'scenarioC';
      run.claimKey = stringReplace(run.claimKey, '/scenarioA/', '/scenarioC/');
    }],
  ];
  for (const [label, reason, mutate] of invalidCases) {
    it(`refuses ${label} and prints the reason, never a number`, async () => {
      const {cell, readme} = await publishedLagrangeCell(mutate);
      assert.equal(cell.status, CLAIM_CELL_STATUS.INVALID_MEASUREMENT, label);
      assert.equal(arrayIncludes(cell.reasons, reason), true,
        `${label}: ${cell.reasons.join(', ')}`);
      assert.equal(cell.metrics, null);
      assert.equal(stringIncludes(readme, reason), true);
    });
  }

  it('a run with zero committed operations is a product failure with counts', async () => {
    const runs = arrayMap(pair(), (run) => {
      for (const r of run.observations.requests) {
        setFixtureRequestOutcome(r, OPERATION_OUTCOME.UNRESOLVED, FAILURE_CLASS.TRANSPORT_FAILURE);
      }
      return sealFixtureRun(run);
    });
    const {matrix, readme} = await publish([
      buildFixtureHeader({campaignId: 'fixture-campaign'}), ...runs]);
    const cell = fixtureTargetCell(matrix, LAGRANGE);
    assert.equal(cell.status, CLAIM_CELL_STATUS.PRODUCT_FAILURE);
    assert.equal(arrayIncludes(cell.reasons, ADMISSION_REASON.NO_COMMITTED_OPERATIONS), true);
    assert.equal(cell.metrics.accounting.unresolved, 240);
    assert.equal(cell.metrics.capacity, null);
    assert.equal(stringIncludes(readme, 'unresolved 240'), true);
  });

  it('a run that issued nothing is not a measurement', async () => {
    const {cell} = await publishedLagrangeCell(() => {}, {requestCount: 0});
    assert.equal(cell.status, CLAIM_CELL_STATUS.INVALID_MEASUREMENT);
    assert.equal(arrayIncludes(cell.reasons, ADMISSION_REASON.NO_ISSUED_OPERATIONS), true);
  });

  it('a failed semantic gate is a visible product failure', async () => {
    const {cell} = await publishedLagrangeCell((run) => {
      run.correctness.semanticGate.status = 'failed';
      run.correctness.semanticGate.failed = ['visibility'];
    });
    assert.equal(cell.status, CLAIM_CELL_STATUS.PRODUCT_FAILURE);
    assert.equal(arrayIncludes(cell.reasons, ADMISSION_REASON.SEMANTIC_GATE_FAILED), true);
  });

  it('fewer than 100 committed per run publishes counts, not capacity', async () => {
    const {cell, readme} = await publishedLagrangeCell(() => {}, {requestCount: 40});
    assert.equal(cell.status, CLAIM_CELL_STATUS.VALID_OBSERVED);
    assert.equal(arrayIncludes(cell.reasons, ADMISSION_REASON.INSUFFICIENT_SAMPLES), true);
    assert.equal(cell.metrics.capacity, null);
    assert.equal(stringIncludes(readme, 'committed/s'), false);
  });

  it('a smoke profile never publishes a capacity figure', async () => {
    const {cell} = await publishedLagrangeCell(() => {},
      {profileClass: BENCHMARK_PROFILE_CLASS.SMOKE});
    assert.equal(arrayIncludes(cell.reasons, ADMISSION_REASON.SMOKE_PROFILE), true);
    assert.equal(cell.metrics.capacity, null);
    assert.equal('committedPerSec' in cell.metrics.runs[0], false);
  });

  it('a forensic v1 record is never admitted and a declared entry keeps its status',
    async () => {
      const payload = {completed: 160, latenciesMs: [5000]};
      const v1 = {schemaVersion: 'lagrange-raw-observation-v1',
        receiptId: 'receipt-tidb-tikv-scenario-a', rawObservationPayload: payload,
        rawObservationsDigest: computeV1PayloadDigest(payload)};
      const {matrix, readme} = await publish([
        {schemaVersion: 'lagrange-raw-observation-campaign-v1', gitCommit: 'f'.repeat(40)}, v1]);
      const cell = fixtureTargetCell(matrix, TIDB);
      assert.equal(cell.status, CLAIM_CELL_STATUS.INVALID_MEASUREMENT);
      assert.equal(arrayIncludes(cell.reasons, ADMISSION_REASON.FORENSIC_RECORD), true);
      assert.equal(stringIncludes(readme, '5000'), false, 'forensic values never render');
      const blocked = fixtureTargetCell(matrix, LAGRANGE, 'scenarioB/one-remote-stage');
      assert.equal(blocked.status, CLAIM_CELL_STATUS.BLOCKED);
      assert.deepEqual(blocked.reasons, [ADMISSION_REASON.COMPILED_RISK_SERVICE_MISSING]);
      const absent = fixtureTargetCell(matrix, LAGRANGE);
      assert.equal(absent.status, CLAIM_CELL_STATUS.NOT_MEASURED);
    });
});

function setupFailed(run, setup) {
  for (const r of run.observations.requests) {
    Object.assign(r, {outcome: OPERATION_OUTCOME.UNISSUED, failureClass: null, attempts: [],
      issuedAtMs: null, executionStartedAtMs: null, completedAtMs: null, issueLagMs: null,
      queueDelayMs: null, latencyMs: null});
  }
  run.observations.runStatus = BENCHMARK_RUN_STATUS.SETUP_FAILED;
  run.observations.setup = setup;
  delete run.observations.window;
  delete run.observations.executedOperationsDigest;
  run.correctness = {semanticGate: null, finalState: null};
  sealFixtureRun(run, {keepPlan: true});
}

describe('semantic gate by profile class and stopped runs', () => {
  const incomplete = (run) => {
    run.correctness.semanticGate.status = OLTP_SCENARIO_A_SEMANTIC_GATE_STATUS.INCOMPLETE;
    run.correctness.semanticGate.missing = ['durability'];
  };

  it('a smoke run with an incomplete gate is admitted and says so', async () => {
    const {cell, readme} = await publishedLagrangeCell(incomplete,
      {profileClass: BENCHMARK_PROFILE_CLASS.SMOKE});
    assert.equal(cell.status, CLAIM_CELL_STATUS.VALID_OBSERVED);
    assert.equal(arrayIncludes(cell.reasons, ADMISSION_REASON.SEMANTIC_GATE_INCOMPLETE), true);
    assert.equal(arrayIncludes(cell.reasons, ADMISSION_REASON.SMOKE_PROFILE), true);
    assert.equal(cell.metrics.capacity, null);
    assert.equal(stringIncludes(readme, ADMISSION_REASON.SEMANTIC_GATE_INCOMPLETE), true);
  });

  it('a capacity run with an incomplete gate is not admitted', async () => {
    const {cell} = await publishedLagrangeCell(incomplete);
    assert.equal(cell.status, CLAIM_CELL_STATUS.INVALID_MEASUREMENT);
    assert.equal(arrayIncludes(cell.reasons, ADMISSION_REASON.SEMANTIC_GATE_NOT_PASSED), true);
  });

  it('a setup failure answered by the product (55P03) is a visible product failure',
    async () => {
      const {cell, readme} = await publishedLagrangeCell((run) => setupFailed(run, {
        failureClass: FAILURE_CLASS.PRODUCT_ERROR, sqlState: '55P03', code: '55P03',
        message: 'lock not available'}), {profileClass: BENCHMARK_PROFILE_CLASS.SMOKE});
      assert.equal(cell.status, CLAIM_CELL_STATUS.PRODUCT_FAILURE, cell.reasons.join(', '));
      assert.equal(arrayIncludes(cell.reasons, ADMISSION_REASON.DATASET_PREPARATION_FAILED),
        true);
      assert.equal(cell.metrics.setupFailures[0].sqlState, '55P03');
      assert.equal(stringIncludes(readme, ADMISSION_REASON.DATASET_PREPARATION_FAILED), true);
    });

  it('a setup failure of the harness itself is not a product result', async () => {
    const {cell} = await publishedLagrangeCell((run) => setupFailed(run, {
      failureClass: FAILURE_CLASS.HARNESS_FAULT, sqlState: null, code: null, message: 'x'}),
    {profileClass: BENCHMARK_PROFILE_CLASS.SMOKE});
    assert.equal(cell.status, CLAIM_CELL_STATUS.INVALID_MEASUREMENT);
    assert.equal(arrayIncludes(cell.reasons, ADMISSION_REASON.SETUP_HARNESS_FAULT), true);
  });
});

describe('status vocabulary and campaign outcome', () => {
  it('maps neighbouring vocabularies and never reads all-non-valid as passed', () => {
    assert.equal(CELL_STATUS_MAPPING.scenarioOutcome[SCENARIO_OUTCOME.REFUSED],
      CLAIM_CELL_STATUS.BLOCKED);
    assert.equal(CELL_STATUS_MAPPING.comparativeParityStatus.not_measured,
      CLAIM_CELL_STATUS.NOT_MEASURED);
    const cell = (status) => ({status});
    assert.equal(campaignOutcomeOfCells([cell(CLAIM_CELL_STATUS.NOT_MEASURED)]),
      SCENARIO_OUTCOME.REFUSED);
    assert.equal(campaignOutcomeOfCells([cell(CLAIM_CELL_STATUS.INVALID_MEASUREMENT),
      cell(CLAIM_CELL_STATUS.VALID_OBSERVED)]), SCENARIO_OUTCOME.FAILED);
    assert.equal(campaignOutcomeOfCells([cell(CLAIM_CELL_STATUS.VALID_OBSERVED),
      cell(CLAIM_CELL_STATUS.BLOCKED)]), SCENARIO_OUTCOME.PASSED);
  });

  it('formatNum never invents a number for a missing value', () => {
    assert.equal(formatNum(null), CLAIM_CELL_STATUS.NOT_MEASURED);
    assert.equal(formatNum(undefined), CLAIM_CELL_STATUS.NOT_MEASURED);
    assert.equal(formatNum(CLAIM_CELL_STATUS.BLOCKED), CLAIM_CELL_STATUS.BLOCKED);
    assert.equal(formatNum(0), '0.00', 'a real observed zero stays distinguishable');
  });
});

describe('invalidation ledger and offline recomputation', () => {
  it('the ledger writer appends and refuses to rewrite an entry', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-'));
    try {
      const file = path.join(dir, 'invalidations.ndjson');
      const entry = {id: 'inv-0001', recordedAt: '2026-11-01T00:00:00.000Z',
        scope: {file: 'x', campaignGitCommit: null, receiptIds: 'all'},
        reasons: [ADMISSION_REASON.EMULATED_PRODUCT], defectIds: ['D06'], note: 'n',
        recordedBy: 'test'};
      appendInvalidationEntries(file, [entry]);
      const before = fs.readFileSync(file, 'utf8');
      assert.throws(() => appendInvalidationEntries(file, [{...entry, note: 'changed'}]),
        /refusing to rewrite/u);
      assert.throws(() => appendInvalidationEntries(file, [{...entry, id: 'inv-0002',
        reasons: ['made-up-reason']}]), /unknown code/u);
      assert.equal(fs.readFileSync(file, 'utf8'), before);
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });

  it('fails when a raw file is missing, a forensic record is corrupt or uncovered',
    async () => {
      const payload = {completed: 1};
      const v1 = {schemaVersion: 'lagrange-raw-observation-v1', receiptId: 'receipt-x',
        rawObservationPayload: payload, rawObservationsDigest: computeV1PayloadDigest(payload)};
      const header = {schemaVersion: 'lagrange-raw-observation-campaign-v1', gitCommit: 'f'};
      const {root} = await publishFixtureCampaign({rawRecords: [header, v1]});
      try {
        const uncovered = await recomputeComparativeBenchmarks(root);
        assert.match(uncovered.difference, /receipt-x has no ledger entry/u);
        const rawPath = path.join(root, 'data/tidb-comparison/raw-observations.ndjson');
        fs.writeFileSync(rawPath, toNdjson([header, {...v1, rawObservationPayload: {
          completed: 2}}]));
        const corrupt = await recomputeComparativeBenchmarks(root);
        assert.match(corrupt.difference, /digest-mismatch/u);
        fs.rmSync(rawPath);
        const missing = await recomputeComparativeBenchmarks(root);
        assert.match(missing.difference, /raw-observations\.ndjson/u);
      } finally {
        fs.rmSync(root, {recursive: true, force: true});
      }
    });

  it('a generated artifact edited by hand fails recomputation', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'recompute-'));
    try {
      writeFixtureRoot(root, {rawRecords: [buildFixtureHeader({campaignId: 'c',
        executionTarget: EXECUTION_TARGET.LAB})]});
      const {regenerateAllBenchmarkArtifactsFromAdmitted} = await import(
        '../raw-observation-campaign-specs.js');
      await regenerateAllBenchmarkArtifactsFromAdmitted(root);
      assert.equal((await recomputeComparativeBenchmarks(root)).ok, true);
      const matrixPath = path.join(root, 'data/tidb-comparison/multi-system-matrix.json');
      fs.appendFileSync(matrixPath, ' ');
      const edited = await recomputeComparativeBenchmarks(root);
      assert.match(edited.difference, /multi-system-matrix\.json differs/u);
    } finally {
      fs.rmSync(root, {recursive: true, force: true});
    }
  });
});

describe('adversarial acceptance cases (J9, J10, J12, J13)', () => {
  for (const [name, run] of Object.entries(ADVERSARIAL_CASES)) {
    it(name, run);
  }
});
