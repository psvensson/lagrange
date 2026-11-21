import {withRepairLedger, attachCurrentCopyOwner} from './placement-retained-row-repair-fixture.js';
// File-backed SQLite, real PartitionService committed apply, statement outcomes,
// CDC ledger and repository/workflow producers. Consensus transport is a
// controllable port: the witness orders and commits proposals, not real rs-raft.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import * as placementAdmission from
  '../../src/partition/partition-placement-admission.js';
import {readCommittedStatementOutcome} from
  '../../src/partition/partition-committed-statement-outcome.js';
import {PLACEMENT_OUTCOME, PLACEMENT_REFUSAL} from
  '../../src/rebalancer/replica-placement-owner-constants.js';
import {createOperationAt, OperationType} from '../../src/rebalancer/replica-status.js';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';
import {REPLICA_OPERATION_UPDATE_DISPOSITION as DISPOSITION} from
  '../../src/rebalancer/replica-operation-update-disposition.js';
import {ensureDispatchReservationOrSkip} from
  '../../src/rebalancer/operation-workflow-dispatch-reservation-gate.js';
import {OPERATION_RESERVATION_ATTEMPT_OUTCOME as RESERVATION} from
  '../../src/rebalancer/operation-reservation-attempt-outcome.js';
import {PARTITION_SERVICE_EVENT} from '../../src/partition/partition-service-constants.js';
import {createTestCoordinator} from
  '../rebalancer/test-helpers.js';
import {clearFixtureSingletons, resetFixtureSingletons,
  resumeFixtureParticipantAdmission, send, settleTicks} from '../test-helpers/participant-transaction-fixture.js';
import {NODE, commitLedgerStatement, ledgerRows, placementStatement,
  stepLedgerRow} from './placement-admission-fixture.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);
import {raiseParticipantCutoverPause} from
  '../../src/partition/partition-participant-transaction-pause.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';

const PARTITION_ID = 'retained-repair-p1';


async function retainMissing(world, type = OperationType.REMOVE, partitionId = PARTITION_ID) {
  const operation = createOperationAt({operationId: `historical-${type}`,
    type, partitionId, sourceNodeId: NODE.A, targetNodeId: NODE.B,
    replicaId: `${partitionId}-retained`, membershipPublicationEpoch: 7,
    ...(type === OperationType.ADD || type === OperationType.REPLACE ?
      {targetNodeBootIncarnation: 1, targetNodeStorageIncarnation: 1} : {})}, Date.now());
  if (type === OperationType.ADD || type === OperationType.REPLACE) {
    operation.copySourceNodeId = NODE.A;
  }
  operation.entityType = 'partition';
  operation.entityId = partitionId;
  await world.coordinator.repository.persistNewOperation(operation);
  const retained = await world.coordinator.getOperation(operation.operationId);
  assert.ok(retained, 'a real producer created the historical row');
  await world.gateway.submitMutation({tableName: 'replica_operations', operation: 'delete',
    whereClause: {operation_id: retained.operationId}});
  assert.equal(ledgerRows(world.leader).length, 0);
  return retained;
}

async function compete(world) {
  const answer = await placementAdmission.requestPlacementAdmission(world.leader, {entryId: 'normal-competitor',
    body: placementStatement({partitionId: PARTITION_ID, type: OperationType.REMOVE,
      target: NODE.C, replicaId: `${PARTITION_ID}-r2`,
      voterRetirement: {nodeBootIncarnation: 1, replicaCreatedAt: 1}})});
  return answer.placementResult;
}

async function settleRepair(world) {
  await settleTicks();
  await world.coordinator.repository.retainedPlacementRepairDrain;
  await settleTicks();
}

