/**
 * SQL-statement parser coverage matrix
 * (quest sql-statement-parser-coverage).
 *
 * The codebase classifies and extracts from SQL statement TEXT at several
 * independent seams. When the write path started emitting a new variant
 * (INSERT OR IGNORE, from replica-operation-insert-retry-idempotency), one
 * seam (the CDC parameterized-INSERT extractor) didn't recognize it, fell
 * through to literal parsing, and emitted CDC events whose every column was
 * the string '?' — cluster-wide read-model garbage (affinity-demo run 18).
 *
 * This matrix pins every emitted INSERT variant against every SQL-text
 * parser seam, so adding a variant (or a parser) without covering the
 * cross-product fails HERE, statically, instead of in a live cluster.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  extractParamInsertData,
} from '../../src/partition/partition-cdc-parameterized-sql.js';
import {
  extractDataFromParameterizedSQL,
  extractInsertDataFromSQL,
  hasSqlParameterPlaceholders,
} from '../../src/partition/partition-sql-parser.js';
import {
  PARTITION_CDC_EVENT_BUILD_STATE,
  PARTITION_CDC_EVENT_SKIP_REASON,
  PartitionCDCGenerator,
} from '../../src/partition/partition-cdc-generator.js';
import {CDCSqlBuilder} from '../../src/cdc/cdc-sql-builder.js';
import {
  CDCRoutedMutationReadiness,
} from '../../src/cdc/cdc-routed-mutation-readiness.js';

const silentLogger = {info() {}, warn() {}, error() {}, debug() {}};

// Every INSERT variant the write path can emit today:
// - plain INSERT (default mutations)
// - INSERT OR REPLACE (upsertSystemTableRow)
// - INSERT OR IGNORE (ignoreExisting mutations — idempotent op-row inserts)
const INSERT_VARIANTS = [
  {name: 'plain', prefix: 'INSERT INTO'},
  {name: 'or-replace', prefix: 'INSERT OR REPLACE INTO'},
  {name: 'or-ignore', prefix: 'INSERT OR IGNORE INTO'},
];

function paramSql(prefix) {
  return `${prefix} some_table (id, label, weight) VALUES (?, ?, ?)`;
}

function literalSql(prefix) {
  return `${prefix} some_table (id, label, weight) ` +
    'VALUES (\'row-1\', \'alpha\', 3)';
}

test('parameterized INSERT extraction (partition-cdc-parameterized-sql) covers every variant',
  async (t) => {
    for (const variant of INSERT_VARIANTS) {
      const data = extractParamInsertData({
        sql: paramSql(variant.prefix),
        params: ['row-1', 'alpha', 3],
        tableName: 'some_table',
        logger: silentLogger,
        fetchInsertRow: (_table, _keyCol, _keyVal, extracted) => extracted,
      });
      t.same(
        data,
        {id: 'row-1', label: 'alpha', weight: 3},
        `${variant.name}: params must bind to columns — a fall-through here ` +
          'emits \'?\' placeholder strings as CDC row data',
      );
    }
  });

test('parameterized extraction (partition-sql-parser) covers every variant',
  async (t) => {
    for (const variant of INSERT_VARIANTS) {
      const data = extractDataFromParameterizedSQL(
        paramSql(variant.prefix),
        ['row-1', 'alpha', 3],
        'some_table',
        'INSERT',
        silentLogger,
      );
      t.equal(
        data?.id,
        'row-1',
        `${variant.name}: parameterized extraction must bind params`,
      );
    }
  });

test('literal-values INSERT extraction (partition-sql-parser) covers every variant',
  async (t) => {
    for (const variant of INSERT_VARIANTS) {
      const data = extractInsertDataFromSQL(
        literalSql(variant.prefix),
        'some_table',
        null,
        silentLogger,
      );
      t.equal(
        data?.id,
        'row-1',
        `${variant.name}: literal extraction must parse values`,
      );
      t.equal(data?.label, 'alpha', `${variant.name}: string literal parsed`);
    }
  });

test('CDC operation classification (partition-cdc-generator) covers every variant',
  async (t) => {
    const classify = (sql) =>
      PartitionCDCGenerator.prototype.determineOperation.call(
        {logger: silentLogger},
        {type: 'QUERY', sql},
      );

    const plain = classify(paramSql('INSERT INTO'));
    t.equal(plain.entryType, 'INSERT', 'plain INSERT classifies as INSERT');

    const orReplace = classify(paramSql('INSERT OR REPLACE INTO'));
    t.equal(
      orReplace.entryType,
      'UPSERT',
      'OR REPLACE classifies as UPSERT (upsertSystemTableRow contract)',
    );

    // Documented intent: an OR-IGNORE insert classifies as INSERT. On a
    // collision the emitted CDC data comes from the fetched DURABLE row
    // (not the attempted values), and subscriber apply is an HLC-guarded
    // upsert — so re-emitting the existing row as INSERT is idempotent.
    const orIgnore = classify(paramSql('INSERT OR IGNORE INTO'));
    t.equal(
      orIgnore.entryType,
      'INSERT',
      'OR IGNORE classifies as INSERT (idempotent re-emit of the durable row)',
    );
  });

test('table-name extraction seams cover every variant', async (t) => {
  for (const variant of INSERT_VARIANTS) {
    const builderResult = CDCSqlBuilder.prototype.extractTableNameResult.call(
      {},
      paramSql(variant.prefix),
    );
    t.equal(
      builderResult?.tableName,
      'some_table',
      `${variant.name}: cdc-sql-builder must find the table name`,
    );

    const readinessResult =
      CDCRoutedMutationReadiness.prototype.extractTableNameFromSQL.call(
        {},
        paramSql(variant.prefix),
      );
    t.equal(
      readinessResult?.tableName,
      'some_table',
      `${variant.name}: cdc-routed-mutation-readiness must find the table name`,
    );
  }
});

test('sqlite-store operation prefix patterns cover every variant', async (t) => {
  const {SQLITE_STORE_OPERATION_PATTERN} = await import(
    '../../src/storage/sqlite-store-constants.js'
  );
  for (const variant of INSERT_VARIANTS) {
    t.ok(
      SQLITE_STORE_OPERATION_PATTERN.INSERT.test(
        paramSql(variant.prefix).toUpperCase(),
      ),
      `${variant.name}: sqlite-store must classify as INSERT`,
    );
  }
});

test('every INSERT variant handles ? in string literals and comments without misclassifying as placeholders',
  async (t) => {
    const generator = new PartitionCDCGenerator({
      partitionId: 'matrix-p1',
      replicaId: 'matrix-r1',
      tableName: 'some_table',
      logger: silentLogger,
    });

    for (const variant of INSERT_VARIANTS) {
      const literalWithQuestionAndComments =
        `${variant.prefix} some_table (id, label, weight) /* why? */ ` +
        'VALUES (\'row-1\', \'why?\', 3) -- trailing why?';
      t.equal(
        hasSqlParameterPlaceholders(literalWithQuestionAndComments),
        false,
        `${variant.name}: ? inside string literal/comments is not a placeholder`,
      );
      t.same(
        extractInsertDataFromSQL(
          literalWithQuestionAndComments,
          'some_table',
          null,
          silentLogger,
        ),
        {id: 'row-1', label: 'why?', weight: 3},
        `${variant.name}: literal extraction preserves ? inside string literal`,
      );

      const builtLiteral = generator.buildEvent({
        type: 'QUERY',
        sql: literalWithQuestionAndComments,
        params: [],
        timestamp: '10',
        changes: 1,
      });
      t.equal(builtLiteral.state, PARTITION_CDC_EVENT_BUILD_STATE.BUILT);
      t.equal(builtLiteral.cdcEvent.data.id, 'row-1');
      t.equal(builtLiteral.cdcEvent.data.label, 'why?');

      const paramWithComments =
        `${variant.prefix} some_table (id, label, weight) /* why? */ VALUES (?, ?, ?) -- why?`;
      t.equal(hasSqlParameterPlaceholders(paramWithComments), true);
      t.same(
        extractParamInsertData({
          sql: paramWithComments,
          params: ['row-1', 'why?', 3],
          tableName: 'some_table',
          logger: silentLogger,
          fetchInsertRow: (_t, _k, _v, extracted) => extracted,
        }),
        {id: 'row-1', label: 'why?', weight: 3},
        `${variant.name}: parameterized extraction tolerates ? in comments`,
      );

      const missingParamsResult = generator.buildEvent({
        type: 'QUERY',
        sql: paramSql(variant.prefix),
        params: [],
        timestamp: '10',
        changes: 1,
      });
      t.equal(
        missingParamsResult.state,
        PARTITION_CDC_EVENT_BUILD_STATE.SKIPPED,
        `${variant.name}: unquoted ? with empty params must be skipped`,
      );
      t.equal(
        missingParamsResult.reasonCode,
        PARTITION_CDC_EVENT_SKIP_REASON.INCOMPLETE_ROW_PAYLOAD,
        `${variant.name}: missing params skips as INCOMPLETE_ROW_PAYLOAD`,
      );
    }
  });
