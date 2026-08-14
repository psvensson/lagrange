import assert from 'node:assert';

import {test} from '../../../../src/test-helpers/tap.js';
import {createCluster} from './cluster-test-helpers.js';

const DEBUG_LOGS_ENV_KEY = 'LAGRANGE_DEBUG_LOGS';
const CAPTURE_LOGS_ENV_KEY = 'LAGRANGE_CAPTURE_LOGS';
const RAFT_SNAPSHOT_THRESHOLD_ENV_KEY = 'LAGRANGE_RAFT_SNAPSHOT_THRESHOLD';
const LOOP_GAP_PROFILE_ENV_KEY = 'LAGRANGE_LOOP_GAP_PROFILE';
const PUSH_ON_RED_ENV_KEY = 'LAGRANGE_PUSH_ON_RED';
const PUSH_SKIP_TESTS_ENV_KEY = 'LAGRANGE_PUSH_SKIP_TESTS';
const ARBITRARY_HOST_ENV_KEY = 'LAGRANGE_UNOWNED_TEST_CONTROL';
const arrayMap = Function.call.bind(Array.prototype.map);
const objectEntries = Object.entries;

function createTestCluster() {
  return createCluster({
    size: 1,
    docker: {socketPath: '/var/run/docker.sock', reuseContainers: true},
    image: 'distributed-db:test',
  });
}

test('node env forwards only explicitly owned LAGRANGE controls', async () => {
  const keys = [DEBUG_LOGS_ENV_KEY, CAPTURE_LOGS_ENV_KEY,
    RAFT_SNAPSHOT_THRESHOLD_ENV_KEY, LOOP_GAP_PROFILE_ENV_KEY,
    PUSH_ON_RED_ENV_KEY, PUSH_SKIP_TESTS_ENV_KEY, ARBITRARY_HOST_ENV_KEY];
  const original = new Map(arrayMap(keys, (key) => [key, process.env[key]]));
  try {
    process.env[DEBUG_LOGS_ENV_KEY] = 'true';
    process.env[CAPTURE_LOGS_ENV_KEY] = 'true';
    process.env[RAFT_SNAPSHOT_THRESHOLD_ENV_KEY] = '100';
    process.env[LOOP_GAP_PROFILE_ENV_KEY] = '1';
    process.env[PUSH_ON_RED_ENV_KEY] = '1';
    process.env[PUSH_SKIP_TESTS_ENV_KEY] = '1';
    process.env[ARBITRARY_HOST_ENV_KEY] = 'must-not-cross';
    const env = createTestCluster()._buildNodeEnv('n0', 'container-abc', null, 0);
    assert.strictEqual(env[DEBUG_LOGS_ENV_KEY], 'true');
    assert.strictEqual(env[CAPTURE_LOGS_ENV_KEY], 'true');
    assert.strictEqual(env[RAFT_SNAPSHOT_THRESHOLD_ENV_KEY], '100');
    assert.strictEqual(env[LOOP_GAP_PROFILE_ENV_KEY], '1');
    assert.strictEqual(env[PUSH_ON_RED_ENV_KEY], undefined);
    assert.strictEqual(env[PUSH_SKIP_TESTS_ENV_KEY], undefined);
    assert.strictEqual(env[ARBITRARY_HOST_ENV_KEY], undefined);
  } finally {
    for (const [key, value] of original) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('reuse admission rejects stale and hostile LAGRANGE controls', async () => {
  const cluster = createTestCluster();
  const expectedEnv = cluster._buildNodeEnv('n0', 'container-abc', null, 0);
  const envList = [...arrayMap(objectEntries(expectedEnv), ([key, value]) =>
    `${key}=${value}`), `${PUSH_SKIP_TESTS_ENV_KEY}=1`];
  Reflect.defineProperty(envList, Symbol.iterator, {
    value: function* safeOnlyIterator() {
      yield `${DEBUG_LOGS_ENV_KEY}=true`;
    },
  });
  assert.strictEqual(cluster._shouldRecreateReusableContainer(
    {Config: {Env: envList}}, expectedEnv), true);

  let indexedAccessorReads = 0;
  const indexedAccessorEnv = ['NODE_ID=n0'];
  Reflect.defineProperty(indexedAccessorEnv, 1, {get() {
    indexedAccessorReads += 1;
    return `${PUSH_ON_RED_ENV_KEY}=1`;
  }});
  assert.strictEqual(cluster._shouldRecreateReusableContainer(
    {Config: {Env: indexedAccessorEnv}}, expectedEnv), true);
  assert.strictEqual(indexedAccessorReads, 0);

  const accessorInspect = {};
  Reflect.defineProperty(accessorInspect, 'Config', {get() {
    return {Env: []};
  }});
  assert.strictEqual(cluster._shouldRecreateReusableContainer(accessorInspect, {}), true);
  assert.strictEqual(cluster._shouldRecreateReusableContainer(
    {Config: {Env: [`${DEBUG_LOGS_ENV_KEY}=true`]}}, {}), true);
});
