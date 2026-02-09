/**
 * Property-based tests for bootstrap error classes.
 *
 * Feature: code-quality-improvements
 * Validates: Requirements 4.2, 4.6
 */

import test from 'node:test';
import assert from 'node:assert';
import fc from 'fast-check';
import {BaseError} from '../../src/utils/base-error.js';
import {
  DependencyError,
  LifecycleError,
  PhaseTransitionError,
  PhaseTimeoutError,
} from '../../src/bootstrap/bootstrap-errors.js';

/**
 * Property 5: Error Classes Extend BaseError and Set Name
 * For any error class in bootstrap-errors.js, instantiating the class SHALL
 * produce an error where:
 * - The error is an instance of BaseError
 * - The error.name property equals the class name
 *
 * **Validates: Requirements 4.2, 4.6**
 */
test('Property 5: Error classes extend BaseError and set name', () => {
  const errorClasses = [
    {
      Class: DependencyError,
      create: () => new DependencyError('TestService', 'testDep'),
    },
    {
      Class: LifecycleError,
      create: () => new LifecycleError('TestService', 'created', 'start'),
    },
    {
      Class: PhaseTransitionError,
      create: () => new PhaseTransitionError('phase1', 'phase3', ['phase2']),
    },
    {
      Class: PhaseTimeoutError,
      create: () => new PhaseTimeoutError('testPhase', 5000, {}),
    },
  ];

  for (const {Class, create} of errorClasses) {
    const error = create();

    // Must be instance of BaseError
    assert.ok(
      error instanceof BaseError,
      `${Class.name} should extend BaseError`,
    );

    // Must be instance of Error
    assert.ok(
      error instanceof Error,
      `${Class.name} should extend Error`,
    );

    // Name must equal class name
    assert.strictEqual(
      error.name,
      Class.name,
      `${Class.name}.name should equal class name`,
    );

    // Must have stack trace
    assert.ok(
      error.stack,
      `${Class.name} should have stack trace`,
    );
  }
});

test('DependencyError - preserves service and dependency names', () => {
  fc.assert(
    fc.property(
      fc.string({minLength: 1}),
      fc.string({minLength: 1}),
      (serviceName, dependencyName) => {
        const error = new DependencyError(serviceName, dependencyName);
        return error.serviceName === serviceName &&
               error.dependencyName === dependencyName &&
               error.message.includes(serviceName) &&
               error.message.includes(dependencyName);
      },
    ),
    {numRuns: 10},
  );
});

test('LifecycleError - preserves state transition info', () => {
  fc.assert(
    fc.property(
      fc.string({minLength: 1}),
      fc.string({minLength: 1}),
      fc.string({minLength: 1}),
      (serviceName, currentState, attemptedTransition) => {
        const error = new LifecycleError(
          serviceName,
          currentState,
          attemptedTransition,
        );
        return error.serviceName === serviceName &&
               error.currentState === currentState &&
               error.attemptedTransition === attemptedTransition;
      },
    ),
    {numRuns: 10},
  );
});

test('PhaseTransitionError - preserves phase info', () => {
  fc.assert(
    fc.property(
      fc.string({minLength: 1}),
      fc.string({minLength: 1}),
      fc.array(fc.string({minLength: 1}), {minLength: 1, maxLength: 5}),
      (currentPhase, targetPhase, validTransitions) => {
        const error = new PhaseTransitionError(
          currentPhase,
          targetPhase,
          validTransitions,
        );
        return error.currentPhase === currentPhase &&
               error.targetPhase === targetPhase &&
               JSON.stringify(error.validTransitions) ===
                 JSON.stringify(validTransitions);
      },
    ),
    {numRuns: 10},
  );
});

test('PhaseTimeoutError - preserves timeout info', () => {
  fc.assert(
    fc.property(
      fc.string({minLength: 1}),
      fc.integer({min: 1, max: 60000}),
      (phaseName, timeoutMs) => {
        const error = new PhaseTimeoutError(phaseName, timeoutMs, {});
        return error.phaseName === phaseName &&
               error.timeoutMs === timeoutMs &&
               error.message.includes(phaseName) &&
               error.message.includes(String(timeoutMs));
      },
    ),
    {numRuns: 10},
  );
});

test('Error classes support toJSON for logging', () => {
  const error = new DependencyError('TestService', 'testDep', {
    context: {nodeId: 'node-1'},
  });

  const json = error.toJSON();

  assert.strictEqual(json.name, 'DependencyError');
  assert.ok(json.message.includes('TestService'));
  assert.ok(json.context);
  assert.strictEqual(json.context.serviceName, 'TestService');
  assert.strictEqual(json.context.nodeId, 'node-1');
  assert.ok(json.stack);
});

test('Error classes support cause chaining', () => {
  const cause = new Error('underlying error');
  const error = new DependencyError('TestService', 'testDep', {cause});

  assert.strictEqual(error.cause, cause);
  assert.strictEqual(error.toJSON().cause, 'underlying error');
});
