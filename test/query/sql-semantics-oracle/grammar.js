/**
 * Grammar parity (design §4.1 rev 2): the generator's grammar must cover the
 * grammar the front end admits, so a construct the parser accepts can never
 * escape the oracle.
 *
 * "Admitted" is measured, not listed: every built-in function SQLite reports
 * (pragma_function_list) and every SQLite operator form is offered to the
 * production front end (SQLParser, then the one renderer). What passes must
 * have a production here, and every production must occur in the corpus the
 * fixed seeds generate; every expression node type the converter emits must
 * occur in the parsed corpus. A newly admitted construct without a
 * production fails the oracle file.
 *
 * Productions keep values deterministic across connections: functions of
 * connection state or time are wrapped (typeof, length) so SQLite's answer
 * does not depend on which connection evaluates them.
 */

import {SQLParser} from '../../../src/query/sql-parser.js';
import {EXPR_TYPE} from '../../../src/query/parser-constants.js';
import {PG_EXPR_TYPE} from '../../../src/query/pg/pg-compat-constants.js';

const JSON_DOC = '\'{"a":1,"b":[1,2],"c":"x"}\'';
const JSON_PATH = '\'$.b\'';

const num = (p) => p.pick(['i', 'r', 'n', 'a']);
const txt = (p) => p.pick(['x', 'c', 'z']);
const any = (p) => p.pick(['i', 'r', 'n', 'x', 'c', 'z', 'b', 'a']);
const small = (p) => String(p.int(0, 3));

