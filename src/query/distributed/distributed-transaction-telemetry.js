/**
 * The coordinator section of the transaction-path telemetry (quest
 * transaction-path-telemetry-export): session-lane operations (B2, B4),
 * terminal sub-phases, statement counts, participant retry backoff and
 * metadata persistence by purpose (B8), kept on the coordinator with a
 * most-recent ring of completed transactions.
 *
 * Telemetry is a hint: nothing that decides reads it. Every recording is an
 * imported function that takes the coordinator and the transaction (or its
 * ID) and records through the transaction's telemetry handle. Every
 * transaction the coordinator holds has one: a sampled handle from its BEGIN,
 * or, for a transaction restored from rows, a handle without a sample that
 * its first observation creates (reason RECOVERED_FROM_ROWS). Node-level
 * observations therefore cover every held transaction; an object no
 * coordinator created or restored has no handle and records nothing.
 * Observation points are synchronous clock reads and increments at existing
 * boundaries. Every metadata submission names its purpose at the site that
 * makes it, or that site hands the purpose to the transaction right before
 * the workflow coordinator writes it; nothing infers a purpose afterwards.
 */
import {
  TRANSACTION_METADATA_PERSIST_PURPOSE,
  TRANSACTION_OPERATION_KIND,
  TRANSACTION_SUB_PHASE,
  TRANSACTION_TELEMETRY_AVAILABILITY,
  TRANSACTION_TELEMETRY_OBSERVATION,
  TRANSACTION_TELEMETRY_SECTION,
  TRANSACTION_WITHOUT_SAMPLE_REASON,
  createTelemetryObservations,
  snapshotTelemetryObservations,
} from '../../diagnostics/transaction-telemetry-collection.js';
import {
  appendTelemetryRing,
  createTelemetryRing,
  readTelemetryClockMs,
  readTelemetryRingSince,
  recordTelemetryHistogram,
  retainedTelemetryRingValues,
  takeTelemetryEpoch,
} from '../../diagnostics/telemetry-histogram.js';

// The most recent completed transactions: at least twice the busiest
// completion rate expected between two polls (50 tx/s for 5 s). Retained
// when full (measured 2026-11-28): about 6.0 MB of new_order-like samples
// (47 operations), 7.6 MB at 64 operations; with the executor's full request
// ring about 9.5 MB and 11 MB.
const SAMPLE_RING_CAPACITY = 512;
// Transactions completed without a sample (restored from rows): rare; about
// 0.1 MB when full.
const WITHOUT_SAMPLE_RING_CAPACITY = 128;
// new_order runs about 45 statements; operations beyond the bound are
// counted, and their time is reported as unattributed.
const MAX_OPERATIONS_PER_SAMPLE = 64;
const UNSET_MS = -1;
const CLOCK_READ = 1;
const STEP_OBSERVATIONS = 2;
const OUTCOME_ACTIVE = 'ACTIVE';
const NAME = TRANSACTION_TELEMETRY_OBSERVATION;
const KIND = TRANSACTION_OPERATION_KIND;
const PURPOSE = TRANSACTION_METADATA_PERSIST_PURPOSE;
const PURPOSES = Object.freeze(Object.values(PURPOSE));
const WITHOUT_SAMPLE_REASONS = Object.freeze(Object.values(TRANSACTION_WITHOUT_SAMPLE_REASON));
const SAMPLE_OPERATION_KINDS = new Set([KIND.BEGIN, KIND.WRITE, KIND.READ, KIND.COMMIT,
  KIND.ROLLBACK]);
const TERMINAL_UNATTRIBUTED = Object.freeze({
  [KIND.COMMIT]: NAME.COMMIT_UNATTRIBUTED,
  [KIND.ROLLBACK]: NAME.ROLLBACK_UNATTRIBUTED,
});
const TERMINAL_SUB_PHASE = Object.freeze({
  [KIND.COMMIT]: NAME.COMMIT_SUB_PHASE,
  [KIND.ROLLBACK]: NAME.ROLLBACK_SUB_PHASE,
});
const STATEMENT_COUNTER = Object.freeze({
  [KIND.WRITE]: Object.freeze({count: 'writeStatementCount', ms: 'writeStatementsMs'}),
  [KIND.READ]: Object.freeze({count: 'readStatementCount', ms: 'readStatementsMs'}),
});

