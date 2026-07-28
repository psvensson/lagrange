import {
  appendOwnArrayValue,
  arrayContainsExactValue,
  arraysExactlyEqual,
  digestBenchmarkSemanticData,
  isMissingDataValue,
  ownDataValue,
} from './benchmark-semantic-integrity.js';
import {
  assertBenchmarkResourceArray,
  assertBenchmarkResourceBytes,
  assertBenchmarkResourceCanonicalData,
  assertBenchmarkResourceDigest,
  assertBenchmarkResourceExactRecord,
  assertBenchmarkResourceInteger,
  assertBenchmarkResourceText,
  createBenchmarkResourceArtifact,
  parseBenchmarkResourceArtifact,
} from './benchmark-resource-evidence-data.js';
import {
  inspectBenchmarkResourceInventoryArtifact,
  inspectBenchmarkResourceWindowArtifact,
} from './benchmark-resource-accounting.js';
import {
  inspectBenchmarkResourcePairedEffect,
  inspectBenchmarkResourcePriceSheetArtifact,
} from './benchmark-resource-cost-and-effects.js';
import {
  recomputeBenchmarkResourceMeasuringCellEffects,
} from './benchmark-resource-cell-effects-validation.js';
import {
  inspectBenchmarkResourceCapacitySummaryArtifact,
} from './benchmark-resource-capacity-summary.js';
import {
  inspectBenchmarkResourceMatrixManifestArtifact,
} from './benchmark-resource-matrix-manifest.js';
import {
  benchmarkResourceLiveCalibrationContainsComponent,
  inspectBenchmarkResourceLiveCalibrationArtifact,
  resolveBenchmarkResourceLiveCalibrationComponent,
} from './benchmark-resource-live-observation-authority.js';
import {
  assertBenchmarkResourceCapacityProtocolSummary,
  assertBenchmarkResourceLiveComponentAccounting,
  assertBenchmarkResourceLiveTopologyClosure,
} from './benchmark-resource-live-root-validation.js';
import {
  inspectBenchmarkResourceWindowSourceArtifact,
} from './benchmark-resource-window-source.js';
import {
  assertBenchmarkResourceC3WindowBinding,
  createBenchmarkResourceC3WindowPlan,
} from './benchmark-resource-c3-window-plan.js';
import {inspectScaleProfileEnvelope} from './scale-profile-envelope.js';
import {
  appendBenchmarkResourceMeasuredWindowCoordinate,
  assertBenchmarkResourceMeasuredWindowCoordinatesComplete,
  createBenchmarkResourceWindowCoordinateContext,
} from './benchmark-resource-window-coordinate-validation.js';
import {
  assertBenchmarkResourceTimestamp,
  assertBenchmarkResourceEvidenceOwnerJoin,
  copyBenchmarkResourceSideIds,
  safeBenchmarkResourceValidationReason,
} from './benchmark-resource-validation-primitives.js';
import {
  BENCHMARK_RESOURCE_ARTIFACT_KIND,
  BENCHMARK_RESOURCE_CELL_STATE,
  BENCHMARK_RESOURCE_CONTRACT,
  BENCHMARK_RESOURCE_EFFECT,
  BENCHMARK_RESOURCE_LIMIT,
  BENCHMARK_RESOURCE_MEASUREMENT_REASON,
} from './benchmark-resource-contract-constants.js';
import {
  BENCHMARK_RESOURCE_CLAIM_EVIDENCE_STATE,
  benchmarkResourceRejectedMeasurementOutcome,
  createBenchmarkResourceClaimEvidenceView,
} from './benchmark-resource-claim-evidence-view.js';
import {
  BENCHMARK_RESOURCE_MEASURING_CELL_INPUT_KEYS,
  BENCHMARK_RESOURCE_NON_MEASURING_CELL_INPUT_KEYS,
  BENCHMARK_RESOURCE_ROOT_INPUT_KEYS,
  BENCHMARK_RESOURCE_ROOT_MANIFEST_ENTRY_KEYS,
  BENCHMARK_RESOURCE_ROOT_TEXT as ROOT_TEXT,
} from './benchmark-resource-evidence-root-constants.js';
const sourceArtifactKinds = new Set([
  BENCHMARK_RESOURCE_ARTIFACT_KIND.ALTERNATIVE_TOPOLOGY,
  BENCHMARK_RESOURCE_ARTIFACT_KIND.CAPACITY_SAMPLE,
  BENCHMARK_RESOURCE_ARTIFACT_KIND.LIVE_CALIBRATION,
  BENCHMARK_RESOURCE_ARTIFACT_KIND.LIVE_ENGAGEMENT,
  BENCHMARK_RESOURCE_ARTIFACT_KIND.PREREGISTRATION,
  BENCHMARK_RESOURCE_ARTIFACT_KIND.PROFILE_ENVELOPE,
  BENCHMARK_RESOURCE_ARTIFACT_KIND.SEMANTIC_RECEIPT,
  BENCHMARK_RESOURCE_ARTIFACT_KIND.SYNTHETIC_CALIBRATION,
  BENCHMARK_RESOURCE_ARTIFACT_KIND.WINDOW_RECEIPT,
  BENCHMARK_RESOURCE_ARTIFACT_KIND.WORKLOAD_MANIFEST,
]);
const allowedArtifactKinds =
  new Set(Object.values(BENCHMARK_RESOURCE_ARTIFACT_KIND));
const measuringCellInputKeys = BENCHMARK_RESOURCE_MEASURING_CELL_INPUT_KEYS;
const measuringCellPayloadKeys = Object.freeze([
  'version',
  'state',
  ...measuringCellInputKeys,
  'priceSheetValidAtProduction',
  'cellEvidenceDigest',
]);
const nonMeasuringCellInputKeys =
  BENCHMARK_RESOURCE_NON_MEASURING_CELL_INPUT_KEYS;
const nonMeasuringCellPayloadKeys = Object.freeze([
  'version',
  'state',
  ...nonMeasuringCellInputKeys,
  'cellEvidenceDigest',
]);
const rootInputKeys = BENCHMARK_RESOURCE_ROOT_INPUT_KEYS;
const rootPayloadKeys = Object.freeze([
  'version',
  'matrixManifestDigest',
  'componentInventoryDigest',
  'priceSheetDigest',
  'cellEvidenceDigests',
  'sourceRevision',
  'producedAt',
  'validUntil',
  'artifactManifest',
  'artifactManifestDigest',
]);
const manifestEntryKeys = BENCHMARK_RESOURCE_ROOT_MANIFEST_ENTRY_KEYS;
const artifactEnvelopeKeys =
  Object.freeze(['digest', 'bytes', 'byteLength', 'artifact']);
const resolverKeys = Object.freeze(['resolve']);
const maximumReasonCodes = 64;
const semanticEventsAbsentZeroOnly = 'semantic_events_absent_zero_only';
const liveWindowSourceIndex = 3;
const bufferByteLength = Buffer.byteLength;
const dateParse = Date.parse;
const mapGet = Function.call.bind(Map.prototype.get);
const mapHas = Function.call.bind(Map.prototype.has);
const mapSet = Function.call.bind(Map.prototype.set);
const mapSizeGetter =
  Object.getOwnPropertyDescriptor(Map.prototype, 'size').get;
