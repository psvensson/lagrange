/**
 * SUPERSEDED (R09). This file pinned the owner-local deferred-progress lane
 * of quest formation-ledger-self-move-blocks-cluster-ops (RED-ON-REVERT):
 * under retryable ledger pressure a priority operation advanced LOCALLY
 * (CREATING, ACTIVE for REPLACE, STOPPING) ahead of its durable row.
 *
 * Superseding rule: an operation's step advances only by its committed row.
 * The operation object, the workflow record, the cache and every owner read
 * show a step only after the durable write of that step committed. A
 * retryable write failure defers the TRANSITION: the write is recorded as
 * owed and retried by the transition-retry timer and by every timeout-sweep
 * tick; the retry repeats no effect; the effect is re-sent only when the
 * authoritative replica row shows it did not take. The owed write is
 * bounded by the operation budget (REBALANCE_OPERATION_BUDGET_MS), after
 * which the operation fails with a typed cause.
 *
 * The purpose of the superseded pin is kept and proven here: a ledger whose
 * writes are deferred slows an operation and never strands it - the
 * operation moves on the moment the write commits, with every step in its
 * durable history in order and exactly one effect delivery.
 */
import {test} from '../../src/test-helpers/tap.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {OperationType, ReplicaStatus} from
  '../../src/rebalancer/replica-status.js';
import {ReplicaOperationField} from
  '../../src/rebalancer/replica-operation-constants.js';
import {OPERATION_WORKFLOW_OWNER_SHARED} from
  '../../src/rebalancer/operation-workflow-owner-shared.js';
import {
  LEDGER_WRITE,
  OPERATION_ID,
  createDurableStepWorld,
} from './durable-step-authority-fixture.js';

const {
  OPERATION_WORKFLOW_OWNER_LITERAL,
  REBALANCER_SKIP_REASON,
  TIMEOUT_BUDGET_DEFAULT,
} = OPERATION_WORKFLOW_OWNER_SHARED;

const OPERATION_BUDGET_MS = TIMEOUT_BUDGET_DEFAULT.REBALANCE_OPERATION_BUDGET_MS;
const TICK_MS = 1000;
const OBSERVED_SECONDS = 400;
const BUDGET_SLACK_MS = 5000;
const LEDGER_STALL_MS = 54000;
const PRIORITY_PARTITIONS = Object.freeze([
  'sql_write_operations-p1',
  'replica_operations-p1',
]);

// Run `body` on a clock the test advances; timers are fired by hand.
async function withVirtualClock(body) {
  const realNow = Date.now;
  let offsetMs = 0;
  Date.now = () => realNow() + offsetMs;
  try {
    return await body({
      advance(ms) {
        offsetMs += ms;
      },
      elapsedMs: () => offsetMs,
    });
  } finally {
    Date.now = realNow;
  }
}

// One second of owner life: its timers, then its timeout sweep.
async function tick(world, clock) {
  clock.advance(TICK_MS);
  await world.fireTimers();
  await world.coordinator.checkTimeouts();
  await new Promise((resolve) => setImmediate(resolve));
}

function failWritesOf(step) {
  return (writtenStep) => writtenStep === step ?
    LEDGER_WRITE.FAILS_RETRYABLY :
    LEDGER_WRITE.COMMITS;
}

async function readOwnerViews(world) {
  const repository = world.owner.repository;
  const visibility = await repository.getOperationByIdVisibilityObservation(
    OPERATION_ID,
    {allowPriorityRecoveryDeferredVisibility: true},
  );
  return {
    visibilityRead: visibility?.operation?.workflowStep,
    cacheFirstRead:
      (await repository.queryOperationById(OPERATION_ID))?.workflowStep,
    authoritativeRead:
      (await repository.queryAuthoritativeOperationById(OPERATION_ID))
        ?.workflowStep,
    workflowRecord: world.owner.operationWorkflowCoordinator
      .getWorkflowById(OPERATION_ID)?.step,
  };
}

