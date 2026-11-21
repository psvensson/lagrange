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
import {PLACEMENT_REFUSAL, PLACEMENT_TRIGGER} from
  '../../src/rebalancer/replica-placement-owner-constants.js';
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

function committedRepairCount(ledger) {
  return ledger.commands.filter(({type}) => type === 'PLACEMENT_REPAIR').length;
}

async function settleRetainedOwner(ledger, holder) {
  await settleTurns();
  await holder.repository.retainedPlacementRepairDrain;
  await ledger.coordinator.repository.retainedPlacementRepairDrain;
  await settleTurns();
}

function holdPlacementProposals(ledger) {
  const port = ledger.leader.controllablePort;
  const forward = port.proposeHandler;
  const gates = new Map(['PLACEMENT_ADMIT', 'PLACEMENT_REPAIR'].map((type) =>
    [type, {release: Promise.withResolvers(), pending: []}]));
  port.setProposeHandler((command) => {
    const gate = gates.get(command.type);
    if (!gate) return forward(command);
    const delivery = gate.release.promise.then(() => forward(command));
    gate.pending.push({command, delivery});
    return delivery;
  });
  return {
    pending: (type) => gates.get(type)?.pending ?? [],
    async release(type) {
      const gate = gates.get(type);
      if (!gate) return;
      gates.delete(type);
      gate.release.resolve();
      await Promise.all(gate.pending.map(({delivery}) => delivery));
    },
    async close() {
      port.setProposeHandler(forward);
      await Promise.all([...gates.keys()].map((type) => this.release(type)));
    },
  };
}

function stageOrdinaryAdmission({world, ledger}) {
  const request = {
    entryId: 'native-s11-racing-ordinary',
    body: placementStatement({partitionId: world.partitionId, type: OperationType.REPLACE,
      target: NODE.PEER_C, source: NODE.SOURCE, sourceReplicaId: world.sourceReplicaId,
      placementClass: classifyPlacementClass(world.partitionId)}),
  };
  const release = Promise.withResolvers();
  const settlement = release.promise.then(() => requestPlacementAdmission(ledger.leader, request));
  return {
    request,
    release() {
      release.resolve();
      return settlement;
    },
  };
}

function committedPlacementResult(observation, command) {
  const record = observation.readPlacementOutcome(command);
  assert.equal(record.state, 'settled');
  return JSON.parse(record.ownerResultText);
}

function committedOrdinaryResult(observation, commands, request, answer) {
  const command = commands.find(({entryId}) => entryId === request.entryId);
  assert.ok(command, 'the exact staged ordinary request reaches native apply');
  assert.equal(command.type, 'PLACEMENT_ADMIT');
  assert.deepEqual(command.body, request.body);
  const record = observation.readPlacementOutcome(command);
  assert.equal(record.state, 'settled');
  const result = JSON.parse(record.ownerResultText);
  assert.equal(answer.committed, true);
  assert.equal(answer.logIndex, record.logIndex);
  assert.equal(answer.term, record.term);
  assert.deepEqual(answer.placementResult, result);
  return result;
}

function assertDebtIdentity(debt, retained, leader) {
  assert.equal(debt.operation.operationId, retained.operationId);
  assert.equal(debt.operation.replicaId, retained.replicaId);
  assert.equal(debt.operation.createdAt, retained.createdAt);
  assert.deepEqual(debt.expectedOwner, {nodeId: leader.nodeId, replicaId: leader.replicaId});
}

function assertBoundDebt(context, row, {delegationAllowed}) {
  const {ledger, holder, retained} = context;
  const repositories = [holder.repository, ledger.coordinator.repository];
  const blocker = {operationId: row.operation_id, createdAt: row.created_at,
    workflowStep: row.workflow_step, completedAt: row.completed_at};
  for (const repository of repositories) {
    const debt = repository.retainedPlacementRepairs.get(retained.operationId);
    assert.ok(debt, 'each repository retains a bound obligation');
    assertDebtIdentity(debt, retained, ledger.leader);
    assert.deepEqual(debt.blockers, [blocker]);
    assert.equal(debt.clearingTrigger, PLACEMENT_TRIGGER.LEDGER_COMMIT);
    if (debt.delegated) {
      assert.ok(delegationAllowed && repository === holder.repository);
      const receiver = ledger.coordinator.repository.retainedPlacementRepairs
        .get(retained.operationId);
      assert.equal(debt.delegated.entryId, receiver.entryId);
      assert.equal(debt.delegated.bodyText, JSON.stringify(receiver.body));
      assert.equal(debt.delegated.operationId, retained.operationId);
      assert.equal(debt.delegated.createdAt, retained.createdAt);
    }
  }
}

async function assertRenewedDebt(context, row) {
  const {ledger, holder} = context;
  const before = committedRepairCount(ledger);
  assertBoundDebt(context, row, {delegationAllowed: false});
  holder.repository.observeRetainedPlacementRepairCommit('replica_operations', row);
  ledger.coordinator.repository.observeRetainedPlacementRepairCommit('replica_operations', row);
  await settleRetainedOwner(ledger, holder);
  assert.equal(committedRepairCount(ledger), before,
    'an unchanged commit for the new blocker preserves the release wake');
}

