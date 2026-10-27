import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';

import {test, beforeEach, afterEach} from '../../../src/test-helpers/tap.js';

import {AddressManager} from '../../../src/address/address-manager.js';
import {ConfigurationManager} from '../../../src/config/configuration-manager.js';
import {HLCTimestamp} from '../../../src/hlc/hlc-timestamp.js';
import {LoggingService} from '../../../src/logging/logging-service.js';
import {MessageRouter} from '../../../src/transport/message-router.js';
import {PartitionService} from '../../../src/partition/partition-service.js';
import {
  PARTITION_SERVICE_OPERATION,
} from '../../../src/partition/partition-service-constants.js';
import {
  RAFT_SNAPSHOT_CADENCE_OUTCOME,
  createPartitionSnapshotCadence,
} from '../../../src/partition/partition-snapshot-cadence.js';
import {RAFT_ROLE} from '../../../src/raft/constants.js';
import {
  warmHlcFromDurableWitnesses,
} from '../../../src/partition/partition-hlc-warmup.js';
import {
  insertParticipantTransactionRow,
} from '../../../src/partition/partition-participant-transaction-store.js';
import {
  RAFT_COMPACTION_OUTCOME,
} from '../../../src/raft/compaction-policy.js';
import {
  RAFT_OPERATION_OUTCOME,
} from '../../../src/raft/raft-operation-port-constants.js';
import {
  RaftRsDurableStore,
} from '../../../src/raft/raft-rs-durable-store.js';
import {
  RaftRsReplicaLifecycleOwner,
} from '../../../src/raft/raft-rs-replica-lifecycle-owner.js';
import {
  RAFT_CHECKPOINT_CREATION_OUTCOME,
  RAFT_CHECKPOINT_DESCRIPTOR_FILE,
  RAFT_CHECKPOINT_PAYLOAD_FILE,
  RAFT_CHECKPOINT_PAYLOAD_KIND,
  RAFT_CHECKPOINT_VALIDATION_OUTCOME,
  RAFT_RS_CHECKPOINT_REASON,
} from '../../../src/raft/snapshot-checkpoint-constants.js';
import {
  createSqliteStateMachineCheckpoint,
  listCheckpointGenerations,
  readCheckpoint,
} from '../../../src/raft/snapshot-checkpoint-store.js';
import {
  compactRaftRsCommittedEntries,
} from '../../../src/raft/snapshot-compaction.js';
import {
  RAFT_SNAPSHOT_CATCHUP_DECISION_OUTCOME,
  RAFT_SNAPSHOT_CATCHUP_DISPATCH_OUTCOME,
  RAFT_SNAPSHOT_CATCHUP_INSTALL_OUTCOME,
} from '../../../src/raft/snapshot-catchup-constants.js';
import {
  buildSnapshotCatchupIdentity,
  dispatchSnapshotCatchup,
  orchestrateSnapshotCatchupInstall,
} from '../../../src/raft/snapshot-catchup.js';
import {
  requestSnapshotInstall,
  resolveReplicaCheckpointsRoot,
} from '../../../src/raft/snapshot-install.js';
import {
  RAFT_SNAPSHOT_INSTALL_OUTCOME,
  RAFT_SNAPSHOT_INSTALL_REJECTION,
} from '../../../src/raft/snapshot-install-constants.js';
import {
  sha256Digest,
  writeAtomicDurable,
} from '../../../src/runtime/oci-host-agent-durable-files.js';
import {
  createInProcWebSocketPair,
} from '../../../src/transport/inproc-transport.js';
import {waitForCondition as waitFor} from '../bulk-transfer-socket-fixture.js';
import {withFoundingStamp} from '../../partition/partition-founding-stamp.js';
import {
  TEST_BOOT_INCARNATION,
} from '../../test-helpers/boot-incarnation-fixture.js';

const TABLE = 'sn1_partition_rows';
const PARTITION_ID = 'sn1_partition_rows-p1';
const NODE_ID = 'sn1-node';
const CLUSTER_ID = 'cluster-sn1-raft-rs';
const SEALED_EPOCH = 3;
const HUGE_HEARTBEAT_MS = 3600000;
const HUGE_ELECTION_MIN_MS = 7200000;
const HUGE_ELECTION_MAX_MS = 7300000;
const HLC_BASE_MS = 1720000000000;
const HLC_STEP_MS = 1000;

const IDENTITY = buildSnapshotCatchupIdentity({
  clusterId: CLUSTER_ID,
  partitionId: PARTITION_ID,
  tableName: TABLE,
  publicationRows: [{status: 'PUBLISHED', membership_epoch: SEALED_EPOCH}],
});

