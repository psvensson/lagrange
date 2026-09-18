// A newly registered lab worker gets everything it needs from one script the
// owner copies there and runs (owner request, 2026-09-18). Its toolchain is
// the full-corpus canary's own install steps, read from the workflow when the
// script is generated, so a worker and CI cannot drift apart.

import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {parse} from 'yaml';

import {gitProcessEnvironment} from '../../scripts/checks/git-process-environment.js';
import {
  WORKER_CANARY_STEPS, WORKER_SETUP_FILE, WORKER_SYSTEM_PACKAGES, WORKER_TOOL_SOURCES,
  copyWorkerSetup, parseCapability, workerCloneUrl, workerSetupScript,
} from '../../scripts/lab/probe.js';

const CANARY = '.github/workflows/full-corpus-canary.yml';
const KEY = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExampleKeyOnlyForTheWitness controller@lab';
const INPUT = Object.freeze({
  nodeMinimum: '22.12.0',
  repoUrl: 'https://example.invalid/lagrange.git',
  authorizedKeys: [KEY],
});

function canary() {
  return parse(fs.readFileSync(path.join(process.cwd(), CANARY), 'utf8'));
}

function canaryStep(workflow, name) {
  return Object.values(workflow.jobs).flatMap((job) => job.steps || [])
    .find((step) => step.name === name).run.trimEnd();
}

function bash() {
  return spawnSync('sh', ['-c', 'command -v bash'], {encoding: 'utf8'}).stdout.trim();
}

// The lines of the generated script from one step to the next, to run alone.
function block(script, fromStep, toStep) {
  const from = script.indexOf(`step "${fromStep}`);
  const to = script.indexOf(`step "${toStep}`, from);
  assert.ok(from >= 0 && to > from, `${fromStep} .. ${toStep}`);
  return script.slice(from, to);
}

const STEP_FUNCTION = 'step() { :; }\nfail() { echo "$*" >&2; exit 1; }\n';