function observationsByLabel(observations, name, labels) {
  const byLabel = {};
  for (const label of labels) {
    byLabel[label] = observations[`${name}.${label}`];
  }
  return byLabel;
}

// A phase the catalogue does not name for an operation kind has no
// histogram; its time stays in that operation's unattributed remainder.
function subPhaseHistogramsOf(observations) {
  const byKind = {};
  for (const [kind, name] of Object.entries(TERMINAL_SUB_PHASE)) {
    byKind[kind] = {};
    for (const phase of Object.values(TRANSACTION_SUB_PHASE)) {
      const histogram = observations[`${name}.${phase}`];
      if (histogram !== undefined) byKind[kind][phase] = histogram;
    }
  }
  return byKind;
}

/**
 * The coordinator's telemetry section: its observations, the sample ring,
 * the ring of transactions completed without a sample and the operation each
 * session lane is running.
 * @return {Object}
 */
function createCoordinatorTelemetryStore() {
  const observations = createTelemetryObservations(TRANSACTION_TELEMETRY_SECTION.COORDINATOR);
  const kinds = Object.values(KIND);
  return {
    telemetryEpoch: takeTelemetryEpoch(),
    observationCount: 0,
    observations,
    fifoWaitByKind: observationsByLabel(observations, NAME.FIFO_WAIT, kinds),
    runByKind: observationsByLabel(observations, NAME.RUN, kinds),
    subPhaseByKind: subPhaseHistogramsOf(observations),
    unattributedByKind: {
      [KIND.COMMIT]: observations[NAME.COMMIT_UNATTRIBUTED],
      [KIND.ROLLBACK]: observations[NAME.ROLLBACK_UNATTRIBUTED],
    },
    persistByPurpose: observationsByLabel(observations, NAME.METADATA_PERSIST, PURPOSES),
    completedWithoutSampleByReason: observationsByLabel(observations,
      NAME.COMPLETED_WITHOUT_SAMPLE, WITHOUT_SAMPLE_REASONS),
    samples: createTelemetryRing(SAMPLE_RING_CAPACITY),
    withoutSample: createTelemetryRing(WITHOUT_SAMPLE_RING_CAPACITY),
    runningOperationBySession: new Map(),
  };
}

function createPurposeCounts() {
  const counts = {};
  for (const purpose of PURPOSES) counts[purpose] = 0;
  return counts;
}

// The fields every handle carries; a sampled handle adds its operations.
function createHandle(tx, startedAtMs, purposes) {
  return {
    transactionId: tx.transactionId,
    sessionId: tx.sessionId,
    transactionEpoch: tx.transactionEpoch,
    startedAtMs,
    finalizedAtMs: UNSET_MS,
    observationCount: CLOCK_READ,
    completionSequence: 0,
    outcome: OUTCOME_ACTIVE,
    submissionCountByPurpose: createPurposeCounts(),
    persistMsByPurpose: createPurposeCounts(),
    readbackCount: 0,
    skippedParticipantSetMutationCount: 0,
    statusWritePurpose: purposes.status,
    participantWritePurpose: purposes.participant,
  };
}

function attachOperation(telemetry, operation) {
  operation.telemetry = telemetry;
  const room = Object.hasOwn(TERMINAL_UNATTRIBUTED, operation.kind) ?
    MAX_OPERATIONS_PER_SAMPLE : MAX_OPERATIONS_PER_SAMPLE - 1;
  if (telemetry.operations.length < room) {
    telemetry.operations.push(operation);
  } else {
    telemetry.operationsOmittedCount += 1;
  }
}

// The wait behind an earlier operation of the same transaction is that
// operation's run time, so a sample counts a FIFO wait only from the later of
// the call and the transaction's previous operation's end.
function placeOperation(telemetry, operation) {
  const previousEndMs = telemetry.lastOperationEndedAtMs;
  operation.fifoWaitMs = operation.startedAtMs - Math.max(operation.queuedAtMs, previousEndMs);
  operation.betweenMs = Math.max(0, operation.queuedAtMs - previousEndMs);
  attachOperation(telemetry, operation);
  telemetry.observationCount += CLOCK_READ + STEP_OBSERVATIONS;
}

