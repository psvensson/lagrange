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

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import assert from 'node:assert/strict';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {
  CDC_OPERATION,
  SERVICE_STATUS,
  SERVICE_TYPE,
  STATE,
  TABLES,
} from '../../src/constants/index.js';
import {
  ROUTER_ERROR_MSG,
  TRANSPORT_ERROR_MSG,
} from '../../src/constants/transport.js';
import LifeRaft from '@markwylde/liferaft';
import {
  MessageGroupService,
} from '../../src/message-group/message-group-service.js';
import {
  MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE,
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
        'critical',
        'Non-leader CDC forwarding must use critical router priority',
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
  'applyCDCEvent on non-leader MG forwards via bootstrap peer hints when cache has no leader metadata',
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

      await mg.applyCDCEvent(
        NON_SYSTEM_CDC_TABLE,
        'INSERT',
        {partition_id: 'p-bootstrap-peer-forward'},
        {timestamp: '1234567890:8'},
      );

      t.equal(forwardedPayloads.length, 1, 'should forward exactly once');
      t.equal(
        forwardedPayloads[0]?.address,
        'remote-node-2/message-group/mg-bootstrap-peer-forward-r2',
        'should fall back to bootstrap peer hints when cache metadata is absent',
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

test(
  'applyCDCEvent on non-leader MG keeps strict system-table routing on the canonical leader when readiness is stale',
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
        groupId: 'mg-strict-stale-ready',
        replicaId: 'mg-strict-stale-ready-r1',
        nodeId,
        transport: router,
      });
      await mg.initialize();
      mg.replicaIds = [
        'mg-strict-stale-ready-r1',
        'mg-strict-stale-ready-r2',
        'mg-strict-stale-ready-r3',
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

      const now = Date.now();
      mg.systemTableCache.applySystemTableChange(TABLES.MESSAGE_GROUPS, CDC_OPERATION.UPSERT, {
        group_id: 'mg-strict-stale-ready',
        leader_node_id: 'node-leader',
      });
      mg.systemTableCache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.UPSERT, {
        node_id: 'node-leader',
        connection_state: STATE.READY,
        ready_lease_expires_at: now - 1,
      });
      mg.systemTableCache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.UPSERT, {
        node_id: 'node-relay',
        connection_state: STATE.READY,
        ready_lease_expires_at: now + 60000,
      });
      mg.systemTableCache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPSERT, {
        service_id: 'mg-strict-stale-ready-r2',
        service_type: SERVICE_TYPE.MESSAGE_GROUP,
        group_id: 'mg-strict-stale-ready',
        replica_id: 'mg-strict-stale-ready-r2',
        node_id: 'node-leader',
        status: SERVICE_STATUS.ACTIVE,
        raft_role: 'leader',
        address: 'node-leader/message-group/mg-strict-stale-ready-r2',
        updated_at: now + 2,
      });
      mg.systemTableCache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPSERT, {
        service_id: 'mg-strict-stale-ready-r3',
        service_type: SERVICE_TYPE.MESSAGE_GROUP,
        group_id: 'mg-strict-stale-ready',
        replica_id: 'mg-strict-stale-ready-r3',
        node_id: 'node-relay',
        status: SERVICE_STATUS.ACTIVE,
        raft_role: 'follower',
        address: 'node-relay/message-group/mg-strict-stale-ready-r3',
        updated_at: now + 1,
      });

      const originalGetConnectionState = router.getConnectionState.bind(router);
      router.getConnectionState = (targetNodeId) => {
        if (targetNodeId === 'node-relay') {
          return STATE.CONNECTED;
        }
        if (targetNodeId === 'node-leader') {
          return STATE.CONNECTED;
        }
        return originalGetConnectionState(targetNodeId);
      };

      const forwardedPayloads = [];
      router.deliver = async (address, payload, options) => {
        forwardedPayloads.push({address, payload, options});
        return {acknowledged: true, success: true};
      };

      await mg.applyCDCEvent(
        TABLES.NODES,
        'UPDATE',
        {node_id: 'node-x', connection_state: STATE.READY},
        {timestamp: '1234567890:10'},
      );

      t.equal(forwardedPayloads.length, 1, 'should forward exactly once');
      t.equal(
        forwardedPayloads[0]?.address,
        'node-leader/message-group/mg-strict-stale-ready-r2',
        'strict system-table forwarding should keep the canonical leader target even when node readiness is stale',
      );
      t.equal(
        mg.canAcceptCDCEvent({
          tableName: TABLES.NODES,
          operation: 'UPDATE',
        }).ready,
        true,
        'strict readiness should remain routable when canonical leader metadata still exists',
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  'applyCDCEvent on non-leader MG fails closed when leader delivery exhausts retry budget',
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
        groupId: 'mg-retry-exhausted',
        replicaId: 'mg-retry-exhausted-r1',
        nodeId,
        transport: router,
      });
      await mg.initialize();
      mg.replicaIds = ['mg-retry-exhausted-r1', 'mg-retry-exhausted-r2'];
      await mg.subscribeToCDC(NON_SYSTEM_CDC_TABLE);

      mg.isLeader = false;
      mg.role = 'follower';
      mg.leaderId = 'mg-retry-exhausted-r2';
      mg.peerAddresses = ['remote-node/message-group/mg-retry-exhausted-r2'];
      mg.retryInitialDelayMs = 20;
      mg.retryBackoffMultiplier = 1;
      mg.retryMaxAttempts = 2;

      let deliverAttempts = 0;
      router.deliver = async () => {
        deliverAttempts += 1;
        throw new Error('leader unreachable');
      };

      await t.rejects(
        mg.applyCDCEvent(
          NON_SYSTEM_CDC_TABLE,
          'INSERT',
          {partition_id: 'p-retry-exhausted'},
          {timestamp: '1234567890:6'},
        ),
        /retry budget exhausted|leader unreachable/,
        'should surface replication failure once retry budget is exhausted',
      );
      t.equal(deliverAttempts, 2, 'should honor bounded retry attempts before failing');
    } finally {
      await cleanup();
    }
  },
);

