import {RequestBindingRouteResolver} from
  './request-binding-route-resolver.js';
import {
  createRequestCellBasicAuthenticator,
} from './request-cell-http-authenticator.js';
import {RequestCellHttpAdapter} from
  './request-cell-http-adapter.js';
import {
  REQUEST_CELL_ROUTE_CLASSIFICATION,
  REQUEST_CELL_ROUTE_ERROR_CODE,
  createRoutingFailure,
} from './request-cell-routing-contract.js';
import {ServiceDispatcher} from './service-dispatcher.js';

const APPLICATION_ROLE = 'application';
const REQUEST_CELL_ROUTING_SURFACE_MESSAGE = Object.freeze({
  NOT_AUTHORIZED: 'Principal is not authorized to invoke request Cells',
  ROUTER_UNAVAILABLE:
    'MessageRouter is unavailable for request Cell delivery',
  SECURITY_CONTEXT_INVALID:
    'Service dispatch security context is not server-derived and frozen',
  TARGET_MISMATCH:
    'Selected request Cell route does not match the Service_Message',
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
    throw createRoutingFailure(
      REQUEST_CELL_ROUTE_ERROR_CODE.AUTHENTICATION_FAILED,
      REQUEST_CELL_ROUTING_SURFACE_MESSAGE.SECURITY_CONTEXT_INVALID,
    );
  }
  return securityContext;
}

function authorizeEnvelope(_envelope, context) {
  const securityContext = context?.authn;
  if (!securityContext?.roles?.includes(APPLICATION_ROLE)) {
    throw createRoutingFailure(
      REQUEST_CELL_ROUTE_ERROR_CODE.AUTHORIZATION_FAILED,
      REQUEST_CELL_ROUTING_SURFACE_MESSAGE.NOT_AUTHORIZED,
    );
  }
}

function resolveSelectedTarget(envelope, context) {
  const route = context?.selectedRoute;
  if (!routeFieldsMatch(envelope, route)) {
    throw createRoutingFailure(
      REQUEST_CELL_ROUTE_ERROR_CODE.TARGET_STALE,
      REQUEST_CELL_ROUTING_SURFACE_MESSAGE.TARGET_MISMATCH,
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
        throw createRoutingFailure(
          REQUEST_CELL_ROUTE_ERROR_CODE.ROUTE_UNAVAILABLE,
          REQUEST_CELL_ROUTING_SURFACE_MESSAGE.ROUTER_UNAVAILABLE,
          {classification: REQUEST_CELL_ROUTE_CLASSIFICATION.RETRYABLE},
        );
      }
      return messageRouter.deliver(targetAddress, message, options);
    },
  };
}

function createRequestCellRoutingSurface(options = {}) {
  const messageRouterProvider =
    typeof options.messageRouterProvider === 'function' ?
      options.messageRouterProvider :
      () => options.messageRouter || null;
  const routeResolver = options.routeResolver ||
    new RequestBindingRouteResolver({
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
  const httpAdapter = options.httpAdapter ||
    new RequestCellHttpAdapter({
      authenticateRequest:
        options.authenticateRequest ||
        createRequestCellBasicAuthenticator(options.env),
      deadlineMs: options.deadlineMs,
      maxAttempts: options.maxAttempts,
      maxInFlight: options.maxInFlight,
      maxInFlightPerTarget: options.maxInFlightPerTarget,
      routeResolver,
      serviceDispatcher,
    });
  return Object.freeze({
    httpAdapter,
    routeResolver,
    serviceDispatcher,
  });
}

export {
  createRequestCellRoutingSurface,
};
