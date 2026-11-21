import {copyOperationOutcomeData} from './replica-operation-update-outcome.js';
import {REPAIR_OBSERVATION} from './replica-operation-retained-repair-observation.js';
import {PLACEMENT_TRIGGER} from './replica-placement-owner-constants.js';

const RETAINED_REPAIR_DECISION = Object.freeze({UNOBSERVED: 'unobserved',
  EXACT: 'exact', CHANGED: 'changed',
  ABSENT: 'absent', UNAVAILABLE: 'unavailable', CONTENDED: 'contended', PENDING: 'pending'});
const RETAINED_REPAIR_MODE = Object.freeze({CONFIRM: 'confirm', RETRY: 'retry',
  HANDOFF: 'handoff', JOIN: 'join', REFRESH: 'refresh'});

function retainedRepairRecord(operation, entryId, body) {
  return {operation: copyOperationOutcomeData(operation), entryId, body,
    blockers: null, occupancy: null, pending: null, lastAnswer: null,
    lastDecision: {state: RETAINED_REPAIR_DECISION.UNOBSERVED},
    observations: REPAIR_OBSERVATION.NONE, retryObservations: REPAIR_OBSERVATION.NONE,
    minimumLedgerIndex: 0, minimumLedgerTerm: 0, expectedOwner: null,
    observedRoute: null, routeUnavailable: false,
    nativeIngressTerm: null, nativeIngressExpected: false,
    clearingTrigger: PLACEMENT_TRIGGER.LEDGER_COMMIT};
}

function materializeRepairContention(result, rows) {
  if (!Array.isArray(result.operationIds) || result.operationIds.length === 0) return result;
  const blockingOperations = result.operationIds.map((operationId) => {
    const row = rows.find((candidate) => candidate.operation_id === operationId);
    return {operationId, createdAt: row.created_at, workflowStep: row.workflow_step,
      completedAt: row.completed_at};
  });
  return {...result, blockingOperations};
}

export {RETAINED_REPAIR_DECISION, RETAINED_REPAIR_MODE, retainedRepairRecord,
  materializeRepairContention};
