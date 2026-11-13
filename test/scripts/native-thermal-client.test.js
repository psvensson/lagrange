import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {
  HEADROOM, THERMAL_DEADLINE_ENV, TEST_EXECUTION_CONTEXT_ENV, checkedThermalObservation,
  executionContext, readThermalHeadroom, thermalPermits, waitForThermalHeadroom,
} from '../../scripts/checks/wait-for-thermal-headroom.js';
import {runTestFiles} from '../../scripts/run-test-files.js';
import {BATCH_PREVIOUS_CLOSE_ENV, runAdmittedTestFiles}
  from '../../scripts/test-file-admission.js';
import {setTimeout as delay} from 'node:timers/promises';
import {nativeThermalFixture} from './native-thermal-fixture.js';

const BOUND_MS = 10000;

test('missing or changed endpoint never acquires operator policy', async (t) => {
  const absent = await readThermalHeadroom({env: {}});
  assert.equal(absent.outcome, HEADROOM.UNAVAILABLE);
  assert.equal(absent.execution_policy, null);
  const native = nativeThermalFixture(t, {outcomes: ['UNAVAILABLE'],
    policy: {mode: 'operator-paced', cadence_ms: 5000, max_concurrency: 1}});
  fs.appendFileSync(native.entry, '\n# changed after binding\n');
  const changed = await readThermalHeadroom({env: native.env});
  assert.equal(changed.outcome, HEADROOM.UNAVAILABLE);
  assert.equal(changed.execution_policy, null);
  assert.equal(fs.existsSync(native.counter), false, 'changed source was never invoked');
});

test('required sensors refuse absence while explicit operator policy reports unmeasured',
  async (t) => {
    const required = nativeThermalFixture(t, {outcomes: ['UNAVAILABLE']});
    const result = await readThermalHeadroom({env: required.env});
    assert.equal(result.outcome, HEADROOM.UNAVAILABLE);
    assert.equal(thermalPermits(result), false);
    const operator = nativeThermalFixture(t, {outcomes: ['UNAVAILABLE'],
      policy: {mode: 'operator-paced', cadence_ms: 5000, max_concurrency: 1}});
    const paced = await readThermalHeadroom({env: operator.env});
    assert.equal(paced.outcome, HEADROOM.OPERATOR_PACED);
    assert.equal(paced.observation_outcome, HEADROOM.UNAVAILABLE);
    assert.equal(paced.observations, null);
    assert.equal(thermalPermits(paced), true);
  });

test('wrong native boot, config, source, policy or exit cannot grant admission', async (t) => {
  const native = nativeThermalFixture(t);
  const valid = await readThermalHeadroom({env: native.env});
  assert.equal(valid.outcome, HEADROOM.READY);
  for (const [field, value] of [
    ['boot_id', 'other-boot'], ['source_sha256', '0'.repeat(64)],
    ['config_sha256', '0'.repeat(64)], ['execution_policy', null],
    ['observed_at', null],
  ]) {
    const invalid = checkedThermalObservation({...valid, [field]: value}, native.endpoint, 0);
    assert.equal(thermalPermits(invalid), false, field);
    assert.equal(invalid.execution_policy, null, field);
  }
  assert.equal(thermalPermits(checkedThermalObservation(valid, native.endpoint, 2)), false);
});

test('cancelled cooling and original deadline never start another observation', async () => {
  const controller = new AbortController();
  let reads = 0;
  const result = await waitForThermalHeadroom({deadline: performance.now() + BOUND_MS,
    signal: controller.signal,
    read: async () => { reads += 1; return {outcome: HEADROOM.HOLD}; },
    log() { controller.abort(); }});
  assert.equal(result.outcome, HEADROOM.EXHAUSTED);
  assert.equal(reads, 1);
  const expired = await waitForThermalHeadroom({deadline: performance.now() - 1,
    read: async () => { assert.fail('expired budget cannot invoke observer'); }});
  assert.equal(expired.outcome, HEADROOM.EXHAUSTED);
});

