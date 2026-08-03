/**
 * INSTALL-time payload internalization + payload-seal bindable gate
 * (brief §1 "Installation State Machine"): with the store attached the
 * WASM payload is acquired and SEALED before any catalog row is
 * written; a store failure fails the INSTALL typed with zero catalog
 * rows through the existing failure-record path; byte-identical
 * reinstalls converge on the store's alreadySealed idempotent success;
 * an absent store keeps the exact pre-store behavior with no store
 * calls; and the deployment binding owner refuses to bind a WASM
 * artifact without a SEALED internal payload while sealed payloads,
 * container artifacts, and store-less owners bind unchanged. The
 * attachment setup composes ONE shared store onto both owners at the
 * SQL-runtime handoff seam.
 */

import {createHash} from 'node:crypto';

import {test} from '../../src/test-helpers/tap.js';
import {
  ARTIFACT_PAYLOAD_ERROR_CODE,
  ArtifactPayloadStoreError,
} from '../../src/service/artifact-payload-store.js';
import {
  INTERNALIZATION_SKIP_REASON,
  internalizeResolvedArtifact,
} from '../../src/service/artifact-payload-internalization.js';
import {
  SERVICE_LIFECYCLE_COMMAND_ERROR_CODE,
  SERVICE_LIFECYCLE_DEFAULT_SIGNATURE_POLICY,
  ServiceLifecycleCommandOwner,
} from '../../src/service/service-lifecycle-command-owner.js';
import {SERVICE_LIFECYCLE_COMMAND} from
  '../../src/service/service-lifecycle-command-contract.js';
import {EXTERNAL_SERVICE_MEDIA_TYPE} from
  '../../src/service/external-service-manifest.js';
import {RUNTIME_KIND} from '../../src/constants/runtime.js';
import {
  ARTIFACT_PAYLOAD_NOT_INTERNALIZED,
  DeploymentBindingOwner,
} from '../../src/control-plane/owners/deployment-binding-owner.js';
import {DeploymentBindingError} from
  '../../src/control-plane/owners/deployment-binding-contract.js';
import {
  ARTIFACT_PAYLOAD_COORDINATION_SESSION,
  attachArtifactPayloadStore,
} from '../../src/bootstrap/shared/artifact-payload-store-setup.js';

const ARTIFACT_DIGEST = `sha256:${'a'.repeat(64)}`;
const PAYLOAD_BYTES = Buffer.from('wasm component payload fixture bytes');
const PAYLOAD_DIGEST = `sha256:${createHash('sha256')
  .update(PAYLOAD_BYTES)
  .digest('hex')}`;
const FIXTURE_EVENT = Object.freeze({
  PUT_PAYLOAD: 'putPayload',
  RECORD_PACKAGE: 'recordPackage',
  RECORD_REVISION: 'recordRevision',
  REQUEST_INSTALLATION: 'requestInstallation',
});
const FIXTURE_LITERAL = Object.freeze({
  DURABLE: 'durable',
  IDEMPOTENCY_KEY: 'install-wasm-worker',
  LOCATION: '/fixture/oci-layout',
  PUT_FAILURE_MESSAGE: 'fixture payload store write failure',
  RECORDED_NOT_RUNNING: 'recorded_not_running',
  REF: 'registry.example.test/wasm-worker@',
  RESOLVED: 'resolved',
  SECOND_KEY: 'install-wasm-worker-again',
  SOURCE_KIND: 'local_oci_layout',
});
const SECURITY_CONTEXT = Object.freeze({
  tenantId: 'tenant-a',
  principal: 'alice',
  roles: Object.freeze(['service-operator']),
});

function wasmManifest() {
  return {
    schema_version: 3,
    name: 'wasm-worker',
    version: '1.0.0',
    exports: [{name: 'serve', interface: 'request_v1'}],
    artifact: {
      type: 'oci',
      ref: `${FIXTURE_LITERAL.REF}${ARTIFACT_DIGEST}`,
      digest: ARTIFACT_DIGEST,
      media_type: EXTERNAL_SERVICE_MEDIA_TYPE.WASM_COMPONENT,
    },
    runtime: {kind: RUNTIME_KIND.WASM_COMPONENT},
  };
}

