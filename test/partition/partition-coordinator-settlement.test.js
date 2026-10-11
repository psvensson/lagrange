// Adapter proof: real partition request/application/SQLite outcome owners,
// controllable consensus ordering for conflict and storage-failure schedules.
import assert from 'node:assert/strict';
import {beforeEach, afterEach, test} from 'node:test';
import {resetFixtureSingletons, clearFixtureSingletons, startLeader, shutdownAll,
  track, awaitProposal, durableAppliedIndex, applyCommitted, plantAppliedStateFailure,
  removeAppliedStateFailure} from '../test-helpers/participant-transaction-fixture.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {COORDINATOR_SETTLEMENT_TYPE, COORDINATOR_SETTLEMENT_RESULT as RESULT} from
  '../../src/partition/partition-coordinator-settlement-constants.js';
import {transactionSettlementBytes, TRANSACTION_SETTLEMENT_KIND as KIND,
  TRANSACTION_SETTLEMENT_OUTCOME as OUTCOME} from
  '../../src/query/distributed/distributed-transaction-settlement.js';
import {buildDecisionRecord} from '../../src/partition/partition-participant-transaction-bytes.js';
import {PARTITION_COMMITTED_COMMAND_ORIGIN, admitCommittedCommand} from
  '../../src/partition/partition-committed-command-admission.js';
import {buildCoordinatorSettlementCommand} from
  '../../src/partition/partition-coordinator-settlement-command.js';
import {readCommittedStatementOutcome} from
  '../../src/partition/partition-committed-statement-outcome.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);
const TX = 'a'.repeat(32);
const SESSION = 'coordinator-session';
const BASE = Object.freeze({transactionId: TX, sessionId: SESSION,
  transactionEpoch: 7, participantSetText: '[]'});
const FREEZE = Object.freeze({kind: KIND.FREEZE, ...BASE});
const schema = {columns: [
  {name: 'transaction_id', type: 'TEXT', primaryKey: true},
  ...['session_id', 'participant_set_state', 'participant_set_text', 'commit_mode',
    'decision', 'decision_text', 'decision_digest', 'status'].map((name) => ({name, type: 'TEXT'})),
  ...['transaction_epoch', 'frozen_participant_count'].map((name) => ({name, type: 'INTEGER'})),
]};

async function fixture(measure) {
  const {leader, proposed} = await startLeader({tableName: SYSTEM_TABLE_NAME.SQL_TRANSACTIONS,
    schema, generationOrigin: false});
  try {
    leader.db.prepare('INSERT INTO sql_transactions (transaction_id,session_id,transaction_epoch,' +
      'participant_set_state,participant_set_text,commit_mode,frozen_participant_count,status) ' +
      'VALUES (?, ?, ?, \'OPEN\', \'[]\', \'NOT_SELECTED\', 0, \'ACTIVE\')').run(TX, SESSION, 7);
    await measure(leader, proposed);
  } finally {
    await shutdownAll(leader);
  }
}

const send = (service, settlement) => service.handleApplicationMessage(
  {type: COORDINATOR_SETTLEMENT_TYPE, settlement});
const row = (service) => service.db.prepare('SELECT * FROM sql_transactions').get();
const entry = (service, command) => readCommittedStatementOutcome(service,
  service.getCommittedEntryKey(command));

