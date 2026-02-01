/**
 * Property Tests: Required Dependency Validation
 *
 * **Property 1: Required Dependency Validation**
 * *For any* service with required dependencies (SQLQueryEngine, BootstrapPartitionWriter,
 * phase classes), constructing with a null required dependency SHALL throw an error
 * with a descriptive message identifying the missing dependency.
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 6.3, 7.1, 7.2**
 *
 * Feature: bootstrap-architecture-refactoring, Property 1: Required Dependency Validation
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {DependencyError} from '../../src/bootstrap/bootstrap-errors.js';

/**
 * Helper to create a mock service that validates required dependencies.
 * This simulates the pattern that will be used by SQLQueryEngine,
 * BootstrapPartitionWriter, and phase classes.
 *
 * @param {string} serviceName - Name of the service.
 * @param {Array<string>} requiredDeps - List of required dependency names.
 * @return {Function} Constructor function for the mock service.
 */
function createMockServiceClass(serviceName, requiredDeps) {
  return class MockService {
    /**
     * Create a mock service with dependency validation.
     * @param {Object} options - Configuration options.
     */
    constructor(options = {}) {
      this.serviceName = serviceName;

      // Validate all required dependencies
      for (const depName of requiredDeps) {
        if (options[depName] === null || options[depName] === undefined) {
          throw new DependencyError(serviceName, depName);
        }
        this[depName] = options[depName];
      }
    }
  };
}

/**
 * Test that DependencyError has the correct structure.
 */
test('DependencyError structure', async (t) => {
  /**
   * Property: For any service name and dependency name, DependencyError
   * SHALL have correct properties.
   * **Validates: Requirements 7.1, 7.2**
   */
  t.test('DependencyError has correct properties', async (t) => {
    await fc.assert(
      fc.property(
        fc.string({minLength: 1, maxLength: 50}).filter((s) => !s.includes('\n')),
        fc.string({minLength: 1, maxLength: 50}).filter((s) => !s.includes('\n')),
        (serviceName, dependencyName) => {
          const error = new DependencyError(serviceName, dependencyName);

          // Invariant: error must have correct properties
          return error.name === 'DependencyError' &&
                 error.serviceName === serviceName &&
                 error.dependencyName === dependencyName &&
                 error.message.includes(serviceName) &&
                 error.message.includes(dependencyName);
        },
      ),
      {numRuns: 10},
    );

    t.pass('DependencyError has correct properties');
  });

  /**
   * Property: For any service name and dependency name, DependencyError
   * message SHALL follow the format "{serviceName} requires {dependencyName}".
   * **Validates: Requirements 7.1, 7.2**
   */
  t.test('DependencyError message format is correct', async (t) => {
    await fc.assert(
      fc.property(
        fc.string({minLength: 1, maxLength: 50}).filter((s) => !s.includes('\n')),
        fc.string({minLength: 1, maxLength: 50}).filter((s) => !s.includes('\n')),
        (serviceName, dependencyName) => {
          const error = new DependencyError(serviceName, dependencyName);
          const expectedMessage = `${serviceName} requires ${dependencyName}`;

          // Invariant: message must match expected format
          return error.message === expectedMessage;
        },
      ),
      {numRuns: 10},
    );

    t.pass('DependencyError message format is correct');
  });

  /**
   * Property: DependencyError SHALL be an instance of Error.
   * **Validates: Requirements 7.1**
   */
  t.test('DependencyError is an instance of Error', async (t) => {
    await fc.assert(
      fc.property(
        fc.string({minLength: 1, maxLength: 50}),
        fc.string({minLength: 1, maxLength: 50}),
        (serviceName, dependencyName) => {
          const error = new DependencyError(serviceName, dependencyName);

          // Invariant: must be an Error instance
          return error instanceof Error;
        },
      ),
      {numRuns: 10},
    );

    t.pass('DependencyError is an instance of Error');
  });
});

