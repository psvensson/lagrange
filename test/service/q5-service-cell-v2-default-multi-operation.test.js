/**
 * Q5 (`service-cell-v2-default-multi-operation`) verification suite:
 *   1. Default CLI `generate -> build -> publish -> deploy` pipeline for a
 *      zero-operation Hono HTTP-only service (`operations: {}`, no fabricated
 *      no-op operation) and a multi-operation Hono service (`>= 2` operations
 *      in one `service-cell-v2` component, sequential `c.env.lagrange.call`
 *      fan-out, unknown/unauthorized operation refusal, and clean-directory
 *      deploy from published receipt after deleting source files).
 *   2. Legacy v1 artifact / schema v2 binding refusal with
 *      `LEGACY_ARTIFACT_ABI_UNSUPPORTED`.
 *   3. Direct public `CALL BINDING` (`ServiceLifecycleCommandOwner`,
 *      `lagrange service call`, and `CallCellInvoker`) with scoped
 *      `invocation_key` / `idempotency_key` admission, same-intent replay,
 *      conflict refusal (`INVOCATION_CONFLICT`), generation pinning across
 *      revision updates, uncertain/orphaned outcome refusal
 *      (`INVOCATION_AMBIGUOUS` / `outcome_uncertain`), expiry refusal
 *      (`INVOCATION_EXPIRED`), and unkeyed unknown-outcome warning.
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {transpileBytes} from '@bytecodealliance/jco-transpile';
import {test} from '../../src/test-helpers/tap.js';
import {
  runBuild,
  runCall,
  runDeploy,
  runGenerate,
  runPublish,
} from '../../src/cli/service-pipeline-command.js';
import {
  runServicePipelineCommand,
} from '../../src/cli/service-pipeline-router.js';
import {
  parseServiceLifecycleSql,
} from '../../src/query/service-lifecycle-sql-contract.js';
import {
  SERVICE_LIFECYCLE_COMMAND,
} from '../../src/service/service-lifecycle-command-contract.js';
import {
  SERVICE_LIFECYCLE_COMMAND_ERROR_CODE,
  SERVICE_LIFECYCLE_DEFAULT_SIGNATURE_POLICY,
  ServiceLifecycleCommandOwner,
} from '../../src/service/service-lifecycle-command-owner.js';
import {
  CALL_CELL_ROUTE_CLASSIFICATION,
  CALL_CELL_ROUTE_ERROR_CODE,
  CALL_OUTCOME_CLASS,
  createCallRoutingFailure,
  createScopedDirectCallInvocationId,
  publicCallOutcomeOf,
} from '../../src/service/call-cell-routing-contract.js';
import {
  createCallCellReduceCoordinator,
} from '../../src/runtime/call-cell-reduce-coordinator.js';
import {
  CallCellInvoker,
} from '../../src/service/call-cell-invoker.js';

const QUEST_ID = 'service-cell-v2-default-multi-operation';
const TOOLCHAIN_TIMEOUT_MS = 240_000;
const UTF8 = 'utf8';
const TEMP_PREFIX = 'lagrange-q5-v2-multi-op-';
const AUTHORING_INDEX_URL = fileURLToPath(
  new URL('../../src/authoring/index.js', import.meta.url),
);
const REPO_NODE_MODULES_PATH = fileURLToPath(
  new URL('../../node_modules', import.meta.url),
);

const ZERO_OP_SERVICE_NAME = 'zero-op-http';
const MULTI_OP_SERVICE_NAME = 'multi-op-overview';
const SERVICE_VERSION = '1.0.0';
const ZERO_OP_REQ_BINDING = `${ZERO_OP_SERVICE_NAME}--request--fetch`;
const MULTI_OP_REQ_BINDING = `${MULTI_OP_SERVICE_NAME}--request--fetch`;
const SUMMARIZE_CALL_BINDING =
  `${MULTI_OP_SERVICE_NAME}--call--summarize-activity`;
const FLAGS_CALL_BINDING =
  `${MULTI_OP_SERVICE_NAME}--call--recent-flags`;

const OP_SUMMARIZE = 'summarizeActivity';
const OP_FLAGS = 'recentFlags';
const OP_UNKNOWN = 'nonExistentOperation';

const EXPORT_HANDLE_REQUEST = 'handle-request';
const INTERFACE_REQUEST_V2 = 'request_v2';
const INTERFACE_CALL_V2 = 'call_v2';
const WORLD_V2 = 'service-cell-v2';

const HTTP_STATUS_OK = 200;
const HTTP_STATUS_FORBIDDEN = 403;
const ACCOUNT_ID_42 = 42;
const CANNED_DIGEST = `sha256:${'b'.repeat(64)}`;
const CANNED_PACKAGE_ID = 'pkg-q5-multi-op';
const DEPLOY_KEY = 'deploy-q5-key-1';
const LEGACY_ABI_CODE = 'LEGACY_ARTIFACT_ABI_UNSUPPORTED';

const TENANT_A = 'tenant-alpha';
const TENANT_B = 'tenant-beta';
const PRINCIPAL_A = 'principal-alice';
const PRINCIPAL_B = 'principal-bob';
const ROLES_APP = Object.freeze(['application']);

const SECURITY_A = Object.freeze({
  principal: PRINCIPAL_A,
  roles: ROLES_APP,
  tenantId: TENANT_A,
});
const SECURITY_B = Object.freeze({
  principal: PRINCIPAL_B,
  roles: ROLES_APP,
  tenantId: TENANT_B,
});

const BINDING_V1 = 'bv-gen-1';
const BINDING_V2 = 'bv-gen-2';
const GEN_1 = 1;
const GEN_2 = 2;
const RETENTION_WINDOW_MS = 60_000;
const INITIAL_NOW_MS = 1_700_000_000_000;
const EXPIRED_DELTA_MS = 120_000;

function zeroOpServiceSource() {
  return `import {Hono} from 'hono';
import {defineService} from ${JSON.stringify(AUTHORING_INDEX_URL)};

const app = new Hono();
app.get('/health', (c) => c.json({ok: true, service: '${ZERO_OP_SERVICE_NAME}'}));

export default defineService({
  name: '${ZERO_OP_SERVICE_NAME}',
  version: '${SERVICE_VERSION}',
  operations: {},
  fetch: app.fetch,
});
`;
}

function multiOpServiceSource() {
  return `import {Hono} from 'hono';
import {
  defineService,
  distributed,
  sql,
} from ${JSON.stringify(AUTHORING_INDEX_URL)};

const summarizeActivity = distributed({
  parameters: [{name: 'accountId', nullable: false, type: 'integer'}],
  partialSchema: {
    type: 'record',
    fields: {
      count: {type: 'integer'},
      total: {type: 'integer'},
    },
  },
  statement: sql\`SELECT account_id, amount_cents FROM account_tx WHERE account_id = $1\`,
  run(rows, args, {emit}) {
    let total = 0;
    for (const row of rows) {
      total += Number(row.amount_cents || 0);
    }
    emit(String(args.accountId), {count: rows.length, total});
    return {count: rows.length, total};
  },
  reduce(partials, args) {
    let count = 0;
    let total = 0;
    for (const [, p] of partials) {
      count += Number(p.count || 0);
      total += Number(p.total || 0);
    }
    return {accountId: args.accountId, count, op: '${OP_SUMMARIZE}', total};
  },
});

const recentFlags = distributed({
  parameters: [{name: 'accountId', nullable: false, type: 'integer'}],
  statement: sql\`SELECT account_id, flagged FROM account_tx WHERE account_id = $1\`,
  run(rows, args, {emit}) {
    let flaggedCount = 0;
    for (const row of rows) {
      if (row.flagged) flaggedCount += 1;
    }
    emit(String(args.accountId), flaggedCount);
    return {flaggedCount};
  },
  reduce(partials, args) {
    let flaggedCount = 0;
    for (const [, count] of partials) {
      flaggedCount += Number(count || 0);
    }
    return {accountId: args.accountId, flaggedCount, op: '${OP_FLAGS}'};
  },
});

const app = new Hono();
app.get('/accounts/:accountId/overview', async (c) => {
  const accountId = Number(c.req.param('accountId'));
  const summary = await c.env.lagrange.call(summarizeActivity, {accountId});
  const flags = await c.env.lagrange.call(recentFlags, {accountId});
  return c.json({accountId, flags, summary});
});

app.get('/accounts/:accountId/unauthorized', async (c) => {
  const accountId = Number(c.req.param('accountId'));
  const fakeOp = {
    [Symbol.for('lagrange.operation.bindingName')]: '${MULTI_OP_SERVICE_NAME}--call--undeclared',
    id: 'undeclared',
    kind: 'distributed_operation',
  };
  try {
    await c.env.lagrange.call(fakeOp, {accountId});
    return c.json({unexpected: true});
  } catch (err) {
    return c.json({code: err.code || 'denied', message: err.message}, ${HTTP_STATUS_FORBIDDEN});
  }
});

export const operations = {summarizeActivity, recentFlags};

export default defineService({
  name: '${MULTI_OP_SERVICE_NAME}',
  version: '${SERVICE_VERSION}',
  operations,
  fetch: app.fetch,
});
`;
}

function createFakeOciBuilder(projectDir) {
  return () => ({
    async build() {
      const wasmPath = path.join(projectDir, '.lagrange', 'component.wasm');
      const stat = await fs.stat(wasmPath);
      return {
        layoutPath: path.join(projectDir, '.lagrange', 'oci'),
        topManifestDescriptor: {
          digest: CANNED_DIGEST,
          sizeBytes: stat.size,
        },
      };
    },
  });
}

function createFakeDeploySqlClient() {
  const executed = [];
  return {
    client: () => ({
      async execute(statement, parameters) {
        const payload = JSON.parse(parameters[0]);
        executed.push({payload, statement});
        if (statement.startsWith('INSTALL SERVICE')) {
          return {rows: [{package_id: CANNED_PACKAGE_ID}]};
        }
        return {rows: [{ok: true}]};
      },
    }),
    executed,
  };
}

async function instantiateBuiltComponent(componentBytes, hostHandlers, tempDir) {
  const outDir = path.join(tempDir, `jco-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await fs.mkdir(outDir, {recursive: true});
  const transpiled = await transpileBytes(componentBytes, {
    instantiation: {tag: 'async'},
    name: 'q5-component',
  });
  for (const [relPath, content] of Object.entries(transpiled.files)) {
    const dest = path.join(outDir, relPath);
    await fs.mkdir(path.dirname(dest), {recursive: true});
    await fs.writeFile(dest, content);
  }
  const jsEntry = path.join(outDir, 'q5-component.js');
  const mod = await import(pathToFileURL(jsEntry).href);
  const getCoreModule = async (coreRelPath) => {
    const wasmBytes = await fs.readFile(path.join(outDir, coreRelPath));
    return globalThis.WebAssembly.compile(wasmBytes);
  };
  return mod.instantiate(getCoreModule, {
    'lagrange:cell/call-context': {
      callBounded: () => '{}',
      ...hostHandlers.callContext,
    },
    'lagrange:cell/context': {
      capability: () => '{}',
      read: () => '[]',
      write: () => '{}',
      ...hostHandlers.requestContext,
    },
  });
}

function applyCoordInsert(slotRows, trimmed) {
  const m = /\('([^']+)',\s*(\d+),\s*'([^']*)',\s*(\d+),\s*'([^']*)',\s*(\d+)\)/u.exec(trimmed);
  if (m) {
    const [, invId, slotId, repId, exp, partJson, compAt] = m;
    const list = slotRows.get(invId) || [];
    list.push({
      computed_at: Number(compAt),
      invocation_id: invId,
      lease_expires_at: Number(exp),
      partial_json: partJson,
      replica_id: repId,
      slot_id: Number(slotId),
    });
    slotRows.set(invId, list);
  }
  return {rows: [], success: true};
}

function applyResultInsert(resultRows, trimmed) {
  const m = /\('([^']+)',\s*'([^']*)',\s*(\d+),\s*'((?:[^']|'')*)'\)/u.exec(trimmed);
  if (m) {
    const [, resId, resJson, compAt, snapJson] = m;
    resultRows.set(resId, {
      computed_at: Number(compAt),
      result_id: resId,
      result_json: resJson.replace(/''/gu, '\''),
      source_snapshot_json: snapJson.replace(/''/gu, '\''),
    });
  }
  return {rows: [], success: true};
}

function applyResultSelect(resultRows, trimmed) {
  const m = /WHERE result_id = '([^']+)'/u.exec(trimmed);
  const row = m ? resultRows.get(m[1]) : null;
  return {rows: row ? [{...row}] : [], success: true};
}

function applyResultUpdate(resultRows, trimmed) {
  const idMatch = /WHERE result_id = '([^']+)'/u.exec(trimmed);
  const existing = idMatch ? resultRows.get(idMatch[1]) : null;
  if (!existing) {
    return {rows: [], success: true};
  }
  const resMatch = /result_json = '((?:[^']|'')*)'/u.exec(trimmed);
  if (resMatch) {
    existing.result_json = resMatch[1].replace(/''/gu, '\'');
  }
  const compMatch = /computed_at = (\d+)/u.exec(trimmed);
  if (compMatch) {
    existing.computed_at = Number(compMatch[1]);
  }
  const snapMatch = /source_snapshot_json = '((?:[^']|'')*)'/u.exec(trimmed);
  if (snapMatch) {
    existing.source_snapshot_json = snapMatch[1].replace(/''/gu, '\'');
  }
  return {rows: [], success: true};
}

function applyCoordSelect(slotRows, trimmed) {
  const m = /WHERE invocation_id = '([^']+)'/u.exec(trimmed);
  const list = m ? slotRows.get(m[1]) || [] : [];
  return {rows: list.map((r) => ({...r})), success: true};
}

function mutateCoordRow(row, trimmed) {
  const repMatch = /replica_id = '([^']+)'/u.exec(trimmed);
  if (repMatch && !trimmed.includes('AND replica_id =')) {
    row.replica_id = repMatch[1];
  }
  const expMatch = /lease_expires_at = (\d+)/u.exec(trimmed);
  if (expMatch) {
    row.lease_expires_at = Number(expMatch[1]);
  }
  const partMatch = /partial_json = '((?:[^']|'')*)',\s*computed_at = (\d+)/u.exec(trimmed);
  if (partMatch && !partMatch[1].startsWith('[]')) {
    row.partial_json = partMatch[1].replace(/''/gu, '\'');
    row.computed_at = Number(partMatch[2]);
  } else if (trimmed.includes('computed_at = 0')) {
    row.partial_json = '[]';
    row.computed_at = 0;
  }
}

function applyCoordUpdate(slotRows, trimmed) {
  const invMatch = /WHERE invocation_id = '([^']+)' AND slot_id = (\d+)/u.exec(trimmed);
  if (invMatch) {
    const [, invId, slotStr] = invMatch;
    const list = slotRows.get(invId) || [];
    const row = list.find((r) => r.slot_id === Number(slotStr));
    if (row) {
      mutateCoordRow(row, trimmed);
    }
  }
  return {rows: [], success: true};
}

function createInMemoryCoordinator(nowRef) {
  const slotRows = new Map();
  const resultRows = new Map();
  const executeInternal = async (sql) => {
    const trimmed = sql.trim();
    if (trimmed.startsWith('INSERT INTO call_coord')) {
      return applyCoordInsert(slotRows, trimmed);
    }
    if (trimmed.startsWith('INSERT INTO call_results')) {
      return applyResultInsert(resultRows, trimmed);
    }
    if (trimmed.startsWith('SELECT result_id')) {
      return applyResultSelect(resultRows, trimmed);
    }
    if (trimmed.startsWith('UPDATE call_results SET')) {
      return applyResultUpdate(resultRows, trimmed);
    }
    if (trimmed.startsWith('SELECT slot_id')) {
      return applyCoordSelect(slotRows, trimmed);
    }
    if (trimmed.startsWith('UPDATE call_coord SET')) {
      return applyCoordUpdate(slotRows, trimmed);
    }
    return {rows: [], success: true};
  };
  return {
    coordinator: createCallCellReduceCoordinator({
      coordinationTable: 'call_coord',
      executeInternal,
      leaseMs: 30_000,
      nowProvider: () => nowRef.nowMs,
      resultTable: 'call_results',
      slotCount: 1,
    }),
    resultRows,
  };
}

test(`${QUEST_ID}: zero-operation and multi-operation Hono services default to service-cell-v2 through generate -> build -> publish -> deploy`, {timeout: TOOLCHAIN_TIMEOUT_MS}, async (t) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), TEMP_PREFIX));
  t.teardown(async () => {
    await fs.rm(rootDir, {force: true, recursive: true});
  });
  await fs.symlink(
    REPO_NODE_MODULES_PATH,
    path.join(rootDir, 'node_modules'),
    'dir',
  );

  // 1. Zero-operation Hono HTTP-only service
  const zeroOpDir = path.join(rootDir, ZERO_OP_SERVICE_NAME);
  await fs.mkdir(zeroOpDir, {recursive: true});
  await fs.writeFile(
    path.join(zeroOpDir, 'lagrange.service.js'),
    zeroOpServiceSource(),
    UTF8,
  );

  const zeroGen = await runGenerate({projectDirectory: zeroOpDir});
  t.equal(zeroGen.ir.target, WORLD_V2, 'zero-op Hono service targets service-cell-v2');
  t.equal(zeroGen.ir.operations.length, 0, 'zero operations in IR (no fabricated no-op operation)');
  t.same(
    zeroGen.records.manifest.exports,
    [{interface: INTERFACE_REQUEST_V2, name: EXPORT_HANDLE_REQUEST}],
    'zero-op manifest exports only request_v2 handle-request',
  );
  t.equal(zeroGen.records.bindings.length, 1, 'exactly one request binding');
  t.equal(zeroGen.records.bindings[0].name, ZERO_OP_REQ_BINDING);

  const zeroEntrySource = await fs.readFile(
    path.join(zeroOpDir, 'generated-entry.js'),
    UTF8,
  );
  t.ok(
    zeroEntrySource.includes(WORLD_V2),
    'generated-entry.js stamps service-cell-v2 world',
  );

  const zeroBuild = await runBuild({
    createLocalOciLayoutBuilder: createFakeOciBuilder(zeroOpDir),
    projectDirectory: zeroOpDir,
  });
  const zeroWasmBytes = await fs.readFile(zeroBuild.componentPath);
  const zeroInstance = await instantiateBuiltComponent(
    zeroWasmBytes,
    {
      callContext: {emit() {}},
      requestContext: {
        callBinding() {
          throw new Error('zero-op service must not invoke callBinding');
        },
      },
    },
    rootDir,
  );
  const zeroRespRaw = await zeroInstance.handleRequest(
    'fetch',
    JSON.stringify({
      bodyBase64: null,
      headers: [],
      method: 'GET',
      path: '/health',
    }),
  );
  const zeroResp = JSON.parse(zeroRespRaw);
  t.equal(zeroResp.status, HTTP_STATUS_OK, 'zero-op Hono GET /health returns 200');
  t.same(
    JSON.parse(Buffer.from(zeroResp.bodyBase64, 'base64').toString(UTF8)),
    {ok: true, service: ZERO_OP_SERVICE_NAME},
  );

  // 2. Multi-operation Hono service (>= 2 operations)
  const multiOpDir = path.join(rootDir, MULTI_OP_SERVICE_NAME);
  await fs.mkdir(multiOpDir, {recursive: true});
  await fs.writeFile(
    path.join(multiOpDir, 'lagrange.service.js'),
    multiOpServiceSource(),
    UTF8,
  );

  const multiGen = await runGenerate({projectDirectory: multiOpDir});
  t.equal(multiGen.ir.target, WORLD_V2, 'multi-op Hono service targets service-cell-v2');
  t.equal(multiGen.ir.operations.length, 2, 'both operations normalized into IR');
  t.same(
    multiGen.records.manifest.exports,
    [
      {interface: INTERFACE_REQUEST_V2, name: EXPORT_HANDLE_REQUEST},
      {interface: INTERFACE_CALL_V2, name: 'run'},
    ],
    'multi-op manifest exports request_v2 + call_v2',
  );
  t.same(
    multiGen.records.bindings.map((b) => ({
      handlerId: b.target.handler_id,
      interface: b.target.interface,
      name: b.name,
    })),
    [
      {
        handlerId: 'fetch',
        interface: INTERFACE_REQUEST_V2,
        name: MULTI_OP_REQ_BINDING,
      },
      {
        handlerId: OP_FLAGS,
        interface: INTERFACE_CALL_V2,
        name: FLAGS_CALL_BINDING,
      },
      {
        handlerId: OP_SUMMARIZE,
        interface: INTERFACE_CALL_V2,
        name: SUMMARIZE_CALL_BINDING,
      },
    ],
    'both call bindings target call_v2 with distinct handler_id values',
  );

  const multiBuild = await runBuild({
    createLocalOciLayoutBuilder: createFakeOciBuilder(multiOpDir),
    projectDirectory: multiOpDir,
  });
  const sqlRecorder = createFakeDeploySqlClient();
  const receipt = await runPublish({
    createSqlClient: sqlRecorder.client,
    projectDirectory: multiOpDir,
  });
  t.equal(receipt.service, MULTI_OP_SERVICE_NAME);

  // Delete publisher source files and deploy from clean directory via receipt
  const cleanDeployDir = path.join(rootDir, 'clean-deploy');
  await fs.mkdir(path.join(cleanDeployDir, '.lagrange'), {recursive: true});
  await fs.copyFile(
    path.join(multiOpDir, '.lagrange', 'publish-receipt.json'),
    path.join(cleanDeployDir, '.lagrange', 'publish-receipt.json'),
  );
  await fs.rm(path.join(multiOpDir, 'lagrange.service.js'), {force: true});
  await fs.rm(path.join(multiOpDir, 'generated-entry.js'), {force: true});

  const deployed = await runDeploy({
    createSqlClient: sqlRecorder.client,
    idempotencyKey: DEPLOY_KEY,
    projectDirectory: cleanDeployDir,
    requireSuccessorArtifact: true,
  });
  t.equal(deployed.packageId, CANNED_PACKAGE_ID);
  t.same(deployed.bindings, [
    MULTI_OP_REQ_BINDING,
    FLAGS_CALL_BINDING,
    SUMMARIZE_CALL_BINDING,
  ]);

  // Instantiate the built multi-operation WASI component and verify:
  // (a) run-operation & reduce-operation for both operations
  // (b) unknown operation refusal
  // (c) handle-request invoking both operations sequentially via callBinding
  // (d) unauthorized operation refusal
  const emittedPartials = [];
  const multiWasmBytes = await fs.readFile(multiBuild.componentPath);
  const allowedBindings = new Set(
    multiGen.records.accessPolicies[0].calls.map((c) => c.binding),
  );
  const multiCallInstance = await instantiateBuiltComponent(
    multiWasmBytes,
    {
      callContext: {
        emit(key, partialJson) {
          emittedPartials.push([key, partialJson]);
        },
      },
      requestContext: {
        callBinding() {
          throw new Error('call cell must not invoke request callBinding');
        },
      },
    },
    rootDir,
  );
  const multiRequestInstance = await instantiateBuiltComponent(
    multiWasmBytes,
    {
      callContext: {emit() {}},
      requestContext: {
        callBinding(bindingName, argsJson) {
          if (!allowedBindings.has(bindingName)) {
            const denied = new Error(`403 target_not_allowed: ${bindingName}`);
            denied.code = 'target_not_allowed';
            throw denied;
          }
          emittedPartials.length = 0;
          const isSummarize = bindingName === SUMMARIZE_CALL_BINDING;
          const opId = isSummarize ? OP_SUMMARIZE : OP_FLAGS;
          const witBatch = [
            {
              columns: [
                {name: 'account_id', val: {tag: 'integer', val: BigInt(ACCOUNT_ID_42)}},
                {name: 'amount_cents', val: {tag: 'integer', val: 1200n}},
                {name: 'flagged', val: {tag: 'integer', val: 1n}},
              ],
            },
            {
              columns: [
                {name: 'account_id', val: {tag: 'integer', val: BigInt(ACCOUNT_ID_42)}},
                {name: 'amount_cents', val: {tag: 'integer', val: 800n}},
                {name: 'flagged', val: {tag: 'integer', val: 0n}},
              ],
            },
          ];
          multiCallInstance.run(opId, witBatch, argsJson);
          return multiCallInstance.reduce(opId, emittedPartials, argsJson);
        },
      },
    },
    rootDir,
  );

  // Unknown operation ID is refused fail-closed with typed unknown_operation_id
  const unknownRefusal = JSON.parse(
    multiCallInstance.run(OP_UNKNOWN, [], '{}'),
  );
  t.same(
    unknownRefusal,
    {code: 'unknown_operation_id', id: OP_UNKNOWN},
    'unknown operation_id is refused fail-closed by run',
  );

  // Sequential multi-operation invocation from Hono GET /accounts/42/overview
  const overviewRaw = await multiRequestInstance.handleRequest(
    'fetch',
    JSON.stringify({
      bodyBase64: null,
      headers: [],
      method: 'GET',
      path: `/accounts/${ACCOUNT_ID_42}/overview`,
    }),
  );
  const overviewResp = JSON.parse(overviewRaw);
  t.equal(overviewResp.status, HTTP_STATUS_OK);
  const overviewBody = JSON.parse(
    Buffer.from(overviewResp.bodyBase64, 'base64').toString(UTF8),
  );
  t.same(overviewBody, {
    accountId: ACCOUNT_ID_42,
    flags: {accountId: ACCOUNT_ID_42, flaggedCount: 1, op: OP_FLAGS},
    summary: {accountId: ACCOUNT_ID_42, count: 2, op: OP_SUMMARIZE, total: 2000},
  });

  // Unauthorized call target is refused fail-closed
  const unauthRaw = await multiRequestInstance.handleRequest(
    'fetch',
    JSON.stringify({
      bodyBase64: null,
      headers: [],
      method: 'GET',
      path: `/accounts/${ACCOUNT_ID_42}/unauthorized`,
    }),
  );
  const unauthResp = JSON.parse(unauthRaw);
  t.equal(unauthResp.status, HTTP_STATUS_FORBIDDEN);
});

test(`${QUEST_ID}: legacy v1 artifact and schema v2 binding are refused with ${LEGACY_ABI_CODE}`, async (t) => {
  const owner = new ServiceLifecycleCommandOwner({
    artifactPayloadStore: {},
    artifactResolver: {},
    bindingOwner: {
      async createBinding() {
        return {};
      },
    },
    catalogOwner: {},
    requireSuccessorArtifact: true,
    signaturePolicy: SERVICE_LIFECYCLE_DEFAULT_SIGNATURE_POLICY,
  });

  const legacyManifestResult = await owner.execute(
    SERVICE_LIFECYCLE_COMMAND.INSTALL,
    {
      idempotency_key: 'legacy-install-1',
      manifest: {
        artifact: {
          digest: CANNED_DIGEST,
          media_type: 'application/vnd.oci.image.manifest.v1+json',
          ref: 'registry.example.test/svc:1.0.0',
          size_bytes: 512,
          type: 'oci',
        },
        exports: [{interface: 'request_v1', name: 'handle'}],
        name: 'legacy-svc',
        resources: {cpu_cores: 1, memory_mb: 128},
        runtime: {kind: 'wasm_component'},
        schema_version: 3,
        version: '1.0.0',
      },
    },
    SECURITY_A,
  );
  t.equal(legacyManifestResult.success, false);
  t.equal(
    legacyManifestResult.errorCode,
    SERVICE_LIFECYCLE_COMMAND_ERROR_CODE.LEGACY_ARTIFACT_ABI_UNSUPPORTED,
    'INSTALL SERVICE refuses request_v1 manifest with LEGACY_ARTIFACT_ABI_UNSUPPORTED',
  );

  const legacyBindingResult = await owner.execute(
    SERVICE_LIFECYCLE_COMMAND.CREATE_BINDING,
    {
      budgets: {concurrency_limit: 4, max_inflight_bytes: 65536, timeout_ms: 1000},
      name: 'legacy-svc--request--handle',
      schema_version: 2,
      source: {kind: 'request', method: 'GET', path: '/health'},
      target: {
        artifact_digest: CANNED_DIGEST,
        export_name: 'handle',
        manifest_digest: CANNED_DIGEST,
        package_id: CANNED_PACKAGE_ID,
      },
    },
    SECURITY_A,
  );
  t.equal(legacyBindingResult.success, false);
  t.equal(
    legacyBindingResult.errorCode,
    SERVICE_LIFECYCLE_COMMAND_ERROR_CODE.LEGACY_ARTIFACT_ABI_UNSUPPORTED,
    'CREATE BINDING refuses schema_version 2 binding with LEGACY_ARTIFACT_ABI_UNSUPPORTED',
  );
});

test(`${QUEST_ID}: direct public CALL BINDING supports scoped invocation_key replay, conflict refusal, generation pinning, uncertain-outcome refusal, expiry, and unkeyed warning`, async (t) => {
  const nowRef = {nowMs: INITIAL_NOW_MS};
  const {coordinator} = createInMemoryCoordinator(nowRef);

  let activeBindingVersionId = BINDING_V1;
  let activeGeneration = GEN_1;
  let adapterRuns = 0;
  let shouldFailPreExecutionRetryable = false;
  let shouldFailMidExecutionUncertain = false;

  const routeResolver = {
    resolve(req) {
      const requestedVersion = req.bindingVersionId || activeBindingVersionId;
      const gen = requestedVersion === BINDING_V1 ? GEN_1 : GEN_2;
      return {
        bindingVersionId: requestedVersion,
        generation: req.bindingVersionId ? gen : activeGeneration,
        name: req.name,
        parameters: [{name: 'accountId', nullable: false, position: 1, type: 'int64'}],
        replicaId: 'replica-1',
        serviceId: 'svc-direct-call',
        statement: {
          language: 'sql',
          text: 'SELECT account_id FROM account_tx WHERE account_id = $1',
        },
      };
    },
  };

  const batchExecutor = {
    executeBatches() {},
    planShards(req) {
      const parsed = JSON.parse(req.argumentsJson || '{}');
      return {
        boundParameters: [parsed.accountId],
        parametersDigest: `digest:${parsed.accountId}`,
        shards: [{partitionId: 'p1'}],
        tableName: 'account_tx',
      };
    },
  };

  const partitionTopology = {
    resolveShardHost() {
      return {hostNodeId: 'node-1', partitionVersion: 1};
    },
  };

  const statementAdapter = {
    async invoke(req) {
      if (shouldFailPreExecutionRetryable) {
        throw createCallRoutingFailure(
          CALL_CELL_ROUTE_ERROR_CODE.HOST_CELL_UNAVAILABLE,
          'shard host cell not yet ready',
          {classification: CALL_CELL_ROUTE_CLASSIFICATION.RETRYABLE},
        );
      }
      if (req.exportName === 'run') {
        adapterRuns += 1;
        if (shouldFailMidExecutionUncertain) {
          throw createCallRoutingFailure(
            CALL_CELL_ROUTE_ERROR_CODE.TRANSPORT_FAILED,
            'transport lost after dispatch',
            {
              classification: CALL_CELL_ROUTE_CLASSIFICATION.TERMINAL,
              invoked: true,
            },
          );
        }
        return {
          partials: [{
            key: 'partial:acct',
            partial: JSON.stringify(adapterRuns),
          }],
          replicaId: 'replica-1',
        };
      }
      const [, firstPartial] = req.partials[0];
      const decodedRuns = JSON.parse(firstPartial);
      return {
        componentResult: JSON.stringify({
          bindingVersionId: req.bindingVersionId,
          runs: decodedRuns,
        }),
        replicaId: 'replica-1',
      };
    },
  };

  const invoker = new CallCellInvoker({
    batchExecutor,
    nowProvider: () => nowRef.nowMs,
    partialLimit: 64,
    partitionTopology,
    reduceCoordinator: coordinator,
    retentionWindowMs: RETENTION_WINDOW_MS,
    routeResolver,
    statementAdapter,
  });

  const commandOwner = new ServiceLifecycleCommandOwner({
    artifactResolver: {},
    callCellInvoker: invoker,
    catalogOwner: {},
    signaturePolicy: SERVICE_LIFECYCLE_DEFAULT_SIGNATURE_POLICY,
  });

  // 1. SQL grammar accepts invocation_key and idempotency_key on CALL BINDING $1
  const parsedSql = parseServiceLifecycleSql('CALL BINDING $1', [
    JSON.stringify({
      arguments: {accountId: ACCOUNT_ID_42},
      invocation_key: 'inv-key-1',
      name: SUMMARIZE_CALL_BINDING,
      schema_version: 2,
    }),
  ]);
  t.equal(parsedSql.command, SERVICE_LIFECYCLE_COMMAND.CALL_BINDING);
  t.equal(parsedSql.payload.invocation_key, 'inv-key-1');

  // 2. First keyed invocation executes once; replay with same intent returns retained result without re-executing
  const firstCall = await commandOwner.execute(
    SERVICE_LIFECYCLE_COMMAND.CALL_BINDING,
    {
      arguments: {accountId: ACCOUNT_ID_42},
      invocation_key: 'inv-key-1',
      name: SUMMARIZE_CALL_BINDING,
      schema_version: 2,
    },
    SECURITY_A,
  );
  t.equal(firstCall.success, true, JSON.stringify(firstCall));
  t.equal(adapterRuns, 1);
  t.same(JSON.parse(firstCall.rows[0].result), {
    bindingVersionId: BINDING_V1,
    runs: 1,
  });

  const replayCall = await commandOwner.execute(
    SERVICE_LIFECYCLE_COMMAND.CALL_BINDING,
    {
      arguments: {accountId: ACCOUNT_ID_42},
      invocation_key: 'inv-key-1',
      name: SUMMARIZE_CALL_BINDING,
      schema_version: 2,
    },
    SECURITY_A,
  );
  t.equal(replayCall.success, true);
  t.equal(adapterRuns, 1, 'same-intent replay does not re-execute shard run');
  t.equal(replayCall.rows[0].result, firstCall.rows[0].result);

  // 3. CLI `lagrange service call` routes through CALL BINDING $1 with --invocation-key
  const cliLines = [];
  const cliExit = await runServicePipelineCommand(
    [
      'call',
      SUMMARIZE_CALL_BINDING,
      '--arguments',
      JSON.stringify({accountId: ACCOUNT_ID_42}),
      '--invocation-key',
      'inv-key-1',
    ],
    {
      createSqlClient: () => ({
        async execute(_stmt, params) {
          const p = JSON.parse(params[0]);
          return commandOwner.execute(
            SERVICE_LIFECYCLE_COMMAND.CALL_BINDING,
            p,
            SECURITY_A,
          );
        },
      }),
      writeOutput: (line) => cliLines.push(line),
    },
  );
  t.equal(cliExit, 0);
  t.equal(adapterRuns, 1, 'CLI replay with same invocation-key also reuses retained result');
  t.same(JSON.parse(JSON.parse(cliLines[0]).result), {
    bindingVersionId: BINDING_V1,
    runs: 1,
  });

  // Also verify runCall directly
  const directRunCall = await runCall({
    arguments: {accountId: ACCOUNT_ID_42},
    createSqlClient: () => ({
      async execute(_stmt, params) {
        return commandOwner.execute(
          SERVICE_LIFECYCLE_COMMAND.CALL_BINDING,
          JSON.parse(params[0]),
          SECURITY_A,
        );
      },
    }),
    invocationKey: 'inv-key-1',
    name: SUMMARIZE_CALL_BINDING,
  });
  t.equal(directRunCall.result, firstCall.rows[0].result);

  // 4. Conflict refusal: changed arguments, changed binding name, or changed generation under same key
  const conflictArgs = await commandOwner.execute(
    SERVICE_LIFECYCLE_COMMAND.CALL_BINDING,
    {
      arguments: {accountId: 99},
      invocation_key: 'inv-key-1',
      name: SUMMARIZE_CALL_BINDING,
      schema_version: 2,
    },
    SECURITY_A,
  );
  t.equal(conflictArgs.success, false);
  t.equal(conflictArgs.errorCode, CALL_CELL_ROUTE_ERROR_CODE.INVOCATION_CONFLICT);
  t.equal(conflictArgs.detail.outcomeClass, CALL_OUTCOME_CLASS.DEFINITELY_NOT_EXECUTED);
  t.equal(conflictArgs.detail.retrySafe, false);

  const conflictOp = await commandOwner.execute(
    SERVICE_LIFECYCLE_COMMAND.CALL_BINDING,
    {
      arguments: {accountId: ACCOUNT_ID_42},
      invocation_key: 'inv-key-1',
      name: FLAGS_CALL_BINDING,
      schema_version: 2,
    },
    SECURITY_A,
  );
  t.equal(conflictOp.success, false);
  t.equal(conflictOp.errorCode, CALL_CELL_ROUTE_ERROR_CODE.INVOCATION_CONFLICT);

  const conflictGen = await commandOwner.execute(
    SERVICE_LIFECYCLE_COMMAND.CALL_BINDING,
    {
      arguments: {accountId: ACCOUNT_ID_42},
      generation: GEN_2,
      invocation_key: 'inv-key-1',
      name: SUMMARIZE_CALL_BINDING,
      schema_version: 2,
    },
    SECURITY_A,
  );
  t.equal(conflictGen.success, false);
  t.equal(conflictGen.errorCode, CALL_CELL_ROUTE_ERROR_CODE.INVOCATION_CONFLICT);

  // 5. Scope isolation across (tenantId, principal)
  t.not(
    createScopedDirectCallInvocationId({
      invocationKey: 'inv-key-1',
      principal: PRINCIPAL_A,
      tenantId: TENANT_A,
    }),
    createScopedDirectCallInvocationId({
      invocationKey: 'inv-key-1',
      principal: PRINCIPAL_B,
      tenantId: TENANT_B,
    }),
  );
  const otherTenantCall = await commandOwner.execute(
    SERVICE_LIFECYCLE_COMMAND.CALL_BINDING,
    {
      arguments: {accountId: 99},
      invocation_key: 'inv-key-1',
      name: SUMMARIZE_CALL_BINDING,
      schema_version: 2,
    },
    SECURITY_B,
  );
  t.equal(otherTenantCall.success, true, 'same invocation_key under different tenant/principal is isolated');
  t.equal(adapterRuns, 2);

  // 6. Generation pinning across deployment revision updates:
  // Admit 'inv-key-pinned' under GEN_1 while pre-execution fails retryably,
  // then switch active binding to BINDING_V2 (GEN_2). Retry with 'inv-key-pinned'
  // must consume pinned BINDING_V1, while 'inv-key-fresh-v2' resolves BINDING_V2.
  shouldFailPreExecutionRetryable = true;
  const retryableAttempt = await commandOwner.execute(
    SERVICE_LIFECYCLE_COMMAND.CALL_BINDING,
    {
      arguments: {accountId: ACCOUNT_ID_42},
      invocation_key: 'inv-key-pinned',
      name: SUMMARIZE_CALL_BINDING,
      schema_version: 2,
    },
    SECURITY_A,
  );
  t.equal(retryableAttempt.success, false);
  t.equal(retryableAttempt.errorCode, CALL_CELL_ROUTE_ERROR_CODE.HOST_CELL_UNAVAILABLE);
  t.equal(retryableAttempt.detail.retrySafe, true);

  activeBindingVersionId = BINDING_V2;
  activeGeneration = GEN_2;
  shouldFailPreExecutionRetryable = false;

  const pinnedRetry = await commandOwner.execute(
    SERVICE_LIFECYCLE_COMMAND.CALL_BINDING,
    {
      arguments: {accountId: ACCOUNT_ID_42},
      invocation_key: 'inv-key-pinned',
      name: SUMMARIZE_CALL_BINDING,
      schema_version: 2,
    },
    SECURITY_A,
  );
  t.equal(pinnedRetry.success, true);
  t.equal(
    JSON.parse(pinnedRetry.rows[0].result).bindingVersionId,
    BINDING_V1,
    'retry with original invocation_key consumes pinned generation 1',
  );

  const freshGen2Call = await commandOwner.execute(
    SERVICE_LIFECYCLE_COMMAND.CALL_BINDING,
    {
      arguments: {accountId: ACCOUNT_ID_42},
      invocation_key: 'inv-key-fresh-v2',
      name: SUMMARIZE_CALL_BINDING,
      schema_version: 2,
    },
    SECURITY_A,
  );
  t.equal(freshGen2Call.success, true);
  t.equal(
    JSON.parse(freshGen2Call.rows[0].result).bindingVersionId,
    BINDING_V2,
    'new invocation_key resolves newly active generation 2',
  );

  // 7. Uncertain outcome after mid-execution failure refuses automatic retry with INVOCATION_AMBIGUOUS
  shouldFailMidExecutionUncertain = true;
  const midExecFail = await commandOwner.execute(
    SERVICE_LIFECYCLE_COMMAND.CALL_BINDING,
    {
      arguments: {accountId: ACCOUNT_ID_42},
      invocation_key: 'inv-key-uncertain',
      name: SUMMARIZE_CALL_BINDING,
      schema_version: 2,
    },
    SECURITY_A,
  );
  t.equal(midExecFail.success, false);
  t.equal(midExecFail.detail.outcomeClass, CALL_OUTCOME_CLASS.OUTCOME_UNCERTAIN);
  t.equal(midExecFail.detail.retrySafe, false);

  shouldFailMidExecutionUncertain = false;
  const retryUncertain = await commandOwner.execute(
    SERVICE_LIFECYCLE_COMMAND.CALL_BINDING,
    {
      arguments: {accountId: ACCOUNT_ID_42},
      invocation_key: 'inv-key-uncertain',
      name: SUMMARIZE_CALL_BINDING,
      schema_version: 2,
    },
    SECURITY_A,
  );
  t.equal(retryUncertain.success, false);
  t.equal(
    retryUncertain.errorCode,
    CALL_CELL_ROUTE_ERROR_CODE.INVOCATION_AMBIGUOUS,
    'retry of uncertain invocation fails closed with INVOCATION_AMBIGUOUS',
  );
  t.equal(retryUncertain.detail.outcomeClass, CALL_OUTCOME_CLASS.OUTCOME_UNCERTAIN);
  t.equal(retryUncertain.detail.retrySafe, false);

  // 8. Expiry after retention window returns INVOCATION_EXPIRED
  nowRef.nowMs += EXPIRED_DELTA_MS;
  const expiredReplay = await commandOwner.execute(
    SERVICE_LIFECYCLE_COMMAND.CALL_BINDING,
    {
      arguments: {accountId: ACCOUNT_ID_42},
      invocation_key: 'inv-key-1',
      name: SUMMARIZE_CALL_BINDING,
      schema_version: 2,
    },
    SECURITY_A,
  );
  t.equal(expiredReplay.success, false);
  t.equal(
    expiredReplay.errorCode,
    CALL_CELL_ROUTE_ERROR_CODE.INVOCATION_EXPIRED,
    'replay past retentionWindowMs fails closed with INVOCATION_EXPIRED',
  );

  // 9. Omitted invocation_key preserves unknown-outcome warning on mid-execution failure
  shouldFailMidExecutionUncertain = true;
  let unkeyedError = null;
  try {
    await invoker.invoke({
      argumentsJson: JSON.stringify({accountId: ACCOUNT_ID_42}),
      name: SUMMARIZE_CALL_BINDING,
      securityContext: SECURITY_A,
    });
  } catch (err) {
    unkeyedError = err;
  }
  t.ok(unkeyedError, 'unkeyed mid-execution failure throws');
  t.equal(
    publicCallOutcomeOf(unkeyedError).outcomeClass,
    CALL_OUTCOME_CLASS.OUTCOME_UNCERTAIN,
  );
  t.match(
    unkeyedError.unkeyedWarning,
    /invocation_key omitted/u,
    'omitted invocation_key attaches unknown-outcome warning',
  );
});
