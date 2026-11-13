// Every exact checkout the push-gate materializer proves a command in is
// brought to the generated state a CI or lab-placed proof checkout has before
// the command starts (clean-worktree-generated-import-graph). The post-merge
// corpus for b3b366573 ran push-gate-change-proof.test.js in a materialized
// checkout that never generated the sealed import graph, and it was red there
// only. Proved against a disposable repository whose producer is a stand-in
// at the real producer's path, through the real materializer.
import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {pathToFileURL} from 'node:url';

import {execGit} from '../../scripts/checks/git-invocation.js';
import {gitProcessEnvironment} from '../../scripts/checks/git-process-environment.js';
import {IMPORT_GRAPH_PATH, IMPORT_GRAPH_SEAL_PATH}
  from '../../scripts/checks/impact-proof-cone-constants.js';
import {PROOF_CHECKOUT_GENERATORS} from '../../scripts/checks/proof-checkout-preparation.js';
import {managedSleep, managedTimeout} from '../../src/test-helpers/managed-timers.js';

const MATERIALIZER = path.resolve('scripts/checks/push-gate-corpus-worktree.js');
const PRODUCER = 'scripts/generate-global-owner-debt-inventory.js';
const SEAL_COMMITTED = '{"sealed": "committed"}\n';

function git(cwd, ...args) {
  return execGit(args, {cwd, encoding: 'utf8', env: gitProcessEnvironment()}).trim();
}

// A repository whose producer writes the graph, and - when asked to - also
// rewrites the tracked seal or fails.
function fixture(t, producerBody) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'proof-checkout-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const write = (relative, text) => {
    fs.mkdirSync(path.dirname(path.join(root, relative)), {recursive: true});
    fs.writeFileSync(path.join(root, relative), text);
  };
  write('.gitignore', 'test-output\n');
  write(IMPORT_GRAPH_SEAL_PATH, SEAL_COMMITTED);
  if (producerBody !== null) write(PRODUCER, producerBody);
  git(root, 'init', '--quiet');
  git(root, 'config', 'user.name', 'Preparation Fixture');
  git(root, 'config', 'user.email', 'preparation@example.invalid');
  git(root, 'add', '.');
  git(root, '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'fixture');
  return root;
}

const WRITES_GRAPH =
  'import fs from \'node:fs\';\n' +
  `if (!process.argv.includes(${JSON.stringify(PROOF_CHECKOUT_GENERATORS[0].args[0])})) ` +
  'process.exit(9);\n' +
  `fs.mkdirSync(${JSON.stringify(path.dirname(IMPORT_GRAPH_PATH))}, {recursive: true});\n` +
  `fs.writeFileSync(${JSON.stringify(IMPORT_GRAPH_PATH)}, '{"graph": true}\\n');\n`;

// The command the gate proves: it records what it found before it started.
function gate(root, sha = 'HEAD') {
  const seen = path.join(root, '..', `${path.basename(root)}-seen.json`);
  const probe = 'const fs = require("node:fs");' +
    `fs.writeFileSync(${JSON.stringify(seen)}, JSON.stringify({` +
    `graph: fs.existsSync(${JSON.stringify(IMPORT_GRAPH_PATH)}),` +
    `seal: fs.readFileSync(${JSON.stringify(IMPORT_GRAPH_SEAL_PATH)}, "utf8")}));`;
  const env = gitProcessEnvironment();
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath,
    [MATERIALIZER, '--gate', sha, '--run', process.execPath, '-e', probe],
    {cwd: root, encoding: 'utf8', env});
  const saw = fs.existsSync(seen) ? JSON.parse(fs.readFileSync(seen, 'utf8')) : null;
  fs.rmSync(seen, {force: true});
  return {status: result.status, output: `${result.stdout}${result.stderr}`, saw};
}

test('the gated command starts in a checkout that already has the import graph', (t) => {
  const root = fixture(t, WRITES_GRAPH);
  const {status, output, saw} = gate(root);
  assert.equal(status, 0, output);
  assert.deepEqual(saw, {graph: true, seal: SEAL_COMMITTED},
    'generated for this commit before the command, its tracked bytes untouched');
  assert.match(output, /prepared import-graph/u);
});

test('a producer that fails refuses the gate before the command runs', (t) => {
  const root = fixture(t, 'process.exit(4);\n');
  const {status, output, saw} = gate(root);
  assert.notEqual(status, 0);
  assert.equal(saw, null, 'the command never ran without its generated material');
  assert.match(output, /import-graph could not be generated/u);
});

