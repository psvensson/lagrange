/**
 * Event grammar for the operation_progress owner resource.
 */

import {
  OPERATION_WORKFLOW_IDENTIFIER_VARIANTS,
  OPERATION_WORKFLOW_OWNER,
  OPERATION_WORKFLOW_REVISION_VARIANTS,
} from './operation-workflow-owner-constants.js';

const OPERATION_PROGRESS_EVENT_SCHEMA_VERSION =
  'operation_progress_event_schema_v1';
const OPERATION_PROGRESS_EVENT_LOG_SOURCE = 'operation_progress_event_log';
const OPERATION_PROGRESS_EVENT_TEXT_EMPTY = '';
const OPERATION_PROGRESS_EVENT_TYPEOF_NUMBER = 'number';
const OPERATION_PROGRESS_EVENT_TYPEOF_OBJECT = 'object';
const OPERATION_PROGRESS_EVENT_TYPEOF_STRING = 'string';
const OPERATION_PROGRESS_EVENT_DEFAULT_SEQUENCE = 0;
const OPERATION_PROGRESS_EVENT_SEQUENCE_INCREMENT = 1;
const OPERATION_PROGRESS_EVENT_ID_SEPARATOR = ':';

const OPERATION_PROGRESS_EVENT_TYPE = Object.freeze({
  ACTIVE_GATE_VISIBLE: 'active_gate_visible',
  DISPATCH_ACCEPTED: 'dispatch_accepted',
  DISPATCH_REQUESTED: 'dispatch_requested',
  INVALID_TRANSITION_REJECTED: 'invalid_transition_rejected',
  OPERATION_COMPLETE: 'operation_complete',
  OPERATION_FAILED: 'operation_failed',
  OUT_OF_CONTRACT_EVIDENCE: 'out_of_contract_evidence',
  OWNER_PROGRESS_WAIT_REQUIRED: 'owner_progress_wait_required',
  PUBLICATION_ACCEPTED: 'publication_accepted',
  REMOTE_OWNER_WAKE_REQUIRED: 'remote_owner_wake_required',
  RETAIN_PUBLICATION_FOR_RETRY: 'retain_publication_for_retry',
  RETRY_EXHAUSTED: 'retry_exhausted',
  RETRY_REQUESTED: 'retry_requested',
  SERIAL_DEPENDENCY_PENDING: 'serial_dependency_pending',
});

const OPERATION_PROGRESS_EVENT_PAYLOAD_VARIANTS = Object.freeze({
  EMPTY: Object.freeze({}),
});

function isOperationProgressEventRecord(value) {
  return Boolean(value) &&
    typeof value === OPERATION_PROGRESS_EVENT_TYPEOF_OBJECT &&
    !Array.isArray(value);
}

function normalizeOperationProgressEventText(value, fallback) {
  if (typeof value !== OPERATION_PROGRESS_EVENT_TYPEOF_STRING) {
    return fallback;
  }
  const normalized = value.trim();
  return normalized.length > OPERATION_PROGRESS_EVENT_TEXT_EMPTY.length ?
    normalized :
    fallback;
}

function normalizeOperationProgressEventNumber(value, fallback) {
  return typeof value === OPERATION_PROGRESS_EVENT_TYPEOF_NUMBER &&
    Number.isFinite(value) ?
    Math.floor(value) :
    fallback;
}

function cloneOperationProgressEventPayload(value) {
  if (Array.isArray(value)) {
    return Object.freeze(value.map(cloneOperationProgressEventPayload));
  }
  if (isOperationProgressEventRecord(value)) {
    return Object.freeze(Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        cloneOperationProgressEventPayload(entry),
      ]),
    ));
  }
  return value;
}

function buildOperationProgressEventId({
  operationId,
  type,
  sequence,
}) {
  return [
    normalizeOperationProgressEventText(
      operationId,
      OPERATION_WORKFLOW_IDENTIFIER_VARIANTS.OPERATION_KEY_UNAVAILABLE,
    ),
    normalizeOperationProgressEventText(
      type,
      OPERATION_PROGRESS_EVENT_TYPE.INVALID_TRANSITION_REJECTED,
    ),
    String(normalizeOperationProgressEventNumber(
      sequence,
      OPERATION_PROGRESS_EVENT_DEFAULT_SEQUENCE,
    )),
  ].join(OPERATION_PROGRESS_EVENT_ID_SEPARATOR);
}

