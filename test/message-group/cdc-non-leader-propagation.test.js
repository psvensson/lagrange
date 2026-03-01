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
  TABLES,
} from '../../src/constants/index.js';
import LifeRaft from '@markwylde/liferaft';
import {
  MessageGroupService,
} from '../../src/message-group/message-group-service.js';
import {
  MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE,
} from '../../src/message-group/constants.js';
import {MessageRouter} from '../../src/transport/message-router.js';

let testPortCounter = 27200;

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
      await mg.subscribeToCDC(TABLES.PARTITIONS);

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

      await mg.applyCDCEvent(TABLES.PARTITIONS, 'INSERT', cdcData);

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
      await mg.subscribeToCDC(TABLES.PARTITIONS);

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
        TABLES.PARTITIONS,
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
      await mg.subscribeToCDC(TABLES.PARTITIONS);

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
        TABLES.PARTITIONS,
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
      await mg.subscribeToCDC(TABLES.PARTITIONS);

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
        TABLES.PARTITIONS,
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
      await mg.subscribeToCDC(TABLES.PARTITIONS);

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
        TABLES.PARTITIONS,
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
      await mg.subscribeToCDC(TABLES.PARTITIONS);

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
        TABLES.PARTITIONS,
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
      await mg.subscribeToCDC(TABLES.PARTITIONS);

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
          TABLES.PARTITIONS,
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
      await mg.subscribeToCDC(TABLES.PARTITIONS);

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
          TABLES.PARTITIONS,
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
      await mg.subscribeToCDC(TABLES.PARTITIONS);

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
          TABLES.PARTITIONS,
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
      await mg.subscribeToCDC(TABLES.PARTITIONS);

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
          TABLES.PARTITIONS,
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
      await mg.subscribeToCDC(TABLES.PARTITIONS);

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
          tableName: TABLES.PARTITIONS,
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
