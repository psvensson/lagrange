import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  ServiceDefinitionValidator,
} from '../../src/wasm-service/service-definition-validator.js';
import {SERVICE_PROFILE} from '../../src/constants/index.js';
import {
  READ_CONSISTENCY_MODE,
  WRITE_CONSISTENCY_MODE,
  SQL_ENGINE_PROFILE,
  WASM_SERVICE_ERROR_MSG,
} from '../../src/wasm-service/wasm-service-constants.js';
import {
  createSqlEngineDefinition,
} from '../../src/wasm-service/sql-profile-factory.js';

/**
 * Creates a mock SQL query engine that returns rows for
 * the given set of known function IDs.
 * @param {Set<string>} knownIds - Set of function IDs.
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
 * Builds a SQL engine definition with optional overrides.
 * @param {Object} [overrides] - Fields to override.
 * @return {Object} ServiceDefinition for SQL engine.
 */
function buildSqlDefinition(overrides = {}) {
  return createSqlEngineDefinition({
    serviceId: 'sql-svc-1',
    serviceName: 'sql-engine-1',
    ...overrides,
  });
}

describe('ServiceDefinitionValidator - SQL profile', () => {
  describe('handler function skipping', () => {
    it('should accept SQL_ENGINE profile without handler ' +
      'function', async () => {
      const engine = createMockSqlEngine(new Set());
      const validator = new ServiceDefinitionValidator({
        sqlQueryEngine: engine,
      });
      const def = buildSqlDefinition();
      assert.equal(def.handlerFunctionId, null);
      assert.equal(
        def.serviceProfile,
        SERVICE_PROFILE.SQL_ENGINE,
      );
      const result = await validator.validate(def);
      assert.equal(result.valid, true);
      assert.equal(result.errors.length, 0);
    });

    it('should not query code table for SQL_ENGINE profile',
      async () => {
        let queryCalled = false;
        const engine = {
          async executeQuery() {
            queryCalled = true;
            return {rows: []};
          },
        };
        const validator = new ServiceDefinitionValidator({
          sqlQueryEngine: engine,
        });
        const def = buildSqlDefinition();
        await validator.validate(def);
        assert.equal(queryCalled, false);
      });

    it('should still validate handler for DEFAULT profile',
      async () => {
        const engine = createMockSqlEngine(new Set());
        const validator = new ServiceDefinitionValidator({
          sqlQueryEngine: engine,
        });
        const def = {
          serviceId: 'svc-1',
          serviceName: 'test-service',
          serviceProfile: SERVICE_PROFILE.DEFAULT,
          handlerFunctionId: 'nonexistent',
          readConsistency: READ_CONSISTENCY_MODE.STRONG,
          writeConsistency: WRITE_CONSISTENCY_MODE.STRONG,
          replicaCount: 3,
          resourceBudget: null,
        };
        const result = await validator.validate(def);
        assert.equal(result.valid, false);
        assert.ok(result.errors.includes(
          WASM_SERVICE_ERROR_MSG.HANDLER_FUNCTION_NOT_FOUND,
        ));
      });

    it('should still validate handler when profile is ' +
      'undefined', async () => {
      const engine = createMockSqlEngine(new Set());
      const validator = new ServiceDefinitionValidator({
        sqlQueryEngine: engine,
      });
      const def = {
        serviceId: 'svc-1',
        serviceName: 'test-service',
        handlerFunctionId: 'nonexistent',
        readConsistency: READ_CONSISTENCY_MODE.STRONG,
        writeConsistency: WRITE_CONSISTENCY_MODE.STRONG,
        replicaCount: 3,
        resourceBudget: null,
      };
      const result = await validator.validate(def);
      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(
        WASM_SERVICE_ERROR_MSG.HANDLER_FUNCTION_NOT_FOUND,
      ));
    });
  });

  describe('other validations still apply', () => {
    it('should reject SQL_ENGINE with even replica count',
      async () => {
        const engine = createMockSqlEngine(new Set());
        const validator = new ServiceDefinitionValidator({
          sqlQueryEngine: engine,
        });
        const def = buildSqlDefinition({replicaCount: 4});
        const result = await validator.validate(def);
        assert.equal(result.valid, false);
        assert.ok(result.errors.includes(
          WASM_SERVICE_ERROR_MSG.ODD_REPLICA_COUNT_REQUIRED,
        ));
      });

    it('should reject SQL_ENGINE with invalid read ' +
      'consistency', async () => {
      const engine = createMockSqlEngine(new Set());
      const validator = new ServiceDefinitionValidator({
        sqlQueryEngine: engine,
      });
      const def = buildSqlDefinition({
        readConsistency: 'invalid',
      });
      const result = await validator.validate(def);
      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(
        WASM_SERVICE_ERROR_MSG.INVALID_CONSISTENCY_MODE,
      ));
    });

    it('should reject SQL_ENGINE with invalid write ' +
      'consistency', async () => {
      const engine = createMockSqlEngine(new Set());
      const validator = new ServiceDefinitionValidator({
        sqlQueryEngine: engine,
      });
      const def = buildSqlDefinition({
        writeConsistency: 'invalid',
      });
      const result = await validator.validate(def);
      assert.equal(result.valid, false);
      assert.ok(result.errors.includes(
        WASM_SERVICE_ERROR_MSG.INVALID_CONSISTENCY_MODE,
      ));
    });

    it('should reject SQL_ENGINE with negative budget ' +
      'values', async () => {
      const engine = createMockSqlEngine(new Set());
      const validator = new ServiceDefinitionValidator({
        sqlQueryEngine: engine,
      });
      const def = buildSqlDefinition({
        resourceBudget: {cpuTimeLimitMs: -1},
      });
      const result = await validator.validate(def);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some(
        (e) => e.includes('cpuTimeLimitMs'),
      ));
    });

    it('should accept SQL_ENGINE with all valid fields',
      async () => {
        const engine = createMockSqlEngine(new Set());
        const validator = new ServiceDefinitionValidator({
          sqlQueryEngine: engine,
        });
        const def = buildSqlDefinition({replicaCount: 5});
        const result = await validator.validate(def);
        assert.equal(result.valid, true);
        assert.equal(result.errors.length, 0);
      });
  });

  describe('consistency mode defaults', () => {
    it('should use leader_only as default read consistency',
      () => {
        const def = buildSqlDefinition();
        assert.equal(
          def.readConsistency,
          SQL_ENGINE_PROFILE.DEFAULT_READ_CONSISTENCY,
        );
      });

    it('should use strong as default write consistency',
      () => {
        const def = buildSqlDefinition();
        assert.equal(
          def.writeConsistency,
          SQL_ENGINE_PROFILE.DEFAULT_WRITE_CONSISTENCY,
        );
      });
  });
});
