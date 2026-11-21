// S0 witness 3 (fallback-read closure). Owner path: readOwnerFact
// (control-plane-owner-fact-read.js) over gateway.readAuthoritativeRows.
// "Absent" is an answer only the authority gives. A successful empty answer
// from a replica that does not lead (the node's own lagging follower, or a
// follower reached over the query channel) must never be reported as READY
// with no rows; READY carries the serving leader's witness, and an empty
// READY from that leader is the only absence.
import {
  OWNER_FACT_STATE as STATE,
  OWNER_FACT_UNAVAILABLE_REASON as REASON,
  isOwnerFactAnswer,
  ownerFactRows,
  readOwnerFact,
} from '../../src/control-plane/control-plane-owner-fact-read.js';
import {test} from '../../src/test-helpers/tap.js';
import {PARTITION, READ_SQL, TABLE, openLedgerGroupSurface} from
  './cdc-owner-fact-group-fixture.js';

const OPERATION = 'leader-only-operation';
const ABSENT_OPERATION = 'operation-absent-everywhere';
const TEST_TIMEOUT_MS = 120000;
const FAR_INDEX = 1000000;

function requestFor(operationId, extra = {}) {
  return {tableName: TABLE, sql: READ_SQL, params: [operationId],
    minimumIndex: 0, minimumTerm: 0, ...extra};
}

function carriesRows(answer) {
  return (Array.isArray(answer?.rows) && answer.rows.length > 0) ||
    (answer?.rowSet !== undefined && answer?.rowSet !== null);
}

test('readOwnerFact: an empty answer from a replica that does not lead is never absence',
  {timeout: TEST_TIMEOUT_MS}, async (t) => {
    const group = await openLedgerGroupSurface(t, import.meta.url);
    const [leader, follower, local] = group.services;
    await group.settleLeader(leader);
    // Only the leader holds the row: both followers answer the same read with
    // a successful empty row set.
    group.seedRow(leader, OPERATION);
    // Each case reads through a fresh surface of the follower's node, so one
    // case's routing observations (an unreachable address) are not the next's.
    const openReader = async () => {
      const surface = await group.surfaceOf(local.nodeId, {leaderNodeId: leader.nodeId});
      return (request) => readOwnerFact(surface.readLeaderRequired, request);
    };

    await t.test('the leader is unreachable; followers are local and reachable', async (t) => {
      const read = await openReader();
      group.setReachable(leader.nodeId, false);
      const sentBefore = group.transit.length;
      const answer = await read(requestFor(OPERATION));
      const asked = group.transit.slice(sentBefore);
      t.equal(answer.state, STATE.UNAVAILABLE, 'unavailable, never READY with no rows');
      t.ok([REASON.READ_FAILED, REASON.NOT_LEADER].includes(answer.reason),
        `a named reason (${answer.reason})`);
      t.equal(Object.hasOwn(answer, 'rows'), false, 'unavailability has no rows field');
      t.equal(isOwnerFactAnswer(answer), true);
      t.throws(() => ownerFactRows(answer), 'unavailability yields no rows to a consumer');
      t.ok(asked.filter(({targetNodeId}) => targetNodeId !== leader.nodeId)
        .every(({answer: sent}) => sent?.success === false && !carriesRows(sent)),
      'no follower answers the owner-fact read successfully or ships rows');
    });

    await t.test('the leader is reachable again: the same read is READY', async (t) => {
      group.setReachable(leader.nodeId, true);
      const read = await openReader();
      const answer = await read(requestFor(OPERATION));
      t.equal(answer.state, STATE.READY, 'progress once the authority is reachable');
      t.same(ownerFactRows(answer),
        [{operation_id: OPERATION, workflow_step: leader.replicaId}]);
      t.equal(answer.witness?.servingReplicaId, leader.replicaId);
      t.equal(answer.witness?.servingNodeId, leader.nodeId);
      t.equal(answer.witness?.partitionId, PARTITION);
      t.equal(answer.witness?.commitIndex, answer.witness?.appliedIndex);
      t.equal(isOwnerFactAnswer(answer), true);

      const absent = await read(requestFor(ABSENT_OPERATION));
      t.equal(absent.state, STATE.READY, 'the leader\'s own empty answer is absence');
      t.same(ownerFactRows(absent), []);
      t.equal(absent.witness?.servingReplicaId, leader.replicaId,
        'absence carries the witness of the leader that asserted it');

      const {term, appliedIndex} = answer.witness;
      const atFloor = await read(requestFor(OPERATION,
        {minimumIndex: appliedIndex, minimumTerm: term}));
      t.equal(atFloor.state, STATE.READY, 'the floors are inclusive');
      const belowIndex = await read(requestFor(OPERATION,
        {minimumIndex: appliedIndex + FAR_INDEX}));
      t.equal(belowIndex.state, STATE.UNAVAILABLE,
        'a leader that has not applied the caller\'s index is not an answer');
      t.equal(belowIndex.reason, REASON.BELOW_INDEX_FLOOR);
      t.equal(Object.hasOwn(belowIndex, 'rows'), false);
      const belowTerm = await read(requestFor(OPERATION, {minimumTerm: term + 1}));
      t.equal(belowTerm.state, STATE.UNAVAILABLE,
        'a leader of an older term than the caller has seen is not an answer');
      t.equal(belowTerm.reason, REASON.BELOW_TERM_FLOOR);
      const pinned = await read(requestFor(OPERATION, {expectedReplica:
        {nodeId: follower.nodeId, replicaId: follower.replicaId}}));
      t.equal(pinned.state, STATE.UNAVAILABLE,
        'a caller-pinned serving replica is part of the witness predicate');
      t.equal(pinned.reason, REASON.UNEXPECTED_SERVING_REPLICA);
    });

    await t.test('the node hosting the leader reads it in process, unreachable peers or not',
      async (t) => {
        const hosted = await group.surfaceOf(leader.nodeId, {leaderNodeId: null});
        for (const nodeId of group.nodes) group.setReachable(nodeId, false);
        const sentBefore = group.transit.length;
        const answer = await readOwnerFact(hosted.readLeaderRequired, requestFor(OPERATION));
        t.equal(answer.state, STATE.READY, 'no published leader and no reachable peer needed');
        t.same(ownerFactRows(answer),
          [{operation_id: OPERATION, workflow_step: leader.replicaId}]);
        t.equal(answer.witness?.servingReplicaId, leader.replicaId);
        t.equal(group.transit.length, sentBefore, 'no query transit was used');
      });
  });
