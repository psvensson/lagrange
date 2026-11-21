import assert from 'node:assert/strict';
import {test} from 'node:test';
import {TABLES, WORKFLOW_STEP} from '../../src/constants/index.js';
import {ControlPlaneSystemTableGateway} from
  '../../src/control-plane/control-plane-system-table-gateway.js';
import {ReplicaDispatchService} from '../../src/control-plane/replica-dispatch-service.js';
import {readCommittedStatementOutcome} from
  '../../src/partition/partition-committed-statement-outcome.js';
import {
  ReplicaOperationField, ReplicaOperationMessageType, ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {
  OperationType, WORKFLOW_STEP_TO_STATUS,
} from '../../src/rebalancer/replica-operation-progress.js';
import {applyGrowthPromoteRequestFields} from
  '../../src/rebalancer/operation-workflow-growth-promote.js';
import {assertOperationUpdateSubject} from
  '../../src/rebalancer/replica-operation-update-outcome.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {withNodeReadinessService} from '../helpers/readiness-service-fixture.js';
import {installCommittedOperationMutationFixture} from '../rebalancer/operation-outcome-fixture.js';
import {
  createMockControlPlaneSystemTableGateway, createTestCoordinator,
} from '../rebalancer/test-helpers.js';
import {
  NODE, admitOnLeader, commitLedgerStatement, ledgerRows, onLedgerLeader, placementStatement,
} from './placement-admission-fixture.js';

const PARTITION_ID = 'placement-dispatch-growth-p1';
const FIRST_LEARNER = `${PARTITION_ID}-first`;
const SECOND_LEARNER = `${PARTITION_ID}-second`;
const planner = new ControlPlaneSystemTableGateway();

function createDispatchWorld(leader) {
  let nextMutation = 0;
  const sqlEngine = {
    async executeQuery(sql, params = []) {
      const statement = leader.db.prepare(sql);
      assert.equal(statement.reader, true, 'writes use the committed ledger apply');
      return {success: true, rows: statement.all(...params), rowSetComplete: true};
    },
  };
  const gateway = createMockControlPlaneSystemTableGateway(sqlEngine);
  gateway.submitMutation = async (mutation) => {
    const {sql, params} = planner.buildSqlMutationPlan(mutation);
    const entryId = `growth-dispatch:update:${++nextMutation}`;
    assert.equal(commitLedgerStatement(leader, entryId, sql, params), null);
    const {changes} = readCommittedStatementOutcome(leader, `entry:${entryId}`);
    return {success: true, partitionResult: {affectedRows: changes}};
  };
  installCommittedOperationMutationFixture(gateway);
  const sends = [];
  const coordinator = createTestCoordinator({
    nodeId: NODE.A,
    sqlQueryEngine: sqlEngine,
    controlPlaneSystemTableGateway: gateway,
  });
  coordinator.workflowOwner.messageRouter = {
    async deliver(address, request) {
      assert.equal(request.type, ReplicaOperationMessageType.PROPOSE_GROWTH_PROMOTE);
      sends.push({address, request});
      return buildDeliveryEnvelope({acknowledged: true}, {
        status: ReplicaOperationResponseStatus.COMPLETED,
        partitionId: PARTITION_ID,
        promotedReplicaIds: [FIRST_LEARNER, SECOND_LEARNER],
        committedVotersReached: true,
      });
    },
  };
  const service = new ReplicaDispatchService(withNodeReadinessService('ReplicaDispatchService', {
    nodeId: NODE.A,
    rebalanceCoordinator: coordinator,
    systemTableCache: coordinator.systemTableCache,
    controlPlaneSystemTableGateway: gateway,
  }));
  // The proof controls readiness and queue delivery only. Dispatch row
  // reconstruction, workflow, SQL transition and adoption are production.
  service.captureDispatchReadiness = async () => ({ready: true, snapshot: null});
  const seen = [];
  const queue = service.operationDispatchQueue;
  const enqueue = queue.enqueue;
  queue.enqueue = (operationId, reason, context) => {
    seen.push({operationId, reason, context});
  };
  return {
    coordinator, service, sends, seen,
    async shutdown() {
      queue.enqueue = enqueue;
      service.stop();
      await coordinator.shutdown();
    },
  };
}

async function withNativeGrowth(measure, sourceReplicaId = SECOND_LEARNER) {
  await onLedgerLeader(async (leader, proposed) => {
    const {command} = await admitOnLeader(leader, proposed, 'growth:placement',
      placementStatement({
        partitionId: PARTITION_ID, target: NODE.A, type: OperationType.GROWTH_PROMOTE,
        replicaId: FIRST_LEARNER, sourceReplicaId,
      }));
    assert.ok(command, 'the production placement owner committed the admission');
    const [row] = ledgerRows(leader);
    assert.equal(row.replica_id, FIRST_LEARNER);
    assert.equal(row.source_replica_id, sourceReplicaId);
    assert.equal(row.completed_at, null);

    const world = createDispatchWorld(leader);
    try {
      await measure(world, row, leader);
    } finally {
      await world.shutdown();
    }
  });
}

test('native growth cold row and the CDC/wake round trip preserve the ordered pair', async () => {
  await withNativeGrowth(async ({coordinator, service}, row) => {
    const databaseSubject = coordinator.repository.rowToOperation(row);
    assert.equal(databaseSubject.sourceReplicaId, SECOND_LEARNER);
    assert.deepEqual(databaseSubject[ReplicaOperationField.PROMOTE_REPLICA_IDS],
      [FIRST_LEARNER, SECOND_LEARNER]);
    const cdcSubject = service.buildOperationFromRow(row);
    assert.equal(cdcSubject.sourceReplicaId, databaseSubject.sourceReplicaId,
      'CDC decode cannot erase the second learner from native SQL');
    assert.deepEqual(cdcSubject[ReplicaOperationField.PROMOTE_REPLICA_IDS],
      [FIRST_LEARNER, SECOND_LEARNER]);

    const wakeRow = service.buildOperationRowFromCoordinator({
      ...databaseSubject, administrationRouteNodeId: NODE.C,
    });
    assert.equal(wakeRow.source_replica_id, SECOND_LEARNER);
    assert.equal(wakeRow.target_node_id, row.target_node_id,
      'the transient administration route is not another learner subject');
    const wakeSubject = service.buildOperationFromRow(wakeRow);
    assert.doesNotThrow(() => assertOperationUpdateSubject(wakeSubject, databaseSubject));
  });
});

test('single native promotion keeps SQL NULL as the second learner through the wake', async () => {
  await withNativeGrowth(async ({coordinator, service}, row) => {
    const subject = coordinator.repository.rowToOperation(row);
    const roundTrip = service.buildOperationFromRow(
      service.buildOperationRowFromCoordinator(subject),
    );
    assert.equal(roundTrip.sourceReplicaId, null);
    assert.deepEqual(roundTrip[ReplicaOperationField.PROMOTE_REPLICA_IDS], [FIRST_LEARNER]);
  }, null);
});

test('duplicate native growth CDC wakes settle the real operation once', async () => {
  await withNativeGrowth(async ({service, sends, seen}, row, leader) => {
    const event = {tableName: TABLES.REPLICA_OPERATIONS, data: row};
    await service.handleCdcApplied(null, event);
    await service.handleCdcApplied(null, event);
    assert.equal(seen.length, 2, 'both committed-row notifications entered replay');
    for (const {operationId, reason, context} of seen) {
      assert.equal(reason, 'cdc_operation_pending');
      await service.reconcileOperationDispatch(operationId, context);
    }
    assert.equal(sends.length, 1, 'duplicate replay does not propose a second growth');
    const [{request}] = sends;
    assert.equal(request.sourceReplicaId, SECOND_LEARNER);
    assert.deepEqual(request.promoteReplicaIds, [FIRST_LEARNER, SECOND_LEARNER]);
    const [durable] = ledgerRows(leader);
    assert.equal(durable.workflow_step, WORKFLOW_STEP.ACTIVE);
    assert.notEqual(durable.completed_at, null);
    assert.equal(durable.source_replica_id, SECOND_LEARNER);
  });
});

test('stale exact growth adopts actual terminal while foreign or swapped pairs refuse', async () => {
  await withNativeGrowth(async ({coordinator, service}, row, leader) => {
    const step = WORKFLOW_STEP.ACTIVE;
    const completedAt = row.updated_at + 1;
    assert.equal(commitLedgerStatement(leader, 'growth-dispatch:completed',
      `UPDATE replica_operations SET workflow_step = ?, status = ?, updated_at = ?,
       completed_at = ?, steps_history = json_insert(steps_history, '$[#]', json(?))
       WHERE operation_id = ?`,
      [step, WORKFLOW_STEP_TO_STATUS[step], completedAt, completedAt,
        JSON.stringify({step, timestamp: completedAt}), row.operation_id]), null);
    const [terminal] = ledgerRows(leader);
    const adopt = (operation) => coordinator.workflowOwner.resolveOperationTransitionBeforeWrite(
      operation, step, {terminalTransition: true, terminalErrorMessage: null},
    );
    const authoritative = coordinator.repository.rowToOperation(terminal);
    const exact = service.buildOperationFromRow(row);
    for (const conflicting of [
      {...authoritative, sourceReplicaId: 'foreign-learner', targetNodeId: NODE.C},
      {...authoritative, replicaId: SECOND_LEARNER, sourceReplicaId: FIRST_LEARNER,
        promoteReplicaIds: [SECOND_LEARNER, FIRST_LEARNER]},
    ]) {
      await assert.rejects(() => adopt(conflicting), {code: 'INVALID_OPERATION_PERSISTENCE_OUTCOME'});
    }
    const outcome = await adopt(exact);
    assert.equal(outcome.operation.sourceReplicaId, SECOND_LEARNER);
    assert.equal(outcome.operation.workflowStep, step);
    assert.equal(outcome.committed, false, 'adoption does not manufacture a write');
    assert.deepEqual(ledgerRows(leader), [terminal]);
  });
});

test('native growth decode refuses missing original, malformed, or later-conflicting cohorts',
  async () => withNativeGrowth(async ({coordinator, service}, row, leader) => {
    const [first] = JSON.parse(row.steps_history);
    const withoutCohort = {...first};
    delete withoutCohort.promoteReplicaIds;
    const badHistories = [
      [withoutCohort],
      [withoutCohort, {promoteReplicaIds: [FIRST_LEARNER, SECOND_LEARNER]}],
      [{...first, promoteReplicaIds: [FIRST_LEARNER, 42]}],
      [{...first, promoteReplicaIds: [FIRST_LEARNER, FIRST_LEARNER]}],
      [{...first, promoteReplicaIds: [SECOND_LEARNER, FIRST_LEARNER]}],
      [first, {promoteReplicaIds: [FIRST_LEARNER, 'foreign-learner']}],
    ];
    for (const [index, history] of badHistories.entries()) {
      assert.equal(commitLedgerStatement(leader, `growth-dispatch:malformed:${index}`,
        'UPDATE replica_operations SET steps_history = ? WHERE operation_id = ?',
        [JSON.stringify(history), row.operation_id]), null);
      const [actual] = ledgerRows(leader);
      assert.throws(() => coordinator.repository.rowToOperation(actual),
        {code: 'INVALID_OPERATION_PERSISTENCE_OUTCOME'});
      assert.throws(() => service.buildOperationFromRow(actual),
        {code: 'INVALID_OPERATION_PERSISTENCE_OUTCOME'});
    }
  }));

test('growth executor wire cannot substitute an explicit foreign cohort for original history',
  async () => withNativeGrowth(async ({coordinator}, row) => {
    const exact = coordinator.repository.rowToOperation(row);
    const request = {};
    applyGrowthPromoteRequestFields(request, exact);
    assert.deepEqual(request[ReplicaOperationField.PROMOTE_REPLICA_IDS],
      [FIRST_LEARNER, SECOND_LEARNER]);
    assert.throws(() => applyGrowthPromoteRequestFields({}, {
      ...exact, promoteReplicaIds: [FIRST_LEARNER, 'foreign-learner'],
    }), {code: 'INVALID_OPERATION_PERSISTENCE_OUTCOME'});
  }));
