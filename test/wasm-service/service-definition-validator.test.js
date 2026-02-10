import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  ServiceDefinitionValidator,
} from '../../src/wasm-service/service-definition-validator.js';
import {
  READ_CONSISTENCY_MODE,
  WRITE_CONSISTENCY_MODE,
  WASM_SERVICE_ERROR_MSG,
} from '../../src/wasm-service/wasm-service-constants.js';

/**
 * Creates a mock SQL query engine that returns rows for
 * the given set of known function IDs.
 * @param {Set<string>} knownIds - Set of function IDs that exist.
 * @return {Object} Mock sqlQueryEngine.
 */
function createMockSqlEngine(knownIds) {
  return {
    async executeQuery(_sql, params) {
      const functionId = params[0];
      if (knownIds.has(functionId)) {
        return {rows: [{function_id: functionId}]};
      }
      return {rows: []};
    },
  };
}

/**
 * Builds a valid service definition with optional overrides.
 * @param {Object} overrides - Fields to override.
 * @return {Object} ServiceDefinition object.
 */
function buildDefinition(overrides = {}) {
  return {
    serviceId: 'svc-1',
    serviceName: 'test-service',
    handlerFunctionId: 'func-1',
    readConsistency: READ_CONSISTENCY_MODE.STRONG,
    writeConsistency: WRITE_CONSISTENCY_MODE.STRONG,
    replicaCount: 3,
    resourceBudget: {
      cpuTimeLimitMs: 5000,
      memoryLimitBytes: 67108864,
      sessionSizeLimitBytes: 1048576,
      serviceSizeLimitBytes: 104857600,
    },
    ...overrides,
  };
}

