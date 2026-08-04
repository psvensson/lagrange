/**
 * Deterministic parity proof for the code-first account-summary example
 * (solve/epics/code-first-service-compiler.md, rung 4): the committed
 * lagrange.service.js — authored purely with src/authoring/* — drives the
 * whole deployment surface through the real owners.
 *
 *   - buildDeploymentRecords derives the manifest, one call Binding, two
 *     request Bindings (the two routes), and exactly one outbound-call
 *     access policy (the health route, declaring no calls, gets none).
 *   - the SAME shared componentize owner (src/service/service-component-build)
 *     compiles the generated entry against the sealed service-cell world,
 *     and the component answers BOTH routes by method+path dispatch while
 *     routing call(descriptor) to the canonical call-binding host import
 *     under the deterministically generated Binding name the records own.
 *   - a host fake gates callBinding against the generated access-policy
 *     allowlist, so the declared route succeeds (200) and an undeclared
 *     target is refused (403 target_not_allowed) by the policy — never by
 *     local code (admission-gating).
 *   - red-on-revert: the deleted hand-built deployment builder is absent
 *     and no raw Binding-name literal survives in the example sources.
 *
 * Instantiation goes through the same jco-transpile path the runtime
 * worker uses, against captured host fakes (harness-fidelity: real
 * componentize, real generator, real contract validators).
 */
