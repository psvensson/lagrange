/**
 * Unit tests for AddressManager.
 * Tests unique address generation, validation, and conflict detection.
 * Requirements: 1.5, 2.1, 7.1
 */

import {test} from 'tap';
import {AddressManager, AddressType} from '../../src/address/address-manager.js';

test('AddressManager', async (t) => {
  t.beforeEach(() => {
    AddressManager.resetInstance();
  });

  t.afterEach(() => {
    AddressManager.resetInstance();
  });

  t.test('singleton pattern', async (t) => {
    const instance1 = AddressManager.getInstance();
    const instance2 = AddressManager.getInstance();

    t.equal(instance1, instance2, 'should return the same instance');
  });

  t.test('generateNodeAddress', async (t) => {
    const manager = AddressManager.getInstance();

    const address = manager.generateNodeAddress();

    t.ok(address, 'should generate an address');
    t.ok(manager.validateAddress(address), 'should generate a valid UUID');
    t.equal(manager.getNodeAddressCount(), 1, 'should track the address');
  });

  t.test('generateServiceAddress', async (t) => {
    const manager = AddressManager.getInstance();
    const nodeAddress = manager.generateNodeAddress();

    const serviceAddress = manager.generateServiceAddress(nodeAddress);

    t.ok(serviceAddress, 'should generate an address');
    t.ok(manager.validateAddress(serviceAddress), 'should generate a valid UUID');
    t.equal(manager.getServiceAddressCount(), 1, 'should track the address');
  });

  t.test('validateAddress', async (t) => {
    const manager = AddressManager.getInstance();

    t.ok(
      manager.validateAddress('550e8400-e29b-41d4-a716-446655440000'),
      'should validate correct UUID',
    );
    t.notOk(manager.validateAddress('invalid'), 'should reject invalid string');
    t.notOk(manager.validateAddress(''), 'should reject empty string');
    t.notOk(manager.validateAddress(null), 'should reject null');
    t.notOk(manager.validateAddress(undefined), 'should reject undefined');
    t.notOk(manager.validateAddress(123), 'should reject number');
  });

  t.test('conflict detection', async (t) => {
    const manager = AddressManager.getInstance();

    const nodeAddr = manager.generateNodeAddress();
    const serviceAddr = manager.generateServiceAddress(nodeAddr);

    t.ok(manager.hasNodeAddressConflict(nodeAddr), 'should detect node conflict');
    t.ok(
      manager.hasServiceAddressConflict(serviceAddr),
      'should detect service conflict',
    );
    t.ok(manager.hasAddressConflict(nodeAddr), 'should detect any conflict');
    t.ok(manager.hasAddressConflict(serviceAddr), 'should detect any conflict');
    t.notOk(
      manager.hasAddressConflict('550e8400-e29b-41d4-a716-446655440000'),
      'should not detect conflict for new address',
    );
  });

  t.test('registerNodeAddress', async (t) => {
    const manager = AddressManager.getInstance();
    const validAddress = '550e8400-e29b-41d4-a716-446655440000';

    t.ok(manager.registerNodeAddress(validAddress), 'should register valid address');
    t.equal(manager.getNodeAddressCount(), 1, 'should track registered address');
    t.notOk(
      manager.registerNodeAddress(validAddress),
      'should reject duplicate address',
    );
    t.notOk(manager.registerNodeAddress('invalid'), 'should reject invalid address');
  });

  t.test('registerServiceAddress', async (t) => {
    const manager = AddressManager.getInstance();
    const validAddress = '550e8400-e29b-41d4-a716-446655440001';

    t.ok(
      manager.registerServiceAddress(validAddress),
      'should register valid address',
    );
    t.equal(manager.getServiceAddressCount(), 1, 'should track registered address');
    t.notOk(
      manager.registerServiceAddress(validAddress),
      'should reject duplicate address',
    );
  });

  t.test('cross-type conflict detection', async (t) => {
    const manager = AddressManager.getInstance();
    const address = '550e8400-e29b-41d4-a716-446655440002';

    t.ok(manager.registerNodeAddress(address), 'should register as node address');
    t.notOk(
      manager.registerServiceAddress(address),
      'should reject same address as service',
    );
  });

  t.test('unregisterNodeAddress', async (t) => {
    const manager = AddressManager.getInstance();
    const address = manager.generateNodeAddress();

    t.ok(manager.unregisterNodeAddress(address), 'should unregister existing');
    t.equal(manager.getNodeAddressCount(), 0, 'should remove from tracking');
    t.notOk(
      manager.unregisterNodeAddress(address),
      'should return false for non-existent',
    );
  });

  t.test('unregisterServiceAddress', async (t) => {
    const manager = AddressManager.getInstance();
    const nodeAddr = manager.generateNodeAddress();
    const serviceAddr = manager.generateServiceAddress(nodeAddr);

    t.ok(manager.unregisterServiceAddress(serviceAddr), 'should unregister existing');
    t.equal(manager.getServiceAddressCount(), 0, 'should remove from tracking');
  });

  t.test('getAllNodeAddresses', async (t) => {
    const manager = AddressManager.getInstance();
    const addr1 = manager.generateNodeAddress();
    const addr2 = manager.generateNodeAddress();

    const addresses = manager.getAllNodeAddresses();

    t.equal(addresses.length, 2, 'should return all addresses');
    t.ok(addresses.includes(addr1), 'should include first address');
    t.ok(addresses.includes(addr2), 'should include second address');
  });

  t.test('getAllServiceAddresses', async (t) => {
    const manager = AddressManager.getInstance();
    const nodeAddr = manager.generateNodeAddress();
    const svc1 = manager.generateServiceAddress(nodeAddr);
    const svc2 = manager.generateServiceAddress(nodeAddr);

    const addresses = manager.getAllServiceAddresses();

    t.equal(addresses.length, 2, 'should return all addresses');
    t.ok(addresses.includes(svc1), 'should include first address');
    t.ok(addresses.includes(svc2), 'should include second address');
  });

  t.test('clear', async (t) => {
    const manager = AddressManager.getInstance();
    manager.generateNodeAddress();
    manager.generateServiceAddress(manager.generateNodeAddress());

    manager.clear();

    t.equal(manager.getNodeAddressCount(), 0, 'should clear node addresses');
    t.equal(manager.getServiceAddressCount(), 0, 'should clear service addresses');
  });

  t.test('AddressType enum', async (t) => {
    t.equal(AddressType.NODE, 'node', 'should have NODE type');
    t.equal(AddressType.SERVICE, 'service', 'should have SERVICE type');
  });
});
