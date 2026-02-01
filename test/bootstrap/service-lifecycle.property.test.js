/**
 * Property Tests: Service Lifecycle State Transitions
 *
 * **Property 2: Service Lifecycle State Transitions**
 * *For any* service implementing ServiceLifecycle, the state transitions SHALL
 * follow the defined state machine: CREATED → (initialize) → INITIALIZED →
 * (start) → RUNNING → (stop) → STOPPED. Each transition SHALL update the state
 * returned by getState().
 *
 * **Property 3: Invalid Lifecycle Transition Handling**
 * *For any* service implementing ServiceLifecycle, calling start() when not in
 * INITIALIZED state SHALL throw an error, and calling stop() when not in
 * RUNNING state SHALL log a warning but not throw.
 *
 * **Validates: Requirements 4.5, 4.6, 4.7, 4.8, 4.9, 4.10**
 *
 * Feature: bootstrap-architecture-refactoring
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {EventEmitter} from 'events';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ServiceLifecycleMixin} from '../../src/bootstrap/service-lifecycle-mixin.js';
import {
  SERVICE_STATE,
  SERVICE_LIFECYCLE_METHOD,
} from '../../src/bootstrap/service-lifecycle-constants.js';

/**
 * Create a test service class using the ServiceLifecycleMixin.
 * @return {Function} Test service class.
 */
function createTestServiceClass() {
  return class TestService extends ServiceLifecycleMixin(EventEmitter) {
    /**
     * Create a test service.
     * @param {string} serviceName - Name of the service.
     */
    constructor(serviceName) {
      super();
      this.initializeLifecycle(serviceName);
      this.initializeCalled = false;
      this.startCalled = false;
      this.stopCalled = false;
    }

    /**
     * Custom initialization logic.
     * @return {Promise<void>}
     */
    async doInitialize() {
      this.initializeCalled = true;
    }

    /**
     * Custom start logic.
     * @return {Promise<void>}
     */
    async doStart() {
      this.startCalled = true;
    }

    /**
     * Custom stop logic.
     * @return {Promise<void>}
     */
    async doStop() {
      this.stopCalled = true;
    }
  };
}

/**
 * Initialize test environment.
 */
function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();

  const config = ConfigurationManager.getInstance();
  config.initialize({});

  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});
}

/**
 * Cleanup test environment.
 */
function cleanupTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

