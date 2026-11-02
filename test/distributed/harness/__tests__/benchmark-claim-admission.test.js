// Comparative benchmark chain: v2 record validation, claim admission through the
// real publication path (raw store -> admission -> matrix -> renderers), the
// append-only invalidation ledger and the offline recomputation check.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
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
  composeFixtureRunFromDriverOutput,
  fixtureTargetCell,
  publishFixtureCampaign,
  sealFixtureRun,
  setFixtureRequestOutcome,
  toNdjson,
  writeFixtureRoot,
} from '../comparative-benchmark-fixtures.js';
import {formatNum} from '../comparative-landing-svg-renderer.js';
import {computeV1PayloadDigest} from '../raw-observation-forensic-reader.js';
import {
  benchmarkDriverSourceIdentity,
  executeBenchmarkWorkload,
} from '../real-product-workload-drivers.js';
import {
  FAKE_PRODUCT_FAULT,
  createFakeOltpProduct,
} from './real-product-workload-driver-fake-product.js';
import {
  BENCHMARK_RESPONSE_EVIDENCE_ENCODING,
  FAILURE_CLASS,
  OPERATION_OUTCOME,
  retainBenchmarkResponseEvidence,
} from '../benchmark-operation-outcome.js';
import {
  BENCHMARK_RUN_STATUS,
  BENCHMARK_SCENARIO_A_ADAPTER_ID,
} from '../benchmark-scenario-a-run.js';
import {BENCHMARK_PROFILE_CLASS} from '../benchmark-workload-dispatch.js';
import {OLTP_SCENARIO_A_SEMANTIC_GATE_STATUS} from '../oltp-scenario-a-semantic-gate.js';
import {
  EXECUTION_TARGET,
  READINESS_STATE,
  RECORD_REJECTION,
  computeRunObservationsDigest,
  validateCampaignHeader,
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
const stringStartsWith = Function.call.bind(String.prototype.startsWith);

const LAGRANGE = 'lagrange';
// The smoke claim: its subkind names the smoke profile, whose class is smoke.
const SMOKE = Object.freeze({subkind: 'smoke'});
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
  sealFixtureRun(runs[0], {keepFinalState: true});
  const {matrix, readme} = await publish([buildFixtureHeader({campaignId:
    'fixture-campaign', targetIds: [LAGRANGE]}), ...runs]);
  return {cell: fixtureTargetCell(matrix, LAGRANGE,
    options.subkind === SMOKE.subkind ? 'scenarioA/smoke' : 'scenarioA'), readme};
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
    const transport = buildFixtureRun();
    setFixtureRequestOutcome(transport.observations.requests[0], OPERATION_OUTCOME.UNRESOLVED,
      FAILURE_CLASS.TRANSPORT_FAILURE);
    assertRejected(transport, RECORD_REJECTION.INVALID_ENUM);
    const watchdog = buildFixtureRun();
    setFixtureRequestOutcome(watchdog.observations.requests[0], OPERATION_OUTCOME.UNRESOLVED,
      FAILURE_CLASS.WATCHDOG_STOPPED);
    sealFixtureRun(watchdog);
    assert.doesNotThrow(() => validateRunRecord(watchdog));
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
      buildFixtureHeader({campaignId: 'fixture-campaign', targetIds: [LAGRANGE]}), ...pair()]);
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
      run.deployment.placement = {delayFormula: 'execMs + stages * 2 * oneWayMs'};
    }],
    ['executed warm-up differs from the plan', ADMISSION_REASON.WARMUP_PLAN_MISMATCH,
      (run) => {
        run.plan.warmup = {operations: 10, digest: `sha256:${'6'.repeat(64)}`};
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
        setFixtureRequestOutcome(r, OPERATION_OUTCOME.UNRESOLVED, FAILURE_CLASS.AMBIGUOUS_COMMIT);
      }
      return sealFixtureRun(run);
    });
    const {matrix, readme} = await publish([
      buildFixtureHeader({campaignId: 'fixture-campaign', targetIds: [LAGRANGE]}), ...runs]);
    const cell = fixtureTargetCell(matrix, LAGRANGE);
    assert.equal(cell.status, CLAIM_CELL_STATUS.PRODUCT_FAILURE);
    assert.equal(arrayIncludes(cell.reasons, ADMISSION_REASON.NO_COMMITTED_OPERATIONS), true);
    assert.equal(cell.metrics.accounting.unresolved, 240);
    assert.equal(cell.metrics.capacity, null);
    assert.equal(stringIncludes(readme, 'unresolved 240'), true);
  });

  it('a run that issued nothing is not a measurement', async () => {
    // A completed window in which every planned request stayed unissued.
    const {cell} = await publishedLagrangeCell((run) => {
      for (const r of run.observations.requests) {
        Object.assign(r, {outcome: OPERATION_OUTCOME.UNISSUED, failureClass: null,
          attempts: [], issuedAtMs: null, executionStartedAtMs: null, completedAtMs: null,
          issueLagMs: null, queueDelayMs: null, latencyMs: null});
      }
      sealFixtureRun(run);
    });
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

  // Live campaign bench-live-20261101-b-r6: every lab run read as
  // topology-mismatch - admission joined roles (named by address, as every
  // deployer records them) to hosts by hostId (the lab inventory name).
  it('roles named by address join their lab hosts; no false topology mismatch', async () => {
    const {cell} = await publishedLagrangeCell(() => {}, SMOKE);
    assert.equal(arrayIncludes(cell.reasons, ADMISSION_REASON.TOPOLOGY_MISMATCH), false,
      JSON.stringify(cell.reasons));
  });

  it('a smoke profile never publishes a capacity figure', async () => {
    const {cell} = await publishedLagrangeCell(() => {},
      SMOKE);
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
        {schemaVersion: 'lagrange-raw-observation-campaign-v1', recordType: 'campaign-header',
          gitCommit: 'f'.repeat(40)}, v1]);
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
  sealFixtureRun(run);
}

describe('harness identity across a multi-arm campaign', () => {
  const ARMS = Object.freeze(['lagrange-pgwire', 'tidb-mysql2', 'postgresql-pgwire']);

  async function publishWithHarness(runHarness, headerHarness) {
    const runs = arrayMap(pair(), (run) => {
      run.identity.harness = {...run.identity.harness, ...runHarness};
      return sealFixtureRun(run);
    });
    const header = buildFixtureHeader({campaignId: 'fixture-campaign', targetIds: [LAGRANGE]});
    header.harness = {...header.harness, ...headerHarness};
    const {matrix} = await publish([header, ...runs]);
    return fixtureTargetCell(matrix, LAGRANGE);
  }

  it('a run whose adapters are a subset of the campaign union is the same harness',
    async () => {
      const cell = await publishWithHarness({adapterIds: [ARMS[0]]}, {adapterIds: ARMS});
      assert.equal(cell.status, CLAIM_CELL_STATUS.VALID_OBSERVED, cell.reasons.join(', '));
    });

  it('an adapter outside the campaign union is a harness mismatch', async () => {
    const cell = await publishWithHarness({adapterIds: ['other-adapter']},
      {adapterIds: ARMS});
    assert.equal(cell.status, CLAIM_CELL_STATUS.INVALID_MEASUREMENT);
    assert.equal(arrayIncludes(cell.reasons, ADMISSION_REASON.HARNESS_MISMATCH), true,
      cell.reasons.join(', '));
  });

  it('a different driver source digest or commit is a harness mismatch', async () => {
    for (const change of [{driverSourceSha256: 'e'.repeat(64)}, {gitCommit: 'c'.repeat(40)}]) {
      const cell = await publishWithHarness(change, {});
      assert.equal(arrayIncludes(cell.reasons, ADMISSION_REASON.HARNESS_MISMATCH), true,
        cell.reasons.join(', '));
    }
  });

  it('a dirty checkout is a typed identity fact that refuses the cell', async () => {
    for (const [runDirty, headerDirty] of [[true, false], [false, true]]) {
      const cell = await publishWithHarness({checkoutDirty: runDirty},
        {checkoutDirty: headerDirty});
      assert.equal(cell.status, CLAIM_CELL_STATUS.INVALID_MEASUREMENT);
      assert.equal(arrayIncludes(cell.reasons, ADMISSION_REASON.CHECKOUT_DIRTY), true,
        cell.reasons.join(', '));
    }
  });
});

describe('semantic gate by profile class and stopped runs', () => {
  const incomplete = (run) => {
    run.correctness.semanticGate.status = OLTP_SCENARIO_A_SEMANTIC_GATE_STATUS.INCOMPLETE;
    run.correctness.semanticGate.missing = ['durability'];
  };

  it('a smoke run with an incomplete gate is admitted and says so', async () => {
    const {cell, readme} = await publishedLagrangeCell(incomplete, SMOKE);
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
        message: 'lock not available'}), SMOKE);
      assert.equal(cell.status, CLAIM_CELL_STATUS.PRODUCT_FAILURE, cell.reasons.join(', '));
      assert.equal(arrayIncludes(cell.reasons, ADMISSION_REASON.DATASET_PREPARATION_FAILED),
        true);
      assert.equal(cell.metrics.setupFailures[0].sqlState, '55P03');
      assert.equal(stringIncludes(readme, ADMISSION_REASON.DATASET_PREPARATION_FAILED), true);
    });

  it('an exhausted deployment that never named its client endpoint is the ' +
    'readiness-exhausted product failure, every request unissued', async () => {
    const {cell} = await publishedLagrangeCell((run) => {
      run.deployment.readiness = {state: READINESS_STATE.EXHAUSTED,
        observedAt: run.deployment.readiness.observedAt, evidence: {polls: 120}};
      run.deployment.endpoint = null;
      setupFailed(run, {failureClass: FAILURE_CLASS.PRODUCT_ERROR, sqlState: null,
        code: 'readiness_exhausted', message: 'membership 1 of 3'});
    }, SMOKE);
    assert.equal(cell.status, CLAIM_CELL_STATUS.PRODUCT_FAILURE, cell.reasons.join(', '));
    assert.equal(arrayIncludes(cell.reasons, ADMISSION_REASON.READINESS_EXHAUSTED), true);
    assert.equal(cell.metrics.runs[0].accounting.issued, 0);
  });

  it('a ready deployment without a client endpoint is a rejected record', async () => {
    const {cell} = await publishedLagrangeCell((run) => {
      run.deployment.endpoint = null;
      sealFixtureRun(run);
    });
    assert.equal(cell.status, CLAIM_CELL_STATUS.INVALID_MEASUREMENT);
    assert.equal(arrayIncludes(arrayMap(cell.reasons,
      (reason) => stringStartsWith(reason, 'record-rejected')), true), true,
    cell.reasons.join(', '));
  });

  it('a setup failure of the harness itself is not a product result', async () => {
    const {cell} = await publishedLagrangeCell((run) => setupFailed(run, {
      failureClass: FAILURE_CLASS.HARNESS_FAULT, sqlState: null, code: null, message: 'x'}),
    SMOKE);
    assert.equal(cell.status, CLAIM_CELL_STATUS.INVALID_MEASUREMENT);
    assert.equal(arrayIncludes(cell.reasons, ADMISSION_REASON.SETUP_HARNESS_FAULT), true);
  });
});

