import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';

import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {UNIFIED_SERVICE_TYPE} from '../../src/constants/unified-service-lifecycle.js';
import {
  DEPLOYMENT_BINDING_ERROR_CODE,
  DEPLOYMENT_BINDING_SCHEMA_VERSION_V3,
  bindDeploymentArtifact,
  buildBindingRow,
  canonicalizeAdmittedRequestUrl,
  matchesMountPathPrefix,
  mountsOverlap,
  normalizeDeploymentBinding,
  projectBinding,
} from '../../src/control-plane/owners/deployment-binding-contract.js';
import {
  DeploymentBindingOwner,
} from '../../src/control-plane/owners/deployment-binding-owner.js';
import {
  buildActivatedRequestBindingServiceDefinition,
  buildRequestBindingServiceDefinition,
} from '../../src/control-plane/owners/request-binding-service-definition-contract.js';
import {
  defineService,
  distributed,
  sql,
} from '../../src/authoring/index.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {WasiComponentCellRuntime} from '../../src/runtime/wasi-component-cell-runtime.js';
import {
  RequestBindingRouteResolver,
} from '../../src/service/request-binding-route-resolver.js';
import {
  REQUEST_CELL_ROUTE_ERROR_CODE,
} from '../../src/service/request-cell-routing-contract.js';
import {
  buildServiceComponent,
} from '../../src/service/service-component-build.js';
import {
  DEPLOYMENT_RECORD_ERROR_CODE,
  DEPLOYMENT_RECORD_STATUS,
  assertSuccessorServiceArtifact,
  buildDeploymentRecords,
} from '../../src/service/service-deployment-record-generator.js';
import {
  emitServiceEntry,
} from '../../src/service/service-entry-generator.js';
import {
  IR_ENTRY_KIND,
  IR_TARGET,
  SERVICE_SOURCE_ERROR_CODE,
  SERVICE_SOURCE_STATUS,
  normalizeServiceDefinition,
} from '../../src/service/service-source-contract.js';

const CAPABILITY_BOUNDARY_PROOF_ID = 'service-capability-boundary';
const TEST_TEMP_PREFIX = 'lagrange-h2-cutover-';
const UTF8_ENCODING = 'utf8';
const SERVICE_WORLD_V2 = 'service-cell-v2';
const SERVICE_MODULE_FILENAME = 'lagrange.service.js';
const GENERATED_ENTRY_FILENAME = 'generated-entry.js';
const COMPONENT_FILENAME = 'service.component.wasm';
const TENANT_ID = 'tenant-h2';
const PRINCIPAL = 'user:alice';
const ROLES = Object.freeze(['admin']);
const SECURITY_CONTEXT = Object.freeze({
  principal: PRINCIPAL,
  roles: ROLES,
  tenantId: TENANT_ID,
});
const ARTIFACT_DIGEST = `sha256:${'b'.repeat(64)}`;
const PLACEHOLDER_PACKAGE_ID = `service-package-${'0'.repeat(64)}`;
const ARTIFACT_DESCRIPTOR = Object.freeze({
  digest: ARTIFACT_DIGEST,
  ref: 'registry.example.test/acme/ledger:1.0.0',
  sizeBytes: 4096,
});

