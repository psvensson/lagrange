import {
  appendOwnArrayValue,
} from './benchmark-semantic-integrity.js';
import {
  createBenchmarkResourceComponentInventory,
  createBenchmarkResourceWindow,
} from './benchmark-resource-accounting.js';
import {
  BENCHMARK_RESOURCE_NO_CURRENCY,
  computeBenchmarkResourceWindowCost,
  createBenchmarkResourcePairedEffect,
  createBenchmarkResourcePriceSheet,
} from './benchmark-resource-cost-and-effects.js';
import {
  assertBenchmarkResourceArray,
  assertBenchmarkResourceCanonicalData,
  assertBenchmarkResourceExactRecord,
  assertBenchmarkResourceInteger,
  assertBenchmarkResourceNumber,
  assertBenchmarkResourceText,
  createBenchmarkResourceMemoryResolver,
} from './benchmark-resource-evidence-data.js';
import {
  createBenchmarkResourceEvidenceRoot,
  createBenchmarkResourceMeasuringCellEvidence,
  createBenchmarkResourceSourceArtifact,
} from './benchmark-resource-evidence-root.js';
import {
  createBenchmarkResourceCapacitySummary,
} from './benchmark-resource-capacity-summary.js';
import {
  benchmarkResourceLiveCalibrationContainsComponent,
  inspectBenchmarkResourceLiveCalibrationArtifact,
} from './benchmark-resource-live-observation-authority.js';
import {
  createBenchmarkResourceMatrixManifest,
} from './benchmark-resource-matrix-manifest.js';
import {
  createBenchmarkResourceWindowSourceArtifact,
} from './benchmark-resource-window-source.js';
import {
  BENCHMARK_RESOURCE_ARTIFACT_KIND,
  BENCHMARK_RESOURCE_EFFECT,
  BENCHMARK_RESOURCE_LIMIT,
} from './benchmark-resource-contract-constants.js';
const localText = Object.freeze({
  PAIRED_RUN_SIDES: 'pairedRun.sides',
  PAIRED_RUN_SIDES_EXACT_PAIR_REQUIRED: 'pairedRun.sides:exact_pair_required',
  PAIRED_RUN_SIDES_DISTINCT_REQUIRED: 'pairedRun.sides:distinct_required',
  PAIRED_RUN: 'pairedRun',
  PAIRED_RUN_PRACTICAL_THRESHOLD: 'pairedRun.practicalThreshold',
  PAIRED_RUN_CALIBRATION_ARTIFACT: 'pairedRun.calibrationArtifact',
  PAIRED_RUN_CALIBRATION_ARTIFACT_INVALID_OR_MISMATCHED: 'pairedRun.calibrationArtifact:invalid_or_mismatched',
  PAIRED_RUN_CALIBRATION_COMPONENT_CLOSURE_REQUIRED:
    'pairedRun.calibrationArtifact:component_closure_required',
  PAIRED_RUN_MATRIX_SINGLE_CELL_REQUIRED: 'pairedRun.matrix:single_cell_required',
  LEGACY_AGGREGATE_NOT_C3_ADMISSIBLE:
    'legacy_aggregate_not_c3_admissible',
});


const inputKeys = Object.freeze([
  'matrixId',
  'axes',
  'pairId',
  'runId',
  'sourceRevision',
  'producedAt',
  'validUntil',
  'workloadManifest',
  'alternativeTopology',
  'preregistration',
  'profileEnvelope',
  'inventoryId',
  'priceSheet',
  'calibrationArtifact',
  'sides',
  'practicalThreshold',
]);
const sideKeys = Object.freeze([
  'sideId',
  'capacityCorrectOpsPerSecond',
  'capacityConfidenceInterval',
  'capacitySamples',
  'capacityProtocolEvidence',
  'correctSloEligibleOperations',
  'startedAt',
  'endedAt',
  'semanticReceipt',
  'liveEngagement',
  'windowReceipt',
  'components',
]);
const componentKeys = Object.freeze([
  'componentId',
  'role',
  'billingTreatment',
  'provisioned',
  'minimumFootprint',
  'reservedHeadroomRatio',
  'exclusionReason',
  'utilized',
  'amplification',
]);
const artifactEnvelopeKeys =
  Object.freeze(['digest', 'bytes', 'byteLength', 'artifact']);

