/**
 * The coordinator-sqlite-merge differential oracle (design §4.1 rev 2, Quest
 * coordinator-sqlite-merge).
 *
 * Every distributed SQL result, column names included, must equal what SQLite
 * returns for the same statement over the union of the partitions' rows in
 * canonical layout. The production composition (SQLQueryEngine over real
 * PartitionService replicas; requests through encodeDeliveryMessage, answers
 * through sendRaw's SERVICE_RESPONSE frame: sql-semantics-oracle/cluster.js)
 * runs each statement at 1, 2, 3 and 5 partitions per table, and one SQLite
 * database holding the union of the rows is the reference.
 *
 * One top-level test per measured receipt of the Quest's doneWhen
 * (sql-semantics-oracle/receipt-groups.js):
 *   sqlite-differential-oracle-green              layer C families F1-F8, the
 *       golden divergences and grammar parity
 *   expression-domain-witnesses-trim-cast-case    W-A, W-B, W-B-join, W-C
 *   pushdown-soundness-golden-cases               F12
 *   order-dependent-aggregates-exact              F13
 *   declared-ddl-reference-family                 F11 (reference built from
 *       the DDL as declared)
 *   sql-render-round-trip-fidelity                layer A
 *   typed-wire-storage-class-round-trip           layer B
 *
 * Reference choice (design re-review 2026-11-17): a statement that calls an
 * aggregate (order-dependent: overflow, compensated sums, MIN/MAX and bare
 * representatives, GROUP_CONCAT order) is compared with the canonical
 * reference (no secondary indexes, rows at their canonical rowid); F11 with
 * the declared reference; every other statement with the indexed reference.
 *
 * No retries. A failure prints the seed, the statement, the layout, the
 * delivered SQL and both typed results (normalize.js describeDivergence).
 * Seeds: four fixed seeds; LAGRANGE_SQL_ORACLE_SEEDS=random:<n> or a comma
 * list replays others (corpus-generator.js). LAGRANGE_SQL_ORACLE_REPORT_DIR
 * writes every verdict of a group as <group>.json.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {after, test} from 'node:test';

import {NODE_ID, REFERENCE, openOracleCluster, runOracle} from
  './sql-semantics-oracle/cluster.js';
import {FAMILY, generateSeedCorpus, resolveSeeds, SEED_ENV} from
  './sql-semantics-oracle/corpus-generator.js';
import {admittedGrammar, callsAggregate, grammarParityGaps} from
  './sql-semantics-oracle/grammar.js';
import {compareOutcomes, describeDivergence} from './sql-semantics-oracle/normalize.js';
import {GROUP, GROUP_FAMILIES, loadGoldenCases} from
  './sql-semantics-oracle/receipt-groups.js';
import {ddlRoundTrip, statementRoundTrip} from './sql-semantics-oracle/round-trip.js';
import {
  LAYOUTS,
  declareOracleTables,
  effectiveCollations,
  fixtureRows,
  fixtureValue,
} from './sql-semantics-oracle/schema.js';
import {
  CURRENT_WIRE,
  PARAMETER_WITNESSES,
  ROW_VALUE_WITNESSES,
  deliverToPartition,
} from './sql-semantics-oracle/typed-wire.js';

const GOLDEN_CASES = loadGoldenCases();
const REPORT_DIR_ENV = 'LAGRANGE_SQL_ORACLE_REPORT_DIR';
const PRINTED_DIVERGENCES = 5;
const LISTED_DIVERGENCES = 40;
const DELIVERY = Object.freeze({LOCAL: 'local', REMOTE: 'remote'});
// Golden expectations other than SQLite's answer (design rev 2): a typed
// refusal on every layout, or on every multi-partition layout.
const EXPECT = Object.freeze({
  TYPED_REFUSAL: 'typed-refusal',
  TYPED_REFUSAL_ABOVE_ONE: 'typed-refusal-above-one-partition',
});
const UNTYPED_CODES = new Set(['UNTYPED', 'THROWN', 'null', 'undefined']);
const NOT_RECORDED = Object.freeze({kind: 'error',
  error: {source: 'oracle', code: 'NOT_A_STATEMENT'},
  detail: 'no statement outcome (DDL or wire verdict)'});

const SEEDS = resolveSeeds();
process.stdout.write(`# ${SEED_ENV}=${SEEDS.join(',')}\n`);

const clusters = new Map();
const reports = new Map();
let seededCorpora = null;

async function clusterFor(layout) {
  if (!clusters.has(layout)) {
    clusters.set(layout, await openOracleCluster({partitionCount: layout}));
  }
  return clusters.get(layout);
}

function corpora() {
  if (seededCorpora === null) {
    const collations = effectiveCollations(declareOracleTables());
    seededCorpora = SEEDS.map((seed) => generateSeedCorpus(seed, collations));
  }
  return seededCorpora;
}

after(async () => {
  for (const cluster of clusters.values()) await cluster.close();
  const directory = process.env[REPORT_DIR_ENV];
  if (!directory) return;
  fs.mkdirSync(directory, {recursive: true});
  for (const [group, verdicts] of reports) {
    fs.writeFileSync(path.join(directory, `${group}.json`),
      `${JSON.stringify({group, seeds: SEEDS, verdicts}, null, 1)}\n`);
  }
});

function withOutcomes(verdict) {
  return {...verdict, expected: verdict.expected ?? NOT_RECORDED,
    actual: verdict.actual ?? NOT_RECORDED};
}

function record(group, verdict) {
  if (!reports.has(group)) reports.set(group, []);
  reports.get(group).push({
    scope: verdict.scope, caseId: verdict.caseId, layout: verdict.layout ?? null,
    seed: verdict.seed ?? null, mode: verdict.mode ?? null, equal: verdict.equal,
    classOnly: verdict.classOnly === true, namesUnobserved: verdict.namesUnobserved === true,
    sql: verdict.sql ?? null, reasons: verdict.reasons,
    ...(verdict.equal ? {} : {print: describeDivergence(withOutcomes(verdict))}),
  });
  return verdict;
}

/**
 * Assert that a scope has no divergence; the message carries the §4.1 print
 * for the first few and the seed + case id of the rest.
 * @param {Object[]} verdicts
 */
