/**
 * Endpoint sync source query and row normalization.
 *
 * Builds SQL for service_endpoints source reads and normalizes
 * raw rows into a deterministic internal shape.
 *
 * @module runtime/endpoint-sync-source-query
 */

import {
  SQL,
  TABLES,
  TYPEOF,
} from '../constants/index.js';
import {
  EP_COL,
  EP_META,
} from '../wasm-service/service-endpoint-builder.js';
import {
  ENDPOINT_SYNC_DEFAULT,
  ENDPOINT_SYNC_HEALTH,
  ENDPOINT_SYNC_LIST_SEPARATOR,
  ENDPOINT_SYNC_UNHEALTHY_POLICY,
} from './endpoint-sync-constants.js';

const LOCAL_STR_128KJ = ', ';
const LOCAL_NUM_ZERO = 0;
const LOCAL_STR_EMPTY = '';

const ENDPOINT_SOURCE_COLUMN = Object.freeze({
  UPDATED_AT: 'updated_at',
});

const SOURCE_SELECT_COLUMNS = Object.freeze([
  EP_COL.ENDPOINT_ID,
  EP_COL.SERVICE_ID,
  EP_COL.NODE_ID,
  EP_COL.PROTOCOL,
  EP_COL.ADDRESS,
  EP_COL.PORT,
  EP_COL.HEALTH_STATUS,
  EP_COL.METADATA,
  ENDPOINT_SOURCE_COLUMN.UPDATED_AT,
]);

const SOURCE_SELECT_SQL = `${SQL.SELECT} ${SOURCE_SELECT_COLUMNS.join(', ')} ` +
  `FROM ${TABLES.SERVICE_ENDPOINTS}`;

const SOURCE_ORDER_BY_SQL = `${SQL.ORDER_BY} ` +
  `${EP_COL.SERVICE_ID}, ${EP_COL.NODE_ID}, ${EP_COL.ENDPOINT_ID}`;

/**
 * Build SQL "IN" filter clause with positional parameters.
 *
 * @param {string} fieldName - Table column name.
 * @param {Array<string>} values - Filter values.
 * @param {Array<*>} params - Mutable params array.
 * @return {string} SQL clause string.
 */
function buildInFilter(fieldName, values, params) {
  const placeholders = values.map((value) => {
    params.push(value);
    return `?${params.length}`;
  });
  return `${fieldName} ${SQL.IN} (${placeholders.join(LOCAL_STR_128KJ)})`;
}

/**
 * Build endpoint source SQL query and parameter list.
 *
 * @param {Object} [options={}] - Query filter options.
 * @param {Array<string>} [options.protocolAllowlist]
 * @param {Array<string>} [options.serviceIdAllowlist]
 * @param {boolean} [options.healthyOnly]
 * @return {{sql: string, params: Array<*>}}
 */
function buildEndpointSourceQuery(options = {}) {
  const filters = [];
  const params = [];

  const protocolAllowlist = Array.isArray(options.protocolAllowlist) ?
    options.protocolAllowlist.filter((value) =>
      typeof value === TYPEOF.STRING && value.trim().length > 0) :
    [];
  const serviceIdAllowlist = Array.isArray(options.serviceIdAllowlist) ?
    options.serviceIdAllowlist.filter((value) =>
      typeof value === TYPEOF.STRING && value.trim().length > 0) :
    [];

  if (protocolAllowlist.length > LOCAL_NUM_ZERO) {
    filters.push(buildInFilter(EP_COL.PROTOCOL, protocolAllowlist, params));
  }
  if (serviceIdAllowlist.length > LOCAL_NUM_ZERO) {
    filters.push(buildInFilter(EP_COL.SERVICE_ID, serviceIdAllowlist, params));
  }

  const healthyOnly = options.healthyOnly === undefined ?
    ENDPOINT_SYNC_DEFAULT.HEALTHY_ONLY :
    options.healthyOnly === true;
  if (healthyOnly) {
    params.push(ENDPOINT_SYNC_HEALTH.HEALTHY);
    filters.push(`${EP_COL.HEALTH_STATUS} = ?${params.length}`);
  }

  let sql = SOURCE_SELECT_SQL;
  if (filters.length > LOCAL_NUM_ZERO) {
    sql += ` ${SQL.WHERE} ${filters.join(` ${SQL.AND} `)}`;
  }
  sql += ` ${SOURCE_ORDER_BY_SQL}`;

  return {sql, params};
}

/**
 * Parse endpoint metadata value.
 *
 * @param {*} metadataValue - Raw metadata field value.
 * @return {Object} Parsed metadata object.
 */
function parseEndpointMetadata(metadataValue) {
  if (metadataValue && typeof metadataValue === TYPEOF.OBJECT) {
    return metadataValue;
  }
  if (typeof metadataValue !== TYPEOF.STRING || metadataValue.trim() === LOCAL_STR_EMPTY) {
    return {};
  }
  try {
    const parsed = JSON.parse(metadataValue);
    if (parsed && typeof parsed === TYPEOF.OBJECT) {
      return parsed;
    }
    return {};
  } catch (_error) {
    return {};
  }
}

/**
 * Resolve logical service name from endpoint metadata and service_id.
 *
 * @param {string} serviceId - Canonical service id.
 * @param {Object} metadata - Parsed metadata object.
 * @return {string}
 */
function resolveLogicalServiceName(serviceId, metadata) {
  const metaServiceName = metadata[EP_META.SERVICE_NAME];
  if (typeof metaServiceName === TYPEOF.STRING &&
      metaServiceName.trim().length > LOCAL_NUM_ZERO) {
    return metaServiceName.trim();
  }
  return serviceId;
}

/**
 * Normalize one source row into internal endpoint shape.
 *
 * @param {Object} row - Raw source row.
 * @return {Object|null} Normalized row or null when invalid.
 */
