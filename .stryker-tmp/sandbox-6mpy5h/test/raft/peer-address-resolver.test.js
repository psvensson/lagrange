/**
 * Unit tests for PeerAddressResolver.
 * Validates constructor validation, unified address resolution,
 * peerAddresses array search, systemTableCache lookup, and error handling.
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import {PeerAddressResolver} from '../../src/raft/peer-address-resolver.js';
import {
  PEER_ADDRESS_RESOLVER_ADDRESS,
  PEER_ADDRESS_RESOLVER_ERROR_MSG,
} from '../../src/raft/peer-address-resolver-constants.js';
import {ENTITY_TYPE} from '../../src/constants/index.js';
import {TABLES} from '../../src/constants/tables.js';

const SEPARATOR = PEER_ADDRESS_RESOLVER_ADDRESS.SEPARATOR;

/**
 * Create an AddressManager-compatible mock using separator-based logic.
 * @return {Object} AddressManager-compatible object.
 */
function createAddressManager() {
  return {
    validate(address) {
      if (typeof address !== 'string') {
        return {valid: false, error: 'Address must be a string'};
      }
      const parts = address.split(SEPARATOR);
      const expectedParts = 3;
      if (parts.length !== expectedParts) {
        return {
          valid: false,
          error: `Expected 3 parts, got ${parts.length}`,
        };
      }
      const [nodeId, serviceType, serviceId] = parts;
      if (!nodeId || !serviceType || !serviceId) {
        return {valid: false, error: 'Empty component'};
      }
      return {valid: true};
    },
    parse(address) {
      const parts = address.split(SEPARATOR);
      return {
        nodeId: parts[0],
        serviceType: parts[1],
        serviceId: parts[2],
      };
    },
    format(nodeId, serviceType, serviceId) {
      return `${nodeId}${SEPARATOR}${serviceType}${SEPARATOR}${serviceId}`;
    },
  };
}

/**
 * Create a silent logger for tests.
 * @return {Object} Logger with no-op methods.
 */
function createSilentLogger() {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  };
}

/**
 * Create a systemTableCache mock that returns a service entry for a peerId.
 * @param {string} peerId - The peer ID to match.
 * @param {string} nodeId - The node ID to return.
 * @return {Object} SystemTableCache-compatible mock.
 */
function createCacheWithService(peerId, nodeId) {
  return {
    get(tableName, key) {
      if (tableName === TABLES.SERVICES && key === peerId) {
        return {node_id: nodeId};
      }
      return null;
    },
  };
}

/**
 * Create a systemTableCache mock that always returns null.
 * @return {Object} SystemTableCache-compatible mock.
 */
function createEmptyCache() {
  return {
    get() {
      return null;
    },
  };
}

// ============================================================
// Constructor Tests (Requirement 3.1)
// ============================================================

test('PeerAddressResolver constructor stores addressManager',
  async (t) => {
    const addressManager = createAddressManager();
    const resolver = new PeerAddressResolver({
      addressManager,
      systemTableCache: createEmptyCache(),
      entityType: ENTITY_TYPE.PARTITION,
      logger: createSilentLogger(),
    });

    t.equal(
      resolver.addressManager, addressManager,
      'should store addressManager',
    );
  });

test('PeerAddressResolver constructor stores systemTableCache',
  async (t) => {
    const cache = createEmptyCache();
    const resolver = new PeerAddressResolver({
      addressManager: createAddressManager(),
      systemTableCache: cache,
      entityType: ENTITY_TYPE.PARTITION,
      logger: createSilentLogger(),
    });

    t.equal(
      resolver.systemTableCache, cache,
      'should store systemTableCache',
    );
  });

test('PeerAddressResolver constructor stores entityType',
  async (t) => {
    const resolver = new PeerAddressResolver({
      addressManager: createAddressManager(),
      systemTableCache: createEmptyCache(),
      entityType: ENTITY_TYPE.MESSAGE_GROUP,
      logger: createSilentLogger(),
    });

    t.equal(
      resolver.entityType, ENTITY_TYPE.MESSAGE_GROUP,
      'should store entityType',
    );
  });

test('PeerAddressResolver constructor stores provided logger',
  async (t) => {
    const logger = createSilentLogger();
    const resolver = new PeerAddressResolver({
      addressManager: createAddressManager(),
      systemTableCache: createEmptyCache(),
      entityType: ENTITY_TYPE.PARTITION,
      logger,
    });

    t.equal(resolver.logger, logger, 'should store provided logger');
  });

