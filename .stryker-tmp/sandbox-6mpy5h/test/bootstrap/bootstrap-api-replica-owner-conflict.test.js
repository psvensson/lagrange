/**
 * Tests for assertSingleOwnerReplicaRegistration — REPLICA_OWNER_CONFLICT
 * during node restart with CREATE_SELF_HOSTED message group.
 *
 * Bug: When a node restarts and gets CREATE_SELF_HOSTED assignment, it
 * generates deterministic replica IDs (e.g., mg-{nodePrefix}-r0, r1, r2).
 * Some of those replicas were previously moved to other nodes via
 * MOVE_REPLICA. The seed's cache still shows them as active on those
 * other nodes, causing assertSingleOwnerReplicaRegistration to throw
 * REPLICA_OWNER_CONFLICT.
 *
 * Uses BootstrapAPI.assertSingleOwnerReplicaRegistration owner path.
 *
 * Requirements: 1.4.2, 1.4.4
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {
  BOOTSTRAP_API_ERROR,
  BOOTSTRAP_API_REGISTER_SERVICE_ERROR_CODE,
} from '../../src/bootstrap/bootstrap-api-constants.js';
import {MessageGroupAssignment} from
  '../../src/bootstrap/message-group-assignment.js';

const SEED_NODE_ID = 'aaaa1111-bbbb-cccc-dddd-eeee2222ffff';
const RESTARTING_NODE_ID = '8be8d30f-4499-5eed-865c-71b4d529a67a';
const OTHER_NODE_ID = '11601fe0-72d6-5853-8590-ec2881853e72';
const SEED_ADDRESS = 'ws://localhost:8080';

// Derive the canonical group ID for the restarting node using the
// same algorithm as MessageGroupAssignment.generateGroupId.
const MG_ASSIGNMENT = new MessageGroupAssignment({
  seedNodeAddress: SEED_ADDRESS,
});
const RESTARTING_NODE_GROUP_ID =
  MG_ASSIGNMENT.generateGroupId(RESTARTING_NODE_ID);
const REPLICA_R0 = `${RESTARTING_NODE_GROUP_ID}-r0`;
const REPLICA_R1 = `${RESTARTING_NODE_GROUP_ID}-r1`;
const REPLICA_R2 = `${RESTARTING_NODE_GROUP_ID}-r2`;

function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: SEED_NODE_ID, restApiPort: 9999},
      logging: {level: 'error'},
    });
  }
  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

/**
 * Build a mock SystemTableCache with the given service rows.
 * @param {Array<Object>} serviceRows - Service rows to populate.
 * @return {Object} Mock cache.
 */
function buildMockCache(serviceRows) {
  const serviceMap = new Map();
  for (const row of serviceRows) {
    serviceMap.set(row.service_id, row);
  }
  return {
    get(tableName, key) {
      if (tableName === TABLES.SERVICES) {
        return serviceMap.get(key) || null;
      }
      return null;
    },
    getAll(tableName) {
      if (tableName === TABLES.SERVICES) {
        return Array.from(serviceMap.values());
      }
      return [];
    },
    getReadyNodes() {
      return [];
    },
  };
}

/**
 * Build a service row for a message-group replica.
 * @param {Object} overrides - Field overrides.
 * @return {Object} Service row.
 */
function buildServiceRow(overrides = {}) {
  return {
    service_id: overrides.service_id || REPLICA_R0,
    service_type: SERVICE_TYPE.MESSAGE_GROUP,
    node_id: overrides.node_id || RESTARTING_NODE_ID,
    group_id: overrides.group_id || RESTARTING_NODE_GROUP_ID,
    replica_id: overrides.replica_id ||
      overrides.service_id || REPLICA_R0,
    raft_role: overrides.raft_role || RAFT_ROLE.FOLLOWER,
    status: overrides.status || SERVICE_STATUS.ACTIVE,
    address: overrides.address || null,
    created_at: Date.now(),
    updated_at: Date.now(),
  };
}

// ---------------------------------------------------------------
// Baseline: the existing check correctly rejects a true conflict
// ---------------------------------------------------------------
test(
  'assertSingleOwnerReplicaRegistration rejects when ' +
  'active replica exists on a different node (true conflict)',
  async (t) => {
    initializeTestEnvironment();

    // r1 is active on OTHER_NODE_ID — a genuine conflict
    const cache = buildMockCache([
      buildServiceRow({
        service_id: REPLICA_R1,
        node_id: OTHER_NODE_ID,
        status: SERVICE_STATUS.ACTIVE,
      }),
    ]);

    const api = new BootstrapAPI({
      seedNodeId: SEED_NODE_ID,
      seedNodeAddress: SEED_ADDRESS,
      systemTableCache: cache,
    });

    // Registering r1 for a DIFFERENT unrelated node should throw
    const unrelatedNodeId = 'cccc3333-dddd-4444-eeee-ffff5555aaaa';
    const serviceData = {
      service_id: REPLICA_R1,
      service_type: SERVICE_TYPE.MESSAGE_GROUP,
      node_id: unrelatedNodeId,
      group_id: RESTARTING_NODE_GROUP_ID,
    };

    t.throws(
      () => api.assertSingleOwnerReplicaRegistration(
        serviceData, null,
      ),
      {statusCode: 409},
      'should throw 409 for a true owner conflict',
    );
  },
);

