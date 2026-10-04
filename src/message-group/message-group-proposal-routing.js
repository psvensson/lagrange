// How a message-group command reaches its group's consensus log (design R3
// section 1.7). The committed-command owner admits it first: a refused
// command is never proposed and never retried. An admitted command is
// proposed through this replica's own port while it leads and forwarded to
// the leader over the application forward while it does not; an attempt
// that failed retryably is routed again after the configured backoff, under
// the same per-attempt deadline the forward path keeps. The attempts, their
// backoff and every stop are the replica's message retry owner's
// (message-retry-handler.js).

import {reportWaitBoundSpent} from '../logging/wait-bound-spent.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {RAFT_OPERATION_OUTCOME} from '../raft/raft-operation-port-constants.js';
import {
  MESSAGE_GROUP_CDC_ERROR_MSG,
  MESSAGE_GROUP_PROPOSAL_ROUTE,
} from './constants.js';
import {
  admitMessageGroupCommand,
  messageGroupCommandRefusalError,
} from './message-group-committed-command-admission.js';
import {RetryStatus} from './message-retry-handler.js';

const PROPOSAL_DEADLINE_WAIT = Object.freeze({
  wait: 'proposeTimeoutMs (MESSAGE_GROUP_DELIVERY_TIMEOUT_MS / attempts)',
  awaited: 'local raft port to append the proposed message-group command',
});

/**
 * One proposal attempt spent its per-attempt deadline: one
 * wait_bound_spent ERROR with the role the replica held at expiry.
 * @param {Object} service - The message-group replica.
 * @param {Object} command - The proposed command.
 * @param {number} attempt - The 1-based routing attempt.
 * @param {number} timeoutMs - The per-attempt deadline.
 * @return {void}
 */
function reportProposalDeadlineSpent(service, command, attempt, timeoutMs) {
  reportWaitBoundSpent(service.logger, {
    ...PROPOSAL_DEADLINE_WAIT,
    boundMs: timeoutMs,
    elapsedMs: timeoutMs,
    lastObserved: {
      attempt,
      commandType: command?.type ?? null,
      isCurrentRaftLeader: service.isCurrentRaftLeader?.() ?? null,
      raftRole: service.getRole?.() ?? null,
    },
    scope: {
      groupId: service.groupId ?? null,
      replicaId: service.replicaId ?? null,
      causeId: command?.causeId ?? null,
    },
  });
}

/**
 * Refuse, typed, a command the committed-command owner does not admit.
 * @param {Object} command - The command about to be proposed.
 * @return {void}
 */
function assertMessageGroupCommandAdmitted(command) {
  const admission = admitMessageGroupCommand(command);
  if (!admission.admitted) {
    throw messageGroupCommandRefusalError(admission);
  }
}

/**
 * Whether a refused proposal was a routing miss: the replica stopped leading
 * between choosing its route and proposing, so nothing entered the log and
 * the next attempt routes to the leader.
 * @param {Object} service - The message-group replica.
 * @param {Object} answer - The port's answer.
 * @return {boolean} True for a refusal by a replica that no longer leads.
 */
function isRoutingMiss(service, answer) {
  if (answer?.outcome !== RAFT_OPERATION_OUTCOME.CORE_REFUSED ||
      !service.raft) {
    return false;
  }
  const status = service.raft.readStatus();
  return status?.outcome === RAFT_OPERATION_OUTCOME.CORE_OK &&
    status.role !== RAFT_ROLE.LEADER;
}

/**
 * The error of a proposal the port did not take: it carries the port's
 * answer, and is retryable only when the answer is retryable without
 * recovery, or the refusal was a routing miss.
 * @param {Object} service - The message-group replica.
 * @param {Object} answer - The port's answer.
 * @return {Error} The error.
 */
function proposalRefusalError(service, answer) {
  const error = new Error(`${MESSAGE_GROUP_CDC_ERROR_MSG.PROPOSE_REFUSED}: ` +
    `${answer?.reason || answer?.phase || answer?.outcome}`);
  error.consensus = answer ?? null;
  error.reason = answer?.reason ?? null;
  if (Number.isFinite(answer?.retryAfterMs) && answer.retryAfterMs > 0) {
    error.retryAfterMs = answer.retryAfterMs;
  }
  error.retryable = answer?.recoveryRequired !== true &&
    (answer?.retryable === true || isRoutingMiss(service, answer));
  return error;
}

