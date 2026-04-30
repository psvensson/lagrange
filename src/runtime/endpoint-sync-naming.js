/**
 * Endpoint sync naming utilities.
 *
 * Deterministic name generation for Kubernetes resources based
 * on logical service identity.
 *
 * @module runtime/endpoint-sync-naming
 */

import crypto from 'node:crypto';
import {TYPEOF} from '../constants/index.js';
import {
  ENDPOINT_SYNC_LIST_SEPARATOR,
  ENDPOINT_SYNC_NAME,
  ENDPOINT_SYNC_REGEX,
} from './endpoint-sync-constants.js';

const LOCAL_NUM_ZERO = 0;

/**
 * Normalize an input segment into DNS-1123 label-safe text.
 *
 * @param {*} input - Segment input.
 * @return {string} Normalized segment.
 */
function normalizeDns1123Segment(input) {
  if (typeof input !== TYPEOF.STRING) {
    return ENDPOINT_SYNC_NAME.FALLBACK_SEGMENT;
  }

  const normalized = input
    .trim()
    .toLowerCase()
    .replace(ENDPOINT_SYNC_REGEX.DNS1123_INVALID,
      ENDPOINT_SYNC_NAME.CONCAT_SEPARATOR)
    .replace(ENDPOINT_SYNC_REGEX.DASH_DUPLICATE,
      ENDPOINT_SYNC_NAME.CONCAT_SEPARATOR)
    .replace(ENDPOINT_SYNC_REGEX.EDGE_DASH, '');

  if (normalized.length === LOCAL_NUM_ZERO) {
    return ENDPOINT_SYNC_NAME.FALLBACK_SEGMENT;
  }
  return normalized;
}

/**
 * Apply deterministic truncation with hash suffix for DNS-1123 labels.
 *
 * @param {string} name - Candidate DNS-1123 label.
 * @return {string} Name within 63-character limit.
 */
function truncateDns1123WithHash(name) {
  if (name.length <= ENDPOINT_SYNC_NAME.DNS1123_MAX_LENGTH) {
    return name;
  }

  const hash = crypto
    .createHash('sha1')
    .update(name)
    .digest('hex')
    .slice(0, ENDPOINT_SYNC_NAME.HASH_LENGTH);

  const maxPrefixLen = ENDPOINT_SYNC_NAME.DNS1123_MAX_LENGTH -
    ENDPOINT_SYNC_NAME.HASH_LENGTH -
    ENDPOINT_SYNC_NAME.CONCAT_SEPARATOR.length;
  const prefix = name
    .slice(0, maxPrefixLen)
    .replace(ENDPOINT_SYNC_REGEX.EDGE_DASH, '');

  const safePrefix = prefix.length > 0 ?
    prefix :
    ENDPOINT_SYNC_NAME.FALLBACK_SEGMENT;
  return `${safePrefix}${ENDPOINT_SYNC_NAME.CONCAT_SEPARATOR}${hash}`;
}

/**
 * Build deterministic service key.
 *
 * @param {string} logicalServiceName - Logical service name.
 * @param {string} protocol - Protocol identifier.
 * @return {string}
 */
function buildServiceKey(logicalServiceName, protocol) {
  const serviceSegment = normalizeDns1123Segment(logicalServiceName);
  const protocolSegment = normalizeDns1123Segment(protocol);
  return serviceSegment + ENDPOINT_SYNC_LIST_SEPARATOR.SERVICE_KEY +
    protocolSegment;
}

/**
 * Build deterministic Kubernetes Service name.
 *
 * @param {string} prefix - Configured service name prefix.
 * @param {string} logicalServiceName - Logical service name.
 * @param {string} protocol - Protocol identifier.
 * @return {string} DNS-1123 compliant service name.
 */
function buildKubernetesServiceName(prefix, logicalServiceName, protocol) {
  const prefixSegment = normalizeDns1123Segment(prefix);
  const serviceSegment = normalizeDns1123Segment(logicalServiceName);
  const protocolSegment = normalizeDns1123Segment(protocol);

  const candidate = [
    prefixSegment,
    serviceSegment,
    protocolSegment,
  ].join(ENDPOINT_SYNC_NAME.CONCAT_SEPARATOR);

  return truncateDns1123WithHash(candidate);
}

/**
 * Build deterministic EndpointSlice name.
 *
 * @param {string} serviceName - Reconciled Service name.
 * @param {number} sliceIndex - Zero-based slice index.
 * @return {string}
 */
function buildEndpointSliceName(serviceName, sliceIndex) {
  const safeServiceName = normalizeDns1123Segment(serviceName);
  const safeIndex = Number.isInteger(sliceIndex) && sliceIndex >= 0 ?
    sliceIndex :
    0;
  return truncateDns1123WithHash(
    `${safeServiceName}${ENDPOINT_SYNC_NAME.CONCAT_SEPARATOR}${safeIndex}`,
  );
}

export {
  normalizeDns1123Segment,
  truncateDns1123WithHash,
  buildServiceKey,
  buildKubernetesServiceName,
  buildEndpointSliceName,
};
