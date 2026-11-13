import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {flushCoverageBeforeKill} from '../../scripts/checks/census-pre-kill-flush.js';
import {startLocalCorpus} from '../../scripts/publish-local-corpus.js';
import {
  LOCAL_CORPUS_STATE as STATE, LOCAL_CORPUS_TRANSITION as TRANSITION,
  createLocalCorpusState, readLocalCorpusRecords, transitionLocalCorpusState,
} from '../../scripts/publish-local-corpus-state.js';

const HEAD = 'a'.repeat(40);
const CHILD = fileURLToPath(new URL('./local-corpus-concurrency-child.js', import.meta.url));
const BOUND_MS = 15000;

async function until(predicate, label, bound = BOUND_MS) {
  const deadline = Date.now() + bound;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(`fixture observation expired: ${label}`);
    await delay(10);
  }
}

function tracked(child) {
  const record = {child, closed: false};
  child.on('error', (error) => { record.error = error; });
  child.once('close', (code, signal) => {
    Object.assign(record, {closed: true, code, signal});
  });
  return record;
}

async function stop(record) {
  if (!record.closed && record.child.pid) {
    flushCoverageBeforeKill(record.child.pid, 'SIGKILL');
    try { process.kill(-record.child.pid, 'SIGKILL'); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
  await until(() => record.closed, 'owned child close', 5000);
}

function setup(t, initial = STATE.RUNNING) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'corpus-concurrency-'));
  const stateDir = path.join(directory, 'state');
  const children = [];
  t.after(async () => {
    const results = await Promise.allSettled(children.map(stop));
    for (const file of fs.readdirSync(directory).filter((name) => name.endsWith('.log'))) {
      t.diagnostic(`${file}: ${fs.readFileSync(path.join(directory, file), 'utf8')}`);
    }
    const failure = results.find((result) => result.status === 'rejected');
    if (failure) throw failure.reason;
    fs.rmSync(directory, {recursive: true, force: true});
  });
  let record;
  if (initial) {
    record = createLocalCorpusState(stateDir,
      {sha: HEAD, state: STATE.STARTING, pid: null, startedAt: 1, files: 1}).record;
    if (initial === STATE.RUNNING) {
      record = transitionLocalCorpusState(stateDir, record,
        {...record, state: STATE.RUNNING, pid: process.pid}).record;
    }
  }
  const read = (name) => JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));
  const launch = (mode, token, status = 23) => {
    const fd = fs.openSync(path.join(directory, `${token}.log`), 'wx');
    try {
      const child = tracked(spawn(process.execPath,
        [CHILD, mode, directory, HEAD, token, String(status), '--local-corpus'],
        {detached: true, stdio: ['ignore', fd, fd]}));
      children.push(child);
      return child;
    } finally { fs.closeSync(fd); }
  };
  const ready = async (child, token) => {
    await until(() => fs.existsSync(path.join(directory, `${token}-ready.json`)) || child.closed,
      `${token} acknowledged barrier`);
    assert.equal(child.closed, false, `${token} remains held at its acknowledged barrier`);
    return read(`${token}-ready.json`);
  };
  const result = async (child, token) => {
    await until(() => child.closed, `${token} close`);
    assert.equal(child.code, 0, fs.readFileSync(path.join(directory, `${token}.log`), 'utf8'));
    assert.equal(child.signal, null);
    return read(`${token}-result.json`);
  };
  return {directory, stateDir, children, record, launch, ready, result,
    current: () => readLocalCorpusRecords(stateDir)[0],
    release: () => fs.writeFileSync(path.join(directory, 'release'), 'release')};
}

test('two real terminal writers have one native link winner and one retained losing proposal',
  {timeout: 45000}, async (t) => {
    const fixed = setup(t);
    const first = fixed.launch('terminal', 'first', 23);
    const second = fixed.launch('terminal', 'second', 47);
    const ready = await Promise.all([fixed.ready(first, 'first'), fixed.ready(second, 'second')]);
    assert.deepEqual(ready[0].before, ready[1].before, 'both consume the exact RUNNING state');
    assert.notEqual(ready[0].pid, ready[1].pid);
    fixed.release();
    const results = await Promise.all([fixed.result(first, 'first'), fixed.result(second, 'second')]);
    assert.deepEqual(results.map((entry) => entry.outcome).sort(),
      [TRANSITION.APPLIED, TRANSITION.CURRENT_CHANGED].sort());
    const winner = results.find((entry) => entry.outcome === TRANSITION.APPLIED);
    const loser = results.find((entry) => entry.outcome === TRANSITION.CURRENT_CHANGED);
    assert.equal(winner.destination, loser.destination);
    assert.deepEqual(fixed.current(), winner.record);
    assert.deepEqual(loser.record, winner.record);
    const proposal = JSON.parse(fs.readFileSync(loser.proposalPath, 'utf8'));
    assert.notEqual(proposal.record.status, winner.record.status);
    assert.equal(fs.readdirSync(fixed.stateDir).filter((name) => name.includes('.from-')).length, 2,
      'one RUNNING and one terminal link, with no rebased losing transition');
    t.diagnostic(JSON.stringify({results, current: fixed.current()}));
  });

