import {CLUSTER_BASE_LAYER} from './cluster-base-layer.js';

const {
  ZERO,
} = CLUSTER_BASE_LAYER;

const TYPEOF_OBJECT = 'object';
const TYPEOF_STRING = 'string';
const TYPEOF_FUNCTION = 'function';
const ACTIVE_WAIT_NORMALIZATION_EMPTY_TEXT = '';

function normalizeDistinctStringArray(values) {
  if (!Array.isArray(values)) {
    return [];
  }
  return [
    ...new Set(
      values
        .map((value) => String(value || ACTIVE_WAIT_NORMALIZATION_EMPTY_TEXT).trim())
        .filter((value) => value.length > ZERO),
    ),
  ].sort((left, right) => left.localeCompare(right));
}

function normalizeFirstNonEmptyDistinctStringArray(...candidates) {
  for (const candidate of candidates) {
    const normalized = normalizeDistinctStringArray(candidate);
    if (normalized.length > ZERO) {
      return normalized;
    }
  }
  return [];
}

export {
  TYPEOF_OBJECT,
  TYPEOF_STRING,
  TYPEOF_FUNCTION,
  normalizeDistinctStringArray,
  normalizeFirstNonEmptyDistinctStringArray,
};
