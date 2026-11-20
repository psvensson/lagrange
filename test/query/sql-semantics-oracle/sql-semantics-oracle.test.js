/**
 * WP2 & WP7 SQL semantic witnesses and differential oracle tests:
 * - Distinction D1: SQL Boolean keyword (TRUE/FALSE) vs numeric integer literal
 *   (1/0) vs JavaScript Boolean parameter ([true]/[false] -> 1n/0n) vs
 *   double-quoted identifier ("c").
 * - Distinction D2: Original placeholder identity (node.index) vs emitted
 *   placeholder position across single-partition, multi-partition, cross-
 *   partition JOIN pushdown, DistributedQueryPlanner fragments, write SQL
 *   rendering, and PostgreSQL $N positional parameter reordering.
 */

import assert from 'node:assert/strict';
import {after, test} from 'node:test';

import {PARSER_DIALECT} from '../../../src/query/pg/pg-compat-constants.js';
import {openOracleCluster, runOracle} from './cluster.js';
import {compareOutcomes, describeDivergence} from './normalize.js';
import {fixtureRows} from './schema.js';

const TEST_LAYOUTS = Object.freeze([1, 3]);
const clusters = new Map();

async function getCluster(layout) {
  if (!clusters.has(layout)) {
    clusters.set(layout, await openOracleCluster({partitionCount: layout}));
  }
  return clusters.get(layout);
}

after(async () => {
  for (const cluster of clusters.values()) {
    await cluster.close();
  }
});

// Schema from test/query/sql-semantics-oracle/schema.js:
// t: (id INTEGER PRIMARY KEY, i INTEGER, r REAL, n NUMERIC, x TEXT, c TEXT COLLATE NOCASE, z TEXT COLLATE RTRIM, b BLOB, a BLOB)
// u: (k INTEGER PRIMARY KEY, tk TEXT COLLATE NOCASE, v BLOB)
const D1_FIXTURE = Object.freeze({
  t: [
    {id: 10, i: {int: '0'}, r: 0.0, n: {int: '0'}, x: 'zero', c: 'FALSE'},
    {id: 30, i: {int: '1'}, r: 1.0, n: {int: '1'}, x: 'one', c: 'TRUE'},
    {id: 50, i: {int: '2'}, r: 2.0, n: {int: '2'}, x: 'two', c: 'TRUE'},
    {id: 70, i: {int: '-5'}, r: -1.0, n: {int: '-5'}, x: 'neg', c: 'FALSE'},
  ],
  u: [
    {k: 10, tk: 'FALSE', v: {int: '0'}},
    {k: 30, tk: 'TRUE', v: {int: '1'}},
    {k: 50, tk: 'TRUE', v: {int: '2'}},
    {k: 70, tk: 'FALSE', v: {int: '5'}},
  ],
});

function normalizeOracleParams(params) {
  return params.map((param) =>
    (typeof param === 'boolean' ? (param ? 1n : 0n) : param));
}

test('WP2/WP7 differential oracle D1: SQL Boolean keyword vs numeric literal vs JS Boolean parameter across 1 and 3 partitions', async (t) => {
  const witnessCases = [
    {
      id: 'is-true-keyword',
      sql: 'SELECT id, i FROM t WHERE i IS TRUE ORDER BY id ASC',
      params: [],
      expectedIds: [30n, 50n, 70n],
    },
    {
      id: 'is-not-true-keyword',
      sql: 'SELECT id, i FROM t WHERE i IS NOT TRUE ORDER BY id ASC',
      params: [],
      expectedIds: [10n],
    },
    {
      id: 'is-false-keyword',
      sql: 'SELECT id, i FROM t WHERE i IS FALSE ORDER BY id ASC',
      params: [],
      expectedIds: [10n],
    },
    {
      id: 'is-numeric-one-literal',
      sql: 'SELECT id, i FROM t WHERE i IS 1 ORDER BY id ASC',
      params: [],
      expectedIds: [30n],
    },
    {
      id: 'is-js-boolean-true-param',
      sql: 'SELECT id, i FROM t WHERE i IS ? ORDER BY id ASC',
      params: [true],
      expectedIds: [30n],
    },
    {
      id: 'is-not-js-boolean-true-param',
      sql: 'SELECT id, i FROM t WHERE i IS NOT ? ORDER BY id ASC',
      params: [true],
      expectedIds: [10n, 50n, 70n],
    },
    {
      id: 'is-js-boolean-false-param',
      sql: 'SELECT id, i FROM t WHERE i IS ? ORDER BY id ASC',
      params: [false],
      expectedIds: [10n],
    },
    {
      id: 'quoted-identifier-vs-boolean-param',
      sql: 'SELECT "id", "i" FROM "t" WHERE "i" IS ? AND "c" = ? ORDER BY "id" ASC',
      params: [true, 'TRUE'],
      expectedIds: [30n],
    },
  ];

  for (const layout of TEST_LAYOUTS) {
    const cluster = await getCluster(layout);
    cluster.load(fixtureRows(D1_FIXTURE));
    for (const testCase of witnessCases) {
      await t.test(`layout ${layout}: ${testCase.id}`, async () => {
        const {actual, delivered} = await cluster.run(
          testCase.sql,
          testCase.params,
        );
        const expected = runOracle(
          cluster.oracle,
          testCase.sql,
          normalizeOracleParams(testCase.params),
        );
        const verdict = compareOutcomes(expected, actual, {ordered: true});
        assert.ok(
          verdict.equal,
          describeDivergence({
            scope: 'D1',
            caseId: testCase.id,
            layout,
            sql: testCase.sql,
            params: testCase.params,
            delivered,
            expected,
            actual,
            reasons: verdict.reasons,
          }),
        );
        const actualIds = actual.rows.map((r) => BigInt(r[0].v));
        assert.deepEqual(actualIds, testCase.expectedIds);
      });
    }
  }
});

