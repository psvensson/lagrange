import {
  OCI_HOST_AGENT_PROTOCOL_ERROR,
  protocolError,
} from './oci-host-agent-protocol-errors.js';

const PROTOCOL_VERSION = 1;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const OWNER_ID_PATTERN = /^[A-Za-z0-9._:-]+$/u;
const KEY_ID_PATTERN = /^[A-Za-z0-9._-]+$/u;
const ENVIRONMENT_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/u;
const CONTAINER_ID_PATTERN = /^[0-9a-f]{64}$/u;
const CONTROL_PATTERN = /\p{Cc}/u;
const SURROGATE_PATTERN = /\p{Cs}/u;
const REPOSITORY_COMPONENT_PATTERN =
  '[a-z0-9]+(?:(?:[._]|__|[-]+)[a-z0-9]+)*';
const ARTIFACT_REF_PATTERN = new RegExp(
  '^[a-z0-9]+(?:[.-][a-z0-9]+)*(?::[0-9]{1,5})?' +
  `/(?:${REPOSITORY_COMPONENT_PATTERN})(?:/${REPOSITORY_COMPONENT_PATTERN})*` +
  '@sha256:[0-9a-f]{64}$',
  'u',
);

const REQUEST_FIELDS = Object.freeze([
  'protocolVersion',
  'requestId',
  'operationId',
  'keyId',
  'issuedAtMs',
  'deadlineAtMs',
  'nonce',
  'clusterIncarnation',
  'nodeId',
  'serviceId',
  'revisionId',
  'instanceId',
  'operation',
  'payload',
]);
const RESPONSE_FIELDS = Object.freeze([
  'protocolVersion',
  'requestId',
  'operationId',
  'keyId',
  'agentId',
  'completedAtMs',
  'result',
]);
const IDENTITY_FIELDS = Object.freeze([
  'clusterIncarnation',
  'nodeId',
  'serviceId',
  'revisionId',
  'instanceId',
]);
const RESULT_COMMON_FIELDS = Object.freeze([
  'status',
  'operation',
  'intentDigest',
  'cleanup',
  'identity',
]);
const STABLE_LABEL_FIELDS = Object.freeze([
  'io.lagrange.managed',
  'io.lagrange.cluster_incarnation',
  'io.lagrange.node_id',
  'io.lagrange.service_id',
  'io.lagrange.revision_id',
  'io.lagrange.instance_id',
  'io.lagrange.image_digest',
  'io.lagrange.runtime_config_digest',
  'io.lagrange.create_operation_id',
  'io.lagrange.create_intent_digest',
]);
const FIELD = Object.freeze({
  ARGS: 'args',
  ARTIFACT_REF: 'artifactRef',
  CLUSTER_INCARNATION: 'clusterIncarnation',
  CONTAINER_ID: 'containerId',
  CONTAINER_PORT: 'containerPort',
  CPU_MILLIS: 'cpuMillis',
  ENTRYPOINT: 'entrypoint',
  ENVIRONMENT: 'environment',
  ERROR_CODE: 'errorCode',
  EXPECTED_DIGEST: 'expectedDigest',
  FENCE_STATE: 'fenceState',
  GRACE_MS: 'graceMs',
  IMAGE_DIGEST: 'imageDigest',
  KIND: 'kind',
  LABELS: 'labels',
  LAST_OBSERVATION: 'lastObservation',
  MEMORY_BYTES: 'memoryBytes',
  NODE_ID: 'nodeId',
  OBSERVATION: 'observation',
  PORTS: 'ports',
  PROTOCOL: 'protocol',
  REGISTRY_CREDENTIAL_ID: 'registryCredentialId',
  RESIDUAL_RESOURCES: 'residualResources',
  RESOURCES: 'resources',
  RUNTIME_CONFIG_DIGEST: 'runtimeConfigDigest',
  SECRET_REFS: 'secretRefs',
  STATE: 'state',
  VALUES: 'values',
});
const MANAGED_LABEL = STABLE_LABEL_FIELDS[0];
const IMAGE_DIGEST_LABEL = STABLE_LABEL_FIELDS[6];
const RUNTIME_CONFIG_DIGEST_LABEL = STABLE_LABEL_FIELDS[7];
const CREATE_OPERATION_LABEL = STABLE_LABEL_FIELDS[8];
const CREATE_INTENT_LABEL = STABLE_LABEL_FIELDS[9];
const ABSENCE_KIND = 'absence';
const CONTAINER_KIND = 'container';
const IMAGE_KIND = 'image';
const NOT_OBSERVED = 'not_observed';
const ABSENCE_STATE = 'absent';
const MANAGED_LABEL_VALUE = 'true';
const BASE64_ENCODING = 'base64';
const PORT_PROTOCOLS = new Set(['tcp', 'udp']);

