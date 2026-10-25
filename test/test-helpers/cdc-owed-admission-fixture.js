import assert from 'node:assert/strict';
import {PARTITION_CDC_OBLIGATION_BOUND} from '../../src/partition/partition-cdc-obligation-constants.js';
import {PARTITION_WRITE_LEADERSHIP_REFUSAL} from '../../src/partition/partition-write-kernel.js';
import {commitOnAll, upsertOf} from './cdc-hydration-handoff-fixture.js';
import {CDC_TABLE, track} from './participant-transaction-fixture.js';

const OWED_CAPACITY = PARTITION_CDC_OBLIGATION_BOUND.OWED_MAX_EVENTS;
const PRESSURE_CODE = PARTITION_WRITE_LEADERSHIP_REFUSAL.CDC_CAPACITY;
const CDC = Object.freeze({tableName: CDC_TABLE});
const WRITE_SQL = `INSERT OR REPLACE INTO ${CDC_TABLE} (id, value) VALUES (?, ?)`;

function fillDebt(leader, count, followers = []) {
  const replicas = [leader, ...followers];
  for (let index = 0; index < count; index += 1) {
    assert.deepEqual(commitOnAll(replicas, upsertOf(leader, 'owed', index)),
      replicas.map(() => null));
  }
}

function write(leader, entryId) {
  return track(leader.executeQuery(WRITE_SQL, ['pressure-row', entryId], {entryId}));
}

export {CDC, OWED_CAPACITY, PRESSURE_CODE, WRITE_SQL, fillDebt, write};
