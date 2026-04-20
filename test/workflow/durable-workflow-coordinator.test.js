import {test} from '../../src/test-helpers/tap.js';
import {DurableWorkflowCoordinator} from
  '../../src/workflow/durable-workflow-coordinator.js';
test('DurableWorkflowCoordinator - single-flights execution by owner key',
  async (t) => {
    const coordinator = new DurableWorkflowCoordinator();
    let resolveExecution;
    const executionBarrier = new Promise((resolve) => {
      resolveExecution = resolve;
    });
    let executionCount = 0;
    const firstExecution = coordinator.runExclusive('owner-1', async () => {
      executionCount += 1;
      await executionBarrier;
      return {attempt: executionCount};
    });
    const secondExecution = coordinator.runExclusive('owner-1', async () => {
      executionCount += 1;
      return {attempt: executionCount};
    });

    t.equal(
      firstExecution,
      secondExecution,
      'duplicate workflow execution should reuse the in-flight promise',
    );

    resolveExecution();
    const result = await firstExecution;

    t.same(result, {attempt: 1});
    t.equal(executionCount, 1);
  });
test('DurableWorkflowCoordinator - persists participant stage transitions',
  async (t) => {
    const persistedWorkflows = [];
    const persistedParticipants = [];
    const coordinator = new DurableWorkflowCoordinator({
      persistWorkflow: async (workflow) => {
        persistedWorkflows.push({
          workflowId: workflow.workflowId,
          status: workflow.status,
        });
      },
      persistParticipant: async (participant) => {
        persistedParticipants.push({
          workflowId: participant.workflowId,
          participantId: participant.participantId,
          status: participant.status,
        });
      },
      now: () => 1000,
    });
    const workflow = await coordinator.registerWorkflow({
      workflowId: 'wf-1',
      ownerKey: 'owner-1',
      status: 'ACTIVE',
      metadata: {kind: 'test'},
    });
    workflow.participants.set('p1', {
      workflowId: 'wf-1',
      participantId: 'p1',
      participantKey: 'p1',
      status: 'ACTIVE',
      createdAt: 1000,
      updatedAt: 1000,
    });
    workflow.participants.set('p2', {
      workflowId: 'wf-1',
      participantId: 'p2',
      participantKey: 'p2',
      status: 'ACTIVE',
      createdAt: 1000,
      updatedAt: 1000,
    });
    await coordinator.persistParticipants('wf-1', ['p1', 'p2']);
    const failedParticipants = await coordinator.executeParticipantStage(
      'wf-1',
      'RUNNING',
      'SUCCEEDED',
      async (participantKey) => {
        if (participantKey === 'p2') {
          throw new Error('participant failed');
        }
      },
      {failureStatus: 'FAILED'},
    );

    t.same(failedParticipants, [{
      participantId: 'p2',
      participantKey: 'p2',
      error: 'participant failed',
    }]);
    t.ok(
      persistedWorkflows.some((entry) => entry.workflowId === 'wf-1'),
      'workflow registration should persist once',
    );
    t.ok(
      persistedParticipants.some((entry) =>
        entry.participantId === 'p1' && entry.status === 'SUCCEEDED'),
      'successful participant should be persisted with the success status',
    );
    t.ok(
      persistedParticipants.some((entry) =>
        entry.participantId === 'p2' && entry.status === 'FAILED'),
      'failed participant should be persisted with the failure status',
    );
  });
test('DurableWorkflowCoordinator - recovers workflows and participants from rows',
  async (t) => {
    const coordinator = new DurableWorkflowCoordinator();

    coordinator.recover({
      workflows: [{
        workflow_id: 'wf-2',
        owner_key: 'owner-2',
        status: 'PREPARED',
        created_at: 1,
        updated_at: 2,
      }],
      participants: [{
        workflow_id: 'wf-2',
        participant_id: 'participant-1',
        participant_key: 'p1',
        status: 'READY',
        created_at: 1,
        updated_at: 2,
      }],
      loadWorkflow: (row) => ({
        workflowId: row.workflow_id,
        ownerKey: row.owner_key,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }),
      loadParticipant: (row) => ({
        workflowId: row.workflow_id,
        participantId: row.participant_id,
        participantKey: row.participant_key,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }),
    });
    const workflow = coordinator.getWorkflowByOwnerKey('owner-2');
    t.ok(workflow, 'workflow should be recovered by owner key');
    t.equal(workflow.workflowId, 'wf-2');
    t.same(Array.from(workflow.participants.keys()), ['p1']);
    t.equal(workflow.participants.get('p1').participantId, 'participant-1');
  });

import {WORKFLOW_TRANSITION_FIELD} from
  '../../src/workflow/workflow-constants.js';
test('DurableWorkflowCoordinator - transitionStep persists canonical ' +
  'transition fields', async (t) => {
  const persistedWorkflows = [];
  const fixedNow = 5000;
  const coordinator = new DurableWorkflowCoordinator({
    persistWorkflow: async (workflow) => {
      persistedWorkflows.push(JSON.parse(JSON.stringify({
        workflowId: workflow.workflowId,
        step: workflow.step,
        transitionHistory: workflow.transitionHistory,
        updatedAt: workflow.updatedAt,
      })));
    },
    now: () => fixedNow,
  });

  await coordinator.registerWorkflow({
    workflowId: 'wf-transition',
    ownerKey: 'owner-transition',
    step: 'PENDING',
    transitionHistory: [],
  });

  await coordinator.transitionStep('wf-transition', {
    nextStep: 'SENDING',
    reason: 'dispatch_sending',
  });
  const workflow = coordinator.getWorkflowById('wf-transition');
  t.equal(workflow.step, 'SENDING', 'step should be updated');
  t.equal(workflow.transitionHistory.length, 1);
  const entry = workflow.transitionHistory[0];
  t.equal(
    entry[WORKFLOW_TRANSITION_FIELD.PREVIOUS_STEP],
    'PENDING',
    'transition must include previousStep',
  );
  t.equal(
    entry[WORKFLOW_TRANSITION_FIELD.NEXT_STEP],
    'SENDING',
    'transition must include nextStep',
  );
  t.equal(
    entry[WORKFLOW_TRANSITION_FIELD.REASON],
    'dispatch_sending',
    'transition must include reason',
  );
  t.equal(
    entry[WORKFLOW_TRANSITION_FIELD.TIMESTAMP],
    fixedNow,
    'transition must include timestamp',
  );
  t.equal(
    entry[WORKFLOW_TRANSITION_FIELD.OWNER_KEY],
    'owner-transition',
    'transition must include ownerKey',
  );

  t.ok(
    persistedWorkflows.length >= 2,
    'workflow should be persisted on register and transition',
  );
});
test('DurableWorkflowCoordinator - transitionStep rejects missing ' +
  'nextStep', async (t) => {
  const coordinator = new DurableWorkflowCoordinator();
  await coordinator.registerWorkflow({
    workflowId: 'wf-no-step',
    ownerKey: 'owner-no-step',
  });

  t.rejects(
    () => coordinator.transitionStep('wf-no-step', {reason: 'test'}),
    {message: /nextStep/},
    'transitionStep must reject when nextStep is missing',
  );
});
test('DurableWorkflowCoordinator - transitionStep rejects missing ' +
  'reason', async (t) => {
  const coordinator = new DurableWorkflowCoordinator();
  await coordinator.registerWorkflow({
    workflowId: 'wf-no-reason',
    ownerKey: 'owner-no-reason',
  });

  t.rejects(
    () => coordinator.transitionStep('wf-no-reason', {nextStep: 'DONE'}),
    {message: /reason/},
    'transitionStep must reject when reason is missing',
  );
});
test('DurableWorkflowCoordinator - transitionStep merges extra ' +
  'metadata into history entry', async (t) => {
  const coordinator = new DurableWorkflowCoordinator({
    now: () => 9000,
  });
  await coordinator.registerWorkflow({
    workflowId: 'wf-meta',
    ownerKey: 'owner-meta',
    step: 'STEP_A',
    transitionHistory: [],
  });

  await coordinator.transitionStep('wf-meta', {
    nextStep: 'STEP_B',
    reason: 'test_reason',
    metadata: {errorMessage: 'something broke'},
  });
  const workflow = coordinator.getWorkflowById('wf-meta');
  const entry = workflow.transitionHistory[0];
  t.equal(entry.errorMessage, 'something broke');
  t.equal(
    entry[WORKFLOW_TRANSITION_FIELD.REASON],
    'test_reason',
  );
});

