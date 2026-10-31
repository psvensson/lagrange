import assert from 'node:assert/strict';
import {describe, test} from 'node:test';

import {RequestCellHttpAdapter} from '../../src/service/request-cell-http-adapter.js';
import {
  REQUEST_CELL_ROUTE_ERROR_CODE,
  RequestCellRoutingError,
} from '../../src/service/request-cell-routing-contract.js';

function createMockReply() {
  let statusCode = 200;
  const headers = {};
  return {
    code(c) {
      statusCode = c;
      return this;
    },
    header(k, v) {
      headers[k] = v;
      return this;
    },
    getHeaders() {
      return headers;
    },
    getStatusCode() {
      return statusCode;
    },
  };
}

describe('RequestCellHttpAdapter body normalization and validation', () => {
  const securityContext = Object.freeze({
    principal: 'test-user',
    roles: Object.freeze(['app']),
    tenantId: 'tenant-1',
  });

  const mockResolver = {
    resolve() {
      return {
        bindingDigest: 'digest-1',
        bindingVersionId: 'binding-version-1',
        handlerId: 'handler-1',
        method: 'POST',
        nodeId: 'node-1',
        path: '/orders',
        replicaId: 'replica-1',
        serviceId: 'service-1',
        targetAddress: 'node-1/service/runtime-service-handler',
        targetNodeId: 'node-1',
        tenantId: 'tenant-1',
      };
    },
  };

  const mockDispatcher = {
    async dispatch(envelope) {
      return {
        answer: {
          componentResponse: {
            body: JSON.stringify({receivedBody: envelope.payload.request.body}),
            headers: [['content-type', 'application/json']],
            status: 200,
          },
          invocationOutcome: {code: 'ok', invoked: true},
          processed: true,
        },
      };
    },
  };

  const adapter = new RequestCellHttpAdapter({
    authenticateRequest: async () => securityContext,
    routeResolver: mockResolver,
    serviceDispatcher: mockDispatcher,
  });

  test('accepts valid string JSON object and parses it cleanly', async () => {
    const reply = createMockReply();
    const result = await adapter.handle({
      body: JSON.stringify({accountId: 7, amount: 100}),
      headers: {'content-type': 'application/json'},
      method: 'POST',
      url: 'http://localhost/orders',
    }, reply);

    assert.equal(reply.getStatusCode(), 200);
    const parsed = JSON.parse(result);
    assert.deepEqual(parsed.receivedBody, {accountId: 7, amount: 100});
  });

  test('accepts already parsed object body and preserves it', async () => {
    const reply = createMockReply();
    const result = await adapter.handle({
      body: {accountId: 42, amount: 200},
      headers: {'content-type': 'application/json'},
      method: 'POST',
      url: 'http://localhost/orders',
    }, reply);

    assert.equal(reply.getStatusCode(), 200);
    const parsed = JSON.parse(result);
    assert.deepEqual(parsed.receivedBody, {accountId: 42, amount: 200});
  });

  test('accepts empty string and null body as null', async () => {
    const reply1 = createMockReply();
    const res1 = await adapter.handle({
      body: '',
      headers: {},
      method: 'POST',
      url: 'http://localhost/orders',
    }, reply1);
    assert.equal(reply1.getStatusCode(), 200);
    assert.equal(JSON.parse(res1).receivedBody, null);

    const reply2 = createMockReply();
    const res2 = await adapter.handle({
      body: null,
      headers: {},
      method: 'POST',
      url: 'http://localhost/orders',
    }, reply2);
    assert.equal(reply2.getStatusCode(), 200);
    assert.equal(JSON.parse(res2).receivedBody, null);
  });

  test('refuses malformed JSON string with HTTP 400', async () => {
    const reply = createMockReply();
    const result = await adapter.handle({
      body: '{malformed: true',
      headers: {},
      method: 'POST',
      url: 'http://localhost/orders',
    }, reply);

    assert.equal(reply.getStatusCode(), 400);
    assert.equal(result.code, REQUEST_CELL_ROUTE_ERROR_CODE.INVALID_REQUEST);
  });

  test('refuses array body with HTTP 400', async () => {
    const reply1 = createMockReply();
    const res1 = await adapter.handle({
      body: [1, 2, 3],
      headers: {},
      method: 'POST',
      url: 'http://localhost/orders',
    }, reply1);
    assert.equal(reply1.getStatusCode(), 400);
    assert.equal(res1.code, REQUEST_CELL_ROUTE_ERROR_CODE.INVALID_REQUEST);

    const reply2 = createMockReply();
    const res2 = await adapter.handle({
      body: '[1, 2, 3]',
      headers: {},
      method: 'POST',
      url: 'http://localhost/orders',
    }, reply2);
    assert.equal(reply2.getStatusCode(), 400);
    assert.equal(res2.code, REQUEST_CELL_ROUTE_ERROR_CODE.INVALID_REQUEST);
  });

  test('refuses JSON primitive body with HTTP 400', async () => {
    const reply1 = createMockReply();
    const res1 = await adapter.handle({
      body: 12345,
      headers: {},
      method: 'POST',
      url: 'http://localhost/orders',
    }, reply1);
    assert.equal(reply1.getStatusCode(), 400);
    assert.equal(res1.code, REQUEST_CELL_ROUTE_ERROR_CODE.INVALID_REQUEST);

    const reply2 = createMockReply();
    const res2 = await adapter.handle({
      body: '"just a string"',
      headers: {},
      method: 'POST',
      url: 'http://localhost/orders',
    }, reply2);
    assert.equal(reply2.getStatusCode(), 400);
    assert.equal(res2.code, REQUEST_CELL_ROUTE_ERROR_CODE.INVALID_REQUEST);
  });

  test('invoke directly throws RequestCellRoutingError with httpStatus 400 on invalid body', async () => {
    await assert.rejects(
      adapter.invoke({
        body: 'not valid json',
        headers: {},
        method: 'POST',
        url: 'http://localhost/orders',
      }),
      (error) => {
        assert.ok(error instanceof RequestCellRoutingError);
        assert.equal(error.httpStatus, 400);
        assert.equal(error.code, REQUEST_CELL_ROUTE_ERROR_CODE.INVALID_REQUEST);
        return true;
      },
    );
  });
});
