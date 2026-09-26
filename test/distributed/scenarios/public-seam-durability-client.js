/**
 * Public-client seam of the public-seam durability scenario: the
 * PostgreSQL-wire client per node, what it observed, how a failed outcome
 * is classified for retry, the topology leak check, and the certification
 * status derivation.
 *
 * Nothing here reads consensus state. Endpoint discovery reads the
 * `service_endpoints` rows a public client would read, and listener
 * provisioning is the documented operator scale path of sys-postgres-wire.
 */

import {Client} from 'pg';
import {COLUMN} from '../../../src/constants/columns.js';
import {META_SERVICE_ID} from '../../../src/constants/wasm-meta.js';
import {TABLES} from '../../../src/constants/tables.js';
import {
  RAFT_PROVIDER_CONTROL,
} from '../../../src/raft/raft-provider-control-constants.js';
import {resolveRaftProvider} from '../../../src/raft/raft-provider-control.js';
import {
  PGWIRE_AUTH_MODE,
  PGWIRE_CONFIG_FIELD,
  PGWIRE_TLS_MODE,
} from '../../../src/runtime/pgwire-descriptor.js';
import {EP_COL} from '../../../src/wasm-service/service-endpoint-builder.js';
import {
  WASM_SERVICE_HEALTH_STATUS,
  WASM_SERVICE_PROTOCOL,
} from '../../../src/wasm-service/wasm-service-constants.js';
import {SD_COL} from '../../../src/wasm-service/wasm-service-models.js';
import {REQUEST_CELL_AUTH} from '../harness/constants.js';
import {
  PUBLIC_SEAM_CERTIFICATION,
  PUBLIC_SEAM_CERTIFICATION_LINE_PREFIX,
  PUBLIC_SEAM_CERTIFICATION_SOURCE,
  PUBLIC_SEAM_IDENTIFIER_SOURCE,
  PUBLIC_SEAM_LISTENER,
  PUBLIC_SEAM_OUTCOME_CLASS,
  PUBLIC_SEAM_TOPOLOGY_KEY_FRAGMENTS,
} from './public-seam-durability-constants.js';

const OBJECT_TYPE = 'object';
const STRING_TYPE = 'string';
const KEY_PATH_SEPARATOR = '.';
const ROOT_KEY_PATH = '$';
const ERROR_FIELD = Object.freeze({
  CODE: 'code',
  DETAIL: 'detail',
  SEVERITY: 'severity',
});
const ZERO = 0;
const CAMEL_CASE_BOUNDARY = /([a-z0-9])([A-Z])/gu;
const CAMEL_CASE_REPLACEMENT = '$1 $2';
const KEY_WORD_SEPARATOR = /[^a-z0-9]+/u;

const SELECT_PUBLIC_ENDPOINTS_SQL =
  `SELECT ${EP_COL.NODE_ID}, ${EP_COL.PORT}, ${EP_COL.HEALTH_STATUS} ` +
  `FROM ${TABLES.SERVICE_ENDPOINTS} WHERE ${EP_COL.PROTOCOL} = ? ` +
  `AND ${EP_COL.SERVICE_ID} = ?`;
const SELECT_PARTITION_IDS_SQL =
  `SELECT ${COLUMN.PARTITION_ID} FROM ${TABLES.PARTITIONS}`;
const PROVISION_LISTENER_SQL =
  `UPDATE ${TABLES.SERVICE_DEFINITIONS} SET ${SD_COL.REPLICA_COUNT} = ?, ` +
  `${SD_COL.RUNTIME_CONFIG} = ? WHERE ${SD_COL.SERVICE_ID} = ?`;

function rowsOf(result) {
  if (Array.isArray(result)) {
    return result;
  }
  return Array.isArray(result?.rows) ? result.rows : [];
}

function parseJsonObject(text) {
  if (typeof text !== 'string') {
    return null;
  }
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === OBJECT_TYPE ? parsed : null;
  } catch (_error) {
    // Free-text detail is a legitimate PostgreSQL shape, not a JSON object.
    return null;
  }
}