test('the worker setup installs the canary toolchain as the canary does', () => {
  const workflow = canary();
  const script = workerSetupScript({workflow, ...INPUT});
  const toolchain = canaryStep(workflow, WORKER_CANARY_STEPS.TOOLCHAIN);
  const dataset = canaryStep(workflow, WORKER_CANARY_STEPS.DATASET);
  assert.ok(script.includes(`(\n${toolchain}\n)`),
    'the canary install step, line for line, in a subshell of its own');
  assert.ok(script.includes(`    cd "$REPO_PATH"\n${dataset}\n  )`),
    'the canary dataset step, line for line, run in the checkout');
  assert.match(script, /^RUNNER_TEMP="\$workdir"$/mu,
    'with the temporary directory the canary step installs into');
  assert.ok(script.indexOf(toolchain) < script.indexOf('nvm install'),
    'CI tools first, then node, the checkout and the dataset');

  // A canary that no longer has the step fails generation, loudly.
  const without = structuredClone(workflow);
  for (const job of Object.values(without.jobs)) {
    job.steps = (job.steps || []).filter((step) => step.name !== WORKER_CANARY_STEPS.TOOLCHAIN);
  }
  assert.throws(() => workerSetupScript({workflow: without, ...INPUT}),
    /no step named "Install gate CLI tools"/u);

  // A step a worker has no runner to reproduce is refused at generation, not
  // written into a script that fails on the worker after sudo.
  const withStep = (change) => {
    const changed = structuredClone(workflow);
    for (const job of Object.values(changed.jobs)) {
      for (const step of job.steps || []) {
        if (step.name === WORKER_CANARY_STEPS.TOOLCHAIN) change(step);
      }
    }
    return changed;
  };
  for (const [change, why] of [
    [(step) => (step.run = step.run.replace('"$RUNNER_TEMP"', '"${{ runner.temp }}"')), /\$\{\{/u],
    [(step) => (step.run += '\necho "x=1" >> "$GITHUB_ENV"'), /GITHUB_ENV/u],
    [(step) => (step.run += '\necho "$RUNNER_OS"'), /RUNNER_OS/u],
    [(step) => (step.env = {X: '1'}), /uses env/u],
    [(step) => (step.shell = 'pwsh'), /uses shell/u],
    [(step) => (step['working-directory'] = 'x'), /uses working-directory/u],
  ]) {
    assert.throws(() => workerSetupScript({workflow: withStep(change), ...INPUT}),
      new RegExp(`cannot reproduce the canary step[^]*${why.source}`, 'u'));
  }
  // A variable the job defines is one a worker's shell does not.
  const jobVariable = withStep((step) => (step.run += '\necho "${JOB_ONLY}"'));
  for (const job of Object.values(jobVariable.jobs)) job.env = {...job.env, JOB_ONLY: '1'};
  assert.throws(() => workerSetupScript({workflow: jobVariable, ...INPUT}), /uses JOB_ONLY/u);
  // And one the whole workflow defines.
  const workflowVariable = withStep((step) => (step.run += '\necho "$WORKFLOW_ONLY"'));
  workflowVariable.env = {...workflowVariable.env, WORKFLOW_ONLY: '1'};
  assert.throws(() => workerSetupScript({workflow: workflowVariable, ...INPUT}),
    /uses WORKFLOW_ONLY/u);
});

test('every tool discovery checks is provisioned', () => {
  const workflow = canary();
  const script = workerSetupScript({workflow, ...INPUT});
  const toolchain = canaryStep(workflow, WORKER_CANARY_STEPS.TOOLCHAIN);
  const checked = Object.keys(parseCapability('').tools);
  assert.ok(checked.length >= 9, 'discovery checks the canary\'s tools too');
  for (const tool of checked) {
    const source = WORKER_TOOL_SOURCES[tool];
    assert.ok(source, `${tool}: discovery checks it, so the setup provides it`);
    if (source.from === 'canary') {
      assert.ok(toolchain.includes(source.token), `${tool}: the canary installs it`);
    } else {
      assert.ok(WORKER_SYSTEM_PACKAGES.includes(source.token) || source.token === 'docker.io',
        `${tool}: a system package`);
    }
    assert.ok(script.includes(source.token), `${tool}: and the script carries it`);
    assert.ok(source.version.startsWith(`${tool} `), `${tool}: reported by itself`);
    assert.ok(script.includes(`\nreport ${source.version}\n`), `${tool}: and reported at the end`);
  }
  for (const tool of ['java', 'rg', 'jq']) {
    assert.ok(checked.includes(tool), `discovery checks ${tool}, which the canary installs`);
  }
});

test('the worker setup refuses a machine it cannot provision before asking for anything', (t) => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'worker-setup-'));
  t.after(() => fs.rmSync(scratch, {recursive: true, force: true}));
  const script = path.join(scratch, WORKER_SETUP_FILE);
  fs.writeFileSync(script, workerSetupScript({workflow: canary(), ...INPUT}));
  const stubs = path.join(scratch, 'bin');
  fs.mkdirSync(stubs);
  const stub = (name, body) => fs.writeFileSync(path.join(stubs, name),
    `#!/bin/sh\n${body}\n`, {mode: 0o755});
  stub('uname', 'if [ "$1" = -m ]; then echo "$STUB_ARCH"; else echo "$STUB_OS"; fi');
  stub('id', 'if [ "$1" = -u ]; then echo "$STUB_UID"; else echo peter; fi');
  // sudo records that it was asked, then stops the run there.
  stub('sudo', `: > '${scratch}/asked'; exit 1`);
  const withApt = path.join(scratch, 'apt');
  fs.mkdirSync(withApt);
  fs.writeFileSync(path.join(withApt, 'apt-get'), '#!/bin/sh\nexit 0\n', {mode: 0o755});
  const runAs = ({os: stubOs = 'Linux', arch = 'x86_64', uid = '1000', apt = true}) => {
    fs.rmSync(path.join(scratch, 'asked'), {force: true});
    const result = spawnSync(bash(), [script], {
      encoding: 'utf8',
      env: {PATH: apt ? `${stubs}:${withApt}` : stubs, HOME: scratch,
        STUB_OS: stubOs, STUB_ARCH: arch, STUB_UID: uid},
    });
    return {...result, asked: fs.existsSync(path.join(scratch, 'asked'))};
  };
  for (const [machine, message] of [
    [{os: 'Darwin'}, /this setup is for Linux, not Darwin/u],
    [{arch: 'aarch64'}, /pins x86_64 helm and wasm-tools archives, not aarch64/u],
    [{apt: false}, /needs apt-get/u],
    [{uid: '0'}, /not as root/u],
  ]) {
    const refused = runAs(machine);
    assert.equal(refused.status, 1, JSON.stringify(machine));
    assert.match(refused.stderr, message);
    assert.equal(refused.asked, false, `${JSON.stringify(machine)}: refused before sudo`);
  }
  const provisionable = runAs({});
  assert.equal(provisionable.asked, true, 'a machine it can provision is asked for sudo');
  assert.notEqual(provisionable.status, 0, 'and a refused sudo ends the run');
});

