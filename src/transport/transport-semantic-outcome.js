import {ROUTER_ERROR_MSG} from '../constants/transport.js';
import {
  OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE,
  ROUTER_CONNECTION_CLOSED_ERROR_CODE,
  ROUTER_MESSAGE_TIMEOUT_ERROR_CODE,
  ROUTER_NO_CONNECTION_ERROR_CODE,
  WEBSOCKET_CONNECT_TIMEOUT_ERROR_CODE,
} from './transport-error-codes.js';

const TRANSPORT_SEMANTIC_OUTCOME_STATE = Object.freeze({
  READY: 'ready',
  DEFERRED: 'deferred',
  FAILED: 'failed',
});

const TRANSPORT_DELIVERY_OUTCOME_STATE = Object.freeze({
  DELIVERED: 'delivered',
  DEFERRED: 'deferred',
  FAILED: 'failed',
});

const TRANSPORT_DELIVERY_OUTCOME_METADATA_FIELD = Object.freeze({
  DELIVERY_STATE: 'deliveryState',
  DEFER_RETRY: 'deferRetry',
  ERROR_CODE: 'errorCode',
  NO_HANDLER: 'noHandler',
  REASON_CODE: 'reasonCode',
  RETRY_AFTER_MS: 'retryAfterMs',
});

const TRANSPORT_DELIVERY_OUTCOME_METADATA_FIELDS = Object.freeze([
  TRANSPORT_DELIVERY_OUTCOME_METADATA_FIELD.DELIVERY_STATE,
  TRANSPORT_DELIVERY_OUTCOME_METADATA_FIELD.DEFER_RETRY,
  TRANSPORT_DELIVERY_OUTCOME_METADATA_FIELD.ERROR_CODE,
  TRANSPORT_DELIVERY_OUTCOME_METADATA_FIELD.NO_HANDLER,
  TRANSPORT_DELIVERY_OUTCOME_METADATA_FIELD.REASON_CODE,
  TRANSPORT_DELIVERY_OUTCOME_METADATA_FIELD.RETRY_AFTER_MS,
]);

const TRANSPORT_SEMANTIC_OUTCOME_REASON_CODE = Object.freeze({
  QUERY_TRANSPORT_NOT_READY: 'query_transport_not_ready',
  CONNECTION_CLOSED: 'connection_closed',
  TRANSPORT_DEFERRED: 'transport_deferred',
});

const TRANSPORT_DELIVERY_OUTCOME_REASON_CODE = Object.freeze({
  ACK_REJECTED: 'ack_rejected',
  COMPLETED_WITH_ERROR: 'completed_with_error',
  CONNECTION_CLOSED: 'connection_closed',
  MESSAGE_TIMEOUT: 'message_timeout',
  NO_HANDLER: 'no_handler',
  NO_CONNECTION: 'no_connection',
  OUTBOUND_QUEUE_BACKPRESSURED: 'outbound_queue_backpressured',
  QUERY_TRANSPORT_NOT_READY: 'query_transport_not_ready',
  TRANSPORT_DEFERRED: 'transport_deferred',
  WEBSOCKET_CONNECT_TIMEOUT: 'websocket_connect_timeout',
});

const ROUTER_QUERY_TRANSPORT_NOT_READY_ERROR_CODE =
  'ROUTER_QUERY_TRANSPORT_NOT_READY';

function normalizePositiveRetryAfterMs(value, fallback = null) {
  return Number.isFinite(value) && value > 0 ?
    Math.floor(value) :
    fallback;
}

function normalizeOptionalString(value) {
  return typeof value === 'string' && value.length > 0 ?
    value :
    null;
}

function normalizeTransportErrorCode(value) {
  const normalizedCode = normalizeOptionalString(value);
  return normalizedCode !== null ?
    normalizedCode.toUpperCase() :
    null;
}

function isTransportDeliveryErrorCode(errorCode) {
  return errorCode === OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE ||
    errorCode === ROUTER_CONNECTION_CLOSED_ERROR_CODE ||
    errorCode === ROUTER_MESSAGE_TIMEOUT_ERROR_CODE ||
    errorCode === ROUTER_NO_CONNECTION_ERROR_CODE ||
    errorCode === WEBSOCKET_CONNECT_TIMEOUT_ERROR_CODE ||
    errorCode === ROUTER_QUERY_TRANSPORT_NOT_READY_ERROR_CODE;
}

function isDeferredTransportDeliveryErrorCode(errorCode) {
  return errorCode === OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE ||
    errorCode === ROUTER_CONNECTION_CLOSED_ERROR_CODE ||
    errorCode === ROUTER_NO_CONNECTION_ERROR_CODE ||
    errorCode === ROUTER_QUERY_TRANSPORT_NOT_READY_ERROR_CODE;
}

