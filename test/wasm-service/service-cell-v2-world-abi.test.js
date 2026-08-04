/**
 * ABI proof for the additive service-cell-v2 generic-dispatch world
 * (wit/world.wit): with the real toolchain — ComponentizeJS build,
 * jco transpile, host-side instantiate, the same path
 * src/runtime/wasi-component-cell-worker.js uses — one generated-entry
 * component exports the fixed v2 surface
 * handle-request(handler, request) / run(operation, batch, arguments) /
 * reduce(operation, partials, arguments), its dispatch tables route TWO
 * request handlers and TWO distributed operations by explicit id, and an
 * unknown handler or operation id is refused with a typed error.
 *
 * Additivity is pinned both ways: the pre-existing service-cell,
 * request-cell, and call-cell world text is byte-identical to the pre-v2
 * sealed shape (a textual assertion over wit/world.wit, so no stored
 * copy can drift), and a component built against the unchanged
 * service-cell world still compiles and instantiates through the same
 * toolchain.
 */
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {componentize} from '@bytecodealliance/componentize-js';
import {transpileBytes} from '@bytecodealliance/jco-transpile';
import t, {test} from '../../src/test-helpers/tap.js';

const CANONICAL_WIT_DIRECTORY = new URL('../../wit', import.meta.url);
const CANONICAL_WORLD_WIT_URL = new URL('../../wit/world.wit', import.meta.url);
const V2_GUEST_URL = new URL(
  'fixtures/service-cell-v2-world/guest.js',
  import.meta.url,
);
const SERVICE_CELL_GUEST_URL = new URL(
  'fixtures/service-cell-world/guest.js',
  import.meta.url,
);
const WORLD = Object.freeze({
  SERVICE: 'service-cell',
  SERVICE_V2: 'service-cell-v2',
});
const COMPONENT_NAME = 'service-cell-v2-abi';
const DISABLED_ENGINE_FEATURES =
  ['random', 'stdio', 'clocks', 'http', 'fetch-event'];
const TOOLCHAIN_TIMEOUT_MS = 120000;
// Three ComponentizeJS builds run in this file (~20-25s each on a loaded
// machine); tap's root 30s file watchdog is too tight for a
// toolchain-bound suite, mirroring the service-cell ABI test precedent.
t.setTimeout(TOOLCHAIN_TIMEOUT_MS * 3);

// The pre-v2 world text, sealed byte-for-byte: additivity (quest
// constraint additive-world-only) means this exact block survives in
// wit/world.wit unchanged. Derived from the sealed service-cell world at
// the quest's base commit; the assertion pins text, not a stored copy.
const SEALED_PRE_V2_WORLD_TEXT = `world request-cell {
  import context;
  export run: func(request: string) -> string;
}

world call-cell {
  use call-context.{row};
  import call-context;

  /// Partition-local work: receives the Binding-declared statement's
  /// grouped, bounded batch. Returns this shard's partial as JSON.
  export run: func(batch: list<row>, arguments: string) -> string;

  /// Reduction: folds the published partials into the final result.
  export reduce: func(partials: list<tuple<string, string>>, arguments: string) -> string;
}

/// Combined world: one component that serves the request surface and the
/// call/pushdown surface. The component is bound twice (a request Binding
/// and a call Binding), yielding two Cells; each Cell's invocation mode
/// restricts which host imports are live — the others fail closed.
world service-cell {
  use call-context.{row};
  import context;
  import call-context;

  export handle-request: func(request: string) -> string;
  export run: func(batch: list<row>, arguments: string) -> string;
  export reduce: func(partials: list<tuple<string, string>>, arguments: string) -> string;
}`;

async function buildComponent(guestUrl, worldName) {
  const guestSource = await readFile(guestUrl, 'utf8');
  const {component} = await componentize(guestSource, {
    disableFeatures: DISABLED_ENGINE_FEATURES,
    witPath: CANONICAL_WIT_DIRECTORY.pathname,
    worldName,
  });
  return component;
}

async function instantiate(component) {
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
        callBounded() {
          const denial = new Error('undeclared-capability');
          denial.payload = 'undeclared-capability';
          throw denial;
        },
        emit() {},
      },
      'lagrange:cell/context': {
        callBinding() {
          const failure = new Error('No request-call bridge is available');
          failure.payload = {
            code: 'call_bridge_unavailable',
            message: failure.message,
            retryable: false,
          };
          throw failure;
        },
        capability() {
          return 0;
        },
        read() {
          return 0;
        },
        write() {},
      },
    },
  );
}

