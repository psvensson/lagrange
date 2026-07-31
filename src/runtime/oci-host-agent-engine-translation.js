/**
 * OCI host-agent Engine translation for the six C1 operations.
 *
 * Sole Engine-facing translation consumed by the agent dispatch
 * orchestrator inside the held resource gate and receipt/fence
 * sequence (oci-runtime-host-contract.md "Idempotency, cleanup,
 * and restart posture"): fence install precedes observe() for
 * mutating operations; classifyPreDispatch and
 * classifyPostMutation are synchronous; mutate() invokes exactly
 * one Engine call synchronously on entry.
 *
 * @module runtime/oci-host-agent-engine-translation
 */

import {
  validateOciHostAgentResult,
} from './oci-host-agent-schema.js';
import {
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
} from './oci-host-agent-engine-identity.js';

const OPERATION = Object.freeze({
  PULL: 'pull',
  CREATE: 'create',
  START: 'start',
  INSPECT: 'inspect',
  STOP: 'stop',
  REMOVE: 'remove',
});

const SNAPSHOT_KIND = Object.freeze({
  IMAGE: 'image',
  CONTAINERS: 'containers',
  ENGINE_ERROR: 'engine_error',
});

const PLAN_KIND = Object.freeze({
  PULL_IMAGE: 'pull_image',
  CREATE_CONTAINER: 'create_container',
  START_CONTAINER: 'start_container',
  STOP_CONTAINER: 'stop_container',
  REMOVE_CONTAINER: 'remove_container',
});

const DECISION_KIND = Object.freeze({
  RESULT: 'result',
  MUTATE: 'mutate',
});

const INPUT_FIELD = Object.freeze({
  INPUT: 'input',
  OPERATION: 'operation',
  OPERATION_ID: 'operationId',
  INTENT_DIGEST: 'intentDigest',
  NOW_MS: 'nowMs',
  DEADLINE_AT_MS: 'deadlineAtMs',
  PAYLOAD: 'payload',
  FENCE_STATE: 'fenceState',
  SNAPSHOT: 'snapshot',
  POST_SNAPSHOT: 'postSnapshot',
  PLAN: 'plan',
  POLICY: 'policy',
  IMAGE_DIGEST: 'imageDigest',
  RUNTIME_CONFIG_DIGEST: 'runtimeConfigDigest',
  CREATE_OPERATION_ID: 'createOperationId',
  CREATE_INTENT_DIGEST: 'createIntentDigest',
});

const PAYLOAD_FIELD = Object.freeze({
  REGISTRY_CREDENTIAL_ID: 'registryCredentialId',
  CPU_MILLIS: 'cpuMillis',
  MEMORY_BYTES: 'memoryBytes',
  ENTRYPOINT: 'entrypoint',
  ARGS: 'args',
  VALUES: 'values',
  SECRET_REFS: 'secretRefs',
  PORTS: 'ports',
  GRACE_MS: 'graceMs',
});

const METHOD_LIST_SEPARATOR = ', ';
const FENCE_STATES = new Set(['none', 'mutation_unresolved']);
const RETRYABLE_ENGINE_CODES = new Set([
  ERROR_CODE.ENGINE_UNAVAILABLE,
  ERROR_CODE.ENGINE_FAILURE,
]);
const PORT_PROTOCOLS = new Set(['tcp', 'udp']);

const ENGINE_METHODS = Object.freeze([
  'pullImage',
  'inspectImage',
  'listManagedContainers',
  'inspectContainer',
  'createContainer',
  'startContainer',
  'stopContainer',
  'removeContainer',
]);

const POLICY_LIMIT = Object.freeze({
  MINIMUM_CPU_MILLIS: 1,
  MAXIMUM_CPU_MILLIS: 1_000_000,
  MINIMUM_MEMORY_BYTES: 1_048_576,
  MAXIMUM_MEMORY_BYTES: 1_099_511_627_776,
});

function validateEngine(engine) {
  if (!isPlainObject(engine)) {
    throw translationError(
      ENGINE_TRANSLATION_ERROR.ENGINE_METHOD_MISSING,
      ENGINE_METHODS.join(METHOD_LIST_SEPARATOR));
  }
  for (const name of ENGINE_METHODS) {
    if (typeof engine[name] !== 'function') {
      throw translationError(
        ENGINE_TRANSLATION_ERROR.ENGINE_METHOD_MISSING, name);
    }
  }
  return engine;
}

