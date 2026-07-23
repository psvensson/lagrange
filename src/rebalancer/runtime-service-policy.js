import {
  hasRequestBindingServiceDefinitionLineage,
} from '../control-plane/owners/request-binding-service-definition-contract.js';
import {SD_COL} from '../wasm-service/wasm-service-models.js';
import {REBALANCER_DEFAULT_POLICY} from './rebalancer-constants.js';

/**
 * Project the effective runtime-service target used by the placement owner.
 *
 * Binding-derived definitions carry no replica intent, so their legacy
 * `replica_count` storage value is ignored. Non-Binding definitions retain the
 * existing built-in scale/start contract. Consumers use this projection
 * directly instead of materializing a generated policy value back into desired
 * state.
 *
 * @param {Object|null|undefined} definition - service_definitions row.
 * @return {number} Effective system placement target.
 */
function resolveRuntimeServiceTargetReplicaCount(definition) {
  const policyTarget =
    REBALANCER_DEFAULT_POLICY.RUNTIME_SERVICE.targetReplicaCount;
  if (hasRequestBindingServiceDefinitionLineage(definition)) {
    return policyTarget;
  }
  const desiredReplicaCount = Number(
    definition?.[SD_COL.REPLICA_COUNT] ?? definition?.replicaCount,
  );
  return Number.isFinite(desiredReplicaCount) && desiredReplicaCount >= 0 ?
    desiredReplicaCount :
    policyTarget;
}

export {resolveRuntimeServiceTargetReplicaCount};