test('PeerAddressResolver constructor defaults logger to console',
  async (t) => {
    const resolver = new PeerAddressResolver({
      addressManager: createAddressManager(),
      systemTableCache: createEmptyCache(),
      entityType: ENTITY_TYPE.PARTITION,
    });

    t.equal(resolver.logger, console, 'should default logger to console');
  });

// ============================================================
// Resolve: Unified Address Path (Requirement 3.2)
// ============================================================

test('resolve returns already-unified address as-is',
  async (t) => {
    const resolver = new PeerAddressResolver({
      addressManager: createAddressManager(),
      systemTableCache: createEmptyCache(),
      entityType: ENTITY_TYPE.PARTITION,
      logger: createSilentLogger(),
    });

    const unifiedAddress = 'node-1/partition/replica-1';
    const result = resolver.resolve(unifiedAddress);

    t.equal(result, unifiedAddress, 'should return unified address as-is');
  });

test('resolve with invalid unified address throws',
  async (t) => {
    const addressManager = createAddressManager();
    // Override validate to reject a specific address
    const originalValidate = addressManager.validate;
    addressManager.validate = (address) => {
      if (address === 'bad/format/too/many') {
        return {valid: false, error: 'Expected 3 parts, got 4'};
      }
      return originalValidate.call(addressManager, address);
    };

    const resolver = new PeerAddressResolver({
      addressManager,
      systemTableCache: createEmptyCache(),
      entityType: ENTITY_TYPE.PARTITION,
      logger: createSilentLogger(),
    });

    t.throws(
      () => resolver.resolve('bad/format/too/many'),
      {
        message: PEER_ADDRESS_RESOLVER_ERROR_MSG
          .peerAddressNotUnified('bad/format/too/many'),
      },
      'should throw for invalid unified address',
    );
  });

test('resolve with unified address containing empty component throws',
  async (t) => {
    const resolver = new PeerAddressResolver({
      addressManager: createAddressManager(),
      systemTableCache: createEmptyCache(),
      entityType: ENTITY_TYPE.PARTITION,
      logger: createSilentLogger(),
    });

    // Address with empty component: 'node-1//replica-1'
    t.throws(
      () => resolver.resolve('node-1//replica-1'),
      {
        message: PEER_ADDRESS_RESOLVER_ERROR_MSG
          .peerAddressNotUnified('node-1//replica-1'),
      },
      'should throw for unified address with empty component',
    );
  });

// ============================================================
// Resolve: peerAddresses Array Path (Requirement 3.3)
// ============================================================

test('resolve finds peer in peerAddresses array',
  async (t) => {
    const resolver = new PeerAddressResolver({
      addressManager: createAddressManager(),
      systemTableCache: createEmptyCache(),
      entityType: ENTITY_TYPE.PARTITION,
      logger: createSilentLogger(),
    });

    const peerAddresses = [
      'node-2/partition/replica-2',
      'node-3/partition/replica-3',
    ];

    const result = resolver.resolve('replica-2', peerAddresses);

    t.equal(
      result, 'node-2/partition/replica-2',
      'should return matching address from peerAddresses',
    );
  });

test('resolve finds correct peer among multiple peerAddresses',
  async (t) => {
    const resolver = new PeerAddressResolver({
      addressManager: createAddressManager(),
      systemTableCache: createEmptyCache(),
      entityType: ENTITY_TYPE.PARTITION,
      logger: createSilentLogger(),
    });

    const peerAddresses = [
      'node-1/partition/replica-1',
      'node-2/partition/replica-2',
      'node-3/partition/replica-3',
    ];

    const result = resolver.resolve('replica-3', peerAddresses);

    t.equal(
      result, 'node-3/partition/replica-3',
      'should return the correct matching address',
    );
  });

test('resolve throws for invalid entry in peerAddresses array',
  async (t) => {
    const resolver = new PeerAddressResolver({
      addressManager: createAddressManager(),
      systemTableCache: createEmptyCache(),
      entityType: ENTITY_TYPE.PARTITION,
      logger: createSilentLogger(),
    });

    const peerAddresses = ['not-a-valid-address'];

    t.throws(
      () => resolver.resolve('replica-1', peerAddresses),
      {
        message: PEER_ADDRESS_RESOLVER_ERROR_MSG
          .peerAddressNotUnified('not-a-valid-address'),
      },
      'should throw for invalid peerAddresses entry',
    );
  });

// ============================================================
// Resolve: systemTableCache Path (Requirement 3.4)
// ============================================================

test('resolve falls back to systemTableCache lookup',
  async (t) => {
    const resolver = new PeerAddressResolver({
      addressManager: createAddressManager(),
      systemTableCache: createCacheWithService('replica-5', 'node-5'),
      entityType: ENTITY_TYPE.PARTITION,
      logger: createSilentLogger(),
    });

    const result = resolver.resolve('replica-5');

    t.equal(
      result, 'node-5/partition/replica-5',
      'should construct address from cache lookup',
    );
  });