function fail(message) {
  throw new TypeError(message);
}

function source(kind, payload) {
  assertBenchmarkResourceCanonicalData(payload);
  return createBenchmarkResourceSourceArtifact(kind, payload);
}

function copySideIds(sides) {
  assertBenchmarkResourceArray(sides, localText.PAIRED_RUN_SIDES, 2);
  if (sides.length !== 2) fail(localText.PAIRED_RUN_SIDES_EXACT_PAIR_REQUIRED);
  const sideIds = [];
  for (let index = 0; index < sides.length; index += 1) {
    assertBenchmarkResourceExactRecord(
      sides[index],
      sideKeys,
      `pairedRun.sides.${index}`,
    );
    assertBenchmarkResourceText(
      sides[index].sideId,
      `pairedRun.sides.${index}.sideId`,
    );
    appendOwnArrayValue(sideIds, sides[index].sideId);
  }
  if (sideIds[0] === sideIds[1]) fail(localText.PAIRED_RUN_SIDES_DISTINCT_REQUIRED);
  return sideIds;
}

function copyInventoryComponents(side, calibrationArtifact, path) {
  assertBenchmarkResourceArray(
    side.components,
    `${path}.components`,
    BENCHMARK_RESOURCE_LIMIT.COMPONENTS_PER_SIDE,
  );
  if (side.components.length === 0) {
    fail(`${path}.components:non_empty_required`);
  }
  const inventory = [];
  for (let index = 0; index < side.components.length; index += 1) {
    const component = side.components[index];
    assertBenchmarkResourceExactRecord(
      component,
      componentKeys,
      `${path}.components.${index}`,
    );
    assertBenchmarkResourceText(
      component.componentId,
      `${path}.components.${index}.componentId`,
    );
    if (
      !benchmarkResourceLiveCalibrationContainsComponent(
        calibrationArtifact.artifact,
        side.sideId,
        component.componentId,
      )
    ) {
      fail(`${path}.components:live_calibration_component_missing`);
    }
    appendOwnArrayValue(inventory, {
      componentId: component.componentId,
      role: component.role,
      billingTreatment: component.billingTreatment,
      provisioned: component.provisioned,
      minimumFootprint: component.minimumFootprint,
      reservedHeadroomRatio: component.reservedHeadroomRatio,
      exclusionReason: component.exclusionReason,
    });
  }
  return inventory;
}

function resourceComponents(side, calibrationDigest) {
  const components = [];
  for (let index = 0; index < side.components.length; index += 1) {
    const component = side.components[index];
    appendOwnArrayValue(components, {
      componentId: component.componentId,
      observationStartDigest: calibrationDigest,
      observationEndDigest: calibrationDigest,
      utilized: component.utilized,
      amplification: component.amplification,
    });
  }
  return components;
}

function capacityEffect(capacities, sideIds, practicalThreshold) {
  const numerator = capacities[0].artifact.payload;
  const denominator = capacities[1].artifact.payload;
  return createBenchmarkResourcePairedEffect({
    effectType: BENCHMARK_RESOURCE_EFFECT.CAPACITY,
    numeratorSideId: sideIds[0],
    denominatorSideId: sideIds[1],
    numeratorValue: numerator.capacityCorrectOpsPerSecond,
    denominatorValue: denominator.capacityCorrectOpsPerSecond,
    confidenceInterval: {
      lower:
        numerator.confidenceInterval.lower /
        denominator.confidenceInterval.upper,
      upper:
        numerator.confidenceInterval.upper /
        denominator.confidenceInterval.lower,
    },
    practicalThreshold,
    sampleCount:
      numerator.sampleCount < denominator.sampleCount ?
        numerator.sampleCount :
        denominator.sampleCount,
    sourceDigests: [capacities[0].digest, capacities[1].digest],
    currency: BENCHMARK_RESOURCE_NO_CURRENCY,
  });
}