/**
 * Stamp a session-lane operation at its call (B2).
 * @param {Object} coordinator
 * @param {string} kind - A TRANSACTION_OPERATION_KIND.
 * @return {Object} The operation record.
 */
function queueTransactionOperation(coordinator, kind) {
  coordinator.transactionTelemetry.observationCount += CLOCK_READ;
  // timings: the measured sub-phases of a terminal operation, in run order.
  return {kind, queuedAtMs: readTelemetryClockMs(), startedAtMs: UNSET_MS,
    endedAtMs: UNSET_MS, fifoWaitMs: 0, betweenMs: 0, telemetry: null, timings: []};
}

function isOpenSample(telemetry) {
  return telemetry?.sampled === true && telemetry.completionSequence === 0;
}

/**
 * Stamp the operation when the lane starts it, inside the existing
 * continuation, and place it in its session's open sampled transaction.
 * @param {Object} coordinator
 * @param {string} sessionId
 * @param {Object} operation - From queueTransactionOperation.
 */
function startTransactionOperation(coordinator, sessionId, operation) {
  const store = coordinator.transactionTelemetry;
  operation.startedAtMs = readTelemetryClockMs();
  recordTelemetryHistogram(store.fifoWaitByKind[operation.kind],
    operation.startedAtMs - operation.queuedAtMs);
  store.observationCount += STEP_OBSERVATIONS;
  store.runningOperationBySession.set(sessionId, operation);
  const telemetry = SAMPLE_OPERATION_KINDS.has(operation.kind) ?
    coordinator.transactionsBySession.get(sessionId)?.telemetry : null;
  if (isOpenSample(telemetry)) placeOperation(telemetry, operation);
}

function timedSubPhasesMs(operation) {
  let total = 0;
  for (const timing of operation.timings) total += timing.ms;
  return total;
}

// A statement operation ends in its sample once: at its settle, or at the
// finalize when the statement itself ended the transaction.
function closeStatementOperation(telemetry, operation) {
  telemetry.lastOperationEndedAtMs = operation.endedAtMs;
  const counter = STATEMENT_COUNTER[operation.kind];
  if (counter === undefined) return;
  telemetry[counter.count] += 1;
  telemetry[counter.ms] += operation.endedAtMs - operation.startedAtMs;
}

/**
 * Stamp the operation when it settles, in the lane's existing settle
 * continuation (B4).
 * @param {Object} coordinator
 * @param {string} sessionId
 * @param {Object} operation
 */
function settleTransactionOperation(coordinator, sessionId, operation) {
  const store = coordinator.transactionTelemetry;
  const settledAtMs = readTelemetryClockMs();
  recordTelemetryHistogram(store.runByKind[operation.kind], settledAtMs - operation.startedAtMs);
  store.observationCount += STEP_OBSERVATIONS;
  if (operation.endedAtMs === UNSET_MS) operation.endedAtMs = settledAtMs;
  const unattributed = store.unattributedByKind[operation.kind];
  if (unattributed !== undefined) {
    recordTelemetryHistogram(unattributed,
      operation.endedAtMs - operation.startedAtMs - timedSubPhasesMs(operation));
    store.observationCount += 1;
  }
  if (isOpenSample(operation.telemetry)) closeStatementOperation(operation.telemetry, operation);
  if (store.runningOperationBySession.get(sessionId) === operation) {
    store.runningOperationBySession.delete(sessionId);
  }
}

// BEGIN runs before its transaction exists: the transaction starts at the
// BEGIN call, so BEGIN's FIFO wait is part of the transaction's total.
function adoptBeginOperation(coordinator, sessionId, telemetry) {
  const running = coordinator.transactionTelemetry.runningOperationBySession.get(sessionId);
  if (running?.kind !== KIND.BEGIN || running.telemetry !== null) {
    return;
  }
  telemetry.startedAtMs = running.queuedAtMs;
  telemetry.lastOperationEndedAtMs = running.queuedAtMs;
  placeOperation(telemetry, running);
}

