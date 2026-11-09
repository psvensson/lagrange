/**
 * Spent-wait witness of the routed write path after attempt 2 of quest
 * replica-admission-from-committed-operation. The write path no longer waits
 * for the writer's cache: with the row absent from the cache (and never
 * arriving), an insert answers at its commit with its position, spends no
 * bound (no wait_bound_spent line) and runs no authoritative repair. The
 * former witness of the deleted 750/250 cache wait is re-derived here from
 * the state that still exists: a commit-answered write over an absent row.
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {HLCTimestamp} from '../../src/hlc/hlc-timestamp.js';
import {captureLogger} from '../test-helpers/wait-bound-spent-capture.js';

const COMMIT_HLC = new HLCTimestamp(1793615397288, 1, 'witness').toString();

beforeEach(() => {
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

test('an insert over a row absent from the cache answers at its commit, ' +
  'spends no bound and repairs nothing', async (t) => {
  const reads = [];
  const cache = {
    has: (table, key) => {
      reads.push(['has', table, key]); return false;
    },
    get: (table, key) => {
      reads.push(['get', table, key]); return null;
    },
    onCacheChange() {},
    offCacheChange() {},
  };
  const service = new CDCIntegrationService({
    nodeId: 'witness-node',
    systemTableCache: cache,
    sqlQueryEngine: {executeQuery: async () =>
      ({success: true, affectedRows: 1, originHlc: COMMIT_HLC})},
  });
  service.initialize();
  const repairs = [];
  service.repairCacheVisibilityHole = async (...args) => {
    repairs.push(args);
    return {visible: false};
  };
  const capture = captureLogger();
  service.logger = capture.logger;

  const answer = await service.insertSystemTableRow(SYSTEM_TABLE_NAME.NODES, {
    node_id: 'node-1', node_address: 'localhost:8080', status: 'active',
    created_at: 1, last_heartbeat: 1});

  t.equal(answer.committed, true, 'the write answers committed');
  t.same(answer.position, {tableName: SYSTEM_TABLE_NAME.NODES,
    key: 'node-1', originHlc: COMMIT_HLC}, 'with its commit position');
  t.same(capture.spent(), [], 'no wait bound is spent');
  t.same(repairs, [], 'no authoritative repair runs');
  t.same(reads, [], 'the write answer reads no projection');
  service.markShuttingDown();
});
