// Guard for the scale-out, partition, movement, network-delay and Scenario C
// experiment claims. PASS requires: every advertised experiment is present with
// admission cells; no experiment cell of a claim kind without its own observed
// record kind is admitted; the experiment pages are linked from the overview and
// equal their recomputation; the admitted history set (history records not
// invalidated by the ledger) contains no local-oracle record; and a scale-out run
// is never admitted (D11).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {
  ADMISSIBLE_CLAIM_KINDS,
  CLAIM_CELL_STATUS,
} from '../../test/distributed/harness/benchmark-claim-admission.js';
import {readInvalidationLedger} from '../../test/distributed/harness/benchmark-invalidation-ledger.js';
import {buildCoverageManifest} from '../../test/distributed/harness/comparative-coverage-manifest.js';
import {
  DEFAULT_MULTI_SYSTEM_MATRIX_PATH,
} from '../../test/distributed/harness/comparative-matrix-runner.js';
import {
  DEFAULT_COMPARISON_HISTORY_NDJSON_PATH,
  parseComparisonHistoryNdjson,
} from '../../test/distributed/harness/oltp-comparison-history-store.js';
import {runAdversarialCases} from '../../test/distributed/harness/comparative-benchmark-adversarial-cases.js';
import {recomputeComparativeBenchmarks} from './comparative-benchmark-recompute.js';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySome = Function.call.bind(Array.prototype.some);
const stringIncludes = Function.call.bind(String.prototype.includes);

const UTF8 = 'utf8';
const MSG_ADVERTISED_EXPERIMENTS = 'advertised experiments';
const CASE_D11_SCALEOUT = 'D11-scaleout-never-admitted';
const CASE_J13_PUBLICATION = 'J13-mixed-or-edited-publication';
const PASS_MESSAGE = 'distributed-scaleout-provenance-guard: PASS\n';
const LANDING_MD_PATH = 'docs/benchmarks/README.md';
const LOCAL_ORACLE_KIND = 'local-oracle-plus-network-model';
const EXPERIMENT_PAGES = Object.freeze([
  'scaleout-3to5-node-rf3-progress.md',
  'partition-granularity-sweep-progress.md',
  'scenario-b-rtt-working-set-crossover.md',
  'movement-and-scenario-c-scaling-progress.md',
  'lagrange-metrics-evolution.md',
]);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function verifyExperiments(matrix) {
  const manifest = buildCoverageManifest();
  assert.deepEqual(arrayMap(matrix.experiments, (e) => e.experimentId),
    arrayMap(manifest.experiments, (e) => e.experimentId), MSG_ADVERTISED_EXPERIMENTS);
  manifest.experiments.forEach((exp, i) => {
    const published = matrix.experiments[i];
    assert.equal(published.rows.length, exp.rows.length, `${exp.experimentId} rows`);
    exp.rows.forEach((row, r) => {
      for (const [column, claim] of Object.entries(row.cells)) {
        const cell = published.rows[r].cells[column];
        assert.equal(cell.claimKey, claim.claimKey, `${exp.experimentId}/${row.rowId}`);
        if (!arrayIncludes(ADMISSIBLE_CLAIM_KINDS, claim.claimKind)) {
          assert.notEqual(cell.status, CLAIM_CELL_STATUS.VALID_OBSERVED,
            `${claim.claimKey}: ${claim.claimKind} has no observed record kind yet`);
          assert.equal(cell.metrics, null, `${claim.claimKey}: no metrics`);
        }
      }
    });
  });
}

function verifyAdmittedHistory(rootDir) {
  const records = parseComparisonHistoryNdjson(fs.readFileSync(
    path.resolve(rootDir, DEFAULT_COMPARISON_HISTORY_NDJSON_PATH), UTF8));
  const ledger = arrayFilter(readInvalidationLedger(rootDir),
    (inv) => inv.scope.file === DEFAULT_COMPARISON_HISTORY_NDJSON_PATH);
  const admitted = arrayFilter(records, (r) => !arraySome(ledger, (inv) =>
    inv.scope.receiptIds === 'all' || arrayIncludes(inv.scope.receiptIds, r.recordSha256)));
  for (const r of admitted) {
    assert.notEqual(r.evidenceSource?.kind, LOCAL_ORACLE_KIND,
      `history record ${r.recordSha256} is a local-oracle record without an invalidation`);
  }
}

function verifyLandingLinks(rootDir) {
  const landing = fs.readFileSync(path.resolve(rootDir, LANDING_MD_PATH), UTF8);
  for (const page of EXPERIMENT_PAGES) {
    assert.equal(stringIncludes(landing, page), true, `${LANDING_MD_PATH} must link ${page}`);
  }
}

export async function runDistributedScaleoutProvenanceGuard(rootDir = REPO_ROOT) {
  const recompute = await recomputeComparativeBenchmarks(rootDir);
  assert.equal(recompute.ok, true, `recomputation: ${recompute.difference}`);
  const matrix = JSON.parse(fs.readFileSync(
    path.resolve(rootDir, DEFAULT_MULTI_SYSTEM_MATRIX_PATH), UTF8));
  verifyExperiments(matrix);
  verifyAdmittedHistory(rootDir);
  verifyLandingLinks(rootDir);
  await runAdversarialCases([CASE_D11_SCALEOUT, CASE_J13_PUBLICATION]);
}

const isDirectCli = process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectCli) {
  await runDistributedScaleoutProvenanceGuard();
  process.stdout.write(PASS_MESSAGE);
}
