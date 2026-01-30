/**
 * Property Test: Address Round-Trip Consistency
 * **Property 1: Address Round-Trip Consistency**
 * **Validates: Requirements 1.5, 1.6, 1.7**
 *
 * Feature: simplified-cluster-architecture, Property 1: Address Round-Trip Consistency
 *
 * *For any* valid address components (nodeId, serviceType, serviceId),
 * formatting then parsing SHALL produce an equivalent structured object,
 * and parsing then formatting SHALL produce the original string.
 *
 * This property test verifies:
 * 1. format(nodeId, serviceType, serviceId) -> parse() produces equivalent object
 * 2. parse(address) -> format() produces the original string
 * 3. Round-trip consistency holds for all valid inputs
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {AddressManager} from '../../src/address/address-manager.js';

/**
 * Generator for valid address components.
 * Components must be non-empty strings without forward slashes.
 */
const validComponentArb = fc.string({minLength: 1, maxLength: 50})
  .filter((s) => !s.includes('/') && s.trim().length > 0);

test('Property 1: Address Round-Trip Consistency', async (t) => {
  t.beforeEach(() => {
    AddressManager.resetInstance();
  });

  t.afterEach(() => {
    AddressManager.resetInstance();
  });

  /**
   * Property: For any valid address components, formatting then parsing
   * SHALL produce an equivalent structured object.
   *
   * format(nodeId, serviceType, serviceId) -> parse() = {nodeId, serviceType, serviceId}
   */
  t.test('format then parse produces equivalent object', async (t) => {
    fc.assert(
      fc.property(
        validComponentArb,
        validComponentArb,
        validComponentArb,
        (nodeId, serviceType, serviceId) => {
          AddressManager.resetInstance();
          const manager = AddressManager.getInstance();

          // Format components into address string
          const formatted = manager.format(nodeId, serviceType, serviceId);

          // Parse the formatted string back to components
          const parsed = manager.parse(formatted);

          // Verify all components match
          const result = parsed.nodeId === nodeId &&
                        parsed.serviceType === serviceType &&
                        parsed.serviceId === serviceId;

          AddressManager.resetInstance();
          return result;
        },
      ),
      {numRuns: 10},
    );

    t.pass('format then parse produces equivalent object');
  });

  /**
   * Property: For any valid address string, parsing then formatting
   * SHALL produce the original string.
   *
   * parse(address) -> format(nodeId, serviceType, serviceId) = address
   */
  t.test('parse then format produces original string', async (t) => {
    fc.assert(
      fc.property(
        validComponentArb,
        validComponentArb,
        validComponentArb,
        (nodeId, serviceType, serviceId) => {
          AddressManager.resetInstance();
          const manager = AddressManager.getInstance();

          // Create a valid address string
          const originalAddress = `${nodeId}/${serviceType}/${serviceId}`;

          // Parse the address
          const parsed = manager.parse(originalAddress);

          // Format back to string
          const reformatted = manager.format(
            parsed.nodeId,
            parsed.serviceType,
            parsed.serviceId,
          );

          // Verify the reformatted string matches the original
          const result = reformatted === originalAddress;

          AddressManager.resetInstance();
          return result;
        },
      ),
      {numRuns: 10},
    );

    t.pass('parse then format produces original string');
  });

  /**
   * Property: Round-trip consistency holds for multiple iterations.
   * Applying format->parse->format or parse->format->parse multiple times
   * should always produce consistent results.
   */
  t.test('multiple round-trips maintain consistency', async (t) => {
    fc.assert(
      fc.property(
        validComponentArb,
        validComponentArb,
        validComponentArb,
        fc.integer({min: 1, max: 5}),
        (nodeId, serviceType, serviceId, iterations) => {
          AddressManager.resetInstance();
          const manager = AddressManager.getInstance();

          // Start with formatted address
          let address = manager.format(nodeId, serviceType, serviceId);
          const originalAddress = address;

          // Perform multiple round-trips
          for (let i = 0; i < iterations; i++) {
            const parsed = manager.parse(address);
            address = manager.format(
              parsed.nodeId,
              parsed.serviceType,
              parsed.serviceId,
            );
          }

          // After any number of round-trips, address should be unchanged
          const result = address === originalAddress;

          AddressManager.resetInstance();
          return result;
        },
      ),
      {numRuns: 10},
    );

    t.pass('multiple round-trips maintain consistency');
  });

  /**
   * Property: Helper methods (getNodeId, getServiceType, getServiceId)
   * return the same values as parse() for any valid address.
   */
  t.test('helper methods consistent with parse', async (t) => {
    fc.assert(
      fc.property(
        validComponentArb,
        validComponentArb,
        validComponentArb,
        (nodeId, serviceType, serviceId) => {
          AddressManager.resetInstance();
          const manager = AddressManager.getInstance();

          const address = manager.format(nodeId, serviceType, serviceId);
          const parsed = manager.parse(address);

          // Helper methods should return same values as parse
          const helperNodeId = manager.getNodeId(address);
          const helperServiceType = manager.getServiceType(address);
          const helperServiceId = manager.getServiceId(address);

          const result = helperNodeId === parsed.nodeId &&
                        helperServiceType === parsed.serviceType &&
                        helperServiceId === parsed.serviceId;

          AddressManager.resetInstance();
          return result;
        },
      ),
      {numRuns: 10},
    );

    t.pass('helper methods consistent with parse');
  });

  /**
   * Property: Formatted addresses always have exactly 3 components
   * separated by forward slashes.
   */
  t.test('formatted addresses have canonical structure', async (t) => {
    fc.assert(
      fc.property(
        validComponentArb,
        validComponentArb,
        validComponentArb,
        (nodeId, serviceType, serviceId) => {
          AddressManager.resetInstance();
          const manager = AddressManager.getInstance();

          const formatted = manager.format(nodeId, serviceType, serviceId);

          // Should have exactly 2 slashes (3 components)
          const slashCount = (formatted.match(/\//g) || []).length;

          // Should validate successfully
          const validation = manager.validate(formatted);

          const result = slashCount === 2 && validation.valid === true;

          AddressManager.resetInstance();
          return result;
        },
      ),
      {numRuns: 10},
    );

    t.pass('formatted addresses have canonical structure');
  });
});
