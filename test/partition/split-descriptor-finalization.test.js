// The controlled consensus port holds proposals so pending joins, mismatched
// entries and replay can be observed separately. The SQL applier, CDC ledger,
// participant generation and committed outcomes use the production partition.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {INITIAL_PARTITION_IDS, PARTITIONS_SCHEMA, SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {
  deriveParticipantEntryId,
  SPLIT_DESCRIPTOR_ERROR as ERROR, SPLIT_DESCRIPTOR_FINALIZE_SQL as SQL,
  splitDescriptorWriteKey,
} from '../../src/partition/partition-split-descriptor-command.js';
import {readCommittedStatementOutcome} from '../../src/partition/partition-committed-statement-outcome.js';
import {PARTITION_WRITE_LEADERSHIP_REFUSAL} from '../../src/partition/partition-service-constants.js';
import {countCdcObligations} from '../../src/partition/partition-cdc-obligation-ledger.js';
import {readPartitionWriteGeneration} from '../../src/partition/partition-participant-transaction-store.js';
import {applyCommitted, awaitProposal, clearFixtureSingletons, REPLICAS, resetFixtureSingletons,
  shutdownAll, startLeader, startReplica, track} from '../test-helpers/participant-transaction-fixture.js';

const partitionId = INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.PARTITIONS];
const subject = Object.freeze({action: 'finalizeChild', tableId: 'tbl-users',
  partitionId: 'users-p-left', workflowId: 'split-users', workflowAttempt: 1});
const optionsFor = (intent) => {
  const key = splitDescriptorWriteKey(intent);
  return {splitDescriptorIntent: intent, idempotencyKey: key,
    entryId: deriveParticipantEntryId(key, partitionId)};
};
const paramsFor = (intent) => [intent.tableId, intent.workflowAttempt, intent.partitionId];
const descriptorRow = (service) => service.db.prepare('SELECT * FROM partitions WHERE partition_id = ?').get(subject.partitionId);
const record = (service, entryId) =>
  readCommittedStatementOutcome(service, service.getCommittedEntryKey({entryId}));
function effectCounts(service) {
  const {owed, delivered} = countCdcObligations(service.db);
  return {events: owed + delivered, generation: readPartitionWriteGeneration(service.db)};
}

function seed(service, attempt) {
  assert.equal(applyCommitted(service, {type: 'QUERY', entryId: 'seed-' + attempt,
    sql: 'INSERT INTO partitions (table_id, partition_id, split_descriptor_attempt, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    params: [subject.tableId, subject.partitionId, attempt, 1, 1],
    timestamp: service.hlcClock.now().toString(), proposedBy: service.replicaId, proposedAt: 0}),
  null);
}

async function holdProposal(service, proposed, intent) {
  const options = optionsFor(intent);
  const pending = track(service.executeQuery(SQL, paramsFor(intent), options));
  const command = await awaitProposal(proposed, (entry) => entry.entryId === options.entryId);
  assert.ok(command, 'destination proposes the exact child effect');
  return {command, pending};
}

async function onPartitions(body) {
  const {leader, proposed} = await startLeader({tableName: SYSTEM_TABLE_NAME.PARTITIONS,
    schema: PARTITIONS_SCHEMA}, partitionId);
  try {
    await body(leader, proposed);
  } finally {
    await shutdownAll(leader);
  }
}

// A replica of the PARTITIONS owner partition that is not its leader and has
// no transport: a write it cannot refuse itself fails as having no leader.
async function onPartitionsFollower(body) {
  const follower = await startReplica(REPLICAS[1], {tableName: SYSTEM_TABLE_NAME.PARTITIONS,
    schema: PARTITIONS_SCHEMA}, partitionId);
  try {
    await body(follower);
  } finally {
    await shutdownAll(follower);
  }
}

// Two claims of descriptor identity that do not decode as a descriptor: the
// key of the subject without its intent, and the intent with another attempt.
function malformedClaimsOf(intent) {
  const {splitDescriptorIntent, ...keyOnly} = optionsFor(intent);
  assert.deepEqual(splitDescriptorIntent, intent);
  return [
    {options: keyOnly, params: paramsFor(intent)},
    {options: optionsFor(intent), params: [intent.tableId, 2, intent.partitionId]},
  ];
}

const BYTES_REFUSAL = Object.freeze({success: false, error: ERROR.BYTES, errorCode: ERROR.BYTES,
  failureCode: ERROR.BYTES, retryable: false, deferRetry: false});

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