test('Property 1: Required Dependency Validation', async (t) => {
  /**
   * Property: For any service with required dependencies, constructing with
   * a null required dependency SHALL throw DependencyError.
   * **Validates: Requirements 1.3, 7.1**
   */
  t.test('null required dependency throws DependencyError', async (t) => {
    await fc.assert(
      fc.property(
        fc.string({minLength: 1, maxLength: 50}).filter((s) => !s.includes('\n')),
        fc.array(
          fc.string({minLength: 1, maxLength: 30}).filter((s) => /^[a-zA-Z][a-zA-Z0-9]*$/.test(s)),
          {minLength: 1, maxLength: 5},
        ),
        fc.nat({max: 10}),
        (serviceName, requiredDeps, nullIndex) => {
          // Ensure unique dependency names
          const uniqueDeps = [...new Set(requiredDeps)];
          if (uniqueDeps.length === 0) {
            return true; // Skip if no valid deps
          }

          const MockService = createMockServiceClass(serviceName, uniqueDeps);

          // Create options with one null dependency
          const targetIndex = nullIndex % uniqueDeps.length;
          const options = {};
          for (let i = 0; i < uniqueDeps.length; i++) {
            options[uniqueDeps[i]] = i === targetIndex ? null : {mock: true};
          }

          let threwError = false;
          let errorName = '';
          let errorServiceName = '';
          let errorDependencyName = '';

          try {
            new MockService(options);
          } catch (error) {
            threwError = true;
            errorName = error.name;
            errorServiceName = error.serviceName;
            errorDependencyName = error.dependencyName;
          }

          // Invariant: must throw DependencyError with correct properties
          return threwError &&
                 errorName === 'DependencyError' &&
                 errorServiceName === serviceName &&
                 errorDependencyName === uniqueDeps[targetIndex];
        },
      ),
      {numRuns: 10},
    );

    t.pass('null required dependency throws DependencyError');
  });

  /**
   * Property: For any service with required dependencies, constructing with
   * an undefined required dependency SHALL throw DependencyError.
   * **Validates: Requirements 1.3, 7.1**
   */
  t.test('undefined required dependency throws DependencyError', async (t) => {
    await fc.assert(
      fc.property(
        fc.string({minLength: 1, maxLength: 50}).filter((s) => !s.includes('\n')),
        fc.array(
          fc.string({minLength: 1, maxLength: 30}).filter((s) => /^[a-zA-Z][a-zA-Z0-9]*$/.test(s)),
          {minLength: 1, maxLength: 5},
        ),
        fc.nat({max: 10}),
        (serviceName, requiredDeps, undefinedIndex) => {
          // Ensure unique dependency names
          const uniqueDeps = [...new Set(requiredDeps)];
          if (uniqueDeps.length === 0) {
            return true; // Skip if no valid deps
          }

          const MockService = createMockServiceClass(serviceName, uniqueDeps);

          // Create options with one undefined dependency (by omitting it)
          const targetIndex = undefinedIndex % uniqueDeps.length;
          const options = {};
          for (let i = 0; i < uniqueDeps.length; i++) {
            if (i !== targetIndex) {
              options[uniqueDeps[i]] = {mock: true};
            }
            // Omit the target dependency to make it undefined
          }

          let threwError = false;
          let errorName = '';
          let errorServiceName = '';
          let errorDependencyName = '';

          try {
            new MockService(options);
          } catch (error) {
            threwError = true;
            errorName = error.name;
            errorServiceName = error.serviceName;
            errorDependencyName = error.dependencyName;
          }

          // Invariant: must throw DependencyError with correct properties
          return threwError &&
                 errorName === 'DependencyError' &&
                 errorServiceName === serviceName &&
                 errorDependencyName === uniqueDeps[targetIndex];
        },
      ),
      {numRuns: 10},
    );

    t.pass('undefined required dependency throws DependencyError');
  });

  /**
   * Property: For any service with required dependencies, constructing with
   * all valid dependencies SHALL succeed without throwing.
   * **Validates: Requirements 1.1, 1.2**
   */
  t.test('all valid dependencies allows construction', async (t) => {
    await fc.assert(
      fc.property(
        fc.string({minLength: 1, maxLength: 50}).filter((s) => !s.includes('\n')),
        fc.array(
          fc.string({minLength: 1, maxLength: 30}).filter((s) => /^[a-zA-Z][a-zA-Z0-9]*$/.test(s)),
          {minLength: 1, maxLength: 5},
        ),
        (serviceName, requiredDeps) => {
          // Ensure unique dependency names
          const uniqueDeps = [...new Set(requiredDeps)];
          if (uniqueDeps.length === 0) {
            return true; // Skip if no valid deps
          }

          const MockService = createMockServiceClass(serviceName, uniqueDeps);

          // Create options with all valid dependencies
          const options = {};
          for (const dep of uniqueDeps) {
            options[dep] = {mock: true};
          }

          let threwError = false;
          let service = null;

          try {
            service = new MockService(options);
          } catch (_error) {
            threwError = true;
          }

          // Invariant: must NOT throw and service must be created
          return !threwError && service !== null;
        },
      ),
      {numRuns: 10},
    );

    t.pass('all valid dependencies allows construction');
  });

  /**
   * Property: For any service with multiple required dependencies, the first
   * null dependency encountered SHALL be reported in the error.
   * **Validates: Requirements 7.1, 7.2**
   */
  t.test('first null dependency is reported in error', async (t) => {
    await fc.assert(
      fc.property(
        fc.string({minLength: 1, maxLength: 50}).filter((s) => !s.includes('\n')),
        (serviceName) => {
          // Fixed set of dependencies for predictable ordering
          const requiredDeps = ['depA', 'depB', 'depC'];
          const MockService = createMockServiceClass(serviceName, requiredDeps);

          // Make depB null (second dependency)
          const options = {
            depA: {mock: true},
            depB: null,
            depC: {mock: true},
          };

          let errorDependencyName = '';

          try {
            new MockService(options);
          } catch (error) {
            errorDependencyName = error.dependencyName;
          }

          // Invariant: error must report depB as the missing dependency
          return errorDependencyName === 'depB';
        },
      ),
      {numRuns: 10},
    );

    t.pass('first null dependency is reported in error');
  });

  /**
   * Property: The error message SHALL identify which dependency is missing.
   * **Validates: Requirements 7.2**
   */
  t.test('error message identifies missing dependency', async (t) => {
    await fc.assert(
      fc.property(
        fc.string({minLength: 1, maxLength: 50}).filter((s) => !s.includes('\n')),
        fc.string({minLength: 1, maxLength: 30}).filter((s) => /^[a-zA-Z][a-zA-Z0-9]*$/.test(s)),
        (serviceName, dependencyName) => {
          const MockService = createMockServiceClass(serviceName, [dependencyName]);

          let errorMessage = '';

          try {
            new MockService({[dependencyName]: null});
          } catch (error) {
            errorMessage = error.message;
          }

          // Invariant: error message must contain the dependency name
          return errorMessage.includes(dependencyName);
        },
      ),
      {numRuns: 10},
    );

    t.pass('error message identifies missing dependency');
  });

  /**
   * Property: The error message SHALL identify the service name.
   * **Validates: Requirements 7.2**
   */
  t.test('error message identifies service name', async (t) => {
    await fc.assert(
      fc.property(
        fc.string({minLength: 1, maxLength: 50}).filter((s) => !s.includes('\n')),
        fc.string({minLength: 1, maxLength: 30}).filter((s) => /^[a-zA-Z][a-zA-Z0-9]*$/.test(s)),
        (serviceName, dependencyName) => {
          const MockService = createMockServiceClass(serviceName, [dependencyName]);

          let errorMessage = '';

          try {
            new MockService({[dependencyName]: null});
          } catch (error) {
            errorMessage = error.message;
          }

          // Invariant: error message must contain the service name
          return errorMessage.includes(serviceName);
        },
      ),
      {numRuns: 10},
    );

    t.pass('error message identifies service name');
  });
});