for (const partitionId of PRIORITY_PARTITIONS) {
  test(`a CREATING write that never commits (${partitionId}): one effect, ` +
    'no step shown anywhere, typed terminal at the operation budget',
  async (t) => {
    await withVirtualClock(async (clock) => {
      const world = createDurableStepWorld({
        partitionId,
        ledgerWrite: failWritesOf(WORKFLOW_STEP.CREATING),
      });
      try {
        const result = await world.coordinator.dispatchOperation(
          {...world.durable});
        world.setTargetService(ReplicaStatus.CREATING);

        t.equal(result.skipped, true, 'the dispatch is not a success');
        t.equal(result.reason, REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING,
          'it is the typed deferral');
        t.equal(result.deferredWorkflowStep, WORKFLOW_STEP.CREATING,
          'naming the step whose write is owed');
        t.same(await readOwnerViews(world), {
          visibilityRead: WORKFLOW_STEP.SENDING,
          cacheFirstRead: WORKFLOW_STEP.SENDING,
          authoritativeRead: WORKFLOW_STEP.SENDING,
          workflowRecord: WORKFLOW_STEP.SENDING,
        }, 'every owner read and the workflow record show the committed step');
        t.equal(
          world.owner.operationWorkflowCoordinator
            .isTransitionIdempotent(OPERATION_ID, WORKFLOW_STEP.CREATING),
          false,
          'the unpersisted step is not marked committed',
        );
        t.ok(world.liveTimers().length >= 1,
          'the deferred transition has a wake: the transition-retry timer');

        let terminalAtMs = null;
        for (let second = 0; second < OBSERVED_SECONDS; second += 1) {
          await tick(world, clock);
          if (world.durable.completed_at !== null) {
            terminalAtMs = clock.elapsedMs();
            break;
          }
        }

        t.equal(world.createDeliveries().length, 1,
          'CREATE_REPLICA is delivered exactly once: a write retry repeats ' +
            'no effect');
        t.ok(
          world.writeAttempts.filter((attempt) =>
            attempt.step === WORKFLOW_STEP.CREATING).length > 1,
          'the write itself was retried',
        );
        t.same(world.refusedCasWrites, [],
          'no write ever expected a step the durable row did not hold');
        t.equal(world.durable.workflow_step, WORKFLOW_STEP.FAILED,
          'the operation ends in a terminal');
        t.match(
          world.durable.error_message,
          new RegExp(`^${OPERATION_WORKFLOW_OWNER_LITERAL.STEP_WRITE_DEFERRED}`,
            'u'),
          'the terminal carries the typed cause',
        );
        t.ok(
          terminalAtMs >= OPERATION_BUDGET_MS - BUDGET_SLACK_MS &&
            terminalAtMs <= OPERATION_BUDGET_MS + BUDGET_SLACK_MS,
          'the terminal comes at the operation budget, not at the durable ' +
            `step's short timeout (observed ${terminalAtMs} ms)`,
        );
      } finally {
        await world.coordinator.shutdown();
      }
    });
  });

  test(`a ledger stall slows the operation and strands nothing (${partitionId})`,
    async (t) => {
      await withVirtualClock(async (clock) => {
        let ledgerStalled = true;
        const world = createDurableStepWorld({
          partitionId,
          ledgerWrite: (step) =>
            ledgerStalled && step !== WORKFLOW_STEP.SENDING ?
              LEDGER_WRITE.FAILS_RETRYABLY :
              LEDGER_WRITE.COMMITS,
        });
        try {
          await world.coordinator.dispatchOperation({...world.durable});
          // The target finishes its work during the stall.
          world.setTargetService(ReplicaStatus.ACTIVE);
          while (clock.elapsedMs() < LEDGER_STALL_MS) {
            await tick(world, clock);
          }
          t.equal(world.durable.workflow_step, WORKFLOW_STEP.SENDING,
            'during the stall the row and the owner stay at SENDING');
          t.equal(world.durable.completed_at, null,
            'a stall longer than the SENDING step timeout does not fail ' +
              'the operation');

          ledgerStalled = false;
          await tick(world, clock);
          await tick(world, clock);

          t.equal(world.durable.workflow_step, WORKFLOW_STEP.ACTIVE,
            'the operation completes as soon as the ledger accepts writes');
          t.not(world.durable.completed_at, null, 'and is terminal');
          t.equal(world.createDeliveries().length, 1,
            'with exactly one CREATE_REPLICA delivery');
          t.same(world.refusedCasWrites, [],
            'and no refused expected-step write');
          const history = world.durableHistorySteps();
          t.same(
            history.filter((step, index) => history.indexOf(step) === index),
            [
              WORKFLOW_STEP.PENDING,
              WORKFLOW_STEP.SENDING,
              WORKFLOW_STEP.CREATING,
              WORKFLOW_STEP.ACTIVE,
            ],
            'the owed CREATING step is in the durable history, in order, ' +
              'before the terminal',
          );
        } finally {
          await world.coordinator.shutdown();
        }
      });
    });
}

