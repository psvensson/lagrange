/**
 * Normalization of the differential oracle (§4.1, as amended by the
 * independent design review of 2026-11-17). These rules are fixed at seal and
 * may only be tightened. Each one encodes an order or a choice SQLite itself
 * leaves unspecified, never a tolerance for drift:
 *
 * N-NAMES   output column names, their order and their count compare
 *           exactly, in every layer. A distributed result with no rows
 *           carries no column metadata today; its names are unobservable and
 *           counted as such, never assumed equal.
 * N-CELLS   every cell compares by storage class and value exactly. REAL
 *           compares exactly (no tolerance: SUM/AVG/TOTAL must reproduce
 *           SQLite's compensated sum). MIN/MAX results compare exactly (1.0
 *           and 1 on a no-affinity column differ).
 * N-ORDER   order is compared only where the statement imposes it; rows that
 *           tie on the ORDER BY key (equal under the term's collation) are
 *           compared as multisets. Generated LIMIT cases carry a total ORDER
 *           BY (the key appended), so their tie groups are single rows.
 * N-CONCAT  GROUP_CONCAT without an ORDER BY compares as a multiset of its
 *           elements; SQLite leaves the element order unspecified.
 * N-REPR    a TEXT group key or DISTINCT output grouped under NOCASE or RTRIM
 *           compares under that collation: SQLite returns any member of the
 *           equivalence class. Nothing else is folded.
 * N-ERROR   errors compare by SQLite error class (better-sqlite3 `code`); an
 *           error on one side only is a divergence, and a Lagrange refusal
 *           never equals a SQLite error.
 * (Arbitrary bare columns are not generated except with MIN or MAX.)
 *
 * Collation equivalence is decided by SQLite (lower()/rtrim(), the NOCASE and
 * RTRIM folds without ICU), never by a JavaScript comparator.
 *
 * Storage-class observability. The current wire carries no class for numbers
 * (typed-wire.js CURRENT_WIRE): a coordinator number is NUMERIC_UNCLASSIFIED
 * and never equals an INTEGER or REAL cell. A divergence whose only differing
 * cells are such numbers with the identical canonical value is flagged
 * `classOnly`, so a report can tell a lost class from a wrong value; it is a
 * divergence all the same.
 */

import Database from 'better-sqlite3';

import {CELL_CLASS} from './typed-wire.js';

const COLLATION = Object.freeze({BINARY: 'BINARY', NOCASE: 'NOCASE', RTRIM: 'RTRIM'});
const NUMERIC_CLASSES = new Set([CELL_CLASS.INTEGER, CELL_CLASS.REAL]);
const MAX_PRINTED_ROWS = 12;

let collationDb = null;
let foldStatements = null;

function folds() {
  if (foldStatements === null) {
    collationDb = new Database(':memory:');
    foldStatements = {
      [COLLATION.NOCASE]: collationDb.prepare('SELECT lower(?)').pluck(),
      [COLLATION.RTRIM]: collationDb.prepare('SELECT rtrim(?, \' \')').pluck(),
    };
  }
  return foldStatements;
}

function collationKey(cellValue, collation) {
  if (!collation || collation === COLLATION.BINARY || cellValue.c !== CELL_CLASS.TEXT) {
    return `${cellValue.c}:${cellValue.v}`;
  }
  return `text:${folds()[collation].get(cellValue.v)}`;
}

function concatElements(cellValue, separator) {
  if (cellValue.c !== CELL_CLASS.TEXT) return null;
  return cellValue.v.split(separator).sort().join('\u0000');
}

function columnRule(spec, name) {
  return {
    collation: spec?.collations?.[name] ?? null,
    concatSeparator: spec?.groupConcat?.[name] ?? null,
  };
}

/**
 * Compare one expected (SQLite) cell with one observed cell.
 * @return {{equal: boolean, classOnly: boolean}}
 */
function compareCell(expected, actual, rule) {
  if (rule.concatSeparator !== null && expected.c === CELL_CLASS.TEXT) {
    return {equal: concatElements(expected, rule.concatSeparator) ===
      concatElements(actual, rule.concatSeparator), classOnly: false};
  }
  if (rule.collation !== null && expected.c === CELL_CLASS.TEXT) {
    return {equal: collationKey(expected, rule.collation) ===
      collationKey(actual, rule.collation), classOnly: false};
  }
  const equal = expected.c === actual.c && expected.v === actual.v;
  const classOnly = !equal && actual.c === CELL_CLASS.NUMERIC_UNCLASSIFIED &&
    NUMERIC_CLASSES.has(expected.c) && expected.v === actual.v;
  return {equal, classOnly};
}

