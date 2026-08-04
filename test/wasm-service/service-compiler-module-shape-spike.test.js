/**
 * Rung-1 spike proof for the code-first service compiler
 * (solve/epics/code-first-service-compiler.md): real ComponentizeJS
 * accepts a generated entrypoint that STATICALLY IMPORTS an unmodified
 * developer module graph (lagrange.service.js -> authoring.js +
 * handlers.js) — no Function.toString, no source rewriting, no bundler —
 * compiles it against the canonical wit/ service-cell world, and the
 * component answers two HTTP routes by method+path dispatch inside
 * handle-request while routing a handler's call(opRef) to the canonical
 * call-binding host import under the deterministically generated Binding
 * name. Instantiation goes through the same jco-transpile path the
 * runtime worker uses, against captured host fakes.
 */
import {readdir, readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {componentize} from '@bytecodealliance/componentize-js';
import {transpileBytes} from '@bytecodealliance/jco-transpile';
import t, {test} from '../../src/test-helpers/tap.js';

const CANONICAL_WIT_DIRECTORY = new URL('../../wit', import.meta.url);
const FIXTURE_DIRECTORY = new URL(
  'fixtures/service-compiler-module-shape/',
  import.meta.url,
);
// Full-literal specifier so the unused-files gate (knip) sees the fixture
// entry module as reachable; its static imports carry the rest of the
// developer module graph.
const GENERATED_ENTRY_PATH = fileURLToPath(new URL(
  'fixtures/service-compiler-module-shape/generated-entry.js',
  import.meta.url,
));
const SERVICE_MODULE_STATIC_IMPORT = 'from \'./lagrange.service.js\'';
// Fixture sources must never serialize or rewrite developer functions.
const FORBIDDEN_FIXTURE_SUBSTRINGS = Object.freeze([
  'Function.prototype.toString',
  '.toString(',
]);
const WORLD_NAME = 'service-cell';
const COMPONENT_NAME = 'service-compiler-module-shape-spike';
const DISABLED_ENGINE_FEATURES =
  ['random', 'stdio', 'clocks', 'http', 'fetch-event'];
const DENY_UNDECLARED = 'undeclared-capability';
const HTTP_STATUS_OK = 200;
const HTTP_STATUS_NOT_FOUND = 404;
const ROUTE_NOT_FOUND_CODE = 'route_not_found';
const ACCOUNT_ID = 42;
const OTHER_ACCOUNT_ID = 7;
const EXPECTED_BINDING_NAME =
  'account-summary--call--summarize-account-activity';
const CANNED_SUMMARY = Object.freeze({
  accountId: ACCOUNT_ID,
  totalCents: 1250,
  transactions: 2,
});
// tap's parseTestArgs mutates the options object, so each test gets a
// fresh literal instead of a shared frozen constant.
const TOOLCHAIN_TIMEOUT_MS = 120000;
// One ComponentizeJS build runs in this file (~20-25s on a loaded
// machine); tap's root 30s file watchdog is too tight for a
// toolchain-bound suite, mirroring the service-cell ABI precedent.
t.setTimeout(TOOLCHAIN_TIMEOUT_MS * 2);

let componentizeRunPromise = null;

// Exactly one componentize per process. The build passes ONLY the raw
// on-disk generated-entry.js path (the opts-object `sourcePath`
// signature) — no inlined source string, so ComponentizeJS itself must
// resolve the static developer-module imports. The recorded options are
// what the no-rewriting test asserts against.
function componentizeOnce() {
  componentizeRunPromise ??= (async () => {
    const options = {
      disableFeatures: DISABLED_ENGINE_FEATURES,
      sourcePath: GENERATED_ENTRY_PATH,
      witPath: CANONICAL_WIT_DIRECTORY.pathname,
      worldName: WORLD_NAME,
    };
    const {component} = await componentize(options);
    return {component, options};
  })();
  return componentizeRunPromise;
}

function createHostState() {
  return {bindingCalls: [], bindingResult: null, emits: []};
}

async function instantiateWithHostFakes(component, hostState) {
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
          hostState.bindingCalls.push([name, argumentsJson]);
          return hostState.bindingResult;
        },
        capability() {
          return 1;
        },
        read() {
          return 0;
        },
        write() {},
      },
    },
  );
}

// Serialized request shape the request Cell adapter hands components
// (src/service/request-cell-http-adapter.js normalizeHttpRequest).
function requestJson({method, path, body = null}) {
  return JSON.stringify({body, headers: {}, method, path, query: {}});
}

// normalizeComponentResponse contract: integer status, string-pair
// headers, string body (src/service/request-cell-routing-contract.js).
function assertCanonicalResponseShape(response, label) {
  assert.ok(Number.isInteger(response.status),
    `${label}: status is an integer`);
  assert.ok(Array.isArray(response.headers) && response.headers.every(
    (entry) => Array.isArray(entry) && entry.length === 2 &&
      entry.every((part) => typeof part === 'string'),
  ), `${label}: headers are string pairs`);
  assert.equal(typeof response.body, 'string', `${label}: body is a string`);
}

