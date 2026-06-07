/**
 * Tests that CDC events applied to a non-leader message group replica
 * are forwarded to the message group leader for Raft replication.
 *
 * Bug: applyCDCEvent() applies the event to the local cache but only
 * proposes to Raft when the local MG is the leader. When the partition
 * leader and message group leader are on different nodes, CDC events
 * never reach other nodes' caches — causing "no partitions available"
 * errors for newly created tables.
 */
import {registerCdcNonLeaderPropagationTailTests} from './cdc-non-leader-propagation-tail-test-cases.js';

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import assert from 'node:assert/strict';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  CDC_OPERATION,
  SERVICE_STATUS,
  SERVICE_TYPE,
  STATE,
  TABLES,
} from '../../src/constants/index.js';
import {
} from '../../src/constants/transport.js';
import LifeRaft from '@markwylde/liferaft';
import {
  MessageGroupService,
} from '../../src/message-group/message-group-service.js';
import {
  MESSAGE_GROUP_CDC_ERROR_MSG,
} from '../../src/message-group/constants.js';
import {MessageRouter} from '../../src/transport/message-router.js';

let testPortCounter = 27200;
const NON_SYSTEM_CDC_TABLE = 'runtime_forward_events';

async function waitForCondition(predicate, timeoutMs = 1000, intervalMs = 20) {
  const startedAtMs = Date.now();
  while (Date.now() - startedAtMs < timeoutMs) {
    if (predicate()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return predicate();
}

function seedLiveRaftPeersFromPeerAddresses(service) {
  if (!service?.raft || !Array.isArray(service.peerAddresses)) {
    return;
  }
  service.raft.nodes = service.peerAddresses
    .filter((address) => typeof address === 'string' && address.length > 0)
    .map((address) => ({address}));
}

beforeEach(() => {
  NodeService.resetInstance();
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: 'test-node'}});
  const logger = LoggingService.getInstance();
  logger.initialize({level: 'error'});
});

