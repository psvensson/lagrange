// The whole corpus is proved on local machines, never on a GitHub-hosted
// runner while a local alternative exists, releases included (owner rule,
// 2026-09-18). After a publish whose gate proved a cone, the publisher proves
// exactly the rest of the corpus for that commit, detached, and records the
// whole-corpus receipt when it is green; the next publish reports a red or
// lost one first, and only a newer head on main supersedes a running one.

import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {parse} from 'yaml';

import {
  LOCAL_CORPUS_OWED, localCorpusPlan, publishExactHead, reconcileLocalCorpus,
  reportLocalCorpus, runLocalCorpus, startLocalCorpus, supersedeLocalCorpus, wholeCorpusFiles,
} from '../../scripts/publish-head.js';
import {runDecision} from '../../scripts/checks/push-gate-change-proof.js';
import {PROOF_MODE} from '../../scripts/checks/change-selection-constants.js';
import {planTestPaths, writeProofScope} from '../../scripts/select-change-tests.js';
import {gitProcessEnvironment} from '../../scripts/checks/git-process-environment.js';

const HEAD = 'a'.repeat(40);

function scratch(t, prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  return dir;
}

function stateOf(stateDir, sha) {
  return JSON.parse(fs.readFileSync(path.join(stateDir, `${sha}.json`), 'utf8'));
}

function writeState(stateDir, state) {
  fs.mkdirSync(stateDir, {recursive: true});
  fs.writeFileSync(path.join(stateDir, `${state.sha}.json`), JSON.stringify(state));
}

// A process that looks like a running local corpus: its own group, named as
// one in its command line.
function fakeRunning(t) {
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)', '--',
    '--local-corpus'], {detached: true, stdio: 'ignore'});
  t.after(() => {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      // already gone
    }
  });
  return {child, exited: new Promise((resolve) => child.once('exit', resolve))};
}

function deadPid() {
  return Number(spawnSync(process.execPath, ['-e', 'console.log(process.pid)'],
    {encoding: 'utf8'}).stdout.trim());
}

test('a cone publish starts exactly the rest of the corpus for the pushed commit', (t) => {
  // What test:all runs, read from package.json.
  const corpus = wholeCorpusFiles(process.cwd());
  assert.ok(corpus.length > 1000 && corpus.every((file) => file.endsWith('.test.js')));

  // The scope the real gate writes, from a real decision over a real plan:
  // what the cone proved is not run again, and together they are the corpus.
  const dir = scratch(t, 'local-corpus-plan-');
  const plan = {kind: 'SELECTED', tests: corpus.slice(0, 3).map((file) => ({path: file}))};
  let ranCone = null;
  const status = runDecision(plan, {mode: PROOF_MODE.CHANGE_PROOF, reasons: []}, {
    head: () => HEAD,
    runCone: (tests) => {
      ranCone = tests;
      return 0;
    },
    writeScope: (scope) => writeProofScope({...scope, scopeRoot: dir}),
  });
  assert.equal(status, 0);
  const scopeFile = path.join(dir, 'test-output', 'proof-scope.json');
  const written = JSON.parse(fs.readFileSync(scopeFile, 'utf8'));
  assert.deepEqual(written.testPaths, planTestPaths(plan), 'the gate names the files it proved');
  assert.deepEqual(written.testPaths, ranCone, 'which are the files it ran');
  const {owed, files} = localCorpusPlan(process.cwd(), HEAD, {scopeFile});
  assert.equal(owed, LOCAL_CORPUS_OWED.REST);
  assert.equal(files.length, corpus.length - 3);
  assert.ok(ranCone.every((file) => !files.includes(file)), 'the cone is not run twice');

  // Started detached, in a group of its own, under the gate's retry policy.
  const stateDir = path.join(dir, 'state');
  const spawned = [];
  const pid = startLocalCorpus({root: '/main', stateDir, head: HEAD, files,
    now: 1234, env: {PATH: '/bin'},
    spawnProcess: (command, args, options) => {
      spawned.push({command, args, options});
      return {pid: 4242, unref: () => {}};
    }});
  assert.equal(pid, 4242);
  const [{command, args, options}] = spawned;
  assert.equal(command, process.execPath);
  assert.match(args[0], /scripts\/publish-head\.js$/u);
  assert.deepEqual(args.slice(1), ['--local-corpus', HEAD]);
  assert.equal(options.cwd, '/main');
  assert.equal(options.detached, true);
  assert.equal(options.env.LAGRANGE_RETRY_FAILED_ONCE, '1');
  assert.equal(fs.readFileSync(path.join(stateDir, `${HEAD}.files`), 'utf8'),
    `${files.join('\n')}\n`);
  assert.deepEqual(stateOf(stateDir, HEAD), {sha: HEAD, state: 'running', pid: 4242,
    files: files.length, startedAt: 1234, log: path.join(stateDir, `${HEAD}.log`)});

  // A child that cannot start is recorded lost, never thrown after a publish.
  let onError = null;
  startLocalCorpus({root: '/main', stateDir, head: 'c'.repeat(40), files, env: {},
    spawnProcess: () => ({pid: undefined, unref: () => {}, on: (event, handler) => {
      if (event === 'error') onError = handler;
    }})});
  onError(new Error('spawn EAGAIN'));
  assert.deepEqual({state: stateOf(stateDir, 'c'.repeat(40)).state,
    reason: stateOf(stateDir, 'c'.repeat(40)).reason}, {state: 'lost', reason: 'spawn EAGAIN'});
});

