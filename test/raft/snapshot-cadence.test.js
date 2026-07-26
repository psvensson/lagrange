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
  PARTITION_SERVICE_OPERATION,
} from '../../src/partition/partition-service-constants.js';
import {
  RAFT_SNAPSHOT_CADENCE_OUTCOME,
  createPartitionSnapshotCadence,
} from '../../src/partition/partition-snapshot-cadence.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {readSnapshotBoundary} from '../../src/raft/snapshot-boundary.js';
import {SQLiteLogAdapter} from '../../src/raft/sqlite-log-adapter.js';
import {
  PartitionRaftStorage,
} from '../../src/partition/partition-raft-storage.js';
import {
  listCheckpointGenerations,
} from '../../src/raft/snapshot-checkpoint-store.js';
import {
  resolveReplicaCheckpointsRoot,
} from '../../src/raft/snapshot-install.js';
import {waitForCondition} from './bulk-transfer-socket-fixture.js';

// S6 Phase A link 1 guard (quest raft-snapshot-live-rebuild): the leader
// checkpoint cadence. A leader below both thresholds does nothing; a leader
// over the entry threshold (the previously DEAD raft.snapshotThreshold
// config key) or the byte threshold creates one sealed generation AND runs
// the retention sweep; a follower NEVER fires; a re-entrant tick is a typed
// no-op while creation is in flight; in-memory and control-plane partitions
// are typed refusals. The red-on-revert engagement leg drives a REAL
// PartitionService and proves the 1s prepared-state-hold sweep fires the
// cadence (reverting the sweep-site hook or the config-key adoption reds
// it).

const PARTITION_ID = 'cadence_rows-p1';
const STATE_TABLE = 'cadence_rows';
const TERM = 2;
const CONTROL_PLANE_PARTITION_ID = 'nodes-p1';
const CONFIG_SNAPSHOT_THRESHOLD = 100;
const HUGE_THRESHOLD = 1000000;
const TINY_BYTE_THRESHOLD = 1024;
const HUGE_BYTE_THRESHOLD = 1024 * 1024 * 1024;
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
      snapshotThreshold: CONFIG_SNAPSHOT_THRESHOLD,
    },
  });
  LoggingService.getInstance().initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  AddressManager.resetInstance();
});

// A minimal service-shaped fixture over a REAL committed+applied replica
// database (the cadence reads role/db/logAdapter/sizeBytes only).
function createServiceFixture(options = {}) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-'));
  const dbPath = path.join(workDir, 'replica.db');
  const db = new Database(dbPath);
  const logAdapter = new SQLiteLogAdapter(
    db, {address: PARTITION_ID, term: TERM});
  const storage = new PartitionRaftStorage(db, PARTITION_ID, logAdapter);
  db.exec(`CREATE TABLE IF NOT EXISTS ${STATE_TABLE} ` +
    '(id TEXT PRIMARY KEY, payload TEXT)');
  const entryCount = options.entryCount ?? 3;
  for (let ordinal = 1; ordinal <= entryCount; ordinal += 1) {
    const entry = logAdapter.saveCommand({sql: `row-${ordinal}`}, TERM);
    logAdapter.commit(entry.index);
    db.prepare(`INSERT INTO ${STATE_TABLE} (id, payload) VALUES (?, ?)`)
      .run(`row-${ordinal}`, `payload-${ordinal}`);
    storage.recordAppliedAdvance();
  }
  const service = {
    dbPath,
    partitionId: options.partitionId || PARTITION_ID,
    tableName: STATE_TABLE,
    replicaId: `${PARTITION_ID}-r1`,
    role: options.role || RAFT_ROLE.LEADER,
    db,
    logAdapter,
    sizeBytes: options.sizeBytes ?? 0,
    systemTableCache: null,
    isShutdown: false,
  };
  return {
    workDir,
    service,
    checkpointsRoot: resolveReplicaCheckpointsRoot(dbPath),
    close() {
      db.close();
      fs.rmSync(workDir, {recursive: true, force: true});
    },
  };
}

test('a leader below both thresholds does nothing', async (t) => {
  const fixture = createServiceFixture({entryCount: 3});
  try {
    const cadence = createPartitionSnapshotCadence({
      service: fixture.service,
      entryThreshold: HUGE_THRESHOLD,
      byteThresholdBytes: HUGE_BYTE_THRESHOLD,
    });
    const result = await cadence.tick(Date.now());
    t.equal(result.outcome, RAFT_SNAPSHOT_CADENCE_OUTCOME.BELOW_THRESHOLD,
      'the tick is a typed below_threshold no-op');
    t.equal(result.pendingEntryCount, 3,
      'the tick reports the uncovered committed entries');
    t.same(listCheckpointGenerations(fixture.checkpointsRoot), [],
      'no generation is minted below threshold');
  } finally {
    fixture.close();
  }
});

