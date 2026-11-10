// Isolated configuration controls; never comparative system measurements.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {configure, inspectInstallation, recover} from '../../scripts/agent-tooling/configuration.js';
import {loadProfile, sha256} from '../../scripts/agent-tooling/profile.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const {profile, digest} = loadProfile(REPO);
const CONFIG = '.codex/config.toml';
const PROJECT = '.serena/project.yml';
const HOME_CONFIG = '.codex/quest-tooling/serena-home/serena_config.yml';
const RESOURCES = {[PROJECT]: 'project test bytes\n', [HOME_CONFIG]: 'private test bytes\n'};
const VALIDATE = () => {};

function root(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quest-tooling-config-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  return fs.realpathSync(dir);
}

function write(dir, file, bytes) {
  fs.mkdirSync(path.dirname(path.join(dir, file)), {recursive: true});
  fs.writeFileSync(path.join(dir, file), bytes);
}

test('setup twice and removal preserve unrelated settings byte for byte', (t) => {
  for (const original of ['', '# unrelated\n', 'model = "existing"']) {
    const dir = root(t);
    write(dir, CONFIG, original);
    assert.equal(configure(dir, profile, digest, 'setup', RESOURCES, VALIDATE).status, 'installed');
    const first = fs.readFileSync(path.join(dir, CONFIG));
    assert.equal(configure(dir, profile, digest, 'setup', RESOURCES, VALIDATE).status, 'unchanged');
    assert.deepEqual(fs.readFileSync(path.join(dir, CONFIG)), first);
    assert.equal(configure(dir, profile, digest, 'remove').status, 'removed');
    assert.equal(fs.readFileSync(path.join(dir, CONFIG), 'utf8'), original);
    assert.equal(fs.existsSync(path.join(dir, PROJECT)), false);
  }
});

test('unknown configuration actions refuse before creating owned resources', (t) => {
  const dir = root(t);
  assert.throws(() => configure(dir, profile, digest, 'setpu', RESOURCES, VALIDATE),
    /configuration_action_invalid/u);
  assert.deepEqual(fs.readdirSync(dir), []);
});

test('altered owned content refuses setup and removal without modifying it', (t) => {
  const dir = root(t);
  configure(dir, profile, digest, 'setup', RESOURCES, VALIDATE);
  write(dir, PROJECT, 'user change');
  for (const action of ['setup', 'upgrade', 'remove']) {
    assert.throws(() => configure(dir, profile, digest, action, RESOURCES, VALIDATE),
      /configuration_drift/u);
  }
  assert.equal(fs.readFileSync(path.join(dir, PROJECT), 'utf8'), 'user change');
});

test('an existing server or project config is a collision, never adopted', (t) => {
  const dir = root(t);
  const original = '[mcp_servers.quest_serena]\ncommand = "user-server"\n';
  write(dir, CONFIG, original);
  assert.throws(() => configure(dir, profile, digest, 'setup', RESOURCES, VALIDATE), /collision/u);
  assert.equal(fs.readFileSync(path.join(dir, CONFIG), 'utf8'), original);
  const other = root(t);
  write(other, PROJECT, 'unrelated project settings');
  assert.throws(() => configure(other, profile, digest, 'setup', RESOURCES, VALIDATE), /collision/u);
});

test('host validation failure stays unavailable and recovery restores original bytes', (t) => {
  const dir = root(t);
  const original = '# keep this\n';
  write(dir, CONFIG, original);
  assert.throws(() => configure(dir, profile, digest, 'setup', RESOURCES,
    () => {
      throw new Error('real validator would reject');
    }), /validator would reject/u);
  assert.throws(() => inspectInstallation(dir), /setup_interrupted/u);
  assert.equal(recover(dir).status, 'recovered-original-configuration');
  assert.equal(fs.readFileSync(path.join(dir, CONFIG), 'utf8'), original);
  assert.equal(inspectInstallation(dir).state, null);
});

