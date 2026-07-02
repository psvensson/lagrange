import {
  CDC_OPERATION,
  COLUMN,
  SERVICE_TYPE,
  TABLES,
} from '../constants/index.js';
import {getSystemCachePrimaryKeyFieldOrFallback} from
  './system-cache-key-descriptor.js';
import {PRESSURE_WORK_CLASS} from '../control-plane/pressure-governor.js';
import {
  LATENCY_TOPOLOGY_DELIVERY_SOURCE,
} from '../topology/latency-topology-constants.js';

const CDC_PROPAGATION_DELIVERY_SOURCE_LITERAL = Object.freeze({
  CRITICAL_VISIBILITY_TABLE_PREFIX:
    'latency.cdc.propagation.visibility.table:',
  CRITICAL_VISIBILITY_ROW_PREFIX:
    'latency.cdc.propagation.visibility.row',
  CRITICAL_VISIBILITY_REPLACE_PENDING_PREFIX:
    'latency.cdc.propagation.visibility.replace',
  KEY_SEPARATOR: ':',
});

const CDC_PROPAGATION_DELIVERY_STATE = Object.freeze({
  BACKGROUND_CHURN: 'background_churn',
  CRITICAL_VISIBILITY: 'critical_visibility',
  STANDARD_VISIBILITY: 'standard_visibility',
});

const CDC_PROPAGATION_DELIVERY_PRIORITY = Object.freeze({
  BACKGROUND: 'background',
  CRITICAL: 'critical',
});

const BACKGROUND_CDC_PROPAGATION_TABLES = new Set([
  TABLES.MESSAGE_GROUPS,
]);

const CRITICAL_VISIBILITY_CDC_PROPAGATION_TABLES = new Set([
  TABLES.NODES,
  TABLES.NODE_ENDPOINTS,
  TABLES.PARTITIONS,
  TABLES.SERVICE_ENDPOINTS,
]);

const ROW_SUPERSEDABLE_CRITICAL_VISIBILITY_TABLES = new Set([
  TABLES.REPLICA_OPERATIONS,
]);

const CDC_PROPAGATION_DELIVERY_REPLACE_PENDING_OPERATIONS = new Set([
  CDC_OPERATION.DELETE,
  CDC_OPERATION.INSERT,
  CDC_OPERATION.UPDATE,
  CDC_OPERATION.UPSERT,
]);

const CDC_PROPAGATION_RECORD_VERSION_FIELDS = Object.freeze([
  COLUMN.UPDATED_AT,
  COLUMN.CREATED_AT,
]);

function normalizeCdcPropagationTableName(tableName) {
  return typeof tableName === 'string' && tableName.length > 0 ?
    tableName :
    null;
}

function normalizeCdcPropagationOperation(operation) {
  return (
    typeof operation === 'string' &&
    CDC_PROPAGATION_DELIVERY_REPLACE_PENDING_OPERATIONS.has(operation)
  ) ?
    operation :
    null;
}

