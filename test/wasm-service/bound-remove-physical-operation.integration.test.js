// Complete supported bound operations: real retained handler CREATE, native
// publication, exact endpoint-before-retirement await, owner refusal and retry.
// Metadata is component SQLite; this does not certify distributed SQL or crashes.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {publishedWorld, retainSuccessor, dispatchCreates, assertServing, outcomes,
  serviceRow, endpointRow, journalRow, resource, localRecord, waitFor, holdExactEndpointDeletion,
  failExactNativeClose, removeAndSettle, assertRetired, withCleanup} from
  './bound-remove-physical-operation-fixture.js';
import {consensusBootstrapDescriptor} from '../../src/service/service-consensus-bootstrap.js';
import {ReplicaOperationMessageType as TYPE, ReplicaOperationResponseStatus as REPLY} from
  '../../src/rebalancer/replica-operation-constants.js';
import {EXECUTOR_OUTCOME_TYPE as OUTCOME} from
  '../../src/rebalancer/executor-outcome-constants.js';
import {RUNTIME_SERVICE_HANDLER_ERROR_MSG as ERROR} from
  '../../src/node/runtime-service-handler-constants.js';
import {WASM_SERVICE_REPLICA_STATE as STATE} from
  '../../src/wasm-service/wasm-service-constants.js';
import {isServing} from '../../src/wasm-service/wasm-service-serving-state.js';

function observePhysicalEntry(host) {
  const retire = host.lifecycle.retireReplica;
  const create = host.lifecycle.createReplica;
  const calls = [];
  const creations = [];
  host.lifecycle.retireReplica = function(origin) {
    calls.push(structuredClone(origin));
    return Reflect.apply(retire, this, [origin]);
  };
  host.lifecycle.createReplica = function(definition, config) {
    creations.push({serviceId: definition.serviceId, token: config.consensusCreation?.token});
    return Reflect.apply(create, this, [definition, config]);
  };
  return {calls, creations, restore() {
    host.lifecycle.retireReplica = retire;
    host.lifecycle.createReplica = create;
  }};
}

async function assertGrantHeld(e, next) {
  const result = await e.metadata.primary.grantInstanceResource(
    next.origin.intent.consensusBinding, next.origin.token);
  assert.equal(result.outcome, 'PREDECESSOR_OUTSTANDING',
    'SUCCESSOR_GAINED_SERVING_PERMISSION_WHILE_OLD_PHYSICAL_DEBT_REMAINED');
  assert.equal(resource(e, next.origin).phase, 'ADMITTED');
}

