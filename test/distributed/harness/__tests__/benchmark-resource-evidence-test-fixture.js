import {
  createBenchmarkResourceComponentInventory,
  createBenchmarkResourceWindow,
} from '../benchmark-resource-accounting.js';
import {
  BENCHMARK_RESOURCE_NO_CURRENCY,
  computeBenchmarkResourceWindowCost,
  createBenchmarkResourcePairedEffect,
  createBenchmarkResourcePriceSheet,
} from '../benchmark-resource-cost-and-effects.js';
import {
  createBenchmarkResourceMemoryResolver,
} from '../benchmark-resource-evidence-data.js';
import {
  createBenchmarkResourceEvidenceRoot,
  createBenchmarkResourceMeasuringCellEvidence,
  createBenchmarkResourceNonMeasuringCellEvidence,
  createBenchmarkResourceSourceArtifact,
} from '../benchmark-resource-evidence-root.js';
import {
  createBenchmarkResourceCapacitySummary,
} from '../benchmark-resource-capacity-summary.js';
import {
  createBenchmarkResourceMatrixManifest,
} from '../benchmark-resource-matrix-manifest.js';
import {
  createBenchmarkResourceWindowSourceArtifact,
} from '../benchmark-resource-window-source.js';
import {
  deriveBenchmarkResourceLiveComponentAccounting,
  resolveBenchmarkResourceLiveCalibrationComponent,
} from '../benchmark-resource-live-observation-authority.js';
import {
  BENCHMARK_RESOURCE_ARTIFACT_KIND,
  BENCHMARK_RESOURCE_BILLING_TREATMENT,
  BENCHMARK_RESOURCE_CAPACITY_SOURCE,
  BENCHMARK_RESOURCE_COMPONENT_ROLE,
  BENCHMARK_RESOURCE_EFFECT,
} from '../benchmark-resource-contract-constants.js';
import {
  FIXTURE_RESOURCE_MATRIX_ID,
  FIXTURE_RESOURCE_PAIR_ID,
  FIXTURE_RESOURCE_PRODUCED_AT,
  FIXTURE_RESOURCE_RUN_ID,
  FIXTURE_RESOURCE_SIDE_IDS,
  FIXTURE_RESOURCE_SOURCE_REVISION,
  FIXTURE_RESOURCE_VALID_UNTIL,
} from './benchmark-resource-evidence-test-fixture-constants.js';
const localText = Object.freeze({
  BASELINE_CLIENT: 'baseline-client',
  BASELINE_DATABASE: 'baseline-database',
  BASELINE_STORAGE: '/var/lib/baseline',
  CANDIDATE_CLIENT: 'candidate-client',
  CANDIDATE_DATABASE: 'candidate-database',
  CANDIDATE_STORAGE: '/var/lib/candidate',
  CLIENT: 'client',
  DATABASE: 'database',
  FIXTURE_ALTERNATIVE_TOPOLOGY: 'fixture-alternative-topology',
  FIXTURE_IMAGE: 'fixture:live',
  FIXTURE_IMAGE_ID: 'sha256:fixture-image',
  FIXTURE_NETWORK: 'fixture-network',
  FIXTURE_PREREGISTRATION: 'fixture-preregistration',
  LIVE_TOPOLOGY_VERSION: 'benchmark-resource-live-topology-v1',
  RESOURCE_FIXTURE_SOURCE_V1: 'resource-fixture-source-v1',
  NONE: 'none',
  IDENTICAL_LOAD_GENERATOR_ON_BOTH_SIDES: 'identical_load_generator_on_both_sides',
  SMALL: 'small',
  VALUE_2026_07_27_T11_59_00_000_Z: '2026-07-27T11:59:00.000Z',
  VALUE_2026_07_29_T00_00_00_000_Z: '2026-07-29T00:00:00.000Z',
  PREREGISTERED_NON_MEASURING_FIXTURE_CELL: 'preregistered_non_measuring_fixture_cell',
});


