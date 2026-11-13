import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {createHash} from 'node:crypto';
import {startLocalCorpus} from '../../scripts/publish-local-corpus.js';
import {
  LOCAL_CORPUS_STATE as STATE, LOCAL_CORPUS_TRANSITION as TRANSITION,
  createLocalCorpusState, readLocalCorpusRecords, transitionLocalCorpusState,
} from '../../scripts/publish-local-corpus-state.js';

const HEAD = 'a'.repeat(40);

test('initial directory fsync failure retains cause before any state link or child acquisition', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'corpus-admission-sync-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const stateDir = path.join(root, 'state');
  const fault = Object.assign(new Error('controlled initial directory fsync'), {code: 'EIO'});
  const nativeSync = fs.fsyncSync;
  const nativeLink = fs.linkSync;
  let syncs = 0;
  let links = 0;
  let spawns = 0;
  const sync = t.mock.method(fs, 'fsyncSync', (fd) => {
    if (fs.fstatSync(fd).isDirectory()) { syncs += 1; throw fault; }
    return nativeSync(fd);
  });
  const link = t.mock.method(fs, 'linkSync', (...args) => {
    links += 1;
    return nativeLink(...args);
  });
  let error;
  try {
    error = captureError(() => startLocalCorpus({root, stateDir, head: HEAD,
      files: ['controlled.test.js'], spawnProcess: () => { spawns += 1; }}));
  } finally { sync.mock.restore(); link.mock.restore(); }
  assert.equal(error.code, TRANSITION.STORAGE_UNAVAILABLE);
  assert.equal(error.cause, fault);
  assert.equal(error.destination, path.join(stateDir, `${HEAD}.json`));
  assert.equal(error.proposalPath, null);
  assert.equal(syncs, 1, 'one failed preparation, no retry');
  assert.equal(links, 0);
  assert.equal(spawns, 0);
  assert.deepEqual(fs.readdirSync(stateDir), [], 'no state, staging, file list, cone or log');
});

function setup(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'corpus-state-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  const initial = createLocalCorpusState(directory, {sha: HEAD, state: STATE.STARTING,
    pid: null, startedAt: 1, files: 1, log: path.join(directory, 'first.log'),
    metadata: {owner: 'first'}});
  assert.equal(initial.outcome, TRANSITION.APPLIED);
  const running = transitionLocalCorpusState(directory, initial.record,
    {...initial.record, state: STATE.RUNNING, pid: process.pid});
  assert.equal(running.outcome, TRANSITION.APPLIED);
  return {directory, running, current: () => readLocalCorpusRecords(directory)[0]};
}

function finish(fixed, fields = {}) {
  return transitionLocalCorpusState(fixed.directory, fixed.running.record,
    {...fixed.running.record, state: STATE.RED, status: 23, finishedAt: 2, ...fields});
}

function captureError(action) {
  let caught;
  try { action(); } catch (error) { caught = error; }
  assert.ok(caught, 'the injected unavailable operation is explicit');
  return caught;
}

test('state transitions preserve immutable base and winner, retaining a losing proposal', (t) => {
  const fixed = setup(t);
  const base = path.join(fixed.directory, `${HEAD}.json`);
  const original = fs.readFileSync(base, 'utf8');
  const winner = finish(fixed);
  const bytes = fs.readFileSync(winner.destination, 'utf8');
  const loser = finish(fixed, {status: 47});
  assert.equal(loser.outcome, TRANSITION.CURRENT_CHANGED);
  assert.deepEqual(loser.record, winner.record);
  assert.equal(loser.destination, winner.destination);
  assert.equal(JSON.parse(fs.readFileSync(loser.proposalPath, 'utf8')).record.status, 47);
  const metadata = JSON.parse(fs.readFileSync(
    path.join(path.dirname(loser.proposalPath), 'proposal.json'), 'utf8'));
  assert.equal(metadata.schema, 'lagrange-local-corpus-proposal/v1');
  assert.equal(metadata.destination, path.basename(loser.destination));
  assert.equal(metadata.writerPid, process.pid);
  assert.equal(metadata.sha256,
    createHash('sha256').update(fs.readFileSync(loser.proposalPath)).digest('hex'));
  const lines = [];
  assert.deepEqual(readLocalCorpusRecords(fixed.directory, {write: (line) => lines.push(line)})[0],
    winner.record);
  assert.ok(lines.some((line) => line.includes(path.dirname(loser.proposalPath)) &&
    line.includes('complete proposal')));
  assert.equal(fs.readFileSync(base, 'utf8'), original);
  assert.equal(fs.readFileSync(winner.destination, 'utf8'), bytes);
  assert.throws(() => transitionLocalCorpusState(fixed.directory, winner.record,
    {...winner.record, state: STATE.GREEN}), {code: TRANSITION.RECORD_UNAVAILABLE});
});