const SCHEMA = Object.freeze({
  columns: [
    {name: 'id', type: 'TEXT', primaryKey: true},
    {name: 'payload', type: 'TEXT'},
  ],
});

function resetTestSingletons() {
  for (const service of [ConfigurationManager, LoggingService, AddressManager]) {
    service.resetInstance();
  }
}

beforeEach(() => {
  resetTestSingletons();
  ConfigurationManager.getInstance().initialize({
    node: {id: NODE_ID},
    raft: {
      heartbeatIntervalMs: HUGE_HEARTBEAT_MS,
      electionTimeoutMinMs: HUGE_ELECTION_MIN_MS,
      electionTimeoutMaxMs: HUGE_ELECTION_MAX_MS,
    },
  });
  LoggingService.getInstance().initialize({level: 'error'});
});

afterEach(resetTestSingletons);

function descendingHlc(ordinal) {
  return new HLCTimestamp(
    HLC_BASE_MS - (ordinal * HLC_STEP_MS), ordinal, NODE_ID).toString();
}

function buildPartitionService(router, {
  replicaId,
  replicaIds,
  dbPath,
  bootstrapMembership,
}) {
  const addressManager = AddressManager.getInstance();
  const baseOptions = {
    partitionId: PARTITION_ID,
    tableId: TABLE,
    tableName: TABLE,
    replicaId,
    replicaIds,
    peerAddresses: replicaIds.map((peer) =>
      addressManager.format(NODE_ID, 'partition', peer)),
    nodeId: NODE_ID,
    transport: router,
    dbPath,
    schema: SCHEMA,
    deferElection: true,
    ...(bootstrapMembership ? {bootstrapMembership} : {}),
  };
  return new PartitionService(
    bootstrapMembership ? baseOptions : withFoundingStamp(baseOptions));
}

async function proposeInsertRow(leader, ordinal, timestamp) {
  const command = {
    type: PARTITION_SERVICE_OPERATION.INSERT,
    sql: `INSERT INTO ${TABLE} (id, payload) VALUES (?, ?)`,
    params: [`row-${ordinal}`, `payload-${ordinal}`],
    entryId: `entry-${ordinal}`,
    timestamp: timestamp || descendingHlc(ordinal),
  };
  const outcome = await leader.raft.propose(command);
  if (outcome.outcome !== RAFT_OPERATION_OUTCOME.CORE_OK) {
    throw new Error(`propose failed: ${JSON.stringify(outcome)}`);
  }
  return command;
}

function readUserRows(db) {
  return db.prepare(`SELECT id, payload FROM ${TABLE} ORDER BY id ASC`).all();
}

function listSqliteTables(db) {
  return db.prepare(
    'SELECT name FROM sqlite_master WHERE type = \'table\' ORDER BY name ASC',
  ).all().map((row) => row.name);
}

async function withSingleReplicaLeader(prefix, rowCount, fn) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const dbPath = path.join(workDir, 'partition', 'r1.db');
  fs.mkdirSync(path.dirname(dbPath), {recursive: true});
  const checkpointsRoot = resolveReplicaCheckpointsRoot(dbPath);
  const router = new MessageRouter({
    bootIncarnation: TEST_BOOT_INCARNATION,
    nodeId: NODE_ID,
    nodeAddress: 'ws://sn1-node:7000',
    startServer: false,
  });
  await router.initialize();
  const replicaId = `${PARTITION_ID}-r1`;
  let service = null;
  try {
    service = buildPartitionService(router, {
      replicaId,
      replicaIds: [replicaId],
      dbPath,
    });
    await service.initialize();
    await waitFor(
      () => service.raft.readStatus().role === 'leader',
      'single replica leader election');
    for (let ordinal = 1; ordinal <= rowCount; ordinal += 1) {
      await proposeInsertRow(service, ordinal, descendingHlc(ordinal));
    }
    await waitFor(
      () => readUserRows(service.db).length === rowCount,
      `${rowCount} rows committed and applied`);
    await fn({workDir, dbPath, checkpointsRoot, router, replicaId, service});
  } finally {
    if (service && !service.isShutdown) {
      await service.shutdown();
    }
    await router.shutdown();
    fs.rmSync(workDir, {recursive: true, force: true});
  }
}

