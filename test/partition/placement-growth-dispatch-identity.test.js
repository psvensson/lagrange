import assert from 'node:assert/strict';
import {test} from 'node:test';
import {CDC_OPERATION, TABLES, WORKFLOW_STEP} from '../../src/constants/index.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ControlPlaneField} from '../../src/control-plane/control-plane-constants.js';
import {MembershipPublicationCoordinatorReads} from
  '../../src/control-plane/membership-publication-coordinator-reads.js';
import {readPlacementCensus} from '../../src/partition/partition-placement-admission-decision.js';
import {createReplicaPlacementOwner} from '../../src/rebalancer/replica-placement-owner.js';
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
import {ensureOperationLedgerSelfMoveDispatchIdleOrSkip} from
  '../../src/rebalancer/operation-workflow-dispatch-ledger-self-move-gate.js';
import {createOperation} from '../../src/rebalancer/replica-status.js';
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
        replicaId: FIRST_LEARNER, sourceReplicaId, source: null,
      }));
    assert.ok(command, 'the production placement owner committed the admission');
    const [row] = ledgerRows(leader);
    assert.equal(row.replica_id, FIRST_LEARNER);
    assert.equal(row.source_replica_id, sourceReplicaId);
    assert.equal(row.completed_at, null);

    const world = createDispatchWorld(leader);
    try {
      await measure(world, row, leader, proposed);
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

function commitGrowthHistory(leader, row, history, step = row.workflow_step) {
  const isActive = step === WORKFLOW_STEP.ACTIVE;
  assert.equal(commitLedgerStatement(leader, `growth-census:${row.operation_id}:${step}`,
    `UPDATE replica_operations SET steps_history = ?, workflow_step = ?, status = ?,
     completed_at = ? WHERE operation_id = ?`,
    [JSON.stringify(history), step, WORKFLOW_STEP_TO_STATUS[step],
      isActive ? row.updated_at + 1 : null, row.operation_id]), null);
}

async function admitOtherGrowth(leader, proposed, partitionId, learners) {
  const {command} = await admitOnLeader(leader, proposed, `growth:placement:${partitionId}`,
    placementStatement({partitionId, target: NODE.A, type: OperationType.GROWTH_PROMOTE,
      replicaId: learners[0], sourceReplicaId: learners[1], source: null}));
  assert.ok(command);
  return ledgerRows(leader).find((row) => row.partition_id === partitionId);
}

function seedPromotablePartition(cache, partitionId, learners) {
  cache.applySystemTableChange(TABLES.PARTITIONS, CDC_OPERATION.UPSERT, {
    partition_id: partitionId, leader_node_id: NODE.A, status: 'active', replica_count: 3,
  });
  const members = [`${partitionId}-leader`, ...learners];
  for (const [index, nodeId] of [NODE.A, NODE.B, NODE.C].entries()) {
    const replicaId = members[index];
    cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPSERT, {
      service_id: replicaId, replica_id: replicaId, service_type: 'partition',
      partition_id: partitionId, node_id: nodeId, status: 'active',
      raft_role: index === 0 ? 'leader' : 'learner',
    });
  }
}

test('native census credits healthy completed growth and preserves another real deficit', async () => {
  await withNativeGrowth(async (_world, malformed, leader, proposed) => {
    const healthyPartitionId = 'placement-dispatch-growth-healthy-p1';
    const healthyLearners = [`${healthyPartitionId}-first`, `${healthyPartitionId}-second`];
    const healthy = await admitOtherGrowth(leader, proposed, healthyPartitionId, healthyLearners);
    const foreign = await admitOtherGrowth(leader, proposed, 'placement-dispatch-growth-foreign-p1',
      [FIRST_LEARNER, SECOND_LEARNER]);
    commitGrowthHistory(leader, healthy, JSON.parse(healthy.steps_history), WORKFLOW_STEP.ACTIVE);
    commitGrowthHistory(leader, foreign, JSON.parse(foreign.steps_history), WORKFLOW_STEP.ACTIVE);
    const history = JSON.parse(malformed.steps_history);
    delete history[0].promoteReplicaIds;
    commitGrowthHistory(leader, malformed, history, WORKFLOW_STEP.ACTIVE);
    const census = readPlacementCensus(leader.db);

    const cache = new SystemTableCache();
    seedPromotablePartition(cache, PARTITION_ID, [FIRST_LEARNER, SECOND_LEARNER]);
    seedPromotablePartition(cache, healthyPartitionId, healthyLearners);
    const staged = [];
    const owner = createReplicaPlacementOwner({
      nodeId: NODE.A, ledgerPartitionService: leader, systemTableCache: cache,
      now: () => 1_000, logger: leader.logger,
      nodeAuthority: {
        subscribe: () => () => {}, scheduleRefresh() {},
        answerCommittedNodes: () => ({
          state: 'ready', epoch: {publicationEpoch: 7},
          formation: {state: 'FORMED', latchEpoch: 4},
          nodeRows: [NODE.A, NODE.B, NODE.C].map((nodeId) => ({
            node_id: nodeId, host_id: nodeId, status: 'active',
            ready_lease_expires_at: 2_000, boot_incarnation: 1,
          })),
        }),
      },
      admitPlacement: async ({body}) => {
        staged.push(body);
      },
    });
    try {
      owner.setLeader(true);
      await owner.awaitCurrentWorkIdle();
      assert.deepEqual(staged.map((statement) => statement.partitionId), [PARTITION_ID],
        'real deficit survives malformed and foreign-partition cohort evidence');
      assert.equal(staged[0].moves[0].type, OperationType.GROWTH_PROMOTE);
      assert.equal(census.find((row) => row.operationId === malformed.operation_id)
        .promoteReplicaIds, null, 'a missing original cohort creates no voter credit');
    } finally {
      owner.shutdown();
    }
  });
});

