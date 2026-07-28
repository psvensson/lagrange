import {
  appendOwnArrayValue,
  digestBenchmarkSemanticData,
} from './benchmark-semantic-integrity.js';
import {
  projectBenchmarkResourceCapacityProtocolEvidence,
} from './benchmark-resource-live-root-validation.js';
import {
  BENCHMARK_RESOURCE_ARTIFACT_KIND,
  BENCHMARK_RESOURCE_WINDOW_PHASE,
} from './benchmark-resource-contract-constants.js';

const arrayJoinMethod = Array.prototype.join;
const dateToISOStringMethod = Date.prototype.toISOString;
const mapGetMethod = Map.prototype.get;
const mapHasMethod = Map.prototype.has;
const mapSetMethod = Map.prototype.set;
const objectKeys = Object.keys;
const reflectApply = Reflect.apply;
const coordinateSeparator = '\u0000';
const localText = Object.freeze({
  PLAN_INVALID: 'cell.resourceWindow:c3_measured_plan_invalid',
  BINDING_MISMATCH: 'cell.resourceWindow:c3_receipt_binding_mismatch',
});

function fail(reason) {
  throw new TypeError(reason);
}

function coordinateKey(value) {
  return reflectApply(arrayJoinMethod, [
    value.cellId,
    value.blockIndex,
    value.blockedOrderIndex,
    value.sideId,
    value.offeredLoad,
    value.loadIndex,
    value.phase,
  ], [coordinateSeparator]);
}

function findLoadIndex(preregistration, offeredLoad) {
  for (let index = 0;
    index < preregistration.offeredLoadPerSecond.length;
    index += 1) {
    if (preregistration.offeredLoadPerSecond[index] === offeredLoad) {
      return index;
    }
  }
  return -1;
}

function findRawSample(report, digest) {
  for (let index = 0; index < report.rawSamples.length; index += 1) {
    if (report.rawSamples[index].sampleDigest === digest) {
      return report.rawSamples[index];
    }
  }
  return undefined;
}

function expectedExecutionIdentity(payload, owners) {
  return {
    matrixId: payload.matrixId,
    cellId: payload.cellId,
    cellManifestDigest: digestBenchmarkSemanticData({
      matrixId: payload.matrixId,
      cellId: payload.cellId,
    }),
    profileIdentity: owners.profile.identity,
    pairIdentity: digestBenchmarkSemanticData({pairId: payload.pairId}),
    runId: payload.runId,
    liveEnvironmentContractDigest:
      owners.matrix.alternativeTopologyDigest,
  };
}

function receiptIdentityMatches(receipt, identity) {
  const fields = objectKeys(identity);
  for (let index = 0; index < fields.length; index += 1) {
    if (receipt[fields[index]] !== identity[fields[index]]) return false;
  }
  return true;
}

function appendProjectionWindows(plan, projection, sideId, payload, owners) {
  const {preregistration, report, protocolSideId} = projection.evidence;
  const identity = expectedExecutionIdentity(payload, owners);
  for (let index = 0; index < report.windowReceipts.length; index += 1) {
    const receipt = report.windowReceipts[index];
    if (
      receipt.phase !== BENCHMARK_RESOURCE_WINDOW_PHASE.MEASURED ||
      receipt.sideId !== protocolSideId
    ) {
      continue;
    }
    const loadIndex = findLoadIndex(preregistration, receipt.offeredLoad);
    const sample = findRawSample(report, receipt.capacitySampleDigest);
    if (
      loadIndex < 0 ||
      sample === undefined ||
      !receiptIdentityMatches(receipt, identity) ||
      report.blockedPairOrdersUsed[receipt.blockIndex]
        ?.[receipt.blockedOrderIndex] !== protocolSideId
    ) {
      fail(localText.PLAN_INVALID);
    }
    const coordinate = {
      cellId: payload.cellId,
      blockIndex: receipt.blockIndex,
      blockedOrderIndex: receipt.blockedOrderIndex,
      sideId,
      offeredLoad: receipt.offeredLoad,
      loadIndex,
      phase: BENCHMARK_RESOURCE_WINDOW_PHASE.MEASURED,
    };
    const key = coordinateKey(coordinate);
    if (reflectApply(mapHasMethod, plan.byCoordinate, [key])) {
      fail(localText.PLAN_INVALID);
    }
    const expected = {
      ...coordinate,
      pairedBlockId:
        `${payload.pairId}-block-${receipt.blockIndex}-load-${loadIndex}`,
      startedAt: reflectApply(
        dateToISOStringMethod,
        new Date(receipt.startedAt),
        [],
      ),
      endedAt: reflectApply(
        dateToISOStringMethod,
        new Date(receipt.endedAt),
        [],
      ),
      correctOperations: sample.counts.correct,
      receipt,
    };
    reflectApply(mapSetMethod, plan.byCoordinate, [key, expected]);
    appendOwnArrayValue(plan.coordinates, coordinate);
  }
}

