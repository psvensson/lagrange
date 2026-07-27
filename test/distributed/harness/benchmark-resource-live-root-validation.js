import {
  digestBenchmarkSemanticData,
} from './benchmark-semantic-integrity.js';
import {
  inspectBenchmarkCapacityTerminalMeasurement,
} from './benchmark-capacity-protocol.js';
import {
  findBenchmarkResourceInventorySide,
} from './benchmark-resource-accounting.js';
import {
  assertBenchmarkResourceArray,
  assertBenchmarkResourceExactRecord,
} from './benchmark-resource-evidence-data.js';
import {
  deriveBenchmarkResourceLiveComponentAccounting,
  resolveBenchmarkResourceLiveCalibrationComponent,
} from './benchmark-resource-live-observation-authority.js';
import {
  BENCHMARK_RESOURCE_CAPACITY_SOURCE,
  BENCHMARK_RESOURCE_LIMIT,
} from './benchmark-resource-contract-constants.js';

const localText = Object.freeze({
  CAPACITY_PROTOCOL_INVALID:
    'cell.capacityEffect:c3_protocol_evidence_invalid',
  LIVE_INVENTORY_MISMATCH:
    'cell.resourceWindow:live_inventory_recomputation_mismatch',
  LIVE_TOPOLOGY_MISMATCH:
    'cell.resourceWindow:live_topology_closure_mismatch',
});
const capacityProtocolEvidenceKeys = Object.freeze([
  'version',
  'evidenceClass',
  'mappedSideId',
  'protocolSideId',
  'artifactReceipt',
  'preregistration',
  'report',
]);
const liveTopologyKeys = Object.freeze([
  'version',
  'image',
  'imageId',
  'databaseContainers',
  'sharedClientContainers',
  'network',
  'databaseStorage',
  'reservedIopsPerComponent',
  'reservedNetworkBytesPerSecondPerComponent',
  'components',
]);
const liveTopologyComponentKeys = Object.freeze([
  'sideId',
  'componentId',
  'role',
  'physicalResourceId',
]);
const setHas = Function.call.bind(Set.prototype.has);

function fail(message) {
  throw new TypeError(message);
}

function terminalCapacityCurve(report, capacity) {
  for (let index = 0; index < report.summary.capacityCurve.length; index += 1) {
    const curve = report.summary.capacityCurve[index];
    if (curve.offeredLoadPerSecond === capacity.maxSloOfferedLoadPerSecond) {
      return curve;
    }
  }
  return undefined;
}

function capacityProtocolIdentityMatches(
  evidence,
  mappedSideId,
  protocolSideIndex,
  resourcePreregistration,
) {
  return evidence.version === BENCHMARK_RESOURCE_CAPACITY_SOURCE.VERSION &&
    evidence.evidenceClass ===
      BENCHMARK_RESOURCE_CAPACITY_SOURCE.EVIDENCE_CLASS &&
    evidence.mappedSideId === mappedSideId &&
    evidence.protocolSideId ===
      evidence.preregistration.sideIds[protocolSideIndex] &&
    resourcePreregistration.sideIds[protocolSideIndex] === mappedSideId &&
    evidence.artifactReceipt.reportDigest === evidence.report.reportDigest &&
    evidence.artifactReceipt.reportDigest ===
      resourcePreregistration.capacityProtocolReportDigest &&
    evidence.artifactReceipt.preregistrationDigest ===
      evidence.preregistration.manifestDigest &&
    evidence.artifactReceipt.preregistrationDigest ===
      resourcePreregistration.capacityProtocolPreregistrationDigest;
}

function capacityProtocolProjection(
  evidence,
  mappedSideId,
  protocolSideIndex,
  resourcePreregistration,
) {
  assertBenchmarkResourceExactRecord(
    evidence,
    capacityProtocolEvidenceKeys,
    localText.CAPACITY_PROTOCOL_INVALID,
  );
  if (
    !capacityProtocolIdentityMatches(
      evidence,
      mappedSideId,
      protocolSideIndex,
      resourcePreregistration,
    ) ||
    !inspectBenchmarkCapacityTerminalMeasurement(
      evidence.report,
      evidence.preregistration,
    ).valid
  ) {
    fail(localText.CAPACITY_PROTOCOL_INVALID);
  }
  const capacity =
    evidence.report.summary.capacityBySide[evidence.protocolSideId];
  if (capacity === undefined) {
    fail(localText.CAPACITY_PROTOCOL_INVALID);
  }
  const terminalCurve = terminalCapacityCurve(evidence.report, capacity);
  const interval =
    terminalCurve?.sides?.[evidence.protocolSideId]
      ?.correctThroughputPerSecond;
  if (interval === undefined || capacity.perBlock.length === 0) {
    fail(localText.CAPACITY_PROTOCOL_INVALID);
  }
  return {
    capacityCorrectOpsPerSecond: capacity.maxCorrectThroughputPerSecond,
    sampleCount: capacity.perBlock.length,
    confidenceInterval: {lower: interval.lower, upper: interval.upper},
  };
}

