import {
  ABSENT_VALUE,
  UNKNOWN_VALUE,
  SOURCE_ORDER_BASE,
  TYPE_OBJECT,
  TYPE_STRING,
  BOOLEAN_TRUE_TEXT,
  BOOLEAN_FALSE_TEXT,
  SOURCE_FIELD,
} from './topology-convergence-constants.js';

// Base Normalizers & Utilities
export function asRecord(value) {
  if (value && typeof value === TYPE_OBJECT && !Array.isArray(value)) {
    return value;
  }
  return {};
}

export function arrayOrEmpty(value) {
  if (Array.isArray(value)) {
    return value;
  }
  return [];
}

export function firstText(...values) {
  for (const value of values) {
    if (typeof value === TYPE_STRING && value.length > SOURCE_ORDER_BASE) {
      return value;
    }
  }
  return UNKNOWN_VALUE;
}

export function textOrUnknown(value) {
  if (typeof value === TYPE_STRING && value.length > SOURCE_ORDER_BASE) {
    return value;
  }
  return UNKNOWN_VALUE;
}

export function numberOrZero(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return SOURCE_ORDER_BASE;
  }
  return parsed;
}

export function numberOrUnknown(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return UNKNOWN_VALUE;
  }
  return parsed;
}

export function booleanVariant(value) {
  if (value === true) {
    return BOOLEAN_TRUE_TEXT;
  }
  if (value === false) {
    return BOOLEAN_FALSE_TEXT;
  }
  return UNKNOWN_VALUE;
}

export function parseBooleanVariant(value) {
  if (value === true || value === BOOLEAN_TRUE_TEXT) {
    return true;
  }
  if (value === false || value === BOOLEAN_FALSE_TEXT) {
    return false;
  }
  return UNKNOWN_VALUE;
}

export function compareNumber(left, right) {
  return left - right;
}

export function firstFiniteNumber(...values) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return SOURCE_ORDER_BASE;
}

export function flattenEvidencePath(parentPath, childPath) {
  if (!parentPath || parentPath === ABSENT_VALUE) {
    return childPath;
  }
  return `${parentPath}.${childPath}`;
}

export function firstRecord(...values) {
  for (const value of values) {
    const record = asRecord(value);
    if (Object.keys(record).length > SOURCE_ORDER_BASE) {
      return record;
    }
  }
  return {};
}

export function firstArray(...values) {
  for (const value of values) {
    if (Array.isArray(value) && value.length > SOURCE_ORDER_BASE) {
      return value;
    }
  }
  return [];
}

export function recordCandidate(record, sourcePath) {
  return {record, sourcePath};
}

export function arrayCandidate(items, sourcePath) {
  return {items, sourcePath};
}

export function firstRecordWithSource(...candidates) {
  for (const candidate of candidates) {
    const record = asRecord(candidate.record);
    if (Object.keys(record).length > SOURCE_ORDER_BASE) {
      return {
        record,
        sourcePath: candidate.sourcePath || ABSENT_VALUE,
      };
    }
  }
  return {
    record: {},
    sourcePath: ABSENT_VALUE,
  };
}

export function firstArrayWithSource(...candidates) {
  for (const candidate of candidates) {
    const items = arrayOrEmpty(candidate.items);
    if (items.length > SOURCE_ORDER_BASE) {
      return {
        items,
        sourcePath: candidate.sourcePath || ABSENT_VALUE,
      };
    }
  }
  return {
    items: [],
    sourcePath: ABSENT_VALUE,
  };
}

export function isTopologyOperatorWitnessPresent(witness) {
  return (
    Object.keys(asRecord(witness)).length > SOURCE_ORDER_BASE &&
    textOrUnknown(witness[SOURCE_FIELD.CURRENT_STEP_ID]) !== UNKNOWN_VALUE &&
    textOrUnknown(witness[SOURCE_FIELD.NEXT_ACTION]) !== UNKNOWN_VALUE
  );
}
