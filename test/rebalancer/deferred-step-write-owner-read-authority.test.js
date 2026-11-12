/**
 * An owed step write (the effect happened, its step write failed
 * retryably) is discharged only by authoritative evidence: a confirmed
 * absence, a terminal row, a row owned elsewhere, or a row already at or
 * past the owed step. A failed owner read is unavailability: the debt and
 * its retry survive it whether the local cache projects the row or not, and
 * the step commits once the owner answers. The CREATE sender refresh under
 * the same unavailable read neither re-sends nor completes from a
 * projection; it defers retryably.
 *
 * The failure is injected at the replica_operations read port of a real
 * RebalanceCoordinator; the repository observation methods and the retry
 * consumer run unmodified.
 */
import {test} from '../../src/test-helpers/tap.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {OperationType, ReplicaStatus} from
  '../../src/rebalancer/replica-status.js';
import {
  CACHE_PROJECTION,
  LEDGER_WRITE,
  OPERATION_ID,
  OWNER_READ,
  createDurableStepWorld,
} from './durable-step-authority-fixture.js';

const OWED_STEP = WORKFLOW_STEP.CREATING;
const DURABLE_STEPS = Object.freeze([
  WORKFLOW_STEP.PENDING,
  WORKFLOW_STEP.SENDING,
]);
const CREATE_ADMISSION_TUPLE = Object.freeze({
  createAdmissionState: 'ADMITTED',
  createAdmissionToken: 'create-admission-token',
  createAdmissionReplicaCreatedAt: 1,
  createAdmissionAttemptToken: 'create-admission-attempt-token',
  createAdmissionAttemptSeq: 1,
  createAdmissionWorkflowUpdatedAt: 1,
  createAdmissionOwnerIncarnation: 1,
});

// A world whose CREATING write failed retryably after its effect: the
// write is owed and its transition retry is armed.
async function owedCreatingWorld(t) {
  let ledgerStalled = true;
  const world = createDurableStepWorld({
    durableSteps: DURABLE_STEPS,
    ledgerWrite: (step) => ledgerStalled && step === OWED_STEP ?
      LEDGER_WRITE.FAILS_RETRYABLY :
      LEDGER_WRITE.COMMITS,
  });
  world.releaseLedger = () => {
    ledgerStalled = false;
  };
  await t.rejects(
    world.owner.updateStep(world.durableOperation(), OWED_STEP),
    'the step write fails retryably after its effect',
  );
  t.equal(
    world.owner.deferredStepWriteByOperationId.get(OPERATION_ID)?.step,
    OWED_STEP,
    'the write is owed',
  );
  return world;
}

function owedWrites(world) {
  return world.writeAttempts.filter((attempt) => attempt.step === OWED_STEP);
}

function isRetryArmed(world) {
  return world.owner.transitionRetryTimerByOperationId.has(OPERATION_ID);
}

async function assertDebtSurvivesUnavailableRead(t, world) {
  const writesBefore = owedWrites(world).length;
  world.ownerRead = OWNER_READ.UNAVAILABLE;
  await world.fireTimers();
  t.ok(world.unavailableOwnerReads > 0,
    'the retry read the owner and the read failed');
  t.equal(
    world.owner.deferredStepWriteByOperationId.get(OPERATION_ID)?.step,
    OWED_STEP,
    'the owed write survives the unavailable read',
  );
  t.ok(isRetryArmed(world), 'and its retry stays armed');
  t.equal(owedWrites(world).length, writesBefore,
    'nothing is written on an unavailable read');
  t.equal(world.durable.workflow_step, WORKFLOW_STEP.SENDING,
    'the durable row is unchanged');
}

for (const cacheProjection of Object.values(CACHE_PROJECTION)) {
  test(`W1 (${cacheProjection} cache): an unavailable owner read retains ` +
    'the owed write; the restored owner commits it', async (t) => {
    const world = await owedCreatingWorld(t);
    try {
      world.cacheProjection = cacheProjection;
      await assertDebtSurvivesUnavailableRead(t, world);

      world.ownerRead = OWNER_READ.AVAILABLE;
      world.releaseLedger();
      await world.fireTimers();

      t.equal(world.durable.workflow_step, OWED_STEP,
        'the restored owner commits the owed step');
      t.equal(world.owner.deferredStepWriteByOperationId.size, 0,
        'and the write is no longer owed');
      t.equal(world.durable.completed_at, null, 'no completion is invented');
      t.same(world.deliveries, [], 'no effect is repeated');
      t.same(world.refusedCasWrites, [], 'no write is refused');
    } finally {
      await world.coordinator.shutdown();
    }
  });
}

