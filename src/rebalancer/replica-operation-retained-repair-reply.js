// A current-row/contended observation is not a committed answer for an incoming
// entry. The caller confirms row authority independently; contention preserves
// the caller's uncommitted entry and its exact owned clearing evidence.
import {LEDGER_PARTITION_ID} from '../partition/partition-placement-admission-decision.js';
import {PLACEMENT_ADMISSION_ERROR} from '../partition/partition-placement-admission-constants.js';
import {RETAINED_REPAIR_DECISION as DECISION, RETAINED_REPAIR_BINDING as BINDING,
  RETAINED_REPAIR_ENTRY as ENTRY} from './replica-operation-retained-repair-record.js';

const OBSERVED_DECISIONS = Object.freeze(Object.values(DECISION)
  .filter((state) => state !== DECISION.UNOBSERVED));
// The typed reason of a receiver that holds no ledger tenure (not leader, or a
// later term, or shutting down): it disclaims custody of the entry.
const RETAINED_REPAIR_DISCLAIM = 'receiver_without_ledger_tenure';

function retainedRepairObservationReply(service, payload, decision) {
  return {success: false, partitionId: service.partitionId,
    failureCode: decision.state === DECISION.UNAVAILABLE ?
      PLACEMENT_ADMISSION_ERROR.OWNER_UNAVAILABLE : PLACEMENT_ADMISSION_ERROR.REPAIR_PENDING,
    retainedRepairObservation: {state: decision.state, result: decision.result,
      reason: decision.reason, entryId: payload.entryId, bodyText: JSON.stringify(payload.body),
      operationId: payload.body.operation.operationId, createdAt: payload.body.operation.createdAt,
      nodeId: service.nodeId, replicaId: service.replicaId}};
}

function retainedRepairDisclaim(service, payload) {
  return retainedRepairObservationReply(service, payload,
    {state: DECISION.UNAVAILABLE, reason: RETAINED_REPAIR_DISCLAIM});
}

function repairObservationEnvelopeIsValid(answer) {
  return [answer.success === false, answer.committed === undefined,
    answer.entryId === undefined, answer.placementResult === undefined,
    answer.admitted === undefined, answer.partitionId === LEDGER_PARTITION_ID].every(Boolean);
}

// An observation reply settles nothing by itself; it is accepted only from the
// binding the sender's decision presented the exact pinned entry to.
function matchesRetainedRepairObservation(answer, attempt, binding) {
  const observation = answer?.retainedRepairObservation;
  if (!observation || !repairObservationEnvelopeIsValid(answer) ||
      attempt.entry.state !== ENTRY.PINNED) return false;
  const failureCode = observation.state === DECISION.UNAVAILABLE ?
    PLACEMENT_ADMISSION_ERROR.OWNER_UNAVAILABLE : PLACEMENT_ADMISSION_ERROR.REPAIR_PENDING;
  if (answer.failureCode !== failureCode) return false;
  const expected = {entryId: attempt.entry.entryId, bodyText: JSON.stringify(attempt.entry.body),
    operationId: attempt.operation.operationId, createdAt: attempt.operation.createdAt};
  const bodyMatches = Object.keys(expected).every((key) => observation[key] === expected[key]);
  const ownerMatches = (binding.state === BINDING.LOCAL || binding.state === BINDING.REMOTE) &&
    observation.nodeId === binding.nodeId && observation.replicaId === binding.replicaId;
  return bodyMatches && ownerMatches && OBSERVED_DECISIONS.includes(observation.state);
}

export {RETAINED_REPAIR_DISCLAIM, retainedRepairObservationReply, retainedRepairDisclaim,
  matchesRetainedRepairObservation};
