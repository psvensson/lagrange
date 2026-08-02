import assert from 'node:assert/strict';
import {test} from 'node:test';

import {RuntimeServiceHandler} from
  '../../src/node/runtime-service-handler.js';
import {handleCallCellInvocation} from
  '../../src/node/runtime-service-call-cell-handler.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {
  CALL_CELL_ROUTE_CLASSIFICATION,
  CALL_CELL_ROUTE_ERROR_CODE,
  CALL_CELL_ROUTE_MESSAGE_TYPE,
  CALL_CELL_ROUTE_OPERATION,
} from '../../src/service/call-cell-routing-contract.js';

const NODE_ID = 'node-a';
const REPLICA_ID = 'call-service-r1';
const SERVICE_ID = 'call-service';
const TENANT_ID = 'tenant-a';
const CALL_ARGUMENTS = JSON.stringify({topN: 3});
const CALL_RESULT = JSON.stringify({kept: []});
const CALL_BATCH = Object.freeze([
  Object.freeze({
    columns: Object.freeze([
      Object.freeze({
        name: 'id',
        val: Object.freeze({tag: 'integer', val: 1n}),
      }),
    ]),
  }),
]);

function createCallRoute(overrides = {}) {
  return {
    bindingVersionId: 'binding-version-call',
    name: 'top-scores',
    nodeId: NODE_ID,
    replicaId: REPLICA_ID,
    serviceId: SERVICE_ID,
    tenantId: TENANT_ID,
    ...overrides,
  };
}

function createCallPayload(overrides = {}) {
  return {
    batch: CALL_BATCH,
    call: {
      arguments: CALL_ARGUMENTS,
      name: 'top-scores',
    },
    invocation: {
      deadlineMs: Date.now() + 30_000,
      id: 'call-invocation-1',
      intentDigest: 'intent-digest-1',
    },
    operation: CALL_CELL_ROUTE_OPERATION,
    route: createCallRoute(),
    type: CALL_CELL_ROUTE_MESSAGE_TYPE,
    ...overrides,
  };
}

function createCallEnvelope(payload = createCallPayload()) {
  return {
    metadata: {roles: ['service-caller']},
    operation: CALL_CELL_ROUTE_OPERATION,
    payload,
    principal: 'principal-a',
    tenantId: TENANT_ID,
  };
}

function createHandlerFixture(options = {}) {
  const invocations = [];
  const handler = {
    callBindingRouteResolver: options.callBindingRouteResolver || {
      assertSelectedRoute(_call, route) {
        return route;
      },
    },
    localReplicas: options.localReplicas === undefined ?
      new Map([[
        REPLICA_ID,
        {
          entityId: SERVICE_ID,
          replicaHandle: {serviceId: REPLICA_ID},
          status: ReplicaStatus.ACTIVE,
        },
      ]]) :
      options.localReplicas,
    nodeId: options.nodeId || NODE_ID,
    serviceRuntimeLifecycle: 'serviceRuntimeLifecycle' in options ?
      options.serviceRuntimeLifecycle :
      {
        async health() {
          return {status: 'healthy'};
        },
        async invoke(_handle, invocation) {
          invocations.push(invocation);
          return {
            partials: [{key: 'partial:1', partial: '{"id":"1"}'}],
            result: CALL_RESULT,
          };
        },
      },
  };
  return {handler, invocations};
}

test('call Cell handler rejects an invalid payload without throwing',
  async () => {
    const {handler} = createHandlerFixture();
    const envelope = createCallEnvelope(
      createCallPayload({call: {arguments: CALL_ARGUMENTS}}),
    );
    const response = await handleCallCellInvocation(handler, envelope);
    assert.equal(response.processed, false);
    assert.equal(response.handlerProcessed, true);
    assert.deepEqual(response.partials, []);
    assert.equal(
      response.invocationOutcome.code,
      CALL_CELL_ROUTE_ERROR_CODE.INVALID_ARGUMENTS,
    );
    assert.equal(
      response.invocationOutcome.classification,
      CALL_CELL_ROUTE_CLASSIFICATION.TERMINAL,
    );
    assert.equal(response.invocationOutcome.invoked, false);
  },
);