afterEach(() => {
  NodeService.resetInstance();
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

test(
  'applyCDCEvent on non-leader MG forwards CDC to leader for replication',
  async (_t) => {
    const port = testPortCounter++;
    const nodeId = `test-node-${port}`;
    const router = new MessageRouter({nodeId, wsPort: port});
    await router.initialize({startServer: true});

    let shutdownCalled = false;
    const cleanup = async () => {
      if (shutdownCalled) return;
      shutdownCalled = true;
      try {
        if (mg && mg.raft) {
          await mg.shutdown();
        }
      } catch (_e) {
        // best-effort
      }
      await router.shutdown();
    };

    let mg;
    try {
      mg = new MessageGroupService({
        groupId: 'mg-1',
        replicaId: 'mg-1-r1',
        nodeId,
        transport: router,
      });
      await mg.initialize();
      mg.replicaIds = ['mg-1-r1', 'mg-1-r2'];

      // Subscribe to the partitions table
      await mg.subscribeToCDC(NON_SYSTEM_CDC_TABLE);

      // Force this MG to be a non-leader follower
      mg.isLeader = false;
      mg.role = 'follower';
      // Set leaderId to a remote replica so forwarding has a target
      mg.leaderId = 'mg-1-r2';
      // Force liferaft state to FOLLOWER (3) so the Raft proposal
      // branch is skipped and the forwarding branch fires instead
      if (mg.raft) {
        Object.defineProperty(mg.raft, 'state', {
          value: 3, // LifeRaft.FOLLOWER
          writable: true,
          configurable: true,
        });
      }

      // Provide peer address so buildPeerAddress can resolve the leader
      mg.peerAddresses = ['remote-node/message-group/mg-1-r2'];
      seedLiveRaftPeersFromPeerAddresses(mg);

      // Track forwarding attempts via messageRouter.deliver
      const forwardedPayloads = [];
      const originalDeliver = router.deliver.bind(router);
      router.deliver = async (address, payload, options) => {
        forwardedPayloads.push({address, payload, options});
        // Simulate successful delivery
        return {acknowledged: true};
      };

      // Apply a CDC event simulating a new partition for benchmark_events
      const cdcData = {
        partition_id: 'tbl-bench-p1',
        table_id: 'tbl-bench',
        table_name: 'benchmark_events',
        replica_count: 3,
        state: 'NORMAL',
        created_at: Date.now(),
        updated_at: Date.now(),
      };

      await mg.applyCDCEvent(NON_SYSTEM_CDC_TABLE, 'INSERT', cdcData);

      // Non-leaders must not speculatively mutate cache before commit.
      const cache = NodeService.getInstance().getSystemTableCache();
      const cached = cache.get(TABLES.PARTITIONS, 'tbl-bench-p1');
      assert.equal(
        cached,
        undefined,
        'non-leader should not apply CDC event locally before commit',
      );

      // The event MUST be forwarded to the leader for Raft replication.
      // Without this, other nodes never see the cache update.
      assert.ok(
        forwardedPayloads.length > 0,
        'Non-leader MG must forward CDC event to leader for replication',
      );

      const forwarded = forwardedPayloads[0];
      assert.equal(
        forwarded.payload.tableName,
        NON_SYSTEM_CDC_TABLE,
        'Forwarded payload should contain the correct table name',
      );
      assert.equal(
        forwarded.payload.operation,
        'INSERT',
        'Forwarded payload should contain the correct operation',
      );
      assert.equal(
        forwarded.payload.data.partition_id,
        'tbl-bench-p1',
        'Forwarded payload should contain the CDC data',
      );
      assert.equal(
        forwarded.options?.deliveryPriority,
        'background',
        'Generic non-leader CDC forwarding should use background router priority',
      );

      // Restore deliver for cleanup
      router.deliver = originalDeliver;
    } finally {
      await cleanup();
    }
  },
);

test(
  'applyCDCEvent on non-leader MG retries CDC forward after transient failure',
  async (t) => {
    const port = testPortCounter++;
    const nodeId = `test-node-${port}`;
    const router = new MessageRouter({nodeId, wsPort: port});
    await router.initialize({startServer: true});

    let shutdownCalled = false;
    const cleanup = async () => {
      if (shutdownCalled) return;
      shutdownCalled = true;
      try {
        if (mg && mg.raft) {
          await mg.shutdown();
        }
      } catch (_e) {
        // best-effort
      }
      await router.shutdown();
    };

    let mg;
    try {
      mg = new MessageGroupService({
        groupId: 'mg-retry',
        replicaId: 'mg-retry-r1',
        nodeId,
        transport: router,
      });
      await mg.initialize();
      mg.replicaIds = ['mg-retry-r1', 'mg-retry-r2'];
      await mg.subscribeToCDC(NON_SYSTEM_CDC_TABLE);

      mg.isLeader = false;
      mg.role = 'follower';
      mg.leaderId = 'mg-retry-r2';
      mg.peerAddresses = ['remote-node/message-group/mg-retry-r2'];
      seedLiveRaftPeersFromPeerAddresses(mg);
      mg.retryInitialDelayMs = 20;
      mg.retryBackoffMultiplier = 1;
      mg.retryMaxAttempts = 2;

      const forwardedPayloads = [];
      let deliverAttempt = 0;
      router.deliver = async (address, payload, options) => {
        deliverAttempt += 1;
        forwardedPayloads.push({address, payload, options, attempt: deliverAttempt});
        if (deliverAttempt === 1) {
          throw new Error('transient forward failure');
        }
        return {acknowledged: true};
      };

      const cdcData = {
        partition_id: 'tbl-bench-p-retry',
        table_id: 'tbl-bench-retry',
        table_name: 'benchmark_events',
        replica_count: 3,
        state: 'NORMAL',
        created_at: Date.now(),
        updated_at: Date.now(),
      };

      await mg.applyCDCEvent(NON_SYSTEM_CDC_TABLE, 'INSERT', cdcData);

      const observedRetry = await waitForCondition(
        () => forwardedPayloads.length >= 2,
        2000,
        20,
      );
      t.equal(observedRetry, true, 'should retry forwarding after a transient failure');
      t.equal(forwardedPayloads.length >= 2, true, 'should attempt delivery at least twice');
      t.equal(
        forwardedPayloads[0].payload.timestamp,
        forwardedPayloads[1].payload.timestamp,
        'retries should preserve CDC event timestamp for deduplication',
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  'applyCDCEvent on non-leader MG forwards noisy control-plane metadata on background lane',
  async (_t) => {
    const port = testPortCounter++;
    const nodeId = `test-node-${port}`;
    const router = new MessageRouter({nodeId, wsPort: port});
    await router.initialize({startServer: true});

    let shutdownCalled = false;
    const cleanup = async () => {
      if (shutdownCalled) return;
      shutdownCalled = true;
      try {
        if (mg && mg.raft) {
          await mg.shutdown();
        }
      } catch (_e) {
        // best-effort
      }
      await router.shutdown();
    };

    let mg;
    try {
      mg = new MessageGroupService({
        groupId: 'mg-1',
        replicaId: 'mg-1-r1',
        nodeId,
        transport: router,
      });
      await mg.initialize();
      mg.replicaIds = ['mg-1-r1', 'mg-1-r2'];
      await mg.subscribeToCDC(SYSTEM_TABLE_NAME.SERVICES);

      mg.isLeader = false;
      mg.role = 'follower';
      mg.leaderId = 'mg-1-r2';
      if (mg.raft) {
        Object.defineProperty(mg.raft, 'state', {
          value: 3,
          writable: true,
          configurable: true,
        });
      }
      mg.resolveCDCForwardSelection = () => ({
        strictForwarding: true,
        strictForwardRetryAfterMs: 250,
        targets: [{
          serviceId: 'mg-1-r2',
          address: 'remote-node/message-group/mg-1-r2',
        }],
        suppressedCount: 0,
      });
      mg.maybeRepairAuthoritativeForwardTopology = async () => false;
      mg.shouldRepairForwardTopology = () => false;
      mg.shouldSuppressForwardTarget = () => false;

      const forwardedPayloads = [];
      router.deliver = async (targetService, payload, options) => {
        forwardedPayloads.push({targetService, payload, options});
        return {acknowledged: true};
      };

      await mg.applyCDCEvent(
        SYSTEM_TABLE_NAME.SERVICES,
        CDC_OPERATION.INSERT,
        {
          service_id: 'svc-metadata-priority',
          node_id: 'node-replay-priority',
          group_id: 'mg-1',
          service_type: SERVICE_TYPE.MESSAGE_GROUP,
          status: SERVICE_STATUS.ACTIVE,
          connection_state: STATE.CONNECTED,
        },
      );

      assert.equal(forwardedPayloads.length, 1,
        'metadata CDC should still forward exactly once to the leader');
      assert.equal(
        forwardedPayloads[0].options?.deliveryPriority,
        'background',
        'noisy control-plane metadata CDC should use background lane',
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  'applyCDCEvent on non-leader MG keeps partition service CDC on the critical lane',
  async (_t) => {
    const port = testPortCounter++;
    const nodeId = `test-node-${port}`;
    const router = new MessageRouter({nodeId, wsPort: port});
    await router.initialize({startServer: true});

    let shutdownCalled = false;
    const cleanup = async () => {
      if (shutdownCalled) return;
      shutdownCalled = true;
      try {
        if (mg && mg.raft) {
          await mg.shutdown();
        }
      } catch (_e) {
        // best-effort
      }
      await router.shutdown();
    };

    let mg;
    try {
      mg = new MessageGroupService({
        groupId: 'mg-1',
        replicaId: 'mg-1-r1',
        nodeId,
        transport: router,
      });
      await mg.initialize();
      mg.replicaIds = ['mg-1-r1', 'mg-1-r2'];
      await mg.subscribeToCDC(SYSTEM_TABLE_NAME.SERVICES);

      mg.isLeader = false;
      mg.role = 'follower';
      mg.leaderId = 'mg-1-r2';
      if (mg.raft) {
        Object.defineProperty(mg.raft, 'state', {
          value: 3,
          writable: true,
          configurable: true,
        });
      }
      mg.resolveCDCForwardSelection = () => ({
        strictForwarding: true,
        strictForwardRetryAfterMs: 250,
        targets: [{
          serviceId: 'mg-1-r2',
          address: 'remote-node/message-group/mg-1-r2',
        }],
        suppressedCount: 0,
      });
      mg.maybeRepairAuthoritativeForwardTopology = async () => false;
      mg.shouldRepairForwardTopology = () => false;
      mg.shouldSuppressForwardTarget = () => false;

      const forwardedPayloads = [];
      router.deliver = async (targetService, payload, options) => {
        forwardedPayloads.push({targetService, payload, options});
        return {acknowledged: true};
      };

      await mg.applyCDCEvent(
        SYSTEM_TABLE_NAME.SERVICES,
        CDC_OPERATION.INSERT,
        {
          service_id: 'nodes-p1-r1',
          partition_id: 'nodes-p1',
          node_id: 'node-control-plane',
          group_id: 'mg-1',
          service_type: SERVICE_TYPE.PARTITION,
          status: SERVICE_STATUS.ACTIVE,
          connection_state: STATE.CONNECTED,
        },
      );

      assert.equal(forwardedPayloads.length, 1,
        'partition service CDC should still forward exactly once to the leader');
      assert.equal(
        forwardedPayloads[0].options?.deliveryPriority,
        'critical',
        'partition service CDC must stay on the critical lane for leader visibility',
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  'replay-only CDC forwarding on non-leader MG yields the critical router ' +
    'lane to fresh control-plane traffic',
  async (_t) => {
    const port = testPortCounter++;
    const nodeId = `test-node-${port}`;
    const router = new MessageRouter({nodeId, wsPort: port});
    await router.initialize({startServer: true});

    let shutdownCalled = false;
    const cleanup = async () => {
      if (shutdownCalled) return;
      shutdownCalled = true;
      try {
        if (mg && mg.raft) {
          await mg.shutdown();
        }
      } catch (_e) {
        // best-effort
      }
      await router.shutdown();
    };

    let mg;
    try {
      mg = new MessageGroupService({
        groupId: 'mg-replay-priority',
        replicaId: 'mg-replay-priority-r1',
        nodeId,
        transport: router,
      });
      await mg.initialize();
      mg.replicaIds = ['mg-replay-priority-r1', 'mg-replay-priority-r2'];

      await mg.subscribeToCDC(TABLES.NODES);

      mg.isLeader = false;
      mg.role = 'follower';
      mg.leaderId = 'mg-replay-priority-r2';
      if (mg.raft) {
        Object.defineProperty(mg.raft, 'state', {
          value: 3,
          writable: true,
          configurable: true,
        });
      }
      mg.resolveCDCForwardSelection = () => ({
        strictForwarding: true,
        strictForwardRetryAfterMs: 250,
        targets: [{
          serviceId: 'mg-replay-priority-r2',
          address: 'seed-node/message-group/mg-replay-priority-r2',
        }],
        suppressedCount: 0,
      });
      mg.maybeRepairAuthoritativeForwardTopology = async () => false;
      mg.shouldRepairForwardTopology = () => false;
      mg.shouldSuppressForwardTarget = () => false;

      const forwardedPayloads = [];
      router.deliver = async (address, payload, options) => {
        forwardedPayloads.push({address, payload, options});
        return {acknowledged: true};
      };

      await mg.applyCDCEvent(
        TABLES.NODES,
        CDC_OPERATION.INSERT,
        {
          node_id: 'node-replay-priority',
          status: SERVICE_STATUS.ACTIVE,
          connection_state: STATE.CONNECTED,
        },
        {replayOnly: true},
      );

      assert.equal(
        forwardedPayloads.length,
        1,
        'non-leader replay should still forward exactly once to the leader',
      );
      assert.equal(
        forwardedPayloads[0].payload.replayOnly,
        true,
        'forwarded replay payload should preserve replay-only context',
      );
      assert.equal(
        forwardedPayloads[0].options?.deliveryPriority,
        'background',
        'replay-only forwarding should use the background router lane so fresh control-plane traffic can overtake it',
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  'applyCDCEvent on non-leader MG preserves causeId across retry forwards',
  async (t) => {
    const port = testPortCounter++;
    const nodeId = `test-node-${port}`;
    const router = new MessageRouter({nodeId, wsPort: port});
    await router.initialize({startServer: true});

    let shutdownCalled = false;
    const cleanup = async () => {
      if (shutdownCalled) return;
      shutdownCalled = true;
      try {
        if (mg && mg.raft) {
          await mg.shutdown();
        }
      } catch (_e) {
        // best-effort
      }
      await router.shutdown();
    };

    let mg;
    try {
      mg = new MessageGroupService({
        groupId: 'mg-retry-cause-id',
        replicaId: 'mg-retry-cause-id-r1',
        nodeId,
        transport: router,
      });
      await mg.initialize();
      mg.replicaIds = ['mg-retry-cause-id-r1', 'mg-retry-cause-id-r2'];
      await mg.subscribeToCDC(NON_SYSTEM_CDC_TABLE);

      mg.isLeader = false;
      mg.role = 'follower';
      mg.leaderId = 'mg-retry-cause-id-r2';
      mg.peerAddresses = ['remote-node/message-group/mg-retry-cause-id-r2'];
      seedLiveRaftPeersFromPeerAddresses(mg);
      mg.retryInitialDelayMs = 20;
      mg.retryBackoffMultiplier = 1;
      mg.retryMaxAttempts = 2;

      const forwardedPayloads = [];
      let deliverAttempt = 0;
      router.deliver = async (address, payload, options) => {
        deliverAttempt += 1;
        forwardedPayloads.push({address, payload, options, attempt: deliverAttempt});
        if (deliverAttempt === 1) {
          throw new Error('transient forward failure');
        }
        return {acknowledged: true};
      };

      const causeId = 'cause-1';
      const cdcTimestamp = '1234567890:99';
      await mg.applyCDCEvent(
        NON_SYSTEM_CDC_TABLE,
        'INSERT',
        {partition_id: 'tbl-bench-p-cause'},
        {timestamp: cdcTimestamp, causeId},
      );

      const observedRetry = await waitForCondition(
        () => forwardedPayloads.length >= 2,
        2000,
        20,
      );
      t.equal(observedRetry, true, 'should retry forwarding after a transient failure');
      t.equal(forwardedPayloads.length >= 2, true, 'should attempt delivery at least twice');
      t.equal(
        forwardedPayloads[0].payload.causeId,
        forwardedPayloads[1].payload.causeId,
        'retries should preserve causeId for correlation',
      );
      t.equal(
        forwardedPayloads[0].payload.causeId,
        causeId,
        'forwarded payload should include the initiating causeId',
      );
      t.equal(
        forwardedPayloads[0].payload.timestamp,
        cdcTimestamp,
        'forwarded payload should preserve CDC event timestamp for deduplication',
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  'applyCDCEvent on non-leader MG retries forward when leader is initially unknown',
  async (t) => {
    const port = testPortCounter++;
    const nodeId = `test-node-${port}`;
    const router = new MessageRouter({nodeId, wsPort: port});
    await router.initialize({startServer: true});

    let shutdownCalled = false;
    const cleanup = async () => {
      if (shutdownCalled) return;
      shutdownCalled = true;
      try {
        if (mg && mg.raft) {
          await mg.shutdown();
        }
      } catch (_e) {
        // best-effort
      }
      await router.shutdown();
    };

    let mg;
    try {
      mg = new MessageGroupService({
        groupId: 'mg-unknown-leader-retry',
        replicaId: 'mg-unknown-leader-retry-r1',
        nodeId,
        transport: router,
      });
      await mg.initialize();
      mg.replicaIds = ['mg-unknown-leader-retry-r1', 'mg-unknown-leader-retry-r2'];
      await mg.subscribeToCDC(NON_SYSTEM_CDC_TABLE);

      mg.isLeader = false;
      mg.role = 'follower';
      mg.leaderId = null;
      mg.peerAddresses = ['remote-node/message-group/mg-unknown-leader-retry-r2'];
      seedLiveRaftPeersFromPeerAddresses(mg);
      mg.retryInitialDelayMs = 20;
      mg.retryBackoffMultiplier = 1;
      mg.retryMaxAttempts = 5;

      let deliverCount = 0;
      router.deliver = async (_address, _payload, _options) => {
        deliverCount += 1;
        return {acknowledged: true, success: true};
      };

      setTimeout(() => {
        mg.leaderId = 'mg-unknown-leader-retry-r2';
      }, 30);

      const cdcTimestamp = '1234567890:3';
      await mg.applyCDCEvent(
        NON_SYSTEM_CDC_TABLE,
        'INSERT',
        {partition_id: 'p-unknown-leader'},
        {timestamp: cdcTimestamp},
      );

      const delivered = await waitForCondition(
        () => deliverCount > 0,
        1000,
        20,
      );

      t.ok(delivered, 'should retry forward until leader metadata is available');
      t.equal(deliverCount, 1, 'should deliver once when leader becomes known');
    } finally {
      await cleanup();
    }
  },
);

test(
  'applyCDCEvent on non-leader MG resolves leader target from services cache',
  async (t) => {
    const port = testPortCounter++;
    const nodeId = `test-node-${port}`;
    const router = new MessageRouter({nodeId, wsPort: port});
    await router.initialize({startServer: true});

    let shutdownCalled = false;
    const cleanup = async () => {
      if (shutdownCalled) return;
      shutdownCalled = true;
      try {
        if (mg && mg.raft) {
          await mg.shutdown();
        }
      } catch (_e) {
        // best-effort
      }
      await router.shutdown();
    };

    let mg;
    try {
      mg = new MessageGroupService({
        groupId: 'mg-cache-leader',
        replicaId: 'mg-cache-leader-r1',
        nodeId,
        transport: router,
      });
      await mg.initialize();
      mg.replicaIds = ['mg-cache-leader-r1', 'mg-cache-leader-r2'];
      await mg.subscribeToCDC(NON_SYSTEM_CDC_TABLE);

      mg.isLeader = false;
      mg.role = 'follower';
      mg.leaderId = null;
      if (mg.raft) {
        Object.defineProperty(mg.raft, 'state', {
          value: LifeRaft.FOLLOWER,
          writable: true,
          configurable: true,
        });
      }

      mg.systemTableCache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPSERT, {
        service_id: 'mg-cache-leader-r2',
        service_type: SERVICE_TYPE.MESSAGE_GROUP,
        group_id: 'mg-cache-leader',
        replica_id: 'mg-cache-leader-r2',
        node_id: 'remote-node',
        status: SERVICE_STATUS.ACTIVE,
        raft_role: 'leader',
        address: 'remote-node/message-group/mg-cache-leader-r2',
        updated_at: Date.now(),
      });

      const forwardedPayloads = [];
      router.deliver = async (address, payload, options) => {
        forwardedPayloads.push({address, payload, options});
        return {acknowledged: true, success: true};
      };

      await mg.applyCDCEvent(
        NON_SYSTEM_CDC_TABLE,
        'INSERT',
        {partition_id: 'p-cache-leader'},
        {timestamp: '1234567890:5'},
      );

      t.equal(forwardedPayloads.length, 1, 'should forward exactly once');
      t.equal(
        forwardedPayloads[0]?.address,
        'remote-node/message-group/mg-cache-leader-r2',
        'should route to the cache-resolved message-group leader',
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  'applyCDCEvent on non-leader MG prefers explicit services leader over stale canonical group leader',
  async (t) => {
    const port = testPortCounter++;
    const nodeId = `test-node-${port}`;
    const router = new MessageRouter({nodeId, wsPort: port});
    await router.initialize({startServer: true});

    let shutdownCalled = false;
    const cleanup = async () => {
      if (shutdownCalled) return;
      shutdownCalled = true;
      try {
        if (mg && mg.raft) {
          await mg.shutdown();
        }
      } catch (_e) {
        // best-effort
      }
      await router.shutdown();
    };

    let mg;
    try {
      mg = new MessageGroupService({
        groupId: 'mg-stale-canonical-leader',
        replicaId: 'mg-stale-canonical-leader-r1',
        nodeId,
        transport: router,
      });
      await mg.initialize();
      mg.replicaIds = [
        'mg-stale-canonical-leader-r1',
        'mg-stale-canonical-leader-r2',
        'mg-stale-canonical-leader-r3',
      ];
      await mg.subscribeToCDC(NON_SYSTEM_CDC_TABLE);

      mg.isLeader = false;
      mg.role = 'follower';
      mg.leaderId = null;
      if (mg.raft) {
        Object.defineProperty(mg.raft, 'state', {
          value: LifeRaft.FOLLOWER,
          writable: true,
          configurable: true,
        });
      }

      mg.systemTableCache.applySystemTableChange(
        TABLES.MESSAGE_GROUPS,
        CDC_OPERATION.UPSERT,
        {
          group_id: 'mg-stale-canonical-leader',
          leader_node_id: 'stale-node',
        },
      );
      mg.systemTableCache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPSERT, {
        service_id: 'mg-stale-canonical-leader-r2',
        service_type: SERVICE_TYPE.MESSAGE_GROUP,
        group_id: 'mg-stale-canonical-leader',
        replica_id: 'mg-stale-canonical-leader-r2',
        node_id: 'stale-node',
        status: SERVICE_STATUS.ACTIVE,
        raft_role: 'follower',
        address: 'stale-node/message-group/mg-stale-canonical-leader-r2',
        updated_at: Date.now(),
      });
      mg.systemTableCache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPSERT, {
        service_id: 'mg-stale-canonical-leader-r3',
        service_type: SERVICE_TYPE.MESSAGE_GROUP,
        group_id: 'mg-stale-canonical-leader',
        replica_id: 'mg-stale-canonical-leader-r3',
        node_id: 'fresh-node',
        status: SERVICE_STATUS.ACTIVE,
        raft_role: 'leader',
        address: 'fresh-node/message-group/mg-stale-canonical-leader-r3',
        updated_at: Date.now() + 1,
      });

      const forwardedPayloads = [];
      router.deliver = async (address, payload, options) => {
        forwardedPayloads.push({address, payload, options});
        return {acknowledged: true, success: true};
      };

      await mg.applyCDCEvent(
        NON_SYSTEM_CDC_TABLE,
        'INSERT',
        {partition_id: 'p-stale-canonical-leader'},
        {timestamp: '1234567890:6'},
      );

      t.equal(forwardedPayloads.length, 1, 'should forward exactly once');
      t.equal(
        forwardedPayloads[0]?.address,
        'fresh-node/message-group/mg-stale-canonical-leader-r3',
        'should route to the explicit services leader instead of the stale canonical leader node',
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  'applyCDCEvent on non-leader MG forwards to freshest peer when leader role metadata lags',
  async (t) => {
    const port = testPortCounter++;
    const nodeId = `test-node-${port}`;
    const router = new MessageRouter({nodeId, wsPort: port});
    await router.initialize({startServer: true});

    let shutdownCalled = false;
    const cleanup = async () => {
      if (shutdownCalled) return;
      shutdownCalled = true;
      try {
        if (mg && mg.raft) {
          await mg.shutdown();
        }
      } catch (_e) {
        // best-effort
      }
      await router.shutdown();
    };

    let mg;
    try {
      mg = new MessageGroupService({
        groupId: 'mg-lagging-leader-metadata',
        replicaId: 'mg-lagging-leader-metadata-r1',
        nodeId,
        transport: router,
      });
      await mg.initialize();
      mg.replicaIds = [
        'mg-lagging-leader-metadata-r1',
        'mg-lagging-leader-metadata-r2',
        'mg-lagging-leader-metadata-r3',
      ];
      await mg.subscribeToCDC(NON_SYSTEM_CDC_TABLE);

      mg.isLeader = false;
      mg.role = 'follower';
      mg.leaderId = null;
      if (mg.raft) {
        Object.defineProperty(mg.raft, 'state', {
          value: LifeRaft.FOLLOWER,
          writable: true,
          configurable: true,
        });
      }

      mg.systemTableCache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPSERT, {
        service_id: 'mg-lagging-leader-metadata-r2',
        service_type: SERVICE_TYPE.MESSAGE_GROUP,
        group_id: 'mg-lagging-leader-metadata',
        replica_id: 'mg-lagging-leader-metadata-r2',
        node_id: 'remote-node-2',
        status: SERVICE_STATUS.ACTIVE,
        raft_role: 'candidate',
        address: 'remote-node-2/message-group/mg-lagging-leader-metadata-r2',
        updated_at: 100,
      });
      mg.systemTableCache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPSERT, {
        service_id: 'mg-lagging-leader-metadata-r3',
        service_type: SERVICE_TYPE.MESSAGE_GROUP,
        group_id: 'mg-lagging-leader-metadata',
        replica_id: 'mg-lagging-leader-metadata-r3',
        node_id: 'remote-node-3',
        status: SERVICE_STATUS.ACTIVE,
        raft_role: 'candidate',
        address: 'remote-node-3/message-group/mg-lagging-leader-metadata-r3',
        updated_at: 200,
      });

      const forwardedPayloads = [];
      router.deliver = async (address, payload, options) => {
        forwardedPayloads.push({address, payload, options});
        return {acknowledged: true, success: true};
      };

      await mg.applyCDCEvent(
        NON_SYSTEM_CDC_TABLE,
        'INSERT',
        {partition_id: 'p-lagging-leader-metadata'},
        {timestamp: '1234567890:7'},
      );

      t.equal(forwardedPayloads.length, 1, 'should forward exactly once');
      t.equal(
        forwardedPayloads[0]?.address,
        'remote-node-3/message-group/mg-lagging-leader-metadata-r3',
        'should prefer the freshest active peer when no leader row is available',
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  'applyCDCEvent on non-leader MG avoids freshest-peer probing for system-table forwarding',
  async (t) => {
    const port = testPortCounter++;
    const nodeId = `test-node-${port}`;
    const router = new MessageRouter({nodeId, wsPort: port});
    await router.initialize({startServer: true});

    let shutdownCalled = false;
    const cleanup = async () => {
      if (shutdownCalled) return;
      shutdownCalled = true;
      try {
        if (mg && mg.raft) {
          await mg.shutdown();
        }
      } catch (_e) {
        // best-effort
      }
      await router.shutdown();
    };

    let mg;
    try {
      mg = new MessageGroupService({
        groupId: 'mg-system-forward-strict',
        replicaId: 'mg-system-forward-strict-r1',
        nodeId,
        transport: router,
      });
      await mg.initialize();
      mg.replicaIds = [
        'mg-system-forward-strict-r1',
        'mg-system-forward-strict-r2',
        'mg-system-forward-strict-r3',
      ];
      await mg.subscribeToCDC(TABLES.NODES);

      mg.isLeader = false;
      mg.role = 'follower';
      mg.leaderId = null;
      if (mg.raft) {
        Object.defineProperty(mg.raft, 'state', {
          value: LifeRaft.FOLLOWER,
          writable: true,
          configurable: true,
        });
      }

      mg.systemTableCache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPSERT, {
        service_id: 'mg-system-forward-strict-r2',
        service_type: SERVICE_TYPE.MESSAGE_GROUP,
        group_id: 'mg-system-forward-strict',
        replica_id: 'mg-system-forward-strict-r2',
        node_id: 'remote-node-2',
        status: SERVICE_STATUS.ACTIVE,
        raft_role: 'follower',
        address: 'remote-node-2/message-group/mg-system-forward-strict-r2',
        updated_at: 100,
      });
      mg.systemTableCache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPSERT, {
        service_id: 'mg-system-forward-strict-r3',
        service_type: SERVICE_TYPE.MESSAGE_GROUP,
        group_id: 'mg-system-forward-strict',
        replica_id: 'mg-system-forward-strict-r3',
        node_id: 'remote-node-3',
        status: SERVICE_STATUS.ACTIVE,
        raft_role: 'follower',
        address: 'remote-node-3/message-group/mg-system-forward-strict-r3',
        updated_at: 200,
      });

      const forwardedPayloads = [];
      router.deliver = async (address, payload, options) => {
        forwardedPayloads.push({address, payload, options});
        return {acknowledged: true, success: true};
      };

      await t.rejects(
        mg.applyCDCEvent(
          TABLES.NODES,
          'UPSERT',
          {node_id: 'node-1'},
          {timestamp: '1234567890:8'},
        ),
        new Error(MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN),
        'system-table forwarding should require leader metadata instead of probing peers',
      );

      t.equal(
        forwardedPayloads.length,
        0,
        'system-table forwarding should not probe freshest peers when leader metadata is missing',
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  'applyCDCEvent on non-leader MG uses live raft leader for strict system-table forwarding',
  async (t) => {
    const port = testPortCounter++;
    const nodeId = `test-node-${port}`;
    const router = new MessageRouter({nodeId, wsPort: port});
    await router.initialize({startServer: true});

    let shutdownCalled = false;
    const cleanup = async () => {
      if (shutdownCalled) return;
      shutdownCalled = true;
      try {
        if (mg && mg.raft) {
          await mg.shutdown();
        }
      } catch (_e) {
        // best-effort
      }
      await router.shutdown();
    };

    let mg;
    try {
      mg = new MessageGroupService({
        groupId: 'mg-system-forward-live-leader',
        replicaId: 'mg-system-forward-live-leader-r1',
        nodeId,
        transport: router,
      });
      await mg.initialize();
      mg.replicaIds = [
        'mg-system-forward-live-leader-r1',
        'mg-system-forward-live-leader-r2',
        'mg-system-forward-live-leader-r3',
      ];
      await mg.subscribeToCDC(TABLES.NODES);

      mg.isLeader = false;
      mg.role = 'follower';
      mg.leaderId = 'mg-system-forward-live-leader-r2';
      if (mg.raft) {
        Object.defineProperty(mg.raft, 'state', {
          value: LifeRaft.FOLLOWER,
          writable: true,
          configurable: true,
        });
      }

      mg.systemTableCache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPSERT, {
        service_id: 'mg-system-forward-live-leader-r2',
        service_type: SERVICE_TYPE.MESSAGE_GROUP,
        group_id: 'mg-system-forward-live-leader',
        replica_id: 'mg-system-forward-live-leader-r2',
        node_id: 'remote-node-2',
        status: SERVICE_STATUS.ACTIVE,
        raft_role: 'follower',
        address: 'remote-node-2/message-group/mg-system-forward-live-leader-r2',
        updated_at: 100,
      });
      mg.systemTableCache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPSERT, {
        service_id: 'mg-system-forward-live-leader-r3',
        service_type: SERVICE_TYPE.MESSAGE_GROUP,
        group_id: 'mg-system-forward-live-leader',
        replica_id: 'mg-system-forward-live-leader-r3',
        node_id: 'remote-node-3',
        status: SERVICE_STATUS.ACTIVE,
        raft_role: 'follower',
        address: 'remote-node-3/message-group/mg-system-forward-live-leader-r3',
        updated_at: 200,
      });

      const forwardedPayloads = [];
      const originalGetConnectionState = router.getConnectionState.bind(router);
      router.getConnectionState = (targetNodeId) => {
        if (targetNodeId === 'remote-node-2') {
          return STATE.CONNECTED;
        }
        return originalGetConnectionState(targetNodeId);
      };
      router.deliver = async (address, payload, options) => {
        forwardedPayloads.push({address, payload, options});
        return {acknowledged: true, success: true};
      };

      await mg.applyCDCEvent(
        TABLES.NODES,
        'UPSERT',
        {node_id: 'node-1'},
        {timestamp: '1234567890:9'},
      );

      t.same(
        forwardedPayloads.map((entry) => entry.address),
        ['remote-node-2/message-group/mg-system-forward-live-leader-r2'],
        'strict system-table forwarding should use the live raft leader without probing peers',
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  'applyCDCEvent on non-leader MG does not fall back to bootstrap peer hints for steady-state forwarding',
  async (t) => {
    const port = testPortCounter++;
    const nodeId = `test-node-${port}`;
    const router = new MessageRouter({nodeId, wsPort: port});
    await router.initialize({startServer: true});

    let shutdownCalled = false;
    const cleanup = async () => {
      if (shutdownCalled) return;
      shutdownCalled = true;
      try {
        if (mg && mg.raft) {
          await mg.shutdown();
        }
      } catch (_e) {
        // best-effort
      }
      await router.shutdown();
    };

    let mg;
    try {
      mg = new MessageGroupService({
        groupId: 'mg-bootstrap-peer-forward',
        replicaId: 'mg-bootstrap-peer-forward-r1',
        nodeId,
        transport: router,
      });
      await mg.initialize();
      mg.replicaIds = [
        'mg-bootstrap-peer-forward-r1',
        'mg-bootstrap-peer-forward-r2',
        'mg-bootstrap-peer-forward-r3',
      ];
      mg.peerAddresses = [
        'remote-node-2/message-group/mg-bootstrap-peer-forward-r2',
        'remote-node-3/message-group/mg-bootstrap-peer-forward-r3',
      ];
      await mg.subscribeToCDC(NON_SYSTEM_CDC_TABLE);

      mg.isLeader = false;
      mg.role = 'follower';
      mg.leaderId = null;
      if (mg.raft) {
        Object.defineProperty(mg.raft, 'state', {
          value: LifeRaft.FOLLOWER,
          writable: true,
          configurable: true,
        });
      }

      const forwardedPayloads = [];
      router.deliver = async (address, payload, options) => {
        forwardedPayloads.push({address, payload, options});
        return {acknowledged: true, success: true};
      };

      await t.rejects(
        () => mg.applyCDCEvent(
          NON_SYSTEM_CDC_TABLE,
          'INSERT',
          {partition_id: 'p-bootstrap-peer-forward'},
          {timestamp: '1234567890:8'},
        ),
        /leader address is unavailable|Unable to resolve unified peer address/i,
        'steady-state forwarding should fail closed when only bootstrap peer hints remain',
      );

      t.equal(
        forwardedPayloads.length,
        0,
        'steady-state forwarding should not attempt delivery through bootstrap peer hints',
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  'applyCDCEvent on non-leader MG prefers a connected relay target during restart windows',
  async (t) => {
    const port = testPortCounter++;
    const nodeId = `test-node-${port}`;
    const router = new MessageRouter({nodeId, wsPort: port});
    await router.initialize({startServer: true});

    let shutdownCalled = false;
    const cleanup = async () => {
      if (shutdownCalled) return;
      shutdownCalled = true;
      try {
        if (mg && mg.raft) {
          await mg.shutdown();
        }
      } catch (_e) {
        // best-effort
      }
      await router.shutdown();
    };

    let mg;
    try {
      mg = new MessageGroupService({
        groupId: 'mg-connected-relay',
        replicaId: 'mg-connected-relay-r1',
        nodeId,
        transport: router,
      });
      await mg.initialize();
      mg.replicaIds = [
        'mg-connected-relay-r1',
        'mg-connected-relay-r2',
        'mg-connected-relay-r3',
      ];
      await mg.subscribeToCDC(NON_SYSTEM_CDC_TABLE);

      mg.isLeader = false;
      mg.role = 'follower';
      mg.leaderId = 'mg-connected-relay-r2';
      if (mg.raft) {
        Object.defineProperty(mg.raft, 'state', {
          value: LifeRaft.FOLLOWER,
          writable: true,
          configurable: true,
        });
      }

      mg.systemTableCache.applySystemTableChange(TABLES.MESSAGE_GROUPS, CDC_OPERATION.UPSERT, {
        group_id: 'mg-connected-relay',
        leader_node_id: 'node-leader',
      });
      mg.systemTableCache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPSERT, {
        service_id: 'mg-connected-relay-r2',
        service_type: SERVICE_TYPE.MESSAGE_GROUP,
        group_id: 'mg-connected-relay',
        replica_id: 'mg-connected-relay-r2',
        node_id: 'node-leader',
        status: SERVICE_STATUS.ACTIVE,
        raft_role: 'leader',
        address: 'node-leader/message-group/mg-connected-relay-r2',
        updated_at: Date.now() + 2,
      });
      mg.systemTableCache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPSERT, {
        service_id: 'mg-connected-relay-r3',
        service_type: SERVICE_TYPE.MESSAGE_GROUP,
        group_id: 'mg-connected-relay',
        replica_id: 'mg-connected-relay-r3',
        node_id: 'node-relay',
        status: SERVICE_STATUS.ACTIVE,
        raft_role: 'follower',
        address: 'node-relay/message-group/mg-connected-relay-r3',
        updated_at: Date.now() + 1,
      });

      const originalGetConnectionState = router.getConnectionState.bind(router);
      router.getConnectionState = (targetNodeId) => {
        if (targetNodeId === 'node-relay') {
          return STATE.CONNECTED;
        }
        if (targetNodeId === 'node-leader') {
          return STATE.DISCONNECTED;
        }
        return originalGetConnectionState(targetNodeId);
      };

      const forwardedPayloads = [];
      router.deliver = async (address, payload, options) => {
        forwardedPayloads.push({address, payload, options});
        return {acknowledged: true, success: true};
      };

      await mg.applyCDCEvent(
        NON_SYSTEM_CDC_TABLE,
        'INSERT',
        {partition_id: 'p-connected-relay'},
        {timestamp: '1234567890:9'},
      );

      t.equal(forwardedPayloads.length, 1, 'should forward exactly once');
      t.equal(
        forwardedPayloads[0]?.address,
        'node-relay/message-group/mg-connected-relay-r3',
        'should prefer a connected relay target over a disconnected canonical leader',
      );
    } finally {
      await cleanup();
    }
  },
);

registerCdcNonLeaderPropagationTailTests({
  test,
});