function validateStringList(value, allowed) {
  return Array.isArray(value) &&
    value.every((entry) => isNonEmptyString(entry) &&
      (!allowed || allowed.has(entry)));
}

function validatePolicy(policy) {
  if (!isPlainObject(policy)) {
    throw translationError(
      ENGINE_TRANSLATION_ERROR.POLICY_FIELD_INVALID, INPUT_FIELD.POLICY);
  }
  const valid = {
    workloadNetwork: isNonEmptyString(policy.workloadNetwork),
    allowedEnvironmentNames:
      validateStringList(policy.allowedEnvironmentNames),
    allowedPortProtocols:
      validateStringList(policy.allowedPortProtocols, PORT_PROTOCOLS),
    maximumCpuMillis: isBoundedSafeInteger(policy.maximumCpuMillis,
      POLICY_LIMIT.MINIMUM_CPU_MILLIS, POLICY_LIMIT.MAXIMUM_CPU_MILLIS),
    maximumMemoryBytes: isBoundedSafeInteger(policy.maximumMemoryBytes,
      POLICY_LIMIT.MINIMUM_MEMORY_BYTES,
      POLICY_LIMIT.MAXIMUM_MEMORY_BYTES),
  };
  for (const [field, ok] of Object.entries(valid)) {
    if (!ok) {
      throw translationError(
        ENGINE_TRANSLATION_ERROR.POLICY_FIELD_INVALID, field);
    }
  }
  return Object.freeze({
    workloadNetwork: policy.workloadNetwork,
    allowedEnvironmentNames: new Set(policy.allowedEnvironmentNames),
    allowedPortProtocols: new Set(policy.allowedPortProtocols),
    maximumCpuMillis: policy.maximumCpuMillis,
    maximumMemoryBytes: policy.maximumMemoryBytes,
  });
}

function collapseEngineErrorCode(error) {
  if (isPlainObject(error) || error instanceof Error) {
    const code = error.code;
    if (RETRYABLE_ENGINE_CODES.has(code)) return code;
  }
  return ERROR_CODE.ENGINE_FAILURE;
}

function terminal(context, result) {
  validateOciHostAgentResult(result, context.operationId);
  return {kind: DECISION_KIND.RESULT, result};
}

function mutation(plan) {
  return {kind: DECISION_KIND.MUTATE, plan};
}

function rejectedTargetDecision(context, target) {
  const errorCode = target.kind === TARGET.INVALID ?
    ERROR_CODE.IDENTITY_CONFLICT :
    ERROR_CODE.RESOURCE_CONFLICT;
  return terminal(context, rejectedResult(context, errorCode));
}

function classifyPullPre(context, payload, snapshot) {
  const image = snapshot.image;
  if (!image.present) {
    const request = {artifactRef: payload.artifactRef};
    if (Object.hasOwn(payload, PAYLOAD_FIELD.REGISTRY_CREDENTIAL_ID)) {
      request.registryCredentialId = payload.registryCredentialId;
    }
    return mutation({kind: PLAN_KIND.PULL_IMAGE, request});
  }
  if (image.imageDigest === payload.expectedDigest) {
    return terminal(context, successResult(context,
      RESULT_STATUS.ALREADY_APPLIED,
      imageObservation(image.imageDigest)));
  }
  return terminal(context,
    rejectedResult(context, ERROR_CODE.DIGEST_MISMATCH));
}

function createPolicyViolation(policy, payload) {
  const resources = payload.resources;
  if (isPlainObject(resources) &&
      ((Object.hasOwn(resources, PAYLOAD_FIELD.CPU_MILLIS) &&
        resources.cpuMillis > policy.maximumCpuMillis) ||
       (Object.hasOwn(resources, PAYLOAD_FIELD.MEMORY_BYTES) &&
        resources.memoryBytes > policy.maximumMemoryBytes))) {
    return true;
  }
  const environment = isPlainObject(payload.environment) ?
    payload.environment : {};
  const names = [
    ...Object.keys(isPlainObject(environment.values) ?
      environment.values : {}),
    ...Object.keys(isPlainObject(environment.secretRefs) ?
      environment.secretRefs : {}),
  ];
  if (names.some((name) => !policy.allowedEnvironmentNames.has(name))) {
    return true;
  }
  const ports = Array.isArray(payload.ports) ? payload.ports : [];
  return ports.some((port) =>
    !policy.allowedPortProtocols.has(port.protocol));
}

