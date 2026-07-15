import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import {AdminWsClient} from '../../scripts/examples/admin-ws-client.js';
import {runRetryableControlPlaneWrite} from
  '../../src/bootstrap/shared/retryable-control-plane-write.js';
import {
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
} from '../../src/control-plane/owner-contract-outcome.js';
import {RATINGS_FILE} from './movie-ranking.js';

const DEFAULT_TARGET = 'ws://127.0.0.1:8081/api/admin/stream';
const BATCH_SIZE = 500;
const RATINGS_SPLIT_STORAGE_THRESHOLD_BYTES = 1048576;
const RATINGS_TABLE_SPLIT_POLICY = Object.freeze({
  splitStorageThreshold: RATINGS_SPLIT_STORAGE_THRESHOLD_BYTES,
});
const RATINGS_SCHEMA_CREATE_DECISION = Object.freeze({
  READY: 'ready',
  RETRY: 'retry',
  STOP: 'stop',
});
const RATINGS_SCHEMA_CREATE_TRANSITION = Object.freeze({
  [OWNER_CONTRACT_STATE.READY]: Object.freeze({
    [OWNER_CONTRACT_NEXT_ACTION.PROCEED]:
      RATINGS_SCHEMA_CREATE_DECISION.READY,
  }),
  [OWNER_CONTRACT_STATE.PENDING]: Object.freeze({
    [OWNER_CONTRACT_NEXT_ACTION.RETRY]:
      RATINGS_SCHEMA_CREATE_DECISION.RETRY,
    [OWNER_CONTRACT_NEXT_ACTION.WAIT]: RATINGS_SCHEMA_CREATE_DECISION.RETRY,
  }),
  [OWNER_CONTRACT_STATE.DEFERRED]: Object.freeze({
    [OWNER_CONTRACT_NEXT_ACTION.RETRY]:
      RATINGS_SCHEMA_CREATE_DECISION.RETRY,
    [OWNER_CONTRACT_NEXT_ACTION.WAIT]: RATINGS_SCHEMA_CREATE_DECISION.RETRY,
  }),
});
// Cold five-node formation may finish the three physical replicas shortly
// before their new leader becomes routable. CREATE IF NOT EXISTS is
// idempotent, so fresh admin sessions keep observing the same provisioning
// job without widening any server-side timeout or admission budget.
const CREATE_TABLE_RETRY_TIMEOUT_MS = 60000;
const CREATE_TABLE_RETRY_DELAY_MS = 5000;
const CREATE_TABLE_STABLE_CONFIRMATION_COUNT = 2;
const RATINGS_FIELD_DELIMITER = '\t';
const RATINGS_FILE_MISSING_GUIDANCE =
  'Run examples/service-data-affinity/download-movielens.js first.';
const RATINGS_SCHEMA_CONFIRMATION_ERROR =
  'ratings schema did not reach stable durable confirmation';
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
  ) WITH (split_storage_threshold = 1048576);
`;

async function ensureRatingsFile() {
  try {
    await stat(RATINGS_FILE);
  } catch {
    throw new Error(
      `Ratings file not found at ${RATINGS_FILE}. ` +
      RATINGS_FILE_MISSING_GUIDANCE,
    );
  }
}

function resolveRatingsSchemaRetryAfterMs(result) {
  return Number.isFinite(result?.retryAfterMs) && result.retryAfterMs > 0 ?
    Math.floor(result.retryAfterMs) :
    CREATE_TABLE_RETRY_DELAY_MS;
}

function resolveRatingsSchemaCreateOutcome(result) {
  const decision = RATINGS_SCHEMA_CREATE_TRANSITION[result?.contractState]?.[
    result?.nextAction
  ] || RATINGS_SCHEMA_CREATE_DECISION.STOP;
  switch (decision) {
  case RATINGS_SCHEMA_CREATE_DECISION.READY:
    return {ready: true, retryAfterMs: 0};
  case RATINGS_SCHEMA_CREATE_DECISION.RETRY:
    return {
      ready: false,
      retryAfterMs: resolveRatingsSchemaRetryAfterMs(result),
    };
  default:
    throw new Error(result?.error || RATINGS_SCHEMA_CONFIRMATION_ERROR);
  }
}

async function createRatingsTableWithRetry(options = {}) {
  const target = options.target || DEFAULT_TARGET;
  const clientFactory = options.clientFactory ||
    ((clientTarget) => new AdminWsClient({target: clientTarget}));
  const timeoutMs = Number.isFinite(options.timeoutMs) ?
    options.timeoutMs : CREATE_TABLE_RETRY_TIMEOUT_MS;
  const onRetry = options.onRetry || (({attempt, resultOrError}) => {
    console.log(
      `      Ratings schema attempt ${attempt} is not yet stable: ` +
      `${resultOrError?.message || 'awaiting durable replay'}; retrying...`);
  });
  let attempts = 0;
  let stableConfirmationCount = 0;

  const result = await runRetryableControlPlaneWrite(async () => {
    attempts += 1;
    const client = clientFactory(target);
    try {
      const createResult = await client.query(CREATE_LAGRANGE_RATINGS_SQL);
      const createOutcome = resolveRatingsSchemaCreateOutcome(createResult);
      if (!createOutcome.ready) {
        stableConfirmationCount = 0;
        return {
          success: false,
          deferRetry: true,
          retryAfterMs: createOutcome.retryAfterMs,
        };
      }
      stableConfirmationCount += 1;
    } catch (error) {
      stableConfirmationCount = 0;
      throw error;
    } finally {
      await client.close();
    }

    if (stableConfirmationCount < CREATE_TABLE_STABLE_CONFIRMATION_COUNT) {
      return {
        success: false,
        deferRetry: true,
        retryAfterMs: CREATE_TABLE_RETRY_DELAY_MS,
      };
    }
    return {success: true};
  }, {
    timeoutMs,
    baseDelayMs: CREATE_TABLE_RETRY_DELAY_MS,
    maxDelayMs: CREATE_TABLE_RETRY_DELAY_MS,
    ...(typeof options.now === 'function' ? {now: options.now} : {}),
    ...(typeof options.sleep === 'function' ? {sleep: options.sleep} : {}),
    onRetry,
  });

  if (result?.success !== true) {
    throw new Error(RATINGS_SCHEMA_CONFIRMATION_ERROR);
  }
  return {
    attempts,
    confirmations: stableConfirmationCount,
    policy: RATINGS_TABLE_SPLIT_POLICY,
  };
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
    const [userId, movieId, rating, ts] = line.split(
      RATINGS_FIELD_DELIMITER,
    );
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

// A 100k-row load is ~200 batches against a cluster that may still be
// settling (control-plane replica creates, leadership moves). The query owner
// owns participant/leader retry; the example sends each logical batch once so
// it cannot introduce a second retry boundary above that owner.
async function flushBatch(client, rows) {
  const values = rows
    .map((row) =>
      `(${row[0]}, ${row[1]}, ${row[2]}, ${row[3]}, ${row[4]})`)
    .join(',');
  const sql =
    'INSERT INTO ratings ' +
    '(rating_id, user_id, movie_id, rating, rating_ts) VALUES ' + values;
  await client.query(sql);
}

export {
  CREATE_LAGRANGE_RATINGS_SQL,
  RATINGS_TABLE_SPLIT_POLICY,
  createRatingsTableWithRetry,
  loadRatingsIntoLagrange,
  DEFAULT_TARGET,
};