function confirmFreshObservation(context, incumbent) {
  const {ledger, observation, repairAnswers, retained} = context;
  assert.equal(committedRepairCount(ledger), 0);
  assert.equal(repairAnswers.length, 1, 'fresh sender crosses the real wire exactly once');
  const [{payload, answer}] = repairAnswers;
  const observed = answer.retainedRepairObservation;
  assert.equal(answer.committed, undefined);
  assert.equal(answer.placementResult, undefined);
  assert.equal(observed.state, 'contended');
  assert.equal(observed.entryId, payload.entryId);
  assert.equal(observed.bodyText, JSON.stringify(payload.body));
  assert.equal(observed.operationId, retained.operationId);
  assert.equal(observed.createdAt, retained.createdAt);
  assert.equal(observed.nodeId, ledger.leader.nodeId);
  assert.equal(observed.replicaId, ledger.leader.replicaId);
  assert.equal(observed.result.reason, PLACEMENT_REFUSAL.PARTITION_BUSY);
  assert.deepEqual(observed.result.operationIds, [incumbent.operation_id]);
  assert.notEqual(observation.readPlacementOutcome(payload).state, 'settled');
  assertBoundDebt(context, incumbent, {delegationAllowed: true});
}

async function confirmOrdinaryFirst(context, postRelease, ordinary, answer, diagnostic) {
  const {world, observation, retained} = context;
  const repair = postRelease.find(({type}) => type === 'PLACEMENT_REPAIR');
  assert.ok(repair);
  const beforeRepair = postRelease.slice(0, postRelease.indexOf(repair));
  const admissions = beforeRepair.filter(({type}) => type === 'PLACEMENT_ADMIT')
    .map((command) => ({command, result: committedPlacementResult(observation, command)}))
    .filter(({result}) => result.outcome === 'ADMITTED');
  assert.equal(admissions.length, 1);
  const [{command, result}] = admissions;
  const [winner] = result.operationIds;
  assert.notEqual(winner, world.operation.operationId, 'the winner is freshly admitted');
  const winnerRow = observation.readCommitted(winner);
  assert.equal(winnerRow?.completed_at, null);
  assert.equal(winnerRow.entity_id, command.body.partitionId);
  assert.equal(winnerRow.target_node_id, command.body.moves[0].targetNodeId);
  const explicit = committedOrdinaryResult(observation, beforeRepair, ordinary.request, answer);
  if (command.entryId === ordinary.request.entryId) {
    assert.deepEqual(explicit, result);
  } else {
    diagnostic(`Autonomous ordinary admission ${command.entryId} won as ${winner}.`);
    assert.equal(explicit.reason, PLACEMENT_REFUSAL.PARTITION_BUSY);
    assert.deepEqual(explicit.operationIds, [winner]);
  }
  const renewed = committedPlacementResult(observation, repair);
  assert.equal(renewed.reason, PLACEMENT_REFUSAL.PARTITION_BUSY);
  assert.deepEqual(renewed.operationIds, [winner],
    'the native retry names the fresh live holder');
  assert.equal(observation.readCommitted(retained.operationId), undefined);
  await assertRenewedDebt(context, winnerRow);
}

async function confirmRestoredDebt(context, restored) {
  const {ledger, holder, retained} = context;
  const before = committedRepairCount(ledger);
  const repositories = [holder.repository, ledger.coordinator.repository];
  for (const repository of repositories) {
    const debt = repository.retainedPlacementRepairs.get(retained.operationId);
    if (debt) {
      assertDebtIdentity(debt, retained, ledger.leader);
      assert.ok(debt.delegated, 'remaining custody has a named native receiver');
      assert.deepEqual({nodeId: debt.delegated.nodeId, replicaId: debt.delegated.replicaId},
        debt.expectedOwner);
      assert.equal(debt.delegated.operationId, retained.operationId);
      assert.equal(debt.delegated.createdAt, retained.createdAt);
    }
    repository.observeRetainedPlacementRepairCommit('replica_operations', restored);
  }
  await settleRetainedOwner(ledger, holder);
  for (const repository of repositories) {
    assert.equal(repository.retainedPlacementRepairs.has(retained.operationId), false);
  }
  assert.equal(committedRepairCount(ledger), before,
    'delivery of the committed own row retires debt without proposing again');
}

