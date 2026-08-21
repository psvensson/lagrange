import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';

import {
  PRIMARY_CLASS_BOOTSTRAP,
  derivePrimaryClasses,
} from '../../scripts/checks/test-primary-classification.js';
import {
  buildResourceManifest,
  deriveResourceClasses,
  verifyResourceManifest,
} from '../../scripts/checks/test-resource-classification.js';
import {
  RESOURCE_CLASSES,
  RESOURCE_CLASS_EXCLUSIVE,
  RESOURCE_CLASS_EXTERNAL_TOOLCHAIN,
  RESOURCE_CLASS_JOBS,
  RESOURCE_CLASS_MANIFEST_PATH,
  RESOURCE_CLASS_ORDINARY,
} from '../../scripts/checks/test-resource-classification-constants.js';
import {planLane} from '../../scripts/plan-test-lane.js';

const root = process.cwd();

const AGGREGATE_SENSITIVE =
  'test/distributed/harness/__tests__/comparative-efficiency-claim-projection.test.js';

const PRIMARY_UNIT = 'unit';
const PRIMARY_PACKAGING = 'packaging';
const PRIMARY_INTEGRATION = 'integration';
// Directories the push gate has never run: their lanes execute on a v* tag.
const TAG_ONLY_PREFIXES = Object.freeze(['test/integration/', 'test/bootstrap/']);
const CONVERGENCE_PROBES_SHARD = 'test/shards/convergence-probes.txt';

function readShardLines(relativePath) {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) return [];
  return fs.readFileSync(absolute, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

test('every test file has exactly one resource class', () => {
  const {census, classes, problems} = deriveResourceClasses(root);
  assert.deepEqual(problems, [],
    'deriving resource classes must report no integrity problems');
  for (const testPath of census) {
    const assigned = classes[testPath];
    assert.ok(assigned !== undefined,
      `${testPath} has no resource class`);
    assert.ok(RESOURCE_CLASSES.includes(assigned),
      `${testPath} has unknown resource class ${assigned}`);
  }
  assert.equal(Object.keys(classes).length, census.length,
    'the manifest assigns exactly one class per census file, no more');
});

test('the committed resource manifest matches the live census', () => {
  const verdict = verifyResourceManifest(root, RESOURCE_CLASS_MANIFEST_PATH);
  assert.deepEqual(verdict.problems, [],
    'committed resource manifest must not drift from the filesystem census; ' +
    'regenerate with node scripts/generate-test-resource-classes.js');
  assert.equal(verdict.ok, true);
});

test('no path is claimed by two curated resource shards', () => {
  const seen = new Map();
  for (const resourceClass of RESOURCE_CLASSES) {
    if (resourceClass === RESOURCE_CLASS_ORDINARY) continue;
    for (const line of readShardLines(
      `test/shards/resource-${resourceClass}.txt`)) {
      const previous = seen.get(line);
      assert.equal(previous, undefined,
        `${line} is claimed by both ${previous} and ${resourceClass}`);
      seen.set(line, resourceClass);
    }
  }
});

function pushGateFiles() {
  return planLane(root, {
    excludePrefix: new Set(TAG_ONLY_PREFIXES),
    exclude: new Set(),
    primary: new Set([PRIMARY_UNIT, PRIMARY_PACKAGING, PRIMARY_INTEGRATION]),
    resource: new Set(),
  });
}

function releaseGateFiles() {
  return planLane(root, {
    excludePrefix: new Set(),
    exclude: new Set(),
    primary: new Set([
      PRIMARY_UNIT,
      PRIMARY_PACKAGING,
      PRIMARY_INTEGRATION,
      PRIMARY_CLASS_BOOTSTRAP,
    ]),
    resource: new Set(),
  });
}

test('no test file is left out of every execution lane', () => {
  const primary = derivePrimaryClasses(root).classes;
  const placed = new Set(releaseGateFiles());
  for (const file of readShardLines(CONVERGENCE_PROBES_SHARD)) placed.add(file);
  const unplaced = Object.keys(primary).filter((file) => !placed.has(file));
  assert.deepEqual(unplaced, [],
    'these test files are in no execution lane and would never run');
  const stray = [...placed].filter((file) => primary[file] === undefined);
  assert.deepEqual(stray, [],
    'these lane entries are not in the live test census');
});

test('the push-gate plan contains every file exactly once', () => {
  const files = pushGateFiles();
  assert.equal(new Set(files).size, files.length);
});

// The regression guard for the defect above. It reconstructs what the PREVIOUS
// glob-based test:fast selected — everything except test/integration/,
// test/bootstrap/ and the aggregate-sensitive file — and requires the push gate
// to still run all of it. Splitting test:fast into lanes must never be a way to
// quietly shrink what a push actually verifies.
test('the push gate still runs everything the old glob ran', () => {
  const primary = derivePrimaryClasses(root).classes;
  const previouslyGated = Object.keys(primary).filter((file) =>
    !TAG_ONLY_PREFIXES.some((prefix) => file.startsWith(prefix)));
  const pushGated = new Set(pushGateFiles());
  const dropped = previouslyGated.filter((file) => !pushGated.has(file));
  assert.deepEqual(dropped, [],
    'these files ran on every push before the lane split and would now run ' +
    'only on a v* tag, so a hosted gate could turn green by not running them');
});

test('fast and release plans both execute through the one classified owner',
  () => {
    const scripts = JSON.parse(
      fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts;
    assert.match(scripts['test:fast'],
      /run-classified-test-files.*--primary unit,packaging,integration/u);
    assert.match(scripts['test:all'],
      /run-classified-test-files.*--primary unit,packaging,integration,bootstrap/u);
    assert.equal(scripts['test:fast:ordinary'], undefined);
    assert.equal(scripts['test:fast:toolchain'], undefined);
    assert.equal(scripts['test:fast:integration'], undefined);
    assert.equal(scripts['test:aggregate-sensitive-pregate'], undefined);
  });

test('aggregate-sensitive work is an exclusive resource, not a special command',
  () => {
    const manifest = buildResourceManifest(root);
    assert.equal(manifest.classes[AGGREGATE_SENSITIVE],
      RESOURCE_CLASS_EXCLUSIVE);
    assert.ok(pushGateFiles().includes(AGGREGATE_SENSITIVE));
  });

test('the toolchain lane runs serially and is not empty', () => {
  assert.equal(RESOURCE_CLASS_JOBS[RESOURCE_CLASS_EXTERNAL_TOOLCHAIN], 1,
    'external-toolchain must run at jobs=1: one such test can itself consume ' +
    '~3.7 cores, so even jobs=2 can co-schedule two internally parallel ' +
    'workloads on a 2-vCPU runner');
  assert.ok(
    RESOURCE_CLASS_JOBS[RESOURCE_CLASS_ORDINARY] >
      RESOURCE_CLASS_JOBS[RESOURCE_CLASS_EXTERNAL_TOOLCHAIN],
    'ordinary tests must stay more parallel than toolchain tests, so the ' +
    'repair does not globally serialize the suite');
  const manifest = buildResourceManifest(root);
  assert.ok(manifest.counts[RESOURCE_CLASS_EXTERNAL_TOOLCHAIN] > 0,
    'an empty toolchain class would mean the lane silently tests nothing');
});
