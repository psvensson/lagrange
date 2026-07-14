import {describe, it} from 'node:test';
import assert from 'node:assert/strict';

import {TABLES} from '../../src/constants/index.js';
import {createSystemMetadataOwners} from
  '../../src/control-plane/owners/index.js';
import {SERVICE_LIFECYCLE_COMMAND} from
  '../../src/service/service-lifecycle-command-contract.js';
import {
  SERVICE_LIFECYCLE_COMMAND_ERROR_CODE,
  SERVICE_LIFECYCLE_DEFAULT_SIGNATURE_POLICY,
  ServiceLifecycleCommandOwner,
} from '../../src/service/service-lifecycle-command-owner.js';

const DIGEST_A = `sha256:${'a'.repeat(64)}`;
const DIGEST_B = `sha256:${'b'.repeat(64)}`;
const CONTAINER_MEDIA_TYPE = 'application/vnd.oci.image.manifest.v1+json';
const CATALOG_TABLES = Object.freeze([
  TABLES.SERVICE_PACKAGES,
  TABLES.SERVICE_REVISIONS,
  TABLES.SERVICE_INSTALLATIONS,
  TABLES.SERVICE_INSTALL_FAILURES,
]);

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

class LifecycleCatalogGateway {
  constructor() {
    this.tables = new Map(CATALOG_TABLES.map((table) => [table, new Map()]));
  }

  primaryKey(table) {
    return {
      [TABLES.SERVICE_PACKAGES]: 'package_id',
      [TABLES.SERVICE_REVISIONS]: 'revision_id',
      [TABLES.SERVICE_INSTALLATIONS]: 'installation_id',
      [TABLES.SERVICE_INSTALL_FAILURES]: 'failure_id',
    }[table];
  }

  async readAuthoritativeRows(table, sql, params) {
    const rows = [...this.tables.get(table).values()];
    const match = / WHERE ([a-z_]+) = \?$/u.exec(sql);
    return {
      success: true,
      rows: clone(match ?
        rows.filter((row) => row[match[1]] === params[0]) :
        rows),
    };
  }

  async insertSystemTableRow(table, row) {
    const rows = this.tables.get(table);
    const key = row[this.primaryKey(table)];
    if (rows.has(key)) return {success: false, error: 'duplicate key'};
    if (table === TABLES.SERVICE_INSTALLATIONS &&
        [...rows.values()].some((entry) =>
          entry.operation_id === row.operation_id)) {
      return {success: false, error: 'duplicate operation'};
    }
    rows.set(key, clone(row));
    return {success: true, affectedRows: 1};
  }

  async updateSystemTableRow(table, where, data) {
    let affectedRows = 0;
    for (const [key, row] of this.tables.get(table)) {
      if (!Object.entries(where).every(([field, value]) =>
        row[field] === value)) continue;
      this.tables.get(table).set(key, clone({...row, ...data}));
      affectedRows += 1;
    }
    return {success: true, affectedRows};
  }

  async upsertSystemTableRow(table, row) {
    this.tables.get(table).set(row[this.primaryKey(table)], clone(row));
    return {success: true, affectedRows: 1};
  }

  async deleteSystemTableRow(table, where) {
    let affectedRows = 0;
    for (const [key, row] of this.tables.get(table)) {
      if (!Object.entries(where).every(([field, value]) =>
        row[field] === value)) continue;
      this.tables.get(table).delete(key);
      affectedRows += 1;
    }
    return {success: true, affectedRows};
  }

  rowCount(table) {
    return this.tables.get(table).size;
  }
}

class FixtureArtifactResolver {
  constructor(options = {}) {
    this.reject = options.reject === true;
    this.calls = [];
  }

  async resolve(request) {
    this.calls.push(request);
    if (this.reject) {
      return Object.freeze({
        status: 'rejected',
        errors: Object.freeze([Object.freeze({
          code: 'digest_mismatch',
          path: '/artifact/descriptor/digest',
          message: 'fixture digest mismatch',
        })]),
      });
    }
    return Object.freeze({
      status: 'resolved',
      artifact: Object.freeze({
        digest: request.manifest.artifact.digest,
        payloadMediaType: request.manifest.artifact.media_type,
        signature: Object.freeze({
          status: 'unsigned_allowed',
          keyId: null,
        }),
      }),
    });
  }
}

