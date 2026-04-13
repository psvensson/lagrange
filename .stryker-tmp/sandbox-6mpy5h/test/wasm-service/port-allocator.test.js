// @ts-nocheck
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {PortAllocator} from '../../src/wasm-service/port-allocator.js';
import {
  WASM_SERVICE_ERROR_MSG,
  WASM_SERVICE_DEFAULT,
} from '../../src/wasm-service/wasm-service-constants.js';

describe('PortAllocator', () => {
  it('allocate returns a port within the configured range', () => {
    const allocator = new PortAllocator({
      portRangeStart: 5000,
      portRangeEnd: 5010,
    });
    const port = allocator.allocate('svc-1');
    assert.ok(port >= 5000 && port <= 5010,
      `port ${port} should be in range [5000, 5010]`);
  });

  it('allocate same serviceId returns same port (idempotent)', () => {
    const allocator = new PortAllocator({
      portRangeStart: 5000,
      portRangeEnd: 5010,
    });
    const port1 = allocator.allocate('svc-1');
    const port2 = allocator.allocate('svc-1');
    assert.equal(port1, port2);
  });

  it('allocate different serviceIds returns different ports', () => {
    const allocator = new PortAllocator({
      portRangeStart: 5000,
      portRangeEnd: 5010,
    });
    const port1 = allocator.allocate('svc-1');
    const port2 = allocator.allocate('svc-2');
    assert.notEqual(port1, port2);
  });

  it('release frees the port for reuse', () => {
    const allocator = new PortAllocator({
      portRangeStart: 5000,
      portRangeEnd: 5000,
    });
    const port = allocator.allocate('svc-1');
    assert.equal(port, 5000);
    allocator.release('svc-1');
    const port2 = allocator.allocate('svc-2');
    assert.equal(port2, 5000);
  });

  it('isAvailable returns true for unallocated ports', () => {
    const allocator = new PortAllocator({
      portRangeStart: 5000,
      portRangeEnd: 5010,
    });
    assert.equal(allocator.isAvailable(5000), true);
    assert.equal(allocator.isAvailable(5005), true);
  });

  it('isAvailable returns false for allocated ports', () => {
    const allocator = new PortAllocator({
      portRangeStart: 5000,
      portRangeEnd: 5010,
    });
    allocator.allocate('svc-1');
    assert.equal(allocator.isAvailable(5000), false);
  });

  it('throws PORT_EXHAUSTED when no ports available', () => {
    const allocator = new PortAllocator({
      portRangeStart: 5000,
      portRangeEnd: 5001,
    });
    allocator.allocate('svc-1');
    allocator.allocate('svc-2');
    assert.throws(
      () => allocator.allocate('svc-3'),
      {message: WASM_SERVICE_ERROR_MSG.PORT_EXHAUSTED},
    );
  });

  it('release non-existent serviceId is safe (no-op)', () => {
    const allocator = new PortAllocator({
      portRangeStart: 5000,
      portRangeEnd: 5010,
    });
    assert.doesNotThrow(() => allocator.release('nonexistent'));
  });

  it('uses default port range when no options provided', () => {
    const allocator = new PortAllocator();
    const port = allocator.allocate('svc-1');
    assert.ok(
      port >= WASM_SERVICE_DEFAULT.PORT_RANGE_START &&
      port <= WASM_SERVICE_DEFAULT.PORT_RANGE_END,
      `port ${port} should be in default range`,
    );
    allocator.release('svc-1');
  });

  it('allocates ports sequentially from range start', () => {
    const allocator = new PortAllocator({
      portRangeStart: 5000,
      portRangeEnd: 5010,
    });
    const port1 = allocator.allocate('svc-1');
    const port2 = allocator.allocate('svc-2');
    const port3 = allocator.allocate('svc-3');
    assert.equal(port1, 5000);
    assert.equal(port2, 5001);
    assert.equal(port3, 5002);
  });

  it('isAvailable reflects state after release', () => {
    const allocator = new PortAllocator({
      portRangeStart: 5000,
      portRangeEnd: 5010,
    });
    allocator.allocate('svc-1');
    assert.equal(allocator.isAvailable(5000), false);
    allocator.release('svc-1');
    assert.equal(allocator.isAvailable(5000), true);
  });
});
