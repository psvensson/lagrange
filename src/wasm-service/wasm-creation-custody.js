// The physical lifecycle owns current registration and every admitted exact
// retirement, including work by path with no active object. U1 v3 D2/D3.
import {SERVICE_INSTANCE_OUTCOME as OUTCOME} from '../constants/service-instance.js';
import {instanceFailure, requireInstance} from
  '../control-plane/owners/service-instance-contract.js';
import {captureRetainedCreationOrigin, sameRetainedCreation} from
  '../service/service-consensus-creation-origin.js';
import {retireWasmCreation} from './wasm-creation-retirement.js';
import {WASM_CREATION_CURRENT as CURRENT, WASM_CREATION_RETIREMENT_FINALITY as FINALITY,
  WASM_SERVICE_REPLICA_STATE as STATE,
  WASM_SERVICE_LIFECYCLE_REFUSAL as REFUSAL} from './wasm-service-constants.js';

// This is admission for immediate start/projection, not the .live resource
// custody predicate (which deliberately includes CLEANUP_REQUIRED).
const CURRENT_STATES = new Set([STATE.CREATED, STATE.STARTING, STATE.READY]);

function captureLocalCreation(lifecycle, value) {
  const origin = captureRetainedCreationOrigin(value);
  requireInstance(origin.intent.consensusSlotRequest.nodeId === lifecycle.nodeId,
    OUTCOME.INVALID_LINEAGE);
  requireInstance(origin.token !== null, OUTCOME.UNAVAILABLE);
  return origin;
}

function observeCurrentWasmCreation(lifecycle, value) {
  try {
    requireInstance(!lifecycle.consensusClosing, REFUSAL.REPLICA_RETIRED);
    const origin = captureLocalCreation(lifecycle, value);
    const replica = lifecycle.activeReplicas.get(origin.intent.descriptor.serviceId);
    const outcome = [
      [replica === undefined, CURRENT.ABSENT],
      // MUTATION V5: compare a token ID only; disregard immutable intent.
      [replica?.consensusCreation?.token?.operationId !== origin.token.operationId,
        CURRENT.DIFFERENT],
      [CURRENT_STATES.has(replica?.lifecycleState), CURRENT.CURRENT],
      [true, CURRENT.UNAVAILABLE],
    ].find(([matches]) => matches)[1];
    return {outcome, ...(outcome === CURRENT.UNAVAILABLE ?
      {reason: REFUSAL.REPLICA_RETIRED} : {})};
  } catch (error) {
    return {outcome: CURRENT.UNAVAILABLE, reason: instanceFailure(error).outcome};
  }
}

function requireRetirementOrigin(lifecycle, origin) {
  const instances = new Set([...lifecycle.activeReplicas.values(), ...lifecycle.retiringReplicas]);
  for (const replica of instances) {
    const existing = replica.consensusCreation;
    if (existing?.intent.consensusSlotRequest.operationId === origin.operationId) {
      requireInstance(sameRetainedCreation(existing, origin), OUTCOME.CONTENT_CONFLICT);
    }
  }
}

function admitWasmRetirement(lifecycle, value) {
  let origin;
  try {
    requireInstance(!lifecycle.consensusClosing, OUTCOME.UNAVAILABLE);
    origin = captureLocalCreation(lifecycle, value);
    const existing = lifecycle.creationRetirements.get(origin.operationId);
    if (existing !== undefined) {
      requireInstance(sameRetainedCreation(existing.origin, origin), OUTCOME.CONTENT_CONFLICT);
      return existing.promise;
    }
    requireRetirementOrigin(lifecycle, origin);
  } catch (error) {
    return Promise.resolve({outcome: instanceFailure(error).outcome, retired: false,
      closed: false, finality: FINALITY.UNRESOLVED});
  }
  const task = Promise.withResolvers();
  const entry = {origin, promise: task.promise};
  lifecycle.creationRetirements.set(origin.operationId, entry);
  // Install before invocation: resource release may synchronously reenter
  // shutdownAll or retireReplica before returning its promise.
  const finish = () => {
    if (lifecycle.creationRetirements.get(origin.operationId) === entry) {
      lifecycle.creationRetirements.delete(origin.operationId);
    }
  };
  retireWasmCreation(lifecycle, origin).then((result) => {
    finish();
    task.resolve(result);
  }, (error) => {
    finish();
    task.reject(error);
  });
  return entry.promise;
}

export {observeCurrentWasmCreation, admitWasmRetirement};
