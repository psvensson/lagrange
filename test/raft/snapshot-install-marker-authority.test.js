// Real boot and cleanup owners; only runtime shutdown is controlled in cleanup.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import Database from 'better-sqlite3';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {TABLES} from '../../src/constants/index.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {PARTITION_SERVICE_ERROR_CODE} from '../../src/partition/partition-service-constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {inspectSnapshotInstallArtifactsForGeneration, requestSnapshotInstall,
  resolvePendingSnapshotInstall,
  resolveReplicaCheckpointsRoot} from '../../src/raft/snapshot-install.js';
import {markerPath, markerValue, stagingPath} from '../../src/raft/snapshot-install-marker.js';
import {RAFT_SNAPSHOT_INSTALL_MARKER_KIND as KIND,
  RAFT_SNAPSHOT_INSTALL_OUTCOME as OUTCOME, RAFT_SNAPSHOT_INSTALL_REJECTION as REJECTION,
  RAFT_SNAPSHOT_INSTALL_SIDECAR_SUFFIXES,
  RAFT_SNAPSHOT_INSTALL_STATE as STATE} from '../../src/raft/snapshot-install-constants.js';
import {gatherRetentionPins, sweepCheckpointGenerations} from
  '../../src/raft/snapshot-retention.js';
import {writeAtomicDurable} from '../../src/runtime/oci-host-agent-durable-files.js';
import {withFoundingStamp} from '../partition/partition-founding-stamp.js';
import {createNodeReplicaHandler} from './snapshot-wiring-inproc-fixture.js';

const REPLICA = 'marker-r';
const GROUP = 'marker-p';
const TABLE = 'marker_rows';
const GENERATION = 4;
const TARGET = Object.freeze({replicaId: REPLICA, partitionId: GROUP});
const IDENTITY = Object.freeze({clusterId: 'marker-cluster', raftGroupId: GROUP,
  entity: Object.freeze({kind: 'partition', id: TABLE}), membershipEpoch: 1});
const SIDECARS = RAFT_SNAPSHOT_INSTALL_SIDECAR_SUFFIXES;

function initializeOwners() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
}

function receiverMarker() {
  return markerValue(STATE.REJECTED, 'marker-install', GENERATION,
    REJECTION.STAGING_LOST, {kind: KIND.RAFT_RS_FOLLOWER_CATCHUP,
      createAuthority: {entityId: TABLE, entityType: 'partition',
        partitionId: GROUP, replicaId: REPLICA}, preInstallDigest: 'absent'});
}

function malformedMarkers() {
  const canonical = receiverMarker();
  const unclassified = {state: canonical.state, installId: canonical.installId,
    generationIndex: canonical.generationIndex, rejectionReason: canonical.rejectionReason};
  const withoutKind = {...canonical};
  delete withoutKind.kind;
  return [
    ['four-field rejection', unclassified],
    ['missing kind', withoutKind],
    ['unknown kind', {...canonical, kind: 'unknown-kind'}],
    ['unknown state', {...canonical, state: 'unknown-state'}],
    ['invalid generation', {...canonical, generationIndex: -1}],
    ['invalid digest', {...canonical, preInstallDigest: null}],
    ['invalid reason', {...canonical, state: STATE.STAGED}],
    ['extra field', {...canonical, unknown: true}],
    ['unowned authority', {...canonical, createAuthority: {}}],
    ['foreign replica', {...canonical,
      createAuthority: {...canonical.createAuthority, replicaId: 'foreign-r'}}],
    ['foreign group', {...canonical,
      createAuthority: {...canonical.createAuthority, partitionId: 'foreign-p'}}],
    ['unbound staging', canonical],
  ];
}

function seedArtifacts(dbPath, marker) {
  const root = resolveReplicaCheckpointsRoot(dbPath);
  fs.mkdirSync(path.dirname(dbPath), {recursive: true});
  const db = new Database(dbPath);
  db.exec(`CREATE TABLE ${TABLE} (id TEXT PRIMARY KEY)`);
  db.close();
  fs.mkdirSync(path.dirname(markerPath(root)), {recursive: true});
  // Corrupt the otherwise canonical bytes only after the real writer runs:
  // its encoder correctly refuses null and must not be weakened for a fixture.
  writeAtomicDurable(markerPath(root), marker.preInstallDigest === null ?
    {...marker, preInstallDigest: 'absent'} : marker);
  if (marker.preInstallDigest === null) {
    const text = fs.readFileSync(markerPath(root), 'utf8');
    fs.writeFileSync(markerPath(root), text.replace(
      '"preInstallDigest":"absent"', '"preInstallDigest":null'));
  }
  const files = [dbPath, ...SIDECARS.map((suffix) => `${dbPath}${suffix}`),
    stagingPath(root), ...SIDECARS.map((suffix) => `${stagingPath(root)}${suffix}`),
    markerPath(root)];
  for (const file of files) {
    if (!fs.existsSync(file)) fs.writeFileSync(file, `preserve:${path.basename(file)}`);
  }
  return {root, bytes: new Map(files.map((file) => [file, fs.readFileSync(file)]))};
}