test('a malformed unresolved growth retains native occupancy without aborting healthy reads',
  async () => withNativeGrowth(async ({coordinator}, malformed, leader, proposed) => {
    const healthy = await admitOtherGrowth(leader, proposed, 'independent-growth-p1',
      ['independent-first', 'independent-second']);
    const history = JSON.parse(malformed.steps_history);
    delete history[0].promoteReplicaIds;
    commitGrowthHistory(leader, malformed, history);
    for (const row of ledgerRows(leader)) {
      coordinator.systemTableCache.upsert(TABLES.REPLICA_OPERATIONS, row.operation_id, row);
    }
    assert.deepEqual(coordinator.repository.queryCachedIncompleteOperations()
      .map((operation) => operation.operationId), [healthy.operation_id]);
    assert.ok(readPlacementCensus(leader.db).find(
      (row) => row.operationId === malformed.operation_id).incomplete,
    'the native admission still retains the exact incomplete scope');
  }));

test('actual coordinator handoff ingress retains native subject and lease',
  async () => withNativeGrowth(async ({coordinator, service, seen, sends}, row, leader) => {
    const remote = createTestCoordinator({nodeId: NODE.B});
    const leaseExpiresAt = row.updated_at + 20_000;
    assert.equal(commitLedgerStatement(leader, 'growth:handoff-lease',
      'UPDATE replica_operations SET lease_expires_at = ? WHERE operation_id = ?',
      [leaseExpiresAt, row.operation_id]), null);
    const subject = coordinator.repository.rowToOperation(ledgerRows(leader)[0]);
    let delivered;
    remote.workflowOwner.messageRouter = {
      async deliver(address, payload) {
        assert.equal(address, `${NODE.A}/service/replica-dispatch`);
        delivered = JSON.parse(JSON.stringify(payload[ControlPlaneField.OPERATION_ROW]));
        await service.handleReplicaOperationDispatch(payload);
        return buildDeliveryEnvelope({acknowledged: true}, {success: true});
      },
    };
    try {
      assert.equal(await remote.workflowOwner.wakeCoordinatorCreatedRemoteOwner(subject), true);
      assert.equal(seen.length, 1);
      assert.equal(delivered.source_replica_id, SECOND_LEARNER, 'before recipient refresh');
      assert.equal(delivered.lease_expires_at, subject.ownerLeaseExpiresAt);
      assert.doesNotThrow(() => assertOperationUpdateSubject(
        service.buildOperationFromRow(seen[0].context.row), subject));
      const missingSource = {...delivered};
      delete missingSource.source_replica_id;
      await assert.rejects(() => service.handleReplicaOperationDispatch({
        [ControlPlaneField.OPERATION_ID]: row.operation_id,
        [ControlPlaneField.OPERATION_ROW]: missingSource,
      }), {code: 'INVALID_OPERATION_PERSISTENCE_OUTCOME'});
      assert.equal(seen.length, 1, 'refresh cannot legalize a malformed handoff command');
      const foreign = 'foreign-learner';
      const foreignHistory = JSON.parse(delivered.steps_history);
      foreignHistory[0].promoteReplicaIds[1] = foreign;
      await service.handleReplicaOperationDispatch({
        [ControlPlaneField.OPERATION_ID]: row.operation_id,
        [ControlPlaneField.OPERATION_ROW]: {...delivered,
          source_replica_id: foreign, steps_history: JSON.stringify(foreignHistory)},
      });
      await assert.rejects(
        () => service.reconcileOperationDispatch(row.operation_id, seen[1].context),
        {code: 'INVALID_OPERATION_PERSISTENCE_OUTCOME'},
      );
      assert.equal(sends.length, 0, 'refresh cannot substitute a different cohort for the command');
    } finally {
      await remote.shutdown();
    }
  }));

