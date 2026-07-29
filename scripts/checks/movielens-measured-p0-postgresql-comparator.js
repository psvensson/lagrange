import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import os from 'node:os';

import {
  createBenchmarkCapacityComparatorDriftWitness,
  createBenchmarkCapacityReusableComparator,
  inspectBenchmarkCapacityReusableComparator,
} from
  '../../test/distributed/harness/benchmark-capacity-reusable-comparator.js';
import {
  appendOwnArrayValue,
  copyDenseStringArray,
  digestBenchmarkSemanticData,
  hasExactOwnDataKeys,
  isDenseDataArray,
  isNonNegativeSafeInteger,
  isSha256Digest,
} from
  '../../test/distributed/harness/benchmark-semantic-integrity.js';
import {
  benchmarkResourceCanonicalBytes,
  benchmarkResourceDigestBytes,
} from
  '../../test/distributed/harness/benchmark-resource-evidence-data.js';
import {
  inspectBenchmarkCapacityIndependentSideReport,
} from
  '../../test/distributed/harness/benchmark-capacity-independent-side-protocol.js';
import {
  MOVIELENS_MEASURED_P0_POSTGRESQL_COMPARATOR_ADDITIONAL_PATHS,
  MOVIELENS_MEASURED_P0_POSTGRESQL_COMPARATOR_SOURCE_ENTRY_PATHS,
} from './movielens-measured-p0-postgresql-comparator-constants.js';
import {
  resolveBenchmarkLocalModuleSourcePaths,
} from './benchmark-local-module-source-closure.js';

const HOST_LOAD_HEADROOM_METRIC = 'host-load-headroom-ratio';
const MILLISECONDS_PER_DAY = 86_400_000;
const DEFAULT_VALIDITY_DAYS = 30;
const DEFAULT_MAXIMUM_RELATIVE_DRIFT = 0.25;
const SHA256 = 'sha256';
const HEX = 'hex';
const BUNDLE_VERSION = 'movielens-postgresql-comparator-bundle-v1';
const localText = Object.freeze({
  BUNDLE_INVALID: 'bundle_invalid',
  DIGEST: 'digest',
  INDEPENDENT_DEVELOPMENT_REPORT_REQUIRED:
    'independent development report required',
  MEASUREMENT_SOURCE_PATHS_REQUIRED:
    'measurement source paths must be a non-empty dense string array',
  VALID_COMPARATOR_REQUIRED: 'valid comparator required',
  WINDOW_RECEIPT_DIGEST: 'windowReceiptDigest',
});
const BUNDLE_BODY_KEYS = Object.freeze([
  'version',
  'claimEligible',
  'comparator',
  'protocolReport',
  'preregistration',
  'resourceCalibrations',
  'cleanupReceipt',
  'workloadSeal',
]);
const BUNDLE_KEYS = Object.freeze([
  ...BUNDLE_BODY_KEYS,
  'bundleDigest',
]);
const CALIBRATION_KEYS = Object.freeze([
  'digest',
  'byteLength',
  'artifact',
]);
const CAPACITY_INPUT_KEYS = Object.freeze([
  'estimate',
  'confidenceInterval',
  'perBlockCorrectThroughputPerSecond',
  'perBlockMaxSloOfferedLoadPerSecond',
  'tailSufficientByBlock',
  'bracketedByBlock',
  'minimumBlocks',
  'maximumBlocks',
  'completedBlocks',
  'targetRelativeCiWidth',
]);

function fail(reason) {
  throw new TypeError(`invalid MovieLens PostgreSQL comparator: ${reason}`);
}

export function createMovielensMeasuredP0ComparatorHostEnvelope() {
  return Object.freeze({
    architecture: os.arch(),
    cpuCount: os.cpus().length,
    memoryBytes: os.totalmem(),
    nodeVersion: process.version,
    platform: os.platform(),
    release: os.release(),
  });
}

export function captureMovielensMeasuredP0ComparatorDriftValue() {
  const cpuCount = os.cpus().length;
  const load = os.loadavg()[0];
  return Math.max(
    Number.EPSILON,
    (cpuCount - Math.min(cpuCount, load)) / cpuCount,
  );
}

