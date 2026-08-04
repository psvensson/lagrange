/**
 * Probe helpers for the handler-aware invocation guard test: pure
 * projections of the route resolvers' and invocation builders' v3
 * behavior, parameterized by generated records, so the test asserts
 * the ABI argument shapes without booting a cluster. Each helper
 * mirrors exactly one production code path (cited per helper); the
 * production paths themselves are covered by their owners' tests.
 */

// Mirrors RequestBindingRouteResolver.resolve's v3 surfacing
// (src/service/request-binding-route-resolver.js): handler_id for
// schema v3 declarations, null otherwise.
function resolveRequestRouteProbe(records, {method, path}) {
  const binding = records.bindings.find((candidate) =>
    candidate.source.kind === 'request' &&
    candidate.source.method === method &&
    candidate.source.path === path);
  if (!binding) throw new Error(`no request binding for ${method} ${path}`);
  return {
    bindingName: binding.name,
    handlerId: binding.schema_version === 3 ?
      binding.target.handler_id :
      null,
  };
}

// Mirrors CallBindingRouteResolver.resolve's v3 surfacing
// (src/service/call-binding-route-resolver.js).
function resolveCallRouteProbe(records, name) {
  const binding = records.bindings.find((candidate) =>
    candidate.source.kind === 'call' && candidate.name === name);
  if (!binding) throw new Error(`no call binding ${name}`);
  return {
    bindingName: binding.name,
    handlerId: binding.schema_version === 3 ?
      binding.target.handler_id :
      null,
  };
}

// Mirrors buildRequestCellInvocation's v3 argument shape
// (src/node/runtime-service-request-cell-handler.js): the handler id is
// the fixed export's first argument; the request JSON follows.
function buildRequestCellInvocationProbe(route, request) {
  const requestJson = JSON.stringify(request);
  return {
    args: typeof route.handlerId === 'string' ?
      [route.handlerId, requestJson] :
      [requestJson],
  };
}

// Mirrors buildCallCellInvocation's v3 argument shape
// (src/node/runtime-service-call-cell-handler.js): the resolved
// operation id is the fixed run/reduce export's first argument, then
// batch-or-partials, then the untouched arguments JSON.
function buildCallCellInvocationProbe(route, call, invocation) {
  const input = invocation.exportName === 'reduce' ?
    invocation.partials :
    invocation.batch;
  return {
    args: typeof route.handlerId === 'string' ?
      [route.handlerId, input, call.arguments] :
      [input, call.arguments],
  };
}

export {
  buildCallCellInvocationProbe,
  buildRequestCellInvocationProbe,
  resolveCallRouteProbe,
  resolveRequestRouteProbe,
};