test('a publish that proved the whole corpus, or whose scope is unknown, starts nothing', (t) => {
  const dir = scratch(t, 'local-corpus-none-');
  const scopeFile = path.join(dir, 'proof-scope.json');
  const plan = (scope) => {
    if (scope === undefined) fs.rmSync(scopeFile, {force: true});
    else fs.writeFileSync(scopeFile, typeof scope === 'string' ? scope : JSON.stringify(scope));
    return localCorpusPlan(process.cwd(), HEAD, {scopeFile, wholeCorpus: () => ['x']});
  };
  assert.deepEqual(plan({sha: HEAD, fullCorpus: false, testPaths: []}),
    {owed: LOCAL_CORPUS_OWED.REST, files: ['x']});
  assert.deepEqual(plan({sha: HEAD, fullCorpus: true, testPaths: null}),
    {owed: LOCAL_CORPUS_OWED.NOTHING, files: []}, 'the gate proved the whole corpus');
  for (const [scope, reason] of [
    [{sha: 'b'.repeat(40), fullCorpus: false, testPaths: []}, /another commit/u],
    [{sha: HEAD, fullCorpus: false}, /lists no cone/u],
    [{sha: HEAD, fullCorpus: 'false', testPaths: []}, /lists no cone/u],
    ['{not json', /no proof scope/u],
    [undefined, /no proof scope/u],
  ]) {
    const verdict = plan(scope);
    assert.deepEqual(verdict.files, [], String(reason));
    assert.match(verdict.owed, reason, 'and says why');
  }
});

