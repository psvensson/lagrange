import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  createSqlEngineDefinition,
  isSqlEngineProfile,
} from '../../src/wasm-service/sql-profile-factory.js';
import {SERVICE_PROFILE} from '../../src/constants/index.js';
import {
  SQL_ENGINE_PROFILE,
  WASM_SERVICE_DEFAULT,
} from '../../src/wasm-service/wasm-service-constants.js';
import {SQL_ENGINE_RUNTIME_KIND} from '../../src/constants/runtime.js';
import {
  SQL_PROFILE_DEFAULT,
  SQL_PROFILE_ERROR_MSG,
} from '../../src/wasm-service/sql-profile-constants.js';
import {
  serializeServiceDefinition,
} from '../../src/wasm-service/wasm-service-models.js';
import {SERVICE_TYPE} from '../../src/constants/service.js';

describe('sql-profile-factory', () => {
  describe('createSqlEngineDefinition', () => {
    it('should create a definition with SQL_ENGINE profile',
      () => {
        const def = createSqlEngineDefinition({
          serviceId: 'sql-svc-1',
          serviceName: 'sql-engine-1',
        });
        assert.equal(
          def.serviceProfile,
          SERVICE_PROFILE.SQL_ENGINE,
        );
      });

    it('should set handlerFunctionId to null', () => {
      const def = createSqlEngineDefinition({
        serviceId: 'sql-svc-1',
        serviceName: 'sql-engine-1',
      });
      assert.equal(
        def.handlerFunctionId,
        SQL_PROFILE_DEFAULT.HANDLER_FUNCTION_ID,
      );
    });

    it('should set runtimeKind to SQL_ENGINE_RUNTIME_KIND', () => {
      const def = createSqlEngineDefinition({
        serviceId: 'sql-svc-1',
        serviceName: 'sql-engine-1',
      });
      assert.equal(def.runtimeKind, SQL_ENGINE_RUNTIME_KIND);
      assert.equal(def.runtimeRef, null);
      assert.equal(def.runtimeConfig, null);
    });

    it('should default readConsistency to leader_only', () => {
      const def = createSqlEngineDefinition({
        serviceId: 'sql-svc-1',
        serviceName: 'sql-engine-1',
      });
      assert.equal(
        def.readConsistency,
        SQL_ENGINE_PROFILE.DEFAULT_READ_CONSISTENCY,
      );
    });

    it('should default writeConsistency to strong', () => {
      const def = createSqlEngineDefinition({
        serviceId: 'sql-svc-1',
        serviceName: 'sql-engine-1',
      });
      assert.equal(
        def.writeConsistency,
        SQL_ENGINE_PROFILE.DEFAULT_WRITE_CONSISTENCY,
      );
    });

    it('should default replicaCount to 3', () => {
      const def = createSqlEngineDefinition({
        serviceId: 'sql-svc-1',
        serviceName: 'sql-engine-1',
      });
      assert.equal(
        def.replicaCount,
        WASM_SERVICE_DEFAULT.REPLICA_COUNT,
      );
    });

    it('should allow overriding readConsistency', () => {
      const def = createSqlEngineDefinition({
        serviceId: 'sql-svc-1',
        serviceName: 'sql-engine-1',
        readConsistency: 'strong',
      });
      assert.equal(def.readConsistency, 'strong');
    });

    it('should allow overriding writeConsistency', () => {
      const def = createSqlEngineDefinition({
        serviceId: 'sql-svc-1',
        serviceName: 'sql-engine-1',
        writeConsistency: 'async',
      });
      assert.equal(def.writeConsistency, 'async');
    });

    it('should allow overriding replicaCount', () => {
      const def = createSqlEngineDefinition({
        serviceId: 'sql-svc-1',
        serviceName: 'sql-engine-1',
        replicaCount: 5,
      });
      assert.equal(def.replicaCount, 5);
    });

    it('should allow overriding resourceBudget', () => {
      const budget = {cpuTimeLimitMs: 10000};
      const def = createSqlEngineDefinition({
        serviceId: 'sql-svc-1',
        serviceName: 'sql-engine-1',
        resourceBudget: budget,
      });
      assert.deepEqual(def.resourceBudget, budget);
    });

    it('should allow overriding safetyIntervalMs', () => {
      const def = createSqlEngineDefinition({
        serviceId: 'sql-svc-1',
        serviceName: 'sql-engine-1',
        safetyIntervalMs: 1000,
      });
      assert.equal(def.safetyIntervalMs, 1000);
    });

    it('should throw when serviceId is missing', () => {
      assert.throws(
        () => createSqlEngineDefinition({
          serviceName: 'sql-engine-1',
        }),
        {message: SQL_PROFILE_ERROR_MSG.MISSING_SERVICE_ID},
      );
    });

    it('should throw when serviceName is missing', () => {
      assert.throws(
        () => createSqlEngineDefinition({
          serviceId: 'sql-svc-1',
        }),
        {message: SQL_PROFILE_ERROR_MSG.MISSING_SERVICE_NAME},
      );
    });

    it('should throw when serviceId is empty string', () => {
      assert.throws(
        () => createSqlEngineDefinition({
          serviceId: '',
          serviceName: 'sql-engine-1',
        }),
        {message: SQL_PROFILE_ERROR_MSG.MISSING_SERVICE_ID},
      );
    });

    it('should throw when serviceName is empty string', () => {
      assert.throws(
        () => createSqlEngineDefinition({
          serviceId: 'sql-svc-1',
          serviceName: '',
        }),
        {message: SQL_PROFILE_ERROR_MSG.MISSING_SERVICE_NAME},
      );
    });

    it('should preserve serviceId and serviceName', () => {
      const def = createSqlEngineDefinition({
        serviceId: 'my-sql-svc',
        serviceName: 'My SQL Engine',
      });
      assert.equal(def.serviceId, 'my-sql-svc');
      assert.equal(def.serviceName, 'My SQL Engine');
    });
  });

  describe('isSqlEngineProfile', () => {
    it('should return true for SQL_ENGINE profile', () => {
      const def = {
        serviceProfile: SERVICE_PROFILE.SQL_ENGINE,
      };
      assert.equal(isSqlEngineProfile(def), true);
    });

    it('should return false for DEFAULT profile', () => {
      const def = {
        serviceProfile: SERVICE_PROFILE.DEFAULT,
      };
      assert.equal(isSqlEngineProfile(def), false);
    });

    it('should return false for undefined profile', () => {
      const def = {};
      assert.equal(isSqlEngineProfile(def), false);
    });

    it('should return false for null profile', () => {
      const def = {serviceProfile: null};
      assert.equal(isSqlEngineProfile(def), false);
    });
  });

  describe('serialization round-trip', () => {
    it('should serialize with correct service_type for ' +
      'rebalancer compatibility', () => {
      const def = createSqlEngineDefinition({
        serviceId: 'sql-svc-1',
        serviceName: 'sql-engine-1',
      });
      const row = serializeServiceDefinition(def);
      assert.equal(
        row.service_profile,
        SERVICE_PROFILE.SQL_ENGINE,
      );
    });

    it('should serialize with null handler_function_id', () => {
      const def = createSqlEngineDefinition({
        serviceId: 'sql-svc-1',
        serviceName: 'sql-engine-1',
      });
      const row = serializeServiceDefinition(def);
      assert.equal(row.handler_function_id, null);
    });

    it('should use wasm_service as the entity type for ' +
      'placement', () => {
      assert.equal(
        SERVICE_TYPE.WASM_SERVICE,
        'wasm_service',
      );
    });
  });
});