const C1_OPERATION = Object.freeze({
  PULL: 'pull',
  CREATE: 'create',
  START: 'start',
  INSPECT: 'inspect',
  STOP: 'stop',
  REMOVE: 'remove',
});
const C1_OPERATIONS = new Set(Object.values(C1_OPERATION));
const OPERATION_MAXIMUM_MS = Object.freeze({
  [C1_OPERATION.PULL]: 300_000,
  [C1_OPERATION.CREATE]: 30_000,
  [C1_OPERATION.START]: 30_000,
  [C1_OPERATION.INSPECT]: 30_000,
  [C1_OPERATION.STOP]: 30_000,
  [C1_OPERATION.REMOVE]: 30_000,
});
const RESULT_STATUS = Object.freeze({
  COMPLETED: 'completed',
  ALREADY_APPLIED: 'already_applied',
  ALREADY_ABSENT: 'already_absent',
  REJECTED: 'rejected',
  RETRYABLE_FAILURE: 'retryable_failure',
  AMBIGUOUS: 'ambiguous',
});
const RESULT_STATUSES = new Set(Object.values(RESULT_STATUS));
const CLEANUP_STATE = new Set([
  'not_required',
  'completed',
  'retryable',
  'ambiguous',
]);
const [CLEANUP_NOT_REQUIRED, CLEANUP_COMPLETED] = CLEANUP_STATE;
const CONTAINER_STATE = new Set(['created', 'running', 'exited']);
const REJECTED_ERROR_CODE = new Set([
  'invalid_request',
  'deadline_invalid',
  'unsupported_operation',
  'policy_denied',
  'credential_unavailable',
  'digest_mismatch',
  'identity_conflict',
  'intent_conflict',
  'resource_conflict',
  'receipt_capacity_exhausted',
]);
const RETRYABLE_ERROR_CODE = new Set([
  'agent_busy',
  'operation_in_progress',
  'deadline_before_dispatch',
  'queue_deadline_expired',
  'engine_unavailable',
  'engine_failure',
  'cleanup_incomplete',
]);
const AMBIGUOUS_ERROR_CODE = new Set([
  'deadline_after_dispatch',
  'transport_outcome_unknown',
  'engine_outcome_unknown',
  'receipt_unavailable',
  'resource_fenced',
]);
const FENCE_STATE = new Set(['none', 'mutation_unresolved']);

const MAXIMUM = Object.freeze({
  OWNER_ID_BYTES: 255,
  OPERATION_ID_BYTES: 128,
  KEY_ID_BYTES: 128,
  AGENT_ID_BYTES: 128,
  ARTIFACT_REF_BYTES: 2_048,
  ENTRYPOINT_ITEMS: 32,
  ARG_ITEMS: 128,
  COMMAND_ITEM_BYTES: 4_096,
  ENVIRONMENT_ITEMS: 128,
  SECRET_ITEMS: 32,
  ENVIRONMENT_VALUE_BYTES: 8_192,
  PORT_ITEMS: 32,
  CONTAINER_PORT: 65_535,
  CPU_MILLIS: 1_000_000,
  MEMORY_BYTES: 1_099_511_627_776,
  GRACE_MS: 30_000,
  DIGEST_BYTES: 71,
  ENVIRONMENT_KEY_BYTES: 128,
  REQUEST_ID_BYTES: 36,
  NONCE_BYTES: 32,
  CONTAINER_ID_BYTES: 64,
});
const MINIMUM_MEMORY_BYTES = 1_048_576;

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function fail(code = OCI_HOST_AGENT_PROTOCOL_ERROR.INVALID_FIELD) {
  protocolError(code);
}