const numberMaxSafeInteger = Number.MAX_SAFE_INTEGER;
const reflectApply = Reflect.apply;
const setAdd = Function.call.bind(Set.prototype.add);
const setDelete = Function.call.bind(Set.prototype.delete);
const setHas = Function.call.bind(Set.prototype.has);
const setSizeGetter =
  Object.getOwnPropertyDescriptor(Set.prototype, 'size').get;
const acceptanceHandles = new WeakSet();
const objectFreeze = Object.freeze;
const weakSetAdd = Function.call.bind(WeakSet.prototype.add);
const weakSetHas = Function.call.bind(WeakSet.prototype.has);

function fail(message) {
  throw new TypeError(message);
}

function copyUniqueDigests(values, path, maximumLength) {
  assertBenchmarkResourceArray(values, path, maximumLength);
  const copy = [];
  const seen = new Set();
  for (let index = 0; index < values.length; index += 1) {
    const digest = values[index];
    assertBenchmarkResourceDigest(digest, `${path}.${index}`);
    if (setHas(seen, digest)) fail(`${path}:duplicate`);
    setAdd(seen, digest);
    appendOwnArrayValue(copy, digest);
  }
  return copy;
}

function copyReasonCodes(reasonCodes) {
  assertBenchmarkResourceArray(
    reasonCodes,
    ROOT_TEXT.CELL_REASON_CODES,
    maximumReasonCodes,
  );
  if (reasonCodes.length === 0) {
    fail(ROOT_TEXT.CELL_REASON_CODES_NON_EMPTY_REQUIRED);
  }
  const copy = [];
  const seen = new Set();
  for (let index = 0; index < reasonCodes.length; index += 1) {
    const reason = reasonCodes[index];
    assertBenchmarkResourceText(reason, `cell.reasonCodes.${index}`);
    if (setHas(seen, reason)) fail(ROOT_TEXT.CELL_REASON_CODES_DUPLICATE);
    setAdd(seen, reason);
    appendOwnArrayValue(copy, reason);
  }
  return copy;
}

function assertProductionInterval(input, path) {
  assertBenchmarkResourceTimestamp(input.producedAt, `${path}.producedAt`);
  assertBenchmarkResourceTimestamp(input.validUntil, `${path}.validUntil`);
  if (dateParse(input.validUntil) <= dateParse(input.producedAt)) {
    fail(`${path}.validity:not_positive`);
  }
}

export function createBenchmarkResourceSourceArtifact(
  kind,
  payload,
  references = [],
) {
  if (
    !setHas(sourceArtifactKinds, kind) ||
    kind === BENCHMARK_RESOURCE_ARTIFACT_KIND.LIVE_CALIBRATION
  ) {
    fail(ROOT_TEXT.SOURCE_ARTIFACT_KIND_UNSUPPORTED);
  }
  return createBenchmarkResourceArtifact(kind, payload, references);
}

function measuringCellBody(input) {
  const sideIds =
    copyBenchmarkResourceSideIds(input.sideIds, 'cell.sideIds');
  const capacityReportDigests = copyUniqueDigests(
    input.capacityReportDigests,
    'cell.capacityReportDigests',
    2,
  );
  if (capacityReportDigests.length !== 2) {
    fail(ROOT_TEXT.CELL_CAPACITY_REPORT_DIGESTS_EXACT_PAIR_REQUIRED);
  }
  const semanticReceiptDigests = copyUniqueDigests(
    input.semanticReceiptDigests,
    'cell.semanticReceiptDigests',
    BENCHMARK_RESOURCE_LIMIT.RESOURCE_WINDOWS_PER_CELL,
  );
  const liveEngagementDigests = copyUniqueDigests(
    input.liveEngagementDigests,
    'cell.liveEngagementDigests',
    BENCHMARK_RESOURCE_LIMIT.RESOURCE_WINDOWS_PER_CELL,
  );
  const resourceWindowDigests = copyUniqueDigests(
    input.resourceWindowDigests,
    'cell.resourceWindowDigests',
    BENCHMARK_RESOURCE_LIMIT.RESOURCE_WINDOWS_PER_CELL,
  );
  if (
    semanticReceiptDigests.length === 0 ||
    semanticReceiptDigests.length !== liveEngagementDigests.length ||
    semanticReceiptDigests.length !== resourceWindowDigests.length
  ) {
    fail(ROOT_TEXT.CELL_WINDOW_EVIDENCE_COMPLETE_EQUAL_COUNTS_REQUIRED);
  }
  if (!inspectBenchmarkResourcePairedEffect(input.capacityEffect).valid) {
    fail(ROOT_TEXT.CELL_CAPACITY_EFFECT_INVALID);
  }
  if (!inspectBenchmarkResourcePairedEffect(input.costEffect).valid) {
    fail(ROOT_TEXT.CELL_COST_EFFECT_INVALID);
  }
  if (
    input.capacityEffect.effectType !== BENCHMARK_RESOURCE_EFFECT.CAPACITY ||
    input.costEffect.effectType !== BENCHMARK_RESOURCE_EFFECT.COST
  ) {
    fail(ROOT_TEXT.CELL_EFFECTS_TYPE_MISMATCH);
  }
  const digestFields = [
    'matrixManifestDigest',
    'componentInventoryDigest',
    'priceSheetDigest',
  ];
  for (let index = 0; index < digestFields.length; index += 1) {
    const field = digestFields[index];
    assertBenchmarkResourceDigest(input[field], `cell.${field}`);
  }
  const textFields = [
    'matrixId',
    'cellId',
    'pairId',
    'runId',
    'sourceRevision',
  ];
  for (let index = 0; index < textFields.length; index += 1) {
    const field = textFields[index];
    assertBenchmarkResourceText(input[field], `cell.${field}`);
  }
  assertProductionInterval(input, ROOT_TEXT.CELL);
  return {
    version: BENCHMARK_RESOURCE_CONTRACT.CELL_EVIDENCE_VERSION,
    state: BENCHMARK_RESOURCE_CELL_STATE.MEASURING,
    matrixManifestDigest: input.matrixManifestDigest,
    matrixId: input.matrixId,
    cellId: input.cellId,
    pairId: input.pairId,
    runId: input.runId,
    sideIds,
    capacityReportDigests,
    semanticReceiptDigests,
    liveEngagementDigests,
    componentInventoryDigest: input.componentInventoryDigest,
    priceSheetDigest: input.priceSheetDigest,
    resourceWindowDigests,
    capacityEffect: input.capacityEffect,
    costEffect: input.costEffect,
    sourceRevision: input.sourceRevision,
    producedAt: input.producedAt,
    validUntil: input.validUntil,
    priceSheetValidAtProduction: true,
  };
}

export function createBenchmarkResourceMeasuringCellEvidence(input) {
  assertBenchmarkResourceExactRecord(
    input,
    measuringCellInputKeys,
    ROOT_TEXT.CELL,
  );
  const body = measuringCellBody(input);
  const references = [
    body.matrixManifestDigest,
    body.componentInventoryDigest,
    body.priceSheetDigest,
  ];
  const collections = [
    body.capacityReportDigests,
    body.semanticReceiptDigests,
    body.liveEngagementDigests,
    body.resourceWindowDigests,
    body.capacityEffect.sourceDigests,
    body.costEffect.sourceDigests,
  ];
  for (let collectionIndex = 0;
    collectionIndex < collections.length;
    collectionIndex += 1) {
    const collection = collections[collectionIndex];
    for (let index = 0; index < collection.length; index += 1) {
      if (!arrayContainsExactValue(references, collection[index])) {
        appendOwnArrayValue(references, collection[index]);
      }
    }
  }
  return createBenchmarkResourceArtifact(
    BENCHMARK_RESOURCE_ARTIFACT_KIND.CELL_EVIDENCE,
    {...body, cellEvidenceDigest: digestBenchmarkSemanticData(body)},
    references,
  );
}

