// Guard for the multi-system comparative matrix. PASS requires: the published
// matrix, admitted cells, progress summary and every page equal their offline
// recomputation; the 14 advertised configurations are present; every cell uses the
// six-status vocabulary with metrics only on metric-bearing cells; the root
// READMEs link the benchmark overview; and the adversarial acceptance cases (J9,
// J10, J12, J13 and the model-challenge amendments) are handled by the real chain.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {
  CLAIM_CELL_STATUS,
  METRIC_BEARING_STATUSES,
} from '../../test/distributed/harness/benchmark-claim-admission.js';
import {
  ADVERTISED_TARGETS,
} from '../../test/distributed/harness/comparative-coverage-manifest.js';
import {
  DEFAULT_MULTI_SYSTEM_MATRIX_PATH,
  MULTI_SYSTEM_MATRIX_SCHEMA,
} from '../../test/distributed/harness/comparative-matrix-runner.js';
import {runAdversarialCases} from '../../test/distributed/harness/comparative-benchmark-adversarial-cases.js';
import {recomputeComparativeBenchmarks} from './comparative-benchmark-recompute.js';

const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayIndexOf = Function.call.bind(Array.prototype.indexOf);
const arrayMap = Function.call.bind(Array.prototype.map);
const stringIncludes = Function.call.bind(String.prototype.includes);

const UTF8 = 'utf8';
const MSG_ADVERTISED_TARGETS = 'the 14 advertised configurations';
const PASS_MESSAGE = 'comparative-benchmark-matrix-guard: PASS\n';
const ROOT_README_LINKS = Object.freeze([
  ['README.md', 'docs/benchmarks/README.md'],
  ['docs/README.md', 'benchmarks/index.html'],
  ['docs/README.md', 'benchmarks/README.md'],
]);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function verifyCell(cell, where) {
  assert.ok(cell, `${where}: missing cell`);
  assert.equal(arrayIncludes(Object.values(CLAIM_CELL_STATUS), cell.status), true,
    `${where}: unknown status ${cell.status}`);
  assert.equal(Array.isArray(cell.reasons), true, `${where}: reasons must be a list`);
  if (!arrayIncludes(METRIC_BEARING_STATUSES, cell.status)) {
    assert.equal(cell.metrics, null, `${where}: ${cell.status} must not carry metrics`);
    assert.equal(cell.reasons.length > 0, true, `${where}: a non-valid cell names a reason`);
  }
}

function verifyMatrix(matrix) {
  assert.equal(matrix.schema, MULTI_SYSTEM_MATRIX_SCHEMA);
  assert.deepEqual(arrayMap(matrix.targets, (t) => t.targetId),
    arrayMap(ADVERTISED_TARGETS, (t) => t.targetId), MSG_ADVERTISED_TARGETS);
  for (const t of matrix.targets) {
    for (const [column, cell] of Object.entries(t.claims)) {
      verifyCell(cell, `${t.targetId}/${column}`);
    }
  }
  for (const exp of matrix.experiments) {
    for (const r of exp.rows) {
      for (const [column, cell] of Object.entries(r.cells)) {
        verifyCell(cell, `${exp.experimentId}/${r.rowId}/${column}`);
      }
    }
  }
}

function verifyRootReadmeLinks(rootDir) {
  for (const [file, link] of ROOT_README_LINKS) {
    const text = fs.readFileSync(path.resolve(rootDir, file), UTF8);
    assert.equal(stringIncludes(text, link), true, `${file} must link ${link}`);
  }
}

/**
 * Run the guard against a repository root.
 * @param {string} rootDir
 * @param {{adversarial?: boolean}} options
 */
export async function runComparativeBenchmarkMatrixGuard(rootDir = REPO_ROOT, options = {}) {
  const recompute = await recomputeComparativeBenchmarks(rootDir);
  assert.equal(recompute.ok, true, `recomputation: ${recompute.difference}`);
  const matrix = JSON.parse(fs.readFileSync(
    path.resolve(rootDir, DEFAULT_MULTI_SYSTEM_MATRIX_PATH), UTF8));
  verifyMatrix(matrix);
  verifyRootReadmeLinks(rootDir);
  if (options.adversarial !== false) await runAdversarialCases();
}

const isDirectCli = process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectCli) {
  const rootFlag = arrayIndexOf(process.argv, '--root');
  const rootDir = rootFlag > 0 ? path.resolve(process.argv[rootFlag + 1]) : REPO_ROOT;
  await runComparativeBenchmarkMatrixGuard(rootDir);
  process.stdout.write(PASS_MESSAGE);
}
