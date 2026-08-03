/**
 * Combined service-cell component through the real
 * WasiComponentCellRuntime + wasi-component-cell-worker.js: the SAME
 * component bytes start twice — once as a request-mode Cell and once as a
 * call-mode Cell — proving each invocation mode gets only its authorized
 * host surface while the other surface fails closed with typed refusals.
 *
 * Request mode: handle-request runs with the live context surface;
 * emit/call-bounded refuse with the typed deny-code and call-binding
 * refuses with the typed binding-call-error 'call_bridge_unavailable'.
 * Call mode: run emits partials through the SharedArrayBuffer path;
 * read/write/capability refuse with explicit mode-based policy errors and
 * call-binding refuses with 'not_available_in_call_mode'.
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
const GUEST_SOURCE_URL = new URL(
  '../wasm-service/fixtures/service-cell-world/guest.js',
  import.meta.url,
);
const AUTHORING_WORLD = 'service-cell';
const CELL_WORLD = Object.freeze({
  CALL: 'call-cell',
  REQUEST: 'request-cell',
});
const CELL_EXPORT = Object.freeze({
  HANDLE_REQUEST: 'handleRequest',
  REDUCE: 'reduce',
  RUN: 'run',
});
const DISABLED_ENGINE_FEATURES = [
  'random',
  'stdio',
  'clocks',
  'http',
  'fetch-event',
];
const EMIT_BUDGET = 4;
const BRIDGE_UNAVAILABLE_CODE = 'call_bridge_unavailable';
const CALL_MODE_REFUSAL_CODE = 'not_available_in_call_mode';
const DENY_UNDECLARED = 'undeclared-capability';
const CALL_MODE_MESSAGE_PATTERN = /call invocation mode/u;
const CELL_BUDGETS = Object.freeze({
  context_bytes: 1024,
  cpu_time_ms: 60000,
  input_bytes: 1048576,
  memory_bytes: 512 * 1024 * 1024,
  output_bytes: 1048576,
  wall_time_ms: 300000,
});
const BATCH_ROWS = Object.freeze([
  Object.freeze({amount: 5}),
  Object.freeze({amount: 6}),
]);
const CALL_MODE_CONTEXT_REFUSALS = Object.freeze([
  Object.freeze({code: 'request_cell_table_read_denied', probe: 'read'}),
  Object.freeze({code: 'request_cell_table_write_denied', probe: 'write'}),
  Object.freeze({code: 'request_cell_capability_denied', probe: 'capability'}),
]);

let componentPromise = null;

function componentizeCombinedGuest() {
  componentPromise ??= readFile(GUEST_SOURCE_URL, 'utf8')
    .then((guestSource) => componentize(guestSource, {
      disableFeatures: DISABLED_ENGINE_FEATURES,
      witPath: CANONICAL_WIT_DIRECTORY.pathname,
      worldName: AUTHORING_WORLD,
    }))
    .then(({component}) => component);
  return componentPromise;
}

function createCell(componentBytes, world, exportName, capabilities) {
  return Object.freeze({
    budgets: CELL_BUDGETS,
    bytes: new Uint8Array(componentBytes),
    capabilities,
    exportName,
    serviceId: `service-cell-modes-${world}`,
    world,
  });
}

function readNoContexts() {
  return [];
}

function writeNoEffects() {}

test(
  'request-mode Cell serves handle-request while the call surface and ' +
    'call-binding fail closed with typed refusals',
  async () => {
    const component = await componentizeCombinedGuest();
    const cellRuntime = new WasiComponentCellRuntime();
    const cell = createCell(
      component,
      CELL_WORLD.REQUEST,
      CELL_EXPORT.HANDLE_REQUEST,
      ['declared'],
    );
    await cellRuntime.start(cell);
    try {
      assert.equal(await cellRuntime.health(cell.serviceId), true);
      const value = await cellRuntime.invoke(
        cell.serviceId,
        [JSON.stringify({probe: 'restricted'})],
        readNoContexts,
        writeNoEffects,
        () => {},
        {},
      );
      const refusals = JSON.parse(value);
      assert.equal(
        refusals.capability,
        1,
        'the declared capability probe stays live in request mode',
      );
      assert.equal(
        refusals.callBinding.code,
        BRIDGE_UNAVAILABLE_CODE,
        'call-binding refuses with the typed call_bridge_unavailable ' +
          'error when the invoke payload carries no bridge hook',
      );
      assert.equal(
        refusals.callBinding.retryable,
        false,
        'the bridge-unavailable refusal is typed non-retryable',
      );
      assert.match(
        refusals.callBinding.message,
        /bridge/iu,
        'the bridge-unavailable refusal message survives the record ' +
          'lowering through jco',
      );
      assert.equal(
        refusals.emit,
        DENY_UNDECLARED,
        'emit fails closed with the typed deny-code in request mode',
      );
      assert.equal(
        refusals.callBounded,
        DENY_UNDECLARED,
        'call-bounded fails closed with the typed deny-code in ' +
          'request mode',
      );
    } finally {
      await cellRuntime.stop(cell.serviceId);
    }
  },
);

test(
  'call-mode Cell emits partials while the request surface and ' +
    'call-binding fail closed',
  async () => {
    const component = await componentizeCombinedGuest();
    const cellRuntime = new WasiComponentCellRuntime();
    const cell = createCell(component, CELL_WORLD.CALL, CELL_EXPORT.RUN, []);
    await cellRuntime.start(cell);
    try {
      const batch = toCellBatch(BATCH_ROWS, BATCH_ROWS.length);
      const runInvocation = await cellRuntime.invoke(
        cell.serviceId,
        [batch, '{}'],
        readNoContexts,
        writeNoEffects,
        () => {},
        {
          callContext: {emitBudget: EMIT_BUDGET, nestedCallBudget: 0},
          exportName: CELL_EXPORT.RUN,
        },
      );
      assert.deepEqual(
        runInvocation.partials,
        [['total', '11']],
        'run emitted its partial through the SharedArrayBuffer path',
      );
      const runResult = JSON.parse(runInvocation.value);
      assert.equal(runResult.rows, BATCH_ROWS.length);
      assert.equal(
        runResult.callBindingRefusal.code,
        CALL_MODE_REFUSAL_CODE,
        'call-binding refuses with the typed not_available_in_call_mode ' +
          'error in call mode',
      );
      assert.deepEqual(
        runResult.denied,
        [],
        'emit stayed live under the declared budget in call mode',
      );

      const reduceInvocation = await cellRuntime.invoke(
        cell.serviceId,
        [runInvocation.partials, '{}'],
        readNoContexts,
        writeNoEffects,
        () => {},
        {
          callContext: {emitBudget: EMIT_BUDGET, nestedCallBudget: 0},
          exportName: CELL_EXPORT.REDUCE,
        },
      );
      assert.deepEqual(
        JSON.parse(reduceInvocation.value),
        {partials: 1, total: 11},
        'reduce folds the emitted partials on the same call-mode Cell',
      );

      for (const refusal of CALL_MODE_CONTEXT_REFUSALS) {
        await assert.rejects(
          () => cellRuntime.invoke(
            cell.serviceId,
            [batch, JSON.stringify({probe: refusal.probe})],
            readNoContexts,
            writeNoEffects,
            () => {},
            {
              callContext: {emitBudget: EMIT_BUDGET, nestedCallBudget: 0},
              exportName: CELL_EXPORT.RUN,
            },
          ),
          (error) => {
            assert.equal(
              error.code,
              refusal.code,
              `${refusal.probe} must refuse with ${refusal.code}`,
            );
            assert.match(
              error.message,
              CALL_MODE_MESSAGE_PATTERN,
              `${refusal.probe} refusal must be explicit mode-based`,
            );
            return true;
          },
        );
        // A failed invocation stops the Cell fail-closed; restart it for
        // the next probe on the same component bytes.
        await cellRuntime.start(cell);
      }
    } finally {
      await cellRuntime.stop(cell.serviceId);
    }
  },
);
