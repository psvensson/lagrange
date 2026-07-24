import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {describe, test} from 'node:test';

import {
  INITIAL_PARTITION_IDS,
  INITIAL_REPLICA_IDS,
  SYSTEM_TABLE_SCHEMAS,
  generateCreateTableSQL,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {CACHE_HYDRATION_TABLES} from '../../src/cache/cache-constants.js';
import {TABLES} from '../../src/constants/index.js';
import {
  DEPLOYMENT_BINDING_ERROR_CODE,
  DEPLOYMENT_BINDING_SOURCE_INTERFACE,
  DEPLOYMENT_BINDING_SOURCE_KIND,
  DeploymentBindingError,
  canonicalJson,
  deriveBindingId,
  deriveBindingVersionId,
  normalizeDeploymentBinding,
} from '../../src/control-plane/owners/deployment-binding-contract.js';
import {
  SERVICE_INSTALL_CATALOG_ERROR_CODE,
  ServiceInstallCatalogError,
  createSystemMetadataOwners,
} from '../../src/control-plane/owners/index.js';
import {deriveTenantPackageId} from
  '../../src/control-plane/owners/service-install-catalog-contract.js';

const TENANT = 'tenant-a';
const OTHER_TENANT = 'tenant-b';
const SECURITY_CONTEXT = Object.freeze({
  tenantId: TENANT,
  principal: 'alice',
  roles: Object.freeze(['deployer']),
});
const DIGEST = `sha256:${'a'.repeat(64)}`;

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

class DurableBindingGateway {
  constructor() {
    this.storage = new Map(SYSTEM_TABLE_SCHEMAS.map(
      (schema) => [schema.tableName, new Map()]));
    this.failAfterInsert = new Set();
    this.emptyReadBarrier = null;
  }

  schema(tableName) {
    return SYSTEM_TABLE_SCHEMAS.find((schema) => schema.tableName === tableName);
  }

  primaryKey(tableName) {
    const schema = this.schema(tableName);
    return schema.primaryKey?.[0] ||
      schema.columns.find((column) => column.primaryKey)?.name;
  }

  rows(tableName) {
    return this.storage.get(tableName);
  }

  async readAuthoritativeRows(tableName, sql, params) {
    const rows = [...this.rows(tableName).values()];
    const field = / WHERE ([a-z_]+) = \?$/.exec(sql)?.[1];
    const selected = field ?
      rows.filter((row) => row[field] === params[0]) : rows;
    if (selected.length === 0 && this.emptyReadBarrier) {
      await this.emptyReadBarrier.arrive();
    }
    return {success: true, rows: clone(selected)};
  }

  async insertSystemTableRow(tableName, row) {
    const table = this.rows(tableName);
    const key = row[this.primaryKey(tableName)];
    const schema = this.schema(tableName);
    const uniqueConflict = (schema.indices || [])
      .filter((index) => index.unique)
      .some((index) => [...table.values()].some((existing) =>
        index.columns.every((field) => existing[field] === row[field])));
    if (table.has(key) || uniqueConflict) {
      return {success: false, error: 'duplicate key'};
    }
    table.set(key, clone(row));
    if (this.failAfterInsert.delete(tableName)) {
      throw new Error('insert response lost after apply');
    }
    return {success: true, affectedRows: 1};
  }

  async upsertSystemTableRow(tableName, row) {
    this.rows(tableName).set(row[this.primaryKey(tableName)], clone(row));
    return {success: true, affectedRows: 1};
  }

  loseNextInsertResponse(tableName) {
    this.failAfterInsert.add(tableName);
  }

  synchronizeNextEmptyReads() {
    this.emptyReadBarrier = new AsyncBarrier(2);
  }
}

class AsyncBarrier {
  constructor(parties) {
    this.remaining = parties;
    this.promise = new Promise((resolve) => {
      this.release = resolve;
    });
  }

  async arrive() {
    if (this.remaining <= 0) return;
    this.remaining -= 1;
    if (this.remaining === 0) this.release();
    await this.promise;
  }
}

function createClock(start = 1000) {
  let now = start;
  return () => now++;
}

function createOwners(gateway, now = createClock()) {
  return createSystemMetadataOwners({
    controlPlaneSystemTableGateway: gateway,
    now,
  });
}

function manifest() {
  return {
    schema_version: 3,
    name: 'binding-targets',
    version: '1.0.0',
    capabilities: ['network.client', 'clock.read'],
    exports: [
      {name: 'boot-handler', interface: 'boot_v1'},
      {name: 'call-handler', interface: 'call_v1'},
      {name: 'change-handler', interface: 'change_v1'},
      {name: 'once-handler', interface: 'once_v1'},
      {name: 'pushdown-handler', interface: 'pushdown_v1'},
      {name: 'request-handler', interface: 'request_v1'},
      {name: 'time-handler', interface: 'time_v1'},
    ],
    artifact: {
      type: 'oci',
      ref: 'registry.example.test/binding-targets:1.0.0',
      digest: DIGEST,
      media_type: 'application/vnd.oci.image.manifest.v1+json',
    },
    runtime: {kind: 'oci_container'},
  };
}

function resolvedArtifact() {
  return {
    status: 'resolved',
    artifact: {
      digest: DIGEST,
      payloadMediaType: 'application/vnd.oci.image.manifest.v1+json',
      signature: {status: 'verified', keyId: 'publisher-main'},
    },
  };
}

async function seedPackage(catalog, tenantId = TENANT) {
  const value = manifest();
  const packageId = deriveTenantPackageId(value, tenantId);
  const stored = await catalog.recordPackage({
    packageId,
    manifest: value,
    resolvedArtifact: resolvedArtifact(),
  });
  return {...stored, manifest: value};
}

function bindingInput(package_, overrides = {}) {
  return {
    schema_version: 2,
    name: 'orders-api',
    target: {
      package_id: package_.packageId,
      manifest_digest: package_.manifestDigest,
      export_name: 'request-handler',
    },
    source: {kind: 'request', method: 'POST', path: '/orders'},
    budgets: {
      cpu_time_ms: 100,
      wall_time_ms: 1000,
      memory_bytes: 1048576,
      input_bytes: 4096,
      output_bytes: 4096,
      context_bytes: 8192,
    },
    ...overrides,
  };
}

function assertBindingCode(error, code) {
  assert.ok(error instanceof DeploymentBindingError);
  assert.equal(error.code, code);
  return true;
}

describe('deployment Binding v2 contract', () => {
  test('owns the seven closed source-to-interface mappings', () => {
    assert.deepEqual(
      Object.keys(DEPLOYMENT_BINDING_SOURCE_KIND).sort(),
      ['BOOT', 'CALL', 'CHANGE', 'ONCE', 'PUSHDOWN', 'REQUEST', 'TIME'],
    );
    assert.deepEqual(
      Object.values(DEPLOYMENT_BINDING_SOURCE_INTERFACE).sort(),
      [
        'boot_v1',
        'call_v1',
        'change_v1',
        'once_v1',
        'pushdown_v1',
        'request_v1',
        'time_v1',
      ],
    );
  });

  test('normalizes a strict request declaration', () => {
    const normalized = normalizeDeploymentBinding({
      schema_version: 2,
      name: 'orders-api',
      target: {
        package_id: `service-package-${'a'.repeat(64)}`,
        manifest_digest: `sha256:${'b'.repeat(64)}`,
        export_name: 'serve',
      },
      source: {kind: 'request', method: 'POST', path: '/orders'},
      budgets: {
        cpu_time_ms: 100,
        wall_time_ms: 1000,
        memory_bytes: 1048576,
        input_bytes: 4096,
        output_bytes: 4096,
        context_bytes: 8192,
      },
    });

    assert.equal(normalized.schema_version, 2);
    assert.equal(Object.hasOwn(normalized, 'contexts'), false);
    assert.equal(normalized.source.kind, 'request');
    assert.equal(Object.hasOwn(normalized, 'elasticity'), false);
    assert.ok(Object.isFrozen(normalized));
  });

  test('rejects unknown fields, duplicates, and every numeric boundary breach',
    () => {
      const package_ = {
        packageId: `service-package-${'a'.repeat(64)}`,
        manifestDigest: `sha256:${'b'.repeat(64)}`,
      };
      const valid = bindingInput(package_);
      const invalid = [
        {...valid, capabilities: []},
        {
          ...valid,
          elasticity: {voters: 3, min_learners: 0, max_learners: 2},
        },
        {...valid, source: {...valid.source, interface: 'request_v1'}},
        {...valid, contexts: ['table:global.orders']},
        {...valid, budgets: {...valid.budgets, cpu_time_ms: 0}},
        {...valid, budgets: {...valid.budgets, cpu_time_ms: 60001}},
        {...valid, budgets: {...valid.budgets, wall_time_ms: 0}},
        {...valid, budgets: {...valid.budgets, wall_time_ms: 99}},
        {...valid, budgets: {...valid.budgets, wall_time_ms: 300001}},
        {...valid, budgets: {...valid.budgets, memory_bytes: 0}},
        {...valid, budgets: {...valid.budgets, memory_bytes: 1073741825}},
        {...valid, budgets: {...valid.budgets, input_bytes: -1}},
        {...valid, budgets: {...valid.budgets, input_bytes: 16777217}},
        {...valid, budgets: {...valid.budgets, output_bytes: -1}},
        {...valid, budgets: {...valid.budgets, output_bytes: 16777217}},
        {...valid, budgets: {...valid.budgets, context_bytes: -1}},
        {...valid, budgets: {...valid.budgets, context_bytes: 67108865}},
        {...valid, source: {kind: 'time', interval_ms: 0}},
        {...valid, source: {kind: 'time', interval_ms: 86400001}},
      ];
      for (const candidate of invalid) {
        assert.throws(
          () => normalizeDeploymentBinding(candidate),
          (error) => assertBindingCode(
            error, DEPLOYMENT_BINDING_ERROR_CODE.INVALID_FIELD),
        );
      }

      for (const candidate of [
        {
          ...valid,
          source: {kind: 'time', interval_ms: 1},
          budgets: {
            cpu_time_ms: 1,
            wall_time_ms: 1,
            memory_bytes: 1,
            input_bytes: 0,
            output_bytes: 0,
            context_bytes: 0,
          },
        },
        {
          ...valid,
          source: {kind: 'time', interval_ms: 86400000},
          budgets: {
            cpu_time_ms: 60000,
            wall_time_ms: 300000,
            memory_bytes: 1073741824,
            input_bytes: 16777216,
            output_bytes: 16777216,
            context_bytes: 67108864,
          },
        },
      ]) {
        assert.doesNotThrow(() => normalizeDeploymentBinding(candidate));
      }
    });
});

describe('deployment Binding system-table owner', () => {
  test('registers one replicated declaration table without runtime actuals', () => {
    const schema = SYSTEM_TABLE_SCHEMAS.find(
      (candidate) => candidate.tableName === TABLES.SERVICE_BINDINGS);
    assert.ok(schema);
    assert.equal(
      INITIAL_PARTITION_IDS[TABLES.SERVICE_BINDINGS],
      'service_bindings-p1',
    );
    assert.equal(INITIAL_REPLICA_IDS[TABLES.SERVICE_BINDINGS].length, 3);
    assert.ok(CACHE_HYDRATION_TABLES.includes(TABLES.SERVICE_BINDINGS));
    assert.match(generateCreateTableSQL(schema), /CREATE TABLE IF NOT EXISTS/u);
    assert.deepEqual(
      schema.columns.map((column) => column.name),
      [
        'binding_version_id', 'binding_id', 'tenant_id', 'binding_name',
        'generation', 'binding_digest', 'package_id', 'manifest_digest',
        'export_name', 'source_kind', 'normalized_binding', 'created_by',
        'created_at',
      ],
    );
    for (const forbidden of [
      'active', 'endpoint', 'health', 'node_id', 'replica_id', 'running',
      'service_definition_id', 'status', 'updated_at',
    ]) {
      assert.ok(!schema.columns.some((column) => column.name === forbidden));
    }
  });

  test('persists all seven strict variants and derives artifact capabilities',
    async () => {
      const gateway = new DurableBindingGateway();
      const owners = createOwners(gateway);
      const package_ = await seedPackage(owners.serviceInstallCatalogOwner);
      const variants = [
        ['boot', {kind: 'boot'}, 'boot-handler'],
        ['call', {kind: 'call', name: 'orders-call'}, 'call-handler'],
        ['change', {
          kind: 'change',
          operations: ['update', 'insert'],
          tables: ['table:global.orders'],
        }, 'change-handler'],
        ['once', {kind: 'once'}, 'once-handler'],
        ['pushdown', {kind: 'pushdown', name: 'orders-filter'},
          'pushdown-handler'],
        ['request', {kind: 'request', method: 'POST', path: '/orders'},
          'request-handler'],
        ['time', {kind: 'time', interval_ms: 60000}, 'time-handler'],
      ];

      for (const [kind, source, exportName] of variants) {
        const created = await owners.deploymentBindingOwner.createBinding(
          bindingInput(package_, {
            name: `binding-${kind}`,
            source,
            target: {...bindingInput(package_).target, export_name: exportName},
          }),
          SECURITY_CONTEXT,
        );
        assert.equal(created.declaration.source.kind, kind);
        assert.deepEqual(
          created.declaration.capabilities,
          ['clock.read', 'network.client'],
        );
        assert.equal(created.generation, 1);
        assert.equal(created.replayed, false);
        assert.ok(Object.isFrozen(created));
      }
      assert.equal(gateway.rows(TABLES.SERVICE_BINDINGS).size, 7);
      assert.equal(gateway.rows(TABLES.SERVICE_DEFINITIONS).size, 0);
      assert.equal(gateway.rows(TABLES.SERVICES).size, 0);
      assert.equal(gateway.rows(TABLES.SERVICE_ENDPOINTS).size, 0);
    });

  test('projects the exact canonical immutable row', async () => {
    const gateway = new DurableBindingGateway();
    const owners = createOwners(gateway, () => 7000);
    const package_ = await seedPackage(owners.serviceInstallCatalogOwner);
    const created = await owners.deploymentBindingOwner.createBinding(
      bindingInput(package_), SECURITY_CONTEXT);
    const bindingId = deriveBindingId(TENANT, 'orders-api');
    const bindingVersionId = deriveBindingVersionId(bindingId);
    const normalizedBinding = canonicalJson(created.declaration);

    assert.deepEqual(
      gateway.rows(TABLES.SERVICE_BINDINGS).get(bindingVersionId),
      {
        binding_version_id: bindingVersionId,
        binding_id: bindingId,
        tenant_id: TENANT,
        binding_name: 'orders-api',
        generation: 1,
        binding_digest: `sha256:${createHash('sha256')
          .update(normalizedBinding)
          .digest('hex')}`,
        package_id: package_.packageId,
        manifest_digest: package_.manifestDigest,
        export_name: 'request-handler',
        source_kind: 'request',
        normalized_binding: normalizedBinding,
        created_by: SECURITY_CONTEXT.principal,
        created_at: 7000,
      },
    );
  });

  test('fails closed on interface, context fields, malformed triggers, and tenant widening',
    async () => {
      const gateway = new DurableBindingGateway();
      const owners = createOwners(gateway);
      const package_ = await seedPackage(owners.serviceInstallCatalogOwner);
      const owner = owners.deploymentBindingOwner;

      await assert.rejects(
        owner.createBinding(bindingInput(package_, {
          source: {kind: 'call', name: 'wrong-interface'},
        }), SECURITY_CONTEXT),
        (error) => assertBindingCode(
          error, DEPLOYMENT_BINDING_ERROR_CODE.INTERFACE_MISMATCH),
      );
      await assert.rejects(
        owner.createBinding(bindingInput(package_, {
          contexts: ['table:global.secret'],
        }), SECURITY_CONTEXT),
        (error) => assertBindingCode(
          error, DEPLOYMENT_BINDING_ERROR_CODE.INVALID_FIELD),
      );
      await assert.rejects(
        owner.createBinding(bindingInput(package_, {
          source: {
            kind: 'change',
            operations: ['insert'],
            tables: ['table:global.*'],
          },
          target: {
            ...bindingInput(package_).target,
            export_name: 'change-handler',
          },
        }), SECURITY_CONTEXT),
        (error) => assertBindingCode(
          error, DEPLOYMENT_BINDING_ERROR_CODE.INVALID_FIELD),
      );
      const triggerOnly = await owner.createBinding(bindingInput(package_, {
        name: 'change-secret-trigger',
        source: {
          kind: 'change',
          operations: ['insert'],
          tables: ['table:global.secret'],
        },
        target: {
          ...bindingInput(package_).target,
          export_name: 'change-handler',
        },
      }), SECURITY_CONTEXT);
      assert.deepEqual(
        triggerOnly.declaration.source.tables,
        ['table:global.secret'],
      );
      await assert.rejects(
        owner.createBinding(bindingInput(package_), {
          ...SECURITY_CONTEXT,
          tenantId: OTHER_TENANT,
        }),
        (error) => {
          assert.ok(error instanceof ServiceInstallCatalogError);
          assert.equal(
            error.code,
            SERVICE_INSTALL_CATALOG_ERROR_CODE.PACKAGE_NOT_ELIGIBLE,
          );
          return true;
        },
      );
      assert.equal(gateway.rows(TABLES.SERVICE_BINDINGS).size, 1);
    });

  test('replays exact bytes and types immutable conflicts', async () => {
    const gateway = new DurableBindingGateway();
    const owners = createOwners(gateway);
    const package_ = await seedPackage(owners.serviceInstallCatalogOwner);
    const input = bindingInput(package_);
    const first = await owners.deploymentBindingOwner.createBinding(
      input, SECURITY_CONTEXT);
    const replay = await owners.deploymentBindingOwner.createBinding(
      clone(input), SECURITY_CONTEXT);
    assert.equal(first.bindingVersionId, replay.bindingVersionId);
    assert.equal(replay.replayed, true);
    assert.equal(gateway.rows(TABLES.SERVICE_BINDINGS).size, 1);

    await assert.rejects(
      owners.deploymentBindingOwner.createBinding({
        ...input,
        source: {...input.source, path: '/different'},
      }, SECURITY_CONTEXT),
      (error) => assertBindingCode(
        error, DEPLOYMENT_BINDING_ERROR_CODE.BINDING_CONFLICT),
    );
  });

  test('recovers lost insert responses and concurrent owner races', async () => {
    const gateway = new DurableBindingGateway();
    const firstOwners = createOwners(gateway);
    const secondOwners = createOwners(gateway, createClock(9000));
    const package_ = await seedPackage(firstOwners.serviceInstallCatalogOwner);

    gateway.loseNextInsertResponse(TABLES.SERVICE_BINDINGS);
    const recovered = await firstOwners.deploymentBindingOwner.createBinding(
      bindingInput(package_, {name: 'lost-response'}), SECURITY_CONTEXT);
    assert.equal(recovered.replayed, true);

    gateway.synchronizeNextEmptyReads();
    const concurrentInput = bindingInput(package_, {name: 'concurrent'});
    const concurrent = await Promise.all([
      firstOwners.deploymentBindingOwner.createBinding(
        concurrentInput, SECURITY_CONTEXT),
      secondOwners.deploymentBindingOwner.createBinding(
        concurrentInput, SECURITY_CONTEXT),
    ]);
    assert.deepEqual(
      concurrent.map((entry) => entry.bindingVersionId),
      [concurrent[0].bindingVersionId, concurrent[0].bindingVersionId],
    );
    assert.equal(gateway.rows(TABLES.SERVICE_BINDINGS).size, 2);

    const conflictGateway = new DurableBindingGateway();
    const conflictFirst = createOwners(conflictGateway);
    const conflictSecond = createOwners(conflictGateway, createClock(9000));
    const conflictPackage = await seedPackage(
      conflictFirst.serviceInstallCatalogOwner);
    conflictGateway.synchronizeNextEmptyReads();
    const conflictInput = bindingInput(
      conflictPackage, {name: 'concurrent-conflict'});
    const conflict = await Promise.allSettled([
      conflictFirst.deploymentBindingOwner.createBinding(
        conflictInput, SECURITY_CONTEXT),
      conflictSecond.deploymentBindingOwner.createBinding({
        ...conflictInput,
        source: {...conflictInput.source, path: '/different'},
      }, SECURITY_CONTEXT),
    ]);
    assert.deepEqual(
      conflict.map((entry) => entry.status).sort(),
      ['fulfilled', 'rejected'],
    );
    const rejected = conflict.find((entry) => entry.status === 'rejected');
    assertBindingCode(
      rejected.reason, DEPLOYMENT_BINDING_ERROR_CODE.BINDING_CONFLICT);
    assert.equal(conflictGateway.rows(TABLES.SERVICE_BINDINGS).size, 1);
  });

  test('rejects corrupted durable projection before returning it', async () => {
    const gateway = new DurableBindingGateway();
    const owners = createOwners(gateway);
    const package_ = await seedPackage(owners.serviceInstallCatalogOwner);
    const created = await owners.deploymentBindingOwner.createBinding(
      bindingInput(package_), SECURITY_CONTEXT);
    const row = gateway.rows(TABLES.SERVICE_BINDINGS)
      .get(created.bindingVersionId);
    const tampered = JSON.parse(row.normalized_binding);
    tampered.schema_version = 99;
    row.normalized_binding = JSON.stringify(tampered);
    row.binding_digest = `sha256:${createHash('sha256')
      .update(row.normalized_binding)
      .digest('hex')}`;

    await assert.rejects(
      owners.deploymentBindingOwner.getBindingByName(
        'orders-api', SECURITY_CONTEXT),
      (error) => assertBindingCode(
        error, DEPLOYMENT_BINDING_ERROR_CODE.CORRUPT_RECORD),
    );
  });

  test('accepts only the cache HLC annotation beyond durable Binding fields',
    async () => {
      const gateway = new DurableBindingGateway();
      const owners = createOwners(gateway);
      const package_ = await seedPackage(owners.serviceInstallCatalogOwner);
      const created = await owners.deploymentBindingOwner.createBinding(
        bindingInput(package_), SECURITY_CONTEXT);
      const row = gateway.rows(TABLES.SERVICE_BINDINGS)
        .get(created.bindingVersionId);
      row.updated_at_hlc = '1000-0-service_bindings-p1-r1';

      const cached = await owners.deploymentBindingOwner.getBindingByName(
        'orders-api',
        SECURITY_CONTEXT,
      );
      assert.equal(cached.bindingVersionId, created.bindingVersionId);

      row.unowned_projection = 'rejected';
      await assert.rejects(
        owners.deploymentBindingOwner.getBindingByName(
          'orders-api',
          SECURITY_CONTEXT,
        ),
        (error) => assertBindingCode(
          error,
          DEPLOYMENT_BINDING_ERROR_CODE.CORRUPT_RECORD,
        ),
      );
    },
  );
});