import {readdir, readFile, stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

import {transpileBytes} from '@bytecodealliance/jco-transpile';

import {
  DEPLOYMENT_RECORD_STATUS,
  buildDeploymentRecords,
  componentizeService,
  normalizeServiceSource,
} from '../../src/service/index.js';
import t, {test} from '../../src/test-helpers/tap.js';

const EXAMPLE_DIRECTORY = new URL(
  '../../examples/call-binding-account-summary/',
  import.meta.url,
);
const SERVICE_MODULE_URL = new URL('lagrange.service.js', EXAMPLE_DIRECTORY);
const GENERATED_ENTRY_PATH = fileURLToPath(
  new URL('generated-entry.js', EXAMPLE_DIRECTORY),
);
const DELETED_BUILDER_FILE = 'call-binding-example-contract.js';
// The kebab Binding-name literal that must NOT survive in example source
// (red-on-revert). Split so this guard file never trips its own check.
const FORBIDDEN_BINDING_LITERAL = ['summarize', 'account', 'activity'].join('-');

// A deterministic, structurally-valid artifact descriptor. The parity of
// interest is the record SHAPE the generator derives from the IR, not the
// bytes, so a canned digest/ref/size stands in for the OCI receipt.
const ARTIFACT = Object.freeze({
  digest: `sha256:${'a'.repeat(64)}`,
  ref: 'registry.example.test/examples/account-summary:1.0.0',
  sizeBytes: 4096,
});

const SERVICE_NAME = 'account-summary';
const CALL_BINDING_NAME = `${SERVICE_NAME}--call--${FORBIDDEN_BINDING_LITERAL}`;
const SUMMARY_REQUEST_BINDING = `${SERVICE_NAME}--request--account-summary`;
const HEALTH_REQUEST_BINDING = `${SERVICE_NAME}--request--account-health`;

const WORLD_NAME = 'service-cell';
const COMPONENT_NAME = 'service-compiler-account-summary-parity';
const HTTP_STATUS_OK = 200;
const HTTP_STATUS_FORBIDDEN = 403;
const HTTP_STATUS_NOT_FOUND = 404;
const ROUTE_NOT_FOUND_CODE = 'route_not_found';
const TARGET_NOT_ALLOWED_CODE = 'target_not_allowed';
const UNDECLARED_TARGET = 'not-declared';
const ACCOUNT_ID = 202;
const OTHER_ACCOUNT_ID = 7;
const CANNED_SUMMARY = Object.freeze({
  accountId: ACCOUNT_ID,
  contributingShards: 2,
  flagged: 3,
  largestCents: 18_500,
  meanCents: 9_250,
  totalCents: 462_500,
  transactions: 50,
});

const TOOLCHAIN_TIMEOUT_MS = 120000;
// One ComponentizeJS build runs in this file; tap's 30s file watchdog is
// too tight for a toolchain-bound suite (service-cell ABI precedent).
t.setTimeout(TOOLCHAIN_TIMEOUT_MS * 2);

let componentizeRunPromise = null;
let recordsPromise = null;

// Exactly one componentize per process, through the shared owner (the sole
// componentize entry point). Passing ONLY the on-disk generated-entry.js
// path forces ComponentizeJS to resolve the developer-module imports.
function componentizeOnce() {
  componentizeRunPromise ??= componentizeService({
    sourcePath: GENERATED_ENTRY_PATH,
    worldName: WORLD_NAME,
  });
  return componentizeRunPromise;
}

async function deploymentRecordsOnce() {
  recordsPromise ??= (async () => {
    const normalized = await normalizeServiceSource(SERVICE_MODULE_URL);
    assert.equal(normalized.status, 'accepted',
      `service source normalized: ${JSON.stringify(normalized.errors)}`);
    const result = buildDeploymentRecords({artifact: ARTIFACT, ir: normalized.ir});
    assert.equal(result.status, DEPLOYMENT_RECORD_STATUS.ACCEPTED,
      `records accepted: ${JSON.stringify(result.errors)}`);
    return result.records;
  })();
  return recordsPromise;
}

function createHostState() {
  return {bindingCalls: [], bindingResult: null, emits: []};
}

// The host fake gates callBinding on the GENERATED access-policy allowlist
// (the single allowed call Binding name). A name outside it fails closed
// with the typed target_not_allowed error the ABI surfaces as a thrown
// error carrying `.payload` - exactly the runtime bridge's contract.
async function instantiateWithHostFakes(component, hostState, allowedCallBinding) {
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
          throw new Error('undeclared-capability');
        },
        emit(key, partial) {
          hostState.emits.push([key, partial]);
        },
      },
      'lagrange:cell/context': {
        callBinding(name, argumentsJson) {
          hostState.bindingCalls.push([name, argumentsJson]);
          if (name !== allowedCallBinding) {
            // The WIT binding-call-error record: {code, message, retryable}.
            // The ABI surfaces it to the guest as a thrown error carrying
            // `.payload`, exactly as the runtime call bridge does.
            const refusal = new Error(TARGET_NOT_ALLOWED_CODE);
            refusal.payload = {
              code: TARGET_NOT_ALLOWED_CODE,
              message: 'target not allowed',
              retryable: false,
            };
            throw refusal;
          }
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

function transactionRow(id, accountId, amountCents, flagged) {
  return {
    columns: [
      {name: 'id', val: {tag: 'integer', val: BigInt(id)}},
      {name: 'account_id', val: {tag: 'integer', val: BigInt(accountId)}},
      {name: 'amount_cents', val: {tag: 'integer', val: BigInt(amountCents)}},
      {name: 'flagged', val: {tag: 'integer', val: BigInt(flagged)}},
    ],
  };
}

test('the generator derives the manifest, both request Bindings, the one ' +
  'call Binding, and a single outbound-call policy from lagrange.service.js',
{timeout: TOOLCHAIN_TIMEOUT_MS},
async (t) => {
  const records = await deploymentRecordsOnce();

  const exportNames = records.manifest.exports.map((e) => e.name).sort();
  t.same(exportNames, ['handle-request', 'run'],
    'the manifest declares the request and call exports');

  const bySource = {call: [], request: []};
  for (const binding of records.bindings) bySource[binding.source.kind].push(binding);
  t.same(bySource.call.map((b) => b.name), [CALL_BINDING_NAME],
    'exactly one generated call Binding, named from the operation id');
  t.same(bySource.request.map((b) => b.name).sort(),
    [HEALTH_REQUEST_BINDING, SUMMARY_REQUEST_BINDING],
    'one generated request Binding per route');

  const summaryBinding = bySource.request.find(
    (b) => b.source.path === '/accounts/summary');
  assert.equal(summaryBinding.source.method, 'POST',
    'the summary route Binding keeps its method+path');
  const healthBinding = bySource.request.find(
    (b) => b.source.path === '/accounts/health');
  assert.equal(healthBinding.source.method, 'GET',
    'the second route is served by the same component');

  assert.equal(records.accessPolicies.length, 1,
    'exactly one access policy: the health route declares no calls');
  const policy = records.accessPolicies[0];
  assert.equal(policy.binding_name, SUMMARY_REQUEST_BINDING,
    'the policy gates the summary request Binding');
  t.same(policy.calls, [{binding: CALL_BINDING_NAME}],
    'the allowlist references the generated call Binding name');
  assert.equal(
    records.accessPolicies.some((p) => p.binding_name === HEALTH_REQUEST_BINDING),
    false,
    'no outbound-call policy is emitted for the health route');
});

test('the componentized generated entry dispatches both routes and routes ' +
  'call(descriptor) to the generated Binding name the policy allows',
{timeout: TOOLCHAIN_TIMEOUT_MS},
async (t) => {
  const records = await deploymentRecordsOnce();
  const allowedCallBinding = records.accessPolicies[0].calls[0].binding;
  const {component} = await componentizeOnce();
  const hostState = createHostState();
  hostState.bindingResult = JSON.stringify(CANNED_SUMMARY);
  const exports = await instantiateWithHostFakes(
    component, hostState, allowedCallBinding);
  assert.equal(typeof exports.handleRequest, 'function',
    'WIT handle-request surfaces as the camelCase handleRequest export');

  const summary = JSON.parse(exports.handleRequest(requestJson({
    body: {accountId: ACCOUNT_ID},
    method: 'POST',
    path: '/accounts/summary',
  })));
  assert.equal(summary.status, HTTP_STATUS_OK,
    'POST /accounts/summary answers 200 through the composed path');
  t.same(JSON.parse(summary.body), CANNED_SUMMARY,
    'the summary body is the reduced payload the allowed Binding returned');
  t.same(hostState.bindingCalls,
    [[CALL_BINDING_NAME, JSON.stringify({accountId: ACCOUNT_ID})]],
    'the generated call Binding name and exact arguments reached callBinding');

  const health = JSON.parse(exports.handleRequest(requestJson({
    method: 'GET',
    path: '/accounts/health',
  })));
  assert.equal(health.status, HTTP_STATUS_OK,
    'GET /accounts/health answers 200 by method+path dispatch');
  t.same(JSON.parse(health.body), {service: SERVICE_NAME, status: 'ok'},
    'the second route served its static health payload');

  const missing = JSON.parse(exports.handleRequest(requestJson({
    method: 'GET',
    path: '/accounts/missing',
  })));
  assert.equal(missing.status, HTTP_STATUS_NOT_FOUND,
    'an unknown route yields a typed non-200 response');
  assert.equal(JSON.parse(missing.body).code, ROUTE_NOT_FOUND_CODE,
    'the unknown-route response carries the typed code');
});

test('an undeclared outbound target is refused by the generated policy ' +
  'allowlist as a fail-closed 403, not by local code (admission-gating)',
{timeout: TOOLCHAIN_TIMEOUT_MS},
async (t) => {
  const records = await deploymentRecordsOnce();
  const allowedCallBinding = records.accessPolicies[0].calls[0].binding;
  const {component} = await componentizeOnce();
  const hostState = createHostState();
  hostState.bindingResult = JSON.stringify(CANNED_SUMMARY);
  const exports = await instantiateWithHostFakes(
    component, hostState, allowedCallBinding);

  const refused = JSON.parse(exports.handleRequest(requestJson({
    body: {accountId: ACCOUNT_ID, target: UNDECLARED_TARGET},
    method: 'POST',
    path: '/accounts/summary',
  })));
  assert.equal(refused.status, HTTP_STATUS_FORBIDDEN,
    'the undeclared target maps to a 403 through the typed call error');
  const refusedBody = JSON.parse(refused.body);
  assert.equal(refusedBody.code, TARGET_NOT_ALLOWED_CODE,
    'the honest target_not_allowed code reaches the HTTP body');
  assert.equal(refusedBody.retryable, false, 'the refusal is not retryable');
  t.same(hostState.bindingCalls,
    [[UNDECLARED_TARGET, JSON.stringify({accountId: ACCOUNT_ID})]],
    'the undeclared name reached the host gate - it was not blocked locally');
});

test('run and reduce round-trip the distributed operation through the ' +
  'exported surface, matching the account-summary payload fields',
{timeout: TOOLCHAIN_TIMEOUT_MS},
async (t) => {
  const {component} = await componentizeOnce();
  const hostState = createHostState();
  const exports = await instantiateWithHostFakes(component, hostState, null);

  const runResult = JSON.parse(exports.run(
    [
      transactionRow(10, ACCOUNT_ID, 500, 0),
      transactionRow(20, ACCOUNT_ID, 750, 1),
      transactionRow(30, OTHER_ACCOUNT_ID, 999, 0),
    ],
    JSON.stringify({accountId: ACCOUNT_ID}),
  ));
  t.same(runResult, {matched: 2, scanned: 3},
    'run kept only the requested account and flattened WIT rows');
  t.same(hostState.emits,
    [['count:10', '2'], ['total:10', '1250'],
      ['largest:10', '750'], ['flagged:10', '1']],
    'the shard-keyed numeric partials reached the host emit import');

  const reduced = JSON.parse(exports.reduce(
    hostState.emits,
    JSON.stringify({accountId: ACCOUNT_ID}),
  ));
  t.same(reduced, {
    accountId: ACCOUNT_ID,
    contributingShards: 1,
    flagged: 1,
    largestCents: 750,
    meanCents: 625,
    totalCents: 1250,
    transactions: 2,
  }, 'reduce folded the partials into the full account-summary shape');
});

test('red-on-revert: the hand-built deployment builder is gone and no raw ' +
  'Binding-name literal survives in the example sources',
{timeout: TOOLCHAIN_TIMEOUT_MS},
async (t) => {
  const directoryPath = fileURLToPath(EXAMPLE_DIRECTORY);
  const entries = await readdir(directoryPath);
  assert.equal(entries.includes(DELETED_BUILDER_FILE), false,
    'the hand-authored call-binding-example-contract.js must stay deleted');

  for (const entry of entries) {
    const entryUrl = new URL(entry, EXAMPLE_DIRECTORY);
    if (!(await stat(fileURLToPath(entryUrl))).isFile()) continue;
    if (!entry.endsWith('.js')) continue;
    const source = await readFile(entryUrl, 'utf8');
    assert.equal(source.includes(FORBIDDEN_BINDING_LITERAL), false,
      `${entry} must not carry the raw Binding-name literal`);
  }
  t.pass('example sources are free of the hand-built builder and raw literal');
});
