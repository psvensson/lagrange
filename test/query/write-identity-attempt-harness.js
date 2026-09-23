// The harness of the write-identity attempt witnesses (quest
// reroute-carries-the-entry-id, attempt A2): one partition replica of a
// system table on a file database, and the production client path in front
// of it - SQLQueryEngine -> the distributed write coordinator -> QueryExecutor
// -> a router that delivers to the replica's own transport handler
// (handleRemoteQuery) and logs every statement it carried.
//
// Two kinds of replica. A consensus replica runs the production rs-raft port
// (a lone leader). A releasable replica runs the controllable consensus port
// with its own clock virtual: its proposals commit at once, except one the
// scenario arms - that proposal is held, the replica's clock is moved past
// its commit deadline (the replica releases the write with its typed
// answer: its outcome is not known here), and then the held proposal
// commits. That is the honest outcome_unknown of a write that did commit.
//
// What a replica applied is read from production: the committed commands (the
// rs-raft durable log through the store owner's statement and the proposal
// codec, or the commands the controllable port committed, at their index) and
// the committed-statement outcome rows on an independent connection. An
// application of a statement is a committed command carrying it whose index
// holds an outcome row; a same-entryId re-proposal is answered from the first
// entry's row and holds none.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';

import {
  ControllablePartitionRaftProvider,
  createControllablePartitionService,
  createLoopbackTransport,
} from '../partition/partition-service-test-support.js';
import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  CDCOperation,
  PartitionService,
} from '../../src/partition/partition-service.js';
import {PARTITION_SERVICE_DEFAULT} from
  '../../src/partition/partition-service-constants.js';
import {PROPOSAL_QUEUE_PROPOSAL_STATE} from
  '../../src/partition/proposal-queue-constants.js';
import {QUERY_EXECUTOR_SHARED} from '../../src/query/query-executor-shared.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {RAFT_RS_SQL} from '../../src/raft/raft-rs-durable-store-constants.js';
import {decodeCommittedProposal} from
  '../../src/raft/raft-rs-proposal-codec.js';
import {RAFT_RS_ENTRY_TYPE} from
  '../../src/raft/raft-rs-ready-loop-constants.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';

// The system table the witnesses write: the replica-operation rows the
// rebalancer's mutation gateway persists (its primary key and one column).
const IDENTITY_TABLE = SYSTEM_TABLE_NAME.REPLICA_OPERATIONS;
const IDENTITY_KEY = 'operation_id';
const IDENTITY_VALUE = 'status';
const NODE_ID = 'identity-node';
const DB_FILE = 'replica.sqlite';
const POLL_MS = 5;
const SETTLE_BUDGET_MS = 10000;
const START_MS = 2000000;
const LOG_ENCODING = 'base64';
const {QUERY_MESSAGE_FIELD_ENTRY_ID} = QUERY_EXECUTOR_SHARED;
const TABLE_CATALOGUE_ROW = Object.freeze({
  table_id: IDENTITY_TABLE,
  table_name: IDENTITY_TABLE,
  primaryKey: IDENTITY_KEY,
  active_partition_version: 1,
});

const INSERT_ROW_SQL = `INSERT INTO ${IDENTITY_TABLE} ` +
  `(${IDENTITY_KEY}, ${IDENTITY_VALUE}) VALUES (?, ?)`;
const UPDATE_ROW_SQL = `UPDATE ${IDENTITY_TABLE} SET ${IDENTITY_VALUE} = ? ` +
  `WHERE ${IDENTITY_KEY} = ?`;
const READ_VALUE_SQL = `SELECT ${IDENTITY_VALUE} AS value FROM ` +
  `${IDENTITY_TABLE} WHERE ${IDENTITY_KEY} = ?`;
const SETTLED_INDEXES_SQL =
  'SELECT log_index FROM _partition_statement_outcomes';

function quietNode() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: NODE_ID}});
  LoggingService.getInstance().initialize({level: 'fatal'});
}

function resetNode() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

async function settle(condition, budgetMs = SETTLE_BUDGET_MS) {
  const giveUpAt = Date.now() + budgetMs;
  for (;;) {
    if (await condition()) return true;
    if (Date.now() >= giveUpAt) return false;
    await new Promise((resume) => setTimeout(resume, POLL_MS));
  }
}

