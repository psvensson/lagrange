// The inherited audit's own twelve receipts, re-run (quest
// overflow-budget-audit-evidence-binding, receipt
// inherited-audit-receipts-still-green).
//
// The superseded quest's receipt record is history: it is READ here and never
// rewritten, and its evidence harness is not run, because that harness writes
// into the closed quest's directory. What this test takes from the record is
// the twelve proof commands it recorded - which file, which named test - and
// it re-executes each one against THIS worktree. The successor changes the
// audit's representation and its validator; if any of that breaks an
// inherited proof, this receipt turns red rather than the change passing on
// the strength of a record written before it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  CLOSED_AUDIT_RECEIPT,
  inheritedReceiptDeclarations,
  runNamedTestConcurrently,
} from './overflow-budget-evidence-support.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

if (!ConfigurationManager.getInstance().isInitialized()) {
  ConfigurationManager.getInstance().initialize({});
}
if (!LoggingService.getInstance().isInitialized()) {
  LoggingService.getInstance().initialize({level: 'error'});
}

const CLOSED_QUEST = 'critical-spread-overflow-budget-audit';
const INHERITED_RECEIPT_COUNT = 12;
const RECORD_PASSED = 'pass';

test('the twelve inherited audit receipts are re-run and green', async () => {
  assert.ok(fs.existsSync(CLOSED_AUDIT_RECEIPT),
    `the superseded quest keeps its receipt record: ${CLOSED_AUDIT_RECEIPT}`);
  const record = inheritedReceiptDeclarations();
  assert.equal(record.quest, CLOSED_QUEST,
    'the record read is the superseded audit\'s own');
  assert.equal(record.status, RECORD_PASSED,
    'and it recorded a passing run');
  assert.equal(record.receipts.length, INHERITED_RECEIPT_COUNT,
    'with the twelve receipts the audit declared');
  for (const receipt of record.receipts) {
    assert.ok(receipt.testFile && receipt.pattern,
      `each recorded command names a file and a named test: ${receipt.id}`);
    assert.ok(fs.existsSync(receipt.testFile),
      `and that file is still in this worktree: ${receipt.id}`);
  }
  const runs = await Promise.all(record.receipts.map((receipt) =>
    runNamedTestConcurrently(receipt.testFile, receipt.pattern)));
  const failed = record.receipts
    .filter((receipt, index) => !runs[index].passed)
    .map((receipt) => receipt.id);
  assert.deepEqual(failed, [],
    `the inherited proof still holds in this worktree: ${failed.join(', ')}`);
});
