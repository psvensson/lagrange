import assert from 'node:assert/strict';

import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';

function isIncompleteLedgerRead(sql) {
  return String(sql).includes(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) &&
    String(sql).includes('workflow_step IN');
}

function injectOperationLedgerReadPressure({
  gateway, timeSource, pressureMs, isPressured = () => true,
}) {
  const reads = [];
  const receiptByOptions = new WeakMap();
  const execute = gateway.executeQuery.bind(gateway);
  const read = gateway.readAuthoritativeRows.bind(gateway);

  // All three gateway entrypoints reach this one SQL effect.
  gateway.executeQuery = async (sql, params, options) => {
    if (isIncompleteLedgerRead(sql) && isPressured()) {
      const receipt = receiptByOptions.get(options);
      if (receipt) receipt.delays += 1;
      await new Promise((resolve) => timeSource.setTimeout(resolve, pressureMs));
    }
    return execute(sql, params, options);
  };

  // Observe logical owner reads independently of the delayed SQL effect.
  gateway.readAuthoritativeRows = async (table, sql, params, options) => {
    if (!isIncompleteLedgerRead(sql) || !isPressured()) {
      return read(table, sql, params, options);
    }
    const startedAt = timeSource.now();
    const tracedOptions = {...options};
    const receipt = {delays: 0, elapsedMs: null};
    receiptByOptions.set(tracedOptions, receipt);
    try {
      return await read(table, sql, params, tracedOptions);
    } finally {
      receipt.elapsedMs = timeSource.now() - startedAt;
      reads.push(receipt);
    }
  };

  return {pressureMs, reads};
}

function assertSingleOperationLedgerReadPressure({pressureMs, reads}, clockStepMs) {
  assert.ok(reads.length > 0, 'an authoritative incomplete-ledger read encountered pressure');
  for (const {delays, elapsedMs} of reads) {
    assert.equal(delays, 1, 'one logical authoritative read incurs exactly one SQL delay');
    assert.ok(elapsedMs >= pressureMs && elapsedMs <= pressureMs + clockStepMs,
      `one ${pressureMs}ms SQL delay plus one clock tick, observed ${elapsedMs}ms`);
  }
}

export {assertSingleOperationLedgerReadPressure, injectOperationLedgerReadPressure};
