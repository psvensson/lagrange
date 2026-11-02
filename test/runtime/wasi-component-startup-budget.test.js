/**
 * Quest wasi-component-startup-budget witnesses.
 *
 * A Cell start runs only spawn, memory cap, glue import, core compile,
 * instantiate and the ready handshake. The jco transpile is derived once per
 * (component sha256, toolchain, world, instantiation mode) by the runtime's
 * single-flight derivation owner, and that derivation has its own typed
 * outcomes. These witnesses cover:
 *   1. the startup liveness bound: typed START_FAILED {phase, budgetMs,
 *      elapsedMs}, and the worker terminated, shown by the child process
 *      exiting on its own;
 *   2. single-flight reuse across concurrent starts and a restart;
 *   3. a typed derivation failure before any Cell worker exists, kept
 *      permanently for that digest;
 *   4. the CPU-ceiling constants, toolchain identity, and owner
 *      cancellation of a superseded derivation.
 */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

import {WasiComponentCellRuntime} from
  '../../src/runtime/wasi-component-cell-runtime.js';
import {
  DERIVATION_CPU_FIXED_MS,
  DERIVATION_CPU_MS_PER_MIB,
  DERIVATION_OUTCOME,
  DERIVATION_TOOLCHAIN,
  WasiComponentDerivationOwner,
  derivationCpuBudgetMs,
} from '../../src/runtime/wasi-component-derivation.js';
import {
  STARTUP_WITNESS_CELL_BUDGETS,
  STARTUP_WITNESS_COMPONENT_BYTES,
  STARTUP_WITNESS_SECOND_COMPONENT_BYTES,
} from './wasi-component-startup-witness-fixture.js';

const LIVENESS_CHILD_PATH = new URL(
  './wasi-component-startup-liveness-child.js',
  import.meta.url,
).pathname;
const PACKAGE_JSON_URL = new URL('../../package.json', import.meta.url);
const JCO_TRANSPILE_PACKAGE = '@bytecodealliance/jco-transpile';
const STARTUP_BOUND_MS = 10_000;
const CHILD_KILL_MS = 60_000;
const FILE_TIMEOUT_MS = 180_000;
const MEASURED_H1_COMPONENT_BYTES = 12_912_649;
const ADMISSION_CAP_BYTES = 256 * 1024 * 1024;
const REQUEST_WORLD = 'request-cell';
const CORRUPT_COMPONENT_BYTES = Buffer.from('not-a-component');
const ERROR_CODE = Object.freeze({
  DERIVATION_FAILED: 'request_cell_component_derivation_failed',
  START_FAILED: 'request_cell_start_failed',
  UNAVAILABLE: 'request_cell_component_unavailable',
});

function witnessCell(serviceId, bytes = STARTUP_WITNESS_COMPONENT_BYTES) {
  return Object.freeze({
    budgets: STARTUP_WITNESS_CELL_BUDGETS,
    bytes,
    capabilities: [],
    exportName: 'run',
    serviceId,
    world: REQUEST_WORLD,
  });
}

test('a start that never reaches ready fails typed with its phase, budget ' +
  'and elapsed time, and leaves no live Cell worker', {timeout: FILE_TIMEOUT_MS},
() => {
  const child = spawnSync(process.execPath, [LIVENESS_CHILD_PATH], {
    encoding: 'utf8',
    timeout: CHILD_KILL_MS,
  });
  assert.equal(child.error, undefined, 'the child exits before the kill bound');
  assert.equal(child.status, 0, `child exits by itself: ${child.stderr}`);
  const outcome = JSON.parse(child.stdout.trim().split('\n').at(-1));
  assert.equal(outcome.outcome, 'rejected');
  assert.equal(outcome.name, 'WasiComponentCellError');
  assert.equal(outcome.code, ERROR_CODE.START_FAILED);
  assert.equal(outcome.phase, 'instantiate');
  assert.equal(outcome.budgetMs, STARTUP_BOUND_MS);
  assert.ok(outcome.elapsedMs >= STARTUP_BOUND_MS,
    `elapsed ${outcome.elapsedMs} reaches the bound`);
  assert.equal(outcome.instanceCount, 0);
});

