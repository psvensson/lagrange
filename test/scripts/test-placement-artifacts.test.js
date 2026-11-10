import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {test} from 'node:test';

import {gitProcessEnvironment} from '../../scripts/checks/git-process-environment.js';
import {execGit} from '../../scripts/checks/git-invocation.js';
import {runLabTest, startRemoteShard} from '../../scripts/lab/probe.js';
import {ARTIFACT_FRAME_PREFIX, ARTIFACT_LIMITS, REASON, createPlacementArtifactCustody,
  followPlacementArtifactRelay} from '../../scripts/lab/placement-artifact-custody.js';

const FIXTURE_FILE = 'test/fixture.test.js';
const ARTIFACT_PATH = 'test-output/npm-package-diagnostic/trace.ndjson';
const ARTIFACT_BYTES = Buffer.from('first\nsecond\u0000last\n');
const COLLECTOR_PATH = 'scripts/lab/placement-artifact-custody.js';
const ARTIFACTS = Object.freeze([
  Object.freeze({path: ARTIFACT_PATH, required: true, maxBytes: 256 * 1024}),
]);
const FIXTURE_DEADLINE_MS = 20000;

function git(root, ...args) {
  return execGit(['-c', 'core.hooksPath=/dev/null', ...args], {
    cwd: root, env: gitProcessEnvironment(), encoding: 'utf8', stdio: 'pipe',
  }).trim();
}

// Two tiny repositories exercise the real bundle, lock, worktree and EXIT
// boundary. Only the workload is a stub; no corpus clone or npm execution.
function artifactPlacementFixture(t, {append = ''} = {}) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'placement-artifacts-'));
  const runs = [];
  const cleanups = [];
  t.after(async () => {
    for (const running of runs) running.abort();
    await Promise.all(runs.map((running) => running.done));
    for (const cleanup of cleanups) cleanup();
    fs.rmSync(scratch, {recursive: true, force: true});
  });
  const controller = path.join(scratch, 'controller');
  const node = path.join(scratch, 'node');
  fs.mkdirSync(controller);
  git(controller, 'init', '--quiet');
  git(controller, 'config', 'user.email', 'fixture@example.invalid');
  git(controller, 'config', 'user.name', 'fixture');
  fs.writeFileSync(path.join(controller, 'package.json'), '{"type":"module"}\n');
  fs.writeFileSync(path.join(controller, '.gitignore'), 'test-output/\n');
  git(controller, 'add', '.');
  git(controller, 'commit', '--quiet', '-m', 'fixture base');
  const base = git(controller, 'rev-parse', 'HEAD');
  git(scratch, 'clone', '--quiet', controller, node);
  fs.mkdirSync(path.join(controller, 'scripts', 'lab'), {recursive: true});
  fs.copyFileSync(COLLECTOR_PATH, path.join(controller, COLLECTOR_PATH));
  const source = [
    'import fs from "node:fs";',
    'import path from "node:path";',
    `const artifact = ${JSON.stringify(ARTIFACT_PATH)};`,
    'fs.mkdirSync(path.dirname(artifact), {recursive: true});',
    `fs.writeFileSync(artifact, Buffer.from(${JSON.stringify(ARTIFACT_BYTES.toString('base64'))},` +
      ' "base64"));',
    `console.log("ok ${FIXTURE_FILE} (1 assertions, 1ms)");`,
    typeof append === 'function' ? append({scratch}) : append,
    '',
  ].join('\n');
  fs.writeFileSync(path.join(controller, 'scripts/run-classified-test-files.js'), source);
  git(controller, 'add', '.');
  git(controller, 'commit', '--quiet', '-m', 'fixture workload');
  const sha = git(controller, 'rev-parse', 'HEAD');
  const machine = {name: 'fixture-host', repoPath: node, repoHead: base, factor: 1, speed: 1};
  const env = gitProcessEnvironment();
  delete env.NODE_TEST_CONTEXT;
  env.LAB_LOCK_DIR = path.join(scratch, 'lab-lock');
  env.NVM_DIR = path.join(scratch, 'no-nvm');
  const start = (options = {}) => {
    const running = startRemoteShard({machine, files: [FIXTURE_FILE]}, {
      root: controller, sha, env, deadlineMs: FIXTURE_DEADLINE_MS,
      holder: {purpose: 'placement artifact witness', expectedMs: FIXTURE_DEADLINE_MS},
      runId: 'artifact-witness', forward: {checkBase: base, retry: '0'},
      artifacts: ARTIFACTS, ...options,
    });
    runs.push(running);
    return running;
  };
  return {scratch, controller, node, sha, base, start, env, machine,
    onCleanup: (cleanup) => cleanups.push(cleanup)};
}