function transactionRow(accountId, amountCents) {
  return {
    columns: [
      {name: 'account_id', val: {tag: 'integer', val: BigInt(accountId)}},
      {name: 'amount_cents', val: {tag: 'integer', val: BigInt(amountCents)}},
      {name: 'label', val: {tag: 'null-value'}},
    ],
  };
}

test('handle-request dispatches two routes by method+path and routes ' +
  'call(opRef) to the canonical call-binding host import',
{timeout: TOOLCHAIN_TIMEOUT_MS},
async (t) => {
  const {component} = await componentizeOnce();
  const hostState = createHostState();
  hostState.bindingResult = JSON.stringify(CANNED_SUMMARY);
  const exports = await instantiateWithHostFakes(component, hostState);
  assert.equal(typeof exports.handleRequest, 'function',
    'WIT handle-request surfaces as the camelCase handleRequest export');

  const summary = JSON.parse(exports.handleRequest(requestJson({
    body: {accountId: ACCOUNT_ID},
    method: 'POST',
    path: '/accounts/summary',
  })));
  assertCanonicalResponseShape(summary, 'summary route');
  assert.equal(summary.status, HTTP_STATUS_OK,
    'POST /accounts/summary answers 200');
  t.same(JSON.parse(summary.body), CANNED_SUMMARY,
    'the summary body is the reduced payload the host binding returned');
  t.same(
    hostState.bindingCalls,
    [[EXPECTED_BINDING_NAME, JSON.stringify({accountId: ACCOUNT_ID})]],
    'the deterministically generated Binding name and the exact ' +
    'arguments JSON reached the callBinding host import',
  );

  const health = JSON.parse(exports.handleRequest(requestJson({
    method: 'GET',
    path: '/accounts/health',
  })));
  assertCanonicalResponseShape(health, 'health route');
  assert.equal(health.status, HTTP_STATUS_OK,
    'GET /accounts/health answers 200');
  t.same(JSON.parse(health.body), {status: 'ok'},
    'the handlers.js-imported handler served the second route');

  const missing = JSON.parse(exports.handleRequest(requestJson({
    method: 'GET',
    path: '/accounts/missing',
  })));
  assertCanonicalResponseShape(missing, 'unknown route');
  assert.equal(missing.status, HTTP_STATUS_NOT_FOUND,
    'an unknown route yields a typed non-200 response');
  assert.equal(JSON.parse(missing.body).code, ROUTE_NOT_FOUND_CODE,
    'the unknown-route response carries the typed code');
  assert.equal(hostState.bindingCalls.length, 1,
    'only the declared-operation route reached the host binding');
});

test('run and reduce round-trip the definition\'s distributed operation ' +
  'through the exported surface with the fake emit',
{timeout: TOOLCHAIN_TIMEOUT_MS},
async (t) => {
  const {component} = await componentizeOnce();
  const hostState = createHostState();
  const exports = await instantiateWithHostFakes(component, hostState);

  const runResult = JSON.parse(exports.run(
    [
      transactionRow(ACCOUNT_ID, 500),
      transactionRow(ACCOUNT_ID, 750),
      transactionRow(OTHER_ACCOUNT_ID, 999),
    ],
    JSON.stringify({accountId: ACCOUNT_ID}),
  ));
  t.same(runResult, {matched: 2, scanned: 3},
    'run flattened WIT rows to plain records for the developer function');
  t.same(hostState.emits, [['count', '2'], ['total', '1250']],
    'the developer emit reached the host emit import JSON-encoded');

  const reduced = JSON.parse(exports.reduce(
    hostState.emits,
    JSON.stringify({accountId: ACCOUNT_ID}),
  ));
  t.same(reduced, CANNED_SUMMARY,
    'reduce folded the emitted partials via the sum(key) helper');
});

test('the componentize input is the raw generated-entry.js module graph ' +
  '— no serialization, no bundling',
{timeout: TOOLCHAIN_TIMEOUT_MS},
async (t) => {
  const {options} = await componentizeOnce();
  assert.equal(options.sourcePath, GENERATED_ENTRY_PATH,
    'the build consumed the on-disk generated-entry.js by path');
  assert.equal('source' in options || 'jsSource' in options, false,
    'no inlined/bundled source string was handed to componentize');

  const entrySource = await readFile(GENERATED_ENTRY_PATH, 'utf8');
  assert.ok(entrySource.includes(SERVICE_MODULE_STATIC_IMPORT),
    'the entry statically imports the unmodified developer module');

  const fixtureFiles = await readdir(FIXTURE_DIRECTORY);
  assert.ok(fixtureFiles.length >= 4, 'the fixture module graph is present');
  for (const file of fixtureFiles) {
    const source = await readFile(new URL(file, FIXTURE_DIRECTORY), 'utf8');
    for (const forbidden of FORBIDDEN_FIXTURE_SUBSTRINGS) {
      assert.equal(source.includes(forbidden), false,
        `${file} contains no function serialization (${forbidden})`);
    }
  }
  t.pass('fixture sources are free of Function-serialization idioms');
});
