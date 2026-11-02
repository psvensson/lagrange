// Chain acceptance cases J8 (product identity), J9 (raw evidence), J10 (edits
// after recording), J12 (valid negative results), J13 (publication
// verification), the smoke-capacity refusal, the campaign outcome and the
// static census, asserted on the published matrix, the rendered pages and the
// recomputation check of the temp root.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  ADMISSION_REASON,
  CLAIM_CELL_STATUS,
  campaignOutcomeOfCells,
} from '../benchmark-claim-admission.js';
import {BENCHMARK_PROFILE_CLASS} from '../benchmark-workload-dispatch.js';
import {fixtureProductIdentity} from '../comparative-benchmark-fixtures.js';
import {SCENARIO_OUTCOME} from '../scenario-outcome.js';
import {
  CAPACITY_WORKLOAD,
  MATRIX_FILE,
  RAW_FILE,
  REPO_ROOT,
  assertNoNumbersRendered,
  chainHeader,
  driveArm,
  publishedTargetCell,
  reseal,
  withChain,
} from './comparative-benchmark-chain-acceptance-chain.js';
import {LABEL} from './comparative-benchmark-chain-acceptance-cases-outcomes.js';
import {FAKE_PRODUCT_FAULT} from './real-product-workload-driver-fake-product.js';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayFind = Function.call.bind(Array.prototype.find);
const stringIncludes = Function.call.bind(String.prototype.includes);
const stringReplace = Function.call.bind(String.prototype.replace);
const stringSplit = Function.call.bind(String.prototype.split);

const LAGRANGE = 'lagrange';
const TIDB = 'tidb-tikv';
const PG = 'pg-single-primary';

function plausibleSha(seed) {
  return createHash('sha256').update(seed).digest('hex');
}

async function drivePair(arm) {
  const runs = [];
  for (const repetition of [1, 2]) runs.push((await driveArm({...arm, repetition})).run);
  return runs;
}

async function publish(records, check) {
  return withChain(async (chain) => {
    await chain.append(records).publish();
    return check(chain);
  });
}

function smokeCell(chain, targetId) {
  return publishedTargetCell(chain, {targetId, label: LABEL[targetId], smoke: true});
}

function assertRefused(published, reason, label) {
  const {matrix, markdown, svgTitle} = published;
  assert.equal(matrix.status, CLAIM_CELL_STATUS.INVALID_MEASUREMENT,
    `${label}: ${matrix.status} (${matrix.reasons.join(', ')})`);
  assert.equal(arrayIncludes(matrix.reasons, reason), true,
    `${label}: expected ${reason} in ${matrix.reasons.join(', ')}`);
  assert.equal(stringIncludes(markdown, reason), true, `${label}: the page names ${reason}`);
  assert.equal(stringIncludes(svgTitle, reason), true, `${label}: the SVG names ${reason}`);
  assert.equal(matrix.metrics, null, `${label}: a refused cell carries no metrics`);
  assertNoNumbersRendered(markdown, label);
}

/**
 * Publish a Lagrange smoke pair plus a TiDB smoke pair after `mutate` edited
 * them (and resealed what it edited), then assert the Lagrange cell is refused.
 */
async function expectLagrangeRefused(label, reason, mutate, headerTargets = [LAGRANGE, TIDB]) {
  const lagrange = await drivePair({targetId: LAGRANGE});
  const tidb = await drivePair({targetId: TIDB});
  const header = chainHeader([...lagrange, ...tidb], headerTargets);
  mutate({lagrange, tidb, header});
  await publish([header, ...lagrange, ...tidb], (chain) => {
    assertRefused(smokeCell(chain, LAGRANGE), reason, label);
  });
}

function setIdentity(run, fields) {
  for (const list of [run.identity.products, run.identity.productsAfterWindow]) {
    for (const product of list) Object.assign(product, fields);
  }
  return reseal(run);
}