function assertPreserved(bytes) {
  for (const [file, before] of bytes) {
    assert.equal(fs.existsSync(file), true, `artifact retained: ${file}`);
    assert.equal(fs.readFileSync(file).equals(before), true, `bytes retained: ${file}`);
  }
}

for (const [label, marker] of malformedMarkers()) {
  test(`PartitionService boot preserves ${label} and every sidecar`, async (t) => {
    initializeOwners();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'marker-boot-'));
    const dbPath = path.join(dir, `${REPLICA}.db`);
    const {bytes} = seedArtifacts(dbPath, marker);
    const service = new PartitionService(withFoundingStamp({partitionId: GROUP,
      tableId: TABLE, tableName: TABLE, replicaId: REPLICA, nodeId: 'marker-node',
      dbPath, deferElection: true}));
    t.after(async () => {
      await service.shutdown();
      fs.rmSync(dir, {recursive: true, force: true});
    });
    const error = await service.initialize().then(() => null, (cause) => cause);
    assertPreserved(bytes);
    assert.equal(error?.code, PARTITION_SERVICE_ERROR_CODE.SNAPSHOT_INSTALL_STATE_CONFLICT);
    assert.equal(service.db, null, 'boot refused before opening SQLite');
  });

  test(`ReplicaHandler cleanup preserves ${label} and every sidecar`, async (t) => {
    initializeOwners();
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marker-cleanup-'));
    const node = createNodeReplicaHandler({nodeId: 'marker-node', dataDir,
      createPartitionService: async () => {
        throw new Error('unexpected factory open');
      }});
    const handler = node.replicaHandler;
    const service = {replicaId: REPLICA, partitionId: GROUP, tableName: TABLE,
      nodeId: 'marker-node', async shutdown() {}};
    await node.host(service);
    await node.store.gateway.insertSystemTableRow(TABLES.PARTITIONS, {
      partition_id: GROUP, table_id: TABLE, leader_node_id: service.nodeId,
      status: 'active', created_at: 1, updated_at: 1});
    await handler.persistReplicaStatusWithRetry(REPLICA, ReplicaStatus.REMOVING,
      {partitionId: GROUP});
    const dbPath = handler.getPartitionDbPath(GROUP, REPLICA);
    const {bytes} = seedArtifacts(dbPath, marker);
    t.after(async () => {
      node.replicaStateMachine.stopTimeoutChecker();
      await handler.shutdown();
      fs.rmSync(dataDir, {recursive: true, force: true});
    });
    const error = await handler.reconcileRemovedReplicaCleanup(REPLICA, GROUP)
      .then(() => null, (cause) => cause);
    assertPreserved(bytes);
    assert.equal(error?.code, OUTCOME.INSTALL_STATE_CONFLICT);
  });
}

for (const suffix of SIDECARS) {
  test(`resolvePendingSnapshotInstall refuses orphan staging ${suffix}`, (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'marker-orphan-'));
    t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
    const dbPath = path.join(dir, `${REPLICA}.db`);
    const root = resolveReplicaCheckpointsRoot(dbPath);
    fs.mkdirSync(path.dirname(stagingPath(root)), {recursive: true});
    const sidecar = `${stagingPath(root)}${suffix}`;
    fs.writeFileSync(sidecar, 'unowned journal');
    const result = resolvePendingSnapshotInstall({replicaDbPath: dbPath,
      checkpointsRoot: root, expectedReplicaIdentity: REPLICA, expectedRaftGroupId: GROUP});
    assert.equal(result.outcome, OUTCOME.INSTALL_STATE_CONFLICT);
    assert.equal(fs.readFileSync(sidecar, 'utf8'), 'unowned journal');
  });
}

test('requestSnapshotInstall cannot overwrite unclassified rejection or orphan staging', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'marker-request-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const dbPath = path.join(dir, `${REPLICA}.db`);
  const {root, bytes} = seedArtifacts(dbPath, malformedMarkers()[0][1]);
  const result = await requestSnapshotInstall({replicaDbPath: dbPath,
    checkpointsRoot: root, generationIndex: GENERATION, expectedIdentity: IDENTITY,
    expectedReplicaIdentity: REPLICA});
  assertPreserved(bytes);
  assert.equal(result.outcome, OUTCOME.INSTALL_STATE_CONFLICT);
});