test('a newer publish supersedes a running local corpus', async (t) => {
  const stateDir = path.join(scratch(t, 'local-corpus-supersede-'), 'state');
  const running = fakeRunning(t);
  writeState(stateDir, {sha: '1'.repeat(40), state: 'running', pid: running.child.pid,
    startedAt: 3});
  // One whose process is gone, and one whose pid now belongs to a process that
  // is not a local corpus: neither is signalled, both are lost.
  writeState(stateDir, {sha: '2'.repeat(40), state: 'running', pid: deadPid(), startedAt: 2});
  writeState(stateDir, {sha: '3'.repeat(40), state: 'running', pid: process.pid, startedAt: 1});
  writeState(stateDir, {sha: '4'.repeat(40), state: 'green', pid: 1, startedAt: 0});

  // At the start of a publish nothing is signalled: it may never reach main.
  reconcileLocalCorpus(stateDir);
  assert.equal(stateOf(stateDir, '1'.repeat(40)).state, 'running');
  assert.doesNotThrow(() => process.kill(running.child.pid, 0), 'and nothing is stopped');
  assert.equal(stateOf(stateDir, '2'.repeat(40)).state, 'lost');
  assert.equal(stateOf(stateDir, '3'.repeat(40)).state, 'lost',
    'a pid reused by another process is never signalled');

  // The proof of the very commit being published again is not its own
  // successor: it keeps running.
  const same = fakeRunning(t);
  writeState(stateDir, {sha: HEAD, state: 'running', pid: same.child.pid, startedAt: 4});

  // After the new head's push is verified, the running one is stopped and said.
  const lines = [];
  supersedeLocalCorpus(stateDir, HEAD, (line) => lines.push(line));
  assert.equal(stateOf(stateDir, HEAD).state, 'running');
  assert.doesNotThrow(() => process.kill(same.child.pid, 0));
  await running.exited;
  assert.deepEqual({state: stateOf(stateDir, '1'.repeat(40)).state,
    by: stateOf(stateDir, '1'.repeat(40)).supersededBy}, {state: 'superseded', by: HEAD});
  assert.deepEqual(lines, [`publish: local corpus ${'1'.repeat(40)}: superseded ` +
    `(superseded by ${HEAD}), a newer head on main`]);
  assert.equal(stateOf(stateDir, '4'.repeat(40)).state, 'green', 'a verdict stays');
});

test('the next publish reports the last local corpus result first', (t) => {
  const stateDir = path.join(scratch(t, 'local-corpus-report-'), 'state');
  const say = () => {
    const lines = [];
    reportLocalCorpus(stateDir, (line) => lines.push(line));
    return lines;
  };
  assert.deepEqual(say(), [], 'nothing to say before any local corpus');
  writeState(stateDir, {sha: '1'.repeat(40), state: 'green', files: 900, startedAt: 1,
    log: '/l/1.log', receipt: 'corpus-full-v1'});
  assert.deepEqual(say(), [`publish: local corpus ${'1'.repeat(40)}: green (900 file(s), ` +
    'log /l/1.log)']);
  writeState(stateDir, {sha: '2'.repeat(40), state: 'red', files: 800, startedAt: 2,
    log: '/l/2.log'});
  writeState(stateDir, {sha: '3'.repeat(40), state: 'lost', startedAt: 3});
  writeState(stateDir, {sha: '5'.repeat(40), state: 'lost', reason: 'the machine stayed too ' +
    'hot to start it', startedAt: 4});
  writeState(stateDir, {sha: '6'.repeat(40), state: 'superseded', supersededBy: HEAD,
    startedAt: 5});
  assert.deepEqual(say(), [
    `publish: !!! the local corpus was LOST for ${'5'.repeat(40)}: the machine stayed too ` +
      'hot to start it',
    `publish: !!! the local corpus was LOST for ${'3'.repeat(40)}: its process ended ` +
      'without a verdict',
    `publish: !!! the local corpus was RED for ${'2'.repeat(40)}: /l/2.log`,
    `publish: local corpus ${'6'.repeat(40)}: superseded (superseded by ${HEAD})`,
  ], 'every red or lost run since the last green is said first');
  writeState(stateDir, {sha: '7'.repeat(40), state: 'green', files: 1, startedAt: 7,
    log: 'x', receipt: 'push refused'});
  assert.deepEqual(say(), [`publish: local corpus ${'7'.repeat(40)}: green ` +
    '(receipt not recorded: push refused)'], 'a green answers what came before, and a ' +
    'receipt it could not record is named');

  // Only the newest twenty records are kept.
  for (let index = 0; index < 25; index += 1) {
    const sha = String(index).padStart(40, 'f');
    writeState(stateDir, {sha, state: 'green', files: 1, startedAt: 100 + index, log: 'x'});
    fs.writeFileSync(path.join(stateDir, `${sha}.log`), 'x');
  }
  say();
  assert.equal(fs.readdirSync(stateDir).filter((name) => name.endsWith('.json')).length, 20);
  assert.equal(fs.existsSync(path.join(stateDir, `${String(0).padStart(40, 'f')}.log`)), false);
});

