// Dead-recipient measure 1 (owner ruling 2026-11-11): the retirement reserve of
// the CDC owed-work admission. Real partition write path, entry builder,
// admission owner and committed apply on controllable-port replicas; the
// committed order is applied by the test (consensus is the substitute).
// The full lifecycle-owner chain is witnessed in
// partition-cdc-retirement-reserve-witness.test.js.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {PARTITION_CDC_OBLIGATION_BOUND as BOUND} from
  '../../src/partition/partition-cdc-obligation-constants.js';
import {countCdcObligations} from '../../src/partition/partition-cdc-obligation-ledger.js';
import {PARTITION_WRITE_LEADERSHIP_REFUSAL as REFUSAL, isRetryableWriteFailureCode} from
  '../../src/partition/partition-write-kernel.js';
import {PARTITION_CDC_ADMISSION_LOG_MSG, committedCdcAdmissionClassOf} from
  '../../src/partition/partition-cdc-owed-admission.js';
import {CDC_ADMISSION_CLASS_ERROR, CDC_ADMISSION_CLASS_FIELD, CDC_ADMISSION_CLASS_REFUSAL_REASON,
  PARTITION_CDC_ADMISSION_CLASS as CLASS} from '../../src/partition/partition-cdc-admission-class.js';
import {PARTICIPANT_TRANSACTION_COMMAND} from
  '../../src/partition/partition-participant-transaction-constants.js';
import {STATEMENT_INGRESS, STATEMENT_INGRESS_FIELD} from '../../src/query/sql-statement-ingress.js';
import {QUERY_ERROR_CODE, QUERY_MESSAGE_TYPE} from '../../src/query/query-constants.js';
import {INSERT_SQL, REPLICAS, awaitProposal, clearFixtureSingletons, resetFixtureSingletons, settleTicks,
  shutdownAll, startLeader, startReplica, track} from
  '../test-helpers/participant-transaction-fixture.js';
import {commitOnAll, upsertOf} from '../test-helpers/cdc-hydration-handoff-fixture.js';
import {CDC, OWED_CAPACITY, WRITE_SQL, fillDebt} from '../test-helpers/cdc-owed-admission-fixture.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

const RESERVE = BOUND.OWED_RETIREMENT_RESERVE_EVENTS;
const RETIREMENT = Object.freeze({[CDC_ADMISSION_CLASS_FIELD]: CLASS.RECIPIENT_RETIREMENT});
const owedOf = (replica) => countCdcObligations(replica.db).owed;

function captureLogs(service) {
  const lines = [];
  for (const level of ['info', 'warn']) {
    const original = service.logger[level].bind(service.logger);
    service.logger[level] = (message, context) => {
      lines.push({level, message, context});
      return original(message, context);
    };
  }
  return lines;
}

// A committed retirement entry, as the leader builds one for a classified write.
const retirementUpsertOf = (leader, tag, index) => ({...upsertOf(leader, tag, index),
  ...RETIREMENT});

test('at OWED_MAX_EVENTS an ordinary write is refused CDC_CAPACITY and proposes nothing; a ' +
  'recipient-retirement write is admitted from the reserve, logged, and commits alike on ' +
  'every replica', async () => {
  const {leader, proposed} = await startLeader(CDC);
  const follower = await startReplica(REPLICAS[1], CDC);
  try {
    fillDebt(leader, OWED_CAPACITY, [follower]);
    const logs = captureLogs(leader);
    const ordinary = track(leader.executeQuery(WRITE_SQL, ['ordinary', 'v'],
      {entryId: 'ordinary-at-cap'}));
    await settleTicks();
    assert.equal(ordinary.value?.failureCode, REFUSAL.CDC_CAPACITY);
    assert.equal(proposed.some((entry) => entry.entryId === 'ordinary-at-cap'), false);

    const retiring = track(leader.executeQuery(WRITE_SQL, ['retiring', 'stopped'],
      {entryId: 'retiring-at-cap', ...RETIREMENT}));
    const entry = await awaitProposal(proposed, (command) => command.entryId === 'retiring-at-cap');
    assert.equal(entry?.[CDC_ADMISSION_CLASS_FIELD], CLASS.RECIPIENT_RETIREMENT,
      'the committed entry carries its class');
    assert.deepEqual(commitOnAll([leader, follower], entry), [null, null]);
    await settleTicks();
    assert.equal(retiring.value?.success, true, 'the retirement write committed');
    assert.deepEqual([owedOf(leader), owedOf(follower)], [OWED_CAPACITY + 1, OWED_CAPACITY + 1],
      'both replicas applied it from the reserve');
    const used = logs.find((line) => line.message === PARTITION_CDC_ADMISSION_LOG_MSG.RESERVE_USED);
    assert.deepEqual({owed: used?.context.owed, tableName: used?.context.tableName,
      admissionClass: used?.context.admissionClass, required: used?.context.required},
    {owed: OWED_CAPACITY, tableName: CDC.tableName, admissionClass: CLASS.RECIPIENT_RETIREMENT,
      required: 1}, 'the reserve use names the owed depth, the table and the class');

    // Apply decides from the entry's bytes: the same statement without the
    // field (an ordinary entry, as every earlier build wrote one) is consumed
    // without effect on both replicas at the cap.
    const ordinaryEntry = upsertOf(leader, 'old-format', 1);
    assert.equal(committedCdcAdmissionClassOf(ordinaryEntry), CLASS.ORDINARY);
    assert.equal(committedCdcAdmissionClassOf({type: PARTICIPANT_TRANSACTION_COMMAND.PREPARE,
      ...RETIREMENT}), CLASS.ORDINARY, 'a participant command carries no class');
    commitOnAll([leader, follower], ordinaryEntry);
    assert.deepEqual([owedOf(leader), owedOf(follower)], [OWED_CAPACITY + 1, OWED_CAPACITY + 1],
      'an entry without the class is ordinary on every replica');
  } finally {
    await shutdownAll(leader, follower);
  }
});

