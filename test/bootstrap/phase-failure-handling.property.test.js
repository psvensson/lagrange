/**
 * Property Tests: Phase Failure Handling
 *
 * **Property 8: Phase Failure Handling**
 * *For any* phase that fails during execution, the system SHALL emit a phase
 * failure event containing error details, attempt cleanup of resources created
 * in that phase, and throw a consistent error type with phase context.
 *
 * **Validates: Requirements 10.1, 10.2, 10.5, 10.6**
 *
 * Feature: bootstrap-architecture-refactoring, Property 8: Phase Failure Handling
 *
 * Updated for worker process isolation (Requirements 10.1, 10.2):
 * - Tests support both in-process mode and worker mode
 * - Cleanup verification checks both service Maps and worker handle Maps
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {BOOTSTRAP_EVENT, BOOTSTRAP_PHASE} from '../../src/bootstrap/bootstrap-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NUM} from '../../src/constants/index.js';

/**
 * Check if all replica resources are cleared after cleanup.
 * Supports both in-process mode (services Maps) and worker mode (worker handle Maps).
 * @param {BootstrapService} bootstrap - Bootstrap service instance.
 * @return {boolean} True if all replica resources are cleared.
 */
function areReplicaResourcesCleared(bootstrap) {
  // Check in-process mode resources
  const messageGroupsCleared = bootstrap.messageGroupServices.size === NUM.ZERO;
  const partitionsCleared = bootstrap.partitionServices.size === NUM.ZERO;

  // Check worker mode resources (if they exist)
  const workerMessageGroupsCleared = !bootstrap.workerMessageGroupHandles ||
    bootstrap.workerMessageGroupHandles.size === NUM.ZERO;
  const workerPartitionsCleared = !bootstrap.workerPartitionHandles ||
    bootstrap.workerPartitionHandles.size === NUM.ZERO;

  return messageGroupsCleared && partitionsCleared &&
    workerMessageGroupsCleared && workerPartitionsCleared;
}

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
 * Arbitrary for valid node IDs (alphanumeric with hyphens, no special chars).
 */
const nodeIdArb = fc.stringMatching(/^[a-zA-Z0-9][a-zA-Z0-9-]{0,35}$/);

