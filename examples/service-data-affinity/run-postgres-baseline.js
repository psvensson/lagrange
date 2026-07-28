import {createHash, randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {DockerProvider} from '../../test/distributed/harness/docker-provider.js';
import {
  execShell,
  shellQuote,
  waitForPostgresReady,
} from '../../test/distributed/harness/pgbench-runner.js';
import {
  CREATE_RATINGS_SQL,
  RATINGS_FILE,
  RATINGS_TOP_QUALITY_SQL,
} from './movie-ranking.js';
import {
  MOVIELENS_PUBLIC_REQUEST_FAILURE_CAUSE_ROLE,
} from './movielens-public-request-evidence-schema.js';

const ZERO = 0;
const ONE = 1;
const ArrayConstructor = Array;
const arrayIsArray = Array.isArray;
const arrayJoin = Function.call.bind(Array.prototype.join);
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayPush = Function.call.bind(Array.prototype.push);
const jsonStringify = JSON.stringify;
const numberConstructor = Number;
const numberIsInteger = Number.isInteger;
const numberIsSafeInteger = Number.isSafeInteger;
const regExpTest = Function.call.bind(RegExp.prototype.test);
const stringConstructor = String;
const stringIncludes = Function.call.bind(String.prototype.includes);
const stringSplit = Function.call.bind(String.prototype.split);
const stringTrim = Function.call.bind(String.prototype.trim);
const DECIMAL_COUNTER = /^(?:0|[1-9][0-9]*)$/u;
const DEFAULT_BASELINE_IMAGE = 'postgres:16';
const DEFAULT_USER = 'benchmark';
const DEFAULT_PASSWORD = 'benchmark';
const DEFAULT_DATABASE = 'benchmark';
const DEFAULT_PORT = 5432;
const DEFAULT_REPLICATION_FACTOR = 3;
const DEFAULT_SYNC_REPLICA_ACKS = 1;
const DEFAULT_READY_TIMEOUT_MS = 120000;
const DEFAULT_READY_POLL_INTERVAL_MS = 500;
const DEFAULT_BATCH_SIZE = 1000;
const DEFAULT_NETWORK_PREFIX = 'movielens-pg-baseline';
const POSTGRES_ENV_USER_KEY = 'POSTGRES_USER';
const POSTGRES_ENV_PASSWORD_KEY = 'POSTGRES_PASSWORD';
const POSTGRES_ENV_DB_KEY = 'POSTGRES_DB';
const POSTGRES_ENV_AUTH_METHOD_KEY = 'POSTGRES_HOST_AUTH_METHOD';
const POSTGRES_ENV_AUTH_METHOD_VALUE = 'scram-sha-256';
const SHELL_COMMAND = 'sh';
const SHELL_LOGIN_ARG = '-lc';
const REPLICATION_STATE_STREAMING = 'streaming';
const REPLICATION_HBA_IPV4 = 'host replication all 0.0.0.0/0 scram-sha-256';
const REPLICATION_HBA_IPV6 = 'host replication all ::/0 scram-sha-256';
const BOOTSTRAP_DB_NAME = 'replication';
const POSTGRES_ENTRYPOINT_COMMAND = 'docker-entrypoint.sh postgres';
const POSTGRES_BINARY_PATH_EXPORT =
  'export PATH="$PATH:/usr/lib/postgresql/$PG_MAJOR/bin"';
const SYNCHRONOUS_COMMIT_ON = 'on';
const SHA256_ALGORITHM = 'sha256';
const SHA256_ENCODING = 'hex';
const BYTE_ENCODING = 'utf8';
const RATINGS_MAX_BYTES = 4 * 1_024 * 1_024;
const RATINGS_MAX_ROWS = 100_000;
const POSTGRES_VERSION_SQL = 'SELECT version()';
const POSTGRES_BASELINE_FAILURE_NAME = 'PostgresBaselineFailure';
const DROP_RATINGS_SQL = 'DROP TABLE IF EXISTS ratings;';
const BASELINE_POOL_MAX = 4;
const POSTGRES_TEXT = Object.freeze({
  BASELINE_FAILED: 'PostgreSQL MovieLens baseline failed',
  BASELINE_METRICS: 'Postgres baseline metrics:',
  BOUNDED_INPUT_REQUIRED: 'bounded MovieLens input bytes are required',
  CONFIGURE_PRIMARY: 'configure postgres primary replication',
  IMAGE_PROVENANCE_UNAVAILABLE:
    'immutable PostgreSQL image provenance is unavailable',
  INPUT_DIGEST_MISMATCH: 'PostgreSQL MovieLens input digest mismatch',
  LOCALHOST_IPV4: '127.0.0.1',
  NEWLINE: '\n',
  PSQL: 'psql',
  PSQL_ALIGN: '-A',
  PSQL_TUPLES_ONLY: '-t',
  PSQL_VARIABLE_STOP: '-v ON_ERROR_STOP=1',
  REPLICA_BASEBACKUP: '-D "$PGDATA" -Fp -Xs -P -R',
  REPLICA_BOOTSTRAP_DONE: 'fi',
  REPLICA_BOOTSTRAP_OPEN: 'if [ ! -s "$PGDATA/PG_VERSION" ]; then',
  REPLICA_BOOTSTRAP_REMOVE: '  rm -rf "$PGDATA"/*',
  REPLICA_BOOTSTRAP_SLEEP: '    sleep 1',
  REPLICA_BOOTSTRAP_WAIT_DONE: '  done',
  REPLICA_SETUP: 'set -e',
  REPLICATION_TIMEOUT_PREFIX:
    'Postgres replicas did not reach streaming state within ',
  ROW_CAP_EXCEEDED: 'MovieLens row cap exceeded',
  RUN_SCRIPT: 'run-postgres-baseline.js',
  SPACE: ' ',
  TAB: '\t',
  TIMEOUT_SUFFIX: 'ms',
  TRUE: 'true',
});

class PostgresBaselineFailure extends Error {
  constructor(cause, cleanupReceipt, failureCauseEntries) {
    super(POSTGRES_TEXT.BASELINE_FAILED);
    this.name = POSTGRES_BASELINE_FAILURE_NAME;
    this.cleanupReceipt = cleanupReceipt;
    this.failureCauseEntries = Object.freeze(
      failureCauseEntries || [
        Object.freeze({
          cause,
          role:
            MOVIELENS_PUBLIC_REQUEST_FAILURE_CAUSE_ROLE
              .POSTGRES_OPERATION,
        }),
      ],
    );
  }
}

function unconfirmedPostgresCleanup(baseline) {
  return Object.freeze({
    containersAbsent: null,
    networkAbsent: null,
    networkName: baseline?.networkName || null,
    removedContainerIds: Object.freeze([]),
  });
}

function buildPsqlCommand(options = {}) {
  const host = stringConstructor(
    options.host || POSTGRES_TEXT.LOCALHOST_IPV4,
  );
  const port = numberIsInteger(options.port) ? options.port : DEFAULT_PORT;
  const user = stringConstructor(options.user || DEFAULT_USER);
  const password = stringConstructor(options.password || '');
  const database = stringConstructor(options.database || DEFAULT_DATABASE);
  const sql = stringConstructor(options.sql || '');
  return arrayJoin([
    `PGPASSWORD='${shellQuote(password)}'`,
    POSTGRES_TEXT.PSQL,
    POSTGRES_TEXT.PSQL_VARIABLE_STOP,
    POSTGRES_TEXT.PSQL_TUPLES_ONLY,
    POSTGRES_TEXT.PSQL_ALIGN,
    `-h '${shellQuote(host)}'`,
    `-p ${port}`,
    `-U '${shellQuote(user)}'`,
    `-d '${shellQuote(database)}'`,
    `-c '${shellQuote(sql)}'`,
  ], POSTGRES_TEXT.SPACE);
}

function buildSynchronousStandbySetting(syncReplicaAcks) {
  return `ANY ${syncReplicaAcks} (*)`;
}

function buildReplicaBootstrapCommand(primaryContainerName, replicaName, config) {
  const basebackupConnectionString = arrayJoin([
    `host=${primaryContainerName}`,
    `port=${config.port}`,
    `user=${config.user}`,
    `password=${config.password}`,
    `dbname=${BOOTSTRAP_DB_NAME}`,
    `application_name=${replicaName}`,
  ], POSTGRES_TEXT.SPACE);

  return arrayJoin([
    POSTGRES_TEXT.REPLICA_SETUP,
    POSTGRES_TEXT.REPLICA_BOOTSTRAP_OPEN,
    POSTGRES_TEXT.REPLICA_BOOTSTRAP_REMOVE,
    `  until pg_isready -h '${shellQuote(primaryContainerName)}' ` +
      `-p ${config.port} -U '${shellQuote(config.user)}'; do`,
    POSTGRES_TEXT.REPLICA_BOOTSTRAP_SLEEP,
    POSTGRES_TEXT.REPLICA_BOOTSTRAP_WAIT_DONE,
    `  pg_basebackup --dbname='${shellQuote(basebackupConnectionString)}' ` +
      POSTGRES_TEXT.REPLICA_BASEBACKUP,
    POSTGRES_TEXT.REPLICA_BOOTSTRAP_DONE,
    POSTGRES_BINARY_PATH_EXPORT,
    `exec ${POSTGRES_ENTRYPOINT_COMMAND}`,
  ], POSTGRES_TEXT.NEWLINE);
}

async function configurePrimaryReplication(provider, containerId, config) {
  if (config.replicationFactor <= ONE) {
    return;
  }

  const syncSetting = buildSynchronousStandbySetting(config.syncReplicaAcks);
  const commands = [
    `echo "${REPLICATION_HBA_IPV4}" >> "$PGDATA/pg_hba.conf"`,
    `echo "${REPLICATION_HBA_IPV6}" >> "$PGDATA/pg_hba.conf"`,
    buildPsqlCommand({
      host: POSTGRES_TEXT.LOCALHOST_IPV4,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      sql: `ALTER SYSTEM SET synchronous_commit = '${SYNCHRONOUS_COMMIT_ON}'`,
    }),
    buildPsqlCommand({
      host: POSTGRES_TEXT.LOCALHOST_IPV4,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      sql: `ALTER SYSTEM SET synchronous_standby_names = '${syncSetting}'`,
    }),
    buildPsqlCommand({
      host: '127.0.0.1',
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      sql: 'SELECT pg_reload_conf()',
    }),
  ];

  const shellCommand = arrayJoin(commands, ' && ');
  await execShell(
    provider,
    containerId,
    shellCommand,
    POSTGRES_TEXT.CONFIGURE_PRIMARY,
  );
}

function replicationReadiness(ready, replicaCount) {
  return {ready, replicaCount};
}

async function waitForStreamingReplicas(provider, containerId, config) {
  const requiredReplicaCount = config.replicationFactor - ONE;
  if (requiredReplicaCount <= ZERO) {
    return replicationReadiness(true, ZERO);
  }

  const deadline = Date.now() + config.readyTimeoutMs;
  let lastReplicaCount = ZERO;
  while (Date.now() < deadline) {
    const queryCommand = buildPsqlCommand({
      host: POSTGRES_TEXT.LOCALHOST_IPV4,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      sql:
        'SELECT count(*) FROM pg_stat_replication ' +
        `WHERE state = '${REPLICATION_STATE_STREAMING}'`,
    });
    const output = await execShell(
      provider,
      containerId,
      queryCommand,
      'check postgres replication status',
    );
    const replicaCount = parseCanonicalCounter(output);
    lastReplicaCount = replicaCount === null ? ZERO : replicaCount;
    if (replicaCount !== null && replicaCount >= requiredReplicaCount) {
      return replicationReadiness(true, replicaCount);
    }
    await new Promise((resolve) => setTimeout(resolve, config.readyPollIntervalMs));
  }

  if (config.allowReplicationTimeout === true) {
    return replicationReadiness(false, lastReplicaCount);
  }

  throw new Error(
    POSTGRES_TEXT.REPLICATION_TIMEOUT_PREFIX +
    config.readyTimeoutMs + POSTGRES_TEXT.TIMEOUT_SUFFIX,
  );
}

function parseCanonicalCounter(value) {
  const raw = stringTrim(stringConstructor(value));
  if (!regExpTest(DECIMAL_COUNTER, raw)) return null;
  const parsed = numberConstructor(raw);
  return numberIsSafeInteger(parsed) ? parsed : null;
}

function resolveEnvInteger(envKey) {
  const raw = process.env[envKey];
  if (!raw) {
    return null;
  }
  const parsed = parseCanonicalCounter(raw);
  return parsed !== null && parsed > ZERO ? parsed : null;
}

function buildBaselineConfig(options = {}) {
  const envReplicationFactor = resolveEnvInteger('PG_BASELINE_REPLICATION_FACTOR');
  const envReadyTimeoutMs = resolveEnvInteger('PG_BASELINE_READY_TIMEOUT_MS');
  const envReadyPollIntervalMs = resolveEnvInteger('PG_BASELINE_READY_POLL_MS');
  return {
    baselineImage: DEFAULT_BASELINE_IMAGE,
    user: DEFAULT_USER,
    password: DEFAULT_PASSWORD,
    database: DEFAULT_DATABASE,
    port: DEFAULT_PORT,
    replicationFactor:
      (numberIsInteger(options.replicationFactor) &&
        options.replicationFactor > ZERO ?
        options.replicationFactor :
        null) ||
      envReplicationFactor ||
      DEFAULT_REPLICATION_FACTOR,
    syncReplicaAcks: DEFAULT_SYNC_REPLICA_ACKS,
    readyTimeoutMs: envReadyTimeoutMs || DEFAULT_READY_TIMEOUT_MS,
    readyPollIntervalMs: envReadyPollIntervalMs || DEFAULT_READY_POLL_INTERVAL_MS,
    batchSize: DEFAULT_BATCH_SIZE,
    resourceLimits: options.resourceLimits || undefined,
    allowReplicationTimeout:
      process.env.PG_BASELINE_ALLOW_REPLICATION_TIMEOUT ===
        POSTGRES_TEXT.TRUE,
  };
}

async function startPostgresBaseline(provider, config) {
  const networkName = `${DEFAULT_NETWORK_PREFIX}-${randomUUID().slice(0, 8)}`;
  const network = await provider.createNetwork(networkName, {
    scenario: 'movielens-postgres-baseline',
  });

  const containers = [];
  let primary = null;
  try {
    const primaryName = `${networkName}-primary`;
    primary = await provider.createContainer({
      name: primaryName,
      image: config.baselineImage,
      network: networkName,
      env: {
        [POSTGRES_ENV_USER_KEY]: config.user,
        [POSTGRES_ENV_PASSWORD_KEY]: config.password,
        [POSTGRES_ENV_DB_KEY]: config.database,
        [POSTGRES_ENV_AUTH_METHOD_KEY]: POSTGRES_ENV_AUTH_METHOD_VALUE,
      },
      resourceLimits: config.resourceLimits,
    });
    arrayPush(containers, primary);

    await waitForPostgresReady(provider, primary.containerId, {
      host: POSTGRES_TEXT.LOCALHOST_IPV4,
      port: config.port,
      user: config.user,
      database: config.database,
      timeoutMs: config.readyTimeoutMs,
      pollIntervalMs: config.readyPollIntervalMs,
    });
    await configurePrimaryReplication(provider, primary.containerId, config);

    for (let replicaIndex = ONE; replicaIndex < config.replicationFactor; replicaIndex += ONE) {
      const replicaName = `${networkName}-replica-${replicaIndex}`;
      const replicaBootstrapCommand = buildReplicaBootstrapCommand(
        primaryName,
        replicaName,
        config,
      );
      const replica = await provider.createContainer({
        name: replicaName,
        image: config.baselineImage,
        network: networkName,
        env: {
          [POSTGRES_ENV_USER_KEY]: config.user,
          [POSTGRES_ENV_PASSWORD_KEY]: config.password,
          [POSTGRES_ENV_DB_KEY]: config.database,
          [POSTGRES_ENV_AUTH_METHOD_KEY]: POSTGRES_ENV_AUTH_METHOD_VALUE,
        },
        command: [SHELL_COMMAND, SHELL_LOGIN_ARG, replicaBootstrapCommand],
        resourceLimits: config.resourceLimits,
      });
      arrayPush(containers, replica);
      await waitForPostgresReady(provider, replica.containerId, {
        host: POSTGRES_TEXT.LOCALHOST_IPV4,
        port: config.port,
        user: config.user,
        database: config.database,
        timeoutMs: config.readyTimeoutMs,
        pollIntervalMs: config.readyPollIntervalMs,
      });
    }

    const replicationState = await waitForStreamingReplicas(
      provider,
      primary.containerId,
      config,
    );
    return {
      networkId: network.id,
      networkName,
      containers,
      primary,
      replicationState,
    };
  } catch (error) {
    const partialBaseline = {
      containers,
      networkId: network?.id,
      networkName,
    };
    try {
      const cleanupReceipt =
        await cleanupPostgresBaseline(provider, partialBaseline);
      throw new PostgresBaselineFailure(
        error,
        cleanupReceipt,
        [Object.freeze({
          cause: error,
          role:
            MOVIELENS_PUBLIC_REQUEST_FAILURE_CAUSE_ROLE
              .POSTGRES_OPERATION,
        })],
      );
    } catch (cleanupError) {
      if (cleanupError instanceof PostgresBaselineFailure) {
        throw cleanupError;
      }
      throw new PostgresBaselineFailure(
        error,
        unconfirmedPostgresCleanup(partialBaseline),
        [
          Object.freeze({
            cause: error,
            role:
              MOVIELENS_PUBLIC_REQUEST_FAILURE_CAUSE_ROLE
                .POSTGRES_OPERATION,
          }),
          Object.freeze({
            cause: cleanupError,
            role:
              MOVIELENS_PUBLIC_REQUEST_FAILURE_CAUSE_ROLE
                .POSTGRES_CLEANUP,
          }),
        ],
      );
    }
  }
}

async function cleanupPostgresContainer(provider, container) {
  const containerId = container && container.containerId;
  if (!containerId) return '';
  const inspect = await provider.inspectContainerIfExists(containerId);
  if (inspect && inspect.State && inspect.State.Running === true) {
    await provider.stopContainer(containerId);
  }
  if (await provider.inspectContainerIfExists(containerId)) {
    await provider.removeContainer(containerId);
  }
  if (await provider.inspectContainerIfExists(containerId)) {
    throw new Error(`PostgreSQL container cleanup failed: ${containerId}`);
  }
  return containerId;
}

async function cleanupPostgresNetwork(provider, networkName) {
  if (!networkName) return;
  const network = await provider.getNetworkByName(networkName);
  if (network) await provider.removeNetwork(network.id);
  if (await provider.getNetworkByName(networkName)) {
    throw new Error(`PostgreSQL network cleanup failed: ${networkName}`);
  }
}

async function cleanupPostgresBaseline(provider, baseline) {
  const removedContainerIds = [];
  for (let index = baseline.containers.length - 1; index >= 0; index -= 1) {
    const containerId = await cleanupPostgresContainer(
      provider,
      baseline.containers[index],
    );
    if (containerId) arrayPush(removedContainerIds, containerId);
  }
  await cleanupPostgresNetwork(provider, baseline.networkName);
  return Object.freeze({
    containersAbsent: true,
    networkAbsent: true,
    networkName: baseline.networkName,
    removedContainerIds,
  });
}

async function loadRatingsBytes(pool, batchSize, bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length > RATINGS_MAX_BYTES) {
    throw new TypeError(POSTGRES_TEXT.BOUNDED_INPUT_REQUIRED);
  }
  const insertMany = async (rows) => {
    const values = arrayJoin(
      arrayMap(
        rows,
        (row) => `(${row[0]}, ${row[1]}, ${row[2]}, ${row[3]})`,
      ),
      ',',
    );
    const sql =
      'INSERT INTO ratings (user_id, movie_id, rating, rating_ts) VALUES ' + values;
    await pool.query(sql);
  };

  const lines = stringSplit(bytes.toString(BYTE_ENCODING), /\r?\n/u);
  const batch = [];
  let total = 0;
  for (const line of lines) {
    if (!line) {
      continue;
    }
    const [userId, movieId, rating, ts] =
      stringSplit(line, POSTGRES_TEXT.TAB);
    arrayPush(batch, [
      numberConstructor(userId),
      numberConstructor(movieId),
      numberConstructor(rating),
      numberConstructor(ts),
    ]);
    total += 1;
    if (total > RATINGS_MAX_ROWS) {
      throw new RangeError(POSTGRES_TEXT.ROW_CAP_EXCEEDED);
    }

    if (batch.length >= batchSize) {
      await insertMany(batch);
      batch.length = 0;
    }
  }

  if (batch.length > 0) {
    await insertMany(batch);
  }

  return total;
}

