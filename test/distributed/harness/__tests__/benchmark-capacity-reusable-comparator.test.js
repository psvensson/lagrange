import assert from 'node:assert/strict';
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createBenchmarkCapacityIndependentComparison,
} from '../benchmark-capacity-independent-comparison.js';
import {
  createBenchmarkCapacityComparatorDriftWitness,
  createBenchmarkCapacityReusableComparator,
  inspectBenchmarkCapacityReusableComparator,
  revalidateBenchmarkCapacityReusableComparator,
} from '../benchmark-capacity-reusable-comparator.js';
import {
  BENCHMARK_CAPACITY_PHASE,
} from '../benchmark-capacity-protocol-constants.js';
import {
  runBenchmarkCapacityIndependentSideProtocol,
} from '../benchmark-capacity-independent-side-protocol.js';
import {
  sealBenchmarkCapacityPreregistration,
} from '../benchmark-capacity-preregistration.js';
import {
  digestBenchmarkSemanticData,
} from '../benchmark-semantic-integrity.js';
import {
  summarizeBenchmarkCapacityIndependentSide,
} from '../benchmark-capacity-statistics.js';
import {
  independentFixtureLoads,
  independentFixtureExecutor,
  independentFixtureResetReceipt,
  independentFixtureSidePostgresql,
  independentPreregistrationInput,
  independentSuccessfulRunSample,
} from './benchmark-capacity-independent-test-fixture.js';
import {
  inspectMovielensMeasuredP0PostgresqlComparatorBundle,
} from '../../../../scripts/checks/movielens-measured-p0-postgresql-comparator.js';
import {
  persistMovielensMeasuredP0PostgresqlComparatorBundle,
} from '../../../../scripts/checks/run-comparative-efficiency-movielens-postgresql-comparator-live.js';
import {
  benchmarkResourceCanonicalBytes,
  benchmarkResourceDigestBytes,
} from '../benchmark-resource-evidence-data.js';
import {
  replacePrototypeProperty,
} from '../../../helpers/hostile-intrinsics.js';

const CAPTURED_AT_MS = 1_000;
const VALID_UNTIL_MS = 11_000;
const REVALIDATION_NOW_MS = 5_000;
const arrayMap = Function.call.bind(Array.prototype.map);
const objectKeys = Object.keys;
const FIXTURE_LOADS = independentFixtureLoads();
const SIDE_POSTGRESQL = independentFixtureSidePostgresql();

function digest(value) {
  return digestBenchmarkSemanticData({value});
}

function compatibility(overrides = {}) {
  return {
    datasetDigest: digest('dataset'),
    datasetCardinality: 100_000,
    datasetSkew: 'observed',
    operationManifestDigest: digest('operation-manifest'),
    semanticOracleDigest: digest('semantic-oracle'),
    postgresImageDigest: digest('postgres-image'),
    postgresVersionDigest: digest('postgres-version'),
    postgresConfigDigest: digest('postgres-config'),
    querySqlDigest: digest('query-sql'),
    queryPlanDigest: digest('query-plan'),
    replicationFactor: 3,
    replicationStateDigest: digest('replication-state'),
    resourceEnvelopeDigest: digest('resource-envelope'),
    hostEnvelopeDigest: digest('host-envelope'),
    preregistrationDigest: digest('preregistration'),
    measurementSourceDigest: digest('measurement-source'),
    ...overrides,
  };
}

