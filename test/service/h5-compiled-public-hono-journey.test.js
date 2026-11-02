import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import Database from 'better-sqlite3';

import {
  ARTIFACT_PAYLOAD_CHUNKS_SCHEMA,
  ARTIFACT_PAYLOADS_SCHEMA,
} from '../../src/bootstrap/system-table-artifact-schema-definitions.js';
import {
  generateCreateIndexSQL,
  generateCreateTableSQL,
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  runBuild,
  runDeploy,
  runGenerate,
  runPublish,
} from '../../src/cli/service-pipeline-command.js';
import {
  createHonoServiceProject,
} from '../../src/cli/service-wasm-scaffold.js';
import {
  RUNTIME_KIND,
  UNIFIED_SERVICE_TYPE,
} from '../../src/constants/index.js';
import {
  bindDeploymentArtifact,
  buildBindingRow,
  canonicalJson,
  normalizeDeploymentBinding,
  projectBinding,
} from '../../src/control-plane/owners/deployment-binding-contract.js';
import {
  buildActivatedRequestBindingServiceDefinition,
  buildRequestBindingServiceDefinition,
} from '../../src/control-plane/owners/request-binding-service-definition-contract.js';
import {
  handleRequestCellInvocation,
} from '../../src/node/runtime-service-request-cell-handler.js';
import {
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {
  toCellBatch,
} from '../../src/runtime/call-cell-value-mapping.js';
import {
  HOST_CALL_ERROR_CODE,
} from '../../src/runtime/cell-host-call-protocol.js';
import {
  RuntimeDriverRegistry,
} from '../../src/runtime/runtime-driver-registry.js';
import {
  ServiceRuntimeLifecycle,
} from '../../src/runtime/service-runtime-lifecycle.js';
import {
  WasiComponentCellRuntime,
} from '../../src/runtime/wasi-component-cell-runtime.js';
import {
  WasmComponentDriver,
} from '../../src/runtime/wasm-component-driver.js';
import {
  loadComponentPayloadThroughStore,
} from '../../src/service/artifact-payload-loader.js';
import {
  createArtifactPayloadStore,
} from '../../src/service/artifact-payload-store.js';
import {
  decodeCanonicalPartialValue,
  validateValueAgainstSchema,
} from '../../src/service/call-canonical-partial-codec.js';
import {
  CALL_CELL_PARTIAL_KEY_PREFIX,
} from '../../src/service/call-cell-routing-contract.js';
import {
  normalizeCallSelectorInvocationParameters,
  normalizeCallSelectorParameterSchema,
} from '../../src/service/call-selector-parameter-contract.js';
import {
  createPagedShardProgressTracker,
  createShardReadViewManager,
  executePagedShardSlot,
} from '../../src/service/call-shard-paged-execution.js';
import {
  RequestBindingRouteResolver,
} from '../../src/service/request-binding-route-resolver.js';
import {
  createRequestCellCallBridge,
} from '../../src/service/request-cell-call-bridge.js';
import {
  RequestCellHttpAdapter,
} from '../../src/service/request-cell-http-adapter.js';
import {
  REQUEST_CELL_ROUTE_CLASSIFICATION,
  REQUEST_CELL_ROUTE_ERROR_CODE,
  RequestCellRoutingError,
} from '../../src/service/request-cell-routing-contract.js';
import {test} from '../../src/test-helpers/tap.js';
import {
  MemoryInvocationJournal,
} from './minimal-deployment-request-cell-routing-fixture.js';

const QUEST_ID = 'h5-compiled-public-hono-journey';
const TOOLCHAIN_TIMEOUT_MS = 300_000;
const TEMP_PREFIX = 'lagrange-h5-journey-';
const UTF8_ENCODING = 'utf8';
const SHA256_ALGORITHM = 'sha256';
const HEX_ENCODING = 'hex';
const MEMORY_DB_PATH = ':memory:';
const HONO_AUTHORING_INDEX_URL = fileURLToPath(
  new URL('../../src/authoring/index.js', import.meta.url),
);
const REPO_NODE_MODULES_PATH = fileURLToPath(
  new URL('../../node_modules', import.meta.url),
);

const SCAFFOLD_SERVICE_NAME = 'hono-scaffold-amounts';
const ZERO_OP_SERVICE_NAME = 'hono-zero-op-health';
const MULTI_OP_SERVICE_NAME = 'hono-multi-op-journey';
const SERVICE_VERSION_V1 = '1.0.0';
const SERVICE_VERSION_V2 = '2.0.0';

const HANDLE_REQUEST_EXPORT = 'handle-request';
const RUN_EXPORT = 'run';
const REDUCE_EXPORT = 'reduce';
const REQUEST_V2_INTERFACE = 'request_v2';
const FETCH_HANDLER_ID = 'fetch';
const REQUEST_SOURCE_KIND = 'request';
const WILDCARD_HOST = '*';
const API_MOUNT_PREFIX = '/api';

const HTTP_STATUS_OK = 200;
const HTTP_STATUS_NO_CONTENT = 204;
const HTTP_STATUS_BAD_REQUEST = 400;
const HTTP_STATUS_UNAUTHORIZED = 401;
const HTTP_STATUS_FORBIDDEN = 403;
const HTTP_STATUS_CONFLICT = 409;
const HTTP_STATUS_PAYLOAD_TOO_LARGE = 413;

const ACCOUNT_101 = 101;
const ACCOUNT_202 = 202;
const ACCOUNT_999 = 999;
const MIN_HIGH_VALUE_CENTS = 500;
const TOTAL_SEEDED_ROWS = 1_260;
const SHARD_COUNT = 3;
const PAGE_ROW_BOUND = 200;
const PAGE_BYTE_BOUND = 65_536;

const CATEGORIES = Object.freeze(['compute', 'storage', 'network']);
const TENANT_ALPHA = 'tenant-alpha';
const PRINCIPAL_ALICE = 'principal-alice';
const PRINCIPAL_BOB = 'principal-bob';
const REVOKED_TOKEN = 'Bearer revoked-token';
const BOB_TOKEN = 'Bearer bob-token';
const ROLES_APPLICATION = Object.freeze(['application']);
const ADMIN_SECURITY_CONTEXT = Object.freeze({
  principal: 'admin',
  roles: Object.freeze(['admin']),
  tenantId: TENANT_ALPHA,
});

const NODE_ID = 'node-h5-1';
const RUNTIME_BUDGETS = Object.freeze({
  context_bytes: 65_536,
  cpu_time_ms: 5_000,
  input_bytes: 262_144,
  memory_bytes: 128 * 1_024 * 1_024,
  output_bytes: 262_144,
  wall_time_ms: 30_000,
});

function sha256Digest(input) {
  return `sha256:${createHash(SHA256_ALGORITHM).update(input).digest(HEX_ENCODING)}`;
}

function createInMemoryArtifactStore() {
  const db = new Database(MEMORY_DB_PATH);
  db.exec(generateCreateTableSQL(ARTIFACT_PAYLOADS_SCHEMA));
  for (const idxSql of generateCreateIndexSQL(ARTIFACT_PAYLOADS_SCHEMA)) {
    db.exec(idxSql);
  }
  db.exec(generateCreateTableSQL(ARTIFACT_PAYLOAD_CHUNKS_SCHEMA));
  for (const idxSql of generateCreateIndexSQL(ARTIFACT_PAYLOAD_CHUNKS_SCHEMA)) {
    db.exec(idxSql);
  }
  const executeInternal = async (sql, params = []) => {
    const normalized = sql.replace(/\$(\d+)/gu, '?');
    const trimmed = normalized.trim().toUpperCase();
    const stmt = db.prepare(normalized);
    if (trimmed.startsWith('SELECT')) {
      return {rows: stmt.all(...params), success: true};
    }
    const info = stmt.run(...params);
    return {changes: info.changes, rows: [], success: true};
  };
  return {
    db,
    store: createArtifactPayloadStore({executeInternal}),
  };
}

function createFakeOciBuilder(projectDir) {
  return () => ({
    async build() {
      const wasmPath = path.join(projectDir, '.lagrange', 'component.wasm');
      const wasmBytes = await fs.readFile(wasmPath);
      return {
        layoutPath: path.join(projectDir, '.lagrange', 'oci'),
        topManifestDescriptor: {
          digest: sha256Digest(wasmBytes),
          sizeBytes: wasmBytes.byteLength,
        },
      };
    },
  });
}

function createSqlClientForStore(artifactStore, recordedQueries = []) {
  let pkgSeq = 0;
  return () => ({
    async execute(statement, parameters = []) {
      recordedQueries.push({parameters, statement});
      if (statement.startsWith('PUBLISH SERVICE ARTIFACT')) {
        const payload = JSON.parse(parameters[0]);
        await artifactStore.putPayload({
          artifactDigest: payload.artifact_digest,
          bytes: Buffer.from(payload.bytes, 'base64'),
          mediaType: payload.media_type,
          payloadDigest: payload.payload_digest,
        });
        return {rows: [{ok: true}]};
      }
      if (statement.startsWith('INSTALL SERVICE')) {
        pkgSeq += 1;
        const hexId = String(pkgSeq).repeat(64).slice(0, 64);
        return {rows: [{package_id: `service-package-${hexId}`}]};
      }
      return {rows: [{ok: true}]};
    },
  });
}

function createInMemoryTableCache() {
  const store = new Map();
  const bucket = (name) => {
    let map = store.get(name);
    if (!map) {
      map = new Map();
      store.set(name, map);
    }
    return map;
  };
  return {
    get: (name, key) => store.get(name)?.get(key) ?? null,
    getAll: (name) => [...(store.get(name)?.values() ?? [])],
    set: (name, key, row) => bucket(name).set(key, row),
  };
}

function createMockReply() {
  let statusCode = HTTP_STATUS_OK;
  const headers = {};
  return {
    code(c) {
      statusCode = c;
      return this;
    },
    getHeaders() {
      return headers;
    },
    getStatusCode() {
      return statusCode;
    },
    header(k, v) {
      headers[k.toLowerCase()] = v;
      return this;
    },
  };
}

function buildFetchDeploymentRows({
  artifactRef,
  bindingName,
  componentBytes,
  createdAt,
  generation,
  mountPrefix = API_MOUNT_PREFIX,
  packageId,
  serviceName,
  serviceVersion,
}) {
  const payloadDigest = sha256Digest(componentBytes);
  const manifest = {
    artifact: {
      digest: payloadDigest,
      media_type: 'application/wasm',
      ref: artifactRef,
      type: 'oci',
    },
    capabilities: [],
    exports: [
      {
        interface: REQUEST_V2_INTERFACE,
        name: HANDLE_REQUEST_EXPORT,
      },
    ],
    name: serviceName,
    runtime: {kind: RUNTIME_KIND.WASM_COMPONENT},
    schema_version: 3,
    version: serviceVersion,
  };
  const manifestDigest = sha256Digest(canonicalJson(manifest));
  const artifact = {
    artifactDigest: payloadDigest,
    bytes: componentBytes,
    manifest,
    manifestDigest,
    packageId,
    payloadDigest,
  };
  const declaration = {
    budgets: RUNTIME_BUDGETS,
    name: bindingName,
    schema_version: 3,
    source: {
      host: WILDCARD_HOST,
      kind: REQUEST_SOURCE_KIND,
      path_prefix: mountPrefix,
    },
    target: {
      handler_id: FETCH_HANDLER_ID,
      interface: REQUEST_V2_INTERFACE,
      manifest_digest: manifestDigest,
      package_id: packageId,
    },
  };
  const bound = bindDeploymentArtifact(
    normalizeDeploymentBinding(declaration),
    artifact,
  );
  const bindingRow = buildBindingRow(
    bound,
    ADMIN_SECURITY_CONTEXT,
    createdAt,
    generation,
  );
  const binding = projectBinding(bindingRow);
  const definition = buildActivatedRequestBindingServiceDefinition(
    buildRequestBindingServiceDefinition(bindingRow, artifact),
    binding,
  );
  const replicaId = `${definition.service_id}-r1`;
  const actualRow = {
    created_at: createdAt,
    definition_id: definition.service_id,
    node_id: NODE_ID,
    service_id: replicaId,
    service_type: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
    status: ReplicaStatus.ACTIVE,
    updated_at: createdAt,
  };
  return {actualRow, artifact, binding, bindingRow, definition, replicaId};
}

function registerRowsInCache(cache, rows) {
  cache.set(
    SYSTEM_TABLE_NAME.SERVICE_BINDINGS,
    rows.bindingRow.binding_version_id,
    rows.bindingRow,
  );
  cache.set(
    SYSTEM_TABLE_NAME.SERVICE_DEFINITIONS,
    rows.definition.service_id,
    rows.definition,
  );
  cache.set(
    SYSTEM_TABLE_NAME.SERVICES,
    rows.actualRow.service_id,
    rows.actualRow,
  );
}

function zeroOpHonoSource() {
  return `import {Hono} from 'hono';
import {defineService} from ${JSON.stringify(HONO_AUTHORING_INDEX_URL)};

const app = new Hono();
app.get('/health', (c) => c.json({ok: true, service: '${ZERO_OP_SERVICE_NAME}', zeroOps: true}));

export default defineService({
  name: '${ZERO_OP_SERVICE_NAME}',
  version: '${SERVICE_VERSION_V1}',
  operations: {},
  fetch: app.fetch,
});
`;
}

function multiOpHonoSource(versionTag = SERVICE_VERSION_V1) {
  return `import {Hono} from 'hono';
import {defineService, distributed, sql} from ${JSON.stringify(HONO_AUTHORING_INDEX_URL)};

const summarizeByCategory = distributed({
  parameters: [{name: 'accountId', nullable: false, type: 'integer'}],
  pageKey: ['id'],
  pageRowBound: ${PAGE_ROW_BOUND},
  stateSchema: {
    type: 'record',
    fields: {
      computeCents: {type: 'integer'},
      networkCents: {type: 'integer'},
      pagesProcessed: {type: 'integer'},
      rowCount: {type: 'integer'},
      storageCents: {type: 'integer'},
    },
  },
  partialSchema: {
    type: 'record',
    fields: {
      amountCents: {type: 'integer'},
      category: {type: 'string'},
      count: {type: 'integer'},
    },
  },
  statement: sql\`SELECT id, account_id, category, amount_cents FROM account_ledger WHERE account_id = $1 ORDER BY id ASC\`,
  init() {
    return {
      computeCents: 0,
      networkCents: 0,
      pagesProcessed: 0,
      rowCount: 0,
      storageCents: 0,
    };
  },
  step(state, pageRows) {
    let computeCents = state.computeCents;
    let networkCents = state.networkCents;
    let storageCents = state.storageCents;
    for (const row of pageRows) {
      const amt = Number(row.amount_cents || 0);
      if (row.category === 'compute') computeCents += amt;
      else if (row.category === 'network') networkCents += amt;
      else if (row.category === 'storage') storageCents += amt;
    }
    return {
      computeCents,
      networkCents,
      pagesProcessed: state.pagesProcessed + 1,
      rowCount: state.rowCount + pageRows.length,
      storageCents,
    };
  },
  finish(state, _args, {emit}) {
    const entries = [
      ['compute', state.computeCents],
      ['network', state.networkCents],
      ['storage', state.storageCents],
    ];
    for (const [category, amountCents] of entries) {
      if (amountCents > 0) {
        emit(category, {amountCents, category, count: state.rowCount});
      }
    }
    return {pagesProcessed: state.pagesProcessed, rowCount: state.rowCount};
  },
  run(rows, _args, {emit}) {
    let computeCents = 0;
    let networkCents = 0;
    let storageCents = 0;
    for (const row of rows) {
      const amt = Number(row.amount_cents || 0);
      if (row.category === 'compute') computeCents += amt;
      else if (row.category === 'network') networkCents += amt;
      else if (row.category === 'storage') storageCents += amt;
    }
    for (const [category, amountCents] of [
      ['compute', computeCents],
      ['network', networkCents],
      ['storage', storageCents],
    ]) {
      if (amountCents > 0) {
        emit(category, {amountCents, category, count: rows.length});
      }
    }
    return {scanned: rows.length};
  },
  reduce(partials, args) {
    const totals = {compute: 0, network: 0, storage: 0};
    let partialCount = 0;
    for (const [key, value] of partials) {
      totals[key] = (totals[key] || 0) + Number(value.amountCents || 0);
      partialCount += 1;
    }
    return {
      accountId: args.accountId,
      partialCount,
      totals,
    };
  },
});

const highValueFlags = distributed({
  parameters: [
    {name: 'accountId', nullable: false, type: 'integer'},
    {name: 'minAmountCents', nullable: false, type: 'integer'},
  ],
  partialSchema: {
    type: 'record',
    fields: {
      flaggedCount: {type: 'integer'},
      maxCents: {type: 'integer'},
    },
  },
  statement: sql\`SELECT id, account_id, amount_cents FROM account_ledger WHERE account_id = $1 AND amount_cents >= $2\`,
  run(rows, args, {emit}) {
    let flaggedCount = 0;
    let maxCents = 0;
    for (const row of rows) {
      const amt = Number(row.amount_cents || 0);
      if (Number(row.account_id) === Number(args.accountId) &&
          amt >= Number(args.minAmountCents)) {
        flaggedCount += 1;
        if (amt > maxCents) maxCents = amt;
      }
    }
    if (flaggedCount > 0) {
      emit(String(args.accountId), {flaggedCount, maxCents});
    }
    return {flaggedCount, maxCents};
  },
  reduce(partials, args) {
    let flaggedCount = 0;
    let maxCents = 0;
    for (const [, value] of partials) {
      flaggedCount += Number(value.flaggedCount || 0);
      if (Number(value.maxCents || 0) > maxCents) {
        maxCents = Number(value.maxCents || 0);
      }
    }
    return {accountId: args.accountId, flaggedCount, maxCents};
  },
});

const app = new Hono();

app.get('/api/health', (c) => {
  c.header('set-cookie', 'session=alpha; Path=/; HttpOnly', {append: true});
  c.header('set-cookie', 'theme=dark; Path=/', {append: true});
  return c.json({
    ok: true,
    service: '${MULTI_OP_SERVICE_NAME}',
    version: '${versionTag}',
  });
});

app.delete('/api/session', () => new Response(null, {status: ${HTTP_STATUS_NO_CONTENT}}));

app.get('/api/inspect', (c) => {
  const tags = c.req.queries('tag') || [];
  return c.json({
    principal: c.env.principal,
    tags,
    tenantId: c.env.tenantId,
    version: '${versionTag}',
  });
});

app.post('/api/echo-binary', async (c) => {
  const ab = await c.req.arrayBuffer();
  const bytes = new Uint8Array(ab);
  const flipped = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) {
    flipped[i] = bytes[bytes.length - 1 - i];
  }
  return new Response(flipped, {
    headers: {'content-type': 'application/octet-stream'},
    status: ${HTTP_STATUS_OK},
  });
});

app.post('/api/echo-text', async (c) => {
  const text = await c.req.text();
  return c.text(\`[${versionTag}:\${text.length}:\${text}]\`);
});

app.post('/api/accounts/report', async (c) => {
  const rawBody = await c.req.text();
  let parsed;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return c.json({error: 'invalid_json'}, ${HTTP_STATUS_BAD_REQUEST});
  }
  const accountId = parsed?.accountId;
  if (!Number.isSafeInteger(accountId) || accountId <= 0) {
    return c.json({error: 'invalid_account_id'}, ${HTTP_STATUS_BAD_REQUEST});
  }
  if (c.env.principal === '${PRINCIPAL_BOB}' && accountId === ${ACCOUNT_101}) {
    return c.json({error: 'forbidden_account'}, ${HTTP_STATUS_FORBIDDEN});
  }
  try {
    const categorySummary = await c.env.lagrange.call(summarizeByCategory, {accountId});
    const highValue = await c.env.lagrange.call(highValueFlags, {
      accountId,
      minAmountCents: ${MIN_HIGH_VALUE_CENTS},
    });
    return c.json({
      accountId,
      categorySummary,
      highValue,
      rawBodyLength: rawBody.length,
      version: '${versionTag}',
    });
  } catch (err) {
    return c.json({caughtInGuest: String(err?.message || err), code: err?.code}, 500);
  }
});

app.post('/api/accounts/concurrent-violation', async (c) => {
  try {
    await Promise.all([
      c.env.lagrange.call(summarizeByCategory, {accountId: ${ACCOUNT_101}}),
      c.env.lagrange.call(highValueFlags, {
        accountId: ${ACCOUNT_101},
        minAmountCents: ${MIN_HIGH_VALUE_CENTS},
      }),
    ]);
    return c.json({unexpected: true});
  } catch (err) {
    return c.json(
      {code: err.code, message: err.message, retryable: err.retryable},
      ${HTTP_STATUS_CONFLICT},
    );
  }
});

app.post('/api/accounts/forbidden-target', async (c) => {
  try {
    await c.env.lagrange.call('${MULTI_OP_SERVICE_NAME}--call--undeclared', {
      accountId: ${ACCOUNT_101},
    });
    return c.json({unexpected: true});
  } catch (err) {
    return c.json(
      {code: err.code || 'TARGET_NOT_ALLOWED', message: err.message},
      ${HTTP_STATUS_FORBIDDEN},
    );
  }
});

export const operations = {summarizeByCategory, highValueFlags};

export default defineService({
  name: '${MULTI_OP_SERVICE_NAME}',
  version: '${versionTag}',
  mount: '${API_MOUNT_PREFIX}',
  operations,
  fetch: (request, env) => app.fetch(request, env),
});
`;
}

function seedMultiShardDataset() {
  const shards = Array.from({length: SHARD_COUNT}, () => []);
  for (let i = 1; i <= TOTAL_SEEDED_ROWS; i += 1) {
    const accountId = i % 2 === 1 ? ACCOUNT_101 : ACCOUNT_202;
    const category = CATEGORIES[i % CATEGORIES.length];
    const amountCents = (i % 10) * 100 + 50;
    shards[i % SHARD_COUNT].push(
      Object.freeze({
        account_id: accountId,
        amount_cents: amountCents,
        category,
        id: i,
      }),
    );
  }
  return shards;
}

function computeIndependentOracle(shards, accountId, minAmountCents) {
  const allRows = shards.flat();
  const totals = {compute: 0, network: 0, storage: 0};
  let partialCount = 0;
  for (const shardRows of shards) {
    const shardSums = {compute: 0, network: 0, storage: 0};
    for (const row of shardRows) {
      if (row.account_id === accountId) {
        shardSums[row.category] += row.amount_cents;
      }
    }
    for (const [cat, sum] of Object.entries(shardSums)) {
      if (sum > 0) {
        totals[cat] += sum;
        partialCount += 1;
      }
    }
  }
  let flaggedCount = 0;
  let maxCents = 0;
  for (const row of allRows) {
    if (row.account_id === accountId && row.amount_cents >= minAmountCents) {
      flaggedCount += 1;
      if (row.amount_cents > maxCents) maxCents = row.amount_cents;
    }
  }
  return {
    categorySummary: {accountId, partialCount, totals},
    highValue: {accountId, flaggedCount, maxCents},
  };
}

const SUMMARIZE_PARAM_SCHEMA = normalizeCallSelectorParameterSchema([
  {name: 'accountId', nullable: false, type: 'integer'},
]);
const HIGH_VALUE_PARAM_SCHEMA = normalizeCallSelectorParameterSchema([
  {name: 'accountId', nullable: false, type: 'integer'},
  {name: 'minAmountCents', nullable: false, type: 'integer'},
]);
const SUMMARIZE_PARTIAL_SCHEMA = Object.freeze({
  fields: {
    amountCents: {type: 'integer'},
    category: {type: 'string'},
    count: {type: 'integer'},
  },
  type: 'record',
});
const HIGH_VALUE_PARTIAL_SCHEMA = Object.freeze({
  fields: {
    flaggedCount: {type: 'integer'},
    maxCents: {type: 'integer'},
  },
  type: 'record',
});
const SUMMARIZE_STATE_SCHEMA = Object.freeze({
  fields: {
    computeCents: {type: 'integer'},
    networkCents: {type: 'integer'},
    pagesProcessed: {type: 'integer'},
    rowCount: {type: 'integer'},
    storageCents: {type: 'integer'},
  },
  type: 'record',
});

async function executeCompiledCallOperation({
  argumentsJson,
  callRuntime,
  callServiceId,
  operationId,
  shards,
  shardDbs,
}) {
  const rawArgs = JSON.parse(argumentsJson);
  const isSummarize = operationId === 'summarizeByCategory';
  const paramSchema = isSummarize ?
    SUMMARIZE_PARAM_SCHEMA :
    HIGH_VALUE_PARAM_SCHEMA;
  const partialSchema = isSummarize ?
    SUMMARIZE_PARTIAL_SCHEMA :
    HIGH_VALUE_PARTIAL_SCHEMA;
  const normalizedParams = normalizeCallSelectorInvocationParameters({
    argumentsJson,
    parameterSchema: paramSchema,
  });
  const boundParams = normalizedParams.boundParameters;
  const callContextBag = {
    emitBudget: 64,
    nestedCallBudget: 0,
    onCallBounded: false,
  };

  const collectedPartials = [];
  if (isSummarize) {
    const progressTracker = createPagedShardProgressTracker({
      coordinationTable: 'h5_paged_progress',
      executeInternal: async () => ({changes: 1, rows: [], success: true}),
    });
    const selectorSql =
      'SELECT id, account_id, category, amount_cents FROM account_ledger WHERE account_id = ? ORDER BY id ASC';
    for (let s = 0; s < shards.length; s += 1) {
      const db = shardDbs[s];
      const readViewManager = createShardReadViewManager();
      const invocationId = `inv-h5-${Date.now()}-${s}`;
      await executePagedShardSlot({
        dispatchPage: async (pageReq) => {
          const readViewId = pageReq.readViewId ||
            (await readViewManager.acquireReadView({
              attemptId: pageReq.attemptId,
              boundParameters: boundParams,
              deadlineMs: Date.now() + 30_000,
              invocationId,
              keyColumns: ['id'],
              partitionId: `p-${s}`,
              partitionService: {dbPath: db.name, supportsRetainedReadView: true},
              partitionVersion: 1,
              statement: selectorSql,
            })).readViewId;
          const pageRead = readViewManager.readPage({
            boundParameters: boundParams,
            deadlineMs: Date.now() + 30_000,
            keyColumns: ['id'],
            pageByteBound: PAGE_BYTE_BOUND,
            pageCursor: pageReq.pageCursor,
            pageIndex: pageReq.pageIndex,
            pageRowBound: PAGE_ROW_BOUND,
            partitionVersion: 1,
            readViewId,
            statement: selectorSql,
          });
          if (!pageRead.pageMeta.hasMore) {
            readViewManager.releaseReadView(readViewId);
          }
          const pagedArgsJson = JSON.stringify({
            __lagrangePagedStep: {
              isFinalPage: !pageRead.pageMeta.hasMore,
              pageIndex: pageReq.pageIndex,
              requireAccumulator: true,
              stateJson: pageReq.stateJson,
            },
            arguments: rawArgs,
          });
          const runOut = await callRuntime.invoke(
            callServiceId,
            [operationId, pageRead.batch, pagedArgsJson],
            () => [],
            () => {},
            () => {},
            {callContext: callContextBag, exportName: RUN_EXPORT},
          );
          for (const [k, pJson] of runOut.partials || []) {
            const decodedPartial = decodeCanonicalPartialValue(pJson, {
              schema: partialSchema,
            });
            validateValueAgainstSchema(decodedPartial, partialSchema);
            collectedPartials.push([k, pJson]);
          }
          return {
            componentResult: runOut.value,
            pageMeta: pageRead.pageMeta,
            partials: (runOut.partials || []).map(([key, partial]) => ({
              key: `${CALL_CELL_PARTIAL_KEY_PREFIX}${key}`,
              partial,
            })),
            replicaId: `rep-${s}`,
          };
        },
        limits: {
          pageByteBound: PAGE_BYTE_BOUND,
          pageRowBound: PAGE_ROW_BOUND,
        },
        progressTracker,
        request: {
          argumentsJson,
          attemptId: 'attempt-1',
          invocationId,
          name: operationId,
          parametersDigest: normalizedParams.parametersDigest,
          resolution: {
            bindingVersionId: `bv-${operationId}`,
            handlerId: operationId,
            replicaId: `rep-${s}`,
            stateSchema: SUMMARIZE_STATE_SCHEMA,
          },
          shard: {partitionId: `p-${s}`},
          slotId: s,
        },
      });
    }
  } else {
    for (let s = 0; s < shards.length; s += 1) {
      const matchingRows = shards[s].filter(
        (r) => r.account_id === boundParams[0] && r.amount_cents >= boundParams[1],
      );
      const witBatch = toCellBatch(matchingRows, PAGE_ROW_BOUND);
      const runOut = await callRuntime.invoke(
        callServiceId,
        [operationId, witBatch, argumentsJson],
        () => [],
        () => {},
        () => {},
        {callContext: callContextBag, exportName: RUN_EXPORT},
      );
      for (const [k, pJson] of runOut.partials || []) {
        const decodedPartial = decodeCanonicalPartialValue(pJson, {
          schema: partialSchema,
        });
        validateValueAgainstSchema(decodedPartial, partialSchema);
        collectedPartials.push([k, pJson]);
      }
    }
  }

  const reduceOut = await callRuntime.invoke(
    callServiceId,
    [operationId, collectedPartials, argumentsJson],
    () => [],
    () => {},
    () => {},
    {callContext: callContextBag, exportName: REDUCE_EXPORT},
  );
  const reducedValue = typeof reduceOut === 'object' && reduceOut !== null && 'value' in reduceOut ?
    reduceOut.value :
    reduceOut;
  return typeof reducedValue === 'string' ? reducedValue : JSON.stringify(reducedValue);
}

test(`${QUEST_ID}: Hono scaffold, zero-operation service, clean-client receipt deploy, and ArtifactPayloadStore second-node activation on compiled WASM`, {timeout: TOOLCHAIN_TIMEOUT_MS}, async (t) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), TEMP_PREFIX));
  t.teardown(async () => {
    await fs.rm(rootDir, {force: true, recursive: true});
  });
  await fs.symlink(
    REPO_NODE_MODULES_PATH,
    path.join(rootDir, 'node_modules'),
    'dir',
  );

  const {store: artifactStore} = createInMemoryArtifactStore();

  // 1. Scaffold Hono service via createHonoServiceProject and verify typings determinism
  const scaffoldDir = path.join(rootDir, SCAFFOLD_SERVICE_NAME);
  createHonoServiceProject(scaffoldDir);
  const initialDts = await fs.readFile(
    path.join(scaffoldDir, 'runtime-types.d.ts'),
    UTF8_ENCODING,
  );
  assert.match(initialDts, /export interface LagrangeRequestClient/u);
  assert.match(initialDts, /export interface LagrangeEnv/u);

  await runGenerate({projectDirectory: scaffoldDir});
  const generatedDts = await fs.readFile(
    path.join(scaffoldDir, 'runtime-types.d.ts'),
    UTF8_ENCODING,
  );
  assert.equal(
    generatedDts,
    initialDts,
    'runGenerate reproduces createHonoServiceProject runtime-types.d.ts byte-identically',
  );

  const sqlClient = createSqlClientForStore(artifactStore);

  // Build and publish from Client 1, then delete Client 1 directory completely (Item 9 / J2)
  await runBuild({
    createLocalOciLayoutBuilder: createFakeOciBuilder(scaffoldDir),
    projectDirectory: scaffoldDir,
  });
  const publishReceipt = await runPublish({
    createSqlClient: sqlClient,
    projectDirectory: scaffoldDir,
  });
  const cleanClient2Dir = path.join(rootDir, 'clean-client-2');
  await fs.mkdir(path.join(cleanClient2Dir, '.lagrange'), {recursive: true});
  await fs.copyFile(
    path.join(scaffoldDir, '.lagrange', 'publish-receipt.json'),
    path.join(cleanClient2Dir, '.lagrange', 'publish-receipt.json'),
  );
  await fs.rm(scaffoldDir, {force: true, recursive: true});

  // Client 2 on clean directory (zero .wasm files) deploys from registration receipt only
  const deployed = await runDeploy({
    createSqlClient: sqlClient,
    idempotencyKey: 'idem-h5-scaffold-1',
    projectDirectory: cleanClient2Dir,
    requireSuccessorArtifact: true,
  });
  assert.ok(deployed.packageId);

  // Load sealed WASM bytes on Node 2 exclusively via loadComponentPayloadThroughStore
  const node2Payload = await loadComponentPayloadThroughStore(
    {artifactPayloadStore: artifactStore},
    {artifactDigest: publishReceipt.artifactDigest},
  );
  assert.ok(node2Payload.bytes.byteLength > 0);

  const scaffoldRuntime = new WasiComponentCellRuntime();
  const scaffoldServiceId = 'svc-scaffold-node2';
  await scaffoldRuntime.start({
    budgets: RUNTIME_BUDGETS,
    bytes: node2Payload.bytes,
    capabilities: [],
    exportName: HANDLE_REQUEST_EXPORT,
    serviceId: scaffoldServiceId,
    world: 'request-cell',
  });
  t.teardown(async () => {
    await scaffoldRuntime.stop(scaffoldServiceId);
  });

  const decodeRuntimeJsonBody = (rawOut) => {
    const parsed = typeof rawOut === 'string' ? JSON.parse(rawOut) : rawOut;
    const bodyText = parsed.bodyBase64 ?
      Buffer.from(parsed.bodyBase64, 'base64').toString(UTF8_ENCODING) :
      parsed.body;
    return {body: JSON.parse(bodyText), status: parsed.status};
  };

  const healthOut = await scaffoldRuntime.invoke(
    scaffoldServiceId,
    [
      'fetch',
      JSON.stringify({bodyBase64: null, headers: [], method: 'GET', path: '/health', query: {}}),
    ],
    async () => [],
    async () => {},
    () => {},
  );
  const healthRes = decodeRuntimeJsonBody(healthOut);
  assert.equal(healthRes.status, HTTP_STATUS_OK);
  assert.deepEqual(healthRes.body, {ok: true, service: SCAFFOLD_SERVICE_NAME});

  // 2. Deploy HTTP-only zero-operation service (Item 1)
  const zeroOpDir = path.join(rootDir, ZERO_OP_SERVICE_NAME);
  await fs.mkdir(zeroOpDir, {recursive: true});
  await fs.writeFile(
    path.join(zeroOpDir, 'lagrange.service.js'),
    zeroOpHonoSource(),
    UTF8_ENCODING,
  );
  await runGenerate({projectDirectory: zeroOpDir});
  await runBuild({
    createLocalOciLayoutBuilder: createFakeOciBuilder(zeroOpDir),
    projectDirectory: zeroOpDir,
  });
  const zeroOpReceipt = await runPublish({
    createSqlClient: sqlClient,
    projectDirectory: zeroOpDir,
  });
  assert.equal(zeroOpReceipt.bindings.length, 1);

  const zeroOpLoaded = await loadComponentPayloadThroughStore(
    {artifactPayloadStore: artifactStore},
    {artifactDigest: zeroOpReceipt.artifactDigest},
  );
  const zeroOpRuntime = new WasiComponentCellRuntime();
  const zeroOpServiceId = 'svc-zero-op';
  await zeroOpRuntime.start({
    budgets: RUNTIME_BUDGETS,
    bytes: zeroOpLoaded.bytes,
    capabilities: [],
    exportName: HANDLE_REQUEST_EXPORT,
    serviceId: zeroOpServiceId,
    world: 'request-cell',
  });
  t.teardown(async () => {
    await zeroOpRuntime.stop(zeroOpServiceId);
  });

  const zeroHealthOut = await zeroOpRuntime.invoke(
    zeroOpServiceId,
    [
      'fetch',
      JSON.stringify({bodyBase64: null, headers: [], method: 'GET', path: '/health', query: {}}),
    ],
    async () => [],
    async () => {},
    () => {},
  );
  const zeroHealth = decodeRuntimeJsonBody(zeroHealthOut);
  assert.equal(zeroHealth.status, HTTP_STATUS_OK);
  assert.deepEqual(zeroHealth.body, {
    ok: true,
    service: ZERO_OP_SERVICE_NAME,
    zeroOps: true,
  });
});