export function createBenchmarkResourceNonMeasuringCellEvidence(input) {
  assertBenchmarkResourceExactRecord(
    input,
    nonMeasuringCellInputKeys,
    ROOT_TEXT.CELL,
  );
  const digestFields = ['matrixManifestDigest'];
  for (let index = 0; index < digestFields.length; index += 1) {
    const field = digestFields[index];
    assertBenchmarkResourceDigest(input[field], `cell.${field}`);
  }
  const textFields = [
    'matrixId',
    'cellId',
    'pairId',
    'runId',
    'sourceRevision',
  ];
  for (let index = 0; index < textFields.length; index += 1) {
    const field = textFields[index];
    assertBenchmarkResourceText(input[field], `cell.${field}`);
  }
  assertProductionInterval(input, ROOT_TEXT.CELL);
  const sourceDigests = copyUniqueDigests(
    input.sourceDigests,
    'cell.sourceDigests',
    BENCHMARK_RESOURCE_LIMIT.REFERENCES_PER_ARTIFACT,
  );
  const body = {
    version: BENCHMARK_RESOURCE_CONTRACT.CELL_EVIDENCE_VERSION,
    state: BENCHMARK_RESOURCE_CELL_STATE.NON_MEASURING,
    matrixManifestDigest: input.matrixManifestDigest,
    matrixId: input.matrixId,
    cellId: input.cellId,
    pairId: input.pairId,
    runId: input.runId,
    sideIds: copyBenchmarkResourceSideIds(input.sideIds, 'cell.sideIds'),
    reasonCodes: copyReasonCodes(input.reasonCodes),
    sourceDigests,
    sourceRevision: input.sourceRevision,
    producedAt: input.producedAt,
    validUntil: input.validUntil,
  };
  const references = [body.matrixManifestDigest];
  for (let index = 0; index < sourceDigests.length; index += 1) {
    appendOwnArrayValue(references, sourceDigests[index]);
  }
  return createBenchmarkResourceArtifact(
    BENCHMARK_RESOURCE_ARTIFACT_KIND.CELL_EVIDENCE,
    {...body, cellEvidenceDigest: digestBenchmarkSemanticData(body)},
    references,
  );
}

function sortedManifestEntries(artifacts) {
  assertBenchmarkResourceArray(
    artifacts,
    ROOT_TEXT.ROOT_ARTIFACTS,
    BENCHMARK_RESOURCE_LIMIT.ARTIFACT_COUNT,
  );
  if (artifacts.length === 0) fail(ROOT_TEXT.ROOT_ARTIFACTS_NON_EMPTY_REQUIRED);
  const entries = [];
  const digests = new Set();
  let totalBytes = 0;
  for (let index = 0; index < artifacts.length; index += 1) {
    const artifact = artifacts[index];
    assertBenchmarkResourceExactRecord(
      artifact,
      artifactEnvelopeKeys,
      `root.artifacts.${index}`,
    );
    assertBenchmarkResourceDigest(
      artifact.digest,
      `root.artifacts.${index}.digest`,
    );
    assertBenchmarkResourceInteger(
      artifact.byteLength,
      `root.artifacts.${index}.byteLength`,
    );
    assertBenchmarkResourceBytes(
      artifact.bytes,
      `root.artifacts.${index}.bytes`,
    );
    if (bufferByteLength(artifact.bytes) !== artifact.byteLength) {
      fail(ROOT_TEXT.ROOT_ARTIFACTS_BYTE_LENGTH_MISMATCH);
    }
    const parsed = parseBenchmarkResourceArtifact(
      artifact.bytes,
      artifact.digest,
    );
    assertBenchmarkResourceCanonicalData(artifact.artifact);
    if (
      digestBenchmarkSemanticData(parsed) !==
        digestBenchmarkSemanticData(artifact.artifact)
    ) {
      fail(ROOT_TEXT.ROOT_ARTIFACTS_PARSED_ARTIFACT_MISMATCH);
    }
    assertBenchmarkResourceText(parsed.kind, `root.artifacts.${index}.kind`);
    if (setHas(digests, artifact.digest)) {
      fail(ROOT_TEXT.ROOT_ARTIFACTS_DIGEST_DUPLICATE);
    }
    setAdd(digests, artifact.digest);
    totalBytes += artifact.byteLength;
    if (totalBytes > BENCHMARK_RESOURCE_LIMIT.TOTAL_ARTIFACT_BYTES) {
      fail(ROOT_TEXT.ROOT_ARTIFACTS_TOTAL_BYTES_LIMIT);
    }
    const entry = {
      kind: parsed.kind,
      digest: artifact.digest,
      byteLength: artifact.byteLength,
    };
    let insertionIndex = entries.length;
    while (
      insertionIndex > 0 &&
      entries[insertionIndex - 1].digest > entry.digest
    ) {
      entries[insertionIndex] = entries[insertionIndex - 1];
      insertionIndex -= 1;
    }
    entries[insertionIndex] = entry;
  }
  return entries;
}

export function createBenchmarkResourceEvidenceRoot(input) {
  assertBenchmarkResourceExactRecord(input, rootInputKeys, ROOT_TEXT.ROOT);
  const ownerDigestFields = [
    'matrixManifestDigest',
    'componentInventoryDigest',
    'priceSheetDigest',
  ];
  for (let index = 0; index < ownerDigestFields.length; index += 1) {
    const field = ownerDigestFields[index];
    assertBenchmarkResourceDigest(input[field], `root.${field}`);
  }
  assertBenchmarkResourceText(input.sourceRevision, ROOT_TEXT.ROOT_SOURCE_REVISION);
  assertProductionInterval(input, ROOT_TEXT.ROOT);
  const cellEvidenceDigests = copyUniqueDigests(
    input.cellEvidenceDigests,
    'root.cellEvidenceDigests',
    BENCHMARK_RESOURCE_LIMIT.CELLS,
  );
  if (cellEvidenceDigests.length === 0) {
    fail(ROOT_TEXT.ROOT_CELL_EVIDENCE_DIGESTS_NON_EMPTY_REQUIRED);
  }
  const artifactManifest = sortedManifestEntries(input.artifacts);
  const manifestDigests = new Set();
  for (let index = 0; index < artifactManifest.length; index += 1) {
    setAdd(manifestDigests, artifactManifest[index].digest);
  }
  const ownerDigests = [
    input.matrixManifestDigest,
    input.componentInventoryDigest,
    input.priceSheetDigest,
  ];
  for (let index = 0; index < cellEvidenceDigests.length; index += 1) {
    appendOwnArrayValue(ownerDigests, cellEvidenceDigests[index]);
  }
  for (let index = 0; index < ownerDigests.length; index += 1) {
    if (!setHas(manifestDigests, ownerDigests[index])) {
      fail(ROOT_TEXT.ROOT_ARTIFACTS_OWNER_MISSING);
    }
  }
  const payload = {
    version: BENCHMARK_RESOURCE_CONTRACT.ROOT_VERSION,
    matrixManifestDigest: input.matrixManifestDigest,
    componentInventoryDigest: input.componentInventoryDigest,
    priceSheetDigest: input.priceSheetDigest,
    cellEvidenceDigests,
    sourceRevision: input.sourceRevision,
    producedAt: input.producedAt,
    validUntil: input.validUntil,
    artifactManifest,
    artifactManifestDigest: digestBenchmarkSemanticData(artifactManifest),
  };
  const references = [];
  for (let index = 0; index < artifactManifest.length; index += 1) {
    appendOwnArrayValue(references, artifactManifest[index].digest);
  }
  return createBenchmarkResourceArtifact(
    BENCHMARK_RESOURCE_ARTIFACT_KIND.ROOT,
    payload,
    references,
  );
}

