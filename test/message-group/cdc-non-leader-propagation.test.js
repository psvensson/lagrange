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
import {TABLES} from '../../src/constants/index.js';
import {
  MessageGroupService,
} from '../../src/message-group/message-group-service.js';
import {MessageRouter} from '../../src/transport/message-router.js';

let testPortCounter = 27200;

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

      // Subscribe to the partitions table
      await mg.subscribeToCDC(TABLES.PARTITIONS);

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

      await mg.applyCDCEvent(TABLES.PARTITIONS, 'INSERT', cdcData);

      // Local cache should be updated immediately
      const cache = NodeService.getInstance().getSystemTableCache();
      const cached = cache.get(TABLES.PARTITIONS, 'tbl-bench-p1');
      assert.ok(cached, 'CDC event should be applied to local cache');

      // The event MUST be forwarded to the leader for Raft replication.
      // Without this, other nodes never see the cache update.
      assert.ok(
        forwardedPayloads.length > 0,
        'Non-leader MG must forward CDC event to leader for replication',
      );

      const forwarded = forwardedPayloads[0];
      assert.equal(
        forwarded.payload.tableName,
        TABLES.PARTITIONS,
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

      // Restore deliver for cleanup
      router.deliver = originalDeliver;
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

      await mg.subscribeToCDC(TABLES.PARTITIONS);

      // Force single-replica promotion to leader
      mg.promoteIfSingleReplica();

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

      router.deliver = originalDeliver;
    } finally {
      await cleanup();
    }
  },
);