test('child finalization binds pending and settled answers, actual DELETE and committed replay',
  () => onPartitions(async (service, proposed) => {
    seed(service, 1);
    const before = effectCounts(service);
    const {command, pending} = await holdProposal(service, proposed, subject);
    const options = optionsFor(subject);
    const joined = service.executeQuery(SQL, paramsFor(subject), options);
    const ordinary = {type: 'QUERY', entryId: options.entryId,
      sql: 'DELETE FROM partitions WHERE partition_id = ?', params: [subject.partitionId]};
    assert.equal((await service.applyWrite(ordinary)).failureCode, ERROR.COLLISION);
    const {splitDescriptorIntent, ...stripped} = command;
    assert.deepEqual(splitDescriptorIntent, subject);
    assert.equal((await service.applyWrite(stripped)).failureCode, ERROR.BYTES);
    assert.equal((await service.applyWrite({...command,
      params: [subject.tableId, 2, subject.partitionId]})).failureCode,
    ERROR.BYTES);
    assert.equal(proposed.filter((entry) => entry.entryId === options.entryId).length, 1);
    assert.equal(descriptorRow(service).split_descriptor_attempt, 1);
    assert.equal(applyCommitted(service, command), null);
    const first = await pending.promise;
    assert.equal(first.success, true);
    assert.equal(first.committed, true);
    assert.deepEqual(first.splitDescriptorReceipt, {...subject, disposition: 'deleted'});
    assert.deepEqual(await joined, first);
    assert.equal(descriptorRow(service), undefined);
    assert.deepEqual(effectCounts(service),
      {events: before.events + 1, generation: before.generation + 1});
    const held = record(service, command.entryId);
    assert.deepEqual(JSON.parse(held.ownerResultText), first.splitDescriptorReceipt);
    assert.ok(held.commandDigest);
    seed(service, 30);
    const successor = descriptorRow(service);
    const successorEffects = effectCounts(service);
    assert.equal(applyCommitted(service, command), null);
    assert.equal(applyCommitted(service, {...ordinary, proposedBy: service.replicaId,
      timestamp: service.hlcClock.now().toString(), proposedAt: 0}), null);
    const replay = await service.executeQuery(SQL, paramsFor(subject), options);
    assert.equal(replay.success, true);
    assert.deepEqual(replay.splitDescriptorReceipt, first.splitDescriptorReceipt);
    assert.equal(replay.logIndex, first.logIndex);
    assert.equal(replay.term, first.term);
    assert.equal((await service.applyWrite(ordinary)).failureCode, ERROR.COLLISION);
    assert.deepEqual(descriptorRow(service), successor);
    assert.deepEqual(effectCounts(service), successorEffects);
    assert.deepEqual(record(service, command.entryId), held);
  }));

test('committed apply refuses a descriptor claim that does not decode and applies nothing of it',
  () => onPartitions(async (service, proposed) => {
    seed(service, 1);
    const before = effectCounts(service);
    const {command, pending} = await holdProposal(service, proposed, subject);
    const {splitDescriptorIntent, ...stripped} = command;
    assert.deepEqual(splitDescriptorIntent, subject);
    // Every replica applying either committed entry refuses it typed (the
    // application fails closed) instead of running its DELETE as an ordinary
    // statement: the descriptor row, the generation, the CDC ledger and the
    // entry's outcome record stay as they were.
    const otherAttempt = {...command, params: [subject.tableId, 2, subject.partitionId]};
    for (const malformed of [stripped, otherAttempt]) {
      assert.equal(applyCommitted(service, malformed), ERROR.BYTES);
      assert.equal(descriptorRow(service).split_descriptor_attempt, 1);
      assert.deepEqual(effectCounts(service), before);
      assert.equal(record(service, command.entryId).state, 'unsettled');
    }
    // The proposer's waiter of that entry learns of the failed application:
    // its outcome is unknown (only a retry under its entryId is idempotent),
    // caused by the refusal.
    const answer = await pending.promise;
    assert.equal(answer.success, false);
    assert.equal(answer.failureCode, PARTITION_WRITE_LEADERSHIP_REFUSAL.OUTCOME_UNKNOWN);
    assert.equal(answer.entryId, command.entryId);
    assert.equal(answer.cause.failureCode, ERROR.BYTES);
  }));

test('submission refuses a descriptor claim that does not decode before it is proposed',
  () => onPartitionsFollower(async (follower) => {
    for (const {options, params} of malformedClaimsOf(subject)) {
      // Refused where it is submitted: a follower that cannot reach a leader
      // answers the typed refusal, not a failure to find a leader.
      assert.deepEqual(await follower.executeQuery(SQL, params, options), BYTES_REFUSAL);
    }
  }));

