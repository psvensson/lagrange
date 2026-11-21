import {openOracleCluster} from './test/query/sql-semantics-oracle/cluster.js';
import {compareOutcomes} from './test/query/sql-semantics-oracle/normalize.js';
const R = {t:[{id:10,i:5,x:'b',r:1.5},{id:30,i:1,x:'a',r:2.5},{id:50,i:3,x:'c'},{id:90,i:2,x:'a',r:0.5}]};
const cases = [
  "SELECT id FROM t ORDER BY x, id",
  "SELECT id FROM t ORDER BY i",
  "SELECT id, x FROM t ORDER BY 2, 1",
  "SELECT id, x FROM t ORDER BY upper(x), id",
  "SELECT id, i FROM t ORDER BY i % 3, id",
  "SELECT x, COUNT(*) AS n FROM t GROUP BY x ORDER BY COUNT(*) DESC, x",
  "SELECT x, SUM(i) AS s FROM t GROUP BY x ORDER BY SUM(i)",
  "SELECT x, MAX(i) AS m FROM t",
  "SELECT GROUP_CONCAT(x) AS g, COUNT(*) AS n FROM t",
  "SELECT TOTAL(i) AS s, COUNT(*) AS n FROM t",
  "SELECT COUNT(i) AS a, COUNT(DISTINCT x) AS b FROM t HAVING COUNT(DISTINCT x) = 3",
  "SELECT SUM(i+1) AS a, SUM(i*2) AS b FROM t HAVING SUM(i+1) = 15",
  "SELECT x, COUNT(*) AS n FROM t GROUP BY x HAVING x LIKE 'A%'",
  "SELECT x, COUNT(*) AS n FROM t GROUP BY x HAVING CAST(SUM(r) AS INTEGER) = 3",
  "SELECT DISTINCT x FROM t ORDER BY x",
  "SELECT x AS id FROM t ORDER BY id",
  "SELECT id FROM t ORDER BY t.x, id",
  "SELECT id, x FROM t ORDER BY x DESC LIMIT 2",
  "SELECT x, i FROM t WHERE i > 1 ORDER BY i DESC LIMIT 1",
];
for (const layout of [1,2,3]) {
  const cl = await openOracleCluster({partitionCount: layout});
  cl.load(R);
  for (const sql of cases) {
    const {expected, actual} = await cl.run(sql, []);
    const v = compareOutcomes(expected, actual, {ordered: /ORDER BY/.test(sql)});
    const tag = v.equal ? 'EQUAL' : (v.classOnly ? 'CLASSONLY' : (actual.kind==='error' ? 'REFUSED:'+actual.error.code : 'DIVERGE'));
    console.log(layout, tag, sql);
    if (tag==='DIVERGE') console.log('   exp', JSON.stringify(expected.rows ?? expected.error).slice(0,200), '\n   act', JSON.stringify(actual.rows ?? actual.error).slice(0,200));
  }
  await cl.close();
}