test('the local corpus records the whole-corpus receipt only when green', (t) => {
  const stateDir = path.join(scratch(t, 'local-corpus-run-'), 'state');
  const run = ({thermal = 0, gate = 0, record = 0, change = null} = {}) => {
    writeState(stateDir, {sha: HEAD, state: 'running', pid: 1, files: 5, startedAt: 1});
    const calls = [];
    const status = runLocalCorpus('/main', HEAD, {stateDir, now: () => 99,
      run: (command, args, options) => {
        calls.push({command, args, options});
        if (calls.length === 1) return {status: thermal};
        if (calls.length === 2) {
          if (change) writeState(stateDir, {...stateOf(stateDir, HEAD), ...change});
          return {status: gate};
        }
        return {status: record, stderr: 'refused\n'};
      }});
    return {status, calls, state: stateOf(stateDir, HEAD)};
  };
  const green = run();
  assert.equal(green.status, 0);
  const [cooled, gate, record] = green.calls;
  assert.deepEqual(cooled.args, ['scripts/checks/wait-for-thermal-headroom.js'],
    'it waits for thermal headroom first');
  assert.deepEqual(gate.args.slice(0, 6),
    ['scripts/checks/push-gate-corpus-worktree.js', '--gate', HEAD, '--run', 'sh', '-c']);
  assert.match(gate.args[6],
    /^"\$2" scripts\/run-classified-test-files\.js --keep-going --stdin < "\$1"; status=\$\?;/u,
    'the rest of the corpus, in a fresh exact checkout, with this very node');
  assert.match(gate.args[6], /npm run -s test:convergence-probes \|\|[^;]*; exit "\$status"$/u,
    'the convergence probes are observed after it, never the verdict');
  assert.deepEqual(gate.args.slice(-2),
    [path.join(stateDir, `${HEAD}.files`), process.execPath]);
  assert.equal(gate.options.cwd, '/main');
  assert.deepEqual(record.args, ['scripts/proof-authority.js', 'record', 'corpus-full-v1', HEAD]);
  assert.deepEqual({state: green.state.state, receipt: green.state.receipt},
    {state: 'green', receipt: 'corpus-full-v1'});

  const red = run({gate: 1});
  assert.equal(red.status, 1);
  assert.equal(red.calls.length, 2, 'a red run records nothing');
  assert.equal(red.state.state, 'red');

  const hot = run({thermal: 2});
  assert.equal(hot.calls.length, 1, 'a machine that stays hot runs nothing');
  assert.deepEqual({state: hot.state.state, reason: hot.state.reason},
    {state: 'lost', reason: 'the machine stayed too hot to start it'});

  const unrecorded = run({record: 1});
  assert.deepEqual({state: unrecorded.state.state, receipt: unrecorded.state.receipt},
    {state: 'green', receipt: 'refused'}, 'the tests passed; the failed recording is named');

  const superseded = run({change: {state: 'superseded', supersededBy: 'b'.repeat(40)}});
  assert.equal(superseded.calls.length, 2, 'a superseded run records nothing');
  assert.equal(superseded.state.state, 'superseded', 'and keeps the newer head\'s word');
});

test('the hosted canary runs only when dispatched by hand', () => {
  const workflow = parse(fs.readFileSync('.github/workflows/full-corpus-canary.yml', 'utf8'));
  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch'],
    'no automatic trigger: the corpus is proved locally');
});

