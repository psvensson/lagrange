// The real pre-push hook, with every stage that reads content stubbed, proves
// its control flow behaviourally (proof-authority-integrity): outside an exact
// checkout it hands exactly the pushed commit to the materializer with the
// ref lines and runs no content stage itself; the materializer's status is
// the hook's status; a deletion-only push proves nothing; a manual
// invocation gates HEAD; an annotated tag peels to its commit; and inside a
// checkout the hook refuses a HEAD that is not the pushed commit before any
// content stage runs. A textual witness of the hook cannot see any of this.
import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {gitProcessEnvironment} from
  '../../scripts/checks/git-process-environment.js';

const root = process.cwd();
const UTF8 = 'utf8';
const HOOK = '.githooks/pre-push';
const MATERIALIZER = 'scripts/checks/push-gate-corpus-worktree.js';
const STUBBED_SCRIPTS = Object.freeze([
  'scripts/check-circular-dependencies.js',
  'scripts/check-unused-exports.js',
  'scripts/checks/wait-for-thermal-headroom.js',
]);
const ZERO_SHA = '0'.repeat(40);
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'pre-push-flow-'));
const repo = path.join(workspace, 'repo');
const stubBin = path.join(workspace, 'bin');
const calls = path.join(workspace, 'calls.ndjson');
process.on('exit', () => {
  fs.rmSync(workspace, {recursive: true, force: true});
});

function write(relative, contents, mode = 0o644) {
  const absolute = path.join(repo, relative);
  fs.mkdirSync(path.dirname(absolute), {recursive: true});
  fs.writeFileSync(absolute, contents, {encoding: UTF8, mode});
}

function git(args) {
  return execFileSync('git', args,
    {cwd: repo, encoding: UTF8, stdio: 'pipe', env: gitProcessEnvironment()}).trim();
}

// Every stub records its name, argv and stdin as one line, then exits with
// the status the test asked for (through PRE_PUSH_FLOW_STATUS_<NAME>).
const recorderSource = (name) =>
  'import fs from \'node:fs\';\n' +
  'const input = fs.readFileSync(0, \'utf8\');\n' +
  'fs.appendFileSync(process.env.PRE_PUSH_FLOW_CALLS, JSON.stringify({\n' +
  `  name: ${JSON.stringify(name)}, argv: process.argv.slice(2), input,\n` +
  '  env: {injections: process.env.LAGRANGE_WORKSPACE_INJECTIONS || null,\n' +
  '    pushedRef: process.env.LAGRANGE_GATE_PUSHED_REF || null}}) + \'\\n\');\n' +
  'process.exit(Number(process.env[\'PRE_PUSH_FLOW_STATUS_\' + ' +
  `${JSON.stringify(name.toUpperCase())}] || 0));\n`;

function buildFixture() {
  fs.mkdirSync(stubBin, {recursive: true});
  write(HOOK, fs.readFileSync(path.join(root, HOOK), UTF8), 0o755);
  write(MATERIALIZER, recorderSource('materializer'));
  for (const script of STUBBED_SCRIPTS) write(script, recorderSource('script'));
  write('package.json', '{"name": "pre-push-flow-fixture", "type": "module"}\n');
  write('README.md', 'fixture\n');
  // A JavaScript file inside the lint pathspec, changed by the second commit,
  // so the pushed range is non-empty and the lint stage actually invokes the
  // linter rather than passing xargs an empty list. It sits directly under
  // src/, which the pathspec reached only once it gained :(glob) magic.
  write('src/sample.js', 'export const sample = 1;\n');
  // Never touched again: the range must exclude it, and the whole-tree
  // fallback must include it.
  write('src/deep/untouched.js', 'export const untouched = 1;\n');
  // npm, npx and gh on PATH record their argv (as JSON, so quotes in the gh
  // query survive) and succeed; gh reports that CI is unavailable.
  for (const name of ['npm', 'npx', 'gh']) {
    const stub = path.join(stubBin, name);
    fs.writeFileSync(stub,
      `#!${process.execPath}\n` +
      'const fs = require(\'node:fs\');\n' +
      'fs.appendFileSync(process.env.PRE_PUSH_FLOW_CALLS, JSON.stringify({\n' +
      `  name: ${JSON.stringify(name)}, argv: process.argv.slice(2)}) + '\\n');\n` +
      `process.exit(${name === 'gh' ? 1 : 0});\n`, {mode: 0o755});
  }
  git(['init', '--quiet']);
  git(['config', 'user.email', 'fixture@example.invalid']);
  git(['config', 'user.name', 'fixture']);
  git(['add', '.']);
  git(['commit', '--quiet', '-m', 'base']);
  const base = git(['rev-parse', 'HEAD']);
  write('README.md', 'fixture two\n');
  write('src/sample.js', 'export const sample = 2;\n');
  git(['add', '.']);
  git(['commit', '--quiet', '-m', 'second']);
  const second = git(['rev-parse', 'HEAD']);
  // A third commit that changes the lint contract itself, so a range ending
  // here must abandon the range and lint every tracked file.
  write('package.json',
    '{"name": "pre-push-flow-fixture", "type": "module", "version": "2"}\n');
  git(['add', '.']);
  git(['commit', '--quiet', '-m', 'lint contract']);
  git(['tag', '-a', 'v-fixture', '-m', 'annotated']);
  return {base, second, head: git(['rev-parse', 'HEAD']),
    branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
    tagObject: git(['rev-parse', 'v-fixture'])};
}