function createOperationProgressEvent(options = {}) {
  const type = normalizeOperationProgressEventText(
    options.type,
    OPERATION_PROGRESS_EVENT_TYPE.INVALID_TRANSITION_REJECTED,
  );
  const operationId = normalizeOperationProgressEventText(
    options.operationId,
    OPERATION_WORKFLOW_IDENTIFIER_VARIANTS.OPERATION_KEY_UNAVAILABLE,
  );
  const sequence = normalizeOperationProgressEventNumber(
    options.sequence,
    OPERATION_PROGRESS_EVENT_DEFAULT_SEQUENCE,
  );
  const eventId = normalizeOperationProgressEventText(
    options.eventId,
    buildOperationProgressEventId({operationId, type, sequence}),
  );
  return Object.freeze({
    schemaVersion: OPERATION_PROGRESS_EVENT_SCHEMA_VERSION,
    eventId,
    type,
    operationId,
    ownerId: normalizeOperationProgressEventText(
      options.ownerId,
      OPERATION_WORKFLOW_OWNER,
    ),
    epoch: normalizeOperationProgressEventText(
      options.epoch,
      OPERATION_WORKFLOW_REVISION_VARIANTS.SOURCE_REVISION_UNAVAILABLE,
    ),
    term: normalizeOperationProgressEventText(
      options.term,
      OPERATION_WORKFLOW_REVISION_VARIANTS.LEASE_TERM_UNAVAILABLE,
    ),
    generation: normalizeOperationProgressEventText(
      options.generation,
      OPERATION_WORKFLOW_REVISION_VARIANTS.SOURCE_REVISION_UNAVAILABLE,
    ),
    sequence,
    sourceRevision: normalizeOperationProgressEventText(
      options.sourceRevision,
      OPERATION_WORKFLOW_REVISION_VARIANTS.SOURCE_REVISION_UNAVAILABLE,
    ),
    observedAt: normalizeOperationProgressEventNumber(
      options.observedAt,
      OPERATION_PROGRESS_EVENT_DEFAULT_SEQUENCE,
    ),
    payload: cloneOperationProgressEventPayload(
      options.payload || OPERATION_PROGRESS_EVENT_PAYLOAD_VARIANTS.EMPTY,
    ),
  });
}

function createNextOperationProgressEvent(options = {}) {
  const currentSequence = normalizeOperationProgressEventNumber(
    options.currentSequence,
    OPERATION_PROGRESS_EVENT_DEFAULT_SEQUENCE,
  );
  return createOperationProgressEvent({
    ...options,
    sequence: currentSequence + OPERATION_PROGRESS_EVENT_SEQUENCE_INCREMENT,
  });
}

function appendOperationProgressEvent(eventLog = [], event) {
  const nextEvent = createOperationProgressEvent(event);
  return Object.freeze([
    ...(Array.isArray(eventLog) ? eventLog : []),
    nextEvent,
  ]);
}

function projectOperationProgressRecords(eventLog = []) {
  const recordsByOperationId = new Map();
  for (const event of Array.isArray(eventLog) ? eventLog : []) {
    const progress = event?.payload?.operationProgress;
    if (!isOperationProgressEventRecord(progress)) {
      continue;
    }
    recordsByOperationId.set(progress.operationId, progress);
  }
  return Object.freeze([...recordsByOperationId.values()].map((record) =>
    Object.freeze({...record}),
  ));
}

export {
  OPERATION_PROGRESS_EVENT_LOG_SOURCE,
  OPERATION_PROGRESS_EVENT_SCHEMA_VERSION,
  OPERATION_PROGRESS_EVENT_TYPE,
  appendOperationProgressEvent,
  createNextOperationProgressEvent,
  createOperationProgressEvent,
  projectOperationProgressRecords,
};
