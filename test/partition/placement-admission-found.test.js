// FOUND and the ledger hold release through the real committed apply path
// (quest replica-placement-admission-owner, design sections 2.5 and 2.13;
// WP-E falsifiers F9, F9b, F9c, F9d, and the PLACEMENT_RELEASE_HOLD of the
// engaged ledger move).
//
// REAL: the replica_operations-p1 PartitionService, its committed apply
// path and SQLite ledger. DOUBLE: the consensus port (the test commits).
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';
import {PLACEMENT_RESULT_FIELD} from
  '../../src/partition/partition-placement-admission-constants.js';
import {requestPlacementHoldRelease} from
  '../../src/partition/partition-placement-admission.js';
import {PLACEMENT_OUTCOME, PLACEMENT_REFUSAL, PLACEMENT_CLASS} from
  '../../src/rebalancer/replica-placement-owner-constants.js';
import {OperationType} from '../../src/rebalancer/replica-operation-progress.js';
import {COMMITTED_MEMBERSHIP_STAMP_KIND} from
  '../../src/raft/raft-committed-membership-constants.js';
import {applyCommitted, awaitProposal, clearFixtureSingletons, resetFixtureSingletons,
  track} from '../test-helpers/participant-transaction-fixture.js';
import {
  LEDGER_PARTITION_ID, NODE, admitOnLeader, foundingStatement, ledgerRows,
  onLedgerLeader, placementStatement, stepLedgerRow, watchEntryCommitted,
} from './placement-admission-fixture.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

const USER_PARTITION = 'tbl-orders-p1';
const FOUNDERS = Object.freeze([NODE.A, NODE.B, NODE.C]);
const resultOf = (answer) => answer[PLACEMENT_RESULT_FIELD];

test('FOUND admits the whole founding set in one entry, exempt from copy capacity',
  () => onLedgerLeader(async (leader, proposed) => {
    // node-b is already at K_tgt with two copies.
    for (const [index, partitionId] of ['tables-p1', 'indices-p1'].entries()) {
      await admitOnLeader(leader, proposed, `copy-${index}`,
        placementStatement({partitionId, target: NODE.B}));
    }
    const found = await admitOnLeader(leader, proposed, 'found-1',
      foundingStatement(USER_PARTITION, FOUNDERS));
    const {operationIds} = resultOf(found.answer);
    const index = found.answer.logIndex;
    assert.deepEqual(operationIds, [0, 1, 2].map((n) => `pl-${USER_PARTITION}-${index}-${n}`));
    const rows = ledgerRows(leader).filter((row) => row.entity_id === USER_PARTITION);
    assert.deepEqual(rows.map((row) => row.target_node_id), FOUNDERS);
    const histories = rows.map((row) => JSON.parse(row.steps_history)[0]);
    const replicaIds = rows.map((row) => row.replica_id);
    for (const history of histories) {
      assert.equal(history.bootstrapMembership.kind, COMMITTED_MEMBERSHIP_STAMP_KIND.GENESIS);
      assert.deepEqual(history.bootstrapMembership.founders, replicaIds);
      assert.deepEqual(history.replicaIds, replicaIds);
      assert.equal(history.placementAdmission.foundingIntentId,
        `schema-job-1:${USER_PARTITION}`);
    }
    assert.ok(rows.every((row) => row.copy_source_node_id === null));
  }));

test('F9: FOUND twice under fresh entryIds answers ALREADY_FOUNDED with the live set',
  () => onLedgerLeader(async (leader, proposed) => {
    const first = await admitOnLeader(leader, proposed, 'found-a',
      foundingStatement(USER_PARTITION, FOUNDERS));
    // The answer was lost; the provisioner asks again with a fresh attempt.
    const second = await admitOnLeader(leader, proposed, 'found-b',
      foundingStatement(USER_PARTITION, [NODE.B, NODE.C, NODE.D]));
    assert.deepEqual(resultOf(second.answer), {outcome: PLACEMENT_OUTCOME.REFUSED,
      reason: PLACEMENT_REFUSAL.ALREADY_FOUNDED,
      operationIds: resultOf(first.answer).operationIds,
      foundingIntentId: `schema-job-1:${USER_PARTITION}`,
      foundingEntryId: first.command.entryId});
    assert.equal(ledgerRows(leader).length, 3);
  }));

test('F9b: when every founder of the first set FAILED a new FOUND admits a new set',
  () => onLedgerLeader(async (leader, proposed) => {
    const first = await admitOnLeader(leader, proposed, 'found-a',
      foundingStatement(USER_PARTITION, FOUNDERS));
    for (const operationId of resultOf(first.answer).operationIds) {
      assert.equal(stepLedgerRow(leader, operationId, WORKFLOW_STEP.FAILED), null);
    }
    const again = await admitOnLeader(leader, proposed, 'found-b',
      foundingStatement(USER_PARTITION, FOUNDERS));
    const {outcome, operationIds} = resultOf(again.answer);
    assert.equal(outcome, PLACEMENT_OUTCOME.ADMITTED);
    assert.equal(operationIds.length, 3);
    assert.ok(operationIds.every((id) => !resultOf(first.answer).operationIds.includes(id)));
    assert.equal(ledgerRows(leader).length, 6);
  }));