test('the worker setup is valid bash built only from what it is given', () => {
  const script = workerSetupScript({workflow: canary(), ...INPUT,
    generatedFrom: 'lagrange-server 0123abc'});
  const checked = spawnSync(bash(), ['-n'], {input: script, encoding: 'utf8'});
  assert.equal(checked.status, 0, checked.stderr);
  assert.match(script, /^REPO_URL='https:\/\/example\.invalid\/lagrange\.git'$/mu);
  assert.match(script, /^NODE_MAJOR='22'$/mu, 'the engines floor names the node major');
  assert.ok(script.includes(`grep -qxF '${KEY}'`), 'the controller key it was given');
  assert.ok(!workerSetupScript({workflow: canary(), ...INPUT, authorizedKeys: []})
    .includes('authorized_keys'), 'no key given, no key step');
  assert.equal(workerCloneUrl('git@github.com:owner/repo.git'),
    'https://github.com/owner/repo.git', 'a worker has no GitHub key: clone over https');
  assert.equal(workerCloneUrl(' https://example.invalid/r.git\n'),
    'https://example.invalid/r.git');
  assert.throws(() => workerSetupScript({workflow: canary(), ...INPUT, nodeMinimum: '22'}),
    /engines floor/u);
  assert.throws(() => workerSetupScript({workflow: canary(), ...INPUT, repoUrl: ''}),
    /clone URL/u);
  assert.throws(() => workerSetupScript({workflow: canary(), ...INPUT,
    authorizedKeys: ['ssh-ed25519 AAAA\'; rm -rf ~ #']}), /not an ssh public key/u,
  'a key that is not a key is refused, not quoted into the script');

  // A key's comment is free text: it is appended as it is, runs nothing, and
  // a second run adds nothing.
  const hostile = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHostile x\'y $(touch pwned) `touch pwned2`';
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'worker-keys-'));
  try {
    const keys = block(workerSetupScript({workflow: canary(), ...INPUT, authorizedKeys: [hostile]}),
      'The controller\'s ssh key', 'What this worker now has');
    for (let run = 0; run < 2; run += 1) {
      const result = spawnSync(bash(), ['-euc', STEP_FUNCTION + keys],
        {cwd: home, encoding: 'utf8', env: {...gitProcessEnvironment(), HOME: home}});
      assert.equal(result.status, 0, result.stderr);
    }
    assert.equal(fs.readFileSync(path.join(home, '.ssh', 'authorized_keys'), 'utf8'),
      `${hostile}\n`, 'verbatim, once');
    assert.deepEqual(fs.readdirSync(home), ['.ssh'], 'and nothing in it ran');
  } finally {
    fs.rmSync(home, {recursive: true, force: true});
  }

  // nvm runs with unset variables allowed, and its installer only after its
  // digest checks.
  assert.ok(script.includes('set +u\n. "$NVM_DIR/nvm.sh"\nnvm install "$NODE_MAJOR"\nset -u'));
  const digest = script.indexOf('sha256sum --check --quiet');
  assert.ok(digest > 0 && digest < script.indexOf('bash "$workdir/nvm-install.sh"'));
});