/**
 * The sampled handle of one transaction, created with its registration; the
 * registration insert is its first metadata submission.
 * @param {Object} coordinator
 * @param {string} transactionId
 * @param {string} sessionId
 * @param {number} transactionEpoch
 * @return {Object}
 */
function createTransactionTelemetry(coordinator, transactionId, sessionId, transactionEpoch) {
  const startedAtMs = readTelemetryClockMs();
  const telemetry = {
    ...createHandle({transactionId, sessionId, transactionEpoch}, startedAtMs,
      {status: PURPOSE.REGISTRATION, participant: PURPOSE.PARTICIPANT_ADMISSION}),
    sampled: true,
    lastOperationEndedAtMs: startedAtMs,
    operations: [],
    operationsOmittedCount: 0,
    participantCount: 0,
    writeStatementCount: 0,
    writeStatementsMs: 0,
    readStatementCount: 0,
    readStatementsMs: 0,
  };
  adoptBeginOperation(coordinator, sessionId, telemetry);
  return telemetry;
}

// A transaction restored from rows has no BEGIN on this node: its first
// observation creates a handle without a sample. Its status writes and
// participant stages hand their purposes before any row write, as for any
// transaction; until then a row write is a settlement write.
function createRecoveredTransactionTelemetry(tx) {
  return {
    ...createHandle(tx, readTelemetryClockMs(),
      {status: PURPOSE.SETTLEMENT, participant: PURPOSE.SETTLEMENT}),
    sampled: false,
    reason: TRANSACTION_WITHOUT_SAMPLE_REASON.RECOVERED_FROM_ROWS,
  };
}

/**
 * The telemetry handle of a transaction this coordinator holds.
 * @param {Object} tx
 * @return {Object|null} Null for an object no coordinator created or restored.
 */
function transactionTelemetryOf(tx) {
  if (tx?.telemetry) return tx.telemetry;
  if (tx?.recoveryDiscovered !== true) return null;
  tx.telemetry = createRecoveredTransactionTelemetry(tx);
  return tx.telemetry;
}

function openTelemetryOf(tx) {
  const telemetry = transactionTelemetryOf(tx);
  return telemetry !== null && telemetry.completionSequence === 0 ? telemetry : null;
}

function heldTransactionOf(coordinator, transactionId) {
  return coordinator?.workflowCoordinator?.workflowsById?.get(transactionId) ?? null;
}

function countEnlistedParticipants(tx) {
  return (tx.participants?.size ?? 0) + (tx.readOnlyParticipants?.size ?? 0);
}

function finalizeSample(store, tx, telemetry) {
  telemetry.participantCount = countEnlistedParticipants(tx);
  const running = store.runningOperationBySession.get(tx.sessionId);
  if (running?.telemetry === telemetry && running.endedAtMs === UNSET_MS) {
    running.endedAtMs = telemetry.finalizedAtMs;
    closeStatementOperation(telemetry, running);
  }
  telemetry.completionSequence = appendTelemetryRing(store.samples, telemetry);
}

/**
 * Close the transaction's telemetry at its end: a sample joins the sample
 * ring; a transaction without a sample is counted by its reason and joins
 * its own ring. The operation running at that moment ends here.
 * @param {Object} coordinator
 * @param {Object} tx
 * @param {string} outcome - The transaction status at its end.
 */
function finalizeTransactionTelemetry(coordinator, tx, outcome) {
  const telemetry = openTelemetryOf(tx);
  if (telemetry === null) return;
  const store = coordinator.transactionTelemetry;
  telemetry.outcome = outcome;
  telemetry.finalizedAtMs = readTelemetryClockMs();
  telemetry.observationCount += CLOCK_READ;
  store.observationCount += CLOCK_READ;
  if (telemetry.sampled) {
    finalizeSample(store, tx, telemetry);
    return;
  }
  store.completedWithoutSampleByReason[telemetry.reason].count += 1;
  store.observationCount += 1;
  telemetry.completionSequence = appendTelemetryRing(store.withoutSample, telemetry);
}

