/**
 * Unit tests for PG wire port allocation and collision handling.
 *
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4
 */

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';

import {
  PgwirePortAllocator,
  PortValidationError,
  PortBindConflictError,
  resolveAllocationMode,
  validatePort,
  validateRange,
  isValidPort,
  classifyBindError,
} from '../../src/runtime/pgwire-port-allocator.js';
import {
  PORT_ALLOCATION_MODE,
  PGWIRE_DYNAMIC_PORT_RANGE_START,
  PGWIRE_DYNAMIC_PORT_RANGE_END,
  PGWIRE_PORT_ERROR,
  BIND_CONFLICT_CODE,
} from '../../src/runtime/pgwire-port-constants.js';
import {MIN_PORT, MAX_PORT} from '../../src/constants/runtime.js';


describe('pgwire-port-constants', () => {
  it('should export frozen PORT_ALLOCATION_MODE', () => {
    assert.ok(Object.isFrozen(PORT_ALLOCATION_MODE));
    assert.equal(PORT_ALLOCATION_MODE.FIXED, 'fixed');
    assert.equal(PORT_ALLOCATION_MODE.DYNAMIC, 'dynamic');
  });

  it('should export default dynamic range within bounds', () => {
    assert.ok(PGWIRE_DYNAMIC_PORT_RANGE_START >= MIN_PORT);
    assert.ok(PGWIRE_DYNAMIC_PORT_RANGE_END <= MAX_PORT);
    assert.ok(
      PGWIRE_DYNAMIC_PORT_RANGE_START <=
      PGWIRE_DYNAMIC_PORT_RANGE_END,
    );
  });

  it('should export frozen PGWIRE_PORT_ERROR', () => {
    assert.ok(Object.isFrozen(PGWIRE_PORT_ERROR));
    assert.equal(typeof PGWIRE_PORT_ERROR.BIND_CONFLICT, 'string');
    assert.equal(
      typeof PGWIRE_PORT_ERROR.NO_PORTS_AVAILABLE, 'string',
    );
  });

  it('should export BIND_CONFLICT_CODE as EADDRINUSE', () => {
    assert.equal(BIND_CONFLICT_CODE, 'EADDRINUSE');
  });
});

describe('isValidPort', () => {
  it('should accept valid port numbers', () => {
    assert.equal(isValidPort(MIN_PORT), true);
    assert.equal(isValidPort(MAX_PORT), true);
    assert.equal(isValidPort(5432), true);
    assert.equal(isValidPort(8080), true);
  });

  it('should reject non-integer values', () => {
    assert.equal(isValidPort(3.14), false);
    assert.equal(isValidPort('5432'), false);
    assert.equal(isValidPort(null), false);
    assert.equal(isValidPort(undefined), false);
  });

  it('should reject out-of-range values', () => {
    assert.equal(isValidPort(0), false);
    assert.equal(isValidPort(-1), false);
    assert.equal(isValidPort(65536), false);
  });
});

describe('validatePort', () => {
  it('should accept valid ports without throwing', () => {
    assert.doesNotThrow(() => validatePort(MIN_PORT));
    assert.doesNotThrow(() => validatePort(5432));
    assert.doesNotThrow(() => validatePort(MAX_PORT));
  });

  it('should throw PortValidationError for non-integer', () => {
    assert.throws(
      () => validatePort('abc'),
      (err) => {
        assert.ok(err instanceof PortValidationError);
        assert.equal(
          err.message, PGWIRE_PORT_ERROR.PORT_NOT_INTEGER,
        );
        return true;
      },
    );
  });

  it('should throw PortValidationError for zero', () => {
    assert.throws(
      () => validatePort(0),
      (err) => {
        assert.ok(err instanceof PortValidationError);
        assert.equal(
          err.message, PGWIRE_PORT_ERROR.PORT_NOT_INTEGER,
        );
        return true;
      },
    );
  });

  it('should throw PortValidationError for out-of-range', () => {
    assert.throws(
      () => validatePort(70000),
      (err) => {
        assert.ok(err instanceof PortValidationError);
        assert.equal(
          err.message, PGWIRE_PORT_ERROR.PORT_OUT_OF_RANGE,
        );
        return true;
      },
    );
  });
});

describe('validateRange', () => {
  it('should accept valid ranges', () => {
    assert.doesNotThrow(() => validateRange(5432, 5532));
    assert.doesNotThrow(() => validateRange(5432, 5432));
  });

  it('should throw when start > end', () => {
    assert.throws(
      () => validateRange(6000, 5000),
      (err) => {
        assert.ok(err instanceof PortValidationError);
        assert.equal(
          err.message,
          PGWIRE_PORT_ERROR.RANGE_START_AFTER_END,
        );
        return true;
      },
    );
  });

  it('should throw when range is outside valid bounds', () => {
    assert.throws(
      () => validateRange(0, 100),
      (err) => {
        assert.ok(err instanceof PortValidationError);
        assert.equal(
          err.message,
          PGWIRE_PORT_ERROR.RANGE_OUTSIDE_BOUNDS,
        );
        return true;
      },
    );
  });
});

