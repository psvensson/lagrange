// A current-row/contended observation is not a committed answer for an incoming
// entry. The caller confirms row authority independently; contention preserves
// the caller's uncommitted entry and its exact owned clearing evidence.
import {LEDGER_PARTITION_ID} from '../partition/partition-placement-admission-decision.js';
import {PLACEMENT_ADMISSION_ERROR} from '../partition/partition-placement-admission-constants.js';
import {RETAINED_REPAIR_DECISION as DECISION} from './replica-operation-retained-repair-record.js';

const OBSERVED_DECISIONS = Object.freeze(Object.values(DECISION)
  .filter((state) => state !== DECISION.UNOBSERVED));

function retainedRepairObservationReply(service, payload, decision) {
  return {success: false, partitionId: service.partitionId,
    failureCode: decision.state === DECISION.UNAVAILABLE ?
      PLACEMENT_ADMISSION_ERROR.OWNER_UNAVAILABLE : PLACEMENT_ADMISSION_ERROR.REPAIR_PENDING,
    retainedRepairObservation: {state: decision.state, result: decision.result,
      entryId: payload.entryId, bodyText: JSON.stringify(payload.body),
      operationId: payload.body.operation.operationId, createdAt: payload.body.operation.createdAt,
      nodeId: service.nodeId, replicaId: service.replicaId}};
}

function repairObservationEnvelopeIsValid(answer) {
  return [answer.success === false, answer.committed === undefined,
    answer.entryId === undefined, answer.placementResult === undefined,
    answer.admitted === undefined, answer.partitionId === LEDGER_PARTITION_ID].every(Boolean);
}

function matchesRetainedRepairObservation(answer, attempt) {
  const observation = answer?.retainedRepairObservation;
  if (!observation || !repairObservationEnvelopeIsValid(answer)) return false;
  const failureCode = observation.state === DECISION.UNAVAILABLE ?
    PLACEMENT_ADMISSION_ERROR.OWNER_UNAVAILABLE : PLACEMENT_ADMISSION_ERROR.REPAIR_PENDING;
  if (answer.failureCode !== failureCode) return false;
  const expected = {entryId: attempt.entryId, bodyText: JSON.stringify(attempt.body),
    operationId: attempt.operation.operationId, createdAt: attempt.operation.createdAt};
  const bodyMatches = Object.keys(expected).every((key) => observation[key] === expected[key]);
  const ownerMatches = attempt.expectedOwner !== null &&
    observation.nodeId === attempt.expectedOwner.nodeId &&
    observation.replicaId === attempt.expectedOwner.replicaId;
  return bodyMatches && ownerMatches && OBSERVED_DECISIONS.includes(observation.state);
}

export {retainedRepairObservationReply, matchesRetainedRepairObservation};