// name -> production. Every name SQLite registers as a built-in scalar.
const SCALAR_FUNCTIONS = Object.freeze({
  'abs': (p) => `abs(${num(p)})`,
  'acos': (p) => `acos(${num(p)})`,
  'acosh': (p) => `acosh(${num(p)})`,
  'asin': (p) => `asin(${num(p)})`,
  'asinh': (p) => `asinh(${num(p)})`,
  'atan': (p) => `atan(${num(p)})`,
  'atan2': (p) => `atan2(${num(p)}, ${num(p)})`,
  'atanh': (p) => `atanh(${num(p)})`,
  'ceil': (p) => `ceil(${num(p)})`,
  'ceiling': (p) => `ceiling(${num(p)})`,
  'changes': () => 'changes()',
  'char': (p) => `char(65, ${p.pick(['97', '233', '128512'])})`,
  'coalesce': (p) => `coalesce(${any(p)}, ${any(p)}, 'none')`,
  'concat': (p) => `concat(${txt(p)}, ${num(p)})`,
  'concat_ws': (p) => `concat_ws('-', ${txt(p)}, ${num(p)})`,
  'cos': (p) => `cos(${num(p)})`,
  'cosh': (p) => `cosh(${num(p)})`,
  'current_date': () => 'length(CURRENT_DATE)',
  'current_time': () => 'length(CURRENT_TIME)',
  'current_timestamp': () => 'typeof(CURRENT_TIMESTAMP)',
  'date': (p) => `date('2024-02-28', '+${small(p)} day')`,
  'datetime': (p) => `datetime('2024-02-28 23:59:59', '+${small(p)} second')`,
  'degrees': (p) => `degrees(${num(p)})`,
  'exp': (p) => `exp(${num(p)})`,
  'floor': (p) => `floor(${num(p)})`,
  'format': (p) => `format('%d|%s|%.3f', ${num(p)}, ${txt(p)}, ${num(p)})`,
  'glob': (p) => `glob('${p.pick(['a*', '[aA]*', '?'])}', ${txt(p)})`,
  'hex': (p) => `hex(${any(p)})`,
  'if': (p) => `if(${num(p)} > 1, ${txt(p)}, ${num(p)})`,
  'ifnull': (p) => `ifnull(${any(p)}, 'none')`,
  'iif': (p) => `iif(${txt(p)}, 'y', 'n')`,
  'instr': (p) => `instr(${txt(p)}, '${p.pick(['a', 'b', ''])}')`,
  'json': () => `json(${JSON_DOC})`,
  'json_array': (p) => `json_array(${num(p)}, ${txt(p)})`,
  'json_array_length': () => 'json_array_length(\'[1,2,3]\')',
  'json_error_position': (p) => `json_error_position(${txt(p)})`,
  'json_extract': () => `json_extract(${JSON_DOC}, ${JSON_PATH})`,
  'json_insert': (p) => `json_insert(${JSON_DOC}, '$.d', ${num(p)})`,
  'json_object': (p) => `json_object('k', ${txt(p)}, 'n', ${num(p)})`,
  'json_patch': () => `json_patch(${JSON_DOC}, '{"a":2}')`,
  'json_pretty': () => `json_pretty(${JSON_DOC})`,
  'json_quote': (p) => `json_quote(${any(p)})`,
  'json_remove': () => `json_remove(${JSON_DOC}, '$.a')`,
  'json_replace': (p) => `json_replace(${JSON_DOC}, '$.a', ${num(p)})`,
  'json_set': (p) => `json_set(${JSON_DOC}, '$.e', ${txt(p)})`,
  'json_type': () => `json_type(${JSON_DOC}, ${JSON_PATH})`,
  'json_valid': (p) => `json_valid(${txt(p)})`,
  'jsonb': () => `jsonb(${JSON_DOC})`,
  'jsonb_array': (p) => `jsonb_array(${num(p)})`,
  'jsonb_extract': () => `jsonb_extract(${JSON_DOC}, ${JSON_PATH})`,
  'jsonb_insert': (p) => `jsonb_insert(${JSON_DOC}, '$.d', ${num(p)})`,
  'jsonb_object': (p) => `jsonb_object('k', ${txt(p)})`,
  'jsonb_patch': () => `jsonb_patch(${JSON_DOC}, '{"a":2}')`,
  'jsonb_remove': () => `jsonb_remove(${JSON_DOC}, '$.a')`,
  'jsonb_replace': (p) => `jsonb_replace(${JSON_DOC}, '$.a', ${num(p)})`,
  'jsonb_set': (p) => `jsonb_set(${JSON_DOC}, '$.e', ${txt(p)})`,
  'julianday': (p) => `julianday('2024-02-28', '+${small(p)} day')`,
  'last_insert_rowid': () => 'last_insert_rowid()',
  'length': (p) => `length(${any(p)})`,
  'like': (p) => `like('${p.pick(['a%', '%b', '_'])}', ${txt(p)})`,
  'likelihood': (p) => `likelihood(${num(p)} > 1, 0.25)`,
  'likely': (p) => `likely(${num(p)} > 1)`,
  'ln': (p) => `ln(${num(p)})`,
  'load_extension': () => 'load_extension(\'lagrange-oracle-absent\')',
  'log': (p) => `log(${p.pick(['2, ', ''])}${num(p)})`,
  'log10': (p) => `log10(${num(p)})`,
  'log2': (p) => `log2(${num(p)})`,
  'lower': (p) => `lower(${txt(p)})`,
  'ltrim': (p) => `ltrim(${txt(p)}, '${p.pick([' ', 'a', 'x'])}')`,
  'max': (p) => `max(${any(p)}, ${any(p)})`,
  'min': (p) => `min(${any(p)}, ${any(p)})`,
  'mod': (p) => `mod(${num(p)}, ${p.pick(['2', '0', '1.5'])})`,
  'nullif': (p) => `nullif(${any(p)}, ${any(p)})`,
  'octet_length': (p) => `octet_length(${any(p)})`,
  'pi': () => 'pi()',
  'pow': (p) => `pow(${num(p)}, 2)`,
  'power': (p) => `power(${num(p)}, 0.5)`,
  'printf': (p) => `printf('%5.2f/%s', ${num(p)}, ${txt(p)})`,
  'quote': (p) => `quote(${any(p)})`,
  'radians': (p) => `radians(${num(p)})`,
  'random': () => 'typeof(random())',
  'randomblob': () => 'length(randomblob(4))',
  'replace': (p) => `replace(${txt(p)}, 'a', 'b')`,
  'round': (p) => `round(${num(p)}, ${small(p)})`,
  'rtrim': (p) => `rtrim(${txt(p)}, '${p.pick([' ', 'a', 'x'])}')`,
  'sign': (p) => `sign(${num(p)})`,
  'sin': (p) => `sin(${num(p)})`,
  'sinh': (p) => `sinh(${num(p)})`,
  'soundex': (p) => `soundex(${txt(p)})`,
  'sqlite_compileoption_get': () => 'sqlite_compileoption_get(0)',
  'sqlite_compileoption_used': () => 'sqlite_compileoption_used(\'THREADSAFE\')',
  'sqlite_log': () => 'sqlite_log(1, \'oracle\')',
  'sqlite_source_id': () => 'sqlite_source_id()',
  'sqlite_version': () => 'sqlite_version()',
  'sqrt': (p) => `sqrt(${num(p)})`,
  'strftime': (p) => `strftime('%Y-%j', '2024-02-28', '+${small(p)} day')`,
  'substr': (p) => `substr(${txt(p)}, ${small(p)}, ${small(p)})`,
  'substring': (p) => `substring(${txt(p)}, ${small(p)})`,
  'subtype': (p) => `subtype(${any(p)})`,
  'tan': (p) => `tan(${num(p)})`,
  'tanh': (p) => `tanh(${num(p)})`,
  'time': (p) => `time('23:59:59', '+${small(p)} second')`,
  'timediff': () => 'timediff(\'2024-03-01\', \'2024-02-28\')',
  'total_changes': () => 'total_changes()',
  'trim': (p) => `trim(${txt(p)}, '${p.pick([' ', 'x', 'ab'])}')`,
  'trunc': (p) => `trunc(${num(p)})`,
  'typeof': (p) => `typeof(${any(p)})`,
  'unhex': (p) => `unhex(${p.pick(['\'41\'', '\'zz\'', 'hex(x)'])})`,
  'unicode': (p) => `unicode(${txt(p)})`,
  'unixepoch': (p) => `unixepoch('2024-02-28', '+${small(p)} day')`,
  'unlikely': (p) => `unlikely(${num(p)} > 1)`,
  'upper': (p) => `upper(${txt(p)})`,
  'zeroblob': () => 'zeroblob(2)',
});

