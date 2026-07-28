import {createHash} from 'node:crypto';
import {Pool} from 'pg';

import {
  DockerProvider,
} from '../../test/distributed/harness/docker-provider.js';
import {
  CREATE_RATINGS_SQL,
  RATINGS_TOP_QUALITY_SQL,
} from './movie-ranking.js';
import {
  PostgresBaselineFailure,
  POSTGRES_VERSION_SQL,
  buildBaselineConfig,
  cleanupPostgresBaseline,
  collectPostgresProvenance,
  loadRatingsBytes,
  projectPostgresTopMovies,
  resolveRatingsBytes,
  startPostgresBaseline,
  unconfirmedPostgresCleanup,
} from './run-postgres-baseline.js';

const ArrayConstructor = Array;
const SetConstructor = Set;
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayPush = Function.call.bind(Array.prototype.push);
const jsonStringify = JSON.stringify;
const numberConstructor = Number;
const numberIsSafeInteger = Number.isSafeInteger;
const promiseRace = Promise.race.bind(Promise);
const setAdd = Function.call.bind(Set.prototype.add);
const SHA256_ALGORITHM = 'sha256';
const SHA256_ENCODING = 'hex';
const SHA256_PREFIX = 'sha256:';
const DOCKER_SOCKET_PATH = '/var/run/docker.sock';
const CREATE_CAPACITY_RESULTS_SQL =
  'CREATE TABLE movielens_capacity_results (' +
  'request_id TEXT PRIMARY KEY, result_json TEXT NOT NULL);';
const INSERT_CAPACITY_RESULT_SQL =
  'INSERT INTO movielens_capacity_results (request_id, result_json) ' +
  'VALUES ($1, $2);';
const SELECT_CAPACITY_RESULT_SQL =
  'SELECT result_json FROM movielens_capacity_results ' +
  'WHERE request_id = $1;';
const DELETE_CAPACITY_RESULTS_SQL =
  'DELETE FROM movielens_capacity_results;';
const COUNT_CAPACITY_RESULTS_SQL =
  'SELECT count(*) AS row_count FROM movielens_capacity_results;';
const SELECT_BACKEND_PID_SQL =
  'SELECT pg_backend_pid() AS backend_pid';
const COUNT_RATINGS_SQL =
  'SELECT count(*) AS row_count FROM ratings';
const BEGIN_SQL = 'BEGIN';
const COMMIT_SQL = 'COMMIT';
const ROLLBACK_SQL = 'ROLLBACK';
const DROP_RATINGS_SQL = 'DROP TABLE IF EXISTS ratings;';
const DROP_CAPACITY_RESULTS_SQL =
  'DROP TABLE IF EXISTS movielens_capacity_results;';
const SESSION_POOL_MAX = 16;
const FORCED_POOL_CLOSE_TIMEOUT_MS = 5_000;
const SESSION_TEXT = Object.freeze({
  CAPACITY_RESULTS_REMAIN:
    'PostgreSQL MovieLens reset retained capacity results',
  DURABLE_INPUT_MISMATCH:
    'PostgreSQL MovieLens input durability mismatch',
  DURABLE_RESULT_MISMATCH:
    'PostgreSQL MovieLens result durability mismatch',
  INPUT_STATE_CHANGED:
    'PostgreSQL MovieLens reset found changed input state',
  OPERATION_ROLLBACK_FAILED:
    'PostgreSQL MovieLens operation and rollback failed',
  POOL_CLOSED: 'pool_closed',
  POOL_CLOSE_FAILED: 'pool_close_failed',
  POOL_CLOSE_TIMEOUT: 'pool_close_timeout',
  POOL_ERROR_EVENT: 'error',
  REQUEST_IDENTITY_REQUIRED:
    'PostgreSQL MovieLens request identity is required',
  SESSION_ALREADY_CLOSED:
    'PostgreSQL MovieLens session already closed',
  SESSION_CLOSED: 'PostgreSQL MovieLens session is closed',
  SESSION_NETWORK_COUNTER_INVALID:
    'PostgreSQL MovieLens session socket counter is invalid',
  SESSION_NETWORK_AUTHORITY: 'postgresql_client_socket_bytes',
  SESSION_CLEANUP_FAILED: 'PostgreSQL session cleanup failed',
  SESSION_FORCED_CLEANUP_FAILED:
    'PostgreSQL forced session cleanup failed',
  SESSION_FORCED_POOL_CLOSE_TIMEOUT:
    'PostgreSQL forced pool close timed out',
  SESSION_SETUP_CLEANUP_FAILED:
    'PostgreSQL MovieLens setup and cleanup failed',
  STATE_RESET: 'input_preserved_and_results_cleared',
});