for (const first of ['normal', 'retained']) {
  test(`native entity repair and ordinary admission serialize: ${first} first`, () =>
    withRepairLedger(async (world) => {
      const retained = await retainMissing(world);
      if (first === 'normal') {
        const normal = await compete(world);
        assert.equal(normal.outcome, PLACEMENT_OUTCOME.ADMITTED);
        const repaired = await world.coordinator.repository.persistOperationUpdate(retained,
          {expectedWorkflowStep: WORKFLOW_STEP.PENDING});
        assert.equal(repaired.disposition, DISPOSITION.REFUSED);
        assert.equal(ledgerRows(world.leader).length, 1,
          'missing historical row cannot bypass the newer native holder');
        assert.equal(world.coordinator.repository.retainedPlacementRepairs.size, 1);
        const proposals = world.commands.length;
        await settleTicks();
        world.leader.emit(PARTITION_SERVICE_EVENT.WRITE_PATH_RELEASED);
        commitLedgerStatement(world.leader, 'unrelated-change',
          'UPDATE replica_operations SET updated_at = updated_at WHERE operation_id = ?',
          ['unrelated']);
        await settleRepair(world);
        assert.equal(world.commands.length, proposals, 'no self or unrelated wake loop');
        stepLedgerRow(world.leader, normal.operationIds[0], WORKFLOW_STEP.FAILED);
        await settleRepair(world);
        assert.ok(ledgerRows(world.leader).find((row) => row.operation_id === retained.operationId),
          'the exact holder terminal commit owns the real retry');
        assert.equal(world.coordinator.repository.retainedPlacementRepairs.size, 0);
      } else {
        const repaired = await world.coordinator.repository.persistOperationUpdate(retained,
          {expectedWorkflowStep: WORKFLOW_STEP.PENDING});
        assert.equal(repaired.disposition, DISPOSITION.REINSERTED);
        const normal = await compete(world);
        assert.equal(normal.reason, PLACEMENT_REFUSAL.PARTITION_BUSY);
        assert.deepEqual(normal.operationIds, [retained.operationId]);
      }
    }));
}

test('reservation gate consumes native repair refusal and retains the original reservation', () =>
  withRepairLedger(async (world) => {
    attachCurrentCopyOwner(world);
    const retained = await retainMissing(world, OperationType.ADD);
    const normal = await compete(world);
    const owner = world.coordinator.workflowOwner;
    owner.hasStorageReservationSupport = () => true;
    owner.ensureReservationForOperation = async () => ({outcome: RESERVATION.CREATED});
    const result = await ensureDispatchReservationOrSkip(owner, retained);
    assert.ok(result, 'a repaired reservation never overrides native ledger refusal');
    assert.equal(ledgerRows(world.leader).length, 1);
    assert.equal(world.coordinator.repository.retainedPlacementRepairs.size, 1);
    owner.ensureReservationForOperation = async () => ({outcome: RESERVATION.ALREADY_ACTIVE});
    assert.ok(await ensureDispatchReservationOrSkip(owner, retained),
      'the next ACTIVE-reservation invocation still withholds dispatch');
    stepLedgerRow(world.leader, normal.operationIds[0], WORKFLOW_STEP.FAILED);
    await settleRepair(world);
    assert.equal(await ensureDispatchReservationOrSkip(owner, retained), null,
      'only the original native holder clearing makes this same candidate dispatchable');
  }));

test('lost committed answer reuses pinned bytes and preserves the retained lease', () =>
  withRepairLedger(async (world) => {
    const retained = await retainMissing(world);
    const repository = world.coordinator.repository;
    const submit = repository.repairRetainedPlacement;
    const attempts = [];
    repository.repairRetainedPlacement = async (payload) => {
      attempts.push(payload);
      const answer = await submit(payload);
      if (attempts.length === 1) throw new Error('lost after actual native commit');
      return answer;
    };
    const first = await repository.persistOperationUpdate(retained,
      {expectedWorkflowStep: WORKFLOW_STEP.PENDING});
    assert.equal(first.disposition, DISPOSITION.REFUSED);
    assert.equal(repository.retainedPlacementRepairs.size, 1);
    const row = ledgerRows(world.leader)[0];
    assert.equal(row.lease_expires_at, retained.ownerLeaseExpiresAt ?? null);
    const held = repository.retainedPlacementRepairs.get(retained.operationId);
    assert.equal(held.entryId, attempts[0].entryId);
    assert.deepEqual(held.body, attempts[0].body, 'unknown answer retains identical native command');
    assert.equal(await repository.repairRetainedOperation(retained), true);
    assert.equal(world.commands.length, 1, 'settled replay proposes no second write');
    assert.equal(repository.retainedPlacementRepairs.size, 0);
  }));