import {
  PARTICIPANT_ACK_RESULT,
  WORKFLOW_ERROR_MSG,
} from '../../src/workflow/workflow-constants.js';

// ---------------------------------------------------------------------------
// Test-local fixture constants for acknowledgement tests
// ---------------------------------------------------------------------------
const ACK_FIXED_NOW = 2000;
const ACK_STATUS_PENDING = 'PENDING';
const ACK_STATUS_ACKNOWLEDGED = 'ACKNOWLEDGED';
const ACK_STATUS_CATCHUP_READY = 'CATCHUP_READY';
const ACK_FENCE_EPOCH_1 = 1;
const ACK_FENCE_EPOCH_2 = 2;
const ACK_FENCE_EPOCH_5 = 5;
const ACK_FENCE_EPOCH_10 = 10;
const ACK_SNAPSHOT_REVISION = 123;
const ACK_LAST_APPLIED_DELTA = 456;

// ===================================================================
// acknowledgeParticipant — topology executor acknowledgements
// ===================================================================
test('DurableWorkflowCoordinator - acknowledgeParticipant accepts ' +
  'valid acknowledgement and persists participant state ' +
  '(uses DurableWorkflowCoordinator.persistParticipant)',
async (t) => {
  const persistedParticipants = [];
  const coordinator = new DurableWorkflowCoordinator({
    persistParticipant: async (participant) => {
      persistedParticipants.push({...participant});
    },
    now: () => ACK_FIXED_NOW,
  });

  await coordinator.registerWorkflow({
    workflowId: 'wf-ack-1',
    ownerKey: 'owner-ack-1',
  });
  const workflow = coordinator.getWorkflowById('wf-ack-1');
  workflow.participants.set('child-left', {
    workflowId: 'wf-ack-1',
    participantId: 'child-left',
    participantKey: 'child-left',
    status: ACK_STATUS_PENDING,
    createdAt: ACK_FIXED_NOW,
    updatedAt: ACK_FIXED_NOW,
  });
  const result = await coordinator.acknowledgeParticipant('wf-ack-1', {
    participantKey: 'child-left',
    status: ACK_STATUS_ACKNOWLEDGED,
  });

  t.equal(result.result, PARTICIPANT_ACK_RESULT.ACCEPTED);
  t.equal(result.participantKey, 'child-left');
  t.equal(result.acknowledgedAt, ACK_FIXED_NOW);
  const participant = workflow.participants.get('child-left');
  t.equal(participant.status, ACK_STATUS_ACKNOWLEDGED);
  t.equal(participant.acknowledgedAt, ACK_FIXED_NOW);
  t.ok(
    persistedParticipants.length > 0,
    'participant should be persisted through the coordinator callback',
  );
});
test('DurableWorkflowCoordinator - acknowledgeParticipant rejects ' +
  'stale fence token', async (t) => {
  const coordinator = new DurableWorkflowCoordinator({
    now: () => ACK_FIXED_NOW,
  });

  await coordinator.registerWorkflow({
    workflowId: 'wf-ack-stale',
    ownerKey: 'owner-ack-stale',
  });
  const workflow = coordinator.getWorkflowById('wf-ack-stale');
  workflow.participants.set('source-partition', {
    workflowId: 'wf-ack-stale',
    participantId: 'source-partition',
    participantKey: 'source-partition',
    status: ACK_STATUS_PENDING,
    fenceToken: ACK_FENCE_EPOCH_10,
    createdAt: ACK_FIXED_NOW,
    updatedAt: ACK_FIXED_NOW,
  });
  const result = await coordinator.acknowledgeParticipant('wf-ack-stale', {
    participantKey: 'source-partition',
    status: ACK_STATUS_ACKNOWLEDGED,
    fenceToken: ACK_FENCE_EPOCH_5,
  });

  t.equal(result.result, PARTICIPANT_ACK_RESULT.STALE_FENCE);
  t.equal(result.participantKey, 'source-partition');
  t.equal(result.currentFenceToken, ACK_FENCE_EPOCH_10);
  t.equal(result.receivedFenceToken, ACK_FENCE_EPOCH_5);
  const participant = workflow.participants.get('source-partition');
  t.equal(
    participant.status,
    ACK_STATUS_PENDING,
    'participant status must not change on stale fence rejection',
  );
});
test('DurableWorkflowCoordinator - acknowledgeParticipant rejects ' +
  'duplicate acknowledgement for same status', async (t) => {
  const coordinator = new DurableWorkflowCoordinator({
    now: () => ACK_FIXED_NOW,
  });

  await coordinator.registerWorkflow({
    workflowId: 'wf-ack-dup',
    ownerKey: 'owner-ack-dup',
  });
  const workflow = coordinator.getWorkflowById('wf-ack-dup');
  workflow.participants.set('child-right', {
    workflowId: 'wf-ack-dup',
    participantId: 'child-right',
    participantKey: 'child-right',
    status: ACK_STATUS_ACKNOWLEDGED,
    acknowledgedAt: ACK_FIXED_NOW,
    createdAt: ACK_FIXED_NOW,
    updatedAt: ACK_FIXED_NOW,
  });
  const result = await coordinator.acknowledgeParticipant('wf-ack-dup', {
    participantKey: 'child-right',
    status: ACK_STATUS_ACKNOWLEDGED,
  });

  t.equal(result.result, PARTICIPANT_ACK_RESULT.DUPLICATE);
  t.equal(result.participantKey, 'child-right');
});
test('DurableWorkflowCoordinator - acknowledgeParticipant returns ' +
  'not-found for unknown participant', async (t) => {
  const coordinator = new DurableWorkflowCoordinator({
    now: () => ACK_FIXED_NOW,
  });

  await coordinator.registerWorkflow({
    workflowId: 'wf-ack-missing',
    ownerKey: 'owner-ack-missing',
  });
  const result = await coordinator.acknowledgeParticipant(
    'wf-ack-missing',
    {
      participantKey: 'nonexistent-participant',
      status: ACK_STATUS_ACKNOWLEDGED,
    },
  );

  t.equal(result.result, PARTICIPANT_ACK_RESULT.PARTICIPANT_NOT_FOUND);
  t.equal(result.participantKey, 'nonexistent-participant');
});
test('DurableWorkflowCoordinator - acknowledgeParticipant persists ' +
  'checkpoint data alongside participant state', async (t) => {
  const persistedParticipants = [];
  const coordinator = new DurableWorkflowCoordinator({
    persistParticipant: async (participant) => {
      persistedParticipants.push({...participant});
    },
    now: () => ACK_FIXED_NOW,
  });

  await coordinator.registerWorkflow({
    workflowId: 'wf-ack-checkpoint',
    ownerKey: 'owner-ack-checkpoint',
  });
  const workflow = coordinator.getWorkflowById('wf-ack-checkpoint');
  workflow.participants.set('source-partition', {
    workflowId: 'wf-ack-checkpoint',
    participantId: 'source-partition',
    participantKey: 'source-partition',
    status: ACK_STATUS_PENDING,
    createdAt: ACK_FIXED_NOW,
    updatedAt: ACK_FIXED_NOW,
  });
  const checkpoint = {
    snapshotRevision: ACK_SNAPSHOT_REVISION,
    lastAppliedDelta: ACK_LAST_APPLIED_DELTA,
  };
  const result = await coordinator.acknowledgeParticipant(
    'wf-ack-checkpoint',
    {
      participantKey: 'source-partition',
      status: ACK_STATUS_CATCHUP_READY,
      checkpoint,
    },
  );

  t.equal(result.result, PARTICIPANT_ACK_RESULT.ACCEPTED);
  const participant = workflow.participants.get('source-partition');
  t.equal(participant.status, ACK_STATUS_CATCHUP_READY);
  t.same(participant.checkpoint, checkpoint);
  const lastPersisted =
    persistedParticipants[persistedParticipants.length - 1];
  t.same(
    lastPersisted.checkpoint,
    checkpoint,
    'checkpoint must be persisted through the participant callback',
  );
});
test('DurableWorkflowCoordinator - acknowledgeParticipant accepts ' +
  'equal fence token', async (t) => {
  const coordinator = new DurableWorkflowCoordinator({
    now: () => ACK_FIXED_NOW,
  });

  await coordinator.registerWorkflow({
    workflowId: 'wf-ack-equal-fence',
    ownerKey: 'owner-ack-equal-fence',
  });
  const workflow = coordinator.getWorkflowById('wf-ack-equal-fence');
  workflow.participants.set('child-left', {
    workflowId: 'wf-ack-equal-fence',
    participantId: 'child-left',
    participantKey: 'child-left',
    status: ACK_STATUS_PENDING,
    fenceToken: ACK_FENCE_EPOCH_2,
    createdAt: ACK_FIXED_NOW,
    updatedAt: ACK_FIXED_NOW,
  });
  const result = await coordinator.acknowledgeParticipant(
    'wf-ack-equal-fence',
    {
      participantKey: 'child-left',
      status: ACK_STATUS_ACKNOWLEDGED,
      fenceToken: ACK_FENCE_EPOCH_2,
    },
  );

  t.equal(result.result, PARTICIPANT_ACK_RESULT.ACCEPTED);
});
test('DurableWorkflowCoordinator - acknowledgeParticipant accepts ' +
  'higher fence token and updates participant fence', async (t) => {
  const coordinator = new DurableWorkflowCoordinator({
    now: () => ACK_FIXED_NOW,
  });

  await coordinator.registerWorkflow({
    workflowId: 'wf-ack-higher-fence',
    ownerKey: 'owner-ack-higher-fence',
  });
  const workflow = coordinator.getWorkflowById('wf-ack-higher-fence');
  workflow.participants.set('child-right', {
    workflowId: 'wf-ack-higher-fence',
    participantId: 'child-right',
    participantKey: 'child-right',
    status: ACK_STATUS_PENDING,
    fenceToken: ACK_FENCE_EPOCH_1,
    createdAt: ACK_FIXED_NOW,
    updatedAt: ACK_FIXED_NOW,
  });
  const result = await coordinator.acknowledgeParticipant(
    'wf-ack-higher-fence',
    {
      participantKey: 'child-right',
      status: ACK_STATUS_ACKNOWLEDGED,
      fenceToken: ACK_FENCE_EPOCH_2,
    },
  );

  t.equal(result.result, PARTICIPANT_ACK_RESULT.ACCEPTED);
  const participant = workflow.participants.get('child-right');
  t.equal(
    participant.fenceToken,
    ACK_FENCE_EPOCH_2,
    'participant fence token must advance to the higher value',
  );
});
test('DurableWorkflowCoordinator - acknowledgeParticipant throws ' +
  'when participantKey is missing', async (t) => {
  const coordinator = new DurableWorkflowCoordinator({
    now: () => ACK_FIXED_NOW,
  });

  await coordinator.registerWorkflow({
    workflowId: 'wf-ack-no-key',
    ownerKey: 'owner-ack-no-key',
  });

  t.rejects(
    () => coordinator.acknowledgeParticipant('wf-ack-no-key', {
      status: ACK_STATUS_ACKNOWLEDGED,
    }),
    {message: WORKFLOW_ERROR_MSG.PARTICIPANT_KEY_REQUIRED},
    'must reject when participantKey is missing',
  );
});
test('DurableWorkflowCoordinator - acknowledgeParticipant throws ' +
  'when status is missing', async (t) => {
  const coordinator = new DurableWorkflowCoordinator({
    now: () => ACK_FIXED_NOW,
  });

  await coordinator.registerWorkflow({
    workflowId: 'wf-ack-no-status',
    ownerKey: 'owner-ack-no-status',
  });

  t.rejects(
    () => coordinator.acknowledgeParticipant('wf-ack-no-status', {
      participantKey: 'some-participant',
    }),
    {message: WORKFLOW_ERROR_MSG.ACK_STATUS_REQUIRED},
    'must reject when status is missing',
  );
});
test('DurableWorkflowCoordinator - acknowledgeParticipant allows ' +
  'different status after prior acknowledgement (status advance, ' +
  'not duplicate)', async (t) => {
  const coordinator = new DurableWorkflowCoordinator({
    now: () => ACK_FIXED_NOW,
  });

  await coordinator.registerWorkflow({
    workflowId: 'wf-ack-advance',
    ownerKey: 'owner-ack-advance',
  });
  const workflow = coordinator.getWorkflowById('wf-ack-advance');
  workflow.participants.set('source-partition', {
    workflowId: 'wf-ack-advance',
    participantId: 'source-partition',
    participantKey: 'source-partition',
    status: ACK_STATUS_ACKNOWLEDGED,
    acknowledgedAt: ACK_FIXED_NOW,
    createdAt: ACK_FIXED_NOW,
    updatedAt: ACK_FIXED_NOW,
  });
  const result = await coordinator.acknowledgeParticipant(
    'wf-ack-advance',
    {
      participantKey: 'source-partition',
      status: ACK_STATUS_CATCHUP_READY,
    },
  );

  t.equal(
    result.result,
    PARTICIPANT_ACK_RESULT.ACCEPTED,
    'advancing to a different status must be accepted, not duplicate',
  );
  const participant = workflow.participants.get('source-partition');
  t.equal(participant.status, ACK_STATUS_CATCHUP_READY);
});

