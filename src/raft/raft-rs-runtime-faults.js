// What the runtime owner does with a fault it observes: a delivered envelope
// the local-log guard refused (recorded against its sender, reported at a
// bounded rate per group and reason, and - when it proves this replica's own history
// lost - the group held for a reseed), a core trap, and a runtime
// replacement. The structured log line is written by the port's reporter,
// injected on the group, so the runtime owner's import closure stays free of
// logging (restore-path fence).

import {deepFreeze} from './raft-operation-port.js';
import {RAFT_OPERATION_OUTCOME} from './raft-operation-port-constants.js';
import {inboundStepRefusal} from './raft-rs-local-log-guard.js';
import {recordInboundStepRefusal} from './raft-rs-peer-delivery.js';
import {persistenceAdmitted} from './raft-rs-persistence-admission.js';
import {
  NO_LEADER,
  ROLE,
  ROLE_LEADER,
  RUNTIME_FAULT_REPORT,
  RUNTIME_PHASE,
  RUNTIME_REASON,
} from './raft-rs-runtime-owner-constants.js';

const STEP = 'step';

function report(group, kind, fields) {
  group.reportFault?.(kind, deepFreeze({
    groupId: group.groupId,
    replicaIdentity: group.replicaIdentity,
    peerId: group.peerId,
    ...fields,
  }));
}

function messageFields(message) {
  return {
    from: message?.from ?? null,
    msgType: message?.msgType ?? null,
    term: message?.term ?? null,
    commit: message?.commit ?? null,
    index: message?.index ?? null,
  };
}

// The group is held for a reseed: every further operation and delivery is
// answered with the hold and nothing is stepped again. The hold is in force
// in memory at once; its durable record (the port's lifecycle owner retires
// the replica reseed-required, so a restart is refused the same way) is
// written now when the store admits it, and otherwise - the store holds a
// user transaction, or the write threw (SQLITE_BUSY, IOERR) - by the group's
// next operation or delivery, which keep arriving (its leader keeps sending
// heartbeats, its partition keeps reading its status): no timer of its own.
// The first failed write is one ERROR line; the hold never lapses meanwhile.
function enterReseedHold(group, refused) {
  group.reseedHold = deepFreeze({
    ...refused,
    reason: RUNTIME_REASON.RESEED_REQUIRED,
    recoveryRequired: true,
    detail: {...refused.detail, cause: refused.reason},
  });
  group.reseedHoldRecorded = false;
  group.reseedHoldWriteFailures = 0;
  group.inbound.length = 0;
  recordReseedHold(group);
  return group.reseedHold;
}

/**
 * Write a held group's durable hold if it is not written yet; a no-op once
 * it is, or while the store does not admit a write (the next operation or
 * delivery of the group asks again).
 * @param {Object} group - The runtime group.
 * @return {Object|null} The group's hold, or null when it holds none.
 */
function recordReseedHold(group) {
  if (group.reseedHold === null || group.reseedHoldRecorded ||
      !persistenceAdmitted(group)) {
    return group.reseedHold;
  }
  try {
    group.holdForReseed?.(group.reseedHold);
    group.reseedHoldRecorded = true;
  } catch (error) {
    group.reseedHoldWriteFailures += 1;
    if (group.reseedHoldWriteFailures === 1) {
      report(group, RUNTIME_FAULT_REPORT.RESEED_HOLD_WRITE_FAILED, {
        reason: String(error?.message || error),
        ...(typeof error?.code === 'string' ? {code: error.code} : {}),
      });
    }
  }
  return group.reseedHold;
}

// What the guard reads of the receiving group, as the runtime last observed
// it after a stepped envelope's Ready (the core is not entered for it).
function guardInputs(group) {
  const status = group.lastStatus ?? {};
  return {
    gateOpen: group.gateOpen === true,
    lastIndex: group.persistedLastIndex,
    term: BigInt(status.term ?? 0),
    leaderKnown: (status.lead ?? NO_LEADER) !== NO_LEADER,
    leading: ROLE[status.raftState] === ROLE_LEADER,
    confState: group.statusObservation?.confState ?? null,
  };
}

// The ERROR line of a refusal is rate limited per (group, reason), whoever
// the (unauthenticated) sender claims to be: the first occurrence, then the
// 2nd, 4th, 8th, ... each naming how many occurred - at most log2(n) + 1
// lines for n refusals of one reason, and no timer. The per-sender record
// (recordInboundStepRefusal) still counts every refusal.
function isPowerOfTwo(count) {
  return (count & (count - 1)) === 0;
}

/**
 * Ask the local-log guard about one delivered envelope before it is stepped.
 * @param {Object} group - The runtime group.
 * @param {Object} envelope - The admitted envelope.
 * @param {bigint} runtimeGeneration - The runtime it would be stepped in.
 * @return {Object|null} null to step it; otherwise the frozen refusal (the
 *   group's hold when the refusal proved its own history lost).
 */
function refuseInboundStep(group, envelope, runtimeGeneration) {
  const message = envelope.message;
  const refused = inboundStepRefusal(message, guardInputs(group));
  if (refused === null) {
    return null;
  }
  const occurrences = (group.inboundRefusalReports.get(refused.reason) ?? 0) +
    1;
  group.inboundRefusalReports.set(refused.reason, occurrences);
  const detail = {...messageFields(message),
    localLastIndex: String(group.persistedLastIndex)};
  const outcome = deepFreeze({
    outcome: RAFT_OPERATION_OUTCOME.CORE_REFUSED,
    reason: refused.reason,
    phase: RUNTIME_PHASE.LOCAL_LOG_GUARD,
    retryable: false,
    recoveryRequired: false,
    detail,
  });
  recordInboundStepRefusal(group, envelope, outcome);
  if (refused.holds || isPowerOfTwo(occurrences)) {
    report(group, RUNTIME_FAULT_REPORT.INBOUND_STEP_REFUSED,
      {reason: refused.reason, occurrences, runtimeGeneration, ...detail});
  }
  return refused.holds ? enterReseedHold(group, outcome) : outcome;
}

/**
 * A core call trapped the shared instance: one ERROR line naming the group,
 * the operation and, for a step, the inbound message that reached it.
 * @param {Object} group - The group whose operation trapped.
 * @param {string} operation - The core call.
 * @param {Array} args - Its arguments (a step's first is the message).
 * @param {string} reason - The trap's message.
 * @param {number} runtimeGeneration - The runtime that trapped.
 */
function reportCoreTrap(group, operation, args, reason, runtimeGeneration) {
  report(group, RUNTIME_FAULT_REPORT.CORE_TRAPPED, {operation, reason,
    runtimeGeneration, ...(operation === STEP ? messageFields(args[0]) : {})});
}

/**
 * The shared runtime was replaced: one ERROR line naming the group whose
 * operation found it unhealthy, how many groups were restored, and the
 * restoration that failed, if one did.
 * @param {Object} trigger - The group whose operation replaced it.
 * @param {Object} fields - {runtimeGeneration, groupsRestored, failure}.
 */
function reportRuntimeReplaced(trigger, fields) {
  report(trigger, RUNTIME_FAULT_REPORT.RUNTIME_REPLACED, fields);
}

export {
  recordReseedHold,
  refuseInboundStep,
  reportCoreTrap,
  reportRuntimeReplaced,
};