export async function resolveMovielensMeasuredP0PostgresqlComparatorSourcePaths() {
  return resolveBenchmarkLocalModuleSourcePaths({
    entryPaths:
      MOVIELENS_MEASURED_P0_POSTGRESQL_COMPARATOR_SOURCE_ENTRY_PATHS,
    additionalPaths:
      MOVIELENS_MEASURED_P0_POSTGRESQL_COMPARATOR_ADDITIONAL_PATHS,
  });
}

export async function digestMovielensMeasuredP0PostgresqlComparatorSource(
  sourcePaths = null,
) {
  const resolvedSourcePaths = sourcePaths ??
    await resolveMovielensMeasuredP0PostgresqlComparatorSourcePaths();
  const sealedSourcePaths = copyDenseStringArray(resolvedSourcePaths);
  if (sealedSourcePaths === null || sealedSourcePaths.length === 0) {
    fail(localText.MEASUREMENT_SOURCE_PATHS_REQUIRED);
  }
  const entries = [];
  for (let index = 0;
    index < sealedSourcePaths.length;
    index += 1) {
    const sourcePath = sealedSourcePaths[index];
    const bytes = await readFile(sourcePath);
    appendOwnArrayValue(entries, {
      path: sourcePath,
      digest:
        `${SHA256}:${createHash(SHA256).update(bytes).digest(HEX)}`,
    });
  }
  return digestBenchmarkSemanticData(entries);
}

export function createMovielensMeasuredP0PostgresqlCompatibility({
  plan,
  environment,
  measurementSourceDigest,
  hostEnvelope,
}) {
  const postgres = environment.metadata.postgres;
  const provisioning = environment.metadata.provisioning;
  const storagePaths = [];
  for (let index = 0; index < environment.components.length; index += 1) {
    appendOwnArrayValue(
      storagePaths,
      environment.components[index].storagePath,
    );
  }
  return {
    datasetDigest: plan.dataset.digest,
    datasetCardinality: plan.dataset.cardinality,
    datasetSkew: plan.dataset.skew,
    operationManifestDigest: environment.operationManifestDigest,
    semanticOracleDigest: environment.semanticOracleDigest,
    postgresImageDigest: postgres.imageId,
    postgresVersionDigest: digestBenchmarkSemanticData({
      postgresVersion: postgres.postgresVersion,
      postgresVersionSql: postgres.postgresVersionSql,
    }),
    postgresConfigDigest: digestBenchmarkSemanticData({
      imageInspection: postgres.imageInspection,
      replicationFactor: postgres.replicationFactor,
      resourceLimits: provisioning.resourceLimits,
    }),
    querySqlDigest: digestBenchmarkSemanticData(postgres.querySql),
    queryPlanDigest: digestBenchmarkSemanticData(postgres.queryPlan),
    replicationFactor: postgres.replicationFactor,
    replicationStateDigest:
      digestBenchmarkSemanticData(postgres.replicationState),
    resourceEnvelopeDigest: digestBenchmarkSemanticData({
      componentCount: environment.components.length,
      replicationFactor: postgres.replicationFactor,
      resourceLimits: provisioning.resourceLimits,
      storagePaths,
    }),
    hostEnvelopeDigest: digestBenchmarkSemanticData(hostEnvelope),
    preregistrationDigest:
      plan.capacityPreregistration.manifestDigest,
    measurementSourceDigest,
  };
}

export function expectedMovielensMeasuredP0PostgresqlCompatibility({
  plan,
  comparator,
  measurementSourceDigest,
  hostEnvelope,
}) {
  const inspection =
    inspectBenchmarkCapacityReusableComparator(comparator);
  if (!inspection.valid) fail(localText.VALID_COMPARATOR_REQUIRED);
  return {
    ...comparator.compatibility,
    datasetDigest: plan.dataset.digest,
    datasetCardinality: plan.dataset.cardinality,
    datasetSkew: plan.dataset.skew,
    operationManifestDigest: plan.seal.operationManifestDigest,
    semanticOracleDigest: plan.seal.semanticOracleDigest,
    replicationFactor: plan.cell.replicationFactor,
    hostEnvelopeDigest: digestBenchmarkSemanticData(hostEnvelope),
    preregistrationDigest:
      plan.capacityPreregistration.manifestDigest,
    measurementSourceDigest,
  };
}