const shas = buildFixture();

function runHook(refLines, extraEnv = {}, at = null) {
  fs.writeFileSync(calls, '', UTF8);
  if (at) git(['checkout', '--quiet', '--detach', at]);
  const env = {
    ...gitProcessEnvironment(),
    PATH: `${stubBin}${path.delimiter}${path.dirname(process.execPath)}` +
      `${path.delimiter}/usr/bin${path.delimiter}/bin`,
    PRE_PUSH_FLOW_CALLS: calls,
    ...extraEnv,
  };
  delete env.LAGRANGE_WORKSPACE_INJECTIONS;
  delete env.LAGRANGE_GATE_PUSHED_SHA;
  delete env.LAGRANGE_GATE_RED_MAIN_CHECKED;
  delete env.LAGRANGE_PUSH_SKIP_TESTS;
  Object.assign(env, extraEnv);
  const result = spawnSync('bash', [HOOK],
    {cwd: repo, encoding: UTF8, input: refLines, env});
  if (at) git(['checkout', '--quiet', shas.branch]);
  const recorded = fs.readFileSync(calls, UTF8).split('\n').filter(Boolean)
    .map((line) => JSON.parse(line));
  return {status: result.status, output: `${result.stdout}${result.stderr}`,
    recorded};
}

function materializerCalls(recorded) {
  return recorded.filter((entry) => entry.name === 'materializer');
}

function contentStageCalls(recorded) {
  return recorded.filter((entry) => entry.name !== 'materializer' &&
    entry.name !== 'gh');
}

test('the hook hands the pushed commit to the materializer and runs no content stage itself', () => {
  const refLine = `refs/heads/main ${shas.head} refs/heads/main ${shas.base}\n`;
  const run = runHook(refLine);
  assert.equal(run.status, 0, run.output);
  const [call, ...more] = materializerCalls(run.recorded);
  assert.ok(call, 'the materializer is invoked');
  assert.deepEqual(more, [], 'exactly once');
  assert.deepEqual(call.argv.slice(0, 2), ['--gate', shas.head],
    'with exactly the pushed commit');
  assert.equal(call.argv[2], '--ref-lines');
  assert.equal(call.env.pushedRef, 'refs/heads/main');
  assert.deepEqual(contentStageCalls(run.recorded), [],
    'no unused-files, lint, ratchet, cycle or export stage ran in the ' +
    'working tree');
  assert.match(run.output, /materialize-pushed-tree/u);
});

// The three things the lint stage decides: what reaches eslint, what the
// range excludes, and when the range is abandoned. A stage that silently
// linted nothing would pass a test that only asserted the first.
function lintedPaths(run) {
  const lint = run.recorded.filter((entry) => entry.name === 'npx');
  assert.ok(lint.length > 0, `eslint is invoked: ${run.output}`);
  return lint.flatMap((call) => call.argv);
}

const LINT_ENV = Object.freeze({
  LAGRANGE_WORKSPACE_INJECTIONS: 'node_modules,data',
  LAGRANGE_GATE_RED_MAIN_CHECKED: '1',
  LAGRANGE_PUSH_SKIP_TESTS: '1',
});

test('the lint stage hands eslint file paths and nothing else', () => {
  // The branch's stdout IS the file list, so a progress line printed there
  // arrives at eslint as a filename and the stage dies with xargs' exit 123.
  const run = runHook(
    `refs/heads/main ${shas.second} refs/heads/main ${shas.base}\n`,
    {...LINT_ENV, LAGRANGE_GATE_PUSHED_SHA: shas.second}, shas.second);
  assert.equal(run.status, 0, run.output);
  const linted = lintedPaths(run);
  for (const argument of linted) {
    assert.ok(!argument.startsWith('pre-push:'),
      `a progress line reached eslint as an argument: ${argument}`);
  }
  assert.ok(linted.includes('src/sample.js'),
    `the changed file directly under src/ is linted: ${linted.join(' ')}`);
});

