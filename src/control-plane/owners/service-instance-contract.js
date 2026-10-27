// Bounded JSON capture and R2 request identity, owned by ServiceDefinitionsOwner.
import {SERVICE_INSTANCE_ACTION as ACTION, SERVICE_INSTANCE_LIMIT as LIMIT,
  SERVICE_INSTANCE_OUTCOME as OUTCOME} from '../../constants/service-instance.js';
import {canonicalJson, sha256Json, isPlainObject} from './service-install-catalog-contract.js';

const DATA_PROPERTY_VALUE = 'value';
const PEER_FIELDS = ['replicaId', 'nodeId'];
const HEX = /^[0-9a-f]{64}$/u;
const DIGEST_PREFIX_LENGTH = 7;
const INSTANCE_DOMAIN = 'service-instance-r2';
const REQUEST_FIELDS = ['format', 'requestId', 'tenantId', 'expectedIncarnation',
  'action', 'revisionId', 'definition', 'profile', 'foundingPeers'];
const ID_FIELDS = ['serviceDefinitionId', 'expectedVersion', 'nonce'];
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

class ServiceInstanceContractError extends Error {
  constructor(outcome) {
    super(outcome);
    this.outcome = outcome;
  }
}
function requireInstance(condition, outcome = OUTCOME.INVALID_REQUEST) {
  if (!condition) throw new ServiceInstanceContractError(outcome);
}
function instanceIdentifier(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= LIMIT.IDENTIFIER &&
    value.trim() === value;
}
function instanceCounter(value) {
  return Number.isSafeInteger(value) && value >= 0;
}
function exactFields(value, fields) {
  return isPlainObject(value) && Object.keys(value).length === fields.length &&
    fields.every((key) => Object.hasOwn(value, key));
}
function inspectJson(value, state, depth) {
  state.nodes += 1;
  requireInstance(state.nodes <= LIMIT.JSON_NODES && depth <= LIMIT.JSON_DEPTH);
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    requireInstance(Number.isFinite(value));
    return;
  }
  if (typeof value === 'string') {
    state.bytes += Buffer.byteLength(value);
    requireInstance(state.bytes <= state.limit);
    return;
  }
  requireInstance(Array.isArray(value) || isPlainObject(value));
  requireInstance(!state.ancestors.has(value));
  state.ancestors.add(value);
  inspectJsonProperties(value, state, depth);
  state.ancestors.delete(value);
}
function inspectJsonProperties(value, state, depth) {
  const keys = Reflect.ownKeys(value).filter((key) => !(Array.isArray(value) && key === 'length'));
  requireInstance(keys.length <= LIMIT.JSON_NODES);
  if (Array.isArray(value)) requireInstance(keys.length === value.length);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    requireInstance(typeof key === 'string' && !FORBIDDEN_KEYS.has(key) &&
      Object.hasOwn(descriptor, DATA_PROPERTY_VALUE) && descriptor.enumerable);
    if (Array.isArray(value)) {
      requireInstance(String(Number(key)) === key &&
      instanceCounter(Number(key)) && Number(key) < value.length);
    }
    state.bytes += Buffer.byteLength(key);
    requireInstance(state.bytes <= state.limit);
    inspectJson(descriptor.value, state, depth + 1);
  }
}
function encodeInstanceJson(value, limit) {
  inspectJson(value, {nodes: 0, bytes: 0, limit, ancestors: new Set()}, 0);
  const encoded = canonicalJson(value);
  requireInstance(Buffer.byteLength(encoded) <= limit);
  return encoded;
}
function captureInstanceJson(value, limit = LIMIT.REQUEST_BYTES) {
  return JSON.parse(encodeInstanceJson(value, limit));
}
function instanceDigest(value) {
  return sha256Json(canonicalJson(value)).slice(DIGEST_PREFIX_LENGTH);
}
function instanceIncarnation(requestDigest) {
  return instanceDigest({domain: INSTANCE_DOMAIN, requestDigest});
}
function validRequestId(id) {
  return exactFields(id, ID_FIELDS) && instanceIdentifier(id.serviceDefinitionId) &&
    instanceCounter(id.expectedVersion) && typeof id.nonce === 'string' && HEX.test(id.nonce);
}
function captureSelectionRequest(value) {
  const request = captureInstanceJson(value);
  requireInstance(exactFields(request, REQUEST_FIELDS) && validRequestId(request.requestId));
  requireInstance(request.format === LIMIT.FORMAT && instanceIdentifier(request.tenantId));
  requireInstance(request.expectedIncarnation === null ||
    (typeof request.expectedIncarnation === 'string' && HEX.test(request.expectedIncarnation)));
  requireInstance(Object.values(ACTION).includes(request.action));
  return request;
}
function validFoundingPeers(peers) {
  return Array.isArray(peers) && peers.length > 0 && peers.length <= LIMIT.RESOURCES &&
    peers.every((peer) => exactFields(peer, PEER_FIELDS) &&
      instanceIdentifier(peer.replicaId) && instanceIdentifier(peer.nodeId)) &&
    new Set(peers.map((peer) => peer.replicaId)).size === peers.length &&
    new Set(peers.map((peer) => peer.nodeId)).size === peers.length;
}
function instanceFailure(error, fallback = OUTCOME.UNAVAILABLE) {
  return {outcome: error instanceof ServiceInstanceContractError ? error.outcome : fallback};
}
export {HEX, ServiceInstanceContractError, requireInstance, instanceIdentifier, instanceCounter,
  exactFields, encodeInstanceJson, captureInstanceJson, instanceDigest, instanceIncarnation,
  validRequestId, captureSelectionRequest, validFoundingPeers, instanceFailure};
