// What a client is told when a partition answers a write from its outcome
// row (quest reroute-carries-the-entry-id, verification round 1: B1, F3,
// F4), through the production client path - SQLQueryEngine, the distributed
// write coordinator, QueryExecutor, the replica's transport handler - and,
// for the admin write receipt, the admin envelope that builds it from the
// engine's answer (createAdminQueryResultMessageEnvelope).
//
// B1: a client re-issue under its idempotency key is the SAME logical write:
// its replayed answer is bound to the committed entry by (entryId,
// replayOfLogIndex) and the witness's entryId, whatever operationId the
// re-issue's plan minted; an answer that is not a replay keeps the
// operationId binding, and a replay whose witness names another entry is
// never complete.
// F3: the replay of an outcome row that recorded no affected-row count (a
// row written before the count was recorded) answers the count as unknown,
// never as 0.
// F4: a key reused for a different statement is refused, typed, and never
// answered with the first statement's replay; a committed entry whose key is
// settled for a different statement is consumed without being reported
// committed.
// Verification round 2: F14, a submission that reaches the partition while a
// write under its entryId is still pending there joins that write's answer
// only when it carries the same statement - another statement is refused,
// typed, as a settled row refuses it; F16, a replay names how its row binds
// the statement asking (the same statement, or a row that recorded no
// binding), on the partition's answer, across the wire, at the engine and in
// the admin receipt; F18, the engine's summary of a write with one
// participant carries that participant's failure code and entry.
//
// Every expectation is read from production: the engine's answers, the
// envelope, the replica's rows and what it applied. The literals are inputs
// and the names of the contract: the refusal code the quest names.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import Database from 'better-sqlite3';

import {
  INSERT_ROW_SQL,
  UPDATE_ROW_SQL,
  createClientPath,
  openReplica,
} from './write-identity-attempt-harness.js';
import {createAdminQueryResultMessageEnvelope} from
  '../../src/admin/admin-query-result-message-envelope.js';
import {
  PARTITION_COMMITTED_STATEMENT_BINDING,
  PARTITION_COMMITTED_STATEMENT_OUTCOME_SQL,
} from '../../src/partition/partition-committed-statement-outcome-constants.js';
import {
  PARTITION_SERVICE_EVENT,
  PARTITION_SERVICE_OPERATION,
} from '../../src/partition/partition-service-constants.js';
import {buildPartitionWriteEntry} from
  '../../src/partition/partition-write-kernel.js';
import {QUERY_EXECUTOR_SHARED} from '../../src/query/query-executor-shared.js';
import {RAFT_RS_PROPOSAL_CODEC_ERROR} from
  '../../src/raft/raft-rs-proposal-codec-constants.js';

const TEST_TIMEOUT_MS = 60000;
const {QUERY_MESSAGE_FIELD_ENTRY_ID, QUERY_MESSAGE_TYPE} =
  QUERY_EXECUTOR_SHARED;
const STATEMENT_MISMATCH_CODE = 'partition_write_entry_id_statement_mismatch';
// The owner exports its DDL; the table is named from it.
const OUTCOME_TABLE = PARTITION_COMMITTED_STATEMENT_OUTCOME_SQL.CREATE_TABLE
  .match(/CREATE TABLE IF NOT EXISTS\s+(\w+)/u)[1];
// The column of the statement digest: the owner's widening that is not the
// affected-row count.
const DIGEST_COLUMN = PARTITION_COMMITTED_STATEMENT_OUTCOME_SQL.WIDENING_COLUMNS
  .map((column) => column.name).find((name) =>
    name !== PARTITION_COMMITTED_STATEMENT_OUTCOME_SQL.CHANGES_COLUMN);

function participantOf(answer) {
  return [...(answer?.participantResults ?? []),
    ...(answer?.participantFailures ?? [])][0] ?? null;
}

function receiptOf(answer, queryId) {
  return createAdminQueryResultMessageEnvelope(queryId, answer).writeReceipt;
}

// The outcome row at a log index as a replica holds one recorded before a
// widening: the column is NULL.
function unrecordColumn(replica, column, logIndex) {
  const writer = new Database(replica.dbPath);
  try {
    writer.prepare(`UPDATE ${OUTCOME_TABLE} SET ${column} = NULL ` +
      'WHERE log_index = ?').run(logIndex);
  } finally {
    writer.close();
  }
}

