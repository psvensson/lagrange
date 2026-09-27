'use strict';

// Legacy mechanics example: turn the outer batch into one bounded nested query,
// then ask the callback runtime to deliver that query's rows to a stage function
// in batches of two. This demonstrates bounded staging, not a recommended
// current deployment API.
module.exports.run = async function run(ctx, batch) {
  // Deduplicate first so the nested lookup is bounded by distinct keys rather
  // than by however many duplicate rows happened to arrive in the outer batch.
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
  // `batchSize: 2` controls how many nested-query rows reach the stage callback
  // at once; it does not change the SQL LIMIT or the outer partition batch.
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