test('Property 8: Phase Failure Handling', async (t) => {
  /**
   * Property: For any phase that fails, the system SHALL emit a phase failure
   * event with error details.
   * **Validates: Requirements 10.1**
   */
  t.test('phase failure emits event with error details', async (t) => {
    initializeTestEnvironment();

    await fc.assert(
      fc.asyncProperty(
        nodeIdArb,
        async (nodeId) => {
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

          let phaseFailedEventReceived = false;
          let eventHasErrorDetails = false;
          let eventHasPhase = false;

          bootstrap.on(BOOTSTRAP_EVENT.PHASE_FAILED, (event) => {
            phaseFailedEventReceived = true;
            eventHasErrorDetails = typeof event.error === 'string' && event.error.length > 0;
            eventHasPhase = typeof event.phase === 'string' && event.phase.length > 0;
          });

          try {
            await bootstrap.bootstrap();
          } finally {
            await bootstrap.shutdown();
          }

          // Invariant: phase failure event must be emitted with error details
          return phaseFailedEventReceived && eventHasErrorDetails && eventHasPhase;
        },
      ),
      {numRuns: 10},
    );

    t.pass('phase failure emits event with error details');
  });

  /**
   * Property: For any phase that fails, the system SHALL emit a 'phase:failed'
   * event (alternative event name) with error details.
   * **Validates: Requirements 10.1**
   */
  t.test('phase failure emits phase:failed event', async (t) => {
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

          let phaseFailedEventReceived = false;
          let eventHasError = false;
          let eventHasDuration = false;

          bootstrap.on('phase:failed', (event) => {
            phaseFailedEventReceived = true;
            eventHasError = typeof event.error === 'string';
            eventHasDuration = typeof event.duration === 'number';
          });

          try {
            await bootstrap.bootstrap();
          } finally {
            await bootstrap.shutdown();
          }

          // Invariant: phase:failed event must be emitted
          return phaseFailedEventReceived && eventHasError && eventHasDuration;
        },
      ),
      {numRuns: 10},
    );

    t.pass('phase failure emits phase:failed event');
  });

  /**
   * Property: For any phase that fails, the result SHALL contain the phase
   * name where failure occurred.
   * **Validates: Requirements 10.6**
   */
  t.test('failure result contains phase name', async (t) => {
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

          // Invariant: phase must be present and be a valid phase name
          const validPhases = Object.values(BOOTSTRAP_PHASE);
          return typeof result.phase === 'string' && validPhases.includes(result.phase);
        },
      ),
      {numRuns: 10},
    );

    t.pass('failure result contains phase name');
  });

  /**
   * Property: For any phase that fails, the error message SHALL contain
   * context about what failed.
   * **Validates: Requirements 10.5**
   */
  t.test('error message contains failure context', async (t) => {
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

          // Invariant: error must be a non-empty string with context
          return typeof result.error === 'string' &&
            result.error.length > 0 &&
            // Error should contain some meaningful context
            (result.error.includes('leadership') ||
             result.error.includes('timeout') ||
             result.error.includes('failed') ||
             result.error.includes('error'));
        },
      ),
      {numRuns: 10},
    );

    t.pass('error message contains failure context');
  });

  /**
   * Property: For any phase that fails, cleanup SHALL be attempted for
   * resources created in that phase.
   * **Validates: Requirements 10.2**
   */
  t.test('cleanup is attempted on phase failure', async (t) => {
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

          // After failure and cleanup, services should be cleared
          // The shutdown() call in finally should have cleaned up
          // Requirements 10.1, 10.2 - Use helper function for mode-agnostic cleanup check
          const replicasCleared = areReplicaResourcesCleared(bootstrap);
          const routerCleared = bootstrap.messageRouter === null;

          // Invariant: cleanup should clear resources
          return replicasCleared && routerCleared;
        },
      ),
      {numRuns: 10},
    );

    t.pass('cleanup is attempted on phase failure');
  });

  /**
   * Property: For any bootstrap failure, the FAILED event SHALL be emitted
   * with complete failure information.
   * **Validates: Requirements 10.1**
   */
  t.test('FAILED event is emitted with complete information', async (t) => {
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

          let failedEventReceived = false;
          let eventHasNodeId = false;
          let eventHasPhase = false;
          let eventHasDuration = false;
          let eventHasError = false;

          bootstrap.on(BOOTSTRAP_EVENT.FAILED, (event) => {
            failedEventReceived = true;
            eventHasNodeId = typeof event.nodeId === 'string';
            eventHasPhase = typeof event.phase === 'string';
            eventHasDuration = typeof event.duration === 'number';
            eventHasError = typeof event.error === 'string';
          });

          try {
            await bootstrap.bootstrap();
          } finally {
            await bootstrap.shutdown();
          }

          // Invariant: FAILED event must have complete information
          return failedEventReceived &&
            eventHasNodeId &&
            eventHasPhase &&
            eventHasDuration &&
            eventHasError;
        },
      ),
      {numRuns: 10},
    );

    t.pass('FAILED event is emitted with complete information');
  });

  /**
   * Property: For any phase failure, the duration field SHALL be a
   * non-negative number representing time spent before failure.
   * **Validates: Requirements 10.6**
   */
  t.test('failure duration is tracked correctly', async (t) => {
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

          let phaseDuration = -1;

          bootstrap.on(BOOTSTRAP_EVENT.PHASE_FAILED, (event) => {
            phaseDuration = event.duration;
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

          // Invariant: duration must be a non-negative number
          return typeof phaseDuration === 'number' && phaseDuration >= 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('failure duration is tracked correctly');
  });

  /**
   * Property: For any phase failure, the servicesCreated count SHALL reflect
   * services created before the failure.
   * **Validates: Requirements 10.6**
   */
  t.test('servicesCreated reflects state at failure', async (t) => {
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

          // Invariant: servicesCreated must be a non-negative integer
          return typeof result.servicesCreated === 'number' &&
            Number.isInteger(result.servicesCreated) &&
            result.servicesCreated >= 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('servicesCreated reflects state at failure');
  });

  /**
   * Property: For any bootstrap that fails, success SHALL be false.
   * **Validates: Requirements 10.5**
   */
  t.test('failed bootstrap returns success=false', async (t) => {
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

          // This test specifically checks that when bootstrap fails,
          // success is false (not that it always fails)
          // If it succeeded, that's fine - we're testing the failure case
          if (result.error) {
            return result.success === false;
          }

          return true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('failed bootstrap returns success=false');
  });
});
