// PLACEMENT_ADMIT through the real committed apply path (quest
// replica-placement-admission-owner, design section 2.5; WP-E falsifiers F3,
// F4, F5, F6, F7, F8).
//
// REAL: the replica_operations-p1 PartitionService, its committed-command
// gate, statement outcome records, participant reservation, CDC owed ledger
// and acknowledgement apply, and the SQLite ledger built from
// REPLICA_OPERATIONS_SCHEMA. DOUBLE: the consensus port (the test commits the
// leader's proposals itself, so it can commit one entry twice or reorder a
// reservation before it).
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';
import {PARTITION_COMMITTED_COMMAND_ERROR_CODE} from
  '../../src/partition/partition-service-constants.js';
import {PLACEMENT_ADMISSION_ERROR, PLACEMENT_RESULT_FIELD} from
  '../../src/partition/partition-placement-admission-constants.js';
import {requestPlacementAdmission} from
  '../../src/partition/partition-placement-admission.js';
import {buildPlacementCommand} from
  '../../src/partition/partition-placement-admission-command.js';
import {PARTITION_CDC_OBLIGATION_BOUND} from
  '../../src/partition/partition-cdc-obligation-constants.js';
import {buildCdcAcknowledgementCommand, cdcObligationEventKeyDigest,
  countCdcObligations} from '../../src/partition/partition-cdc-obligation-ledger.js';
import {PARTITION_WRITE_LEADERSHIP_REFUSAL} from
  '../../src/partition/partition-write-kernel.js';
import {isPartitionReserved} from
  '../../src/partition/partition-participant-transaction-store.js';
import {readCommittedStatementOutcome} from
  '../../src/partition/partition-committed-statement-outcome.js';
import {PLACEMENT_OUTCOME, PLACEMENT_REFUSAL} from
  '../../src/rebalancer/replica-placement-owner-constants.js';
import {OperationType} from '../../src/rebalancer/replica-operation-progress.js';
import {
  applyCommitted, awaitProposal, beginMessage, clearFixtureSingletons,
  decisionCommandOf, durableAppliedIndex, identityOf, isPrepareCommand,
  prepareMessage, queryMessage, resetFixtureSingletons, send, settleTicks, track,
} from '../test-helpers/participant-transaction-fixture.js';
import {
  LEDGER_PARTITION_ID, NODE, admitOnLeader, commitLedgerStatement, foundingStatement,
  ledgerRows, onLedgerLeader, placementStatement, stepLedgerRow, watchEntryCommitted,
} from './placement-admission-fixture.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

const resultOf = (answer) => answer[PLACEMENT_RESULT_FIELD];
const outcomeRecordOf = (leader, command) => readCommittedStatementOutcome(leader,
  leader.getCommittedEntryKey(command));

test('F6: admissions and refusals are committed outcomes and each emits ENTRY_COMMITTED',
  () => onLedgerLeader(async (leader, proposed) => {
    const committed = watchEntryCommitted(leader);
    const first = await admitOnLeader(leader, proposed, 'f6-1',
      placementStatement({partitionId: 'tables-p1', target: NODE.B}));
    const second = await admitOnLeader(leader, proposed, 'f6-2',
      placementStatement({partitionId: 'indices-p1', target: NODE.B}));
    const full = await admitOnLeader(leader, proposed, 'f6-3',
      placementStatement({partitionId: 'config-p1', target: NODE.B}));
    const busy = await admitOnLeader(leader, proposed, 'f6-4', placementStatement({
      partitionId: 'tables-p1', type: OperationType.REPLACE, target: NODE.C,
      sourceReplicaId: 'tables-p1-r1'}));
    assert.deepEqual([first, second, full, busy].map(({apply}) => apply),
      [null, null, null, null]);
    assert.deepEqual(resultOf(first.answer), {outcome: PLACEMENT_OUTCOME.ADMITTED,
      operationIds: [`pl-tables-p1-${first.answer.logIndex}-0`]});
    assert.equal(resultOf(second.answer).outcome, PLACEMENT_OUTCOME.ADMITTED);
    assert.equal(resultOf(full.answer).reason, PLACEMENT_REFUSAL.TARGET_AT_CAPACITY);
    assert.deepEqual(resultOf(full.answer).occupancy, {copySourceNodeId: NODE.A,
      sourceOccupancy: 2, sourceLimit: 3, targetNodeId: NODE.B, targetOccupancy: 2,
      targetLimit: 2});
    assert.equal(resultOf(busy.answer).reason, PLACEMENT_REFUSAL.PARTITION_BUSY);
    assert.equal(full.answer.committed, true);
    // A refusal leaves no row and is settled under its entryId.
    assert.equal(ledgerRows(leader).length, 2);
    assert.equal(outcomeRecordOf(leader, full.command).state, 'settled');
    assert.deepEqual(committed.commands.map((command) => command.entryId),
      ['f6-1', 'f6-2', 'f6-3', 'f6-4']);
    committed.stop();
  }));

