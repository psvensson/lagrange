import {openOracleCluster} from './test/query/sql-semantics-oracle/cluster.js';
import {compareOutcomes} from './test/query/sql-semantics-oracle/normalize.js';
const cases = [
  ["SELECT SUM(i) AS s FROM t HAVING concat(SUM(i), '') = '3'", {t:[{id:10,i:1},{id:90,i:2}]}],
  ["SELECT c, COUNT(*) AS n FROM t GROUP BY c", {t:[{id:10,c:'A'},{id:90,c:'a'}]}],
  ["SELECT c COLLATE BINARY, COUNT(*) AS n FROM t GROUP BY c", {t:[{id:10,c:'A'},{id:90,c:'a'}]}],
  ["SELECT DISTINCT c FROM t", {t:[{id:10,c:'A'},{id:90,c:'a'}]}],
  ["SELECT MIN(c) AS m FROM t", {t:[{id:10,c:'b'},{id:90,c:'A'}]}],
  ["SELECT id FROM t ORDER BY c", {t:[{id:10,c:'b'},{id:90,c:'A'}]}],
  ["SELECT id, upper(c) AS u FROM t ORDER BY u", {t:[{id:10,c:'b'},{id:90,c:'A'}]}],
  ["SELECT COUNT(*) AS n FROM t HAVING printf('%d', COUNT(*)) = '2'", {t:[{id:10},{id:90}]}],
  ["SELECT x, COUNT(*) AS n FROM t GROUP BY x HAVING instr(x, 'b') > 0", {t:[{id:10,x:'ab'},{id:90,x:'ab'}]}],
  ["SELECT SUM(i) || '' AS s FROM t", {t:[{id:10,i:1},{id:90,i:2}]}],
  ["SELECT concat(SUM(i), 'x') AS s FROM t", {t:[{id:10,i:1},{id:90,i:2}]}],
  ["SELECT id FROM t ORDER BY concat(x, 'z')", {t:[{id:10,x:'b'},{id:90,x:'a'}]}],
  ["SELECT x, COUNT(*) FROM t GROUP BY x ORDER BY hex(x)", {t:[{id:10,x:'b'},{id:90,x:'a'}]}],
  ["SELECT z, COUNT(*) AS n FROM t GROUP BY z", {t:[{id:10,z:'a '},{id:90,z:'a'}]}],
  ["SELECT MAX(z) AS m FROM t", {t:[{id:10,z:'a '},{id:90,z:'a'}]}],
];
for (const layout of [1,2]) {
  const cl = await openOracleCluster({partitionCount: layout});
  for (const [sql, rows] of cases) {
    cl.load(rows);
    const {expected, actual} = await cl.run(sql, []);
    const v = compareOutcomes(expected, actual, {ordered: /ORDER BY/.test(sql)});
    console.log(layout, v.equal ? 'EQUAL' : (v.classOnly ? 'CLASSONLY' : 'DIVERGE'), sql, '\n   exp', JSON.stringify(expected.rows ?? expected.error), '\n   act', JSON.stringify(actual.rows ?? actual.error));
  }
  await cl.close();
}
