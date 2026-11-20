// Fixture projections consume the production result builders. They do not
// replace repository authority in persistence or reconstruction witnesses.
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  getWorkflowSteps, ReplicaStatus, WORKFLOW_STEP_TO_STATUS,
} from '../../src/rebalancer/replica-operation-progress.js';
import {buildOperationUpdateOutcome} from '../../src/rebalancer/replica-operation-update-outcome.js';
import {buildOperationTransitionOutcome} from '../../src/rebalancer/operation-workflow-transition-outcome.js';
import {REPLICA_OPERATION_UPDATE_DISPOSITION} from '../../src/rebalancer/replica-operation-update-disposition.js';

function buildTerminalOperationFixtureOutcome(operation, {
  failed = false,
  disposition = REPLICA_OPERATION_UPDATE_DISPOSITION.UPDATED,
  persisted = true,
  completedAt = Date.now(),
} = {}) {
  const step = failed ? WORKFLOW_STEP.FAILED : getWorkflowSteps(operation.type).at(-1);
  const projected = {...operation, workflowStep: step,
    status: failed ? ReplicaStatus.FAILED : WORKFLOW_STEP_TO_STATUS[step],
    updatedAt: completedAt, completedAt};
  return buildOperationTransitionOutcome(buildOperationUpdateOutcome({
    persisted, disposition, operation: projected,
  }));
}

export {buildTerminalOperationFixtureOutcome};
