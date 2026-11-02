/**
 * management-v1 fail-closed authority, proven through the BootstrapAPI Fastify
 * server as production composes it (real HTTP requests on a listening port).
 * Absence of effect is asserted through the owner's declared adapter ports.
 */
import fs from 'node:fs';
import path from 'node:path';
import {test} from '../../src/test-helpers/tap.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {CLUSTER_ID_CONFIG_KEY} from '../../src/bootstrap/cluster-identity-constants.js';
import {TABLES} from '../../src/constants/index.js';
import {
  BACKUP_MANIFEST_CONSTANTS, CLUSTER_FACTS_CONSTANTS, L3_BACKUP_RESTORE_REASON_CODE,
  L4_ROLLING_UPGRADE_REASON_CODE, L6_DECOMMISSION_REASON_CODE, MANAGEMENT_ERROR_CODE,
  MANAGEMENT_OPERATION_STATE, MANAGEMENT_V1_CONTRACT as C,
} from '../../src/bootstrap/owners/management-v1-constants.js';
import {
  ManagementV1Owner, computeCanonicalOperationDigest,
} from '../../src/bootstrap/owners/management-v1-owner.js';
import {BackupRestoreOwner} from '../../src/bootstrap/owners/backup-restore-owner.js';
import {RollingUpgradeOwner} from '../../src/bootstrap/owners/rolling-upgrade-owner.js';
import {MemoryBackupStorageAdapter} from '../helpers/management-v1-memory-storage-adapter.js';
import {initializeTestEnvironment} from './bootstrap-api-test-fixtures.js';

const GENUINE_CLUSTER_ID = 'cluster-genuine-0001';
const SEED_NODE_ID = 'mgmt-auth-seed';
const CREDS = Object.freeze({
  PGWIRE_AUTH_USER: 'mgmt-user', PGWIRE_AUTH_PASSWORD: 'mgmt-pass', PGWIRE_AUTH_DATABASE: 'mgmt-db',
});
const NODE_IDS = Object.freeze(['node-1', 'node-2', 'node-3']);
const CODE_UNCONFIGURED = 'CONTROL_PLANE_AUTH_UNCONFIGURED';
const CODE_UNAUTHORIZED = 'CONTROL_PLANE_UNAUTHORIZED';
const CODE_IDENTITY_UNESTABLISHED = 'CLUSTER_IDENTITY_UNESTABLISHED';
const FACTS_URL = '/management/v1/facts';
const OPERATIONS_URL = '/management/v1/operations';

initializeTestEnvironment();

