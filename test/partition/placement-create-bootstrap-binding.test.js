import assert from 'node:assert/strict';
import {test} from 'node:test';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';
import {CREATE_ADMISSION_STATE} from '../../src/node/replica-create-admission-owner.js';
import {ControlPlaneSystemTableGateway} from
  '../../src/control-plane/control-plane-system-table-gateway.js';
import {readCommittedStatementOutcome} from
  '../../src/partition/partition-committed-statement-outcome.js';
import {bindReplaceCreateTargetReplicaId} from
  '../../src/rebalancer/operation-workflow-replace-target-binding.js';
import {placementReplicaIdOf} from
  '../../src/partition/partition-placement-admission-identity.js';
import {replicaIdsOfStamp} from '../../src/raft/raft-committed-membership-stamp.js';
import {
  OPERATION_METADATA_KEY, OperationType, WORKFLOW_STEP_TO_STATUS,
} from '../../src/rebalancer/replica-operation-progress.js';
import {REBALANCER_SKIP_REASON} from '../../src/rebalancer/rebalancer-constants.js';
import {
  ReplicaOperationField, ReplicaOperationMessageType, ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {committedStampFor} from '../node/replica-handler-bootstrap-stamps.js';
import {installCommittedOperationMutationFixture} from '../rebalancer/operation-outcome-fixture.js';
import {
  createMockControlPlaneSystemTableGateway, createTestCoordinator,
} from '../rebalancer/test-helpers.js';
import {
  NODE, admitOnLeader, commitLedgerStatement, ledgerRows, onLedgerLeader, placementStatement,
} from './placement-admission-fixture.js';

const PARTITION_ID = 'placement-bootstrap-p1';
const VOTER_ID = `${PARTITION_ID}-r1`;
const planner = new ControlPlaneSystemTableGateway();

function createBindingCoordinator(leader, readMembership, deliverCreate = null) {
  let nextMutation = 0;
  const sqlEngine = {
    async executeQuery(sql, params = []) {
      const statement = leader.db.prepare(sql);
      assert.equal(statement.reader, true, 'only committed apply writes this ledger');
      return {success: true, rows: statement.all(...params), rowSetComplete: true};
    },
  };
  const gateway = createMockControlPlaneSystemTableGateway(sqlEngine);
  gateway.submitMutation = async (mutation) => {
    const {sql, params} = planner.buildSqlMutationPlan(mutation);
    const entryId = `bootstrap:bind:${++nextMutation}`;
    assert.equal(commitLedgerStatement(leader, entryId, sql, params), null);
    const outcome = readCommittedStatementOutcome(leader, `entry:${entryId}`);
    assert.ok(Number.isInteger(outcome.changes), 'committed SQL reports its row count');
    return {success: true, partitionResult: {affectedRows: outcome.changes}};
  };
  installCommittedOperationMutationFixture(gateway);
  const coordinator = createTestCoordinator({
    nodeId: NODE.A, sqlQueryEngine: sqlEngine, controlPlaneSystemTableGateway: gateway,
  });
  coordinator.workflowOwner.messageRouter = {
    async deliver(address, request) {
      if (request.type === ReplicaOperationMessageType.CREATE_REPLICA && deliverCreate) {
        return deliverCreate(address, request);
      }
      assert.equal(request.type, ReplicaOperationMessageType.READ_COMMITTED_MEMBERSHIP);
      assert.equal(request.partitionId, PARTITION_ID);
      return buildDeliveryEnvelope({acknowledged: true}, {
        status: ReplicaOperationResponseStatus.COMPLETED,
        [ReplicaOperationField.MEMBERSHIP]: await readMembership(),
      });
    },
  };
  return coordinator;
}

async function withNativeCreate(measure, type = OperationType.ADD) {
  await onLedgerLeader(async (leader, proposed) => {
    const {command} = await admitOnLeader(
      leader, proposed, 'bootstrap:placement', placementStatement({
        partitionId: PARTITION_ID, target: NODE.B, type,
        sourceReplicaId: type === OperationType.REPLACE ? VOTER_ID : null,
      }));
    assert.ok(command, 'the production placement owner proposed the native admission');
    const initial = ledgerRows(leader);
    assert.equal(initial.length, 1, 'the native admission committed one operation');
    assert.equal(initial[0].replica_id, placementReplicaIdOf(initial[0].operation_id));
    const history = JSON.parse(initial[0].steps_history);
    assert.equal(history[0][OPERATION_METADATA_KEY.BOOTSTRAP_MEMBERSHIP], undefined,
      'the native admission starts with no dispatch topology');
    await measure(leader, initial[0], history);
  });
}

function bind(coordinator, operation) {
  return bindReplaceCreateTargetReplicaId(coordinator.workflowOwner, operation, false, null);
}

test('native ADD dispatch bootstrap is durable and reused by a fresh workflow', async () => {
  await withNativeCreate(async (leader, row) => {
    const stamp = committedStampFor([VOTER_ID]);
    let membershipReads = 0;
    const coordinator = createBindingCoordinator(leader, () => {
      membershipReads += 1;
      return stamp;
    });
    try {
      const operation = coordinator.repository.rowToOperation(row);
      const bound = await bind(coordinator, operation);
      assert.deepEqual(bound[ReplicaOperationField.BOOTSTRAP_MEMBERSHIP], stamp,
        'the first coordinator got the committed membership');
      const [durable] = ledgerRows(leader);
      const history = JSON.parse(durable.steps_history);
      assert.deepEqual(history[0][OPERATION_METADATA_KEY.BOOTSTRAP_MEMBERSHIP], stamp,
        'retained CREATE must find the original committed stamp in native ledger history');
      const replicaIds = replicaIdsOfStamp(stamp, row.replica_id);
      assert.deepEqual(history[0][OPERATION_METADATA_KEY.REPLICA_IDS], replicaIds);
      assert.deepEqual(history[0][OPERATION_METADATA_KEY.PEER_ADDRESSES],
        [`${NODE.B}/partition/${row.replica_id}`]);
      assert.equal(durable.operation_id, row.operation_id);
      assert.equal(durable.workflow_step, row.workflow_step);

      const emittedRequests = [];
      const reconstructed = createBindingCoordinator(leader, () => {
        membershipReads += 1;
        return committedStampFor([VOTER_ID], {appliedIndex: stamp.appliedIndex + 1});
      }, (address, request) => {
        emittedRequests.push({address, request});
        return buildDeliveryEnvelope({acknowledged: true}, {
          success: false, reason: REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING,
        });
      });
      try {
        const recovered = await bind(reconstructed,
          reconstructed.repository.rowToOperation(durable));
        assert.deepEqual(recovered[ReplicaOperationField.BOOTSTRAP_MEMBERSHIP], stamp);
        assert.equal(membershipReads, 1, 'reconstruction reuses the original stamp');
        assert.deepEqual(ledgerRows(leader), [durable], 'recovery does not rewrite the row');

        // Model the separately committed dispatch claim, as in the normal
        // reservation-cleared path, before the first target wire delivery.
        const at = durable.updated_at + 1;
        const step = WORKFLOW_STEP.SENDING;
        assert.equal(commitLedgerStatement(leader, 'bootstrap:dispatch-claim',
          `UPDATE replica_operations SET workflow_step = ?, status = ?, updated_at = ?,
           steps_history = json_insert(steps_history, '$[#]', json(?))
           WHERE operation_id = ?`,
          [step, WORKFLOW_STEP_TO_STATUS[step], at,
            JSON.stringify({step, timestamp: at}), row.operation_id]), null);
        const [sending] = ledgerRows(leader);
        await reconstructed.workflowOwner.executeOperationInternal(
          reconstructed.repository.rowToOperation(sending), {},
        );
        assert.equal(emittedRequests.length, 1, 'the real workflow delivered one CREATE');
        const [{address, request}] = emittedRequests;
        assert.equal(address, `${NODE.B}/service/replica-handler`);
        assert.equal(request.operationId, row.operation_id);
        assert.equal(request.replicaId, row.replica_id);
        assert.deepEqual(request[ReplicaOperationField.BOOTSTRAP_MEMBERSHIP], stamp);
        assert.deepEqual(request[ReplicaOperationField.REPLICA_IDS], replicaIds);
        assert.equal(membershipReads, 1, 'the delivered CREATE uses original custody');
      } finally {
        await reconstructed.shutdown();
      }
    } finally {
      await coordinator.shutdown();
    }
  });
});

test('a competing native history update wins against bootstrap binding', async () => {
  await withNativeCreate(async (leader, row, originalHistory) => {
    const winnerHistory = [{...originalHistory[0], reason: 'a newer committed history'}];
    const coordinator = createBindingCoordinator(leader, () => {
      const error = commitLedgerStatement(leader, 'bootstrap:competing-history',
        'UPDATE replica_operations SET steps_history = ? WHERE operation_id = ?',
        [JSON.stringify(winnerHistory), row.operation_id]);
      assert.equal(error, null);
      return committedStampFor([VOTER_ID]);
    });
    try {
      const bound = await bind(coordinator, coordinator.repository.rowToOperation(row));
      assert.equal(bound, null, 'an uncommitted bootstrap binding cannot reach CREATE');
      const [durable] = ledgerRows(leader);
      assert.deepEqual(JSON.parse(durable.steps_history), winnerHistory);
      assert.equal(durable.operation_id, row.operation_id);
      assert.equal(durable.completed_at, null, 'the original create obligation remains');
    } finally {
      await coordinator.shutdown();
    }
  });
});

test('native REPLACE source-removal handoff disarms a stale target CREATE', async () => {
  await withNativeCreate(async (leader, row) => {
    const requests = [];
    const stamp = committedStampFor([VOTER_ID]);
    const coordinator = createBindingCoordinator(leader, () => stamp, (_address, request) => {
      requests.push(request);
      return buildDeliveryEnvelope({acknowledged: true}, {
        success: false, reason: REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING,
      });
    });
    try {
      const bound = await bindReplaceCreateTargetReplicaId(
        coordinator.workflowOwner, coordinator.repository.rowToOperation(row), false, VOTER_ID);
      const now = bound.updatedAt + 1;
      const transition = (step, at) => {
        assert.equal(commitLedgerStatement(leader, `bootstrap:replace:${step}`,
          `UPDATE replica_operations SET workflow_step = ?, status = ?, updated_at = ?,
           steps_history = json_insert(steps_history, '$[#]', json(?)),
           create_admission_state = ?, create_admission_token = ?,
           create_admission_replica_created_at = ?, create_admission_attempt_token = ?,
           create_admission_attempt_seq = ?, create_admission_workflow_updated_at = ?,
           create_admission_owner_incarnation = ? WHERE operation_id = ?`,
          [step, WORKFLOW_STEP_TO_STATUS[step], at, JSON.stringify({step, timestamp: at}),
            CREATE_ADMISSION_STATE.MATERIALIZED, 'original-admission', now, 'original-attempt',
            1, now, 1, row.operation_id]), null);
      };
      transition(WORKFLOW_STEP.CREATING, now);
      const stale = coordinator.repository.rowToOperation(ledgerRows(leader)[0]);
      assert.equal(coordinator.repository.isReplaceRemoveDispatchPhase(stale), false);
      transition(WORKFLOW_STEP.ACTIVE, now + 1);
      const [handoff] = ledgerRows(leader);
      assert.equal(coordinator.repository.isReplaceRemoveDispatchPhase(
        coordinator.repository.rowToOperation(handoff)), true);
      await coordinator.workflowOwner.executeOperationInternal(stale, {});
      assert.deepEqual(requests, [], 'stale target dispatch cannot send CREATE after handoff');
      assert.deepEqual(ledgerRows(leader), [handoff], 'source-removal owner keeps the exact row');
    } finally {
      await coordinator.shutdown();
    }
  }, OperationType.REPLACE);
});
