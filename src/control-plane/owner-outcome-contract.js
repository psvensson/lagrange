
const OWNER_OUTCOME_STATE = Object.freeze({
  READY: 'ready',
  PENDING: 'pending',
  DEFERRED: 'deferred',
  BLOCKED: 'blocked',
  FAILED: 'failed',
});

const OWNER_OUTCOME_FRESHNESS = Object.freeze({
  FRESH: 'fresh',
  STALE: 'stale',
  UNKNOWN: 'unknown',
});

const OWNER_OUTCOME_TERMINAL = Object.freeze({
  TERMINAL: true,
  NON_TERMINAL: false,
});

const OWNER_OUTCOME_DEFAULT = Object.freeze({
  OWNER: 'unknown_owner',
  BOUNDARY: 'unknown_boundary',
  OUTCOME: 'invalid_owner_outcome_envelope',
  NEXT_ACTION: 'stop',
  REVISION: 0,
  RETRY_AFTER_MS: 0,
});

const OWNER_OUTCOME_FIELD = Object.freeze({
  BOUNDARY: 'boundary',
  EVIDENCE: 'evidence',
  FRESHNESS: 'freshness',
  NEXT_ACTION: 'nextAction',
  OUTCOME: 'outcome',
  OWNER: 'owner',
  REASON_CODES: 'reasonCodes',
  RETRY_AFTER_MS: 'retryAfterMs',
  REVISION: 'revision',
  STATE: 'state',
  TERMINAL: 'terminal',
});

const OWNER_OUTCOME_REASON_CODE = Object.freeze({
  INVALID_FIELD_PREFIX: 'invalid_field',
  MISSING_FIELD_PREFIX: 'missing_field',
});

const OWNER_OUTCOME_REQUIRED_FIELDS = Object.freeze([
  OWNER_OUTCOME_FIELD.OWNER,
  OWNER_OUTCOME_FIELD.BOUNDARY,
  OWNER_OUTCOME_FIELD.STATE,
  OWNER_OUTCOME_FIELD.OUTCOME,
  OWNER_OUTCOME_FIELD.REASON_CODES,
  OWNER_OUTCOME_FIELD.NEXT_ACTION,
  OWNER_OUTCOME_FIELD.FRESHNESS,
  OWNER_OUTCOME_FIELD.REVISION,
  OWNER_OUTCOME_FIELD.RETRY_AFTER_MS,
  OWNER_OUTCOME_FIELD.TERMINAL,
  OWNER_OUTCOME_FIELD.EVIDENCE,
]);

function isOwnerOutcomeRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeOwnerOutcomeString(value, fallback) {
  return typeof value === 'string' && value.length > 0 ?
    value :
    fallback;
}

function normalizeOwnerOutcomeReasonCodes(reasonCodes = []) {
  if (!Array.isArray(reasonCodes)) {
    return Object.freeze([]);
  }
  const normalized = [];
  for (const reasonCode of reasonCodes) {
    if (typeof reasonCode === 'string' && reasonCode.length > 0) {
      normalized.push(reasonCode);
    }
  }
  return Object.freeze([...new Set(normalized)]);
}

function normalizeOwnerOutcomeRevision(value) {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  if (Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  return OWNER_OUTCOME_DEFAULT.REVISION;
}

function normalizeOwnerOutcomeRetryAfterMs(value) {
  return Number.isFinite(value) ?
    Math.max(0, Math.floor(value)) :
    OWNER_OUTCOME_DEFAULT.RETRY_AFTER_MS;
}

function normalizeOwnerOutcomeEvidence(value = {}) {
  if (!isOwnerOutcomeRecord(value)) {
    return Object.freeze({});
  }
  return Object.freeze({...value});
}

function collectOwnerOutcomeMissingFields(value = {}) {
  const missingFields = [];
  for (const requiredField of OWNER_OUTCOME_REQUIRED_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(value, requiredField)) {
      missingFields.push(requiredField);
    }
  }
  return missingFields;
}

