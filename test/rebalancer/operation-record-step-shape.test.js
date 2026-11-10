/**
 * Witness for Quest state-read-named-defaults (round 3): the workflow step of
 * an operation record is read by the one shape reader,
 * readOperationRecordWorkflowStep, which decides the shape by the key the
 * record holds (a raw replica_operations row names it workflow_step, an
 * operation decoded by rowToOperation names it workflowStep). Raw rows reach
 * the owner resolution on the dispatch replay and execution paths, so a raw
 * row and its decoded operation must resolve the same owner, as at HEAD.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {classifySystemPartition} from '../../src/bootstrap/system-partition-classification.js';
import * as progress from '../../src/rebalancer/replica-operation-progress.js';
import {assignReplicaOperationRepositoryRowMethods} from
  '../../src/rebalancer/replica-operation-repository-row-methods.js';
import {isOperationLedgerSelfMoveDispatchClaimed} from
  '../../src/rebalancer/operation-ledger-hold-policy.js';
import {OPERATION_WORKFLOW_OWNER_SEGMENT_7_STAGE_SHARED as SHARED} from
  '../../src/rebalancer/operation-workflow-recovery-reconcile-shared.js';
import {STATE_ABSENT} from '../../src/utils/state-field-read.js';

const {OperationType, readOperationRecordWorkflowStep} = progress;
const {
  PRIORITY_RECOVERY_PRE_SYNC_REPLACE_TARGET_STATE,
  resolvePriorityRecoveryPreSyncReplaceTargetStateFromEvidence,
} = SHARED;
const SYSTEM_PARTITION_ID = 'sql_write_operations-p1';
const SOURCE_NODE_ID = 'node-source';
const TARGET_NODE_ID = 'node-target';

function createOwnerResolver() {
  class OwnerResolver {}
  assignReplicaOperationRepositoryRowMethods(OwnerResolver, {
    ...progress,
    classifySystemPartition,
  });
  return new OwnerResolver();
}

function rawReplaceRow(workflowStep, status) {
  return {
    operation_id: 'op-raw-replace',
    type: OperationType.REPLACE,
    partition_id: SYSTEM_PARTITION_ID,
    source_node_id: SOURCE_NODE_ID,
    target_node_id: TARGET_NODE_ID,
    workflow_step: workflowStep,
    status,
  };
}

function decodedReplaceOperation(workflowStep, status) {
  return {
    operationId: 'op-decoded-replace',
    type: OperationType.REPLACE,
    partitionId: SYSTEM_PARTITION_ID,
    sourceNodeId: SOURCE_NODE_ID,
    targetNodeId: TARGET_NODE_ID,
    workflowStep,
    status,
  };
}

test('the shape reader dispatches on the key the record holds', () => {
  assert.equal(readOperationRecordWorkflowStep({workflowStep: 'SYNCING'}), 'SYNCING',
    'a decoded operation names its step workflowStep');
  assert.equal(readOperationRecordWorkflowStep({workflow_step: 'SYNCING'}), 'SYNCING',
    'a raw row names its step workflow_step');
  assert.equal(
    readOperationRecordWorkflowStep({workflow_step: 'REMOVED', workflowStep: 'SYNCING'}),
    'REMOVED', 'a record holding workflow_step is a raw row, whatever else it holds');
  assert.equal(
    readOperationRecordWorkflowStep({workflow_step: '', workflowStep: 'SYNCING'}),
    STATE_ABSENT,
    'a raw row with an empty step states none: the decoded spelling is not tried');
  assert.equal(
    readOperationRecordWorkflowStep({workflow_step: undefined, workflowStep: 'SYNCING'}),
    STATE_ABSENT, 'key presence, not value presence, decides the shape');
  assert.equal(readOperationRecordWorkflowStep({}), STATE_ABSENT);
  assert.equal(readOperationRecordWorkflowStep(null), STATE_ABSENT);
  assert.equal(readOperationRecordWorkflowStep(undefined), STATE_ABSENT);
});

test('a raw REPLACE row at REMOVED resolves the source owner whatever its status', () => {
  const resolver = createOwnerResolver();
  const statuses = [...new Set([...Object.values(progress.ReplicaStatus), ''])];
  for (const status of statuses) {
    assert.equal(
      resolver.resolveOperationOwnerNodeId(rawReplaceRow(WORKFLOW_STEP.REMOVED, status)),
      SOURCE_NODE_ID,
      `raw row, workflow_step REMOVED, status '${status}': the step settles the phase`);
    assert.equal(
      resolver.resolveOperationOwnerNodeId(
        decodedReplaceOperation(WORKFLOW_STEP.REMOVED, status)),
      SOURCE_NODE_ID,
      `decoded operation, workflowStep REMOVED, status '${status}'`);
  }
});

test('a raw REPLACE row resolves the owner its decoded operation resolves, every step', () => {
  const resolver = createOwnerResolver();
  for (const workflowStep of progress.getWorkflowSteps(OperationType.REPLACE)) {
    const status = progress.WORKFLOW_STEP_TO_STATUS[workflowStep] ??
      progress.ReplicaStatus[workflowStep];
    const expected = workflowStep === WORKFLOW_STEP.REMOVED ?
      SOURCE_NODE_ID :
      TARGET_NODE_ID;
    assert.equal(resolver.resolveOperationOwnerNodeId(rawReplaceRow(workflowStep, status)),
      expected, `raw row at ${workflowStep}`);
    assert.equal(
      resolver.resolveOperationOwnerNodeId(decodedReplaceOperation(workflowStep, status)),
      expected, `decoded operation at ${workflowStep}`);
  }
});

test('the ledger self-move dispatch claim reads the step of either shape', () => {
  assert.equal(isOperationLedgerSelfMoveDispatchClaimed({workflow_step: WORKFLOW_STEP.SENDING}),
    true);
  assert.equal(isOperationLedgerSelfMoveDispatchClaimed({workflow_step: WORKFLOW_STEP.PENDING}),
    false);
  assert.equal(isOperationLedgerSelfMoveDispatchClaimed({workflowStep: WORKFLOW_STEP.SENDING}),
    true);
  assert.equal(isOperationLedgerSelfMoveDispatchClaimed({}), false,
    'a record stating no step has not claimed dispatch');
});

test('the pre-sync REPLACE target state reads the step of either shape', () => {
  for (const operation of [
    {type: OperationType.REPLACE, workflow_step: WORKFLOW_STEP.CREATING},
    {type: OperationType.REPLACE, workflowStep: WORKFLOW_STEP.CREATING},
  ]) {
    assert.equal(
      resolvePriorityRecoveryPreSyncReplaceTargetStateFromEvidence({
        operation,
        targetLifecycleStatus: null,
      }),
      PRIORITY_RECOVERY_PRE_SYNC_REPLACE_TARGET_STATE.UNMATERIALIZED);
  }
  assert.equal(
    resolvePriorityRecoveryPreSyncReplaceTargetStateFromEvidence({
      operation: {type: OperationType.REPLACE, workflow_step: WORKFLOW_STEP.SYNCING},
      targetLifecycleStatus: null,
    }),
    PRIORITY_RECOVERY_PRE_SYNC_REPLACE_TARGET_STATE.NOT_APPLICABLE);
});
