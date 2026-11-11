import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';

import {
  PRIMARY_CLASS_BOOTSTRAP,
  derivePrimaryClasses,
} from '../../scripts/checks/test-primary-classification.js';
import {
  buildResourceManifest,
  deriveHostRequirements,
  deriveResourceClasses,
  verifyResourceManifest,
} from '../../scripts/checks/test-resource-classification.js';
import {
  HOST_REQUIREMENTS,
  HOST_REQUIREMENT_LOOPBACK_REFUSAL,
  HOST_REQUIREMENT_SHARD_PATHS,
  RESOURCE_CLASSES,
  RESOURCE_CLASS_EXCLUSIVE,
  RESOURCE_CLASS_EXTERNAL_TOOLCHAIN,
  PLACED_ORDINARY_LANE_JOBS_ENV,
  RESOURCE_CLASS_JOBS,
  RESOURCE_CLASS_MANIFEST_PATH,
  RESOURCE_CLASS_ORDINARY,
  THERMAL_SOURCE_MEASURED,
  placedOrdinaryLaneJobs,
  placedOrdinaryLaneJobsShell,
} from '../../scripts/checks/test-resource-classification-constants.js';
import {planLane} from '../../scripts/plan-test-lane.js';
import {hostRequirementsOf} from '../../scripts/run-classified-test-files.js';

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

// The 0.5 WASI service tests compile real Hono/service components
// (componentize-js, jco) and start real component Cells, like their
// external-toolchain siblings service-cell-worker-modes and
// service-cell-bridge-roundtrip. Measured 2026-11-02: at jobs=4 pinned to two
// cores, 3 of 4 failed (quest service-test-toolchain-classification).
const WASI_SERVICE_TOOLCHAIN_TESTS = Object.freeze([
  'test/service/h1-pinned-hono-component-proof.test.js',
  'test/service/h2-hono-source-ir-deployment-cutover.test.js',
  'test/service/h3-fetch-ingress-and-scoped-client.test.js',
  'test/service/h4-http-invocation-recovery-and-cancellation.test.js',
  'test/service/h5-compiled-public-hono-journey.test.js',
  'test/service/q2-call-selector-typed-parameter-narrowing.test.js',
  'test/service/q3-call-shard-paged-execution.test.js',
  'test/service/q4-call-bounded-structured-partials.test.js',
  'test/service/q5-service-cell-v2-default-multi-operation.test.js',
]);

test('the 0.5 WASI service tests run in the serial toolchain lane', () => {
  const manifest = buildResourceManifest(root);
  for (const file of WASI_SERVICE_TOOLCHAIN_TESTS) {
    assert.equal(manifest.classes[file], RESOURCE_CLASS_EXTERNAL_TOOLCHAIN,
      `${file} drives the WASM toolchain and starts real component Cells`);
  }
});

// A placed lab host's ordinary lane: two thirds of its processors, between
// the lane's own count and eight, at most one per whole GiB, within its cap.
const GIB_KIB = 1024 * 1024;
const MEASURED = THERMAL_SOURCE_MEASURED;
const PLACED_ORDINARY_TABLE = Object.freeze([
  // [cores, memKiB, thermal, expected, why]
  [12, Math.round(15.4 * GIB_KIB), MEASURED, 8, 'a 12-thread 15 GiB host: two thirds, 8'],
  [12, Math.round(7.5 * GIB_KIB), MEASURED, 7, 'a 12-thread 7.5 GiB host: one per whole GiB'],
  [8, Math.round(15.5 * GIB_KIB), MEASURED, 5, 'an 8-thread host: two thirds of 8'],
  [4, Math.round(15.6 * GIB_KIB), MEASURED, 3, 'a 4-thread host: its cap, as today'],
  [20, 32 * GIB_KIB, MEASURED, 8, 'never past eight'],
  [6, 16 * GIB_KIB, MEASURED, 4, 'two thirds below the lane\'s own count: its own count'],
  [12, 3 * GIB_KIB, MEASURED, 4, 'memory never lowers below the lane\'s own count'],
  [12, null, MEASURED, 4, 'unreadable memory: no raise'],
  [12, 16 * GIB_KIB, 'unmeasurable', 4, 'no thermal source: no raise the gate cannot hold'],
  [12, 16 * GIB_KIB, null, 4, 'unknown thermal: no raise'],
  [2, 16 * GIB_KIB, MEASURED, 1, 'a two-thread host: its cap of one'],
  [1, 16 * GIB_KIB, MEASURED, 1, 'a one-thread host: one'],
  [null, 16 * GIB_KIB, MEASURED, null, 'unknown processors: nothing set'],
  [0, 16 * GIB_KIB, MEASURED, null, 'zero processors is unknown'],
]);