test('exact existing row succeeds; changed birth and history refuse without replacement', () =>
  withRepairLedger(async (world) => {
    const retained = await retainMissing(world);
    const first = await placementAdmission.requestPlacementRepair(world.leader,
      {entryId: 'exact-insert', body: {operation: retained}});
    assert.equal(first.placementResult.outcome, PLACEMENT_OUTCOME.ADMITTED);
    const replay = await placementAdmission.requestPlacementRepair(world.leader,
      {entryId: 'exact-existing', body: {operation: retained}});
    assert.equal(replay.placementResult.outcome, PLACEMENT_OUTCOME.ADMITTED);
    for (const operation of [{...retained, createdAt: retained.createdAt + 1},
      {...retained, stepsHistory: [...retained.stepsHistory,
        {step: retained.workflowStep, timestamp: retained.updatedAt}]}]) {
      const answer = await placementAdmission.requestPlacementRepair(world.leader,
        {entryId: `changed-${operation.stepsHistory.length}`, body: {operation}});
      assert.equal(answer.placementResult.outcome, PLACEMENT_OUTCOME.REFUSED);
    }
    assert.equal(ledgerRows(world.leader)[0].created_at, retained.createdAt);
  }));


test('a clearing holder commit during the old BUSY reply owns a successor attempt', () =>
  withRepairLedger(async (world) => {
    const retained = await retainMissing(world);
    const normal = await compete(world);
    const repository = world.coordinator.repository;
    const submit = repository.repairRetainedPlacement;
    let release;
    let committed;
    const gotBusy = new Promise((resolve) => {
      committed = resolve;
    });
    repository.repairRetainedPlacement = async (payload) => {
      const answer = await submit(payload);
      if (answer.placementResult?.reason === PLACEMENT_REFUSAL.PARTITION_BUSY) {
        committed();
        await new Promise((resolve) => {
          release = resolve;
        });
      }
      return answer;
    };
    const pending = repository.persistOperationUpdate(retained,
      {expectedWorkflowStep: WORKFLOW_STEP.PENDING});
    await gotBusy;
    stepLedgerRow(world.leader, normal.operationIds[0], WORKFLOW_STEP.FAILED);
    release();
    await pending;
    await settleRepair(world);
    assert.ok(ledgerRows(world.leader)
      .find((row) => row.operation_id === retained.operationId));
    assert.equal(repository.retainedPlacementRepairs.size, 0,
      'no unrelated later traffic is needed to consume the already observed clearing');
  }));

test('terminal evidence restoration does not consume the live entity or copy lane', () =>
  withRepairLedger(async (world) => {
    const retained = await retainMissing(world, OperationType.ADD);
    const normal = await compete(world);
    const completedAt = retained.updatedAt + 1;
    const terminal = {...retained, workflowStep: WORKFLOW_STEP.FAILED, status: 'failed',
      updatedAt: completedAt, completedAt, stepsHistory: [...retained.stepsHistory,
        {step: WORKFLOW_STEP.FAILED, timestamp: completedAt}]};
    const result = await world.coordinator.repository.persistOperationUpdate(terminal,
      {expectedWorkflowStep: WORKFLOW_STEP.PENDING});
    assert.equal(result.disposition, DISPOSITION.REINSERTED);
    assert.ok(ledgerRows(world.leader).find((row) => row.operation_id === normal.operationIds[0]));
    assert.equal(ledgerRows(world.leader).length, 2);
  }));

