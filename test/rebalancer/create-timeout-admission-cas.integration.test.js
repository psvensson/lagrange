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
import {
  ReplicaOperationField, ReplicaOperationMessageType, ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {OPERATION_WORKFLOW_OWNER_SEGMENT_7_STAGE_SHARED as DRAIN} from
  '../../src/rebalancer/operation-workflow-recovery-reconcile-shared.js';
import {OPERATION_RECONCILE_OUTCOME} from
  '../../src/rebalancer/operation-workflow-reconcile-outcome.js';
import {buildFailedCreateCleanupToken} from '../../src/rebalancer/failed-create-cleanup-token.js';
import {runTerminalTransitionRepairAttempt} from
  '../../src/rebalancer/operation-workflow-terminal-transition-repair.js';
import {REBALANCE_COORDINATOR_EVENT} from '../../src/rebalancer/rebalancer-constants.js';
import {REPLICA_OPERATION_VISIBILITY_CONFIRMATION_STATE} from
  '../../src/rebalancer/replica-operation-repository.js';
import {
  buildReplicaCreateAdmissionToken, buildReplicaCreateAttemptToken,
} from '../../src/rebalancer/replica-create-admission-token.js';
import {
  OPERATION_METADATA_KEY, OperationType, ReplicaStatus, WORKFLOW_STEP_TO_STATUS,
} from '../../src/rebalancer/replica-operation-progress.js';
import {
  NODE, commitLedgerStatement, ledgerRows, onLedgerLeader,
} from '../partition/placement-admission-fixture.js';
import {readLeaderBootstrapStamp} from '../raft/raft-rs-backend/founding-growth-test-support.js';
import {PartitionNodeCluster} from '../raft/raft-rs-backend/partition-node-cluster.js';
import {buildPriorityDrainReadinessService} from
  './rebalance-coordinator-stopping-reconcile-fixtures.js';
import {installCommittedOperationMutationFixture} from './operation-outcome-fixture.js';
import {
  createCoordinatorSqlStore, createMockCache, createMockControlPlaneSystemTableGateway,
  createTestCoordinator,
} from './test-helpers.js';

const OPERATION_ID = 'op-create-timeout-admission';
const PARTITION_ID = 'create-timeout-race-p1';
const PRIORITY_PARTITION_ID = 'replica_operations-p1';
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

async function withExpiredStep(measure, {
  step = WORKFLOW_STEP.SENDING, sourceStamp = null, partitionId = PARTITION_ID,
  nodeId = NODE.A, controlPlaneReadinessService,
} = {}) {
  const sourceId = `${partitionId}-r1`;
  const replicaId = `${partitionId}-r2`;
  await onLedgerLeader(async (leader) => {
    const source = sourceStamp ? {
      service_id: sourceId, replica_id: sourceId, node_id: NODE.A,
      partition_id: partitionId, group_id: null, service_type: SERVICE_TYPE.PARTITION,
      status: ReplicaStatus.ACTIVE, raft_role: RAFT_ROLE.LEADER,
      address: `${NODE.A}/partition/${sourceId}`,
    } : null;
    const cache = createMockCache({services: source ? [source] : []});
    const otherTables = createCoordinatorSqlStore(cache);
    let exactPointReadUnavailable = false;
    let unavailableExactPointReads = 0;
    const sql = {async executeQuery(statement, params = []) {
      if (/\breplica_operations\b/u.test(statement)) {
        if (exactPointReadUnavailable && statement.includes('WHERE operation_id = ?') &&
            params[0] === OPERATION_ID) {
          unavailableExactPointReads += 1;
          return {success: false, error: 'control_plane_pressure_degraded',
            errorCode: 'CONTROL_PLANE_PRESSURE_DEGRADED', retryAfterMs: 1};
        }
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
      nodeId, systemTableCache: cache, sqlQueryEngine: sql,
      ...(controlPlaneReadinessService ? {controlPlaneReadinessService} : {}),
      controlPlaneSystemTableGateway: gateway,
    });
    const owner = coordinator.workflowOwner;
    const target = new ReplicaCreateAdmissionOwner({
      nodeId: NODE.B, ownerIncarnation: OWNER_BOOT, gateway,
    });
    try {
      const now = Date.now();
      const elapsedMs = owner.getTimeoutForStep(step, {partitionId}) + 1;
      assert.ok(elapsedMs < TIMEOUT_BUDGET_DEFAULT.REBALANCE_OPERATION_BUDGET_MS);
      const startedAt = now - elapsedMs;
      const first = {step, timestamp: startedAt};
      if (sourceStamp) {
        first[OPERATION_METADATA_KEY.SOURCE_REPLICA_ID] = sourceId;
        first[OPERATION_METADATA_KEY.BOOTSTRAP_MEMBERSHIP] = sourceStamp;
        first[OPERATION_METADATA_KEY.REPLICA_IDS] = [sourceId, replicaId];
        first[OPERATION_METADATA_KEY.PEER_ADDRESSES] = [source.address];
      }
      const initial = {
        operation_id: OPERATION_ID, partition_id: partitionId, replica_id: replicaId,
        type: sourceStamp ? OperationType.REPLACE : OperationType.ADD,
        entity_type: SERVICE_TYPE.PARTITION, entity_id: partitionId,
        source_node_id: NODE.A, target_node_id: NODE.B, status: WORKFLOW_STEP_TO_STATUS[step],
        workflow_step: step, created_at: startedAt, updated_at: startedAt, completed_at: null,
        steps_history: JSON.stringify([first]),
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
        owner, target, request, row, reservation, failures, failWrites, operation,
        async drain() {
          const current = operation();
          const snapshot = await owner.buildPriorityRecoveryOperationDrainSnapshot(current);
          assert.equal(snapshot.action,
            DRAIN.OPERATION_LIFECYCLE_ACTION.FAIL_PRIORITY_RECOVERY_DRAIN_STALE,
            JSON.stringify(snapshot));
          assert.equal(snapshot.ownerAction,
            DRAIN.PRIORITY_RECOVERY_OPERATION_DRAIN_OWNER_ACTION.ALLOW_RECONCILE);
          return owner.reconcilePriorityRecoveryOperationDrain(current, snapshot);
        },
        expire: (candidate = operation()) => owner.reconcileTimeoutOperation(candidate, now),
        async expireWithoutPointAuthority() {
          exactPointReadUnavailable = true;
          try {
            return await owner.reconcileTimeoutOperation(operation(), now);
          } finally {
            exactPointReadUnavailable = false;
          }
        },
        async sweepWithDeferredVisibility(interleave) {
          const emptyBackoffMs = owner.incompleteOperationQueryEmptyBackoffMs;
          owner.incompleteOperationQueryEmptyBackoffMs = 0;
          const repository = owner.repository;
          const observeVisibility = repository.getOperationByIdVisibilityObservation
            .bind(repository);
          const observeAuthority = repository.queryAuthoritativeOperationVisibilityObservation
            .bind(repository);
          let armed = true;
          let observation;
          let strictPointRead;
          const previousFaultCount = unavailableExactPointReads;
          const deferOnce = async (observe, id, options, isSweepRead) => {
            if (id !== OPERATION_ID || !isSweepRead || !armed) return observe(id, options);
            armed = false;
            strictPointRead = options.requireCompleteExactKey === true;
            await interleave();
            exactPointReadUnavailable = true;
            try {
              observation = await observe(id, options);
              return observation;
            } finally {
              exactPointReadUnavailable = false;
            }
          };
          repository.getOperationByIdVisibilityObservation = (id, options) =>
            deferOnce(observeVisibility, id, options,
              options?.allowPriorityRecoveryDeferredVisibility === true);
          repository.queryAuthoritativeOperationVisibilityObservation = (id, options) =>
            deferOnce(observeAuthority, id, options,
              options?.requireCompleteExactKey === true);
          try {
            await coordinator.checkTimeouts();
            assert.equal(armed, false, 'the periodic sweep reached the exact point read');
            assert.ok(unavailableExactPointReads > previousFaultCount,
              'the gateway returned pressure at the exact operation key');
            assert.equal(observation?.operation, null, 'the sweep point read returned no operation');
            if (strictPointRead) {
              assert.equal(observation?.deferredOutcome?.confirmationState,
                REPLICA_OPERATION_VISIBILITY_CONFIRMATION_STATE.DEFERRED);
              assert.equal(observation.deferredOutcome.operationId, OPERATION_ID);
            }
          } finally {
            repository.getOperationByIdVisibilityObservation = observeVisibility;
            repository.queryAuthoritativeOperationVisibilityObservation = observeAuthority;
            owner.incompleteOperationQueryEmptyBackoffMs = emptyBackoffMs;
          }
        },
        async sweepWithAvailableVisibility() {
          const emptyBackoffMs = owner.incompleteOperationQueryEmptyBackoffMs;
          owner.incompleteOperationQueryEmptyBackoffMs = 0;
          try {
            await coordinator.checkTimeouts();
          } finally {
            owner.incompleteOperationQueryEmptyBackoffMs = emptyBackoffMs;
          }
        },
        advancePending(winningStep = WORKFLOW_STEP.SENDING) {
          const before = row();
          const updatedAt = Date.now();
          const steps = JSON.parse(before.steps_history);
          steps.push({step: winningStep, timestamp: updatedAt,
            previousStep: WORKFLOW_STEP.PENDING});
          const result = commitMutation({operation: 'update',
            tableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
            whereClause: {operation_id: OPERATION_ID, workflow_step: WORKFLOW_STEP.PENDING,
              updated_at: before.updated_at, completed_at: null},
            data: {workflow_step: winningStep, updated_at: updatedAt,
              steps_history: JSON.stringify(steps)},
          });
          assert.equal(result.partitionResult.affectedRows, 1, 'the independent committed step wins');
          assert.equal(owner.isOperationStepTimedOut(operation(), Date.now()), false,
            'the newer durable workflow state is still within its step budget');
        },
        materializeStoredReplaceSource() {
          const decodedSource = operation().sourceReplicaId;
          assert.ok(decodedSource);
          const result = commitMutation({operation: 'update',
            tableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
            whereClause: {operation_id: OPERATION_ID, source_replica_id: null},
            data: {source_replica_id: decodedSource},
          });
          assert.equal(result.partitionResult.affectedRows, 1);
          assert.equal(operation().sourceReplicaId, decodedSource,
            'the exact-row change leaves the decoded retiring source unchanged');
        },
        interceptFailureWrite: (intercept) => {
          nextFailureWrite = intercept;
        },
        reportTarget(evidence, status) {
          cache.upsert(SYSTEM_TABLE_NAME.SERVICES, {
            service_id: replicaId, replica_id: replicaId, node_id: NODE.B,
            partition_id: partitionId, group_id: null, service_type: SERVICE_TYPE.PARTITION,
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
        owner.clearCreatedOperationHandoffRetry(OPERATION_ID);
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

test('unknown timeout authority cannot establish a terminal write', async () => {
  await withExpiredStep(async (run) => {
    const original = run.row();
    const before = run.owner.stats.operationsTimedOut;
    await assert.rejects(run.expireWithoutPointAuthority());
    assert.deepEqual(run.row(), original);
    assert.equal(run.reservation().released_at, null);
    assert.deepEqual(run.failures, []);
    assert.equal(run.failWrites.length, 0);
    assert.equal(run.owner.stats.operationsTimedOut, before);
  }, {step: WORKFLOW_STEP.PENDING});
});

test('repair of the same timeout preimage earns credit only after a committed failure', async () => {
  await withExpiredStep(async (run) => {
    const before = run.owner.stats.operationsTimedOut;
    run.interceptFailureWrite(async () => ({success: false, error: 'injected refused write'}));
    await assert.rejects(run.expire(), /injected refused write/u);
    assert.equal(run.owner.stats.operationsTimedOut, before);
    await runTerminalTransitionRepairAttempt(run.owner, OPERATION_ID);
    assert.equal(run.row().workflow_step, WORKFLOW_STEP.FAILED);
    assert.equal(run.owner.stats.operationsTimedOut, before + 1);
    assert.deepEqual(run.failWrites[0].whereClause, run.failWrites[1].whereClause,
      'the repair uses the identical workflow, payload and absence preimage');
  });
});

test('an elapsed PENDING timer cannot re-anchor itself to a fresh SENDING preimage', async () => {
  await withExpiredStep(async (run) => {
    const expired = run.operation();
    run.advancePending();
    const winner = run.row();
    const before = run.owner.stats.operationsTimedOut;

    await run.expire(expired);
    assert.deepEqual(run.row(), winner, 'the original PENDING expiry is no longer current');
    assert.equal(run.reservation().released_at, null);
    assert.deepEqual(run.failures, []);
    assert.equal(run.failWrites.length, 0);
    assert.equal(run.owner.stats.operationsTimedOut, before);
  }, {step: WORKFLOW_STEP.PENDING});
});

test('an expired PENDING decision cannot fail a fresher SENDING row after deferred visibility',
  async () => {
    await withExpiredStep(async (run) => {
      const before = run.owner.stats.operationsTimedOut;
      let newer;
      await run.sweepWithDeferredVisibility(() => {
        run.advancePending();
        newer = run.row();
      });
      assert.ok(newer, 'the actual timeout sweep reaches the authority boundary');
      assert.deepEqual(run.row(), newer, 'fresh authority does not transfer the old expiry decision');
      assert.equal(run.reservation().released_at, null);
      assert.deepEqual(run.failures, []);
      assert.equal(run.failWrites.length, 0, 'the changed preimage is refused before terminal SQL');
      assert.equal(run.owner.stats.operationsTimedOut, before);
    }, {step: WORKFLOW_STEP.PENDING});
  });

for (const winningStep of [WORKFLOW_STEP.SENDING, WORKFLOW_STEP.PENDING]) {
  test(`an expired PENDING CAS cannot overtake committed ${winningStep} progress`,
    async () => {
      await withExpiredStep(async (run) => {
        const before = run.owner.stats.operationsTimedOut;
        let winner;
        run.interceptFailureWrite(async (commit) => {
          run.advancePending(winningStep);
          winner = run.row();
          return commit();
        });
        await run.expire();
        assert.ok(winner, 'the mutation boundary saw the actual competing write');
        assert.deepEqual(run.row(), winner);
        assert.equal(run.reservation().released_at, null);
        assert.deepEqual(run.failures, []);
        assert.equal(run.owner.stats.operationsTimedOut, before,
          'the guarded zero-row result earns no timeout credit');
        await runTerminalTransitionRepairAttempt(run.owner, OPERATION_ID);
        assert.deepEqual(run.row(), winner, 'repair retains the exact original timeout condition');
        assert.equal(run.failWrites.length, 1, 'a stale repair does not issue a new terminal write');
      }, {step: WORKFLOW_STEP.PENDING});
    });
}

test('a terminal winner settles before a previously captured timeout without timeout credit',
  async () => {
    await withExpiredStep(async (run) => {
      const expired = run.operation();
      const before = run.owner.stats.operationsTimedOut;
      const admitted = await run.target.claim(run.request);
      const failed = await run.target.markProgress(admitted, CREATE_ADMISSION_STATE.FAILED);
      run.reportTarget(failed, ReplicaStatus.FAILED);
      await run.owner.failOperation(run.operation(), 'received confirmed target failure');
      const terminal = run.row();
      assert.equal(terminal.workflow_step, WORKFLOW_STEP.FAILED);
      await run.expire(expired);
      assert.deepEqual(run.row(), terminal, 'the prior exact terminal winner remains authoritative');
      assert.equal(run.failWrites.length, 1, 'only confirmed target failure writes terminal state');
      assert.equal(run.owner.stats.operationsTimedOut, before);
    });
  });

function admissionRequestOf(payload) {
  return {
    operationId: payload[ReplicaOperationField.OPERATION_ID],
    operationType: payload[ReplicaOperationField.OPERATION_TYPE],
    entityType: payload[ReplicaOperationField.ENTITY_TYPE],
    entityId: payload[ReplicaOperationField.ENTITY_ID],
    partitionId: payload[ReplicaOperationField.PARTITION_ID],
    replicaId: payload[ReplicaOperationField.REPLICA_ID],
    admissionToken: payload[ReplicaOperationField.CREATE_ADMISSION_TOKEN],
    attemptToken: payload[ReplicaOperationField.CREATE_ADMISSION_ATTEMPT_TOKEN],
    attemptSeq: payload[ReplicaOperationField.CREATE_ADMISSION_ATTEMPT_SEQ],
    workflowUpdatedAt: payload[ReplicaOperationField.CREATE_ADMISSION_WORKFLOW_UPDATED_AT],
  };
}

function assertSourceVoter(cluster, sourceId) {
  const source = cluster.node(sourceId).readStatus();
  assert.equal(source.role, RAFT_ROLE.LEADER);
  assert.ok(source.confState.voters.includes(source.peerId), 'the source remains a native voter');
}

async function withHeldReplaceCreate(measure, setup = {}) {
  const {partitionId = PARTITION_ID} = setup;
  const sourceId = `${partitionId}-r1`;
  const cluster = new PartitionNodeCluster({
    partitionId, replicaIds: [sourceId], founderNodeIds: {[sourceId]: NODE.A},
  });
  try {
    cluster.node(sourceId).campaign();
    assert.ok(cluster.settle(() => {
      const status = cluster.node(sourceId).readStatus();
      return status.role === RAFT_ROLE.LEADER && status.appliedIndex > 0;
    }), 'the native source elected and committed');
    const sourceStamp = readLeaderBootstrapStamp(cluster, sourceId);
    await withExpiredStep(async (run) => {
      const delivered = Promise.withResolvers();
      const reply = Promise.withResolvers();
      run.owner.messageRouter = {async deliver(address, payload) {
        assert.equal(payload.type, ReplicaOperationMessageType.CREATE_REPLICA);
        assert.equal(address, `${NODE.B}/service/replica-handler`);
        assert.deepEqual(payload[ReplicaOperationField.BOOTSTRAP_MEMBERSHIP], sourceStamp);
        delivered.resolve(admissionRequestOf(payload));
        return buildDeliveryEnvelope({acknowledged: true}, await reply.promise);
      }};
      const execution = run.owner.executeOperationInternal(run.operation(), {});
      try {
        const request = await Promise.race([delivered.promise, execution.then((result) => {
          assert.fail(`the sender returned before delivering held CREATE: ${JSON.stringify(result)}`);
        })]);
        assert.deepEqual(request, run.request, 'the receiver consumes the actual dispatch tuple');
        assert.equal(run.operation().sourceReplicaId, sourceId);
        assertSourceVoter(cluster, sourceId);
        await measure({...run, request, execution, reply: reply.resolve});
        assert.equal(run.operation().sourceReplicaId, sourceId);
        assertSourceVoter(cluster, sourceId);
      } finally {
        reply.resolve({status: ReplicaOperationResponseStatus.ERROR});
        await execution;
      }
    }, {...setup, sourceStamp});
  } finally {
    cluster.dispose();
  }
}

test('pre-remove REPLACE admission wins against its sender timeout CAS and can progress', async () => {
  await withHeldReplaceCreate(async (run) => {
    let admitted;
    let worker;
    run.interceptFailureWrite(async (commit) => {
      assert.equal(run.row().workflow_step, WORKFLOW_STEP.SENDING);
      assert.equal(run.row().create_admission_state, null);
      admitted = await run.target.claim(run.request);
      worker = await run.target.claimPhysicalWorker(admitted);
      assert.ok(worker, 'the actual target owns the original physical attempt');
      return commit();
    });
    try {
      assert.equal(await run.expire(), OPERATION_RECONCILE_OUTCOME.WAITING);
      assertRetained(run, admitted);
      assert.equal(await run.target.revalidatePhysicalWorker(worker), true);
      assert.equal(run.failWrites[0].whereClause.create_admission_state, null);
      const materialized = await run.target.markMaterialized(admitted);
      assert.ok(materialized);
      run.reply({status: ReplicaOperationResponseStatus.INITIATED});
      assert.equal((await run.execution).success, true);
      run.reportTarget(materialized, ReplicaStatus.SYNCING);
      const wake = run.owner.observedProgressRetryTimerByOperationId.get(OPERATION_ID);
      assert.ok(wake, 'the retained REPLACE still has an observation wake');
      run.owner.clearTimeoutFn(wake.timeoutHandle);
      await run.owner.runObservedProgressRetry(OPERATION_ID, wake.timeoutHandle);
      assert.equal(run.row().workflow_step, WORKFLOW_STEP.SYNCING);
      assertRetained(run, materialized);
    } finally {
      if (worker) run.target.releasePhysicalWorker(worker);
    }
  });
});

test('a pre-remove REPLACE sender timeout that wins before admission rejects the held CREATE',
  async () => {
    await withHeldReplaceCreate(async (run) => {
      await run.expire();
      assert.equal(run.row().workflow_step, WORKFLOW_STEP.FAILED);
      assert.ok(Number.isFinite(run.reservation().released_at));
      assert.equal(run.failures.length, 1);
      await assert.rejects(run.target.claim(run.request),
        {code: CREATE_ADMISSION_ERROR_CODE.REFUSED_TERMINAL});
      run.reply({status: ReplicaOperationResponseStatus.ERROR,
        error: CREATE_ADMISSION_ERROR_CODE.REFUSED_TERMINAL});
      assert.equal((await run.execution).success, false);
      assert.equal(run.row().create_admission_state, null);
    });
  });

test('the elapsed REPLACE CAS fences a same-source change to the stored source column',
  async () => {
    await withHeldReplaceCreate(async (run) => {
      const before = run.owner.stats.operationsTimedOut;
      let winner;
      run.interceptFailureWrite((commit) => {
        assert.equal(run.row().source_replica_id, null);
        run.materializeStoredReplaceSource();
        winner = run.row();
        return commit();
      });
      await run.expire();
      assert.ok(winner, 'the independent raw source write won before timeout apply');
      assert.equal(run.failWrites[0].whereClause.source_replica_id, null);
      assert.deepEqual(run.row(), winner);
      assert.equal(run.reservation().released_at, null);
      assert.deepEqual(run.failures, []);
      assert.equal(run.owner.stats.operationsTimedOut, before);
      run.reply({status: ReplicaOperationResponseStatus.INITIATED});
      assert.equal((await run.execution).success, true);
    });
  });

test('repair of a refused pre-remove REPLACE timeout yields to later admitted CREATE', async () => {
  await withHeldReplaceCreate(async (run) => {
    run.interceptFailureWrite(async () => ({success: false, error: 'injected refused write'}));
    await assert.rejects(run.expire(), /injected refused write/u);
    assert.ok(run.owner.terminalTransitionRepairStateByOperationId.has(OPERATION_ID));
    const admitted = await run.target.claim(run.request);
    await runTerminalTransitionRepairAttempt(run.owner, OPERATION_ID);
    assertRetained(run, admitted);
    assert.equal(run.owner.terminalTransitionRepairStateByOperationId.has(OPERATION_ID), false);
    run.reply({status: ReplicaOperationResponseStatus.INITIATED});
    assert.equal((await run.execution).success, true);
    assert.equal(run.row().workflow_step, WORKFLOW_STEP.CREATING);
  });
});

test('a positively claimed pre-remove REPLACE target failure settles with the source still voting',
  async () => {
    await withHeldReplaceCreate(async (run) => {
      const admitted = await run.target.claim(run.request);
      const failed = await run.target.markProgress(admitted, CREATE_ADMISSION_STATE.FAILED);
      assert.ok(failed);
      run.reportTarget(failed, ReplicaStatus.FAILED);
      await run.expire();
      assert.equal(run.row().workflow_step, WORKFLOW_STEP.FAILED);
      assert.ok(Number.isFinite(run.reservation().released_at));
      const history = JSON.parse(run.row().steps_history);
      const claim =
        history.at(-1)[OPERATION_METADATA_KEY.FAILED_CREATE_TARGET_LIFECYCLE_PRECONDITION];
      assert.equal(claim?.create_attempt_token, failed.attemptToken);
      run.reply({status: ReplicaOperationResponseStatus.ERROR, error: 'confirmed target failure'});
      assert.equal((await run.execution).success, false);
    });
  });

test('a priority timeout sweep waits for the current operation before failing expired work',
  async () => {
    const partitionId = PRIORITY_PARTITION_ID;
    await withExpiredStep(async (run) => {
      const original = run.row();
      const before = run.owner.stats.operationsTimedOut;
      await run.sweepWithDeferredVisibility(() => {
        assert.deepEqual(run.row(), original, 'the census saw a genuine expired row');
      });
      assert.deepEqual(run.row(), original, 'unavailable point authority cannot fail the census row');
      assert.equal(run.reservation().released_at, null);
      assert.equal(run.failWrites.length, 0);
      assert.deepEqual(run.failures, []);
      assert.equal(run.owner.stats.operationsTimedOut, before);

      await run.sweepWithAvailableVisibility();
      assert.equal(run.row().workflow_step, WORKFLOW_STEP.FAILED,
        'a later sweep can fail the same expired row with point authority');
      assert.equal(run.failWrites.length, 1);
      assert.equal(run.failures.length, 1);
      assert.ok(Number.isFinite(run.reservation().released_at));
      assert.match(run.row().error_message, /Priority recovery drain settled stale operation/u);
      assert.equal(run.owner.stats.operationsTimedOut, before,
        'the priority drain owns this settlement, outside ordinary timeout accounting');
    }, {
      partitionId,
      controlPlaneReadinessService: buildPriorityDrainReadinessService(
        partitionId, {readyNodeIds: [NODE.A, NODE.B, NODE.C]}),
    });
  });

const priorityDrains = [
  {type: OperationType.ADD, fixture: withExpiredStep, nodeId: NODE.A},
  {type: OperationType.REPLACE, fixture: withHeldReplaceCreate, nodeId: NODE.B},
];

for (const {type, fixture, nodeId} of priorityDrains) {
  const setup = {
    partitionId: PRIORITY_PARTITION_ID,
    nodeId,
    controlPlaneReadinessService: buildPriorityDrainReadinessService(
      PRIORITY_PARTITION_ID, {readyNodeIds: [NODE.A, NODE.B, NODE.C]}),
  };

  test(`priority ${type} age-only drain yields to a CREATE admitted just before apply`,
    async () => {
      await fixture(async (run) => {
        let admitted;
        run.interceptFailureWrite(async (commit) => {
          assert.equal(run.row().workflow_step, WORKFLOW_STEP.SENDING);
          assert.equal(run.row().create_admission_state, null);
          admitted = await run.target.claim(run.request);
          return commit();
        });
        const settled = await run.drain();
        assert.ok(admitted, 'the exact receiver admission won the pre-apply race');
        assertRetained(run, admitted);
        assert.equal(settled, false);
        assert.equal(run.failWrites.length, 1);
        assert.equal(run.failWrites[0].whereClause.create_admission_state, null);
        assert.equal(run.owner.observedProgressRetryTimerByOperationId.has(OPERATION_ID), true);
        assert.equal(run.owner.terminalTransitionRepairStateByOperationId.has(OPERATION_ID), false);
        if (run.reply) {
          run.reply({status: ReplicaOperationResponseStatus.INITIATED});
          assert.equal((await run.execution).success, true);
        }
      }, setup);
    });

  test(`priority ${type} age-only drain that commits first rejects late CREATE`, async () => {
    await fixture(async (run) => {
      assert.equal(await run.drain(), true);
      assert.equal(run.row().workflow_step, WORKFLOW_STEP.FAILED);
      assert.ok(Number.isFinite(run.reservation().released_at));
      assert.equal(run.failures.length, 1);
      await assert.rejects(run.target.claim(run.request),
        {code: CREATE_ADMISSION_ERROR_CODE.REFUSED_TERMINAL});
      assert.equal(run.row().create_admission_state, null);
      if (run.reply) {
        run.reply({status: ReplicaOperationResponseStatus.ERROR,
          error: CREATE_ADMISSION_ERROR_CODE.REFUSED_TERMINAL});
        assert.equal((await run.execution).success, false);
      }
    }, setup);
  });
}