test('a producer that rewrites tracked metadata refuses the gate before the command runs',
  (t) => {
    const root = fixture(t, WRITES_GRAPH +
      `fs.writeFileSync(${JSON.stringify(IMPORT_GRAPH_SEAL_PATH)}, '{"sealed": "rewritten"}\\n');\n`);
    const {status, output, saw} = gate(root);
    assert.notEqual(status, 0, 'a commit whose generated metadata is stale is refused');
    assert.equal(saw, null, 'the command never ran on bytes that are not the commit\'s');
    assert.match(output, new RegExp('import-graph: the commit\'s generated metadata is stale; ' +
      `regenerate and commit ${IMPORT_GRAPH_SEAL_PATH}`, 'u'));
  });

test('a producer killed by a signal is named as killed', (t) => {
  const root = fixture(t, 'process.kill(process.pid, \'SIGTERM\');\n');
  const {status, output, saw} = gate(root);
  assert.notEqual(status, 0);
  assert.equal(saw, null);
  assert.match(output, /import-graph could not be generated: killed by SIGTERM/u);
});

test('a commit without the required producer refuses before admitting the gate', (t) => {
  const root = fixture(t, null);
  const {status, output, saw} = gate(root);
  assert.notEqual(status, 0, 'a declared producer is required for exact-checkout preparation');
  assert.equal(saw, null, 'the command never ran without the required producer');
  assert.match(output, new RegExp(`import-graph required producer unavailable: ${PRODUCER}`, 'u'));
});

for (const signalled of [false, true]) {
  test(`the real corpus command boundary retains signalled=${signalled} execution`, (t) => {
    const root = fixture(t, null);
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
      scripts: {'test:duplication': 'node -e "process.exit(0)"'},
    }));
    fs.mkdirSync(path.join(root, 'scripts'), {recursive: true});
    fs.writeFileSync(path.join(root, 'scripts', 'check-file-size-thresholds.js'),
      'process.stdout.write("finite corpus command started\\n");\n' +
      (signalled ? 'process.kill(process.pid, "SIGTERM");\n' : 'process.exit(0);\n'));
    const env = gitProcessEnvironment();
    delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, [MATERIALIZER, '--in-place'],
      {cwd: root, encoding: 'utf8', env});
    const output = result.stdout + result.stderr;
    assert.equal(result.status, signalled ? 1 : 0, output);
    assert.match(output, /finite corpus command started/u,
      'the real child ran before the materializer normalized its terminal status');
    if (signalled) {
      assert.doesNotMatch(output, /corpus gates passed/u);
      assert.match(output, /stopped by SIGTERM/u, 'the original signal remains explicit');
    } else {
      assert.match(output, /corpus gates passed/u);
    }
  });
}

test('a materialized gate keeps its original failure and checkout when retention fails', (t) => {
  const root = fixture(t, WRITES_GRAPH);
  const report = JSON.stringify({commands: [{status: 'FAIL',
    artifactIdentity: {path: 'test-output/acceptance/missing.json'}}]});
  const command = [
    'const fs = require("node:fs");',
    'fs.mkdirSync("test-output/acceptance", {recursive: true});',
    `fs.writeFileSync("test-output/acceptance/gate.report.json", ${JSON.stringify(report)});`,
    'fs.writeFileSync("test-output/acceptance/original.txt", "first failure transcript\\n");',
    'process.exit(42);',
  ].join('\n');
  const env = gitProcessEnvironment();
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath,
    [MATERIALIZER, '--gate', 'HEAD', '--run', process.execPath, '-e', command],
    {cwd: root, encoding: 'utf8', env});
  assert.equal(result.status, 42, 'the gate exit remains primary over the later copy failure');
  assert.match(result.stderr, /diagnostic retention unavailable; original checkout kept at/u);
  assert.doesNotMatch(result.stderr, /gate diagnostics retained in/u);
  const parent = path.join(root, 'test-output', 'push-gate-worktrees');
  const entries = fs.readdirSync(parent);
  assert.equal(entries.length, 1, 'the failed exact checkout remains available');
  const checkout = path.join(parent, entries[0], 'tree');
  assert.equal(fs.readFileSync(path.join(checkout, 'test-output/acceptance/gate.report.json'),
    'utf8'), report);
  assert.equal(fs.readFileSync(path.join(checkout, 'test-output/acceptance/original.txt'), 'utf8'),
    'first failure transcript\n');
  assert.ok(git(root, 'worktree', 'list', '--porcelain')
    .includes(`worktree ${fs.realpathSync(checkout)}\n`),
  'the retained original remains registered as a worktree');
});