function hasOwn(value, field) {
  return Object.prototype.hasOwnProperty.call(value, field);
}

function assertNoNull(value) {
  if (value === null) fail(OCI_HOST_AGENT_PROTOCOL_ERROR.NULL_NOT_ALLOWED);
  if (Array.isArray(value)) {
    for (const entry of value) assertNoNull(entry);
  } else if (isPlainObject(value)) {
    for (const entry of Object.values(value)) assertNoNull(entry);
  }
}

function assertExactObject(value, requiredFields, optionalFields = []) {
  if (!isPlainObject(value)) fail();
  const accepted = new Set([...requiredFields, ...optionalFields]);
  for (const field of Object.keys(value)) {
    if (!accepted.has(field)) {
      fail(OCI_HOST_AGENT_PROTOCOL_ERROR.UNKNOWN_FIELD);
    }
  }
  for (const field of requiredFields) {
    if (!hasOwn(value, field)) {
      fail(OCI_HOST_AGENT_PROTOCOL_ERROR.MISSING_FIELD);
    }
  }
}

function assertCleanString(value, options = {}) {
  if (typeof value !== 'string') fail();
  if (SURROGATE_PATTERN.test(value)) fail();
  if (CONTROL_PATTERN.test(value)) fail();
  const minimumBytes = options.minimumBytes ?? 1;
  const maximumBytes = options.maximumBytes;
  const bytes = Buffer.byteLength(value, 'utf8');
  if (bytes < minimumBytes || bytes > maximumBytes) fail();
  if (options.pattern && !options.pattern.test(value)) fail();
}

function assertSafeInteger(value, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) fail();
}

function assertEnum(value, accepted) {
  if (!accepted.has(value)) fail();
}

function assertCanonicalBase64(value, decodedBytes) {
  if (typeof value !== 'string' ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u
        .test(value)) {
    fail();
  }
  const decoded = Buffer.from(value, BASE64_ENCODING);
  if (decoded.length !== decodedBytes ||
      decoded.toString(BASE64_ENCODING) !== value) {
    fail();
  }
}

function assertOwnerId(value, maximumBytes = MAXIMUM.OWNER_ID_BYTES) {
  assertCleanString(value, {
    maximumBytes,
    pattern: OWNER_ID_PATTERN,
  });
}

function assertKeyId(value) {
  assertCleanString(value, {
    maximumBytes: MAXIMUM.KEY_ID_BYTES,
    pattern: KEY_ID_PATTERN,
  });
}

function assertDigest(value) {
  assertCleanString(value, {
    maximumBytes: MAXIMUM.DIGEST_BYTES,
    pattern: SHA256_PATTERN,
  });
}

function validatePullPayload(payload) {
  assertExactObject(
    payload,
    [FIELD.ARTIFACT_REF, FIELD.EXPECTED_DIGEST],
    [FIELD.REGISTRY_CREDENTIAL_ID],
  );
  assertCleanString(payload.artifactRef, {
    maximumBytes: MAXIMUM.ARTIFACT_REF_BYTES,
    pattern: ARTIFACT_REF_PATTERN,
  });
  assertDigest(payload.expectedDigest);
  const embeddedDigest = payload.artifactRef.slice(
    payload.artifactRef.lastIndexOf('@') + 1,
  );
  if (embeddedDigest !== payload.expectedDigest) fail();
  if (hasOwn(payload, FIELD.REGISTRY_CREDENTIAL_ID)) {
    assertKeyId(payload.registryCredentialId);
  }
}

function validateStringArray(value, options) {
  if (!Array.isArray(value) || value.length < options.minimumItems ||
      value.length > options.maximumItems) {
    fail();
  }
  for (const entry of value) {
    assertCleanString(entry, {
      minimumBytes: options.minimumBytes,
      maximumBytes: MAXIMUM.COMMAND_ITEM_BYTES,
    });
  }
}