/**
 * The client-visible fields of a failed public outcome. Only what crossed
 * the wire (or the client's own connect error) is kept.
 * @param {*} error
 * @param {Object} policy - The retry policy (names the detail hint field).
 * @return {Object}
 */
function describePublicError(error, policy) {
  const detailObject = parseJsonObject(error?.detail);
  return {
    code: stringFieldOf(error, ERROR_FIELD.CODE),
    deferred: error?.deferred === true,
    detail: detailObject || stringFieldOf(error, ERROR_FIELD.DETAIL),
    message: String(error?.message || error),
    retryAfterMs: retryAfterOf(error, detailObject, policy),
    severity: stringFieldOf(error, ERROR_FIELD.SEVERITY),
  };
}

function stringFieldOf(error, field) {
  return typeof error?.[field] === 'string' ? error[field] : null;
}

// A retry-after hint from the engine result itself, or from the JSON
// detail the PostgreSQL-wire ErrorResponse carries.
function retryAfterOf(error, detailObject, policy) {
  if (Number.isFinite(error?.retryAfterMs)) {
    return error.retryAfterMs;
  }
  const hinted = detailObject?.[policy.retryAfterDetailField];
  return Number.isFinite(hinted) ? hinted : null;
}

/**
 * Classify a described public error against the retry policy.
 * @param {Object} described - From describePublicError.
 * @param {Object} policy
 * @return {string} A PUBLIC_SEAM_OUTCOME_CLASS value.
 */
function classifyPublicOutcome(described, policy) {
  if (policy.retryOnDeferred && described.deferred) {
    return PUBLIC_SEAM_OUTCOME_CLASS.RETRYABLE;
  }
  if (policy.retryOnRetryAfterMs && described.retryAfterMs !== null) {
    return PUBLIC_SEAM_OUTCOME_CLASS.RETRYABLE;
  }
  if (policy.connectionRefusedCodes.includes(described.code)) {
    return PUBLIC_SEAM_OUTCOME_CLASS.RETRYABLE;
  }
  return PUBLIC_SEAM_OUTCOME_CLASS.TERMINAL;
}

// A key is split into words (camelCase, snake_case, kebab-case) and leaks
// when a word starts with a topology fragment: `servingNodeId`,
// `leader_node_id` and `readAuthorityWitnesses` leak; `retryAfterMs` does
// not (a raw substring test would match its "afTERMs").
function keyWords(key) {
  return String(key)
    .replace(CAMEL_CASE_BOUNDARY, CAMEL_CASE_REPLACEMENT)
    .toLowerCase()
    .split(KEY_WORD_SEPARATOR)
    .filter((word) => word.length > ZERO);
}

function keyLeaks(key) {
  return keyWords(key).some((word) =>
    PUBLIC_SEAM_TOPOLOGY_KEY_FRAGMENTS.some((fragment) =>
      word.startsWith(fragment)));
}

/**
 * Every key path in `value` whose key names topology. Buffers and other
 * byte views are values, not structures, and are not descended into.
 * @param {*} value
 * @param {string} [path]
 * @return {Array<string>}
 */
function findTopologyLeakKeys(value, path = ROOT_KEY_PATH) {
  if (!value || typeof value !== OBJECT_TYPE || ArrayBuffer.isView(value)) {
    return [];
  }
  const leaks = [];
  for (const [key, child] of Object.entries(value)) {
    const childPath = Array.isArray(value) ?
      `${path}[${key}]` :
      `${path}${KEY_PATH_SEPARATOR}${key}`;
    if (!Array.isArray(value) && keyLeaks(key)) {
      leaks.push(childPath);
    }
    leaks.push(...findTopologyLeakKeys(child, childPath));
  }
  return leaks;
}