const REPO_DATA_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname),
  '../../../../data');

// Every file under a directory with its size and modification time.
function directoryState(dir) {
  return arrayMap(fs.readdirSync(dir, {recursive: true}).sort(), (rel) => {
    const stat = fs.statSync(path.join(dir, rel));
    return `${rel}:${stat.size}:${stat.mtimeMs}`;
  });
}

function retainedEvidence(output) {
  const out = [];
  for (const request of output.observations?.requests || []) {
    if (request.responseEvidence?.encoding === BENCHMARK_RESPONSE_EVIDENCE_ENCODING.RETAINED_FILE) {
      out.push(request.responseEvidence);
    }
  }
  return out;
}

// The evidence directory holds exactly the files the record references, each
// with the sha256 the record states.
function assertEvidenceFilesReferenced(output, evidenceDir) {
  const references = retainedEvidence(output);
  const written = fs.existsSync(evidenceDir) ? fs.readdirSync(evidenceDir).sort() : [];
  assert.deepEqual(written, arrayMap(references, (r) => path.basename(r.path)).sort(),
    'every written evidence file is referenced by a request record');
  for (const reference of references) {
    assert.equal(path.dirname(reference.path), evidenceDir);
    const bytes = fs.readFileSync(reference.path);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), reference.sha256,
      `${reference.path} matches its recorded sha256`);
  }
}

