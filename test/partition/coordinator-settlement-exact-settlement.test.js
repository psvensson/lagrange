// Exact settlement of the coordinator settlement command
// (partition-coordinator-settlement.js): a record under the settlement's
// entry key settles it only when it carries the settlement's command digest.
// A near miss - an SQL statement's record, or another command's owner record,
// under the same key - is refused BYTES at request (nothing proposed) and
// fails the application closed at apply (no state change, applied index
// unchanged), never answered as the settlement's receipt.
//
// REAL: the sql_transactions partition, its request and apply owners and the
// outcome owner's recorder. DOUBLE: the consensus port (the test commits).
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {resetFixtureSingletons, clearFixtureSingletons, startLeader, shutdownAll,
  durableAppliedIndex, applyCommitted} from '../test-helpers/participant-transaction-fixture.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {COORDINATOR_SETTLEMENT_TYPE, COORDINATOR_SETTLEMENT_ERROR as ERROR} from
  '../../src/partition/partition-coordinator-settlement-constants.js';
import {TRANSACTION_SETTLEMENT_KIND as KIND} from
  '../../src/query/distributed/distributed-transaction-settlement.js';
import {buildCoordinatorSettlementCommand} from
  '../../src/partition/partition-coordinator-settlement-command.js';
import {recordCommittedStatementOutcome} from
  '../../src/partition/partition-committed-statement-outcome.js';
import {PARTITION_COMMITTED_COMMAND_OUTCOME as APPLY} from
  '../../src/partition/partition-service-constants.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);
const TX = 'b'.repeat(32);
const SESSION = 'coordinator-session';
const FREEZE = Object.freeze({kind: KIND.FREEZE, transactionId: TX, sessionId: SESSION,
  transactionEpoch: 7, participantSetText: '[]'});
const schema = {columns: [
  {name: 'transaction_id', type: 'TEXT', primaryKey: true},
  ...['session_id', 'participant_set_state', 'participant_set_text', 'commit_mode',
    'decision', 'decision_text', 'decision_digest', 'status'].map((name) => ({name, type: 'TEXT'})),
  ...['transaction_epoch', 'frozen_participant_count'].map((name) => ({name, type: 'INTEGER'})),
]};
const row = (service) => service.db.prepare('SELECT * FROM sql_transactions').get();
const send = (service, settlement) => service.handleApplicationMessage(
  {type: COORDINATOR_SETTLEMENT_TYPE, settlement});

const NEAR_MISSES = Object.freeze([
  ['an SQL statement record', {result: {changes: 1, lastInsertRowid: null}}],
  ['another command\'s owner record', {result: null,
    ownerResultText: '{"outcome":"APPLIED"}', commandDigest: 'c'.repeat(64)}],
]);

for (const [name, fields] of NEAR_MISSES) {
  test(`coordinator settlement: ${name} under its entry key never settles it`, async () => {
    const {leader, proposed} = await startLeader({tableName: SYSTEM_TABLE_NAME.SQL_TRANSACTIONS,
      schema, generationOrigin: false});
    try {
      leader.db.prepare('INSERT INTO sql_transactions (transaction_id,session_id,' +
        'transaction_epoch,participant_set_state,participant_set_text,commit_mode,' +
        'frozen_participant_count,status) VALUES (?, ?, ?, \'OPEN\', \'[]\', ' +
        '\'NOT_SELECTED\', 0, \'ACTIVE\')').run(TX, SESSION, 7);
      const command = buildCoordinatorSettlementCommand(leader, FREEZE);
      assert.ok(command);
      recordCommittedStatementOutcome(leader, {entryKey: leader.getCommittedEntryKey(command),
        outcome: APPLY.APPLIED, index: 1, term: 1, ...fields});
      const before = row(leader);
      const requested = await send(leader, FREEZE);
      const appliedBefore = durableAppliedIndex(leader);
      const applied = applyCommitted(leader, command);
      assert.deepEqual({request: requested.failureCode, proposals: proposed.length,
        apply: applied, appliedIndexAdvance: durableAppliedIndex(leader) - appliedBefore},
      {request: ERROR.BYTES, proposals: 0, apply: ERROR.BYTES, appliedIndexAdvance: 0});
      assert.deepEqual(row(leader), before);
    } finally {
      await shutdownAll(leader);
    }
  });
}
