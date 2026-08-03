/**
 * Artifact durability proof for the cluster-owned payload store (brief
 * docs/development/cluster-owned-artifacts-parallel-dispatch-brief.md §1
 * "Required Tests / Artifact durability"): a REAL WASI component
 * (ComponentizeJS build of the call-cell fixture guest) is installed
 * from a REAL local OCI layout through a real
 * ServiceLifecycleCommandOwner + InstallableServiceArtifactResolver +
 * InstallableComponentCache + artifact payload store over real-schema
 * SQLite. Its bytes land as SEALED chunks BEFORE any catalog row. Then
 * every node-local cache is deleted and the OCI source is destroyed,
 * and a previously unused node — fresh resolver, fresh empty cache,
 * the SAME replicated store tables — reconstructs the component through
 * the production loadComponentArtifact seam, digest verification
 * succeeds, the component genuinely starts in WasiComponentCellRuntime
 * and its run export returns the expected result, and the fresh node
 * cache is atomically populated. Negative paths: a composition without
 * the store refuses typed through the resolver's remote-provider-missing
 * repair refusal, and a tampered chunk fails typed CHUNK_DIGEST_MISMATCH
 * without ever populating the fresh cache.
 */

import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, mkdtemp, readdir, readFile, rm, writeFile} from
  'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {after, before, describe, it} from 'node:test';

import {componentize} from '@bytecodealliance/componentize-js';
import Database from 'better-sqlite3';

import {
  generateCreateIndexSQL,
  generateCreateTableSQL,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  ARTIFACT_PAYLOAD_CHUNKS_SCHEMA,
  ARTIFACT_PAYLOAD_STATE,
  ARTIFACT_PAYLOADS_SCHEMA,
} from '../../src/bootstrap/system-table-artifact-schema-definitions.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {TABLES} from '../../src/constants/index.js';
import {RUNTIME_KIND} from '../../src/constants/runtime.js';
import {createSystemMetadataOwners} from
  '../../src/control-plane/owners/index.js';
import {WasiComponentCellRuntime} from
  '../../src/runtime/wasi-component-cell-runtime.js';
import {
  ARTIFACT_PAYLOAD_CHUNK_SIZE_BYTES,
  ARTIFACT_PAYLOAD_ERROR_CODE,
  ArtifactPayloadStoreError,
  createArtifactPayloadStore,
} from '../../src/service/artifact-payload-store.js';
import {
  EXTERNAL_SERVICE_EXPORT_INTERFACE,
  EXTERNAL_SERVICE_MANIFEST_SCHEMA_VERSION,
  EXTERNAL_SERVICE_MEDIA_TYPE,
} from '../../src/service/external-service-manifest.js';
import {
  INSTALLABLE_ARTIFACT_ERROR_CODE,
  INSTALLABLE_ARTIFACT_SOURCE_KIND,
  InstallableServiceArtifactResolver,
} from '../../src/service/installable-service-artifact-resolver.js';
import {SERVICE_LIFECYCLE_COMMAND} from
  '../../src/service/service-lifecycle-command-contract.js';
import {
  SERVICE_LIFECYCLE_DEFAULT_SIGNATURE_POLICY,
  ServiceLifecycleCommandOwner,
} from '../../src/service/service-lifecycle-command-owner.js';

const WORLD_NAME = 'call-cell';
const RUN_EXPORT = 'run';
const SERVICE_NAME = 'artifact-durability-worker';
const SERVICE_VERSION = '1.0.0';
const SERVICE_ID = 'artifact-durability-cell';
const ARTIFACT_REF =
  'registry.example.test/acme/artifact-durability-worker:1.0.0';
