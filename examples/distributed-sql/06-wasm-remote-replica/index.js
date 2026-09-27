'use strict';

// Historical lifecycle rehearsal only. Despite the runtime kind used by its
// manifest, this file is JavaScript packed in the legacy envelope; it is not a
// genuine WASM component. Use the request-Binding and account-summary examples
// for the current WASI component path.
module.exports.run = async function run(ctx, batch) {
  const localRows = [];
  // Use one row only to select a bounded lookup target. The point of the
  // example is remote-replica routing/lifecycle evidence, not a broad scan.
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

  // These fields are evidence consumed by the example contract. In particular,
  // `artifactEnvelopeExecuted` means the legacy envelope executed; it must not
  // be read as proof that JavaScript was compiled to WASM.
  return [{
    artifactEnvelopeExecuted: true,
    remotePartitionReplica: Boolean(batch.partitionId),
    partitionId: batch.partitionId,
    inputRows: Array.isArray(batch.rows) ? batch.rows.length : 0,
    localRowsSeen: localRows.length,
  }];
};