function classifyTransportDeliveryState(options) {
  const deferred =
    options.deferRetry === true ||
    isDeferredTransportDeliveryErrorCode(options.errorCode) ||
    options.retryAfterMs !== null ||
    options.claimedDeliveryState ===
      TRANSPORT_DELIVERY_OUTCOME_STATE.DEFERRED;
  const hasConflict =
    options.noHandler ||
    options.completedWithError ||
    isTransportDeliveryErrorCode(options.errorCode) ||
    (
      options.claimedDeliveryState !== null &&
      options.claimedDeliveryState !==
        TRANSPORT_DELIVERY_OUTCOME_STATE.DELIVERED
    );
  const delivered = options.acknowledged && !deferred && !hasConflict;
  return {
    delivered,
    deferred,
    deliveryState: delivered ?
      TRANSPORT_DELIVERY_OUTCOME_STATE.DELIVERED :
      deferred ?
        TRANSPORT_DELIVERY_OUTCOME_STATE.DEFERRED :
        TRANSPORT_DELIVERY_OUTCOME_STATE.FAILED,
  };
}

function resolveTransportSemanticReasonCode(errorCode, deferred) {
  if (errorCode === ROUTER_CONNECTION_CLOSED_ERROR_CODE) {
    return TRANSPORT_SEMANTIC_OUTCOME_REASON_CODE.CONNECTION_CLOSED;
  }
  if (errorCode === ROUTER_QUERY_TRANSPORT_NOT_READY_ERROR_CODE) {
    return TRANSPORT_SEMANTIC_OUTCOME_REASON_CODE.QUERY_TRANSPORT_NOT_READY;
  }
  if (deferred) {
    return TRANSPORT_SEMANTIC_OUTCOME_REASON_CODE.TRANSPORT_DEFERRED;
  }
  return null;
}

function resolveTransportDeliveryReasonCode(
  errorCode,
  deferred,
  noHandler,
  delivered,
  completedWithError,
) {
  if (noHandler === true) {
    return TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.NO_HANDLER;
  }
  if (errorCode === ROUTER_CONNECTION_CLOSED_ERROR_CODE) {
    return TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.CONNECTION_CLOSED;
  }
  if (errorCode === ROUTER_MESSAGE_TIMEOUT_ERROR_CODE) {
    return TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.MESSAGE_TIMEOUT;
  }
  if (errorCode === ROUTER_NO_CONNECTION_ERROR_CODE) {
    return TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.NO_CONNECTION;
  }
  if (errorCode === OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE) {
    return TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.OUTBOUND_QUEUE_BACKPRESSURED;
  }
  if (errorCode === WEBSOCKET_CONNECT_TIMEOUT_ERROR_CODE) {
    return TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.WEBSOCKET_CONNECT_TIMEOUT;
  }
  if (errorCode === ROUTER_QUERY_TRANSPORT_NOT_READY_ERROR_CODE) {
    return TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.QUERY_TRANSPORT_NOT_READY;
  }
  if (deferred) {
    return TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.TRANSPORT_DEFERRED;
  }
  if (completedWithError) {
    return TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.COMPLETED_WITH_ERROR;
  }
  if (!delivered) {
    return TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.ACK_REJECTED;
  }
  return null;
}

function buildTransportSemanticOutcome(options = {}) {
  const ready = options.ready === true;
  const retryAfterMs = normalizePositiveRetryAfterMs(
    options.retryAfterMs,
    null,
  );
  const errorCode = normalizeTransportErrorCode(
    options.errorCode ?? options.code,
  );
  const deferred =
    options.deferRetry === true ||
    errorCode === ROUTER_CONNECTION_CLOSED_ERROR_CODE ||
    errorCode === ROUTER_QUERY_TRANSPORT_NOT_READY_ERROR_CODE ||
    retryAfterMs !== null;

  return Object.freeze({
    state:
      ready ?
        TRANSPORT_SEMANTIC_OUTCOME_STATE.READY :
        (
          deferred ?
            TRANSPORT_SEMANTIC_OUTCOME_STATE.DEFERRED :
            TRANSPORT_SEMANTIC_OUTCOME_STATE.FAILED
        ),
    ready,
    deferRetry: deferred,
    reason: normalizeOptionalString(options.reason),
    reasonCode: resolveTransportSemanticReasonCode(errorCode, deferred),
    errorCode,
    retryAfterMs,
    service:
      options.service &&
        typeof options.service.sendMessage === 'function' ?
        options.service :
        null,
  });
}

