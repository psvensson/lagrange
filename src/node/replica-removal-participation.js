/**
 * Owner contract:
 * Owner: when a replica being removed may stop participating and lose its
 * local state (owner ruling F2, amended 2026-11-11): the removal execution's
 * consensus-exit wait, the teardown authority that wait's answer gives, and
 * the participant-custody check at the irreversible boundary.
 * Inputs: the removal request, its tracked partition service, its durable
 * lifecycle row (read from the replica's database file), its participant
 * custody (the live connection, or the database file once the connection is
 * released) and the per-removal release (shutdown, cancellation).
 * Canonical output:
 *  - awaitRemovalConsensusExit: a frozen {reason}. A spent round (BACKSTOP)
 *    is reported once as a wait_bound_spent ERROR and the wait goes on with
 *    the port kept: a spent wait never retires a voter. The removal's
 *    cancellation, when asked, is settled at this wait (CANCELLED, or
 *    REMOVAL_APPLIED when the removal had already committed).
 *  - requireRemovalTeardownAuthority: teardown proceeds only on exact
 *    evidence - REMOVAL_APPLIED (the replica's own applied configuration no
 *    longer names it), GROUP_RETIRED (the verified group-retirement
 *    authority), or, without a port, one of three positive durable facts of
 *    the replica's own database - it is not there (ABSENT), its lifecycle is
 *    already retired, or it was born and NEVER_OPENED its consensus record -
 *    or the group's answer that the removal applied, or - when no leader
 *    answers - the sole founder's failed create retiring its own group
 *    (replica-removal-sole-founder.js); anything else is the typed retryable
 *    REPLICA_REMOVAL_CONSENSUS_EXIT_DEFERRED, nothing retired, its
 *    deferralReasons naming every state it was decided from (a lifecycle
 *    that could not be read with its reason and cause).
 *  - requireRemovalParticipantCustodySettled: nothing irreversible while the
 *    participant owner holds the replica (a PREPARED row, volatile work) or
 *    its custody cannot be read; the typed retryable
 *    REPLICA_REMOVAL_PARTICIPANT_CUSTODY_DEFERRED keeps the PREPARED state.
 * Prohibited: a teardown on a timeout, a caught error, an unreadable or
 * unresolved configuration, or a released connection.
 */
import {reportWaitBoundSpent} from '../logging/wait-bound-spent.js';
import {
  REPLICA_HANDLER_DEFAULT,
  REPLICA_HANDLER_LOG_MSG,
} from './replica-handler-constants.js';
import {
  REPLICA_CONSENSUS_EXIT_REASON,
  awaitReplicaConsensusExit,
} from './replica-removal-consensus-exit.js';
import {
  REPLICA_REMOVAL_CONSENSUS_EXIT_DEFERRED,
  REPLICA_REMOVAL_PARTICIPANT_CUSTODY_DEFERRED,
  REPLICA_REMOVAL_STILL_MEMBER_WITHOUT_PORT,
  retryableRemovalDebtError,
} from './replica-removal-debt-errors.js';
import {
  GROUP_REMOVAL_VERDICT,
  readGroupVerdictOnOwnRemoval,
} from './replica-removal-group-verdict.js';
import {
  SOLE_FOUNDER_RETIREMENT,
  decideSoleFounderRetirement,
} from './replica-removal-sole-founder.js';
import {runRemovalCancellationCheckpoint} from
  './replica-removal-cancellation.js';
import {REPLICA_REMOVAL_CANCEL_ANSWER as CANCEL} from
  './replica-removal-cancel-contract.js';
import {participantTransactionCustodyOf} from
  '../partition/partition-participant-transaction-session.js';
import {readDurableParticipantCustodyAt} from
  '../partition/partition-participant-transaction-store.js';
import {PARTICIPANT_TRANSACTION_CUSTODY as CUSTODY} from
  '../partition/partition-participant-transaction-constants.js';

const REMOVAL_CONSENSUS_EXIT_WAIT = Object.freeze({
  wait: 'REPLICA_HANDLER_DEFAULT.REMOVAL_CONSENSUS_EXIT_BACKSTOP_MS',
  awaited: 'retiring replica\'s applied configuration no longer names it ' +
    '(removal committed)',
});
const ANSWER_SEPARATOR = ', ';
const CAUSE_SEPARATOR = ':';
// The exits on which the replica's port may retire and its state go.
const TEARDOWN_EXITS = Object.freeze(new Set([
  REPLICA_CONSENSUS_EXIT_REASON.REMOVAL_APPLIED,
  REPLICA_CONSENSUS_EXIT_REASON.GROUP_RETIRED,
]));

