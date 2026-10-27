import test from 'node:test';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const CHILD = new URL('./service-consensus-creation-recovery-child.js', import.meta.url);

function child(children, args) {
  const running = fork(CHILD, args, {execArgv: [], stdio: ['ignore', 'pipe', 'pipe', 'ipc']});
  let output = '';
  const collect = (bytes) => {
    output = (output + bytes.toString()).slice(-16000);
  };
  running.stdout.on('data', collect);
  running.stderr.on('data', collect);
  const closed = new Promise((resolve) => running.once('close', (code, signal) =>
    resolve({code, signal})));
  const result = new Promise((resolve, reject) => {
    running.once('message', resolve);
    running.once('error', reject);
    running.once('close', () => reject(new Error(`child closed before result: ${output}`)));
  });
  const owned = {running, closed, result};
  children.push(owned);
  return owned;
}
for (const mode of ['reservation', 'admission']) {
  test(`ServiceLifecycleManager resumes original intent after SIGKILL at ${mode}`, async (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'lagrange-creation-intent-'));
    const databasePath = join(dir, 'component.sqlite');
    const children = [];
    t.after(async () => {
      for (const owned of children) {
        if (owned.running.exitCode === null && owned.running.signalCode === null) {
          owned.running.kill('SIGKILL');
        }
        await owned.closed;
      }
      rmSync(dir, {recursive: true, force: true});
    });
    const first = child(children, [mode, databasePath]);
    const saved = await first.result;
    assert.equal(saved.kind, 'interrupted', saved.message);
    assert.notEqual(saved.pid, process.pid);
    assert.equal(saved.resource.phase, 'ADMITTED');
    assert.equal(saved.resource.ordinal, 1);
    assert.equal(saved.row.admission_json === null, mode === 'reservation');
    first.running.kill('SIGKILL');
    assert.deepEqual(await first.closed, {code: null, signal: 'SIGKILL'});
    const second = child(children, ['recover', databasePath, saved.row.operation_id]);
    const replay = await second.result;
    assert.equal(replay.kind, 'recovered', replay.message);
    assert.notEqual(replay.pid, saved.pid);
    assert.equal(replay.result.outcome, 'ADMISSION_RETAINED');
    assert.deepEqual(replay.result.token, saved.resource.token);
    assert.equal(replay.row.intent_json, saved.row.intent_json);
    assert.equal(replay.row.operation_id, saved.row.operation_id);
    assert.equal(replay.row.state, 'in_progress');
    assert.equal(replay.resource.ordinal, 1);
    assert.equal(replay.operations, 1);
    assert.equal(replay.result.started, undefined);
    assert.deepEqual(await second.closed, {code: 0, signal: null});
    t.diagnostic(JSON.stringify({scope: 'file-backed SQLite component journal, not Raft',
      mode, originalPid: saved.pid, recoveryPid: replay.pid,
      operationId: replay.row.operation_id, ordinal: replay.resource.ordinal}));
  });
}
