import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {describe, it} from 'node:test';

import {
  INITIAL_PARTITION_IDS,
  INITIAL_REPLICA_IDS,
  SYSTEM_TABLE_SCHEMAS,
  generateCreateTableSQL,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  CDC_NON_PROPAGATED_TABLES,
  CACHE_HYDRATION_TABLES,
} from '../../src/cache/cache-constants.js';
import {TABLES} from '../../src/constants/index.js';
import {
  SERVICE_INSTALL_CATALOG_ERROR_CODE,
  SERVICE_INSTALL_DESIRED_STATE,
  SERVICE_INSTALL_FAILURE_CODE,
  SERVICE_INSTALL_FAILURE_PHASE,
  SERVICE_INSTALL_ROLLOUT_STATE,
  ServiceInstallCatalogError,
  ServiceInstallCatalogOwner,
  createSystemMetadataOwners,
} from '../../src/control-plane/owners/index.js';

const CATALOG_TABLES = Object.freeze([
  TABLES.SERVICE_PACKAGES,
  TABLES.SERVICE_REVISIONS,
  TABLES.SERVICE_INSTALLATIONS,
  TABLES.SERVICE_INSTALL_FAILURES,
]);
const ACTUAL_STATE_FIELDS = Object.freeze([
  'address',
  'endpoint',
  'health_status',
  'node_id',
  'raft_role',
  'replica_id',
  'running',
  'runtime_process',
]);
const DIGEST = `sha256:${'a'.repeat(64)}`;

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

class DurableCatalogGateway {
  constructor(storage = new Map()) {
    this.storage = storage;
    for (const table of CATALOG_TABLES) {
      if (!this.storage.has(table)) this.storage.set(table, new Map());
    }
    this.readOverride = null;
    this.failAfterInsert = new Set();
    this.failAfterUpdate = new Set();
    this.failBeforeUpdate = new Set();
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
    if (this.readOverride) return this.readOverride;
    const rows = [...this.rows(tableName).values()];
    const fieldMatch = / WHERE ([a-z_]+) = \?$/.exec(sql);
    const selected = fieldMatch ?
      rows.filter((row) => row[fieldMatch[1]] === params[0]) :
      rows;
    return {success: true, rows: clone(selected)};
  }

  async insertSystemTableRow(tableName, row) {
    const table = this.rows(tableName);
    const key = row[this.primaryKey(tableName)];
    if (table.has(key)) return {success: false, error: 'duplicate key'};
    if (tableName === TABLES.SERVICE_INSTALLATIONS &&
        [...table.values()].some((candidate) =>
          candidate.operation_id === row.operation_id)) {
      return {success: false, error: 'duplicate operation'};
    }
    table.set(key, clone(row));
    if (this.failAfterInsert.delete(tableName)) {
      throw new Error('insert response lost after apply');
    }
    return {success: true, affectedRows: 1};
  }

  async upsertSystemTableRow(tableName, row) {
    const key = row[this.primaryKey(tableName)];
    this.rows(tableName).set(key, clone(row));
    return {success: true, affectedRows: 1};
  }

  async updateSystemTableRow(tableName, whereClause, data) {
    if (this.failBeforeUpdate.delete(tableName)) {
      throw new Error('update rejected before apply');
    }
    let affectedRows = 0;
    for (const [key, row] of this.rows(tableName)) {
      const matches = Object.entries(whereClause).every(
        ([field, value]) => row[field] === value,
      );
      if (!matches) continue;
      this.rows(tableName).set(key, clone({...row, ...data}));
      affectedRows += 1;
    }
    if (this.failAfterUpdate.delete(tableName)) {
      throw new Error('update response lost after apply');
    }
    return {success: true, affectedRows};
  }

  async deleteSystemTableRow(tableName, whereClause) {
    let affectedRows = 0;
    for (const [key, row] of this.rows(tableName)) {
      if (!Object.entries(whereClause).every(
        ([field, value]) => row[field] === value)) continue;
      this.rows(tableName).delete(key);
      affectedRows += 1;
    }
    return {success: true, affectedRows};
  }

  corrupt(tableName, key, data) {
    const row = this.rows(tableName).get(key);
    this.rows(tableName).set(key, {...row, ...data});
  }

  loseNextInsertResponse(tableName) {
    this.failAfterInsert.add(tableName);
  }

  loseNextUpdateResponse(tableName) {
    this.failAfterUpdate.add(tableName);
  }

  rejectNextUpdateBeforeApply(tableName) {
    this.failBeforeUpdate.add(tableName);
  }
}

class AsyncBarrier {
  constructor(parties = 2) {
    this.remaining = parties;
    this.promise = new Promise((resolve) => {
      this.release = resolve;
    });
  }

  isActive() {
    return this.remaining > 0;
  }

