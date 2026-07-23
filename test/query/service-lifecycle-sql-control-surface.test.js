import {describe, it} from 'node:test';
import assert from 'node:assert/strict';

import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {TABLES} from '../../src/constants/index.js';
import {createSystemMetadataOwners} from
  '../../src/control-plane/owners/index.js';
import {
  SERVICE_INSTALL_CATALOG_ERROR_CODE,
  ServiceInstallCatalogError,
} from '../../src/control-plane/owners/service-install-catalog-owner.js';
import {PostgresWireAdapter} from
  '../../src/query/pg/postgres-wire-adapter.js';
import {
  SERVICE_LIFECYCLE_SQL_CLASSIFICATION,
  SERVICE_LIFECYCLE_SQL_COMMAND,
  SERVICE_LIFECYCLE_SQL_ERROR_CODE,
  classifyServiceLifecycleSql,
} from '../../src/query/service-lifecycle-sql-contract.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {createSqlRequest} from '../../src/query/sql-request.js';
import {
  PGWIRE_AUTH_ACTION,
  PGWIRE_AUTH_HANDLER_MODE,
} from '../../src/runtime/pgwire-auth-constants.js';
import {PgWireAuthHandler} from '../../src/runtime/pgwire-auth-handler.js';
import {
  SERVICE_LIFECYCLE_COMMAND_ERROR_CODE,
  SERVICE_LIFECYCLE_DEFAULT_SIGNATURE_POLICY,
  ServiceLifecycleCommandOwner,
} from '../../src/service/service-lifecycle-command-owner.js';

const DIGEST_A = `sha256:${'a'.repeat(64)}`;
const DIGEST_B = `sha256:${'b'.repeat(64)}`;
const CONTAINER_MEDIA_TYPE = 'application/vnd.oci.image.manifest.v1+json';
const CATALOG_TABLES = Object.freeze([
  TABLES.SERVICE_BINDINGS,
  TABLES.SERVICE_DEFINITIONS,
  TABLES.SERVICE_ENDPOINTS,
  TABLES.SERVICE_PACKAGES,
  TABLES.SERVICE_REVISIONS,
  TABLES.SERVICE_INSTALLATIONS,
  TABLES.SERVICE_INSTALL_FAILURES,
  TABLES.SERVICES,
]);
const LIFECYCLE_ACTIONS = Object.freeze([
  PGWIRE_AUTH_ACTION.BINDING_CREATE,
  PGWIRE_AUTH_ACTION.EXECUTE_QUERY,
  PGWIRE_AUTH_ACTION.SERVICE_INSTALL,
  PGWIRE_AUTH_ACTION.SERVICE_READ,
  PGWIRE_AUTH_ACTION.SERVICE_REMOVE,
  PGWIRE_AUTH_ACTION.SERVICE_UPGRADE,
]);
const silentLogger = Object.freeze({
  debug() {},
  error() {},
  info() {},
  warn() {},
});

