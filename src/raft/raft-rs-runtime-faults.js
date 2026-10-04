// What the runtime owner does with a delivered envelope the local-log guard
// refused: recorded against its sender, reported once per sender and reason,
// and - when it proves this replica's own history lost - the group held for
// a reseed. The structured log line is written by the port's reporter,
// injected on the group, so the runtime owner's import closure stays free of
// logging (restore-path fence).

import {deepFreeze} from './raft-operation-port.js';
import {RAFT_OPERATION_OUTCOME} from './raft-operation-port-constants.js';
import {inboundStepRefusal} from './raft-rs-local-log-guard.js';
import {recordInboundStepRefusal} from './raft-rs-peer-delivery.js';
import {whenPersistenceAdmitted} from './raft-rs-persistence-admission.js';
import {
  RUNTIME_FAULT_REPORT,
  RUNTIME_PHASE,
  RUNTIME_REASON,
} from './raft-rs-runtime-owner-constants.js';

const NOT_ADMITTED = Object.freeze({closed: () => null, exceeded: () => null});

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
  const refused = inboundStepRefusal(message, {
    gateOpen: group.gateOpen === true,
    lastIndex: group.persistedLastIndex,
    commit: group.lastStatus?.commit,
  });
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

export {refuseInboundStep};
