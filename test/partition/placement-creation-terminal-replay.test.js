import assert from 'node:assert/strict';
import {test} from 'node:test';
import {UNIFIED_SERVICE_TYPE, WORKFLOW_STEP} from '../../src/constants/index.js';
import {OperationType, ReplicaStatus, WORKFLOW_STEP_TO_STATUS} from
  '../../src/rebalancer/replica-operation-progress.js';
import {REBALANCE_COORDINATOR_EVENT} from '../../src/rebalancer/rebalancer-constants.js';
import {PARTITION_WRITE_LEADERSHIP_REFUSAL} from
  '../../src/partition/partition-write-kernel.js';
import {NODE, commitLedgerStatement, ledgerRows, onLedgerLeader} from
  './placement-admission-fixture.js';
import {attachAutoCommitLoop, createCoordinatorWithLedger} from
  './placement-create-with-ledger-fixture.js';

const TEST_PARTITION_ID = 'terminal-replay-orders-p1';
const TEST_NATIVE_ENTRY_ID = 'terminal-replay-original-entry';
const TEST_NEXT_ENTRY_ID = 'terminal-replay-next-entry';

for (const terminalStep of [WORKFLOW_STEP.FAILED, WORKFLOW_STEP.ACTIVE]) {
  test(`native create replay reads committed ${terminalStep} after the original reply is lost`,
    async () => onLedgerLeader(async (leader, proposed) => {
      const stopAutoCommit = attachAutoCommitLoop(leader, proposed);
      try {
        const coordinator = createCoordinatorWithLedger(leader);
        const submit = coordinator.submitPlacementPayload.bind(coordinator);
        const entries = [];
        const wakes = [];
        const announcements = [];
        coordinator.submitPlacementPayload = async (request, timeoutMs) => {
          entries.push(request.entryId);
          const answer = await submit(request, timeoutMs);
          return entries.length === 1 ? {
            success: false,
            failureCode: PARTITION_WRITE_LEADERSHIP_REFUSAL.OUTCOME_UNKNOWN,
          } : answer;
        };
        coordinator.armCoordinatorCreatedOperationProgress = async (operation) => {
          wakes.push(operation.operationId);
        };
        coordinator.emit = (event, {operation}) => {
          if (event === REBALANCE_COORDINATOR_EVENT.OPERATION_CREATED) {
            announcements.push(operation.operationId);
          }
        };
        const move = {
          type: OperationType.ADD,
          entityType: UNIFIED_SERVICE_TYPE.PARTITION,
          entityId: TEST_PARTITION_ID,
          partitionId: TEST_PARTITION_ID,
          nodeId: NODE.B,
          entryId: TEST_NATIVE_ENTRY_ID,
        };
        await assert.rejects(() => coordinator.createOperation(move), (error) =>
          error.admissionAnswer?.failureCode ===
            PARTITION_WRITE_LEADERSHIP_REFUSAL.OUTCOME_UNKNOWN);
        const [held] = ledgerRows(leader);
        assert.equal(held.workflow_step, WORKFLOW_STEP.PENDING);

        const settledAt = Date.now();
        assert.equal(commitLedgerStatement(leader, 'terminal-settlement',
          `UPDATE replica_operations SET workflow_step = ?, status = ?, completed_at = ?,
           updated_at = ?, steps_history = json_insert(steps_history, '$[#]', json(?))
           WHERE operation_id = ?`,
          [terminalStep, terminalStep === WORKFLOW_STEP.FAILED ?
            ReplicaStatus.FAILED : WORKFLOW_STEP_TO_STATUS[terminalStep], settledAt, settledAt,
          JSON.stringify({step: terminalStep, timestamp: settledAt}), held.operation_id]), null);
        const [terminal] = ledgerRows(leader);
        if (terminalStep === WORKFLOW_STEP.FAILED) {
          await assert.rejects(() => coordinator.createOperation(move), {
            code: 'REPLICA_CREATION_FAILED',
            operationId: held.operation_id,
          });
        } else {
          const replay = await coordinator.createOperation(move);
          assert.equal(replay.operationId, held.operation_id);
          assert.equal(replay.workflowStep, WORKFLOW_STEP.ACTIVE);
        }
        assert.deepEqual(ledgerRows(leader), [terminal]);
        assert.deepEqual(entries, [TEST_NATIVE_ENTRY_ID, TEST_NATIVE_ENTRY_ID]);
        assert.equal(proposed.length, 1, 'one native admission proposal');
        assert.equal(coordinator.stats.operationsCreated, 0);
        assert.deepEqual(announcements, []);
        assert.deepEqual(wakes, []);

        if (terminalStep === WORKFLOW_STEP.FAILED) {
          const next = await coordinator.createOperation({...move, entryId: TEST_NEXT_ENTRY_ID});
          assert.notEqual(next.operationId, held.operation_id,
            'the settled failed attempt cannot strand a distinct request in the same lane');
          assert.equal(next.workflowStep, WORKFLOW_STEP.PENDING);
          assert.equal(proposed.length, 2, 'only the distinct new entry proposes another admission');
          const nextRows = ledgerRows(leader);
          assert.equal(nextRows.length, 2);
          const durableFailure = nextRows.find((row) => row.operation_id === held.operation_id);
          assert.deepEqual(durableFailure, terminal);
          assert.ok(nextRows.some((row) => row.operation_id === next.operationId));
          assert.deepEqual(announcements, [next.operationId]);
          await assert.rejects(() => coordinator.createOperation(move), {
            code: 'REPLICA_CREATION_FAILED',
            operationId: held.operation_id,
          });
          assert.deepEqual(ledgerRows(leader), nextRows);
          assert.deepEqual(entries, [
            TEST_NATIVE_ENTRY_ID, TEST_NATIVE_ENTRY_ID, TEST_NEXT_ENTRY_ID, TEST_NATIVE_ENTRY_ID,
          ]);
          assert.equal(proposed.length, 2, 'original replay never proposes a replacement');
          assert.deepEqual(announcements, [next.operationId]);
        }
      } finally {
        await stopAutoCommit();
      }
    }),
  );
}
