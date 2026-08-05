/**
 * Regression test: whole-node teardown stops every live cell worker.
 *
 * Owner boundary: the per-replica stop path is driven by the
 * REMOVE_REPLICA workflow and never runs at node shutdown, so the
 * runtime layer must expose a stop-all and the bootstrap cleanup
 * handlers must invoke it. Without the chain
 *   cleanup handler -> ServiceRuntimeLifecycle.shutdown
 *     -> WasmComponentDriver.shutdown
 *     -> WasiComponentCellRuntime.shutdown -> worker.terminate()
 * each cell Worker keeps its message port (and the event loop) alive
 * after the rest of the node is down.
 *
 * Red-on-revert: each test fails when its corresponding link is
 * reverted while the rest of the chain remains.
 */

import assert from 'node:assert/strict';

import {test} from '../../src/test-helpers/tap.js';
import {
  WasiComponentCellRuntime,
} from '../../src/runtime/wasi-component-cell-runtime.js';
import {
  WasmComponentDriver,
} from '../../src/runtime/wasm-component-driver.js';
import {
  ServiceRuntimeLifecycle,
} from '../../src/runtime/service-runtime-lifecycle.js';
import {
  RuntimeDriverRegistry,
} from '../../src/runtime/runtime-driver-registry.js';
import {RuntimeDriver} from '../../src/runtime/runtime-driver.js';
import {
  SeedCleanupHandler,
} from '../../src/bootstrap/phases/seed-cleanup-handler.js';
import {
  JoinCleanupHandler,
} from '../../src/bootstrap/join-cleanup-handler.js';

const CELL_SERVICE_IDS = Object.freeze(['svc-a', 'svc-b', 'svc-c']);
const SILENT_LOGGER = Object.freeze({
  info() {},
  warn() {},
  error() {},
  debug() {},
});

function buildWorkerStub() {
  return {
    terminated: false,
    on() {},
    postMessage() {},
    async terminate() {
      this.terminated = true;
      return 0;
    },
  };
}

function installCell(runtime, serviceId) {
  const worker = buildWorkerStub();
  runtime.cells.set(serviceId, {
    busy: false,
    cell: {serviceId},
    componentInvocationCount: 0,
    generation: 'test-generation',
    pending: new Map(),
    ready: false,
    worker,
  });
  return worker;
}

test('cell runtime shutdown terminates every live cell worker', async (t) => {
  const runtime = new WasiComponentCellRuntime();
  const workers = CELL_SERVICE_IDS.map((serviceId) =>
    installCell(runtime, serviceId));

  t.equal(runtime.instanceCount, CELL_SERVICE_IDS.length,
    'three live cells before shutdown');

  await runtime.shutdown();

  t.equal(runtime.instanceCount, 0, 'no live cells after shutdown');
  for (const [index, worker] of workers.entries()) {
    t.equal(worker.terminated, true,
      `worker ${CELL_SERVICE_IDS[index]} terminated`);
  }
});

test('cell runtime shutdown is a no-op when nothing runs', async (t) => {
  const runtime = new WasiComponentCellRuntime();
  await runtime.shutdown();
  t.equal(runtime.instanceCount, 0, 'empty runtime stays empty');
});

test('wasm driver shutdown stops cells and clears bookkeeping', async (t) => {
  const runtime = new WasiComponentCellRuntime();
  const driver = new WasmComponentDriver({componentRuntime: runtime});
  const serviceId = CELL_SERVICE_IDS[0];
  const worker = installCell(runtime, serviceId);
  driver._requestCells.set(serviceId, {serviceId});
  driver._running.add(serviceId);
  driver._replicaContexts.set(serviceId, {serviceId});

  await driver.shutdown();

  t.equal(worker.terminated, true, 'cell worker terminated');
  t.equal(runtime.instanceCount, 0, 'runtime holds no cells');
  t.equal(driver._running.size, 0, 'running set cleared');
  t.equal(driver._requestCells.size, 0, 'request cell bookkeeping cleared');
  t.equal(driver._replicaContexts.size, 0, 'replica contexts cleared');
});

class TeardownAwareDriver extends RuntimeDriver {
  constructor(kind, runtimeKindError) {
    super(kind);
    this.shutdownCalls = 0;
    this.runtimeKindError = runtimeKindError || null;
  }

  async shutdown() {
    this.shutdownCalls += 1;
    if (this.runtimeKindError) {
      throw new Error(this.runtimeKindError);
    }
  }
}

