// ServiceLifecycleManager's physical continuation of its one retained CREATE.
// Lower runtime owners consume this origin; none may mint a nested journal.
import {SERVICE_LIFECYCLE_STATE, UNIFIED_SERVICE_TYPE} from '../constants/index.js';
import {SERVICE_INSTANCE_LIMIT as LIMIT, SERVICE_INSTANCE_OUTCOME as OUTCOME} from
  '../constants/service-instance.js';
import {captureInstanceJson, instanceDigest, instanceFailure, requireInstance} from
  '../control-plane/owners/service-instance-contract.js';
import {matchesInstanceResourceToken} from '../control-plane/owners/service-instance-state.js';
import {captureConsensusCreationIntent, prepareConsensusCreation} from
  './service-consensus-creation-intent.js';

const CONSENSUS_BOOTSTRAP = Object.freeze({
  HELD: 'BOOTSTRAPPED_HELD', ADMISSION: 'ADMISSION_RETAINED',
  CONTEXT_REQUIRED: 'CONSENSUS_CREATION_CONTEXT_REQUIRED',
  SERVING_UNAVAILABLE: 'CONSENSUS_SERVING_NOT_IMPLEMENTED',
});
const FIELDS = ['consensusBinding', 'consensusSlotRequest', 'consensusResourceToken'];
function hasConsensusCreation(value) {
  return value !== null && typeof value === 'object' &&
    FIELDS.some((field) => Object.hasOwn(value, field));
}
function consensusBootstrapDescriptor(origin) {
  return {...origin.intent.descriptor, consensusBinding: origin.intent.consensusBinding,
    consensusSlotRequest: origin.intent.consensusSlotRequest, consensusResourceToken: origin.token};
}
function captureConsensusBootstrap(definition, context) {
  requireInstance(context?.consensusCreation?.outcome === CONSENSUS_BOOTSTRAP.ADMISSION,
    CONSENSUS_BOOTSTRAP.CONTEXT_REQUIRED);
  const retained = context.consensusCreation;
  const intent = captureConsensusCreationIntent(retained.intent);
  const token = captureInstanceJson(retained.token, LIMIT.SLOT_BYTES);
  requireInstance(matchesInstanceResourceToken(intent.consensusBinding,
    intent.consensusSlotRequest, token), OUTCOME.CONTENT_CONFLICT);
  requireInstance(retained.operationId === token.operationId, OUTCOME.CONTENT_CONFLICT);
  const origin = {intent, token, operationId: token.operationId,
    outcome: CONSENSUS_BOOTSTRAP.ADMISSION};
  const descriptor = consensusBootstrapDescriptor(origin);
  requireInstance(instanceDigest(captureInstanceJson(definition, LIMIT.STATE_BYTES)) ===
    instanceDigest(descriptor), OUTCOME.CONTENT_CONFLICT);
  return {origin, descriptor};
}
function confirmConsensusBootstrapResult(result, origin) {
  requireInstance(result?.status === CONSENSUS_BOOTSTRAP.HELD &&
    instanceDigest(result.consensusBinding ?? null) ===
      instanceDigest(origin.intent.consensusBinding) &&
    instanceDigest(result.consensusResourceToken ?? null) === instanceDigest(origin.token),
  CONSENSUS_BOOTSTRAP.SERVING_UNAVAILABLE);
  return {...result, operationId: origin.operationId};
}
async function bootstrapConsensusCreation(manager, value, context = {}) {
  let operationId = null;
  try {
    const retained = await prepareConsensusCreation(manager, value, context);
    if (retained.outcome !== CONSENSUS_BOOTSTRAP.ADMISSION) return retained;
    operationId = retained.operationId;
    const descriptor = consensusBootstrapDescriptor(retained);
    const adapter = manager._resolveAdapter(UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE);
    const owned = {definition: descriptor, consensusCreation: retained,
      consensusOpeningOwner: manager};
    manager._replicaStateById.set(descriptor.replicaId, SERVICE_LIFECYCLE_STATE.STARTING);
    await adapter.createReplica(owned);
    const result = await adapter.startReplica(owned);
    return confirmConsensusBootstrapResult(result, retained);
  } catch (error) {
    // The original intent/admission remains IN_PROGRESS, including on a
    // partially opened resource. No FAILED/COMPLETED row discharges custody.
    const failure = instanceFailure(error);
    return operationId === null ? failure :
      {outcome: OUTCOME.UNKNOWN, reason: failure.outcome, operationId};
  }
}
export {CONSENSUS_BOOTSTRAP, hasConsensusCreation, consensusBootstrapDescriptor,
  captureConsensusBootstrap, confirmConsensusBootstrapResult, bootstrapConsensusCreation};