function installPayload(overrides = {}) {
  return {
    artifact_source: {
      kind: FIXTURE_LITERAL.SOURCE_KIND,
      location: FIXTURE_LITERAL.LOCATION,
    },
    config: {replicas: 2},
    idempotency_key: FIXTURE_LITERAL.IDEMPOTENCY_KEY,
    manifest: wasmManifest(),
    ...overrides,
  };
}

class RecordingCatalogOwner {
  constructor(events) {
    this.events = events;
    this.packages = [];
    this.revisions = [];
    this.installations = [];
  }

  async getInstallationByOperationId() {
    return null;
  }

  async recordPackage(request) {
    this.events.push(FIXTURE_EVENT.RECORD_PACKAGE);
    this.packages.push(request);
  }

  async recordRevision(request) {
    this.events.push(FIXTURE_EVENT.RECORD_REVISION);
    this.revisions.push(request);
  }

  async requestInstallation(request) {
    this.events.push(FIXTURE_EVENT.REQUEST_INSTALLATION);
    this.installations.push(request);
    return {...request, rolloutState: FIXTURE_LITERAL.RECORDED_NOT_RUNNING};
  }

  writtenRowCount() {
    return this.packages.length + this.revisions.length +
      this.installations.length;
  }
}

class WasmFixtureResolver {
  constructor() {
    this.acquireCalls = [];
    this.resolveCalls = [];
  }

  async resolve(request) {
    this.resolveCalls.push(request);
    return {
      status: FIXTURE_LITERAL.RESOLVED,
      artifact: {
        digest: request.manifest.artifact.digest,
        location: FIXTURE_LITERAL.LOCATION,
        payloadDescriptor: {
          digest: PAYLOAD_DIGEST,
          mediaType: EXTERNAL_SERVICE_MEDIA_TYPE.WASM_COMPONENT,
          size: PAYLOAD_BYTES.length,
        },
        payloadMediaType: EXTERNAL_SERVICE_MEDIA_TYPE.WASM_COMPONENT,
        sourceKind: FIXTURE_LITERAL.SOURCE_KIND,
      },
    };
  }

  async acquireComponentBytes(target) {
    this.acquireCalls.push(target);
    return PAYLOAD_BYTES;
  }
}

function createFixtureStore(events, options = {}) {
  const sealedPayloads = new Map();
  const store = {
    findCalls: [],
    puts: [],
    async putPayload(request) {
      events.push(FIXTURE_EVENT.PUT_PAYLOAD);
      if (options.putFailure) {
        throw options.putFailure;
      }
      const alreadySealed = sealedPayloads.has(request.artifactDigest);
      if (!alreadySealed) {
        sealedPayloads.set(request.artifactDigest, Object.freeze({
          artifactDigest: request.artifactDigest,
          chunkCount: 1,
          createdAt: 1,
          mediaType: request.mediaType,
          payloadDigest: request.payloadDigest,
          sealedAt: 1,
          totalSize: request.bytes.length,
        }));
      }
      const summary = Object.freeze({
        alreadySealed,
        chunkCount: 1,
        payloadDigest: request.payloadDigest,
        sealedAt: 1,
        totalSize: request.bytes.length,
      });
      store.puts.push(summary);
      return summary;
    },
    async findSealedPayloadByArtifactDigest(artifactDigest) {
      store.findCalls.push(artifactDigest);
      const payload = sealedPayloads.get(artifactDigest);
      return payload ? {found: true, payload} : {found: false};
    },
  };
  return store;
}

function createInstallFixture(options = {}) {
  const events = [];
  const catalogOwner = new RecordingCatalogOwner(events);
  const artifactResolver = new WasmFixtureResolver();
  const owner = new ServiceLifecycleCommandOwner({
    artifactResolver,
    catalogOwner,
    signaturePolicy: SERVICE_LIFECYCLE_DEFAULT_SIGNATURE_POLICY,
  });
  const store = options.withoutStore ?
    null :
    createFixtureStore(events, options);
  if (store) {
    owner.artifactPayloadStore = store;
  }
  return {artifactResolver, catalogOwner, events, owner, store};
}

