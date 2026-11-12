// Real handler -> emitter -> coordinator -> production retry; controlled adapters.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {test} from 'node:test';
import {TABLES, WORKFLOW_STEP} from '../../src/constants/index.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {EXECUTOR_OUTCOME_TYPE} from '../../src/rebalancer/executor-outcome-constants.js';
import {buildFailedCreateRemoveToken} from '../../src/rebalancer/failed-create-cleanup-token.js';
import {ReplicaOperationField} from '../../src/rebalancer/replica-operation-constants.js';
import {world, settleUntil, PARTITION, REPLICA, NODE} from './replica-remove-cleanup-workflow-fixture.js';

const CASES = [
  {name: 'release', fault: 'release', failedCreate: false},
  {name: 'takeover_read', fault: 'takeover_read', failedCreate: false},
  {name: 'delete_read', fault: 'delete_read', failedCreate: false},
  {name: 'healthy', fault: null, failedCreate: false},
  {name: 'failed_create_release', fault: 'release', failedCreate: true},
  {name: 'failed_create_takeover_read', fault: 'takeover_read', failedCreate: true},
  {name: 'failed_create_receipt_read', fault: 'receipt_read', failedCreate: true},
  {name: 'failed_create_healthy', fault: null, failedCreate: true},
];

for (const scenario of CASES) {
  test(`real workflow continues REMOVE automatically: ${scenario.name}`, async (t) => {
    const w = await world(t, scenario);
    const {operation, coordinator, outcomes, deliveries, handler, node} = w;
    await coordinator.executeOperation(operation);
    await settleUntil(() => outcomes.length > 0);
    if (scenario.fault !== null) {
      await settleUntil(async () => coordinator.workflowOwner.transitionRetryTimerByOperationId
        .has(operation.operationId) || coordinator.workflowOwner.repository
        .isOperationTerminal(await coordinator.getOperation(operation.operationId)));
      assert.ok(w.faultCount() > 0, 'fault engaged in the real cleanup owner');
      assert.equal(outcomes[0].outcomeType, EXECUTOR_OUTCOME_TYPE.REPLICA_REMOVE_FAILED);
      assert.equal(outcomes[0].deferRetry, true);
      const pending = await coordinator.getOperation(operation.operationId);
      assert.notEqual(pending.workflowStep, WORKFLOW_STEP.FAILED);
      assert.equal(pending.completedAt, null);
      assert.equal(coordinator.workflowOwner.transitionRetryTimerByOperationId
        .has(operation.operationId), true, 'existing transition retry owns the emitted debt');
      w.heal();
      w.clock.advance(1000);
    }
    await settleUntil(async () =>
      (await coordinator.getOperation(operation.operationId)).completedAt !== null);
    const completed = await coordinator.getOperation(operation.operationId);
    assert.equal(completed.workflowStep, WORKFLOW_STEP.REMOVED);
    assert.equal(handler.getReplicaCleanupTombstoneOwner()
      .readRemovalContinuation(REPLICA, PARTITION, NODE).kind, 'unowned',
    'operation terminality must not strand its local cleanup continuation');
    assert.equal(outcomes.some((outcome) =>
      outcome.outcomeType === EXECUTOR_OUTCOME_TYPE.REPLICA_REMOVE_COMPLETED), true,
    'the real executor completed its retained cleanup, not only an observed absence');
    assert.equal(deliveries.length, scenario.fault === null ? 1 : 2);
    assert.equal(fs.existsSync(w.dbPath), false);
    assert.equal(handler.pendingRuntimeShutdowns.size, 0);
    assert.equal(node.replicaStateMachine.replicas.has(REPLICA), false);
    assert.equal(handler.getReplicaCleanupTombstoneOwner()
      .readRemovalContinuation(REPLICA, PARTITION, NODE).kind, 'unowned');
    const row = node.store.durableRow(TABLES.SERVICES, REPLICA);
    if (w.failedCreate) {
      assert.equal(row.status, 'cleanup_complete');
      assert.equal(row.cleanup_token, buildFailedCreateRemoveToken(operation.operationId));
    } else assert.equal(row, null);
  });
}