test('a remote query with a descriptor claim it does not carry as a plain write is refused at ingress',
  () => onPartitionsFollower(async (follower) => {
    const [{options: keyOnly}] = malformedClaimsOf(subject);
    const options = optionsFor(subject);
    const write = {type: 'QUERY', sql: SQL, params: paramsFor(subject)};
    for (const payload of [
      {...write, ...keyOnly},
      {...write, ...options, migrationOperation: 'ALTER_TABLE'},
      {type: 'QUERY', sql: 'SELECT * FROM partitions WHERE partition_id = ?',
        params: [subject.partitionId], ...options},
    ]) {
      // Refused before routing: a follower answers the typed refusal, not a
      // redirect to its leader or a missing-leader refusal.
      assert.deepEqual(await follower.handleRemoteQuery(payload), BYTES_REFUSAL);
    }
  }));

test('zero-row child finalization distinguishes absence, supersession and unresolved ownership',
  () => onPartitions(async (service, proposed) => {
    seed(service, 30);
    const successor = descriptorRow(service);
    const before = effectCounts(service);
    for (const [intent, disposition] of [
      [subject, 'superseded'],
      [{...subject, partitionId: 'users-p-right'}, 'absent'],
      [{...subject, workflowAttempt: 31}, null],
      [{...subject, tableId: 'different-table'}, null],
    ]) {
      const {command, pending} = await holdProposal(service, proposed, intent);
      assert.equal(applyCommitted(service, command), null);
      const answer = await pending.promise;
      if (disposition === null) {
        assert.equal(answer.failureCode, ERROR.UNRESOLVED);
        assert.equal(answer.deferRetry, true);
        assert.equal(record(service, command.entryId).state, 'unsettled');
      } else {
        assert.equal(answer.changes, 0);
        assert.deepEqual(answer.splitDescriptorReceipt, {...intent, disposition});
        assert.equal(record(service, command.entryId).state, 'settled');
      }
    }
    assert.deepEqual(descriptorRow(service), successor);
    assert.deepEqual(effectCounts(service), before);
  }));

test('a committed ordinary entry cannot settle a pending protected caller under the same ID',
  () => onPartitions(async (service, proposed) => {
    seed(service, 1);
    const {command, pending} = await holdProposal(service, proposed, subject);
    // The former proposer had already dispatched this ordinary entry. Commit
    // it first and deliver the new proposer's protected entry afterward.
    assert.equal(applyCommitted(service, {type: 'QUERY', entryId: command.entryId,
      sql: 'UPDATE partitions SET updated_at = ? WHERE partition_id = ?', params: [2, subject.partitionId],
      timestamp: service.hlcClock.now().toString(), proposedBy: service.replicaId, proposedAt: 0}),
    null);
    assert.equal((await pending.promise).failureCode, ERROR.COLLISION);
    const ordinaryRecord = record(service, command.entryId);
    assert.equal(ordinaryRecord.commandDigest, undefined);
    assert.equal(applyCommitted(service, command), null);
    const refused = await service.executeQuery(SQL, paramsFor(subject), optionsFor(subject));
    assert.equal(refused.failureCode, ERROR.COLLISION);
    assert.deepEqual(record(service, command.entryId), ordinaryRecord);
    assert.equal(descriptorRow(service).updated_at, 2);
  }));

test('a protected commit cannot acknowledge an ordinary waiter under the same ID',
  () => onPartitions(async (service, proposed) => {
    seed(service, 1);
    const options = optionsFor(subject);
    const pending = track(service.executeQuery('UPDATE partitions SET updated_at = ? WHERE partition_id = ?',
      [2, subject.partitionId], {entryId: options.entryId}));
    const ordinary = await awaitProposal(proposed, (entry) => entry.entryId === options.entryId);
    assert.ok(ordinary);
    const beforeApply = await service.executeQuery(SQL, paramsFor(subject), options);
    assert.equal(beforeApply.failureCode, ERROR.COLLISION);
    assert.equal(applyCommitted(service, {type: 'QUERY', sql: SQL, params: paramsFor(subject),
      ...options, proposedBy: service.replicaId, proposedAt: 0,
      timestamp: service.hlcClock.now().toString()}), null);
    assert.equal((await pending.promise).failureCode, ERROR.COLLISION);
    const held = record(service, options.entryId);
    assert.deepEqual(JSON.parse(held.ownerResultText), {...subject, disposition: 'deleted'});
    assert.equal(applyCommitted(service, ordinary), null);
    assert.deepEqual(record(service, options.entryId), held);
    assert.equal(descriptorRow(service), undefined);
  }));