// J8: the product that answered is not the product the campaign pinned.
async function caseJ8ProductIdentity() {
  const wrongImage = `sha256:${plausibleSha('another-build')}`;
  await expectLagrangeRefused('J8 imageId', ADMISSION_REASON.PRODUCT_IDENTITY_MISMATCH,
    ({lagrange}) => lagrange.forEach((r) => setIdentity(r, {imageId: wrongImage})));
  await expectLagrangeRefused('J8 repoDigest', ADMISSION_REASON.PRODUCT_IDENTITY_MISMATCH,
    ({lagrange}) => lagrange.forEach((r) => setIdentity(r,
      {repoDigest: `example/lagrange@sha256:${plausibleSha('other-repo')}`})));
  await expectLagrangeRefused('J8 emulator version', ADMISSION_REASON.PRODUCT_IDENTITY_MISMATCH,
    ({lagrange}) => lagrange.forEach((r) => setIdentity(r,
      {reportedVersion: 'lagrange-emulator 0.4.0'})));
  // The comparator arm ran the candidate's image.
  await expectLagrangeRefused('J8 candidate is comparator',
    ADMISSION_REASON.CANDIDATE_IMAGE_IS_COMPARATOR_IMAGE, ({header}) => {
      const tidbPin = arrayFind(header.products, (p) => p.targetId === TIDB);
      tidbPin.imageId = fixtureProductIdentity(LAGRANGE).imageId;
    });
  await expectLagrangeRefused('J8 dead container', ADMISSION_REASON.IDENTITY_CHANGED_DURING_WINDOW,
    ({lagrange}) => lagrange.forEach((r) => {
      r.identity.productsAfterWindow.pop();
      reseal(r);
    }));
  await expectLagrangeRefused('J8 container not a role', ADMISSION_REASON.IDENTITY_NOT_RUNNING,
    ({lagrange}) => lagrange.forEach((r) => {
      for (const list of [r.identity.products, r.identity.productsAfterWindow]) {
        list[1].containerId = 'ctr-leftover';
      }
      reseal(r);
    }));
  await expectLagrangeRefused('J8 endpoint container not a role',
    ADMISSION_REASON.ENDPOINT_NOT_BOUND, ({lagrange}) => lagrange.forEach((r) => {
      r.deployment.endpoint.containerId = 'ctr-leftover';
      r.correctness.semanticGate.binding.containerId = 'ctr-leftover';
      reseal(r);
    }));
  // The comparator arm is absent: its cell is not measured, never a number.
  const lagrange = await drivePair({targetId: LAGRANGE});
  await publish([chainHeader(lagrange, [LAGRANGE]), ...lagrange], (chain) => {
    const {matrix, markdown} = smokeCell(chain, TIDB);
    assert.equal(matrix.status, CLAIM_CELL_STATUS.NOT_MEASURED);
    assert.equal(markdown, `${CLAIM_CELL_STATUS.NOT_MEASURED} (${ADMISSION_REASON.NO_OBSERVATION})`);
  });
}

// J9: raw evidence missing, corrupt, with a plausible wrong digest or a
// substituted configuration.
async function caseJ9RawEvidence() {
  await expectLagrangeRefused('J9 plausible wrong digest', ADMISSION_REASON.RAW_DIGEST_MISMATCH,
    ({lagrange}) => {
      lagrange[0].rawObservationsDigest = `sha256:${plausibleSha('other-record')}`;
    });
  await expectLagrangeRefused('J9 plausible wrong harness commit',
    ADMISSION_REASON.HARNESS_MISMATCH, ({lagrange}) => lagrange.forEach((r) => {
      r.identity.harness.gitCommit = plausibleSha('other-commit').slice(0, 40);
      reseal(r);
    }));
  await expectLagrangeRefused('J9 substituted dataset', ADMISSION_REASON.WORKLOAD_IDENTITY_MISMATCH,
    ({lagrange}) => lagrange.forEach((r) => {
      r.plan.datasetDigest = `sha256:${plausibleSha('another-dataset')}`;
      reseal(r);
    }));
  await expectLagrangeRefused('J9 substituted measurement plan',
    ADMISSION_REASON.WORKLOAD_IDENTITY_MISMATCH, ({lagrange}) => lagrange.forEach((r) => {
      r.plan.measurementPlanDigest = `sha256:${plausibleSha('another-plan')}`;
      reseal(r);
    }));
  const lagrange = await drivePair({targetId: LAGRANGE});
  await publish([chainHeader(lagrange, [LAGRANGE]), ...lagrange], async (chain) => {
    assert.equal((await chain.recompute()).ok, true, 'the intact publication recomputes');
    const lines = chain.rawLines();
    chain.editRawLine(1, (line) => line.slice(0, Math.floor(line.length / 2)));
    const corrupt = await chain.recompute();
    assert.equal(corrupt.ok, false);
    assert.match(corrupt.difference, /corrupt-line/u);
    fs.rmSync(chain.path(RAW_FILE));
    const missing = await chain.recompute();
    assert.equal(missing.ok, false);
    assert.match(missing.difference, /Raw observation file missing/u);
    assert.equal(lines.length, 3);
  });
}

