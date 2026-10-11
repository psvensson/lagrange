import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';

import {test} from '../../src/test-helpers/tap.js';
import {PartitionRaftStorage} from '../../src/partition/partition-raft-storage.js';
import {
  ensureCdcObligationLedger,
  insertCdcObligation,
} from '../../src/partition/partition-cdc-obligation-ledger.js';
import {SQLiteLogAdapter} from '../../src/raft/sqlite-log-adapter.js';
import {
  RAFT_CHECKPOINT_CREATION_OUTCOME,
  RAFT_CHECKPOINT_EXCLUDED_TABLES,
  RAFT_CHECKPOINT_PAYLOAD_FILE,
} from '../../src/raft/snapshot-checkpoint-constants.js';
import {
  createSqliteStateMachineCheckpoint,
} from '../../src/raft/snapshot-checkpoint-store.js';

const PARTITION_ID = 'cdc-image-p1';
const TERM = 7;
const IDENTITY = Object.freeze({
  clusterId: 'cdc-image-cluster',
  raftGroupId: PARTITION_ID,
  entity: Object.freeze({kind: 'partition', id: 'cdc_image'}),
  membershipEpoch: 11,
});
const EVENT_KEY = 'txop:participant-å京\u0000tail:3';
const ENTRY_ID = 'decision:participant-🧪:epoch-9';
const EVENT_JSON = JSON.stringify({
  tableName: 'cdc_image',
  operation: 'UPDATE',
  sourcePartition: PARTITION_ID,
  sourceReplica: 'replica-ä',
  timestamp: '123-4-cdc-image',
  data: {id: 'row-雪', value: 'before-later-write'},
});

function createFixture() {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdc-image-'));
  const dbPath = path.join(workDir, 'replica.db');
  const db = new Database(dbPath);
  const adapter = new SQLiteLogAdapter(db, {address: PARTITION_ID, term: TERM});
  const storage = new PartitionRaftStorage(db, PARTITION_ID, adapter);
  return {
    workDir,
    db,
    adapter,
    storage,
    checkpointsRoot: path.join(workDir, 'checkpoints'),
    close() {
      db.close();
      fs.rmSync(workDir, {recursive: true, force: true});
    },
  };
}

function textBytes(value) {
  return Buffer.from(value, 'utf8').toString('hex').toUpperCase();
}

function obligationImage(db) {
  return db.prepare(
    'SELECT event_key AS eventKey, log_index AS logIndex, term, ordinal, ' +
    'entry_id AS entryId, event_json AS eventJson, delivered, ' +
    'delivered_index AS deliveredIndex, delivered_term AS deliveredTerm, ' +
    'hex(CAST(event_key AS BLOB)) AS eventKeyBytes, ' +
    'hex(CAST(entry_id AS BLOB)) AS entryIdBytes, ' +
    'hex(CAST(event_json AS BLOB)) AS eventJsonBytes ' +
    'FROM _cdc_obligations',
  ).get();
}

test('a physical SQLite checkpoint retains the exact owed CDC obligation image',
  async (t) => {
    const fixture = createFixture();
    try {
      const entry = fixture.adapter.saveCommand(
        {type: 'TRANSACTION_COMMIT', entryId: ENTRY_ID}, TERM);
      fixture.adapter.commit(entry.index);
      fixture.db.transaction(() => {
        ensureCdcObligationLedger(fixture.db);
        insertCdcObligation(fixture.db, {
          eventKey: EVENT_KEY,
          logIndex: entry.index,
          term: TERM,
          ordinal: 3,
          entryId: ENTRY_ID,
          eventJson: EVENT_JSON,
        });
        fixture.storage.recordAppliedAdvance();
      })();

      const sourceImage = obligationImage(fixture.db);
      t.same(sourceImage, {
        eventKey: EVENT_KEY,
        logIndex: entry.index,
        term: TERM,
        ordinal: 3,
        entryId: ENTRY_ID,
        eventJson: EVENT_JSON,
        delivered: 0,
        deliveredIndex: null,
        deliveredTerm: null,
        eventKeyBytes: textBytes(EVENT_KEY),
        entryIdBytes: textBytes(ENTRY_ID),
        eventJsonBytes: textBytes(EVENT_JSON),
      }, 'anti-vacuous source image contains the exact owed obligation bytes');

      const created = await createSqliteStateMachineCheckpoint({
        db: fixture.db,
        identity: IDENTITY,
        checkpointsRoot: fixture.checkpointsRoot,
      });
      t.equal(created.outcome, RAFT_CHECKPOINT_CREATION_OUTCOME.CREATED,
        'the aligned application image is sealed');
      t.equal(created.descriptor.lastIncludedIndex, entry.index,
        'the image descriptor names the obligation entry');

      const payload = new Database(
        path.join(created.checkpointDir, RAFT_CHECKPOINT_PAYLOAD_FILE),
        {readonly: true},
      );
      try {
        const payloadTables = payload.prepare(
          'SELECT name FROM sqlite_master WHERE type = \'table\' ORDER BY name',
        ).all().map((row) => row.name);
        t.ok(payloadTables.includes('_cdc_obligations'),
          'the CDC obligation ledger is application state in the payload');
        for (const excluded of RAFT_CHECKPOINT_EXCLUDED_TABLES) {
          t.notOk(payloadTables.includes(excluded),
            `the payload excludes consensus table ${excluded}`);
        }
        t.same(obligationImage(payload), sourceImage,
          'the checkpoint retains every identity, payload, position and owed byte');
      } finally {
        payload.close();
      }
    } finally {
      fixture.close();
    }
  });