/**
 * Report a spent round of the consensus-exit wait: the alarm, once per
 * removal (owner decision 2026-10-04), with the wait's last witness read
 * and what the handler last observed of the retiring replica.
 * @param {Object} handler - The ReplicaHandler.
 * @param {Object} exit - The BACKSTOP answer.
 * @param {Object} context - {operationId, replicaId, partitionId,
 *   startedAtMs}.
 */
function reportConsensusExitSpent(handler, exit, context) {
  const {operationId, replicaId, partitionId, startedAtMs} = context;
  reportWaitBoundSpent(handler.logger, {
    ...REMOVAL_CONSENSUS_EXIT_WAIT,
    boundMs: REPLICA_HANDLER_DEFAULT.REMOVAL_CONSENSUS_EXIT_BACKSTOP_MS,
    elapsedMs: Date.now() - startedAtMs,
    lastObserved: () => ({
      exitReason: exit.reason,
      // The wait's last witness read: why no exit event came.
      lastObservation: exit.lastObservation,
      trackedRaftRole: handler.getTrackedReplicaRole(replicaId),
      lifecycleState: handler.getTrackedReplicaLifecycleState(replicaId),
    }),
    scope: {nodeId: handler.nodeId, operationId, partitionId, replicaId},
  });
}

function logConsensusExit(handler, exit, {operationId, replicaId,
  partitionId}) {
  handler.logger.info(REPLICA_HANDLER_LOG_MSG.REMOVE_CONSENSUS_EXIT, {
    operationId, replicaId, partitionId, nodeId: handler.nodeId,
    reason: exit.reason,
  });
}

// The signal one round of the wait is released by: node shutdown, or this
// removal's own release (its cancellation).
function roundSignalOf(handler, removal) {
  return globalThis.AbortSignal.any([
    handler.removalConsensusExitRelease.signal, removal.controller.signal]);
}

/**
 * Keep the retiring replica participating until its own applied
 * configuration no longer names it, the node shuts down, or its removal is
 * cancelled. A spent round is reported once and the wait goes on (its next
 * round re-reads the configuration, so a missed event is recovered by a
 * read, never by a retirement).
 * @param {Object} handler - The ReplicaHandler.
 * @param {Object|null} service - The tracked partition service.
 * @param {Object} context - {operationId, replicaId, partitionId, removal}:
 *   removal is the running removal's record (its release and pending
 *   cancellation; beginRemovalExecution).
 * @return {Promise<Object>} Frozen {reason}.
 */
async function awaitRemovalConsensusExit(handler, service, context) {
  const {replicaId, removal} = context;
  const startedAtMs = Date.now();
  let reported = false;
  for (;;) {
    const exit = await awaitReplicaConsensusExit(service, {replicaId,
      backstopMs: REPLICA_HANDLER_DEFAULT.REMOVAL_CONSENSUS_EXIT_BACKSTOP_MS,
      signal: roundSignalOf(handler, removal)});
    if (exit.reason === REPLICA_CONSENSUS_EXIT_REASON.BACKSTOP) {
      if (!reported) {
        reportConsensusExitSpent(handler, exit, {...context, startedAtMs});
        reported = true;
      }
      continue;
    }
    if (exit.reason === REPLICA_CONSENSUS_EXIT_REASON.CANCELLED) {
      const settled = await settleCancellationAtWait(handler, context);
      if (settled === null) {
        continue;
      }
      logConsensusExit(handler, settled, context);
      return settled;
    }
    logConsensusExit(handler, exit, context);
    return exit;
  }
}

// The cancellation asked of a removal waiting for its exit: cancelled (the
// wait ends without a retirement), already applied (the removal goes on to
// its teardown), or nothing concluded (the wait goes on).
async function settleCancellationAtWait(handler, context) {
  const result = await runRemovalCancellationCheckpoint(handler,
    context.removal, {retiringRowDurable: true});
  if (result?.answer === CANCEL.ALREADY_REMOVED) {
    return Object.freeze({
      reason: REPLICA_CONSENSUS_EXIT_REASON.REMOVAL_APPLIED});
  }
  if (result?.answer === CANCEL.CANCELLED ||
      result?.answer === CANCEL.NOT_IN_PROGRESS) {
    return Object.freeze({reason: REPLICA_CONSENSUS_EXIT_REASON.CANCELLED});
  }
  return null;
}

