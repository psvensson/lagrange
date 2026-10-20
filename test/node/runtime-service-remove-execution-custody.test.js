// U1 v3 execution custody. Real RuntimeServiceHandler admission and
// creation-execution map; controlled STOP callbacks only at the owning
// lifecycle boundary. This is a component test, not a native retirement proof.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {RuntimeServiceHandler} from '../../src/node/runtime-service-handler.js';
import {installExecution} from '../../src/node/runtime-service-creation-execution.js';
import {routeBoundRemoval} from '../../src/node/runtime-service-bound-creation-route.js';
import {ReplicaOperationField as FIELD, ReplicaOperationMessageType as TYPE,
  ReplicaOperationResponseStatus as REPLY} from
  '../../src/rebalancer/replica-operation-constants.js';
import {EXECUTOR_OUTCOME_TYPE as OUTCOME} from
  '../../src/rebalancer/executor-outcome-constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {CONSENSUS_CREATION_RESULT as CREATION} from
  '../../src/service/service-consensus-creation-intent.js';
import {createOriginFixture} from '../service/service-consensus-creation-fixture.js';

const QUIET = {debug() {}, info() {}, warn() {}, error() {}};
const ENTITY = 'u1-generic-owner';
const REPLICA = `${ENTITY}-r1`;
const NODE = 'u1-node';

function request(operationId, entityId = ENTITY, replicaId = REPLICA, reason = 'cleanup') {
  return {
    [FIELD.TYPE]: TYPE.REMOVE_REPLICA,
    [FIELD.OPERATION_ID]: operationId,
    [FIELD.OPERATION_TYPE]: 'REMOVE',
    [FIELD.PARTITION_ID]: entityId,
    [FIELD.ENTITY_TYPE]: 'runtime_service',
    [FIELD.ENTITY_ID]: entityId,
    [FIELD.REPLICA_ID]: replicaId,
    [FIELD.REASON]: reason,
  };
}

function deferred() {
  return Promise.withResolvers();
}

async function turn() {
  await new Promise((resolve) => setImmediate(resolve));
}

function handlerWith(t, manager, {nodeId = NODE} = {}) {
  const outcomes = [];
  const handler = new RuntimeServiceHandler({
    nodeId,
    cdcIntegrationService: {},
    systemTableCache: {get: () => null},
    serviceLifecycleManager: manager,
    executorOutcomeEmitter: {
      emitOutcome(...args) {
        outcomes.push(args);
      },
    },
  });
  handler.logger = QUIET;
  handler.initialize();
  t.after(() => handler.shutdown());
  return {handler, outcomes};
}

function genericWorld(t, stopReplica) {
  const manager = {stopReplica};
  const {handler, outcomes} = handlerWith(t, manager);
  const incumbent = {entityId: ENTITY, replicaId: REPLICA, status: ReplicaStatus.ACTIVE,
    generation: 'I'};
  handler.localReplicas.set(REPLICA, incumbent);
  return {handler, outcomes, incumbent};
}

test('U1 execution: superseding the queued generic REMOVE prevents foreign physical STOP',
  async (t) => {
    const targets = [];
    const w = genericWorld(t, async (target) => {
      targets.push(target);
      return {stopped: true};
    });
    const first = await w.handler.handleRemoveReplica(request('old-remove'));
    assert.equal(first.status, REPLY.INITIATED);
    assert.equal(w.handler.inProgressOperations.size, 1);
    const admitted = w.handler.localReplicas.get(REPLICA);
    assert.equal(admitted.status, ReplicaStatus.REMOVING);
    const successor = {entityId: ENTITY, replicaId: REPLICA, status: ReplicaStatus.ACTIVE,
      generation: 'J'};
    w.handler.localReplicas.set(REPLICA, successor);
    await turn();
    await turn();
    assert.equal(targets.length, 0, 'STALE_QUEUED_REMOVE_STOPPED_THE_SUCCESSOR');
    assert.strictEqual(w.handler.localReplicas.get(REPLICA), successor,
      'OLD_REMOVE_OVERWROTE_THE_SUCCESSOR_MEMO');
    assert.equal(w.outcomes.length, 0, 'STALE_QUEUED_REMOVE_PUBLISHED_AN_OUTCOME');
    assert.equal(w.handler.inProgressOperations.size, 0,
      'STALE_QUEUED_REMOVE_DID_NOT_RELEASE_EXECUTION_GATE');

    const next = await w.handler.handleRemoveReplica(request('new-remove'));
    assert.equal(next.status, REPLY.INITIATED);
    await turn();
    await turn();
    assert.equal(targets.length, 1, 'SUCCESSOR_CLEANUP_REMAINED_BLOCKED_BY_OLD_GATE');
    assert.equal(w.handler.localReplicas.get(REPLICA).status, ReplicaStatus.REMOVED);
    assert.equal(w.handler.inProgressOperations.size, 0);
    assert.equal(w.outcomes.length, 1);
    assert.equal(w.outcomes[0][0], OUTCOME.RUNTIME_SERVICE_REMOVE_COMPLETED);
    assert.equal(w.outcomes[0][1], 'new-remove');
  });