test('F6: source capacity counts every copy-phase row of the source, and a row ' +
  'without copy_source_node_id counts against every source', () =>
  onLedgerLeader(async (leader, proposed) => {
    for (const [index, partitionId] of ['tables-p1', 'indices-p1', 'config-p1'].entries()) {
      const admitted = await admitOnLeader(leader, proposed, `src-${index}`,
        placementStatement({partitionId, target: [NODE.B, NODE.C, NODE.D][index]}));
      assert.equal(resultOf(admitted.answer).outcome, PLACEMENT_OUTCOME.ADMITTED);
    }
    const fourth = await admitOnLeader(leader, proposed, 'src-3',
      placementStatement({partitionId: 'services-p1', target: NODE.D}));
    assert.equal(resultOf(fourth.answer).reason, PLACEMENT_REFUSAL.SOURCE_AT_CAPACITY);
    // Level-triggered repair reservation: with a repair waiting on node-a a
    // non-repair class-3-5 move gets K_src - 1; a repair still gets K_src.
    const [firstRow] = ledgerRows(leader);
    assert.equal(stepLedgerRow(leader, firstRow.operation_id, WORKFLOW_STEP.ACTIVE), null);
    const reserved = await admitOnLeader(leader, proposed, 'src-4', placementStatement({
      partitionId: 'services-p1', target: NODE.D, repairWaitingOn: [NODE.A]}));
    assert.equal(resultOf(reserved.answer).reason, PLACEMENT_REFUSAL.SOURCE_AT_CAPACITY);
    assert.equal(resultOf(reserved.answer).occupancy.sourceLimit, 2);
    const repair = await admitOnLeader(leader, proposed, 'src-5', placementStatement({
      partitionId: 'services-p1', target: NODE.D, repair: true, repairWaitingOn: [NODE.A]}));
    assert.equal(resultOf(repair.answer).outcome, PLACEMENT_OUTCOME.ADMITTED);
    // Rows without a copy source (written before the cutover) occupy every
    // source: node-d, named by none of them, is full.
    assert.equal(commitLedgerStatement(leader, 'null-source',
      'UPDATE replica_operations SET copy_source_node_id = NULL ' +
      'WHERE workflow_step = ?', [WORKFLOW_STEP.PENDING]), null);
    const otherSource = await admitOnLeader(leader, proposed, 'src-6', placementStatement({
      partitionId: 'partitions-p1', target: NODE.B, source: NODE.D}));
    assert.equal(resultOf(otherSource.answer).reason, PLACEMENT_REFUSAL.SOURCE_AT_CAPACITY);
    assert.equal(resultOf(otherSource.answer).occupancy.sourceOccupancy, 3);
  }));

