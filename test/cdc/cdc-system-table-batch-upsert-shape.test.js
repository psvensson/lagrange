/**
 * Regression tests for homogeneous row-shape enforcement in
 * buildSystemTableBatchUpsert and CDCIntegrationService.upsertSystemTableRows.
 */

import {test} from '../../src/test-helpers/tap.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {buildSystemTableBatchUpsert} from
  '../../src/cdc/cdc-system-table-mutation-sql-helpers.js';
import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {createMockSqlQueryEngine} from
  './cdc-integration-service-test-support.js';

ConfigurationManager.getInstance().initialize({});
LoggingService.getInstance().initialize({level: 'error'});

test('buildSystemTableBatchUpsert enforces identical row schemas and rejects undefined values',
  async (t) => {
    t.throws(
      () => buildSystemTableBatchUpsert('logs', []),
      {code: 'CDC_BATCH_UPSERT_EMPTY_ROWS'},
      'rejects an empty batch',
    );
    t.throws(
      () => buildSystemTableBatchUpsert('logs', [null]),
      {code: 'CDC_BATCH_UPSERT_INVALID_ROW'},
      'rejects a non-object row',
    );
    t.throws(
      () => buildSystemTableBatchUpsert('logs', [{}]),
      {code: 'CDC_BATCH_UPSERT_EMPTY_COLUMNS'},
      'rejects a row with no columns',
    );
    t.throws(
      () => buildSystemTableBatchUpsert('logs', [
        {log_id: 'l1', message: 'ok', level: 'INFO'},
        {log_id: 'l2', message: 'missing-level'},
      ]),
      {code: 'CDC_BATCH_UPSERT_HETEROGENEOUS_ROW_SHAPE'},
      'rejects a subsequent row missing a column from the first row',
    );
    t.throws(
      () => buildSystemTableBatchUpsert('logs', [
        {log_id: 'l1', message: 'ok'},
        {log_id: 'l2', message: 'extra-col', level: 'INFO'},
      ]),
      {code: 'CDC_BATCH_UPSERT_HETEROGENEOUS_ROW_SHAPE'},
      'rejects a subsequent row carrying an extra column not in the first row',
    );
    t.throws(
      () => buildSystemTableBatchUpsert('logs', [
        {log_id: 'l1', message: undefined},
      ]),
      {code: 'CDC_BATCH_UPSERT_UNDEFINED_VALUE'},
      'rejects undefined column value in the first row',
    );
    t.throws(
      () => buildSystemTableBatchUpsert('logs', [
        {log_id: 'l1', message: 'ok', metadata: null},
        {log_id: 'l2', message: 'ok', metadata: undefined},
      ]),
      {code: 'CDC_BATCH_UPSERT_UNDEFINED_VALUE'},
      'rejects undefined column value in a subsequent row',
    );

    const reordered = buildSystemTableBatchUpsert('logs', [
      {log_id: 'l1', message: 'first', metadata: null},
      {metadata: {k: 1}, message: 'second', log_id: 'l2'},
    ]);
    t.equal(
      reordered.sql,
      'INSERT OR REPLACE INTO logs (log_id, message, metadata) VALUES (?, ?, ?), (?, ?, ?)',
      'accepts homogeneous rows with identical key sets regardless of property insertion order',
    );
    t.same(
      reordered.params,
      ['l1', 'first', null, 'l2', 'second', '{"k":1}'],
      'binds values aligned to the canonical column order and preserves explicit SQL null',
    );
  },
);

test('CDCIntegrationService - upsertSystemTableRows refuses heterogeneous row shapes before proposing a committed write',
  async (t) => {
    const mockSqlEngine = createMockSqlQueryEngine();
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
      sqlQueryEngine: mockSqlEngine,
    });
    service.initialize();

    await t.rejects(
      service.upsertSystemTableRows(SYSTEM_TABLE_NAME.LOGS, [
        {
          log_id: 'batch-1',
          timestamp: 1000,
          level: 'INFO',
          node_id: 'node-1',
          message: 'first',
          service_id: 'svc-1',
        },
        {
          log_id: 'batch-2',
          timestamp: 1001,
          level: 'INFO',
          node_id: 'node-1',
          message: 'second',
        },
      ]),
      {code: 'CDC_BATCH_UPSERT_HETEROGENEOUS_ROW_SHAPE'},
      'rejects heterogeneous prepared rows with a typed error',
    );
    t.equal(
      mockSqlEngine.executedQueries.length,
      0,
      'must not propose a committed SQL write when batch row schemas diverge',
    );
  },
);
