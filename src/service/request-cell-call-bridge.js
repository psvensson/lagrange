/**
 * RequestCellCallBridge — parent-side owner of a request Cell's bridged
 * `call-binding` host import (the "Reuse The Existing Call Owner",
 * "Preserve Security Context", "Budget Composition", "Recursion And
 * Cycles", "Failure Mapping", and "Invocation Identity And Replay"
 * contracts in
 * docs/development/http-endpoint-distributed-call-composition-brief.md).
 *
 * One bridged call delegates to the one existing CallCellInvoker under a
 * system-owned child identity derived from the outer request invocation
 * id. Identity and authority are read ONLY from the receiver-built
 * invocation record threaded through the driver — never from
 * guest-supplied fields. The target is authorized against the source
 * service's declared outbound-call policy before anything is dispatched,
 * the deadline is the tighter of the outer invocation budget and the
 * deployment default, and every invoker failure is mapped through one
 * frozen decision table onto the closed host-call code set with fixed
 * messages so parent-side internals never reach the guest.
 */

import {
  DEFAULT_REQUEST_HOST_CALL_BUDGET,
  HOST_CALL_ERROR_CODE,
} from '../runtime/cell-host-call-protocol.js';
import {
  RUNTIME_ACCESS_POLICY_BINDING_PATTERN,
  isOutboundCallAllowed,
} from '../control-plane/owners/runtime-access-policy-owner.js';
import {
  CALL_CELL_ROUTE_ERROR_CODE,
  createCallChildInvocationId,
  normalizeCallArguments,
  publicCallOutcomeOf,
} from './call-cell-routing-contract.js';

// Sequential multi-call fan-out per request invocation (H3): one
// outstanding child call at a time, incrementing child ordinals (#call-1,
// #call-2, ...) up to the per-request call budget, and depth-1 only (a
// child invocation id carrying #call- cannot spawn a grandchild).
const REQUEST_CALL_BRIDGE_MAX_NESTED_CALLS_DEFAULT =
  DEFAULT_REQUEST_HOST_CALL_BUDGET;
const REQUEST_CALL_BRIDGE_INITIAL_ORDINAL = 1;
const REQUEST_CALL_BRIDGE_CHILD_DEPTH = 1;
const REQUEST_CALL_BRIDGE_MAX_TRACKED_INVOCATIONS = 1024;
const REQUEST_CALL_BRIDGE_DEADLINE_DEFAULT_MS = 30000; // ends-on: the host-call response arrives
const LOCAL_STR_CALLER_SERVICE_ID = 'callerServiceId';

const REQUEST_CALL_BRIDGE_CONTRACT_MESSAGE = Object.freeze({
  INVOKER_REQUIRED:
    'createRequestCellCallBridge requires a callCellInvoker with ' +
    'invoke(request)',
  POLICY_OWNER_REQUIRED:
    'createRequestCellCallBridge requires a runtimeAccessPolicyOwner ' +
    'with getOutboundCallPolicy(serviceId)',
});

// Fixed guest-visible refusal messages, one per emitted host-call code.
// Inner failure text (invoker internals, route detail, policy reasons)
// never rides along; the full inner failure is logged parent-side at
// debug with the call-chain record instead.
const REQUEST_CALL_BRIDGE_MESSAGE = Object.freeze({
  [HOST_CALL_ERROR_CODE.CALL_BRIDGE_UNAVAILABLE]:
    'Binding call refused: the request-call bridge is not fully composed',
  [HOST_CALL_ERROR_CODE.DEADLINE_EXHAUSTED]:
    'Binding call deadline exhausted',
  [HOST_CALL_ERROR_CODE.INVALID_ARGUMENTS]:
    'Binding call name or arguments are invalid',
  [HOST_CALL_ERROR_CODE.RECURSION_REFUSED]:
    'Binding call refused: nested binding-call depth exhausted',
  [HOST_CALL_ERROR_CODE.REQUEST_CLIENT_CLOSED]:
    'Binding call refused: the request-scoped client is closed',
  [HOST_CALL_ERROR_CODE.TARGET_FAILED]:
    'Binding call target failed',
  [HOST_CALL_ERROR_CODE.TARGET_NOT_ALLOWED]:
    'Binding call target is not declared by the caller outbound-call ' +
    'policy',
  [HOST_CALL_ERROR_CODE.TARGET_NOT_INVOCABLE]:
    'Binding call target is not an invocable call Binding',
  [HOST_CALL_ERROR_CODE.TARGET_UNAVAILABLE]:
    'Binding call target is currently unavailable',
  [HOST_CALL_ERROR_CODE.UNFINISHED_CHILD_WORK]:
    'Binding call refused: request returned with unfinished child work',
  [HOST_CALL_ERROR_CODE.UNSUPPORTED_CONCURRENCY]:
    'Binding call refused: concurrent host calls are not supported',
});

