'use strict';

module.exports.run = async function run(ctx, _batch) {
  const stageResults = await ctx.call(
    'SELECT node_id, status FROM nodes ORDER BY node_id LIMIT 6',
    [],
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
