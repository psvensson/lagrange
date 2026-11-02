// Regressions for the comparative-benchmark defect ledger
// (solve/quests/comparative-benchmark-evidence-repair/evidence/defect-ledger.md).
// Each test drives an entry point that exists before and after the repair, so the
// red run at the base commit fails through the defect itself.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySome = Function.call.bind(Array.prototype.some);
const stringIncludes = Function.call.bind(String.prototype.includes);
const stringReplace = Function.call.bind(String.prototype.replace);
const stringSplit = Function.call.bind(String.prototype.split);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringTrim = Function.call.bind(String.prototype.trim);

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const HARNESS = path.join(REPO_ROOT, 'test/distributed/harness');
const DATA_DIR = 'data/tidb-comparison';
const DOCS_DIR = 'docs/benchmarks';

// recordSha256 of every history record written before 62d537313 and dropped by the
// regenerate path (c9362f839: 7, 44fecc9ee: +1, 86e795c44: 4, 9552bfbb6: 4).
const DROPPED_HISTORY_RECORD_PREFIXES = Object.freeze([
  'ae6bd0386ece', '6cca9aa074d2', '66d08c67e9e3', '0157b6d79ab0', 'd7e5bccaf87e',
  '830ca7fa2d21', 'e1009e0265fe', '4452b6dd51e2', '59a7afbf1b8e', '7aaf3fda8eca',
  'eee2d296135d', '0beb212c88a5', 'b31fb159033f', 'e2b828ec15de', '73f64646115c',
  '4ae39281b8b5',
]);

// Modules are loaded at test time so a red run at the base commit fails in the
// test, not at import. A literal import() path keeps the consumer visible to the
// unused-export census (knip); harness(file) is for modules whose exports other
// importers already consume.
function harness(file) {
  return import(path.join(HARNESS, file));
}

function copyFixtureRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-defects-'));
  for (const rel of [DATA_DIR, DOCS_DIR]) {
    fs.cpSync(path.join(REPO_ROOT, rel), path.join(root, rel), {recursive: true});
  }
  return root;
}

function collectKeyed(value, predicate, trail = '$', out = []) {
  if (!value || typeof value !== 'object') return out;
  for (const [key, child] of Object.entries(value)) {
    const at = `${trail}.${key}`;
    if (predicate(key, child)) out.push(at);
    collectKeyed(child, predicate, at, out);
  }
  return out;
}

function sha256Prefixed(text) {
  return `sha256:${createHash('sha256').update(text).digest('hex')}`;
}

function readNdjson(file) {
  return arrayMap(arrayFilter(stringSplit(fs.readFileSync(file, 'utf8'), '\n'),
    (l) => stringTrim(l)), (l) => JSON.parse(l));
}

