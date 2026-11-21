import assert from 'node:assert/strict';
import {test} from 'node:test';
import {TABLES, WORKFLOW_STEP} from '../../src/constants/index.js';
import {ControlPlaneSystemTableGateway} from
  '../../src/control-plane/control-plane-system-table-gateway.js';
import {CREATE_ADMISSION_STATE} from '../../src/node/replica-create-admission-owner.js';
import {readCommittedStatementOutcome} from
  '../../src/partition/partition-committed-statement-outcome.js';
import {OPERATION_METADATA_KEY, ReplicaStatus, WORKFLOW_STEP_TO_STATUS} from
  '../../src/rebalancer/replica-operation-progress.js';
import {buildReplicaCreateAdmissionToken, buildReplicaCreateAttemptToken} from
  '../../src/rebalancer/replica-create-admission-token.js';
import {
  NODE, admitOnLeader, commitLedgerStatement, ledgerRows, onLedgerLeader, placementStatement,
} from '../partition/placement-admission-fixture.js';
import {createLifecycleControlPlaneGatewayForCache} from
  '../test-helpers/lifecycle-state-store.js';
import {
  createHandlerFixture, targetLifecycle, waitForCreateCompletion, waitForPhysicalStart,
} from '../test-helpers/replica-create-admission-recovery-fixture.js';
import {committedStampFor} from './replica-handler-bootstrap-stamps.js';

const PARTITION_ID = 'retained-original-bootstrap-p1';
const INITIAL_BOOT = 101;
const RESTARTED_BOOT = 102;
const planner = new ControlPlaneSystemTableGateway();

function restartAuthority(leader, cache) {
  const lifecycle = createLifecycleControlPlaneGatewayForCache(cache);
  let writes = 0;
  return {
    read: (operationId) => leader.db.prepare(
      'SELECT * FROM replica_operations WHERE operation_id = ?').get(operationId),
    writeCount: () => writes,
    lifecycleStore: lifecycle.store,
    gateway: {
      async readAuthoritativeRows(table, sql, params) {
        if (table === TABLES.NODES) {
          return {success: true, rows: [{node_id: NODE.B, boot_incarnation: RESTARTED_BOOT}]};
        }
        if (table === TABLES.REPLICA_OPERATIONS) {
          return {success: true, rowSetComplete: true, rows: leader.db.prepare(sql).all(...params)};
        }
        return lifecycle.readAuthoritativeRows(table, sql, params);
      },
      async updateSystemTableRow(tableName, whereClause, data) {
        assert.equal(tableName, TABLES.REPLICA_OPERATIONS);
        const entryId = `retained-bootstrap:write:${++writes}`;
        const {sql, params} = planner.buildSqlMutationPlan({
          operation: 'update', tableName, whereClause, data,
        });
        assert.equal(commitLedgerStatement(leader, entryId, sql, params), null);
        const {changes} = readCommittedStatementOutcome(leader, `entry:${entryId}`);
        return {success: true, outcome: changes === 1 ? 'applied' : 'no_op'};
      },
      submitMutation: lifecycle.submitMutation,
    },
  };
}

async function admitBeforeRestart(leader, proposed, originalStamp) {
  const {command} = await admitOnLeader(leader, proposed, 'retained-bootstrap:place',
    placementStatement({partitionId: PARTITION_ID, target: NODE.B}));
  assert.ok(command, 'the native placement owner committed one operation');
  const [row] = ledgerRows(leader);
  const history = JSON.parse(row.steps_history);
  const at = row.updated_at + 1;
  const step = WORKFLOW_STEP.SENDING;
  history.push({step, timestamp: at});
  if (originalStamp) history[0][OPERATION_METADATA_KEY.BOOTSTRAP_MEMBERSHIP] = originalStamp;
  const token = buildReplicaCreateAdmissionToken({
    operationId: row.operation_id, replicaId: row.replica_id,
    targetNodeId: NODE.B, workflowUpdatedAt: at,
  });
  const attempt = buildReplicaCreateAttemptToken(token, 1);
  assert.equal(commitLedgerStatement(leader, 'retained-bootstrap:admit',
    `UPDATE replica_operations SET workflow_step = ?, status = ?, updated_at = ?, steps_history = ?,
     create_admission_state = ?, create_admission_token = ?, create_admission_replica_created_at = ?,
     create_admission_attempt_token = ?, create_admission_attempt_seq = ?,
     create_admission_workflow_updated_at = ?, create_admission_owner_incarnation = ?
     WHERE operation_id = ?`,
    [step, WORKFLOW_STEP_TO_STATUS[step], at, JSON.stringify(history),
      CREATE_ADMISSION_STATE.ADMITTED, token, at + 1, attempt, 1, at, INITIAL_BOOT,
      row.operation_id]), null);
  return ledgerRows(leader)[0];
}

