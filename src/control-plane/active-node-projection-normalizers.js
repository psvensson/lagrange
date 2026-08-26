import {
  PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE,
} from './publication-recovery-gate.js';

const arrayIsArray = Array.isArray;
const arrayPrototypeIncludes = Function.call.bind(Array.prototype.includes);
const arrayPrototypePush = Function.call.bind(Array.prototype.push);
const arrayPrototypeSort = Function.call.bind(Array.prototype.sort);
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectHasOwn = Object.hasOwn;
const safeString = String;
const stringPrototypeTrim = Function.call.bind(String.prototype.trim);
const OWN_DATA_VALUE_FIELD = 'value';

function normalizeOwnStringList(values, sort) {
  const normalized = [];
  if (!arrayIsArray(values)) return normalized;
  for (let index = 0; index < values.length; index += 1) {
    const descriptor = objectGetOwnPropertyDescriptor(values, String(index));
    if (!descriptor || !objectHasOwn(descriptor, OWN_DATA_VALUE_FIELD)) {
      continue;
    }
    const value = stringPrototypeTrim(safeString(descriptor.value || ''));
    if (value.length > 0 && !arrayPrototypeIncludes(normalized, value)) {
      arrayPrototypePush(normalized, value);
    }
  }
  if (sort) arrayPrototypeSort(normalized);
  return normalized;
}

function normalizeNodeIdList(values = []) {
  return normalizeOwnStringList(values, true);
}

function normalizeStringList(values = []) {
  return normalizeOwnStringList(values, false);
}

function mergeNodeIdLists(lists = []) {
  const merged = [];
  if (!arrayIsArray(lists)) return merged;
  for (let listIndex = 0; listIndex < lists.length; listIndex += 1) {
    const descriptor = objectGetOwnPropertyDescriptor(
      lists,
      String(listIndex),
    );
    if (!descriptor || !objectHasOwn(descriptor, OWN_DATA_VALUE_FIELD)) {
      continue;
    }
    const normalized = normalizeNodeIdList(descriptor.value);
    for (let index = 0; index < normalized.length; index += 1) {
      if (!arrayPrototypeIncludes(merged, normalized[index])) {
        arrayPrototypePush(merged, normalized[index]);
      }
    }
  }
  arrayPrototypeSort(merged);
  return merged;
}

function normalizeNonNegativeInteger(value) {
  return Number.isFinite(value) && value >= 0 ?
    Math.floor(value) :
    0;
}

function normalizePendingAckEvidenceState(value) {
  if (
    value === PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY ||
    value ===
      PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.REQUIRED_ACK_NODE_LIST
  ) {
    return value;
  }
  return null;
}

function normalizeOptionalString(value) {
  return typeof value === 'string' && value.trim().length > 0 ?
    value.trim() :
    null;
}

export {
  mergeNodeIdLists,
  normalizeNodeIdList,
  normalizeNonNegativeInteger,
  normalizeOptionalString,
  normalizePendingAckEvidenceState,
  normalizeStringList,
};