function manifest(version = '1.0.0', digest = DIGEST_A) {
  return {
    schema_version: 1,
    name: 'analytics-worker',
    version,
    artifact: {
      type: 'oci',
      ref: `registry.example.test/analytics-worker@${digest}`,
      digest,
      media_type: CONTAINER_MEDIA_TYPE,
    },
    runtime: {kind: 'oci_container'},
  };
}

function installPayload(overrides = {}) {
  return {
    artifact_source: {kind: 'remote_oci'},
    config: {replicas: 2},
    idempotency_key: 'install-analytics-worker',
    manifest: manifest(),
    ...overrides,
  };
}

function securityContext(tenantId = 'tenant-a') {
  return Object.freeze({
    tenantId,
    principal: 'alice',
    roles: Object.freeze(['service-operator']),
  });
}

function createOwnerFixture(options = {}) {
  const gateway = new LifecycleCatalogGateway();
  let now = 1000;
  const catalogOwner = createSystemMetadataOwners({
    controlPlaneSystemTableGateway: gateway,
    now: () => now++,
  }).serviceInstallCatalogOwner;
  const artifactResolver = options.artifactResolver ||
    new FixtureArtifactResolver();
  const owner = new ServiceLifecycleCommandOwner({
    artifactResolver,
    catalogOwner,
    signaturePolicy: SERVICE_LIFECYCLE_DEFAULT_SIGNATURE_POLICY,
  });
  return {artifactResolver, catalogOwner, gateway, owner};
}

