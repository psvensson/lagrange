// A partition restarted over a committed rs-raft log.
//
// The committed commands reach the rs-raft durable store the one way
// production puts them there: proposed through the partition's own frozen
// operation port and committed by the core (a lone voter commits its own
// proposals). Nothing is written into any log table by hand, and the legacy
// log adapter is never touched, so a reader that still reads the legacy log
// finds nothing.
//
// What a test compares against is read back on an INDEPENDENT read-only
// SQLite connection: the log index each command committed at and the durable
// commit and applied indices are the core's, never a number this fixture
// chose.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';

import {PartitionService} from '../../src/partition/partition-service.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {assertRaftOperationSucceeded} from
  '../../src/raft/raft-operation-port.js';
import {RAFT_RS_SQL} from '../../src/raft/raft-rs-durable-store-constants.js';
import {RAFT_RS_ENTRY_TYPE} from '../../src/raft/raft-rs-ready-loop-constants.js';
import {
  PARTICIPANT_TRANSACTION_COMMAND,
  PARTICIPANT_TRANSACTION_COMMAND_TYPES,
} from '../../src/partition/partition-participant-transaction-constants.js';
import {enableParticipantTransactionAdmission} from
  '../../src/partition/partition-participant-transaction-request.js';
import {withFoundingStamp} from './partition-founding-stamp.js';


const TEMP_PREFIX = 'partition-rs-raft-restart-';
const DB_FILE = 'partition.sqlite';
const CREATE_TABLE_NAME = /CREATE TABLE IF NOT EXISTS\s+(\w+)/u;
// The store owner exports its DDL, not its table-name map.
const RS_LOG_TABLE = RAFT_RS_SQL.CREATE_LOG_TABLE.match(CREATE_TABLE_NAME)[1];
const RS_HARD_STATE_TABLE =
  RAFT_RS_SQL.CREATE_HARD_STATE_TABLE.match(CREATE_TABLE_NAME)[1];
const RS_APPLIED_STATE_TABLE =
  RAFT_RS_SQL.CREATE_APPLIED_STATE_TABLE.match(CREATE_TABLE_NAME)[1];
const BASE64 = 'base64';
const UTF8 = 'utf8';

/**
 * What the rs-raft durable store of one group holds, read on a connection of
 * the caller's own: the durable commit and applied indices, and the applied
 * NORMAL entries with a payload, decoded (the prefix the state machine holds;
 * the applied index is written in the same transaction as its SQL).
 * @param {string} dbPath - The partition database.
 * @param {string} groupId - The consensus group (the partition id).
 * @return {{commitIndex: number, appliedIndex: number,
 *   committed: Array<Object>}} The record.
 */
function readCommittedIndependently(dbPath, groupId) {
  const independent = new Database(dbPath, {readonly: true});
  try {
    const hardState = independent.prepare(
      `SELECT commit_index FROM ${RS_HARD_STATE_TABLE} WHERE group_id = ?`)
      .get(groupId);
    const appliedState = independent.prepare(
      `SELECT applied_index FROM ${RS_APPLIED_STATE_TABLE} WHERE group_id = ?`)
      .get(groupId);
    const commitIndex = hardState === undefined ?
      0 : Number(hardState.commit_index);
    const appliedIndex = appliedState === undefined ?
      0 : Number(appliedState.applied_index);
    const committed = independent.prepare(
      `SELECT log_index, data FROM ${RS_LOG_TABLE} WHERE group_id = ? ` +
      'AND entry_type = ? AND data IS NOT NULL AND log_index <= ? ' +
      'ORDER BY log_index')
      .all(groupId, RAFT_RS_ENTRY_TYPE.NORMAL, appliedIndex)
      .map((row) => ({
        index: Number(row.log_index),
        command: JSON.parse(Buffer.from(row.data, BASE64).toString(UTF8)),
      }));
    return {commitIndex, appliedIndex, committed};
  } finally {
    independent.close();
  }
}

// A log that carries participant transaction commands starts with the
// partition's generation origin (TX1 design 0.0.13: transaction admission is
// enabled before any transaction): the lone leader proposes it through the
// production path, as its first data entry.
async function enableTransactionsWhenCarried(service, commands) {
  if (!commands.some((command) =>
    PARTICIPANT_TRANSACTION_COMMAND_TYPES.includes(command?.type))) {
    return;
  }
  const enabled = await enableParticipantTransactionAdmission(service);
  assert.equal(enabled.success, true,
    `the generation origin applies (${JSON.stringify(enabled)})`);
}

const isGenerationOrigin = (entry) =>
  entry.command?.type === PARTICIPANT_TRANSACTION_COMMAND.GENERATION_ORIGIN;

async function leadAlone(service) {
  const status = await service.raft.readStatus();
  if (status.role !== RAFT_ROLE.LEADER) {
    assertRaftOperationSucceeded(await service.raft.campaign());
  }
  assert.equal((await service.raft.readStatus()).role, RAFT_ROLE.LEADER,
    'a lone voter leads its own group');
}

/**
 * Build a partition on rs-raft, commit `commands` through its operation port,
 * shut it down, and initialize a second incarnation on the same database.
 * @param {Object} options - PartitionService options (partitionId, schema...).
 * @param {Array<Object>} commands - Commands to propose, in order.
 * @return {Promise<Object>} {restarted, dbPath, commitIndex, appliedIndex,
 *   committed, dispose}.
 */
async function restartOverCommittedCommands(options, commands) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX));
  const partitionOptions = {
    replicaId: `${options.partitionId}-r1`,
    replicaIds: [`${options.partitionId}-r1`],
    deferElection: true,
    ...options,
    dbPath: path.join(directory, DB_FILE),
  };
  let restarted = null;
  const dispose = async () => {
    try {
      await restarted?.shutdown();
    } finally {
      fs.rmSync(directory, {recursive: true, force: true});
    }
  };
  try {
    const first = new PartitionService(withFoundingStamp(partitionOptions));
    try {
      await first.initialize();
      await leadAlone(first);
      await enableTransactionsWhenCarried(first, commands);
      for (const command of commands) {
        assertRaftOperationSucceeded(await first.raft.propose(command));
      }
    } finally {
      await first.shutdown();
    }
    const record = readCommittedIndependently(
      partitionOptions.dbPath, partitionOptions.partitionId);
    // The commands a test committed, without the origin this fixture added.
    const before = {...record,
      committed: record.committed.filter((entry) => !isGenerationOrigin(entry))};
    assert.equal(before.committed.length, commands.length,
      'precondition: every proposed command is committed and applied in the ' +
      `rs-raft store (${JSON.stringify(before)})`);
    restarted = new PartitionService(withFoundingStamp(partitionOptions));
    await restarted.initialize();
    return {
      restarted,
      dbPath: partitionOptions.dbPath,
      ...before,
      dispose,
    };
  } catch (error) {
    await dispose();
    throw error;
  }
}

export {
  readCommittedIndependently,
  restartOverCommittedCommands,
};
