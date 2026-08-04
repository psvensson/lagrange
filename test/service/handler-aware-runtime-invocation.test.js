/**
 * Guard test for handler-aware runtime invocation
 * (handler-aware-runtime-invocation).
 *
 * One service-cell-v2 artifact serves multiple HTTP routes and multiple
 * distributed operations: the request route resolver surfaces the bound
 * handler_id, the request-cell invocation passes it as the fixed
 * handle-request export's first argument, the call-cell invocation
 * passes the resolved operation id as the fixed run/reduce exports'
 * first argument (never encoded inside the arguments JSON), and
 * v1-interface bindings keep their existing argument shapes. The
 * end-to-end dispatch property is proven against a real componentized
 * v2 component (ComponentizeJS + jco, the runtime worker's own path).
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';

import {
  normalizeServiceDefinition,
  IR_TARGET,
} from '../../src/service/service-source-contract.js';
import {
  buildDeploymentRecords,
} from '../../src/service/service-deployment-record-generator.js';
import {
  componentizeService,
} from '../../src/service/service-component-build.js';
import {
  emitServiceEntry,
} from '../../src/service/service-entry-generator.js';
import {defineService} from '../../src/authoring/define-service.js';
import {distributed} from '../../src/authoring/distributed-operation.js';
import {http} from '../../src/authoring/request-handler.js';
import {sql} from '../../src/authoring/sql-template.js';
import {
  buildCallCellInvocationProbe,
  buildRequestCellInvocationProbe,
  resolveRequestRouteProbe,
  resolveCallRouteProbe,
} from './helpers/handler-aware-invocation-probe.js';
import {transpileBytes} from '@bytecodealliance/jco-transpile';
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

const TOOLCHAIN_TIMEOUT_MS = 120000;

// A two-route, two-operation v2 service: the exact shape the pre-v2
// bridge refused (the second operation used to trip
// single_operation_restriction).
function v2ServiceDefinition() {
  const summarize = distributed({
    reduce: (partials) => ({
      total: partials.reduce((sum, [, partial]) => sum + Number(partial), 0),
    }),
    run: (rows, _args, {emit}) => {
      let total = 0;
      for (const row of rows) total += Number(row.amount_cents ?? 0);
      emit('total', total);
      return {scanned: rows.length};
    },
    statement: sql`SELECT amount_cents FROM account_activity`,
  });
  const count = distributed({
    reduce: (partials) => ({
      count: partials.reduce((sum, [, partial]) => sum + Number(partial), 0),
    }),
    run: (rows, _args, {emit}) => {
      emit('count', rows.length);
      return {scanned: rows.length};
    },
    statement: sql`SELECT id FROM account_activity`,
  });
  return defineService({
    handlers: {
      accountHealth: http.get('/accounts/health', {
        handle: (_request, context) => context.json({status: 'ok'}),
      }),
      accountSummary: http.post('/accounts/summary', {
        calls: [summarize, count],
        handle: (request, context) => {
          const body = JSON.parse(request.body || '{}');
          return context.json({
            count: context.call(count, body),
            summary: context.call(summarize, body),
          });
        },
      }),
    },
    name: 'v2-ledger',
    operations: {countRows: count, summarizeActivity: summarize},
    version: '1.0.0',
  });
}

test('the single-operation IR restriction lifts for an explicit v2 ' +
  'target and stays fail-closed for the pre-v2 target',
() => {
  const definition = v2ServiceDefinition();
  const preV2 = normalizeServiceDefinition(definition);
  assert.equal(preV2.status, 'rejected');
  assert.equal(
    preV2.errors.some(
      (error) => error.code === 'single_operation_restriction'),
    true,
    'the pre-v2 target still refuses two operations');

  const v2 = normalizeServiceDefinition(
    definition, {multiOperationTarget: true});
  assert.equal(v2.status, 'accepted', JSON.stringify(v2.errors));
  assert.equal(v2.ir.target, IR_TARGET.SERVICE_CELL_V2);
  assert.deepEqual(
    v2.ir.operations.map((operation) => operation.id).sort(),
    ['countRows', 'summarizeActivity']);
});

test('v2-target records ride Binding schema v3 with handler ids and ' +
  '*_v2 manifest interfaces',
() => {
  const v2 = normalizeServiceDefinition(
    v2ServiceDefinition(), {multiOperationTarget: true});
  const result = buildDeploymentRecords({
    artifact: {
      digest: `sha256:${'c'.repeat(64)}`,
      ref: 'registry.example.test/services/v2-ledger:1.0.0',
      sizeBytes: 4096,
    },
    ir: v2.ir,
  });
  assert.equal(result.status, 'accepted', JSON.stringify(result.errors));

  const interfaces = result.records.manifest.exports.map(
    (entry) => `${entry.name}:${entry.interface}`).sort();
  assert.deepEqual(interfaces, [
    'handle-request:request_v2',
    'run:call_v2',
  ]);

  const byName = new Map(
    result.records.bindings.map((binding) => [binding.name, binding]));
  const summary = byName.get('v2-ledger--request--account-summary');
  assert.equal(summary.schema_version, 3);
  assert.deepEqual(summary.target.handler_id, 'accountSummary');
  assert.equal(summary.target.interface, 'request_v2');
  assert.equal(Object.hasOwn(summary.target, 'export_name'), false);

  for (const [name, handlerId] of [
    ['v2-ledger--call--summarize-activity', 'summarizeActivity'],
    ['v2-ledger--call--count-rows', 'countRows'],
  ]) {
    const binding = byName.get(name);
    assert.equal(binding.schema_version, 3, name);
    assert.equal(binding.target.handler_id, handlerId, name);
    assert.equal(binding.target.interface, 'call_v2', name);
  }
});

test('route resolvers surface handler_id for v3 bindings and null for ' +
  'v2-schema bindings',
() => {
  const v2 = normalizeServiceDefinition(
    v2ServiceDefinition(), {multiOperationTarget: true});
  const records = buildDeploymentRecords({
    artifact: {
      digest: `sha256:${'c'.repeat(64)}`,
      ref: 'registry.example.test/services/v2-ledger:1.0.0',
      sizeBytes: 4096,
    },
    ir: v2.ir,
  }).records;

  const summaryRoute = resolveRequestRouteProbe(records, {
    method: 'POST', path: '/accounts/summary',
  });
  assert.equal(summaryRoute.handlerId, 'accountSummary');
  const healthRoute = resolveRequestRouteProbe(records, {
    method: 'GET', path: '/accounts/health',
  });
  assert.equal(healthRoute.handlerId, 'accountHealth');

  const callRoute = resolveCallRouteProbe(
    records, 'v2-ledger--call--summarize-activity');
  assert.equal(callRoute.handlerId, 'summarizeActivity');

  // v1-interface binding on the same shape: handlerId is null and the
  // invocation argument shapes stay v1 (request-only, batch+arguments).
  const v1Definition = defineService({
    handlers: {
      only: http.post('/only', {
        calls: [],
        handle: (_request, context) => context.json({ok: true}),
      }),
    },
    name: 'v1-service',
    operations: {},
    version: '1.0.0',
  });
  const v1Ir = normalizeServiceDefinition(v1Definition).ir;
  const v1Records = buildDeploymentRecords({
    artifact: {
      digest: `sha256:${'d'.repeat(64)}`,
      ref: 'registry.example.test/services/v1-service:1.0.0',
      sizeBytes: 2048,
    },
    ir: v1Ir,
  }).records;
  const v1Route = resolveRequestRouteProbe(v1Records, {
    method: 'POST', path: '/only',
  });
  assert.equal(v1Route.handlerId, null);
  const v1Invocation = buildRequestCellInvocationProbe(
    v1Route, {method: 'POST', path: '/only', body: '{}'});
  assert.equal(v1Invocation.args.length, 1,
    'v1-interface bindings keep the request-only argument shape');
});

test('invocation builders pass handler/operation identity as ABI ' +
  'arguments, never inside the payload JSON',
() => {
  const requestInvocation = buildRequestCellInvocationProbe(
    {handlerId: 'accountSummary'},
    {method: 'POST', path: '/accounts/summary', body: '{"accountId":1}'});
  assert.equal(requestInvocation.args[0], 'accountSummary');
  const requestPayload = JSON.parse(requestInvocation.args[1]);
  assert.equal(Object.hasOwn(requestPayload, 'handlerId'), false,
    'no handler tag inside the request JSON');

  const runInvocation = buildCallCellInvocationProbe(
    {handlerId: 'summarizeActivity'},
    {arguments: '{}'}, {batch: [{amount_cents: 5}], exportName: 'run'});
  assert.deepEqual(runInvocation.args.slice(0, 1), ['summarizeActivity']);
  assert.equal(runInvocation.args[1][0].amount_cents, 5,
    'the batch rides as the second argument');
  assert.equal(runInvocation.args[2], '{}',
    'the arguments JSON is untouched by operation identity');

  const reduceInvocation = buildCallCellInvocationProbe(
    {handlerId: 'countRows'},
    {arguments: '{}'}, {exportName: 'reduce', partials: [['count', '3']]});
  assert.deepEqual(reduceInvocation.args[0], 'countRows');
  assert.deepEqual(reduceInvocation.args[1], [['count', '3']],
    'reduce partials ride as the second argument');
});

test('end-to-end: one componentized v2 component dispatches two routes ' +
  'and two operations by id through the runtime argument shape',
{timeout: TOOLCHAIN_TIMEOUT_MS},
async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'handler-aware-e2e-'));
  try {
    // Emit the v2 generated entry for the two-route/two-operation
    // service through the REAL compiler emitter, then componentize it
    // against the v2 world through the shared owner. The authoring
    // imports are rewritten to a local `authoring/` copy (the
    // ComponentizeJS wizer sandbox resolves in-project relative imports
    // only — the same shape the service-pipeline test projects carry),
    // and the package.json module marker keeps the ESM shape the entry
    // emitter assumes.
    await mkdir(path.join(root, 'authoring'), {recursive: true});
    for (const file of [
      'define-service.js',
      'distributed-operation.js',
      'request-handler.js',
      'sql-template.js',
    ]) {
      const source = await readFile(
        new URL(`../../src/authoring/${file}`, import.meta.url), 'utf8');
      await writeFile(path.join(root, 'authoring', file), source);
    }
    await writeFile(
      path.join(root, 'package.json'),
      `${JSON.stringify({type: 'module'})}\n`);
    const serviceModule = path.join(root, 'lagrange.service.js');
    await writeFile(serviceModule, v2ServiceModuleSource());
    const entryPath = path.join(root, 'generated-entry.js');
    await emitServiceEntry({
      moduleSpecifier: './lagrange.service.js',
      outputPath: entryPath,
      world: 'service-cell-v2',
    });
    const {component} = await componentizeService({
      sourcePath: entryPath,
      worldName: 'service-cell-v2',
    });

    const exports = await instantiateComponent(component);

    // Request path: handler id as first ABI argument, method+path
    // dispatch inside the generated entry.
    const summary = JSON.parse(exports.handleRequest(
      'accountSummary',
      JSON.stringify({
        body: JSON.stringify({accountId: 7}),
        method: 'POST',
        path: '/accounts/summary',
      }),
    ));
    assert.equal(summary.status, 200);
    const summaryBody = JSON.parse(summary.body);
    // The host callBinding import is stubbed to echo its arguments: the
    // proof is that the handler's descriptor-keyed call() resolved each
    // operation to its deterministically generated Binding name
    // (<service>--call--<kebab(id)>) with the untouched call arguments —
    // two DISTINCT operations on one component.
    assert.deepEqual(summaryBody, {
      count: {
        echo: ['v2-ledger--call--count-rows', '{"accountId":7}'],
      },
      summary: {
        echo: ['v2-ledger--call--summarize-activity', '{"accountId":7}'],
      },
    }, 'the summary handler invoked BOTH operations by descriptor');

    const health = JSON.parse(exports.handleRequest(
      'accountHealth',
      JSON.stringify({method: 'GET', path: '/accounts/health'}),
    ));
    assert.equal(health.status, 200);
    assert.deepEqual(JSON.parse(health.body), {status: 'ok'});

    // Unknown handler id: typed refusal, never routed.
    assert.deepEqual(
      JSON.parse(exports.handleRequest('noSuchHandler', '{}')),
      {code: 'unknown_handler_id', id: 'noSuchHandler'});

    // Distributed path: operation id as first ABI argument on run AND
    // reduce for BOTH operations on the same component.
    const rows = [
      rowOf({amount_cents: 10n, id: 1n}),
      rowOf({amount_cents: 20n, id: 2n}),
    ];
    const summarized = JSON.parse(exports.run(
      'summarizeActivity', rows, '{}'));
    assert.deepEqual(summarized, {scanned: 2});
    const counted = JSON.parse(exports.run('countRows', rows, '{}'));
    assert.deepEqual(counted, {scanned: 2});

    const reducedTotal = JSON.parse(exports.reduce(
      'summarizeActivity', [['total', '30'], ['total', '12']], '{}'));
    assert.deepEqual(reducedTotal, {total: 42});
    const reducedCount = JSON.parse(exports.reduce(
      'countRows', [['count', '2'], ['count', '3']], '{}'));
    assert.deepEqual(reducedCount, {count: 5});

    assert.deepEqual(
      JSON.parse(exports.run('noSuchOperation', [], '{}')),
      {code: 'unknown_operation_id', id: 'noSuchOperation'});
  } finally {
    await rm(root, {force: true, recursive: true});
  }
});

function rowOf(columns) {
  return {
    columns: Object.entries(columns).map(([name, val]) => ({
      name,
      val: {tag: 'integer', val},
    })),
  };
}

// The developer module source for the e2e fixture: the same shape as
// v2ServiceDefinition() but as an importable module the componentize
// owner can resolve (the call context dispatches in-component through
// the generated entry's operation table, mirroring the Q5 shape proof:
// the ABI dispatch is what's under test; the host bridge is covered by
// the Q4 parity lane).
function v2ServiceModuleSource() {
  return `import {defineService} from './authoring/define-service.js';
import {distributed} from './authoring/distributed-operation.js';
import {http} from './authoring/request-handler.js';
import {sql} from './authoring/sql-template.js';

const summarize = distributed({
  statement: sql\`SELECT amount_cents FROM account_activity\`,
  run: (rows, _args, {emit}) => {
    let total = 0;
    for (const row of rows) total += Number(row.amount_cents ?? 0);
    emit('total', total);
    return {scanned: rows.length};
  },
  reduce: (partials) => ({
    total: partials.reduce((sum, [, partial]) => sum + Number(partial), 0),
  }),
});
const count = distributed({
  statement: sql\`SELECT id FROM account_activity\`,
  run: (rows, _args, {emit}) => {
    emit('count', rows.length);
    return {scanned: rows.length};
  },
  reduce: (partials) => ({
    count: partials.reduce((sum, [, partial]) => sum + Number(partial), 0),
  }),
});

export default defineService({
  name: 'v2-ledger',
  version: '1.0.0',
  operations: {countRows: count, summarizeActivity: summarize},
  handlers: {
    accountHealth: http.get('/accounts/health', {
      handle: (_request, context) => context.json({status: 'ok'}),
    }),
    accountSummary: http.post('/accounts/summary', {
      calls: [summarize, count],
      handle: (request, context) => {
        const body = JSON.parse(request.body || '{}');
        return context.json({
          count: context.call(count, body),
          summary: context.call(summarize, body),
        });
      },
    }),
  },
});
`;
}

async function instantiateComponent(component) {
  const transpiled = await transpileBytes(new Uint8Array(component), {
    emitTypescriptDeclarations: false,
    instantiation: 'async',
    name: 'handler-aware-e2e',
  });
  const moduleBytes = transpiled.files['handler-aware-e2e.js'];
  const moduleUrl = `data:text/javascript;base64,${
    Buffer.from(moduleBytes).toString('base64')}`;
  const generated = await import(moduleUrl);
  return generated.instantiate(
    async (file) => globalThis.WebAssembly.compile(transpiled.files[file]),
    {
      'lagrange:cell/call-context': {
        callBounded() {
          throw new Error('denied');
        },
        emit() {},
      },
      'lagrange:cell/context': {
        callBinding(name, args) {
          return JSON.stringify({echo: [name, args]});
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
