// A plain REMOVE re-sent at STOPPING: the removal effect already took (its
// subject's row retires or is gone) - the re-send repeats it and needs no
// new evaluation; the row still serves - the first delivery never took
// effect, so the re-send starts a fresh removal and passes every floor the
// first send passed; the row could not be read - a named wait.
import {OPERATION_WORKFLOW_OWNER_SHARED} from './operation-workflow-owner-shared.js';
import {OPERATION_WORKFLOW_OWNER_SEGMENT_7_STAGE_SHARED} from
  './operation-workflow-recovery-reconcile-shared.js';
import {removalSubjectNodeIdOf} from './operation-workflow-replace-witness.js';
import {ReplicaStatus} from './replica-status.js';
import {WORKFLOW_STEP} from '../constants/index.js';
import {readStateField} from '../utils/state-field-read.js';

const {OperationType} = OPERATION_WORKFLOW_OWNER_SHARED;
const {STOPPING_REPLICA_OBSERVATION_STATE} =
  OPERATION_WORKFLOW_OWNER_SEGMENT_7_STAGE_SHARED;
const STOPPING_REMOVE_RESEND = Object.freeze({
  NOT_A_RESEND: 'not_a_resend',
  EFFECT_TAKEN: 'effect_taken',
  STARTS_FRESH: 'starts_fresh',
  SUBJECT_UNOBSERVED: 'subject_unobserved',
});
const STOPPING_REMOVE_RESEND_DEFERRAL = 'Plain REMOVE re-sent at STOPPING ' +
  'waits: its subject\'s row could not be read to tell a repeated effect ' +
  'from a fresh removal, replica ';
const RETIRING_SUBJECT_STATUSES = Object.freeze(new Set([
  ReplicaStatus.REMOVING,
  ReplicaStatus.REMOVED,
  ReplicaStatus.FAILED,
]));

async function classifyStoppingRemoveResend(context, operation) {
  if (operation.type !== OperationType.REMOVE ||
      readStateField(operation.workflowStep) !== WORKFLOW_STEP.STOPPING) {
    return STOPPING_REMOVE_RESEND.NOT_A_RESEND;
  }
  const observation = await context.observeStoppingReplicaProgress(
    operation.replicaId, operation.partitionId,
    removalSubjectNodeIdOf(operation));
  if (observation.state === STOPPING_REPLICA_OBSERVATION_STATE.UNAVAILABLE) {
    return STOPPING_REMOVE_RESEND.SUBJECT_UNOBSERVED;
  }
  return observation.state === STOPPING_REPLICA_OBSERVATION_STATE.ABSENT ||
    RETIRING_SUBJECT_STATUSES.has(observation.lifecycleStatus) ?
    STOPPING_REMOVE_RESEND.EFFECT_TAKEN : STOPPING_REMOVE_RESEND.STARTS_FRESH;
}

export {
  STOPPING_REMOVE_RESEND,
  STOPPING_REMOVE_RESEND_DEFERRAL,
  classifyStoppingRemoveResend,
};