function buildTransportDeliveryOutcome(options = {}) {
  const retryAfterMs = normalizePositiveRetryAfterMs(
    options.retryAfterMs,
    null,
  );
  const errorCode = normalizeTransportErrorCode(
    options.errorCode ?? options.code,
  );
  const noHandler = options.noHandler === true;
  const acknowledged = options.acknowledged === true;
  const claimedDeliveryState = normalizeOptionalString(options.deliveryState);
  const completedWithError = options.status === 'completed' &&
    normalizeOptionalString(options.error ?? options.message) !== null;
  const {delivered, deferred, deliveryState} =
    classifyTransportDeliveryState({
      acknowledged,
      claimedDeliveryState,
      deferRetry: options.deferRetry,
      errorCode,
      noHandler,
      retryAfterMs,
      completedWithError,
    });

  return Object.freeze({
    ...options,
    acknowledged,
    deliveryState,
    deferRetry: deferred,
    errorCode,
    retryAfterMs,
    noHandler,
    reasonCode: resolveTransportDeliveryReasonCode(
      errorCode,
      deferred,
      noHandler,
      delivered,
      completedWithError,
    ),
  });
}

function buildQueryTransportSemanticOutcome(
  selection = null,
  options = {},
) {
  const resolvedSelection =
    selection && typeof selection === 'object' ?
      selection :
      {};
  const service =
    resolvedSelection.service &&
      typeof resolvedSelection.service.sendMessage === 'function' ?
      resolvedSelection.service :
      null;

  if (service) {
    return buildTransportSemanticOutcome({
      ready: true,
      service,
      retryAfterMs: resolvedSelection.retryAfterMs,
      errorCode: resolvedSelection.errorCode,
    });
  }

  return buildTransportSemanticOutcome({
    ready: false,
    service: null,
    reason:
      normalizeOptionalString(resolvedSelection.reason) ||
      ROUTER_ERROR_MSG.QUERY_MESSAGE_GROUP_TRANSPORT_REQUIRED,
    errorCode:
      resolvedSelection.errorCode ||
      ROUTER_QUERY_TRANSPORT_NOT_READY_ERROR_CODE,
    retryAfterMs: normalizePositiveRetryAfterMs(
      resolvedSelection.retryAfterMs,
      normalizePositiveRetryAfterMs(options.defaultRetryAfterMs, null),
    ),
    deferRetry: true,
  });
}

function classifyTransportSemanticOutcome(value = null, options = {}) {
  const resolvedValue = value && typeof value === 'object' ? value : {};
  return buildTransportSemanticOutcome({
    ready: resolvedValue.ready === true,
    reason:
      resolvedValue.reason ??
      resolvedValue.error ??
      resolvedValue.message ??
      null,
    errorCode:
      resolvedValue.errorCode ??
      resolvedValue.code ??
      null,
    retryAfterMs:
      normalizePositiveRetryAfterMs(
        resolvedValue.retryAfterMs,
        normalizePositiveRetryAfterMs(options.defaultRetryAfterMs, null),
      ),
    deferRetry: resolvedValue.deferRetry === true,
    service: resolvedValue.service ?? null,
  });
}

function classifyTransportDeliveryOutcome(value = null, options = {}) {
  const resolvedValue = value && typeof value === 'object' ? value : {};
  return buildTransportDeliveryOutcome({
    ...resolvedValue,
    acknowledged: resolvedValue.acknowledged === true,
    error:
      resolvedValue.error ??
      resolvedValue.message ??
      null,
    errorCode:
      resolvedValue.errorCode ??
      resolvedValue.code ??
      null,
    retryAfterMs:
      normalizePositiveRetryAfterMs(
        resolvedValue.retryAfterMs,
        normalizePositiveRetryAfterMs(options.defaultRetryAfterMs, null),
      ),
    deferRetry: resolvedValue.deferRetry === true,
    noHandler: resolvedValue.noHandler === true,
  });
}

function isDeferredTransportSemanticOutcome(outcome = null) {
  return outcome?.state === TRANSPORT_SEMANTIC_OUTCOME_STATE.DEFERRED;
}

function isDeliveredTransportDeliveryOutcome(outcome = null) {
  return outcome?.deliveryState === TRANSPORT_DELIVERY_OUTCOME_STATE.DELIVERED;
}

function isDeferredTransportDeliveryOutcome(outcome = null) {
  return outcome?.deliveryState === TRANSPORT_DELIVERY_OUTCOME_STATE.DEFERRED;
}

export {
  TRANSPORT_DELIVERY_OUTCOME_METADATA_FIELDS,
  ROUTER_CONNECTION_CLOSED_ERROR_CODE,
  ROUTER_MESSAGE_TIMEOUT_ERROR_CODE,
  ROUTER_QUERY_TRANSPORT_NOT_READY_ERROR_CODE,
  TRANSPORT_DELIVERY_OUTCOME_REASON_CODE,
  TRANSPORT_DELIVERY_OUTCOME_STATE,
  TRANSPORT_SEMANTIC_OUTCOME_REASON_CODE,
  TRANSPORT_SEMANTIC_OUTCOME_STATE,
  buildTransportDeliveryOutcome,
  buildQueryTransportSemanticOutcome,
  classifyTransportDeliveryOutcome,
  classifyTransportSemanticOutcome,
  isDeferredTransportDeliveryOutcome,
  isDeferredTransportSemanticOutcome,
  isDeliveredTransportDeliveryOutcome,
};
