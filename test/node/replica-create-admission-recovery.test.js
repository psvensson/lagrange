import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {CREATE_ADMISSION_STATE} from '../../src/node/replica-create-admission-owner.js';
import {OperationType, ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {ReplicaOperationField} from '../../src/rebalancer/replica-operation-constants.js';
import {committedStampFor} from './replica-handler-bootstrap-stamps.js';
import {createHandlerFixture, operationRow, routedCreateRequest,
  sqlOperationsAuthority, targetLifecycle, waitForCreateCompletion, waitForPhysicalStart,
} from '../test-helpers/replica-create-admission-recovery-fixture.js';

// A message-group REPLACE admission retained by an older boot (FreshMG B1).
function messageGroupAdmissionRow(operationId, replicaId, state) {
  return operationRow({operation_id: operationId, type: OperationType.REPLACE,
    entity_type: 'message_group', entity_id: 'mg-1', partition_id: 'mg-1',
    replica_id: replicaId, steps_history: '[]', create_admission_state: state});
}

describe('ReplicaHandler retained CREATE admission recovery', () => {
  it('leaves older-boot message-group admissions untouched while it recovers a partition one',
    async () => {
      const partition = operationRow();
      const admitted = messageGroupAdmissionRow('op-mg-admitted', 'mg-fresh-a',
        CREATE_ADMISSION_STATE.ADMITTED);
      const materialized = messageGroupAdmissionRow('op-mg-materialized',
        'mg-fresh-m', CREATE_ADMISSION_STATE.MATERIALIZED);
      let authority = null;
      const fixture = await createHandlerFixture({row: partition,
        targetRow: targetLifecycle(partition), authorityFor: (cache) => {
          authority = sqlOperationsAuthority(cache, [partition, admitted, materialized]);
          return authority;
        }});
      const before = [admitted, materialized].map(({operation_id: id}) =>
        authority.read(id));
      const completed = waitForCreateCompletion(fixture.handler);
      fixture.handler.initialize();
      await fixture.handler.awaitReplicaCreateAdmissionRecoveryBarrier();
      await waitForPhysicalStart(fixture);
      fixture.releaseFactory();
      await completed;
      assert.deepEqual([admitted, materialized].map(({operation_id: id}) =>
        authority.read(id)), before,
      'no takeover, advance or CLOSE of a message-group admission row');
      for (const replicaId of ['mg-fresh-a', 'mg-fresh-m']) {
        assert.equal(fixture.cache.get(SYSTEM_TABLE_NAME.SERVICES, replicaId) ?? null,
          null, `no SERVICES row for ${replicaId}`);
      }
      assert.equal(fixture.physicalStarts(), 1, 'only the partition CREATE starts');
      const recovered = authority.read(partition.operation_id);
      assert.equal(recovered.create_admission_owner_incarnation, 102,
        'the partition admission is still taken over (positive control)');
      assert.equal(recovered.create_admission_state, CREATE_ADMISSION_STATE.ACTIVE);
      await fixture.handler.shutdown();
      authority.close();
    });

  it('terminal-first routed CREATE performs no physical work', async () => {
    const row = operationRow({
      status: ReplicaStatus.FAILED,
      workflow_step: 'FAILED',
      completed_at: 12,
      create_admission_state: null,
      create_admission_token: null,
      create_admission_replica_created_at: null,
      create_admission_attempt_token: null,
      create_admission_previous_attempt_token: null,
      create_admission_attempt_seq: null,
      create_admission_workflow_updated_at: null,
      create_admission_owner_incarnation: null,
    });
    const fixture = await createHandlerFixture({row, targetRow: null});
    fixture.handler.initialize();
    await fixture.handler.awaitReplicaCreateAdmissionRecoveryBarrier();
    const response = await fixture.handler.handleCreateReplica(
      routedCreateRequest(row),
    );
    assert.equal(response.status, 'error');
    assert.match(response.error, /Terminal/u);
    assert.equal(fixture.physicalStarts(), 0);
    assert.equal(row.create_admission_state, null);
    await fixture.handler.shutdown();
  });

  it('takes over CREATING work on the current boot and starts one worker',
    async () => {
      const row = operationRow();
      const fixture = await createHandlerFixture({
        row,
        targetRow: targetLifecycle(row),
      });
      const completed = waitForCreateCompletion(fixture.handler);
      fixture.handler.initialize();
      await fixture.handler.awaitReplicaCreateAdmissionRecoveryBarrier();
      await waitForPhysicalStart(fixture);
      assert.equal(row.create_admission_owner_incarnation, 102);
      assert.equal(fixture.physicalStarts(), 1);
      fixture.releaseFactory();
      await completed;
      assert.equal(row.create_admission_state, CREATE_ADMISSION_STATE.ACTIVE);
      await fixture.handler.shutdown();
    });

  it('completes the operation-first ROTATING half-write before restart',
    async () => {
      const base = operationRow();
      const previousAttempt = base.create_admission_attempt_token;
      const currentAttempt = `${base.create_admission_token}:attempt:2`;
      const row = operationRow({
        create_admission_state: CREATE_ADMISSION_STATE.ROTATING,
        create_admission_attempt_token: currentAttempt,
        create_admission_previous_attempt_token: previousAttempt,
        create_admission_attempt_seq: 2,
      });
      const fixture = await createHandlerFixture({
        row,
        targetRow: targetLifecycle(row, {
          status: ReplicaStatus.FAILED,
          create_attempt_token: previousAttempt,
        }),
      });
      const completed = waitForCreateCompletion(fixture.handler);
      fixture.handler.initialize();
      await fixture.handler.awaitReplicaCreateAdmissionRecoveryBarrier();
      await waitForPhysicalStart(fixture);
      assert.equal(row.create_admission_state,
        CREATE_ADMISSION_STATE.MATERIALIZED);
      assert.equal(fixture.cache.get(
        SYSTEM_TABLE_NAME.SERVICES,
        row.replica_id,
      ).create_attempt_token, currentAttempt);
      assert.equal(fixture.physicalStarts(), 1);
      fixture.releaseFactory();
      await completed;
      assert.equal(row.create_admission_state, CREATE_ADMISSION_STATE.ACTIVE);
      await fixture.handler.shutdown();
    });

  it('finishes the lifecycle-first ROTATING half-write and resumes once',
    async () => {
      const base = operationRow();
      const previousAttempt = base.create_admission_attempt_token;
      const currentAttempt = `${base.create_admission_token}:attempt:2`;
      const row = operationRow({
        create_admission_state: CREATE_ADMISSION_STATE.ROTATING,
        create_admission_attempt_token: currentAttempt,
        create_admission_previous_attempt_token: previousAttempt,
        create_admission_attempt_seq: 2,
      });
      const fixture = await createHandlerFixture({
        row,
        targetRow: targetLifecycle(row, {
          create_attempt_token: currentAttempt,
        }),
      });
      const completed = waitForCreateCompletion(fixture.handler);
      fixture.handler.initialize();
      await fixture.handler.awaitReplicaCreateAdmissionRecoveryBarrier();
      await waitForPhysicalStart(fixture);
      assert.equal(row.create_admission_state,
        CREATE_ADMISSION_STATE.MATERIALIZED);
      assert.equal(fixture.physicalStarts(), 1);
      fixture.releaseFactory();
      await completed;
      assert.equal(row.create_admission_state, CREATE_ADMISSION_STATE.ACTIVE);
      await fixture.handler.shutdown();
    });

  it('closes a materialized admission when its lifecycle row was removed',
    async () => {
      const row = operationRow();
      const fixture = await createHandlerFixture({row, targetRow: null});
      fixture.handler.initialize();
      await fixture.handler.awaitReplicaCreateAdmissionRecoveryBarrier();
      assert.equal(row.create_admission_state, CREATE_ADMISSION_STATE.CLOSED);
      assert.equal(fixture.physicalStarts(), 0);
      await fixture.handler.shutdown();
    });

  it('keeps an unavailable scan retryable and cancels its unref timer',
    async () => {
      const row = operationRow();
      const fixture = await createHandlerFixture({
        row,
        targetRow: targetLifecycle(row),
        gatewayOptions: {bootIncarnation: 102, snapshotFailures: 1},
      });
      fixture.handler.initialize();
      await fixture.handler.replicaCreateAdmissionRecoveryTask;
      const timer = fixture.handler.replicaCreateAdmissionRecoveryRearmOwner
        .current();
      assert.ok(timer);
      assert.equal(timer.hasRef(), false);
      await fixture.handler.shutdown();
      assert.equal(fixture.handler.replicaCreateAdmissionRecoveryRearmOwner
        .current(), null);
      assert.equal(fixture.physicalStarts(), 0);
    });

  it('isolates a deferred retained row so a later row recovers once',
    async () => {
      const deferredRow = operationRow();
      const laterToken =
        'replica-create-admission:v1:op-2:replica-2:node-1:12';
      const laterRow = operationRow({
        operation_id: 'op-2',
        replica_id: 'replica-2',
        updated_at: 12,
        create_admission_token: laterToken,
        create_admission_replica_created_at: 21,
        create_admission_attempt_token: `${laterToken}:attempt:1`,
        create_admission_workflow_updated_at: 12,
      });
      const fixture = await createHandlerFixture({
        row: deferredRow,
        targetRow: targetLifecycle(deferredRow),
        additionalTargetRows: [targetLifecycle(laterRow)],
        gatewayOptions: {
          bootIncarnation: 102,
          additionalRows: [laterRow],
          deferredLifecycleReplicaId: deferredRow.replica_id,
        },
      });
      const completed = waitForCreateCompletion(fixture.handler);
      fixture.handler.initialize();
      await fixture.handler.replicaCreateAdmissionRecoveryTask;
      await waitForPhysicalStart(fixture);
      assert.equal(fixture.physicalStarts(), 1,
        'the later valid retained row starts despite the earlier deferral');
      const timer = fixture.handler.replicaCreateAdmissionRecoveryRearmOwner
        .current();
      assert.ok(timer, 'one bounded retry remains for the deferred census');
      assert.equal(timer.hasRef(), false);
      fixture.releaseFactory();
      await completed;
      fixture.handler.startReplicaCreateAdmissionRecovery();
      await fixture.handler.replicaCreateAdmissionRecoveryTask;
      assert.equal(fixture.physicalStarts(), 1,
        'retrying the deferred row does not duplicate the recovered worker');
      await fixture.handler.shutdown();
    });

  it('admits a routed CREATE while an unrelated startup scan is pending',
    async () => {
      const row = operationRow({
        create_admission_state: null,
        create_admission_token: null,
        create_admission_replica_created_at: null,
        create_admission_attempt_token: null,
        create_admission_previous_attempt_token: null,
        create_admission_attempt_seq: null,
        create_admission_workflow_updated_at: null,
        create_admission_owner_incarnation: null,
      });
      let releaseSnapshot;
      const snapshotBarrier = new Promise((resolve) => {
        releaseSnapshot = resolve;
      });
      const fixture = await createHandlerFixture({
        row,
        targetRow: null,
        gatewayOptions: {bootIncarnation: 102, snapshotBarrier},
      });
      const completed = waitForCreateCompletion(fixture.handler);
      fixture.handler.initialize();
      const response = await fixture.handler.handleCreateReplica(
        routedCreateRequest(row),
      );
      assert.equal(response.status, 'initiated');
      releaseSnapshot();
      fixture.releaseFactory();
      await completed;
      await fixture.handler.shutdown();
    });

  it('does not make direct bootstrap recovery depend on the operation ledger',
    async () => {
      const row = operationRow({
        create_admission_state: null,
        create_admission_token: null,
        create_admission_replica_created_at: null,
        create_admission_attempt_token: null,
        create_admission_previous_attempt_token: null,
        create_admission_attempt_seq: null,
        create_admission_workflow_updated_at: null,
        create_admission_owner_incarnation: null,
      });
      const fixture = await createHandlerFixture({
        row,
        targetRow: null,
        gatewayOptions: {bootIncarnation: 102, snapshotFailures: 1},
      });
      fixture.handler.initialize();
      await fixture.handler.replicaCreateAdmissionRecoveryTask;
      const completed = waitForCreateCompletion(fixture.handler);
      const response = await fixture.handler.handleCreateReplica({
        [ReplicaOperationField.OPERATION_ID]: 'bootstrap-op',
        [ReplicaOperationField.PARTITION_ID]: row.partition_id,
        [ReplicaOperationField.REPLICA_ID]: row.replica_id,
        [ReplicaOperationField.BOOTSTRAP_MEMBERSHIP]:
          committedStampFor(['leader-replica']),
      });
      assert.equal(response.status, 'initiated');
      await waitForPhysicalStart(fixture);
      assert.equal(fixture.physicalStarts(), 1);
      fixture.releaseFactory();
      await completed;
      await fixture.handler.shutdown();
    });

  it('preserves the live ACTIVE runtime and arms recovery when post-ACTIVE ' +
    'markProgress hits a transient boot-authority read failure', async () => {
    const row = operationRow();
    const fixture = await createHandlerFixture({
      row,
      targetRow: targetLifecycle(row),
    });
    const completed = waitForCreateCompletion(fixture.handler);
    fixture.handler.initialize();
    await fixture.handler.awaitReplicaCreateAdmissionRecoveryBarrier();
    await waitForPhysicalStart(fixture);
    const originalPersist =
      fixture.handler.persistReplicaStatusWithRetry.bind(fixture.handler);
    fixture.handler.persistReplicaStatusWithRetry = async (
      replicaId,
      newStatus,
      additionalData,
    ) => {
      const result = await originalPersist(replicaId, newStatus, additionalData);
      if (newStatus === ReplicaStatus.ACTIVE) {
        fixture.authority.failNextBootReads(1);
      }
      return result;
    };
    fixture.releaseFactory();
    await completed;
    assert.equal(fixture.physicalShutdowns(), 0,
      'transient post-ACTIVE markProgress failure must not tear down the live service');
    assert.ok(fixture.handler.localServices.get(row.replica_id),
      'the activated partition service remains hosted in localServices');
    assert.equal(
      fixture.cache.get(SYSTEM_TABLE_NAME.SERVICES, row.replica_id)?.status,
      ReplicaStatus.ACTIVE,
    );
    assert.equal(row.create_admission_state, CREATE_ADMISSION_STATE.MATERIALIZED);
    assert.ok(fixture.handler.replicaCreateAdmissionRecoveryRearmOwner.current(),
      'recovery is re-armed to settle create_admission_state = ACTIVE');
    fixture.handler.startReplicaCreateAdmissionRecovery();
    await fixture.handler.replicaCreateAdmissionRecoveryTask;
    assert.equal(row.create_admission_state, CREATE_ADMISSION_STATE.ACTIVE);
    assert.equal(fixture.physicalStarts(), 1);
    await fixture.handler.shutdown();
  });

  it('fences a superseded boot incarnation without arming recovery on the ' +
    'stale boot when boot authority changes before physical creation', async () => {
    const row = operationRow();
    const fixture = await createHandlerFixture({
      row,
      targetRow: targetLifecycle(row),
    });
    const owner = fixture.handler.getReplicaCreateAdmissionOwner();
    fixture.authority.failNextBootReads(1);
    await assert.rejects(
      owner.requireCurrentBootIncarnation(),
      {
        bootAuthorityUnavailable: true,
        bootIncarnationSuperseded: false,
      },
    );
    fixture.authority.setBootIncarnation(103);
    await assert.rejects(
      owner.requireCurrentBootIncarnation(),
      {
        bootAuthorityUnavailable: true,
        bootIncarnationSuperseded: true,
      },
    );
    await fixture.handler.shutdown();
  });

  it('fences the runtime and removes localServices/localReplicas when ' +
    'post-ACTIVE markProgress observes a superseded admission or boot', async () => {
    const row = operationRow();
    const fixture = await createHandlerFixture({
      row,
      targetRow: targetLifecycle(row),
    });
    fixture.handler.initialize();
    await fixture.handler.awaitReplicaCreateAdmissionRecoveryBarrier();
    await waitForPhysicalStart(fixture);
    const originalPersist =
      fixture.handler.persistReplicaStatusWithRetry.bind(fixture.handler);
    fixture.handler.persistReplicaStatusWithRetry = async (
      replicaId,
      newStatus,
      additionalData,
    ) => {
      const result = await originalPersist(replicaId, newStatus, additionalData);
      if (newStatus === ReplicaStatus.ACTIVE) {
        row.create_admission_state = CREATE_ADMISSION_STATE.CLOSED;
      }
      return result;
    };
    fixture.releaseFactory();
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(fixture.physicalShutdowns(), 1,
      'confirmed post-ACTIVE supersession must fence and shut down the runtime');
    assert.equal(fixture.handler.localServices.get(row.replica_id), undefined);
    assert.equal(
      fixture.handler.localReplicas.get(row.replica_id)?.service ?? null,
      null,
    );
    assert.equal(
      fixture.handler.replicaCreateAdmissionRecoveryRearmOwner.current(),
      null,
      'superseded attempt must not re-arm recovery',
    );
    await fixture.handler.shutdown();
  });

  it('retires a superseded retained admission runtime via single cleanup owner while preserving untagged and newer successor runtimes', async () => {
    const row = operationRow();
    const fixture = await createHandlerFixture({
      row,
      targetRow: targetLifecycle(row),
    });
    const staleService = {
      createAdmissionOperationId: row.operation_id,
      createAdmissionToken: row.create_admission_token,
      createAttemptToken: row.create_admission_attempt_token,
      shutdownCalls: 0,
      async shutdown() {
        this.shutdownCalls += 1;
      },
    };
    fixture.handler.localServices.set(row.replica_id, staleService);
    fixture.handler.setLocalReplica(row.replica_id, {
      replicaId: row.replica_id,
      partitionId: row.partition_id,
      service: staleService,
      createAdmissionOperationId: row.operation_id,
      createAdmissionToken: row.create_admission_token,
      createAttemptToken: row.create_admission_attempt_token,
    });
    row.create_admission_state = CREATE_ADMISSION_STATE.CLOSED;
    await fixture.handler.recoverRetainedReplicaCreateAdmissions();
    assert.equal(staleService.shutdownCalls, 1,
      'retained recovery retires the superseded admission runtime');
    assert.equal(fixture.handler.localServices.get(row.replica_id), undefined);
    assert.equal(
      fixture.handler.localReplicas.get(row.replica_id)?.service ?? null,
      null,
      'fenceFailedReplicaCreateRuntime clears the service reference on localReplicas',
    );

    // Negative control 1: an untagged runtime must NOT be matched or retired by fallback.
    const untaggedService = {
      shutdownCalls: 0,
      async shutdown() {
        this.shutdownCalls += 1;
      },
    };
    fixture.handler.localServices.set(row.replica_id, untaggedService);
    fixture.handler.setLocalReplica(row.replica_id, {
      replicaId: row.replica_id,
      partitionId: row.partition_id,
      service: untaggedService,
    });
    await fixture.handler.recoverRetainedReplicaCreateAdmissions();
    assert.equal(untaggedService.shutdownCalls, 0,
      'retained recovery must not match or retire an untagged runtime');
    assert.equal(
      fixture.handler.localServices.get(row.replica_id),
      untaggedService,
    );

    // Negative control 2: a newer successor runtime with different tags must be preserved.
    const successorService = {
      createAdmissionOperationId: 'op-successor',
      createAdmissionToken: 'admission-successor',
      createAttemptToken: 'attempt-successor',
      shutdownCalls: 0,
      async shutdown() {
        this.shutdownCalls += 1;
      },
    };
    fixture.handler.localServices.set(row.replica_id, successorService);
    fixture.handler.setLocalReplica(row.replica_id, {
      replicaId: row.replica_id,
      partitionId: row.partition_id,
      service: successorService,
      createAdmissionOperationId: 'op-successor',
      createAdmissionToken: 'admission-successor',
      createAttemptToken: 'attempt-successor',
    });
    await fixture.handler.recoverRetainedReplicaCreateAdmissions();
    assert.equal(successorService.shutdownCalls, 0,
      'retained recovery must not tear down a newer successor runtime');
    assert.equal(
      fixture.handler.localServices.get(row.replica_id),
      successorService,
    );
    await fixture.handler.shutdown();
  });

  it('prioritizes CLOSED and unsettled admission rows ahead of satisfied current-boot ACTIVE rows', async () => {
    const activeRow = operationRow({
      operation_id: 'op-satisfied-active',
      replica_id: 'rep-satisfied-active',
      create_admission_state: CREATE_ADMISSION_STATE.ACTIVE,
      create_admission_token: 'admission-satisfied-active',
      create_admission_attempt_token: 'attempt-satisfied-active',
      create_admission_owner_incarnation: 102,
    });
    const closedRow = operationRow({
      operation_id: 'op-closed-cleanup',
      replica_id: 'rep-closed-cleanup',
      create_admission_state: CREATE_ADMISSION_STATE.CLOSED,
      create_admission_token: 'admission-closed-cleanup',
      create_admission_attempt_token: 'attempt-closed-cleanup',
      create_admission_owner_incarnation: 102,
    });
    const fixture = await createHandlerFixture({
      row: activeRow,
      targetRow: targetLifecycle(activeRow, {status: ReplicaStatus.ACTIVE}),
      gatewayOptions: {additionalRows: [closedRow]},
      additionalTargetRows: [targetLifecycle(closedRow)],
    });

    const activeService = {
      isInitialized: true,
      createAdmissionOperationId: activeRow.operation_id,
      createAdmissionToken: activeRow.create_admission_token,
      createAttemptToken: activeRow.create_admission_attempt_token,
      async shutdown() {},
    };
    fixture.handler.localServices.set(activeRow.replica_id, activeService);
    fixture.handler.setLocalReplica(activeRow.replica_id, {
      replicaId: activeRow.replica_id,
      partitionId: activeRow.partition_id,
      status: ReplicaStatus.ACTIVE,
      service: activeService,
      createAdmissionOperationId: activeRow.operation_id,
      createAdmissionToken: activeRow.create_admission_token,
      createAttemptToken: activeRow.create_admission_attempt_token,
    });

    const staleClosedService = {
      createAdmissionOperationId: closedRow.operation_id,
      createAdmissionToken: closedRow.create_admission_token,
      createAttemptToken: closedRow.create_admission_attempt_token,
      shutdownCalls: 0,
      async shutdown() {
        this.shutdownCalls += 1;
      },
    };
    fixture.handler.localServices.set(closedRow.replica_id, staleClosedService);
    fixture.handler.setLocalReplica(closedRow.replica_id, {
      replicaId: closedRow.replica_id,
      partitionId: closedRow.partition_id,
      status: ReplicaStatus.CREATING,
      service: staleClosedService,
      createAdmissionOperationId: closedRow.operation_id,
      createAdmissionToken: closedRow.create_admission_token,
      createAttemptToken: closedRow.create_admission_attempt_token,
    });

    let persistActiveCalls = 0;
    const originalPersist =
      fixture.handler.persistReplicaStatusWithRetry.bind(fixture.handler);
    fixture.handler.persistReplicaStatusWithRetry = async (
      replicaId,
      newStatus,
      additionalData,
    ) => {
      if (replicaId === activeRow.replica_id) {
        persistActiveCalls += 1;
      }
      return originalPersist(replicaId, newStatus, additionalData);
    };

    // Even if boot authority reads fail after the retained rows are fetched,
    // CLOSED cleanup runs without boot-authority reads and satisfied ACTIVE
    // rows on the current boot incarnation short-circuit without re-reading.
    fixture.authority.failNextBootReads(1);
    await fixture.handler.recoverRetainedReplicaCreateAdmissions();

    assert.equal(staleClosedService.shutdownCalls, 1,
      'CLOSED retained row is retired immediately without blocking on ACTIVE rows');
    assert.equal(persistActiveCalls, 0,
      'satisfied current-boot ACTIVE row must not re-run status persistence during retained recovery');
    await fixture.handler.shutdown();
  });
});
