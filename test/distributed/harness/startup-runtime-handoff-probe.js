import {CLUSTER_ACTIVE_WAIT_FORMATTING_LAYER} from
  './cluster-active-wait-formatting-layer.js';

const {httpRequest} = CLUSTER_ACTIVE_WAIT_FORMATTING_LAYER;

const HTTP_METHOD_GET = 'GET';
const HTTP_PROTOCOL_PREFIX = 'http://';
const HTTP_PORT_SEPARATOR = ':';
const BOOTSTRAP_JOIN_READY_PATH = '/bootstrap/ready';
const FIELD_BODY = 'body';
const FIELD_STATUS = 'status';
const FIELD_STARTUP_RUNTIME_HANDOFF = 'startupRuntimeHandoff';
const FIELD_VALUE = 'value';
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectHasOwn = Object.hasOwn;
const arrayIsArray = Array.isArray;

function readOwnDataProperty(record, key) {
  if (
    !record ||
    typeof record !== 'object' ||
    !objectHasOwn(record, key)
  ) {
    return undefined;
  }
  const descriptor = objectGetOwnPropertyDescriptor(record, key);
  return descriptor && objectHasOwn(descriptor, FIELD_VALUE) ?
    descriptor.value :
    undefined;
}

function isRecord(value) {
  return value !== null &&
    typeof value === 'object' &&
    !arrayIsArray(value);
}

function normalizeProbeEnvelope(response) {
  const bodyValue = readOwnDataProperty(response, FIELD_BODY);
  const body = isRecord(bodyValue) ? bodyValue : undefined;
  return {
    status: readOwnDataProperty(response, FIELD_STATUS),
    startupRuntimeHandoff: readOwnDataProperty(
      body,
      FIELD_STARTUP_RUNTIME_HANDOFF,
    ),
    bootstrapReadiness: body,
  };
}

async function probeStartupRuntimeHandoff(node, options = {}) {
  const url = HTTP_PROTOCOL_PREFIX +
    node.ip +
    HTTP_PORT_SEPARATOR +
    node._restPort +
    BOOTSTRAP_JOIN_READY_PATH;
  const response = await httpRequest({
    url,
    timeoutMs: options.timeoutMs,
    method: HTTP_METHOD_GET,
    includeBody: true,
  });
  return normalizeProbeEnvelope(response);
}

export {normalizeProbeEnvelope, probeStartupRuntimeHandoff};
