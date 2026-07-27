import {createHash} from 'node:crypto';
import {Stats} from 'node:fs';
import {lstat, mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, join, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {types} from 'node:util';
import {
  digestBenchmarkSemanticData,
  hasExactOwnDataKeys,
  isDenseDataArray,
  isNonNegativeSafeInteger,
  isNonNegativeSafeNumber,
  isPlainDataRecord,
  isSha256Digest,
  parseBenchmarkSemanticJson,
} from './benchmark-semantic-integrity.js';
import {
  BENCHMARK_CAPACITY_MAX_ARTIFACT_BYTES,
  BENCHMARK_CAPACITY_MAX_LIVE_LOG_BYTES,
  BENCHMARK_CAPACITY_MAX_TEXT_CODE_UNITS,
  BENCHMARK_CAPACITY_LIVE_EVIDENCE_CLASS,
  BENCHMARK_CAPACITY_LIVE_PROVENANCE_PROVIDER,
  BENCHMARK_CAPACITY_LIVE_PROVENANCE_VERSION,
  BENCHMARK_CAPACITY_OPERATION_LOG_ISSUER,
  BENCHMARK_CAPACITY_OPERATION_LOG_VERSION,
  BENCHMARK_CAPACITY_RESET_PHASE,
} from './benchmark-capacity-protocol-constants.js';
import {
  deriveBenchmarkCapacityExpectedWindow,
  inspectBenchmarkCapacityPreregistration,
} from './benchmark-capacity-preregistration.js';
import {
  inspectBenchmarkCapacityTerminalMeasurement,
  inspectBenchmarkCapacityProtocolReport,
} from './benchmark-capacity-protocol.js';
import {
  inspectBenchmarkCapacityArtifactPath,
  inspectBenchmarkCapacityArtifactPathParents,
} from './benchmark-capacity-artifact-path-integrity.js';
import {
  consumeBenchmarkCapacityLiveArtifactAuthorization,
  resolveBenchmarkCapacityLiveObservationPayload,
} from './benchmark-capacity-live-observation-authority.js';

const ARTIFACT_VERSION = 'benchmark-capacity-raw-artifact-v1';
const RECEIPT_VERSION = 'benchmark-capacity-artifact-receipt-v1';
const LIVE_EVIDENCE_VERSION = 'benchmark-capacity-live-evidence-v1';
const CLEANUP_RECEIPT_VERSION = 'benchmark-capacity-cleanup-receipt-v1';
const OPTION_KEYS = ['preregistration', 'report', 'liveEvidence'];
const ARTIFACT_KEYS = [
  'version',
  'preregistration',
  'report',
  'liveEvidence',
  'artifactSemanticDigest',
];
const RECEIPT_KEYS = [
  'version',
  'artifactPath',
  'artifactByteLength',
  'artifactByteDigest',
  'artifactSemanticDigest',
  'preregistrationDigest',
  'reportDigest',
];
const LIVE_EVIDENCE_KEYS = [
  'version',
  'preregistrationDigest',
  'reportDigest',
  'matrixId',
  'cellId',
  'cellManifestDigest',
  'profileIdentity',
  'pairIdentity',
  'runId',
  'liveEnvironmentContractDigest',
  'liveEnvironmentContract',
  'evidenceClass',
  'provenanceReceipt',
  'engagementOnly',
  'comparativeClaimEligible',
  'reason',
  'image',
  'imageId',
  'postgresVersion',
  'observedRowsAfterFinalResetCell',
  'finalRowCountQueryText',
  'queueObserved',
  'windowEngagements',
  'resetEngagements',
  'containerLogText',
  'cleanupReceipt',
  'observationReceipt',
];
const WINDOW_ENGAGEMENT_INPUT_KEYS = [
  'blockIndex',
  'blockedOrderIndex',
  'sideId',
  'phase',
  'offeredLoad',
  'startedAt',
  'endedAt',
  'operationLogText',
];
const WINDOW_ENGAGEMENT_KEYS = [
  'matrixId',
  'cellId',
  'cellManifestDigest',
  'profileIdentity',
  'pairIdentity',
  'runId',
  'liveEnvironmentContractDigest',
  'blockIndex',
  'blockedOrderIndex',
  'sideId',
  'phase',
  'offeredLoad',
  'startedAt',
  'endedAt',
  'observationStartedAtMs',
  'observationEndedAtMs',
  'observationDurationMs',
  'capacitySampleDigest',
  'operationLogText',
  'liveEngagementDigest',
];
const RESET_ENGAGEMENT_INPUT_KEYS = [
  'blockIndex',
  'blockedOrderIndex',
  'sideId',
  'offeredLoad',
  'startedAt',
  'endedAt',
  'operationLogText',
];
const RESET_ENGAGEMENT_KEYS = [
  'matrixId',
  'cellId',
  'cellManifestDigest',
  'profileIdentity',
  'pairIdentity',
  'runId',
  'liveEnvironmentContractDigest',
  'blockIndex',
  'blockedOrderIndex',
  'sideId',
  'phase',
  'offeredLoad',
  'startedAt',
  'endedAt',
  'operationLogText',
  'liveEngagementDigest',
];
const CLEANUP_INPUT_KEYS = [
  'runId',
  'liveEnvironmentContractDigest',
  'provenanceReceiptDigest',
  'provider',
  'containerId',
  'containerLookup',
  'networkId',
  'networkName',
  'networkLookup',
  'containerAbsent',
  'networkAbsent',
  'completedAt',
];
const LIVE_ENVIRONMENT_CONTRACT_KEYS = [
  'image',
  'imageId',
  'transport',
  'database',
];
const CLEANUP_RECEIPT_KEYS = [
  'version',
  ...CLEANUP_INPUT_KEYS,
  'cleanupReceiptDigest',
];
const OBSERVATION_RECEIPT_KEYS = [
  'version',
  'issuer',
  'observationByteLength',
  'observationByteDigest',
  'observationText',
];
const LIVE_PROVENANCE_INPUT_KEYS = [
  'runId',
  'provider',
  'observedAt',
  'containerId',
  'containerImageId',
  'containerRunning',
  'containerLabelsDigest',
  'networkId',
  'networkName',
  'networkObservedId',
  'networkObservedName',
];
const LIVE_PROVENANCE_RECEIPT_KEYS = [
  'version',
  ...LIVE_PROVENANCE_INPUT_KEYS,
  'provenanceReceiptDigest',
];
const WINDOW_LOG_KEYS = [
  'version',
  'issuer',
  'blockIndex',
  'blockedOrderIndex',
  'sideId',
  'phase',
  'offeredLoad',
  'entries',
];
const WINDOW_LOG_ENTRY_KEYS = [
  'operationIndex',
  'sql',
  'command',
  'rowCount',
];
const RESET_LOG_KEYS = [
  'version',
  'issuer',
  'blockIndex',
  'blockedOrderIndex',
  'sideId',
  'phase',
  'offeredLoad',
  'sql',
  'command',
  'rowCount',
];
const bufferByteLength = Buffer.byteLength.bind(Buffer);
const bufferFrom = Buffer.from.bind(Buffer);
const bufferToString = Function.call.bind(Buffer.prototype.toString);
const isProxy = types.isProxy.bind(types);
const jsonStringify = JSON.stringify;
const arraySome = Function.call.bind(Array.prototype.some);
const MapConstructor = Map;
const mapDelete = Function.call.bind(Map.prototype.delete);
const mapGet = Function.call.bind(Map.prototype.get);
const mapHas = Function.call.bind(Map.prototype.has);
const mapSet = Function.call.bind(Map.prototype.set);
const mapSizeGetter =
  Object.getOwnPropertyDescriptor(Map.prototype, 'size').get;
const objectCreate = Object.create;
const objectHasOwn = Object.hasOwn;
const objectKeys = Object.keys;
const reflectApply = Reflect.apply;
const regexpExec = Function.call.bind(RegExp.prototype.exec);
const stringIncludes = Function.call.bind(String.prototype.includes);
const stringSlice = Function.call.bind(String.prototype.slice);
const statsIsFile = Function.call.bind(Stats.prototype.isFile);

const REPOSITORY_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const BENCHMARK_CAPACITY_RAW_ARTIFACT_ROOT = join(
  REPOSITORY_ROOT,
  'test-output/reports/benchmark-statistical-capacity-protocol/raw',
);

function fail(reason) {
  throw new TypeError(`invalid benchmark capacity raw artifact: ${reason}`);
}

function byteDigest(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function isExactRecord(value, keys) {
  return !isProxy(value) && hasExactOwnDataKeys(value, keys);
}

function isExactArray(value) {
  return !isProxy(value) && isDenseDataArray(value);
}

function assertBoundedText(value, path, allowEmpty = false) {
  if (
    typeof value !== 'string' ||
    (!allowEmpty && value.length === 0) ||
    value.length > BENCHMARK_CAPACITY_MAX_LIVE_LOG_BYTES ||
    (
      path !== 'operationLogText' &&
      path !== 'containerLogText' &&
      value.length > BENCHMARK_CAPACITY_MAX_TEXT_CODE_UNITS
    )
  ) {
    fail(`${path}:bounded_text_required`);
  }
}

function textByteLength(value, path) {
  assertBoundedText(value, path, true);
  const length = bufferByteLength(value, 'utf8');
  if (length > BENCHMARK_CAPACITY_MAX_LIVE_LOG_BYTES) {
    fail(`${path}:byte_bound_exceeded`);
  }
  return length;
}

function assertWallWindow(input) {
  if (
    !isNonNegativeSafeInteger(input.startedAt) ||
    !isNonNegativeSafeInteger(input.endedAt) ||
    input.endedAt <= input.startedAt
  ) {
    fail('live_window:positive_unix_millisecond_coverage_required');
  }
}

function engagementBody(engagement, keys) {
  const body = {};
  for (let index = 0; index < keys.length - 1; index += 1) {
    const key = keys[index];
    body[key] = engagement[key];
  }
  return body;
}

export function createBenchmarkCapacityLiveWindowEngagement(
  input,
  sample,
  preregistration,
) {
  if (!hasExactOwnDataKeys(input, WINDOW_ENGAGEMENT_INPUT_KEYS)) {
    fail('window_engagement_input:exact_shape_required');
  }
  assertWallWindow(input);
  textByteLength(input.operationLogText, 'operationLogText');
  const expected = deriveBenchmarkCapacityExpectedWindow(
    preregistration,
    {
      blockIndex: input.blockIndex,
      blockedOrderIndex: input.blockedOrderIndex,
      sideId: input.sideId,
      offeredLoad: input.offeredLoad,
      phase: input.phase,
    },
  );
  if (
    !isPlainDataRecord(sample) ||
    sample.blockIndex !== input.blockIndex ||
    sample.sideId !== input.sideId ||
    sample.phase !== input.phase ||
    sample.offeredLoadPerSecond !== input.offeredLoad ||
    !isNonNegativeSafeNumber(sample.observationStartedAtMs) ||
    !isNonNegativeSafeNumber(sample.observationEndedAtMs) ||
    !isNonNegativeSafeInteger(sample.observationDurationMs) ||
    !isSha256Digest(sample.sampleDigest)
  ) {
    fail('window_engagement_input:sample_binding_mismatch');
  }
  const body = {
    ...expected,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    observationStartedAtMs: sample.observationStartedAtMs,
    observationEndedAtMs: sample.observationEndedAtMs,
    observationDurationMs: sample.observationDurationMs,
    capacitySampleDigest: sample.sampleDigest,
    operationLogText: input.operationLogText,
  };
  return {
    ...body,
    liveEngagementDigest: digestBenchmarkSemanticData(body),
  };
}

export function createBenchmarkCapacityLiveResetEngagement(
  input,
  preregistration,
) {
  if (!hasExactOwnDataKeys(input, RESET_ENGAGEMENT_INPUT_KEYS)) {
    fail('reset_engagement_input:exact_shape_required');
  }
  assertWallWindow(input);
  textByteLength(input.operationLogText, 'operationLogText');
  const expected = deriveBenchmarkCapacityExpectedWindow(
    preregistration,
    {
      blockIndex: input.blockIndex,
      blockedOrderIndex: input.blockedOrderIndex,
      sideId: input.sideId,
      offeredLoad: input.offeredLoad,
      phase: BENCHMARK_CAPACITY_RESET_PHASE,
    },
  );
  const body = {
    ...expected,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    operationLogText: input.operationLogText,
  };
  return {
    ...body,
    liveEngagementDigest: digestBenchmarkSemanticData(body),
  };
}

function provenanceBody(receipt) {
  return engagementBody(receipt, LIVE_PROVENANCE_RECEIPT_KEYS);
}

export function createBenchmarkCapacityLiveProvenanceReceipt(input) {
  if (!hasExactOwnDataKeys(input, LIVE_PROVENANCE_INPUT_KEYS)) {
    fail('live_provenance_input:exact_shape_required');
  }
  const textFields = [
    'runId',
    'provider',
    'containerId',
    'containerImageId',
    'networkId',
    'networkName',
    'networkObservedId',
    'networkObservedName',
  ];
  for (let index = 0; index < textFields.length; index += 1) {
    assertBoundedText(input[textFields[index]], textFields[index]);
  }
  if (
    input.provider !== BENCHMARK_CAPACITY_LIVE_PROVENANCE_PROVIDER ||
    input.containerRunning !== true ||
    !isSha256Digest(input.containerLabelsDigest) ||
    !isNonNegativeSafeInteger(input.observedAt) ||
    input.observedAt === 0 ||
    input.networkObservedId !== input.networkId ||
    input.networkObservedName !== input.networkName
  ) {
    fail('live_provenance_input:external_observation_required');
  }
  const body = {
    version: BENCHMARK_CAPACITY_LIVE_PROVENANCE_VERSION,
    ...input,
  };
  return {
    ...body,
    provenanceReceiptDigest: digestBenchmarkSemanticData(body),
  };
}

export function createBenchmarkCapacityCleanupReceipt(input) {
  if (!hasExactOwnDataKeys(input, CLEANUP_INPUT_KEYS)) {
    fail('cleanup_receipt_input:exact_shape_required');
  }
  const textFields = [
    'runId',
    'provider',
    'containerId',
    'containerLookup',
    'networkId',
    'networkName',
    'networkLookup',
  ];
  for (let index = 0; index < textFields.length; index += 1) {
    assertBoundedText(input[textFields[index]], textFields[index]);
  }
  if (
    !isSha256Digest(input.liveEnvironmentContractDigest) ||
    !isSha256Digest(input.provenanceReceiptDigest) ||
    input.provider !== BENCHMARK_CAPACITY_LIVE_PROVENANCE_PROVIDER ||
    input.containerLookup !== 'absent' ||
    input.networkLookup !== 'absent' ||
    input.containerAbsent !== true ||
    input.networkAbsent !== true ||
    !isNonNegativeSafeInteger(input.completedAt) ||
    input.completedAt === 0
  ) {
    fail('cleanup_receipt_input:verified_absence_required');
  }
  const body = {
    version: CLEANUP_RECEIPT_VERSION,
    ...input,
  };
  return {
    ...body,
    cleanupReceiptDigest: digestBenchmarkSemanticData(body),
  };
}

function receiptShapeIsValid(receipt) {
  return hasExactOwnDataKeys(receipt, RECEIPT_KEYS) &&
    receipt.version === RECEIPT_VERSION &&
    typeof receipt.artifactPath === 'string' &&
    isNonNegativeSafeInteger(receipt.artifactByteLength) &&
    receipt.artifactByteLength > 0 &&
    receipt.artifactByteLength <= BENCHMARK_CAPACITY_MAX_ARTIFACT_BYTES &&
    isSha256Digest(receipt.artifactByteDigest) &&
    isSha256Digest(receipt.artifactSemanticDigest) &&
    isSha256Digest(receipt.preregistrationDigest) &&
    isSha256Digest(receipt.reportDigest);
}

function canonicalArtifactPath(artifactByteDigest) {
  const hexadecimal = stringSlice(artifactByteDigest, 'sha256:'.length);
  return `${BENCHMARK_CAPACITY_RAW_ARTIFACT_ROOT}${sep}sha256${sep}` +
    `${stringSlice(hexadecimal, 0, 2)}${sep}${hexadecimal}.raw.json`;
}

function identityMatches(value, preregistration) {
  const expected = preregistration.executionIdentity;
  const keys = objectKeys(expected);
  for (let index = 0; index < keys.length; index += 1) {
    if (value[keys[index]] !== expected[keys[index]]) return false;
  }
  return true;
}

function engagementDigestIsValid(engagement, keys) {
  return isExactRecord(engagement, keys) &&
    isSha256Digest(engagement.liveEngagementDigest) &&
    digestBenchmarkSemanticData(engagementBody(engagement, keys)) ===
      engagement.liveEngagementDigest;
}

function expectedLogIssuer(evidenceClass) {
  return evidenceClass ===
      BENCHMARK_CAPACITY_LIVE_EVIDENCE_CLASS.EXTERNALLY_OBSERVED ?
    BENCHMARK_CAPACITY_OPERATION_LOG_ISSUER.MANAGED_POSTGRESQL :
    BENCHMARK_CAPACITY_OPERATION_LOG_ISSUER.SYNTHETIC_FIXTURE;
}

function logCoordinatesMatch(log, engagement) {
  return log.blockIndex === engagement.blockIndex &&
    log.blockedOrderIndex === engagement.blockedOrderIndex &&
    log.sideId === engagement.sideId &&
    log.phase === engagement.phase &&
    log.offeredLoad === engagement.offeredLoad;
}

function parseExactLog(text) {
  const parsed = parseBenchmarkSemanticJson(text);
  return jsonStringify(parsed) === text ? parsed : null;
}

function windowLogEnvelopeIsValid(log, engagement, sample, evidenceClass) {
  return log !== null &&
    hasExactOwnDataKeys(log, WINDOW_LOG_KEYS) &&
    log.version === BENCHMARK_CAPACITY_OPERATION_LOG_VERSION &&
    log.issuer === expectedLogIssuer(evidenceClass) &&
    logCoordinatesMatch(log, engagement) &&
    isDenseDataArray(log.entries) &&
    log.entries.length === sample.counts.correct;
}

function windowLogEntryFieldsAreValid(entry, sample, seen) {
  return hasExactOwnDataKeys(entry, WINDOW_LOG_ENTRY_KEYS) &&
    isNonNegativeSafeInteger(entry.operationIndex) &&
    entry.operationIndex < sample.counts.offered &&
    !objectHasOwn(seen, entry.operationIndex) &&
    typeof entry.sql === 'string' &&
    entry.sql.length > 0 &&
    entry.sql.length <= BENCHMARK_CAPACITY_MAX_LIVE_LOG_BYTES &&
    entry.command === 'INSERT' &&
    entry.rowCount === 1;
}

function windowLogSqlIsObserved(entry, evidenceClass, prefix) {
  return evidenceClass !==
      BENCHMARK_CAPACITY_LIVE_EVIDENCE_CLASS.EXTERNALLY_OBSERVED ||
    stringIncludes(entry.sql, prefix);
}

function windowOperationLogIsValid(
  engagement,
  sample,
  preregistration,
  evidenceClass,
) {
  let log;
  try {
    log = parseExactLog(engagement.operationLogText);
  } catch {
    return false;
  }
  if (!windowLogEnvelopeIsValid(
    log,
    engagement,
    sample,
    evidenceClass,
  )) return false;
  const seen = objectCreate(null);
  const prefix = `${preregistration.executionIdentity.runId}-` +
    `${engagement.sideId}-${engagement.blockIndex}-` +
    `${engagement.blockedOrderIndex}-${engagement.offeredLoad}-` +
    `${engagement.phase}-`;
  for (let index = 0; index < log.entries.length; index += 1) {
    const entry = log.entries[index];
    if (!windowLogEntryFieldsAreValid(entry, sample, seen)) return false;
    if (!windowLogSqlIsObserved(entry, evidenceClass, prefix)) return false;
    seen[entry.operationIndex] = true;
  }
  return true;
}

function resetOperationLogIsValid(engagement, evidenceClass) {
  let log;
  try {
    log = parseExactLog(engagement.operationLogText);
  } catch {
    return false;
  }
  return log !== null &&
    hasExactOwnDataKeys(log, RESET_LOG_KEYS) &&
    log.version === BENCHMARK_CAPACITY_OPERATION_LOG_VERSION &&
    log.issuer === expectedLogIssuer(evidenceClass) &&
    logCoordinatesMatch(log, engagement) &&
    typeof log.sql === 'string' &&
    log.sql.length > 0 &&
    log.sql.length <= BENCHMARK_CAPACITY_MAX_LIVE_LOG_BYTES &&
    log.command === 'TRUNCATE' &&
    (
      log.rowCount === null ||
      isNonNegativeSafeInteger(log.rowCount)
    );
}

function liveEnvironmentContractIsValid(liveEvidence) {
  const contract = liveEvidence.liveEnvironmentContract;
  if (
    !hasExactOwnDataKeys(contract, LIVE_ENVIRONMENT_CONTRACT_KEYS) ||
    contract.image !== liveEvidence.image ||
    contract.imageId !== liveEvidence.imageId
  ) return false;
  for (let index = 0;
    index < LIVE_ENVIRONMENT_CONTRACT_KEYS.length;
    index += 1) {
    try {
      assertBoundedText(
        contract[LIVE_ENVIRONMENT_CONTRACT_KEYS[index]],
        `liveEnvironmentContract.${LIVE_ENVIRONMENT_CONTRACT_KEYS[index]}`,
      );
    } catch {
      return false;
    }
  }
  return digestBenchmarkSemanticData(contract) ===
    liveEvidence.liveEnvironmentContractDigest;
}

function sampleResolver(report) {
  const samples = new MapConstructor();
  const collections = [report.warmupSamples, report.rawSamples];
  for (let collectionIndex = 0;
    collectionIndex < collections.length;
    collectionIndex += 1) {
    const collection = collections[collectionIndex];
    for (let index = 0; index < collection.length; index += 1) {
      const sample = collection[index];
      if (mapHas(samples, sample.sampleDigest)) return null;
      mapSet(samples, sample.sampleDigest, sample);
    }
  }
  return samples;
}

function windowSampleMatches(sample, engagement) {
  return sample.blockIndex === engagement.blockIndex &&
    sample.sideId === engagement.sideId &&
    sample.phase === engagement.phase &&
    sample.offeredLoadPerSecond === engagement.offeredLoad &&
    sample.observationStartedAtMs === engagement.observationStartedAtMs &&
    sample.observationEndedAtMs === engagement.observationEndedAtMs &&
    sample.observationDurationMs === engagement.observationDurationMs;
}

function windowEngagementMatches(
  engagement,
  sample,
  preregistration,
  evidenceClass,
) {
  return sample !== undefined &&
    engagementDigestIsValid(engagement, WINDOW_ENGAGEMENT_KEYS) &&
    identityMatches(engagement, preregistration) &&
    windowSampleMatches(sample, engagement) &&
    windowOperationLogIsValid(
      engagement,
      sample,
      preregistration,
      evidenceClass,
    );
}

function collectWindowEngagements(liveEvidence, preregistration, samples) {
  const byDigest = new MapConstructor();
  let logBytes = 0;
  for (let index = 0;
    index < liveEvidence.windowEngagements.length;
    index += 1) {
    const engagement = liveEvidence.windowEngagements[index];
    try {
      logBytes += textByteLength(
        engagement.operationLogText,
        'operationLogText',
      );
    } catch {
      return null;
    }
    const sample = mapGet(samples, engagement.capacitySampleDigest);
    if (
      !windowEngagementMatches(
        engagement,
        sample,
        preregistration,
        liveEvidence.evidenceClass,
      ) ||
      mapHas(byDigest, engagement.liveEngagementDigest) ||
      logBytes > BENCHMARK_CAPACITY_MAX_LIVE_LOG_BYTES
    ) return null;
    mapSet(byDigest, engagement.liveEngagementDigest, engagement);
  }
  return byDigest;
}

function windowReceiptsMatchEngagements(receipts, byDigest) {
  for (let index = 0; index < receipts.length; index += 1) {
    const receipt = receipts[index];
    const engagement = mapGet(byDigest, receipt.liveEngagementDigest);
    if (
      engagement === undefined ||
      engagement.capacitySampleDigest !== receipt.capacitySampleDigest ||
      engagement.startedAt !== receipt.startedAt ||
      engagement.endedAt !== receipt.endedAt ||
      engagement.liveEnvironmentContractDigest !==
        receipt.liveEnvironmentContractDigest
    ) return false;
    mapDelete(byDigest, receipt.liveEngagementDigest);
  }
  return reflectApply(mapSizeGetter, byDigest, []) === 0;
}

function windowEngagementsAreValid(liveEvidence, preregistration, report) {
  if (
    !isDenseDataArray(liveEvidence.windowEngagements) ||
    liveEvidence.windowEngagements.length !== report.windowReceipts.length
  ) return false;
  const samples = sampleResolver(report);
  if (samples === null) return false;
  const byDigest = collectWindowEngagements(
    liveEvidence,
    preregistration,
    samples,
  );
  if (byDigest === null) return false;
  return windowReceiptsMatchEngagements(report.windowReceipts, byDigest);
}

function resetEngagementMatches(engagement, preregistration, evidenceClass) {
  return engagementDigestIsValid(engagement, RESET_ENGAGEMENT_KEYS) &&
    identityMatches(engagement, preregistration) &&
    engagement.phase === BENCHMARK_CAPACITY_RESET_PHASE &&
    resetOperationLogIsValid(engagement, evidenceClass);
}

function collectResetEngagements(liveEvidence, preregistration) {
  const byDigest = new MapConstructor();
  let logBytes = 0;
  for (let index = 0;
    index < liveEvidence.resetEngagements.length;
    index += 1) {
    const engagement = liveEvidence.resetEngagements[index];
    try {
      logBytes += textByteLength(
        engagement.operationLogText,
        'operationLogText',
      );
    } catch {
      return null;
    }
    if (
      !resetEngagementMatches(
        engagement,
        preregistration,
        liveEvidence.evidenceClass,
      ) ||
      mapHas(byDigest, engagement.liveEngagementDigest) ||
      logBytes > BENCHMARK_CAPACITY_MAX_LIVE_LOG_BYTES
    ) return null;
    mapSet(byDigest, engagement.liveEngagementDigest, engagement);
  }
  return byDigest;
}

function resetReceiptsMatchEngagements(receipts, byDigest) {
  for (let index = 0; index < receipts.length; index += 1) {
    const receipt = receipts[index];
    const engagement = mapGet(byDigest, receipt.liveEngagementDigest);
    if (
      engagement === undefined ||
      engagement.startedAt !== receipt.startedAt ||
      engagement.endedAt !== receipt.endedAt ||
      engagement.liveEnvironmentContractDigest !==
        receipt.liveEnvironmentContractDigest
    ) return false;
    mapDelete(byDigest, receipt.liveEngagementDigest);
  }
  return reflectApply(mapSizeGetter, byDigest, []) === 0;
}

function resetEngagementsAreValid(liveEvidence, preregistration, report) {
  if (
    !isDenseDataArray(liveEvidence.resetEngagements) ||
    liveEvidence.resetEngagements.length !==
      report.cacheResetReceipts.length
  ) return false;
  const byDigest = collectResetEngagements(liveEvidence, preregistration);
  if (byDigest === null) return false;
  return resetReceiptsMatchEngagements(
    report.cacheResetReceipts,
    byDigest,
  );
}

function provenanceReceiptIsValid(receipt, preregistration, liveEvidence) {
  if (!hasExactOwnDataKeys(receipt, LIVE_PROVENANCE_RECEIPT_KEYS)) {
    return false;
  }
  try {
    const body = provenanceBody(receipt);
    const reconstructed =
      createBenchmarkCapacityLiveProvenanceReceipt({
        runId: receipt.runId,
        provider: receipt.provider,
        observedAt: receipt.observedAt,
        containerId: receipt.containerId,
        containerImageId: receipt.containerImageId,
        containerRunning: receipt.containerRunning,
        containerLabelsDigest: receipt.containerLabelsDigest,
        networkId: receipt.networkId,
        networkName: receipt.networkName,
        networkObservedId: receipt.networkObservedId,
        networkObservedName: receipt.networkObservedName,
      });
    return receipt.runId === preregistration.executionIdentity.runId &&
      receipt.containerImageId === liveEvidence.imageId &&
      digestBenchmarkSemanticData(body) ===
        receipt.provenanceReceiptDigest &&
      reconstructed.provenanceReceiptDigest ===
        receipt.provenanceReceiptDigest;
  } catch {
    return false;
  }
}

function cleanupReceiptIsValid(
  receipt,
  provenanceReceipt,
  preregistration,
  latestEndedAt,
) {
  if (!hasExactOwnDataKeys(receipt, CLEANUP_RECEIPT_KEYS)) return false;
  try {
    const reconstructed = createBenchmarkCapacityCleanupReceipt({
      runId: receipt.runId,
      liveEnvironmentContractDigest:
        receipt.liveEnvironmentContractDigest,
      provenanceReceiptDigest: receipt.provenanceReceiptDigest,
      provider: receipt.provider,
      containerId: receipt.containerId,
      containerLookup: receipt.containerLookup,
      networkId: receipt.networkId,
      networkName: receipt.networkName,
      networkLookup: receipt.networkLookup,
      containerAbsent: receipt.containerAbsent,
      networkAbsent: receipt.networkAbsent,
      completedAt: receipt.completedAt,
    });
    return receipt.runId === preregistration.executionIdentity.runId &&
      receipt.liveEnvironmentContractDigest ===
        preregistration.executionIdentity.liveEnvironmentContractDigest &&
      receipt.provenanceReceiptDigest ===
        provenanceReceipt.provenanceReceiptDigest &&
      receipt.provider === provenanceReceipt.provider &&
      receipt.containerId === provenanceReceipt.containerId &&
      receipt.networkId === provenanceReceipt.networkId &&
      receipt.networkName === provenanceReceipt.networkName &&
      receipt.completedAt >= latestEndedAt &&
      reconstructed.cleanupReceiptDigest === receipt.cleanupReceiptDigest;
  } catch {
    return false;
  }
}

function resolvedReceiptDigestsMatch(liveEvidence, observation) {
  const resolvedLive = observation.liveObservation;
  const resolvedCleanup = observation.cleanupObservation;
  const liveReceipt =
    createBenchmarkCapacityLiveProvenanceReceipt(resolvedLive);
  const cleanupReceipt =
    createBenchmarkCapacityCleanupReceipt(resolvedCleanup);
  return resolvedLive.runId === liveEvidence.runId &&
    resolvedLive.containerId === liveEvidence.provenanceReceipt.containerId &&
    resolvedLive.networkId === liveEvidence.provenanceReceipt.networkId &&
    resolvedLive.networkName === liveEvidence.provenanceReceipt.networkName &&
    resolvedCleanup.runId === liveEvidence.runId &&
    resolvedCleanup.containerId === liveEvidence.cleanupReceipt.containerId &&
    resolvedCleanup.networkId === liveEvidence.cleanupReceipt.networkId &&
    resolvedCleanup.networkName === liveEvidence.cleanupReceipt.networkName &&
    liveReceipt.provenanceReceiptDigest ===
      liveEvidence.provenanceReceipt.provenanceReceiptDigest &&
    cleanupReceipt.cleanupReceiptDigest ===
      liveEvidence.cleanupReceipt.cleanupReceiptDigest;
}

function windowRecordMatches(record, liveEvidence, engagement) {
  const request = record.request;
  return request.runId === liveEvidence.runId &&
    request.liveEngagementDigest === engagement.liveEngagementDigest &&
    request.capacitySampleDigest === engagement.capacitySampleDigest &&
    request.blockIndex === engagement.blockIndex &&
    request.blockedOrderIndex === engagement.blockedOrderIndex &&
    request.sideId === engagement.sideId &&
    request.phase === engagement.phase &&
    request.offeredLoad === engagement.offeredLoad &&
    record.text === engagement.operationLogText;
}

function resetRecordMatches(record, liveEvidence, engagement) {
  const request = record.request;
  return request.runId === liveEvidence.runId &&
    request.liveEngagementDigest === engagement.liveEngagementDigest &&
    request.blockIndex === engagement.blockIndex &&
    request.blockedOrderIndex === engagement.blockedOrderIndex &&
    request.sideId === engagement.sideId &&
    request.phase === engagement.phase &&
    request.offeredLoad === engagement.offeredLoad &&
    record.text === engagement.operationLogText;
}

function operationRecordsMatch(
  records,
  engagements,
  liveEvidence,
  matcher,
) {
  if (records.length !== engagements.length) return false;
  for (let index = 0;
    index < engagements.length;
    index += 1) {
    const engagement = engagements[index];
    let record;
    for (let recordIndex = 0;
      recordIndex < records.length;
      recordIndex += 1) {
      const candidate = records[recordIndex];
      if (
        candidate.request.liveEngagementDigest ===
        engagement.liveEngagementDigest
      ) {
        record = candidate;
        break;
      }
    }
    if (record === undefined ||
      !matcher(record, liveEvidence, engagement)) return false;
  }
  return true;
}

function trustedObservationsMatch(liveEvidence) {
  try {
    const observation = resolveBenchmarkCapacityLiveObservationPayload(
      liveEvidence.observationReceipt,
    );
    return resolvedReceiptDigestsMatch(liveEvidence, observation) &&
      observation.containerLogText ===
        liveEvidence.containerLogText &&
      operationRecordsMatch(
        observation.windowOperationLogs,
        liveEvidence.windowEngagements,
        liveEvidence,
        windowRecordMatches,
      ) &&
      operationRecordsMatch(
        observation.resetOperationLogs,
        liveEvidence.resetEngagements,
        liveEvidence,
        resetRecordMatches,
      );
  } catch {
    return false;
  }
}

function latestEngagementEnd(liveEvidence) {
  let latest = 0;
  const collections = [
    liveEvidence.windowEngagements,
    liveEvidence.resetEngagements,
  ];
  for (let collectionIndex = 0;
    collectionIndex < collections.length;
    collectionIndex += 1) {
    const collection = collections[collectionIndex];
    for (let index = 0; index < collection.length; index += 1) {
      if (collection[index].endedAt > latest) {
        latest = collection[index].endedAt;
      }
    }
  }
  return latest;
}

function liveLogBytesAreBounded(liveEvidence) {
  let total = textByteLength(
    liveEvidence.containerLogText,
    'containerLogText',
  );
  const collections = [
    liveEvidence.windowEngagements,
    liveEvidence.resetEngagements,
  ];
  for (let collectionIndex = 0;
    collectionIndex < collections.length;
    collectionIndex += 1) {
    const collection = collections[collectionIndex];
    for (let index = 0; index < collection.length; index += 1) {
      total += textByteLength(
        collection[index].operationLogText,
        'operationLogText',
      );
      if (total > BENCHMARK_CAPACITY_MAX_LIVE_LOG_BYTES) return false;
    }
  }
  return total <= BENCHMARK_CAPACITY_MAX_LIVE_LOG_BYTES;
}

function liveEvidenceExpectations(liveEvidence, terminal) {
  const externallyObserved = liveEvidence.evidenceClass ===
    BENCHMARK_CAPACITY_LIVE_EVIDENCE_CLASS.EXTERNALLY_OBSERVED;
  const synthetic = liveEvidence.evidenceClass ===
    BENCHMARK_CAPACITY_LIVE_EVIDENCE_CLASS.SYNTHETIC_FIXTURE;
  if (!externallyObserved && !synthetic) return null;
  const expectedEligibility = externallyObserved && terminal.valid;
  return {
    synthetic,
    expectedEligibility,
    expectedReason: synthetic ?
      'synthetic_fixture_not_claim_eligible' :
      (
        terminal.valid ?
          'terminal_measured_capacity_protocol' :
          `terminal_measurement_rejected:${terminal.reason}`
      ),
  };
}

function liveEvidenceIdentityIsValid(
  liveEvidence,
  preregistration,
  report,
  queueObserved,
) {
  return liveEvidence.version === LIVE_EVIDENCE_VERSION &&
    liveEvidence.preregistrationDigest === preregistration.manifestDigest &&
    liveEvidence.reportDigest === report.reportDigest &&
    identityMatches(liveEvidence, preregistration) &&
    liveEnvironmentContractIsValid(liveEvidence) &&
    liveEvidence.queueObserved === queueObserved;
}

function liveEvidenceEligibilityIsValid(liveEvidence, expectations) {
  return liveEvidence.engagementOnly === !expectations.expectedEligibility &&
    liveEvidence.comparativeClaimEligible ===
      expectations.expectedEligibility &&
    liveEvidence.reason === expectations.expectedReason;
}

function finalRowCountIsValid(liveEvidence) {
  return isNonNegativeSafeInteger(
    liveEvidence.observedRowsAfterFinalResetCell,
  ) &&
    typeof liveEvidence.finalRowCountQueryText === 'string' &&
    liveEvidence.finalRowCountQueryText.length <=
      BENCHMARK_CAPACITY_MAX_TEXT_CODE_UNITS &&
    regexpExec(
      /^(0|[1-9][0-9]*)$/u,
      liveEvidence.finalRowCountQueryText,
    ) !== null &&
    `${liveEvidence.observedRowsAfterFinalResetCell}` ===
      liveEvidence.finalRowCountQueryText;
}

function boundedLiveTextFieldsAreValid(liveEvidence) {
  const textFields = [
    'reason',
    'image',
    'imageId',
    'postgresVersion',
    'finalRowCountQueryText',
  ];
  for (let index = 0; index < textFields.length; index += 1) {
    try {
      assertBoundedText(liveEvidence[textFields[index]], textFields[index]);
    } catch {
      return false;
    }
  }
  return true;
}

function liveEvidenceCollectionsAreValid(
  liveEvidence,
  preregistration,
  report,
) {
  return liveLogBytesAreBounded(liveEvidence) &&
    windowEngagementsAreValid(liveEvidence, preregistration, report) &&
    resetEngagementsAreValid(liveEvidence, preregistration, report);
}

function externalLiveEvidenceIsValid(
  liveEvidence,
  preregistration,
) {
  return provenanceReceiptIsValid(
    liveEvidence.provenanceReceipt,
    preregistration,
    liveEvidence,
  ) &&
    cleanupReceiptIsValid(
      liveEvidence.cleanupReceipt,
      liveEvidence.provenanceReceipt,
      preregistration,
      latestEngagementEnd(liveEvidence),
    ) &&
    trustedObservationsMatch(liveEvidence);
}

function recordsInArrayAreExact(records, keys) {
  if (!isExactArray(records)) return false;
  for (let index = 0; index < records.length; index += 1) {
    if (!isExactRecord(records[index], keys)) return false;
  }
  return true;
}

function liveEvidenceShapeIsSafe(liveEvidence) {
  if (!isExactRecord(liveEvidence, LIVE_EVIDENCE_KEYS)) return false;
  const provenance = liveEvidence.provenanceReceipt;
  const cleanup = liveEvidence.cleanupReceipt;
  const observation = liveEvidence.observationReceipt;
  return isExactRecord(
    liveEvidence.liveEnvironmentContract,
    LIVE_ENVIRONMENT_CONTRACT_KEYS,
  ) &&
    (
      provenance === null ||
      isExactRecord(provenance, LIVE_PROVENANCE_RECEIPT_KEYS)
    ) &&
    (
      cleanup === null ||
      isExactRecord(cleanup, CLEANUP_RECEIPT_KEYS)
    ) &&
    (
      observation === null ||
      isExactRecord(observation, OBSERVATION_RECEIPT_KEYS)
    ) &&
    recordsInArrayAreExact(
      liveEvidence.windowEngagements,
      WINDOW_ENGAGEMENT_KEYS,
    ) &&
    recordsInArrayAreExact(
      liveEvidence.resetEngagements,
      RESET_ENGAGEMENT_KEYS,
    );
}

function liveEvidenceIsValid(
  liveEvidence,
  preregistration,
  report,
) {
  if (!liveEvidenceShapeIsSafe(liveEvidence)) return false;
  const terminal = inspectBenchmarkCapacityTerminalMeasurement(
    report,
    preregistration,
  );
  const queueObserved = arraySome(report.rawSamples, (sample) =>
    arraySome(sample.clientQueueDelayMs, (delayMs) => delayMs > 0));
  const expectations = liveEvidenceExpectations(liveEvidence, terminal);
  if (
    expectations === null ||
    !liveEvidenceIdentityIsValid(
      liveEvidence,
      preregistration,
      report,
      queueObserved,
    ) ||
    !liveEvidenceEligibilityIsValid(liveEvidence, expectations) ||
    !finalRowCountIsValid(liveEvidence) ||
    !boundedLiveTextFieldsAreValid(liveEvidence)
  ) return false;
  try {
    if (!liveEvidenceCollectionsAreValid(
      liveEvidence,
      preregistration,
      report,
    )) return false;
    if (expectations.synthetic) {
      return liveEvidence.provenanceReceipt === null &&
        liveEvidence.cleanupReceipt === null &&
        liveEvidence.observationReceipt === null;
    }
    return externalLiveEvidenceIsValid(
      liveEvidence,
      preregistration,
    );
  } catch {
    return false;
  }
}

function validateInputs(options) {
  if (
    !isExactRecord(options, OPTION_KEYS) ||
    !inspectBenchmarkCapacityPreregistration(options.preregistration).valid ||
    !inspectBenchmarkCapacityProtocolReport(
      options.report,
      options.preregistration,
    ).valid ||
    !liveEvidenceIsValid(
      options.liveEvidence,
      options.preregistration,
      options.report,
    )
  ) {
    fail('inputs:exact_live_authority_bound_records_required');
  }
}

function artifactBody(artifact) {
  return {
    version: artifact.version,
    preregistration: artifact.preregistration,
    report: artifact.report,
    liveEvidence: artifact.liveEvidence,
  };
}

function createArtifactPayload(options) {
  const body = {
    version: ARTIFACT_VERSION,
    preregistration: options.preregistration,
    report: options.report,
    liveEvidence: options.liveEvidence,
  };
  if (
    bufferByteLength(jsonStringify(body), 'utf8') >
    BENCHMARK_CAPACITY_MAX_ARTIFACT_BYTES
  ) {
    fail('artifact_body_bytes:bound_exceeded');
  }
  const artifact = {
    ...body,
    artifactSemanticDigest: digestBenchmarkSemanticData(body),
  };
  const bytes = bufferFrom(jsonStringify(artifact, null, 2), 'utf8');
  if (
    bytes.byteLength === 0 ||
    bytes.byteLength > BENCHMARK_CAPACITY_MAX_ARTIFACT_BYTES
  ) {
    fail('artifact_bytes:bound_exceeded');
  }
  return {artifact, bytes};
}

async function ensureArtifactParentPath(artifactPath) {
  const parentPath = dirname(artifactPath);
  const parentInspection =
    await inspectBenchmarkCapacityArtifactPathParents(parentPath);
  if (!parentInspection.valid) {
    fail(`artifact_path_parents:${parentInspection.reason}`);
  }
  await mkdir(parentPath, {recursive: true});
  const createdParentInspection =
    await inspectBenchmarkCapacityArtifactPath(parentPath);
  if (!createdParentInspection.valid) {
    fail(`artifact_path_parents:${createdParentInspection.reason}`);
  }
}

async function writeOrVerifyArtifactBytes(
  artifactPath,
  bytes,
  artifactByteDigest,
) {
  try {
    await writeFile(artifactPath, bytes, {flag: 'wx'});
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    const existingStat = await lstat(artifactPath);
    if (
      !statsIsFile(existingStat) ||
      existingStat.size !== bytes.byteLength ||
      existingStat.size > BENCHMARK_CAPACITY_MAX_ARTIFACT_BYTES
    ) throw error;
    const existing = await readFile(artifactPath);
    if (byteDigest(existing) !== artifactByteDigest) throw error;
  }
}

async function assertWrittenArtifactPath(artifactPath) {
  const pathInspection =
    await inspectBenchmarkCapacityArtifactPath(artifactPath);
  if (!pathInspection.valid) {
    fail(`artifact_path:${pathInspection.reason}`);
  }
}

async function writeValidatedBenchmarkCapacityRawArtifact(options) {
  const {artifact, bytes} = createArtifactPayload(options);
  const artifactByteDigest = byteDigest(bytes);
  const artifactPath = canonicalArtifactPath(artifactByteDigest);
  await ensureArtifactParentPath(artifactPath);
  await writeOrVerifyArtifactBytes(artifactPath, bytes, artifactByteDigest);
  await assertWrittenArtifactPath(artifactPath);
  return {
    version: RECEIPT_VERSION,
    artifactPath,
    artifactByteLength: bytes.byteLength,
    artifactByteDigest,
    artifactSemanticDigest: artifact.artifactSemanticDigest,
    preregistrationDigest: options.preregistration.manifestDigest,
    reportDigest: options.report.reportDigest,
  };
}

export async function writeBenchmarkCapacityRawArtifact(options) {
  validateInputs(options);
  if (
    options.liveEvidence.evidenceClass !==
      BENCHMARK_CAPACITY_LIVE_EVIDENCE_CLASS.SYNTHETIC_FIXTURE
  ) {
    fail('external_live_artifact_authorization_required');
  }
  return writeValidatedBenchmarkCapacityRawArtifact(options);
}

export async function writeExternallyObservedBenchmarkCapacityRawArtifact(
  options,
  authorization,
) {
  validateInputs(options);
  if (
    options.liveEvidence.evidenceClass !==
      BENCHMARK_CAPACITY_LIVE_EVIDENCE_CLASS.EXTERNALLY_OBSERVED
  ) {
    fail('externally_observed_live_evidence_required');
  }
  consumeBenchmarkCapacityLiveArtifactAuthorization(
    authorization,
    options.liveEvidence.observationReceipt,
  );
  return writeValidatedBenchmarkCapacityRawArtifact(options);
}

function replayedArtifactIsValid(
  artifact,
  receipt,
) {
  if (!hasExactOwnDataKeys(artifact, ARTIFACT_KEYS)) return false;
  const body = artifactBody(artifact);
  return artifact.version === ARTIFACT_VERSION &&
    artifact.artifactSemanticDigest === receipt.artifactSemanticDigest &&
    digestBenchmarkSemanticData(body) === receipt.artifactSemanticDigest &&
    artifact.preregistration.manifestDigest ===
      receipt.preregistrationDigest &&
    artifact.report.reportDigest === receipt.reportDigest &&
    inspectBenchmarkCapacityPreregistration(
      artifact.preregistration,
    ).valid &&
    inspectBenchmarkCapacityProtocolReport(
      artifact.report,
      artifact.preregistration,
    ).valid &&
    liveEvidenceIsValid(
      artifact.liveEvidence,
      artifact.preregistration,
      artifact.report,
    );
}

async function readReplayArtifact(expectedPath, receipt) {
  const pathInspection =
    await inspectBenchmarkCapacityArtifactPath(expectedPath);
  if (!pathInspection.valid) {
    return {valid: false, reason: pathInspection.reason};
  }
  const artifactStat = await lstat(expectedPath);
  if (
    !statsIsFile(artifactStat) ||
    artifactStat.size !== receipt.artifactByteLength ||
    artifactStat.size === 0 ||
    artifactStat.size > BENCHMARK_CAPACITY_MAX_ARTIFACT_BYTES
  ) {
    return {valid: false, reason: 'artifact_size_invalid'};
  }
  const bytes = await readFile(expectedPath);
  if (byteDigest(bytes) !== receipt.artifactByteDigest) {
    return {valid: false, reason: 'artifact_byte_digest_mismatch'};
  }
  return {
    valid: true,
    artifact: parseBenchmarkSemanticJson(
      bufferToString(bytes, 'utf8'),
    ),
  };
}

export async function replayBenchmarkCapacityRawArtifact(
  receipt,
) {
  if (!receiptShapeIsValid(receipt)) {
    return {valid: false, reason: 'artifact_receipt_invalid'};
  }
  const expectedPath = canonicalArtifactPath(receipt.artifactByteDigest);
  if (receipt.artifactPath !== expectedPath) {
    return {valid: false, reason: 'artifact_path_not_canonical'};
  }
  try {
    const readResult = await readReplayArtifact(expectedPath, receipt);
    if (!readResult.valid) return readResult;
    const artifact = readResult.artifact;
    const valid = replayedArtifactIsValid(
      artifact,
      receipt,
    );
    return {
      valid,
      reason: valid ? 'valid' : 'artifact_semantic_mismatch',
      artifact: valid ? artifact : null,
    };
  } catch {
    return {valid: false, reason: 'artifact_read_failed'};
  }
}