const FIXTURE_SCALAR = Object.freeze({
  AMPLIFICATION_COMPACTION_BYTES: 500,
  AMPLIFICATION_MATERIALIZATION_BYTES: 300,
  AMPLIFICATION_REPLICATION_BYTES: 1_000,
  AMPLIFICATION_TEMPORARY_MOVEMENT_BYTES: 200,
  BASELINE_CAPACITY: 1000,
  CANDIDATE_CAPACITY: 1200,
  CAPACITY_CONFIDENCE_LOWER_FACTOR: 0.95,
  CAPACITY_CONFIDENCE_UPPER_FACTOR: 1.05,
  CAPACITY_SAMPLE_COUNT: 3,
  CLIENT_HEADROOM_RATIO: 0.1,
  COST_CPU_CORE_SECOND: 0.00001,
  COST_INTER_ZONE_NETWORK_BYTE: 0.000000002,
  COST_IOP: 0.00000001,
  COST_MEMORY_BYTE_SECOND: 0.000000000001,
  COST_NETWORK_BYTE: 0.000000001,
  COST_STORAGE_BYTE_SECOND: 0.0000000000001,
  DATABASE_CPU_PER_MULTIPLIER: 2,
  DATABASE_HEADROOM_RATIO: 0.2,
  DATABASE_IOPS_PER_MULTIPLIER: 100,
  DATABASE_MEMORY_PER_MULTIPLIER: 2_000_000,
  DATABASE_MINIMUM_MEMORY_BYTES: 1_000_000,
  DATABASE_MINIMUM_STORAGE_BYTES: 5_000_000,
  DATABASE_STORAGE_PER_MULTIPLIER: 10_000_000,
  MILLISECONDS_PER_SECOND: 1000,
  NETWORK_BYTES_PER_SECOND: 100_000_000,
  NANOSECONDS_PER_SECOND: 1_000_000_000,
  OPERATIONS_PER_WINDOW: 1000,
  UTILIZED_CPU_CORE_SECONDS: 5,
  UTILIZED_IOPS: 200,
  UTILIZED_MEMORY_BYTE_SECONDS: 5_000_000,
  UTILIZED_NETWORK_BYTES: 2_000,
  UTILIZED_NETWORK_INTER_ZONE_BYTES: 500,
  UTILIZED_STORAGE_BYTE_SECONDS: 10_000_000,
});

function source(kind, name, extra = {}) {
  return createBenchmarkResourceSourceArtifact(kind, {
    version: localText.RESOURCE_FIXTURE_SOURCE_V1,
    name,
    ...extra,
  });
}

function provisioned(cpuCores, memoryBytes, storageBytes, iops) {
  return {
    cpuCores,
    memoryBytes,
    storageBytes,
    iops,
    networkBytesPerSecond: FIXTURE_SCALAR.NETWORK_BYTES_PER_SECOND,
  };
}

function minimumFootprint(cpuCores, memoryBytes, storageBytes) {
  return {instances: 1, cpuCores, memoryBytes, storageBytes};
}

function inventoryComponent(
  sideId,
  componentId,
  role,
  billingTreatment,
  fallback,
  exclusionReason,
  calibrationArtifact,
) {
  const observation = calibrationArtifact === null ?
    undefined :
    resolveBenchmarkResourceLiveCalibrationComponent(
      calibrationArtifact.artifact,
      sideId,
      componentId,
    );
  const accounting = observation === undefined ?
    fallback :
    deriveBenchmarkResourceLiveComponentAccounting(observation);
  return {
    componentId,
    role,
    billingTreatment,
    provisioned: accounting.provisioned,
    minimumFootprint: accounting.minimumFootprint,
    reservedHeadroomRatio: accounting.reservedHeadroomRatio,
    exclusionReason,
  };
}