function createEngineConfig(policy, payload) {
  const config = {
    imageDigest: payload.imageDigest,
    network: policy.workloadNetwork,
    resources: isPlainObject(payload.resources) ?
      {...payload.resources} :
      {
        cpuMillis: policy.maximumCpuMillis,
        memoryBytes: policy.maximumMemoryBytes,
      },
  };
  if (Object.hasOwn(payload, PAYLOAD_FIELD.ENTRYPOINT)) {
    config.entrypoint = [...payload.entrypoint];
  }
  if (Object.hasOwn(payload, PAYLOAD_FIELD.ARGS)) {
    config.args = [...payload.args];
  }
  const environment = isPlainObject(payload.environment) ?
    payload.environment : {};
  if (Object.hasOwn(environment, PAYLOAD_FIELD.VALUES)) {
    config.environmentValues = {...environment.values};
  }
  if (Object.hasOwn(environment, PAYLOAD_FIELD.SECRET_REFS)) {
    config.environmentSecretRefs = {...environment.secretRefs};
  }
  if (Object.hasOwn(payload, PAYLOAD_FIELD.PORTS)) {
    config.ports = payload.ports.map((port) => ({...port}));
  }
  return config;
}

function classifyCreateMatch(context, payload, match) {
  const labels = match.labels;
  if (labels[LABEL.CREATE_INTENT_DIGEST] !== context.intentDigest) {
    return terminal(context,
      rejectedResult(context, ERROR_CODE.INTENT_CONFLICT));
  }
  if (labels[LABEL.IMAGE_DIGEST] !== payload.imageDigest ||
      labels[LABEL.RUNTIME_CONFIG_DIGEST] !== payload.runtimeConfigDigest) {
    return terminal(context,
      rejectedResult(context, ERROR_CODE.IDENTITY_CONFLICT));
  }
  if (labels[LABEL.CREATE_OPERATION_ID] !== context.operationId ||
      match.state !== CONTAINER_STATE.CREATED) {
    return terminal(context,
      rejectedResult(context, ERROR_CODE.RESOURCE_CONFLICT));
  }
  return terminal(context, successResult(context,
    RESULT_STATUS.ALREADY_APPLIED, containerObservation(match)));
}

function classifyCreatePre(context, payload, snapshot, policy) {
  const target = resolveTarget(context.identity, snapshot);
  if (target.kind === TARGET.RESOLVED) {
    return classifyCreateMatch(context, payload, target.match);
  }
  if (target.kind !== TARGET.ABSENT) {
    return rejectedTargetDecision(context, target);
  }
  if (createPolicyViolation(policy, payload)) {
    return terminal(context,
      rejectedResult(context, ERROR_CODE.POLICY_DENIED));
  }
  return mutation({
    kind: PLAN_KIND.CREATE_CONTAINER,
    request: {
      labels: buildStableLabels(copyIdentity(context.identity),
        payload.imageDigest, payload.runtimeConfigDigest,
        context.operationId, context.intentDigest),
      config: createEngineConfig(policy, payload),
    },
  });
}

function classifyStartPre(context, payload, snapshot) {
  const target = resolveTarget(context.identity, snapshot);
  if (target.kind !== TARGET.RESOLVED) {
    return rejectedTargetDecision(context, target);
  }
  if (target.match.state === CONTAINER_STATE.RUNNING) {
    return terminal(context, successResult(context,
      RESULT_STATUS.ALREADY_APPLIED,
      containerObservation(target.match)));
  }
  return mutation({
    kind: PLAN_KIND.START_CONTAINER,
    request: {containerId: target.match.containerId},
  });
}

function classifyInspectPre(context, payload, snapshot) {
  const target = resolveTarget(context.identity, snapshot);
  if (target.kind !== TARGET.RESOLVED) {
    return rejectedTargetDecision(context, target);
  }
  return terminal(context, successResult(context,
    RESULT_STATUS.COMPLETED, containerObservation(target.match)));
}

function classifyStopPre(context, payload, snapshot) {
  const target = resolveTarget(context.identity, snapshot);
  if (target.kind === TARGET.ABSENT) {
    return terminal(context, successResult(context,
      RESULT_STATUS.ALREADY_ABSENT, absenceObservation()));
  }
  if (target.kind !== TARGET.RESOLVED) {
    return rejectedTargetDecision(context, target);
  }
  if (target.match.state === CONTAINER_STATE.EXITED) {
    return terminal(context, successResult(context,
      RESULT_STATUS.ALREADY_APPLIED,
      containerObservation(target.match)));
  }
  const request = {containerId: target.match.containerId};
  if (Object.hasOwn(payload, PAYLOAD_FIELD.GRACE_MS)) {
    if (payload.graceMs > context.deadlineAtMs - context.nowMs) {
      return terminal(context,
        rejectedResult(context, ERROR_CODE.DEADLINE_INVALID));
    }
    request.graceMs = payload.graceMs;
  }
  return mutation({kind: PLAN_KIND.STOP_CONTAINER, request});
}