function validateRootManifestPayload(rootArtifact) {
  const payload = rootArtifact.payload;
  assertBenchmarkResourceExactRecord(payload, rootPayloadKeys, ROOT_TEXT.ROOT_PAYLOAD);
  if (payload.version !== BENCHMARK_RESOURCE_CONTRACT.ROOT_VERSION) {
    fail(ROOT_TEXT.ROOT_VERSION_UNSUPPORTED);
  }
  assertBenchmarkResourceArray(
    payload.artifactManifest,
    ROOT_TEXT.ROOT_ARTIFACT_MANIFEST,
    BENCHMARK_RESOURCE_LIMIT.ARTIFACT_COUNT,
  );
  if (
    digestBenchmarkSemanticData(payload.artifactManifest) !==
      payload.artifactManifestDigest
  ) {
    fail(ROOT_TEXT.ROOT_ARTIFACT_MANIFEST_DIGEST_MISMATCH);
  }
  return payload;
}

function validateManifestEntry(entry, index, state) {
  const path = `root.artifactManifest.${index}`;
  assertBenchmarkResourceExactRecord(entry, manifestEntryKeys, path);
  assertBenchmarkResourceText(entry.kind, `${path}.kind`);
  assertBenchmarkResourceDigest(entry.digest, `${path}.digest`);
  assertBenchmarkResourceInteger(entry.byteLength, `${path}.byteLength`);
  if (
    entry.digest <= state.previousDigest ||
    mapHas(state.resolved, entry.digest)
  ) {
    fail(ROOT_TEXT.ROOT_ARTIFACT_MANIFEST_NOT_STRICTLY_SORTED_UNIQUE);
  }
  state.previousDigest = entry.digest;
}

function resolveManifestEntry(entry, index, state) {
  validateManifestEntry(entry, index, state);
  try {
    const bytes = reflectApply(
      state.resolve,
      state.resolver,
      [entry.digest],
    );
    if (bytes === undefined) fail(ROOT_TEXT.RESOLVER_RESOLVE_ARTIFACT_MISSING);
    assertBenchmarkResourceBytes(bytes, ROOT_TEXT.RESOLVER_RESOLVE_BYTES);
    const byteLength = bufferByteLength(bytes);
    if (byteLength !== entry.byteLength) {
      fail(ROOT_TEXT.RESOLVER_RESOLVE_BYTE_LENGTH_MISMATCH);
    }
    state.totalBytes += byteLength;
    if (state.totalBytes > BENCHMARK_RESOURCE_LIMIT.TOTAL_ARTIFACT_BYTES) {
      fail(ROOT_TEXT.RESOLVER_RESOLVE_TOTAL_BYTES_LIMIT);
    }
    const artifact = parseBenchmarkResourceArtifact(bytes, entry.digest);
    if (artifact.kind !== entry.kind) {
      fail(ROOT_TEXT.RESOLVER_RESOLVE_KIND_MISMATCH);
    }
    if (!setHas(allowedArtifactKinds, artifact.kind)) {
      fail(ROOT_TEXT.RESOLVER_RESOLVE_ARTIFACT_KIND_UNSUPPORTED);
    }
    mapSet(state.resolved, entry.digest, artifact);
  } catch (error) {
    if (
      entry.digest !== state.optionalPriceDigest ||
      entry.kind !== BENCHMARK_RESOURCE_ARTIFACT_KIND.PRICE_SHEET
    ) {
      throw error;
    }
    mapSet(state.resolved, entry.digest, {
      kind: BENCHMARK_RESOURCE_ARTIFACT_KIND.PRICE_SHEET,
      payload: null,
      references: [],
    });
  }
}

function assertRootReferencesMatchManifest(rootArtifact, payload, resolved) {
  if (
    rootArtifact.references.length !==
      reflectApply(mapSizeGetter, resolved, [])
  ) {
    fail(ROOT_TEXT.ROOT_REFERENCES_MANIFEST_COUNT_MISMATCH);
  }
  for (let index = 0; index < rootArtifact.references.length; index += 1) {
    if (rootArtifact.references[index] !== payload.artifactManifest[index].digest) {
      fail(ROOT_TEXT.ROOT_REFERENCES_MANIFEST_ORDER_MISMATCH);
    }
  }
}

function resolveManifest(rootArtifact, resolver) {
  assertBenchmarkResourceExactRecord(resolver, resolverKeys, ROOT_TEXT.RESOLVER);
  const resolve = ownDataValue(resolver, 'resolve');
  if (isMissingDataValue(resolve) || typeof resolve !== 'function') {
    fail(ROOT_TEXT.RESOLVER_RESOLVE_FUNCTION_REQUIRED);
  }
  const payload = validateRootManifestPayload(rootArtifact);
  const state = {
    resolver,
    resolve,
    resolved: new Map(),
    totalBytes: 0,
    previousDigest: '',
    optionalPriceDigest: payload.priceSheetDigest,
  };
  for (let index = 0; index < payload.artifactManifest.length; index += 1) {
    resolveManifestEntry(payload.artifactManifest[index], index, state);
  }
  assertRootReferencesMatchManifest(rootArtifact, payload, state.resolved);
  const {resolved} = state;
  return resolved;
}

function assertClosedAcyclicGraph(rootDigest, rootArtifactDigests, resolved) {
  const active = new Set();
  const complete = new Set();
  function visit(digest) {
    if (digest === rootDigest || setHas(active, digest)) {
      fail(ROOT_TEXT.ROOT_ARTIFACTS_CYCLE);
    }
    if (setHas(complete, digest)) return;
    const artifact = mapGet(resolved, digest);
    if (artifact === undefined) fail(ROOT_TEXT.ROOT_ARTIFACTS_REFERENCE_MISSING);
    setAdd(active, digest);
    for (let index = 0; index < artifact.references.length; index += 1) {
      visit(artifact.references[index]);
    }
    setDelete(active, digest);
    setAdd(complete, digest);
  }
  for (let index = 0; index < rootArtifactDigests.length; index += 1) {
    visit(rootArtifactDigests[index]);
  }
}

function expectedCellIds(matrix) {
  const ids = new Set();
  for (let index = 0; index < matrix.cells.length; index += 1) {
    setAdd(ids, matrix.cells[index].cellId);
  }
  return ids;
}

function resolvedArtifact(resolved, digest, expectedKind) {
  const artifact = mapGet(resolved, digest);
  if (artifact === undefined || artifact.kind !== expectedKind) {
    fail(`root.artifacts:${expectedKind}_missing`);
  }
  return artifact;
}