for (const mode of ['file-fsync', 'directory-fsync', 'link-before-effect',
  'link-after-effect', 'cleanup']) {
  test(`state publication retains exact evidence for ${mode} failure`, (t) => {
    const fixed = setup(t);
    const nativeSync = fs.fsyncSync;
    const nativeLink = fs.linkSync;
    const nativeUnlink = fs.unlinkSync;
    const fault = Object.assign(new Error(`controlled ${mode}`), {code: 'EIO'});
    let linked = false;
    let engaged = 0;
    let staged;
    let destination;
    const sync = t.mock.method(fs, 'fsyncSync', (fd) => {
      const isFile = fs.fstatSync(fd).isFile();
      if ((mode === 'file-fsync' && isFile) ||
          (mode === 'directory-fsync' && linked && !isFile)) {
        engaged += 1;
        throw fault;
      }
      return nativeSync(fd);
    });
    const link = t.mock.method(fs, 'linkSync', (source, target) => {
      staged = source;
      destination = target;
      if (mode === 'link-before-effect') {
        engaged += 1;
        throw fault;
      }
      nativeLink(source, target);
      linked = true;
      if (mode === 'link-after-effect') {
        engaged += 1;
        throw fault;
      }
    });
    const unlink = t.mock.method(fs, 'unlinkSync', (file) => {
      if (mode === 'cleanup' && file === staged) {
        engaged += 1;
        throw fault;
      }
      return nativeUnlink(file);
    });
    let error;
    try { error = captureError(() => finish(fixed)); }
    finally { sync.mock.restore(); link.mock.restore(); unlink.mock.restore(); }
    const expected = {
      'file-fsync': TRANSITION.STORAGE_UNAVAILABLE,
      'directory-fsync': TRANSITION.LINKED_DURABILITY_UNAVAILABLE,
      'link-before-effect': TRANSITION.LINK_EFFECT_UNAVAILABLE,
      'link-after-effect': TRANSITION.LINK_EFFECT_UNAVAILABLE,
      cleanup: TRANSITION.APPLIED_CLEANUP_UNAVAILABLE,
    };
    assert.equal(engaged, 1, 'one fault, no retry or alternate persistence attempt');
    assert.equal(error.code, expected[mode]);
    assert.equal(error.cause, fault);
    assert.ok(error.proposalPath);
    const proposal = JSON.parse(fs.readFileSync(error.proposalPath, 'utf8'));
    assert.equal(proposal.record.status, 23);
    assert.equal(fixed.current().state, linked ? STATE.RED : STATE.RUNNING);
    if (linked) {
      assert.equal(error.destination, destination);
      assert.equal(fs.readFileSync(destination, 'utf8'),
        fs.readFileSync(error.proposalPath, 'utf8'), 'visible link is never rolled back');
    } else {
      assert.equal(fs.existsSync(error.destination), false);
      const progressed = finish(fixed, {status: 31});
      assert.equal(progressed.outcome, TRANSITION.APPLIED,
        'an independent later legal transition needs no lock reclamation');
      assert.equal(JSON.parse(fs.readFileSync(error.proposalPath, 'utf8')).record.status, 23,
        'the earlier unavailable proposal remains retained');
    }
  });
}

test('mutated nested attempt identity cannot authorize a successor', (t) => {
  const fixed = setup(t);
  fixed.running.record.metadata.owner = 'changed-by-consumer';
  assert.throws(() => finish(fixed), {code: TRANSITION.RECORD_UNAVAILABLE});
  assert.equal(fixed.current().metadata.owner, 'first');
  assert.equal(fixed.current().state, STATE.RUNNING);
});

for (const mutation of ['predecessor', 'sha', 'identity', 'identity-presence',
  'unknown-field', 'illegal-phase', 'malformed']) {
  test(`canonical reader refuses ${mutation} corruption without older-state substitution`, (t) => {
    const fixed = setup(t);
    const terminal = finish(fixed);
    // Derive hostile evidence from the actual owner-produced envelope. This
    // fixture does not implement an alternate valid-envelope builder.
    const envelope = JSON.parse(fs.readFileSync(terminal.destination, 'utf8'));
    if (mutation === 'predecessor') envelope.predecessor = '0'.repeat(64);
    if (mutation === 'sha') envelope.record.sha = 'b'.repeat(40);
    if (mutation === 'identity') envelope.record.startedAt = 99;
    if (mutation === 'identity-presence') delete envelope.record.log;
    if (mutation === 'unknown-field') envelope.record.anotherAttempt = true;
    if (mutation === 'illegal-phase') envelope.record.state = STATE.STARTING;
    const bytes = mutation === 'malformed' ? '{broken' : JSON.stringify(envelope);
    fs.writeFileSync(terminal.destination, bytes);
    assert.throws(fixed.current, {code: TRANSITION.RECORD_UNAVAILABLE});
    assert.equal(fs.readFileSync(terminal.destination, 'utf8'), bytes);
  });
}

