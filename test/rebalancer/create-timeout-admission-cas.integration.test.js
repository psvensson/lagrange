import assert from 'node:assert/strict';
import {test} from 'node:test';

import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {SERVICE_TYPE} from '../../src/constants/service.js';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';
import {ControlPlaneSystemTableGateway} from
  '../../src/control-plane/control-plane-system-table-gateway.js';
import {TIMEOUT_BUDGET_DEFAULT} from '../../src/control-plane/timeout-budget.js';
import {
  CREATE_ADMISSION_ERROR_CODE, CREATE_ADMISSION_STATE, ReplicaCreateAdmissionOwner,
} from '../../src/node/replica-create-admission-owner.js';
import {readCommittedStatementOutcome} from
  '../../src/partition/partition-committed-statement-outcome.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {OPERATION_RECONCILE_OUTCOME} from
  '../../src/rebalancer/operation-workflow-reconcile-outcome.js';
import {buildFailedCreateCleanupToken} from '../../src/rebalancer/failed-create-cleanup-token.js';
import {runTerminalTransitionRepairAttempt} from
  '../../src/rebalancer/operation-workflow-terminal-transition-repair.js';
import {REBALANCE_COORDINATOR_EVENT} from '../../src/rebalancer/rebalancer-constants.js';
import {
  buildReplicaCreateAdmissionToken, buildReplicaCreateAttemptToken,
} from '../../src/rebalancer/replica-create-admission-token.js';
import {
  OPERATION_METADATA_KEY, OperationType, ReplicaStatus, WORKFLOW_STEP_TO_STATUS,
} from '../../src/rebalancer/replica-operation-progress.js';
import {
  NODE, commitLedgerStatement, ledgerRows, onLedgerLeader,
} from '../partition/placement-admission-fixture.js';
import {installCommittedOperationMutationFixture} from './operation-outcome-fixture.js';
import {
  createCoordinatorSqlStore, createMockCache, createMockControlPlaneSystemTableGateway,
  createTestCoordinator,
} from './test-helpers.js';

const OPERATION_ID = 'op-create-timeout-admission';
const PARTITION_ID = 'create-timeout-race-p1';
const REPLICA_ID = `${PARTITION_ID}-r2`;
const OWNER_BOOT = 101;
const planner = new ControlPlaneSystemTableGateway();

function createRequest(row) {
  const admissionToken = buildReplicaCreateAdmissionToken({
    operationId: row.operation_id, replicaId: row.replica_id,
    targetNodeId: row.target_node_id, workflowUpdatedAt: row.updated_at,
  });
  return {
    operationId: row.operation_id,
    operationType: row.type,
    entityType: row.entity_type,
    entityId: row.entity_id,
    partitionId: row.partition_id,
    replicaId: row.replica_id,
    admissionToken,
    attemptToken: buildReplicaCreateAttemptToken(admissionToken, 1),
    attemptSeq: 1,
    workflowUpdatedAt: row.updated_at,
  };
}