// The writes a replica's write path was handed, and whether a write under
// the same entryId was pending there when each arrived (observed; every
// write goes through unchanged).
function observeArrivals(service) {
  const arrivals = [];
  const applyWrite = service.applyWrite.bind(service);
  service.applyWrite = (entry, phaseTimings) => {
    arrivals.push({params: entry?.params,
      pending: service.pendingWriteOutcomes.has(entry?.entryId)});
    return applyWrite(entry, phaseTimings);
  };
  return arrivals;
}

// Two writes submitted at once under one key: their answers, and whether the
// second reached the partition while the first was pending there.
async function submitConcurrently(client, replica, writes, idempotencyKey) {
  const arrivals = observeArrivals(replica.service);
  const answers = await Promise.all(writes.map((write) =>
    client.engine.executeQuery(write.sql, write.params, {idempotencyKey})));
  assert.deepEqual(arrivals.map((arrival) => ({params: arrival.params,
    pending: arrival.pending})), writes.map((write, index) => ({params:
    write.params, pending: index > 0})),
  'setup: the second reached the partition while the first was pending ' +
    'under the same entryId');
  return answers;
}

async function withClient(partitionId, body, options = {}) {
  const replica = await openReplica(partitionId, options);
  try {
    await body({replica, client: createClientPath(replica)});
  } finally {
    await replica.close();
  }
}

test('B1: a keyed re-issue\'s replayed answer is a complete admin receipt, ' +
  'bound to the committed entry', {timeout: TEST_TIMEOUT_MS}, async () => {
  await withClient('identity-receipt-key', async ({client}) => {
    const write = {sql: INSERT_ROW_SQL, params: ['op-receipt', 'written']};
    const idempotencyKey = 'client-key-receipt';
    const first = await client.engine.executeQuery(write.sql, write.params,
      {idempotencyKey});
    const reissue = await client.engine.executeQuery(write.sql, write.params,
      {idempotencyKey});
    const firstReceipt = receiptOf(first, 'q-first');
    assert.equal(firstReceipt.commitWitnessComplete, true,
      'setup: the first answer\'s receipt is complete');
    assert.equal(participantOf(reissue)?.idempotentReplay, true,
      'setup: the re-issue is answered from the outcome row');
    assert.notEqual(reissue.operationId, first.operationId,
      'setup: the re-issue\'s plan minted its own operationId');
    const receipt = receiptOf(reissue, 'q-reissue');
    assert.deepEqual({
      complete: receipt.commitWitnessComplete,
      witnessed: receipt.witnessedParticipantCount,
      missing: receipt.missingCommitWitnessPartitions,
    }, {complete: true, witnessed: 1, missing: []},
    'the keyed re-issue\'s replay is a complete receipt ' +
      `(${JSON.stringify(receipt)})`);
    const [witnessed] = receipt.durableCommitWitnesses;
    const [original] = firstReceipt.durableCommitWitnesses;
    assert.deepEqual({entryId: witnessed?.entryId, term: witnessed?.term,
      logIndex: witnessed?.logIndex}, {entryId: original?.entryId,
      term: original?.term, logIndex: original?.logIndex},
    'it binds the entry the first answer committed');
    assert.equal(receipt.participantReceipts[0]?.idempotentReplay, true,
      'the receipt marks the answer as a replay');
  });
});

test('B1: a replay naming another entry, and an answer that is not a replay ' +
  'under another operationId, are never complete receipts',
{timeout: TEST_TIMEOUT_MS}, async () => {
  await withClient('identity-receipt-bound', async ({client}) => {
    const write = {sql: INSERT_ROW_SQL, params: ['op-bound', 'written']};
    const other = {sql: INSERT_ROW_SQL, params: ['op-other', 'written']};
    const first = await client.engine.executeQuery(write.sql, write.params,
      {idempotencyKey: 'client-key-bound'});
    const otherAnswer = await client.engine.executeQuery(other.sql,
      other.params, {idempotencyKey: 'client-key-other'});
    const otherEntryId =
      participantOf(otherAnswer)?.durableCommitWitness?.entryId;
    assert.ok(otherEntryId, 'setup: the other write is witnessed');
    // The replica answering the re-issue names the other entry in the
    // witness it gives (everything else as it answered).
    client.router.rewrite = (answer) => ({...answer, durableCommitWitness: {
      ...answer.durableCommitWitness, entryId: otherEntryId}});
    const reissue = await client.engine.executeQuery(write.sql, write.params,
      {idempotencyKey: 'client-key-bound'});
    client.router.rewrite = null;
    assert.equal(participantOf(reissue)?.idempotentReplay, true,
      'setup: the re-issue is a replay');
    assert.equal(receiptOf(reissue, 'q-false').commitWitnessComplete, false,
      'a replay whose witness names another entry is not complete');
    assert.equal(receiptOf({...first, operationId: otherAnswer.operationId},
      'q-other-operation').commitWitnessComplete, false,
    'an answer that is not a replay is bound by its operationId');
  });
});