test('automatic cleanup retry preserves a successor runtime and its ACTIVE status', async (t) => {
  const w = await world(t, {fault: 'release', failedCreate: false});
  await w.coordinator.executeOperation(w.operation);
  await settleUntil(() => w.coordinator.workflowOwner.transitionRetryTimerByOperationId
    .has(w.operation.operationId));
  assert.ok(w.faultCount() > 0);
  let closes = 0;
  let fences = 0;
  const successor = {replicaId: REPLICA, partitionId: PARTITION, nodeId: NODE,
    async shutdown() {
      closes++;
    },
    fenceServingAdmissionForRemoval() {
      fences++;
    }};
  w.handler.localServices.set(REPLICA, successor);
  w.handler.setLocalReplica(REPLICA, {replicaId: REPLICA, partitionId: PARTITION,
    service: successor, status: ReplicaStatus.ACTIVE});
  w.heal();
  w.clock.advance(1000);
  await settleUntil(() => w.outcomes.length === 2);
  await Promise.all([...w.handler.operationTasks]);
  assert.equal(w.deliveries.length, 2, 'the real retry delivered the retained obligation');
  assert.equal(w.outcomes[1].outcomeType, EXECUTOR_OUTCOME_TYPE.REPLICA_REMOVE_FAILED);
  assert.equal(w.outcomes[1].deferRetry, true);
  assert.equal(w.handler.getTrackedService(REPLICA), successor);
  assert.equal(w.handler.getLocalReplica(REPLICA).status, ReplicaStatus.ACTIVE);
  assert.equal(closes, 0);
  assert.equal(fences, 0);
  assert.equal(fs.readFileSync(w.dbPath, 'utf8'), 'owned storage');
  assert.equal(w.node.store.durableRow(TABLES.SERVICES, REPLICA).status, 'cleanup_owned');
});

for (const mismatch of ['operationId', 'created_at', 'create_attempt_token']) {
  test(`retained failed-create ingress refuses foreign ${mismatch}`, async (t) => {
    const w = await world(t, {fault: 'release', failedCreate: true});
    await w.coordinator.executeOperation(w.operation);
    await settleUntil(() => w.coordinator.workflowOwner.transitionRetryTimerByOperationId
      .has(w.operation.operationId));
    assert.ok(w.faultCount() > 0);
    const before = w.faultCount();
    const request = structuredClone(w.deliveries[0]);
    if (mismatch === 'operationId') request.operationId = 'foreign-cleanup-op';
    else {
      const precondition = request[
        ReplicaOperationField.FAILED_CREATE_TARGET_LIFECYCLE_PRECONDITION];
      precondition[mismatch] = mismatch === 'created_at' ? precondition[mismatch] + 1 :
        'foreign-create-attempt';
    }
    const answer = await w.handler.handleRemoveReplica(request);
    assert.equal(answer.status, 'error');
    await Promise.all([...w.handler.operationTasks]);
    assert.equal(w.faultCount(), before, 'refused delivery did not touch the captured runtime');
    assert.equal(fs.readFileSync(w.dbPath, 'utf8'), 'owned storage');
    assert.equal(w.outcomes.length, 1, 'no foreign executor work was launched');
  });
}

async function prepareReceiptWorkflow(t, resume) {
  const w = await world(t, {fault: resume ? 'receipt_read' : null, failedCreate: true});
  if (resume) {
    await w.coordinator.executeOperation(w.operation);
    await settleUntil(() => w.coordinator.workflowOwner.transitionRetryTimerByOperationId
      .has(w.operation.operationId));
    assert.equal(w.faultCount(), 1, 'finite completion observation loss engaged');
    w.heal();
  }
  return w;
}

async function executeReceiptWorkflow(w, resume) {
  if (resume) w.clock.advance(1000);
  else await w.coordinator.executeOperation(w.operation);
  await settleUntil(() => w.outcomes.length === (resume ? 2 : 1));
  await Promise.all([...w.handler.operationTasks]);
  await settleUntil(async () => w.coordinator.workflowOwner.transitionRetryTimerByOperationId
    .has(w.operation.operationId) ||
    (await w.coordinator.getOperation(w.operation.operationId)).completedAt !== null);
}

function retainReceiptSuccessor(w) {
  let closes = 0;
  let fences = 0;
  const service = {replicaId: REPLICA, partitionId: PARTITION, nodeId: NODE,
    async shutdown() {
      closes++;
    },
    fenceServingAdmissionForRemoval() {
      fences++;
    }};
  w.handler.localServices.set(REPLICA, service);
  w.handler.setLocalReplica(REPLICA, {replicaId: REPLICA, partitionId: PARTITION,
    service, status: ReplicaStatus.ACTIVE});
  fs.mkdirSync(path.dirname(w.dbPath), {recursive: true});
  fs.writeFileSync(w.dbPath, 'successor storage');
  return {service, assertPreserved() {
    assert.equal(w.handler.getTrackedService(REPLICA), service);
    assert.equal(w.handler.getLocalReplica(REPLICA).status, ReplicaStatus.ACTIVE);
    assert.equal(closes, 0);
    assert.equal(fences, 0);
    assert.equal(fs.readFileSync(w.dbPath, 'utf8'), 'successor storage');
  }};
}

