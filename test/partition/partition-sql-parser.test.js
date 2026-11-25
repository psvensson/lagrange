import {describe, it} from 'node:test';
import assert from 'node:assert';
import {
  countSqlParameterPlaceholders,
  extractConjunctiveWhereColumns,
  extractDataFromParameterizedSQL,
  extractDeleteDataFromSQL,
  extractInsertDataFromSQL,
  extractInsertRowsFromSQL,
  extractUpdateDataFromSQL,
  hasSqlParameterPlaceholders,
} from '../../src/partition/partition-sql-parser.js';
import {
  PARTITION_SERVICE_OPERATION,
} from '../../src/partition/partition-service-constants.js';

describe('partition-sql-parser', () => {
  const logger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  };

  it('extracts conjunctive WHERE columns from nested parentheses', () => {
    const columns = extractConjunctiveWhereColumns(
      '(((service_id = ?) AND (service_type = ?)) AND (node_id = ?))',
    );

    assert.deepStrictEqual(columns, [
      'service_id',
      'service_type',
      'node_id',
    ]);
  });

  it('extracts parameterized DELETE data from nested parentheses', () => {
    const data = extractDataFromParameterizedSQL(
      'DELETE FROM services WHERE (((service_id = ?) AND ' +
        '(service_type = ?)) AND (node_id = ?))',
      ['svc-1', 'partition', 'node-1'],
      'services',
      PARTITION_SERVICE_OPERATION.DELETE,
      logger,
    );

    assert.deepStrictEqual(data, {
      service_id: 'svc-1',
      service_type: 'partition',
      node_id: 'node-1',
    });
  });

  it('extracts parameterized UPDATE data from multiline SQL and preserves SET value', () => {
    const data = extractDataFromParameterizedSQL(
      'UPDATE storage_reservations\n' +
        'SET status = ?, updated_at = ?, released_at = ?\n' +
        'WHERE reservation_id = ? AND status = ?',
      ['released', 1710000000000, 1710000000000, 'res-1', 'active'],
      'storage_reservations',
      PARTITION_SERVICE_OPERATION.UPDATE,
      logger,
    );

    assert.deepStrictEqual(data, {
      status: 'released',
      updated_at: 1710000000000,
      released_at: 1710000000000,
      reservation_id: 'res-1',
    });
  });

  it('extracts parameterized DELETE data from multiline SQL', () => {
    const data = extractDataFromParameterizedSQL(
      'DELETE FROM services\n' +
        'WHERE service_id = ?\n' +
        'AND service_type = ?',
      ['svc-2', 'partition'],
      'services',
      PARTITION_SERVICE_OPERATION.DELETE,
      logger,
    );

    assert.deepStrictEqual(data, {
      service_id: 'svc-2',
      service_type: 'partition',
    });
  });

  it('counts placeholders only outside SQL literals, identifiers, and comments', () => {
    assert.strictEqual(countSqlParameterPlaceholders(null), 0);
    assert.strictEqual(countSqlParameterPlaceholders(''), 0);
    assert.strictEqual(hasSqlParameterPlaceholders(undefined), false);
    assert.strictEqual(hasSqlParameterPlaceholders(''), false);

    const literalOnly =
      'INSERT INTO config (config_key, config_value) VALUES (\'probe.key\', \'why?\')';
    assert.strictEqual(countSqlParameterPlaceholders(literalOnly), 0);
    assert.strictEqual(hasSqlParameterPlaceholders(literalOnly), false);

    const quotedAndComments =
      'SELECT "col?name", "a""?", `tick?`, ``, [bracket?], \'it\'\'s?\'\n' +
      'FROM config -- line comment ?\n' +
      '/* block ? comment */ WHERE config_key = ? AND config_value = ?';
    assert.strictEqual(countSqlParameterPlaceholders(quotedAndComments), 2);
    assert.strictEqual(hasSqlParameterPlaceholders(quotedAndComments), true);

    assert.strictEqual(
      countSqlParameterPlaceholders(
        'UPDATE config SET config_value = \'why?\' /* ? */ -- ?\nWHERE config_key = \'ok\'',
      ),
      0,
    );
  });

  it('extracts literal INSERT with ? in strings, parens in strings, and comments', () => {
    const withQuestion = extractInsertDataFromSQL(
      'INSERT INTO config (config_key, config_value) VALUES (\'probe.key\', \'why?\')',
      'config',
      null,
      logger,
    );
    assert.deepStrictEqual(withQuestion, {
      config_key: 'probe.key',
      config_value: 'why?',
    });

    const withParensAndComments = extractInsertDataFromSQL(
      'INSERT INTO config (config_key, config_value) /* lead ? */ ' +
        'VALUES (\'probe.parens\', \'(a, b) why?\') -- trailing why?',
      'config',
      null,
      logger,
    );
    assert.deepStrictEqual(withParensAndComments, {
      config_key: 'probe.parens',
      config_value: '(a, b) why?',
    });

    const withEscapedQuotes = extractInsertDataFromSQL(
      'INSERT INTO config (config_key, config_value) VALUES (\'probe.esc\', \'it\'\'s why?\')',
      'config',
      null,
      logger,
    );
    assert.deepStrictEqual(withEscapedQuotes, {
      config_key: 'probe.esc',
      config_value: 'it\'s why?',
    });
  });

  it('refuses unquoted ? placeholders and multi-tuple batch INSERT in literal extractor', () => {
    assert.deepStrictEqual(
      extractInsertDataFromSQL(
        'INSERT INTO config (config_key, config_value) VALUES (?, ?)',
        'config',
        null,
        logger,
      ),
      {},
    );
    assert.deepStrictEqual(
      extractInsertDataFromSQL(
        'INSERT INTO config (config_key, config_value) VALUES (\'a\', \'1\'), (\'b\', \'2\')',
        'config',
        null,
        logger,
      ),
      {},
    );
    assert.deepStrictEqual(
      extractUpdateDataFromSQL(
        'UPDATE config SET config_value = ? WHERE config_key = ?',
        'config',
        null,
        logger,
      ),
      {},
    );
    assert.deepStrictEqual(
      extractDeleteDataFromSQL(
        'DELETE FROM config WHERE config_key = ?',
        logger,
      ),
      {},
    );
  });

  it('extracts mixed literal and parameterized SQL when ? appears in strings or comments', () => {
    assert.deepStrictEqual(
      extractDataFromParameterizedSQL(
        'UPDATE config SET config_value = \'why?\', updated_by = ? ' +
          'WHERE config_key = ? -- why?',
        ['admin', 'probe.key'],
        'config',
        PARTITION_SERVICE_OPERATION.UPDATE,
        logger,
      ),
      {
        config_value: 'why?',
        updated_by: 'admin',
        config_key: 'probe.key',
      },
    );

    assert.deepStrictEqual(
      extractDataFromParameterizedSQL(
        'UPDATE config SET config_value = \'a, b?\', updated_at = 42, ' +
          'requires_restart = TRUE WHERE config_key = ?',
        ['probe.key'],
        'config',
        PARTITION_SERVICE_OPERATION.UPDATE,
        logger,
      ),
      {
        config_value: 'a, b?',
        updated_at: 42,
        requires_restart: true,
        config_key: 'probe.key',
      },
    );

    assert.deepStrictEqual(
      extractDataFromParameterizedSQL(
        'UPDATE config SET config_value = ? WHERE config_key = \'why?\' AND updated_by = ?',
        ['ok', 'admin'],
        'config',
        PARTITION_SERVICE_OPERATION.UPDATE,
        logger,
      ),
      {
        config_value: 'ok',
        config_key: 'why?',
        updated_by: 'admin',
      },
    );

    assert.deepStrictEqual(
      extractDataFromParameterizedSQL(
        'DELETE FROM config WHERE config_key = ? AND scope = \'why?\' /* why? */',
        ['probe.key'],
        'config',
        PARTITION_SERVICE_OPERATION.DELETE,
        logger,
      ),
      {
        config_key: 'probe.key',
        scope: 'why?',
      },
    );

    assert.deepStrictEqual(
      extractDataFromParameterizedSQL(
        'INSERT INTO config (config_key, config_value) /* why? */ VALUES (\'probe.key\', ?) -- why?',
        ['why?'],
        'config',
        PARTITION_SERVICE_OPERATION.INSERT,
        logger,
      ),
      {
        config_key: 'probe.key',
        config_value: 'why?',
      },
    );
  });

  it('extracts all rows from multi-tuple literal and parameterized INSERT/UPSERT', () => {
    const literalRows = extractInsertRowsFromSQL(
      'INSERT INTO config (config_key, config_value) VALUES (\'k1\', \'v1\'), (\'k2\', \'v2\')',
      [],
      'config',
      null,
      logger,
    );
    assert.deepStrictEqual(literalRows, [
      {config_key: 'k1', config_value: 'v1'},
      {config_key: 'k2', config_value: 'v2'},
    ]);

    const paramRows = extractInsertRowsFromSQL(
      'INSERT OR REPLACE INTO config (config_key, config_value) VALUES (?, ?), (?, ?)',
      ['k1', 'v1', 'k2', 'v2'],
      'config',
      null,
      logger,
    );
    assert.deepStrictEqual(paramRows, [
      {config_key: 'k1', config_value: 'v1'},
      {config_key: 'k2', config_value: 'v2'},
    ]);

    assert.deepStrictEqual(
      extractInsertRowsFromSQL(
        'INSERT OR REPLACE INTO config (config_key, config_value) VALUES (?, ?), (?, ?)',
        ['k1', 'v1'],
        'config',
        null,
        logger,
      ),
      [],
    );
  });

  it('evaluates scalar functions in WHERE and SET clauses for DELETE and UPDATE', () => {
    assert.deepStrictEqual(
      extractDataFromParameterizedSQL(
        'DELETE FROM config WHERE config_key = lower(?)',
        ['PROBE.KEY'],
        'config',
        PARTITION_SERVICE_OPERATION.DELETE,
        logger,
      ),
      {config_key: 'probe.key'},
    );

    assert.deepStrictEqual(
      extractDataFromParameterizedSQL(
        'UPDATE config SET config_value = \'new\' WHERE config_key = lower(?)',
        ['PROBE.KEY'],
        'config',
        PARTITION_SERVICE_OPERATION.UPDATE,
        logger,
      ),
      {config_value: 'new', config_key: 'probe.key'},
    );

    assert.deepStrictEqual(
      extractDeleteDataFromSQL(
        'DELETE FROM config WHERE config_key = lower(\'PROBE.KEY\')',
        logger,
      ),
      {config_key: 'probe.key'},
    );
  });
});
