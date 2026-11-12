// The remaining claim sites and marker rules of the install episode (quest
// partition-checkpoint-epoch-generation, hand-over coverage model, conditions
// C2 and C3, cells 18 and 19). Real PartitionServices, the target node's real
// ReplicaHandler, and install markers written on disk in the installer's own
// format.
//
//  S-status     C3: the deferred create-status write (it unregisters) during
//               an episode throws typed at the registry choke point.
//  S-reconcile  C3: reconcileRemovedReplicaCleanup claims nothing without a
//               durable REMOVING row.
//  S-supersede  C3: retiring a superseded create admission's runtime is the
//               create-failure claim, and waits for the open in flight.
//  S-cleanup    C2, cell 18: the removal's cleanup, under its own durable
//               cleanup token, completes over a follower catch-up marker in
//               state STAGED and over REJECTED with staging.
//  S-conflict   cell 19: an open refused by a real install-state conflict
//               holds the episode, retried on a backoff of 2 s doubling to
//               60 s (virtual clock), until a REMOVE claims it.
//  S-rejected   the production opener consumes a rejected follower catch-up
//               marker with its staging, and the replica returns.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';

import {TABLES} from '../../../src/constants/index.js';
import {retireSupersededCreateAdmissionRuntime} from
  '../../../src/node/replica-create-admission-retained-recovery.js';
import {REPLICA_REMOVAL_COMPLETION_DEFERRED} from
  '../../../src/node/replica-removal-debt-errors.js';
import {
  REPLICA_RECREATE_ATTEMPT,
  REPLICA_RECREATE_HOLD_BACKOFF_MAX_MS,
  REPLICA_RECREATE_RETRY_BOUND_MS,
  REPLICA_SNAPSHOT_INSTALL_CLAIM,
  REPLICA_SNAPSHOT_INSTALL_ERROR_CODE,
  REPLICA_SNAPSHOT_INSTALL_HOLD,
  REPLICA_SNAPSHOT_INSTALL_STATE,
  REPLICA_SNAPSHOT_INSTALL_WAIT,
} from '../../../src/node/replica-snapshot-install-constants.js';
import {
  RAFT_SNAPSHOT_BOUNDARY_STATE_KEY,
  RAFT_SNAPSHOT_INSTALL_NO_REJECTION,
  RAFT_SNAPSHOT_INSTALL_DIRNAME,
  RAFT_SNAPSHOT_INSTALL_MARKER_FILE,
  RAFT_SNAPSHOT_INSTALL_STAGING_FILE,
  RAFT_SNAPSHOT_INSTALL_STATE,
} from '../../../src/raft/snapshot-install-constants.js';
import {requestSnapshotInstall, resolveReplicaCheckpointsRoot} from
  '../../../src/raft/snapshot-install.js';
import {readInstallImage} from '../../../src/raft/snapshot-install-artifact-owner.js';
import {markerValue} from '../../../src/raft/snapshot-install-marker.js';
import {readCheckpoint} from '../../../src/raft/snapshot-checkpoint-store.js';
import {ReplicaOperationField} from
  '../../../src/rebalancer/replica-operation-constants.js';
import {ReplicaStatus} from '../../../src/rebalancer/replica-status.js';
import {ensureDirectory, writeAtomicDurable} from
  '../../../src/runtime/oci-host-agent-durable-files.js';
import {
  CADENCE_ENTRY_THRESHOLD,
  PARTITION_ID,
  cutOff,
  durableStatus,
  faultNextOpen,
  holdNextOpen,
  recreationOf,
  targetService,
  userRows,
  waitFor,
  withInstallWorld,
  writeAndCompact,
} from './snapshot-install-recreate-fixture.js';

const SCENARIO = Object.freeze({timeout: 180000});
const STATE = REPLICA_SNAPSHOT_INSTALL_STATE;
const HOLD = REPLICA_SNAPSHOT_INSTALL_HOLD;
const MARKER_STATE = RAFT_SNAPSHOT_INSTALL_STATE;

async function withFollowerBehindCompaction(fn) {
  await withInstallWorld({establishedOnTarget: true}, async (world) => {
    const reconnect = cutOff(world, world.third);
    await writeAndCompact(world, 1, CADENCE_ENTRY_THRESHOLD);
    await fn(world, world.third.replicaId, reconnect);
  });
}

function installFiles(dbPath) {
  const dir = path.join(resolveReplicaCheckpointsRoot(dbPath),
    RAFT_SNAPSHOT_INSTALL_DIRNAME);
  return {dir, marker: path.join(dir, RAFT_SNAPSHOT_INSTALL_MARKER_FILE),
    staging: path.join(dir, RAFT_SNAPSHOT_INSTALL_STAGING_FILE)};
}