function classifyRemovePre(context, payload, snapshot) {
  const target = resolveTarget(context.identity, snapshot);
  if (target.kind === TARGET.ABSENT) {
    return terminal(context, successResult(context,
      RESULT_STATUS.ALREADY_ABSENT, absenceObservation()));
  }
  if (target.kind !== TARGET.RESOLVED) {
    return rejectedTargetDecision(context, target);
  }
  if (target.match.state === CONTAINER_STATE.RUNNING) {
    return terminal(context,
      rejectedResult(context, ERROR_CODE.RESOURCE_CONFLICT));
  }
  return mutation({
    kind: PLAN_KIND.REMOVE_CONTAINER,
    request: {containerId: target.match.containerId},
  });
}

const PRE_DISPATCH_TABLE = Object.freeze({
  [OPERATION.PULL]: classifyPullPre,
  [OPERATION.CREATE]: classifyCreatePre,
  [OPERATION.START]: classifyStartPre,
  [OPERATION.INSPECT]: classifyInspectPre,
  [OPERATION.STOP]: classifyStopPre,
  [OPERATION.REMOVE]: classifyRemovePre,
});

function classifyPullPost(context, payload, snapshot) {
  const image = snapshot.image;
  if (image.present && image.imageDigest === payload.expectedDigest) {
    return successResult(context, RESULT_STATUS.COMPLETED,
      imageObservation(image.imageDigest));
  }
  const lastObservation = image.present ?
    imageObservation(image.imageDigest) : notObserved();
  return ambiguousResult(context, lastObservation);
}

function classifyCreatePost(context, payload, snapshot) {
  const target = resolveTarget(context.identity, snapshot);
  if (target.kind === TARGET.RESOLVED) {
    const labels = target.match.labels;
    if (labels[LABEL.CREATE_OPERATION_ID] === context.operationId &&
        labels[LABEL.CREATE_INTENT_DIGEST] === context.intentDigest &&
        labels[LABEL.IMAGE_DIGEST] === payload.imageDigest &&
        labels[LABEL.RUNTIME_CONFIG_DIGEST] ===
          payload.runtimeConfigDigest &&
        target.match.state === CONTAINER_STATE.CREATED) {
      return successResult(context, RESULT_STATUS.COMPLETED,
        containerObservation(target.match));
    }
    return ambiguousResult(context, containerObservation(target.match),
      createResidualCleanup(context, target.match));
  }
  return ambiguousResult(context, notObserved());
}

function classifyStatePost(desiredState) {
  return (context, payload, snapshot) => {
    const target = resolveTarget(context.identity, snapshot);
    if (target.kind === TARGET.RESOLVED) {
      if (target.match.state === desiredState) {
        return successResult(context, RESULT_STATUS.COMPLETED,
          containerObservation(target.match));
      }
      return ambiguousResult(context,
        containerObservation(target.match));
    }
    if (target.kind === TARGET.ABSENT) {
      return ambiguousResult(context, absenceObservation());
    }
    return ambiguousResult(context, notObserved());
  };
}

function classifyRemovePost(context, payload, snapshot) {
  const target = resolveTarget(context.identity, snapshot);
  if (target.kind === TARGET.ABSENT) {
    return successResult(context, RESULT_STATUS.COMPLETED,
      absenceObservation());
  }
  if (target.kind === TARGET.RESOLVED) {
    return ambiguousResult(context,
      containerObservation(target.match));
  }
  return ambiguousResult(context, notObserved());
}

const POST_MUTATION_TABLE = Object.freeze({
  [OPERATION.PULL]: classifyPullPost,
  [OPERATION.CREATE]: classifyCreatePost,
  [OPERATION.START]: classifyStatePost(CONTAINER_STATE.RUNNING),
  [OPERATION.STOP]: classifyStatePost(CONTAINER_STATE.EXITED),
  [OPERATION.REMOVE]: classifyRemovePost,
});

