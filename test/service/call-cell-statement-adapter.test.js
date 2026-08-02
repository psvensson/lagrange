/**
 * Wire-contract guard for CallCellStatementAdapter over the real
 * ServiceDispatcher seam: the envelope carries the shard batch / reduce
 * partials / export selection / bounded-emit budgets, and the SUCCESS
 * response is read from the receiver's `componentResult` field (the
 * regression that shipped as `componentResponse` made every successful
 * dispatch fail typed). Failure deliveries map to the typed invocation
 * outcome fail-closed.
 */

import {test} from '../../src/test-helpers/tap.js';
import {CallCellStatementAdapter} from
  '../../src/service/call-cell-statement-adapter.js';
import {
  CALL_CELL_ROUTE_ERROR_CODE,
  CALL_CELL_ROUTE_MESSAGE_TYPE,
  CALL_CELL_ROUTE_OPERATION,
} from '../../src/service/call-cell-routing-contract.js';

const SECURITY_CONTEXT = Object.freeze({
  tenantId: 'tenant-1',
  principal: 'app-1',
  roles: Object.freeze(['application']),
});
const CALL_NAME = 'ratings-top';
const ARGUMENTS = '{"topN":2}';
const RESULT_JSON = '[{"key":"u1","score":7}]';
const CALL_BATCH = Object.freeze([Object.freeze({columns: []})]);
const REDUCE_PARTIALS = Object.freeze([Object.freeze(['u1', '7'])]);
const CALL_CELL_BUDGETS = Object.freeze({
  emitBudget: 8,
  nestedCallBudget: 1,
});

function makeRoute() {
  return Object.freeze({
    bindingVersionId: 'bv-1',
    name: CALL_NAME,
    replicaId: 'replica-1',
    serviceId: 'svc-1',
    targetNodeId: 'node-1',
    tenantId: SECURITY_CONTEXT.tenantId,
  });
}

function makeCollaborators(deliveryOverrides = {}) {
  const captured = {envelopes: [], contexts: []};
  const routeResolver = {resolve: () => makeRoute()};
  const serviceDispatcher = {
    dispatch: async (envelope, context) => {
      captured.envelopes.push(envelope);
      captured.contexts.push(context);
      return {
        delivery: {
          processed: true,
          handlerProcessed: true,
          componentResult: RESULT_JSON,
          partials: [{key: 'partial:u1', partial: '7'}],
          replicaId: 'replica-1',
          ...deliveryOverrides,
        },
      };
    },
  };
  return {captured, routeResolver, serviceDispatcher};
}

function makeAdapter(collaborators) {
  return new CallCellStatementAdapter({
    routeResolver: collaborators.routeResolver,
    serviceDispatcher: collaborators.serviceDispatcher,
  });
}

test('a run dispatch puts the batch, export, and budgets on the wire and ' +
  'reads the receiver componentResult field', async (t) => {
  const collaborators = makeCollaborators();
  const delivery = await makeAdapter(collaborators).invoke({
    name: CALL_NAME,
    argumentsJson: ARGUMENTS,
    securityContext: SECURITY_CONTEXT,
    batch: CALL_BATCH,
    callCell: CALL_CELL_BUDGETS,
    exportName: 'run',
    invocationId: 'call-invocation-fixture-1',
  });
  t.equal(delivery.componentResult, RESULT_JSON,
    'the success response is the receiver componentResult field');
  t.same(delivery.partials, [{key: 'partial:u1', partial: '7'}],
    'the emitted partial log rides the delivery untouched');
  t.equal(delivery.replicaId, 'replica-1');
  const envelope = collaborators.captured.envelopes[0];
  t.equal(envelope.operation, CALL_CELL_ROUTE_OPERATION);
  t.equal(envelope.payload.type, CALL_CELL_ROUTE_MESSAGE_TYPE);
  t.same(envelope.payload.batch, CALL_BATCH,
    'the shard batch is on the wire');
  t.equal(envelope.payload.invocation.exportName, 'run');
  t.equal(envelope.payload.invocation.id, 'call-invocation-fixture-1');
  t.same(envelope.payload.invocation.callCell, CALL_CELL_BUDGETS,
    'the bounded-emit budgets ride invocation.callCell for the receiver');
  t.equal(typeof envelope.payload.invocation.intentDigest, 'string');
  t.equal(collaborators.captured.contexts[0].requireProcessedResponse, true,
    'ack-only deliveries are refused by contract');
});

test('a reduce dispatch puts the merged partials and export on the wire',
  async (t) => {
    const collaborators = makeCollaborators();
    await makeAdapter(collaborators).invoke({
      name: CALL_NAME,
      argumentsJson: ARGUMENTS,
      securityContext: SECURITY_CONTEXT,
      callCell: CALL_CELL_BUDGETS,
      partials: REDUCE_PARTIALS,
      exportName: 'reduce',
      invocationId: 'call-invocation-fixture-2',
    });
    const envelope = collaborators.captured.envelopes[0];
    t.equal(envelope.payload.invocation.exportName, 'reduce');
    t.same(envelope.payload.partials, REDUCE_PARTIALS,
      'the gate-merged partial tuples are on the wire');
    t.equal(envelope.payload.batch, undefined,
      'a reduce dispatch carries no shard batch');
  });

test('a delivery missing componentResult fails typed instead of ' +
  'returning garbage', async (t) => {
  const collaborators = makeCollaborators({componentResult: undefined});
  await makeAdapter(collaborators).invoke({
    name: CALL_NAME,
    argumentsJson: ARGUMENTS,
    securityContext: SECURITY_CONTEXT,
    batch: CALL_BATCH,
    exportName: 'run',
    invocationId: 'call-invocation-fixture-3',
  }).then(
    () => t.fail('expected an invalid-component-result rejection'),
    (error) => t.equal(
      error.code,
      CALL_CELL_ROUTE_ERROR_CODE.INVALID_COMPONENT_RESULT,
      'the response-field contract is enforced fail-closed',
    ),
  );
});

test('an unprocessed delivery maps the typed invocation outcome',
  async (t) => {
    const collaborators = makeCollaborators({
      processed: false,
      handlerProcessed: true,
      invocationOutcome: {
        classification: 'terminal',
        code: CALL_CELL_ROUTE_ERROR_CODE.COMPONENT_FAILED,
        invoked: true,
        message: 'component raised',
      },
    });
    await makeAdapter(collaborators).invoke({
      name: CALL_NAME,
      argumentsJson: ARGUMENTS,
      securityContext: SECURITY_CONTEXT,
      batch: CALL_BATCH,
      exportName: 'run',
      invocationId: 'call-invocation-fixture-4',
    }).then(
      () => t.fail('expected the typed invocation failure'),
      (error) => {
        t.equal(error.code, CALL_CELL_ROUTE_ERROR_CODE.COMPONENT_FAILED);
        t.equal(error.invoked, true,
          'invoked-ness is preserved so retries stay fail-closed');
      },
    );
  });
