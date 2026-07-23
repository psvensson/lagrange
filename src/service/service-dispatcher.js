/**
 * Canonical dispatcher for Service_Message envelopes.
 */

import {LoggingService} from '../logging/logging-service.js';
import {
  SUBSYSTEM,
} from '../constants/index.js';
import {
  TRANSPORT_DELIVERY_OUTCOME_REASON_CODE,
  classifyTransportDeliveryOutcome,
  isDeliveredTransportDeliveryOutcome,
} from '../transport/transport-semantic-outcome.js';
import {assertServiceMessageEnvelope} from './service-message-contract.js';
import {ServicePolicyViolationError} from './service-lifecycle-errors.js';
import {
  REQUEST_CELL_ROUTE_CLASSIFICATION,
  REQUEST_CELL_ROUTE_ERROR_CODE,
  createRoutingFailure,
} from './request-cell-routing-contract.js';

const LOCAL_STR_UNKNOWN_ERROR = 'unknown_error';

const SERVICE_DISPATCHER_ERROR = Object.freeze({
  ROUTER_REQUIRED:
    'messageRouter must provide a deliver(targetAddress, message, options) function',
  LEADER_RESOLVER_REQUIRED:
    'leaderResolver must be a function',
  AUTHN_REQUIRED:
    'authenticate must be a function',
  AUTHZ_REQUIRED:
    'authorize must be a function',
  TARGET_ADDRESS_REQUIRED:
    'leaderResolver must return targetAddress',
  DELIVERY_REJECTED:
    'message delivery was not acknowledged',
  DEADLINE_EXPIRED:
    'Request deadline expired before service dispatch',
  NO_HANDLER: 'no handler',
  PROCESSED_RESPONSE_REQUIRED:
    'message delivery did not include handler completion evidence',
});

const DISPATCHER_POLICY_TYPE = Object.freeze({
  AUTHN: 'authn',
  AUTHZ: 'authz',
});

const DISPATCHER_LOG = Object.freeze({
  DISPATCH_START: 'Dispatching canonical service message',
  DISPATCH_SUCCESS: 'Service message dispatch completed',
  DISPATCH_FAILURE: 'Service message dispatch failed',
});

const DISPATCH_METRIC_STATUS = Object.freeze({
  SUCCESS: 'success',
  FAILURE: 'failure',
  AUTHN_FAILURE: 'authn_failure',
  AUTHZ_FAILURE: 'authz_failure',
});

function resolveRuntimeKind(envelope) {
  return envelope?.runtimeKind ||
    envelope?.payload?.runtimeKind ||
    envelope?.metadata?.runtimeKind ||
    null;
}

function resolveTraceId(envelope, context) {
  return envelope?.traceId ||
    context?.traceId ||
    context?.authn?.traceId ||
    null;
}

function resolveNodeId(context) {
  return context?.nodeId ||
    context?.clientInfo?.nodeId ||
    null;
}

function assertDispatchOpen(context) {
  const signal = context?.signal;
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error ?
    signal.reason :
    createRoutingFailure(
      REQUEST_CELL_ROUTE_ERROR_CODE.SHUTTING_DOWN,
      SERVICE_DISPATCHER_ERROR.DEADLINE_EXPIRED,
      {classification: REQUEST_CELL_ROUTE_CLASSIFICATION.RETRYABLE},
    );
}

function buildDeliveryOptions(target, traceId, context) {
  const deadlineMs = context?.deadlineMs;
  const remainingMs = Number.isFinite(deadlineMs) ?
    deadlineMs - Date.now() :
    null;
  if (remainingMs !== null && remainingMs <= 0) {
    throw createRoutingFailure(
      REQUEST_CELL_ROUTE_ERROR_CODE.DEADLINE_EXHAUSTED,
      SERVICE_DISPATCHER_ERROR.DEADLINE_EXPIRED,
    );
  }
  return {
    responseContext: context?.responseContext,
    signal: context?.signal,
    targetNodeId: target.targetNodeId || null,
    timeoutMs: remainingMs === null ? undefined : remainingMs,
    traceId,
  };
}

