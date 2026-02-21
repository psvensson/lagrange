/**
 * Tests for Bootstrap API re-registration of dead nodes.
 *
 * When a node with a known ID attempts to rejoin and the existing
 * record has an expired lease or terminal status, the bootstrap API
 * should allow re-registration instead of returning 409.
 */

import {test} from '../../src/test-helpers/tap.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  COLUMN,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {NODE_STATE} from '../../src/constants/node-state.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';

function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: 'test-seed-node', restApiPort: 9999},
      logging: {level: 'error'},
    });
  }
  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

/**
 * Build a mock system table cache with a pre-registered node.
 * @param {Object} existingNodeRecord - The stale node record.
 * @returns {Object} Mock system table cache.
 */
function createCacheWithExistingNode(existingNodeRecord) {
  const registeredNodes = new Map();
  if (existingNodeRecord) {
    registeredNodes.set(
      existingNodeRecord[COLUMN.NODE_ID],
      existingNodeRecord,
    );
  }

  const leaderServices = new Map();

  return {
    get(table, key) {
      if (table === TABLES.NODES) {
        return registeredNodes.get(key) || null;
      }
      if (table === TABLES.SERVICES) {
        return leaderServices.get(key) || null;
      }
      return null;
    },
    getAll(table) {
      if (table === TABLES.NODES) {
        return [...registeredNodes.values()];
      }
      return [];
    },
    filter(table, predicate) {
      if (table === TABLES.NODES) {
        return [...registeredNodes.values()].filter(predicate);
      }
      if (table === TABLES.SERVICES) {
        return [...leaderServices.values()].filter(predicate);
      }
      return [];
    },
    find() {
      return null;
    },
    getReadyNodes() {
      return [];
    },
  };
}

const REJOIN_NODE_ID = '550e8400-e29b-41d4-a716-446655440000';
const REJOIN_NODE_ADDRESS = 'ws://localhost:9090';
const SEED_NODE_ID = 'seed-node-1';
const SEED_NODE_ADDRESS = 'ws://localhost:8080';

test('checkForConflicts allows re-registration when ' +
  'existing node has expired lease', async (t) => {
  initializeTestEnvironment();

  const expiredLeaseTime = Date.now() - 60000;
  const staleNode = {
    [COLUMN.NODE_ID]: REJOIN_NODE_ID,
    [COLUMN.NODE_ADDRESS]: REJOIN_NODE_ADDRESS,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.READY_LEASE_EXPIRES_AT]: expiredLeaseTime,
  };

  const cache = createCacheWithExistingNode(staleNode);
  const api = new BootstrapAPI({
    seedNodeId: SEED_NODE_ID,
    seedNodeAddress: SEED_NODE_ADDRESS,
    systemTableCache: cache,
  });

  const result = api.checkForConflicts(
    REJOIN_NODE_ID,
    REJOIN_NODE_ADDRESS,
  );
  t.equal(
    result, null,
    'should allow re-registration when lease is expired',
  );
});

test('checkForConflicts allows re-registration when ' +
  'existing node status is stopped', async (t) => {
  initializeTestEnvironment();

  const staleNode = {
    [COLUMN.NODE_ID]: REJOIN_NODE_ID,
    [COLUMN.NODE_ADDRESS]: REJOIN_NODE_ADDRESS,
    [COLUMN.STATUS]: NODE_STATE.STOPPED,
    [COLUMN.READY_LEASE_EXPIRES_AT]: Date.now() + 60000,
  };

  const cache = createCacheWithExistingNode(staleNode);
  const api = new BootstrapAPI({
    seedNodeId: SEED_NODE_ID,
    seedNodeAddress: SEED_NODE_ADDRESS,
    systemTableCache: cache,
  });

  const result = api.checkForConflicts(
    REJOIN_NODE_ID,
    REJOIN_NODE_ADDRESS,
  );
  t.equal(
    result, null,
    'should allow re-registration when node is stopped',
  );
});

