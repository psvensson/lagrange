import {
  appendOwnArrayValue,
} from './benchmark-semantic-integrity.js';
import {
  encodeBenchmarkCapacityHeterogeneousOperationEvidence,
} from './benchmark-capacity-heterogeneous-protocol.js';
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
  createBenchmarkResourceCapacitySummary,
} from './benchmark-resource-capacity-summary.js';
import {
  bootstrapBenchmarkPairedRatioInterval,
} from './benchmark-capacity-statistics.js';
import {
  createBenchmarkResourceEvidenceRoot,
  createBenchmarkResourceMeasuringCellEvidence,
  createBenchmarkResourceSourceArtifact,
} from './benchmark-resource-evidence-root.js';
import {
  createBenchmarkResourceMemoryResolver,
} from './benchmark-resource-evidence-data.js';
import {
  createBenchmarkResourceMatrixManifest,
} from './benchmark-resource-matrix-manifest.js';
import {
  deriveBenchmarkResourceLiveComponentAccounting,
  resolveBenchmarkResourceLiveCalibrationComponent,
} from './benchmark-resource-live-observation-authority.js';
import {
  deriveBenchmarkResourceLiveInventoryComponentAccounting,
} from './benchmark-resource-live-root-validation.js';
import {
  createBenchmarkResourceWindowSourceArtifact,
} from './benchmark-resource-window-source.js';
import {
  BENCHMARK_RESOURCE_ARTIFACT_KIND,
  BENCHMARK_RESOURCE_CAPACITY_SOURCE,
  BENCHMARK_RESOURCE_EFFECT,
} from './benchmark-resource-contract-constants.js';

const AMPLIFICATION_POLICY = 'semantic_events_absent_zero_only';
const COST_BOOTSTRAP_SEED_OFFSET = 1_129_273_684;
const mathMin = Math.min;
const localText = Object.freeze({
  COST_WINDOW_SIDE_UNKNOWN: 'cost window side is unknown',
  MEASURED: 'measured',
  MEASURED_COORDINATE_UNRESOLVED:
    'measured C3 coordinate is unresolved',
  PAIRED_COST_BLOCKS_INCOMPLETE: 'paired cost blocks are incomplete',
  REPRESENTATIVE_MATRIX_CELL_REQUIRED:
    'representative adapter matrix must contain one cell',
});

function fail(reason) {
  throw new TypeError(
    `capacity protocol resource evidence failed: ${reason}`,
  );
}

function source(kind, payload) {
  return createBenchmarkResourceSourceArtifact(kind, payload);
}

function findSample(report, digest) {
  for (let index = 0; index < report.rawSamples.length; index += 1) {
    if (report.rawSamples[index].sampleDigest === digest) {
      return report.rawSamples[index];
    }
  }
  return undefined;
}

function isFixedSloCostSample(sample, report) {
  return sample.correctThroughputPerSecond ===
    report.summary.capacityBySide[sample.sideId]
      .perBlock[sample.blockIndex];
}

function findWindowEvidence(windowEvidence, receiptDigest) {
  for (let index = 0; index < windowEvidence.length; index += 1) {
    if (
      windowEvidence[index].c3.receipt.windowReceiptDigest ===
        receiptDigest
    ) {
      return windowEvidence[index];
    }
  }
  return undefined;
}

function findSide(sides, sideId) {
  for (let index = 0; index < sides.length; index += 1) {
    if (sides[index].sideId === sideId) return sides[index];
  }
  return undefined;
}

function findExactIndex(values, expected) {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === expected) return index;
  }
  return -1;
}

function artifactDigests(artifacts) {
  const digests = [];
  for (let index = 0; index < artifacts.length; index += 1) {
    appendOwnArrayValue(digests, artifacts[index].digest);
  }
  return digests;
}

function orderedSourceArtifactDigests(orderedSources, field) {
  const digests = [];
  for (let index = 0; index < orderedSources.length; index += 1) {
    appendOwnArrayValue(digests, orderedSources[index][field].digest);
  }
  return digests;
}

function appendArrayValues(target, values) {
  for (let index = 0; index < values.length; index += 1) {
    appendOwnArrayValue(target, values[index]);
  }
  return target;
}