export function createBenchmarkResourceC3WindowPlan({
  capacities,
  resolved,
  payload,
  owners,
  resourcePreregistration,
}) {
  const capacityArtifactsBySide = [];
  for (let sideIndex = 0; sideIndex < capacities.length; sideIndex += 1) {
    const artifacts = [];
    for (let index = 0;
      index < capacities[sideIndex].sourceDigests.length;
      index += 1) {
      const artifact = reflectApply(mapGetMethod, resolved, [
        capacities[sideIndex].sourceDigests[index],
      ]);
      if (
        artifact?.kind !==
          BENCHMARK_RESOURCE_ARTIFACT_KIND.CAPACITY_SAMPLE
      ) {
        fail(localText.PLAN_INVALID);
      }
      appendOwnArrayValue(artifacts, artifact);
    }
    appendOwnArrayValue(capacityArtifactsBySide, artifacts);
  }
  const firstProtocol =
    capacityArtifactsBySide[0][0]?.payload?.evidence?.protocol;
  if (firstProtocol === undefined) return null;
  const plan = {coordinates: [], byCoordinate: new Map()};
  let reportDigest = null;
  for (let sideIndex = 0; sideIndex < payload.sideIds.length; sideIndex += 1) {
    const source = capacityArtifactsBySide[sideIndex][0];
    if (source === undefined) fail(localText.PLAN_INVALID);
    const projection = projectBenchmarkResourceCapacityProtocolEvidence(
      source,
      payload.sideIds[sideIndex],
      sideIndex,
      resourcePreregistration,
    );
    if (
      reportDigest !== null &&
      reportDigest !== projection.evidence.report.reportDigest
    ) {
      fail(localText.PLAN_INVALID);
    }
    reportDigest = projection.evidence.report.reportDigest;
    appendProjectionWindows(
      plan,
      projection,
      payload.sideIds[sideIndex],
      payload,
      owners,
    );
  }
  const report = firstProtocol.report;
  const expectedCount =
    report.completedBlocks *
    firstProtocol.preregistration.offeredLoadPerSecond.length *
    payload.sideIds.length;
  if (plan.coordinates.length !== expectedCount) fail(localText.PLAN_INVALID);
  return plan;
}

function sourceEvidenceMatches(sources, expected) {
  const capacityEvidence = sources.capacity.payload.evidence;
  const semanticEvidence = sources.semantic.payload.evidence;
  const liveEvidence = sources.live.payload.evidence;
  const receiptEvidence = sources.receipt.payload.evidence;
  return capacityEvidence.capacitySampleDigest ===
      expected.receipt.capacitySampleDigest &&
    semanticEvidence.semanticReceiptDigest ===
      expected.receipt.semanticReceiptDigest &&
    liveEvidence.liveEngagementDigest ===
      expected.receipt.liveEngagementDigest &&
    digestBenchmarkSemanticData(receiptEvidence.capacityWindowReceipt) ===
      digestBenchmarkSemanticData(expected.receipt);
}

export function assertBenchmarkResourceC3WindowBinding(
  plan,
  window,
  sources,
) {
  if (plan === null) return;
  const expected = reflectApply(
    mapGetMethod,
    plan.byCoordinate,
    [coordinateKey(window)],
  );
  if (
    expected === undefined ||
    window.pairedBlockId !== expected.pairedBlockId ||
    window.startedAt !== expected.startedAt ||
    window.endedAt !== expected.endedAt ||
    window.correctSloEligibleOperations !== expected.correctOperations ||
    !sourceEvidenceMatches(sources, expected)
  ) {
    fail(localText.BINDING_MISMATCH);
  }
}
