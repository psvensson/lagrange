'use strict';

// Legacy mechanics example: emit records under a logical key, then reduce the
// complete grouped set. The current call-Binding surface uses numeric
// `emit(key, value)` partials plus an explicit service `reduce()` function, but
// the important idea is the same: move compact partials, not source rows.
module.exports.run = async function run(ctx, batch) {
  // Emission is the exchange boundary. Grouping by status means downstream
  // reduction does not need the original partition scan.
  for (const row of batch.rows || []) {
    const key = row.status || 'unknown';
    await ctx.emit(key, {
      nodeId: row.node_id,
      status: row.status,
    });
  }

  // `reduceByKey` waits for the grouped records and invokes the reducer once per
  // key. The callback returns one compact record for each status value.
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
