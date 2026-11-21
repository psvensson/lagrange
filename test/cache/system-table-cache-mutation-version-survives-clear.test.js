// The cache owner's per-table mutation version is the change stamp its
// consumers key on ("Version equality across two reads proves no apply landed
// between them", system-table-cache-observation-methods.js). A version that
// repeats after clear() is not a version: a consumer that captured it before
// clear() would take different rows for unchanged ones. Real owner and a real
// version-keyed consumer; no double.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {CDC_OPERATION, COLUMN, NODE_STATE, TABLES} from '../../src/constants/index.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {readMembershipPlanningDerivationVersionKey} from
  '../../src/control-plane/membership-planning-version-key.js';

// Past the consumer's own refresh floor, so each read derives its key anew.
const AFTER_REFRESH_FLOOR_MS = 10_000;

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: 'version-node'},
    logging: {level: 'error'}});
  LoggingService.getInstance().initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

function nodeRow(nodeId, status) {
  return {[COLUMN.NODE_ID]: nodeId, [COLUMN.STATUS]: status};
}

test('SystemTableCache table mutation version never repeats across clear()', () => {
  const cache = new SystemTableCache();
  cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.INSERT,
    nodeRow('version-node-a', NODE_STATE.ACTIVE));
  const before = cache.getTableMutationVersion(TABLES.NODES);
  const keyBefore = readMembershipPlanningDerivationVersionKey(cache, 0);
  cache.clear();
  const afterClear = cache.getTableMutationVersion(TABLES.NODES);
  // Different content, mutated back to the same number of applies.
  cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.INSERT,
    nodeRow('version-node-b', NODE_STATE.JOINING));
  const after = cache.getTableMutationVersion(TABLES.NODES);
  const keyAfter = readMembershipPlanningDerivationVersionKey(cache, AFTER_REFRESH_FLOOR_MS);
  assert.ok(!cache.get(TABLES.NODES, 'version-node-a'), 'setup: clear() removed the earlier row');
  assert.notEqual(afterClear, before, 'clear() is itself a change of every table');
  assert.notEqual(after, before,
    `the version a consumer captured before clear() never recurs (before ${before}, ` +
    `after clear and one apply ${after})`);
  assert.ok(after > afterClear && afterClear > before, 'the version is monotonic');
  assert.notEqual(keyAfter, keyBefore,
    'a consumer keyed on the version sees the cleared and rewritten table as changed');
});