/**
 * Every string value in `value` that names a topology identifier the
 * harness knows (node ids, node addresses, partition ids), e.g. an error
 * message or detail that says which node or partition served it.
 * @param {*} value
 * @param {Array<string>} identifiers
 * @param {string} [path]
 * @return {Array<string>} `<path>=<identifier>` entries.
 */
function findTopologyLeakValues(value, identifiers, path = ROOT_KEY_PATH) {
  if (typeof value === STRING_TYPE) {
    return identifiers.filter((identifier) => value.includes(identifier))
      .map((identifier) => `${path}=${identifier}`);
  }
  if (!value || typeof value !== OBJECT_TYPE || ArrayBuffer.isView(value)) {
    return [];
  }
  const leaks = [];
  for (const [key, child] of Object.entries(value)) {
    const childPath = Array.isArray(value) ?
      `${path}[${key}]` :
      `${path}${KEY_PATH_SEPARATOR}${key}`;
    leaks.push(...findTopologyLeakValues(child, identifiers, childPath));
  }
  return leaks;
}

/**
 * Wrap a raw public client so every row set and every error it hands back
 * is recorded for the leak check.
 * @param {Object} rawClient - {query(sql, params), close()}
 * @param {string} nodeId
 * @param {Array<Object>} observations
 * @param {Object} policy
 * @return {Object}
 */
function createObservedClient(rawClient, nodeId, observations, policy) {
  return {
    nodeId,
    async query(sql, params = []) {
      try {
        const result = await rawClient.query(sql, params);
        const rows = rowsOf(result);
        observations.push({nodeId, rows});
        return rows;
      } catch (error) {
        const described = describePublicError(error, policy);
        observations.push({error: described, nodeId});
        const observed = new Error(described.message);
        observed.publicOutcome = described;
        throw observed;
      }
    },
    close: () => rawClient.close(),
  };
}

/**
 * Discover the candidate public PostgreSQL-wire ports per node from the
 * sys-postgres-wire `service_endpoints` rows (protocol = postgresql).
 * Only rows the endpoint owner marks healthy are candidates, and every
 * healthy port is kept: no row wins by order, the caller's connect decides
 * which one is live (a stale row of a previous incarnation fails to
 * connect and is "not yet").
 * @param {Object} adminNode - Harness node handle used as a reader.
 * @return {Promise<Map<string, Array<number>>>}
 */
async function discoverPublicEndpoints(adminNode) {
  const rows = rowsOf(await adminNode.query(SELECT_PUBLIC_ENDPOINTS_SQL,
    [WASM_SERVICE_PROTOCOL.POSTGRESQL, META_SERVICE_ID.POSTGRES_WIRE]));
  const ports = new Map();
  for (const row of rows) {
    const port = Number(row?.[EP_COL.PORT]);
    const nodeId = row?.[EP_COL.NODE_ID];
    if (typeof nodeId !== 'string' || !Number.isInteger(port) ||
        row?.[EP_COL.HEALTH_STATUS] !== WASM_SERVICE_HEALTH_STATUS.HEALTHY) {
      continue;
    }
    ports.set(nodeId, [...(ports.get(nodeId) || []), port]);
  }
  return ports;
}

/**
 * The topology identifiers the harness knows, for the value leak scan:
 * node ids and node addresses from the harness node handles, and partition
 * ids read through the harness admin lane (the scenario itself never
 * decides on them). An unreadable partition list is a named source state,
 * not an empty list.
 * @param {Object} ctx - Scenario context ({nodes, writer}).
 * @return {Promise<{values: Array<string>, sources: Object}>}
 */
