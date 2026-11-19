/**
 * Seeded corpus of the differential oracle (§4.1, layer C families F1-F8).
 *
 * A project-local PRNG (mulberry32) drives every choice; nothing reads
 * Math.random. The same seed yields the same rows and the same statements,
 * so a printed seed reproduces a failure exactly:
 *   LAGRANGE_SQL_ORACLE_SEEDS=<seed>[,<seed>...]   replay given seeds
 *   LAGRANGE_SQL_ORACLE_SEEDS=random:<n>           n fresh seeds (printed)
 * Without the variable the four FIXED_SEEDS run (deterministic CI).
 *
 * Every generated statement names its output columns c0..cN, imposes a total
 * ORDER BY whenever it has a LIMIT, and carries the compare spec normalize.js
 * reads (ordered, orderKey, groupConcat, collations).
 *
 * Grammar. Only SQLite-dialect statements that SQLite 3.49 accepts are
 * generated (no PostgreSQL-only syntax, no invalid UTF-8 or lone surrogates:
 * partitions store those as U+FFFD before any coordinator code runs). The
 * families are the scope the Quest statement names, including the
 * coordinator-evaluated shapes of F7; a front-end refusal of any of them is a
 * one-sided error and counts as a divergence.
 */

import crypto from 'node:crypto';

import {
  AGGREGATE_FUNCTIONS,
  CONNECTION_STATE_FUNCTIONS,
  OPERATOR_FORMS,
  SCALAR_FUNCTIONS,
  WINDOW_FUNCTIONS,
  operatorExpression,
} from './grammar.js';
import {KEY_SPACE, textKey} from './schema.js';

const FIXED_SEEDS = Object.freeze([0x5eed0001, 0x0c0ffee5, 20261117, 0x7a11c0de]);
const SEED_ENV = 'LAGRANGE_SQL_ORACLE_SEEDS';
const RANDOM_PREFIX = 'random:';
const UINT32_RANGE = 4294967296;

const FAMILY = Object.freeze({
  F1: 'F1-scalar-projection',
  F2: 'F2-where',
  F3: 'F3-order-by',
  F4: 'F4-distinct',
  F5: 'F5-aggregates',
  F6: 'F6-joins',
  F7: 'F7-coordinator-evaluated',
  F8: 'F8-typed-parameters',
  F11: 'F11-declared-ddl-reference',
});

// Random statements per family and seed, on top of each family's coverage
// block (grammar parity: every admitted function and operator, every seed).
const FAMILY_SIZES = Object.freeze({
  [FAMILY.F1]: 12, [FAMILY.F2]: 20, [FAMILY.F3]: 18, [FAMILY.F4]: 10,
  [FAMILY.F5]: 14, [FAMILY.F6]: 16, [FAMILY.F7]: 10, [FAMILY.F8]: 12,
  [FAMILY.F11]: 16,
});

// F11 compares against the reference built from the DDL as declared; every
// other family against the reference built from the rendered DDL.
const DECLARED_REFERENCE_FAMILIES = Object.freeze([FAMILY.F11]);
const COVERAGE_CHUNK = 5;

/**
 * mulberry32: a 32-bit seeded generator, local to this module.
 * @param {number} seed
 * @return {Object} next/int/pick/chance
 */
function createPrng(seed) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / UINT32_RANGE;
  };
  const int = (low, high) => low + Math.floor(next() * (high - low + 1));
  return {
    next,
    int,
    pick: (items) => items[int(0, items.length - 1)],
    chance: (probability) => next() < probability,
  };
}

/**
 * The seeds this run uses.
 * @param {string|undefined} value - LAGRANGE_SQL_ORACLE_SEEDS.
 * @return {number[]}
 */
function resolveSeeds(value = process.env[SEED_ENV]) {
  if (value === undefined || value.trim() === '') return [...FIXED_SEEDS];
  if (value.startsWith(RANDOM_PREFIX)) {
    const count = Number.parseInt(value.slice(RANDOM_PREFIX.length), 10);
    if (!Number.isInteger(count) || count <= 0) {
      throw new Error(`${SEED_ENV}=${value}: expected random:<positive integer>`);
    }
    return Array.from({length: count}, () => crypto.randomInt(0, 2 ** 32 - 1));
  }
  return value.split(',').map((entry) => {
    const seed = Number(entry.trim());
    if (!Number.isInteger(seed) || seed < 0 || seed >= UINT32_RANGE) {
      throw new Error(`${SEED_ENV}: ${entry} is not a 32-bit seed`);
    }
    return seed;
  });
}

// ---- rows -------------------------------------------------------------------

const INT64_MAX = 9223372036854775807n;
const INT64_MIN = -9223372036854775808n;
const TWO_53 = 9007199254740992n;

