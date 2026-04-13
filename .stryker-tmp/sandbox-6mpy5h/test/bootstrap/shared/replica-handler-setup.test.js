/**
 * Tests for ReplicaHandlerSetup shared component.
 *
 * @module test/bootstrap/shared/replica-handler-setup
 */
// @ts-nocheck


import {describe, it, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert';
import {ReplicaHandlerSetup} from '../../../src/bootstrap/shared/replica-handler-setup.js';
import {DependencyError} from '../../../src/bootstrap/bootstrap-errors.js';

describe('ReplicaHandlerSetup', () => {
  let mockMessageRouter;
  let mockCdcIntegrationService;
  let mockSystemTableCache;
  let mockCreatePartitionService;
  let createdStateMachines;

  beforeEach(() => {
    createdStateMachines = [];

    // Create mock message router
    mockMessageRouter = {
      register: () => {},
    };

    // Create mock CDC integration service
    mockCdcIntegrationService = {
      updateSystemTableRow: async () => {},
      insertSystemTableRow: async () => {},
    };

    // Create mock system table cache
    mockSystemTableCache = {
      get: () => null,
      filter: () => [],
    };

    // Create mock partition service factory
    mockCreatePartitionService = async () => ({
      initialize: async () => {},
      shutdown: async () => {},
    });
  });

  afterEach(() => {
    // Clean up any created state machines
    for (const sm of createdStateMachines) {
      if (sm && typeof sm.stopTimeoutChecker === 'function') {
        sm.stopTimeoutChecker();
      }
      if (sm && typeof sm.clear === 'function') {
        sm.clear();
      }
    }
    createdStateMachines = [];
  });

  describe('create()', () => {
    it('should throw DependencyError when nodeId is missing', () => {
      assert.throws(
        () => ReplicaHandlerSetup.create({
          messageRouter: mockMessageRouter,
          cdcIntegrationService: mockCdcIntegrationService,
          systemTableCache: mockSystemTableCache,
          createPartitionService: mockCreatePartitionService,
        }),
        (error) => {
          assert.strictEqual(error instanceof DependencyError, true);
          assert.strictEqual(error.serviceName, 'ReplicaHandlerSetup');
          assert.strictEqual(error.dependencyName, 'nodeId');
          return true;
        },
      );
    });

    it('should throw DependencyError when messageRouter is missing', () => {
      assert.throws(
        () => ReplicaHandlerSetup.create({
          nodeId: 'test-node',
          cdcIntegrationService: mockCdcIntegrationService,
          systemTableCache: mockSystemTableCache,
          createPartitionService: mockCreatePartitionService,
        }),
        (error) => {
          assert.strictEqual(error instanceof DependencyError, true);
          assert.strictEqual(error.serviceName, 'ReplicaHandlerSetup');
          assert.strictEqual(error.dependencyName, 'messageRouter');
          return true;
        },
      );
    });

    it('should throw DependencyError when cdcIntegrationService is missing', () => {
      assert.throws(
        () => ReplicaHandlerSetup.create({
          nodeId: 'test-node',
          messageRouter: mockMessageRouter,
          systemTableCache: mockSystemTableCache,
          createPartitionService: mockCreatePartitionService,
        }),
        (error) => {
          assert.strictEqual(error instanceof DependencyError, true);
          assert.strictEqual(error.serviceName, 'ReplicaHandlerSetup');
          assert.strictEqual(error.dependencyName, 'cdcIntegrationService');
          return true;
        },
      );
    });

    it('should throw DependencyError when systemTableCache is missing', () => {
      assert.throws(
        () => ReplicaHandlerSetup.create({
          nodeId: 'test-node',
          messageRouter: mockMessageRouter,
          cdcIntegrationService: mockCdcIntegrationService,
          createPartitionService: mockCreatePartitionService,
        }),
        (error) => {
          assert.strictEqual(error instanceof DependencyError, true);
          assert.strictEqual(error.serviceName, 'ReplicaHandlerSetup');
          assert.strictEqual(error.dependencyName, 'systemTableCache');
          return true;
        },
      );
    });

    it('should throw DependencyError when createPartitionService is missing', () => {
      assert.throws(
        () => ReplicaHandlerSetup.create({
          nodeId: 'test-node',
          messageRouter: mockMessageRouter,
          cdcIntegrationService: mockCdcIntegrationService,
          systemTableCache: mockSystemTableCache,
        }),
        (error) => {
          assert.strictEqual(error instanceof DependencyError, true);
          assert.strictEqual(error.serviceName, 'ReplicaHandlerSetup');
          assert.strictEqual(error.dependencyName, 'createPartitionService');
          return true;
        },
      );
    });

    it('should create replicaHandler and replicaStateMachine with valid options', () => {
      const result = ReplicaHandlerSetup.create({
        nodeId: 'test-node',
        messageRouter: mockMessageRouter,
        cdcIntegrationService: mockCdcIntegrationService,
        systemTableCache: mockSystemTableCache,
        createPartitionService: mockCreatePartitionService,
      });

      // Track for cleanup
      createdStateMachines.push(result.replicaStateMachine);

      assert.ok(result.replicaHandler, 'should return replicaHandler');
      assert.ok(result.replicaStateMachine, 'should return replicaStateMachine');
    });

    it('should return initialized replicaHandler', () => {
      const result = ReplicaHandlerSetup.create({
        nodeId: 'test-node',
        messageRouter: mockMessageRouter,
        cdcIntegrationService: mockCdcIntegrationService,
        systemTableCache: mockSystemTableCache,
        createPartitionService: mockCreatePartitionService,
      });

      // Track for cleanup
      createdStateMachines.push(result.replicaStateMachine);

      // ReplicaHandler should be initialized
      assert.strictEqual(result.replicaHandler.initialized, true);
    });

    it('should accept optional dataDir parameter', () => {
      const result = ReplicaHandlerSetup.create({
        nodeId: 'test-node',
        messageRouter: mockMessageRouter,
        cdcIntegrationService: mockCdcIntegrationService,
        systemTableCache: mockSystemTableCache,
        createPartitionService: mockCreatePartitionService,
        dataDir: '/custom/data/dir',
      });

      // Track for cleanup
      createdStateMachines.push(result.replicaStateMachine);

      assert.ok(result.replicaHandler);
      assert.strictEqual(result.replicaHandler.dataDir, '/custom/data/dir');
    });

    it('should accept optional rpcClient parameter', () => {
      const mockRpcClient = {send: () => {}};

      const result = ReplicaHandlerSetup.create({
        nodeId: 'test-node',
        messageRouter: mockMessageRouter,
        cdcIntegrationService: mockCdcIntegrationService,
        systemTableCache: mockSystemTableCache,
        createPartitionService: mockCreatePartitionService,
        rpcClient: mockRpcClient,
      });

      // Track for cleanup
      createdStateMachines.push(result.replicaStateMachine);

      assert.ok(result.replicaHandler);
    });

    it('should register handler with message router', () => {
      let registerCalled = false;
      const trackingRouter = {
        register: () => {
          registerCalled = true;
        },
      };

      const result = ReplicaHandlerSetup.create({
        nodeId: 'test-node',
        messageRouter: trackingRouter,
        cdcIntegrationService: mockCdcIntegrationService,
        systemTableCache: mockSystemTableCache,
        createPartitionService: mockCreatePartitionService,
      });

      // Track for cleanup
      createdStateMachines.push(result.replicaStateMachine);

      assert.strictEqual(registerCalled, true, 'should register with message router');
    });
  });
});
