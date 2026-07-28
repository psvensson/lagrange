import {DockerProvider} from
  '../../test/distributed/harness/docker-provider.js';
import {
  shellQuote,
  waitForPostgresReady,
} from '../../test/distributed/harness/pgbench-runner.js';
import {
  BENCHMARK_RESOURCE_BILLING_TREATMENT,
  BENCHMARK_RESOURCE_COMPONENT_ROLE,
} from
  '../../test/distributed/harness/benchmark-resource-contract-constants.js';
import {
  beginBenchmarkResourceLiveObservation,
  captureBenchmarkResourceLiveObservation,
  deriveBenchmarkResourceLiveComponentAccounting,
  finalizeBenchmarkResourceLiveObservation,
  writeExternallyObservedBenchmarkResourceCalibration,
} from
  '../../test/distributed/harness/benchmark-resource-live-observation-authority.js';
import {
  BENCHMARK_RESOURCE_P0_PRICE_SHEET,
} from
  '../../test/distributed/harness/benchmark-resource-price-sheet-p0-constants.js';
import {
  COMPARATIVE_POSTGRES_IMAGE,
} from './comparative-efficiency-postgres-nonmeasuring-live-constants.js';
import {
  collectBenchmarkResourceSourceProvenance,
} from './benchmark-resource-source-provenance.js';

export const COMPARATIVE_POSTGRES_PRICE_SHEET =
  BENCHMARK_RESOURCE_P0_PRICE_SHEET;
export {
  COMPARATIVE_POSTGRES_IMAGE,
} from './comparative-efficiency-postgres-nonmeasuring-live-constants.js';

const DATABASE = 'postgres';
const POSTGRES_USER = 'postgres';
const RESOURCE_MEMORY = '256m';
const RESOURCE_CPUS = '1.0';
const DATABASE_STORAGE_BYTES = 128 * 1024 * 1024;
const DATABASE_STORAGE_PATH = '/var/lib/postgresql/data';
const CLIENT_STORAGE_PATH = '/tmp';
const START_TIMEOUT_MS = 30_000;
const EVIDENCE_VALIDITY_MS = 24 * 60 * 60 * 1_000;
const LAGRANGE_SIDE = 'lagrange';
const POSTGRES_SIDE = 'postgresql';
const LAGRANGE_COMPONENT = 'lagrange-node';
const DATABASE_COMPONENT = 'postgresql-database';
const CLIENT_COMPONENT = 'postgresql-client';
const NONE = 'none';
const PSQL_ARGUMENTS = 'psql -v ON_ERROR_STOP=1 -qAt ';
const SLEEP = 'sleep';
const INFINITY = 'infinity';
const stringTrim = Function.call.bind(String.prototype.trim);
const localText = Object.freeze({
  REQUIRED_IMAGE: 'required live image unavailable: ',
  MISSING_COMPONENT: 'missing observed component ',
});

function psqlCommand(password, host, sql) {
  return (
    `PGPASSWORD='${shellQuote(password)}' ` +
    PSQL_ARGUMENTS +
    `-h '${shellQuote(host)}' -U '${POSTGRES_USER}' ` +
    `-d '${DATABASE}' -c '${shellQuote(sql)}'`
  );
}

function databaseOptions(config, networkId) {
  return {
    name: `${config.runId}-postgresql`,
    image: COMPARATIVE_POSTGRES_IMAGE,
    network: networkId,
    env: {
      POSTGRES_PASSWORD: config.password,
      POSTGRES_DB: DATABASE,
    },
    labels: config.labels,
    resourceLimits: {memory: RESOURCE_MEMORY, cpus: RESOURCE_CPUS},
    hostConfigExtras: {
      Tmpfs: {
        [DATABASE_STORAGE_PATH]:
          `rw,size=${DATABASE_STORAGE_BYTES}`,
      },
    },
    startTimeout: START_TIMEOUT_MS,
  };
}

async function createDatabase(provider, config, networkId) {
  const container = await provider.createContainer(
    databaseOptions(config, networkId),
  );
  await waitForPostgresReady(provider, container.containerId, {
    user: POSTGRES_USER,
    database: DATABASE,
    timeoutMs: START_TIMEOUT_MS,
  });
  return container;
}

function clientOptions(config, networkId) {
  return {
    name: `${config.runId}-client`,
    image: COMPARATIVE_POSTGRES_IMAGE,
    network: networkId,
    labels: config.labels,
    resourceLimits: {memory: RESOURCE_MEMORY, cpus: RESOURCE_CPUS},
    command: [SLEEP, INFINITY],
    startTimeout: START_TIMEOUT_MS,
  };
}

async function createClient(provider, config, networkId) {
  return provider.createContainer(clientOptions(config, networkId));
}

async function removeIfPresent(provider, containerId) {
  if (
    containerId &&
    await provider.inspectContainerIfExists(containerId) !== null
  ) {
    await provider.removeContainer(containerId);
  }
}

async function cleanup(provider, config, state) {
  const containers = [state.client, state.database];
  for (let index = 0; index < containers.length; index += 1) {
    await removeIfPresent(provider, containers[index]?.containerId);
  }
  if (
    state.networkId &&
    await provider.getNetworkByName(config.networkName) !== null
  ) {
    await provider.removeNetwork(state.networkId);
  }
}

function observationComponents(state) {
  return [
    {
      componentId: DATABASE_COMPONENT,
      sideId: POSTGRES_SIDE,
      containerId: state.database.containerId,
      storagePath: DATABASE_STORAGE_PATH,
    },
    {
      componentId: CLIENT_COMPONENT,
      sideId: POSTGRES_SIDE,
      containerId: state.client.containerId,
      storagePath: CLIENT_STORAGE_PATH,
    },
  ];
}

