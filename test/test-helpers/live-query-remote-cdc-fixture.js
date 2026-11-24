/**
 * Shared test fixture helpers for live-query remote CDC lifecycle witnesses.
 */

import {TABLES} from '../../src/constants/index.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {TEST_BOOT_INCARNATION} from './boot-incarnation-fixture.js';

const TABLE_SCHEMA = {
  columns: [
    {name: 'id', type: 'INTEGER', primaryKey: true},
    {name: 'customer', type: 'TEXT'},
    {name: 'status', type: 'TEXT'},
    {name: 'total', type: 'INTEGER'},
    {name: 'secret_note', type: 'TEXT'},
  ],
};

const TABLES_METADATA = [
  {
    table_name: 'live_orders',
    primary_key: 'id',
    partition_key_type: 'INTEGER',
    active_partition_version: 1,
  },
];

const SELECT_OPEN_SQL = 'SELECT id, customer, total FROM live_orders WHERE status = \'OPEN\'';
const INSERT_ORDER_SQL =
  'INSERT INTO live_orders (id, customer, status, total, secret_note) VALUES (?, ?, ?, ?, ?)';

function createMockClient(id) {
  const messages = [];
  const observedRows = new Map();
  return {
    id,
    messages,
    observedRows,
    send: (raw) => {
      const msg = typeof raw === 'string' ? JSON.parse(raw) : raw;
      messages.push(msg);
      if (msg.type === 'snapshot' || msg.type === 'reset') {
        observedRows.clear();
        for (const row of msg.rows || []) observedRows.set(row.id, row);
      } else if (msg.type === 'insert') {
        observedRows.set(msg.row.id, msg.row);
      } else if (msg.type === 'update') {
        observedRows.set(msg.new.id, msg.new);
      } else if (msg.type === 'delete') {
        observedRows.delete(msg.row.id);
      }
    },
  };
}

function createTopologyCache(getPartitions, getReplicas) {
  const listeners = new Set();
  const tableMap = new Map(TABLES_METADATA.map((t) => [t.table_name, t]));
  return {
    onCacheChange: (listener) => listeners.add(listener),
    offCacheChange: (listener) => listeners.delete(listener),
    emitCacheChange: (tableName, operation, record) => {
      for (const listener of listeners) listener(tableName, operation, record);
    },
    get: (table, key) => {
      if (table === TABLES.TABLES) return tableMap.get(key) || null;
      if (table === TABLES.PARTITIONS) {
        return getPartitions().find((p) => p.partition_id === key) || null;
      }
      return null;
    },
    find: (table, pred) => {
      if (table === TABLES.TABLES) return TABLES_METADATA.find(pred) || null;
      if (table === TABLES.PARTITIONS) return getPartitions().find(pred) || null;
      return null;
    },
    filter: (table, pred) => {
      if (table === TABLES.PARTITIONS) return getPartitions().filter(pred || (() => true));
      if (table === TABLES.PARTITION_REPLICAS) return getReplicas().filter(pred || (() => true));
      return [];
    },
  };
}

async function createBridgedRouters(nodeIds) {
  const routers = new Map();
  for (const nodeId of nodeIds) {
    const router = new MessageRouter({
      bootIncarnation: TEST_BOOT_INCARNATION,
      nodeId,
      inProcess: true,
    });
    await router.initialize({startServer: false});
    routers.set(nodeId, router);
  }
  for (const router of routers.values()) {
    router.deliverRemote = async (
      targetAddress, messageId, payload, targetNodeId, correlationId, opts,
    ) => {
      const peer = routers.get(targetNodeId);
      if (!peer || !peer.initialized) {
        return {
          result: {messageId, correlationId, acknowledged: false, error: 'offline'},
          queueWaitMs: 0,
        };
      }
      if (!peer.handlers.get(targetAddress)) {
        return {
          result: {
            messageId,
            correlationId,
            acknowledged: false,
            noHandler: true,
            error: 'noHandler',
          },
          queueWaitMs: 0,
        };
      }
      return peer.deliverLocal(
        targetAddress, messageId, payload, correlationId, {timeoutMs: opts?.timeoutMs},
      );
    };
  }
  return routers;
}

function createGate() {
  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return {promise, release};
}

function deferredEnvelope(retryAfterMs, error) {
  return buildDeliveryEnvelope({
    acknowledged: false, deferRetry: true, noHandler: false, retryAfterMs, error,
  });
}

async function waitForMatch(predicate, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  return predicate();
}

export {
  INSERT_ORDER_SQL,
  SELECT_OPEN_SQL,
  TABLE_SCHEMA,
  createBridgedRouters,
  createGate,
  createMockClient,
  createTopologyCache,
  deferredEnvelope,
  waitForMatch,
};