// The real materializer and real finite children, with only the measured
// command/producer substituted. Unlike the preserved scheduling observation,
// these controls never release a signalled child: cancellation must reach it.
const CANCELLATION_WAIT_MS = 16000;
const CANCELLATION_POLL_MS = 20;
const ORIGINAL_CHILD_CEILING_MS = 1400;
const FORCED_CHILD_CEILING_MS = 9000;
const DESCENDANT_CEILING_MS = 12000;
const CANCELLATION_SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'];
const CANCELLATION_DIAGNOSTIC = 'first finite gate diagnostic\n';
const CANCELLATION_ARTIFACT = 'test-output/acceptance/original.txt';
const CANCELLATION_REPORT = 'test-output/acceptance/gate.report.json';

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
    return false;
  }
}

function killOwnedPid(pid) {
  if (!Number.isInteger(pid) || pid === 0) return;
  try {
    process.kill(pid, 'SIGKILL');
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}

async function boundedClose(run) {
  const expired = Symbol('materializer did not close');
  let timer;
  const deadline = new Promise((resolve) => {
    timer = managedTimeout(run.timers, () => resolve(expired), CANCELLATION_WAIT_MS);
  });
  try {
    const outcome = await Promise.race([run.closed, deadline]);
    assert.notEqual(outcome, expired, `finite materializer did not close: ${run.stderr}`);
    return outcome;
  } finally {
    clearTimeout(timer);
  }
}

function finiteCommand(run, {interrupt, ignoreSignal = false, descendant = false,
  childExit = 0, missingArtifact = false, preparation = false} = {}) {
  const artifact = missingArtifact ? 'test-output/acceptance/missing.txt' :
    CANCELLATION_ARTIFACT;
  run.report = JSON.stringify({commands: [{status: 'FAIL', artifactIdentity: {path: artifact}}]});
  const signalHandlers = CANCELLATION_SIGNALS.map((signal) =>
    `process.on(${JSON.stringify(signal)}, () => {` +
    `fs.writeFileSync(${JSON.stringify(run.ack)}, ${JSON.stringify(signal)});` +
    `${ignoreSignal ? '' : 'process.exit(0);'}});`);
  const nested = [
    'const fs = require("node:fs");',
    'process.on("SIGTERM", () => ' +
      `fs.writeFileSync(${JSON.stringify(run.descendantAck)}, "SIGTERM"));`,
    'process.send("ready");',
    `setTimeout(() => {fs.writeFileSync(${JSON.stringify(run.descendantNormal)}, ` +
      `"ordinary descendant completion"); process.exit(0);}, ${DESCENDANT_CEILING_MS});`,
  ].join('\n');
  const ready = [
    `fs.writeFileSync(${JSON.stringify(run.marker + '.tmp')}, JSON.stringify({`,
    'pid: process.pid, parent: process.ppid, checkout: process.cwd(), descendant: nestedPid}));',
    `fs.renameSync(${JSON.stringify(run.marker + '.tmp')}, ${JSON.stringify(run.marker)});`,
    interrupt ? '' : `process.exit(${childExit});`,
  ].join('\n');
  const acquired = 'fs.writeFileSync(' + JSON.stringify(run.acquired + '.tmp') +
    ', JSON.stringify({pid: process.pid, parent: process.ppid, descendant: nestedPid}));' +
    `fs.renameSync(${JSON.stringify(run.acquired + '.tmp')}, ${JSON.stringify(run.acquired)});`;
  return [
    'const fs = require("node:fs");',
    ...(preparation ? [
      `if (!process.argv.includes(${JSON.stringify(PROOF_CHECKOUT_GENERATORS[0].args[0])})) ` +
        'process.exit(9);',
      `fs.mkdirSync(${JSON.stringify(path.dirname(IMPORT_GRAPH_PATH))}, {recursive: true});`,
      `fs.writeFileSync(${JSON.stringify(IMPORT_GRAPH_PATH)}, '{"graph": true}\\n');`,
    ] : []),
    'fs.mkdirSync("test-output/acceptance", {recursive: true});',
    `fs.writeFileSync(${JSON.stringify(CANCELLATION_REPORT)}, ${JSON.stringify(run.report)});`,
    `fs.writeFileSync(${JSON.stringify(CANCELLATION_ARTIFACT)}, ` +
      `${JSON.stringify(CANCELLATION_DIAGNOSTIC)});`,
    ...signalHandlers,
    'let nestedPid = null;',
    `const acquired = () => {${acquired}};`,
    'acquired();',
    `setTimeout(() => {fs.writeFileSync(${JSON.stringify(run.normal)}, ` +
      `"ordinary completion"); process.exit(${childExit});}, ` +
      `${ignoreSignal ? FORCED_CHILD_CEILING_MS : ORIGINAL_CHILD_CEILING_MS});`,
    `const ready = () => {${ready}};`,
    descendant ? [
      'const {spawn} = require("node:child_process");',
      `const nested = spawn(process.execPath, ["-e", ${JSON.stringify(nested)}], ` +
        '{stdio: ["ignore", "ignore", "ignore", "ipc"]});',
      'nestedPid = nested.pid; acquired();',
      'nested.once("message", () => ready());',
    ].join('\n') : 'ready();',
  ].join('\n');
}

async function cleanupFiniteGate(run) {
  const errors = [];
  const attempt = async (close) => {
    try {
      await close();
    } catch (error) {
      errors.push(error);
    }
  };
  if (!run.owned && run.acquired && fs.existsSync(run.acquired)) {
    await attempt(() => {
      const owned = JSON.parse(fs.readFileSync(run.acquired, 'utf8'));
      assert.equal(owned.parent, run.child?.pid, 'cleanup addresses this materializer child');
      run.owned = owned;
    });
  }
  await attempt(() => killOwnedPid(run.child?.pid ? -run.child.pid : null));
  for (const pid of [run.owned?.pid, run.owned?.descendant]) {
    await attempt(() => killOwnedPid(pid));
  }
  if (run.closed) await attempt(() => boundedClose(run));
  for (const close of [...run.timerCleanups, ...run.fileCleanups]) await attempt(close);
  if (errors.length > 0) throw new AggregateError(errors, 'finite gate cleanup unavailable');
}

function startFiniteGate(t, options = {}) {
  const run = {child: null, closed: null, terminal: null, owned: null,
    stdout: '', stderr: '', timerCleanups: [], fileCleanups: []};
  run.timers = {teardown: (close) => run.timerCleanups.push(close)};
  t.after(() => cleanupFiniteGate(run));
  run.root = fixture({after: (close) => run.fileCleanups.push(close)}, WRITES_GRAPH);
  const control = path.join(run.root, 'test-output', 'cancellation-control');
  fs.mkdirSync(control, {recursive: true});
  for (const name of ['marker', 'acquired', 'ack', 'descendantAck', 'descendantNormal',
    'normal', 'admitted']) {
    run[name] = path.join(control, name);
  }
  let command = finiteCommand(run, options);
  if (options.preparation) {
    fs.mkdirSync(path.join(run.root, 'scripts'), {recursive: true});
    fs.writeFileSync(path.join(run.root, PRODUCER), command);
    git(run.root, 'add', PRODUCER);
    git(run.root, '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'finite producer');
    command = 'require("node:fs").writeFileSync(' +
      `${JSON.stringify(run.admitted)}, "gate admitted");`;
  }
  const env = gitProcessEnvironment();
  delete env.NODE_TEST_CONTEXT;
  run.child = spawn(process.execPath,
    [MATERIALIZER, '--gate', 'HEAD', '--run', process.execPath, '-e', command],
    {cwd: run.root, env, detached: true, stdio: ['ignore', 'pipe', 'pipe']});
  let error = null;
  run.closed = new Promise((resolve) => {
    run.child.once('error', (cause) => {
      error = cause;
    });
    run.child.once('close', (code, signal) => {
      run.terminal = {code, signal, error};
      resolve(run.terminal);
    });
  });
  run.child.stdout.on('data', (chunk) => {
    run.stdout += chunk.toString();
  });
  run.child.stderr.on('data', (chunk) => {
    run.stderr += chunk.toString();
  });
  return run;
}

async function acquireFiniteChild(run, {live = true} = {}) {
  const deadline = Date.now() + CANCELLATION_WAIT_MS;
  while (!fs.existsSync(run.marker) && !run.terminal && Date.now() < deadline) {
    await managedSleep(run.timers, CANCELLATION_POLL_MS);
  }
  assert.ok(fs.existsSync(run.marker), `the finite child reached its real entry: ${run.stderr}`);
  run.owned = JSON.parse(fs.readFileSync(run.marker, 'utf8'));
  assert.ok(Number.isInteger(run.owned.pid) && run.owned.pid > 0,
    'the acquired child has an actual process identity');
  assert.equal(run.owned.parent, run.child.pid, 'the measured child belongs to the materializer');
  if (live) {
    assert.equal(run.terminal, null, 'the materializer is still awaiting its acquired child');
    assert.ok(processAlive(run.owned.pid), 'cancellation engages a live child');
  }
}

function retainedDiagnostic(run) {
  const archive = path.join(run.root, 'test-output', 'push-gate');
  const entries = fs.existsSync(archive) ? fs.readdirSync(archive) : [];
  return entries.filter((entry) => {
    const file = path.join(archive, entry, path.basename(CANCELLATION_ARTIFACT));
    return fs.existsSync(file) && fs.readFileSync(file, 'utf8') === CANCELLATION_DIAGNOSTIC;
  });
}

async function interruptFiniteGate(run, signal = 'SIGTERM') {
  await acquireFiniteChild(run);
  assert.equal(run.child.kill(signal), true, 'the signal was sent to the live materializer');
  const outcome = await boundedClose(run);
  assert.equal(outcome.error, null, 'the actual materializer started and closed');
  assert.equal(outcome.signal, null, 'the owner settles through its finalizer');
  assert.equal(outcome.code, 128 + os.constants.signals[signal],
    'interruption remains primary when the finite child would otherwise exit zero');
  assert.ok(fs.existsSync(run.ack), 'the acquired child acknowledged forwarded cancellation');
  assert.equal(fs.readFileSync(run.ack, 'utf8'), signal);
  assert.equal(fs.existsSync(run.normal), false,
    'the child did not reach its ordinary completion deadline');
  assert.equal(processAlive(run.owned.pid), false, 'the child closed before finalization completed');
}

for (const childExit of [0, 42]) {
  test(`the exact materializer preserves ordinary child exit ${childExit}`, async (t) => {
    const run = startFiniteGate(t, {childExit});
    await acquireFiniteChild(run, {live: false});
    const outcome = await boundedClose(run);
    assert.deepEqual(outcome, {code: childExit, signal: null, error: null});
    assert.equal(processAlive(run.owned.pid), false);
    assert.equal(retainedDiagnostic(run).length, childExit === 0 ? 0 : 1);
    assert.equal(fs.existsSync(run.owned.checkout), false);
  });
}

for (const signal of CANCELLATION_SIGNALS) {
  test(`the exact materializer owns live gate cancellation by ${signal}`, async (t) => {
    const run = startFiniteGate(t, {interrupt: true});
    await interruptFiniteGate(run, signal);
    assert.equal(retainedDiagnostic(run).length, 1, 'the first diagnostic was retained');
    assert.equal(fs.existsSync(run.owned.checkout), false,
      'a closed child and retained evidence permit checkout removal');
  });
}

test('materializer cancellation during preparation never admits the later gate', async (t) => {
  const run = startFiniteGate(t, {interrupt: true, preparation: true});
  await interruptFiniteGate(run);
  assert.equal(fs.existsSync(run.admitted), false, 'the cancelled preparation cannot admit a gate');
  assert.equal(retainedDiagnostic(run).length, 1);
});

test('the materializer bounds a child scope that acknowledges but ignores SIGTERM', async (t) => {
  const run = startFiniteGate(t, {interrupt: true, ignoreSignal: true, descendant: true});
  await interruptFiniteGate(run);
  assert.ok(fs.existsSync(run.descendantAck), 'cancellation reached the acquired descendant');
  assert.equal(fs.readFileSync(run.descendantAck, 'utf8'), 'SIGTERM',
    'cancellation reached the descendant in the acquired scope');
  assert.equal(processAlive(run.owned.descendant), false,
    'forced stop closed the descendant before materializer finalization completed');
  assert.equal(fs.existsSync(run.descendantNormal), false,
    'the descendant did not reach its ordinary completion deadline');
  assert.equal(retainedDiagnostic(run).length, 1);
});

test('interrupted materializer retention failure keeps the original checkout', async (t) => {
  const run = startFiniteGate(t, {interrupt: true, missingArtifact: true});
  await interruptFiniteGate(run);
  assert.match(run.stderr, /diagnostic retention unavailable; original checkout kept at/u);
  assert.doesNotMatch(run.stderr, /gate diagnostics retained in/u);
  assert.equal(fs.readFileSync(path.join(run.owned.checkout, CANCELLATION_REPORT), 'utf8'),
    run.report);
  assert.equal(fs.readFileSync(path.join(run.owned.checkout, CANCELLATION_ARTIFACT), 'utf8'),
    CANCELLATION_DIAGNOSTIC);
  assert.ok(git(run.root, 'worktree', 'list', '--porcelain')
    .includes(`worktree ${fs.realpathSync(run.owned.checkout)}\n`),
  'the uncertain original remains registered');
});

for (const childExit of [0, 42]) {
  test(`a locked gate checkout preserves child exit ${childExit} and cleanup uncertainty`, (t) => {
    const root = fixture(t, WRITES_GRAPH);
    const seen = path.join(root, 'test-output', 'locked-checkout');
    const gitOwner = pathToFileURL(path.resolve('scripts/checks/git-invocation.js')).href;
    const command = [
      'import fs from "node:fs";',
      `import {execGit} from ${JSON.stringify(gitOwner)};`,
      'execGit(["worktree", "lock", "--reason", "finite cleanup refusal", process.cwd()], ' +
        '{cwd: process.cwd()});',
      'fs.mkdirSync("test-output/acceptance", {recursive: true});',
      `fs.writeFileSync(${JSON.stringify(CANCELLATION_ARTIFACT)}, ` +
        `${JSON.stringify(CANCELLATION_DIAGNOSTIC)});`,
      `fs.mkdirSync(${JSON.stringify(path.dirname(seen))}, {recursive: true});`,
      `fs.writeFileSync(${JSON.stringify(seen)}, process.cwd());`,
      `process.exit(${childExit});`,
    ].join('\n');
    const env = gitProcessEnvironment();
    delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, [MATERIALIZER, '--gate', 'HEAD', '--run',
      process.execPath, '--input-type=module', '-e', command], {cwd: root, encoding: 'utf8', env});
    assert.equal(result.status, childExit === 0 ? 1 : childExit,
      'cleanup refusal cannot be green or replace an earlier gate failure');
    assert.ok(fs.existsSync(seen), 'the actual command locked its exact checkout before exit');
    const checkout = fs.readFileSync(seen, 'utf8');
    assert.ok(fs.existsSync(checkout), 'failed Git removal must preserve the original checkout');
    assert.equal(fs.readFileSync(path.join(checkout, CANCELLATION_ARTIFACT), 'utf8'),
      CANCELLATION_DIAGNOSTIC);
    const registered = git(root, 'worktree', 'list', '--porcelain');
    assert.ok(registered.includes(`worktree ${fs.realpathSync(checkout)}\n`));
    assert.match(registered, /locked finite cleanup refusal/u);
    assert.match(result.stderr, /checkout cleanup unavailable/u);
  });
}

for (const supplied of [false, true]) {
  test(`the exact gate provides complete synchronous stdin with supplied=${supplied}`, (t) => {
    const root = fixture(t, WRITES_GRAPH);
    const control = path.join(root, 'test-output', 'ref-input');
    fs.mkdirSync(control, {recursive: true});
    const input = path.join(control, 'refs');
    const seen = path.join(control, 'seen');
    const refs = supplied ? `refs/heads/review ${'a'.repeat(40)} refs/heads/main ${'b'.repeat(40)}\n` :
      '';
    if (supplied) fs.writeFileSync(input, refs);
    const command = 'const fs = require("node:fs");' +
      `fs.writeFileSync(${JSON.stringify(seen)}, fs.readFileSync(0, "utf8"));`;
    const env = gitProcessEnvironment();
    delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, [MATERIALIZER, '--gate', 'HEAD',
      ...(supplied ? ['--ref-lines', input] : []), '--run', process.execPath, '-e', command],
    {cwd: root, encoding: 'utf8', env});
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(fs.readFileSync(seen, 'utf8'), refs,
      'a synchronous fd0 reader received the complete declared input and EOF');
    assert.deepEqual(fs.readdirSync(path.join(root, 'test-output', 'push-gate-worktrees')), [],
      'the completed gate left no owned input or checkout behind');
  });
}
