// One canonical lifecycle projection. Bound writes consume the physical
// owner's synchronous observation; no identity side map or pre-await claim.
import {SERVICE_LIFECYCLE_STATE as STATE} from '../constants/index.js';
import {WASM_CREATION_CURRENT as CURRENT} from '../wasm-service/wasm-service-constants.js';
import {captureRetainedCreationOrigin, sameRetainedCreation} from
  './service-consensus-creation-origin.js';

const LIFECYCLE_STATE_OWNERSHIP = Object.freeze({GENERIC: 'GENERIC', CREATION: 'CREATION'});
const OWNERSHIP = LIFECYCLE_STATE_OWNERSHIP;

function recordGenericReplicaState(manager, replicaId, state) {
  manager._replicaStateById.set(replicaId, {state, ownership: OWNERSHIP.GENERIC});
}

function projectCreationReplicaState(manager, owned, state) {
  const origin = captureRetainedCreationOrigin(owned.consensusCreation);
  const replicaId = origin.intent.consensusSlotRequest.replicaId;
  const record = manager._replicaStateById.get(replicaId);
  const ownsRecord = record?.ownership === OWNERSHIP.CREATION &&
    sameRetainedCreation(record.origin, origin);
  const observation = manager.observeCurrentCreation({consensusCreation: origin});
  const permitted = state === STATE.STOPPED ? ownsRecord && observation.outcome === CURRENT.ABSENT :
    observation.outcome === CURRENT.CURRENT && (state !== STATE.STOPPING || ownsRecord);
  if (permitted) {
    manager._replicaStateById.set(replicaId, {state, ownership: OWNERSHIP.CREATION, origin});
  }
  return observation;
}

export {recordGenericReplicaState, projectCreationReplicaState};