test('U1 bound REMOVE exact endpoint await preserves old physical custody and successor exclusion',
  async (t) => {
    const {e, originals} = await publishedWorld(t);
    const old = originals[0];
    const initialEndpoint = endpointRow(e, old.origin);
    const operationId = 'bound-prephysical-remove';
    const observed = observePhysicalEntry(old.host);
    const gate = holdExactEndpointDeletion(e, old);
    let successors;
    await withCleanup(async () => {
      assert.equal((await e.dispatch(old.host, TYPE.REMOVE_REPLICA, operationId)).status,
        REPLY.INITIATED);
      await waitFor(() => gate.entry !== null, 'exact old endpoint deletion');
      assert.equal(gate.entry.endpointId, initialEndpoint.endpoint_id);
      assert.equal(gate.entry.whereClause.boot_incarnation, old.host.bootIncarnation);
      assert.equal(observed.calls.length, 0, 'PHYSICAL_RETIREMENT_ENTERED_BEFORE_ENDPOINT_RELEASE');
      assert.equal(observed.creations.length, 0);
      assert.equal(old.db.open, true);
      assert.equal(isServing(old.replica), true);
      assert.strictEqual(e.replicaOf(old.host), old.replica);
      assert.deepEqual(endpointRow(e, old.origin), initialEndpoint);

      // Selection/reservation and serving permission have different owners.
      successors = await retainSuccessor(e);
      const next = successors[0];
      assert.equal(next.origin.intent.consensusSlotRequest.replicaId,
        old.origin.intent.consensusSlotRequest.replicaId, 'COMPETITOR_DID_NOT_SHARE_REPLICA_SLOT');
      await assertGrantHeld(e, next);
      const reply = await e.dispatch(next.host, TYPE.CREATE_REPLICA, next.origin.operationId);
      assert.equal(reply.status, REPLY.IN_PROGRESS);
      const deferred = outcomes(next.host, next.origin.operationId,
        OUTCOME.RUNTIME_SERVICE_CREATE_FAILED);
      assert.equal(deferred.length, 1);
      assert.equal(deferred[0].deferRetry, true);
      assert.equal(deferred[0].errorCode, ERROR.RETIREMENT_IN_PROGRESS,
        'SUCCESSOR_REFUSED_ONLY_BY_UNRELATED_SETUP_FAILURE');
      assert.equal(outcomes(next.host, next.origin.operationId,
        OUTCOME.RUNTIME_SERVICE_CREATE_ACTIVE).length, 0);
      assert.equal(observed.calls.length, 0);
      assert.equal(observed.creations.length, 0, 'SUCCESSOR_ENTERED_PHYSICAL_CONSTRUCTION');
      assert.strictEqual(e.replicaOf(old.host), old.replica);
      assert.equal(old.db.open, true);
      assert.equal(serviceRow(e, next.origin), null, 'SUCCESSOR_PROJECTED_BEFORE_PHYSICAL_ADMISSION');
      assert.equal(endpointRow(e, next.origin), null);
    }, [() => gate.release(), () => gate.restore(), () => e.settle(), () => observed.restore()]);
    assert.equal(observed.calls.length, 1, 'EXACT_ORIGINAL_RETIREMENT_WAS_NOT_ENGAGED_ONCE');
    assert.deepEqual(observed.calls[0].intent, old.origin.intent);
    assert.deepEqual(observed.calls[0].token, old.origin.token);
    assertRetired(e, old, operationId);
    for (const other of originals.slice(1)) {
      const removeId = `remaining-old-${other.host.slot}`;
      await removeAndSettle(e, other, removeId);
      assertRetired(e, other, removeId);
    }
    assert.ok(originals.every((item) => resource(e, item.origin).phase === 'CLOSED'));
    await dispatchCreates(e, successors);

    const next = successors[0];
    const successor = assertServing(e, next.host, next.origin);
    const successorDb = successor.db;
    const endpointBefore = endpointRow(e, next.origin);
    const rowBefore = serviceRow(e, next.origin);
    const replayEntry = observePhysicalEntry(old.host);
    const replay = await withCleanup(async () => {
      const result = await old.host.manager.stopReplica({
        definition: consensusBootstrapDescriptor(old.origin), consensusCreation: old.origin,
        consensusOpeningOwner: old.host.manager});
      // Native survival comes before draining or result vocabulary: a wrong
      // target's semantic failure stays primary even if cleanup also fails.
      assert.equal(successorDb.open, true, 'EXACT_OLD_RETIREMENT_REPLAY_CLOSED_SUCCESSOR_DB');
      assert.strictEqual(e.replicaOf(next.host), successor,
        'EXACT_OLD_RETIREMENT_REPLAY_REMOVED_SUCCESSOR_OBJECT');
      return result;
    }, [() => e.settle(), () => replayEntry.restore()]);
    assert.equal(isServing(successor), true);
    assert.deepEqual(endpointRow(e, next.origin), endpointBefore);
    assert.deepEqual(serviceRow(e, next.origin), rowBefore);
    assert.equal(localRecord(next.host, next.origin).phase, 'PUBLISHED');
    assert.equal(journalRow(e, next.origin).state, 'in_progress');
    assert.equal(replayEntry.calls.length, 1, 'EXACT_OLD_REPLAY_DID_NOT_ENTER_PHYSICAL_RETIREMENT');
    assert.deepEqual(replayEntry.calls[0].intent, old.origin.intent);
    assert.deepEqual(replayEntry.calls[0].token, old.origin.token);
    assert.equal(replayEntry.creations.length, 0);
    assert.equal(replay.finality, 'FINAL');
    assertServing(e, next.host, next.origin);
  });

test('U1 bound handler REMOVE retains failed native close debt and retries its original resource',
  async (t) => {
    const {e, originals} = await publishedWorld(t);
    const old = originals[0];
    const operationId = 'bound-native-close-retry';
    const fault = failExactNativeClose(old.db);
    await withCleanup(async () => {
      await removeAndSettle(e, old, operationId);
      assert.ok(fault.calls > 0, 'EXACT_BOUND_NATIVE_CLOSE_FAULT_WAS_NOT_ENGAGED');
      assert.equal(outcomes(old.host, operationId, OUTCOME.RUNTIME_SERVICE_REMOVE_COMPLETED).length,
        0, 'FAILED_NATIVE_CLOSE_FORGED_BOUND_REMOVE_COMPLETION');
      assert.equal(outcomes(old.host, operationId, OUTCOME.RUNTIME_SERVICE_REMOVE_HELD).length, 1);
      assert.equal(old.db.open, true);
      assert.strictEqual(old.replica.db, old.db, 'FAILED_CLOSE_DROPPED_EXACT_NATIVE_REFERENCE');
      assert.equal(old.replica.lifecycleState, STATE.CLEANUP_REQUIRED);
      assert.equal(old.host.lifecycle.retiringReplicas.has(old.replica), true);
      assert.strictEqual(e.replicaOf(old.host), old.replica);
      assert.equal(resource(e, old.origin).phase, 'RELEASING');
      assert.equal(journalRow(e, old.origin).state, 'in_progress');
      assert.equal(localRecord(old.host, old.origin).phase, 'RETIRED');
      assert.equal(endpointRow(e, old.origin), null);
      assert.ok(serviceRow(e, old.origin), 'NONFINAL_RETIREMENT_DELETED_OLD_SERVICES_ROW');
      const successors = await retainSuccessor(e);
      await assertGrantHeld(e, successors[0]);
    }, [() => fault.restore(), () => e.settle()]);
    assert.equal((await e.dispatch(old.host, TYPE.REMOVE_REPLICA, operationId)).status,
      REPLY.IN_PROGRESS);
    await e.settle(() => outcomes(old.host, operationId,
      OUTCOME.RUNTIME_SERVICE_REMOVE_COMPLETED).length > 0, 'original bound REMOVE retry');
    assertRetired(e, old, operationId);
  });