describe('ServiceDefinitionValidator', () => {
  describe('valid definitions', () => {
    it('should accept a fully valid definition', async () => {
      const engine = createMockSqlEngine(new Set(['func-1']));
      const validator = new ServiceDefinitionValidator({
        sqlQueryEngine: engine,
      });
      const result = await validator.validate(buildDefinition());
      assert.equal(result.valid, true);
      assert.equal(result.errors.length, 0);
    });

    it('should accept replica count 5', async () => {
      const engine = createMockSqlEngine(new Set(['func-1']));
      const validator = new ServiceDefinitionValidator({
        sqlQueryEngine: engine,
      });
      const def = buildDefinition({replicaCount: 5});
      const result = await validator.validate(def);
      assert.equal(result.valid, true);
    });

    it('should accept replica count 7', async () => {
      const engine = createMockSqlEngine(new Set(['func-1']));
      const validator = new ServiceDefinitionValidator({
        sqlQueryEngine: engine,
      });
      const def = buildDefinition({replicaCount: 7});
      const result = await validator.validate(def);
      assert.equal(result.valid, true);
    });

    it('should accept all read consistency modes', async () => {
      const engine = createMockSqlEngine(new Set(['func-1']));
      const validator = new ServiceDefinitionValidator({
        sqlQueryEngine: engine,
      });
      for (const mode of Object.values(READ_CONSISTENCY_MODE)) {
        const def = buildDefinition({readConsistency: mode});
        const result = await validator.validate(def);
        assert.equal(result.valid, true, `mode ${mode}`);
      }
    });

    it('should accept all write consistency modes', async () => {
      const engine = createMockSqlEngine(new Set(['func-1']));
      const validator = new ServiceDefinitionValidator({
        sqlQueryEngine: engine,
      });
      for (const mode of Object.values(WRITE_CONSISTENCY_MODE)) {
        const def = buildDefinition({writeConsistency: mode});
        const result = await validator.validate(def);
        assert.equal(result.valid, true, `mode ${mode}`);
      }
    });

    it('should accept zero resource budget values', async () => {
      const engine = createMockSqlEngine(new Set(['func-1']));
      const validator = new ServiceDefinitionValidator({
        sqlQueryEngine: engine,
      });
      const def = buildDefinition({
        resourceBudget: {
          cpuTimeLimitMs: 0,
          memoryLimitBytes: 0,
          sessionSizeLimitBytes: 0,
          serviceSizeLimitBytes: 0,
        },
      });
      const result = await validator.validate(def);
      assert.equal(result.valid, true);
    });
  });

  describe('handler function validation', () => {
    it('should reject when handler function not found', async () => {
      const engine = createMockSqlEngine(new Set());
      const validator = new ServiceDefinitionValidator({
        sqlQueryEngine: engine,
      });
      const result = await validator.validate(buildDefinition());
      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(
        WASM_SERVICE_ERROR_MSG.HANDLER_FUNCTION_NOT_FOUND,
      ));
    });

    it('should reject when result has no rows', async () => {
      const engine = {
        async executeQuery() {
          return {rows: null};
        },
      };
      const validator = new ServiceDefinitionValidator({
        sqlQueryEngine: engine,
      });
      const result = await validator.validate(buildDefinition());
      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(
        WASM_SERVICE_ERROR_MSG.HANDLER_FUNCTION_NOT_FOUND,
      ));
    });
  });

  describe('replica count validation', () => {
    it('should reject even replica count', async () => {
      const engine = createMockSqlEngine(new Set(['func-1']));
      const validator = new ServiceDefinitionValidator({
        sqlQueryEngine: engine,
      });
      const def = buildDefinition({replicaCount: 4});
      const result = await validator.validate(def);
      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(
        WASM_SERVICE_ERROR_MSG.ODD_REPLICA_COUNT_REQUIRED,
      ));
    });

    it('should reject replica count of 1', async () => {
      const engine = createMockSqlEngine(new Set(['func-1']));
      const validator = new ServiceDefinitionValidator({
        sqlQueryEngine: engine,
      });
      const def = buildDefinition({replicaCount: 1});
      const result = await validator.validate(def);
      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(
        WASM_SERVICE_ERROR_MSG.ODD_REPLICA_COUNT_REQUIRED,
      ));
    });

    it('should reject replica count of 2', async () => {
      const engine = createMockSqlEngine(new Set(['func-1']));
      const validator = new ServiceDefinitionValidator({
        sqlQueryEngine: engine,
      });
      const def = buildDefinition({replicaCount: 2});
      const result = await validator.validate(def);
      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(
        WASM_SERVICE_ERROR_MSG.ODD_REPLICA_COUNT_REQUIRED,
      ));
    });

    it('should reject replica count of 0', async () => {
      const engine = createMockSqlEngine(new Set(['func-1']));
      const validator = new ServiceDefinitionValidator({
        sqlQueryEngine: engine,
      });
      const def = buildDefinition({replicaCount: 0});
      const result = await validator.validate(def);
      assert.equal(result.valid, false);
    });
  });

  describe('consistency mode validation', () => {
    it('should reject invalid read consistency mode', async () => {
      const engine = createMockSqlEngine(new Set(['func-1']));
      const validator = new ServiceDefinitionValidator({
        sqlQueryEngine: engine,
      });
      const def = buildDefinition({readConsistency: 'invalid'});
      const result = await validator.validate(def);
      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(
        WASM_SERVICE_ERROR_MSG.INVALID_CONSISTENCY_MODE,
      ));
    });

    it('should reject invalid write consistency mode', async () => {
      const engine = createMockSqlEngine(new Set(['func-1']));
      const validator = new ServiceDefinitionValidator({
        sqlQueryEngine: engine,
      });
      const def = buildDefinition({writeConsistency: 'invalid'});
      const result = await validator.validate(def);
      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(
        WASM_SERVICE_ERROR_MSG.INVALID_CONSISTENCY_MODE,
      ));
    });

    it('should report two errors for both invalid modes',
      async () => {
        const engine = createMockSqlEngine(new Set(['func-1']));
        const validator = new ServiceDefinitionValidator({
          sqlQueryEngine: engine,
        });
        const def = buildDefinition({
          readConsistency: 'bad-read',
          writeConsistency: 'bad-write',
        });
        const result = await validator.validate(def);
        const modeErrors = result.errors.filter(
          (e) => e === WASM_SERVICE_ERROR_MSG.INVALID_CONSISTENCY_MODE,
        );
        assert.equal(modeErrors.length, 2);
      },
    );
  });

  describe('resource budget validation', () => {
    it('should reject negative cpuTimeLimitMs', async () => {
      const engine = createMockSqlEngine(new Set(['func-1']));
      const validator = new ServiceDefinitionValidator({
        sqlQueryEngine: engine,
      });
      const def = buildDefinition({
        resourceBudget: {
          cpuTimeLimitMs: -1,
          memoryLimitBytes: 1000,
          sessionSizeLimitBytes: 1000,
          serviceSizeLimitBytes: 1000,
        },
      });
      const result = await validator.validate(def);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some(
        (e) => e.includes('cpuTimeLimitMs'),
      ));
    });

    it('should reject non-number budget values', async () => {
      const engine = createMockSqlEngine(new Set(['func-1']));
      const validator = new ServiceDefinitionValidator({
        sqlQueryEngine: engine,
      });
      const def = buildDefinition({
        resourceBudget: {
          cpuTimeLimitMs: 'not-a-number',
          memoryLimitBytes: 1000,
          sessionSizeLimitBytes: 1000,
          serviceSizeLimitBytes: 1000,
        },
      });
      const result = await validator.validate(def);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some(
        (e) => e.includes('cpuTimeLimitMs'),
      ));
    });

    it('should skip validation for missing budget', async () => {
      const engine = createMockSqlEngine(new Set(['func-1']));
      const validator = new ServiceDefinitionValidator({
        sqlQueryEngine: engine,
      });
      const def = buildDefinition({resourceBudget: null});
      const result = await validator.validate(def);
      assert.equal(result.valid, true);
    });

    it('should skip undefined budget fields', async () => {
      const engine = createMockSqlEngine(new Set(['func-1']));
      const validator = new ServiceDefinitionValidator({
        sqlQueryEngine: engine,
      });
      const def = buildDefinition({resourceBudget: {}});
      const result = await validator.validate(def);
      assert.equal(result.valid, true);
    });
  });

  describe('multiple errors', () => {
    it('should collect all errors at once', async () => {
      const engine = createMockSqlEngine(new Set());
      const validator = new ServiceDefinitionValidator({
        sqlQueryEngine: engine,
      });
      const def = buildDefinition({
        handlerFunctionId: 'nonexistent',
        replicaCount: 2,
        readConsistency: 'bad',
        writeConsistency: 'bad',
        resourceBudget: {cpuTimeLimitMs: -1},
      });
      const result = await validator.validate(def);
      assert.equal(result.valid, false);
      assert.ok(result.errors.length >= 4);
    });
  });
});