async function resolveRatingsBytes(options) {
  const bytes = options.ratingsBytes ||
    await readFile(options.ratingsPath || RATINGS_FILE);
  const digest = `sha256:${createHash(SHA256_ALGORITHM)
    .update(bytes)
    .digest(SHA256_ENCODING)}`;
  if (options.ratingsDigest && digest !== options.ratingsDigest) {
    throw new Error(POSTGRES_TEXT.INPUT_DIGEST_MISMATCH);
  }
  return {bytes, digest};
}

function projectPostgresTopMovies(rows) {
  return arrayMap(rows, (row) => ({
    avgRating: numberConstructor(row.avg_rating),
    movieId: numberConstructor(row.movie_id),
    ratingCount: numberConstructor(row.rating_count),
    score: numberConstructor(row.score),
  }));
}

function validImageInspection(imageInspect) {
  return Boolean(
    imageInspect &&
    typeof imageInspect.Id === 'string' &&
    arrayIsArray(imageInspect.RepoDigests) &&
    imageInspect.RepoDigests.length > 0,
  );
}

async function collectPostgresProvenance(provider, baseline, imageName) {
  const imageInspect = await provider.inspectImage(imageName);
  if (!validImageInspection(imageInspect)) {
    throw new Error(POSTGRES_TEXT.IMAGE_PROVENANCE_UNAVAILABLE);
  }
  const logs = {};
  const measuredContainerImages = [];
  for (const container of baseline.containers) {
    const containerInspect =
      await provider.inspectContainer(container.containerId);
    if (containerInspect.Image !== imageInspect.Id) {
      throw new Error(POSTGRES_TEXT.IMAGE_PROVENANCE_UNAVAILABLE);
    }
    arrayPush(measuredContainerImages, {
      containerId: container.containerId,
      inspectImage: containerInspect.Image,
    });
    logs[container.containerId] =
      await provider.getContainerLogs(container.containerId);
  }
  return {
    imageInspect,
    logs,
    measuredContainerImages,
  };
}