async function withExpiredStep(measure, {step = WORKFLOW_STEP.SENDING} = {}) {
  await onLedgerLeader(async (leader) => {
    const cache = createMockCache();
    const otherTables = createCoordinatorSqlStore(cache);
    const sql = {async executeQuery(statement, params = []) {
      if (/\breplica_operations\b/u.test(statement)) {
        const prepared = leader.db.prepare(statement);
        assert.equal(prepared.reader, true, 'the operation ledger writes through committed apply');
        return {success: true, rowSetComplete: true, rows: prepared.all(...params)};
      }
      if (/\bFROM nodes\b/u.test(statement)) {
        const rows = params[0] === NODE.B ? [{node_id: NODE.B, boot_incarnation: OWNER_BOOT}] : [];
        return {success: true, rowSetComplete: true, rows};
      }
      return otherTables.execute(statement, params);
    }};
    const gateway = createMockControlPlaneSystemTableGateway(sql);
    let writeSequence = 0;
    const failWrites = [];
    let nextFailureWrite = null;
    function commitMutation(mutation) {
      const {sql: statement, params} = planner.buildSqlMutationPlan(mutation);
      const entryId = `create-timeout:write:${++writeSequence}`;
      assert.equal(commitLedgerStatement(leader, entryId, statement, params), null);
      const result = readCommittedStatementOutcome(leader, `entry:${entryId}`);
      assert.ok(Number.isInteger(result.changes));
      return {success: true, partitionResult: {affectedRows: result.changes}};
    }
    gateway.submitMutation = async (mutation) => {
      if (mutation.tableName !== SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) {
        return otherTables.submitMutation(mutation);
      }
      if (mutation.data?.workflow_step === WORKFLOW_STEP.FAILED) {
        failWrites.push(mutation);
        const intercept = nextFailureWrite;
        nextFailureWrite = null;
        if (intercept) return intercept(() => commitMutation(mutation));
      }
      return commitMutation(mutation);
    };
    installCommittedOperationMutationFixture(gateway);
    gateway.updateSystemTableRow = gateway.cdcIntegrationService.updateSystemTableRow;
    const coordinator = createTestCoordinator({
      nodeId: NODE.A, systemTableCache: cache, sqlQueryEngine: sql,
      controlPlaneSystemTableGateway: gateway,
    });
    const owner = coordinator.workflowOwner;
    const target = new ReplicaCreateAdmissionOwner({
      nodeId: NODE.B, ownerIncarnation: OWNER_BOOT, gateway,
    });
    try {
      const now = Date.now();
      const elapsedMs = owner.getTimeoutForStep(step, {partitionId: PARTITION_ID}) + 1;
      assert.ok(elapsedMs < TIMEOUT_BUDGET_DEFAULT.REBALANCE_OPERATION_BUDGET_MS);
      const startedAt = now - elapsedMs;
      const initial = {
        operation_id: OPERATION_ID, partition_id: PARTITION_ID, replica_id: REPLICA_ID,
        type: OperationType.ADD, entity_type: SERVICE_TYPE.PARTITION, entity_id: PARTITION_ID,
        source_node_id: NODE.A, target_node_id: NODE.B, status: WORKFLOW_STEP_TO_STATUS[step],
        workflow_step: step, created_at: startedAt, updated_at: startedAt, completed_at: null,
        steps_history: JSON.stringify([{step, timestamp: startedAt}]),
      };
      commitMutation({operation: 'insert', tableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        row: initial});
      const row = () => ledgerRows(leader)[0];
      const reservation = () => otherTables.execute(
        'SELECT * FROM storage_reservations WHERE operation_id = ?', [OPERATION_ID]).rows[0];
      const operation = () => owner.repository.rowToOperation(row());
      assert.equal(owner.isOperationStepTimedOut(operation(), now), true,
        'the original step expired before the operation budget');
      await coordinator.createReservationForOperation(operation(), {resolvedEntitySizeBytes: 1});
      assert.equal(reservation()?.released_at, null, 'fixture starts with one active reservation');
      const failures = [];
      coordinator.on(REBALANCE_COORDINATOR_EVENT.OPERATION_FAILED,
        ({operation: failed}) => failures.push(failed));
      const request = createRequest(row());
      await measure({
        owner, target, request, row, reservation, failures, failWrites,
        expire: () => owner.reconcileTimeoutOperation(operation(), now),
        interceptFailureWrite: (intercept) => {
          nextFailureWrite = intercept;
        },
        reportTarget(evidence, status) {
          cache.upsert(SYSTEM_TABLE_NAME.SERVICES, {
            service_id: REPLICA_ID, replica_id: REPLICA_ID, node_id: NODE.B,
            partition_id: PARTITION_ID, group_id: null, service_type: SERVICE_TYPE.PARTITION,
            status, previous_state: ReplicaStatus.CREATING, raft_role: RAFT_ROLE.LEADER,
            created_at: evidence.replicaCreatedAt, state_entered_at: Date.now(),
            cleanup_token: status === ReplicaStatus.FAILED ?
              buildFailedCreateCleanupToken(OPERATION_ID) : null,
            create_attempt_token: evidence.attemptToken,
          });
        },
      });
    } finally {
      try {
        await coordinator.shutdown();
      } finally {
        otherTables.suspend();
      }
    }
  });
}

function assertRetained(run, evidence) {
  assert.equal(run.row().completed_at, null, 'the exact CREATE remains nonterminal');
  assert.equal(run.row().create_admission_token, evidence.admissionToken);
  assert.equal(run.row().create_admission_attempt_token, evidence.attemptToken);
  assert.equal(run.row().create_admission_replica_created_at, evidence.replicaCreatedAt);
  assert.equal(run.row().create_admission_owner_incarnation, OWNER_BOOT);
  assert.equal(run.reservation().released_at, null, 'retained work keeps its reservation');
  assert.deepEqual(run.failures, [], 'no terminal failure was published');
}

