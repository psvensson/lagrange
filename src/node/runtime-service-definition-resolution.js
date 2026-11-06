import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {
  areAuthoritativeSystemTableCacheRowsEqual,
} from '../cache/system-table-cache-authoritative-reconciliation.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_READ_LEADER_MODE,
  applyAuthoritativeSystemTableRowsToCache,
  evictAuthoritativeAbsentSystemTableRowsFromCache,
  readAuthoritativeControlPlaneRows,
} from '../control-plane/control-plane-system-table-gateway.js';
import {
  buildControlPlaneReadAuthority,
} from '../control-plane/control-plane-system-table-gateway-read-contracts.js';
import {SD_COL} from '../wasm-service/wasm-service-models.js';
import {RUNTIME_SERVICE_HANDLER_LOG_MSG} from
  './runtime-service-handler-constants.js';

const MIN_ACTIVE_REPLICA_COUNT = 1;
const SELECT_SERVICE_DEFINITION_BY_ID_SQL =
  'SELECT * FROM service_definitions WHERE service_id = ?';
const FUNCTION_TYPE = 'function';

const SERVICE_DEFINITION_RESOLUTION_OUTCOME = Object.freeze({
  ELIGIBLE: 'ELIGIBLE',
  INELIGIBLE: 'INELIGIBLE',
  ABSENT: 'ABSENT',
  UNAVAILABLE: 'UNAVAILABLE',
});

const AUTHORITATIVE_DEFINITION_READ_AUTHORITY = buildControlPlaneReadAuthority({
  authoritativeReadMode:
    CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
  leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
});

function isShipNotStartedServiceDefinition(row) {
  return Boolean(
    row &&
    row[SD_COL.REPLICA_COUNT] !== undefined &&
    Number(row[SD_COL.REPLICA_COUNT]) < MIN_ACTIVE_REPLICA_COUNT,
  );
}

function readCachedServiceDefinition(handler, entityId) {
  if (typeof handler?.systemTableCache?.get !== FUNCTION_TYPE) {
    return null;
  }
  return (
    handler.systemTableCache.get(
      SYSTEM_TABLE_NAME.SERVICE_DEFINITIONS,
      entityId,
    ) || null
  );
}

function evictStaleCachedServiceDefinition(handler, gateway, entityId) {
  const cache = handler?.systemTableCache;
  const cached = readCachedServiceDefinition(handler, entityId);
  if (cached) {
    evictAuthoritativeAbsentSystemTableRowsFromCache(
      gateway,
      cache,
      SYSTEM_TABLE_NAME.SERVICE_DEFINITIONS,
      [cached],
    );
  }
}

function resolveAuthoritativeDefinitionGateway(handler) {
  const cdc = handler?.cdcIntegrationService;
  const gateway =
    handler?.controlPlaneSystemTableGateway ||
    cdc?.controlPlaneSystemTableGateway ||
    cdc ||
    null;
  const hasReader = Boolean(
    gateway &&
    (typeof gateway.readAuthoritativeRows === FUNCTION_TYPE ||
      typeof gateway.executeRead === FUNCTION_TYPE ||
      typeof gateway.executeAuthoritativeSystemTableRead === FUNCTION_TYPE ||
      typeof gateway.readRows === FUNCTION_TYPE),
  );
  return hasReader ? gateway : null;
}

function classifyAuthoritativeReadOutcome(readOutcome) {
  if (Array.isArray(readOutcome)) {
    return {
      succeeded: true,
      row: readOutcome[0] || null,
      errorMessage: '',
    };
  }
  if (readOutcome?.success === true && Array.isArray(readOutcome.rows)) {
    return {
      succeeded: true,
      row: readOutcome.rows[0] || null,
      errorMessage: '',
    };
  }
  return {
    succeeded: false,
    row: null,
    errorMessage: String(readOutcome?.error || ''),
  };
}

async function fetchAuthoritativeServiceDefinitionOutcome(gateway, entityId) {
  try {
    const readOutcome = await readAuthoritativeControlPlaneRows(
      gateway,
      SYSTEM_TABLE_NAME.SERVICE_DEFINITIONS,
      SELECT_SERVICE_DEFINITION_BY_ID_SQL,
      [entityId],
      {
        readAuthority: AUTHORITATIVE_DEFINITION_READ_AUTHORITY,
        authoritativeReadMode:
          CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
        leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
      },
    );
    return classifyAuthoritativeReadOutcome(readOutcome);
  } catch (error) {
    return {
      succeeded: false,
      row: null,
      errorMessage: String(error?.message || error || ''),
    };
  }
}

function resolveRowDefinitionOutcomeKind(row) {
  if (!row) {
    return SERVICE_DEFINITION_RESOLUTION_OUTCOME.ABSENT;
  }
  return isShipNotStartedServiceDefinition(row) ?
    SERVICE_DEFINITION_RESOLUTION_OUTCOME.INELIGIBLE :
    SERVICE_DEFINITION_RESOLUTION_OUTCOME.ELIGIBLE;
}

function classifyDefinitionRowOutcome(handler, entityId, row) {
  const outcome = resolveRowDefinitionOutcomeKind(row);
  if (outcome !== SERVICE_DEFINITION_RESOLUTION_OUTCOME.ELIGIBLE) {
    handler?.logger?.warn?.(
      RUNTIME_SERVICE_HANDLER_LOG_MSG.DEFINITION_NOT_FOUND,
      {entityId, nodeId: handler?.nodeId},
    );
  }
  return {
    outcome,
    definition: row || null,
  };
}

async function resolveServiceDefinitionOutcomeForCreate(handler, entityId) {
  const gateway = resolveAuthoritativeDefinitionGateway(handler);
  if (!gateway) {
    const cached = readCachedServiceDefinition(handler, entityId);
    return classifyDefinitionRowOutcome(handler, entityId, cached);
  }
  const authoritative = await fetchAuthoritativeServiceDefinitionOutcome(
    gateway,
    entityId,
  );
  if (!authoritative.succeeded) {
    return {
      outcome: SERVICE_DEFINITION_RESOLUTION_OUTCOME.UNAVAILABLE,
      definition: null,
      errorMessage: authoritative.errorMessage,
    };
  }
  if (!authoritative.row) {
    evictStaleCachedServiceDefinition(handler, gateway, entityId);
    return classifyDefinitionRowOutcome(handler, entityId, null);
  }
  const cached = readCachedServiceDefinition(handler, entityId);
  if (
    !cached ||
    !areAuthoritativeSystemTableCacheRowsEqual(
      SYSTEM_TABLE_NAME.SERVICE_DEFINITIONS,
      cached,
      authoritative.row,
    )
  ) {
    applyAuthoritativeSystemTableRowsToCache(
      gateway,
      handler.systemTableCache,
      SYSTEM_TABLE_NAME.SERVICE_DEFINITIONS,
      [authoritative.row],
    );
  }
  return classifyDefinitionRowOutcome(handler, entityId, authoritative.row);
}

async function resolveServiceDefinitionForCreate(handler, entityId) {
  const resolution = await resolveServiceDefinitionOutcomeForCreate(
    handler,
    entityId,
  );
  return resolution.outcome === SERVICE_DEFINITION_RESOLUTION_OUTCOME.ELIGIBLE ?
    resolution.definition :
    null;
}

export {
  AUTHORITATIVE_DEFINITION_READ_AUTHORITY,
  SERVICE_DEFINITION_RESOLUTION_OUTCOME,
  resolveServiceDefinitionForCreate,
  resolveServiceDefinitionOutcomeForCreate,
};
