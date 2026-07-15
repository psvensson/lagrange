import {createHmac, timingSafeEqual} from 'node:crypto';
import {types} from 'node:util';

import {
  canonicalizeOciHostAgentJson,
  parseExactOciHostAgentJson,
} from './oci-host-agent-json.js';
import {
  OCI_HOST_AGENT_PROTOCOL_ERROR,
  OciHostAgentProtocolError,
  protocolError,
} from './oci-host-agent-protocol-errors.js';
import {
  validateOciHostAgentCallerIdentity,
  validateOciHostAgentRequestEnvelope,
  validateOciHostAgentResponseEnvelope,
} from './oci-host-agent-schema.js';

const REQUEST_DOMAIN = 'lagrange-oci-host-agent-request-v1';
const RESPONSE_DOMAIN = 'lagrange-oci-host-agent-response-v1';
const HMAC_ALGORITHM = 'sha256';
const AUTH_ALGORITHM = 'hmac-sha256';
const ENCODING_ASCII = 'ascii';
const ENCODING_BASE64 = 'base64';
const ENCODING_UTF8 = 'utf8';
const HMAC_SEPARATOR = '\n';
const STOP_OPERATION = 'stop';
const DESCRIPTOR_VALUE = 'value';
const REQUEST_FRAME_MAX_BYTES = 64 * 1024;
const RESPONSE_FRAME_MAX_BYTES = 512 * 1024;
const REPLAY_WINDOW_MS = 5 * 60 * 1_000;
const CLOCK_SKEW_MS = 30 * 1_000;
const SIGNATURE_BYTES = 32;
const FRAME_PREFIX_BYTES = 4;
const AUTHENTICATION_FIELDS = Object.freeze([
  'algorithm',
  'signature',
]);
const FRAME_FIELDS = Object.freeze([
  'authentication',
  'envelope',
]);
const ENROLLED_FIELDS = Object.freeze([
  'clusterIncarnation',
  'key',
  'nodeId',
]);

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactObject(value, fields) {
  if (!isPlainObject(value)) {
    protocolError(OCI_HOST_AGENT_PROTOCOL_ERROR.INVALID_FIELD);
  }
  const keys = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (keys.length !== expected.length) {
    protocolError(keys.length < expected.length ?
      OCI_HOST_AGENT_PROTOCOL_ERROR.MISSING_FIELD :
      OCI_HOST_AGENT_PROTOCOL_ERROR.UNKNOWN_FIELD);
  }
  for (let index = 0; index < expected.length; index += 1) {
    if (keys[index] !== expected[index]) {
      protocolError(expected.includes(keys[index]) ?
        OCI_HOST_AGENT_PROTOCOL_ERROR.MISSING_FIELD :
        OCI_HOST_AGENT_PROTOCOL_ERROR.UNKNOWN_FIELD);
    }
  }
}

function asKeyBuffer(value) {
  if (types.isProxy(value)) {
    protocolError(OCI_HOST_AGENT_PROTOCOL_ERROR.KEY_UNAVAILABLE);
  }
  const key = Buffer.isBuffer(value) || types.isUint8Array(value) ?
    Buffer.from(value) : null;
  if (!key || key.length === 0) {
    protocolError(OCI_HOST_AGENT_PROTOCOL_ERROR.KEY_UNAVAILABLE);
  }
  return key;
}

function decodeCanonicalBase64(value, expectedBytes) {
  if (typeof value !== 'string' || value.length === 0 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u
        .test(value)) {
    protocolError(OCI_HOST_AGENT_PROTOCOL_ERROR.INVALID_FIELD);
  }
  const decoded = Buffer.from(value, ENCODING_BASE64);
  if (decoded.length !== expectedBytes ||
      decoded.toString(ENCODING_BASE64) !== value) {
    protocolError(OCI_HOST_AGENT_PROTOCOL_ERROR.INVALID_FIELD);
  }
  return decoded;
}

function signatureFor(domain, envelope, key) {
  const canonicalEnvelope = canonicalizeOciHostAgentJson(envelope);
  return createHmac(HMAC_ALGORITHM, asKeyBuffer(key))
    .update(domain, ENCODING_ASCII)
    .update(HMAC_SEPARATOR, ENCODING_ASCII)
    .update(canonicalEnvelope, ENCODING_UTF8)
    .digest();
}

function authenticationFor(domain, envelope, key) {
  return {
    algorithm: AUTH_ALGORITHM,
    signature: signatureFor(domain, envelope, key).toString(ENCODING_BASE64),
  };
}

