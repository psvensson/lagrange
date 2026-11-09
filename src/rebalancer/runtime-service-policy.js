import {
  getBindingServiceDefinitionSourceKind,
  hasRequestBindingServiceDefinitionLineage,
  supportsBindingServiceDefinitionSourceKind,
} from '../control-plane/owners/request-binding-service-definition-contract.js';
import {copyStrictOwnDataRecord} from '../utils/strict-own-data.js';
import {SD_COL} from '../wasm-service/wasm-service-models.js';
import {WASM_SERVICE_DEFINITION_STATUS} from '../wasm-service/wasm-service-constants.js';
import {REBALANCER_DEFAULT_POLICY} from './rebalancer-constants.js';

const numberIsSafeInteger = Number.isSafeInteger;
const objectFreeze = Object.freeze;
const stringPrototypeTrim = Function.call.bind(String.prototype.trim);

const RUNTIME_SERVICE_POLICY_STATE = objectFreeze({
  READY: 'ready',
  UNAVAILABLE: 'unavailable',
  INACTIVE: 'inactive',
  INVALID: 'invalid',
});
const RUNTIME_SERVICE_POLICY_ERROR_CODE = 'runtime_service_policy_unavailable';

class RuntimeServicePolicyUnavailableError extends Error {
  constructor(decision) {
    super(`Runtime service policy unavailable: ${decision.state}`);
    this.code = RUNTIME_SERVICE_POLICY_ERROR_CODE;
    this.reason = decision.state;
    this.deferRetry = true;
  }
}

function answer(state, targetReplicaCount = null, bindingSourceKind = null) {
  return objectFreeze({state, targetReplicaCount, bindingSourceKind,
    creationEligible: state === RUNTIME_SERVICE_POLICY_STATE.READY && targetReplicaCount > 0});
}

function hasCanonicalDefinitionId(row) {
  const id = row?.[SD_COL.SERVICE_ID];
  return typeof id === 'string' && id.length > 0 && stringPrototypeTrim(id) === id;
}

// One definition interpretation for placement, CREATE and outward views.
// A valid zero target is scale intent. An unavailable or invalid target is
// never zero and therefore cannot authorize removal planning.
function resolveRuntimeServiceDefinitionPolicy(definition) {
  if (definition === null || definition === undefined) {
    return answer(RUNTIME_SERVICE_POLICY_STATE.UNAVAILABLE);
  }
  const row = copyStrictOwnDataRecord(definition);
  if (!hasCanonicalDefinitionId(row)) {
    return answer(RUNTIME_SERVICE_POLICY_STATE.INVALID);
  }
  if (row[SD_COL.STATUS] === WASM_SERVICE_DEFINITION_STATUS.INACTIVE) {
    return answer(RUNTIME_SERVICE_POLICY_STATE.INACTIVE);
  }
  if (row[SD_COL.STATUS] !== WASM_SERVICE_DEFINITION_STATUS.ACTIVE) {
    return answer(RUNTIME_SERVICE_POLICY_STATE.INVALID);
  }
  if (hasRequestBindingServiceDefinitionLineage(row)) {
    const sourceKind = getBindingServiceDefinitionSourceKind(row);
    return supportsBindingServiceDefinitionSourceKind(sourceKind) ?
      answer(RUNTIME_SERVICE_POLICY_STATE.READY,
        REBALANCER_DEFAULT_POLICY.RUNTIME_SERVICE.targetReplicaCount, sourceKind) :
      answer(RUNTIME_SERVICE_POLICY_STATE.INVALID);
  }
  const target = row[SD_COL.REPLICA_COUNT];
  return numberIsSafeInteger(target) && target >= 0 ?
    answer(RUNTIME_SERVICE_POLICY_STATE.READY, target) :
    answer(RUNTIME_SERVICE_POLICY_STATE.INVALID);
}

export {resolveRuntimeServiceDefinitionPolicy, RUNTIME_SERVICE_POLICY_STATE,
  RuntimeServicePolicyUnavailableError};