function validateEnvironmentMap(value, secret) {
  if (!isPlainObject(value)) fail();
  for (const [key, entry] of Object.entries(value)) {
    assertCleanString(key, {
      maximumBytes: MAXIMUM.ENVIRONMENT_KEY_BYTES,
      pattern: ENVIRONMENT_KEY_PATTERN,
    });
    if (secret) {
      assertKeyId(entry);
    } else {
      assertCleanString(entry, {
        minimumBytes: 0,
        maximumBytes: MAXIMUM.ENVIRONMENT_VALUE_BYTES,
      });
    }
  }
}

function validateEnvironment(environment) {
  assertExactObject(environment, [], [FIELD.VALUES, FIELD.SECRET_REFS]);
  const values = hasOwn(environment, FIELD.VALUES) ? environment.values : {};
  const secretRefs = hasOwn(environment, FIELD.SECRET_REFS) ?
    environment.secretRefs : {};
  validateEnvironmentMap(values, false);
  validateEnvironmentMap(secretRefs, true);
  const valueKeys = Object.keys(values);
  const secretKeys = Object.keys(secretRefs);
  if (valueKeys.length + secretKeys.length > MAXIMUM.ENVIRONMENT_ITEMS ||
      secretKeys.length > MAXIMUM.SECRET_ITEMS) {
    fail();
  }
  const valueKeySet = new Set(valueKeys);
  if (secretKeys.some((key) => valueKeySet.has(key))) fail();
}

function validatePorts(ports) {
  if (!Array.isArray(ports) || ports.length > MAXIMUM.PORT_ITEMS) fail();
  const seen = new Set();
  for (const port of ports) {
    assertExactObject(port, [FIELD.PROTOCOL, FIELD.CONTAINER_PORT]);
    assertEnum(port.protocol, PORT_PROTOCOLS);
    assertSafeInteger(port.containerPort, 1, MAXIMUM.CONTAINER_PORT);
    const identity = `${port.protocol}:${port.containerPort}`;
    if (seen.has(identity)) fail();
    seen.add(identity);
  }
}

function validateResources(resources) {
  assertExactObject(resources, [], [FIELD.CPU_MILLIS, FIELD.MEMORY_BYTES]);
  if (!hasOwn(resources, FIELD.CPU_MILLIS) &&
      !hasOwn(resources, FIELD.MEMORY_BYTES)) fail();
  if (hasOwn(resources, FIELD.CPU_MILLIS)) {
    assertSafeInteger(resources.cpuMillis, 1, MAXIMUM.CPU_MILLIS);
  }
  if (hasOwn(resources, FIELD.MEMORY_BYTES)) {
    assertSafeInteger(
      resources.memoryBytes,
      MINIMUM_MEMORY_BYTES,
      MAXIMUM.MEMORY_BYTES,
    );
  }
}

function validateCreatePayload(payload) {
  assertExactObject(
    payload,
    [FIELD.IMAGE_DIGEST, FIELD.RUNTIME_CONFIG_DIGEST],
    [
      FIELD.ENTRYPOINT,
      FIELD.ARGS,
      FIELD.ENVIRONMENT,
      FIELD.PORTS,
      FIELD.RESOURCES,
    ],
  );
  assertDigest(payload.imageDigest);
  assertDigest(payload.runtimeConfigDigest);
  if (hasOwn(payload, FIELD.ENTRYPOINT)) {
    validateStringArray(payload.entrypoint, {
      minimumItems: 1,
      maximumItems: MAXIMUM.ENTRYPOINT_ITEMS,
      minimumBytes: 1,
    });
  }
  if (hasOwn(payload, FIELD.ARGS)) {
    validateStringArray(payload.args, {
      minimumItems: 0,
      maximumItems: MAXIMUM.ARG_ITEMS,
      minimumBytes: 0,
    });
  }
  if (hasOwn(payload, FIELD.ENVIRONMENT)) validateEnvironment(payload.environment);
  if (hasOwn(payload, FIELD.PORTS)) validatePorts(payload.ports);
  if (hasOwn(payload, FIELD.RESOURCES)) validateResources(payload.resources);
}

