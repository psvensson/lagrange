/**
 * ABI proof for the canonical combined service-cell world (wit/world.wit):
 * with the real toolchain — ComponentizeJS build, jco transpile, host-side
 * instantiate, the same path src/runtime/wasi-component-cell-worker.js
 * uses — one component exports handle-request + run + reduce and imports
 * both `lagrange:cell/context` (including the typed call-binding surface)
 * and `lagrange:cell/call-context`.
 *
 * Compatibility crux proved here: jco-generated bindings destructure only
 * the functions the component itself imports, so a component compiled
 * against the OLD pre-call-binding context (the frozen legacy fixture
 * shape) and a call-cell-only component both instantiate unchanged
 * against the new full both-namespace host import set.
 */
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {componentize} from '@bytecodealliance/componentize-js';
import {transpileBytes} from '@bytecodealliance/jco-transpile';
import {test} from '../../src/test-helpers/tap.js';

const CANONICAL_WIT_DIRECTORY = new URL('../../wit', import.meta.url);
const FIXTURE_DIRECTORY = new URL(
  'fixtures/service-cell-world',
  import.meta.url,
);
const CALL_CELL_GUEST_URL = new URL(
  'fixtures/call-cell-world/guest.js',
  import.meta.url,
);
const WORLD = Object.freeze({
  CALL: 'call-cell',
  REQUEST: 'request-cell',
  SERVICE: 'service-cell',
});
const COMPONENT_NAME = 'service-cell-abi';
const DISABLED_ENGINE_FEATURES =
  ['random', 'stdio', 'clocks', 'http', 'fetch-event'];
const BRIDGE_UNAVAILABLE_CODE = 'call_bridge_unavailable';
const DENY_UNDECLARED = 'undeclared-capability';
const READ_STUB_VALUE = 7;
// tap's parseTestArgs mutates the options object, so each test gets
// a fresh literal instead of a shared frozen constant.
const TOOLCHAIN_TIMEOUT_MS = 120000;

async function buildComponent(guestUrl, witPath, worldName) {
  const guestSource = await readFile(guestUrl, 'utf8');
  const {component} = await componentize(guestSource, {
    disableFeatures: DISABLED_ENGINE_FEATURES,
    witPath,
    worldName,
  });
  return component;
}

async function instantiateWithFullImports(component, hostState) {
  const transpiled = await transpileBytes(new Uint8Array(component), {
    emitTypescriptDeclarations: false,
    instantiation: 'async',
    name: COMPONENT_NAME,
  });
  const moduleBytes = transpiled.files[`${COMPONENT_NAME}.js`];
  const moduleUrl = `data:text/javascript;base64,${
    Buffer.from(moduleBytes).toString('base64')}`;
  const generated = await import(moduleUrl);
  // The full both-namespace host import set — the shape the worker now
  // always supplies regardless of the component's own import list.
  return generated.instantiate(
    async (file) => globalThis.WebAssembly.compile(transpiled.files[file]),
    {
      'lagrange:cell/call-context': {
        callBounded() {
          const denial = new Error(DENY_UNDECLARED);
          denial.payload = DENY_UNDECLARED;
          throw denial;
        },
        emit(key, partial) {
          hostState.emits.push([key, partial]);
        },
      },
      'lagrange:cell/context': {
        callBinding(name, argumentsJson) {
          if (typeof hostState.bridge === 'function') {
            return hostState.bridge(name, argumentsJson);
          }
          const failure = new Error('No request-call bridge is available');
          failure.payload = {
            code: BRIDGE_UNAVAILABLE_CODE,
            message: failure.message,
            retryable: false,
          };
          throw failure;
        },
        capability() {
          return 1;
        },
        read(table, key) {
          hostState.reads.push([table, key]);
          return READ_STUB_VALUE;
        },
        write(table, key, value) {
          hostState.writes.push([table, key, value]);
        },
      },
    },
  );
}

function createHostState() {
  return {bridge: null, emits: [], reads: [], writes: []};
}

function amountRow(amount) {
  return {
    columns: [
      {name: 'amount', val: {tag: 'integer', val: BigInt(amount)}},
      {name: 'label', val: {tag: 'null-value'}},
    ],
  };
}

