/**
 * Native SQLite is the expected-value oracle for the shared scalar functions.
 * These cases cover values already represented in coordinator rows. They do
 * not claim that JS numbers preserve SQLite INTEGER/REAL storage-class tags.
 * The global-merge suite proves that both real coordinator consumers use them.
 */

import Database from 'better-sqlite3';
import {test} from '../../src/test-helpers/tap.js';
import {sqlLength, sqlSubstr, sqlRound} from '../../src/query/sql-scalar-functions.js';

test('SQL LENGTH matches SQLite for text codepoints, NUL, BLOB and NULL', (t) => {
  const db = new Database(':memory:');
  t.teardown(() => db.close());
  const oracle = db.prepare('SELECT LENGTH(?) AS value');
  for (const value of [
    'abc', '😀', 'a😀b', 'e\u0301', 'a\u0000😀', '', null,
    Buffer.from([0, 65, 255, 66]), Buffer.alloc(0),
  ]) {
    t.same(sqlLength(value), oracle.get(value).value, `LENGTH(${String(value)})`);
  }
  t.end();
});

test('SQL SUBSTR matches SQLite for signed and omitted bounds', (t) => {
  const db = new Database(':memory:');
  t.teardown(() => db.close());
  const wideMagnitude = '9'.repeat(128);
  const leadingZeroes = '0'.repeat(128);
  const cases = [
    ['abc', 3, -2], ['abc', 1, 2], ['abc', 0, 2], ['abc', 0, -2],
    ['abc', 0, 0], ['abc', -1, 1], ['abc', -2, -1], ['abc', -5, 4],
    ['abc', -5, -2], ['abc', 5, -3], ['abc', 2], ['abc', 0], ['abc', -5],
    ['abc', 1, 0], ['abc', 1.9, 2.9], ['abc', '2tail', '1e2'],
    ['abc', 2_147_483_648, 2], ['abc', 1, 2_147_483_648],
    ['abc', '-9223372036854775808', '9223372036854775807'],
    ['abc', '-9223372036854775807', '9223372036854775807'],
    ['abc', '-9223372036854775808', '9223372036854775806'],
    ['abc', '-9223372036854775808', '9223372036854775805'],
    ['abc', '9223372036854775807', '-9223372036854775808'],
    ['abc', '-9223372036854775809', '9223372036854775808'],
    ['abc', `-${wideMagnitude}`, wideMagnitude],
    ['abc', `${leadingZeroes}3`, 1], ['abc', `-${leadingZeroes}5`, 4],
    ['a😀b', 2, 1], ['a😀b', -1, -1], ['e\u0301z', 2, 1],
    ['a\u0000😀', 1, 9], ['', 1, 1], [null, 1, 1], ['abc', null, 1],
    ['abc', 1, null], [Buffer.from([0, 65, 255, 66]), 3, -2],
    [Buffer.from([0, 65, 255, 66]), -2], [Buffer.alloc(0), 1, 1],
    [Buffer.from([0, 65]), 1, 0], [Buffer.from([0, 65]), 3, 1],
    [Buffer.from([0, 65]), 1, -1],
    [Buffer.from([0, 65, 255]), '-9223372036854775808', '9223372036854775807'],
  ];
  for (const args of cases) {
    const placeholders = args.map(() => '?').join(', ');
    const expected = db.prepare(`SELECT SUBSTR(${placeholders}) AS value`).get(...args);
    t.same(sqlSubstr(...args), expected.value, `SUBSTR(${args.map(String).join(', ')})`);
  }
  t.end();
});

test('SQL scalar functions preserve represented boolean truth values', (t) => {
  const db = new Database(':memory:');
  t.teardown(() => db.close());
  // Bindings do not admit JS booleans in better-sqlite3. SQL literals are the
  // native oracle for values produced by the parser and HAVING comparisons.
  const cases = [
    ['ROUND(TRUE)', sqlRound, [true]],
    ['ROUND(FALSE)', sqlRound, [false]],
    ['ROUND(1.25, TRUE)', sqlRound, [1.25, true]],
    ['ROUND(1.25, FALSE)', sqlRound, [1.25, false]],
    ['SUBSTR(\'abc\', TRUE, TRUE)', sqlSubstr, ['abc', true, true]],
    ['SUBSTR(\'abc\', FALSE, 2)', sqlSubstr, ['abc', false, 2]],
    ['SUBSTR(\'abc\', 1, FALSE)', sqlSubstr, ['abc', 1, false]],
    ['SUBSTR(TRUE, 1, 1)', sqlSubstr, [true, 1, 1]],
    ['SUBSTR(FALSE, 1, 1)', sqlSubstr, [false, 1, 1]],
    ['LENGTH(TRUE)', sqlLength, [true]],
    ['LENGTH(FALSE)', sqlLength, [false]],
  ];
  for (const [expression, evaluate, args] of cases) {
    const expected = db.prepare(`SELECT ${expression} AS value`).get();
    t.same(evaluate(...args), expected.value, expression);
  }
  t.end();
});

test('SQL ROUND matches SQLite at negative halves and precision boundaries', (t) => {
  const db = new Database(':memory:');
  t.teardown(() => db.close());
  const cases = [
    [-1.5, 0], [1.5, 0], [-1.5], [1.5], [-1.25, 1], [1.25, 1],
    [-1.5, -2], [1.5, -2], [0.15, 1], [-0.15, 1], [1.005, 2],
    [4.445, 2], [12.7 * 0.35, 2], [0.49999999999999994, 0],
    [-0.49999999999999994, 0], [-0.1, 0], [-0.0001, 2],
    [1.23456789012345, 30], [1.23456789012345, 31],
    [1.2345, 2_147_483_648], [4_503_599_627_370_497, 2],
    [1.2345, '9223372036854775807'], [-1.5, '-9223372036854775808'],
    [' -1.5tail', 0], ['not numeric', 2], ['0x10', 0], [1.25, '1e2'],
    [null, 1], [1.5, null],
  ];
  for (const args of cases) {
    const placeholders = args.map(() => '?').join(', ');
    const expected = db.prepare(`SELECT ROUND(${placeholders}) AS value`).get(...args);
    t.same(sqlRound(...args), expected.value, `ROUND(${args.map(String).join(', ')})`);
  }
  t.end();
});