function receiptDigests(receipts, key) {
  if (!isDenseDataArray(receipts) || receipts.length === 0) {
    fail(`${key}:non-empty dense evidence required`);
  }
  const digests = [];
  for (let index = 0; index < receipts.length; index += 1) {
    appendOwnArrayValue(digests, receipts[index][key]);
  }
  return digests;
}

export function createMovielensMeasuredP0PostgresqlComparator({
  comparatorId,
  plan,
  environment,
  measurementSourceDigest,
  hostEnvelope,
  protocolReport,
  resourceCalibrations,
  capturedAtMs,
  validityDays = DEFAULT_VALIDITY_DAYS,
  baselineDriftValue,
  maximumRelativeDrift = DEFAULT_MAXIMUM_RELATIVE_DRIFT,
}) {
  const reportInspection =
    inspectBenchmarkCapacityIndependentSideReport(
      protocolReport,
      plan.capacityPreregistration,
    );
  if (
    !reportInspection.valid ||
    protocolReport.claimEligible !== false ||
    protocolReport.sideId !== environment.sideIds[0] ||
    protocolReport.summary.sideId !== environment.sideIds[0] ||
    !isNonNegativeSafeInteger(validityDays) ||
    validityDays === 0
  ) {
    fail(localText.INDEPENDENT_DEVELOPMENT_REPORT_REQUIRED);
  }
  return createBenchmarkCapacityReusableComparator({
    comparatorId,
    sideId: environment.sideIds[0],
    protocolReportDigest: protocolReport.reportDigest,
    compatibility:
      createMovielensMeasuredP0PostgresqlCompatibility({
        plan,
        environment,
        measurementSourceDigest,
        hostEnvelope,
      }),
    capacity: protocolReport.summary.capacity,
    evidence: {
      sampleDigests: protocolReport.rawSampleDigests,
      windowReceiptDigests:
        receiptDigests(
          protocolReport.windowReceipts,
          localText.WINDOW_RECEIPT_DIGEST,
        ),
      resourceReceiptDigests:
        receiptDigests(resourceCalibrations, localText.DIGEST),
    },
    revalidationPolicy: {
      driftMetric: HOST_LOAD_HEADROOM_METRIC,
      baselineValue: baselineDriftValue,
      maximumRelativeDrift,
    },
    capturedAtMs,
    validUntilMs:
      capturedAtMs + validityDays * MILLISECONDS_PER_DAY,
  });
}

export function createMovielensMeasuredP0ComparatorDriftWitness(
  comparator,
) {
  return createBenchmarkCapacityComparatorDriftWitness({
    metric: comparator.revalidationPolicy.driftMetric,
    baselineValue: comparator.revalidationPolicy.baselineValue,
    observedValue: captureMovielensMeasuredP0ComparatorDriftValue(),
  });
}

function exactDigestArrayMatches(values, expected) {
  if (
    !isDenseDataArray(values) ||
    !isDenseDataArray(expected) ||
    values.length !== expected.length
  ) return false;
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] !== expected[index]) return false;
  }
  return true;
}

function fieldDigestArray(values, key) {
  if (!isDenseDataArray(values)) return null;
  const digests = [];
  for (let index = 0; index < values.length; index += 1) {
    if (
      values[index] === null ||
      typeof values[index] !== 'object' ||
      !isSha256Digest(values[index][key])
    ) return null;
    appendOwnArrayValue(digests, values[index][key]);
  }
  return digests;
}

function calibrationsAreValid(calibrations) {
  if (!isDenseDataArray(calibrations) || calibrations.length === 0) {
    return false;
  }
  for (let index = 0; index < calibrations.length; index += 1) {
    const calibration = calibrations[index];
    if (!hasExactOwnDataKeys(calibration, CALIBRATION_KEYS)) return false;
    let bytes;
    try {
      bytes = benchmarkResourceCanonicalBytes(calibration.artifact);
    } catch {
      return false;
    }
    if (
      calibration.byteLength !== bytes.length ||
      calibration.digest !== benchmarkResourceDigestBytes(bytes)
    ) return false;
  }
  return true;
}

function bundleBody(bundle) {
  const body = {};
  for (let index = 0; index < BUNDLE_BODY_KEYS.length; index += 1) {
    const key = BUNDLE_BODY_KEYS[index];
    body[key] = bundle[key];
  }
  return body;
}

