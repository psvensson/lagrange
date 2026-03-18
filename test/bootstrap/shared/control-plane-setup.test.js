/**
 * Tests for ControlPlaneSetup shared component.
 *
 * @module test/bootstrap/shared/control-plane-setup
 */

import {describe, it, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert';
import {ControlPlaneSetup} from
  '../../../src/bootstrap/shared/control-plane-setup.js';
import {DependencyError} from
  '../../../src/bootstrap/bootstrap-errors.js';
import {DistributedTransactionCoordinator} from
  '../../../src/query/distributed/distributed-transaction-coordinator.js';
import {LEASE_STATE} from
  '../../../src/control-plane/lease-service-constants.js';

describe('ControlPlaneSetup', () => {
  let mockMessageRouter;
  let mockCdcIntegrationService;
  let mockSystemTableCache;
  let mockTablePolicyService;
  let mockMessageGroupServices;
  let createdServices;

  beforeEach(() => {
    createdServices = [];
    const transactionCoordinator = new DistributedTransactionCoordinator({
      beginParticipant: async () => {},
      prepareParticipant: async () => {},
      commitParticipant: async () => {},
      rollbackParticipant: async () => {},
      persistTransaction: async () => {},
      persistParticipant: async () => {},
      persistWriteOperation: async () => {},
    });

    mockMessageRouter = {
      register: () => {},
      send: async () => {},
    };

    mockCdcIntegrationService = {
      updateSystemTableRow: async () => {},
      insertSystemTableRow: async () => {},
      sqlQueryEngine: {
        execute: async () => ({rows: []}),
        transactionCoordinator,
      },
    };

    mockSystemTableCache = {
      get: () => null,
      getAll: () => [],
      filter: () => [],
    };

    mockTablePolicyService = {
      getPolicy: () => null,
      initialize: () => {},
    };

    mockMessageGroupServices = new Map();
  });

  afterEach(() => {
    for (const result of createdServices) {
      if (result?.leaseService) {
        result.leaseService.stop();
      }
      if (result?.heartbeatService) {
        result.heartbeatService.stop();
      }
      if (result?.endpointService) {
        result.endpointService.stop();
      }
      if (result?.dispatchService) {
        result.dispatchService.stop();
      }
    }
    createdServices = [];
  });

  describe('create()', () => {
    it('should throw DependencyError when nodeId is missing',
      async () => {
        await assert.rejects(
          async () => ControlPlaneSetup.create({
            nodeAddress: 'localhost:8080',
            messageRouter: mockMessageRouter,
            cdcIntegrationService: mockCdcIntegrationService,
            systemTableCache: mockSystemTableCache,
            tablePolicyService: mockTablePolicyService,
          }),
          (error) => {
            assert.strictEqual(
              error instanceof DependencyError, true,
            );
            assert.strictEqual(
              error.serviceName, 'ControlPlaneSetup',
            );
            assert.strictEqual(error.dependencyName, 'nodeId');
            return true;
          },
        );
      });

    it('should throw DependencyError when nodeAddress is missing',
      async () => {
        await assert.rejects(
          async () => ControlPlaneSetup.create({
            nodeId: 'test-node',
            messageRouter: mockMessageRouter,
            cdcIntegrationService: mockCdcIntegrationService,
            systemTableCache: mockSystemTableCache,
            tablePolicyService: mockTablePolicyService,
          }),
          (error) => {
            assert.strictEqual(
              error instanceof DependencyError, true,
            );
            assert.strictEqual(
              error.serviceName, 'ControlPlaneSetup',
            );
            assert.strictEqual(
              error.dependencyName, 'nodeAddress',
            );
            return true;
          },
        );
      });

    it('should throw DependencyError when messageRouter is missing',
      async () => {
        await assert.rejects(
          async () => ControlPlaneSetup.create({
            nodeId: 'test-node',
            nodeAddress: 'localhost:8080',
            cdcIntegrationService: mockCdcIntegrationService,
            systemTableCache: mockSystemTableCache,
            tablePolicyService: mockTablePolicyService,
          }),
          (error) => {
            assert.strictEqual(
              error instanceof DependencyError, true,
            );
            assert.strictEqual(
              error.serviceName, 'ControlPlaneSetup',
            );
            assert.strictEqual(
              error.dependencyName, 'messageRouter',
            );
            return true;
          },
        );
      });

    it('should throw DependencyError when cdc is missing',
      async () => {
        await assert.rejects(
          async () => ControlPlaneSetup.create({
            nodeId: 'test-node',
            nodeAddress: 'localhost:8080',
            messageRouter: mockMessageRouter,
            systemTableCache: mockSystemTableCache,
            tablePolicyService: mockTablePolicyService,
          }),
          (error) => {
            assert.strictEqual(
              error instanceof DependencyError, true,
            );
            assert.strictEqual(
              error.serviceName, 'ControlPlaneSetup',
            );
            assert.strictEqual(
              error.dependencyName, 'cdcIntegrationService',
            );
            return true;
          },
        );
      });

    it('should throw DependencyError when cache is missing',
      async () => {
        await assert.rejects(
          async () => ControlPlaneSetup.create({
            nodeId: 'test-node',
            nodeAddress: 'localhost:8080',
            messageRouter: mockMessageRouter,
            cdcIntegrationService: mockCdcIntegrationService,
            tablePolicyService: mockTablePolicyService,
          }),
          (error) => {
            assert.strictEqual(
              error instanceof DependencyError, true,
            );
            assert.strictEqual(
              error.serviceName, 'ControlPlaneSetup',
            );
            assert.strictEqual(
              error.dependencyName, 'systemTableCache',
            );
            return true;
          },
        );
      });

    it('should throw DependencyError when policy is missing',
      async () => {
        await assert.rejects(
          async () => ControlPlaneSetup.create({
            nodeId: 'test-node',
            nodeAddress: 'localhost:8080',
            messageRouter: mockMessageRouter,
            cdcIntegrationService: mockCdcIntegrationService,
            systemTableCache: mockSystemTableCache,
          }),
          (error) => {
            assert.strictEqual(
              error instanceof DependencyError, true,
            );
            assert.strictEqual(
              error.serviceName, 'ControlPlaneSetup',
            );
            assert.strictEqual(
              error.dependencyName, 'tablePolicyService',
            );
            return true;
          },
        );
      });

    it('should throw DependencyError when transactionCoordinator is missing',
      async () => {
        await assert.rejects(
          async () => ControlPlaneSetup.create({
            nodeId: 'test-node',
            nodeAddress: 'localhost:8080',
            messageRouter: mockMessageRouter,
            cdcIntegrationService: {
              ...mockCdcIntegrationService,
              sqlQueryEngine: {
                execute: async () => ({rows: []}),
              },
            },
            systemTableCache: mockSystemTableCache,
            tablePolicyService: mockTablePolicyService,
          }),
          (error) => {
            assert.strictEqual(
              error instanceof DependencyError, true,
            );
            assert.strictEqual(
              error.serviceName, 'ControlPlaneSetup',
            );
            assert.strictEqual(
              error.dependencyName, 'transactionCoordinator',
            );
            return true;
          },
        );
      });

    it('should return decomposed services and coordinator',
      async () => {
        const result = await ControlPlaneSetup.create({
          nodeId: 'test-node',
          nodeAddress: 'localhost:8080',
          messageRouter: mockMessageRouter,
          cdcIntegrationService: mockCdcIntegrationService,
          systemTableCache: mockSystemTableCache,
          tablePolicyService: mockTablePolicyService,
        });

        createdServices.push(result);

        assert.ok(result.heartbeatService);
        assert.ok(result.leaseService);
        assert.ok(result.endpointService);
        assert.ok(result.dispatchService);
        assert.ok(result.rebalanceCoordinator);
        assert.ok(result.systemMetadataOwners);
        assert.strictEqual(
          result.endpointService.serviceEndpointsOwner,
          result.systemMetadataOwners.serviceEndpointsOwner,
        );
      });

    it('should keep lease sweep frozen until activation barrier',
      async () => {
        const result = await ControlPlaneSetup.create({
          nodeId: 'test-node',
          nodeAddress: 'localhost:8080',
          messageRouter: mockMessageRouter,
          cdcIntegrationService: mockCdcIntegrationService,
          systemTableCache: mockSystemTableCache,
          tablePolicyService: mockTablePolicyService,
        });

        createdServices.push(result);

        assert.strictEqual(
          result.leaseService.getState(),
          LEASE_STATE.INITIALIZED,
        );
        assert.strictEqual(result.leaseService.sweepTimer, null);
      });

    it('should use existing rebalanceCoordinator if provided',
      async () => {
        const existingCoordinator = {
          nodeId: 'test-node',
          initialize: () => {},
        };

        const result = await ControlPlaneSetup.create({
          nodeId: 'test-node',
          nodeAddress: 'localhost:8080',
          messageRouter: mockMessageRouter,
          cdcIntegrationService: mockCdcIntegrationService,
          systemTableCache: mockSystemTableCache,
          tablePolicyService: mockTablePolicyService,
          rebalanceCoordinator: existingCoordinator,
        });

        createdServices.push(result);

        assert.strictEqual(
          result.rebalanceCoordinator, existingCoordinator,
        );
        assert.ok(
          existingCoordinator.storageAccountingService,
        );
        assert.ok(
          existingCoordinator.storageAdmissionService,
        );
        assert.ok(
          existingCoordinator.controlPlaneReadinessService,
        );
      });

    it('should wire canonical readiness owners through coordinator and dispatch',
      async () => {
        const cdcGroupPropagationService = {
          getPublicationModeDiagnostics: () => ({
            currentMode: 'grouped',
            reasonCode: null,
            enteredAt: '2026-03-06T00:00:00.000Z',
            recentTransitions: [],
          }),
        };

        const result = await ControlPlaneSetup.create({
          nodeId: 'test-node',
          nodeAddress: 'localhost:8080',
          messageRouter: mockMessageRouter,
          cdcIntegrationService: mockCdcIntegrationService,
          cdcGroupPropagationService,
          systemTableCache: mockSystemTableCache,
          tablePolicyService: mockTablePolicyService,
        });

        createdServices.push(result);

        assert.ok(
          result.rebalanceCoordinator.storageAccountingService,
        );
        assert.strictEqual(
          result.rebalanceCoordinator.cdcGroupPropagationService,
          cdcGroupPropagationService,
        );
        assert.strictEqual(
          result.dispatchService.controlPlaneReadinessService,
          result.rebalanceCoordinator.controlPlaneReadinessService,
        );
        assert.strictEqual(
          result.rebalanceCoordinator.storageAdmissionService
            .controlPlaneReadinessService,
          result.rebalanceCoordinator.controlPlaneReadinessService,
        );
        assert.strictEqual(
          result.rebalanceCoordinator.controlPlaneReadinessService
            .cdcGroupPropagationService,
          cdcGroupPropagationService,
        );
        assert.strictEqual(
          result.rebalanceCoordinator.transactionCoordinator,
          mockCdcIntegrationService.sqlQueryEngine.transactionCoordinator,
        );
      });

    it('should enable canonical heartbeat visibility verification when ' +
      'using the control-plane reporter path',
    async () => {
      const result = await ControlPlaneSetup.create({
        nodeId: 'test-node',
        nodeAddress: 'localhost:8080',
        messageRouter: mockMessageRouter,
        cdcIntegrationService: mockCdcIntegrationService,
        systemTableCache: mockSystemTableCache,
        tablePolicyService: mockTablePolicyService,
      });

      createdServices.push(result);

      assert.strictEqual(
        result.heartbeatService.verifyReporterVisibilityOnSuccess,
        true,
      );
    });

    it('should attach message group services when provided',
      async () => {
        const createMockMgService = (serviceId) => ({
          id: serviceId,
          on: () => {},
          off: () => {},
        });

        const mockMg1 = createMockMgService('mg-1');
        const mockMg2 = createMockMgService('mg-2');
        mockMessageGroupServices.set('mg-1', mockMg1);
        mockMessageGroupServices.set('mg-2', mockMg2);

        const result = await ControlPlaneSetup.create({
          nodeId: 'test-node',
          nodeAddress: 'localhost:8080',
          messageRouter: mockMessageRouter,
          cdcIntegrationService: mockCdcIntegrationService,
          systemTableCache: mockSystemTableCache,
          tablePolicyService: mockTablePolicyService,
          messageGroupServices: mockMessageGroupServices,
        });

        createdServices.push(result);

        assert.strictEqual(
          result.dispatchService.messageGroupServices.size, 2,
        );
      });

    it('should work with empty message group services map',
      async () => {
        const result = await ControlPlaneSetup.create({
          nodeId: 'test-node',
          nodeAddress: 'localhost:8080',
          messageRouter: mockMessageRouter,
          cdcIntegrationService: mockCdcIntegrationService,
          systemTableCache: mockSystemTableCache,
          tablePolicyService: mockTablePolicyService,
          messageGroupServices: new Map(),
        });

        createdServices.push(result);

        assert.ok(result.heartbeatService);
        assert.ok(result.rebalanceCoordinator);
      });

    it('should work without message group services parameter',
      async () => {
        const result = await ControlPlaneSetup.create({
          nodeId: 'test-node',
          nodeAddress: 'localhost:8080',
          messageRouter: mockMessageRouter,
          cdcIntegrationService: mockCdcIntegrationService,
          systemTableCache: mockSystemTableCache,
          tablePolicyService: mockTablePolicyService,
        });

        createdServices.push(result);

        assert.ok(result.heartbeatService);
        assert.ok(result.rebalanceCoordinator);
      });
  });

  describe('registerNode()', () => {
    it('should do nothing when heartbeatService is not provided',
      async () => {
        await ControlPlaneSetup.registerNode({
          nodeAddress: 'localhost:8080',
        });
      });

    it('should do nothing when heartbeatService is null',
      async () => {
        await ControlPlaneSetup.registerNode({
          heartbeatService: null,
          nodeAddress: 'localhost:8080',
        });
      });
  });
});
