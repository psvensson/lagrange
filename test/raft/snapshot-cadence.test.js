import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';

import {AddressManager} from '../../src/address/address-manager.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {
  RAFT_SNAPSHOT_CADENCE_OUTCOME,
  createPartitionSnapshotCadence,
} from '../../src/partition/partition-snapshot-cadence.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {
  listCheckpointGenerations,
} from '../../src/raft/snapshot-checkpoint-store.js';
import {
  resolveReplicaCheckpointsRoot,
} from '../../src/raft/snapshot-install.js';
import {waitForCondition} from './bulk-transfer-socket-fixture.js';
import {withFoundingStamp} from '../partition/partition-founding-stamp.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';

// The leader checkpoint cadence on the rs-raft partition path (quest
// raft-rs-single-path-partition-cutover, design S19). Checkpoint creation and
// proof-gated compaction measured their trigger and proof against the retired
// backend's committed log, which the partition path no longer has; ownership
// of checkpointing on the rs-raft store is the snapshot/catch-up quest (epic
// raft-rs-full-cutover finding F5). Until then the cadence states that
// unavailability as a typed outcome on every leader tick instead of throwing
// into a failed tick every second, and it never seals a generation. The
// in-memory/control-plane refusal and the follower role gate are unchanged.
// The engagement leg drives a REAL PartitionService and proves the 1s
// prepared-state-hold sweep constructs and ticks the cadence.

const PARTITION_ID = 'cadence_rows-p1';
const STATE_TABLE = 'cadence_rows';
const CONTROL_PLANE_PARTITION_ID = 'nodes-p1';
const SWEEP_INTERVAL_MS = 25;
const HUGE_HEARTBEAT_MS = 3600000;
const SCHEMA = Object.freeze({
  columns: [
    {name: 'id', type: 'TEXT', primaryKey: true},
    {name: 'payload', type: 'TEXT'},
  ],
});

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  AddressManager.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: 'cadence-node'},
    raft: {
      heartbeatIntervalMs: HUGE_HEARTBEAT_MS,
      electionTimeoutMinMs: HUGE_HEARTBEAT_MS,
      electionTimeoutMaxMs: HUGE_HEARTBEAT_MS + 1,
    },
  });
  LoggingService.getInstance().initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  AddressManager.resetInstance();
});

// A minimal service-shaped fixture over a real file-backed replica database
// (the cadence reads dbPath/partitionId/role/isShutdown/db only).
function createServiceFixture(options = {}) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-'));
  const dbPath = path.join(workDir, 'replica.db');
  const db = new Database(dbPath);
  const service = {
    dbPath,
    partitionId: options.partitionId || PARTITION_ID,
    tableName: STATE_TABLE,
    role: options.role || RAFT_ROLE.LEADER,
    db,
    isShutdown: false,
  };
  return {
    service,
    checkpointsRoot: resolveReplicaCheckpointsRoot(dbPath),
    close() {
      db.close();
      fs.rmSync(workDir, {recursive: true, force: true});
    },
  };
}

test('a leader tick reports the committed log unsupported and seals ' +
  'nothing', async (t) => {
  const fixture = createServiceFixture();
  try {
    const cadence = createPartitionSnapshotCadence({service: fixture.service});
    const result = await cadence.tick(Date.now());
    t.equal(result.outcome,
      RAFT_SNAPSHOT_CADENCE_OUTCOME.COMMITTED_LOG_UNSUPPORTED,
      'the leader tick is a typed unavailability, not a failed tick');
    t.equal(result.partitionId, PARTITION_ID,
      'the outcome names the partition');
    t.same(listCheckpointGenerations(fixture.checkpointsRoot), [],
      'no generation is minted');
  } finally {
    fixture.close();
  }
});

test('a follower never fires', async (t) => {
  const fixture = createServiceFixture({role: RAFT_ROLE.FOLLOWER});
  try {
    const result = await createPartitionSnapshotCadence(
      {service: fixture.service}).tick(Date.now());
    t.equal(result.outcome, RAFT_SNAPSHOT_CADENCE_OUTCOME.NOT_LEADER,
      'the follower tick is a typed not_leader refusal');
    t.same(listCheckpointGenerations(fixture.checkpointsRoot), [],
      'a follower never mints a generation');
  } finally {
    fixture.close();
  }
});

