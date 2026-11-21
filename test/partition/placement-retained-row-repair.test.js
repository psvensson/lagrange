// File-backed SQLite, real PartitionService committed apply, statement outcomes,
// CDC ledger and repository/workflow producers. Consensus transport is a
// controllable port: the witness orders and commits proposals, not real rs-raft.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {afterEach, beforeEach, test} from 'node:test';
import {ControlPlaneSystemTableGateway} from
  '../../src/control-plane/control-plane-system-table-gateway.js';
import * as placementAdmission from
  '../../src/partition/partition-placement-admission.js';
import {readCommittedStatementOutcome} from
  '../../src/partition/partition-committed-statement-outcome.js';
import {PLACEMENT_OUTCOME, PLACEMENT_REFUSAL} from
  '../../src/rebalancer/replica-placement-owner-constants.js';
import {createReplicaPlacementOwner} from '../../src/rebalancer/replica-placement-owner.js';
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
      const world = {leader, coordinator, gateway, commands};
      try {
        await measure(world);
      } finally {
        world.placementOwner?.shutdown();
        leader.setRebalancerLeadershipSink(null);
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
    replicaId: `${PARTITION_ID}-retained`, membershipPublicationEpoch: 7,
    ...(type === OperationType.ADD || type === OperationType.REPLACE ?
      {targetNodeBootIncarnation: 1} : {})}, Date.now());
  if (type === OperationType.ADD || type === OperationType.REPLACE) {
    operation.copySourceNodeId = NODE.A;
  }
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
    assert.equal(await repository.repairRetainedOperation(retained), true);
    assert.deepEqual(attempts[1], attempts[0], 'unknown answer replays identical native command');
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

function attachCurrentCopyOwner(world) {
  const now = Date.now();
  const cache = {
    getAll(table) {
      if (table === 'partitions') return [{partition_id: PARTITION_ID, status: 'active',
        replica_count: 3, leader_node_id: NODE.A}];
      if (table === 'services') return [{replica_id: `${PARTITION_ID}-source`,
        partition_id: PARTITION_ID, node_id: NODE.A, status: 'active', raft_role: 'leader'}];
      return [];
    },
    onCacheApplyChange() {}, offCacheApplyChange() {},
  };
  const owner = createReplicaPlacementOwner({nodeId: NODE.A,
    ledgerPartitionService: world.leader, systemTableCache: cache,
    nodeAuthority: {
      answerCommittedNodes: () => ({state: 'ready', epoch: {publicationEpoch: 7},
        formation: {state: 'FORMED', latchEpoch: 7},
        nodeRows: [NODE.A, NODE.B, NODE.C].map((node, index) => ({node_id: node,
          host_id: `host-${index}`, status: 'active', boot_incarnation: 1,
          ready_lease_expires_at: now + 60_000}))}),
      subscribe: () => () => {}, scheduleRefresh() {},
    }, now: () => now, logger: world.leader.logger});
  world.leader.setRebalancerLeadershipSink(owner);
  // Pause ordinary planning while measuring the supported pure preparation
  // path. This does not replace its real node/deficit/classification algorithm.
  owner.setLeader(false);
  world.placementOwner = owner;
}

test('a clearing holder commit during the old BUSY reply owns a successor attempt', () =>
  withRepairLedger(async (world) => {
    const retained = await retainMissing(world);
    const normal = await compete(world);
    const repository = world.coordinator.repository;
    const submit = repository.repairRetainedPlacement;
    let release;
    let committed;
    const gotBusy = new Promise((resolve) => { committed = resolve; });
    repository.repairRetainedPlacement = async (payload) => {
      const answer = await submit(payload);
      if (answer.placementResult?.reason === PLACEMENT_REFUSAL.PARTITION_BUSY) {
        committed();
        await new Promise((resolve) => { release = resolve; });
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
    assert.ok(ledgerRows(world.leader).find((row) => row.operation_id === retained.operationId));
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
    assert.equal(world.commands.at(-1).body.admissionStatement.repair, true,
      'UNDER_REPLICATED is classified repair by the ordinary actual deficit owner');
    assert.equal(world.commands.at(-1).body.operation.operationId, retained.operationId);
    const outcome = readCommittedStatementOutcome(world.leader,
      `entry:${world.commands.at(-1).entryId}`);
    assert.equal(JSON.parse(outcome.ownerResultText).reason, PLACEMENT_REFUSAL.TARGET_AT_CAPACITY);
    stepLedgerRow(world.leader, holders[0], WORKFLOW_STEP.FAILED);
    await settleRepair(world);
    assert.ok(ledgerRows(world.leader).find((row) => row.operation_id === retained.operationId),
      'native clearing re-admits the original identity instead of minting another operation');
  }));
