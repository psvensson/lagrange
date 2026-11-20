import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {NodeJoiningPublicationActivation} from '../../src/bootstrap/node-joining-publication-activation.js';
import {wrapPartitionServiceFactoryWithSnapshotCatchup} from '../../src/bootstrap/shared/snapshot-catchup-wiring.js';
import {genesisStamp} from '../../src/raft/raft-committed-membership-stamp.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';
import {CREATE_ADMISSION_STATE} from '../../src/node/replica-create-admission-owner.js';
import {OperationType, ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {ReplicaOperationField} from '../../src/rebalancer/replica-operation-constants.js';
import {PARTICIPANT_CUTOVER_OUTCOME, PARTICIPANT_RELEASE_ACTION,
  PARTICIPANT_RELEASE_RESULT_FIELD} from
  '../../src/partition/partition-participant-transaction-cutover-constants.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {buildDeliveryEnvelope, deliveryAnswerOf} from
  '../../src/transport/transport-semantic-outcome.js';
import {committedStampFor} from './replica-handler-bootstrap-stamps.js';
import {createHandlerFixture, operationRow, routedCreateRequest,
  sqlOperationsAuthority, targetLifecycle, waitForCreateCompletion, waitForPhysicalStart,
} from '../test-helpers/replica-create-admission-recovery-fixture.js';

const CREATE_AUTHORITY_BUDGET_MS = 100;
const turn = () => new Promise((resolve) => setImmediate(resolve));

async function withHeldActivationRead(t, run, {refuseRead = false,
  loseReleaseReply = false, supersedeBeforeRead = false, unregisterReleaseRoute = false} = {}) {
  const row = operationRow();
  const clock = new VirtualTimeSource({startMs: 1000});
  const outcomes = [];
  const fixture = await createHandlerFixture({
    row, targetRow: targetLifecycle(row), timeSource: clock,
    authorityFor: (cache) => sqlOperationsAuthority(cache, [row]),
    executorOutcomeEmitter: {emitOutcome: (_type, _id, step) => outcomes.push(step)},
  });
  const {handler, authority} = fixture;
  handler.syncTimeoutMs = CREATE_AUTHORITY_BUDGET_MS;
  const entered = Promise.withResolvers();
  const held = Promise.withResolvers();
  const releaseRequests = [];
  const releaseRouter = handler.messageRouter;
  if (unregisterReleaseRoute) handler.unregisterFromRouter(releaseRouter);
  if (loseReleaseReply) {
    const deliver = releaseRouter.deliver.bind(releaseRouter);
    releaseRouter.deliver = async (address, payload) => {
      assert.equal(payload.action, PARTICIPANT_RELEASE_ACTION.RELEASE);
      releaseRequests.push(payload);
      const delivered = await deliver(address, payload);
      assert.equal(deliveryAnswerOf(delivered)?.[PARTICIPANT_RELEASE_RESULT_FIELD]?.outcome,
        PARTICIPANT_CUTOVER_OUTCOME.CUT_OVER, 'the registered performer answered before reply loss');
      if (releaseRequests.length === 1) {
        entered.resolve();
        await held.promise;
        return buildDeliveryEnvelope({acknowledged: false, error: 'release reply lost'});
      }
      return delivered;
    };
  }
  let armed = false;
  const persist = handler.persistReplicaStatusWithRetry.bind(handler);
  handler.persistReplicaStatusWithRetry = async (replicaId, status, options) => {
    const result = await persist(replicaId, status, options);
    if (status === ReplicaStatus.SYNCING) {
      if (unregisterReleaseRoute) entered.resolve();
      else armed = true;
    }
    return result;
  };
  const gateway = authority.gateway;
  const read = gateway.readAuthoritativeRows.bind(gateway);
  const changeOperation = (data) => gateway.updateSystemTableRow(
    SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, {operation_id: row.operation_id}, data);
  gateway.readAuthoritativeRows = async (table, sql, params, options) => {
    if (armed && !loseReleaseReply && table === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS &&
        sql.includes('WHERE operation_id = ?') && params[0] === row.operation_id) {
      armed = false;
      if (supersedeBeforeRead) {
        await changeOperation({create_admission_state: CREATE_ADMISSION_STATE.CLOSED});
      }
      entered.resolve();
      await held.promise;
      if (refuseRead) return {success: false, error: 'held authority became unavailable'};
    }
    return read(table, sql, params, options);
  };
  handler.initialize();
  await handler.awaitReplicaCreateAdmissionRecoveryBarrier();
  await waitForPhysicalStart(fixture);
  assert.equal(fixture.physicalStarts(), 1);
  const worker = Promise.all([...handler.operationTasks]);
  try {
    fixture.releaseFactory();
    await Promise.race([
      entered.promise,
      worker.then(() => {
        throw new Error('CREATE left before its authoritative activation read');
      }),
    ]);
    assert.deepEqual(outcomes, [WORKFLOW_STEP.SYNCING]);
    await run({...fixture, row, clock, outcomes, worker, release: held.resolve,
      changeOperation, releaseRequests, releaseRouter,
      currentStatus: () => fixture.cache.get(SYSTEM_TABLE_NAME.SERVICES, row.replica_id)?.status,
    });
  } finally {
    held.resolve();
    await worker;
    await handler.shutdown();
    authority.close();
  }
}

for (const scenario of ['owned join factory', 'replaced during join factory',
  'refused CDC subscription', 'missing handoff', 'repeated handoff']) {
  it(`fresh CREATE custody with the production factory: ${scenario}`, {timeout: 10_000}, async () => {
    const row = operationRow();
    const outcomes = [];
    const fixture = await createHandlerFixture({
      row, targetRow: targetLifecycle(row),
      authorityFor: (cache) => sqlOperationsAuthority(cache, [row]),
      executorOutcomeEmitter: {emitOutcome: (_type, _id, step) => outcomes.push(step)},
    });
    const {handler, authority, cache} = fixture;
    const openedAndHeld = Promise.withResolvers();
    const finishFactory = Promise.withResolvers();
    const rejectedSubscription = scenario === 'refused CDC subscription';
    const joining = Object.assign(Object.create(NodeJoiningPublicationActivation.prototype), {
      nodeId: row.target_node_id,
      replicaHandler: handler,
      replicaStateMachine: handler.replicaStateMachine,
      partitionServices: new Map(),
      transport: handler.messageRouter,
      messageRouter: handler.messageRouter,
      tablePolicyService: {},
      createCdcIntegrationService: () => null,
      getLeaderMessageGroupService: () => null,
      resolveOperationalMessageGroupSelectionAsync: async () => ({
        service: {async subscribeToCDC() {
          openedAndHeld.resolve();
          await finishFactory.promise;
          throw new Error('controlled CDC refusal after native initialization');
        }},
      }),
    });
    const resolveContext = handler.resolveReplicaContextWithRetry.bind(handler);
    handler.resolveReplicaContextWithRetry = async (...args) => ({
      ...await resolveContext(...args),
      ...(rejectedSubscription ? {tableName: SYSTEM_TABLE_NAME.NODES} : {}),
      // The ownership handoff is independent of group growth. Use one real
      // native voter so this fixture needs no synthetic remote membership.
      replicaIds: [row.replica_id],
      existingReplicaCount: 0,
      bootstrapMembership: genesisStamp([row.replica_id], {[row.replica_id]: row.target_node_id}),
    });
    let opened;
    handler.createPartitionService = wrapPartitionServiceFactoryWithSnapshotCatchup({
      systemTableCache: cache,
      messageRouter: handler.messageRouter,
      createPartitionService: async (options) => {
        const initialized = await joining.createJoinLocalPartitionService({
          ...options,
          onPartitionConstructed(service, publish) {
            opened = service;
            if (scenario !== 'missing handoff') options.onPartitionConstructed(service, publish);
            if (scenario === 'repeated handoff') {
              assert.throws(() => options.onPartitionConstructed(service, publish),
                /one exact construction handoff/u);
            }
          },
        });
        openedAndHeld.resolve();
        await finishFactory.promise;
        return initialized;
      },
    });
    try {
      handler.initialize();
      await handler.awaitReplicaCreateAdmissionRecoveryBarrier();
      const worker = Promise.allSettled([...handler.operationTasks]);
      await Promise.race([openedAndHeld.promise, worker.then(() => {
        assert.fail('CREATE completed before reaching the held factory or CDC checkpoint');
      })]);
      assert.ok(opened?.raft, 'production join factory opened the native port');
      assert.equal(handler.getTrackedService(row.replica_id), null);
      assert.equal(joining.partitionServices.has(row.replica_id), false);
      const address = opened.unifiedAddress;
      const router = handler.messageRouter;
      const replacement = {
        replicaId: row.replica_id, partitionId: row.partition_id,
        transportHandler: () => ({}),
      };
      if (scenario === 'replaced during join factory') {
        joining.partitionServices.set(row.replica_id, replacement);
        handler.localServices.set(row.replica_id, replacement);
        handler.setLocalReplica(row.replica_id, replacement);
        router.register(address, replacement.transportHandler);
      }
      finishFactory.resolve();
      await worker;
      if (rejectedSubscription || scenario.endsWith('handoff')) {
        assert.equal(opened.isShutdown, true);
        assert.deepEqual(outcomes, [WORKFLOW_STEP.FAILED]);
        assert.equal(handler.getTrackedService(row.replica_id), null);
        assert.equal(joining.partitionServices.has(row.replica_id), false);
        assert.equal(router.getRegisteredHandler(address), null);
      } else if (scenario === 'replaced during join factory') {
        assert.equal(opened.isShutdown, true);
        assert.deepEqual(outcomes, []);
        assert.equal(handler.getTrackedService(row.replica_id), replacement);
        assert.equal(joining.partitionServices.get(row.replica_id), replacement);
        assert.equal(router.getRegisteredHandler(address), replacement.transportHandler);
      } else {
        assert.deepEqual(outcomes, [WORKFLOW_STEP.SYNCING, WORKFLOW_STEP.ACTIVE]);
        assert.equal(handler.getTrackedService(row.replica_id), opened);
        assert.equal(joining.partitionServices.get(row.replica_id), opened);
        assert.equal(authority.lifecycleStore.durableRow(
          SYSTEM_TABLE_NAME.SERVICES, row.replica_id)?.status, ReplicaStatus.ACTIVE);
      }
    } finally {
      finishFactory.resolve();
      await handler.shutdown();
      if (opened && !opened.isShutdown) await opened.shutdown();
      authority.close();
    }
  });
}

it('unavailable final CREATE authority retains the live work for existing admission recovery',
  async (t) => withHeldActivationRead(t, async (f) => {
    const original = f.handler.getTrackedService(f.row.replica_id);
    f.release();
    await f.worker;
    assert.equal(f.physicalShutdowns(), 0, 'unknown authority is not a FAILED create');
    assert.equal(f.handler.getTrackedService(f.row.replica_id), original);
    assert.deepEqual(f.outcomes, [WORKFLOW_STEP.SYNCING]);
    assert.equal(f.currentStatus(), ReplicaStatus.SYNCING);
    assert.equal(f.authority.read(f.row.operation_id).create_admission_state,
      CREATE_ADMISSION_STATE.MATERIALIZED);
    assert.ok(f.handler.replicaCreateAdmissionRecoveryRearmOwner.current());
    f.handler.startReplicaCreateAdmissionRecovery();
    await f.handler.replicaCreateAdmissionRecoveryTask;
    await Promise.all([...f.handler.operationTasks]);
    assert.equal(f.handler.getTrackedService(f.row.replica_id), original);
    assert.equal(f.physicalStarts(), 1, 'recovery finishes the same already-open runtime');
    assert.equal(f.currentStatus(), ReplicaStatus.ACTIVE);
    assert.deepEqual(f.outcomes, [WORKFLOW_STEP.SYNCING, WORKFLOW_STEP.ACTIVE]);
  }, {refuseRead: true}));

it('original CREATE wait ends before a held matching authority reply and the reply publishes nothing',
  async (t) => withHeldActivationRead(t, async (f) => {
    const original = f.handler.getTrackedService(f.row.replica_id);
    f.clock.advance(CREATE_AUTHORITY_BUDGET_MS);
    const settled = await Promise.race([f.worker.then(() => true), turn().then(() => false)]);
    f.release();
    await f.worker;
    assert.equal(settled, true, 'the original worker stops waiting while the read is still held');
    assert.deepEqual(f.outcomes, [WORKFLOW_STEP.SYNCING],
      'the late current reply cannot publish advisory ACTIVE');
    assert.equal(f.handler.getTrackedService(f.row.replica_id), original);
    assert.equal(f.currentStatus(), ReplicaStatus.SYNCING);
    assert.equal(f.authority.read(f.row.operation_id).create_admission_state,
      CREATE_ADMISSION_STATE.MATERIALIZED);
  }));

it('matching final CREATE authority can publish before the original deadline',
  async (t) => withHeldActivationRead(t, async (f) => {
    f.clock.advance(CREATE_AUTHORITY_BUDGET_MS - 1);
    f.release();
    await f.worker;
    assert.deepEqual(f.outcomes, [WORKFLOW_STEP.SYNCING, WORKFLOW_STEP.ACTIVE]);
    assert.equal(f.currentStatus(), ReplicaStatus.ACTIVE);
    assert.equal(f.physicalShutdowns(), 0);
  }));

it('lost fresh CREATE release reply retains and resumes the exact materialized work',
  async (t) => withHeldActivationRead(t, async (f) => {
    const original = f.handler.getTrackedService(f.row.replica_id);
    f.clock.advance(CREATE_AUTHORITY_BUDGET_MS / 2);
    f.release();
    await f.worker;
    assert.equal(f.physicalShutdowns(), 0, 'the actual release client uncertainty retains its target');
    assert.equal(f.currentStatus(), ReplicaStatus.SYNCING);
    assert.deepEqual(f.outcomes, [WORKFLOW_STEP.SYNCING]);
    assert.equal(f.releaseRequests.length, 1);
    f.handler.startReplicaCreateAdmissionRecovery();
    await f.handler.replicaCreateAdmissionRecoveryTask;
    assert.equal(f.releaseRequests.length, 2);
    assert.deepEqual(f.releaseRequests[1].createAdmissionIdentity,
      f.releaseRequests[0].createAdmissionIdentity);
    assert.equal(f.releaseRequests[1].deadlineAtMs, f.releaseRequests[0].deadlineAtMs);
    assert.equal(f.handler.getTrackedService(f.row.replica_id), original);
    assert.equal(f.physicalStarts(), 1);
    assert.equal(f.currentStatus(), ReplicaStatus.ACTIVE);
    assert.deepEqual(f.outcomes, [WORKFLOW_STEP.SYNCING, WORKFLOW_STEP.ACTIVE]);
  }, {loseReleaseReply: true}));

it('fresh CREATE cannot activate while the exact participant release route is missing',
  async (t) => withHeldActivationRead(t, async (f) => {
    await f.worker;
    const original = f.handler.getTrackedService(f.row.replica_id);
    assert.ok(original);
    assert.equal(f.currentStatus(), ReplicaStatus.SYNCING);
    assert.deepEqual(f.outcomes, [WORKFLOW_STEP.SYNCING]);
    assert.equal(f.physicalShutdowns(), 0);
    f.handler.registerWithRouter(f.releaseRouter);
    f.handler.startReplicaCreateAdmissionRecovery();
    await f.handler.replicaCreateAdmissionRecoveryTask;
    assert.equal(f.handler.getTrackedService(f.row.replica_id), original);
    assert.equal(f.physicalStarts(), 1);
    assert.equal(f.currentStatus(), ReplicaStatus.ACTIVE);
    assert.deepEqual(f.outcomes, [WORKFLOW_STEP.SYNCING, WORKFLOW_STEP.ACTIVE]);
  }, {unregisterReleaseRoute: true}));

for (const beforeRead of [true, false]) {
  it(`supersession ${beforeRead ? 'before' : 'during'} final CREATE authority retires the old work`,
    async (t) => withHeldActivationRead(t, async (f) => {
      if (!beforeRead) {
        await f.changeOperation({create_admission_owner_incarnation: 103});
      }
      f.release();
      await f.worker;
      assert.deepEqual(f.outcomes, [WORKFLOW_STEP.SYNCING]);
      assert.equal(f.physicalShutdowns(), 1);
      assert.equal(f.currentStatus(), ReplicaStatus.SYNCING);
      assert.equal(f.handler.replicaCreateAdmissionRecoveryRearmOwner.current(), null);
    }, {supersedeBeforeRead: beforeRead}));
}

for (const disposition of [
  {name: 'terminal success', status: ReplicaStatus.ACTIVE, step: WORKFLOW_STEP.ACTIVE,
    allowed: true},
  {name: 'terminal failure', status: ReplicaStatus.FAILED, step: WORKFLOW_STEP.FAILED,
    allowed: false},
  {name: 'retired target', status: ReplicaStatus.REMOVED, step: WORKFLOW_STEP.REMOVED,
    allowed: false},
  {name: 'conflicting terminal effect', status: ReplicaStatus.ACTIVE, step: WORKFLOW_STEP.FAILED,
    allowed: false},
]) {
  it(`final CREATE authority distinguishes ${disposition.name}`, async (t) =>
    withHeldActivationRead(t, async (f) => {
      await f.changeOperation({
        completed_at: 21, status: disposition.status, workflow_step: disposition.step,
      });
      f.release();
      await f.worker;
      assert.deepEqual(f.outcomes, disposition.allowed ?
        [WORKFLOW_STEP.SYNCING, WORKFLOW_STEP.ACTIVE] : [WORKFLOW_STEP.SYNCING]);
      assert.equal(f.physicalShutdowns(), disposition.allowed ? 0 : 1);
      assert.equal(f.currentStatus(), disposition.allowed ?
        ReplicaStatus.ACTIVE : ReplicaStatus.SYNCING);
    }));
}

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
});
