/**
 * Unit tests for MessageGroupService.
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */

import {EventEmitter} from 'node:events';
import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {
  MessageGroupOperationLedger,
  MessageGroupService,
  MessageStatus,
  RaftRole,
} from '../../src/message-group/message-group-service.js';
import {
  MESSAGE_GROUP_CDC_INGRESS_ACTION,
  MESSAGE_GROUP_CDC_INGRESS_STATE,
  MESSAGE_GROUP_LEADER_IDENTITY_SOURCE,
  MESSAGE_GROUP_LEADER_IDENTITY_STATE,
} from '../../src/message-group/message-group-forwarding-owner.js';
import {
  MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE,
  MESSAGE_GROUP_CDC_ERROR_MSG,
} from '../../src/message-group/constants.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {NodeService} from '../../src/node/node-service.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {
  SYSTEM_TABLE_NAME,
  INITIAL_PARTITION_IDS,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  LIFECYCLE_PHASE,
  LIFECYCLE_REASON,
} from '../../src/bootstrap/lifecycle-controller-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {
  COLUMN,
  CDC_OPERATION,
  SERVICE_TYPE,
  SERVICE_STATUS,
  STATE,
  TABLES,
} from '../../src/constants/index.js';
import LifeRaft from '@markwylde/liferaft';
import {
  RAFT_EVENT,
  RAFT_PACKET_TYPE,
} from '../../src/raft/constants.js';
import {LiferaftProvider} from '../../src/raft/liferaft-provider.js';
import {
  ControlPlaneField,
  ControlPlaneMessageType,
} from '../../src/control-plane/control-plane-constants.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  CONTROL_PLANE_WORKLOAD_CLASS,
} from '../../src/control-plane/control-plane-workload-profile.js';
import {
  PRESSURE_WORK_CLASS,
} from '../../src/control-plane/pressure-governor.js';

// Port counter for unique ports per test
let testPortCounter = 24000;

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
const TEST_STRICT_RECOVERY_FORWARD_GROUP_ID =
  'mg-strict-recovery-forward';
const TEST_STRICT_RECOVERY_FORWARD_LOCAL_REPLICA_ID =
  'mg-strict-recovery-forward-r3';
const TEST_STRICT_RECOVERY_FORWARD_REMOTE_REPLICA_ID =
  'mg-strict-recovery-forward-r2';
const TEST_STRICT_RECOVERY_FORWARD_LEADER_REPLICA_ID =
  'mg-strict-recovery-forward-r1';
const TEST_STRICT_RECOVERY_FORWARD_LOCAL_NODE_ID =
  'node-strict-recovery-forward-local';
const TEST_STRICT_RECOVERY_FORWARD_REMOTE_NODE_ID =
  'node-strict-recovery-forward-remote';
const TEST_STRICT_RECOVERY_FORWARD_LEADER_NODE_ID =
  'node-strict-recovery-forward-leader';
const TEST_ADDRESSED_STRICT_CONVERGENCE_GROUP_ID =
  'mg-addressed-strict-forward-convergence';
const TEST_ADDRESSED_STRICT_CONVERGENCE_LOCAL_REPLICA_ID =
  'mg-addressed-strict-forward-convergence-r3';
const TEST_ADDRESSED_STRICT_CONVERGENCE_REMOTE_REPLICA_ID =
  'mg-addressed-strict-forward-convergence-r1';
const TEST_ADDRESSED_STRICT_CONVERGENCE_REMOTE_NODE_ID =
  'peer-node-addressed-strict-forward';
const TEST_ADDRESSED_STRICT_CONVERGENCE_REMOTE_ADDRESS =
  'peer-node-addressed-strict-forward/message-group/mg-addressed-strict-forward-convergence-r1';
const TEST_ADDRESSED_STRICT_CONVERGENCE_PARTITION_ID = 'partitions-p1';
const TEST_ADDRESSED_STRICT_CONVERGENCE_CAUSE_ID =
  'cause-addressed-strict-forward-convergence';
const TEST_ADDRESSED_STRICT_CONVERGENCE_TIMESTAMP =
  '1234567890:41:test-node';
const TEST_STRICT_RECOVERY_FORWARD_REMOTE_ADDRESS =
  'node-strict-recovery-forward-remote/message-group/mg-strict-recovery-forward-r2';
const TEST_STRICT_RECOVERY_ROUTING_STATE_LOCAL_ONLY = 'local_only';
const TEST_STRICT_RECOVERY_ROUTING_STATE_REMOTE_TARGETS =
  'remote_targets_available';
const TEST_RELAYED_STRICT_STALE_COMPETING_GROUP_ID =
  'mg-relayed-strict-stale-competing';
const TEST_RELAYED_STRICT_STALE_COMPETING_LOCAL_REPLICA_ID =
  'mg-relayed-strict-stale-competing-r1';
const TEST_RELAYED_STRICT_STALE_COMPETING_REMOTE_REPLICA_ID =
  'mg-relayed-strict-stale-competing-r2';
const TEST_RELAYED_STRICT_STALE_COMPETING_REMOTE_NODE_ID =
  'node-relayed-strict-stale-competing-remote';
const TEST_RELAYED_STRICT_STALE_COMPETING_REMOTE_ADDRESS =
  'node-relayed-strict-stale-competing-remote/message-group/' +
  'mg-relayed-strict-stale-competing-r2';