  async arrive() {
    if (!this.isActive()) return;
    this.remaining -= 1;
    if (this.remaining === 0) this.release();
    await this.promise;
  }
}

class BarrierCatalogGateway extends DurableCatalogGateway {
  constructor(storage = new Map()) {
    super(storage);
    this.readBarriers = [];
    this.updateBarriers = [];
  }

  barrierRead(field, value) {
    this.readBarriers.push({field, value, barrier: new AsyncBarrier()});
  }

  barrierUpdate(tableName) {
    this.updateBarriers.push({tableName, barrier: new AsyncBarrier()});
  }

  async readAuthoritativeRows(tableName, sql, params) {
    const result = await super.readAuthoritativeRows(tableName, sql, params);
    const field = / WHERE ([a-z_]+) = \?$/.exec(sql)?.[1];
    const entry = this.readBarriers.find((candidate) =>
      candidate.barrier.isActive() && candidate.field === field &&
      candidate.value === params[0]);
    if (entry && result.rows.length === 0) await entry.barrier.arrive();
    return result;
  }

  async updateSystemTableRow(tableName, whereClause, data) {
    const entry = this.updateBarriers.find((candidate) =>
      candidate.barrier.isActive() && candidate.tableName === tableName);
    if (entry) await entry.barrier.arrive();
    return super.updateSystemTableRow(tableName, whereClause, data);
  }
}

function createClock(start = 1000) {
  let now = start;
  return () => now++;
}

function createCatalog(gateway, now = createClock()) {
  return createSystemMetadataOwners({
    controlPlaneSystemTableGateway: gateway,
    now,
  }).serviceInstallCatalogOwner;
}

function manifest(overrides = {}) {
  return {
    schema_version: 1,
    name: 'analytics-worker',
    version: '3.0.0',
    artifact: {
      type: 'oci',
      ref: 'registry.example.test/analytics-worker:3.0.0',
      digest: DIGEST,
      media_type: 'application/vnd.oci.image.manifest.v1+json',
    },
    runtime: {kind: 'oci_container'},
    ...overrides,
  };
}

function v2Manifest(exports_) {
  return manifest({
    schema_version: 2,
    exports: exports_,
  });
}

function v3Manifest(exports_) {
  return manifest({
    schema_version: 3,
    exports: exports_,
  });
}

function resolvedArtifact(overrides = {}) {
  return {
    status: 'resolved',
    artifact: {
      digest: DIGEST,
      payloadMediaType: 'application/vnd.oci.image.manifest.v1+json',
      signature: {status: 'verified', keyId: 'publisher-main'},
      ...overrides,
    },
  };
}

async function seedRevision(catalog, suffix = '1') {
  await catalog.recordPackage({
    packageId: `pkg-${suffix}`,
    manifest: manifest(),
    resolvedArtifact: resolvedArtifact(),
  });
  await catalog.recordRevision({
    revisionId: `rev-${suffix}`,
    packageId: `pkg-${suffix}`,
    config: {bucket: 'reports', concurrency: 2},
  });
}

async function seedInstallation(catalog, suffix = '1') {
  await seedRevision(catalog, suffix);
  return catalog.requestInstallation({
    installationId: `install-${suffix}`,
    revisionId: `rev-${suffix}`,
    serviceDefinitionId: `service-definition-${suffix}`,
    desiredState: SERVICE_INSTALL_DESIRED_STATE.ACTIVE,
    operationId: `operation-${suffix}`,
  });
}

function assertCode(error, code) {
  assert.ok(error instanceof ServiceInstallCatalogError);
  assert.equal(error.code, code);
  return true;
}

describe('service install catalog system-table contract', () => {
  it('registers four replicated, non-propagated catalog tables', () => {
    for (const tableName of CATALOG_TABLES) {
      const schema = SYSTEM_TABLE_SCHEMAS.find(
        (candidate) => candidate.tableName === tableName,
      );
      assert.ok(schema, `${tableName} schema must be registered`);
      assert.equal(INITIAL_PARTITION_IDS[tableName], `${tableName}-p1`);
      assert.equal(INITIAL_REPLICA_IDS[tableName].length, 3);
      assert.ok(CDC_NON_PROPAGATED_TABLES.includes(tableName));
      assert.ok(!CACHE_HYDRATION_TABLES.includes(tableName));
      assert.match(generateCreateTableSQL(schema), /CREATE TABLE IF NOT EXISTS/);
      for (const field of ACTUAL_STATE_FIELDS) {
        assert.ok(!schema.columns.some((column) => column.name === field),
          `${tableName} must not own ${field}`);
      }
    }
  });

  it('keeps one logical reference to canonical actual-state owners', () => {
    const schema = SYSTEM_TABLE_SCHEMAS.find(
      (candidate) => candidate.tableName === TABLES.SERVICE_INSTALLATIONS,
    );
    assert.ok(schema.columns.some(
      (column) => column.name === 'service_definition_id'));
    assert.ok(schema.columns.some(
      (column) => column.name === 'rollout_state'));
    assert.ok(!schema.columns.some((column) => column.name === 'status'));
  });
});