test('current actual deficit policy preserves same-ID copies and native capacity clearing', () =>
  withRepairLedger(async (world) => {
    attachCurrentCopyOwner(world);
    const retained = await retainMissing(world, OperationType.ADD);
    const holders = [];
    for (const partitionId of ['copy-holder-one-p1', 'copy-holder-two-p1']) {
      const answer = await placementAdmission.requestPlacementAdmission(world.leader, {
        entryId: partitionId, body: placementStatement({partitionId, target: NODE.B})});
      assert.equal(answer.placementResult.outcome, PLACEMENT_OUTCOME.ADMITTED);
      holders.push(answer.placementResult.operationIds[0]);
    }
    const result = await world.coordinator.repository.persistOperationUpdate(retained,
      {expectedWorkflowStep: WORKFLOW_STEP.PENDING});
    assert.equal(result.disposition, DISPOSITION.REFUSED);
    assert.equal(world.commands.at(-1).body.copyPolicy.statement.repair, false,
      'the actual one-voter LEARNER_DEFICIT remains ordinary policy, with no quota promotion');
    assert.equal(world.commands.at(-1).body.operation.operationId, retained.operationId);
    const outcome = readCommittedStatementOutcome(world.leader,
      `entry:${world.commands.at(-1).entryId}`);
    assert.equal(JSON.parse(outcome.ownerResultText).reason, PLACEMENT_REFUSAL.TARGET_AT_CAPACITY);
    stepLedgerRow(world.leader, holders[0], WORKFLOW_STEP.FAILED);
    await settleRepair(world);
    assert.ok(ledgerRows(world.leader).find((row) => row.operation_id === retained.operationId),
      'native clearing re-admits the original identity instead of minting another operation');
  }));


test('foreign and malformed native answers retain one exact unknown attempt', async () => {
  const corruptions = [
    (actual) => ({...actual, entryId: 'foreign-entry'}),
    (actual) => ({...actual, placementResult: {outcome: 'ADMITTED',
      operationIds: ['foreign-operation']}}),
    (actual) => ({...actual, placementResult: {outcome: 'REFUSED',
      reason: PLACEMENT_REFUSAL.PARTITION_BUSY, operationIds: ['not-a-typed-blocker']}}),
  ];
  for (const corrupt of corruptions) {
    await withRepairLedger(async (world) => {
      const retained = await retainMissing(world);
      const repository = world.coordinator.repository;
      const submit = repository.repairRetainedPlacement;
      let original;
      repository.repairRetainedPlacement = async (payload) => {
        original = payload;
        return corrupt(await submit(payload));
      };
      assert.equal(await repository.repairRetainedOperation(retained), false);
      assert.equal(repository.retainedPlacementRepairs.size, 1);
      const held = repository.retainedPlacementRepairs.get(retained.operationId);
      assert.equal(held.entryId, original.entryId);
      assert.deepEqual(held.body, original.body);
      repository.repairRetainedPlacement = submit;
      assert.equal(await repository.repairRetainedOperation(retained), true);
      assert.equal(repository.retainedPlacementRepairs.size, 0);
      assert.equal(world.commands.length, 1);
    });
  }
});

test('shutdown retires volatile custody and late committed replies cannot rearm it', () =>
  withRepairLedger(async (world) => {
    const retained = await retainMissing(world);
    const repository = world.coordinator.repository;
    const submit = repository.repairRetainedPlacement;
    let release;
    let arrived;
    const committed = new Promise((resolve) => {
      arrived = resolve;
    });
    repository.repairRetainedPlacement = async (payload) => {
      const answer = await submit(payload);
      arrived();
      await new Promise((resolve) => {
        release = resolve;
      });
      return answer;
    };
    const pending = repository.repairRetainedOperation(retained);
    await committed;
    assert.equal(await repository.repairRetainedOperation(
      {...retained, createdAt: retained.createdAt + 1}), false,
    'a same-ID/different-birth caller cannot replace the held envelope');
    await world.coordinator.shutdown();
    release();
    assert.equal(await pending, false);
    assert.equal(repository.retainedPlacementRepairs.size, 0);
    assert.equal(repository.retainedPlacementRepairWakes.size, 0);
    assert.equal(ledgerRows(world.leader).length, 1,
      'shutdown does not undo a real committed restoration');
  }));


test('an intact ordinary ACTIVE reservation dispatch adds no repair proposal', () =>
  withRepairLedger(async (world) => {
    const answer = await placementAdmission.requestPlacementAdmission(world.leader, {
      entryId: 'intact-native-add', body: placementStatement({partitionId: PARTITION_ID,
        target: NODE.B})});
    const operation = await world.coordinator.getOperation(answer.placementResult.operationIds[0]);
    const owner = world.coordinator.workflowOwner;
    owner.hasStorageReservationSupport = () => true;
    owner.ensureReservationForOperation = async () => ({outcome: RESERVATION.ALREADY_ACTIVE});
    const before = world.commands.length;
    assert.equal(await ensureDispatchReservationOrSkip(owner, operation), null);
    assert.equal(world.commands.length, before,
      'the exact authoritative committed-row read satisfies the healthy gate');
  }));