const HONO_LEDGER_SERVICE_SOURCE = `import { Hono } from 'hono';
import { defineService, distributed, sql } from 'lagrange-server/authoring';

const summarizeActivity = distributed({
  statement: sql\`SELECT amount_cents FROM account_activity\`,
  run(rows, _args, { emit }) {
    let sum = 0;
    for (const row of rows) {
      sum += Number(row.amount_cents ?? 0);
    }
    emit('total', sum);
    return { scanned: rows.length };
  },
  reduce(partials) {
    let total = 0;
    for (const [, value] of partials) {
      total += Number(value);
    }
    return { totalCents: total };
  },
});

const app = new Hono();
app.onError((err, c) => c.json({
  errMessage: String(err?.message ?? err),
  errStack: String(err?.stack ?? ''),
}, 500));

app.post('/api/summary/:accountId', async (c) => {
  const accountId = Number(c.req.param('accountId'));
  const body = await c.req.json();
  const summary = await c.env.lagrange.call(summarizeActivity, {
    accountId,
    windowDays: body.windowDays ?? 30,
  });
  return c.json({
    proof: '${CAPABILITY_BOUNDARY_PROOF_ID}',
    accountId,
    summary,
    url: c.req.url,
  });
});

app.post('/api/fx', async (c) => {
  const body = await c.req.json();
  const fx = await c.env.lagrange.call('fx-rates--call--convert', {
    currency: body.currency ?? 'USD',
  });
  return c.json({
    proof: '${CAPABILITY_BOUNDARY_PROOF_ID}',
    fx,
  });
});

app.post('/api/forbidden', async (c) => {
  try {
    await c.env.lagrange.call('vault--call--read-secret', { key: 'root' });
    return c.json({ unexpected: true }, 200);
  } catch (err) {
    return c.json({
      refusedCode: err?.payload?.code ?? null,
      refusedMessage: err?.payload?.message ?? String(err?.message ?? err),
    }, 403);
  }
});

export default defineService({
  name: 'ledger',
  version: '1.0.0',
  mount: { host: '*', pathPrefix: '/api' },
  dependencies: ['fx-rates--call--convert'],
  operations: { summarizeActivity },
  fetch: (request, env) => app.fetch(request, env),
});
`;

function createSampleOperation(columnName = 'amount_cents') {
  return distributed({
    reduce: (partials) => ({
      total: partials.reduce((acc, [, v]) => acc + Number(v), 0),
    }),
    run: (rows, _args, {emit}) => {
      emit('total', rows.length);
      return {scanned: rows.length};
    },
    statement: sql([`SELECT ${columnName} FROM account_activity`]),
  });
}

function createInMemoryTableCache() {
  const tables = new Map();
  return {
    get(tableName, key) {
      return tables.get(tableName)?.get(key) ?? null;
    },
    getAll(tableName) {
      const table = tables.get(tableName);
      return table ? [...table.values()] : [];
    },
    set(tableName, key, row) {
      if (!tables.has(tableName)) {
        tables.set(tableName, new Map());
      }
      tables.get(tableName).set(key, row);
    },
  };
}

function createOwnerHarness(manifest, manifestDigest) {
  const rowsByVersionId = new Map();
  const artifact = {
    artifactDigest: ARTIFACT_DIGEST,
    manifest,
    manifestDigest,
    packageId: PLACEHOLDER_PACKAGE_ID,
  };
  let currentTime = 1_700_000_000_000;
  const controlPlaneSystemTableGateway = {
    async insertSystemTableRow(_tableName, row) {
      rowsByVersionId.set(row.binding_version_id, row);
      return {affectedRows: 1, success: true};
    },
    async readAuthoritativeRows(_tableName, sqlText, params) {
      const allRows = [...rowsByVersionId.values()];
      const fieldMatch = / WHERE ([a-z_]+) = \?$/u.exec(sqlText);
      const selected = fieldMatch ?
        allRows.filter((r) => r[fieldMatch[1]] === params[0]) :
        allRows;
      return {rows: selected, success: true};
    },
  };
  const owner = new DeploymentBindingOwner({
    artifactPayloadStore: {
      async findSealedPayloadByArtifactDigest() {
        return {found: true};
      },
    },
    catalogOwner: {
      async getBindableArtifactForTenant(packageId, digest, tenantId) {
        if (
          packageId === PLACEHOLDER_PACKAGE_ID &&
          digest === manifestDigest &&
          tenantId === TENANT_ID
        ) {
          return artifact;
        }
        return null;
      },
    },
    controlPlaneSystemTableGateway,
    now: () => {
      currentTime += 10;
      return currentTime;
    },
  });
  return {artifact, owner, rowsByVersionId};
}