// The code translation table: CallCellRoutingError codes from the
// delegated invoker onto the closed host-call code set. Any code absent
// here — component/handler failures, ack-only, transport, unknown or
// untyped throws — maps to the fixed target_failed record. Retryability
// is NOT decided by code: a delegated failure carries the call routing
// contract's retrySafe (publicCallOutcomeOf), the one owner of whether
// guest code of that invocation can have run.
const CALL_CELL_TO_HOST_CALL_CODE = Object.freeze({
  [CALL_CELL_ROUTE_ERROR_CODE.AUTHENTICATION_FAILED]:
    HOST_CALL_ERROR_CODE.TARGET_NOT_ALLOWED,
  [CALL_CELL_ROUTE_ERROR_CODE.AUTHORIZATION_FAILED]:
    HOST_CALL_ERROR_CODE.TARGET_NOT_ALLOWED,
  [CALL_CELL_ROUTE_ERROR_CODE.DEADLINE_EXHAUSTED]:
    HOST_CALL_ERROR_CODE.DEADLINE_EXHAUSTED,
  [CALL_CELL_ROUTE_ERROR_CODE.HOST_CELL_UNAVAILABLE]:
    HOST_CALL_ERROR_CODE.TARGET_UNAVAILABLE,
  [CALL_CELL_ROUTE_ERROR_CODE.INVALID_ARGUMENTS]:
    HOST_CALL_ERROR_CODE.INVALID_ARGUMENTS,
  [CALL_CELL_ROUTE_ERROR_CODE.NOT_INVOCABLE]:
    HOST_CALL_ERROR_CODE.TARGET_NOT_INVOCABLE,
  [CALL_CELL_ROUTE_ERROR_CODE.REDUCE_INCOMPLETE]:
    HOST_CALL_ERROR_CODE.TARGET_UNAVAILABLE,
  [CALL_CELL_ROUTE_ERROR_CODE.ROUTE_NOT_FOUND]:
    HOST_CALL_ERROR_CODE.TARGET_NOT_INVOCABLE,
  [CALL_CELL_ROUTE_ERROR_CODE.ROUTE_UNAVAILABLE]:
    HOST_CALL_ERROR_CODE.TARGET_UNAVAILABLE,
  [CALL_CELL_ROUTE_ERROR_CODE.SHUTTING_DOWN]:
    HOST_CALL_ERROR_CODE.TARGET_UNAVAILABLE,
  [CALL_CELL_ROUTE_ERROR_CODE.STATEMENT_INVALID]:
    HOST_CALL_ERROR_CODE.INVALID_ARGUMENTS,
  [CALL_CELL_ROUTE_ERROR_CODE.TARGET_STALE]:
    HOST_CALL_ERROR_CODE.TARGET_UNAVAILABLE,
});

const REQUEST_CALL_BRIDGE_DELEGATED_FAILURE_LOG =
  'request-call bridge: delegated call-cell invocation failed';

function bridgeFailure(code, retryable = false) {
  const error = new Error(REQUEST_CALL_BRIDGE_MESSAGE[code]);
  error.code = code;
  error.retryable = retryable;
  return error;
}

// The canonical server-derived shape the statement adapter downstream
// requires (call-cell-statement-adapter.js): frozen record, frozen roles
// array, non-empty tenantId and principal. Anything else is a
// composition defect — the bridge never repairs or guesses identity.
function isCanonicalSecurityContext(context) {
  return Object.isFrozen(context) &&
    Array.isArray(context?.roles) &&
    Object.isFrozen(context.roles) &&
    typeof context?.tenantId === 'string' &&
    context.tenantId.length > 0 &&
    typeof context?.principal === 'string' &&
    context.principal.length > 0;
}

// Effective budget = the tighter of the outer invocation's absolute
// deadline and now + the deployment default — never undefined, so a
// bridged call can never outlive either budget.
function resolveBridgeDeadline(outerDeadlineMs, deadlineDefaultMs) {
  const defaultDeadlineMs = Date.now() + deadlineDefaultMs;
  return Number.isFinite(outerDeadlineMs) ?
    Math.min(outerDeadlineMs, defaultDeadlineMs) :
    defaultDeadlineMs;
}