test('the reserve is bounded: past OWED_MAX_EVENTS + OWED_RETIREMENT_RESERVE_EVENTS a ' +
  'retirement write is refused with its own retryable code and logged', async () => {
  const {leader, proposed} = await startLeader(CDC);
  try {
    fillDebt(leader, OWED_CAPACITY);
    for (let index = 0; index < RESERVE; index += 1) {
      commitOnAll([leader], retirementUpsertOf(leader, 'reserve', index));
    }
    assert.equal(owedOf(leader), OWED_CAPACITY + RESERVE, 'the reserve admitted exactly its size');
    commitOnAll([leader], retirementUpsertOf(leader, 'past-reserve', 0));
    assert.equal(owedOf(leader), OWED_CAPACITY + RESERVE,
      'a committed retirement entry past the reserve is consumed without effect');
    const logs = captureLogs(leader);
    const refused = track(leader.executeQuery(WRITE_SQL, ['retiring', 'stopped'],
      {entryId: 'retiring-past-reserve', ...RETIREMENT}));
    await settleTicks();
    assert.deepEqual({failureCode: refused.value?.failureCode,
      deferRetry: refused.value?.deferRetry,
      retryable: isRetryableWriteFailureCode(refused.value?.failureCode)},
    {failureCode: REFUSAL.CDC_RETIREMENT_RESERVE_EXHAUSTED, deferRetry: true, retryable: true});
    assert.equal(proposed.some((entry) => entry.entryId === 'retiring-past-reserve'), false);
    assert.equal(logs.some((line) => line.level === 'warn' &&
      line.message === PARTITION_CDC_ADMISSION_LOG_MSG.RESERVE_EXHAUSTED &&
      line.context.owed === OWED_CAPACITY + RESERVE), true);
  } finally {
    await shutdownAll(leader);
  }
});

test('the partition refuses a class it may not carry: client ingress or an unknown value; the ' +
  'remote QUERY request carries a valid one into the entry', async () => {
  const {leader, proposed} = await startLeader(CDC);
  try {
    const client = await leader.executeQuery(WRITE_SQL, ['c', 'v'], {entryId: 'client-class',
      ...RETIREMENT, [STATEMENT_INGRESS_FIELD]: STATEMENT_INGRESS.CLIENT});
    const invalid = await leader.executeQuery(WRITE_SQL, ['i', 'v'], {entryId: 'invalid-class',
      [CDC_ADMISSION_CLASS_FIELD]: CLASS.ORDINARY});
    // A client write to this system table is refused by the system-table
    // ingress rule first; a classified client write to any other table by
    // the class rule (engine-entry witness in cdc-admission-class-hops).
    const {leader: userLeader, proposed: userProposed} = await startLeader();
    let userTable;
    try {
      userTable = await userLeader.executeQuery(INSERT_SQL, ['u', 'v'],
        {entryId: 'client-user-class', ...RETIREMENT,
          [STATEMENT_INGRESS_FIELD]: STATEMENT_INGRESS.CLIENT});
      assert.equal(userProposed.length, 0);
    } finally {
      await shutdownAll(userLeader);
    }
    assert.deepEqual([client.errorCode, client.reasonCode, invalid.errorCode, invalid.reasonCode],
      [QUERY_ERROR_CODE.SYSTEM_TABLE_WRITE_REFUSED,
        CDC_ADMISSION_CLASS_REFUSAL_REASON.CLIENT_INGRESS,
        CDC_ADMISSION_CLASS_ERROR.REFUSED, CDC_ADMISSION_CLASS_REFUSAL_REASON.INVALID_VALUE]);
    assert.deepEqual([userTable.errorCode, userTable.reasonCode],
      [CDC_ADMISSION_CLASS_ERROR.REFUSED, CDC_ADMISSION_CLASS_REFUSAL_REASON.CLIENT_INGRESS],
      'a client may not declare the class on any table');
    assert.equal(proposed.length, 0, 'nothing was proposed');
    track(leader.handleRemoteQuery({type: QUERY_MESSAGE_TYPE.QUERY, sql: WRITE_SQL,
      params: ['r', 'v'], entryId: 'remote-retirement', ...RETIREMENT}));
    const entry = await awaitProposal(proposed, (command) => command.entryId === 'remote-retirement');
    assert.equal(entry?.[CDC_ADMISSION_CLASS_FIELD], CLASS.RECIPIENT_RETIREMENT,
      'the remote query hop carries the class');
    track(leader.executeQuery(WRITE_SQL, ['o', 'v'], {entryId: 'plain'}));
    const plain = await awaitProposal(proposed, (command) => command.entryId === 'plain');
    assert.equal(Object.hasOwn(plain, CDC_ADMISSION_CLASS_FIELD), false,
      'an ordinary entry carries no class field');
  } finally {
    await shutdownAll(leader);
  }
});
