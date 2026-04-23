import {
  COLUMN,
  NUM,
  SERVICE_TYPE,
  TABLES,
  TYPEOF,
} from '../constants/index.js';
import {PRESSURE_WORK_CLASS} from '../control-plane/pressure-governor.js';
import {
  LATENCY_TOPOLOGY_DELIVERY_SOURCE,
} from '../topology/latency-topology-constants.js';

const CDC_PROPAGATION_DELIVERY_SOURCE_LITERAL = Object.freeze({
  CRITICAL_VISIBILITY_TABLE_PREFIX:
    'latency.cdc.propagation.visibility.table:',
});

const CDC_PROPAGATION_DELIVERY_STATE = Object.freeze({
  BACKGROUND_CHURN: 'background_churn',
  CRITICAL_VISIBILITY: 'critical_visibility',
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
  TABLES.SERVICE_ENDPOINTS,
]);

function normalizeCdcPropagationTableName(tableName) {
  return typeof tableName === TYPEOF.STRING && tableName.length > NUM.ZERO ?
    tableName :
    null;
}

function buildCriticalVisibilityCdcPropagationDeliverySource(tableName) {
  const normalizedTableName = normalizeCdcPropagationTableName(tableName);
  if (!normalizedTableName) {
    return LATENCY_TOPOLOGY_DELIVERY_SOURCE.CRITICAL_VISIBILITY;
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
  if (criticalTableNames.length !== NUM.ONE) {
    return LATENCY_TOPOLOGY_DELIVERY_SOURCE.CRITICAL_VISIBILITY;
  }
  return buildCriticalVisibilityCdcPropagationDeliverySource(
    criticalTableNames[NUM.ZERO],
  );
}

function buildCdcPropagationDeliveryProfile(state, events = []) {
  if (state === CDC_PROPAGATION_DELIVERY_STATE.BACKGROUND_CHURN) {
    return Object.freeze({
      state,
      deliveryPriority: CDC_PROPAGATION_DELIVERY_PRIORITY.BACKGROUND,
      deliverySource: LATENCY_TOPOLOGY_DELIVERY_SOURCE.BACKGROUND_CHURN,
      workClass: PRESSURE_WORK_CLASS.BACKGROUND,
    });
  }
  return Object.freeze({
    state: CDC_PROPAGATION_DELIVERY_STATE.CRITICAL_VISIBILITY,
    deliveryPriority: CDC_PROPAGATION_DELIVERY_PRIORITY.CRITICAL,
    deliverySource: resolveCriticalVisibilityDeliverySource(events),
    workClass: PRESSURE_WORK_CLASS.CRITICAL,
  });
}

function normalizeCdcPropagationEvents(events) {
  return Array.isArray(events) ?
    events
      .filter((event) => event && typeof event === TYPEOF.OBJECT)
      .map((event) => ({
        tableName: normalizeCdcPropagationTableName(event.tableName),
        data: event.data && typeof event.data === TYPEOF.OBJECT ? event.data : null,
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
  const tableName = typeof event?.tableName === TYPEOF.STRING ? event.tableName : null;
  if (!tableName) {
    return true;
  }
  if (CRITICAL_VISIBILITY_CDC_PROPAGATION_TABLES.has(tableName)) {
    return true;
  }
  if (tableName === TABLES.SERVICES) {
    return isCriticalPartitionServiceRow(event?.data);
  }
  return !BACKGROUND_CDC_PROPAGATION_TABLES.has(tableName);
}

function resolveCdcPropagationDeliveryProfile(events = [], options = {}) {
  if (options?.replayOnly === true) {
    return buildCdcPropagationDeliveryProfile(
      CDC_PROPAGATION_DELIVERY_STATE.BACKGROUND_CHURN,
      [],
    );
  }

  const normalizedEvents = normalizeCdcPropagationEvents(events);
  if (normalizedEvents.length === NUM.ZERO) {
    return buildCdcPropagationDeliveryProfile(
      CDC_PROPAGATION_DELIVERY_STATE.CRITICAL_VISIBILITY,
      [],
    );
  }

  return normalizedEvents.some((event) => isCriticalCdcPropagationEvent(event)) ?
    buildCdcPropagationDeliveryProfile(
      CDC_PROPAGATION_DELIVERY_STATE.CRITICAL_VISIBILITY,
      normalizedEvents,
    ) :
    buildCdcPropagationDeliveryProfile(
      CDC_PROPAGATION_DELIVERY_STATE.BACKGROUND_CHURN,
      normalizedEvents,
    );
}

export {
  BACKGROUND_CDC_PROPAGATION_TABLES,
  CRITICAL_VISIBILITY_CDC_PROPAGATION_TABLES,
  CDC_PROPAGATION_DELIVERY_PRIORITY,
  CDC_PROPAGATION_DELIVERY_STATE,
  buildCriticalVisibilityCdcPropagationDeliverySource,
  resolveCdcPropagationDeliveryProfile,
};