const POOL = Object.freeze({
  i: [-3n, -1n, 0n, 1n, 2n, 3n, 5n, 7n, 10n],
  iEdge: [INT64_MAX, INT64_MIN, TWO_53 + 1n, TWO_53 - 1n, -(TWO_53 + 1n)],
  r: [0.5, 1.5, 2.5, -2.5, 0.9365, 2.0, -0.0, 0.1, 1e308, -3.25, 1.0, 0.125],
  n: [1n, 2.5, '3', 0n, -1.5, '07', 4n],
  x: ['a', 'A', 'b', 'B', '', 'é', 'É', 'ß', '😀', 'ｱ', 'xxabcxx', 'abc', 'ABC',
    ' a', 'a ', '10', '9', '\tx\t', 'a%b', 'a_b'],
  z: ['a', 'a ', 'a  ', 'b', 'B', ' b', ''],
  b: [Buffer.alloc(0), Buffer.from('A'), Buffer.from([0, 255]), Buffer.from('a'),
    Buffer.from('ab')],
  a: [1n, 2n, -1n, 2.5, 0.9, 1.0, '1', 'b', '2.5', ' 3', Buffer.from('A'), Buffer.alloc(0),
    TWO_53 + 1n],
  v: [1n, 2n, 0.4, 1.0, '1', 'a', 2.5, -1n, Buffer.from('a')],
  w: [1n, 0n, 1.0, 2.5, '1', '1.0', ' 2', '3e0', 'abc', 'true', '2024-01-01', '0x10',
    '12.50', Buffer.from('A')],
});

const DECLARED_TYPE_COLUMNS = Object.freeze(['nu', 'de', 'bo', 'd', 'ts', 'vc']);
const NULL_PROBABILITY = 0.12;
const EDGE_PROBABILITY = 0.02;

function nullable(prng, value) {
  return prng.chance(NULL_PROBABILITY) ? null : value;
}

function pickKeys(prng, count, skewed) {
  const keys = new Set();
  const skewHigh = KEY_SPACE.min + Math.floor((KEY_SPACE.max - KEY_SPACE.min) / 5);
  while (keys.size < count) {
    const inSkew = skewed && prng.chance(0.75);
    keys.add(BigInt(inSkew ? prng.int(KEY_SPACE.min, skewHigh) :
      prng.int(KEY_SPACE.min, KEY_SPACE.max)));
  }
  return [...keys];
}

function tRow(prng, id) {
  return {
    id,
    i: nullable(prng, prng.chance(EDGE_PROBABILITY) ? prng.pick(POOL.iEdge) : prng.pick(POOL.i)),
    r: nullable(prng, prng.pick(POOL.r)),
    n: nullable(prng, prng.pick(POOL.n)),
    x: nullable(prng, prng.pick(POOL.x)),
    c: nullable(prng, prng.pick(POOL.x)),
    z: nullable(prng, prng.pick(POOL.z)),
    b: nullable(prng, prng.pick(POOL.b)),
    a: nullable(prng, prng.pick(POOL.a)),
  };
}

/**
 * Rows for one seed: uniform or skewed over the key space.
 * @param {Object} prng
 * @return {{t: Object[], u: Object[], distribution: string}}
 */
function generateRows(prng) {
  const skewed = prng.chance(0.5);
  const tKeys = pickKeys(prng, prng.int(28, 40), skewed);
  const t = tKeys.map((id) => tRow(prng, id));
  const uKeys = new Set();
  while (uKeys.size < prng.int(12, 20)) {
    uKeys.add(prng.chance(0.5) ? prng.pick(tKeys) :
      BigInt(prng.int(KEY_SPACE.min, KEY_SPACE.max)));
  }
  const u = [...uKeys].map((k) => ({k, tk: nullable(prng, prng.pick(POOL.x)),
    v: nullable(prng, prng.pick(POOL.v))}));
  const w = pickKeys(prng, prng.int(12, 20), skewed).map((id) => Object.fromEntries([
    ['id', id], ...DECLARED_TYPE_COLUMNS.map((column) =>
      [column, nullable(prng, prng.pick(POOL.w))])]));
  const sRows = pickKeys(prng, prng.int(12, 20), skewed).map((position) => ({
    sk: textKey(Number(position)),
    sn: nullable(prng, prng.chance(EDGE_PROBABILITY * 3) ? prng.pick(POOL.iEdge) :
      prng.pick(POOL.i)),
    sv: nullable(prng, prng.pick(POOL.v)),
    sc: nullable(prng, prng.pick(POOL.x)),
  }));
  return {t, u, w, s: sRows, distribution: skewed ? 'skewed' : 'uniform'};
}

// ---- expression grammar -------------------------------------------------------

const COLUMNS = Object.freeze({
  numeric: ['i', 'r', 'n', 'a'],
  text: ['x', 'c', 'z'],
  any: ['i', 'r', 'n', 'x', 'c', 'z', 'b', 'a'],
  groupKeys: ['x', 'c', 'z', 'i', 'a', 'n'],
});

const LITERAL = Object.freeze({
  integer: ['0', '1', '2', '3', '-1', '10'],
  real: ['0.5', '1.5', '2.0', '2.5', '1.2'],
  text: ['\'a\'', '\'A\'', '\'abc\'', '\'\'', '\'é\'', '\'x\'', '\'10\'', '\'b\''],
  truth: ['\'0\'', '\'1\'', '\'a\'', '0.0', '2.5', 'NULL', '\'0.0\'', '\' 1\''],
  trimChars: ['\' \'', '\'x\'', '\'a\'', '\'ab\'', '\' a\''],
  castTypes: ['INTEGER', 'REAL', 'TEXT', 'NUMERIC', 'BLOB'],
});