describe('resolveAllocationMode', () => {
  it('should return FIXED when port is set without range', () => {
    const mode = resolveAllocationMode({port: 5432});
    assert.equal(mode, PORT_ALLOCATION_MODE.FIXED);
  });

  it('should return DYNAMIC when no port is set', () => {
    const mode = resolveAllocationMode({});
    assert.equal(mode, PORT_ALLOCATION_MODE.DYNAMIC);
  });

  it('should return DYNAMIC when range is set', () => {
    const mode = resolveAllocationMode({
      portRangeStart: 5432,
      portRangeEnd: 5532,
    });
    assert.equal(mode, PORT_ALLOCATION_MODE.DYNAMIC);
  });

  it('should return DYNAMIC when both port and range set', () => {
    const mode = resolveAllocationMode({
      port: 5432,
      portRangeStart: 5432,
      portRangeEnd: 5532,
    });
    assert.equal(mode, PORT_ALLOCATION_MODE.DYNAMIC);
  });

  it('should return DYNAMIC for empty/undefined config', () => {
    assert.equal(
      resolveAllocationMode(), PORT_ALLOCATION_MODE.DYNAMIC,
    );
    assert.equal(
      resolveAllocationMode(undefined),
      PORT_ALLOCATION_MODE.DYNAMIC,
    );
  });
});

describe('PgwirePortAllocator', () => {
  describe('constructor', () => {
    it('should use default range when no options given', () => {
      const alloc = new PgwirePortAllocator();
      assert.ok(alloc);
    });

    it('should accept custom range', () => {
      const alloc = new PgwirePortAllocator({
        dynamicRangeStart: 6000,
        dynamicRangeEnd: 6100,
      });
      assert.ok(alloc);
    });

    it('should throw on invalid range', () => {
      assert.throws(
        () => new PgwirePortAllocator({
          dynamicRangeStart: 7000,
          dynamicRangeEnd: 6000,
        }),
        (err) => err instanceof PortValidationError,
      );
    });
  });

  describe('fixed port allocation', () => {
    it('should return configured port in fixed mode', () => {
      const alloc = new PgwirePortAllocator();
      const port = alloc.allocate('svc-1', {port: 5433});
      assert.equal(port, 5433);
    });

    it('should be idempotent for same serviceId', () => {
      const alloc = new PgwirePortAllocator();
      const p1 = alloc.allocate('svc-1', {port: 5433});
      const p2 = alloc.allocate('svc-1', {port: 5433});
      assert.equal(p1, p2);
    });

    it('should reject invalid fixed port', () => {
      const alloc = new PgwirePortAllocator();
      assert.throws(
        () => alloc.allocate('svc-1', {port: 0}),
        (err) => err instanceof PortValidationError,
      );
    });

    it('should reject out-of-range fixed port', () => {
      const alloc = new PgwirePortAllocator();
      assert.throws(
        () => alloc.allocate('svc-1', {port: 70000}),
        (err) => err instanceof PortValidationError,
      );
    });
  });

  describe('dynamic range allocation', () => {
    it('should return port within configured range', () => {
      const alloc = new PgwirePortAllocator({
        dynamicRangeStart: 7000,
        dynamicRangeEnd: 7010,
      });
      const port = alloc.allocate('svc-1');
      assert.ok(port >= 7000 && port <= 7010);
    });

    it('should allocate sequential ports', () => {
      const alloc = new PgwirePortAllocator({
        dynamicRangeStart: 7000,
        dynamicRangeEnd: 7010,
      });
      const p1 = alloc.allocate('svc-1');
      const p2 = alloc.allocate('svc-2');
      assert.equal(p1, 7000);
      assert.equal(p2, 7001);
    });

    it('should use config range over constructor range', () => {
      const alloc = new PgwirePortAllocator({
        dynamicRangeStart: 7000,
        dynamicRangeEnd: 7010,
      });
      const port = alloc.allocate('svc-1', {
        portRangeStart: 8000,
        portRangeEnd: 8010,
      });
      assert.ok(port >= 8000 && port <= 8010);
    });

    it('should throw when range exhausted', () => {
      const alloc = new PgwirePortAllocator({
        dynamicRangeStart: 9000,
        dynamicRangeEnd: 9001,
      });
      alloc.allocate('svc-1');
      alloc.allocate('svc-2');
      assert.throws(
        () => alloc.allocate('svc-3'),
        (err) => {
          assert.ok(err instanceof PortValidationError);
          assert.ok(
            err.message.includes(
              PGWIRE_PORT_ERROR.NO_PORTS_AVAILABLE,
            ),
          );
          return true;
        },
      );
    });
  });

  describe('release', () => {
    it('should free port for reuse after release', () => {
      const alloc = new PgwirePortAllocator({
        dynamicRangeStart: 9000,
        dynamicRangeEnd: 9000,
      });
      alloc.allocate('svc-1');
      alloc.release('svc-1');
      const port = alloc.allocate('svc-2');
      assert.equal(port, 9000);
    });

    it('should be a no-op for unknown serviceId', () => {
      const alloc = new PgwirePortAllocator();
      assert.doesNotThrow(() => alloc.release('unknown'));
    });
  });

  describe('isAvailable', () => {
    it('should return true for unallocated port', () => {
      const alloc = new PgwirePortAllocator();
      assert.equal(alloc.isAvailable(5432), true);
    });

    it('should return false for allocated port', () => {
      const alloc = new PgwirePortAllocator({
        dynamicRangeStart: 9000,
        dynamicRangeEnd: 9010,
      });
      alloc.allocate('svc-1');
      assert.equal(alloc.isAvailable(9000), false);
    });
  });

  describe('getPort', () => {
    it('should return allocated port', () => {
      const alloc = new PgwirePortAllocator();
      alloc.allocate('svc-1', {port: 5433});
      assert.equal(alloc.getPort('svc-1'), 5433);
    });

    it('should return undefined for unknown service', () => {
      const alloc = new PgwirePortAllocator();
      assert.equal(alloc.getPort('unknown'), undefined);
    });
  });

  describe('serviceId validation', () => {
    it('should throw when serviceId is missing', () => {
      const alloc = new PgwirePortAllocator();
      assert.throws(
        () => alloc.allocate(null),
        (err) => {
          assert.ok(err instanceof PortValidationError);
          assert.equal(
            err.message,
            PGWIRE_PORT_ERROR.SERVICE_ID_REQUIRED,
          );
          return true;
        },
      );
    });

    it('should throw when serviceId is empty string', () => {
      const alloc = new PgwirePortAllocator();
      assert.throws(
        () => alloc.allocate(''),
        (err) => err instanceof PortValidationError,
      );
    });

    it('should throw when serviceId is non-string', () => {
      const alloc = new PgwirePortAllocator();
      assert.throws(
        () => alloc.allocate(123),
        (err) => err instanceof PortValidationError,
      );
    });
  });
});