function assertEffectMatchesSides(effect, sideIds) {
  if (
    effect.numeratorSideId !== sideIds[0] ||
    effect.denominatorSideId !== sideIds[1]
  ) {
    fail(ROOT_TEXT.CELL_EFFECT_SIDES_MISMATCH);
  }
}

function sideIndex(sideIds, sideId) {
  for (let index = 0; index < sideIds.length; index += 1) {
    if (sideIds[index] === sideId) return index;
  }
  return -1;
}

function assertWindowSourceArtifact(
  resolved,
  digest,
  expectedKind,
  reason,
  expected,
) {
  const artifact = resolvedArtifact(resolved, digest, expectedKind);
  if (!setHas(sourceArtifactKinds, artifact.kind)) fail(reason);
  const inspection =
    inspectBenchmarkResourceWindowSourceArtifact(artifact, expected);
  if (!inspection.valid) fail(`${reason}:${inspection.reason}`);
  return artifact;
}

function inspectCalibrationArtifact(resolved, digest, reason, expected) {
  const artifact = mapGet(resolved, digest);
  if (
    artifact === undefined ||
    (
      artifact.kind !== BENCHMARK_RESOURCE_ARTIFACT_KIND.LIVE_CALIBRATION &&
      artifact.kind !==
        BENCHMARK_RESOURCE_ARTIFACT_KIND.SYNTHETIC_CALIBRATION
    )
  ) {
    fail(reason);
  }
  if (artifact.kind === BENCHMARK_RESOURCE_ARTIFACT_KIND.SYNTHETIC_CALIBRATION) {
    return false;
  }
  const inspection = inspectBenchmarkResourceLiveCalibrationArtifact(artifact);
  if (
    !inspection.valid ||
    artifact.payload.runId !== expected.runId ||
    artifact.payload.sourceRevision !== expected.sourceRevision ||
    (
      expected.componentId !== undefined &&
      !benchmarkResourceLiveCalibrationContainsComponent(
        artifact,
        expected.sideId,
        expected.componentId,
      )
    )
  ) {
    fail(`${reason}:invalid_external_observation`);
  }
  return true;
}

function validateMeasuringCellIdentity(cellArtifact, payload, owners) {
  assertBenchmarkResourceExactRecord(
    payload,
    measuringCellPayloadKeys,
    ROOT_TEXT.CELL,
  );
  const input = {};
  for (let index = 0; index < measuringCellInputKeys.length; index += 1) {
    input[measuringCellInputKeys[index]] =
      payload[measuringCellInputKeys[index]];
  }
  const reconstructed = createBenchmarkResourceMeasuringCellEvidence(input);
  if (
    reconstructed.artifact.payload.cellEvidenceDigest !==
      payload.cellEvidenceDigest ||
    digestBenchmarkSemanticData(reconstructed.artifact) !==
      digestBenchmarkSemanticData(cellArtifact)
  ) {
    fail(ROOT_TEXT.CELL_RECONSTRUCTION_MISMATCH);
  }
  if (
    owners.profile === null ||
    payload.matrixManifestDigest !== owners.matrixDigest ||
    payload.componentInventoryDigest !== owners.inventoryDigest ||
    payload.priceSheetDigest !== owners.priceDigest ||
    payload.matrixId !== owners.matrix.matrixId ||
    payload.sourceRevision !== owners.root.sourceRevision ||
    payload.producedAt !== owners.root.producedAt ||
    payload.validUntil !== owners.root.validUntil ||
    digestBenchmarkSemanticData(payload.sideIds) !==
      digestBenchmarkSemanticData(owners.matrix.sideIds)
  ) {
    fail(ROOT_TEXT.CELL_OWNER_IDENTITY_MISMATCH);
  }
}

function resolveMeasuringCellCapacities(payload, resolved) {
  const capacities = [];
  for (let index = 0; index < payload.capacityReportDigests.length; index += 1) {
    const artifact = resolvedArtifact(
      resolved,
      payload.capacityReportDigests[index],
      BENCHMARK_RESOURCE_ARTIFACT_KIND.CAPACITY_REPORT,
    );
    const inspection =
      inspectBenchmarkResourceCapacitySummaryArtifact(artifact);
    if (!inspection.valid) fail(`cell.capacityEffect:${inspection.reason}`);
    appendOwnArrayValue(capacities, artifact.payload);
  }
  if (
    capacities[0].sideId !== payload.sideIds[0] ||
    capacities[1].sideId !== payload.sideIds[1]
  ) {
    fail(ROOT_TEXT.CELL_CAPACITY_EFFECT_CAPACITY_SIDE_MISMATCH);
  }
  return capacities;
}

function validateComponentCalibrations(
  window,
  payload,
  owners,
  resolved,
  windowCalibrationLive,
) {
  let live = windowCalibrationLive;
  for (let index = 0; index < window.components.length; index += 1) {
    const component = window.components[index];
    const expected = {
      runId: payload.runId,
      sourceRevision: payload.sourceRevision,
      sideId: window.sideId,
      componentId: component.componentId,
    };
    const startLive = inspectCalibrationArtifact(
      resolved,
      component.observationStartDigest,
      'cell.resourceWindow:observation_start_missing',
      expected,
    );
    const endLive = inspectCalibrationArtifact(
      resolved,
      component.observationEndDigest,
      'cell.resourceWindow:observation_end_missing',
      expected,
    );
    if (windowCalibrationLive && startLive && endLive) {
      assertBenchmarkResourceLiveComponentAccounting(
        component,
        mapGet(resolved, window.liveCalibrationDigest),
        window.sideId,
        owners.inventory,
      );
    }
    live = startLive && endLive && live;
  }
  return live;
}

function assertLiveWindowBounds(window, calibrationArtifact) {
  let startedAt = numberMaxSafeInteger;
  let endedAt = 0;
  for (let index = 0; index < window.components.length; index += 1) {
    const observation = resolveBenchmarkResourceLiveCalibrationComponent(
      calibrationArtifact,
      window.sideId,
      window.components[index].componentId,
    );
    if (observation === undefined) {
      fail(ROOT_TEXT.CELL_RESOURCE_WINDOW_LIVE_COMPONENT_OBSERVATION_MISSING);
    }
    if (observation.start.timestamp < startedAt) {
      startedAt = observation.start.timestamp;
    }
    if (observation.end.timestamp > endedAt) {
      endedAt = observation.end.timestamp;
    }
  }
  if (
    dateParse(window.startedAt) !== startedAt ||
    dateParse(window.endedAt) !== endedAt
  ) {
    fail(ROOT_TEXT.CELL_RESOURCE_WINDOW_LIVE_INTERVAL_RECOMPUTATION_MISMATCH);
  }
}