function inventorySide(sideId, multiplier, calibrationArtifact) {
  return {
    sideId,
    components: [
      inventoryComponent(
        sideId,
        `${sideId}-database`,
        BENCHMARK_RESOURCE_COMPONENT_ROLE.DATABASE,
        BENCHMARK_RESOURCE_BILLING_TREATMENT.INCLUDED,
        {
          provisioned: provisioned(
            FIXTURE_SCALAR.DATABASE_CPU_PER_MULTIPLIER * multiplier,
            FIXTURE_SCALAR.DATABASE_MEMORY_PER_MULTIPLIER * multiplier,
            FIXTURE_SCALAR.DATABASE_STORAGE_PER_MULTIPLIER * multiplier,
            FIXTURE_SCALAR.DATABASE_IOPS_PER_MULTIPLIER * multiplier,
          ),
          minimumFootprint: minimumFootprint(
            1,
            FIXTURE_SCALAR.DATABASE_MINIMUM_MEMORY_BYTES,
            FIXTURE_SCALAR.DATABASE_MINIMUM_STORAGE_BYTES,
          ),
          reservedHeadroomRatio: FIXTURE_SCALAR.DATABASE_HEADROOM_RATIO,
        },
        localText.NONE,
        calibrationArtifact,
      ),
      inventoryComponent(
        sideId,
        `${sideId}-client`,
        BENCHMARK_RESOURCE_COMPONENT_ROLE.CLIENT,
        BENCHMARK_RESOURCE_BILLING_TREATMENT.SYMMETRICALLY_EXCLUDED,
        {
          provisioned: provisioned(
            1,
            FIXTURE_SCALAR.DATABASE_MINIMUM_MEMORY_BYTES,
            0,
            0,
          ),
          minimumFootprint: minimumFootprint(
            1,
            FIXTURE_SCALAR.DATABASE_MINIMUM_MEMORY_BYTES,
            0,
          ),
          reservedHeadroomRatio: FIXTURE_SCALAR.CLIENT_HEADROOM_RATIO,
        },
        localText.IDENTICAL_LOAD_GENERATOR_ON_BOTH_SIDES,
        calibrationArtifact,
      ),
    ],
  };
}

function liveTopology(calibrationArtifact) {
  const components = [];
  for (let sideIndex = 0;
    sideIndex < FIXTURE_RESOURCE_SIDE_IDS.length;
    sideIndex += 1) {
    const sideId = FIXTURE_RESOURCE_SIDE_IDS[sideIndex];
    for (const entry of [
      [localText.DATABASE, BENCHMARK_RESOURCE_COMPONENT_ROLE.DATABASE],
      [localText.CLIENT, BENCHMARK_RESOURCE_COMPONENT_ROLE.CLIENT],
    ]) {
      const componentId = `${sideId}-${entry[0]}`;
      const observation = resolveBenchmarkResourceLiveCalibrationComponent(
        calibrationArtifact.artifact,
        sideId,
        componentId,
      );
      components.push({
        sideId,
        componentId,
        role: entry[1],
        physicalResourceId: observation.containerId,
      });
    }
  }
  return createBenchmarkResourceSourceArtifact(
    BENCHMARK_RESOURCE_ARTIFACT_KIND.ALTERNATIVE_TOPOLOGY,
    {
      version: localText.LIVE_TOPOLOGY_VERSION,
      image: localText.FIXTURE_IMAGE,
      imageId: localText.FIXTURE_IMAGE_ID,
      databaseContainers: [
        localText.CANDIDATE_DATABASE,
        localText.BASELINE_DATABASE,
      ],
      sharedClientContainers: [
        localText.CANDIDATE_CLIENT,
        localText.BASELINE_CLIENT,
      ],
      network: localText.FIXTURE_NETWORK,
      databaseStorage: [
        localText.CANDIDATE_STORAGE,
        localText.BASELINE_STORAGE,
      ],
      reservedIopsPerComponent: 0,
      reservedNetworkBytesPerSecondPerComponent: 0,
      components,
    },
  );
}

function alternativeTopologyFixture(calibrationArtifact) {
  return calibrationArtifact === null ?
    source(
      BENCHMARK_RESOURCE_ARTIFACT_KIND.ALTERNATIVE_TOPOLOGY,
      localText.FIXTURE_ALTERNATIVE_TOPOLOGY,
    ) :
    liveTopology(calibrationArtifact);
}

function fixtureIdentity(calibrationArtifact) {
  return {
    runId:
      calibrationArtifact?.artifact.payload.runId ??
      FIXTURE_RESOURCE_RUN_ID,
    sourceRevision:
      calibrationArtifact?.artifact.payload.sourceRevision ??
      FIXTURE_RESOURCE_SOURCE_REVISION,
  };
}

