/**
 * Admin websocket message -> canonical Service_Message adapter.
 */

import {v4 as uuidv4} from 'uuid';
import {
  META_SERVICE_ID,
  SERVICE_MESSAGE_FIELD,
  UNIFIED_SERVICE_TYPE,
} from '../constants/index.js';
import {generateCorrelationId} from '../utils/correlation.js';
import {ADMIN_MESSAGE_TYPE} from './admin-constants.js';

const LOCAL_STR_STRING = 'string';

const ADMIN_SERVICE_OPERATION = Object.freeze({
  EXECUTE_QUERY: 'admin.execute_query',
  EXECUTE_PARTITION_CALLBACK: 'admin.execute_partition_callback',
  GET_CACHE_DUMP: 'admin.get_cache_dump',
});

const ADMIN_ADAPTER_ERROR = Object.freeze({
  TYPE_REQUIRED: 'admin websocket message must include type',
  UNSUPPORTED_TYPE: 'unsupported admin websocket message type for service dispatch',
});

const ZERO = 0;

function resolveOptionalTimeoutMs(value) {
  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue)) {
    return null;
  }
  const normalizedValue = Math.floor(parsedValue);
  if (normalizedValue <= ZERO) {
    return null;
  }
  return normalizedValue;
}

function resolveOptionalLane(value) {
  if (typeof value !== LOCAL_STR_STRING) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized.length === ZERO) {
    return null;
  }
  return normalized;
}

function isAdminMessageDispatchable(type) {
  return type === ADMIN_MESSAGE_TYPE.QUERY ||
    type === ADMIN_MESSAGE_TYPE.PARTITION_CALLBACK ||
    type === ADMIN_MESSAGE_TYPE.REFRESH;
}

function mapAdminMessageToOperation(messageType) {
  if (messageType === ADMIN_MESSAGE_TYPE.QUERY) {
    return ADMIN_SERVICE_OPERATION.EXECUTE_QUERY;
  }
  if (messageType === ADMIN_MESSAGE_TYPE.PARTITION_CALLBACK) {
    return ADMIN_SERVICE_OPERATION.EXECUTE_PARTITION_CALLBACK;
  }
  if (messageType === ADMIN_MESSAGE_TYPE.REFRESH) {
    return ADMIN_SERVICE_OPERATION.GET_CACHE_DUMP;
  }
  throw new Error(`${ADMIN_ADAPTER_ERROR.UNSUPPORTED_TYPE}: ${messageType}`);
}

function mapAdminMessageToPayload(message) {
  if (message.type === ADMIN_MESSAGE_TYPE.QUERY) {
    const payload = {
      queryId: message.queryId || null,
      sql: message.sql,
      params: message.params || [],
    };
    const timeoutMs = resolveOptionalTimeoutMs(message.timeoutMs);
    if (timeoutMs !== null) {
      payload.timeoutMs = timeoutMs;
    }
    return payload;
  }
  if (message.type === ADMIN_MESSAGE_TYPE.PARTITION_CALLBACK) {
    const payload = {
      queryId: message.queryId || null,
      statement: message.statement || message.sql,
      parameters: message.parameters || message.params || [],
      callbackModuleRef: message.callbackModuleRef,
      callbackExport: message.callbackExport,
      runtimeKind: message.runtimeKind,
    };
    const timeoutMs = resolveOptionalTimeoutMs(message.timeoutMs);
    if (timeoutMs !== null) {
      payload.timeoutMs = timeoutMs;
    }
    return payload;
  }
  return {
    queryId: message.queryId || null,
  };
}

/**
 * Adapt an admin websocket message into a canonical Service_Message envelope.
 *
 * @param {Object} message
 * @param {Object} context
 * @return {Object}
 */
function adaptAdminMessageToServiceMessage(message, context = {}) {
  const messageType = message?.type;
  if (!messageType) {
    throw new Error(ADMIN_ADAPTER_ERROR.TYPE_REQUIRED);
  }
  if (!isAdminMessageDispatchable(messageType)) {
    throw new Error(`${ADMIN_ADAPTER_ERROR.UNSUPPORTED_TYPE}: ${messageType}`);
  }

  const messageId = message.queryId || message.messageId || uuidv4();
  const traceId = context.traceId ||
    message.traceId ||
    generateCorrelationId();

  return {
    [SERVICE_MESSAGE_FIELD.MESSAGE_ID]: messageId,
    [SERVICE_MESSAGE_FIELD.SERVICE_ID]:
      context.serviceId || META_SERVICE_ID.ADMIN_META,
    [SERVICE_MESSAGE_FIELD.SERVICE_TYPE]:
      context.serviceType || UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
    [SERVICE_MESSAGE_FIELD.OPERATION]: mapAdminMessageToOperation(messageType),
    [SERVICE_MESSAGE_FIELD.PAYLOAD]: mapAdminMessageToPayload(message),
    [SERVICE_MESSAGE_FIELD.METADATA]: {
      adminMessageType: messageType,
      clientId: context.clientId || null,
      lane: resolveOptionalLane(context.lane || message.lane),
    },
    [SERVICE_MESSAGE_FIELD.TENANT_ID]: context.tenantId || null,
    [SERVICE_MESSAGE_FIELD.PRINCIPAL]: context.principal || null,
    [SERVICE_MESSAGE_FIELD.TRACE_ID]: traceId,
    [SERVICE_MESSAGE_FIELD.TIMESTAMP]: Date.now(),
  };
}

export {
  ADMIN_SERVICE_OPERATION,
  adaptAdminMessageToServiceMessage,
  isAdminMessageDispatchable,
};