function inventory(input, calibrations) {
  const sides = [];
  for (let sideIndex = 0;
    sideIndex < input.sideIds.length;
    sideIndex += 1) {
    const sideId = input.sideIds[sideIndex];
    const configuredSide = findSide(input.inventorySides, sideId);
    if (configuredSide === undefined) {
      fail(`inventory side missing: ${sideId}`);
    }
    const components = [];
    for (let componentIndex = 0;
      componentIndex < configuredSide.components.length;
      componentIndex += 1) {
      const definition = configuredSide.components[componentIndex];
      const observations = [];
      for (let index = 0; index < calibrations.length; index += 1) {
        const observation =
          resolveBenchmarkResourceLiveCalibrationComponent(
            calibrations[index].artifact,
            sideId,
            definition.componentId,
          );
        if (observation === undefined) {
          fail(`calibration component missing: ${definition.componentId}`);
        }
        appendOwnArrayValue(observations, observation);
      }
      const accounting =
        deriveBenchmarkResourceLiveInventoryComponentAccounting(
          observations,
        );
      appendOwnArrayValue(components, {
        componentId: definition.componentId,
        role: definition.role,
        billingTreatment: definition.billingTreatment,
        provisioned: accounting.provisioned,
        minimumFootprint: accounting.minimumFootprint,
        reservedHeadroomRatio: accounting.reservedHeadroomRatio,
        exclusionReason: definition.exclusionReason,
      });
    }
    appendOwnArrayValue(sides, {sideId, components});
  }
  return createBenchmarkResourceComponentInventory({
    inventoryId: input.inventoryId,
    matrixId: input.matrixId,
    sides,
  });
}

function windowComponents(
  calibration,
  sideId,
  componentDefinitions,
) {
  const components = [];
  for (let index = 0; index < componentDefinitions.length; index += 1) {
    const definition = componentDefinitions[index];
    const observation =
      resolveBenchmarkResourceLiveCalibrationComponent(
        calibration.artifact,
        sideId,
        definition.componentId,
      );
    if (observation === undefined) {
      fail(`window component missing: ${definition.componentId}`);
    }
    const accounting =
      deriveBenchmarkResourceLiveComponentAccounting(observation);
    appendOwnArrayValue(components, {
      componentId: definition.componentId,
      observationStartDigest: calibration.digest,
      observationEndDigest: calibration.digest,
      utilized: accounting.utilized,
      amplification: accounting.amplification,
    });
  }
  return components;
}

function protocolEvidence(input, sideId, sideIndex) {
  return {
    version: BENCHMARK_RESOURCE_CAPACITY_SOURCE.VERSION,
    evidenceClass: BENCHMARK_RESOURCE_CAPACITY_SOURCE.EVIDENCE_CLASS,
    mappedSideId: sideId,
    protocolSideId: input.capacityPreregistration.sideIds[sideIndex],
    artifactReceipt: {
      reportDigest: input.capacityReport.reportDigest,
      preregistrationDigest:
        input.capacityPreregistration.manifestDigest,
    },
    preregistration: input.capacityPreregistration,
    report: input.capacityReport,
  };
}

function capacitySummary(input, sideId, sideIndex, samples) {
  const capacity = input.capacityReport.summary.capacityBySide[sideId];
  if (
    capacity === undefined ||
    capacity.maxSloOfferedLoadPerSecond === null
  ) {
    fail(`terminal capacity missing: ${sideId}`);
  }
  let curve;
  for (let index = 0;
    index < input.capacityReport.summary.capacityCurve.length;
    index += 1) {
    const candidate =
      input.capacityReport.summary.capacityCurve[index];
    if (
      candidate.offeredLoadPerSecond ===
        capacity.maxSloOfferedLoadPerSecond
    ) {
      curve = candidate;
      break;
    }
  }
  const interval = curve?.sides?.[sideId]?.correctThroughputPerSecond;
  if (interval === undefined || capacity.perBlock.length === 0) {
    fail(`terminal capacity interval missing: ${sideId}`);
  }
  return createBenchmarkResourceCapacitySummary({
    sideId,
    capacityCorrectOpsPerSecond:
      capacity.maxCorrectThroughputPerSecond,
    sampleCount: capacity.perBlock.length,
    confidenceInterval: {
      lower: interval.lower,
      upper: interval.upper,
    },
    sourceDigests: artifactDigests(samples),
  });
}

function capacityEffect(input, capacities) {
  return createBenchmarkResourcePairedEffect({
    effectType: BENCHMARK_RESOURCE_EFFECT.CAPACITY,
    numeratorSideId: input.sideIds[0],
    denominatorSideId: input.sideIds[1],
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
    practicalThreshold: input.practicalThreshold,
    sampleCount: mathMin(
      capacities[0].artifact.payload.sampleCount,
      capacities[1].artifact.payload.sampleCount,
    ),
    sourceDigests: artifactDigests(capacities),
    currency: BENCHMARK_RESOURCE_NO_CURRENCY,
  });
}