function seedMountRouteInCache(cache, declaration, artifact, index = 1) {
  const normalized = normalizeDeploymentBinding(declaration);
  const bound = bindDeploymentArtifact(normalized, artifact);
  const bindingRow = buildBindingRow(bound, SECURITY_CONTEXT, 1000 + index, 1);
  const binding = projectBinding(bindingRow);
  const definitionRow = buildActivatedRequestBindingServiceDefinition(
    buildRequestBindingServiceDefinition(bindingRow, artifact),
    binding,
  );
  const actualRow = {
    created_at: 1000 + index,
    definition_id: definitionRow.service_id,
    node_id: 'node-a',
    service_id: `${definitionRow.service_id}-r1`,
    service_type: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
    status: ReplicaStatus.ACTIVE,
    updated_at: 1000 + index,
  };
  cache.set(
    SYSTEM_TABLE_NAME.SERVICE_BINDINGS,
    bindingRow.binding_version_id,
    bindingRow,
  );
  cache.set(
    SYSTEM_TABLE_NAME.SERVICE_DEFINITIONS,
    definitionRow.service_id,
    definitionRow,
  );
  cache.set(SYSTEM_TABLE_NAME.SERVICES, actualRow.service_id, actualRow);
  return {actualRow, bindingRow, definitionRow};
}