test('duplicate real runLocalCorpus claimants admit exactly one actual gate subprocess',
  {timeout: 45000}, async (t) => {
    const fixed = setup(t, STATE.STARTING);
    const first = fixed.launch('claimant', 'first');
    const second = fixed.launch('claimant', 'second');
    const ready = await Promise.all([fixed.ready(first, 'first'), fixed.ready(second, 'second')]);
    assert.equal(ready[0].destination, ready[1].destination);
    fixed.release();
    const results = await Promise.all([fixed.result(first, 'first'), fixed.result(second, 'second')]);
    assert.equal(results.filter((entry) => entry.status === 23).length, 1);
    assert.equal(results.filter((entry) => entry.error?.outcome === TRANSITION.CURRENT_CHANGED).length, 1);
    const gates = fs.readFileSync(path.join(fixed.directory, 'gates.log'), 'utf8').trim().split('\n');
    assert.equal(gates.length, 1, 'the loser never enters the gate collaborator');
    assert.equal(fixed.current().state, STATE.RED);
    assert.equal(fixed.current().status, 23);
    t.diagnostic(JSON.stringify({results, gates, current: fixed.current()}));
  });

for (const mode of ['crash-before-link', 'crash-after-link', 'crash-after-fsync']) {
  test(`a real ${mode} leaves no lock and preserves its publication boundary`,
    {timeout: 30000}, async (t) => {
      const fixed = setup(t);
      const child = fixed.launch(mode, 'writer');
      const checkpoint = await fixed.ready(child, 'writer');
      const proposal = fs.readFileSync(checkpoint.source, 'utf8');
      await stop(child);
      assert.equal(child.signal, 'SIGKILL', 'controlled death happened at the acknowledged boundary');
      assert.equal(fs.readFileSync(checkpoint.source, 'utf8'), proposal);
      assert.equal(fixed.current().state, checkpoint.linked ? STATE.RED : STATE.RUNNING);
      const contender = transitionLocalCorpusState(fixed.stateDir, fixed.record,
        {...fixed.record, state: STATE.LOST, reason: 'independent contender'});
      assert.equal(contender.outcome,
        checkpoint.linked ? TRANSITION.CURRENT_CHANGED : TRANSITION.APPLIED);
      if (checkpoint.linked) {
        assert.equal(fs.readFileSync(checkpoint.destination, 'utf8'), proposal);
        assert.equal(contender.record.status, 23);
      } else {
        assert.equal(contender.record.state, STATE.LOST);
      }
      assert.equal(fs.readFileSync(checkpoint.source, 'utf8'), proposal,
        'progress never sweeps the dead writer proposal');
      t.diagnostic(JSON.stringify({checkpoint, current: fixed.current(), contender}));
    });
}

test('late parent spawn error cannot erase its real child terminal', {timeout: 30000}, async (t) => {
  const fixed = setup(t, null);
  let producer;
  startLocalCorpus({root: fixed.directory, stateDir: fixed.stateDir, head: HEAD,
    files: ['controlled.test.js'], spawnProcess(command, _args, options) {
      producer = tracked(spawn(command,
        [CHILD, 'producer', fixed.directory, HEAD, 'producer', '23', '--local-corpus'], options));
      fixed.children.push(producer);
      return producer.child;
    }});
  await until(() => producer.closed, 'real producer close');
  assert.equal(producer.code, 0);
  const before = fixed.current();
  assert.equal(before.state, STATE.RED);
  const nodes = fs.readdirSync(fixed.stateDir).filter((name) => name.endsWith('.json'))
    .map((name) => [name, fs.readFileSync(path.join(fixed.stateDir, name), 'utf8')]);
  const diagnostic = [];
  const write = t.mock.method(process.stderr, 'write', (line) => { diagnostic.push(String(line)); return true; });
  try { producer.child.emit('error', new Error('controlled delayed parent failure')); }
  finally { write.mock.restore(); }
  assert.deepEqual(fixed.current(), before);
  for (const [name, bytes] of nodes) assert.equal(fs.readFileSync(path.join(fixed.stateDir, name), 'utf8'), bytes);
  assert.ok(diagnostic.some((line) => line.includes('controlled delayed parent failure')));
  assert.equal(fs.readFileSync(path.join(fixed.directory, 'gates.log'), 'utf8').trim().split('\n').length, 1);
});


test('simultaneous admission preserves one initial obligation and the rejected proposal',
  {timeout: 45000}, async (t) => {
    const fixed = setup(t, null);
    // Existing directory isolates the no-replace admission from directory
    // provisioning; both children still call the real admission owner.
    fs.mkdirSync(fixed.stateDir);
    const first = fixed.launch('admission', 'first', 23);
    const second = fixed.launch('admission', 'second', 47);
    await Promise.all([fixed.ready(first, 'first'), fixed.ready(second, 'second')]);
    fixed.release();
    const results = await Promise.all([fixed.result(first, 'first'), fixed.result(second, 'second')]);
    assert.deepEqual(results.map((entry) => entry.outcome).sort(),
      [TRANSITION.APPLIED, TRANSITION.CURRENT_CHANGED].sort());
    const winner = results.find((entry) => entry.outcome === TRANSITION.APPLIED);
    const loser = results.find((entry) => entry.outcome === TRANSITION.CURRENT_CHANGED);
    assert.deepEqual(fixed.current(), winner.record);
    assert.deepEqual(loser.record, winner.record);
    const proposal = JSON.parse(fs.readFileSync(loser.proposalPath, 'utf8'));
    assert.notEqual(proposal.admission, winner.record.admission);
    assert.equal(fs.readdirSync(fixed.stateDir).filter((name) => name.endsWith('.json')).length, 1);
    assert.equal(fs.existsSync(path.join(fixed.directory, 'gates.log')), false);
  });
