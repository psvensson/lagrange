/**
 * Canonical dispatcher for Service_Message envelopes.
 */

import {LoggingService} from '../logging/logging-service.js';
import {
  SUBSYSTEM,
  TYPEOF,
} from '../constants/index.js';
import {
  TRANSPORT_DELIVERY_OUTCOME_REASON_CODE,
  classifyTransportDeliveryOutcome,
  isDeliveredTransportDeliveryOutcome,
} from '../transport/transport-semantic-outcome.js';
import {assertServiceMessageEnvelope} from './service-message-contract.js';
import {ServicePolicyViolationError} from './service-lifecycle-errors.js';

const LOCAL_NUM_ZERO = 0;
const LOCAL_NUM_ONE = 1;
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
      typeof options.messageRouter.deliver !== TYPEOF.FUNCTION) {
      throw new TypeError(SERVICE_DISPATCHER_ERROR.ROUTER_REQUIRED);
    }
    if (typeof options.leaderResolver !== TYPEOF.FUNCTION) {
      throw new TypeError(SERVICE_DISPATCHER_ERROR.LEADER_RESOLVER_REQUIRED);
    }
    if (typeof options.authenticate !== TYPEOF.FUNCTION) {
      throw new TypeError(SERVICE_DISPATCHER_ERROR.AUTHN_REQUIRED);
    }
    if (typeof options.authorize !== TYPEOF.FUNCTION) {
      throw new TypeError(SERVICE_DISPATCHER_ERROR.AUTHZ_REQUIRED);
    }

    this._messageRouter = options.messageRouter;
    this._leaderResolver = options.leaderResolver;
    this._authenticate = options.authenticate;
    this._authorize = options.authorize;
    this._logger = options.logger || this._initLogger();
    this._metrics = {
      dispatchTotal: LOCAL_NUM_ZERO,
      dispatchSuccess: LOCAL_NUM_ZERO,
      dispatchFailure: LOCAL_NUM_ZERO,
      authnFailure: LOCAL_NUM_ZERO,
      authzFailure: LOCAL_NUM_ZERO,
      lastDispatchDurationMs: LOCAL_NUM_ZERO,
      dispatchLatencyMsTotal: LOCAL_NUM_ZERO,
      dispatchLatencyMsMax: LOCAL_NUM_ZERO,
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
    this._metrics.dispatchTotal += LOCAL_NUM_ONE;
    this._metrics.lastDispatchDurationMs = durationMs;
    this._metrics.dispatchLatencyMsTotal += durationMs;
    this._metrics.dispatchLatencyMsMax = Math.max(
      this._metrics.dispatchLatencyMsMax,
      durationMs,
    );

    if (status === DISPATCH_METRIC_STATUS.SUCCESS) {
      this._metrics.dispatchSuccess += LOCAL_NUM_ONE;
      this._metrics.lastError = null;
      return;
    }

    this._metrics.dispatchFailure += LOCAL_NUM_ONE;
    if (status === DISPATCH_METRIC_STATUS.AUTHN_FAILURE) {
      this._metrics.authnFailure += LOCAL_NUM_ONE;
    }
    if (status === DISPATCH_METRIC_STATUS.AUTHZ_FAILURE) {
      this._metrics.authzFailure += LOCAL_NUM_ONE;
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

      this._logger.debug(DISPATCHER_LOG.DISPATCH_START, {
        ...this._buildLogContext(validatedEnvelope, context),
      });

      authorizedContext = await this._enforceAuthorization(
        validatedEnvelope,
        context,
      );
      const target = await this._leaderResolver(
        validatedEnvelope,
        authorizedContext,
      );
      if (!target || typeof target.targetAddress !== TYPEOF.STRING) {
        throw new Error(SERVICE_DISPATCHER_ERROR.TARGET_ADDRESS_REQUIRED);
      }

      const delivery = classifyTransportDeliveryOutcome(
        await this._messageRouter.deliver(
          target.targetAddress,
          validatedEnvelope,
          {
            targetNodeId: target.targetNodeId || null,
            traceId,
          },
        ),
      );

      if (!isDeliveredTransportDeliveryOutcome(delivery) ||
          delivery.reasonCode ===
            TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.NO_HANDLER) {
        throw new Error(
          `${SERVICE_DISPATCHER_ERROR.DELIVERY_REJECTED}:` +
          ` ${delivery?.error || LOCAL_STR_UNKNOWN_ERROR}`,
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
