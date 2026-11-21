import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ControlPlaneSystemTableGateway} from
  '../../src/control-plane/control-plane-system-table-gateway.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';
import {readCommittedStatementOutcome} from
  '../../src/partition/partition-committed-statement-outcome.js';
import {bindReplaceCreateTargetReplicaId} from
  '../../src/rebalancer/operation-workflow-replace-target-binding.js';
import {OPERATION_METADATA_KEY, ReplicaStatus} from
  '../../src/rebalancer/replica-operation-progress.js';
import {
  ReplicaOperationField, ReplicaOperationMessageType, ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {
  buildReplicaCreateAdmissionToken, buildReplicaCreateAttemptToken,
} from '../../src/rebalancer/replica-create-admission-token.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {committedStampFor} from '../node/replica-handler-bootstrap-stamps.js';
import {installCommittedOperationMutationFixture} from '../rebalancer/operation-outcome-fixture.js';
import {
  createCoordinatorSqlStore, createMockCache, createMockControlPlaneReadinessService,
  createMockControlPlaneSystemTableGateway, createTestCoordinator,
} from '../rebalancer/test-helpers.js';
import {
  NODE, admitOnLeader, commitLedgerStatement, ledgerRows, onLedgerLeader, placementStatement,
} from './placement-admission-fixture.js';

const PARTITION_ID = 'sql_transactions-p1';
const VOTER_ID = `${PARTITION_ID}-r1`;
const MEMBERSHIP = committedStampFor([VOTER_ID]);
const planner = new ControlPlaneSystemTableGateway();

function committedUpdate(leader, entryId, sql, params) {
  assert.equal(commitLedgerStatement(leader, entryId, sql, params), null);
  const outcome = readCommittedStatementOutcome(leader, `entry:${entryId}`);
  assert.ok(Number.isInteger(outcome.changes));
  return outcome.changes;
}

async function withPlacementExecution(measure, {duringCreate} = {}) {
  await onLedgerLeader(async (leader, proposed) => {
    const {command} = await admitOnLeader(leader, proposed, 'execution-mirror:placement',
      placementStatement({partitionId: PARTITION_ID, target: NODE.B}));
    assert.ok(command, 'the placement owner proposed the operation');
    const [initial] = ledgerRows(leader);
    assert.equal(initial.workflow_step, WORKFLOW_STEP.PENDING);
    const cache = createMockCache({services: [{
      service_id: VOTER_ID, replica_id: VOTER_ID, partition_id: PARTITION_ID,
      node_id: NODE.A, address: `${NODE.A}/partition/${VOTER_ID}`,
    }]});
    const reservations = createCoordinatorSqlStore(createMockCache());
    const sqlQueryEngine = {async executeQuery(sql, params = []) {
      if (!/\breplica_operations\b/u.test(sql)) return reservations.execute(sql, params);
      const statement = leader.db.prepare(sql);
      assert.equal(statement.reader, true, 'only committed apply writes this operation ledger');
      return {success: true, rowSetComplete: true, rows: statement.all(...params)};
    }};
    const gateway = createMockControlPlaneSystemTableGateway(sqlQueryEngine);
    let nextMutation = 0;
    gateway.submitMutation = async (mutation) => {
      if (mutation.tableName !== SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) {
        return reservations.submitMutation(mutation);
      }
      const {sql, params} = planner.buildSqlMutationPlan(mutation);
      const affectedRows = committedUpdate(leader, `execution-mirror:write:${++nextMutation}`,
        sql, params);
      return {success: true, partitionResult: {affectedRows}};
    };
    installCommittedOperationMutationFixture(gateway);
    const deliveries = [];
    const coordinator = createTestCoordinator({
      nodeId: NODE.A, systemTableCache: cache, sqlQueryEngine,
      controlPlaneSystemTableGateway: gateway,
      controlPlaneReadinessService: createMockControlPlaneReadinessService({
        defaultRepairEligible: true,
        callbacks: {
          getCurrentPublishedMembershipEpochSync: () => initial.membership_publication_epoch,
        },
      }),
    });
    const owner = coordinator.workflowOwner;
    owner.messageRouter = {
      async deliver(address, request) {
        if (request.type === ReplicaOperationMessageType.READ_COMMITTED_MEMBERSHIP) {
          return buildDeliveryEnvelope({acknowledged: true}, {
            status: ReplicaOperationResponseStatus.COMPLETED,
            [ReplicaOperationField.MEMBERSHIP]: MEMBERSHIP,
          });
        }
        assert.equal(request.type, ReplicaOperationMessageType.CREATE_REPLICA);
        const [sending] = ledgerRows(leader);
        deliveries.push({address, request, sending});
        duringCreate?.(leader, sending);
        return buildDeliveryEnvelope({acknowledged: true},
          {status: ReplicaOperationResponseStatus.INITIATED});
      },
    };
    try {
      await measure({owner, leader, initial, deliveries});
    } finally {
      try {
        await coordinator.shutdown();
      } finally {
        reservations.suspend();
      }
    }
  });
}

function assertCreateDelivery(deliveries, initial) {
  assert.equal(deliveries.length, 1);
  const [{address, request, sending}] = deliveries;
  assert.equal(address, `${NODE.B}/service/replica-handler`);
  assert.equal(request.operationId, initial.operation_id);
  assert.equal(request.replicaId, initial.replica_id);
  assert.equal(request[ReplicaOperationField.MEMBERSHIP_PUBLICATION_EPOCH],
    initial.membership_publication_epoch);
  assert.equal(sending.workflow_step, WORKFLOW_STEP.SENDING);
  assert.deepEqual(request[ReplicaOperationField.BOOTSTRAP_MEMBERSHIP], MEMBERSHIP);
  const admissionToken = buildReplicaCreateAdmissionToken({
    operationId: initial.operation_id, replicaId: initial.replica_id, targetNodeId: NODE.B,
    workflowUpdatedAt: sending.updated_at,
  });
  assert.equal(request[ReplicaOperationField.CREATE_ADMISSION_TOKEN], admissionToken);
  assert.equal(request[ReplicaOperationField.CREATE_ADMISSION_ATTEMPT_TOKEN],
    buildReplicaCreateAttemptToken(admissionToken, 1));
  const [first] = JSON.parse(sending.steps_history);
  assert.deepEqual(first[OPERATION_METADATA_KEY.BOOTSTRAP_MEMBERSHIP], MEMBERSHIP);
}

test('fresh placement CREATE binds its topology and advances through actual dispatch transitions',
  async () => {
    await withPlacementExecution(async ({owner, leader, initial, deliveries}) => {
      const operation = owner.repository.rowToOperation(initial);
      const result = await owner.executeOperationInternal(operation, {});
      assert.equal(result.success, true, JSON.stringify(result));
      assertCreateDelivery(deliveries, initial);
      assert.equal(ledgerRows(leader)[0].workflow_step, WORKFLOW_STEP.CREATING);
    });
  });

test('a SENDING placement CREATE re-entered by ledger CDC advances through real acknowledgement',
  async () => {
    await withPlacementExecution(async ({owner, leader, initial, deliveries}) => {
      const operation = owner.repository.rowToOperation(initial);
      const claimed = await owner.claimPendingDispatchOperation(operation);
      assert.equal(claimed?.workflowStep, WORKFLOW_STEP.SENDING, 'the real owner claimed dispatch');
      const [sending] = ledgerRows(leader);
      owner.handleObservedReplicaStateChange(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, 'UPSERT', sending);
      await owner.operationWorkflowRunExclusive(
        owner.getOperationOwnerSingleFlightKey(initial.operation_id), async () => {});
      assertCreateDelivery(deliveries, initial);
      assert.equal(ledgerRows(leader)[0].workflow_step, WORKFLOW_STEP.CREATING);
    });
  });

test('a competing terminal result survives acknowledgement of a previously stamped CREATE',
  async () => {
    await withPlacementExecution(async ({owner, leader, initial, deliveries}) => {
      const placement = owner.repository.rowToOperation(initial);
      const bound = await bindReplaceCreateTargetReplicaId(owner, placement, false, null);
      assert.ok(bound, 'the prior workflow recorded the stamp');
      const [recorded] = ledgerRows(leader);
      const restored = owner.repository.rowToOperation(recorded);
      const claimed = await owner.claimPendingDispatchOperation(restored);
      assert.equal(claimed?.workflowStep, WORKFLOW_STEP.SENDING, 'the real owner claimed dispatch');
      const dispatch = await owner.executeOperationInternal(claimed, {});
      assert.equal(dispatch.success, false, JSON.stringify(dispatch));
      assertCreateDelivery(deliveries, initial);
      const [terminal] = ledgerRows(leader);
      assert.equal(terminal.workflow_step, WORKFLOW_STEP.FAILED);
      assert.equal(terminal.completed_at, terminal.updated_at);
      assert.equal(terminal.error_message, 'competing terminal result');
    }, {duringCreate(leader, sending) {
      const step = WORKFLOW_STEP.FAILED;
      const timestamp = sending.updated_at + 1;
      assert.equal(committedUpdate(leader, 'execution-mirror:competing-terminal',
        `UPDATE replica_operations SET workflow_step = ?, status = ?, updated_at = ?,
         completed_at = ?, error_message = ?, steps_history = json_insert(steps_history, '$[#]', json(?))
         WHERE operation_id = ? AND workflow_step = ?`,
        [step, ReplicaStatus.FAILED, timestamp, timestamp, 'competing terminal result',
          JSON.stringify({step, timestamp}), sending.operation_id, sending.workflow_step]), 1);
    }});
  });
