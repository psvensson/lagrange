// @ts-nocheck
'use strict';

module.exports.run = async function run(ctx, batch) {
  for (const row of batch.rows || []) {
    const key = row.status || 'unknown';
    await ctx.emit(key, {
      nodeId: row.node_id,
      status: row.status,
    });
  }

  const reduced = await ctx.call(
    {kind: 'reduceByKey'},
    [],
    async (group) => ({
      status: group.key,
      nodeCount: group.records.length,
    }),
  );

  return reduced;
};
