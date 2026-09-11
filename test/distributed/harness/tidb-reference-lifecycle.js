const DEFAULTS = Object.freeze({
  // TiDB 8.5 is the current LTS line; pin the exact patch so benchmark
  // comparisons do not silently change underneath historical evidence.
  pdImage: 'pingcap/pd:v8.5.8',
  tikvImage: 'pingcap/tikv:v8.5.8',
  tidbImage: 'pingcap/tidb:v8.5.8',
  // Readiness uses an ephemeral client container. It is never part of the
  // measured topology, but is pinned so the readiness contract is reproducible.
  mysqlClientImage: 'mysql:8.4.11',
  pdClientPort: 2379,
  pdPeerPort: 2380,
  tikvPort: 20160,
  tidbPort: 4000,
  tidbStatusPort: 10080,
  readinessTimeoutMs: 120000,
  readinessPollIntervalMs: 1000,
});

const ZERO = 0;
const READY_VALUE = '1';
const READINESS_CLIENT_KEEPALIVE_SECONDS = '300';
const READINESS_SQL =
  'SELECT CASE WHEN ' +
  'EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TIKV_STORE_STATUS ' +
  "WHERE STORE_STATE_NAME = 'Up') " +
  'AND (SELECT COUNT(*) FROM mysql.user) >= 1 ' +
  'THEN 1 ELSE 0 END;';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeOptions(options = {}) {
  const provider = options.provider;
  if (!provider) {
    throw new Error('TiDB reference lifecycle requires provider');
  }
  const network = options.network;
  if (!network) {
    throw new Error('TiDB reference lifecycle requires network');
  }
  if (typeof provider.execInContainer !== 'function') {
    throw new Error(
      'TiDB reference lifecycle requires provider.execInContainer for SQL readiness',
    );
  }
  return {
    provider,
    network,
    resourceLimits: options.resourceLimits || {},
    readinessResourceLimits: options.readinessResourceLimits || {},
    images: {
      pd: options.images?.pd || DEFAULTS.pdImage,
      tikv: options.images?.tikv || DEFAULTS.tikvImage,
      tidb: options.images?.tidb || DEFAULTS.tidbImage,
      mysqlClient:
        options.images?.mysqlClient || DEFAULTS.mysqlClientImage,
    },
    readinessTimeoutMs:
      options.readinessTimeoutMs || DEFAULTS.readinessTimeoutMs,
    readinessPollIntervalMs:
      options.readinessPollIntervalMs || DEFAULTS.readinessPollIntervalMs,
    namePrefix: options.namePrefix || 'tidb-reference',
  };
}

function networkHostConfig(network) {
  return {NetworkMode: network};
}

async function waitForContainerRunning(provider, containerId, options) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < options.timeoutMs) {
    try {
      const state = await provider.inspectContainer(containerId);
      if (state?.State?.Running === true) return state;
    } catch (error) {
      lastError = error;
    }
    await sleep(options.pollIntervalMs);
  }
  throw new Error(
    `TiDB reference container ${containerId} was not running within ` +
    `${options.timeoutMs}ms` +
    (lastError ? `: ${lastError.message}` : ''),
  );
}

function buildSqlReadinessCommand(endpoint) {
  return [
    'mysql',
    '--protocol=TCP',
    `--host=${endpoint.host}`,
    `--port=${endpoint.port}`,
    '--user=root',
    '--connect-timeout=2',
    '--batch',
    '--skip-column-names',
    '--execute',
    READINESS_SQL,
  ];
}

async function waitForSqlReady(provider, clientContainerId, endpoint, options) {
  const started = Date.now();
  let lastError = null;
  let lastResult = null;
  let attempts = ZERO;
  const command = buildSqlReadinessCommand(endpoint);

  while (Date.now() - started < options.timeoutMs) {
    attempts += 1;
    try {
      const result = await provider.execInContainer(clientContainerId, command);
      lastResult = result;
      if (result?.exitCode === ZERO &&
          String(result.stdout || '').trim() === READY_VALUE) {
        return {
          attempts,
          sql: READINESS_SQL,
          clientContainerId,
        };
      }
    } catch (error) {
      lastError = error;
    }
    await sleep(options.pollIntervalMs);
  }

  const detail = lastError ?
    lastError.message :
    `exit=${lastResult?.exitCode ?? 'unknown'} ` +
      `stdout=${JSON.stringify(lastResult?.stdout || '')} ` +
      `stderr=${JSON.stringify(lastResult?.stderr || '')}`;
  throw new Error(
    `TiDB reference SQL readiness failed within ${options.timeoutMs}ms: ${detail}`,
  );
}