describe('driver output through admission', () => {
  it('response evidence over the inline bound is a retained file the record references',
    async () => {
      const evidenceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-evidence-'));
      const dataBefore = directoryState(REPO_DATA_DIR);
      try {
        const runs = pair();
        const request = runs[0].observations.requests[0];
        const retained = retainBenchmarkResponseEvidence(request.attempts,
          {evidenceDir, inlineMaxBytes: 1});
        request.attempts = retained.attempts;
        request.responseEvidence = retained.responseEvidence;
        sealFixtureRun(runs[0]);
        assert.equal(request.responseEvidence.encoding,
          BENCHMARK_RESPONSE_EVIDENCE_ENCODING.RETAINED_FILE);
        assertEvidenceFilesReferenced(runs[0], evidenceDir);
        const header = buildFixtureHeader({campaignId: 'fixture-campaign', targetIds: [LAGRANGE]});
        const {matrix} = await publish([header, ...runs]);
        assert.equal(fixtureTargetCell(matrix, LAGRANGE).status,
          CLAIM_CELL_STATUS.VALID_OBSERVED);
        assert.deepEqual(directoryState(REPO_DATA_DIR), dataBefore,
          'nothing is written under the repository data/ directory');
      } finally {
        fs.rmSync(evidenceDir, {recursive: true, force: true});
      }
    });

  it('the Lagrange smoke record that ends setup-failed (55P03) is a product failure',
    async () => {
      const product = createFakeOltpProduct(FAKE_PRODUCT_FAULT.LOAD_LOCK_NOT_AVAILABLE);
      const endpoint = {host: '10.0.0.1', port: 5432};
      const evidenceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-evidence-'));
      const dataBefore = directoryState(REPO_DATA_DIR);
      let output;
      try {
        output = await executeBenchmarkWorkload({
          targetId: LAGRANGE, system: LAGRANGE, scenario: 'scenarioA', subkind: 'smoke',
          connection: {endpoint, credentials: {user: 'u', password: 'p', database: 'd'}},
          plan: {offeredRatePerSec: 50, repetition: 1, orderIndex: 0},
          drivers: {createPgClient: product.createPgClient,
            createMysqlConnection: product.createMysqlConnection},
          evidenceDir,
        });
        assertEvidenceFilesReferenced(output, evidenceDir);
        assert.deepEqual(directoryState(REPO_DATA_DIR), dataBefore,
          'the run writes nothing under the repository data/ directory');
      } finally {
        fs.rmSync(evidenceDir, {recursive: true, force: true});
      }
      assert.equal(output.observations.runStatus, BENCHMARK_RUN_STATUS.SETUP_FAILED);
      const base = buildFixtureRun({subkind: 'smoke', offeredRatePerSec: 50,
        profileClass: BENCHMARK_PROFILE_CLASS.SMOKE});
      const run = composeFixtureRunFromDriverOutput(base, output);
      // The campaign header carries the executed-driver digest from the driver's
      // own identity function and the adapter union over the three arms.
      const {driverSourceSha256} = await benchmarkDriverSourceIdentity();
      assert.equal(run.identity.harness.driverSourceSha256, driverSourceSha256);
      const header = buildFixtureHeader({campaignId: 'fixture-campaign',
        targetIds: [LAGRANGE]});
      header.harness = {...header.harness, driverSourceSha256,
        adapterIds: [...Object.values(BENCHMARK_SCENARIO_A_ADAPTER_ID)]};
      const {matrix, readme} = await publish([header, run]);
      const cell = fixtureTargetCell(matrix, LAGRANGE, 'scenarioA/smoke');
      assert.equal(cell.status, CLAIM_CELL_STATUS.PRODUCT_FAILURE, cell.reasons.join(', '));
      assert.equal(arrayIncludes(cell.reasons, ADMISSION_REASON.DATASET_PREPARATION_FAILED),
        true);
      assert.equal(cell.metrics.setupFailures[0].sqlState, '55P03');
      assert.equal(cell.metrics.accounting.unissued, cell.metrics.accounting.offered);
      assert.equal(stringIncludes(readme, '55P03'), true, 'the 55P03 evidence is visible');
    });
});