test('W2: a confirmed absence from the owner discharges the owed write',
  async (t) => {
    const world = await owedCreatingWorld(t);
    try {
      await assertDebtSurvivesUnavailableRead(t, world);
      const writesBefore = owedWrites(world).length;
      world.ownerRead = OWNER_READ.ABSENT;
      await world.fireTimers();
      t.equal(world.owner.deferredStepWriteByOperationId.size, 0,
        'the confirmed absence discharges the debt');
      t.notOk(isRetryArmed(world), 'and clears its retry');
      t.equal(owedWrites(world).length, writesBefore, 'without a write');
      t.same(world.deliveries, [], 'or an effect');
    } finally {
      await world.coordinator.shutdown();
    }
  });

test('W3: an authoritative row already past the owed step discharges it',
  async (t) => {
    const world = await owedCreatingWorld(t);
    try {
      await assertDebtSurvivesUnavailableRead(t, world);
      const writesBefore = owedWrites(world).length;
      world.durable.workflow_step = WORKFLOW_STEP.SYNCING;
      world.ownerRead = OWNER_READ.AVAILABLE;
      await world.fireTimers();
      t.equal(world.owner.deferredStepWriteByOperationId.size, 0,
        'a row past the owed step discharges the debt');
      t.equal(owedWrites(world).length, writesBefore,
        'without writing the older step over it');
      t.equal(world.durable.workflow_step, WORKFLOW_STEP.SYNCING,
        'the row keeps its step');
    } finally {
      await world.coordinator.shutdown();
    }
  });

test('W4: an authoritative terminal row discharges the owed write',
  async (t) => {
    const world = await owedCreatingWorld(t);
    try {
      await assertDebtSurvivesUnavailableRead(t, world);
      const writesBefore = owedWrites(world).length;
      world.durable.workflow_step = WORKFLOW_STEP.FAILED;
      world.durable.status = ReplicaStatus.FAILED;
      world.durable.completed_at = Date.now();
      world.ownerRead = OWNER_READ.AVAILABLE;
      await world.fireTimers();
      t.equal(world.owner.deferredStepWriteByOperationId.size, 0,
        'the terminal row discharges the debt');
      t.equal(owedWrites(world).length, writesBefore, 'without a write');
      t.equal(world.durable.workflow_step, WORKFLOW_STEP.FAILED,
        'the terminal is untouched');
    } finally {
      await world.coordinator.shutdown();
    }
  });

for (const cacheProjection of Object.values(CACHE_PROJECTION)) {
  test(`W5 (${cacheProjection} cache): the CREATE sender refresh under an ` +
    'unavailable owner read neither re-sends nor completes', async (t) => {
    const world = createDurableStepWorld({
      durableSteps: [...DURABLE_STEPS, WORKFLOW_STEP.CREATING],
    });
    try {
      world.cacheProjection = cacheProjection;
      world.ownerRead = OWNER_READ.UNAVAILABLE;
      const operation = {
        ...world.durableOperation(),
        ...CREATE_ADMISSION_TUPLE,
      };
      const outcome = await world.owner.executeOperationInternal(operation)
        .then((result) => ({result}), (error) => ({error}));
      t.equal(world.createDeliveries().length, 0,
        'no CREATE_REPLICA is sent on the strength of a local copy');
      t.equal(world.durable.completed_at, null, 'nothing is completed');
      t.equal(world.durable.workflow_step, WORKFLOW_STEP.CREATING,
        'the durable row is unchanged');
      t.equal(outcome.result?.success === true, false,
        'the dispatch is not a success');
      t.equal(outcome.error?.deferRetry, true,
        'it defers retryably on the unavailable owner read');
    } finally {
      await world.coordinator.shutdown();
    }
  });
}

test('W6: a REPLACE STOPPING intent whose write fails is never owed, so ' +
  'no retry commits it without the owner re-admitting it',
async (t) => {
  const world = createDurableStepWorld({
    type: OperationType.REPLACE,
    durableSteps: [
      WORKFLOW_STEP.PENDING, WORKFLOW_STEP.SENDING, WORKFLOW_STEP.CREATING,
      WORKFLOW_STEP.SYNCING, WORKFLOW_STEP.ACTIVE,
    ],
    ledgerWrite: (step) => step === WORKFLOW_STEP.STOPPING ?
      LEDGER_WRITE.FAILS_RETRYABLY :
      LEDGER_WRITE.COMMITS,
  });
  try {
    await t.rejects(
      world.owner.updateStep(world.durableOperation(), WORKFLOW_STEP.STOPPING),
      'the intent write fails retryably',
    );
    t.notOk(world.owner.deferredStepWriteByOperationId.has(OPERATION_ID),
      'the intent precedes its effect: no step write is owed');
    t.ok(isRetryArmed(world), 'the transition is retried');
  } finally {
    await world.coordinator.shutdown();
  }
});