test('F9c: a mixed set (one FAILED, the others live) is still founded', () =>
  onLedgerLeader(async (leader, proposed) => {
    const first = await admitOnLeader(leader, proposed, 'found-a',
      foundingStatement(USER_PARTITION, FOUNDERS));
    const [failed, active, pending] = resultOf(first.answer).operationIds;
    assert.equal(stepLedgerRow(leader, failed, WORKFLOW_STEP.FAILED), null);
    assert.equal(stepLedgerRow(leader, active, WORKFLOW_STEP.ACTIVE), null);
    const again = await admitOnLeader(leader, proposed, 'found-b',
      foundingStatement(USER_PARTITION, FOUNDERS));
    assert.equal(resultOf(again.answer).reason, PLACEMENT_REFUSAL.ALREADY_FOUNDED);
    assert.deepEqual(resultOf(again.answer).operationIds, [active, pending]);
    assert.equal(resultOf(again.answer).foundingIntentId, null);
    assert.equal(resultOf(again.answer).foundingEntryId, null);
    // ACTIVE alone (every other founder terminal) is founded too.
    assert.equal(stepLedgerRow(leader, pending, WORKFLOW_STEP.FAILED), null);
    const third = await admitOnLeader(leader, proposed, 'found-c',
      foundingStatement(USER_PARTITION, FOUNDERS));
    assert.deepEqual(resultOf(third.answer).operationIds, [active]);
    assert.equal(resultOf(third.answer).foundingIntentId, null);
    assert.equal(resultOf(third.answer).foundingEntryId, null);
  }));

test('F9d: a system-catalog partition answers SYSTEM_PARTITION_SEED_FOUNDED', () =>
  onLedgerLeader(async (leader, proposed) => {
    const refused = await admitOnLeader(leader, proposed, 'found-sys',
      foundingStatement('tables-p1', FOUNDERS, PLACEMENT_CLASS.SYSTEM));
    assert.deepEqual(resultOf(refused.answer), {outcome: PLACEMENT_OUTCOME.REFUSED,
      reason: PLACEMENT_REFUSAL.SYSTEM_PARTITION_SEED_FOUNDED});
    assert.equal(ledgerRows(leader).length, 0);
  }));

test('the engaged ledger hold is released only at copy-phase idle; removal-phase rows ' +
  'never delay it', () => onLedgerLeader(async (leader, proposed) => {
  const copy = await admitOnLeader(leader, proposed, 'copy-1',
    placementStatement({partitionId: 'tables-p1', target: NODE.B}));
  const remove = await admitOnLeader(leader, proposed, 'remove-1', placementStatement({
    partitionId: 'indices-p1', type: OperationType.REMOVE, target: NODE.A,
    replicaId: 'indices-p1-r3',
    voterRetirement: {nodeBootIncarnation: 1, replicaCreatedAt: 1}}));
  assert.deepEqual(JSON.parse(ledgerRows(leader).find((row) =>
    row.partition_id === 'indices-p1').steps_history)[0].placementAdmission.voterRetirement,
  {nodeBootIncarnation: 1, replicaCreatedAt: 1});
  assert.equal(resultOf(remove.answer).outcome, PLACEMENT_OUTCOME.ADMITTED);
  // Admitted while other rows are incomplete (it is first in order).
  const ledger = await admitOnLeader(leader, proposed, 'ledger-1', placementStatement({
    partitionId: LEDGER_PARTITION_ID, placementClass: PLACEMENT_CLASS.LEDGER,
    type: OperationType.REPLACE, target: NODE.C,
    sourceReplicaId: `${LEDGER_PARTITION_ID}-r2`}));
  const [ledgerOperationId] = resultOf(ledger.answer).operationIds;
  const release = async (entryId) => {
    const pending = track(requestPlacementHoldRelease(leader,
      {entryId, body: {operationId: ledgerOperationId}}));
    const command = await awaitProposal(proposed, (entry) => entry.entryId === entryId);
    assert.equal(applyCommitted(leader, command), null);
    return resultOf(await pending.promise);
  };
  const committed = watchEntryCommitted(leader);
  assert.deepEqual(await release('release-1'), {outcome: PLACEMENT_OUTCOME.REFUSED,
    reason: PLACEMENT_REFUSAL.COPY_PHASE_NOT_IDLE,
    operationIds: resultOf(copy.answer).operationIds});
  // The copy leaves the copy phase; the PENDING REMOVE does not hold it.
  assert.equal(stepLedgerRow(leader, resultOf(copy.answer).operationIds[0],
    WORKFLOW_STEP.ACTIVE), null);
  assert.deepEqual(await release('release-2'), {outcome: PLACEMENT_OUTCOME.RELEASED,
    operationIds: [ledgerOperationId]});
  const row = ledgerRows(leader).find((entry) => entry.operation_id === ledgerOperationId);
  assert.doesNotMatch(row.steps_history, /dispatchHold/);
  assert.deepEqual(await release('release-3'), {outcome: PLACEMENT_OUTCOME.REFUSED,
    reason: PLACEMENT_REFUSAL.HOLD_NOT_HELD});
  assert.deepEqual(committed.commands.map((entry) => entry.entryId).filter((entryId) =>
    entryId.startsWith('release-')), ['release-1', 'release-2', 'release-3']);
  committed.stop();
}));