function fixturePreregistration(capacityProtocol) {
  return source(
    BENCHMARK_RESOURCE_ARTIFACT_KIND.PREREGISTRATION,
    localText.FIXTURE_PREREGISTRATION,
    capacityProtocol === null ?
      {} :
      {
        sideIds: FIXTURE_RESOURCE_SIDE_IDS,
        capacityProtocolReportDigest:
          capacityProtocol.report.reportDigest,
        capacityProtocolPreregistrationDigest:
          capacityProtocol.preregistration.manifestDigest,
      },
  );
}

function unitPrices() {
  return {
    cpuCoreSecond: FIXTURE_SCALAR.COST_CPU_CORE_SECOND,
    interZoneNetworkByte:
      FIXTURE_SCALAR.COST_INTER_ZONE_NETWORK_BYTE,
    iop: FIXTURE_SCALAR.COST_IOP,
    memoryByteSecond: FIXTURE_SCALAR.COST_MEMORY_BYTE_SECOND,
    networkByte: FIXTURE_SCALAR.COST_NETWORK_BYTE,
    storageByteSecond: FIXTURE_SCALAR.COST_STORAGE_BYTE_SECOND,
  };
}

function utilized(multiplier) {
  return {
    cpuCoreSeconds: FIXTURE_SCALAR.UTILIZED_CPU_CORE_SECONDS * multiplier,
    memoryByteSeconds:
      FIXTURE_SCALAR.UTILIZED_MEMORY_BYTE_SECONDS * multiplier,
    storageByteSeconds:
      FIXTURE_SCALAR.UTILIZED_STORAGE_BYTE_SECONDS * multiplier,
    iops: FIXTURE_SCALAR.UTILIZED_IOPS * multiplier,
    networkBytes: FIXTURE_SCALAR.UTILIZED_NETWORK_BYTES * multiplier,
    interZoneNetworkBytes:
      FIXTURE_SCALAR.UTILIZED_NETWORK_INTER_ZONE_BYTES * multiplier,
  };
}

function amplification(multiplier) {
  return {
    replicationBytes:
      FIXTURE_SCALAR.AMPLIFICATION_REPLICATION_BYTES * multiplier,
    temporaryMovementBytes:
      FIXTURE_SCALAR.AMPLIFICATION_TEMPORARY_MOVEMENT_BYTES * multiplier,
    rebuildBytes: 0,
    compactionBytes:
      FIXTURE_SCALAR.AMPLIFICATION_COMPACTION_BYTES * multiplier,
    materializationBytes:
      FIXTURE_SCALAR.AMPLIFICATION_MATERIALIZATION_BYTES * multiplier,
  };
}

function liveObservation(calibrationArtifact, sideId, componentId) {
  if (calibrationArtifact === null) return undefined;
  return calibrationArtifact.artifact.payload.components.find(
    (component) =>
      component.sideId === sideId && component.componentId === componentId,
  );
}

function liveUtilized(observation) {
  const durationSeconds =
    observation.delta.durationMilliseconds /
    FIXTURE_SCALAR.MILLISECONDS_PER_SECOND;
  return {
    cpuCoreSeconds:
      observation.delta.cpuUsageNanoseconds /
      FIXTURE_SCALAR.NANOSECONDS_PER_SECOND,
    memoryByteSeconds:
      (observation.start.memoryUsageBytes +
        observation.end.memoryUsageBytes) / 2 * durationSeconds,
    storageByteSeconds:
      (observation.start.storageUsageBytes +
        observation.end.storageUsageBytes) / 2 * durationSeconds,
    iops: observation.delta.blockOperations,
    networkBytes: observation.delta.networkBytes,
    interZoneNetworkBytes: 0,
  };
}

function componentSamples(
  sideId,
  startDigest,
  endDigest,
  multiplier,
  calibrationArtifact,
  liveUtilizationOffset,
) {
  const databaseObservation = liveObservation(
    calibrationArtifact,
    sideId,
    `${sideId}-database`,
  );
  const clientObservation = liveObservation(
    calibrationArtifact,
    sideId,
    `${sideId}-client`,
  );
  const databaseUtilized = databaseObservation === undefined ?
    utilized(multiplier) :
    liveUtilized(databaseObservation);
  databaseUtilized.cpuCoreSeconds += liveUtilizationOffset;
  return [
    {
      componentId: `${sideId}-database`,
      observationStartDigest: startDigest,
      observationEndDigest: endDigest,
      utilized: databaseUtilized,
      amplification: databaseObservation === undefined ?
        amplification(multiplier) :
        amplification(0),
    },
    {
      componentId: `${sideId}-client`,
      observationStartDigest: startDigest,
      observationEndDigest: endDigest,
      utilized: clientObservation === undefined ?
        utilized(1) :
        liveUtilized(clientObservation),
      amplification: amplification(0),
    },
  ];
}

