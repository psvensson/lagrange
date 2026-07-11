import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import {AdminWsClient} from '../../scripts/examples/admin-ws-client.js';
import {RATINGS_FILE} from './movie-ranking.js';

const DEFAULT_TARGET = 'ws://127.0.0.1:8081/api/admin/stream';
const BATCH_SIZE = 500;
// Cold five-node formation may finish the three physical replicas shortly
// before their new leader becomes routable. CREATE IF NOT EXISTS is
// idempotent, so fresh admin sessions keep observing the same provisioning
// job without widening any server-side timeout or admission budget.
const CREATE_TABLE_MAX_ATTEMPTS = 12;
const CREATE_TABLE_RETRY_DELAY_MS = 5000;
// Managed splitting currently needs one partition-key column. The source
// dataset has a natural composite identity, so the loader assigns the stable
// input ordinal as rating_id while preserving every MovieLens field used by
// the PostgreSQL and Lagrange comparisons.
const CREATE_LAGRANGE_RATINGS_SQL = `
  CREATE TABLE IF NOT EXISTS ratings (
    rating_id INTEGER PRIMARY KEY,
    user_id INTEGER,
    movie_id INTEGER,
    rating INTEGER,
    rating_ts INTEGER
  );
`;

async function ensureRatingsFile() {
  try {
    await stat(RATINGS_FILE);
  } catch {
    throw new Error(
      `Ratings file not found at ${RATINGS_FILE}. ` +
      'Run examples/service-data-affinity/download-movielens.js first.',
    );
  }
}

async function createRatingsTableWithRetry(options = {}) {
  const target = options.target || DEFAULT_TARGET;
  const clientFactory = options.clientFactory ||
    ((clientTarget) => new AdminWsClient({target: clientTarget}));
  const wait = options.wait ||
    ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)));
  const maxAttempts = options.maxAttempts || CREATE_TABLE_MAX_ATTEMPTS;
  const onRetry = options.onRetry || (({attempt, error}) => {
    console.log(
      `      Ratings schema attempt ${attempt}/${maxAttempts} failed: ` +
      `${error?.message || String(error)}; retrying...`);
  });
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const client = clientFactory(target);
    try {
      await client.query(CREATE_LAGRANGE_RATINGS_SQL);
      return {attempts: attempt};
    } catch (error) {
      lastError = error;
    } finally {
      await client.close();
    }
    if (attempt < maxAttempts) {
      onRetry({attempt, maxAttempts, error: lastError});
      await wait(CREATE_TABLE_RETRY_DELAY_MS);
    }
  }
  throw lastError;
}

async function loadRatingsIntoLagrange({target = DEFAULT_TARGET} = {}) {
  await ensureRatingsFile();
  await createRatingsTableWithRetry({target});
  const client = new AdminWsClient({target});

  const rl = createInterface({
    input: createReadStream(RATINGS_FILE),
    crlfDelay: Infinity,
  });

  let total = 0;
  let batch = [];
  for await (const line of rl) {
    if (!line) {
      continue;
    }
    const [userId, movieId, rating, ts] = line.split('\t');
    total += 1;
    batch.push([
      total,
      Number(userId),
      Number(movieId),
      Number(rating),
      Number(ts),
    ]);

    if (batch.length >= BATCH_SIZE) {
      await flushBatch(client, batch);
      batch = [];
    }
  }

  if (batch.length > 0) {
    await flushBatch(client, batch);
  }

  await client.close();
  return total;
}

const FLUSH_MAX_ATTEMPTS = 4;
const FLUSH_RETRY_BASE_DELAY_MS = 500;

// A 100k-row load is ~200 batches against a cluster that may still be
// settling (control-plane replica creates, leadership moves) — a single
// transient participant failure/timeout should not abort the whole
// load. Batches use plain INSERTs with a composite primary key, so a
// retried batch that partially landed is idempotent at worst-case
// duplicate-key level for this dataset (one row per (user, movie)).
async function flushBatch(client, rows) {
  const values = rows
    .map((row) =>
      `(${row[0]}, ${row[1]}, ${row[2]}, ${row[3]}, ${row[4]})`)
    .join(',');
  const sql =
    'INSERT INTO ratings ' +
    '(rating_id, user_id, movie_id, rating, rating_ts) VALUES ' + values;
  let lastError = null;
  for (let attempt = 1; attempt <= FLUSH_MAX_ATTEMPTS; attempt += 1) {
    try {
      await client.query(sql);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < FLUSH_MAX_ATTEMPTS) {
        await new Promise((resolve) =>
          setTimeout(resolve, FLUSH_RETRY_BASE_DELAY_MS * attempt));
      }
    }
  }
  throw lastError;
}

export {
  CREATE_LAGRANGE_RATINGS_SQL,
  createRatingsTableWithRetry,
  loadRatingsIntoLagrange,
  DEFAULT_TARGET,
};
