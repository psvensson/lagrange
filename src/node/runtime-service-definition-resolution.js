import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_READ_LEADER_MODE,
  applyAuthoritativeSystemTableRowsToCache,
  evictAuthoritativeAbsentSystemTableRowsFromCache,
} from '../control-plane/control-plane-system-table-gateway.js';
import {buildControlPlaneReadAuthority} from
  '../control-plane/control-plane-system-table-gateway-read-contracts.js';
import {copyDenseOwnDataRecordArray, copyStrictOwnDataRecord} from '../utils/strict-own-data.js';
import {resolveRuntimeServiceDefinitionPolicy} from '../rebalancer/runtime-service-policy.js';
import {SD_COL} from '../wasm-service/wasm-service-models.js';
import {RUNTIME_SERVICE_HANDLER_LOG_MSG} from './runtime-service-handler-constants.js';

const objectFreeze = Object.freeze;
const SELECT_SERVICE_DEFINITION_BY_ID_SQL =
  'SELECT * FROM service_definitions WHERE service_id = ?';
const SERVICE_DEFINITION_RESOLUTION_OUTCOME = objectFreeze({
  ELIGIBLE: 'ELIGIBLE',
  INELIGIBLE: 'INELIGIBLE',
  ABSENT: 'ABSENT',
  UNAVAILABLE: 'UNAVAILABLE',
});
const AUTHORITATIVE_DEFINITION_READ_AUTHORITY = buildControlPlaneReadAuthority({
  authoritativeReadMode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
  leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
});
const AUTHORITATIVE_DEFINITION_READ_OPTIONS = objectFreeze({
  readAuthority: AUTHORITATIVE_DEFINITION_READ_AUTHORITY,
  authoritativeReadMode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
  leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
});

function resolution(outcome, definition = null, policy = null, errorMessage = '') {
  return objectFreeze({outcome, definition, policy, errorMessage});
}

function unavailable(errorMessage = '') {
  return resolution(SERVICE_DEFINITION_RESOLUTION_OUTCOME.UNAVAILABLE, null, null, errorMessage);
}

// This read is keyed. A malformed population is unavailable, never absence or
// permission selected by filtering. Snapshot own-data before using any row.
function readKeyedDefinition(answer, entityId) {
  const envelope = copyStrictOwnDataRecord(answer);
  if (envelope?.success !== true) return null;
  const rows = copyDenseOwnDataRecordArray(envelope.rows);
  if (rows === null || rows.length > 1) return null;
  if (rows.length === 1 && rows[0][SD_COL.SERVICE_ID] !== entityId) return null;
  return rows;
}

function reconcileDefinitionCache(handler, gateway, entityId, definition) {
  if (definition === null) {
    evictAuthoritativeAbsentSystemTableRowsFromCache(gateway, handler.systemTableCache,
      SYSTEM_TABLE_NAME.SERVICE_DEFINITIONS, [{[SD_COL.SERVICE_ID]: entityId}]);
  } else {
    applyAuthoritativeSystemTableRowsToCache(gateway, handler.systemTableCache,
      SYSTEM_TABLE_NAME.SERVICE_DEFINITIONS, [definition]);
  }
}

async function readDefinitionOutcome(gateway, entityId) {
  if (typeof gateway?.readAuthoritativeRows !== 'function') return unavailable();
  try {
    const answer = await gateway.readAuthoritativeRows(
      SYSTEM_TABLE_NAME.SERVICE_DEFINITIONS,
      SELECT_SERVICE_DEFINITION_BY_ID_SQL, [entityId],
      AUTHORITATIVE_DEFINITION_READ_OPTIONS,
    );
    const rows = readKeyedDefinition(answer, entityId);
    if (rows === null) return unavailable();
    const definition = rows.length === 0 ? null : objectFreeze(rows[0]);
    if (definition === null) return resolution(SERVICE_DEFINITION_RESOLUTION_OUTCOME.ABSENT);
    const policy = resolveRuntimeServiceDefinitionPolicy(definition);
    const outcome = policy.creationEligible ? SERVICE_DEFINITION_RESOLUTION_OUTCOME.ELIGIBLE :
      SERVICE_DEFINITION_RESOLUTION_OUTCOME.INELIGIBLE;
    return resolution(outcome, definition, policy);
  } catch (error) {
    return unavailable(error?.message || '');
  }
}

async function resolveServiceDefinitionOutcomeForCreate(handler, entityId) {
  const gateway = handler.controlPlaneSystemTableGateway;
  const observed = await readDefinitionOutcome(gateway, entityId);
  if (observed.outcome !== SERVICE_DEFINITION_RESOLUTION_OUTCOME.UNAVAILABLE) {
    // Projection is best effort through its existing owner. It cannot choose
    // another row or turn a failed authoritative population into permission.
    reconcileDefinitionCache(handler, gateway, entityId, observed.definition);
  }
  if (observed.outcome === SERVICE_DEFINITION_RESOLUTION_OUTCOME.INELIGIBLE) {
    handler.logger.warn(RUNTIME_SERVICE_HANDLER_LOG_MSG.DEFINITION_NOT_FOUND,
      {entityId, nodeId: handler.nodeId});
  }
  return observed;
}

export {AUTHORITATIVE_DEFINITION_READ_AUTHORITY, SERVICE_DEFINITION_RESOLUTION_OUTCOME,
  resolveServiceDefinitionOutcomeForCreate};