function literal(prng) {
  const kind = prng.pick(['integer', 'integer', 'real', 'text', 'text']);
  return prng.pick(LITERAL[kind]);
}

function comparison(prng, left) {
  const op = prng.pick(['=', '<', '>', '<=', '>=', '<>', 'IS', 'IS NOT']);
  return `${left} ${op} ${literal(prng)}`;
}

const SCALAR_BUILDERS = Object.freeze([
  (p, q) => `abs(${q(p.pick(COLUMNS.numeric))})`,
  (p, q) => `length(${q(p.pick(COLUMNS.any))})`,
  (p, q) => `${p.pick(['lower', 'upper'])}(${q(p.pick(COLUMNS.text))})`,
  (p, q) => `typeof(${q(p.pick(COLUMNS.any))})`,
  (p, q) => `${p.pick(['hex', 'quote'])}(${q(p.pick(COLUMNS.any))})`,
  (p, q) => `trim(${q(p.pick(COLUMNS.text))})`,
  (p, q) => `${p.pick(['trim', 'ltrim', 'rtrim'])}(${q(p.pick(COLUMNS.text))}, ` +
    `${p.pick(LITERAL.trimChars)})`,
  (p, q) => `substr(${q(p.pick(COLUMNS.text))}, ${p.int(0, 3)}${p.chance(0.5) ?
    `, ${p.int(1, 3)}` : ''})`,
  (p, q) => `round(${q(p.pick(COLUMNS.numeric))}${p.chance(0.6) ? `, ${p.int(0, 3)}` : ''})`,
  (p, q) => `instr(${q(p.pick(COLUMNS.text))}, ${p.pick(LITERAL.text)})`,
  (p, q) => `${p.pick(['coalesce', 'ifnull', 'nullif'])}(${q(p.pick(COLUMNS.any))}, ` +
    `${literal(p)})`,
  (p, q) => `iif(${comparison(p, q(p.pick(COLUMNS.any)))}, 'y', 'n')`,
  (p, q) => `CAST(${q(p.pick(COLUMNS.any))} AS ${p.pick(LITERAL.castTypes)})`,
  (p, q) => `CASE WHEN ${p.chance(0.5) ? p.pick(LITERAL.truth) : q(p.pick(COLUMNS.any))} ` +
    `THEN ${q(p.pick(COLUMNS.any))} ELSE ${literal(p)} END`,
  (p, q) => `${q(p.pick(COLUMNS.numeric))} ${p.pick(['+', '-', '*', '/', '%'])} ` +
    `${p.pick([...LITERAL.integer, ...LITERAL.real])}`,
  (p, q) => `${q(p.pick(COLUMNS.any))} || ${literal(p)}`,
  (p, q) => comparison(p, q(p.pick(COLUMNS.any))),
  (p, q) => `${q(p.pick(COLUMNS.text))} LIKE ${p.pick(['\'a%\'', '\'%b\'', '\'_\'',
    '\'A%\'', '\'%\''])}`,
  (p, q) => `${p.pick(['max', 'min'])}(${q(p.pick(COLUMNS.any))}, ${q(p.pick(COLUMNS.any))})`,
]);

const bare = (column) => column;

function scalarExpression(prng, qualify = bare) {
  return prng.pick(SCALAR_BUILDERS)(prng, qualify);
}

const PREDICATE_BUILDERS = Object.freeze([
  (p) => comparison(p, p.pick(COLUMNS.any)),
  (p) => `${p.pick(COLUMNS.text)} LIKE ${p.pick(['\'a%\'', '\'%b%\'', '\'A_\'', '\'\''])}`,
  (p) => `${p.pick(COLUMNS.text)} GLOB ${p.pick(['\'a*\'', '\'[aA]*\'', '\'?\''])}`,
  (p) => `${p.pick(COLUMNS.numeric)} BETWEEN ${p.pick(LITERAL.integer)} AND ` +
    `${p.pick(['3', '10', '2.5'])}`,
  (p) => `${p.pick(COLUMNS.any)} IN (${literal(p)}, ${literal(p)}, ${literal(p)})`,
  (p) => `${p.pick(COLUMNS.any)} IS ${p.chance(0.5) ? '' : 'NOT '}NULL`,
  (p) => `NOT (${comparison(p, p.pick(COLUMNS.any))})`,
  (p) => `${comparison(p, p.pick(COLUMNS.any))} ${p.pick(['AND', 'OR'])} ` +
    `${comparison(p, p.pick(COLUMNS.any))}`,
  (p) => `${p.pick(COLUMNS.text)} = ${p.pick(LITERAL.text)} COLLATE NOCASE`,
  (p) => `${p.pick(COLUMNS.numeric)} / ${p.pick(LITERAL.real)} > ${p.pick(LITERAL.real)}`,
  (p) => `id = ${p.int(KEY_SPACE.min, KEY_SPACE.max)}`,
  (p) => `id BETWEEN ${p.int(1, 40)} AND ${p.int(41, 100)}`,
  (p) => `id IN (${p.int(1, 30)}, ${p.int(31, 60)}, ${p.int(61, 100)})`,
  (p) => `${scalarExpression(p)} ${p.pick(['=', '>', '<>'])} ${literal(p)}`,
]);

