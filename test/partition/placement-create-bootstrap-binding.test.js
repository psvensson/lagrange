import {TIMEOUT_BUDGET_DEFAULT} from '../../src/control-plane/timeout-budget.js';
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

function createBindingCoordinator(leader, readMembership, deliverCreate = null,
  partitionId = PARTITION_ID) {
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
      assert.equal(request.partitionId, partitionId);
      return buildDeliveryEnvelope({acknowledged: true}, {
        status: ReplicaOperationResponseStatus.COMPLETED,
        [ReplicaOperationField.MEMBERSHIP]: await readMembership(),
      });
    },
  };
  return coordinator;
}

async function withNativeCreate(measure, type = OperationType.ADD,
  partitionId = PARTITION_ID) {
  await onLedgerLeader(async (leader, proposed) => {
    const {command} = await admitOnLeader(
      leader, proposed, 'bootstrap:placement', placementStatement({
        partitionId, target: NODE.B, type,
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

for (const partitionId of [PARTITION_ID, 'nodes-p1']) {
  test(`unavailable bootstrap keeps native ADD PENDING for ${partitionId}`, async () => {
    await withNativeCreate(async (leader, row) => {
      const sourceReplicaId = `${partitionId}-r1`;
      const stamp = committedStampFor([sourceReplicaId]);
      let membershipAvailable = false;
      let deliveries = 0;
      let sendingAtDelivery;
      const coordinator = createBindingCoordinator(leader, () => {
        if (!membershipAvailable) {
          throw new Error('Committed membership temporarily unavailable');
        }
        return stamp;
      }, (_address, request) => {
        deliveries += 1;
        const [sending] = ledgerRows(leader);
        sendingAtDelivery = sending;
        assert.equal(sending.workflow_step, WORKFLOW_STEP.SENDING);
        assert.deepEqual(
          JSON.parse(sending.steps_history)[0][OPERATION_METADATA_KEY.BOOTSTRAP_MEMBERSHIP],
          stamp, 'CREATE crosses the transport with the committed original bootstrap stamp',
        );
        assert.equal(request.operationId, row.operation_id);
        assert.equal(request.replicaId, row.replica_id);
        assert.deepEqual(request[ReplicaOperationField.BOOTSTRAP_MEMBERSHIP], stamp);
        return buildDeliveryEnvelope({acknowledged: true}, {
          success: false, reason: REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING,
        });
      }, partitionId);
      const owner = coordinator.workflowOwner;
      try {
        // Enter the production dispatch path after its existing reservation/epoch gates.
        const dispatch = (operation) => owner.advanceReservationClearedDispatch(
          operation.operationId, operation);
        await dispatch(coordinator.repository.rowToOperation(row));
        const [blocked] = ledgerRows(leader);
        assert.equal(deliveries, 0, 'the unavailable bootstrap prevented transport');
        assert.equal(blocked.workflow_step, WORKFLOW_STEP.PENDING,
          'pre-send bootstrap unavailability has no durable SENDING anchor');
        assert.equal(blocked.steps_history, row.steps_history);
        const pending = coordinator.repository.rowToOperation(blocked);
        const pendingBound = owner.getTimeoutForStep(WORKFLOW_STEP.PENDING, pending);
        assert.equal(pendingBound, owner.getTimeoutForStep(WORKFLOW_STEP.SENDING, pending),
          'both phases currently use the same configured step bound');
        assert.equal(owner.isOperationStepTimedOut(pending, row.created_at + pendingBound),
          false, 'the held bootstrap can spend the operation budget');
        assert.equal(owner.isPriorityRecoveryOperationDrainStepStale(
          pending, row.created_at + pendingBound), false,
        'the priority drain cannot independently expire the held bootstrap');
        const deadline = row.created_at + TIMEOUT_BUDGET_DEFAULT.REBALANCE_OPERATION_BUDGET_MS;
        assert.equal(owner.isOperationStepTimedOut(pending, deadline), true);
        assert.equal(owner.isPriorityRecoveryOperationDrainStepStale(pending, deadline), true);
        owner.timeSource = {now: () => row.created_at + pendingBound + 1};

        membershipAvailable = true;
        await dispatch(coordinator.repository.rowToOperation(blocked));
        assert.equal(deliveries, 1, 'the recovered authority permits the original CREATE');
        const ready = coordinator.repository.rowToOperation(sendingAtDelivery);
        const sendingDeadline = sendingAtDelivery.updated_at + pendingBound;
        assert.equal(owner.isOperationStepTimedOut(ready, sendingDeadline),
          true, 'a claimed ready operation retains its 30-second SENDING bound');
      } finally {
        await coordinator.shutdown();
      }
    }, OperationType.ADD, partitionId);
  });
}

test('native placement claim must compare the exact source history used for bootstrap', async () => {
  await withNativeCreate(async (leader, row, history) => {
    const winner = [{...history[0], reason: 'concurrent native owner update'}];
    let deliveries = 0;
    const coordinator = createBindingCoordinator(leader, () => {
      assert.equal(commitLedgerStatement(leader, 'bootstrap:dispatch-history-race',
        `UPDATE replica_operations
           SET steps_history = json_set(steps_history, '$[0].reason', ?)
           WHERE operation_id = ?`,
        [winner[0].reason, row.operation_id]), null);
      return committedStampFor([VOTER_ID]);
    }, () => {
      deliveries += 1;
      throw new Error('stale bootstrap should never reach CREATE');
    });
    try {
      await coordinator.workflowOwner.advanceReservationClearedDispatch(
        row.operation_id, coordinator.repository.rowToOperation(row));
      const [durable] = ledgerRows(leader);
      assert.equal(deliveries, 0);
      assert.equal(durable.workflow_step, WORKFLOW_STEP.PENDING,
        'a lost bootstrap history CAS cannot partially claim SENDING');
      assert.deepEqual(JSON.parse(durable.steps_history), winner,
        'the competing history is preserved');
      assert.equal(durable.completed_at, null);
    } finally {
      await coordinator.shutdown();
    }
  });
});

test('an authority response at the original deadline cannot stamp or claim a placement', async () => {
  await withNativeCreate(async (leader, row) => {
    const deadline = row.created_at + TIMEOUT_BUDGET_DEFAULT.REBALANCE_OPERATION_BUDGET_MS;
    let now = deadline - 1;
    let reads = 0;
    let deliveries = 0;
    const coordinator = createBindingCoordinator(leader, () => {
      reads += 1;
      now = deadline;
      return committedStampFor([VOTER_ID]);
    }, () => {
      deliveries += 1;
      throw new Error('expired bootstrap should never reach CREATE');
    });
    const owner = coordinator.workflowOwner;
    owner.timeSource = {now: () => now};
    try {
      await owner.advanceReservationClearedDispatch(
        row.operation_id, coordinator.repository.rowToOperation(row));
      assert.equal(reads, 1, 'the committed membership read began under the original budget');
      assert.deepEqual(ledgerRows(leader), [row], 'late success changes no durable effect');
      await owner.advanceReservationClearedDispatch(
        row.operation_id, coordinator.repository.rowToOperation(row));
      assert.equal(reads, 1, 'expiry refuses a new bootstrap authority read');
      assert.equal(deliveries, 0);
    } finally {
      await coordinator.shutdown();
    }
  });
});

test('stale placement dispatch cannot put a progressed ADD back in SENDING', async () => {
  await withNativeCreate(async (leader, row) => {
    const requests = [];
    const coordinator = createBindingCoordinator(leader, () => committedStampFor([VOTER_ID]),
      (_address, request) => requests.push(request));
    try {
      await bind(coordinator, coordinator.repository.rowToOperation(row));
      const [bound] = ledgerRows(leader);
      const step = WORKFLOW_STEP.CREATING;
      const at = bound.updated_at + 1;
      assert.equal(commitLedgerStatement(leader, 'bootstrap:target-progress',
        `UPDATE replica_operations SET workflow_step = ?, status = ?, updated_at = ?,
         steps_history = json_insert(steps_history, '$[#]', json(?)) WHERE operation_id = ?`,
        [step, WORKFLOW_STEP_TO_STATUS[step], at, JSON.stringify({step, timestamp: at}),
          row.operation_id]), null);
      const [progressed] = ledgerRows(leader);
      await coordinator.workflowOwner.executeOperationInternal(
        {...coordinator.repository.rowToOperation(bound), workflowStep: WORKFLOW_STEP.SENDING}, {},
      );
      assert.deepEqual(ledgerRows(leader), [progressed]);
      assert.deepEqual(requests, []);
    } finally {
      await coordinator.shutdown();
    }
  });
});
