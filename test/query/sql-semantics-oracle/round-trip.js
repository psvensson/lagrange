/**
 * Layer A of the oracle (§2.5, §4.1): SQL front-end fidelity.
 *
 * Statements. For a statement Q, render(parse(Q)) executed on one SQLite
 * database must equal Q's own result there (names, classes and values under
 * the same normalization), or the front end must refuse Q with the typed
 * UNSUPPORTED_SQL_FEATURE. `render` is the one renderer the partitions'
 * statements come from (QueryExecutor.buildSelectSQL); `parse` is SQLParser.
 *
 * DDL. For a CREATE TABLE, the table the catalog path creates (SQLParser ->
 * buildSchemaDefinition -> partitionServiceTableSql) must store and compare
 * every column the way SQLite stores and compares the declared table:
 * affinity and collation are read back from SQLite (schema.js
 * columnBehaviour), never inferred here.
 */

import {SQLParser} from '../../../src/query/sql-parser.js';
import {QUERY_ERROR_CODE} from '../../../src/query/query-constants.js';
import {columnBehaviour, declareCatalogTable} from './schema.js';
import {compareOutcomes} from './normalize.js';
import {runOracle} from './cluster.js';

function frontEndRefusal(error) {
  return {
    code: error?.code ?? null,
    message: String(error?.message ?? error),
    typed: error?.code === QUERY_ERROR_CODE.UNSUPPORTED_SQL_FEATURE,
  };
}

/**
 * render(parse(sql)) with the production renderer.
 * @param {Object} renderer - A QueryExecutor (buildSelectSQL owner).
 * @param {string} sql
 * @return {{rendered: string}|{refusal: Object}}
 */
function renderThroughFrontEnd(renderer, sql) {
  try {
    return {rendered: renderer.buildSelectSQL(new SQLParser(sql).parse())};
  } catch (error) {
    return {refusal: frontEndRefusal(error)};
  }
}

/**
 * Layer A verdict for one statement over the rows loaded in `database`.
 * @param {Object} options
 * @param {Database} options.database - The reference database.
 * @param {Object} options.renderer - QueryExecutor.
 * @param {Object} options.testCase - {sql, params, compare}.
 * @return {Object} {equal, reasons, rendered, expected, actual}
 */
function statementRoundTrip({database, renderer, testCase}) {
  const expected = runOracle(database, testCase.sql, testCase.params || []);
  const front = renderThroughFrontEnd(renderer, testCase.sql);
  if (front.refusal) {
    const reasons = front.refusal.typed ? [] :
      [`untyped front-end refusal (${front.refusal.code ?? 'no code'}): ` +
        front.refusal.message.slice(0, 300)];
    return {equal: reasons.length === 0, reasons, rendered: null, expected,
      actual: {kind: 'error', error: {source: 'lagrange', code: String(front.refusal.code)},
        detail: front.refusal.message}};
  }
  const actual = runOracle(database, front.rendered, testCase.params || []);
  const verdict = compareOutcomes(expected, actual, testCase.compare || {},
    'render(parse(Q))');
  return {equal: verdict.equal, reasons: verdict.reasons, rendered: front.rendered,
    expected, actual};
}

function behaviourDifferences(declared, rendered) {
  const reasons = [];
  for (const [column, behaviour] of Object.entries(declared)) {
    const other = rendered[column];
    if (!other) {
      reasons.push(`column ${column} missing from the rendered table`);
      continue;
    }
    if (behaviour.collation !== other.collation) {
      reasons.push(`column ${column}: collation ${behaviour.collation} declared, ` +
        `${other.collation} rendered`);
    }
    if (behaviour.affinity !== other.affinity) {
      reasons.push(`column ${column}: stored values differ (declared ${behaviour.affinity}; ` +
        `rendered ${other.affinity})`);
    }
  }
  return reasons;
}

/**
 * Layer A verdict for one CREATE TABLE.
 * @param {Object} golden - {ddl, table}.
 * @return {Object} {equal, reasons, renderedDdl}
 */
function ddlRoundTrip(golden) {
  let table;
  try {
    table = declareCatalogTable(golden.table, golden.ddl);
  } catch (error) {
    const refusal = frontEndRefusal(error);
    return {equal: refusal.typed, renderedDdl: null, reasons: refusal.typed ? [] :
      [`untyped front-end refusal (${refusal.code ?? 'no code'}): ${refusal.message}`]};
  }
  const reasons = behaviourDifferences(
    columnBehaviour(golden.ddl, golden.table, table.primaryKey),
    columnBehaviour(table.renderedDdl, golden.table, table.primaryKey));
  return {equal: reasons.length === 0, reasons, renderedDdl: table.renderedDdl};
}

export {ddlRoundTrip, renderThroughFrontEnd, statementRoundTrip};
