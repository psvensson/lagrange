/**
 * Unit tests for AddressManager.
 * Tests unique address generation, validation, and conflict detection.
 * Also tests unified address parsing, formatting, and validation.
 * Requirements: 1.1, 1.2, 1.3, 1.5, 1.6, 2.1, 7.1
 */

import {test} from 'tap';
import {
  AddressManager,
  AddressType,
  MalformedAddressError,
  EmptyComponentError,
} from '../../src/address/address-manager.js';

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

  // ============================================================
  // Unified Address Tests (format: {nodeId}/{serviceType}/{serviceId})
  // Requirements: 1.1, 1.2, 1.3, 1.5, 1.6
  // ============================================================

  t.test('parse - valid addresses', async (t) => {
    const manager = AddressManager.getInstance();

    const result1 = manager.parse('node1/partition/tables-p1-r1');
    t.same(result1, {
      nodeId: 'node1',
      serviceType: 'partition',
      serviceId: 'tables-p1-r1',
    }, 'should parse partition address');

    const result2 = manager.parse('node2/message-group/mg-1');
    t.same(result2, {
      nodeId: 'node2',
      serviceType: 'message-group',
      serviceId: 'mg-1',
    }, 'should parse message-group address');

    const result3 = manager.parse('node1/raft/tables-p1');
    t.same(result3, {
      nodeId: 'node1',
      serviceType: 'raft',
      serviceId: 'tables-p1',
    }, 'should parse raft address');
  });

  t.test('parse - addresses with special characters', async (t) => {
    const manager = AddressManager.getInstance();

    const result = manager.parse('node-with-dashes/service_type/id.with.dots');
    t.same(result, {
      nodeId: 'node-with-dashes',
      serviceType: 'service_type',
      serviceId: 'id.with.dots',
    }, 'should handle special characters in components');
  });

  t.test('parse - malformed addresses', async (t) => {
    const manager = AddressManager.getInstance();

    t.throws(
      () => manager.parse('node1/partition'),
      MalformedAddressError,
      'should throw for address with only 2 components',
    );

    t.throws(
      () => manager.parse('node1'),
      MalformedAddressError,
      'should throw for address with only 1 component',
    );

    t.throws(
      () => manager.parse(''),
      MalformedAddressError,
      'should throw for empty string',
    );

    t.throws(
      () => manager.parse('a/b/c/d'),
      MalformedAddressError,
      'should throw for address with 4 components',
    );

    t.throws(
      () => manager.parse(null),
      MalformedAddressError,
      'should throw for null',
    );

    t.throws(
      () => manager.parse(123),
      MalformedAddressError,
      'should throw for non-string',
    );
  });

  t.test('parse - empty components', async (t) => {
    const manager = AddressManager.getInstance();

    t.throws(
      () => manager.parse('/partition/service1'),
      EmptyComponentError,
      'should throw for empty nodeId',
    );

    t.throws(
      () => manager.parse('node1//service1'),
      EmptyComponentError,
      'should throw for empty serviceType',
    );

    t.throws(
      () => manager.parse('node1/partition/'),
      EmptyComponentError,
      'should throw for empty serviceId',
    );
  });

  t.test('format - valid components', async (t) => {
    const manager = AddressManager.getInstance();

    t.equal(
      manager.format('node1', 'partition', 'tables-p1-r1'),
      'node1/partition/tables-p1-r1',
      'should format partition address',
    );

    t.equal(
      manager.format('node2', 'message-group', 'mg-1'),
      'node2/message-group/mg-1',
      'should format message-group address',
    );

    t.equal(
      manager.format('node-1', 'raft', 'tables-p1'),
      'node-1/raft/tables-p1',
      'should format raft address',
    );
  });

  t.test('format - empty components', async (t) => {
    const manager = AddressManager.getInstance();

    t.throws(
      () => manager.format('', 'partition', 'service1'),
      EmptyComponentError,
      'should throw for empty nodeId',
    );

    t.throws(
      () => manager.format('node1', '', 'service1'),
      EmptyComponentError,
      'should throw for empty serviceType',
    );

    t.throws(
      () => manager.format('node1', 'partition', ''),
      EmptyComponentError,
      'should throw for empty serviceId',
    );

    t.throws(
      () => manager.format(null, 'partition', 'service1'),
      EmptyComponentError,
      'should throw for null nodeId',
    );
  });

  t.test('validate - valid addresses', async (t) => {
    const manager = AddressManager.getInstance();

    t.same(
      manager.validate('node1/partition/tables-p1-r1'),
      {valid: true},
      'should validate partition address',
    );

    t.same(
      manager.validate('node2/message-group/mg-1'),
      {valid: true},
      'should validate message-group address',
    );

    t.same(
      manager.validate('a/b/c'),
      {valid: true},
      'should validate minimal address',
    );
  });

  t.test('validate - invalid addresses', async (t) => {
    const manager = AddressManager.getInstance();

    let result = manager.validate('node1/partition');
    t.equal(result.valid, false, 'should be invalid for 2 components');
    t.ok(result.error, 'should have error message');

    result = manager.validate('node1');
    t.equal(result.valid, false, 'should be invalid for 1 component');

    result = manager.validate('');
    t.equal(result.valid, false, 'should be invalid for empty string');

    result = manager.validate('a/b/c/d');
    t.equal(result.valid, false, 'should be invalid for 4 components');

    result = manager.validate(null);
    t.equal(result.valid, false, 'should be invalid for null');
    t.ok(result.error.includes('string'), 'should mention string in error');

    result = manager.validate(123);
    t.equal(result.valid, false, 'should be invalid for number');
  });

  t.test('validate - empty components', async (t) => {
    const manager = AddressManager.getInstance();

    let result = manager.validate('/partition/service1');
    t.equal(result.valid, false, 'should be invalid for empty nodeId');
    t.ok(result.error.includes('nodeId'), 'should mention nodeId in error');

    result = manager.validate('node1//service1');
    t.equal(result.valid, false, 'should be invalid for empty serviceType');
    t.ok(result.error.includes('serviceType'), 'should mention serviceType');

    result = manager.validate('node1/partition/');
    t.equal(result.valid, false, 'should be invalid for empty serviceId');
    t.ok(result.error.includes('serviceId'), 'should mention serviceId');
  });

  t.test('getNodeId - extracts nodeId', async (t) => {
    const manager = AddressManager.getInstance();

    t.equal(
      manager.getNodeId('node1/partition/tables-p1-r1'),
      'node1',
      'should extract nodeId',
    );

    t.equal(
      manager.getNodeId('node-with-dashes/raft/service1'),
      'node-with-dashes',
      'should extract nodeId with dashes',
    );

    t.throws(
      () => manager.getNodeId('invalid'),
      MalformedAddressError,
      'should throw for invalid address',
    );
  });

  t.test('getServiceType - extracts serviceType', async (t) => {
    const manager = AddressManager.getInstance();

    t.equal(
      manager.getServiceType('node1/partition/tables-p1-r1'),
      'partition',
      'should extract serviceType',
    );

    t.equal(
      manager.getServiceType('node1/message-group/mg-1'),
      'message-group',
      'should extract serviceType with dashes',
    );

    t.throws(
      () => manager.getServiceType('invalid'),
      MalformedAddressError,
      'should throw for invalid address',
    );
  });

  t.test('getServiceId - extracts serviceId', async (t) => {
    const manager = AddressManager.getInstance();

    t.equal(
      manager.getServiceId('node1/partition/tables-p1-r1'),
      'tables-p1-r1',
      'should extract serviceId',
    );

    t.equal(
      manager.getServiceId('node1/raft/tables-p1'),
      'tables-p1',
      'should extract serviceId',
    );

    t.throws(
      () => manager.getServiceId('invalid'),
      MalformedAddressError,
      'should throw for invalid address',
    );
  });

  t.test('round-trip: format then parse', async (t) => {
    const manager = AddressManager.getInstance();

    const nodeId = 'node1';
    const serviceType = 'partition';
    const serviceId = 'tables-p1-r1';

    const formatted = manager.format(nodeId, serviceType, serviceId);
    const parsed = manager.parse(formatted);

    t.equal(parsed.nodeId, nodeId, 'nodeId should round-trip');
    t.equal(parsed.serviceType, serviceType, 'serviceType should round-trip');
    t.equal(parsed.serviceId, serviceId, 'serviceId should round-trip');
  });

  t.test('round-trip: parse then format', async (t) => {
    const manager = AddressManager.getInstance();

    const address = 'node1/partition/tables-p1-r1';
    const parsed = manager.parse(address);
    const formatted = manager.format(
      parsed.nodeId,
      parsed.serviceType,
      parsed.serviceId,
    );

    t.equal(formatted, address, 'address should round-trip');
  });

  t.test('error classes', async (t) => {
    const malformedError = new MalformedAddressError('test message', 'bad-addr');
    t.equal(malformedError.name, 'MalformedAddressError', 'should have name');
    t.equal(malformedError.address, 'bad-addr', 'should store address');
    t.equal(malformedError.message, 'test message', 'should store message');

    const emptyError = new EmptyComponentError('nodeId', 'addr');
    t.equal(emptyError.name, 'EmptyComponentError', 'should have name');
    t.equal(emptyError.component, 'nodeId', 'should store component');
    t.equal(emptyError.address, 'addr', 'should store address');
    t.ok(emptyError.message.includes('nodeId'), 'should mention component');
  });
});