describe('PortValidationError', () => {
  it('should be an instance of Error', () => {
    const err = new PortValidationError('test');
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'PortValidationError');
    assert.equal(err.message, 'test');
  });

  it('should include context metadata', () => {
    const err = new PortValidationError('bad port', {port: -1});
    assert.equal(err.context.component, 'PgwirePortAllocator');
    assert.equal(err.context.operation, 'validate');
    assert.deepEqual(err.context.metadata, {port: -1});
  });
});

describe('PortBindConflictError', () => {
  it('should be an instance of Error', () => {
    const err = new PortBindConflictError(5432);
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'PortBindConflictError');
    assert.equal(err.port, 5432);
    assert.equal(err.code, BIND_CONFLICT_CODE);
  });

  it('should include detail when provided', () => {
    const err = new PortBindConflictError(5432, 'already in use');
    assert.ok(err.message.includes('5432'));
    assert.ok(err.message.includes('already in use'));
  });

  it('should include context metadata', () => {
    const err = new PortBindConflictError(5432);
    assert.equal(err.context.component, 'PgwirePortAllocator');
    assert.equal(err.context.operation, 'bind');
    assert.deepEqual(err.context.metadata, {port: 5432});
  });
});

describe('classifyBindError', () => {
  it('should wrap EADDRINUSE into PortBindConflictError', () => {
    const osErr = new Error('listen EADDRINUSE 0.0.0.0:5432');
    osErr.code = 'EADDRINUSE';
    const result = classifyBindError(osErr, 5432);
    assert.ok(result instanceof PortBindConflictError);
    assert.equal(result.port, 5432);
    assert.equal(result.code, BIND_CONFLICT_CODE);
  });

  it('should return original error for non-bind errors', () => {
    const osErr = new Error('EACCES');
    osErr.code = 'EACCES';
    const result = classifyBindError(osErr, 5432);
    assert.equal(result, osErr);
  });

  it('should return original error when no code', () => {
    const err = new Error('generic');
    const result = classifyBindError(err, 5432);
    assert.equal(result, err);
  });

  it('should handle null/undefined gracefully', () => {
    assert.equal(classifyBindError(null, 5432), null);
    assert.equal(classifyBindError(undefined, 5432), undefined);
  });
});

describe('consistent behavior across allocation modes', () => {
  it('should produce same result for same config regardless ' +
     'of allocator instance', () => {
    const a1 = new PgwirePortAllocator({
      dynamicRangeStart: 6000,
      dynamicRangeEnd: 6010,
    });
    const a2 = new PgwirePortAllocator({
      dynamicRangeStart: 6000,
      dynamicRangeEnd: 6010,
    });
    const p1 = a1.allocate('svc-1');
    const p2 = a2.allocate('svc-1');
    assert.equal(p1, p2);
  });

  it('should produce same fixed port across instances', () => {
    const a1 = new PgwirePortAllocator();
    const a2 = new PgwirePortAllocator();
    const p1 = a1.allocate('svc-1', {port: 5433});
    const p2 = a2.allocate('svc-1', {port: 5433});
    assert.equal(p1, p2);
  });
});