test('a placed host raises its ordinary lane by one rule, never past cores less one', () => {
  for (const [cores, memKiB, thermal, expected, why] of PLACED_ORDINARY_TABLE) {
    assert.equal(placedOrdinaryLaneJobs({cores, memKiB, thermal}), expected, why);
  }
  assert.equal(RESOURCE_CLASS_JOBS[RESOURCE_CLASS_ORDINARY], 4,
    'the unplaced ordinary lane - the controller, CI, any local run - is unchanged');
});

// The placement shell computes the count on the host; the planner prices the
// host with the JS rule. The generated shell, run with stubbed facts, must
// say exactly what the function says, so the split matches what runs.
test('the placement shell\'s generated arithmetic equals the planner\'s rule', () => {
  const snippet = placedOrdinaryLaneJobsShell().join('\n');
  const cases = [...PLACED_ORDINARY_TABLE,
    // Shapes only the shell can receive: what getconf or awk print.
    ['', 16 * GIB_KIB, MEASURED, null, 'empty processors'],
    ['12x', 16 * GIB_KIB, MEASURED, null, 'garbled processors'],
    [12, '', MEASURED, 4, 'empty memory'],
    [12, '16x', MEASURED, 4, 'garbled memory'],
    [12, 0, MEASURED, 4, 'zero memory'],
  ];
  const script = cases.map(([cores, memKiB, thermal]) =>
    `cores='${cores ?? ''}' mem_kib='${memKiB ?? ''}' thermal='${thermal ?? ''}'\n` +
    `${snippet}\nprintf '%s\\n' "\${${PLACED_ORDINARY_LANE_JOBS_ENV}-unset}"`).join('\n');
  const ran = spawnSync('sh', ['-c', script], {encoding: 'utf8', env: {PATH: process.env.PATH}});
  assert.equal(ran.status, 0, ran.stderr);
  const said = ran.stdout.trim().split('\n');
  assert.equal(said.length, cases.length, ran.stdout);
  cases.forEach(([cores, memKiB, thermal, expected, why], index) => {
    const js = typeof cores === 'number' || cores === null ?
      placedOrdinaryLaneJobs({cores, memKiB: typeof memKiB === 'number' ? memKiB : null,
        thermal}) : null;
    assert.equal(js, expected, `the function: ${why}`);
    assert.equal(said[index], expected === null ? 'unset' : String(expected), `the shell: ${why}`);
  });
});

// Host requirements: the third dimension, a property of the machine a test's
// assertions are only true on. Each has its curated list, naming live tests.
test('every host requirement has a curated list of live tests', () => {
  const {requirements, problems} = deriveHostRequirements(root);
  assert.deepEqual(problems, []);
  for (const requirement of HOST_REQUIREMENTS) {
    assert.ok(fs.existsSync(path.join(root, HOST_REQUIREMENT_SHARD_PATHS[requirement])),
      `${requirement} has its list`);
  }
  assert.deepEqual(Object.keys(requirements).filter((file) =>
    requirements[file].includes(HOST_REQUIREMENT_LOOPBACK_REFUSAL)).sort(), [
    'test/bootstrap/fresh-seed-activation.integration.test.js',
    'test/bootstrap/seed-startup-listener-failure.integration.test.js',
  ]);
  assert.deepEqual(hostRequirementsOf(root), requirements, 'placement reads the same record');
});

test('a host requirement list naming no live test is refused, never dropped', (t) => {
  const scratch = fs.mkdtempSync(path.join(root, 'test-output', 'host-requirement-'));
  t.after(() => fs.rmSync(scratch, {recursive: true, force: true}));
  fs.mkdirSync(path.join(scratch, 'test', 'shards'), {recursive: true});
  fs.writeFileSync(path.join(scratch, 'test', 'live.test.js'), '');
  const list = HOST_REQUIREMENT_SHARD_PATHS[HOST_REQUIREMENT_LOOPBACK_REFUSAL];
  fs.writeFileSync(path.join(scratch, list), '# comment\ntest/live.test.js\ntest/gone.test.js\n');
  const derived = deriveHostRequirements(scratch);
  assert.deepEqual(derived.requirements,
    {'test/live.test.js': [HOST_REQUIREMENT_LOOPBACK_REFUSAL]});
  assert.equal(derived.problems.length, 1);
  assert.match(derived.problems[0], /test\/gone\.test\.js/u);
  assert.throws(() => hostRequirementsOf(scratch), /test\/gone\.test\.js/u);
});
