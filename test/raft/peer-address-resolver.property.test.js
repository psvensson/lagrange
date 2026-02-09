/**
 * Property-based tests for PeerAddressResolver.
 * Validates address resolution across unified format, peerAddresses array,
 * and systemTableCache lookup paths.
 *
 * Feature: raft-architecture-consolidation
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {PeerAddressResolver} from '../../src/raft/peer-address-resolver.js';
import {
  PEER_ADDRESS_RESOLVER_ADDRESS,
} from '../../src/raft/peer-address-resolver-constants.js';
import {ENTITY_TYPE} from '../../src/constants/index.js';
import {TABLES} from '../../src/constants/tables.js';

const SEPARATOR = PEER_ADDRESS_RESOLVER_ADDRESS.SEPARATOR;

/**
 * Valid entity types from the system constants.
 */
const VALID_ENTITY_TYPES = [
  ENTITY_TYPE.BOOTSTRAP,
  ENTITY_TYPE.MESSAGE_GROUP,
  ENTITY_TYPE.PARTITION,
  ENTITY_TYPE.LIFECYCLE,
  ENTITY_TYPE.SERVICE,
];

/**
 * Arbitrary for generating valid node IDs (alphanumeric, 1-20 chars).
 */
const nodeIdArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,19}$/);

/**
 * Arbitrary for generating valid service IDs (alphanumeric with hyphens).
 */
const serviceIdArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9-]{0,19}$/);

/**
 * Arbitrary for generating valid entity types.
 */
const entityTypeArb = fc.constantFrom(...VALID_ENTITY_TYPES);

/**
 * Arbitrary for generating a valid unified address record.
 */
const unifiedAddressPartsArb = fc.record({
  nodeId: nodeIdArb,
  entityType: entityTypeArb,
  serviceId: serviceIdArb,
});

/**
 * Create a real AddressManager-compatible mock that uses the same
 * separator-based logic as the real AddressManager.
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
        return {valid: false, error: `Expected 3 parts, got ${parts.length}`};
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

// Feature: raft-architecture-consolidation, Property 6:
//   PeerAddressResolver unified address idempotence
/**
 * Property 6: PeerAddressResolver unified address idempotence
 *
 * For any valid unified address string (matching the pattern
 * {nodeId}/{entityType}/{replicaId}), calling resolve() should return
 * the same address unchanged.
 *
 * **Validates: Requirements 3.2**
 */
test('Property 6: PeerAddressResolver unified address idempotence',
  async (t) => {
    await fc.assert(
      fc.property(
        unifiedAddressPartsArb,
        (parts) => {
          const addressManager = createAddressManager();
          const resolver = new PeerAddressResolver({
            addressManager,
            systemTableCache: null,
            entityType: parts.entityType,
            logger: createSilentLogger(),
          });

          const unifiedAddress = addressManager.format(
            parts.nodeId,
            parts.entityType,
            parts.serviceId,
          );

          // Resolve should return the address unchanged
          const result = resolver.resolve(unifiedAddress);

          // Idempotence: resolve(addr) === addr
          t.equal(
            result,
            unifiedAddress,
            'Unified address should be returned as-is',
          );

          // Double resolve should also be idempotent
          const doubleResult = resolver.resolve(result);
          t.equal(
            doubleResult,
            unifiedAddress,
            'resolve(resolve(addr)) === addr',
          );

          return true;
        },
      ),
      {numRuns: 10},
    );
  });

// Feature: raft-architecture-consolidation, Property 7:
//   PeerAddressResolver resolves from known sources
/**
 * Property 7: PeerAddressResolver resolves from known sources
 *
 * For any peerId that exists in either the peerAddresses array or the
 * systemTableCache services table, calling resolve() should return a
 * valid unified address that contains the peerId as the service ID
 * component.
 *
 * **Validates: Requirements 3.3, 3.4**
 */
test('Property 7: PeerAddressResolver resolves from known sources',
  async (t) => {
    // Sub-property 7a: resolve from peerAddresses array
    await fc.assert(
      fc.property(
        nodeIdArb,
        entityTypeArb,
        serviceIdArb,
        (nodeId, entityType, peerId) => {
          const addressManager = createAddressManager();
          const resolver = new PeerAddressResolver({
            addressManager,
            systemTableCache: null,
            entityType,
            logger: createSilentLogger(),
          });

          const peerAddress = addressManager.format(
            nodeId, entityType, peerId,
          );
          const peerAddresses = [peerAddress];

          const result = resolver.resolve(peerId, peerAddresses);

          // Result must be a valid unified address
          const validation = addressManager.validate(result);
          t.ok(validation.valid, 'Result should be a valid unified address');

          // Result must contain the peerId as the service ID component
          const parsed = addressManager.parse(result);
          t.equal(
            parsed.serviceId,
            peerId,
            'Resolved address should contain peerId as serviceId',
          );

          return true;
        },
      ),
      {numRuns: 10},
    );

    // Sub-property 7b: resolve from systemTableCache
    await fc.assert(
      fc.property(
        nodeIdArb,
        entityTypeArb,
        serviceIdArb,
        (nodeId, entityType, peerId) => {
          const addressManager = createAddressManager();
          const systemTableCache = {
            get(tableName, key) {
              if (tableName === TABLES.SERVICES && key === peerId) {
                return {node_id: nodeId};
              }
              return null;
            },
          };

          const resolver = new PeerAddressResolver({
            addressManager,
            systemTableCache,
            entityType,
            logger: createSilentLogger(),
          });

          const result = resolver.resolve(peerId);

          // Result must be a valid unified address
          const validation = addressManager.validate(result);
          t.ok(validation.valid, 'Result should be a valid unified address');

          // Result must contain the peerId as the service ID component
          const parsed = addressManager.parse(result);
          t.equal(
            parsed.serviceId,
            peerId,
            'Resolved address should contain peerId as serviceId',
          );

          return true;
        },
      ),
      {numRuns: 10},
    );
  });

// Feature: raft-architecture-consolidation, Property 8:
//   PeerAddressResolver throws for unknown peers
/**
 * Property 8: PeerAddressResolver throws for unknown peers
 *
 * For any peerId that does not exist in the peerAddresses array and has
 * no entry in the systemTableCache services table, calling resolve()
 * should throw an error whose message includes the unresolved peerId
 * string.
 *
 * **Validates: Requirements 3.5**
 */
test('Property 8: PeerAddressResolver throws for unknown peers',
  async (t) => {
    await fc.assert(
      fc.property(
        entityTypeArb,
        serviceIdArb,
        (entityType, peerId) => {
          const addressManager = createAddressManager();

          // Empty systemTableCache that never finds anything
          const systemTableCache = {
            get() {
              return null;
            },
          };

          const resolver = new PeerAddressResolver({
            addressManager,
            systemTableCache,
            entityType,
            logger: createSilentLogger(),
          });

          // Empty peerAddresses — peerId is not known anywhere
          const emptyPeerAddresses = [];

          t.throws(
            () => resolver.resolve(peerId, emptyPeerAddresses),
            {
              message: new RegExp(peerId),
            },
            'Should throw error containing the unresolved peerId',
          );

          return true;
        },
      ),
      {numRuns: 10},
    );
  });
