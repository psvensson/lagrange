import {withRepairLedger, attachCurrentCopyOwner, stepRetainedLedgerRow} from './placement-retained-row-repair-fixture.js';
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
import {NODE, commitLedgerStatement, ledgerRows, placementStatement} from './placement-admission-fixture.js';

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
        await stepRetainedLedgerRow(world, normal.operationIds[0], WORKFLOW_STEP.FAILED);
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
    await stepRetainedLedgerRow(world, normal.operationIds[0], WORKFLOW_STEP.FAILED);
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
    assert.equal(held.entry.entryId, attempts[0].entryId);
    assert.deepEqual(held.entry.body, attempts[0].body, 'unknown answer retains identical native command');
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
    assert.equal(replay.committed, undefined);
    assert.equal(replay.retainedRepairObservation.state, 'exact');
    assert.equal(world.commands.length, 1, 'a confirmed row is not a newly committed replay entry');
    for (const operation of [{...retained, createdAt: retained.createdAt + 1},
      {...retained, stepsHistory: [...retained.stepsHistory,
        {step: retained.workflowStep, timestamp: retained.updatedAt}]}]) {
      const answer = await placementAdmission.requestPlacementRepair(world.leader,
        {entryId: `changed-${operation.stepsHistory.length}`, body: {operation}});
      assert.equal(answer.committed, undefined);
      assert.equal(answer.retainedRepairObservation.state, 'changed');
      assert.equal(world.commands.length, 1, 'changed identity/history never earns a new proposal');
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
    await stepRetainedLedgerRow(world, normal.operationIds[0], WORKFLOW_STEP.FAILED);
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
    for (const partitionId of [
      'copy-holder-one-p1',
      'copy-holder-two-p1',
      'copy-holder-three-p1',
    ]) {
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
    await stepRetainedLedgerRow(world, holders[0], WORKFLOW_STEP.FAILED);
    await settleRepair(world);
    assert.ok(ledgerRows(world.leader).find((row) => row.operation_id === retained.operationId),
      'native clearing re-admits the original identity instead of minting another operation');
  }));


