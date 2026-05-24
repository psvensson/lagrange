import {COLUMN, NUM, TABLES, TYPEOF} from '../constants/index.js';
import {HLCTimestamp} from '../hlc/hlc-timestamp.js';
import {isNodeHeartbeatWatermarkRegression} from '../node/node-readiness-policy.js';
import {
  mergeControlPlanePublicationRows,
} from '../control-plane/control-plane-publication-merge.js';

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function getRecordTimestamp(record) {
  const updatedAt = Number(record?.[COLUMN.UPDATED_AT]);
  if (Number.isFinite(updatedAt) && updatedAt > NUM.ZERO) {
    return updatedAt;
  }
  const createdAt = Number(record?.[COLUMN.CREATED_AT]);
  if (Number.isFinite(createdAt) && createdAt > NUM.ZERO) {
    return createdAt;
  }
  return null;
}

function isStaleForExistingRecord(tableName, existing, incoming) {
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
  if (value === null || typeof value !== TYPEOF.OBJECT) {
    return value;
  }
  return deepClone(value);
}

function shouldBackfillMissingField(existingValue, incomingValue) {
  const existingMissing = existingValue === null ||
    typeof existingValue === TYPEOF.UNDEFINED;
  const incomingPresent = incomingValue !== null &&
    typeof incomingValue !== TYPEOF.UNDEFINED;
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

  if (backfilledFields.length === NUM.ZERO) {
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
  if (typeof value === TYPEOF.UNDEFINED || value === null) {
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
    return NUM.ZERO;
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
  getRecordTimestamp,
  isStaleForExistingRecord,
  mergeRecords,
  shouldBackfillMissingField,
  shouldUsePublicationMerge,
  tryParseHLCTimestamp,
};
