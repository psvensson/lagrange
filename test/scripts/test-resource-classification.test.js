import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';

import {
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

// The file every blocking lane deliberately re-homes: it runs serially in
// test:aggregate-sensitive-pregate, so the fast lane excludes it by name.
const AGGREGATE_SENSITIVE =
  'test/distributed/harness/__tests__/comparative-efficiency-claim-projection.test.js';

const PRIMARY_UNIT = 'unit';
const PRIMARY_PACKAGING = 'packaging';
const PRIMARY_INTEGRATION = 'integration';
// Directories the push gate has never run: their lanes execute on a v* tag.
const TAG_ONLY_PREFIXES = Object.freeze(['test/integration/', 'test/bootstrap/']);
const SHARD_LANES = Object.freeze([
  'integration-1', 'integration-2', 'integration-3',
  'bootstrap-1', 'bootstrap-2', 'convergence-probes',
]);

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

// Lane membership alone proves nothing: a file can be "in a lane" that no gate
// ever executes. That is exactly what happened when the 14 integration-classified
// files outside test/integration/ were moved into the shard lanes — those lanes
// are reachable only from release.yml on a v* tag, so the files silently stopped
// running on every push, PR and nightly while still looking placed. These tests
// therefore assert two DIFFERENT things: that nothing is unplaced, and that
// everything the push gate used to run is still run by the push gate.

// The lanes npm run test:fast actually executes, which is the only thing the
// postpush manifest (and therefore the hosted ci workflow and the pre-push hook)
// runs. Keep in sync with package.json's test:fast chain.
function pushGateLanes() {
  return {
    'test:aggregate-sensitive-pregate': [AGGREGATE_SENSITIVE],
    'test:fast:integration': planLane(root, {
      excludePrefix: new Set(TAG_ONLY_PREFIXES),
      exclude: new Set(),
      primary: new Set([PRIMARY_INTEGRATION]),
      resource: new Set(),
    }),
    'test:fast:ordinary': planLane(root, {
      exclude: new Set([AGGREGATE_SENSITIVE]),
      primary: new Set([PRIMARY_UNIT, PRIMARY_PACKAGING]),
      resource: new Set([RESOURCE_CLASS_ORDINARY]),
    }),
    'test:fast:toolchain': planLane(root, {
      exclude: new Set(),
      primary: new Set([PRIMARY_UNIT, PRIMARY_PACKAGING]),
      resource: new Set([RESOURCE_CLASS_EXTERNAL_TOOLCHAIN]),
    }),
  };
}

test('no test file is left out of every execution lane', () => {
  const primary = derivePrimaryClasses(root).classes;
  const placed = new Set();
  for (const files of Object.values(pushGateLanes())) {
    for (const file of files) placed.add(file);
  }
  for (const shard of SHARD_LANES) {
    for (const file of readShardLines(`test/shards/${shard}.txt`)) {
      placed.add(file);
    }
  }
  const unplaced = Object.keys(primary).filter((file) => !placed.has(file));
  assert.deepEqual(unplaced, [],
    'these test files are in no execution lane and would never run');
  const stray = [...placed].filter((file) => primary[file] === undefined);
  assert.deepEqual(stray, [],
    'these lane entries are not in the live test census');
});

test('the push-gate lanes never run the same file twice', () => {
  const lanes = new Map();
  for (const [lane, files] of Object.entries(pushGateLanes())) {
    for (const file of files) {
      const previous = lanes.get(file);
      assert.equal(previous, undefined,
        `${file} is run by both ${previous} and ${lane}`);
      lanes.set(file, lane);
    }
  }
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
  const pushGated = new Set();
  for (const files of Object.values(pushGateLanes())) {
    for (const file of files) pushGated.add(file);
  }
  const dropped = previouslyGated.filter((file) => !pushGated.has(file));
  assert.deepEqual(dropped, [],
    'these files ran on every push before the lane split and would now run ' +
    'only on a v* tag, so a hosted gate could turn green by not running them');
});

// pushGateLanes() mirrors package.json's filters, so on its own it would keep
// passing even if a lane were deleted from the test:fast chain — the same
// "decorative constant" trap as a job count nothing reads. Bind the mirror to
// the real commands: the chain must invoke every lane, each lane must select
// with the filters modelled above, and each lane's job count must be the one
// its resource class declares in RESOURCE_CLASS_JOBS.
test('the test:fast chain really runs each modelled lane, at its declared jobs',
  () => {
    const scripts = JSON.parse(
      fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts;
    const chain = scripts['test:fast'];
    const expectedFlags = {
      'test:fast:integration': ['--primary integration', '--exclude-prefix'],
      'test:fast:ordinary': ['--primary unit,packaging', '--resource ordinary'],
      'test:fast:toolchain':
        ['--primary unit,packaging', '--resource external-toolchain'],
    };
    const expectedJobs = {
      'test:fast:integration': RESOURCE_CLASS_JOBS[RESOURCE_CLASS_EXCLUSIVE],
      'test:fast:ordinary': RESOURCE_CLASS_JOBS[RESOURCE_CLASS_ORDINARY],
      'test:fast:toolchain':
        RESOURCE_CLASS_JOBS[RESOURCE_CLASS_EXTERNAL_TOOLCHAIN],
    };
    for (const lane of Object.keys(expectedFlags)) {
      assert.ok(chain.includes(lane),
        `test:fast must invoke ${lane}; a modelled lane that the chain does ` +
        'not run is a silent coverage hole');
      const command = scripts[lane];
      assert.ok(typeof command === 'string' && command.length > 0,
        `${lane} must exist as a script`);
      for (const flag of expectedFlags[lane]) {
        assert.ok(command.includes(flag),
          `${lane} must select with ${flag} to match the modelled lane`);
      }
      assert.ok(command.includes(`--jobs=${expectedJobs[lane]}`),
        `${lane} must run at --jobs=${expectedJobs[lane]}, the count its ` +
        'resource class declares');
    }
    assert.ok(scripts['test:aggregate-sensitive-pregate']
      .includes(AGGREGATE_SENSITIVE),
    'the aggregate-sensitive file must still have its own serial lane');
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