test('SN1/F5: partition checkpoint creation preserves application state, ' +
  'scrubs _raft_* tables, and refuses PREPARED participant transactions',
async (t) => {
  await withSingleReplicaLeader('sn1-checkpoint-', 3,
    async ({workDir, checkpointsRoot, service}) => {
      // Insert a PREPARED participant transaction row and verify checkpoint
      // creation refuses with PREPARED_TRANSACTIONS_PENDING.
      insertParticipantTransactionRow(service.db, {
        transactionId: 'tx-prepared-1',
        participantId: `${PARTITION_ID}:p1`,
        commitMode: 'two_phase',
        transactionEpoch: 1,
        state: 'PREPARED',
      });

      const refusedPrepared = await createSqliteStateMachineCheckpoint({
        db: service.db,
        identity: IDENTITY,
        checkpointsRoot,
        raftRsGroupId: PARTITION_ID,
      });
      t.equal(
        refusedPrepared.outcome,
        RAFT_CHECKPOINT_CREATION_OUTCOME.PREPARED_TRANSACTIONS_PENDING,
        'checkpoint creation refuses when a PREPARED participant tx is present');
      t.ok(
        refusedPrepared.reasons.includes(
          RAFT_RS_CHECKPOINT_REASON.PREPARED_TRANSACTIONS),
        'refusal names prepared_participant_transactions');

      // Settle the participant transaction to COMMITTED so checkpoint creation
      // succeeds and durable partition tables survive in the payload.
      service.db.prepare(
        'UPDATE _participant_transactions SET state = ? WHERE transaction_id = ?',
      ).run('COMMITTED', 'tx-prepared-1');

      const created = await createSqliteStateMachineCheckpoint({
        db: service.db,
        identity: IDENTITY,
        checkpointsRoot,
        raftRsGroupId: PARTITION_ID,
      });
      t.equal(created.outcome, RAFT_CHECKPOINT_CREATION_OUTCOME.CREATED,
        'partition checkpoint seals once PREPARED holds are settled');
      t.equal(
        created.descriptor.payloadKind,
        RAFT_CHECKPOINT_PAYLOAD_KIND.RAFT_RS_REPLICA_IMAGE,
        'partition checkpoint uses RAFT_RS_REPLICA_IMAGE payload kind');
      t.equal(
        created.descriptor.maxCommittedHlc,
        descendingHlc(1),
        'maxCommittedHlc captures the maximum HLC across committed entries');

      const payloadPath = path.join(
        created.checkpointDir, RAFT_CHECKPOINT_PAYLOAD_FILE);
      const payloadDb = new Database(payloadPath, {readonly: true});
      try {
        const tables = listSqliteTables(payloadDb);
        t.equal(
          tables.some((name) => name.startsWith('_raft_')),
          false,
          'all _raft_* consensus and lifecycle tables are scrubbed from payload');
        t.ok(tables.includes(TABLE), 'user table is preserved in payload');
        t.ok(tables.includes('_participant_transactions'),
          '_participant_transactions table is preserved in payload');
        t.ok(tables.includes('_partition_statement_outcomes'),
          '_partition_statement_outcomes table is preserved in payload');
        t.ok(tables.includes('raft_rs_peer_identity'),
          'raft_rs_peer_identity table is preserved in payload');
        t.same(readUserRows(payloadDb), readUserRows(service.db),
          'user table rows match the live partition state');
        t.equal(
          payloadDb.prepare(
            'SELECT state FROM _participant_transactions WHERE transaction_id = ?',
          ).get('tx-prepared-1')?.state,
          'COMMITTED',
          'settled participant transaction row survives in payload');
        t.equal(
          payloadDb.prepare(
            'SELECT COUNT(*) AS n FROM _partition_statement_outcomes',
          ).get().n,
          3,
          'durable statement outcome rows survive in payload');
      } finally {
        payloadDb.close();
      }

      const validated = readCheckpoint({
        checkpointDir: created.checkpointDir,
        expectedIdentity: IDENTITY,
      });
      t.equal(validated.outcome, RAFT_CHECKPOINT_VALIDATION_OUTCOME.VALID,
        'sealed partition checkpoint validates cleanly');

      // Tamper with a copy of the checkpoint to re-introduce a PREPARED row and
      // verify readCheckpoint rejects it as CORRUPT_PAYLOAD.
      const tamperedDir = path.join(workDir, 'tampered-checkpoint');
      fs.cpSync(created.checkpointDir, tamperedDir, {recursive: true});
      const tamperedPayload = path.join(tamperedDir, RAFT_CHECKPOINT_PAYLOAD_FILE);
      const tamperedDb = new Database(tamperedPayload);
      tamperedDb.prepare(
        'UPDATE _participant_transactions SET state = ? WHERE transaction_id = ?',
      ).run('PREPARED', 'tx-prepared-1');
      tamperedDb.close();
      const tamperedBytes = fs.readFileSync(tamperedPayload);
      writeAtomicDurable(
        path.join(tamperedDir, RAFT_CHECKPOINT_DESCRIPTOR_FILE),
        {
          ...created.descriptor,
          payloadByteLength: tamperedBytes.length,
          payloadDigest: sha256Digest(tamperedBytes),
        },
      );
      t.equal(
        readCheckpoint({checkpointDir: tamperedDir, expectedIdentity: IDENTITY})
          .outcome,
        RAFT_CHECKPOINT_VALIDATION_OUTCOME.CORRUPT_PAYLOAD,
        'readCheckpoint refuses a partition payload holding a PREPARED row');
    });
});