test(
  'applyCDCEvent on non-leader MG does not mutate cache when leader forward fails',
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
        groupId: 'mg-nonleader-no-local-apply',
        replicaId: 'mg-nonleader-no-local-apply-r1',
        nodeId,
        transport: router,
      });
      await mg.initialize();
      mg.replicaIds = [
        'mg-nonleader-no-local-apply-r1',
        'mg-nonleader-no-local-apply-r2',
      ];
      await mg.subscribeToCDC(NON_SYSTEM_CDC_TABLE);

      mg.isLeader = false;
      mg.role = 'follower';
      mg.leaderId = 'mg-nonleader-no-local-apply-r2';
      mg.peerAddresses = ['remote-node/message-group/mg-nonleader-no-local-apply-r2'];
      mg.retryInitialDelayMs = 20;
      mg.retryBackoffMultiplier = 1;
      mg.retryMaxAttempts = 1;

      router.deliver = async () => {
        throw new Error('leader unreachable');
      };

      await t.rejects(
        mg.applyCDCEvent(
          NON_SYSTEM_CDC_TABLE,
          'INSERT',
          {partition_id: 'p-nonleader-forward-fail'},
          {timestamp: '1234567890:12'},
        ),
        /retry budget exhausted|leader unreachable/,
        'should fail closed when non-leader cannot forward to leader',
      );

      const cache = NodeService.getInstance().getSystemTableCache();
      const cached = cache.get(TABLES.PARTITIONS, 'p-nonleader-forward-fail');
      t.equal(
        cached,
        undefined,
        'non-leader forward failure must not speculatively mutate local cache',
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  'applyCDCEvent on non-leader MG fails when no leader route exists past retry budget',
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
        groupId: 'mg-retry-past-budget',
        replicaId: 'mg-retry-past-budget-r1',
        nodeId,
        transport: router,
      });
      await mg.initialize();
      mg.replicaIds = ['mg-retry-past-budget-r1', 'mg-retry-past-budget-r2'];
      await mg.subscribeToCDC(NON_SYSTEM_CDC_TABLE);

      mg.isLeader = false;
      mg.role = 'follower';
      mg.leaderId = null;
      mg.retryInitialDelayMs = 20;
      mg.retryBackoffMultiplier = 1;
      mg.retryMaxAttempts = 2;

      let deliverCount = 0;
      router.deliver = async (_address, _payload, _options) => {
        deliverCount += 1;
        return {acknowledged: true, success: true};
      };

      await t.rejects(
        mg.applyCDCEvent(
          NON_SYSTEM_CDC_TABLE,
          'INSERT',
          {partition_id: 'p-retry-past-budget'},
          {timestamp: '1234567890:4'},
        ),
        /retry budget exhausted|leader address is unavailable/,
        'should fail closed when no leader route converges in retry budget',
      );
      t.equal(deliverCount, 0, 'should not deliver when leader address stays unresolved');
    } finally {
      await cleanup();
    }
  },
);

test(
  'applyCDCEvent on non-leader MG fails closed when leader target has no handler',
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
        groupId: 'mg-no-handler',
        replicaId: 'mg-no-handler-r1',
        nodeId,
        transport: router,
      });
      await mg.initialize();
      mg.replicaIds = ['mg-no-handler-r1', 'mg-no-handler-r2'];
      await mg.subscribeToCDC(NON_SYSTEM_CDC_TABLE);

      mg.isLeader = false;
      mg.role = 'follower';
      mg.leaderId = 'mg-no-handler-r2';
      mg.peerAddresses = ['remote-node/message-group/mg-no-handler-r2'];
      mg.retryMaxAttempts = 1;

      let deliverAttempts = 0;
      router.deliver = async () => {
        deliverAttempts += 1;
        return {
          acknowledged: true,
          noHandler: true,
          error: 'No handler for address: remote-node/message-group/mg-no-handler-r2',
        };
      };

      await t.rejects(
        mg.applyCDCEvent(
          NON_SYSTEM_CDC_TABLE,
          'INSERT',
          {partition_id: 'p-no-handler'},
          {timestamp: '1234567890:10'},
        ),
        /not acknowledged|No handler for address/i,
        'should fail closed when forward target does not handle the payload',
      );
      t.equal(deliverAttempts, 1, 'should reject immediately on no-handler ack');
    } finally {
      await cleanup();
    }
  },
);