// Coordinator decisions 1 and 2 (2026-11-02), from live campaign
// bench-live-20261101-b-r6: identity compares content (RootFS diff_ids) per
// role, never per-host image facts; an exhausted arm's unanswered version is
// null with its reason, admitted only on an exhausted or setup-failed run.
describe('content identity and the exhausted arm', () => {
  const EXHAUSTED_LAST = Object.freeze({ready: false, phase: 'DEGRADED', state: 'degraded',
    reasons: ['PRIORITY_CONTROL_PLANE_RECOVERY_PENDING']});

  async function exhaustedLagrangeRun() {
    const product = createFakeOltpProduct(FAKE_PRODUCT_FAULT.NONE);
    const evidenceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-evidence-'));
    let output;
    try {
      output = await executeBenchmarkWorkload({
        targetId: LAGRANGE, system: LAGRANGE, scenario: 'scenarioA', subkind: 'smoke',
        setupFailure: {failureClass: 'product_error', sqlState: null,
          code: 'readiness_exhausted',
          message: 'lagrange-node@10.0.0.2 did not report ready after 120 attempts'},
        plan: {offeredRatePerSec: 5, repetition: 1, orderIndex: 0},
        drivers: {createPgClient: product.createPgClient,
          createMysqlConnection: product.createMysqlConnection},
        evidenceDir,
      });
    } finally {
      fs.rmSync(evidenceDir, {recursive: true, force: true});
    }
    const base = buildFixtureRun({subkind: 'smoke', offeredRatePerSec: 5,
      profileClass: BENCHMARK_PROFILE_CLASS.SMOKE});
    const run = composeFixtureRunFromDriverOutput(base, output);
    run.deployment.endpoint = null;
    run.deployment.readiness = {state: 'exhausted', observedAt: run.deployment.readiness.observedAt,
      evidence: {failure: 'lagrange-node@10.0.0.2 did not report ready after 120 attempts',
        diagnostic: {component: 'lagrange-node@10.0.0.2', attempts: 120, elapsedMs: 166915,
          last: EXHAUSTED_LAST}}};
    for (const key of ['products', 'productsAfterWindow']) {
      run.identity[key] = arrayMap(run.identity[key], (p) => ({...p, reportedVersion: null,
        reportedVersionError: 'management facts answered status 503 without release.version'}));
    }
    run.rawObservationsDigest = computeRunObservationsDigest(run);
    return {run, output};
  }

  it('a docker-loaded copy (no repo digest) of the pinned content is the same product', () => {
    const run = buildFixtureRun();
    run.identity.products[1] = {...run.identity.products[1], repoDigest: null,
      imageId: `sha256:${'9'.repeat(64)}`, provenance: `loaded:sha256:${'9'.repeat(64)}`};
    run.identity.productsAfterWindow[1] = {...run.identity.products[1]};
    sealFixtureRun(run);
    assert.doesNotThrow(() => validateRunRecord(run));
  });

  it('a malformed content identity is rejected; a missing one stays visible', () => {
    const run = buildFixtureRun();
    run.identity.products[0].contentIdentity = 'sha256:short';
    sealFixtureRun(run);
    assertRejected(run, 'invalid-text');
    const missing = buildFixtureRun();
    delete missing.identity.products[0].contentIdentity;
    sealFixtureRun(missing);
    assert.doesNotThrow(() => validateRunRecord(missing));
  });

  it('a null version is admitted only on an exhausted or setup-failed run', async () => {
    const {run} = await exhaustedLagrangeRun();
    assert.doesNotThrow(() => validateRunRecord(run));
    const ready = buildFixtureRun();
    ready.identity.products[0] = {...ready.identity.products[0], reportedVersion: null,
      reportedVersionError: 'x'};
    sealFixtureRun(ready);
    assertRejected(ready, 'invalid-text');
    const silent = buildFixtureRun();
    silent.identity.products[0] = {...silent.identity.products[0], reportedVersion: null};
    sealFixtureRun(silent);
    assertRejected(silent, 'invalid-text');
  });

  it('mixed image stores admit; different content is a mismatch; missing is unverified',
    async () => {
      const mixed = await publishedLagrangeCell((run) => {
        for (const key of ['products', 'productsAfterWindow']) {
          run.identity[key][1] = {...run.identity[key][1], repoDigest: null,
            imageId: `sha256:${'9'.repeat(64)}`, imageStore: 'overlay2',
            provenance: `loaded:sha256:${'9'.repeat(64)}`};
        }
      }, SMOKE);
      assert.equal(mixed.cell.status, CLAIM_CELL_STATUS.VALID_OBSERVED,
        mixed.cell.reasons.join(', '));
      const other = await publishedLagrangeCell((run) => {
        for (const key of ['products', 'productsAfterWindow']) {
          run.identity[key][0] = {...run.identity[key][0],
            contentIdentity: `sha256:${'8'.repeat(64)}`};
        }
      }, SMOKE);
      assert.equal(arrayIncludes(other.cell.reasons, ADMISSION_REASON.PRODUCT_IDENTITY_MISMATCH),
        true, other.cell.reasons.join(', '));
      const missing = await publishedLagrangeCell((run) => {
        for (const key of ['products', 'productsAfterWindow']) {
          delete run.identity[key][0].contentIdentity;
        }
      }, SMOKE);
      assert.equal(arrayIncludes(missing.cell.reasons,
        ADMISSION_REASON.PRODUCT_IDENTITY_UNVERIFIED), true, missing.cell.reasons.join(', '));
      const header = buildFixtureHeader({campaignId: 'fixture-campaign', targetIds: [LAGRANGE]});
      header.products[0] = {...header.products[0], contentIdentity: 'not-a-digest'};
      assert.throws(() => validateCampaignHeader(header), (err) => err.code === 'invalid-text');
    });

  it('an exhausted arm publishes product-failure (readiness-exhausted) with its denial',
    async () => {
      const {run} = await exhaustedLagrangeRun();
      const {driverSourceSha256} = await benchmarkDriverSourceIdentity();
      const header = buildFixtureHeader({campaignId: 'fixture-campaign', targetIds: [LAGRANGE]});
      header.harness = {...header.harness, driverSourceSha256,
        adapterIds: [...Object.values(BENCHMARK_SCENARIO_A_ADAPTER_ID)]};
      header.products[0] = {...header.products[0], reportedVersion: null,
        reportedVersionError: 'management facts answered status 503 without release.version'};
      const {matrix, readme} = await publish([header, run]);
      const cell = fixtureTargetCell(matrix, LAGRANGE, 'scenarioA/smoke');
      assert.equal(cell.status, CLAIM_CELL_STATUS.PRODUCT_FAILURE, cell.reasons.join(', '));
      assert.equal(arrayIncludes(cell.reasons, ADMISSION_REASON.READINESS_EXHAUSTED), true);
      assert.deepEqual(cell.metrics.setupFailures[0].readinessDenial.reasons,
        ['PRIORITY_CONTROL_PLANE_RECOVERY_PENDING']);
      assert.equal(stringIncludes(readme, 'PRIORITY_CONTROL_PLANE_RECOVERY_PENDING'), true);
      assert.equal(stringIncludes(readme, 'DEGRADED'), true);
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
      const header = {schemaVersion: 'lagrange-raw-observation-campaign-v1',
        recordType: 'campaign-header', gitCommit: 'f'};
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
      writeFixtureRoot(root, {rawRecords: [buildFixtureHeader({campaignId: 'c', targetIds: [LAGRANGE],
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

// The publication path (regeneration, store, matrix, renderers) must not reach the
// forensic v1 reader, and no publication module may know the v1 schema names.
const PUBLICATION_ENTRY_MODULES = Object.freeze([
  'raw-observation-campaign-specs.js', 'raw-observation-store.js',
  'comparative-matrix-runner.js', 'scaleout-series-experiments.js',
  'comparative-landing-page.js', 'oltp-comparison-static-web.js',
]);
const FORENSIC_READER = 'raw-observation-forensic-reader.js';
const IMPORT_PATTERN =
  /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/gu;

function publicationImportGraph() {
  const harnessDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const seen = new Set();
  const pending = arrayMap(PUBLICATION_ENTRY_MODULES, (name) => path.join(harnessDir, name));
  while (pending.length > 0) {
    const file = pending.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    for (const match of fs.readFileSync(file, 'utf8').matchAll(IMPORT_PATTERN)) {
      const specifier = match[1] || match[2];
      if (stringStartsWith(specifier, '.')) pending.push(path.resolve(path.dirname(file), specifier));
    }
  }
  return seen;
}

describe('the forensic reader is outside the publication path', () => {
  it('no publication module imports the v1 reader or names a v1 schema', () => {
    const graph = publicationImportGraph();
    assert.ok(graph.size > PUBLICATION_ENTRY_MODULES.length, 'the walk follows imports');
    for (const file of graph) {
      assert.notEqual(path.basename(file), FORENSIC_READER, `${file} is publication`);
      assert.equal(stringIncludes(fs.readFileSync(file, 'utf8'), 'lagrange-raw-observation-v1'),
        false, `${file} names a v1 schema`);
    }
  });
});
