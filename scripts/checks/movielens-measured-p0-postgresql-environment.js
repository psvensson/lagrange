import {
  createMovielensPostgresqlCapacityAdapter,
  movielensCapacityOperationManifest,
  movielensCapacityOperationManifestDigest,
  movielensCapacitySemanticOracleDigest,
} from
  '../../examples/service-data-affinity/movielens-capacity-runtime-adapters.js';
import {
  loadMovielensPublicRequestDatasetVariant,
} from
  '../../examples/service-data-affinity/movielens-public-request-workload-dataset.js';
import {
  openPostgresBaselineSession,
} from
  '../../examples/service-data-affinity/postgres-baseline-session.js';
import {
  digestBenchmarkSemanticData,
} from
  '../../test/distributed/harness/benchmark-semantic-integrity.js';
import {
  MOVIELENS_MEASURED_P0_SIDE_IDS,
} from
  '../../test/distributed/harness/comparative-efficiency-movielens-measured-p0-constants.js';
import {
  DOCKER_CONTAINER_WRITABLE_LAYER_STORAGE_PATH,
  DockerProvider,
} from '../../test/distributed/harness/docker-provider.js';

const DOCKER_SOCKET = '/var/run/docker.sock';
const CONTAINER_MEMORY_LIMIT = '2g';
const CONTAINER_CPU_LIMIT = '1.0';
const POSTGRESQL_SIDE_ID = MOVIELENS_MEASURED_P0_SIDE_IDS[1];
const POSTGRES_COMPONENT_PREFIX = 'postgresql-node-';
const objectFreeze = Object.freeze;
const arrayPush = Function.call.bind(Array.prototype.push);
const localText = objectFreeze({
  CLEANUP_FAILED: 'PostgreSQL comparator environment cleanup failed',
  PROVISIONING_MODE: 'postgresql_comparator_only',
  SEALED_PREFLIGHT_MISMATCH:
    'PostgreSQL comparator environment differs from its sealed preflight',
});

function fail(reason) {
  throw new Error(`MovieLens PostgreSQL comparator failed: ${reason}`);
}

function postgresSeal(postgres) {
  return {
    imageId: postgres.imageId,
    imageInspection: postgres.imageInspection,
    postgresVersion: postgres.postgresVersion,
    postgresVersionSql: postgres.postgresVersionSql,
    queryPlan: postgres.queryPlan,
    querySql: postgres.querySql,
    replicationFactor: postgres.replicationFactor,
    replicationState: postgres.replicationState,
  };
}

function planningArtifact(dataset) {
  const identity = {
    purpose: 'postgresql-comparator-planning-placeholder',
    componentSourceDigest: dataset.componentSourceDigest,
  };
  const digest = digestBenchmarkSemanticData(identity);
  return objectFreeze({
    buildInputFingerprint: digest,
    componentSourceDigest: dataset.componentSourceDigest,
    executableDigest: digest,
    ociManifestDigest: digest,
  });
}

function postgresqlSeal({
  dataset,
  loadedDataset,
  postgres,
  alternative,
  includePlanningArtifact,
}) {
  const operationManifest = movielensCapacityOperationManifest(
    loadedDataset,
    postgres.querySql,
  );
  const body = {
    dataset: objectFreeze({
      cardinality: dataset.cardinality,
      componentSourceDigest: dataset.componentSourceDigest,
      digest: dataset.digest,
      sizeBytes: dataset.bytes.length,
      skew: dataset.skew,
    }),
    alternative,
    operationManifest,
    operationManifestDigest:
      movielensCapacityOperationManifestDigest(
        loadedDataset,
        postgres.querySql,
      ),
    semanticOracleDigest:
      movielensCapacitySemanticOracleDigest(alternative),
    postgres: objectFreeze(postgresSeal(postgres)),
  };
  return objectFreeze(includePlanningArtifact ?
    {...body, artifact: planningArtifact(dataset)} :
    body);
}

function expectedPostgresqlSeal(expectedSeal) {
  if (expectedSeal === undefined) return null;
  return objectFreeze({
    dataset: expectedSeal.dataset,
    alternative: expectedSeal.alternative,
    operationManifest: expectedSeal.operationManifest,
    operationManifestDigest: expectedSeal.operationManifestDigest,
    semanticOracleDigest: expectedSeal.semanticOracleDigest,
    postgres: expectedSeal.postgres,
  });
}

