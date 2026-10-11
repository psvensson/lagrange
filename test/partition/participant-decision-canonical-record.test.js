import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {test} from 'node:test';
import {buildDecisionRecord, canonicalDecisionRecord, decisionBindingRefusalOf} from
  '../../src/partition/partition-participant-transaction-bytes.js';

const transactionId = 'recorded-transaction';
const participantId = `${transactionId}:a`;
const preparedDigest = 'b'.repeat(64);
function binding(participants, decision = 'COMMIT', textOf = JSON.stringify) {
  const decisionText = textOf({transactionId, decision, participants});
  return {transactionId, participantId, preparedDigest, decision, decisionText,
    decisionDigest: createHash('sha256').update(decisionText).digest('hex')};
}

test('TX1 Q1: canonical real recorded text binds the participant', () => {
  assert.equal(decisionBindingRefusalOf(binding([[participantId,
    preparedDigest]])), null);
});

test('TX1 Q1: builder and reader share exact deeply frozen canonical bytes', () => {
  const record = buildDecisionRecord(transactionId, 'COMMIT',
    [[`${transactionId}:z`, preparedDigest], [participantId, preparedDigest]]);
  assert.deepEqual(canonicalDecisionRecord(record), record);
  assert.equal(record.participants[0][0], participantId);
  assert.ok(Object.isFrozen(record));
  assert.ok(Object.isFrozen(record.participants));
  assert.ok(record.participants.every(Object.isFrozen));
  assert.equal(canonicalDecisionRecord({...record, transactionId: 'wrong'}), null);
  assert.equal(buildDecisionRecord(transactionId, 'COMMIT', [[participantId, null]]),
    null);
  assert.equal(buildDecisionRecord(transactionId, 'COMMIT', [null]), null);
  assert.equal(buildDecisionRecord(transactionId, 'COMMIT', null), null);
});

for (const [name, participants, textOf] of [
  ['duplicate remote participant', [[participantId, preparedDigest],
    [`${transactionId}:b`, preparedDigest], [`${transactionId}:b`, preparedDigest]]],
  ['unsorted participants', [[`${transactionId}:b`, preparedDigest],
    [participantId, preparedDigest]]],
  ['null COMMIT remote digest', [[participantId, preparedDigest],
    [`${transactionId}:b`, null]]],
  ['foreign transaction participant', [[participantId, preparedDigest],
    ['wrong:b', preparedDigest]]],
  ['malformed pair', [[participantId, preparedDigest], [false]]],
  ['noncanonical text', [[participantId, preparedDigest]],
    (value) => JSON.stringify(value, null, 2)],
]) {
  test(`TX1 Q1: binding refuses ${name} in the complete record`, () => {
    assert.notEqual(decisionBindingRefusalOf(binding(participants, 'COMMIT',
      textOf)), null);
  });
}
