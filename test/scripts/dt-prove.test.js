import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

import {test} from '../../src/test-helpers/tap.js';
import {classifyProof} from '../../scripts/dt-prove.js';
import {execGit} from '../../scripts/checks/git-invocation.js';
import {gitProcessEnvironment} from '../../scripts/checks/git-process-environment.js';

const GREEN = 0;
const RED = 1;

test('classifyProof: green-with-fix, red-on-revert, green-on-restore is PROVEN', (t) => {
  const result = classifyProof({
    fixRunExit: GREEN,
    srcChanged: true,
    revertRunExit: RED,
    restoreRunExit: GREEN,
  });
  t.equal(result.verdict, 'red-on-revert-proven');
  t.equal(result.ok, true);
  t.end();
});

test('classifyProof: test that fails WITH the fix is fix-not-passing', (t) => {
  const result = classifyProof({
    fixRunExit: RED,
    srcChanged: true,
    revertRunExit: RED,
    restoreRunExit: GREEN,
  });
  t.equal(result.verdict, 'fix-not-passing');
  t.equal(result.ok, false);
  t.end();
});

test('classifyProof: revert that changes no bytes is revert-noop (test does not exercise --src)', (t) => {
  const result = classifyProof({
    fixRunExit: GREEN,
    srcChanged: false,
    revertRunExit: RED,
    restoreRunExit: GREEN,
  });
  t.equal(result.verdict, 'revert-noop');
  t.equal(result.ok, false);
  t.end();
});

test('classifyProof: test still green after revert is not-bound (does not bind the mechanism)', (t) => {
  const result = classifyProof({
    fixRunExit: GREEN,
    srcChanged: true,
    revertRunExit: GREEN,
    restoreRunExit: GREEN,
  });
  t.equal(result.verdict, 'not-bound');
  t.equal(result.ok, false);
  t.end();
});

test('classifyProof: test that does not return to green after restore is restore-failed', (t) => {
  const result = classifyProof({
    fixRunExit: GREEN,
    srcChanged: true,
    revertRunExit: RED,
    restoreRunExit: RED,
  });
  t.equal(result.verdict, 'restore-failed');
  t.equal(result.ok, false);
  t.end();
});

test('classifyProof: gate order — fix-not-passing wins even when other signals look proven', (t) => {
  const result = classifyProof({
    fixRunExit: RED,
    srcChanged: false,
    revertRunExit: GREEN,
    restoreRunExit: RED,
  });
  t.equal(result.verdict, 'fix-not-passing', 'fix must pass before any other check is meaningful');
  t.end();
});

// Exercise prove's real snapshot, revert, restore and finalizer. Only its test
// runner is finite: it reads the actual source bytes before deciding its exit.
// A real Git lock makes removal refuse; no cleanup function is substituted.
const CONTROL_TIMEOUT_MS = 15000;
const CONTROL_PREFIX = 'dt-prove-control=';
const SOURCE = 'src/value.txt';
const TEST_FILE = 'test/finite.test.js';
const FIXED = 'fixed\n';
const BROKEN = 'broken\n';
const ORIGINAL_ARTIFACT = 'test-output/dt-custody/first.txt';
const ORIGINAL_BYTES = 'first finite proof diagnostic\n';
const LOCK_REASON = 'finite dt cleanup refusal';