test('F3: a replay of an outcome row without an affected-row count answers ' +
  'the count as unknown, never 0', {timeout: TEST_TIMEOUT_MS}, async () => {
  await withClient('identity-unknown-count', async ({replica, client}) => {
    await client.engine.executeQuery(INSERT_ROW_SQL, ['op-count', 'seed']);
    const update = {sql: UPDATE_ROW_SQL, params: ['counted', 'op-count']};
    const idempotencyKey = 'client-key-count';
    const applied = await client.engine.executeQuery(update.sql,
      update.params, {idempotencyKey});
    assert.equal(applied.affectedRows, 1, 'setup: the update changed a row');
    // The row as a replica holds one recorded before the count was.
    unrecordColumn(replica,
      PARTITION_COMMITTED_STATEMENT_OUTCOME_SQL.CHANGES_COLUMN,
      participantOf(applied).logIndex);
    const replayed = await client.engine.executeQuery(update.sql,
      update.params, {idempotencyKey});
    const participant = participantOf(replayed);
    assert.equal(participant?.idempotentReplay, true,
      'setup: the re-issue is answered from the outcome row');
    assert.deepEqual({changes: participant?.changes,
      changesKnown: participant?.changesKnown}, {changes: null,
      changesKnown: false}, 'the partition answers the count as unknown');
    assert.deepEqual({success: replayed.success,
      affectedRows: replayed.affectedRows,
      affectedRowsKnown: replayed.affectedRowsKnown}, {success: true,
      affectedRows: null, affectedRowsKnown: false},
    'the engine answers the affected rows as unknown, never 0 ' +
      `(${JSON.stringify({affectedRows: replayed.affectedRows})})`);
    const envelope = createAdminQueryResultMessageEnvelope('q-count',
      replayed);
    assert.deepEqual({affectedRows: envelope.affectedRows,
      affectedRowsKnown: envelope.affectedRowsKnown}, {affectedRows: null,
      affectedRowsKnown: false}, 'the admin answer says the same');
    assert.equal(replica.applications(update), 1,
      'the replay applied nothing again');
  });
});

test('F4: a key reused for a different statement is refused, typed, and ' +
  'never answered with the first statement\'s replay',
{timeout: TEST_TIMEOUT_MS}, async () => {
  await withClient('identity-reused-key', async ({replica, client}) => {
    await client.engine.executeQuery(INSERT_ROW_SQL, ['op-reused', 'seed']);
    const first = {sql: UPDATE_ROW_SQL, params: ['first', 'op-reused']};
    const second = {sql: UPDATE_ROW_SQL, params: ['second', 'op-reused']};
    const idempotencyKey = 'client-key-reused';
    const applied = await client.engine.executeQuery(first.sql, first.params,
      {idempotencyKey});
    assert.equal(applied.success, true, 'setup: the first update applied');
    const reused = await client.engine.executeQuery(second.sql,
      second.params, {idempotencyKey});
    const participant = participantOf(reused);
    assert.equal(reused.success, false,
      `the reused key is refused (${JSON.stringify(participant)})`);
    assert.equal(participant?.failureCode, STATEMENT_MISMATCH_CODE,
      'the refusal is typed');
    assert.notEqual(participant?.idempotentReplay, true,
      'it is not answered as the first statement\'s replay');
    assert.equal(typeof participant?.entryId, 'string',
      'setup: the participant names its entry');
    assert.deepEqual({failureCode: reused.failureCode,
      entryId: reused.entryId}, {failureCode: STATEMENT_MISMATCH_CODE,
      entryId: participant?.entryId},
    'the engine\'s summary of its one participant carries its code and entry');
    assert.deepEqual({value: replica.valueOf('op-reused'),
      second: replica.applications(second), first:
        replica.applications(first)}, {value: 'first', second: 0, first: 1},
    'the second statement is not applied and the first stays applied once');
  });
});

