import {META_SERVICE_ID, META_SERVICE_RUNTIME_REF} from '../../constants/wasm-meta.js';
import {RUNTIME_KIND} from '../../constants/runtime.js';
import {validatePgwireRuntimeConfig} from '../../runtime/pgwire-descriptor.js';
import {SD_COL} from '../../wasm-service/wasm-service-models.js';
import {WASM_SERVICE_DEFINITION_STATUS, WASM_SERVICE_PROTOCOL} from
  '../../wasm-service/wasm-service-constants.js';
import {classifyControlPlaneMutationResult} from '../control-plane-mutation-outcome-classifier.js';

const POSTGRES_WIRE_SCALE_ERROR_CODE = Object.freeze({
  REQUEST_INVALID: 'POSTGRES_WIRE_SCALE_REQUEST_INVALID',
  DEFINITION_MISMATCH: 'POSTGRES_WIRE_SCALE_DEFINITION_MISMATCH',
  OUTCOME_UNCONFIRMED: 'POSTGRES_WIRE_SCALE_OUTCOME_UNCONFIRMED',
});
const POSTGRES_WIRE_SCALE_STATE = Object.freeze({
  DESIRED_STATE_PERSISTED: 'desired_state_persisted',
});
const SCALE_MESSAGE = Object.freeze({
  REQUEST_INVALID: 'Scaling requires only replicaCount and runtimeConfig',
  COUNT_INVALID: 'replicaCount must be a non-negative safe integer',
  CONFIG_INVALID: 'runtimeConfig must satisfy the PostgreSQL wire descriptor',
  DEFINITION_MISMATCH: 'The active built-in PostgreSQL wire definition did not match',
  OUTCOME_UNCONFIRMED: 'The PostgreSQL wire desired-state write is not confirmed',
});
const SCALE_REQUEST_FIELDS = new Set(['replicaCount', 'runtimeConfig']);
const POSTGRES_WIRE_SCALE_PREDICATE = Object.freeze({
  [SD_COL.SERVICE_ID]: META_SERVICE_ID.POSTGRES_WIRE,
  [SD_COL.RUNTIME_KIND]: RUNTIME_KIND.NATIVE_JS,
  [SD_COL.RUNTIME_REF]: META_SERVICE_RUNTIME_REF.POSTGRES_WIRE,
  [SD_COL.PROTOCOL]: WASM_SERVICE_PROTOCOL.POSTGRESQL,
  [SD_COL.STATUS]: WASM_SERVICE_DEFINITION_STATUS.ACTIVE,
});

function scaleError(code, message, fields = {}) {
  return Object.assign(new Error(message), {code, ...fields});
}

function compilePostgresWireScaleRequest(request) {
  const invalid = POSTGRES_WIRE_SCALE_ERROR_CODE.REQUEST_INVALID;
  if (!request || typeof request !== 'object' || Array.isArray(request) ||
      Object.keys(request).some((key) => !SCALE_REQUEST_FIELDS.has(key))) {
    throw scaleError(invalid, SCALE_MESSAGE.REQUEST_INVALID);
  }
  if (!Number.isSafeInteger(request.replicaCount) || request.replicaCount < 0) {
    throw scaleError(invalid, SCALE_MESSAGE.COUNT_INVALID);
  }
  let runtimeConfig;
  try {
    runtimeConfig = JSON.stringify(request.runtimeConfig);
  } catch {
    throw scaleError(invalid, SCALE_MESSAGE.CONFIG_INVALID);
  }
  const validation = validatePgwireRuntimeConfig(runtimeConfig);
  if (!validation.valid) throw scaleError(invalid, SCALE_MESSAGE.CONFIG_INVALID);
  return Object.freeze({
    [SD_COL.REPLICA_COUNT]: request.replicaCount,
    [SD_COL.RUNTIME_CONFIG]: runtimeConfig,
  });
}

function describePostgresWireScaleResult(result, desired) {
  const effect = classifyControlPlaneMutationResult(result);
  if (effect.applied && !effect.deferred && !effect.visibilityPending &&
      effect.affectedRowsPresent && effect.affectedRows === 1) {
    return Object.freeze({
      serviceId: META_SERVICE_ID.POSTGRES_WIRE,
      scaleState: POSTGRES_WIRE_SCALE_STATE.DESIRED_STATE_PERSISTED,
      desiredState: Object.freeze({replicaCount: desired[SD_COL.REPLICA_COUNT],
        runtimeConfig: Object.freeze(JSON.parse(desired[SD_COL.RUNTIME_CONFIG]))}),
      mutationOutcome: effect.outcome,
    });
  }
  if (effect.zeroAffectedRows && effect.accepted && !effect.failed && !effect.deferred) {
    throw scaleError(POSTGRES_WIRE_SCALE_ERROR_CODE.DEFINITION_MISMATCH,
      SCALE_MESSAGE.DEFINITION_MISMATCH);
  }
  throw scaleError(POSTGRES_WIRE_SCALE_ERROR_CODE.OUTCOME_UNCONFIRMED,
    SCALE_MESSAGE.OUTCOME_UNCONFIRMED, {deferRetry: true, outcome: effect.outcome});
}

export {POSTGRES_WIRE_SCALE_ERROR_CODE, POSTGRES_WIRE_SCALE_PREDICATE,
  POSTGRES_WIRE_SCALE_STATE, compilePostgresWireScaleRequest,
  describePostgresWireScaleResult};
