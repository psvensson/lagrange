// D19/D15/D12/D22: static census of the deployer and runner sources. The
// strings below weakened host security, fabricated identities or labelled
// claims that were never observed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
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
