// @ts-nocheck
'use strict';

module.exports.run = async function run(ctx, batch) {
  const rows = [];

  for (const inputRow of batch.rows || []) {
    let configRowsSeen = 0;
    for await (const _cfg of ctx.call(
      'SELECT key, value FROM config WHERE key = ? LIMIT 1',
      [String(inputRow.node_id || '')],
    )) {
      configRowsSeen += 1;
    }

    rows.push({
      nodeId: inputRow.node_id,
      status: inputRow.status,
      configRowsSeen,
    });
  }

  return rows;
};