test('U1 execution: a late STOP return cannot overwrite a successor and releases its gate',
  async (t) => {
    const entered = deferred();
    const release = deferred();
    const targets = [];
    const w = genericWorld(t, async (target) => {
      targets.push(target);
      if (targets.length === 1) {
        entered.resolve();
        await release.promise;
      }
      return {stopped: true};
    });
    assert.equal((await w.handler.handleRemoveReplica(request('old-inflight'))).status,
      REPLY.INITIATED);
    await entered.promise;
    const successor = {entityId: ENTITY, replicaId: REPLICA, status: ReplicaStatus.ACTIVE,
      generation: 'J'};
    w.handler.localReplicas.set(REPLICA, successor);
    release.resolve();
    await turn();
    await turn();
    assert.equal(targets.length, 1);
    assert.strictEqual(w.handler.localReplicas.get(REPLICA), successor,
      'LATE_OLD_STOP_SETTLED_SUCCESSOR_MEMO');
    assert.equal(w.outcomes.length, 0, 'LATE_OLD_STOP_EMITTED_SUCCESSOR_RESULT');
    assert.equal(w.handler.inProgressOperations.size, 0,
      'LATE_RETURN_RETAINED_OLD_EXECUTION_GATE');
    assert.equal((await w.handler.handleRemoveReplica(request('new-inflight'))).status,
      REPLY.INITIATED);
    await turn();
    await turn();
    assert.equal(targets.length, 2);
    assert.equal(w.outcomes.at(-1)[1], 'new-inflight');
  });

test('U1 execution: foreign REMOVE cannot join without owning an outcome observer',
  async (t) => {
    const entered = deferred();
    const release = deferred();
    const targets = [];
    const w = genericWorld(t, async (target) => {
      targets.push(target);
      entered.resolve();
      await release.promise;
      return {stopped: true};
    });
    try {
      const first = await w.handler.handleRemoveReplica(request('remove-owner'));
      assert.equal(first.status, REPLY.INITIATED);
      await entered.promise;
      assert.equal(w.handler.inProgressOperations.size, 1);

      const duplicate = await w.handler.handleRemoveReplica(request('remove-owner'));
      assert.equal(duplicate.status, REPLY.IN_PROGRESS,
        'AN_EXACT_DUPLICATE_LOST_ITS_IN_PROGRESS_JOIN');

      const foreign = await w.handler.handleRemoveReplica(request('remove-foreign'));
      assert.equal(foreign.status, REPLY.ERROR,
        'FOREIGN_REMOVE_WAS_ACKNOWLEDGED_WITH_NO_OUTCOME_OWNER');
      assert.equal(foreign.deferRetry, true,
        'FOREIGN_REMOVE_WAS_NOT_GIVEN_RETRY_CUSTODY');
      assert.equal(w.handler.inProgressOperations.size, 1);
      assert.equal(targets.length, 1,
        'FOREIGN_REMOVE_DISPATCHED_A_SECOND_PHYSICAL_STOP');
    } finally {
      release.resolve();
      await turn();
      await turn();
    }
    assert.equal(w.outcomes.length, 1);
    assert.equal(w.outcomes[0][0], OUTCOME.RUNTIME_SERVICE_REMOVE_COMPLETED);
    assert.equal(w.outcomes[0][1], 'remove-owner',
      'THE_ORIGINAL_OUTCOME_CHANGED_IDENTITY_AFTER_FOREIGN_DUPLICATE');
    assert.equal(w.handler.inProgressOperations.size, 0);
  });

