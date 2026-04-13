// @ts-nocheck
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  WASM_SERVICE_SUBSYSTEM,
  READ_CONSISTENCY_MODE,
  WRITE_CONSISTENCY_MODE,
  TIMER_STATUS,
  RESERVED_KV_PREFIX,
  DEFAULT_SAFETY_INTERVAL_MS,
  DEFAULT_RESOURCE_BUDGET,
  WASM_SERVICE_ERROR_MSG,
  WASM_SERVICE_LOG_MSG,
  WASM_SERVICE_EXECUTOR_TYPE,
  WASM_SERVICE_PROTOCOL,
  WASM_SERVICE_HEALTH_STATUS,
  WASM_SERVICE_DEFINITION_STATUS,
  WASM_SERVICE_DEFAULT,
} from '../../src/wasm-service/wasm-service-constants.js';

describe('wasm-service-constants', () => {
  describe('WASM_SERVICE_SUBSYSTEM', () => {
    it('should be frozen', () => {
      assert.ok(Object.isFrozen(WASM_SERVICE_SUBSYSTEM));
    });

    it('should have REPLICA subsystem name', () => {
      assert.equal(
        WASM_SERVICE_SUBSYSTEM.REPLICA,
        'wasm-service-replica'
      );
    });
  });

  describe('READ_CONSISTENCY_MODE', () => {
    it('should be frozen', () => {
      assert.ok(Object.isFrozen(READ_CONSISTENCY_MODE));
    });

    it('should have all three modes', () => {
      assert.equal(READ_CONSISTENCY_MODE.LEADER_ONLY, 'leader_only');
      assert.equal(READ_CONSISTENCY_MODE.STRONG, 'strong');
      assert.equal(READ_CONSISTENCY_MODE.EVENTUAL, 'eventual');
    });

    it('should have exactly three modes', () => {
      assert.equal(Object.keys(READ_CONSISTENCY_MODE).length, 3);
    });
  });

  describe('WRITE_CONSISTENCY_MODE', () => {
    it('should be frozen', () => {
      assert.ok(Object.isFrozen(WRITE_CONSISTENCY_MODE));
    });

    it('should have both modes', () => {
      assert.equal(WRITE_CONSISTENCY_MODE.STRONG, 'strong');
      assert.equal(WRITE_CONSISTENCY_MODE.ASYNC, 'async');
    });

    it('should have exactly two modes', () => {
      assert.equal(Object.keys(WRITE_CONSISTENCY_MODE).length, 2);
    });
  });

  describe('TIMER_STATUS', () => {
    it('should be frozen', () => {
      assert.ok(Object.isFrozen(TIMER_STATUS));
    });

    it('should have all three statuses', () => {
      assert.equal(TIMER_STATUS.ACTIVE, 'active');
      assert.equal(TIMER_STATUS.FIRED, 'fired');
      assert.equal(TIMER_STATUS.CANCELLED, 'cancelled');
    });
  });

  describe('RESERVED_KV_PREFIX', () => {
    it('should be frozen', () => {
      assert.ok(Object.isFrozen(RESERVED_KV_PREFIX));
    });

    it('should have timers prefix', () => {
      assert.equal(RESERVED_KV_PREFIX.TIMERS, '_timers/');
    });
  });

  describe('DEFAULT_SAFETY_INTERVAL_MS', () => {
    it('should be 500ms', () => {
      assert.equal(DEFAULT_SAFETY_INTERVAL_MS, 500);
    });
  });

  describe('DEFAULT_RESOURCE_BUDGET', () => {
    it('should be frozen', () => {
      assert.ok(Object.isFrozen(DEFAULT_RESOURCE_BUDGET));
    });

    it('should have correct default values', () => {
      assert.equal(DEFAULT_RESOURCE_BUDGET.CPU_TIME_LIMIT_MS, 5000);
      assert.equal(
        DEFAULT_RESOURCE_BUDGET.MEMORY_LIMIT_BYTES, 67108864
      );
      assert.equal(
        DEFAULT_RESOURCE_BUDGET.SESSION_SIZE_LIMIT_BYTES, 1048576
      );
      assert.equal(
        DEFAULT_RESOURCE_BUDGET.SERVICE_SIZE_LIMIT_BYTES, 104857600
      );
    });
  });

  describe('WASM_SERVICE_ERROR_MSG', () => {
    it('should be frozen', () => {
      assert.ok(Object.isFrozen(WASM_SERVICE_ERROR_MSG));
    });

    it('should have all required error messages', () => {
      const requiredKeys = [
        'HANDLER_FUNCTION_NOT_FOUND',
        'ODD_REPLICA_COUNT_REQUIRED',
        'INVALID_CONSISTENCY_MODE',
        'CPU_TIME_LIMIT_EXCEEDED',
        'MEMORY_LIMIT_EXCEEDED',
        'SESSION_SIZE_LIMIT_EXCEEDED',
        'SERVICE_SIZE_LIMIT_EXCEEDED',
        'SERVICE_NOT_READY',
        'MODULE_NOT_AVAILABLE',
        'PORT_EXHAUSTED',
      ];
      for (const key of requiredKeys) {
        assert.ok(
          key in WASM_SERVICE_ERROR_MSG,
          `Missing error message: ${key}`
        );
        assert.equal(typeof WASM_SERVICE_ERROR_MSG[key], 'string');
      }
    });
  });

  describe('WASM_SERVICE_LOG_MSG', () => {
    it('should be frozen', () => {
      assert.ok(Object.isFrozen(WASM_SERVICE_LOG_MSG));
    });

    it('should have string values for all keys', () => {
      for (const [key, value] of Object.entries(WASM_SERVICE_LOG_MSG)) {
        assert.equal(
          typeof value, 'string',
          `Log message ${key} should be a string`
        );
      }
    });
  });

  describe('WASM_SERVICE_EXECUTOR_TYPE', () => {
    it('should be wasm_service', () => {
      assert.equal(WASM_SERVICE_EXECUTOR_TYPE, 'wasm_service');
    });
  });

  describe('WASM_SERVICE_DEFAULT', () => {
    it('should be frozen', () => {
      assert.ok(Object.isFrozen(WASM_SERVICE_DEFAULT));
    });

    it('should reference consistency mode constants', () => {
      assert.equal(
        WASM_SERVICE_DEFAULT.READ_CONSISTENCY,
        READ_CONSISTENCY_MODE.STRONG
      );
      assert.equal(
        WASM_SERVICE_DEFAULT.WRITE_CONSISTENCY,
        WRITE_CONSISTENCY_MODE.STRONG
      );
    });

    it('should have correct default replica count', () => {
      assert.equal(WASM_SERVICE_DEFAULT.REPLICA_COUNT, 3);
    });

    it('should have correct default safety interval', () => {
      assert.equal(
        WASM_SERVICE_DEFAULT.SAFETY_INTERVAL_MS,
        DEFAULT_SAFETY_INTERVAL_MS
      );
    });

    it('should have correct default protocol', () => {
      assert.equal(
        WASM_SERVICE_DEFAULT.PROTOCOL,
        WASM_SERVICE_PROTOCOL.WEBSOCKET
      );
    });
  });

  describe('WASM_SERVICE_PROTOCOL', () => {
    it('should be frozen', () => {
      assert.ok(Object.isFrozen(WASM_SERVICE_PROTOCOL));
    });

    it('should have websocket protocol', () => {
      assert.equal(WASM_SERVICE_PROTOCOL.WEBSOCKET, 'websocket');
    });
  });

  describe('WASM_SERVICE_HEALTH_STATUS', () => {
    it('should be frozen', () => {
      assert.ok(Object.isFrozen(WASM_SERVICE_HEALTH_STATUS));
    });

    it('should have healthy and unhealthy statuses', () => {
      assert.equal(WASM_SERVICE_HEALTH_STATUS.HEALTHY, 'healthy');
      assert.equal(WASM_SERVICE_HEALTH_STATUS.UNHEALTHY, 'unhealthy');
    });
  });

  describe('WASM_SERVICE_DEFINITION_STATUS', () => {
    it('should be frozen', () => {
      assert.ok(Object.isFrozen(WASM_SERVICE_DEFINITION_STATUS));
    });

    it('should have active and inactive statuses', () => {
      assert.equal(
        WASM_SERVICE_DEFINITION_STATUS.ACTIVE, 'active'
      );
      assert.equal(
        WASM_SERVICE_DEFINITION_STATUS.INACTIVE, 'inactive'
      );
    });
  });
});
