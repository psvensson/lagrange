import {formAdmittedGroup} from './partition-admitted-group-fixture.js';
// Transport/partition witnesses can inject an acknowledgement outcome while
// reserving on the ordinary managed-workflow coordinator and SQLite CDC store.
import {openRecordStore, parsePartitionTransition, readAuthoritativelyFrom} from './workflow-record-sqlite-world.js';
import {buildWorkflow} from './managed-split-workflow-test-helpers.js';
import {buildMergeWorkflow} from './managed-merge-workflow-test-helpers.js';
import {registerFromRecordAsRead} from './workflow-record-test-support.js';

export function sourceMirrorReservationFixture() {
  const records = new Map();
  return async (family, partitionId, metadata, tableId, tableName) => {
    const key = JSON.stringify([tableId, family, metadata.workflowId, metadata.workflowAttempt]);
    let owner = records.get(key);
    if (!owner) {
      const ids = metadata.sourcePartitionIds ?? [metadata.sourcePartitionId];
      const store = openRecordStore({tableId, tableName,
        partitions: ids.map((id) => ({partition_id: id}))});
      // Registration derives the attempt and initial fence from this generation.
      store.db.prepare('UPDATE tables SET partition_transition_generation = ? WHERE table_id = ?')
        .run(metadata.workflowAttempt - 1, tableId);
      const build = family === 'split' ? buildWorkflow : buildMergeWorkflow;
      owner = build({cdcIntegrationService: store.cdcFor('source-owner'),
        getTableInfo: store.tablesRow, listTableInfos: () => [store.tablesRow()],
        getPartitionInfo: store.partitionRow, parsePartitionTransition,
        groupRetirementScheduler: {setTimeout() {}, clearTimeout() {}}}).workflow;
      readAuthoritativelyFrom(owner, store);
      await registerFromRecordAsRead(owner, {workflowId: metadata.workflowId,
        partitionId, ownerKey: partitionId, tableId, tableName,
        status: family === 'split' ? 'split_backfilling' : 'merge_backfilling',
        metadata: family === 'merge' ? {...metadata, targetPartitionIds: [metadata.targetPartitionId]} : metadata});
      records.set(key, owner);
    }
    return owner.reserveSourceMirrorCustody(family, partitionId, metadata, tableId, tableName);
  };
}

export async function admittedMirrorSource(t, partitionId, columns) {
  const group = await formAdmittedGroup({partitionId, members: [[partitionId + '-r1', 'n1']],
    tempPrefix: 'source-mirror-', budgetMs: 5000,
    serviceOptions: {tableId: 'tbl-users', tableName: 'users', schema: {columns}}});
  t.teardown(() => group.dispose());
  return group.services[0];
}