function installedBinding(dbPath) {
  return readInstallImage(dbPath, (db) => JSON.parse(db.prepare(
    'SELECT value FROM _raft_state WHERE key = ?').pluck()
    .get(RAFT_SNAPSHOT_BOUNDARY_STATE_KEY.INSTALL_BINDING)));
}

// Interrupt a real, closed-receiver install. Marker and binding come from
// production; only the filesystem effect is faulted at the named crash point.
async function plantFollowerCatchupMarker(world, dbPath, replicaId, state) {
  const files = installFiles(dbPath);
  const root = resolveReplicaCheckpointsRoot(dbPath);
  const binding = installedBinding(dbPath);
  const {descriptor} = readCheckpoint({checkpointDir:
    path.join(root, String(binding.generationIndex))});
  const expectedIdentity = {clusterId: descriptor.clusterId, raftGroupId: descriptor.raftGroupId,
    entity: descriptor.entity, membershipEpoch: descriptor.membershipEpoch};
  const rename = fs.renameSync;
  const remove = fs.rmSync;
  const crashCode = 'MARKER_FIXTURE_CRASH';
  fs.renameSync = (source, target) => {
    if (state === MARKER_STATE.STAGED && source === files.staging && target === dbPath) {
      throw Object.assign(new Error(crashCode), {code: crashCode});
    }
    return rename(source, target);
  };
  fs.rmSync = (file, options) => {
    if (state === MARKER_STATE.REJECTED && file === files.staging && fs.existsSync(file)) {
      throw Object.assign(new Error(crashCode), {code: crashCode});
    }
    return remove(file, options);
  };
  try {
    await assert.rejects(requestSnapshotInstall({replicaDbPath: dbPath,
      checkpointsRoot: root, generationIndex: binding.generationIndex, expectedIdentity,
      expectedReplicaIdentity: replicaId,
      custody: state === MARKER_STATE.STAGED ?
        world.handler.snapshotInstallOwner.custodyOf(replicaId) : null}), {code: crashCode});
    assert.equal(JSON.parse(fs.readFileSync(files.marker, 'utf8')).state, state);
  } finally {
    fs.renameSync = rename;
    fs.rmSync = remove;
  }
  return files;
}

function removeRequest(replicaId) {
  return {
    [ReplicaOperationField.OPERATION_ID]: `remove-op-${replicaId}`,
    [ReplicaOperationField.PARTITION_ID]: PARTITION_ID,
    [ReplicaOperationField.REPLICA_ID]: replicaId,
  };
}

async function codeOf(action) {
  try {
    await action();
  } catch (error) {
    return error.code ?? error.message;
  }
  return 'not_refused';
}

async function returnsRunning(world, replicaId) {
  await waitFor(() => {
    const current = targetService(world, replicaId);
    return current !== null && current.isShutdown !== true &&
      current.raft?.readStatus?.().appliedIndex ===
        world.leader.raft.readStatus().appliedIndex;
  }, 'the replica returns and converges');
  assert.deepEqual(userRows(targetService(world, replicaId)),
    userRows(world.leader));
}

test('S-status, S-reconcile: during an episode the deferred create-status ' +
  'write throws typed at the choke point, and a removal reconcile without a ' +
  'durable REMOVING row claims nothing', SCENARIO, async () => {
  await withFollowerBehindCompaction(async (world, replicaId, reconnect) => {
    const held = holdNextOpen(world, replicaId);
    reconnect();
    await held.reached;
    const {handler} = world;
    let facts;
    try {
      const before = recreationOf(world, replicaId);
      facts = {
        statusWrite: await codeOf(() =>
          handler.deferRetryableReplicaCreateStatusWrite({
            operationId: 'create-op-of-another-attempt',
            partitionId: PARTITION_ID, replicaId,
            error: new Error('control plane unavailable')})),
        reconcile: await codeOf(() =>
          handler.reconcileRemovedReplicaCleanup(replicaId, PARTITION_ID)),
        unchanged: JSON.stringify(recreationOf(world, replicaId)) ===
          JSON.stringify(before),
        state: recreationOf(world, replicaId).state,
        tracked: targetService(world, replicaId) === world.third,
        refusals: handler.localServices.episodeRefusals,
        row: durableStatus(world, replicaId),
      };
    } finally {
      held.open();
    }
    assert.deepEqual(facts, {
      statusWrite: REPLICA_SNAPSHOT_INSTALL_ERROR_CODE.REPLICA_UNDER_INSTALL_EPISODE,
      reconcile: REPLICA_REMOVAL_COMPLETION_DEFERRED,
      unchanged: true, state: STATE.RECREATE_PENDING, tracked: true,
      refusals: 1, row: ReplicaStatus.ACTIVE}, JSON.stringify(facts));
    await returnsRunning(world, replicaId);
  });
});

