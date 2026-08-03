import {CallBindingRouteResolver} from
  './call-binding-route-resolver.js';
import {
  CALL_CELL_ROUTE_CLASSIFICATION,
  CALL_CELL_ROUTE_ERROR_CODE,
  createCallRoutingFailure,
} from './call-cell-routing-contract.js';
import {CallCellStatementAdapter} from
  './call-cell-statement-adapter.js';
import {createEnvelopeDispatchGuards} from
  './cell-ingress-transport.js';
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

const {
  authenticateEnvelope,
  authorizeEnvelope,
  createLazyMessageRouter,
  resolveSelectedTarget,
} = createEnvelopeDispatchGuards({
  applicationRole: APPLICATION_ROLE,
  createAuthenticationFailure: () => createCallRoutingFailure(
    CALL_CELL_ROUTE_ERROR_CODE.AUTHENTICATION_FAILED,
    CALL_CELL_ROUTING_SURFACE_MESSAGE.SECURITY_CONTEXT_INVALID,
  ),
  createAuthorizationFailure: () => createCallRoutingFailure(
    CALL_CELL_ROUTE_ERROR_CODE.AUTHORIZATION_FAILED,
    CALL_CELL_ROUTING_SURFACE_MESSAGE.NOT_AUTHORIZED,
  ),
  createRouterUnavailableFailure: () => createCallRoutingFailure(
    CALL_CELL_ROUTE_ERROR_CODE.ROUTE_UNAVAILABLE,
    CALL_CELL_ROUTING_SURFACE_MESSAGE.ROUTER_UNAVAILABLE,
    {classification: CALL_CELL_ROUTE_CLASSIFICATION.RETRYABLE},
  ),
  createTargetStaleFailure: () => createCallRoutingFailure(
    CALL_CELL_ROUTE_ERROR_CODE.TARGET_STALE,
    CALL_CELL_ROUTING_SURFACE_MESSAGE.TARGET_MISMATCH,
  ),
});

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