function createDeliveryFailure(delivery) {
  if (
    delivery.reasonCode ===
      TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.NO_HANDLER
  ) {
    return createRoutingFailure(
      REQUEST_CELL_ROUTE_ERROR_CODE.ROUTE_UNAVAILABLE,
      `${SERVICE_DISPATCHER_ERROR.DELIVERY_REJECTED}:` +
        ` ${delivery?.error || SERVICE_DISPATCHER_ERROR.NO_HANDLER}`,
      {classification: REQUEST_CELL_ROUTE_CLASSIFICATION.RETRYABLE},
    );
  }
  if (
    delivery.reasonCode ===
      TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.MESSAGE_TIMEOUT
  ) {
    return createRoutingFailure(
      REQUEST_CELL_ROUTE_ERROR_CODE.TRANSPORT_FAILED,
      `${SERVICE_DISPATCHER_ERROR.DELIVERY_REJECTED}: message timeout`,
      {classification: REQUEST_CELL_ROUTE_CLASSIFICATION.AMBIGUOUS},
    );
  }
  return createRoutingFailure(
    REQUEST_CELL_ROUTE_ERROR_CODE.TRANSPORT_FAILED,
    `${SERVICE_DISPATCHER_ERROR.DELIVERY_REJECTED}:` +
      ` ${delivery?.error || LOCAL_STR_UNKNOWN_ERROR}`,
    {classification: REQUEST_CELL_ROUTE_CLASSIFICATION.AMBIGUOUS},
  );
}

class ServiceDispatcher {
  /**
   * @param {Object} options
   * @param {Object} options.messageRouter
   * @param {Function} options.leaderResolver
   * @param {Function} options.authenticate
   * @param {Function} options.authorize
   * @param {Object} [options.logger]
   */
  constructor(options = {}) {
    if (!options.messageRouter ||
      typeof options.messageRouter.deliver !== 'function') {
      throw new TypeError(SERVICE_DISPATCHER_ERROR.ROUTER_REQUIRED);
    }
    if (typeof options.leaderResolver !== 'function') {
      throw new TypeError(SERVICE_DISPATCHER_ERROR.LEADER_RESOLVER_REQUIRED);
    }
    if (typeof options.authenticate !== 'function') {
      throw new TypeError(SERVICE_DISPATCHER_ERROR.AUTHN_REQUIRED);
    }
    if (typeof options.authorize !== 'function') {
      throw new TypeError(SERVICE_DISPATCHER_ERROR.AUTHZ_REQUIRED);
    }

    this._messageRouter = options.messageRouter;
    this._leaderResolver = options.leaderResolver;
    this._authenticate = options.authenticate;
    this._authorize = options.authorize;
    this._logger = options.logger || this._initLogger();
    this._metrics = {
      dispatchTotal: 0,
      dispatchSuccess: 0,
      dispatchFailure: 0,
      authnFailure: 0,
      authzFailure: 0,
      lastDispatchDurationMs: 0,
      dispatchLatencyMsTotal: 0,
      dispatchLatencyMsMax: 0,
      lastError: null,
    };
  }

  /**
   * @return {Object}
   * @private
   */
  _initLogger() {
    try {
      const loggingService = LoggingService.getInstance();
      if (loggingService.isInitialized()) {
        return loggingService.forSubsystem(SUBSYSTEM.SERVICE_LIFECYCLE);
      }
    } catch {
      // Logging service may not be initialized in unit tests.
    }
    return console;
  }

  /**
   * @return {Object}
   */
  getMetrics() {
    return {...this._metrics};
  }

  /**
   * @param {string} status
   * @param {number} durationMs
   * @param {Error|null} [error]
   * @return {void}
   * @private
   */
  _recordDispatchMetrics(status, durationMs, error = null) {
    this._metrics.dispatchTotal += 1;
    this._metrics.lastDispatchDurationMs = durationMs;
    this._metrics.dispatchLatencyMsTotal += durationMs;
    this._metrics.dispatchLatencyMsMax = Math.max(
      this._metrics.dispatchLatencyMsMax,
      durationMs,
    );

    if (status === DISPATCH_METRIC_STATUS.SUCCESS) {
      this._metrics.dispatchSuccess += 1;
      this._metrics.lastError = null;
      return;
    }

    this._metrics.dispatchFailure += 1;
    if (status === DISPATCH_METRIC_STATUS.AUTHN_FAILURE) {
      this._metrics.authnFailure += 1;
    }
    if (status === DISPATCH_METRIC_STATUS.AUTHZ_FAILURE) {
      this._metrics.authzFailure += 1;
    }
    this._metrics.lastError = error ? error.message : null;
  }

  /**
   * @param {Object} envelope
   * @param {Object} context
   * @return {Object}
   * @private
   */
  _buildLogContext(envelope, context) {
    return {
      serviceId: envelope?.serviceId || null,
      serviceType: envelope?.serviceType || null,
      runtimeKind: resolveRuntimeKind(envelope),
      operationId: envelope?.messageId || null,
      operation: envelope?.operation || null,
      traceId: resolveTraceId(envelope, context),
      nodeId: resolveNodeId(context),
    };
  }

