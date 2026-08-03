/**
 * RequestCellCallBridge owner guard: one bridged binding call delegates
 * to the CallCellInvoker under the system-owned '#call-' child identity
 * with the receiver-threaded frozen security context and the tighter of
 * the two deadline budgets; undeclared targets are refused BEFORE any
 * dispatch; an absent/non-canonical context fails closed as
 * bridge-not-composed; the depth guard refuses a chained bridged call;
 * and every invoker failure code maps through the frozen decision table
 * onto the closed host-call code set with fixed messages (never inner
 * error text). Collaborators are stubbed at their real API seams.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  HOST_CALL_ERROR_CODE,
  isHostCallCodeRetryable,
} from '../../src/runtime/cell-host-call-protocol.js';
import {
  CALL_CELL_ROUTE_ERROR_CODE,
  createCallRoutingFailure,
} from '../../src/service/call-cell-routing-contract.js';
import {createRequestCellCallBridge} from
  '../../src/service/request-cell-call-bridge.js';

const SECURITY_CONTEXT = Object.freeze({
  principal: 'app-1',
  roles: Object.freeze(['application']),
  tenantId: 'tenant-1',
});
const SOURCE_SERVICE_ID = 'request-cell-service-1';
const TARGET_NAME = 'account-summary';
const UNDECLARED_NAME = 'undeclared-target';
const OUTER_INVOCATION_ID = 'request-invocation-1';
const CHILD_INVOCATION_ID = 'request-invocation-1#call-1';
const CHAINED_INVOCATION_ID = 'request-invocation-1#call-1';
const RESULT_JSON = '{"summary":"ok"}';
const ARGUMENTS_JSON = '{"month":"2026-07"}';
const DEADLINE_DEFAULT_MS = 30000;
const OUTER_BUDGET_SHORT_MS = 5000;
const OUTER_BUDGET_LONG_MS = 120000;
const DEADLINE_SLACK_MS = 2000;
const POLICY_STATUS_RESOLVED = 'resolved';
const POLICY_STATUS_DENIED = 'denied';
const POLICY_DENIED_REASON = 'policy_not_found';
const INNER_SECRET_MESSAGE = 'inner secret routing detail';

function resolvedPolicy(calls) {
  return Object.freeze({
    calls: Object.freeze(calls),
    status: POLICY_STATUS_RESOLVED,
  });
}

function makeCollaborators(overrides = {}) {
  const observed = {invocations: [], policyLookups: []};
  const callCellInvoker = {
    invoke: overrides.invoke ?? (async (request) => {
      observed.invocations.push(request);
      return RESULT_JSON;
    }),
  };
  const runtimeAccessPolicyOwner = {
    getOutboundCallPolicy:
      overrides.getOutboundCallPolicy ?? (async (serviceId) => {
        observed.policyLookups.push(serviceId);
        return resolvedPolicy([TARGET_NAME]);
      }),
  };
  return {callCellInvoker, observed, runtimeAccessPolicyOwner};
}

function makeBridge(collaborators, options = {}) {
  return createRequestCellCallBridge({
    callCellInvoker: collaborators.callCellInvoker,
    deadlineDefaultMs: DEADLINE_DEFAULT_MS,
    runtimeAccessPolicyOwner: collaborators.runtimeAccessPolicyOwner,
    ...options,
  });
}

function makeBridgeCall(overrides = {}, invocationOverrides = {}) {
  return {
    argumentsJson: ARGUMENTS_JSON,
    invocation: {
      deadlineMs: Date.now() + OUTER_BUDGET_SHORT_MS,
      invocationId: OUTER_INVOCATION_ID,
      invocationServiceId: SOURCE_SERVICE_ID,
      securityContext: SECURITY_CONTEXT,
      ...invocationOverrides,
    },
    name: TARGET_NAME,
    replicaContext: {},
    ...overrides,
  };
}

async function captureRefusal(promise) {
  return promise.then(
    () => null,
    (error) => error,
  );
}

test('a declared target delegates the exact composed request to the ' +
  'invoker', async (t) => {
  const collaborators = makeCollaborators();
  const outerDeadlineMs = Date.now() + OUTER_BUDGET_SHORT_MS;
  const result = await makeBridge(collaborators).invoke(
    makeBridgeCall({}, {deadlineMs: outerDeadlineMs}));
  t.equal(result, RESULT_JSON, 'the invoker result string is returned');
  t.same(collaborators.observed.policyLookups, [SOURCE_SERVICE_ID],
    'the policy is read for the source request Cell service id');
  t.equal(collaborators.observed.invocations.length, 1);
  const request = collaborators.observed.invocations[0];
  t.same(request, {
    argumentsJson: ARGUMENTS_JSON,
    deadlineMs: outerDeadlineMs,
    invocationId: CHILD_INVOCATION_ID,
    name: TARGET_NAME,
    securityContext: SECURITY_CONTEXT,
  }, 'exact composed request: normalized arguments, child identity, ' +
    'and the shorter outer deadline');
  t.equal(request.securityContext, SECURITY_CONTEXT,
    'the frozen receiver-threaded context is passed by reference, ' +
      'never rebuilt');
});

test('the default budget wins when the outer deadline is longer',
  async (t) => {
    const collaborators = makeCollaborators();
    const before = Date.now();
    await makeBridge(collaborators).invoke(makeBridgeCall({}, {
      deadlineMs: before + OUTER_BUDGET_LONG_MS,
    }));
    const request = collaborators.observed.invocations[0];
    t.ok(request.deadlineMs >= before + DEADLINE_DEFAULT_MS &&
      request.deadlineMs <= Date.now() + DEADLINE_DEFAULT_MS,
    'the effective deadline is now + the deployment default');
    t.ok(request.deadlineMs < before + OUTER_BUDGET_LONG_MS,
      'the longer outer deadline never rides through');
  });

test('a non-finite outer deadline still yields a finite composed budget',
  async (t) => {
    const collaborators = makeCollaborators();
    const before = Date.now();
    await makeBridge(collaborators).invoke(
      makeBridgeCall({}, {deadlineMs: undefined}));
    const request = collaborators.observed.invocations[0];
    t.ok(Number.isFinite(request.deadlineMs),
      'the delegated deadline is never undefined');
    t.ok(request.deadlineMs >= before + DEADLINE_DEFAULT_MS &&
      request.deadlineMs <=
        before + DEADLINE_DEFAULT_MS + DEADLINE_SLACK_MS,
    'the default budget applies');
  });

test('an undeclared target is refused before the invoker is reached',
  async (t) => {
    const collaborators = makeCollaborators();
    const error = await captureRefusal(makeBridge(collaborators).invoke(
      makeBridgeCall({name: UNDECLARED_NAME})));
    t.equal(error?.code, HOST_CALL_ERROR_CODE.TARGET_NOT_ALLOWED);
    t.equal(collaborators.observed.invocations.length, 0,
      'the invoker is never called for an undeclared target');
  });

test('an absent or denied policy refuses target_not_allowed', async (t) => {
  const collaborators = makeCollaborators({
    getOutboundCallPolicy: async () => Object.freeze({
      reason: POLICY_DENIED_REASON,
      status: POLICY_STATUS_DENIED,
    }),
  });
  const error = await captureRefusal(
    makeBridge(collaborators).invoke(makeBridgeCall()));
  t.equal(error?.code, HOST_CALL_ERROR_CODE.TARGET_NOT_ALLOWED);
  t.notMatch(String(error?.message), /policy_not_found/u,
    'the policy denial reason never leaks past the code');
  t.equal(collaborators.observed.invocations.length, 0);
});

test('an absent security context fails closed as bridge-not-composed',
  async (t) => {
    const collaborators = makeCollaborators();
    const bridge = makeBridge(collaborators);
    for (const securityContext of [
      undefined,
      {...SECURITY_CONTEXT},
      Object.freeze({...SECURITY_CONTEXT, roles: ['application']}),
      Object.freeze({...SECURITY_CONTEXT, tenantId: ''}),
    ]) {
      const error = await captureRefusal(bridge.invoke(
        makeBridgeCall({}, {securityContext})));
      t.equal(error?.code, HOST_CALL_ERROR_CODE.CALL_BRIDGE_UNAVAILABLE,
        'a missing or non-canonical context is a composition defect');
    }
    t.equal(collaborators.observed.invocations.length, 0);
    t.equal(collaborators.observed.policyLookups.length, 0,
      'no policy read happens without a canonical identity');
  });

test('an outer id already carrying the child separator is refused as ' +
  'recursion', async (t) => {
  const collaborators = makeCollaborators();
  const error = await captureRefusal(makeBridge(collaborators).invoke(
    makeBridgeCall({}, {invocationId: CHAINED_INVOCATION_ID})));
  t.equal(error?.code, HOST_CALL_ERROR_CODE.RECURSION_REFUSED);
  t.equal(collaborators.observed.invocations.length, 0,
    'the invoker is never called past the depth budget');
});

test('an invalid name or arguments payload is refused before any ' +
  'policy read', async (t) => {
  const collaborators = makeCollaborators();
  const bridge = makeBridge(collaborators);
  for (const bridgeCall of [
    makeBridgeCall({name: 'Not_A-Valid Name'}),
    makeBridgeCall({name: undefined}),
    makeBridgeCall({argumentsJson: '[1,2]'}),
    makeBridgeCall({argumentsJson: 'not json'}),
  ]) {
    const error = await captureRefusal(bridge.invoke(bridgeCall));
    t.equal(error?.code, HOST_CALL_ERROR_CODE.INVALID_ARGUMENTS);
  }
  t.equal(collaborators.observed.policyLookups.length, 0);
  t.equal(collaborators.observed.invocations.length, 0);
});

test('every decision-table row maps the invoker failure to its fixed ' +
  'host-call record', async (t) => {
  const rows = [
    [CALL_CELL_ROUTE_ERROR_CODE.NOT_INVOCABLE,
      HOST_CALL_ERROR_CODE.TARGET_NOT_INVOCABLE],
    [CALL_CELL_ROUTE_ERROR_CODE.ROUTE_NOT_FOUND,
      HOST_CALL_ERROR_CODE.TARGET_NOT_INVOCABLE],
    [CALL_CELL_ROUTE_ERROR_CODE.ROUTE_UNAVAILABLE,
      HOST_CALL_ERROR_CODE.TARGET_UNAVAILABLE],
    [CALL_CELL_ROUTE_ERROR_CODE.HOST_CELL_UNAVAILABLE,
      HOST_CALL_ERROR_CODE.TARGET_UNAVAILABLE],
    [CALL_CELL_ROUTE_ERROR_CODE.TARGET_STALE,
      HOST_CALL_ERROR_CODE.TARGET_UNAVAILABLE],
    [CALL_CELL_ROUTE_ERROR_CODE.SHUTTING_DOWN,
      HOST_CALL_ERROR_CODE.TARGET_UNAVAILABLE],
    [CALL_CELL_ROUTE_ERROR_CODE.REDUCE_INCOMPLETE,
      HOST_CALL_ERROR_CODE.TARGET_UNAVAILABLE],
    [CALL_CELL_ROUTE_ERROR_CODE.DEADLINE_EXHAUSTED,
      HOST_CALL_ERROR_CODE.DEADLINE_EXHAUSTED],
    [CALL_CELL_ROUTE_ERROR_CODE.INVALID_ARGUMENTS,
      HOST_CALL_ERROR_CODE.INVALID_ARGUMENTS],
    [CALL_CELL_ROUTE_ERROR_CODE.STATEMENT_INVALID,
      HOST_CALL_ERROR_CODE.INVALID_ARGUMENTS],
    [CALL_CELL_ROUTE_ERROR_CODE.AUTHENTICATION_FAILED,
      HOST_CALL_ERROR_CODE.TARGET_NOT_ALLOWED],
    [CALL_CELL_ROUTE_ERROR_CODE.AUTHORIZATION_FAILED,
      HOST_CALL_ERROR_CODE.TARGET_NOT_ALLOWED],
    [CALL_CELL_ROUTE_ERROR_CODE.COMPONENT_FAILED,
      HOST_CALL_ERROR_CODE.TARGET_FAILED],
    [CALL_CELL_ROUTE_ERROR_CODE.HANDLER_FAILED,
      HOST_CALL_ERROR_CODE.TARGET_FAILED],
    [CALL_CELL_ROUTE_ERROR_CODE.ACK_ONLY,
      HOST_CALL_ERROR_CODE.TARGET_FAILED],
    [CALL_CELL_ROUTE_ERROR_CODE.TRANSPORT_FAILED,
      HOST_CALL_ERROR_CODE.TARGET_FAILED],
    [CALL_CELL_ROUTE_ERROR_CODE.INVALID_COMPONENT_RESULT,
      HOST_CALL_ERROR_CODE.TARGET_FAILED],
  ];
  const messages = new Map();
  for (const [invokerCode, expectedHostCode] of rows) {
    const collaborators = makeCollaborators({
      invoke: async () => {
        throw createCallRoutingFailure(invokerCode, INNER_SECRET_MESSAGE);
      },
    });
    const error = await captureRefusal(
      makeBridge(collaborators).invoke(makeBridgeCall()));
    t.equal(error?.code, expectedHostCode,
      `${invokerCode} maps to ${expectedHostCode}`);
    t.notMatch(String(error?.message), /inner secret/u,
      `${invokerCode}: the inner failure text never reaches the guest`);
    t.equal(
      isHostCallCodeRetryable(error?.code),
      error?.code === HOST_CALL_ERROR_CODE.TARGET_UNAVAILABLE,
      `${expectedHostCode}: retryability follows the protocol canonical ` +
        'map',
    );
    if (messages.has(expectedHostCode)) {
      t.equal(error?.message, messages.get(expectedHostCode),
        `${expectedHostCode}: one fixed message per emitted code`);
    }
    messages.set(expectedHostCode, error?.message);
  }
  const untyped = makeCollaborators({
    invoke: async () => {
      throw new Error(INNER_SECRET_MESSAGE);
    },
  });
  const error = await captureRefusal(
    makeBridge(untyped).invoke(makeBridgeCall()));
  t.equal(error?.code, HOST_CALL_ERROR_CODE.TARGET_FAILED,
    'an untyped invoker throw maps to the fixed target_failed record');
  t.notMatch(String(error?.message), /inner secret/u);
});

test('guest-adjacent top-level identity fields are never trusted',
  async (t) => {
    const collaborators = makeCollaborators();
    const attackerContext = Object.freeze({
      principal: 'attacker',
      roles: Object.freeze(['admin']),
      tenantId: 'tenant-attacker',
    });
    // Valid receiver-threaded invocation record; contradictory top-level
    // fields ride along as protocol payload and must be ignored.
    await makeBridge(collaborators).invoke(makeBridgeCall({
      invocationId: 'attacker#call-9',
      securityContext: attackerContext,
    }));
    const request = collaborators.observed.invocations[0];
    t.equal(request.securityContext, SECURITY_CONTEXT,
      'only invocation.securityContext is read');
    t.equal(request.invocationId, CHILD_INVOCATION_ID,
      'only invocation.invocationId derives the child identity');
    // Without the receiver-threaded context, top-level identity can
    // never substitute: the bridge fails closed as not composed.
    const error = await captureRefusal(makeBridge(collaborators).invoke(
      makeBridgeCall(
        {securityContext: attackerContext},
        {securityContext: undefined},
      )));
    t.equal(error?.code, HOST_CALL_ERROR_CODE.CALL_BRIDGE_UNAVAILABLE);
  });

test('the bridge refuses construction without its collaborators',
  async (t) => {
    const collaborators = makeCollaborators();
    t.throws(() => createRequestCellCallBridge({
      runtimeAccessPolicyOwner: collaborators.runtimeAccessPolicyOwner,
    }), /callCellInvoker/u);
    t.throws(() => createRequestCellCallBridge({
      callCellInvoker: collaborators.callCellInvoker,
    }), /runtimeAccessPolicyOwner/u);
    t.end();
  });
