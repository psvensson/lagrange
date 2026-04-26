import {NodeService} from '../../src/node/node-service.js';
import {
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
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


function seedLiveRaftPeersFromPeerAddresses(service) {
  if (!service?.raft || !Array.isArray(service.peerAddresses)) {
    return;
  }
  service.raft.nodes = service.peerAddresses
    .filter((address) => typeof address === 'string' && address.length > 0)
    .map((address) => ({address}));
}

export function registerCdcNonLeaderPropagationTailMoreTests({
  test,
}) {
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
        seedLiveRaftPeersFromPeerAddresses(mg);
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
        seedLiveRaftPeersFromPeerAddresses(mg);
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
        seedLiveRaftPeersFromPeerAddresses(mg);
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
        seedLiveRaftPeersFromPeerAddresses(mg);
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
        seedLiveRaftPeersFromPeerAddresses(mg);
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
        seedLiveRaftPeersFromPeerAddresses(mg);
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
        seedLiveRaftPeersFromPeerAddresses(mg);
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
        seedLiveRaftPeersFromPeerAddresses(mg);
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
        seedLiveRaftPeersFromPeerAddresses(mg);
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
}
