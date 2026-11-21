import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ControlPlaneSystemTableGateway} from
  '../../src/control-plane/control-plane-system-table-gateway.js';
import {readCommittedStatementOutcome} from
  '../../src/partition/partition-committed-statement-outcome.js';
import {bindReplaceCreateTargetReplicaId} from
  '../../src/rebalancer/operation-workflow-replace-target-binding.js';
import {placementReplicaIdOf} from
  '../../src/partition/partition-placement-admission-identity.js';
import {OPERATION_METADATA_KEY} from '../../src/rebalancer/replica-operation-progress.js';
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

function createBindingCoordinator(leader, readMembership) {
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
    async deliver(_address, request) {
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

async function withNativeCreate(measure) {
  await onLedgerLeader(async (leader, proposed) => {
    const {command} = await admitOnLeader(
      leader, proposed, 'bootstrap:placement', placementStatement({
        partitionId: PARTITION_ID, target: NODE.B,
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
      assert.deepEqual(history[0][OPERATION_METADATA_KEY.REPLICA_IDS], [VOTER_ID, row.replica_id]);
      assert.deepEqual(history[0][OPERATION_METADATA_KEY.PEER_ADDRESSES],
        [`${NODE.B}/partition/${row.replica_id}`]);
      assert.equal(durable.operation_id, row.operation_id);
      assert.equal(durable.workflow_step, row.workflow_step);

      const reconstructed = createBindingCoordinator(leader, () => {
        membershipReads += 1;
        return committedStampFor([VOTER_ID], {appliedIndex: stamp.appliedIndex + 1});
      });
      try {
        const recovered = await bind(reconstructed,
          reconstructed.repository.rowToOperation(durable));
        assert.deepEqual(recovered[ReplicaOperationField.BOOTSTRAP_MEMBERSHIP], stamp);
        assert.equal(membershipReads, 1, 'reconstruction reuses the original stamp');
        assert.deepEqual(ledgerRows(leader), [durable], 'recovery does not rewrite the row');
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
