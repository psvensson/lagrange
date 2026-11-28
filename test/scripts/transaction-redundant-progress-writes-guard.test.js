/**
 * The transaction-redundant-progress-writes probe measures what it names:
 * every property is reported by name, the metric is the count of unmet
 * ones and the exit status agrees with it; and a known-bad candidate that
 * removes too much (it stops retaining the participants' PREPARE evidence
 * rows) is refused by the preservation properties, not only by the removal
 * properties.
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
  'transaction-redundant-progress-writes-guard.js');
const PROPERTIES = Object.freeze([
  'active-participant-row-absent',
  'prepared-status-write-absent',
  'participant-rows-start-at-prepare',
  'coordinator-write-counts',
  'manifest-precedes-participant-requests',
  'prepare-evidence-precedes-decision',
  'recovery-before-prepare',
  'recovery-before-decision',
  'recovery-after-decision',
  'live-in-doubt-sweep-commit-path',
]);
const PREPARE_EVIDENCE_PROPERTIES = Object.freeze([
  'prepare-evidence-precedes-decision',
  'recovery-before-decision',
]);

function runGuard(extraNodeArgs = []) {
  const result = spawnSync(process.execPath, [...extraNodeArgs, GUARD,
    '--json'], {cwd: REPO_ROOT, encoding: 'utf8', timeout: 120000});
  return {status: result.status, outcome: JSON.parse(result.stdout)};
}

// A preload that elides every PREPARED participant row at the engine's
// persistence owner: the coordinator then decides without retained evidence.
function writeEvidenceDroppingPreload(directory) {
  const engineUrl = pathToFileURL(path.join(REPO_ROOT, 'src', 'query',
    'sql-query-engine.js')).href;
  const preload = path.join(directory, 'drop-prepare-evidence.mjs');
  fs.writeFileSync(preload, [
    `const {SQLQueryEngine} = await import(${JSON.stringify(engineUrl)});`,
    'const persist = SQLQueryEngine.prototype.' +
      'persistDistributedTransactionParticipantRow;',
    'Object.defineProperty(SQLQueryEngine.prototype,',
    '  \'persistDistributedTransactionParticipantRow\', {configurable: true,',
    '    writable: true, enumerable: false,',
    '    value: async function(record) {',
    '      if (record?.status === \'PREPARED\') return undefined;',
    '      return persist.call(this, record);',
    '    }});',
    '',
  ].join('\n'));
  return preload;
}

test('the probe names every property and its metric is the unmet count',
  () => {
    const {status, outcome} = runGuard();
    const failed = outcome.failures.map((failure) => failure.name);
    assert.equal(outcome.metric, failed.length);
    assert.equal(status, outcome.metric === 0 ? 0 : 1);
    assert.deepEqual(failed.filter((name) => !PROPERTIES.includes(name)), []);
    assert.deepEqual(failed.filter((name) =>
      PREPARE_EVIDENCE_PROPERTIES.includes(name)), [],
    'the current tree retains PREPARE evidence before every decision');
  });

test('a candidate that stops retaining PREPARE evidence is refused by the ' +
  'preservation properties', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),
    'progress-writes-guard-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  const preload = writeEvidenceDroppingPreload(directory);
  const {status, outcome} = runGuard(['--import', pathToFileURL(preload).href]);
  const failed = outcome.failures.map((failure) => failure.name);
  assert.equal(status, 1);
  for (const property of PREPARE_EVIDENCE_PROPERTIES) {
    assert.ok(failed.includes(property), `${property} refuses: ${failed}`);
  }
});