// A red lifetime assertion still releases only the fixture's recorded group.
// Check a recorded member's current command and group before signalling it.
function cleanCollectorGroup(recordFile, scratch) {
  if (!fs.existsSync(recordFile)) return;
  const record = JSON.parse(fs.readFileSync(recordFile, 'utf8'));
  for (const pid of [record.process, record.child]) {
    const current = spawnSync('ps', ['-o', 'pgid=,args=', '-p', String(pid)],
      {encoding: 'utf8'}).stdout.trim();
    if (Number(current.split(/\s/u)[0]) === record.group && current.includes(scratch)) {
      try {
        process.kill(-record.group, 'SIGKILL');
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
      for (const member of [record.process, record.child]) {
        const state = spawnSync('ps', ['-o', 'stat=', '-p', String(member)],
          {encoding: 'utf8'}).stdout.trim();
        assert.ok(state === '' || state.startsWith('Z'),
          `fixture cleanup left collector process ${member} live: ${state}`);
      }
      return;
    }
  }
}

test('placement retains exact declared bytes before deleting the runner worktree', async (t) => {
  const fixture = artifactPlacementFixture(t);
  const outcome = await fixture.start().done;
  assert.equal(outcome.status, 0, outcome.log + outcome.errors);
  assert.deepEqual(fs.readdirSync(path.join(fixture.node, 'test-output/placement-worktrees')), []);
  assert.equal(outcome.artifacts?.state, 'complete',
    'the successful runner was deleted without retaining its declared diagnostic bytes');
  assert.deepEqual(fs.readFileSync(path.join(outcome.artifacts.directory, ARTIFACT_PATH)),
    ARTIFACT_BYTES);
  const envelope = JSON.parse(fs.readFileSync(path.join(outcome.artifacts.directory,
    'custody.json'), 'utf8'));
  assert.equal(envelope.binding.candidate, fixture.sha);
  assert.equal(envelope.binding.base, fixture.base);
  assert.equal(envelope.binding.host, 'fixture-host');
  assert.equal(envelope.binding.run, 'artifact-witness');
  assert.equal(envelope.files[0].sha256,
    createHash('sha256').update(ARTIFACT_BYTES).digest('hex'));
});

test('an ordinary shard keeps the original EXIT trap and has no artifact collector', async (t) => {
  const fixture = artifactPlacementFixture(t);
  const running = fixture.start({artifacts: null});
  const script = fs.readFileSync(path.join(fixture.controller,
    'test-output/placement/artifact-witness-fixture-host.sh'), 'utf8');
  const outcome = await running.done;
  assert.equal(outcome.status, 0);
  assert.equal(outcome.artifacts, undefined);
  assert.match(script, /^trap cleanup EXIT$/mu);
  assert.doesNotMatch(script, /artifact_cleanup|placement-artifact-custody|supervise/u);
  assert.doesNotMatch(outcome.log, /placement-artifact=/u);
  assert.equal(fs.existsSync(path.join(fixture.controller, 'test-output/placement-artifacts')),
    false);
});

test('failed and signalled runners retain their original exit and collected bytes', async (t) => {
  for (const [name, append, expected] of [
    ['failed', 'process.exitCode = 7;', 7],
    ['signalled', 'process.kill(process.pid, "SIGTERM");', 143],
  ]) {
    await t.test(name, async (child) => {
      const fixture = artifactPlacementFixture(child, {append});
      const outcome = await fixture.start().done;
      assert.equal(outcome.status, expected, outcome.errors);
      assert.equal(outcome.artifacts.state, 'complete');
      assert.equal(outcome.artifacts.exitStatus, expected);
      assert.deepEqual(fs.readFileSync(path.join(outcome.artifacts.directory, ARTIFACT_PATH)),
        ARTIFACT_BYTES);
      assert.deepEqual(fs.readdirSync(path.join(fixture.node, 'test-output/placement-worktrees')),
        []);
    });
  }
});

test('an interrupted runner settles before custody and worktree removal', async (t) => {
  const fixture = artifactPlacementFixture(t, {append: 'setInterval(() => {}, 1000);'});
  let ready;
  const started = new Promise((resolve) => {
    ready = resolve;
  });
  const running = fixture.start({onLine: (line) => {
    if (line.startsWith(`ok ${FIXTURE_FILE}`)) ready();
  }});
  await Promise.race([started, running.done.then(() => assert.fail('runner ended before ready'))]);
  running.abort();
  const outcome = await running.done;
  assert.equal(outcome.reason, 'interrupted');
  assert.equal(outcome.status, null);
  assert.equal(outcome.artifacts.state, 'complete');
  assert.equal(outcome.artifacts.exitStatus, 143);
  assert.deepEqual(fs.readdirSync(path.join(fixture.node, 'test-output/placement-worktrees')), []);
});

test('four declared files distinguish required absence, optional absence and byte bounds', async (t) => {
  const fixture = artifactPlacementFixture(t);
  const declarations = [
    ...ARTIFACTS,
    {path: 'test-output/required.json', required: true, maxBytes: 1024},
    {path: 'test-output/optional.json', required: false, maxBytes: 1024},
    {path: 'test-output/another.json', required: false, maxBytes: 1024},
  ];
  const outcome = await fixture.start({artifacts: declarations}).done;
  assert.equal(outcome.status, 0);
  assert.equal(outcome.artifacts.state, 'incomplete');
  assert.deepEqual(outcome.artifacts.files.map((file) => file.state),
    ['saved', REASON.MISSING, 'optional-missing', 'optional-missing']);
  assert.ok(!outcome.artifacts.reasons.includes(REASON.TERMINAL),
    'a complete relay of unavailable source is distinct from transport loss');
  const optionalOnly = await fixture.start({runId: 'optional-only', artifacts:
    declarations.filter((entry) => entry.path !== 'test-output/required.json')}).done;
  assert.equal(optionalOnly.artifacts.state, 'complete');
  const oversize = await fixture.start({runId: 'oversize', artifacts:
    [{...ARTIFACTS[0], maxBytes: ARTIFACT_BYTES.length - 1}]}).done;
  assert.equal(oversize.status, 0);
  assert.equal(oversize.artifacts.files[0].state, REASON.OVERSIZE);
  assert.equal(fs.existsSync(path.join(oversize.artifacts.directory, ARTIFACT_PATH)), false);
});

test('collector rejects leaf and intermediate symlinks and FIFOs without opening them', async (t) => {
  const variants = [
    ['leaf', `fs.unlinkSync(artifact); fs.symlinkSync(${JSON.stringify('/etc/hosts')}, artifact);`,
      REASON.SYMLINK],
    ['intermediate', 'fs.renameSync(path.dirname(artifact), "test-output/held"); ' +
      'fs.symlinkSync("held", path.dirname(artifact));', REASON.SYMLINK],
    ['fifo', 'fs.unlinkSync(artifact); ' +
      '(await import("node:child_process")).execFileSync("mkfifo", [artifact]);', REASON.NONFILE],
  ];
  for (const [name, append, expected] of variants) {
    await t.test(name, async (child) => {
      const fixture = artifactPlacementFixture(child, {append});
      const outcome = await fixture.start().done;
      assert.equal(outcome.status, 0, outcome.errors);
      assert.equal(outcome.artifacts.state, 'incomplete');
      assert.equal(outcome.artifacts.files[0].state, expected);
      assert.equal(fs.existsSync(path.join(outcome.artifacts.directory, ARTIFACT_PATH)), false);
    });
  }
});

test('fixed per-file and total bounds retain at most four MiB without truncating bytes', async (t) => {
  const append = 'for (let index = 0; index < 4; index += 1) ' +
    'fs.writeFileSync(`test-output/bound-${index}`, Buffer.alloc(1024 * 1024, index));';
  const fixture = artifactPlacementFixture(t, {append});
  const declarations = Array.from({length: 4}, (_, index) =>
    ({path: `test-output/bound-${index}`, required: true, maxBytes: ARTIFACT_LIMITS.FILE_BYTES}));
  const outcome = await fixture.start({artifacts: declarations}).done;
  assert.equal(outcome.status, 0, outcome.errors);
  assert.equal(outcome.artifacts.state, 'complete', JSON.stringify(outcome.artifacts));
  assert.equal(outcome.artifacts.files.reduce((sum, file) => sum + file.bytes, 0),
    ARTIFACT_LIMITS.TOTAL_BYTES);
  for (const [index, file] of outcome.artifacts.files.entries()) {
    assert.deepEqual(fs.readFileSync(path.join(outcome.artifacts.directory, file.path)),
      Buffer.alloc(ARTIFACT_LIMITS.FILE_BYTES, index));
  }
});

test('invalid declarations and stale destinations cannot overwrite or change runner status', async (t) => {
  const fixture = artifactPlacementFixture(t);
  const first = await fixture.start().done;
  const retained = fs.readFileSync(path.join(first.artifacts.directory, 'custody.json'));
  const again = await fixture.start().done;
  assert.equal(again.status, 0);
  assert.equal(again.artifacts.state, 'incomplete');
  assert.ok(again.artifacts.reasons.includes(REASON.DESTINATION));
  assert.deepEqual(fs.readFileSync(path.join(first.artifacts.directory, 'custody.json')), retained);
  const bad = [
    [{...ARTIFACTS[0], path: '../outside'}],
    [{...ARTIFACTS[0], path: '/absolute'}],
    [...ARTIFACTS, ...ARTIFACTS],
    [{...ARTIFACTS[0], maxBytes: ARTIFACT_LIMITS.FILE_BYTES + 1}],
    Array.from({length: ARTIFACT_LIMITS.FILES + 1}, (_, index) =>
      ({...ARTIFACTS[0], path: `file-${index}`})),
  ];
  for (const [index, artifacts] of bad.entries()) {
    const outcome = await fixture.start({runId: `invalid-${index}`, artifacts}).done;
    assert.equal(outcome.status, 0);
    assert.equal(outcome.artifacts.state, 'incomplete');
    assert.equal(outcome.artifacts.directory, null);
    assert.equal(outcome.artifacts.files.length, 0);
  }
});

test('setup failure and unwritable custody destination report incomplete sideband evidence', async (t) => {
  const fixture = artifactPlacementFixture(t);
  const setup = startRemoteShard({machine: {...fixture.machine, repoHead: '0'.repeat(40)},
    files: [FIXTURE_FILE]}, {sha: fixture.sha, root: fixture.controller,
    runId: 'setup-failed', artifacts: ARTIFACTS, forward: {checkBase: fixture.base},
    holder: {purpose: 'setup fixture', expectedMs: FIXTURE_DEADLINE_MS},
    deadlineMs: FIXTURE_DEADLINE_MS});
  const failed = await setup.done;
  assert.equal(failed.status, 97);
  assert.equal(failed.artifacts.state, 'incomplete');
  assert.ok(failed.artifacts.reasons.includes(REASON.SETUP));
  const destination = path.join(fixture.controller, 'test-output/placement-artifacts');
  fs.renameSync(destination, `${destination}.kept`);
  fs.writeFileSync(destination, 'occupied');
  const outcome = await fixture.start().done;
  assert.equal(outcome.status, 0);
  assert.equal(outcome.artifacts.state, 'incomplete');
  assert.ok(outcome.artifacts.reasons.includes(REASON.DESTINATION));
  assert.equal(fs.readFileSync(destination, 'utf8'), 'occupied');
});

test('collector timeout stays inside abort grace and preserves successful runner exit', async (t) => {
  const fixture = artifactPlacementFixture(t);
  const preload = path.join(fixture.scratch, 'block-collector.mjs');
  fs.writeFileSync(preload, 'if (process.argv[2] === "collect") ' +
    'Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);\n');
  const outcome = await fixture.start({env: {...fixture.env,
    NODE_OPTIONS: `--import=${preload}`}}).done;
  assert.equal(outcome.status, 0, outcome.errors);
  assert.equal(outcome.artifacts.state, 'incomplete');
  assert.ok(outcome.artifacts.reasons.includes(REASON.TIMEOUT));
  assert.ok(ARTIFACT_LIMITS.COLLECTOR_MS < 5000);
  assert.deepEqual(fs.readdirSync(path.join(fixture.node, 'test-output/placement-worktrees')), []);
});

test('partial stdout before a signal cannot swallow a frame or leak its payload to the UI',
  async (t) => {
    const fixture = artifactPlacementFixture(t, {append:
      'process.stdout.write("partial runner output"); process.kill(process.pid, "SIGTERM");'});
    const lines = [];
    const outcome = await fixture.start({onLine: (line) => lines.push(line)}).done;
    assert.equal(outcome.status, 143);
    assert.equal(outcome.artifacts.state, 'complete');
    assert.ok(lines.includes('partial runner output'));
    assert.ok(!lines.some((line) => line.includes(ARTIFACT_FRAME_PREFIX) ||
      line.includes(ARTIFACT_BYTES.toString('base64'))));
    assert.deepEqual(fs.readFileSync(path.join(outcome.artifacts.directory, ARTIFACT_PATH)),
      ARTIFACT_BYTES);
  });

test('relay read failures remain incomplete sideband evidence and preserve the runner exit',
  async (t) => {
    // Keep the runner alive across relay polls: the missing file is observed
    // by the interval, then again by the final raw-log read.
    const fixture = artifactPlacementFixture(t, {
      append: 'await new Promise((resolve) => setTimeout(resolve, 700));',
    });
    const stem = path.join(fixture.controller,
      'test-output/placement/artifact-witness-fixture-host');
    let removed = false;
    const outcome = await fixture.start({onLine: (line) => {
      if (!removed && line.startsWith(`ok ${FIXTURE_FILE}`)) {
        removed = true;
        fs.unlinkSync(`${stem}.log`);
        fs.unlinkSync(`${stem}.err`);
      }
    }}).done;
    assert.equal(removed, true);
    assert.equal(outcome.status, 0);
    assert.equal(outcome.log, '');
    assert.equal(outcome.errors, '');
    assert.equal(outcome.artifacts.state, 'incomplete');
    assert.ok(outcome.artifacts.reasons.includes(REASON.RELAY_READ));
    assert.deepEqual(fs.readdirSync(path.join(fixture.node, 'test-output/placement-worktrees')),
      []);
  });

test('stalled collector leaders and early worker exit both release descendants and machine locks',
  async (t) => {
    for (const mode of ['supervise', 'collect']) {
      await t.test(mode, async (child) => {
        const fixture = artifactPlacementFixture(child, {append: 'process.exitCode = 7;'});
        const preload = path.join(fixture.scratch, `stall-${mode}.mjs`);
        const descendantFile = path.join(fixture.scratch, 'collector-processes.json');
        fixture.onCleanup(() => cleanCollectorGroup(descendantFile, fixture.scratch));
        const launchFile = path.join(fixture.scratch, 'collector-launch.pid');
        const setsid = spawnSync('sh', ['-c', 'command -v setsid'], {encoding: 'utf8'}).stdout.trim();
        const bin = path.join(fixture.scratch, 'bin');
        fs.mkdirSync(bin);
        fs.writeFileSync(path.join(bin, 'setsid'), '#!/bin/sh\n' +
          `if [ "$1" = timeout ]; then printf '%s' "$$" > '${launchFile}'; fi\n` +
          `exec '${setsid}' "$@"\n`, {mode: 0o755});
        fs.writeFileSync(preload, [
          'import fs from "node:fs";',
          'import {spawn, spawnSync} from "node:child_process";',
          `if (process.argv[2] === ${JSON.stringify(mode)}) {`,
          '  process.on("SIGTERM", () => {});',
          '  const child = spawn(process.execPath, ["-e",',
          '    "process.on(\'SIGTERM\', () => {}); setInterval(() => {}, 1000);",',
          `    ${JSON.stringify(fixture.scratch)}], {stdio: "ignore"});`,
          '  const group = Number(spawnSync("ps", ["-o", "pgid=", "-p", String(process.pid)],',
          '    {encoding: "utf8"}).stdout.trim());',
          '  const locks = fs.readdirSync("/proc/self/fd").flatMap((fd) => {',
          '    try { return [fs.readlinkSync(`/proc/self/fd/${fd}`)]; } catch { return []; }',
          '  }).filter((name) => /(?:machine|lagrange-placement)\\.lock$/.test(name));',
          `  fs.writeFileSync(${JSON.stringify(descendantFile)}, JSON.stringify({group, locks,`,
          '    process: process.pid, child: child.pid}));',
          '  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);',
          '}',
          '',
        ].join('\n'));
        const running = fixture.start({env: {...fixture.env, NODE_OPTIONS: `--import=${preload}`,
          PATH: `${bin}${path.delimiter}${fixture.env.PATH}`}});
        const script = fs.readFileSync(path.join(fixture.controller,
          'test-output/placement/artifact-witness-fixture-host.sh'), 'utf8');
        assert.match(script, /setsid timeout --signal=KILL 3s sh -c/u);
        const outcome = await running.done;
        assert.equal(outcome.status, 7, outcome.errors);
        assert.equal(outcome.artifacts.state, 'incomplete');
        assert.ok(outcome.artifacts.reasons.includes(REASON.TERMINAL));
        if (mode === 'collect') assert.ok(outcome.artifacts.reasons.includes(REASON.TIMEOUT));
        assert.ok(ARTIFACT_LIMITS.ENTRY_SECONDS < 5);
        const {child: pid, locks, group} = JSON.parse(fs.readFileSync(descendantFile, 'utf8'));
        assert.equal(group, Number(fs.readFileSync(launchFile, 'utf8')),
          'the background launch PID is the actual collector process group ID');
        assert.deepEqual(locks, [], 'the collector does not inherit either placement lock');
        const observed = spawnSync('ps', ['-o', 'stat=', '-p', String(pid)], {encoding: 'utf8'});
        assert.ok(observed.stdout.trim() === '' || observed.stdout.trim().startsWith('Z'),
          `collector descendant ${pid} remains live: ${observed.stdout}`);
        assert.deepEqual(fs.readdirSync(path.join(fixture.node, 'test-output/placement-worktrees')),
          []);
        assert.equal(fs.existsSync(path.join(fixture.env.LAB_LOCK_DIR, 'machine.holder.json')), false);
        assert.equal(spawnSync('flock', ['-n', path.join(fixture.env.LAB_LOCK_DIR, 'machine.lock'),
          'true']).status, 0, 'the machine lock is available after bounded collection cleanup');
      });
    }
  });

test('a full stdout pipe before EXIT cannot hold collection or machine cleanup', async (t) => {
  const fixture = artifactPlacementFixture(t, {append: ({scratch}) => [
    `const gate = ${JSON.stringify(path.join(scratch, 'reader-paused'))};`,
    'while (!fs.existsSync(gate)) await new Promise((resolve) => setTimeout(resolve, 10));',
    // stdout is a real nonblocking pipe. Fill it until the kernel refuses
    // another byte, then exit without flushing Node's queued stdout writes.
    'for (let size = 64 * 1024; size >= 1; size = Math.floor(size / 2)) {',
    '  const bytes = Buffer.alloc(size, "x");',
    '  for (;;) {',
    '    try { fs.writeSync(1, bytes); } catch (error) {',
    '      if (error.code !== "EAGAIN") throw error;',
    '      break;',
    '    }',
    '  }',
    '}',
    // Node made its inherited pipe nonblocking. Restore the shared write end
    // so the shell's next one-byte separator really blocks on the full pipe.
    'process.stdout._handle.setBlocking(true);',
    // The last loop size is one byte: this proves a separator cannot fit.
    `fs.writeFileSync(${JSON.stringify(path.join(scratch, 'pipe-filled'))}, "one-byte-refused");`,
    'process.exit(7);',
  ].join('\n')});
  const bin = path.join(fixture.scratch, 'bin');
  fs.mkdirSync(bin);
  // This SSH transport executes the canonical shell locally. It drains
  // setup lines, then stops reading its bounded OS pipe before the runner
  // fills it. Its connection ends when the real remote shell exits.
  fs.writeFileSync(path.join(bin, 'ssh'), [
    `#!${process.execPath}`,
    'const fs = require("node:fs");',
    'const {spawn} = require("node:child_process");',
    'const remote = spawn("sh", ["-c", process.argv.at(-1)],',
    '  {stdio: ["inherit", "pipe", "inherit"]});',
    'let output = "";',
    'remote.stdout.on("data", (bytes) => {',
    '  process.stdout.write(bytes);',
    '  output += bytes.toString();',
    '  if (output.includes("placement-pid=")) {',
    '    remote.stdout.pause();',
    `    fs.writeFileSync(${JSON.stringify(path.join(fixture.scratch, 'reader-paused'))}, "yes");`,
    '  }',
    '});',
    'remote.on("exit", (code) => process.exit(code));',
    '',
  ].join('\n'), {mode: 0o755});
  fixture.machine.sshTarget = 'local-pipe-fixture';
  const started = performance.now();
  const outcome = await fixture.start({env: {...fixture.env,
    PATH: `${bin}${path.delimiter}${fixture.env.PATH}`}}).done;
  assert.equal(fs.readFileSync(path.join(fixture.scratch, 'pipe-filled'), 'utf8'),
    'one-byte-refused');
  assert.ok(performance.now() - started >= ARTIFACT_LIMITS.ENTRY_SECONDS * 1000,
    'the external bound must actually fire; an early exit did not engage blocked output');
  assert.equal(outcome.status, 7, outcome.errors);
  assert.equal(outcome.artifacts.state, 'incomplete');
  assert.ok(outcome.artifacts.reasons.includes(REASON.TERMINAL));
  assert.deepEqual(fs.readdirSync(path.join(fixture.node, 'test-output/placement-worktrees')), []);
  assert.equal(fs.existsSync(path.join(fixture.env.LAB_LOCK_DIR, 'machine.holder.json')), false);
  assert.equal(spawnSync('flock', ['-n', path.join(fixture.env.LAB_LOCK_DIR, 'machine.lock'),
    'true']).status, 0);
});

test('an unavailable collector reports incomplete custody without replacing the runner exit',
  async (t) => {
    const fixture = artifactPlacementFixture(t, {
      append: `fs.unlinkSync(${JSON.stringify(COLLECTOR_PATH)}); process.exitCode = 7;`,
    });
    const outcome = await fixture.start().done;
    assert.equal(outcome.status, 7);
    assert.equal(outcome.artifacts.state, 'incomplete');
    assert.ok(outcome.artifacts.reasons.includes(REASON.UNAVAILABLE));
    assert.ok(outcome.artifacts.reasons.includes(REASON.TERMINAL));
    assert.deepEqual(fs.readdirSync(path.join(fixture.node, 'test-output/placement-worktrees')),
      []);
  });

function receivedFrames(outcome) {
  return outcome.log.split('\n').filter((line) => line.startsWith(ARTIFACT_FRAME_PREFIX));
}

test('controller refuses duplicate, truncated, rebound, oversized and altered artifact frames', async (t) => {
  const fixture = artifactPlacementFixture(t);
  const outcome = await fixture.start().done;
  const frames = receivedFrames(outcome);
  const parse = (line) => JSON.parse(line.slice(ARTIFACT_FRAME_PREFIX.length));
  const frameLine = (frame) => `${ARTIFACT_FRAME_PREFIX}${JSON.stringify(frame)}`;
  const file = parse(frames[0]);
  const binding = file.binding;
  const variants = [
    ['duplicate', [frames[0], ...frames]],
    ['missing-terminal', frames.slice(0, -1)],
    ['order', [...frames].reverse()],
    ['hash', [frameLine({...file, sha256: '0'.repeat(64)}), ...frames.slice(1)]],
    ['identity', [frameLine({...file, binding: {...binding, base: '0'.repeat(40)}}),
      ...frames.slice(1)]],
    ['bound', [frameLine({...file, data: 'a'.repeat(2 * ARTIFACT_LIMITS.FILE_BYTES)}),
      ...frames.slice(1)]],
    ['declared-size', [frameLine({...file, bytes: ARTIFACT_LIMITS.FILE_BYTES + 1}),
      ...frames.slice(1)]],
  ];
  for (const [name, lines] of variants) {
    const root = path.join(fixture.scratch, name);
    fs.mkdirSync(root);
    const receiver = createPlacementArtifactCustody({root, artifacts: ARTIFACTS, binding});
    for (const line of lines) receiver.accept(line);
    assert.equal(receiver.finish().state, 'incomplete', name);
  }
  const occupied = path.join(fixture.scratch, 'write-failure');
  fs.mkdirSync(occupied);
  const unwritable = createPlacementArtifactCustody({root: occupied,
    artifacts: ARTIFACTS, binding});
  const retained = path.join(occupied, 'test-output/placement-artifacts',
    `${binding.run}-${binding.host}`, 'test-output');
  fs.writeFileSync(retained, 'occupied');
  for (const line of frames) unwritable.accept(line);
  assert.ok(unwritable.finish().reasons.includes(REASON.WRITE));
  assert.equal(fs.readFileSync(retained, 'utf8'), 'occupied');
  const root = path.join(fixture.scratch, 'truncated');
  fs.mkdirSync(root);
  const receiver = createPlacementArtifactCustody({root, artifacts: ARTIFACTS, binding});
  const relay = path.join(root, 'relay.log');
  fs.writeFileSync(relay, frames.join('\n'));
  followPlacementArtifactRelay(relay, null, receiver, 60000)();
  const truncated = receiver.finish();
  assert.equal(truncated.state, 'incomplete');
  assert.ok(truncated.reasons.includes(REASON.TRUNCATED));
});

test('runLabTest forwards declared custody and keeps artifacts out of result rows and UI', async (t) => {
  const fixture = artifactPlacementFixture(t);
  const lines = [];
  let forwarded;
  let released = false;
  const result = await runLabTest({root: fixture.controller,
    plan: [{resourceClass: 'ordinary', files: [FIXTURE_FILE], jobs: 1}],
    commit: {sha: fixture.sha, gitRoot: fixture.controller, release: () => {
      released = true;
    }},
    checkBase: fixture.base, on: fixture.machine.name, env: {LAGRANGE_RETRY_FAILED_ONCE: '0'},
    artifacts: ARTIFACTS, write: (line) => lines.push(line)}, {
    discover: async () => ({machines: [fixture.machine]}),
    runRemote: (_shard, options) => {
      forwarded = options;
      return fixture.start(options);
    },
    runLocalChild: () => assert.fail('named remote run must never fall back to controller'),
  });
  assert.equal(result, 0);
  assert.equal(released, true);
  assert.deepEqual(forwarded.artifacts, ARTIFACTS);
  assert.equal(forwarded.forward.checkBase, fixture.base);
  assert.equal(forwarded.forward.retry, '0');
  assert.ok(lines.some((line) => line.includes('artifacts complete')));
  assert.ok(!lines.some((line) => line.includes(ARTIFACT_FRAME_PREFIX)));
  assert.equal(fs.existsSync(path.join(fixture.controller,
    'test-output/reports/test-results-fixture-host.ndjson')), false);
});

test('explicit artifact request refuses a controller share before starting work', async () => {
  let released = 0;
  await assert.rejects(runLabTest({root: process.cwd(),
    plan: [{resourceClass: 'ordinary', files: [FIXTURE_FILE], jobs: 1}],
    commit: {sha: 'a'.repeat(40), release: () => {
      released++;
    }},
    checkBase: 'b'.repeat(40), artifacts: ARTIFACTS,
    write: () => assert.fail('refusal must precede decision output')}, {
    discover: async () => ({machines: [{name: '(controller)', controller: true, speed: 1}]}),
    runRemote: () => assert.fail('no remote work may start'),
    runLocalChild: () => assert.fail('unsupported local custody may not be dropped'),
  }), /controller artifact custody is unsupported/u);
  assert.equal(released, 1);
});
