import {mkdtemp, rm, statfs} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {DockerProvider} from
  '../../test/distributed/harness/docker-provider.js';
import {BenchmarkResourceMixedProvider} from
  '../../test/distributed/harness/benchmark-resource-mixed-provider.js';
import {
  createMovielensLagrangeCapacityAdapter,
  createMovielensPostgresqlCapacityAdapter,
  movielensCapacityOperationManifest,
  movielensCapacityOperationManifestDigest,
  movielensCapacitySemanticOracleDigest,
} from
  '../../examples/service-data-affinity/movielens-capacity-runtime-adapters.js';
import {
  startSystemdCapacityAdapter,
} from './systemd-capacity-adapter-controller.js';

const LAGRANGE_MEMORY = '2G';
const LAGRANGE_CPU = '200%';
const LAGRANGE_CPU_SET = '0,1';
const POSTGRESQL_CLIENT_MEMORY = '1G';
const POSTGRESQL_CLIENT_CPU = '100%';
const POSTGRESQL_CLIENT_CPU_SET = '2';
const POSTGRESQL_DATABASE_MEMORY = '1g';
const POSTGRESQL_DATABASE_CPU = '0.03';
const STORAGE_LIMIT_FLOOR_BYTES = 1_073_741_824;
const LAGRANGE_TASKS = 256;
const POSTGRESQL_TASKS = 128;
const mathMax = Math.max;
const localText = Object.freeze({
  CLEANUP_FAILED: 'paired MovieLens environment cleanup failed',
  DOCKER_SOCKET: '/var/run/docker.sock',
  LAGRANGE_CHILD:
    'scripts/checks/movielens-lagrange-capacity-adapter-child.js',
  LAGRANGE_NODE: 'lagrange-node',
  POSTGRESQL_CHILD:
    'scripts/checks/movielens-postgresql-capacity-adapter-child.js',
  POSTGRESQL_CLIENT: 'postgresql-client',
  POSTGRESQL_DATABASE: 'postgresql-database',
  POSTGRESQL_STORAGE: '/var/lib/postgresql/data',
  LAGRANGE_NETWORK_AUTHORITY: 'lagrange_public_http_payload_bytes',
  POSTGRESQL_NETWORK_AUTHORITY: 'postgresql_client_socket_bytes',
});

async function storageCapacity(storagePath) {
  const stats = await statfs(storagePath);
  return mathMax(
    STORAGE_LIMIT_FLOOR_BYTES,
    stats.blocks * stats.bsize,
  );
}

function remoteLagrangeSession(controller) {
  const metadata = controller.metadata;
  return {
    alternative: metadata.alternative,
    artifact: metadata.artifact,
    dataset: metadata.dataset,
    prepared: {
      deployment: metadata.deployment,
      executeCapacityOperation(operation, signal) {
        return controller.execute(operation, signal);
      },
      resetRunState() {
        return controller.reset();
      },
    },
  };
}

function remotePostgresqlSession(controller) {
  return {
    ...controller.metadata,
    executeGroupedReduce(operation, signal) {
      return controller.execute(operation, signal);
    },
    resetRunState() {
      return controller.reset();
    },
  };
}

export async function cleanupMovielensPairedCapacityEnvironment({
  lagrange,
  postgresql,
  postgresqlClientStoragePath,
  primaryError = null,
}) {
  const receipts = {};
  const errors = [];
  if (primaryError !== null) errors.push(primaryError);
  if (lagrange !== null) {
    try {
      receipts.lagrange = await lagrange.close();
    } catch (error) {
      errors.push(error);
    }
  }
  if (postgresql !== null) {
    try {
      receipts.postgresql = await postgresql.close();
    } catch (error) {
      errors.push(error);
    }
  }
  try {
    await rm(postgresqlClientStoragePath, {
      recursive: true,
      force: true,
    });
  } catch (error) {
    errors.push(error);
  }
  const cleanupErrorCount =
    errors.length - (primaryError === null ? 0 : 1);
  if (cleanupErrorCount > 0) {
    throw new AggregateError(
      errors,
      localText.CLEANUP_FAILED,
    );
  }
  if (primaryError !== null) throw primaryError;
  return receipts;
}

function liveComponents(environment) {
  const primary = environment.postgresql.metadata.primaryContainerId;
  return [
    {
      sideId: environment.sideIds[0],
      componentId: localText.LAGRANGE_NODE,
      containerId: environment.lagrangeResourceId,
      storagePath:
        environment.lagrange.metadata.runtimeObservation.storagePath,
    },
    {
      sideId: environment.sideIds[1],
      componentId: localText.POSTGRESQL_DATABASE,
      containerId: primary,
      storagePath: localText.POSTGRESQL_STORAGE,
    },
    {
      sideId: environment.sideIds[1],
      componentId: localText.POSTGRESQL_CLIENT,
      containerId: environment.postgresqlResourceId,
      storagePath: environment.postgresqlClientStoragePath,
    },
  ];
}