// J10: a recorded figure edited after recording; the recomputation names the
// first published artifact that no longer follows from the raw store.
const RECORDED_EDITS = Object.freeze([
  ['success count', (r) => {
    r.observations.accounting.committed -= 1;
  }],
  ['elapsed time', (r) => {
    r.observations.window.scheduledMs *= 2;
  }],
  ['quantile input', (r) => {
    const request = arrayFind(r.observations.requests, (q) => q.latencyMs !== null);
    request.latencyMs += 1;
  }],
  ['bytes', (r) => {
    r.observations.network = {scope: 'host-nic-total', byHost: {'lab-host-1': 4096}};
  }],
  ['final-state digest', (r) => {
    r.correctness.finalState.after.stateSha256 = plausibleSha('edited-state');
  }],
]);

async function caseJ10EditedAfterRecording() {
  const lagrange = await drivePair({targetId: LAGRANGE});
  await publish([chainHeader(lagrange, [LAGRANGE]), ...lagrange], async (chain) => {
    const original = chain.rawLines();
    for (const [label, edit] of RECORDED_EDITS) {
      chain.editRawLine(1, (line) => {
        const run = JSON.parse(line);
        edit(run);
        return JSON.stringify(run);
      });
      const recompute = await chain.recompute();
      assert.equal(recompute.ok, false, `${label}: the edit must be detected`);
      assert.match(recompute.difference,
        /^data\/tidb-comparison\/admitted-lab-measurements\.json differs from its regeneration$/u,
        `${label}: ${recompute.difference}`);
      // Regenerated from the edited store, the cell no longer stands.
      await chain.publish();
      assert.notEqual(smokeCell(chain, LAGRANGE).matrix.status, CLAIM_CELL_STATUS.VALID_OBSERVED,
        `${label}: the regenerated cell is refused`);
      chain.editRawLine(1, () => original[1]);
      await chain.publish();
      assert.equal((await chain.recompute()).ok, true, `${label}: restored`);
    }
  });
}

// J12: a genuine Lagrange loss (TiDB faster, Lagrange slower but valid) and a
// failing arm stay visible with their numbers.
async function caseJ12ValidNegativeResult() {
  const tidb = await drivePair({targetId: TIDB, subkind: 'main'});
  const lagrange = await drivePair({targetId: LAGRANGE, subkind: 'main', responseDelayMs: 1});
  const pg = await drivePair({targetId: PG, mode: FAKE_PRODUCT_FAULT.ERROR_ENVELOPE});
  await publish([chainHeader([...tidb, ...lagrange, ...pg], [LAGRANGE, TIDB, PG]), ...tidb,
    ...lagrange, ...pg], async (chain) => {
    const fast = publishedTargetCell(chain, {targetId: TIDB, label: LABEL[TIDB], smoke: false});
    const slow = publishedTargetCell(chain,
      {targetId: LAGRANGE, label: LABEL[LAGRANGE], smoke: false});
    for (const cell of [fast, slow]) {
      assert.equal(cell.matrix.status, CLAIM_CELL_STATUS.VALID_OBSERVED,
        `${cell.matrix.claimKey}: ${cell.matrix.reasons.join(', ')}`);
      assert.ok(cell.matrix.metrics.capacity, `${cell.matrix.claimKey} has capacity figures`);
      assert.equal(stringIncludes(cell.markdown, 'committed/s min'), true, cell.markdown);
    }
    const p99 = (cell) => Math.max(...arrayMap(cell.matrix.metrics.runs,
      (m) => m.latencyMs.p99));
    assert.ok(p99(slow) > p99(fast), 'Lagrange is the slower arm in this fixture');
    for (const run of slow.matrix.metrics.runs) {
      assert.equal(stringIncludes(slow.markdown,
        `${run.runId} p99 ${run.latencyMs.p99.toFixed(2)} ms`), true, `the losing arm's p99 is rendered: ${slow.markdown}`);
    }
    const failing = smokeCell(chain, PG);
    assert.equal(failing.matrix.status, CLAIM_CELL_STATUS.PRODUCT_FAILURE);
    assert.equal(stringIncludes(failing.markdown, 'product_error'), true);
    assert.equal((await chain.recompute()).ok, true);
  });
}