function onIndependentConnection(dbPath, read) {
  const connection = new Database(dbPath, {readonly: true});
  try {
    return read(connection);
  } finally {
    connection.close();
  }
}

// The command a statement is carried by, compared by its verb and its
// parameters (the engine re-renders the text from its parse).
function carries(command, statement) {
  const verb = (sql) => String(sql ?? '').trim().split(/\s+/u)[0]
    .toUpperCase();
  return verb(command?.sql) === verb(statement.sql) &&
    JSON.stringify(command?.params ?? []) ===
      JSON.stringify(statement.params);
}

function durableLogCommands(dbPath, groupId) {
  return onIndependentConnection(dbPath, (connection) => connection
    .prepare(RAFT_RS_SQL.SELECT_LOG_ENTRIES).all(groupId)
    .filter((entry) => Number(entry.entry_type) === RAFT_RS_ENTRY_TYPE.NORMAL &&
      typeof entry.data === 'string' && entry.data.length > 0)
    .map((entry) => ({index: Number(entry.log_index), command:
      decodeCommittedProposal(Buffer.from(entry.data, LOG_ENCODING))})));
}

// The replica's own table row and the catalogue row of its table.
function replicaOptions(partitionId, dbPath, network, extra = {}) {
  const replicaId = `${partitionId}-r1`;
  return {
    partitionId, replicaId, replicaIds: [replicaId], nodeId: NODE_ID,
    tableId: IDENTITY_TABLE, tableName: IDENTITY_TABLE, dbPath,
    transport: network, systemTableCache: new SystemTableCache(),
    schema: {columns: [
      {name: IDENTITY_KEY, type: 'TEXT', primaryKey: true},
      {name: IDENTITY_VALUE, type: 'TEXT'},
    ]},
    ...extra,
  };
}

// The controllable port's propose handler: commit at once, or hold the one
// armed proposal, release it by the replica's commit deadline and commit it
// after the release answered.
function holdAndReleaseProposals(provider, clock, committedCommands) {
  const release = {armed: false, released: 0, service: null, commit: null};
  const commit = (command) => {
    provider.commit(command);
    committedCommands.push({index: provider.committedIndex, command});
  };
  release.commit = commit;
  const releaseThenCommit = async (command) => {
    const queue = release.service.proposalQueue;
    await settle(() => queue.proposals?.get(command.entryId) ===
      PROPOSAL_QUEUE_PROPOSAL_STATE.PROPOSED);
    clock.advance(PARTITION_SERVICE_DEFAULT.PENDING_REQUEST_TIMEOUT_MS);
    await settle(() => !queue.has(command.entryId));
    release.released += 1;
    commit(command);
  };
  provider.setProposeHandler(async (command) => {
    if (!release.armed) {
      commit(command);
      return;
    }
    release.armed = false;
    setImmediate(() => {
      releaseThenCommit(command);
    });
  });
  return release;
}

/**
 * One replica of the identity table, leading its group.
 * @param {string} partitionId - Its partition.
 * @param {Object} [options] - {releasable}: the controllable port whose
 *   armed proposal is released unknown and then committed.
 * @return {Promise<Object>} The replica, its address and database, what it
 *   applied, `armRelease()` (releasable only) and `close()`.
 */
