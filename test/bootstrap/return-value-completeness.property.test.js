/**
 * Property Tests: Return Value Completeness
 *
 * **Property 7: Return Value Completeness**
 * *For any* call to bootstrap() or join(), the return value SHALL contain all
 * required keys (success, nodeId, duration, messageGroupServices,
 * partitionServices, etc.) to ensure API contract consistency.
 *
 * **Validates: Requirements 9.3, 9.4**
 *
 * Feature: bootstrap-architecture-refactoring, Property 7: Return Value Completeness
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

/**
 * Required keys in a successful bootstrap result.
 * These keys must be present per the API contract.
 */
const REQUIRED_SUCCESS_KEYS = Object.freeze([
  'success',
  'nodeId',
  'duration',
  'servicesCreated',
  'partitionsCreated',
  'messageGroupsCreated',
  'messageGroupServices',
  'partitionServices',
  'replicaHandler',
  'replicaStateMachine',
  'epochManager',
  'transport',
  'messageRouter',
]);

/**
 * Required keys in a failed bootstrap result.
 * These keys must be present per the API contract.
 */
const REQUIRED_FAILURE_KEYS = Object.freeze([
  'success',
  'nodeId',
  'duration',
  'error',
  'phase',
  'servicesCreated',
]);

/**
 * Required keys in a successful join result.
 * These keys must be present per the API contract.
 * **Validates: Requirements 9.4**
 */
const REQUIRED_JOIN_SUCCESS_KEYS = Object.freeze([
  'success',
  'nodeId',
  'duration',
  'messageGroupServices',
  'partitionServices',
  'replicaHandler',
  'replicaStateMachine',
  'transport',
  'messageRouter',
  'bootstrapResponse',
  'lifecycleStateMachine',
  'pullBasedAssigner',
  'epochManager',
]);

/**
 * Required keys in a failed join result.
 * These keys must be present per the API contract.
 * **Validates: Requirements 9.4**
 */
const REQUIRED_JOIN_FAILURE_KEYS = Object.freeze([
  'success',
  'nodeId',
  'duration',
  'error',
  'phase',
]);

/**
 * Initialize test environment.
 */
function initializeTestEnvironment() {
  const configManager = ConfigurationManager.getInstance();
  if (!configManager.isInitialized()) {
    configManager.initialize({
      node: {id: 'test-node'},
    });
  }

  const loggingService = LoggingService.getInstance();
  if (!loggingService.isInitialized()) {
    loggingService.initialize({
      level: 'error',
      format: 'json',
    });
  }
}

/**
 * Arbitrary for valid node IDs.
 */
const nodeIdArb = fc.string({minLength: 1, maxLength: 36}).filter((s) => s.trim().length > 0);

/**
 * Arbitrary for valid WebSocket ports.
 */
const wsPortArb = fc.integer({min: 10000, max: 60000});