import {
  ACK_REJECTION_DIAGNOSTIC_FIELD,
} from '../../src/workflow/workflow-constants.js';

// ===================================================================
// acknowledgeParticipant — rejection diagnostic emission
// ===================================================================
test('DurableWorkflowCoordinator - acknowledgeParticipant emits ' +
  'typed diagnostic on stale fence rejection', async (t) => {
  const diagnostics = [];
  const coordinator = new DurableWorkflowCoordinator({
    onAckRejection: (record) => diagnostics.push(record),
    now: () => ACK_FIXED_NOW,
  });

  await coordinator.registerWorkflow({
    workflowId: 'wf-diag-stale',
    ownerKey: 'owner-diag-stale',
  });
  const workflow = coordinator.getWorkflowById('wf-diag-stale');
  workflow.participants.set('source-partition', {
    workflowId: 'wf-diag-stale',
    participantId: 'source-partition',
    participantKey: 'source-partition',
    status: ACK_STATUS_PENDING,
    fenceToken: ACK_FENCE_EPOCH_10,
    createdAt: ACK_FIXED_NOW,
    updatedAt: ACK_FIXED_NOW,
  });

  await coordinator.acknowledgeParticipant('wf-diag-stale', {
    participantKey: 'source-partition',
    status: ACK_STATUS_ACKNOWLEDGED,
    fenceToken: ACK_FENCE_EPOCH_5,
  });

  t.equal(diagnostics.length, 1, 'one diagnostic must be emitted');
  const diag = diagnostics[0];
  t.equal(
    diag[ACK_REJECTION_DIAGNOSTIC_FIELD.WORKFLOW_ID],
    'wf-diag-stale',
  );
  t.equal(
    diag[ACK_REJECTION_DIAGNOSTIC_FIELD.PARTICIPANT_KEY],
    'source-partition',
  );
  t.equal(
    diag[ACK_REJECTION_DIAGNOSTIC_FIELD.REJECTION_RESULT],
    PARTICIPANT_ACK_RESULT.STALE_FENCE,
  );
  t.equal(
    diag[ACK_REJECTION_DIAGNOSTIC_FIELD.REASON],
    WORKFLOW_ERROR_MSG.STALE_FENCE_TOKEN,
  );
  t.equal(
    diag[ACK_REJECTION_DIAGNOSTIC_FIELD.RECEIVED_FENCE_TOKEN],
    ACK_FENCE_EPOCH_5,
  );
  t.equal(
    diag[ACK_REJECTION_DIAGNOSTIC_FIELD.CURRENT_FENCE_TOKEN],
    ACK_FENCE_EPOCH_10,
  );
  t.equal(
    diag[ACK_REJECTION_DIAGNOSTIC_FIELD.RECEIVED_STATUS],
    ACK_STATUS_ACKNOWLEDGED,
  );
  t.equal(
    diag[ACK_REJECTION_DIAGNOSTIC_FIELD.TIMESTAMP],
    ACK_FIXED_NOW,
  );
  t.ok(Object.isFrozen(diag), 'diagnostic record must be frozen');
});
test('DurableWorkflowCoordinator - acknowledgeParticipant emits ' +
  'typed diagnostic on duplicate rejection', async (t) => {
  const diagnostics = [];
  const coordinator = new DurableWorkflowCoordinator({
    onAckRejection: (record) => diagnostics.push(record),
    now: () => ACK_FIXED_NOW,
  });

  await coordinator.registerWorkflow({
    workflowId: 'wf-diag-dup',
    ownerKey: 'owner-diag-dup',
  });
  const workflow = coordinator.getWorkflowById('wf-diag-dup');
  workflow.participants.set('child-right', {
    workflowId: 'wf-diag-dup',
    participantId: 'child-right',
    participantKey: 'child-right',
    status: ACK_STATUS_ACKNOWLEDGED,
    acknowledgedAt: ACK_FIXED_NOW,
    createdAt: ACK_FIXED_NOW,
    updatedAt: ACK_FIXED_NOW,
  });

  await coordinator.acknowledgeParticipant('wf-diag-dup', {
    participantKey: 'child-right',
    status: ACK_STATUS_ACKNOWLEDGED,
  });

  t.equal(diagnostics.length, 1, 'one diagnostic must be emitted');
  const diag = diagnostics[0];
  t.equal(
    diag[ACK_REJECTION_DIAGNOSTIC_FIELD.WORKFLOW_ID],
    'wf-diag-dup',
  );
  t.equal(
    diag[ACK_REJECTION_DIAGNOSTIC_FIELD.PARTICIPANT_KEY],
    'child-right',
  );
  t.equal(
    diag[ACK_REJECTION_DIAGNOSTIC_FIELD.REJECTION_RESULT],
    PARTICIPANT_ACK_RESULT.DUPLICATE,
  );
  t.equal(
    diag[ACK_REJECTION_DIAGNOSTIC_FIELD.REASON],
    WORKFLOW_ERROR_MSG.DUPLICATE_TRANSITION,
  );
  t.equal(
    diag[ACK_REJECTION_DIAGNOSTIC_FIELD.RECEIVED_STATUS],
    ACK_STATUS_ACKNOWLEDGED,
  );
  t.equal(
    diag[ACK_REJECTION_DIAGNOSTIC_FIELD.CURRENT_STATUS],
    ACK_STATUS_ACKNOWLEDGED,
  );
  t.equal(
    diag[ACK_REJECTION_DIAGNOSTIC_FIELD.CURRENT_FENCE_TOKEN],
    null,
    'fence tokens must be null when not involved in duplicate rejection',
  );
  t.ok(Object.isFrozen(diag), 'diagnostic record must be frozen');
});
test('DurableWorkflowCoordinator - acknowledgeParticipant emits ' +
  'typed diagnostic on participant-not-found rejection', async (t) => {
  const diagnostics = [];
  const coordinator = new DurableWorkflowCoordinator({
    onAckRejection: (record) => diagnostics.push(record),
    now: () => ACK_FIXED_NOW,
  });

  await coordinator.registerWorkflow({
    workflowId: 'wf-diag-notfound',
    ownerKey: 'owner-diag-notfound',
  });

  await coordinator.acknowledgeParticipant('wf-diag-notfound', {
    participantKey: 'ghost-participant',
    status: ACK_STATUS_ACKNOWLEDGED,
  });

  t.equal(diagnostics.length, 1, 'one diagnostic must be emitted');
  const diag = diagnostics[0];
  t.equal(
    diag[ACK_REJECTION_DIAGNOSTIC_FIELD.WORKFLOW_ID],
    'wf-diag-notfound',
  );
  t.equal(
    diag[ACK_REJECTION_DIAGNOSTIC_FIELD.PARTICIPANT_KEY],
    'ghost-participant',
  );
  t.equal(
    diag[ACK_REJECTION_DIAGNOSTIC_FIELD.REJECTION_RESULT],
    PARTICIPANT_ACK_RESULT.PARTICIPANT_NOT_FOUND,
  );
  t.equal(
    diag[ACK_REJECTION_DIAGNOSTIC_FIELD.RECEIVED_STATUS],
    ACK_STATUS_ACKNOWLEDGED,
  );
  t.ok(Object.isFrozen(diag), 'diagnostic record must be frozen');
});
test('DurableWorkflowCoordinator - acknowledgeParticipant does not ' +
  'emit diagnostic on accepted acknowledgement', async (t) => {
  const diagnostics = [];
  const coordinator = new DurableWorkflowCoordinator({
    onAckRejection: (record) => diagnostics.push(record),
    now: () => ACK_FIXED_NOW,
  });

  await coordinator.registerWorkflow({
    workflowId: 'wf-diag-accept',
    ownerKey: 'owner-diag-accept',
  });
  const workflow = coordinator.getWorkflowById('wf-diag-accept');
  workflow.participants.set('child-left', {
    workflowId: 'wf-diag-accept',
    participantId: 'child-left',
    participantKey: 'child-left',
    status: ACK_STATUS_PENDING,
    createdAt: ACK_FIXED_NOW,
    updatedAt: ACK_FIXED_NOW,
  });
  const result = await coordinator.acknowledgeParticipant(
    'wf-diag-accept',
    {
      participantKey: 'child-left',
      status: ACK_STATUS_ACKNOWLEDGED,
    },
  );

  t.equal(result.result, PARTICIPANT_ACK_RESULT.ACCEPTED);
  t.equal(
    diagnostics.length,
    0,
    'no diagnostic must be emitted for accepted acknowledgements',
  );
});
test('DurableWorkflowCoordinator - acknowledgeParticipant works ' +
  'without onAckRejection callback (no diagnostic emitted)',
async (t) => {
  const coordinator = new DurableWorkflowCoordinator({
    now: () => ACK_FIXED_NOW,
  });

  await coordinator.registerWorkflow({
    workflowId: 'wf-diag-none',
    ownerKey: 'owner-diag-none',
  });
  const workflow = coordinator.getWorkflowById('wf-diag-none');
  workflow.participants.set('child-left', {
    workflowId: 'wf-diag-none',
    participantId: 'child-left',
    participantKey: 'child-left',
    status: ACK_STATUS_ACKNOWLEDGED,
    acknowledgedAt: ACK_FIXED_NOW,
    createdAt: ACK_FIXED_NOW,
    updatedAt: ACK_FIXED_NOW,
  });

  // Should not throw even without onAckRejection wired.
  const result = await coordinator.acknowledgeParticipant(
    'wf-diag-none',
    {
      participantKey: 'child-left',
      status: ACK_STATUS_ACKNOWLEDGED,
    },
  );

  t.equal(
    result.result,
    PARTICIPANT_ACK_RESULT.DUPLICATE,
    'rejection result must still be returned without callback',
  );
});

