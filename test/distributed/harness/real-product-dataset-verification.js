/**
 * Dataset verification for a comparative-benchmark run: after the canonical
 * adapter's prepareDataset loaded the canonical dataset, read all nine
 * canonical tables back through the PRODUCT's public interface and compare
 * the product-content snapshot (stream B1's collectOltpStateSnapshot over the
 * shared canonical TABLES) with the generator's expected snapshot of the same
 * canonical rows: rows per table, key coverage against the plan's key space
 * and the state digest. Any mismatch or unreadable table is a typed
 * `dataset_unverified`; measurement never starts on an unverified dataset.
 */
import {
  TABLES as CANONICAL_TABLES,
  buildTableQuery,
  canonicalRows,
  collectOltpStateSnapshot,
} from '../reference-client/oltp-state-snapshot-shared.js';
import {buildOltpBaselineDataset} from './oltp-baseline-dataset.js';
import {
  arrayFilter,
  arrayFind,
  arrayJoin,
  arrayMap,
  arraySome,
  stringReplace,
  stringSplit,
  stringToUpperCase,
} from './real-product-captured-intrinsics.js';
import {
  DATASET_RESET_METHOD,
  DEPLOYMENT_FAILURE,
  deploymentFailure,
} from './real-product-deployment-contract.js';
import {errorText} from './real-product-remote-shell.js';

const SNAPSHOT_METHOD = 'collectOltpStateSnapshot';
const INTEGER_TEXT = /^-?\d+$/u;
const KEY_SEPARATOR = '\u0000';
// The generator's collections behind each canonical table; the transactional
// tables start empty in a freshly loaded dataset.
const GENERATED_TABLE_SOURCE = Object.freeze({
  warehouse: 'warehouses', district: 'districts', customer: 'customers',
  item: 'items', stock: 'stock',
});

function camelOf(column) {
  return stringReplace(column, /_([a-z])/gu, (_match, letter) => stringToUpperCase(letter));
}

function normalizeCell(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  const text = String(value);
  if (INTEGER_TEXT.test(text) && Number.isSafeInteger(Number(text))) return Number(text);
  return text;
}

function normalizeRow(row, columns) {
  const normalized = {};
  for (const column of columns) normalized[column] = normalizeCell(row?.[column]);
  return normalized;
}

/**
 * The canonical rows the generator expects in each of the nine tables, keyed
 * by table name, in the snapshot's column names.
 * @param {Object} workload canonical workload options (oltp-baseline-workload)
 * @return {Object<string, Array<Object>>}
 */
function expectedCanonicalTableRows(workload) {
  const dataset = buildOltpBaselineDataset(workload);
  const expected = {};
  for (const table of CANONICAL_TABLES) {
    const source = GENERATED_TABLE_SOURCE[table.name];
    const rows = source ? dataset[source] : [];
    expected[table.name] = arrayMap(rows, (row) => {
      const projected = {};
      for (const column of table.columns) projected[column] = row[camelOf(column)];
      return projected;
    });
  }
  return expected;
}

/**
 * Rows from a client's delimited text output (psql -At -F, mysql --batch).
 * @param {string} text
 * @param {Array<string>} columns
 * @param {{separator: string, nullToken?: string|null}} format
 * @return {Array<Object>}
 */
function rowsFromDelimitedText(text, columns, {separator, nullToken = null}) {
  const lines = arrayFilter(stringSplit(String(text ?? ''), /\r?\n/u), (line) => line !== '');
  return arrayMap(lines, (line) => {
    const cells = stringSplit(line, separator);
    if (cells.length !== columns.length) {
      throw new Error(`expected ${columns.length} columns, got ${cells.length}: ${line}`);
    }
    const row = {};
    columns.forEach((column, index) => {
      row[column] = cells[index] === nullToken ? null : cells[index];
    });
    return row;
  });
}

function keyOf(row, table) {
  return arrayJoin(arrayMap(table.orderBy, (column) => String(row[column])), KEY_SEPARATOR);
}

function keyCoverage(expected, observedState) {
  let expectedKeys = 0;
  let present = 0;
  for (const table of CANONICAL_TABLES) {
    const observed = arrayFind(observedState, (entry) => entry.table === table.name);
    const columns = table.columns;
    const seen = new Set(arrayMap(observed?.rows || [], (cells) => {
      const row = {};
      columns.forEach((column, index) => {
        row[column] = cells[index];
      });
      return keyOf(row, table);
    }));
    for (const row of expected[table.name]) {
      expectedKeys += 1;
      if (seen.has(keyOf(normalizeRow(row, columns), table))) present += 1;
    }
  }
  return {expected: expectedKeys, present};
}

async function snapshotOf(readRows) {
  return collectOltpStateSnapshot({tables: CANONICAL_TABLES,
    queryRowsForTable: async (table) => canonicalRows(
      arrayMap(await readRows(table), (row) => normalizeRow(row, table.columns)),
      table.columns)});
}

/**
 * Verify a loaded canonical dataset through the product's public interface.
 * @param {{workload: Object, readTableRows: Function}} input readTableRows
 *   (table) answers the product's rows for `buildTableQuery(table)`
 * @return {Promise<Object>} the record's deployment.dataset section
 */
async function verifyCanonicalDataset({workload, readTableRows}) {
  const expected = expectedCanonicalTableRows(workload);
  let observed;
  try {
    observed = await snapshotOf(readTableRows);
  } catch (error) {
    throw deploymentFailure(DEPLOYMENT_FAILURE.DATASET_UNVERIFIED,
      `canonical dataset could not be read back: ${errorText(error)}`,
      {error: errorText(error)});
  }
  const reference = await snapshotOf(async (table) => expected[table.name]);
  const coverage = keyCoverage(expected, observed.state);
  const tables = arrayMap(CANONICAL_TABLES, (table) => ({table: table.name,
    rows: observed.rowCounts[table.name], expectedRows: reference.rowCounts[table.name]}));
  const result = {
    method: SNAPSHOT_METHOD,
    resetMethod: DATASET_RESET_METHOD.FRESH_FORMATION,
    tables,
    keyCoverage: coverage,
    logicalChecksum: `sha256:${observed.stateSha256}`,
    expectedChecksum: `sha256:${reference.stateSha256}`,
  };
  const rowsDiffer = arraySome(tables, (entry) => entry.rows !== entry.expectedRows);
  if (rowsDiffer || coverage.present !== coverage.expected ||
      result.logicalChecksum !== result.expectedChecksum) {
    throw deploymentFailure(DEPLOYMENT_FAILURE.DATASET_UNVERIFIED,
      'loaded dataset does not match the canonical dataset', result);
  }
  return result;
}

export {
  CANONICAL_TABLES,
  buildTableQuery,
  expectedCanonicalTableRows,
  rowsFromDelimitedText,
  verifyCanonicalDataset,
};
