// The formation transition command's settled replay through the one
// owner-command prelude (partition-committed-statement-outcome.js
// ownerCommandPrelude): leadership, admission, exact settled replay, cutover
// pause, pending join. A settled FORMATION_TRANSITION E0 answers its ORIGINAL
// receipt under the participant cutover pause while a new command stays
// paused; leadership is still decided first; a different command under E0's
// entryId is never settled by E0's record (INVALID_COMMAND at request, the
// application fails closed at apply).
//
// REAL: the control_plane_publications-p1 PartitionService, the formation
// transition owner and its committed apply path, the statement outcome owner
// and the participant cutover pause owner. DOUBLE: the consensus port (the
// test commits the leader's proposals and sets its role).
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {CONTROL_PLANE_PUBLICATIONS_SCHEMA, SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {FORMATION_REFUSAL_REASON, FORMATION_TRANSITION_OUTCOME, buildFormationDeclareBody,
  requestFormationDeclare} from '../../src/control-plane/membership-publication-formation-record.js';
import {buildFormationTransitionCommand} from
  '../../src/control-plane/membership-publication-formation-transition-command.js';
import {pausedWriteAnswerOf, raiseParticipantCutoverPause} from
  '../../src/partition/partition-participant-transaction-pause.js';
import {PARTITION_WRITE_LEADERSHIP_REFUSAL as WRITE_REFUSAL} from
  '../../src/partition/partition-service-constants.js';
import {applyCommitted, awaitProposal, clearFixtureSingletons, durableAppliedIndex,
  resetFixtureSingletons, shutdownAll, startLeader, track} from
  '../test-helpers/participant-transaction-fixture.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

const PUBLICATIONS_PARTITION_ID = 'control_plane_publications-p1';
const FORMATION_RESULT_FIELD = 'formationResult';
const RECEIPT_FIELDS = Object.freeze(['success', 'partitionId', FORMATION_RESULT_FIELD,
  'committed', 'logIndex', 'term']);
const receiptOf = (answer) => Object.fromEntries(RECEIPT_FIELDS.map((field) =>
  [field, answer?.[field]]));
const E0 = 'formation-e0';
const E1 = 'formation-e1';
const declareOf = (declaredHostCount) => Object.freeze({clusterId: 'cluster-replay',
  declaredHostCount, declaredByNodeId: 'seed-node', declaredAt: 1000});

async function onPublicationsLeader(measure) {
  const {leader, proposed} = await startLeader({
    tableName: SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS,
    schema: CONTROL_PLANE_PUBLICATIONS_SCHEMA}, PUBLICATIONS_PARTITION_ID);
  try {
    return await measure(leader, proposed);
  } finally {
    await shutdownAll(leader);
  }
}

async function declareOnLeader(leader, proposed, entryId, input) {
  const pending = track(requestFormationDeclare(leader, {entryId, body: input}));
  const command = await awaitProposal(proposed, (entry) => entry.entryId === entryId);
  assert.ok(command, `${entryId} was proposed`);
  assert.equal(applyCommitted(leader, command), null);
  return {command, answer: await pending.promise};
}

test('formation under the cutover pause: settled E0 answers its original receipt, a new ' +
  'command stays paused, a different command under E0 is never settled by its record', () =>
  onPublicationsLeader(async (leader, proposed) => {
    const e0 = await declareOnLeader(leader, proposed, E0, declareOf(1));
    assert.equal(e0.answer.success, true);
    assert.notEqual(e0.answer[FORMATION_RESULT_FIELD].outcome,
      FORMATION_TRANSITION_OUTCOME.REFUSED);
    raiseParticipantCutoverPause(leader);
    assert.equal(pausedWriteAnswerOf(leader)?.failureCode, WRITE_REFUSAL.CUTOVER_PAUSED);
    const proposals = proposed.length;

    const replay = await requestFormationDeclare(leader, {entryId: E0, body: declareOf(1)});
    assert.deepEqual(receiptOf(replay), receiptOf(e0.answer),
      'a settled E0 is answered with its original receipt under the pause');
    const fresh = await requestFormationDeclare(leader, {entryId: E1, body: declareOf(3)});
    assert.equal(fresh.failureCode, WRITE_REFUSAL.CUTOVER_PAUSED);
    const nearMiss = await requestFormationDeclare(leader, {entryId: E0, body: declareOf(3)});
    assert.equal(nearMiss.success, false);
    assert.equal(nearMiss.failureCode, FORMATION_REFUSAL_REASON.INVALID_COMMAND);
    assert.equal(proposed.length, proposals, 'nothing is proposed under the pause');

    // The committed E0 duplicate first: a failed-closed apply stops the group.
    assert.equal(applyCommitted(leader, e0.command), null, 'the committed E0 replays');
    const appliedBefore = durableAppliedIndex(leader);
    const collided = buildFormationTransitionCommand(leader,
      {entryId: E0, body: buildFormationDeclareBody(declareOf(3))});
    assert.ok(collided, 'the near-miss command is a valid pinned formation command');
    assert.equal(applyCommitted(leader, collided), FORMATION_REFUSAL_REASON.INVALID_COMMAND,
      'a committed different command under E0 fails the application closed');
    assert.equal(durableAppliedIndex(leader), appliedBefore);
  }));

test('formation: leadership is decided before the settled replay', () =>
  onPublicationsLeader(async (leader, proposed) => {
    const e0 = await declareOnLeader(leader, proposed, E0, declareOf(1));
    assert.equal(e0.answer.success, true);
    assert.notEqual(e0.answer[FORMATION_RESULT_FIELD].outcome,
      FORMATION_TRANSITION_OUTCOME.REFUSED);
    raiseParticipantCutoverPause(leader);
    leader.controllablePort.setRole(RAFT_ROLE.FOLLOWER);
    const proposals = proposed.length;
    const demoted = await requestFormationDeclare(leader, {entryId: E0, body: declareOf(1)});
    assert.equal(demoted.success, false);
    assert.equal(demoted.failureCode, WRITE_REFUSAL.NOT_LEADER);
    assert.equal(demoted[FORMATION_RESULT_FIELD], undefined);
    assert.equal(proposed.length, proposals);
  }));
