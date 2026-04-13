/**
 * Tests for trace continuity from adapter through router to service.
 *
 * Verifies the full adapter -> router -> service chain preserves
 * trace identity, header propagation, multi-service delegation,
 * and edge cases (immutability, monotonic timestamps, correct
 * serviceName at each hop).
 *
 * Requirements: 12.3, 14.3
 */
// @ts-nocheck


import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  TRACE_FIELD,
  createTraceContext,
  createChildSpan,
  extractTraceHeaders,
} from '../../src/admin/admin-trace-context.js';
import {CORRELATION_HEADER} from '../../src/utils/correlation.js';

describe('runtime trace continuity', () => {
  describe('full chain trace continuity', () => {
    it('adapter -> router -> service chain shares traceId',
      () => {
        const adapter = createTraceContext(
          'admin-adapter', 'publishModule',
        );
        const router = createChildSpan(
          adapter, 'meta-router', 'route',
        );
        const service = createChildSpan(
          router, 'sys-wasm-meta', 'publishModule',
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

    it('each hop gets a unique spanId', () => {
      const adapter = createTraceContext(
        'admin-adapter', 'publishModule',
      );
      const router = createChildSpan(
        adapter, 'meta-router', 'route',
      );
      const service = createChildSpan(
        router, 'sys-wasm-meta', 'publishModule',
      );
      const spanIds = new Set([
        adapter[TRACE_FIELD.SPAN_ID],
        router[TRACE_FIELD.SPAN_ID],
        service[TRACE_FIELD.SPAN_ID],
      ]);
      assert.equal(spanIds.size, 3);
    });

    it('router parentSpanId links to adapter spanId', () => {
      const adapter = createTraceContext(
        'admin-adapter', 'publishModule',
      );
      const router = createChildSpan(
        adapter, 'meta-router', 'route',
      );
      assert.equal(
        router[TRACE_FIELD.PARENT_SPAN_ID],
        adapter[TRACE_FIELD.SPAN_ID],
      );
    });

    it('service parentSpanId links to router spanId', () => {
      const adapter = createTraceContext(
        'admin-adapter', 'publishModule',
      );
      const router = createChildSpan(
        adapter, 'meta-router', 'route',
      );
      const service = createChildSpan(
        router, 'sys-wasm-meta', 'publishModule',
      );
      assert.equal(
        service[TRACE_FIELD.PARENT_SPAN_ID],
        router[TRACE_FIELD.SPAN_ID],
      );
    });

    it('service does NOT link directly to adapter', () => {
      const adapter = createTraceContext(
        'admin-adapter', 'publishModule',
      );
      const router = createChildSpan(
        adapter, 'meta-router', 'route',
      );
      const service = createChildSpan(
        router, 'sys-wasm-meta', 'publishModule',
      );
      assert.notEqual(
        service[TRACE_FIELD.PARENT_SPAN_ID],
        adapter[TRACE_FIELD.SPAN_ID],
      );
      assert.equal(
        service[TRACE_FIELD.PARENT_SPAN_ID],
        router[TRACE_FIELD.SPAN_ID],
      );
    });
  });

  describe('header propagation', () => {
    it('extractTraceHeaders from adapter includes traceId',
      () => {
        const adapter = createTraceContext(
          'admin-adapter', 'publishModule',
        );
        const headers = extractTraceHeaders(adapter);
        assert.equal(
          headers[CORRELATION_HEADER],
          adapter[TRACE_FIELD.TRACE_ID],
        );
      });

    it('extractTraceHeaders from service includes same traceId',
      () => {
        const adapter = createTraceContext(
          'admin-adapter', 'publishModule',
        );
        const router = createChildSpan(
          adapter, 'meta-router', 'route',
        );
        const service = createChildSpan(
          router, 'sys-wasm-meta', 'publishModule',
        );
        const adapterHeaders = extractTraceHeaders(adapter);
        const serviceHeaders = extractTraceHeaders(service);
        assert.equal(
          serviceHeaders[CORRELATION_HEADER],
          adapterHeaders[CORRELATION_HEADER],
        );
      });

    it('extractTraceHeaders from each hop has unique x-span-id',
      () => {
        const adapter = createTraceContext(
          'admin-adapter', 'publishModule',
        );
        const router = createChildSpan(
          adapter, 'meta-router', 'route',
        );
        const service = createChildSpan(
          router, 'sys-wasm-meta', 'publishModule',
        );
        const spanIds = new Set([
          extractTraceHeaders(adapter)['x-span-id'],
          extractTraceHeaders(router)['x-span-id'],
          extractTraceHeaders(service)['x-span-id'],
        ]);
        assert.equal(spanIds.size, 3);
      });
  });

  describe('multi-service delegation', () => {
    it('sys-admin-meta -> sys-wasm-meta delegation preserves trace',
      () => {
        const adapter = createTraceContext(
          'admin-adapter', 'publishModule',
        );
        const adminMeta = createChildSpan(
          adapter, 'sys-admin-meta', 'delegatePublish',
        );
        const wasmMeta = createChildSpan(
          adminMeta, 'sys-wasm-meta', 'publishModule',
        );
        assert.equal(
          wasmMeta[TRACE_FIELD.TRACE_ID],
          adapter[TRACE_FIELD.TRACE_ID],
        );
        assert.equal(
          wasmMeta[TRACE_FIELD.PARENT_SPAN_ID],
          adminMeta[TRACE_FIELD.SPAN_ID],
        );
      });

    it('four-hop chain all shares traceId with proper linkage',
      () => {
        const adapter = createTraceContext(
          'admin-adapter', 'publishModule',
        );
        const adminMeta = createChildSpan(
          adapter, 'sys-admin-meta', 'delegatePublish',
        );
        const wasmMeta = createChildSpan(
          adminMeta, 'sys-wasm-meta', 'publishModule',
        );
        const sql = createChildSpan(
          wasmMeta, 'sql-core', 'executeInsert',
        );

        // All share the same traceId
        const traceId = adapter[TRACE_FIELD.TRACE_ID];
        assert.equal(
          adminMeta[TRACE_FIELD.TRACE_ID], traceId,
        );
        assert.equal(
          wasmMeta[TRACE_FIELD.TRACE_ID], traceId,
        );
        assert.equal(
          sql[TRACE_FIELD.TRACE_ID], traceId,
        );

        // Each links to its immediate parent
        assert.equal(
          adminMeta[TRACE_FIELD.PARENT_SPAN_ID],
          adapter[TRACE_FIELD.SPAN_ID],
        );
        assert.equal(
          wasmMeta[TRACE_FIELD.PARENT_SPAN_ID],
          adminMeta[TRACE_FIELD.SPAN_ID],
        );
        assert.equal(
          sql[TRACE_FIELD.PARENT_SPAN_ID],
          wasmMeta[TRACE_FIELD.SPAN_ID],
        );

        // All four spanIds are unique
        const spanIds = new Set([
          adapter[TRACE_FIELD.SPAN_ID],
          adminMeta[TRACE_FIELD.SPAN_ID],
          wasmMeta[TRACE_FIELD.SPAN_ID],
          sql[TRACE_FIELD.SPAN_ID],
        ]);
        assert.equal(spanIds.size, 4);
      });
  });

  describe('edge cases', () => {
    it('trace context is frozen at each hop', () => {
      const adapter = createTraceContext(
        'admin-adapter', 'publishModule',
      );
      const router = createChildSpan(
        adapter, 'meta-router', 'route',
      );
      const service = createChildSpan(
        router, 'sys-wasm-meta', 'publishModule',
      );
      assert.ok(Object.isFrozen(adapter));
      assert.ok(Object.isFrozen(router));
      assert.ok(Object.isFrozen(service));
    });

    it('timestamps are monotonically non-decreasing', () => {
      const adapter = createTraceContext(
        'admin-adapter', 'publishModule',
      );
      const router = createChildSpan(
        adapter, 'meta-router', 'route',
      );
      const service = createChildSpan(
        router, 'sys-wasm-meta', 'publishModule',
      );
      assert.ok(
        router[TRACE_FIELD.TIMESTAMP] >=
          adapter[TRACE_FIELD.TIMESTAMP],
      );
      assert.ok(
        service[TRACE_FIELD.TIMESTAMP] >=
          router[TRACE_FIELD.TIMESTAMP],
      );
    });

    it('serviceName reflects the actual service at each hop',
      () => {
        const adapter = createTraceContext(
          'admin-adapter', 'publishModule',
        );
        const router = createChildSpan(
          adapter, 'meta-router', 'route',
        );
        const service = createChildSpan(
          router, 'sys-wasm-meta', 'publishModule',
        );
        assert.equal(
          adapter[TRACE_FIELD.SERVICE_NAME],
          'admin-adapter',
        );
        assert.equal(
          router[TRACE_FIELD.SERVICE_NAME],
          'meta-router',
        );
        assert.equal(
          service[TRACE_FIELD.SERVICE_NAME],
          'sys-wasm-meta',
        );
      });
  });
});