test('S-supersede: retiring a superseded create admission\'s runtime during ' +
  'an episode is the create-failure claim: it waits for the open in flight, ' +
  'whose product is released before the replica is unregistered',
SCENARIO, async () => {
  await withFollowerBehindCompaction(async (world, replicaId, reconnect) => {
    const held = holdNextOpen(world, replicaId);
    reconnect();
    await held.reached;
    const {handler} = world;
    const retiring = retireSupersededCreateAdmissionRuntime(handler, {
      replicaId, partitionId: PARTITION_ID, partitionService: world.third,
      error: new Error('the create admission was superseded')});
    await waitFor(() => recreationOf(world, replicaId).state === STATE.CLAIMED,
      'the retirement claimed the episode');
    await new Promise((resolve) => setTimeout(resolve, 300));
    const record = recreationOf(world, replicaId);
    const waiting = {claim: record.claim, wait: record.wait,
      tracked: targetService(world, replicaId) === world.third,
      opened: world.created.length};
    held.open();
    await retiring;
    const facts = {waiting, tracked: targetService(world, replicaId),
      created: world.created.map((service) => service.isShutdown),
      wait: recreationOf(world, replicaId).wait};
    assert.deepEqual(facts, {
      waiting: {claim: REPLICA_SNAPSHOT_INSTALL_CLAIM.CREATE_FAILURE,
        wait: REPLICA_SNAPSHOT_INSTALL_WAIT.EPISODE_STEP_SETTLE, tracked: true,
        opened: 0},
      tracked: null, created: [true],
      wait: REPLICA_SNAPSHOT_INSTALL_WAIT.NONE}, JSON.stringify(facts));
  });
});

for (const markerState of [MARKER_STATE.STAGED, MARKER_STATE.REJECTED]) {
  test('S-cleanup: a removal\'s cleanup, under its durable cleanup token, ' +
    'completes over this replica\'s follower catch-up marker in state ' +
    `${markerState} with its staging file`, SCENARIO, async () => {
    await withFollowerBehindCompaction(async (world, replicaId, reconnect) => {
      const {handler} = world;
      const {dbPath} = world.third;
      // An earlier removal made REMOVING durable and ended; the recreation
      // holds for the removal owner (cell 9).
      faultNextOpen(world, replicaId, async () => {
        await handler.persistReplicaStatusWithRetry(replicaId,
          ReplicaStatus.REMOVING, {partitionId: PARTITION_ID});
        throw new Error('the factory could not open the replica');
      });
      reconnect();
      await waitFor(() => recreationOf(world, replicaId)?.hold ===
        HOLD.AWAITING_REMOVAL_OWNER, 'the recreation holds for the removal owner');
      const files = await plantFollowerCatchupMarker(world, dbPath, replicaId, markerState);
      // The removal's reconcile (the REMOVE re-dispatch of a replica whose
      // REMOVING row is durable): claim, cleanup takeover, storage cleanup.
      const tokens = [];
      const cleanup = handler.cleanupReplicaResources.bind(handler);
      handler.cleanupReplicaResources = (partitionId, id, authority) => {
        tokens.push({kind: authority?.kind, state: recreationOf(world, id).state,
          row: durableStatus(world, id)});
        return cleanup(partitionId, id, authority);
      };
      const completed = await handler.reconcileRemovedReplicaCleanup(
        replicaId, PARTITION_ID);
      const record = recreationOf(world, replicaId);
      const facts = {completed, tokens, claim: record.claim, state: record.state,
        database: fs.existsSync(dbPath), marker: fs.existsSync(files.marker),
        staging: fs.existsSync(files.staging),
        tracked: targetService(world, replicaId),
        row: world.store.durableRow(TABLES.SERVICES, replicaId) ?? null,
        opened: world.created.length};
      assert.deepEqual(facts, {completed: true,
        tokens: [{kind: 'cleanup_owned', state: STATE.CLAIMED,
          row: tokens[0]?.row}],
        claim: REPLICA_SNAPSHOT_INSTALL_CLAIM.REMOVAL, state: STATE.CLAIMED,
        database: false, marker: false, staging: false, tracked: null,
        row: null, opened: 0}, JSON.stringify(facts));
      assert.notEqual(tokens[0].row, ReplicaStatus.ACTIVE,
        'the cleanup ran under the removal\'s durable row');
    });
  });
}