function sideSourceArtifacts(
  sideId,
  multiplier,
  calibrationArtifact,
  capacityProtocol,
  sideIndex,
  coordinates,
) {
  const protocolSideId =
    capacityProtocol?.preregistration.sideIds[sideIndex];
  const capacitySample = createBenchmarkResourceWindowSourceArtifact(
    BENCHMARK_RESOURCE_ARTIFACT_KIND.CAPACITY_SAMPLE,
    {
      ...coordinates,
      sideId,
      evidence: {
        name: `${sideId}-capacity-sample`,
        correctOpsPerSecond:
          sideId === FIXTURE_RESOURCE_SIDE_IDS[0] ? 1200 : 1000,
        ...(capacityProtocol === null ?
          {} :
          {
            protocol: {
              version: BENCHMARK_RESOURCE_CAPACITY_SOURCE.VERSION,
              evidenceClass:
                BENCHMARK_RESOURCE_CAPACITY_SOURCE.EVIDENCE_CLASS,
              mappedSideId: sideId,
              protocolSideId,
              artifactReceipt: {
                reportDigest: capacityProtocol.report.reportDigest,
                preregistrationDigest:
                  capacityProtocol.preregistration.manifestDigest,
              },
              preregistration: capacityProtocol.preregistration,
              report: capacityProtocol.report,
            },
          }),
      },
    },
  );
  const semanticReceipt = createBenchmarkResourceWindowSourceArtifact(
    BENCHMARK_RESOURCE_ARTIFACT_KIND.SEMANTIC_RECEIPT,
    {
      ...coordinates,
      sideId,
      evidence: {name: `${sideId}-semantic-receipt`, correct: 1000},
    },
  );
  const liveEngagement = createBenchmarkResourceWindowSourceArtifact(
    BENCHMARK_RESOURCE_ARTIFACT_KIND.LIVE_ENGAGEMENT,
    {
      ...coordinates,
      sideId,
      evidence: {
        name: `${sideId}-live-engagement`,
        transport: 'managed-postgresql',
        ...(calibrationArtifact === null ?
          {} :
          {amplificationPolicy: 'semantic_events_absent_zero_only'}),
      },
    },
  );
  const windowReceipt = createBenchmarkResourceWindowSourceArtifact(
    BENCHMARK_RESOURCE_ARTIFACT_KIND.WINDOW_RECEIPT,
    {
      ...coordinates,
      sideId,
      evidence: {
        name: `${sideId}-window-receipt`,
        completed: true,
      },
    },
  );
  const observationStart = calibrationArtifact ?? source(
    BENCHMARK_RESOURCE_ARTIFACT_KIND.SYNTHETIC_CALIBRATION,
    `${sideId}-resource-observation-start`,
    {cpuUsageNanoseconds: 1000 * multiplier, networkBytes: 100 * multiplier},
  );
  const observationEnd = calibrationArtifact ?? source(
    BENCHMARK_RESOURCE_ARTIFACT_KIND.SYNTHETIC_CALIBRATION,
    `${sideId}-resource-observation-end`,
    {cpuUsageNanoseconds: 6000 * multiplier, networkBytes: 2100 * multiplier},
  );
  return {
    capacitySample,
    semanticReceipt,
    liveEngagement,
    windowReceipt,
    observationStart,
    observationEnd,
    all: [
      capacitySample,
      semanticReceipt,
      liveEngagement,
      windowReceipt,
      ...(calibrationArtifact === null ?
        [observationStart, observationEnd] :
        []),
    ],
  };
}

