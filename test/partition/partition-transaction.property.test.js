import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {
  PARTITION_SERVICE_OPERATION,
} from '../../src/partition/partition-service-constants.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {PARTICIPANT_COMMIT_OUTCOME} from '../../src/constants/transactions.js';
import {hasParticipantSession} from
  '../../src/partition/partition-participant-transaction-session.js';
import {
  PARTICIPANT_TRANSACTION_COMMAND,
  PARTICIPANT_TRANSACTION_STATE,
} from '../../src/partition/partition-participant-transaction-constants.js';
import {
  restartOverCommittedCommands,
} from './partition-rs-raft-restart-fixture.js';
import {
  applyCommitted,
  awaitProposal,
  beginMessage,
  commitMessage,
  identityOf,
  isDecisionCommand,
  isPrepareCommand,
  pick,
  prepareCommandOf,
  prepareMessage,
  queryMessage,
  send,
  shutdownAll,
  startLeader,
  track,
  txMessage,
} from '../test-helpers/participant-transaction-fixture.js';

const config = ConfigurationManager.getInstance();
if (!config.isInitialized()) {
  config.initialize();
}

const TEST_TABLE_NAME = 'tx_table';
const rowIdArb = fc.stringMatching(/^[a-z][a-z0-9]{2,11}$/);
const valueArb = fc.stringMatching(/^[a-z]{1,8}$/);

const fixtureOptions = (dbPath = ':memory:') => ({dbPath,
  tableName: TEST_TABLE_NAME,
  schema: {columns: [
    {name: 'id', type: 'TEXT', primaryKey: true},
    {name: 'value', type: 'TEXT'},
  ]}});

// ---------------------------------------------------------------------------
// Property 12: PREPARE is a committed command, acknowledged after it applies
// Superseded by TX1 design revision 10, section 9.2 (quest
// replicated-transaction-decision-and-apply): a participant session stages
// under F6 c' and never holds a SQLite transaction; PREPARE proposes its
// PARTICIPANT_PREPARE and is acknowledged only after that command applied
// (W1a), the staged row stays invisible while PREPARED, and the bound COMMIT
// decision applies it. Durable apply and row visibility are read on an
// independent connection through their owners; proposal order comes from the
// controllable current consensus seam.
// Validates: Requirements 1.3, 8.1
// ---------------------------------------------------------------------------
function readIndependently(dbPath, read) {
  const independent = new Database(dbPath, {readonly: true});
  try {
    return read(independent);
  } finally {
    independent.close();
  }
}

function durableAppliedIndex(dbPath, partitionId) {
  return readIndependently(dbPath, (independent) =>
    Number(RaftRsDurableStore.readAppliedIndexIn(independent, partitionId)));
}

function visibleRowIds(dbPath, rowId) {
  return readIndependently(dbPath, (independent) => independent
    .prepare(`SELECT id FROM ${TEST_TABLE_NAME} WHERE id = ?`)
    .all(rowId).map((row) => row.id));
}

const participantCommandTypes = (proposed, participantId) => proposed
  .filter((entry) => entry.participantId === participantId)
  .map((entry) => entry.type);

// A participant transaction on `partition` (its admission enabled), with one
// staged row.
async function stagedParticipant(partition, transactionId, row) {
  const tx = identityOf(transactionId, {partitionId: partition.partitionId,
    sessionId: transactionId});
  await send(partition, beginMessage(tx));
  const staged = await send(partition, queryMessage(tx,
    `INSERT INTO ${TEST_TABLE_NAME} (id, value) VALUES (?, ?)`, [row.id, row.value]));
  return {tx, staged};
}