  /**
   * Run shared authn/authz checks (fail-closed).
   *
   * @param {Object} envelope
   * @param {Object} context
   * @return {Promise<Object>} Authenticated context.
   * @private
   */
  async _enforceAuthorization(envelope, context) {
    const serviceId = envelope.serviceId || 'unknown';
    let authnResult = null;

    try {
      authnResult = await this._authenticate(envelope, context);
    } catch (error) {
      const violation = new ServicePolicyViolationError(
        DISPATCHER_POLICY_TYPE.AUTHN,
        envelope.operation || 'dispatch',
        serviceId,
        error.message,
        {cause: error},
      );
      violation._dispatchMetricStatus = DISPATCH_METRIC_STATUS.AUTHN_FAILURE;
      throw violation;
    }

    const authorizedContext = {
      ...context,
      authn: authnResult,
    };

    try {
      await this._authorize(envelope, authorizedContext);
    } catch (error) {
      const violation = new ServicePolicyViolationError(
        DISPATCHER_POLICY_TYPE.AUTHZ,
        envelope.operation || 'dispatch',
        serviceId,
        error.message,
        {cause: error},
      );
      violation._dispatchMetricStatus = DISPATCH_METRIC_STATUS.AUTHZ_FAILURE;
      throw violation;
    }

    return authorizedContext;
  }

  /**
   * Dispatch a canonical Service_Message to the resolved leader.
   *
   * @param {Object} envelope
   * @param {Object} [context]
   * @return {Promise<Object>}
   */
  async dispatch(envelope, context = {}) {
    const startedAt = Date.now();
    let validatedEnvelope = null;
    let authorizedContext = context;
    let traceId = null;

    try {
      validatedEnvelope = assertServiceMessageEnvelope(envelope);
      traceId = resolveTraceId(validatedEnvelope, context);
      assertDispatchOpen(context);

      this._logger.debug(DISPATCHER_LOG.DISPATCH_START, {
        ...this._buildLogContext(validatedEnvelope, context),
      });

      authorizedContext = await this._enforceAuthorization(
        validatedEnvelope,
        context,
      );
      assertDispatchOpen(authorizedContext);
      const target = await this._leaderResolver(
        validatedEnvelope,
        authorizedContext,
      );
      assertDispatchOpen(authorizedContext);
      if (!target || typeof target.targetAddress !== 'string') {
        throw new Error(SERVICE_DISPATCHER_ERROR.TARGET_ADDRESS_REQUIRED);
      }

      const delivery = classifyTransportDeliveryOutcome(
        await this._messageRouter.deliver(
          target.targetAddress,
          validatedEnvelope,
          buildDeliveryOptions(target, traceId, authorizedContext),
        ),
      );

      if (!isDeliveredTransportDeliveryOutcome(delivery) ||
          delivery.reasonCode ===
            TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.NO_HANDLER) {
        throw createDeliveryFailure(delivery);
      }
      if (
        authorizedContext?.requireProcessedResponse === true &&
        delivery.processed !== true &&
        delivery.handlerProcessed !== true
      ) {
        throw createRoutingFailure(
          REQUEST_CELL_ROUTE_ERROR_CODE.ACK_ONLY,
          SERVICE_DISPATCHER_ERROR.PROCESSED_RESPONSE_REQUIRED,
          {classification: REQUEST_CELL_ROUTE_CLASSIFICATION.AMBIGUOUS},
        );
      }

      const durationMs = Date.now() - startedAt;
      this._recordDispatchMetrics(
        DISPATCH_METRIC_STATUS.SUCCESS,
        durationMs,
      );
      this._logger.info(DISPATCHER_LOG.DISPATCH_SUCCESS, {
        ...this._buildLogContext(validatedEnvelope, authorizedContext),
        targetAddress: target.targetAddress,
        targetNodeId: target.targetNodeId || null,
        durationMs,
      });

      return {
        envelope: validatedEnvelope,
        target,
        delivery,
      };
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const metricStatus = error._dispatchMetricStatus ||
        DISPATCH_METRIC_STATUS.FAILURE;
      this._recordDispatchMetrics(metricStatus, durationMs, error);
      this._logger.error(DISPATCHER_LOG.DISPATCH_FAILURE, {
        ...this._buildLogContext(validatedEnvelope || envelope, authorizedContext),
        durationMs,
        error: error.message,
      });
      throw error;
    }
  }
}

export {ServiceDispatcher};