test('later evidence never writes past an owed step: the row catches up in ' +
  'order and no expected-step write is refused', async (t) => {
  await withVirtualClock(async (clock) => {
    let ledgerStalled = true;
    const world = createDurableStepWorld({
      ledgerWrite: (step) =>
        ledgerStalled && step !== WORKFLOW_STEP.SENDING ?
          LEDGER_WRITE.FAILS_RETRYABLY :
          LEDGER_WRITE.COMMITS,
    });
    try {
      await world.coordinator.dispatchOperation({...world.durable});
      world.setTargetService(ReplicaStatus.SYNCING, 'learner');
      await tick(world, clock);
      await tick(world, clock);

      t.same(
        [...new Set(world.writeAttempts
          .filter((attempt) => attempt.step !== WORKFLOW_STEP.SENDING)
          .map((attempt) => `${attempt.expectedStep}->${attempt.step}`))],
        [`${WORKFLOW_STEP.SENDING}->${WORKFLOW_STEP.CREATING}`],
        'while CREATING is owed only the CREATING write is attempted, ' +
          'although the target already reports SYNCING',
      );

      ledgerStalled = false;
      await tick(world, clock);
      await tick(world, clock);

      t.equal(world.durable.workflow_step, WORKFLOW_STEP.SYNCING,
        'the row reaches SYNCING once writes commit');
      t.same(world.durableHistorySteps().slice(-2),
        [WORKFLOW_STEP.CREATING, WORKFLOW_STEP.SYNCING],
        'through CREATING, in order');
      t.same(world.refusedCasWrites, [],
        'the refused expected-step write can no longer occur');
      t.equal(world.createDeliveries().length, 1, 'one effect delivery');
    } finally {
      await world.coordinator.shutdown();
    }
  });
});

test('an owner restart, a second coordinator and the node-side admission ' +
  'key all decide from the committed row', async (t) => {
  await withVirtualClock(async (clock) => {
    let ledgerStalled = true;
    const world = createDurableStepWorld({
      ledgerWrite: (step) =>
        ledgerStalled && step === WORKFLOW_STEP.CREATING ?
          LEDGER_WRITE.FAILS_RETRYABLY :
          LEDGER_WRITE.COMMITS,
    });
    const firstCoordinator = world.coordinator;
    try {
      await firstCoordinator.dispatchOperation({...world.durable});
      const committedUpdatedAt = world.durable.updated_at;
      await firstCoordinator.shutdown();

      // A fresh owner has no memory of the deferral; the durable row is all
      // it reads. The create is not visible in authority, so its sweep
      // re-drives the effect, and the request carries the committed row's
      // admission key.
      world.startCoordinator();
      t.equal(world.owner.deferredStepWriteByOperationId.size, 0,
        'nothing volatile survives the restart');
      await tick(world, clock);
      t.equal(world.durable.workflow_step, WORKFLOW_STEP.SENDING,
        'the restarted owner decides from the committed SENDING row');
      t.equal(world.durable.completed_at, null, 'and does not fail it');
      t.equal(world.createDeliveries().length, 2,
        'with no authoritative target row the create is re-driven once');
      t.equal(
        world.createDeliveries()[1].request[
          ReplicaOperationField.CREATE_ADMISSION_WORKFLOW_UPDATED_AT],
        committedUpdatedAt,
        'the node-side admission CAS is keyed on the committed SENDING ' +
          'row\'s updated_at',
      );
      await tick(world, clock);
      t.equal(world.createDeliveries().length, 2,
        'the still-owed CREATING write is retried without another create');

      // Once authority shows the target creating, a wake writes the step and
      // sends nothing.
      ledgerStalled = false;
      world.setTargetService(ReplicaStatus.CREATING);
      await world.coordinator.dispatchOperation({...world.durable});
      t.equal(world.durable.workflow_step, WORKFLOW_STEP.CREATING,
        'the committed row advances to CREATING');
      t.equal(world.createDeliveries().length, 2,
        'without another CREATE_REPLICA');
      t.same(world.refusedCasWrites, [], 'and without a refused write');
    } finally {
      await world.coordinator.shutdown();
    }
  });
});

const STEP_CASES = Object.freeze([
  {
    name: 'CREATING of an ADD',
    type: OperationType.ADD,
    durableSteps: [WORKFLOW_STEP.PENDING, WORKFLOW_STEP.SENDING],
    step: WORKFLOW_STEP.CREATING,
  },
  {
    name: 'SYNCING of an ADD',
    type: OperationType.ADD,
    durableSteps: [
      WORKFLOW_STEP.PENDING, WORKFLOW_STEP.SENDING, WORKFLOW_STEP.CREATING,
    ],
    step: WORKFLOW_STEP.SYNCING,
  },
  {
    name: 'ACTIVE of a REPLACE',
    type: OperationType.REPLACE,
    durableSteps: [
      WORKFLOW_STEP.PENDING, WORKFLOW_STEP.SENDING, WORKFLOW_STEP.CREATING,
      WORKFLOW_STEP.SYNCING,
    ],
    step: WORKFLOW_STEP.ACTIVE,
  },
  {
    name: 'STOPPING of a REMOVE',
    type: OperationType.REMOVE,
    durableSteps: [WORKFLOW_STEP.PENDING, WORKFLOW_STEP.SENDING],
    step: WORKFLOW_STEP.STOPPING,
  },
]);