test('orphan recognized edges refuse admission; private partial staging stays inert', (t) => {
  const fixed = setup(t);
  const terminal = finish(fixed);
  const orphan = path.join(fixed.directory,
    path.basename(terminal.destination).replace(HEAD, 'b'.repeat(40)));
  fs.copyFileSync(terminal.destination, orphan);
  assert.throws(() => readLocalCorpusRecords(fixed.directory),
    {code: TRANSITION.RECORD_UNAVAILABLE});
  assert.throws(() => createLocalCorpusState(fixed.directory,
    {sha: 'b'.repeat(40), state: STATE.STARTING, pid: null}),
  {code: TRANSITION.RECORD_UNAVAILABLE});
  assert.ok(fs.existsSync(orphan), 'orphan evidence is retained');
  // Separate directory: unrelated partial private staging cannot acquire an
  // authority slot or block a legal transition.
  const healthy = setup(t);
  const stage = fs.mkdtempSync(path.join(healthy.directory, '.corpus-transition-'));
  fs.writeFileSync(path.join(stage, 'record.json'), '{partial');
  const lines = [];
  const current = readLocalCorpusRecords(healthy.directory, {write: (line) => lines.push(line)});
  assert.equal(current[0].state, STATE.RUNNING);
  assert.ok(lines.some((line) => line.includes(stage) &&
    line.includes('partial or unavailable proposal')));
  assert.equal(finish(healthy).outcome, TRANSITION.APPLIED);
  assert.equal(fs.readFileSync(path.join(stage, 'record.json'), 'utf8'), '{partial');
});

test('a terminal cannot be extended by another well-formed retained envelope', (t) => {
  const fixed = setup(t);
  const terminal = finish(fixed);
  // Ask the owner for the next slot through a captured terminal snapshot;
  // its refusal must happen before any filesystem publication.
  let links = 0;
  const nativeLink = fs.linkSync;
  const mock = t.mock.method(fs, 'linkSync', (...args) => { links += 1; return nativeLink(...args); });
  try {
    assert.throws(() => transitionLocalCorpusState(fixed.directory, terminal.record,
      {...terminal.record, state: STATE.LOST}), {code: TRANSITION.RECORD_UNAVAILABLE});
  } finally { mock.mock.restore(); }
  assert.equal(links, 0);
  assert.deepEqual(fixed.current(), terminal.record);
});

test('a newly linked terminal during a read is consumed without false orphan corruption', (t) => {
  const fixed = setup(t);
  const nativeRead = fs.readFileSync;
  let published;
  let engaged = 0;
  const mock = t.mock.method(fs, 'readFileSync', (file, ...args) => {
    try { return nativeRead(file, ...args); }
    catch (error) {
      if (error.code !== 'ENOENT' || engaged || !String(file).includes('.from-')) throw error;
      engaged += 1;
      published = finish(fixed);
      // Preserve the already observed missing-edge read. The caller may
      // return that valid prefix; its following stale write must lose.
      throw error;
    }
  });
  let observed;
  try { observed = fixed.current(); } finally { mock.mock.restore(); }
  assert.equal(engaged, 1);
  assert.ok([STATE.RUNNING, STATE.RED].includes(observed.state));
  assert.deepEqual(fixed.current(), published.record);
  assert.equal(finish(fixed, {status: 42}).outcome, TRANSITION.CURRENT_CHANGED);
});

for (const target of ['base', 'terminal']) {
  test(`invalid UTF-8 in ${target} is refused without replacement decoding`, (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'corpus-utf8-'));
    t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
    const initial = createLocalCorpusState(directory, {sha: HEAD, state: STATE.STARTING,
      pid: null, startedAt: 1, metadata: {owner: 'first'}});
    let file = initial.destination;
    if (target === 'terminal') {
      const running = transitionLocalCorpusState(directory, initial.record,
        {...initial.record, state: STATE.RUNNING, pid: process.pid});
      file = transitionLocalCorpusState(directory, running.record,
        {...running.record, state: STATE.RED, status: 23, reason: 'first'}).destination;
    }
    const bytes = fs.readFileSync(file);
    const position = bytes.lastIndexOf(Buffer.from('first'));
    assert.ok(position >= 0);
    const corrupt = Buffer.from(bytes);
    corrupt[position] = 0xff;
    fs.writeFileSync(file, corrupt);
    assert.throws(() => readLocalCorpusRecords(directory), {code: TRANSITION.RECORD_UNAVAILABLE});
    assert.deepEqual(fs.readFileSync(file), corrupt);
  });
}

test('a persisted third edge after terminal refuses the complete chain', (t) => {
  const fixed = setup(t);
  const terminal = finish(fixed);
  const terminalBytes = fs.readFileSync(terminal.destination);
  const predecessor = createHash('sha256').update(terminalBytes).digest('hex');
  const envelope = JSON.parse(terminalBytes);
  envelope.predecessor = predecessor;
  envelope.record.state = STATE.LOST;
  const extra = path.join(fixed.directory, `${HEAD}.from-${predecessor}.json`);
  const bytes = JSON.stringify(envelope);
  fs.writeFileSync(extra, bytes, {flag: 'wx'});
  assert.throws(fixed.current, {code: TRANSITION.RECORD_UNAVAILABLE});
  assert.deepEqual(fs.readFileSync(terminal.destination), terminalBytes);
  assert.equal(fs.readFileSync(extra, 'utf8'), bytes);
});