const MUTATION_DISPATCH_TABLE = Object.freeze({
  [PLAN_KIND.PULL_IMAGE]: (engine, request) => engine.pullImage(request),
  [PLAN_KIND.CREATE_CONTAINER]:
    (engine, request) => engine.createContainer(request),
  [PLAN_KIND.START_CONTAINER]:
    (engine, request) => engine.startContainer(request),
  [PLAN_KIND.STOP_CONTAINER]:
    (engine, request) => engine.stopContainer(request),
  [PLAN_KIND.REMOVE_CONTAINER]:
    (engine, request) => engine.removeContainer(request),
});

function malformedEngineSnapshot() {
  return {
    kind: SNAPSHOT_KIND.ENGINE_ERROR,
    errorCode: ERROR_CODE.ENGINE_FAILURE,
  };
}

// Classification only ever runs on an observe()-shaped snapshot; any other
// shape is an orchestrator contract violation and throws instead of being
// interpreted as Engine evidence.
function requireSnapshotShape(operation, snapshot) {
  if (snapshot.kind === SNAPSHOT_KIND.ENGINE_ERROR) {
    requireField(RETRYABLE_ENGINE_CODES.has(snapshot.errorCode),
      INPUT_FIELD.SNAPSHOT);
    return;
  }
  if (operation === OPERATION.PULL) {
    requireField(snapshot.kind === SNAPSHOT_KIND.IMAGE &&
      isPlainObject(snapshot.image) &&
      typeof snapshot.image.present === 'boolean', INPUT_FIELD.SNAPSHOT);
    return;
  }
  requireField(snapshot.kind === SNAPSHOT_KIND.CONTAINERS &&
    Array.isArray(snapshot.matches), INPUT_FIELD.SNAPSHOT);
}

function classifyContext(input, withFence) {
  requireField(typeof PRE_DISPATCH_TABLE[input.operation] === 'function',
    INPUT_FIELD.OPERATION);
  requireField(isNonEmptyString(input.operationId),
    INPUT_FIELD.OPERATION_ID);
  requireField(isNonEmptyString(input.intentDigest),
    INPUT_FIELD.INTENT_DIGEST);
  requireField(Number.isSafeInteger(input.nowMs), INPUT_FIELD.NOW_MS);
  requireField(Number.isSafeInteger(input.deadlineAtMs),
    INPUT_FIELD.DEADLINE_AT_MS);
  requireField(isPlainObject(input.payload), INPUT_FIELD.PAYLOAD);
  const context = {
    operation: input.operation,
    identity: copyIdentity(input.identity),
    operationId: input.operationId,
    intentDigest: input.intentDigest,
    nowMs: input.nowMs,
    deadlineAtMs: input.deadlineAtMs,
  };
  if (withFence) {
    requireField(FENCE_STATES.has(input.fenceState),
      INPUT_FIELD.FENCE_STATE);
    context.fenceState = input.fenceState;
  }
  return context;
}

const IMAGE_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;

// A malformed facade return is never authoritative evidence: absence may
// only be proved by a well-shaped listing (contract: unavailable, stale,
// or inconsistent listing state must classify as retryable/ambiguous,
// never as absence or success).
function copyImageSnapshot(image) {
  if (!isPlainObject(image) || typeof image.present !== 'boolean') {
    return {valid: false};
  }
  if (!image.present) return {valid: true, image: {present: false}};
  if (typeof image.imageDigest !== 'string' ||
      !IMAGE_DIGEST_PATTERN.test(image.imageDigest)) {
    return {valid: false};
  }
  return {
    valid: true,
    image: {present: true, imageDigest: image.imageDigest},
  };
}

// Malformed entries are preserved (with their malformed fields absent) so
// resolveTarget classifies them INVALID instead of the listing shrinking
// toward a false absence proof.
function copyContainerMatch(match) {
  if (!isPlainObject(match)) return {labels: {}};
  const copy = {
    labels: isPlainObject(match.labels) ? {...match.labels} : {},
  };
  if (typeof match.containerId === 'string') {
    copy.containerId = match.containerId;
  }
  if (typeof match.state === 'string') copy.state = match.state;
  return copy;
}

function copyContainerMatches(listing) {
  if (!isPlainObject(listing) || !Array.isArray(listing.matches)) {
    return {valid: false};
  }
  return {valid: true, matches: listing.matches.map(copyContainerMatch)};
}

class OciHostAgentEngineTranslation {
  #engine;
  #policy;

  constructor(options) {
    if (!isPlainObject(options)) {
      throw translationError(ENGINE_TRANSLATION_ERROR.OPTIONS_REQUIRED);
    }
    this.#engine = validateEngine(options.engine);
    this.#policy = validatePolicy(options.policy);
  }