/**
 * Record one sub-phase of the terminal operation the transaction's session
 * lane is running (B4).
 * @param {Object} coordinator
 * @param {Object} tx
 * @param {string} phase - A TRANSACTION_SUB_PHASE.
 * @param {number} startedAtMs - From readTelemetryClockMs at the phase start.
 */
function noteTransactionSubPhase(coordinator, tx, phase, startedAtMs) {
  const telemetry = openTelemetryOf(tx);
  if (!isOpenSample(telemetry)) return;
  const store = coordinator.transactionTelemetry;
  const running = store.runningOperationBySession.get(tx.sessionId);
  const histogram = running?.telemetry === telemetry ?
    store.subPhaseByKind[running.kind]?.[phase] : undefined;
  if (histogram === undefined) return;
  const ms = readTelemetryClockMs() - startedAtMs;
  recordTelemetryHistogram(histogram, ms);
  running.timings.push({phase, ms});
  store.observationCount += STEP_OBSERVATIONS;
  telemetry.observationCount += STEP_OBSERVATIONS;
}

/**
 * Hand the purpose of the transaction-row write the workflow coordinator
 * makes next (B8): the status-write caller names it.
 * @param {Object} tx
 * @param {string} purpose - A TRANSACTION_METADATA_PERSIST_PURPOSE.
 */
function handTransactionStatusWritePurpose(tx, purpose) {
  const telemetry = openTelemetryOf(tx);
  if (telemetry !== null) telemetry.statusWritePurpose = purpose;
}

/**
 * Hand the purpose of the participant-row writes the workflow coordinator
 * makes next (admission, or a participant stage).
 * @param {Object} tx
 * @param {string} purpose
 */
function handParticipantWritePurpose(tx, purpose) {
  const telemetry = openTelemetryOf(tx);
  if (telemetry !== null) telemetry.participantWritePurpose = purpose;
}

/**
 * Count one metadata submission of the transaction under its named purpose.
 * @param {Object} tx
 * @param {string} purpose
 */
function noteMetadataMutation(tx, purpose) {
  const telemetry = openTelemetryOf(tx);
  if (telemetry !== null) telemetry.submissionCountByPurpose[purpose] += 1;
}

/** @param {Object} workflow - The transaction row being written. */
function noteTransactionRowMutation(workflow) {
  const telemetry = openTelemetryOf(workflow);
  if (telemetry !== null) telemetry.submissionCountByPurpose[telemetry.statusWritePurpose] += 1;
}

/**
 * @param {Object} coordinator
 * @param {string} transactionId - Owner of the participant row written.
 */
function noteParticipantRowMutation(coordinator, transactionId) {
  const telemetry = openTelemetryOf(heldTransactionOf(coordinator, transactionId));
  if (telemetry !== null) {
    telemetry.submissionCountByPurpose[telemetry.participantWritePurpose] += 1;
  }
}

/**
 * @param {Object} coordinator
 * @param {string} transactionId - A participant-row write that was elided.
 */
function noteElidedParticipantRowMutation(coordinator, transactionId) {
  const telemetry = openTelemetryOf(heldTransactionOf(coordinator, transactionId));
  if (telemetry !== null) {
    telemetry.submissionCountByPurpose[telemetry.participantWritePurpose] -= 1;
  }
}

/**
 * Record one metadata persistence span of the transaction under its named
 * purpose, at node level and in its handle (spans overlap: this is work, not
 * wall time).
 * @param {Object} coordinator
 * @param {Object} tx
 * @param {string} purpose
 * @param {number} elapsedMs
 */
function noteMetadataPersistElapsed(coordinator, tx, purpose, elapsedMs) {
  const telemetry = openTelemetryOf(tx);
  if (telemetry === null) return;
  const store = coordinator.transactionTelemetry;
  recordTelemetryHistogram(store.persistByPurpose[purpose], elapsedMs);
  store.observationCount += 1;
  telemetry.persistMsByPurpose[purpose] += elapsedMs;
  telemetry.observationCount += STEP_OBSERVATIONS;
}

/**
 * Record a metadata persistence span by transaction ID under the purpose
 * its site names.
 * @param {Object} coordinator - The engine's transaction coordinator.
 * @param {string} transactionId
 * @param {string} purpose
 * @param {number} elapsedMs
 */
