import {
  analyzeFormationReleaseEvents,
  classifyFormationReleaseEvidencePayload,
  projectFormationReleaseEvidenceJournalEntries,
} from './formation-release-handoff-gcp-analysis.js';

const arrayPrototypeIndexOf = Function.call.bind(Array.prototype.indexOf);
const arrayPrototypeSlice = Function.call.bind(Array.prototype.slice);
const arrayIsArray = Array.isArray;
const bufferByteLength = Buffer.byteLength;
const dateNow = Date.now;
const numberIsFinite = Number.isFinite;
const numberIsSafeInteger = Number.isSafeInteger;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectHasOwn = Object.hasOwn;

const DEFAULT_MAX_ENTRIES = 512;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const OBSERVATION_TIMEOUT_MS = 60_000;
const OBSERVATION_INTERVAL_MS = 200;
const OBSERVATION_LABEL = 'formation release handoff closure';
const CLASSIFICATION = objectFreeze({
  IGNORE: 'ignore',
  INVALID: 'invalid',
  RETAIN: 'retain',
});
const JOURNAL_FAILURE = objectFreeze({
  NONE: 'none',
});
const ERROR = objectFreeze({
  CAPACITY: 'formation evidence journal capacity exceeded',
  INVALID_ENTRY: 'formation evidence journal received an invalid entry',
  MALFORMED: 'malformed formation evidence',
  NODE_MISMATCH: 'formation evidence node identity mismatch',
  OBSERVATION_INVALID: 'formation closure evidence journal invalid',
  OBSERVATION_OWNER: 'cluster closure observation owner unavailable',
});
const FIELD = objectFreeze({
  BARRIER_CONSUMER_NODE_IDS: 'barrierConsumerNodeIds',
  BOOT_INCARNATION: 'bootIncarnation',
  CANONICAL_GENERATION: 'canonicalGeneration',
  CAPTURED_AT: 'capturedAt',
  CLOSURE_PASSED: 'closurePassed',
  COMPLETED_AT: 'completedAt',
  COMPLETION_MS: 'completionMs',
  DURABLE_ACKNOWLEDGED_AT: 'durableAcknowledgedAt',
  ELAPSED_MS: 'elapsedMs',
  MESSAGE: 'message',
  NODE_ID: 'nodeId',
  PROJECTION_SYNCHRONIZED_AT: 'projectionSynchronizedAt',
  REOPENED_AT: 'reopenedAt',
  REQUIRED_COHORT: 'requiredCohort',
  SATISFIED: 'satisfied',
  VALUE: 'value',
});

function readOwnData(target, field) {
  if (!target || typeof target !== 'object' || !objectHasOwn(target, field)) {
    return undefined;
  }
  const descriptor = objectGetOwnPropertyDescriptor(target, field);
  return descriptor && objectHasOwn(descriptor, FIELD.VALUE) ?
    descriptor.value : undefined;
}

function positiveLimit(value, fallback) {
  return numberIsSafeInteger(value) && value > 0 ? value : fallback;
}

function errorMessage(error) {
  if (error && typeof error === 'object' && objectHasOwn(error, FIELD.MESSAGE)) {
    const descriptor = objectGetOwnPropertyDescriptor(error, FIELD.MESSAGE);
    if (descriptor && objectHasOwn(descriptor, FIELD.VALUE) &&
      typeof descriptor.value === 'string') {
      return descriptor.value;
    }
  }
  return typeof error === 'string' ? error : ERROR.INVALID_ENTRY;
}

