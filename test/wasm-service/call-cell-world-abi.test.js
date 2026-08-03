/**
 * ABI spike for the draft call-cell world
 * (solve/epics/native-call-context-wit-contract.md): proves with the real
 * toolchain — ComponentizeJS build, jco transpile, host-side instantiate,
 * the same path src/runtime/wasi-component-cell-worker.js uses — that the
 * typed contract shapes (list<row> of record/variant columns, result<_,
 * deny-code> imports, run/reduce exports) are implementable today.
 */
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {componentize} from '@bytecodealliance/componentize-js';
import {transpileBytes} from '@bytecodealliance/jco-transpile';
import {test} from '../../src/test-helpers/tap.js';

const CANONICAL_WIT_DIRECTORY = new URL('../../wit', import.meta.url);
const WORLD_NAME = 'call-cell';
const COMPONENT_NAME = 'call-cell-spike';
const DISABLED_ENGINE_FEATURES = ['random', 'stdio', 'clocks', 'http', 'fetch-event'];
const EMIT_BUDGET = 3;
const DENY_BUDGET_EXHAUSTED = 'budget-exhausted';
const TOP_N_ARGUMENTS = JSON.stringify({topN: 3});
const BEYOND_F64_ID = 9007199254740995n;

function typedRow(id, score) {
  return {
    columns: [
      {name: 'id', val: {tag: 'integer', val: BigInt(id)}},
      {name: 'score', val: {tag: 'real', val: score}},
      {name: 'label', val: {tag: 'null-value'}},
    ],
  };
}

async function buildAndInstantiate(hostState) {
  const guestSource = await readFile(
    new URL('fixtures/call-cell-world/guest.js', import.meta.url),
    'utf8',
  );
  const {component} = await componentize(guestSource, {
    disableFeatures: DISABLED_ENGINE_FEATURES,
    witPath: CANONICAL_WIT_DIRECTORY.pathname,
    worldName: WORLD_NAME,
  });
  const transpiled = await transpileBytes(new Uint8Array(component), {
    emitTypescriptDeclarations: false,
    instantiation: 'async',
    name: COMPONENT_NAME,
  });
  const moduleBytes = transpiled.files[`${COMPONENT_NAME}.js`];
  const moduleUrl = `data:text/javascript;base64,${
    Buffer.from(moduleBytes).toString('base64')}`;
  const generated = await import(moduleUrl);
  return generated.instantiate(
    async (file) => globalThis.WebAssembly.compile(transpiled.files[file]),
    {
      'lagrange:cell/call-context': {
        emit(key, partial) {
          if (hostState.emits.length >= EMIT_BUDGET) {
            const denial = new Error(DENY_BUDGET_EXHAUSTED);
            denial.payload = DENY_BUDGET_EXHAUSTED;
            throw denial;
          }
          hostState.emits.push([key, partial]);
        },
        callBounded() {
          const denial = new Error(DENY_BUDGET_EXHAUSTED);
          denial.payload = DENY_BUDGET_EXHAUSTED;
          throw denial;
        },
      },
    },
  );
}

// ComponentizeJS builds take ~25s on a loaded machine; the tap default 30s
// per-test timeout is too tight a budget for a toolchain-bound test.
test('call-cell world round-trips typed batches, budgets, and reduce',
  {timeout: 120000},
  async (t) => {
    const hostState = {emits: []};
    const exports = await buildAndInstantiate(hostState);

    const batch = [
      typedRow(1, 4.5), typedRow(2, 3.0), typedRow(BEYOND_F64_ID, 4.9),
      typedRow(4, 2.5), typedRow(5, 4.7),
    ];
    const runResult = JSON.parse(exports.run(batch, TOP_N_ARGUMENTS));

    t.same(
      runResult.kept.map((entry) => entry.id),
      [String(BEYOND_F64_ID), '5', '1'],
      'typed rows round-trip, rank by score, and preserve s64 identity ' +
      'beyond f64 precision',
    );
    assert.equal(runResult.nullLabels, batch.length,
      'the guest observed every null-value label column');
    assert.equal(runResult.nestedDenial, DENY_BUDGET_EXHAUSTED,
      'call-bounded was genuinely invoked and its typed denial observed');
    assert.equal(
      hostState.emits.length,
      EMIT_BUDGET,
      'the host captured exactly the budgeted number of partials',
    );
    t.same(
      runResult.denied.map((entry) => entry.code),
      [DENY_BUDGET_EXHAUSTED, DENY_BUDGET_EXHAUSTED],
      'the guest observed the typed budget-exhausted denial for the overflow',
    );

    const reduced = JSON.parse(
      exports.reduce([...hostState.emits].reverse(), TOP_N_ARGUMENTS),
    );
    t.same(
      reduced.map((entry) => entry.key),
      [String(BEYOND_F64_ID), '5', '1'],
      'reduce re-sorts unordered partials into the final ordered result',
    );
  });