test('the actual child owns file-body context and nested fixtures do not pause', async (t) => {
  const native = nativeThermalFixture(t);
  const file = path.join(native.root, 'context.test.js');
  const seen = path.join(native.root, 'context.json');
  fs.writeFileSync(file, [
    "import {test} from 'node:test';",
    "import {writeFileSync} from 'node:fs';",
    `test('context', () => writeFileSync(${JSON.stringify(seen)},`,
    `  process.env.${TEST_EXECUTION_CONTEXT_ENV}));`,
  ].join('\n'));
  const originalEnv = JSON.stringify(native.env);
  const top = await runTestFiles([file], {print: false, env: native.env, cwd: native.root, write() {}});
  assert.equal(top.ok, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(seen, 'utf8')),
    {version: 1, phase: 'file-body', file});
  assert.equal(JSON.stringify(native.env), originalEnv);
  const enclosing = {version: 1, phase: 'file-body', file: '/enclosing/owned.test.js'};
  const nestedEnv = {...native.env, [TEST_EXECUTION_CONTEXT_ENV]: JSON.stringify(enclosing)};
  const nested = await runTestFiles([file], {print: false, env: nestedEnv, cwd: native.root,
    thermalRead: async () => assert.fail('nested fixture cannot acquire a new admission')});
  assert.equal(nested.ok, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(seen, 'utf8')), enclosing);
  assert.throws(() => executionContext({[TEST_EXECUTION_CONTEXT_ENV]: '{}'}),
    /invalid test execution context/u);
});

test('owned deadline expires during cadence even when a collaborator keeps reporting READY',
  {timeout: BOUND_MS}, async () => {
    const env = {[TEST_EXECUTION_CONTEXT_ENV]: undefined,
      [THERMAL_DEADLINE_ENV]: String(Date.now() + 20),
      [BATCH_PREVIOUS_CLOSE_ENV]: String(Date.now())};
    let reads = 0;
    const result = await runAdmittedTestFiles(['never-start'], {env, jobs: 1, write() {},
      thermalRead: async () => {
        reads += 1;
        await delay(40);
        return {outcome: HEADROOM.READY,
          execution_policy: {mode: 'sensor-required', cadence_ms: 5000, max_concurrency: 1}};
      }}, () => assert.fail('expired cadence cannot launch'));
    assert.equal(result.refusal.outcome, HEADROOM.EXHAUSTED);
    assert.equal(result.nextFileIndex, 0);
    assert.equal(reads, 1);
  });

test('a launch rejection retains closure of an already active child', async () => {
  const env = {[TEST_EXECUTION_CONTEXT_ENV]: JSON.stringify(
    {version: 1, phase: 'file-body', file: '/owned/enclosing.test.js'})};
  let closed = false;
  const first = {file: 'first', ok: false, assertions: 1};
  const result = await runAdmittedTestFiles(['first', 'rejected', 'unstarted'],
    {env, jobs: 2}, (file) => {
      if (file === 'rejected') return Promise.reject(new Error('launch rejected'));
      assert.equal(file, 'first');
      return delay(20).then(() => { closed = true; return first; });
    });
  assert.equal(closed, true);
  assert.deepEqual(result.results, [first]);
  assert.deepEqual(result.unresolved, ['rejected']);
  assert.equal(result.nextFileIndex, 2);
  assert.equal(result.refusal.reason, 'launch rejected');
});

test('cadence consumes a child closure that occurs during native observation',
  {timeout: BOUND_MS}, async () => {
    let closeFirst;
    const first = new Promise((resolve) => { closeFirst = resolve; });
    let reads = 0;
    let firstClosedAt;
    let secondStartedAt;
    const policy = {mode: 'sensor-required', cadence_ms: 5000, max_concurrency: 1};
    const env = {[TEST_EXECUTION_CONTEXT_ENV]: undefined,
      [THERMAL_DEADLINE_ENV]: String(Date.now() + BOUND_MS)};
    const result = await runAdmittedTestFiles(['first', 'second'], {env, jobs: 1, write() {},
      thermalRead: async () => {
        reads += 1;
        if (reads === 2) {
          firstClosedAt = performance.now();
          closeFirst({file: 'first', ok: true, assertions: 1});
          await first;
          // Allow the existing owner's result and final-close handlers to settle.
          await Promise.resolve();
        }
        return {outcome: HEADROOM.READY, execution_policy: policy};
      }}, (file) => {
      if (file === 'first') return first;
      secondStartedAt = performance.now();
      return Promise.resolve({file, ok: true, assertions: 1});
    });
    assert.equal(result.refusal, null);
    assert.equal(result.results.length, 2);
    assert.ok(secondStartedAt - firstClosedAt >= policy.cadence_ms,
      `next start after ${secondStartedAt - firstClosedAt}ms`);
  });
