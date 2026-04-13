/**
 * Property test for Unified Address Format in RaftTransportAdapter.
 * Property 5: For any peer ID, the Transport_Adapter should generate an address
 * in the unified format ${nodeId}/${entityType}/${entityId}.
 *
 * Validates: Requirements 2.3
 *
 * Feature: raft-library-integration
 * Property 5: Unified Address Format
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {RaftTransportAdapter} from '../../src/raft/raft-transport-adapter.js';

// Valid entity types for Raft adapters
const VALID_ENTITY_TYPES = ['message-group', 'partition'];

/**
 * Feature: raft-library-integration
 * Property 5: Unified Address Format
 *
 * For any peer ID, the Transport_Adapter should generate an address in the
 * unified format ${nodeId}/${entityType}/${entityId}.
 */
test('Property 5: Unified Address Format', async (t) => {
  /**
   * Property: buildPeerAddress generates unified format for simple peer IDs.
   *
   * For any simple peer ID (without slashes), buildPeerAddress should return
   * an address in the format ${nodeId}/${entityType}/${peerId} when the peer
   * is found in the system table cache.
   */
  t.test('buildPeerAddress generates unified format for simple peer IDs', async (t) => {
    await fc.assert(
      fc.property(
        // Generate node ID (no slashes, alphanumeric)
        fc.string({minLength: 1, maxLength: 20}).filter((s) =>
          !s.includes('/') && /^[a-zA-Z0-9_-]+$/.test(s)),
        // Generate entity type
        fc.constantFrom(...VALID_ENTITY_TYPES),
        // Generate peer ID (no slashes, alphanumeric)
        fc.string({minLength: 1, maxLength: 30}).filter((s) =>
          !s.includes('/') && /^[a-zA-Z0-9_-]+$/.test(s)),
        (nodeId, entityType, peerId) => {
          // Create mock message router
          const mockRouter = {
            deliver: async () => ({acknowledged: true}),
          };

          // Mock systemTableCache that returns the peer's node_id
          const mockCache = {
            get: (table, id) => {
              if (table === 'services' && id === peerId) {
                return {node_id: nodeId};
              }
              return null;
            },
          };

          const adapter = new RaftTransportAdapter({
            messageRouter: mockRouter,
            entityType,
            nodeId,
            systemTableCache: mockCache,
          });

          const address = adapter.buildPeerAddress(peerId);

          // Verify format: nodeId/entityType/peerId
          const parts = address.split('/');
          return parts.length === 3 &&
                 parts[0] === nodeId &&
                 parts[1] === entityType &&
                 parts[2] === peerId;
        },
      ),
      {numRuns: 10},
    );

    t.pass('buildPeerAddress generates unified format for simple peer IDs');
  });

  /**
   * Property: buildPeerAddress preserves already-unified addresses.
   *
   * For any address already in unified format (containing slashes),
   * buildPeerAddress should return it unchanged.
   */
  t.test('buildPeerAddress preserves already-unified addresses', async (t) => {
    await fc.assert(
      fc.property(
        // Generate node ID for adapter
        fc.string({minLength: 1, maxLength: 20}).filter((s) => !s.includes('/')),
        // Generate entity type for adapter
        fc.constantFrom(...VALID_ENTITY_TYPES),
        // Generate already-unified address
        fc.tuple(
          fc.string({minLength: 1, maxLength: 10}).filter((s) => !s.includes('/')),
          fc.constantFrom(...VALID_ENTITY_TYPES),
          fc.string({minLength: 1, maxLength: 20}).filter((s) => !s.includes('/')),
        ).map(([n, e, i]) => `${n}/${e}/${i}`),
        (nodeId, entityType, unifiedAddress) => {
          const mockRouter = {
            deliver: async () => ({acknowledged: true}),
          };

          const adapter = new RaftTransportAdapter({
            messageRouter: mockRouter,
            entityType,
            nodeId,
          });

          const result = adapter.buildPeerAddress(unifiedAddress);

          // Should return the unified address unchanged
          return result === unifiedAddress;
        },
      ),
      {numRuns: 10},
    );

    t.pass('buildPeerAddress preserves already-unified addresses');
  });

  /**
   * Property: buildPeerAddress uses systemTableCache when available.
   *
   * When systemTableCache provides a node_id for a peer, buildPeerAddress
   * should use that node_id instead of the adapter's nodeId.
   */
  t.test('buildPeerAddress uses systemTableCache when available', async (t) => {
    await fc.assert(
      fc.property(
        // Generate adapter's node ID (alphanumeric)
        fc.string({minLength: 1, maxLength: 20}).filter((s) =>
          !s.includes('/') && /^[a-zA-Z0-9_-]+$/.test(s)),
        // Generate entity type
        fc.constantFrom(...VALID_ENTITY_TYPES),
        // Generate peer ID (alphanumeric)
        fc.string({minLength: 1, maxLength: 20}).filter((s) =>
          !s.includes('/') && /^[a-zA-Z0-9_-]+$/.test(s)),
        // Generate cached node ID (different from adapter's, alphanumeric)
        fc.string({minLength: 1, maxLength: 20}).filter((s) =>
          !s.includes('/') && /^[a-zA-Z0-9_-]+$/.test(s)),
        (adapterNodeId, entityType, peerId, cachedNodeId) => {
          const mockRouter = {
            deliver: async () => ({acknowledged: true}),
          };

          // Mock systemTableCache that returns a different node_id
          const mockCache = {
            get: (table, id) => {
              if (table === 'services' && id === peerId) {
                return {node_id: cachedNodeId};
              }
              return null;
            },
          };

          const adapter = new RaftTransportAdapter({
            messageRouter: mockRouter,
            entityType,
            nodeId: adapterNodeId,
            systemTableCache: mockCache,
          });

          const address = adapter.buildPeerAddress(peerId);

          // Should use cached node_id
          const parts = address.split('/');
          return parts.length === 3 &&
                 parts[0] === cachedNodeId &&
                 parts[1] === entityType &&
                 parts[2] === peerId;
        },
      ),
      {numRuns: 10},
    );

    t.pass('buildPeerAddress uses systemTableCache when available');
  });

  /**
   * Property: buildPeerAddress throws when cache misses.
   *
   * When systemTableCache doesn't have the peer, buildPeerAddress should
   * throw an error since it cannot resolve the peer address.
   */
  t.test('buildPeerAddress throws when cache misses', async (t) => {
    await fc.assert(
      fc.property(
        // Generate adapter's node ID (alphanumeric)
        fc.string({minLength: 1, maxLength: 20}).filter((s) =>
          !s.includes('/') && /^[a-zA-Z0-9_-]+$/.test(s)),
        // Generate entity type
        fc.constantFrom(...VALID_ENTITY_TYPES),
        // Generate peer ID (alphanumeric)
        fc.string({minLength: 1, maxLength: 20}).filter((s) =>
          !s.includes('/') && /^[a-zA-Z0-9_-]+$/.test(s)),
        (adapterNodeId, entityType, peerId) => {
          const mockRouter = {
            deliver: async () => ({acknowledged: true}),
          };

          // Mock systemTableCache that returns null (cache miss)
          const mockCache = {
            get: () => null,
          };

          const adapter = new RaftTransportAdapter({
            messageRouter: mockRouter,
            entityType,
            nodeId: adapterNodeId,
            systemTableCache: mockCache,
          });

          // Should throw when peer is not in cache
          try {
            adapter.buildPeerAddress(peerId);
            return false; // Should have thrown
          } catch (error) {
            return error.message.includes('Unable to resolve');
          }
        },
      ),
      {numRuns: 10},
    );

    t.pass('buildPeerAddress throws when cache misses');
  });

  /**
   * Property: getRaftMessageType maps liferaft types correctly.
   *
   * For any known liferaft packet type, getRaftMessageType should return
   * the corresponding RAFT_* message type.
   */
  t.test('getRaftMessageType maps liferaft types correctly', async (t) => {
    const expectedMappings = {
      'vote': 'RAFT_REQUEST_VOTE',
      'voted': 'RAFT_REQUEST_VOTE_RESPONSE',
      'append': 'RAFT_APPEND_ENTRIES',
      'appended': 'RAFT_APPEND_ENTRIES_RESPONSE',
    };

    await fc.assert(
      fc.property(
        fc.constantFrom(...Object.keys(expectedMappings)),
        (packetType) => {
          const mockRouter = {
            deliver: async () => ({acknowledged: true}),
          };

          const adapter = new RaftTransportAdapter({
            messageRouter: mockRouter,
            entityType: 'message-group',
            nodeId: 'test-node',
          });

          const result = adapter.getRaftMessageType(packetType);
          return result === expectedMappings[packetType];
        },
      ),
      {numRuns: 10},
    );

    t.pass('getRaftMessageType maps liferaft types correctly');
  });

  /**
   * Property: getRaftMessageType passes through unknown types.
   *
   * For any unknown packet type, getRaftMessageType should return it unchanged.
   */
  t.test('getRaftMessageType passes through unknown types', async (t) => {
    const knownTypes = ['vote', 'voted', 'append', 'appended'];
    // Exclude JS prototype properties that exist on all objects
    const reservedProps = ['__proto__', 'constructor', 'hasOwnProperty', 'toString'];

    await fc.assert(
      fc.property(
        fc.string({minLength: 1, maxLength: 20}).filter(
          (s) => !knownTypes.includes(s) && !reservedProps.includes(s),
        ),
        (unknownType) => {
          const mockRouter = {
            deliver: async () => ({acknowledged: true}),
          };

          const adapter = new RaftTransportAdapter({
            messageRouter: mockRouter,
            entityType: 'message-group',
            nodeId: 'test-node',
          });

          const result = adapter.getRaftMessageType(unknownType);
          return result === unknownType;
        },
      ),
      {numRuns: 10},
    );

    t.pass('getRaftMessageType passes through unknown types');
  });
});