async function confirmRetainedFirst(context, ordinary, gate) {
  const {ledger, observation, retained} = context;
  assert.ok(!ledger.commands.some(({entryId}) => entryId === ordinary.request.entryId),
    'the staged competing request was held before proposal');
  const restored = observation.readCommitted(retained.operationId);
  const repair = ledger.commands.filter(({type}) => type === 'PLACEMENT_REPAIR').at(-1);
  assert.equal(committedPlacementResult(observation, repair).outcome, 'ADMITTED');
  assert.equal(restored?.operation_id, retained.operationId);
  assert.equal(restored?.replica_id, retained.replicaId);
  assert.equal(restored?.created_at, retained.createdAt);
  await confirmRestoredDebt(context, restored);
  await gate.release('PLACEMENT_ADMIT');
  const answer = await ordinary.release();
  const refused = committedOrdinaryResult(observation, ledger.commands, ordinary.request, answer);
  assert.equal(refused.reason, PLACEMENT_REFUSAL.PARTITION_BUSY);
  assert.deepEqual(refused.operationIds, [retained.operationId]);
}

async function confirmRetainedRecovery(context, initialBlocker, order, diagnostic) {
  const {world, ledger, observation, holder, retained} = context;
  const incumbent = observation.readCommitted(world.operation.operationId);
  assert.equal(incumbent.completed_at, null, 'the incumbent still owns its committed lane');
  const before = committedRepairCount(ledger);
  holder.repository.observeRetainedPlacementRepairCommit('replica_operations', initialBlocker);
  holder.repository.observeRetainedPlacementRepairCommit('replica_operations', initialBlocker);
  await settleRetainedOwner(ledger, holder);
  assert.equal(committedRepairCount(ledger), before, 'unchanged BUSY does not propose again');
  assert.equal(observation.readCommitted(retained.operationId), undefined);
  const firstReleaseCommand = ledger.commands.length;
  const retainedFirst = order === 'retained-first';
  const ordinary = stageOrdinaryAdmission(context);
  const gate = holdPlacementProposals(ledger);
  try {
    const released = await stepRetainedLedgerRow(
      ledger, incumbent.operation_id, WORKFLOW_STEP.FAILED);
    assert.equal(observation.readCommitted(incumbent.operation_id)?.completed_at,
      released.completed_at);
    holder.repository.observeRetainedPlacementRepairCommit('replica_operations', released);
    await settleTurns();
    const pendingRepair = gate.pending('PLACEMENT_REPAIR');
    assert.equal(pendingRepair.length, 1, 'release engages one real native repair before either applies');
    assert.notEqual(observation.readPlacementOutcome(pendingRepair[0].command).state, 'settled');
    let ordinaryAnswer = null;
    if (!retainedFirst) {
      await gate.release('PLACEMENT_ADMIT');
      ordinaryAnswer = await ordinary.release();
    }
    await gate.release('PLACEMENT_REPAIR');
    await settleRetainedOwner(ledger, holder);
    assert.equal(committedRepairCount(ledger), before + 1, 'release owns one new native repair');
    if (retainedFirst) {
      await confirmRetainedFirst(context, ordinary, gate);
    } else {
      await confirmOrdinaryFirst(context, ledger.commands.slice(firstReleaseCommand),
        ordinary, ordinaryAnswer, diagnostic);
    }
  } finally {
    await gate.close();
    await ordinary.release();
  }
}

const scenarios = [
  {producer: 'no contender'},
  {producer: 'ordinary birth'},
  {producer: 'zero-update repair', order: 'ordinary-first'},
  {producer: 'zero-update repair', order: 'retained-first'},
  {producer: 'ACTIVE-reservation repair', order: 'ordinary-first'},
  {producer: 'ACTIVE-reservation repair', order: 'retained-first'},
  {producer: 'private raw bypass'},
];
for (const {producer, order} of scenarios) {
  const label = order ? `${producer}, ${order}` : producer;
  test(`S11 real ledger after SAFE: ${label}`, (t) => withNativeLedgerReplace(
    async (context) => {
      const {world, ledger, holder, historicalRow, observation} = context;
      await reachTargetLeadership(world);
      const owner = world.coordinator.workflowOwner;
      const evaluate = owner.evaluateRemoveSafety.bind(owner);
      let safeEdges = 0;
      let initialBlocker;
      owner.evaluateRemoveSafety = async (operation) => {
        const evaluation = await evaluate(operation);
        if (evaluation.error || safeEdges > 0) return evaluation;
        safeEdges += 1;
        if (producer === 'private raw bypass') {
          // The unsupported historical producer is precisely the deliberate
          // after-SAFE mutation whose original integrity assertion failed.
          await restoreHistoricalFixtureRow(ledger, historicalRow);
        } else if (producer !== 'no contender') {
          initialBlocker = observation.readCommitted(world.operation.operationId);
          assert.equal(initialBlocker.workflow_step, WORKFLOW_STEP.ACTIVE);
          await trySupportedProducer(producer, context);
          if (order) {
            await settleRetainedOwner(ledger, holder);
            confirmFreshObservation(context, initialBlocker);
          }
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
          'the actual ledger owner retains the original contender identity: ' +
            JSON.stringify(context.requests));
        await confirmRetainedRecovery(context, initialBlocker, order,
          (message) => t.diagnostic(message));
        assert.deepEqual(effectViolations(observation), []);
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
