/**
 * The value a mocked `tables` row holds for a column, as the real table
 * would: the row's own value, else the PRODUCTION schema's default for a
 * column the fixture row does not spell out (a row INSERTed without it
 * holds the default - e.g. partition_transition_generation 0).
 */
import {TABLES_SCHEMA} from '../../src/bootstrap/system-table-schemas-constants.js';

const DEFAULTS = Object.freeze(Object.fromEntries(TABLES_SCHEMA.columns
  .filter((column) => typeof column.defaultValue === 'number')
  .map((column) => [column.name, column.defaultValue])));

/**
 * @param {Object|null} row - The fixture's `tables` row.
 * @param {string} column
 * @return {*}
 */
function tablesColumnOf(row, column) {
  return Object.hasOwn(row ?? {}, column) ? row[column] : DEFAULTS[column];
}

export {tablesColumnOf};
