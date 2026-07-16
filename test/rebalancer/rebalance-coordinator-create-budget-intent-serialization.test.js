import {test} from '../../src/test-helpers/tap.js';
import {runConcurrentCreateBudgetGate} from '../../src/rebalancer/rebalance-coordinator-concurrent-add-budget.js';
import {DurableWorkflowCoordinator} from '../../src/workflow/durable-workflow-coordinator.js';

const ADD_OPERATION_TYPE = 'ADD';
const FIRST_PARTITION_ID = 'movie_genres-p1';
const SECOND_PARTITION_ID = 'movie_people-p1';
const SHARED_BUDGET_KEY = 'create-budget:add';

function createDeferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return {promise, resolve};
}

function createBudgetOwner(events) {
  const workflow = new DurableWorkflowCoordinator();
  return {
    getCreateBudgetSingleFlightKey: () => SHARED_BUDGET_KEY,
    operationWorkflowRunExclusive: workflow.runExclusive.bind(workflow),
    ensureConcurrentOperationBudgetAllowed: async (_moveType, context) => {
      events.push(`budget:${context.partitionId}`);
    },
  };
}

function runCreateIntent(coordinator, partitionId, executionFactory) {
  return runConcurrentCreateBudgetGate(
    coordinator,
    ADD_OPERATION_TYPE,
    {partitionId},
    executionFactory,
  );
}

test(
  'shared create-budget lane serializes distinct factories and their results',
  async (t) => {
    const events = [];
    const firstStarted = createDeferred();
    const releaseFirst = createDeferred();
    const coordinator = createBudgetOwner(events);

    const firstIntent = runCreateIntent(
      coordinator,
      FIRST_PARTITION_ID,
      async () => {
        events.push(`start:${FIRST_PARTITION_ID}`);
        firstStarted.resolve();
        await releaseFirst.promise;
        events.push(`end:${FIRST_PARTITION_ID}`);
        return {partitionId: FIRST_PARTITION_ID};
      },
    );
    await firstStarted.promise;
    const secondIntent = runCreateIntent(
      coordinator,
      SECOND_PARTITION_ID,
      async () => {
        events.push(`start:${SECOND_PARTITION_ID}`);
        return {partitionId: SECOND_PARTITION_ID};
      },
    );

    t.same(
      events,
      [`budget:${FIRST_PARTITION_ID}`, `start:${FIRST_PARTITION_ID}`],
      'the second distinct intent waits behind the shared atomic budget lane',
    );
    releaseFirst.resolve();

    const [firstResult, secondResult] = await Promise.all([
      firstIntent,
      secondIntent,
    ]);
    t.same(firstResult, {partitionId: FIRST_PARTITION_ID});
    t.same(secondResult, {partitionId: SECOND_PARTITION_ID});
    t.same(events, [
      `budget:${FIRST_PARTITION_ID}`,
      `start:${FIRST_PARTITION_ID}`,
      `end:${FIRST_PARTITION_ID}`,
      `budget:${SECOND_PARTITION_ID}`,
      `start:${SECOND_PARTITION_ID}`,
    ]);
    t.end();
  },
);

test(
  'shared create-budget lane does not leak a holder rejection to a waiter',
  async (t) => {
    const events = [];
    const firstStarted = createDeferred();
    const releaseFirst = createDeferred();
    const coordinator = createBudgetOwner(events);
    const holderError = new Error('first create failed');

    const firstIntent = runCreateIntent(
      coordinator,
      FIRST_PARTITION_ID,
      async () => {
        events.push(`start:${FIRST_PARTITION_ID}`);
        firstStarted.resolve();
        await releaseFirst.promise;
        throw holderError;
      },
    );
    await firstStarted.promise;
    const secondIntent = runCreateIntent(
      coordinator,
      SECOND_PARTITION_ID,
      async () => {
        events.push(`start:${SECOND_PARTITION_ID}`);
        return {partitionId: SECOND_PARTITION_ID};
      },
    );
    releaseFirst.resolve();

    const [firstOutcome, secondOutcome] = await Promise.allSettled([
      firstIntent,
      secondIntent,
    ]);
    t.equal(firstOutcome.status, 'rejected');
    t.equal(firstOutcome.reason, holderError);
    t.equal(secondOutcome.status, 'fulfilled');
    t.same(secondOutcome.value, {partitionId: SECOND_PARTITION_ID});
    t.same(events, [
      `budget:${FIRST_PARTITION_ID}`,
      `start:${FIRST_PARTITION_ID}`,
      `budget:${SECOND_PARTITION_ID}`,
      `start:${SECOND_PARTITION_ID}`,
    ]);
    t.end();
  },
);