test('resolve uses cache when peerAddresses has no match',
  async (t) => {
    const resolver = new PeerAddressResolver({
      addressManager: createAddressManager(),
      systemTableCache: createCacheWithService('replica-4', 'node-4'),
      entityType: ENTITY_TYPE.MESSAGE_GROUP,
      logger: createSilentLogger(),
    });

    const peerAddresses = [
      'node-2/message-group/replica-2',
    ];

    const result = resolver.resolve('replica-4', peerAddresses);

    t.equal(
      result, 'node-4/message-group/replica-4',
      'should fall back to cache when not in peerAddresses',
    );
  });

test('resolve uses entityType from constructor in cache path',
  async (t) => {
    const resolver = new PeerAddressResolver({
      addressManager: createAddressManager(),
      systemTableCache: createCacheWithService('replica-1', 'node-1'),
      entityType: ENTITY_TYPE.MESSAGE_GROUP,
      logger: createSilentLogger(),
    });

    const result = resolver.resolve('replica-1');

    t.equal(
      result, 'node-1/message-group/replica-1',
      'should use entityType from constructor',
    );
  });

// ============================================================
// Resolve: Unknown Peer Error (Requirement 3.5)
// ============================================================

test('resolve throws for unknown peer with descriptive message',
  async (t) => {
    const resolver = new PeerAddressResolver({
      addressManager: createAddressManager(),
      systemTableCache: createEmptyCache(),
      entityType: ENTITY_TYPE.PARTITION,
      logger: createSilentLogger(),
    });

    t.throws(
      () => resolver.resolve('unknown-replica', []),
      {
        message: PEER_ADDRESS_RESOLVER_ERROR_MSG
          .peerAddressUnresolved('unknown-replica'),
      },
      'should throw with descriptive message including peerId',
    );
  });

test('resolve throws for unknown peer without peerAddresses',
  async (t) => {
    const resolver = new PeerAddressResolver({
      addressManager: createAddressManager(),
      systemTableCache: createEmptyCache(),
      entityType: ENTITY_TYPE.PARTITION,
      logger: createSilentLogger(),
    });

    t.throws(
      () => resolver.resolve('missing-peer'),
      {
        message: PEER_ADDRESS_RESOLVER_ERROR_MSG
          .peerAddressUnresolved('missing-peer'),
      },
      'should throw when no peerAddresses provided and cache empty',
    );
  });

test('resolve throws when cache returns service without node_id',
  async (t) => {
    const cacheWithoutNodeId = {
      get(tableName, key) {
        if (tableName === TABLES.SERVICES && key === 'replica-x') {
          return {name: 'some-service'};
        }
        return null;
      },
    };

    const resolver = new PeerAddressResolver({
      addressManager: createAddressManager(),
      systemTableCache: cacheWithoutNodeId,
      entityType: ENTITY_TYPE.PARTITION,
      logger: createSilentLogger(),
    });

    t.throws(
      () => resolver.resolve('replica-x', []),
      {
        message: PEER_ADDRESS_RESOLVER_ERROR_MSG
          .peerAddressUnresolved('replica-x'),
      },
      'should throw when cache entry has no node_id',
    );
  });

// ============================================================
// Resolution Priority Tests
// ============================================================

test('resolve prefers unified format over peerAddresses',
  async (t) => {
    const resolver = new PeerAddressResolver({
      addressManager: createAddressManager(),
      systemTableCache: createEmptyCache(),
      entityType: ENTITY_TYPE.PARTITION,
      logger: createSilentLogger(),
    });

    const peerAddresses = [
      'node-99/partition/different-replica',
    ];

    // Pass a unified address as peerId — should return as-is
    const result = resolver.resolve(
      'node-1/partition/replica-1', peerAddresses,
    );

    t.equal(
      result, 'node-1/partition/replica-1',
      'should return unified address without checking peerAddresses',
    );
  });

test('resolve prefers peerAddresses over cache',
  async (t) => {
    const resolver = new PeerAddressResolver({
      addressManager: createAddressManager(),
      systemTableCache: createCacheWithService('replica-1', 'cache-node'),
      entityType: ENTITY_TYPE.PARTITION,
      logger: createSilentLogger(),
    });

    const peerAddresses = [
      'list-node/partition/replica-1',
    ];

    const result = resolver.resolve('replica-1', peerAddresses);

    t.equal(
      result, 'list-node/partition/replica-1',
      'should prefer peerAddresses over cache',
    );
  });