function observedProof(t, {fixedStatus = GREEN, makeDirectory = false} = {}) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'dt-proof-custody-'));
  let childPid = null;
  t.teardown(() => {
    try {
      if (Number.isInteger(childPid) && childPid > 0) {
        try {
          process.kill(-childPid, 'SIGKILL');
        } catch (error) {
          if (error.code !== 'ESRCH') throw error;
        }
      }
    } finally {
      fs.rmSync(scratch, {recursive: true, force: true});
    }
  });
  const repo = path.join(scratch, 'repo');
  const temporary = path.join(scratch, 'temporary');
  const marker = path.join(scratch, 'snapshot');
  const trace = path.join(scratch, 'runs.ndjson');
  fs.mkdirSync(path.join(repo, 'src'), {recursive: true});
  fs.mkdirSync(path.join(repo, 'scripts'), {recursive: true});
  fs.mkdirSync(path.join(repo, 'test'), {recursive: true});
  fs.mkdirSync(path.join(repo, 'node_modules'));
  fs.mkdirSync(temporary);
  fs.writeFileSync(path.join(repo, '.gitignore'), 'node_modules\ntest-output\n');
  fs.writeFileSync(path.join(repo, 'package.json'), '{"type":"module"}\n');
  fs.writeFileSync(path.join(repo, SOURCE), BROKEN);
  fs.writeFileSync(path.join(repo, TEST_FILE), '// finite runner input\n');
  const gitOwner = pathToFileURL(path.resolve('scripts/checks/git-invocation.js')).href;
  const environmentOwner = pathToFileURL(
    path.resolve('scripts/checks/git-process-environment.js')).href;
  fs.writeFileSync(path.join(repo, 'scripts/run-test-files.js'), [
    'import fs from "node:fs";',
    `import {execGit} from ${JSON.stringify(gitOwner)};`,
    `import {gitProcessEnvironment} from ${JSON.stringify(environmentOwner)};`,
    `const bytes = fs.readFileSync(${JSON.stringify(SOURCE)}, "utf8");`,
    `const status = bytes === ${JSON.stringify(FIXED)} ? ${fixedStatus} : ${RED};`,
    `const first = !fs.existsSync(${JSON.stringify(marker)});`,
    'if (first) {',
    `  execGit(["worktree", "lock", "--reason", ${JSON.stringify(LOCK_REASON)}, ` +
      'process.cwd()], {cwd: process.cwd(), env: gitProcessEnvironment(), ' +
      `timeout: ${CONTROL_TIMEOUT_MS}});`,
    `  fs.mkdirSync(${JSON.stringify(path.dirname(ORIGINAL_ARTIFACT))}, {recursive: true});`,
    `  fs.writeFileSync(${JSON.stringify(ORIGINAL_ARTIFACT)}, ${JSON.stringify(ORIGINAL_BYTES)});`,
    `  fs.writeFileSync(${JSON.stringify(marker)}, process.cwd());`,
    '}',
    `fs.appendFileSync(${JSON.stringify(trace)}, JSON.stringify({`,
    '  checkout: process.cwd(), argv: process.argv.slice(2), bytes, status,',
    '}) + "\\n");',
    makeDirectory ? `if (first) { fs.rmSync(${JSON.stringify(SOURCE)}); ` +
      `fs.mkdirSync(${JSON.stringify(SOURCE)}); }` : '',
    'process.stdout.write(status === 0 ? "ok finite source is fixed\\n" : ' +
      '"not ok finite source is broken\\n");',
    'process.exit(status);',
  ].join('\n'));
  const env = gitProcessEnvironment({...process.env, TMPDIR: temporary});
  delete env.NODE_TEST_CONTEXT;
  const git = (...args) => execGit(args,
    {cwd: repo, env, encoding: 'utf8', timeout: CONTROL_TIMEOUT_MS}).trim();
  git('init', '--quiet');
  git('config', 'user.name', 'DT Cleanup Fixture');
  git('config', 'user.email', 'dt-cleanup@example.invalid');
  git('add', '.');
  git('-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'finite broken source');
  const base = git('rev-parse', 'HEAD');
  fs.writeFileSync(path.join(repo, SOURCE), FIXED);
  const proofOwner = pathToFileURL(path.resolve('scripts/dt-prove.js')).href;
  const command = [
    'import fs from "node:fs";',
    `import {prove} from ${JSON.stringify(proofOwner)};`,
    'const read = fs.readFileSync;',
    'let readFailure = null;',
    'let failedPath = null;',
    // Observe the actual filesystem exception, without replacing its origin.
    'fs.readFileSync = (...args) => {',
    '  try { return read(...args); } catch (error) {',
    '    if (error.code === "EISDIR") { readFailure = error; failedPath = String(args[0]); }',
    '    throw error;',
    '  }',
    '};',
    'let observation;',
    'try {',
    `  observation = {result: prove(${JSON.stringify(repo)}, ` +
      `${JSON.stringify({test: TEST_FILE, src: [SOURCE], base})})};`,
    '} catch (error) {',
    '  observation = {error: {name: error.name, code: error.code, syscall: error.syscall,',
    '    message: error.message}, sameReadFailure: error === readFailure, failedPath};',
    '} finally { fs.readFileSync = read; }',
    `process.stdout.write(${JSON.stringify(CONTROL_PREFIX)} + ` +
      'JSON.stringify(observation) + "\\n");',
  ].join('\n');
  const observed = spawnSync(process.execPath, ['--input-type=module', '-e', command],
    {cwd: repo, env, detached: true, encoding: 'utf8', timeout: CONTROL_TIMEOUT_MS,
      killSignal: 'SIGKILL'});
  childPid = observed.pid;
  assert.equal(observed.error, undefined, 'the finite observation process was available');
  assert.equal(observed.status, 0, observed.stdout + observed.stderr);
  const line = observed.stdout.split('\n').find((item) => item.startsWith(CONTROL_PREFIX));
  assert.ok(line, 'the real prove invocation returned its observed outcome');
  assert.ok(fs.existsSync(marker), 'the actual runner locked its acquired snapshot');
  const checkout = fs.readFileSync(marker, 'utf8');
  const runs = fs.readFileSync(trace, 'utf8').trim().split('\n').map((item) => JSON.parse(item));
  assert.ok(runs.every((run) => run.checkout === checkout &&
    run.argv.at(-1) === TEST_FILE), 'all observed executions use the real snapshot and test input');
  assert.equal(fs.readFileSync(path.join(repo, SOURCE), 'utf8'), FIXED,
    'proof execution did not mutate the live source');
  return {observation: JSON.parse(line.slice(CONTROL_PREFIX.length)), runs, checkout, git,
    stderr: observed.stderr};
}