for (const first of ['normal', 'ledger']) {
  test(`retained ledger self-move global exclusion: ${first} first`, () =>
    withRepairLedger(async (world) => {
      const retained = await retainMissing(world, OperationType.REMOVE, 'replica_operations-p1');
      if (first === 'normal') {
        const normal = await compete(world);
        const restored = await world.coordinator.repository.persistOperationUpdate(retained,
          {expectedWorkflowStep: WORKFLOW_STEP.PENDING});
        assert.equal(restored.disposition, DISPOSITION.REFUSED);
        assert.equal(ledgerRows(world.leader).length, 1);
        const debt = world.coordinator.repository.retainedPlacementRepairs
          .get(retained.operationId);
        assert.equal(debt.blockers[0].operationId, normal.operationIds[0]);
        stepLedgerRow(world.leader, normal.operationIds[0], WORKFLOW_STEP.FAILED);
        await settleRepair(world);
        assert.ok(ledgerRows(world.leader)
          .find((row) => row.operation_id === retained.operationId));
      } else {
        const restored = await world.coordinator.repository.persistOperationUpdate(retained,
          {expectedWorkflowStep: WORKFLOW_STEP.PENDING});
        assert.equal(restored.disposition, DISPOSITION.REINSERTED);
        assert.equal((await compete(world)).reason, PLACEMENT_REFUSAL.LEDGER_TRANSITION_UNRESOLVED);
      }
    }));
}

function remoteCaller(world) {
  const messages = [];
  const coordinator = createTestCoordinator({nodeId: NODE.A,
    replaceWitness: false, committedMembershipFixture: false,
    controlPlaneSystemTableGateway: world.gateway,
    cacheData: {services: [{replica_id: world.leader.replicaId, node_id: world.leader.nodeId,
      partition_id: 'replica_operations-p1', status: 'active', raft_role: 'leader'}]},
    messageRouter: {async deliver(address, payload) {
      messages.push({address, payload});
      return buildDeliveryEnvelope({acknowledged: true}, await send(world.leader, payload));
    }},
  });
  assert.equal(coordinator.ledgerPartitionServices.size, 0, 'the caller has no local ledger');
  return {coordinator, messages};
}

test('remote-only current copy preparation succeeds and changed target boot stays debt', () =>
  withRepairLedger(async (world) => {
    const retained = await retainMissing(world, OperationType.ADD);
    const remote = remoteCaller(world);
    try {
      assert.equal(await remote.coordinator.repository.repairRetainedOperation(retained), true);
      assert.deepEqual(remote.messages.map(({payload}) => payload.type),
        ['PLACEMENT_REPAIR_PREPARE', 'PLACEMENT_REPAIR']);
      const wire = remote.messages[1].payload;
      assert.equal(wire.body.copyPolicy.statement.moves[0].replicaId, null,
        'ordinary canonical resource policy mints no identity');
      assert.equal(wire.body.operation.replicaId, retained.replicaId,
        'the retained envelope alone owns the existing identity');
      assert.equal(wire.body.copyPolicy.statement.moves[0].targetNodeBootIncarnation, 1);
      await world.gateway.submitMutation({tableName: 'replica_operations', operation: 'delete',
        whereClause: {operation_id: retained.operationId}});
      const before = world.commands.length;
      assert.equal(await remote.coordinator.repository.repairRetainedOperation(
        {...retained, targetNodeBootIncarnation: 2}), false);
      assert.equal(world.commands.length, before, 'unknown original target birth grants no command');
      assert.equal(remote.coordinator.repository.retainedPlacementRepairs.size, 1);
    } finally {
      await remote.coordinator.shutdown();
    }
  }));