function artifact(overrides = {}) {
  return createBenchmarkCapacityReusableComparator({
    comparatorId: 'postgresql-100k-observed-rf3',
    sideId: 'postgresql',
    protocolReportDigest: digest('protocol-report'),
    compatibility: compatibility(),
    capacity: {
      estimate: 81,
      confidenceInterval: {lower: 80, upper: 82},
      perBlockCorrectThroughputPerSecond: [80, 82, 81],
      perBlockMaxSloOfferedLoadPerSecond: [80, 80, 80],
      tailSufficientByBlock: [true, true, true],
      bracketedByBlock: [true, true, true],
      minimumBlocks: 3,
      maximumBlocks: 5,
      completedBlocks: 3,
      targetRelativeCiWidth: 0.1,
    },
    evidence: {
      sampleDigests: [digest('sample-a'), digest('sample-b')],
      windowReceiptDigests: [digest('window-a'), digest('window-b')],
      resourceReceiptDigests: [
        digest('resource-a'),
        digest('resource-b'),
      ],
    },
    revalidationPolicy: {
      driftMetric: 'host-control-throughput',
      baselineValue: 100,
      maximumRelativeDrift: 0.05,
    },
    capturedAtMs: CAPTURED_AT_MS,
    validUntilMs: VALID_UNTIL_MS,
    ...overrides,
  });
}

function drift(observedValue = 104) {
  return createBenchmarkCapacityComparatorDriftWitness({
    metric: 'host-control-throughput',
    baselineValue: 100,
    observedValue,
  });
}

function receiptDigests(receipts) {
  return arrayMap(receipts, (receipt) => receipt.windowReceiptDigest);
}

function resignReportAndBundle(bundle) {
  const reportBody = {};
  const reportKeys = objectKeys(bundle.protocolReport);
  for (let index = 0; index < reportKeys.length; index += 1) {
    const key = reportKeys[index];
    if (key !== 'reportDigest') {
      reportBody[key] = bundle.protocolReport[key];
    }
  }
  bundle.protocolReport.reportDigest =
    digestBenchmarkSemanticData(reportBody);
  const bundleBody = {};
  const bundleKeys = objectKeys(bundle);
  for (let index = 0; index < bundleKeys.length; index += 1) {
    const key = bundleKeys[index];
    if (key !== 'bundleDigest') bundleBody[key] = bundle[key];
  }
  bundle.bundleDigest = digestBenchmarkSemanticData(bundleBody);
}

test('objectively sufficient comparator is reusable but never claim eligible',
  () => {
    const comparator = artifact();
    assert.equal(comparator.claimEligible, false);
    assert.equal(comparator.capacity.reusable, true);
    assert.equal(
      inspectBenchmarkCapacityReusableComparator(comparator).valid,
      true,
    );
    assert.deepEqual(
      revalidateBenchmarkCapacityReusableComparator({
        artifact: comparator,
        expectedCompatibility: compatibility(),
        driftWitness: drift(),
        nowMs: REVALIDATION_NOW_MS,
      }),
      {
        state: 'reusable',
        artifactDigest: comparator.artifactDigest,
        reasons: [],
      },
    );
  },
);

test('compatibility, freshness, and derived drift fail closed', () => {
  const comparator = artifact();
  const mismatch = revalidateBenchmarkCapacityReusableComparator({
    artifact: comparator,
    expectedCompatibility: compatibility({replicationFactor: 1}),
    driftWitness: drift(),
    nowMs: REVALIDATION_NOW_MS,
  });
  assert.equal(mismatch.state, 'capture_required');
  assert.deepEqual(mismatch.reasons, ['compatibility_mismatch']);

  const stale = revalidateBenchmarkCapacityReusableComparator({
    artifact: comparator,
    expectedCompatibility: compatibility(),
    driftWitness: drift(),
    nowMs: VALID_UNTIL_MS + 1,
  });
  assert.equal(stale.state, 'capture_required');
  assert.deepEqual(stale.reasons, ['expired']);

  const shifted = revalidateBenchmarkCapacityReusableComparator({
    artifact: comparator,
    expectedCompatibility: compatibility(),
    driftWitness: drift(106),
    nowMs: REVALIDATION_NOW_MS,
  });
  assert.equal(shifted.state, 'capture_required');
  assert.deepEqual(shifted.reasons, ['drift_exceeded']);
});