function assertOriginalRetained(observed) {
  assert.ok(fs.existsSync(observed.checkout), 'cleanup refusal preserves the original snapshot');
  assert.equal(fs.readFileSync(path.join(observed.checkout, ORIGINAL_ARTIFACT), 'utf8'),
    ORIGINAL_BYTES);
  const registered = observed.git('worktree', 'list', '--porcelain');
  assert.ok(registered.includes(`worktree ${fs.realpathSync(observed.checkout)}\n`));
  assert.ok(registered.includes(`locked ${LOCK_REASON}\n`), 'the real Git lock remains registered');
}

for (const fixedStatus of [GREEN, 23]) {
  test(`prove retains classification and refuses locked cleanup after fix exit ${fixedStatus}`,
    (t) => {
      const observed = observedProof(t, {fixedStatus});
      const {result} = observed.observation;
      assert.ok(result, 'the real proof completed its measured phases');
      const runs = {fixRunExit: fixedStatus, revertRunExit: RED, restoreRunExit: fixedStatus};
      assert.deepEqual(result.runs, runs);
      assert.equal(result.srcChanged, true);
      assert.deepEqual(observed.runs.map(({bytes, status}) => ({bytes, status})), [
        {bytes: FIXED, status: fixedStatus}, {bytes: BROKEN, status: RED},
        {bytes: FIXED, status: fixedStatus},
      ], 'the three real executions observe fixed, reverted and restored source bytes');
      assert.deepEqual(result.revertRunFailureLines, ['not ok finite source is broken']);
      assert.equal(result.ok, false, 'cleanup uncertainty cannot be a successful proof');
      const classification = classifyProof({...runs, srcChanged: true});
      assert.deepEqual(result.proof, classification, 'the original classification remains visible');
      assert.equal(result.verdict, fixedStatus === GREEN ? 'cleanup-unavailable' :
        classification.verdict);
      if (fixedStatus !== GREEN) assert.equal(result.detail, classification.detail);
      assert.equal(result.cleanup?.ok, false, 'the cleanup refusal is explicit');
      assertOriginalRetained(observed);
      assert.equal(fs.realpathSync(result.cleanup.worktreePath),
        fs.realpathSync(observed.checkout));
      assert.match(result.cleanup.problem, /locked/u);
      t.end();
    });
}

test('prove keeps the actual EISDIR primary when locked snapshot cleanup also refuses', (t) => {
  const observed = observedProof(t, {makeDirectory: true});
  assert.deepEqual(observed.runs.map(({status}) => status), [GREEN],
    'the first real execution precedes the failing revert read');
  assert.equal(observed.observation.error?.code, 'EISDIR');
  assert.equal(observed.observation.error?.syscall, 'read');
  assert.equal(observed.observation.sameReadFailure, true,
    'the exact filesystem error object remains primary after cleanup refusal');
  assertOriginalRetained(observed);
  assert.equal(fs.realpathSync(observed.observation.failedPath),
    fs.realpathSync(path.join(observed.checkout, SOURCE)));
  assert.ok(fs.statSync(path.join(observed.checkout, SOURCE)).isDirectory(),
    'the actual filesystem condition remains inspectable');
  assert.match(observed.stderr, /cleanup/u);
  assert.match(observed.stderr, /locked/u);
  const ownerCheckoutPath = path.dirname(path.dirname(observed.observation.failedPath));
  assert.ok(observed.stderr.includes(ownerCheckoutPath),
    'the secondary cleanup diagnostic identifies the retained snapshot');
  t.end();
});