function predicate(prng) {
  return prng.pick(PREDICATE_BUILDERS)(prng);
}

// ---- statement families -------------------------------------------------------

function ordered(extra = {}) {
  return {ordered: true, ...extra};
}

function optionalWhere(prng, probability) {
  return prng.chance(probability) ? ` WHERE ${predicate(prng)}` : '';
}

function chunks(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function shuffled(prng, items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = prng.int(0, index);
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}

function projectionCase(expressions) {
  const list = expressions.map((e, index) => `${e} AS c${index + 1}`).join(', ');
  return {sql: `SELECT id AS c0, ${list} FROM t ORDER BY id`, compare: ordered()};
}

// F1 coverage: every built-in scalar function (five per statement) and every
// operator form, each seed. load_extension stands alone (SQLite refuses it on every connection),
// and so does each connection-state function, whose expected outcome on a
// distributed read is a typed refusal, not any connection's state.
function scalarCoverage(prng) {
  const isolated = ['load_extension', ...CONNECTION_STATE_FUNCTIONS];
  const names = shuffled(prng, Object.keys(SCALAR_FUNCTIONS))
    .filter((name) => !isolated.includes(name));
  const calls = names.map((name) => SCALAR_FUNCTIONS[name](prng));
  // One operator form per statement (two operand choices): a form SQLite
  // or the front end rejects must not hide the other forms' answers.
  const operators = OPERATOR_FORMS.map((form) =>
    [operatorExpression(prng, form), operatorExpression(prng, form)]);
  return [
    ...[...chunks(calls, COVERAGE_CHUNK), ...operators,
      [SCALAR_FUNCTIONS.load_extension(prng)]].map(projectionCase),
    ...CONNECTION_STATE_FUNCTIONS.map((name) => ({...projectionCase([SCALAR_FUNCTIONS[name](prng)]),
      expect: 'typed-refusal'})),
  ];
}

// F5 coverage: every built-in aggregate, globally.
function aggregateCoverage(prng) {
  return Object.keys(AGGREGATE_FUNCTIONS).map((name) => {
    const aggregate = AGGREGATE_FUNCTIONS[name](prng);
    return {sql: `SELECT ${aggregate.sql} AS c0 FROM t`,
      compare: {ordered: false, groupConcat: aggregate.concat ? {c0: aggregate.concat} : {}}};
  });
}

// F7 coverage: every window function over one total window order, and the
// EXISTS form.
function coordinatorEvaluatedCoverage(prng) {
  const windows = Object.keys(WINDOW_FUNCTIONS).map((name) =>
    `${WINDOW_FUNCTIONS[name](prng)} OVER (ORDER BY id)`);
  return [
    ...chunks(windows, COVERAGE_CHUNK).map(projectionCase),
    {sql: 'SELECT id AS c0 FROM t WHERE EXISTS (SELECT 1 FROM u WHERE u.k = t.id) ' +
      'ORDER BY id', compare: ordered()},
  ];
}

const COVERAGE = Object.freeze({
  [FAMILY.F1]: scalarCoverage,
  [FAMILY.F5]: aggregateCoverage,
  [FAMILY.F7]: coordinatorEvaluatedCoverage,
});

function scalarProjection(prng) {
  const expressions = [scalarExpression(prng)];
  if (prng.chance(0.4)) expressions.push(scalarExpression(prng));
  const list = expressions.map((e, index) => `${e} AS c${index + 1}`).join(', ');
  return {sql: `SELECT id AS c0, ${list} FROM t${optionalWhere(prng, 0.3)} ORDER BY id`,
    compare: ordered()};
}

// Statements over s, the TEXT-keyed table: key routing and an index on sn.
const TEXT_KEY_CASES = Object.freeze({
  where: (p) => p.pick([
    () => `sk = '${textKey(p.int(KEY_SPACE.min, KEY_SPACE.max))}'`,
    () => `sk BETWEEN '${textKey(p.int(1, 40))}' AND '${textKey(p.int(41, 100))}'`,
    () => `sk IN ('${textKey(p.int(1, 30))}', '${textKey(p.int(31, 100))}')`,
    () => `sn > ${p.pick(['0', '-1', '2'])}`,
    () => `sc = ${p.pick(LITERAL.text)}`,
    () => 'sk LIKE \'k0%\'',
  ])(),
  aggregate: (p) => p.pick(['SUM(sn)', 'MAX(sv)', 'MIN(sn)', 'TOTAL(sn)', 'COUNT(sv)',
    'GROUP_CONCAT(sk)', 'AVG(sn)']),
});

function textKeyCase(prng, family) {
  if (family === FAMILY.F2) {
    return {sql: `SELECT sk AS c0 FROM s WHERE ${TEXT_KEY_CASES.where(prng)} ORDER BY sk`,
      compare: ordered()};
  }
  if (family === FAMILY.F3) {
    return {sql: `SELECT sk AS c0, sn AS c1 FROM s ORDER BY sn${prng.pick(['', ' DESC'])}, ` +
      `sk LIMIT ${prng.int(1, 6)}`, compare: ordered()};
  }
  const aggregate = TEXT_KEY_CASES.aggregate(prng);
  const where = prng.chance(0.4) ? ` WHERE ${TEXT_KEY_CASES.where(prng)}` : '';
  return {sql: `SELECT ${aggregate} AS c0 FROM s${where}`, compare: {ordered: false,
    groupConcat: aggregate.startsWith('GROUP_CONCAT') ? {c0: ','} : {}}};
}

const TEXT_KEY_FAMILIES = Object.freeze([FAMILY.F2, FAMILY.F3, FAMILY.F5]);
const TEXT_KEY_PROBABILITY = 0.2;

function whereFilter(prng) {
  return {sql: `SELECT id AS c0 FROM t WHERE ${predicate(prng)} ORDER BY id`,
    compare: ordered()};
}

function orderTerm(prng, column, collations) {
  const term = prng.pick(['column', 'column', 'collate', 'expression', 'position', 'alias']);
  if (term === 'collate') {
    const collation = prng.pick(['NOCASE', 'RTRIM', 'BINARY']);
    return {sql: `${column} COLLATE ${collation}`, collation};
  }
  if (term === 'expression') {
    return {sql: COLUMNS.text.includes(column) ? `length(${column})` : `${column} * 2`,
      collation: null, keyless: true};
  }
  const collation = collations[column] ?? null;
  return {sql: term === 'position' ? '2' : term === 'alias' ? 'c1' : column, collation};
}

function orderByCase(prng, collations) {
  const column = prng.pick(COLUMNS.any);
  const term = orderTerm(prng, column, collations);
  const direction = prng.pick(['', ' ASC', ' DESC']);
  const limited = prng.chance(0.5);
  if (!limited && !term.keyless && prng.chance(0.4)) {
    return {sql: `SELECT id AS c0, ${column} AS c1 FROM t ORDER BY ${term.sql}${direction}`,
      compare: ordered({orderKey: [{column: 'c1', collation: term.collation}]})};
  }
  const limit = limited ? ` LIMIT ${prng.int(1, 8)}${prng.chance(0.5) ?
    ` OFFSET ${prng.int(0, 5)}` : ''}` : '';
  return {sql: `SELECT id AS c0, ${column} AS c1 FROM t${optionalWhere(prng, 0.25)} ` +
    `ORDER BY ${term.sql}${direction}, id${prng.pick(['', ' DESC'])}${limit}`,
  compare: ordered()};
}

function distinctCase(prng, collations) {
  if (prng.chance(0.3)) {
    const [first, second] = [prng.pick(COLUMNS.groupKeys), prng.pick(['i', 'r', 'b'])];
    return {sql: `SELECT DISTINCT ${first} AS c0, ${second} AS c1 FROM t ORDER BY c0, c1`,
      compare: ordered({collations: {c0: collations[first] ?? null}})};
  }
  const bareColumn = prng.chance(0.6);
  const column = prng.pick(COLUMNS.groupKeys);
  const expression = bareColumn ? column : scalarExpression(prng);
  const collation = bareColumn ? collations[column] ?? null : null;
  const orderBy = prng.chance(0.7) ? ' ORDER BY c0' : '';
  return {sql: `SELECT DISTINCT ${expression} AS c0 FROM t${optionalWhere(prng, 0.3)}${orderBy}`,
    compare: {ordered: orderBy !== '', collations: {c0: collation}}};
}

const AGGREGATE_BUILDERS = Object.freeze([
  () => ({sql: 'COUNT(*)'}),
  (p) => ({sql: `COUNT(${p.pick(COLUMNS.any)})`}),
  (p) => ({sql: `SUM(${p.pick(COLUMNS.numeric)})`}),
  (p) => ({sql: `AVG(${p.pick(COLUMNS.numeric)})`}),
  (p) => ({sql: `TOTAL(${p.pick(COLUMNS.numeric)})`}),
  (p) => ({sql: `${p.pick(['MIN', 'MAX'])}(${p.pick(COLUMNS.any)})`}),
  (p) => ({sql: `GROUP_CONCAT(${p.pick(COLUMNS.text)})`, concat: ','}),
  (p) => ({sql: `GROUP_CONCAT(${p.pick(COLUMNS.text)}, ';')`, concat: ';'}),
  (p) => ({sql: `COUNT(DISTINCT ${p.pick(COLUMNS.any)})`}),
  (p) => ({sql: `${p.pick(['SUM', 'AVG', 'TOTAL'])}(DISTINCT ${p.pick(COLUMNS.numeric)})`}),
]);

const AGGREGATE_WRAPPERS = Object.freeze([
  (p) => `${p.pick(['TRIM', 'LTRIM', 'RTRIM'])}(MAX(${p.pick(COLUMNS.text)}), ` +
    `${p.pick(LITERAL.trimChars)})`,
  (p) => `CAST(${p.pick(['SUM', 'AVG', 'MAX', 'MIN'])}(${p.pick(COLUMNS.numeric)}) AS ` +
    `${p.pick(LITERAL.castTypes)})`,
  (p) => `CASE WHEN ${p.pick(LITERAL.truth)} THEN SUM(${p.pick(COLUMNS.numeric)}) ELSE 0 END`,
  (p) => `ROUND(${p.pick(['AVG', 'MAX', 'SUM'])}(${p.pick(COLUMNS.numeric)}), ${p.int(0, 3)})`,
  (p) => `LENGTH(${p.pick(['AVG', 'MAX', 'SUM'])}(${p.pick(COLUMNS.any)}))`,
  (p) => `${p.pick(['UPPER', 'LOWER'])}(${p.pick(['MAX', 'MIN'])}(${p.pick(COLUMNS.text)}))`,
  (p) => `MAX(${p.pick(COLUMNS.numeric)}) - MIN(${p.pick(COLUMNS.numeric)})`,
  (p) => `COALESCE(SUM(${p.pick(COLUMNS.numeric)}), 0)`,
  (p) => `typeof(${p.pick(['SUM', 'AVG', 'MAX', 'TOTAL'])}(${p.pick(COLUMNS.numeric)}))`,
  (p) => `${p.pick(['hex', 'quote', 'abs'])}(MAX(${p.pick(COLUMNS.any)}))`,
  (p) => `NULLIF(COUNT(*), ${p.int(1, 3)})`,
  (p) => `IIF(COUNT(*) > ${p.int(1, 6)}, 'y', 'n')`,
  (p) => `SUBSTR(MAX(${p.pick(COLUMNS.text)}), ${p.int(1, 3)})`,
  (p) => `COUNT(*) * 2 + ${p.pick(['1', '0.5'])}`,
]);

function aggregateExpression(prng) {
  if (prng.chance(0.45)) {
    return {sql: prng.pick(AGGREGATE_WRAPPERS)(prng)};
  }
  return prng.pick(AGGREGATE_BUILDERS)(prng);
}

function aggregateCompare(outputs, collations, extra = {}) {
  const groupConcat = Object.fromEntries(outputs.filter((o) => o.concat)
    .map((o) => [o.name, o.concat]));
  return {groupConcat, collations, ...extra};
}

function havingPredicate(prng, expression) {
  return prng.pick([
    () => `${expression.sql} = ${literal(prng)}`,
    () => `${expression.sql} > ${prng.pick(LITERAL.integer)}`,
    () => `${expression.sql} IS NOT NULL`,
    () => `COUNT(*) > ${prng.int(0, 3)}`,
    () => `${expression.sql} LIKE 'a%'`,
  ])();
}

function groupKey(prng, collations) {
  const column = prng.pick(COLUMNS.groupKeys);
  if (prng.chance(0.25) && COLUMNS.text.includes(column)) {
    const collation = prng.pick(['NOCASE', 'RTRIM']);
    return {term: `${column} COLLATE ${collation}`, select: column, collation};
  }
  return {term: column, select: column, collation: collations[column] ?? null};
}

// One aggregate expression, emitted twice: in the projection and in HAVING.
function aggregatePair(prng, collations) {
  const expression = aggregateExpression(prng);
  const grouped = prng.chance(0.55);
  const where = optionalWhere(prng, 0.25);
  if (!grouped) {
    const outputs = [{name: 'c0', ...expression}];
    return [
      {sql: `SELECT ${expression.sql} AS c0 FROM t${where}`,
        compare: aggregateCompare(outputs, {}, {ordered: false})},
      {sql: `SELECT COUNT(*) AS c0 FROM t${where} HAVING ${havingPredicate(prng, expression)}`,
        compare: {ordered: false}},
    ];
  }
  const key = groupKey(prng, collations);
  const keyCollations = {c0: key.collation};
  const orderCollation = key.collation ? ` COLLATE ${key.collation}` : '';
  const orderKey = [{column: 'c0', collation: key.collation}];
  const byAggregate = prng.chance(0.3);
  const orderBy = byAggregate ?
    ` ORDER BY ${prng.pick([expression.sql, 'c1', '2'])} DESC, c0${orderCollation}` :
    ` ORDER BY c0${orderCollation}`;
  const outputs = [{name: 'c1', ...expression}];
  return [
    {sql: `SELECT ${key.select} AS c0, ${expression.sql} AS c1 FROM t${where} ` +
      `GROUP BY ${key.term}${orderBy}`,
    compare: aggregateCompare(outputs, keyCollations,
      {ordered: true, orderKey: byAggregate ? undefined : orderKey})},
    {sql: `SELECT ${key.select} AS c0, COUNT(*) AS c1 FROM t${where} GROUP BY ${key.term} ` +
      `HAVING ${havingPredicate(prng, expression)} ORDER BY c0${orderCollation}`,
    compare: {ordered: true, orderKey, collations: keyCollations}},
  ];
}

const JOIN_CONDITIONS = Object.freeze(['t.id = u.k', 't.i = u.k', 't.x = u.tk',
  't.c = u.tk', 't.a = u.v', 't.i < u.k']);
const JOIN_RESIDUALS = Object.freeze([
  'CAST(t.a + u.v AS INTEGER) = 1', 'TRIM(t.x, \'x\') = u.tk',
  'CASE WHEN \'0\' THEN t.r ELSE 0 END = 0', 't.i + u.k > 50', 'u.v > t.r',
  't.x || u.tk = \'ab\'', 'u.tk LIKE \'a%\'', 't.r IS NOT NULL',
  'CAST(t.r + u.v AS INTEGER) = 2', 'u.v = 1',
]);

function qualifiedT(column) {
  return `t.${column}`;
}

function joinCase(prng) {
  const kind = prng.pick(['JOIN', 'JOIN', 'LEFT JOIN']);
  const condition = prng.pick(JOIN_CONDITIONS);
  const residual = prng.chance(0.35) ? ` AND ${prng.pick(JOIN_RESIDUALS)}` : '';
  const where = prng.chance(0.35) ? ` WHERE ${prng.pick(JOIN_RESIDUALS)}` : '';
  const projection = prng.chance(0.3) ? `, ${scalarExpression(prng, qualifiedT)} AS c2` : '';
  return {sql: `SELECT t.id AS c0, u.k AS c1${projection} FROM t ${kind} u ON ${condition}` +
    `${residual}${where} ORDER BY t.id, u.k`, compare: ordered()};
}

const COORDINATOR_EVALUATED = Object.freeze([
  () => ({sql: 'SELECT c0, c1 FROM (SELECT id AS c0, x AS c1 FROM t) ORDER BY c1, c0',
    compare: ordered()}),
  (p) => ({sql: `WITH s AS (SELECT id, i FROM t WHERE i > ${p.pick(LITERAL.integer)}) ` +
    'SELECT id AS c0, i AS c1 FROM s ORDER BY id', compare: ordered()}),
  (p) => ({sql: `SELECT x AS c0 FROM t UNION${p.pick(['', ' ALL'])} SELECT tk FROM u ` +
    'ORDER BY 1', compare: ordered({orderKey: [{column: 'c0', collation: null}]})}),
  () => ({sql: 'SELECT id AS c0, ROW_NUMBER() OVER (ORDER BY id) AS c1 FROM t ORDER BY id',
    compare: ordered()}),
  (p) => ({sql: `SELECT id AS c0, SUM(${p.pick(COLUMNS.numeric)}) OVER (ORDER BY id) AS c1 ` +
    'FROM t ORDER BY id', compare: ordered()}),
  () => ({sql: 'SELECT id AS c0 FROM t WHERE i > (SELECT AVG(i) FROM t) ORDER BY id',
    compare: ordered()}),
  () => ({sql: 'SELECT id AS c0 FROM t WHERE id IN (SELECT k FROM u) ORDER BY id',
    compare: ordered()}),
  (p) => ({sql: `SELECT GROUP_CONCAT(${p.pick(COLUMNS.text)}, ',' ORDER BY id) AS c0 FROM t`,
    compare: {ordered: false}}),
  () => ({sql: 'SELECT lower(x) AS c0, COUNT(*) AS c1 FROM t GROUP BY lower(x) ORDER BY c0',
    compare: ordered()}),
  () => ({sql: 'SELECT x AS c0 FROM t EXCEPT SELECT tk FROM u ORDER BY 1', compare: ordered()}),
]);

function coordinatorEvaluatedCase(prng) {
  return prng.pick(COORDINATOR_EVALUATED)(prng);
}

const PARAMETER_VALUES = Object.freeze([5n, -1n, TWO_53 + 1n, 2, 2.5, -0, 0.9365, 'a', '2',
  '', Buffer.from('A'), null]);

const PARAMETER_CASES = Object.freeze([
  (p) => ({sql: 'SELECT id AS c0 FROM t WHERE i = ? ORDER BY id',
    params: [p.pick([2n, 3n, 2, 3, '2'])]}),
  (p) => ({sql: 'SELECT id AS c0 FROM t WHERE x = ? ORDER BY id',
    params: [p.pick(['a', 'A', '10', 10n])]}),
  (p) => ({sql: 'SELECT id AS c0 FROM t WHERE b = ? ORDER BY id',
    params: [p.pick([Buffer.from('A'), Buffer.alloc(0), 'A'])]}),
  (p) => ({sql: 'SELECT id AS c0 FROM t WHERE id = ?',
    params: [BigInt(p.int(KEY_SPACE.min, KEY_SPACE.max))]}),
  (p) => ({sql: 'SELECT COUNT(*) AS c0 FROM t WHERE r > ?', params: [p.pick([0.5, 1n, '1'])]}),
  (p) => ({sql: 'SELECT id AS c0, ? AS c1, typeof(?) AS c2 FROM t WHERE id <= ? ORDER BY id',
    params: [p.pick(PARAMETER_VALUES), p.pick(PARAMETER_VALUES), 30n]}),
  (p) => ({sql: 'SELECT id AS c0 FROM t WHERE a = ? ORDER BY id',
    params: [p.pick(PARAMETER_VALUES)]}),
  (p) => ({sql: 'SELECT x AS c0, SUM(i) AS c1 FROM t GROUP BY x HAVING SUM(i) > ? ORDER BY c0',
    params: [p.pick([1n, 1, 2.5])]}),
]);

function parameterCase(prng) {
  return {...prng.pick(PARAMETER_CASES)(prng), compare: ordered()};
}

const DECLARED_SCHEMA_CASES = Object.freeze([
  (p) => {
    const column = p.pick(DECLARED_TYPE_COLUMNS);
    return {sql: `SELECT id AS c0, ${column} AS c1, typeof(${column}) AS c2 FROM w ORDER BY id`};
  },
  (p) => ({sql: `SELECT id AS c0 FROM w WHERE ${p.pick(DECLARED_TYPE_COLUMNS)} = ` +
    `${p.pick(['1', '\'1\'', '2.5', '\'abc\'', '3'])} ORDER BY id`}),
  (p) => ({sql: `SELECT id AS c0, ${p.pick(DECLARED_TYPE_COLUMNS)} + 0 AS c1 FROM w ORDER BY id`}),
  (p) => ({sql: `SELECT SUM(${p.pick(DECLARED_TYPE_COLUMNS)}) AS c0, ` +
    `COUNT(DISTINCT ${p.pick(DECLARED_TYPE_COLUMNS)}) AS c1 FROM w`, compare: {ordered: false}}),
  (p) => ({sql: `SELECT id AS c0 FROM w ORDER BY ${p.pick(DECLARED_TYPE_COLUMNS)}, id`}),
  () => ({sql: 'SELECT id AS c0, n AS c1, typeof(n) AS c2 FROM t ORDER BY id'}),
  (p) => ({sql: `SELECT id AS c0 FROM t WHERE n = ${p.pick(['3', '\'3\'', '1', '4.0'])} ` +
    'ORDER BY id'}),
  () => ({sql: 'SELECT id AS c0, n + 0 AS c1, CAST(n AS TEXT) AS c2 FROM t ORDER BY id'}),
  (p) => ({sql: `SELECT id AS c0 FROM t WHERE c = ${p.pick(LITERAL.text)} ORDER BY id`}),
  (p) => ({sql: `SELECT id AS c0 FROM t WHERE z = ${p.pick(['\'a\'', '\'a \'', '\'b\''])} ` +
    'ORDER BY id'}),
  (p) => ({sql: `SELECT id AS c0, ${p.pick(['c', 'z'])} AS c1 FROM t ORDER BY c1, id`}),
  (p) => ({sql: `SELECT id AS c0 FROM t WHERE c IN (${p.pick(LITERAL.text)}, ` +
    `${p.pick(LITERAL.text)}) ORDER BY id`}),
  () => ({sql: 'SELECT id AS c0 FROM t WHERE c BETWEEN \'a\' AND \'b\' ORDER BY id'}),
  (p, collations) => {
    const column = p.pick(['c', 'z']);
    return {sql: `SELECT DISTINCT ${column} AS c0 FROM t ORDER BY c0`,
      compare: {ordered: true, collations: {c0: collations[column] ?? null},
        orderKey: [{column: 'c0', collation: collations[column] ?? null}]}};
  },
  (p, collations) => {
    const column = p.pick(['c', 'z']);
    return {sql: `SELECT ${column} AS c0, COUNT(*) AS c1 FROM t GROUP BY ${column} ORDER BY c0`,
      compare: {ordered: true, collations: {c0: collations[column] ?? null},
        orderKey: [{column: 'c0', collation: collations[column] ?? null}]}};
  },
  () => ({sql: 'SELECT MIN(c) AS c0, MAX(z) AS c1, COUNT(DISTINCT c) AS c2 FROM t',
    compare: {ordered: false}}),
]);

function declaredSchemaCase(prng, collations) {
  return {compare: ordered(), ...prng.pick(DECLARED_SCHEMA_CASES)(prng, collations)};
}

function familyCases(prng, family, collations) {
  if (TEXT_KEY_FAMILIES.includes(family) && prng.chance(TEXT_KEY_PROBABILITY)) {
    return [textKeyCase(prng, family)];
  }
  switch (family) {
  case FAMILY.F1: return [scalarProjection(prng)];
  case FAMILY.F2: return [whereFilter(prng)];
  case FAMILY.F3: return [orderByCase(prng, collations)];
  case FAMILY.F4: return [distinctCase(prng, collations)];
  case FAMILY.F5: return aggregatePair(prng, collations);
  case FAMILY.F6: return [joinCase(prng)];
  case FAMILY.F7: return [coordinatorEvaluatedCase(prng)];
  case FAMILY.F8: return [parameterCase(prng)];
  default: return [declaredSchemaCase(prng, collations)];
  }
}

/**
 * Rows and statements for one seed.
 * @param {number} seed
 * @param {Object} collations - effective collations of t's columns:
 *   {rendered, declared} (schema.js effectiveCollations).
 * @return {{seed: number, rows: Object, cases: Object[]}}
 */
function generateSeedCorpus(seed, collations) {
  const prng = createPrng(seed);
  const rows = generateRows(prng);
  const cases = [];
  for (const family of Object.values(FAMILY)) {
    const declared = DECLARED_REFERENCE_FAMILIES.includes(family);
    const familyCollations = declared ? collations.declared : collations.rendered;
    const generatedCases = [...(COVERAGE[family]?.(prng) || [])];
    for (let index = 0; index < FAMILY_SIZES[family]; index += 1) {
      generatedCases.push(...familyCases(prng, family, familyCollations));
    }
    generatedCases.forEach((generated, index) => cases.push({id: `${family}#${index + 1}`,
      family, params: [], declared, ...generated}));
  }
  return {seed, rows, cases};
}

export {
  FAMILY,
  SEED_ENV,
  generateSeedCorpus,
  resolveSeeds,
};