test(
  'applyCDCEvent repairs authoritative message-group topology after stale relay rejects leader forwarding',
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
      const groupId = 'mg-forward-topology-repair';
      const staleReplicaId = `${groupId}-r2`;
      const freshReplicaId = `${groupId}-r3`;
      const staleAddress = `stale-node/message-group/${staleReplicaId}`;
      const freshAddress = `fresh-node/message-group/${freshReplicaId}`;
      const nowMs = Date.now();
      const authoritativeReadCalls = [];

      mg = new MessageGroupService({
        groupId,
        replicaId: `${groupId}-r1`,
        nodeId,
        transport: router,
        cdcIntegrationService: {
          executeAuthoritativeSystemTableRead: async (
            tableName,
            sql,
            params,
          ) => {
            authoritativeReadCalls.push({tableName, sql, params});
            if (tableName === TABLES.MESSAGE_GROUPS) {
              return {
                success: true,
                rows: [{
                  group_id: groupId,
                  leader_node_id: 'fresh-node',
                  updated_at: nowMs + 20,
                }],
              };
            }
            if (tableName === TABLES.SERVICES) {
              return {
                success: true,
                rows: [
                  {
                    service_id: staleReplicaId,
                    group_id: groupId,
                    node_id: 'stale-node',
                    service_type: SERVICE_TYPE.MESSAGE_GROUP,
                    status: SERVICE_STATUS.ACTIVE,
                    address: staleAddress,
                    raft_role: 'follower',
                    updated_at: nowMs + 21,
                  },
                  {
                    service_id: freshReplicaId,
                    group_id: groupId,
                    node_id: 'fresh-node',
                    service_type: SERVICE_TYPE.MESSAGE_GROUP,
                    status: SERVICE_STATUS.ACTIVE,
                    address: freshAddress,
                    raft_role: 'leader',
                    updated_at: nowMs + 22,
                  },
                ],
              };
            }
            if (tableName === TABLES.NODES) {
              return {
                success: true,
                rows: [
                  {
                    node_id: 'stale-node',
                    status: SERVICE_STATUS.ACTIVE,
                    connection_state: 'ready',
                    last_heartbeat: nowMs,
                    ready_lease_expires_at: nowMs + 60000,
                  },
                  {
                    node_id: 'fresh-node',
                    status: SERVICE_STATUS.ACTIVE,
                    connection_state: 'ready',
                    last_heartbeat: nowMs + 1,
                    ready_lease_expires_at: nowMs + 60000,
                  },
                ],
              };
            }
            return {
              success: false,
              rows: [],
            };
          },
        },
      });
      await mg.initialize();
      mg.replicaIds = [
        `${groupId}-r1`,
        staleReplicaId,
        freshReplicaId,
      ];
      await mg.subscribeToCDC(NON_SYSTEM_CDC_TABLE);

      mg.isLeader = false;
      mg.role = 'follower';
      mg.leaderId = staleReplicaId;
      mg.retryMaxAttempts = 2;
      mg.retryInitialDelayMs = 1;
      mg.retryBackoffMultiplier = 1;
      mg.forwardTargetSuppressionMs = 1000;
      mg.computeCdcForwardRetryDelayMs = () => 0;
      if (mg.raft) {
        Object.defineProperty(mg.raft, 'state', {
          value: LifeRaft.FOLLOWER,
          writable: true,
          configurable: true,
        });
      }

      const cache = NodeService.getInstance().getSystemTableCache();
      cache.applySystemTableChange(TABLES.MESSAGE_GROUPS, CDC_OPERATION.UPSERT, {
        group_id: groupId,
        leader_node_id: 'stale-node',
        updated_at: nowMs,
      });
      cache.applySystemTableChange(TABLES.NODES, CDC_OPERATION.UPSERT, {
        node_id: 'stale-node',
        status: SERVICE_STATUS.ACTIVE,
        connection_state: 'ready',
        last_heartbeat: nowMs,
        ready_lease_expires_at: nowMs + 60000,
      });
      cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPSERT, {
        service_id: staleReplicaId,
        group_id: groupId,
        node_id: 'stale-node',
        service_type: SERVICE_TYPE.MESSAGE_GROUP,
        status: SERVICE_STATUS.ACTIVE,
        address: staleAddress,
        raft_role: 'leader',
        updated_at: nowMs,
      });

      const attempts = [];
      router.deliver = async (address) => {
        attempts.push(address);
        if (address === staleAddress) {
          return {
            acknowledged: true,
            success: true,
            error: MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN,
          };
        }
        if (address === freshAddress) {
          return {
            acknowledged: true,
            success: true,
          };
        }
        throw new Error(`unexpected forward target ${address}`);
      };

      await mg.applyCDCEvent(
        NON_SYSTEM_CDC_TABLE,
        'INSERT',
        {partition_id: 'p-forward-topology-repair'},
        {timestamp: '1234567890:20'},
      );

      t.same(
        attempts,
        [staleAddress, freshAddress],
        'authoritative topology repair should redirect the retry budget to the fresh leader',
      );
      t.equal(
        authoritativeReadCalls.some((call) => {
          return call.tableName === TABLES.MESSAGE_GROUPS;
        }),
        true,
        'stale leader rejection should trigger authoritative message_group repair',
      );
      t.equal(
        authoritativeReadCalls.some((call) => {
          return call.tableName === TABLES.SERVICES;
        }),
        true,
        'stale leader rejection should query authoritative service rows',
      );
      t.equal(
        authoritativeReadCalls.some((call) => {
          return call.tableName === TABLES.NODES;
        }),
        true,
        'stale leader rejection should query authoritative node rows',
      );
      t.equal(
        cache.get(TABLES.MESSAGE_GROUPS, groupId)?.leader_node_id,
        'fresh-node',
        'authoritative repair should refresh the canonical group leader node',
      );
      t.equal(
        cache.get(TABLES.SERVICES, freshReplicaId)?.address,
        freshAddress,
        'authoritative repair should hydrate the fresh leader service row',
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  'applyCDCEvent retries no-handler forward targets while handlers finish starting',
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
        groupId: 'mg-forward-suppress',
        replicaId: 'mg-forward-suppress-r1',
        nodeId,
        transport: router,
      });
      await mg.initialize();
      mg.replicaIds = [
        'mg-forward-suppress-r1',
        'mg-forward-suppress-r2',
      ];
      await mg.subscribeToCDC(NON_SYSTEM_CDC_TABLE);

      mg.isLeader = false;
      mg.role = 'follower';
      mg.leaderId = 'mg-forward-suppress-r2';
      mg.peerAddresses = [
        'remote-node/message-group/mg-forward-suppress-r2',
      ];
      mg.retryMaxAttempts = 2;
      mg.retryInitialDelayMs = 10;
      mg.retryBackoffMultiplier = 1;

      let deliverAttempts = 0;
      router.deliver = async (address) => {
        deliverAttempts += 1;
        if (deliverAttempts === 1) {
          return {
            acknowledged: true,
            noHandler: true,
            error: `No handler for address: ${address}`,
          };
        }
        return {
          acknowledged: true,
          success: true,
        };
      };

      await mg.applyCDCEvent(
        NON_SYSTEM_CDC_TABLE,
        'INSERT',
        {partition_id: 'p-forward-suppress-1'},
        {timestamp: '1234567890:21'},
      );
      t.equal(
        deliverAttempts,
        2,
        'retry budget should retry the same target after a transient no-handler response',
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  'applyCDCEvent temporarily suppresses no-connection forward targets across commands',
  async (t) => {
    const port = testPortCounter++;
    const nodeId = `test-node-${port}`;
    let nowMs = 0;
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
        groupId: 'mg-no-connection-suppress',
        replicaId: 'mg-no-connection-suppress-r1',
        nodeId,
        transport: router,
        now: () => nowMs,
      });
      await mg.initialize();
      mg.replicaIds = [
        'mg-no-connection-suppress-r1',
        'mg-no-connection-suppress-r2',
        'mg-no-connection-suppress-r3',
      ];
      await mg.subscribeToCDC(NON_SYSTEM_CDC_TABLE);

      mg.isLeader = false;
      mg.role = 'follower';
      mg.leaderId = 'mg-no-connection-suppress-r2';
      mg.peerAddresses = [
        'remote-node-2/message-group/mg-no-connection-suppress-r2',
        'remote-node-3/message-group/mg-no-connection-suppress-r3',
      ];
      mg.retryMaxAttempts = 1;
      mg.forwardTargetSuppressionMs = 1000;

      const attempts = [];
      router.deliver = async (address) => {
        attempts.push(address);
        if (address ===
          'remote-node-2/message-group/mg-no-connection-suppress-r2') {
          return {
            acknowledged: false,
            error: 'No connection to node remote-node-2',
          };
        }
        return {
          acknowledged: true,
          success: true,
        };
      };

      await mg.applyCDCEvent(
        NON_SYSTEM_CDC_TABLE,
        'INSERT',
        {partition_id: 'p-no-connection-suppress-1'},
        {timestamp: '1234567890:24'},
      );
      t.same(
        attempts,
        [
          'remote-node-2/message-group/mg-no-connection-suppress-r2',
          'remote-node-3/message-group/mg-no-connection-suppress-r3',
        ],
        'first command should fall through to an alternate peer after a no-connection rejection',
      );

      attempts.length = 0;
      await mg.applyCDCEvent(
        NON_SYSTEM_CDC_TABLE,
        'INSERT',
        {partition_id: 'p-no-connection-suppress-2'},
        {timestamp: '1234567890:25'},
      );
      t.same(
        attempts,
        ['remote-node-3/message-group/mg-no-connection-suppress-r3'],
        'suppressed stale target should be skipped on the next command',
      );

      nowMs += 1001;

      attempts.length = 0;
      await mg.applyCDCEvent(
        NON_SYSTEM_CDC_TABLE,
        'INSERT',
        {partition_id: 'p-no-connection-suppress-3'},
        {timestamp: '1234567890:26'},
      );
      t.same(
        attempts,
        [
          'remote-node-2/message-group/mg-no-connection-suppress-r2',
          'remote-node-3/message-group/mg-no-connection-suppress-r3',
        ],
        'no-connection suppression should expire so the preferred target can be retried',
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  'applyCDCEvent temporarily suppresses timeout forward targets across commands',
  async (t) => {
    const port = testPortCounter++;
    const nodeId = `test-node-${port}`;
    let nowMs = 0;
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
        groupId: 'mg-timeout-suppress',
        replicaId: 'mg-timeout-suppress-r1',
        nodeId,
        transport: router,
        now: () => nowMs,
      });
      await mg.initialize();
      mg.replicaIds = [
        'mg-timeout-suppress-r1',
        'mg-timeout-suppress-r2',
        'mg-timeout-suppress-r3',
      ];
      await mg.subscribeToCDC(NON_SYSTEM_CDC_TABLE);

      mg.isLeader = false;
      mg.role = 'follower';
      mg.leaderId = 'mg-timeout-suppress-r2';
      mg.peerAddresses = [
        'remote-node-2/message-group/mg-timeout-suppress-r2',
        'remote-node-3/message-group/mg-timeout-suppress-r3',
      ];
      mg.retryMaxAttempts = 1;
      mg.forwardTargetSuppressionMs = 1000;

      const attempts = [];
      router.deliver = async (address) => {
        attempts.push(address);
        if (address === 'remote-node-2/message-group/mg-timeout-suppress-r2') {
          return {
            acknowledged: false,
            success: true,
            error: TRANSPORT_ERROR_MSG.MESSAGE_TIMEOUT,
          };
        }
        return {
          acknowledged: true,
          success: true,
        };
      };

      await mg.applyCDCEvent(
        NON_SYSTEM_CDC_TABLE,
        'INSERT',
        {partition_id: 'p-timeout-suppress-1'},
        {timestamp: '1234567890:31'},
      );
      t.same(
        attempts,
        [
          'remote-node-2/message-group/mg-timeout-suppress-r2',
          'remote-node-3/message-group/mg-timeout-suppress-r3',
        ],
        'first command should fall through to an alternate peer after timeout',
      );

      attempts.length = 0;
      await mg.applyCDCEvent(
        NON_SYSTEM_CDC_TABLE,
        'INSERT',
        {partition_id: 'p-timeout-suppress-2'},
        {timestamp: '1234567890:32'},
      );
      t.same(
        attempts,
        ['remote-node-3/message-group/mg-timeout-suppress-r3'],
        'suppressed timeout target should be skipped on the next command',
      );

      nowMs += 1001;

      attempts.length = 0;
      await mg.applyCDCEvent(
        NON_SYSTEM_CDC_TABLE,
        'INSERT',
        {partition_id: 'p-timeout-suppress-3'},
        {timestamp: '1234567890:33'},
      );
      t.same(
        attempts,
        [
          'remote-node-2/message-group/mg-timeout-suppress-r2',
          'remote-node-3/message-group/mg-timeout-suppress-r3',
        ],
        'timeout suppression should expire so the preferred target can be retried',
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  'applyCDCEvent temporarily suppresses queue-saturated forward targets across commands',
  async (t) => {
    const port = testPortCounter++;
    const nodeId = `test-node-${port}`;
    let nowMs = 0;
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
        groupId: 'mg-backpressure-suppress',
        replicaId: 'mg-backpressure-suppress-r1',
        nodeId,
        transport: router,
        now: () => nowMs,
      });
      await mg.initialize();
      mg.replicaIds = [
        'mg-backpressure-suppress-r1',
        'mg-backpressure-suppress-r2',
        'mg-backpressure-suppress-r3',
      ];
      await mg.subscribeToCDC(NON_SYSTEM_CDC_TABLE);

      mg.isLeader = false;
      mg.role = 'follower';
      mg.leaderId = 'mg-backpressure-suppress-r2';
      mg.peerAddresses = [
        'remote-node-2/message-group/mg-backpressure-suppress-r2',
        'remote-node-3/message-group/mg-backpressure-suppress-r3',
      ];
      mg.retryMaxAttempts = 1;
      mg.forwardTargetSuppressionMs = 1000;

      const attempts = [];
      router.deliver = async (address) => {
        attempts.push(address);
        if (address ===
          'remote-node-2/message-group/mg-backpressure-suppress-r2') {
          return {
            acknowledged: false,
            success: true,
            error: ROUTER_ERROR_MSG.outboundQueueBackpressured(
              'remote-node-2',
              64,
            ),
            errorCode: 'OUTBOUND_QUEUE_BACKPRESSURED',
          };
        }
        return {
          acknowledged: true,
          success: true,
        };
      };

      await mg.applyCDCEvent(
        NON_SYSTEM_CDC_TABLE,
        'INSERT',
        {partition_id: 'p-backpressure-suppress-1'},
        {timestamp: '1234567890:34'},
      );
      t.same(
        attempts,
        [
          'remote-node-2/message-group/mg-backpressure-suppress-r2',
          'remote-node-3/message-group/mg-backpressure-suppress-r3',
        ],
        'first command should fall through to an alternate peer after queue saturation',
      );

      attempts.length = 0;
      await mg.applyCDCEvent(
        NON_SYSTEM_CDC_TABLE,
        'INSERT',
        {partition_id: 'p-backpressure-suppress-2'},
        {timestamp: '1234567890:35'},
      );
      t.same(
        attempts,
        ['remote-node-3/message-group/mg-backpressure-suppress-r3'],
        'queue-saturated target should be skipped on the next command',
      );

      nowMs += 1001;

      attempts.length = 0;
      await mg.applyCDCEvent(
        NON_SYSTEM_CDC_TABLE,
        'INSERT',
        {partition_id: 'p-backpressure-suppress-3'},
        {timestamp: '1234567890:36'},
      );
      t.same(
        attempts,
        [
          'remote-node-2/message-group/mg-backpressure-suppress-r2',
          'remote-node-3/message-group/mg-backpressure-suppress-r3',
        ],
        'queue-saturation suppression should expire so the preferred target can be retried',
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  'applyCDCEvent fails fast when every known peer is already suppressed',
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
        groupId: 'mg-all-suppressed',
        replicaId: 'mg-all-suppressed-r1',
        nodeId,
        transport: router,
      });
      await mg.initialize();
      mg.replicaIds = [
        'mg-all-suppressed-r1',
        'mg-all-suppressed-r2',
        'mg-all-suppressed-r3',
      ];
      await mg.subscribeToCDC(NON_SYSTEM_CDC_TABLE);

      mg.isLeader = false;
      mg.role = 'follower';
      mg.leaderId = 'mg-all-suppressed-r2';
      mg.peerAddresses = [
        'remote-node-2/message-group/mg-all-suppressed-r2',
        'remote-node-3/message-group/mg-all-suppressed-r3',
      ];
      mg.retryMaxAttempts = 3;
      mg.forwardTargetSuppressionMs = 1000;
      const retryDelayAttempts = [];
      mg.computeCdcForwardRetryDelayMs = (attempt) => {
        retryDelayAttempts.push(attempt);
        return 0;
      };
      mg.suppressForwardTarget({
        serviceId: 'mg-all-suppressed-r2',
        address: 'remote-node-2/message-group/mg-all-suppressed-r2',
      });
      mg.suppressForwardTarget({
        serviceId: 'mg-all-suppressed-r3',
        address: 'remote-node-3/message-group/mg-all-suppressed-r3',
      });

      let deliverAttempts = 0;
      router.deliver = async () => {
        deliverAttempts += 1;
        return {
          acknowledged: true,
          success: true,
        };
      };

      await t.rejects(
        mg.applyCDCEvent(
          NON_SYSTEM_CDC_TABLE,
          'INSERT',
          {partition_id: 'p-all-suppressed'},
          {timestamp: '1234567890:40'},
        ),
        /leader is unknown/i,
        'suppressed peers should not be retried as a fallback authority',
      );
      t.equal(
        deliverAttempts,
        0,
        'delivery should fail closed before retrying already suppressed peers',
      );
      t.same(
        retryDelayAttempts,
        [],
        'fully suppressed leader sets should fail without consuming the outer retry budget',
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  'applyCDCEvent does not redeliver fully suppressed timeout peers across retry budget',
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
        groupId: 'mg-retry-suppressed',
        replicaId: 'mg-retry-suppressed-r1',
        nodeId,
        transport: router,
      });
      await mg.initialize();
      mg.replicaIds = [
        'mg-retry-suppressed-r1',
        'mg-retry-suppressed-r2',
        'mg-retry-suppressed-r3',
      ];
      await mg.subscribeToCDC(NON_SYSTEM_CDC_TABLE);

      mg.isLeader = false;
      mg.role = 'follower';
      mg.leaderId = 'mg-retry-suppressed-r2';
      mg.peerAddresses = [
        'remote-node-2/message-group/mg-retry-suppressed-r2',
        'remote-node-3/message-group/mg-retry-suppressed-r3',
      ];
      mg.retryMaxAttempts = 2;
      mg.retryInitialDelayMs = 1;
      mg.retryBackoffMultiplier = 1;
      mg.forwardTargetSuppressionMs = 1000;

      const attempts = [];
      router.deliver = async (address) => {
        attempts.push(address);
        return {
          acknowledged: false,
          success: true,
          error: TRANSPORT_ERROR_MSG.MESSAGE_TIMEOUT,
        };
      };

      await t.rejects(
        mg.applyCDCEvent(
          NON_SYSTEM_CDC_TABLE,
          'INSERT',
          {partition_id: 'p-retry-suppressed'},
          {timestamp: '1234567890:41'},
        ),
        /leader is unknown|Message timeout/i,
        'retry budget should not redeliver peers that are already suppressed by the first timeout wave',
      );
      t.same(
        attempts,
        [
          'remote-node-2/message-group/mg-retry-suppressed-r2',
          'remote-node-3/message-group/mg-retry-suppressed-r3',
        ],
        'suppressed peers should not be retried again during the same command budget',
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  'applyCDCEvent temporarily suppresses ENOTFOUND forward targets across commands',
  async (t) => {
    const port = testPortCounter++;
    const nodeId = `test-node-${port}`;
    let nowMs = 0;
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
        groupId: 'mg-enotfound-suppress',
        replicaId: 'mg-enotfound-suppress-r1',
        nodeId,
        transport: router,
        now: () => nowMs,
      });
      await mg.initialize();
      mg.replicaIds = [
        'mg-enotfound-suppress-r1',
        'mg-enotfound-suppress-r2',
        'mg-enotfound-suppress-r3',
      ];
      await mg.subscribeToCDC(NON_SYSTEM_CDC_TABLE);

      mg.isLeader = false;
      mg.role = 'follower';
      mg.leaderId = 'mg-enotfound-suppress-r2';
      mg.peerAddresses = [
        'stale-host/message-group/mg-enotfound-suppress-r2',
        'remote-node-3/message-group/mg-enotfound-suppress-r3',
      ];
      mg.retryMaxAttempts = 1;
      mg.forwardTargetSuppressionMs = 1000;

      const attempts = [];
      router.deliver = async (address) => {
        attempts.push(address);
        if (address === 'stale-host/message-group/mg-enotfound-suppress-r2') {
          throw new Error('getaddrinfo ENOTFOUND stale-host');
        }
        return {
          acknowledged: true,
          success: true,
        };
      };

      await mg.applyCDCEvent(
        NON_SYSTEM_CDC_TABLE,
        'INSERT',
        {partition_id: 'p-enotfound-suppress-1'},
        {timestamp: '1234567890:42'},
      );
      t.same(
        attempts,
        [
          'stale-host/message-group/mg-enotfound-suppress-r2',
          'remote-node-3/message-group/mg-enotfound-suppress-r3',
        ],
        'first command should fall through after a stale DNS lookup failure',
      );

      attempts.length = 0;
      await mg.applyCDCEvent(
        NON_SYSTEM_CDC_TABLE,
        'INSERT',
        {partition_id: 'p-enotfound-suppress-2'},
        {timestamp: '1234567890:43'},
      );
      t.same(
        attempts,
        ['remote-node-3/message-group/mg-enotfound-suppress-r3'],
        'stale DNS target should be suppressed on the next command',
      );

      nowMs += 1001;

      attempts.length = 0;
      await mg.applyCDCEvent(
        NON_SYSTEM_CDC_TABLE,
        'INSERT',
        {partition_id: 'p-enotfound-suppress-3'},
        {timestamp: '1234567890:44'},
      );
      t.same(
        attempts,
        [
          'stale-host/message-group/mg-enotfound-suppress-r2',
          'remote-node-3/message-group/mg-enotfound-suppress-r3',
        ],
        'stale DNS suppression should expire so the preferred target can be retried',
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  'latency CDC received by non-leader relay-forwards once without local apply',
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
        groupId: 'mg-relay',
        replicaId: 'mg-relay-r1',
        nodeId,
        transport: router,
      });
      await mg.initialize();
      mg.replicaIds = ['mg-relay-r1', 'mg-relay-r2'];
      await mg.subscribeToCDC(NON_SYSTEM_CDC_TABLE);

      mg.isLeader = false;
      mg.role = 'follower';
      mg.leaderId = 'mg-relay-r2';
      mg.peerAddresses = ['remote-node/message-group/mg-relay-r2'];
      if (mg.raft) {
        Object.defineProperty(mg.raft, 'state', {
          value: LifeRaft.FOLLOWER,
          writable: true,
          configurable: true,
        });
      }

      const forwardedPayloads = [];
      router.deliver = async (address, payload) => {
        forwardedPayloads.push({address, payload});
        return {acknowledged: true, status: 'latency_cdc_propagated'};
      };

      const result = await mg.handleApplicationMessage({
        messageId: 'relay-msg-1',
        payload: {
          type: MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE.LATENCY_CDC_PROPAGATION,
          tableName: NON_SYSTEM_CDC_TABLE,
          operation: 'INSERT',
          data: {partition_id: 'relay-partition'},
          timestamp: '1234567890:11',
          relayDepth: 0,
        },
        sourceGroup: 'mg-remote',
        sourceReplica: 'mg-remote-r1',
      });

      t.equal(result.acknowledged, true, 'relay path should acknowledge message');
      t.equal(
        forwardedPayloads.length,
        1,
        'non-leader should relay one forward to its current leader',
      );
      t.equal(
        forwardedPayloads[0].payload.relayDepth,
        1,
        'relay should increment depth to prevent forwarding loops',
      );

      const cache = NodeService.getInstance().getSystemTableCache();
      const cached = cache.get(TABLES.PARTITIONS, 'relay-partition');
      t.equal(cached, undefined, 'non-leader should not apply relayed CDC locally');
    } finally {
      await cleanup();
    }
  },
);

