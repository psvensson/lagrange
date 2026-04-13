// @ts-nocheck
'use strict';

module.exports.run = async function run(ctx, batch) {
  const rows = [];
  for (const inputRow of batch.rows || []) {
    if (!inputRow || !inputRow.node_id) {
      continue;
    }
    for await (const nodeRow of ctx.call(
      'SELECT node_id, status FROM nodes WHERE node_id = ?',
      [inputRow.node_id],
    )) {
      rows.push({
        partitionId: batch.partitionId,
        nodeId: nodeRow.node_id,
        status: nodeRow.status,
      });
    }
  }
  return rows;
};