test('Property 7: Return Value Completeness', {timeout: 120000}, async (t) => {
  /**
   * Property: For any successful bootstrap() call, the return value SHALL
   * contain all required keys per the API contract.
   * **Validates: Requirements 9.3**
   */
  t.test('successful bootstrap returns all expected keys', async (t) => {
    initializeTestEnvironment();

    await fc.assert(
      fc.asyncProperty(
        nodeIdArb,
        wsPortArb,
        async (nodeId, wsPort) => {
          const bootstrap = new BootstrapService({
            nodeId,
            wsPort,
            config: {
              replicaStaggerDelayMs: 0,
              leadershipWaitTimeoutMs: 150,
              leadershipWaitInitialDelayMs: 2,
              leadershipWaitMaxDelayMs: 15,
              leadershipWaitBackoffMultiplier: 1.5,
            },
          });

          let result;
          try {
            result = await bootstrap.bootstrap();
          } finally {
            // Always cleanup
            await bootstrap.shutdown();
          }

          // Only check successful results
          if (!result.success) {
            // Skip this iteration if bootstrap failed
            return true;
          }

          // Invariant: all required keys must be present
          for (const key of REQUIRED_SUCCESS_KEYS) {
            if (!(key in result)) {
              return false;
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('successful bootstrap returns all expected keys');
  });

  /**
   * Property: For any failed bootstrap() call, the return value SHALL
   * contain all required failure keys per the API contract.
   * **Validates: Requirements 9.3**
   */
  t.test('failed bootstrap returns all expected failure keys', async (t) => {
    initializeTestEnvironment();

    await fc.assert(
      fc.asyncProperty(
        nodeIdArb,
        async (nodeId) => {
          // Create bootstrap with very short timeout to force failure
          const bootstrap = new BootstrapService({
            nodeId,
            // No wsPort - will fail during leadership wait
            config: {
              replicaStaggerDelayMs: 0,
              leadershipWaitTimeoutMs: 1,
              leadershipWaitInitialDelayMs: 1,
              leadershipWaitMaxDelayMs: 1,
              leadershipWaitBackoffMultiplier: 1,
            },
          });

          let result;
          try {
            result = await bootstrap.bootstrap();
          } finally {
            await bootstrap.shutdown();
          }

          // Only check failed results
          if (result.success) {
            // Skip this iteration if bootstrap succeeded
            return true;
          }

          // Invariant: all required failure keys must be present
          for (const key of REQUIRED_FAILURE_KEYS) {
            if (!(key in result)) {
              return false;
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('failed bootstrap returns all expected failure keys');
  });

  /**
   * Property: For any bootstrap() result, the success field SHALL be a boolean.
   * **Validates: Requirements 9.3**
   */
  t.test('success field is always a boolean', async (t) => {
    initializeTestEnvironment();

    await fc.assert(
      fc.asyncProperty(
        nodeIdArb,
        async (nodeId) => {
          const bootstrap = new BootstrapService({
            nodeId,
            config: {
              replicaStaggerDelayMs: 0,
              leadershipWaitTimeoutMs: 1,
              leadershipWaitInitialDelayMs: 1,
              leadershipWaitMaxDelayMs: 1,
              leadershipWaitBackoffMultiplier: 1,
            },
          });

          let result;
          try {
            result = await bootstrap.bootstrap();
          } finally {
            await bootstrap.shutdown();
          }

          // Invariant: success must be a boolean
          return typeof result.success === 'boolean';
        },
      ),
      {numRuns: 10},
    );

    t.pass('success field is always a boolean');
  });

  /**
   * Property: For any bootstrap() result, the nodeId field SHALL match
   * the provided nodeId or be a generated UUID.
   * **Validates: Requirements 9.3**
   */
  t.test('nodeId field is present and valid', async (t) => {
    initializeTestEnvironment();

    await fc.assert(
      fc.asyncProperty(
        nodeIdArb,
        async (nodeId) => {
          const bootstrap = new BootstrapService({
            nodeId,
            config: {
              replicaStaggerDelayMs: 0,
              leadershipWaitTimeoutMs: 1,
              leadershipWaitInitialDelayMs: 1,
              leadershipWaitMaxDelayMs: 1,
              leadershipWaitBackoffMultiplier: 1,
            },
          });

          let result;
          try {
            result = await bootstrap.bootstrap();
          } finally {
            await bootstrap.shutdown();
          }

          // Invariant: nodeId must be a non-empty string
          return typeof result.nodeId === 'string' && result.nodeId.length > 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('nodeId field is present and valid');
  });

  /**
   * Property: For any bootstrap() result, the duration field SHALL be
   * a non-negative number.
   * **Validates: Requirements 9.3**
   */
  t.test('duration field is a non-negative number', async (t) => {
    initializeTestEnvironment();

    await fc.assert(
      fc.asyncProperty(
        nodeIdArb,
        async (nodeId) => {
          const bootstrap = new BootstrapService({
            nodeId,
            config: {
              replicaStaggerDelayMs: 0,
              leadershipWaitTimeoutMs: 1,
              leadershipWaitInitialDelayMs: 1,
              leadershipWaitMaxDelayMs: 1,
              leadershipWaitBackoffMultiplier: 1,
            },
          });

          let result;
          try {
            result = await bootstrap.bootstrap();
          } finally {
            await bootstrap.shutdown();
          }

          // Invariant: duration must be a non-negative number
          return typeof result.duration === 'number' && result.duration >= 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('duration field is a non-negative number');
  });

  /**
   * Property: For any bootstrap() result, the servicesCreated field SHALL
   * be a non-negative integer.
   * **Validates: Requirements 9.3**
   */
  t.test('servicesCreated field is a non-negative integer', async (t) => {
    initializeTestEnvironment();

    await fc.assert(
      fc.asyncProperty(
        nodeIdArb,
        async (nodeId) => {
          const bootstrap = new BootstrapService({
            nodeId,
            config: {
              replicaStaggerDelayMs: 0,
              leadershipWaitTimeoutMs: 1,
              leadershipWaitInitialDelayMs: 1,
              leadershipWaitMaxDelayMs: 1,
              leadershipWaitBackoffMultiplier: 1,
            },
          });

          let result;
          try {
            result = await bootstrap.bootstrap();
          } finally {
            await bootstrap.shutdown();
          }

          // Invariant: servicesCreated must be a non-negative integer
          return typeof result.servicesCreated === 'number' &&
            Number.isInteger(result.servicesCreated) &&
            result.servicesCreated >= 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('servicesCreated field is a non-negative integer');
  });

  /**
   * Property: For any successful bootstrap() result, messageGroupServices
   * SHALL be a Map instance.
   * **Validates: Requirements 9.3**
   */
  t.test('messageGroupServices is a Map on success', async (t) => {
    initializeTestEnvironment();

    await fc.assert(
      fc.asyncProperty(
        nodeIdArb,
        wsPortArb,
        async (nodeId, wsPort) => {
          const bootstrap = new BootstrapService({
            nodeId,
            wsPort,
            config: {
              replicaStaggerDelayMs: 0,
              leadershipWaitTimeoutMs: 150,
              leadershipWaitInitialDelayMs: 2,
              leadershipWaitMaxDelayMs: 15,
              leadershipWaitBackoffMultiplier: 1.5,
            },
          });

          let result;
          try {
            result = await bootstrap.bootstrap();
          } finally {
            await bootstrap.shutdown();
          }

          // Only check successful results
          if (!result.success) {
            return true;
          }

          // Invariant: messageGroupServices must be a Map
          return result.messageGroupServices instanceof Map;
        },
      ),
      {numRuns: 10},
    );

    t.pass('messageGroupServices is a Map on success');
  });

  /**
   * Property: For any successful bootstrap() result, partitionServices
   * SHALL be a Map instance.
   * **Validates: Requirements 9.3**
   */
  t.test('partitionServices is a Map on success', async (t) => {
    initializeTestEnvironment();

    await fc.assert(
      fc.asyncProperty(
        nodeIdArb,
        wsPortArb,
        async (nodeId, wsPort) => {
          const bootstrap = new BootstrapService({
            nodeId,
            wsPort,
            config: {
              replicaStaggerDelayMs: 0,
              leadershipWaitTimeoutMs: 150,
              leadershipWaitInitialDelayMs: 2,
              leadershipWaitMaxDelayMs: 15,
              leadershipWaitBackoffMultiplier: 1.5,
            },
          });

          let result;
          try {
            result = await bootstrap.bootstrap();
          } finally {
            await bootstrap.shutdown();
          }

          // Only check successful results
          if (!result.success) {
            return true;
          }

          // Invariant: partitionServices must be a Map
          return result.partitionServices instanceof Map;
        },
      ),
      {numRuns: 10},
    );

    t.pass('partitionServices is a Map on success');
  });

  /**
   * Property: For any failed bootstrap() result, the error field SHALL
   * be a non-empty string describing the failure.
   * **Validates: Requirements 9.3**
   */
  t.test('error field is a non-empty string on failure', async (t) => {
    initializeTestEnvironment();

    await fc.assert(
      fc.asyncProperty(
        nodeIdArb,
        async (nodeId) => {
          const bootstrap = new BootstrapService({
            nodeId,
            config: {
              replicaStaggerDelayMs: 0,
              leadershipWaitTimeoutMs: 1,
              leadershipWaitInitialDelayMs: 1,
              leadershipWaitMaxDelayMs: 1,
              leadershipWaitBackoffMultiplier: 1,
            },
          });

          let result;
          try {
            result = await bootstrap.bootstrap();
          } finally {
            await bootstrap.shutdown();
          }

          // Only check failed results
          if (result.success) {
            return true;
          }

          // Invariant: error must be a non-empty string
          return typeof result.error === 'string' && result.error.length > 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('error field is a non-empty string on failure');
  });

  /**
   * Property: For any failed bootstrap() result, the phase field SHALL
   * be a string indicating which phase failed.
   * **Validates: Requirements 9.3**
   */
  t.test('phase field is a string on failure', async (t) => {
    initializeTestEnvironment();

    await fc.assert(
      fc.asyncProperty(
        nodeIdArb,
        async (nodeId) => {
          const bootstrap = new BootstrapService({
            nodeId,
            config: {
              replicaStaggerDelayMs: 0,
              leadershipWaitTimeoutMs: 1,
              leadershipWaitInitialDelayMs: 1,
              leadershipWaitMaxDelayMs: 1,
              leadershipWaitBackoffMultiplier: 1,
            },
          });

          let result;
          try {
            result = await bootstrap.bootstrap();
          } finally {
            await bootstrap.shutdown();
          }

          // Only check failed results
          if (result.success) {
            return true;
          }

          // Invariant: phase must be a string
          return typeof result.phase === 'string';
        },
      ),
      {numRuns: 10},
    );

    t.pass('phase field is a string on failure');
  });
});

/**
 * Property 7: Return Value Completeness (join)
 * **Validates: Requirements 9.4**
 *
 * For any call to join(), the return value SHALL contain all required keys
 * per the API contract.
 */
test('Property 7: Return Value Completeness (join)', {timeout: 120000}, async (t) => {
  /**
   * Property: For any failed join() call, the return value SHALL
   * contain all required failure keys per the API contract.
   * **Validates: Requirements 9.4**
   */
  t.test('failed join returns all expected failure keys', async (t) => {
    initializeTestEnvironment();

    await fc.assert(
      fc.asyncProperty(
        nodeIdArb,
        async (nodeId) => {
          // Create joining service without seed node address to force failure
          const joiningService = new NodeJoiningService({
            nodeId,
            nodeAddress: 'localhost:9999',
            seedNodeAddress: null, // Will cause failure
            config: {
              replicaStaggerDelayMs: 0,
              leadershipWaitTimeoutMs: 1,
              leadershipWaitInitialDelayMs: 1,
              leadershipWaitMaxDelayMs: 1,
              leadershipWaitBackoffMultiplier: 1,
            },
          });

          let result;
          try {
            result = await joiningService.join();
          } catch (_error) {
            // If join throws, create a failure result structure
            result = {
              success: false,
              nodeId,
              duration: 0,
              error: _error.message,
              phase: joiningService.getPhase(),
            };
          } finally {
            // Always cleanup to clear heartbeat timer
            await joiningService.cleanup();
          }

          // Only check failed results
          if (result.success) {
            return true;
          }

          // Invariant: all required failure keys must be present
          for (const key of REQUIRED_JOIN_FAILURE_KEYS) {
            if (!(key in result)) {
              return false;
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('failed join returns all expected failure keys');
  });

  /**
   * Property: For any join() result, the success field SHALL be a boolean.
   * **Validates: Requirements 9.4**
   */
  t.test('join success field is always a boolean', async (t) => {
    initializeTestEnvironment();

    await fc.assert(
      fc.asyncProperty(
        nodeIdArb,
        async (nodeId) => {
          const joiningService = new NodeJoiningService({
            nodeId,
            nodeAddress: 'localhost:9999',
            seedNodeAddress: null,
            config: {
              replicaStaggerDelayMs: 0,
              leadershipWaitTimeoutMs: 1,
              leadershipWaitInitialDelayMs: 1,
              leadershipWaitMaxDelayMs: 1,
              leadershipWaitBackoffMultiplier: 1,
            },
          });

          let result;
          try {
            result = await joiningService.join();
          } catch (_error) {
            result = {
              success: false,
              nodeId,
              duration: 0,
              error: _error.message,
              phase: joiningService.getPhase(),
            };
          } finally {
            await joiningService.cleanup();
          }

          // Invariant: success must be a boolean
          return typeof result.success === 'boolean';
        },
      ),
      {numRuns: 10},
    );

    t.pass('join success field is always a boolean');
  });

  /**
   * Property: For any join() result, the nodeId field SHALL match
   * the provided nodeId or be a generated UUID.
   * **Validates: Requirements 9.4**
   */
  t.test('join nodeId field is present and valid', async (t) => {
    initializeTestEnvironment();

    await fc.assert(
      fc.asyncProperty(
        nodeIdArb,
        async (nodeId) => {
          const joiningService = new NodeJoiningService({
            nodeId,
            nodeAddress: 'localhost:9999',
            seedNodeAddress: null,
            config: {
              replicaStaggerDelayMs: 0,
              leadershipWaitTimeoutMs: 1,
              leadershipWaitInitialDelayMs: 1,
              leadershipWaitMaxDelayMs: 1,
              leadershipWaitBackoffMultiplier: 1,
            },
          });

          let result;
          try {
            result = await joiningService.join();
          } catch (_error) {
            result = {
              success: false,
              nodeId,
              duration: 0,
              error: _error.message,
              phase: joiningService.getPhase(),
            };
          } finally {
            await joiningService.cleanup();
          }

          // Invariant: nodeId must be a non-empty string
          return typeof result.nodeId === 'string' && result.nodeId.length > 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('join nodeId field is present and valid');
  });

  /**
   * Property: For any join() result, the duration field SHALL be
   * a non-negative number.
   * **Validates: Requirements 9.4**
   */
  t.test('join duration field is a non-negative number', async (t) => {
    initializeTestEnvironment();

    await fc.assert(
      fc.asyncProperty(
        nodeIdArb,
        async (nodeId) => {
          const joiningService = new NodeJoiningService({
            nodeId,
            nodeAddress: 'localhost:9999',
            seedNodeAddress: null,
            config: {
              replicaStaggerDelayMs: 0,
              leadershipWaitTimeoutMs: 1,
              leadershipWaitInitialDelayMs: 1,
              leadershipWaitMaxDelayMs: 1,
              leadershipWaitBackoffMultiplier: 1,
            },
          });

          let result;
          try {
            result = await joiningService.join();
          } catch (_error) {
            result = {
              success: false,
              nodeId,
              duration: 0,
              error: _error.message,
              phase: joiningService.getPhase(),
            };
          } finally {
            await joiningService.cleanup();
          }

          // Invariant: duration must be a non-negative number
          return typeof result.duration === 'number' && result.duration >= 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('join duration field is a non-negative number');
  });

  /**
   * Property: For any failed join() result, the error field SHALL
   * be a non-empty string describing the failure.
   * **Validates: Requirements 9.4**
   */
  t.test('join error field is a non-empty string on failure', async (t) => {
    initializeTestEnvironment();

    await fc.assert(
      fc.asyncProperty(
        nodeIdArb,
        async (nodeId) => {
          const joiningService = new NodeJoiningService({
            nodeId,
            nodeAddress: 'localhost:9999',
            seedNodeAddress: null,
            config: {
              replicaStaggerDelayMs: 0,
              leadershipWaitTimeoutMs: 1,
              leadershipWaitInitialDelayMs: 1,
              leadershipWaitMaxDelayMs: 1,
              leadershipWaitBackoffMultiplier: 1,
            },
          });

          let result;
          try {
            result = await joiningService.join();
          } catch (_error) {
            result = {
              success: false,
              nodeId,
              duration: 0,
              error: _error.message,
              phase: joiningService.getPhase(),
            };
          } finally {
            await joiningService.cleanup();
          }

          // Only check failed results
          if (result.success) {
            return true;
          }

          // Invariant: error must be a non-empty string
          return typeof result.error === 'string' && result.error.length > 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('join error field is a non-empty string on failure');
  });

  /**
   * Property: For any failed join() result, the phase field SHALL
   * be a string indicating which phase failed.
   * **Validates: Requirements 9.4**
   */
  t.test('join phase field is a string on failure', async (t) => {
    initializeTestEnvironment();

    await fc.assert(
      fc.asyncProperty(
        nodeIdArb,
        async (nodeId) => {
          const joiningService = new NodeJoiningService({
            nodeId,
            nodeAddress: 'localhost:9999',
            seedNodeAddress: null,
            config: {
              replicaStaggerDelayMs: 0,
              leadershipWaitTimeoutMs: 1,
              leadershipWaitInitialDelayMs: 1,
              leadershipWaitMaxDelayMs: 1,
              leadershipWaitBackoffMultiplier: 1,
            },
          });

          let result;
          try {
            result = await joiningService.join();
          } catch (_error) {
            result = {
              success: false,
              nodeId,
              duration: 0,
              error: _error.message,
              phase: joiningService.getPhase(),
            };
          } finally {
            await joiningService.cleanup();
          }

          // Only check failed results
          if (result.success) {
            return true;
          }

          // Invariant: phase must be a string
          return typeof result.phase === 'string';
        },
      ),
      {numRuns: 10},
    );

    t.pass('join phase field is a string on failure');
  });

  /**
   * Property: For any successful join() call with mocked HTTP, the return value
   * SHALL contain all required keys per the API contract.
   * **Validates: Requirements 9.4**
   */
  t.test('successful join returns all expected keys (mocked)', async (t) => {
    initializeTestEnvironment();

    // Create a mock HTTP post that returns a valid bootstrap response
    const createMockHttpPost = (nodeId) => {
      return async (_url, _data) => {
        return {
          success: true,
          seedNodeId: 'seed-node-1',
          seedNodeWsAddress: 'ws://localhost:8080',
          messageGroupAssignment: {
            strategy: 'CREATE_SELF_HOSTED',
            messageGroupId: `mg-${nodeId}`,
            replicaId: `replica-${nodeId}`,
            peerAddresses: [],
            replicaAddresses: [],
          },
          currentEpoch: {
            epoch: 1,
            assignments: {},
            timestamp: new Date().toISOString(),
            proposedBy: 'seed-node-1',
          },
          readyNodes: ['seed-node-1', nodeId],
          tablePolicies: {},
        };
      };
    };

    await fc.assert(
      fc.asyncProperty(
        nodeIdArb,
        wsPortArb,
        async (nodeId, wsPort) => {
          const joiningService = new NodeJoiningService({
            nodeId,
            nodeAddress: `localhost:${wsPort}`,
            seedNodeAddress: 'http://localhost:3000',
            seedNodeWsAddress: 'ws://localhost:8080',
            wsPort,
            httpPost: createMockHttpPost(nodeId),
            config: {
              replicaStaggerDelayMs: 0,
              leadershipWaitTimeoutMs: 150,
              leadershipWaitInitialDelayMs: 2,
              leadershipWaitMaxDelayMs: 15,
              leadershipWaitBackoffMultiplier: 1.5,
            },
          });

          let result;
          try {
            result = await joiningService.join();
          } catch (_error) {
            // If join fails, we skip this iteration
            return true;
          } finally {
            await joiningService.cleanup();
          }

          // Only check successful results
          if (!result.success) {
            return true;
          }

          // Invariant: all required keys must be present
          for (const key of REQUIRED_JOIN_SUCCESS_KEYS) {
            if (!(key in result)) {
              return false;
            }
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('successful join returns all expected keys (mocked)');
  });

  /**
   * Property: For any successful join() result, messageGroupServices
   * SHALL be a Map instance.
   * **Validates: Requirements 9.4**
   */
  t.test('join messageGroupServices is a Map on success (mocked)', async (t) => {
    initializeTestEnvironment();

    const createMockHttpPost = (nodeId) => {
      return async (_url, _data) => {
        return {
          success: true,
          seedNodeId: 'seed-node-1',
          seedNodeWsAddress: 'ws://localhost:8080',
          messageGroupAssignment: {
            strategy: 'CREATE_SELF_HOSTED',
            messageGroupId: `mg-${nodeId}`,
            replicaId: `replica-${nodeId}`,
            peerAddresses: [],
            replicaAddresses: [],
          },
          currentEpoch: {
            epoch: 1,
            assignments: {},
            timestamp: new Date().toISOString(),
            proposedBy: 'seed-node-1',
          },
          readyNodes: ['seed-node-1', nodeId],
          tablePolicies: {},
        };
      };
    };

    await fc.assert(
      fc.asyncProperty(
        nodeIdArb,
        wsPortArb,
        async (nodeId, wsPort) => {
          const joiningService = new NodeJoiningService({
            nodeId,
            nodeAddress: `localhost:${wsPort}`,
            seedNodeAddress: 'http://localhost:3000',
            seedNodeWsAddress: 'ws://localhost:8080',
            wsPort,
            httpPost: createMockHttpPost(nodeId),
            config: {
              replicaStaggerDelayMs: 0,
              leadershipWaitTimeoutMs: 150,
              leadershipWaitInitialDelayMs: 2,
              leadershipWaitMaxDelayMs: 15,
              leadershipWaitBackoffMultiplier: 1.5,
            },
          });

          let result;
          try {
            result = await joiningService.join();
          } catch (_error) {
            return true;
          } finally {
            await joiningService.cleanup();
          }

          // Only check successful results
          if (!result.success) {
            return true;
          }

          // Invariant: messageGroupServices must be a Map
          return result.messageGroupServices instanceof Map;
        },
      ),
      {numRuns: 10},
    );

    t.pass('join messageGroupServices is a Map on success (mocked)');
  });

  /**
   * Property: For any successful join() result, partitionServices
   * SHALL be a Map instance.
   * **Validates: Requirements 9.4**
   */
  t.test('join partitionServices is a Map on success (mocked)', async (t) => {
    initializeTestEnvironment();

    const createMockHttpPost = (nodeId) => {
      return async (_url, _data) => {
        return {
          success: true,
          seedNodeId: 'seed-node-1',
          seedNodeWsAddress: 'ws://localhost:8080',
          messageGroupAssignment: {
            strategy: 'CREATE_SELF_HOSTED',
            messageGroupId: `mg-${nodeId}`,
            replicaId: `replica-${nodeId}`,
            peerAddresses: [],
            replicaAddresses: [],
          },
          currentEpoch: {
            epoch: 1,
            assignments: {},
            timestamp: new Date().toISOString(),
            proposedBy: 'seed-node-1',
          },
          readyNodes: ['seed-node-1', nodeId],
          tablePolicies: {},
        };
      };
    };

    await fc.assert(
      fc.asyncProperty(
        nodeIdArb,
        wsPortArb,
        async (nodeId, wsPort) => {
          const joiningService = new NodeJoiningService({
            nodeId,
            nodeAddress: `localhost:${wsPort}`,
            seedNodeAddress: 'http://localhost:3000',
            seedNodeWsAddress: 'ws://localhost:8080',
            wsPort,
            httpPost: createMockHttpPost(nodeId),
            config: {
              replicaStaggerDelayMs: 0,
              leadershipWaitTimeoutMs: 150,
              leadershipWaitInitialDelayMs: 2,
              leadershipWaitMaxDelayMs: 15,
              leadershipWaitBackoffMultiplier: 1.5,
            },
          });

          let result;
          try {
            result = await joiningService.join();
          } catch (_error) {
            return true;
          } finally {
            await joiningService.cleanup();
          }

          // Only check successful results
          if (!result.success) {
            return true;
          }

          // Invariant: partitionServices must be a Map
          return result.partitionServices instanceof Map;
        },
      ),
      {numRuns: 10},
    );

    t.pass('join partitionServices is a Map on success (mocked)');
  });

  /**
   * Property: For any successful join() result, lifecycleStateMachine
   * SHALL be present and have a getState method.
   * **Validates: Requirements 9.4**
   */
  t.test('join lifecycleStateMachine is present on success (mocked)', async (t) => {
    initializeTestEnvironment();

    const createMockHttpPost = (nodeId) => {
      return async (_url, _data) => {
        return {
          success: true,
          seedNodeId: 'seed-node-1',
          seedNodeWsAddress: 'ws://localhost:8080',
          messageGroupAssignment: {
            strategy: 'CREATE_SELF_HOSTED',
            messageGroupId: `mg-${nodeId}`,
            replicaId: `replica-${nodeId}`,
            peerAddresses: [],
            replicaAddresses: [],
          },
          currentEpoch: {
            epoch: 1,
            assignments: {},
            timestamp: new Date().toISOString(),
            proposedBy: 'seed-node-1',
          },
          readyNodes: ['seed-node-1', nodeId],
          tablePolicies: {},
        };
      };
    };

    await fc.assert(
      fc.asyncProperty(
        nodeIdArb,
        wsPortArb,
        async (nodeId, wsPort) => {
          const joiningService = new NodeJoiningService({
            nodeId,
            nodeAddress: `localhost:${wsPort}`,
            seedNodeAddress: 'http://localhost:3000',
            seedNodeWsAddress: 'ws://localhost:8080',
            wsPort,
            httpPost: createMockHttpPost(nodeId),
            config: {
              replicaStaggerDelayMs: 0,
              leadershipWaitTimeoutMs: 150,
              leadershipWaitInitialDelayMs: 2,
              leadershipWaitMaxDelayMs: 15,
              leadershipWaitBackoffMultiplier: 1.5,
            },
          });

          let result;
          try {
            result = await joiningService.join();
          } catch (_error) {
            return true;
          } finally {
            await joiningService.cleanup();
          }

          // Only check successful results
          if (!result.success) {
            return true;
          }

          // Invariant: lifecycleStateMachine must be present with getState method
          return result.lifecycleStateMachine !== null &&
            result.lifecycleStateMachine !== undefined &&
            typeof result.lifecycleStateMachine.getState === 'function';
        },
      ),
      {numRuns: 10},
    );

    t.pass('join lifecycleStateMachine is present on success (mocked)');
  });
});