function validateAuthentication(value) {
  assertExactObject(value, AUTHENTICATION_FIELDS);
  if (value.algorithm !== AUTH_ALGORITHM) {
    protocolError(OCI_HOST_AGENT_PROTOCOL_ERROR.AUTHENTICATION_FAILED);
  }
  return decodeCanonicalBase64(value.signature, SIGNATURE_BYTES);
}

function verifyAuthentication(domain, envelope, authentication, key) {
  const received = validateAuthentication(authentication);
  const expected = signatureFor(domain, envelope, key);
  if (received.length !== expected.length ||
      !timingSafeEqual(received, expected)) {
    protocolError(OCI_HOST_AGENT_PROTOCOL_ERROR.AUTHENTICATION_FAILED);
  }
}

function encodeFrame(envelope, authentication, maximumBytes) {
  const body = Buffer.from(canonicalizeOciHostAgentJson({
    envelope,
    authentication,
  }), ENCODING_UTF8);
  if (body.length > maximumBytes) {
    protocolError(OCI_HOST_AGENT_PROTOCOL_ERROR.FRAME_TOO_LARGE);
  }
  const prefix = Buffer.alloc(FRAME_PREFIX_BYTES);
  prefix.writeUInt32BE(body.length);
  return Buffer.concat([prefix, body]);
}

function frameBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  protocolError(OCI_HOST_AGENT_PROTOCOL_ERROR.FRAME_LENGTH_INVALID);
}

function decodeFrame(value, maximumBytes) {
  const frame = frameBuffer(value);
  if (frame.length < FRAME_PREFIX_BYTES) {
    protocolError(OCI_HOST_AGENT_PROTOCOL_ERROR.FRAME_LENGTH_INVALID);
  }
  const bodyLength = frame.readUInt32BE(0);
  if (bodyLength > maximumBytes) {
    protocolError(OCI_HOST_AGENT_PROTOCOL_ERROR.FRAME_TOO_LARGE);
  }
  if (bodyLength !== frame.length - FRAME_PREFIX_BYTES) {
    protocolError(OCI_HOST_AGENT_PROTOCOL_ERROR.FRAME_LENGTH_INVALID);
  }
  const body = frame.subarray(FRAME_PREFIX_BYTES);
  const decoded = parseExactOciHostAgentJson(body);
  assertExactObject(decoded, FRAME_FIELDS);
  if (canonicalizeOciHostAgentJson(decoded) !== body.toString(ENCODING_UTF8)) {
    protocolError(OCI_HOST_AGENT_PROTOCOL_ERROR.NON_CANONICAL_JSON);
  }
  return decoded;
}

function requireSafeNow(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    protocolError(OCI_HOST_AGENT_PROTOCOL_ERROR.INVALID_FIELD);
  }
  return value;
}

function verifyRequestTime(envelope, nowMs) {
  const now = requireSafeNow(nowMs);
  if (envelope.issuedAtMs < now - REPLAY_WINDOW_MS ||
      envelope.issuedAtMs > now + CLOCK_SKEW_MS ||
      envelope.deadlineAtMs <= now) {
    protocolError(OCI_HOST_AGENT_PROTOCOL_ERROR.DEADLINE_EXPIRED);
  }
  if (envelope.operation === STOP_OPERATION &&
      envelope.payload.graceMs > envelope.deadlineAtMs - now) {
    protocolError(OCI_HOST_AGENT_PROTOCOL_ERROR.INVALID_FIELD);
  }
}

function verifyCallerBinding(envelope, keyRecord) {
  if (envelope.clusterIncarnation !== keyRecord.clusterIncarnation ||
      envelope.nodeId !== keyRecord.nodeId) {
    protocolError(OCI_HOST_AGENT_PROTOCOL_ERROR.AUTHENTICATION_FAILED);
  }
}

function snapshotEnrolledKeyRecord(record) {
  if (types.isProxy(record) || !isPlainObject(record)) {
    protocolError(OCI_HOST_AGENT_PROTOCOL_ERROR.KEY_UNAVAILABLE);
  }
  const fields = Reflect.ownKeys(record);
  if (fields.length !== ENROLLED_FIELDS.length ||
      fields.some((field) => typeof field !== 'string')) {
    protocolError(OCI_HOST_AGENT_PROTOCOL_ERROR.KEY_UNAVAILABLE);
  }
  fields.sort();
  if (fields.some((field, index) =>
    field !== ENROLLED_FIELDS[index])) {
    protocolError(OCI_HOST_AGENT_PROTOCOL_ERROR.KEY_UNAVAILABLE);
  }
  const snapshot = {};
  for (const field of ENROLLED_FIELDS) {
    const descriptor = Object.getOwnPropertyDescriptor(record, field);
    if (!descriptor || !descriptor.enumerable ||
        !Object.hasOwn(descriptor, DESCRIPTOR_VALUE)) {
      protocolError(OCI_HOST_AGENT_PROTOCOL_ERROR.KEY_UNAVAILABLE);
    }
    snapshot[field] = descriptor.value;
  }
  return snapshot;
}

