/**
 * Tests for CDCIntegrationSetup shared component.
 *
 * @module test/bootstrap/shared/cdc-integration-setup
 */
// @ts-nocheck


import {describe, it, beforeEach} from 'node:test';
import assert from 'node:assert';
import {CDCIntegrationSetup} from '../../../src/bootstrap/shared/cdc-integration-setup.js';
import {DependencyError} from '../../../src/bootstrap/bootstrap-errors.js';

describe('CDCIntegrationSetup', () => {
  let mockMessageRouter;
  let mockSqlQueryEngine;
  let mockSystemTableCache;

  beforeEach(() => {
    // Create mock message router
    mockMessageRouter = {
      register: () => {},
      send: async () => {},
    };

    // Create mock SQL query engine
    mockSqlQueryEngine = {
      executeQuery: async () => ({success: true, rows: []}),
    };

    // Create mock system table cache
    mockSystemTableCache = {
      get: () => null,
      has: () => false,
      filter: () => [],
      onCacheChange: () => {},
      offCacheChange: () => {},
    };
  });

  describe('createForBootstrap()', () => {
    it('should throw DependencyError when nodeId is missing', () => {
      assert.throws(
        () => CDCIntegrationSetup.createForBootstrap({}),
        (error) => {
          assert.strictEqual(error instanceof DependencyError, true);
          assert.strictEqual(error.serviceName, 'CDCIntegrationSetup');
          assert.strictEqual(error.dependencyName, 'nodeId');
          return true;
        },
      );
    });

    it('should create CDCIntegrationService with only nodeId', () => {
      const service = CDCIntegrationSetup.createForBootstrap({
        nodeId: 'test-node',
      });

      assert.ok(service, 'should return CDCIntegrationService');
      assert.strictEqual(service.nodeId, 'test-node');
      assert.strictEqual(service.initialized, true);
    });

    it('should create CDCIntegrationService without sqlQueryEngine', () => {
      const service = CDCIntegrationSetup.createForBootstrap({
        nodeId: 'test-node',
      });

      // In bootstrap mode, sqlQueryEngine should not be set
      assert.strictEqual(service.sqlQueryEngine, null);
    });

    it('should set messageRouter when provided', () => {
      const service = CDCIntegrationSetup.createForBootstrap({
        nodeId: 'test-node',
        messageRouter: mockMessageRouter,
      });

      assert.strictEqual(service.messageRouter, mockMessageRouter);
    });

    it('should work without messageRouter', () => {
      const service = CDCIntegrationSetup.createForBootstrap({
        nodeId: 'test-node',
      });

      assert.ok(service);
      assert.strictEqual(service.messageRouter, null);
    });
  });

  describe('createForNormal()', () => {
    it('should throw DependencyError when nodeId is missing', () => {
      assert.throws(
        () => CDCIntegrationSetup.createForNormal({
          sqlQueryEngine: mockSqlQueryEngine,
          systemTableCache: mockSystemTableCache,
          messageRouter: mockMessageRouter,
        }),
        (error) => {
          assert.strictEqual(error instanceof DependencyError, true);
          assert.strictEqual(error.serviceName, 'CDCIntegrationSetup');
          assert.strictEqual(error.dependencyName, 'nodeId');
          return true;
        },
      );
    });

    it('should throw DependencyError when sqlQueryEngine is missing', () => {
      assert.throws(
        () => CDCIntegrationSetup.createForNormal({
          nodeId: 'test-node',
          systemTableCache: mockSystemTableCache,
          messageRouter: mockMessageRouter,
        }),
        (error) => {
          assert.strictEqual(error instanceof DependencyError, true);
          assert.strictEqual(error.serviceName, 'CDCIntegrationSetup');
          assert.strictEqual(error.dependencyName, 'sqlQueryEngine');
          return true;
        },
      );
    });

    it('should throw DependencyError when systemTableCache is missing', () => {
      assert.throws(
        () => CDCIntegrationSetup.createForNormal({
          nodeId: 'test-node',
          sqlQueryEngine: mockSqlQueryEngine,
          messageRouter: mockMessageRouter,
        }),
        (error) => {
          assert.strictEqual(error instanceof DependencyError, true);
          assert.strictEqual(error.serviceName, 'CDCIntegrationSetup');
          assert.strictEqual(error.dependencyName, 'systemTableCache');
          return true;
        },
      );
    });

    it('should throw DependencyError when messageRouter is missing', () => {
      assert.throws(
        () => CDCIntegrationSetup.createForNormal({
          nodeId: 'test-node',
          sqlQueryEngine: mockSqlQueryEngine,
          systemTableCache: mockSystemTableCache,
        }),
        (error) => {
          assert.strictEqual(error instanceof DependencyError, true);
          assert.strictEqual(error.serviceName, 'CDCIntegrationSetup');
          assert.strictEqual(error.dependencyName, 'messageRouter');
          return true;
        },
      );
    });

    it('should create CDCIntegrationService with all dependencies', () => {
      const service = CDCIntegrationSetup.createForNormal({
        nodeId: 'test-node',
        sqlQueryEngine: mockSqlQueryEngine,
        systemTableCache: mockSystemTableCache,
        messageRouter: mockMessageRouter,
      });

      assert.ok(service, 'should return CDCIntegrationService');
      assert.strictEqual(service.nodeId, 'test-node');
      assert.strictEqual(service.initialized, true);
    });

    it('should set sqlQueryEngine in normal mode', () => {
      const service = CDCIntegrationSetup.createForNormal({
        nodeId: 'test-node',
        sqlQueryEngine: mockSqlQueryEngine,
        systemTableCache: mockSystemTableCache,
        messageRouter: mockMessageRouter,
      });

      assert.strictEqual(service.sqlQueryEngine, mockSqlQueryEngine);
    });

    it('should set systemTableCache in normal mode', () => {
      const service = CDCIntegrationSetup.createForNormal({
        nodeId: 'test-node',
        sqlQueryEngine: mockSqlQueryEngine,
        systemTableCache: mockSystemTableCache,
        messageRouter: mockMessageRouter,
      });

      assert.strictEqual(service.systemTableCache, mockSystemTableCache);
    });

    it('should set messageRouter in normal mode', () => {
      const service = CDCIntegrationSetup.createForNormal({
        nodeId: 'test-node',
        sqlQueryEngine: mockSqlQueryEngine,
        systemTableCache: mockSystemTableCache,
        messageRouter: mockMessageRouter,
      });

      assert.strictEqual(service.messageRouter, mockMessageRouter);
    });
  });

  describe('upgrade()', () => {
    it('should throw DependencyError when cdcIntegrationService is missing', () => {
      assert.throws(
        () => CDCIntegrationSetup.upgrade({
          sqlQueryEngine: mockSqlQueryEngine,
          systemTableCache: mockSystemTableCache,
        }),
        (error) => {
          assert.strictEqual(error instanceof DependencyError, true);
          assert.strictEqual(error.serviceName, 'CDCIntegrationSetup');
          assert.strictEqual(error.dependencyName, 'cdcIntegrationService');
          return true;
        },
      );
    });

    it('should throw DependencyError when sqlQueryEngine is missing', () => {
      const bootstrapService = CDCIntegrationSetup.createForBootstrap({
        nodeId: 'test-node',
      });

      assert.throws(
        () => CDCIntegrationSetup.upgrade({
          cdcIntegrationService: bootstrapService,
          systemTableCache: mockSystemTableCache,
        }),
        (error) => {
          assert.strictEqual(error instanceof DependencyError, true);
          assert.strictEqual(error.serviceName, 'CDCIntegrationSetup');
          assert.strictEqual(error.dependencyName, 'sqlQueryEngine');
          return true;
        },
      );
    });

    it('should throw DependencyError when systemTableCache is missing', () => {
      const bootstrapService = CDCIntegrationSetup.createForBootstrap({
        nodeId: 'test-node',
      });

      assert.throws(
        () => CDCIntegrationSetup.upgrade({
          cdcIntegrationService: bootstrapService,
          sqlQueryEngine: mockSqlQueryEngine,
        }),
        (error) => {
          assert.strictEqual(error instanceof DependencyError, true);
          assert.strictEqual(error.serviceName, 'CDCIntegrationSetup');
          assert.strictEqual(error.dependencyName, 'systemTableCache');
          return true;
        },
      );
    });

    it('should upgrade bootstrap service to normal mode', () => {
      const bootstrapService = CDCIntegrationSetup.createForBootstrap({
        nodeId: 'test-node',
      });

      // Verify bootstrap mode - no sqlQueryEngine
      assert.strictEqual(bootstrapService.sqlQueryEngine, null);

      CDCIntegrationSetup.upgrade({
        cdcIntegrationService: bootstrapService,
        sqlQueryEngine: mockSqlQueryEngine,
        systemTableCache: mockSystemTableCache,
      });

      // Verify upgraded to normal mode
      assert.strictEqual(bootstrapService.sqlQueryEngine, mockSqlQueryEngine);
      assert.strictEqual(bootstrapService.systemTableCache, mockSystemTableCache);
    });

    it('should set messageRouter when provided and not already set', () => {
      const bootstrapService = CDCIntegrationSetup.createForBootstrap({
        nodeId: 'test-node',
      });

      CDCIntegrationSetup.upgrade({
        cdcIntegrationService: bootstrapService,
        sqlQueryEngine: mockSqlQueryEngine,
        systemTableCache: mockSystemTableCache,
        messageRouter: mockMessageRouter,
      });

      assert.strictEqual(bootstrapService.messageRouter, mockMessageRouter);
    });

    it('should not override existing messageRouter', () => {
      const originalRouter = {id: 'original-router'};
      const bootstrapService = CDCIntegrationSetup.createForBootstrap({
        nodeId: 'test-node',
        messageRouter: originalRouter,
      });

      const newRouter = {id: 'new-router'};
      CDCIntegrationSetup.upgrade({
        cdcIntegrationService: bootstrapService,
        sqlQueryEngine: mockSqlQueryEngine,
        systemTableCache: mockSystemTableCache,
        messageRouter: newRouter,
      });

      // Should keep original router
      assert.strictEqual(bootstrapService.messageRouter, originalRouter);
    });

    it('should work without messageRouter parameter', () => {
      const bootstrapService = CDCIntegrationSetup.createForBootstrap({
        nodeId: 'test-node',
      });

      // Should not throw
      CDCIntegrationSetup.upgrade({
        cdcIntegrationService: bootstrapService,
        sqlQueryEngine: mockSqlQueryEngine,
        systemTableCache: mockSystemTableCache,
      });

      assert.strictEqual(bootstrapService.sqlQueryEngine, mockSqlQueryEngine);
    });
  });
});