async function executeSql(provider, config, state, sql, failurePrefix) {
  const result = await provider.execInContainer(
    state.client.containerId,
    ['sh', '-lc', psqlCommand(config.password, state.database.ip, sql)],
  );
  if (result.exitCode !== 0) {
    throw new Error(`${failurePrefix}${result.stderr}`);
  }
  return normalizeComparativePostgresOutput(result.stdout);
}

export function normalizeComparativePostgresOutput(output) {
  return stringTrim(output);
}

async function executeObservedMatrix(
  provider,
  config,
  state,
  sourceRevision,
  executeMatrix,
) {
  const image = await provider.inspectImage(COMPARATIVE_POSTGRES_IMAGE);
  if (!image) {
    throw new Error(
      localText.REQUIRED_IMAGE + COMPARATIVE_POSTGRES_IMAGE,
    );
  }
  const network =
    await provider.createNetwork(config.networkName, config.labels);
  state.networkId = network.id;
  state.database = await createDatabase(provider, config, state.networkId);
  state.client = await createClient(provider, config, state.networkId);
  const session =
    await beginBenchmarkResourceLiveObservation(provider, {
      runId: config.runId,
      networkId: state.networkId,
      networkName: config.networkName,
      sourceRevision,
      components: observationComponents(state),
    });
  const attempts = await executeMatrix({
    executeSql(sql, failurePrefix) {
      return executeSql(
        provider,
        config,
        state,
        sql,
        failurePrefix,
      );
    },
    imageId: image.Id,
    databaseContainerId: state.database.containerId,
    clientContainerId: state.client.containerId,
  });
  await captureBenchmarkResourceLiveObservation(session);
  await cleanup(provider, config, state);
  return {attempts, imageId: image.Id, session};
}

export function createComparativePostgresLiveRuntime(config) {
  const provider = new DockerProvider();
  const state = {networkId: null, database: null, client: null};
  return Object.freeze({
    async runObservedMatrix(sourceRevision, executeMatrix) {
      try {
        return await executeObservedMatrix(
          provider,
          config,
          state,
          sourceRevision,
          executeMatrix,
        );
      } catch (error) {
        await cleanup(provider, config, state);
        throw error;
      }
    },
  });
}

export async function finalizeComparativePostgresObservation(session) {
  const finalized =
    await finalizeBenchmarkResourceLiveObservation(session);
  const calibration =
    writeExternallyObservedBenchmarkResourceCalibration(
      finalized.receipt,
      finalized.authorization,
    );
  return {finalized, calibration};
}

export async function startComparativePostgresLiveRun({
  runtimeConfig,
  sourcePaths,
  executeMatrix,
}) {
  const runtime = createComparativePostgresLiveRuntime(runtimeConfig);
  const provenance =
    await collectBenchmarkResourceSourceProvenance(sourcePaths);
  const {attempts, imageId, session} =
    await runtime.runObservedMatrix(
      provenance.sourceRevision,
      executeMatrix,
    );
  const {finalized, calibration} =
    await finalizeComparativePostgresObservation(session);
  const producedAt = new Date().toISOString();
  const validUntil =
    new Date(
      Date.parse(producedAt) + EVIDENCE_VALIDITY_MS,
    ).toISOString();
  return {
    attempts,
    imageId,
    finalized,
    calibration,
    producedAt,
    validUntil,
    provenance,
    sideIds: [LAGRANGE_SIDE, POSTGRES_SIDE],
  };
}

function observedComponent(calibration, componentId) {
  const components = calibration.artifact.payload.components;
  for (let index = 0; index < components.length; index += 1) {
    if (components[index].componentId === componentId) {
      return components[index];
    }
  }
  throw new Error(localText.MISSING_COMPONENT + componentId);
}

function inventoryShape({
  componentId,
  role,
  provisioned,
  minimumFootprint,
  reservedHeadroomRatio,
}) {
  return {
    componentId,
    role,
    billingTreatment: BENCHMARK_RESOURCE_BILLING_TREATMENT.INCLUDED,
    provisioned,
    minimumFootprint,
    reservedHeadroomRatio,
    exclusionReason: NONE,
  };
}

function observedInventoryComponent(componentId, role, calibration) {
  const accounting = deriveBenchmarkResourceLiveComponentAccounting(
    observedComponent(calibration, componentId),
  );
  return inventoryShape({
    componentId,
    role,
    provisioned: accounting.provisioned,
    minimumFootprint: accounting.minimumFootprint,
    reservedHeadroomRatio: accounting.reservedHeadroomRatio,
  });
}

function absentCandidateInventory() {
  return inventoryShape({
    componentId: LAGRANGE_COMPONENT,
    role: BENCHMARK_RESOURCE_COMPONENT_ROLE.LAGRANGE_NODE,
    provisioned: {
      cpuCores: 0,
      memoryBytes: 0,
      storageBytes: 0,
      iops: 0,
      networkBytesPerSecond: 0,
    },
    minimumFootprint: {
      instances: 0,
      cpuCores: 0,
      memoryBytes: 0,
      storageBytes: 0,
    },
    reservedHeadroomRatio: 0,
  });
}

export function comparativePostgresInventorySides(calibration) {
  return [
    {
      sideId: LAGRANGE_SIDE,
      components: [absentCandidateInventory()],
    },
    {
      sideId: POSTGRES_SIDE,
      components: [
        observedInventoryComponent(
          DATABASE_COMPONENT,
          BENCHMARK_RESOURCE_COMPONENT_ROLE.DATABASE,
          calibration,
        ),
        observedInventoryComponent(
          CLIENT_COMPONENT,
          BENCHMARK_RESOURCE_COMPONENT_ROLE.CLIENT,
          calibration,
        ),
      ],
    },
  ];
}