test('call Cell handler reports a stale route target as retryable',
  async () => {
    const {handler} = createHandlerFixture({
      localReplicas: new Map(),
    });
    const response = await handleCallCellInvocation(
      handler,
      createCallEnvelope(),
    );
    assert.equal(response.processed, false);
    assert.equal(
      response.invocationOutcome.code,
      CALL_CELL_ROUTE_ERROR_CODE.TARGET_STALE,
    );
    assert.equal(
      response.invocationOutcome.classification,
      CALL_CELL_ROUTE_CLASSIFICATION.RETRYABLE,
    );
    assert.equal(response.invocationOutcome.invoked, false);
  },
);

test('call Cell handler reports an expired deadline before routing',
  async () => {
    const {handler} = createHandlerFixture();
    const payload = createCallPayload();
    payload.invocation.deadlineMs = Date.now() - 1;
    const response = await handleCallCellInvocation(
      handler,
      createCallEnvelope(payload),
    );
    assert.equal(response.processed, false);
    assert.equal(
      response.invocationOutcome.code,
      CALL_CELL_ROUTE_ERROR_CODE.DEADLINE_EXHAUSTED,
    );
    assert.equal(response.invocationOutcome.invoked, false);
  },
);

test('call Cell handler returns the processed result and partials',
  async () => {
    const {handler, invocations} = createHandlerFixture();
    const response = await handleCallCellInvocation(
      handler,
      createCallEnvelope(),
    );
    assert.equal(response.processed, true);
    assert.equal(response.handlerProcessed, true);
    assert.equal(response.componentResult, CALL_RESULT);
    assert.deepEqual(
      response.partials,
      [{key: 'partial:1', partial: '{"id":"1"}'}],
    );
    assert.equal(response.invocationOutcome.invoked, true);
    assert.equal(response.invocationOutcome.code, null);
    assert.equal(invocations.length, 1);
    const invocation = invocations[0];
    assert.deepEqual(invocation.args, [CALL_BATCH, CALL_ARGUMENTS]);
    assert.equal(invocation.exportName, 'run');
    assert.equal(invocation.invocationId, 'call-invocation-1');
    assert.equal(invocation.intentDigest, 'intent-digest-1');
    assert.equal(invocation.invocationServiceId, SERVICE_ID);
    assert.equal(invocation.tenantId, TENANT_ID);
    assert.equal(typeof invocation.assertCurrentTarget, 'function');
  },
);

test('call Cell handler wraps invoke failures in a typed failure envelope',
  async () => {
    const {handler} = createHandlerFixture({
      serviceRuntimeLifecycle: {
        async health() {
          return {status: 'healthy'};
        },
        async invoke() {
          throw new Error('component exploded');
        },
      },
    });
    const response = await handleCallCellInvocation(
      handler,
      createCallEnvelope(),
    );
    assert.equal(response.processed, false);
    assert.equal(response.handlerProcessed, true);
    assert.equal(
      response.invocationOutcome.code,
      CALL_CELL_ROUTE_ERROR_CODE.COMPONENT_FAILED,
    );
    assert.equal(response.invocationOutcome.invoked, true);
    assert.equal(
      response.invocationOutcome.message,
      'component exploded',
    );
  },
);

test('runtime-service-handler dispatches call cell envelopes to the ' +
  'call handler', async () => {
  const {handler, invocations} = createHandlerFixture();
  const runtimeServiceHandler = new RuntimeServiceHandler({
    callBindingRouteResolver: handler.callBindingRouteResolver,
    nodeId: NODE_ID,
    serviceRuntimeLifecycle: handler.serviceRuntimeLifecycle,
  });
  runtimeServiceHandler.localReplicas = handler.localReplicas;
  const envelope = createCallEnvelope();
  const response = await runtimeServiceHandler.handleMessage(envelope);
  assert.equal(response.processed, true);
  assert.equal(response.componentResult, CALL_RESULT);
  assert.equal(invocations.length, 1);
  assert.equal(invocations[0].exportName, 'run');
});
