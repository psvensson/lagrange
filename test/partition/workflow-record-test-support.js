/**
 * Register a workflow in a split/merge owner's coordinator the way the
 * production paths do: derived from the record AS READ, so its first write is
 * a compare-and-swap on that record (managed-workflow-record-store.js).
 */
import {recordWitnessOf} from
  '../../src/partition/managed-workflow-record-store.js';

/**
 * @param {Object} owner - ManagedSplitWorkflow / ManagedMergeWorkflow.
 * @param {Object} record - The registration record (carries tableId).
 * @return {Promise<Object>} The registered workflow.
 */
function registerFromRecordAsRead(owner, record) {
  const row = (owner.listTableInfos?.() || []).find((candidate) =>
    String(candidate?.table_id ?? '') === String(record.tableId)) ?? null;
  return owner.workflowCoordinator.registerWorkflow({...record,
    recordWitness: recordWitnessOf(row)});
}

export {registerFromRecordAsRead};