// Built-in aggregates (each usable as a window function as well).
const AGGREGATE_FUNCTIONS = Object.freeze({
  'avg': (p) => ({sql: `avg(${num(p)})`}),
  'count': (p) => ({sql: `count(${any(p)})`}),
  'group_concat': (p) => ({sql: `group_concat(${txt(p)}, '|')`, concat: '|'}),
  'json_group_array': (p) => ({sql: `json_group_array(${any(p)})`}),
  'json_group_object': (p) => ({sql: `json_group_object(CAST(id AS TEXT), ${txt(p)})`}),
  'jsonb_group_array': (p) => ({sql: `jsonb_group_array(${num(p)})`}),
  'jsonb_group_object': (p) => ({sql: `jsonb_group_object(CAST(id AS TEXT), ${num(p)})`}),
  'max': (p) => ({sql: `max(${any(p)})`}),
  'min': (p) => ({sql: `min(${any(p)})`}),
  'string_agg': (p) => ({sql: `string_agg(${txt(p)}, ';')`, concat: ';'}),
  'sum': (p) => ({sql: `sum(${num(p)})`}),
  'total': (p) => ({sql: `total(${num(p)})`}),
});

// Built-in window-only functions.
const WINDOW_FUNCTIONS = Object.freeze({
  'cume_dist': () => 'cume_dist()',
  'dense_rank': () => 'dense_rank()',
  'first_value': (p) => `first_value(${any(p)})`,
  'lag': (p) => `lag(${any(p)}, 1)`,
  'last_value': (p) => `last_value(${any(p)})`,
  'lead': (p) => `lead(${any(p)}, 1)`,
  'nth_value': (p) => `nth_value(${any(p)}, 2)`,
  'ntile': () => 'ntile(3)',
  'percent_rank': () => 'percent_rank()',
  'rank': () => 'rank()',
  'row_number': () => 'row_number()',
});