test('remote paused repair progresses solely on actual owner WRITE_PATH_RELEASED', () =>
  withRepairLedger(async (world) => {
    const retained = await retainMissing(world);
    const remote = remoteCaller(world);
    try {
      raiseParticipantCutoverPause(world.leader);
      assert.equal(await remote.coordinator.repository.repairRetainedOperation(retained), false);
      assert.equal(world.commands.length, 0, 'cutover refusal proposed no native repair');
      assert.equal(world.coordinator.repository.retainedPlacementRepairs.size, 1,
        'the actual remote ledger owner holds the exact pinned request');
      const before = remote.messages.length;
      remote.coordinator.repository.observeRetainedPlacementRepairCommit('replica_operations',
        {operation_id: 'unrelated', created_at: Date.now(), workflow_step: WORKFLOW_STEP.ACTIVE});
      await settleTicks();
      assert.equal(remote.messages.length, before, 'unrelated CDC cannot re-propose the request');
      await resumeFixtureParticipantAdmission(world.leader);
      await settleRepair(world);
      assert.ok(ledgerRows(world.leader).find((row) => row.operation_id === retained.operationId),
        'the actual release event, with zero caller traffic, restores the original row');
      assert.equal(remote.messages.length, before);
      assert.equal(world.coordinator.repository.retainedPlacementRepairs.size, 0);
      assert.equal(await remote.coordinator.repository.ensureRetainedOperationRow(retained), true);
    } finally {
      await remote.coordinator.shutdown();
    }
  }));

test('a retained ordinary copy consumes source capacity and resumes on its actual release', () =>
  withRepairLedger(async (world) => {
    const retained = await retainMissing(world, OperationType.ADD);
    const holders = [];
    for (const [index, target] of [NODE.B, NODE.C, NODE.D].entries()) {
      const answer = await placementAdmission.requestPlacementAdmission(world.leader,
        {entryId: `source-holder-${index}`, body: placementStatement({
          partitionId: `source-holder-${index}-p1`, target})});
      assert.equal(answer.placementResult.outcome, PLACEMENT_OUTCOME.ADMITTED);
      holders.push(answer.placementResult.operationIds[0]);
    }
    const result = await world.coordinator.repository.persistOperationUpdate(retained,
      {expectedWorkflowStep: WORKFLOW_STEP.PENDING});
    assert.equal(result.disposition, DISPOSITION.REFUSED);
    const command = world.commands.at(-1);
    const outcome = readCommittedStatementOutcome(world.leader, `entry:${command.entryId}`);
    assert.equal(JSON.parse(outcome.ownerResultText).reason, PLACEMENT_REFUSAL.SOURCE_AT_CAPACITY);
    assert.equal(command.body.copyPolicy.statement.repair, false);
    stepLedgerRow(world.leader, holders[2], WORKFLOW_STEP.FAILED);
    await settleRepair(world);
    assert.ok(ledgerRows(world.leader)
      .find((row) => row.operation_id === retained.operationId));
  }));

test('retained-copy-first occupies the ordinary target lane until its own committed release', () =>
  withRepairLedger(async (world) => {
    const retained = await retainMissing(world, OperationType.ADD);
    const result = await world.coordinator.repository.persistOperationUpdate(retained,
      {expectedWorkflowStep: WORKFLOW_STEP.PENDING});
    assert.equal(result.disposition, DISPOSITION.REINSERTED);
    const body = (partitionId) => placementStatement({partitionId, target: NODE.B});
    const second = await placementAdmission.requestPlacementAdmission(world.leader,
      {entryId: 'second-copy', body: body('second-copy-p1')});
    assert.equal(second.placementResult.outcome, PLACEMENT_OUTCOME.ADMITTED);
    const full = await placementAdmission.requestPlacementAdmission(world.leader,
      {entryId: 'third-copy-full', body: body('third-copy-p1')});
    assert.equal(full.placementResult.reason, PLACEMENT_REFUSAL.TARGET_AT_CAPACITY);
    stepLedgerRow(world.leader, retained.operationId, WORKFLOW_STEP.ACTIVE);
    const cleared = await placementAdmission.requestPlacementAdmission(world.leader,
      {entryId: 'third-copy-cleared', body: body('third-copy-p1')});
    assert.equal(cleared.placementResult.outcome, PLACEMENT_OUTCOME.ADMITTED);
    assert.equal(ledgerRows(world.leader).filter((row) =>
      row.operation_id === retained.operationId).length, 1);
  }));
