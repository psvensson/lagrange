import {test} from '../../src/test-helpers/tap.js';
import {DurableWorkflowCoordinator} from
  '../../src/workflow/durable-workflow-coordinator.js';
import {
  WORKFLOW_CLAIM_RESULT,
  WORKFLOW_ERROR_MSG,
} from '../../src/workflow/workflow-constants.js';

const STATUS = Object.freeze({
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  SUCCEEDED: 'SUCCEEDED',
});

function cloneWorkflow(workflow) {
  return {
    ...workflow,
    participants: new Map(workflow.participants || []),
    transitionHistory: [...(workflow.transitionHistory || [])],
  };
}

function createStorage(initialWorkflow) {
  let row = cloneWorkflow(initialWorkflow);
  return {
    read() {
      return cloneWorkflow(row);
    },
    async claim(candidate, context) {
      if ((row.fenceToken || 0) !== (context.expectedFenceToken || 0)) {
        return {accepted: false};
      }
      row = cloneWorkflow(candidate);
      return {accepted: true, workflow: cloneWorkflow(row)};
    },
    async transition(candidate, context) {
      if ((row.fenceToken || 0) !== (context.expectedFenceToken || 0)) {
        return {accepted: false};
      }
      if (row.workflowOwnerId !== context.expectedOwnerId) {
        return {accepted: false};
      }
      row = cloneWorkflow(candidate);
      return {accepted: true, workflow: cloneWorkflow(row)};
    },
  };
}

function createCoordinator(storage, now) {
  return new DurableWorkflowCoordinator({
    now: () => now.value,
    persistWorkflowClaim: storage.claim,
    persistWorkflowTransition: storage.transition,
    isTerminalWorkflow: (workflow) => workflow.step === STATUS.SUCCEEDED,
  });
}