// SQLite operator forms: how the front end is offered each one, the
// production that generates it, and how a generated statement shows it.
const OPERATOR_FORMS = Object.freeze([
  ...['||', '*', '/', '%', '+', '-', '<<', '>>', '&', '|', '<', '<=', '>', '>=', '=',
    '==', '!=', '<>', 'AND', 'OR', 'IS', 'IS NOT', 'IS DISTINCT FROM',
    'IS NOT DISTINCT FROM', 'LIKE', 'NOT LIKE', 'GLOB', 'NOT GLOB', 'REGEXP', 'MATCH',
    '->', '->>'].map((op) => ({tag: `binary ${op}`, probe: `i ${op} 2`, token: ` ${op} `})),
  ...['-', '+', '~', 'NOT'].map((op) => ({tag: `unary ${op}`, probe: `${op}(i)`,
    token: `${op}(`})),
  {tag: 'IN', probe: 'i IN (1, 2)', token: ' IN ('},
  {tag: 'NOT IN', probe: 'i NOT IN (1, 2)', token: ' NOT IN ('},
  {tag: 'BETWEEN', probe: 'i BETWEEN 1 AND 2', token: ' BETWEEN '},
  {tag: 'NOT BETWEEN', probe: 'i NOT BETWEEN 1 AND 2', token: ' NOT BETWEEN '},
  {tag: 'IS NULL', probe: 'i IS NULL', token: ' IS NULL'},
  {tag: 'IS NOT NULL', probe: 'i IS NOT NULL', token: ' IS NOT NULL'},
  {tag: 'ISNULL', probe: 'i ISNULL', token: ' ISNULL'},
  {tag: 'NOTNULL', probe: 'i NOTNULL', token: ' NOTNULL'},
  {tag: 'ESCAPE', probe: 'x LIKE \'a!%%\' ESCAPE \'!\'', token: ' ESCAPE '},
  {tag: 'COLLATE', probe: 'x COLLATE NOCASE', token: ' COLLATE '},
  {tag: 'CAST', probe: 'CAST(i AS TEXT)', token: 'CAST('},
  {tag: 'CASE simple', probe: 'CASE i WHEN 1 THEN \'a\' END', token: ' WHEN 1 THEN'},
  {tag: 'CASE searched', probe: 'CASE WHEN i THEN \'a\' END', token: 'CASE WHEN'},
]);

// Generated forms for the operators: [token tag, expression].
function operatorExpression(prng, form) {
  const left = form.tag.startsWith('unary') ? '' : `${prng.pick(['i', 'r', 'a', 'x'])}`;
  if (form.tag.startsWith('binary ')) {
    const op = form.tag.slice('binary '.length);
    const right = ['->', '->>'].includes(op) ? '\'$\'' :
      prng.pick(['2', '0.5', '\'a\'', 'i', 'x']);
    const operand = ['->', '->>'].includes(op) ? 'json_quote(x)' : left;
    return `${operand} ${op} ${right}`;
  }
  if (form.tag.startsWith('unary ')) return `${form.tag.slice('unary '.length)}(${left || 'i'})`;
  return form.probe.replace(/\bi\b/u, prng.pick(['i', 'a', 'n']));
}

// Expression node types the converter emits (structural FROM/select-list
// node types excluded).
const STRUCTURAL_TYPES = new Set([EXPR_TYPE.COLUMN, EXPR_TYPE.TABLE, EXPR_TYPE.JOIN]);
const REQUIRED_NODE_TYPES = Object.freeze([...new Set([...Object.values(EXPR_TYPE),
  ...Object.values(PG_EXPR_TYPE)])].filter((type) => !STRUCTURAL_TYPES.has(type)));

function admits(renderer, sql) {
  try {
    renderer.buildSelectSQL(new SQLParser(sql).parse());
    return true;
  } catch {
    return false;
  }
}

/**
 * What the production front end admits, offered every SQLite built-in
 * function and operator form.
 * @param {Object} renderer - QueryExecutor.
 * @param {Database} database - A SQLite connection of the partitions' build.
 * @return {{functions: string[], operators: string[]}}
 */