/**
 * Propose one admitted command through this replica's own port. The port
 * answers once the command is appended to the leader's log (not committed);
 * the committed apply delivers it on every replica.
 * @param {Object} service - The message-group replica.
 * @param {Object} command - The command.
 * @return {Promise<Object>} The port's CORE_OK answer.
 */
async function proposeMessageGroupCommand(service, command) {
  assertMessageGroupCommandAdmitted(command);
  const answer = await Promise.resolve(service.raft.propose(command));
  if (answer?.outcome !== RAFT_OPERATION_OUTCOME.CORE_OK) {
    throw proposalRefusalError(service, answer);
  }
  return answer;
}

/**
 * Settle a proposal within its deadline, armed on this node's clock.
 * @param {Promise} proposal - The proposal.
 * @param {number} timeoutMs - The per-attempt deadline.
 * @param {Object} timers - {setTimeout, clearTimeout}.
 * @param {Function} onSpent - Called once when the deadline expires.
 * @return {Promise<*>} The proposal's answer.
 */
function withinProposalDeadline(proposal, timeoutMs, timers, onSpent) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return proposal;
  }
  return new Promise((resolve, reject) => {
    const timeoutHandle = timers.setTimeout(() => {
      onSpent();
      reject(new Error(
        `${MESSAGE_GROUP_CDC_ERROR_MSG.PROPOSE_TIMEOUT} after ${timeoutMs}ms`));
    }, timeoutMs);
    proposal.then((answer) => {
      timers.clearTimeout(timeoutHandle);
      resolve(answer);
    }, (error) => {
      timers.clearTimeout(timeoutHandle);
      reject(error);
    });
  });
}

function routeRetryDelayMs(options, attempt, error) {
  const configured = Math.floor(options.computeRetryDelayMs(attempt));
  const retryAfterMs = Number.isFinite(error?.retryAfterMs) ?
    Math.floor(error.retryAfterMs) : 0;
  return Math.max(Number.isFinite(configured) ? configured : 0,
    retryAfterMs, 0);
}

function routeAttempt(service, command, attempt, options) {
  if (service.isCurrentRaftLeader()) {
    return {
      mode: MESSAGE_GROUP_PROPOSAL_ROUTE.PROPOSE,
      settled: withinProposalDeadline(
        proposeMessageGroupCommand(service, command),
        options.proposeTimeoutMs, options.timers,
        () => reportProposalDeadlineSpent(
          service, command, attempt, options.proposeTimeoutMs)),
    };
  }
  const mode = MESSAGE_GROUP_PROPOSAL_ROUTE.FORWARD;
  return {
    mode,
    settled: Promise.resolve().then(() =>
      options.forwardToLeader(command, {attempt, mode})),
  };
}

/**
 * Route one command to its group's log with bounded attempts under the
 * replica's message retry owner: proposed through this replica's port while
 * it leads, forwarded to the leader while it does not. A non-retryable
 * failure ends the routing at once; the last failure is thrown once the
 * attempts run out.
 * @param {Object} service - The message-group replica.
 * @param {Object} command - The command.
 * @param {Object} options - {maxAttempts, proposeTimeoutMs, forwardToLeader,
 *   computeRetryDelayMs, onRetry}.
 * @return {Promise<{attempt: number, mode: string}>} The attempt that
 *   routed it.
 */
async function routeMessageGroupCommand(service, command, options) {
  assertMessageGroupCommandAdmitted(command);
  const timers = service.providedTimeSource || {setTimeout, clearTimeout};
  const routing = {...options, timers};
  let routed = null;
  const outcome = await service.commandRetryHandler.executeWithRetry(
    async (_target, _message, attemptIndex) => {
      routed = routeAttempt(service, command, attemptIndex + 1, routing);
      await routed.settled;
      return {success: true};
    },
    {
      message: command,
      maxAttempts: options.maxAttempts,
      retryDelayMs: (attempt, error) =>
        routeRetryDelayMs(options, attempt, error),
      isRetryable: (error) => error?.retryable !== false,
      onRetry: ({attempt, delay, error}) => options.onRetry({
        attempt,
        mode: routed.mode,
        retryDelayMs: delay,
        error,
      }),
    },
  );
  if (outcome.status !== RetryStatus.SUCCESS) {
    throw outcome.lastError;
  }
  return {attempt: outcome.attempt + 1, mode: routed.mode};
}

export {
  assertMessageGroupCommandAdmitted,
  proposeMessageGroupCommand,
  routeMessageGroupCommand,
};