test('foreign and malformed native answers retain one exact unknown attempt', async () => {
  const corruptions = [
    (actual) => ({...actual, entryId: 'foreign-entry'}),
    (actual) => ({...actual, partitionId: 'foreign-p1'}),
    (actual) => ({...actual, success: false}),
    (actual) => ({...actual, success: true, placementResult: {outcome: 'REFUSED',
      reason: PLACEMENT_REFUSAL.RETAINED_ROW_CHANGED, operationIds: []}}),
    (actual) => ({...actual, success: false, placementResult: {outcome: 'REFUSED',
      reason: PLACEMENT_REFUSAL.HOLD_NOT_HELD}}),
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
      assert.equal(held.entry.entryId, original.entryId);
      assert.deepEqual(held.entry.body, original.body);
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
        assert.equal(debt.blocker.operations[0].operationId, normal.operationIds[0]);
        await stepRetainedLedgerRow(world, normal.operationIds[0], WORKFLOW_STEP.FAILED);
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
    cacheData: {partitions: [{partition_id: world.leader.partitionId,
      leader_node_id: world.leader.nodeId}], services: [{service_id: world.leader.replicaId,
      replica_id: world.leader.replicaId, node_id: world.leader.nodeId, service_type: 'partition',
      address: `${world.leader.nodeId}/partition/${world.leader.replicaId}`,
      partition_id: world.leader.partitionId, status: 'active', raft_role: 'follower'}]},
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
    for (const [index, target] of [
      NODE.B, NODE.C, NODE.D, NODE.B, NODE.C, NODE.D,
    ].entries()) {
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
    await stepRetainedLedgerRow(world, holders.at(-1), WORKFLOW_STEP.FAILED);
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
    const third = await placementAdmission.requestPlacementAdmission(world.leader,
      {entryId: 'third-copy', body: body('third-copy-p1')});
    assert.equal(third.placementResult.outcome, PLACEMENT_OUTCOME.ADMITTED);
    const full = await placementAdmission.requestPlacementAdmission(world.leader,
      {entryId: 'fourth-copy-full', body: body('fourth-copy-p1')});
    assert.equal(full.placementResult.reason, PLACEMENT_REFUSAL.TARGET_AT_CAPACITY);
    await stepRetainedLedgerRow(world, retained.operationId, WORKFLOW_STEP.ACTIVE);
    const cleared = await placementAdmission.requestPlacementAdmission(world.leader,
      {entryId: 'fourth-copy-cleared', body: body('fourth-copy-p1')});
    assert.equal(cleared.placementResult.outcome, PLACEMENT_OUTCOME.ADMITTED);
    assert.equal(ledgerRows(world.leader).filter((row) =>
      row.operation_id === retained.operationId).length, 1);
  }));


test('different remote E2 never receives custody while owner retains unknown E1; real row CDC clears sender', () =>
  withRepairLedger(async (world) => {
    const retained = await retainMissing(world);
    raiseParticipantCutoverPause(world.leader);
    const owner = world.coordinator.repository;
    assert.equal(await owner.repairRetainedOperation(retained), false);
    const e1 = owner.retainedPlacementRepairs.get(retained.operationId);
    const remote = remoteCaller(world);
    const sender = remote.coordinator.repository;
    const submit = sender.repairRetainedPlacement;
    let reply;
    sender.repairRetainedPlacement = async (payload) => {
      reply = await submit(payload);
      return reply;
    };
    try {
      assert.equal(await sender.repairRetainedOperation(retained), false);
      const e2 = sender.retainedPlacementRepairs.get(retained.operationId);
      assert.notEqual(e2.entry.entryId, e1.entry.entryId);
      assert.equal(reply.repairCustody, undefined, 'E2 is not retained at the receiver');
      assert.equal(e2.custody.state, 'self', 'sender still owns its unknown E2');
      assert.equal(owner.retainedPlacementRepairs.get(retained.operationId), e1);
      const proposed = world.commands.length;
      await resumeFixtureParticipantAdmission(world.leader);
      await settleRepair(world);
      const row = world.leader.db.prepare('SELECT * FROM replica_operations WHERE operation_id = ?')
        .get(retained.operationId);
      assert.ok(row, 'actual E1 owner release restored the row without leadership change');
      sender.observeRetainedPlacementRepairCommit('replica_operations', row);
      await settleTicks();
      assert.equal(sender.retainedPlacementRepairs.size, 0,
        'real own-row CDC wakes authoritative confirmation, without resync or another caller');
      assert.equal(world.commands.length, proposed + 1);
    } finally {
      await remote.coordinator.shutdown();
    }
  }));

test('remote E2 joins active E1 and retains renewed BUSY without spending its entry', () =>
  withRepairLedger(async (world) => {
    const retained = await retainMissing(world);
    const competitor = await compete(world);
    const owner = world.coordinator.repository;
    const native = owner.repairRetainedPlacement;
    let release;
    let observed;
    const held = new Promise((resolve) => {
      release = resolve;
    });
    const committed = new Promise((resolve) => {
      observed = resolve;
    });
    let first = true;
    owner.repairRetainedPlacement = async (payload) => {
      const answer = await native(payload);
      if (first) {
        first = false;
        observed();
        await held;
      }
      return answer;
    };
    const firstResult = owner.repairRetainedOperation(retained);
    await committed;
    const remote = remoteCaller(world);
    const sender = remote.coordinator.repository;
    const submit = sender.repairRetainedPlacement;
    let reply;
    sender.repairRetainedPlacement = async (payload) => {
      reply = await submit(payload);
      return reply;
    };
    try {
      const secondResult = sender.repairRetainedOperation(retained);
      await settleTicks();
      release();
      assert.equal(await firstResult, false);
      assert.equal(await secondResult, false);
      assert.equal(reply.retainedRepairObservation.state, 'contended');
      assert.equal(reply.retainedRepairObservation.result.reason, PLACEMENT_REFUSAL.PARTITION_BUSY);
      assert.equal(reply.committed, undefined, 'E1 is never relabeled as a committed E2');
      assert.equal(reply.repairCustody, undefined,
        'settled E2 has no receiver custody; sender retains its typed blocker wake');
      assert.equal(sender.retainedPlacementRepairs.get(retained.operationId).custody.state, 'self');
      assert.deepEqual(owner.retainedPlacementRepairs.get(retained.operationId).blocker,
        sender.retainedPlacementRepairs.get(retained.operationId).blocker);
      await stepRetainedLedgerRow(world, competitor.operationIds[0], WORKFLOW_STEP.FAILED);
      const cleared = world.leader.db.prepare('SELECT * FROM replica_operations WHERE operation_id = ?')
        .get(competitor.operationIds[0]);
      sender.observeRetainedPlacementRepairCommit('replica_operations', cleared);
      await settleRepair(world);
      await sender.retainedPlacementRepairDrain;
      await settleTicks();
      const row = world.leader.db.prepare('SELECT * FROM replica_operations WHERE operation_id = ?')
        .get(retained.operationId);
      assert.ok(row, 'same leader real holder clear restores through actual owner');
      assert.equal(sender.retainedPlacementRepairs.size, 0,
        'sender spends its own typed blocker wake, without own-row CDC or leadership change');
    } finally {
      release();
      await remote.coordinator.shutdown();
    }
  }));

async function holdRemotePendingReply(world, retained) {
  const owner = world.coordinator.repository;
  raiseParticipantCutoverPause(world.leader);
  assert.equal(await owner.repairRetainedOperation(retained), false);
  const remote = remoteCaller(world);
  const sender = remote.coordinator.repository;
  const native = sender.repairRetainedPlacement;
  let release;
  let received;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  const arrived = new Promise((resolve) => {
    received = resolve;
  });
  sender.repairRetainedPlacement = async (payload) => {
    const reply = await native(payload);
    assert.equal(reply.failureCode, 'placement_repair_pending');
    assert.equal(reply.repairCustody, undefined);
    received();
    await held;
    return reply;
  };
  const observe = sender.executeReplicaOperationsRead;
  let reads = 0;
  sender.executeReplicaOperationsRead = async (...args) => {
    reads += 1;
    return observe.apply(sender, args);
  };
  const result = sender.repairRetainedOperation(retained);
  await arrived;
  reads = 0;
  return {remote, sender, result, release, reads: () => reads};
}

for (const order of ['CDC-before-answer', 'answer-before-CDC']) {
  test(`remote E2 owns one authoritative own-row observation: ${order}`, () =>
    withRepairLedger(async (world) => {
      const retained = await retainMissing(world);
      const pending = await holdRemotePendingReply(world, retained);
      try {
        pending.sender.observeRetainedPlacementRepairCommit('replica_operations', {
          operation_id: 'unrelated-operation', entity_type: 'partition', entity_id: 'unrelated-p1'});
        await settleTicks();
        assert.equal(pending.reads(), 0, 'unrelated rows do not request a confirmation');
        if (order === 'answer-before-CDC') {
          pending.release();
          assert.equal(await pending.result, false);
        }
        const before = world.commands.length;
        await resumeFixtureParticipantAdmission(world.leader);
        await settleRepair(world);
        const row = world.leader.db.prepare('SELECT * FROM replica_operations WHERE operation_id = ?')
          .get(retained.operationId);
        assert.ok(row, 'E1 actually restored before controlled CDC delivery to remote-only E2');
        pending.sender.observeRetainedPlacementRepairCommit('replica_operations', row);
        pending.sender.observeRetainedPlacementRepairCommit('replica_operations', row);
        if (order === 'CDC-before-answer') {
          await settleTicks();
          assert.equal(pending.reads(), 0, 'confirmation waits for the active attempt to settle');
          pending.release();
          assert.equal(await pending.result, false);
        }
        await settleTicks();
        await pending.sender.retainedPlacementRepairDrain;
        await settleTicks();
        assert.equal(pending.reads(), 1, 'the coalesced observation is confirmed once after settlement');
        assert.equal(pending.sender.retainedPlacementRepairs.size, 0);
        assert.equal(world.commands.length, before + 1, 'confirmation does not propose E2 or poll');
        pending.sender.observeRetainedPlacementRepairCommit('replica_operations', row);
        await settleTicks();
        assert.equal(pending.reads(), 1, 'retired custody retains no observer or follow-up work');
      } finally {
        pending.release();
        await pending.remote.coordinator.shutdown();
      }
    }));
}

test('an in-flight stale own-row observation reads absence once; genuine successor still confirms', () =>
  withRepairLedger(async (world) => {
    const mutate = world.gateway.submitMutation;
    let originalRow;
    world.gateway.submitMutation = async (mutation, ...args) => {
      if (mutation.operation === 'delete') {
        originalRow = world.leader.db.prepare('SELECT * FROM replica_operations WHERE operation_id = ?')
          .get(mutation.whereClause.operation_id);
      }
      return mutate(mutation, ...args);
    };
    const retained = await retainMissing(world);
    world.gateway.submitMutation = mutate;
    const pending = await holdRemotePendingReply(world, retained);
    try {
      pending.sender.observeRetainedPlacementRepairCommit('replica_operations', originalRow);
      pending.sender.observeRetainedPlacementRepairCommit('replica_operations', originalRow);
      pending.release();
      assert.equal(await pending.result, false);
      await settleTicks();
      await pending.sender.retainedPlacementRepairDrain;
      await settleTicks();
      assert.equal(pending.reads(), 1);
      assert.equal(pending.sender.retainedPlacementRepairs.size, 1,
        'stale CDC cannot retire an authoritatively absent operation');
      const commands = world.commands.length;
      pending.sender.observeRetainedPlacementRepairCommit('replica_operations', {
        operation_id: 'unrelated-operation', entity_type: 'partition', entity_id: 'unrelated-p1'});
      await settleTicks();
      assert.equal(pending.reads(), 1);
      assert.equal(world.commands.length, commands, 'absence confirmation does not self-reschedule');
      await resumeFixtureParticipantAdmission(world.leader);
      await settleRepair(world);
      const successor = world.leader.db.prepare('SELECT * FROM replica_operations WHERE operation_id = ?')
        .get(retained.operationId);
      assert.deepEqual(successor, originalRow, 'genuine restoration can have the same retained row bytes');
      pending.sender.observeRetainedPlacementRepairCommit('replica_operations', successor);
      await settleTicks();
      await pending.sender.retainedPlacementRepairDrain;
      await settleTicks();
      assert.equal(pending.reads(), 2, 'a later genuine event is a new observation even with identical bytes');
      assert.equal(pending.sender.retainedPlacementRepairs.size, 0);
    } finally {
      pending.release();
      await pending.remote.coordinator.shutdown();
    }
  }));

for (const order of ['CDC-before-answer', 'answer-before-CDC']) {
  test(`remote BUSY reply retains an in-flight blocker observation: ${order}`, () =>
    withRepairLedger(async (world) => {
      const retained = await retainMissing(world);
      const competitor = await compete(world);
      const remote = remoteCaller(world);
      const sender = remote.coordinator.repository;
      const submit = sender.repairRetainedPlacement;
      let release;
      let received;
      const held = new Promise((resolve) => {
        release = resolve;
      });
      const arrived = new Promise((resolve) => {
        received = resolve;
      });
      let first = true;
      sender.repairRetainedPlacement = async (payload) => {
        const reply = await submit(payload);
        if (first) {
          first = false;
          assert.equal(repairRefusalObservation(reply).reason, PLACEMENT_REFUSAL.PARTITION_BUSY);
          received();
          await held;
        }
        return reply;
      };
      const result = sender.repairRetainedOperation(retained);
      await arrived;
      try {
        if (order === 'answer-before-CDC') {
          release();
          assert.equal(await result, false);
        }
        await stepRetainedLedgerRow(world, competitor.operationIds[0], WORKFLOW_STEP.FAILED);
        const clearing = world.leader.db.prepare('SELECT * FROM replica_operations WHERE operation_id = ?')
          .get(competitor.operationIds[0]);
        sender.observeRetainedPlacementRepairCommit('replica_operations', clearing);
        sender.observeRetainedPlacementRepairCommit('replica_operations', clearing);
        if (order === 'CDC-before-answer') {
          release();
          assert.equal(await result, false);
        }
        await settleRepair(world);
        await sender.retainedPlacementRepairDrain;
        await settleTicks();
        assert.ok(world.leader.db.prepare('SELECT * FROM replica_operations WHERE operation_id = ?')
          .get(retained.operationId));
        assert.equal(sender.retainedPlacementRepairs.size, 0,
          'the blocker event is owed before its BUSY response too; no own-row CDC is delivered');
        const commands = world.commands.length;
        sender.observeRetainedPlacementRepairCommit('replica_operations', clearing);
        await settleTicks();
        assert.equal(world.commands.length, commands, 'retirement cannot retain a repeated clearing event');
      } finally {
        release();
        await remote.coordinator.shutdown();
      }
    }));
}

function repairRefusalObservation(answer) {
  if (answer.committed === true) return answer.placementResult;
  assert.equal(answer.committed, undefined);
  assert.equal(answer.retainedRepairObservation.state, 'contended');
  return answer.retainedRepairObservation.result;
}

async function observeBurst(sender, row) {
  for (let count = 0; count < 5; count += 1) {
    sender.observeRetainedPlacementRepairCommit('replica_operations', row);
  }
  await settleTicks();
  await sender.retainedPlacementRepairDrain;
  await settleTicks();
}

for (const order of ['CDC-before-answer', 'answer-before-CDC']) {
  test(`still-live incumbent duplicates never mint a fresh BUSY turn: ${order}`, () =>
    withRepairLedger(async (world) => {
      const retained = await retainMissing(world);
      const competitor = await compete(world);
      const remote = remoteCaller(world);
      const sender = remote.coordinator.repository;
      const submit = sender.repairRetainedPlacement;
      let release;
      let received;
      let first = true;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      const arrived = new Promise((resolve) => {
        received = resolve;
      });
      sender.repairRetainedPlacement = async (payload) => {
        const answer = await submit(payload);
        if (first) {
          first = false;
          received();
          await gate;
        }
        return answer;
      };
      let reads = 0;
      const read = sender.executeReplicaOperationsRead;
      sender.executeReplicaOperationsRead = (...args) => {
        reads += 1;
        return read.apply(sender, args);
      };
      const result = sender.repairRetainedOperation(retained);
      await arrived;
      reads = 0;
      try {
        const incumbent = world.leader.db.prepare('SELECT * FROM replica_operations WHERE operation_id = ?')
          .get(competitor.operationIds[0]);
        const before = world.commands.length;
        if (order === 'answer-before-CDC') {
          release();
          assert.equal(await result, false);
        }
        for (let count = 0; count < 5; count += 1) {
          sender.observeRetainedPlacementRepairCommit('replica_operations', incumbent);
        }
        release();
        assert.equal(await result, false);
        await settleTicks();
        await sender.retainedPlacementRepairDrain;
        assert.equal(world.commands.length, before, 'a live incumbent is not clearing evidence');
        assert.ok(reads <= 1, 'one coalesced burst uses at most one bounded authoritative read');
        const firstReads = reads;
        await observeBurst(sender, incumbent);
        assert.equal(world.commands.length, before);
        assert.equal(reads, firstReads, 'exact repeated live-incumbent hints do not create more reads');
        await stepRetainedLedgerRow(world, competitor.operationIds[0], WORKFLOW_STEP.FAILED);
        const cleared = world.leader.db.prepare('SELECT * FROM replica_operations WHERE operation_id = ?')
          .get(competitor.operationIds[0]);
        await observeBurst(sender, cleared);
        await settleRepair(world);
        assert.equal(world.commands.length, before + 1, 'genuine clearing makes exactly one native successor');
        assert.ok(world.leader.db.prepare('SELECT * FROM replica_operations WHERE operation_id = ?')
          .get(retained.operationId));
      } finally {
        release();
        await remote.coordinator.shutdown();
      }
    }));
}

async function occupyCopyLane(world, lane) {
  const targets = lane === 'source' ?
    [NODE.B, NODE.C, NODE.D, NODE.B, NODE.C, NODE.D] :
    [NODE.B, NODE.B, NODE.B];
  const holders = [];
  for (const [index, target] of targets.entries()) {
    const answer = await placementAdmission.requestPlacementAdmission(world.leader, {
      entryId: `${lane}-remote-holder-${index}`,
      body: placementStatement({partitionId: `${lane}-remote-holder-${index}-p1`, target}),
    });
    assert.equal(answer.placementResult.outcome, PLACEMENT_OUTCOME.ADMITTED);
    holders.push(answer.placementResult.operationIds[0]);
  }
  return holders;
}

for (const lane of ['source', 'target']) {
  for (const order of ['CDC-before-answer', 'answer-before-CDC']) {
    test(`remote ordinary ${lane} capacity release crosses entities: ${order}`, () =>
      withRepairLedger(async (world) => {
        const retained = await retainMissing(world, OperationType.ADD);
        const holders = await occupyCopyLane(world, lane);
        const remote = remoteCaller(world);
        const sender = remote.coordinator.repository;
        const submit = sender.repairRetainedPlacement;
        let release;
        let received;
        let first = true;
        const gate = new Promise((resolve) => {
          release = resolve;
        });
        const arrived = new Promise((resolve) => {
          received = resolve;
        });
        sender.repairRetainedPlacement = async (payload) => {
          const answer = await submit(payload);
          if (first) {
            first = false;
            assert.equal(repairRefusalObservation(answer).reason, lane === 'source' ?
              PLACEMENT_REFUSAL.SOURCE_AT_CAPACITY : PLACEMENT_REFUSAL.TARGET_AT_CAPACITY);
            received();
            await gate;
          }
          return answer;
        };
        const result = sender.repairRetainedOperation(retained);
        await arrived;
        try {
          if (order === 'answer-before-CDC') {
            release();
            assert.equal(await result, false);
          }
          const before = world.commands.length;
          const releasedId = holders.at(-1);
          await stepRetainedLedgerRow(world, releasedId, WORKFLOW_STEP.FAILED);
          const row = world.leader.db.prepare('SELECT * FROM replica_operations WHERE operation_id = ?')
            .get(releasedId);
          sender.observeRetainedPlacementRepairCommit('replica_operations', row);
          sender.observeRetainedPlacementRepairCommit('replica_operations', row);
          release();
          assert.equal(await result, false);
          await settleRepair(world);
          await sender.retainedPlacementRepairDrain;
          await settleTicks();
          assert.ok(world.leader.db.prepare('SELECT * FROM replica_operations WHERE operation_id = ?')
            .get(retained.operationId));
          assert.equal(sender.retainedPlacementRepairs.size, 0,
            'remote copy release is owed after capacity replies as well as before them');
          assert.equal(world.commands.length, before + 1);
        } finally {
          release();
          await remote.coordinator.shutdown();
        }
      }));
  }
}

for (const lane of ['source', 'target']) {
  test(`impossible ${lane} capacity answer preserves original entry until genuine same-pin outcome`, () =>
    withRepairLedger(async (world) => {
      const retained = await retainMissing(world, OperationType.ADD);
      await occupyCopyLane(world, lane);
      const repository = world.coordinator.repository;
      const native = repository.repairRetainedPlacement;
      let original;
      repository.repairRetainedPlacement = async (payload) => {
        original = payload;
        const answer = await native(payload);
        const occupancy = {...answer.placementResult.occupancy};
        occupancy[lane === 'source' ? 'sourceOccupancy' : 'targetOccupancy'] = 0;
        return {...answer, placementResult: {...answer.placementResult, occupancy}};
      };
      assert.equal(await repository.repairRetainedOperation(retained), false);
      const held = repository.retainedPlacementRepairs.get(retained.operationId);
      assert.equal(held.entry.entryId, original.entryId);
      assert.deepEqual(held.entry.body, original.body);
      const commands = world.commands.length;
      repository.repairRetainedPlacement = native;
      assert.equal(await repository.repairRetainedOperation(retained), false);
      assert.equal(world.commands.length, commands, 'genuine refusal replays original committed attempt');
      assert.equal(repository.retainedPlacementRepairs.get(retained.operationId).blocker.kind,
        'occupancy');
    }));
}

// The four invalid-authority census cases (partial, failed, stale and
// wrong-partition) are witnessed on the virtual clock, as overlapping and as
// sequential arrivals, in placement-retained-continuation.test.js.

test('incoming durable E0 refusal replays before volatile E1 redrive and rejects changed bytes', () =>
  withRepairLedger(async (world) => {
    const retained = await retainMissing(world);
    const competitor = await compete(world);
    const repository = world.coordinator.repository;
    assert.equal(await repository.repairRetainedOperation(retained), false);
    const e0 = world.commands.at(-1);
    raiseParticipantCutoverPause(world.leader);
    await stepRetainedLedgerRow(world, competitor.operationIds[0], WORKFLOW_STEP.FAILED);
    await settleRepair(world);
    const e1 = repository.retainedPlacementRepairs.get(retained.operationId);
    assert.ok(e1.entry.entryId && e1.entry.entryId !== e0.entryId);
    const e1Id = e1.entry.entryId;
    const e1Bytes = JSON.stringify(e1.entry.body);
    let redrives = 0;
    const submit = repository.repairRetainedPlacement;
    repository.repairRetainedPlacement = (payload) => {
      redrives += 1;
      return submit(payload);
    };
    const before = world.commands.length;
    const replay = await send(world.leader, {type: 'PLACEMENT_REPAIR',
      entryId: e0.entryId, body: e0.body});
    assert.equal(replay.entryId, e0.entryId);
    assert.equal(replay.placementResult.reason, PLACEMENT_REFUSAL.PARTITION_BUSY);
    assert.equal(redrives, 0, 'durable E0 reply does not re-drive unrelated volatile E1');
    const conflict = await send(world.leader, {type: 'PLACEMENT_REPAIR', entryId: e0.entryId,
      body: {...e0.body, operation: {...e0.body.operation, updatedAt: retained.updatedAt + 1}}});
    assert.equal(conflict.failureCode, 'placement_admission_bytes_invalid');
    assert.equal(world.commands.length, before);
    assert.equal(e1.entry.entryId, e1Id);
    assert.equal(JSON.stringify(e1.entry.body), e1Bytes);
  }));

async function invokeRecoveryProducer(remote, operation, producer) {
  if (producer === 'mutation') {
    return remote.coordinator.repository.persistOperationUpdate(operation,
      {expectedWorkflowStep: operation.workflowStep});
  }
  const owner = remote.coordinator.workflowOwner;
  owner.hasStorageReservationSupport = () => true;
  owner.ensureReservationForOperation = async () => ({outcome: RESERVATION.ALREADY_ACTIVE});
  return ensureDispatchReservationOrSkip(owner, operation);
}

for (const producer of ['mutation', 'ACTIVE-reservation']) {
  for (const order of ['sender-first', 'receiver-first']) {
    test(`${producer} shares serial repair decision when clearing is ${order}`, () =>
      withRepairLedger(async (world) => {
        const retained = await retainMissing(world, OperationType.ADD);
        const competitor = await compete(world);
        const remote = remoteCaller(world);
        const sender = remote.coordinator.repository;
        const receiver = world.coordinator.repository;
        const wake = receiver.wakeRetainedPlacementRepairs;
        const delayed = [];
        let holdWake = false;
        receiver.wakeRetainedPlacementRepairs = (...args) => {
          if (holdWake) delayed.push(args);
          else wake.apply(receiver, args);
        };
        try {
          await invokeRecoveryProducer(remote, retained, producer);
          assert.equal(world.leader.db.prepare('SELECT * FROM replica_operations WHERE operation_id = ?')
            .get(retained.operationId), undefined);
          const before = world.commands.filter((command) => command.type === 'PLACEMENT_REPAIR').length;
          holdWake = order === 'sender-first';
          const clearing = await stepRetainedLedgerRow(world,
            competitor.operationIds[0], WORKFLOW_STEP.FAILED);
          if (order === 'receiver-first') await settleRepair(world);
          await observeBurst(sender, clearing);
          holdWake = false;
          for (const args of delayed) wake.apply(receiver, args);
          await settleRepair(world);
          await sender.retainedPlacementRepairDrain;
          const repairs = world.commands.filter((command) => command.type === 'PLACEMENT_REPAIR');
          assert.equal(repairs.length, before + 1,
            'receiver and sender clearing share one native restoration, including decision and authority read');
          const row = world.leader.db.prepare('SELECT * FROM replica_operations WHERE operation_id = ?')
            .get(retained.operationId);
          assert.equal(row.created_at, retained.createdAt);
          assert.equal(row.replica_id, retained.replicaId);
          await invokeRecoveryProducer(remote, retained, producer);
          assert.equal(world.commands.filter((command) => command.type === 'PLACEMENT_REPAIR').length,
            repairs.length, 'the same intact operation and ACTIVE reservation need no new repair proposal');
        } finally {
          holdWake = false;
          for (const args of delayed) wake.apply(receiver, args);
          await remote.coordinator.shutdown();
        }
      }));
  }
}

async function queuedRepairWinner(world) {
  const retained = await retainMissing(world);
  const remote = remoteCaller(world);
  const sender = remote.coordinator.repository;
  const receiver = world.coordinator.repository;
  let queued;
  let releaseSend;
  let committed;
  let releaseWinner;
  let reply;
  const sourceReady = new Promise((resolve) => {
    queued = resolve;
  });
  const sendGate = new Promise((resolve) => {
    releaseSend = resolve;
  });
  const winnerReady = new Promise((resolve) => {
    committed = resolve;
  });
  const winnerGate = new Promise((resolve) => {
    releaseWinner = resolve;
  });
  const sendNative = sender.repairRetainedPlacement;
  sender.repairRetainedPlacement = async (payload) => {
    queued(payload);
    await sendGate;
    reply = await sendNative(payload);
    return reply;
  };
  const sourceResult = sender.repairRetainedOperation(retained);
  const e2 = await sourceReady;
  const ownerNative = receiver.repairRetainedPlacement;
  receiver.repairRetainedPlacement = async (payload) => {
    const answer = await ownerNative(payload);
    committed(payload);
    await winnerGate;
    return answer;
  };
  const winnerResult = receiver.repairRetainedOperation(retained);
  const e1 = await winnerReady;
  return {retained, remote, sender, receiver, e1, e2, sourceResult, winnerResult,
    releaseSend, releaseWinner, reply: () => reply};
}

for (const authority of ['exact', 'changed', 'unavailable']) {
  test(`queued real E2 joins E1 winner and confirms ${authority} authority without relabeling`, () =>
    withRepairLedger(async (world) => {
      const race = await queuedRepairWinner(world);
      const originalRead = race.sender.executeReplicaOperationsRead;
      try {
        assert.notEqual(race.e1.entryId, race.e2.entryId);
        assert.equal(world.commands.length, 1);
        if (authority === 'changed') {
          await world.gateway.submitMutation({tableName: 'replica_operations', operation: 'update',
            whereClause: {operation_id: race.retained.operationId},
            data: {created_at: race.retained.createdAt + 1,
              updated_at: race.retained.updatedAt + 1}});
        }
        if (authority === 'unavailable') {
          race.sender.executeReplicaOperationsRead = async () =>
            ({success: false, rowSetComplete: false});
        }
        race.releaseSend();
        await settleTicks();
        assert.equal(world.commands.length, 1,
          'E2 joins E1; it does not propose around the active completer');
        race.releaseWinner();
        assert.equal(await race.winnerResult, authority !== 'changed');
        assert.equal(await race.sourceResult, authority === 'exact');
        const reply = race.reply();
        assert.equal(reply.committed, undefined, 'E1 is not a durable outcome under E2 identity');
        assert.equal(reply.retainedRepairObservation.state, authority === 'unavailable' ? 'exact' : authority);
        assert.equal(reply.retainedRepairObservation.entryId, race.e2.entryId);
        assert.equal(world.commands.length, 1, 'joining a winner does not create an exact-existing proposal');
        if (authority === 'unavailable') {
          const held = race.sender.retainedPlacementRepairs.get(race.retained.operationId);
          assert.equal(held.entry.entryId, race.e2.entryId);
          assert.deepEqual(held.entry.body, race.e2.body);
          assert.equal(held.lastDecision.state, 'unavailable',
            'the confirming actor keeps a typed uncertainty instead of trusting the winner hint');
          race.sender.executeReplicaOperationsRead = originalRead;
          const actual = world.leader.db.prepare('SELECT * FROM replica_operations WHERE operation_id = ?')
            .get(race.retained.operationId);
          await observeBurst(race.sender, actual);
          assert.equal(race.sender.retainedPlacementRepairs.size, 0);
        } else {
          assert.equal(race.sender.retainedPlacementRepairs.size, 0);
        }
        const actual = world.leader.db.prepare('SELECT * FROM replica_operations WHERE operation_id = ?')
          .get(race.retained.operationId);
        assert.equal(actual.created_at, race.retained.createdAt + (authority === 'changed' ? 1 : 0));
      } finally {
        race.sender.executeReplicaOperationsRead = originalRead;
        race.releaseSend();
        race.releaseWinner();
        await race.remote.coordinator.shutdown();
      }
    }));
}

test('real committed BUSY E0 lost reply replays across repositories without a fresh proposal', () =>
  withRepairLedger(async (world) => {
    const retained = await retainMissing(world);
    const competitor = await compete(world);
    const receiver = world.coordinator.repository;
    const native = receiver.repairRetainedPlacement;
    let first = true;
    receiver.repairRetainedPlacement = async (payload) => {
      const answer = await native(payload);
      if (first) {
        first = false;
        throw new Error('lost actual committed BUSY E0 reply');
      }
      return answer;
    };
    assert.equal(await receiver.repairRetainedOperation(retained), false);
    const e0 = world.commands.at(-1);
    const recorded = readCommittedStatementOutcome(world.leader, `entry:${e0.entryId}`);
    assert.equal(JSON.parse(recorded.ownerResultText).reason, PLACEMENT_REFUSAL.PARTITION_BUSY);
    assert.equal(receiver.retainedPlacementRepairs.get(retained.operationId).entry.entryId,
      e0.entryId);
    const remote = remoteCaller(world);
    try {
      const before = world.commands.length;
      const replay = await remote.coordinator.repository.repairRetainedPlacement(
        {entryId: e0.entryId, body: e0.body});
      assert.equal(replay.committed, true);
      assert.equal(replay.entryId, e0.entryId);
      assert.equal(replay.logIndex, recorded.logIndex);
      assert.equal(replay.term, recorded.term);
      assert.equal(replay.placementResult.reason, PLACEMENT_REFUSAL.PARTITION_BUSY);
      assert.equal(world.commands.length, before);
      receiver.repairRetainedPlacement = native;
      assert.equal(await receiver.repairRetainedOperation(retained), false);
      assert.equal(world.commands.length, before, 'the original E0 result is resolved, not reminted');
      let observed;
      const submit = remote.coordinator.repository.repairRetainedPlacement;
      remote.coordinator.repository.repairRetainedPlacement = async (payload) => {
        observed = await submit(payload);
        return observed;
      };
      assert.equal(await remote.coordinator.repository.repairRetainedOperation(retained), false);
      assert.equal(observed.committed, undefined);
      assert.equal(observed.retainedRepairObservation.state, 'contended');
      assert.equal(world.commands.length, before, 'current observed contention is paired with real durable E0');
      await stepRetainedLedgerRow(world, competitor.operationIds[0], WORKFLOW_STEP.FAILED);
      const clearing = world.leader.db.prepare('SELECT * FROM replica_operations WHERE operation_id = ?')
        .get(competitor.operationIds[0]);
      await observeBurst(remote.coordinator.repository, clearing);
      await settleRepair(world);
      assert.equal(world.commands.length, before + 1);
      assert.equal(world.leader.db.prepare('SELECT created_at FROM replica_operations WHERE operation_id = ?')
        .get(retained.operationId).created_at, retained.createdAt);
    } finally {
      await remote.coordinator.shutdown();
    }
  }));

for (const order of ['clear-before-answer', 'answer-before-clear']) {
  test(`unknown native BUSY retains its only clearing observation: ${order}`, () =>
    withRepairLedger(async (world) => {
      const retained = await retainMissing(world);
      const competitor = await compete(world);
      const receiver = world.coordinator.repository;
      const native = receiver.repairRetainedPlacement;
      const sends = [];
      let committed;
      let release;
      const committedReady = new Promise((resolve) => {
        committed = resolve;
      });
      const heldAnswer = new Promise((resolve) => {
        release = resolve;
      });
      receiver.repairRetainedPlacement = async (payload) => {
        sends.push(payload);
        const answer = await native(payload);
        if (sends.length === 1) {
          assert.equal(answer.placementResult.reason, PLACEMENT_REFUSAL.PARTITION_BUSY);
          committed();
          await heldAnswer;
          throw new Error('lost actual BUSY answer');
        }
        return answer;
      };
      const first = receiver.repairRetainedOperation(retained);
      await committedReady;
      const before = world.commands.filter((command) => command.type === 'PLACEMENT_REPAIR').length;
      if (order === 'answer-before-clear') {
        release();
        assert.equal(await first, false);
      }
      await stepRetainedLedgerRow(world, competitor.operationIds[0], WORKFLOW_STEP.FAILED);
      release();
      assert.equal(await first, false);
      await settleRepair(world);
      assert.deepEqual(sends[1], sends[0], 'unknown E0 resolves with the original exact bytes');
      assert.equal(world.commands.filter((command) => command.type === 'PLACEMENT_REPAIR').length,
        before + 1, 'the sole genuine clear permits exactly one actual successor');
      assert.equal(receiver.retainedPlacementRepairs.size, 0);
      assert.equal(world.leader.db.prepare(
        'SELECT created_at FROM replica_operations WHERE operation_id = ?')
        .get(retained.operationId).created_at, retained.createdAt);
    }));
}

test('registered owner read backoff recovers without a new caller or row/role event', () =>
  withRepairLedger(async (world) => {
    const retained = await retainMissing(world);
    const repository = world.coordinator.repository;
    const read = repository.executeReplicaOperationsRead;
    let unavailable = true;
    let reads = 0;
    repository.executeReplicaOperationsRead = (...args) => {
      reads += 1;
      return unavailable ? Promise.resolve({success: false, rowSetComplete: false}) :
        read.apply(repository, args);
    };
    let applied;
    const restored = new Promise((resolve) => {
      applied = resolve;
    });
    const onCommit = ({command}) => {
      if (command.type === 'PLACEMENT_REPAIR') applied();
    };
    world.leader.on(PARTITION_SERVICE_EVENT.ENTRY_COMMITTED, onCommit);
    try {
      assert.equal(await repository.ensureRetainedOperationRow(retained), false);
      assert.equal(reads, 1);
      const entry = repository.retainedPlacementRepairs.get(retained.operationId);
      assert.equal(entry.continuation.state, 'armed',
        'the dependency continuation is registered before the unavailable answer returns');
      assert.equal(world.commands.length, 0);
      unavailable = false;
      await restored;
      await settleRepair(world);
      assert.equal(world.commands.length, 1);
      assert.equal(repository.retainedPlacementRepairs.size, 0);
      assert.equal(entry.continuation.state, 'idle');
      assert.equal(entry.operation.createdAt, retained.createdAt);
      assert.equal(world.leader.db.prepare('SELECT created_at FROM replica_operations WHERE operation_id = ?')
        .get(retained.operationId).created_at, retained.createdAt);
    } finally {
      world.leader.off(PARTITION_SERVICE_EVENT.ENTRY_COMMITTED, onCommit);
    }
  }));

test('shutdown cancels actual registered read-dependency wake and cannot rearm replaced debt', () =>
  withRepairLedger(async (world) => {
    const retained = await retainMissing(world);
    const repository = world.coordinator.repository;
    const original = repository.timeSource;
    const clock = Object.create(original);
    const scheduled = [];
    const canceled = [];
    clock.setTimeout = (callback, delay) => {
      const handle = original.setTimeout(callback, delay);
      scheduled.push(handle);
      return handle;
    };
    clock.clearTimeout = (handle) => {
      canceled.push(handle);
      original.clearTimeout(handle);
    };
    repository.timeSource = clock;
    repository.executeReplicaOperationsRead = async () => ({success: false, rowSetComplete: false});
    assert.equal(await repository.repairRetainedOperation(retained), false);
    assert.equal(scheduled.length, 1);
    const record = repository.retainedPlacementRepairs.get(retained.operationId);
    assert.equal(record.continuation.state, 'armed');
    assert.equal(await repository.repairRetainedOperation(
      {...retained, createdAt: retained.createdAt + 1}), false,
    'the replacement cannot borrow the original registered dependency wake');
    await world.coordinator.shutdown();
    assert.deepEqual(canceled, scheduled);
    assert.equal(record.continuation.state, 'idle');
    assert.equal(repository.retainedPlacementRepairs.size, 0);
    await settleTicks();
    assert.equal(world.commands.length, 0);
  }));
