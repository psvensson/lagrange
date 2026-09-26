// The parent <-> application-process protocol of the embedded cluster harness:
// the IPC operation names, the settled-outcome names, and the exposure
// snapshot codec (what a consumer can observe, carried across fork IPC).
//
// The application process (embedded-node-worker.js) turns every value it
// receives from Lagrange into a JSON-safe snapshot of EVERY own property,
// enumerable or not (errors keep message/stack/cause), with bytes as base64.
// The parent decodes the enumerable view for equality assertions and walks the
// full snapshot for leaks. This module imports nothing from src/: the worker's
// only src import stays the public package entry.

import {Buffer} from 'node:buffer';

const EMBEDDED_WORKER_OP = Object.freeze({
  OPEN_SESSION: 'openSession',
  QUERY: 'query',
  START: 'start',
  STOP: 'stop',
  TRANSACTION: 'transaction',
});

const EMBEDDED_WORKER_EVENT = Object.freeze({
  REPLY: 'reply',
});

const EMBEDDED_STEP_OUTCOME = Object.freeze({
  FULFILLED: 'fulfilled',
  REJECTED: 'rejected',
});

const EXPOSURE_KIND = Object.freeze({
  BIGINT: 'bigint',
  BYTES: 'bytes',
  CIRCULAR: 'circular',
  DEPTH_LIMIT: 'depth-limit',
  FUNCTION: 'function',
  OBJECT: 'object',
  SYMBOL: 'symbol',
  UNDEFINED: 'undefined',
});
const BYTES_TYPE = Object.freeze({
  BUFFER: 'Buffer',
  UINT8ARRAY: 'Uint8Array',
});
const BASE64 = 'base64';
const EXPOSURE_MAX_DEPTH = 32;

function prototypeName(value) {
  const prototype = Object.getPrototypeOf(value);
  if (prototype === null) return null;
  return prototype.constructor?.name ?? 'anonymous';
}

function exposeBytes(value) {
  return {
    __kind: EXPOSURE_KIND.BYTES,
    type: Buffer.isBuffer(value) ? BYTES_TYPE.BUFFER : BYTES_TYPE.UINT8ARRAY,
    base64: Buffer.from(value.buffer, value.byteOffset, value.byteLength)
      .toString(BASE64),
  };
}

function exposeProperty(value, key, seen, depth) {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (Object.hasOwn(descriptor, 'value')) {
    return {
      enumerable: descriptor.enumerable,
      value: expose(descriptor.value, seen, depth + 1),
    };
  }
  let read;
  try {
    read = expose(descriptor.get?.call(value), seen, depth + 1);
  } catch (error) {
    read = expose(error, seen, depth + 1);
  }
  return {accessor: true, enumerable: descriptor.enumerable, value: read};
}

function exposeObject(value, seen, depth) {
  const properties = {};
  for (const key of Reflect.ownKeys(value)) {
    properties[String(key)] = exposeProperty(value, key, seen, depth);
  }
  return {
    __kind: EXPOSURE_KIND.OBJECT,
    array: Array.isArray(value),
    frozen: Object.isFrozen(value),
    prototype: prototypeName(value),
    properties,
  };
}

const PRIMITIVE_EXPOSERS = Object.freeze({
  bigint: (value) => ({__kind: EXPOSURE_KIND.BIGINT, text: value.toString()}),
  boolean: (value) => value,
  number: (value) => Number.isFinite(value) ? value : String(value),
  string: (value) => value,
  symbol: (value) => ({__kind: EXPOSURE_KIND.SYMBOL, text: String(value)}),
  undefined: () => ({__kind: EXPOSURE_KIND.UNDEFINED}),
});

/**
 * Capture everything the consumer can observe on a value.
 * @param {*} value
 * @param {WeakSet} [seen] - the current ancestor path (cycle detection)
 * @param {number} [depth]
 * @return {*} JSON-safe exposure snapshot.
 */
function expose(value, seen = new WeakSet(), depth = 0) {
  if (value === null) return null;
  const exposePrimitive = PRIMITIVE_EXPOSERS[typeof value];
  if (exposePrimitive) return exposePrimitive(value);
  if (value instanceof Uint8Array) return exposeBytes(value);
  if (seen.has(value)) return {__kind: EXPOSURE_KIND.CIRCULAR};
  if (depth > EXPOSURE_MAX_DEPTH) return {__kind: EXPOSURE_KIND.DEPTH_LIMIT};
  if (typeof value === 'function') {
    return {__kind: EXPOSURE_KIND.FUNCTION, name: value.name};
  }
  // `seen` holds the current ancestor path only: a value shared by two
  // branches is exposed on both, a true cycle is marked.
  seen.add(value);
  const exposed = exposeObject(value, seen, depth);
  seen.delete(value);
  return exposed;
}

function decodeParam(value) {
  if (
    value !== null &&
    typeof value === 'object' &&
    value.__kind === EXPOSURE_KIND.BYTES
  ) {
    return Buffer.from(value.base64, BASE64);
  }
  return value;
}

function decodeParams(params) {
  return Array.isArray(params) ? params.map(decodeParam) : params;
}

/**
 * Encode a bind value for the worker (bytes travel as base64).
 * @param {*} value
 * @return {*}
 */
function encodeParam(value) {
  if (value instanceof Uint8Array) return exposeBytes(value);
  return value;
}

/**
 * Rebuild the plain value an application saw from its exposure snapshot:
 * enumerable own properties only, bytes as Buffer.
 * @param {*} snapshot
 * @return {*}
 */
function decodeExposure(snapshot) {
  if (snapshot === null || typeof snapshot !== 'object') return snapshot;
  if (snapshot.__kind === EXPOSURE_KIND.BYTES) {
    return Buffer.from(snapshot.base64, BASE64);
  }
  if (snapshot.__kind === EXPOSURE_KIND.UNDEFINED) return undefined;
  if (snapshot.__kind !== EXPOSURE_KIND.OBJECT) return snapshot;
  const decoded = snapshot.array ? [] : {};
  for (const [key, property] of Object.entries(snapshot.properties)) {
    if (property.enumerable) decoded[key] = decodeExposure(property.value);
  }
  return decoded;
}

/**
 * Read one own property (enumerable or not) from an exposure snapshot.
 * @param {*} snapshot
 * @param {string} key
 * @return {*} the decoded value, or undefined when absent
 */
function exposedProperty(snapshot, key) {
  const property = snapshot?.properties?.[key];
  return property ? decodeExposure(property.value) : undefined;
}

/**
 * `code: message` of an exposed error, for failure diagnostics.
 * @param {*} snapshot
 * @return {string}
 */
function describeExposedError(snapshot) {
  return `${exposedProperty(snapshot, 'code')}: ` +
    `${exposedProperty(snapshot, 'message')}`;
}

export {
  BYTES_TYPE,
  EMBEDDED_STEP_OUTCOME,
  EMBEDDED_WORKER_EVENT,
  EMBEDDED_WORKER_OP,
  EXPOSURE_KIND,
  decodeExposure,
  decodeParams,
  describeExposedError,
  encodeParam,
  expose,
  exposedProperty,
};