// The handler's clock, virtual: timers are kept and fired by advance().
function virtualClock(handler) {
  const real = handler.timeSource;
  const clock = {offsetMs: 0, timers: [], delays: []};
  handler.timeSource = {
    now: () => real.now() + clock.offsetMs,
    setTimeout(callback, delayMs) {
      const timer = {callback, atMs: real.now() + clock.offsetMs + delayMs,
        unref() {}};
      clock.timers.push(timer);
      clock.delays.push(delayMs);
      return timer;
    },
    clearTimeout(timer) {
      clock.timers = clock.timers.filter((candidate) => candidate !== timer);
    },
  };
  clock.advance = (elapsedMs) => {
    clock.offsetMs += elapsedMs;
    const nowMs = real.now() + clock.offsetMs;
    const due = clock.timers.filter((timer) => timer.atMs <= nowMs);
    clock.timers = clock.timers.filter((timer) => timer.atMs > nowMs);
    for (const timer of due) timer.callback();
  };
  clock.restore = () => {
    handler.timeSource = real;
  };
  return clock;
}

test('S-conflict: an open refused by a real install-state conflict holds the ' +
  'episode, retried on a backoff of 2 s doubling to 60 s, until a REMOVE ' +
  'claims it', SCENARIO, async () => {
  await withFollowerBehindCompaction(async (world, replicaId, reconnect) => {
    const {handler} = world;
    const files = installFiles(world.third.dbPath);
    // The marker says INSTALLED for an install the database does not carry:
    // the production opener fails closed, typed.
    faultNextOpen(world, replicaId, async () => {
      ensureDirectory(files.dir);
      const binding = installedBinding(world.third.dbPath);
      writeAtomicDurable(files.marker, markerValue(MARKER_STATE.INSTALLED,
        'an-install-this-database-does-not-carry', binding.generationIndex,
        RAFT_SNAPSHOT_INSTALL_NO_REJECTION, binding));
    });
    const clock = virtualClock(handler);
    reconnect();
    const conflictAttempts = (count) => waitFor(() => {
      const record = recreationOf(world, replicaId);
      return record?.attempts === count && record.hold ===
        HOLD.OPEN_REFUSED_INSTALL_CONFLICT;
    }, `attempt ${count} was refused by the conflict`);
    await conflictAttempts(1);
    const bounds = [];
    const expected = [];
    for (let boundMs = REPLICA_RECREATE_RETRY_BOUND_MS, attempt = 1;
      attempt <= 8; attempt += 1) {
      expected.push(boundMs);
      const record = recreationOf(world, replicaId);
      bounds.push(record.retryBoundMs);
      assert.equal(clock.delays.at(-1), record.retryBoundMs,
        'the retry timer is armed with the hold\'s bound');
      clock.advance(record.retryBoundMs - 1);
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.equal(recreationOf(world, replicaId).attempts, attempt,
        'nothing is retried before the bound');
      clock.advance(1);
      await conflictAttempts(attempt + 1);
      boundMs = Math.min(boundMs * 2, REPLICA_RECREATE_HOLD_BACKOFF_MAX_MS);
    }
    const held = recreationOf(world, replicaId);
    const facts = {bounds, lastAttempt: held.lastAttempt, state: held.state,
      opened: world.created.length, marker: fs.existsSync(files.marker),
      visible: handler.getStats().snapshotInstalls[0].hold};
    assert.deepEqual(facts, {bounds: expected,
      lastAttempt: REPLICA_RECREATE_ATTEMPT.OPEN_REFUSED_INSTALL_CONFLICT,
      state: STATE.RECREATE_PENDING, opened: 0, marker: true,
      visible: HOLD.OPEN_REFUSED_INSTALL_CONFLICT}, JSON.stringify(facts));
    assert.deepEqual(expected, [2000, 4000, 8000, 16000, 32000, 60000, 60000,
      60000]);
    // The hold's clearing actor: the REMOVE.
    clock.restore();
    await handler.handleRemoveReplica(removeRequest(replicaId));
    await waitFor(() => recreationOf(world, replicaId).state === STATE.CLAIMED,
      'the removal claimed the episode');
    assert.deepEqual({claim: recreationOf(world, replicaId).claim,
      row: durableStatus(world, replicaId), opened: world.created.length},
    {claim: REPLICA_SNAPSHOT_INSTALL_CLAIM.REMOVAL,
      row: ReplicaStatus.REMOVING, opened: 0});
  });
});

test('S-rejected: the production opener consumes a rejected follower ' +
  'catch-up marker with its staging file, and the replica returns',
SCENARIO, async () => {
  await withFollowerBehindCompaction(async (world, replicaId, reconnect) => {
    let files;
    faultNextOpen(world, replicaId, async () => {
      files = await plantFollowerCatchupMarker(world, world.third.dbPath, replicaId,
        MARKER_STATE.REJECTED);
    });
    reconnect();
    await returnsRunning(world, replicaId);
    assert.deepEqual({marker: fs.existsSync(files.marker),
      staging: fs.existsSync(files.staging), opened: world.created.length,
      state: recreationOf(world, replicaId).state},
    {marker: false, staging: false, opened: 1, state: STATE.RUNNING});
  });
});