test('restart preserves missing original bootstrap without new target lifecycle or timer',
  async () => onLedgerLeader(async (leader, proposed) => {
    const row = await admitBeforeRestart(leader, proposed, null);
    const {handler, authority, physicalStarts} = await createHandlerFixture({
      row, authorityFor: (cache) => restartAuthority(leader, cache),
    });
    try {
      await handler.startReplicaCreateAdmissionRecovery();
      const adopted = authority.read(row.operation_id);
      assert.equal(adopted.create_admission_owner_incarnation, RESTARTED_BOOT);
      assert.equal(adopted.create_admission_state, CREATE_ADMISSION_STATE.ADMITTED,
        'absent original topology retains the existing durable attempt');
      assert.equal(authority.lifecycleStore.durableRow(TABLES.SERVICES, row.replica_id), null,
        'missing original topology cannot publish NEW or FAILED target lifecycle');
      assert.equal(physicalStarts(), 0);
      assert.equal(handler.replicaCreateAdmissionRecoveryRearmOwner.current(), null,
        'a missing original is not a transient read refusal');
      const retainedWrites = authority.writeCount();
      await handler.startReplicaCreateAdmissionRecovery();
      await handler.startReplicaCreateAdmissionRecovery();
      assert.deepEqual(authority.read(row.operation_id), adopted);
      assert.equal(authority.writeCount(), retainedWrites, 'explicit wakes cannot reclaim this attempt');
      assert.equal(physicalStarts(), 0);
    } finally {
      await handler.shutdown();
    }
  }));

test('restart with original bootstrap and the exact retained generation still progresses',
  async () => onLedgerLeader(async (leader, proposed) => {
    const row = await admitBeforeRestart(leader, proposed, committedStampFor(['leader-replica']));
    const fixture = await createHandlerFixture({
      row, authorityFor: (cache) => restartAuthority(leader, cache),
    });
    try {
      const completed = waitForCreateCompletion(fixture.handler);
      fixture.releaseFactory();
      await fixture.handler.startReplicaCreateAdmissionRecovery();
      await completed;
      const durable = fixture.authority.read(row.operation_id);
      assert.equal(durable.create_admission_state, CREATE_ADMISSION_STATE.ACTIVE);
      assert.equal(durable.create_admission_attempt_token, row.create_admission_attempt_token);
      assert.equal(fixture.physicalStarts(), 1);
    } finally {
      await fixture.handler.shutdown();
    }
  }));

test('exact durable target FAILED can settle without inventing original bootstrap',
  async () => onLedgerLeader(async (leader, proposed) => {
    const row = await admitBeforeRestart(leader, proposed, null);
    const fixture = await createHandlerFixture({
      row, targetRow: targetLifecycle(row, {status: ReplicaStatus.FAILED}),
      authorityFor: (cache) => restartAuthority(leader, cache),
    });
    try {
      await fixture.handler.startReplicaCreateAdmissionRecovery();
      const durable = fixture.authority.read(row.operation_id);
      assert.equal(durable.create_admission_state, CREATE_ADMISSION_STATE.FAILED);
      assert.equal(durable.create_admission_attempt_token, row.create_admission_attempt_token);
      assert.equal(fixture.physicalStarts(), 0, 'permanent exact failure is adopted, not re-created');
    } finally {
      await fixture.handler.shutdown();
    }
  }));