test('tampered, inherited, and accessor-backed comparators are rejected',
  () => {
    const comparator = artifact();
    const tampered = structuredClone(comparator);
    tampered.capacity.estimate = 999;
    assert.equal(
      inspectBenchmarkCapacityReusableComparator(tampered).valid,
      false,
    );
    assert.equal(
      revalidateBenchmarkCapacityReusableComparator({
        artifact: tampered,
        expectedCompatibility: compatibility(),
        driftWitness: drift(),
        nowMs: REVALIDATION_NOW_MS,
      }).state,
      'capture_required',
    );

    assert.equal(
      inspectBenchmarkCapacityReusableComparator(
        Object.create(comparator),
      ).valid,
      false,
    );

    let getterReads = 0;
    const accessor = {};
    Object.defineProperty(accessor, 'version', {
      enumerable: true,
      get() {
        getterReads += 1;
        return comparator.version;
      },
    });
    assert.equal(
      inspectBenchmarkCapacityReusableComparator(accessor).valid,
      false,
    );
    assert.equal(getterReads, 0);
  },
);

test('maximum-bound comparator without precision is durable but not reusable',
  () => {
    const comparator = artifact({
      capacity: {
        estimate: 81,
        confidenceInterval: {lower: 40, upper: 120},
        perBlockCorrectThroughputPerSecond: [80, 82, 81, 79, 83],
        perBlockMaxSloOfferedLoadPerSecond: [80, 80, 80, 80, 80],
        tailSufficientByBlock: [true, true, true, true, true],
        bracketedByBlock: [true, true, true, true, true],
        minimumBlocks: 3,
        maximumBlocks: 5,
        completedBlocks: 5,
        targetRelativeCiWidth: 0.1,
      },
    });
    assert.equal(comparator.capacity.precisionReached, false);
    assert.equal(comparator.capacity.reusable, false);
    const decision = revalidateBenchmarkCapacityReusableComparator({
      artifact: comparator,
      expectedCompatibility: compatibility(),
      driftWitness: drift(),
      nowMs: REVALIDATION_NOW_MS,
    });
    assert.equal(decision.state, 'capture_required');
    assert.deepEqual(
      decision.reasons,
      ['not_objectively_sufficient'],
    );
  },
);

test('independent PostgreSQL blocks stop only after bracketed sufficiency',
  () => {
    const sealed =
      sealBenchmarkCapacityPreregistration(
        independentPreregistrationInput(),
      );
    const samples = [];
    for (let blockIndex = 0; blockIndex < 3; blockIndex += 1) {
      for (let loadIndex = 0; loadIndex < FIXTURE_LOADS.length;
        loadIndex += 1) {
        const offeredLoadPerSecond = FIXTURE_LOADS[loadIndex];
        samples.push(independentSuccessfulRunSample({
          sideId: SIDE_POSTGRESQL,
          phase: BENCHMARK_CAPACITY_PHASE.MEASURED,
          blockIndex,
          offeredLoadPerSecond,
          windowDurationMs: 1_000,
          p99LatencyMs: offeredLoadPerSecond === 100 ? 10 : 80,
          preregistration: sealed,
        }));
      }
    }
    const summary = summarizeBenchmarkCapacityIndependentSide(
      samples,
      sealed,
      SIDE_POSTGRESQL,
      3,
    );
    assert.equal(summary.capacity.estimate, 100);
    assert.equal(summary.objectiveSufficiency.tailSufficient, true);
    assert.equal(summary.objectiveSufficiency.bracketed, true);
    assert.equal(summary.objectiveSufficiency.precisionReached, true);
    assert.equal(summary.objectiveSufficiency.reusable, true);
    assert.equal(summary.shouldStop, true);

    const allPassing = arrayMap(samples, (sample) =>
      independentSuccessfulRunSample({
        sideId: SIDE_POSTGRESQL,
        phase: BENCHMARK_CAPACITY_PHASE.MEASURED,
        blockIndex: sample.blockIndex,
        offeredLoadPerSecond: sample.offeredLoadPerSecond,
        windowDurationMs: 1_000,
        p99LatencyMs: 10,
        preregistration: sealed,
      }));
    const unbracketed = summarizeBenchmarkCapacityIndependentSide(
      allPassing,
      sealed,
      SIDE_POSTGRESQL,
      3,
    );
    assert.equal(unbracketed.objectiveSufficiency.bracketed, false);
    assert.equal(unbracketed.objectiveSufficiency.reusable, false);
    assert.equal(unbracketed.shouldStop, false);
  },
);