test(
  'latency CDC batch received by leader applies all events locally',
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
        groupId: 'mg-batch-leader',
        replicaId: 'mg-batch-leader-r1',
        nodeId,
        transport: router,
      });
      await mg.initialize();
      mg.replicaIds = ['mg-batch-leader-r1'];
      mg.isLeader = true;
      mg.role = 'leader';
      mg.leaderId = 'mg-batch-leader-r1';
      if (mg.raft) {
        Object.defineProperty(mg.raft, 'state', {
          value: LifeRaft.LEADER,
          writable: true,
          configurable: true,
        });
      }

      const result = await mg.handleApplicationMessage({
        messageId: 'batch-msg-1',
        payload: {
          type: MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE.LATENCY_CDC_PROPAGATION_BATCH,
          events: [
            {
              tableName: TABLES.PARTITIONS,
              operation: 'INSERT',
              data: {partition_id: 'batch-partition-1'},
            },
            {
              tableName: TABLES.PARTITIONS,
              operation: 'INSERT',
              data: {partition_id: 'batch-partition-2'},
            },
          ],
          relayDepth: 0,
        },
        sourceGroup: 'mg-remote',
        sourceReplica: 'mg-remote-r1',
      });

      t.equal(result.acknowledged, true);
      const cache = NodeService.getInstance().getSystemTableCache();
      t.ok(cache.get(TABLES.PARTITIONS, 'batch-partition-1'));
      t.ok(cache.get(TABLES.PARTITIONS, 'batch-partition-2'));
    } finally {
      await cleanup();
    }
  },
);