for (const [label, marker] of malformedMarkers().slice(0, -1)) {
  test(`retention refuses ${label} before gathering pins or sweeping`, (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'marker-retention-'));
    t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
    const dbPath = path.join(dir, `${REPLICA}.db`);
    const {root, bytes} = seedArtifacts(dbPath, marker);
    const generation = path.join(root, '1');
    fs.mkdirSync(generation, {recursive: true});
    const payload = path.join(generation, 'unclassified-bytes');
    fs.writeFileSync(payload, 'retain generation');
    const refused = (error) => typeof error.code === 'string';
    assert.throws(() => gatherRetentionPins({checkpointsRoot: root,
      installTarget: TARGET}), refused);
    assert.throws(() => sweepCheckpointGenerations({checkpointsRoot: root,
      installTarget: TARGET}), refused);
    assertPreserved(bytes);
    assert.equal(fs.readFileSync(payload, 'utf8'), 'retain generation');
  });
}

for (const field of ['replicaId', 'partitionId']) {
  test(`clean foreign ${field} marker refuses recovery, cleanup and direct retention`, (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'marker-clean-foreign-'));
    t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
    const dbPath = path.join(dir, `${REPLICA}.db`);
    const root = resolveReplicaCheckpointsRoot(dbPath);
    const marker = receiverMarker();
    fs.mkdirSync(path.dirname(markerPath(root)), {recursive: true});
    writeAtomicDurable(markerPath(root), {...marker,
      createAuthority: {...marker.createAuthority, [field]: 'foreign'}});
    const before = fs.readFileSync(markerPath(root));
    assert.equal(resolvePendingSnapshotInstall({replicaDbPath: dbPath,
      checkpointsRoot: root, expectedReplicaIdentity: REPLICA,
      expectedRaftGroupId: GROUP}).outcome, OUTCOME.INSTALL_STATE_CONFLICT);
    assert.equal(inspectSnapshotInstallArtifactsForGeneration({checkpointsRoot: root,
      ...TARGET}).owned, false);
    for (const action of [gatherRetentionPins, sweepCheckpointGenerations]) {
      assert.throws(() => action({checkpointsRoot: root, installTarget: TARGET}),
        {code: OUTCOME.INSTALL_STATE_CONFLICT});
    }
    assert.equal(fs.readFileSync(markerPath(root)).equals(before), true);
  });
}

for (const suffix of ['', ...SIDECARS]) {
  test(`ReplicaHandler ${suffix || 'main'} unlink refuses a changed marker after its async callback`,
    async (t) => {
      initializeOwners();
      const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marker-cleanup-race-'));
      const node = createNodeReplicaHandler({nodeId: 'marker-node', dataDir,
        createPartitionService: async () => {
          throw new Error('unexpected open');
        }});
      const handler = node.replicaHandler;
      t.after(async () => {
        node.replicaStateMachine.stopTimeoutChecker();
        await handler.shutdown();
        fs.rmSync(dataDir, {recursive: true, force: true});
      });
      const owner = handler.getReplicaCleanupTombstoneOwner();
      const acquired = await owner.acquire({replicaId: REPLICA, partitionId: GROUP,
        nodeId: 'marker-node'});
      assert.ok(acquired.authority, 'canonical cleanup owner issued the token');
      const dbPath = handler.getPartitionDbPath(GROUP, REPLICA);
      fs.mkdirSync(path.dirname(dbPath), {recursive: true});
      const artifact = `${dbPath}${suffix}`;
      if (suffix === '') {
        const db = new Database(dbPath);
        db.exec(`CREATE TABLE ${TABLE} (id TEXT PRIMARY KEY)`);
        db.close();
      } else {
        fs.writeFileSync(artifact, `unowned-${suffix}`);
      }
      const before = fs.readFileSync(artifact);
      const root = resolveReplicaCheckpointsRoot(dbPath);
      const requireCurrent = owner.requireCurrent.bind(owner);
      let reads = 0;
      let replacementObserved = false;
      owner.requireCurrent = async (authority) => {
        const current = await requireCurrent(authority);
        reads += 1;
        if (reads === 3) {
        // First microtask precedes the async callback's continuation; the
        // second runs after that callback returns and before unlink resumes.
          queueMicrotask(() => queueMicrotask(() => {
            fs.mkdirSync(path.dirname(markerPath(root)), {recursive: true});
            writeAtomicDurable(markerPath(root), {successor: true});
            replacementObserved = true;
          }));
        }
        return current;
      };
      const service = handler.getTrackedService(REPLICA);
      const refusal = await handler.cleanupReplicaResources(GROUP, REPLICA,
        acquired.authority, service).then(() => null, (error) => error);
      assert.equal(replacementObserved, true, 'the marker changed in the awaited deletion window');
      assert.equal(fs.existsSync(artifact), true, 'artifact survives the changed marker');
      assert.equal(fs.readFileSync(artifact).equals(before), true, 'artifact survives exactly');
      assert.equal(fs.existsSync(markerPath(root)), true, 'successor marker survives');
      assert.equal(refusal?.code, OUTCOME.INSTALL_STATE_CONFLICT);
    });
}