test('install with the store seals the payload before any catalog row',
  async (t) => {
    const fixture = createInstallFixture();
    const result = await fixture.owner.execute(
      SERVICE_LIFECYCLE_COMMAND.INSTALL,
      installPayload(),
      SECURITY_CONTEXT,
    );
    t.equal(result.success, true, 'the install succeeds as today');
    t.equal(result.rows[0].operation_status, FIXTURE_LITERAL.DURABLE);
    t.equal(result.rows[0].rollout_state,
      FIXTURE_LITERAL.RECORDED_NOT_RUNNING);
    t.same(fixture.events, [
      FIXTURE_EVENT.PUT_PAYLOAD,
      FIXTURE_EVENT.RECORD_PACKAGE,
      FIXTURE_EVENT.RECORD_REVISION,
      FIXTURE_EVENT.REQUEST_INSTALLATION,
    ], 'the payload is sealed BEFORE the first catalog row is written');
    t.equal(fixture.store.puts[0].alreadySealed, false);
    t.equal(fixture.store.puts[0].payloadDigest, PAYLOAD_DIGEST);
    t.same(fixture.artifactResolver.acquireCalls[0], {
      location: FIXTURE_LITERAL.LOCATION,
      payloadDescriptor: {
        digest: PAYLOAD_DIGEST,
        mediaType: EXTERNAL_SERVICE_MEDIA_TYPE.WASM_COMPONENT,
        size: PAYLOAD_BYTES.length,
      },
      sourceKind: FIXTURE_LITERAL.SOURCE_KIND,
    }, 'bytes ride the resolver acquisition surface');
  });

test('a store putPayload failure fails the INSTALL typed with zero rows',
  async (t) => {
    const putFailure = new ArtifactPayloadStoreError(
      ARTIFACT_PAYLOAD_ERROR_CODE.QUERY_FAILED,
      FIXTURE_LITERAL.PUT_FAILURE_MESSAGE,
    );
    const fixture = createInstallFixture({putFailure});
    const result = await fixture.owner.execute(
      SERVICE_LIFECYCLE_COMMAND.INSTALL,
      installPayload(),
      SECURITY_CONTEXT,
    );
    t.equal(result.success, false, 'the INSTALL fails');
    t.equal(result.errorCode,
      SERVICE_LIFECYCLE_COMMAND_ERROR_CODE.ARTIFACT_REJECTED,
      'the failure is the typed artifact rejection');
    t.equal(result.detail.ownerCode,
      ARTIFACT_PAYLOAD_ERROR_CODE.QUERY_FAILED,
      'the store failure code rides along as ownerCode');
    t.equal(result.error, FIXTURE_LITERAL.PUT_FAILURE_MESSAGE,
      'the typed store message is preserved on the failure record');
    t.equal(fixture.catalogOwner.writtenRowCount(), 0,
      'no package, revision, or installation row is written');
    t.same(fixture.events, [FIXTURE_EVENT.PUT_PAYLOAD],
      'the failure happened at the seal step, before any catalog write');
  });

test('a byte-identical reinstall converges on alreadySealed and succeeds',
  async (t) => {
    const fixture = createInstallFixture();
    const first = await fixture.owner.execute(
      SERVICE_LIFECYCLE_COMMAND.INSTALL,
      installPayload(),
      SECURITY_CONTEXT,
    );
    const second = await fixture.owner.execute(
      SERVICE_LIFECYCLE_COMMAND.INSTALL,
      installPayload({idempotency_key: FIXTURE_LITERAL.SECOND_KEY}),
      SECURITY_CONTEXT,
    );
    t.equal(first.success, true);
    t.equal(second.success, true, 'the reinstall still succeeds');
    t.equal(fixture.store.puts.length, 2);
    t.equal(fixture.store.puts[0].alreadySealed, false);
    t.equal(fixture.store.puts[1].alreadySealed, true,
      'the second byte-identical put is the idempotent sealed replay');
  });

