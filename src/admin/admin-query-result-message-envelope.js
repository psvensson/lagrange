import {ADMIN_WEBSOCKET_API_SHARED} from './admin-websocket-api-shared.js';
import {buildAdminWriteReceipt} from './admin-write-receipt.js';

const NO_HOST_CALLBACK_VALUE = null;
const NO_CALLBACK_MODULE_REF = null;
const NO_CALLBACK_EXPORT_REF = null;

const {
  ADMIN_CACHE_DUMP,
  ADMIN_QUERY_RESULT,
  EMPTY_STRING,
  EXECUTION_MODE,
  ErrorCode,
  MessageType,
  QUERY_RESULT_MESSAGE_KIND,
  QUERY_RESULT_WRITE_OPERATIONS,
  appendStructuredQueryMetadata,
} = ADMIN_WEBSOCKET_API_SHARED;

function createAdminQueryResultBaseEnvelope(queryId) {
  return {
    type: MessageType.QUERY_RESULT,
    queryId,
    timestamp: Date.now(),
  };
}

function resolveAdminQueryResultPayloadContext(result) {
  const operation =
    typeof result?.operation === 'string' ?
      result.operation.trim().toLowerCase() :
      EMPTY_STRING;
  const hasAffectedRows = Number.isFinite(Number(result?.affectedRows));
  const hasRowPayload =
    result.rows !== undefined || result.results !== undefined;
  if (result.success === false) {
    return {kind: QUERY_RESULT_MESSAGE_KIND.ERROR, hasRowPayload};
  } else if (
    result.hostResult ||
    result.executionMode === EXECUTION_MODE.PARTITION_CALLBACK
  ) {
    return {kind: QUERY_RESULT_MESSAGE_KIND.HOST_CALLBACK, hasRowPayload};
  } else if (QUERY_RESULT_WRITE_OPERATIONS.has(operation) || hasAffectedRows) {
    return {kind: QUERY_RESULT_MESSAGE_KIND.WRITE, hasRowPayload};
  } else if (hasRowPayload) {
    return {kind: QUERY_RESULT_MESSAGE_KIND.ROWS, hasRowPayload};
  }
  return {kind: QUERY_RESULT_MESSAGE_KIND.DEFAULT_WRITE, hasRowPayload};
}

function applyAdminQueryResultMessagePayload(
  message,
  result,
  payloadContext,
) {
  switch (payloadContext.kind) {
  case QUERY_RESULT_MESSAGE_KIND.ERROR:
    applyAdminErrorQueryResultMessagePayload(message, result);
    return;
  case QUERY_RESULT_MESSAGE_KIND.HOST_CALLBACK:
    applyAdminHostCallbackQueryResultMessagePayload(message, result);
    return;
  case QUERY_RESULT_MESSAGE_KIND.WRITE:
    applyAdminWriteQueryResultMessagePayload(
      message,
      result,
      payloadContext,
    );
    return;
  case QUERY_RESULT_MESSAGE_KIND.ROWS:
    applyAdminRowsQueryResultMessagePayload(message, result);
    return;
  default:
    applyAdminDefaultWriteQueryResultMessagePayload(message, result);
  }
}

function applyAdminErrorQueryResultMessagePayload(message, result) {
  message.error = result.error;
  message.errorCode = result.errorCode || ErrorCode.INTERNAL_ERROR;
  if (result.hint) {
    message.hint = result.hint;
  }
  if (result.details && typeof result.details === 'object') {
    message.details = result.details;
  }
  if (result.deferRetry === true) {
    message.deferRetry = true;
  }
  if (Number.isFinite(result.retryAfterMs)) {
    message.retryAfterMs = Math.max(
      0,
      Math.floor(result.retryAfterMs),
    );
  }
}

function applyAdminHostCallbackQueryResultMessagePayload(message, result) {
  message.operation = EXECUTION_MODE.PARTITION_CALLBACK;
  message.results = Array.isArray(result.results) ?
    result.results :
    ADMIN_CACHE_DUMP.EMPTY;
  message.hostResult = result.hostResult || NO_HOST_CALLBACK_VALUE;
  message.callbackModuleRef =
    result.callbackModuleRef || NO_CALLBACK_MODULE_REF;
  message.callbackExport = result.callbackExport || NO_CALLBACK_EXPORT_REF;
}

function applyAdminWriteQueryResultMessagePayload(
  message,
  result,
  payloadContext,
) {
  message.operation = result.operation || NO_HOST_CALLBACK_VALUE;
  message.affectedRows = resolveAdminQueryResultAffectedRows(
    result.affectedRows,
    false,
  );
  applyAdminQueryResultTableScope(message, result);
  message.writeReceipt = buildAdminWriteReceipt(result);
  if (payloadContext.hasRowPayload) {
    message.results = resolveAdminQueryResultRows(result);
    message.count = message.results.length;
  }
}

function applyAdminRowsQueryResultMessagePayload(message, result) {
  message.results = resolveAdminQueryResultRows(result);
  message.count =
    result.count !== undefined ? result.count : message.results.length;
  applyAdminQueryResultTableScope(message, result);
  message.readAuthorityWitnesses = Array.isArray(
    result.readAuthorityWitnesses,
  ) ? result.readAuthorityWitnesses : [];
}

function applyAdminDefaultWriteQueryResultMessagePayload(message, result) {
  message.operation = result.operation;
  message.affectedRows = resolveAdminQueryResultAffectedRows(
    result.affectedRows,
    true,
  );
  applyAdminQueryResultTableScope(message, result);
}

function resolveAdminQueryResultAffectedRows(
  affectedRows,
  preserveOriginalValue,
) {
  const parsedAffectedRows = Number(affectedRows);
  if (Number.isFinite(parsedAffectedRows)) {
    return parsedAffectedRows;
  }
  if (preserveOriginalValue && affectedRows) {
    return affectedRows;
  }
  return ADMIN_QUERY_RESULT.AFFECTED_ROWS_DEFAULT;
}

function applyAdminQueryResultTableScope(message, result) {
  message.partitions = result.partitions || ADMIN_CACHE_DUMP.EMPTY;
  message.tableName = result.tableName || NO_HOST_CALLBACK_VALUE;
}

function resolveAdminQueryResultRows(result) {
  return result.rows || result.results || ADMIN_CACHE_DUMP.EMPTY;
}

function applyOptionalAdminQueryResultWarning(message, result) {
  if (result.warning) {
    message.warning = result.warning;
  }
}

function createAdminQueryResultMessageEnvelope(queryId, result) {
  const message = createAdminQueryResultBaseEnvelope(queryId);
  const payloadContext = resolveAdminQueryResultPayloadContext(result);
  applyAdminQueryResultMessagePayload(message, result, payloadContext);
  applyOptionalAdminQueryResultWarning(message, result);
  appendStructuredQueryMetadata(message, result);
  return message;
}

export {
  createAdminQueryResultBaseEnvelope,
  createAdminQueryResultMessageEnvelope,
  resolveAdminQueryResultAffectedRows,
  resolveAdminQueryResultPayloadContext,
};