test('Property 2: Service Lifecycle State Transitions', async (t) => {
  t.beforeEach(async () => {
    initializeTestEnvironment();
  });

  t.afterEach(async () => {
    cleanupTestEnvironment();
  });

  /**
   * Property: For any service name, a newly created service SHALL be in
   * CREATED state.
   * **Validates: Requirements 4.5**
   */
  t.test('newly created service is in CREATED state', async (t) => {
    await fc.assert(
      fc.property(
        fc.string({minLength: 1, maxLength: 50}),
        (serviceName) => {
          const TestService = createTestServiceClass();
          const service = new TestService(serviceName);

          // Invariant: new service must be in CREATED state
          return service.getState() === SERVICE_STATE.CREATED;
        },
      ),
      {numRuns: 10},
    );

    t.pass('newly created service is in CREATED state');
  });

  /**
   * Property: For any service, calling initialize() SHALL transition from
   * CREATED to INITIALIZED state.
   * **Validates: Requirements 4.6**
   */
  t.test('initialize transitions from CREATED to INITIALIZED', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({minLength: 1, maxLength: 50}),
        async (serviceName) => {
          const TestService = createTestServiceClass();
          const service = new TestService(serviceName);

          // Pre-condition: service is in CREATED state
          if (service.getState() !== SERVICE_STATE.CREATED) {
            return false;
          }

          await service.initialize();

          // Post-condition: service is in INITIALIZED state
          return service.getState() === SERVICE_STATE.INITIALIZED;
        },
      ),
      {numRuns: 10},
    );

    t.pass('initialize transitions from CREATED to INITIALIZED');
  });

  /**
   * Property: For any service, calling start() on an INITIALIZED service
   * SHALL transition to RUNNING state.
   * **Validates: Requirements 4.7**
   */
  t.test('start transitions from INITIALIZED to RUNNING', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({minLength: 1, maxLength: 50}),
        async (serviceName) => {
          const TestService = createTestServiceClass();
          const service = new TestService(serviceName);

          await service.initialize();

          // Pre-condition: service is in INITIALIZED state
          if (service.getState() !== SERVICE_STATE.INITIALIZED) {
            return false;
          }

          await service.start();

          // Post-condition: service is in RUNNING state
          return service.getState() === SERVICE_STATE.RUNNING;
        },
      ),
      {numRuns: 10},
    );

    t.pass('start transitions from INITIALIZED to RUNNING');
  });

  /**
   * Property: For any service, calling stop() on a RUNNING service
   * SHALL transition to STOPPED state.
   * **Validates: Requirements 4.8**
   */
  t.test('stop transitions from RUNNING to STOPPED', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({minLength: 1, maxLength: 50}),
        async (serviceName) => {
          const TestService = createTestServiceClass();
          const service = new TestService(serviceName);

          await service.initialize();
          await service.start();

          // Pre-condition: service is in RUNNING state
          if (service.getState() !== SERVICE_STATE.RUNNING) {
            return false;
          }

          await service.stop();

          // Post-condition: service is in STOPPED state
          return service.getState() === SERVICE_STATE.STOPPED;
        },
      ),
      {numRuns: 10},
    );

    t.pass('stop transitions from RUNNING to STOPPED');
  });

  /**
   * Property: For any service, the full lifecycle sequence
   * CREATED → INITIALIZED → RUNNING → STOPPED SHALL work correctly.
   * **Validates: Requirements 4.5, 4.6, 4.7, 4.8**
   */
  t.test('full lifecycle sequence works correctly', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({minLength: 1, maxLength: 50}),
        async (serviceName) => {
          const TestService = createTestServiceClass();
          const service = new TestService(serviceName);

          // Track state transitions
          const states = [service.getState()];

          await service.initialize();
          states.push(service.getState());

          await service.start();
          states.push(service.getState());

          await service.stop();
          states.push(service.getState());

          // Invariant: states must follow the defined sequence
          return states[0] === SERVICE_STATE.CREATED &&
                 states[1] === SERVICE_STATE.INITIALIZED &&
                 states[2] === SERVICE_STATE.RUNNING &&
                 states[3] === SERVICE_STATE.STOPPED;
        },
      ),
      {numRuns: 10},
    );

    t.pass('full lifecycle sequence works correctly');
  });

  /**
   * Property: For any service, custom lifecycle hooks (doInitialize, doStart,
   * doStop) SHALL be called during transitions.
   * **Validates: Requirements 4.6, 4.7, 4.8**
   */
  t.test('custom lifecycle hooks are called during transitions', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({minLength: 1, maxLength: 50}),
        async (serviceName) => {
          const TestService = createTestServiceClass();
          const service = new TestService(serviceName);

          // Pre-condition: hooks not called yet
          if (service.initializeCalled || service.startCalled ||
              service.stopCalled) {
            return false;
          }

          await service.initialize();
          const initCalled = service.initializeCalled;

          await service.start();
          const startCalled = service.startCalled;

          await service.stop();
          const stopCalled = service.stopCalled;

          // Invariant: all hooks must be called
          return initCalled && startCalled && stopCalled;
        },
      ),
      {numRuns: 10},
    );

    t.pass('custom lifecycle hooks are called during transitions');
  });

  /**
   * Property: For any service, state change events SHALL be emitted on
   * transitions.
   * **Validates: Requirements 4.6, 4.7, 4.8**
   */
  t.test('state change events are emitted on transitions', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({minLength: 1, maxLength: 50}),
        async (serviceName) => {
          const TestService = createTestServiceClass();
          const service = new TestService(serviceName);

          const stateChanges = [];
          service.on('stateChanged', (event) => {
            stateChanges.push({
              previous: event.previousState,
              new: event.newState,
            });
          });

          await service.initialize();
          await service.start();
          await service.stop();

          // Invariant: three state changes must be emitted
          return stateChanges.length === 3 &&
                 stateChanges[0].previous === SERVICE_STATE.CREATED &&
                 stateChanges[0].new === SERVICE_STATE.INITIALIZED &&
                 stateChanges[1].previous === SERVICE_STATE.INITIALIZED &&
                 stateChanges[1].new === SERVICE_STATE.RUNNING &&
                 stateChanges[2].previous === SERVICE_STATE.RUNNING &&
                 stateChanges[2].new === SERVICE_STATE.STOPPED;
        },
      ),
      {numRuns: 10},
    );

    t.pass('state change events are emitted on transitions');
  });
});

