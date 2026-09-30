/**
 * Endpoint rows as production creates them: a node registers its NODES row
 * at its boot incarnation, and every endpoint it publishes carries that exact
 * incarnation (the endpoint incarnation authority). Routing and discovery
 * treat only an endpoint whose incarnation equals the node's current NODES
 * incarnation as current, so a fixture that publishes an endpoint must also
 * hold its node's registration at the same incarnation.
 */
import {CDC_OPERATION} from '../../src/constants/cdc.js';
import {COLUMN, TABLES} from '../../src/constants/index.js';

const FIXTURE_ENDPOINT_INCARNATION = 1;

/**
 * @param {Object} endpoint - node_endpoints / service_endpoints row.
 * @param {number} [bootIncarnation]
 * @return {Object} The row stamped with its owning incarnation.
 */
function withEndpointIncarnation(endpoint,
  bootIncarnation = FIXTURE_ENDPOINT_INCARNATION) {
  return {...endpoint, [COLUMN.BOOT_INCARNATION]: bootIncarnation};
}

/**
 * @param {string} nodeId
 * @param {number} [bootIncarnation]
 * @param {Object} [overrides]
 * @return {Object} A registered NODES row at that incarnation.
 */
function registeredNodeRow(nodeId, bootIncarnation =
FIXTURE_ENDPOINT_INCARNATION, overrides = {}) {
  return {
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.BOOT_INCARNATION]: bootIncarnation,
    status: 'active',
    connection_state: 'connected',
    last_heartbeat: 1,
    created_at: 1,
    updated_at: 1,
    ...overrides,
  };
}

/**
 * Register the endpoint's node (when absent) and publish the endpoint at its
 * incarnation into a SystemTableCache.
 * @param {Object} cache - SystemTableCache.
 * @param {Object} endpoint - node_endpoints row.
 * @param {string} [tableName]
 * @return {Object} The stamped endpoint row.
 */
function publishRegisteredEndpoint(cache, endpoint,
  tableName = TABLES.NODE_ENDPOINTS) {
  const nodeId = endpoint[COLUMN.NODE_ID];
  const incarnation = endpoint[COLUMN.BOOT_INCARNATION] ??
    FIXTURE_ENDPOINT_INCARNATION;
  if (!cache.get(TABLES.NODES, nodeId)) {
    cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.INSERT,
      registeredNodeRow(nodeId, incarnation));
  }
  const stamped = withEndpointIncarnation(endpoint, incarnation);
  cache.applySystemTableChange(tableName, CDC_OPERATION.INSERT, stamped);
  return stamped;
}

/**
 * A mock whose only write recorder is its upsert records an endpoint's INSERT
 * birth through that same recorder. The applied row count is 1 unless the
 * recorder reports an explicit outcome.
 * @param {Object} mock - The mock owning upsertSystemTableRow.
 * @param {Array} args - The insert arguments.
 * @return {Promise<Object>}
 */
async function insertViaUpsert(mock, args) {
  const result = await mock.upsertSystemTableRow(...args);
  return result?.success === false || result?.partitionResult ?
    result :
    {...result, partitionResult: {affectedRows: 1}};
}

// Durable rows per table behind a gateway with exact-predicate semantics
// (null predicate values are IS NULL), one-shot acknowledgement faults, and
// an authoritative readback.
/**
 * @param {Object} [initial] - {tableName: rows}.
 * @return {Object} The durable gateway fake.
 */
// The primary key of a row in any table the fake holds.
function durableRowKey(row) {
  return row.endpoint_id ?? row.service_id ?? row.partition_id ?? row.node_id;
}

function createDurableTables(initial = {}) {
  const tables = new Map(Object.entries(initial).map(([name, rows]) =>
    [name, new Map(rows.map((row) => [durableRowKey(row), {...row}]))]));
  const rowsOf = (tableName) => {
    if (!tables.has(tableName)) tables.set(tableName, new Map());
    return tables.get(tableName);
  };
  const matches = (row, whereClause) => Object.entries(whereClause)
    .every(([column, value]) => (row[column] ?? null) === value);
  let fault = null;
  const writes = [];
  const settle = (applied) => {
    const kind = fault;
    fault = null;
    if (kind === 'lost') throw new Error('acknowledgement lost after apply');
    return {success: true, partitionResult: {affectedRows: applied}};
  };
  const gateway = {
    rowsOf,
    writes,
    loseNextAcknowledgement(kind) {
      fault = kind;
    },
    async readAuthoritativeRows(tableName, _sql, params = []) {
      const rows = [...rowsOf(tableName).values()].filter((row) =>
        params.length === 0 || durableRowKey(row) === params[0] ||
          row.node_id === params[0]);
      return {success: true, rows: rows.map((row) => ({...row}))};
    },
    async insertSystemTableRow(tableName, row) {
      writes.push({op: 'insert', tableName, row});
      if (fault === 'unapplied') {
        fault = null;
        throw new Error('outcome unknown before apply');
      }
      const key = durableRowKey(row);
      if (rowsOf(tableName).has(key)) return settle(0);
      rowsOf(tableName).set(key, {...row});
      return settle(1);
    },
    async updateSystemTableRow(tableName, whereClause, data) {
      writes.push({op: 'update', tableName, whereClause});
      if (fault === 'unapplied') {
        fault = null;
        throw new Error('outcome unknown before apply');
      }
      let applied = 0;
      for (const [key, row] of rowsOf(tableName)) {
        if (matches(row, whereClause)) {
          rowsOf(tableName).set(key, {...row, ...data});
          applied += 1;
        }
      }
      return settle(applied);
    },
    // The generic mutation entry (the replica lifecycle owner's CAS).
    async submitMutation(mutation) {
      if (mutation.operation === 'update') {
        return gateway.updateSystemTableRow(mutation.tableName,
          mutation.whereClause, mutation.data);
      }
      if (mutation.operation === 'delete') {
        return gateway.deleteSystemTableRow(mutation.tableName,
          mutation.whereClause);
      }
      return gateway.insertSystemTableRow(mutation.tableName, mutation.row);
    },
    async deleteSystemTableRow(tableName, whereClause) {
      writes.push({op: 'delete', tableName, whereClause});
      if (fault === 'unapplied') {
        fault = null;
        throw new Error('outcome unknown before apply');
      }
      let applied = 0;
      for (const [key, row] of rowsOf(tableName)) {
        if (matches(row, whereClause)) {
          rowsOf(tableName).delete(key);
          applied += 1;
        }
      }
      return settle(applied);
    },
  };
  return gateway;
}

const INCARNATION_TABLES = Object.freeze([
  TABLES.NODES, TABLES.NODE_ENDPOINTS, TABLES.SERVICE_ENDPOINTS,
]);

/**
 * Rows by table as a registered cluster holds them: every NODES row and every
 * endpoint row carries the fixture boot incarnation unless the test set one.
 * @param {Object} rowsByTable - {tableName: rows}.
 * @return {Object} The same object with incarnations stamped.
 */
function withRegisteredIncarnations(rowsByTable) {
  for (const tableName of INCARNATION_TABLES) {
    if (Array.isArray(rowsByTable[tableName])) {
      rowsByTable[tableName] = rowsByTable[tableName].map((row) =>
        ({[COLUMN.BOOT_INCARNATION]: FIXTURE_ENDPOINT_INCARNATION, ...row}));
    }
  }
  return rowsByTable;
}

export {
  FIXTURE_ENDPOINT_INCARNATION,
  withRegisteredIncarnations,
  createDurableTables,
  insertViaUpsert,
  publishRegisteredEndpoint,
  registeredNodeRow,
  withEndpointIncarnation,
};