// ===================================================================
// Task 4.4 — Deterministic tests proving stale or duplicate
// acknowledgements cannot advance workflow state.
//
// These tests go beyond basic rejection result checks (task 4.3) and
// prove that the FULL workflow state — step, transitionHistory,
// participant status, checkpoint, fence token, persistence calls —
// remains exactly unchanged after a rejected acknowledgement.
//
// Uses both rebalance and split acknowledgement payload types to
// prove the contract holds across executor types.
//
// Validates: Requirements 3, 8
// ===================================================================

import {REBALANCE_ACK_STATUS} from
  '../../src/rebalancer/rebalance-ack-constants.js';
import {SPLIT_ACK_STATUS, SPLIT_PARTICIPANT_PREFIX} from
  '../../src/partition/split-ack-constants.js';

// ---------------------------------------------------------------------------
// Test-local fixture constants for task 4.4 state-immutability tests
// ---------------------------------------------------------------------------
const STATE_FIXED_NOW = 3000;
const STATE_WORKFLOW_STEP = 'SENDING';
const STATE_FENCE_EPOCH_CURRENT = 10;
const STATE_FENCE_EPOCH_STALE = 5;
const STATE_FENCE_EPOCH_HIGHER = 15;
const STATE_CHECKPOINT_REVISION = 42;
const STATE_CHECKPOINT_DELTA = 99;