const basic = (user, pass) => `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
const GOOD_AUTH = basic(CREDS.PGWIRE_AUTH_USER, CREDS.PGWIRE_AUTH_PASSWORD);

function durableCache(clusterId) {
  return {
    get: (table, key) => (table === TABLES.CONFIG && key === CLUSTER_ID_CONFIG_KEY && clusterId ?
      {config_key: CLUSTER_ID_CONFIG_KEY, config_value: clusterId} : null),
    getAll: () => [], filter: () => [], find: () => null, getReadyNodes: () => [],
  };
}

let opSeq = 0;
function envelope(kind, parameters, clusterId = GENUINE_CLUSTER_ID) {
  opSeq += 1;
  const env = {
    schemaVersion: C.SCHEMA_VERSION, sourceContract: C.SOURCE_CONTRACT,
    sourceContractVersion: C.SOURCE_CONTRACT_VERSION, protocolVersion: C.PROTOCOL_VERSION,
    capabilityVersion: C.CAPABILITY_VERSION, clusterId,
    operationId: `op-auth-${String(opSeq).padStart(4, '0')}-${'b'.repeat(16)}`,
    kind, parameters, sequence: opSeq, createdAtMs: 1000 + opSeq,
    expiresAtMs: 2000 + opSeq, requestedBy: 'operator-tap',
  };
  env.requestDigest = computeCanonicalOperationDigest(env);
  return env;
}

const BACKUP_PARAMS = Object.freeze({backupId: 'bkp-auth-1', destinationUri: 'memory://auth/b1'});
const RELEASE_PARAMS = Object.freeze({
  targetVersion: '0.5.0', targetArtifactDigest: `sha256:${'5'.repeat(64)}`,
});

/** Every declared management adapter port, each recording its use. */
function recordingAdapters() {
  const effects = {
    snapshotReads: 0, healthReads: 0, capacityReads: 0, exports: 0, hydrates: 0,
    drains: 0, restarts: 0, decommissions: 0,
  };
  const storage = new MemoryBackupStorageAdapter();
  const adapters = {
    storageAdapter: storage,
    exportPartitionSnapshots: () => {
      effects.exports += 1;
      return [{partitionId: 1, raftLogIndex: 10, raftTerm: 1, payload: 'rows-1'}];
    },
    hydratePartitionSnapshots: () => {
      effects.hydrates += 1;
    },
    getClusterSnapshot: () => {
      effects.snapshotReads += 1;
      return {
        nodeCount: 3, readyNodeCount: 3, underReplicatedPartitionCount: 0,
        nodeIds: [...NODE_IDS], ready: true, hasPartitionQuorum: true,
      };
    },
    healthSnapshot: () => {
      effects.healthReads += 1;
      return {state: CLUSTER_FACTS_CONSTANTS.HEALTH_HEALTHY, ready: true, reasons: []};
    },
    capacitySnapshot: () => {
      effects.capacityReads += 1;
      return {state: CLUSTER_FACTS_CONSTANTS.CAPACITY_NORMAL, reasons: []};
    },
    onDrainNodeLeadership: () => {
      effects.drains += 1;
    },
    onTriggerNodeRestart: () => {
      effects.restarts += 1;
    },
    onDecommissionNode: () => {
      effects.decommissions += 1;
    },
  };
  const total = () => Object.values(effects).reduce((a, b) => a + b, 0) +
    storage.writeCount + storage.readCount + storage.storage.size;
  return {adapters, effects, storage, total};
}

async function startApi(t, options) {
  const api = new BootstrapAPI({
    seedNodeId: SEED_NODE_ID, seedNodeAddress: 'ws://mgmt-auth-seed:8082', ...options,
  });
  await api.initialize(0);
  t.teardown(() => api.shutdown());
  const {port} = api.getFastify().server.address();
  const call = async (method, url, {body, authorization} = {}) => {
    const headers = {};
    if (authorization) headers.authorization = authorization;
    if (body) headers['content-type'] = 'application/json';
    const res = await fetch(`http://127.0.0.1:${port}${url}`, {
      method, headers, body: body ? JSON.stringify(body) : undefined,
    });
    return {status: res.status, json: await res.json()};
  };
  return {api, call};
}

function managementRequests() {
  const env = envelope('CREATE_BACKUP', {...BACKUP_PARAMS});
  return [
    ['GET', FACTS_URL, undefined],
    ['POST', OPERATIONS_URL, env],
    ['GET', `${OPERATIONS_URL}/${env.operationId}`, undefined],
  ];
}

test('unauthorized management requests are refused before any owner effect', async (t) => {
  const rec = recordingAdapters();
  const {api, call} = await startApi(t, {
    systemTableCache: durableCache(GENUINE_CLUSTER_ID), requestCellEnv: {...CREDS},
    managementAdapters: rec.adapters,
  });
  const wrong = [
    undefined, basic(CREDS.PGWIRE_AUTH_USER, 'wrong'), basic('intruder', CREDS.PGWIRE_AUTH_PASSWORD),
    'Basic !!!not-base64', 'Bearer token',
  ];
  const requests = managementRequests();
  for (const [method, url, body] of requests) {
    for (const authorization of wrong) {
      const res = await call(method, url, {body, authorization});
      t.equal(res.status, 401, `${method} ${url} ${authorization} -> 401`);
      t.equal(res.json.code, CODE_UNAUTHORIZED);
    }
  }
  t.equal(rec.total(), 0, 'no adapter port was touched by any refused request');
  t.equal(api.managementV1Owner, undefined, 'management owner never constructed');

  const status = await call('GET', requests[2][1], {authorization: GOOD_AUTH});
  t.equal(status.status, 404, 'refused POST left no operation record');
  t.equal(status.json.code, MANAGEMENT_ERROR_CODE.OPERATION_NOT_FOUND);
  const accepted = await call('POST', OPERATIONS_URL, {body: requests[1][2],
    authorization: GOOD_AUTH});
  t.equal(accepted.status, 200, 'positive control: the authorized request reaches the owner');
  t.ok(rec.storage.writeCount > 0, 'positive control: the storage port records real effects');
});

