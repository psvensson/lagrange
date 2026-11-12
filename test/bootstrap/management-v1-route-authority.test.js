import {serviceRoleObservation} from '../test-helpers/service-role-observation.js';
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
import {INITIAL_PARTITION_IDS} from '../../src/bootstrap/system-table-schemas-constants.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {TABLES} from '../../src/constants/index.js';
import {
  hydrateBootstrapApiRuntime,
} from '../../src/entrypoint-runtime-admin-composition.js';
import {
  BACKUP_MANIFEST_CONSTANTS, CLUSTER_FACTS_CONSTANTS, L3_BACKUP_RESTORE_REASON_CODE,
  L4_ROLLING_UPGRADE_REASON_CODE, L6_DECOMMISSION_REASON_CODE, MANAGEMENT_ERROR_CODE,
  MANAGEMENT_OPERATION_STATE, MANAGEMENT_V1_CONTRACT as C,
} from '../../src/bootstrap/owners/management-v1-constants.js';
import {
  ManagementV1Owner, computeCanonicalOperationDigest,
} from '../../src/bootstrap/owners/management-v1-owner.js';
import {BackupRestoreOwner} from '../../src/bootstrap/owners/backup-restore-owner.js';
import {
  evaluatePartitionQuorumAuthority,
} from '../../src/bootstrap/owners/partition-quorum-authority.js';
import {RollingUpgradeOwner} from '../../src/bootstrap/owners/rolling-upgrade-owner.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {
  buildLocalPartitionService,
} from './management-v1-local-service-fixture.js';
import {
  applyReplicaDemotion,
  applyReplicaLeadership,
} from '../../src/raft/replica-leadership-state.js';
import {MemoryBackupStorageAdapter} from '../helpers/management-v1-memory-storage-adapter.js';
import {
  createCanonicalReadinessService,
  initializeTestEnvironment,
} from './bootstrap-api-test-fixtures.js';

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
        clusterId: GENUINE_CLUSTER_ID,
        configurationKey: 'conf-auth-test',
        membershipGenerationIndex: 1,
        lifecycleIncarnation: 'inc-auth-test',
        capturedAtMs: Date.now(),
        maxFreshnessMs: 30000,
        operationAuthority: {
          contractVersion: 1,
          configurationKey: 'conf-auth-test',
          membershipGenerationIndex: 1,
          lifecycleIncarnation: 'inc-auth-test',
          clusterId: GENUINE_CLUSTER_ID,
          capturedAtMs: Date.now(),
          maxFreshnessMs: 30000,
          hasQuorum: true,
        },
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

function buildLeaderWitness(partitionId, servingNodeId = NODE_IDS[0], nowMs = Date.now()) {
  return Object.freeze({
    state: 'observed',
    partitionId,
    role: 'leader',
    servingNodeId,
    servingReplicaId: `${partitionId}-${servingNodeId}`,
    term: 3,
    appliedIndex: 24,
    commitIndex: 24,
    observedAtMs: nowMs,
  });
}

function buildCommittedNodeRows(nowMs = Date.now()) {
  return NODE_IDS.map((nodeId) => ({
    node_id: nodeId,
    node_address: `ws://${nodeId}:8082`,
    status: 'active',
    connection_state: 'ready',
    ready_lease_expires_at: nowMs + 60000,
    last_heartbeat: nowMs,
  }));
}

function buildSystemPartitionRows(leaderNodeId = NODE_IDS[0]) {
  return [TABLES.NODES, TABLES.PARTITIONS, TABLES.SERVICES].map((tableName) => ({
    partition_id: INITIAL_PARTITION_IDS[tableName],
    table_id: tableName,
    table_name: tableName,
    replica_count: 3,
    leader_node_id: leaderNodeId,
  }));
}

function buildVoterServiceRowsForPartition(partitionId, replicaIdNodes = NODE_IDS) {
  return replicaIdNodes.map((nodeId) => ({
    service_id: `${partitionId}-${nodeId}`,
    service_type: 'partition',
    partition_id: partitionId,
    replica_id: `${partitionId}-${nodeId}`,
    node_id: nodeId,
    status: 'active',
    // Production PartitionServiceRowOwner collapses leader -> follower on services rows
    // while partitions.leader_node_id owns partition leader identity.
    raft_role: 'follower',
  }));
}

function buildOwnerRpcSqlEngine(partitionServicesMap) {
  return {
    queryExecutor: {
      executeOnPartition: async (partitionId, sql, params = []) => {
        const svc = partitionServicesMap.get(partitionId);
        if (!svc || svc.getRole?.() !== 'leader') {
          return {success: false, error: 'partition_leader_unavailable', rows: []};
        }
        return svc.executeLocalQuery(sql, params);
      },
    },
  };
}

