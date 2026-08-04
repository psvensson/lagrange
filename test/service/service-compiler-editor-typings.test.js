/**
 * Guard test for the service-compiler editor typings
 * (service-compiler-editor-typings).
 *
 * `lagrange service generate` emits a deterministic `runtime-types.d.ts`
 * derived from the IR. Under `tsc --checkJs` in the scaffold project, the
 * generated typings make three authoring mistakes compile-time type
 * errors: a misspelled operation key on `OperationHandles`, a `call()`
 * target that is not a declared operation handle, and a read of a column
 * the operation's declared statement does not select — while the correct
 * shapes type-check clean. Determinism (byte-identical regeneration) and
 * the SELECT-list column projection are pinned directly.
 */
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {test} from '../../src/test-helpers/tap.js';

import {
  emitServiceTypings,
  selectColumns,
} from '../../src/service/service-typings-generator.js';
import {
  createWasmServiceProject,
} from '../../src/cli/service-wasm-scaffold.js';
import {
  runServicePipelineCommand,
} from '../../src/cli/service-pipeline-router.js';

const TSC_BIN = fileURLToPath(new URL(
  '../../node_modules/typescript/bin/tsc', import.meta.url));
const TOOLCHAIN_TIMEOUT_MS = 120000;
const TSC_BASE_ARGS = Object.freeze([
  '--noEmit',
  '--checkJs',
  '--allowJs',
  '--strict',
  '--module',
  'nodenext',
  '--target',
  'es2022',
]);

async function makeTempRoot(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'lagrange-typings-'));
  t.teardown(() => rm(root, {force: true, recursive: true}));
  return root;
}

function runTsc(cwd, file) {
  return spawnSync(
    process.execPath, [TSC_BIN, ...TSC_BASE_ARGS, file], {
      cwd,
      encoding: 'utf8',
      timeout: TOOLCHAIN_TIMEOUT_MS,
    });
}

// A @ts-check probe module that imports the generated typings and
// exercises one shape. `body` is appended after the shared preamble.
function probeModule(body) {
  return `// @ts-check
/** @typedef {import('./runtime-types.d.ts').OperationHandles} OperationHandles */
/** @typedef {import('./runtime-types.d.ts').HandlerContext} HandlerContext */
/** @typedef {import('./runtime-types.d.ts').SummarizeAmountsRow} Row */
/** @typedef {import('./runtime-types.d.ts').ServiceRequest} ServiceRequest */
/** @typedef {import('./runtime-types.d.ts').HandlerContexts} HandlerContexts */
/** @type {OperationHandles} */
const operations = /** @type {any} */ ({});
${body}
`;
}

async function scaffoldWithTypings(t) {
  const root = await makeTempRoot(t);
  const target = path.join(root, 'amounts-service');
  createWasmServiceProject(target);
  // The scaffold ships an initial runtime-types.d.ts so a fresh project
  // type-checks before the first generate; generate must overwrite it
  // byte-identically or the scaffold-time IR literal drifted from the
  // template source.
  const scaffolded = await readFile(
    path.join(target, 'runtime-types.d.ts'), 'utf8');
  const outputs = [];
  const errors = [];
  const exitCode = await runServicePipelineCommand(['generate', target], {
    writeError: (line) => errors.push(line),
    writeOutput: (line) => outputs.push(line),
  });
  assert.equal(exitCode, 0, errors.join('\n'));
  const generated = await readFile(
    path.join(target, 'runtime-types.d.ts'), 'utf8');
  assert.equal(generated, scaffolded,
    'generate must reproduce the scaffold-projected typings byte-identically');
  return {root, target};
}