function assertNoDivergence(verdicts) {
  const divergent = verdicts.filter((verdict) => !verdict.equal);
  if (divergent.length === 0) return;
  const classOnly = divergent.filter((verdict) => verdict.classOnly).length;
  const printed = divergent.slice(0, PRINTED_DIVERGENCES)
    .map((verdict) => describeDivergence(withOutcomes(verdict)));
  const listed = divergent.slice(PRINTED_DIVERGENCES, LISTED_DIVERGENCES).map((verdict) =>
    `  ${verdict.caseId} seed ${verdict.seed ?? 'golden'} layout ${verdict.layout}: ` +
    `${verdict.sql} -- ${verdict.reasons.join('; ')}`);
  const hidden = divergent.length - Math.max(LISTED_DIVERGENCES, PRINTED_DIVERGENCES);
  assert.fail([
    `${divergent.length} of ${verdicts.length} statements diverge from SQLite ` +
      `(${classOnly} only in numeric storage classes the wire does not carry)`,
    ...printed,
    ...listed,
    ...(hidden > 0 ? [`  ... ${hidden} more`] : []),
  ].join('\n'));
}

function isTypedRefusal(outcome) {
  return outcome.kind === 'error' && outcome.error.source === 'lagrange' &&
    !UNTYPED_CODES.has(outcome.error.code);
}

function referenceOf(testCase) {
  if (testCase.declared === true) return REFERENCE.DECLARED;
  if (testCase.reference) return testCase.reference;
  return callsAggregate(testCase.sql) ? REFERENCE.CANONICAL : REFERENCE.INDEXED;
}

function expectsTypedRefusal(testCase, layout) {
  return testCase.expect === EXPECT.TYPED_REFUSAL ||
    (testCase.expect === EXPECT.TYPED_REFUSAL_ABOVE_ONE && layout > 1);
}

async function differential(cluster, testCase, context) {
  const {expected, actual, delivered} = await cluster.run(testCase.sql, testCase.params,
    {reference: referenceOf(testCase)});
  const base = {...context, caseId: testCase.id, sql: testCase.sql, params: testCase.params,
    delivered, expected, actual};
  if (expectsTypedRefusal(testCase, context.layout)) {
    const refused = isTypedRefusal(actual);
    return {...base, equal: refused, classOnly: false, reasons: refused ? [] :
      [`expected a typed refusal (${testCase.expect}); the distributed side ` +
        `${actual.kind === 'rows' ? 'answered' : `failed untyped (${actual.error.code})`}`]};
  }
  return {...base, ...compareOutcomes(expected, actual, testCase.compare)};
}

function goldenStatements(group) {
  return GOLDEN_CASES.filter((golden) => golden.group === group &&
    typeof golden.statement === 'string');
}

function goldenTestCase(golden) {
  return {id: golden.id, sql: golden.statement, params: (golden.params || []).map(fixtureValue),
    compare: golden.compare || {}, expect: golden.expect ?? null};
}