function collectOwnerOutcomeInvalidFields(value = {}) {
  const invalidFields = [];
  if (!(typeof value?.owner === 'string' && value.owner.length > 0)) {
    invalidFields.push(OWNER_OUTCOME_FIELD.OWNER);
  }
  if (!(typeof value?.boundary === 'string' && value.boundary.length > 0)) {
    invalidFields.push(OWNER_OUTCOME_FIELD.BOUNDARY);
  }
  if (!(typeof value?.state === 'string' && value.state.length > 0)) {
    invalidFields.push(OWNER_OUTCOME_FIELD.STATE);
  }
  if (!(typeof value?.outcome === 'string' &&
      value.outcome.length > 0)) {
    invalidFields.push(OWNER_OUTCOME_FIELD.OUTCOME);
  }
  if (!Array.isArray(value?.reasonCodes)) {
    invalidFields.push(OWNER_OUTCOME_FIELD.REASON_CODES);
  }
  if (!(typeof value?.nextAction === 'string' &&
      value.nextAction.length > 0)) {
    invalidFields.push(OWNER_OUTCOME_FIELD.NEXT_ACTION);
  }
  if (!(typeof value?.freshness === 'string' &&
      value.freshness.length > 0)) {
    invalidFields.push(OWNER_OUTCOME_FIELD.FRESHNESS);
  }
  if (!(typeof value?.revision === 'string' ||
      Number.isFinite(value?.revision))) {
    invalidFields.push(OWNER_OUTCOME_FIELD.REVISION);
  }
  if (!Number.isFinite(value?.retryAfterMs)) {
    invalidFields.push(OWNER_OUTCOME_FIELD.RETRY_AFTER_MS);
  }
  if (typeof value?.terminal !== 'boolean') {
    invalidFields.push(OWNER_OUTCOME_FIELD.TERMINAL);
  }
  if (!isOwnerOutcomeRecord(value?.evidence)) {
    invalidFields.push(OWNER_OUTCOME_FIELD.EVIDENCE);
  }
  return invalidFields;
}

function buildOwnerOutcomeContractFailure(value = {}, missingFields = [], invalidFields = []) {
  const failureReasonCodes = normalizeOwnerOutcomeReasonCodes([
    ...missingFields.map((fieldName) =>
      `${OWNER_OUTCOME_REASON_CODE.MISSING_FIELD_PREFIX}:${fieldName}`),
    ...invalidFields.map((fieldName) =>
      `${OWNER_OUTCOME_REASON_CODE.INVALID_FIELD_PREFIX}:${fieldName}`),
  ]);
  return Object.freeze({
    owner: normalizeOwnerOutcomeString(
      value?.owner,
      OWNER_OUTCOME_DEFAULT.OWNER,
    ),
    boundary: normalizeOwnerOutcomeString(
      value?.boundary,
      OWNER_OUTCOME_DEFAULT.BOUNDARY,
    ),
    state: OWNER_OUTCOME_STATE.FAILED,
    outcome: OWNER_OUTCOME_DEFAULT.OUTCOME,
    reasonCodes: failureReasonCodes,
    nextAction: OWNER_OUTCOME_DEFAULT.NEXT_ACTION,
    freshness: OWNER_OUTCOME_FRESHNESS.UNKNOWN,
    revision: OWNER_OUTCOME_DEFAULT.REVISION,
    retryAfterMs: OWNER_OUTCOME_DEFAULT.RETRY_AFTER_MS,
    terminal: OWNER_OUTCOME_TERMINAL.TERMINAL,
    evidence: normalizeOwnerOutcomeEvidence({
      missingFields,
      invalidFields,
      providedEvidence: value?.evidence,
    }),
  });
}

function buildOwnerOutcomeEnvelope(value = {}) {
  const envelope = isOwnerOutcomeRecord(value) ? value : {};
  const missingFields = collectOwnerOutcomeMissingFields(envelope);
  const invalidFields = collectOwnerOutcomeInvalidFields(envelope);
  if (missingFields.length > 0 || invalidFields.length > 0) {
    return buildOwnerOutcomeContractFailure(
      envelope,
      missingFields,
      invalidFields,
    );
  }
  return Object.freeze({
    owner: envelope.owner,
    boundary: envelope.boundary,
    state: envelope.state,
    outcome: envelope.outcome,
    reasonCodes: normalizeOwnerOutcomeReasonCodes(envelope.reasonCodes),
    nextAction: envelope.nextAction,
    freshness: normalizeOwnerOutcomeString(
      envelope.freshness,
      OWNER_OUTCOME_FRESHNESS.UNKNOWN,
    ),
    revision: normalizeOwnerOutcomeRevision(envelope.revision),
    retryAfterMs: normalizeOwnerOutcomeRetryAfterMs(envelope.retryAfterMs),
    terminal: envelope.terminal === true,
    evidence: normalizeOwnerOutcomeEvidence(envelope.evidence),
  });
}

function normalizeOwnerOutcomeEnvelope(value = {}) {
  return buildOwnerOutcomeEnvelope(value);
}

export {
  OWNER_OUTCOME_DEFAULT,
  OWNER_OUTCOME_FRESHNESS,
  OWNER_OUTCOME_REQUIRED_FIELDS,
  OWNER_OUTCOME_STATE,
  OWNER_OUTCOME_TERMINAL,
  buildOwnerOutcomeEnvelope,
  isOwnerOutcomeRecord,
  normalizeOwnerOutcomeEnvelope,
};
