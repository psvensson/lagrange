// @ts-nocheck
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  TRACE_FIELD,
  TRACE_CONTEXT_ERROR_MSG,
  createTraceContext,
  createChildSpan,
  extractTraceHeaders,
} from '../../src/admin/admin-trace-context.js';
import {CORRELATION_HEADER} from
  '../../src/utils/correlation.js';

const TEST_SERVICE = 'test-service';
const TEST_OPERATION = 'test-op';
const CHILD_SERVICE = 'child-service';
const CHILD_OPERATION = 'child-op';
const PARENT_TRACE_ID = 'parent-trace-abc';
const SPAN_HEADER = 'x-span-id';

describe('admin-trace-context', () => {
  describe('createTraceContext', () => {
    it('generates traceId and spanId', () => {
      const ctx = createTraceContext(
        TEST_SERVICE, TEST_OPERATION,
      );
      assert.ok(ctx.traceId, 'traceId should be set');
      assert.ok(ctx.spanId, 'spanId should be set');
      assert.notEqual(ctx.traceId, ctx.spanId);
      assert.equal(ctx.serviceName, TEST_SERVICE);
      assert.equal(ctx.operation, TEST_OPERATION);
      assert.equal(ctx.parentSpanId, null);
      assert.equal(typeof ctx.timestamp, 'number');
    });

    it('uses parentTraceId when provided', () => {
      const ctx = createTraceContext(
        TEST_SERVICE, TEST_OPERATION, PARENT_TRACE_ID,
      );
      assert.equal(ctx.traceId, PARENT_TRACE_ID);
      assert.ok(ctx.spanId);
    });

    it('returns a frozen object', () => {
      const ctx = createTraceContext(
        TEST_SERVICE, TEST_OPERATION,
      );
      assert.ok(Object.isFrozen(ctx));
    });

    it('throws when serviceName is missing', () => {
      assert.throws(
        () => createTraceContext(null, TEST_OPERATION),
        {message: TRACE_CONTEXT_ERROR_MSG.SERVICE_NAME_REQUIRED},
      );
    });

    it('throws when operation is missing', () => {
      assert.throws(
        () => createTraceContext(TEST_SERVICE, null),
        {message: TRACE_CONTEXT_ERROR_MSG.OPERATION_REQUIRED},
      );
    });
  });

  describe('createChildSpan', () => {
    it('inherits traceId from parent', () => {
      const parent = createTraceContext(
        TEST_SERVICE, TEST_OPERATION,
      );
      const child = createChildSpan(
        parent, CHILD_SERVICE, CHILD_OPERATION,
      );
      assert.equal(child.traceId, parent.traceId);
    });

    it('sets parentSpanId to parent spanId', () => {
      const parent = createTraceContext(
        TEST_SERVICE, TEST_OPERATION,
      );
      const child = createChildSpan(
        parent, CHILD_SERVICE, CHILD_OPERATION,
      );
      assert.equal(child.parentSpanId, parent.spanId);
    });

    it('generates a new spanId', () => {
      const parent = createTraceContext(
        TEST_SERVICE, TEST_OPERATION,
      );
      const child = createChildSpan(
        parent, CHILD_SERVICE, CHILD_OPERATION,
      );
      assert.notEqual(child.spanId, parent.spanId);
      assert.ok(child.spanId);
    });

    it('throws when parentContext is missing', () => {
      assert.throws(
        () => createChildSpan(
          null, CHILD_SERVICE, CHILD_OPERATION,
        ),
        {
          message:
            TRACE_CONTEXT_ERROR_MSG.PARENT_CONTEXT_REQUIRED,
        },
      );
    });
  });

  describe('extractTraceHeaders', () => {
    it('returns correct header keys', () => {
      const ctx = createTraceContext(
        TEST_SERVICE, TEST_OPERATION,
      );
      const headers = extractTraceHeaders(ctx);
      assert.equal(
        headers[CORRELATION_HEADER], ctx.traceId,
      );
      assert.equal(
        headers[SPAN_HEADER], ctx.spanId,
      );
      const keys = Object.keys(headers);
      assert.equal(keys.length, 2);
      assert.ok(keys.includes(CORRELATION_HEADER));
      assert.ok(keys.includes(SPAN_HEADER));
    });
  });

  describe('TRACE_FIELD constants', () => {
    it('is frozen', () => {
      assert.ok(Object.isFrozen(TRACE_FIELD));
    });

    it('contains expected keys', () => {
      assert.equal(TRACE_FIELD.TRACE_ID, 'traceId');
      assert.equal(TRACE_FIELD.SPAN_ID, 'spanId');
      assert.equal(
        TRACE_FIELD.PARENT_SPAN_ID, 'parentSpanId',
      );
      assert.equal(
        TRACE_FIELD.SERVICE_NAME, 'serviceName',
      );
      assert.equal(TRACE_FIELD.OPERATION, 'operation');
      assert.equal(TRACE_FIELD.TIMESTAMP, 'timestamp');
    });
  });
});