/**
 * Build a fully-populated workflow with step, transitionHistory, and
 * multiple participants carrying checkpoint and fence data.
 * Returns the coordinator, workflow, and tracking arrays.
 */
function buildStatefulWorkflow({workflowId, ownerKey, participants}) {
  const persistedParticipants = [];
  const persistedWorkflows = [];
  const diagnostics = [];
  const coordinator = new DurableWorkflowCoordinator({
    persistWorkflow: async (wf) => {
      persistedWorkflows.push(JSON.parse(JSON.stringify(wf)));
    },
    persistParticipant: async (p) => {
      persistedParticipants.push(JSON.parse(JSON.stringify(p)));
    },
    onAckRejection: (record) => diagnostics.push(record),
    now: () => STATE_FIXED_NOW,
  });

  // Synchronously register workflow to avoid extra persist calls.
  const workflow = coordinator.createWorkflowRecord({
    workflowId,
    ownerKey,
    step: STATE_WORKFLOW_STEP,
    transitionHistory: [{
      previousStep: 'PENDING',
      nextStep: STATE_WORKFLOW_STEP,
      reason: 'dispatch_sending',
      timestamp: STATE_FIXED_NOW,
      ownerKey,
    }],
  });
  coordinator.setWorkflowState(workflow);

  for (const p of participants) {
    workflow.participants.set(p.participantKey, {
      workflowId,
      participantId: p.participantKey,
      participantKey: p.participantKey,
      status: p.status,
      fenceToken: p.fenceToken,
      checkpoint: p.checkpoint || null,
      acknowledgedAt: p.acknowledgedAt,
      createdAt: STATE_FIXED_NOW,
      updatedAt: STATE_FIXED_NOW,
    });
  }

  // Clear tracking arrays so only post-setup calls are visible.
  persistedParticipants.length = 0;
  persistedWorkflows.length = 0;
  diagnostics.length = 0;

  return {coordinator, workflow, persistedParticipants,
    persistedWorkflows, diagnostics};
}

/**
 * Deep-snapshot all participant state from a workflow.
 */
function snapshotParticipants(workflow) {
  const snapshot = {};
  for (const [key, p] of workflow.participants) {
    snapshot[key] = JSON.parse(JSON.stringify(p));
  }
  return snapshot;
}

/**
 * Deep-snapshot workflow-level state (step, transitionHistory).
 */