test('Property 3: Invalid Lifecycle Transition Handling', async (t) => {
  t.beforeEach(async () => {
    initializeTestEnvironment();
  });

  t.afterEach(async () => {
    cleanupTestEnvironment();
  });

  /**
   * Property: For any service in CREATED state, calling start() SHALL throw
   * an error.
   * **Validates: Requirements 4.9**
   */
  t.test('start from CREATED state throws error', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({minLength: 1, maxLength: 50}),
        async (serviceName) => {
          const TestService = createTestServiceClass();
          const service = new TestService(serviceName);

          // Pre-condition: service is in CREATED state
          if (service.getState() !== SERVICE_STATE.CREATED) {
            return false;
          }

          let threwError = false;
          let errorName = '';
          try {
            await service.start();
          } catch (error) {
            threwError = true;
            errorName = error.name;
          }

          // Invariant: must throw LifecycleError
          return threwError && errorName === 'LifecycleError';
        },
      ),
      {numRuns: 10},
    );

    t.pass('start from CREATED state throws error');
  });

  /**
   * Property: For any service in RUNNING state, calling start() SHALL throw
   * an error.
   * **Validates: Requirements 4.9**
   */
  t.test('start from RUNNING state throws error', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({minLength: 1, maxLength: 50}),
        async (serviceName) => {
          const TestService = createTestServiceClass();
          const service = new TestService(serviceName);

          await service.initialize();
          await service.start();

          // Pre-condition: service is in RUNNING state
          if (service.getState() !== SERVICE_STATE.RUNNING) {
            return false;
          }

          let threwError = false;
          let errorName = '';
          try {
            await service.start();
          } catch (error) {
            threwError = true;
            errorName = error.name;
          }

          // Invariant: must throw LifecycleError
          return threwError && errorName === 'LifecycleError';
        },
      ),
      {numRuns: 10},
    );

    t.pass('start from RUNNING state throws error');
  });

  /**
   * Property: For any service in STOPPED state, calling start() SHALL throw
   * an error.
   * **Validates: Requirements 4.9**
   */
  t.test('start from STOPPED state throws error', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({minLength: 1, maxLength: 50}),
        async (serviceName) => {
          const TestService = createTestServiceClass();
          const service = new TestService(serviceName);

          await service.initialize();
          await service.start();
          await service.stop();

          // Pre-condition: service is in STOPPED state
          if (service.getState() !== SERVICE_STATE.STOPPED) {
            return false;
          }

          let threwError = false;
          let errorName = '';
          try {
            await service.start();
          } catch (error) {
            threwError = true;
            errorName = error.name;
          }

          // Invariant: must throw LifecycleError
          return threwError && errorName === 'LifecycleError';
        },
      ),
      {numRuns: 10},
    );

    t.pass('start from STOPPED state throws error');
  });

  /**
   * Property: For any service in CREATED state, calling stop() SHALL NOT
   * throw but SHALL log a warning.
   * **Validates: Requirements 4.10**
   */
  t.test('stop from CREATED state does not throw', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({minLength: 1, maxLength: 50}),
        async (serviceName) => {
          const TestService = createTestServiceClass();
          const service = new TestService(serviceName);

          // Pre-condition: service is in CREATED state
          if (service.getState() !== SERVICE_STATE.CREATED) {
            return false;
          }

          let threwError = false;
          try {
            await service.stop();
          } catch (_error) {
            threwError = true;
          }

          // Invariant: must NOT throw
          // State should remain CREATED since transition was invalid
          return !threwError && service.getState() === SERVICE_STATE.CREATED;
        },
      ),
      {numRuns: 10},
    );

    t.pass('stop from CREATED state does not throw');
  });

  /**
   * Property: For any service in INITIALIZED state, calling stop() SHALL NOT
   * throw but SHALL log a warning.
   * **Validates: Requirements 4.10**
   */
  t.test('stop from INITIALIZED state does not throw', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({minLength: 1, maxLength: 50}),
        async (serviceName) => {
          const TestService = createTestServiceClass();
          const service = new TestService(serviceName);

          await service.initialize();

          // Pre-condition: service is in INITIALIZED state
          if (service.getState() !== SERVICE_STATE.INITIALIZED) {
            return false;
          }

          let threwError = false;
          try {
            await service.stop();
          } catch (_error) {
            threwError = true;
          }

          // Invariant: must NOT throw
          // State should remain INITIALIZED since transition was invalid
          return !threwError && service.getState() === SERVICE_STATE.INITIALIZED;
        },
      ),
      {numRuns: 10},
    );

    t.pass('stop from INITIALIZED state does not throw');
  });

  /**
   * Property: For any service in STOPPED state, calling stop() SHALL NOT
   * throw but SHALL log a warning.
   * **Validates: Requirements 4.10**
   */
  t.test('stop from STOPPED state does not throw', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({minLength: 1, maxLength: 50}),
        async (serviceName) => {
          const TestService = createTestServiceClass();
          const service = new TestService(serviceName);

          await service.initialize();
          await service.start();
          await service.stop();

          // Pre-condition: service is in STOPPED state
          if (service.getState() !== SERVICE_STATE.STOPPED) {
            return false;
          }

          let threwError = false;
          try {
            await service.stop();
          } catch (_error) {
            threwError = true;
          }

          // Invariant: must NOT throw
          // State should remain STOPPED
          return !threwError && service.getState() === SERVICE_STATE.STOPPED;
        },
      ),
      {numRuns: 10},
    );

    t.pass('stop from STOPPED state does not throw');
  });

  /**
   * Property: For any invalid state, the error message SHALL contain the
   * service name and current state.
   * **Validates: Requirements 4.9**
   */
  t.test('error message contains service name and state', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({minLength: 1, maxLength: 50}).filter((s) => !s.includes('\n')),
        async (serviceName) => {
          const TestService = createTestServiceClass();
          const service = new TestService(serviceName);

          let errorMessage = '';
          try {
            await service.start();
          } catch (error) {
            errorMessage = error.message;
          }

          // Invariant: error message must contain service name and state
          return errorMessage.includes(serviceName) &&
                 errorMessage.includes(SERVICE_STATE.CREATED);
        },
      ),
      {numRuns: 10},
    );

    t.pass('error message contains service name and state');
  });

  /**
   * Property: For any invalid start() call, the error SHALL have correct
   * properties.
   * **Validates: Requirements 4.9**
   */
  t.test('lifecycle error has correct properties', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({minLength: 1, maxLength: 50}),
        async (serviceName) => {
          const TestService = createTestServiceClass();
          const service = new TestService(serviceName);

          let error = null;
          try {
            await service.start();
          } catch (e) {
            error = e;
          }

          // Invariant: error must have correct properties
          return error !== null &&
                 error.name === 'LifecycleError' &&
                 error.serviceName === serviceName &&
                 error.currentState === SERVICE_STATE.CREATED &&
                 error.attemptedTransition === SERVICE_LIFECYCLE_METHOD.START;
        },
      ),
      {numRuns: 10},
    );

    t.pass('lifecycle error has correct properties');
  });
});