describe('H2: Hono/Fetch source contract, IR, and deployment cutover', () => {
  it('normalizes Fetch services with 0, 1, and 2 operations and refuses legacy handlers', () => {
    const opA = createSampleOperation('amount_cents');
    const opB = createSampleOperation('id');

    const zeroOp = normalizeServiceDefinition(
      defineService({
        fetch: () => ({status: 200}),
        mount: '/health',
        name: 'edge-gateway',
        operations: {},
        version: '1.0.0',
      }),
    );
    assert.equal(zeroOp.status, SERVICE_SOURCE_STATUS.ACCEPTED);
    assert.equal(zeroOp.ir.entryKind, IR_ENTRY_KIND.FETCH);
    assert.equal(zeroOp.ir.target, IR_TARGET.SERVICE_CELL_V2);
    assert.equal(zeroOp.ir.operations.length, 0);
    assert.deepEqual(zeroOp.ir.mount, {host: '*', pathPrefix: '/health'});

    const multiOp = normalizeServiceDefinition(
      defineService({
        dependencies: ['fx-rates--call--convert', 'audit--call--record'],
        fetch: () => ({status: 200}),
        mount: {host: 'api.example.com', pathPrefix: '/v1/ledger'},
        name: 'ledger',
        operations: {countRows: opB, summarizeActivity: opA},
        version: '2.0.0',
      }),
    );
    assert.equal(multiOp.status, SERVICE_SOURCE_STATUS.ACCEPTED);
    assert.equal(multiOp.ir.operations.length, 2);
    assert.deepEqual(multiOp.ir.dependencies, [
      'audit--call--record',
      'fx-rates--call--convert',
    ]);
    assert.deepEqual(multiOp.ir.mount, {
      host: 'api.example.com',
      pathPrefix: '/v1/ledger',
    });

    const legacyRejected = normalizeServiceDefinition(
      defineService({
        fetch: () => ({status: 200}),
        handlers: {},
        name: 'legacy-mix',
        operations: {},
        version: '1.0.0',
      }),
    );
    assert.equal(legacyRejected.status, SERVICE_SOURCE_STATUS.REJECTED);
    assert.equal(
      legacyRejected.errors[0].code,
      SERVICE_SOURCE_ERROR_CODE.LEGACY_HANDLERS_UNSUPPORTED,
    );

    const invalidMount = normalizeServiceDefinition(
      defineService({
        fetch: () => ({status: 200}),
        mount: '/api/../secret',
        name: 'bad-mount',
        operations: {},
        version: '1.0.0',
      }),
    );
    assert.equal(invalidMount.status, SERVICE_SOURCE_STATUS.REJECTED);
    assert.equal(
      invalidMount.errors[0].code,
      SERVICE_SOURCE_ERROR_CODE.INVALID_MOUNT,
    );
  });

  it('generates mount-based v3 bindings, capability policies, and refuses legacy v1 artifacts', () => {
    const opA = createSampleOperation('amount_cents');
    const zeroOpIr = normalizeServiceDefinition(
      defineService({
        fetch: () => ({status: 200}),
        mount: '/edge',
        name: 'edge-only',
        operations: {},
        version: '1.0.0',
      }),
    ).ir;
    const zeroOpRecords = buildDeploymentRecords({
      artifact: ARTIFACT_DESCRIPTOR,
      ir: zeroOpIr,
    });
    assert.equal(zeroOpRecords.status, DEPLOYMENT_RECORD_STATUS.ACCEPTED);
    assert.equal(zeroOpRecords.records.manifest.exports.length, 1);
    assert.equal(zeroOpRecords.records.bindings.length, 1);
    assert.deepEqual(zeroOpRecords.records.bindings[0].source, {
      host: '*',
      kind: 'request',
      path_prefix: '/edge',
    });
    assert.equal(assertSuccessorServiceArtifact(zeroOpRecords.records), true);

    const multiIr = normalizeServiceDefinition(
      defineService({
        dependencies: ['fx-rates--call--convert'],
        fetch: () => ({status: 200}),
        mount: '/api',
        name: 'ledger',
        operations: {summarizeActivity: opA},
        version: '1.0.0',
      }),
    ).ir;
    const multiRecords = buildDeploymentRecords({
      artifact: ARTIFACT_DESCRIPTOR,
      ir: multiIr,
    });
    assert.equal(multiRecords.status, DEPLOYMENT_RECORD_STATUS.ACCEPTED);
    assert.deepEqual(multiRecords.records.accessPolicies, [
      {
        binding_name: 'ledger--request--fetch',
        calls: [
          {binding: 'fx-rates--call--convert'},
          {binding: 'ledger--call--summarize-activity'},
        ],
        schema_version: 2,
        tables: [],
      },
    ]);
    assert.equal(assertSuccessorServiceArtifact(multiRecords.records), true);

    assert.throws(
      () =>
        assertSuccessorServiceArtifact({
          exports: [{interface: 'request_v1', name: 'handle-request'}],
        }),
      (err) =>
        err?.code ===
        DEPLOYMENT_RECORD_ERROR_CODE.LEGACY_ARTIFACT_ABI_UNSUPPORTED,
    );
  });

  it('enforces non-overlapping request mounts and allows revision replacement in DeploymentBindingOwner', async () => {
    const zeroOpIr = normalizeServiceDefinition(
      defineService({
        fetch: () => ({status: 200}),
        mount: '/api',
        name: 'ledger',
        operations: {},
        version: '1.0.0',
      }),
    ).ir;
    const {records} = buildDeploymentRecords({
      artifact: ARTIFACT_DESCRIPTOR,
      ir: zeroOpIr,
    });
    const baseBinding = records.bindings[0];
    const manifestDigest = baseBinding.target.manifest_digest;
    const {owner} = createOwnerHarness(records.manifest, manifestDigest);

    assert.equal(
      mountsOverlap(
        {host: '*', kind: 'request', path_prefix: '/api'},
        {host: '*', kind: 'request', path_prefix: '/api/v1'},
      ),
      true,
    );
    assert.equal(
      mountsOverlap(
        {host: '*', kind: 'request', path_prefix: '/accounts'},
        {host: '*', kind: 'request', path_prefix: '/accounts-admin'},
      ),
      false,
    );

    const createdGen1 = await owner.createBinding(
      baseBinding,
      SECURITY_CONTEXT,
    );
    assert.equal(createdGen1.generation, 1);

    const updatedBudgets = {
      ...baseBinding,
      budgets: {...baseBinding.budgets, wall_time_ms: 25_000},
    };
    const createdGen2 = await owner.createBinding(
      updatedBudgets,
      SECURITY_CONTEXT,
    );
    assert.equal(createdGen2.generation, 2);

    const overlappingBinding = {
      ...baseBinding,
      name: 'other-service--request--fetch',
      source: {host: '*', kind: 'request', path_prefix: '/api/v1'},
    };
    await assert.rejects(
      () => owner.createBinding(overlappingBinding, SECURITY_CONTEXT),
      (err) => err?.code === DEPLOYMENT_BINDING_ERROR_CODE.BINDING_CONFLICT,
    );
  });

  it('canonicalizes admitted request URLs and resolves segment-prefix mounts in RequestBindingRouteResolver', () => {
    assert.equal(matchesMountPathPrefix('/api/v1/users', '/api'), true);
    assert.equal(matchesMountPathPrefix('/api-other', '/api'), false);

    const canonical = canonicalizeAdmittedRequestUrl(
      '/api/accounts/42?expand=1&tag=a&tag=b',
      {host: 'Example.COM'},
    );
    assert.equal(canonical.path, '/api/accounts/42');
    assert.equal(
      canonical.url,
      'http://example.com/api/accounts/42?expand=1&tag=a&tag=b',
    );

    for (const badTarget of [
      '/api/../admin',
      '/api/%2e%2e/admin',
      '/api/a%2fb',
      '/api/a%5cb',
      '/api//accounts',
      '/api/%ZZ',
    ]) {
      assert.throws(
        () => canonicalizeAdmittedRequestUrl(badTarget),
        (err) => err?.code === DEPLOYMENT_BINDING_ERROR_CODE.INVALID_FIELD,
      );
    }

    const zeroOpIr = normalizeServiceDefinition(
      defineService({
        fetch: () => ({status: 200}),
        mount: '/api',
        name: 'ledger',
        operations: {},
        version: '1.0.0',
      }),
    ).ir;
    const {records} = buildDeploymentRecords({
      artifact: ARTIFACT_DESCRIPTOR,
      ir: zeroOpIr,
    });
    const baseBinding = records.bindings[0];
    const manifestDigest = baseBinding.target.manifest_digest;
    const {artifact} = createOwnerHarness(records.manifest, manifestDigest);
    const cache = createInMemoryTableCache();
    seedMountRouteInCache(cache, baseBinding, artifact, 1);

    const resolver = new RequestBindingRouteResolver({systemTableCache: cache});
    const resolved = resolver.resolve({
      invocationId: 'inv-h2-1',
      method: 'POST',
      securityContext: SECURITY_CONTEXT,
      url: 'http://localhost/api/accounts/42?expand=1&tag=a&tag=b',
    });
    assert.equal(resolved.handlerId, 'fetch');
    assert.equal(resolved.path, '/api/accounts/42');
    assert.equal(
      resolved.admittedUrl,
      'http://localhost/api/accounts/42?expand=1&tag=a&tag=b',
    );

    assert.throws(
      () =>
        resolver.resolve({
          invocationId: 'inv-h2-2',
          method: 'GET',
          path: '/api-other',
          securityContext: SECURITY_CONTEXT,
        }),
      (err) => err?.code === REQUEST_CELL_ROUTE_ERROR_CODE.ROUTE_NOT_FOUND,
    );

    assert.throws(
      () =>
        resolver.resolve({
          invocationId: 'inv-h2-3',
          method: 'GET',
          path: '/api/%2f../secret',
          securityContext: SECURITY_CONTEXT,
        }),
      (err) =>
        err?.code === REQUEST_CELL_ROUTE_ERROR_CODE.INVALID_REQUEST &&
        err?.httpStatus === 400,
    );
  });

  it('compiles a generated Fetch/Hono entry and enforces the service-capability-boundary at runtime', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), TEST_TEMP_PREFIX));
    const runtime = new WasiComponentCellRuntime();
    try {
      const servicePath = path.join(tmpDir, SERVICE_MODULE_FILENAME);
      const entryPath = path.join(tmpDir, GENERATED_ENTRY_FILENAME);
      const componentPath = path.join(tmpDir, COMPONENT_FILENAME);
      await fs.writeFile(servicePath, HONO_LEDGER_SERVICE_SOURCE, UTF8_ENCODING);

      await emitServiceEntry({
        moduleSpecifier: `./${SERVICE_MODULE_FILENAME}`,
        outputPath: entryPath,
        world: SERVICE_WORLD_V2,
      });

      const buildResult = await buildServiceComponent({
        entryPath,
        outputPath: componentPath,
        worldName: SERVICE_WORLD_V2,
      });
      assert.equal(buildResult.component.byteLength > 0, true);
      assert.equal(
        DEPLOYMENT_BINDING_SCHEMA_VERSION_V3,
        3,
      );

      await runtime.start({
        budgets: {
          context_bytes: 8_192,
          cpu_time_ms: 2_000,
          input_bytes: 65_536,
          memory_bytes: 128 * 1024 * 1024,
          output_bytes: 65_536,
          wall_time_ms: 30_000,
        },
        bytes: buildResult.component,
        capabilities: [],
        exportName: 'handle-request',
        serviceId: 'h2-ledger-cell',
        world: 'request-cell',
      });

      const allowedTargets = new Set([
        'fx-rates--call--convert',
        'ledger--call--summarize-activity',
      ]);
      const observedCalls = [];
      const bindingCallDelegate = ({argumentsJson, name}) => {
        observedCalls.push({arguments: JSON.parse(argumentsJson), name});
        if (!allowedTargets.has(name)) {
          const err = new Error(`Target not allowed: ${name}`);
          err.code = 'target_not_allowed';
          throw err;
        }
        return JSON.stringify({ok: true, target: name});
      };

      const allowedRaw = await runtime.invoke(
        'h2-ledger-cell',
        [
          'fetch',
          JSON.stringify({
            body: JSON.stringify({currency: 'EUR', windowDays: 7}),
            headers: [['content-type', 'application/json']],
            method: 'POST',
            path: '/api/summary/42',
            url: 'http://localhost/api/summary/42?source=h2',
          }),
        ],
        () => [],
        () => {},
        undefined,
        {bindingCallDelegate},
      );
      const allowedEnvelope = JSON.parse(allowedRaw);
      assert.equal(allowedEnvelope.status, 200, allowedEnvelope.body);
      const allowedBody = JSON.parse(allowedEnvelope.body);
      assert.equal(allowedBody.proof, CAPABILITY_BOUNDARY_PROOF_ID);
      assert.equal(allowedBody.accountId, 42);
      assert.equal(allowedBody.url, 'http://localhost/api/summary/42?source=h2');

      const fxRaw = await runtime.invoke(
        'h2-ledger-cell',
        [
          'fetch',
          JSON.stringify({
            body: JSON.stringify({currency: 'EUR'}),
            headers: [['content-type', 'application/json']],
            method: 'POST',
            path: '/api/fx',
            url: 'http://localhost/api/fx',
          }),
        ],
        () => [],
        () => {},
        undefined,
        {bindingCallDelegate},
      );
      const fxEnvelope = JSON.parse(fxRaw);
      assert.equal(fxEnvelope.status, 200, fxEnvelope.body);
      assert.deepEqual(
        observedCalls.map((c) => c.name),
        ['ledger--call--summarize-activity', 'fx-rates--call--convert'],
      );

      const forbiddenRaw = await runtime.invoke(
        'h2-ledger-cell',
        [
          'fetch',
          JSON.stringify({
            body: '{}',
            headers: [['content-type', 'application/json']],
            method: 'POST',
            path: '/api/forbidden',
            url: 'http://localhost/api/forbidden',
          }),
        ],
        () => [],
        () => {},
        undefined,
        {bindingCallDelegate},
      );
      const forbiddenEnvelope = JSON.parse(forbiddenRaw);
      assert.equal(forbiddenEnvelope.status, 403);
      assert.equal(
        JSON.parse(forbiddenEnvelope.body).refusedCode,
        'target_not_allowed',
      );
    } finally {
      await runtime.stop('h2-ledger-cell');
      await fs.rm(tmpDir, {force: true, recursive: true});
    }
  });
});
