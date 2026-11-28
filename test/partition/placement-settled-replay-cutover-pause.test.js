// The native placement admission owner's settled replay under the participant
// cutover pause (partition-placement-admission.js proposePlacementCommand).
// An entry E0 already committed and settled is a read of its outcome row, not
// a new write: a cutover-paused leader answers E0 with its ORIGINAL receipt,
// while a new entry E1 and an unresolved (proposed, uncommitted) entry E1u
// stay paused. Leadership is decided before the replay, and a changed command
// under E0's entryId is the same-entry collision, never E0's answer and never
// masked as a pause.
//
// REAL: the replica_operations-p1 PartitionService, its committed apply path
// and statement outcome rows, and the participant cutover pause owner.
// DOUBLE: the consensus port (the test commits the leader's proposals and
// sets its role).
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {PLACEMENT_ADMISSION_ERROR, PLACEMENT_RESULT_FIELD} from
  '../../src/partition/partition-placement-admission-constants.js';
import {requestPlacementAdmission} from
  '../../src/partition/partition-placement-admission.js';
import {pausedWriteAnswerOf, raiseParticipantCutoverPause} from
  '../../src/partition/partition-participant-transaction-pause.js';
import {PARTITION_WRITE_LEADERSHIP_REFUSAL as WRITE_REFUSAL} from
  '../../src/partition/partition-service-constants.js';
import {PLACEMENT_OUTCOME} from '../../src/rebalancer/replica-placement-owner-constants.js';
import {applyCommitted, awaitProposal, clearFixtureSingletons, resetFixtureSingletons,
  settleTicks, track} from '../test-helpers/participant-transaction-fixture.js';
import {NODE, admitOnLeader, ledgerRows, onLedgerLeader, placementStatement} from
  './placement-admission-fixture.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

const resultOf = (answer) => answer[PLACEMENT_RESULT_FIELD];
// The committed receipt of an entry. The first answer's acknowledgement
// stamp (acceptingNodeId, acknowledgedAtMs) belongs to that delivery, not to
// the committed outcome, so a replay is compared on the receipt alone.
const RECEIPT_FIELDS = Object.freeze(['success', 'partitionId', PLACEMENT_RESULT_FIELD,
  'committed', 'logIndex', 'term']);
const receiptOf = (answer) => Object.fromEntries(RECEIPT_FIELDS.map((field) =>
  [field, answer?.[field]]));
const E0 = 'pause-e0';
const E1 = 'pause-e1';
const E1_UNRESOLVED = 'pause-e1u';

test('cutover pause: settled E0 answers its original receipt while new and unresolved ' +
  'E1 stay paused; a changed command under E0 is still the collision', () =>
  onLedgerLeader(async (leader, proposed) => {
    const e0Body = placementStatement({partitionId: 'tables-p1', target: NODE.B});
    const e1Body = placementStatement({partitionId: 'indices-p1', target: NODE.C});
    const e0 = await admitOnLeader(leader, proposed, E0, e0Body);
    assert.equal(e0.apply, null);
    assert.equal(resultOf(e0.answer).outcome, PLACEMENT_OUTCOME.ADMITTED);
    assert.equal(e0.answer.committed, true);
    // E1u is proposed before the pause and never committed: unresolved.
    const unresolved = track(requestPlacementAdmission(leader,
      {entryId: E1_UNRESOLVED, body: e1Body}));
    assert.ok(await awaitProposal(proposed, (entry) => entry.entryId === E1_UNRESOLVED));
    raiseParticipantCutoverPause(leader);
    assert.equal(pausedWriteAnswerOf(leader)?.failureCode, WRITE_REFUSAL.CUTOVER_PAUSED);
    const rowsBefore = ledgerRows(leader);
    const proposals = proposed.length;

    const replay = await requestPlacementAdmission(leader, {entryId: E0, body: e0Body});
    assert.deepEqual(receiptOf(replay), receiptOf(e0.answer),
      'a settled E0 is answered with its original receipt');
    assert.equal(Object.isFrozen(resultOf(replay)), true);

    const fresh = await requestPlacementAdmission(leader, {entryId: E1, body: e1Body});
    assert.equal(fresh.failureCode, WRITE_REFUSAL.CUTOVER_PAUSED);
    const rejoined = await requestPlacementAdmission(leader,
      {entryId: E1_UNRESOLVED, body: e1Body});
    assert.equal(rejoined.failureCode, WRITE_REFUSAL.CUTOVER_PAUSED);
    await settleTicks();
    assert.equal(unresolved.settled, false, 'the pause neither resolves nor drops E1u');

    const collided = await requestPlacementAdmission(leader, {entryId: E0, body: e1Body});
    assert.equal(collided.success, false);
    assert.equal(collided.failureCode, PLACEMENT_ADMISSION_ERROR.BYTES);

    // A committed duplicate of E0 delivered under the pause is the same replay.
    assert.equal(applyCommitted(leader, e0.command), null);
    assert.equal(proposed.length, proposals, 'nothing is proposed under the pause');
    assert.deepEqual(ledgerRows(leader), rowsBefore);
  }));

test('cutover pause: leadership is decided before the settled replay', () =>
  onLedgerLeader(async (leader, proposed) => {
    const e0Body = placementStatement({partitionId: 'tables-p1', target: NODE.B});
    const e0 = await admitOnLeader(leader, proposed, E0, e0Body);
    assert.equal(resultOf(e0.answer).outcome, PLACEMENT_OUTCOME.ADMITTED);
    raiseParticipantCutoverPause(leader);
    leader.controllablePort.setRole(RAFT_ROLE.FOLLOWER);
    const proposals = proposed.length;
    const demoted = await requestPlacementAdmission(leader, {entryId: E0, body: e0Body});
    assert.equal(demoted.success, false);
    assert.equal(demoted.failureCode, WRITE_REFUSAL.NOT_LEADER);
    assert.equal(resultOf(demoted), undefined, 'a follower never answers the settled receipt');
    assert.equal(proposed.length, proposals);
  }));