test('only a durable original bootstrap and its publication wake the exact stopped attempt',
  async () => onLedgerLeader(async (leader, proposed) => {
    const row = await admitBeforeRestart(leader, proposed, null);
    const fixture = await createHandlerFixture({
      row, authorityFor: (cache) => restartAuthority(leader, cache),
    });
    try {
      await fixture.handler.startReplicaCreateAdmissionRecovery();
      const parked = fixture.authority.read(row.operation_id);
      const history = JSON.parse(parked.steps_history);
      history[0][OPERATION_METADATA_KEY.BOOTSTRAP_MEMBERSHIP] = committedStampFor(['leader-replica']);
      const publish = (publishedRow) =>
        fixture.cache.applySystemTableChange(TABLES.REPLICA_OPERATIONS, 'UPSERT', publishedRow);
      const projected = {...parked, steps_history: JSON.stringify(history)};
      publish(projected);
      await waitForPhysicalStart(fixture);
      assert.equal(fixture.physicalStarts(), 0, 'projection is never bootstrap authority');

      const completed = waitForCreateCompletion(fixture.handler);
      completed.catch(() => {});
      assert.equal(commitLedgerStatement(leader, 'retained-bootstrap:publish-original',
        'UPDATE replica_operations SET steps_history = ?, updated_at = ? WHERE operation_id = ?',
        [projected.steps_history, parked.updated_at + 1, parked.operation_id]), null);
      publish(fixture.authority.read(row.operation_id));
      await waitForPhysicalStart(fixture);
      assert.equal(fixture.physicalStarts(), 1, 'the durable original publication wakes recovery');
      fixture.releaseFactory();
      await completed;
      const durable = fixture.authority.read(row.operation_id);
      assert.equal(durable.create_admission_state, CREATE_ADMISSION_STATE.ACTIVE);
      assert.equal(durable.create_admission_attempt_token, parked.create_admission_attempt_token);
    } finally {
      fixture.releaseFactory();
      await fixture.handler.shutdown();
    }
  }));

test('exact terminal operation publication closes parked admission without a target effect',
  async () => onLedgerLeader(async (leader, proposed) => {
    const row = await admitBeforeRestart(leader, proposed, null);
    const fixture = await createHandlerFixture({
      row, authorityFor: (cache) => restartAuthority(leader, cache),
    });
    try {
      await fixture.handler.startReplicaCreateAdmissionRecovery();
      const parked = fixture.authority.read(row.operation_id);
      const settledAt = parked.updated_at + 1;
      assert.equal(commitLedgerStatement(leader, 'retained-bootstrap:publish-terminal',
        `UPDATE replica_operations SET workflow_step = ?, status = ?, updated_at = ?, completed_at = ?
        WHERE operation_id = ?`,
        [WORKFLOW_STEP.FAILED, ReplicaStatus.FAILED, settledAt, settledAt, parked.operation_id]),
      null);
      fixture.cache.applySystemTableChange(TABLES.REPLICA_OPERATIONS, 'UPSERT',
        fixture.authority.read(row.operation_id));
      let settled = null;
      for (let turn = 0; turn < 40; turn += 1) {
        settled = fixture.authority.read(row.operation_id);
        if (settled.create_admission_state === CREATE_ADMISSION_STATE.CLOSED) break;
        await new Promise((resolve) => setImmediate(resolve));
      }
      assert.equal(settled?.create_admission_state, CREATE_ADMISSION_STATE.CLOSED);
      assert.equal(settled?.completed_at, settledAt);
      assert.equal(settled?.create_admission_attempt_token, parked.create_admission_attempt_token);
      assert.equal(fixture.physicalStarts(), 0);
      const lifecycle = fixture.authority.lifecycleStore.durableRow(
        TABLES.SERVICES, row.replica_id,
      );
      assert.equal(lifecycle, null);
      assert.equal(fixture.handler.replicaCreateAdmissionRecoveryRearmOwner.current(), null);
    } finally {
      await fixture.handler.shutdown();
    }
  }));
