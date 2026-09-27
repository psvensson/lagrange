'use strict';

// Legacy mechanics example: one callback batch arrives for one partition.
// For each input row, issue a bounded lookup and collect the rows produced by
// that lookup. The current public analogue is a call Binding whose fixed
// selector feeds partition-local `run()` code; new services should use that
// surface rather than `partition_callback`.
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
