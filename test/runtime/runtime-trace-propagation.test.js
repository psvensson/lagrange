/**
 * Tests for trace/request identity propagation across the
 * adapter -> router -> service chain.
 *
 * Verifies that admin-trace-context correctly creates, links,
 * and propagates trace spans through the runtime-owned handler
 * routing chain.
 *
 * Requirements: 7.3, 12.3
 */

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  TRACE_FIELD,
  TRACE_CONTEXT_ERROR_MSG,
  createTraceContext,
  createChildSpan,
  extractTraceHeaders,
} from '../../src/admin/admin-trace-context.js';
import {CORRELATION_HEADER} from '../../src/utils/correlation.js';

describe('runtime trace propagation', () => {
  describe('createTraceContext creates a root trace', () => {
    it('returns frozen object with all required fields', () => {
      const ctx = createTraceContext(
        'admin-adapter', 'handleCommand',
      );
      assert.ok(Object.isFrozen(ctx));
      assert.equal(
        typeof ctx[TRACE_FIELD.TRACE_ID], 'string',
      );
      assert.equal(
        typeof ctx[TRACE_FIELD.SPAN_ID], 'string',
      );
      assert.equal(ctx[TRACE_FIELD.PARENT_SPAN_ID], null);
      assert.equal(
        ctx[TRACE_FIELD.SERVICE_NAME], 'admin-adapter',
      );
      assert.equal(
        ctx[TRACE_FIELD.OPERATION], 'handleCommand',
      );
      assert.equal(
        typeof ctx[TRACE_FIELD.TIMESTAMP], 'number',
      );
    });

    it('generates traceId when no parentTraceId', () => {
      const ctx = createTraceContext('svc', 'op');
      assert.ok(ctx[TRACE_FIELD.TRACE_ID].length > 0);
    });

    it('preserves traceId when parentTraceId provided', () => {
      const parentId = 'existing-trace-abc-123';
      const ctx = createTraceContext('svc', 'op', parentId);
      assert.equal(ctx[TRACE_FIELD.TRACE_ID], parentId);
    });

    it('throws when serviceName is missing', () => {
      assert.throws(
        () => createTraceContext(null, 'op'),
        {
          message:
            TRACE_CONTEXT_ERROR_MSG.SERVICE_NAME_REQUIRED,
        },
      );
      assert.throws(
        () => createTraceContext('', 'op'),
        {
          message:
            TRACE_CONTEXT_ERROR_MSG.SERVICE_NAME_REQUIRED,
        },
      );
    });

    it('throws when operation is missing', () => {
      assert.throws(
        () => createTraceContext('svc', null),
        {
          message:
            TRACE_CONTEXT_ERROR_MSG.OPERATION_REQUIRED,
        },
      );
      assert.throws(
        () => createTraceContext('svc', ''),
        {
          message:
            TRACE_CONTEXT_ERROR_MSG.OPERATION_REQUIRED,
        },
      );
    });
  });

  describe('createChildSpan preserves trace identity', () => {
    it('child has same traceId as parent', () => {
      const parent = createTraceContext('adapter', 'handle');
      const child = createChildSpan(
        parent, 'router', 'route',
      );
      assert.equal(
        child[TRACE_FIELD.TRACE_ID],
        parent[TRACE_FIELD.TRACE_ID],
      );
    });

    it('child has different spanId from parent', () => {
      const parent = createTraceContext('adapter', 'handle');
      const child = createChildSpan(
        parent, 'router', 'route',
      );
      assert.notEqual(
        child[TRACE_FIELD.SPAN_ID],
        parent[TRACE_FIELD.SPAN_ID],
      );
    });

    it('child parentSpanId equals parent spanId', () => {
      const parent = createTraceContext('adapter', 'handle');
      const child = createChildSpan(
        parent, 'router', 'route',
      );
      assert.equal(
        child[TRACE_FIELD.PARENT_SPAN_ID],
        parent[TRACE_FIELD.SPAN_ID],
      );
    });

    it('child has its own serviceName and operation', () => {
      const parent = createTraceContext('adapter', 'handle');
      const child = createChildSpan(
        parent, 'router', 'route',
      );
      assert.equal(
        child[TRACE_FIELD.SERVICE_NAME], 'router',
      );
      assert.equal(child[TRACE_FIELD.OPERATION], 'route');
    });

    it('returns frozen object', () => {
      const parent = createTraceContext('adapter', 'handle');
      const child = createChildSpan(
        parent, 'router', 'route',
      );
      assert.ok(Object.isFrozen(child));
    });

    it('throws when parentContext is missing', () => {
      assert.throws(
        () => createChildSpan(null, 'svc', 'op'),
        {
          message:
            TRACE_CONTEXT_ERROR_MSG.PARENT_CONTEXT_REQUIRED,
        },
      );
    });

    it('throws when serviceName is missing', () => {
      const parent = createTraceContext('adapter', 'handle');
      assert.throws(
        () => createChildSpan(parent, '', 'op'),
        {
          message:
            TRACE_CONTEXT_ERROR_MSG.SERVICE_NAME_REQUIRED,
        },
      );
    });

    it('throws when operation is missing', () => {
      const parent = createTraceContext('adapter', 'handle');
      assert.throws(
        () => createChildSpan(parent, 'svc', ''),
        {
          message:
            TRACE_CONTEXT_ERROR_MSG.OPERATION_REQUIRED,
        },
      );
    });
  });

  describe('extractTraceHeaders', () => {
    it('returns correlation header with traceId', () => {
      const ctx = createTraceContext('svc', 'op');
      const headers = extractTraceHeaders(ctx);
      assert.equal(
        headers[CORRELATION_HEADER],
        ctx[TRACE_FIELD.TRACE_ID],
      );
    });

    it('returns span header with spanId', () => {
      const ctx = createTraceContext('svc', 'op');
      const headers = extractTraceHeaders(ctx);
      assert.equal(
        headers['x-span-id'], ctx[TRACE_FIELD.SPAN_ID],
      );
    });

    it('headers propagate trace across boundaries', () => {
      const root = createTraceContext('adapter', 'handle');
      const headers = extractTraceHeaders(root);
      const continued = createTraceContext(
        'remote-svc', 'receive',
        headers[CORRELATION_HEADER],
      );
      assert.equal(
        continued[TRACE_FIELD.TRACE_ID],
        root[TRACE_FIELD.TRACE_ID],
      );
    });
  });

  describe('multi-hop chain (adapter->router->service)', () => {
    it('all three spans share the same traceId', () => {
      const adapter = createTraceContext(
        'admin-adapter', 'handleCommand',
      );
      const router = createChildSpan(
        adapter, 'meta-router', 'routeCommand',
      );
      const service = createChildSpan(
        router, 'sys-admin-meta', 'executeCommand',
      );
      assert.equal(
        router[TRACE_FIELD.TRACE_ID],
        adapter[TRACE_FIELD.TRACE_ID],
      );
      assert.equal(
        service[TRACE_FIELD.TRACE_ID],
        adapter[TRACE_FIELD.TRACE_ID],
      );
    });

    it('each span has unique spanId', () => {
      const adapter = createTraceContext(
        'admin-adapter', 'handleCommand',
      );
      const router = createChildSpan(
        adapter, 'meta-router', 'routeCommand',
      );
      const service = createChildSpan(
        router, 'sys-admin-meta', 'executeCommand',
      );
      const spanIds = new Set([
        adapter[TRACE_FIELD.SPAN_ID],
        router[TRACE_FIELD.SPAN_ID],
        service[TRACE_FIELD.SPAN_ID],
      ]);
      assert.equal(spanIds.size, 3);
    });

    it('router parentSpanId equals adapter spanId', () => {
      const adapter = createTraceContext(
        'admin-adapter', 'handleCommand',
      );
      const router = createChildSpan(
        adapter, 'meta-router', 'routeCommand',
      );
      assert.equal(
        router[TRACE_FIELD.PARENT_SPAN_ID],
        adapter[TRACE_FIELD.SPAN_ID],
      );
    });

    it('service parentSpanId equals router spanId', () => {
      const adapter = createTraceContext(
        'admin-adapter', 'handleCommand',
      );
      const router = createChildSpan(
        adapter, 'meta-router', 'routeCommand',
      );
      const service = createChildSpan(
        router, 'sys-admin-meta', 'executeCommand',
      );
      assert.equal(
        service[TRACE_FIELD.PARENT_SPAN_ID],
        router[TRACE_FIELD.SPAN_ID],
      );
    });
  });

  describe('trace context immutability', () => {
    it('root context is frozen', () => {
      const ctx = createTraceContext('svc', 'op');
      assert.ok(Object.isFrozen(ctx));
    });

    it('child context is frozen', () => {
      const parent = createTraceContext('svc', 'op');
      const child = createChildSpan(parent, 'child', 'work');
      assert.ok(Object.isFrozen(child));
    });

    it('cannot modify traceId after creation', () => {
      const ctx = createTraceContext('svc', 'op');
      assert.throws(() => {
        ctx[TRACE_FIELD.TRACE_ID] = 'tampered';
      }, TypeError);
    });

    it('cannot modify spanId after creation', () => {
      const ctx = createTraceContext('svc', 'op');
      assert.throws(() => {
        ctx[TRACE_FIELD.SPAN_ID] = 'tampered';
      }, TypeError);
    });
  });
});