function createPostgresFailureCauseEntries() {
  return new ArrayConstructor();
}

async function boundedForcedPoolClose(poolClosePromise) {
  const timeout = Object.freeze({kind: SESSION_TEXT.POOL_CLOSE_TIMEOUT});
  let timeoutHandle;
  const poolSettlement = poolClosePromise.then(
    () => Object.freeze({kind: SESSION_TEXT.POOL_CLOSED}),
    (error) => Object.freeze({
      error,
      kind: SESSION_TEXT.POOL_CLOSE_FAILED,
    }),
  );
  const result = await promiseRace([
    poolSettlement,
    new Promise((resolve) => {
      timeoutHandle = setTimeout(
        resolve,
        FORCED_POOL_CLOSE_TIMEOUT_MS,
        timeout,
      );
    }),
  ]);
  clearTimeout(timeoutHandle);
  if (result === timeout) {
    throw new Error(SESSION_TEXT.SESSION_FORCED_POOL_CLOSE_TIMEOUT);
  }
  if (result.kind === SESSION_TEXT.POOL_CLOSE_FAILED) throw result.error;
}

function createPostgresSessionCleanupController({
  pool,
  initialProvenance,
  collectFinalProvenance,
  cleanupBaseline,
  unconfirmedCleanupReceipt,
}) {
  const backgroundErrors = createPostgresFailureCauseEntries();
  pool.on(SESSION_TEXT.POOL_ERROR_EVENT, (error) => {
    arrayPush(backgroundErrors, error);
  });
  let unavailable = false;
  let gracefulPromise = null;
  let gracefulSettled = false;
  let forcePromise = null;
  let poolClosePromise = null;
  let baselineCleanupPromise = null;

  function beginPoolClose() {
    if (poolClosePromise === null) {
      poolClosePromise = Promise.resolve().then(() => pool.end());
    }
    return poolClosePromise;
  }

  function beginBaselineCleanup() {
    if (baselineCleanupPromise === null) {
      baselineCleanupPromise =
        Promise.resolve().then(() => cleanupBaseline());
    }
    return baselineCleanupPromise;
  }

  async function runGracefulClose() {
    const failures = createPostgresFailureCauseEntries();
    let finalProvenance = initialProvenance;
    let cleanupReceipt = unconfirmedCleanupReceipt;
    try {
      finalProvenance = await collectFinalProvenance();
    } catch (error) {
      arrayPush(failures, error);
    }
    try {
      await beginPoolClose();
    } catch (error) {
      arrayPush(failures, error);
    }
    try {
      cleanupReceipt = await beginBaselineCleanup();
    } catch (error) {
      arrayPush(failures, error);
    }
    for (let index = 0; index < backgroundErrors.length; index += 1) {
      arrayPush(failures, backgroundErrors[index]);
    }
    if (failures.length > 0) {
      throw new AggregateError(
        failures,
        SESSION_TEXT.SESSION_CLEANUP_FAILED,
      );
    }
    return Object.freeze({
      cleanupReceipt,
      logs: Object.freeze(finalProvenance.logs),
    });
  }

  async function runForcedClose() {
    const failures = createPostgresFailureCauseEntries();
    let cleanupReceipt = unconfirmedCleanupReceipt;
    try {
      cleanupReceipt = await beginBaselineCleanup();
    } catch (error) {
      arrayPush(failures, error);
    }
    try {
      await boundedForcedPoolClose(beginPoolClose());
    } catch (error) {
      arrayPush(failures, error);
    }
    if (failures.length > 0) {
      throw new AggregateError(
        failures,
        SESSION_TEXT.SESSION_FORCED_CLEANUP_FAILED,
      );
    }
    return Object.freeze({
      cleanupReceipt,
      forced: true,
      logs: Object.freeze(initialProvenance.logs),
    });
  }

  return Object.freeze({
    unavailable() {
      return unavailable;
    },
    async close() {
      if (unavailable) {
        throw new Error(SESSION_TEXT.SESSION_ALREADY_CLOSED);
      }
      unavailable = true;
      gracefulPromise = runGracefulClose().finally(() => {
        gracefulSettled = true;
      });
      return gracefulPromise;
    },
    async forceClose() {
      if (forcePromise !== null) return forcePromise;
      if (gracefulSettled) {
        throw new Error(SESSION_TEXT.SESSION_ALREADY_CLOSED);
      }
      unavailable = true;
      forcePromise = runForcedClose();
      return forcePromise;
    },
  });
}

