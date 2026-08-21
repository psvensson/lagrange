/**
 * Unit tests for MessageGroupService.
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  createTestTransport,
  registerMessageGroupServiceLifecycleHooks,
  setTestPortBase,
} from './message-group-service-test-support.js';
import {
  MessageGroupService,
  MessageStatus,
  RaftRole,
} from '../../src/message-group/message-group-service.js';
import {
  MESSAGE_GROUP_CDC_INGRESS_ACTION,
  MESSAGE_GROUP_CDC_INGRESS_STATE,
} from '../../src/message-group/message-group-forwarding-owner.js';
import {
} from '../../src/message-group/constants.js';
import {
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  COLUMN,
  CDC_OPERATION,
  SERVICE_STATUS,
  STATE,
  TABLES,
} from '../../src/constants/index.js';
import LifeRaft from '@markwylde/liferaft';
import {
  RAFT_PACKET_TYPE,
} from '../../src/raft/constants.js';
import {LiferaftProvider} from '../../src/raft/liferaft-provider.js';
import {
} from '../../src/control-plane/control-plane-constants.js';
import {
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
} from '../../src/control-plane/control-plane-workload-profile.js';
import {
} from '../../src/control-plane/pressure-governor.js';

const TEST_SEMANTIC_LOCAL_LEADER_GROUP_ID =
  'mg-semantic-local-propose';
const TEST_SEMANTIC_LOCAL_LEADER_REPLICA_ID =
  'mg-semantic-local-propose-r1';
const TEST_SEMANTIC_LOCAL_LEADER_NODE_ID =
  'node-semantic-local-propose';
const TEST_SEMANTIC_LOCAL_LEADER_CAUSE_ID =
  'cause-semantic-local-propose';
const TEST_SEMANTIC_LOCAL_LEADER_TIMESTAMP =
  '1234567890:1:test-node';
const TEST_NON_SYSTEM_CDC_TABLE = 'runtime_forward_events';
const TEST_STALE_FORWARD_GROUP_ID = 'mg-stale-forward';
const TEST_STALE_FORWARD_LOCAL_REPLICA_ID = 'mg-stale-forward-r1';
const TEST_STALE_FORWARD_REMOTE_REPLICA_ID = 'mg-stale-forward-r2';
const TEST_STALE_FORWARD_REMOTE_ADDRESS =
  'remote-node/message-group/mg-stale-forward-r2';
const TEST_STALE_FORWARD_TIMESTAMP = '1234567890:77:test-node';
const TEST_CRITICAL_TRANSPORT_PARTITION_ADDRESS =
  'seed-node/partition/control_plane_publications-p1-r1';
const TEST_NON_CRITICAL_TRANSPORT_PARTITION_ADDRESS =
  'seed-node/partition/sql_write_operations-p1-r1';
const TEST_DELIVERY_PRIORITY = Object.freeze({
  BACKGROUND: 'background',
  CRITICAL: 'critical',
  READINESS: 'readiness',
});
const TEST_RETRYABLE_FORWARD_RETRY_AFTER_MS = 11;
const TEST_RETRYABLE_FORWARD_ERROR_CODE = 'ROUTER_CONNECTION_CLOSED';
const TEST_RETRYABLE_FORWARD_ERROR_MSG =
  'Connection to node seed closed';
const TEST_RETRYABLE_FORWARD_GROUP_ID = 'mg-retryable-forward';
const TEST_RETRYABLE_FORWARD_REPLICA_ID = 'mg-retryable-forward-r2';
const TEST_RETRYABLE_FORWARD_NODE_RUNTIME_ID =
  'node-retryable-forward-r2';
const TEST_RETRYABLE_FORWARD_TARGET_SERVICE_ID =
  'mg-retryable-forward-r1';
const TEST_RETRYABLE_FORWARD_TARGET_ADDRESS =
  'seed-node/message-group/mg-retryable-forward-r1';
const TEST_RETRYABLE_FORWARD_ROW_NODE_ID = 'node-retryable-forward';
const TEST_RETRYABLE_FORWARD_PROPOSE_GROUP_ID =
  'mg-retryable-forward-propose';
const TEST_RETRYABLE_FORWARD_PROPOSE_REPLICA_ID =
  'mg-retryable-forward-propose-r2';
const TEST_RETRYABLE_FORWARD_PROPOSE_NODE_RUNTIME_ID =
  'node-retryable-forward-propose-r2';
const TEST_RETRYABLE_FORWARD_PROPOSE_ROW_NODE_ID =
  'node-retryable-forward-propose';
const TEST_RETRYABLE_FORWARD_PROPOSE_TIMESTAMP = '123';
const TEST_RETRYABLE_FORWARD_PROPOSE_CAUSE_ID =
  'cause-retryable-forward-propose';
const TEST_SEMANTIC_LOCAL_LEADER_COMMAND = Object.freeze({
  type: 'CDC',
  tableName: TABLES.NODES,
  operation: CDC_OPERATION.UPDATE,
  data: Object.freeze({
    node_id: TEST_SEMANTIC_LOCAL_LEADER_NODE_ID,
    status: SERVICE_STATUS.ACTIVE,
  }),
  timestamp: TEST_SEMANTIC_LOCAL_LEADER_TIMESTAMP,
  causeId: TEST_SEMANTIC_LOCAL_LEADER_CAUSE_ID,
});

setTestPortBase(24800);
registerMessageGroupServiceLifecycleHooks();

test('MessageGroupService - Raft CDC propose failures preserve deferred retry ' +
  'metadata for upstream owners', async (t) => {
  const transport = {
    async deliver() {
      return {acknowledged: true};
    },
    async initialize() {},
    async shutdown() {},
    setServiceNodeResolver() {},
  };

  const service = new MessageGroupService({
    groupId: 'mg-1',
    replicaId: 'mg-1-r2',
    nodeId: 'node-mg-1-r2',
    transport,
  });

  const errorLogs = [];
  service.logger.error = (msg, fields) => {
    errorLogs.push({msg, fields});
  };
  service.raft = {state: LifeRaft.FOLLOWER};
  service.raftProvider = {
    async proposeWithLeaderRouting(_raft, command, options) {
      await options.forwardToLeader(command);
    },
  };
  service.forwardCDCEventToLeader = async () => {
    const error = new Error('Cannot forward CDC event because message-group leader is unknown');
    error.deferRetry = true;
    error.retryAfterMs = 5000;
    error.retryable = false;
    error.code = 'MG_LEADER_UNKNOWN';
    throw error;
  };

  try {
    await service.proposeCDCCommand({
      type: 'CDC',
      tableName: 'nodes',
      operation: 'UPDATE',
      data: {node_id: 'node-1'},
      timestamp: '123',
      causeId: 'cause-1',
    });
    t.fail('proposeCDCCommand should reject when strict forwarding defers');
  } catch (error) {
    t.match(
      error?.message,
      /Raft CDC replication failed: Cannot forward CDC event because message-group leader is unknown/,
      'wrapped error should preserve the original defer reason',
    );
    t.equal(error?.deferRetry, true,
      'wrapped raft propose error should preserve defer-retry metadata');
    t.equal(error?.retryAfterMs, 5000,
      'wrapped raft propose error should preserve retryAfterMs for upstream owners');
    t.equal(error?.retryable, false,
      'wrapped raft propose error should preserve non-retryable semantics');
    t.equal(error?.code, 'MG_LEADER_UNKNOWN',
      'wrapped raft propose error should preserve the upstream error code');
    t.equal(errorLogs.length, 1, 'should log one bounded propose failure');
    t.equal(errorLogs[0]?.msg, 'Raft CDC command failed');
    t.equal(errorLogs[0]?.fields?.isCurrentRaftLeader, false,
      'failure log should classify local leadership state');
    t.equal(errorLogs[0]?.fields?.raftState, LifeRaft.FOLLOWER,
      'failure log should preserve raft state');
    t.equal(errorLogs[0]?.fields?.leaderTargetSource, 'forward_to_leader',
      'failure log should identify the leader routing path');
    t.equal(errorLogs[0]?.fields?.configuredRetryBudget, service.retryMaxAttempts || 1,
      'failure log should preserve the configured retry budget');
    t.equal(errorLogs[0]?.fields?.proposeTimeoutMs > 0, true,
      'failure log should preserve the propose timeout budget');
  }
});

test(
  'MessageGroupService - strict CDC forward delivery preserves retryable defer semantics for closed leader connections',
  async (t) => {
    const transport = {
      async deliver() {
        return {
          acknowledged: false,
          success: true,
          error: TEST_RETRYABLE_FORWARD_ERROR_MSG,
          errorCode: TEST_RETRYABLE_FORWARD_ERROR_CODE,
          deferRetry: true,
          retryAfterMs: TEST_RETRYABLE_FORWARD_RETRY_AFTER_MS,
        };
      },
      async initialize() {},
      async shutdown() {},
      setServiceNodeResolver() {},
    };

    const service = new MessageGroupService({
      groupId: TEST_RETRYABLE_FORWARD_GROUP_ID,
      replicaId: TEST_RETRYABLE_FORWARD_REPLICA_ID,
      nodeId: TEST_RETRYABLE_FORWARD_NODE_RUNTIME_ID,
      transport,
    });

    service.resolveCDCForwardSelection = () => ({
      strictForwarding: true,
      strictForwardRetryAfterMs: TEST_RETRYABLE_FORWARD_RETRY_AFTER_MS,
      targets: [
        {
          serviceId: TEST_RETRYABLE_FORWARD_TARGET_SERVICE_ID,
          address: TEST_RETRYABLE_FORWARD_TARGET_ADDRESS,
        },
      ],
      suppressedCount: 0,
    });

    try {
      await service.forwardCDCEventToLeader(
        TABLES.NODES,
        CDC_OPERATION.UPDATE,
        {
          [COLUMN.NODE_ID]: TEST_RETRYABLE_FORWARD_ROW_NODE_ID,
          [COLUMN.CONNECTION_STATE]: STATE.READY,
        },
      );
      t.fail(
        'strict forward delivery should reject with retryable defer metadata when the leader connection closes',
      );
    } catch (error) {
      t.equal(
        error?.deferRetry,
        true,
        'closed leader delivery should preserve defer-retry semantics',
      );
      t.equal(
        error?.retryAfterMs,
        TEST_RETRYABLE_FORWARD_RETRY_AFTER_MS,
        'closed leader delivery should preserve the retry-after hint',
      );
      t.equal(
        error?.retryable,
        true,
        'closed leader delivery should stay retryable so the provider can re-resolve a new target',
      );
      t.equal(
        error?.code,
        TEST_RETRYABLE_FORWARD_ERROR_CODE,
        'closed leader delivery should preserve the transport error code',
      );
      t.match(
        error?.message,
        /was not acknowledged/i,
        'closed leader delivery should still surface the canonical forward failure message',
      );
    }
  },
);

test(
  'MessageGroupService - proposeCDCCommand retries retryable strict forward failures through the provider budget',
  async (t) => {
    const transport = {
      async deliver() {
        return {acknowledged: true};
      },
      async initialize() {},
      async shutdown() {},
      setServiceNodeResolver() {},
    };

    const service = new MessageGroupService({
      groupId: TEST_RETRYABLE_FORWARD_PROPOSE_GROUP_ID,
      replicaId: TEST_RETRYABLE_FORWARD_PROPOSE_REPLICA_ID,
      nodeId: TEST_RETRYABLE_FORWARD_PROPOSE_NODE_RUNTIME_ID,
      transport,
    });

    service.retryMaxAttempts = 2;
    service.computeCdcForwardRetryDelayMs = () => 0;
    service.raft = {state: LifeRaft.FOLLOWER};
    service.raftProvider = new LiferaftProvider();

    let forwardCalls = 0;
    service.forwardCDCEventToLeader = async () => {
      forwardCalls += 1;
      if (forwardCalls === 1) {
        const error = new Error(TEST_RETRYABLE_FORWARD_ERROR_MSG);
        error.deferRetry = true;
        error.retryAfterMs = 1;
        error.retryable = true;
        error.code = TEST_RETRYABLE_FORWARD_ERROR_CODE;
        throw error;
      }
    };

    await service.proposeCDCCommand({
      type: 'CDC',
      tableName: TABLES.NODES,
      operation: CDC_OPERATION.UPDATE,
      data: {
        [COLUMN.NODE_ID]: TEST_RETRYABLE_FORWARD_PROPOSE_ROW_NODE_ID,
        [COLUMN.CONNECTION_STATE]: STATE.READY,
      },
      timestamp: TEST_RETRYABLE_FORWARD_PROPOSE_TIMESTAMP,
      causeId: TEST_RETRYABLE_FORWARD_PROPOSE_CAUSE_ID,
    });

    t.equal(
      forwardCalls,
      2,
      'retryable strict forward failures should consume the remaining provider retry budget before surfacing a final error',
    );
  },
);

test('MessageGroupService - non-query sendMessage honors deferred retry hints',
  async (t) => {
    let deliverCalls = 0;
    let sleepCalls = 0;
    const transport = {
      async deliver() {
        deliverCalls += 1;
        return {
          acknowledged: false,
          error: 'No connection to node seed',
          errorCode: 'ROUTER_NO_CONNECTION',
          deferRetry: true,
          retryAfterMs: 250,
        };
      },
      async initialize() {},
      async shutdown() {},
      setServiceNodeResolver() {},
    };

    const service = new MessageGroupService({
      groupId: 'mg-deferred-retry',
      replicaId: 'mg-deferred-retry-r1',
      nodeId: 'node-deferred-retry',
      transport,
    });

    service.initialized = true;
    service.retryMaxAttempts = 4;
    service.sleep = async () => {
      sleepCalls += 1;
    };

    let persistCalls = 0;
    service.persistToRaftLog = async () => {
      persistCalls += 1;
      return {success: true};
    };

    const result = await service.sendMessage('node-x/partition/p1', {
      type: 'CDC',
      operation: 'UPDATE',
    });

    t.equal(deliverCalls, 1,
      'deferred transport failures should not multiply direct retries');
    t.equal(sleepCalls, 0,
      'deferred transport failures should not schedule retry delays');
    t.equal(result.status, MessageStatus.PENDING,
      'deferred transport failures should fall back to raft persistence');
    t.equal(persistCalls, 1,
      'non-query messages should still be persisted once for later replay');
  });

test('MessageGroupService - control-plane targets default to critical router priority',
  async (t) => {
    const deliveries = [];
    const transport = {
      async deliver(targetService, payload, options) {
        deliveries.push({targetService, payload, options});
        return {
          acknowledged: true,
        };
      },
      async initialize() {},
      async shutdown() {},
      setServiceNodeResolver() {},
    };

    const service = new MessageGroupService({
      groupId: 'mg-priority-default',
      replicaId: 'mg-priority-default-r1',
      nodeId: 'node-priority-default',
      transport,
    });

    service.initialized = true;
    service.persistToRaftLog = async () => ({success: true});

    await service.sendMessage(
      TEST_CRITICAL_TRANSPORT_PARTITION_ADDRESS,
      {
        type: 'CDC',
        operation: 'UPDATE',
      },
    );

    t.equal(deliveries.length, 1, 'should perform one direct delivery attempt');
    t.equal(
      deliveries[0]?.options?.deliveryPriority,
      'critical',
      'critical transport targets should claim the critical router lane by default',
    );
    t.equal(
      deliveries[0]?.options?.deliverySource,
      undefined,
      'typed payloads should keep router-derived delivery source semantics',
    );
  });

test('MessageGroupService - typeless control-plane target messages use a sender-scoped delivery source',
  async (t) => {
    const deliveries = [];
    const transport = {
      async deliver(targetService, payload, options) {
        deliveries.push({targetService, payload, options});
        return {
          acknowledged: true,
        };
      },
      async initialize() {},
      async shutdown() {},
      setServiceNodeResolver() {},
    };

    const service = new MessageGroupService({
      groupId: 'mg-critical-target-source',
      replicaId: 'mg-critical-target-source-r1',
      nodeId: 'node-critical-target-source',
      transport,
    });

    service.initialized = true;
    service.persistToRaftLog = async () => ({success: true});

    await service.sendMessage(
      TEST_CRITICAL_TRANSPORT_PARTITION_ADDRESS,
      {
        correlationId: 'typeless-critical-target',
      },
    );

    await service.sendMessage(
      TEST_CRITICAL_TRANSPORT_PARTITION_ADDRESS,
      {
        correlationId: 'explicit-critical-target',
      },
      {
        transportDeliveryOptions: {
          deliverySource: 'caller:explicit-source',
        },
      },
    );

    t.equal(deliveries.length, 2, 'should perform both direct deliveries');
    t.equal(
      deliveries[0]?.options?.deliveryPriority,
      'critical',
      'typeless critical transport targets should stay on the critical lane',
    );
    t.equal(
      deliveries[0]?.options?.deliverySource,
      'message-group:mg-critical-target-source:mg-critical-target-source-r1:target:control_plane_publications-p1',
      'typeless critical partition sends should carry a sender-scoped source',
    );
    t.equal(
      deliveries[1]?.options?.deliverySource,
      'caller:explicit-source',
      'caller-provided deliverySource should remain authoritative',
    );
  });

test('MessageGroupService - non-critical initial partitions do not claim the critical router lane by default',
  async (t) => {
    const deliveries = [];
    const transport = {
      async deliver(targetService, payload, options) {
        deliveries.push({targetService, payload, options});
        return {
          acknowledged: true,
        };
      },
      async initialize() {},
      async shutdown() {},
      setServiceNodeResolver() {},
    };

    const service = new MessageGroupService({
      groupId: 'mg-non-critical-priority-default',
      replicaId: 'mg-non-critical-priority-default-r1',
      nodeId: 'node-non-critical-priority-default',
      transport,
    });

    service.initialized = true;
    service.persistToRaftLog = async () => ({success: true});

    await service.sendMessage(
      TEST_NON_CRITICAL_TRANSPORT_PARTITION_ADDRESS,
      {
        type: 'CDC',
        operation: 'UPDATE',
      },
    );

    t.equal(deliveries.length, 1, 'should perform one direct delivery attempt');
    t.equal(
      deliveries[0]?.options?.deliveryPriority,
      undefined,
      'non-critical initial partitions should inherit the router background default',
    );
  });

test('MessageGroupService - deferred raft responses use the readiness router lane',
  async (t) => {
    const deliveries = [];
    const transport = {
      async deliver(targetService, payload, options) {
        deliveries.push({targetService, payload, options});
        return {
          acknowledged: false,
          error: 'Connection to node seed closed',
          errorCode: 'ROUTER_CONNECTION_CLOSED',
          deferRetry: true,
          retryAfterMs: 200,
        };
      },
      async initialize() {},
      async shutdown() {},
      setServiceNodeResolver() {},
    };

    const service = new MessageGroupService({
      groupId: 'mg-1',
      replicaId: 'mg-1-r1',
      nodeId: 'node-mg-1',
      transport,
    });

    await service.initialize();
    try {
      const originalEmit = service.raft.emit.bind(service.raft);
      service.raft.emit = function(eventName, payload, write) {
        if (eventName === 'data' && typeof write === 'function') {
          write({
            type: 'voted',
            term: payload.term,
            address: payload.address,
          });
          return true;
        }
        return originalEmit(eventName, payload, write);
      };

      const result = await service.receiveMessage({
        payload: {
          type: 'vote',
          term: 3,
          address: 'seed/message-group/mg-1-r2',
        },
      });

      t.equal(result.acknowledged, true,
        'raft packets should still acknowledge local handling');
      t.equal(deliveries.length, 1,
        'raft response delivery should still be attempted once');
      t.equal(
        deliveries[0]?.options?.deliveryPriority,
        TEST_DELIVERY_PRIORITY.READINESS,
        'raft response delivery to mg-1 should use the readiness router lane',
      );
    } finally {
      await service.shutdown();
    }
  });

test('MessageGroupService - raft append-entry replication uses the background router lane',
  async (t) => {
    const deliveries = [];
    const transport = {
      async deliver(targetService, payload, options) {
        deliveries.push({targetService, payload, options});
        return {
          acknowledged: true,
        };
      },
      async initialize() {},
      async shutdown() {},
      setServiceNodeResolver() {},
    };

    const service = new MessageGroupService({
      groupId: 'mg-raft-lane',
      replicaId: 'mg-raft-lane-r1',
      replicaIds: ['mg-raft-lane-r1', 'mg-raft-lane-r2'],
      peerAddresses: ['peer-node/message-group/mg-raft-lane-r2'],
      nodeId: 'node-mg-raft-lane',
      transport,
    });

    await service.initialize();
    try {
      await new Promise((resolve, reject) => {
        service.raft.nodes[0].write({
          type: RAFT_PACKET_TYPE.APPEND,
          term: 3,
          address: service.getUnifiedAddress(),
          leader: service.getUnifiedAddress(),
          state: LifeRaft.LEADER,
          last: {
            index: 0,
            term: 0,
            committedIndex: 0,
          },
          data: [{
            index: 1,
            term: 3,
            command: {
              type: 'CDC',
            },
          }],
        }, (error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });

      t.equal(deliveries.length, 1,
        'append-entry replication should perform one peer delivery');
      t.equal(
        deliveries[0]?.options?.deliveryPriority,
        TEST_DELIVERY_PRIORITY.BACKGROUND,
        'append-entry replication to mg-1 peers should use the shared background lane',
      );
    } finally {
      await service.shutdown();
    }
  });

test('MessageGroupService - append-fail raft responses use the readiness router lane',
  async (t) => {
    const deliveries = [];
    const transport = {
      async deliver(targetService, payload, options) {
        deliveries.push({targetService, payload, options});
        return {
          acknowledged: false,
          error: 'Connection to node seed closed',
          errorCode: 'ROUTER_CONNECTION_CLOSED',
          deferRetry: true,
          retryAfterMs: 200,
        };
      },
      async initialize() {},
      async shutdown() {},
      setServiceNodeResolver() {},
    };

    const service = new MessageGroupService({
      groupId: 'mg-1',
      replicaId: 'mg-1-r1',
      nodeId: 'node-mg-1',
      transport,
    });

    await service.initialize();
    try {
      const originalEmit = service.raft.emit.bind(service.raft);
      service.raft.emit = function(eventName, payload, write) {
        if (eventName === 'data' && typeof write === 'function') {
          write({
            type: RAFT_PACKET_TYPE.APPEND_FAIL,
            term: payload.term,
            address: payload.address,
            leader: payload.address,
            state: LifeRaft.FOLLOWER,
            data: {
              index: payload.last?.index || 0,
              term: payload.last?.term || payload.term,
            },
          });
          return true;
        }
        return originalEmit(eventName, payload, write);
      };

      const result = await service.receiveMessage({
        payload: {
          type: RAFT_PACKET_TYPE.APPEND,
          term: 3,
          address: 'seed/message-group/mg-1-r2',
          leader: 'seed/message-group/mg-1-r2',
          state: LifeRaft.LEADER,
          last: {
            index: 4,
            term: 2,
            committedIndex: 0,
          },
        },
      });

      t.equal(result.acknowledged, true,
        'raft packets should still acknowledge local handling');
      t.equal(deliveries.length, 1,
        'append-fail response delivery should still be attempted once');
      t.equal(
        deliveries[0]?.options?.deliveryPriority,
        TEST_DELIVERY_PRIORITY.READINESS,
        'append-fail response delivery to mg-1 should use the readiness router lane',
      );
    } finally {
      await service.shutdown();
    }
  });

test('MessageGroupService - receiveMessage processes message', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  try {
    const service = new MessageGroupService({
      groupId: 'mg-1',
      replicaId: 'mg-1-r1',
      nodeId,
      transport: router,
    });

    await service.initialize();

    let receivedMessage = null;
    service.on('messageReceived', (msg) => {
      receivedMessage = msg;
    });

    const result = await service.receiveMessage({
      messageId: 'msg-123',
      payload: {type: 'TEST'},
      sourceGroup: 'mg-2',
      sourceReplica: 'mg-2-r1',
    });

    t.equal(result.messageId, 'msg-123', 'Should return messageId');
    t.equal(result.status, 'received', 'Should return received status');
    t.ok(receivedMessage, 'Should emit messageReceived event');
    t.equal(receivedMessage.messageId, 'msg-123', 'Event should have messageId');

    let releaseCompletion = null;
    const completionHandler = async () => {
      await new Promise((resolve) => {
        releaseCompletion = resolve;
      });
      return {completionKind: 'durable_state_publication'};
    };
    t.equal(
      service.registerApplicationMessageCompletionHandler(completionHandler),
      false,
      'completion ownership requires an explicit message-type scope',
    );
    t.equal(
      service.registerApplicationMessageCompletionHandler(
        ['TEST_COMPLETION'],
        completionHandler,
      ),
      true,
      'one application owner can register the completion boundary',
    );
    receivedMessage = null;
    await service.receiveMessage({
      messageId: 'msg-unowned-interaction',
      payload: {type: 'UNOWNED_INTERACTION'},
      sourceGroup: 'mg-2',
      sourceReplica: 'mg-2-r1',
    });
    t.equal(
      receivedMessage?.messageId,
      'msg-unowned-interaction',
      'typed ownership does not swallow unrelated application interactions',
    );
    t.throws(
      () => service.registerApplicationMessageCompletionHandler(
        ['TEST_COMPLETION'],
        () => {},
      ),
      /completion handler already registered/,
      'a second subsystem cannot steal the completion boundary',
    );
    const completion = service.receiveMessage({
      messageId: 'msg-owner-completion',
      payload: {type: 'TEST_COMPLETION'},
      sourceGroup: 'mg-2',
      sourceReplica: 'mg-2-r1',
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    let completionSettled = false;
    completion.then(() => {
      completionSettled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    t.equal(
      completionSettled,
      false,
      'message delivery remains pending until the application owner finishes',
    );
    releaseCompletion();
    t.match(
      await completion,
      {completionKind: 'durable_state_publication'},
      'the owner completion is returned to the transport caller',
    );
    t.equal(
      service.unregisterApplicationMessageCompletionHandler(
        ['TEST_COMPLETION'],
        completionHandler,
      ),
      true,
      'the same owner releases its completion registration',
    );

    await service.shutdown();
  } finally {
    await cleanup();
  }
});

test('MessageGroupService - receiveMessage detects duplicates', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  try {
    const service = new MessageGroupService({
      groupId: 'mg-1',
      replicaId: 'mg-1-r1',
      nodeId,
      transport: router,
    });

    await service.initialize();

    // First receive
    await service.receiveMessage({
      messageId: 'msg-123',
      payload: {type: 'TEST'},
      sourceGroup: 'mg-2',
      sourceReplica: 'mg-2-r1',
    });

    // Acknowledge
    await service.acknowledgeMessage('msg-123');

    // Second receive (duplicate)
    const result = await service.receiveMessage({
      messageId: 'msg-123',
      payload: {type: 'TEST'},
      sourceGroup: 'mg-2',
      sourceReplica: 'mg-2-r1',
    });

    t.equal(result.status, 'duplicate', 'Should detect duplicate');
    t.equal(result.acknowledged, true, 'Should indicate already acknowledged');

    await service.shutdown();
  } finally {
    await cleanup();
  }
});

test('MessageGroupService - acknowledgeMessage marks message', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  try {
    const service = new MessageGroupService({
      groupId: 'mg-1',
      replicaId: 'mg-1-r1',
      nodeId,
      transport: router,
    });

    await service.initialize();

    let ackEvent = null;
    service.on('messageAcknowledged', (event) => {
      ackEvent = event;
    });

    const result = await service.acknowledgeMessage('msg-123');

    t.equal(result.messageId, 'msg-123', 'Should return messageId');
    t.equal(result.status, MessageStatus.ACKNOWLEDGED, 'Should be acknowledged');
    t.ok(result.logIndex, 'Should have log index');
    t.ok(ackEvent, 'Should emit messageAcknowledged event');

    await service.shutdown();
  } finally {
    await cleanup();
  }
});

test('MessageGroupService - subscribeToCDC adds subscription', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  try {
    const service = new MessageGroupService({
      groupId: 'mg-1',
      replicaId: 'mg-1-r1',
      nodeId,
      transport: router,
    });

    await service.initialize();

    await service.subscribeToCDC('nodes');
    await service.subscribeToCDC('partitions');

    const status = service.getStatus();
    t.ok(status.cdcSubscriptions.includes('nodes'), 'Should subscribe to nodes');
    t.ok(status.cdcSubscriptions.includes('partitions'), 'Should subscribe to partitions');

    await service.shutdown();
  } finally {
    await cleanup();
  }
});

test('MessageGroupService - applyCDCEvent updates cache', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  try {
    const service = new MessageGroupService({
      groupId: 'mg-1',
      replicaId: 'mg-1-r1',
      nodeId,
      transport: router,
    });

    await service.initialize();
    await service.subscribeToCDC('nodes');

    let cdcEvent = null;
    service.on('cdcApplied', (event) => {
      cdcEvent = event;
    });

    await service.applyCDCEvent('nodes', 'INSERT', {
      id: 'node-1',
      address: '127.0.0.1:8080',
      status: 'active',
    });

    t.ok(cdcEvent, 'Should emit cdcApplied event');
    t.equal(cdcEvent.tableName, 'nodes', 'Event should have tableName');
    t.equal(cdcEvent.operation, 'INSERT', 'Event should have operation');

    // Verify cache was updated
    const result = await service.querySystemCache('nodes', {key: 'node-1'});
    t.ok(result, 'Should find record in cache');
    t.equal(result.address, '127.0.0.1:8080', 'Should have correct address');

    await service.shutdown();
  } finally {
    await cleanup();
  }
});

test('MessageGroupService - applyCDCEvent fails closed on Raft propose error', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  try {
    const service = new MessageGroupService({
      groupId: 'mg-raft-fail',
      replicaId: 'mg-raft-fail-r1',
      nodeId,
      transport: router,
    });

    await service.initialize();
    service.replicaIds = ['mg-raft-fail-r1', 'mg-raft-fail-r2'];
    if (service.raft) {
      Object.defineProperty(service.raft, 'state', {
        value: LifeRaft.LEADER,
        writable: true,
        configurable: true,
      });
    }
    await service.subscribeToCDC('nodes');

    service.raftProvider.proposeWithLeaderRouting = async () => {
      throw new Error('raft propose failed');
    };

    await t.rejects(
      service.applyCDCEvent('nodes', 'INSERT', {
        id: 'node-raft-fail',
        status: 'active',
      }),
      /raft propose failed/,
      'should surface Raft replication failure to caller',
    );

    await service.shutdown();
  } finally {
    await cleanup();
  }
});

test(
  'MessageGroupService - proposeCDCCommand does not locally propose from ' +
    'published role before live raft leadership converges',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    try {
      const service = new MessageGroupService({
        groupId: TEST_SEMANTIC_LOCAL_LEADER_GROUP_ID,
        replicaId: TEST_SEMANTIC_LOCAL_LEADER_REPLICA_ID,
        nodeId,
        transport: router,
      });

      const proposedCommands = [];
      let forwardCalls = 0;
      service.role = RaftRole.LEADER;
      service.raft = {
        state: null,
        async command(command) {
          proposedCommands.push(command);
          return {ok: true};
        },
      };
      service.forwardCDCEventToLeader = async () => {
        forwardCalls += 1;
        return undefined;
      };

      await service.proposeCDCCommand(TEST_SEMANTIC_LOCAL_LEADER_COMMAND);

      t.equal(
        forwardCalls,
        1,
        'published leader role without live raft leadership should route through forward-to-leader instead of proposing locally',
      );
      t.same(
        proposedCommands,
        [],
        'published leader role alone must not authorize a local raft propose while live raft leadership is still unset',
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  'MessageGroupService - applyCDCEvent forwards when published follower ' +
    'ownership disagrees with stale local raft leadership',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    try {
      const service = new MessageGroupService({
        groupId: TEST_STALE_FORWARD_GROUP_ID,
        replicaId: TEST_STALE_FORWARD_LOCAL_REPLICA_ID,
        nodeId,
        transport: router,
      });

      await service.initialize();
      service.replicaIds = [
        TEST_STALE_FORWARD_LOCAL_REPLICA_ID,
        TEST_STALE_FORWARD_REMOTE_REPLICA_ID,
      ];
      service.isLeader = false;
      service.role = RaftRole.FOLLOWER;
      service.leaderId = TEST_STALE_FORWARD_REMOTE_REPLICA_ID;
      service.peerAddresses = [TEST_STALE_FORWARD_REMOTE_ADDRESS];
      if (service.raft) {
        service.raft.nodes = [
          {address: TEST_STALE_FORWARD_REMOTE_ADDRESS},
        ];
      }
      await service.subscribeToCDC(TEST_NON_SYSTEM_CDC_TABLE);

      const forwardedPayloads = [];
      router.deliver = async (address, payload, options) => {
        forwardedPayloads.push({address, payload, options});
        return {acknowledged: true, success: true};
      };

      await service.applyCDCEvent(
        TEST_NON_SYSTEM_CDC_TABLE,
        CDC_OPERATION.INSERT,
        {partition_id: 'p-stale-forward'},
        {timestamp: TEST_STALE_FORWARD_TIMESTAMP},
      );

      t.equal(
        forwardedPayloads.length,
        1,
        'non-leader CDC should forward instead of applying locally when raw raft leadership is stale',
      );
      t.equal(
        forwardedPayloads[0]?.address,
        TEST_STALE_FORWARD_REMOTE_ADDRESS,
        'forwarding should still target the known remote leader address',
      );
      t.equal(
        forwardedPayloads[0]?.payload?.tableName,
        TEST_NON_SYSTEM_CDC_TABLE,
        'forwarded payload should preserve the non-system CDC table name',
      );

      await service.shutdown();
    } finally {
      await cleanup();
    }
  },
);

test('MessageGroupService - applyCDCEvent defers strict CDC on ' +
  'followers before leader routing when ingress is not ready', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  try {
    const service = new MessageGroupService({
      groupId: 'mg-strict-defer',
      replicaId: 'mg-strict-defer-r2',
      nodeId,
      transport: router,
    });

    await service.initialize();
    service.replicaIds = ['mg-strict-defer-r1', 'mg-strict-defer-r2'];
    service.role = RaftRole.FOLLOWER;
    if (service.raft) {
      Object.defineProperty(service.raft, 'state', {
        value: LifeRaft.FOLLOWER,
        writable: true,
        configurable: true,
      });
    } else {
      service.raft = {state: LifeRaft.FOLLOWER};
    }
    service.resolveCdcIngressDecision = () => ({
      action: MESSAGE_GROUP_CDC_INGRESS_ACTION.DEFER,
      state: MESSAGE_GROUP_CDC_INGRESS_STATE.DEFER_STRICT_TARGET_UNKNOWN,
      ready: false,
      reason: 'join convergence incomplete',
      strictForwardRetryAfterMs: 250,
    });
    service.forwardCDCEventToLeader = async () => {
      throw new Error('strict CDC should defer before leader routing');
    };

    try {
      await service.applyCDCEvent('nodes', 'UPDATE', {
        node_id: 'node-deferred',
        status: 'active',
      });
      t.fail(
        'follower strict CDC should defer instead of attempting leader routing',
      );
    } catch (error) {
      t.equal(error?.deferRetry, true,
        'strict CDC defer should preserve deferRetry metadata');
      t.equal(error?.retryAfterMs, 250,
        'strict CDC defer should preserve retryAfterMs');
      t.match(error?.message, /join convergence incomplete/i,
        'strict CDC defer should preserve the readiness reason');
    }

    await service.shutdown();
  } finally {
    await cleanup();
  }
});

test(
  'MessageGroupService - replicated CDC retry must re-propose even with same timestamp',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    try {
      const service = new MessageGroupService({
        groupId: 'mg-retry-same-ts',
        replicaId: 'mg-retry-same-ts-r1',
        nodeId,
        transport: router,
      });

      await service.initialize();
      service.replicaIds = ['mg-retry-same-ts-r1', 'mg-retry-same-ts-r2'];
      if (service.raft) {
        Object.defineProperty(service.raft, 'state', {
          value: LifeRaft.LEADER,
          writable: true,
          configurable: true,
        });
      }
      await service.subscribeToCDC('nodes');

      let proposeAttempts = 0;
      service.raftProvider.proposeWithLeaderRouting = async () => {
        proposeAttempts += 1;
        if (proposeAttempts === 1) {
          throw new Error('synthetic propose failure');
        }
      };

      const retryTimestamp = '1234567890:42:test-node';
      await t.rejects(
        service.applyCDCEvent(
          'nodes',
          'INSERT',
          {id: 'node-retry-same-ts', status: 'active'},
          {timestamp: retryTimestamp},
        ),
        /synthetic propose failure/,
        'first attempt should surface replicated CDC propose failure',
      );

      await service.applyCDCEvent(
        'nodes',
        'INSERT',
        {id: 'node-retry-same-ts', status: 'active'},
        {timestamp: retryTimestamp},
      );

      t.equal(
        proposeAttempts,
        2,
        'second attempt with same timestamp should still re-propose',
      );

      const cached = service.getWritableCache().get('nodes', 'node-retry-same-ts');
      t.ok(
        cached,
        'leader path may apply locally before commit; retry path must still re-propose',
      );

      await service.shutdown();
    } finally {
      await cleanup();
    }
  },
);

test('MessageGroupService - CDC batch propagation proposes one raft command',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    try {
      const service = new MessageGroupService({
        groupId: 'mg-batch-propose',
        replicaId: 'mg-batch-propose-r1',
        nodeId,
        transport: router,
      });

      await service.initialize();
      service.replicaIds = ['mg-batch-propose-r1', 'mg-batch-propose-r2'];
      if (service.raft) {
        Object.defineProperty(service.raft, 'state', {
          value: LifeRaft.LEADER,
          writable: true,
          configurable: true,
        });
      }
      await service.subscribeToCDC('nodes');

      const proposedCommands = [];
      service.raftProvider.proposeWithLeaderRouting = async (_raft, command) => {
        proposedCommands.push(command);
      };

      const result = await service.handleLatencyCdcPropagationBatchMessage(
        'msg-batch',
        {
          type: 'latency.cdc.propagation.batch',
          events: [
            {
              tableName: 'nodes',
              operation: 'INSERT',
              data: {id: 'node-batch-1', status: 'active'},
            },
            {
              tableName: 'nodes',
              operation: 'INSERT',
              data: {id: 'node-batch-2', status: 'ready'},
            },
          ],
        },
      );

      t.equal(result.status, 'latency_cdc_batch_propagated',
        'batched propagation should acknowledge success');
      t.equal(result.eventCount, 2,
        'batched propagation should report the full event count');
      t.equal(proposedCommands.length, 1,
        'batched propagation should propose one raft command');
      t.equal(proposedCommands[0]?.type, 'CDC_BATCH',
        'batched propagation should use the CDC_BATCH command type');
      t.equal(proposedCommands[0]?.events?.length, 2,
        'raft command should retain all batch events');

      t.ok(
        service.getWritableCache().get('nodes', 'node-batch-1'),
        'leader should apply first batched event locally',
      );
      t.ok(
        service.getWritableCache().get('nodes', 'node-batch-2'),
        'leader should apply second batched event locally',
      );

      await service.shutdown();
    } finally {
      await cleanup();
    }
  },
);

test('MessageGroupService - CDC paths delegate to CDCHandler owner', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  try {
    const service = new MessageGroupService({
      groupId: 'mg-1',
      replicaId: 'mg-1-r1',
      nodeId,
      transport: router,
    });

    await service.initialize();
    t.equal(service.cdcHandler.getSubscriptions().length, 0);

    await service.subscribeToCDC('nodes');
    t.ok(service.cdcHandler.isSubscribed('nodes'));

    await service.applyCDCEvent('nodes', 'INSERT', {
      id: 'node-owner-1',
      status: 'active',
    });
    t.ok(service.getWritableCache().get('nodes', 'node-owner-1'));

    await service.applyCDCEvent('partitions', 'INSERT', {
      id: 'partition-owner-1',
      status: 'active',
    });
    t.equal(
      service.getWritableCache().get('partitions', 'partition-owner-1'),
      undefined,
    );

    await service.shutdown();
  } finally {
    await cleanup();
  }
});