test('custom control authenticator refusals are typed and effect-free', async (t) => {
  const rec = recordingAdapters();
  for (const authenticateControlRequest of [() => false, () => {
    throw new Error('boom');
  }]) {
    const {api, call} = await startApi(t, {
      systemTableCache: durableCache(GENUINE_CLUSTER_ID), authenticateControlRequest,
      managementAdapters: rec.adapters,
    });
    for (const [method, url, body] of managementRequests()) {
      const res = await call(method, url, {body, authorization: GOOD_AUTH});
      t.equal(res.status, 401);
      t.equal(res.json.code, CODE_UNAUTHORIZED);
    }
    t.equal(api.managementV1Owner, undefined);
  }
  t.equal(rec.total(), 0);
});

test('absent control-plane credentials refuse every management route', async (t) => {
  const rec = recordingAdapters();
  for (const requestCellEnv of [undefined, {},
    {PGWIRE_AUTH_USER: '', PGWIRE_AUTH_PASSWORD: '', PGWIRE_AUTH_DATABASE: ''}]) {
    const {api, call} = await startApi(t, {
      systemTableCache: durableCache(GENUINE_CLUSTER_ID), requestCellEnv,
      managementAdapters: rec.adapters,
    });
    for (const [method, url, body] of managementRequests()) {
      for (const authorization of [undefined, GOOD_AUTH]) {
        const res = await call(method, url, {body, authorization});
        t.equal(res.status, 403, `${method} ${url} unconfigured -> 403`);
        t.equal(res.json.code, CODE_UNCONFIGURED);
      }
    }
    t.equal(api.managementV1Owner, undefined, 'management owner never constructed');
    // Node-to-node control routes are a separate owner (0.5 cluster trust):
    // their unconfigured behaviour is unchanged and recorded as a finding.
    const nodeRoute = await call('GET', '/cluster/state');
    t.equal(nodeRoute.status, 200);
  }
  t.equal(rec.total(), 0, 'no adapter port was touched');
  t.throws(() => new BootstrapAPI({seedNodeId: SEED_NODE_ID,
    requestCellEnv: {PGWIRE_AUTH_USER: 'only-user'}}), 'half-configured credentials fail startup');
});

test('cluster identity is never fabricated and unknown runtime state never reads healthy',
  async (t) => {
    const {call} = await startApi(t, {
      systemTableCache: durableCache(null), requestCellEnv: {...CREDS},
    });
    const facts = await call('GET', FACTS_URL, {authorization: GOOD_AUTH});
    t.equal(facts.status, 200);
    const f = facts.json.facts;
    t.equal(f.cluster.identity, null, 'no identity invented from the seed node id');
    t.equal(f.cluster.identityState, CLUSTER_FACTS_CONSTANTS.IDENTITY_UNKNOWN);
    t.equal(f.health.state, CLUSTER_FACTS_CONSTANTS.HEALTH_UNKNOWN);
    t.equal(f.health.ready, false);
    t.same(f.health.reasons, [CLUSTER_FACTS_CONSTANTS.REASON_HEALTH_SNAPSHOT_UNAVAILABLE]);
    t.equal(f.capacity.state, CLUSTER_FACTS_CONSTANTS.CAPACITY_UNKNOWN);
    t.same(f.capacity.reasons, [CLUSTER_FACTS_CONSTANTS.REASON_CAPACITY_SNAPSHOT_UNAVAILABLE]);
    t.equal(f.topology.state, CLUSTER_FACTS_CONSTANTS.TOPOLOGY_UNKNOWN);
    t.notOk('nodeCount' in f.topology, 'no topology count is reported without a snapshot');

    for (const claimed of [SEED_NODE_ID, 'lagrange-cluster-primary', 'lagrange-cluster-default']) {
      const res = await call('POST', OPERATIONS_URL, {
        body: envelope('NOOP', {reason: 'probe'}, claimed), authorization: GOOD_AUTH,
      });
      t.equal(res.status, 503, `${claimed} refused while identity is unestablished`);
      t.equal(res.json.code, CODE_IDENTITY_UNESTABLISHED);
    }
    t.equal(new ManagementV1Owner().getClusterId(), null);
    t.equal(new BackupRestoreOwner().getClusterId(), null);
  });

