// @ts-nocheck
'use strict';

module.exports.run = async function run(ctx, batch) {
  const localRows = [];
  const firstBatchRow = Array.isArray(batch.rows) ? batch.rows[0] : null;
  const targetNodeId = firstBatchRow && firstBatchRow.node_id ?
    firstBatchRow.node_id :
    null;

  if (targetNodeId) {
    for await (const nodeRow of ctx.call(
      'SELECT node_id, status FROM nodes WHERE node_id = ?',
      [targetNodeId],
    )) {
      localRows.push({
        nodeId: nodeRow.node_id,
        status: nodeRow.status,
      });
    }
  }

  return [{
    wasmCompiled: true,
    remotePartitionReplica: Boolean(batch.partitionId),
    partitionId: batch.partitionId,
    inputRows: Array.isArray(batch.rows) ? batch.rows.length : 0,
    localRowsSeen: localRows.length,
  }];
};
