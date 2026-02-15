'use strict';

module.exports.run = async function run(ctx, batch) {
  const rows = [];
  for await (const nodeRow of ctx.call(
    'SELECT node_id, status FROM nodes ORDER BY node_id LIMIT 5',
  )) {
    rows.push({
      partitionId: batch.partitionId,
      nodeId: nodeRow.node_id,
      status: nodeRow.status,
    });
  }
  return rows;
};