test('SN1/F5: proof-gated raft-rs log compaction, leader cadence, and HLC ' +
  'warmup non-regression across full log compaction', async (t) => {
  await withSingleReplicaLeader('sn1-compaction-', 4,
    async ({checkpointsRoot, service}) => {
      const recordBefore = RaftRsDurableStore.readDurableRecordIn(
        service.db, PARTITION_ID);
      const boundaryIndex = Number(recordBefore.appliedIndex);

      // Proof-gated refusal cases before checkpoint creation:
      t.equal(
        compactRaftRsCommittedEntries(service.db, PARTITION_ID, {
          toIndex: 0,
          proof: {checkpointDir: path.join(checkpointsRoot, '0')},
        }).outcome,
        RAFT_COMPACTION_OUTCOME.INVALID_COMPACTION_INDEX,
        'toIndex 0 is rejected as invalid_compaction_index');
      t.equal(
        compactRaftRsCommittedEntries(service.db, PARTITION_ID, {
          toIndex: boundaryIndex,
          proof: {checkpointDir: path.join(checkpointsRoot, String(boundaryIndex))},
        }).outcome,
        RAFT_COMPACTION_OUTCOME.SNAPSHOT_PROOF_MISSING,
        'compaction without a sealed checkpoint is refused as proof missing');

      // Drive active leader cadence over threshold: creates checkpoint AND
      // compacts _raft_rs_log up to boundaryIndex.
      const cadence = createPartitionSnapshotCadence({
        service,
        entryThreshold: 3,
      });
      const tickOutcome = await cadence.tick(Date.now());
      t.equal(
        tickOutcome.outcome,
        RAFT_SNAPSHOT_CADENCE_OUTCOME.COMPACTED,
        'leader cadence creates checkpoint and compacts _raft_rs_log');
      t.equal(
        tickOutcome.compaction.outcome,
        RAFT_COMPACTION_OUTCOME.COMPACTED,
        'compaction outcome is compacted');
      t.same(
        listCheckpointGenerations(checkpointsRoot),
        [boundaryIndex],
        'checkpoint generation sealed at boundaryIndex');
      t.equal(
        Number(RaftRsDurableStore.readSnapshotIndexIn(service.db, PARTITION_ID)),
        boundaryIndex,
        '_raft_rs_snapshot.snapshot_index advanced to boundaryIndex');
      t.equal(
        service.db.prepare(
          'SELECT COUNT(*) AS n FROM _raft_rs_log WHERE group_id = ? AND log_index <= ?',
        ).get(PARTITION_ID, boundaryIndex).n,
        0,
        'all _raft_rs_log entries <= boundaryIndex are physically deleted');
      t.equal(
        RaftRsDurableStore.readCompactedMaxHlcIn(service.db, PARTITION_ID),
        descendingHlc(1),
        '_raft_rs_snapshot.data retains the folded maxCommittedHlc witness');

      // Immediate re-tick is BELOW_THRESHOLD (no hot loop).
      const retick = await cadence.tick(Date.now());
      t.equal(
        retick.outcome,
        RAFT_SNAPSHOT_CADENCE_OUTCOME.BELOW_THRESHOLD,
        're-tick after compaction is below_threshold');

      // Already-compacted refusal on repeat compaction at boundaryIndex:
      t.equal(
        compactRaftRsCommittedEntries(service.db, PARTITION_ID, {
          toIndex: boundaryIndex,
          proof: {checkpointDir: path.join(checkpointsRoot, String(boundaryIndex))},
        }).outcome,
        RAFT_COMPACTION_OUTCOME.ALREADY_COMPACTED,
        'compacting again at boundaryIndex returns already_compacted');

      // Propose 2 more rows with smaller HLCs, then seal a second checkpoint:
      // the second checkpoint must NOT regress maxCommittedHlc below
      // descendingHlc(1) even though the row carrying descendingHlc(1) was
      // physically deleted from _raft_rs_log!
      await proposeInsertRow(service, 5, descendingHlc(5));
      await proposeInsertRow(service, 6, descendingHlc(6));
      await waitFor(
        () => readUserRows(service.db).length === 6,
        'rows 5 and 6 committed and applied');

      const secondCheckpoint = await createSqliteStateMachineCheckpoint({
        db: service.db,
        identity: IDENTITY,
        checkpointsRoot,
        raftRsGroupId: PARTITION_ID,
      });
      t.equal(
        secondCheckpoint.outcome,
        RAFT_CHECKPOINT_CREATION_OUTCOME.CREATED,
        'post-compaction checkpoint creation succeeds');
      t.equal(
        secondCheckpoint.descriptor.maxCommittedHlc,
        descendingHlc(1),
        'post-compaction checkpoint preserves non-regressed maxCommittedHlc');

      // Compact to the new head so _raft_rs_log is completely empty, then
      // verify warmHlcFromDurableWitnesses warms a fresh clock to at least
      // descendingHlc(1).
      const headCompacted = compactRaftRsCommittedEntries(
        service.db,
        PARTITION_ID,
        {
          toIndex: secondCheckpoint.descriptor.lastIncludedIndex,
          proof: {checkpointDir: secondCheckpoint.checkpointDir},
        },
      );
      t.equal(headCompacted.outcome, RAFT_COMPACTION_OUTCOME.COMPACTED,
        'head compaction empties _raft_rs_log');
      t.equal(
        service.db.prepare(
          'SELECT COUNT(*) AS n FROM _raft_rs_log WHERE group_id = ?',
        ).get(PARTITION_ID).n,
        0,
        '_raft_rs_log is now completely empty');

      const observedHlcs = [];
      warmHlcFromDurableWitnesses({
        service,
        hlcClock: {
          update(hlc) {
            observedHlcs.push(hlc.toString());
          },
        },
      });
      t.same(
        observedHlcs,
        [descendingHlc(1)],
        'warmHlcFromDurableWitnesses warms HLC from compacted snapshot witness');
    });
});