async function stopTiDbReferenceCluster(provider, created) {
  const failures = [];
  for (let index = created.length - 1; index >= ZERO; index -= 1) {
    const container = created[index];
    try {
      const inspect = await provider.inspectContainer(container.containerId);
      if (inspect?.State?.Running === true) {
        await provider.stopContainer(container.containerId);
      }
    } catch (error) {
      failures.push(error);
    }
    try {
      await provider.removeContainer(container.containerId);
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > ZERO) {
    const message = failures.map((error) => error.message).join('; ');
    throw new Error(`TiDB reference cleanup failed: ${message}`);
  }
}

async function startTiDbReferenceCluster(rawOptions = {}) {
  const options = normalizeOptions(rawOptions);
  const created = [];
  const names = {
    pd: `${options.namePrefix}-pd`,
    tikv: `${options.namePrefix}-tikv`,
    tidb: `${options.namePrefix}-tidb`,
    readiness: `${options.namePrefix}-sql-readiness`,
  };
  const runningOptions = {
    timeoutMs: options.readinessTimeoutMs,
    pollIntervalMs: options.readinessPollIntervalMs,
  };

  try {
    // DockerProvider.createContainer is the lifecycle owner for create + start
    // + running-state wait. This adapter must not issue a second start.
    // Explicit NetworkMode is required for Docker's embedded DNS aliases to be
    // active on the user-defined benchmark network; NetworkingConfig alone is
    // not a sufficient contract for this provider.
    const pd = await options.provider.createContainer({
      name: names.pd,
      image: options.images.pd,
      network: options.network,
      resourceLimits: options.resourceLimits,
      hostConfigExtras: networkHostConfig(options.network),
      command: [
        '--name=pd',
        `--client-urls=http://0.0.0.0:${DEFAULTS.pdClientPort}`,
        `--peer-urls=http://0.0.0.0:${DEFAULTS.pdPeerPort}`,
        `--advertise-client-urls=http://${names.pd}:${DEFAULTS.pdClientPort}`,
        `--advertise-peer-urls=http://${names.pd}:${DEFAULTS.pdPeerPort}`,
        `--initial-cluster=pd=http://${names.pd}:${DEFAULTS.pdPeerPort}`,
      ],
    });
    created.push(pd);
    await waitForContainerRunning(options.provider, pd.containerId, runningOptions);

    const tikv = await options.provider.createContainer({
      name: names.tikv,
      image: options.images.tikv,
      network: options.network,
      resourceLimits: options.resourceLimits,
      hostConfigExtras: networkHostConfig(options.network),
      command: [
        `--addr=0.0.0.0:${DEFAULTS.tikvPort}`,
        `--advertise-addr=${names.tikv}:${DEFAULTS.tikvPort}`,
        `--pd=${names.pd}:${DEFAULTS.pdClientPort}`,
      ],
    });
    created.push(tikv);
    await waitForContainerRunning(
      options.provider,
      tikv.containerId,
      runningOptions,
    );

    const tidb = await options.provider.createContainer({
      name: names.tidb,
      image: options.images.tidb,
      network: options.network,
      resourceLimits: options.resourceLimits,
      hostConfigExtras: networkHostConfig(options.network),
      command: [
        '--store=tikv',
        `--path=${names.pd}:${DEFAULTS.pdClientPort}`,
        '--host=0.0.0.0',
        `-P=${DEFAULTS.tidbPort}`,
        `--status=${DEFAULTS.tidbStatusPort}`,
      ],
    });
    created.push(tidb);
    await waitForContainerRunning(
      options.provider,
      tidb.containerId,
      runningOptions,
    );

    const readinessClient = await options.provider.createContainer({
      name: names.readiness,
      image: options.images.mysqlClient,
      network: options.network,
      resourceLimits: options.readinessResourceLimits,
      hostConfigExtras: networkHostConfig(options.network),
      entrypoint: ['sleep'],
      command: [READINESS_CLIENT_KEEPALIVE_SECONDS],
    });
    created.push(readinessClient);
    await waitForContainerRunning(
      options.provider,
      readinessClient.containerId,
      runningOptions,
    );

    let readiness;
    try {
      readiness = await waitForSqlReady(
        options.provider,
        readinessClient.containerId,
        {host: names.tidb, port: DEFAULTS.tidbPort},
        runningOptions,
      );
    } finally {
      await stopTiDbReferenceCluster(options.provider, [readinessClient]);
      created.pop();
    }

    return {
      images: options.images,
      names,
      containers: {pd, tikv, tidb},
      endpoints: {
        mysql: {host: names.tidb, port: DEFAULTS.tidbPort},
        status: {host: names.tidb, port: DEFAULTS.tidbStatusPort},
        pd: {host: names.pd, port: DEFAULTS.pdClientPort},
      },
      readiness,
      async stop() {
        await stopTiDbReferenceCluster(options.provider, created);
      },
    };
  } catch (error) {
    try {
      await stopTiDbReferenceCluster(options.provider, created);
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'TiDB reference startup and cleanup both failed',
      );
    }
    throw error;
  }
}

export {
  DEFAULTS as TIDB_REFERENCE_DEFAULTS,
  READINESS_SQL as TIDB_REFERENCE_READINESS_SQL,
  buildSqlReadinessCommand as buildTiDbReferenceSqlReadinessCommand,
  normalizeOptions as normalizeTiDbReferenceLifecycleOptions,
  startTiDbReferenceCluster,
  stopTiDbReferenceCluster,
  waitForContainerRunning as waitForTiDbReferenceContainerRunning,
  waitForSqlReady as waitForTiDbReferenceSqlReady,
};