test('F6: an unresolved ledger transition refuses every other admission until terminal',
  () => onLedgerLeader(async (leader, proposed) => {
    const ledger = await admitOnLeader(leader, proposed, 'ledger-1', placementStatement({
      partitionId: LEDGER_PARTITION_ID, placementClass: 'LEDGER',
      type: OperationType.REPLACE, target: NODE.B,
      sourceReplicaId: `${LEDGER_PARTITION_ID}-r2`}));
    assert.equal(resultOf(ledger.answer).outcome, PLACEMENT_OUTCOME.ADMITTED);
    const [ledgerRow] = ledgerRows(leader);
    assert.match(ledgerRow.steps_history, /"dispatchHold":"LEDGER_AWAITING_COPY_IDLE"/);
    const deferred = await admitOnLeader(leader, proposed, 'other-1',
      placementStatement({partitionId: 'tables-p1', target: NODE.C}));
    assert.deepEqual(resultOf(deferred.answer), {outcome: PLACEMENT_OUTCOME.REFUSED,
      reason: PLACEMENT_REFUSAL.LEDGER_TRANSITION_UNRESOLVED,
      operationIds: [ledgerRow.operation_id]});
    // A removal-phase ledger row still holds exclusivity (ACTIVE REPLACE).
    assert.equal(stepLedgerRow(leader, ledgerRow.operation_id, WORKFLOW_STEP.ACTIVE), null);
    const stillDeferred = await admitOnLeader(leader, proposed, 'other-2',
      placementStatement({partitionId: 'tables-p1', target: NODE.C}));
    assert.equal(resultOf(stillDeferred.answer).reason,
      PLACEMENT_REFUSAL.LEDGER_TRANSITION_UNRESOLVED);
    assert.equal(stepLedgerRow(leader, ledgerRow.operation_id, WORKFLOW_STEP.REMOVED), null);
    const admitted = await admitOnLeader(leader, proposed, 'other-3',
      placementStatement({partitionId: 'tables-p1', target: NODE.C}));
    assert.equal(resultOf(admitted.answer).outcome, PLACEMENT_OUTCOME.ADMITTED);
  }));

test('F5: the same entryId committed twice replays the first answer, never a second ' +
  'admission', () => onLedgerLeader(async (leader, proposed) => {
  const first = await admitOnLeader(leader, proposed, 'f5-move',
    placementStatement({partitionId: 'tables-p1', target: NODE.B}));
  const founding = await admitOnLeader(leader, proposed, 'f5-found',
    foundingStatement('tbl-orders-p1', [NODE.A, NODE.B, NODE.C]));
  const before = ledgerRows(leader);
  const committed = watchEntryCommitted(leader);
  // The re-proposal of the same attempt commits again: the same bytes, and
  // a new leader's rebuilt command under the same entryId.
  assert.equal(applyCommitted(leader, first.command), null);
  assert.equal(applyCommitted(leader, founding.command), null);
  assert.equal(applyCommitted(leader, buildPlacementCommand(leader, {
    type: 'PLACEMENT_ADMIT', entryId: 'f5-found', body: founding.command.body})), null);
  assert.deepEqual(ledgerRows(leader), before);
  assert.equal(before.length, 4);
  assert.deepEqual(committed.commands, []);
  // The proposer asking again under the same entryId is answered from the
  // record: no proposal, the first answer.
  const proposals = proposed.length;
  const again = await requestPlacementAdmission(leader, {entryId: 'f5-move',
    body: first.command.body});
  assert.equal(proposed.length, proposals);
  assert.deepEqual(resultOf(again), resultOf(first.answer));
  assert.equal(Object.isFrozen(resultOf(again).operationIds), true);
  assert.equal(again.logIndex, first.answer.logIndex);
  // P4: same-ID / different-command replay is rejected at both request and apply:
  const collidedBody = placementStatement({partitionId: 'indices-p1', target: NODE.C});
  const collidedAtRequest = await requestPlacementAdmission(leader, {
    entryId: 'f5-move',
    body: collidedBody,
  });
  assert.equal(collidedAtRequest.success, false);
  assert.equal(collidedAtRequest.admitted, false);
  assert.equal(collidedAtRequest.failureCode, PLACEMENT_ADMISSION_ERROR.BYTES);
  assert.equal(proposed.length, proposals);
  const collidedCommand = buildPlacementCommand(leader, {
    type: 'PLACEMENT_ADMIT',
    entryId: 'f5-move',
    body: collidedBody,
  });
  assert.equal(
    applyCommitted(leader, collidedCommand),
    PLACEMENT_ADMISSION_ERROR.BYTES,
  );
  assert.deepEqual(ledgerRows(leader), before);
  committed.stop();
}));

