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
import {SERVICE_LIFECYCLE_COMMAND} from
  '../../src/service/service-lifecycle-command-contract.js';
import {
  SERVICE_LIFECYCLE_DEFAULT_SIGNATURE_POLICY,
  ServiceLifecycleCommandOwner,
} from '../../src/service/service-lifecycle-command-owner.js';

const TABLES = ['service_instances', 'service_packages', 'service_revisions',
  'service_installations', 'service_install_failures'];
const QUIET = {debug() {}, info() {}, warn() {}, error() {}};
const TENANT = 'creation-test-tenant';
const NAME = 'creation-test-service';
const DIGEST = `sha256:${'a'.repeat(64)}`;
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

async function createCreationSqliteFixture(t, options = {}) {
  const db = new Database(options.databasePath ?? ':memory:');
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
  // Authoritative-read fault per owner writer: a faulted read makes every
  // owner decision UNAVAILABLE/UNKNOWN before or after its mutation, which is
  // how a lost CLOSED/grant answer is kept unresolved inside the owner.
  const readFaults = new Map();
  const row = () => db.prepare('SELECT * FROM service_instances').get() ?? null;
  const state = () => {
    const current = row();
    return current ? JSON.parse(current.state) : null;
  };
  const catalogRows = () => Object.fromEntries(TABLES.slice(1).map((table) =>
    [table, db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()]));
  // A held service_instances mutation: before it executes (default), or after
  // it applied with its reply withheld (afterApply), the in-flight CAS window
  // of a lost-or-late answer.
  function holdNext(writer, {afterApply = false} = {}) {
    const entered = gate();
    const resume = gate();
    holds.push({writer, entered, resume, afterApply});
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
        const entry = held >= 0 ? holds.splice(held, 1)[0] : null;
        if (entry && !entry.afterApply) {
          entry.entered.release();
          await entry.resume.promise;
        }
        const result = db.prepare(sql).run(...params);
        writes.push({writer, sql, params: structuredClone(params), changes: result.changes,
          state: structuredClone(state())});
        if (entry?.afterApply) {
          entry.entered.release();
          await entry.resume.promise;
        }
        const lost = lostReplies.findIndex((candidate) => candidate.writer === writer);
        if (lost >= 0 && /\bservice_instances\b/u.test(sql)) {
          const {onLost} = lostReplies.splice(lost, 1)[0];
          appliedLostReplies.push({writer, sql, params: structuredClone(params),
            changes: result.changes, state: structuredClone(state())});
          // A lost answer whose authoritative resolution is also unavailable:
          // the hook may fault the owner's following reread.
          onLost?.();
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
    gateway.readAuthoritativeRows = async (_table, sql, params = []) => {
      const fault = readFaults.get(writer);
      if (fault) throw fault;
      return engine.executeQuery(sql, params);
    };
    const owners = createSystemMetadataOwners({controlPlaneSystemTableGateway: gateway});
    return {definitions: owners.serviceDefinitionsOwner,
      catalog: owners.serviceInstallCatalogOwner, gateway, cdc,
      services: owners.servicesOwner, endpoints: owners.serviceEndpointsOwner};
  }
  const primary = owner('owner-a');
  const manifest = {schema_version: 3, name: NAME, version: '1.0.0',
    exports: [{interface: 'request_v1', name: 'serve'}],
    artifact: {type: 'oci', ref: 'registry.example.test/creation-test:1.0.0',
      digest: DIGEST, media_type: 'application/wasm'}, runtime: {kind: 'wasm_component'}};
  // Obtain identity and revision from the existing authenticated command owner,
  // not a fixture hash or a nonexistent identity-helper export. This seed is
  // component catalog intent only: resolver evidence is explicit fixture data,
  // no artifact payload store, native service or activation is provided.
  const commandOwner = new ServiceLifecycleCommandOwner({
    catalogOwner: primary.catalog,
    signaturePolicy: SERVICE_LIFECYCLE_DEFAULT_SIGNATURE_POLICY,
    artifactResolver: {async resolve() {
      return {status: 'resolved', artifact: {digest: DIGEST,
        payloadMediaType: 'application/wasm', signature: {status: 'verified', keyId: 'fixture'}}};
    }},
  });
  const installed = await commandOwner.execute(SERVICE_LIFECYCLE_COMMAND.INSTALL,
    {manifest, config: {definition: DEFINITION}, artifact_source: {kind: 'remote_oci'},
      idempotency_key: 'creation-component-seed'},
    {tenantId: TENANT, principal: 'creation-fixture', roles: ['service-operator']});
  assert.equal(installed.success, true, JSON.stringify(installed));
  assert.equal(installed.rows.length, 1);
  const {service_definition_id: serviceId, revision_id: revisionId} = installed.rows[0];
  // canonicalFounders: the founders carry the dispatched canonical replica
  // identities `${serviceId}-rN` a RuntimeServiceHandler requires (stage 1c).
  const peers = options.canonicalFounders === true ?
    PEERS.map((peer, index) => ({...peer, replicaId: `${serviceId}-r${index + 1}`})) : PEERS;
  function request(expectedVersion = 0, nonce = 1, expectedIncarnation = null) {
    return {format: 1, requestId: {serviceDefinitionId: serviceId, expectedVersion,
      nonce: nonce.toString(16).padStart(64, '0')}, tenantId: TENANT, expectedIncarnation,
    action: 'CREATE', revisionId, definition: structuredClone(DEFINITION),
    profile: PROFILE, foundingPeers: structuredClone(peers)};
  }
  const slotRequest = (slot = 0, expectedOrdinal = 0, operationId = `operation-${slot}`,
    peer = slot % peers.length) => ({slot, expectedOrdinal, operationId, ...peers[peer]});
  return {db, owner, primary: primary.definitions, serviceId, row, state, writes,
    appliedLostReplies,
    catalogRows, request, slotRequest, holdNext,
    loseReply: (writer, onLost = null) => lostReplies.push({writer, onLost}),
    // Distinct from the origin fixture's journal-reader fault (setReadFault).
    setGatewayReadFault: (writer, error) => {
      if (error) readFaults.set(writer, error);
      else readFaults.delete(writer);
    }};
}

export {createCreationSqliteFixture};