function findCostBlock(blocks, blockIndex) {
  for (let index = 0; index < blocks.length; index += 1) {
    if (blocks[index].blockIndex === blockIndex) return blocks[index];
  }
  return undefined;
}

function costBlocks(input, windows, inventoryArtifact, priceArtifact) {
  const blocks = [];
  const sourceDigests = [
    inventoryArtifact.digest,
    priceArtifact.digest,
  ];
  const windowDigestsBySide = [[], []];
  for (let index = 0; index < windows.length; index += 1) {
    const payload = windows[index].artifact.payload;
    if (payload.correctSloEligibleOperations === 0) continue;
    const sideIndex = findExactIndex(input.sideIds, payload.sideId);
    if (sideIndex < 0) fail(localText.COST_WINDOW_SIDE_UNKNOWN);
    let block = findCostBlock(blocks, payload.blockIndex);
    if (block === undefined) {
      block = {
        blockIndex: payload.blockIndex,
        costs: [null, null],
      };
      appendOwnArrayValue(blocks, block);
    }
    if (block.costs[sideIndex] !== null) {
      fail(`duplicate cost window: ${payload.blockIndex}:${payload.sideId}`);
    }
    block.costs[sideIndex] = computeBenchmarkResourceWindowCost(
      payload,
      inventoryArtifact.artifact.payload,
      priceArtifact.artifact.payload,
    ).costPerMillionCorrectOperations;
    appendOwnArrayValue(
      windowDigestsBySide[sideIndex],
      windows[index].digest,
    );
  }
  if (
    blocks.length !== input.capacityReport.completedBlocks ||
    blocks.length === 0
  ) {
    fail(localText.PAIRED_COST_BLOCKS_INCOMPLETE);
  }
  const pairs = [];
  let numeratorTotal = 0;
  let denominatorTotal = 0;
  for (let index = 0; index < blocks.length; index += 1) {
    const costs = blocks[index].costs;
    if (
      costs[0] === null ||
      costs[1] === null ||
      costs[0] <= 0 ||
      costs[1] <= 0
    ) {
      fail(`paired cost block is incomplete: ${blocks[index].blockIndex}`);
    }
    appendOwnArrayValue(pairs, [costs[0], costs[1]]);
    numeratorTotal += costs[0];
    denominatorTotal += costs[1];
  }
  for (let sideIndex = 0;
    sideIndex < windowDigestsBySide.length;
    sideIndex += 1) {
    for (let index = 0;
      index < windowDigestsBySide[sideIndex].length;
      index += 1) {
      appendOwnArrayValue(
        sourceDigests,
        windowDigestsBySide[sideIndex][index],
      );
    }
  }
  return {blocks, pairs, numeratorTotal, denominatorTotal, sourceDigests};
}

function costEffect(input, windows, inventoryArtifact, priceArtifact) {
  const costs = costBlocks(
    input, windows, inventoryArtifact, priceArtifact,
  );
  const interval = bootstrapBenchmarkPairedRatioInterval(
    costs.pairs,
    input.capacityPreregistration.statistics.confidenceLevel,
    input.capacityPreregistration.statistics.bootstrapResamples,
    input.capacityPreregistration.randomization.seed +
      COST_BOOTSTRAP_SEED_OFFSET,
  );
  return createBenchmarkResourcePairedEffect({
    effectType: BENCHMARK_RESOURCE_EFFECT.COST,
    numeratorSideId: input.sideIds[0],
    denominatorSideId: input.sideIds[1],
    numeratorValue: costs.numeratorTotal / costs.blocks.length,
    denominatorValue: costs.denominatorTotal / costs.blocks.length,
    confidenceInterval: {
      lower: interval.lower,
      upper: interval.upper,
    },
    practicalThreshold: input.practicalThreshold,
    sampleCount: costs.blocks.length,
    sourceDigests: costs.sourceDigests,
    currency: priceArtifact.artifact.payload.currency,
  });
}

