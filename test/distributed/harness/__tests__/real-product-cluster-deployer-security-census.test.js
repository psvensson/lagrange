// D19/D15/D12/D22: static census of the deployer and runner sources. The
// strings below weakened host security, fabricated identities or labelled
// claims that were never observed.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {
  arrayFilter,
  arrayMap,
  stringEndsWith,
} from '../real-product-captured-intrinsics.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const HARNESS = 'test/distributed/harness';

function censusFiles() {
  const names = arrayFilter(fs.readdirSync(path.join(ROOT, HARNESS)), (name) =>
    /^(real-product-|comparative-benchmark-)/u.test(name) && stringEndsWith(name, '.js'));
  const harness = arrayMap(names, (name) => `${HARNESS}/${name}`);
  return ['docs/benchmarks/cloud/run-comparative-benchmarks.mjs',
    'docs/benchmarks/cloud/provision-gcp.sh', ...harness];
}

function offenders(pattern) {
  return arrayFilter(censusFiles(), (file) =>
    pattern.test(fs.readFileSync(path.join(ROOT, file), 'utf8')));
}

const FORBIDDEN = Object.freeze([
  ['D19 world-writable docker socket', /chmod 666 \/var\/run\/docker\.sock/u],
  ['D19 docker group grant', /usermod -aG docker/u],
  ['D19 host key verification disabled', /StrictHostKeyChecking=no/u],
  ['D19 world-writable tree', /chmod -R 777/u],
  ['D19 PostgreSQL trust from anywhere', /0\.0\.0\.0\/0 trust/u],
  ['D15 label-hash dataset digest', /`dataset-\$\{/u],
  ['D15 label-hash plan digest', /`plan-\$\{/u],
  ['D12 unobserved move label', /liveMoveActive/u],
  ['D12 unobserved partition label', /partitionCount: pCount/u],
  ['D22 concurrency varied with RTT', /hopMult/u],
  ['D10 fixed recovery timing', /12\.5|measuredRecoveryMs: 4\.2/u],
]);

for (const [name, pattern] of FORBIDDEN) {
  test(`census: ${name} appears in no deployer/runner source`, () => {
    assert.deepEqual(offenders(pattern), []);
  });
}

test('census: the files under census exist', () => {
  assert.ok(censusFiles().length >= 3);
  for (const file of censusFiles()) assert.ok(fs.existsSync(path.join(ROOT, file)), file);
});

// F4: every cloud provisioning script, by census of its shell text. SSH is
// never opened to the whole internet: a script that opens port 22 takes its
// source only from the required --ssh-cidr argument (no default), and refuses
// to run, before any cloud CLI is invoked, without one or with a /0 network.
const CLOUD_DIR = 'docs/benchmarks/cloud';
const OPENS_SSH = /--port 22\b|--destination-port-ranges 22\b|tcp:22\b/u;
const SSH_SOURCE_FROM_ARGUMENT = /(--cidr|--source-address-prefixes|--source-ranges)[ =]"\$\{SSH_CIDR\}"/u;

function provisioningScripts() {
  return arrayMap(arrayFilter(fs.readdirSync(path.join(ROOT, CLOUD_DIR)),
    (name) => /^provision-.*\.sh$/u.test(name)), (name) => `${CLOUD_DIR}/${name}`);
}

function scriptText(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

test('F4 census: no provisioning script names the whole internet as an ingress source',
  () => {
    assert.ok(provisioningScripts().length >= 3);
    assert.deepEqual(arrayFilter(provisioningScripts(),
      (file) => /0\.0\.0\.0\/0|::\/0/u.test(scriptText(file))), []);
  });

test('F4 census: a script that opens SSH takes the source only from --ssh-cidr', () => {
  const opensSsh = arrayFilter(provisioningScripts(), (file) => OPENS_SSH.test(scriptText(file)));
  assert.deepEqual(opensSsh, [`${CLOUD_DIR}/provision-aws.sh`,
    `${CLOUD_DIR}/provision-azure.sh`]);
  for (const file of opensSsh) {
    assert.match(scriptText(file), SSH_SOURCE_FROM_ARGUMENT, file);
    assert.doesNotMatch(scriptText(file), /SSH_CIDR="\$\{SSH_CIDR:-/u,
      `${file}: --ssh-cidr has no default`);
  }
});

test('F4: a script that opens SSH refuses to run without a usable --ssh-cidr, before ' +
  'any cloud CLI is invoked', (t) => {
  const stubs = fs.mkdtempSync(path.join(os.tmpdir(), 'provision-stubs-'));
  t.after(() => fs.rmSync(stubs, {recursive: true, force: true}));
  const invoked = path.join(stubs, 'invoked.log');
  for (const cli of ['aws', 'az', 'gcloud']) {
    fs.writeFileSync(path.join(stubs, cli),
      `#!/bin/sh\necho "${cli} $*" >> "${invoked}"\nexit 1\n`, {mode: 0o755});
  }
  const env = {PATH: `${stubs}:/usr/bin:/bin`, KEY_NAME: 'bench-key'};
  for (const file of arrayFilter(provisioningScripts(),
    (name) => OPENS_SSH.test(scriptText(name)))) {
    for (const args of [[], ['--ssh-cidr'], ['--ssh-cidr', '0.0.0.0/0'],
      ['--ssh-cidr', '203.0.113.7']]) {
      const run = spawnSync('bash', [path.join(ROOT, file), ...args], {env, encoding: 'utf8'});
      assert.equal(run.status, 2, `${file} ${args.join(' ')}: ${run.stderr}`);
      assert.match(run.stderr, /--ssh-cidr/u, `${file} ${args.join(' ')}`);
    }
  }
  assert.equal(fs.existsSync(invoked), false, 'no cloud CLI was invoked');
});