test(
  'Property 12: PREPARE is acknowledged only after its committed ' +
  'PARTICIPANT_PREPARE applies, and the bound COMMIT applies the staged row',
  async (t) => {
    await fc.assert(
      fc.asyncProperty(
        rowIdArb,
        valueArb,
        async (rowId, value) => {
          const directory = fs.mkdtempSync(
            path.join(os.tmpdir(), 'tx-partition-prepare-'));
          const dbPath = path.join(directory, 'partition.sqlite');
          const {leader: partition, proposed} = await startLeader(fixtureOptions(dbPath));

          try {
            const {tx, staged} = await stagedParticipant(partition, `p12-${rowId}`,
              {id: rowId, value});
            const prepare = track(send(partition, prepareMessage(tx)));
            const prepareCommand = await awaitProposal(proposed,
              (entry) => isPrepareCommand(entry) &&
                entry.transactionId === tx.transactionId);
            assert.ok(prepareCommand, 'PREPARE must be proposed');
            const appliedBeforePrepare = durableAppliedIndex(dbPath,
              partition.partitionId);
            const beforePrepareApply = {
              settled: prepare.settled,
              proposed: participantCommandTypes(proposed, tx.participantId),
              appliedIndex: appliedBeforePrepare,
              rows: visibleRowIds(dbPath, rowId),
              connectionHeld: partition.db.inTransaction,
            };
            const prepareApply = applyCommitted(partition, prepareCommand);
            const prepared = await prepare.promise;
            const atPrepare = {
              proposed: participantCommandTypes(proposed, tx.participantId),
              appliedIndex: durableAppliedIndex(dbPath, partition.partitionId),
              rows: visibleRowIds(dbPath, rowId),
              connectionHeld: partition.db.inTransaction,
            };
            const commit = track(send(partition,
              commitMessage(tx, prepared?.preparedDigest)));
            const decisionCommand = await awaitProposal(proposed,
              (entry) => isDecisionCommand(entry) &&
                entry.transactionId === tx.transactionId);
            assert.ok(decisionCommand, 'decision must be proposed');
            const beforeDecisionApply = {settled: commit.settled,
              rows: visibleRowIds(dbPath, rowId)};
            const decisionApply = applyCommitted(partition, decisionCommand);
            const committed = await commit.promise;
            assert.deepEqual({
              staged: staged?.provisional === true,
              beforePrepareApply,
              prepareApply,
              prepared: pick(prepared, ['success', 'state']),
              atPrepare,
              beforeDecisionApply,
              decisionApply,
              committed: pick(committed, ['success', 'state']),
              afterCommit: {
                proposed: participantCommandTypes(proposed, tx.participantId),
                appliedIndex: durableAppliedIndex(dbPath, partition.partitionId),
                rows: visibleRowIds(dbPath, rowId),
              },
            }, {
              staged: true,
              beforePrepareApply: {settled: false,
                proposed: [PARTICIPANT_TRANSACTION_COMMAND.PREPARE],
                appliedIndex: appliedBeforePrepare, rows: [], connectionHeld: false},
              prepareApply: null,
              prepared: {success: true, state: PARTICIPANT_TRANSACTION_STATE.PREPARED},
              atPrepare: {proposed: [PARTICIPANT_TRANSACTION_COMMAND.PREPARE],
                appliedIndex: appliedBeforePrepare + 1, rows: [], connectionHeld: false},
              beforeDecisionApply: {settled: false, rows: []},
              decisionApply: null,
              committed: {success: true, state: PARTICIPANT_TRANSACTION_STATE.COMMITTED},
              afterCommit: {proposed: [PARTICIPANT_TRANSACTION_COMMAND.PREPARE,
                PARTICIPANT_TRANSACTION_COMMAND.DECISION],
              appliedIndex: appliedBeforePrepare + 2, rows: [rowId]},
            }, 'no row is visible before the decision; each step is a committed ' +
              'command, acknowledged after it applied');
            return true;
          } finally {
            await shutdownAll(partition);
            fs.rmSync(directory, {recursive: true, force: true});
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('PREPARE and COMMIT are committed participant commands');
  },
);


// Property 13 (leader change) returns with F6 layer 2 (replicated interactive transactions): layer 1 proposes no PREPARE marker to rebuild from.
// ---------------------------------------------------------------------------
// Property 13 across a restart: the PREPARED row is read, nothing is
// reconstructed
// Superseded by TX1 design revision 10, section 9.2 (W12c): a committed
// PARTICIPANT_PREPARE leaves a durable PREPARED row in
// _participant_transactions, written with the applied index; after a restart
// that row, not a scan of the log, answers PREPARED with its digest and log
// index, and no volatile session is reconstructed.
// Validates: Requirements 8.2, 8.3, 8.4
// ---------------------------------------------------------------------------
test(
  'Property 13 (restart): a PREPARED participant row survives a restart and ' +
  'is read, not reconstructed',
  async (t) => {
    const partitionId = `tx-partition-restart-${Date.now()}`;
    const tx = identityOf('p13-restart', {partitionId, sessionId: 'restart-prepared'});
    const prepare = prepareCommandOf(tx, [{entryId: 'p13-op',
      sql: `INSERT INTO ${TEST_TABLE_NAME} (id, value) VALUES (?, ?)`,
      params: ['prepared-row', 'v']}], 0, partitionId);
    const {restarted, committed, dispose} = await restartOverCommittedCommands({
      partitionId,
      tableId: TEST_TABLE_NAME,
      tableName: TEST_TABLE_NAME,
      schema: {
        columns: [
          {name: 'id', type: 'TEXT', primaryKey: true},
          {name: 'value', type: 'TEXT'},
        ],
      },
    }, [prepare]);
    try {
      const outcome = await send(restarted, txMessage(
        PARTITION_SERVICE_OPERATION.TRANSACTION_OUTCOME, tx));
      t.strictSame({
        outcome: pick(outcome, ['outcome', 'state', 'prepareIndex', 'preparedDigest']),
        volatileSession: hasParticipantSession(restarted),
      }, {
        outcome: {outcome: PARTICIPANT_COMMIT_OUTCOME.UNKNOWN,
          state: PARTICIPANT_TRANSACTION_STATE.PREPARED,
          prepareIndex: committed[0].index, preparedDigest: prepare.preparedDigest},
        volatileSession: false,
      }, 'the durable row is the prepared authority after a restart');
    } finally {
      await dispose();
    }
  },
);

// ---------------------------------------------------------------------------
// Property 15: a PREPARED participant row is never released by time
// Superseded by TX1 design revision 10, section 9.2 (W12d): the hold sweep
// reports a PREPARED row past its window and never terminates it, so the
// bound COMMIT decision applies after the window (no PREPARE_LOST).
// Validates: Requirements 9.3
// ---------------------------------------------------------------------------
test(
  'Property 15: the hold sweep never releases a PREPARED participant row; ' +
  'its bound COMMIT applies after the hold window',
  async (t) => {
    await fc.assert(
      fc.asyncProperty(
        rowIdArb,
        valueArb,
        async (rowId, value) => {
          const {leader: partition, proposed} = await startLeader(
            fixtureOptions());

          try {
            const {tx} = await stagedParticipant(partition, `p15-${rowId}`,
              {id: rowId, value});
            const prepare = track(send(partition, prepareMessage(tx)));
            const prepareCommand = await awaitProposal(proposed,
              (entry) => isPrepareCommand(entry) &&
                entry.transactionId === tx.transactionId);
            assert.ok(prepareCommand, 'PREPARE must be proposed');
            const prepareApply = applyCommitted(partition, prepareCommand);
            const prepared = await prepare.promise;
            const nowMs = Date.now();
            const released = [partition.enforcePreparedStateHoldTimeouts(nowMs),
              partition.enforcePreparedStateHoldTimeouts(nowMs +
                partition.preparedStateHoldTimeoutMs + 1)];
            const held = await send(partition, txMessage(
              PARTITION_SERVICE_OPERATION.TRANSACTION_OUTCOME, tx));
            const commit = track(send(partition,
              commitMessage(tx, prepared?.preparedDigest)));
            const decisionCommand = await awaitProposal(proposed,
              (entry) => isDecisionCommand(entry) &&
                entry.transactionId === tx.transactionId);
            assert.ok(decisionCommand, 'decision must be proposed');
            const decisionApply = applyCommitted(partition, decisionCommand);
            const committed = await commit.promise;
            const rows = await partition.executeQuery(
              `SELECT id FROM ${TEST_TABLE_NAME} WHERE id = ?`, [rowId]);
            return prepareApply === null && decisionApply === null &&
              prepared?.state === PARTICIPANT_TRANSACTION_STATE.PREPARED &&
              released.every((count) => count === 0) &&
              held?.state === PARTICIPANT_TRANSACTION_STATE.PREPARED &&
              committed?.state === PARTICIPANT_TRANSACTION_STATE.COMMITTED &&
              rows.rows.length === 1;
          } finally {
            await shutdownAll(partition);
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('a PREPARED row is an obligation released only by its decision');
  },
);
