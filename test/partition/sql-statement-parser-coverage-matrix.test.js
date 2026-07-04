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
} from '../../src/partition/partition-sql-parser.js';
import {PartitionCDCGenerator} from '../../src/partition/partition-cdc-generator.js';
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
