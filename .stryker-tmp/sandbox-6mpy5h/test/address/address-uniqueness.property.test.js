/**
 * Property Test: Address Uniqueness
 * **Property 1: Address Uniqueness**
 * **Validates: Requirements 1.5, 2.1**
 *
 * *For any* set of nodes and services in the system, all assigned addresses
 * should be unique with no collisions.
 *
 * This property test verifies that:
 * 1. Generated node addresses are always unique
 * 2. Generated service addresses are always unique
 * 3. No collisions occur between node and service addresses
 * 4. Conflict detection correctly identifies duplicates
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {AddressManager} from '../../src/address/address-manager.js';

test('Property 1: Address Uniqueness', async (t) => {
  t.beforeEach(() => {
    AddressManager.resetInstance();
  });

  t.afterEach(() => {
    AddressManager.resetInstance();
  });

  /**
   * Property: For any number of generated node addresses, all addresses
   * should be unique with no duplicates.
   */
  t.test('generated node addresses are always unique', async (t) => {
    fc.assert(
      fc.property(
        fc.integer({min: 1, max: 100}),
        (count) => {
          AddressManager.resetInstance();
          const manager = AddressManager.getInstance();
          const addresses = new Set();

          for (let i = 0; i < count; i++) {
            const address = manager.generateNodeAddress();
            addresses.add(address);
          }

          // All addresses should be unique
          const result = addresses.size === count;
          AddressManager.resetInstance();
          return result;
        },
      ),
      {numRuns: 10},
    );

    t.pass('all generated node addresses are unique');
  });

  /**
   * Property: For any number of generated service addresses, all addresses
   * should be unique with no duplicates.
   */
  t.test('generated service addresses are always unique', async (t) => {
    fc.assert(
      fc.property(
        fc.integer({min: 1, max: 100}),
        (count) => {
          AddressManager.resetInstance();
          const manager = AddressManager.getInstance();
          const nodeAddress = manager.generateNodeAddress();
          const addresses = new Set();

          for (let i = 0; i < count; i++) {
            const address = manager.generateServiceAddress(nodeAddress);
            addresses.add(address);
          }

          // All addresses should be unique
          const result = addresses.size === count;
          AddressManager.resetInstance();
          return result;
        },
      ),
      {numRuns: 10},
    );

    t.pass('all generated service addresses are unique');
  });

  /**
   * Property: For any combination of node and service addresses,
   * there should be no collisions between the two types.
   */
  t.test('no collisions between node and service addresses', async (t) => {
    fc.assert(
      fc.property(
        fc.integer({min: 1, max: 50}),
        fc.integer({min: 1, max: 50}),
        (nodeCount, serviceCount) => {
          AddressManager.resetInstance();
          const manager = AddressManager.getInstance();
          const allAddresses = new Set();

          // Generate node addresses
          for (let i = 0; i < nodeCount; i++) {
            const address = manager.generateNodeAddress();
            allAddresses.add(address);
          }

          // Generate service addresses
          const nodeAddr = manager.getAllNodeAddresses()[0];
          for (let i = 0; i < serviceCount; i++) {
            const address = manager.generateServiceAddress(nodeAddr);
            allAddresses.add(address);
          }

          // Total unique addresses should equal sum of both counts
          const result = allAddresses.size === nodeCount + serviceCount;
          AddressManager.resetInstance();
          return result;
        },
      ),
      {numRuns: 10},
    );

    t.pass('no collisions between node and service addresses');
  });

  /**
   * Property: For any registered address, conflict detection should
   * correctly identify it as a duplicate.
   */
  t.test('conflict detection identifies registered addresses', async (t) => {
    fc.assert(
      fc.property(
        fc.integer({min: 1, max: 20}),
        fc.integer({min: 1, max: 20}),
        (nodeCount, serviceCount) => {
          AddressManager.resetInstance();
          const manager = AddressManager.getInstance();
          const nodeAddresses = [];
          const serviceAddresses = [];

          // Generate and track addresses
          for (let i = 0; i < nodeCount; i++) {
            nodeAddresses.push(manager.generateNodeAddress());
          }

          const nodeAddr = nodeAddresses[0];
          for (let i = 0; i < serviceCount; i++) {
            serviceAddresses.push(manager.generateServiceAddress(nodeAddr));
          }

          // Verify all node addresses are detected as conflicts
          const nodeConflictsDetected = nodeAddresses.every(
            (addr) => manager.hasNodeAddressConflict(addr),
          );

          // Verify all service addresses are detected as conflicts
          const serviceConflictsDetected = serviceAddresses.every(
            (addr) => manager.hasServiceAddressConflict(addr),
          );

          // Verify hasAddressConflict works for both types
          const allConflictsDetected = [...nodeAddresses, ...serviceAddresses].every(
            (addr) => manager.hasAddressConflict(addr),
          );

          const result = nodeConflictsDetected &&
                        serviceConflictsDetected &&
                        allConflictsDetected;
          AddressManager.resetInstance();
          return result;
        },
      ),
      {numRuns: 10},
    );

    t.pass('conflict detection correctly identifies all registered addresses');
  });

  /**
   * Property: For any valid UUID registered as a node address,
   * attempting to register it as a service address should fail.
   */
  t.test('cross-type registration prevents duplicates', async (t) => {
    fc.assert(
      fc.property(
        fc.uuid(),
        (uuid) => {
          AddressManager.resetInstance();
          const manager = AddressManager.getInstance();

          // Register as node address
          const nodeRegistered = manager.registerNodeAddress(uuid);

          // Attempt to register same as service address
          const serviceRegistered = manager.registerServiceAddress(uuid);

          // Node should succeed, service should fail
          const result = nodeRegistered === true && serviceRegistered === false;
          AddressManager.resetInstance();
          return result;
        },
      ),
      {numRuns: 10},
    );

    t.pass('cross-type registration correctly prevents duplicates');
  });

  /**
   * Property: For any sequence of address generations and unregistrations,
   * the address counts should remain consistent.
   */
  t.test('address counts remain consistent after operations', async (t) => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            fc.constant({type: 'generateNode'}),
            fc.constant({type: 'generateService'}),
            fc.constant({type: 'unregisterNode'}),
            fc.constant({type: 'unregisterService'}),
          ),
          {minLength: 1, maxLength: 50},
        ),
        (operations) => {
          AddressManager.resetInstance();
          const manager = AddressManager.getInstance();
          const nodeAddrs = [];
          const serviceAddrs = [];

          for (const op of operations) {
            switch (op.type) {
            case 'generateNode':
              nodeAddrs.push(manager.generateNodeAddress());
              break;
            case 'generateService':
              if (nodeAddrs.length > 0) {
                serviceAddrs.push(manager.generateServiceAddress(nodeAddrs[0]));
              }
              break;
            case 'unregisterNode':
              if (nodeAddrs.length > 0) {
                const addr = nodeAddrs.pop();
                manager.unregisterNodeAddress(addr);
              }
              break;
            case 'unregisterService':
              if (serviceAddrs.length > 0) {
                const addr = serviceAddrs.pop();
                manager.unregisterServiceAddress(addr);
              }
              break;
            }
          }

          // Counts should match tracked arrays
          const result = manager.getNodeAddressCount() === nodeAddrs.length &&
                        manager.getServiceAddressCount() === serviceAddrs.length;
          AddressManager.resetInstance();
          return result;
        },
      ),
      {numRuns: 10},
    );

    t.pass('address counts remain consistent after operations');
  });
});
