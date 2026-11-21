// S11: the user group is real rs-raft; the operation ledger is file-backed
// native committed apply. The fixture controls ledger transport and CDC.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';
import {requestPlacementAdmission} from '../../src/partition/partition-placement-admission.js';
import {ensureDispatchReservationOrSkip} from
  '../../src/rebalancer/operation-workflow-dispatch-reservation-gate.js';
import {OPERATION_RESERVATION_ATTEMPT_OUTCOME} from
  '../../src/rebalancer/operation-reservation-attempt-outcome.js';
import {ReplicaOperationResponseStatus} from '../../src/rebalancer/replica-operation-constants.js';
import {REPLICA_OPERATION_UPDATE_DISPOSITION as DISPOSITION} from
  '../../src/rebalancer/replica-operation-update-disposition.js';
import {PLACEMENT_REFUSAL} from '../../src/rebalancer/replica-placement-owner-constants.js';
import {classifyPlacementClass} from '../../src/rebalancer/replica-placement-owner-order.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {placementStatement} from '../partition/placement-admission-fixture.js';
import {stepRetainedLedgerRow} from '../partition/placement-retained-row-repair-fixture.js';
import {clearFixtureSingletons, resetFixtureSingletons} from
  '../test-helpers/participant-transaction-fixture.js';
import {withNativeLedgerReplace, HISTORICAL_ID, effectViolations, EFFECT_WHILE_LIVE} from
  './replace-real-group-native-ledger-fixture.js';
import {driveToIntent, NODE, readPersisted, settleTurns} from './replace-real-group-harness.js';

const RESEND_OFFSET_MS = 61_000;
const HISTORICAL_SQL = 'SELECT * FROM replica_operations WHERE operation_id = ?';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

async function reachTargetLeadership(world) {
  world.eventsSuppressed = true;
  await world.coordinator.executeOperation(await readPersisted(world));
  await settleTurns();
  world.group.settle(() => world.group.leader() === world.targetReplicaId);
  await settleTurns();
  assert.equal((await readPersisted(world)).workflowStep, WORKFLOW_STEP.ACTIVE);
}

async function invokeRemovalOwner(world, step) {
  const current = await readPersisted(world);
  assert.equal(current.workflowStep, step);
  if (step === WORKFLOW_STEP.ACTIVE) await world.coordinator.executeOperation(current);
  else await world.coordinator.reconcileOperationLifecycle(current);
  await settleTurns();
}

async function restoreHistoricalFixtureRow(ledger, historicalRow) {
  assert.equal(ledger.leader.db.prepare(HISTORICAL_SQL).get(HISTORICAL_ID), undefined);
  const inserted = await ledger.gateway.submitMutation({
    tableName: 'replica_operations', operation: 'insert', row: historicalRow,
  });
  assert.equal(inserted.partitionResult.affectedRows, 1);
}

async function exerciseExistingWake(world) {
  const timer = world.coordinator.workflowOwner.safetyDeferredRetryTimerByOperationId
    .get(world.operation.operationId);
  assert.ok(timer && !timer.cleared, 'the real deferred safety owner registered a wake');
  await timer.fn();
  await settleTurns();
}

async function trySupportedProducer(kind, {world, ledger, holder, retained}) {
  if (kind === 'ordinary birth') {
    const answer = await requestPlacementAdmission(ledger.leader, {
      entryId: 'native-s11-competing-birth', body: placementStatement({
        partitionId: world.partitionId, type: OperationType.REPLACE,
        target: NODE.PEER_C, source: NODE.SOURCE, sourceReplicaId: world.sourceReplicaId,
        placementClass: classifyPlacementClass(world.partitionId),
      }),
    });
    assert.equal(answer.placementResult.reason, PLACEMENT_REFUSAL.PARTITION_BUSY);
    assert.deepEqual(answer.placementResult.operationIds, [world.operation.operationId]);
  } else if (kind === 'zero-update repair') {
    const repair = await holder.repository.persistOperationUpdate(retained,
      {expectedWorkflowStep: WORKFLOW_STEP.PENDING});
    assert.equal(repair.disposition, DISPOSITION.REFUSED);
  } else {
    // Engage the real dispatch reservation gate with its existing-reservation
    // prerequisite. Its ledger proposal and refusal still traverse native apply.
    const owner = holder.workflowOwner;
    owner.hasStorageReservationSupport = () => true;
    owner.ensureReservationForOperation = async () => ({
      outcome: OPERATION_RESERVATION_ATTEMPT_OUTCOME.ALREADY_ACTIVE,
    });
    assert.ok(await ensureDispatchReservationOrSkip(owner, retained),
      'an existing reservation cannot override native refusal');
  }
}