function validateEmptyPayload(payload) {
  assertExactObject(payload, []);
}

function validateStopPayload(payload, envelope) {
  assertExactObject(payload, [], [FIELD.GRACE_MS]);
  if (!hasOwn(payload, FIELD.GRACE_MS)) return;
  assertSafeInteger(payload.graceMs, 0, MAXIMUM.GRACE_MS);
  if (payload.graceMs > envelope.deadlineAtMs - envelope.issuedAtMs) fail();
}

function validateRequestPayload(envelope) {
  const validators = Object.freeze({
    [C1_OPERATION.PULL]: () => validatePullPayload(envelope.payload),
    [C1_OPERATION.CREATE]: () => validateCreatePayload(envelope.payload),
    [C1_OPERATION.START]: () => validateEmptyPayload(envelope.payload),
    [C1_OPERATION.INSPECT]: () => validateEmptyPayload(envelope.payload),
    [C1_OPERATION.STOP]: () => validateStopPayload(envelope.payload, envelope),
    [C1_OPERATION.REMOVE]: () => validateEmptyPayload(envelope.payload),
  });
  validators[envelope.operation]();
}

function validateOciHostAgentRequestEnvelope(envelope) {
  assertNoNull(envelope);
  assertExactObject(envelope, REQUEST_FIELDS);
  if (envelope.protocolVersion !== PROTOCOL_VERSION) fail();
  assertCleanString(envelope.requestId, {
    maximumBytes: MAXIMUM.REQUEST_ID_BYTES,
    pattern: UUID_PATTERN,
  });
  assertOwnerId(envelope.operationId, MAXIMUM.OPERATION_ID_BYTES);
  assertKeyId(envelope.keyId);
  assertSafeInteger(envelope.issuedAtMs, 0, Number.MAX_SAFE_INTEGER);
  assertSafeInteger(envelope.deadlineAtMs, 0, Number.MAX_SAFE_INTEGER);
  assertCanonicalBase64(envelope.nonce, MAXIMUM.NONCE_BYTES);
  for (const field of IDENTITY_FIELDS) assertOwnerId(envelope[field]);
  assertEnum(envelope.operation, C1_OPERATIONS);
  const duration = envelope.deadlineAtMs - envelope.issuedAtMs;
  if (duration <= 0 || duration > OPERATION_MAXIMUM_MS[envelope.operation]) fail();
  validateRequestPayload(envelope);
  return envelope;
}

function validateIdentity(identity) {
  assertExactObject(identity, IDENTITY_FIELDS);
  for (const field of IDENTITY_FIELDS) assertOwnerId(identity[field]);
}

function validateOciHostAgentCallerIdentity(identity) {
  assertExactObject(identity, [FIELD.CLUSTER_INCARNATION, FIELD.NODE_ID]);
  assertOwnerId(identity.clusterIncarnation);
  assertOwnerId(identity.nodeId);
  return identity;
}

function validateStableLabels(labels, identity) {
  assertExactObject(labels, STABLE_LABEL_FIELDS);
  if (labels[MANAGED_LABEL] !== MANAGED_LABEL_VALUE) fail();
  const identityLabels = Object.freeze({
    clusterIncarnation: 'io.lagrange.cluster_incarnation',
    nodeId: 'io.lagrange.node_id',
    serviceId: 'io.lagrange.service_id',
    revisionId: 'io.lagrange.revision_id',
    instanceId: 'io.lagrange.instance_id',
  });
  for (const [identityField, labelField] of Object.entries(identityLabels)) {
    assertOwnerId(labels[labelField]);
    if (labels[labelField] !== identity[identityField]) fail();
  }
  assertDigest(labels[IMAGE_DIGEST_LABEL]);
  assertDigest(labels[RUNTIME_CONFIG_DIGEST_LABEL]);
  assertOwnerId(
    labels[CREATE_OPERATION_LABEL],
    MAXIMUM.OPERATION_ID_BYTES,
  );
  assertDigest(labels[CREATE_INTENT_LABEL]);
}