test('the worker setup moves a checkout to main only when nothing is lost', (t) => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'worker-checkout-'));
  t.after(() => fs.rmSync(scratch, {recursive: true, force: true}));
  // Git addresses these scratch repositories only, never one a hook exported
  // GIT_DIR for (verifier round 2).
  const git = (cwd, ...args) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t',
    ...args], {cwd, encoding: 'utf8', env: gitProcessEnvironment()}).stdout.trim();
  // Inside a push hook git exports GIT_DIR for the pusher's repository: this
  // decoy stands in for it and must see nothing, from the first git on (verifier round 2).
  const decoy = path.join(scratch, 'decoy');
  fs.mkdirSync(decoy);
  git(decoy, 'init', '-q', '-b', 'main');
  const savedGitDir = process.env.GIT_DIR;
  process.env.GIT_DIR = path.join(decoy, '.git');
  t.after(() => {
    if (savedGitDir === undefined) delete process.env.GIT_DIR;
    else process.env.GIT_DIR = savedGitDir;
  });
  const upstream = path.join(scratch, 'upstream');
  fs.mkdirSync(upstream);
  git(upstream, 'init', '-q', '-b', 'main');
  git(upstream, 'commit', '-q', '--allow-empty', '-m', 'one');
  const one = git(upstream, 'rev-parse', 'HEAD');
  const checkout = block(workerSetupScript({workflow: canary(), ...INPUT}),
    'The checkout at', 'Dependencies that match');
  const worker = (name, prepare) => {
    const repo = path.join(scratch, name);
    git(scratch, 'clone', '-q', upstream, repo);
    prepare(repo);
    return repo;
  };
  const cases = {
    behind: worker('behind', () => {}),
    dirty: worker('dirty', (repo) => fs.writeFileSync(path.join(repo, 'local.txt'), 'x')),
    branch: worker('branch', (repo) => git(repo, 'checkout', '-q', '-b', 'topic')),
    detachedBehind: worker('detached-behind', (repo) => git(repo, 'checkout', '-q', '--detach')),
    mainAhead: worker('main-ahead', (repo) =>
      git(repo, 'commit', '-q', '--allow-empty', '-m', 'local work on main')),
    detachedAhead: worker('detached-ahead', (repo) => {
      git(repo, 'checkout', '-q', '--detach');
      git(repo, 'commit', '-q', '--allow-empty', '-m', 'local work');
    }),
  };
  const before = Object.fromEntries(Object.entries(cases)
    .map(([name, repo]) => [name, git(repo, 'rev-parse', 'HEAD')]));
  git(upstream, 'commit', '-q', '--allow-empty', '-m', 'two');
  const two = git(upstream, 'rev-parse', 'HEAD');
  for (const [name, repo] of Object.entries(cases)) {
    const result = spawnSync(bash(), ['-euc', STEP_FUNCTION + checkout], {encoding: 'utf8',
      env: {...gitProcessEnvironment(), REPO_URL: upstream, REPO_PATH: repo}});
    assert.equal(result.status, 0, `${name}: ${result.stderr}`);
  }
  const head = (name) => git(cases[name], 'rev-parse', 'HEAD');
  assert.equal(head('behind'), two, 'main behind is fast-forwarded');
  assert.equal(head('detachedBehind'), two, 'a detached HEAD main contains follows main');
  assert.equal(head('dirty'), before.dirty, 'local changes are left alone');
  assert.equal(head('branch'), one, 'another branch is left alone');
  assert.equal(git(cases.branch, 'symbolic-ref', '--short', 'HEAD'), 'topic');
  assert.equal(head('detachedAhead'), before.detachedAhead,
    'a detached HEAD with local commits is left alone');
  assert.equal(head('mainAhead'), before.mainAhead,
    'main with local commits is left alone, never merged');
  delete process.env.GIT_DIR;
  assert.equal(spawnSync('git', ['rev-parse', '--verify', '--quiet', 'HEAD'], {cwd: decoy,
    env: gitProcessEnvironment()}).status, 1, 'the repository GIT_DIR named got no commit');
});

test('provision writes the setup, or copies it to a registered worker and names the command',
  async (t) => {
    const calls = [];
    const command = await copyWorkerSetup({sshTarget: 'peer@worker', file: '/tmp/s.sh',
      runCommand: async (...args) => calls.push(args)});
    assert.deepEqual(calls, [['scp', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=5',
      '-o', 'ServerAliveInterval=5', '-o', 'ServerAliveCountMax=2',
      '/tmp/s.sh', `peer@worker:${WORKER_SETUP_FILE}`]]], 'bounded scp, nothing else');
    assert.equal(command, `ssh -t peer@worker bash ${WORKER_SETUP_FILE}`,
      'the owner runs it there, by hand');
    await assert.rejects(copyWorkerSetup({sshTarget: '-oProxyCommand=x', file: '/tmp/s.sh',
      runCommand: async () => assert.fail('never run')}), /begins with "-"/u);

    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'worker-provision-'));
    t.after(() => fs.rmSync(scratch, {recursive: true, force: true}));
    const output = path.join(scratch, 'setup.sh');
    const written = spawnSync(process.execPath, ['scripts/lab.js', 'provision', '--output', output],
      {encoding: 'utf8', env: {...gitProcessEnvironment(), LAGRANGE_LAB_HOME: scratch}});
    assert.equal(written.status, 0, written.stderr);
    assert.match(written.stdout, /copy it to the worker and run: bash lagrange-lab-worker-setup\.sh/u);
    assert.ok(fs.statSync(output).mode & 0o100, 'executable');
    assert.equal(spawnSync(bash(), ['-n', output]).status, 0);
    const both = spawnSync(process.execPath, ['scripts/lab.js', 'provision', '--output', output,
      '--copy', 'anything'], {encoding: 'utf8', env: {...gitProcessEnvironment(), LAGRANGE_LAB_HOME: scratch}});
    assert.notEqual(both.status, 0);
    assert.match(both.stderr, /--copy NAME or --output FILE, not both/u);
  });