async function assertReceiptDebtRetained(w, original, resume) {
  assert.equal(w.outcomes.at(-1).outcomeType, EXECUTOR_OUTCOME_TYPE.REPLICA_REMOVE_FAILED,
    'foreign receipt cannot complete the original removal');
  assert.equal(w.outcomes.at(-1).deferRetry, true);
  const retained = w.handler.getReplicaCleanupTombstoneOwner()
    .readRemovalContinuation(REPLICA, PARTITION, NODE);
  assert.equal(retained.kind, 'retained');
  assert.equal(retained.removalAuthority, original.removalAuthority);
  assert.equal(retained.cleanupAuthority, original.cleanupAuthority);
  assert.equal(retained.completionAuthority, original.completionAuthority);
  assert.equal(retained.service, original.service);
  assert.equal(w.node.replicaStateMachine.replicas.get(REPLICA),
    original.removalAuthority.replicaState);
  assert.equal(w.node.replicaStateMachine.replicas.get(REPLICA).state, ReplicaStatus.REMOVING);
  assert.equal((await w.coordinator.getOperation(w.operation.operationId)).completedAt, null);
  assert.equal(w.coordinator.workflowOwner.transitionRetryTimerByOperationId
    .has(w.operation.operationId), true, 'existing retry still owns the obligation');
  assert.equal(w.deliveries.length, resume ? 2 : 1,
    'only initial dispatch and the registered production retry delivered REMOVE');
}

function replaceReceiptIncarnation(row, field) {
  row[field] = field === 'created_at' ? row.created_at + 1000 : 'foreign-create-incarnation';
}

for (const resume of [false, true]) {
  for (const field of ['created_at', 'create_attempt_token']) {
    for (const readIndex of (resume ? [3, 4] : [2, 3, 4])) {
      test(`receipt final read preserves exact debt: ${resume} ${field} ${readIndex}`, async (t) => {
        const w = await prepareReceiptWorkflow(t, resume);
        let reads = 0;
        let original;
        let successor;
        let changedRow;
        w.node.store.setBeforeAuthoritativeRead(async (table, params) => {
          if (table !== TABLES.SERVICES || !params.includes(REPLICA)) return;
          const row = w.node.store.durable[TABLES.SERVICES].get(REPLICA);
          if (row?.status !== 'cleanup_complete' || ++reads !== readIndex) return;
          original = w.handler.getReplicaCleanupTombstoneOwner()
            .readRemovalContinuation(REPLICA, PARTITION, NODE);
          replaceReceiptIncarnation(row, field);
          changedRow = structuredClone(row);
          successor = retainReceiptSuccessor(w);
        });
        await executeReceiptWorkflow(w, resume);
        assert.ok(original, 'incarnation changed at the named final confirming read');
        await assertReceiptDebtRetained(w, original, resume);
        assert.deepEqual(w.node.store.durableRow(TABLES.SERVICES, REPLICA), changedRow);
        successor.assertPreserved();
      });
    }

    test(`receipt cannot adopt a producer's foreign incarnation: ${resume} ${field}`, async (t) => {
      const w = await prepareReceiptWorkflow(t, resume);
      const owner = w.handler.getReplicaCleanupTombstoneOwner();
      const markComplete = owner.markComplete.bind(owner);
      let original;
      owner.markComplete = async (...args) => {
        const receipt = await markComplete(...args);
        assert.ok(receipt, 'real owner produced its planned completion receipt');
        original = owner.readRemovalContinuation(REPLICA, PARTITION, NODE);
        const row = w.node.store.durable[TABLES.SERVICES].get(REPLICA);
        replaceReceiptIncarnation(row, field);
        return Object.freeze({...receipt, replicaCreatedAt: row.created_at,
          createAttemptToken: row.create_attempt_token});
      };
      await executeReceiptWorkflow(w, resume);
      assert.ok(original, 'foreign receipt substitution engaged at producer handoff');
      await assertReceiptDebtRetained(w, original, resume);
    });
  }
}
