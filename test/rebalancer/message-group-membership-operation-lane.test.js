/**
 * Durable foundation for the fresh message-group membership owner.
 *
 * The production replica_operations schema must carry the exact monotonic
 * membership state and a nullable unique lane key. Later cells in this file
 * exercise two real repository/coordinator instances against one SQLite file;
 * this first red fixes the canonical schema boundary before either owner can
 * claim or recover the lane.
 */

import assert from 'node:assert/strict';
import {test} from 'node:test';
import Database from 'better-sqlite3';

import {REPLICA_OPERATIONS_SCHEMA} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {
  generateCreateIndexSQL,
  generateCreateTableSQL,
} from '../../src/bootstrap/system-table-schema-sql.js';

const MEMBERSHIP_COLUMNS = Object.freeze([
  'source_replica_id',
  'message_group_membership_lane_key',
  'message_group_membership_phase',
  'message_group_membership_obligation_state',
  'message_group_membership_identity',
  'message_group_learner_stamp',
  'message_group_voter_stamp',
  'message_group_removal_stamp',
  'message_group_source_lifecycle_claim',
]);
const MEMBERSHIP_LANE_INDEX =
  'idx_replica_ops_message_group_membership_lane';

test('canonical replica_operations schema owns the durable message-group ' +
  'phase and one nullable unique membership lane', () => {
  const database = new Database(':memory:');
  try {
    database.exec(generateCreateTableSQL(REPLICA_OPERATIONS_SCHEMA));
    for (const sql of generateCreateIndexSQL(REPLICA_OPERATIONS_SCHEMA)) {
      database.exec(sql);
    }

    const columnNames = new Set(database
      .prepare('PRAGMA table_info(replica_operations)')
      .all()
      .map((column) => column.name));
    assert.deepEqual(
      MEMBERSHIP_COLUMNS.filter((column) => !columnNames.has(column)),
      [],
      'fresh and reopened databases expose every owner field canonically',
    );

    const laneIndex = database
      .prepare('PRAGMA index_list(replica_operations)')
      .all()
      .find((index) => index.name === MEMBERSHIP_LANE_INDEX);
    assert.ok(laneIndex, 'the canonical schema creates the group lane index');
    assert.equal(laneIndex.unique, 1,
      'the authoritative SQL boundary, not a planner precheck, owns exclusion');
  } finally {
    database.close();
  }
});
