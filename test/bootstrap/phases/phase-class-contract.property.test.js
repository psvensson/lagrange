/**
 * Property tests for phase class adapter contract.
 *
 * Legacy phase classes are now delegation adapters. They keep constructor
 * validation and lifecycle events, but execute through canonical owners.
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
    fc.assert(
      fc.property(
        fc.record({
          nodeId: fc.option(fc.string({minLength: 1}), {nil: undefined}),
          nodeAddress: fc.option(fc.string({minLength: 1}), {nil: undefined}),
          wsPort: fc.option(fc.integer({min: 1024, max: 65535}), {nil: undefined}),
        }),
        (options) => {
          const phase = new InfrastructurePhase(options);
          return phase !== null;
        },
      ),
      {numRuns: 10},
    );
    t.pass('InfrastructurePhase accepts optional configuration');
  });

  t.test('MessageGroupPhase requires nodeId and messageRouter', async (t) => {
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
            return false;
          } catch (error) {
            return error.message.includes('nodeId is required');
          }
        },
      ),
      {numRuns: 10},
    );

    fc.assert(
      fc.property(
        fc.string({minLength: 1}),
        (nodeId) => {
          try {
            new MessageGroupPhase({
              nodeId,
              messageRouter: null,
            });
            return false;
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
    };

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

  t.test('PartitionPhase requires nodeId and messageRouter', async (t) => {
    const mockRouter = {register: () => {}};

    fc.assert(
      fc.property(
        fc.constant(null),
        () => {
          try {
            new PartitionPhase({
              nodeId: null,
              messageRouter: mockRouter,
            });
            return false;
          } catch (error) {
            return error.message.includes('nodeId is required');
          }
        },
      ),
      {numRuns: 10},
    );

    fc.assert(
      fc.property(
        fc.string({minLength: 1}),
        (nodeId) => {
          try {
            new PartitionPhase({
              nodeId,
              messageRouter: null,
            });
            return false;
          } catch (error) {
            return error.message.includes('messageRouter is required');
          }
        },
      ),
      {numRuns: 10},
    );

    fc.assert(
      fc.property(
        fc.string({minLength: 1}),
        (nodeId) => {
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
    };

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

  t.test('Phase execute delegates to owner and emits lifecycle events', async (t) => {
    const phase = new InfrastructurePhase({
      nodeId: 'test-node',
      nodeAddress: 'localhost',
      wsPort: null,
      executeOwner: async (adapter) => {
        adapter.messageRouter = {shutdown: async () => {}};
        return {
          phaseName: INFRASTRUCTURE_PHASE.NAME,
          services: {
            messageRouter: adapter.messageRouter,
          },
          metadata: {
            nodeId: adapter.nodeId,
          },
        };
      },
    });

    let startEmitted = false;
    let completeEmitted = false;

    phase.on(INFRASTRUCTURE_PHASE.EVENT_START, () => {
      startEmitted = true;
    });

    phase.on(INFRASTRUCTURE_PHASE.EVENT_COMPLETE, (result) => {
      completeEmitted = true;
      t.equal(result.phaseName, INFRASTRUCTURE_PHASE.NAME);
      t.equal(typeof result.duration, 'number');
      t.ok(result.services !== undefined);
    });

    const result = await phase.execute();

    t.equal(result.phaseName, INFRASTRUCTURE_PHASE.NAME);
    t.ok(startEmitted, 'Start event was emitted');
    t.ok(completeEmitted, 'Complete event was emitted');
  });

  t.test('Phase execute fails fast when owner is missing', async (t) => {
    const phase = new InfrastructurePhase({
      nodeId: 'test-node',
      nodeAddress: 'localhost',
      wsPort: null,
    });

    try {
      await phase.execute();
      t.fail('execute() should reject when owner is missing');
    } catch (error) {
      t.match(error.message, /executeOwner/);
    }
  });

  t.test('Phase cleanup delegates and releases adapter fields', async (t) => {
    let cleanupCalled = false;
    const phase = new InfrastructurePhase({
      nodeId: 'test-node',
      executeOwner: async (adapter) => {
        adapter.messageRouter = {id: 'router'};
        return {
          services: {
            messageRouter: adapter.messageRouter,
          },
        };
      },
      cleanupOwner: async () => {
        cleanupCalled = true;
      },
    });

    await phase.execute();
    t.ok(phase.messageRouter !== null, 'MessageRouter exists before cleanup');

    await phase.cleanup();

    t.equal(cleanupCalled, true, 'cleanupOwner was called');
    t.equal(phase.messageRouter, null, 'MessageRouter cleared after cleanup');
  });
});