function physicalCapabilityAdapters() {
  const effects = {exports: 0, drains: 0, restarts: 0, decommissions: 0};
  const storage = new MemoryBackupStorageAdapter();
  const adapters = {
    storageAdapter: storage,
    exportPartitionSnapshots: () => {
      effects.exports += 1;
      return [{partitionId: 1, raftLogIndex: 10, raftTerm: 3, payload: 'rows-1'}];
    },
    hydratePartitionSnapshots: () => {},
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
  const effectCount = () =>
    effects.exports + effects.drains + effects.restarts + effects.decommissions +
    storage.writeCount + storage.storage.size;
  return {adapters, effects, storage, effectCount};
}

function buildPopulatedProjectionCache(nodeRows, partitionRows, serviceRows) {
  return {
    get: (table, key) => (table === TABLES.CONFIG && key === CLUSTER_ID_CONFIG_KEY ?
      {config_key: CLUSTER_ID_CONFIG_KEY, config_value: GENUINE_CLUSTER_ID} : null),
    getAll: (table) => {
      if (table === TABLES.NODES) return nodeRows;
      if (table === TABLES.PARTITIONS) return partitionRows;
      if (table === TABLES.SERVICES) return serviceRows;
      return [];
    },
    filter: () => [],
    find: () => null,
  };
}

test('production composition rejects missing ports and stale caches: cached counts never ' +
  'grant management permission', async (t) => {
  const now = Date.now();
  const cachedNodes = buildCommittedNodeRows(now);
  const cachedPartitions = [
    ...buildSystemPartitionRows(NODE_IDS[0]),
    {partition_id: 'p-app', table_id: 'app', table_name: 'app',
      replica_count: 3, leader_node_id: NODE_IDS[0]},
  ];
  const cachedServices = cachedPartitions.flatMap(
    (p) => buildVoterServiceRowsForPartition(p.partition_id, NODE_IDS),
  );
  const populatedCache = buildPopulatedProjectionCache(
    cachedNodes,
    cachedPartitions,
    cachedServices,
  );
  const readinessStub = createCanonicalReadinessService(NODE_IDS);

  // 1a. Missing authoritative control-plane read port (populated cache alone).
  const missingReadPortCaps = physicalCapabilityAdapters();
  const missingPortRun = await startApi(t, {
    seedNodeId: NODE_IDS[0],
    systemTableCache: populatedCache,
    requestCellEnv: {...CREDS},
    controlPlaneReadinessService: readinessStub,
    managementAdapters: missingReadPortCaps.adapters,
  });
  t.equal(await missingPortRun.api.getManagementClusterSnapshot(), null,
    'missing canonical authority port yields unavailable snapshot despite 3/3 cache');
  const missingPortFacts = await missingPortRun.call('GET', FACTS_URL, {authorization: GOOD_AUTH});
  t.equal(missingPortFacts.json.facts.topology.state, CLUSTER_FACTS_CONSTANTS.TOPOLOGY_UNKNOWN);
  for (const [kind, params] of [
    ['CREATE_BACKUP', BACKUP_PARAMS],
    ['TRANSITION_RELEASE', RELEASE_PARAMS],
    ['DECOMMISSION_NODE', {lagrangeNodeId: NODE_IDS[2]}],
  ]) {
    const res = await missingPortRun.call('POST', OPERATIONS_URL, {
      body: envelope(kind, {...params}), authorization: GOOD_AUTH,
    });
    t.equal(res.json.state, MANAGEMENT_OPERATION_STATE.REJECTED,
      `${kind} rejected when canonical authority port is missing`);
  }
  t.equal(missingReadPortCaps.effectCount(), 0, 'cached counts caused zero physical effects');

  // 1b. Authoritative read port wired, but local PartitionService port missing for app partition.
  const systemServicesMap = new Map([
    [INITIAL_PARTITION_IDS[TABLES.NODES], buildLocalPartitionService(
      INITIAL_PARTITION_IDS[TABLES.NODES], {getRows: () => cachedNodes})],
    [INITIAL_PARTITION_IDS[TABLES.PARTITIONS], buildLocalPartitionService(
      INITIAL_PARTITION_IDS[TABLES.PARTITIONS], {getRows: () => cachedPartitions})],
    [INITIAL_PARTITION_IDS[TABLES.SERVICES], buildLocalPartitionService(
      INITIAL_PARTITION_IDS[TABLES.SERVICES], {getRows: () => cachedServices})],
  ]);
  const missingLocalRuntimeCdc = new CDCIntegrationService({
    nodeId: NODE_IDS[0],
    sqlQueryEngine: buildOwnerRpcSqlEngine(systemServicesMap),
    partitionServicesProvider: () => systemServicesMap,
    systemTableCache: populatedCache,
  });
  const missingLocalCaps = physicalCapabilityAdapters();
  const missingLocalRun = await startApi(t, {
    seedNodeId: NODE_IDS[0],
    systemTableCache: populatedCache,
    cdcIntegrationService: missingLocalRuntimeCdc,
    partitionServices: systemServicesMap, // p-app missing from local partition runtime!
    requestCellEnv: {...CREDS},
    controlPlaneReadinessService: readinessStub,
    managementAdapters: missingLocalCaps.adapters,
  });
  const missingLocalSnap = await missingLocalRun.api.getManagementClusterSnapshot();
  t.equal(missingLocalSnap.hasPartitionQuorum, false,
    'missing local PartitionService for locally hosted partition rejects quorum');
  for (const [kind, params, code] of [
    ['CREATE_BACKUP', BACKUP_PARAMS, L3_BACKUP_RESTORE_REASON_CODE.PARTITION_QUORUM_UNAVAILABLE],
    ['TRANSITION_RELEASE', RELEASE_PARAMS, L4_ROLLING_UPGRADE_REASON_CODE.QUORUM_SAFETY_HALT],
    ['DECOMMISSION_NODE', {lagrangeNodeId: NODE_IDS[2]},
      L6_DECOMMISSION_REASON_CODE.QUORUM_SAFETY_VIOLATION],
  ]) {
    const res = await missingLocalRun.call('POST', OPERATIONS_URL, {
      body: envelope(kind, {...params}), authorization: GOOD_AUTH,
    });
    t.equal(res.json.state, MANAGEMENT_OPERATION_STATE.REJECTED);
    t.equal(res.json.reasonCode, code, `${kind} cites explicit quorum refusal code`);
  }
  t.equal(missingLocalCaps.effectCount(), 0);

  // 2. Stale cache says 3/3 active, while canonical owner reports 1/3 minority & cache source.
  const minorityServices = [
    ...buildSystemPartitionRows(NODE_IDS[0]).flatMap(
      (p) => buildVoterServiceRowsForPartition(p.partition_id, NODE_IDS),
    ),
    ...buildVoterServiceRowsForPartition('p-app', [NODE_IDS[0]]),
  ];
  const staleCacheMap = new Map([
    ...systemServicesMap.entries(),
    [INITIAL_PARTITION_IDS[TABLES.SERVICES], buildLocalPartitionService(
      INITIAL_PARTITION_IDS[TABLES.SERVICES], {getRows: () => minorityServices})],
    ['p-app', buildLocalPartitionService('p-app')],
  ]);
  const staleCacheCdc = new CDCIntegrationService({
    nodeId: NODE_IDS[0],
    sqlQueryEngine: buildOwnerRpcSqlEngine(staleCacheMap),
    partitionServicesProvider: () => staleCacheMap,
    systemTableCache: populatedCache,
  });
  const staleCaps = physicalCapabilityAdapters();
  const staleRun = await startApi(t, {
    seedNodeId: NODE_IDS[0],
    systemTableCache: populatedCache,
    cdcIntegrationService: staleCacheCdc,
    partitionServices: staleCacheMap,
    requestCellEnv: {...CREDS},
    controlPlaneReadinessService: readinessStub,
    managementAdapters: staleCaps.adapters,
  });
  const staleSnap = await staleRun.api.getManagementClusterSnapshot();
  t.equal(staleSnap.hasPartitionQuorum, false, 'stale 3/3 cache cannot override 1/3 owner rows');
  const staleBkp = await staleRun.call('POST', OPERATIONS_URL, {
    body: envelope('CREATE_BACKUP', {...BACKUP_PARAMS}), authorization: GOOD_AUTH,
  });
  t.equal(staleBkp.json.state, MANAGEMENT_OPERATION_STATE.REJECTED);
  t.equal(staleBkp.json.reasonCode, L3_BACKUP_RESTORE_REASON_CODE.PARTITION_QUORUM_UNAVAILABLE);
  t.equal(staleCaps.effectCount(), 0);

  // Cache-sourced read on authoritative view is rejected even if rows claim 3/3.
  const cacheSpoofRun = await startApi(t, {
    seedNodeId: NODE_IDS[0],
    systemTableCache: populatedCache,
    authoritativeControlPlaneView: {
      canRead: () => true,
      readReadinessOwnerRows: async (tableName) => ({
        success: true,
        rowSetComplete: true,
        source: 'local_cdc_cache',
        rows: populatedCache.getAll(tableName),
        readAuthorityWitness: buildLeaderWitness(INITIAL_PARTITION_IDS[tableName]),
      }),
    },
    partitionServices: staleCacheMap,
    requestCellEnv: {...CREDS},
    controlPlaneReadinessService: readinessStub,
  });
  t.equal(await cacheSpoofRun.api.getManagementClusterSnapshot(), null,
    'local_cdc_cache source is rejected at the partition-quorum authority boundary');
});

test('production composition rejects incomplete inventories, duplicate/learner rows, ' +
  'missing leader evidence, and admits valid owner-backed quorum', async (t) => {
  const now = Date.now();
  const committedNodes = buildCommittedNodeRows(now);
  let committedPartitions = [
    ...buildSystemPartitionRows(NODE_IDS[0]),
    {partition_id: 'p-app', table_id: 'app', table_name: 'app',
      replica_count: 3, leader_node_id: NODE_IDS[0]},
  ];
  let committedServices = committedPartitions.flatMap(
    (p) => buildVoterServiceRowsForPartition(p.partition_id, NODE_IDS),
  );
  let servicesQueryOverride = {};
  const partitionServices = new Map([
    [INITIAL_PARTITION_IDS[TABLES.NODES], buildLocalPartitionService(
      INITIAL_PARTITION_IDS[TABLES.NODES], {getRows: () => committedNodes})],
    [INITIAL_PARTITION_IDS[TABLES.PARTITIONS], buildLocalPartitionService(
      INITIAL_PARTITION_IDS[TABLES.PARTITIONS], {getRows: () => committedPartitions})],
    [INITIAL_PARTITION_IDS[TABLES.SERVICES], buildLocalPartitionService(
      INITIAL_PARTITION_IDS[TABLES.SERVICES], {
        getRows: () => committedServices,
        queryResultOverrides: () => servicesQueryOverride,
      })],
  ]);
  const setAppLocalService = (overrides = {}) => {
    partitionServices.set('p-app', buildLocalPartitionService('p-app', {
      tableId: 'app',
      tableName: 'app',
      ...overrides,
    }));
  };
  setAppLocalService();

  const identityOnlyCache = durableCache(GENUINE_CLUSTER_ID);
  const cdcIntegrationService = new CDCIntegrationService({
    nodeId: NODE_IDS[0],
    sqlQueryEngine: buildOwnerRpcSqlEngine(partitionServices),
    partitionServicesProvider: () => partitionServices,
    systemTableCache: identityOnlyCache,
  });
  const readinessService = createCanonicalReadinessService(NODE_IDS);
  const caps = physicalCapabilityAdapters();
  const {api, call} = await startApi(t, {
    seedNodeId: NODE_IDS[0],
    systemTableCache: durableCache(null),
    requestCellEnv: {...CREDS},
    managementAdapters: caps.adapters,
  });
  // Wire via real production hydrateBootstrapApiRuntime composition helper.
  hydrateBootstrapApiRuntime({
    bootstrapAPI: api,
    systemTableCache: identityOnlyCache,
    messageGroupServices: new Map(),
    partitionServices,
    replicaHandler: {localServices: partitionServices},
    cdcIntegrationService,
    controlPlaneReadinessService: readinessService,
    epochManager: null,
    messageRouter: null,
    startupRecoveryCoordinator: null,
  });

  // 3. Incomplete inventories rejected: partial, rowSetComplete: false, invalid witness, empty.
  for (const override of [
    {partial: true},
    {rowSetComplete: false},
    {readAuthorityWitness: {state: 'observed', partitionId: 'wrong-partition', role: 'leader',
      servingNodeId: NODE_IDS[0], servingReplicaId: 'r1', term: 3,
      appliedIndex: 1, commitIndex: 1, observedAtMs: now}},
    {readAuthorityWitness: null},
  ]) {
    servicesQueryOverride = override;
    t.equal(await api.getManagementClusterSnapshot(), null,
      `incomplete/unwitnessed read rejected: ${JSON.stringify(override)}`);
  }
  servicesQueryOverride = {};

  const savedPartitions = committedPartitions;
  committedPartitions = [];
  const emptyPartSnap = await api.getManagementClusterSnapshot();
  t.equal(emptyPartSnap.hasPartitionQuorum, false, 'empty partitions inventory rejected');
  committedPartitions = [
    ...buildSystemPartitionRows(NODE_IDS[0]),
    {partition_id: 'p-app', table_id: 'app', table_name: 'app',
      replica_count: 0, leader_node_id: NODE_IDS[0]},
  ];
  t.equal((await api.getManagementClusterSnapshot()).hasPartitionQuorum, false,
    'invalid/zero replica_count rejected');
  committedPartitions = savedPartitions;

  // 4a. Learner rows never count toward voter majority (1 voter + 2 learners < 2 majority).
  const systemVoterRows = buildSystemPartitionRows(NODE_IDS[0]).flatMap(
    (p) => buildVoterServiceRowsForPartition(p.partition_id, NODE_IDS),
  );
  committedServices = [
    ...systemVoterRows,
    {service_id: 'p-app-n1', service_type: 'partition', partition_id: 'p-app',
      replica_id: 'p-app-n1', node_id: NODE_IDS[0], status: 'active', raft_role: 'leader'},
    {service_id: 'p-app-n2-learner', service_type: 'partition', partition_id: 'p-app',
      replica_id: 'p-app-n2-learner', node_id: NODE_IDS[1], status: 'active',
      raft_role: 'learner'},
    {service_id: 'p-app-n3-learner', service_type: 'partition', partition_id: 'p-app',
      replica_id: 'p-app-n3-learner', node_id: NODE_IDS[2], status: 'active',
      raft_role: 'learner'},
  ];
  const learnerSnap = await api.getManagementClusterSnapshot();
  t.equal(learnerSnap.hasPartitionQuorum, false, '1 voter + 2 learners fails 3-replica quorum');
  t.equal(learnerSnap.underReplicatedPartitionCount, 1);
  const learnerBkp = await call('POST', OPERATIONS_URL, {
    body: envelope('CREATE_BACKUP', {backupId: 'bkp-lrn', destinationUri: 'memory://auth/lrn'}),
    authorization: GOOD_AUTH,
  });
  t.equal(learnerBkp.json.state, MANAGEMENT_OPERATION_STATE.REJECTED);
  t.equal(learnerBkp.json.reasonCode, L3_BACKUP_RESTORE_REASON_CODE.PARTITION_QUORUM_UNAVAILABLE);

  // 4b. Duplicate replica_id / service_id rows rejected.
  committedServices = [
    ...systemVoterRows,
    {service_id: 'p-app-dup-1', service_type: 'partition', partition_id: 'p-app',
      replica_id: 'same-replica', node_id: NODE_IDS[0], status: 'active', raft_role: 'leader'},
    {service_id: 'p-app-dup-2', service_type: 'partition', partition_id: 'p-app',
      replica_id: 'same-replica', node_id: NODE_IDS[1], status: 'active', raft_role: 'follower'},
  ];
  t.equal((await api.getManagementClusterSnapshot()).hasPartitionQuorum, false,
    'duplicate (partition_id, replica_id) rows rejected');

  // 4c. Duplicate active voter rows on the same (partition_id, node_id) rejected.
  committedServices = [
    ...systemVoterRows,
    {service_id: 'p-app-n1-a', service_type: 'partition', partition_id: 'p-app',
      replica_id: 'p-app-n1-a', node_id: NODE_IDS[0], status: 'active', raft_role: 'leader'},
    {service_id: 'p-app-n1-b', service_type: 'partition', partition_id: 'p-app',
      replica_id: 'p-app-n1-b', node_id: NODE_IDS[0], status: 'active', raft_role: 'follower'},
  ];
  t.equal((await api.getManagementClusterSnapshot()).hasPartitionQuorum, false,
    'duplicate active voter rows on same node_id rejected');

  // 5a. Missing leader_node_id rejected despite 3 distinct active follower voters.
  committedServices = savedPartitions.flatMap(
    (p) => buildVoterServiceRowsForPartition(p.partition_id, NODE_IDS),
  );
  committedPartitions = [
    ...buildSystemPartitionRows(NODE_IDS[0]),
    {partition_id: 'p-app', table_id: 'app', table_name: 'app',
      replica_count: 3, leader_node_id: null},
  ];
  t.equal((await api.getManagementClusterSnapshot()).hasPartitionQuorum, false,
    'missing leader_node_id rejected even with 3/3 active follower voters');

  // 5b. leader_node_id naming a learner replica rejected.
  committedPartitions = [
    ...buildSystemPartitionRows(NODE_IDS[0]),
    {partition_id: 'p-app', table_id: 'app', table_name: 'app',
      replica_count: 3, leader_node_id: NODE_IDS[2]},
  ];
  committedServices = [
    ...systemVoterRows,
    ...buildVoterServiceRowsForPartition('p-app', [NODE_IDS[0], NODE_IDS[1]]),
    {service_id: 'p-app-n3-learner', service_type: 'partition', partition_id: 'p-app',
      replica_id: 'p-app-n3-learner', node_id: NODE_IDS[2], status: 'active',
      raft_role: 'learner'},
  ];
  t.equal((await api.getManagementClusterSnapshot()).hasPartitionQuorum, false,
    'leader_node_id pointing at learner replica rejected');

  // 5c. Local PartitionService stepped down, campaigning, uninitialized, or term-less rejected.
  committedPartitions = savedPartitions;
  committedServices = savedPartitions.flatMap(
    (p) => buildVoterServiceRowsForPartition(p.partition_id, NODE_IDS),
  );
  for (const [label, badOverrides] of [
    ['follower contradicting leader_node_id', {role: 'follower'}],
    ['candidate election role', {role: 'candidate'}],
    ['pre_candidate election role', {role: 'pre_candidate'}],
    ['learner role on declared leader', {role: 'learner'}],
    ['absent status.role despite isLeader=true', {role: undefined, isLeader: true}],
    ['term: 0 (no readable raft port)', {term: 0}],
    ['term: undefined', {term: undefined}],
    ['term: NaN', {term: Number.NaN}],
    ['localService.initialized: false', {initialized: false}],
    ['localService.initialized: undefined', {initialized: undefined}],
    ['status.initialized: false', {statusInitialized: false}],
    ['status.initialized: undefined', {statusInitialized: undefined}],
    ['localService.isShutdown: true', {isShutdown: true}],
    ['leaderId mismatch on leader', {leaderId: `p-app-${NODE_IDS[1]}`}],
    ['leaderId null on leader', {leaderId: null}],
  ]) {
    setAppLocalService(badOverrides);
    t.equal((await api.getManagementClusterSnapshot()).hasPartitionQuorum, false,
      `local PartitionService rejected (${label})`);
  }
  for (const [label, badService] of [
    ['getStatus() returning null', {
      partitionId: 'p-app', replicaId: `p-app-${NODE_IDS[0]}`, nodeId: NODE_IDS[0],
      initialized: true, isLeader: true, isLeaderReplica: () => true, getStatus: () => null,
    }],
    ['getStatus() returning {}', {
      partitionId: 'p-app', replicaId: `p-app-${NODE_IDS[0]}`, nodeId: NODE_IDS[0],
      initialized: true, isLeader: true, isLeaderReplica: () => true, getStatus: () => ({}),
    }],
    ['missing getStatus() with isLeader/isLeaderReplica=true', {
      partitionId: 'p-app', replicaId: `p-app-${NODE_IDS[0]}`, nodeId: NODE_IDS[0],
      initialized: true, role: 'leader', isLeader: true, getRole: () => 'leader',
      isLeaderReplica: () => true,
      status: {partitionId: 'p-app', role: 'leader', isLeader: true, term: 3, initialized: true},
    }],
  ]) {
    partitionServices.set('p-app', badService);
    t.equal((await api.getManagementClusterSnapshot()).hasPartitionQuorum, false,
      `local PartitionService rejected (${label})`);
  }
  setAppLocalService();
  t.equal(caps.effectCount(), 0, 'all negative cases produced zero physical effects');

  // 6a. Valid 2/3 voter majority + 1 learner: quorum succeeds, backup succeeds!
  committedServices = [
    ...systemVoterRows,
    ...buildVoterServiceRowsForPartition('p-app', [NODE_IDS[0], NODE_IDS[1]]),
    {service_id: 'p-app-n3-learner', service_type: 'partition', partition_id: 'p-app',
      replica_id: 'p-app-n3-learner', node_id: NODE_IDS[2], status: 'active',
      raft_role: 'learner'},
  ];
  const majorityVoterSnap = await api.getManagementClusterSnapshot();
  t.equal(majorityVoterSnap.hasPartitionQuorum, true, '2/3 voters + 1 learner satisfies quorum');
  t.equal(majorityVoterSnap.underReplicatedPartitionCount, 1, 'learner does not mask under-RF');
  const majBackupRes = await call('POST', OPERATIONS_URL, {
    body: envelope('CREATE_BACKUP', {backupId: 'bkp-maj-ok', destinationUri: 'memory://auth/maj'}),
    authorization: GOOD_AUTH,
  });
  t.equal(majBackupRes.json.state, MANAGEMENT_OPERATION_STATE.SUCCEEDED,
    'consistent-cut backup succeeds under valid 2/3 owner-backed voter quorum');

  // 6b. Valid 3/3 distinct active voter quorum: facts + all management operations succeed!
  committedServices = savedPartitions.flatMap(
    (p) => buildVoterServiceRowsForPartition(p.partition_id, NODE_IDS),
  );
  const fullSnap = await api.getManagementClusterSnapshot();
  t.equal(fullSnap.hasPartitionQuorum, true, '3/3 owner-backed voters satisfy quorum');
  t.equal(fullSnap.underReplicatedPartitionCount, 0);
  t.equal(fullSnap.ready, true);

  const factsRes = await call('GET', FACTS_URL, {authorization: GOOD_AUTH});
  t.equal(factsRes.status, 200);
  t.equal(factsRes.json.facts.topology.state, CLUSTER_FACTS_CONSTANTS.TOPOLOGY_OBSERVED);
  t.equal(factsRes.json.facts.topology.nodeCount, 3);
  t.equal(factsRes.json.facts.topology.readyNodeCount, 3);
  t.equal(factsRes.json.facts.topology.underReplicatedPartitionCount, 0);

  const fullBkpRes = await call('POST', OPERATIONS_URL, {
    body: envelope('CREATE_BACKUP', {...BACKUP_PARAMS}), authorization: GOOD_AUTH,
  });
  t.equal(fullBkpRes.json.state, MANAGEMENT_OPERATION_STATE.SUCCEEDED);

  const decRes = await call('POST', OPERATIONS_URL, {
    body: envelope('DECOMMISSION_NODE', {lagrangeNodeId: NODE_IDS[2]}),
    authorization: GOOD_AUTH,
  });
  t.equal(decRes.json.state, MANAGEMENT_OPERATION_STATE.ACCEPTED);

  // Clear decommission record on a fresh hydrated owner check for TRANSITION_RELEASE.
  api.managementV1Owner.operationsById.clear();
  const relRes = await call('POST', OPERATIONS_URL, {
    body: envelope('TRANSITION_RELEASE', {...RELEASE_PARAMS}), authorization: GOOD_AUTH,
  });
  t.equal(relRes.json.state, MANAGEMENT_OPERATION_STATE.ACCEPTED);
  t.ok(caps.storage.writeCount > 0 && caps.effects.drains === 1 && caps.effects.restarts === 1,
    'valid owner-backed authority grants permission to execute declared capabilities');
});

test('PartitionService.prototype.getStatus contract parity, ready-node quorum, and ' +
  'prototype-pollution hardening', async (t) => {
  const realAppService = new PartitionService({
    partitionId: 'p-app',
    tableId: 'app',
    tableName: 'app',
    replicaId: `p-app-${NODE_IDS[0]}`,
    replicaIds: NODE_IDS.map((n) => `p-app-${n}`),
    nodeId: NODE_IDS[0],
    suppressLifecycleLogs: true,
  });
  const stubStatus = buildLocalPartitionService('p-app', {
    tableId: 'app',
    tableName: 'app',
  }).getStatus();
  t.throws(() => realAppService.getStatus(), {raftResult: {
    outcome: 'HOST_FAILURE', reason: 'replica-consensus-unavailable',
  }}, 'unopened consensus has no fabricated term/status success');
  realAppService.raft = {readRoleAndTerm: () => (serviceRoleObservation('follower', 1))};
  const realStatus = realAppService.getStatus();
  realAppService.raft = null;
  t.same(Object.keys(stubStatus).sort(), Object.keys(realStatus).sort(),
    'stub getStatus() carries exact key parity with PartitionService.prototype.getStatus()');
  for (const phantomKey of ['hasQuorum', 'quorum', 'activeReplicaCount']) {
    t.equal(phantomKey in realStatus, false, `real PartitionService.getStatus omits ${phantomKey}`);
    t.equal(phantomKey in stubStatus, false, `test stub getStatus omits ${phantomKey}`);
  }

  const now = Date.now();
  const nodeRows = buildCommittedNodeRows(now);
  const partitionRows = [
    {partition_id: 'p-app', table_id: 'app', table_name: 'app',
      replica_count: 3, leader_node_id: NODE_IDS[0]},
  ];
  const serviceRows = buildVoterServiceRowsForPartition('p-app', NODE_IDS);
  let readyNodes = [...NODE_IDS];
  const servicesMap = new Map([['p-app', realAppService]]);
  const viewOwner = {
    getSeedNodeId: () => NODE_IDS[0],
    getPartitionServices: () => servicesMap,
    getReplicaHandler: () => ({localServices: servicesMap}),
    resolveReadyNodeIdsFromRows: () => readyNodes,
  };

  // Uninitialized real PartitionService (initialized: false, term: 0) fails closed.
  t.equal(evaluatePartitionQuorumAuthority(viewOwner, {
    nodeRows, partitionRows, serviceRows,
  }).hasPartitionQuorum, false, 'uninitialized real PartitionService rejected');

  // Hand-set role and stubbed term without certified consensus authority rejected.
  realAppService.initialized = true;
  realAppService.raft = {readStatus: () => ({term: 4})};
  applyReplicaLeadership(realAppService, 'leader', 4);
  t.equal(evaluatePartitionQuorumAuthority(viewOwner, {
    nodeRows, partitionRows, serviceRows,
  }).hasPartitionQuorum, false, 'hand-set role with stubbed term rejected');

  // Real PartitionService with certified native consensus leader satisfies quorum.
  realAppService.raft = {
    readRoleAndTerm: () => (serviceRoleObservation('leader', 4)),
    readStatus: () => ({
      outcome: 'CORE_OK',
      role: 'leader',
      term: 4,
      commitIndex: 10,
      appliedIndex: 10,
      configurationKey: 'conf-auth-test',
      membershipGenerationIndex: 1,
      lifecycleIncarnation: 'inc-test-1',
      voters: [realAppService.replicaId],
      confState: {voters: [realAppService.replicaId]},
      leaderId: realAppService.replicaId,
    }),
  };
  applyReplicaLeadership(realAppService, 'leader', 4);
  const validSnap = evaluatePartitionQuorumAuthority(viewOwner, {
    nodeRows, partitionRows, serviceRows,
  });
  t.equal(validSnap.hasPartitionQuorum, true,
    'initialized real PartitionService leader in term 4 satisfies quorum');

  // Real PartitionService demoted to candidate or follower, or losing raft port, fails closed.
  applyReplicaDemotion(realAppService, 'candidate');
  t.equal(evaluatePartitionQuorumAuthority(viewOwner, {
    nodeRows, partitionRows, serviceRows,
  }).hasPartitionQuorum, false, 'real PartitionService in candidate state rejected');

  applyReplicaDemotion(realAppService, 'follower');
  t.equal(evaluatePartitionQuorumAuthority(viewOwner, {
    nodeRows, partitionRows, serviceRows,
  }).hasPartitionQuorum, false, 'real PartitionService follower on leader_node_id rejected');

  applyReplicaLeadership(realAppService, 'leader', 4);
  realAppService.raft = null;
  t.equal(evaluatePartitionQuorumAuthority(viewOwner, {
    nodeRows, partitionRows, serviceRows,
  }).hasPartitionQuorum, false, 'real PartitionService with closed raft port (term 0) rejected');

  realAppService.raft = {
    readRoleAndTerm: () => (serviceRoleObservation('leader', 4)),
    readStatus: () => ({
      outcome: 'CORE_OK',
      role: 'leader',
      term: 4,
      commitIndex: 10,
      appliedIndex: 10,
      configurationKey: 'conf-auth-test',
      voters: [realAppService.replicaId],
      confState: {voters: [realAppService.replicaId]},
      leaderId: realAppService.replicaId,
    }),
  };
  realAppService.isShutdown = true;
  t.equal(evaluatePartitionQuorumAuthority(viewOwner, {
    nodeRows, partitionRows, serviceRows,
  }).hasPartitionQuorum, false, 'shutting-down real PartitionService rejected');
  realAppService.isShutdown = false;

  // Unready nodes cannot satisfy voter majority even if nodes.status === 'active'.
  readyNodes = [NODE_IDS[0]];
  const minorityReadySnap = evaluatePartitionQuorumAuthority(viewOwner, {
    nodeRows, partitionRows, serviceRows,
  });
  t.equal(minorityReadySnap.readyNodeCount, 1);
  t.equal(minorityReadySnap.hasPartitionQuorum, false,
    'active rows on unready nodes never count toward voter quorum');
  readyNodes = [...NODE_IDS];

  // Prototype-inherited fields and Object.prototype keys never spoof quorum.
  const protoSpoofServiceRow = Object.create({
    service_id: 'p-app-node-1',
    service_type: 'partition',
    partition_id: 'p-app',
    replica_id: 'p-app-node-1',
    node_id: NODE_IDS[0],
    status: 'active',
    raft_role: 'leader',
  });
  t.equal(evaluatePartitionQuorumAuthority(viewOwner, {
    nodeRows,
    partitionRows,
    serviceRows: [
      protoSpoofServiceRow,
      ...buildVoterServiceRowsForPartition('p-app', [NODE_IDS[1]]),
    ],
  }).hasPartitionQuorum, false, 'prototype-inherited service row fields cannot spoof quorum');

  const protoStatusService = {
    partitionId: 'p-app',
    replicaId: `p-app-${NODE_IDS[0]}`,
    nodeId: NODE_IDS[0],
    initialized: true,
    getStatus: () => Object.create({
      partitionId: 'p-app',
      replicaId: `p-app-${NODE_IDS[0]}`,
      nodeId: NODE_IDS[0],
      role: 'leader',
      isLeader: true,
      leaderId: `p-app-${NODE_IDS[0]}`,
      term: 4,
      initialized: true,
    }),
  };
  servicesMap.set('p-app', protoStatusService);
  t.equal(evaluatePartitionQuorumAuthority(viewOwner, {
    nodeRows, partitionRows, serviceRows,
  }).hasPartitionQuorum, false, 'prototype-inherited status fields cannot spoof quorum');

  // RollingUpgradeOwner rejects hasPartitionQuorum: null and undefined directly.
  for (const missingQuorum of [null, undefined]) {
    let drained = 0;
    const upg = new RollingUpgradeOwner({
      onDrainNodeLeadership: () => {
        drained += 1;
      },
      onTriggerNodeRestart: () => {},
    });
    const snap = {
      nodeIds: [...NODE_IDS], readyNodeIds: [...NODE_IDS],
      underReplicatedPartitionCount: 0, hasPartitionQuorum: missingQuorum,
    };
    t.equal(upg.evaluatePreflight(RELEASE_PARAMS, snap).reasonCode,
      L4_ROLLING_UPGRADE_REASON_CODE.QUORUM_SAFETY_HALT);
    const op = upg.startUpgrade({
      operationId: `op-null-undef-${String(missingQuorum)}`,
      parameters: RELEASE_PARAMS,
      clusterSnapshot: snap,
    });
    t.equal(op.state, MANAGEMENT_OPERATION_STATE.REJECTED);
    t.equal(op.reasonCode, L4_ROLLING_UPGRADE_REASON_CODE.QUORUM_SAFETY_HALT);
    t.equal(drained, 0);
  }
});
