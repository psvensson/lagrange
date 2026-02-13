import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  SD_COL,
  RB_FIELD,
  TE_FIELD,
  serializeResourceBudget,
  deserializeResourceBudget,
  serializeServiceDefinition,
  deserializeServiceDefinition,
  serializeTimerEntry,
  deserializeTimerEntry,
} from '../../src/wasm-service/wasm-service-models.js';
import {
  DEFAULT_RESOURCE_BUDGET,
  WASM_SERVICE_DEFAULT,
  WASM_SERVICE_DEFINITION_STATUS,
  TIMER_STATUS,
} from '../../src/wasm-service/wasm-service-constants.js';
import {
  RUNTIME_KIND,
  RUNTIME_FIELD,
} from '../../src/constants/runtime.js';

describe('wasm-service-models', () => {
  describe('SD_COL', () => {
    it('should be frozen', () => {
      assert.ok(Object.isFrozen(SD_COL));
    });

    it('should have all service_definitions column names', () => {
      assert.equal(SD_COL.SERVICE_ID, 'service_id');
      assert.equal(SD_COL.SERVICE_NAME, 'service_name');
      assert.equal(SD_COL.SERVICE_PROFILE, 'service_profile');
      assert.equal(
        SD_COL.HANDLER_FUNCTION_ID, 'handler_function_id'
      );
      assert.equal(SD_COL.READ_CONSISTENCY, 'read_consistency');
      assert.equal(SD_COL.WRITE_CONSISTENCY, 'write_consistency');
      assert.equal(SD_COL.REPLICA_COUNT, 'replica_count');
      assert.equal(SD_COL.PROTOCOL, 'protocol');
      assert.equal(SD_COL.RESOURCE_BUDGET, 'resource_budget');
      assert.equal(SD_COL.SAFETY_INTERVAL_MS, 'safety_interval_ms');
      assert.equal(
        SD_COL.RUNTIME_KIND, RUNTIME_FIELD.RUNTIME_KIND
      );
      assert.equal(
        SD_COL.RUNTIME_REF, RUNTIME_FIELD.RUNTIME_REF
      );
      assert.equal(
        SD_COL.RUNTIME_CONFIG, RUNTIME_FIELD.RUNTIME_CONFIG
      );
      assert.equal(SD_COL.STATUS, 'status');
      assert.equal(SD_COL.CREATED_AT, 'created_at');
      assert.equal(SD_COL.UPDATED_AT, 'updated_at');
    });
  });

  describe('RB_FIELD', () => {
    it('should be frozen', () => {
      assert.ok(Object.isFrozen(RB_FIELD));
    });

    it('should have all resource budget field names', () => {
      assert.equal(RB_FIELD.CPU_TIME_LIMIT_MS, 'cpuTimeLimitMs');
      assert.equal(
        RB_FIELD.MEMORY_LIMIT_BYTES, 'memoryLimitBytes'
      );
      assert.equal(
        RB_FIELD.SESSION_SIZE_LIMIT_BYTES,
        'sessionSizeLimitBytes'
      );
      assert.equal(
        RB_FIELD.SERVICE_SIZE_LIMIT_BYTES,
        'serviceSizeLimitBytes'
      );
    });
  });

  describe('TE_FIELD', () => {
    it('should be frozen', () => {
      assert.ok(Object.isFrozen(TE_FIELD));
    });

    it('should have all timer entry field names', () => {
      assert.equal(TE_FIELD.TIMER_ID, 'timerId');
      assert.equal(TE_FIELD.SERVICE_ID, 'serviceId');
      assert.equal(TE_FIELD.DELAY_MS, 'delayMs');
      assert.equal(TE_FIELD.FIRE_AT, 'fireAt');
      assert.equal(TE_FIELD.PAYLOAD, 'payload');
      assert.equal(TE_FIELD.STATUS, 'status');
      assert.equal(TE_FIELD.CREATED_AT, 'createdAt');
    });
  });

  describe('serializeResourceBudget / deserializeResourceBudget', () => {
    it('should round-trip a full budget', () => {
      const budget = {
        cpuTimeLimitMs: 3000,
        memoryLimitBytes: 33554432,
        sessionSizeLimitBytes: 524288,
        serviceSizeLimitBytes: 52428800,
      };
      const json = serializeResourceBudget(budget);
      const result = deserializeResourceBudget(json);
      assert.deepStrictEqual(result, budget);
    });

    it('should apply defaults for missing fields', () => {
      const json = serializeResourceBudget({});
      const result = deserializeResourceBudget(json);
      assert.equal(
        result.cpuTimeLimitMs,
        DEFAULT_RESOURCE_BUDGET.CPU_TIME_LIMIT_MS
      );
      assert.equal(
        result.memoryLimitBytes,
        DEFAULT_RESOURCE_BUDGET.MEMORY_LIMIT_BYTES
      );
      assert.equal(
        result.sessionSizeLimitBytes,
        DEFAULT_RESOURCE_BUDGET.SESSION_SIZE_LIMIT_BYTES
      );
      assert.equal(
        result.serviceSizeLimitBytes,
        DEFAULT_RESOURCE_BUDGET.SERVICE_SIZE_LIMIT_BYTES
      );
    });

    it('should produce valid JSON string', () => {
      const budget = {cpuTimeLimitMs: 1000};
      const json = serializeResourceBudget(budget);
      assert.equal(typeof json, 'string');
      assert.doesNotThrow(() => JSON.parse(json));
    });

    it('should preserve zero values', () => {
      const budget = {
        cpuTimeLimitMs: 0,
        memoryLimitBytes: 0,
        sessionSizeLimitBytes: 0,
        serviceSizeLimitBytes: 0,
      };
      const json = serializeResourceBudget(budget);
      const result = deserializeResourceBudget(json);
      assert.deepStrictEqual(result, budget);
    });
  });

  describe('serializeServiceDefinition / deserializeServiceDefinition', () => {
    it('should round-trip a full definition', () => {
      const now = Date.now();
      const definition = {
        serviceId: 'svc-1',
        serviceName: 'my-service',
        serviceProfile: 'default',
        handlerFunctionId: 'func-1',
        readConsistency: 'leader_only',
        writeConsistency: 'async',
        replicaCount: 5,
        protocol: 'websocket',
        resourceBudget: {
          cpuTimeLimitMs: 3000,
          memoryLimitBytes: 33554432,
          sessionSizeLimitBytes: 524288,
          serviceSizeLimitBytes: 52428800,
        },
        safetyIntervalMs: 1000,
        runtimeKind: RUNTIME_KIND.NATIVE_JS,
        runtimeRef: 'admin-handler-v1',
        runtimeConfig: '{"timeout":5000}',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      };
      const row = serializeServiceDefinition(definition);
      const result = deserializeServiceDefinition(row);
      assert.deepStrictEqual(result, definition);
    });

    it('should produce snake_case keys in row', () => {
      const row = serializeServiceDefinition({
        serviceId: 'svc-1',
        serviceName: 'test',
        handlerFunctionId: 'func-1',
      });
      assert.ok(SD_COL.SERVICE_ID in row);
      assert.ok(SD_COL.SERVICE_NAME in row);
      assert.ok(SD_COL.SERVICE_PROFILE in row);
      assert.ok(SD_COL.HANDLER_FUNCTION_ID in row);
      assert.ok(SD_COL.READ_CONSISTENCY in row);
      assert.ok(SD_COL.WRITE_CONSISTENCY in row);
      assert.ok(SD_COL.REPLICA_COUNT in row);
      assert.ok(SD_COL.PROTOCOL in row);
      assert.ok(SD_COL.RESOURCE_BUDGET in row);
      assert.ok(SD_COL.SAFETY_INTERVAL_MS in row);
      assert.ok(SD_COL.RUNTIME_KIND in row);
      assert.ok(SD_COL.RUNTIME_REF in row);
      assert.ok(SD_COL.RUNTIME_CONFIG in row);
      assert.ok(SD_COL.STATUS in row);
      assert.ok(SD_COL.CREATED_AT in row);
      assert.ok(SD_COL.UPDATED_AT in row);
    });

    it('should JSON-encode resource_budget in row', () => {
      const row = serializeServiceDefinition({
        serviceId: 'svc-1',
        serviceName: 'test',
        handlerFunctionId: 'func-1',
        resourceBudget: {cpuTimeLimitMs: 2000},
      });
      assert.equal(typeof row[SD_COL.RESOURCE_BUDGET], 'string');
      const parsed = JSON.parse(row[SD_COL.RESOURCE_BUDGET]);
      assert.equal(parsed.cpuTimeLimitMs, 2000);
    });

    it('should apply defaults for missing optional fields', () => {
      const row = serializeServiceDefinition({
        serviceId: 'svc-1',
        serviceName: 'test',
        handlerFunctionId: 'func-1',
      });
      assert.equal(
        row[SD_COL.READ_CONSISTENCY],
        WASM_SERVICE_DEFAULT.READ_CONSISTENCY
      );
      assert.equal(
        row[SD_COL.WRITE_CONSISTENCY],
        WASM_SERVICE_DEFAULT.WRITE_CONSISTENCY
      );
      assert.equal(
        row[SD_COL.REPLICA_COUNT],
        WASM_SERVICE_DEFAULT.REPLICA_COUNT
      );
      assert.equal(
        row[SD_COL.PROTOCOL],
        WASM_SERVICE_DEFAULT.PROTOCOL
      );
      assert.equal(
        row[SD_COL.SAFETY_INTERVAL_MS],
        WASM_SERVICE_DEFAULT.SAFETY_INTERVAL_MS
      );
      assert.equal(
        row[SD_COL.STATUS],
        WASM_SERVICE_DEFINITION_STATUS.ACTIVE
      );
    });

    it('should deserialize row with empty resource_budget', () => {
      const row = {
        [SD_COL.SERVICE_ID]: 'svc-1',
        [SD_COL.SERVICE_NAME]: 'test',
        [SD_COL.HANDLER_FUNCTION_ID]: 'func-1',
        [SD_COL.READ_CONSISTENCY]: 'strong',
        [SD_COL.WRITE_CONSISTENCY]: 'strong',
        [SD_COL.REPLICA_COUNT]: 3,
        [SD_COL.PROTOCOL]: 'websocket',
        [SD_COL.RESOURCE_BUDGET]: '{}',
        [SD_COL.SAFETY_INTERVAL_MS]: 500,
        [SD_COL.STATUS]: 'active',
        [SD_COL.CREATED_AT]: 1000,
        [SD_COL.UPDATED_AT]: 1000,
      };
      const def = deserializeServiceDefinition(row);
      assert.equal(
        def.resourceBudget.cpuTimeLimitMs,
        DEFAULT_RESOURCE_BUDGET.CPU_TIME_LIMIT_MS
      );
    });

    it('should default runtime fields to null for legacy rows', () => {
      const row = {
        [SD_COL.SERVICE_ID]: 'svc-legacy',
        [SD_COL.SERVICE_NAME]: 'legacy-svc',
        [SD_COL.HANDLER_FUNCTION_ID]: 'func-1',
        [SD_COL.READ_CONSISTENCY]: 'strong',
        [SD_COL.WRITE_CONSISTENCY]: 'strong',
        [SD_COL.REPLICA_COUNT]: 3,
        [SD_COL.PROTOCOL]: 'websocket',
        [SD_COL.RESOURCE_BUDGET]: '{}',
        [SD_COL.SAFETY_INTERVAL_MS]: 500,
        [SD_COL.STATUS]: 'active',
        [SD_COL.CREATED_AT]: 1000,
        [SD_COL.UPDATED_AT]: 1000,
      };
      const def = deserializeServiceDefinition(row);
      assert.equal(def.runtimeKind, RUNTIME_KIND.WASM_COMPONENT);
      assert.equal(def.runtimeRef, 'func-1');
      assert.equal(def.runtimeConfig, null);
    });

    it('should serialize null runtime fields when not provided', () => {
      const row = serializeServiceDefinition({
        serviceId: 'svc-1',
        serviceName: 'test',
        handlerFunctionId: 'func-1',
      });
      assert.equal(
        row[SD_COL.RUNTIME_KIND], RUNTIME_KIND.WASM_COMPONENT
      );
      assert.equal(row[SD_COL.RUNTIME_REF], 'func-1');
      assert.equal(row[SD_COL.RUNTIME_CONFIG], null);
    });

    it('should preserve runtime fields through round-trip', () => {
      const row = serializeServiceDefinition({
        serviceId: 'svc-rt',
        serviceName: 'runtime-svc',
        handlerFunctionId: 'func-1',
        runtimeKind: RUNTIME_KIND.WASM_COMPONENT,
        runtimeRef: 'module-abc@sha256:deadbeef',
        runtimeConfig: '{"memory":64}',
      });
      assert.equal(
        row[SD_COL.RUNTIME_KIND], RUNTIME_KIND.WASM_COMPONENT
      );
      assert.equal(
        row[SD_COL.RUNTIME_REF], 'module-abc@sha256:deadbeef'
      );
      assert.equal(row[SD_COL.RUNTIME_CONFIG], '{"memory":64}');
      const def = deserializeServiceDefinition(row);
      assert.equal(def.runtimeKind, RUNTIME_KIND.WASM_COMPONENT);
      assert.equal(
        def.runtimeRef, 'module-abc@sha256:deadbeef'
      );
      assert.equal(def.runtimeConfig, '{"memory":64}');
    });
  });

  describe('serializeTimerEntry / deserializeTimerEntry', () => {
    it('should round-trip a full timer entry', () => {
      const entry = {
        timerId: 'timer-1',
        serviceId: 'svc-1',
        delayMs: 5000,
        fireAt: 1700000000000,
        payload: {action: 'refresh'},
        status: 'active',
        createdAt: 1699999995000,
      };
      const json = serializeTimerEntry(entry);
      const result = deserializeTimerEntry(json);
      assert.deepStrictEqual(result, entry);
    });

    it('should produce valid JSON string', () => {
      const entry = {
        timerId: 'timer-1',
        serviceId: 'svc-1',
      };
      const json = serializeTimerEntry(entry);
      assert.equal(typeof json, 'string');
      assert.doesNotThrow(() => JSON.parse(json));
    });

    it('should apply defaults for missing fields', () => {
      const entry = {
        timerId: 'timer-1',
        serviceId: 'svc-1',
      };
      const json = serializeTimerEntry(entry);
      const result = deserializeTimerEntry(json);
      assert.equal(result.delayMs, 0);
      assert.equal(result.fireAt, 0);
      assert.deepStrictEqual(result.payload, {});
      assert.equal(result.status, TIMER_STATUS.ACTIVE);
      assert.equal(result.createdAt, 0);
    });

    it('should preserve cancelled status', () => {
      const entry = {
        timerId: 'timer-1',
        serviceId: 'svc-1',
        status: TIMER_STATUS.CANCELLED,
      };
      const json = serializeTimerEntry(entry);
      const result = deserializeTimerEntry(json);
      assert.equal(result.status, TIMER_STATUS.CANCELLED);
    });

    it('should preserve fired status', () => {
      const entry = {
        timerId: 'timer-1',
        serviceId: 'svc-1',
        status: TIMER_STATUS.FIRED,
      };
      const json = serializeTimerEntry(entry);
      const result = deserializeTimerEntry(json);
      assert.equal(result.status, TIMER_STATUS.FIRED);
    });

    it('should preserve complex payload', () => {
      const entry = {
        timerId: 'timer-1',
        serviceId: 'svc-1',
        payload: {nested: {key: 'value'}, arr: [1, 2, 3]},
      };
      const json = serializeTimerEntry(entry);
      const result = deserializeTimerEntry(json);
      assert.deepStrictEqual(
        result.payload,
        {nested: {key: 'value'}, arr: [1, 2, 3]}
      );
    });
  });
});