test(`${QUEST_ID}: multi-operation Hono service on compiled WASM consumes Q2-Q5 and H3-H4 through RequestCellHttpAdapter, WasiComponentCellRuntime, executePagedShardSlot, and MemoryInvocationJournal`, {timeout: TOOLCHAIN_TIMEOUT_MS}, async (t) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), TEMP_PREFIX));
  t.teardown(async () => {
    await fs.rm(rootDir, {force: true, recursive: true});
  });
  await fs.symlink(REPO_NODE_MODULES_PATH, path.join(rootDir, 'node_modules'), 'dir');

  const shards = seedMultiShardDataset();
  const shardDbs = [];
  for (let s = 0; s < shards.length; s += 1) {
    const db = new Database(path.join(rootDir, `shard-${s}.sqlite`));
    db.pragma('journal_mode = WAL');
    db.exec(
      'CREATE TABLE account_ledger (id INTEGER PRIMARY KEY, account_id INTEGER, category TEXT, amount_cents INTEGER);',
    );
    const ins = db.prepare(
      'INSERT INTO account_ledger (id, account_id, category, amount_cents) VALUES (?, ?, ?, ?)',
    );
    db.transaction((rows) => {
      for (const r of rows) ins.run(r.id, r.account_id, r.category, r.amount_cents);
    })(shards[s]);
    shardDbs.push(db);
  }
  t.teardown(() => {
    for (const db of shardDbs) db.close();
  });

  const {store: artifactStore} = createInMemoryArtifactStore();
  const sqlClient = createSqlClientForStore(artifactStore);

  const buildAndLoadVersion = async (suffix, versionTag) => {
    const dir = path.join(rootDir, `${MULTI_OP_SERVICE_NAME}-${suffix}`);
    await fs.mkdir(dir, {recursive: true});
    await fs.writeFile(
      path.join(dir, 'lagrange.service.js'),
      multiOpHonoSource(versionTag),
      UTF8_ENCODING,
    );
    await runGenerate({projectDirectory: dir});
    await runBuild({
      createLocalOciLayoutBuilder: createFakeOciBuilder(dir),
      projectDirectory: dir,
    });
    const receipt = await runPublish({createSqlClient: sqlClient, projectDirectory: dir});
    const loaded = await loadComponentPayloadThroughStore(
      {artifactPayloadStore: artifactStore},
      {artifactDigest: receipt.artifactDigest},
    );
    return {loaded, receipt};
  };

  const {loaded: loadedV1, receipt: receiptV1} = await buildAndLoadVersion('v1', SERVICE_VERSION_V1);
  const {loaded: loadedV2, receipt: receiptV2} = await buildAndLoadVersion('v2', SERVICE_VERSION_V2);

  const callRuntime = new WasiComponentCellRuntime();
  const callServiceId = 'svc-multi-call-cell';
  await callRuntime.start({
    budgets: RUNTIME_BUDGETS,
    bytes: loadedV1.bytes,
    capabilities: [],
    exportName: RUN_EXPORT,
    serviceId: callServiceId,
    world: 'call-cell',
  });
  t.teardown(async () => {
    await callRuntime.stop(callServiceId);
  });

  const bindingToOpId = new Map([
    [`${MULTI_OP_SERVICE_NAME}--call--summarize-by-category`, 'summarizeByCategory'],
    [`${MULTI_OP_SERVICE_NAME}--call--high-value-flags`, 'highValueFlags'],
  ]);

  let lastCallError = null;
  const callBridge = createRequestCellCallBridge({
    callCellInvoker: {
      async invoke(callRequest) {
        try {
          const operationId = bindingToOpId.get(callRequest.name);
          return await executeCompiledCallOperation({
            argumentsJson: callRequest.argumentsJson,
            callRuntime,
            callServiceId,
            operationId,
            shardDbs,
            shards,
          });
        } catch (err) {
          lastCallError = `${err?.code || ''}: ${err?.message || err} | ${err?.stack || ''}`;
          throw err;
        }
      },
    },
    runtimeAccessPolicyOwner: {
      async getOutboundCallPolicy() {
        return Object.freeze({
          calls: Object.freeze([...bindingToOpId.keys()]),
          status: 'resolved',
        });
      },
    },
  });

  const bindingName = `${MULTI_OP_SERVICE_NAME}--request--fetch`;
  const rowsV1 = buildFetchDeploymentRows({
    artifactRef: receiptV1.manifest.artifact.ref,
    bindingName,
    componentBytes: loadedV1.bytes,
    createdAt: 1_000,
    generation: 1,
    mountPrefix: API_MOUNT_PREFIX,
    packageId: `service-package-${'1'.repeat(64)}`,
    serviceName: MULTI_OP_SERVICE_NAME,
    serviceVersion: SERVICE_VERSION_V1,
  });
  const rowsV2 = buildFetchDeploymentRows({
    artifactRef: receiptV2.manifest.artifact.ref,
    bindingName,
    componentBytes: loadedV2.bytes,
    createdAt: 2_000,
    generation: 2,
    mountPrefix: API_MOUNT_PREFIX,
    packageId: `service-package-${'2'.repeat(64)}`,
    serviceName: MULTI_OP_SERVICE_NAME,
    serviceVersion: SERVICE_VERSION_V2,
  });

  const journal = new MemoryInvocationJournal();
  const cache = createInMemoryTableCache();
  registerRowsInCache(cache, rowsV1);
  const routeResolver = new RequestBindingRouteResolver({systemTableCache: cache});

  let v1GuestInvocations = 0;
  let gateHook = null;

  const startRealRequestLifecycle = async (rows, isV1) => {
    const cellRuntime = new WasiComponentCellRuntime();
    const driver = new WasmComponentDriver({
      artifactLoader: async () => rows.artifact,
      componentRuntime: cellRuntime,
    });
    driver.setRequestCallBridge(callBridge.invoke);
    const origInvoke = driver.invoke.bind(driver);
    driver.invoke = async (...args) => {
      if (isV1) v1GuestInvocations += 1;
      if (typeof gateHook === 'function') await gateHook();
      try {
        return await origInvoke(...args);
      } finally {
        callBridge.completeInvocation(args[1]?.invocationId);
      }
    };
    const registry = new RuntimeDriverRegistry();
    registry.register(driver);
    registry.freeze();
    const lifecycle = new ServiceRuntimeLifecycle(registry);
    lifecycle.setQueryExecutorFactory(() => journal.createExecutor());
    lifecycle.setStateProjectionWriter(async () => {});
    const replicaHandle = {
      ...rows.definition,
      entityId: rows.definition.service_id,
      nodeId: NODE_ID,
      replicaId: rows.replicaId,
      serviceId: rows.replicaId,
      serviceType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
    };
    await lifecycle.prepare(replicaHandle, {});
    await lifecycle.start(replicaHandle);
    return {cellRuntime, lifecycle, replicaHandle};
  };

  const rtV1 = await startRealRequestLifecycle(rowsV1, true);
  const rtV2 = await startRealRequestLifecycle(rowsV2, false);
  t.teardown(async () => {
    await rtV1.lifecycle.stop(rtV1.replicaHandle);
    await rtV2.lifecycle.stop(rtV2.replicaHandle);
    await rtV1.cellRuntime.shutdown();
    await rtV2.cellRuntime.shutdown();
  });

  const localReplicas = new Map([
    [
      rowsV1.replicaId,
      {
        entityId: rowsV1.definition.service_id,
        replicaHandle: rtV1.replicaHandle,
        replicaId: rowsV1.replicaId,
        status: ReplicaStatus.ACTIVE,
      },
    ],
  ]);

  const lifecycles = new Map([
    [rowsV1.definition.service_id, rtV1.lifecycle],
    [rowsV2.definition.service_id, rtV2.lifecycle],
  ]);

  const adapter = new RequestCellHttpAdapter({
    authenticateRequest: async (req) => {
      const auth = req.headers?.authorization;
      if (auth === REVOKED_TOKEN) {
        throw new RequestCellRoutingError(
          REQUEST_CELL_ROUTE_ERROR_CODE.UNAUTHENTICATED,
          'Credentials have been revoked',
          {
            classification: REQUEST_CELL_ROUTE_CLASSIFICATION.TERMINAL,
            httpStatus: HTTP_STATUS_UNAUTHORIZED,
          },
        );
      }
      return {
        principal: auth === BOB_TOKEN ? PRINCIPAL_BOB : PRINCIPAL_ALICE,
        roles: ROLES_APPLICATION,
        tenantId: TENANT_ALPHA,
      };
    },
    invocationJournal: journal,
    maxInputBytes: 4_096,
    now: () => Date.now(),
    retentionWindowMs: 60_000,
    routeResolver,
    serviceDispatcher: {
      async dispatch(envelope) {
        const handler = {
          localReplicas,
          nodeId: NODE_ID,
          requestBindingRouteResolver: routeResolver,
          serviceRuntimeLifecycle: lifecycles.get(envelope.serviceId),
        };
        return {answer: await handleRequestCellInvocation(handler, envelope)};
      },
    },
  });

  const sendReq = async (method, url, body = null, extraHeaders = {}) => {
    const reply = createMockReply();
    const out = await adapter.handle(
      {body, headers: {host: 'api.example.test', ...extraHeaders}, method, url},
      reply,
    );
    return {out, reply, status: reply.getStatusCode()};
  };

  // Items 2, 3, 4: Sequential operations with Q2 selector narrowing, Q3 paged >1,000 rows, Q4 structured partials
  for (const accountId of [ACCOUNT_101, ACCOUNT_202, ACCOUNT_999]) {
    const expectedOracle = computeIndependentOracle(shards, accountId, MIN_HIGH_VALUE_CENTS);
    const {out, status} = await sendReq(
      'POST',
      '/api/accounts/report',
      JSON.stringify({accountId}),
      {'content-type': 'application/json'},
    );
    assert.equal(status, HTTP_STATUS_OK, `${JSON.stringify(out)} || ${lastCallError}`);
    const payload = typeof out === 'string' ? JSON.parse(out) : out;
    assert.deepEqual(payload.categorySummary, expectedOracle.categorySummary);
    assert.deepEqual(payload.highValue, expectedOracle.highValue);
  }

  // Item 6: Binary body, text body, repeated query values, Set-Cookie multiplicity, HEAD, 204
  const binRes = await sendReq(
    'POST',
    '/api/echo-binary',
    new Uint8Array([1, 2, 3, 250]),
    {'content-type': 'application/octet-stream'},
  );
  assert.equal(binRes.status, HTTP_STATUS_OK);
  assert.deepEqual(Array.from(new Uint8Array(binRes.out)), [250, 3, 2, 1]);

  const queryRes = await sendReq('GET', '/api/inspect?tag=alpha&tag=beta');
  const queryJson = typeof queryRes.out === 'string' ? JSON.parse(queryRes.out) : queryRes.out;
  assert.deepEqual(queryJson.tags, ['alpha', 'beta']);
  assert.equal(queryJson.principal, PRINCIPAL_ALICE);

  const queryBob = await sendReq('GET', '/api/inspect?tag=gamma', null, {authorization: BOB_TOKEN});
  const queryJsonBob = typeof queryBob.out === 'string' ? JSON.parse(queryBob.out) : queryBob.out;
  assert.deepEqual(queryJsonBob.tags, ['gamma']);
  assert.equal(queryJsonBob.principal, PRINCIPAL_BOB);

  const headRes = await sendReq('HEAD', '/api/health');
  assert.equal(headRes.status, HTTP_STATUS_OK);
  assert.equal(headRes.out === '' || headRes.out === null || headRes.out?.byteLength === 0, true);
  assert.equal(Array.isArray(headRes.reply.getHeaders()['set-cookie']), true);

  const delRes = await sendReq('DELETE', '/api/session');
  assert.equal(delRes.status, HTTP_STATUS_NO_CONTENT);

  // Item 5: Application auth refusal, forbidden target, Promise.all concurrency refusal, and byte budget
  const forbiddenAcct = await sendReq(
    'POST',
    '/api/accounts/report',
    JSON.stringify({accountId: ACCOUNT_101}),
    {'authorization': BOB_TOKEN, 'content-type': 'application/json'},
  );
  assert.equal(forbiddenAcct.status, HTTP_STATUS_FORBIDDEN);

  const forbiddenTarget = await sendReq('POST', '/api/accounts/forbidden-target');
  assert.equal(forbiddenTarget.status, HTTP_STATUS_FORBIDDEN);

  const concurrentRes = await sendReq('POST', '/api/accounts/concurrent-violation');
  assert.equal(concurrentRes.status, HTTP_STATUS_CONFLICT);
  const concurrentJson = typeof concurrentRes.out === 'string' ?
    JSON.parse(concurrentRes.out) :
    concurrentRes.out;
  assert.equal(concurrentJson.code, HOST_CALL_ERROR_CODE.UNSUPPORTED_CONCURRENCY);

  const tooLarge = await sendReq(
    'POST',
    '/api/echo-binary',
    new Uint8Array(8_192),
    {'content-type': 'application/octet-stream'},
  );
  assert.equal(tooLarge.status, HTTP_STATUS_PAYLOAD_TOO_LARGE);

  // Items 6, 7, 8: Keyed replay, byte-distinct JSON conflict, and live V1 -> V2 update
  const invBeforeKeyed = v1GuestInvocations;
  const keyed1 = await sendReq(
    'POST',
    '/api/accounts/report',
    '{"accountId":101}',
    {'content-type': 'application/json', 'idempotency-key': 'idem-h5-report-1'},
  );
  assert.equal(keyed1.status, HTTP_STATUS_OK);
  assert.equal(v1GuestInvocations, invBeforeKeyed + 1);

  const keyed2 = await sendReq(
    'POST',
    '/api/accounts/report',
    '{"accountId":101}',
    {'content-type': 'application/json', 'idempotency-key': 'idem-h5-report-1'},
  );
  assert.equal(keyed2.status, HTTP_STATUS_OK);
  assert.equal(v1GuestInvocations, invBeforeKeyed + 1, 'replay does not re-invoke WASM guest');
  assert.deepEqual(keyed2.out, keyed1.out);

  const conflictRes = await sendReq(
    'POST',
    '/api/accounts/report',
    '{ "accountId" : 101 }',
    {'content-type': 'application/json', 'idempotency-key': 'idem-h5-report-1'},
  );
  assert.equal(conflictRes.status, HTTP_STATUS_CONFLICT);

  // Item 8: Live endpoint update to Generation 2 while Generation 1 request is in flight
  let releaseInFlight;
  const inFlightGate = new Promise((resolve) => {
    releaseInFlight = resolve;
  });
  let notifyEntered;
  const enteredGate = new Promise((resolve) => {
    notifyEntered = resolve;
  });
  gateHook = async () => {
    notifyEntered();
    await inFlightGate;
  };

  const inFlightPromise = sendReq(
    'POST',
    '/api/echo-text',
    'in-flight-payload',
    {'content-type': 'text/plain', 'idempotency-key': 'idem-h5-inflight-v1'},
  );
  await enteredGate;
  gateHook = null;

  registerRowsInCache(cache, rowsV2);
  localReplicas.set(rowsV2.replicaId, {
    entityId: rowsV2.definition.service_id,
    replicaHandle: rtV2.replicaHandle,
    replicaId: rowsV2.replicaId,
    status: ReplicaStatus.ACTIVE,
  });

  releaseInFlight();
  const inFlightRes = await inFlightPromise;
  assert.equal(inFlightRes.status, HTTP_STATUS_OK);
  assert.equal(inFlightRes.out, `[${SERVICE_VERSION_V1}:17:in-flight-payload]`);

  const retryV1Res = await sendReq(
    'POST',
    '/api/echo-text',
    'in-flight-payload',
    {'content-type': 'text/plain', 'idempotency-key': 'idem-h5-inflight-v1'},
  );
  assert.equal(retryV1Res.out, `[${SERVICE_VERSION_V1}:17:in-flight-payload]`);

  const v2Res = await sendReq(
    'POST',
    '/api/echo-text',
    'fresh-v2-payload',
    {'content-type': 'text/plain', 'idempotency-key': 'idem-h5-fresh-v2'},
  );
  assert.equal(v2Res.status, HTTP_STATUS_OK);
  assert.equal(v2Res.out, `[${SERVICE_VERSION_V2}:16:fresh-v2-payload]`);
});