// J13: generated output edited, or a run of another campaign or profile mixed
// into the store after publication.
async function caseJ13PublicationVerification() {
  const lagrange = await drivePair({targetId: LAGRANGE});
  const other = await drivePair({targetId: LAGRANGE});
  await publish([chainHeader(lagrange, [LAGRANGE]), ...lagrange], async (chain) => {
    const html = chain.path('docs/benchmarks/index.html');
    fs.writeFileSync(html, stringReplace(fs.readFileSync(html, 'utf8'), 'product-failure',
      'valid-observed'));
    const edited = await chain.recompute();
    assert.equal(edited.ok, false);
    assert.match(edited.difference, /docs\/benchmarks\/index\.html differs/u);
  });
  const foreignHeader = {...chainHeader(other, [LAGRANGE]), campaignId: 'chain-campaign-other'};
  for (const run of other) {
    run.campaignId = foreignHeader.campaignId;
    run.runId = `${run.runId}-other`;
    run.plan.repetition += 2;
    run.claimKey = stringReplace(run.claimKey, /\/\d+$/u, `/${run.plan.repetition}`);
    run.correctness.semanticGate.binding.campaignId = foreignHeader.campaignId;
    reseal(run);
  }
  await publish([chainHeader(lagrange, [LAGRANGE]), ...lagrange], async (chain) => {
    chain.append([foreignHeader, ...other]);
    const mixed = await chain.recompute();
    assert.equal(mixed.ok, false, 'a foreign campaign appended after publication is detected');
    await chain.publish();
    assertRefused(smokeCell(chain, LAGRANGE), ADMISSION_REASON.MIXED_CAMPAIGN, 'J13 campaign');
  });
  const mainA = await drivePair({targetId: LAGRANGE, subkind: 'main'});
  const mainB = await drivePair({targetId: LAGRANGE, subkind: 'main',
    workload: {...CAPACITY_WORKLOAD, seed: CAPACITY_WORKLOAD.seed + 1}});
  for (const run of mainB) {
    run.plan.repetition += 2;
    run.runId = `${run.runId}-b`;
    run.claimKey = stringReplace(run.claimKey, /\/\d+$/u, `/${run.plan.repetition}`);
    reseal(run);
  }
  await publish([chainHeader([...mainA, ...mainB], [LAGRANGE]), ...mainA, ...mainB],
    (chain) => {
      assertRefused(publishedTargetCell(chain, {targetId: LAGRANGE, label: LABEL[LAGRANGE],
        smoke: false}), ADMISSION_REASON.MIXED_PROFILE, 'J13 profile');
    });
}

// A 100-operation smoke run that tries to publish p99 and throughput.
async function caseSmokeCannotPublishCapacity() {
  const runs = await drivePair({targetId: LAGRANGE});
  for (const run of runs) {
    assert.equal(run.observations.accounting.offered, 100);
    // The record claims the capacity class with everything a capacity run needs.
    run.plan.profileClass = BENCHMARK_PROFILE_CLASS.CAPACITY;
    run.plan.sweepPlanDigest = `sha256:${plausibleSha('sweep')}`;
    run.plan.warmup = {operations: run.observations.warmup.accounting.offered,
      digest: run.observations.warmup.executedOperationsDigest};
    reseal(run);
  }
  await publish([chainHeader(runs, [LAGRANGE]), ...runs], async (chain) => {
    assertRefused(smokeCell(chain, LAGRANGE), ADMISSION_REASON.WORKLOAD_PROFILE_MISMATCH,
      'smoke claiming capacity');
  });
  const honest = await drivePair({targetId: LAGRANGE});
  await publish([chainHeader(honest, [LAGRANGE]), ...honest], async (chain) => {
    const matrixPath = chain.path(MATRIX_FILE);
    const matrix = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));
    const cell = arrayFind(matrix.targets, (t) => t.targetId === LAGRANGE)
      .claims['scenarioA/smoke'];
    assert.equal(cell.metrics.capacity, null);
    cell.metrics.capacity = {byRate: [{offeredRatePerSec: 2000, repetitions: 2,
      committedPerSec: {min: 1, max: 1, mean: 1}}]};
    cell.metrics.runs[0].latencyMs = {samples: 100, p50: 1, p95: 1, p99: 1};
    fs.writeFileSync(matrixPath, `${JSON.stringify(matrix, null, 2)}\n`);
    const recompute = await chain.recompute();
    assert.equal(recompute.ok, false, 'a smoke cell with p99/throughput fails recomputation');
    assert.match(recompute.difference, /multi-system-matrix\.json differs/u);
  });
}