test('independent protocol executes PostgreSQL without invoking Lagrange',
  async () => {
    const sealed =
      sealBenchmarkCapacityPreregistration(
        independentPreregistrationInput(),
      );
    const report = await runBenchmarkCapacityIndependentSideProtocol({
      preregistration: sealed,
      sideId: SIDE_POSTGRESQL,
      resetRunState:
        async (context) => independentFixtureResetReceipt(context),
      executeRun: independentFixtureExecutor(sealed),
    });
    assert.equal(report.claimEligible, false);
    assert.equal(report.sideId, SIDE_POSTGRESQL);
    assert.equal(report.completedBlocks, 3);
    assert.equal(report.rawSamples.length, 9);
    assert.equal(report.summary.objectiveSufficiency.reusable, true);
    for (let index = 0; index < report.rawSamples.length; index += 1) {
      assert.equal(report.rawSamples[index].sideId, SIDE_POSTGRESQL);
    }
  },
);

test('independent comparison carries both uncertainty intervals without pairing',
  () => {
    const comparison = createBenchmarkCapacityIndependentComparison({
      numeratorSideId: 'lagrange',
      numeratorCapacity: {
        estimate: 60,
        confidenceInterval: {lower: 50, upper: 70},
        completedBlocks: 3,
      },
      numeratorEvidenceDigest: digest('lagrange-report'),
      denominatorSideId: SIDE_POSTGRESQL,
      denominatorCapacity: {
        estimate: 100,
        confidenceInterval: {lower: 90, upper: 110},
        completedBlocks: 4,
      },
      denominatorEvidenceDigest: digest('postgresql-comparator'),
    });
    assert.equal(comparison.claimEligible, false);
    assert.equal(
      comparison.sampleRelation,
      'independent_noncontemporaneous',
    );
    assert.equal(comparison.estimate, 0.6);
    assert.equal(comparison.confidenceInterval.lower, 50 / 110);
    assert.equal(comparison.confidenceInterval.upper, 70 / 90);
    assert.equal(comparison.numerator.completedBlocks, 3);
    assert.equal(comparison.denominator.completedBlocks, 4);
  },
);

