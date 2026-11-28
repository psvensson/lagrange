/**
 * The scenario-a-measured-latency-and-efficiency probe measures what it
 * names, with planted controls:
 * - its metric is the number of rows whose measured value exceeds the
 *   target, and the exit status agrees;
 * - a planted improvement (removal of the ACTIVE participant row,
 *   simulated by the quest's retained preload) meets every row;
 * - a planted regression (every sql_transactions status write submitted
 *   twice in sequence, one more round each) is refused;
 * - a planted measurement failure (COMMIT answers failure) prints no number
 *   and exits 2, so a probe reading it reports "not measured".
 */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath, pathToFileURL} from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const GUARD = path.join(REPO_ROOT, 'scripts', 'checks',
  'scenario-a-measured-latency-and-efficiency-guard.js');
const REMOVAL_A_PRELOAD = path.join(REPO_ROOT, 'solve', 'quests',
  'transaction-redundant-progress-writes', 'evidence',
  'simulate-removal-a.mjs');
const ROWS = Object.freeze(['new-order-sequential-rounds',
  'payment-sequential-rounds', 'proposals-per-transaction']);
const NUMBER_LINE = /^\d+$/u;

function moduleUrl(...segments) {
  return pathToFileURL(path.join(REPO_ROOT, ...segments)).href;
}

function runGuard(flag, extraNodeArgs = []) {
  const result = spawnSync(process.execPath, [...extraNodeArgs, GUARD, flag],
    {cwd: REPO_ROOT, encoding: 'utf8', timeout: 120000});
  return {status: result.status, stdout: result.stdout};
}

function jsonOf(stdout) {
  return JSON.parse(stdout.slice(stdout.indexOf('{\n')));
}

function writePreload(t, name, lines) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'latency-guard-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  const preload = path.join(directory, name);
  fs.writeFileSync(preload, [...lines, ''].join('\n'));
  return pathToFileURL(preload).href;
}

function unmetCount(rows) {
  return rows.filter((entry) => entry.met !== true).length;
}

function exceeds(measured, target) {
  if (typeof measured === 'number') return measured > target;
  return Object.keys(target).some((key) => measured[key] > target[key]);
}

test('the metric is the number of rows whose measurement exceeds the ' +
  'target, and --metric prints exactly that number', () => {
  const json = runGuard('--json');
  const {metric, rows} = jsonOf(json.stdout);
  assert.deepEqual(rows.map((entry) => entry.row), ROWS);
  for (const entry of rows) {
    assert.equal(entry.met, !exceeds(entry.measured, entry.target), entry.row);
  }
  assert.equal(metric, unmetCount(rows));
  assert.equal(json.status, metric === 0 ? 0 : 1);
  const plain = runGuard('--metric');
  const numbers = plain.stdout.split('\n').filter((line) =>
    NUMBER_LINE.test(line.trim()));
  assert.deepEqual(numbers, [String(metric)]);
});

test('a planted improvement (the ACTIVE participant row removed, simulated) ' +
  'meets every row', () => {
  const {status, stdout} = runGuard('--json',
    ['--import', pathToFileURL(REMOVAL_A_PRELOAD).href]);
  const {metric, rows} = jsonOf(stdout);
  assert.equal(metric, 0, JSON.stringify(rows));
  assert.equal(status, 0);
});

test('a planted regression (one more sequential round per status write) ' +
  'is refused', (t) => {
  const preload = writePreload(t, 'double-status-write.mjs', [
    'const {SQLQueryEngine} = await import(' +
      `${JSON.stringify(moduleUrl('src', 'query', 'sql-query-engine.js'))});`,
    'const persist = SQLQueryEngine.prototype.persistDistributedTransactionRow;',
    'Object.defineProperty(SQLQueryEngine.prototype,',
    '  \'persistDistributedTransactionRow\', {configurable: true,',
    '    writable: true, enumerable: false,',
    '    value: async function(record, options = {}) {',
    '      await persist.call(this, record, options);',
    '      if (options.insertOnce !== true) {',
    '        await persist.call(this, record, options);',
    '      }',
    '    }});',
  ]);
  const {status, stdout} = runGuard('--json', ['--import', preload]);
  const {rows} = jsonOf(stdout);
  assert.equal(status, 1);
  assert.equal(rows.find((entry) =>
    entry.row === 'new-order-sequential-rounds').met, false);
});

test('a planted measurement failure prints no number and exits 2', (t) => {
  const preload = writePreload(t, 'commit-fails.mjs', [
    'const {DistributedTransactionCoordinator} = await import(' +
      `${JSON.stringify(moduleUrl('src', 'query', 'distributed',
        'distributed-transaction-coordinator.js'))});`,
    'DistributedTransactionCoordinator.prototype.commit = async () =>',
    '  ({success: false, error: \'planted commit failure\'});',
  ]);
  const {status, stdout} = runGuard('--metric', ['--import', preload]);
  assert.equal(status, 2);
  assert.deepEqual(stdout.split('\n').filter((line) =>
    NUMBER_LINE.test(line.trim())), []);
});