// ---------------------------------------------------------------
// Bug reproduction: restarting node reclaiming its self-hosted
// group should NOT throw REPLICA_OWNER_CONFLICT
// ---------------------------------------------------------------
test(
  'assertSingleOwnerReplicaRegistration allows restarting ' +
  'node to reclaim its self-hosted message-group replicas',
  async (t) => {
    initializeTestEnvironment();

    // Scenario: node 8be8d30f originally created mg-8be8d30f-...
    // with r0, r1, r2 all on itself. r1 was moved to OTHER_NODE
    // via MOVE_REPLICA. Node 8be8d30f restarts and gets
    // CREATE_SELF_HOSTED again, generating the same r0, r1, r2.
    // When it registers r1, the cache still shows r1 as active
    // on OTHER_NODE.
    const cache = buildMockCache([
      buildServiceRow({
        service_id: REPLICA_R1,
        node_id: OTHER_NODE_ID,
        status: SERVICE_STATUS.ACTIVE,
      }),
    ]);

    const api = new BootstrapAPI({
      seedNodeId: SEED_NODE_ID,
      seedNodeAddress: SEED_ADDRESS,
      systemTableCache: cache,
    });

    // The restarting node registers r1 for itself — this is the
    // canonical home node reclaiming its self-hosted group.
    const serviceData = {
      service_id: REPLICA_R1,
      service_type: SERVICE_TYPE.MESSAGE_GROUP,
      node_id: RESTARTING_NODE_ID,
      group_id: RESTARTING_NODE_GROUP_ID,
    };

    t.doesNotThrow(
      () => api.assertSingleOwnerReplicaRegistration(
        serviceData, null,
      ),
      'should allow the canonical home node to reclaim ' +
      'its self-hosted message-group replica',
    );
  },
);

// ---------------------------------------------------------------
// Same-node re-registration should still be allowed (existing
// early-return path)
// ---------------------------------------------------------------
test(
  'assertSingleOwnerReplicaRegistration allows same-node ' +
  're-registration (existing behavior)',
  async (t) => {
    initializeTestEnvironment();

    const cache = buildMockCache([
      buildServiceRow({
        service_id: REPLICA_R0,
        node_id: RESTARTING_NODE_ID,
        status: SERVICE_STATUS.ACTIVE,
      }),
    ]);

    const api = new BootstrapAPI({
      seedNodeId: SEED_NODE_ID,
      seedNodeAddress: SEED_ADDRESS,
      systemTableCache: cache,
    });

    const serviceData = {
      service_id: REPLICA_R0,
      service_type: SERVICE_TYPE.MESSAGE_GROUP,
      node_id: RESTARTING_NODE_ID,
      group_id: RESTARTING_NODE_GROUP_ID,
    };

    t.doesNotThrow(
      () => api.assertSingleOwnerReplicaRegistration(
        serviceData, null,
      ),
      'should allow same-node re-registration without conflict',
    );
  },
);

// ---------------------------------------------------------------
// Non-message-group services should be ignored
// ---------------------------------------------------------------
test(
  'assertSingleOwnerReplicaRegistration skips non-message-' +
  'group service types',
  async (t) => {
    initializeTestEnvironment();

    const cache = buildMockCache([
      buildServiceRow({
        service_id: 'partition-p1-r1',
        node_id: OTHER_NODE_ID,
        status: SERVICE_STATUS.ACTIVE,
      }),
    ]);

    const api = new BootstrapAPI({
      seedNodeId: SEED_NODE_ID,
      seedNodeAddress: SEED_ADDRESS,
      systemTableCache: cache,
    });

    const serviceData = {
      service_id: 'partition-p1-r1',
      service_type: SERVICE_TYPE.PARTITION,
      node_id: RESTARTING_NODE_ID,
    };

    t.doesNotThrow(
      () => api.assertSingleOwnerReplicaRegistration(
        serviceData, null,
      ),
      'should skip conflict check for non-message-group types',
    );
  },
);

// ---------------------------------------------------------------
// Inactive existing replica should not trigger conflict
// ---------------------------------------------------------------
test(
  'assertSingleOwnerReplicaRegistration allows registration ' +
  'when existing replica is not active',
  async (t) => {
    initializeTestEnvironment();

    const cache = buildMockCache([
      buildServiceRow({
        service_id: REPLICA_R1,
        node_id: OTHER_NODE_ID,
        status: 'stopped',
      }),
    ]);

    const api = new BootstrapAPI({
      seedNodeId: SEED_NODE_ID,
      seedNodeAddress: SEED_ADDRESS,
      systemTableCache: cache,
    });

    const serviceData = {
      service_id: REPLICA_R1,
      service_type: SERVICE_TYPE.MESSAGE_GROUP,
      node_id: RESTARTING_NODE_ID,
      group_id: RESTARTING_NODE_GROUP_ID,
    };

    t.doesNotThrow(
      () => api.assertSingleOwnerReplicaRegistration(
        serviceData, null,
      ),
      'should allow registration when existing replica is ' +
      'not in active status',
    );
  },
);
