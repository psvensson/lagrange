// The named outcome of every terminal acknowledgement refusal (finding F1,
// 2026-11-11), on the real refusal owner with a lane in its real initial
// shape; the ledger count is read from an empty in-memory ledger.
import assert from 'node:assert/strict';
import {SQLiteConnection} from '../../src/storage/sqlite-prepared-statement-owner.js';
import {test} from 'node:test';
import {ACKNOWLEDGEMENT_REFUSAL_OUTCOME as OUTCOME, isQuarantinedObligation,
  isTerminalAcknowledgementRefusal, resolveAcknowledgementRefusal} from
  '../../src/partition/partition-cdc-acknowledgement-refusal.js';
import {createCdcObligationLane} from '../../src/partition/partition-cdc-obligation-lane.js';
import {PARTITION_CDC_OBLIGATION_FAILURE_CODE as CODE} from
  '../../src/partition/partition-cdc-obligation-constants.js';

function fixture() {
  const errors = [];
  const resumed = [];
  const lane = createCdcObligationLane('tenure-1');
  const owner = {partitionId: 'p1', replicaId: 'r1', db: new SQLiteConnection(':memory:'),
    logger: {error: (message, context) => errors.push({message, context})}};
  const members = [{eventKey: 'k1', logIndex: 5, ordinal: 0},
    {eventKey: 'k2', logIndex: 6, ordinal: 0}];
  for (const member of members) lane.pending.set(member.eventKey, member);
  lane.commands.set('ack-1', {members});
  lane.acknowledgedThrough = {logIndex: 6, ordinal: 0};
  const resolve = (failureCode, refusal = {}) => resolveAcknowledgementRefusal({owner}, lane,
    {members, entryId: 'ack-1', failureCode, refusal, proposed: true},
    () => resumed.push(failureCode)).outcome;
  return {lane, errors, resumed, resolve};
}

test('every terminal code is resolved here; transient ones are not', () => {
  for (const code of [CODE.UNKNOWN_EVENT, CODE.POSITION_MISMATCH, CODE.IDENTITY_COMPACTED,
    CODE.BYTES_INVALID, CODE.IDENTITY_MISMATCH, CODE.ORIGIN_REFUSED]) {
    assert.equal(isTerminalAcknowledgementRefusal(code), true, code);
  }
  assert.equal(isTerminalAcknowledgementRefusal(CODE.PROPOSER_UNAVAILABLE), false);
  assert.equal(isTerminalAcknowledgementRefusal(null), false);
});

test('a position refusal re-derives once (batch forgotten, lane resumes); the same position ' +
  'again is quarantined alone and the lane still resumes', () => {
  const f = fixture();
  assert.equal(f.resolve(CODE.POSITION_MISMATCH, {logIndex: 5, ordinal: 0}), OUTCOME.RE_DERIVED);
  assert.deepEqual({pending: f.lane.pending.size, commands: f.lane.commands.size,
    through: f.lane.acknowledgedThrough, held: f.lane.held, resumed: f.resumed.length},
  {pending: 0, commands: 0, through: null, held: null, resumed: 1});
  assert.equal(f.resolve(CODE.UNKNOWN_EVENT, {logIndex: 5, ordinal: 0}), OUTCOME.QUARANTINED);
  assert.equal(isQuarantinedObligation(f.lane, {logIndex: 5, ordinal: 0}), true);
  assert.equal(isQuarantinedObligation(f.lane, {logIndex: 6, ordinal: 0}), false);
  assert.equal(f.lane.held, null);
  assert.equal(f.resumed.length, 2);
  assert.equal(f.errors.length, 2, 'each outcome is raised');
});

test('the lane\'s own identity refused holds the lane (and only that)', () => {
  for (const code of [CODE.IDENTITY_MISMATCH, CODE.ORIGIN_REFUSED]) {
    const f = fixture();
    assert.equal(f.resolve(code), OUTCOME.LANE_HELD);
    assert.equal(f.lane.held, code);
    assert.equal(f.resumed.length, 0);
  }
});

test('a byte-form refusal re-derives once; on a repeat whose members are each admissible ' +
  'alone, the builder is broken and the lane is held', () => {
  const f = fixture();
  assert.equal(f.resolve(CODE.BYTES_INVALID), OUTCOME.RE_DERIVED);
  assert.equal(f.resolve(CODE.BYTES_INVALID), OUTCOME.LANE_HELD);
  assert.equal(f.lane.held, CODE.BYTES_INVALID);
  assert.equal(f.lane.quarantined.size, 0);
});
