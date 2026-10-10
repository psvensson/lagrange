/**
 * A proposal attempt that spends its per-attempt deadline is one
 * wait_bound_spent ERROR, and the proposal still rejects. The observation
 * the report carries (the replica's leadership at expiry) is gathered inside
 * the reporter's guard: an observation that throws becomes the named
 * observation_failed state in the line and never stops the timer callback
 * from rejecting the proposal.
 */

import {test} from '../../src/test-helpers/tap.js';
import {routeMessageGroupCommand} from
  '../../src/message-group/message-group-proposal-routing.js';
import {RetryStatus} from '../../src/message-group/message-retry-handler.js';
import {captureLogger} from '../test-helpers/wait-bound-spent-capture.js';

const PROPOSE_TIMEOUT_MS = 25;
const SETTLE_BOUND_MS = 200;
const PROPOSAL_DEADLINE_WAIT =
  'proposeTimeoutMs (MESSAGE_GROUP_DELIVERY_TIMEOUT_MS / attempts)';
const UNSETTLED = 'proposal_never_settled';

/** Timers whose expiry the test fires by hand, recording a thrown callback. */
function manualTimers() {
  const armed = [];
  return {
    armed,
    setTimeout(callback) {
      armed.push(callback);
      return armed.length;
    },
    clearTimeout() {},
  };
}

/** One attempt, no retry: the routing's outcome is that attempt's. */
const singleAttemptRetryHandler = {
  async executeWithRetry(operation) {
    try {
      await operation(null, null, 0);
      return {status: RetryStatus.SUCCESS, attempt: 0};
    } catch (error) {
      return {status: RetryStatus.MAX_RETRIES_EXCEEDED, lastError: error};
    }
  },
};

/**
 * A leading replica whose port never answers the proposal, and whose
 * leadership read throws from the second read on (the first one routes).
 */
function leaderWithFailingLeadershipRead(logger, timers) {
  let leadershipReads = 0;
  return {
    groupId: 'mg-1',
    replicaId: 'mg-1-r1',
    logger,
    providedTimeSource: timers,
    commandRetryHandler: singleAttemptRetryHandler,
    raft: {propose: () => new Promise(() => {})},
    isCurrentRaftLeader() {
      leadershipReads += 1;
      if (leadershipReads > 1) {
        throw new Error('raft port closed');
      }
      return true;
    },
    getRole: () => 'leader',
  };
}

test('a proposal deadline whose observation throws still rejects the ' +
  'proposal and reports exactly one spent wait', async (t) => {
  const capture = captureLogger();
  const timers = manualTimers();
  const service = leaderWithFailingLeadershipRead(capture.logger, timers);
  const routing = routeMessageGroupCommand(service, {
    type: 'CDC', tableName: 'nodes', operation: 'UPDATE', causeId: 'cause-1',
  }, {
    maxAttempts: 1,
    proposeTimeoutMs: PROPOSE_TIMEOUT_MS,
    computeRetryDelayMs: () => 0,
    onRetry: () => {},
  });
  const settled = routing.then(
    () => 'resolved',
    (error) => error);
  await new Promise((resolve) => setImmediate(resolve));
  t.equal(timers.armed.length, 1, 'one proposal deadline is armed');

  let callbackError = null;
  try {
    timers.armed[0]();
  } catch (error) {
    callbackError = error;
  }
  t.equal(callbackError, null,
    'the expiry callback never throws out of the timer');

  const outcome = await Promise.race([
    settled,
    new Promise((resolve) =>
      setTimeout(() => resolve(UNSETTLED), SETTLE_BOUND_MS)),
  ]);
  t.not(outcome, UNSETTLED, 'the proposal settles within its bound');
  t.ok(outcome instanceof Error, 'the proposal rejects');
  t.match(outcome?.message, /after 25ms/, 'with the deadline error');

  const spent = capture.spent()
    .filter((line) => line.context.wait === PROPOSAL_DEADLINE_WAIT);
  t.equal(spent.length, 1, 'exactly one wait_bound_spent ERROR');
  t.equal(spent[0]?.context.lastObserved.state, 'observation_failed',
    'the throwing observation is the named observation_failed state');
  t.match(spent[0]?.context.lastObserved.error, /raft port closed/);
  t.match(spent[0]?.context.scope, {groupId: 'mg-1', replicaId: 'mg-1-r1'},
    'the scope is still reported');
});