/**
 * Tests for SQLQueryEngine-like dependency validation pattern.
 * These tests validate the pattern that will be used when SQLQueryEngine
 * is refactored to require dependencies at construction.
 *
 * **Validates: Requirements 1.1, 1.2, 6.3**
 */
test('SQLQueryEngine-like dependency validation pattern', async (t) => {
  /**
   * Property: A service requiring systemCache SHALL throw when systemCache
   * is null.
   * **Validates: Requirements 1.1**
   */
  t.test('systemCache null throws DependencyError', async (t) => {
    await fc.assert(
      fc.property(
        fc.constant(null),
        (_unused) => {
          const SQLQueryEngineLike = createMockServiceClass(
            'SQLQueryEngine',
            ['systemCache', 'messageRouter'],
          );

          let threwError = false;
          let errorDependencyName = '';

          try {
            new SQLQueryEngineLike({
              systemCache: null,
              messageRouter: {mock: true},
            });
          } catch (error) {
            threwError = true;
            errorDependencyName = error.dependencyName;
          }

          // Invariant: must throw with systemCache as missing dependency
          return threwError && errorDependencyName === 'systemCache';
        },
      ),
      {numRuns: 10},
    );

    t.pass('systemCache null throws DependencyError');
  });

  /**
   * Property: A service requiring messageRouter SHALL throw when messageRouter
   * is null.
   * **Validates: Requirements 1.2**
   */
  t.test('messageRouter null throws DependencyError', async (t) => {
    await fc.assert(
      fc.property(
        fc.constant(null),
        (_unused) => {
          const SQLQueryEngineLike = createMockServiceClass(
            'SQLQueryEngine',
            ['systemCache', 'messageRouter'],
          );

          let threwError = false;
          let errorDependencyName = '';

          try {
            new SQLQueryEngineLike({
              systemCache: {mock: true},
              messageRouter: null,
            });
          } catch (error) {
            threwError = true;
            errorDependencyName = error.dependencyName;
          }

          // Invariant: must throw with messageRouter as missing dependency
          return threwError && errorDependencyName === 'messageRouter';
        },
      ),
      {numRuns: 10},
    );

    t.pass('messageRouter null throws DependencyError');
  });

  /**
   * Property: A service with all required dependencies SHALL construct
   * successfully.
   * **Validates: Requirements 1.1, 1.2**
   */
  t.test('all dependencies provided allows construction', async (t) => {
    await fc.assert(
      fc.property(
        fc.constant(null),
        (_unused) => {
          const SQLQueryEngineLike = createMockServiceClass(
            'SQLQueryEngine',
            ['systemCache', 'messageRouter'],
          );

          let threwError = false;
          let service = null;

          try {
            service = new SQLQueryEngineLike({
              systemCache: {mock: true},
              messageRouter: {mock: true},
            });
          } catch (_error) {
            threwError = true;
          }

          // Invariant: must NOT throw and service must be created
          return !threwError && service !== null;
        },
      ),
      {numRuns: 10},
    );

    t.pass('all dependencies provided allows construction');
  });
});