function snapshotWorkflowState(workflow) {
  return {
    step: workflow.step,
    transitionHistory:
      JSON.parse(JSON.stringify(workflow.transitionHistory || [])),
    updatedAt: workflow.updatedAt,
    fenceToken: workflow.fenceToken,
  };
}

// -------------------------------------------------------------------
// Stale fence — rebalance payload: full state immutability
// -------------------------------------------------------------------
test('DurableWorkflowCoordinator - stale fence rejection does not ' +
  'modify workflow step, transitionHistory, or any participant ' +
  'state (rebalance payload)', async (t) => {
  const {coordinator, workflow, persistedParticipants,
    persistedWorkflows, diagnostics} = buildStatefulWorkflow({
    workflowId: 'wf-state-stale-rebalance',
    ownerKey: 'owner-state-stale-rebalance',
    participants: [
      {
        participantKey: 'replica-1',
        status: REBALANCE_ACK_STATUS.REPLICA_CREATE_SYNCING,
        fenceToken: STATE_FENCE_EPOCH_CURRENT,
        acknowledgedAt: STATE_FIXED_NOW,
        checkpoint: {
          operationId: 'op-1',
          workflowStep: 'SENDING',
        },
      },
      {
        participantKey: 'replica-2',
        status: REBALANCE_ACK_STATUS.REPLICA_CREATE_STARTED,
        fenceToken: STATE_FENCE_EPOCH_CURRENT,
        acknowledgedAt: STATE_FIXED_NOW,
      },
    ],
  });
  const wfBefore = snapshotWorkflowState(workflow);
  const pBefore = snapshotParticipants(workflow);
  const result = await coordinator.acknowledgeParticipant(
    'wf-state-stale-rebalance',
    {
      participantKey: 'replica-1',
      status: REBALANCE_ACK_STATUS.REPLICA_CREATE_ACTIVE,
      fenceToken: STATE_FENCE_EPOCH_STALE,
    },
  );

  t.equal(result.result, PARTICIPANT_ACK_RESULT.STALE_FENCE,
    'must return stale fence rejection');

  // Workflow-level state unchanged
  const wfAfter = snapshotWorkflowState(workflow);
  t.same(wfAfter, wfBefore,
    'workflow step, transitionHistory, and fence must be unchanged');

  // All participant state unchanged
  const pAfter = snapshotParticipants(workflow);
  t.same(pAfter, pBefore,
    'all participant status, checkpoint, and fence must be unchanged');

  // No persistence calls
  t.equal(persistedParticipants.length, 0,
    'no participant persistence must occur on stale fence rejection');
  t.equal(persistedWorkflows.length, 0,
    'no workflow persistence must occur on stale fence rejection');

  // Diagnostic emitted with correct context
  t.equal(diagnostics.length, 1,
    'exactly one rejection diagnostic must be emitted');
  t.equal(
    diagnostics[0][ACK_REJECTION_DIAGNOSTIC_FIELD.REJECTION_RESULT],
    PARTICIPANT_ACK_RESULT.STALE_FENCE,
  );
});

// -------------------------------------------------------------------
// Stale fence — split payload: full state immutability
// -------------------------------------------------------------------
test('DurableWorkflowCoordinator - stale fence rejection does not ' +
  'modify workflow step, transitionHistory, or any participant ' +
  'state (split payload)', async (t) => {
  const sourceKey = SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION;
  const leftKey = SPLIT_PARTICIPANT_PREFIX.LEFT_CHILD;
  const {coordinator, workflow, persistedParticipants,
    persistedWorkflows, diagnostics} = buildStatefulWorkflow({
    workflowId: 'wf-state-stale-split',
    ownerKey: 'owner-state-stale-split',
    participants: [
      {
        participantKey: sourceKey,
        status: SPLIT_ACK_STATUS.BACKFILL_PROGRESS,
        fenceToken: STATE_FENCE_EPOCH_CURRENT,
        acknowledgedAt: STATE_FIXED_NOW,
        checkpoint: {
          snapshotRevision: STATE_CHECKPOINT_REVISION,
          lastAppliedDelta: STATE_CHECKPOINT_DELTA,
        },
      },
      {
        participantKey: leftKey,
        status: SPLIT_ACK_STATUS.CHILD_PROVISIONED,
        fenceToken: STATE_FENCE_EPOCH_CURRENT,
        acknowledgedAt: STATE_FIXED_NOW,
      },
    ],
  });
  const wfBefore = snapshotWorkflowState(workflow);
  const pBefore = snapshotParticipants(workflow);
  const result = await coordinator.acknowledgeParticipant(
    'wf-state-stale-split',
    {
      participantKey: sourceKey,
      status: SPLIT_ACK_STATUS.CATCHUP_READY,
      fenceToken: STATE_FENCE_EPOCH_STALE,
    },
  );

  t.equal(result.result, PARTICIPANT_ACK_RESULT.STALE_FENCE);
  const wfAfter = snapshotWorkflowState(workflow);
  t.same(wfAfter, wfBefore,
    'workflow state must be unchanged after stale split ack');
  const pAfter = snapshotParticipants(workflow);
  t.same(pAfter, pBefore,
    'all participant state must be unchanged after stale split ack');

  t.equal(persistedParticipants.length, 0,
    'no participant persistence on stale split ack');
  t.equal(persistedWorkflows.length, 0,
    'no workflow persistence on stale split ack');

  t.equal(diagnostics.length, 1);
  t.equal(
    diagnostics[0][ACK_REJECTION_DIAGNOSTIC_FIELD.REJECTION_RESULT],
    PARTICIPANT_ACK_RESULT.STALE_FENCE,
  );
});

// -------------------------------------------------------------------
// Duplicate — rebalance payload: full state immutability
// -------------------------------------------------------------------
test('DurableWorkflowCoordinator - duplicate rejection does not ' +
  'modify workflow step, transitionHistory, or any participant ' +
  'state (rebalance payload)', async (t) => {
  const {coordinator, workflow, persistedParticipants,
    persistedWorkflows, diagnostics} = buildStatefulWorkflow({
    workflowId: 'wf-state-dup-rebalance',
    ownerKey: 'owner-state-dup-rebalance',
    participants: [
      {
        participantKey: 'replica-1',
        status: REBALANCE_ACK_STATUS.REPLICA_CREATE_ACTIVE,
        fenceToken: STATE_FENCE_EPOCH_CURRENT,
        acknowledgedAt: STATE_FIXED_NOW,
        checkpoint: {
          operationId: 'op-dup',
          workflowStep: 'SENDING',
          replicaId: 'r-1',
        },
      },
      {
        participantKey: 'replica-2',
        status: REBALANCE_ACK_STATUS.REPLICA_CREATE_SYNCING,
        fenceToken: STATE_FENCE_EPOCH_CURRENT,
        acknowledgedAt: STATE_FIXED_NOW,
      },
    ],
  });
  const wfBefore = snapshotWorkflowState(workflow);
  const pBefore = snapshotParticipants(workflow);
  const result = await coordinator.acknowledgeParticipant(
    'wf-state-dup-rebalance',
    {
      participantKey: 'replica-1',
      status: REBALANCE_ACK_STATUS.REPLICA_CREATE_ACTIVE,
      fenceToken: STATE_FENCE_EPOCH_CURRENT,
    },
  );

  t.equal(result.result, PARTICIPANT_ACK_RESULT.DUPLICATE,
    'must return duplicate rejection');

  const wfAfter = snapshotWorkflowState(workflow);
  t.same(wfAfter, wfBefore,
    'workflow state must be unchanged after duplicate rebalance ack');

  const pAfter = snapshotParticipants(workflow);
  t.same(pAfter, pBefore,
    'all participant state must be unchanged after duplicate rebalance ack');

  t.equal(persistedParticipants.length, 0,
    'no participant persistence on duplicate rebalance ack');
  t.equal(persistedWorkflows.length, 0,
    'no workflow persistence on duplicate rebalance ack');

  t.equal(diagnostics.length, 1);
  t.equal(
    diagnostics[0][ACK_REJECTION_DIAGNOSTIC_FIELD.REJECTION_RESULT],
    PARTICIPANT_ACK_RESULT.DUPLICATE,
  );
});

