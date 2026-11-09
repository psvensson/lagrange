/**
 * Production-order WASI component derivation cancellation witnesses.
 *
 * Covers the production call order across WasiComponentCellRuntime and
 * WasmComponentDriver:
 *   1. calling start and then stop(serviceId) while derivation is in flight
 *      immediately releases the derivation holder, terminates the active
 *      derivation worker when serviceId is the last holder, rejects/aborts
 *      the in-flight start, and leaves no published Cell in runtime.cells or
 *      driver._requestCells;
 *   2. when two services share a single-flight derivation on the same
 *      component digest and one stops during derivation, the shared
 *      derivation continues for the sibling, the sibling starts its Cell,
 *      and the stopped service never spawns a Cell worker or publishes a Cell;
 *   3. when a service starts, stops during derivation, and immediately starts
 *      again (generation 2), the stop from generation 1 does not cancel
 *      generation 2.
 */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';

import {RUNTIME_KIND} from '../../src/constants/runtime.js';
import {
  canonicalJson,
} from '../../src/control-plane/owners/deployment-binding-contract.js';
import {
  HEALTH_STATUS,
  PREPARE_STATUS,
  START_STATUS,
} from '../../src/runtime/runtime-driver.js';
import {WasiComponentCellRuntime} from
  '../../src/runtime/wasi-component-cell-runtime.js';
import {WasmComponentDriver} from '../../src/runtime/wasm-component-driver.js';
import {
  normalizeExternalServiceManifest,
} from '../../src/service/external-service-manifest.js';
import {
  STARTUP_WITNESS_CELL_BUDGETS,
  STARTUP_WITNESS_COMPONENT_BYTES,
} from './wasi-component-startup-witness-fixture.js';

const SELF_PATH = fileURLToPath(import.meta.url);
const CHILD_MODE_RUNTIME_STOP = 'child-runtime-stop';
const CHILD_KILL_MS = 60_000;
const FILE_TIMEOUT_MS = 180_000;
const POLL_INTERVAL_MS = 1;
const REQUEST_WORLD = 'request-cell';
const EXPORT_NAME = 'run';
const TENANT_ID = 'tenant-derivation-witness';
const BINDING_VERSION_ID = 'binding-version-derivation-witness';
const ARTIFACT_DIGEST = `sha256:${'a'.repeat(64)}`;
const BINDING_DIGEST = `sha256:${'b'.repeat(64)}`;
const PACKAGE_ID = `service-package-${'c'.repeat(64)}`;
const INITIAL_GENERATION_COUNTER = 1;
const SINGLE_SPAWNED_GENERATION_COUNTER = 2;
const ERROR_CODE = Object.freeze({
  UNAVAILABLE: 'request_cell_component_unavailable',
});
const SERVICE_ID = Object.freeze({
  ALPHA: 'service-a',
  BETA: 'service-b',
  DRIVER: 'driver-service-a',
});

