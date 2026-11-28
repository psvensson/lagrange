// Shared fixtures of the committed statement outcome tests
// (committed-statement-outcome.test.js) and the mirror-effect retention
// lifecycle tests (mirror-effect-retention-lifecycle.test.js): a real
// PartitionService on a temporary database over a CDC-carrying table, and
// readers of its durable record on an independent connection.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';

import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {PARTITION_SERVICE_OPERATION} from
  '../../src/partition/partition-service-constants.js';
import {PARTITION_COMMITTED_STATEMENT_OUTCOME_SQL} from
  '../../src/partition/partition-committed-statement-outcome-constants.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {countCdcObligations} from
  '../../src/partition/partition-cdc-obligation-ledger.js';
import {withFoundingStamp} from './partition-founding-stamp.js';
import {
  CDC_SCHEMA,
  CDC_TABLE,
  resumeFixtureParticipantAdmission,
} from '../test-helpers/participant-transaction-fixture.js';

const TEMP_PREFIX = 'committed-statement-outcome-';
const DB_FILE = 'partition.sqlite';
// A CDC-carrying table: the witnesses that use it also measure the committed
// write's CDC obligation, which only a propagated table owes (decision D2).
const TABLE_NAME = CDC_TABLE;
const INSERT_SQL =
  `INSERT INTO ${TABLE_NAME} (group_id, representative_node_id) VALUES (?, ?)`;
const SELECT_ROW_SQL =
  `SELECT group_id AS id, representative_node_id AS value FROM ${TABLE_NAME} WHERE group_id = ?`;

const TEST_TIMEOUT_MS = 30000;

// The application owner exports its DDL, not its table name.
const OUTCOME_TABLE = PARTITION_COMMITTED_STATEMENT_OUTCOME_SQL.CREATE_TABLE
  .match(/CREATE TABLE IF NOT EXISTS\s+(\w+)/u)[1];

const GROUP_BUDGET_MS = 5000;

function quietEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: 'statement-outcome-node'}});
  LoggingService.getInstance().initialize({level: 'error'});
}

function resetEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

function partitionOptions(partitionId, dbPath) {
  return {
    partitionId,
    tableId: TABLE_NAME,
    tableName: TABLE_NAME,
    replicaId: `${partitionId}-r1`,
    replicaIds: [`${partitionId}-r1`],
    nodeId: 'statement-outcome-node',
    systemTableCache: new SystemTableCache(),
    dbPath,
    schema: CDC_SCHEMA,
  };
}

// The durable record on a connection of the test's own, through the store
// owner's readers: the applied index and the applied proposals.
function durableRecord(dbPath, partitionId) {
  const independent = new Database(dbPath, {readonly: true});
  try {
    return {
      appliedIndex: Number(
        RaftRsDurableStore.readAppliedIndexIn(independent, partitionId)),
      applied: RaftRsDurableStore.readCommittedEntriesIn(
        independent, partitionId).map((record) => ({
        index: Number(record.index),
        entryId: record.command.entryId,
      })),
    };
  } finally {
    independent.close();
  }
}

function rowOf(dbPath, id) {
  const independent = new Database(dbPath, {readonly: true});
  try {
    return independent.prepare(SELECT_ROW_SQL).get(id) ?? null;
  } finally {
    independent.close();
  }
}

// Every outcome row, on a connection of the test's own.
function outcomeRows(dbPath) {
  const independent = new Database(dbPath, {readonly: true});
  try {
    return independent.prepare(
      'SELECT entry_key, outcome, log_index, term, failure_code, ' +
      `failure_message FROM ${OUTCOME_TABLE} ORDER BY log_index`).all();
  } finally {
    independent.close();
  }
}

function insert(service, id, value, entryId) {
  return service.applyWrite({
    type: PARTITION_SERVICE_OPERATION.INSERT,
    sql: INSERT_SQL,
    params: [id, value],
    entryId,
  });
}

async function withPartition(partitionId, body, options = {}) {
  quietEnvironment();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX));
  const dbPath = path.join(directory, DB_FILE);
  const services = [];
  const open = async () => {
    const service = new PartitionService(withFoundingStamp({...partitionOptions(partitionId,
      dbPath), ...options}));
    services.push(service);
    await service.initialize();
    await resumeFixtureParticipantAdmission(service);
    return service;
  };
  try {
    await body({dbPath, open});
  } finally {
    for (const service of services) {
      await service.shutdown();
    }
    fs.rmSync(directory, {recursive: true, force: true});
    resetEnvironment();
  }
}

const UNKEYED_ROW_ID = 'row-unkeyed';

// A committed SQL command with no entryId, as only a bug or version skew
// proposes one: straight through the port, past the write-entry builder.
function unkeyedInsert() {
  return {type: PARTITION_SERVICE_OPERATION.INSERT, sql: INSERT_SQL,
    params: [UNKEYED_ROW_ID, 'unkeyed'], timestamp: String(Date.now()),
    proposedBy: 'other-replica'};
}

// One replica's whole application-visible state around the unkeyed command.
function unkeyedStateOf(service, dbFile, partitionId) {
  return {
    appliedIndex: durableRecord(dbFile, partitionId).appliedIndex,
    row: rowOf(dbFile, UNKEYED_ROW_ID),
    outcomeRows: outcomeRows(dbFile),
    obligations: countCdcObligations(service.db),
  };
}

export {
  GROUP_BUDGET_MS,
  INSERT_SQL,
  TABLE_NAME,
  TEMP_PREFIX,
  TEST_TIMEOUT_MS,
  durableRecord,
  insert,
  outcomeRows,
  partitionOptions,
  quietEnvironment,
  resetEnvironment,
  rowOf,
  unkeyedInsert,
  unkeyedStateOf,
  withPartition,
};