for (const stepCase of STEP_CASES) {
  test(`${stepCase.name}: a retryable write failure advances nothing, owes ` +
    'the write, and ends typed at the operation budget', async (t) => {
    await withVirtualClock(async (clock) => {
      const world = createDurableStepWorld({
        type: stepCase.type,
        durableSteps: stepCase.durableSteps,
        ledgerWrite: failWritesOf(stepCase.step),
      });
      const durableStep = stepCase.durableSteps.at(-1);
      try {
        const operation = world.durableOperation();
        await t.rejects(
          world.owner.updateStep(operation, stepCase.step),
          'the failed write surfaces to the caller',
        );
        t.equal(operation.workflowStep, durableStep,
          'the operation object stays at the committed step');
        t.equal(
          (await readOwnerViews(world)).workflowRecord,
          durableStep,
          'the workflow record stays at the committed step',
        );
        t.equal(
          world.owner.deferredStepWriteByOperationId.get(OPERATION_ID)?.step,
          stepCase.step,
          'the write is recorded as owed',
        );
        t.ok(world.liveTimers().length >= 1,
          'the transition-retry timer is its wake');

        clock.advance(OPERATION_BUDGET_MS);
        await world.owner.reconcileTimeoutOperation(
          world.durableOperation(),
          Date.now(),
        );

        t.equal(world.durable.workflow_step, WORKFLOW_STEP.FAILED,
          'a write that never commits ends in a terminal at the budget');
        t.match(
          world.durable.error_message,
          new RegExp(`^${OPERATION_WORKFLOW_OWNER_LITERAL.STEP_WRITE_DEFERRED}`,
            'u'),
          'with the typed cause',
        );
        t.same(world.deliveries, [], 'no effect was sent by any retry');
      } finally {
        await world.coordinator.shutdown();
      }
    });
  });

  test(`${stepCase.name}: the owed write commits on its retry`, async (t) => {
    let ledgerStalled = true;
    const world = createDurableStepWorld({
      type: stepCase.type,
      durableSteps: stepCase.durableSteps,
      ledgerWrite: (step) => ledgerStalled && step === stepCase.step ?
        LEDGER_WRITE.FAILS_RETRYABLY :
        LEDGER_WRITE.COMMITS,
    });
    try {
      await t.rejects(
        world.owner.updateStep(world.durableOperation(), stepCase.step));
      ledgerStalled = false;
      await world.fireTimers();

      t.ok(
        world.durableHistorySteps().includes(stepCase.step),
        'the retry timer alone commits the owed step',
      );
      t.same(world.refusedCasWrites, [], 'with no refused write');
      t.equal(world.owner.deferredStepWriteByOperationId.size, 0,
        'and the write is no longer owed');
    } finally {
      await world.coordinator.shutdown();
    }
  });
}

test('an execute does not repeat the effect of an owed step unless ' +
  'authority shows it did not take', async (t) => {
  const world = createDurableStepWorld({
    durableSteps: [WORKFLOW_STEP.PENDING, WORKFLOW_STEP.SENDING],
    ledgerWrite: failWritesOf(WORKFLOW_STEP.CREATING),
  });
  try {
    await t.rejects(
      world.owner.updateStep(world.durableOperation(), WORKFLOW_STEP.CREATING));

    world.setTargetService(ReplicaStatus.CREATING);
    const skipped = await world.owner.executeOperationInternal(
      world.durableOperation());
    t.equal(skipped.reason, REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING,
      'with the target authoritatively creating the execute is a typed skip');
    t.same(world.deliveries, [], 'and sends nothing');

    world.setTargetService(null);
    const redriven = await world.owner.executeOperationInternal(
      world.durableOperation()).catch((error) => error);
    t.equal(world.createDeliveries().length, 1,
      'with no authoritative target row the create is re-driven');
    t.not(redriven?.success, true,
      'and is still not a success while its step is not durable');
  } finally {
    await world.coordinator.shutdown();
  }
});

test('a step write typed permanent fails the operation at once', async (t) => {
  const world = createDurableStepWorld({
    durableSteps: [WORKFLOW_STEP.PENDING, WORKFLOW_STEP.SENDING],
    ledgerWrite: (step) => step === WORKFLOW_STEP.CREATING ?
      LEDGER_WRITE.FAILS_PERMANENTLY :
      LEDGER_WRITE.COMMITS,
  });
  try {
    await t.rejects(
      world.owner.updateStep(world.durableOperation(), WORKFLOW_STEP.CREATING));
    t.equal(world.durable.workflow_step, WORKFLOW_STEP.FAILED,
      'the operation is failed, not retried');
    t.equal(world.owner.deferredStepWriteByOperationId.size, 0,
      'no write is owed for a permanent failure');
  } finally {
    await world.coordinator.shutdown();
  }
});