// The publisher's own fixture: a gate that proves a cone of one file, or fails.
function publishFixture(t, {gateFails = false, startChild = null} = {}) {
  const parent = scratch(t, 'local-corpus-publish-');
  const git = (cwd, args) => spawnSync('git', args, {cwd, encoding: 'utf8',
    env: gitProcessEnvironment()}).stdout.trim();
  const root = path.join(parent, 'repo');
  const remote = path.join(parent, 'remote.git');
  fs.mkdirSync(root);
  git(parent, ['init', '-q', '--bare', remote]);
  git(root, ['init', '-q', '-b', 'main']);
  for (const [key, value] of [['user.email', 'p@example.com'], ['user.name', 'P'],
    ['commit.gpgsign', 'false'], ['core.hooksPath', '.githooks']]) {
    git(root, ['config', key, value]);
  }
  fs.mkdirSync(path.join(root, '.githooks'));
  fs.writeFileSync(path.join(root, '.githooks', 'pre-push'), '#!/bin/sh\ncat >/dev/null\n' +
    (gateFails ? 'exit 1\n' : '') +
    'if [ -z "${LAGRANGE_PUSH_SKIP_TESTS:-}" ]; then\n  mkdir -p test-output\n' +
    '  printf \'{"sha":"%s","fullCorpus":false,"testPaths":["a.test.js"]}\\n\' ' +
    '"$(git rev-parse HEAD)" > test-output/proof-scope.json\nfi\nexit 0\n', {mode: 0o755});
  fs.writeFileSync(path.join(root, '.gitignore'), 'test-output/\n');
  fs.writeFileSync(path.join(root, 'tracked.txt'), 'one\n');
  git(root, ['add', '.']);
  git(root, ['commit', '-q', '-m', 'initial']);
  git(root, ['remote', 'add', 'origin', remote]);
  // The first push carries the fixture's own gate; it must pass.
  spawnSync('git', ['push', '-q', '-u', 'origin', 'main'], {cwd: root,
    env: {...gitProcessEnvironment(), LAGRANGE_PUSH_SKIP_TESTS: '1'}});
  fs.writeFileSync(path.join(root, 'tracked.txt'), 'two\n');
  git(root, ['commit', '-qam', 'publish exact head']);
  fs.mkdirSync(path.join(root, 'data'));
  const stateDir = path.join(parent, 'state');
  const lines = [];
  const spawned = [];
  const cwds = [];
  const publish = (from = root) => publishExactHead(from, {}, {queryCi: false,
    localCorpusDir: stateDir,
    write: (line) => lines.push(line),
    wholeCorpus: () => ['a.test.js', 'b.test.js'],
    spawnProcess: (command, args, options) => {
      spawned.push(args);
      cwds.push(options.cwd);
      return startChild ? startChild() : {pid: 777, unref: () => {}};
    }});
  return {root, head: git(root, ['rev-parse', 'HEAD']), remote, stateDir, lines, spawned,
    cwds, publish, git};
}

test('a publish says what the local corpus found, and supersedes only once on main', async (t) => {
  // A publish that fails leaves the proof of what is on main running.
  const failing = publishFixture(t, {gateFails: true});
  const onMain = fakeRunning(t);
  writeState(failing.stateDir, {sha: 'd'.repeat(40), state: 'running', pid: onMain.child.pid,
    files: 9, startedAt: 2, log: '/l'});
  writeState(failing.stateDir, {sha: 'e'.repeat(40), state: 'running', pid: deadPid(),
    files: 3, startedAt: 1, log: '/l'});
  assert.throws(() => failing.publish());
  assert.equal(stateOf(failing.stateDir, 'd'.repeat(40)).state, 'running');
  assert.doesNotThrow(() => process.kill(onMain.child.pid, 0),
    'a publish that never reached main stops nothing');
  assert.match(failing.lines[0], /^publish: !!! the local corpus was LOST for e{40}: its process/u,
    'a run whose process is gone is said lost, first, not running');
  assert.deepEqual(failing.spawned, [], 'and nothing new starts');

  // A publish that reaches main supersedes it, says so, and starts the rest.
  const passing = publishFixture(t);
  const replaced = fakeRunning(t);
  writeState(passing.stateDir, {sha: 'd'.repeat(40), state: 'running', pid: replaced.child.pid,
    files: 9, startedAt: 2, log: '/l'});
  writeState(passing.stateDir, {sha: 'e'.repeat(40), state: 'red', files: 3, startedAt: 1,
    log: '/l/e.log'});
  passing.publish();
  await replaced.exited;
  assert.match(passing.lines[0], /^publish: !!! the local corpus was RED for e{40}/u,
    'a red local corpus is the first thing a publish says');
  assert.ok(passing.lines.includes(`publish: local corpus ${'d'.repeat(40)}: superseded ` +
    `(superseded by ${passing.head}), a newer head on main`));
  assert.deepEqual(passing.spawned.map((args) => args.slice(1)),
    [['--local-corpus', passing.head]], 'the rest of the corpus starts for the pushed commit');
  assert.equal(fs.readFileSync(path.join(passing.stateDir, `${passing.head}.files`), 'utf8'),
    'b.test.js\n', 'without the file the cone proved');
});

