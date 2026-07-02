import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import {AdminWsClient} from '../../scripts/examples/admin-ws-client.js';
import {CREATE_RATINGS_SQL, RATINGS_FILE} from './shared.js';

const DEFAULT_TARGET = 'ws://127.0.0.1:8081/api/admin/stream';
const BATCH_SIZE = 500;

async function ensureRatingsFile() {
  try {
    await stat(RATINGS_FILE);
  } catch {
    throw new Error(
      `Ratings file not found at ${RATINGS_FILE}. ` +
      'Run download-movielens.js first.',
    );
  }
}

async function loadRatingsIntoLagrange({target = DEFAULT_TARGET} = {}) {
  await ensureRatingsFile();
  const client = new AdminWsClient({target});

  try {
    await client.query('DROP TABLE IF EXISTS ratings');
  } catch {
    // DROP TABLE is not supported by the admin SQL surface; demo clusters
    // start from fresh data directories, so there is no table to drop.
  }
  await client.query(CREATE_RATINGS_SQL);

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
    batch.push([
      Number(userId),
      Number(movieId),
      Number(rating),
      Number(ts),
    ]);
    total += 1;

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

async function flushBatch(client, rows) {
  const values = rows
    .map((row) => `(${row[0]}, ${row[1]}, ${row[2]}, ${row[3]})`)
    .join(',');
  const sql =
    'INSERT INTO ratings (user_id, movie_id, rating, rating_ts) VALUES ' + values;
  await client.query(sql);
}

export {loadRatingsIntoLagrange, DEFAULT_TARGET};