test('WP2/WP7 differential oracle D2: multi-parameter JOIN pushdown, emitted placeholder ordering, and PG $N reordering across layouts', async (t) => {
  for (const layout of TEST_LAYOUTS) {
    const cluster = await getCluster(layout);
    cluster.load(fixtureRows(D1_FIXTURE));

    await t.test(`layout ${layout}: JOIN pushdown slices main and edge parameters in emitted order`, async () => {
      const sql =
        'SELECT t.id AS tid, u.k AS uk ' +
        'FROM t INNER JOIN u ON t.id = u.k ' +
        'WHERE t.i BETWEEN ? AND ? AND u.v BETWEEN ? AND ? ' +
        'ORDER BY t.id ASC, u.k ASC';
      const params = [1n, 2n, 1n, 3n];
      const {expected, actual, delivered} = await cluster.run(sql, params);
      const verdict = compareOutcomes(expected, actual, {ordered: true});
      assert.ok(
        verdict.equal,
        describeDivergence({
          scope: 'D2-join',
          caseId: 'join-between-params',
          layout,
          sql,
          params,
          delivered,
          expected,
          actual,
          reasons: verdict.reasons,
        }),
      );
      assert.equal(actual.rows.length, 2);
      for (const msg of delivered) {
        if (msg.replicaId.startsWith('t-')) {
          assert.deepEqual(msg.params, [1, 2]);
        } else if (msg.replicaId.startsWith('u-')) {
          assert.deepEqual(msg.params.slice(0, 2), [1, 3]);
        }
      }
    });

    await t.test(`layout ${layout}: PostgreSQL $N non-sequential parameters preserve identity across parseCache hits`, async () => {
      const pgSql =
        'SELECT id, x FROM t ' +
        'WHERE i = $2 AND x = $1 ' +
        'ORDER BY id ASC';
      const pgParams = ['one', 1n];

      // Run twice to cover both parseCache miss and parseCache hit
      const res1 = await cluster.engine.executeQuery(pgSql, pgParams, {
        dialect: PARSER_DIALECT.POSTGRESQL,
      });
      const res2 = await cluster.engine.executeQuery(pgSql, pgParams, {
        dialect: PARSER_DIALECT.POSTGRESQL,
      });
      assert.equal(res1.success, true, res1.error);
      assert.equal(res2.success, true, res2.error);
      assert.deepEqual(res1.rows, [{id: 30, x: 'one'}]);
      assert.deepEqual(res2.rows, [{id: 30, x: 'one'}]);
    });

    await t.test(`layout ${layout}: aggregate-local ORDER BY binds argument parameters before ORDER BY parameters (SUM, SUM DISTINCT, GROUP_CONCAT)`, async () => {
      const orderedAggCases = [
        {
          id: 'sum-param-order-by-param',
          sql: 'SELECT SUM(? ORDER BY id + ?) AS total FROM t',
          params: [2n, 100n],
          expectedFirstCell: '8',
        },
        {
          id: 'sum-distinct-param-order-by-param',
          sql: 'SELECT SUM(DISTINCT ? ORDER BY id + ?) AS total FROM t',
          params: [2n, 100n],
          expectedFirstCell: '2',
        },
        {
          id: 'group-concat-single-arg-order-by-param',
          sql: 'SELECT GROUP_CONCAT(? ORDER BY id + ?) AS joined FROM t',
          params: ['v', 100n],
          expectedFirstCell: 'v,v,v,v',
        },
        {
          id: 'group-concat-multi-arg-order-by-param',
          sql: 'SELECT GROUP_CONCAT(x || ?, ? ORDER BY id + ?) AS joined FROM t',
          params: ['!', '|', 100n],
          expectedFirstCell: 'zero!|one!|two!|neg!',
        },
        {
          id: 'group-concat-distinct-arg-order-by-param',
          sql: 'SELECT GROUP_CONCAT(DISTINCT c || ? ORDER BY id + ?) AS joined FROM t',
          params: ['?', 100n],
          expectedFirstCell: 'FALSE?,TRUE?',
        },
      ];

      for (const aggCase of orderedAggCases) {
        const {expected, actual, delivered} = await cluster.run(
          aggCase.sql,
          aggCase.params,
        );
        const verdict = compareOutcomes(expected, actual, {ordered: true});
        assert.ok(
          verdict.equal,
          describeDivergence({
            scope: 'D2-agg-order-by',
            caseId: aggCase.id,
            layout,
            sql: aggCase.sql,
            params: aggCase.params,
            delivered,
            expected,
            actual,
            reasons: verdict.reasons,
          }),
        );
        assert.equal(actual.rows[0][0].v, aggCase.expectedFirstCell);
      }
    });
  }
});