function validateResourceWindowSources(window, payload, owners, resolved) {
  const sourceFields = [
    ['windowReceiptDigest', BENCHMARK_RESOURCE_ARTIFACT_KIND.WINDOW_RECEIPT],
    ['capacitySampleDigest', BENCHMARK_RESOURCE_ARTIFACT_KIND.CAPACITY_SAMPLE],
    ['semanticReceiptDigest', BENCHMARK_RESOURCE_ARTIFACT_KIND.SEMANTIC_RECEIPT],
    ['liveEngagementDigest', BENCHMARK_RESOURCE_ARTIFACT_KIND.LIVE_ENGAGEMENT],
  ];
  const expected = {
    matrixId: window.matrixId,
    cellId: window.cellId,
    pairId: window.pairId,
    runId: window.runId,
    sideId: window.sideId,
    pairedBlockId: window.pairedBlockId,
    profileIdentity: window.profileIdentity,
    blockIndex: window.blockIndex,
    blockedOrderIndex: window.blockedOrderIndex,
    offeredLoad: window.offeredLoad,
    loadIndex: window.loadIndex,
    phase: window.phase,
  };
  const sourceArtifacts = [];
  for (let index = 0; index < sourceFields.length; index += 1) {
    appendOwnArrayValue(sourceArtifacts, assertWindowSourceArtifact(
      resolved,
      window[sourceFields[index][0]],
      sourceFields[index][1],
      `cell.resourceWindow:${sourceFields[index][0]}_missing`,
      expected,
    ));
  }
  const windowLive = inspectCalibrationArtifact(
    resolved,
    window.liveCalibrationDigest,
    'cell.resourceWindow:live_calibration_missing',
    {runId: payload.runId, sourceRevision: payload.sourceRevision},
  );
  if (windowLive) {
    const liveEngagement = mapGet(resolved, window.liveEngagementDigest);
    if (
      liveEngagement.payload.evidence.amplificationPolicy !==
        semanticEventsAbsentZeroOnly
    ) {
      fail(
        ROOT_TEXT.CELL_RESOURCE_WINDOW_LIVE_AMPLIFICATION_POLICY_MISMATCH,
      );
    }
  }
  const componentsLive = validateComponentCalibrations(
    window,
    payload,
    owners,
    resolved,
    windowLive,
  );
  if (windowLive && componentsLive) {
    assertLiveWindowBounds(
      window,
      mapGet(resolved, window.liveCalibrationDigest),
    );
  }
  return {
    componentsLive,
    sources: {
      receipt: sourceArtifacts[0],
      capacity: sourceArtifacts[1],
      semantic: sourceArtifacts[2],
      live: sourceArtifacts[liveWindowSourceIndex],
    },
  };
}

function appendWindowJoinEvidence(context, window, sideIds) {
  const windowSideIndex = sideIndex(sideIds, window.sideId);
  appendOwnArrayValue(
    context.capacitySampleDigestsBySide[windowSideIndex],
    window.capacitySampleDigest,
  );
  appendOwnArrayValue(
    context.semanticReceiptDigests,
    window.semanticReceiptDigest,
  );
  appendOwnArrayValue(
    context.liveEngagementDigests,
    window.liveEngagementDigest,
  );
  if (!arrayContainsExactValue(
    context.calibrationDigests,
    window.liveCalibrationDigest,
  )) {
    appendOwnArrayValue(
      context.calibrationDigests,
      window.liveCalibrationDigest,
    );
  }
  for (let index = 0; index < window.components.length; index += 1) {
    setAdd(
      context.windowComponentIdentities,
      `${window.sideId}\u0000${window.components[index].componentId}`,
    );
  }
}

function validateMeasuringCellWindows(payload, owners, resolved, c3Plan) {
  const context = {
    windows: [],
    seenSides: new Set(),
    semanticReceiptDigests: [],
    liveEngagementDigests: [],
    capacitySampleDigestsBySide: [[], []],
    liveCalibrated: true,
    calibrationDigests: [],
    windowComponentIdentities: new Set(),
    coordinateContext: createBenchmarkResourceWindowCoordinateContext({
      allowCrossSideOverlap: c3Plan === null,
    }),
  };
  for (let index = 0; index < payload.resourceWindowDigests.length; index += 1) {
    const artifact = resolvedArtifact(
      resolved,
      payload.resourceWindowDigests[index],
      BENCHMARK_RESOURCE_ARTIFACT_KIND.RESOURCE_WINDOW,
    );
    const inspection = inspectBenchmarkResourceWindowArtifact(artifact);
    if (!inspection.valid) fail(`cell.resourceWindow:${inspection.reason}`);
    appendBenchmarkResourceMeasuredWindowCoordinate(
      context.coordinateContext,
      artifact.payload,
      {
        matrixManifestDigest: owners.matrixDigest,
        matrixId: payload.matrixId,
        cellId: payload.cellId,
        pairId: payload.pairId,
        runId: payload.runId,
        profileIdentity: owners.profile.identity,
        sideIds: payload.sideIds,
      },
    );
    appendWindowJoinEvidence(context, artifact.payload, payload.sideIds);
    const sourceValidation = validateResourceWindowSources(
      artifact.payload,
      payload,
      owners,
      resolved,
    );
    assertBenchmarkResourceC3WindowBinding(
      c3Plan,
      artifact.payload,
      sourceValidation.sources,
    );
    context.liveCalibrated =
      sourceValidation.componentsLive && context.liveCalibrated;
    setAdd(context.seenSides, artifact.payload.sideId);
    appendOwnArrayValue(context.windows, artifact);
  }
  if (
    reflectApply(setSizeGetter, context.seenSides, []) !==
      payload.sideIds.length
  ) {
    fail(ROOT_TEXT.CELL_RESOURCE_WINDOW_SIDE_COVERAGE_INCOMPLETE);
  }
  assertBenchmarkResourceMeasuredWindowCoordinatesComplete(
    context.coordinateContext,
    payload.sideIds,
    c3Plan?.coordinates ?? null,
  );
  if (context.liveCalibrated) {
    for (let index = 0; index < context.calibrationDigests.length; index += 1) {
      assertBenchmarkResourceLiveTopologyClosure({
        calibrationArtifact: mapGet(
          resolved,
          context.calibrationDigests[index],
        ),
        topologyArtifact: resolvedArtifact(
          resolved,
          owners.matrix.alternativeTopologyDigest,
          BENCHMARK_RESOURCE_ARTIFACT_KIND.ALTERNATIVE_TOPOLOGY,
        ),
        inventory: owners.inventory,
        windowComponentIdentities: context.windowComponentIdentities,
        windowComponentCount: reflectApply(
          setSizeGetter,
          context.windowComponentIdentities,
          [],
        ),
      });
    }
  }
  return context;
}

function validateMeasuringCellJoins(
  payload,
  owners,
  capacities,
  context,
  resolved,
  c3Plan,
) {
  const resourcePreregistration = context.liveCalibrated ?
    resolvedArtifact(resolved, owners.matrix.preregistrationDigest,
      BENCHMARK_RESOURCE_ARTIFACT_KIND.PREREGISTRATION).payload : null;
  if (
    !arraysExactlyEqual(
      payload.semanticReceiptDigests,
      context.semanticReceiptDigests,
    ) ||
    !arraysExactlyEqual(
      payload.liveEngagementDigests,
      context.liveEngagementDigests,
    )
  ) {
    fail(ROOT_TEXT.CELL_RESOURCE_WINDOW_RECEIPT_JOIN_MISMATCH);
  }
  for (let index = 0; index < capacities.length; index += 1) {
    if (
      !arraysExactlyEqual(
        capacities[index].sourceDigests,
        context.capacitySampleDigestsBySide[index],
      )
    ) {
      fail(ROOT_TEXT.CELL_CAPACITY_EFFECT_SAMPLE_JOIN_MISMATCH);
    }
    if (context.liveCalibrated && c3Plan !== null) {
      assertBenchmarkResourceCapacityProtocolSummary(
        capacities[index],
        resolvedArtifact(
          resolved,
          capacities[index].sourceDigests[0],
          BENCHMARK_RESOURCE_ARTIFACT_KIND.CAPACITY_SAMPLE,
        ),
        payload.sideIds[index],
        index,
        resourcePreregistration,
      );
    }
  }
  assertEffectMatchesSides(payload.capacityEffect, payload.sideIds);
  assertEffectMatchesSides(payload.costEffect, payload.sideIds);
  if (
    !arraysExactlyEqual(
      payload.capacityEffect.sourceDigests,
      payload.capacityReportDigests,
    )
  ) {
    fail(ROOT_TEXT.CELL_CAPACITY_EFFECT_SOURCE_DIGEST_MISMATCH);
  }
  const expectedCostSources = [
    owners.inventoryDigest,
    owners.priceDigest,
  ];
  for (let index = 0; index < payload.resourceWindowDigests.length; index += 1) {
    appendOwnArrayValue(
      expectedCostSources,
      payload.resourceWindowDigests[index],
    );
  }
  if (
    !arraysExactlyEqual(
      payload.costEffect.sourceDigests,
      expectedCostSources,
    )
  ) {
    fail(ROOT_TEXT.CELL_COST_EFFECT_SOURCE_DIGEST_MISMATCH);
  }
}