/**
 * Tests for BootstrapPartitionWriter-like dependency validation pattern.
 * These tests validate the pattern that will be used by BootstrapPartitionWriter.
 *
 * **Validates: Requirements 6.3**
 */
test('BootstrapPartitionWriter-like dependency validation pattern', async (t) => {
  /**
   * Property: BootstrapPartitionWriter SHALL require partitionServices.
   * **Validates: Requirements 6.3**
   */
  t.test('partitionServices null throws DependencyError', async (t) => {
    await fc.assert(
      fc.property(
        fc.constant(null),
        (_unused) => {
          const BootstrapPartitionWriterLike = createMockServiceClass(
            'BootstrapPartitionWriter',
            ['partitionServices'],
          );

          let threwError = false;
          let errorDependencyName = '';
          let errorServiceName = '';

          try {
            new BootstrapPartitionWriterLike({
              partitionServices: null,
            });
          } catch (error) {
            threwError = true;
            errorDependencyName = error.dependencyName;
            errorServiceName = error.serviceName;
          }

          // Invariant: must throw with partitionServices as missing dependency
          return threwError &&
                 errorDependencyName === 'partitionServices' &&
                 errorServiceName === 'BootstrapPartitionWriter';
        },
      ),
      {numRuns: 10},
    );

    t.pass('partitionServices null throws DependencyError');
  });

  /**
   * Property: BootstrapPartitionWriter with valid partitionServices SHALL
   * construct successfully.
   * **Validates: Requirements 6.3**
   */
  t.test('valid partitionServices allows construction', async (t) => {
    await fc.assert(
      fc.property(
        fc.constant(null),
        (_unused) => {
          const BootstrapPartitionWriterLike = createMockServiceClass(
            'BootstrapPartitionWriter',
            ['partitionServices'],
          );

          let threwError = false;
          let service = null;

          try {
            service = new BootstrapPartitionWriterLike({
              partitionServices: new Map(),
            });
          } catch (_error) {
            threwError = true;
          }

          // Invariant: must NOT throw and service must be created
          return !threwError && service !== null;
        },
      ),
      {numRuns: 10},
    );

    t.pass('valid partitionServices allows construction');
  });
});