test('content-addressed comparator bundle binds raw and resource evidence',
  async () => {
    const sealed =
      sealBenchmarkCapacityPreregistration(
        independentPreregistrationInput(),
      );
    const report = await runBenchmarkCapacityIndependentSideProtocol({
      preregistration: sealed,
      sideId: SIDE_POSTGRESQL,
      resetRunState:
        async (context) => independentFixtureResetReceipt(context),
      executeRun: independentFixtureExecutor(sealed),
    });
    const resourceArtifact = {
      schemaVersion: 'fixture-v1',
      kind: 'fixture-live-calibration',
      references: [],
      payload: {cleanupVerified: true},
    };
    const resourceBytes =
      benchmarkResourceCanonicalBytes(resourceArtifact);
    const resourceDigest = benchmarkResourceDigestBytes(resourceBytes);
    const resourceCalibrations = arrayMap(report.windowReceipts, () => ({
      digest: resourceDigest,
      byteLength: resourceBytes.length,
      artifact: resourceArtifact,
    }));
    const workloadSeal = {
      artifact: {
        buildInputFingerprint: digest('build'),
        componentSourceDigest: digest('component-source'),
        executableDigest: digest('executable'),
        ociManifestDigest: digest('oci'),
      },
      dataset: {
        cardinality: 100_000,
        componentSourceDigest: digest('component-source'),
        digest: digest('dataset'),
        sizeBytes: 1,
        skew: 'observed',
      },
      alternative: {topMovies: []},
      operationManifest: {version: 'fixture'},
      operationManifestDigest: digest('operation-manifest'),
      semanticOracleDigest: digest('semantic-oracle'),
      postgres: {
        imageId: digest('postgres-image'),
        imageInspection: {id: 'fixture', repoDigests: []},
        postgresVersion: 'PostgreSQL fixture',
        postgresVersionSql: 'SELECT version()',
        queryPlan: [{Plan: 'fixture'}],
        querySql: 'SELECT fixture',
        replicationFactor: 3,
        replicationState: {state: 'replicated'},
      },
    };
    const exactCompatibility = compatibility({
      datasetDigest: workloadSeal.dataset.digest,
      datasetCardinality: workloadSeal.dataset.cardinality,
      datasetSkew: workloadSeal.dataset.skew,
      operationManifestDigest: workloadSeal.operationManifestDigest,
      semanticOracleDigest: workloadSeal.semanticOracleDigest,
      postgresImageDigest: workloadSeal.postgres.imageId,
      postgresVersionDigest: digestBenchmarkSemanticData({
        postgresVersion: workloadSeal.postgres.postgresVersion,
        postgresVersionSql: workloadSeal.postgres.postgresVersionSql,
      }),
      querySqlDigest:
        digestBenchmarkSemanticData(workloadSeal.postgres.querySql),
      queryPlanDigest:
        digestBenchmarkSemanticData(workloadSeal.postgres.queryPlan),
      replicationFactor: workloadSeal.postgres.replicationFactor,
      replicationStateDigest:
        digestBenchmarkSemanticData(workloadSeal.postgres.replicationState),
      preregistrationDigest: sealed.manifestDigest,
    });
    const comparator = createBenchmarkCapacityReusableComparator({
      comparatorId: 'fixture-bundle',
      sideId: SIDE_POSTGRESQL,
      protocolReportDigest: report.reportDigest,
      compatibility: exactCompatibility,
      capacity: report.summary.capacity,
      evidence: {
        sampleDigests: report.rawSampleDigests,
        windowReceiptDigests: receiptDigests(report.windowReceipts),
        resourceReceiptDigests:
          arrayMap(resourceCalibrations, (entry) => entry.digest),
      },
      revalidationPolicy: {
        driftMetric: 'fixture',
        baselineValue: 1,
        maximumRelativeDrift: 0.1,
      },
      capturedAtMs: CAPTURED_AT_MS,
      validUntilMs: VALID_UNTIL_MS,
    });
    const body = {
      version: 'movielens-postgresql-comparator-bundle-v1',
      claimEligible: false,
      comparator,
      protocolReport: report,
      preregistration: sealed,
      resourceCalibrations,
      cleanupReceipt: {closed: true},
      workloadSeal,
    };
    const bundle = {
      ...body,
      bundleDigest: digestBenchmarkSemanticData(body),
    };
    assert.equal(
      inspectMovielensMeasuredP0PostgresqlComparatorBundle(bundle).valid,
      true,
    );
    const tampered = structuredClone(bundle);
    tampered.protocolReport.rawSampleDigests[0] = digest('replacement');
    assert.equal(
      inspectMovielensMeasuredP0PostgresqlComparatorBundle(tampered).valid,
      false,
    );
    const resigned = structuredClone(bundle);
    resigned.protocolReport.rawSamples[0].correctThroughputPerSecond += 1;
    resignReportAndBundle(resigned);
    assert.equal(
      inspectMovielensMeasuredP0PostgresqlComparatorBundle(resigned).valid,
      false,
    );
    const objectiveTamper = structuredClone(bundle);
    objectiveTamper.protocolReport.summary.shouldStop = false;
    resignReportAndBundle(objectiveTamper);
    assert.equal(
      objectiveTamper.comparator.artifactDigest,
      bundle.comparator.artifactDigest,
    );
    assert.equal(
      inspectMovielensMeasuredP0PostgresqlComparatorBundle(
        objectiveTamper,
      ).valid,
      false,
    );
    const windowTamper = structuredClone(bundle);
    windowTamper.protocolReport.windowReceipts[0].offeredLoad = 999;
    resignReportAndBundle(windowTamper);
    assert.equal(
      inspectMovielensMeasuredP0PostgresqlComparatorBundle(
        windowTamper,
      ).valid,
      false,
    );
    const resetTamper = structuredClone(bundle);
    resetTamper.protocolReport.resetReceipts[0].endedAt += 1;
    resignReportAndBundle(resetTamper);
    assert.equal(
      inspectMovielensMeasuredP0PostgresqlComparatorBundle(
        resetTamper,
      ).valid,
      false,
    );
    const outputRoot = await mkdtemp(
      path.join(os.tmpdir(), 'postgresql-comparator-persist-'),
    );
    const restoreJsonStringify = replacePrototypeProperty(
      JSON,
      'stringify',
      () => '"poisoned"',
    );
    let persisted;
    try {
      persisted =
        await persistMovielensMeasuredP0PostgresqlComparatorBundle({
          ...body,
          outputDirectory: path.join(outputRoot, 'valid'),
        });
    } finally {
      restoreJsonStringify();
    }
    assert.equal(
      inspectMovielensMeasuredP0PostgresqlComparatorBundle(
        persisted.bundle,
      ).valid,
      true,
    );
    const replayed =
      await persistMovielensMeasuredP0PostgresqlComparatorBundle({
        ...body,
        outputDirectory: path.join(outputRoot, 'valid'),
      });
    assert.equal(replayed.artifactPath, persisted.artifactPath);
    assert.equal(
      replayed.bundle.bundleDigest,
      persisted.bundle.bundleDigest,
    );
    const invalidDirectory = path.join(outputRoot, 'invalid');
    await assert.rejects(
      persistMovielensMeasuredP0PostgresqlComparatorBundle({
        comparator,
        protocolReport: objectiveTamper.protocolReport,
        preregistration: sealed,
        resourceCalibrations,
        cleanupReceipt: body.cleanupReceipt,
        workloadSeal,
        outputDirectory: invalidDirectory,
      }),
      /failed read-back inspection/,
    );
    const artifactFilename =
      `${comparator.artifactDigest.slice('sha256:'.length)}.json`;
    await assert.rejects(
      access(path.join(invalidDirectory, artifactFilename)),
    );
    const conflictDirectory = path.join(outputRoot, 'conflict');
    await mkdir(conflictDirectory, {recursive: true});
    const conflictPath = path.join(
      conflictDirectory,
      artifactFilename,
    );
    await writeFile(conflictPath, 'partial', 'utf8');
    await assert.rejects(
      persistMovielensMeasuredP0PostgresqlComparatorBundle({
        ...body,
        outputDirectory: conflictDirectory,
      }),
      (error) =>
        error?.code ===
          'POSTGRESQL_COMPARATOR_PUBLISH_CONFLICT',
    );
    assert.equal(await readFile(conflictPath, 'utf8'), 'partial');
    await rm(outputRoot, {recursive: true, force: true});
    let getterReads = 0;
    const accessorBundle = {};
    Object.defineProperty(accessorBundle, 'version', {
      enumerable: true,
      get() {
        getterReads += 1;
        return body.version;
      },
    });
    assert.equal(
      inspectMovielensMeasuredP0PostgresqlComparatorBundle(
        accessorBundle,
      ).valid,
      false,
    );
    assert.equal(getterReads, 0);
  },
);
