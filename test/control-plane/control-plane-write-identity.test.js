// The held instances of named control-plane writes are bounded and never
// evicted: at the bound a new named write is refused typed before it is
// delivered, and every held unresolved instance keeps its key - its next
// re-drive is still its own entry (never a blind second write).
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  CONTROL_PLANE_WRITE_IDENTITY_CAPACITY_CODE,
  captureControlPlaneWriteConfirmation,
  controlPlaneWriteIdentity,
  isControlPlaneWriteDefinitivelyUnappliedError,
  releaseControlPlaneWriteIdentities,
  runControlPlaneWrite,
} from '../../src/control-plane/control-plane-write-identity.js';
import {deriveParticipantEntryId} from '../../src/query/distributed/distributed-write-coordinator.js';
import {PARTITION_WRITE_LEADERSHIP_REFUSAL} from
  '../../src/partition/partition-write-kernel.js';

const BOUND = 4096;
const SCOPE = 'identity-bound-witness';
const ROUTE = {id: SCOPE, partitionId: null};
const PARTITION_ID = 'named-proof-p1';
function replyFor(idempotencyKey) {
  const participant = {success: true, partitionId: PARTITION_ID, affectedRows: 1,
    durableCommitWitness: {partitionId: PARTITION_ID, term: 4, logIndex: 29,
      entryId: deriveParticipantEntryId(idempotencyKey, PARTITION_ID)}};
  return {
    success: true, idempotencyKey, operationId: 'complete-statement', affectedRows: 1,
    partitions: [PARTITION_ID], mirrorPartitions: [], participantResults: [participant],
  };
}
const UNKNOWN_ANSWER = Object.freeze({success: false,
  failureCode: PARTITION_WRITE_LEADERSHIP_REFUSAL.OUTCOME_UNKNOWN,
  entryId: 'entry-unknown'});

test('at the bound a new named write is refused typed before delivery; no ' +
  'unresolved instance is evicted', async () => {
  const keys = [];
  try {
    for (let index = 0; index < BOUND; index += 1) {
      await runControlPlaneWrite(
        {writeIdentity: controlPlaneWriteIdentity(SCOPE, index)},
        {index}, ROUTE, async (_content, key) => {
          keys.push(key);
          return UNKNOWN_ANSWER;
        });
    }
    let delivered = false;
    const refused = await runControlPlaneWrite(
      {writeIdentity: controlPlaneWriteIdentity(SCOPE, 'one-more')},
      {index: 'one-more'}, ROUTE, async (_content, key) => {
        delivered = true;
        return replyFor(key);
      });
    assert.equal(delivered, false, 'nothing was delivered');
    assert.equal(refused.success, false, 'refused');
    assert.equal(refused.errorCode, CONTROL_PLANE_WRITE_IDENTITY_CAPACITY_CODE,
      'typed');
    assert.equal(refused.heldWriteIdentityBound, BOUND, 'it reports the bound');
    assert.equal(refused.heldWriteIdentities, BOUND, 'and what is held');
    let redriveKey = null;
    await runControlPlaneWrite(
      {writeIdentity: controlPlaneWriteIdentity(SCOPE, 0)}, {index: 0}, ROUTE,
      async (_content, key) => {
        redriveKey = key;
        return UNKNOWN_ANSWER;
      });
    assert.equal(redriveKey, keys[0], 'the oldest unresolved instance is ' +
      'still held: its re-drive is its own entry');
  } finally {
    releaseControlPlaneWriteIdentities(SCOPE);
  }
  let afterRelease = null;
  await runControlPlaneWrite(
    {writeIdentity: controlPlaneWriteIdentity(SCOPE, 0)}, {index: 0}, ROUTE,
    async (_content, key) => {
      afterRelease = key;
      return replyFor(key);
    });
  assert.notEqual(afterRelease, keys[0], 'a released name is a new instance');
});