test('a leader over the entry threshold creates one generation and sweeps',
  async (t) => {
    const fixture = createServiceFixture({entryCount: 5});
    try {
      const cadence = createPartitionSnapshotCadence({
        service: fixture.service,
        entryThreshold: 5,
        byteThresholdBytes: HUGE_BYTE_THRESHOLD,
      });
      const result = await cadence.tick(Date.now());
      t.equal(result.outcome, RAFT_SNAPSHOT_CADENCE_OUTCOME.COMPACTED,
        'the over-threshold tick checkpoints AND compacts to the boundary');
      t.equal(result.creation.descriptor.lastIncludedIndex, 5,
        'the sealed generation carries the committed boundary');
      t.equal(result.compaction.outcome, 'compacted',
        'proof-gated compaction advanced the leader boundary');
      t.equal(readSnapshotBoundary(fixture.service.db).lastIncludedIndex, 5,
        'the durable snapshot boundary moved to the generation index — a ' +
        'lagging follower can no longer replay the removed prefix');
      t.same(listCheckpointGenerations(fixture.checkpointsRoot), [5],
        'exactly one sealed generation exists');
      t.same(result.sweep.kept, [5],
        'the retention sweep ran and kept the new generation');
      // The covered index moved: an immediate re-tick must NOT loop.
      const again = await cadence.tick(Date.now());
      t.equal(again.outcome, RAFT_SNAPSHOT_CADENCE_OUTCOME.BELOW_THRESHOLD,
        'a re-tick after checkpointing is below threshold (no hot loop)');
    } finally {
      fixture.close();
    }
  });

test('the byte threshold fires on new committed entries over a large ' +
  'partition size', async (t) => {
  const fixture = createServiceFixture({
    entryCount: 2,
    sizeBytes: TINY_BYTE_THRESHOLD + 1,
  });
  try {
    const cadence = createPartitionSnapshotCadence({
      service: fixture.service,
      entryThreshold: HUGE_THRESHOLD,
      byteThresholdBytes: TINY_BYTE_THRESHOLD,
    });
    const result = await cadence.tick(Date.now());
    t.equal(result.outcome, RAFT_SNAPSHOT_CADENCE_OUTCOME.COMPACTED,
      'the byte trigger checkpoints+compacts below the entry threshold');
    t.same(listCheckpointGenerations(fixture.checkpointsRoot), [2],
      'the generation is sealed at the committed boundary');
  } finally {
    fixture.close();
  }
});

test('a follower never fires', async (t) => {
  const fixture = createServiceFixture({
    entryCount: 5,
    role: RAFT_ROLE.FOLLOWER,
    sizeBytes: HUGE_BYTE_THRESHOLD,
  });
  try {
    const cadence = createPartitionSnapshotCadence({
      service: fixture.service,
      entryThreshold: 1,
      byteThresholdBytes: TINY_BYTE_THRESHOLD,
    });
    const result = await cadence.tick(Date.now());
    t.equal(result.outcome, RAFT_SNAPSHOT_CADENCE_OUTCOME.NOT_LEADER,
      'the follower tick is a typed not_leader refusal');
    t.same(listCheckpointGenerations(fixture.checkpointsRoot), [],
      'a follower never mints a generation');
  } finally {
    fixture.close();
  }
});

test('a re-entrant tick is a typed no-op while creation is in flight',
  async (t) => {
    const fixture = createServiceFixture({entryCount: 4});
    try {
      const cadence = createPartitionSnapshotCadence({
        service: fixture.service,
        entryThreshold: 1,
        byteThresholdBytes: HUGE_BYTE_THRESHOLD,
      });
      // First tick enters creation (async backup) — its in-flight flag is
      // set synchronously before the first await inside creation.
      const firstTick = cadence.tick(Date.now());
      t.equal(cadence.isInFlight(), true,
        'anti-vacuous: creation is genuinely in flight');
      const reentrant = await cadence.tick(Date.now());
      t.equal(reentrant.outcome,
        RAFT_SNAPSHOT_CADENCE_OUTCOME.ALREADY_IN_FLIGHT,
        'the overlapping tick is a typed already_in_flight no-op');
      const first = await firstTick;
      t.equal(first.outcome, RAFT_SNAPSHOT_CADENCE_OUTCOME.COMPACTED,
        'the original tick still completes');
      t.same(listCheckpointGenerations(fixture.checkpointsRoot), [4],
        'exactly ONE generation exists — no double creation');
    } finally {
      fixture.close();
    }
  });