function rowSortKey(row, rules) {
  return row.map((cellValue, index) => {
    const rule = rules[index];
    if (rule.concatSeparator !== null) {
      return `c:${concatElements(cellValue, rule.concatSeparator)}`;
    }
    if (NUMERIC_CLASSES.has(cellValue.c) || cellValue.c === CELL_CLASS.NUMERIC_UNCLASSIFIED) {
      // Sort numbers by value so a lost class still pairs with its row; the
      // pairwise comparison below then reports the class difference.
      return `n:${cellValue.v}`;
    }
    return collationKey(cellValue, rule.collation);
  }).join('\u0001');
}

function sortedRows(rows, rules) {
  return rows.map((row) => ({row, key: rowSortKey(row, rules)}))
    .sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0))
    .map((entry) => entry.row);
}

// Consecutive expected rows with equal ORDER BY keys form one tie group.
function tieGroups(rows, columns, spec) {
  const orderKey = spec?.orderKey;
  if (!Array.isArray(orderKey) || orderKey.length === 0) {
    return rows.map((_row, index) => [index, index + 1]);
  }
  const indexes = orderKey.map((term) => ({index: columns.indexOf(term.column),
    collation: term.collation ?? null}));
  const keyOf = (row) => indexes.map(({index, collation}) =>
    collationKey(row[index], collation)).join('\u0001');
  const groups = [];
  let start = 0;
  for (let index = 1; index <= rows.length; index += 1) {
    if (index === rows.length || keyOf(rows[index]) !== keyOf(rows[start])) {
      groups.push([start, index]);
      start = index;
    }
  }
  return groups;
}

// Pairwise comparison; `classOnly` stays true while every difference is a
// number whose class the wire did not carry. `at` names the first value
// difference, or the first class difference when there is no other.
function compareRowLists(expectedRows, actualRows, rules) {
  let firstClass = null;
  let firstValue = null;
  for (let rowIndex = 0; rowIndex < expectedRows.length; rowIndex += 1) {
    for (let col = 0; col < rules.length; col += 1) {
      const verdict = compareCell(expectedRows[rowIndex][col], actualRows[rowIndex][col],
        rules[col]);
      if (verdict.equal) continue;
      if (verdict.classOnly) firstClass ??= {rowIndex, col};
      else firstValue ??= {rowIndex, col};
    }
  }
  const at = firstValue ?? firstClass;
  return {equal: at === null, classOnly: at !== null && firstValue === null, at};
}

function compareErrors(expected, actual, label) {
  if (expected.kind === 'error' && actual.kind === 'error') {
    const equal = expected.error.source === actual.error.source &&
      expected.error.code === actual.error.code;
    return equal ? [] : [`error class differs: SQLite ${expected.error.code}, ` +
      `${label} ${actual.error.source}:${actual.error.code}`];
  }
  if (expected.kind === 'error') {
    return [`one-sided error: SQLite ${expected.error.code}, ${label} returned rows`];
  }
  return [`one-sided error: ${label} ${actual.error.source}:${actual.error.code}, ` +
    'SQLite returned rows'];
}

function differenceReason(prefix, verdict, columns, offset = 0) {
  const where = `row ${offset + verdict.at.rowIndex} column ${columns[verdict.at.col]}`;
  return `${prefix} at ${where}${verdict.classOnly ?
    ' (only numeric storage classes the wire did not carry)' : ''}`;
}

// Every tie group is compared, so `classOnly` speaks for the whole result,
// not only for the first group that differs.
function compareOrdered(expected, actual, rules, spec) {
  let first = null;
  let classOnly = true;
  for (const [start, end] of tieGroups(expected.rows, expected.columns, spec)) {
    const expectedGroup = expected.rows.slice(start, end);
    const actualGroup = actual.rows.slice(start, end);
    const verdict = end - start === 1 ?
      compareRowLists(expectedGroup, actualGroup, rules) :
      compareRowLists(sortedRows(expectedGroup, rules), sortedRows(actualGroup, rules), rules);
    if (verdict.equal) continue;
    if (first === null || (first.verdict.classOnly && !verdict.classOnly)) {
      first = {verdict, start};
    }
    classOnly &&= verdict.classOnly;
  }
  if (first === null) return {reasons: [], classOnly: false};
  return {reasons: [differenceReason('ordered rows differ', {...first.verdict, classOnly},
    expected.columns, first.start)], classOnly};
}