test('concurrent starts and a restart of one component share a single ' +
  'derivation', {timeout: FILE_TIMEOUT_MS}, async () => {
  const runtime = new WasiComponentCellRuntime();
  try {
    await Promise.all([
      runtime.start(witnessCell('single-flight-a')),
      runtime.start(witnessCell('single-flight-b')),
    ]);
    await runtime.stop('single-flight-a');
    await runtime.start(witnessCell('single-flight-a'));
    assert.equal(runtime.instanceCount, 2);
    const telemetry = runtime.getDerivationTelemetry();
    assert.equal(telemetry.runs, 1, 'one transpile for one component');
    assert.equal(telemetry.completed, 1);
    assert.equal(telemetry.inFlight, 0);
  } finally {
    await runtime.shutdown();
  }
});

test('a component that cannot be derived fails typed before any Cell worker ' +
  'exists, and the refusal is permanent for that digest',
{timeout: FILE_TIMEOUT_MS}, async () => {
  const runtime = new WasiComponentCellRuntime();
  try {
    for (const serviceId of ['corrupt-a', 'corrupt-b']) {
      await assert.rejects(
        () => runtime.start(witnessCell(serviceId, CORRUPT_COMPONENT_BYTES)),
        (error) => error.code === ERROR_CODE.DERIVATION_FAILED,
      );
    }
    assert.equal(runtime.instanceCount, 0, 'no Cell worker was started');
    const telemetry = runtime.getDerivationTelemetry();
    assert.equal(telemetry.runs, 1, 'the refusal is not redone');
    assert.equal(telemetry.refused, 1);
  } finally {
    await runtime.shutdown();
  }
});

test('the derivation CPU ceiling is the recorded production constant pair',
  () => {
    assert.equal(DERIVATION_CPU_MS_PER_MIB, 2000);
    assert.equal(DERIVATION_CPU_FIXED_MS, 5000);
    assert.equal(derivationCpuBudgetMs(0), 5000);
    assert.equal(derivationCpuBudgetMs(MEASURED_H1_COMPONENT_BYTES), 29629);
    assert.equal(derivationCpuBudgetMs(ADMISSION_CAP_BYTES), 517000);
  });

test('the derivation key names the pinned transpile toolchain', () => {
  const pkg = JSON.parse(readFileSync(PACKAGE_JSON_URL, 'utf8'));
  assert.equal(
    DERIVATION_TOOLCHAIN,
    `${JCO_TRANSPILE_PACKAGE}@${pkg.dependencies[JCO_TRANSPILE_PACKAGE]}`,
  );
});

test('a superseded derivation is cancelled with a typed outcome and the ' +
  'new digest derives', {timeout: FILE_TIMEOUT_MS}, async () => {
  const owner = new WasiComponentDerivationOwner();
  try {
    const first = owner.acquire('holder', {
      bytes: STARTUP_WITNESS_COMPONENT_BYTES,
      world: REQUEST_WORLD,
    });
    const second = owner.acquire('holder', {
      bytes: STARTUP_WITNESS_SECOND_COMPONENT_BYTES,
      world: REQUEST_WORLD,
    });
    const cancelled = await first;
    assert.equal(cancelled.outcome, DERIVATION_OUTCOME.CANCELLED);
    assert.equal(cancelled.error.code, ERROR_CODE.UNAVAILABLE);
    const derived = await second;
    assert.equal(derived.outcome, DERIVATION_OUTCOME.DERIVED);
    const telemetry = owner.telemetry();
    assert.equal(telemetry.cancelled, 1);
    assert.equal(telemetry.inFlight, 0);
  } finally {
    await owner.shutdown();
  }
});

test('releasing the last holder of a running derivation terminates it',
  {timeout: FILE_TIMEOUT_MS}, async () => {
    const owner = new WasiComponentDerivationOwner();
    try {
      const pending = owner.acquire('only-holder', {
        bytes: STARTUP_WITNESS_COMPONENT_BYTES,
        world: REQUEST_WORLD,
      });
      owner.release('only-holder');
      const result = await pending;
      assert.equal(result.outcome, DERIVATION_OUTCOME.CANCELLED);
      assert.equal(owner.telemetry().inFlight, 0);
      assert.equal(owner.telemetry().retained, 0);
    } finally {
      await owner.shutdown();
    }
  });
