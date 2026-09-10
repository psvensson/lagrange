import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const UTF8 = 'utf8';
const ORCHESTRATOR = 'scripts/select-change-tests.js';
const RUNNER = 'scripts/run-classified-test-files.js';

function createChangeProofFixture({
  root,
  checkBaseEnvironment,
  workspaceInjectionEnvironment,
}) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'change-proof-'));
  const repo = path.join(workspace, 'repo');
  const sentinel = path.join(workspace, 'runner-invocation.json');
  const objectToJsonPollution = path.join(
    workspace, 'pollute-object-to-json.cjs');
  fs.writeFileSync(objectToJsonPollution,
    'Object.prototype.toJSON = function toJSON() {\n' +
    '  return Object.prototype.hasOwnProperty.call(this, \'packages\') ?\n' +
    '    {packages: {\'\': {}}} : {};\n' +
    '};\n', UTF8);

  function fixtureEnv({preload = null} = {}) {
    const env = {...process.env};
    delete env[checkBaseEnvironment];
    delete env[workspaceInjectionEnvironment];
    if (preload) {
      env.NODE_OPTIONS = [env.NODE_OPTIONS, `--require=${preload}`]
        .filter(Boolean).join(' ');
    }
    return env;
  }

  function git(args) {
    return execFileSync('git', args,
      {cwd: repo, encoding: UTF8, stdio: 'pipe'}).trim();
  }

  let fixtureBaseSha = null;

  function buildFixtureRepo() {
    fs.mkdirSync(path.join(repo, 'test'), {recursive: true});
    fs.cpSync(path.join(root, 'scripts'), path.join(repo, 'scripts'),
      {recursive: true});
    fs.cpSync(path.join(root, 'test/shards'), path.join(repo, 'test/shards'),
      {recursive: true});
    fs.copyFileSync(path.join(root, 'package.json'),
      path.join(repo, 'package.json'));
    fs.copyFileSync(path.join(root, 'package-lock.json'),
      path.join(repo, 'package-lock.json'));
    fs.writeFileSync(path.join(repo, RUNNER),
      'import fs from \'node:fs\';\n' +
      'export function runClassifiedTestFiles(files) {\n' +
      `  fs.writeFileSync(${JSON.stringify(sentinel)}, JSON.stringify(files));\n` +
      '  return 0;\n' +
      '}\n', UTF8);
    git(['init', '--quiet']);
    git(['config', 'user.email', 'fixture@example.invalid']);
    git(['config', 'user.name', 'fixture']);
    git(['add', '.']);
    git(['commit', '--quiet', '-m', 'base']);
    fixtureBaseSha = git(['rev-parse', 'HEAD']);
  }

  function writeChanges(changes) {
    for (const [relative, contents] of Object.entries(changes)) {
      const absolute = path.join(repo, relative);
      if (contents === null) {
        fs.rmSync(absolute, {force: true});
        continue;
      }
      fs.mkdirSync(path.dirname(absolute), {recursive: true});
      fs.writeFileSync(absolute, contents, UTF8);
    }
  }

  function restoreFixture() {
    git(['reset', '--hard', '--quiet', fixtureBaseSha]);
    git(['clean', '-fdq']);
  }

  function resultWithInvocation(result) {
    return {
      status: result.status,
      output: `${result.stdout}${result.stderr}`,
      invocation: fs.existsSync(sentinel) ?
        JSON.parse(fs.readFileSync(sentinel, UTF8)) : null,
    };
  }

  function proofFor(changes, {env = fixtureEnv()} = {}) {
    assert.ok(repo.startsWith(os.tmpdir()),
      'the fixture must never be a real checkout');
    fs.rmSync(sentinel, {force: true});
    writeChanges(changes);
    const result = spawnSync(process.execPath, [ORCHESTRATOR],
      {cwd: repo, encoding: UTF8, env});
    const proof = resultWithInvocation(result);
    restoreFixture();
    return proof;
  }

  function proofForCommittedAndWorkingChanges(committed, working) {
    assert.ok(repo.startsWith(os.tmpdir()),
      'the fixture must never be a real checkout');
    fs.rmSync(sentinel, {force: true});
    restoreFixture();
    writeChanges(committed);
    git(['add', '.']);
    git(['commit', '--quiet', '-m', 'committed range']);
    const committedHead = git(['rev-parse', 'HEAD']);
    writeChanges(working);
    const result = spawnSync(process.execPath, [
      ORCHESTRATOR,
      '--base', fixtureBaseSha,
      '--head', committedHead,
    ], {cwd: repo, encoding: UTF8, env: fixtureEnv()});
    const proof = resultWithInvocation(result);
    restoreFixture();
    return proof;
  }

  function proofFromCommittedBaseline(baselineChanges, workingChanges) {
    assert.ok(repo.startsWith(os.tmpdir()),
      'the fixture must never be a real checkout');
    fs.rmSync(sentinel, {force: true});
    restoreFixture();
    writeChanges(baselineChanges);
    git(['add', '.']);
    git(['commit', '--quiet', '-m', 'custom baseline']);
    writeChanges(workingChanges);
    const result = spawnSync(process.execPath, [ORCHESTRATOR],
      {cwd: repo, encoding: UTF8, env: fixtureEnv()});
    const proof = resultWithInvocation(result);
    restoreFixture();
    return proof;
  }

  buildFixtureRepo();
  return {
    fixtureEnv,
    objectToJsonPollution,
    proofFor,
    proofForCommittedAndWorkingChanges,
    proofFromCommittedBaseline,
    repo,
    restoreFixture,
    writeChanges,
  };
}

export {createChangeProofFixture};
