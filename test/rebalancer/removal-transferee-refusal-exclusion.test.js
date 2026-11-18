// The plain-REMOVE removal leadership gate re-picked one refusing transferee
// forever (workflow review, 2026-11-11): its candidate ranking is
// deterministic (applied, commit, replica id), and an attempt the transferee
// refused resolves at once, so the next decision named the same voter again.
// The removal transferee rule now passes over the transferee of the last
// attempt that did not accept while another candidate exists, and keeps an
// accepted one (a running transfer is never retargeted).

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  REPLACE_HANDOFF_DECISION,
  beginReplaceHandoffAttempt,
  decideRemovalNamedHandoff,
  recordReplaceHandoffAnswer,
} from '../../src/rebalancer/operation-workflow-replace-handoff-attempt.js';
import {
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {
  PARTITION_REPLICA_MEMBERSHIP_STATE,
} from '../../src/partition/partition-replica-membership-constants.js';

const PARTITION_ID = 'orders-p7';
const SUBJECT = `${PARTITION_ID}-r1`;
const AHEAD = `${PARTITION_ID}-r2`;
const BEHIND = `${PARTITION_ID}-r3`;
const TERM = 4;

function answer(replicaId, appliedIndex) {
  return Object.freeze({state: PARTITION_REPLICA_MEMBERSHIP_STATE.VOTER,
    replicaId, leaderReplicaId: SUBJECT, term: TERM, gateOpen: true,
    appliedIndex, commitIndex: appliedIndex,
    voterReplicaIds: [SUBJECT, AHEAD, BEHIND], votersOutgoingReplicaIds: [],
    transferWindowMaxMs: 1_000});
}

function reads() {
  return {
    witness: null,
    replicaIds: {sourceReplicaId: SUBJECT, targetReplicaId: null},
    readLeaderAuthority: async () => ({authority: answer(SUBJECT, 10),
      confirmingVoterAnswers: new Map([[AHEAD, answer(AHEAD, 10)],
        [BEHIND, answer(BEHIND, 9)]])}),
    routeOf: (replicaId) => ({replicaId, nodeId: `node-${replicaId}`}),
  };
}

async function decide(owner, operation) {
  return decideRemovalNamedHandoff(owner, operation, reads());
}

test('a plain REMOVE whose transferee refused names the other survivor next; ' +
  'an accepted transferee is kept', async () => {
  const owner = {resolveTimeoutCheckNowMs: () => 0};
  const operation = {operationId: 'remove-refusing', partitionId: PARTITION_ID};
  const first = await decide(owner, operation);
  const seq = beginReplaceHandoffAttempt(owner, operation.operationId,
    first.transferee.replicaId);
  recordReplaceHandoffAnswer(owner, operation.operationId,
    {status: ReplicaOperationResponseStatus.ERROR}, seq);
  const afterRefusal = await decide(owner, operation);
  const seq2 = beginReplaceHandoffAttempt(owner, operation.operationId,
    afterRefusal.transferee.replicaId);
  recordReplaceHandoffAnswer(owner, operation.operationId,
    {status: ReplicaOperationResponseStatus.ERROR}, seq2);
  const afterSecondRefusal = await decide(owner, operation);

  const acceptedOwner = {resolveTimeoutCheckNowMs: () => 0};
  const acceptedOp = {operationId: 'remove-accepted', partitionId: PARTITION_ID};
  const chosen = await decide(acceptedOwner, acceptedOp);
  const seq3 = beginReplaceHandoffAttempt(acceptedOwner, acceptedOp.operationId,
    chosen.transferee.replicaId);
  recordReplaceHandoffAnswer(acceptedOwner, acceptedOp.operationId,
    {status: ReplicaOperationResponseStatus.COMPLETED}, seq3);
  // The accepted attempt's window ran out (the clock moves past it).
  acceptedOwner.resolveTimeoutCheckNowMs = () => 10_000;
  const afterAccepted = await decide(acceptedOwner, acceptedOp);

  assert.deepEqual({
    first: [first.state, first.transferee?.replicaId],
    afterRefusal: [afterRefusal.state, afterRefusal.transferee?.replicaId],
    afterSecondRefusal: [afterSecondRefusal.state,
      afterSecondRefusal.transferee?.replicaId],
    afterAccepted: [afterAccepted.state, afterAccepted.transferee?.replicaId],
  }, {
    first: [REPLACE_HANDOFF_DECISION.ISSUE, AHEAD],
    afterRefusal: [REPLACE_HANDOFF_DECISION.ISSUE, BEHIND],
    afterSecondRefusal: [REPLACE_HANDOFF_DECISION.ISSUE, AHEAD],
    afterAccepted: [REPLACE_HANDOFF_DECISION.ISSUE, AHEAD],
  });
});
