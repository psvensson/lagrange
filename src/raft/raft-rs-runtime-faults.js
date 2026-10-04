// What the runtime owner does with a fault it observes: a delivered envelope
// the local-log guard refused (recorded against its sender, reported once
// per sender and reason, and - when it proves this replica's own history
// lost - the group held for a reseed), a core trap, and a runtime
// replacement. The structured log line is written by the port's reporter,
// injected on the group, so the runtime owner's import closure stays free of
// logging (restore-path fence).

import {deepFreeze} from './raft-operation-port.js';
import {RAFT_OPERATION_OUTCOME} from './raft-operation-port-constants.js';
import {inboundStepRefusal} from './raft-rs-local-log-guard.js';
import {recordInboundStepRefusal} from './raft-rs-peer-delivery.js';
import {whenPersistenceAdmitted} from './raft-rs-persistence-admission.js';
import {
  NO_LEADER,
  RUNTIME_FAULT_REPORT,
  RUNTIME_PHASE,
  RUNTIME_REASON,
} from './raft-rs-runtime-owner-constants.js';

const NOT_ADMITTED = Object.freeze({closed: () => null, exceeded: () => null});
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
// answered with the hold, nothing is stepped again, and the port records the
// hold durably (its lifecycle owner) once the store admits a write - the
// hold survives a restart and is never retried.
function enterReseedHold(group, refused) {
  group.reseedHold = deepFreeze({
    ...refused,
    reason: RUNTIME_REASON.RESEED_REQUIRED,
    recoveryRequired: true,
    detail: {...refused.detail, cause: refused.reason},
  });
  group.inbound.length = 0;
  const recorded = whenPersistenceAdmitted(group,
    () => group.holdForReseed?.(group.reseedHold), NOT_ADMITTED);
  recorded?.catch?.(() => undefined);
  return group.reseedHold;
}

// What the guard reads of the receiving group, as the runtime last observed
// it after a stepped envelope's Ready (the core is not entered for it).
function guardInputs(group) {
  const status = group.lastStatus ?? {};
  return {
    gateOpen: group.gateOpen === true,
    lastIndex: group.persistedLastIndex,
    commit: status.commit,
    term: BigInt(status.term ?? 0),
    leaderKnown: (status.lead ?? NO_LEADER) !== NO_LEADER,
    confState: group.statusObservation?.confState ?? null,
  };
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
  const sender = String(message?.from ?? envelope.from);
  const first = group.inboundStepRefusals.get(sender)?.reason !==
    refused.reason;
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
  if (first) {
    report(group, RUNTIME_FAULT_REPORT.INBOUND_STEP_REFUSED,
      {reason: refused.reason, runtimeGeneration, ...detail});
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
  refuseInboundStep,
  reportCoreTrap,
  reportRuntimeReplaced,
};