export function assertBenchmarkResourceCapacityProtocolSummary(
  capacity,
  sourceArtifact,
  sideId,
  protocolSideIndex,
  resourcePreregistration,
) {
  const projection = capacityProtocolProjection(
    sourceArtifact.payload.evidence.protocol,
    sideId,
    protocolSideIndex,
    resourcePreregistration,
  );
  if (
    capacity.capacityCorrectOpsPerSecond !==
      projection.capacityCorrectOpsPerSecond ||
    capacity.sampleCount !== projection.sampleCount ||
    digestBenchmarkSemanticData(capacity.confidenceInterval) !==
      digestBenchmarkSemanticData(projection.confidenceInterval)
  ) {
    fail(localText.CAPACITY_PROTOCOL_INVALID);
  }
}

function findInventoryComponent(inventory, sideId, componentId) {
  const side = findBenchmarkResourceInventorySide(inventory, sideId);
  if (side === undefined) return undefined;
  for (let index = 0; index < side.components.length; index += 1) {
    if (side.components[index].componentId === componentId) {
      return side.components[index];
    }
  }
  return undefined;
}

export function assertBenchmarkResourceLiveComponentAccounting(
  component,
  calibrationArtifact,
  sideId,
  inventory,
) {
  const observation = resolveBenchmarkResourceLiveCalibrationComponent(
    calibrationArtifact,
    sideId,
    component.componentId,
  );
  if (observation === undefined) {
    fail(localText.LIVE_INVENTORY_MISMATCH);
  }
  const expected =
    deriveBenchmarkResourceLiveComponentAccounting(observation);
  const inventoryComponent =
    findInventoryComponent(inventory, sideId, component.componentId);
  if (
    digestBenchmarkSemanticData(component.utilized) !==
      digestBenchmarkSemanticData(expected.utilized) ||
    digestBenchmarkSemanticData(component.amplification) !==
      digestBenchmarkSemanticData(expected.amplification) ||
    inventoryComponent === undefined ||
    digestBenchmarkSemanticData(inventoryComponent.provisioned) !==
      digestBenchmarkSemanticData(expected.provisioned) ||
    digestBenchmarkSemanticData(inventoryComponent.minimumFootprint) !==
      digestBenchmarkSemanticData(expected.minimumFootprint) ||
    inventoryComponent.reservedHeadroomRatio !==
      expected.reservedHeadroomRatio
  ) {
    fail(localText.LIVE_INVENTORY_MISMATCH);
  }
}

function findTopologyComponent(topology, sideId, componentId) {
  for (let index = 0; index < topology.components.length; index += 1) {
    const component = topology.components[index];
    assertBenchmarkResourceExactRecord(
      component,
      liveTopologyComponentKeys,
      localText.LIVE_TOPOLOGY_MISMATCH,
    );
    if (
      component.sideId === sideId &&
      component.componentId === componentId
    ) {
      return component;
    }
  }
  return undefined;
}

export function assertBenchmarkResourceLiveTopologyClosure({
  calibrationArtifact,
  topologyArtifact,
  inventory,
  windowComponentIdentities,
  windowComponentCount,
}) {
  assertBenchmarkResourceExactRecord(
    topologyArtifact.payload,
    liveTopologyKeys,
    localText.LIVE_TOPOLOGY_MISMATCH,
  );
  assertBenchmarkResourceArray(
    topologyArtifact.payload.components,
    localText.LIVE_TOPOLOGY_MISMATCH,
    BENCHMARK_RESOURCE_LIMIT.COMPONENTS_PER_SIDE * 2,
  );
  let inventoryComponentCount = 0;
  for (let sideIndex = 0; sideIndex < inventory.sides.length; sideIndex += 1) {
    const side = inventory.sides[sideIndex];
    for (let componentIndex = 0;
      componentIndex < side.components.length;
      componentIndex += 1) {
      const component = side.components[componentIndex];
      const identity = `${side.sideId}\u0000${component.componentId}`;
      const topologyComponent = findTopologyComponent(
        topologyArtifact.payload,
        side.sideId,
        component.componentId,
      );
      const calibrationComponent =
        resolveBenchmarkResourceLiveCalibrationComponent(
          calibrationArtifact,
          side.sideId,
          component.componentId,
        );
      inventoryComponentCount += 1;
      if (
        !setHas(windowComponentIdentities, identity) ||
        calibrationComponent === undefined ||
        topologyComponent === undefined ||
        topologyComponent.role !== component.role ||
        topologyComponent.physicalResourceId !==
          calibrationComponent.containerId
      ) {
        fail(localText.LIVE_TOPOLOGY_MISMATCH);
      }
    }
  }
  if (
    calibrationArtifact.payload.components.length !==
      inventoryComponentCount ||
    topologyArtifact.payload.components.length !== inventoryComponentCount ||
    windowComponentCount !== inventoryComponentCount
  ) {
    fail(localText.LIVE_TOPOLOGY_MISMATCH);
  }
}
