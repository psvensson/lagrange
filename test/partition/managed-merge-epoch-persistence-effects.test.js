import {registerFromRecordAsRead} from './workflow-record-test-support.js';
import {test} from '../../src/test-helpers/tap.js';
import {
  MANAGED_MERGE_ERROR_MSG,
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
} from '../../src/partition/partition-constants.js';
import {
  buildMergeWorkflow,
  createThreePartitionInfos,
  FIXTURE_SIBLING_PARTITION_ID,
} from './managed-merge-workflow-test-helpers.js';

function buildMergeWorkflowRecord(workflowId) {
  return {
    workflowId,
    ownerKey: 'users-p1',
    tableId: 'tbl-users',
    tableName: 'users',
    partitionId: 'users-p1',
    status: PARTITION_TRANSITION_STATE.MERGE_BACKFILLING,
    metadata: {
      [PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID]: workflowId,
      [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION]: 2,
      [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS]: [
        'users-p-merged',
      ],
      [PARTITION_TRANSITION_METADATA_FIELD.SOURCE_PARTITION_IDS]: [
        'users-p1',
        'users-p2',
      ],
    },
    createdAt: 1000,
    updatedAt: 1000,
  };
}

test('merge transition persistence fails closed when no CDC bridge is ' +
  'wired — in-memory status must not silently advance', async (t) => {
  const {workflow} = buildMergeWorkflow();
  const record = buildMergeWorkflowRecord('merge-no-cdc');
  await registerFromRecordAsRead(workflow, record);
  workflow.getCDCIntegrationService = () => null;

  // The record's encoder throws TRANSITION_PERSIST_UNAVAILABLE (mirrors the
  // split no-CDC test): nothing is written.
  await t.rejects(
    workflow.workflowCoordinator.updateWorkflow(record.workflowId,
      (current) => ({...current,
        status: PARTITION_TRANSITION_STATE.MERGE_CATCHUP})),
    {message: MANAGED_MERGE_ERROR_MSG.TRANSITION_PERSIST_UNAVAILABLE},
  );
  const current = workflow.workflowCoordinator.getWorkflowById(
    record.workflowId,
  );
  t.equal(
    current.status,
    PARTITION_TRANSITION_STATE.MERGE_BACKFILLING,
    'a missing durable write path must leave the in-memory phase unchanged',
  );
});

test('merge sibling promotion refuses a zero-row partition epoch ' +
  'update', async (t) => {
  const {workflow} = buildMergeWorkflow({
    partitionInfos: createThreePartitionInfos(),
    cdcIntegrationService: {
      async updateSystemTableRow() {
        // Stale where-clause / vanished descriptor: no row changed.
        return {success: true, affectedRows: 0};
      },
      async insertSystemTableRow() {
        return {success: true};
      },
      async deleteSystemTableRow() {
        return {success: true};
      },
    },
  });

  await t.rejects(
    workflow.promoteSiblingPartitionVersion(FIXTURE_SIBLING_PARTITION_ID, 2),
    /did not take effect/,
    'a sibling promotion that lands zero rows must throw — carrying a ' +
    'sibling forward on a phantom write strands its key range',
  );
});

test('merge terminal transition clear refuses a zero-row tables ' +
  'update', async (t) => {
  let zeroRows = false;
  const {workflow} = buildMergeWorkflow();
  const cdc = workflow.getCDCIntegrationService();
  const update = cdc.updateSystemTableRow.bind(cdc);
  cdc.updateSystemTableRow = async (...args) => (zeroRows ?
    {success: true, affectedRows: 0} : update(...args));
  workflow.readAuthoritativeWorkflowRecord = async () => {
    throw new Error('tables owner unavailable');
  };
  const registered = await registerFromRecordAsRead(workflow,
    buildMergeWorkflowRecord('merge-terminal-clear'));
  zeroRows = true;

  await t.rejects(
    workflow.persistTerminalTransitionClear(registered),
    /did not land|refused/,
    'a terminal clear that lands zero rows would wedge the table in ' +
    'transition state forever — it must throw',
  );
});