function capacitySummary(
  sideId,
  sideIndex,
  capacitySample,
  capacityProtocol,
) {
  if (capacityProtocol !== null) {
    const protocolSideId =
      capacityProtocol.preregistration.sideIds[sideIndex];
    const capacity =
      capacityProtocol.report.summary.capacityBySide[protocolSideId];
    const curve = capacityProtocol.report.summary.capacityCurve.find(
      (entry) =>
        entry.offeredLoadPerSecond ===
          capacity.maxSloOfferedLoadPerSecond,
    );
    const interval =
      curve.sides[protocolSideId].correctThroughputPerSecond;
    return createBenchmarkResourceCapacitySummary({
      sideId,
      capacityCorrectOpsPerSecond:
        capacity.maxCorrectThroughputPerSecond,
      sampleCount: capacity.perBlock.length,
      confidenceInterval: {
        lower: interval.lower,
        upper: interval.upper,
      },
      sourceDigests: [capacitySample.digest],
    });
  }
  const value = sideId === FIXTURE_RESOURCE_SIDE_IDS[0] ?
    FIXTURE_SCALAR.CANDIDATE_CAPACITY :
    FIXTURE_SCALAR.BASELINE_CAPACITY;
  return createBenchmarkResourceCapacitySummary({
    sideId,
    capacityCorrectOpsPerSecond: value,
    sampleCount: FIXTURE_SCALAR.CAPACITY_SAMPLE_COUNT,
    confidenceInterval: {
      lower: value * FIXTURE_SCALAR.CAPACITY_CONFIDENCE_LOWER_FACTOR,
      upper: value * FIXTURE_SCALAR.CAPACITY_CONFIDENCE_UPPER_FACTOR,
    },
    sourceDigests: [capacitySample.digest],
  });
}

function createNonMeasuringFixtureCells({
  enabled,
  matrix,
  preregistration,
  runId,
  sourceRevision,
}) {
  if (!enabled) {
    return [];
  }
  const cells = [];
  for (let index = 1;
    index < matrix.artifact.payload.cells.length;
    index += 1) {
    cells.push(createBenchmarkResourceNonMeasuringCellEvidence({
      matrixManifestDigest: matrix.digest,
      matrixId: FIXTURE_RESOURCE_MATRIX_ID,
      cellId: matrix.artifact.payload.cells[index].cellId,
      pairId: FIXTURE_RESOURCE_PAIR_ID,
      runId,
      sideIds: FIXTURE_RESOURCE_SIDE_IDS,
      reasonCodes: [localText.PREREGISTERED_NON_MEASURING_FIXTURE_CELL],
      sourceDigests: [preregistration.digest],
      sourceRevision,
      producedAt: FIXTURE_RESOURCE_PRODUCED_AT,
      validUntil: FIXTURE_RESOURCE_VALID_UNTIL,
    }));
  }
  return cells;
}

function optionalFixtureArtifact(artifact) {
  return artifact === null ? [] : [artifact];
}

