/**
 * Register a workflow in a split/merge owner's coordinator the way the
 * production paths do: the registration is the ownership claim, a change of
 * the record applied only while the record is still the row the owner read
 * (managed-workflow-record-coordinator.js registerWorkflowFromRead).
 */
import {PARTITION_TRANSITION_METADATA_FIELD} from
  '../../src/partition/partition-constants.js';

const SOURCE = PARTITION_TRANSITION_METADATA_FIELD.SOURCE_PARTITION_ID;
const WORKFLOW_ID = PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID;
const SOURCES = PARTITION_TRANSITION_METADATA_FIELD.SOURCE_PARTITION_IDS;

/**
 * @param {Object} owner - ManagedSplitWorkflow / ManagedMergeWorkflow.
 * @param {Object} record - The registration record (carries tableId).
 * @return {Promise<Object>} The registered workflow (its projection).
 */
async function registerFromRecordAsRead(owner, record) {
  const row = (owner.listTableInfos?.() || []).find((candidate) =>
    String(candidate?.table_id ?? '') === String(record.tableId)) ?? null;
  const metadata = {[WORKFLOW_ID]: record.workflowId,
    ...(record.metadata || {})};
  if (!metadata[SOURCE] && !metadata[SOURCES] && record.partitionId) {
    // A split record names its source (production registration always does).
    metadata[SOURCE] = record.partitionId;
  }
  const registration = await owner.workflowCoordinator
    .registerWorkflowFromRead({...record, metadata}, row);
  if (!registration.workflow) {
    throw new Error(`registration refused: ${registration.refusal}`);
  }
  return registration.workflow;
}

/**
 * Set one participant on the record (test setup through the production
 * path: a change of the record applied by its owner at its turn).
 * @param {Object} owner
 * @param {string} workflowId
 * @param {Object} participant - Carries participantKey.
 * @return {Promise<Object>} The projection.
 */
function recordParticipant(owner, workflowId, participant) {
  return owner.workflowCoordinator.updateWorkflow(workflowId, (current) => {
    const participants = new Map(current.participants);
    participants.set(participant.participantKey, {workflowId,
      participantId: participant.participantKey,
      ...(participants.get(participant.participantKey) || {}),
      ...participant});
    return {...current, participants};
  });
}

export {recordParticipant, registerFromRecordAsRead};