test('production composition installs no capability adapter: operations are unsupported, ' +
  'never SUCCEEDED, and leave no effect', async (t) => {
  const {api, call} = await startApi(t, {
    systemTableCache: durableCache(GENUINE_CLUSTER_ID), requestCellEnv: {...CREDS},
  });
  const facts = await call('GET', FACTS_URL, {authorization: GOOD_AUTH});
  t.equal(facts.json.facts.cluster.identity, GENUINE_CLUSTER_ID);
  t.equal(facts.json.facts.cluster.identityState, CLUSTER_FACTS_CONSTANTS.IDENTITY_ESTABLISHED);
  for (const cap of Object.values(facts.json.facts.capabilities)) {
    t.equal(cap, CLUSTER_FACTS_CONSTANTS.CAPABILITY_UNSUPPORTED);
  }
  for (const [kind, params, code] of [
    ['TRANSITION_RELEASE', RELEASE_PARAMS, L4_ROLLING_UPGRADE_REASON_CODE.UPGRADE_CAPABILITY_UNSUPPORTED],
    ['CREATE_BACKUP', BACKUP_PARAMS, L3_BACKUP_RESTORE_REASON_CODE.BACKUP_CAPABILITY_UNSUPPORTED],
    ['DECOMMISSION_NODE', {lagrangeNodeId: 'node-1'},
      L6_DECOMMISSION_REASON_CODE.DECOMMISSION_CAPABILITY_UNSUPPORTED],
  ]) {
    const env = envelope(kind, {...params});
    const res = await call('POST', OPERATIONS_URL, {body: env, authorization: GOOD_AUTH});
    t.equal(res.status, 200);
    t.equal(res.json.state, MANAGEMENT_OPERATION_STATE.REJECTED, `${kind} refused`);
    t.equal(res.json.reasonCode, code);
    const status = await call('GET', `${OPERATIONS_URL}/${env.operationId}`,
      {authorization: GOOD_AUTH});
    t.equal(status.json.state, MANAGEMENT_OPERATION_STATE.REJECTED);
  }
  const owner = api.getManagementV1Owner();
  t.equal(owner.backupRestoreOwner.storageAdapter, null, 'no in-memory storage substitute');
  t.equal(owner.backupRestoreOwner.exportPartitionSnapshots, null);
  t.equal(owner.rollingUpgradeOwner.onDrainNodeLeadership, null);
  t.equal(owner.rollingUpgradeOwner.onTriggerNodeRestart, null);
  t.equal(owner.backupRestoreOwner.operations.size, 1, 'only the refusal record exists');
  t.equal(owner.backupRestoreOwner.completedBackups.size, 0);

  const startup = fs.readFileSync(path.resolve('src/lagrange-runtime-startup.js'), 'utf8');
  t.notOk(startup.includes('managementAdapters'), 'production startup injects no adapters');
});

