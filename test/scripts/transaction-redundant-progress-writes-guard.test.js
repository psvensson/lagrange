/**
 * The transaction-redundant-progress-writes probe measures what it names:
 * every property is reported by name, the metric is the count of unmet
 * ones and the exit status agrees with it. Two known-bad candidates that
 * remove too much are refused by the preservation properties, not only by
 * the removal properties:
 * - one stops retaining the participants' PREPARE evidence rows;
 * - one drops the ACTIVE row together with the in-memory ACTIVE transition,
 *   so a participant is begun again on every write (design review C1).
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
  'participant-rows-start-at-prepare',
  'admission-submissions-equal-manifest-changes',
  'participant-rows-are-evidence-and-settlement',
  'one-begin-per-participant',
  'lost-session-not-reopened-by-begin',
  'manifest-precedes-participant-requests',
  'prepare-evidence-precedes-decision',
  'recovery-begin-not-delivered',
  'recovery-before-prepare',
  'recovery-before-decision',
  'recovery-after-decision',
]);
const PRESERVATION_PROPERTIES = Object.freeze(PROPERTIES.slice(3));
const PREPARE_EVIDENCE_PROPERTIES = Object.freeze([
  'prepare-evidence-precedes-decision',
  'recovery-before-decision',
]);
const BEGIN_GATE_PROPERTIES = Object.freeze([
  'one-begin-per-participant',
  'lost-session-not-reopened-by-begin',
]);

function moduleUrl(...segments) {
  return pathToFileURL(path.join(REPO_ROOT, ...segments)).href;
}

function runGuard(extraNodeArgs = []) {
  const result = spawnSync(process.execPath, [...extraNodeArgs, GUARD,
    '--json'], {cwd: REPO_ROOT, encoding: 'utf8', timeout: 120000});
  const start = result.stdout.indexOf('{\n');
  return {status: result.status,
    outcome: JSON.parse(result.stdout.slice(start))};
}

function writePreload(directory, name, lines) {
  const preload = path.join(directory, name);
  fs.writeFileSync(preload, [...lines, ''].join('\n'));
  return pathToFileURL(preload).href;
}

// Elides every PREPARED participant row at the engine's persistence owner:
// the coordinator then decides without retained evidence.
function evidenceDroppingPreload(directory) {
  return writePreload(directory, 'drop-prepare-evidence.mjs', [
    'const {SQLQueryEngine} = await import(' +
      `${JSON.stringify(moduleUrl('src', 'query', 'sql-query-engine.js'))});`,
    'const persist = SQLQueryEngine.prototype.' +
      'persistDistributedTransactionParticipantRow;',
    'Object.defineProperty(SQLQueryEngine.prototype,',
    '  \'persistDistributedTransactionParticipantRow\', {configurable: true,',
    '    writable: true, enumerable: false,',
    '    value: async function(record) {',
    '      if (record?.status === \'PREPARED\') return undefined;',
    '      return persist.call(this, record);',
    '    }});',
  ]);
}

// Drops the in-memory begin gate: after every enlistment the participant
// records fall back to their admission placeholder status, so the next
// statement begins them again.
function beginGateDroppingPreload(directory) {
  return writePreload(directory, 'drop-begin-gate.mjs', [
    'const {DistributedTransactionCoordinator} = await import(' +
      `${JSON.stringify(moduleUrl('src', 'query', 'distributed',
        'distributed-transaction-coordinator.js'))});`,
    'const enlist = DistributedTransactionCoordinator.prototype' +
      '.enlistParticipantsOwned;',
    'DistributedTransactionCoordinator.prototype.enlistParticipantsOwned =',
    '  async function(sessionId, ...rest) {',
    '    const answer = await enlist.call(this, sessionId, ...rest);',
    '    const tx = this.transactionsBySession.get(sessionId);',
    '    for (const participant of tx?.participants?.values() ?? []) {',
    '      if (participant.status === \'ACTIVE\') participant.status = \'FAILED\';',
    '    }',
    '    return answer;',
    '  };',
  ]);
}

function failedNames(outcome) {
  return outcome.failures.map((failure) => failure.name);
}

test('the probe names every property and its metric is the unmet count',
  () => {
    const {status, outcome} = runGuard();
    const failed = failedNames(outcome);
    assert.equal(outcome.metric, failed.length);
    assert.equal(status, outcome.metric === 0 ? 0 : 1);
    assert.deepEqual(failed.filter((name) => !PROPERTIES.includes(name)), []);
    assert.deepEqual(failed.filter((name) =>
      PRESERVATION_PROPERTIES.includes(name)), [],
    'the current tree meets every preservation property');
  });

for (const [label, preloadOf, expected] of [
  ['stops retaining PREPARE evidence', evidenceDroppingPreload,
    PREPARE_EVIDENCE_PROPERTIES],
  ['drops the in-memory begin gate', beginGateDroppingPreload,
    BEGIN_GATE_PROPERTIES],
]) {
  test(`a candidate that ${label} is refused by the preservation properties`,
    (t) => {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(),
        'progress-writes-guard-'));
      t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
      const {status, outcome} = runGuard(['--import', preloadOf(directory)]);
      const failed = failedNames(outcome);
      assert.equal(status, 1);
      for (const property of expected) {
        assert.ok(failed.includes(property), `${property} refuses: ${failed}`);
      }
    });
}