function noteHeldMetadataPersistElapsed(coordinator, transactionId, purpose, elapsedMs) {
  noteMetadataPersistElapsed(coordinator, heldTransactionOf(coordinator, transactionId),
    purpose, elapsedMs);
}

/**
 * Record the persistence span of a transaction-row write under the purpose
 * its status-write caller handed.
 * @param {Object} coordinator
 * @param {string} transactionId
 * @param {number} elapsedMs
 */
function noteTransactionRowPersistElapsed(coordinator, transactionId, elapsedMs) {
  const tx = heldTransactionOf(coordinator, transactionId);
  const telemetry = openTelemetryOf(tx);
  if (telemetry !== null) {
    noteMetadataPersistElapsed(coordinator, tx, telemetry.statusWritePurpose, elapsedMs);
  }
}

/**
 * Record the persistence span of a participant-row write under the purpose
 * its stage handed.
 * @param {Object} coordinator
 * @param {string} transactionId
 * @param {number} elapsedMs
 */
function noteParticipantRowPersistElapsed(coordinator, transactionId, elapsedMs) {
  const tx = heldTransactionOf(coordinator, transactionId);
  const telemetry = openTelemetryOf(tx);
  if (telemetry !== null) {
    noteMetadataPersistElapsed(coordinator, tx, telemetry.participantWritePurpose, elapsedMs);
  }
}

/**
 * @param {Object} coordinator
 * @param {string} transactionId - Whose row was read back authoritatively.
 */
function noteMetadataReadback(coordinator, transactionId) {
  const telemetry = openTelemetryOf(heldTransactionOf(coordinator, transactionId));
  if (telemetry === null) return;
  coordinator.transactionTelemetry.observations[NAME.METADATA_READBACK].count += 1;
  coordinator.transactionTelemetry.observationCount += 1;
  telemetry.readbackCount += 1;
}

/** @param {Object} tx - Its participant set was already persisted. */
function noteSkippedParticipantSetMutation(tx) {
  const telemetry = openTelemetryOf(tx);
  if (telemetry !== null) telemetry.skippedParticipantSetMutationCount += 1;
}

/**
 * One participant retry backoff of the transaction (B5), at node level.
 * @param {Object} coordinator
 * @param {Object} tx
 * @param {number} delayMs
 */
function noteParticipantRetryBackoff(coordinator, tx, delayMs) {
  if (openTelemetryOf(tx) === null) return;
  const store = coordinator.transactionTelemetry;
  recordTelemetryHistogram(store.observations[NAME.RETRY_BACKOFF], delayMs);
  store.observationCount += 1;
}

/**
 * The failure a COMMIT ended in: the transaction's stage when the failure
 * was decided, the first refusal cause a participant named, and the error
 * code answered. The first failure stays: a later drive of the same
 * recorded decision does not replace it.
 * @param {Object} tx
 * @param {Object} failure - {stage, refusalCause, errorCode}.
 */
function noteTransactionFailure(tx, failure) {
  const telemetry = openTelemetryOf(tx);
  if (telemetry !== null && telemetry.failure === undefined) telemetry.failure = failure;
}

function sampleOperationOf(operation, transactionStartedAtMs) {
  const runMs = operation.endedAtMs - operation.startedAtMs;
  const sampled = {
    kind: operation.kind,
    startOffsetMs: operation.queuedAtMs - transactionStartedAtMs,
    fifoWaitMs: operation.fifoWaitMs,
    runMs,
    subPhases: operation.timings.map(({phase, ms}) => ({phase, ms})),
  };
  const unattributedField = TERMINAL_UNATTRIBUTED[operation.kind];
  if (unattributedField !== undefined) {
    sampled[unattributedField] = runMs - timedSubPhasesMs(operation);
  }
  return sampled;
}

function metadataOf(telemetry) {
  return {
    submissionCountByPurpose: {...telemetry.submissionCountByPurpose},
    persistMsByPurpose: {...telemetry.persistMsByPurpose},
    readbackCount: telemetry.readbackCount,
    skippedParticipantSetMutationCount: telemetry.skippedParticipantSetMutationCount,
  };
}