test('recovery refuses intervening user edits and leaves them untouched', (t) => {
  const dir = root(t);
  assert.throws(() => configure(dir, profile, digest, 'setup', RESOURCES,
    () => {
      throw new Error('interrupted');
    }), /interrupted/u);
  write(dir, CONFIG, 'new user content');
  assert.throws(() => recover(dir), /recovery_conflict/u);
  assert.equal(fs.readFileSync(path.join(dir, CONFIG), 'utf8'), 'new user content');
});

test('changed pins require explicit upgrade and retain a single active configuration', (t) => {
  const dir = root(t);
  configure(dir, profile, digest, 'setup', RESOURCES, VALIDATE);
  const changed = structuredClone(profile);
  changed.servers.quest_serena.toolTimeoutSeconds += 1;
  const next = sha256(JSON.stringify(changed));
  assert.throws(() => configure(dir, changed, next, 'setup', RESOURCES, VALIDATE), /profile_changed/u);
  assert.equal(configure(dir, changed, next, 'upgrade', RESOURCES, VALIDATE).status, 'upgraded');
  assert.equal(inspectInstallation(dir).state.profileDigest, next);
  assert.equal(fs.readFileSync(path.join(dir, CONFIG), 'utf8')
    .split('[mcp_servers.quest_serena]').length, 2);
});

test('symlinked configuration is refused before writes', (t) => {
  const dir = root(t);
  const other = root(t);
  write(other, 'config.toml', 'unrelated');
  fs.mkdirSync(path.join(dir, '.codex'));
  fs.symlinkSync(path.join(other, 'config.toml'), path.join(dir, CONFIG));
  assert.throws(() => configure(dir, profile, digest, 'setup', RESOURCES, VALIDATE), /unsafe/u);
  assert.equal(fs.readFileSync(path.join(other, 'config.toml'), 'utf8'), 'unrelated');
});

test('the actual CLI refuses a runtime path escape before any installation writes', (t) => {
  const dir = root(t);
  const outside = root(t);
  for (const file of ['AGENTS.md', 'docs/steering/rules.md', 'docs/steering/router.md',
    'scripts/agent-tooling/profile.json']) write(dir, file, fs.readFileSync(path.join(REPO, file)));
  write(outside, 'sentinel.txt', 'owned by another project');
  fs.mkdirSync(path.join(dir, '.codex/quest-tooling'), {recursive: true});
  fs.symlinkSync(outside, path.join(dir, '.codex/quest-tooling/context7'));
  const run = spawnSync(process.execPath, [path.join(REPO, 'scripts/agent-tooling/cli.js'), 'setup'],
    {cwd: dir, encoding: 'utf8'});
  assert.equal(run.status, 1);
  assert.match(run.stderr, /tooling_unsafe_path/u);
  assert.deepEqual(fs.readdirSync(outside), ['sentinel.txt']);
  assert.equal(fs.readFileSync(path.join(outside, 'sentinel.txt'), 'utf8'), 'owned by another project');
  assert.equal(fs.existsSync(path.join(dir, '.codex/quest-tooling/lifecycle.lock')), false);
});

test('Serena local overrides and inline TOML collisions remain user-owned and refused', (t) => {
  const dir = root(t);
  write(dir, '.serena/project.local.yml', 'read_only: false\n');
  assert.throws(() => configure(dir, profile, digest, 'setup', RESOURCES, VALIDATE),
    /unmanaged_serena_override/u);
  assert.equal(fs.readFileSync(path.join(dir, '.serena/project.local.yml'), 'utf8'), 'read_only: false\n');
  const other = root(t);
  write(other, CONFIG, 'mcp_servers = { quest_serena = { command = "user" } }\n');
  assert.throws(() => configure(other, profile, digest, 'setup', RESOURCES, VALIDATE), /collision/u);
  assert.equal(fs.existsSync(path.join(other, '.serena')), false);
});