function createPostgresFailureCauseEntries() {
  return new ArrayConstructor();
}

async function runPostgresBaseline(options = {}) {
  const ratingsInput = await resolveRatingsBytes(options);
  const config = buildBaselineConfig(options);
  const provider = new DockerProvider({
    socketPath: '/var/run/docker.sock',
  });

  const baseline = await startPostgresBaseline(provider, config);
  let pool = null;
  let result;
  let operationFailed = false;
  let operationError;
  try {
    pool = new Pool({
      host: baseline.primary.ip,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      max: BASELINE_POOL_MAX,
    });

    await pool.query(DROP_RATINGS_SQL);
    await pool.query(CREATE_RATINGS_SQL);

    const loadStart = Date.now();
    const totalRows = await loadRatingsBytes(
      pool,
      config.batchSize,
      ratingsInput.bytes,
    );
    const loadDurationMs = Date.now() - loadStart;

    const queryStart = Date.now();
    const rows = await pool.query(RATINGS_TOP_QUALITY_SQL);
    const queryDurationMs = Date.now() - queryStart;
    const versionResult = await pool.query(POSTGRES_VERSION_SQL);
    const provenance = await collectPostgresProvenance(
      provider,
      baseline,
      config.baselineImage,
    );
    result = {
      imageId: provenance.imageInspect.Id,
      imageInspection: {
        id: provenance.imageInspect.Id,
        repoDigests: [...provenance.imageInspect.RepoDigests],
      },
      imageRepoDigests: [...provenance.imageInspect.RepoDigests],
      inputDigest: ratingsInput.digest,
      inputSizeBytes: ratingsInput.bytes.length,
      logs: provenance.logs,
      postgresVersion: versionResult.rows?.[0]?.version,
      postgresVersionSql: POSTGRES_VERSION_SQL,
      querySql: RATINGS_TOP_QUALITY_SQL,
      totalRows,
      loadDurationMs,
      measuredContainerImages: provenance.measuredContainerImages,
      queryDurationMs,
      returnedAggregateRows: rows.rows?.length || 0,
      topMovies: projectPostgresTopMovies(rows.rows || []),
      replicationFactor: config.replicationFactor,
      replicationState: baseline.replicationState || null,
    };
  } catch (error) {
    operationFailed = true;
    operationError = error;
  }
  let poolCloseFailed = false;
  let poolCloseError;
  try {
    await pool?.end();
  } catch (error) {
    poolCloseFailed = true;
    poolCloseError = error;
  }
  let cleanupReceipt;
  let cleanupFailed = false;
  let cleanupError;
  try {
    cleanupReceipt =
      await cleanupPostgresBaseline(provider, baseline);
  } catch (error) {
    cleanupFailed = true;
    cleanupError = error;
    cleanupReceipt = unconfirmedPostgresCleanup(baseline);
  }
  const failureCauseEntries = createPostgresFailureCauseEntries();
  if (operationFailed) {
    arrayPush(failureCauseEntries, Object.freeze({
      cause: operationError,
      role:
        MOVIELENS_PUBLIC_REQUEST_FAILURE_CAUSE_ROLE.POSTGRES_OPERATION,
    }));
  }
  if (poolCloseFailed) {
    arrayPush(failureCauseEntries, Object.freeze({
      cause: poolCloseError,
      role:
        MOVIELENS_PUBLIC_REQUEST_FAILURE_CAUSE_ROLE.POSTGRES_POOL_CLOSE,
    }));
  }
  if (cleanupFailed) {
    arrayPush(failureCauseEntries, Object.freeze({
      cause: cleanupError,
      role:
        MOVIELENS_PUBLIC_REQUEST_FAILURE_CAUSE_ROLE.POSTGRES_CLEANUP,
    }));
  }
  if (failureCauseEntries.length > 0) {
    throw new PostgresBaselineFailure(
      failureCauseEntries[0].cause,
      cleanupReceipt,
      failureCauseEntries,
    );
  }
  return {...result, cleanupReceipt};
}

if (
  typeof process.argv[1] === 'string' &&
  stringIncludes(process.argv[1], POSTGRES_TEXT.RUN_SCRIPT)
) {
  runPostgresBaseline()
    .then((metrics) => {
      console.log(POSTGRES_TEXT.BASELINE_METRICS);
      console.log(jsonStringify(metrics, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

export {
  PostgresBaselineFailure,
  POSTGRES_VERSION_SQL,
  RATINGS_MAX_BYTES,
  RATINGS_MAX_ROWS,
  buildBaselineConfig,
  buildPsqlCommand,
  cleanupPostgresBaseline,
  collectPostgresProvenance,
  loadRatingsBytes,
  projectPostgresTopMovies,
  resolveRatingsBytes,
  runPostgresBaseline,
  startPostgresBaseline,
  unconfirmedPostgresCleanup,
};
