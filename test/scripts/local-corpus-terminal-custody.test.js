// Candidate adaptation of original 41639124: the same real-child schedule,
// read through the canonical immutable state owner rather than a mutable base.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {flushCoverageBeforeKill} from '../../scripts/checks/census-pre-kill-flush.js';
import {startLocalCorpus} from '../../scripts/publish-local-corpus.js';
import {readLocalCorpusRecords} from '../../scripts/publish-local-corpus-state.js';

// Candidate equivalent of the original falsifier, preserving its real RED and
// ESRCH schedule. The base is now immutable; the current record has one reader.
const fixture = fileURLToPath(new URL('./local-corpus-terminal-custody-child.js', import.meta.url));
const head = 'a'.repeat(40);
const observationBoundMs = 15000;
const closeBoundMs = 5000;
const pollMs = 10;

function currentState(stateDir) {
  return readLocalCorpusRecords(stateDir).find((record) => record.sha === head);
}

function retainedNodes(stateDir) {
  return fs.readdirSync(stateDir).filter((name) =>
    name === `${head}.json` || name.startsWith(`${head}.from-`)).sort()
    .map((name) => [name, fs.readFileSync(path.join(stateDir, name), 'utf8')]);
}

function track(child) {
  const record = {child, closed: false, result: null};
  // Capture close immediately, including a failed spawn. All awaited work has
  // its own deadline; no unref'ed timer can make the test disappear early.
  child.on('error', (error) => { record.error = error; });
  child.once('close', (code, signal) => {
    record.closed = true;
    record.result = {code, signal};
  });
  return record;
}

async function until(predicate, label, bound = observationBoundMs) {
  const deadline = Date.now() + bound;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(`fixture observation expired: ${label}`);
    await delay(pollMs);
  }
}

async function closeOwned(record) {
  if (!record.closed && record.child.pid) {
    flushCoverageBeforeKill(record.child.pid, 'SIGKILL');
    try {
      process.kill(-record.child.pid, 'SIGKILL');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
  await until(() => record.closed, 'owned child close', closeBoundMs);
}

test('reconcileLocalCorpus preserves terminal RED committed after its RUNNING snapshot',
  {timeout: 60000}, async (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'corpus-terminal-custody-'));
    const stateDir = path.join(directory, 'state');
    const stateFile = path.join(stateDir, `${head}.json`);
    const children = [];
    t.after(async () => {
      const closures = await Promise.allSettled(children.map(closeOwned));
      for (const name of ['reconciler.log', `state/${head}.log`]) {
        const file = path.join(directory, name);
        if (fs.existsSync(file)) t.diagnostic(`${name}: ${fs.readFileSync(file, 'utf8')}`);
      }
      const failure = closures.find((entry) => entry.status === 'rejected');
      if (failure) throw failure.reason;
      fs.rmSync(directory, {recursive: true, force: true});
    });

    let producer;
    const pid = startLocalCorpus({root: directory, stateDir, head, files: ['controlled.test.js'],
      spawnProcess(command, args, options) {
        assert.equal(command, process.execPath);
        assert.equal(args[1], '--local-corpus');
        // Keep production's actual STARTING acquisition, descriptors and
        // detached lifetime. Only the command entry targets this finite fixture.
        producer = track(spawn(command,
          [fixture, 'producer', directory, head, '--local-corpus'], options));
        children.push(producer);
        return producer.child;
      },
    });
    await until(() => fs.existsSync(path.join(directory, 'producer-ready')) || producer.closed,
      'producer RUNNING acknowledgment');
    assert.equal(producer.closed, false, 'producer is held before its terminal result');
    const baseBytes = fs.readFileSync(stateFile, 'utf8');
    const running = currentState(stateDir);
    assert.equal(running.state, 'running');
    assert.equal(running.pid, pid);

    const log = fs.openSync(path.join(directory, 'reconciler.log'), 'wx');
    let reconciler;
    try {
      reconciler = track(spawn(process.execPath, [fixture, 'reconciler', directory, head],
        {detached: true, stdio: ['ignore', log, log]}));
      children.push(reconciler);
    } finally {
      fs.closeSync(log);
    }
    const snapshotFile = path.join(directory, 'snapshot.json');
    await until(() => fs.existsSync(snapshotFile) || reconciler.closed,
      'reconciler captured native RUNNING bytes');
    assert.equal(reconciler.closed, false, 'reconciler is held at the exact file read');
    assert.deepEqual(JSON.parse(fs.readFileSync(snapshotFile, 'utf8')), running);

    fs.writeFileSync(path.join(directory, 'release-producer'), 'release');
    await until(() => producer.closed, 'producer terminal write and close');
    assert.deepEqual(producer.result, {code: 23, signal: null});
    const terminal = currentState(stateDir);
    const terminalBytes = JSON.stringify(terminal);
    const terminalNodes = retainedNodes(stateDir);
    assert.equal(terminal.state, 'red');
    assert.equal(terminal.status, 23);
    assert.equal(terminal.pid, pid);
    assert.equal(typeof terminal.finishedAt, 'number');
    // close was observed by the parent: the original child was reaped before
    // the reconciler's real signal-zero call, not merely made into a zombie.
    fs.writeFileSync(path.join(directory, 'release-reconciler'), 'release');
    await until(() => reconciler.closed, 'reconciler close');
    assert.deepEqual(reconciler.result, {code: 0, signal: null});
    const observations = JSON.parse(fs.readFileSync(
      path.join(directory, 'reconciler-observations.json'), 'utf8'));
    assert.equal(observations.captures, 1);
    assert.deepEqual(observations.probes, [{pid, signal: 0, code: 'ESRCH'}],
      'production observed actual absence; the fixture did not synthesize an errno');
    const afterBytes = JSON.stringify(currentState(stateDir));
    t.diagnostic(JSON.stringify({snapshot: running, terminal, after: JSON.parse(afterBytes),
      observations, producerClose: producer.result, reconcilerClose: reconciler.result}));
    assert.equal(afterBytes, terminalBytes,
      'stale RUNNING reconciliation must preserve the production terminal record byte-for-byte');
    assert.equal(fs.readFileSync(stateFile, 'utf8'), baseBytes,
      'the original admitted base is immutable');
    assert.deepEqual(retainedNodes(stateDir), terminalNodes,
      'stale reconciliation cannot replace any committed terminal node');
  });