describe('comparative benchmark defect regressions', () => {
  it('D04: no published Scenario A claim carries semantic proof counts it never observed', async () => {
    const {buildMultiSystemComparativeMatrix} = await import('../comparative-matrix-runner.js');
    const matrix = buildMultiSystemComparativeMatrix();
    const proofCounts = collectKeyed(matrix, (key, child) =>
      /^semanticProof(Passed|Total|Required)$|^passedCount$/u.test(key) &&
      typeof child === 'number');
    assert.deepEqual(proofCounts, [], 'semantic proof counts must come from the semantic gate');
    for (const target of matrix.targets) {
      const cell = target.claims?.scenarioA;
      assert.ok(cell, `${target.targetId} must publish a Scenario A admission cell`);
      assert.notEqual(cell.status, 'valid-observed',
        `${target.targetId} Scenario A cannot be valid without a passed semantic gate`);
    }
  });

  it('D13: regeneration never synthesises quantiles or constant transaction counts', async () => {
    const root = copyFixtureRoot();
    try {
      const {deriveAdmittedMeasurementsFromRawObservations} =
        await harness('raw-observation-store.js');
      const {regenerateAllBenchmarkArtifactsFromAdmitted} =
        await harness('raw-observation-campaign-specs.js');
      const admitted = deriveAdmittedMeasurementsFromRawObservations(root);
      const {historyRecords} = await regenerateAllBenchmarkArtifactsFromAdmitted(root, admitted);
      for (const record of historyRecords) {
        for (const [system, m] of Object.entries(record.metrics || {})) {
          const lat = m?.latencyMs;
          if (lat && typeof lat.p95 === 'number') {
            assert.notEqual(lat.p50, Number((lat.p95 * 0.45).toFixed(2)),
              `${system} p50 is synthesised from p95`);
            assert.notEqual(lat.p99, Number((lat.p95 * 1.18).toFixed(2)),
              `${system} p99 is synthesised from p95`);
          }
          const tx = m?.transactions;
          assert.ok(!(tx && tx.failed === 0 && tx.retries === 0 && tx.attempted === tx.succeeded),
            `${system} transaction counts are constants, not observations`);
        }
      }
    } finally {
      fs.rmSync(root, {recursive: true, force: true});
    }
  });

  it('D14: history keeps every record ever recorded', () => {
    const history = readNdjson(path.join(REPO_ROOT, DATA_DIR, 'history.ndjson'));
    const shas = arrayMap(history, (r) => r.recordSha256);
    for (const prefix of DROPPED_HISTORY_RECORD_PREFIXES) {
      assert.ok(arraySome(shas, (sha) => stringStartsWith(sha, prefix)),
        `history record ${prefix} dropped by an earlier regeneration must be restored`);
    }
  });

  it('D14: the history writer only appends and refuses duplicates', async () => {
    const history = readNdjson(path.join(REPO_ROOT, DATA_DIR, 'history.ndjson'));
    const store = await harness('oltp-comparison-history-store.js');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-history-'));
    try {
      const ndjsonPath = path.join(dir, 'history.ndjson');
      const summaryPath = path.join(dir, 'summary.json');
      const [first, second] = arrayMap(
        [history[0], {...history[0], recordedAt: '2030-01-01T00:00:00.000Z'}],
        (r) => store.createComparisonHistoryRecord(r));

      await store.recordComparisonResultToDisk({record: first, ndjsonPath, summaryPath});
      const before = fs.readFileSync(ndjsonPath, 'utf8');
      await store.recordComparisonResultToDisk({record: second, ndjsonPath, summaryPath});
      const after = fs.readFileSync(ndjsonPath, 'utf8');
      assert.ok(stringStartsWith(after, before), 'existing history bytes must be preserved');
      assert.deepEqual(arrayMap(readNdjson(ndjsonPath), (r) => r.recordSha256),
        [first.recordSha256, second.recordSha256]);
      await assert.rejects(
        store.recordComparisonResultToDisk({record: second, ndjsonPath, summaryPath}),
        /duplicate/u);
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });

  it('D15: no published content identity is a hash of a label', () => {
    const admitted = JSON.parse(fs.readFileSync(
      path.join(REPO_ROOT, DATA_DIR, 'admitted-lab-measurements.json'), 'utf8'));
    const labelHashes = collectKeyed(admitted, (key, child) => {
      if (!child || typeof child !== 'object' || typeof child.datasetDigest !== 'string') {
        return false;
      }
      const targetId = stringReplace(String(child.receiptId || ''), /^receipt-|-scenario-a$/gu, '');
      const hosts = child.hostPlacement?.hosts || [];
      return child.datasetDigest === sha256Prefixed(`dataset-${targetId}-${hosts.length}`) ||
        child.planDigest === sha256Prefixed(`plan-${child.receiptId}-${hosts.join(',')}`);
    });
    assert.deepEqual(labelHashes, [], 'dataset/plan digests must be content digests');
  });

  it('D16: identity is never checked against a sentinel string', () => {
    const source = fs.readFileSync(path.join(HARNESS, 'comparative-matrix-runner.js'), 'utf8');
    assert.equal(stringIncludes(source, '\'mismatched\''), false,
      'admission must compare recorded identities, not a sentinel literal');
  });

  it('F2: the regeneration module advertises no deployment configuration of its own',
    async () => {
      // The coverage manifest is the one owner of advertised configurations; a
      // second image/port/knob table beside it had no consumer.
      const module = await harness('raw-observation-campaign-specs.js');
      assert.deepEqual(Object.keys(module), ['regenerateAllBenchmarkArtifactsFromAdmitted']);
    });

  it('D23: the publication carries no winner prose or forced completion counts', async () => {
    const {buildMultiSystemComparativeMatrix} = await import('../comparative-matrix-runner.js');
    const matrix = buildMultiSystemComparativeMatrix();
    const forced = collectKeyed(matrix, (key) => arrayIncludes([
      'winningSystem', 'whyItWins', 'runnerUp', 'operatingBoundaryMap', 'completedSlices',
      'remainingSlicesCount', 'rpoZeroSurvivability',
    ], key));
    assert.deepEqual(forced, [], 'winner prose and completion constants must be absent');
    for (const name of fs.readdirSync(path.join(REPO_ROOT, DOCS_DIR))) {
      if (!/\.(md|html|svg)$/u.test(name) || stringStartsWith(name, 'tidb-reference-')) continue;
      const text = fs.readFileSync(path.join(REPO_ROOT, DOCS_DIR, name), 'utf8');
      assert.equal(/where each system wins|winning system|winningSystem/iu.test(text), false,
        `${name} must not publish winner prose`);
    }
  });
});