// A campaign whose cells are all non-valid never reports as passed.
async function caseCampaignOutcome() {
  const silent = await drivePair({targetId: LAGRANGE, mode: FAKE_PRODUCT_FAULT.SILENT});
  const errors = await drivePair({targetId: TIDB, mode: FAKE_PRODUCT_FAULT.ERROR_ENVELOPE});
  await publish([chainHeader([...silent, ...errors], [LAGRANGE, TIDB]), ...silent, ...errors],
    (chain) => {
      const cells = arrayMap([LAGRANGE, TIDB], (t) => smokeCell(chain, t).matrix);
      assert.equal(campaignOutcomeOfCells(cells), SCENARIO_OUTCOME.FAILED);
      const notMeasured = smokeCell(chain, PG).matrix;
      assert.equal(campaignOutcomeOfCells([notMeasured]), SCENARIO_OUTCOME.REFUSED);
    });
}

// ---- static census over the benchmark chain sources ----

const CENSUS_PATTERNS = Object.freeze([
  ['?? 33', /\?\?\s*33\b/u], ['|| 33', /\|\|\s*33\b/u],
  ['resolve({ok: false', /resolve\(\s*\{\s*ok:\s*false/u],
  ['setTimeout( with 5000', /setTimeout\([^;]*\b5000\b/u], ['/health', /\/health/u],
  ['\'mismatched\'', /'mismatched'/u], ['Math.max(48', /Math\.max\(\s*48\b/u],
  ['* 0.45', /\*\s*0\.45\b/u], ['* 0.35', /\*\s*0\.35\b/u], ['winningSystem', /winningSystem/u],
  ['StrictHostKeyChecking=no', /StrictHostKeyChecking=no/u], ['chmod 666', /chmod 666/u],
  ['chmod -R 777', /chmod -R 777/u], ['0.0.0.0/0 trust', /0\.0\.0\.0\/0 trust/u],
]);
const HARNESS_DIR = 'test/distributed/harness';
const CENSUS_FILE_PATTERN =
  /^(?:raw-observation-.*|benchmark-.*|comparative-.*|real-product-.*|oltp-open-loop-step-owner|oltp-paired-sweep-runner)\.js$/u;
const CHECKS_FILE_PATTERN = /^comparative-benchmark-.*\.js$/u;

// Each remaining hit is justified, and the census fails when a listed hit
// disappears so the list cannot outlive its cause:
// - the recomputation guard names `winningSystem` among the keys it forbids in
//   the published matrix (a refusal, not a claim);
// - the TiDB deployer polls PD's `/pd/api/v1/health`, TiDB's own readiness
//   endpoint for the placement driver (every member reports health === true);
//   it gates readiness only and never stands in for a business operation.
const CENSUS_RECORDED_HITS = Object.freeze([
  'scripts/checks/comparative-benchmark-recompute.js|winningSystem',
  `${HARNESS_DIR}/real-product-deployer-tidb.js|/health`,
]);

// Code only: comments describing a removed defect are not the defect.
function stripComments(source) {
  return stringReplace(stringReplace(source, /\/\*[\s\S]*?\*\//gu, ''),
    /(^|[^:'"`\\])\/\/[^\n]*/gu, '$1');
}

function censusFiles() {
  const pick = (dir, pattern) => arrayMap(arrayFilter(fs.readdirSync(path.join(REPO_ROOT, dir)),
    (name) => pattern.test(name)), (name) => `${dir}/${name}`);
  return [...pick(HARNESS_DIR, CENSUS_FILE_PATTERN), ...pick('scripts/checks', CHECKS_FILE_PATTERN)]
    .sort();
}

function censusHits() {
  const hits = [];
  for (const file of censusFiles()) {
    const lines = stringSplit(stripComments(fs.readFileSync(path.join(REPO_ROOT, file),
      'utf8')), '\n');
    for (const line of lines) {
      for (const [name, pattern] of CENSUS_PATTERNS) {
        if (pattern.test(line)) hits.push(`${file}|${name}`);
      }
    }
  }
  return hits.sort();
}

async function caseStaticCensus() {
  const files = censusFiles();
  assert.ok(files.length > 50, `the census reads the chain sources (${files.length})`);
  for (const owner of ['benchmark-claim-admission.js', 'raw-observation-record.js',
    'real-product-workload-drivers.js', 'comparative-matrix-runner.js']) {
    assert.ok(arrayIncludes(files, `${HARNESS_DIR}/${owner}`), `the census covers ${owner}`);
  }
  assert.deepEqual(censusHits(), [...CENSUS_RECORDED_HITS].sort(),
    'census hits differ from the recorded list');
  // J9: no literal 'mismatched' special case anywhere in the chain.
  assert.equal(arrayIncludes(arrayMap(censusHits(), (h) => stringSplit(h, '|')[1]),
    '\'mismatched\''), false);
}

// Generated pages are public documentation: they cite the withdrawal by
// invalidation entry and defect id, never by a path into development records.
const DEVELOPMENT_RECORD_PATH = 'solve/';

async function casePagesCiteNoDevelopmentRecords() {
  await publish([], (chain) => {
    const names = Object.keys(chain.pages);
    assert.ok(names.length > 0, 'the regeneration renders pages');
    for (const name of names) {
      assert.equal(stringIncludes(chain.pages[name], DEVELOPMENT_RECORD_PATH), false,
        `${name} names a path under ${DEVELOPMENT_RECORD_PATH}`);
    }
  });
}

// The withdrawal notice states what the ledger and history hold, not a universal:
// an entry may carry no defect ids and name its records by scope, and a history
// record may be withdrawn by the forensic admission rule alone.
const HISTORY_FILE = 'data/tidb-comparison/history.ndjson';

async function caseWithdrawalNoticeStatesTheData() {
  await withChain(async (chain) => {
    const [historyLine] = stringSplit(
      fs.readFileSync(path.join(REPO_ROOT, HISTORY_FILE), 'utf8'), '\n');
    fs.writeFileSync(chain.path(HISTORY_FILE), `${historyLine}\n`);
    chain.invalidate([{
      id: 'inv-0001', recordedAt: '2026-11-02T00:00:00.000Z',
      scope: {file: RAW_FILE, campaignGitCommit: null, receiptIds: 'all'},
      reasons: [ADMISSION_REASON.HEALTH_SUBSTITUTE], defectIds: [],
      note: 'an entry without defect ids', recordedBy: 'chain acceptance',
    }]);
    await chain.publish();
    const expected = [
      'has 1 entry; 0 of them name the defect ids behind the withdrawal and 0 of them ' +
        'enumerate the withdrawn records by id',
      '1 of 1 history records are withdrawn without a ledger entry, by the admission rule',
      ADMISSION_REASON.FORENSIC_RECORD,
    ];
    for (const name of ['README.md', 'index.html', 'tidb-comparison-progress.md']) {
      for (const fact of expected) {
        assert.equal(stringIncludes(chain.pages[name], fact), true, `${name} states: ${fact}`);
      }
    }
  });
}

const PUBLICATION_CASES = Object.freeze([
  ['J8 wrong image, digest, version, comparator-as-candidate, dead or unbound container',
    caseJ8ProductIdentity],
  ['J9 raw evidence missing, corrupt, wrong digest or substituted configuration',
    caseJ9RawEvidence],
  ['J10 counts, elapsed, quantiles, bytes or final state edited after recording',
    caseJ10EditedAfterRecording],
  ['J12 a genuine Lagrange loss and a failing arm stay visible', caseJ12ValidNegativeResult],
  ['J13 edited page, foreign campaign or profile mixed in: publication verification fails',
    caseJ13PublicationVerification],
  ['a 100-op smoke run cannot publish p99 or throughput', caseSmokeCannotPublishCapacity],
  ['a campaign of non-valid cells never reports as passed', caseCampaignOutcome],
  ['static census of the benchmark chain sources', caseStaticCensus],
  ['no generated page names a path into development records',
    casePagesCiteNoDevelopmentRecords],
  ['the withdrawal notice states the ledger and history facts it rests on',
    caseWithdrawalNoticeStatesTheData],
]);

export {PUBLICATION_CASES};