function createFormationReleaseEvidenceJournal(options = {}) {
  const requestedMaxEntries = objectHasOwn(options, 'maxEntries') ?
    objectGetOwnPropertyDescriptor(options, 'maxEntries')?.value : undefined;
  const requestedMaxBytes = objectHasOwn(options, 'maxBytes') ?
    objectGetOwnPropertyDescriptor(options, 'maxBytes')?.value : undefined;
  const maxEntries = positiveLimit(requestedMaxEntries, DEFAULT_MAX_ENTRIES);
  const maxBytes = positiveLimit(requestedMaxBytes, DEFAULT_MAX_BYTES);
  const entries = [];
  const observedNodeIds = [];
  let byteSize = 0;
  let overflowed = false;
  let failure = JOURNAL_FAILURE.NONE;

  const fail = (error) => {
    if (failure === JOURNAL_FAILURE.NONE) failure = errorMessage(error);
    return false;
  };

  const accept = (entry) => {
    if (failure !== JOURNAL_FAILURE.NONE) return false;
    const classification = classifyFormationReleaseEvidencePayload(entry);
    const classificationKind = objectHasOwn(classification, 'kind') ?
      objectGetOwnPropertyDescriptor(classification, 'kind')?.value : null;
    if (classificationKind === CLASSIFICATION.IGNORE) return true;
    if (classificationKind === CLASSIFICATION.INVALID) {
      const reason = objectHasOwn(classification, 'reason') ?
        objectGetOwnPropertyDescriptor(classification, 'reason')?.value : null;
      return fail(reason || ERROR.MALFORMED);
    }
    const payload = objectGetOwnPropertyDescriptor(entry, 'payload')?.value;
    const nodeId = objectGetOwnPropertyDescriptor(entry, 'nodeId')?.value;
    const payloadBytes = bufferByteLength(payload, 'utf8');
    if (
      entries.length >= maxEntries ||
      byteSize + payloadBytes > maxBytes
    ) {
      overflowed = true;
      return fail(ERROR.CAPACITY);
    }
    entries[entries.length] = objectFreeze({nodeId, payload});
    byteSize += payloadBytes;
    if (arrayPrototypeIndexOf(observedNodeIds, nodeId) === -1) {
      observedNodeIds[observedNodeIds.length] = nodeId;
    }
    return true;
  };

  const snapshot = () => objectFreeze({
    healthy: failure === JOURNAL_FAILURE.NONE,
    overflowed,
    failure: failure === JOURNAL_FAILURE.NONE ? false : failure,
    entryCount: entries.length,
    byteSize,
    maxEntries,
    maxBytes,
    entries: objectFreeze(arrayPrototypeSlice(entries)),
    observedNodeIds: objectFreeze(arrayPrototypeSlice(observedNodeIds)),
  });

  return objectFreeze({accept, fail, snapshot});
}

async function observeFormationReleaseClosure(
  cluster,
  sourceFingerprint,
  evidenceJournal,
  now = dateNow,
) {
  const snapshotJournal = readOwnData(evidenceJournal, 'snapshot');
  if (
    typeof cluster?.waitForState !== 'function' ||
    typeof snapshotJournal !== 'function'
  ) throw new Error(ERROR.OBSERVATION_OWNER);
  const startedAt = now();
  const analyzeJournal = () => {
    const snapshot = snapshotJournal();
    const entries = readOwnData(snapshot, 'entries');
    const failure = readOwnData(snapshot, 'failure');
    if (readOwnData(snapshot, 'healthy') !== true || !arrayIsArray(entries)) {
      const reason = typeof failure === 'string' ? `: ${failure}` : '';
      throw new Error(ERROR.OBSERVATION_INVALID + reason);
    }
    const projection = projectFormationReleaseEvidenceJournalEntries(entries);
    if (projection.invalidEntryCount !== 0) {
      throw new Error(ERROR.OBSERVATION_INVALID +
        ': journal projection rejected an entry');
    }
    const analysis = analyzeFormationReleaseEvents(
      projection.events,
      sourceFingerprint,
    );
    return analysis.closurePassed ? {
      ...analysis,
      evidenceJournal: {
        byteSize: readOwnData(snapshot, 'byteSize'),
        entryCount: readOwnData(snapshot, 'entryCount'),
        observedNodeIds: readOwnData(snapshot, 'observedNodeIds'),
      },
    } : false;
  };
  const replay = analyzeJournal();
  const replayElapsedMs = now() - startedAt;
  if (!numberIsFinite(replayElapsedMs) || replayElapsedMs < 0) {
    return {
      satisfied: false,
      elapsedMs: OBSERVATION_TIMEOUT_MS,
      polls: 0,
      value: false,
    };
  }
  const remainingMs = OBSERVATION_TIMEOUT_MS - replayElapsedMs;
  if (remainingMs < 0) {
    return {satisfied: false, elapsedMs: replayElapsedMs, polls: 0, value: false};
  }
  if (replay || remainingMs === 0) {
    return {
      satisfied: replay !== false,
      elapsedMs: replayElapsedMs,
      polls: 1,
      value: replay || false,
    };
  }
  const tail = await cluster.waitForState(analyzeJournal, {
    timeoutMs: remainingMs,
    intervalMs: OBSERVATION_INTERVAL_MS,
    throwOnTimeout: false,
    label: OBSERVATION_LABEL,
  });
  const measuredElapsedMs = now() - startedAt;
  const tailElapsedMs = readOwnData(tail, FIELD.ELAPSED_MS);
  if (!numberIsFinite(measuredElapsedMs) || measuredElapsedMs < replayElapsedMs ||
    !numberIsFinite(tailElapsedMs) || tailElapsedMs < 0) {
    return {
      ...tail,
      satisfied: false,
      elapsedMs: OBSERVATION_TIMEOUT_MS,
      value: false,
    };
  }
  const minimumElapsedMs = replayElapsedMs + tailElapsedMs;
  const elapsedMs = measuredElapsedMs >= minimumElapsedMs ?
    measuredElapsedMs : minimumElapsedMs;
  const satisfied = readOwnData(tail, FIELD.SATISFIED) === true &&
    elapsedMs <= OBSERVATION_TIMEOUT_MS;
  return {
    ...tail,
    satisfied,
    elapsedMs,
    value: satisfied ? readOwnData(tail, FIELD.VALUE) : false,
  };
}