test('no attached store keeps the install unchanged with no store calls',
  async (t) => {
    const fixture = createInstallFixture({withoutStore: true});
    const result = await fixture.owner.execute(
      SERVICE_LIFECYCLE_COMMAND.INSTALL,
      installPayload(),
      SECURITY_CONTEXT,
    );
    t.equal(result.success, true);
    t.equal(fixture.artifactResolver.acquireCalls.length, 0,
      'no payload bytes are acquired');
    t.same(fixture.events, [
      FIXTURE_EVENT.RECORD_PACKAGE,
      FIXTURE_EVENT.RECORD_REVISION,
      FIXTURE_EVENT.REQUEST_INSTALLATION,
    ], 'only the pre-store catalog writes happen');
  });

test('internalizeResolvedArtifact skips artifacts without a payload ' +
  'descriptor (OCI containers stay out of scope)', async (t) => {
  const events = [];
  const store = createFixtureStore(events);
  const summary = await internalizeResolvedArtifact({
    acquireBytes: async () => PAYLOAD_BYTES,
    resolved: {artifact: {digest: ARTIFACT_DIGEST, payloadDescriptor: null}},
    store,
  });
  t.same(summary,
    {
      internalized: false,
      reason: INTERNALIZATION_SKIP_REASON.NO_PAYLOAD_DESCRIPTOR,
    });
  t.equal(events.length, 0, 'the store is never touched');
});

function bindableArtifact(runtimeKind = RUNTIME_KIND.WASM_COMPONENT) {
  return Object.freeze({
    packageId: 'service-package-fixture',
    manifestDigest: ARTIFACT_DIGEST,
    artifactDigest: ARTIFACT_DIGEST,
    manifest: {runtime: {kind: runtimeKind}},
  });
}

function createBindingFixture(options = {}) {
  const events = [];
  const store = options.withoutStore ?
    null :
    createFixtureStore(events, options);
  const owner = new DeploymentBindingOwner({
    catalogOwner: {
      getBindableArtifactForTenant: async () =>
        options.artifact ?? bindableArtifact(),
    },
    artifactPayloadStore: store,
  });
  const declaration = {
    target: {
      package_id: 'service-package-fixture',
      manifest_digest: ARTIFACT_DIGEST,
    },
  };
  return {declaration, owner, store};
}

test('the binding gate refuses a WASM artifact with no sealed payload',
  async (t) => {
    const fixture = createBindingFixture();
    try {
      await fixture.owner.resolveArtifact(
        fixture.declaration, SECURITY_CONTEXT);
      t.fail('binding an un-internalized artifact must refuse');
    } catch (error) {
      t.ok(error instanceof DeploymentBindingError,
        'the refusal uses the owner error class');
      t.equal(error.code, ARTIFACT_PAYLOAD_NOT_INTERNALIZED.CODE);
      t.equal(error.message, ARTIFACT_PAYLOAD_NOT_INTERNALIZED.MESSAGE,
        'the message tells the operator to migrate/import');
    }
    t.same(fixture.store.findCalls, [ARTIFACT_DIGEST],
      'the gate queried the sealed payload for the artifact digest');
  });

test('the binding gate passes once a sealed payload exists', async (t) => {
  const fixture = createBindingFixture();
  await fixture.store.putPayload({
    artifactDigest: ARTIFACT_DIGEST,
    bytes: PAYLOAD_BYTES,
    mediaType: EXTERNAL_SERVICE_MEDIA_TYPE.WASM_COMPONENT,
    payloadDigest: PAYLOAD_DIGEST,
  });
  const artifact = await fixture.owner.resolveArtifact(
    fixture.declaration, SECURITY_CONTEXT);
  t.equal(artifact.artifactDigest, ARTIFACT_DIGEST,
    'the bindable artifact resolves as before');
});

