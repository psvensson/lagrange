import {test} from '../../src/test-helpers/tap.js';
import {CDCSqlBuilder} from '../../src/cdc/cdc-sql-builder.js';

const DEFAULT_VALUE_NORMALIZATION_STATE = Object.freeze({
  NULL: 'null',
  UNDEFINED: 'undefined',
  VALUE: 'value',
});

const TABLE_NAME_EXTRACTION_STATE = Object.freeze({
  FOUND: 'found',
  INVALID_INPUT: 'invalid_input',
});

test('CDCSqlBuilder exposes explicit default-value normalization states',
  async (t) => {
    const builder = new CDCSqlBuilder();

    t.same(
      builder.normalizeDefaultValueResult(undefined),
      {
        state: 'undefined',
      },
      'undefined defaults should remain explicit at the boundary',
    );
    t.same(
      builder.normalizeDefaultValueResult(null),
      {
        state: 'null',
      },
      'null defaults should remain explicit at the boundary',
    );
    t.same(
      builder.normalizeDefaultValueResult('\'abc\''),
      {
        state: 'value',
        value: 'abc',
      },
      'quoted defaults should normalize into explicit values',
    );
  });

test('CDCSqlBuilder exposes explicit table-name extraction states',
  async (t) => {
    const builder = new CDCSqlBuilder();

    t.same(
      builder.extractTableNameResult('INSERT INTO widgets (id) VALUES (1)'),
      {
        state: 'found',
        tableName: 'widgets',
      },
      'SQL table extraction should use an explicit found state',
    );
    t.same(
      builder.extractTableNameResult(null),
      {
        state: 'invalid_input',
      },
      'invalid input should not collapse into a null return',
    );
  });

test('CDCSqlBuilder explicit-result methods return named contracts',
  async (t) => {
    const builder = new CDCSqlBuilder();

    t.same(
      builder.normalizeDefaultValueResult(undefined),
      {
        state: DEFAULT_VALUE_NORMALIZATION_STATE.UNDEFINED,
      },
      'default normalization wrapper should expose explicit undefined state',
    );

    t.same(
      builder.normalizeDefaultValueResult('42'),
      {
        state: DEFAULT_VALUE_NORMALIZATION_STATE.VALUE,
        value: 42,
      },
      'default normalization wrapper should expose explicit value state',
    );

    t.same(
      builder.extractTableNameFromSQL('DELETE FROM widgets WHERE id = 1'),
      {
        state: TABLE_NAME_EXTRACTION_STATE.FOUND,
        tableName: 'widgets',
      },
      'table-name wrapper should expose explicit found state',
    );

    t.same(
      builder.extractTableNameFromSQL(null),
      {
        state: TABLE_NAME_EXTRACTION_STATE.INVALID_INPUT,
      },
      'table-name wrapper should expose explicit invalid-input state',
    );
  });
