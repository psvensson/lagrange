// The whole corpus is proved on local machines, never on a GitHub-hosted
// runner while a local alternative exists, releases included (owner rule,
// 2026-09-18). After a publish whose gate proved a cone, the publisher proves
// exactly the rest of the corpus for that commit, detached, and records the
// whole-corpus receipt when it is green. Every source keeps its first attempt
// and its obligation; a later publish reports earlier red or lost evidence.

import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {parse} from 'yaml';
import {flushCoverageBeforeKill} from '../../scripts/checks/census-pre-kill-flush.js';

import {
  LOCAL_CORPUS_OWED, localCorpusPlan, publishExactHead, reconcileLocalCorpus,
  reportLocalCorpus, runLocalCorpus, startLocalCorpus,
} from '../../scripts/publish-head.js';
import {runDecision} from '../../scripts/checks/push-gate-change-proof.js';
import {wholeCorpusFiles} from '../../scripts/plan-test-lane.js';
import {PROOF_MODE} from '../../scripts/checks/change-selection-constants.js';
import {planTestPaths, writeProofScope} from '../../scripts/select-change-tests.js';
import {gitProcessEnvironment} from '../../scripts/checks/git-process-environment.js';
import {spawnGit} from '../../scripts/checks/git-invocation.js';
import {
  SECTION_KIND, appendExecutionSection, executionReportProblems, fileResultRecord,
} from '../../scripts/test-execution-report.js';
import {validExecutionReport} from './execution-report-fixture.js';

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
    if (child.exitCode === null && child.signalCode === null) {
      flushCoverageBeforeKill(child.pid, 'SIGKILL');
    }
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      // already gone
    }
  });
  return {child};
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
    reportRoot: dir,
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

  // Admission is retained before a detached child can begin executing.
  const stateDir = path.join(dir, 'state');
  const spawned = [];
  const pid = startLocalCorpus({root: '/main', stateDir, head: HEAD, files,
    now: 1234, env: {PATH: '/bin'},
    spawnProcess: (command, args, options) => {
      assert.deepEqual({state: stateOf(stateDir, HEAD).state, pid: stateOf(stateDir, HEAD).pid},
        {state: 'starting', pid: null}, 'the first obligation exists before the child starts');
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
  assert.deepEqual(options.env, {PATH: '/bin'}, 'the publisher introduces no retry policy');
  assert.equal(fs.readFileSync(path.join(stateDir, `${HEAD}.files`), 'utf8'),
    `${files.join('\n')}\n`);
  assert.deepEqual(stateOf(stateDir, HEAD), {sha: HEAD, state: 'starting', pid: null,
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

test('same-head admission is retained before a reentrant start can replace its evidence', (t) => {
  const dir = scratch(t, 'local-corpus-acquire-');
  const stateDir = path.join(dir, 'state');
  const coneReport = path.join(dir, 'cone.json');
  fs.writeFileSync(coneReport, JSON.stringify(validExecutionReport({sha: HEAD,
    tree: 'b'.repeat(40)})));
  let starts = 0;
  let logDescriptor;
  const pid = startLocalCorpus({root: dir, stateDir, head: HEAD,
    files: ['original.test.js'], coneReport, now: 1, env: {},
    spawnProcess: (_command, _args, options) => {
      starts += 1;
      logDescriptor = options.stdio[1];
      fs.writeSync(logDescriptor, 'first attempt transcript\n');
      const names = fs.readdirSync(stateDir).sort();
      const before = names.map((name) => fs.readFileSync(path.join(stateDir, name), 'utf8'));
      assert.equal(stateOf(stateDir, HEAD).state, 'starting');
      assert.throws(() => startLocalCorpus({root: dir, stateDir, head: HEAD,
        files: ['replacement.test.js'], now: 2, env: {},
        spawnProcess: () => {
          starts += 1;
          return {pid: 4343, unref: () => {}};
        }}), /already recorded/u, 'a second caller cannot enter the first obligation');
      assert.deepEqual(fs.readdirSync(stateDir).sort(), names);
      assert.deepEqual(names.map((name) => fs.readFileSync(path.join(stateDir, name), 'utf8')),
        before, 'refusal leaves the first state, file list, cone report and log byte-for-byte');
      return {pid: 4242, unref: () => {}};
    }});
  assert.equal(pid, 4242);
  assert.equal(starts, 1, 'only the first caller reaches the spawn boundary');
  assert.throws(() => fs.fstatSync(logDescriptor), {code: 'EBADF'},
    'the parent closes its log descriptor after passing it to the child');
});

test('partial same-head acquisition stays recorded and cannot be started again', (t) => {
  const dir = scratch(t, 'local-corpus-partial-');
  const stateDir = path.join(dir, 'state');
  const coneReport = path.join(dir, 'cone-is-a-directory');
  fs.mkdirSync(coneReport);
  let starts = 0;
  const start = () => startLocalCorpus({root: dir, stateDir, head: HEAD,
    files: ['original.test.js'], coneReport, env: {},
    spawnProcess: () => {
      starts += 1;
      return {pid: 4242, unref: () => {}};
    }});
  assert.throws(start, 'copying a directory as the required cone report really fails');
  const record = stateOf(stateDir, HEAD);
  assert.equal(record.state, 'lost', 'acquisition failure is retained as unavailable evidence');
  assert.equal(record.pid, null);
  assert.ok(record.reason.includes(coneReport), 'the original copy error is retained');
  const before = fs.readFileSync(path.join(stateDir, `${HEAD}.json`), 'utf8');
  assert.throws(start, /already recorded/u);
  assert.equal(fs.readFileSync(path.join(stateDir, `${HEAD}.json`), 'utf8'), before,
    'the second caller cannot replace the first acquisition failure');
  assert.equal(fs.readFileSync(path.join(stateDir, `${HEAD}.files`), 'utf8'),
    'original.test.js\n');
  assert.equal(starts, 0, 'neither the failed acquisition nor its replay starts a child');
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

test('reconciliation preserves live obligations and names only missing processes lost', (t) => {
  const stateDir = path.join(scratch(t, 'local-corpus-reconcile-'), 'state');
  const running = fakeRunning(t);
  writeState(stateDir, {sha: '1'.repeat(40), state: 'running', pid: running.child.pid,
    startedAt: 3});
  const firstRecord = fs.readFileSync(path.join(stateDir, `${'1'.repeat(40)}.json`), 'utf8');
  // One whose process is gone, and one whose pid now belongs to a process that
  // is not a local corpus: neither is signalled, both are lost.
  writeState(stateDir, {sha: '2'.repeat(40), state: 'running', pid: deadPid(), startedAt: 2});
  writeState(stateDir, {sha: '3'.repeat(40), state: 'running', pid: process.pid, startedAt: 1});
  writeState(stateDir, {sha: '4'.repeat(40), state: 'green', pid: 1, startedAt: 0,
    receipt: 'corpus-full-v1'});

  reconcileLocalCorpus(stateDir);
  assert.equal(stateOf(stateDir, '1'.repeat(40)).state, 'running');
  assert.doesNotThrow(() => process.kill(running.child.pid, 0), 'and nothing is stopped');
  assert.equal(fs.readFileSync(path.join(stateDir, `${'1'.repeat(40)}.json`), 'utf8'),
    firstRecord, 'a live obligation remains byte-for-byte');
  assert.equal(stateOf(stateDir, '2'.repeat(40)).state, 'lost');
  assert.equal(stateOf(stateDir, '3'.repeat(40)).state, 'lost',
    'a pid reused by another process is never signalled');

  assert.equal(stateOf(stateDir, '4'.repeat(40)).state, 'green', 'a verdict stays');
});

test('reporting retains every earlier red or lost result after a later green', (t) => {
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
    files: 9, log: '/l/6.log', startedAt: 5});
  assert.deepEqual(say(), [
    `publish: !!! the local corpus was LOST for ${'5'.repeat(40)}: the machine stayed too ` +
      'hot to start it',
    `publish: !!! the local corpus was LOST for ${'3'.repeat(40)}: its process ended ` +
      'without a verdict',
    `publish: !!! the local corpus was RED for ${'2'.repeat(40)}: /l/2.log`,
    `publish: local corpus ${'6'.repeat(40)}: superseded (9 file(s), log /l/6.log)`,
  ], 'all red or lost runs are said first, including before a historical superseded record');
  writeState(stateDir, {sha: '7'.repeat(40), state: 'red', files: 1, startedAt: 7,
    log: 'x', reason: 'proof-receipt-not-recorded', receipt: 'push refused'});
  assert.deepEqual(say(), [
    `publish: !!! the local corpus was RED for ${'7'.repeat(40)}: receipt not recorded: push refused`,
    `publish: !!! the local corpus was LOST for ${'5'.repeat(40)}: the machine stayed too ` +
      'hot to start it',
    `publish: !!! the local corpus was LOST for ${'3'.repeat(40)}: its process ended ` +
      'without a verdict',
    `publish: !!! the local corpus was RED for ${'2'.repeat(40)}: /l/2.log`,
    `publish: local corpus ${'7'.repeat(40)}: red (receipt not recorded: push refused)`,
  ], 'an unrecorded receipt is red, names why, and never silences prior red or lost runs');
  writeState(stateDir, {sha: '8'.repeat(40), state: 'green', files: 1, startedAt: 8,
    log: 'x', receipt: 'corpus-full-v1'});
  assert.deepEqual(say(), [
    `publish: !!! the local corpus was RED for ${'7'.repeat(40)}: receipt not recorded: push refused`,
    `publish: !!! the local corpus was LOST for ${'5'.repeat(40)}: the machine stayed too ` +
      'hot to start it',
    `publish: !!! the local corpus was LOST for ${'3'.repeat(40)}: its process ended ` +
      'without a verdict',
    `publish: !!! the local corpus was RED for ${'2'.repeat(40)}: /l/2.log`,
    `publish: local corpus ${'8'.repeat(40)}: green (1 file(s), log x)`,
  ], 'a newer source receipt does not answer or hide earlier failures');

  // Reporting beyond the former retention bound cannot delete any evidence.
  for (let index = 0; index < 25; index += 1) {
    const sha = String(index).padStart(40, 'f');
    writeState(stateDir, {sha, state: 'green', files: 1, startedAt: 100 + index, log: 'x',
      receipt: 'corpus-full-v1'});
    fs.writeFileSync(path.join(stateDir, `${sha}.log`), 'x');
  }
  const names = fs.readdirSync(stateDir).sort();
  const before = names.map((name) => fs.readFileSync(path.join(stateDir, name), 'utf8'));
  assert.equal(names.filter((name) => name.endsWith('.json')).length, 32);
  const reported = say();
  assert.ok(reported.includes(`publish: !!! the local corpus was RED for ${'2'.repeat(40)}: /l/2.log`));
  assert.deepEqual(fs.readdirSync(stateDir).sort(), names, 'every record and log remains');
  assert.deepEqual(names.map((name) => fs.readFileSync(path.join(stateDir, name), 'utf8')),
    before, 'reporting changes no retained bytes');
});

test('native report companions coexist with the exact same-head state record', (t) => {
  const stateDir = path.join(scratch(t, 'local-corpus-companions-'), 'state');
  writeState(stateDir, {sha: HEAD, state: 'red', files: 2, startedAt: 1, log: '/first.log'});
  const report = JSON.stringify(validExecutionReport({sha: HEAD, tree: 'b'.repeat(40)}));
  for (const suffix of ['.report.json', '.cone-report.json']) {
    fs.writeFileSync(path.join(stateDir, HEAD + suffix), report);
  }
  fs.writeFileSync(path.join(stateDir, 'unrelated.json'), '{not a state record');
  const names = fs.readdirSync(stateDir).sort();
  const before = names.map((name) => fs.readFileSync(path.join(stateDir, name), 'utf8'));
  const lines = [];
  reconcileLocalCorpus(stateDir);
  reportLocalCorpus(stateDir, (line) => lines.push(line));
  assert.deepEqual(lines, [
    `publish: !!! the local corpus was RED for ${HEAD}: /first.log`,
    `publish: local corpus ${HEAD}: red (2 file(s), log /first.log)`,
  ], 'native report JSON is not misread as a second state or discarded as malformed state');
  assert.deepEqual(fs.readdirSync(stateDir).sort(), names);
  assert.deepEqual(names.map((name) => fs.readFileSync(path.join(stateDir, name), 'utf8')),
    before, 'state and native reports all remain intact');
});

test('malformed actual state refuses before reporting or replacing evidence', (t) => {
  const stateDir = path.join(scratch(t, 'local-corpus-malformed-'), 'state');
  fs.mkdirSync(stateDir);
  const file = path.join(stateDir, `${HEAD}.json`);
  for (const bytes of ['{invalid', 'null', '[]', JSON.stringify({sha: 'b'.repeat(40), state: 'red'})]) {
    fs.writeFileSync(file, bytes);
    const lines = [];
    assert.throws(() => reconcileLocalCorpus(stateDir), 'reconciliation refuses malformed state');
    assert.throws(() => reportLocalCorpus(stateDir, (line) => lines.push(line)),
      'reporting refuses malformed state');
    assert.deepEqual(lines, [], 'no result is fabricated for unreadable state');
    assert.equal(fs.readFileSync(file, 'utf8'), bytes, 'the failed read cannot erase its input');
  }
});

// The runner is the one thermal owner of a runner run (process change
// 2026-09-23): the local corpus spawns no thermal gate of its own, and a
// machine that stays too hot is the runner's typed refusal, recorded lost.
const THERMAL_SCRIPT = 'scripts/checks/wait-for-thermal-headroom.js';
const CORPUS_GATE = 'scripts/checks/push-gate-corpus-worktree.js';
// The runner's exit for its thermal-headroom-exhausted refusal.
const THERMAL_REFUSAL_STATUS = 75;

test('the local corpus records the whole-corpus receipt only when green', (t) => {
  const dir = scratch(t, 'local-corpus-run-');
  const run = ({gate = {status: 0}, record = 0} = {}) => {
    const stateDir = fs.mkdtempSync(path.join(dir, 'state-'));
    writeState(stateDir, {sha: HEAD, state: 'starting', pid: null, files: 5, startedAt: 1});
    const calls = [];
    const status = runLocalCorpus('/main', HEAD, {stateDir, now: () => 99,
      run: (command, args, options) => {
        calls.push({command, args, options});
        if (args[0] === THERMAL_SCRIPT) return {status: 0};
        if (args[0] === CORPUS_GATE) {
          const running = stateOf(stateDir, HEAD);
          assert.deepEqual({state: running.state, pid: running.pid},
            {state: 'running', pid: process.pid},
            'the child owns the running record before execution');
          return gate;
        }
        return {status: record, stderr: 'refused\n'};
      }});
    return {status, calls, state: stateOf(stateDir, HEAD), stateDir};
  };
  const green = run();
  assert.equal(green.status, 0);
  assert.deepEqual(green.calls.filter((call) => call.args[0] === THERMAL_SCRIPT), [],
    'no thermal spawn of its own: its runner gates every batch');
  const [gate, record] = green.calls;
  assert.deepEqual(gate.args.slice(0, 6),
    [CORPUS_GATE, '--gate', HEAD, '--run', 'sh', '-c']);
  const corpusScript = '"$2" scripts/run-classified-test-files.js --stdin < "$1"; ' +
    'status=$?; LAGRANGE_EXECUTION_REPORT= npm run -s test:convergence-probes || ' +
    'echo "local corpus: convergence probes red (observed, never the verdict)"; ' +
    'exit "$status"';
  assert.equal(gate.args[6], corpusScript, 'the rest of the corpus, in a fresh exact ' +
    'checkout, with this very node; the convergence probes observed after, never the verdict');
  assert.deepEqual(gate.args.slice(-2),
    [path.join(green.stateDir, `${HEAD}.files`), process.execPath]);
  assert.equal(gate.options.cwd, '/main');
  assert.deepEqual(record.args, ['scripts/proof-authority.js', 'record', 'corpus-full-v1', HEAD,
    '--report', path.join(green.stateDir, `${HEAD}.report.json`)],
  'recorded only from the execution report this run wrote');
  assert.equal(gate.options.env.LAGRANGE_EXECUTION_REPORT,
    path.join(green.stateDir, `${HEAD}.sections.ndjson`), 'the runner writes its sections');
  assert.deepEqual({state: green.state.state, receipt: green.state.receipt},
    {state: 'green', receipt: 'corpus-full-v1'});

  const red = run({gate: {status: 1}});
  assert.equal(red.status, 1);
  assert.equal(red.calls.length, 1, 'a red run records nothing');
  assert.equal(red.state.state, 'red');

  const hot = run({gate: {status: THERMAL_REFUSAL_STATUS}});
  assert.equal(hot.calls.length, 1, 'a machine that stays hot records nothing');
  assert.deepEqual({state: hot.state.state, reason: hot.state.reason},
    {state: 'lost', reason: 'the machine stayed too hot to run it (thermal-headroom-exhausted)'},
    'the runner\'s refusal is lost, never red: no verdict was reached');

  const unrecorded = run({record: 1});
  assert.equal(unrecorded.status, 1, 'a refused proof receipt returns non-zero');
  assert.deepEqual({
    state: unrecorded.state.state,
    reason: unrecorded.state.reason,
    receipt: unrecorded.state.receipt,
  }, {
    state: 'red',
    reason: 'proof-receipt-not-recorded',
    receipt: 'refused',
  }, 'a refused receipt is red, never green, and names the failed recording');
});

test('execution without a gate verdict is lost and cannot record a proof receipt', (t) => {
  const dir = scratch(t, 'local-corpus-unavailable-');
  const thrown = new Error('executor disappeared before returning a verdict');
  for (const [gate, detail] of [
    [{status: null, signal: 'SIGTERM'}, 'SIGTERM'],
    [{status: null, error: new Error('spawn EAGAIN')}, 'spawn EAGAIN'],
    [{status: null}, 'its process ended without a verdict'],
    [thrown, thrown.message],
  ]) {
    const stateDir = fs.mkdtempSync(path.join(dir, 'state-'));
    writeState(stateDir, {sha: HEAD, state: 'starting', pid: null, files: 1, startedAt: 1});
    const calls = [];
    const execute = () => runLocalCorpus(dir, HEAD, {stateDir, now: () => 99,
      run: (_command, args) => {
        calls.push(args[0]);
        if (gate instanceof Error) throw gate;
        return gate;
      }});
    if (gate instanceof Error) {
      assert.throws(execute, (error) => error === thrown,
        'the original execution exception remains primary');
    } else {
      assert.equal(execute(), 1, 'unavailable execution returns nonzero');
    }
    const state = stateOf(stateDir, HEAD);
    assert.deepEqual({state: state.state, reason: state.reason, finishedAt: state.finishedAt},
      {state: 'lost', reason: `gate execution unavailable: ${detail}`, finishedAt: 99});
    assert.deepEqual(calls, [CORPUS_GATE], 'no receipt command follows an unavailable gate');
    assert.equal(state.receipt, undefined, 'unavailability creates no recorded proof');
    assert.equal(fs.existsSync(path.join(stateDir, `${HEAD}.report.json`)), false,
      'a missing verdict is not replaced by a synthetic execution report');
  }
});

test('a detached corpus consumes only its starting obligation and refuses changed state', (t) => {
  const dir = scratch(t, 'local-corpus-obligation-');
  for (const state of ['running', 'red', 'lost', 'green', 'superseded']) {
    const stateDir = path.join(dir, state);
    writeState(stateDir, {sha: HEAD, state, pid: process.pid, files: 1, startedAt: 1});
    const file = path.join(stateDir, `${HEAD}.json`);
    const before = fs.readFileSync(file, 'utf8');
    let calls = 0;
    assert.throws(() => runLocalCorpus(dir, HEAD, {stateDir,
      run: () => {
        calls += 1;
        return {status: 0};
      }}), /no starting obligation/u, `${state} cannot be reopened by the detached entrypoint`);
    assert.equal(calls, 0, 'refusal starts neither a gate nor a receipt command');
    assert.equal(fs.readFileSync(file, 'utf8'), before);
  }
  for (const changed of [
    {sha: HEAD, state: 'red', reason: 'another writer retained a failure'},
    {sha: HEAD, state: 'running', pid: process.pid + 1, reason: 'another execution owner'},
  ]) {
    const stateDir = path.join(dir, `changed-${changed.state}`);
    writeState(stateDir, {sha: HEAD, state: 'starting', pid: null, files: 1, startedAt: 1});
    let calls = 0;
    assert.throws(() => runLocalCorpus(dir, HEAD, {stateDir,
      run: () => {
        calls += 1;
        writeState(stateDir, changed);
        return {status: 0};
      }}), /state changed during execution/u);
    assert.equal(calls, 1, 'a changed record cannot authorize receipt recording');
    assert.deepEqual(stateOf(stateDir, HEAD), changed,
      'neither an earlier failure nor another running owner is turned green');
  }
});

// The rest of a cone is only half the corpus: its report is whole only with
// the gate's cone report beside it. A rest run whose cone report is missing
// writes a report without a candidate, which the authority refuses as
// partial; it never stands in for the whole corpus
// (proof-receipt-bound-to-validated-execution).
test('a rest run without the gate\'s cone report is no whole-corpus evidence', (t) => {
  const dir = scratch(t, 'local-corpus-cone-');
  const repo = path.join(dir, 'repo');
  fs.mkdirSync(repo);
  const git = (...args) => String(spawnGit(args, {cwd: repo, encoding: 'utf8',
    env: gitProcessEnvironment()}).stdout).trim();
  git('init', '--quiet');
  git('config', 'user.name', 'Cone Fixture');
  git('config', 'user.email', 'cone@example.invalid');
  fs.writeFileSync(path.join(repo, 'subject.txt'), 'subject\n');
  git('add', 'subject.txt');
  git('commit', '--quiet', '-m', 'subject');
  const head = git('rev-parse', 'HEAD');
  const tree = git('rev-parse', `${head}^{tree}`);
  const checkout = {head, tree, clean: true};
  const cone = ['test/cone.test.js'];
  const rest = ['test/rest-a.test.js', 'test/rest-b.test.js'];
  const green = (files) => files.map((file) => fileResultRecord({file, ok: true, assertions: 2}));
  const coneReportFile = path.join(dir, 'gate', 'execution-report.json');
  const runRest = (stateDir) => {
    startLocalCorpus({root: repo, stateDir, head, files: rest, env: {},
      coneReport: coneReportFile,
      spawnProcess: () => ({pid: 4242, unref: () => {}})});
    runLocalCorpus(repo, head, {stateDir, now: () => 99,
      run: (command, args, options) => {
        if (args[0] !== CORPUS_GATE) return {status: 0};
        const sections = options.env.LAGRANGE_EXECUTION_REPORT;
        appendExecutionSection(sections, {kind: SECTION_KIND.START, runId: 'rest',
          argv: rest, planned: rest, checkout});
        appendExecutionSection(sections, {kind: SECTION_KIND.END, runId: 'rest',
          exitStatus: 0, results: green(rest)});
        return {status: 0};
      }});
    const report = JSON.parse(fs.readFileSync(path.join(stateDir, `${head}.report.json`),
      'utf8'));
    return executionReportProblems(report, {sha: head, tree}).problems.map((entry) =>
      entry.code);
  };

  assert.deepEqual(runRest(path.join(dir, 'missing')), ['execution-report-partial'],
    'the rest alone, its cone report missing, is a partial report');

  fs.mkdirSync(path.dirname(coneReportFile), {recursive: true});
  fs.writeFileSync(coneReportFile, JSON.stringify({schema: 'lagrange-test-execution-report/v1',
    candidate: {sha: head, tree, clean: true, identity: null},
    producer: {kind: 'push-gate', id: 'pid-1'},
    commands: [{label: 'cone', argv: [], exitStatus: 0}], planned: cone, reusedProofs: [],
    runs: [{runId: 'cone', complete: true, checkout, argv: cone, planned: cone,
      results: green(cone), exitStatus: 0}]}));
  assert.deepEqual(runRest(path.join(dir, 'whole')), [],
    'the cone report and the rest together are the whole corpus');
});

// A fake run of the exact corpus script - a one-file list, this node, and an
// npm that only stands in for the convergence probes - shows the runner's own
// thermal gate line before its batch: the corpus is covered with no spawn of
// its own.
test('the local corpus script is gated by its runner', (t) => {
  const stateDir = path.join(scratch(t, 'local-corpus-gated-'), 'state');
  writeState(stateDir, {sha: HEAD, state: 'starting', pid: null, files: 1, startedAt: 1});
  const calls = [];
  runLocalCorpus('/main', HEAD, {stateDir, now: () => 99,
    run: (command, args) => {
      calls.push(args);
      return {status: 0};
    }});
  assert.equal(calls[0][0], CORPUS_GATE, 'the corpus gate is the first thing it starts');
  const dir = scratch(t, 'local-corpus-gated-bin-');
  fs.writeFileSync(path.join(dir, 'npm'), '#!/bin/sh\nexit 0\n', {mode: 0o755});
  const list = path.join(dir, 'files');
  fs.writeFileSync(list, 'test/query/budget-limit-error.test.js\n');
  const env = {...process.env, PATH: `${dir}${path.delimiter}${process.env.PATH}`,
    LAGRANGE_PLACEMENT: 'local'};
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync('sh', ['-c', calls[0][6], 'sh', list, process.execPath],
    {cwd: process.cwd(), env, encoding: 'utf8', timeout: 5 * 60000});
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const lines = result.stdout.split('\n');
  const gateAt = lines.findIndex((line) => /^thermal: (ok|hold|unmeasurable|skipped)\b/u.test(line));
  assert.ok(gateAt >= 0, `the runner's gate line is in the run: ${result.stdout}`);
  assert.ok(gateAt < lines.findIndex((line) => line.startsWith('ok test/query/')),
    'before the batch it gates');
});

test('the hosted canary runs only when dispatched by hand', () => {
  const workflow = parse(fs.readFileSync('.github/workflows/full-corpus-canary.yml', 'utf8'));
  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch'],
    'no automatic trigger: the corpus is proved locally');
});

// The publisher's own fixture: a gate that proves a cone of one file, or fails.
function publishFixture(t, {gateFails = false, startChild = null} = {}) {
  const parent = scratch(t, 'local-corpus-publish-');
  const git = (cwd, args) => spawnGit(args, {cwd, encoding: 'utf8',
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
  spawnGit(['push', '-q', '-u', 'origin', 'main'], {cwd: root,
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

test('a publish reports earlier failures and leaves other source obligations running', (t) => {
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

  // A verified newer publish leaves the old obligation alive and starts its own rest.
  const passing = publishFixture(t);
  const earlier = fakeRunning(t);
  writeState(passing.stateDir, {sha: 'd'.repeat(40), state: 'running', pid: earlier.child.pid,
    files: 9, startedAt: 2, log: '/l'});
  writeState(passing.stateDir, {sha: 'e'.repeat(40), state: 'red', files: 3, startedAt: 1,
    log: '/l/e.log'});
  const firstRecord = fs.readFileSync(path.join(passing.stateDir, `${'d'.repeat(40)}.json`), 'utf8');
  passing.publish();
  assert.match(passing.lines[0], /^publish: !!! the local corpus was RED for e{40}/u,
    'a red local corpus is the first thing a publish says');
  assert.equal(fs.readFileSync(path.join(passing.stateDir, `${'d'.repeat(40)}.json`), 'utf8'),
    firstRecord, 'the earlier source record remains byte-for-byte');
  assert.doesNotThrow(() => process.kill(earlier.child.pid, 0),
    'a newer source never cancels an earlier source obligation');
  assert.deepEqual(passing.spawned.map((args) => args.slice(1)),
    [['--local-corpus', passing.head]], 'the rest of the corpus starts for the pushed commit');
  assert.equal(fs.readFileSync(path.join(passing.stateDir, `${passing.head}.files`), 'utf8'),
    'b.test.js\n', 'without the file the cone proved');
});

test('publishing the same head again preserves every first-attempt state without relaunch', (t) => {
  // A publish that died after its push, run once more: the head is already on
  // main, the push does nothing, and the run the first publish started goes on.
  const again = publishFixture(t, {startChild: () => fakeRunning(t).child});
  again.publish();
  assert.equal(again.spawned.length, 1);
  again.publish();
  assert.equal(again.spawned.length, 1, 'one run for one commit');
  assert.ok(again.lines.includes(
    'publish: local corpus not started: already starting for this commit'), again.lines.join('\n'));
  assert.equal(stateOf(again.stateDir, again.head).state, 'starting');

  for (const state of ['green', 'red', 'lost', 'superseded']) {
    writeState(again.stateDir, {sha: again.head, state, startedAt: 1, files: 1,
      log: path.join(again.stateDir, `${again.head}.log`),
      ...(state === 'green' ? {receipt: 'corpus-full-v1'} : {reason: 'first-attempt evidence'})});
    fs.writeFileSync(path.join(again.stateDir, `${again.head}.log`), `${state}: first attempt\n`);
    const names = fs.readdirSync(again.stateDir).sort();
    const before = names.map((name) => fs.readFileSync(path.join(again.stateDir, name), 'utf8'));
    again.publish();
    assert.equal(again.spawned.length, 1, `${state} does not authorize a second attempt`);
    assert.deepEqual(fs.readdirSync(again.stateDir).sort(), names);
    assert.deepEqual(names.map((name) => fs.readFileSync(path.join(again.stateDir, name), 'utf8')),
      before, `${state} evidence remains byte-for-byte`);
  }
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
// Original-compatible falsifier: a stale RUNNING read must not erase the real
// writer's later terminal RED. This proves state custody, not full-corpus work.
const fixture = fileURLToPath(new URL('./local-corpus-terminal-custody-child.js', import.meta.url));
const head = 'a'.repeat(40);
const observationBoundMs = 15000;
const closeBoundMs = 5000;
const pollMs = 10;

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
    const running = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
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
    const terminalBytes = fs.readFileSync(stateFile, 'utf8');
    const terminal = JSON.parse(terminalBytes);
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
    const afterBytes = fs.readFileSync(stateFile, 'utf8');
    t.diagnostic(JSON.stringify({snapshot: running, terminal, after: JSON.parse(afterBytes),
      observations, producerClose: producer.result, reconcilerClose: reconciler.result}));
    assert.equal(afterBytes, terminalBytes,
      'stale RUNNING reconciliation must preserve the production terminal record byte-for-byte');
  });