function costEffect(
  windows,
  inventory,
  price,
  sideIds,
  practicalThreshold,
) {
  const costs = [];
  for (let index = 0; index < windows.length; index += 1) {
    appendOwnArrayValue(
      costs,
      computeBenchmarkResourceWindowCost(
        windows[index].artifact.payload,
        inventory.artifact.payload,
        price.artifact.payload,
      ).costPerMillionCorrectOperations,
    );
  }
  const estimate = costs[0] / costs[1];
  return createBenchmarkResourcePairedEffect({
    effectType: BENCHMARK_RESOURCE_EFFECT.COST,
    numeratorSideId: sideIds[0],
    denominatorSideId: sideIds[1],
    numeratorValue: costs[0],
    denominatorValue: costs[1],
    confidenceInterval: {lower: estimate, upper: estimate},
    practicalThreshold,
    sampleCount: 1,
    sourceDigests: [
      inventory.digest,
      price.digest,
      windows[0].digest,
      windows[1].digest,
    ],
    currency: price.artifact.payload.currency,
  });
}

export function createBenchmarkResourceSingleCellPairedEvidence(input) {
  assertBenchmarkResourceExactRecord(input, inputKeys, localText.PAIRED_RUN);
  const textFields = [
    'matrixId',
    'pairId',
    'runId',
    'sourceRevision',
    'producedAt',
    'validUntil',
    'inventoryId',
  ];
  for (let index = 0; index < textFields.length; index += 1) {
    const field = textFields[index];
    assertBenchmarkResourceText(input[field], `pairedRun.${field}`);
  }
  assertBenchmarkResourceNumber(
    input.practicalThreshold,
    localText.PAIRED_RUN_PRACTICAL_THRESHOLD,
  );
  assertBenchmarkResourceExactRecord(
    input.calibrationArtifact,
    artifactEnvelopeKeys,
    localText.PAIRED_RUN_CALIBRATION_ARTIFACT,
  );
  const calibrationInspection =
    inspectBenchmarkResourceLiveCalibrationArtifact(
      input.calibrationArtifact.artifact,
    );
  if (
    !calibrationInspection.valid ||
    input.calibrationArtifact.artifact.payload.runId !== input.runId ||
    input.calibrationArtifact.artifact.payload.sourceRevision !==
      input.sourceRevision
  ) {
    fail(localText.PAIRED_RUN_CALIBRATION_ARTIFACT_INVALID_OR_MISMATCHED);
  }
  const sideIds = copySideIds(input.sides);
  const workloadManifest = source(
    BENCHMARK_RESOURCE_ARTIFACT_KIND.WORKLOAD_MANIFEST,
    input.workloadManifest,
  );
  const alternativeTopology = source(
    BENCHMARK_RESOURCE_ARTIFACT_KIND.ALTERNATIVE_TOPOLOGY,
    input.alternativeTopology,
  );
  const preregistration = source(
    BENCHMARK_RESOURCE_ARTIFACT_KIND.PREREGISTRATION,
    input.preregistration,
  );
  const profileEnvelope = source(
    BENCHMARK_RESOURCE_ARTIFACT_KIND.PROFILE_ENVELOPE,
    input.profileEnvelope,
  );
  const matrix = createBenchmarkResourceMatrixManifest({
    matrixId: input.matrixId,
    axes: input.axes,
    sideIds,
    workloadManifestDigest: workloadManifest.digest,
    alternativeTopologyDigest: alternativeTopology.digest,
    preregistrationDigest: preregistration.digest,
    profileEnvelopeDigest: profileEnvelope.digest,
  });
  if (matrix.artifact.payload.cells.length !== 1) {
    fail(localText.PAIRED_RUN_MATRIX_SINGLE_CELL_REQUIRED);
  }
  const inventorySides = [];
  let inventoryComponentCount = 0;
  for (let index = 0; index < input.sides.length; index += 1) {
    const components = copyInventoryComponents(
      input.sides[index],
      input.calibrationArtifact,
      `pairedRun.sides.${index}`,
    );
    inventoryComponentCount += components.length;
    appendOwnArrayValue(inventorySides, {
      sideId: input.sides[index].sideId,
      components,
    });
  }
  if (
    input.calibrationArtifact.artifact.payload.components.length !==
      inventoryComponentCount
  ) {
    fail(localText.PAIRED_RUN_CALIBRATION_COMPONENT_CLOSURE_REQUIRED);
  }
  const inventory = createBenchmarkResourceComponentInventory({
    inventoryId: input.inventoryId,
    matrixId: input.matrixId,
    sides: inventorySides,
  });
  const price = createBenchmarkResourcePriceSheet(input.priceSheet);
  const cell = matrix.artifact.payload.cells[0];
  const sideSources = [];
  const windows = [];
  const capacities = [];
  const pairedOfferedLoad = Math.max(
    1,
    Math.round(Math.min(
      input.sides[0].capacityCorrectOpsPerSecond,
      input.sides[1].capacityCorrectOpsPerSecond,
    )),
  );
  for (let index = 0; index < input.sides.length; index += 1) {
    const side = input.sides[index];
    assertBenchmarkResourceArray(
      side.capacitySamples,
      `pairedRun.sides.${index}.capacitySamples`,
      BENCHMARK_RESOURCE_LIMIT.RESOURCE_WINDOWS_PER_CELL,
    );
    if (side.capacitySamples.length === 0) {
      fail(`pairedRun.sides.${index}.capacitySamples:non_empty_required`);
    }
    assertBenchmarkResourceCanonicalData(side.capacityProtocolEvidence);
    assertBenchmarkResourceInteger(
      side.correctSloEligibleOperations,
      `pairedRun.sides.${index}.correctSloEligibleOperations`,
    );
    const coordinates = {
      matrixId: input.matrixId,
      cellId: cell.cellId,
      pairId: input.pairId,
      runId: input.runId,
      sideId: side.sideId,
      pairedBlockId: `${input.pairId}-block-0-load-0`,
      profileIdentity: input.profileEnvelope.profileIdentity,
      blockIndex: 0,
      blockedOrderIndex: index,
      offeredLoad: pairedOfferedLoad,
      loadIndex: 0,
      phase: 'measured',
    };
    const capacitySample = createBenchmarkResourceWindowSourceArtifact(
      BENCHMARK_RESOURCE_ARTIFACT_KIND.CAPACITY_SAMPLE,
      {
        ...coordinates,
        evidence: {
          version: 'benchmark-resource-capacity-samples-v1',
          samples: side.capacitySamples,
          admission: localText.LEGACY_AGGREGATE_NOT_C3_ADMISSIBLE,
        },
      },
    );
    const semanticReceipt = createBenchmarkResourceWindowSourceArtifact(
      BENCHMARK_RESOURCE_ARTIFACT_KIND.SEMANTIC_RECEIPT,
      {...coordinates, evidence: side.semanticReceipt},
    );
    const liveEngagement = createBenchmarkResourceWindowSourceArtifact(
      BENCHMARK_RESOURCE_ARTIFACT_KIND.LIVE_ENGAGEMENT,
      {...coordinates, evidence: side.liveEngagement},
    );
    const windowReceipt = createBenchmarkResourceWindowSourceArtifact(
      BENCHMARK_RESOURCE_ARTIFACT_KIND.WINDOW_RECEIPT,
      {...coordinates, evidence: side.windowReceipt},
    );
    const sources = {
      capacitySample,
      semanticReceipt,
      liveEngagement,
      windowReceipt,
    };
    appendOwnArrayValue(sideSources, sources);
    const window = createBenchmarkResourceWindow({
      windowId: `${input.runId}-${side.sideId}-resource-window`,
      matrixManifestDigest: matrix.digest,
      matrixId: input.matrixId,
      cellId: cell.cellId,
      pairId: input.pairId,
      runId: input.runId,
      sideId: side.sideId,
      pairedBlockId: coordinates.pairedBlockId,
      profileIdentity: coordinates.profileIdentity,
      blockIndex: coordinates.blockIndex,
      blockedOrderIndex: coordinates.blockedOrderIndex,
      offeredLoad: coordinates.offeredLoad,
      loadIndex: coordinates.loadIndex,
      phase: coordinates.phase,
      windowReceiptDigest: windowReceipt.digest,
      capacitySampleDigest: capacitySample.digest,
      semanticReceiptDigest: semanticReceipt.digest,
      liveEngagementDigest: liveEngagement.digest,
      liveCalibrationDigest: input.calibrationArtifact.digest,
      startedAt: side.startedAt,
      endedAt: side.endedAt,
      correctSloEligibleOperations: side.correctSloEligibleOperations,
      components: resourceComponents(
        side,
        input.calibrationArtifact.digest,
      ),
    });
    appendOwnArrayValue(windows, window);
    assertBenchmarkResourceNumber(
      side.capacityCorrectOpsPerSecond,
      `pairedRun.sides.${index}.capacityCorrectOpsPerSecond`,
    );
    const capacity = createBenchmarkResourceCapacitySummary({
      sideId: side.sideId,
      capacityCorrectOpsPerSecond: side.capacityCorrectOpsPerSecond,
      sampleCount: side.capacitySamples.length,
      confidenceInterval: side.capacityConfidenceInterval,
      sourceDigests: [capacitySample.digest],
    });
    appendOwnArrayValue(capacities, capacity);
  }
  const pairedCapacityEffect =
    capacityEffect(capacities, sideIds, input.practicalThreshold);
  const pairedCostEffect = costEffect(
    windows,
    inventory,
    price,
    sideIds,
    input.practicalThreshold,
  );
  const cellEvidence = createBenchmarkResourceMeasuringCellEvidence({
    matrixManifestDigest: matrix.digest,
    matrixId: input.matrixId,
    cellId: cell.cellId,
    pairId: input.pairId,
    runId: input.runId,
    sideIds,
    capacityReportDigests: [capacities[0].digest, capacities[1].digest],
    semanticReceiptDigests: [
      sideSources[0].semanticReceipt.digest,
      sideSources[1].semanticReceipt.digest,
    ],
    liveEngagementDigests: [
      sideSources[0].liveEngagement.digest,
      sideSources[1].liveEngagement.digest,
    ],
    componentInventoryDigest: inventory.digest,
    priceSheetDigest: price.digest,
    resourceWindowDigests: [windows[0].digest, windows[1].digest],
    capacityEffect: pairedCapacityEffect,
    costEffect: pairedCostEffect,
    sourceRevision: input.sourceRevision,
    producedAt: input.producedAt,
    validUntil: input.validUntil,
  });
  const artifacts = [
    workloadManifest,
    alternativeTopology,
    preregistration,
    profileEnvelope,
    matrix,
    inventory,
    price,
    input.calibrationArtifact,
  ];
  for (let index = 0; index < sideSources.length; index += 1) {
    appendOwnArrayValue(artifacts, sideSources[index].capacitySample);
    appendOwnArrayValue(artifacts, sideSources[index].semanticReceipt);
    appendOwnArrayValue(artifacts, sideSources[index].liveEngagement);
    appendOwnArrayValue(artifacts, sideSources[index].windowReceipt);
    appendOwnArrayValue(artifacts, windows[index]);
    appendOwnArrayValue(artifacts, capacities[index]);
  }
  appendOwnArrayValue(artifacts, cellEvidence);
  const root = createBenchmarkResourceEvidenceRoot({
    matrixManifestDigest: matrix.digest,
    componentInventoryDigest: inventory.digest,
    priceSheetDigest: price.digest,
    cellEvidenceDigests: [cellEvidence.digest],
    sourceRevision: input.sourceRevision,
    producedAt: input.producedAt,
    validUntil: input.validUntil,
    artifacts,
  });
  return {
    receipt: {
      rootDigest: root.digest,
      resolver: createBenchmarkResourceMemoryResolver([...artifacts, root]),
    },
    root,
    artifacts,
    matrix,
    profileEnvelope,
    inventory,
    price,
    windows,
    capacities,
    cellEvidence,
    capacityEffect: pairedCapacityEffect,
    costEffect: pairedCostEffect,
  };
}