function admittedGrammar(renderer, database) {
  const builtins = database.prepare('SELECT name, max(narg) AS narg FROM ' +
    'pragma_function_list WHERE builtin = 1 GROUP BY name ORDER BY name').all();
  const functions = builtins.filter(({name, narg}) => {
    const args = Array.from({length: Math.max(narg, 1)}, () => 'i').join(', ');
    return /^[a-z_][a-z0-9_]*$/u.test(name) &&
      admits(renderer, `SELECT ${name}(${narg === 0 ? '' : args}) AS v FROM t`);
  }).map(({name}) => name);
  const operators = OPERATOR_FORMS.filter((form) =>
    admits(renderer, `SELECT ${form.probe} AS v FROM t`)).map((form) => form.tag);
  return {functions, operators};
}

function collectNodeTypes(node, into) {
  if (Array.isArray(node)) {
    for (const entry of node) collectNodeTypes(entry, into);
    return;
  }
  if (node === null || typeof node !== 'object') return;
  if (typeof node.type === 'string') into.add(node.type);
  for (const value of Object.values(node)) collectNodeTypes(value, into);
}

// SQLite registers these as functions but accepts them only as keywords.
const KEYWORD_FUNCTIONS = new Set(['current_date', 'current_time', 'current_timestamp']);

const AGGREGATE_CALL = new RegExp(`\\b(?:${Object.keys(AGGREGATE_FUNCTIONS).join('|')})\\s*\\(`,
  'iu');

/**
 * Whether a statement calls an aggregate: the statements whose SQLite result
 * can depend on scan order (overflow, compensated sums, MIN/MAX and bare
 * column representatives, GROUP_CONCAT order).
 * @param {string} sql
 * @return {boolean}
 */
function callsAggregate(sql) {
  return AGGREGATE_CALL.test(sql);
}

// Functions of connection state: a coordinator read path must refuse them
// rather than answer from whichever connection evaluates them (design
// re-review 2026-11-17).
const CONNECTION_STATE_FUNCTIONS = Object.freeze(['changes', 'last_insert_rowid',
  'total_changes']);

const PRODUCTION_FUNCTIONS = Object.freeze([...new Set([...Object.keys(SCALAR_FUNCTIONS),
  ...Object.keys(AGGREGATE_FUNCTIONS), ...Object.keys(WINDOW_FUNCTIONS)])]);

/**
 * Admitted constructs the generated statements do not cover.
 * @param {Object} admitted - admittedGrammar().
 * @param {Object[]} cases - generated statements of the fixed seeds.
 * @return {string[]} One line per gap.
 */
function grammarParityGaps(admitted, cases) {
  const text = cases.map((testCase) => testCase.sql).join('\n');
  const lower = text.toLowerCase();
  const nodeTypes = new Set();
  for (const testCase of cases) {
    try {
      collectNodeTypes(new SQLParser(testCase.sql).parse(), nodeTypes);
    } catch {
      // A refused statement contributes no node types; its refusal is the
      // differential's divergence.
    }
  }
  const gaps = [];
  for (const name of admitted.functions) {
    const call = KEYWORD_FUNCTIONS.has(name) ? `\\b${name}\\b` : `\\b${name}\\s*\\(`;
    if (!PRODUCTION_FUNCTIONS.includes(name)) gaps.push(`function ${name}: no production`);
    else if (!new RegExp(call, 'u').test(lower)) gaps.push(`function ${name}: never generated`);
  }
  for (const tag of admitted.operators) {
    const form = OPERATOR_FORMS.find((entry) => entry.tag === tag);
    if (!text.includes(form.token)) gaps.push(`operator ${tag}: never generated`);
  }
  for (const type of REQUIRED_NODE_TYPES) {
    if (!nodeTypes.has(type)) gaps.push(`node type ${type}: no parsed statement carries it`);
  }
  return gaps;
}

export {
  AGGREGATE_FUNCTIONS,
  CONNECTION_STATE_FUNCTIONS,
  OPERATOR_FORMS,
  SCALAR_FUNCTIONS,
  WINDOW_FUNCTIONS,
  admittedGrammar,
  callsAggregate,
  grammarParityGaps,
  operatorExpression,
};