function amountRow(amount) {
  return {
    columns: [
      {name: 'amount', val: {tag: 'integer', val: BigInt(amount)}},
    ],
  };
}

test('service-cell-v2 world: dispatch tables route two handlers and two ' +
  'operations by id and refuse unknown ids with typed errors',
{timeout: TOOLCHAIN_TIMEOUT_MS},
async (t) => {
  const component = await buildComponent(V2_GUEST_URL, WORLD.SERVICE_V2);
  const exports = await instantiate(component);

  assert.equal(typeof exports.handleRequest, 'function',
    'WIT handle-request maps to the camelCase handleRequest export');

  // Request-handler dispatch: two handlers routed by explicit id.
  const summary = JSON.parse(exports.handleRequest(
    'accountSummary',
    JSON.stringify({
      body: JSON.stringify({accountId: 41}),
      method: 'POST',
      path: '/accounts/summary',
    }),
  ));
  assert.equal(summary.status, 200, 'accountSummary handler answered 200');
  t.same(JSON.parse(summary.body),
    {accountId: 41, summary: {total: 41}},
    'accountSummary dispatched by id and invoked its declared operation');

  const health = JSON.parse(exports.handleRequest(
    'accountHealth',
    JSON.stringify({method: 'GET', path: '/accounts/health'}),
  ));
  assert.equal(health.status, 200, 'accountHealth handler answered 200');
  t.same(JSON.parse(health.body), {status: 'ok'},
    'accountHealth dispatched by id on the same component');

  const unknownHandler = JSON.parse(exports.handleRequest(
    'nonexistentHandler', '{}'));
  t.same(unknownHandler,
    {code: 'unknown_handler_id', id: 'nonexistentHandler'},
    'an unknown handler id is refused with a typed error');

  // Distributed-operation dispatch: two operations routed by explicit id.
  const summarized = JSON.parse(exports.run(
    'summarizeActivity',
    [amountRow(5), amountRow(6)],
    JSON.stringify({bias: 1}),
  ));
  t.same(summarized.emitted, [{key: 'total', partialJson: '12'}],
    'summarizeActivity run emitted its partial by operation id');
  t.same(summarized.result, {scanned: 2},
    'summarizeActivity run returned its shard result');

  const counted = JSON.parse(exports.run(
    'countRows',
    [amountRow(5), amountRow(6), amountRow(7)],
    '{}',
  ));
  t.same(counted.emitted, [{key: 'count', partialJson: '3'}],
    'countRows run emitted its partial by operation id on the same component');

  const reducedTotal = JSON.parse(exports.reduce(
    'summarizeActivity',
    [['total', '12'], ['total', '4']],
    JSON.stringify({bias: 1}),
  ));
  t.same(reducedTotal, {total: 15},
    'summarizeActivity reduce folded partials by operation id');

  const reducedCount = JSON.parse(exports.reduce(
    'countRows',
    [['count', '3'], ['count', '2']],
    '{}',
  ));
  t.same(reducedCount, {count: 5},
    'countRows reduce folded partials by operation id');

  const unknownRun = JSON.parse(exports.run(
    'nonexistentOperation', [], '{}'));
  t.same(unknownRun,
    {code: 'unknown_operation_id', id: 'nonexistentOperation'},
    'an unknown operation id is refused with a typed error in run');

  const unknownReduce = JSON.parse(exports.reduce(
    'nonexistentOperation', [], '{}'));
  t.same(unknownReduce,
    {code: 'unknown_operation_id', id: 'nonexistentOperation'},
    'an unknown operation id is refused with a typed error in reduce');
});

test('additive world only: the pre-v2 world text is byte-identical and ' +
  'a service-cell component still builds and instantiates',
{timeout: TOOLCHAIN_TIMEOUT_MS},
async (t) => {
  const worldWit = await readFile(CANONICAL_WORLD_WIT_URL, 'utf8');
  assert.ok(worldWit.includes(SEALED_PRE_V2_WORLD_TEXT),
    'wit/world.wit keeps the sealed request-cell/call-cell/service-cell ' +
    'world text byte-identical after the v2 addition');
  assert.ok(worldWit.includes('world service-cell-v2 {'),
    'wit/world.wit declares the additive service-cell-v2 world');

  const component = await buildComponent(SERVICE_CELL_GUEST_URL, WORLD.SERVICE);
  const exports = await instantiate(component);
  const result = JSON.parse(exports.handleRequest(JSON.stringify(
    {amount: 3, key: 2, probe: 'context-io'},
  )));
  t.same(result, {capability: 0, total: 3},
    'a component built against the unchanged service-cell world ' +
    'instantiates and runs after the v2 addition');
});