for (const producer of ['no contender', 'ordinary birth', 'zero-update repair',
  'ACTIVE-reservation repair', 'private raw bypass']) {
  test(`S11 real ledger after SAFE: ${producer}`, () => withNativeLedgerReplace(
    async (context) => {
      const {world, ledger, historicalRow, observation} = context;
      await reachTargetLeadership(world);
      const owner = world.coordinator.workflowOwner;
      const evaluate = owner.evaluateRemoveSafety.bind(owner);
      let safeEdges = 0;
      owner.evaluateRemoveSafety = async (operation) => {
        const evaluation = await evaluate(operation);
        if (evaluation.error || safeEdges > 0) return evaluation;
        safeEdges += 1;
        if (producer === 'private raw bypass') {
          // The unsupported historical producer is precisely the deliberate
          // after-SAFE mutation whose original integrity assertion failed.
          await restoreHistoricalFixtureRow(ledger, historicalRow);
        } else if (producer !== 'no contender') {
          await trySupportedProducer(producer, context);
        }
        const visible = observation.readCommitted(HISTORICAL_ID);
        assert.equal(Boolean(visible), producer === 'private raw bypass',
          'the independent SQLite reader observes the actual apply boundary');
        assert.equal(world.cache.get('replica_operations', HISTORICAL_ID), undefined,
          'the historical CDC event has not reached the incumbent');
        return evaluation;
      };
      await invokeRemovalOwner(world, WORKFLOW_STEP.ACTIVE);
      assert.equal(safeEdges, 1, 'the incumbent reached the authoritative SAFE edge');
      assert.equal(world.removeEffects.length, 1, 'one exact real removal reached the source');
      if (producer === 'private raw bypass') {
        assert.deepEqual(effectViolations(observation), [{
          kind: EFFECT_WHILE_LIVE, operationId: world.operation.operationId,
          replicaId: world.sourceReplicaId, liveCompetitor: HISTORICAL_ID,
        }], 'the same integrity oracle rejects the physically engaged raw negative');
      } else {
        assert.deepEqual(effectViolations(observation), [],
          'no removal crosses the source while an exact committed contender is live');
      }
      if (producer.endsWith('repair')) {
        assert.equal(ledger.coordinator.repository.retainedPlacementRepairs.size, 1,
          'the actual ledger owner retains the original contender identity');
      }
      assert.equal(observation.effects.length, world.removeEffects.length);
    }, {historicalType: producer === 'ACTIVE-reservation repair' ?
      OperationType.ADD : OperationType.REMOVE}));
}

for (const step of [WORKFLOW_STEP.ACTIVE, WORKFLOW_STEP.STOPPING]) {
  test(`S11 reconstructed historical holder with withheld CDC blocks ${step}`,
    () => withNativeLedgerReplace(async ({world, ledger, observation, historicalRow}) => {
      const isResend = step === WORKFLOW_STEP.STOPPING;
      if (isResend) {
        world.removeEffectAnswer = {status: ReplicaOperationResponseStatus.INITIATED};
        await driveToIntent(world);
        world.eventsSuppressed = true;
        world.clockOffsetMs += RESEND_OFFSET_MS;
      } else {
        await reachTargetLeadership(world);
      }
      const previousEffects = isResend ? 1 : 0;
      assert.equal(observation.effects.length, previousEffects);
      // Reconstruct a row actually produced by the earlier operation owner
      // before this arbitration. Keep its CDC stream withheld.
      await restoreHistoricalFixtureRow(ledger, historicalRow);
      assert.equal(observation.readCommitted(HISTORICAL_ID)?.workflow_step, WORKFLOW_STEP.PENDING);
      assert.equal(world.cache.get('replica_operations', HISTORICAL_ID), undefined);
      await invokeRemovalOwner(world, step);
      assert.equal(observation.effects.length, previousEffects,
        'the live committed contender inhibits the removal even without CDC');
      assert.deepEqual(effectViolations(observation), []);
      const released = await stepRetainedLedgerRow(ledger, HISTORICAL_ID, WORKFLOW_STEP.FAILED);
      assert.equal(observation.readCommitted(HISTORICAL_ID)?.completed_at, released.completed_at);
      world.cache.observeRemoteRow('replica_operations', released);
      await exerciseExistingWake(world);
      assert.equal(observation.effects.length, previousEffects + 1,
        'the exact committed release permits the existing owner to progress once');
      assert.equal(world.removeEffects.length, observation.effects.length);
      assert.deepEqual(effectViolations(observation), []);
    }, {clockOffsetMs: step === WORKFLOW_STEP.STOPPING ? RESEND_OFFSET_MS : 0}));
}

test('S11 unavailable authoritative ledger inhibits REMOVE until its existing wake',
  () => withNativeLedgerReplace(async ({world, observation}) => {
    await reachTargetLeadership(world);
    observation.unavailable = true;
    await invokeRemovalOwner(world, WORKFLOW_STEP.ACTIVE);
    assert.ok(observation.refusedReads > 0, 'the required ledger read actually failed');
    assert.equal(observation.effects.length, 0);
    observation.unavailable = false;
    await exerciseExistingWake(world);
    assert.equal(observation.effects.length, 1, 'the original owner resumes on its registered wake');
    assert.deepEqual(effectViolations(observation), []);
  }));
