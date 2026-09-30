import {test} from '../../src/test-helpers/tap.js';
import {messageIs} from '../integration/helpers/process-formation-scenario.js';

const SCENARIO_URL = new URL(
  '../integration/helpers/process-formation-scenario.js', import.meta.url,
);
const CLUSTER_URL = new URL(
  '../../../examples/service-data-affinity/cluster-harness.js', SCENARIO_URL,
);
const ADMIN_CLIENT_URL = new URL(
  '../../../scripts/examples/admin-ws-client.js', SCENARIO_URL,
);
const PORT_ALLOCATOR_URL = new URL(
  '../../../src/test-helpers/port-allocator.js', SCENARIO_URL,
);
const PROXY_URL = new URL(
  '../integration/helpers/bootstrap-contact-fault-proxy.js', import.meta.url,
);

async function loadScenario(t, cluster, createProxy) {
  const mocks = {
    'node:fs/promises': {
      mkdir: async () => {},
      mkdtemp: async () => '/virtual/process-formation/run-',
      readFile: async () => '',
      rm: async () => {},
    },
    [CLUSTER_URL.href]: {createLocalProcessCluster: () => cluster},
    [ADMIN_CLIENT_URL.href]: {AdminWsClient: class {}},
    [PORT_ALLOCATOR_URL.href]: {getTestPort: () => 19080},
  };
  if (createProxy) {
    mocks[PROXY_URL.href] = {createBootstrapContactFaultProxy: createProxy};
  }
  return t.mockImport(SCENARIO_URL.href, mocks);
}

function createTapOwner() {
  let teardown = null;
  return {
    owner: {
      teardown(callback) {
        teardown = callback;
      },
      comment() {},
      passing: () => false,
      ok() {},
    },
    teardown: () => teardown(),
  };
}

test('process formation uses canonical log fields and one absolute owner deadline', async (t) => {
  t.equal(messageIs({msg: 'ready'}, 'ready'), true);
  t.equal(messageIs({message: 'ready'}, 'ready'), false,
    'diagnostic aliases cannot impersonate canonical process-log evidence');

  const starts = [];
  const waits = [];
  const cluster = {
    nodes: [],
    startNode(...args) {
      starts.push(args);
      return Promise.resolve({nodeId: args[0].nodeId});
    },
    waitFor(_node, _probe, options) {
      waits.push(options);
      return Promise.resolve();
    },
    stop: async () => {},
  };
  const loaded = await loadScenario(t, cluster);
  const tapOwner = createTapOwner();
  const scenario = await loaded.createProcessFormationScenario(
    tapOwner.owner, import.meta.url,
  );
  await scenario.startNode('550e8400-e29b-41d4-a716-446655440701');
  await scenario.startNode('550e8400-e29b-41d4-a716-446655440702');
  await scenario.waitFor({}, async () => ({ready: true}), 'owner_probe');
  t.equal(starts.length, 2);
  t.equal(Number.isFinite(starts[0][1]?.deadlineMs), true,
    'process acquisition receives the scenario absolute deadline');
  t.equal(starts[1][1]?.deadlineMs, starts[0][1]?.deadlineMs,
    'every acquisition reuses the same deadline instead of resetting a budget');
  t.equal(waits[0].deadlineMs, starts[0][1].deadlineMs,
    'process acquisition and observation consume one budget owner');
  t.equal(waits[0].pollIntervalMs, 100,
    'the process harness preserves the committed network/cache cadence');
  await tapOwner.teardown();
});

test('process formation teardown settles synchronous and asynchronous owners', async (t) => {
  const clusterStop = Promise.withResolvers();
  const cluster = {
    nodes: [],
    startNode: async () => {},
    waitFor: async () => {},
    stop: () => clusterStop.promise,
  };
  const loaded = await loadScenario(t, cluster);
  const tapOwner = createTapOwner();
  const scenario = await loaded.createProcessFormationScenario(
    tapOwner.owner, import.meta.url,
  );
  const synchronousFailure = new Error('resource stop threw synchronously');
  scenario.own({
    stop() {
      throw synchronousFailure;
    },
  });
  let settled = false;
  const stopping = tapOwner.teardown().then(
    () => {
      settled = true;
      return null;
    },
    (error) => {
      settled = true;
      return error;
    },
  );
  await new Promise((resolve) => setImmediate(resolve));
  t.equal(settled, false,
    'a synchronous stop failure cannot abandon an asynchronous owner');
  clusterStop.resolve();
  const error = await stopping;
  t.equal(error?.message, 'formation_teardown_failed');
  t.equal(error?.errors?.[0], synchronousFailure,
    'teardown reports the exact synchronous resource failure after settlement');
});

test('scenario stop owns a proxy listen admitted under its absolute deadline', async (t) => {
  const cluster = {
    nodes: [],
    startNode: async () => {},
    waitFor: async () => {},
    stop: async () => {},
  };
  let acquisitionSignal = null;
  const loaded = await loadScenario(t, cluster, (_upstream, {signal}) => {
    acquisitionSignal = signal;
    return new Promise((_resolve, reject) => {
      const cancelled = () => reject(Object.assign(
        new Error('proxy_listen_failed', {cause: signal.reason}),
        {code: 'proxy_listen_failed'},
      ));
      if (signal.aborted) cancelled();
      else signal.addEventListener('abort', cancelled, {once: true});
    });
  });
  const tapOwner = createTapOwner();
  const scenario = await loaded.createProcessFormationScenario(
    tapOwner.owner, import.meta.url,
  );
  const acquiring = scenario.createBootstrapContactProxy('http://127.0.0.1:19080')
    .then(() => null, (error) => error);
  const stopping = tapOwner.teardown();
  const acquisitionError = await acquiring;
  await stopping;
  t.equal(acquisitionSignal.aborted, true,
    'stop cancels the in-flight listen owned by the scenario');
  t.equal(acquisitionError?.code, 'proxy_listen_failed');
  t.equal(acquisitionError?.cause?.code, 'formation_stopping',
    'the proxy retains the scenario owner reason without creating a new budget');
});
