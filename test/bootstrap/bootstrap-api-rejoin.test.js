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
  TABLES,
} from '../../src/constants/index.js';
import {NODE_STATE} from '../../src/constants/node-state.js';
import {STARTUP_JOIN_MODE} from '../../src/bootstrap/rejoin-hints-constants.js';
import {
  buildMembershipOwnerOutcome,
} from '../../src/control-plane/membership-lifecycle-controller.js';

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
const AUTHORITATIVE_READ_UNEXPECTED =
  'durable rejoin same-address evidence should not require authoritative read';

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

  const result = await api.checkForConflicts(
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

  const result = await api.checkForConflicts(
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

  const result = await api.checkForConflicts(
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

  const result = await api.checkForConflicts(
    REJOIN_NODE_ID,
    'ws://localhost:9091',
  );
  t.ok(
    result !== null,
    'should reject re-registration when node is alive',
  );
  // The lease-window case is a typed retryable conflict, not the terminal
  // string: the joiner retries until the lease expires, then readmits.
  t.equal(
    result.code,
    'NODE_REJOIN_LEASE_WINDOW',
    'lease-window conflict carries the typed retryable code',
  );
  t.ok(
    Number.isFinite(result.retryAfterMs) && result.retryAfterMs > 0,
    'lease-window conflict carries a positive retryAfterMs',
  );
});

test('checkForConflicts rejects re-registration as a terminal conflict ' +
  'when the existing node is live with no lease', async (t) => {
  initializeTestEnvironment();

  const liveNode = {
    [COLUMN.NODE_ID]: REJOIN_NODE_ID,
    [COLUMN.NODE_ADDRESS]: REJOIN_NODE_ADDRESS,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    // No ready_lease_expires_at field at all: the row is live on its status
    // alone (an absent lease reads as non-finite, not expired), so the
    // changed-address conflict is genuinely terminal, not a lease-window
    // wait.
  };

  const cache = createCacheWithExistingNode(liveNode);
  const api = new BootstrapAPI({
    seedNodeId: SEED_NODE_ID,
    seedNodeAddress: SEED_NODE_ADDRESS,
    systemTableCache: cache,
  });

  const result = await api.checkForConflicts(
    REJOIN_NODE_ID,
    'ws://localhost:9091',
  );
  t.ok(
    typeof result === 'string' && result.includes('already registered'),
    'a live row with no lease field stays a terminal conflict',
  );
});

test('checkForConflicts allows idempotent re-registration when ' +
  'existing live node keeps the same address', async (t) => {
  initializeTestEnvironment();

  const liveNode = {
    [COLUMN.NODE_ID]: REJOIN_NODE_ID,
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

  const result = await api.checkForConflicts(
    REJOIN_NODE_ID,
    REJOIN_NODE_ADDRESS,
  );
  t.equal(
    result,
    null,
    'same-node restarts should be treated as idempotent re-registration',
  );
});

test('checkForConflicts admits durable same-address rejoin from owner outcome',
  async (t) => {
    initializeTestEnvironment();

    const liveNode = {
      [COLUMN.NODE_ID]: REJOIN_NODE_ID,
      [COLUMN.NODE_ADDRESS]: REJOIN_NODE_ADDRESS,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.READY_LEASE_EXPIRES_AT]: Date.now() + 60000,
    };

    const cache = createCacheWithExistingNode(liveNode);
    let authoritativeReadCalled = false;
    const api = new BootstrapAPI({
      seedNodeId: SEED_NODE_ID,
      seedNodeAddress: SEED_NODE_ADDRESS,
      systemTableCache: cache,
      authoritativeControlPlaneView: {
        canRead() {
          return true;
        },
        async readRows() {
          authoritativeReadCalled = true;
          throw new Error(AUTHORITATIVE_READ_UNEXPECTED);
        },
      },
    });

    const result = await api.checkForConflicts(
      REJOIN_NODE_ID,
      REJOIN_NODE_ADDRESS,
      {
        startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
        membershipOwnerOutcome: buildMembershipOwnerOutcome({
          startupMode: STARTUP_JOIN_MODE.DURABLE_REJOIN,
        }),
      },
    );
    t.equal(
      result,
      null,
      'durable same-address rejoin should be admitted from the owner outcome',
    );
    t.equal(
      authoritativeReadCalled,
      false,
      'durable same-address rejoin should not wait on authoritative reads',
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
  const result = await api.checkForConflicts(
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
  const result = await api.checkForConflicts(
    newNodeId,
    REJOIN_NODE_ADDRESS,
  );
  t.equal(
    result, null,
    'should allow when address is held by a dead node',
  );
});

test('checkForConflicts allows re-registration when authoritative nodes row is stopped',
  async (t) => {
    initializeTestEnvironment();

    const liveCacheRow = {
      [COLUMN.NODE_ID]: REJOIN_NODE_ID,
      [COLUMN.NODE_ADDRESS]: REJOIN_NODE_ADDRESS,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.READY_LEASE_EXPIRES_AT]: Date.now() + 60000,
    };

    const cache = createCacheWithExistingNode(liveCacheRow);
    const api = new BootstrapAPI({
      seedNodeId: SEED_NODE_ID,
      seedNodeAddress: SEED_NODE_ADDRESS,
      systemTableCache: cache,
      authoritativeControlPlaneView: {
        canRead() {
          return true;
        },
        async readRows() {
          return {
            success: true,
            rows: [{
              [COLUMN.NODE_ID]: REJOIN_NODE_ID,
              [COLUMN.NODE_ADDRESS]: REJOIN_NODE_ADDRESS,
              [COLUMN.STATUS]: NODE_STATE.STOPPED,
              [COLUMN.READY_LEASE_EXPIRES_AT]: null,
            }],
          };
        },
      },
    });

    const result = await api.checkForConflicts(
      REJOIN_NODE_ID,
      REJOIN_NODE_ADDRESS,
    );
    t.equal(
      result,
      null,
      'should prefer authoritative stopped row over stale cache row',
    );
  });