function normalizeCdcPropagationReplacementValue(value) {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function buildCriticalVisibilityCdcPropagationDeliverySource(
  tableName,
  primaryKeyValue = null,
) {
  const normalizedTableName = normalizeCdcPropagationTableName(tableName);
  if (!normalizedTableName) {
    return LATENCY_TOPOLOGY_DELIVERY_SOURCE.CRITICAL_VISIBILITY;
  }
  const normalizedPrimaryKeyValue =
    normalizeCdcPropagationReplacementValue(primaryKeyValue);
  if (normalizedPrimaryKeyValue) {
    return [
      CDC_PROPAGATION_DELIVERY_SOURCE_LITERAL.CRITICAL_VISIBILITY_ROW_PREFIX,
      normalizedTableName,
      normalizedPrimaryKeyValue,
    ].join(CDC_PROPAGATION_DELIVERY_SOURCE_LITERAL.KEY_SEPARATOR);
  }
  return (
    CDC_PROPAGATION_DELIVERY_SOURCE_LITERAL.CRITICAL_VISIBILITY_TABLE_PREFIX +
    normalizedTableName
  );
}

function resolveCriticalVisibilityDeliverySource(events = []) {
  const criticalTableNames = [...new Set(
    events
      .map((event) => normalizeCdcPropagationTableName(event?.tableName))
      .filter(Boolean),
  )];
  if (criticalTableNames.length !== 1) {
    return LATENCY_TOPOLOGY_DELIVERY_SOURCE.CRITICAL_VISIBILITY;
  }
  const tableName = criticalTableNames[0];
  if (events.length === 1) {
    const primaryKeyValue =
      resolveCdcPropagationPrimaryKeyValue(events[0]);
    if (primaryKeyValue) {
      return buildCriticalVisibilityCdcPropagationDeliverySource(
        tableName,
        primaryKeyValue,
      );
    }
  }
  return buildCriticalVisibilityCdcPropagationDeliverySource(
    tableName,
  );
}

function resolveCdcPropagationPrimaryKeyValue(event = null) {
  const tableName = normalizeCdcPropagationTableName(event?.tableName);
  const data = event?.data && typeof event.data === 'object' ?
    event.data :
    null;
  if (!tableName || !data) {
    return null;
  }
  const primaryKeyField = getSystemCachePrimaryKeyFieldOrFallback(tableName);
  return normalizeCdcPropagationReplacementValue(data[primaryKeyField]);
}

function resolveCdcPropagationRecordVersion(event = null) {
  const data = event?.data && typeof event.data === 'object' ?
    event.data :
    null;
  if (!data) {
    return null;
  }
  for (const fieldName of CDC_PROPAGATION_RECORD_VERSION_FIELDS) {
    const normalizedValue = normalizeCdcPropagationReplacementValue(
      data[fieldName],
    );
    if (normalizedValue) {
      return normalizedValue;
    }
  }
  return null;
}

function buildCriticalVisibilityCdcPropagationReplacePendingKey(events = []) {
  if (!Array.isArray(events) || events.length !== 1) {
    return null;
  }
  const event = events[0];
  const tableName = normalizeCdcPropagationTableName(event?.tableName);
  const operation = normalizeCdcPropagationOperation(event?.operation);
  const primaryKeyValue = resolveCdcPropagationPrimaryKeyValue(event);
  if (!tableName || !operation || !primaryKeyValue) {
    return null;
  }
  const keyParts = [
    CDC_PROPAGATION_DELIVERY_SOURCE_LITERAL
      .CRITICAL_VISIBILITY_REPLACE_PENDING_PREFIX,
    tableName,
    primaryKeyValue,
  ];
  if (!ROW_SUPERSEDABLE_CRITICAL_VISIBILITY_TABLES.has(tableName)) {
    const recordVersion = resolveCdcPropagationRecordVersion(event);
    if (!recordVersion) {
      return null;
    }
    keyParts.push(operation, recordVersion);
  }
  return keyParts.join(
    CDC_PROPAGATION_DELIVERY_SOURCE_LITERAL.KEY_SEPARATOR,
  );
}

function buildCdcPropagationDeliveryProfile(state, events = []) {
  if (state === CDC_PROPAGATION_DELIVERY_STATE.BACKGROUND_CHURN) {
    return Object.freeze({
      state,
      deliveryPriority: CDC_PROPAGATION_DELIVERY_PRIORITY.BACKGROUND,
      deliverySource: LATENCY_TOPOLOGY_DELIVERY_SOURCE.BACKGROUND_CHURN,
      replacePendingKey: null,
      workClass: PRESSURE_WORK_CLASS.BACKGROUND,
    });
  }
  if (state === CDC_PROPAGATION_DELIVERY_STATE.STANDARD_VISIBILITY) {
    return Object.freeze({
      state,
      deliveryPriority: CDC_PROPAGATION_DELIVERY_PRIORITY.BACKGROUND,
      deliverySource: resolveCriticalVisibilityDeliverySource(events),
      replacePendingKey:
        buildCriticalVisibilityCdcPropagationReplacePendingKey(events),
      workClass: PRESSURE_WORK_CLASS.BACKGROUND,
    });
  }
  return Object.freeze({
    state: CDC_PROPAGATION_DELIVERY_STATE.CRITICAL_VISIBILITY,
    deliveryPriority: CDC_PROPAGATION_DELIVERY_PRIORITY.CRITICAL,
    deliverySource: resolveCriticalVisibilityDeliverySource(events),
    replacePendingKey:
      buildCriticalVisibilityCdcPropagationReplacePendingKey(events),
    workClass: PRESSURE_WORK_CLASS.CRITICAL,
  });
}

function normalizeCdcPropagationEvents(events) {
  return Array.isArray(events) ?
    events
      .filter((event) => event && typeof event === 'object')
      .map((event) => ({
        tableName: normalizeCdcPropagationTableName(event.tableName),
        operation: normalizeCdcPropagationOperation(event.operation),
        data: event.data && typeof event.data === 'object' ? event.data : null,
      })) :
    [];
}

function isCriticalPartitionServiceRow(row = null) {
  const serviceType = String(
    row?.[COLUMN.SERVICE_TYPE] ??
    row?.service_type ??
    row?.serviceType ??
    '',
  ).toLowerCase();
  return serviceType === SERVICE_TYPE.PARTITION;
}

function isCriticalCdcPropagationEvent(event = null) {
  const tableName = typeof event?.tableName === 'string' ? event.tableName : null;
  if (!tableName) {
    return true;
  }
  if (CRITICAL_VISIBILITY_CDC_PROPAGATION_TABLES.has(tableName)) {
    return true;
  }
  if (tableName === TABLES.SERVICES) {
    return isCriticalPartitionServiceRow(event?.data);
  }
  return false;
}

function isBackgroundChurnCdcPropagationEvent(event = null) {
  const tableName = typeof event?.tableName === 'string' ? event.tableName : null;
  return Boolean(tableName && BACKGROUND_CDC_PROPAGATION_TABLES.has(tableName));
}

function resolveCdcPropagationDeliveryProfile(events = [], options = {}) {
  if (options?.replayOnly === true) {
    return buildCdcPropagationDeliveryProfile(
      CDC_PROPAGATION_DELIVERY_STATE.BACKGROUND_CHURN,
      [],
    );
  }

  const normalizedEvents = normalizeCdcPropagationEvents(events);
  if (normalizedEvents.length === 0) {
    return buildCdcPropagationDeliveryProfile(
      CDC_PROPAGATION_DELIVERY_STATE.CRITICAL_VISIBILITY,
      [],
    );
  }

  if (normalizedEvents.some((event) => isCriticalCdcPropagationEvent(event))) {
    return buildCdcPropagationDeliveryProfile(
      CDC_PROPAGATION_DELIVERY_STATE.CRITICAL_VISIBILITY,
      normalizedEvents,
    );
  }
  if (normalizedEvents.every((event) => isBackgroundChurnCdcPropagationEvent(event))) {
    return buildCdcPropagationDeliveryProfile(
      CDC_PROPAGATION_DELIVERY_STATE.BACKGROUND_CHURN,
      normalizedEvents,
    );
  }
  return buildCdcPropagationDeliveryProfile(
    CDC_PROPAGATION_DELIVERY_STATE.STANDARD_VISIBILITY,
    normalizedEvents,
  );
}

export {
  BACKGROUND_CDC_PROPAGATION_TABLES,
  CRITICAL_VISIBILITY_CDC_PROPAGATION_TABLES,
  CDC_PROPAGATION_DELIVERY_PRIORITY,
  CDC_PROPAGATION_DELIVERY_STATE,
  buildCriticalVisibilityCdcPropagationDeliverySource,
  buildCriticalVisibilityCdcPropagationReplacePendingKey,
  resolveCdcPropagationDeliveryProfile,
};