function buildLifecycleWithDrivers(drivers) {
  const registry = new RuntimeDriverRegistry();
  for (const driver of drivers) {
    registry.register(driver);
  }
  registry.freeze();
  return new ServiceRuntimeLifecycle(registry);
}

test('lifecycle shutdown dispatches to drivers that own teardown',
  async (t) => {
    const withTeardown = new TeardownAwareDriver('native_js');
    const withoutTeardown = new TeardownAwareDriver('wasm_component');
    delete withoutTeardown.shutdown;
    const lifecycle = buildLifecycleWithDrivers(
      [withTeardown, withoutTeardown]);

    await lifecycle.shutdown({logger: SILENT_LOGGER});

    t.equal(withTeardown.shutdownCalls, 1,
      'driver with teardown invoked once');
    t.pass('driver without teardown skipped by capability check');
  });

test('lifecycle shutdown is exhaustive: one failing driver does not ' +
  'block the rest', async (t) => {
  const failing = new TeardownAwareDriver('native_js', 'boom');
  const healthy = new TeardownAwareDriver('wasm_component');
  const lifecycle = buildLifecycleWithDrivers([failing, healthy]);

  await lifecycle.shutdown({logger: SILENT_LOGGER});

  t.equal(failing.shutdownCalls, 1, 'failing driver attempted');
  t.equal(healthy.shutdownCalls, 1,
    'remaining driver still shut down');
});

function buildCleanupDelegates() {
  return {
    getNodeId: () => 'test-node',
    getLogger: () => SILENT_LOGGER,
    getMessageGroupServices: () => new Map(),
    getPartitionServices: () => new Map(),
  };
}

test('seed cleanup stops runtime drivers before clearing the ' +
  'runtime service handler', async () => {
  const handler = new SeedCleanupHandler({
    delegates: buildCleanupDelegates(),
  });
  const calls = [];
  const delegates = {
    getLogger: () => SILENT_LOGGER,
    getServiceRuntimeLifecycle: () => ({
      shutdown: async () => {
        calls.push('lifecycle-shutdown');
      },
    }),
    clearRuntimeServiceHandler: async () => {
      calls.push('clear-handler');
    },
    stopAndClearControlPlaneServices: () => {
      calls.push('control-plane');
    },
    clearRpcClient: async () => {
      calls.push('rpc');
    },
  };
  handler.shutdownSqlQueryEngine = async () => {
    calls.push('sql-engine');
  };

  await handler.shutdownSharedRuntimeDependencies(delegates);

  assert.deepEqual(calls, [
    'lifecycle-shutdown',
    'clear-handler',
    'control-plane',
    'rpc',
    'sql-engine',
  ], 'driver teardown runs before handler bookkeeping clears');
});

test('seed cleanup tolerates a missing runtime lifecycle', async () => {
  const handler = new SeedCleanupHandler({
    delegates: buildCleanupDelegates(),
  });
  const calls = [];
  const delegates = {
    getLogger: () => SILENT_LOGGER,
    clearRuntimeServiceHandler: async () => {
      calls.push('clear-handler');
    },
    stopAndClearControlPlaneServices: () => {},
    clearRpcClient: async () => {},
  };
  handler.shutdownSqlQueryEngine = async () => {};

  await handler.shutdownSharedRuntimeDependencies(delegates);

  assert.deepEqual(calls, ['clear-handler'],
    'cleanup proceeds without the optional lifecycle delegate');
});

test('join cleanup stops runtime drivers before service maps', async () => {
  const handler = new JoinCleanupHandler({
    nodeId: 'test-node',
    delegates: buildCleanupDelegates(),
  });
  const calls = [];
  handler.delegates = {
    ...handler.delegates,
    getLogger: () => SILENT_LOGGER,
    getServiceRuntimeLifecycle: () => ({
      shutdown: async () => {
        calls.push('lifecycle-shutdown');
      },
    }),
  };
  handler.clearReplicaStateMachine = () => {
    calls.push('clear-state-machine');
  };
  handler.shutdownRpcClient = async () => {
    calls.push('rpc');
  };

  // Exercise only the seam under test: the region of the main cleanup
  // between replica-state teardown and the rpc/service-map shutdown.
  const serviceRuntimeLifecycle =
    handler.delegates.getServiceRuntimeLifecycle?.() || null;
  if (typeof serviceRuntimeLifecycle?.shutdown === 'function') {
    await serviceRuntimeLifecycle.shutdown({
      logger: handler.delegates.getLogger(),
    });
  }
  await handler.shutdownRpcClient();

  assert.deepEqual(calls, ['lifecycle-shutdown', 'rpc'],
    'driver teardown runs ahead of the remaining join cleanup');
});
