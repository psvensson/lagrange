// Both consumers read committed SQLite rows written through PLACEMENT_ADMIT.
// The controlled consensus fixture commits each proposal in the chosen order.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';
import {PLACEMENT_RESULT_FIELD} from
  '../../src/partition/partition-placement-admission-constants.js';
import {genesisStamp} from '../../src/raft/raft-committed-membership-stamp.js';
import {OPERATION_METADATA_KEY, OperationType, WORKFLOW_STEP_TO_STATUS} from
  '../../src/rebalancer/replica-operation-progress.js';
import {PLACEMENT_OUTCOME, PLACEMENT_REFUSAL} from
  '../../src/rebalancer/replica-placement-owner-constants.js';
import {clearFixtureSingletons, resetFixtureSingletons} from
  '../test-helpers/participant-transaction-fixture.js';
import {
  NODE, admitOnLeader, commitLedgerStatement, foundingStatement,
  ledgerRows, onLedgerLeader, placementStatement,
} from './placement-admission-fixture.js';
import {createCoordinatorWithLedger} from './placement-create-with-ledger-fixture.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

const USER_PARTITION = 'founder-origin-orders-p1';
const ORIGINAL_COPY = 'tables-p1';
const SECOND_COPY = 'services-p1';
const OTHER_COPY = 'indices-p1';
const PROBE_COPY = 'config-p1';

async function admit(leader, proposed, entryId, statement) {
  const {command, apply, answer} = await admitOnLeader(leader, proposed, entryId, statement);
  assert.ok(command);
  assert.equal(apply, null);
  assert.equal(answer.committed, true);
  return answer[PLACEMENT_RESULT_FIELD];
}

async function commitCopy(leader, proposed, partitionId) {
  const result = await admit(leader, proposed, `copy:${partitionId}`,
    placementStatement({partitionId, target: NODE.B}));
  assert.equal(result.outcome, PLACEMENT_OUTCOME.ADMITTED);
  const [operationId] = result.operationIds;
  return ledgerRows(leader).find((row) => row.operation_id === operationId);
}

function commitLaterGenesis(leader, row, step) {
  const history = JSON.parse(row.steps_history);
  assert.equal(history[0][OPERATION_METADATA_KEY.BOOTSTRAP_MEMBERSHIP], undefined);
  const timestamp = row.updated_at + 1;
  history.push({step, timestamp, [OPERATION_METADATA_KEY.BOOTSTRAP_MEMBERSHIP]:
    genesisStamp([row.replica_id], {[row.replica_id]: row.target_node_id})});
  assert.equal(commitLedgerStatement(leader, `later-genesis:${row.operation_id}`,
    'UPDATE replica_operations SET workflow_step = ?, status = ?, steps_history = ?, ' +
    'updated_at = ?, completed_at = ? WHERE operation_id = ?',
    [step, WORKFLOW_STEP_TO_STATUS[step], JSON.stringify(history), timestamp,
      step === WORKFLOW_STEP.ACTIVE ? timestamp : null, row.operation_id]), null);
}

function checkCopySlot(coordinator) {
  return coordinator.ensureSystemPartitionTargetNodeSlotAllowed(OperationType.ADD,
    {partitionId: PROBE_COPY, targetNodeId: NODE.B});
}

test('later genesis does not waive the coordinator target-copy count', () =>
  onLedgerLeader(async (leader, proposed) => {
    await commitCopy(leader, proposed, ORIGINAL_COPY);
    await commitCopy(leader, proposed, SECOND_COPY);
    const row = await commitCopy(leader, proposed, OTHER_COPY);
    commitLaterGenesis(leader, row, WORKFLOW_STEP.CREATING);
    const coordinator = createCoordinatorWithLedger(leader, {registerLocalLeader: false});
    await assert.rejects(() => checkCopySlot(coordinator),
      {reasonCode: PLACEMENT_REFUSAL.TARGET_AT_CAPACITY});
    assert.equal(ledgerRows(leader).length, 3);
  }));

test('later genesis does not waive the committed placement target-copy count', () =>
  onLedgerLeader(async (leader, proposed) => {
    await commitCopy(leader, proposed, ORIGINAL_COPY);
    await commitCopy(leader, proposed, SECOND_COPY);
    const row = await commitCopy(leader, proposed, OTHER_COPY);
    commitLaterGenesis(leader, row, WORKFLOW_STEP.CREATING);
    const result = await admit(leader, proposed, 'late-stamp-copy-probe',
      placementStatement({partitionId: PROBE_COPY, target: NODE.B}));
    assert.equal(result.reason, PLACEMENT_REFUSAL.TARGET_AT_CAPACITY);
    assert.equal(result.occupancy.targetOccupancy, 3);
    assert.equal(ledgerRows(leader).length, 3);
  }));

test('later genesis on a completed ordinary ADD cannot suppress a native FOUND', () =>
  onLedgerLeader(async (leader, proposed) => {
    const row = await commitCopy(leader, proposed, USER_PARTITION);
    commitLaterGenesis(leader, row, WORKFLOW_STEP.ACTIVE);
    const result = await admit(leader, proposed, 'first-founded-cohort',
      foundingStatement(USER_PARTITION, [NODE.A, NODE.C]));
    assert.equal(result.outcome, PLACEMENT_OUTCOME.ADMITTED);
    assert.equal(result.operationIds.length, 2);
    assert.equal(ledgerRows(leader).length, 3);
  }));

test('the native original genesis remains exempt and excludes a second founding set', () =>
  onLedgerLeader(async (leader, proposed) => {
    const found = await admit(leader, proposed, 'original-founded-cohort',
      foundingStatement(USER_PARTITION, [NODE.A, NODE.B, NODE.C]));
    assert.equal(found.outcome, PLACEMENT_OUTCOME.ADMITTED);
    const row = await commitCopy(leader, proposed, ORIGINAL_COPY);
    const coordinator = createCoordinatorWithLedger(leader, {registerLocalLeader: false});
    assert.deepEqual((await checkCopySlot(coordinator)).occupyingOperationIds,
      [row.operation_id]);

    const copy = await admit(leader, proposed, 'original-stamp-copy-probe',
      placementStatement({partitionId: PROBE_COPY, target: NODE.B}));
    assert.equal(copy.outcome, PLACEMENT_OUTCOME.ADMITTED);
    const repeated = await admit(leader, proposed, 'second-founded-cohort',
      foundingStatement(USER_PARTITION, [NODE.A, NODE.C]));
    assert.equal(repeated.reason, PLACEMENT_REFUSAL.ALREADY_FOUNDED);
    assert.deepEqual(new Set(repeated.operationIds), new Set(found.operationIds));
    assert.equal(ledgerRows(leader).length, 5);
  }));