const TEST_RELAYED_STRICT_STALE_COMPETING_NODE_ROW_ID =
  'node-relayed-strict-stale-competing';
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

function createTrafficReadinessState() {
  const emitter = new EventEmitter();
  let snapshot = {
    phase: LIFECYCLE_PHASE.INIT,
    ready: false,
    reasons: [],
  };

  return {
    getSnapshot() {
      return {...snapshot};
    },
    on(eventName, listener) {
      emitter.on(eventName, listener);
    },
    off(eventName, listener) {
      emitter.off(eventName, listener);
    },
    transitionTo(phase, options = {}) {
      snapshot = {
        phase,
        ready: options.ready === true,
        reasons: Array.isArray(options.reasons) ? [...options.reasons] : [],
      };
      emitter.emit('transition', {...snapshot});
      return {...snapshot};
    },
  };
}

/**
 * Create a real WebSocket transport for testing.
 * @return {Promise<{router: MessageRouter, nodeId: string, cleanup: Function}>}
 */
async function createTestTransport() {
  const port = testPortCounter++;
  const nodeId = `test-node-${port}`;
  const router = new MessageRouter({nodeId, wsPort: port});
  await router.initialize({startServer: true});
  return {
    router,
    nodeId,
    cleanup: async () => {
      await router.shutdown();
    },
  };
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
  'MessageGroupService - joinPeerNodes keeps authoritative remote same-id peer during move convergence',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    try {
      const service = new MessageGroupService({
        groupId: 'mg-move-peer-join',
        replicaId: 'mg-move-peer-join-r1',
        nodeId,
        replicaIds: [
          'mg-move-peer-join-r1',
          'mg-move-peer-join-r2',
          'mg-move-peer-join-r3',
        ],
        peerAddresses: [
          'seed-node/message-group/mg-move-peer-join-r1',
          'seed-node/message-group/mg-move-peer-join-r2',
          'seed-node/message-group/mg-move-peer-join-r3',
        ],
        transport: router,
      });

      const joinedPeers = [];
      service.raft = {};
      service.raftProvider = {
        joinPeer: (_raft, address) => {
          joinedPeers.push(address);
        },
      };

      service.joinPeerNodes();

      t.same(
        joinedPeers,
        [
          'seed-node/message-group/mg-move-peer-join-r1',
          'seed-node/message-group/mg-move-peer-join-r2',
          'seed-node/message-group/mg-move-peer-join-r3',
        ],
        'move convergence should join the authoritative remote same-id peer alongside the other canonical peers',
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  'MessageGroupService - reconcileRaftPeersFromCache keeps authoritative remote same-id peer during move convergence',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    try {
      const service = new MessageGroupService({
        groupId: 'mg-move-peer-reconcile',
        replicaId: 'mg-move-peer-reconcile-r1',
        nodeId,
        transport: router,
      });

      const joinedPeers = [];
      service.raft = {
        nodes: [],
        leave: () => {},
      };
      service.raftProvider = {
        joinPeer: (_raft, address) => {
          joinedPeers.push(address);
        },
      };

      service.systemTableCache.applySystemTableChange(
        TABLES.SERVICES,
        CDC_OPERATION.UPSERT,
        {
          [COLUMN.SERVICE_ID]: 'mg-move-peer-reconcile-r1',
          [COLUMN.GROUP_ID]: 'mg-move-peer-reconcile',
          [COLUMN.NODE_ID]: 'seed-node',
          [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
          [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
          [COLUMN.ADDRESS]: 'seed-node/message-group/mg-move-peer-reconcile-r1',
        },
      );
      service.systemTableCache.applySystemTableChange(
        TABLES.SERVICES,
        CDC_OPERATION.UPSERT,
        {
          [COLUMN.SERVICE_ID]: 'mg-move-peer-reconcile-r2',
          [COLUMN.GROUP_ID]: 'mg-move-peer-reconcile',
          [COLUMN.NODE_ID]: 'seed-node',
          [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
          [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
          [COLUMN.ADDRESS]: 'seed-node/message-group/mg-move-peer-reconcile-r2',
        },
      );

      service.reconcileRaftPeersFromCache();

      t.same(
        joinedPeers,
        [
          'seed-node/message-group/mg-move-peer-reconcile-r1',
          'seed-node/message-group/mg-move-peer-reconcile-r2',
        ],
        'cache reconciliation should retain the authoritative remote same-id peer until the local handoff is canonical',
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  'MessageGroupService - strict CDC propagation defers on join-suppressed followers',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    try {
      const service = new MessageGroupService({
        groupId: 'mg-strict-join-defer',
        replicaId: 'mg-strict-join-defer-r1',
        nodeId,
        transport: router,
      });

      service.resolveCdcIngressDecision = () => ({
        action: MESSAGE_GROUP_CDC_INGRESS_ACTION.DEFER,
        state: MESSAGE_GROUP_CDC_INGRESS_STATE.DEFER_STRICT_TARGET_UNKNOWN,
        ready: false,
        reason: 'join convergence incomplete',
        strictForwardRetryAfterMs: 250,
      });
      service.forwardCDCEventToLeader = async () => {
        throw new Error('should not forward while strict readiness is deferred');
      };
      service.raft = {
        state: LifeRaft.FOLLOWER,
      };

      const result = await service.handleLatencyCdcPropagationMessage(
        'msg-strict-join-defer',
        {
          type: 'latency.cdc.propagation',
          tableName: TABLES.NODES,
          operation: CDC_OPERATION.UPSERT,
          data: {id: 'node-a', status: 'ready'},
        },
      );

      t.equal(result.acknowledged, true, 'join-suppressed strict propagation should acknowledge receipt');
      t.equal(result.success, false, 'join-suppressed strict propagation should defer instead of succeeding');
      t.equal(result.deferRetry, true, 'join-suppressed strict propagation should surface typed defer semantics');
      t.equal(result.retryAfterMs, 250, 'join-suppressed strict propagation should preserve retry hint');
      t.match(result.error, /join convergence incomplete/i, 'join-suppressed strict propagation should preserve the defer reason');
    } finally {
      await cleanup();
    }
  },
);

test(
  'MessageGroupService - strict CDC propagation uses canonical local ingress during join convergence when owner row moved',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    try {
      const service = new MessageGroupService({
        groupId: 'mg-strict-local-join-ingress',
        replicaId: 'mg-strict-local-join-ingress-r1',
        nodeId,
        replicaIds: [
          'mg-strict-local-join-ingress-r1',
          'mg-strict-local-join-ingress-r2',
          'mg-strict-local-join-ingress-r3',
        ],
        transport: router,
      });

      service.isJoiningExistingGroup = true;
      service.raft = {
        state: LifeRaft.FOLLOWER,
      };
      service.forwardCDCEventToLeader = async () => {
        throw new Error(
          'canonical local join ingress should not forward strict CDC again',
        );
      };

      service.systemTableCache.applySystemTableChange(
        TABLES.MESSAGE_GROUPS,
        CDC_OPERATION.UPSERT,
        {
          [COLUMN.GROUP_ID]: 'mg-strict-local-join-ingress',
          [COLUMN.LEADER_NODE_ID]: nodeId,
        },
      );
      service.systemTableCache.applySystemTableChange(
        TABLES.SERVICES,
        CDC_OPERATION.UPSERT,
        {
          [COLUMN.SERVICE_ID]: 'mg-strict-local-join-ingress-r1',
          [COLUMN.GROUP_ID]: 'mg-strict-local-join-ingress',
          [COLUMN.NODE_ID]: nodeId,
          [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
          [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
          [COLUMN.ADDRESS]:
            `${nodeId}/message-group/mg-strict-local-join-ingress-r1`,
          [COLUMN.RAFT_ROLE]: RaftRole.FOLLOWER,
          [COLUMN.UPDATED_AT]: Date.now(),
        },
      );
      service.systemTableCache.applySystemTableChange(
        TABLES.SERVICES,
        CDC_OPERATION.UPSERT,
        {
          [COLUMN.SERVICE_ID]: 'mg-strict-local-join-ingress-r3',
          [COLUMN.GROUP_ID]: 'mg-strict-local-join-ingress',
          [COLUMN.NODE_ID]: 'seed-node',
          [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
          [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
          [COLUMN.ADDRESS]:
            'seed-node/message-group/mg-strict-local-join-ingress-r3',
          [COLUMN.RAFT_ROLE]: RaftRole.LEADER,
          [COLUMN.UPDATED_AT]: Date.now() - 1,
        },
      );

      const readiness = service.canAcceptCDCEvent({
        tableName: TABLES.NODES,
        operation: CDC_OPERATION.UPSERT,
      });

      t.equal(
        readiness.ready,
        true,
        'canonical leader_node_id on the local join-suppressed replica should keep strict CDC ingress routable',
      );
      t.equal(
        readiness.localIngress,
        true,
        'strict readiness should identify the canonical local ingress path',
      );

      const result = await service.handleLatencyCdcPropagationMessage(
        'msg-strict-local-join-ingress',
        {
          type: 'latency.cdc.propagation',
          tableName: TABLES.NODES,
          operation: CDC_OPERATION.UPSERT,
          data: {
            [COLUMN.NODE_ID]: 'node-strict-local-join-ingress',
            [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
          },
        },
      );

      t.equal(result.acknowledged, true, 'canonical local ingress should acknowledge strict CDC');
      t.equal(
        result.success,
        undefined,
        'canonical local ingress should consume strict CDC locally rather than returning a deferred failure',
      );
      t.equal(
        service.systemTableCache.get(TABLES.NODES, 'node-strict-local-join-ingress')?.[
          COLUMN.STATUS
        ],
        SERVICE_STATUS.ACTIVE,
        'canonical local ingress should apply the strict CDC event to the local cache during join convergence',
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  'MessageGroupService - strict CDC propagation uses local live leader hints during join convergence before owner-row cache catches up',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    try {
      const service = new MessageGroupService({
        groupId: 'mg-strict-local-live-hint',
        replicaId: 'mg-strict-local-live-hint-r1',
        nodeId,
        replicaIds: [
          'mg-strict-local-live-hint-r1',
          'mg-strict-local-live-hint-r2',
          'mg-strict-local-live-hint-r3',
        ],
        transport: router,
      });

      service.isJoiningExistingGroup = true;
      service.raft = {
        state: LifeRaft.FOLLOWER,
      };
      service.leaderId = 'mg-strict-local-live-hint-r1';
      service.forwardCDCEventToLeader = async () => {
        throw new Error(
          'local live leader join hints should not re-forward strict CDC',
        );
      };

      service.systemTableCache.applySystemTableChange(
        TABLES.MESSAGE_GROUPS,
        CDC_OPERATION.UPSERT,
        {
          [COLUMN.GROUP_ID]: 'mg-strict-local-live-hint',
          [COLUMN.LEADER_NODE_ID]: 'seed-node',
        },
      );
      service.systemTableCache.applySystemTableChange(
        TABLES.SERVICES,
        CDC_OPERATION.UPSERT,
        {
          [COLUMN.SERVICE_ID]: 'mg-strict-local-live-hint-r1',
          [COLUMN.GROUP_ID]: 'mg-strict-local-live-hint',
          [COLUMN.NODE_ID]: nodeId,
          [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
          [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
          [COLUMN.ADDRESS]:
            `${nodeId}/message-group/mg-strict-local-live-hint-r1`,
          [COLUMN.RAFT_ROLE]: RaftRole.LEADER,
          [COLUMN.UPDATED_AT]: Date.now(),
        },
      );

      const readiness = service.canAcceptCDCEvent({
        tableName: TABLES.NODES,
        operation: CDC_OPERATION.UPSERT,
      });

      t.equal(
        readiness.ready,
        true,
        'local live leader hints should keep strict CDC ingress routable while the owner-row cache is still stale',
      );
      t.equal(
        readiness.localIngress,
        true,
        'strict readiness should identify local live leader hints as a join-convergence ingress signal',
      );

      const result = await service.handleLatencyCdcPropagationMessage(
        'msg-strict-local-live-hint',
        {
          type: 'latency.cdc.propagation',
          tableName: TABLES.NODES,
          operation: CDC_OPERATION.UPSERT,
          data: {
            [COLUMN.NODE_ID]: 'node-strict-local-live-hint',
            [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
          },
        },
      );

      t.equal(result.acknowledged, true, 'local live leader ingress should acknowledge strict CDC');
      t.equal(
        service.systemTableCache.get(TABLES.NODES, 'node-strict-local-live-hint')?.[
          COLUMN.STATUS
        ],
        SERVICE_STATUS.ACTIVE,
        'local live leader ingress should apply strict CDC while authoritative owner rows catch up',
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  'MessageGroupService - strict CDC propagation falls back to addressed local ingress during join convergence when no strict target is viable',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    try {
      const service = new MessageGroupService({
        groupId: 'mg-strict-local-addressed-fallback',
        replicaId: 'mg-strict-local-addressed-fallback-r1',
        nodeId,
        replicaIds: [
          'mg-strict-local-addressed-fallback-r1',
          'mg-strict-local-addressed-fallback-r2',
          'mg-strict-local-addressed-fallback-r3',
        ],
        transport: router,
      });

      service.isJoiningExistingGroup = true;
      service.raft = {
        state: LifeRaft.FOLLOWER,
      };
      service.leaderId = 'mg-strict-local-addressed-fallback-r3';
      service.forwardCDCEventToLeader = async () => {
        throw new Error(
          'addressed local join ingress should not re-forward strict CDC',
        );
      };

      service.systemTableCache.applySystemTableChange(
        TABLES.MESSAGE_GROUPS,
        CDC_OPERATION.UPSERT,
        {
          [COLUMN.GROUP_ID]: 'mg-strict-local-addressed-fallback',
          [COLUMN.LEADER_NODE_ID]: 'seed-node',
        },
      );
      service.systemTableCache.applySystemTableChange(
        TABLES.SERVICES,
        CDC_OPERATION.UPSERT,
        {
          [COLUMN.SERVICE_ID]: 'mg-strict-local-addressed-fallback-r3',
          [COLUMN.GROUP_ID]: 'mg-strict-local-addressed-fallback',
          [COLUMN.NODE_ID]: 'seed-node',
          [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
          [COLUMN.STATUS]: SERVICE_STATUS.STOPPED,
          [COLUMN.ADDRESS]:
            'seed-node/message-group/mg-strict-local-addressed-fallback-r3',
          [COLUMN.RAFT_ROLE]: RaftRole.LEADER,
          [COLUMN.UPDATED_AT]: Date.now() - 1,
        },
      );

      const readiness = service.canAcceptCDCEvent({
        tableName: TABLES.NODES,
        operation: CDC_OPERATION.UPSERT,
      });

      t.equal(
        readiness.ready,
        true,
        'join convergence should keep strict CDC ingress locally routable when no viable non-local strict target exists yet',
      );
      t.equal(
        readiness.localIngress,
        true,
        'strict readiness should fall back to the addressed local join ingress when strict targets are still stale',
      );

      const result = await service.handleLatencyCdcPropagationMessage(
        'msg-strict-local-addressed-fallback',
        {
          type: 'latency.cdc.propagation',
          tableName: TABLES.NODES,
          operation: CDC_OPERATION.UPSERT,
          data: {
            [COLUMN.NODE_ID]: 'node-strict-local-addressed-fallback',
            [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
          },
        },
      );

      t.equal(result.acknowledged, true, 'addressed local fallback should acknowledge strict CDC');
      t.equal(
        service.systemTableCache.get(TABLES.NODES, 'node-strict-local-addressed-fallback')?.[
          COLUMN.STATUS
        ],
        SERVICE_STATUS.ACTIVE,
        'addressed local fallback should apply strict CDC while strict target metadata converges',
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  'MessageGroupService - strict CDC propagation falls back to addressed local ingress during metadata-publication convergence when no strict target is viable',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    const readinessState = createTrafficReadinessState();
    try {
      const service = new MessageGroupService({
        groupId: 'mg-strict-local-bootstrap-fallback',
        replicaId: 'mg-strict-local-bootstrap-fallback-r1',
        nodeId,
        replicaIds: [
          'mg-strict-local-bootstrap-fallback-r1',
          'mg-strict-local-bootstrap-fallback-r2',
          'mg-strict-local-bootstrap-fallback-r3',
        ],
        transport: router,
        bootstrapReadinessState: readinessState,
      });

      readinessState.transitionTo(LIFECYCLE_PHASE.CONTROL_READY, {
        ready: false,
        reasons: [LIFECYCLE_REASON.LEADER_METADATA_INCOMPLETE],
      });
      service.raft = {
        state: LifeRaft.FOLLOWER,
      };
      service.leaderId = 'mg-strict-local-bootstrap-fallback-r3';
      service.forwardCDCEventToLeader = async () => {
        throw new Error(
          'addressed local metadata-publication ingress should not re-forward strict CDC',
        );
      };

      service.systemTableCache.applySystemTableChange(
        TABLES.MESSAGE_GROUPS,
        CDC_OPERATION.UPSERT,
        {
          [COLUMN.GROUP_ID]: 'mg-strict-local-bootstrap-fallback',
          [COLUMN.LEADER_NODE_ID]: 'seed-node',
        },
      );
      service.systemTableCache.applySystemTableChange(
        TABLES.SERVICES,
        CDC_OPERATION.UPSERT,
        {
          [COLUMN.SERVICE_ID]: 'mg-strict-local-bootstrap-fallback-r3',
          [COLUMN.GROUP_ID]: 'mg-strict-local-bootstrap-fallback',
          [COLUMN.NODE_ID]: 'seed-node',
          [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
          [COLUMN.STATUS]: SERVICE_STATUS.STOPPED,
          [COLUMN.ADDRESS]:
            'seed-node/message-group/mg-strict-local-bootstrap-fallback-r3',
          [COLUMN.RAFT_ROLE]: RaftRole.LEADER,
          [COLUMN.UPDATED_AT]: Date.now() - 1,
        },
      );

      const readiness = service.canAcceptCDCEvent({
        tableName: TABLES.NODES,
        operation: CDC_OPERATION.UPSERT,
      });

      t.equal(
        readiness.ready,
        true,
        'metadata-publication convergence should keep strict CDC ingress locally routable when no viable non-local strict target exists yet',
      );
      t.equal(
        readiness.localIngress,
        true,
        'strict readiness should fall back to the addressed local ingress while leader metadata is still converging',
      );

      const result = await service.handleLatencyCdcPropagationMessage(
        'msg-strict-local-bootstrap-fallback',
        {
          type: 'latency.cdc.propagation',
          tableName: TABLES.NODES,
          operation: CDC_OPERATION.UPSERT,
          data: {
            [COLUMN.NODE_ID]: 'node-strict-local-bootstrap-fallback',
            [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
          },
        },
      );

      t.equal(
        result.acknowledged,
        true,
        'addressed local metadata-publication fallback should acknowledge strict CDC',
      );
      t.equal(
        service.systemTableCache.get(
          TABLES.NODES,
          'node-strict-local-bootstrap-fallback',
        )?.[COLUMN.STATUS],
        SERVICE_STATUS.ACTIVE,
        'addressed local metadata-publication fallback should apply strict CDC while leader metadata converges',
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  'MessageGroupService - relayed strict CDC uses addressed local ingress when no onward strict target is viable',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    try {
      const service = new MessageGroupService({
        groupId: 'mg-strict-relayed-local-fallback',
        replicaId: 'mg-strict-relayed-local-fallback-r1',
        nodeId,
        replicaIds: [
          'mg-strict-relayed-local-fallback-r1',
          'mg-strict-relayed-local-fallback-r2',
          'mg-strict-relayed-local-fallback-r3',
        ],
        transport: router,
      });

      service.raft = {
        state: LifeRaft.FOLLOWER,
      };
      service.leaderId = 'mg-strict-relayed-local-fallback-r3';
      service.forwardCDCEventToLeader = async () => {
        throw new Error(
          'relayed addressed local ingress should not re-forward strict CDC',
        );
      };

      service.systemTableCache.applySystemTableChange(
        TABLES.MESSAGE_GROUPS,
        CDC_OPERATION.UPSERT,
        {
          [COLUMN.GROUP_ID]: 'mg-strict-relayed-local-fallback',
          [COLUMN.LEADER_NODE_ID]: 'seed-node',
        },
      );
      service.systemTableCache.applySystemTableChange(
        TABLES.SERVICES,
        CDC_OPERATION.UPSERT,
        {
          [COLUMN.SERVICE_ID]: 'mg-strict-relayed-local-fallback-r3',
          [COLUMN.GROUP_ID]: 'mg-strict-relayed-local-fallback',
          [COLUMN.NODE_ID]: 'seed-node',
          [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
          [COLUMN.STATUS]: SERVICE_STATUS.STOPPED,
          [COLUMN.ADDRESS]:
            'seed-node/message-group/mg-strict-relayed-local-fallback-r3',
          [COLUMN.RAFT_ROLE]: RaftRole.LEADER,
          [COLUMN.UPDATED_AT]: Date.now() - 1,
        },
      );

      const initialDecision = service.resolveCdcIngressDecision({
        tableName: TABLES.NODES,
        operation: CDC_OPERATION.UPSERT,
      });
      const relayedDecision = service.resolveCdcIngressDecision({
        tableName: TABLES.NODES,
        operation: CDC_OPERATION.UPSERT,
        relayDepth: 1,
      });

      t.equal(
        initialDecision.action,
        MESSAGE_GROUP_CDC_INGRESS_ACTION.DEFER,
        'without a relayed strict payload the addressed replica should still fail closed',
      );
      t.equal(
        relayedDecision.action,
        MESSAGE_GROUP_CDC_INGRESS_ACTION.APPLY_LOCAL,
        'a relayed strict payload should authorize addressed local ingress when no onward target is viable',
      );
      t.equal(
        relayedDecision.localIngress,
        true,
        'the relayed strict decision should preserve the canonical local-ingress signal',
      );

      const result = await service.handleLatencyCdcPropagationMessage(
        'msg-strict-relayed-local-fallback',
        {
          type: 'latency.cdc.propagation',
          tableName: TABLES.NODES,
          operation: CDC_OPERATION.UPSERT,
          relayDepth: 1,
          data: {
            [COLUMN.NODE_ID]: 'node-strict-relayed-local-fallback',
            [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
          },
        },
      );

      t.equal(
        result.acknowledged,
        true,
        'relayed addressed local ingress should acknowledge strict CDC',
      );
      t.equal(
        service.systemTableCache.get(
          TABLES.NODES,
          'node-strict-relayed-local-fallback',
        )?.[COLUMN.STATUS],
        SERVICE_STATUS.ACTIVE,
        'relayed addressed local ingress should apply strict CDC while forward topology converges',
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  'MessageGroupService - relayed strict CDC batch uses addressed local ingress when no onward strict target is viable',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    try {
      const service = new MessageGroupService({
        groupId: 'mg-strict-relayed-local-batch-fallback',
        replicaId: 'mg-strict-relayed-local-batch-fallback-r1',
        nodeId,
        replicaIds: [
          'mg-strict-relayed-local-batch-fallback-r1',
          'mg-strict-relayed-local-batch-fallback-r2',
          'mg-strict-relayed-local-batch-fallback-r3',
        ],
        transport: router,
      });

      service.raft = {
        state: LifeRaft.FOLLOWER,
      };
      service.leaderId = 'mg-strict-relayed-local-batch-fallback-r3';
      service.forwardCDCBatchToLeader = async () => {
        throw new Error(
          'relayed addressed local ingress should not re-forward strict CDC batches',
        );
      };

      service.systemTableCache.applySystemTableChange(
        TABLES.MESSAGE_GROUPS,
        CDC_OPERATION.UPSERT,
        {
          [COLUMN.GROUP_ID]: 'mg-strict-relayed-local-batch-fallback',
          [COLUMN.LEADER_NODE_ID]: 'seed-node',
        },
      );
      service.systemTableCache.applySystemTableChange(
        TABLES.SERVICES,
        CDC_OPERATION.UPSERT,
        {
          [COLUMN.SERVICE_ID]: 'mg-strict-relayed-local-batch-fallback-r3',
          [COLUMN.GROUP_ID]: 'mg-strict-relayed-local-batch-fallback',
          [COLUMN.NODE_ID]: 'seed-node',
          [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
          [COLUMN.STATUS]: SERVICE_STATUS.STOPPED,
          [COLUMN.ADDRESS]:
            'seed-node/message-group/mg-strict-relayed-local-batch-fallback-r3',
          [COLUMN.RAFT_ROLE]: RaftRole.LEADER,
          [COLUMN.UPDATED_AT]: Date.now() - 1,
        },
      );

      const result = await service.handleLatencyCdcPropagationBatchMessage(
        'msg-strict-relayed-local-batch-fallback',
        {
          type: 'latency.cdc.propagation.batch',
          relayDepth: 1,
          events: [
            {
              tableName: TABLES.NODES,
              operation: CDC_OPERATION.UPSERT,
              data: {
                [COLUMN.NODE_ID]: 'node-strict-relayed-local-batch-fallback',
                [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
              },
            },
            {
              tableName: TABLES.NODE_ENDPOINTS,
              operation: CDC_OPERATION.UPSERT,
              data: {
                [COLUMN.ENDPOINT_ID]: 'endpoint-strict-relayed-local-batch-fallback',
                [COLUMN.NODE_ID]: 'node-strict-relayed-local-batch-fallback',
                [COLUMN.PROTOCOL]: 'ws',
                [COLUMN.HOST]: '127.0.0.1',
                [COLUMN.PORT]: 3100,
                [COLUMN.PATH]: '/',
                [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
              },
            },
          ],
        },
      );

      t.equal(
        result.acknowledged,
        true,
        'relayed addressed local ingress should acknowledge strict CDC batches',
      );
      t.equal(
        result.eventCount,
        2,
        'relayed addressed local ingress should preserve the batch size',
      );
      t.equal(
        service.systemTableCache.get(
          TABLES.NODES,
          'node-strict-relayed-local-batch-fallback',
        )?.[COLUMN.STATUS],
        SERVICE_STATUS.ACTIVE,
        'relayed addressed local ingress should apply strict CDC batches while forward topology converges',
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  'MessageGroupService - relayed strict CDC uses addressed local ingress ' +
    'when a stale competing remote target still looks viable',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    try {
      const service = new MessageGroupService({
        groupId: TEST_RELAYED_STRICT_STALE_COMPETING_GROUP_ID,
        replicaId: TEST_RELAYED_STRICT_STALE_COMPETING_LOCAL_REPLICA_ID,
        nodeId,
        replicaIds: [
          TEST_RELAYED_STRICT_STALE_COMPETING_LOCAL_REPLICA_ID,
          TEST_RELAYED_STRICT_STALE_COMPETING_REMOTE_REPLICA_ID,
          'mg-relayed-strict-stale-competing-r3',
        ],
        transport: router,
      });

      service.raft = {
        state: LifeRaft.FOLLOWER,
      };
      service.leaderId =
        TEST_RELAYED_STRICT_STALE_COMPETING_REMOTE_REPLICA_ID;
      service.transport.getConnectionState = (candidateNodeId) => {
        return candidateNodeId ===
          TEST_RELAYED_STRICT_STALE_COMPETING_REMOTE_NODE_ID ?
          STATE.CONNECTED :
          null;
      };
      service.forwardCDCEventToLeader = async () => {
        throw new Error(
          'relayed addressed local ingress should not reopen stale remote ' +
          'strict forwarding loops',
        );
      };

      service.systemTableCache.applySystemTableChange(
        TABLES.MESSAGE_GROUPS,
        CDC_OPERATION.UPSERT,
        {
          [COLUMN.GROUP_ID]: TEST_RELAYED_STRICT_STALE_COMPETING_GROUP_ID,
          [COLUMN.LEADER_NODE_ID]:
            TEST_RELAYED_STRICT_STALE_COMPETING_REMOTE_NODE_ID,
        },
      );
      service.systemTableCache.applySystemTableChange(
        TABLES.SERVICES,
        CDC_OPERATION.UPSERT,
        {
          [COLUMN.SERVICE_ID]:
            TEST_RELAYED_STRICT_STALE_COMPETING_REMOTE_REPLICA_ID,
          [COLUMN.GROUP_ID]: TEST_RELAYED_STRICT_STALE_COMPETING_GROUP_ID,
          [COLUMN.NODE_ID]: TEST_RELAYED_STRICT_STALE_COMPETING_REMOTE_NODE_ID,
          [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
          [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
          [COLUMN.ADDRESS]: TEST_RELAYED_STRICT_STALE_COMPETING_REMOTE_ADDRESS,
          [COLUMN.RAFT_ROLE]: RaftRole.LEADER,
          [COLUMN.UPDATED_AT]: Date.now(),
        },
      );

      const initialDecision = service.resolveCdcIngressDecision({
        tableName: TABLES.NODES,
        operation: CDC_OPERATION.UPSERT,
      });
      const relayedDecision = service.resolveCdcIngressDecision({
        tableName: TABLES.NODES,
        operation: CDC_OPERATION.UPSERT,
        relayDepth: 1,
      });

      t.equal(
        initialDecision.action,
        MESSAGE_GROUP_CDC_INGRESS_ACTION.FORWARD,
        'without a relayed payload the stale competing remote target should ' +
          'keep strict CDC on the remote-forward path',
      );
      t.equal(
        relayedDecision.action,
        MESSAGE_GROUP_CDC_INGRESS_ACTION.APPLY_LOCAL,
        'a relayed strict payload should prefer addressed local ingress over ' +
          'reopening stale competing target loops',
      );
      t.equal(
        relayedDecision.localIngress,
        true,
        'the relayed competing-target decision should preserve the canonical ' +
          'local-ingress signal',
      );

      const result = await service.handleLatencyCdcPropagationMessage(
        'msg-relayed-strict-stale-competing',
        {
          type: 'latency.cdc.propagation',
          tableName: TABLES.NODES,
          operation: CDC_OPERATION.UPSERT,
          relayDepth: 1,
          data: {
            [COLUMN.NODE_ID]: TEST_RELAYED_STRICT_STALE_COMPETING_NODE_ROW_ID,
            [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
          },
        },
      );

      t.equal(
        result.acknowledged,
        true,
        'relayed competing-target local ingress should acknowledge strict CDC',
      );
      t.equal(
        service.systemTableCache.get(
          TABLES.NODES,
          TEST_RELAYED_STRICT_STALE_COMPETING_NODE_ROW_ID,
        )?.[COLUMN.STATUS],
        SERVICE_STATUS.ACTIVE,
        'relayed competing-target local ingress should apply the strict CDC ' +
          'event locally',
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  'MessageGroupService - strict CDC decision snapshot stays aligned for local convergence ingress',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    const readinessState = createTrafficReadinessState();
    try {
      const service = new MessageGroupService({
        groupId: 'mg-strict-decision-local',
        replicaId: 'mg-strict-decision-local-r1',
        nodeId,
        replicaIds: [
          'mg-strict-decision-local-r1',
          'mg-strict-decision-local-r2',
          'mg-strict-decision-local-r3',
        ],
        transport: router,
        bootstrapReadinessState: readinessState,
      });

      readinessState.transitionTo(LIFECYCLE_PHASE.CONTROL_READY, {
        ready: false,
        reasons: [LIFECYCLE_REASON.LEADER_METADATA_INCOMPLETE],
      });
      service.raft = {
        state: LifeRaft.FOLLOWER,
      };
      service.initialized = true;
      service.leaderId = 'mg-strict-decision-local-r3';
      service.forwardCDCEventToLeader = async () => {
        throw new Error(
          'local convergence ingress should not re-forward strict CDC',
        );
      };

      service.systemTableCache.applySystemTableChange(
        TABLES.MESSAGE_GROUPS,
        CDC_OPERATION.UPSERT,
        {
          [COLUMN.GROUP_ID]: 'mg-strict-decision-local',
          [COLUMN.LEADER_NODE_ID]: 'seed-node',
        },
      );
      service.systemTableCache.applySystemTableChange(
        TABLES.SERVICES,
        CDC_OPERATION.UPSERT,
        {
          [COLUMN.SERVICE_ID]: 'mg-strict-decision-local-r3',
          [COLUMN.GROUP_ID]: 'mg-strict-decision-local',
          [COLUMN.NODE_ID]: 'seed-node',
          [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
          [COLUMN.STATUS]: SERVICE_STATUS.STOPPED,
          [COLUMN.ADDRESS]:
            'seed-node/message-group/mg-strict-decision-local-r3',
          [COLUMN.RAFT_ROLE]: RaftRole.LEADER,
          [COLUMN.UPDATED_AT]: Date.now() - 1,
        },
      );

      const decision = service.resolveCdcIngressDecision({
        tableName: TABLES.NODES,
        operation: CDC_OPERATION.UPSERT,
      });
      const readiness = service.canAcceptCDCEvent({
        tableName: TABLES.NODES,
        operation: CDC_OPERATION.UPSERT,
      });
      const metadataReadiness = service.getMetadataIngressReadiness({
        requiredTables: [TABLES.NODES],
      });
      const selection = await service.resolveMetadataIngressForwardSelection({
        requiredTables: [TABLES.NODES],
      });

      t.equal(
        decision.state,
        MESSAGE_GROUP_CDC_INGRESS_STATE.LOCAL_STRICT_CONVERGENCE_INGRESS,
        'the canonical ingress decision should identify the local convergence ingress state',
      );
      t.equal(
        decision.action,
        MESSAGE_GROUP_CDC_INGRESS_ACTION.APPLY_LOCAL,
        'the canonical ingress decision should authorize local application during convergence',
      );
      t.equal(
        decision.localIngress,
        true,
        'the canonical ingress decision should mark the local convergence ingress path explicitly',
      );
      t.equal(
        Array.isArray(decision.targets),
        true,
        'the canonical ingress decision should normalize forward targets',
      );
      t.equal(
        decision.targets.length,
        0,
        'the local convergence ingress decision should not require a forward target',
      );
      t.equal(
        readiness.ready,
        true,
        'strict CDC readiness should be derived from the canonical local convergence ingress decision',
      );
      t.equal(
        readiness.localIngress,
        true,
        'strict CDC readiness should preserve the local-ingress signal from the canonical decision',
      );
      t.equal(
        metadataReadiness.ready,
        true,
        'metadata ingress readiness should reuse the same canonical local convergence ingress decision',
      );
      t.equal(
        selection.state,
        MESSAGE_GROUP_CDC_INGRESS_STATE.LOCAL_STRICT_CONVERGENCE_INGRESS,
        'metadata ingress selection should report the same canonical state',
      );
      t.equal(
        selection.action,
        MESSAGE_GROUP_CDC_INGRESS_ACTION.APPLY_LOCAL,
        'metadata ingress selection should report the same canonical action',
      );
      t.equal(
        selection.localIngress,
        true,
        'metadata ingress selection should preserve the local-ingress signal',
      );

      const result = await service.handleLatencyCdcPropagationMessage(
        'msg-strict-decision-local',
        {
          type: 'latency.cdc.propagation',
          tableName: TABLES.NODES,
          operation: CDC_OPERATION.UPSERT,
          data: {
            [COLUMN.NODE_ID]: 'node-strict-decision-local',
            [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
          },
        },
      );

      t.equal(
        result.acknowledged,
        true,
        'the strict CDC execution path should acknowledge locally applied convergence ingress',
      );
      t.equal(
        service.systemTableCache.get(
          TABLES.NODES,
          'node-strict-decision-local',
        )?.[COLUMN.STATUS],
        SERVICE_STATUS.ACTIVE,
        'the strict CDC execution path should apply through the canonical local convergence ingress decision',
      );
    } finally {
      await cleanup();
    }
  },
);
