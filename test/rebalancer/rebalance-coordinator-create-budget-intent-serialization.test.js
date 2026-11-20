import {test} from '../../src/test-helpers/tap.js';
import {runConcurrentCreateBudgetGate} from '../../src/rebalancer/rebalance-coordinator-concurrent-add-budget.js';
import {DurableWorkflowCoordinator} from '../../src/workflow/durable-workflow-coordinator.js';
import {
  REBALANCE_COORDINATOR_EVENT,
  REBALANCER_SKIP_REASON,
} from '../../src/rebalancer/rebalancer-constants.js';
import {PLACEMENT_REFUSAL} from '../../src/rebalancer/replica-placement-owner-constants.js';
import {TABLES} from '../../src/constants/tables.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {createTargetSlotAuthorityFixture} from './target-slot-authority-fixture.js';

const ADD_OPERATION_TYPE = 'ADD';
const FIRST_PARTITION_ID = 'movie_genres-p1';
const SECOND_PARTITION_ID = 'movie_people-p1';
const SHARED_BUDGET_KEY = 'create-budget:add';
const TARGET_SLOT_REFUSAL_REASON = PLACEMENT_REFUSAL.TARGET_AT_CAPACITY;

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

function assertTargetSlotOwnerObservation(t, fixture, expectedCount) {
  const slotCall = fixture.slotCalls.at(-1);
  t.ok(slotCall, 'real createOperation reaches the target-slot consumer');
  t.equal(slotCall?.observationIsArray, true, 'the repository produces its actual array');
  t.equal(slotCall?.observedOperationIds.length, expectedCount,
    'the consumer receives the authoritative live occupants');
  t.equal(slotCall?.recentIntentCount, 0, 'creator hints do not mask the owner observation');
  t.ok(fixture.readCalls.some((call) => call.operationIds.length === expectedCount),
    'the real owner query and its parameters selected the held rows in SQLite');
}

test('createOperation admits the second target-slot occupant from a hidden owner array',
  async (t) => {
    const fixture = await createTargetSlotAuthorityFixture({heldCount: 1});
    try {
      const created = await fixture.createContender();
      assertTargetSlotOwnerObservation(t, fixture, 1);
      t.equal(fixture.slotCalls.at(-1).cachedOperationIds.length, 0);
      t.equal(fixture.slotCalls.at(-1).decision.occupiedCount, 1,
        'the permitted second operation still counts its hidden predecessor');
      t.equal(fixture.slotCalls.at(-1).decision.maxPerTargetNode, 2);
      t.ok(fixture.persistedRows.has(created.operationId));
      t.equal(fixture.persistedRows.size, 2, 'one held operation plus the admitted second');
    } finally {
      await fixture.close();
    }
  });

test('createOperation refuses a third target-slot occupant from two hidden owner records',
  async (t) => {
    const fixture = await createTargetSlotAuthorityFixture({heldCount: 2});
    try {
      await t.rejects(fixture.createContender(), {
        rebalanceSkipReason: REBALANCER_SKIP_REASON.BUDGET_EXCEEDED,
        reasonCode: TARGET_SLOT_REFUSAL_REASON,
        limit: 2,
      });
      assertTargetSlotOwnerObservation(t, fixture, 2);
      t.equal(fixture.slotCalls.at(-1).cachedOperationIds.length, 0);
      t.equal(fixture.persistedRows.size, 2, 'the refused third operation is not persisted');
    } finally {
      await fixture.close();
    }
  });

test('createOperation still refuses a third cache-visible target-slot occupant',
  async (t) => {
    const fixture = await createTargetSlotAuthorityFixture({
      heldCount: 2, publishHeldRows: true,
    });
    try {
      await t.rejects(fixture.createContender(), {
        rebalanceSkipReason: REBALANCER_SKIP_REASON.BUDGET_EXCEEDED,
        reasonCode: TARGET_SLOT_REFUSAL_REASON,
        limit: 2,
      });
      assertTargetSlotOwnerObservation(t, fixture, 2);
      t.equal(fixture.slotCalls.at(-1).cachedOperationIds.length, 2);
      t.equal(fixture.persistedRows.size, 2);
    } finally {
      await fixture.close();
    }
  });

test('completeOperation terminal publication releases a target slot for the refused create',
  async (t) => {
    const fixture = await createTargetSlotAuthorityFixture({
      heldCount: 2, publishHeldRows: true,
    });
    const completedOperationIds = [];
    fixture.coordinator.on(REBALANCE_COORDINATOR_EVENT.OPERATION_COMPLETED,
      ({operation}) => completedOperationIds.push(operation.operationId));
    try {
      await t.rejects(fixture.createContender(), {
        reasonCode: TARGET_SLOT_REFUSAL_REASON,
      });
      const completedOperation = fixture.heldOperations[0];
      const completion = await fixture.coordinator.completeOperation(completedOperation);
      t.equal(completion.committed, true, 'the actual completion owner commits the transition');
      const authoritative = await fixture.coordinator
        .queryAuthoritativeOperationVisibilityObservation(completedOperation.operationId);
      t.equal(authoritative.operation?.workflowStep, WORKFLOW_STEP.ACTIVE);
      t.same(completedOperationIds, [completedOperation.operationId],
        'the canonical completion event reports the released operation');
      fixture.publishOperation(completedOperation.operationId);
      t.equal(fixture.cache.get(TABLES.REPLICA_OPERATIONS,
        completedOperation.operationId).workflow_step, WORKFLOW_STEP.ACTIVE,
      'the published cache row is the actual terminal repository row');

      const created = await fixture.createContender();
      assertTargetSlotOwnerObservation(t, fixture, 1);
      t.equal(fixture.slotCalls.at(-1).decision.occupiedCount, 1,
        'only the other live occupant retains capacity');
      t.equal(fixture.persistedRows.size, 3, 'the previously refused operation now persists');
      t.ok(fixture.persistedRows.has(created.operationId));
      const replay = await fixture.createContender();
      t.equal(replay.operationId, created.operationId, 'repeating this intent reuses its owner row');
      t.equal(fixture.persistedRows.size, 3, 'the replay creates no duplicate operation');
    } finally {
      await fixture.close();
    }
  });
