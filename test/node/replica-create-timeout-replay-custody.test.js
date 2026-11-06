// Real handler/admission/lifecycle owners, SQL operation predicates and the
// existing virtual clock. Native runtime construction and lifecycle storage
// are explicit component seams; this is not physical formation acceptance.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {CREATE_ADMISSION_STATE} from '../../src/node/replica-create-admission-owner.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {buildFailedCreateCleanupToken} from
  '../../src/rebalancer/failed-create-cleanup-token.js';
import {ExecutorOutcomeEmitter, OUTCOME_EVENT_NAME} from
  '../../src/rebalancer/executor-outcome-emitter.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {createHandlerFixture, operationRow, routedCreateRequest,
  sqlOperationsAuthority} from
  '../test-helpers/replica-create-admission-recovery-fixture.js';

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return {promise, resolve};
}

async function turnsUntil(predicate, message) {
  for (let turn = 0; turn < 80 && !predicate(); turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.ok(predicate(), message);
}

function unadmittedOperation(priority) {
  const row = operationRow(priority ? {entity_id: 'sql_transactions-p1',
    partition_id: 'sql_transactions-p1', replica_id: 'sql_transactions-p1-r5'} : {});
  for (const key of Object.keys(row)) {
    if (key.startsWith('create_admission_')) row[key] = null;
  }
  return row;
}

function heldMaterializationAuthority(cache, row, holdAt, hasWorker,
  failClassificationRead, rejectClassificationRead) {
  const authority = sqlOperationsAuthority(cache, [row]);
  const entered = deferred();
  const gate = deferred();
  const update = authority.gateway.updateSystemTableRow;
  const read = authority.gateway.readAuthoritativeRows;
  let armed = false;
  let held = false;
  let statusReads = 0;
  let heldReadStack = null;
  let released = false;
  let readsAfterRelease = 0;
  let classificationFailures = 0;
  let classificationFailureStack = null;
  authority.gateway.updateSystemTableRow = async (...args) => {
    const result = await update(...args);
    if (args[2]?.create_admission_state === CREATE_ADMISSION_STATE.MATERIALIZED &&
        result.outcome === 'applied' && !held) armed = true;
    return result;
  };
  authority.gateway.readAuthoritativeRows = async (...args) => {
    if (released && (failClassificationRead || rejectClassificationRead) &&
        args[0] === SYSTEM_TABLE_NAME.SERVICES &&
        args[2]?.[0] === row.replica_id) {
      readsAfterRelease += 1;
      // The captured CREATING probe returns PENDING; the next read is its
      // SYNCING sibling. Only the following classification read is unavailable.
      if (readsAfterRelease === 2) {
        classificationFailures += 1;
        classificationFailureStack = new Error('controlled lifecycle read outage').stack;
        if (rejectClassificationRead) throw new Error('finite lifecycle classification rejection');
        return {success: false, error: 'finite lifecycle classification outage'};
      }
    }
    if (armed && !held && holdAt === 'status-read' && hasWorker() &&
        args[0] === SYSTEM_TABLE_NAME.SERVICES) {
      statusReads += 1;
      if (statusReads === 3) {
        const captured = await read(...args);
        assert.equal(captured.rows[0].status, ReplicaStatus.PENDING);
        heldReadStack = new Error('controlled CREATING probe hold').stack;
        held = true;
        entered.resolve();
        await gate.promise;
        return captured;
      }
    }
    if (armed && args[0] === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS &&
        (holdAt === 'materialization' || holdAt === 'worker-claim' && hasWorker())) {
      armed = false;
      held = true;
      entered.resolve();
      const available = await gate.promise;
      if (!available) return {success: false, error: 'finite operation authority outage'};
    }
    return read(...args);
  };
  return {...authority, entered: entered.promise,
    classificationFailures: () => classificationFailures,
    classificationFailureStack: () => classificationFailureStack,
    heldReadStack: () => heldReadStack,
    release(value) {
      released = true;
      gate.resolve(value);
    }};
}

async function timeoutFixture(t, holdAt = 'materialization',
  {priority = false, failClassificationRead = false, rejectClassificationRead = false} = {}) {
  const row = unadmittedOperation(priority);
  const clock = new VirtualTimeSource({startMs: 100000});
  const emitter = new ExecutorOutcomeEmitter({logger: {debug() {}}});
  const outcomes = [];
  emitter.on(OUTCOME_EVENT_NAME, (outcome) => outcomes.push(outcome));
  const fixture = await createHandlerFixture({row, timeSource: clock,
    executorOutcomeEmitter: emitter,
    tableId: priority ? 'sql_transactions' : 'table-1',
    tableName: priority ? 'sql_transactions' : 'test_table',
    authorityFor: (cache) => heldMaterializationAuthority(cache, row, holdAt,
      () => fixture.handler.getReplicaCreateAdmissionOwner()
        .activePhysicalWorkerOperationIds.has(row.operation_id),
      failClassificationRead, rejectClassificationRead)});
  const {handler, authority} = fixture;
  const events = [];
  handler.on('replicaCreated', (event) => events.push({kind: 'created', ...event}));
  handler.on('replicaCreationFailed', (event) => events.push({kind: 'failed', ...event}));
  t.after(async () => {
    authority.release(false);
    fixture.releaseFactory();
    handler.replicaStateMachine.stopTimeoutChecker();
    await handler.shutdown();
    authority.close();
  });
  handler.initialize();
  await handler.awaitReplicaCreateAdmissionRecoveryBarrier();
  handler.replicaStateMachine.startTimeoutChecker();
  const request = routedCreateRequest(row);
  const first = handler.handleCreateReplica(request);
  await authority.entered;
  if (holdAt === 'status-read') {
    assert.match(authority.heldReadStack(), /resumeCreatingReplicaCreateStatus/u,
      'fault binds to the CREATING probe after the FAILED probe already completed');
  }
  assert.equal(handler.shouldUsePriorityReplicaCreateStatusFallback(row.partition_id), priority);
  const durable = () => authority.lifecycleStore.durableRow(
    SYSTEM_TABLE_NAME.SERVICES, row.replica_id);
  assert.equal(durable().status, ReplicaStatus.PENDING);
  assert.equal(authority.read(row.operation_id).create_admission_state,
    CREATE_ADMISSION_STATE.MATERIALIZED);
  assert.equal(fixture.physicalStarts(), 0, 'held before any runtime effect');
  return {...fixture, row, request, first, clock, durable, events, outcomes};
}

async function expirePending(fixture) {
  const state = fixture.handler.replicaStateMachine;
  assert.equal(state.timeouts[ReplicaStatus.PENDING], 30000, 'original lifecycle deadline');
  assert.equal(state.timeoutCheckIntervalMs, 5000, 'original checker cadence');
  fixture.clock.advance(35000);
  await turnsUntil(() => fixture.durable().status === ReplicaStatus.FAILED,
    'real timeout commits FAILED while materialization confirmation is held');
  assert.equal(fixture.physicalStarts(), 0);
  assert.equal(fixture.authority.read(fixture.row.operation_id).create_admission_state,
    CREATE_ADMISSION_STATE.MATERIALIZED,
    'lifecycle timeout and admission materialization are separate owner facts');
}

async function settleRequest(fixture, response) {
  fixture.releaseFactory();
  await Promise.all([...fixture.handler.operationTasks]);
  await new Promise((resolve) => setImmediate(resolve));
  return response;
}

function assertUsefulCreation(fixture, expectedSequence) {
  const {row, authority, handler, durable} = fixture;
  assert.equal(fixture.physicalStarts(), 1, 'exactly one factory engagement');
  assert.ok(handler.getTrackedService(row.replica_id), 'registered runtime survives');
  assert.equal(durable().status, ReplicaStatus.ACTIVE);
  const operation = authority.read(row.operation_id);
  assert.equal(operation.create_admission_state, CREATE_ADMISSION_STATE.ACTIVE);
  assert.equal(operation.create_admission_attempt_seq, expectedSequence);
  assert.equal(durable().create_attempt_token, operation.create_admission_attempt_token);
  for (const evidence of fixture.factoryEvidence) {
    assert.equal(evidence.operation.create_admission_attempt_seq, expectedSequence);
    assert.equal(evidence.lifecycle.create_attempt_token,
      evidence.operation.create_admission_attempt_token,
      'factory effect is authorized by the current durable attempt');
    assert.equal(evidence.lifecycle.status, ReplicaStatus.CREATING);
    assert.equal(evidence.worker.operationId, operation.operation_id);
    assert.equal(evidence.workerIncarnation, operation.create_admission_owner_incarnation);
    assert.equal(evidence.worker.attemptToken, evidence.lifecycle.create_attempt_token);
    assert.equal(evidence.worker.attemptSeq, expectedSequence,
      'actual worker authority, not merely two durable rows, carries the current attempt');
  }
  assert.equal(fixture.events.filter((event) => event.kind === 'created').length, 1);
  assert.ok(fixture.outcomes.some((outcome) => outcome.operationId === row.operation_id &&
    outcome.workflowStep === 'ACTIVE'), 'real executor emitter reports useful progress');
  const owner = handler.getReplicaCreateAdmissionOwner();
  assert.equal(owner.activePhysicalWorkerOperationIds.size, 0);
  assert.equal(owner.laneTailByOperationId.size, 0);
  assert.equal(handler.operationTasks.size, 0);
}

test('before-timeout materialization confirmation completes the original attempt', async (t) => {
  const fixture = await timeoutFixture(t);
  fixture.authority.release(true);
  await settleRequest(fixture, await fixture.first);
  assertUsefulCreation(fixture, 1);
});

test('late continuation after real PENDING expiry never uses expired attempt authority', async (t) => {
  const fixture = await timeoutFixture(t);
  await expirePending(fixture);
  fixture.authority.release(true);
  const response = await settleRequest(fixture, await fixture.first);
  if (fixture.physicalStarts() > 0) {
    assertUsefulCreation(fixture, 2);
  } else {
    assert.ok(response.deferRetry === true || fixture.outcomes.some(
      (outcome) => outcome.deferRetry === true && outcome.operationId === fixture.row.operation_id),
    'late refusal retains typed retry custody through its response or executor outcome');
    assert.equal(fixture.durable().status, ReplicaStatus.FAILED);
    assert.equal(fixture.durable().cleanup_token, null);
    await settleRequest(fixture, await fixture.handler.handleCreateReplica(fixture.request));
    assertUsefulCreation(fixture, 2);
  }
});

for (const scenario of [
  {holdAt: 'worker-claim'}, {holdAt: 'status-read'},
  {holdAt: 'worker-claim', priority: true}, {holdAt: 'status-read', priority: true},
  {holdAt: 'status-read', failClassificationRead: true},
  {holdAt: 'status-read', priority: true, failClassificationRead: true},
  {holdAt: 'status-read', rejectClassificationRead: true},
  {holdAt: 'status-read', priority: true, rejectClassificationRead: true},
]) {
  test(`expiry during the later ${JSON.stringify(scenario)} retains replay custody`, async (t) => {
    const fixture = await timeoutFixture(t, scenario.holdAt, scenario);
    await expirePending(fixture);
    fixture.authority.release(true);
    const response = await settleRequest(fixture, await fixture.first);
    assert.equal(fixture.authority.classificationFailures(),
      scenario.failClassificationRead || scenario.rejectClassificationRead ? 1 : 0);
    if (scenario.failClassificationRead || scenario.rejectClassificationRead) {
      assert.match(fixture.authority.classificationFailureStack(), /expiredCreateInitialStatusError/u,
        'only the classification owner read is unavailable');
    }
    assert.equal(fixture.physicalStarts(), 0, 'expired attempt has no runtime effect');
    assert.ok(response.deferRetry === true || fixture.outcomes.some(
      (outcome) => outcome.operationId === fixture.row.operation_id &&
        outcome.deferRetry === true), 'later authority wait retains typed retry custody');
    assert.equal(fixture.durable().cleanup_token, null,
      'live pre-runtime CREATE remains replayable');
    assert.equal(fixture.authority.read(fixture.row.operation_id).create_admission_state,
      CREATE_ADMISSION_STATE.FAILED, 'existing failure owner settles admission before replay');
    assert.equal(fixture.handler.getReplicaCreateAdmissionOwner()
      .activePhysicalWorkerOperationIds.size, 0, 'old worker relinquishes custody before replay');
    await settleRequest(fixture, await fixture.handler.handleCreateReplica(fixture.request));
    assertUsefulCreation(fixture, 2);
  });
}

for (const recoverFirst of [false, true]) {
  test(`identical replay after timeout completes; retained recovery first=${recoverFirst}`, async (t) => {
    const fixture = await timeoutFixture(t);
    await expirePending(fixture);
    fixture.authority.release(false);
    const refused = await fixture.first;
    assert.equal(refused.deferRetry, true, 'finite authority failure is retryable');
    assert.equal(fixture.physicalStarts(), 0);
    if (recoverFirst) await fixture.handler.recoverRetainedReplicaCreateAdmissions();
    const response = await fixture.handler.handleCreateReplica(fixture.request);
    await settleRequest(fixture, response);
    assertUsefulCreation(fixture, 2);
    const before = fixture.authority.read(fixture.row.operation_id);
    await fixture.handler.handleCreateReplica(fixture.request);
    assert.equal(fixture.physicalStarts(), 1, 'ACTIVE replay is idempotent');
    assert.deepEqual(fixture.authority.read(fixture.row.operation_id), before,
      'completed creation keeps its exact admission and attempt');
  });
}

const FENCES = {
  async 'completed operation'(fixture) {
    // The coordinator's terminal SQL fact is an explicit input boundary here;
    // this negative control does not claim end-to-end coordinator completion.
    await fixture.authority.gateway.updateSystemTableRow(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      {operation_id: fixture.row.operation_id, completed_at: null},
      {completed_at: 30, status: ReplicaStatus.FAILED, workflow_step: 'FAILED'});
  },
  async 'claimed cleanup'(fixture) {
    const token = buildFailedCreateCleanupToken(fixture.row.operation_id);
    assert.equal(await fixture.handler.replicaStateMachine.claimFailedCreateCleanup(
      fixture.durable(), token), true, 'existing lifecycle owner claims exact failed generation');
  },
  async 'CLOSED admission'(fixture) {
    const owner = fixture.handler.getReplicaCreateAdmissionOwner();
    const evidence = await owner.takeoverRetained(fixture.authority.read(fixture.row.operation_id));
    assert.ok(await owner.close(evidence), 'existing admission owner closes the generation');
  },
  async 'superseded boot'(fixture) {
    fixture.authority.setBootIncarnation(103);
  },
  async 'superseded lifecycle identity'(fixture) {
    const previous = fixture.durable();
    await fixture.authority.lifecycleStore.adapters.updateSystemTableRow(SYSTEM_TABLE_NAME.SERVICES,
      {service_id: previous.service_id, created_at: previous.created_at},
      {created_at: previous.created_at + 1});
  },
};

function assertLifecycleFence(fixture, before, name) {
  const after = fixture.durable();
  if (name !== 'completed operation' &&
      !(name === 'CLOSED admission' && after.cleanup_token !== null)) {
    assert.deepEqual(after, before, 'late callbacks preserve exact durable fence');
    return;
  }
  // A terminal/closed CREATE owns cleanup of its exact failed attempt. Its existing
  // failure path may claim that cleanup, while identity and FAILED stay fixed.
  const {cleanup_token: oldToken, state_entered_at: oldEntered,
    updated_at: oldUpdated, ...oldIdentity} = before;
  const {cleanup_token: token, state_entered_at: entered,
    updated_at: updated, ...identity} = after;
  assert.equal(oldToken, null);
  assert.deepEqual(identity, oldIdentity);
  assert.equal(token, buildFailedCreateCleanupToken(fixture.row.operation_id));
  assert.ok(entered > oldEntered && updated > oldUpdated);
}

for (const priority of [false, true]) {
  for (const holdAt of ['materialization', 'worker-claim', 'status-read']) {
    for (const [name, installFence] of Object.entries(FENCES)) {
      test(`timeout at ${holdAt}, priority=${priority}, preserves ${name}`, async (t) => {
        const fixture = await timeoutFixture(t, holdAt, {priority});
        await expirePending(fixture);
        await installFence(fixture);
        const fencedLifecycle = fixture.durable();
        fixture.authority.release(true);
        await settleRequest(fixture, await fixture.first);
        await settleRequest(fixture, await fixture.handler.handleCreateReplica(fixture.request));
        assert.equal(fixture.physicalStarts(), 0, 'no runtime effect under superseded authority');
        assertLifecycleFence(fixture, fencedLifecycle, name);
        assert.equal(fixture.authority.read(fixture.row.operation_id)
          .create_admission_attempt_seq, 1,
        'no attempt rotation across the fence');
        assert.equal(fixture.handler.getTrackedService(fixture.row.replica_id) ?? null, null);
        const owner = fixture.handler.getReplicaCreateAdmissionOwner();
        assert.equal(owner.activePhysicalWorkerOperationIds.size, 0);
        assert.equal(owner.laneTailByOperationId.size, 0);
        assert.equal(fixture.handler.operationTasks.size, 0);
      });
    }
  }
}