test('U1 execution: failed STOP releases its attempt for independently admitted retry',
  async (t) => {
    let stops = 0;
    const w = genericWorld(t, async () => {
      stops += 1;
      if (stops === 1) throw new Error('OWNER_STOP_UNAVAILABLE');
      return {stopped: true};
    });
    assert.equal((await w.handler.handleRemoveReplica(request('failed-stop'))).status,
      REPLY.INITIATED);
    await turn();
    await turn();
    assert.equal(stops, 1);
    assert.equal(w.handler.localReplicas.get(REPLICA).status, ReplicaStatus.FAILED);
    assert.equal(w.outcomes.length, 1);
    assert.equal(w.outcomes[0][0], OUTCOME.RUNTIME_SERVICE_REMOVE_FAILED);
    assert.equal(w.handler.inProgressOperations.size, 0,
      'UNRESOLVED_STOP_RETAINED_ITS_OLD_ATTEMPT_GATE');
    assert.equal((await w.handler.handleRemoveReplica(request('retry-stop'))).status,
      REPLY.INITIATED);
    await turn();
    await turn();
    assert.equal(stops, 2);
    assert.equal(w.handler.localReplicas.get(REPLICA).status, ReplicaStatus.REMOVED);
    assert.equal(w.outcomes.at(-1)[0], OUTCOME.RUNTIME_SERVICE_REMOVE_COMPLETED);
    assert.equal(w.outcomes.at(-1)[1], 'retry-stop');
  });

test('U1 execution: silent bound retirement captures original target and one observer',
  async (t) => {
    const journal = await createOriginFixture({after: (cleanup) => t.after(cleanup)},
      {canonicalFounders: true});
    const retained = await journal.prepare();
    assert.equal(retained.outcome, 'ADMISSION_RETAINED');
    const entered = deferred();
    const release = deferred();
    const manager = journal.manager();
    const calls = [];
    manager.stopReplica = async (handle) => {
      calls.push(handle);
      entered.resolve();
      await release.promise;
      return {finality: 'FINAL', completion: {outcome: CREATION.ROW_COMPLETED}};
    };
    manager.observeCurrentCreation = () => ({outcome: 'ABSENT'});
    const entityId = journal.intent.descriptor.serviceId;
    const replicaId = journal.intent.consensusSlotRequest.replicaId;
    const creationId = journal.intent.consensusSlotRequest.operationId;
    const {handler, outcomes} = handlerWith(t, manager, {
      nodeId: journal.intent.consensusSlotRequest.nodeId,
    });
    const original = {entityId, replicaId, status: ReplicaStatus.REMOVING,
      operationId: creationId, origin: retained};
    handler.localReplicas.set(replicaId, original);
    // The shared execution owner owns the admitted silent recovery task.
    const scheduled = {operationId: creationId, entityId, replicaId,
      reason: 'restart_retirement_redrive'};
    const task = installExecution(handler, scheduled, TYPE.REMOVE_REPLICA, {
      silent: true, origin: retained, creationOperationId: creationId,
    });
    assert.ok(task);
    const observer = request('coordinator-remove', entityId, replicaId);
    assert.equal((await handler.handleRemoveReplica(observer)).status, REPLY.IN_PROGRESS);
    assert.equal((await handler.handleRemoveReplica(observer)).status, REPLY.IN_PROGRESS,
      'DUPLICATE_OBSERVER_ATTEMPTED_SECOND_ADMISSION');
    const foreign = await handler.handleRemoveReplica(
      request('second-coordinator', entityId, replicaId));
    assert.equal(foreign.status, REPLY.ERROR);
    assert.equal(handler.inProgressOperations.size, 1);
    const running = routeBoundRemoval(handler, task.params, creationId, task);
    await entered.promise;
    assert.equal(calls.length, 1);
    assert.equal(calls[0].consensusCreation.operationId, creationId,
      'BOUND_REMOVE_RECONSTRUCTED_AN_UNRELATED_CREATION');
    assert.deepEqual(calls[0].consensusCreation.token, retained.token,
      'BOUND_REMOVE_LOST_CAPTURED_RESOURCE_TOKEN');
    const successor = {entityId, replicaId, status: ReplicaStatus.ACTIVE,
      operationId: 'later-successor', generation: 'J'};
    handler.localReplicas.set(replicaId, successor);
    release.resolve();
    await running;
    assert.strictEqual(handler.localReplicas.get(replicaId), successor,
      'LATE_BOUND_RETIREMENT_OVERWROTE_THE_SUCCESSOR');
    assert.equal(handler.inProgressOperations.size, 0);
    assert.equal(calls.length, 1);
    assert.equal(outcomes.length, 1,
      'DUPLICATE_OBSERVER_PRODUCED_MULTIPLE_COORDINATOR_OUTCOMES');
    assert.equal(outcomes[0][0], OUTCOME.RUNTIME_SERVICE_REMOVE_COMPLETED);
    assert.equal(outcomes[0][1], 'coordinator-remove');
  });