test('checkForConflicts allows re-registration when ' +
  'existing node status is failed', async (t) => {
  initializeTestEnvironment();

  const staleNode = {
    [COLUMN.NODE_ID]: REJOIN_NODE_ID,
    [COLUMN.NODE_ADDRESS]: REJOIN_NODE_ADDRESS,
    [COLUMN.STATUS]: NODE_STATE.FAILED,
    [COLUMN.READY_LEASE_EXPIRES_AT]: Date.now() + 60000,
  };

  const cache = createCacheWithExistingNode(staleNode);
  const api = new BootstrapAPI({
    seedNodeId: SEED_NODE_ID,
    seedNodeAddress: SEED_NODE_ADDRESS,
    systemTableCache: cache,
  });

  const result = api.checkForConflicts(
    REJOIN_NODE_ID,
    REJOIN_NODE_ADDRESS,
  );
  t.equal(
    result, null,
    'should allow re-registration when node is failed',
  );
});

test('checkForConflicts rejects re-registration when ' +
  'existing node is alive with valid lease', async (t) => {
  initializeTestEnvironment();

  const futureLeaseTime = Date.now() + 60000;
  const liveNode = {
    [COLUMN.NODE_ID]: REJOIN_NODE_ID,
    [COLUMN.NODE_ADDRESS]: REJOIN_NODE_ADDRESS,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.READY_LEASE_EXPIRES_AT]: futureLeaseTime,
  };

  const cache = createCacheWithExistingNode(liveNode);
  const api = new BootstrapAPI({
    seedNodeId: SEED_NODE_ID,
    seedNodeAddress: SEED_NODE_ADDRESS,
    systemTableCache: cache,
  });

  const result = api.checkForConflicts(
    REJOIN_NODE_ID,
    REJOIN_NODE_ADDRESS,
  );
  t.ok(
    result !== null,
    'should reject re-registration when node is alive',
  );
  t.ok(
    result.includes('already registered'),
    'error should mention already registered',
  );
});

test('checkForConflicts still rejects address conflict ' +
  'from a different live node', async (t) => {
  initializeTestEnvironment();

  const differentNodeId = '660e8400-e29b-41d4-a716-446655440001';
  const liveNode = {
    [COLUMN.NODE_ID]: differentNodeId,
    [COLUMN.NODE_ADDRESS]: REJOIN_NODE_ADDRESS,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.READY_LEASE_EXPIRES_AT]: Date.now() + 60000,
  };

  const cache = createCacheWithExistingNode(liveNode);
  const api = new BootstrapAPI({
    seedNodeId: SEED_NODE_ID,
    seedNodeAddress: SEED_NODE_ADDRESS,
    systemTableCache: cache,
  });

  const newNodeId = '770e8400-e29b-41d4-a716-446655440002';
  const result = api.checkForConflicts(
    newNodeId,
    REJOIN_NODE_ADDRESS,
  );
  t.ok(
    result !== null,
    'should reject when address is used by a different live node',
  );
  t.ok(
    result.includes('already in use'),
    'error should mention address in use',
  );
});

test('checkForConflicts skips address conflict check ' +
  'for dead node with same address', async (t) => {
  initializeTestEnvironment();

  const differentNodeId = '660e8400-e29b-41d4-a716-446655440001';
  const deadNode = {
    [COLUMN.NODE_ID]: differentNodeId,
    [COLUMN.NODE_ADDRESS]: REJOIN_NODE_ADDRESS,
    [COLUMN.STATUS]: NODE_STATE.STOPPED,
    [COLUMN.READY_LEASE_EXPIRES_AT]: Date.now() - 60000,
  };

  const cache = createCacheWithExistingNode(deadNode);
  const api = new BootstrapAPI({
    seedNodeId: SEED_NODE_ID,
    seedNodeAddress: SEED_NODE_ADDRESS,
    systemTableCache: cache,
  });

  const newNodeId = '770e8400-e29b-41d4-a716-446655440002';
  const result = api.checkForConflicts(
    newNodeId,
    REJOIN_NODE_ADDRESS,
  );
  t.equal(
    result, null,
    'should allow when address is held by a dead node',
  );
});