test('CREATE admitted at the timeout CAS retains its exact physical worker and reservation',
  async () => {
    await withExpiredStep(async (run) => {
      let admitted;
      let claim;
      run.interceptFailureWrite(async (commit) => {
        assert.equal(run.row().create_admission_state, null);
        admitted = await run.target.claim(run.request);
        claim = await run.target.claimPhysicalWorker(admitted);
        assert.ok(claim, 'the target took the real physical worker claim before terminal apply');
        return commit();
      });
      try {
        assert.equal(await run.expire(), OPERATION_RECONCILE_OUTCOME.WAITING);
        assert.equal(run.failWrites.length, 1, 'the competing timeout reached commit');
        assert.equal(run.failWrites[0].whereClause.create_admission_state, null);
        assertRetained(run, admitted);
        assert.equal(await run.target.revalidatePhysicalWorker(claim), true);
        const materialized = await run.target.markMaterialized(admitted);
        assert.ok(materialized);
        const active = await run.target.markProgress(materialized, CREATE_ADMISSION_STATE.ACTIVE);
        assert.ok(active, 'the same attempt can publish successful CREATE progress');
        run.reportTarget(active, ReplicaStatus.ACTIVE);
        const retry = run.owner.observedProgressRetryTimerByOperationId.get(OPERATION_ID);
        assert.ok(retry, 'the existing observation owner received the wake');
        run.owner.clearTimeoutFn(retry.timeoutHandle);
        await run.owner.runObservedProgressRetry(OPERATION_ID, retry.timeoutHandle);
        assert.equal(run.row().workflow_step, WORKFLOW_STEP.ACTIVE);
        assert.equal(run.row().create_admission_attempt_token, admitted.attemptToken);
        assert.ok(Number.isFinite(run.reservation().released_at));
        assert.deepEqual(run.failures, []);
      } finally {
        if (claim) run.target.releasePhysicalWorker(claim);
      }
    });
  });

test('an already materialized CREATE retains custody when the sender step expires', async () => {
  await withExpiredStep(async (run) => {
    const admitted = await run.target.claim(run.request);
    const materialized = await run.target.markMaterialized(admitted);
    assert.ok(materialized);
    assert.equal(await run.expire(), OPERATION_RECONCILE_OUTCOME.WAITING);
    assertRetained(run, materialized);
    assert.equal(run.row().create_admission_state, CREATE_ADMISSION_STATE.MATERIALIZED);
  });
});

test('a timeout that commits before admission releases and rejects the late CREATE', async () => {
  await withExpiredStep(async (run) => {
    await run.expire();
    assert.equal(run.row().workflow_step, WORKFLOW_STEP.FAILED);
    assert.ok(Number.isFinite(run.reservation().released_at));
    assert.equal(run.failures.length, 1);
    await assert.rejects(run.target.claim(run.request),
      {code: CREATE_ADMISSION_ERROR_CODE.REFUSED_TERMINAL});
    assert.equal(run.row().create_admission_state, null);
  });
});

test('timeout terminal repair preserves a subsequent exact CREATE admission', async () => {
  await withExpiredStep(async (run) => {
    run.interceptFailureWrite(async () => ({success: false, error: 'injected refused write'}));
    await assert.rejects(run.expire(), /injected refused write/u);
    assert.ok(run.owner.terminalTransitionRepairStateByOperationId.has(OPERATION_ID),
      'the original failed submission left its terminal repair');
    const admitted = await run.target.claim(run.request);
    await runTerminalTransitionRepairAttempt(run.owner, OPERATION_ID);
    assertRetained(run, admitted);
    assert.equal(run.failWrites.length, 1, 'repair did not reassert FAILED past admission');
    assert.equal(run.owner.terminalTransitionRepairStateByOperationId.has(OPERATION_ID), false);
    assert.equal(run.owner.observedProgressRetryTimerByOperationId.has(OPERATION_ID), true);
  });
});

test('an observed claimed target failure still settles through ordinary failure admission',
  async () => {
    await withExpiredStep(async (run) => {
      const admitted = await run.target.claim(run.request);
      const failed = await run.target.markProgress(admitted, CREATE_ADMISSION_STATE.FAILED);
      assert.ok(failed);
      run.reportTarget(failed, ReplicaStatus.FAILED);
      await run.expire();
      assert.equal(run.row().workflow_step, WORKFLOW_STEP.FAILED);
      assert.ok(Number.isFinite(run.reservation().released_at));
      assert.equal(run.failures.length, 1);
      const history = JSON.parse(run.row().steps_history);
      const claim =
        history.at(-1)[OPERATION_METADATA_KEY.FAILED_CREATE_TARGET_LIFECYCLE_PRECONDITION];
      assert.equal(claim?.create_attempt_token, failed.attemptToken);
      assert.equal(claim?.created_at, failed.replicaCreatedAt);
    });
  });