test('in-memory and control-plane partitions are typed refusals',
  async (t) => {
    const memoryService = {
      dbPath: ':memory:',
      partitionId: PARTITION_ID,
      tableName: STATE_TABLE,
      role: RAFT_ROLE.LEADER,
      isShutdown: false,
    };
    const memoryTick = await createPartitionSnapshotCadence(
      {service: memoryService}).tick(Date.now());
    t.equal(memoryTick.outcome,
      RAFT_SNAPSHOT_CADENCE_OUTCOME.UNSUPPORTED_PARTITION,
      'an in-memory partition is a typed refusal');
    const fixture = createServiceFixture({
      partitionId: CONTROL_PLANE_PARTITION_ID,
    });
    try {
      const controlPlaneTick = await createPartitionSnapshotCadence({
        service: fixture.service,
      }).tick(Date.now());
      t.equal(controlPlaneTick.outcome,
        RAFT_SNAPSHOT_CADENCE_OUTCOME.UNSUPPORTED_PARTITION,
        'a control-plane partition is a typed refusal');
      t.same(listCheckpointGenerations(fixture.checkpointsRoot), [],
        'no control-plane generation is ever minted');
    } finally {
      fixture.close();
    }
  });

test('ENGAGEMENT: the 1s prepared-state-hold sweep ticks the cadence on a ' +
  'real service, and a leader tick is the typed unavailability', async (t) => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-sweep-'));
  const dbPath = path.join(workDir, 'partition', 'replica.db');
  fs.mkdirSync(path.dirname(dbPath), {recursive: true});
  const router = new MessageRouter({
    bootIncarnation: TEST_BOOT_INCARNATION,
    nodeId: 'cadence-node',
    nodeAddress: 'ws://cadence-node:7000',
    startServer: false,
  });
  await router.initialize();
  let service = null;
  try {
    // TWO configured replicas so the service boots (and stays) a follower.
    const replicaId = `${PARTITION_ID}-r1`;
    const peerReplicaId = `${PARTITION_ID}-r2`;
    const addressManager = AddressManager.getInstance();
    service = new PartitionService(withFoundingStamp({
      partitionId: PARTITION_ID,
      tableId: STATE_TABLE,
      tableName: STATE_TABLE,
      replicaId,
      replicaIds: [replicaId, peerReplicaId],
      peerAddresses: [replicaId, peerReplicaId].map((peer) =>
        addressManager.format('cadence-node', 'partition', peer)),
      nodeId: 'cadence-node',
      transport: router,
      dbPath,
      schema: SCHEMA,
      deferElection: true,
      preparedStateHoldSweepIntervalMs: SWEEP_INTERVAL_MS,
    }));
    await service.initialize();
    // The sweep constructs the cadence lazily on its first tick.
    const cadence = await waitForCondition(
      () => service.snapshotCadence || null,
      'the sweep constructs and ticks the cadence');
    t.ok(cadence, 'the production sweep hook is engaged');
    const followerTick = await service.runSnapshotCadenceTick(Date.now());
    t.equal(followerTick.outcome, RAFT_SNAPSHOT_CADENCE_OUTCOME.NOT_LEADER,
      'the follower tick holds the role gate');
    service.role = RAFT_ROLE.LEADER;
    const leaderTick = await service.runSnapshotCadenceTick(Date.now());
    t.equal(leaderTick.outcome,
      RAFT_SNAPSHOT_CADENCE_OUTCOME.COMMITTED_LOG_UNSUPPORTED,
      'a leader tick states the unavailability');
    await new Promise((resolve) =>
      setTimeout(resolve, SWEEP_INTERVAL_MS * 4));
    t.same(listCheckpointGenerations(resolveReplicaCheckpointsRoot(dbPath)),
      [], 'the sweep-driven leader ticks seal no generation');
  } finally {
    if (service && !service.isShutdown) {
      await service.shutdown();
    }
    await router.shutdown();
    fs.rmSync(workDir, {recursive: true, force: true});
  }
});
