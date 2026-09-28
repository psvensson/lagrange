'use strict';

module.exports.run = async function run(ctx, batch) {
  const nodeIds = Array.from(new Set((batch.rows || [])
    .map((row) => row && row.node_id)
    .filter((nodeId) => typeof nodeId === 'string' && nodeId.length > 0)));
  if (nodeIds.length === 0) {
    return [];
  }

  const placeholders = nodeIds.map(() => '?').join(', ');
  const sql =
    'SELECT node_id, status FROM nodes WHERE node_id IN (' +
    placeholders +
    ') ORDER BY node_id LIMIT 6';
  const stageResults = await ctx.call(
    sql,
    nodeIds,
    async (stageBatch, _stageCtx) => {
      return stageBatch.map((row) => ({
        nodeId: row.node_id,
        status: row.status,
        stageBatchSize: stageBatch.length,
      }));
    },
    {batchSize: 2},
  );

  return stageResults.flat();
};