test('SN1/F5: interrupted compaction on mid-creation leadership loss retries ' +
  'with zero new writes, recovers from corrupt uncompacted checkpoints, and ' +
  'triggers byte cadence from pending log bytes instead of partition size',
async (t) => {
  await withSingleReplicaLeader('sn1-cadence-retry-', 4,
    async ({checkpointsRoot, service}) => {
      const firstBoundary = Number(
        RaftRsDurableStore.readDurableRecordIn(service.db, PARTITION_ID)
          .appliedIndex,
      );
      let demoteOnce = true;
      const cadence = createPartitionSnapshotCadence({
        service,
        entryThreshold: 3,
        onAfterCreateCheckpoint: () => {
          if (demoteOnce) {
            demoteOnce = false;
            service.role = RAFT_ROLE.FOLLOWER;
          }
        },
      });

      // 1. Leadership lost mid-creation after checkpoint is sealed on disk:
      const interrupted = await cadence.tick(Date.now());
      t.equal(
        interrupted.outcome,
        RAFT_SNAPSHOT_CADENCE_OUTCOME.LEADERSHIP_LOST_MID_CREATION,
        'leadership loss across checkpoint creation returns typed outcome');
      t.equal(
        interrupted.checkpointedIndex,
        firstBoundary,
        'interrupted tick reports the sealed checkpointedIndex');
      t.same(
        listCheckpointGenerations(checkpointsRoot),
        [firstBoundary],
        'checkpoint directory was created on disk at firstBoundary');
      t.equal(
        Number(RaftRsDurableStore.readSnapshotIndexIn(service.db, PARTITION_ID)),
        0,
        '_raft_rs_log remains uncompacted when leadership is lost mid-creation');

      // Regain leadership with ZERO new writes and verify the next tick
      // compacts the existing valid checkpoint up to firstBoundary.
      service.role = RAFT_ROLE.LEADER;
      const retried = await cadence.tick(Date.now());
      t.equal(
        retried.outcome,
        RAFT_SNAPSHOT_CADENCE_OUTCOME.COMPACTED,
        'regaining leadership with 0 new entries compacts pending checkpoint');
      t.equal(
        retried.compactedUpToIndex,
        firstBoundary,
        'compactedUpToIndex equals firstBoundary');
      t.equal(
        retried.checkpointedIndex,
        firstBoundary,
        'checkpointedIndex equals firstBoundary');
      t.equal(
        retried.compactedIndex,
        firstBoundary,
        'compactedIndex advances to firstBoundary');
      t.equal(
        Number(RaftRsDurableStore.readSnapshotIndexIn(service.db, PARTITION_ID)),
        firstBoundary,
        '_raft_rs_snapshot.snapshot_index advances to firstBoundary');

      // 2. Corrupt uncompacted checkpoint directory on disk is ignored and
      // replaced by a fresh valid checkpoint + compaction:
      await proposeInsertRow(service, 5, descendingHlc(5));
      await proposeInsertRow(service, 6, descendingHlc(6));
      await proposeInsertRow(service, 7, descendingHlc(7));
      await waitFor(
        () => readUserRows(service.db).length === 7,
        'rows 5..7 committed and applied');
      const secondBoundary = Number(
        RaftRsDurableStore.readDurableRecordIn(service.db, PARTITION_ID)
          .appliedIndex,
      );
      const seeded = await createSqliteStateMachineCheckpoint({
        db: service.db,
        identity: IDENTITY,
        checkpointsRoot,
        raftRsGroupId: PARTITION_ID,
      });
      t.equal(seeded.outcome, RAFT_CHECKPOINT_CREATION_OUTCOME.CREATED,
        'seeded uncompacted checkpoint at secondBoundary');
      fs.appendFileSync(
        path.join(seeded.checkpointDir, RAFT_CHECKPOINT_PAYLOAD_FILE),
        Buffer.from('corrupt-tail'),
      );
      t.equal(
        readCheckpoint({checkpointDir: seeded.checkpointDir}).outcome,
        RAFT_CHECKPOINT_VALIDATION_OUTCOME.CORRUPT_PAYLOAD,
        'seeded uncompacted checkpoint is corrupt on disk');

      const repaired = await cadence.tick(Date.now());
      t.equal(
        repaired.outcome,
        RAFT_SNAPSHOT_CADENCE_OUTCOME.COMPACTED,
        'corrupt uncompacted checkpoint is replaced and compacted');
      t.equal(
        repaired.compactedUpToIndex,
        secondBoundary,
        'compactedUpToIndex advances to secondBoundary');
      t.equal(
        readCheckpoint({
          checkpointDir: path.join(checkpointsRoot, String(secondBoundary)),
          expectedIdentity: buildSnapshotCatchupIdentity({
            partitionId: PARTITION_ID,
            tableName: TABLE,
          }),
        }).outcome,
        RAFT_CHECKPOINT_VALIDATION_OUTCOME.VALID,
        'repaired checkpoint generation at secondBoundary validates cleanly');

      // 3. Large partition sizeBytes (>= 256 MiB) does not trigger spurious
      // checkpoints on every single write, whereas pendingLogBytes >=
      // byteThresholdBytes does trigger checkpoint and compaction:
      await proposeInsertRow(service, 8, descendingHlc(8));
      await waitFor(
        () => readUserRows(service.db).length === 8,
        'row 8 committed and applied');
      service.sizeBytes = 512 * 1024 * 1024;
      const largeDbCadence = createPartitionSnapshotCadence({
        service,
        entryThreshold: 100,
      });
      const belowByteTick = await largeDbCadence.tick(Date.now());
      t.equal(
        belowByteTick.outcome,
        RAFT_SNAPSHOT_CADENCE_OUTCOME.BELOW_THRESHOLD,
        '512 MiB partition with 1 small uncheckpointed entry stays below threshold');
      t.equal(belowByteTick.pendingEntryCount, 1,
        'pendingEntryCount is 1 after single write');
      t.ok(belowByteTick.pendingLogBytes > 0,
        'pendingLogBytes measures the uncheckpointed log entry bytes');

      const byteTriggeredCadence = createPartitionSnapshotCadence({
        service,
        entryThreshold: 100,
        byteThresholdBytes: belowByteTick.pendingLogBytes,
      });
      const byteCompacted = await byteTriggeredCadence.tick(Date.now());
      t.equal(
        byteCompacted.outcome,
        RAFT_SNAPSHOT_CADENCE_OUTCOME.COMPACTED,
        'pendingLogBytes >= byteThresholdBytes triggers checkpoint and compaction');
    });
});