async function openReplica(partitionId, {releasable = false} = {}) {
  quietNode();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'write-attempt-'));
  const dbPath = path.join(directory, DB_FILE);
  const network = createLoopbackTransport();
  const committedCommands = [];
  let release = null;
  let service;
  if (releasable) {
    const provider = new ControllablePartitionRaftProvider();
    const clock = new VirtualTimeSource({startMs: START_MS});
    service = createControllablePartitionService(replicaOptions(partitionId,
      dbPath, network, {timeSource: clock}), provider);
    release = holdAndReleaseProposals(provider, clock, committedCommands);
    release.service = service;
  } else {
    service = new PartitionService(replicaOptions(partitionId, dbPath,
      network));
  }
  await service.initialize();
  if (service.raft.readStatus().role !== RAFT_ROLE.LEADER) {
    await service.raft.campaign();
  }
  await settle(() => service.raft.readStatus().role === RAFT_ROLE.LEADER);
  service.systemTableCache.applySystemTableChange(TABLES.TABLES,
    CDCOperation.INSERT, {...TABLE_CATALOGUE_ROW});
  // Every statement the replica was sent - by its transport handler or by a
  // local caller - with the entryId it was sent under (observed; the call
  // goes through unchanged).
  const sends = [];
  const executeQuery = service.executeQuery.bind(service);
  service.executeQuery = (sql, params, options) => {
    sends.push({sql, params, entryId: options?.entryId ?? null});
    return executeQuery(sql, params, options);
  };
  const commands = () => releasable ? committedCommands :
    durableLogCommands(dbPath, partitionId);
  return {
    service, partitionId, dbPath, network, nodeId: NODE_ID,
    replicaId: service.replicaId,
    address: `${NODE_ID}/partition/${service.replicaId}`,
    release,
    armRelease() {
      release.armed = true;
    },
    // Commit a command through the controllable port, as consensus delivers
    // a committed entry to the application (releasable only).
    commitCommand(command) {
      release.commit(command);
    },
    // The entryIds the replica was sent a statement under, in order.
    entryIdsSentFor(statement) {
      return sends.filter((send) => carries(send, statement))
        .map((send) => send.entryId);
    },
    // How many times the replica applied a statement.
    applications(statement) {
      const settled = onIndependentConnection(dbPath, (connection) =>
        new Set(connection.prepare(SETTLED_INDEXES_SQL).all()
          .map((row) => Number(row.log_index))));
      return commands().filter((entry) => carries(entry.command, statement) &&
        settled.has(entry.index)).length;
    },
    valueOf(rowId) {
      return onIndependentConnection(dbPath, (connection) =>
        connection.prepare(READ_VALUE_SQL).get(rowId)?.value ?? null);
    },
    async close() {
      await service.shutdown();
      fs.rmSync(directory, {recursive: true, force: true});
      resetNode();
    },
  };
}

// The engine's catalogue: the table, its one partition, and the replica's
// services row naming it the leader. While `withdrawn` is set the partition
// and its replica are gone from it (routing churn): the table stays known.
function catalogueOf(replica) {
  const rowsByType = {
    tables: [{...TABLE_CATALOGUE_ROW}],
    partitions: [{partition_id: replica.partitionId,
      table_name: IDENTITY_TABLE, leader_node_id: replica.nodeId,
      partition_key_start: null, partition_key_end: null}],
    services: [{service_id: replica.replicaId,
      service_type: SERVICE_TYPE.PARTITION, partition_id: replica.partitionId,
      node_id: replica.nodeId, raft_role: RAFT_ROLE.LEADER,
      address: replica.address, status: SERVICE_STATUS.ACTIVE}],
  };
  const catalogue = {
    withdrawn: false,
    rowsOf: (type) => catalogue.withdrawn && type !== 'tables' ? [] :
      rowsByType[type] ?? [],
    get: (type, key) => catalogue.rowsOf(type).find((row) =>
      row[type === 'tables' ? 'table_name' : 'partition_id'] === key) ?? null,
    filter: (type, predicate) => catalogue.rowsOf(type).filter(predicate),
    getAll: (type) => catalogue.rowsOf(type),
  };
  return catalogue;
}

/**
 * The client path in front of a replica: a production SQLQueryEngine whose
 * router delivers to the replica's transport handler, logging each delivery
 * ({entryId, sql, params, answer}). A scenario's `rewrite(answer)`, when
 * set, is what the client receives instead of the answer (a replica that
 * answers falsely).
 * @param {Object} replica - From openReplica.
 * @return {Object} {engine, router, catalogue}.
 */
function createClientPath(replica) {
  const router = {
    deliveries: [],
    rewrite: null,
    async deliver(address, message) {
      const delivery = {entryId: message?.[QUERY_MESSAGE_FIELD_ENTRY_ID] ??
        null, sql: message?.sql, params: message?.params, answer: null};
      router.deliveries.push(delivery);
      delivery.answer = await replica.network.deliver(address, message);
      return router.rewrite ? router.rewrite(delivery.answer) :
        delivery.answer;
    },
  };
  const catalogue = catalogueOf(replica);
  return {
    engine: new SQLQueryEngine({systemCache: catalogue, messageRouter: router}),
    router,
    catalogue,
  };
}

export {
  IDENTITY_TABLE,
  INSERT_ROW_SQL,
  UPDATE_ROW_SQL,
  createClientPath,
  openReplica,
};