test('membership-publication authoritative retry retains the actual native subject and lease',
  async () => withNativeGrowth(async ({coordinator}, row, leader) => {
    const leaseExpiresAt = row.updated_at + 20_000;
    assert.equal(commitLedgerStatement(leader, 'growth:lease',
      'UPDATE replica_operations SET lease_expires_at = ? WHERE operation_id = ?',
      [leaseExpiresAt, row.operation_id]), null);
    const publications = Object.assign(
      Object.create(MembershipPublicationCoordinatorReads.prototype), {
        nodeId: NODE.A, now: () => row.updated_at, systemTableCache: new SystemTableCache(),
        replicaOperationRepository: coordinator.repository,
        controlPlaneReadinessService: {
          getMembershipPublicationDiagnosticsSync: () => ({
            publishedActiveNodeIds: [NODE.A],
            priorityPartitionSummary: {
              requiredDistinctNodeCount: 3, readyEligibleNodeCount: 1,
              blockedPartitions: [{
                partitionId: 'sql_transactions-p1', requiredDistinctNodeCount: 3,
                readyDistinctNodeCount: 1, spreadGap: 2,
              }],
              missingPartitionIds: ['sql_transactions-p1'],
            },
            membershipLifecycleSummary: {
              locallyEligibleNodeIds: [NODE.A], projectedServingNodeIds: [NODE.A],
            },
          }),
        },
      });
    const rows = await publications.getDispatchRetryRowsForNode(NODE.A);
    assert.equal(rows.length, 1, 'the actual owner discovered the native retry row');
    assert.equal(rows[0].operation_id, row.operation_id);
    assert.equal(rows[0].source_replica_id, SECOND_LEARNER);
    assert.equal(rows[0].lease_expires_at, leaseExpiresAt);
  }));

function clearOriginalGrowthCohort(leader, row) {
  const history = JSON.parse(row.steps_history);
  delete history[0].promoteReplicaIds;
  commitGrowthHistory(leader, row, history);
}

test('copy admission ignores an unresolved growth that occupies no target copy slot', async () => {
  await withNativeGrowth(async ({coordinator}, incumbent, leader) => {
    clearOriginalGrowthCohort(leader, incumbent);
    const decision = await coordinator.ensureSystemPartitionTargetNodeSlotAllowed(
      OperationType.ADD, {partitionId: 'sql_transactions-p1', targetNodeId: NODE.A},
    );
    assert.equal(decision.allowed, true);
    assert.equal(decision.occupiedCount, 0);
    assert.equal(ledgerRows(leader)[0].operation_id, incumbent.operation_id);
    assert.ok(readPlacementCensus(leader.db)[0].incomplete);
  });
});

test('an unresolved native growth is still the exact competing ledger writer', async () => {
  await withNativeGrowth(async ({coordinator}, incumbent, leader) => {
    clearOriginalGrowthCohort(leader, incumbent);
    const selfMove = createOperation({
      operationId: 'ledger-waiter', type: OperationType.REPLACE, sourceNodeId: NODE.B,
      targetNodeId: NODE.A, partitionId: 'replica_operations-p1',
      replicaId: 'ledger-next', sourceReplicaId: 'ledger-current',
    });
    selfMove.entityType = 'partition';
    selfMove.entityId = selfMove.partitionId;
    const owner = coordinator.workflowOwner;
    const parked = await ensureOperationLedgerSelfMoveDispatchIdleOrSkip(owner, selfMove);
    assert.equal(parked.deferReason, 'operation_ledger_self_move_waiting_for_idle_ledger');
    assert.match(parked.error, new RegExp(incumbent.operation_id, 'u'));
    assert.deepEqual(
      owner.operationLedgerSelfMoveParkEvidenceByOperationId.get(selfMove.operationId)
        .incumbentOperationIds,
      [incumbent.operation_id],
    );
  });
});

test('a completed growth row with contradictory partition and entity gives no voter credit',
  async () => withNativeGrowth(async (_world, incumbent, leader) => {
    const history = JSON.parse(incumbent.steps_history);
    commitGrowthHistory(leader, incumbent, history, WORKFLOW_STEP.ACTIVE);
    assert.equal(commitLedgerStatement(leader, 'growth:wrong-partition-entity',
      'UPDATE replica_operations SET entity_id = ? WHERE operation_id = ?',
      ['different-growth-p1', incumbent.operation_id]), null);
    const observed = readPlacementCensus(leader.db)[0];
    assert.equal(observed.promoteReplicaIds, null);
  }));