test('the range narrows: a tracked file the push does not touch is not linted', () => {
  const run = runHook(
    `refs/heads/main ${shas.second} refs/heads/main ${shas.base}\n`,
    {...LINT_ENV, LAGRANGE_GATE_PUSHED_SHA: shas.second}, shas.second);
  assert.equal(run.status, 0, run.output);
  assert.ok(!lintedPaths(run).includes('src/deep/untouched.js'),
    'a file outside the pushed range was linted by the push that added it');
  assert.match(run.output, /linting the pushed range/u);
});

test('a change to the lint contract abandons the range and lints every tracked file', () => {
  // eslint's per-file verdict holds only while the configuration and the
  // dependency set that produced it are fixed.
  const run = runHook(
    `refs/heads/main ${shas.head} refs/heads/main ${shas.second}\n`,
    {...LINT_ENV, LAGRANGE_GATE_PUSHED_SHA: shas.head});
  assert.equal(run.status, 0, run.output);
  const linted = lintedPaths(run);
  for (const tracked of ['src/sample.js', 'src/deep/untouched.js']) {
    assert.ok(linted.includes(tracked),
      `${tracked} is linted again: ${linted.join(' ')}`);
  }
  assert.match(run.output, /the lint contract changed/u);
});

test('the materializer\'s status is the hook\'s status', () => {
  const refLine = `refs/heads/main ${shas.head} refs/heads/main ${shas.base}\n`;
  const run = runHook(refLine, {PRE_PUSH_FLOW_STATUS_MATERIALIZER: '3'});
  assert.equal(run.status, 3, run.output);
  assert.match(run.output, /XX FAILED/u);
});

test('an annotated tag as the first pushed ref is peeled to its commit', () => {
  const refLine = `refs/tags/v-fixture ${shas.tagObject} refs/tags/v-fixture ${ZERO_SHA}\n`;
  const run = runHook(refLine);
  assert.equal(run.status, 0, run.output);
  const [call] = materializerCalls(run.recorded);
  assert.ok(call);
  assert.equal(call.argv[1], shas.head,
    'the tag object sha is not a tree; its commit is');
});

test('a deletion-only push proves nothing and a manual invocation gates HEAD', () => {
  const deletion = runHook(`refs/heads/old ${ZERO_SHA} refs/heads/old ${shas.base}\n`);
  assert.equal(deletion.status, 0, deletion.output);
  assert.deepEqual(materializerCalls(deletion.recorded), []);
  assert.match(deletion.output, /nothing to prove/u);
  const manual = runHook('');
  assert.equal(manual.status, 0, manual.output);
  const [call] = materializerCalls(manual.recorded);
  assert.equal(call?.argv[1], shas.head, 'HEAD, never the working tree');
});

test('inside a checkout the hook refuses a HEAD that is not the pushed commit before any content stage', () => {
  const foreign = runHook(
    `refs/heads/main ${shas.base} refs/heads/main ${ZERO_SHA}\n`,
    {LAGRANGE_WORKSPACE_INJECTIONS: 'node_modules,data',
      LAGRANGE_GATE_RED_MAIN_CHECKED: '1'});
  assert.equal(foreign.status, 1, foreign.output);
  assert.match(foreign.output, /is not the pushed commit/u);
  assert.deepEqual(contentStageCalls(foreign.recorded), []);
  const exported = runHook(
    `refs/heads/main ${shas.head} refs/heads/main ${ZERO_SHA}\n`,
    {LAGRANGE_WORKSPACE_INJECTIONS: 'node_modules,data',
      LAGRANGE_GATE_PUSHED_SHA: shas.base, LAGRANGE_GATE_RED_MAIN_CHECKED: '1'});
  assert.equal(exported.status, 1, exported.output);
  assert.match(exported.output, /is not the pushed sha/u);
});

test('inside a checkout of the pushed commit the content stages run in place, in the declared order', () => {
  const run = runHook(
    `refs/heads/main ${shas.head} refs/heads/main ${ZERO_SHA}\n`,
    {LAGRANGE_WORKSPACE_INJECTIONS: 'node_modules,data',
      LAGRANGE_GATE_PUSHED_SHA: shas.head, LAGRANGE_GATE_RED_MAIN_CHECKED: '1',
      LAGRANGE_PUSH_SKIP_TESTS: '1'});
  assert.equal(run.status, 0, run.output);
  assert.deepEqual(materializerCalls(run.recorded).map((entry) => entry.argv),
    [['--in-place']], 'the ratchets run in place, nothing is re-materialized');
  const names = run.recorded.map((entry) => entry.name);
  assert.deepEqual(names.filter((name) => name === 'gh'), [],
    'the red-main guard is not queried twice');
  assert.ok(names.indexOf('npm') < names.indexOf('materializer'),
    'unused-files precedes the ratchets');
  assert.match(run.output, /proving .* \(ref refs\/heads\/main\)/u,
    'the identity line names the checkout and the pushed ref');
});