function resourceComponents(postgres) {
  const components = [];
  for (let index = 0; index < postgres.containers.length; index += 1) {
    arrayPush(components, {
      sideId: POSTGRESQL_SIDE_ID,
      componentId: `${POSTGRES_COMPONENT_PREFIX}${index + 1}`,
      containerId: postgres.containers[index].containerId,
      storagePath: DOCKER_CONTAINER_WRITABLE_LAYER_STORAGE_PATH,
    });
  }
  return components;
}

async function openSession(dataset, replicationFactor) {
  return openPostgresBaselineSession({
    ratingsBytes: dataset.bytes,
    ratingsDigest: dataset.digest,
    replicationFactor,
    poolSize: 1,
    resourceLimits: {
      memory: CONTAINER_MEMORY_LIMIT,
      cpus: CONTAINER_CPU_LIMIT,
    },
  });
}

async function prepareSeal({
  runId,
  dataset,
  replicationFactor,
  includePlanningArtifact,
}) {
  const loadedDataset =
    await loadMovielensPublicRequestDatasetVariant(
      dataset.path,
      dataset,
    );
  const postgres = await openSession(dataset, replicationFactor);
  try {
    const oracleOperation = await postgres.executeGroupedReduce({
      requestId: `${runId}-postgresql-comparator-oracle`,
    });
    await postgres.resetRunState();
    const alternative = objectFreeze({
      topMovies: oracleOperation.topMovies,
    });
    return {
      postgres,
      loadedDataset,
      seal: postgresqlSeal({
        dataset,
        loadedDataset,
        postgres,
        alternative,
        includePlanningArtifact,
      }),
    };
  } catch (error) {
    try {
      await postgres.close();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        localText.CLEANUP_FAILED,
      );
    }
    throw error;
  }
}

export async function preflightMovielensMeasuredP0PostgresqlComparator({
  runId,
  dataset,
  replicationFactor,
}) {
  const prepared = await prepareSeal({
    runId,
    dataset,
    replicationFactor,
    includePlanningArtifact: true,
  });
  await prepared.postgres.close();
  return prepared.seal;
}

export async function openMovielensMeasuredP0PostgresqlEnvironment({
  runId,
  sideId,
  dataset,
  replicationFactor,
  expectedSeal,
}) {
  const prepared = await prepareSeal({
    runId,
    dataset,
    replicationFactor,
    includePlanningArtifact: false,
  });
  const observedSeal = prepared.seal;
  if (
    sideId !== POSTGRESQL_SIDE_ID ||
    digestBenchmarkSemanticData(observedSeal) !==
      digestBenchmarkSemanticData(expectedPostgresqlSeal(expectedSeal))
  ) {
    await prepared.postgres.close();
    fail(localText.SEALED_PREFLIGHT_MISMATCH);
  }
  const postgres = prepared.postgres;
  const provider = new DockerProvider({socketPath: DOCKER_SOCKET});
  const operationManifest = observedSeal.operationManifest;
  let closePromise = null;
  return objectFreeze({
    runId,
    sideIds: objectFreeze([sideId]),
    postgres,
    provider,
    networkId: postgres.networkId,
    networkName: postgres.networkName,
    networkNames: objectFreeze([postgres.networkName]),
    components: objectFreeze(resourceComponents(postgres)),
    operationManifestDigest: observedSeal.operationManifestDigest,
    semanticOracleDigest: observedSeal.semanticOracleDigest,
    adapters: objectFreeze([
      createMovielensPostgresqlCapacityAdapter({
        session: postgres,
        sideId,
        operationManifest,
        semanticOracleDigest: observedSeal.semanticOracleDigest,
      }),
    ]),
    metadata: objectFreeze({
      seal: observedSeal,
      postgres: objectFreeze(postgresSeal(postgres)),
      provisioning: objectFreeze({
        mode: localText.PROVISIONING_MODE,
        resourceLimits: objectFreeze({
          memory: CONTAINER_MEMORY_LIMIT,
          cpus: CONTAINER_CPU_LIMIT,
        }),
      }),
    }),
    close() {
      if (closePromise === null) closePromise = postgres.close();
      return closePromise;
    },
  });
}