export function createBenchmarkResourceEvidenceFixture({
  calibrationArtifact = null,
  capacityProtocol = null,
  liveUtilizationOffset = 0,
  matrixSizeValues = [localText.SMALL],
  priceValidUntil = localText.VALUE_2026_07_29_T00_00_00_000_Z,
  sealNonMeasuringCells = true,
} = {}) {
  const identity = fixtureIdentity(calibrationArtifact);
  const fixtureRunId = identity.runId;
  const fixtureSourceRevision = identity.sourceRevision;
  const workloadManifest = source(
    BENCHMARK_RESOURCE_ARTIFACT_KIND.WORKLOAD_MANIFEST,
    'fixture-workload',
  );
  const alternativeTopology =
    alternativeTopologyFixture(calibrationArtifact);
  const preregistration = fixturePreregistration(capacityProtocol);
  const matrix = createBenchmarkResourceMatrixManifest({
    matrixId: FIXTURE_RESOURCE_MATRIX_ID,
    axes: [
      {id: 'size', values: matrixSizeValues},
      {id: 'skew', values: ['uniform']},
    ],
    sideIds: FIXTURE_RESOURCE_SIDE_IDS,
    workloadManifestDigest: workloadManifest.digest,
    alternativeTopologyDigest: alternativeTopology.digest,
    preregistrationDigest: preregistration.digest,
  });
  const inventory = createBenchmarkResourceComponentInventory({
    inventoryId: 'fixture-inventory-v1',
    matrixId: FIXTURE_RESOURCE_MATRIX_ID,
    sides: [
      inventorySide(FIXTURE_RESOURCE_SIDE_IDS[0], 2, calibrationArtifact),
      inventorySide(FIXTURE_RESOURCE_SIDE_IDS[1], 1, calibrationArtifact),
    ],
  });
  const price = createBenchmarkResourcePriceSheet({
    priceSheetId: 'fixture-price-sheet-v1',
    region: 'eu-north-1',
    currency: 'USD',
    priceDate: '2026-07-27',
    validFrom: '2026-07-27T00:00:00.000Z',
    validUntil: priceValidUntil,
    billingGranularity: 'per_second',
    reservationPolicy: 'on_demand',
    spotPolicy: 'excluded',
    taxPolicy: 'excluded',
    creditPolicy: 'excluded',
    exclusions: ['tax', 'credits', 'spot_discount'],
    unitPrices: unitPrices(),
  });
  const cell = matrix.artifact.payload.cells[0];
  const sideSources = [
    sideSourceArtifacts(
      FIXTURE_RESOURCE_SIDE_IDS[0],
      2,
      calibrationArtifact,
      capacityProtocol,
      0,
      {
        matrixId: FIXTURE_RESOURCE_MATRIX_ID,
        cellId: cell.cellId,
        pairId: FIXTURE_RESOURCE_PAIR_ID,
        runId: fixtureRunId,
      },
    ),
    sideSourceArtifacts(
      FIXTURE_RESOURCE_SIDE_IDS[1],
      1,
      calibrationArtifact,
      capacityProtocol,
      1,
      {
        matrixId: FIXTURE_RESOURCE_MATRIX_ID,
        cellId: cell.cellId,
        pairId: FIXTURE_RESOURCE_PAIR_ID,
        runId: fixtureRunId,
      },
    ),
  ];
  const windows = [];
  const capacities = [];
  for (let index = 0; index < FIXTURE_RESOURCE_SIDE_IDS.length; index += 1) {
    const sideId = FIXTURE_RESOURCE_SIDE_IDS[index];
    const sources = sideSources[index];
    const multiplier = index === 0 ? 2 : 1;
    windows.push(createBenchmarkResourceWindow({
      windowId: `${sideId}-window-v1`,
      matrixManifestDigest: matrix.digest,
      matrixId: FIXTURE_RESOURCE_MATRIX_ID,
      cellId: cell.cellId,
      pairId: FIXTURE_RESOURCE_PAIR_ID,
      runId: fixtureRunId,
      sideId,
      windowReceiptDigest: sources.windowReceipt.digest,
      capacitySampleDigest: sources.capacitySample.digest,
      semanticReceiptDigest: sources.semanticReceipt.digest,
      liveEngagementDigest: sources.liveEngagement.digest,
      liveCalibrationDigest: sources.observationEnd.digest,
      startedAt: localText.VALUE_2026_07_27_T11_59_00_000_Z,
      endedAt: FIXTURE_RESOURCE_PRODUCED_AT,
      correctSloEligibleOperations: FIXTURE_SCALAR.OPERATIONS_PER_WINDOW,
      components: componentSamples(
        sideId,
        sources.observationStart.digest,
        sources.observationEnd.digest,
        multiplier,
        calibrationArtifact,
        liveUtilizationOffset,
      ),
    }));
    capacities.push(capacitySummary(
      sideId,
      index,
      sources.capacitySample,
      capacityProtocol,
    ));
  }
  const costs = windows.map((window) =>
    computeBenchmarkResourceWindowCost(
      window.artifact.payload,
      inventory.artifact.payload,
      price.artifact.payload,
    ).costPerMillionCorrectOperations);
  const capacityEffect = createBenchmarkResourcePairedEffect({
    effectType: BENCHMARK_RESOURCE_EFFECT.CAPACITY,
    numeratorSideId: FIXTURE_RESOURCE_SIDE_IDS[0],
    denominatorSideId: FIXTURE_RESOURCE_SIDE_IDS[1],
    numeratorValue:
      capacities[0].artifact.payload.capacityCorrectOpsPerSecond,
    denominatorValue:
      capacities[1].artifact.payload.capacityCorrectOpsPerSecond,
    confidenceInterval: {
      lower:
        capacities[0].artifact.payload.confidenceInterval.lower /
        capacities[1].artifact.payload.confidenceInterval.upper,
      upper:
        capacities[0].artifact.payload.confidenceInterval.upper /
        capacities[1].artifact.payload.confidenceInterval.lower,
    },
    practicalThreshold: 0.05,
    sampleCount: Math.min(
      capacities[0].artifact.payload.sampleCount,
      capacities[1].artifact.payload.sampleCount,
    ),
    sourceDigests: capacities.map((capacity) => capacity.digest),
    currency: BENCHMARK_RESOURCE_NO_CURRENCY,
  });
  const costEffect = createBenchmarkResourcePairedEffect({
    effectType: BENCHMARK_RESOURCE_EFFECT.COST,
    numeratorSideId: FIXTURE_RESOURCE_SIDE_IDS[0],
    denominatorSideId: FIXTURE_RESOURCE_SIDE_IDS[1],
    numeratorValue: costs[0],
    denominatorValue: costs[1],
    confidenceInterval: {
      lower: costs[0] / costs[1],
      upper: costs[0] / costs[1],
    },
    practicalThreshold: 0.05,
    sampleCount: 1,
    sourceDigests: [
      inventory.digest,
      price.digest,
      ...windows.map((window) => window.digest),
    ],
    currency: 'USD',
  });
  const cellEvidence = createBenchmarkResourceMeasuringCellEvidence({
    matrixManifestDigest: matrix.digest,
    matrixId: FIXTURE_RESOURCE_MATRIX_ID,
    cellId: cell.cellId,
    pairId: FIXTURE_RESOURCE_PAIR_ID,
    runId: fixtureRunId,
    sideIds: FIXTURE_RESOURCE_SIDE_IDS,
    capacityReportDigests: capacities.map((capacity) => capacity.digest),
    semanticReceiptDigests:
      sideSources.map((sources) => sources.semanticReceipt.digest),
    liveEngagementDigests:
      sideSources.map((sources) => sources.liveEngagement.digest),
    componentInventoryDigest: inventory.digest,
    priceSheetDigest: price.digest,
    resourceWindowDigests: windows.map((window) => window.digest),
    capacityEffect,
    costEffect,
    sourceRevision: fixtureSourceRevision,
    producedAt: FIXTURE_RESOURCE_PRODUCED_AT,
    validUntil: FIXTURE_RESOURCE_VALID_UNTIL,
  });
  const nonMeasuringCells = createNonMeasuringFixtureCells({
    enabled: sealNonMeasuringCells,
    matrix,
    preregistration,
    runId: fixtureRunId,
    sourceRevision: fixtureSourceRevision,
  });
  const artifacts = [
    workloadManifest,
    alternativeTopology,
    preregistration,
    matrix,
    inventory,
    price,
    ...optionalFixtureArtifact(calibrationArtifact),
    ...sideSources.flatMap((sources) => sources.all),
    ...windows,
    ...capacities,
    cellEvidence,
    ...nonMeasuringCells,
  ];
  const root = createBenchmarkResourceEvidenceRoot({
    matrixManifestDigest: matrix.digest,
    componentInventoryDigest: inventory.digest,
    priceSheetDigest: price.digest,
    cellEvidenceDigests: [
      cellEvidence.digest,
      ...nonMeasuringCells.map((cellArtifact) => cellArtifact.digest),
    ],
    sourceRevision: fixtureSourceRevision,
    producedAt: FIXTURE_RESOURCE_PRODUCED_AT,
    validUntil: FIXTURE_RESOURCE_VALID_UNTIL,
    artifacts,
  });
  const resolver = createBenchmarkResourceMemoryResolver([...artifacts, root]);
  return {
    receipt: {rootDigest: root.digest, resolver},
    root,
    artifacts,
    matrix,
    inventory,
    price,
    windows,
    capacities,
    cellEvidence,
    nonMeasuringCells,
    capacityEffect,
    costEffect,
    costs,
  };
}
