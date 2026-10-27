// Real retained bound CREATE/REMOVE owner chain on the existing C6 embedding.
// Metadata is component SQLite, native replica consensus is raft-rs, and hosts
// share a process. This is neither generic catalog activation nor crash proof.
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {embedding} from './bound-creation-handler-embedding-fixture.js';
import {runtimeServiceConsensusIdentity} from
  '../../src/rebalancer/runtime-service-replica-identity.js';
import {deriveEndpointId} from '../../src/runtime/runtime-endpoint-writer.js';
import {isServing} from '../../src/wasm-service/wasm-service-serving-state.js';
import {readWasmCreationLocal} from '../../src/wasm-service/wasm-creation-opening.js';
import {ReplicaOperationMessageType as TYPE, ReplicaOperationResponseStatus as REPLY} from
  '../../src/rebalancer/replica-operation-constants.js';
import {EXECUTOR_OUTCOME_TYPE as OUTCOME} from
  '../../src/rebalancer/executor-outcome-constants.js';

const TURN_LIMIT = 120;
const NATIVE_CLOSE_FAILURE = 'BOUND_REMOVE_EXACT_NATIVE_CLOSE_FAILED';

// A failed oracle owns its primary failure and every admitted cleanup step.
// In particular, restoring one diagnostic must not skip draining another.
async function withCleanup(action, cleanups) {
  const failures = [];
  let result;
  try {
    result = await action();
  } catch (error) {
    failures.push(error);
  }
  for (const cleanup of cleanups) {
    try {
      await cleanup();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) {
    throw new AggregateError(failures, 'Bound REMOVE witness and cleanup failures');
  }
  return result;
}

function outcomes(host, operationId, outcomeType) {
  return host.outcomes.filter((outcome) => outcome.operationId === operationId &&
    (outcomeType === undefined || outcome.outcomeType === outcomeType));
}

function physical(origin) {
  return runtimeServiceConsensusIdentity(origin.intent.consensusBinding,
    origin.intent.consensusSlotRequest);
}

function serviceRow(e, origin) {
  return e.metadata.db.prepare('SELECT * FROM services WHERE service_id = ?')
    .get(physical(origin).replicaId) ?? null;
}

function endpointRow(e, origin) {
  const id = physical(origin);
  return e.metadata.db.prepare('SELECT * FROM service_endpoints WHERE endpoint_id = ?')
    .get(deriveEndpointId(id.replicaId, id.nodeId)) ?? null;
}

function journalRow(e, origin) {
  return e.metadata.db.prepare('SELECT * FROM wasm_operations WHERE operation_id = ?')
    .get(origin.operationId) ?? null;
}

function resource(e, origin) {
  const state = e.metadata.state();
  const instance = [state.selected, state.retiring].find((candidate) =>
    candidate?.binding.incarnation === origin.intent.consensusBinding.incarnation);
  return instance?.resources[origin.intent.consensusSlotRequest.slot] ?? null;
}

function localRecord(host, origin) {
  const id = physical(origin);
  const db = new Database(host.dataDirectoryManager.getWasmServiceDbPath(id.groupId, id.replicaId),
    {readonly: true, fileMustExist: true});
  try {
    return readWasmCreationLocal(db)?.record ?? null;
  } finally {
    db.close();
  }
}

function assertServing(e, host, origin) {
  const replica = e.replicaOf(host);
  assert.ok(replica, 'REAL_BOUND_CREATE_HAS_NO_NATIVE_OBJECT');
  assert.equal(replica.db.open, true);
  assert.equal(isServing(replica), true, 'REAL_BOUND_CREATE_HAS_NOT_REACHED_SERVING');
  assert.deepEqual(replica.consensusCreation.token, origin.token);
  assert.strictEqual(e.transport.getRegisteredHandler(replica.unifiedAddress),
    replica.transportHandler);
  assert.equal(typeof replica.transportHandler, 'function');
  assert.equal(serviceRow(e, origin)?.status, 'active');
  assert.ok(endpointRow(e, origin), 'REAL_BOUND_CREATE_HAS_NO_ENDPOINT');
  assert.equal(localRecord(host, origin).phase, 'PUBLISHED');
  assert.equal(resource(e, origin)?.phase, 'PUBLISHED');
  assert.equal(journalRow(e, origin).state, 'in_progress');
  return replica;
}

async function dispatchCreates(e, creations) {
  for (const {host, origin, intent} of creations) {
    // These are fixture request inputs; no runtime registration or memo is edited.
    host.intent = intent;
    host.retained = origin;
    assert.equal((await e.dispatch(host, TYPE.CREATE_REPLICA)).status, REPLY.INITIATED);
  }
  await e.settle(() => creations.every(({host, origin}) =>
    outcomes(host, origin.operationId, OUTCOME.RUNTIME_SERVICE_CREATE_HELD).length > 0),
  'real bound founders held');
  await e.form();
  await e.settle(() => creations.every(({host, origin}) =>
    outcomes(host, origin.operationId, OUTCOME.RUNTIME_SERVICE_CREATE_ACTIVE).length === 1),
  'real bound founders published');
  for (const {host, origin} of creations) assertServing(e, host, origin);
}

async function publishedWorld(t) {
  const e = await embedding(t);
  const originals = [];
  for (const slot of [0, 1, 2]) {
    const host = await e.addHost(slot);
    const origin = await e.retain(host);
    assert.equal(origin.outcome, 'ADMISSION_RETAINED');
    originals.push({host, origin, intent: host.intent});
  }
  await dispatchCreates(e, originals);
  for (const old of originals) {
    old.replica = e.replicaOf(old.host);
    old.db = old.replica.db;
  }
  return {e, originals};
}

async function retainSuccessor(e) {
  const state = e.metadata.state();
  const selected = await e.metadata.primary.selectConsensusInstance(
    e.metadata.request(state.version, 401, state.selected.binding.incarnation));
  assert.equal(selected.outcome, 'SELECTED', 'LEGITIMATE_SUCCESSOR_SELECTION_DID_NOT_ENGAGE');
  const creations = [];
  for (const host of e.hosts) {
    const intent = e.intentFor(host.slot, selected.binding, `physical-successor-${host.slot}`);
    const origin = await host.manager.prepareConsensusCreation(intent);
    assert.equal(origin.outcome, 'ADMISSION_RETAINED');
    creations.push({host, origin, intent});
  }
  return creations;
}

async function waitFor(predicate, label) {
  for (let turn = 0; turn < TURN_LIMIT; turn += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail(`${label}: no engagement within ${TURN_LIMIT} event-loop turns`);
}

function holdExactEndpointDeletion(e, old) {
  const owner = old.host.owners.endpoints;
  const remove = owner.deleteWhere;
  const release = Promise.withResolvers();
  const id = physical(old.origin);
  const endpointId = deriveEndpointId(id.replicaId, id.nodeId);
  const gate = {entry: null, release: release.resolve};
  owner.deleteWhere = async function(whereClause, options) {
    if (whereClause.endpoint_id === endpointId && gate.entry === null) {
      gate.entry = {whereClause: structuredClone(whereClause), endpointId};
      await release.promise;
      assert.deepEqual(whereClause, gate.entry.whereClause,
        'HELD_ENDPOINT_MUTATION_CHANGED_ITS_CAPTURED_PREDICATE');
    }
    return Reflect.apply(remove, this, [whereClause, options]);
  };
  gate.restore = () => {
    owner.deleteWhere = remove;
  };
  return gate;
}

function failExactNativeClose(db) {
  const close = Database.prototype.close;
  const fault = {calls: 0, error: new Error(NATIVE_CLOSE_FAILURE)};
  Database.prototype.close = function(...args) {
    if (this === db) {
      fault.calls += 1;
      throw fault.error;
    }
    return Reflect.apply(close, this, args);
  };
  fault.restore = () => {
    Database.prototype.close = close;
  };
  return fault;
}

async function removeAndSettle(e, old, operationId) {
  const reply = await e.dispatch(old.host, TYPE.REMOVE_REPLICA, operationId);
  await e.settle(() => outcomes(old.host, operationId).length > 0, `REMOVE ${operationId}`);
  return reply;
}

function assertRetired(e, old, operationId) {
  assert.equal(outcomes(old.host, operationId, OUTCOME.RUNTIME_SERVICE_REMOVE_COMPLETED).length, 1);
  assert.equal(old.db.open, false, 'COMPLETED_BOUND_REMOVE_LEFT_OLD_NATIVE_DB_OPEN');
  assert.equal(localRecord(old.host, old.origin).phase, 'RETIRED');
  assert.equal(resource(e, old.origin)?.phase, 'CLOSED');
  assert.equal(serviceRow(e, old.origin), null);
  assert.equal(endpointRow(e, old.origin), null);
  assert.equal(journalRow(e, old.origin).state, 'completed');
  assert.equal(old.host.lifecycle.retiringReplicas.has(old.replica), false);
  assert.equal(old.host.lifecycle.creationRetirements.has(old.origin.operationId), false);
}

export {publishedWorld, retainSuccessor, dispatchCreates, assertServing, outcomes,
  serviceRow, endpointRow, journalRow, resource, localRecord, waitFor, holdExactEndpointDeletion,
  failExactNativeClose, removeAndSettle, assertRetired, withCleanup};
