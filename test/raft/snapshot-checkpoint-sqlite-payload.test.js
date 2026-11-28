import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';

import {test} from '../../src/test-helpers/tap.js';

import {
  insertParticipantTransactionRow,
  openParticipantTransactionStore,
} from '../../src/partition/partition-participant-transaction-store.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {
  RaftRsPeerIdentityRegistry,
} from '../../src/raft/raft-rs-peer-identity.js';
import {
  RAFT_CHECKPOINT_CREATION_OUTCOME,
  RAFT_CHECKPOINT_PAYLOAD_FILE,
  RAFT_CHECKPOINT_PAYLOAD_KIND,
  RAFT_CHECKPOINT_VALIDATION_OUTCOME,
  RAFT_RS_CHECKPOINT_REASON,
} from '../../src/raft/snapshot-checkpoint-constants.js';
import {
  createSqliteStateMachineCheckpoint,
  listCheckpointGenerations,
  readCheckpoint,
} from '../../src/raft/snapshot-checkpoint-store.js';

// raft-snapshot-checkpoint-format S1 (R1) SQLite evidence bar on the canonical
// raft-rs replica-image path: seed consensus tables and state-machine rows,
// create a RAFT_RS_REPLICA_IMAGE checkpoint, prove all _raft_rs_* consensus
// tables are scrubbed while state-machine rows and peer reservations survive,
// and prove divergent watermarks / pending prepared transactions / memory DBs
// fail closed.

const PARTITION_ID = 'sql_transactions-p1';
const STATE_TABLE = 'sql_transactions';
const LEADER_REPLICA = `${PARTITION_ID}-r1`;
const FOLLOWER_REPLICA = `${PARTITION_ID}-r2`;
const ENTRY_COUNT = 3;
const SEALED_EPOCH = 3;
const TERM = 2;
const MEMBERSHIP_GENERATION = String(SEALED_EPOCH);
const IDENTITY = Object.freeze({
  clusterId: 'cluster-incarnation-1234',
  raftGroupId: PARTITION_ID,
  entity: Object.freeze({kind: 'partition', id: STATE_TABLE}),
  membershipEpoch: SEALED_EPOCH,
});
const SELECT_TABLE_NAMES =
  'SELECT name FROM sqlite_master WHERE type = \'table\' ORDER BY name';

function createFixture() {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raft-checkpoint-'));
  const dbPath = path.join(workDir, 'replica.db');
  const db = new Database(dbPath);
  const registry = new RaftRsPeerIdentityRegistry(db);
  const leaderPeerId = registry.registerReplica(LEADER_REPLICA);
  const followerPeerId = registry.registerReplica(FOLLOWER_REPLICA);
  const confState = {
    voters: [leaderPeerId, followerPeerId],
    learners: [],
    votersOutgoing: [],
    learnersNext: [],
    autoLeave: false,
  };
  const store = new RaftRsDurableStore(db);
  db.exec(`CREATE TABLE IF NOT EXISTS ${STATE_TABLE} ` +
    '(id TEXT PRIMARY KEY, payload TEXT)');
  return {
    workDir,
    db,
    store,
    confState,
    checkpointsRoot: path.join(workDir, 'checkpoints'),
    close() {
      db.close();
      fs.rmSync(workDir, {recursive: true, force: true});
    },
  };
}

function seedCommittedFixture(fixture) {
  const entries = [];
  for (let ordinal = 1; ordinal <= ENTRY_COUNT; ordinal += 1) {
    fixture.db.prepare(
      `INSERT INTO ${STATE_TABLE} (id, payload) VALUES (?, ?)`,
    ).run(`row-${ordinal}`, `payload-${ordinal}`);
    entries.push({
      index: String(ordinal),
      term: String(TERM),
      entryType: 0,
      data: Buffer.from(JSON.stringify({sql: `row-${ordinal}`})).toString('base64'),
    });
  }
  fixture.store.transaction(() => {
    fixture.store.putBootstrapAppliedState(PARTITION_ID, fixture.confState, {
      bootstrapIndex: '0',
      admissionIndex: '0',
      membershipGenerationIndex: MEMBERSHIP_GENERATION,
    });
    fixture.store.appendEntries(PARTITION_ID, entries);
    fixture.store.putAppliedState(
      PARTITION_ID,
      String(ENTRY_COUNT),
      fixture.confState,
      undefined,
      MEMBERSHIP_GENERATION,
    );
    fixture.store.putHardState(PARTITION_ID, {
      term: String(TERM),
      vote: '0',
      commit: String(ENTRY_COUNT),
    });
  });
  return ENTRY_COUNT;
}

function tableNames(db) {
  return db.prepare(SELECT_TABLE_NAMES).all().map((row) => row.name);
}

