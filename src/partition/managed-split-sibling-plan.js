// TABLES records every operand before a sibling promotion can be submitted.
// A projected descriptor supplies only a proposed preimage. PARTITIONS
// compares that exact preimage at commit. Restart always uses the issued plan.
import {copyStrictOwnDataRecord} from '../utils/strict-own-data.js';
import {PARTITION_TRANSITION_STATE} from './partition-constants.js';
import {RECORD_CHANGE_REFUSAL, RECORD_UNCHANGED, refuseRecordChange} from './managed-workflow-record-store.js';
import {SIBLING_DESCRIPTOR_ACTION, canonicalSiblingDescriptorIntent} from './partition-sibling-descriptor-effect.js';

// The fields of one issued sibling subject (metadata.splitIssuedSiblings).
const ISSUED_SIBLING_FIELDS = Object.freeze(['partitionId', 'priorAttempt', 'priorVersion',
  'targetVersion']);
const SIBLING_PLAN_ERROR = Object.freeze({
  PREIMAGE_UNAVAILABLE: 'Split sibling descriptor preimage is unavailable',
  PREIMAGE_UNBOUND: 'Cannot bind split sibling descriptor preimage',
  PREIMAGE_INVALID_CODE: 'split-sibling-preimage-invalid',
  PLAN_MISSING: 'Missing split sibling plan',
  PLAN_INVALID_CODE: 'split-sibling-plan-invalid',
  DUPLICATE_SUBJECT: 'Duplicate split sibling descriptor subject',
});

function siblingIntent(tableId, metadata, subject, action) {
  const fields = copyStrictOwnDataRecord(subject);
  if (!fields || Object.keys(fields).length !== ISSUED_SIBLING_FIELDS.length) return null;
  const {partitionId, priorAttempt, priorVersion, targetVersion} = fields;
  if (!Array.isArray(metadata.targetPartitionIds) ||
      metadata.targetPartitionIds.includes(partitionId) ||
      partitionId === metadata.sourcePartitionId ||
      targetVersion !== metadata.targetPartitionVersion ||
      priorVersion !== metadata.splitDescriptorBaseVersion) return null;
  return canonicalSiblingDescriptorIntent({workflowId: metadata.workflowId, tableId,
    workflowAttempt: metadata.workflowAttempt, action,
    partitionId, priorAttempt, priorVersion, targetVersion});
}

function validateSubject(workflow, subject) {
  if (!siblingIntent(workflow.tableId, workflow.metadata, subject,
    SIBLING_DESCRIPTOR_ACTION.PROMOTE)) {
    throw Object.assign(new Error(SIBLING_PLAN_ERROR.PREIMAGE_UNAVAILABLE), {
      code: SIBLING_PLAN_ERROR.PREIMAGE_INVALID_CODE, partitionId: subject?.partitionId});
  }
}

function sameIssuedSiblingPlan(workflow, expected) {
  const issued = workflow.metadata.splitIssuedSiblings;
  if (!Array.isArray(issued)) return false;
  for (const subject of issued) validateSubject(workflow, subject);
  return issued.length === expected.length && issued.every((item, i) =>
    item.partitionId === expected[i].partitionId &&
    item.priorAttempt === expected[i].priorAttempt &&
    item.priorVersion === expected[i].priorVersion &&
    item.targetVersion === expected[i].targetVersion);
}

async function issueSplitSiblingPlan(owner, workflow) {
  const prior = workflow.metadata.splitIssuedSiblings;
  if (!Array.isArray(prior)) {
    throw Object.assign(new Error(SIBLING_PLAN_ERROR.PLAN_MISSING), {
      code: SIBLING_PLAN_ERROR.PLAN_INVALID_CODE});
  }
  const subjects = new Map();
  for (const subject of prior) {
    validateSubject(workflow, subject);
    if (subjects.has(subject.partitionId)) throw new Error(SIBLING_PLAN_ERROR.DUPLICATE_SUBJECT);
    subjects.set(subject.partitionId, subject);
  }
  const activeVersion = workflow.metadata.splitDescriptorBaseVersion;
  const targetVersion = workflow.metadata.targetPartitionVersion;
  for (const partitionId of owner.resolveCutoverSiblingPartitionIds(workflow)) {
    if (subjects.has(partitionId)) continue;
    const row = owner.getPartitionInfo(partitionId);
    if (row?.table_id !== workflow.tableId || row.partition_id !== partitionId ||
        row.partition_version !== activeVersion) {
      throw Object.assign(new Error(SIBLING_PLAN_ERROR.PREIMAGE_UNBOUND), {
        code: SIBLING_PLAN_ERROR.PREIMAGE_INVALID_CODE, partitionId});
    }
    const subject = {partitionId, priorAttempt: row.split_descriptor_attempt,
      priorVersion: row.partition_version, targetVersion};
    validateSubject(workflow, subject);
    subjects.set(partitionId, subject);
  }
  return owner.workflowCoordinator.updateWorkflow(workflow.workflowId, (current, stored) => {
    if (current.status !== PARTITION_TRANSITION_STATE.SPLIT_CATCHUP ||
        current.metadata.splitSourceFailure ||
        current.metadata.workflowAttempt !== workflow.metadata.workflowAttempt ||
        current.fenceToken !== workflow.fenceToken ||
        stored.row.active_partition_version !== activeVersion ||
        !owner.isSplitCutoverAdmissible(current)) {
      return refuseRecordChange(RECORD_CHANGE_REFUSAL.STATE_NOT_EXPECTED);
    }
    // A parallel issuer may have recorded additional subjects. Re-read its
    // plan before sending anything. A stale calculation may not replace it.
    if (!sameIssuedSiblingPlan(current, prior)) {
      return refuseRecordChange(RECORD_CHANGE_REFUSAL.STATE_NOT_EXPECTED);
    }
    for (const subject of subjects.values()) validateSubject(current, subject);
    return subjects.size === prior.length ? RECORD_UNCHANGED : {...current, metadata: {
      ...current.metadata, splitIssuedSiblings: [...subjects.values()]}};
  });
}

export {issueSplitSiblingPlan, sameIssuedSiblingPlan, siblingIntent};