async function goldenSubtests(t, group, layout, cluster) {
  for (const golden of goldenStatements(group)) {
    cluster.load(fixtureRows(golden.rows));
    const verdict = record(group, await differential(cluster, goldenTestCase(golden),
      {scope: `golden ${golden.id}`, layout}));
    await t.test(`layout ${layout}: golden ${golden.id}`, () => assertNoDivergence([verdict]));
  }
}

async function ddlSubtests(t, group) {
  for (const golden of GOLDEN_CASES.filter((entry) => entry.group === group &&
    typeof entry.ddl === 'string')) {
    const verdict = ddlRoundTrip(golden);
    record(group, {scope: `ddl ${golden.id}`, caseId: golden.id, sql: golden.ddl, ...verdict});
    await t.test(`ddl: ${golden.id}`, () => assert.ok(verdict.equal,
      `${golden.ddl}\n  rendered: ${verdict.renderedDdl}\n  ${verdict.reasons.join('\n  ')}`));
  }
}

async function familySubtests(t, group, layout, cluster) {
  const families = GROUP_FAMILIES[group];
  const verdicts = [];
  for (const corpus of corpora()) {
    cluster.load(corpus.rows);
    for (const testCase of corpus.cases.filter((entry) => families.includes(entry.family))) {
      verdicts.push(record(group, await differential(cluster, testCase,
        {scope: testCase.family, layout, seed: corpus.seed})));
    }
  }
  for (const family of families) {
    await t.test(`layout ${layout}: ${family}`, () =>
      assertNoDivergence(verdicts.filter((verdict) => verdict.scope === family)));
  }
}

async function seededGroup(t, group) {
  for (const layout of LAYOUTS) {
    const cluster = await clusterFor(layout);
    await familySubtests(t, group, layout, cluster);
    await goldenSubtests(t, group, layout, cluster);
  }
  await ddlSubtests(t, group);
}

async function goldenGroup(t, group) {
  for (const layout of LAYOUTS) {
    await goldenSubtests(t, group, layout, await clusterFor(layout));
  }
  await ddlSubtests(t, group);
}

test(`${GROUP.DIFFERENTIAL}: the seeded families, the golden divergences and grammar ` +
  'parity hold against single-database SQLite at 1, 2, 3 and 5 partitions', async (t) => {
  await seededGroup(t, GROUP.DIFFERENTIAL);
  const cluster = await clusterFor(LAYOUTS[0]);
  const gaps = grammarParityGaps(admittedGrammar(cluster.engine.queryExecutor, cluster.oracle),
    corpora().flatMap((corpus) => corpus.cases));
  record(GROUP.DIFFERENTIAL, {scope: 'grammar parity', caseId: 'grammar-parity',
    equal: gaps.length === 0, reasons: gaps});
  await t.test('grammar parity: every construct the front end admits is generated', () =>
    assert.deepEqual(gaps, [], 'admitted constructs without a generated production'));
});

test(`${GROUP.WITNESSES}: TRIM with a character set, an explicit CAST and CASE ` +
  'truth equal SQLite in projection, HAVING and residual JOIN at every layout', async (t) => {
  await goldenGroup(t, GROUP.WITNESSES);
});

test(`${GROUP.PUSHDOWN}: LIMIT, OFFSET, DISTINCT, conjunct, COLLATE and naming ` +
  'pushdown cases equal SQLite at every layout', async (t) => {
  await goldenGroup(t, GROUP.PUSHDOWN);
});

test(`${GROUP.ORDER_DEPENDENT}: overflow, compensated REAL sums and storage-class ` +
  'ties equal SQLite exactly in canonical layout at every layout', async (t) => {
  await goldenGroup(t, GROUP.ORDER_DEPENDENT);
});

test(`${GROUP.DECLARED}: statements over declared column types equal SQLite over ` +
  'the DDL as declared at every layout', async (t) => {
  await seededGroup(t, GROUP.DECLARED);
});

function roundTripVerdict(cluster, testCase, context) {
  const verdict = statementRoundTrip({database: cluster.references[referenceOf(testCase)],
    renderer: cluster.engine.queryExecutor, testCase});
  return record(GROUP.ROUND_TRIP, {...context, caseId: testCase.id, sql: testCase.sql,
    params: testCase.params, layout: 'single database',
    delivered: verdict.rendered === null ? [] :
      [{replicaId: 'render(parse(Q))', sql: verdict.rendered, params: testCase.params}],
    ...verdict});
}

