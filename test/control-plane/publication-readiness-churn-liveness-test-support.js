/**
 * Production-shaped cache fixture for the publication-readiness churn
 * liveness suite: a versioned system-table cache seeded with NODE_COUNT
 * nodes, services, and one partition, plus the churn row builder.
 */

import {
  COLUMN,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';

const CACHE_KEY_FIELDS = Object.freeze([
  COLUMN.NODE_ID,
  COLUMN.SERVICE_ID,
  'partition_id',
  'operation_id',
  'publication_id',
  'endpoint_id',
  'reservation_id',
]);
const NOW_MS = 1_780_000_000_000;
const NODE_COUNT = 5;
const PARTITION_ID = 'priority-partition';

function createProductionShapedCache() {
  const rowsByTable = new Map(Object.values(TABLES).map((table) => [
    table,
    new Map(),
  ]));
  const listeners = new Set();
  const keyFor = (table, row) => {
    const field = CACHE_KEY_FIELDS.find((candidate) => row?.[candidate]);
    return String(field ? row[field] :
      `${table}:${rowsByTable.get(table)?.size || 0}`);
  };
  const cache = {
    get: (table, key) => rowsByTable.get(table)?.get(String(key)) || null,
    getAll: (table) => [...(rowsByTable.get(table)?.values() || [])],
    filter(table, predicate) {
      return cache.getAll(table).filter(predicate);
    },
    applySystemTableChange(table, operation, row) {
      const rows = rowsByTable.get(table);
      const key = keyFor(table, row);
      if (String(operation).toUpperCase() === 'DELETE') rows?.delete(key);
      else rows?.set(key, Object.freeze({...rows?.get(key), ...row}));
      for (const listener of listeners) listener(table, operation, row, null);
    },
    onCacheChange: (listener) => listeners.add(listener),
    offCacheChange: (listener) => listeners.delete(listener),
  };
  for (let index = 0; index < NODE_COUNT; index++) {
    const nodeId = `node-${index}`;
    cache.applySystemTableChange(TABLES.NODES, 'INSERT', {
      [COLUMN.NODE_ID]: nodeId,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.LAST_HEARTBEAT]: NOW_MS,
      [COLUMN.READY_LEASE_EXPIRES_AT]: NOW_MS + 60_000,
      connection_state: 'ready',
    });
    cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
      [COLUMN.SERVICE_ID]: `service-${index}`,
      [COLUMN.NODE_ID]: nodeId,
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.ADDRESS]: `${nodeId}/partition/${PARTITION_ID}`,
      partition_id: PARTITION_ID,
      raft_role: index === 0 ? 'leader' : 'follower',
    });
  }
  cache.applySystemTableChange(TABLES.PARTITIONS, 'INSERT', {
    partition_id: PARTITION_ID,
    table_name: TABLES.NODES,
    leader_node_id: 'node-0',
  });
  return cache;
}

function churnRow(table, revision) {
  const common = {revision, updated_at: NOW_MS + revision};
  if (table === TABLES.NODES) {
    return {...common, node_id: `node-${revision % NODE_COUNT}`};
  }
  if (table === TABLES.NODE_ENDPOINTS) {
    return {...common, endpoint_id: 'endpoint-0', node_id: 'node-0'};
  }
  if (table === TABLES.SERVICES) {
    return {...common, service_id: 'service-0', node_id: 'node-0'};
  }
  if (table === TABLES.PARTITIONS) {
    return {...common, partition_id: PARTITION_ID};
  }
  if (table === TABLES.REPLICA_OPERATIONS) {
    return {...common, operation_id: 'operation-0'};
  }
  if (table === TABLES.STORAGE_RESERVATIONS) {
    return {...common, reservation_id: 'reservation-0'};
  }
  return {...common, publication_id: 'publication-0'};
}

export {
  NODE_COUNT,
  NOW_MS,
  PARTITION_ID,
  churnRow,
  createProductionShapedCache,
};