function validateCleanup(cleanup, identity) {
  assertExactObject(cleanup, [FIELD.STATE, FIELD.RESIDUAL_RESOURCES]);
  assertEnum(cleanup.state, CLEANUP_STATE);
  if (!Array.isArray(cleanup.residualResources) ||
      cleanup.residualResources.length > 1) {
    fail();
  }
  if ((cleanup.state === CLEANUP_NOT_REQUIRED ||
      cleanup.state === CLEANUP_COMPLETED) &&
      cleanup.residualResources.length !== 0) {
    fail();
  }
  for (const resource of cleanup.residualResources) {
    assertExactObject(resource, [FIELD.CONTAINER_ID, FIELD.LABELS]);
    assertCleanString(resource.containerId, {
      maximumBytes: MAXIMUM.CONTAINER_ID_BYTES,
      pattern: CONTAINER_ID_PATTERN,
    });
    validateStableLabels(resource.labels, identity);
  }
}

function validateCreateCleanupProvenance(result, envelope) {
  if (result.operation !== C1_OPERATION.CREATE) return;
  for (const resource of result.cleanup.residualResources) {
    if (resource.labels[CREATE_OPERATION_LABEL] !==
        envelope.operationId ||
        resource.labels[CREATE_INTENT_LABEL] !==
        result.intentDigest) {
      fail();
    }
  }
}

function validateObservation(observation, identity) {
  if (!isPlainObject(observation) || typeof observation.kind !== 'string') fail();
  if (observation.kind === NOT_OBSERVED) {
    assertExactObject(observation, [FIELD.KIND]);
    return;
  }
  if (observation.kind === IMAGE_KIND) {
    assertExactObject(observation, [FIELD.KIND, FIELD.IMAGE_DIGEST]);
    assertDigest(observation.imageDigest);
    return;
  }
  if (observation.kind === ABSENCE_KIND) {
    assertExactObject(observation, [FIELD.KIND, FIELD.STATE]);
    if (observation.state !== ABSENCE_STATE) fail();
    return;
  }
  if (observation.kind !== CONTAINER_KIND) fail();
  assertExactObject(observation, [
    FIELD.KIND,
    FIELD.CONTAINER_ID,
    FIELD.STATE,
    FIELD.LABELS,
    FIELD.IMAGE_DIGEST,
    FIELD.RUNTIME_CONFIG_DIGEST,
  ]);
  assertCleanString(observation.containerId, {
    maximumBytes: MAXIMUM.CONTAINER_ID_BYTES,
    pattern: CONTAINER_ID_PATTERN,
  });
  assertEnum(observation.state, CONTAINER_STATE);
  assertDigest(observation.imageDigest);
  assertDigest(observation.runtimeConfigDigest);
  validateStableLabels(observation.labels, identity);
  if (observation.labels[IMAGE_DIGEST_LABEL] !==
      observation.imageDigest ||
      observation.labels[RUNTIME_CONFIG_DIGEST_LABEL] !==
      observation.runtimeConfigDigest) {
    fail();
  }
}

function assertSuccessfulObservationMapping(operation, observation) {
  const expected = Object.freeze({
    [C1_OPERATION.PULL]: ['image'],
    [C1_OPERATION.CREATE]: ['container', 'created'],
    [C1_OPERATION.START]: ['container', 'running'],
    [C1_OPERATION.INSPECT]: ['container'],
    [C1_OPERATION.STOP]: ['container', 'exited'],
    [C1_OPERATION.REMOVE]: ['absence'],
  })[operation];
  if (observation.kind !== expected[0]) fail();
  if (expected.length === 2 && observation.state !== expected[1]) fail();
}

function validateResultCommon(result) {
  assertEnum(result.status, RESULT_STATUSES);
  assertEnum(result.operation, C1_OPERATIONS);
  assertDigest(result.intentDigest);
  validateIdentity(result.identity);
  validateCleanup(result.cleanup, result.identity);
}