async function openPostgresBaselineSession(options = {}) {
  const ratingsInput = await resolveRatingsBytes(options);
  const config = buildBaselineConfig(options);
  const provider = new DockerProvider({socketPath: DOCKER_SOCKET_PATH});
  const baseline = await startPostgresBaseline(provider, config);
  let pool = null;
  const observedNetworkStreams = new SetConstructor();
  try {
    pool = new Pool({
      host: baseline.primary.ip,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      max:
        numberIsSafeInteger(options.poolSize) && options.poolSize > 0 ?
          options.poolSize :
          SESSION_POOL_MAX,
    });
    async function observedQuery(sql, values) {
      const client = await pool.connect();
      const stream = client?.connection?.stream;
      if (stream === null || typeof stream !== 'object') {
        client.release();
        throw new Error(SESSION_TEXT.SESSION_NETWORK_COUNTER_INVALID);
      }
      setAdd(observedNetworkStreams, stream);
      try {
        return await client.query(sql, values);
      } finally {
        client.release();
      }
    }
    const observedPool = Object.freeze({query: observedQuery});
    function observeNetworkCounters() {
      let rxBytes = 0;
      let txBytes = 0;
      for (const stream of observedNetworkStreams) {
        if (
          !numberIsSafeInteger(stream.bytesRead) ||
          stream.bytesRead < 0 ||
          !numberIsSafeInteger(stream.bytesWritten) ||
          stream.bytesWritten < 0
        ) {
          throw new Error(SESSION_TEXT.SESSION_NETWORK_COUNTER_INVALID);
        }
        rxBytes += stream.bytesRead;
        txBytes += stream.bytesWritten;
      }
      if (!numberIsSafeInteger(rxBytes) || !numberIsSafeInteger(txBytes)) {
        throw new Error(SESSION_TEXT.SESSION_NETWORK_COUNTER_INVALID);
      }
      return Object.freeze({
        authority: SESSION_TEXT.SESSION_NETWORK_AUTHORITY,
        rxBytes,
        txBytes,
      });
    }
    await observedQuery(DROP_RATINGS_SQL);
    await observedQuery(CREATE_RATINGS_SQL);
    await observedQuery(DROP_CAPACITY_RESULTS_SQL);
    await observedQuery(CREATE_CAPACITY_RESULTS_SQL);
    const totalRows = await loadRatingsBytes(
      observedPool,
      config.batchSize,
      ratingsInput.bytes,
    );
    const versionResult = await observedQuery(POSTGRES_VERSION_SQL);
    const planResult = await observedQuery(
      `EXPLAIN (FORMAT JSON) ${RATINGS_TOP_QUALITY_SQL}`,
    );
    const provenance = await collectPostgresProvenance(
      provider,
      baseline,
      config.baselineImage,
    );
    const cleanupController = createPostgresSessionCleanupController({
      pool,
      initialProvenance: provenance,
      collectFinalProvenance: () => collectPostgresProvenance(
        provider,
        baseline,
        config.baselineImage,
      ),
      cleanupBaseline: () => cleanupPostgresBaseline(provider, baseline),
      unconfirmedCleanupReceipt: unconfirmedPostgresCleanup(baseline),
    });
    return Object.freeze({
      imageId: provenance.imageInspect.Id,
      imageInspection: Object.freeze({
        id: provenance.imageInspect.Id,
        repoDigests:
          Object.freeze([...provenance.imageInspect.RepoDigests]),
      }),
      inputDigest: ratingsInput.digest,
      inputSizeBytes: ratingsInput.bytes.length,
      totalRows,
      postgresVersion: versionResult.rows?.[0]?.version,
      postgresVersionSql: POSTGRES_VERSION_SQL,
      querySql: RATINGS_TOP_QUALITY_SQL,
      queryPlan: planResult.rows,
      replicationFactor: config.replicationFactor,
      replicationState: baseline.replicationState || null,
      networkId: baseline.networkId,
      networkName: baseline.networkName,
      observeNetworkCounters,
      containers: Object.freeze(
        arrayMap(baseline.containers, (container) => Object.freeze({
          containerId: container.containerId,
          ip: container.ip,
        })),
      ),
      primaryContainerId: baseline.primary.containerId,
      async executeGroupedReduce({requestId}) {
        if (cleanupController.unavailable()) {
          throw new Error(SESSION_TEXT.SESSION_CLOSED);
        }
        if (typeof requestId !== 'string' || requestId.length === 0) {
          throw new TypeError(SESSION_TEXT.REQUEST_IDENTITY_REQUIRED);
        }
        const client = await pool.connect();
        const stream = client?.connection?.stream;
        if (stream === null || typeof stream !== 'object') {
          client.release();
          throw new Error(SESSION_TEXT.SESSION_NETWORK_COUNTER_INVALID);
        }
        setAdd(observedNetworkStreams, stream);
        try {
          await client.query(BEGIN_SQL);
          const backend = await client.query(SELECT_BACKEND_PID_SQL);
          const result = await client.query(RATINGS_TOP_QUALITY_SQL);
          const durableInput = await client.query(COUNT_RATINGS_SQL);
          const observedRows =
            numberConstructor(durableInput.rows?.[0]?.row_count);
          if (observedRows !== totalRows) {
            throw new Error(SESSION_TEXT.DURABLE_INPUT_MISMATCH);
          }
          const topMovies = Object.freeze(
            arrayMap(
              projectPostgresTopMovies(result.rows || []),
              (row) => Object.freeze(row),
            ),
          );
          const resultJson = jsonStringify(topMovies);
          await client.query(
            INSERT_CAPACITY_RESULT_SQL,
            [requestId, resultJson],
          );
          await client.query(COMMIT_SQL);
          const durableResult = await client.query(
            SELECT_CAPACITY_RESULT_SQL,
            [requestId],
          );
          if (durableResult.rows?.[0]?.result_json !== resultJson) {
            throw new Error(SESSION_TEXT.DURABLE_RESULT_MISMATCH);
          }
          const durabilityDigest =
            `${SHA256_PREFIX}${createHash(SHA256_ALGORITHM)
              .update(resultJson)
              .digest(SHA256_ENCODING)}`;
          return Object.freeze({
            backendPid:
              numberConstructor(backend.rows?.[0]?.backend_pid),
            durableInputRows: observedRows,
            durableResultJson: durableResult.rows?.[0]?.result_json,
            durabilityDigest,
            durabilityPassed: true,
            requestId,
            returnedAggregateRows: result.rows?.length || 0,
            topMovies,
          });
        } catch (error) {
          try {
            await client.query(ROLLBACK_SQL);
          } catch (rollbackError) {
            throw new AggregateError(
              [error, rollbackError],
              SESSION_TEXT.OPERATION_ROLLBACK_FAILED,
            );
          }
          throw error;
        } finally {
          client.release();
        }
      },
      async resetRunState() {
        if (cleanupController.unavailable()) {
          throw new Error(SESSION_TEXT.SESSION_CLOSED);
        }
        const result = await observedQuery(COUNT_RATINGS_SQL);
        const observedRows =
          numberConstructor(result.rows?.[0]?.row_count);
        if (observedRows !== totalRows) {
          throw new Error(SESSION_TEXT.INPUT_STATE_CHANGED);
        }
        await observedQuery(DELETE_CAPACITY_RESULTS_SQL);
        const results = await observedQuery(COUNT_CAPACITY_RESULTS_SQL);
        const durableResultRows =
          numberConstructor(results.rows?.[0]?.row_count);
        if (durableResultRows !== 0) {
          throw new Error(SESSION_TEXT.CAPACITY_RESULTS_REMAIN);
        }
        return Object.freeze({
          durableResultRows,
          inputDigest: ratingsInput.digest,
          rowCount: observedRows,
          state: SESSION_TEXT.STATE_RESET,
        });
      },
      close() {
        return cleanupController.close();
      },
      forceClose() {
        return cleanupController.forceClose();
      },
    });
  } catch (error) {
    const failures = [error];
    let cleanupReceipt = unconfirmedPostgresCleanup(baseline);
    try {
      await pool?.end();
    } catch (poolCleanupError) {
      arrayPush(failures, poolCleanupError);
    }
    try {
      cleanupReceipt = await cleanupPostgresBaseline(provider, baseline);
    } catch (baselineCleanupError) {
      arrayPush(failures, baselineCleanupError);
    }
    const cause = failures.length === 1 ?
      error :
      new AggregateError(
        failures,
        SESSION_TEXT.SESSION_SETUP_CLEANUP_FAILED,
      );
    throw new PostgresBaselineFailure(cause, cleanupReceipt);
  }
}

export {
  createPostgresSessionCleanupController,
  openPostgresBaselineSession,
};