export function createBenchmarkResourceCapacityProtocolEvidence(input) {
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
    input.resourcePreregistration,
  );
  const profileEnvelope = source(
    BENCHMARK_RESOURCE_ARTIFACT_KIND.PROFILE_ENVELOPE,
    input.profileEnvelope,
  );
  const matrix = createBenchmarkResourceMatrixManifest({
    matrixId: input.matrixId,
    axes: input.axes,
    sideIds: input.sideIds,
    workloadManifestDigest: workloadManifest.digest,
    alternativeTopologyDigest: alternativeTopology.digest,
    preregistrationDigest: preregistration.digest,
    profileEnvelopeDigest: profileEnvelope.digest,
  });
  if (matrix.artifact.payload.cells.length !== 1) {
    fail(localText.REPRESENTATIVE_MATRIX_CELL_REQUIRED);
  }
  const calibrations = [];
  for (let index = 0; index < input.windowEvidence.length; index += 1) {
    if (
      input.windowEvidence[index].c3.sample.phase ===
        localText.MEASURED
    ) {
      appendOwnArrayValue(
        calibrations,
        input.windowEvidence[index].calibration,
      );
    }
  }
  const componentInventory = inventory(input, calibrations);
  const price = createBenchmarkResourcePriceSheet(input.priceSheet);
  const cell = matrix.artifact.payload.cells[0];
  const sideSources = [[], []];
  const orderedSources = [];
  const capacitySamples = [[], []];
  const windows = [];
  const firstProtocolAttached = [false, false];
  for (let index = 0;
    index < input.capacityReport.windowReceipts.length;
    index += 1) {
    const receipt = input.capacityReport.windowReceipts[index];
    if (receipt.phase !== localText.MEASURED) continue;
    const sample = findSample(
      input.capacityReport,
      receipt.capacitySampleDigest,
    );
    const evidence = findWindowEvidence(
      input.windowEvidence,
      receipt.windowReceiptDigest,
    );
    const sideIndex = findExactIndex(input.sideIds, receipt.sideId);
    const loadIndex =
      findExactIndex(
        input.capacityPreregistration.offeredLoadPerSecond,
        receipt.offeredLoad,
      );
    if (
      sample === undefined ||
      evidence === undefined ||
      sideIndex < 0 ||
      loadIndex < 0
    ) {
      fail(localText.MEASURED_COORDINATE_UNRESOLVED);
    }
    const coordinates = {
      matrixId: input.matrixId,
      cellId: cell.cellId,
      pairId: input.pairId,
      runId: input.runId,
      pairedBlockId:
        `${input.pairId}-block-${receipt.blockIndex}-load-${loadIndex}`,
      profileIdentity: input.profileEnvelope.profileIdentity,
      blockIndex: receipt.blockIndex,
      blockedOrderIndex: receipt.blockedOrderIndex,
      offeredLoad: receipt.offeredLoad,
      loadIndex,
      phase: receipt.phase,
      sideId: receipt.sideId,
    };
    const capacityEvidence = {
      capacitySampleDigest: receipt.capacitySampleDigest,
    };
    if (!firstProtocolAttached[sideIndex]) {
      capacityEvidence.protocol =
        protocolEvidence(input, receipt.sideId, sideIndex);
      firstProtocolAttached[sideIndex] = true;
    }
    const capacitySample =
      createBenchmarkResourceWindowSourceArtifact(
        BENCHMARK_RESOURCE_ARTIFACT_KIND.CAPACITY_SAMPLE,
        {...coordinates, evidence: capacityEvidence},
      );
    const semanticReceipt =
      createBenchmarkResourceWindowSourceArtifact(
        BENCHMARK_RESOURCE_ARTIFACT_KIND.SEMANTIC_RECEIPT,
        {
          ...coordinates,
          evidence: {
            semanticReceiptDigest: receipt.semanticReceiptDigest,
            semanticReceipt: sample.semanticReceipt,
          },
        },
      );
    const liveEngagement =
      createBenchmarkResourceWindowSourceArtifact(
        BENCHMARK_RESOURCE_ARTIFACT_KIND.LIVE_ENGAGEMENT,
        {
          ...coordinates,
          evidence: {
            liveEngagementDigest: receipt.liveEngagementDigest,
            heterogeneousOperationReceipt: evidence.c3.engagement,
            encodedOperationEvidence:
              encodeBenchmarkCapacityHeterogeneousOperationEvidence(
                evidence.c3.adapterEvidence.operationEvidence,
                evidence.c3.engagement.adapterIdentity.runtimeKind,
              ),
            runtimeOwnerEvidence:
              evidence.c3.adapterEvidence.runtimeOwnerEvidence,
            amplificationPolicy: AMPLIFICATION_POLICY,
          },
        },
      );
    const windowReceipt =
      createBenchmarkResourceWindowSourceArtifact(
        BENCHMARK_RESOURCE_ARTIFACT_KIND.WINDOW_RECEIPT,
        {
          ...coordinates,
          evidence: {capacityWindowReceipt: receipt},
        },
      );
    const configuredSide =
      findSide(input.inventorySides, receipt.sideId);
    const resourceWindow = createBenchmarkResourceWindow({
      windowId:
        `${input.runId}-${receipt.sideId}-${receipt.blockIndex}-` +
        `${loadIndex}-resource-window`,
      matrixManifestDigest: matrix.digest,
      ...coordinates,
      windowReceiptDigest: windowReceipt.digest,
      capacitySampleDigest: capacitySample.digest,
      semanticReceiptDigest: semanticReceipt.digest,
      liveEngagementDigest: liveEngagement.digest,
      liveCalibrationDigest: evidence.calibration.digest,
      startedAt: new Date(receipt.startedAt).toISOString(),
      endedAt: new Date(receipt.endedAt).toISOString(),
      correctSloEligibleOperations:
        isFixedSloCostSample(
          sample,
          input.capacityReport,
        ) ?
          sample.counts.correct :
          0,
      components: windowComponents(
        evidence.calibration,
        receipt.sideId,
        configuredSide.components,
      ),
    });
    const sources = {
      capacitySample,
      semanticReceipt,
      liveEngagement,
      windowReceipt,
    };
    appendOwnArrayValue(sideSources[sideIndex], sources);
    appendOwnArrayValue(orderedSources, sources);
    appendOwnArrayValue(capacitySamples[sideIndex], capacitySample);
    appendOwnArrayValue(windows, resourceWindow);
  }
  const capacities = [];
  for (let sideIndex = 0;
    sideIndex < input.sideIds.length;
    sideIndex += 1) {
    appendOwnArrayValue(
      capacities,
      capacitySummary(
        input,
        input.sideIds[sideIndex],
        sideIndex,
        capacitySamples[sideIndex],
      ),
    );
  }
  const pairedCapacityEffect = capacityEffect(input, capacities);
  const pairedCostEffect = costEffect(
    input,
    windows,
    componentInventory,
    price,
  );
  const cellEvidence = createBenchmarkResourceMeasuringCellEvidence({
    matrixManifestDigest: matrix.digest,
    matrixId: input.matrixId,
    cellId: cell.cellId,
    pairId: input.pairId,
    runId: input.runId,
    sideIds: input.sideIds,
    capacityReportDigests: artifactDigests(capacities),
    semanticReceiptDigests:
      orderedSourceArtifactDigests(orderedSources, 'semanticReceipt'),
    liveEngagementDigests:
      orderedSourceArtifactDigests(orderedSources, 'liveEngagement'),
    componentInventoryDigest: componentInventory.digest,
    priceSheetDigest: price.digest,
    resourceWindowDigests: artifactDigests(windows),
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
    componentInventory,
    price,
  ];
  appendArrayValues(artifacts, calibrations);
  for (let index = 0; index < orderedSources.length; index += 1) {
    const sources = orderedSources[index];
    appendOwnArrayValue(artifacts, sources.capacitySample);
    appendOwnArrayValue(artifacts, sources.semanticReceipt);
    appendOwnArrayValue(artifacts, sources.liveEngagement);
    appendOwnArrayValue(artifacts, sources.windowReceipt);
  }
  for (let index = 0; index < windows.length; index += 1) {
    appendOwnArrayValue(artifacts, windows[index]);
  }
  appendOwnArrayValue(artifacts, capacities[0]);
  appendOwnArrayValue(artifacts, capacities[1]);
  appendOwnArrayValue(artifacts, cellEvidence);
  const root = createBenchmarkResourceEvidenceRoot({
    matrixManifestDigest: matrix.digest,
    componentInventoryDigest: componentInventory.digest,
    priceSheetDigest: price.digest,
    cellEvidenceDigests: [cellEvidence.digest],
    sourceRevision: input.sourceRevision,
    producedAt: input.producedAt,
    validUntil: input.validUntil,
    artifacts,
  });
  const resolverArtifacts = [];
  appendArrayValues(resolverArtifacts, artifacts);
  appendOwnArrayValue(resolverArtifacts, root);
  return {
    receipt: {
      rootDigest: root.digest,
      resolver: createBenchmarkResourceMemoryResolver(resolverArtifacts),
    },
    root,
    artifacts,
    matrix,
    profileEnvelope,
    inventory: componentInventory,
    price,
    windows,
    capacities,
    cellEvidence,
    capacityEffect: pairedCapacityEffect,
    costEffect: pairedCostEffect,
  };
}