test('a sealed raft-rs payload excludes consensus tables and keeps the committed image',
  async (t) => {
    const fixture = createFixture();
    try {
      const lastIndex = seedCommittedFixture(fixture);
      const sourceTables = tableNames(fixture.db);
      t.ok(sourceTables.some((name) => name.startsWith('_raft_rs_')),
        'anti-vacuous: source database really contains _raft_rs_* consensus tables');
      t.ok(sourceTables.includes(STATE_TABLE),
        'anti-vacuous: source database really contains application state');

      const created = await createSqliteStateMachineCheckpoint({
        db: fixture.db,
        identity: IDENTITY,
        checkpointsRoot: fixture.checkpointsRoot,
        raftRsGroupId: PARTITION_ID,
      });
      t.equal(created.outcome, RAFT_CHECKPOINT_CREATION_OUTCOME.CREATED,
        'creation succeeds on an aligned file-backed raft-rs replica');
      t.equal(created.descriptor.lastIncludedIndex, lastIndex,
        'lastIncludedIndex equals the sealed image\'s applied index');
      t.equal(created.descriptor.lastIncludedTerm, TERM,
        'lastIncludedTerm is read from the sealed image\'s own raft-rs log');
      t.equal(created.descriptor.payloadKind,
        RAFT_CHECKPOINT_PAYLOAD_KIND.RAFT_RS_REPLICA_IMAGE,
        'the payload kind is canonical RAFT_RS_REPLICA_IMAGE');

      const payload = new Database(
        path.join(created.checkpointDir, RAFT_CHECKPOINT_PAYLOAD_FILE),
        {readonly: true},
      );
      try {
        const payloadTables = tableNames(payload);
        t.equal(
          payloadTables.some((name) => name.startsWith('_raft_')),
          false,
          'sealed payload proves all _raft_* consensus tables are absent');
        t.ok(payloadTables.includes('raft_rs_peer_identity'),
          'peer identity reservations survive in the sealed payload');
        t.equal(
          payload.prepare(
            `SELECT COUNT(*) AS rows FROM ${STATE_TABLE}`).get().rows,
          ENTRY_COUNT,
          'state-machine rows equal the committed image');
      } finally {
        payload.close();
      }
      t.same(listCheckpointGenerations(fixture.checkpointsRoot),
        [lastIndex],
        'the generation is listed under its lastIncludedIndex');
    } finally {
      fixture.close();
    }
  });

test('creator validates staged bytes before publishing or replacing a generation', async (t) => {
  const fixture = createFixture();
  try {
    const index = seedCommittedFixture(fixture);
    const create = (identity) => createSqliteStateMachineCheckpoint({db: fixture.db,
      checkpointsRoot: fixture.checkpointsRoot, raftRsGroupId: PARTITION_ID, identity});
    const foreign = await create({...IDENTITY, raftGroupId: 'other-group'});
    t.equal(foreign.outcome, RAFT_CHECKPOINT_CREATION_OUTCOME.IMAGE_REJECTED);
    t.equal(foreign.validation?.outcome, RAFT_CHECKPOINT_VALIDATION_OUTCOME.CORRUPT_DESCRIPTOR);
    t.same(foreign.reasons, [RAFT_RS_CHECKPOINT_REASON.DESCRIPTOR]);
    t.same(fs.readdirSync(fixture.checkpointsRoot), [], 'no directory for rejected bytes');

    const original = await create(IDENTITY);
    t.equal(original.outcome, RAFT_CHECKPOINT_CREATION_OUTCOME.CREATED);
    fixture.db.exec('CREATE TABLE _partition_statement_outcomes (entry_key TEXT)');
    const rejected = await create(IDENTITY);
    t.equal(rejected.outcome, RAFT_CHECKPOINT_CREATION_OUTCOME.IMAGE_REJECTED);
    t.equal(rejected.validation?.outcome, RAFT_CHECKPOINT_VALIDATION_OUTCOME.CORRUPT_PAYLOAD);
    t.same(rejected.reasons, [RAFT_RS_CHECKPOINT_REASON.PAYLOAD_TABLES]);
    t.same(fs.readdirSync(fixture.checkpointsRoot), [String(index)]);
    const retained = readCheckpoint({checkpointDir: original.checkpointDir, expectedIdentity: IDENTITY});
    t.equal(retained.outcome, RAFT_CHECKPOINT_VALIDATION_OUTCOME.VALID);
    t.same(retained.descriptor, original.descriptor, 'same-index refusal preserves the original manifest and payload');
  } finally {
    fixture.close();
  }
});

