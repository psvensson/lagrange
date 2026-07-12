// Tier-1 live SQL correctness check (validation epic, quests 1+3).
// Starts a real local-process cluster, creates two tables, inserts a
// known dataset through the live SQL path, runs the aggregate/GROUP BY/
// HAVING/LIMIT-OFFSET/JOIN query set live, and diffs every result set
// against a single-DB better-sqlite3 oracle fed the same statements.
import Database from '/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/node_modules/better-sqlite3/lib/index.js';
import {
  startCluster,
} from '/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/examples/service-data-affinity/cluster-harness.js';
import {AdminWsClient} from '/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/scripts/examples/admin-ws-client.js';

async function liveQuery(target, sql) {
  const client = new AdminWsClient({target});
  try {
    const result = await client.query(sql);
    return result?.results || result?.rows || [];
  } finally {
    await client.close();
  }
}

const TARGET = 'ws://127.0.0.1:8081/api/admin/stream';

// The admin WS client rejects its timeout promise even after the awaited
// call settles; a late rejection must not kill the whole check.
process.on('unhandledRejection', (reason) => {
  console.log(`  (late rejection swallowed: ${reason?.message || reason})`);
});
process.on('uncaughtException', (error) => {
  console.log(`  (uncaught exception swallowed: ${error?.message || error})`);
});
const NODE_COUNT = 3;
const READY_POLL_MS = 5000;
const READY_TIMEOUT_MS = 480000;

const DDL = [
  'CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT, age INTEGER, dept TEXT)',
  'CREATE TABLE IF NOT EXISTS orders (order_id INTEGER PRIMARY KEY, user_id INTEGER, amount INTEGER, status TEXT)',
];

const USERS = [];
for (let i = 1; i <= 20; i += 1) {
  USERS.push([i, `user${i}`, 20 + (i % 7) * 5, i % 2 === 0 ? 'a' : 'b']);
}
const ORDERS = [];
for (let i = 1; i <= 30; i += 1) {
  ORDERS.push([
    100 + i,
    ((i * 7) % 20) + 1,
    i * 3,
    i % 5 === 0 ? 'void' : 'paid',
  ]);
}

const QUERIES = [
  'SELECT COUNT(*) FROM users',
  'SELECT COUNT(*) AS cnt, SUM(age) AS total_age, AVG(age) AS avg_age, MIN(age) AS min_age, MAX(age) AS max_age FROM users',
  'SELECT COUNT(DISTINCT dept) AS depts FROM users',
  'SELECT dept, COUNT(*) AS cnt, SUM(age) AS total FROM users GROUP BY dept ORDER BY dept',
  'SELECT age % 2 AS parity, COUNT(*) AS cnt FROM users GROUP BY age % 2 ORDER BY parity',
  'SELECT dept, SUM(age) AS total FROM users GROUP BY dept HAVING SUM(age) > 100 ORDER BY dept',
  'SELECT id, name FROM users ORDER BY id LIMIT 5 OFFSET 7',
  'SELECT SUM(amount) + COUNT(*) AS x FROM orders',
  'SELECT status, COUNT(*) AS cnt FROM orders GROUP BY status ORDER BY status',
  'SELECT u.name, o.amount FROM users AS u JOIN orders AS o ON u.id = o.user_id WHERE o.status = \'paid\' AND u.age > 30 ORDER BY o.order_id LIMIT 10',
  'SELECT u.dept, SUM(o.amount) AS dept_total FROM users AS u JOIN orders AS o ON u.id = o.user_id GROUP BY u.dept ORDER BY u.dept',
  'SELECT u.id, u.name, o.order_id FROM users AS u LEFT JOIN orders AS o ON u.id = o.user_id WHERE o.status = \'void\' ORDER BY u.id, o.order_id',
  'SELECT COUNT(*) AS with_orders FROM users AS u JOIN orders AS o ON u.id = o.user_id',
];

function sortRows(rows) {
  return rows
    .map((row) => {
      const out = {};
      for (const key of Object.keys(row).sort()) out[key] = row[key];
      return JSON.stringify(out);
    })
    .sort();
}

async function waitForTablesReady(target) {
  const start = Date.now();
  let lastErr = null;
  while (Date.now() - start < READY_TIMEOUT_MS) {
    try {
      const a = await liveQuery(target, 'SELECT COUNT(*) AS c FROM users');
      const b = await liveQuery(target, 'SELECT COUNT(*) AS c FROM orders');
      if (a.length === 1 && b.length === 1) return;
    } catch (err) {
      lastErr = err;
    }
    await new Promise((resolve) => setTimeout(resolve, READY_POLL_MS));
  }
  throw new Error(`tables never became queryable: ${lastErr}`);
}

async function retryingQuery(target, sql, attempts = 5) {
  let lastErr = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await liveQuery(target, sql);
    } catch (err) {
      lastErr = err;
      console.log(`  attempt ${i + 1}/${attempts} failed: ${err?.message || err}`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
  throw lastErr;
}

const oracle = new Database(':memory:');
for (const ddl of DDL) oracle.exec(ddl);
const insertUser = oracle.prepare('INSERT INTO users VALUES (?, ?, ?, ?)');
for (const row of USERS) insertUser.run(...row);
const insertOrder = oracle.prepare('INSERT INTO orders VALUES (?, ?, ?, ?)');
for (const row of ORDERS) insertOrder.run(...row);

console.log('starting live cluster...');
const cluster = await startCluster({local: true, nodeCount: NODE_COUNT, target: TARGET});
console.log(`cluster up (formation ${cluster.clusterFormationMs}ms)`);
let failures = 0;
try {
  for (const ddl of DDL) {
    await retryingQuery(TARGET, ddl, 8);
  }
  console.log('tables created; waiting for queryability...');
  await waitForTablesReady(TARGET);

  for (const row of USERS) {
    await retryingQuery(
      TARGET,
      `INSERT OR REPLACE INTO users (id, name, age, dept) VALUES (${row[0]}, '${row[1]}', ${row[2]}, '${row[3]}')`,
    );
  }
  for (const row of ORDERS) {
    await retryingQuery(
      TARGET,
      `INSERT OR REPLACE INTO orders (order_id, user_id, amount, status) VALUES (${row[0]}, ${row[1]}, ${row[2]}, '${row[3]}')`,
    );
  }
  console.log('dataset loaded; running query set...');

  for (const sql of QUERIES) {
    const live = await retryingQuery(TARGET, sql);
    const expected = oracle.prepare(sql).all();
    const liveSorted = sortRows(live);
    const expectedSorted = sortRows(expected);
    const match = JSON.stringify(liveSorted) === JSON.stringify(expectedSorted);
    if (!match) failures += 1;
    console.log(`${match ? 'MATCH   ' : 'MISMATCH'} ${sql}`);
    if (!match) {
      console.log(`  live    : ${JSON.stringify(liveSorted)}`);
      console.log(`  expected: ${JSON.stringify(expectedSorted)}`);
    }
  }
} finally {
  if (cluster.stop) await cluster.stop();
}
console.log(failures === 0 ? 'ALL QUERIES MATCH ORACLE' : `${failures} MISMATCHES`);
process.exit(failures === 0 ? 0 : 1);
