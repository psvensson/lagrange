// File-backed SQLite, real PartitionService committed apply, statement outcomes,
// CDC ledger and repository/workflow producers. Consensus transport is a
// controllable port: the witness orders and commits proposals, not real rs-raft.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {afterEach, beforeEach, test} from 'node:test';
import {ControlPlaneSystemTableGateway} from
  '../../src/control-plane/control-plane-system-table-gateway.js';
import {requestPlacementAdmission, requestPlacementRepair} from
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
import {installCommittedOperationMutationFixture} from '../rebalancer/operation-outcome-fixture.js';
import {createMockControlPlaneSystemTableGateway, createTestCoordinator} from
  '../rebalancer/test-helpers.js';
import {applyCommitted, clearFixtureSingletons, resetFixtureSingletons,
  settleTicks, temporaryDbPath} from '../test-helpers/participant-transaction-fixture.js';
import {NODE, commitLedgerStatement, ledgerRows, onLedgerLeader, placementStatement,
  stepLedgerRow} from './placement-admission-fixture.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);
const PARTITION_ID = 'retained-repair-p1';
const planner = new ControlPlaneSystemTableGateway();

async function withRepairLedger(measure) {
  const temporary = temporaryDbPath();
  try {
    await onLedgerLeader(async (leader, proposed) => {
      let mutationId = 0;
      const sqlEngine = {async executeQuery(sql, params = []) {
        const statement = leader.db.prepare(sql);
        assert.equal(statement.reader, true, 'only native committed apply mutates');
        return {success: true, rows: statement.all(...params), rowSetComplete: true};
      }};
      const gateway = createMockControlPlaneSystemTableGateway(sqlEngine);
      gateway.submitMutation = async (mutation) => {
        const {sql, params} = planner.buildSqlMutationPlan(mutation);
        const entryId = `retained:sql:${++mutationId}`;
        assert.equal(commitLedgerStatement(leader, entryId, sql, params), null);
        const result = readCommittedStatementOutcome(leader, `entry:${entryId}`);
        return {success: true, partitionResult: {affectedRows: result.changes}};
      };
      installCommittedOperationMutationFixture(gateway);
      const coordinator = createTestCoordinator({nodeId: NODE.A,
        sqlQueryEngine: sqlEngine, controlPlaneSystemTableGateway: gateway});
      coordinator.registerLedgerPartitionService(leader);
      const commands = [];
      leader.controllablePort.setProposeHandler(async (entry) => {
        proposed.push({...entry});
        commands.push(entry);
        queueMicrotask(() => assert.equal(applyCommitted(leader, entry), null));
      });
      try {
        await measure({leader, coordinator, gateway, commands});
      } finally {
        await coordinator.shutdown();
      }
    }, {dbPath: temporary.dbPath});
  } finally {
    fs.rmSync(temporary.directory, {recursive: true, force: true});
  }
}

async function retainMissing(world, type = OperationType.REMOVE) {
  const operation = createOperationAt({operationId: `historical-${type}`,
    type, partitionId: PARTITION_ID, sourceNodeId: NODE.A, targetNodeId: NODE.B,
    replicaId: `${PARTITION_ID}-r1`, membershipPublicationEpoch: 7}, Date.now());
  operation.entityType = 'partition';
  operation.entityId = PARTITION_ID;
  await world.coordinator.repository.persistNewOperation(operation);
  const retained = await world.coordinator.getOperation(operation.operationId);
  assert.ok(retained, 'a real producer created the historical row');
  await world.gateway.submitMutation({tableName: 'replica_operations', operation: 'delete',
    whereClause: {operation_id: retained.operationId}});
  assert.equal(ledgerRows(world.leader).length, 0);
  return retained;
}

async function compete(world) {
  const answer = await requestPlacementAdmission(world.leader, {entryId: 'normal-competitor',
    body: placementStatement({partitionId: PARTITION_ID, type: OperationType.REMOVE,
      target: NODE.C, replicaId: `${PARTITION_ID}-r2`})});
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
        commitLedgerStatement(world.leader, 'unrelated-change', 'SELECT 1', []);
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
    const retained = await retainMissing(world, OperationType.ADD);
    await compete(world);
    const owner = world.coordinator.workflowOwner;
    owner.hasStorageReservationSupport = () => true;
    owner.ensureReservationForOperation = async () => ({outcome: RESERVATION.CREATED});
    const result = await ensureDispatchReservationOrSkip(owner, retained);
    assert.ok(result, 'a repaired reservation never overrides native ledger refusal');
    assert.equal(ledgerRows(world.leader).length, 1);
    assert.equal(world.coordinator.repository.retainedPlacementRepairs.size, 1);
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
    assert.equal(await repository.repairRetainedOperation(retained), true);
    assert.deepEqual(attempts[1], attempts[0], 'unknown answer replays identical native command');
    assert.equal(world.commands.length, 1, 'settled replay proposes no second write');
    assert.equal(repository.retainedPlacementRepairs.size, 0);
  }));

test('exact existing row succeeds; changed birth and history refuse without replacement', () =>
  withRepairLedger(async (world) => {
    const retained = await retainMissing(world);
    const first = await requestPlacementRepair(world.leader,
      {entryId: 'exact-insert', body: {operation: retained}});
    assert.equal(first.placementResult.outcome, PLACEMENT_OUTCOME.ADMITTED);
    const replay = await requestPlacementRepair(world.leader,
      {entryId: 'exact-existing', body: {operation: retained}});
    assert.equal(replay.placementResult.outcome, PLACEMENT_OUTCOME.ADMITTED);
    for (const operation of [{...retained, createdAt: retained.createdAt + 1},
      {...retained, stepsHistory: [...retained.stepsHistory,
        {step: retained.workflowStep, timestamp: retained.updatedAt}]}]) {
      const answer = await requestPlacementRepair(world.leader,
        {entryId: `changed-${operation.stepsHistory.length}`, body: {operation}});
      assert.equal(answer.placementResult.outcome, PLACEMENT_OUTCOME.REFUSED);
    }
    assert.equal(ledgerRows(world.leader)[0].created_at, retained.createdAt);
  }));