test('creation fails closed on raft-rs watermark divergence and pending prepared tx',
  async (t) => {
    await t.test('absent hard state / raft-rs record', async (t) => {
      const fixture = createFixture();
      try {
        const created = await createSqliteStateMachineCheckpoint({
          db: fixture.db,
          identity: IDENTITY,
          checkpointsRoot: fixture.checkpointsRoot,
          raftRsGroupId: PARTITION_ID,
        });
        t.equal(created.outcome,
          RAFT_CHECKPOINT_CREATION_OUTCOME.APPLY_WATERMARK_DIVERGENCE,
          'an uninitialized raft-rs database is refused');
        t.ok(created.reasons.includes(RAFT_RS_CHECKPOINT_REASON.BOUNDARY),
          'the divergence reason names raft_rs_boundary');
      } finally {
        fixture.close();
      }
    });

    await t.test('applied ahead of committed hard state', async (t) => {
      const fixture = createFixture();
      try {
        seedCommittedFixture(fixture);
        fixture.store.putHardState(PARTITION_ID, {
          term: String(TERM),
          vote: '0',
          commit: String(ENTRY_COUNT - 1),
        });
        const created = await createSqliteStateMachineCheckpoint({
          db: fixture.db,
          identity: IDENTITY,
          checkpointsRoot: fixture.checkpointsRoot,
          raftRsGroupId: PARTITION_ID,
        });
        t.equal(created.outcome,
          RAFT_CHECKPOINT_CREATION_OUTCOME.APPLY_WATERMARK_DIVERGENCE,
          'applied ahead of commit watermark is refused');
        t.ok(created.reasons.includes(RAFT_RS_CHECKPOINT_REASON.BOUNDARY),
          'the divergence reason names raft_rs_boundary');
      } finally {
        fixture.close();
      }
    });

    await t.test('missing boundary entry term', async (t) => {
      const fixture = createFixture();
      try {
        seedCommittedFixture(fixture);
        fixture.db.prepare(
          'DELETE FROM _raft_rs_log WHERE group_id = ? AND log_index = ?',
        ).run(PARTITION_ID, String(ENTRY_COUNT));
        const created = await createSqliteStateMachineCheckpoint({
          db: fixture.db,
          identity: IDENTITY,
          checkpointsRoot: fixture.checkpointsRoot,
          raftRsGroupId: PARTITION_ID,
        });
        t.equal(created.outcome,
          RAFT_CHECKPOINT_CREATION_OUTCOME.APPLY_WATERMARK_DIVERGENCE,
          'missing boundary term entry is refused');
        t.ok(created.reasons.includes(RAFT_RS_CHECKPOINT_REASON.BOUNDARY),
          'the divergence reason names raft_rs_boundary');
      } finally {
        fixture.close();
      }
    });

    await t.test('pending prepared participant transaction', async (t) => {
      const fixture = createFixture();
      try {
        seedCommittedFixture(fixture);
        openParticipantTransactionStore(fixture.db);
        insertParticipantTransactionRow(fixture.db, {
          transactionId: 'tx-prepared-refusal',
          participantId: `${PARTITION_ID}:p1`,
          commitMode: 'two_phase',
          transactionEpoch: 1,
          state: 'PREPARED',
        });
        const created = await createSqliteStateMachineCheckpoint({
          db: fixture.db,
          identity: IDENTITY,
          checkpointsRoot: fixture.checkpointsRoot,
          raftRsGroupId: PARTITION_ID,
        });
        t.equal(created.outcome,
          RAFT_CHECKPOINT_CREATION_OUTCOME.PREPARED_TRANSACTIONS_PENDING,
          'pending prepared participant transactions refuse checkpointing');
        t.ok(
          created.reasons.includes(RAFT_RS_CHECKPOINT_REASON.PREPARED_TRANSACTIONS),
          'the refusal names prepared_participant_transactions');
      } finally {
        fixture.close();
      }
    });
  });

test('memory-backed databases are typed unsupported adapters', async (t) => {
  const memoryDb = new Database(':memory:');
  try {
    const created = await createSqliteStateMachineCheckpoint({
      db: memoryDb,
      identity: IDENTITY,
      checkpointsRoot: path.join(os.tmpdir(), 'raft-checkpoint-memory'),
      raftRsGroupId: PARTITION_ID,
    });
    t.equal(created.outcome,
      RAFT_CHECKPOINT_CREATION_OUTCOME.UNSUPPORTED_ADAPTER,
      ':memory: database is refused');
  } finally {
    memoryDb.close();
  }
  const missingDb = await createSqliteStateMachineCheckpoint({
    db: null,
    identity: IDENTITY,
    checkpointsRoot: path.join(os.tmpdir(), 'raft-checkpoint-none'),
    raftRsGroupId: PARTITION_ID,
  });
  t.equal(missingDb.outcome,
    RAFT_CHECKPOINT_CREATION_OUTCOME.UNSUPPORTED_ADAPTER,
    'null database is refused');
});
