// Execute the workflow's actual shell step against a real finite Git history.
// Only GitHub's event/environment delivery is supplied by the fixture; no
// source-range resolver is substituted. This does not prove hosted/lab routing.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {parse} from 'yaml';

import {execGit, spawnGit} from '../../scripts/checks/git-invocation.js';
import {gitProcessEnvironment} from '../../scripts/checks/git-process-environment.js';

const WORKFLOW_PATH = '.github/workflows/ci.yml';
const RANGE_STEP_NAME = 'Resolve the proof range';
const EXISTING_ENV = 'EXISTING_ENTRY=retained\n';
const UNKNOWN_COMMIT = 'f'.repeat(40);
const ZERO_COMMIT = '0'.repeat(40);
const CHILD_TIMEOUT_MS = 15000;

function repositoryFixture(t) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-proof-range-'));
  t.after(() => fs.rmSync(scratch, {recursive: true, force: true}));
  const root = path.join(scratch, 'repository');
  fs.mkdirSync(root);
  const env = gitProcessEnvironment();
  const git = (...args) => execGit(args,
    {cwd: root, env, encoding: 'utf8', timeout: CHILD_TIMEOUT_MS}).trim();
  git('init', '--quiet');
  git('config', 'user.name', 'CI Range Fixture');
  git('config', 'user.email', 'ci-range@example.invalid');
  const commits = [];
  for (const name of ['base', 'earlier-change', 'latest-change']) {
    fs.writeFileSync(path.join(root, `${name}.txt`), `${name}\n`);
    git('add', `${name}.txt`);
    git('-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', name);
    commits.push(git('rev-parse', 'HEAD'));
  }
  const [base, middle, head] = commits;
  assert.equal(git('rev-list', '--count', `${base}..${head}`), '2',
    'the declared range contains two commits, so HEAD^ would omit real work');
  const absent = spawnGit(['cat-file', '-e', `${UNKNOWN_COMMIT}^{commit}`],
    {cwd: root, env, encoding: 'utf8', timeout: CHILD_TIMEOUT_MS});
  assert.equal(absent.error, undefined, 'the fixture object lookup executed');
  assert.notEqual(absent.status, 0, 'the missing full SHA is absent from the fixture');
  const environmentFile = path.join(scratch, 'github-env');
  fs.writeFileSync(environmentFile, EXISTING_ENV);
  return {root, base, middle, head, tree: git('rev-parse', 'HEAD^{tree}'), environmentFile};
}

function executeProofRange(fixture, eventFields) {
  const workflow = parse(fs.readFileSync(WORKFLOW_PATH, 'utf8'));
  const step = workflow.jobs.gate.steps.find((entry) => entry.name === RANGE_STEP_NAME);
  assert.ok(step, 'the actual workflow range step exists');
  assert.equal(step.shell, 'bash');
  assert.equal(typeof step.run, 'string');
  const env = gitProcessEnvironment({
    ...process.env,
    EVENT_NAME: '',
    PUSH_BEFORE_SHA: '',
    PR_BASE_SHA: '',
    DISPATCH_BASE_SHA: '',
    ...eventFields,
    GITHUB_SHA: fixture.head,
    GITHUB_ENV: fixture.environmentFile,
  });
  const result = spawnSync('bash', ['--noprofile', '--norc', '-c', step.run],
    {cwd: fixture.root, env, encoding: 'utf8', timeout: CHILD_TIMEOUT_MS,
      killSignal: 'SIGKILL'});
  assert.equal(result.error, undefined, 'the real range step completed without a fixture error');
  assert.equal(result.signal, null, 'the range step was not killed before deciding');
  return {result, workflow, step,
    environment: fs.readFileSync(fixture.environmentFile, 'utf8')};
}

function assertExactRange(observed, fixture) {
  const detail = observed.result.stdout + observed.result.stderr;
  assert.equal(observed.result.status, 0, detail);
  assert.equal(observed.environment,
    `${EXISTING_ENV}LAGRANGE_CHECK_BASE=${fixture.base}\n`,
    'only the declared immutable base reaches subsequent workflow steps');
  assert.ok(observed.result.stdout.split('\n').includes(
    `proof range: ${fixture.base}..${fixture.head}`),
  'the announced range includes both unpublished commits and the actual checkout');
}

function assertRefusedRange(observed) {
  const detail = observed.result.stdout + observed.result.stderr;
  assert.notEqual(observed.result.status, 0, detail);
  assert.equal(observed.environment, EXISTING_ENV,
    'refusal never publishes a substitute base or changes prior workflow environment');
}

for (const [event, field, binding] of [
  ['push', 'PUSH_BEFORE_SHA', '${{ github.event.before }}'],
  ['pull_request', 'PR_BASE_SHA', '${{ github.event.pull_request.base.sha }}'],
]) {
  test(`CI ${event} uses the exact declared multi-commit range`, (t) => {
    const fixture = repositoryFixture(t);
    const observed = executeProofRange(fixture,
      {EVENT_NAME: event, [field]: fixture.base});
    assertExactRange(observed, fixture);
    assert.equal(observed.step.env.EVENT_NAME, '${{ github.event_name }}');
    assert.equal(observed.step.env[field], binding,
      'the workflow supplies the event field exercised by the real shell step');
  });

  for (const [name, base] of [
    ['absent', ''],
    ['zero', ZERO_COMMIT],
    ['unreachable', UNKNOWN_COMMIT],
  ]) {
    test(`CI ${event} refuses the ${name} declared base without publishing a range`, (t) => {
      const fixture = repositoryFixture(t);
      assertRefusedRange(executeProofRange(fixture, {EVENT_NAME: event, [field]: base}));
    });
  }
}

test('CI manual dispatch uses its explicit immutable multi-commit base', (t) => {
  const fixture = repositoryFixture(t);
  const observed = executeProofRange(fixture,
    {EVENT_NAME: 'workflow_dispatch', DISPATCH_BASE_SHA: fixture.base});
  assertExactRange(observed, fixture);
  assert.equal(observed.step.env.DISPATCH_BASE_SHA, '${{ inputs.base_sha }}',
    'the executed dispatch field is wired to the real workflow input');
  assert.equal(observed.workflow.on.workflow_dispatch.inputs.base_sha.type, 'string');
  assert.equal(observed.workflow.on.workflow_dispatch.inputs.base_sha.required, true);
});

for (const [name, baseOf] of [
  ['missing', () => ''],
  ['zero', () => ZERO_COMMIT],
  ['unreachable', () => UNKNOWN_COMMIT],
  ['symbolic', () => 'HEAD^'],
  ['abbreviated', (fixture) => fixture.base.slice(0, 12)],
  ['non-commit object', (fixture) => fixture.tree],
]) {
  test(`CI manual dispatch refuses a ${name} base without publishing a range`, (t) => {
    const fixture = repositoryFixture(t);
    assertRefusedRange(executeProofRange(fixture,
      {EVENT_NAME: 'workflow_dispatch', DISPATCH_BASE_SHA: baseOf(fixture)}));
  });
}