const IDEMPOTENCY_KEY = 'install-artifact-durability-worker';
const REPLICA_COUNT = 1;
const WASM_MEDIA_TYPE = EXTERNAL_SERVICE_MEDIA_TYPE.WASM_COMPONENT;
const OCI_MANIFEST_MEDIA_TYPE = EXTERNAL_SERVICE_MEDIA_TYPE.OCI_CONTAINER;
const OCI_CONFIG_MEDIA_TYPE = 'application/vnd.oci.image.config.v1+json';
const OCI_IMAGE_LAYOUT_VERSION = '1.0.0';
const OCI_SCHEMA_VERSION = 2;
const SHA256_PREFIX_LENGTH = 7;
const TMP_PREFIX = 'lagrange-artifact-durability-';
const LAYOUT_DIR = 'oci-layout-source';
const CACHE_DIR = Object.freeze({
  NODE_ONE: 'cache-node-1',
  NODE_TWO: 'cache-node-2',
  STORELESS: 'cache-node-3',
  TAMPERED: 'cache-node-4',
});
const CACHE_BLOB_SUFFIX = '.wasm';
const CACHE_METADATA_SUFFIX = '.json';
const FILE_NOT_FOUND_CODE = 'ENOENT';
const OPAQUE_FAILURE = 'replicated write failed: participant failure';
const PARAM_PATTERN = /\$(\d+)/g;
const SQLITE_PLACEHOLDER = '?';
const WHERE_FIELD_PATTERN = / WHERE ([a-z_]+) = \?$/u;
const SEAL_SQL_PREFIX = 'UPDATE artifact_payloads SET state';
const EVENT = Object.freeze({
  CATALOG_INSERT_PREFIX: 'catalog-insert:',
  STORE_SEAL: 'store-seal',
});
const CATALOG_DUPLICATE_KEY = 'duplicate key';
const CATALOG_PRIMARY_KEY = Object.freeze({
  [TABLES.SERVICE_PACKAGES]: 'package_id',
  [TABLES.SERVICE_REVISIONS]: 'revision_id',
  [TABLES.SERVICE_INSTALLATIONS]: 'installation_id',
  [TABLES.SERVICE_INSTALL_FAILURES]: 'failure_id',
});
const REMOTE_PROVIDER_MISSING_PATTERN =
  /remote OCI provider is not configured/u;
const SELECT_PAYLOAD_ROWS_SQL =
  'SELECT payload_digest, artifact_digest, media_type, total_size, ' +
  'chunk_count, state FROM artifact_payloads';
const SELECT_CHUNK_SIZES_SQL =
  'SELECT chunk_number, chunk_size FROM artifact_payload_chunks ' +
  'WHERE payload_digest = ? ORDER BY chunk_number';
const SELECT_FIRST_CHUNK_SQL =
  'SELECT chunk_bytes_base64 FROM artifact_payload_chunks ' +
  'WHERE payload_digest = ? AND chunk_number = 0';
const TAMPER_FIRST_CHUNK_SQL =
  'UPDATE artifact_payload_chunks SET chunk_bytes_base64 = ? ' +
  'WHERE payload_digest = ? AND chunk_number = 0';
const BASE64_ENCODING = 'base64';
const COMPONENTIZE_DISABLED_FEATURES = Object.freeze([
  'random',
  'stdio',
  'clocks',
  'http',
  'fetch-event',
]);
const FIXTURE_DIRECTORY = new URL(
  '../wasm-service/fixtures/call-cell-world',
  import.meta.url,
);
const GUEST_SOURCE_URL = new URL(
  '../wasm-service/fixtures/call-cell-world/guest.js',
  import.meta.url,
);
const WIT_DIR = 'wit';
const CELL_BUDGETS = Object.freeze({
  context_bytes: 4096,
  cpu_time_ms: 60000,
  input_bytes: 1048576,
  memory_bytes: 512 * 1024 * 1024,
  output_bytes: 1048576,
  wall_time_ms: 300000,
});
const SECURITY_CONTEXT = Object.freeze({
  principal: 'alice',
  roles: Object.freeze(['service-operator']),
  tenantId: 'tenant-a',
});
const TOP_N = 1;
const EMIT_BUDGET = 8;
const RUN_ARGUMENTS_JSON = JSON.stringify({topN: TOP_N});
const COLUMN_NAME = Object.freeze({ID: 'id', LABEL: 'label', SCORE: 'score'});
const COLUMN_TAG = Object.freeze({
  INTEGER: 'integer',
  NULL_VALUE: 'null-value',
  REAL: 'real',
});
const RUN_ROW_VALUES = Object.freeze([
  Object.freeze({id: 1, score: 4.5}),
  Object.freeze({id: 2, score: 3.25}),
]);
const EXPECTED_KEPT = Object.freeze([Object.freeze({id: '1', score: 4.5})]);

