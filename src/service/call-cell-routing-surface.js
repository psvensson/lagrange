import {CallBindingRouteResolver} from
  './call-binding-route-resolver.js';
import {
  CALL_CELL_ROUTE_CLASSIFICATION,
  CALL_CELL_ROUTE_ERROR_CODE,
  createCallRoutingFailure,
} from './call-cell-routing-contract.js';
import {CallCellStatementAdapter} from
  './call-cell-statement-adapter.js';
import {ServiceDispatcher} from './service-dispatcher.js';

const APPLICATION_ROLE = 'application';
const CALL_CELL_ROUTING_SURFACE_MESSAGE = Object.freeze({
  NOT_AUTHORIZED: 'Principal is not authorized to invoke call Cells',
  ROUTER_UNAVAILABLE:
    'MessageRouter is unavailable for call Cell delivery',
  SECURITY_CONTEXT_INVALID:
    'Service dispatch security context is not server-derived and frozen',
  TARGET_MISMATCH:
    'Selected call Cell route does not match the Service_Message',
});

function routeFieldsMatch(envelope, route) {
  const selected = envelope?.payload?.route;
  if (!selected || !route) return false;
  const fields = [
    'bindingVersionId',
    'replicaId',
    'serviceId',
    'targetNodeId',
  ];
  return fields.every((field) => selected[field] === route[field]) &&
    envelope.serviceId === route.serviceId;
}

function authenticateEnvelope(envelope, context) {
  const securityContext = context?.securityContext;
  if (
    !Object.isFrozen(securityContext) ||
    !Object.isFrozen(securityContext?.roles) ||
    envelope?.tenantId !== securityContext?.tenantId ||
    envelope?.principal !== securityContext?.principal
  ) {
    throw createCallRoutingFailure(
      CALL_CELL_ROUTE_ERROR_CODE.AUTHENTICATION_FAILED,
      CALL_CELL_ROUTING_SURFACE_MESSAGE.SECURITY_CONTEXT_INVALID,
    );
  }
  return securityContext;
}

function authorizeEnvelope(_envelope, context) {
  const securityContext = context?.authn;
  if (!securityContext?.roles?.includes(APPLICATION_ROLE)) {
    throw createCallRoutingFailure(
      CALL_CELL_ROUTE_ERROR_CODE.AUTHORIZATION_FAILED,
      CALL_CELL_ROUTING_SURFACE_MESSAGE.NOT_AUTHORIZED,
    );
  }
}

function resolveSelectedTarget(envelope, context) {
  const route = context?.selectedRoute;
  if (!routeFieldsMatch(envelope, route)) {
    throw createCallRoutingFailure(
      CALL_CELL_ROUTE_ERROR_CODE.TARGET_STALE,
      CALL_CELL_ROUTING_SURFACE_MESSAGE.TARGET_MISMATCH,
    );
  }
  return {
    targetAddress: route.targetAddress,
    targetNodeId: route.targetNodeId,
  };
}

function createLazyMessageRouter(provider) {
  return {
    async deliver(targetAddress, message, options) {
      const messageRouter = provider();
      if (!messageRouter ||
          typeof messageRouter.deliver !== 'function') {
        throw createCallRoutingFailure(
          CALL_CELL_ROUTE_ERROR_CODE.ROUTE_UNAVAILABLE,
          CALL_CELL_ROUTING_SURFACE_MESSAGE.ROUTER_UNAVAILABLE,
          {classification: CALL_CELL_ROUTE_CLASSIFICATION.RETRYABLE},
        );
      }
      return messageRouter.deliver(targetAddress, message, options);
    },
  };
}

function createCallCellRoutingSurface(options = {}) {
  const messageRouterProvider =
    typeof options.messageRouterProvider === 'function' ?
      options.messageRouterProvider :
      () => options.messageRouter || null;
  const routeResolver = options.routeResolver ||
    new CallBindingRouteResolver({
      systemTableCache: options.systemTableCache,
      systemTableCacheProvider: options.systemTableCacheProvider,
    });
  const serviceDispatcher = options.serviceDispatcher ||
    new ServiceDispatcher({
      authenticate: authenticateEnvelope,
      authorize: options.authorize || authorizeEnvelope,
      leaderResolver: resolveSelectedTarget,
      logger: options.logger,
      messageRouter: createLazyMessageRouter(messageRouterProvider),
    });
  const statementAdapter = options.statementAdapter ||
    new CallCellStatementAdapter({
      deadlineMs: options.deadlineMs,
      maxAttempts: options.maxAttempts,
      maxInFlight: options.maxInFlight,
      maxInFlightPerTarget: options.maxInFlightPerTarget,
      routeResolver,
      serviceDispatcher,
    });
  return Object.freeze({
    routeResolver,
    serviceDispatcher,
    statementAdapter,
  });
}

export {
  createCallCellRoutingSurface,
};