test('publishing the same head again starts no second run beside the first', (t) => {
  // A publish that died after its push, run once more: the head is already on
  // main, the push does nothing, and the run the first publish started goes on.
  const again = publishFixture(t, {startChild: () => fakeRunning(t).child});
  again.publish();
  assert.equal(again.spawned.length, 1);
  again.publish();
  assert.equal(again.spawned.length, 1, 'one run for one commit');
  assert.ok(again.lines.includes(
    'publish: local corpus not started: already running for this commit'), again.lines.join('\n'));
  assert.equal(stateOf(again.stateDir, again.head).state, 'running');

  // A green one covers it as well; a lost one is owed again.
  writeState(again.stateDir, {...stateOf(again.stateDir, again.head), state: 'green'});
  again.publish();
  assert.equal(again.spawned.length, 1, 'a proved commit is not proved twice');
  writeState(again.stateDir, {...stateOf(again.stateDir, again.head), state: 'lost'});
  again.publish();
  assert.equal(again.spawned.length, 2, 'a lost run is started again');
});

test('the local corpus runs from the main checkout, not the worktree that published', (t) => {
  // Quests publish from linked worktrees that are removed after landing; the
  // detached run must not live in one.
  const fixture = publishFixture(t);
  const quest = path.join(path.dirname(fixture.root), 'quest');
  fixture.git(fixture.root, ['worktree', 'add', '-q', '-b', 'quest', quest, 'HEAD']);
  fs.symlinkSync(path.join(fixture.root, 'data'), path.join(quest, 'data'));
  fixture.publish(quest);
  assert.equal(fixture.spawned.length, 1, fixture.lines.join('\n'));
  assert.equal(fs.realpathSync(fixture.cwds[0]), fs.realpathSync(fixture.root));
});

test('a process whose command line cannot be read is never taken for a local corpus', async (t) => {
  // A zombie answers a signal probe but has no command line left: unknown is
  // not ours, so its record is lost and nothing is signalled.
  if (!fs.existsSync('/proc/self/stat')) return;
  const holder = spawn('sh', ['-c', 'sleep 0 & echo $!; exec sleep 30'],
    {detached: true, stdio: ['ignore', 'pipe', 'ignore']});
  t.after(() => {
    try {
      process.kill(-holder.pid, 'SIGKILL');
    } catch {
      // already gone
    }
  });
  const zombie = Number(await new Promise((resolve) =>
    holder.stdout.once('data', (chunk) => resolve(String(chunk).trim()))));
  const stateOfPid = () => {
    try {
      return fs.readFileSync(`/proc/${zombie}/stat`, 'utf8').split(') ')[1][0];
    } catch {
      return null;
    }
  };
  for (let poll = 0; poll < 100 && stateOfPid() !== 'Z'; poll += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(stateOfPid(), 'Z', 'the probe is a zombie');
  assert.doesNotThrow(() => process.kill(zombie, 0), 'which still answers a signal probe');
  const stateDir = path.join(scratch(t, 'local-corpus-zombie-'), 'state');
  writeState(stateDir, {sha: '5'.repeat(40), state: 'running', pid: zombie, startedAt: 0});
  reconcileLocalCorpus(stateDir);
  assert.equal(stateOf(stateDir, '5'.repeat(40)).state, 'lost');
});