test('F4: a FAILED move re-planned with membership unchanged is admitted under a new id',
  () => onLedgerLeader(async (leader, proposed) => {
    const body = placementStatement({partitionId: LEDGER_PARTITION_ID,
      placementClass: 'LEDGER', type: OperationType.REPLACE, target: NODE.B,
      sourceReplicaId: `${LEDGER_PARTITION_ID}-r2`});
    const first = await admitOnLeader(leader, proposed, 'f4-attempt-1', body);
    const [failedId] = resultOf(first.answer).operationIds;
    assert.equal(stepLedgerRow(leader, failedId, WORKFLOW_STEP.FAILED), null);
    // A definite outcome: the next attempt is a fresh entryId, same move.
    const second = await admitOnLeader(leader, proposed, 'f4-attempt-2', body);
    assert.equal(second.apply, null);
    const [secondId] = resultOf(second.answer).operationIds;
    assert.notEqual(secondId, failedId);
    const rows = ledgerRows(leader);
    assert.deepEqual(rows.map((row) => row.workflow_step).sort(),
      [WORKFLOW_STEP.FAILED, WORKFLOW_STEP.PENDING]);
    assert.notEqual(rows[0].replica_id, rows[1].replica_id);
  }));

test('F7: a reserved partition re-parks the committed admission and applies it after ' +
  'the decision', () => onLedgerLeader(async (leader, proposed) => {
  const tx = identityOf('7'.repeat(32), {partitionId: LEDGER_PARTITION_ID});
  assert.equal((await send(leader, beginMessage(tx))).success, true);
  assert.equal((await send(leader, queryMessage(tx,
    'UPDATE replica_operations SET error_message = ? WHERE operation_id = ?',
    ['held', 'none']))).success, true);
  const prepare = track(send(leader, prepareMessage(tx)));
  const prepareCommand = await awaitProposal(proposed, isPrepareCommand);
  // The admission is proposed before the PREPARE applies ...
  const pending = track(requestPlacementAdmission(leader, {entryId: 'f7-move',
    body: placementStatement({partitionId: 'tables-p1', target: NODE.B})}));
  const command = await awaitProposal(proposed, (entry) => entry.entryId === 'f7-move');
  assert.equal(applyCommitted(leader, prepareCommand), null);
  await settleTicks();
  assert.equal(isPartitionReserved(leader.db), true);
  const committed = watchEntryCommitted(leader);
  // ... and committed while the reservation holds: consumed, no effect.
  assert.equal(applyCommitted(leader, command), null);
  await settleTicks();
  assert.equal(ledgerRows(leader).length, 0);
  assert.equal(outcomeRecordOf(leader, command).state, 'unsettled');
  assert.equal(pending.settled, false);
  assert.deepEqual(committed.commands, []);
  const preparedDigest = (await prepare.promise).preparedDigest;
  const decision = decisionCommandOf(tx, 'ROLLBACK', preparedDigest);
  assert.equal(applyCommitted(leader, decision), null);
  await settleTicks();
  // The decision re-admitted the parked attempt under the same entryId.
  const reproposals = proposed.filter((entry) => entry.entryId === 'f7-move');
  assert.equal(reproposals.length, 2);
  assert.equal(applyCommitted(leader, reproposals[1]), null);
  const answer = await pending.promise;
  assert.equal(resultOf(answer).outcome, PLACEMENT_OUTCOME.ADMITTED);
  assert.equal(ledgerRows(leader).length, 1);
  committed.stop();
}));

