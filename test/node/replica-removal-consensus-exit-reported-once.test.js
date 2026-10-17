/**
 * The 30 s consensus-exit backstop (REMOVAL_CONSENSUS_EXIT_BACKSTOP_MS) is a
 * spent wait reported ONCE, at its one caller (the removal execution's
 * logReplicaRemovalConsensusExit), never again inside the wait itself
 * (census of bounded waits, wire-at-merge item). The wait answers BACKSTOP
 * and writes nothing; the caller's module holds the one report of that wait,
 * and the wait's module imports no reporter.
 */

import fs from 'node:fs';
import {test} from '../../src/test-helpers/tap.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  COMMITTED_MEMBERSHIP_ANSWER_KIND,
} from '../../src/raft/raft-committed-membership-constants.js';
import {RAFT_OPERATION} from '../../src/raft/raft-operation-port-constants.js';
import {
  REPLICA_CONSENSUS_EXIT_REASON,
  awaitReplicaConsensusExit,
} from '../../src/node/replica-removal-consensus-exit.js';

const SELF = 'users-p1-r1';
const SELF_PEER = '11';
const BACKSTOP_WAIT = 'REPLICA_HANDLER_DEFAULT.REMOVAL_CONSENSUS_EXIT_BACKSTOP_MS';
const WAIT_SOURCE = new URL(
  '../../src/node/replica-removal-consensus-exit.js', import.meta.url);
const CALLER_SOURCE = new URL(
  '../../src/node/replica-handler-remove-execution-methods.js', import.meta.url);

// A port whose committed read keeps naming the retiring replica a voter, so
// only the backstop can end the wait.
function stillVoterService() {
  return {
    replicaId: SELF,
    partitionId: 'users-p1',
    raft: {
      subscribe: () => () => {},
      [RAFT_OPERATION.READ_COMMITTED_MEMBERSHIP]: () => ({
        kind: COMMITTED_MEMBERSHIP_ANSWER_KIND.COMMITTED,
        voters: [SELF_PEER],
        votersOutgoing: [],
        learners: [],
        appliedIndex: 7,
        commitIndex: 7,
        term: 2,
        leaderId: SELF_PEER,
        gateOpen: true,
        identities: {[SELF_PEER]: SELF},
      }),
    },
  };
}

test('the backstop elapsing inside the wait writes no line of its own',
  async (t) => {
    const logging = LoggingService.getInstance();
    const lines = [];
    const originalError = logging.error;
    logging.error = (message, context = {}) => {
      lines.push({message, context});
    };
    const keepAlive = setTimeout(() => {}, 60_000);
    try {
      t.same(await awaitReplicaConsensusExit(stillVoterService(),
        {replicaId: SELF, backstopMs: 20}),
      {reason: REPLICA_CONSENSUS_EXIT_REASON.BACKSTOP}, 'answers BACKSTOP');
    } finally {
      logging.error = originalError;
      clearTimeout(keepAlive);
    }
    t.same(lines, [], 'the wait reports nothing; its caller reports it');
  });

test('the backstop has exactly one report, at its caller', async (t) => {
  const waitSource = fs.readFileSync(WAIT_SOURCE, 'utf8');
  const callerSource = fs.readFileSync(CALLER_SOURCE, 'utf8');
  t.notMatch(waitSource, /wait-bound-spent|reportWaitBoundSpent/,
    'the wait module imports no spent-wait reporter');
  t.equal(callerSource.split(`wait: '${BACKSTOP_WAIT}'`).length - 1, 1,
    'the caller names the backstop wait once');
  t.equal(callerSource.split('reportWaitBoundSpent(').length - 1, 1,
    'the caller writes one report');
});
