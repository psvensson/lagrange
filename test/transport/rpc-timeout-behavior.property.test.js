/**
 * Property Test: RPC Timeout Behavior
 *
 * For any RPC request that does not receive a response within the configured
 * timeout, the RPCClient SHALL reject the Promise with a timeout error.
 * The pending request SHALL be cleaned up.
 *
 * Validates: Requirements 3.2, 3.4
 *
 * Feature: simplified-rebalancing-architecture, Property 4: RPC Timeout Behavior
 */

import {test} from '../../src/test-helpers/tap.js';
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

test('Property 4: RPC Timeout Behavior', async (t) => {
  await t.test('requests timeout after configured duration', async (t) => {
    // Generate test cases with various timeout values
    const testCases = fc.sample(
      fc.integer({min: 20, max: 100}),
      10,
    );

    for (const timeoutMs of testCases) {
      const mockService = {
        sendMessage: async () => ({status: 'delivered'}),
      };

      const client = new RPCClient({
        messageGroupService: mockService,
        defaultTimeoutMs: timeoutMs,
      });

      const startTime = Date.now();

      try {
        await client.call('target', {type: 'test'});
        t.fail('Should have timed out');
      } catch (error) {
        const elapsed = Date.now() - startTime;

        t.match(
          error.message,
          new RegExp(`RPC timeout after ${timeoutMs}ms`),
          `Should timeout with correct message for ${timeoutMs}ms`,
        );

        // Allow some tolerance for timing
        t.ok(
          elapsed >= timeoutMs - 5,
          `Should wait at least ${timeoutMs}ms (waited ${elapsed}ms)`,
        );
      } finally {
        await client.shutdown();
      }
    }
  });

  await t.test('pending request is cleaned up after timeout', async (t) => {
    // Generate test cases
    const testCases = fc.sample(
      fc.record({
        target: fc.string({minLength: 1, maxLength: 20}),
        data: fc.string({minLength: 1, maxLength: 50}),
      }),
      10,
    );

    for (const request of testCases) {
      let capturedCorrelationId = null;

      const mockService = {
        sendMessage: async (_target, message) => {
          capturedCorrelationId = message.correlationId;
          return {status: 'delivered'};
        },
      };

      const client = new RPCClient({
        messageGroupService: mockService,
        defaultTimeoutMs: 30,
      });

      try {
        await client.call(request.target, {data: request.data});
        t.fail('Should have timed out');
      } catch (_error) {
        // After timeout, pending request should be cleaned up
        t.equal(
          client.getPendingCount(),
          0,
          'Should have no pending requests after timeout',
        );

        t.notOk(
          client.hasPendingRequest(capturedCorrelationId),
          'Correlation ID should not be pending after timeout',
        );
      } finally {
        await client.shutdown();
      }
    }
  });

  await t.test('timeout counter is incremented', async (t) => {
    // Generate test cases with number of timeouts
    const testCases = fc.sample(
      fc.integer({min: 1, max: 5}),
      10,
    );

    for (const numTimeouts of testCases) {
      const mockService = {
        sendMessage: async () => ({status: 'delivered'}),
      };

      const client = new RPCClient({
        messageGroupService: mockService,
        defaultTimeoutMs: 20,
      });

      // Trigger multiple timeouts
      for (let i = 0; i < numTimeouts; i++) {
        try {
          await client.call(`target-${i}`, {index: i});
        } catch (_error) {
          // Expected timeout
        }
      }

      const stats = client.getStats();
      t.equal(
        stats.timeouts,
        numTimeouts,
        `Should have ${numTimeouts} timeouts recorded`,
      );

      await client.shutdown();
    }
  });

  await t.test('custom timeout overrides default', async (t) => {
    // Generate test cases
    const testCases = fc.sample(
      fc.record({
        defaultTimeout: fc.integer({min: 100, max: 200}),
        customTimeout: fc.integer({min: 20, max: 50}),
      }),
      10,
    );

    for (const {defaultTimeout, customTimeout} of testCases) {
      const mockService = {
        sendMessage: async () => ({status: 'delivered'}),
      };

      const client = new RPCClient({
        messageGroupService: mockService,
        defaultTimeoutMs: defaultTimeout,
      });

      const startTime = Date.now();

      try {
        await client.call('target', {type: 'test'}, {timeout: customTimeout});
        t.fail('Should have timed out');
      } catch (error) {
        const elapsed = Date.now() - startTime;

        t.match(
          error.message,
          new RegExp(`RPC timeout after ${customTimeout}ms`),
          `Should use custom timeout ${customTimeout}ms`,
        );

        // Should timeout around custom timeout, not default
        t.ok(
          elapsed < defaultTimeout,
          `Should timeout before default (${elapsed}ms < ${defaultTimeout}ms)`,
        );
      } finally {
        await client.shutdown();
      }
    }
  });

  await t.test('timeout event is emitted', async (t) => {
    // Generate test cases
    const testCases = fc.sample(
      fc.record({
        target: fc.string({minLength: 1, maxLength: 20}),
        timeoutMs: fc.integer({min: 20, max: 50}),
      }),
      10,
    );

    for (const {target, timeoutMs} of testCases) {
      const mockService = {
        sendMessage: async () => ({status: 'delivered'}),
      };

      const client = new RPCClient({
        messageGroupService: mockService,
        defaultTimeoutMs: timeoutMs,
      });

      let timeoutEvent = null;
      client.on('timeout', (event) => {
        timeoutEvent = event;
      });

      try {
        await client.call(target, {type: 'test'});
      } catch (_error) {
        // Expected timeout
      }

      t.ok(timeoutEvent, 'Should emit timeout event');
      t.ok(timeoutEvent.correlationId, 'Event should have correlation ID');
      t.equal(timeoutEvent.target, target, 'Event should have correct target');
      t.equal(timeoutEvent.timeoutMs, timeoutMs, 'Event should have correct timeout');

      await client.shutdown();
    }
  });

  await t.test('late response after timeout is ignored', async (t) => {
    // Generate test cases
    const testCases = fc.sample(
      fc.record({
        responseData: fc.string({minLength: 1, maxLength: 50}),
      }),
      10,
    );

    for (const {responseData} of testCases) {
      let capturedCorrelationId = null;

      const mockService = {
        sendMessage: async (_target, message) => {
          capturedCorrelationId = message.correlationId;
          return {status: 'delivered'};
        },
      };

      const client = new RPCClient({
        messageGroupService: mockService,
        defaultTimeoutMs: 20,
      });

      try {
        await client.call('target', {type: 'test'});
        t.fail('Should have timed out');
      } catch (_error) {
        // After timeout, try to send a late response
        const matched = client.handleResponse(capturedCorrelationId, {
          data: responseData,
        });

        t.notOk(matched, 'Late response should not be matched');
        t.equal(
          client.stats.responsesReceived,
          0,
          'Response counter should not increment for late response',
        );
      } finally {
        await client.shutdown();
      }
    }
  });
});
