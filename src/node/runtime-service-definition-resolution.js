import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_READ_LEADER_MODE,
  applyAuthoritativeSystemTableRowsToCache,
  readAuthoritativeControlPlaneRows,
} from '../control-plane/control-plane-system-table-gateway.js';
import {SD_COL} from '../wasm-service/wasm-service-models.js';
import {RUNTIME_SERVICE_HANDLER_LOG_MSG} from
  './runtime-service-handler-constants.js';

const MIN_ACTIVE_REPLICA_COUNT = 1;
const SELECT_SERVICE_DEFINITION_BY_ID_SQL =
  'SELECT * FROM service_definitions WHERE service_id = ?';

function isShipNotStartedServiceDefinition(row) {
  return Boolean(
    row &&
    row[SD_COL.REPLICA_COUNT] !== undefined &&
    Number(row[SD_COL.REPLICA_COUNT]) < MIN_ACTIVE_REPLICA_COUNT,
  );
}

function readCachedServiceDefinition(handler, entityId) {
  if (typeof handler?.systemTableCache?.get !== 'function') {
    return null;
  }
  return (
    handler.systemTableCache.get(
      SYSTEM_TABLE_NAME.SERVICE_DEFINITIONS,
      entityId,
    ) || null
  );
}

function resolveAuthoritativeDefinitionGateway(handler) {
  const cdc = handler?.cdcIntegrationService;
  const gateway = cdc?.controlPlaneSystemTableGateway || cdc || null;
  const hasReader = Boolean(
    gateway &&
    (typeof gateway.readAuthoritativeRows === 'function' ||
      typeof gateway.executeRead === 'function' ||
      typeof gateway.executeAuthoritativeSystemTableRead === 'function' ||
      typeof gateway.readRows === 'function'),
  );
  return hasReader ? gateway : null;
}

function extractFirstAuthoritativeDefinitionRow(readOutcome) {
  if (Array.isArray(readOutcome)) {
    return readOutcome[0] || null;
  }
  if (readOutcome?.success === true && Array.isArray(readOutcome.rows)) {
    return readOutcome.rows[0] || null;
  }
  return null;
}

async function fetchAuthoritativeServiceDefinitionRow(gateway, entityId) {
  try {
    const readOutcome = await readAuthoritativeControlPlaneRows(
      gateway,
      SYSTEM_TABLE_NAME.SERVICE_DEFINITIONS,
      SELECT_SERVICE_DEFINITION_BY_ID_SQL,
      [entityId],
      {
        authoritativeReadMode:
          CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
        leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
      },
    );
    return extractFirstAuthoritativeDefinitionRow(readOutcome);
  } catch (_error) {
    return null;
  }
}

async function resolveServiceDefinitionForCreate(handler, entityId) {
  const cached = readCachedServiceDefinition(handler, entityId);
  if (cached && !isShipNotStartedServiceDefinition(cached)) {
    return cached;
  }
  const gateway = resolveAuthoritativeDefinitionGateway(handler);
  const authoritativeRow = gateway ?
    await fetchAuthoritativeServiceDefinitionRow(gateway, entityId) :
    null;
  if (
    authoritativeRow &&
    !isShipNotStartedServiceDefinition(authoritativeRow)
  ) {
    applyAuthoritativeSystemTableRowsToCache(
      gateway,
      handler.systemTableCache,
      SYSTEM_TABLE_NAME.SERVICE_DEFINITIONS,
      [authoritativeRow],
    );
    return authoritativeRow;
  }
  handler.logger.warn(
    RUNTIME_SERVICE_HANDLER_LOG_MSG.DEFINITION_NOT_FOUND,
    {entityId, nodeId: handler.nodeId},
  );
  return null;
}

export {resolveServiceDefinitionForCreate};
