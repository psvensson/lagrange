// Component SQL boundary, not QueryEngine/Raft certification. Mutation intent,
// SQL construction and CAS are production owner/gateway/CDC plus real SQLite.
// Authoritative reads are explicitly adapted to this single component database.
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {SYSTEM_TABLE_SCHEMAS, generateCreateTableSQL} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {ControlPlaneSystemTableGateway} from
  '../../src/control-plane/control-plane-system-table-gateway.js';
import {createSystemMetadataOwners} from '../../src/control-plane/owners/index.js';
import {deriveTenantPackageId} from
  '../../src/control-plane/owners/service-install-catalog-contract.js';
import {deriveServiceDefinitionId} from '../../src/service/service-lifecycle-command-owner.js';

const TABLES = ['service_instances', 'service_packages', 'service_revisions',
  'service_installations', 'service_install_failures'];
const QUIET = {debug() {}, info() {}, warn() {}, error() {}};
const TENANT = 'creation-test-tenant';
const NAME = 'creation-test-service';
const DIGEST = `sha256:${'a'.repeat(64)}`;
const REVISION = 'creation-test-revision';
const PROFILE = 'wasm-writer-v1/1';
const PEERS = [1, 2, 3].map((n) => ({replicaId: `founder-${n}`, nodeId: `host-${n}`}));
const DEFINITION = {serviceName: NAME, handlerFunctionId: 'creation-test-handler',
  readConsistency: 'strong', writeConsistency: 'strong', safetyIntervalMs: 0};

function gate() {
  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return {promise, release};
}

async function createCreationSqliteFixture(t) {
  const db = new Database(':memory:');
  const cdcOwners = [];
  t.after(() => {
    for (const cdc of cdcOwners) cdc.markShuttingDown();
    db.close();
  });
  for (const table of TABLES) {
    const schema = SYSTEM_TABLE_SCHEMAS.find((candidate) => candidate.tableName === table);
    assert.ok(schema, `${table} must have production schema registration before execution`);
    db.exec(generateCreateTableSQL(schema));
  }
  const writes = [];
  const holds = [];
  const lostReplies = [];
  const appliedLostReplies = [];
  const row = () => db.prepare('SELECT * FROM service_instances').get() ?? null;
  const state = () => {
    const current = row();
    return current ? JSON.parse(current.state) : null;
  };
  const catalogRows = () => Object.fromEntries(TABLES.slice(1).map((table) =>
    [table, db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()]));
  function holdNext(writer) {
    const entered = gate();
    const resume = gate();
    holds.push({writer, entered, resume});
    return {entered: entered.promise, release: resume.release};
  }
  function owner(writer) {
    const engine = {
      async executeQuery(sql, params = []) {
        if (/^SELECT\b/iu.test(sql.trim())) {
          return {success: true, rows: db.prepare(sql).all(...params)};
        }
        const held = holds.findIndex((entry) => entry.writer === writer &&
          /\bservice_instances\b/u.test(sql));
        if (held >= 0) {
          const entry = holds.splice(held, 1)[0];
          entry.entered.release();
          await entry.resume.promise;
        }
        const result = db.prepare(sql).run(...params);
        writes.push({writer, sql, params: structuredClone(params), changes: result.changes,
          state: structuredClone(state())});
        const lost = lostReplies.indexOf(writer);
        if (lost >= 0 && /\bservice_instances\b/u.test(sql)) {
          lostReplies.splice(lost, 1);
          appliedLostReplies.push({writer, sql, params: structuredClone(params),
            changes: result.changes, state: structuredClone(state())});
          throw new Error('COMPONENT_SQL_APPLIED_REPLY_LOST');
        }
        return {success: true, rows: [], affectedRows: result.changes};
      },
    };
    const cdc = new CDCIntegrationService({nodeId: writer, sqlQueryEngine: engine});
    cdc.initialize();
    cdc.logger = QUIET;
    cdcOwners.push(cdc);
    const gateway = new ControlPlaneSystemTableGateway({nodeId: writer,
      cdcIntegrationService: cdc, sqlQueryEngine: engine});
    // Component-only read seam: neither a fabricated CAS winner nor native
    // leader/read-index evidence. Production mutation methods remain untouched.
    gateway.readAuthoritativeRows = async (_table, sql, params = []) =>
      engine.executeQuery(sql, params);
    const owners = createSystemMetadataOwners({controlPlaneSystemTableGateway: gateway});
    return {definitions: owners.serviceDefinitionsOwner,
      catalog: owners.serviceInstallCatalogOwner, gateway};
  }
  const primary = owner('owner-a');
  const manifest = {schema_version: 3, name: NAME, version: '1.0.0',
    exports: [{interface: 'request_v1', name: 'serve'}],
    artifact: {type: 'oci', ref: 'registry.example.test/creation-test:1.0.0',
      digest: DIGEST, media_type: 'application/wasm'}, runtime: {kind: 'wasm_component'}};
  const packageId = deriveTenantPackageId(manifest, TENANT);
  await primary.catalog.recordPackage({packageId, manifest,
    resolvedArtifact: {status: 'resolved', artifact: {digest: DIGEST,
      payloadMediaType: 'application/wasm', signature: {status: 'verified', keyId: 'fixture'}}}},
  {skipCacheWait: true});
  await primary.catalog.recordRevision({revisionId: REVISION, packageId,
    config: {definition: DEFINITION}}, {skipCacheWait: true});
  const serviceId = deriveServiceDefinitionId(TENANT, NAME);
  function request(expectedVersion = 0, nonce = 1, expectedIncarnation = null) {
    return {format: 1, requestId: {serviceDefinitionId: serviceId, expectedVersion,
      nonce: nonce.toString(16).padStart(64, '0')}, tenantId: TENANT, expectedIncarnation,
    action: 'CREATE', revisionId: REVISION, definition: structuredClone(DEFINITION),
    profile: PROFILE, foundingPeers: structuredClone(PEERS)};
  }
  const slotRequest = (slot = 0, expectedOrdinal = 0, operationId = `operation-${slot}`,
    peer = slot % PEERS.length) => ({slot, expectedOrdinal, operationId, ...PEERS[peer]});
  return {db, owner, primary: primary.definitions, serviceId, row, state, writes,
    appliedLostReplies,
    catalogRows, request, slotRequest, holdNext,
    loseReply: (writer) => lostReplies.push(writer)};
}

export {createCreationSqliteFixture};