function validateMeasuringCell(cellArtifact, payload, owners, resolved) {
  validateMeasuringCellIdentity(cellArtifact, payload, owners);
  const capacities = resolveMeasuringCellCapacities(payload, resolved);
  const c3Plan = createBenchmarkResourceC3WindowPlan({
    capacities,
    resolved,
    payload,
    owners,
    resourcePreregistration: resolvedArtifact(
      resolved,
      owners.matrix.preregistrationDigest,
      BENCHMARK_RESOURCE_ARTIFACT_KIND.PREREGISTRATION,
    ).payload,
  });
  const context =
    validateMeasuringCellWindows(payload, owners, resolved, c3Plan);
  validateMeasuringCellJoins(
    payload,
    owners,
    capacities,
    context,
    resolved,
    c3Plan,
  );
  recomputeBenchmarkResourceMeasuringCellEffects(
    payload,
    owners,
    capacities,
    context.windows,
  );
  return context.liveCalibrated && c3Plan !== null;
}

function validateNonMeasuringCell(cellArtifact, payload, owners) {
  assertBenchmarkResourceExactRecord(
    payload,
    nonMeasuringCellPayloadKeys,
    ROOT_TEXT.CELL,
  );
  const input = {};
  for (let index = 0; index < nonMeasuringCellInputKeys.length; index += 1) {
    input[nonMeasuringCellInputKeys[index]] =
      payload[nonMeasuringCellInputKeys[index]];
  }
  const reconstructed = createBenchmarkResourceNonMeasuringCellEvidence(input);
  if (
    reconstructed.artifact.payload.cellEvidenceDigest !==
      payload.cellEvidenceDigest ||
    digestBenchmarkSemanticData(reconstructed.artifact) !==
      digestBenchmarkSemanticData(cellArtifact) ||
    payload.matrixManifestDigest !== owners.matrixDigest ||
    payload.matrixId !== owners.matrix.matrixId ||
    payload.sourceRevision !== owners.root.sourceRevision ||
    payload.producedAt !== owners.root.producedAt ||
    payload.validUntil !== owners.root.validUntil ||
    digestBenchmarkSemanticData(payload.sideIds) !==
      digestBenchmarkSemanticData(owners.matrix.sideIds)
  ) {
    fail(ROOT_TEXT.CELL_NON_MEASURING_RECONSTRUCTION_MISMATCH);
  }
}

function validateCells(root, owners, resolved) {
  const expected = expectedCellIds(owners.matrix);
  const cellPayloads = [];
  let claimEligible = true;
  let measuringCellCount = 0;
  if (
    root.cellEvidenceDigests.length !==
      reflectApply(setSizeGetter, expected, [])
  ) {
    fail(ROOT_TEXT.ROOT_CELLS_COUNT_MISMATCH);
  }
  for (let index = 0; index < root.cellEvidenceDigests.length; index += 1) {
    const artifact = resolvedArtifact(
      resolved,
      root.cellEvidenceDigests[index],
      BENCHMARK_RESOURCE_ARTIFACT_KIND.CELL_EVIDENCE,
    );
    const payload = artifact.payload;
    appendOwnArrayValue(cellPayloads, payload);
    if (!setHas(expected, payload.cellId)) {
      fail(ROOT_TEXT.ROOT_CELLS_EXTRA_OR_DUPLICATE);
    }
    setDelete(expected, payload.cellId);
    if (payload.state === BENCHMARK_RESOURCE_CELL_STATE.MEASURING) {
      measuringCellCount += 1;
      claimEligible =
        validateMeasuringCell(artifact, payload, owners, resolved) &&
        claimEligible;
    } else if (payload.state === BENCHMARK_RESOURCE_CELL_STATE.NON_MEASURING) {
      validateNonMeasuringCell(artifact, payload, owners);
    } else {
      fail(ROOT_TEXT.CELL_STATE_UNSUPPORTED);
    }
  }
  if (reflectApply(setSizeGetter, expected, []) !== 0) {
    fail(ROOT_TEXT.ROOT_CELLS_MISSING);
  }
  return {
    claimEligible: claimEligible && measuringCellCount > 0,
    cellPayloads,
  };
}

function allArtifactsSemanticallyOwned(root, resolved) {
  const owned = new Set();
  setAdd(owned, root.matrixManifestDigest);
  setAdd(owned, root.componentInventoryDigest);
  setAdd(owned, root.priceSheetDigest);
  for (let index = 0; index < root.cellEvidenceDigests.length; index += 1) {
    setAdd(owned, root.cellEvidenceDigests[index]);
  }
  const pending = [
    root.matrixManifestDigest,
    root.componentInventoryDigest,
    root.priceSheetDigest,
  ];
  for (let index = 0; index < root.cellEvidenceDigests.length; index += 1) {
    if (!arrayContainsExactValue(pending, root.cellEvidenceDigests[index])) {
      appendOwnArrayValue(pending, root.cellEvidenceDigests[index]);
    }
  }
  for (let index = 0; index < pending.length; index += 1) {
    const artifact = mapGet(resolved, pending[index]);
    if (artifact === undefined) fail(ROOT_TEXT.ROOT_ARTIFACTS_OWNER_MISSING);
    for (let refIndex = 0;
      refIndex < artifact.references.length;
      refIndex += 1) {
      const digest = artifact.references[refIndex];
      if (!setHas(owned, digest)) {
        setAdd(owned, digest);
        appendOwnArrayValue(pending, digest);
      }
    }
  }
  if (
    reflectApply(setSizeGetter, owned, []) !==
      reflectApply(mapSizeGetter, resolved, [])
  ) {
    fail(ROOT_TEXT.ROOT_ARTIFACTS_EXTRA_OR_RELOCATED);
  }
}