test('generate emits a deterministic runtime-types.d.ts covering ' +
  'operation rows, handles, and the handler context', async (t) => {
  const {target} = await scaffoldWithTypings(t);
  const typingsPath = path.join(target, 'runtime-types.d.ts');
  const first = await readFile(typingsPath, 'utf8');

  // Operation-keyed handles map.
  assert.match(first, /export interface OperationHandles/);
  assert.match(first, /readonly "summarizeAmounts": SummarizeAmountsOperation/);
  // Row interface carries exactly the selected column.
  assert.match(first, /export interface SummarizeAmountsRow/);
  assert.match(first, /readonly "amount_cents": unknown/);
  // Handler context binds call() to the declared handle.
  assert.match(first, /export interface HandlerContext/);
  assert.match(first, /call\(operation: OperationHandles\["summarizeAmounts"\]/);
  // Request envelope: body is unknown so handlers must narrow before use.
  assert.match(first, /export interface ServiceRequest/);
  assert.match(first, /readonly body: unknown/);
  // Per-handler contexts narrowed to each handler's declared calls.
  assert.match(first, /export interface HandlerContexts/);
  assert.match(first, /readonly "amountSummary": \{/);

  // Regeneration is byte-identical (determinism).
  const regenExit = await runServicePipelineCommand(['generate', target], {
    writeError: () => {},
    writeOutput: () => {},
  });
  assert.equal(regenExit, 0);
  const second = await readFile(typingsPath, 'utf8');
  assert.equal(second, first, 'typings regeneration must be byte-identical');
});

test('the SELECT-list projection keeps plain, qualified, and aliased ' +
  'columns and skips non-identifiers', (t) => {
  assert.deepEqual(
    selectColumns(
      'SELECT id, t.account_id, amount_cents AS cents FROM account_activity'),
    ['id', 'account_id', 'cents']);
  assert.deepEqual(
    selectColumns('SELECT * FROM account_activity'), [],
    'a bare star yields no column properties rather than a wrong one');
  assert.deepEqual(
    selectColumns('SELECT COUNT(*) FROM account_activity'), [],
    'an aggregate yields no column properties');
  t.end();
});

test('correct authoring shapes type-check clean under tsc --checkJs',
  {timeout: TOOLCHAIN_TIMEOUT_MS},
  async (t) => {
    const {target} = await scaffoldWithTypings(t);
    const probe = probeModule(`
// Correct operation key and call target, correct row column read.
const good = operations.summarizeAmounts;
/** @param {HandlerContext} context */
function handler(context) {
  context.call(operations.summarizeAmounts, {accountId: 1});
}
/** @param {Row} row */
function readColumn(row) {
  return row.amount_cents;
}
export {good, handler, readColumn};
`);
    await writeFile(path.join(target, 'probe-good.mjs'), probe);
    const result = runTsc(target, 'probe-good.mjs');
    assert.equal(result.status, 0,
      `correct shapes must type-check clean:\n${result.stdout}\n${result.stderr}`);
  });

test('a misspelled operation key is a tsc type error',
  {timeout: TOOLCHAIN_TIMEOUT_MS},
  async (t) => {
    const {target} = await scaffoldWithTypings(t);
    const probe = probeModule(`
const bad = operations.summarizeAmoutns;
export {bad};
`);
    await writeFile(path.join(target, 'probe-bad-key.mjs'), probe);
    const result = runTsc(target, 'probe-bad-key.mjs');
    assert.notEqual(result.status, 0, 'a misspelled key must fail tsc');
    assert.match(result.stdout, /summarizeAmoutns/);
  });

test('a call target that is not a declared operation handle is a tsc ' +
  'type error',
{timeout: TOOLCHAIN_TIMEOUT_MS},
async (t) => {
  const {target} = await scaffoldWithTypings(t);
  const probe = probeModule(`
/** @param {HandlerContext} context */
function handler(context) {
  context.call({kind: 'distributed_operation'}, {accountId: 1});
}
export {handler};
`);
  await writeFile(path.join(target, 'probe-bad-call.mjs'), probe);
  const result = runTsc(target, 'probe-bad-call.mjs');
  assert.notEqual(result.status, 0, 'an undeclared call target must fail tsc');
  assert.match(result.stdout, /not assignable|SummarizeAmountsOperation/);
});

test('reading an undeclared statement column is a tsc type error',
  {timeout: TOOLCHAIN_TIMEOUT_MS},
  async (t) => {
    const {target} = await scaffoldWithTypings(t);
    const probe = probeModule(`
/** @param {Row} row */
function read(row) {
  return row.no_such_column;
}
export {read};
`);
    await writeFile(path.join(target, 'probe-bad-column.mjs'), probe);
    const result = runTsc(target, 'probe-bad-column.mjs');
    assert.notEqual(result.status, 0, 'an undeclared column must fail tsc');
    assert.match(result.stdout, /no_such_column/);
  });

test('an unnarrowed request-body read is a tsc type error and a ' +
  'narrowed one is clean',
{timeout: TOOLCHAIN_TIMEOUT_MS},
async (t) => {
  const {target} = await scaffoldWithTypings(t);
  const bad = probeModule(`
/** @param {ServiceRequest} request */
function readBody(request) {
  return request.body.accountId;
}
export {readBody};
`);
  await writeFile(path.join(target, 'probe-bad-body.mjs'), bad);
  const badResult = runTsc(target, 'probe-bad-body.mjs');
  assert.notEqual(badResult.status, 0,
    'unnarrowed body access must fail tsc (body is unknown)');
  assert.match(badResult.stdout, /unknown/);

  const clean = probeModule(`
/** @param {ServiceRequest} request */
function readBody(request) {
  const body = request.body;
  if (typeof body === 'object' && body !== null && 'accountId' in body) {
    return body.accountId;
  }
  return null;
}
export {readBody};
`);
  await writeFile(path.join(target, 'probe-good-body.mjs'), clean);
  const cleanResult = runTsc(target, 'probe-good-body.mjs');
  assert.equal(cleanResult.status, 0,
    `narrowed body access must pass:\n${cleanResult.stdout}`);
});

test('a non-record call argument shape is a tsc type error',
  {timeout: TOOLCHAIN_TIMEOUT_MS},
  async (t) => {
    const {target} = await scaffoldWithTypings(t);
    const probe = probeModule(`
/** @param {HandlerContext} context */
function handler(context) {
  context.call(operations.summarizeAmounts, 'not-a-record');
}
export {handler};
`);
    await writeFile(path.join(target, 'probe-bad-args.mjs'), probe);
    const result = runTsc(target, 'probe-bad-args.mjs');
    assert.notEqual(result.status, 0,
      'a primitive call argument must fail tsc (args are a record)');
    assert.match(result.stdout, /not-a-record|Record<string, unknown>/);
  });

test('misusing reduce partials as a non-list is a tsc type error',
  {timeout: TOOLCHAIN_TIMEOUT_MS},
  async (t) => {
    const {target} = await scaffoldWithTypings(t);
    const probe = probeModule(`
const op = operations.summarizeAmounts;
op.reduce('not-partials', {});
export {op};
`);
    await writeFile(path.join(target, 'probe-bad-partials.mjs'), probe);
    const result = runTsc(target, 'probe-bad-partials.mjs');
    assert.notEqual(result.status, 0,
      'non-list partials must fail tsc');
    assert.match(result.stdout, /not-partials|readonly/);
  });

test('HandlerContexts narrows call() to each handler\'s declared calls',
  async (t) => {
    const root = await makeTempRoot(t);
    const ir = {
      handlers: [
        {allowedOperations: ['opA'], id: 'narrowHandler'},
        {allowedOperations: [], id: 'quietHandler'},
      ],
      name: 'demo',
      operations: [
        {id: 'opA', statement: {text: 'SELECT alpha FROM t'}},
        {id: 'opB', statement: {text: 'SELECT beta FROM t'}},
      ],
      version: '1.0.0',
    };
    const outputPath = path.join(root, 'runtime-types.d.ts');
    await emitServiceTypings({ir, outputPath});
    const written = await readFile(outputPath, 'utf8');
    const narrowed = written.match(
      /readonly "narrowHandler": \{\n\s+call\(operation: ([^,]+),/);
    assert.ok(narrowed, 'narrowHandler context emitted');
    assert.equal(narrowed[1], 'OperationHandles["opA"]',
      'call() accepts ONLY the declared operation, not the full union');
    const quiet = written.match(
      /readonly "quietHandler": \{\n\s+call\(operation: ([^,]+),/);
    assert.ok(quiet, 'quietHandler context emitted');
    assert.equal(quiet[1], 'never',
      'a handler with no declared calls gets call: never');
  });

test('a fresh scaffold and a post-generate scaffold both type-check ' +
  'clean under their own projected jsconfig',
{timeout: TOOLCHAIN_TIMEOUT_MS * 2},
async (t) => {
  const root = await makeTempRoot(t);
  const target = path.join(root, 'amounts-service');
  createWasmServiceProject(target);
  // tsc -p (no file args) honors the projected jsconfig - the exact
  // surface editors use; per-file tsc invocations bypass jsconfig
  // entirely and prove nothing about it.
  const fresh = spawnSync(
    process.execPath, [TSC_BIN, '-p', path.join(target, 'jsconfig.json')], {
      encoding: 'utf8',
      timeout: TOOLCHAIN_TIMEOUT_MS,
    });
  assert.equal(fresh.status, 0,
    'a FRESH scaffold must type-check clean before the first generate:\n' +
      `${fresh.stdout}`);
  const exitCode = await runServicePipelineCommand(['generate', target], {
    writeError: () => {},
    writeOutput: () => {},
  });
  assert.equal(exitCode, 0);
  const generated = spawnSync(
    process.execPath, [TSC_BIN, '-p', path.join(target, 'jsconfig.json')], {
      encoding: 'utf8',
      timeout: TOOLCHAIN_TIMEOUT_MS,
    });
  assert.equal(generated.status, 0,
    `a post-generate scaffold must type-check clean:\n${generated.stdout}`);
});

test('emitServiceTypings writes through its owner with a byte count',
  async (t) => {
    const root = await makeTempRoot(t);
    const ir = {
      handlers: [],
      name: 'demo',
      operations: [{
        id: 'opA',
        statement: {text: 'SELECT alpha, beta FROM t'},
      }],
      version: '1.0.0',
    };
    const outputPath = path.join(root, 'nested', 'runtime-types.d.ts');
    const result = await emitServiceTypings({ir, outputPath});
    const written = await readFile(outputPath, 'utf8');
    assert.equal(result.bytes, Buffer.byteLength(written, 'utf8'));
    assert.match(written, /readonly "alpha": unknown/);
    assert.match(written, /readonly "beta": unknown/);
  });