  async observe(input) {
    requireField(isPlainObject(input), INPUT_FIELD.INPUT);
    requireField(typeof PRE_DISPATCH_TABLE[input.operation] === 'function',
      INPUT_FIELD.OPERATION);
    requireField(isPlainObject(input.payload), INPUT_FIELD.PAYLOAD);
    const identity = copyIdentity(input.identity);
    try {
      if (input.operation === OPERATION.PULL) {
        const copied = copyImageSnapshot(await this.#engine.inspectImage({
          artifactRef: input.payload.artifactRef,
        }));
        if (!copied.valid) return malformedEngineSnapshot();
        return {kind: SNAPSHOT_KIND.IMAGE, image: copied.image};
      }
      const copied = copyContainerMatches(
        await this.#engine.listManagedContainers({identity}));
      if (!copied.valid) return malformedEngineSnapshot();
      return {kind: SNAPSHOT_KIND.CONTAINERS, matches: copied.matches};
    } catch (error) {
      return {
        kind: SNAPSHOT_KIND.ENGINE_ERROR,
        errorCode: collapseEngineErrorCode(error),
      };
    }
  }

  labelsForCreate(input) {
    requireField(isPlainObject(input), INPUT_FIELD.INPUT);
    requireField(isNonEmptyString(input.imageDigest),
      INPUT_FIELD.IMAGE_DIGEST);
    requireField(isNonEmptyString(input.runtimeConfigDigest),
      INPUT_FIELD.RUNTIME_CONFIG_DIGEST);
    requireField(isNonEmptyString(input.createOperationId),
      INPUT_FIELD.CREATE_OPERATION_ID);
    requireField(isNonEmptyString(input.createIntentDigest),
      INPUT_FIELD.CREATE_INTENT_DIGEST);
    return buildStableLabels(copyIdentity(input.identity),
      input.imageDigest, input.runtimeConfigDigest,
      input.createOperationId, input.createIntentDigest);
  }

  classifyPreDispatch(input) {
    requireField(isPlainObject(input), INPUT_FIELD.INPUT);
    const context = classifyContext(input, false);
    const snapshot = input.snapshot;
    requireField(isPlainObject(snapshot), INPUT_FIELD.SNAPSHOT);
    requireSnapshotShape(context.operation, snapshot);
    if (context.nowMs >= context.deadlineAtMs) {
      return terminal(context, retryableResult(context,
        ERROR_CODE.DEADLINE_BEFORE_DISPATCH, notObserved()));
    }
    if (snapshot.kind === SNAPSHOT_KIND.ENGINE_ERROR) {
      return terminal(context, retryableResult(context,
        snapshot.errorCode, notObserved()));
    }
    return PRE_DISPATCH_TABLE[context.operation](context, input.payload,
      snapshot, this.#policy);
  }

  mutate(plan) {
    requireField(isPlainObject(plan), INPUT_FIELD.PLAN);
    const dispatch = MUTATION_DISPATCH_TABLE[plan.kind];
    if (typeof dispatch !== 'function') {
      throw translationError(
        ENGINE_TRANSLATION_ERROR.PLAN_UNSUPPORTED, plan.kind);
    }
    let pending;
    try {
      pending = dispatch(this.#engine, plan.request);
    } catch (error) {
      return Promise.resolve({
        invoked: true,
        settled: false,
        errorCode: collapseEngineErrorCode(error),
      });
    }
    return Promise.resolve(pending).then(
      () => ({invoked: true, settled: true}),
      (error) => ({
        invoked: true,
        settled: false,
        errorCode: collapseEngineErrorCode(error),
      }),
    );
  }

  classifyPostMutation(input) {
    requireField(isPlainObject(input), INPUT_FIELD.INPUT);
    const context = classifyContext(input, true);
    requireField(context.operation !== OPERATION.INSPECT,
      INPUT_FIELD.OPERATION);
    const snapshot = input.postSnapshot;
    requireField(isPlainObject(snapshot), INPUT_FIELD.POST_SNAPSHOT);
    requireSnapshotShape(context.operation, snapshot);
    const result = snapshot.kind === SNAPSHOT_KIND.ENGINE_ERROR ?
      ambiguousResult(context, notObserved()) :
      POST_MUTATION_TABLE[context.operation](context, input.payload,
        snapshot);
    validateOciHostAgentResult(result, context.operationId);
    return result;
  }
}

function createOciHostAgentEngineTranslation(options) {
  return new OciHostAgentEngineTranslation(options);
}

export {
  createOciHostAgentEngineTranslation,
};
