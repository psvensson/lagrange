import {NodeService} from '../../src/node/node-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
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
import {registerCdcNonLeaderPropagationTailMoreTests} from './cdc-non-leader-propagation-tail-more-test-cases.js';

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

export function registerCdcNonLeaderPropagationTailTests({
  test,
}) {
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
        seedLiveRaftPeersFromPeerAddresses(mg);
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
        seedLiveRaftPeersFromPeerAddresses(mg);
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
        seedLiveRaftPeersFromPeerAddresses(mg);
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
        seedLiveRaftPeersFromPeerAddresses(mg);
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
        seedLiveRaftPeersFromPeerAddresses(mg);
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
        seedLiveRaftPeersFromPeerAddresses(mg);
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

  registerCdcNonLeaderPropagationTailMoreTests({
    test,
  });
}