function compareUnordered(expected, actual, rules) {
  const verdict = compareRowLists(sortedRows(expected.rows, rules),
    sortedRows(actual.rows, rules), rules);
  return verdict.equal ? {reasons: [], classOnly: false} :
    {reasons: [differenceReason('row multisets differ', verdict, expected.columns)],
      classOnly: verdict.classOnly};
}

function compareNames(expected, actual, label) {
  if (actual.columns === null) return [];
  const same = expected.columns.length === actual.columns.length &&
    expected.columns.every((name, index) => name === actual.columns[index]);
  return same ? [] : [`column names: SQLite [${expected.columns.join(', ')}], ` +
    `${label} [${actual.columns.join(', ')}]`];
}

/**
 * Compare the oracle's outcome with the distributed outcome.
 * @param {Object} expected - runOracle outcome ({kind, columns, rows}).
 * @param {Object} actual - observed outcome; `columns` is null when the
 *   result carried no column names (no rows and no metadata).
 * @param {Object} spec - {ordered, orderKey, groupConcat, collations}.
 * @param {string} [label] - What produced `actual`, for the reasons.
 * @return {{equal: boolean, reasons: string[], classOnly: boolean,
 *   namesUnobserved: boolean}}
 */
function compareOutcomes(expected, actual, spec = {}, label = 'distributed') {
  if (expected.kind === 'error' || actual.kind === 'error') {
    const reasons = compareErrors(expected, actual, label);
    return {equal: reasons.length === 0, reasons, classOnly: false, namesUnobserved: false};
  }
  const namesUnobserved = actual.columns === null;
  const reasons = compareNames(expected, actual, label);
  if (expected.rows.length !== actual.rows.length) {
    reasons.push(`row count: SQLite ${expected.rows.length}, ${label} ${actual.rows.length}`);
  }
  if (reasons.length > 0) return {equal: false, reasons, classOnly: false, namesUnobserved};
  const rules = expected.columns.map((name) => columnRule(spec, name));
  const verdict = spec.ordered === true ?
    compareOrdered(expected, actual, rules, spec) :
    compareUnordered(expected, actual, rules);
  return {equal: verdict.reasons.length === 0, reasons: verdict.reasons,
    classOnly: verdict.classOnly, namesUnobserved};
}

function formatCell(cellValue) {
  return `${cellValue.c}:${JSON.stringify(cellValue.v)}`;
}

function formatOutcome(outcome) {
  if (outcome.kind === 'error') {
    return `ERROR ${outcome.error.source}:${outcome.error.code} ${outcome.detail ?? ''}`;
  }
  const rows = outcome.rows.slice(0, MAX_PRINTED_ROWS)
    .map((row) => `    [${row.map(formatCell).join(', ')}]`);
  const more = outcome.rows.length > MAX_PRINTED_ROWS ?
    [`    ... ${outcome.rows.length - MAX_PRINTED_ROWS} more rows`] : [];
  const names = outcome.columns === null ? '(no column names)' :
    `columns [${outcome.columns.join(', ')}]`;
  return [`${names}, ${outcome.rows.length} rows`,
    ...rows, ...more].join('\n');
}

function formatParam(value) {
  if (typeof value === 'bigint') return `${value}n`;
  if (Buffer.isBuffer(value)) return `x'${value.toString('hex')}'`;
  if (Object.is(value, -0)) return '-0';
  return JSON.stringify(value) ?? String(value);
}

/**
 * The failure print §4.1 requires: seed, statement, layout, delivered SQL and
 * both typed results.
 * @param {Object} divergence
 * @return {string}
 */
function describeDivergence({seed, layout, caseId, sql, params, delivered, expected,
  actual, reasons}) {
  const sent = (delivered || []).slice(0, 8).map((entry) =>
    `    ${entry.replicaId}: ${entry.sql} ${JSON.stringify((entry.params || []).map(formatParam))}`);
  return [
    `--- ${caseId} | seed ${seed ?? 'golden'} | layout ${layout} partition(s)`,
    `  statement: ${sql} params ${JSON.stringify((params || []).map(formatParam))}`,
    `  divergence: ${reasons.join('; ')}`,
    '  delivered SQL:',
    ...(sent.length > 0 ? sent : ['    (none)']),
    `  SQLite:      ${formatOutcome(expected).replaceAll('\n', '\n  ')}`,
    `  distributed: ${formatOutcome(actual).replaceAll('\n', '\n  ')}`,
  ].join('\n');
}

export {
  compareOutcomes,
  describeDivergence,
};