test(
  'latency CDC batch received by non-leader relay-forwards once without local apply',
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
        groupId: 'mg-batch-relay',
        replicaId: 'mg-batch-relay-r1',
        nodeId,
        transport: router,
      });
      await mg.initialize();
      mg.replicaIds = ['mg-batch-relay-r1', 'mg-batch-relay-r2'];
      await mg.subscribeToCDC(NON_SYSTEM_CDC_TABLE);

      mg.isLeader = false;
      mg.role = 'follower';
      mg.leaderId = 'mg-batch-relay-r2';
      mg.peerAddresses = ['remote-node/message-group/mg-batch-relay-r2'];
      if (mg.raft) {
        Object.defineProperty(mg.raft, 'state', {
          value: LifeRaft.FOLLOWER,
          writable: true,
          configurable: true,
        });
      }

      const forwardedPayloads = [];
      router.deliver = async (address, payload) => {
        forwardedPayloads.push({address, payload});
        return {acknowledged: true, status: 'latency_cdc_batch_propagated'};
      };

      const result = await mg.handleApplicationMessage({
        messageId: 'batch-relay-msg-1',
        payload: {
          type: MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE.LATENCY_CDC_PROPAGATION_BATCH,
          events: [
            {
              tableName: NON_SYSTEM_CDC_TABLE,
              operation: 'INSERT',
              data: {partition_id: 'batch-relay-partition'},
            },
          ],
          relayDepth: 0,
        },
        sourceGroup: 'mg-remote',
        sourceReplica: 'mg-remote-r1',
      });

      t.equal(result.acknowledged, true);
      t.equal(forwardedPayloads.length, 1);
      t.equal(
        forwardedPayloads[0].payload.type,
        MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE.LATENCY_CDC_PROPAGATION_BATCH,
      );
      t.equal(forwardedPayloads[0].payload.relayDepth, 1);

      const cache = NodeService.getInstance().getSystemTableCache();
      t.equal(
        cache.get(TABLES.PARTITIONS, 'batch-relay-partition'),
        undefined,
        'follower should not apply relayed batch locally',
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  'latency CDC received by stale follower relay-forwards one extra hop to current leader',
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
        groupId: 'mg-relay-stale',
        replicaId: 'mg-relay-stale-r2',
        nodeId,
        transport: router,
      });
      await mg.initialize();
      mg.replicaIds = [
        'mg-relay-stale-r1',
        'mg-relay-stale-r2',
        'mg-relay-stale-r3',
      ];
      await mg.subscribeToCDC(NON_SYSTEM_CDC_TABLE);

      mg.isLeader = false;
      mg.role = 'follower';
      mg.leaderId = 'mg-relay-stale-r3';
      mg.peerAddresses = [
        'remote-node/message-group/mg-relay-stale-r1',
        'remote-node/message-group/mg-relay-stale-r2',
        'remote-node/message-group/mg-relay-stale-r3',
      ];
      if (mg.raft) {
        Object.defineProperty(mg.raft, 'state', {
          value: LifeRaft.FOLLOWER,
          writable: true,
          configurable: true,
        });
      }

      const forwardedPayloads = [];
      router.deliver = async (address, payload) => {
        forwardedPayloads.push({address, payload});
        return {acknowledged: true, status: 'latency_cdc_propagated'};
      };

      const result = await mg.handleApplicationMessage({
        messageId: 'relay-stale-msg-1',
        payload: {
          type: MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE.LATENCY_CDC_PROPAGATION,
          tableName: NON_SYSTEM_CDC_TABLE,
          operation: 'INSERT',
          data: {partition_id: 'relay-stale-partition'},
          timestamp: '1234567890:12',
          relayDepth: 1,
        },
        sourceGroup: 'mg-relay-stale',
        sourceReplica: 'mg-relay-stale-r1',
      });

      t.equal(result.acknowledged, true, 'stale relay path should acknowledge message');
      t.equal(
        forwardedPayloads.length,
        1,
        'stale follower should relay one additional hop to the current leader',
      );
      t.equal(
        forwardedPayloads[0].address,
        'remote-node/message-group/mg-relay-stale-r3',
        'stale follower should target its current leader on the extra hop',
      );
      t.equal(
        forwardedPayloads[0].payload.relayDepth,
        2,
        'extra relay should increment depth and remain bounded',
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  'latency CDC relay still fails closed once extra-hop budget is exhausted',
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
        groupId: 'mg-relay-budget',
        replicaId: 'mg-relay-budget-r2',
        nodeId,
        transport: router,
      });
      await mg.initialize();
      mg.replicaIds = [
        'mg-relay-budget-r1',
        'mg-relay-budget-r2',
        'mg-relay-budget-r3',
      ];
      await mg.subscribeToCDC(NON_SYSTEM_CDC_TABLE);

      mg.isLeader = false;
      mg.role = 'follower';
      mg.leaderId = 'mg-relay-budget-r3';
      mg.peerAddresses = [
        'remote-node/message-group/mg-relay-budget-r1',
        'remote-node/message-group/mg-relay-budget-r2',
        'remote-node/message-group/mg-relay-budget-r3',
      ];
      if (mg.raft) {
        Object.defineProperty(mg.raft, 'state', {
          value: LifeRaft.FOLLOWER,
          writable: true,
          configurable: true,
        });
      }

      await t.rejects(
        mg.handleApplicationMessage({
          messageId: 'relay-budget-msg-1',
          payload: {
            type: MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE.LATENCY_CDC_PROPAGATION,
            tableName: NON_SYSTEM_CDC_TABLE,
            operation: 'INSERT',
            data: {partition_id: 'relay-budget-partition'},
            timestamp: '1234567890:13',
            relayDepth: 2,
          },
          sourceGroup: 'mg-relay-budget',
          sourceReplica: 'mg-relay-budget-r1',
        }),
        /leader is unknown/i,
        'relay path should still fail closed after the bounded extra hop',
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  'applyCDCEvent on leader MG proposes to Raft without forwarding',
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
        groupId: 'mg-2',
        replicaId: 'mg-2-r1',
        nodeId,
        transport: router,
      });
      await mg.initialize();
      mg.replicaIds = ['mg-2-r1', 'mg-2-r2'];

      await mg.subscribeToCDC(TABLES.PARTITIONS);

      // Force single-replica promotion to leader
      mg.promoteIfSingleReplica();
      if (mg.raft) {
        Object.defineProperty(mg.raft, 'state', {
          value: LifeRaft.LEADER,
          writable: true,
          configurable: true,
        });
      }
      let proposeCount = 0;
      mg.raftProvider.proposeWithLeaderRouting = async () => {
        proposeCount += 1;
        return {attempt: 1, mode: 'propose'};
      };

      // Track forwarding — should NOT happen when we are leader
      const forwardedPayloads = [];
      const originalDeliver = router.deliver.bind(router);
      router.deliver = async (address, payload, options) => {
        forwardedPayloads.push({address, payload, options});
        return originalDeliver(address, payload, options);
      };

      const cdcData = {
        partition_id: 'tbl-bench-p2',
        table_id: 'tbl-bench',
        table_name: 'benchmark_events',
        replica_count: 3,
        state: 'NORMAL',
        created_at: Date.now(),
        updated_at: Date.now(),
      };

      await mg.applyCDCEvent(TABLES.PARTITIONS, 'INSERT', cdcData);

      const cache = NodeService.getInstance().getSystemTableCache();
      const cached = cache.get(TABLES.PARTITIONS, 'tbl-bench-p2');
      assert.ok(cached, 'CDC event should be applied to local cache');

      // Leader should NOT forward — it proposes directly to Raft
      const cdcForwards = forwardedPayloads.filter(
        (p) => p.payload && p.payload.tableName === TABLES.PARTITIONS,
      );
      assert.equal(
        cdcForwards.length,
        0,
        'Leader MG should not forward CDC events — it proposes to Raft directly',
      );
      assert.equal(proposeCount, 1, 'Leader MG should propose CDC event via Raft');

      router.deliver = originalDeliver;
    } finally {
      await cleanup();
    }
  },
);