test('leadership lost across the creation await skips the retention sweep',
  async (t) => {
    const fixture = createServiceFixture({entryCount: 3});
    try {
      const cadence = createPartitionSnapshotCadence({
        service: fixture.service,
        entryThreshold: 1,
        byteThresholdBytes: HUGE_BYTE_THRESHOLD,
      });
      const tick = cadence.tick(Date.now());
      // Demote WHILE creation is in flight (role can change mid-await).
      fixture.service.role = RAFT_ROLE.FOLLOWER;
      const result = await tick;
      t.equal(result.outcome,
        RAFT_SNAPSHOT_CADENCE_OUTCOME.LEADERSHIP_LOST_MID_CREATION,
        'the post-await role re-check is a typed outcome');
      t.equal(result.sweep, undefined,
        'no retention sweep runs on a demoted replica');
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
      entryCount: 3,
      partitionId: CONTROL_PLANE_PARTITION_ID,
      sizeBytes: HUGE_BYTE_THRESHOLD,
    });
    try {
      const controlPlaneTick = await createPartitionSnapshotCadence({
        service: fixture.service,
        entryThreshold: 1,
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

test('ENGAGEMENT: the 1s prepared-state-hold sweep fires the cadence on a ' +
  'real leader service over the config threshold', async (t) => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-sweep-'));
  const dbPath = path.join(workDir, 'partition', 'replica.db');
  fs.mkdirSync(path.dirname(dbPath), {recursive: true});
  const router = new MessageRouter({
    nodeId: 'cadence-node',
    nodeAddress: 'ws://cadence-node:7000',
    startServer: false,
  });
  await router.initialize();
  let service = null;
  try {
    // TWO configured replicas so the service boots (and stays) a follower
    // — the solo-replica production promotion would otherwise make the
    // role-gate leg vacuous.
    const replicaId = `${PARTITION_ID}-r1`;
    const peerReplicaId = `${PARTITION_ID}-r2`;
    const addressManager = AddressManager.getInstance();
    service = new PartitionService({
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
    });
    await service.initialize();
    // Commit+apply one entry past the configured raft.snapshotThreshold
    // (the DEAD config key this link adopts) with the e2e commit shape.
    for (let ordinal = 1; ordinal <= CONFIG_SNAPSHOT_THRESHOLD;
      ordinal += 1) {
      const command = {
        type: PARTITION_SERVICE_OPERATION.INSERT,
        sql: `INSERT INTO ${STATE_TABLE} (id, payload) VALUES (?, ?)`,
        params: [`row-${ordinal}`, `payload-${ordinal}`],
        entryId: `entry-${ordinal}`,
      };
      const entry = service.logAdapter.saveCommand(command, TERM);
      service.logAdapter.commit(entry.index);
      service.applyCommittedEntry(command);
      service.storage.recordAppliedAdvance();
    }
    const checkpointsRoot = resolveReplicaCheckpointsRoot(dbPath);
    t.same(listCheckpointGenerations(checkpointsRoot), [],
      'anti-vacuous: no generation exists before leadership');
    // The sweep ticks on ALL roles — the cadence's own role gate must hold
    // while the service is a follower.
    await new Promise((resolve) =>
      setTimeout(resolve, SWEEP_INTERVAL_MS * 4));
    t.same(listCheckpointGenerations(checkpointsRoot), [],
      'the follower sweep ticks never checkpoint (tick owns the role gate)');
    service.role = RAFT_ROLE.LEADER;
    const generations = await waitForCondition(
      () => {
        const found = listCheckpointGenerations(checkpointsRoot);
        return found.length > 0 ? found : null;
      },
      'the sweep-driven cadence seals a generation');
    t.same(generations, [CONFIG_SNAPSHOT_THRESHOLD],
      'the sweep-riding cadence sealed the generation at the committed ' +
      'boundary — the production hook is engaged');
  } finally {
    if (service && !service.isShutdown) {
      await service.shutdown();
    }
    await router.shutdown();
    fs.rmSync(workDir, {recursive: true, force: true});
  }
});
