/**
 * Owner of the WASM-first `lagrange service init` scaffold
 * (service-init-wasm-first-scaffold).
 *
 * The default scaffold authors a code-first service project:
 * `lagrange.service.js` built purely from the vendored guest-safe
 * authoring library (`authoring/`), declaring one HTTP route and one
 * small distributed operation. The handler logic is split into
 * `src/handler.js` — a plain module unit-testable with fake `call` and
 * `emit` collaborators, no WASM toolchain required. `package.json` and a
 * README describing the `generate` / `build` / `deploy` pipeline
 * complete the project.
 *
 * The scaffold vendors the four authoring modules into `authoring/` so
 * both the CLI's normalizer (a host dynamic import of the service
 * module) and ComponentizeJS's wizer sandbox (which resolves only
 * in-project relative imports) see the same graph; a scaffolded project
 * carries no dependency on the lagrange-server package layout.
 *
 * Determinism and no-clobber semantics mirror the OCI scaffold: every
 * file is written exclusive-write and chmod-pinned, and a partial write
 * removes only the freshly created target directory.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {createScaffoldProject} from './service-scaffold-writer.js';
import {typingsSource} from '../service/service-typings-generator.js';

const SERVICE_VERSION = '0.1.0';
// The template's statement text is shared by the authored source and the
// scaffold-time typings projection so the two can never drift.
const TEMPLATE_STATEMENT_TEXT =
  'SELECT id, account_id, amount_cents FROM account_activity';
const SERVICE_PACKAGE_TYPE = 'module';
const SERVICE_BUILD_SCRIPT =
  'lagrange service generate . && lagrange service build .';
const SERVICE_DEPLOY_SCRIPT = 'lagrange service deploy .';
const SERVICE_GENERATE_SCRIPT = 'lagrange service generate .';
const SERVICE_TEST_SCRIPT = 'node --test';
const SERVICE_NODE_ENGINE = '>=22.12.0';
const TEXT_NEWLINE = '\n';

const WASM_PROJECT_ERROR_NAME = 'ServiceWasmScaffoldError';

const WASM_PROJECT_PATH = Object.freeze({
  AUTHORING_DIRECTORY: 'authoring',
  HANDLER_SOURCE: 'src/handler.js',
  HANDLER_TEST: 'test/handler.test.js',
  JSCONFIG: 'jsconfig.json',
  RUNTIME_TYPES: 'runtime-types.d.ts',
  PACKAGE: 'package.json',
  README: 'README.md',
  SERVICE_SOURCE: 'lagrange.service.js',
  SOURCE_DIRECTORY: 'src',
  TEST_DIRECTORY: 'test',
});

// checkJs wiring so the generated runtime-types.d.ts is CONSUMED by the
// scaffold (service-compiler-editor-typings): editors and `tsc --noEmit`
// type-check the authored modules against the compiler's typings.
const JSCONFIG_MODULE_SYSTEM = 'nodenext';
const JSCONFIG_TARGET = 'es2022';
const JSCONFIG_INDENT = 2;
const JSCONFIG_INCLUDE = Object.freeze([
  WASM_PROJECT_PATH.SERVICE_SOURCE,
  WASM_PROJECT_PATH.SOURCE_DIRECTORY,
  WASM_PROJECT_PATH.RUNTIME_TYPES,
]);

function jsconfigJson() {
  return `${JSON.stringify({
    compilerOptions: {
      checkJs: true,
      module: JSCONFIG_MODULE_SYSTEM,
      moduleResolution: JSCONFIG_MODULE_SYSTEM,
      noEmit: true,
      strict: true,
      target: JSCONFIG_TARGET,
    },
    include: [...JSCONFIG_INCLUDE],
  }, null, JSCONFIG_INDENT)}\n`;
}

// The four guest-safe authoring modules, vendored verbatim. Their only
// cross-import is `./define-service.js`, which the in-directory copy
// preserves, so the graph is self-contained.
const AUTHORING_MODULE_FILES = Object.freeze([
  'define-service.js',
  'distributed-operation.js',
  'request-handler.js',
  'sql-template.js',
]);
// Resolved lazily and SEA-aware: in the single-executable bundle esbuild
// rewrites import.meta.url to undefined (a top-level `new URL` here made
// EVERY bundled service command crash at module load), and the authoring
// sources are staged beside the bundle by build-sea.js instead.
const STAGED_AUTHORING_DIRECTORY = 'authoring';

const SEA_BUILD_FLAG = 'true';
const AUTHORING_RELATIVE_URL = '../authoring/';

function authoringSourceDirectory() {
  if (process.env.SEA_BUILD === SEA_BUILD_FLAG) {
    return path.join(
      path.dirname(process.argv[1]), STAGED_AUTHORING_DIRECTORY);
  }
  return fileURLToPath(new URL(AUTHORING_RELATIVE_URL, import.meta.url));
}

const WASM_PROJECT_FILE = Object.freeze({
  ENCODING: 'utf8',
});

const FILE_SYSTEM_ERROR_CODE = Object.freeze({
  ALREADY_EXISTS: 'EEXIST',
  NOT_FOUND: 'ENOENT',
});

const WASM_PROJECT_ERROR_CODE = Object.freeze({
  INVALID_NAME: 'invalid_name',
  TARGET_EXISTS: 'target_exists',
  TARGET_PARENT_MISSING: 'target_parent_missing',
  WRITE_FAILED: 'write_failed',
});

// The manifest/service name grammar the generated deployment records
// enforce: kebab-case. The directory basename becomes the service name,
// so an invalid name is refused before any file is written.
const SERVICE_NAME_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/u;

class ServiceWasmScaffoldError extends Error {
  constructor(code, message, cause) {
    super(message, {cause});
    this.name = WASM_PROJECT_ERROR_NAME;
    this.code = code;
  }
}

function lagrangeServiceSource(serviceName) {
  return `/**
 * ${serviceName} — a code-first Lagrange service.
 *
 * Authored purely with the vendored guest-safe authoring library
 * (authoring/): one HTTP route and one small distributed operation.
 * There is NO Binding-name literal here — the compiler mints the durable
 * \`<service>--call--<kebab(op id)>\` and \`<service>--request--<kebab(handler
 * id)>\` names from these explicit object keys.
 *
 *   - \`summarizeAmounts\` runs per data partition against the declared
 *     statement, sums the amount column, and emits a numeric partial;
 *     \`reduce\` folds every shard's partials into the final total. Only
 *     numbers leave a node — never rows.
 *   - \`amountSummary\` (POST /amounts/summary) invokes that operation by
 *     descriptor through the authorized call bridge.
 */
