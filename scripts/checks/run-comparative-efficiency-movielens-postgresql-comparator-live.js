#!/usr/bin/env node

import {
  link,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path, {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

import {
  createMovielensGroupedReduceMatrixDatasets,
  selectMovielensGroupedReduceMatrixDataset,
} from
  '../../examples/service-data-affinity/movielens-grouped-reduce-matrix-dataset.js';
import {
  runBenchmarkCapacityIndependentLiveProtocol,
} from
  '../../test/distributed/harness/benchmark-capacity-independent-live-protocol.js';
import {
  digestBenchmarkSemanticData,
  parseBenchmarkSemanticJson,
} from
  '../../test/distributed/harness/benchmark-semantic-integrity.js';
import {
  MOVIELENS_MEASURED_P0_SIDE_IDS,
} from
  '../../test/distributed/harness/comparative-efficiency-movielens-measured-p0-constants.js';
import {
  collectBenchmarkResourceSourceProvenance,
} from './benchmark-resource-source-provenance.js';
import {
  planMovielensMeasuredP0ComparatorCell,
} from './movielens-measured-p0-comparator-plan.js';
import {
  openMovielensMeasuredP0PostgresqlEnvironment,
  preflightMovielensMeasuredP0PostgresqlComparator,
} from './movielens-measured-p0-postgresql-environment.js';
import {
  captureMovielensMeasuredP0ComparatorDriftValue,
  createMovielensMeasuredP0ComparatorHostEnvelope,
  createMovielensMeasuredP0PostgresqlComparator,
  digestMovielensMeasuredP0PostgresqlComparatorSource,
  inspectMovielensMeasuredP0PostgresqlComparatorBundle,
  resolveMovielensMeasuredP0PostgresqlComparatorSourcePaths,
} from './movielens-measured-p0-postgresql-comparator.js';
import {
  closeComparatorEnvironmentAfterFailure,
  createComparatorResourceObservationHooks,
  finalizeComparatorWindowEvidence,
} from './movielens-measured-p0-comparator-live-support.js';

const COMPARATOR_ID =
  'movielens-postgresql-observed-100k-replicated-v1';
const DATASET_SIZE = 100_000;
const DATASET_SKEW = 'observed';
const REPLICATION_FACTOR = 3;
const POSTGRESQL_SIDE_ID = MOVIELENS_MEASURED_P0_SIDE_IDS[1];
const OUTPUT_DIRECTORY =
  'test-output/comparative-movielens-postgresql-comparators';
const jsonStringify = JSON.stringify;
const localText = Object.freeze({
  BUNDLE_FILENAME: 'bundle.json',
  FILE_EXISTS: 'EEXIST',
  FAIL:
    'comparative-efficiency-movielens-postgresql-comparator: FAIL\n',
  PASS:
    'comparative-efficiency-movielens-postgresql-comparator: PASS\n',
  CAPTURE_START:
    'PostgreSQL comparator: independent capture START\n',
  PREFLIGHT_START:
    'PostgreSQL comparator: replicated 100K preflight START\n',
  READBACK_INVALID:
    'persisted PostgreSQL comparator failed read-back inspection',
  PUBLISH_CONFLICT:
    'PostgreSQL comparator content-address publication conflict',
  PUBLISH_CONFLICT_CODE:
    'POSTGRESQL_COMPARATOR_PUBLISH_CONFLICT',
  TEMP_DIRECTORY_PREFIX: '.postgresql-comparator-publish-',
  UTF8: 'utf8',
  WRITE_EXCLUSIVE: 'wx',
});

function calibrationEvidence(windowEvidence) {
  const calibrations = [];
  for (let index = 0; index < windowEvidence.length; index += 1) {
    const calibration = windowEvidence[index].calibration;
    calibrations.push({
      digest: calibration.digest,
      byteLength: calibration.byteLength,
      artifact: calibration.artifact,
    });
  }
  return calibrations;
}

function publishConflict() {
  const error = new TypeError(localText.PUBLISH_CONFLICT);
  error.code = localText.PUBLISH_CONFLICT_CODE;
  return error;
}

async function readInspectedBundle({
  artifactPath,
  comparator,
  expectedBundleDigest,
}) {
  const persistedBundle = parseBenchmarkSemanticJson(
    await readFile(artifactPath, localText.UTF8),
  );
  const inspection =
    inspectMovielensMeasuredP0PostgresqlComparatorBundle(
      persistedBundle,
    );
  if (
    !inspection.valid ||
    inspection.artifactDigest !== comparator.artifactDigest ||
    persistedBundle.bundleDigest !== expectedBundleDigest
  ) throw new TypeError(localText.READBACK_INVALID);
  return persistedBundle;
}

async function publishInspectedBundle({
  artifactPath,
  bundle,
  comparator,
  outputDirectory,
}) {
  const temporaryDirectory = await mkdtemp(
    path.join(outputDirectory, localText.TEMP_DIRECTORY_PREFIX),
  );
  const temporaryPath = resolve(
    temporaryDirectory,
    localText.BUNDLE_FILENAME,
  );
  try {
    await writeFile(
      temporaryPath,
      `${jsonStringify(bundle)}\n`,
      {
        encoding: localText.UTF8,
        flag: localText.WRITE_EXCLUSIVE,
        flush: true,
      },
    );
    const persistedBundle = await readInspectedBundle({
      artifactPath: temporaryPath,
      comparator,
      expectedBundleDigest: bundle.bundleDigest,
    });
    try {
      await link(temporaryPath, artifactPath);
      return persistedBundle;
    } catch (error) {
      if (error?.code !== localText.FILE_EXISTS) throw error;
      try {
        return await readInspectedBundle({
          artifactPath,
          comparator,
          expectedBundleDigest: bundle.bundleDigest,
        });
      } catch {
        throw publishConflict();
      }
    }
  } finally {
    await rm(temporaryDirectory, {recursive: true, force: true});
  }
}

export async function persistMovielensMeasuredP0PostgresqlComparatorBundle({
  comparator,
  protocolReport,
  preregistration,
  resourceCalibrations,
  cleanupReceipt,
  workloadSeal,
  outputDirectory = OUTPUT_DIRECTORY,
}) {
  const body = {
    version: 'movielens-postgresql-comparator-bundle-v1',
    claimEligible: false,
    comparator,
    protocolReport,
    preregistration,
    resourceCalibrations,
    cleanupReceipt,
    workloadSeal,
  };
  const bundle = {
    ...body,
    bundleDigest: digestBenchmarkSemanticData(body),
  };
  await mkdir(outputDirectory, {recursive: true});
  const artifactName = comparator.artifactDigest.slice('sha256:'.length);
  const artifactPath = resolve(
    outputDirectory,
    `${artifactName}.json`,
  );
  const persistedBundle = await publishInspectedBundle({
    artifactPath,
    bundle,
    comparator,
    outputDirectory,
  });
  return {artifactPath, bundle: persistedBundle};
}

async function executeComparatorCapture({
  plan,
  provenance,
  measurementSourceDigest,
}) {
  const environment =
    await openMovielensMeasuredP0PostgresqlEnvironment({
      runId: plan.runId,
      sideId: POSTGRESQL_SIDE_ID,
      dataset: plan.dataset,
      replicationFactor: plan.cell.replicationFactor,
      expectedSeal: plan.seal,
    });
  const captured = [];
  const hostEnvelope =
    createMovielensMeasuredP0ComparatorHostEnvelope();
  const baselineDriftValue =
    captureMovielensMeasuredP0ComparatorDriftValue();
  let protocol;
  let cleanupReceipt;
  try {
    protocol = await runBenchmarkCapacityIndependentLiveProtocol({
      preregistration: plan.capacityPreregistration,
      adapter: environment.adapters[0],
      sideId: POSTGRESQL_SIDE_ID,
      ...createComparatorResourceObservationHooks({
        blockedOrderIndex: plan.blockedOrderIndex,
        captured,
        environment,
        provenance,
        runId: plan.runId,
      }),
    });
    cleanupReceipt = await environment.close();
  } catch (error) {
    await closeComparatorEnvironmentAfterFailure(environment, error);
    throw error;
  }
  const windowEvidence =
    await finalizeComparatorWindowEvidence(captured, protocol);
  const resourceCalibrations = calibrationEvidence(windowEvidence);
  const comparator = createMovielensMeasuredP0PostgresqlComparator({
    comparatorId: COMPARATOR_ID,
    plan,
    environment,
    measurementSourceDigest,
    hostEnvelope,
    protocolReport: protocol.report,
    resourceCalibrations,
    capturedAtMs: Date.now(),
    baselineDriftValue,
  });
  return {
    comparator,
    protocolReport: protocol.report,
    preregistration: plan.capacityPreregistration,
    resourceCalibrations,
    cleanupReceipt,
    workloadSeal: plan.seal,
  };
}

async function main() {
  const sourcePaths =
    await resolveMovielensMeasuredP0PostgresqlComparatorSourcePaths();
  const provenance = await collectBenchmarkResourceSourceProvenance(
    sourcePaths,
  );
  const measurementSourceDigest =
    await digestMovielensMeasuredP0PostgresqlComparatorSource(sourcePaths);
  const datasetDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'movielens-postgresql-comparator-'),
  );
  try {
    const variants =
      await createMovielensGroupedReduceMatrixDatasets(datasetDirectory);
    const dataset = selectMovielensGroupedReduceMatrixDataset(
      variants,
      DATASET_SIZE,
      DATASET_SKEW,
    );
    process.stdout.write(
      localText.PREFLIGHT_START,
    );
    const preflight =
      await preflightMovielensMeasuredP0PostgresqlComparator({
        runId: `${COMPARATOR_ID}:preflight`,
        dataset,
        replicationFactor: REPLICATION_FACTOR,
      });
    const plan = planMovielensMeasuredP0ComparatorCell({
      dataset,
      preflight,
      identity: COMPARATOR_ID,
    });
    process.stdout.write(
      localText.CAPTURE_START,
    );
    const captured = await executeComparatorCapture({
      plan,
      provenance,
      measurementSourceDigest,
    });
    const persisted =
      await persistMovielensMeasuredP0PostgresqlComparatorBundle(
        captured,
      );
    process.stdout.write(
      localText.PASS +
      `artifact: ${persisted.artifactPath}\n` +
      `comparatorDigest: ${captured.comparator.artifactDigest}\n` +
      `reusable: ${captured.comparator.capacity.reusable}\n` +
      `completedBlocks: ${captured.protocolReport.completedBlocks}\n`,
    );
  } finally {
    await rm(datasetDirectory, {recursive: true, force: true});
  }
}

if (
  typeof process.argv[1] === 'string' &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  main().catch((error) => {
    process.stderr.write(
      localText.FAIL +
      `${error?.stack || error}\n`,
    );
    process.exitCode = 1;
  });
}
