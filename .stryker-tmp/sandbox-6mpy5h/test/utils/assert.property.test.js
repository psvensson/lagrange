/**
 * Property-based tests for assertCritical utility.
 *
 * Feature: code-quality-improvements
 * Validates: Requirements 5.2, 5.3
 */
// @ts-nocheck


import test from 'node:test';
import assert from 'node:assert';
import fc from 'fast-check';
import {assertCritical, assertDefined} from '../../src/utils/assert.js';
import {BaseError} from '../../src/utils/base-error.js';

/**
 * Property 6: assertCritical Returns Value for Truthy Input
 * For any truthy value passed to assertCritical, the function SHALL return
 * that exact value unchanged.
 *
 * **Validates: Requirements 5.2**
 */
test('Property 6: assertCritical returns value for truthy input', () => {
  fc.assert(
    fc.property(
      fc.oneof(
        fc.string({minLength: 1}),
        fc.integer({min: 1}),
        fc.constant(true),
        fc.array(fc.anything(), {minLength: 1}),
        fc.dictionary(fc.string(), fc.anything(), {minKeys: 1}),
      ),
      (truthyValue) => {
        const result = assertCritical(truthyValue, 'should not throw');
        return result === truthyValue;
      },
    ),
    {numRuns: 10},
  );
});

/**
 * Property 7: assertCritical Throws for Falsy Input
 * For any falsy value (null, undefined, 0, '', false) passed to assertCritical
 * with a message, the function SHALL throw an error containing that message.
 *
 * **Validates: Requirements 5.3**
 */
test('Property 7: assertCritical throws for falsy input', () => {
  fc.assert(
    fc.property(
      fc.oneof(
        fc.constant(null),
        fc.constant(undefined),
        fc.constant(0),
        fc.constant(''),
        fc.constant(false),
      ),
      fc.string({minLength: 1}),
      (falsyValue, message) => {
        try {
          assertCritical(falsyValue, message);
          return false; // Should have thrown
        } catch (error) {
          return error.message === message && error.isCritical === true;
        }
      },
    ),
    {numRuns: 10},
  );
});

test('assertCritical - uses custom ErrorClass when provided', () => {
  class CustomError extends BaseError {}

  assert.throws(
    () => assertCritical(null, 'custom error', {ErrorClass: CustomError}),
    (error) => {
      return error instanceof CustomError &&
             error.message === 'custom error' &&
             error.isCritical === true;
    },
  );
});

test('assertCritical - passes context to error', () => {
  const context = {component: 'test', operation: 'validate'};

  assert.throws(
    () => assertCritical(null, 'with context', {
      ErrorClass: BaseError,
      context,
    }),
    (error) => {
      return error instanceof BaseError &&
             error.context === context &&
             error.context.component === 'test';
    },
  );
});

test('assertDefined - allows falsy values except null/undefined', () => {
  assert.strictEqual(assertDefined(0, 'should not throw'), 0);
  assert.strictEqual(assertDefined('', 'should not throw'), '');
  assert.strictEqual(assertDefined(false, 'should not throw'), false);
});

test('assertDefined - throws for null', () => {
  assert.throws(
    () => assertDefined(null, 'null not allowed'),
    (error) => error.message === 'null not allowed' && error.isCritical === true,
  );
});

test('assertDefined - throws for undefined', () => {
  assert.throws(
    () => assertDefined(undefined, 'undefined not allowed'),
    (error) => error.message === 'undefined not allowed' && error.isCritical === true,
  );
});