// -------------------------------------------------------------------
// Duplicate — split payload: full state immutability
// -------------------------------------------------------------------
test('DurableWorkflowCoordinator - duplicate rejection does not ' +
  'modify workflow step, transitionHistory, or any participant ' +
  'state (split payload)', async (t) => {
  const sourceKey = SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION;
  const rightKey = SPLIT_PARTICIPANT_PREFIX.RIGHT_CHILD;

  const {coordinator, workflow, persistedParticipants,
    persistedWorkflows, diagnostics} = buildStatefulWorkflow({
    workflowId: 'wf-state-dup-split',
    ownerKey: 'owner-state-dup-split',
    participants: [
      {
        participantKey: sourceKey,
        status: SPLIT_ACK_STATUS.CATCHUP_READY,
        fenceToken: STATE_FENCE_EPOCH_CURRENT,
        acknowledgedAt: STATE_FIXED_NOW,
        checkpoint: {
          snapshotRevision: STATE_CHECKPOINT_REVISION,
          lastAppliedDelta: STATE_CHECKPOINT_DELTA,
        },
      },
      {
        participantKey: rightKey,
        status: SPLIT_ACK_STATUS.CHILD_PROVISIONED,
        fenceToken: STATE_FENCE_EPOCH_CURRENT,
        acknowledgedAt: STATE_FIXED_NOW,
      },
    ],
  });

  const wfBefore = snapshotWorkflowState(workflow);
  const pBefore = snapshotParticipants(workflow);

  const result = await coordinator.acknowledgeParticipant(
    'wf-state-dup-split',
    {
      participantKey: sourceKey,
      status: SPLIT_ACK_STATUS.CATCHUP_READY,
      fenceToken: STATE_FENCE_EPOCH_CURRENT,
    },
  );

  t.equal(result.result, PARTICIPANT_ACK_RESULT.DUPLICATE);

  const wfAfter = snapshotWorkflowState(workflow);
  t.same(wfAfter, wfBefore,
    'workflow state must be unchanged after duplicate split ack');

  const pAfter = snapshotParticipants(workflow);
  t.same(pAfter, pBefore,
    'all participant state must be unchanged after duplicate split ack');

  t.equal(persistedParticipants.length, 0,
    'no participant persistence on duplicate split ack');
  t.equal(persistedWorkflows.length, 0,
    'no workflow persistence on duplicate split ack');

  t.equal(diagnostics.length, 1);
  t.equal(
    diagnostics[0][ACK_REJECTION_DIAGNOSTIC_FIELD.REJECTION_RESULT],
    PARTICIPANT_ACK_RESULT.DUPLICATE,
  );
});

// -------------------------------------------------------------------
// Stale fence with checkpoint: checkpoint must not be overwritten
// -------------------------------------------------------------------
test('DurableWorkflowCoordinator - stale fence rejection preserves ' +
  'existing checkpoint data even when ack carries new checkpoint',
async (t) => {
  const sourceKey = SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION;

  const originalCheckpoint = {
    snapshotRevision: STATE_CHECKPOINT_REVISION,
    lastAppliedDelta: STATE_CHECKPOINT_DELTA,
  };

  const {coordinator, workflow, persistedParticipants} =
    buildStatefulWorkflow({
      workflowId: 'wf-state-stale-checkpoint',
      ownerKey: 'owner-state-stale-checkpoint',
      participants: [{
        participantKey: sourceKey,
        status: SPLIT_ACK_STATUS.BACKFILL_PROGRESS,
        fenceToken: STATE_FENCE_EPOCH_CURRENT,
        acknowledgedAt: STATE_FIXED_NOW,
        checkpoint: originalCheckpoint,
      }],
    });

  const newCheckpoint = {
    snapshotRevision: 999,
    lastAppliedDelta: 888,
  };

  const result = await coordinator.acknowledgeParticipant(
    'wf-state-stale-checkpoint',
    {
      participantKey: sourceKey,
      status: SPLIT_ACK_STATUS.CATCHUP_READY,
      fenceToken: STATE_FENCE_EPOCH_STALE,
      checkpoint: newCheckpoint,
    },
  );

  t.equal(result.result, PARTICIPANT_ACK_RESULT.STALE_FENCE);

  const participant = workflow.participants.get(sourceKey);
  t.same(participant.checkpoint, originalCheckpoint,
    'checkpoint must remain the original value after stale fence');
  t.equal(participant.status, SPLIT_ACK_STATUS.BACKFILL_PROGRESS,
    'status must remain unchanged after stale fence');
  t.equal(persistedParticipants.length, 0,
    'no persistence on stale fence with checkpoint');
});

// -------------------------------------------------------------------
// Duplicate with checkpoint: checkpoint must not be overwritten
// -------------------------------------------------------------------
test('DurableWorkflowCoordinator - duplicate rejection preserves ' +
  'existing checkpoint data even when ack carries new checkpoint',
async (t) => {
  const originalCheckpoint = {
    operationId: 'op-dup-ckpt',
    workflowStep: 'SENDING',
    replicaId: 'r-dup',
  };

  const {coordinator, workflow, persistedParticipants} =
    buildStatefulWorkflow({
      workflowId: 'wf-state-dup-checkpoint',
      ownerKey: 'owner-state-dup-checkpoint',
      participants: [{
        participantKey: 'replica-1',
        status: REBALANCE_ACK_STATUS.REPLICA_CREATE_ACTIVE,
        fenceToken: STATE_FENCE_EPOCH_CURRENT,
        acknowledgedAt: STATE_FIXED_NOW,
        checkpoint: originalCheckpoint,
      }],
    });

  const newCheckpoint = {
    operationId: 'op-new',
    workflowStep: 'DONE',
    replicaId: 'r-new',
  };

  const result = await coordinator.acknowledgeParticipant(
    'wf-state-dup-checkpoint',
    {
      participantKey: 'replica-1',
      status: REBALANCE_ACK_STATUS.REPLICA_CREATE_ACTIVE,
      fenceToken: STATE_FENCE_EPOCH_CURRENT,
      checkpoint: newCheckpoint,
    },
  );

  t.equal(result.result, PARTICIPANT_ACK_RESULT.DUPLICATE);

  const participant = workflow.participants.get('replica-1');
  t.same(participant.checkpoint, originalCheckpoint,
    'checkpoint must remain the original value after duplicate');
  t.equal(persistedParticipants.length, 0,
    'no persistence on duplicate with checkpoint');
});

