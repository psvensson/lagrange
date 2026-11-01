#!/usr/bin/env node
// Offline recomputation of the comparative benchmark publication.
//
// Copies the inputs (raw observation store, forensic files, invalidation ledger,
// history) and the published artifacts into a scratch root, regenerates every
// derived artifact there through the one regeneration path, and fails (exit 1,
// naming the first difference) when a published artifact differs, a raw record is
// missing or corrupt, a forensic record has no ledger entry, a published numeric
// cell is covered by the ledger, a smoke cell carries a capacity figure, or the
// publication carries winner/completion fields.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {readInvalidationLedger} from '../../test/distributed/harness/benchmark-invalidation-ledger.js';
import {
  METRIC_BEARING_STATUSES,
  REASON_PREFIX,
} from '../../test/distributed/harness/benchmark-claim-admission.js';
import {
  regenerateAllBenchmarkArtifactsFromAdmitted,
} from '../../test/distributed/harness/raw-observation-campaign-specs.js';
import {readRawObservationSources} from '../../test/distributed/harness/raw-observation-store.js';
import {
  BENCHMARK_PROFILE_CLASS,
} from '../../test/distributed/harness/benchmark-workload-dispatch.js';

const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arraySome = Function.call.bind(Array.prototype.some);
const arrayIndexOf = Function.call.bind(Array.prototype.indexOf);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);

const UTF8 = 'utf8';
const JSON_ROOT = '$';
const CAPACITY_RUN_FIELDS = Object.freeze(['committedPerSec', 'latencyMs']);
const DATA_DIR = 'data/tidb-comparison';
const DOCS_DIR = 'docs/benchmarks';
const MATRIX_PATH = `${DATA_DIR}/multi-system-matrix.json`;
const PASS_MESSAGE = 'comparative-benchmark-recompute: PASS\n';
const FORBIDDEN_KEYS = Object.freeze([
  'winningSystem', 'whyItWins', 'runnerUp', 'operatingBoundaryMap', 'completedSlices',
  'remainingSlicesCount', 'rpoZeroSurvivability', 'semanticProofPassed', 'semanticProofTotal',
]);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

class RecomputeDifference extends Error {}

function differ(message) {
  throw new RecomputeDifference(message);
}

function listFiles(dir, rel = '') {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, {withFileTypes: true}).sort(
    (a, b) => (a.name < b.name ? -1 : 1))) {
    const relPath = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...listFiles(path.join(dir, entry.name), relPath));
    else out.push(relPath);
  }
  return out;
}

function copyInputs(rootDir, scratch) {
  for (const rel of [DATA_DIR, DOCS_DIR]) {
    const from = path.join(rootDir, rel);
    if (!fs.existsSync(from)) differ(`${rel} is missing`);
    fs.cpSync(from, path.join(scratch, rel), {recursive: true});
  }
}

function checkForensicCoverage(rootDir) {
  const raw = readRawObservationSources(rootDir);
  const ledger = readInvalidationLedger(rootDir);
  for (const f of raw.forensicRecords) {
    const covered = arraySome(ledger, (inv) => inv.scope.file === f.file &&
      (inv.scope.campaignGitCommit === null ||
        inv.scope.campaignGitCommit === f.campaignGitCommit) &&
      (inv.scope.receiptIds === 'all' || arrayIncludes(inv.scope.receiptIds, f.record.receiptId)));
    if (!covered) differ(`forensic record ${f.file}#${f.record.receiptId} has no ledger entry`);
  }
}

function walkForbidden(value, trail) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (arrayIncludes(FORBIDDEN_KEYS, key)) differ(`${MATRIX_PATH} carries ${trail}.${key}`);
    walkForbidden(child, `${trail}.${key}`);
  }
}

function eachCell(matrix, visit) {
  for (const t of matrix.targets) {
    for (const [column, cell] of Object.entries(t.claims)) visit(cell, `${t.targetId}/${column}`);
  }
  for (const exp of matrix.experiments) {
    for (const r of exp.rows) {
      for (const [column, cell] of Object.entries(r.cells)) {
        visit(cell, `${exp.experimentId}/${r.rowId}/${column}`);
      }
    }
  }
}

function checkPublishedCells(matrix) {
  walkForbidden(matrix, JSON_ROOT);
  eachCell(matrix, (cell, where) => {
    const bearsMetrics = arrayIncludes(METRIC_BEARING_STATUSES, cell.status);
    if (!bearsMetrics && cell.metrics !== null) differ(`${where}: ${cell.status} carries metrics`);
    if (bearsMetrics && arraySome(cell.reasons,
      (r) => stringStartsWith(r, REASON_PREFIX.INVALIDATED))) {
      differ(`${where}: a published numeric cell is covered by the invalidation ledger`);
    }
    const carriesCapacity = (m) => arraySome(CAPACITY_RUN_FIELDS, (field) => field in m);
    const isSmoke = cell.metrics?.profileClass === BENCHMARK_PROFILE_CLASS.SMOKE;
    if (isSmoke && (cell.metrics.capacity !== null ||
        arraySome(cell.metrics.runs, carriesCapacity))) {
      differ(`${where}: a smoke run carries a capacity figure`);
    }
  });
}

function compareTrees(rootDir, scratch) {
  for (const rel of [DATA_DIR, DOCS_DIR]) {
    const published = listFiles(path.join(rootDir, rel));
    const regenerated = listFiles(path.join(scratch, rel));
    for (const file of regenerated) {
      if (!arrayIncludes(published, file)) differ(`${rel}/${file} is generated but not published`);
    }
    for (const file of published) {
      const a = fs.readFileSync(path.join(rootDir, rel, file));
      const b = fs.readFileSync(path.join(scratch, rel, file));
      if (!a.equals(b)) differ(`${rel}/${file} differs from its regeneration`);
    }
  }
}

/**
 * Recompute the publication from the raw records.
 * @param {string} rootDir
 * @return {Promise<{ok: boolean, difference: string|null}>}
 */
async function recomputeComparativeBenchmarks(rootDir = REPO_ROOT) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'comparative-recompute-'));
  try {
    checkForensicCoverage(rootDir);
    copyInputs(rootDir, scratch);
    await regenerateAllBenchmarkArtifactsFromAdmitted(scratch);
    compareTrees(rootDir, scratch);
    checkPublishedCells(JSON.parse(fs.readFileSync(path.join(rootDir, MATRIX_PATH), UTF8)));
    return {ok: true, difference: null};
  } catch (err) {
    return {ok: false, difference: err instanceof RecomputeDifference ? err.message :
      `recomputation failed: ${err.message}`};
  } finally {
    fs.rmSync(scratch, {recursive: true, force: true});
  }
}

const isDirectCli = process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectCli) {
  const rootFlag = arrayIndexOf(process.argv, '--root');
  const rootDir = rootFlag > 0 ? path.resolve(process.argv[rootFlag + 1]) : REPO_ROOT;
  const result = await recomputeComparativeBenchmarks(rootDir);
  if (!result.ok) {
    process.stderr.write(`comparative-benchmark-recompute: FAIL: ${result.difference}\n`);
    process.exit(1);
  }
  process.stdout.write(PASS_MESSAGE);
}

export {recomputeComparativeBenchmarks};