test('F4: a committed entry whose key is settled for a different statement ' +
  'is consumed without being applied or reported committed',
{timeout: TEST_TIMEOUT_MS}, async () => {
  await withClient('identity-reused-entry', async ({replica, client}) => {
    await client.engine.executeQuery(INSERT_ROW_SQL, ['op-entry', 'seed']);
    const first = {sql: UPDATE_ROW_SQL, params: ['first', 'op-entry']};
    const second = {sql: UPDATE_ROW_SQL, params: ['second', 'op-entry']};
    const applied = await client.engine.executeQuery(first.sql, first.params,
      {idempotencyKey: 'client-key-entry'});
    assert.equal(applied.success, true, 'setup: the first update applied');
    const [entryId] = replica.entryIdsSentFor(first);
    const reported = [];
    replica.service.on(PARTITION_SERVICE_EVENT.ENTRY_COMMITTED,
      ({command}) => reported.push(command));
    // A second proposal of the entryId, for another statement, reaches the
    // application (proposed before the first was applied where it was).
    replica.commitCommand(buildPartitionWriteEntry({
      type: PARTITION_SERVICE_OPERATION.UPDATE, ...second, entryId},
    {proposedBy: replica.replicaId}));
    assert.deepEqual({value: replica.valueOf('op-entry'),
      second: replica.applications(second)}, {value: 'first', second: 0},
    'the second statement is not applied');
    assert.deepEqual(reported.filter((command) =>
      command.params?.[0] === second.params[0]), [],
    'the second statement is never reported committed');
  }, {releasable: true});
});

test('F14: a submission under a pending write\'s key with another statement ' +
  'is refused, typed, and never joined to its answer; the same statement ' +
  'joins it', {timeout: TEST_TIMEOUT_MS}, async () => {
  await withClient('identity-concurrent-key', async ({replica, client}) => {
    await client.engine.executeQuery(INSERT_ROW_SQL, ['op-concurrent', 'seed']);
    const first = {sql: UPDATE_ROW_SQL, params: ['first', 'op-concurrent']};
    const second = {sql: UPDATE_ROW_SQL, params: ['second', 'op-concurrent']};
    const [applied, other] = await submitConcurrently(client, replica,
      [first, second], 'client-key-concurrent');
    assert.equal(applied.success, true, 'setup: the first update applied');
    const refused = participantOf(other);
    assert.deepEqual({success: other.success,
      failureCode: refused?.failureCode}, {success: false,
      failureCode: STATEMENT_MISMATCH_CODE},
    `the other statement is refused, typed (${JSON.stringify(refused)})`);
    assert.deepEqual({value: replica.valueOf('op-concurrent'),
      first: replica.applications(first),
      second: replica.applications(second)},
    {value: 'first', first: 1, second: 0},
    'only the first statement is applied, once');
    const same = {sql: UPDATE_ROW_SQL, params: ['same', 'op-concurrent']};
    const [once, joined] = await submitConcurrently(client, replica,
      [same, same], 'client-key-concurrent-same');
    assert.deepEqual({success: joined.success,
      logIndex: participantOf(joined)?.logIndex}, {success: true,
      logIndex: participantOf(once)?.logIndex},
    'the same statement joins the pending write\'s answer');
    assert.equal(replica.applications(same), 1, 'and is applied once');
  });
});