test('a durable confirmation can release only the exact observed instance and effect', async () => {
  const name = controlPlaneWriteIdentity(SCOPE, 'confirmed-instance');
  const first = {publication: 'first-content'};
  const second = {publication: 'second-content'};
  const keys = [];
  const unknown = async (_content, key) => {
    keys.push(key);
    return UNKNOWN_ANSWER;
  };
  const write = (effect) => runControlPlaneWrite({
    writeIdentity: name, confirmWriteEffect: (observed) => observed === effect,
  }, effect, ROUTE, unknown);
  try {
    await write(first);
    const delayed = captureControlPlaneWriteConfirmation(name);
    await runControlPlaneWrite({writeIdentity: name}, first, ROUTE,
      async (_content, key) => replyFor(key));
    await write(second);

    const current = captureControlPlaneWriteConfirmation(name);
    assert.equal(delayed(first), false, 'an earlier read cannot clear the successor');
    assert.equal(current(first), false, 'the same name does not prove the effect');
    await write(second);
    assert.equal(keys[2], keys[1], 'either unconfirmed read preserves the retained instance');
    assert.equal(current(second), true);
    await write(second);
    assert.notEqual(keys[3], keys[1], 'exact authoritative readback retires the retained instance');
  } finally {
    releaseControlPlaneWriteIdentities(SCOPE);
  }
});

test('incomplete or foreign SQL receipts cannot release an unresolved named entry', async () => {
  const name = controlPlaneWriteIdentity(SCOPE, 'bound-participant-receipt');
  const route = {id: SCOPE, partitionId: PARTITION_ID};
  const write = (attempt) =>
    runControlPlaneWrite({writeIdentity: name}, {mutation: 1}, route, attempt);
  let entryId;
  let key;
  try {
    await write(async (_content, actualKey) => {
      key = actualKey;
      entryId = deriveParticipantEntryId(key, PARTITION_ID);
      return {...UNKNOWN_ANSWER, partitionId: PARTITION_ID, entryId};
    });
    const valid = replyFor(key);
    const [participant] = valid.participantResults;
    const empty = {...valid, partitions: [], participantResults: []};
    const foreignPartition = 'foreign-p1';
    const foreign = {partitionId: foreignPartition,
      entryId: deriveParticipantEntryId(key, foreignPartition)};
    for (const reply of [
      empty, {...empty, affectedRows: 0}, {...valid, affectedRows: 2},
      {...valid, participantResults: [{...participant,
        durableCommitWitness: {...participant.durableCommitWitness, entryId: 'another-entry'}}]},
      {...UNKNOWN_ANSWER, ...foreign},
    ]) {
      const answer = await write(async (_content, actualKey) => {
        assert.equal(actualKey, key);
        return reply;
      });
      assert.equal(answer.success, false);
      assert.equal(answer.pendingInstance.entryId, entryId);
    }
    const result = await write(async (_content, actualKey) => replyFor(actualKey));
    assert.equal(result.success, true);
    const next = await write(async (_content, actualKey) => replyFor(actualKey));
    assert.notEqual(next.idempotencyKey, key);
  } finally {
    releaseControlPlaneWriteIdentities(SCOPE);
  }
});

test('only the bound named verdict can prove an incarnation write unapplied', async () => {
  const name = controlPlaneWriteIdentity(SCOPE, 'exact-refusal');
  const route = {id: SCOPE, partitionId: PARTITION_ID};
  const write = (attempt) => runControlPlaneWrite({writeIdentity: name}, {}, route, attempt);
  const refusal = (key, failureCode) => ({success: false, failureCode, partitionId: PARTITION_ID,
    entryId: deriveParticipantEntryId(key, PARTITION_ID)});
  try {
    const notProposed = await write(async (_body, key) =>
      refusal(key, PARTITION_WRITE_LEADERSHIP_REFUSAL.NOT_LEADER));
    assert.equal(isControlPlaneWriteDefinitivelyUnappliedError(notProposed), true);

    for (const code of [PARTITION_WRITE_LEADERSHIP_REFUSAL.RESERVED,
      PARTITION_WRITE_LEADERSHIP_REFUSAL.CONSENSUS_HOST_FAILURE,
      PARTITION_WRITE_LEADERSHIP_REFUSAL.NOT_LEADER]) {
      const pending = await write(async (_body, key) => refusal(key, code));
      assert.equal(isControlPlaneWriteDefinitivelyUnappliedError(pending), false);
    }
    const failed = await write(async (_body, key) => ({
      ...refusal(key, 'SQLITE_CONSTRAINT_NOTNULL'), outcome: 'statement_failed',
      committed: true, logIndex: 28,
    }));
    assert.equal(isControlPlaneWriteDefinitivelyUnappliedError(failed), true);
  } finally {
    releaseControlPlaneWriteIdentities(SCOPE);
  }
});