test('SN1/F5: lagging established follower catches up via snapshot install, ' +
  'preserves lifecycle/election state, and replicates post-snapshot suffix ' +
  'entries while wiped/retired targets are refused', async (t) => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sn1-catchup-'));
  const router = new MessageRouter({
    bootIncarnation: TEST_BOOT_INCARNATION,
    nodeId: NODE_ID,
    nodeAddress: 'ws://sn1-node:7000',
    startServer: false,
  });
  await router.initialize();
  const r1Id = `${PARTITION_ID}-r1`;
  const r2Id = `${PARTITION_ID}-r2`;
  const r3Id = `${PARTITION_ID}-r3`;
  const replicaIds = [r1Id, r2Id, r3Id];
  const r1DbPath = path.join(workDir, 'partition', `${r1Id}.db`);
  const r2DbPath = path.join(workDir, 'partition', `${r2Id}.db`);
  const r3DbPath = path.join(workDir, 'partition', `${r3Id}.db`);
  fs.mkdirSync(path.dirname(r1DbPath), {recursive: true});

  let r1 = null;
  let r2 = null;
  let r3 = null;
  let replacementR3 = null;
  try {
    r1 = buildPartitionService(router, {
      replicaId: r1Id,
      replicaIds,
      dbPath: r1DbPath,
    });
    r2 = buildPartitionService(router, {
      replicaId: r2Id,
      replicaIds,
      dbPath: r2DbPath,
    });
    r3 = buildPartitionService(router, {
      replicaId: r3Id,
      replicaIds,
      dbPath: r3DbPath,
    });
    await r1.initialize();
    await r2.initialize();
    await r3.initialize();

    // Elect r1 across the 3-node group so all 3 replicas establish their
    // initial participation state.
    await r1.raft.campaign();
    await waitFor(
      () => r1.raft.readStatus().role === 'leader' &&
        r3.raft.readStatus().appliedIndex >= 1,
      'r1 elected leader and initial noop applied on r3');

    const r3BeforeStatus = r3.raft.readStatus();
    const r3OriginalIncarnation = r3BeforeStatus.lifecycleIncarnation;

    // Isolate r3 while r1 and r2 commit 4 entries, checkpoint + compact at
    // that boundary, and then commit 2 suffix entries above the boundary.
    router.register(r3.getUnifiedAddress(), () => {});
    for (let ordinal = 1; ordinal <= 4; ordinal += 1) {
      await proposeInsertRow(r1, ordinal, descendingHlc(ordinal));
    }
    await waitFor(
      () => readUserRows(r1.db).length === 4 && readUserRows(r2.db).length === 4,
      '4 rows committed and applied on r1 and r2');

    const leaderRoot = resolveReplicaCheckpointsRoot(r1DbPath);
    const cadence = createPartitionSnapshotCadence({
      service: r1,
      entryThreshold: 3,
    });
    const compactedTick = await cadence.tick(Date.now());
    t.equal(
      compactedTick.outcome,
      RAFT_SNAPSHOT_CADENCE_OUTCOME.COMPACTED,
      'leader r1 checkpoints and compacts prefix up to boundary');
    const boundaryIndex =
      compactedTick.creation.descriptor.lastIncludedIndex;

    // Commit 2 suffix entries above the compacted boundary on r1 + r2.
    await proposeInsertRow(r1, 5, descendingHlc(5));
    await proposeInsertRow(r1, 6, descendingHlc(6));
    await waitFor(
      () => readUserRows(r1.db).length === 6 && readUserRows(r2.db).length === 6,
      'suffix rows 5 and 6 applied on r1 and r2');
    const headIndex = r1.raft.readStatus().appliedIndex;
    t.ok(headIndex > boundaryIndex, 'leader head is above compacted boundary');

    // Reconnect r3 and trigger leader probe -> onSnapshotCatchupNeeded.
    const decisions = [];
    r1.onSnapshotCatchupNeeded = (decision) => decisions.push(decision);
    router.register(r3.getUnifiedAddress(), r3.transportHandler);
    await r1.raft.probePeerProgress(r3.getUnifiedAddress());
    await waitFor(
      () => decisions.length > 0,
      'leader emits INSTALL_SNAPSHOT catch-up decision for lagging r3');
    t.equal(
      decisions[0].outcome,
      RAFT_SNAPSHOT_CATCHUP_DECISION_OUTCOME.INSTALL_SNAPSHOT,
      'decision outcome is install_snapshot');
    t.equal(
      decisions[0].leaderBoundary,
      boundaryIndex,
      'decision carries the leader compacted snapshot boundary');
    t.equal(
      decisions[0].followerAddress,
      r3.getUnifiedAddress(),
      'decision targets lagging follower r3');

    // Verify wiped (absent) and retired targets are refused before catching up r3:
    const r3Root = resolveReplicaCheckpointsRoot(r3DbPath);
    const {a, b} = createInProcWebSocketPair();
    const [dispatched, orchestrated] = await Promise.all([
      dispatchSnapshotCatchup({
        decision: decisions[0],
        checkpointsRoot: leaderRoot,
        identity: buildSnapshotCatchupIdentity({
          partitionId: PARTITION_ID,
          tableName: TABLE,
        }),
        db: r1.db,
        socketProvider: () => a,
      }),
      orchestrateSnapshotCatchupInstall({
        service: r3,
        receiveOptions: {
          socket: b,
          checkpointsRoot: r3Root,
          expectedIdentity: buildSnapshotCatchupIdentity({
            partitionId: PARTITION_ID,
            tableName: TABLE,
          }),
        },
        createPartitionService: async (replacementOptions) => {
          const next = buildPartitionService(router, {
            ...replacementOptions,
            replicaIds,
          });
          await next.initialize();
          return next;
        },
        registerReplacementService: (next) => {
          replacementR3 = next;
        },
      }),
    ]);

    t.equal(
      dispatched.outcome,
      RAFT_SNAPSHOT_CATCHUP_DISPATCH_OUTCOME.SERVED,
      'leader serves the compacted boundary checkpoint to r3');
    t.equal(
      orchestrated.outcome,
      RAFT_SNAPSHOT_CATCHUP_INSTALL_OUTCOME.INSTALLED_AND_RECREATED,
      'r3 installs the checkpoint atomically and recreates PartitionService');
    t.ok(replacementR3, 'replacement service registered');

    const r3AfterInstallStatus = replacementR3.raft.readStatus();
    t.equal(
      r3AfterInstallStatus.lifecycleIncarnation,
      r3OriginalIncarnation,
      'follower catch-up preserves r3 exact durable lifecycle incarnation');
    t.equal(
      r3AfterInstallStatus.gateOpen,
      true,
      'recreated follower r3 reopens with participation gate open');
    t.equal(
      RaftRsDurableStore.readCompactedMaxHlcIn(replacementR3.db, PARTITION_ID),
      descendingHlc(1),
      'recreated follower r3 carries the compacted maxCommittedHlc witness');

    // Now drive a heartbeat/probe from r1 to replacementR3 so raft-rs exits
    // ProgressState::Snapshot and replicates suffix rows 5 and 6!
    await r1.raft.probePeerProgress(replacementR3.getUnifiedAddress());
    await waitFor(
      () => replacementR3.raft.readStatus().appliedIndex === headIndex &&
        readUserRows(replacementR3.db).length === 6,
      'replacementR3 receives and applies suffix entries after snapshot install');
    t.same(
      readUserRows(replacementR3.db),
      readUserRows(r1.db),
      'replacementR3 state machine converges with compacted leader r1');

    // Verify wiped (absent) and retired targets are refused without CREATE
    // admission:
    const wipedDbPath = path.join(workDir, 'partition', 'wiped.db');
    const wipedRefusal = await requestSnapshotInstall({
      replicaDbPath: wipedDbPath,
      checkpointsRoot: r3Root,
      generationIndex: boundaryIndex,
      expectedIdentity: buildSnapshotCatchupIdentity({
        partitionId: PARTITION_ID,
        tableName: TABLE,
      }),
      expectedReplicaIdentity: r3Id,
    });
    t.equal(
      wipedRefusal.outcome,
      RAFT_SNAPSHOT_INSTALL_OUTCOME.REJECTED,
      'wiped/absent target is rejected without CREATE admission');
    t.equal(
      wipedRefusal.reason,
      RAFT_SNAPSHOT_INSTALL_REJECTION.CREATE_ADMISSION_REQUIRED,
      'wiped target refusal reason is create_admission_required');

    const retiredDbPath = path.join(workDir, 'partition', 'retired.db');
    const retiredDb = new Database(retiredDbPath);
    const retiredOwner = new RaftRsReplicaLifecycleOwner({
      db: retiredDb,
      groupId: PARTITION_ID,
      peerId: '3',
      replicaIdentity: r3Id,
    });
    await retiredOwner.retire('retired-test');
    retiredDb.close();
    const retiredRefusal = await requestSnapshotInstall({
      replicaDbPath: retiredDbPath,
      checkpointsRoot: r3Root,
      generationIndex: boundaryIndex,
      expectedIdentity: buildSnapshotCatchupIdentity({
        partitionId: PARTITION_ID,
        tableName: TABLE,
      }),
      expectedReplicaIdentity: r3Id,
    });
    t.equal(
      retiredRefusal.outcome,
      RAFT_SNAPSHOT_INSTALL_OUTCOME.REJECTED,
      'retired target is rejected by follower catch-up');
    t.equal(
      retiredRefusal.reason,
      RAFT_SNAPSHOT_INSTALL_REJECTION.RECEIVER_STATE_REFUSED,
      'retired target refusal reason is receiver_state_refused');
  } finally {
    for (const svc of [replacementR3, r3, r2, r1]) {
      if (svc && !svc.isShutdown) {
        await svc.shutdown().catch(() => {});
      }
    }
    await router.shutdown();
    fs.rmSync(workDir, {recursive: true, force: true});
  }
});