/**
 * When the retiring replica leaves consensus. A replica of a group retired
 * as a unit (a verified group-retirement REMOVE, owner decision 2026-10-04)
 * leaves at once: its whole group ends at the durable workflow transition,
 * nobody proposes a conf change for it, and nothing commits in it again.
 * Every other removal keeps participating until its own removal applies
 * (ruling F2).
 * @param {Object} handler
 * @param {Object} request
 * @param {Object|null} service
 * @param {Object|null} removal - The running removal's record.
 * @return {Promise<Object>} Frozen {reason}.
 */
function leaveConsensus(handler, request, service, removal) {
  const {operationId, partitionId, replicaId} = request;
  if (request.groupRetirement?.retire === true) {
    const exit = Object.freeze({
      reason: REPLICA_CONSENSUS_EXIT_REASON.GROUP_RETIRED});
    handler.logger.info(REPLICA_HANDLER_LOG_MSG.REMOVE_CONSENSUS_EXIT, {
      operationId, replicaId, partitionId, nodeId: handler.nodeId,
      reason: exit.reason, groupRetirementKind: request.groupRetirement.kind,
    });
    return Promise.resolve(exit);
  }
  return handler.awaitReplicaRemovalConsensusExit(service, {
    operationId,
    replicaId,
    partitionId,
    removal,
  });
}

/**
 * Teardown authority from one consensus exit (throws the typed deferral
 * when there is none). Without a port (a removal resumed after a restart, a
 * create that failed) the replica's durable lifecycle decides first, on a
 * positive fact only: its database is not there, its row is retired (its
 * retirement already happened), or its row was born and the replica never
 * opened its consensus record (it never voted, logged or applied anything:
 * the file holds its schema and nothing a group depends on; this holds for
 * any REMOVE, as the absent database does). Everything else - an active
 * record, or a lifecycle that cannot be read (no table, no row for the
 * identity, an unreadable file: each named in the deferral with its cause) -
 * asks the group (its leader's committed configuration): its removal applied
 * permits the cleanup; still a member is STILL_MEMBER_WITHOUT_PORT; no
 * leader answering asks the one remaining owner - the sole founder's failed
 * create, which retires its own group from its durable claim and its own
 * durable record - and is otherwise the ordinary deferral. Each deferral is
 * re-asked when the removal is re-driven (the coordinator's re-dispatch, the
 * REMOVING re-drive); the event that clears a hold on an unreadable
 * lifecycle is the group's answer that the removal applied, or the file
 * becoming readable again.
 * @param {Object} handler
 * @param {Object} request - {operationId, partitionId, replicaId}.
 * @param {Object} exit - Frozen {reason}.
 * @return {Promise<void>}
 */
async function requireRemovalTeardownAuthority(handler, request, exit) {
  if (TEARDOWN_EXITS.has(exit.reason)) {
    return;
  }
  const reasons = [exit.reason];
  let groupVerdict = null;
  if (exit.reason === REPLICA_CONSENSUS_EXIT_REASON.NO_CONSENSUS_PORT) {
    const lifecycle = handler.lifecycleVerdictsOf(
      handler.readReplicaDurableLifecycle(request.partitionId,
        request.replicaId));
    if (lifecycle.absent || lifecycle.retired || lifecycle.neverOpened) {
      logLifecycleTeardown(handler, request, lifecycle);
      return;
    }
    reasons.push(...unreadableLifecycleReasonsOf(lifecycle));
    groupVerdict = await readGroupVerdictOnOwnRemoval(handler, request);
    // The group's leader outranks the replica's own file: the sole-founder
    // owner is asked only when no leader answered.
    const soleFounder = groupVerdict === GROUP_REMOVAL_VERDICT.UNANSWERED ?
      await decideSoleFounderRetirement(handler, request) : null;
    logGroupVerdict(handler, request, {groupVerdict, soleFounder,
      lifecycle: {state: lifecycle.state, reason: lifecycle.reason,
        cause: lifecycle.cause}});
    if (groupVerdict === GROUP_REMOVAL_VERDICT.REMOVED ||
        soleFounder?.state === SOLE_FOUNDER_RETIREMENT.RETIRES_GROUP) {
      return;
    }
    reasons.push(groupVerdict, ...namedStatesOf(soleFounder));
  }
  throw retryableRemovalDebtError(
    groupVerdict === GROUP_REMOVAL_VERDICT.STILL_MEMBER ?
      REPLICA_REMOVAL_STILL_MEMBER_WITHOUT_PORT :
      REPLICA_REMOVAL_CONSENSUS_EXIT_DEFERRED,
    `Replica ${request.replicaId} has no evidence it left consensus ` +
      `(${reasons.join(ANSWER_SEPARATOR)}); nothing retired`,
    {deferralReasons: reasons});
}

