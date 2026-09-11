const DEFAULTS = Object.freeze({
  // TiDB 8.5 is the current LTS line; pin the exact patch so benchmark
  // comparisons do not silently change underneath historical evidence.
  pdImage: 'pingcap/pd:v8.5.8',
  tikvImage: 'pingcap/tikv:v8.5.8',
  tidbImage: 'pingcap/tidb:v8.5.8',
  pdClientPort: 2379,
  pdPeerPort: 2380,
  tikvPort: 20160,
  tidbPort: 4000,
  tidbStatusPort: 10080,
  readinessTimeoutMs: 120000,
  readinessPollIntervalMs: 1000,
});

const ZERO = 0;

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
  return {
    provider,
    network,
    resourceLimits: options.resourceLimits || {},
    images: {
      pd: options.images?.pd || DEFAULTS.pdImage,
      tikv: options.images?.tikv || DEFAULTS.tikvImage,
      tidb: options.images?.tidb || DEFAULTS.tidbImage,
    },
    readinessTimeoutMs:
      options.readinessTimeoutMs || DEFAULTS.readinessTimeoutMs,
    readinessPollIntervalMs:
      options.readinessPollIntervalMs || DEFAULTS.readinessPollIntervalMs,
    namePrefix: options.namePrefix || 'tidb-reference',
  };
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
  };
  const runningOptions = {
    timeoutMs: options.readinessTimeoutMs,
    pollIntervalMs: options.readinessPollIntervalMs,
  };

  try {
    const pd = await options.provider.createContainer({
      name: names.pd,
      image: options.images.pd,
      network: options.network,
      resourceLimits: options.resourceLimits,
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
    await options.provider.startContainer(pd.containerId);
    await waitForContainerRunning(options.provider, pd.containerId, runningOptions);

    const tikv = await options.provider.createContainer({
      name: names.tikv,
      image: options.images.tikv,
      network: options.network,
      resourceLimits: options.resourceLimits,
      command: [
        `--addr=0.0.0.0:${DEFAULTS.tikvPort}`,
        `--advertise-addr=${names.tikv}:${DEFAULTS.tikvPort}`,
        `--pd=${names.pd}:${DEFAULTS.pdClientPort}`,
      ],
    });
    created.push(tikv);
    await options.provider.startContainer(tikv.containerId);
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
      command: [
        '--store=tikv',
        `--path=${names.pd}:${DEFAULTS.pdClientPort}`,
        '--host=0.0.0.0',
        `--port=${DEFAULTS.tidbPort}`,
        `--status=${DEFAULTS.tidbStatusPort}`,
      ],
    });
    created.push(tidb);
    await options.provider.startContainer(tidb.containerId);
    await waitForContainerRunning(
      options.provider,
      tidb.containerId,
      runningOptions,
    );

    return {
      images: options.images,
      names,
      containers: {pd, tikv, tidb},
      endpoints: {
        mysql: {host: names.tidb, port: DEFAULTS.tidbPort},
        status: {host: names.tidb, port: DEFAULTS.tidbStatusPort},
        pd: {host: names.pd, port: DEFAULTS.pdClientPort},
      },
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
  normalizeOptions as normalizeTiDbReferenceLifecycleOptions,
  startTiDbReferenceCluster,
  stopTiDbReferenceCluster,
  waitForContainerRunning as waitForTiDbReferenceContainerRunning,
};