const configuration = ConfigurationManager.getInstance();
if (!configuration.isInitialized()) configuration.initialize();

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
      [TABLES.SERVICE_BINDINGS]: 'binding_version_id',
      [TABLES.SERVICE_DEFINITIONS]: 'service_id',
      [TABLES.SERVICE_ENDPOINTS]: 'endpoint_id',
      [TABLES.SERVICE_REVISIONS]: 'revision_id',
      [TABLES.SERVICE_INSTALLATIONS]: 'installation_id',
      [TABLES.SERVICE_INSTALL_FAILURES]: 'failure_id',
      [TABLES.SERVICES]: 'service_id',
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

  rows(table) {
    return [...this.tables.get(table).values()].map(clone);
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

function v2Manifest(exports_) {
  return {
    ...manifest(),
    schema_version: 2,
    exports: exports_,
  };
}

function installPayload(overrides = {}) {
  return JSON.stringify({
    artifact_source: {kind: 'remote_oci'},
    config: {replicas: 2},
    idempotency_key: 'install-analytics-worker',
    manifest: manifest(),
    ...overrides,
  });
}

function createSystemCache() {
  return {
    filter() {
      return [];
    },
    get() {
      return null;
    },
    getAll() {
      return [];
    },
  };
}

function createEngineFixture(options = {}) {
  const gateway = new LifecycleCatalogGateway();
  let now = 1000;
  const systemMetadataOwners = createSystemMetadataOwners({
    controlPlaneSystemTableGateway: gateway,
    now: () => now++,
  });
  const catalogOwner = systemMetadataOwners.serviceInstallCatalogOwner;
  const bindingOwner = systemMetadataOwners.deploymentBindingOwner;
  const artifactResolver = options.artifactResolver ||
    new FixtureArtifactResolver();
  const commandOwner = new ServiceLifecycleCommandOwner({
    artifactResolver,
    bindingOwner,
    catalogOwner,
    signaturePolicy: SERVICE_LIFECYCLE_DEFAULT_SIGNATURE_POLICY,
  });
  const engine = new SQLQueryEngine({
    systemCache: createSystemCache(),
    messageRouter: {deliver: async () => ({success: true})},
    autoStartDistributedTransactionRecovery: false,
  });
  engine.setServiceLifecycleCommandOwner(commandOwner);
  return {
    artifactResolver,
    bindingOwner,
    catalogOwner,
    commandOwner,
    engine,
    gateway,
  };
}

function createAuthHandler(allowedActions = LIFECYCLE_ACTIONS) {
  return new PgWireAuthHandler({
    mode: PGWIRE_AUTH_HANDLER_MODE.PASSWORD,
    authenticator: async () => ({
      authenticated: true,
      roles: ['service-operator'],
    }),
    policy: {allowedActions: new Set(allowedActions)},
    logger: silentLogger,
  });
}

async function createAuthenticatedAdapter(engine, options = {}) {
  const adapter = new PostgresWireAdapter({
    sqlCore: engine,
    authHandler: options.authHandler || createAuthHandler(),
    logger: silentLogger,
  });
  await adapter.authenticate(options.sessionId || 'session-1', {
    tenantId: options.tenantId || 'tenant-a',
    user: options.user || 'alice',
    password: 'fixture-password',
  });
  return adapter;
}

describe('service lifecycle SQL classification and security boundary', () => {
  it('classifies every lifecycle family before parsing', () => {
    assert.equal(
      classifyServiceLifecycleSql('CREATE BINDING $1').command,
      SERVICE_LIFECYCLE_SQL_COMMAND.CREATE_BINDING,
    );
    assert.equal(
      classifyServiceLifecycleSql('INSTALL SERVICE $1').command,
      SERVICE_LIFECYCLE_SQL_COMMAND.INSTALL,
    );
    assert.equal(
      classifyServiceLifecycleSql('UPGRADE SERVICE $1').command,
      SERVICE_LIFECYCLE_SQL_COMMAND.UPGRADE,
    );
    assert.equal(
      classifyServiceLifecycleSql('REMOVE SERVICE $1').command,
      SERVICE_LIFECYCLE_SQL_COMMAND.REMOVE,
    );
    assert.equal(
      classifyServiceLifecycleSql('SHOW SERVICE $1').command,
      SERVICE_LIFECYCLE_SQL_COMMAND.SHOW_ONE,
    );
    assert.equal(
      classifyServiceLifecycleSql('SHOW SERVICES').command,
      SERVICE_LIFECYCLE_SQL_COMMAND.SHOW_ALL,
    );
    assert.equal(
      classifyServiceLifecycleSql('INSTALL malformed').command,
      SERVICE_LIFECYCLE_SQL_COMMAND.INSTALL,
    );
    assert.equal(
      classifyServiceLifecycleSql('/* lead */ INSTALL SERVICE $1').command,
      SERVICE_LIFECYCLE_SQL_COMMAND.INSTALL,
    );
    assert.equal(
      classifyServiceLifecycleSql('-- lead\nSHOW SERVICES').command,
      SERVICE_LIFECYCLE_SQL_COMMAND.SHOW_ALL,
    );
    assert.equal(
      classifyServiceLifecycleSql(
        '/* outer /* inner */ outer */ INSTALL SERVICE $1',
      ).command,
      SERVICE_LIFECYCLE_SQL_COMMAND.INSTALL,
    );
    assert.equal(
      classifyServiceLifecycleSql(
        '/* first */ /* second */\r\nREMOVE SERVICE $1',
      ).command,
      SERVICE_LIFECYCLE_SQL_COMMAND.REMOVE,
    );
    assert.equal(
      classifyServiceLifecycleSql(
        '/* unterminated INSTALL SERVICE $1',
      ).kind,
      SERVICE_LIFECYCLE_SQL_CLASSIFICATION.ORDINARY,
    );
  });

  it('rejects unauthenticated and generic-only sessions before owner dispatch',
    async () => {
      let ownerCalls = 0;
      const sqlCore = {
        async executeRequest() {
          ownerCalls += 1;
          return {success: true};
        },
      };
      const adapter = new PostgresWireAdapter({
        sqlCore,
        authHandler: createAuthHandler([
          PGWIRE_AUTH_ACTION.EXECUTE_QUERY,
        ]),
        logger: silentLogger,
      });
      await assert.rejects(
        adapter.execute('missing', 'INSTALL SERVICE $1', [installPayload()]),
        /authenticated/iu,
      );
      await adapter.authenticate('generic-session', {
        tenantId: 'tenant-a',
        user: 'alice',
        password: 'fixture-password',
      });
      await assert.rejects(
        adapter.execute(
          'generic-session', 'INSTALL SERVICE $1', [installPayload()],
        ),
        /authorized/iu,
      );
      await assert.rejects(
        adapter.execute('generic-session', 'SHOW SERVICES'),
        /authorized/iu,
      );
      await assert.rejects(
        adapter.execute('generic-session', 'CREATE BINDING $1', ['{}']),
        /authorized/iu,
      );
      await assert.rejects(
        adapter.execute(
          'generic-session',
          '/* lead */ INSTALL SERVICE $1',
          [installPayload()],
        ),
        /authorized/iu,
      );
      await assert.rejects(
        adapter.execute(
          'generic-session',
          '-- lead\nINSTALL SERVICE $1',
          [installPayload()],
        ),
        /authorized/iu,
      );
      await assert.rejects(
        adapter.execute(
          'generic-session',
          '/* outer /* inner */ outer */ INSTALL SERVICE $1',
          [installPayload()],
        ),
        /authorized/iu,
      );
      assert.equal(ownerCalls, 0);
    });

  it('requires canonical server context even through direct engine execution',
    async () => {
      const {engine, gateway} = createEngineFixture();
      const result = await engine.executeRequest(createSqlRequest({
        tenantId: 'system',
        sessionId: 'direct-session',
        statement: 'INSTALL SERVICE $1',
        parameters: [installPayload()],
        executionMode: 'sql_statement',
        dialect: 'postgresql',
      }));
      assert.equal(result.success, false);
      assert.equal(
        result.errorCode,
        'service_lifecycle_security_context_required',
      );
      assert.equal(gateway.rowCount(TABLES.SERVICE_INSTALLATIONS), 0);
    });

  it('rejects malformed grammar and identity or policy spoof fields', async () => {
    const {engine, gateway} = createEngineFixture();
    const adapter = await createAuthenticatedAdapter(engine);
    const malformed = await adapter.execute(
      'session-1', 'INSTALL SERVICE $1 EXTRA', [installPayload()],
    );
    assert.equal(malformed.success, false);
    assert.equal(
      malformed.errorCode,
      SERVICE_LIFECYCLE_SQL_ERROR_CODE.INVALID_GRAMMAR,
    );
    const commented = await adapter.execute(
      'session-1',
      '/* lead */ INSTALL SERVICE $1',
      [installPayload()],
    );
    assert.equal(commented.success, false);
    assert.equal(
      commented.errorCode,
      SERVICE_LIFECYCLE_SQL_ERROR_CODE.INVALID_GRAMMAR,
    );
    const nestedCommented = await adapter.execute(
      'session-1',
      '/* outer /* inner */ outer */ INSTALL SERVICE $1',
      [installPayload()],
    );
    assert.equal(nestedCommented.success, false);
    assert.equal(
      nestedCommented.errorCode,
      SERVICE_LIFECYCLE_SQL_ERROR_CODE.INVALID_GRAMMAR,
    );
    for (const spoofedField of [
      'operation_id', 'principal', 'roles', 'service_definition_id',
      'signature_policy', 'tenant_id',
    ]) {
      const payload = JSON.parse(installPayload());
      payload[spoofedField] = 'attacker-value';
      const result = await adapter.execute(
        'session-1', 'INSTALL SERVICE $1', [JSON.stringify(payload)],
      );
      assert.equal(result.success, false, spoofedField);
      assert.equal(
        result.errorCode,
        SERVICE_LIFECYCLE_SQL_ERROR_CODE.INVALID_PAYLOAD,
        spoofedField,
      );
    }
    assert.equal(gateway.rowCount(TABLES.SERVICE_INSTALLATIONS), 0);
  });

  it('rejects malformed JSON and parameter-count ambiguity', async () => {
    const {engine, gateway} = createEngineFixture();
    const adapter = await createAuthenticatedAdapter(engine);
    const malformed = await adapter.execute(
      'session-1', 'INSTALL SERVICE $1', ['{not-json'],
    );
    assert.equal(malformed.success, false);
    assert.equal(
      malformed.errorCode,
      SERVICE_LIFECYCLE_SQL_ERROR_CODE.INVALID_PAYLOAD,
    );
    const extra = await adapter.execute(
      'session-1', 'INSTALL SERVICE $1', [installPayload(), '{}'],
    );
    assert.equal(extra.success, false);
    assert.equal(
      extra.errorCode,
      SERVICE_LIFECYCLE_SQL_ERROR_CODE.INVALID_PARAMETER,
    );
    assert.equal(gateway.rowCount(TABLES.SERVICE_INSTALLATIONS), 0);
  });

  it('returns a typed failure when the command owner is not composed',
    async () => {
      const engine = new SQLQueryEngine({
        systemCache: createSystemCache(),
        messageRouter: {deliver: async () => ({success: true})},
        autoStartDistributedTransactionRecovery: false,
      });
      const adapter = await createAuthenticatedAdapter(engine);
      const result = await adapter.execute(
        'session-1', 'INSTALL SERVICE $1', [installPayload()],
      );
      assert.equal(result.success, false);
      assert.equal(
        result.errorCode,
        'service_lifecycle_command_owner_unavailable',
      );
    });

  it('rejects lifecycle mutation inside a SQL transaction', async () => {
    const {engine, gateway} = createEngineFixture();
    const adapter = await createAuthenticatedAdapter(engine);
    const begin = await adapter.execute('session-1', 'BEGIN');
    assert.equal(begin.success, true);
    const result = await adapter.execute(
      'session-1', 'INSTALL SERVICE $1', [installPayload()],
    );
    assert.equal(result.success, false);
    assert.equal(
      result.errorCode,
      'service_lifecycle_transaction_unsupported',
    );
    assert.equal(gateway.rowCount(TABLES.SERVICE_INSTALLATIONS), 0);
    const binding = await adapter.execute(
      'session-1', 'CREATE BINDING $1', ['{}'],
    );
    assert.equal(
      binding.errorCode,
      'service_lifecycle_transaction_unsupported',
    );
    assert.equal(gateway.rowCount(TABLES.SERVICE_BINDINGS), 0);
    const rollback = await adapter.execute('session-1', 'ROLLBACK');
    assert.equal(rollback.success, true);
  });
});

describe('service lifecycle SQL durable owner route', () => {
  it('persists Binding v1 through authenticated CREATE BINDING ' +
    '(red-on-revert owner engagement)', async () => {
    const fixture = createEngineFixture();
    const adapter = await createAuthenticatedAdapter(fixture.engine);
    const installed = await adapter.execute(
      'session-1',
      'INSTALL SERVICE $1',
      [installPayload({
        manifest: {
          ...v2Manifest([{
            name: 'serve',
            interface: 'request_v1',
            reads: ['table:global.orders'],
            writes: ['table:global.audit'],
          }]),
          capabilities: ['network.client', 'clock.read'],
        },
      })],
    );
    assert.equal(installed.success, true);
    const [packageRow] = fixture.gateway.rows(TABLES.SERVICE_PACKAGES);
    const package_ = await fixture.catalogOwner.getPackage(packageRow.package_id);
    const payload = JSON.stringify({
      schema_version: 1,
      name: 'orders-api',
      target: {
        package_id: package_.packageId,
        manifest_digest: package_.manifestDigest,
        export_name: 'serve',
      },
      source: {kind: 'request', method: 'POST', path: '/orders'},
      contexts: ['table:global.audit', 'table:global.orders'],
      budgets: {
        cpu_time_ms: 100,
        wall_time_ms: 1000,
        memory_bytes: 1048576,
        input_bytes: 4096,
        output_bytes: 4096,
        context_bytes: 8192,
      },
    });

    const spoofedPayload = JSON.parse(payload);
    spoofedPayload.tenant_id = 'attacker-selected';
    const spoofed = await adapter.execute(
      'session-1', 'CREATE BINDING $1', [JSON.stringify(spoofedPayload)]);
    assert.equal(spoofed.success, false);
    assert.equal(
      spoofed.errorCode,
      SERVICE_LIFECYCLE_SQL_ERROR_CODE.INVALID_PAYLOAD,
    );
    const widenedGrammar = await adapter.execute(
      'session-1', 'CREATE BINDING $1 RETURNING *', [payload]);
    assert.equal(widenedGrammar.success, false);
    assert.equal(
      widenedGrammar.errorCode,
      SERVICE_LIFECYCLE_SQL_ERROR_CODE.INVALID_GRAMMAR,
    );
    assert.equal(fixture.gateway.rowCount(TABLES.SERVICE_BINDINGS), 0);

    const created = await adapter.execute(
      'session-1', 'CREATE BINDING $1', [payload]);
    assert.equal(created.success, true);
    assert.equal(created.changes, 1);
    assert.equal(created.rows[0].action,
      SERVICE_LIFECYCLE_SQL_COMMAND.CREATE_BINDING);
    assert.equal(created.rows[0].operation_status, 'durable');
    assert.equal(fixture.gateway.rowCount(TABLES.SERVICE_BINDINGS), 1);
    assert.equal(fixture.gateway.rowCount(TABLES.SERVICE_DEFINITIONS), 0);
    assert.equal(fixture.gateway.rowCount(TABLES.SERVICES), 0);
    assert.equal(fixture.gateway.rowCount(TABLES.SERVICE_ENDPOINTS), 0);
    const stored = JSON.parse(
      fixture.gateway.rows(TABLES.SERVICE_BINDINGS)[0].normalized_binding);
    assert.deepEqual(stored.capabilities, ['clock.read', 'network.client']);

    const replay = await adapter.execute(
      'session-1', 'CREATE BINDING $1;', [payload]);
    assert.equal(replay.success, true);
    assert.equal(replay.changes, 0);
    assert.equal(replay.rows[0].operation_status, 'replayed');

    const tenantB = await createAuthenticatedAdapter(fixture.engine, {
      sessionId: 'tenant-b-binding-session',
      tenantId: 'tenant-b',
    });
    const crossTenant = await tenantB.execute(
      'tenant-b-binding-session', 'CREATE BINDING $1', [payload]);
    assert.equal(crossTenant.success, false);
    assert.equal(
      crossTenant.errorCode,
      SERVICE_LIFECYCLE_COMMAND_ERROR_CODE.CATALOG_REJECTED,
    );
    assert.equal(
      crossTenant.detail.ownerCode,
      SERVICE_INSTALL_CATALOG_ERROR_CODE.PACKAGE_NOT_ELIGIBLE,
    );
    assert.equal(fixture.gateway.rowCount(TABLES.SERVICE_BINDINGS), 1);
  });

  it('persists canonical v2 artifact exports through authenticated INSTALL SERVICE',
    async () => {
      const fixture = createEngineFixture();
      const adapter = await createAuthenticatedAdapter(fixture.engine);
      const result = await adapter.execute(
        'session-1',
        'INSTALL SERVICE $1',
        [installPayload({
          manifest: v2Manifest([
            {
              name: 'audit-change',
              interface: 'change_v1',
              reads: ['table:global.audit'],
              writes: ['table:global.audit'],
            },
            {
              name: 'serve',
              interface: 'request_v1',
              reads: ['table:global.orders', 'table:global.accounts'],
              writes: ['table:global.audit'],
            },
          ]),
        })],
      );
      assert.equal(result.success, true);
      const [packageRow] = fixture.gateway.rows(TABLES.SERVICE_PACKAGES);
      assert.equal(packageRow.manifest_schema_version, 2);
      assert.deepEqual(JSON.parse(packageRow.normalized_manifest).exports, [
        {
          interface: 'change_v1',
          name: 'audit-change',
          reads: ['table:global.audit'],
          writes: ['table:global.audit'],
        },
        {
          interface: 'request_v1',
          name: 'serve',
          reads: ['table:global.accounts', 'table:global.orders'],
          writes: ['table:global.audit'],
        },
      ]);

      const permuted = await adapter.execute(
        'session-1',
        'INSTALL SERVICE $1',
        [installPayload({
          idempotency_key: 'install-permuted-artifact-exports',
          manifest: v2Manifest([
            {
              name: 'serve',
              interface: 'request_v1',
              reads: ['table:global.accounts', 'table:global.orders'],
              writes: ['table:global.audit'],
            },
            {
              name: 'audit-change',
              interface: 'change_v1',
              reads: ['table:global.audit'],
              writes: ['table:global.audit'],
            },
          ]),
        })],
      );
      assert.equal(permuted.success, true);
      assert.equal(fixture.gateway.rowCount(TABLES.SERVICE_PACKAGES), 1);
      assert.equal(
        fixture.gateway.rows(TABLES.SERVICE_PACKAGES)[0].package_id,
        packageRow.package_id,
      );

      const firstIdentity = await fixture.catalogOwner.getPackage(
        packageRow.package_id);
      const changed = await adapter.execute(
        'session-1',
        'INSTALL SERVICE $1',
        [installPayload({
          idempotency_key: 'install-distinct-artifact-contract',
          manifest: v2Manifest([{
            name: 'serve-admin',
            interface: 'request_v1',
            reads: ['table:global.admin_accounts'],
            writes: [],
          }]),
        })],
      );
      assert.equal(changed.success, true);
      const packageRows = fixture.gateway.rows(TABLES.SERVICE_PACKAGES);
      assert.equal(packageRows.length, 2);
      const changedRow = packageRows.find(
        (row) => row.package_id !== packageRow.package_id);
      const changedIdentity = await fixture.catalogOwner.getPackage(
        changedRow.package_id);
      assert.notEqual(changedIdentity.packageId, firstIdentity.packageId);
      assert.notEqual(
        changedIdentity.manifestDigest, firstIdentity.manifestDigest);
      assert.deepEqual(
        (await fixture.catalogOwner.getBindableArtifact(
          firstIdentity.packageId,
          firstIdentity.manifestDigest)).manifest.exports,
        JSON.parse(packageRow.normalized_manifest).exports,
      );
      await assert.rejects(
        fixture.catalogOwner.resolveUniqueBindableArtifactByDigest(
          DIGEST_A,
          [firstIdentity.packageId, changedIdentity.packageId],
        ),
        (error) => {
          assert.ok(error instanceof ServiceInstallCatalogError);
          assert.equal(
            error.code,
            SERVICE_INSTALL_CATALOG_ERROR_CODE.AMBIGUOUS_ARTIFACT_DIGEST,
          );
          return true;
        },
      );
    });

  it('rejects malformed v2 exports before resolution or catalog writes',
    async () => {
      const fixture = createEngineFixture();
      const adapter = await createAuthenticatedAdapter(fixture.engine);
      const rejected = await adapter.execute(
        'session-1',
        'INSTALL SERVICE $1',
        [installPayload({
          idempotency_key: 'reject-wildcard-export',
          manifest: v2Manifest([{
            name: 'serve',
            interface: 'request_v1',
            reads: ['table:global.*'],
            writes: [],
          }]),
        })],
      );
      assert.equal(rejected.success, false);
      assert.equal(fixture.artifactResolver.calls.length, 0);
      for (const table of CATALOG_TABLES) {
        assert.equal(fixture.gateway.rowCount(table), 0, table);
      }
    });

  it('records one truthful install and replays without resolving again',
    async () => {
      const fixture = createEngineFixture();
      const adapter = await createAuthenticatedAdapter(fixture.engine);
      const first = await adapter.execute(
        'session-1', 'INSTALL SERVICE $1', [installPayload()],
      );
      assert.equal(first.success, true);
      assert.equal(first.rows[0].action, SERVICE_LIFECYCLE_SQL_COMMAND.INSTALL);
      assert.equal(first.rows[0].rollout_state, 'recorded_not_running');
      assert.equal(first.rows[0].operation_status, 'durable');
      assert.equal(Object.hasOwn(first.rows[0], 'running'), false);
      assert.equal(
        fixture.gateway.rowCount(TABLES.SERVICE_INSTALLATIONS), 1,
      );
      assert.equal(fixture.artifactResolver.calls.length, 1);
      assert.deepEqual(
        fixture.artifactResolver.calls[0].signaturePolicy,
        SERVICE_LIFECYCLE_DEFAULT_SIGNATURE_POLICY,
      );

      const replay = await adapter.execute(
        'session-1', 'INSTALL SERVICE $1;', [installPayload()],
      );
      assert.equal(replay.success, true);
      assert.equal(replay.rows[0].operation_status, 'replayed');
      assert.equal(replay.rows[0].operation_id, first.rows[0].operation_id);
      assert.equal(
        fixture.gateway.rowCount(TABLES.SERVICE_INSTALLATIONS), 1,
      );
      assert.equal(fixture.artifactResolver.calls.length, 1);
    });

  it('binds idempotency to unchanged intent', async () => {
    const fixture = createEngineFixture();
    const adapter = await createAuthenticatedAdapter(fixture.engine);
    await adapter.execute(
      'session-1', 'INSTALL SERVICE $1', [installPayload()],
    );
    const changed = await adapter.execute(
      'session-1',
      'INSTALL SERVICE $1',
      [installPayload({config: {replicas: 9}})],
    );
    assert.equal(changed.success, false);
    assert.equal(
      changed.errorCode,
      SERVICE_LIFECYCLE_COMMAND_ERROR_CODE.IDEMPOTENCY_CONFLICT,
    );
    assert.equal(
      fixture.gateway.rowCount(TABLES.SERVICE_INSTALLATIONS), 1,
    );
    assert.equal(fixture.artifactResolver.calls.length, 1);
  });

  it('rejects unresolved artifacts without catalog writes', async () => {
    const artifactResolver = new FixtureArtifactResolver({reject: true});
    const fixture = createEngineFixture({artifactResolver});
    const adapter = await createAuthenticatedAdapter(fixture.engine);
    const result = await adapter.execute(
      'session-1', 'INSTALL SERVICE $1', [installPayload()],
    );
    assert.equal(result.success, false);
    assert.equal(
      result.errorCode,
      SERVICE_LIFECYCLE_COMMAND_ERROR_CODE.ARTIFACT_REJECTED,
    );
    assert.equal(result.detail.errors[0].code, 'digest_mismatch');
    assert.equal(fixture.gateway.rowCount(TABLES.SERVICE_PACKAGES), 0);
    assert.equal(fixture.gateway.rowCount(TABLES.SERVICE_REVISIONS), 0);
    assert.equal(fixture.gateway.rowCount(TABLES.SERVICE_INSTALLATIONS), 0);
  });

  it('records upgrade and removal intent and projects catalog status',
    async () => {
      const fixture = createEngineFixture();
      const adapter = await createAuthenticatedAdapter(fixture.engine);
      const installed = await adapter.execute(
        'session-1', 'INSTALL SERVICE $1', [installPayload()],
      );
      const upgrade = await adapter.execute(
        'session-1',
        'UPGRADE SERVICE $1',
        [installPayload({
          idempotency_key: 'upgrade-analytics-worker',
          manifest: manifest('2.0.0', DIGEST_B),
        })],
      );
      assert.equal(upgrade.success, true);
      assert.notEqual(upgrade.rows[0].revision_id,
        installed.rows[0].revision_id);
      assert.equal(upgrade.rows[0].rollout_state, 'recorded_not_running');

      const removalPayload = JSON.stringify({
        idempotency_key: 'remove-analytics-worker',
        service_name: 'analytics-worker',
      });
      const removal = await adapter.execute(
        'session-1', 'REMOVE SERVICE $1', [removalPayload],
      );
      assert.equal(removal.success, true);
      assert.equal(removal.rows[0].desired_state, 'removed');
      assert.equal(removal.rows[0].revision_id, upgrade.rows[0].revision_id);

      const status = await adapter.execute(
        'session-1',
        'SHOW SERVICE $1',
        [JSON.stringify({service_name: 'analytics-worker'})],
      );
      assert.equal(status.success, true);
      assert.equal(status.rows.length, 1);
      assert.equal(status.rows[0].desired_state, 'removed');
      assert.equal(status.rows[0].rollout_state, 'recorded_not_running');
      assert.equal(Object.hasOwn(status.rows[0], 'running'), false);

      const listed = await adapter.execute('session-1', 'SHOW SERVICES');
      assert.equal(listed.success, true);
      assert.equal(listed.rows.length, 1);
      assert.equal(listed.rows[0].service_name, 'analytics-worker');
      assert.equal(
        fixture.gateway.rowCount(TABLES.SERVICE_INSTALLATIONS), 3,
      );
    });

  it('derives tenant-scoped service identity from authenticated context',
    async () => {
      const fixture = createEngineFixture();
      const tenantA = await createAuthenticatedAdapter(fixture.engine, {
        sessionId: 'tenant-a-session',
        tenantId: 'tenant-a',
      });
      const tenantB = await createAuthenticatedAdapter(fixture.engine, {
        sessionId: 'tenant-b-session',
        tenantId: 'tenant-b',
      });
      const first = await tenantA.execute(
        'tenant-a-session', 'INSTALL SERVICE $1', [installPayload()],
      );
      const second = await tenantB.execute(
        'tenant-b-session', 'INSTALL SERVICE $1', [installPayload()],
      );
      assert.equal(first.success, true);
      assert.equal(second.success, true);
      assert.notEqual(
        first.rows[0].service_definition_id,
        second.rows[0].service_definition_id,
      );
      assert.notEqual(first.rows[0].operation_id, second.rows[0].operation_id);
      const tenantAList = await tenantA.execute(
        'tenant-a-session', 'SHOW SERVICES',
      );
      const tenantBList = await tenantB.execute(
        'tenant-b-session', 'SHOW SERVICES',
      );
      assert.equal(tenantAList.rows.length, 1);
      assert.equal(tenantBList.rows.length, 1);
      assert.equal(
        tenantAList.rows[0].service_definition_id,
        first.rows[0].service_definition_id,
      );
      assert.equal(
        tenantBList.rows[0].service_definition_id,
        second.rows[0].service_definition_id,
      );
    });
});