// ComponentizeJS builds take ~25s on a loaded machine; the tap default
// 30s per-test timeout is too tight for toolchain-bound tests.
test('service-cell world exports handle-request/run/reduce and drives ' +
  'both host interfaces from one component',
{timeout: TOOLCHAIN_TIMEOUT_MS},
async (t) => {
  const component = await buildComponent(
    new URL('fixtures/service-cell-world/guest.js', import.meta.url),
    CANONICAL_WIT_DIRECTORY.pathname,
    WORLD.SERVICE,
  );
  const hostState = createHostState();
  const exports = await instantiateWithFullImports(component, hostState);

  // The kebab-case WIT export `handle-request` surfaces as the camelCase
  // JS export `handleRequest` on both the guest and the host side.
  assert.equal(typeof exports.handleRequest, 'function',
    'WIT handle-request maps to the camelCase handleRequest export');

  const ioResult = JSON.parse(exports.handleRequest(JSON.stringify(
    {amount: 3, key: 2, probe: 'context-io'},
  )));
  t.same(
    ioResult,
    {capability: 1, total: READ_STUB_VALUE + 3},
    'handle-request runs with live read/write/capability context imports',
  );
  t.same(hostState.writes, [[0, 2, READ_STUB_VALUE + 3]],
    'the guest write reached the host context import');

  hostState.bridge = (name, argumentsJson) =>
    JSON.stringify({echo: [name, argumentsJson]});
  const bridged = JSON.parse(exports.handleRequest(JSON.stringify(
    {arguments: '{"a":1}', name: 'inner', probe: 'call-binding'},
  )));
  t.same(
    JSON.parse(bridged.value),
    {echo: ['inner', '{"a":1}']},
    'call-binding round-trips through a live host bridge',
  );

  hostState.bridge = null;
  const refusals = JSON.parse(exports.handleRequest(JSON.stringify(
    {probe: 'restricted'},
  )));
  assert.equal(refusals.callBinding.code, BRIDGE_UNAVAILABLE_CODE,
    'call-binding surfaces the typed binding-call-error the host threw');
  assert.equal(refusals.callBinding.retryable, false,
    'the typed binding-call-error carries the retryable flag');
  assert.equal(typeof refusals.callBinding.message, 'string');
  assert.ok(refusals.callBinding.message.length > 0,
    'the typed binding-call-error carries a non-empty message field');
  assert.equal(refusals.callBounded, DENY_UNDECLARED,
    'call-bounded surfaces its typed deny-code alongside call-binding');

  const runResult = JSON.parse(
    exports.run([amountRow(5), amountRow(6)], '{}'),
  );
  assert.equal(runResult.total, 11,
    'run folds the typed batch through the call-context surface');
  t.same(hostState.emits.at(-1), ['total', '11'],
    'run emitted its partial through the host emit import');

  const reduced = JSON.parse(
    exports.reduce([['total', '11'], ['total', '4']], '{}'),
  );
  t.same(reduced, {partials: 2, total: 15},
    'reduce folds emitted partials into the final result');
});

test('a component compiled against the old pre-call-binding request ' +
  'context instantiates and runs with the full host import set',
{timeout: TOOLCHAIN_TIMEOUT_MS},
async (t) => {
  const component = await buildComponent(
    new URL(
      'fixtures/service-cell-world/legacy-request-guest.js',
      import.meta.url,
    ),
    path.join(FIXTURE_DIRECTORY.pathname, 'legacy-request-wit'),
    WORLD.REQUEST,
  );
  const hostState = createHostState();
  const exports = await instantiateWithFullImports(component, hostState);
  const result = JSON.parse(exports.run(JSON.stringify(
    {amount: 4, key: 9},
  )));
  t.same(result, {total: READ_STUB_VALUE + 4},
    'the legacy-shape component runs; jco lifts only the functions the ' +
    'component imports, so the extra call-binding host import is inert');
  t.same(hostState.writes, [[0, 9, READ_STUB_VALUE + 4]],
    'the legacy component reached the unchanged read/write imports');
});

test('a component compiled against the canonical call-cell world ' +
  'instantiates and runs with the full host import set',
{timeout: TOOLCHAIN_TIMEOUT_MS},
async (t) => {
  const component = await buildComponent(
    CALL_CELL_GUEST_URL,
    CANONICAL_WIT_DIRECTORY.pathname,
    WORLD.CALL,
  );
  const hostState = createHostState();
  const exports = await instantiateWithFullImports(component, hostState);
  const runResult = JSON.parse(exports.run(
    [
      {
        columns: [
          {name: 'id', val: {tag: 'integer', val: 1n}},
          {name: 'score', val: {tag: 'real', val: 4.5}},
          {name: 'label', val: {tag: 'null-value'}},
        ],
      },
    ],
    JSON.stringify({topN: 1}),
  ));
  t.same(runResult.kept, [{id: '1', score: 4.5}],
    'the call-only component runs against the full host import set');
  assert.equal(runResult.nestedDenial, DENY_UNDECLARED,
    'the call-only component still observes its typed denial');
  t.same(hostState.emits, [['1', '4.5']],
    'the call-only component emitted through the shared host imports');
});