test('closed ordinary admission permits only fixed freeze/rollback and exact durable replay', () =>
  fixture(async (leader, proposed) => {
    assert.equal((await leader.executeQuery('UPDATE sql_transactions SET status=\'unsafe\''))
      .success, false);
    const first = track(send(leader, FREEZE));
    const command = await awaitProposal(proposed,
      (value) => value.type === COORDINATOR_SETTLEMENT_TYPE);
    assert.ok(command);
    assert.equal(row(leader).participant_set_state, 'OPEN');
    assert.equal(applyCommitted(leader, command), null);
    const answer = await first.promise;
    assert.equal(answer[RESULT].outcome, OUTCOME.APPLIED);
    assert.equal(row(leader).participant_set_state, 'FROZEN');
    const stored = entry(leader, command);
    assert.deepEqual(JSON.parse(stored.ownerResultText), answer[RESULT]);
    assert.deepEqual((await send(leader, FREEZE))[RESULT], answer[RESULT]);
    assert.equal(proposed.length, 1);
    const rollback = buildDecisionRecord(TX, 'ROLLBACK', []);
    const deciding = track(send(leader, {kind: KIND.DECIDE, ...BASE,
      decision: rollback.decision, decisionText: rollback.decisionText,
      decisionDigest: rollback.decisionDigest}));
    const decision = await awaitProposal(proposed, (value) => value.entryId !== command.entryId);
    assert.equal(applyCommitted(leader, decision), null);
    assert.equal((await deciding.promise)[RESULT].outcome, OUTCOME.APPLIED);
    assert.equal(row(leader).decision, 'ROLLBACK');
  }));

test('ordinary write origin cannot propose fixed settlement and new COMMIT never enters consensus', () =>
  fixture(async (leader, proposed) => {
    const command = buildCoordinatorSettlementCommand(leader, FREEZE);
    assert.equal(admitCommittedCommand(command,
      {origin: PARTITION_COMMITTED_COMMAND_ORIGIN.WRITE_PATH}).admitted, false);
    leader.db.exec('UPDATE sql_transactions SET participant_set_state=\'FROZEN\',' +
      'commit_mode=\'TWO_PHASE_COMMIT\'');
    const commit = buildDecisionRecord(TX, 'COMMIT', []);
    const refused = await send(leader, {kind: KIND.DECIDE, ...BASE,
      decision: commit.decision, decisionText: commit.decisionText,
      decisionDigest: commit.decisionDigest});
    assert.equal(refused[RESULT].outcome, OUTCOME.REFUSED);
    assert.equal(refused[RESULT].reason, 'new_commit_forbidden');
    assert.equal(proposed.length, 0);
    assert.equal(row(leader).decision, null);
  }));

test('enlist winning between source and apply is a retained conflict, not lineage rewrite', () =>
  fixture(async (leader, proposed) => {
    const pending = track(send(leader, FREEZE));
    const command = await awaitProposal(proposed, () => true);
    // Models the earlier committed enlist at the application boundary.
    const changed = JSON.stringify([[`${TX}:remote`, 'remote']]);
    leader.db.prepare('UPDATE sql_transactions SET participant_set_text=?').run(changed);
    assert.equal(applyCommitted(leader, command), null);
    const result = (await pending.promise)[RESULT];
    assert.equal(result.outcome, OUTCOME.REFUSED);
    assert.equal(result.reason, 'participant_set_conflict');
    assert.equal(row(leader).participant_set_state, 'OPEN');
    assert.equal(row(leader).participant_set_text, changed);
    assert.deepEqual((await send(leader, FREEZE))[RESULT], result);
  }));

test('applied-index failure rolls back the fixed CAS and retained result together', () =>
  fixture(async (leader) => {
    const command = buildCoordinatorSettlementCommand(leader, FREEZE);
    const before = durableAppliedIndex(leader);
    plantAppliedStateFailure(leader.db);
    assert.notEqual(applyCommitted(leader, command), null);
    assert.equal(row(leader).participant_set_state, 'OPEN');
    assert.equal(entry(leader, command).state, 'unsettled');
    assert.equal(durableAppliedIndex(leader), before);
    removeAppliedStateFailure(leader.db);
    assert.equal(applyCommitted(leader, command), null);
    assert.equal(row(leader).participant_set_state, 'FROZEN');
    assert.equal(entry(leader, command).state, 'settled');
    assert.equal(transactionSettlementBytes(FREEZE).entryId, command.entryId);
  }));