// The named states of a sole-founder decision that was asked: its state,
// then the record's membership and history when the record was read, then
// why the record was unreadable.
function namedStatesOf(soleFounder) {
  return soleFounder === null ? [] : [soleFounder.state,
    soleFounder.membership, soleFounder.history,
    ...causeReasonsOf(soleFounder.cause)].filter((state) => state !== null);
}

// A read's cause as deferral reasons: its reason, then `subject:code` of
// the failed read when one failed (a missing table or row has only a reason).
const NO_CAUSE_REASONS = Object.freeze([]);
function causeReasonsOf(cause) {
  if (cause === null) {
    return NO_CAUSE_REASONS;
  }
  return [cause.reason, ...(cause.code === null ? [] :
    [`${cause.subject}${CAUSE_SEPARATOR}${cause.code}`])];
}

// A lifecycle that holds no row and is not absent could not be read: its
// reason and cause are deferral reasons. A held (active) row adds none.
function unreadableLifecycleReasonsOf(lifecycle) {
  return lifecycle.holdsRow ? [] : causeReasonsOf({reason: lifecycle.reason,
    code: lifecycle.cause?.code ?? null,
    subject: lifecycle.cause?.subject ?? null});
}

function logLifecycleTeardown(handler, request, lifecycle) {
  handler.logger.info(REPLICA_HANDLER_LOG_MSG.REMOVE_GROUP_VERDICT, {
    partitionId: request.partitionId, replicaId: request.replicaId,
    nodeId: handler.nodeId, lifecycle: {state: lifecycle.state,
      reason: lifecycle.reason, opening: lifecycle.opening}});
}

function logGroupVerdict(handler, request, answers) {
  handler.logger.info(REPLICA_HANDLER_LOG_MSG.REMOVE_GROUP_VERDICT, {
    partitionId: request.partitionId, replicaId: request.replicaId,
    nodeId: handler.nodeId, ...answers});
}

/**
 * The participant owner's custody of a replica being removed: the live
 * connection's answer, or - once it is released - the database file's
 * durable PREPARED reservation read on an independent connection.
 * @param {Object} handler
 * @param {Object} request - {partitionId, replicaId}.
 * @param {Object|null} service
 * @return {string} A PARTICIPANT_TRANSACTION_CUSTODY.
 */
function removalParticipantCustodyOf(handler, request, service) {
  const live = service ? participantTransactionCustodyOf(service) :
    CUSTODY.UNAVAILABLE;
  if (live !== CUSTODY.UNAVAILABLE) {
    return live;
  }
  return readDurableParticipantCustodyAt(
    handler.getPartitionDbPath(request.partitionId, request.replicaId));
}

/**
 * Nothing irreversible (retirement, deletion, completion) while participant
 * custody is held or unknown.
 * @param {Object} handler
 * @param {Object} request - {partitionId, replicaId}.
 * @param {Object|null} service
 */
function requireRemovalParticipantCustodySettled(handler, request, service) {
  const custody = removalParticipantCustodyOf(handler, request, service);
  if (custody !== CUSTODY.IDLE) {
    throw retryableRemovalDebtError(
      REPLICA_REMOVAL_PARTICIPANT_CUSTODY_DEFERRED,
      `Replica ${request.replicaId} participant custody is ${custody}; ` +
        'nothing retired, deleted or completed');
  }
}

export {
  awaitRemovalConsensusExit,
  leaveConsensus,
  removalParticipantCustodyOf,
  requireRemovalParticipantCustodySettled,
  requireRemovalTeardownAuthority,
};