// Fill the ledger partition's CDC owed ledger to its bound with committed
// workflow writes of one admitted row.
async function owedToBound(leader, proposed) {
  const seed = await admitOnLeader(leader, proposed, 'f8-seed',
    placementStatement({partitionId: 'tables-p1', target: NODE.B}));
  const [operationId] = resultOf(seed.answer).operationIds;
  const bound = PARTITION_CDC_OBLIGATION_BOUND.OWED_MAX_EVENTS;
  const steps = [];
  for (let index = countCdcObligations(leader.db).owed; index < bound; index += 1) {
    const entryId = `f8-owed-${index}`;
    const logIndex = durableAppliedIndex(leader) + 1;
    assert.equal(commitLedgerStatement(leader, entryId,
      'UPDATE replica_operations SET updated_at = ? WHERE operation_id = ?',
      [index + 1, operationId]), null);
    steps.push({entryId, logIndex});
  }
  assert.equal(countCdcObligations(leader.db).owed, bound);
  return steps;
}

test('F8: at the CDC owed bound the admission is refused CDC_CAPACITY at request and ' +
  'at apply, and admitted after the acknowledgement commit', () =>
  onLedgerLeader(async (leader, proposed) => {
    const owed = await owedToBound(leader, proposed);
    const body = placementStatement({partitionId: 'indices-p1', target: NODE.C});
    const proposals = proposed.length;
    const atRequest = await requestPlacementAdmission(leader, {entryId: 'f8-1', body});
    assert.equal(atRequest.failureCode, PARTITION_WRITE_LEADERSHIP_REFUSAL.CDC_CAPACITY);
    assert.equal(proposed.length, proposals);
    // A command committed past the request check meets the same bound.
    const committed = watchEntryCommitted(leader);
    const command = buildPlacementCommand(leader, {type: 'PLACEMENT_ADMIT',
      entryId: 'f8-2', body});
    assert.equal(applyCommitted(leader, command), null);
    assert.deepEqual(JSON.parse(outcomeRecordOf(leader, command).ownerResultText),
      {outcome: PLACEMENT_OUTCOME.REFUSED, reason: PLACEMENT_REFUSAL.CDC_CAPACITY});
    assert.equal(ledgerRows(leader).length, 1);
    // The acknowledgement commit (LEDGER_COMMIT) frees one slot.
    const [delivered] = owed;
    const ack = buildCdcAcknowledgementCommand(LEDGER_PARTITION_ID, [{
      logIndex: delivered.logIndex, events: [{ordinal: 0,
        eventKeyDigest: cdcObligationEventKeyDigest(`entry:${delivered.entryId}`)}]}],
    {timestamp: '', proposedBy: leader.replicaId, proposedAt: 0});
    assert.equal(applyCommitted(leader, ack), null);
    assert.deepEqual(committed.commands.map((entry) => entry.entryId),
      ['f8-2', ack.entryId]);
    const admitted = await admitOnLeader(leader, proposed, 'f8-3', body);
    assert.equal(resultOf(admitted.answer).outcome, PLACEMENT_OUTCOME.ADMITTED);
    committed.stop();
  }));

test('F3: a replica whose applier lacks the command type refuses it and wedges ' +
  '(the version fence the support envelope owns)', () =>
  onLedgerLeader(async (leader) => {
    const command = buildPlacementCommand(leader, {type: 'PLACEMENT_ADMIT',
      entryId: 'f3', body: placementStatement({partitionId: 'tables-p1', target: NODE.B})});
    const before = durableAppliedIndex(leader);
    // An older build knows no PLACEMENT_ADMIT: modelled by a type this build
    // does not recognise.
    assert.equal(applyCommitted(leader, {...command, type: 'PLACEMENT_ADMIT_NEXT'}),
      PARTITION_COMMITTED_COMMAND_ERROR_CODE.UNRECOGNISED);
    assert.equal(durableAppliedIndex(leader), before);
    assert.equal(ledgerRows(leader).length, 0);
  }));