test('an absent store and non-WASM artifacts bind unchanged', async (t) => {
  const withoutStore = createBindingFixture({withoutStore: true});
  const resolved = await withoutStore.owner.resolveArtifact(
    withoutStore.declaration, SECURITY_CONTEXT);
  t.equal(resolved.artifactDigest, ARTIFACT_DIGEST,
    'no store keeps the pre-store binding behavior');

  const container = createBindingFixture({
    artifact: bindableArtifact(RUNTIME_KIND.OCI_CONTAINER),
  });
  const containerArtifact = await container.owner.resolveArtifact(
    container.declaration, SECURITY_CONTEXT);
  t.equal(containerArtifact.artifactDigest, ARTIFACT_DIGEST,
    'container artifacts stay outside the WASM payload gate');
  t.equal(container.store.findCalls.length, 0,
    'the gate never queries the store for a container artifact');
});

function makeEngineStub(executed) {
  return {
    executeQuery: async (sql, params, options) => {
      executed.push({sql, params, options});
      return {success: true, rows: []};
    },
    getTablePartitions: () => [],
    parse: () => null,
    partitionResolver: {resolvePartitions: () => []},
    queryExecutor: {},
  };
}

test('the attachment binds ONE shared store to both owners over the ' +
  'dedicated coordination session', async (t) => {
  const executed = [];
  const commandOwner = {};
  const bindingOwner = {};
  const store = attachArtifactPayloadStore({
    serviceLifecycleCommandOwner: commandOwner,
    deploymentBindingOwner: bindingOwner,
    sqlQueryEngine: makeEngineStub(executed),
  });
  t.ok(store, 'a store is attached');
  t.equal(commandOwner.artifactPayloadStore, store);
  t.equal(bindingOwner.artifactPayloadStore, store,
    'both owners share the one store');
  const missing = await store.findSealedPayloadByArtifactDigest(
    ARTIFACT_DIGEST);
  t.same(missing, {found: false});
  t.equal(executed[0].options.sessionId,
    ARTIFACT_PAYLOAD_COORDINATION_SESSION,
    'store SQL rides the coordination session without issuingServiceId');

  const again = attachArtifactPayloadStore({
    serviceLifecycleCommandOwner: commandOwner,
    deploymentBindingOwner: bindingOwner,
    sqlQueryEngine: makeEngineStub([]),
  });
  t.equal(again, store, 'a re-attachment reuses the carried store');
  t.equal(commandOwner.artifactPayloadStore, store);
});

test('absent dependencies leave both owners untouched', (t) => {
  const commandOwner = {};
  t.equal(attachArtifactPayloadStore({
    serviceLifecycleCommandOwner: commandOwner,
    deploymentBindingOwner: {},
  }), null, 'no engine refuses attachment');
  t.equal(commandOwner.artifactPayloadStore, undefined);
  t.equal(attachArtifactPayloadStore({
    sqlQueryEngine: makeEngineStub([]),
  }), null, 'no consuming owner refuses attachment');
  t.end();
});

test('the SQL-runtime handoff attaches the store to the command owner ' +
  'and the deployment binding owner', async (t) => {
  const {attachSqlRuntimeToStartupOwner} = await import(
    '../../src/bootstrap/shared/startup-sql-runtime-handoff.js');
  const commandOwner = {
    catalogOwner: {getGateway: () => ({setSqlQueryEngine() {}})},
  };
  const deploymentBindingOwner = {};
  attachSqlRuntimeToStartupOwner({
    owner: {
      serviceLifecycleCommandOwner: commandOwner,
      systemMetadataOwners: {deploymentBindingOwner},
    },
    sqlQueryEngine: makeEngineStub([]),
    systemTableCache: {get: () => null, getAll: () => []},
  });
  t.ok(commandOwner.artifactPayloadStore,
    'the handoff attached the store to the lifecycle command owner');
  t.equal(deploymentBindingOwner.artifactPayloadStore,
    commandOwner.artifactPayloadStore,
    'the deployment binding owner shares the same store');
});
