/**
 * Labelled identity resolution and typed result construction
 * for the OCI host-agent Engine translation.
 *
 * Owns the ten immutable io.lagrange.* labels the agent writes
 * at create, the complete-identity resolution rule applied to
 * every Engine observation, and the exact typed result variants
 * of the v1 grammar (oci-runtime-host-contract.md "Resource
 * identity and ownership").
 *
 * @module runtime/oci-host-agent-engine-identity
 */

const RESULT_STATUS = Object.freeze({
  COMPLETED: 'completed',
  ALREADY_APPLIED: 'already_applied',
  ALREADY_ABSENT: 'already_absent',
  REJECTED: 'rejected',
  RETRYABLE_FAILURE: 'retryable_failure',
  AMBIGUOUS: 'ambiguous',
});

const ERROR_CODE = Object.freeze({
  DEADLINE_INVALID: 'deadline_invalid',
  POLICY_DENIED: 'policy_denied',
  DIGEST_MISMATCH: 'digest_mismatch',
  IDENTITY_CONFLICT: 'identity_conflict',
  INTENT_CONFLICT: 'intent_conflict',
  RESOURCE_CONFLICT: 'resource_conflict',
  DEADLINE_BEFORE_DISPATCH: 'deadline_before_dispatch',
  ENGINE_UNAVAILABLE: 'engine_unavailable',
  ENGINE_FAILURE: 'engine_failure',
  ENGINE_OUTCOME_UNKNOWN: 'engine_outcome_unknown',
});

const CONTAINER_STATE = Object.freeze({
  CREATED: 'created',
  RUNNING: 'running',
  EXITED: 'exited',
});

const CLEANUP_STATE = Object.freeze({
  NOT_REQUIRED: 'not_required',
  AMBIGUOUS: 'ambiguous',
});

const OBSERVATION_KIND = Object.freeze({
  NOT_OBSERVED: 'not_observed',
  IMAGE: 'image',
  CONTAINER: 'container',
  ABSENCE: 'absence',
});

const LABEL = Object.freeze({
  MANAGED: 'io.lagrange.managed',
  CLUSTER_INCARNATION: 'io.lagrange.cluster_incarnation',
  NODE_ID: 'io.lagrange.node_id',
  SERVICE_ID: 'io.lagrange.service_id',
  REVISION_ID: 'io.lagrange.revision_id',
  INSTANCE_ID: 'io.lagrange.instance_id',
  IMAGE_DIGEST: 'io.lagrange.image_digest',
  RUNTIME_CONFIG_DIGEST: 'io.lagrange.runtime_config_digest',
  CREATE_OPERATION_ID: 'io.lagrange.create_operation_id',
  CREATE_INTENT_DIGEST: 'io.lagrange.create_intent_digest',
});

const IDENTITY_LABEL_BY_FIELD = Object.freeze({
  clusterIncarnation: LABEL.CLUSTER_INCARNATION,
  nodeId: LABEL.NODE_ID,
  serviceId: LABEL.SERVICE_ID,
  revisionId: LABEL.REVISION_ID,
  instanceId: LABEL.INSTANCE_ID,
});

const TARGET = Object.freeze({
  ABSENT: 'absent',
  RESOLVED: 'resolved',
  INVALID: 'invalid',
  MULTIPLE: 'multiple',
});

const ENGINE_TRANSLATION_ERROR = Object.freeze({
  OPTIONS_REQUIRED:
    'engine translation options must be a non-null object',
  ENGINE_METHOD_MISSING:
    'engine facade requires method',
  POLICY_FIELD_INVALID:
    'boot policy field is missing or invalid',
  PLAN_UNSUPPORTED:
    'mutation plan kind is not supported',
  INPUT_FIELD_INVALID:
    'engine translation input field is missing or invalid',
});

const LABEL_FIELDS = Object.freeze(Object.values(LABEL));
const IDENTITY_FIELDS = Object.freeze(Object.keys(IDENTITY_LABEL_BY_FIELD));
const TRANSLATION_ERROR_NAME = 'OciHostAgentEngineTranslationError';
const IDENTITY_INPUT_NAME = 'identity';
const MANAGED_LABEL_VALUE = 'true';
const ABSENCE_STATE = 'absent';
const CONTAINER_STATES = new Set(Object.values(CONTAINER_STATE));
const CONTAINER_ID_PATTERN = /^[0-9a-f]{64}$/u;

class OciHostAgentEngineTranslationError extends Error {
  constructor(message, detail) {
    super(detail === undefined ? message : `${message}: ${detail}`);
    this.name = TRANSLATION_ERROR_NAME;
  }
}