describe('service lifecycle command and catalog composition', () => {
  it('records one stable install intent and replays without resolving again',
    async () => {
      const fixture = createOwnerFixture();
      const first = await fixture.owner.execute(
        SERVICE_LIFECYCLE_COMMAND.INSTALL,
        installPayload(),
        securityContext(),
      );
      const replay = await fixture.owner.execute(
        SERVICE_LIFECYCLE_COMMAND.INSTALL,
        installPayload(),
        securityContext(),
      );

      assert.equal(first.success, true);
      assert.equal(first.rows[0].operation_status, 'durable');
      assert.equal(first.rows[0].rollout_state, 'recorded_not_running');
      assert.equal(replay.rows[0].operation_status, 'replayed');
      assert.equal(replay.rows[0].operation_id, first.rows[0].operation_id);
      assert.equal(fixture.artifactResolver.calls.length, 1);
      assert.equal(fixture.gateway.rowCount(TABLES.SERVICE_INSTALLATIONS), 1);
      assert.deepEqual(
        fixture.artifactResolver.calls[0].signaturePolicy,
        SERVICE_LIFECYCLE_DEFAULT_SIGNATURE_POLICY,
      );
    });

  it('rejects changed intent for an existing idempotency identity', async () => {
    const fixture = createOwnerFixture();
    await fixture.owner.execute(
      SERVICE_LIFECYCLE_COMMAND.INSTALL,
      installPayload(),
      securityContext(),
    );
    const result = await fixture.owner.execute(
      SERVICE_LIFECYCLE_COMMAND.INSTALL,
      installPayload({config: {replicas: 9}}),
      securityContext(),
    );

    assert.equal(result.success, false);
    assert.equal(
      result.errorCode,
      SERVICE_LIFECYCLE_COMMAND_ERROR_CODE.IDEMPOTENCY_CONFLICT,
    );
    assert.equal(fixture.artifactResolver.calls.length, 1);
    assert.equal(fixture.gateway.rowCount(TABLES.SERVICE_INSTALLATIONS), 1);

    const changedManifest = await fixture.owner.execute(
      SERVICE_LIFECYCLE_COMMAND.INSTALL,
      installPayload({manifest: {...manifest(), publisher: 'other-publisher'}}),
      securityContext(),
    );
    assert.equal(changedManifest.success, false);
    assert.equal(
      changedManifest.errorCode,
      SERVICE_LIFECYCLE_COMMAND_ERROR_CODE.IDEMPOTENCY_CONFLICT,
    );

    const changedSource = await fixture.owner.execute(
      SERVICE_LIFECYCLE_COMMAND.INSTALL,
      installPayload({artifact_source: {kind: 'local_oci'}}),
      securityContext(),
    );
    assert.equal(changedSource.success, false);
    assert.equal(
      changedSource.errorCode,
      SERVICE_LIFECYCLE_COMMAND_ERROR_CODE.IDEMPOTENCY_CONFLICT,
    );
    assert.equal(fixture.artifactResolver.calls.length, 1);
    assert.equal(fixture.gateway.rowCount(TABLES.SERVICE_INSTALLATIONS), 1);
  });

  it('rejects unresolved artifacts before every catalog write', async () => {
    const artifactResolver = new FixtureArtifactResolver({reject: true});
    const fixture = createOwnerFixture({artifactResolver});
    const result = await fixture.owner.execute(
      SERVICE_LIFECYCLE_COMMAND.INSTALL,
      installPayload(),
      securityContext(),
    );

    assert.equal(result.success, false);
    assert.equal(
      result.errorCode,
      SERVICE_LIFECYCLE_COMMAND_ERROR_CODE.ARTIFACT_REJECTED,
    );
    assert.equal(fixture.gateway.rowCount(TABLES.SERVICE_PACKAGES), 0);
    assert.equal(fixture.gateway.rowCount(TABLES.SERVICE_REVISIONS), 0);
    assert.equal(fixture.gateway.rowCount(TABLES.SERVICE_INSTALLATIONS), 0);
  });

  it('records upgrade and removal desired state and projects catalog truth',
    async () => {
      const fixture = createOwnerFixture();
      const installed = await fixture.owner.execute(
        SERVICE_LIFECYCLE_COMMAND.INSTALL,
        installPayload(),
        securityContext(),
      );
      const upgraded = await fixture.owner.execute(
        SERVICE_LIFECYCLE_COMMAND.UPGRADE,
        installPayload({
          idempotency_key: 'upgrade-analytics-worker',
          manifest: manifest('2.0.0', DIGEST_B),
        }),
        securityContext(),
      );
      const removed = await fixture.owner.execute(
        SERVICE_LIFECYCLE_COMMAND.REMOVE,
        {
          idempotency_key: 'remove-analytics-worker',
          service_name: 'analytics-worker',
        },
        securityContext(),
      );
      const status = await fixture.owner.execute(
        SERVICE_LIFECYCLE_COMMAND.SHOW_ONE,
        {service_name: 'analytics-worker'},
        securityContext(),
      );

      assert.equal(installed.success, true);
      assert.equal(upgraded.success, true);
      assert.notEqual(
        upgraded.rows[0].revision_id,
        installed.rows[0].revision_id,
      );
      assert.equal(removed.rows[0].desired_state, 'removed');
      assert.equal(removed.rows[0].revision_id, upgraded.rows[0].revision_id);
      assert.equal(status.rows[0].desired_state, 'removed');
      assert.equal(status.rows[0].rollout_state, 'recorded_not_running');
      assert.equal(Object.hasOwn(status.rows[0], 'running'), false);
    });

  it('derives tenant-scoped identities and tenant-filtered status', async () => {
    const fixture = createOwnerFixture();
    const tenantA = await fixture.owner.execute(
      SERVICE_LIFECYCLE_COMMAND.INSTALL,
      installPayload(),
      securityContext('tenant-a'),
    );
    const tenantB = await fixture.owner.execute(
      SERVICE_LIFECYCLE_COMMAND.INSTALL,
      installPayload(),
      securityContext('tenant-b'),
    );
    const tenantAList = await fixture.owner.execute(
      SERVICE_LIFECYCLE_COMMAND.SHOW_ALL,
      {},
      securityContext('tenant-a'),
    );
    const tenantBList = await fixture.owner.execute(
      SERVICE_LIFECYCLE_COMMAND.SHOW_ALL,
      {},
      securityContext('tenant-b'),
    );

    assert.notEqual(
      tenantA.rows[0].service_definition_id,
      tenantB.rows[0].service_definition_id,
    );
    assert.equal(tenantAList.rows.length, 1);
    assert.equal(tenantBList.rows.length, 1);
    assert.equal(
      tenantAList.rows[0].service_definition_id,
      tenantA.rows[0].service_definition_id,
    );
    assert.equal(
      tenantBList.rows[0].service_definition_id,
      tenantB.rows[0].service_definition_id,
    );
  });
});
