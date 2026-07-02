import {COLUMN, TABLES} from '../constants/index.js';
import {HLCTimestamp} from '../hlc/hlc-timestamp.js';
import {isNodeHeartbeatWatermarkRegression} from '../node/node-readiness-policy.js';
import {
  mergeControlPlanePublicationRows,
} from '../control-plane/control-plane-publication-merge.js';
import {fastJsonClone} from '../utils/fast-json-clone.js';

function deepClone(value) {
  return fastJsonClone(value);
}

function getRecordTimestamp(record) {
  const updatedAt = Number(record?.[COLUMN.UPDATED_AT]);
  if (Number.isFinite(updatedAt) && updatedAt > 0) {
    return updatedAt;
  }
  const createdAt = Number(record?.[COLUMN.CREATED_AT]);
  if (Number.isFinite(createdAt) && createdAt > 0) {
    return createdAt;
  }
  return null;
}

// Parse the per-row origin HLC stamp (`updated_at_hlc`) when present. The HLC is a
// globally comparable causal version (physical, logical, nodeId tie-break); when both
// records carry one it is the authoritative ordering, immune to equal-millisecond
// `updated_at` ties and to cross-leader wall-clock skew.
function getRecordHlc(record) {
  return tryParseHLCTimestamp(record?.[COLUMN.UPDATED_AT_HLC]);
}

function isStaleForExistingRecord(tableName, existing, incoming) {
  // Prefer the origin HLC when both rows carry one: it is a total causal order, so
  // equal-`updated_at` ties resolve deterministically and identically on every replica.
  const existingHlc = getRecordHlc(existing);
  const incomingHlc = getRecordHlc(incoming);
  if (existingHlc && incomingHlc) {
    const order = incomingHlc.compare(existingHlc);
    if (order < 0) {
      return true;
    }
    if (order > 0) {
      return false;
    }
    return tableName === TABLES.NODES &&
      isNodeHeartbeatWatermarkRegression(existing, incoming);
  }

  const existingTimestamp = getRecordTimestamp(existing);
  const incomingTimestamp = getRecordTimestamp(incoming);

  if (!Number.isFinite(existingTimestamp) ||
      !Number.isFinite(incomingTimestamp)) {
    return tableName === TABLES.NODES &&
      isNodeHeartbeatWatermarkRegression(existing, incoming);
  }

  if (incomingTimestamp < existingTimestamp) {
    return true;
  }

  if (incomingTimestamp > existingTimestamp) {
    return false;
  }

  return tableName === TABLES.NODES &&
    isNodeHeartbeatWatermarkRegression(existing, incoming);
}

function shouldUsePublicationMerge(existing, incoming) {
  return Boolean(existing?.publication_id || incoming?.publication_id);
}

function cloneFieldValue(value) {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  return deepClone(value);
}

function shouldBackfillMissingField(existingValue, incomingValue) {
  const existingMissing = existingValue === null ||
    typeof existingValue === 'undefined';
  const incomingPresent = incomingValue !== null &&
    typeof incomingValue !== 'undefined';
  return existingMissing && incomingPresent;
}

function applyStaleRowBackfill(table, key, existing, incoming) {
  if (shouldUsePublicationMerge(existing, incoming)) {
    const mergedRecord = mergeControlPlanePublicationRows(existing, incoming);
    if (JSON.stringify(mergedRecord) === JSON.stringify(existing)) {
      return {
        applied: false,
        record: existing,
        backfilledFields: [],
      };
    }
    table.set(key, mergedRecord);
    return {
      applied: true,
      record: mergedRecord,
      backfilledFields: Object.keys(incoming),
    };
  }

  const merged = deepClone(existing);
  const backfilledFields = [];

  for (const [field, incomingValue] of Object.entries(incoming)) {
    if (shouldBackfillMissingField(merged[field], incomingValue)) {
      merged[field] = cloneFieldValue(incomingValue);
      backfilledFields.push(field);
    }
  }

  if (backfilledFields.length === 0) {
    return {
      applied: false,
      record: existing,
      backfilledFields,
    };
  }

  table.set(key, merged);
  return {
    applied: true,
    record: merged,
    backfilledFields,
  };
}

function mergeRecords(tableName, existing, incoming) {
  if (tableName === TABLES.CONTROL_PLANE_PUBLICATIONS) {
    return mergeControlPlanePublicationRows(incoming, existing);
  }
  return {...existing, ...deepClone(incoming)};
}

function tryParseHLCTimestamp(value) {
  if (typeof value === 'undefined' || value === null) {
    return null;
  }

  try {
    return HLCTimestamp.fromString(String(value));
  } catch {
    return null;
  }
}

function compareSchemaVersions(incomingVersion, currentVersion) {
  if (incomingVersion === currentVersion) {
    return 0;
  }

  const incomingHlc = tryParseHLCTimestamp(incomingVersion);
  const currentHlc = tryParseHLCTimestamp(currentVersion);
  if (incomingHlc && currentHlc) {
    return incomingHlc.compare(currentHlc);
  }

  const incomingNumber = Number(incomingVersion);
  const currentNumber = Number(currentVersion);
  if (Number.isFinite(incomingNumber) && Number.isFinite(currentNumber)) {
    return incomingNumber - currentNumber;
  }

  return String(incomingVersion).localeCompare(String(currentVersion));
}

export {
  applyStaleRowBackfill,
  cloneFieldValue,
  compareSchemaVersions,
  getRecordHlc,
  getRecordTimestamp,
  isStaleForExistingRecord,
  mergeRecords,
  shouldBackfillMissingField,
  shouldUsePublicationMerge,
  tryParseHLCTimestamp,
};
