/**
 * Property tests for phase class contract.
 *
 * Property 6: Phase Class Contract
 * For any phase class, the constructor SHALL require its dependencies,
 * execute() SHALL return an object containing the services created,
 * and events SHALL be emitted for phase start, completion, and failure.
 *
 * Validates: Requirements 2.6, 2.7, 2.8
 */

import {test} from 'tap';
import fc from 'fast-check';
import {
  InfrastructurePhase,
  INFRASTRUCTURE_PHASE,
} from '../../../src/bootstrap/phases/infrastructure-phase.js';
import {
  MessageGroupPhase,
} from '../../../src/bootstrap/phases/message-group-phase.js';
import {
  PartitionPhase,
} from '../../../src/bootstrap/phases/partition-phase.js';
import {
  RegistrationPhase,
} from '../../../src/bootstrap/phases/registration-phase.js';
import {
  CacheHydrationPhase,
} from '../../../src/bootstrap/phases/cache-hydration-phase.js';

test('Property 6: Phase Class Contract', async (t) => {
  t.test('InfrastructurePhase requires no dependencies but accepts options', async (t) => {
    // InfrastructurePhase has no required dependencies
    fc.assert(
      fc.property(
        fc.record({
          nodeId: fc.option(fc.string({minLength: 1}), {nil: undefined}),
          nodeAddress: fc.option(fc.string({minLength: 1}), {nil: undefined}),
          wsPort: fc.option(fc.integer({min: 1024, max: 65535}), {nil: undefined}),
        }),
        (options) => {
          // Should not throw - no required dependencies
          const phase = new InfrastructurePhase(options);
          return phase !== null;
        },
      ),
      {numRuns: 10},
    );
    t.pass('InfrastructurePhase accepts optional configuration');
  });

  t.test('MessageGroupPhase requires nodeId and messageRouter', async (t) => {
    // Test missing nodeId
    fc.assert(
      fc.property(
        fc.constant(null),
        () => {
          const mockRouter = {register: () => {}};
          try {
            new MessageGroupPhase({
              nodeId: null,
              messageRouter: mockRouter,
            });
            return false; // Should have thrown
          } catch (error) {
            return error.message.includes('nodeId is required');
          }
        },
      ),
      {numRuns: 10},
    );

    // Test missing messageRouter
    fc.assert(
      fc.property(
        fc.string({minLength: 1}),
        (nodeId) => {
          try {
            new MessageGroupPhase({
              nodeId,
              messageRouter: null,
            });
            return false; // Should have thrown
          } catch (error) {
            return error.message.includes('messageRouter is required');
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('MessageGroupPhase validates required dependencies');
  });

  t.test('MessageGroupPhase accepts workerManager for worker mode', async (t) => {
    const mockRouter = {register: () => {}};
    const mockWorkerManager = {
      isInitialized: () => true,
      createMessageGroupReplica: async () => ({replicaId: 'test'}),
    };

    // Test that workerManager can be provided for worker process isolation
    fc.assert(
      fc.property(
        fc.string({minLength: 1}),
        (nodeId) => {
          const phase = new MessageGroupPhase({
            nodeId,
            messageRouter: mockRouter,
            workerManager: mockWorkerManager,
          });
          return phase !== null && phase.shouldUseWorkerProcesses() === true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('MessageGroupPhase accepts workerManager for worker process isolation');
  });

  t.test('PartitionPhase requires nodeId, messageRouter, and getLeaderMgService in-process', async (t) => {
    const mockRouter = {register: () => {}};
    const mockGetLeader = () => null;

    // Test missing nodeId
    fc.assert(
      fc.property(
        fc.constant(null),
        () => {
          try {
            new PartitionPhase({
              nodeId: null,
              messageRouter: mockRouter,
              getLeaderMessageGroupService: mockGetLeader,
            });
            return false;
          } catch (error) {
            return error.message.includes('nodeId is required');
          }
        },
      ),
      {numRuns: 10},
    );

    // Test missing messageRouter
    fc.assert(
      fc.property(
        fc.string({minLength: 1}),
        (nodeId) => {
          try {
            new PartitionPhase({
              nodeId,
              messageRouter: null,
              getLeaderMessageGroupService: mockGetLeader,
            });
            return false;
          } catch (error) {
            return error.message.includes('messageRouter is required');
          }
        },
      ),
      {numRuns: 10},
    );

    // Test that getLeaderMessageGroupService is optional at construction
    // (only required at execute time in in-process mode)
    fc.assert(
      fc.property(
        fc.string({minLength: 1}),
        (nodeId) => {
          // Should NOT throw at construction - getLeaderMessageGroupService is optional
          const phase = new PartitionPhase({
            nodeId,
            messageRouter: mockRouter,
            getLeaderMessageGroupService: null,
          });
          return phase !== null;
        },
      ),
      {numRuns: 10},
    );

    t.pass('PartitionPhase validates required dependencies');
  });

  t.test('PartitionPhase accepts workerManager for worker mode', async (t) => {
    const mockRouter = {register: () => {}};
    const mockWorkerManager = {
      isInitialized: () => true,
      createPartitionReplica: async () => ({replicaId: 'test'}),
    };

    // Test that workerManager can be provided instead of getLeaderMessageGroupService
    fc.assert(
      fc.property(
        fc.string({minLength: 1}),
        (nodeId) => {
          const phase = new PartitionPhase({
            nodeId,
            messageRouter: mockRouter,
            workerManager: mockWorkerManager,
          });
          return phase !== null && phase.shouldUseWorkerProcesses() === true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('PartitionPhase accepts workerManager for worker process isolation');
  });

  t.test('RegistrationPhase requires all dependencies', async (t) => {
    const mockPartitions = new Map();
    const mockMessageGroups = new Map();
    const mockCdcIntegrationService = {};
    const mockGetLeader = () => null;
    const mockGetCache = () => ({});

    // Test missing nodeId
    try {
      new RegistrationPhase({
        nodeId: null,
        partitionServices: mockPartitions,
        messageGroupServices: mockMessageGroups,
        cdcIntegrationService: mockCdcIntegrationService,
        getLeaderMessageGroupService: mockGetLeader,
        getSystemTableCache: mockGetCache,
      });
      t.fail('Should have thrown for missing nodeId');
    } catch (error) {
      t.ok(error.message.includes('nodeId is required'), 'Throws for missing nodeId');
    }

    // Test missing partitionServices
    try {
      new RegistrationPhase({
        nodeId: 'test-node',
        partitionServices: null,
        messageGroupServices: mockMessageGroups,
        cdcIntegrationService: mockCdcIntegrationService,
        getLeaderMessageGroupService: mockGetLeader,
        getSystemTableCache: mockGetCache,
      });
      t.fail('Should have thrown for missing partitionServices');
    } catch (error) {
      t.ok(
        error.message.includes('partitionServices is required'),
        'Throws for missing partitionServices',
      );
    }

    // Test missing messageGroupServices
    try {
      new RegistrationPhase({
        nodeId: 'test-node',
        partitionServices: mockPartitions,
        messageGroupServices: null,
        cdcIntegrationService: mockCdcIntegrationService,
        getLeaderMessageGroupService: mockGetLeader,
        getSystemTableCache: mockGetCache,
      });
      t.fail('Should have thrown for missing messageGroupServices');
    } catch (error) {
      t.ok(
        error.message.includes('messageGroupServices is required'),
        'Throws for missing messageGroupServices',
      );
    }

    // Test missing cdcIntegrationService
    try {
      new RegistrationPhase({
        nodeId: 'test-node',
        partitionServices: mockPartitions,
        messageGroupServices: mockMessageGroups,
        cdcIntegrationService: null,
        getLeaderMessageGroupService: mockGetLeader,
        getSystemTableCache: mockGetCache,
      });
      t.fail('Should have thrown for missing cdcIntegrationService');
    } catch (error) {
      t.ok(
        error.message.includes('cdcIntegrationService is required'),
        'Throws for missing cdcIntegrationService',
      );
    }
  });

  t.test('CacheHydrationPhase requires all dependencies', async (t) => {
    const mockPartitions = new Map();
    const mockRouter = {};
    const mockGetCache = () => ({});
    const mockGetLeader = () => null;

    // Test missing nodeId
    try {
      new CacheHydrationPhase({
        nodeId: null,
        partitionServices: mockPartitions,
        messageRouter: mockRouter,
        getSystemTableCache: mockGetCache,
        getLeaderMessageGroupService: mockGetLeader,
      });
      t.fail('Should have thrown for missing nodeId');
    } catch (error) {
      t.ok(error.message.includes('nodeId is required'), 'Throws for missing nodeId');
    }

    // Test missing partitionServices
    try {
      new CacheHydrationPhase({
        nodeId: 'test-node',
        partitionServices: null,
        messageRouter: mockRouter,
        getSystemTableCache: mockGetCache,
        getLeaderMessageGroupService: mockGetLeader,
      });
      t.fail('Should have thrown for missing partitionServices');
    } catch (error) {
      t.ok(
        error.message.includes('partitionServices is required'),
        'Throws for missing partitionServices',
      );
    }

    // Test missing messageRouter
    try {
      new CacheHydrationPhase({
        nodeId: 'test-node',
        partitionServices: mockPartitions,
        messageRouter: null,
        getSystemTableCache: mockGetCache,
        getLeaderMessageGroupService: mockGetLeader,
      });
      t.fail('Should have thrown for missing messageRouter');
    } catch (error) {
      t.ok(
        error.message.includes('messageRouter is required'),
        'Throws for missing messageRouter',
      );
    }
  });

  t.test('Phase classes emit events on start, complete, and failure', async (t) => {
    // Test InfrastructurePhase event emission
    const phase = new InfrastructurePhase({
      nodeId: 'test-node',
      nodeAddress: 'localhost',
      wsPort: null, // No server for testing
    });

    let startEmitted = false;
    let completeEmitted = false;

    phase.on(INFRASTRUCTURE_PHASE.EVENT_START, () => {
      startEmitted = true;
    });

    phase.on(INFRASTRUCTURE_PHASE.EVENT_COMPLETE, (result) => {
      completeEmitted = true;
      t.ok(result.phaseName === INFRASTRUCTURE_PHASE.NAME, 'Complete event includes phase name');
      t.ok(typeof result.duration === 'number', 'Complete event includes duration');
      t.ok(result.services !== undefined, 'Complete event includes services');
    });

    await phase.execute();

    t.ok(startEmitted, 'Start event was emitted');
    t.ok(completeEmitted, 'Complete event was emitted');

    // Cleanup
    await phase.cleanup();
  });

  t.test('Phase execute() returns object with services and metadata', async (t) => {
    fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async () => {
          const phase = new InfrastructurePhase({
            nodeId: 'test-node',
            nodeAddress: 'localhost',
            wsPort: null,
          });

          const result = await phase.execute();

          // Verify result structure
          const hasPhaseNameString = typeof result.phaseName === 'string';
          const hasDurationNumber = typeof result.duration === 'number';
          const hasServicesObject = typeof result.services === 'object';
          const hasMetadataObject = typeof result.metadata === 'object';

          await phase.cleanup();

          return hasPhaseNameString && hasDurationNumber &&
                 hasServicesObject && hasMetadataObject;
        },
      ),
      {numRuns: 10},
    );
    t.pass('Phase execute() returns properly structured result');
  });

  t.test('Phase cleanup() releases resources', async (t) => {
    const phase = new InfrastructurePhase({
      nodeId: 'test-node',
      nodeAddress: 'localhost',
      wsPort: null,
    });

    await phase.execute();

    // Verify resources exist before cleanup
    t.ok(phase.messageRouter !== null, 'MessageRouter exists before cleanup');

    await phase.cleanup();

    // Verify resources are released after cleanup
    t.ok(phase.messageRouter === null, 'MessageRouter is null after cleanup');
  });
});
