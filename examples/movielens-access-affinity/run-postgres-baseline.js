import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createInterface} from 'node:readline';
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
  RATINGS_SELECT_SQL,
  computeTopMovies,
} from './shared.js';

const ZERO = 0;
const ONE = 1;
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

function buildPsqlCommand(options = {}) {
  const host = String(options.host || '127.0.0.1');
  const port = Number.isInteger(options.port) ? options.port : DEFAULT_PORT;
  const user = String(options.user || DEFAULT_USER);
  const password = String(options.password || '');
  const database = String(options.database || DEFAULT_DATABASE);
  const sql = String(options.sql || '');
  return [
    `PGPASSWORD='${shellQuote(password)}'`,
    'psql',
    '-v ON_ERROR_STOP=1',
    `-h '${shellQuote(host)}'`,
    `-p ${port}`,
    `-U '${shellQuote(user)}'`,
    `-d '${shellQuote(database)}'`,
    `-c '${shellQuote(sql)}'`,
  ].join(' ');
}

function buildSynchronousStandbySetting(syncReplicaAcks) {
  return `ANY ${syncReplicaAcks} (*)`;
}

function buildReplicaBootstrapCommand(primaryContainerName, replicaName, config) {
  const basebackupConnectionString = [
    `host=${primaryContainerName}`,
    `port=${config.port}`,
    `user=${config.user}`,
    `password=${config.password}`,
    `dbname=${BOOTSTRAP_DB_NAME}`,
    `application_name=${replicaName}`,
  ].join(' ');

  return [
    'set -e',
    'if [ ! -s "$PGDATA/PG_VERSION" ]; then',
    '  rm -rf "$PGDATA"/*',
    `  until pg_isready -h '${shellQuote(primaryContainerName)}' ` +
      `-p ${config.port} -U '${shellQuote(config.user)}'; do`,
    '    sleep 1',
    '  done',
    `  pg_basebackup --dbname='${shellQuote(basebackupConnectionString)}' ` +
      '-D "$PGDATA" -Fp -Xs -P -R',
    'fi',
    POSTGRES_BINARY_PATH_EXPORT,
    `exec ${POSTGRES_ENTRYPOINT_COMMAND}`,
  ].join('\n');
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
      host: '127.0.0.1',
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      sql: `ALTER SYSTEM SET synchronous_commit = '${SYNCHRONOUS_COMMIT_ON}'`,
    }),
    buildPsqlCommand({
      host: '127.0.0.1',
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

  const shellCommand = commands.join(' && ');
  await execShell(
    provider,
    containerId,
    shellCommand,
    'configure postgres primary replication',
  );
}

async function waitForStreamingReplicas(provider, containerId, config) {
  const requiredReplicaCount = config.replicationFactor - ONE;
  if (requiredReplicaCount <= ZERO) {
    return {
      ready: true,
      replicaCount: ZERO,
    };
  }

  const deadline = Date.now() + config.readyTimeoutMs;
  let lastReplicaCount = ZERO;
  while (Date.now() < deadline) {
    const queryCommand = buildPsqlCommand({
      host: '127.0.0.1',
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
    const replicaCount = Number.parseInt(String(output).trim(), 10);
    lastReplicaCount = Number.isInteger(replicaCount) ? replicaCount : ZERO;
    if (Number.isInteger(replicaCount) && replicaCount >= requiredReplicaCount) {
      return {
        ready: true,
        replicaCount,
      };
    }
    await new Promise((resolve) => setTimeout(resolve, config.readyPollIntervalMs));
  }

  if (config.allowReplicationTimeout === true) {
    return {
      ready: false,
      replicaCount: lastReplicaCount,
    };
  }

  throw new Error(
    'Postgres replicas did not reach streaming state within ' +
    config.readyTimeoutMs + 'ms',
  );
}

function resolveEnvInteger(envKey) {
  const raw = process.env[envKey];
  if (!raw) {
    return null;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > ZERO ? parsed : null;
}

function buildBaselineConfig() {
  const envReplicationFactor = resolveEnvInteger('PG_BASELINE_REPLICATION_FACTOR');
  const envReadyTimeoutMs = resolveEnvInteger('PG_BASELINE_READY_TIMEOUT_MS');
  const envReadyPollIntervalMs = resolveEnvInteger('PG_BASELINE_READY_POLL_MS');
  const strictReplication = process.env.PG_BASELINE_STRICT_REPLICATION === 'true';
  return {
    baselineImage: DEFAULT_BASELINE_IMAGE,
    user: DEFAULT_USER,
    password: DEFAULT_PASSWORD,
    database: DEFAULT_DATABASE,
    port: DEFAULT_PORT,
    replicationFactor: envReplicationFactor || DEFAULT_REPLICATION_FACTOR,
    syncReplicaAcks: DEFAULT_SYNC_REPLICA_ACKS,
    readyTimeoutMs: envReadyTimeoutMs || DEFAULT_READY_TIMEOUT_MS,
    readyPollIntervalMs: envReadyPollIntervalMs || DEFAULT_READY_POLL_INTERVAL_MS,
    batchSize: DEFAULT_BATCH_SIZE,
    allowReplicationTimeout: !strictReplication,
  };
}

async function startPostgresBaseline(provider, config) {
  const networkName = `${DEFAULT_NETWORK_PREFIX}-${randomUUID().slice(0, 8)}`;
  const network = await provider.createNetwork(networkName, {
    scenario: 'movielens-postgres-baseline',
  });

  const containers = [];
  let primary = null;
  const cleanupContainers = async () => {
    for (const container of containers.reverse()) {
      if (!container?.containerId) {
        continue;
      }
      await provider.stopContainer(container.containerId).catch(() => {});
      await provider.removeContainer(container.containerId).catch(() => {});
    }
  };
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
    });
    containers.push(primary);

    await waitForPostgresReady(provider, primary.containerId, {
      host: '127.0.0.1',
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
      });
      containers.push(replica);
      await waitForPostgresReady(provider, replica.containerId, {
        host: '127.0.0.1',
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
    await cleanupContainers();
    if (network?.id) {
      await provider.removeNetwork(network.id).catch(() => {});
    }
    throw error;
  }
}

async function loadRatings(pool, batchSize) {
  const insertMany = async (rows) => {
    const values = rows
      .map((row) => `(${row[0]}, ${row[1]}, ${row[2]}, ${row[3]})`)
      .join(',');
    const sql =
      'INSERT INTO ratings (user_id, movie_id, rating, rating_ts) VALUES ' + values;
    await pool.query(sql);
  };

  const rl = createInterface({
    input: createReadStream(RATINGS_FILE),
    crlfDelay: Infinity,
  });

  const batch = [];
  let total = 0;
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

async function runPostgresBaseline() {
  await ensureRatingsFile();
  const config = buildBaselineConfig();
  const provider = new DockerProvider({
    socketPath: '/var/run/docker.sock',
  });

  const baseline = await startPostgresBaseline(provider, config);
  const cleanup = async () => {
    for (const container of baseline.containers.reverse()) {
      if (!container?.containerId) {
        continue;
      }
      await provider.stopContainer(container.containerId).catch(() => {});
      await provider.removeContainer(container.containerId).catch(() => {});
    }
    if (baseline.networkId) {
      await provider.removeNetwork(baseline.networkId).catch(() => {});
    }
  };

  try {
    const pool = new Pool({
      host: baseline.primary.ip,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      max: 4,
    });

    await pool.query('DROP TABLE IF EXISTS ratings;');
    await pool.query(CREATE_RATINGS_SQL);

    const loadStart = Date.now();
    const totalRows = await loadRatings(pool, config.batchSize);
    const loadDurationMs = Date.now() - loadStart;

    const queryStart = Date.now();
    const rows = await pool.query(RATINGS_SELECT_SQL);
    const results = computeTopMovies(rows.rows || []);
    const queryDurationMs = Date.now() - queryStart;

    await pool.end();

    return {
      totalRows,
      loadDurationMs,
      queryDurationMs,
      topMovies: results,
      replicationFactor: config.replicationFactor,
      replicationState: baseline.replicationState || null,
    };
  } finally {
    await cleanup();
  }
}

if (process.argv[1]?.includes('run-postgres-baseline.js')) {
  runPostgresBaseline()
    .then((metrics) => {
      console.log('Postgres baseline metrics:');
      console.log(JSON.stringify(metrics, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

export {runPostgresBaseline};