test('capability claims without installed adapters are ignored and restore refuses first',
  async (t) => {
    const storage = new MemoryBackupStorageAdapter();
    const claims = {capabilitySupported: true, backupRestoreSupported: true,
      rollingUpgradeSupported: true, decommissionSupported: true};
    const mgmt = new ManagementV1Owner({clusterId: GENUINE_CLUSTER_ID, storageAdapter: storage,
      ...claims});
    for (const cap of Object.values(mgmt.getClusterFacts().facts.capabilities)) {
      t.equal(cap, CLUSTER_FACTS_CONSTANTS.CAPABILITY_UNSUPPORTED);
    }
    const res = await mgmt.submitOperation(envelope('CREATE_BACKUP', {...BACKUP_PARAMS}));
    t.equal(res.reasonCode, L3_BACKUP_RESTORE_REASON_CODE.BACKUP_CAPABILITY_UNSUPPORTED);
    t.equal(storage.writeCount, 0);
    t.equal(new RollingUpgradeOwner(claims).capabilitySupported, false);
    const bkp = new BackupRestoreOwner({clusterId: GENUINE_CLUSTER_ID, ...claims});
    t.equal(bkp.capabilitySupported, false);
    await t.rejects(() => bkp.restoreFromBackup({destinationUri: 'memory://auth/b1'}),
      {code: L3_BACKUP_RESTORE_REASON_CODE.BACKUP_CAPABILITY_UNSUPPORTED});
    t.equal(bkp.isRestoreInProgress() || bkp.isRestoreAborted(), false, 'no restore effect');
    t.equal(bkp.getClusterId(), GENUINE_CLUSTER_ID);
  });

function durableIdentityOwner(store, rec) {
  return new ManagementV1Owner({
    ...rec.adapters,
    getClusterId: () => store.clusterId,
    onSetClusterId: (id) => {
      store.clusterId = id;
    },
  });
}

test('the genuine cluster identity survives restart and restore', async (t) => {
  const cache = durableCache(GENUINE_CLUSTER_ID);
  const first = await startApi(t, {systemTableCache: cache, requestCellEnv: {...CREDS}});
  const before = await first.call('GET', FACTS_URL, {authorization: GOOD_AUTH});
  await first.api.shutdown();
  const restarted = await startApi(t, {systemTableCache: cache, requestCellEnv: {...CREDS},
    seedNodeId: 'a-different-seed-after-restart'});
  const after = await restarted.call('GET', FACTS_URL, {authorization: GOOD_AUTH});
  t.equal(before.json.facts.cluster.identity, GENUINE_CLUSTER_ID);
  t.equal(after.json.facts.cluster.identity, GENUINE_CLUSTER_ID, 'restart keeps the identity');

  const rec = recordingAdapters();
  const source = durableIdentityOwner({clusterId: GENUINE_CLUSTER_ID}, rec);
  const backup = await source.submitOperation(envelope('CREATE_BACKUP', {...BACKUP_PARAMS}));
  t.equal(backup.state, MANAGEMENT_OPERATION_STATE.SUCCEEDED);

  const target = {clusterId: null};
  const fresh = durableIdentityOwner(target, rec);
  t.equal(fresh.getClusterFacts().facts.cluster.identityState,
    CLUSTER_FACTS_CONSTANTS.IDENTITY_UNKNOWN);
  await fresh.backupRestoreOwner.restoreFromBackup({
    destinationUri: BACKUP_PARAMS.destinationUri,
    cliFlags: [BACKUP_MANIFEST_CONSTANTS.PRESERVE_IDENTITY_FLAG],
  });
  t.equal(fresh.getClusterFacts().facts.cluster.identity, GENUINE_CLUSTER_ID);
  t.equal(durableIdentityOwner(target, rec).getClusterId(), GENUINE_CLUSTER_ID,
    'restored identity survives a restart of the owner');

  const clean = {clusterId: null};
  const restored = await durableIdentityOwner(clean, rec).backupRestoreOwner.restoreFromBackup({
    destinationUri: BACKUP_PARAMS.destinationUri,
  });
  t.not(restored.clusterIdentity, GENUINE_CLUSTER_ID);
  t.ok(restored.clusterIdentity.startsWith(C.DEFAULT_CLUSTER_ID_PREFIX));
  t.same(restored.restoredFrom, {sourceClusterIdentity: GENUINE_CLUSTER_ID,
    backupId: BACKUP_PARAMS.backupId});
  t.equal(durableIdentityOwner(clean, rec).getClusterId(), restored.clusterIdentity,
    'a clean-cluster identity is durable across restart');
});
