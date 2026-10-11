import {PARTICIPANT_TRANSACTION_COMMAND as COMMAND} from
  './partition-participant-transaction-constants.js';
import {participantConnectionStampOf} from
  './partition-participant-transaction-connection.js';
import {participantReleaseAdmissionOf} from
  './partition-participant-transaction-pause.js';
import {readParticipantReleaseLocalCurrent} from
  './partition-participant-release-local-current.js';
import {parseJson, RELEASE_CONTROL_STATE} from
  './partition-participant-release-command.js';
import {readParticipantReleaseState} from
  './partition-participant-transaction-store.js';

const RELEASE_DISPATCH_ADMISSION_REASON = Object.freeze({
  LOCAL_HOLD: 'participant_release_local_hold',
  STALE_CONTROL: 'participant_release_control_stale',
  STALE_INCARNATION: 'participant_release_incarnation_stale',
});

function refusal(reason, detail) {
  return Object.freeze({admitted: false, reason, retryable: true,
    recoveryRequired: false, detail: Object.freeze(detail)});
}

function localTargetStillCurrent(service, target) {
  const status = service.raft?.readStatus();
  const connection = participantConnectionStampOf(service.db);
  const admission = participantReleaseAdmissionOf(service);
  return target?.replicaIdentity === service.replicaId &&
    target.nodeId === service.nodeId &&
    target.lifecycleIncarnation === status?.lifecycleIncarnation &&
    target.runtimeGeneration === status?.runtimeGeneration &&
    target.connectionGeneration === connection.generation &&
    target.admissionGeneration === admission.generation;
}

// This is deliberately a local dispatch fence. It consumes the durable exact
// command/slot identity and the service's current local lifecycle facts. The
// deterministic committed predicate remains in release-apply and never sees
// this volatile outcome.
function admitParticipantReleaseProposalDispatch(service, command) {
  if (![COMMAND.RELEASE_FINALIZE, COMMAND.RELEASE_CONFIRM].includes(command?.type)) {
    return null;
  }
  const durable = readParticipantReleaseState(service.db);
  const control = parseJson(durable.controlText);
  const expectedState = command.type === COMMAND.RELEASE_FINALIZE ?
    RELEASE_CONTROL_STATE.RESERVED : RELEASE_CONTROL_STATE.DISPATCHED;
  if (durable.controlRevision !== command.expectedControlRevision ||
      control?.state !== expectedState ||
      control.authorizationId !== command.authorizationId) {
    return refusal(RELEASE_DISPATCH_ADMISSION_REASON.STALE_CONTROL, {
      authorizationId: command.authorizationId,
      expectedControlRevision: command.expectedControlRevision,
      currentControlRevision: durable.controlRevision,
      currentState: control?.state ?? null,
    });
  }
  const current = readParticipantReleaseLocalCurrent(service);
  if (current?.authorizationId !== command.authorizationId) {
    return refusal(RELEASE_DISPATCH_ADMISSION_REASON.LOCAL_HOLD, {
      authorizationId: command.authorizationId,
      replicaIdentity: service.replicaId,
    });
  }
  const targets = parseJson(control.controlTargetEntriesText);
  const target = Array.isArray(targets) ? targets.find((candidate) =>
    candidate?.replicaIdentity === service.replicaId) : null;
  if (JSON.stringify(current.target) !== JSON.stringify(target) ||
      !localTargetStillCurrent(service, target)) {
    return refusal(RELEASE_DISPATCH_ADMISSION_REASON.STALE_INCARNATION, {
      authorizationId: command.authorizationId,
      replicaIdentity: service.replicaId,
    });
  }
  return null;
}

export {admitParticipantReleaseProposalDispatch,
  RELEASE_DISPATCH_ADMISSION_REASON};
