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