function exactStringListsMatch(left, right) {
  if (!arrayIsArray(left) || !arrayIsArray(right) ||
    left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (!objectHasOwn(left, index) || !objectHasOwn(right, index) ||
      readOwnData(left, index) !== readOwnData(right, index)) return false;
  }
  return true;
}

function exactCohortsMatch(left, right) {
  if (!arrayIsArray(left) || !arrayIsArray(right) ||
    left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (!objectHasOwn(left, index) || !objectHasOwn(right, index)) return false;
    const leftMember = readOwnData(left, index);
    const rightMember = readOwnData(right, index);
    if (readOwnData(leftMember, FIELD.NODE_ID) !==
        readOwnData(rightMember, FIELD.NODE_ID) ||
      readOwnData(leftMember, FIELD.BOOT_INCARNATION) !==
        readOwnData(rightMember, FIELD.BOOT_INCARNATION)) return false;
  }
  return true;
}

function liveObservationMatchesFinalAnalysis(cluster, analysis) {
  const live = readOwnData(
    readOwnData(cluster, 'closureObservation'),
    FIELD.VALUE,
  );
  if (readOwnData(live, FIELD.CLOSURE_PASSED) !== true ||
    readOwnData(analysis, FIELD.CLOSURE_PASSED) !== true) return false;
  return readOwnData(live, FIELD.CANONICAL_GENERATION) ===
      readOwnData(analysis, FIELD.CANONICAL_GENERATION) &&
    exactCohortsMatch(
      readOwnData(live, FIELD.REQUIRED_COHORT),
      readOwnData(analysis, FIELD.REQUIRED_COHORT),
    ) && exactStringListsMatch(
    readOwnData(live, FIELD.BARRIER_CONSUMER_NODE_IDS),
    readOwnData(analysis, FIELD.BARRIER_CONSUMER_NODE_IDS),
  ) && readOwnData(live, FIELD.CAPTURED_AT) ===
      readOwnData(analysis, FIELD.CAPTURED_AT) &&
    readOwnData(live, FIELD.DURABLE_ACKNOWLEDGED_AT) ===
      readOwnData(analysis, FIELD.DURABLE_ACKNOWLEDGED_AT) &&
    readOwnData(live, FIELD.PROJECTION_SYNCHRONIZED_AT) ===
      readOwnData(analysis, FIELD.PROJECTION_SYNCHRONIZED_AT) &&
    readOwnData(live, FIELD.REOPENED_AT) ===
      readOwnData(analysis, FIELD.REOPENED_AT) &&
    readOwnData(live, FIELD.COMPLETED_AT) ===
      readOwnData(analysis, FIELD.COMPLETED_AT) &&
    readOwnData(live, FIELD.COMPLETION_MS) ===
      readOwnData(analysis, FIELD.COMPLETION_MS);
}

export {
  createFormationReleaseEvidenceJournal,
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_ENTRIES,
  liveObservationMatchesFinalAnalysis,
  observeFormationReleaseClosure,
};