function resolveRootReceipt(receipt) {
  assertBenchmarkResourceExactRecord(
    receipt,
    [ROOT_TEXT.ROOT_DIGEST, ROOT_TEXT.RESOLVER],
    ROOT_TEXT.ROOT_RECEIPT,
  );
  assertBenchmarkResourceDigest(receipt.rootDigest, ROOT_TEXT.ROOT_RECEIPT_ROOT_DIGEST);
  const resolver = receipt.resolver;
  assertBenchmarkResourceExactRecord(resolver, resolverKeys, ROOT_TEXT.RESOLVER);
  const resolve = ownDataValue(resolver, 'resolve');
  if (isMissingDataValue(resolve) || typeof resolve !== 'function') {
    fail(ROOT_TEXT.RESOLVER_RESOLVE_FUNCTION_REQUIRED);
  }
  const rootBytes = reflectApply(resolve, resolver, [receipt.rootDigest]);
  if (rootBytes === undefined) fail(ROOT_TEXT.ROOT_RECEIPT_ROOT_MISSING);
  assertBenchmarkResourceBytes(rootBytes, ROOT_TEXT.ROOT_RECEIPT_ROOT_BYTES);
  const rootArtifact = parseBenchmarkResourceArtifact(
    rootBytes,
    receipt.rootDigest,
  );
  if (rootArtifact.kind !== BENCHMARK_RESOURCE_ARTIFACT_KIND.ROOT) {
    fail(ROOT_TEXT.ROOT_KIND_UNSUPPORTED);
  }
  const resolved = resolveManifest(rootArtifact, resolver);
  if (mapHas(resolved, receipt.rootDigest)) {
    fail(ROOT_TEXT.ROOT_ARTIFACT_MANIFEST_SELF_INCLUSION);
  }
  assertClosedAcyclicGraph(
    receipt.rootDigest,
    rootArtifact.references,
    resolved,
  );
  const root = rootArtifact.payload;
  assertProductionInterval(root, ROOT_TEXT.ROOT);
  assertBenchmarkResourceText(root.sourceRevision, ROOT_TEXT.ROOT_SOURCE_REVISION);
  return {rootDigest: receipt.rootDigest, root, resolved};
}

function inspectOwner(artifact, inspect, path) {
  const inspection = inspect(artifact);
  if (!inspection.valid) fail(`${path}:${inspection.reason}`);
}

function resolveEvidenceOwners(root, resolved) {
  const matrixArtifact = resolvedArtifact(
    resolved,
    root.matrixManifestDigest,
    BENCHMARK_RESOURCE_ARTIFACT_KIND.MATRIX_MANIFEST,
  );
  inspectOwner(
    matrixArtifact,
    inspectBenchmarkResourceMatrixManifestArtifact,
    ROOT_TEXT.ROOT_MATRIX,
  );
  let profile = null;
  if (matrixArtifact.payload.profileEnvelopeDigest !== null) {
    const profileArtifact = resolvedArtifact(
      resolved,
      matrixArtifact.payload.profileEnvelopeDigest,
      BENCHMARK_RESOURCE_ARTIFACT_KIND.PROFILE_ENVELOPE,
    );
    const profileInspection =
      inspectScaleProfileEnvelope(profileArtifact.payload);
    if (!profileInspection.valid) {
      fail(`root.profile:${profileInspection.reason}`);
    }
    profile = {
      ...profileInspection.profile,
      envelopeDigest: matrixArtifact.payload.profileEnvelopeDigest,
    };
  }
  const inventoryArtifact = resolvedArtifact(
    resolved,
    root.componentInventoryDigest,
    BENCHMARK_RESOURCE_ARTIFACT_KIND.COMPONENT_INVENTORY,
  );
  inspectOwner(
    inventoryArtifact,
    inspectBenchmarkResourceInventoryArtifact,
    ROOT_TEXT.ROOT_INVENTORY,
  );
  const priceArtifact = resolvedArtifact(
    resolved,
    root.priceSheetDigest,
    BENCHMARK_RESOURCE_ARTIFACT_KIND.PRICE_SHEET,
  );
  const priceInspection =
    inspectBenchmarkResourcePriceSheetArtifact(priceArtifact);
  const priceValidAtProduction = priceInspection.valid &&
    dateParse(root.producedAt) >=
      dateParse(priceArtifact.payload.validFrom) &&
    dateParse(root.producedAt) <
      dateParse(priceArtifact.payload.validUntil);
  return {
    matrixDigest: root.matrixManifestDigest,
    matrix: matrixArtifact.payload,
    inventoryDigest: root.componentInventoryDigest,
    inventory: inventoryArtifact.payload,
    priceDigest: root.priceSheetDigest,
    price: priceValidAtProduction ? priceArtifact.payload : null,
    priceValidAtProduction,
    profile,
    root,
  };
}

export function validateBenchmarkResourceEvidenceRoot(receipt) {
  const acceptance = acceptBenchmarkResourceClaimEvidenceRoot(receipt);
  const inspection =
    inspectBenchmarkResourceClaimEvidenceAcceptance(acceptance);
  const valid =
    inspection.state === BENCHMARK_RESOURCE_CLAIM_EVIDENCE_STATE.ACCEPTED;
  return {
    valid,
    reason: valid ? ROOT_TEXT.VALID : inspection.reason,
    claimEligible: valid && inspection.evidence.claimEligible,
    matrixId: valid ? inspection.evidence.matrixId : ROOT_TEXT.UNRESOLVED,
    cellCount: valid ? inspection.evidence.cells.length : 0,
    artifactCount: valid ? inspection.artifactCount : 0,
  };
}

export function inspectBenchmarkResourceClaimEvidenceRoot(receipt) {
  try {
    const {rootDigest, root, resolved} = resolveRootReceipt(receipt);
    const owners = resolveEvidenceOwners(root, resolved);
    assertBenchmarkResourceEvidenceOwnerJoin(
      owners,
      ROOT_TEXT.ROOT_OWNERS_MATRIX_INVENTORY_MISMATCH,
    );
    const cellValidation = validateCells(root, owners, resolved);
    allArtifactsSemanticallyOwned(root, resolved);
    return {
      state: BENCHMARK_RESOURCE_CLAIM_EVIDENCE_STATE.ACCEPTED,
      artifactCount: reflectApply(mapSizeGetter, resolved, []),
      evidence: createBenchmarkResourceClaimEvidenceView({
        rootDigest,
        claimEligible: cellValidation.claimEligible,
        root,
        owners,
        cellPayloads: cellValidation.cellPayloads,
      }),
    };
  } catch (error) {
    const reason = safeBenchmarkResourceValidationReason(
      error,
      ROOT_TEXT.VALIDATION_FAILED,
    );
    return {
      state: BENCHMARK_RESOURCE_CLAIM_EVIDENCE_STATE.REJECTED,
      reason,
      measurementOutcome: benchmarkResourceRejectedMeasurementOutcome(reason),
    };
  }
}

export function acceptBenchmarkResourceClaimEvidenceRoot(receipt) {
  const handle = objectFreeze({
    inspection: objectFreeze(
      inspectBenchmarkResourceClaimEvidenceRoot(receipt),
    ),
  });
  weakSetAdd(acceptanceHandles, handle);
  return handle;
}

export function inspectBenchmarkResourceClaimEvidenceAcceptance(handle) {
  if (
    handle !== null &&
    typeof handle === 'object' &&
    weakSetHas(acceptanceHandles, handle)
  ) {
    return handle.inspection;
  }
  const reason = BENCHMARK_RESOURCE_MEASUREMENT_REASON
    .IMMUTABLE_RESOLUTION_DRIFT;
  return {
    state: BENCHMARK_RESOURCE_CLAIM_EVIDENCE_STATE.REJECTED,
    reason,
    measurementOutcome: benchmarkResourceRejectedMeasurementOutcome(reason),
  };
}