function sha256Hex(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function witnessCell(serviceId, bytes = STARTUP_WITNESS_COMPONENT_BYTES) {
  return Object.freeze({
    budgets: STARTUP_WITNESS_CELL_BUDGETS,
    bytes,
    capabilities: [],
    exportName: EXPORT_NAME,
    serviceId,
    world: REQUEST_WORLD,
  });
}

function waitUntilDerivationRunning(runtime, expectedRuns = 1) {
  return new Promise((resolve) => {
    const poll = () => {
      const telemetry = runtime.getDerivationTelemetry();
      if (telemetry.runs >= expectedRuns && telemetry.inFlight === 1) {
        resolve();
      } else {
        setTimeout(poll, POLL_INTERVAL_MS);
      }
    };
    poll();
  });
}

function createDriverFixture(bytes = STARTUP_WITNESS_COMPONENT_BYTES) {
  const runtime = new WasiComponentCellRuntime();
  const normalizedManifest = normalizeExternalServiceManifest({
    artifact: {
      digest: ARTIFACT_DIGEST,
      media_type: 'application/wasm',
      ref: 'registry.example.test/acme/derivation-witness:1.0.0',
      type: 'oci',
    },
    capabilities: [],
    exports: [{
      interface: 'request_v1',
      name: EXPORT_NAME,
    }],
    name: 'derivation-witness',
    runtime: {kind: RUNTIME_KIND.WASM_COMPONENT},
    schema_version: 3,
    version: '1.0.0',
  });
  assert.equal(normalizedManifest.status, 'accepted');
  const manifest = normalizedManifest.manifest;
  const manifestDigest = sha256Hex(canonicalJson(manifest));
  const payloadDigest = sha256Hex(bytes);
  const declaration = {
    budgets: STARTUP_WITNESS_CELL_BUDGETS,
    capabilities: [],
    name: 'derivation-witness-binding',
    schema_version: 2,
    source: {kind: 'request', method: 'POST', path: '/witness'},
    target: {
      export_name: EXPORT_NAME,
      manifest_digest: manifestDigest,
      package_id: PACKAGE_ID,
    },
  };
  const driver = new WasmComponentDriver({
    artifactLoader: async () => ({
      artifactDigest: ARTIFACT_DIGEST,
      bytes,
      manifest,
      manifestDigest,
      packageId: PACKAGE_ID,
      payloadDigest,
    }),
    componentRuntime: runtime,
  });
  const definitionFor = (serviceId) => ({
    binding_digest: BINDING_DIGEST,
    binding_projection: JSON.stringify({
      binding_digest: BINDING_DIGEST,
      binding_version_id: BINDING_VERSION_ID,
      declaration,
      tenant_id: TENANT_ID,
    }),
    binding_version_id: BINDING_VERSION_ID,
    resource_budget: JSON.stringify(STARTUP_WITNESS_CELL_BUDGETS),
    runtime_config: JSON.stringify({export_name: EXPORT_NAME}),
    runtime_kind: RUNTIME_KIND.WASM_COMPONENT,
    runtime_ref:
      `registry.example.test/acme/derivation-witness:1.0.0@${ARTIFACT_DIGEST}`,
    service_id: serviceId,
    tenantId: TENANT_ID,
  });
  return {definitionFor, driver, runtime};
}

async function runChildRuntimeStopWitness() {
  const runtime = new WasiComponentCellRuntime();
  const startPromise = runtime.start(witnessCell(SERVICE_ID.ALPHA));
  await waitUntilDerivationRunning(runtime);
  const inFlightBeforeStop = runtime.getDerivationTelemetry().inFlight;
  const stopPromise = runtime.stop(SERVICE_ID.ALPHA);
  const inFlightAtStopCall = runtime.getDerivationTelemetry().inFlight;
  let rejectedCode = null;
  try {
    await startPromise;
  } catch (error) {
    rejectedCode = error?.code ?? null;
  }
  await stopPromise;
  // Do NOT call runtime.shutdown(): exiting naturally proves the active
  // derivation worker was terminated by stop(serviceId).
  process.stdout.write(`${JSON.stringify({
    cellsSize: runtime.cells.size,
    holderRetained: runtime.derivations.holderKeys.has(SERVICE_ID.ALPHA),
    inFlightAtStopCall,
    inFlightBeforeStop,
    nextGeneration: runtime.nextGeneration,
    rejectedCode,
    telemetry: runtime.getDerivationTelemetry(),
  })}\n`);
}

if (process.argv[2] === CHILD_MODE_RUNTIME_STOP) {
  await runChildRuntimeStopWitness();
} else {
  test('Witness 1: production runtime.start and driver.start followed by ' +
    'stop during derivation immediately releases the holder, terminates ' +
    'the derivation worker, rejects start, and publishes no Cell',
  {timeout: FILE_TIMEOUT_MS}, async () => {
    const child = spawnSync(
      process.execPath,
      [SELF_PATH, CHILD_MODE_RUNTIME_STOP],
      {encoding: 'utf8', timeout: CHILD_KILL_MS},
    );
    assert.equal(child.error, undefined, 'child exits before kill bound');
    assert.equal(child.status, 0, `child exits cleanly: ${child.stderr}`);
    const childResult = JSON.parse(child.stdout.trim().split('\n').at(-1));
    assert.equal(childResult.inFlightBeforeStop, 1);
    assert.equal(childResult.inFlightAtStopCall, 0,
      'stop(serviceId) synchronously releases and cancels the derivation');
    assert.equal(childResult.holderRetained, false);
    assert.equal(childResult.rejectedCode, ERROR_CODE.UNAVAILABLE);
    assert.equal(childResult.cellsSize, 0);
    assert.equal(childResult.nextGeneration, INITIAL_GENERATION_COUNTER,
      'no Cell worker was spawned');
    assert.equal(childResult.telemetry.cancelled, 1);
    assert.equal(childResult.telemetry.inFlight, 0);

    const {definitionFor, driver, runtime} = createDriverFixture();
    try {
      const prepared = await driver.prepare(
        definitionFor(SERVICE_ID.DRIVER),
        {},
      );
      assert.equal(prepared.status, PREPARE_STATUS.READY);
      const startPromise = driver.start({serviceId: SERVICE_ID.DRIVER});
      await waitUntilDerivationRunning(runtime);
      const stopPromise = driver.stop({serviceId: SERVICE_ID.DRIVER});
      assert.equal(runtime.getDerivationTelemetry().inFlight, 0,
        'driver.stop immediately cancels the in-flight derivation');
      assert.equal(driver._requestCells.has(SERVICE_ID.DRIVER), false);
      const startResult = await startPromise;
      await stopPromise;
      assert.equal(startResult.status, START_STATUS.FAILED);
      assert.match(startResult.error, new RegExp(ERROR_CODE.UNAVAILABLE, 'u'));
      assert.equal(runtime.cells.has(SERVICE_ID.DRIVER), false);
      assert.equal(runtime.instanceCount, 0);
      assert.equal(driver._requestCells.has(SERVICE_ID.DRIVER), false);
      assert.equal(driver._running.has(SERVICE_ID.DRIVER), false);
      const health = await driver.health({serviceId: SERVICE_ID.DRIVER});
      assert.equal(health.status, HEALTH_STATUS.UNHEALTHY);
    } finally {
      await driver.shutdown();
    }
  });

  test('Witness 2: shared derivation survives sibling stop while the ' +
    'stopped service neither spawns a worker nor publishes a Cell',
  {timeout: FILE_TIMEOUT_MS}, async () => {
    const runtime = new WasiComponentCellRuntime();
    try {
      const startA = runtime.start(witnessCell(SERVICE_ID.ALPHA));
      const startB = runtime.start(witnessCell(SERVICE_ID.BETA));
      await waitUntilDerivationRunning(runtime);
      assert.equal(runtime.derivations.holderKeys.has(SERVICE_ID.ALPHA), true);
      assert.equal(runtime.derivations.holderKeys.has(SERVICE_ID.BETA), true);

      const stopA = runtime.stop(SERVICE_ID.ALPHA);
      assert.equal(runtime.derivations.holderKeys.has(SERVICE_ID.ALPHA), false,
        'stopped sibling immediately releases its derivation holder');
      assert.equal(runtime.derivations.holderKeys.has(SERVICE_ID.BETA), true,
        'active sibling retains the shared derivation');

      await assert.rejects(
        () => startA,
        (error) => error.code === ERROR_CODE.UNAVAILABLE,
      );
      await Promise.all([stopA, startB]);

      assert.equal(runtime.cells.has(SERVICE_ID.ALPHA), false,
        'stopped service-a never publishes a Cell');
      assert.equal(runtime.cells.has(SERVICE_ID.BETA), true,
        'sibling service-b publishes its Cell');
      assert.equal(runtime.instanceCount, 1);
      assert.equal(
        runtime.nextGeneration,
        SINGLE_SPAWNED_GENERATION_COUNTER,
        'only service-b spawned a Cell worker',
      );
      assert.equal(await runtime.health(SERVICE_ID.ALPHA), false);
      assert.equal(await runtime.health(SERVICE_ID.BETA), true);
      const telemetry = runtime.getDerivationTelemetry();
      assert.equal(telemetry.runs, 1);
      assert.equal(telemetry.completed, 1);
      assert.equal(telemetry.cancelled, 0);
      assert.equal(telemetry.inFlight, 0);
    } finally {
      await runtime.shutdown();
    }
  });

  test('Witness 3: successor generation start is not cancelled by a ' +
    'stop from the predecessor generation',
  {timeout: FILE_TIMEOUT_MS}, async () => {
    const runtime = new WasiComponentCellRuntime();
    try {
      const startGen1 = runtime.start(witnessCell(SERVICE_ID.ALPHA));
      await waitUntilDerivationRunning(runtime, 1);
      const stopGen1 = runtime.stop(SERVICE_ID.ALPHA);
      const startGen2 = runtime.start(witnessCell(SERVICE_ID.ALPHA));
      await assert.rejects(
        () => startGen1,
        (error) => error.code === ERROR_CODE.UNAVAILABLE,
      );
      await Promise.all([stopGen1, startGen2]);
      assert.equal(runtime.cells.has(SERVICE_ID.ALPHA), true);
      assert.equal(await runtime.health(SERVICE_ID.ALPHA), true);
      const telemetry = runtime.getDerivationTelemetry();
      assert.equal(telemetry.cancelled, 1, 'generation 1 derivation cancelled');
      assert.equal(telemetry.completed, 1, 'generation 2 derivation completed');
    } finally {
      await runtime.shutdown();
    }

    const {definitionFor, driver, runtime: driverRuntime} =
      createDriverFixture();
    try {
      await driver.prepare(definitionFor(SERVICE_ID.DRIVER), {});
      const driverStartGen1 = driver.start({serviceId: SERVICE_ID.DRIVER});
      await waitUntilDerivationRunning(driverRuntime, 1);
      const driverStopGen1 = driver.stop({serviceId: SERVICE_ID.DRIVER});
      const preparedGen2 = await driver.prepare(
        definitionFor(SERVICE_ID.DRIVER), {},
      );
      assert.equal(preparedGen2.status, PREPARE_STATUS.READY);
      const driverStartGen2 = driver.start({serviceId: SERVICE_ID.DRIVER});
      const [resultGen1, , resultGen2] = await Promise.all([
        driverStartGen1, driverStopGen1, driverStartGen2,
      ]);
      assert.equal(resultGen1.status, START_STATUS.FAILED);
      assert.equal(resultGen2.status, START_STATUS.RUNNING);
      assert.equal(driver._running.has(SERVICE_ID.DRIVER), true);
      assert.equal(
        (await driver.health({serviceId: SERVICE_ID.DRIVER})).status,
        HEALTH_STATUS.HEALTHY,
      );
    } finally {
      await driver.shutdown();
    }
  });

  test('Witness 4: same-turn pre-derivation stop and post-derivation ' +
    'waitForReady stop abort start and publish no Cell',
  {timeout: FILE_TIMEOUT_MS}, async () => {
    const sameTurnRuntime = new WasiComponentCellRuntime();
    try {
      const operations = await Promise.all([
        sameTurnRuntime.start(witnessCell(SERVICE_ID.ALPHA)),
        sameTurnRuntime.stop(SERVICE_ID.ALPHA),
      ]);
      assert.deepEqual(operations, [undefined, undefined]);
      assert.equal(sameTurnRuntime.cells.size, 0);
      assert.equal(sameTurnRuntime.getDerivationTelemetry().runs, 0);
    } finally {
      await sameTurnRuntime.shutdown();
    }

    const readyRuntime = new WasiComponentCellRuntime();
    const originalWaitForReady = readyRuntime.waitForReady.bind(readyRuntime);
    let resolveEnteredReady;
    const enteredReady = new Promise((resolve) => {
      resolveEnteredReady = resolve;
    });
    readyRuntime.waitForReady = (state) => {
      const promise = originalWaitForReady(state);
      resolveEnteredReady(state);
      return promise;
    };
    try {
      const startPromise = readyRuntime.start(witnessCell(SERVICE_ID.ALPHA));
      const state = await enteredReady;
      assert.equal(state.readySettled, false);
      const stopPromise = readyRuntime.stop(SERVICE_ID.ALPHA);
      assert.equal(state.readySettled, true);
      assert.equal(readyRuntime.cells.has(SERVICE_ID.ALPHA), false);
      await assert.rejects(
        () => startPromise,
        (error) => error.code === ERROR_CODE.UNAVAILABLE,
      );
      await stopPromise;
      assert.equal(readyRuntime.instanceCount, 0);
    } finally {
      await readyRuntime.shutdown();
    }
  });
}