import {defineService} from './authoring/define-service.js';
import {distributed} from './authoring/distributed-operation.js';
import {http} from './authoring/request-handler.js';
import {sql} from './authoring/sql-template.js';
import {handleAmountSummary} from './src/handler.js';

/** @typedef {import('./runtime-types.d.ts').ServiceRequest} ServiceRequest */
/** @typedef {import('./runtime-types.d.ts').SummarizeAmountsRow} SummarizeAmountsRow */
/** @typedef {import('./runtime-types.d.ts').HandlerContexts} HandlerContexts */

const SERVICE_NAME = '${serviceName}';
const VERSION = '${SERVICE_VERSION}';
const PARTIAL_METRIC = Object.freeze({
  COUNT: 'count',
  TOTAL: 'total',
});
const PARTIAL_KEY_SEPARATOR = ':';

/**
 * Partial keys must be disjoint across partition shards. Range-partitioned row
 * IDs are disjoint across shards, so the lowest matching row ID suffixes each
 * emitted metric key (\`<metric>:<shardKey>\`).
 *
 * @param {readonly SummarizeAmountsRow[]} rows
 * @param {Record<string, unknown> | null | undefined} runArguments
 * @param {{emit(key: string, partial: unknown): void}} context
 */
function summarizeRun(rows, runArguments, {emit}) {
  const accountId = runArguments?.accountId ?? null;
  let matched = 0;
  let totalCents = 0;
  /** @type {number | null} */
  let shardKey = null;
  for (const row of rows) {
    if (accountId !== null && row.account_id !== accountId) continue;
    if (row.id === null || row.id === undefined ||
      row.amount_cents === null || row.amount_cents === undefined) {
      continue;
    }
    const id = Number(row.id);
    const amountCents = Number(row.amount_cents);
    if (shardKey === null || id < shardKey) shardKey = id;
    matched += 1;
    totalCents += amountCents;
  }
  if (matched > 0) {
    emit(\`\${PARTIAL_METRIC.COUNT}\${PARTIAL_KEY_SEPARATOR}\${shardKey}\`, matched);
    emit(
      \`\${PARTIAL_METRIC.TOTAL}\${PARTIAL_KEY_SEPARATOR}\${shardKey}\`,
      totalCents,
    );
  }
  return {matched, scanned: rows.length};
}

/**
 * @param {readonly (readonly [string, unknown])[]} partials
 * @param {Record<string, unknown> | null | undefined} [runArguments]
 */
function summarizeReduce(partials, runArguments) {
  const accountId = runArguments?.accountId ?? null;
  let transactions = 0;
  let totalCents = 0;
  const shards = new Set();
  for (const [key, value] of partials) {
    const [metric, shardKey] = String(key).split(PARTIAL_KEY_SEPARATOR);
    if (shardKey) shards.add(shardKey);
    if (metric === PARTIAL_METRIC.COUNT) transactions += Number(value);
    else if (metric === PARTIAL_METRIC.TOTAL) totalCents += Number(value);
  }
  return {
    accountId,
    contributingShards: shards.size,
    totalCents,
    transactions,
  };
}

// The single distributed operation, referenced by descriptor identity —
// never by a Binding-name string — from both \`operations\` and the
// handler's \`calls\` allowlist.
const summarizeAmounts = distributed({
  reduce: summarizeReduce,
  run: summarizeRun,
  statement: sql\`${TEMPLATE_STATEMENT_TEXT}\`,
});

export default defineService({
  handlers: {
    amountSummary: http.post('/amounts/summary', {
      calls: [summarizeAmounts],
      handle: (
        /** @type {ServiceRequest} */ request,
        /** @type {HandlerContexts['amountSummary']} */ context,
      ) => handleAmountSummary(request, context, summarizeAmounts),
    }),
  },
  name: SERVICE_NAME,
  operations: {
    summarizeAmounts,
  },
  version: VERSION,
});
`;
}

// The handler logic as a plain module: no authoring imports, so it is
// unit-testable on the host with fake `call` / `json` collaborators and
// never touches the WASM toolchain. The operation descriptor is passed
// in by the service module so this module stays descriptor-agnostic.
function handlerSource() {
  return `/**
 * The amount-summary endpoint logic, split from lagrange.service.js so
 * it unit-tests on the host: no WASM, no authoring imports — the
 * operation descriptor arrives as a parameter and the \`call\`/\`json\`
 * collaborators are faked in test/handler.test.js.
 */

const HTTP_STATUS_BAD_REQUEST = 400;
const HTTP_STATUS_OK = 200;

/**
 * @param {import('../runtime-types.d.ts').ServiceRequest} request
 * @param {import('../runtime-types.d.ts').HandlerContexts['amountSummary']} context
 * @param {import('../runtime-types.d.ts').OperationHandles['summarizeAmounts']} operation
 */
export function handleAmountSummary(request, {call, json}, operation) {
  const body = request?.body ?? {};
  if (typeof body !== 'object' || Array.isArray(body)) {
    return json({error: 'invalid_request_body'}, HTTP_STATUS_BAD_REQUEST);
  }
  const rawAccountId = body.accountId ?? null;
  let accountId = null;
  if (rawAccountId !== null) {
    const isInteger = typeof rawAccountId === 'number' ?
      Number.isSafeInteger(rawAccountId) && rawAccountId >= 0 :
      (typeof rawAccountId === 'string' && /^\\d+$/.test(rawAccountId.trim()));
    if (!isInteger) {
      return json({error: 'invalid_account_id'}, HTTP_STATUS_BAD_REQUEST);
    }
    accountId = typeof rawAccountId === 'number' ?
      rawAccountId :
      Number.parseInt(rawAccountId, 10);
  }
  const summary = call(operation, {accountId});
  return json(summary, HTTP_STATUS_OK);
}
`;
}

function handlerTestSource() {
  return `import assert from 'node:assert/strict';
import {test} from 'node:test';

import {handleAmountSummary} from '../src/handler.js';

// The handler is unit-testable without any WASM: \`call\` and \`json\`
// are plain fakes standing in for the generated entry's collaborators.
test('handleAmountSummary invokes the operation and wraps the result', () => {
  const calls = [];
  const operation = {kind: 'distributed_operation'};
  const summarySeven = {
    accountId: 7,
    contributingShards: 2,
    totalCents: 42,
    transactions: 2,
  };
  const summaryFortyTwo = {
    accountId: 42,
    contributingShards: 2,
    totalCents: 100,
    transactions: 1,
  };
  const context = {
    call(operationRef, callArguments) {
      calls.push([operationRef, callArguments]);
      return callArguments.accountId === 42 ? summaryFortyTwo : summarySeven;
    },
    json(value, status) {
      return {body: JSON.stringify(value), status};
    },
  };

  // 1. Parsed object body with first account ID
  const responseOne = handleAmountSummary(
    {body: {accountId: 7}}, context, operation);
  assert.deepEqual(calls[0], [operation, {accountId: 7}]);
  assert.equal(responseOne.status, 200);
  assert.deepEqual(JSON.parse(responseOne.body), summarySeven);

  // 2. Parsed object body with distinct second account ID
  const responseTwo = handleAmountSummary(
    {body: {accountId: 42}}, context, operation);
  assert.deepEqual(calls[1], [operation, {accountId: 42}]);
  assert.equal(responseTwo.status, 200);
  assert.deepEqual(JSON.parse(responseTwo.body), summaryFortyTwo);

  // 3. Empty / null body
  const responseEmpty = handleAmountSummary(
    {body: null}, context, operation);
  assert.equal(responseEmpty.status, 200);

  // 4. Invalid body shape or invalid accountId returns 400
  const responseInvalidBody = handleAmountSummary(
    {body: [1, 2, 3]}, context, operation);
  assert.equal(responseInvalidBody.status, 400);
  assert.deepEqual(
    JSON.parse(responseInvalidBody.body),
    {error: 'invalid_request_body'},
  );
  const responseInvalidAccount = handleAmountSummary(
    {body: {accountId: {nested: true}}}, context, operation);
  assert.equal(responseInvalidAccount.status, 400);
  assert.deepEqual(
    JSON.parse(responseInvalidAccount.body),
    {error: 'invalid_account_id'},
  );
});
`;
}

function packageJson(serviceName) {
  return JSON.stringify({
    name: serviceName,
    version: SERVICE_VERSION,
    private: true,
    type: SERVICE_PACKAGE_TYPE,
    scripts: {
      build: SERVICE_BUILD_SCRIPT,
      deploy: SERVICE_DEPLOY_SCRIPT,
      generate: SERVICE_GENERATE_SCRIPT,
      test: SERVICE_TEST_SCRIPT,
    },
    engines: {
      node: SERVICE_NODE_ENGINE,
    },
  }, null, 2) + TEXT_NEWLINE;
}

function readme(serviceName) {
  return `# ${serviceName}

A code-first Lagrange service, authored with
[\`defineService()\`](authoring/define-service.js),
[\`distributed()\`](authoring/distributed-operation.js), and
[\`http.post()\`](authoring/request-handler.js) in
[\`lagrange.service.js\`](lagrange.service.js).

## Layout

- \`lagrange.service.js\` - the service: one HTTP route and one
  distributed operation (\`summarizeAmounts\`), declared as data.
  \`summarizeRun\` filters rows on the local partition and emits
  shard-disjoint \`<metric>:<shardKey>\` partial keys so multi-partition
  reductions combine cleanly without key overlap.
- \`src/handler.js\` - the endpoint logic, split out so it unit-tests on
  the host with fake \`call\`/\`emit\` collaborators (no WASM).
- \`test/handler.test.js\` - that unit test.
- \`authoring/\` - the vendored guest-safe authoring library the service
  module imports; the compiler resolves it both on the host and inside
  the componentize sandbox.

## Test

\`\`\`sh
npm test
\`\`\`

## Compile and deploy

Build in one step via the package script (runs \`generate\` then \`build\`):

\`\`\`sh
npm run build
\`\`\`

Or run the explicit CLI stages directly:

\`\`\`sh
lagrange service generate .
lagrange service build .
lagrange service deploy . --idempotency-key <key>
\`\`\`

\`generate\` compiles \`lagrange.service.js\` into the generated component
entry and the deterministic \`.lagrange/deployment\` records;
\`build\` componentizes the entry into \`.lagrange/component.wasm\`;
\`deploy\` replays the records over the service-lifecycle SQL grammar
against a running cluster.
`;
}

function validateServiceName(serviceName, targetDirectory) {
  if (!SERVICE_NAME_PATTERN.test(serviceName)) {
    throw new ServiceWasmScaffoldError(
      WASM_PROJECT_ERROR_CODE.INVALID_NAME,
      `project directory name must be a kebab-case service name: ${serviceName} ` +
        `(from ${targetDirectory})`,
    );
  }
}

// The vendored authoring library is projected infrastructure, not the
// developer's authored code: exempt it from the scaffold's checkJs pass
// so a fresh project type-checks clean while lagrange.service.js and
// src/ stay fully checked against runtime-types.d.ts.
const VENDORED_TS_NOCHECK_HEADER = '// @ts-nocheck\n';

function vendoredAuthoringFiles() {
  return AUTHORING_MODULE_FILES.map((file) => [
    path.join(WASM_PROJECT_PATH.AUTHORING_DIRECTORY, file),
    VENDORED_TS_NOCHECK_HEADER + fs.readFileSync(
      path.join(authoringSourceDirectory(), file), {
        encoding: WASM_PROJECT_FILE.ENCODING,
      }),
  ]);
}

// The scaffold ships an INITIAL runtime-types.d.ts computed by the real
// generator from the template's IR, so a fresh project type-checks clean
// before the first \`lagrange service generate\` - which then overwrites
// it byte-identically (pinned by the editor-typings guard test).
const TEMPLATE_OPERATION_ID = 'summarizeAmounts';
const TEMPLATE_HANDLER_ID = 'amountSummary';

function templateIr(serviceName) {
  return {
    handlers: [
      {allowedOperations: [TEMPLATE_OPERATION_ID], id: TEMPLATE_HANDLER_ID},
    ],
    name: serviceName,
    operations: [
      {id: TEMPLATE_OPERATION_ID, statement: {text: TEMPLATE_STATEMENT_TEXT}},
    ],
    version: SERVICE_VERSION,
  };
}

function projectFiles(serviceName) {
  return Object.freeze([
    ...vendoredAuthoringFiles(),
    [WASM_PROJECT_PATH.SERVICE_SOURCE, lagrangeServiceSource(serviceName)],
    [WASM_PROJECT_PATH.HANDLER_SOURCE, handlerSource()],
    [WASM_PROJECT_PATH.HANDLER_TEST, handlerTestSource()],
    [WASM_PROJECT_PATH.JSCONFIG, jsconfigJson()],
    [WASM_PROJECT_PATH.RUNTIME_TYPES, typingsSource(templateIr(serviceName))],
    [WASM_PROJECT_PATH.PACKAGE, packageJson(serviceName)],
    [WASM_PROJECT_PATH.README, readme(serviceName)],
  ]);
}

function classifyFileSystemError(error, targetDirectory) {
  if (error?.code === FILE_SYSTEM_ERROR_CODE.ALREADY_EXISTS) {
    return new ServiceWasmScaffoldError(
      WASM_PROJECT_ERROR_CODE.TARGET_EXISTS,
      `target already exists: ${targetDirectory}`,
      error,
    );
  }
  if (error?.code === FILE_SYSTEM_ERROR_CODE.NOT_FOUND) {
    return new ServiceWasmScaffoldError(
      WASM_PROJECT_ERROR_CODE.TARGET_PARENT_MISSING,
      `target parent does not exist: ${path.dirname(targetDirectory)}`,
      error,
    );
  }
  if (error instanceof ServiceWasmScaffoldError) {
    return error;
  }
  return new ServiceWasmScaffoldError(
    WASM_PROJECT_ERROR_CODE.WRITE_FAILED,
    `could not create service project: ${targetDirectory}`,
    error,
  );
}

function createWasmServiceProject(targetArgument) {
  const targetDirectory = path.resolve(targetArgument);
  const serviceName = path.basename(targetDirectory);
  validateServiceName(serviceName, targetDirectory);
  const files = projectFiles(serviceName);
  return createScaffoldProject({
    targetArgument,
    subdirectories: [
      WASM_PROJECT_PATH.AUTHORING_DIRECTORY,
      WASM_PROJECT_PATH.SOURCE_DIRECTORY,
      WASM_PROJECT_PATH.TEST_DIRECTORY,
    ],
    files,
    classifyError: classifyFileSystemError,
  });
}

const runInit = createWasmServiceProject;

export {
  ServiceWasmScaffoldError,
  WASM_PROJECT_ERROR_CODE,
  createWasmServiceProject,
  runInit,
};