export async function openMovielensPairedCapacityLiveEnvironment({
  runId,
  sideIds,
  dataset,
  workingDirectory,
}) {
  const postgresqlClientStoragePath = await mkdtemp(
    path.join(os.tmpdir(), 'movielens-capacity-postgresql-client-'),
  );
  let lagrange = null;
  let postgresql = null;
  try {
    lagrange = await startSystemdCapacityAdapter({
      unit: `movielens-lagrange-${process.pid}-${Date.now()}`,
      workingDirectory,
      scriptPath: path.resolve(
        workingDirectory,
        localText.LAGRANGE_CHILD,
      ),
      memoryMax: LAGRANGE_MEMORY,
      cpuQuota: LAGRANGE_CPU,
      cpuSet: LAGRANGE_CPU_SET,
      tasksMax: LAGRANGE_TASKS,
      startOptions: {
        ratingsPath: dataset.path,
        datasetIdentity: {
          cardinality: dataset.cardinality,
          digest: dataset.digest,
          sizeBytes: dataset.bytes.length,
          source: dataset.source,
        },
        componentSourcePath: dataset.componentSourcePath,
        replicationFactor: 1,
      },
    });
    postgresql = await startSystemdCapacityAdapter({
      unit: `movielens-postgresql-${process.pid}-${Date.now()}`,
      workingDirectory,
      scriptPath: path.resolve(
        workingDirectory,
        localText.POSTGRESQL_CHILD,
      ),
      memoryMax: POSTGRESQL_CLIENT_MEMORY,
      cpuQuota: POSTGRESQL_CLIENT_CPU,
      cpuSet: POSTGRESQL_CLIENT_CPU_SET,
      tasksMax: POSTGRESQL_TASKS,
      startOptions: {
        ratingsPath: dataset.path,
        ratingsDigest: dataset.digest,
        replicationFactor: 1,
        poolSize: 1,
        resourceLimits: {
          memory: POSTGRESQL_DATABASE_MEMORY,
          cpus: POSTGRESQL_DATABASE_CPU,
        },
      },
    });
    const lagrangeResourceId = `systemd:${lagrange.unit}`;
    const postgresqlResourceId = `systemd:${postgresql.unit}`;
    const cgroups = [
      {
        resourceId: lagrangeResourceId,
        cgroupPath: lagrange.cgroupPath,
        storagePath: lagrange.metadata.runtimeObservation.storagePath,
        storageLimitBytes: await storageCapacity(
          lagrange.metadata.runtimeObservation.storagePath,
        ),
        cpuLimitNanoCpus: 2_000_000_000,
        networkObservation: {
          authority: localText.LAGRANGE_NETWORK_AUTHORITY,
          read: () => lagrange.observeNetworkCounters(),
        },
      },
      {
        resourceId: postgresqlResourceId,
        cgroupPath: postgresql.cgroupPath,
        storagePath: postgresqlClientStoragePath,
        storageLimitBytes:
          await storageCapacity(postgresqlClientStoragePath),
        cpuLimitNanoCpus: 1_000_000_000,
        networkObservation: {
          authority: localText.POSTGRESQL_NETWORK_AUTHORITY,
          read: () => postgresql.observeNetworkCounters(),
        },
      },
    ];
    const environment = {
      runId,
      sideIds,
      lagrange,
      postgresql,
      lagrangeResourceId,
      postgresqlResourceId,
      postgresqlClientStoragePath,
    };
    const operationManifestDataset = {
      cardinality: dataset.cardinality,
      digest: dataset.digest,
      sizeBytes: dataset.bytes.length,
      source: dataset.source,
    };
    const operationManifest = movielensCapacityOperationManifest(
      operationManifestDataset,
      postgresql.metadata.querySql,
    );
    const operationManifestDigest =
      movielensCapacityOperationManifestDigest(
        operationManifestDataset,
        postgresql.metadata.querySql,
      );
    const semanticOracleDigest =
      movielensCapacitySemanticOracleDigest(
        lagrange.metadata.alternative,
      );
    let closePromise = null;
    return {
      ...environment,
      operationManifestDigest,
      semanticOracleDigest,
      provider: new BenchmarkResourceMixedProvider({
        containerProvider: new DockerProvider({
          socketPath: localText.DOCKER_SOCKET,
        }),
        cgroups,
      }),
      components: liveComponents(environment),
      adapters: [
        createMovielensLagrangeCapacityAdapter({
          session: remoteLagrangeSession(lagrange),
          sideId: sideIds[0],
          operationManifest,
          semanticOracleDigest,
        }),
        createMovielensPostgresqlCapacityAdapter({
          session: remotePostgresqlSession(postgresql),
          sideId: sideIds[1],
          operationManifest,
          semanticOracleDigest,
        }),
      ],
      networkId: postgresql.metadata.networkId,
      networkName: postgresql.metadata.networkName,
      close() {
        if (closePromise === null) {
          closePromise = cleanupMovielensPairedCapacityEnvironment({
            lagrange,
            postgresql,
            postgresqlClientStoragePath,
          });
        }
        return closePromise;
      },
    };
  } catch (error) {
    return cleanupMovielensPairedCapacityEnvironment({
      lagrange,
      postgresql,
      postgresqlClientStoragePath,
      primaryError: error,
    });
  }
}