async function listHarnessTopologyIdentifiers(ctx) {
  const nodeValues = [];
  for (const node of ctx.nodes) {
    nodeValues.push(node.id);
    if (typeof node.ip === STRING_TYPE && node.ip.length > ZERO) {
      nodeValues.push(node.ip);
    }
  }
  let partitionIds = [];
  let partitionSource = PUBLIC_SEAM_IDENTIFIER_SOURCE.READ;
  let partitionError = null;
  try {
    partitionIds = rowsOf(await ctx.writer.query(SELECT_PARTITION_IDS_SQL))
      .map((row) => row?.[COLUMN.PARTITION_ID])
      .filter((id) => typeof id === STRING_TYPE && id.length > ZERO);
  } catch (error) {
    partitionSource = PUBLIC_SEAM_IDENTIFIER_SOURCE.UNAVAILABLE;
    partitionError = error.message;
  }
  return {
    sources: {
      nodeValueCount: nodeValues.length,
      partitionIdCount: partitionIds.length,
      partitionIdError: partitionError,
      partitionIds: partitionSource,
    },
    values: [...new Set([...nodeValues, ...partitionIds])],
  };
}

/**
 * Scale sys-postgres-wire to one externally bound, password-authenticated
 * replica per node (the documented operator scale path).
 * @param {Object} adminNode
 * @param {number} replicaCount
 * @return {Promise<void>}
 */
async function provisionPublicListener(adminNode, replicaCount) {
  const runtimeConfig = JSON.stringify({
    [PGWIRE_CONFIG_FIELD.HOST]: PUBLIC_SEAM_LISTENER.BIND_ALL_HOST,
    [PGWIRE_CONFIG_FIELD.AUTH_MODE]: PGWIRE_AUTH_MODE.PASSWORD,
    [PGWIRE_CONFIG_FIELD.TLS_MODE]: PGWIRE_TLS_MODE.DISABLE,
  });
  await adminNode.query(PROVISION_LISTENER_SQL, [
    replicaCount, runtimeConfig, META_SERVICE_ID.POSTGRES_WIRE,
  ]);
}

/**
 * Open a `pg` client against a node's public endpoint with the harness
 * credentials the node was started with.
 * @param {Object} node - Harness node handle ({ip}).
 * @param {number} port
 * @return {Promise<Object>} {query, close}
 */
async function openPgPublicClient(node, port) {
  const client = new Client({
    connectionTimeoutMillis: PUBLIC_SEAM_LISTENER.CONNECT_TIMEOUT_MS,
    database: REQUEST_CELL_AUTH.DATABASE,
    host: node.ip,
    password: REQUEST_CELL_AUTH.PASSWORD,
    port,
    user: REQUEST_CELL_AUTH.USER,
  });
  await client.connect();
  return {
    query: (sql, params) => client.query(sql, params),
    close: () => client.end(),
  };
}

/**
 * Certification status from the runtime's own provider-control owner: while
 * the runtime's default consensus provider is the legacy one, a PASS is a
 * prepared harness, not an rs-raft certification.
 * @param {Function} [resolveProvider] - Defaults to the owner's resolver
 *   with no provider selected (the runtime default).
 * @return {{status: string, line: string, runtimeDefaultProvider: string,
 *   legacyProvider: string, source: string}}
 */
function deriveCertificationStatus(
  resolveProvider = () => resolveRaftProvider({}),
) {
  const runtimeDefaultProvider = resolveProvider();
  const status = runtimeDefaultProvider === RAFT_PROVIDER_CONTROL.LIFERAFT ?
    PUBLIC_SEAM_CERTIFICATION.PREPARED_BLOCKED :
    PUBLIC_SEAM_CERTIFICATION.CANDIDATE;
  return {
    legacyProvider: RAFT_PROVIDER_CONTROL.LIFERAFT,
    line: `${PUBLIC_SEAM_CERTIFICATION_LINE_PREFIX}${status}`,
    runtimeDefaultProvider,
    source: PUBLIC_SEAM_CERTIFICATION_SOURCE,
    status,
  };
}

export {
  classifyPublicOutcome,
  createObservedClient,
  deriveCertificationStatus,
  describePublicError,
  discoverPublicEndpoints,
  findTopologyLeakKeys,
  findTopologyLeakValues,
  listHarnessTopologyIdentifiers,
  openPgPublicClient,
  provisionPublicListener,
};
