// Coordinator setup is real SQL through the native control partition. Its
// fixed settlement owner freezes the manifest and records ROLLBACK; only that
// committed result supplies participant decision bytes. This is a partition
// interaction witness, not a QueryEngine routing/recovery certification.
import assert from 'node:assert/strict';
import {buildDecisionRecord} from
  '../../src/partition/partition-participant-transaction-bytes.js';
import {participantSetTextOf} from
  '../../src/query/distributed/distributed-transaction-participant-manifest.js';
import {COORDINATOR_SETTLEMENT_TYPE, COORDINATOR_SETTLEMENT_RESULT as RESULT} from
  '../../src/partition/partition-coordinator-settlement-constants.js';
import {TRANSACTION_SETTLEMENT_KIND as KIND} from
  '../../src/query/distributed/distributed-transaction-settlement.js';
import {PARTITION_SERVICE_OPERATION as OP} from '../../src/partition/partition-service-constants.js';
import {txMessage} from '../test-helpers/participant-transaction-fixture.js';

async function coordinatorIntent(control, identity, partitionId) {
  const {transactionId, sessionId, transactionEpoch} = identity;
  const now = Date.now();
  const inserted = await control.applyWrite({type: OP.INSERT, entryId: `${transactionId}:begin`,
    sql: 'INSERT INTO sql_transactions (transaction_id, session_id, status, transaction_epoch, ' +
      'timeout_deadline, transaction_mode, participant_set_state, participant_set_text, ' +
      'commit_mode, frozen_participant_count, created_at, updated_at) ' +
      'VALUES (?, ?, \'ACTIVE\', ?, ?, \'EXPLICIT\', \'OPEN\', \'[]\', \'NOT_SELECTED\', 0, ?, ?)',
    params: [transactionId, sessionId, transactionEpoch, now + 10000, now, now]});
  assert.equal(inserted.success, true, JSON.stringify(inserted));
  const participantSetText = participantSetTextOf(transactionId, [partitionId]);
  const admitted = await control.applyWrite({type: OP.UPDATE,
    entryId: `${transactionId}:enlist`,
    sql: 'UPDATE sql_transactions SET participant_set_text = ? WHERE transaction_id = ? ' +
      'AND session_id = ? AND transaction_epoch = ? AND participant_set_text = \'[]\' ' +
      'AND participant_set_state = \'OPEN\' AND decision IS NULL',
    params: [participantSetText, transactionId, sessionId, transactionEpoch]});
  assert.equal(admitted.success, true, JSON.stringify(admitted));
  assert.equal(admitted.changes, 1);
  const base = {transactionId, sessionId, transactionEpoch, participantSetText};
  const frozen = await control.handleApplicationMessage({type: COORDINATOR_SETTLEMENT_TYPE,
    settlement: {kind: KIND.FREEZE, ...base}});
  assert.equal(frozen[RESULT]?.outcome, 'applied', JSON.stringify(frozen));
  return base;
}

async function recordRollback(control, base, identity, preparedDigest) {
  const intent = buildDecisionRecord(identity.transactionId, 'ROLLBACK',
    [[identity.participantId, preparedDigest]]);
  const answer = await control.handleApplicationMessage({type: COORDINATOR_SETTLEMENT_TYPE,
    settlement: {kind: KIND.DECIDE, ...base, decision: intent.decision,
      decisionText: intent.decisionText, decisionDigest: intent.decisionDigest}});
  assert.equal(answer[RESULT]?.outcome, 'applied', JSON.stringify(answer));
  assert.equal(answer.committed, true);
  const recorded = answer[RESULT].recordedDecision;
  const row = control.db.prepare('SELECT * FROM sql_transactions WHERE transaction_id = ?')
    .get(identity.transactionId);
  assert.equal(row.decision_text, recorded.decisionText);
  assert.equal(row.decision_digest, recorded.decisionDigest);
  const message = txMessage(OP.ROLLBACK, identity, {decision: recorded.decision,
    decisionText: recorded.decisionText, decisionDigest: recorded.decisionDigest,
    preparedDigest: recorded.participants.find(([id]) => id === identity.participantId)[1]});
  return {answer, row, message};
}

async function finishCoordinator(control, base, decisionDigest) {
  const answer = await control.handleApplicationMessage({type: COORDINATOR_SETTLEMENT_TYPE,
    settlement: {kind: KIND.PROGRESS, ...base, decisionDigest, status: 'ROLLED_BACK'}});
  assert.equal(answer[RESULT]?.outcome, 'applied', JSON.stringify(answer));
}

export {coordinatorIntent, recordRollback, finishCoordinator};