function resolveEnrolledKeyRecord(resolveKey, keyId) {
  if (typeof resolveKey !== 'function') {
    protocolError(OCI_HOST_AGENT_PROTOCOL_ERROR.KEY_UNAVAILABLE);
  }
  let key;
  let clusterIncarnation;
  let nodeId;
  try {
    const record = snapshotEnrolledKeyRecord(resolveKey(keyId));
    clusterIncarnation = record.clusterIncarnation;
    nodeId = record.nodeId;
    validateOciHostAgentCallerIdentity({clusterIncarnation, nodeId});
    key = asKeyBuffer(record.key);
  } catch {
    protocolError(OCI_HOST_AGENT_PROTOCOL_ERROR.KEY_UNAVAILABLE);
  }
  return {key, clusterIncarnation, nodeId};
}

function encodeOciHostAgentRequestFrame(envelope, key) {
  validateOciHostAgentRequestEnvelope(envelope);
  return encodeFrame(
    envelope,
    authenticationFor(REQUEST_DOMAIN, envelope, key),
    REQUEST_FRAME_MAX_BYTES,
  );
}

function decodeOciHostAgentRequestFrame(frame, options = {}) {
  const decoded = decodeFrame(frame, REQUEST_FRAME_MAX_BYTES);
  validateOciHostAgentRequestEnvelope(decoded.envelope);
  const keyRecord = resolveEnrolledKeyRecord(
    options.resolveKey,
    decoded.envelope.keyId,
  );
  verifyAuthentication(
    REQUEST_DOMAIN,
    decoded.envelope,
    decoded.authentication,
    keyRecord.key,
  );
  verifyCallerBinding(decoded.envelope, keyRecord);
  verifyRequestTime(decoded.envelope, options.nowMs);
  return decoded.envelope;
}

function encodeOciHostAgentResponseFrame(envelope, key) {
  validateOciHostAgentResponseEnvelope(envelope);
  return encodeFrame(
    envelope,
    authenticationFor(RESPONSE_DOMAIN, envelope, key),
    RESPONSE_FRAME_MAX_BYTES,
  );
}

function responseIdentityMatches(identity, expectedIdentity) {
  return Boolean(expectedIdentity) &&
    identity.clusterIncarnation === expectedIdentity.clusterIncarnation &&
    identity.nodeId === expectedIdentity.nodeId &&
    identity.serviceId === expectedIdentity.serviceId &&
    identity.revisionId === expectedIdentity.revisionId &&
    identity.instanceId === expectedIdentity.instanceId;
}

function responseEnvelopeMatches(envelope, options) {
  return envelope.requestId === options.expectedRequestId &&
    envelope.operationId === options.expectedOperationId &&
    envelope.keyId === options.expectedKeyId &&
    envelope.agentId === options.expectedAgentId &&
    envelope.result.operation === options.expectedOperation &&
    envelope.result.intentDigest === options.expectedIntentDigest;
}

function verifyResponseBinding(envelope, options) {
  const expectedIdentity = options.expectedIdentity;
  const identity = envelope.result.identity;
  if (!responseEnvelopeMatches(envelope, options) ||
      !responseIdentityMatches(identity, expectedIdentity)) {
    protocolError(OCI_HOST_AGENT_PROTOCOL_ERROR.RESPONSE_BINDING_MISMATCH);
  }
  const now = requireSafeNow(options.nowMs);
  const deadline = requireSafeNow(options.deadlineAtMs);
  if (now >= deadline || envelope.completedAtMs >= deadline) {
    protocolError(OCI_HOST_AGENT_PROTOCOL_ERROR.DEADLINE_EXPIRED);
  }
}

function decodeOciHostAgentResponseFrame(frame, options = {}) {
  const decoded = decodeFrame(frame, RESPONSE_FRAME_MAX_BYTES);
  validateOciHostAgentResponseEnvelope(decoded.envelope);
  verifyAuthentication(
    RESPONSE_DOMAIN,
    decoded.envelope,
    decoded.authentication,
    options.key,
  );
  verifyResponseBinding(decoded.envelope, options);
  return decoded.envelope;
}

export {
  OCI_HOST_AGENT_PROTOCOL_ERROR,
  OciHostAgentProtocolError,
  canonicalizeOciHostAgentJson,
  decodeOciHostAgentRequestFrame,
  decodeOciHostAgentResponseFrame,
  encodeOciHostAgentRequestFrame,
  encodeOciHostAgentResponseFrame,
  parseExactOciHostAgentJson,
};