test('F16: a replay names how its outcome row binds the statement asking, ' +
  'from the partition to the admin receipt', {timeout: TEST_TIMEOUT_MS},
async () => {
  await withClient('identity-replay-binding', async ({replica, client}) => {
    await client.engine.executeQuery(INSERT_ROW_SQL, ['op-binding', 'seed']);
    const first = {sql: UPDATE_ROW_SQL, params: ['first', 'op-binding']};
    const other = {sql: UPDATE_ROW_SQL, params: ['other', 'op-binding']};
    const idempotencyKey = 'client-key-binding';
    const applied = await client.engine.executeQuery(first.sql, first.params,
      {idempotencyKey});
    const [entryId] = replica.entryIdsSentFor(first);
    // What a replay is answered with: on the wire, at the engine, in the
    // admin receipt, and by the partition itself asked for the statement the
    // wire carried.
    const bindingsOf = async (statement, queryId) => {
      const answer = await client.engine.executeQuery(statement.sql,
        statement.params, {idempotencyKey});
      const delivered = client.router.deliveries.at(-1);
      const direct = await replica.service.executeQuery(delivered.sql,
        delivered.params, {entryId});
      return {
        replay: participantOf(answer)?.idempotentReplay,
        partition: direct?.statementBinding,
        wire: delivered.answer?.statementBinding,
        engine: participantOf(answer)?.statementBinding,
        receipt: receiptOf(answer, queryId).participantReceipts[0]
          ?.statementBinding,
      };
    };
    const bound = PARTITION_COMMITTED_STATEMENT_BINDING.SAME_STATEMENT;
    assert.deepEqual(await bindingsOf(first, 'q-bound'), {replay: true,
      partition: bound, wire: bound, engine: bound, receipt: bound},
    'a replay of the statement its row bound names the same statement');
    // The row as a replica holds one recorded before the digest was.
    unrecordColumn(replica, DIGEST_COLUMN, participantOf(applied).logIndex);
    const unrecorded = PARTITION_COMMITTED_STATEMENT_BINDING.UNRECORDED;
    assert.deepEqual(await bindingsOf(other, 'q-unrecorded'), {replay: true,
      partition: unrecorded, wire: unrecorded, engine: unrecorded,
      receipt: unrecorded},
    'a replay of a row that recorded no binding says so, at every layer');
    assert.deepEqual({value: replica.valueOf('op-binding'),
      other: replica.applications(other)}, {value: 'first', other: 0},
    'the replay applied nothing');
  });
});

// Verification round 3, F19: a statement whose parameters the proposal codec
// cannot encode never enters consensus: it is refused, typed with the
// codec's own code, before it is joined to a write pending under its
// entryId - in process and over the wire (the replica's transport handler)
// alike, pending or not - and nothing of it is applied.
async function answerOrThrow(call) {
  try {
    return {threw: false, answer: await call()};
  } catch (error) {
    return {threw: true, answer: {error: error.message, code: error.code}};
  }
}

test('F19: an unencodable statement is refused, typed, before the pending ' +
  'join, in process and over the wire', {timeout: TEST_TIMEOUT_MS},
async () => {
  await withClient('identity-unencodable', async ({replica, client}) => {
    await client.engine.executeQuery(INSERT_ROW_SQL, ['op-bigint', 'seed']);
    const unencodable = [BigInt(10), 'op-bigint'];
    const direct = (entryId) => replica.service.executeQuery(UPDATE_ROW_SQL,
      unencodable, {entryId});
    const overTheWire = (entryId) => replica.network.deliver(replica.address,
      {type: QUERY_MESSAGE_TYPE.QUERY, sql: UPDATE_ROW_SQL,
        params: unencodable, [QUERY_MESSAGE_FIELD_ENTRY_ID]: entryId});
    const arrivals = observeArrivals(replica.service);
    const pendingEntryId = 'identity-unencodable-pending';
    const pending = replica.service.executeQuery(UPDATE_ROW_SQL,
      ['applied', 'op-bigint'], {entryId: pendingEntryId});
    const answers = {
      pendingDirect: await answerOrThrow(() => direct(pendingEntryId)),
      pendingWire: await answerOrThrow(() => overTheWire(pendingEntryId)),
    };
    assert.equal((await pending).success, true,
      'setup: the pending write applied');
    answers.direct = await answerOrThrow(() =>
      direct('identity-unencodable-direct'));
    answers.wire = await answerOrThrow(() =>
      overTheWire('identity-unencodable-wire'));
    assert.deepEqual(arrivals.slice(1, 3).map((arrival) => arrival.pending),
      [true, true], 'setup: the first two arrived while the write under ' +
      'their entryId was pending');
    for (const [name, {threw, answer}] of Object.entries(answers)) {
      assert.deepEqual({threw, success: answer.success,
        failureCode: answer.failureCode}, {threw: false, success: false,
        failureCode: RAFT_RS_PROPOSAL_CODEC_ERROR.UNENCODABLE},
      `${name}: refused, typed (${JSON.stringify(answer)})`);
    }
    assert.equal(replica.valueOf('op-bigint'), 'applied',
      'nothing of the unencodable statement was applied');
  });
});