function positiveIntegerOr(value, fallback) {
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

/**
 * @param {object} options
 * @param {{invoke: Function}} options.callCellInvoker the one existing
 *   call-cell invocation owner
 * @param {{getOutboundCallPolicy: Function}}
 *   options.runtimeAccessPolicyOwner outbound-call policy read surface
 * @param {number} [options.deadlineDefaultMs] deployment default budget
 * @param {number} [options.maxNestedCalls] bridged-call chain budget
 * @param {{debug?: Function}} [options.logger]
 * @return {{invoke: (bridgeCall: object) => Promise<string>}}
 */
function createRequestCellCallBridge(options = {}) {
  const callCellInvoker = options.callCellInvoker;
  if (typeof callCellInvoker?.invoke !== 'function') {
    throw new TypeError(
      REQUEST_CALL_BRIDGE_CONTRACT_MESSAGE.INVOKER_REQUIRED);
  }
  const runtimeAccessPolicyOwner = options.runtimeAccessPolicyOwner;
  if (typeof runtimeAccessPolicyOwner?.getOutboundCallPolicy !==
      'function') {
    throw new TypeError(
      REQUEST_CALL_BRIDGE_CONTRACT_MESSAGE.POLICY_OWNER_REQUIRED);
  }
  const deadlineDefaultMs = positiveIntegerOr(
    options.deadlineDefaultMs, REQUEST_CALL_BRIDGE_DEADLINE_DEFAULT_MS);
  const maxNestedCalls = positiveIntegerOr(
    options.maxNestedCalls, REQUEST_CALL_BRIDGE_MAX_NESTED_CALLS_DEFAULT);
  const logger = options.logger || null;
  const invocationStates = new Map();

  function getOrCreateInvocationState(outerInvocationId) {
    let state = invocationStates.get(outerInvocationId);
    if (!state) {
      if (invocationStates.size >= REQUEST_CALL_BRIDGE_MAX_TRACKED_INVOCATIONS) {
        const oldestKey = invocationStates.keys().next().value;
        invocationStates.delete(oldestKey);
      }
      state = {
        closed: false,
        concurrencyViolated: false,
        inFlight: 0,
        nextOrdinal: REQUEST_CALL_BRIDGE_INITIAL_ORDINAL,
      };
      invocationStates.set(outerInvocationId, state);
    }
    return state;
  }

  // Step owners keep each function inside the complexity threshold while
  // preserving the exact refusal order: arguments, identity, policy,
  // recursion/concurrency, then delegation.
  function requireValidatedCallShape(bridgeCall) {
    const name = bridgeCall?.name;
    if (typeof name !== 'string' ||
        !RUNTIME_ACCESS_POLICY_BINDING_PATTERN.test(name)) {
      throw bridgeFailure(HOST_CALL_ERROR_CODE.INVALID_ARGUMENTS);
    }
    try {
      return {argumentsJson: normalizeCallArguments(bridgeCall?.argumentsJson),
        name};
    } catch (_error) {
      throw bridgeFailure(HOST_CALL_ERROR_CODE.INVALID_ARGUMENTS);
    }
  }

  // Identity and authority come ONLY from the receiver-built invocation
  // record the driver threads through; top-level fields on the bridge
  // call are protocol payload, never trusted identity. An absent or
  // non-canonical context is a composition defect — fail closed as
  // bridge-not-composed rather than guessing identity.
  function requireCanonicalInvocation(bridgeCall) {
    const invocation = bridgeCall?.invocation;
    if (!isCanonicalSecurityContext(invocation?.securityContext) ||
        typeof invocation?.invocationId !== 'string' ||
        invocation.invocationId.length === 0) {
      throw bridgeFailure(HOST_CALL_ERROR_CODE.CALL_BRIDGE_UNAVAILABLE);
    }
    return invocation;
  }

  function assertNotChainedChildId(outerInvocationId) {
    try {
      createCallChildInvocationId(
        outerInvocationId,
        REQUEST_CALL_BRIDGE_INITIAL_ORDINAL,
      );
    } catch (_error) {
      throw bridgeFailure(HOST_CALL_ERROR_CODE.RECURSION_REFUSED);
    }
  }

  function allocateChildInvocation(outerInvocationId) {
    assertNotChainedChildId(outerInvocationId);
    const state = getOrCreateInvocationState(outerInvocationId);
    if (state.closed) {
      throw bridgeFailure(HOST_CALL_ERROR_CODE.REQUEST_CLIENT_CLOSED);
    }
    if (state.inFlight > 0 || state.concurrencyViolated) {
      state.concurrencyViolated = true;
      throw bridgeFailure(HOST_CALL_ERROR_CODE.UNSUPPORTED_CONCURRENCY);
    }
    if (state.nextOrdinal > maxNestedCalls) {
      throw bridgeFailure(HOST_CALL_ERROR_CODE.RECURSION_REFUSED);
    }
    const ordinal = state.nextOrdinal;
    state.nextOrdinal += 1;
    state.inFlight += 1;
    return {
      childInvocationId: createCallChildInvocationId(
        outerInvocationId,
        ordinal,
      ),
      ordinal,
      state,
    };
  }

  function completeInvocation(outerInvocationId) {
    const state = invocationStates.get(outerInvocationId);
    if (!state) return;
    state.closed = true;
    if (state.inFlight > 0) {
      throw bridgeFailure(HOST_CALL_ERROR_CODE.UNFINISHED_CHILD_WORK);
    }
    invocationStates.delete(outerInvocationId);
  }

  function buildDelegatedInvokeRequest({
    argumentsJson,
    childInvocationId,
    invocation,
    name,
    sourceServiceId,
  }) {
    const deadlineMs = resolveBridgeDeadline(
      invocation.deadlineMs,
      deadlineDefaultMs,
    );
    const invokeRequest = {
      argumentsJson,
      deadlineMs,
      invocationId: childInvocationId,
      name,
      securityContext: invocation.securityContext,
    };
    if (sourceServiceId) {
      Object.defineProperty(invokeRequest, LOCAL_STR_CALLER_SERVICE_ID, {
        configurable: true,
        enumerable: false,
        value: sourceServiceId,
        writable: true,
      });
    }
    return invokeRequest;
  }

  function assertPostCallState(state) {
    if (state.concurrencyViolated) {
      throw bridgeFailure(HOST_CALL_ERROR_CODE.UNSUPPORTED_CONCURRENCY);
    }
    if (state.closed) {
      throw bridgeFailure(HOST_CALL_ERROR_CODE.UNFINISHED_CHILD_WORK);
    }
  }

  function rethrowDelegatedFailure(error, callChain) {
    if (error?.code === HOST_CALL_ERROR_CODE.UNSUPPORTED_CONCURRENCY ||
        error?.code === HOST_CALL_ERROR_CODE.UNFINISHED_CHILD_WORK) {
      throw error;
    }
    logger?.debug?.(REQUEST_CALL_BRIDGE_DELEGATED_FAILURE_LOG, {
      callChain,
      code: error?.code,
      message: error?.message,
    });
    throw bridgeFailure(
      CALL_CELL_TO_HOST_CALL_CODE[error?.code] ??
        HOST_CALL_ERROR_CODE.TARGET_FAILED,
      publicCallOutcomeOf(error).retrySafe,
    );
  }

  async function invoke(bridgeCall) {
    const {argumentsJson, name} = requireValidatedCallShape(bridgeCall);
    const invocation = requireCanonicalInvocation(bridgeCall);
    const sourceServiceId = invocation.invocationServiceId;
    const policy = await runtimeAccessPolicyOwner.getOutboundCallPolicy(
      sourceServiceId);
    if (!isOutboundCallAllowed(policy, name)) {
      throw bridgeFailure(HOST_CALL_ERROR_CODE.TARGET_NOT_ALLOWED);
    }
    const {childInvocationId, ordinal, state} = allocateChildInvocation(
      invocation.invocationId);
    const callChain = Object.freeze({
      depth: REQUEST_CALL_BRIDGE_CHILD_DEPTH,
      ordinal,
      sourceServiceId,
      targetBindingName: name,
    });
    const invokeRequest = buildDelegatedInvokeRequest({
      argumentsJson,
      childInvocationId,
      invocation,
      name,
      sourceServiceId,
    });
    try {
      const value = await callCellInvoker.invoke(invokeRequest);
      assertPostCallState(state);
      return value;
    } catch (error) {
      rethrowDelegatedFailure(error, callChain);
    } finally {
      state.inFlight -= 1;
    }
  }

  return Object.freeze({completeInvocation, invoke});
}

export {createRequestCellCallBridge};