test(`${GROUP.ROUND_TRIP}: render(parse(Q)) equals Q on one SQLite database and the ` +
  'catalog creates every declared column as declared', async (t) => {
  const cluster = await clusterFor(LAYOUTS[0]);
  const verdicts = [];
  for (const corpus of corpora()) {
    cluster.load(corpus.rows);
    for (const testCase of corpus.cases) {
      verdicts.push(roundTripVerdict(cluster, testCase,
        {scope: testCase.family, seed: corpus.seed}));
    }
  }
  for (const family of Object.values(FAMILY)) {
    await t.test(`statements: ${family}`, () =>
      assertNoDivergence(verdicts.filter((verdict) => verdict.scope === family)));
  }
  for (const golden of GOLDEN_CASES.filter((entry) => typeof entry.statement === 'string')) {
    cluster.load(fixtureRows(golden.rows));
    const verdict = roundTripVerdict(cluster, goldenTestCase(golden),
      {scope: `golden ${golden.id}`});
    await t.test(`golden statement: ${golden.id}`, () => assertNoDivergence([verdict]));
  }
  await ddlSubtests(t, GROUP.ROUND_TRIP);
});

function wireVerdict(context, expected, answer, error) {
  const actual = error ?
    {kind: 'error', error: {source: 'lagrange', code: String(error.code ?? 'THROWN')},
      detail: String(error.message)} :
    answer?.success === true ?
      {kind: 'rows', columns: answer.rows.length > 0 ? Object.keys(answer.rows[0]) : null,
        rows: CURRENT_WIRE.observeAnswerRows(answer, ['v'])} :
      {kind: 'error', error: {source: 'lagrange', code: String(answer?.errorCode)},
        detail: String(answer?.error)};
  const verdict = compareOutcomes(expected, actual, {ordered: true}, 'across the wire');
  return record(GROUP.TYPED_WIRE, {...context, layout: 1, expected, actual, delivered: [],
    ...verdict});
}

async function partitionAnswer(replica, sql, params, mode) {
  try {
    return {answer: await deliverToPartition({service: replica.service, sourceNodeId: NODE_ID,
      targetAddress: replica.address, payload: {type: 'QUERY', sql, params},
      remote: mode === DELIVERY.REMOTE})};
  } catch (error) {
    return {error};
  }
}

async function nonCanonicalCellSubtest(t, cluster) {
  cluster.load(fixtureRows({t: [{id: 10, x: 'kept'}]}));
  cluster.answerTransform = CURRENT_WIRE.corruptFirstCell;
  let result;
  try {
    result = await cluster.engine.executeQuery('SELECT x AS c0 FROM t WHERE id = 10', []);
  } finally {
    cluster.answerTransform = null;
  }
  const refused = result?.success === false && typeof result.errorCode === 'string';
  record(GROUP.TYPED_WIRE, {scope: 'non-canonical cell', caseId: 'non-canonical-answer-cell',
    equal: refused, reasons: refused ? [] :
      [`a non-canonical answer cell was presented: ${JSON.stringify(result?.rows)}`]});
  await t.test('a non-canonical answer cell is a typed refusal, never a presented value', () =>
    assert.ok(refused, 'the coordinator presented a partition answer cell that is not a ' +
      `canonical value of the wire: ${JSON.stringify(result?.rows)}`));
}

test(`${GROUP.TYPED_WIRE}: every storage class crosses the query wire, local and ` +
  'remote, as the class and value SQLite produced', async (t) => {
  const cluster = await clusterFor(LAYOUTS[0]);
  const replica = cluster.replicasByTable.t[0];
  for (const mode of Object.values(DELIVERY)) {
    for (const witness of ROW_VALUE_WITNESSES) {
      const sql = `SELECT ${witness.expression} AS v`;
      const {answer, error} = await partitionAnswer(replica, sql, [], mode);
      const verdict = wireVerdict({scope: `rows ${mode}`, caseId: `row:${witness.id}`, mode,
        sql, params: []}, runOracle(cluster.oracle, sql, []), answer, error);
      await t.test(`${mode} answer cell: ${witness.id}`, () => assertNoDivergence([verdict]));
    }
    for (const witness of PARAMETER_WITNESSES) {
      const sql = 'SELECT ? AS v';
      const {answer, error} = await partitionAnswer(replica, sql, [witness.value], mode);
      const verdict = wireVerdict({scope: `params ${mode}`, caseId: `param:${witness.id}`, mode,
        sql, params: [witness.value]}, runOracle(cluster.oracle, sql, [witness.value]),
      answer, error);
      await t.test(`${mode} parameter: ${witness.id}`, () => assertNoDivergence([verdict]));
    }
  }
  await nonCanonicalCellSubtest(t, cluster);
});