function completedIdentityOf(telemetry) {
  return {
    completionSequence: telemetry.completionSequence,
    identity: {sessionId: telemetry.sessionId, transactionId: telemetry.transactionId,
      transactionEpoch: telemetry.transactionEpoch},
    startedAtMonotonicMs: telemetry.startedAtMs,
    outcome: telemetry.outcome,
    ...(telemetry.failure === undefined ? {} : {failure: {...telemetry.failure}}),
  };
}

function sampleOf(telemetry) {
  const operations = [];
  let attributedMs = 0;
  let betweenOperationsMs = 0;
  for (const operation of telemetry.operations) {
    const sampled = sampleOperationOf(operation, telemetry.startedAtMs);
    attributedMs += sampled.fifoWaitMs + sampled.runMs;
    betweenOperationsMs += operation.betweenMs;
    operations.push(sampled);
  }
  const totalMs = telemetry.finalizedAtMs - telemetry.startedAtMs;
  return {
    ...completedIdentityOf(telemetry),
    participantCount: telemetry.participantCount,
    operations,
    operationsOmittedCount: telemetry.operationsOmittedCount,
    writeStatementCount: telemetry.writeStatementCount,
    writeStatementsMs: telemetry.writeStatementsMs,
    readStatementCount: telemetry.readStatementCount,
    readStatementsMs: telemetry.readStatementsMs,
    metadata: metadataOf(telemetry),
    accounting: {totalMs, attributedMs, betweenOperationsMs,
      unattributedMs: totalMs - attributedMs - betweenOperationsMs},
    observationCount: telemetry.observationCount,
  };
}

function withoutSampleEntryOf(telemetry) {
  return {
    ...completedIdentityOf(telemetry),
    reason: telemetry.reason,
    metadata: metadataOf(telemetry),
    observationCount: telemetry.observationCount,
  };
}

// The one method of the section: its read, called by the answer builder on
// the engine's coordinator.
const distributedTransactionTelemetryReadMethods = Object.freeze({
  /**
   * The coordinator section of the node answer: a synchronous read of
   * memory that changes nothing. Participant requests are joined by the
   * answer builder from the query executor's own section.
   * @param {Object} options - {sinceSequence}.
   * @return {Object}
   */
  readTransactionTelemetrySection({sinceSequence}) {
    const store = this.transactionTelemetry;
    const window = readTelemetryRingSince(store.samples, sinceSequence);
    const {capacity, lastSequence} = store.withoutSample;
    return {
      availability: {state: TRANSACTION_TELEMETRY_AVAILABILITY.MEASURED},
      telemetryEpoch: store.telemetryEpoch,
      observationCount: store.observationCount,
      observations: snapshotTelemetryObservations(store.observations),
      samples: {
        capacity: store.samples.capacity,
        firstRetainedSequence: window.firstRetainedSequence,
        lastCompletionSequence: window.lastSequence,
        droppedCount: window.droppedCount,
        entries: window.values.map(sampleOf),
      },
      withoutSample: {
        capacity,
        droppedCount: Math.max(0, lastSequence - capacity),
        entries: retainedTelemetryRingValues(store.withoutSample).map(withoutSampleEntryOf),
      },
    };
  },
});

export {
  createCoordinatorTelemetryStore,
  createTransactionTelemetry,
  distributedTransactionTelemetryReadMethods,
  finalizeTransactionTelemetry,
  handParticipantWritePurpose,
  handTransactionStatusWritePurpose,
  noteElidedParticipantRowMutation,
  noteHeldMetadataPersistElapsed,
  noteMetadataMutation,
  noteMetadataPersistElapsed,
  noteMetadataReadback,
  noteParticipantRetryBackoff,
  noteParticipantRowMutation,
  noteParticipantRowPersistElapsed,
  noteSkippedParticipantSetMutation,
  noteTransactionFailure,
  noteTransactionRowMutation,
  noteTransactionRowPersistElapsed,
  noteTransactionSubPhase,
  queueTransactionOperation,
  settleTransactionOperation,
  startTransactionOperation,
};
