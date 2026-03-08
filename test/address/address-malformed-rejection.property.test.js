/**
 * Property Test: Malformed Address Rejection
 * **Property 2: Malformed Address Rejection**
 * **Validates: Requirements 1.2, 1.3**
 *
 * Feature: simplified-cluster-architecture, Property 2: Malformed Address Rejection
 *
 * *For any* string that does not contain exactly three slash-separated
 * non-empty components, the Address_Manager SHALL reject it with an error.
 *
 * This property test verifies:
 * 1. Addresses with fewer than 3 components are rejected
 * 2. Addresses with more than 3 components are rejected
 * 3. Addresses with empty components are rejected
 * 4. Non-string inputs are rejected
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {
  AddressManager,
  MalformedAddressError,
  EmptyComponentError,
} from '../../src/address/address-manager.js';

/**
 * Generator for non-empty strings without forward slashes.
 */
const nonEmptyNoSlashArb = fc.string({minLength: 1, maxLength: 50})
  .filter((s) => !s.includes('/') && s.trim().length > 0);

test('Property 2: Malformed Address Rejection', async (t) => {
  t.beforeEach(() => {
    AddressManager.resetInstance();
  });

  t.afterEach(() => {
    AddressManager.resetInstance();
  });

  /**
   * Property: Addresses with fewer than 3 components SHALL be rejected.
   * Tests addresses with 0, 1, or 2 slash-separated parts.
   */
  t.test('addresses with fewer than 3 components are rejected', async (t) => {
    fc.assert(
      fc.property(
        fc.integer({min: 0, max: 1}),
        fc.array(nonEmptyNoSlashArb, {minLength: 0, maxLength: 2}),
        (numSlashes, components) => {
          AddressManager.resetInstance();
          const manager = AddressManager.getInstance();

          // Build address with 0, 1, or 2 components
          const actualComponents = components.slice(0, numSlashes + 1);
          if (actualComponents.length === 0) {
            actualComponents.push('single');
          }

          // Ensure we have fewer than 3 components
          while (actualComponents.length >= 3) {
            actualComponents.pop();
          }

          const address = actualComponents.join('/');

          // parse() should throw MalformedAddressError
          let parseThrew = false;
          try {
            manager.parse(address);
          } catch (e) {
            parseThrew = e instanceof MalformedAddressError;
          }

          // validate() should return {valid: false}
          const validation = manager.validate(address);
          const validateFailed = validation.valid === false &&
            typeof validation.error === 'string';

          AddressManager.resetInstance();
          return parseThrew && validateFailed;
        },
      ),
      {numRuns: 10},
    );

    t.pass('addresses with fewer than 3 components are rejected');
  });

  /**
   * Property: Addresses with more than 3 components SHALL be rejected.
   * Tests addresses with 4 or more slash-separated parts.
   */
  t.test('addresses with more than 3 components are rejected', async (t) => {
    fc.assert(
      fc.property(
        fc.integer({min: 4, max: 8}),
        fc.array(nonEmptyNoSlashArb, {minLength: 4, maxLength: 8}),
        (numComponents, components) => {
          AddressManager.resetInstance();
          const manager = AddressManager.getInstance();

          // Ensure we have at least 4 components
          const actualComponents = components.slice(0, numComponents);
          while (actualComponents.length < 4) {
            actualComponents.push('extra');
          }

          const address = actualComponents.join('/');

          // parse() should throw MalformedAddressError
          let parseThrew = false;
          try {
            manager.parse(address);
          } catch (e) {
            parseThrew = e instanceof MalformedAddressError;
          }

          // validate() should return {valid: false}
          const validation = manager.validate(address);
          const validateFailed = validation.valid === false &&
            typeof validation.error === 'string';

          AddressManager.resetInstance();
          return parseThrew && validateFailed;
        },
      ),
      {numRuns: 10},
    );

    t.pass('addresses with more than 3 components are rejected');
  });

  /**
   * Property: Addresses with empty first component (nodeId) SHALL be rejected.
   */
  t.test('addresses with empty nodeId are rejected', async (t) => {
    fc.assert(
      fc.property(
        nonEmptyNoSlashArb,
        nonEmptyNoSlashArb,
        (serviceType, serviceId) => {
          AddressManager.resetInstance();
          const manager = AddressManager.getInstance();

          // Create address with empty nodeId
          const address = `/${serviceType}/${serviceId}`;

          // parse() should throw EmptyComponentError
          let parseThrew = false;
          try {
            manager.parse(address);
          } catch (e) {
            parseThrew = e instanceof EmptyComponentError;
          }

          // validate() should return {valid: false}
          const validation = manager.validate(address);
          const validateFailed = validation.valid === false &&
            typeof validation.error === 'string';

          AddressManager.resetInstance();
          return parseThrew && validateFailed;
        },
      ),
      {numRuns: 10},
    );

    t.pass('addresses with empty nodeId are rejected');
  });

  /**
   * Property: Addresses with empty second component (serviceType) SHALL be rejected.
   */
  t.test('addresses with empty serviceType are rejected', async (t) => {
    fc.assert(
      fc.property(
        nonEmptyNoSlashArb,
        nonEmptyNoSlashArb,
        (nodeId, serviceId) => {
          AddressManager.resetInstance();
          const manager = AddressManager.getInstance();

          // Create address with empty serviceType
          const address = `${nodeId}//${serviceId}`;

          // parse() should throw EmptyComponentError
          let parseThrew = false;
          try {
            manager.parse(address);
          } catch (e) {
            parseThrew = e instanceof EmptyComponentError;
          }

          // validate() should return {valid: false}
          const validation = manager.validate(address);
          const validateFailed = validation.valid === false &&
            typeof validation.error === 'string';

          AddressManager.resetInstance();
          return parseThrew && validateFailed;
        },
      ),
      {numRuns: 10},
    );

    t.pass('addresses with empty serviceType are rejected');
  });

  /**
   * Property: Addresses with empty third component (serviceId) SHALL be rejected.
   */
  t.test('addresses with empty serviceId are rejected', async (t) => {
    fc.assert(
      fc.property(
        nonEmptyNoSlashArb,
        nonEmptyNoSlashArb,
        (nodeId, serviceType) => {
          AddressManager.resetInstance();
          const manager = AddressManager.getInstance();

          // Create address with empty serviceId
          const address = `${nodeId}/${serviceType}/`;

          // parse() should throw EmptyComponentError
          let parseThrew = false;
          try {
            manager.parse(address);
          } catch (e) {
            parseThrew = e instanceof EmptyComponentError;
          }

          // validate() should return {valid: false}
          const validation = manager.validate(address);
          const validateFailed = validation.valid === false &&
            typeof validation.error === 'string';

          AddressManager.resetInstance();
          return parseThrew && validateFailed;
        },
      ),
      {numRuns: 10},
    );

    t.pass('addresses with empty serviceId are rejected');
  });

  /**
   * Property: Non-string inputs SHALL be rejected.
   */
  t.test('non-string inputs are rejected', async (t) => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.integer(),
          fc.boolean(),
          fc.constant(null),
          fc.constant(undefined),
          fc.array(fc.string()),
          fc.object(),
        ),
        (nonStringInput) => {
          AddressManager.resetInstance();
          const manager = AddressManager.getInstance();

          // parse() should reject non-string values. Some exotic objects can
          // throw TypeError during String() coercion, which still satisfies
          // the rejection contract.
          let parseThrew = false;
          try {
            manager.parse(nonStringInput);
          } catch (_e) {
            parseThrew = true;
          }

          // validate() should return {valid: false}
          const validation = manager.validate(nonStringInput);
          const validateFailed = validation.valid === false &&
            typeof validation.error === 'string';

          AddressManager.resetInstance();
          return parseThrew && validateFailed;
        },
      ),
      {numRuns: 10},
    );

    t.pass('non-string inputs are rejected');
  });

  /**
   * Property: Addresses that are just slashes SHALL be rejected.
   * Tests edge cases like '/', '//', '///', etc.
   */
  t.test('slash-only addresses are rejected', async (t) => {
    fc.assert(
      fc.property(
        fc.integer({min: 1, max: 10}),
        (numSlashes) => {
          AddressManager.resetInstance();
          const manager = AddressManager.getInstance();

          // Create address with only slashes
          const address = '/'.repeat(numSlashes);

          // parse() should throw an error
          let parseThrew = false;
          try {
            manager.parse(address);
          } catch (e) {
            parseThrew = e instanceof MalformedAddressError ||
              e instanceof EmptyComponentError;
          }

          // validate() should return {valid: false}
          const validation = manager.validate(address);
          const validateFailed = validation.valid === false;

          AddressManager.resetInstance();
          return parseThrew && validateFailed;
        },
      ),
      {numRuns: 10},
    );

    t.pass('slash-only addresses are rejected');
  });

  /**
   * Property: Empty string SHALL be rejected.
   */
  t.test('empty string is rejected', async (t) => {
    AddressManager.resetInstance();
    const manager = AddressManager.getInstance();

    // parse() should throw MalformedAddressError
    let parseThrew = false;
    try {
      manager.parse('');
    } catch (e) {
      parseThrew = e instanceof MalformedAddressError;
    }

    // validate() should return {valid: false}
    const validation = manager.validate('');
    const validateFailed = validation.valid === false &&
      typeof validation.error === 'string';

    t.ok(parseThrew, 'parse() throws MalformedAddressError for empty string');
    t.ok(validateFailed, 'validate() returns {valid: false} for empty string');

    AddressManager.resetInstance();
  });

  /**
   * Property: Addresses with multiple consecutive slashes SHALL be rejected
   * (as they create empty components).
   */
  t.test('addresses with consecutive slashes are rejected', async (t) => {
    fc.assert(
      fc.property(
        nonEmptyNoSlashArb,
        nonEmptyNoSlashArb,
        nonEmptyNoSlashArb,
        fc.integer({min: 2, max: 5}),
        fc.integer({min: 0, max: 1}),
        (comp1, comp2, comp3, numSlashes, position) => {
          AddressManager.resetInstance();
          const manager = AddressManager.getInstance();

          // Create address with consecutive slashes at different positions
          const slashes = '/'.repeat(numSlashes);
          let address;
          if (position === 0) {
            address = `${comp1}${slashes}${comp2}/${comp3}`;
          } else {
            address = `${comp1}/${comp2}${slashes}${comp3}`;
          }

          // parse() should throw an error (either Malformed or EmptyComponent)
          let parseThrew = false;
          try {
            manager.parse(address);
          } catch (e) {
            parseThrew = e instanceof MalformedAddressError ||
              e instanceof EmptyComponentError;
          }

          // validate() should return {valid: false}
          const validation = manager.validate(address);
          const validateFailed = validation.valid === false;

          AddressManager.resetInstance();
          return parseThrew && validateFailed;
        },
      ),
      {numRuns: 10},
    );

    t.pass('addresses with consecutive slashes are rejected');
  });
});