function validateSuccessfulResult(result, envelope) {
  assertExactObject(result, [...RESULT_COMMON_FIELDS, FIELD.OBSERVATION]);
  validateResultCommon(result);
  validateObservation(result.observation, result.identity);
  assertSuccessfulObservationMapping(result.operation, result.observation);
  if (result.status === RESULT_STATUS.ALREADY_APPLIED &&
      (result.operation === C1_OPERATION.INSPECT ||
       result.operation === C1_OPERATION.REMOVE)) {
    fail();
  }
  if (result.operation === C1_OPERATION.CREATE) {
    if (result.observation.labels[CREATE_OPERATION_LABEL] !==
        envelope.operationId ||
        result.observation.labels[CREATE_INTENT_LABEL] !==
        result.intentDigest) {
      fail();
    }
  }
}

function validateAlreadyAbsentResult(result) {
  assertExactObject(result, [...RESULT_COMMON_FIELDS, FIELD.OBSERVATION]);
  validateResultCommon(result);
  if (result.operation !== C1_OPERATION.STOP &&
      result.operation !== C1_OPERATION.REMOVE) {
    fail();
  }
  validateObservation(result.observation, result.identity);
  if (result.observation.kind !== ABSENCE_KIND) fail();
}

function validateRejectedResult(result) {
  assertExactObject(result, [...RESULT_COMMON_FIELDS, FIELD.ERROR_CODE]);
  validateResultCommon(result);
  assertEnum(result.errorCode, REJECTED_ERROR_CODE);
}

function validateRetryableResult(result) {
  assertExactObject(result, [
    ...RESULT_COMMON_FIELDS,
    FIELD.ERROR_CODE,
    FIELD.LAST_OBSERVATION,
  ]);
  validateResultCommon(result);
  assertEnum(result.errorCode, RETRYABLE_ERROR_CODE);
  validateObservation(result.lastObservation, result.identity);
}

function validateAmbiguousResult(result) {
  assertExactObject(result, [
    ...RESULT_COMMON_FIELDS,
    FIELD.ERROR_CODE,
    FIELD.LAST_OBSERVATION,
    FIELD.FENCE_STATE,
  ]);
  validateResultCommon(result);
  assertEnum(result.errorCode, AMBIGUOUS_ERROR_CODE);
  assertEnum(result.fenceState, FENCE_STATE);
  validateObservation(result.lastObservation, result.identity);
}

function validateResult(result, envelope) {
  if (!isPlainObject(result) || typeof result.status !== 'string') fail();
  const validators = Object.freeze({
    [RESULT_STATUS.COMPLETED]: () => validateSuccessfulResult(result, envelope),
    [RESULT_STATUS.ALREADY_APPLIED]: () =>
      validateSuccessfulResult(result, envelope),
    [RESULT_STATUS.ALREADY_ABSENT]: () => validateAlreadyAbsentResult(result),
    [RESULT_STATUS.REJECTED]: () => validateRejectedResult(result),
    [RESULT_STATUS.RETRYABLE_FAILURE]: () => validateRetryableResult(result),
    [RESULT_STATUS.AMBIGUOUS]: () => validateAmbiguousResult(result),
  });
  const validate = validators[result.status];
  if (!validate) fail();
  validate();
  validateCreateCleanupProvenance(result, envelope);
}

function validateOciHostAgentResponseEnvelope(envelope) {
  assertNoNull(envelope);
  assertExactObject(envelope, RESPONSE_FIELDS);
  if (envelope.protocolVersion !== PROTOCOL_VERSION) fail();
  assertCleanString(envelope.requestId, {
    maximumBytes: MAXIMUM.REQUEST_ID_BYTES,
    pattern: UUID_PATTERN,
  });
  assertOwnerId(envelope.operationId, MAXIMUM.OPERATION_ID_BYTES);
  assertKeyId(envelope.keyId);
  assertOwnerId(envelope.agentId, MAXIMUM.AGENT_ID_BYTES);
  assertSafeInteger(envelope.completedAtMs, 0, Number.MAX_SAFE_INTEGER);
  validateResult(envelope.result, envelope);
  return envelope;
}

export {
  validateOciHostAgentCallerIdentity,
  validateOciHostAgentRequestEnvelope,
  validateOciHostAgentResponseEnvelope,
};