function capacityInput(capacity) {
  const input = {};
  for (let index = 0; index < CAPACITY_INPUT_KEYS.length; index += 1) {
    const key = CAPACITY_INPUT_KEYS[index];
    input[key] = capacity[key];
  }
  return input;
}

function workloadSealMatchesComparator(seal, compatibility) {
  try {
    return (
      seal.dataset.digest === compatibility.datasetDigest &&
      seal.dataset.cardinality === compatibility.datasetCardinality &&
      seal.dataset.skew === compatibility.datasetSkew &&
      seal.operationManifestDigest ===
        compatibility.operationManifestDigest &&
      seal.semanticOracleDigest ===
        compatibility.semanticOracleDigest &&
      seal.postgres.imageId === compatibility.postgresImageDigest &&
      seal.postgres.replicationFactor ===
        compatibility.replicationFactor &&
      digestBenchmarkSemanticData({
        postgresVersion: seal.postgres.postgresVersion,
        postgresVersionSql: seal.postgres.postgresVersionSql,
      }) === compatibility.postgresVersionDigest &&
      digestBenchmarkSemanticData(seal.postgres.querySql) ===
        compatibility.querySqlDigest &&
      digestBenchmarkSemanticData(seal.postgres.queryPlan) ===
        compatibility.queryPlanDigest &&
      digestBenchmarkSemanticData(seal.postgres.replicationState) ===
        compatibility.replicationStateDigest
    );
  } catch {
    return false;
  }
}

function bundleEnvelopeIsValid(bundle) {
  return (
    hasExactOwnDataKeys(bundle, BUNDLE_KEYS) &&
    bundle.version === BUNDLE_VERSION &&
    bundle.claimEligible === false &&
    isSha256Digest(bundle.bundleDigest) &&
    digestBenchmarkSemanticData(bundleBody(bundle)) ===
      bundle.bundleDigest &&
    inspectBenchmarkCapacityReusableComparator(bundle.comparator).valid &&
    inspectBenchmarkCapacityIndependentSideReport(
      bundle.protocolReport,
      bundle.preregistration,
    ).valid
  );
}

function bundleSemanticBindingsAreValid(bundle) {
  return (
    bundle.protocolReport.claimEligible === false &&
    bundle.protocolReport.sideId === bundle.comparator.sideId &&
    bundle.protocolReport.reportDigest ===
      bundle.comparator.protocolReportDigest &&
    bundle.preregistration.manifestDigest ===
      bundle.comparator.compatibility.preregistrationDigest &&
    calibrationsAreValid(bundle.resourceCalibrations) &&
    workloadSealMatchesComparator(
      bundle.workloadSeal,
      bundle.comparator.compatibility,
    ) &&
    digestBenchmarkSemanticData(
      bundle.protocolReport.summary.capacity,
    ) === digestBenchmarkSemanticData(
      capacityInput(bundle.comparator.capacity),
    )
  );
}

function bundleEvidenceBindingsAreValid(bundle) {
  const report = bundle.protocolReport;
  const comparator = bundle.comparator;
  const windowDigests =
    fieldDigestArray(
      report.windowReceipts,
      localText.WINDOW_RECEIPT_DIGEST,
    );
  const resourceDigests =
    fieldDigestArray(bundle.resourceCalibrations, localText.DIGEST);
  return (
    exactDigestArrayMatches(
      report.rawSampleDigests,
      comparator.evidence.sampleDigests,
    ) &&
    exactDigestArrayMatches(
      windowDigests,
      comparator.evidence.windowReceiptDigests,
    ) &&
    exactDigestArrayMatches(
      resourceDigests,
      comparator.evidence.resourceReceiptDigests,
    )
  );
}

export function inspectMovielensMeasuredP0PostgresqlComparatorBundle(bundle) {
  try {
    if (
      !bundleEnvelopeIsValid(bundle) ||
      !bundleSemanticBindingsAreValid(bundle) ||
      !bundleEvidenceBindingsAreValid(bundle)
    ) return Object.freeze({valid: false, reason: localText.BUNDLE_INVALID});
    return Object.freeze({
      valid: true,
      reason: null,
      artifactDigest: bundle.comparator.artifactDigest,
    });
  } catch {
    return Object.freeze({valid: false, reason: localText.BUNDLE_INVALID});
  }
}
