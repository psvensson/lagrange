'use strict';

// Legacy mechanics example: a partition callback may perform a nested lookup
// when that lookup is explicitly bounded. `LIMIT 1` is the important part:
// nested work must not quietly turn a small outer batch into an unbounded fanout.
module.exports.run = async function run(ctx, batch) {
  const rows = [];

  // Each outer row produces at most one config row, so work remains proportional
  // to the bounded input batch.
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