// -------------------------------------------------------------------
// Sibling participant isolation: rejection on one participant must
// not affect any other participant in the same workflow
// -------------------------------------------------------------------
test('DurableWorkflowCoordinator - stale fence rejection on one ' +
  'participant does not affect sibling participants', async (t) => {
  const sourceKey = SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION;
  const leftKey = SPLIT_PARTICIPANT_PREFIX.LEFT_CHILD;
  const rightKey = SPLIT_PARTICIPANT_PREFIX.RIGHT_CHILD;

  const {coordinator, workflow} = buildStatefulWorkflow({
    workflowId: 'wf-state-sibling-isolation',
    ownerKey: 'owner-state-sibling-isolation',
    participants: [
      {
        participantKey: sourceKey,
        status: SPLIT_ACK_STATUS.SNAPSHOT_STARTED,
        fenceToken: STATE_FENCE_EPOCH_CURRENT,
        acknowledgedAt: STATE_FIXED_NOW,
      },
      {
        participantKey: leftKey,
        status: SPLIT_ACK_STATUS.CHILD_PROVISIONED,
        fenceToken: STATE_FENCE_EPOCH_CURRENT,
        acknowledgedAt: STATE_FIXED_NOW,
      },
      {
        participantKey: rightKey,
        status: SPLIT_ACK_STATUS.CHILD_PROVISIONED,
        fenceToken: STATE_FENCE_EPOCH_CURRENT,
        acknowledgedAt: STATE_FIXED_NOW,
      },
    ],
  });

  const leftBefore =
    JSON.parse(JSON.stringify(workflow.participants.get(leftKey)));
  const rightBefore =
    JSON.parse(JSON.stringify(workflow.participants.get(rightKey)));

  await coordinator.acknowledgeParticipant(
    'wf-state-sibling-isolation',
    {
      participantKey: sourceKey,
      status: SPLIT_ACK_STATUS.BACKFILL_PROGRESS,
      fenceToken: STATE_FENCE_EPOCH_STALE,
    },
  );

  const leftAfter = workflow.participants.get(leftKey);
  const rightAfter = workflow.participants.get(rightKey);

  t.same(
    JSON.parse(JSON.stringify(leftAfter)),
    leftBefore,
    'left-child participant must be unchanged after source stale fence',
  );
  t.same(
    JSON.parse(JSON.stringify(rightAfter)),
    rightBefore,
    'right-child participant must be unchanged after source stale fence',
  );
});

// -------------------------------------------------------------------
// Sequential stale then valid: state must recover correctly after
// a rejected ack followed by a valid one
// -------------------------------------------------------------------
test('DurableWorkflowCoordinator - valid ack succeeds after prior ' +
  'stale fence rejection on same participant', async (t) => {
  const {coordinator, workflow, persistedParticipants} =
    buildStatefulWorkflow({
      workflowId: 'wf-state-stale-then-valid',
      ownerKey: 'owner-state-stale-then-valid',
      participants: [{
        participantKey: 'replica-1',
        status: REBALANCE_ACK_STATUS.REPLICA_CREATE_SYNCING,
        fenceToken: STATE_FENCE_EPOCH_CURRENT,
        acknowledgedAt: undefined,
      }],
    });

  // First: stale ack — must be rejected, state unchanged
  const staleResult = await coordinator.acknowledgeParticipant(
    'wf-state-stale-then-valid',
    {
      participantKey: 'replica-1',
      status: REBALANCE_ACK_STATUS.REPLICA_CREATE_ACTIVE,
      fenceToken: STATE_FENCE_EPOCH_STALE,
    },
  );
  t.equal(staleResult.result, PARTICIPANT_ACK_RESULT.STALE_FENCE);
  t.equal(
    workflow.participants.get('replica-1').status,
    REBALANCE_ACK_STATUS.REPLICA_CREATE_SYNCING,
    'status must remain syncing after stale rejection',
  );
  t.equal(persistedParticipants.length, 0,
    'no persistence after stale rejection');

  // Second: valid ack with correct fence — must succeed
  const validResult = await coordinator.acknowledgeParticipant(
    'wf-state-stale-then-valid',
    {
      participantKey: 'replica-1',
      status: REBALANCE_ACK_STATUS.REPLICA_CREATE_ACTIVE,
      fenceToken: STATE_FENCE_EPOCH_HIGHER,
    },
  );
  t.equal(validResult.result, PARTICIPANT_ACK_RESULT.ACCEPTED);
  t.equal(
    workflow.participants.get('replica-1').status,
    REBALANCE_ACK_STATUS.REPLICA_CREATE_ACTIVE,
    'status must advance after valid ack',
  );
  t.equal(persistedParticipants.length, 1,
    'exactly one persistence call for the valid ack');
});

// -------------------------------------------------------------------
// Sequential duplicate then different status: state must recover
// correctly after a duplicate rejection followed by a status advance
// -------------------------------------------------------------------
test('DurableWorkflowCoordinator - status advance succeeds after ' +
  'prior duplicate rejection on same participant', async (t) => {
  const sourceKey = SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION;

  const {coordinator, workflow, persistedParticipants} =
    buildStatefulWorkflow({
      workflowId: 'wf-state-dup-then-advance',
      ownerKey: 'owner-state-dup-then-advance',
      participants: [{
        participantKey: sourceKey,
        status: SPLIT_ACK_STATUS.BACKFILL_PROGRESS,
        fenceToken: STATE_FENCE_EPOCH_CURRENT,
        acknowledgedAt: STATE_FIXED_NOW,
      }],
    });

  // First: duplicate ack — must be rejected
  const dupResult = await coordinator.acknowledgeParticipant(
    'wf-state-dup-then-advance',
    {
      participantKey: sourceKey,
      status: SPLIT_ACK_STATUS.BACKFILL_PROGRESS,
    },
  );
  t.equal(dupResult.result, PARTICIPANT_ACK_RESULT.DUPLICATE);
  t.equal(persistedParticipants.length, 0,
    'no persistence after duplicate rejection');

  // Second: different status — must succeed
  const advanceResult = await coordinator.acknowledgeParticipant(
    'wf-state-dup-then-advance',
    {
      participantKey: sourceKey,
      status: SPLIT_ACK_STATUS.CATCHUP_READY,
    },
  );
  t.equal(advanceResult.result, PARTICIPANT_ACK_RESULT.ACCEPTED);
  t.equal(
    workflow.participants.get(sourceKey).status,
    SPLIT_ACK_STATUS.CATCHUP_READY,
    'status must advance after valid different-status ack',
  );
  t.equal(persistedParticipants.length, 1,
    'exactly one persistence call for the valid advance');
});
