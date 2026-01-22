/**
 * Property Test: RPC Correlation Correctness
 *
 * For any RPC request sent via RPCClient, the response SHALL be correctly
 * matched to the original request using the correlation ID. No response
 * SHALL be delivered to the wrong caller.
 *
 * Validates: Requirements 3.3, 3.4
 *
 * Feature: simplified-rebalancing-architecture, Property 3: RPC Correlation
 * Correctness
 */

import {test} from 'tap';
import fc from 'fast-check';
import {RPCClient} from '../../src/transport/rpc-client.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

// Initialize configuration and logging for tests
ConfigurationManager.resetInstance();
LoggingService.resetInstance();
const config = ConfigurationManager.getInstance();
config.initialize({node: {id: 'test-node'}});
const logger = LoggingService.getInstance();
logger.initialize({level: 'error'});

test('Property 3: RPC Correlation Correctness', async (t) => {
  await t.test('responses are matched to correct callers', async (t) => {
    // Generate test cases
    const testCases = fc.sample(
      fc.array(
        fc.record({
          target: fc.string({minLength: 1, maxLength: 20}),
          requestData: fc.string({minLength: 1, maxLength: 50}),
          responseData: fc.string({minLength: 1, maxLength: 50}),
        }),
        {minLength: 1, maxLength: 5},
      ),
      10,
    );

    for (const requests of testCases) {
      const correlationIds = [];

      const mockService = {
        sendMessage: async (_target, message) => {
          correlationIds.push(message.correlationId);
          return {status: 'delivered'};
        },
      };

      const client = new RPCClient({
        messageGroupService: mockService,
        defaultTimeoutMs: 5000,
      });

      try {
        // Start all calls
        const promises = requests.map((req) =>
          client.call(req.target, {data: req.requestData}),
        );

        // Wait for messages to be sent
        await new Promise((resolve) => setTimeout(resolve, 20));

        // Respond in reverse order to test correlation matching
        for (let i = requests.length - 1; i >= 0; i--) {
          client.handleResponse(correlationIds[i], {data: requests[i].responseData});
        }

        // Verify each promise resolves with correct response
        const results = await Promise.all(promises);

        for (let i = 0; i < results.length; i++) {
          t.equal(
            results[i].data,
            requests[i].responseData,
            `Request ${i} should get correct response`,
          );
        }
      } finally {
        await client.shutdown();
      }
    }
  });

  await t.test('handleResponse returns false for unknown correlation ID', async (t) => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.record({
          status: fc.string(),
          data: fc.string(),
        }),
        (unknownId, response) => {
          const client = new RPCClient();

          // handleResponse should return false for unknown IDs
          const matched = client.handleResponse(unknownId, response);

          return matched === false;
        },
      ),
      {numRuns: 10},
    );

    t.pass('Unknown correlation IDs are not matched');
  });

  await t.test('each request gets unique correlation ID', async (t) => {
    // Generate test cases
    const testCases = fc.sample(fc.integer({min: 2, max: 10}), 10);

    for (const numRequests of testCases) {
      const correlationIds = new Set();
      const capturedIds = [];

      const mockService = {
        sendMessage: async (_target, message) => {
          correlationIds.add(message.correlationId);
          capturedIds.push(message.correlationId);
          return {status: 'delivered'};
        },
      };

      const client = new RPCClient({
        messageGroupService: mockService,
        defaultTimeoutMs: 5000,
      });

      // Start multiple calls
      const promises = [];
      for (let i = 0; i < numRequests; i++) {
        promises.push(client.call(`target-${i}`, {index: i}));
      }

      // Wait for messages to be sent
      await new Promise((resolve) => setTimeout(resolve, 20));

      // All correlation IDs should be unique
      t.equal(
        correlationIds.size,
        numRequests,
        `Should have ${numRequests} unique correlation IDs`,
      );

      // Respond to all requests to clean up properly
      for (let i = 0; i < capturedIds.length; i++) {
        client.handleResponse(capturedIds[i], {index: i});
      }

      // Wait for all promises to resolve
      await Promise.all(promises);
      await client.shutdown();
    }
  });

  await t.test('response only resolves matching request', async (t) => {
    // Generate test cases
    const testCases = fc.sample(
      fc.record({
        response1: fc.string({minLength: 1}),
        response2: fc.string({minLength: 1}),
      }),
      10,
    );

    for (const responses of testCases) {
      const correlationIds = [];

      const mockService = {
        sendMessage: async (_target, message) => {
          correlationIds.push(message.correlationId);
          return {status: 'delivered'};
        },
      };

      const client = new RPCClient({
        messageGroupService: mockService,
        defaultTimeoutMs: 5000,
      });

      try {
        // Start two calls
        const promise1 = client.call('target1', {id: 1});
        const promise2 = client.call('target2', {id: 2});

        await new Promise((resolve) => setTimeout(resolve, 20));

        // Respond only to first request
        client.handleResponse(correlationIds[0], {data: responses.response1});

        // First should resolve
        const result1 = await promise1;

        // Second should still be pending
        const pending = client.hasPendingRequest(correlationIds[1]);
        t.ok(pending, 'Second request should still be pending');

        // Now respond to second
        client.handleResponse(correlationIds[1], {data: responses.response2});
        const result2 = await promise2;

        // Verify correct responses
        t.equal(result1.data, responses.response1, 'First response correct');
        t.equal(result2.data, responses.response2, 'Second response correct');
      } finally {
        await client.shutdown();
      }
    }
  });

  await t.test('duplicate responses are ignored', async (t) => {
    // Generate test cases
    const testCases = fc.sample(
      fc.tuple(
        fc.string({minLength: 1}),
        fc.string({minLength: 1}),
      ),
      10,
    );

    for (const [firstResponse, secondResponse] of testCases) {
      let capturedCorrelationId = null;

      const mockService = {
        sendMessage: async (_target, message) => {
          capturedCorrelationId = message.correlationId;
          return {status: 'delivered'};
        },
      };

      const client = new RPCClient({
        messageGroupService: mockService,
        defaultTimeoutMs: 5000,
      });

      try {
        const promise = client.call('target', {type: 'test'});

        await new Promise((resolve) => setTimeout(resolve, 20));

        // First response should match
        const matched1 = client.handleResponse(capturedCorrelationId, {
          data: firstResponse,
        });

        // Second response should not match (already handled)
        const matched2 = client.handleResponse(capturedCorrelationId, {
          data: secondResponse,
        });

        const result = await promise;

        t.ok(matched1, 'First response should match');
        t.notOk(matched2, 'Second response should not match');
        t.equal(result.data, firstResponse, 'Result should be first response');
      } finally {
        await client.shutdown();
      }
    }
  });
});
