/**
 * Persistence boundary for the operation_progress owner resource.
 */

import {
  appendOperationProgressEvent,
  createOperationProgressEvent,
} from './operation-progress-events.js';
import {
  createInitialOperationProgress,
  normalizeOperationProgressRecord,
} from './operation-lifecycle.js';
import {
  OPERATION_WORKFLOW_IDENTIFIER_VARIANTS,
} from './operation-workflow-owner-constants.js';

const OPERATION_PROGRESS_STORE_TYPEOF_NUMBER = 'number';
const OPERATION_PROGRESS_STORE_TYPEOF_OBJECT = 'object';
const OPERATION_PROGRESS_STORE_TYPEOF_STRING = 'string';
const OPERATION_PROGRESS_STORE_TEXT_EMPTY = '';
const OPERATION_PROGRESS_STORE_VERSION_INITIAL = 0;

const OPERATION_PROGRESS_STORE_WRITE_STATE = Object.freeze({
  APPLIED: 'operation_progress_write_applied',
  VERSION_CONFLICT: 'operation_progress_write_version_conflict',
});

const OPERATION_PROGRESS_STORE_EVENT_APPEND_STATE = Object.freeze({
  APPENDED: 'operation_progress_event_appended',
});

function isOperationProgressStoreRecord(value) {
  return Boolean(value) &&
    typeof value === OPERATION_PROGRESS_STORE_TYPEOF_OBJECT &&
    !Array.isArray(value);
}

function normalizeOperationProgressStoreText(value, fallback) {
  if (typeof value !== OPERATION_PROGRESS_STORE_TYPEOF_STRING) {
    return fallback;
  }
  const normalized = value.trim();
  return normalized.length > OPERATION_PROGRESS_STORE_TEXT_EMPTY.length ?
    normalized :
    fallback;
}

function normalizeOperationProgressStoreNumber(value, fallback) {
  return typeof value === OPERATION_PROGRESS_STORE_TYPEOF_NUMBER &&
    Number.isFinite(value) ?
    Math.floor(value) :
    fallback;
}

function resolveOperationProgressStoreOperationId(input) {
  if (typeof input === OPERATION_PROGRESS_STORE_TYPEOF_STRING) {
    return normalizeOperationProgressStoreText(
      input,
      OPERATION_WORKFLOW_IDENTIFIER_VARIANTS.OPERATION_KEY_UNAVAILABLE,
    );
  }
  return normalizeOperationProgressStoreText(
    input?.operationId ||
      input?.operationKey ||
      input?.durableOperation?.operationKey,
    OPERATION_WORKFLOW_IDENTIFIER_VARIANTS.OPERATION_KEY_UNAVAILABLE,
  );
}

function cloneOperationProgressStoreRecord(value) {
  if (Array.isArray(value)) {
    return Object.freeze(value.map(cloneOperationProgressStoreRecord));
  }
  if (isOperationProgressStoreRecord(value)) {
    return Object.freeze(Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        cloneOperationProgressStoreRecord(entry),
      ]),
    ));
  }
  return value;
}

function createOperationProgressStore(options = {}) {
  const recordsByOperationId = new Map();
  let eventLog = [];

  for (const record of Array.isArray(options.records) ? options.records : []) {
    const progress = normalizeOperationProgressRecord(record);
    recordsByOperationId.set(progress.operationId, progress);
  }
  for (const event of Array.isArray(options.events) ? options.events : []) {
    eventLog = appendOperationProgressEvent(eventLog, event);
  }

  function loadOperationProgress(operationInput, context = {}) {
    const operationId = resolveOperationProgressStoreOperationId(
      operationInput,
    );
    const existing = recordsByOperationId.get(operationId);
    if (existing) {
      return cloneOperationProgressStoreRecord(existing);
    }
    return createInitialOperationProgress({
      operationId,
      ownerNodeId: context.ownerNodeId,
      epoch: context.epoch,
      term: context.term,
      generation: context.generation,
      evidence: context.evidence,
    });
  }

  function compareAndSwapOperationProgress({
    expectedVersion,
    progress,
  }) {
    const nextProgress = normalizeOperationProgressRecord(progress);
    const current = recordsByOperationId.get(nextProgress.operationId) ||
      createInitialOperationProgress({operationId: nextProgress.operationId});
    const normalizedExpectedVersion = normalizeOperationProgressStoreNumber(
      expectedVersion,
      OPERATION_PROGRESS_STORE_VERSION_INITIAL,
    );
    if (current.version !== normalizedExpectedVersion) {
      return Object.freeze({
        state: OPERATION_PROGRESS_STORE_WRITE_STATE.VERSION_CONFLICT,
        applied: false,
        expectedVersion: normalizedExpectedVersion,
        actualVersion: current.version,
        progress: cloneOperationProgressStoreRecord(current),
      });
    }
    recordsByOperationId.set(nextProgress.operationId, nextProgress);
    return Object.freeze({
      state: OPERATION_PROGRESS_STORE_WRITE_STATE.APPLIED,
      applied: true,
      expectedVersion: normalizedExpectedVersion,
      actualVersion: nextProgress.version,
      progress: cloneOperationProgressStoreRecord(nextProgress),
    });
  }

  function appendEvent(event) {
    const nextEvent = createOperationProgressEvent(event);
    eventLog = appendOperationProgressEvent(eventLog, nextEvent);
    return Object.freeze({
      state: OPERATION_PROGRESS_STORE_EVENT_APPEND_STATE.APPENDED,
      event: nextEvent,
      eventLogLength: eventLog.length,
    });
  }

  function listOperationProgressRecords() {
    return Object.freeze([...recordsByOperationId.values()].map((record) =>
      cloneOperationProgressStoreRecord(record),
    ));
  }

  function listOperationProgressEvents() {
    return Object.freeze(eventLog.map((event) =>
      cloneOperationProgressStoreRecord(event),
    ));
  }

  return Object.freeze({
    appendEvent,
    compareAndSwapOperationProgress,
    listOperationProgressEvents,
    listOperationProgressRecords,
    loadOperationProgress,
  });
}

export {
  OPERATION_PROGRESS_STORE_EVENT_APPEND_STATE,
  OPERATION_PROGRESS_STORE_WRITE_STATE,
  createOperationProgressStore,
};