function translationError(message, detail) {
  return new OciHostAgentEngineTranslationError(message, detail);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' &&
    !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function isBoundedSafeInteger(value, minimum, maximum) {
  return Number.isSafeInteger(value) && value >= minimum &&
    value <= maximum;
}

function requireField(condition, name) {
  if (!condition) {
    throw translationError(
      ENGINE_TRANSLATION_ERROR.INPUT_FIELD_INVALID, name);
  }
}

function copyIdentity(identity) {
  requireField(isPlainObject(identity), IDENTITY_INPUT_NAME);
  const copy = {};
  for (const field of IDENTITY_FIELDS) {
    requireField(isNonEmptyString(identity[field]),
      `${IDENTITY_INPUT_NAME}.${field}`);
    copy[field] = identity[field];
  }
  return copy;
}

function copyLabels(labels) {
  const copy = {};
  for (const field of LABEL_FIELDS) copy[field] = labels[field];
  return copy;
}

function buildStableLabels(identity, imageDigest, runtimeConfigDigest,
  createOperationId, createIntentDigest) {
  const labels = {[LABEL.MANAGED]: MANAGED_LABEL_VALUE};
  for (const [field, label] of Object.entries(IDENTITY_LABEL_BY_FIELD)) {
    labels[label] = identity[field];
  }
  labels[LABEL.IMAGE_DIGEST] = imageDigest;
  labels[LABEL.RUNTIME_CONFIG_DIGEST] = runtimeConfigDigest;
  labels[LABEL.CREATE_OPERATION_ID] = createOperationId;
  labels[LABEL.CREATE_INTENT_DIGEST] = createIntentDigest;
  return labels;
}

function matchLabelsValid(identity, match) {
  const labels = match.labels;
  if (!isPlainObject(labels)) return false;
  const keys = Object.keys(labels);
  if (keys.length !== LABEL_FIELDS.length ||
      !LABEL_FIELDS.every((field) => isNonEmptyString(labels[field]))) {
    return false;
  }
  if (labels[LABEL.MANAGED] !== MANAGED_LABEL_VALUE) return false;
  return IDENTITY_FIELDS.every((field) =>
    labels[IDENTITY_LABEL_BY_FIELD[field]] === identity[field]);
}

function matchShapeValid(match) {
  return isPlainObject(match) &&
    typeof match.containerId === 'string' &&
    CONTAINER_ID_PATTERN.test(match.containerId) &&
    CONTAINER_STATES.has(match.state);
}

function matchesAllValid(identity, matches) {
  return matches.every((match) =>
    matchShapeValid(match) && matchLabelsValid(identity, match));
}

/**
 * Resolve the semantic target kind from the match cohort. Rules are ordered:
 * the first rule whose predicate holds supplies the outcome, so the decision
 * table is the single authority for target classification.
 */
const TARGET_RESOLUTION_RULES = Object.freeze([
  {
    when: ({matches}) => !Array.isArray(matches) || matches.length === 0,
    resolve: () => ({kind: TARGET.ABSENT}),
  },
  {
    when: ({identity, matches}) => !matchesAllValid(identity, matches),
    resolve: () => ({kind: TARGET.INVALID}),
  },
  {
    when: ({matches}) => matches.length > 1,
    resolve: () => ({kind: TARGET.MULTIPLE}),
  },
]);

function resolveTarget(identity, snapshot) {
  const matches = snapshot.matches;
  for (const rule of TARGET_RESOLUTION_RULES) {
    if (rule.when({identity, matches})) {
      return rule.resolve();
    }
  }
  return {kind: TARGET.RESOLVED, match: matches[0]};
}

function containerObservation(match) {
  return {
    kind: OBSERVATION_KIND.CONTAINER,
    containerId: match.containerId,
    state: match.state,
    labels: copyLabels(match.labels),
    imageDigest: match.labels[LABEL.IMAGE_DIGEST],
    runtimeConfigDigest: match.labels[LABEL.RUNTIME_CONFIG_DIGEST],
  };
}

function imageObservation(imageDigest) {
  return {kind: OBSERVATION_KIND.IMAGE, imageDigest};
}

function absenceObservation() {
  return {kind: OBSERVATION_KIND.ABSENCE, state: ABSENCE_STATE};
}

function notObserved() {
  return {kind: OBSERVATION_KIND.NOT_OBSERVED};
}

function emptyCleanup() {
  return {state: CLEANUP_STATE.NOT_REQUIRED, residualResources: []};
}

function baseResult(context, status) {
  return {
    status,
    operation: context.operation,
    intentDigest: context.intentDigest,
    cleanup: emptyCleanup(),
    identity: copyIdentity(context.identity),
  };
}

function successResult(context, status, observation) {
  return {...baseResult(context, status), observation};
}

function rejectedResult(context, errorCode) {
  return {...baseResult(context, RESULT_STATUS.REJECTED), errorCode};
}

function retryableResult(context, errorCode, lastObservation) {
  return {
    ...baseResult(context, RESULT_STATUS.RETRYABLE_FAILURE),
    errorCode,
    lastObservation,
  };
}

function ambiguousResult(context, lastObservation, cleanup) {
  const result = {
    ...baseResult(context, RESULT_STATUS.AMBIGUOUS),
    errorCode: ERROR_CODE.ENGINE_OUTCOME_UNKNOWN,
    lastObservation,
    fenceState: context.fenceState,
  };
  if (cleanup) result.cleanup = cleanup;
  return result;
}

function createResidualCleanup(context, match) {
  const labels = match.labels;
  if (labels[LABEL.CREATE_OPERATION_ID] !== context.operationId ||
      labels[LABEL.CREATE_INTENT_DIGEST] !== context.intentDigest) {
    return emptyCleanup();
  }
  return {
    state: CLEANUP_STATE.AMBIGUOUS,
    residualResources: [{
      containerId: match.containerId,
      labels: copyLabels(labels),
    }],
  };
}

export {
  CONTAINER_STATE,
  ENGINE_TRANSLATION_ERROR,
  ERROR_CODE,
  LABEL,
  RESULT_STATUS,
  TARGET,
  absenceObservation,
  ambiguousResult,
  buildStableLabels,
  containerObservation,
  copyIdentity,
  createResidualCleanup,
  imageObservation,
  isBoundedSafeInteger,
  isNonEmptyString,
  isPlainObject,
  notObserved,
  rejectedResult,
  requireField,
  resolveTarget,
  retryableResult,
  successResult,
  translationError,
};