test(
  'CDC forward error messages stay bounded when delivery errors nest across retries',
  async (t) => {
    // Boundary: CDC dissemination (doctrine §6, §7)
    // Bug: forwardCDCPayloadToLeader embeds the full remote error message
    // into its own error, and proposeCDCCommand wraps that again. When the
    // remote side also fails its own forward, error messages grow without
    // bound across retry cycles — eventually causing stack overflow or
    // memory exhaustion on the seed node.
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
        groupId: 'mg-err-bound',
        replicaId: 'mg-err-bound-r1',
        nodeId,
        transport: router,
      });
      await mg.initialize();
      mg.replicaIds = ['mg-err-bound-r1', 'mg-err-bound-r2'];
      await mg.subscribeToCDC(NON_SYSTEM_CDC_TABLE);

      mg.isLeader = false;
      mg.role = 'follower';
      mg.leaderId = 'mg-err-bound-r2';
      mg.peerAddresses = [
        'remote-node/message-group/mg-err-bound-r2',
      ];
      if (mg.raft) {
        Object.defineProperty(mg.raft, 'state', {
          value: LifeRaft.FOLLOWER,
          writable: true,
          configurable: true,
        });
      }

      // Simulate a remote replica returning an already-huge error message
      // from previous CDC forward cycles. In the real failure, two
      // replicas on the same node bounce CDC forwards back and forth,
      // each wrapping the previous error. After many cycles the error
      // message exceeds stack limits and causes RangeError.
      const hugeRemoteError = MESSAGE_GROUP_CDC_ERROR_MSG
        .FORWARD_DELIVERY_REJECTED
        .repeat(100);
      router.deliver = async () => {
        return {
          acknowledged: true,
          success: false,
          error: hugeRemoteError,
        };
      };

      // The forward should fail, but the error message must stay bounded
      // regardless of how large the remote error was.
      const maxErrorLength = 512;
      try {
        await mg.forwardCDCPayloadToLeader(
          {
            type: MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE
              .LATENCY_CDC_PROPAGATION,
            tableName: NON_SYSTEM_CDC_TABLE,
            operation: 'INSERT',
            data: {partition_id: 'err-bound-partition'},
            timestamp: '1234567890:99',
            sourceNodeId: nodeId,
            relayDepth: 0,
          },
          {
            tableName: NON_SYSTEM_CDC_TABLE,
            operation: 'INSERT',
            relayDepth: 0,
          },
        );
        t.fail('forwardCDCPayloadToLeader should reject');
      } catch (error) {
        t.ok(
          error.message.length <= maxErrorLength,
          `error message length ${error.message.length} should be ` +
          `<= ${maxErrorLength} to prevent unbounded growth ` +
          '(doctrine §7: resource lifetime must be bounded)',
        );
        t.match(
          error.message,
          /not acknowledged|unknown/i,
          'error should still contain the forward failure reason',
        );
      }
    } finally {
      await cleanup();
    }
  },
);