test('storage-backed workflow ownership fences stale workers and preserves ' +
  'terminal replay', async (t) => {
  const now = {value: 100};
  const initialWorkflow = {
    workflowId: 'schema-job-1',
    ownerKey: 'schema:public.users',
    step: STATUS.PENDING,
    fenceToken: 0,
    attemptCount: 0,
    transitionHistory: [],
    participants: new Map(),
    createdAt: now.value,
    updatedAt: now.value,
  };
  const storage = createStorage(initialWorkflow);
  const first = createCoordinator(storage, now);
  const second = createCoordinator(storage, now);
  first.recover({workflows: [storage.read()]});
  second.recover({workflows: [storage.read()]});

  const firstClaim = await first.claimWorkflow('schema-job-1', {
    ownerId: 'worker-a',
    fenceToken: 1,
    leaseExpiresAt: 200,
  });
  t.equal(firstClaim.result, WORKFLOW_CLAIM_RESULT.ACCEPTED);

  await t.rejects(
    first.transitionStep('schema-job-1', {
      nextStep: STATUS.RUNNING,
      reason: 'unclaimed_higher_fence',
      fenceToken: 2,
      ownerId: 'worker-a',
    }),
    {message: WORKFLOW_ERROR_MSG.STALE_FENCE_TOKEN},
    'a transition cannot acquire a higher fence implicitly',
  );

  const sameFenceAttacker = createCoordinator(storage, now);
  sameFenceAttacker.recover({workflows: [storage.read()]});
  await t.rejects(
    sameFenceAttacker.transitionStep('schema-job-1', {
      nextStep: STATUS.RUNNING,
      reason: 'same_fence_wrong_owner',
      fenceToken: 1,
      ownerId: 'worker-b',
    }),
    {message: WORKFLOW_ERROR_MSG.WORKFLOW_OWNER_MISMATCH},
    'a readable current fence does not authorize a different owner',
  );

  const staleEqualClaim = await second.claimWorkflow('schema-job-1', {
    ownerId: 'worker-b',
    fenceToken: 1,
    leaseExpiresAt: 250,
  });
  t.equal(
    staleEqualClaim.result,
    WORKFLOW_CLAIM_RESULT.STORAGE_REJECTED,
    'authoritative storage rejects a stale equal-epoch claim',
  );

  const activeContender = createCoordinator(storage, now);
  activeContender.recover({workflows: [storage.read()]});
  const activeLeaseClaim = await activeContender.claimWorkflow(
    'schema-job-1',
    {ownerId: 'worker-b', fenceToken: 2, leaseExpiresAt: 300},
  );
  t.equal(activeLeaseClaim.result, WORKFLOW_CLAIM_RESULT.ACTIVE_OWNER,
    'a higher epoch cannot steal a live lease before expiry');

  const recoveredSecond = createCoordinator(storage, now);
  recoveredSecond.recover({workflows: [storage.read()]});
  now.value = 201;
  const higherClaim = await recoveredSecond.claimWorkflow('schema-job-1', {
    ownerId: 'worker-b',
    fenceToken: 2,
    leaseExpiresAt: 300,
  });
  t.equal(higherClaim.result, WORKFLOW_CLAIM_RESULT.ACCEPTED);

  await t.rejects(
    first.transitionStep('schema-job-1', {
      nextStep: STATUS.RUNNING,
      reason: 'stale_worker_resumed',
      fenceToken: 1,
      ownerId: 'worker-a',
    }),
    {message: WORKFLOW_ERROR_MSG.WORKFLOW_LEASE_EXPIRED},
  );
  t.equal(
    first.getWorkflowById('schema-job-1').step,
    STATUS.PENDING,
    'rejected persistence must not mutate the stale in-memory workflow',
  );

  await recoveredSecond.transitionStep('schema-job-1', {
    nextStep: STATUS.SUCCEEDED,
    reason: 'provisioning_complete',
    fenceToken: 2,
    ownerId: 'worker-b',
  });
  await t.rejects(
    recoveredSecond.transitionStep('schema-job-1', {
      nextStep: STATUS.RUNNING,
      reason: 'illegal_terminal_exit',
      fenceToken: 2,
      ownerId: 'worker-b',
    }),
    {message: WORKFLOW_ERROR_MSG.TERMINAL_WORKFLOW_IMMUTABLE},
  );

  const terminalBeforeClaim = storage.read();
  const terminalClaim = await recoveredSecond.claimWorkflow('schema-job-1', {
    ownerId: 'worker-c',
    fenceToken: 3,
    leaseExpiresAt: 400,
  });
  t.equal(terminalClaim.result, WORKFLOW_CLAIM_RESULT.TERMINAL);
  t.equal(storage.read().fenceToken, terminalBeforeClaim.fenceToken);
  t.equal(storage.read().attemptCount, terminalBeforeClaim.attemptCount,
    'terminal claims cannot mutate ownership state');

  const replay = createCoordinator(storage, now);
  replay.recover({workflows: [storage.read()]});
  const terminalReplay = await replay.transitionStep('schema-job-1', {
    nextStep: STATUS.SUCCEEDED,
    reason: 'duplicate_terminal_replay',
    fenceToken: 2,
    ownerId: 'worker-b',
  });
  t.equal(terminalReplay.transitionHistory.length, 1,
    'recovery reconstructs committed transition idempotency');
});

test('storage-backed transitions require an active exact-fence lease',
  async (t) => {
    const now = {value: 10};
    const storage = createStorage({
      workflowId: 'schema-job-expired',
      ownerKey: 'schema:global.expired',
      step: STATUS.PENDING,
      fenceToken: 0,
      attemptCount: 0,
      transitionHistory: [],
      participants: new Map(),
      createdAt: now.value,
      updatedAt: now.value,
    });
    const coordinator = createCoordinator(storage, now);
    coordinator.recover({workflows: [storage.read()]});
    await coordinator.claimWorkflow('schema-job-expired', {
      ownerId: 'worker-a',
      fenceToken: 1,
      leaseExpiresAt: 20,
    });
    now.value = 20;
    await t.rejects(
      coordinator.transitionStep('schema-job-expired', {
        nextStep: STATUS.RUNNING,
        reason: 'lease_expired',
        fenceToken: 1,
        ownerId: 'worker-a',
      }),
      {message: WORKFLOW_ERROR_MSG.WORKFLOW_LEASE_EXPIRED},
    );
    t.equal(storage.read().step, STATUS.PENDING);
  });