describe('service install catalog production owner', () => {
  it('owns the immutable package plus manifest-digest binding identity',
    async () => {
      const gateway = new DurableCatalogGateway();
      const catalog = createCatalog(gateway);
      const firstManifest = v3Manifest([{
        interface: 'request_v1',
        name: 'serve',
      }]);
      const first = await catalog.recordPackage({
        packageId: 'pkg-bindable-a',
        manifest: firstManifest,
        resolvedArtifact: resolvedArtifact(),
      });

      const stored = gateway.rows(TABLES.SERVICE_PACKAGES).get(first.packageId);
      assert.equal(
        first.manifestDigest,
        `sha256:${createHash('sha256')
          .update(stored.normalized_manifest)
          .digest('hex')}`,
      );
      assert.match(first.manifestDigest, /^sha256:[0-9a-f]{64}$/u);
      assert.equal(first.manifestSchemaVersion, 3);
      assert.deepEqual(
        await catalog.getBindableArtifact(
          first.packageId, first.manifestDigest),
        {
          packageId: first.packageId,
          manifestDigest: first.manifestDigest,
          artifactDigest: DIGEST,
          manifest: firstManifest,
        },
      );

      const replay = await catalog.recordPackage({
        packageId: 'pkg-bindable-a',
        manifest: {
          exports: firstManifest.exports,
          runtime: firstManifest.runtime,
          artifact: firstManifest.artifact,
          version: firstManifest.version,
          name: firstManifest.name,
          schema_version: firstManifest.schema_version,
        },
        resolvedArtifact: resolvedArtifact(),
      });
      assert.equal(replay.manifestDigest, first.manifestDigest);

      const unique = await catalog.resolveUniqueBindableArtifactByDigest(
        DIGEST, [first.packageId]);
      assert.equal(unique.packageId, first.packageId);
      assert.equal(unique.manifestDigest, first.manifestDigest);
      await assert.rejects(
        catalog.resolveUniqueBindableArtifactByDigest(DIGEST, []),
        (error) => assertCode(
          error, SERVICE_INSTALL_CATALOG_ERROR_CODE.INVALID_FIELD),
      );

      gateway.corrupt(TABLES.SERVICE_PACKAGES, first.packageId, {
        package_id: 'bad package id',
      });
      await assert.rejects(
        catalog.resolveUniqueBindableArtifactByDigest(
          DIGEST, [first.packageId]),
        (error) => assertCode(
          error, SERVICE_INSTALL_CATALOG_ERROR_CODE.CORRUPT_RECORD),
      );
      gateway.corrupt(TABLES.SERVICE_PACKAGES, first.packageId, {
        package_id: first.packageId,
      });

      await catalog.recordPackage({
        packageId: 'pkg-bindable-b',
        manifest: v3Manifest([{
          interface: 'change_v1',
          name: 'audit-change',
        }]),
        resolvedArtifact: resolvedArtifact(),
      });
      assert.equal(
        (await catalog.resolveUniqueBindableArtifactByDigest(
          DIGEST, [first.packageId])).packageId,
        first.packageId,
      );
      await assert.rejects(
        catalog.resolveUniqueBindableArtifactByDigest(
          DIGEST, ['pkg-bindable-a', 'pkg-bindable-b']),
        (error) => assertCode(
          error,
          SERVICE_INSTALL_CATALOG_ERROR_CODE.AMBIGUOUS_ARTIFACT_DIGEST,
        ),
      );
    });

  it('accepts only current v3 and rejects v1, v2, and corruption',
    async () => {
      const gateway = new DurableCatalogGateway();
      const catalog = createCatalog(gateway);
      const current = await catalog.recordPackage({
        packageId: 'pkg-v3',
        manifest: v3Manifest([{
          interface: 'request_v1',
          name: 'serve',
        }]),
        resolvedArtifact: resolvedArtifact(),
      });
      assert.equal(
        (await catalog.getBindableArtifact(
          current.packageId,
          current.manifestDigest,
        )).manifest.schema_version,
        3,
      );
      const v2 = await catalog.recordPackage({
        packageId: 'pkg-v2',
        manifest: v2Manifest([{
          interface: 'request_v1',
          name: 'serve',
          reads: [],
          writes: [],
        }]),
        resolvedArtifact: resolvedArtifact(),
      });
      await assert.rejects(
        () => catalog.getBindableArtifact(
          v2.packageId,
          v2.manifestDigest,
        ),
        (error) => assertCode(
          error,
          SERVICE_INSTALL_CATALOG_ERROR_CODE.ARTIFACT_NOT_ANALYZABLE,
        ),
      );
      const v1 = await catalog.recordPackage({
        packageId: 'pkg-v1',
        manifest: manifest(),
        resolvedArtifact: resolvedArtifact(),
      });
      await assert.rejects(
        catalog.getBindableArtifact(v1.packageId, v1.manifestDigest),
        (error) => assertCode(
          error, SERVICE_INSTALL_CATALOG_ERROR_CODE.ARTIFACT_NOT_ANALYZABLE),
      );

      const corruptCurrent = await catalog.recordPackage({
        packageId: 'pkg-corrupt-v3',
        manifest: v3Manifest([{
          interface: 'request_v1',
          name: 'serve',
        }]),
        resolvedArtifact: resolvedArtifact(),
      });
      const row = gateway.rows(TABLES.SERVICE_PACKAGES)
        .get(corruptCurrent.packageId);
      const changed = JSON.parse(row.normalized_manifest);
      changed.exports[0].reads = ['table:global.secret'];
      gateway.corrupt(TABLES.SERVICE_PACKAGES, corruptCurrent.packageId, {
        normalized_manifest: JSON.stringify(changed),
      });
      await assert.rejects(
        catalog.getBindableArtifact(
          corruptCurrent.packageId,
          corruptCurrent.manifestDigest,
        ),
        (error) => assertCode(
          error, SERVICE_INSTALL_CATALOG_ERROR_CODE.CORRUPT_RECORD),
      );

      gateway.corrupt(TABLES.SERVICE_PACKAGES, corruptCurrent.packageId, {
        normalized_manifest: '{not-json',
      });
      await assert.rejects(
        catalog.getPackage(corruptCurrent.packageId),
        (error) => assertCode(
          error, SERVICE_INSTALL_CATALOG_ERROR_CODE.CORRUPT_RECORD),
      );
    });

  it('rejects canonical but invalid v3 manifests read from durable state',
    async () => {
      const gateway = new DurableCatalogGateway();
      const catalog = createCatalog(gateway);
      const invalidManifest = v3Manifest([{
        interface: 'not_a_real_interface',
        name: 'serve',
      }]);
      await assert.rejects(
        catalog.recordPackage({
          packageId: 'pkg-invalid-before-write',
          manifest: invalidManifest,
          resolvedArtifact: resolvedArtifact(),
        }),
        (error) => assertCode(
          error, SERVICE_INSTALL_CATALOG_ERROR_CODE.INVALID_FIELD),
      );
      assert.equal(gateway.rows(TABLES.SERVICE_PACKAGES).size, 0);

      const stored = await catalog.recordPackage({
        packageId: 'pkg-invalid-v3',
        manifest: v3Manifest([{
          interface: 'request_v1',
          name: 'serve',
        }]),
        resolvedArtifact: resolvedArtifact(),
      });
      const row = gateway.rows(TABLES.SERVICE_PACKAGES).get(stored.packageId);
      const invalid = JSON.parse(row.normalized_manifest);
      invalid.exports[0].interface = 'not_a_real_interface';
      gateway.corrupt(TABLES.SERVICE_PACKAGES, stored.packageId, {
        normalized_manifest: JSON.stringify(invalid),
      });

      await assert.rejects(
        catalog.resolveUniqueBindableArtifactByDigest(
          DIGEST, [stored.packageId]),
        (error) => assertCode(
          error, SERVICE_INSTALL_CATALOG_ERROR_CODE.CORRUPT_RECORD),
      );
    });

  it('durably records and recovers package, revision, and install intent',
    async () => {
      const gateway = new DurableCatalogGateway();
      const catalog = createCatalog(gateway);
      assert.ok(catalog instanceof ServiceInstallCatalogOwner);
      const first = await seedInstallation(catalog);

      assert.equal(first.rolloutState,
        SERVICE_INSTALL_ROLLOUT_STATE.RECORDED_NOT_RUNNING);
      assert.equal(Object.hasOwn(first, 'running'), false);
      assert.deepEqual(
        Object.values(first.actualStateReferences).map((ref) => ref.table),
        [TABLES.SERVICE_DEFINITIONS, TABLES.SERVICES, TABLES.SERVICE_ENDPOINTS],
      );
      assert.equal(gateway.rows(TABLES.SERVICE_PACKAGES).size, 1);
      assert.equal(gateway.rows(TABLES.SERVICE_REVISIONS).size, 1);
      assert.equal(gateway.rows(TABLES.SERVICE_INSTALLATIONS).size, 1);

      const replay = await catalog.requestInstallation({
        installationId: 'install-1',
        revisionId: 'rev-1',
        serviceDefinitionId: 'service-definition-1',
        desiredState: SERVICE_INSTALL_DESIRED_STATE.ACTIVE,
        operationId: 'operation-1',
      });
      assert.deepEqual(replay, first);
      assert.equal(gateway.rows(TABLES.SERVICE_INSTALLATIONS).size, 1);

      const restarted = createCatalog(gateway, createClock(9000));
      assert.deepEqual(await restarted.getInstallation('install-1'), first);
      assert.equal((await restarted.getPackage('pkg-1')).artifactDigest, DIGEST);
      assert.equal((await restarted.getRevision('rev-1')).packageId, 'pkg-1');
    });

  it('fails closed on missing references and immutable identity conflicts',
    async () => {
      const gateway = new DurableCatalogGateway();
      const catalog = createCatalog(gateway);

      await assert.rejects(
        catalog.recordRevision({
          revisionId: 'missing-revision',
          packageId: 'missing-package',
          config: {},
        }),
        (error) => assertCode(
          error, SERVICE_INSTALL_CATALOG_ERROR_CODE.PACKAGE_NOT_FOUND),
      );
      await seedRevision(catalog);
      await assert.rejects(
        catalog.recordPackage({
          packageId: 'pkg-mismatched-artifact',
          manifest: manifest(),
          resolvedArtifact: resolvedArtifact({
            digest: `sha256:${'b'.repeat(64)}`,
          }),
        }),
        (error) => assertCode(
          error, SERVICE_INSTALL_CATALOG_ERROR_CODE.ARTIFACT_NOT_RESOLVED),
      );
      await assert.rejects(
        catalog.recordPackage({
          packageId: 'pkg-1',
          manifest: manifest({display_name: 'changed immutable manifest'}),
          resolvedArtifact: resolvedArtifact(),
        }),
        (error) => assertCode(
          error, SERVICE_INSTALL_CATALOG_ERROR_CODE.PACKAGE_CONFLICT),
      );
      await assert.rejects(
        catalog.recordRevision({
          revisionId: 'rev-1',
          packageId: 'pkg-1',
          config: {bucket: 'different'},
        }),
        (error) => assertCode(
          error, SERVICE_INSTALL_CATALOG_ERROR_CODE.REVISION_CONFLICT),
      );
      await assert.rejects(
        catalog.requestInstallation({
          installationId: 'missing-install',
          revisionId: 'missing-revision',
          serviceDefinitionId: 'service-definition-missing',
          desiredState: SERVICE_INSTALL_DESIRED_STATE.ACTIVE,
          operationId: 'operation-missing',
        }),
        (error) => assertCode(
          error, SERVICE_INSTALL_CATALOG_ERROR_CODE.REVISION_NOT_FOUND),
      );
      await assert.rejects(
        catalog.requestInstallation({
          installationId: 'invalid-desired-state',
          revisionId: 'rev-1',
          serviceDefinitionId: 'service-definition-invalid',
          desiredState: 'running',
          operationId: 'operation-invalid',
        }),
        (error) => assertCode(
          error, SERVICE_INSTALL_CATALOG_ERROR_CODE.INVALID_FIELD),
      );
    });

  it('binds operation replay to one unchanged installation intent', async () => {
    const gateway = new DurableCatalogGateway();
    const catalog = createCatalog(gateway);
    await seedInstallation(catalog);

    await assert.rejects(
      catalog.requestInstallation({
        installationId: 'install-1',
        revisionId: 'rev-1',
        serviceDefinitionId: 'service-definition-other',
        desiredState: SERVICE_INSTALL_DESIRED_STATE.ACTIVE,
        operationId: 'operation-1',
      }),
      (error) => assertCode(
        error, SERVICE_INSTALL_CATALOG_ERROR_CODE.INSTALLATION_CONFLICT),
    );
    await assert.rejects(
      catalog.requestInstallation({
        installationId: 'install-other',
        revisionId: 'rev-1',
        serviceDefinitionId: 'service-definition-other',
        desiredState: SERVICE_INSTALL_DESIRED_STATE.ACTIVE,
        operationId: 'operation-1',
      }),
      (error) => assertCode(
        error, SERVICE_INSTALL_CATALOG_ERROR_CODE.OPERATION_CONFLICT),
    );
  });

  it('serializes local replay and recovers concurrent durable insert races',
    async () => {
      const gateway = new BarrierCatalogGateway();
      const firstCatalog = createCatalog(gateway);
      const secondCatalog = createCatalog(gateway, createClock(5000));
      await seedRevision(firstCatalog);
      const request = {
        installationId: 'install-concurrent-replay',
        revisionId: 'rev-1',
        serviceDefinitionId: 'service-definition-concurrent-replay',
        desiredState: SERVICE_INSTALL_DESIRED_STATE.ACTIVE,
        operationId: 'operation-concurrent-replay',
      };

      const localReplay = await Promise.all([
        firstCatalog.requestInstallation(request),
        firstCatalog.requestInstallation(request),
      ]);
      assert.deepEqual(localReplay[0], localReplay[1]);

      const crossOwnerRequest = {
        ...request,
        installationId: 'install-cross-owner-replay',
        operationId: 'operation-cross-owner-replay',
      };
      gateway.barrierRead('operation_id', crossOwnerRequest.operationId);
      gateway.barrierRead('installation_id', crossOwnerRequest.installationId);
      const crossOwnerReplay = await Promise.all([
        firstCatalog.requestInstallation(crossOwnerRequest),
        secondCatalog.requestInstallation(crossOwnerRequest),
      ]);
      assert.deepEqual(crossOwnerReplay[0], crossOwnerReplay[1]);
      assert.equal(gateway.rows(TABLES.SERVICE_INSTALLATIONS).size, 2);
    });

  it('recovers idempotently when applied write responses are lost', async () => {
    const gateway = new DurableCatalogGateway();
    const catalog = createCatalog(gateway);
    await seedRevision(catalog);
    gateway.loseNextInsertResponse(TABLES.SERVICE_INSTALLATIONS);
    const installed = await catalog.requestInstallation({
      installationId: 'install-late-success',
      revisionId: 'rev-1',
      serviceDefinitionId: 'service-definition-late-success',
      desiredState: SERVICE_INSTALL_DESIRED_STATE.ACTIVE,
      operationId: 'operation-late-success',
    });
    assert.equal(installed.rolloutState,
      SERVICE_INSTALL_ROLLOUT_STATE.RECORDED_NOT_RUNNING);

    gateway.loseNextUpdateResponse(TABLES.SERVICE_INSTALLATIONS);
    const updated = await catalog.recordRolloutOutcome({
      installationId: 'install-late-success',
      rolloutState: SERVICE_INSTALL_ROLLOUT_STATE.PENDING,
    });
    assert.equal(updated.rolloutState, SERVICE_INSTALL_ROLLOUT_STATE.PENDING);
    assert.deepEqual(
      await catalog.getInstallation('install-late-success'),
      updated,
    );
  });

  it('completes a partial failure insert only while its pointer is absent',
    async () => {
      const gateway = new DurableCatalogGateway();
      const catalog = createCatalog(gateway);
      await seedInstallation(catalog);
      const failure = {
        failureId: 'failure-partial',
        installationId: 'install-1',
        failureCode: SERVICE_INSTALL_FAILURE_CODE.RECONCILIATION_FAILED,
        failurePhase: SERVICE_INSTALL_FAILURE_PHASE.RECONCILIATION,
        retryable: true,
      };
      gateway.rejectNextUpdateBeforeApply(TABLES.SERVICE_INSTALLATIONS);
      await assert.rejects(
        catalog.recordFailure(failure),
        /update rejected before apply/,
      );
      assert.ok(await catalog.getFailure('failure-partial'));
      assert.equal(
        (await catalog.getInstallation('install-1')).latestFailureId,
        null,
      );

      const completed = await catalog.recordFailure(failure);
      assert.equal(completed.installation.latestFailureId, 'failure-partial');
      assert.equal(
        (await catalog.getInstallation('install-1')).latestFailureId,
        'failure-partial',
      );
    });

  it('types concurrent installation and operation identity conflicts',
    async () => {
      const gateway = new BarrierCatalogGateway();
      const firstCatalog = createCatalog(gateway);
      const secondCatalog = createCatalog(gateway, createClock(5000));
      await seedRevision(firstCatalog);
      const sameInstallation = {
        installationId: 'install-concurrent-conflict',
        revisionId: 'rev-1',
        serviceDefinitionId: 'service-definition-concurrent-conflict',
        desiredState: SERVICE_INSTALL_DESIRED_STATE.ACTIVE,
      };
      gateway.barrierRead('installation_id', sameInstallation.installationId);
      const installationConflict = await Promise.allSettled([
        firstCatalog.requestInstallation({
          ...sameInstallation,
          operationId: 'operation-concurrent-a',
        }),
        secondCatalog.requestInstallation({
          ...sameInstallation,
          operationId: 'operation-concurrent-b',
        }),
      ]);
      assert.deepEqual(
        installationConflict.map((result) => result.status).sort(),
        ['fulfilled', 'rejected'],
      );
      const rejectedInstallation = installationConflict.find(
        (result) => result.status === 'rejected');
      assertCode(
        rejectedInstallation.reason,
        SERVICE_INSTALL_CATALOG_ERROR_CODE.INSTALLATION_CONFLICT,
      );

      const operationId = 'operation-concurrent-shared';
      gateway.barrierRead('operation_id', operationId);
      const operationConflict = await Promise.allSettled([
        firstCatalog.requestInstallation({
          ...sameInstallation,
          installationId: 'install-operation-a',
          operationId,
        }),
        secondCatalog.requestInstallation({
          ...sameInstallation,
          installationId: 'install-operation-b',
          operationId,
        }),
      ]);
      assert.deepEqual(
        operationConflict.map((result) => result.status).sort(),
        ['fulfilled', 'rejected'],
      );
      const rejectedOperation = operationConflict.find(
        (result) => result.status === 'rejected');
      assertCode(
        rejectedOperation.reason,
        SERVICE_INSTALL_CATALOG_ERROR_CODE.OPERATION_CONFLICT,
      );
    });

  it('uses durable compare-and-swap for concurrent rollout transitions',
    async () => {
      const gateway = new BarrierCatalogGateway();
      const firstCatalog = createCatalog(gateway);
      const secondCatalog = createCatalog(gateway, createClock(5000));
      await seedInstallation(firstCatalog);
      gateway.barrierUpdate(TABLES.SERVICE_INSTALLATIONS);

      const outcomes = await Promise.allSettled([
        firstCatalog.recordRolloutOutcome({
          installationId: 'install-1',
          rolloutState: SERVICE_INSTALL_ROLLOUT_STATE.PENDING,
        }),
        secondCatalog.recordRolloutOutcome({
          installationId: 'install-1',
          rolloutState: SERVICE_INSTALL_ROLLOUT_STATE.REMOVING,
        }),
      ]);
      assert.deepEqual(
        outcomes.map((result) => result.status).sort(),
        ['fulfilled', 'rejected'],
      );
      const winner = outcomes.find((result) => result.status === 'fulfilled');
      const loser = outcomes.find((result) => result.status === 'rejected');
      assertCode(
        loser.reason,
        SERVICE_INSTALL_CATALOG_ERROR_CODE.CONCURRENT_MODIFICATION,
      );
      assert.equal(
        (await firstCatalog.getInstallation('install-1')).rolloutState,
        winner.value.rolloutState,
      );
    });

  it('does not let concurrent failures overwrite the winning latest failure',
    async () => {
      const gateway = new BarrierCatalogGateway();
      const firstCatalog = createCatalog(gateway);
      const secondCatalog = createCatalog(gateway, createClock(5000));
      await seedInstallation(firstCatalog);
      gateway.barrierUpdate(TABLES.SERVICE_INSTALLATIONS);
      const baseFailure = {
        installationId: 'install-1',
        failureCode: SERVICE_INSTALL_FAILURE_CODE.RECONCILIATION_FAILED,
        failurePhase: SERVICE_INSTALL_FAILURE_PHASE.RECONCILIATION,
        retryable: true,
      };

      const outcomes = await Promise.allSettled([
        firstCatalog.recordFailure({...baseFailure, failureId: 'failure-a'}),
        secondCatalog.recordFailure({...baseFailure, failureId: 'failure-b'}),
      ]);
      assert.deepEqual(
        outcomes.map((result) => result.status).sort(),
        ['fulfilled', 'rejected'],
      );
      const winner = outcomes.find((result) => result.status === 'fulfilled');
      const loser = outcomes.find((result) => result.status === 'rejected');
      assertCode(
        loser.reason,
        SERVICE_INSTALL_CATALOG_ERROR_CODE.CONCURRENT_MODIFICATION,
      );
      const installed = await firstCatalog.getInstallation('install-1');
      assert.equal(installed.latestFailureId, winner.value.failure.failureId);
      assert.equal(gateway.rows(TABLES.SERVICE_INSTALL_FAILURES).size, 2);

      const losingFailureId = winner.value.failure.failureId === 'failure-a' ?
        'failure-b' : 'failure-a';
      const replay = await firstCatalog.recordFailure({
        ...baseFailure,
        failureId: losingFailureId,
      });
      assert.equal(
        replay.installation.latestFailureId,
        winner.value.failure.failureId,
      );
      assert.equal(
        (await firstCatalog.getInstallation('install-1')).latestFailureId,
        winner.value.failure.failureId,
      );
    });

  it('rejects actual-state inputs and never projects corrupt running state',
    async () => {
      const gateway = new DurableCatalogGateway();
      const catalog = createCatalog(gateway);
      await seedRevision(catalog);

      for (const actualField of ['running', 'nodeId', 'health_status']) {
        await assert.rejects(
          catalog.requestInstallation({
            installationId: 'guarded-install',
            revisionId: 'rev-1',
            serviceDefinitionId: 'guarded-service',
            desiredState: SERVICE_INSTALL_DESIRED_STATE.ACTIVE,
            operationId: 'guarded-operation',
            [actualField]: actualField === 'running' ? true : 'spoofed',
          }),
          (error) => assertCode(error,
            SERVICE_INSTALL_CATALOG_ERROR_CODE.ACTUAL_STATE_FIELD_FORBIDDEN),
        );
      }

      await seedInstallation(catalog, '2');
      await assert.rejects(
        catalog.recordRolloutOutcome({
          installationId: 'install-2',
          rolloutState: 'running',
        }),
        (error) => assertCode(
          error, SERVICE_INSTALL_CATALOG_ERROR_CODE.INVALID_FIELD),
      );
      gateway.corrupt(TABLES.SERVICE_INSTALLATIONS, 'install-2', {
        rollout_state: 'running',
      });
      await assert.rejects(
        catalog.getInstallation('install-2'),
        (error) => assertCode(
          error, SERVICE_INSTALL_CATALOG_ERROR_CODE.CORRUPT_RECORD),
      );
    });

  it('records closed rollout transitions and durable typed failures', async () => {
    const gateway = new DurableCatalogGateway();
    const catalog = createCatalog(gateway);
    await seedInstallation(catalog);

    for (const rolloutState of [
      SERVICE_INSTALL_ROLLOUT_STATE.PENDING,
      SERVICE_INSTALL_ROLLOUT_STATE.RECONCILING,
      SERVICE_INSTALL_ROLLOUT_STATE.CONVERGED,
    ]) {
      const outcome = await catalog.recordRolloutOutcome({
        installationId: 'install-1',
        rolloutState,
      });
      assert.equal(outcome.rolloutState, rolloutState);
      assert.equal(Object.hasOwn(outcome, 'running'), false);
    }
    await assert.rejects(
      catalog.recordRolloutOutcome({
        installationId: 'install-1',
        rolloutState: SERVICE_INSTALL_ROLLOUT_STATE.PENDING,
      }),
      (error) => assertCode(
        error, SERVICE_INSTALL_CATALOG_ERROR_CODE.INVALID_TRANSITION),
    );

    const result = await catalog.recordFailure({
      failureId: 'failure-1',
      installationId: 'install-1',
      failureCode: SERVICE_INSTALL_FAILURE_CODE.HEALTH_CHECK_FAILED,
      failurePhase: SERVICE_INSTALL_FAILURE_PHASE.HEALTH,
      retryable: true,
    });
    assert.equal(result.failure.code,
      SERVICE_INSTALL_FAILURE_CODE.HEALTH_CHECK_FAILED);
    assert.equal(result.installation.rolloutState,
      SERVICE_INSTALL_ROLLOUT_STATE.FAILED);
    assert.equal(result.installation.latestFailureId, 'failure-1');

    const restarted = createCatalog(gateway, createClock(8000));
    assert.deepEqual(await restarted.getFailure('failure-1'), result.failure);
    assert.deepEqual(
      await restarted.getInstallation('install-1'), result.installation);

    await assert.rejects(
      catalog.recordFailure({
        failureId: 'failure-1',
        installationId: 'install-1',
        failureCode: SERVICE_INSTALL_FAILURE_CODE.ROLLOUT_TIMEOUT,
        failurePhase: SERVICE_INSTALL_FAILURE_PHASE.HEALTH,
        retryable: true,
      }),
      (error) => assertCode(
        error, SERVICE_INSTALL_CATALOG_ERROR_CODE.FAILURE_CONFLICT),
    );

    await assert.rejects(
      catalog.recordFailure({
        failureId: 'failure-unknown-code',
        installationId: 'install-1',
        failureCode: 'provider_exploded',
        failurePhase: SERVICE_INSTALL_FAILURE_PHASE.RECONCILIATION,
        retryable: true,
      }),
      (error) => assertCode(
        error, SERVICE_INSTALL_CATALOG_ERROR_CODE.INVALID_FIELD),
    );

    await assert.rejects(
      catalog.recordFailure({
        failureId: 'failure-with-message',
        installationId: 'install-1',
        failureCode: SERVICE_INSTALL_FAILURE_CODE.ROLLOUT_TIMEOUT,
        failurePhase: SERVICE_INSTALL_FAILURE_PHASE.RECONCILIATION,
        retryable: true,
        message: 'provider token must never be stored',
      }),
      (error) => assertCode(
        error, SERVICE_INSTALL_CATALOG_ERROR_CODE.INVALID_FIELD),
    );
  });

  it('fails closed when authoritative gateway results are malformed', async () => {
    const gateway = new DurableCatalogGateway();
    gateway.readOverride = {success: false, error: 'owner unavailable'};
    const catalog = createCatalog(gateway);
    await assert.rejects(
      catalog.getPackage('pkg-unavailable'),
      (error) => assertCode(
        error, SERVICE_INSTALL_CATALOG_ERROR_CODE.CORRUPT_RECORD),
    );
  });
});