function normalizeEndpointRow(row) {
  if (!row || typeof row !== TYPEOF.OBJECT) {
    return null;
  }

  const endpointId = row[EP_COL.ENDPOINT_ID] || row.endpoint_id;
  const serviceId = row[EP_COL.SERVICE_ID] || row.service_id;
  const nodeId = row[EP_COL.NODE_ID] || row.node_id;
  const protocolRaw = row[EP_COL.PROTOCOL] || row.protocol;
  const address = row[EP_COL.ADDRESS] || row.address;
  const portRaw = row[EP_COL.PORT] ?? row.port;
  const healthStatusRaw = row[EP_COL.HEALTH_STATUS] || row.health_status;
  const metadata = parseEndpointMetadata(
    row[EP_COL.METADATA] ?? row.metadata,
  );

  const protocol = typeof protocolRaw === TYPEOF.STRING ?
    protocolRaw.toLowerCase().trim() :
    '';
  const healthStatus = typeof healthStatusRaw === TYPEOF.STRING ?
    healthStatusRaw.toLowerCase().trim() :
    '';
  const port = Number(portRaw);

  if (typeof endpointId !== TYPEOF.STRING || endpointId.trim().length === LOCAL_NUM_ZERO) {
    return null;
  }
  if (typeof serviceId !== TYPEOF.STRING || serviceId.trim().length === LOCAL_NUM_ZERO) {
    return null;
  }
  if (typeof nodeId !== TYPEOF.STRING || nodeId.trim().length === LOCAL_NUM_ZERO) {
    return null;
  }
  if (typeof address !== TYPEOF.STRING || address.trim().length === LOCAL_NUM_ZERO) {
    return null;
  }
  if (protocol.length === LOCAL_NUM_ZERO || !Number.isInteger(port) || port <= LOCAL_NUM_ZERO) {
    return null;
  }

  return {
    endpointId: endpointId.trim(),
    serviceId: serviceId.trim(),
    logicalServiceName: resolveLogicalServiceName(serviceId.trim(), metadata),
    nodeId: nodeId.trim(),
    protocol,
    address: address.trim(),
    port,
    healthStatus,
    metadata,
    updatedAt: Number(
      row[ENDPOINT_SOURCE_COLUMN.UPDATED_AT] || row.updated_at || LOCAL_NUM_ZERO,
    ),
    serviceKey: serviceId.trim() +
      ENDPOINT_SYNC_LIST_SEPARATOR.SERVICE_KEY +
      protocol,
  };
}

/**
 * Normalize source rows and drop invalid rows.
 *
 * @param {Array<Object>} rows - Raw source rows.
 * @return {Array<Object>} Normalized rows.
 */
function normalizeEndpointRows(rows) {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows
    .map((row) => normalizeEndpointRow(row))
    .filter((row) => row !== null);
}

/**
 * Filter normalized rows by allowlists and health policy.
 *
 * @param {Array<Object>} rows - Normalized rows.
 * @param {Object} [options={}] - Filter options.
 * @param {Array<string>} [options.protocolAllowlist]
 * @param {Array<string>} [options.serviceIdAllowlist]
 * @param {boolean} [options.healthyOnly]
 * @param {string} [options.unhealthyPolicy]
 * @return {Array<Object>} Filtered rows sorted deterministically.
 */
function filterNormalizedEndpointRows(rows, options = {}) {
  const protocolAllowlist = new Set(
    Array.isArray(options.protocolAllowlist) ?
      options.protocolAllowlist.map((value) => value.toLowerCase()) :
      ENDPOINT_SYNC_DEFAULT.PROTOCOL_ALLOWLIST,
  );
  const serviceIdAllowlist = new Set(
    Array.isArray(options.serviceIdAllowlist) ?
      options.serviceIdAllowlist :
      ENDPOINT_SYNC_DEFAULT.SERVICE_ID_ALLOWLIST,
  );
  const healthyOnly = options.healthyOnly === undefined ?
    ENDPOINT_SYNC_DEFAULT.HEALTHY_ONLY :
    options.healthyOnly === true;
  const unhealthyPolicy = options.unhealthyPolicy ||
    ENDPOINT_SYNC_DEFAULT.UNHEALTHY_POLICY;

  return rows
    .filter((row) => {
      if (protocolAllowlist.size > LOCAL_NUM_ZERO && !protocolAllowlist.has(row.protocol)) {
        return false;
      }
      if (serviceIdAllowlist.size > LOCAL_NUM_ZERO && !serviceIdAllowlist.has(row.serviceId)) {
        return false;
      }

      if (healthyOnly) {
        return row.healthStatus === ENDPOINT_SYNC_HEALTH.HEALTHY;
      }
      if (unhealthyPolicy === ENDPOINT_SYNC_UNHEALTHY_POLICY.EXCLUDE) {
        return row.healthStatus === ENDPOINT_SYNC_HEALTH.HEALTHY;
      }
      return true;
    })
    .sort((left, right) => {
      if (left.serviceId !== right.serviceId) {
        return left.serviceId.localeCompare(right.serviceId);
      }
      if (left.protocol !== right.protocol) {
        return left.protocol.localeCompare(right.protocol);
      }
      if (left.nodeId !== right.nodeId) {
        return left.nodeId.localeCompare(right.nodeId);
      }
      return left.endpointId.localeCompare(right.endpointId);
    });
}

export {
  ENDPOINT_SOURCE_COLUMN,
  SOURCE_SELECT_COLUMNS,
  buildInFilter,
  buildEndpointSourceQuery,
  parseEndpointMetadata,
  resolveLogicalServiceName,
  normalizeEndpointRow,
  normalizeEndpointRows,
  filterNormalizedEndpointRows,
};
