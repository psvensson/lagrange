// WasmServiceLifecycle's retained-admission/physical-construction interaction.
// Pending entries join local lifetime only. Metadata remains the sole durable
// resource authority; this receiver never reserves a slot or grants serving.
import {captureConsensusCreationIntent} from '../service/service-consensus-creation-intent.js';
import {SERVICE_INSTANCE_LIMIT as LIMIT, SERVICE_INSTANCE_OUTCOME as OUTCOME,
  SERVICE_INSTANCE_PHASE as PHASE} from '../constants/service-instance.js';
import {captureInstanceJson, requireInstance, instanceDigest} from
  '../control-plane/owners/service-instance-contract.js';
import {matchesInstanceResourceToken} from '../control-plane/owners/service-instance-state.js';
import {runtimeServiceConsensusIdentity} from '../rebalancer/runtime-service-replica-identity.js';
import {WASM_SERVICE_REPLICA_STATE as STATE} from './wasm-service-constants.js';

function capturePreparation(owner, value) {
  const intent = captureConsensusCreationIntent(value.intent);
  const token = captureInstanceJson(value.token, LIMIT.SLOT_BYTES);
  const binding = intent.consensusBinding;
  const request = intent.consensusSlotRequest;
  requireInstance(matchesInstanceResourceToken(binding, request, token));
  requireInstance(request.nodeId === owner.nodeId, OUTCOME.INVALID_LINEAGE);
  const identity = runtimeServiceConsensusIdentity(binding);
  const peer = identity.peers.find((entry) => entry.replicaId === request.replicaId &&
    entry.nodeId === request.nodeId);
  requireInstance(peer !== undefined, OUTCOME.INVALID_LINEAGE);
  const definition = JSON.parse(intent.descriptor.runtimeConfig).definition;
  return {intent, definition: {...definition, serviceId: binding.serviceDefinitionId},
    opening: {binding, request, token, identity}, peer};
}
function requireLive(owner, pending) {
  requireInstance(!owner.consensusCreationClosed && !pending.stopping, OUTCOME.RESOURCE_CLOSED);
}
async function resolveAndCreate(owner, captured, pending, create) {
  const metadata = owner.dependencies.serviceDefinitionsOwner;
  requireInstance(typeof metadata?.resolveInstanceResource === 'function', OUTCOME.UNAVAILABLE);
  const {binding, token} = captured.opening;
  const resource = await metadata.resolveInstanceResource(binding, token);
  requireLive(owner, pending);
  requireInstance(owner.nodeId === captured.peer.nodeId, OUTCOME.INVALID_LINEAGE);
  requireInstance(resource?.outcome === OUTCOME.ADMITTED,
    resource?.outcome ?? OUTCOME.UNAVAILABLE);
  requireInstance(resource.phase === PHASE.ADMITTED, OUTCOME.RESOURCE_CLOSED);
  requireInstance(instanceDigest(resource.token) === instanceDigest(token),
    OUTCOME.CONTENT_CONFLICT);
  const current = owner.activeReplicas.get(binding.serviceDefinitionId);
  if (current) {
    requireInstance([STATE.CREATED, STATE.STARTING, STATE.READY].includes(current.lifecycleState),
      OUTCOME.RESOURCE_CLOSED);
    requireInstance(current.consensusOpening &&
      instanceDigest(current.consensusOpening) === instanceDigest(captured.opening),
    OUTCOME.TARGET_ALREADY_OWNED);
    return current;
  }
  return create(captured.definition, {replicaId: captured.peer.physicalReplicaId,
    replicaIds: captured.opening.identity.peers.map((peer) => peer.physicalReplicaId)},
  captured.opening);
}
function createAdmittedWasmReplica(owner, preparation, create) {
  let captured;
  try {
    captured = capturePreparation(owner, preparation);
    requireInstance(!owner.consensusCreationClosed, OUTCOME.RESOURCE_CLOSED);
  } catch (error) {
    return Promise.reject(error);
  }
  const id = captured.definition.serviceId;
  const key = instanceDigest(captured.opening);
  const prior = owner.pendingConsensusCreations.get(id);
  if (prior) {
    try {
      requireLive(owner, prior);
      requireInstance(prior.key === key, OUTCOME.CONTENT_CONFLICT);
      return prior.promise;
    } catch (error) {
      return Promise.reject(error);
    }
  }
  const pending = {...Promise.withResolvers(), key, stopping: false};
  owner.pendingConsensusCreations.set(id, pending);
  const finish = () => {
    if (!pending.stopping && owner.pendingConsensusCreations.get(id) === pending) {
      owner.pendingConsensusCreations.delete(id);
    }
  };
  resolveAndCreate(owner, captured, pending, create).then((replica) => {
    finish(); pending.resolve(replica);
  }, (error) => {
    finish(); pending.reject(error);
  });
  return pending.promise;
}
async function joinAdmittedWasmCreation(owner, serviceId) {
  const pending = owner.pendingConsensusCreations.get(serviceId);
  if (!pending) return;
  pending.stopping = true;
  await Promise.allSettled([pending.promise]);
}
export {createAdmittedWasmReplica, joinAdmittedWasmCreation};