const configuration = ConfigurationManager.getInstance();
if (!configuration.isInitialized()) configuration.initialize();

function sha256Of(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function blobPath(root, digestValue) {
  return path.join(
    root, 'blobs', 'sha256', digestValue.slice(SHA256_PREFIX_LENGTH),
  );
}

function typedRunRow(rowValues) {
  return {
    columns: [
      {
        name: COLUMN_NAME.ID,
        val: {tag: COLUMN_TAG.INTEGER, val: BigInt(rowValues.id)},
      },
      {
        name: COLUMN_NAME.SCORE,
        val: {tag: COLUMN_TAG.REAL, val: rowValues.score},
      },
      {name: COLUMN_NAME.LABEL, val: {tag: COLUMN_TAG.NULL_VALUE}},
    ],
  };
}

// One real componentized guest per process (ComponentizeJS builds are
// deterministic but cost tens of seconds).
let componentizePromise = null;
function componentizeFixtureGuest() {
  componentizePromise = componentizePromise ?? (async () => {
    const guestSource = await readFile(GUEST_SOURCE_URL, 'utf8');
    const {component} = await componentize(guestSource, {
      disableFeatures: [...COMPONENTIZE_DISABLED_FEATURES],
      witPath: path.join(FIXTURE_DIRECTORY.pathname, WIT_DIR),
      worldName: WORLD_NAME,
    });
    return Buffer.from(component);
  })();
  return componentizePromise;
}

// A real local OCI image layout over the REAL component bytes: the OCI
// image manifest's single wasm layer is the payload descriptor, and the
// external manifest's artifact digest pins the image manifest blob.
async function writeComponentOciLayout(root, componentBytes) {
  const payloadDescriptor = {
    digest: sha256Of(componentBytes),
    mediaType: WASM_MEDIA_TYPE,
    size: componentBytes.length,
  };
  const configBytes = Buffer.from(JSON.stringify({}));
  const ociManifestBytes = Buffer.from(JSON.stringify({
    schemaVersion: OCI_SCHEMA_VERSION,
    mediaType: OCI_MANIFEST_MEDIA_TYPE,
    config: {
      digest: sha256Of(configBytes),
      mediaType: OCI_CONFIG_MEDIA_TYPE,
      size: configBytes.length,
    },
    layers: [payloadDescriptor],
  }));
  const descriptor = {
    digest: sha256Of(ociManifestBytes),
    mediaType: OCI_MANIFEST_MEDIA_TYPE,
    size: ociManifestBytes.length,
  };
  await mkdir(path.join(root, 'blobs', 'sha256'), {recursive: true});
  await writeFile(
    path.join(root, 'oci-layout'),
    JSON.stringify({imageLayoutVersion: OCI_IMAGE_LAYOUT_VERSION}),
  );
  await writeFile(
    path.join(root, 'index.json'),
    JSON.stringify({
      schemaVersion: OCI_SCHEMA_VERSION,
      manifests: [descriptor],
    }),
  );
  await writeFile(blobPath(root, descriptor.digest), ociManifestBytes);
  await writeFile(blobPath(root, payloadDescriptor.digest), componentBytes);
  return {descriptor, payloadDescriptor};
}

function serviceManifest(artifactDigest) {
  return {
    schema_version: EXTERNAL_SERVICE_MANIFEST_SCHEMA_VERSION,
    name: SERVICE_NAME,
    version: SERVICE_VERSION,
    exports: [{
      name: RUN_EXPORT,
      interface: EXTERNAL_SERVICE_EXPORT_INTERFACE.CALL,
    }],
    artifact: {
      type: 'oci',
      ref: ARTIFACT_REF,
      digest: artifactDigest,
      media_type: WASM_MEDIA_TYPE,
    },
    runtime: {kind: RUNTIME_KIND.WASM_COMPONENT},
  };
}

function installPayload(artifactDigest, layoutRoot) {
  return {
    artifact_source: {
      kind: INSTALLABLE_ARTIFACT_SOURCE_KIND.LOCAL_OCI_LAYOUT,
      location: layoutRoot,
    },
    config: {replicas: REPLICA_COUNT},
    idempotency_key: IDEMPOTENCY_KEY,
    manifest: serviceManifest(artifactDigest),
  };
}

// Minimal in-memory catalog gateway (the replicated control-plane
// metadata tables shared by every node), recording each catalog insert
// on the shared timeline so seal-before-catalog ordering is provable.
function createCatalogGateway(timeline) {
  const tables = new Map(
    Object.keys(CATALOG_PRIMARY_KEY).map((table) => [table, new Map()]),
  );
  const cloneRow = (row) => JSON.parse(JSON.stringify(row));
  const matches = (row, where) => Object.entries(where)
    .every(([field, value]) => row[field] === value);
  return {
    async readAuthoritativeRows(table, sql, params) {
      const field = WHERE_FIELD_PATTERN.exec(sql)?.[1];
      const rows = [...tables.get(table).values()]
        .filter((row) => !field || row[field] === params[0]);
      return {rows: rows.map(cloneRow), success: true};
    },
    async insertSystemTableRow(table, row) {
      timeline.push(`${EVENT.CATALOG_INSERT_PREFIX}${table}`);
      const key = row[CATALOG_PRIMARY_KEY[table]];
      if (tables.get(table).has(key)) {
        return {error: CATALOG_DUPLICATE_KEY, success: false};
      }
      tables.get(table).set(key, cloneRow(row));
      return {affectedRows: 1, success: true};
    },
    async updateSystemTableRow(table, where, data) {
      let affectedRows = 0;
      for (const [key, row] of tables.get(table)) {
        if (!matches(row, where)) continue;
        tables.get(table).set(key, cloneRow({...row, ...data}));
        affectedRows += 1;
      }
      return {affectedRows, success: true};
    },
    async upsertSystemTableRow(table, row) {
      tables.get(table).set(row[CATALOG_PRIMARY_KEY[table]], cloneRow(row));
      return {affectedRows: 1, success: true};
    },
    async deleteSystemTableRow(table, where) {
      let affectedRows = 0;
      for (const [key, row] of tables.get(table)) {
        if (!matches(row, where)) continue;
        tables.get(table).delete(key);
        affectedRows += 1;
      }
      return {affectedRows, success: true};
    },
  };
}

// Real-schema SQLite behind the store's executeInternal contract ($n
// placeholders in, opaque participant failures out), with the guarded
// seal UPDATE recorded on the shared timeline.
function createStoreDatabase(timeline) {
  const database = new Database(':memory:');
  for (const schema of [
    ARTIFACT_PAYLOADS_SCHEMA,
    ARTIFACT_PAYLOAD_CHUNKS_SCHEMA,
  ]) {
    database.exec(generateCreateTableSQL(schema));
    for (const indexSql of generateCreateIndexSQL(schema)) {
      database.exec(indexSql);
    }
  }
  const executeInternal = async (sql, params = []) => {
    if (sql.startsWith(SEAL_SQL_PREFIX)) {
      timeline.push(EVENT.STORE_SEAL);
    }
    const values = [];
    const rewritten = sql.replace(PARAM_PATTERN, (_all, position) => {
      values.push(params[Number(position) - 1]);
      return SQLITE_PLACEHOLDER;
    });
    try {
      const statement = database.prepare(rewritten);
      return statement.reader ?
        {rows: statement.all(...values), success: true} :
        {affectedRows: statement.run(...values).changes, success: true};
    } catch {
      return {error: OPAQUE_FAILURE, success: false};
    }
  };
  return {database, executeInternal};
}

// One node's production owner composition: a fresh resolver with its
// own node-local cache directory, the shared replicated catalog, and
// (composition-gated) the shared payload store.
function composeNodeOwner(catalogOwner, cacheDirectory, store) {
  const artifactResolver = new InstallableServiceArtifactResolver({
    componentCacheDir: cacheDirectory,
  });
  const owner = new ServiceLifecycleCommandOwner({
    artifactResolver,
    catalogOwner,
    signaturePolicy: SERVICE_LIFECYCLE_DEFAULT_SIGNATURE_POLICY,
  });
  if (store) owner.artifactPayloadStore = store;
  return owner;
}

async function listCacheFiles(directory) {
  try {
    return await readdir(directory);
  } catch (error) {
    if (error.code === FILE_NOT_FOUND_CODE) return [];
    throw error;
  }
}

describe('artifact payload durability across nodes', () => {
  const timeline = [];
  const fixture = {};

  before(async () => {
    fixture.componentBytes = await componentizeFixtureGuest();
    fixture.tempRoot = await mkdtemp(path.join(tmpdir(), TMP_PREFIX));
    fixture.layoutRoot = path.join(fixture.tempRoot, LAYOUT_DIR);
    fixture.cacheDir = Object.fromEntries(Object.entries(CACHE_DIR).map(
      ([key, name]) => [key, path.join(fixture.tempRoot, name)],
    ));
    const layout = await writeComponentOciLayout(
      fixture.layoutRoot, fixture.componentBytes,
    );
    fixture.artifactDigest = layout.descriptor.digest;
    fixture.payloadDescriptor = layout.payloadDescriptor;
    const {database, executeInternal} = createStoreDatabase(timeline);
    fixture.database = database;
    fixture.store = createArtifactPayloadStore({executeInternal});
    fixture.catalogOwner = createSystemMetadataOwners({
      controlPlaneSystemTableGateway: createCatalogGateway(timeline),
      now: () => Date.now(),
    }).serviceInstallCatalogOwner;

    // Node 1 (install node): real INSTALL SERVICE through the real
    // command owner over the real resolver, cache, and store.
    const installNodeOwner = composeNodeOwner(
      fixture.catalogOwner, fixture.cacheDir.NODE_ONE, fixture.store,
    );
    fixture.installResult = await installNodeOwner.execute(
      SERVICE_LIFECYCLE_COMMAND.INSTALL,
      installPayload(fixture.artifactDigest, fixture.layoutRoot),
      SECURITY_CONTEXT,
    );
    const packageId = fixture.installResult.rows?.[0]?.package_id;
    const installedPackage = packageId ?
      await fixture.catalogOwner.getPackage(packageId) : null;
    fixture.loadTarget = Object.freeze({
      artifactDigest: fixture.artifactDigest,
      exportName: RUN_EXPORT,
      manifestDigest: installedPackage?.manifestDigest,
      packageId,
    });
  });

  after(async () => {
    fixture.database?.close();
    await rm(fixture.tempRoot, {force: true, recursive: true});
  });

  it('seals every payload byte as verified chunks before any catalog row',
    () => {
      assert.equal(fixture.installResult.success, true,
        'the real INSTALL SERVICE over the local OCI layout succeeds');
      const payloadRows = fixture.database
        .prepare(SELECT_PAYLOAD_ROWS_SQL).all();
      assert.equal(payloadRows.length, 1,
        'exactly one payload row exists for the installed component');
      const [payloadRow] = payloadRows;
      assert.equal(payloadRow.state, ARTIFACT_PAYLOAD_STATE.SEALED,
        'the payload row is SEALED');
      assert.equal(payloadRow.payload_digest,
        fixture.payloadDescriptor.digest);
      assert.equal(payloadRow.artifact_digest, fixture.artifactDigest);
      assert.equal(payloadRow.media_type, WASM_MEDIA_TYPE);
      assert.equal(Number(payloadRow.total_size),
        fixture.componentBytes.length,
        'total_size records every real component byte');
      const expectedChunkCount = Math.ceil(
        fixture.componentBytes.length / ARTIFACT_PAYLOAD_CHUNK_SIZE_BYTES,
      );
      assert.equal(Number(payloadRow.chunk_count), expectedChunkCount,
        'chunk_count matches the fixed chunking policy over the real bytes');
      const chunkRows = fixture.database
        .prepare(SELECT_CHUNK_SIZES_SQL)
        .all(fixture.payloadDescriptor.digest);
      assert.equal(chunkRows.length, expectedChunkCount,
        'every chunk row is present');
      assert.equal(
        chunkRows.reduce((total, row) => total + Number(row.chunk_size), 0),
        fixture.componentBytes.length,
        'the chunk sizes reassemble to the full payload',
      );
      const sealIndex = timeline.indexOf(EVENT.STORE_SEAL);
      const catalogIndexes = timeline
        .map((event, index) => [event, index])
        .filter(([event]) =>
          event.startsWith(EVENT.CATALOG_INSERT_PREFIX))
        .map(([, index]) => index);
      assert.ok(sealIndex >= 0, 'the guarded seal UPDATE executed');
      assert.ok(catalogIndexes.length >= 3,
        'package, revision, and installation rows were written');
      assert.ok(catalogIndexes.every((index) => index > sealIndex),
        'every catalog row was written AFTER the payload seal');
    });

  it('reconstructs, verifies, and genuinely starts the component on a ' +
    'previously unused node after all caches and the OCI source are gone',
  async () => {
    // The durability event: every node-local cache is deleted and the
    // external installation source disappears entirely.
    await rm(fixture.cacheDir.NODE_ONE, {force: true, recursive: true});
    await rm(fixture.layoutRoot, {force: true, recursive: true});

    // Node 2: fresh resolver, fresh empty cache, SAME replicated
    // catalog and payload store tables — the production
    // loadComponentArtifact seam (what setArtifactLoader wires to the
    // WASM driver).
    const freshNodeOwner = composeNodeOwner(
      fixture.catalogOwner, fixture.cacheDir.NODE_TWO, fixture.store,
    );
    const loaded = await freshNodeOwner.loadComponentArtifact(
      fixture.loadTarget,
    );
    assert.equal(loaded.payloadDigest, fixture.payloadDescriptor.digest,
      'the loaded payload carries the manifest-pinned payload digest');
    assert.equal(sha256Of(loaded.bytes), fixture.payloadDescriptor.digest,
      'sha256 over the reconstructed bytes matches the payload digest');
    assert.ok(Buffer.from(loaded.bytes).equals(fixture.componentBytes),
      'the reconstructed bytes are identical to the installed component');

    // The component genuinely STARTS from the reconstructed bytes and
    // its run export produces the expected top-N result over a real
    // typed batch (a real invocation, not just instantiation).
    const cellRuntime = new WasiComponentCellRuntime();
    await cellRuntime.start(Object.freeze({
      budgets: CELL_BUDGETS,
      bytes: new Uint8Array(loaded.bytes),
      capabilities: [],
      exportName: RUN_EXPORT,
      serviceId: SERVICE_ID,
      world: WORLD_NAME,
    }));
    try {
      const outcome = await cellRuntime.invoke(
        SERVICE_ID,
        [RUN_ROW_VALUES.map(typedRunRow), RUN_ARGUMENTS_JSON],
        () => [],
        () => {},
        () => {},
        {
          callContext: {
            emitBudget: EMIT_BUDGET,
            nestedCallBudget: 0,
            onCallBounded: false,
          },
          exportName: RUN_EXPORT,
        },
      );
      const runResult = JSON.parse(outcome.value);
      assert.deepEqual(runResult.kept, EXPECTED_KEPT,
        'the started component executed run and returned the expected ' +
          'top-N result');
      assert.equal(runResult.nullLabels, RUN_ROW_VALUES.length,
        'the component observed every typed batch row');
    } finally {
      await cellRuntime.stop(SERVICE_ID);
    }
  });

  it('atomically populates the fresh node cache with the ' +
    'content-addressed files', async () => {
    const cacheFiles = await listCacheFiles(fixture.cacheDir.NODE_TWO);
    const payloadBlobName = fixture.payloadDescriptor.digest
      .slice(SHA256_PREFIX_LENGTH) + CACHE_BLOB_SUFFIX;
    const metadataName = fixture.artifactDigest
      .slice(SHA256_PREFIX_LENGTH) + CACHE_METADATA_SUFFIX;
    assert.ok(cacheFiles.includes(payloadBlobName),
      'the content-addressed payload blob is cached on the fresh node');
    assert.ok(cacheFiles.includes(metadataName),
      'the artifact metadata pointer is cached on the fresh node');
    assert.deepEqual(cacheFiles.filter((name) =>
      !name.endsWith(CACHE_BLOB_SUFFIX) &&
      !name.endsWith(CACHE_METADATA_SUFFIX)), [],
    'no temporary files remain — the populate was atomic');
    const metadata = JSON.parse(await readFile(
      path.join(fixture.cacheDir.NODE_TWO, metadataName), 'utf8',
    ));
    assert.equal(metadata.artifactDigest, fixture.artifactDigest);
    assert.equal(metadata.payloadDescriptor.digest,
      fixture.payloadDescriptor.digest,
      'the cached metadata pins the same payload descriptor identity');
  });

  it('refuses typed through the resolver repair path when no store is ' +
    'attached and the external source is gone', async () => {
    const storelessOwner = composeNodeOwner(
      fixture.catalogOwner, fixture.cacheDir.STORELESS, null,
    );
    await assert.rejects(
      () => storelessOwner.loadComponentArtifact(fixture.loadTarget),
      (error) =>
        error.code === INSTALLABLE_ARTIFACT_ERROR_CODE.SOURCE_READ_FAILED &&
        REMOTE_PROVIDER_MISSING_PATTERN.test(error.message),
      'without the store, the loader falls through to external repair, ' +
        'whose typed remote-provider-missing refusal is the honest ' +
        '"repair source absent" outcome',
    );
    assert.deepEqual(
      await listCacheFiles(fixture.cacheDir.STORELESS), [],
      'the refusing composition never populated its cache',
    );
  });

  it('fails typed CHUNK_DIGEST_MISMATCH on a tampered chunk and never ' +
    'populates the fresh cache', async () => {
    const chunkRow = fixture.database
      .prepare(SELECT_FIRST_CHUNK_SQL)
      .get(fixture.payloadDescriptor.digest);
    const tamperedBytes = Buffer.from(
      String(chunkRow.chunk_bytes_base64), BASE64_ENCODING,
    );
    // Same length, different content: the corruption is caught by the
    // chunk digest check, not the size check.
    tamperedBytes[0] ^= 1;
    fixture.database.prepare(TAMPER_FIRST_CHUNK_SQL).run(
      tamperedBytes.toString(BASE64_ENCODING),
      fixture.payloadDescriptor.digest,
    );
    const tamperedNodeOwner = composeNodeOwner(
      fixture.catalogOwner, fixture.cacheDir.TAMPERED, fixture.store,
    );
    await assert.rejects(
      () => tamperedNodeOwner.loadComponentArtifact(fixture.loadTarget),
      (error) =>
        error instanceof ArtifactPayloadStoreError &&
        error.code === ARTIFACT_PAYLOAD_ERROR_CODE.CHUNK_DIGEST_MISMATCH,
      'the tampered chunk fails the typed chunk digest verification',
    );
    assert.deepEqual(
      await listCacheFiles(fixture.cacheDir.TAMPERED), [],
      'a failed verification never populates the node cache',
    );

    // Resolution-order proof: node 2's already-populated cache still
    // serves verified bytes although the store is now tampered — the
    // node-local cache is consulted BEFORE the internal store.
    const cachedNodeOwner = composeNodeOwner(
      fixture.catalogOwner, fixture.cacheDir.NODE_TWO, fixture.store,
    );
    const cachedLoad = await cachedNodeOwner.loadComponentArtifact(
      fixture.loadTarget,
    );
    assert.equal(sha256Of(cachedLoad.bytes),
      fixture.payloadDescriptor.digest,
      'the populated node cache serves the component ahead of the store');
  });
});
