/**
 * Call-cell worker round-trip: componentizes the call-cell world fixture
 * guest (ComponentizeJS against wit/world.wit, the same toolchain as
 * test/wasm-service/call-cell-world-abi.test.js) and exercises it through
 * WasiComponentCellRuntime + wasi-component-cell-worker.js with the sealed
 * `lagrange:cell/call-context` host imports — run and reduce export
 * selection per invocation, emit budget denial, and typed batch round-trip
 * including s64 identity beyond f64 precision.
 */
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {componentize} from '@bytecodealliance/componentize-js';
import {WasiComponentCellRuntime} from
  '../../src/runtime/wasi-component-cell-runtime.js';
import {toCellBatch} from
  '../../src/runtime/call-cell-value-mapping.js';

const CANONICAL_WIT_DIRECTORY = new URL('../../wit', import.meta.url);
const WORLD_NAME = 'call-cell';
const CELL_EXPORT_RUN = 'run';
const CELL_EXPORT_REDUCE = 'reduce';
const DISABLED_ENGINE_FEATURES = [
  'random',
  'stdio',
  'clocks',
  'http',
  'fetch-event',
];
const EMIT_BUDGET = 3;
const NESTED_CALL_BUDGET = 1;
const DENY_BUDGET_EXHAUSTED = 'budget-exhausted';
const DENY_UNDECLARED_CAPABILITY = 'undeclared-capability';
const TOP_N_ARGUMENTS = JSON.stringify({topN: 3});
const BEYOND_F64_ID = 9007199254740995n;
const CELL_BUDGETS = Object.freeze({
  context_bytes: 1024,
  cpu_time_ms: 60000,
  input_bytes: 1048576,
  memory_bytes: 512 * 1024 * 1024,
  output_bytes: 1048576,
  wall_time_ms: 300000,
});
const BATCH_ROWS = Object.freeze([
  Object.freeze({id: 1, score: 4.5, label: null}),
  Object.freeze({id: 2, score: 3.5, label: null}),
  Object.freeze({id: BEYOND_F64_ID, score: 4.9, label: null}),
  Object.freeze({id: 4, score: 2.5, label: null}),
  Object.freeze({id: 5, score: 4.7, label: null}),
]);

async function componentizeFixtureGuest() {
  const guestSource = await readFile(
    new URL('../wasm-service/fixtures/call-cell-world/guest.js',
      import.meta.url),
    'utf8',
  );
  const {component} = await componentize(guestSource, {
    disableFeatures: DISABLED_ENGINE_FEATURES,
    witPath: CANONICAL_WIT_DIRECTORY.pathname,
    worldName: WORLD_NAME,
  });
  return component;
}

function createCallCell(componentBytes) {
  return Object.freeze({
    budgets: CELL_BUDGETS,
    bytes: new Uint8Array(componentBytes),
    capabilities: [],
    exportName: CELL_EXPORT_RUN,
    serviceId: 'call-cell-worker-test',
    world: WORLD_NAME,
  });
}

function readNoContexts() {
  return [];
}

function writeNoEffects() {}

async function invokeCell(cellRuntime, serviceId, options) {
  return cellRuntime.invoke(
    serviceId,
    options.args,
    readNoContexts,
    writeNoEffects,
    () => {},
    {
      callContext: {
        emitBudget: options.emitBudget,
        nestedCallBudget: options.nestedCallBudget,
        onCallBounded: options.onCallBounded === true,
      },
      exportName: options.exportName,
    },
  );
}

test(
  'call-cell worker round-trips run and reduce through the ' +
    'call-context host imports',
  async () => {
    const component = await componentizeFixtureGuest();
    const cellRuntime = new WasiComponentCellRuntime();
    const cell = createCallCell(component);
    await cellRuntime.start(cell);
    try {
      assert.equal(await cellRuntime.health(cell.serviceId), true);

      const batch = toCellBatch(BATCH_ROWS, BATCH_ROWS.length);
      const runInvocation = await invokeCell(cellRuntime, cell.serviceId, {
        args: [batch, TOP_N_ARGUMENTS],
        emitBudget: EMIT_BUDGET,
        exportName: CELL_EXPORT_RUN,
        nestedCallBudget: NESTED_CALL_BUDGET,
      });
      const runResult = JSON.parse(runInvocation.value);

      assert.deepEqual(
        runResult.kept.map((entry) => entry.id),
        [String(BEYOND_F64_ID), '5', '1'],
        'typed rows round-trip, rank by score, and preserve s64 ' +
          'identity beyond f64 precision',
      );
      assert.equal(
        runResult.nullLabels,
        batch.length,
        'the guest observed every null-value label column',
      );
      assert.equal(
        runResult.nestedDenial,
        DENY_UNDECLARED_CAPABILITY,
        'call-bounded was genuinely invoked and its typed ' +
          'undeclared-capability denial observed',
      );
      assert.equal(
        runInvocation.partials.length,
        EMIT_BUDGET,
        'the host captured exactly the budgeted number of partials',
      );
      assert.deepEqual(
        runResult.denied.map((entry) => entry.code),
        [DENY_BUDGET_EXHAUSTED, DENY_BUDGET_EXHAUSTED],
        'the guest observed the typed budget-exhausted denial ' +
          'for the overflow',
      );

      const reduceInvocation = await invokeCell(cellRuntime, cell.serviceId, {
        args: [[...runInvocation.partials].reverse(), TOP_N_ARGUMENTS],
        emitBudget: EMIT_BUDGET,
        exportName: CELL_EXPORT_REDUCE,
        nestedCallBudget: NESTED_CALL_BUDGET,
      });
      const reduced = JSON.parse(reduceInvocation.value);
      assert.deepEqual(
        reduced.map((entry) => entry.key),
        [String(BEYOND_F64_ID), '5', '1'],
        'reduce re-sorts unordered partials into the final ordered result',
      );
      assert.deepEqual(
        reduced.map((entry) => entry.score),
        [4.9, 4.7, 4.5],
        'the emitted numeric aggregation values survive the reduce ' +
          'round-trip',
      );
    } finally {
      await cellRuntime.stop(cell.serviceId);
    }
  },
);

test(
  'call-cell worker fails closed when the emit host import is unavailable',
  async () => {
    const component = await componentizeFixtureGuest();
    const cellRuntime = new WasiComponentCellRuntime();
    const cell = createCallCell(component);
    await cellRuntime.start(cell);
    try {
      const batch = toCellBatch(BATCH_ROWS, BATCH_ROWS.length);
      await assert.rejects(
        () => cellRuntime.invoke(
          cell.serviceId,
          [batch, TOP_N_ARGUMENTS],
          readNoContexts,
          writeNoEffects,
          () => {},
          {exportName: CELL_EXPORT_RUN},
        ),
        /host import is unavailable/u,
      );
    } finally {
      await cellRuntime.stop(cell.serviceId);
    }
  },
);
