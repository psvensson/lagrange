/**
 * Unit tests for MessageGroupService.
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */

import {EventEmitter} from 'node:events';
import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {
  MessageGroupService,
  RaftRole,
} from '../../src/message-group/message-group-service.js';
import {
  MESSAGE_GROUP_CDC_INGRESS_ACTION,
  MESSAGE_GROUP_CDC_INGRESS_STATE,
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
  INITIAL_PARTITION_IDS,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  LIFECYCLE_PHASE,
  LIFECYCLE_REASON,
} from '../../src/bootstrap/lifecycle-controller-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {
  buildCriticalVisibilityCdcPropagationDeliverySource,
} from '../../src/cache/cdc-propagation-delivery-profile.js';
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
} from '../../src/raft/constants.js';
import {
} from '../../src/control-plane/control-plane-constants.js';
import {
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
} from '../../src/control-plane/control-plane-workload-profile.js';
import {
} from '../../src/control-plane/pressure-governor.js';

// Port counter for unique ports per test
let testPortCounter = 24000;

const TEST_DELIVERY_PRIORITY = Object.freeze({
  BACKGROUND: 'background',
  CRITICAL: 'critical',
});
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
  'MessageGroupService - strict CDC decision snapshot stays aligned for recovery-widened forwarding',
  async (t) => {
    const transport = {
      async deliver(address) {
        transport.deliveredAddress = address;
        return {acknowledged: true, success: true};
      },
      async initialize() {},
      async shutdown() {},
      getConnectionState(nodeId) {
        return nodeId === TEST_STRICT_RECOVERY_FORWARD_REMOTE_NODE_ID ?
          STATE.CONNECTED :
          null;
      },
      setServiceNodeResolver() {},
    };

    const service = new MessageGroupService({
      groupId: TEST_STRICT_RECOVERY_FORWARD_GROUP_ID,
      replicaId: TEST_STRICT_RECOVERY_FORWARD_LOCAL_REPLICA_ID,
      nodeId: TEST_STRICT_RECOVERY_FORWARD_LOCAL_NODE_ID,
      replicaIds: [
        TEST_STRICT_RECOVERY_FORWARD_LEADER_REPLICA_ID,
        TEST_STRICT_RECOVERY_FORWARD_REMOTE_REPLICA_ID,
        TEST_STRICT_RECOVERY_FORWARD_LOCAL_REPLICA_ID,
      ],
      transport,
    });

    service.initialized = true;
    service.raft = {
      state: LifeRaft.FOLLOWER,
    };
    service.leaderId = TEST_STRICT_RECOVERY_FORWARD_LEADER_REPLICA_ID;
    service.cdcIntegrationService = {
      canWriteSystemTableLocally() {
        return false;
      },
      resolveSystemTablePartitionIds(tableName) {
        return [INITIAL_PARTITION_IDS[tableName]];
      },
      sqlQueryEngine: {
        queryExecutor: {
          getPartitionRoutingSnapshot(partitionId) {
            return {
              partitionId,
              routableServices: [{
                [COLUMN.NODE_ID]: TEST_STRICT_RECOVERY_FORWARD_REMOTE_NODE_ID,
              }],
            };
          },
        },
      },
    };

    service.systemTableCache.applySystemTableChange(
      TABLES.MESSAGE_GROUPS,
      CDC_OPERATION.UPSERT,
      {
        [COLUMN.GROUP_ID]: TEST_STRICT_RECOVERY_FORWARD_GROUP_ID,
        [COLUMN.LEADER_NODE_ID]: TEST_STRICT_RECOVERY_FORWARD_LEADER_NODE_ID,
      },
    );
    service.systemTableCache.applySystemTableChange(
      TABLES.SERVICES,
      CDC_OPERATION.UPSERT,
      {
        [COLUMN.SERVICE_ID]: TEST_STRICT_RECOVERY_FORWARD_REMOTE_REPLICA_ID,
        [COLUMN.GROUP_ID]: TEST_STRICT_RECOVERY_FORWARD_GROUP_ID,
        [COLUMN.NODE_ID]: TEST_STRICT_RECOVERY_FORWARD_REMOTE_NODE_ID,
        [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
        [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
        [COLUMN.ADDRESS]: TEST_STRICT_RECOVERY_FORWARD_REMOTE_ADDRESS,
        [COLUMN.RAFT_ROLE]: RaftRole.FOLLOWER,
        [COLUMN.UPDATED_AT]: Date.now(),
      },
    );

    const decision = service.resolveCdcIngressDecision({
      tableName: TABLES.NODES,
      operation: CDC_OPERATION.UPSERT,
    });

    t.equal(
      decision.state,
      MESSAGE_GROUP_CDC_INGRESS_STATE.FORWARD_STRICT_RECOVERY_TARGET,
      'the canonical ingress decision should classify widened recovery forwarding explicitly',
    );
    t.equal(
      decision.action,
      MESSAGE_GROUP_CDC_INGRESS_ACTION.FORWARD,
      'the canonical ingress decision should continue forwarding when a recovery target is available',
    );
    t.equal(
      decision.recoveryCandidateWidening,
      true,
      'the canonical ingress decision should preserve recovery-widening truth',
    );
    t.equal(
      decision.strictRecoveryRoutingState,
      TEST_STRICT_RECOVERY_ROUTING_STATE_REMOTE_TARGETS,
      'the canonical ingress decision should preserve the widened recovery-routing state',
    );
    t.equal(
      decision.targets[0]?.address,
      TEST_STRICT_RECOVERY_FORWARD_REMOTE_ADDRESS,
      'the canonical ingress decision should target the recovery-routable replica',
    );

    await service.forwardCDCEventToLeader(
      TABLES.NODES,
      CDC_OPERATION.UPSERT,
      {
        [COLUMN.NODE_ID]: 'node-strict-recovery-forward',
        [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      },
      {causeId: 'cause-strict-recovery-forward'},
    );

    t.equal(
      transport.deliveredAddress,
      TEST_STRICT_RECOVERY_FORWARD_REMOTE_ADDRESS,
      'strict CDC forwarding should deliver to the widened recovery target',
    );
  },
);

test(
  'MessageGroupService - strict CDC decision snapshot stays aligned for local recovery ingress',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    try {
      const service = new MessageGroupService({
        groupId: 'mg-strict-recovery-local',
        replicaId: 'mg-strict-recovery-local-r3',
        nodeId,
        replicaIds: [
          'mg-strict-recovery-local-r1',
          'mg-strict-recovery-local-r2',
          'mg-strict-recovery-local-r3',
        ],
        transport: router,
      });

      service.initialized = true;
      service.raft = {
        state: LifeRaft.FOLLOWER,
      };
      service.cdcIntegrationService = {
        canWriteSystemTableLocally(tableName) {
          return tableName === TABLES.NODES;
        },
        resolveSystemTablePartitionIds(tableName) {
          return [INITIAL_PARTITION_IDS[tableName]];
        },
        sqlQueryEngine: {
          queryExecutor: {
            getPartitionRoutingSnapshot(partitionId) {
              return {
                partitionId,
                routableServices: [{
                  [COLUMN.NODE_ID]: nodeId,
                }],
              };
            },
          },
        },
      };
      service.forwardCDCEventToLeader = async () => {
        throw new Error(
          'local strict recovery ingress should not re-forward strict CDC',
        );
      };

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
        MESSAGE_GROUP_CDC_INGRESS_STATE.LOCAL_STRICT_RECOVERY_INGRESS,
        'the canonical ingress decision should identify bounded local recovery ingress explicitly',
      );
      t.equal(
        decision.action,
        MESSAGE_GROUP_CDC_INGRESS_ACTION.APPLY_LOCAL,
        'the canonical ingress decision should apply locally when the local system-table owner is already available',
      );
      t.equal(
        decision.localIngress,
        true,
        'the canonical ingress decision should preserve the local-ingress signal for local recovery ingress',
      );
      t.equal(
        decision.recoveryCandidateWidening,
        true,
        'the canonical ingress decision should preserve recovery-widening truth for local recovery ingress',
      );
      t.equal(
        decision.strictRecoveryRoutingState,
        TEST_STRICT_RECOVERY_ROUTING_STATE_LOCAL_ONLY,
        'the canonical ingress decision should preserve the local-only recovery-routing state',
      );
      t.equal(
        readiness.ready,
        true,
        'strict CDC readiness should be derived from the canonical local recovery ingress decision',
      );
      t.equal(
        metadataReadiness.ready,
        true,
        'metadata ingress readiness should reuse the canonical local recovery ingress decision',
      );
      t.equal(
        selection.state,
        MESSAGE_GROUP_CDC_INGRESS_STATE.LOCAL_STRICT_RECOVERY_INGRESS,
        'metadata ingress selection should report the same canonical local recovery ingress state',
      );

      const result = await service.handleLatencyCdcPropagationMessage(
        'msg-strict-recovery-local',
        {
          type: 'latency.cdc.propagation',
          tableName: TABLES.NODES,
          operation: CDC_OPERATION.UPSERT,
          data: {
            [COLUMN.NODE_ID]: 'node-strict-recovery-local',
            [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
          },
        },
      );

      t.equal(
        result.acknowledged,
        true,
        'the strict CDC execution path should acknowledge local recovery ingress',
      );
      t.equal(
        service.systemTableCache.get(
          TABLES.NODES,
          'node-strict-recovery-local',
        )?.[COLUMN.STATUS],
        SERVICE_STATUS.ACTIVE,
        'the strict CDC execution path should apply through the canonical local recovery ingress decision',
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  'MessageGroupService - strict CDC decision snapshot stays aligned for leader-unknown defer',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    try {
      const service = new MessageGroupService({
        groupId: 'mg-strict-decision-defer',
        replicaId: 'mg-strict-decision-defer-r3',
        nodeId,
        replicaIds: [
          'mg-strict-decision-defer-r1',
          'mg-strict-decision-defer-r2',
          'mg-strict-decision-defer-r3',
        ],
        transport: router,
      });

      service.initialized = true;
      service.raft = {
        state: LifeRaft.FOLLOWER,
      };
      service.forwardCDCEventToLeader = async () => {
        throw new Error(
          'strict leader-unknown defer should not attempt an immediate forward',
        );
      };

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
        MESSAGE_GROUP_CDC_INGRESS_STATE.DEFER_STRICT_TARGET_UNKNOWN,
        'the canonical ingress decision should classify strict leader-unknown defer explicitly',
      );
      t.equal(
        decision.action,
        MESSAGE_GROUP_CDC_INGRESS_ACTION.DEFER,
        'the canonical ingress decision should defer when no strict target is viable',
      );
      t.equal(
        decision.shouldRepairAuthoritativeTopology,
        true,
        'the canonical ingress decision should request bounded authoritative topology repair on strict leader-unknown defer',
      );
      t.equal(
        readiness.ready,
        false,
        'strict CDC readiness should fail closed from the canonical leader-unknown defer decision',
      );
      t.match(
        readiness.reason,
        /leader is unknown/i,
        'strict CDC readiness should preserve the canonical leader-unknown reason',
      );
      t.equal(
        metadataReadiness.ready,
        false,
        'metadata ingress readiness should reuse the canonical leader-unknown defer decision',
      );
      t.equal(
        selection.state,
        MESSAGE_GROUP_CDC_INGRESS_STATE.DEFER_STRICT_TARGET_UNKNOWN,
        'metadata ingress selection should report the same canonical defer state',
      );
      t.equal(
        selection.action,
        MESSAGE_GROUP_CDC_INGRESS_ACTION.DEFER,
        'metadata ingress selection should report the same canonical defer action',
      );
      t.equal(
        selection.targets.length,
        0,
        'metadata ingress selection should preserve the empty strict-target set from the canonical decision',
      );

      const result = await service.handleLatencyCdcPropagationMessage(
        'msg-strict-decision-defer',
        {
          type: 'latency.cdc.propagation',
          tableName: TABLES.NODES,
          operation: CDC_OPERATION.UPSERT,
          data: {
            [COLUMN.NODE_ID]: 'node-strict-decision-defer',
            [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
          },
        },
      );

      t.equal(
        result.acknowledged,
        true,
        'the strict CDC execution path should acknowledge deferred leader-unknown ingress',
      );
      t.equal(
        result.success,
        false,
        'the strict CDC execution path should surface the canonical defer outcome',
      );
      t.equal(
        result.deferRetry,
        true,
        'the strict CDC execution path should preserve defer semantics from the canonical decision',
      );
      t.match(
        result.error,
        /leader is unknown/i,
        'the strict CDC execution path should preserve the canonical leader-unknown reason',
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  'MessageGroupService - strict CDC forward retries selection after authoritative topology repair',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    try {
      const service = new MessageGroupService({
        groupId: 'mg-forward-repair',
        replicaId: 'mg-forward-repair-r3',
        nodeId,
        transport: router,
      });

      let selectionCalls = 0;
      let repairCalls = 0;
      let deliveredAddress = null;
      let deliveredOptions = null;
      service.resolveCDCForwardSelection = () => {
        selectionCalls += 1;
        if (selectionCalls === 1) {
          return {
            strictForwarding: true,
            strictForwardRetryAfterMs: 250,
            targets: [],
            suppressedCount: 0,
          };
        }
        return {
          strictForwarding: true,
          strictForwardRetryAfterMs: 250,
          targets: [{
            serviceId: 'mg-forward-repair-r1',
            address: 'peer-node-a/message-group/mg-forward-repair-r1',
          }],
          suppressedCount: 0,
        };
      };
      service.maybeRepairAuthoritativeForwardTopology = async () => {
        repairCalls += 1;
        return true;
      };
      service.transport.deliver = async (address, _payload, options) => {
        deliveredAddress = address;
        deliveredOptions = options;
        return {acknowledged: true, success: true};
      };

      await service.forwardCDCPayloadToLeader(
        {type: 'CDC_PROPAGATION'},
        {
          tableName: TABLES.NODES,
          operation: CDC_OPERATION.UPSERT,
          causeId: 'cause-forward-repair',
        },
      );

      t.equal(repairCalls, 1,
        'strict forward should run one bounded authoritative repair before failing');
      t.equal(selectionCalls, 2,
        'strict forward should recompute selection after repair');
      t.equal(
        deliveredAddress,
        'peer-node-a/message-group/mg-forward-repair-r1',
        'strict forward should deliver to the repaired leader target',
      );
      t.equal(
        deliveredOptions?.deliveryPriority,
        TEST_DELIVERY_PRIORITY.CRITICAL,
        'strict forward should keep priority CDC traffic on the critical lane',
      );
      t.equal(
        deliveredOptions?.deliverySource,
        buildCriticalVisibilityCdcPropagationDeliverySource(TABLES.NODES),
        'strict forward should forward one explicit table-scoped delivery source',
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  'MessageGroupService - direct strict CDC forward falls back to addressed local ingress after bounded leader rejection',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    const readinessState = createTrafficReadinessState();
    try {
      const service = new MessageGroupService({
        groupId: TEST_ADDRESSED_STRICT_CONVERGENCE_GROUP_ID,
        replicaId: TEST_ADDRESSED_STRICT_CONVERGENCE_LOCAL_REPLICA_ID,
        nodeId,
        replicaIds: [
          TEST_ADDRESSED_STRICT_CONVERGENCE_REMOTE_REPLICA_ID,
          'mg-addressed-strict-forward-convergence-r2',
          TEST_ADDRESSED_STRICT_CONVERGENCE_LOCAL_REPLICA_ID,
        ],
        transport: router,
        bootstrapReadinessState: readinessState,
      });

      readinessState.transitionTo(LIFECYCLE_PHASE.CONTROL_READY, {
        ready: false,
        reasons: [LIFECYCLE_REASON.LEADER_METADATA_INCOMPLETE],
      });
      service.initialized = true;
      service.raft = {
        state: LifeRaft.FOLLOWER,
      };
      service.leaderId =
        TEST_ADDRESSED_STRICT_CONVERGENCE_REMOTE_REPLICA_ID;
      service.transport.getConnectionState = (candidateNodeId) => {
        return candidateNodeId ===
          TEST_ADDRESSED_STRICT_CONVERGENCE_REMOTE_NODE_ID ?
          STATE.CONNECTED :
          null;
      };

      service.systemTableCache.applySystemTableChange(
        TABLES.MESSAGE_GROUPS,
        CDC_OPERATION.UPSERT,
        {
          [COLUMN.GROUP_ID]: TEST_ADDRESSED_STRICT_CONVERGENCE_GROUP_ID,
          [COLUMN.LEADER_NODE_ID]:
            TEST_ADDRESSED_STRICT_CONVERGENCE_REMOTE_NODE_ID,
        },
      );
      service.systemTableCache.applySystemTableChange(
        TABLES.SERVICES,
        CDC_OPERATION.UPSERT,
        {
          [COLUMN.SERVICE_ID]:
            TEST_ADDRESSED_STRICT_CONVERGENCE_REMOTE_REPLICA_ID,
          [COLUMN.GROUP_ID]: TEST_ADDRESSED_STRICT_CONVERGENCE_GROUP_ID,
          [COLUMN.NODE_ID]:
            TEST_ADDRESSED_STRICT_CONVERGENCE_REMOTE_NODE_ID,
          [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
          [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
          [COLUMN.ADDRESS]:
            TEST_ADDRESSED_STRICT_CONVERGENCE_REMOTE_ADDRESS,
          [COLUMN.RAFT_ROLE]: RaftRole.LEADER,
          [COLUMN.UPDATED_AT]: Date.now(),
        },
      );

      const initialDecision = service.resolveCdcIngressDecision({
        tableName: TABLES.PARTITIONS,
        operation: CDC_OPERATION.UPDATE,
      });
      let repairCalls = 0;
      let deliveryAttempts = 0;
      service.maybeRepairAuthoritativeForwardTopology = async () => {
        repairCalls += 1;
        return false;
      };
      service.transport.deliver = async (address) => {
        deliveryAttempts += 1;
        t.equal(
          address,
          TEST_ADDRESSED_STRICT_CONVERGENCE_REMOTE_ADDRESS,
          'the direct strict forward should first attempt the canonical remote leader target',
        );
        return {
          acknowledged: true,
          success: false,
          error: MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN,
        };
      };

      t.equal(
        initialDecision.action,
        MESSAGE_GROUP_CDC_INGRESS_ACTION.FORWARD,
        'without an addressed convergence attempt the strict ingress decision should stay on the remote-forward path',
      );

      await service.forwardCDCPayloadToLeader(
        {
          type:
            MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE.LATENCY_CDC_PROPAGATION,
          tableName: TABLES.PARTITIONS,
          operation: CDC_OPERATION.UPDATE,
          data: {
            [COLUMN.PARTITION_ID]:
              TEST_ADDRESSED_STRICT_CONVERGENCE_PARTITION_ID,
            [COLUMN.LEADER_NODE_ID]:
              TEST_ADDRESSED_STRICT_CONVERGENCE_REMOTE_NODE_ID,
          },
          timestamp: TEST_ADDRESSED_STRICT_CONVERGENCE_TIMESTAMP,
          sourceNodeId: nodeId,
        },
        {
          tableName: TABLES.PARTITIONS,
          operation: CDC_OPERATION.UPDATE,
          causeId: TEST_ADDRESSED_STRICT_CONVERGENCE_CAUSE_ID,
        },
      );

      t.equal(
        repairCalls,
        1,
        'bounded strict forwarding should perform one authoritative repair before falling back locally',
      );
      t.equal(
        deliveryAttempts,
        1,
        'bounded strict forwarding should attempt the remote leader once before addressed local convergence ingress takes over',
      );
      t.equal(
        service.systemTableCache.get(
          TABLES.PARTITIONS,
          TEST_ADDRESSED_STRICT_CONVERGENCE_PARTITION_ID,
        )?.[COLUMN.LEADER_NODE_ID],
        TEST_ADDRESSED_STRICT_CONVERGENCE_REMOTE_NODE_ID,
        'addressed local convergence ingress should apply the strict partitions CDC event locally after the bounded leader rejection',
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  'MessageGroupService - leader-routed strict CDC forwards the first relay hop into addressed local convergence',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    const readinessState = createTrafficReadinessState();
    try {
      const service = new MessageGroupService({
        groupId: TEST_ADDRESSED_STRICT_CONVERGENCE_GROUP_ID,
        replicaId: TEST_ADDRESSED_STRICT_CONVERGENCE_LOCAL_REPLICA_ID,
        nodeId,
        replicaIds: [
          TEST_ADDRESSED_STRICT_CONVERGENCE_REMOTE_REPLICA_ID,
          'mg-addressed-strict-forward-convergence-r2',
          TEST_ADDRESSED_STRICT_CONVERGENCE_LOCAL_REPLICA_ID,
        ],
        transport: router,
        bootstrapReadinessState: readinessState,
      });

      readinessState.transitionTo(LIFECYCLE_PHASE.CONTROL_READY, {
        ready: false,
        reasons: [LIFECYCLE_REASON.LEADER_METADATA_INCOMPLETE],
      });
      service.initialized = true;
      service.raft = {
        state: LifeRaft.FOLLOWER,
      };
      service.leaderId =
        TEST_ADDRESSED_STRICT_CONVERGENCE_REMOTE_REPLICA_ID;
      service.raftProvider = {
        async proposeWithLeaderRouting(_raft, command, options) {
          await options.forwardToLeader(command, {
            attempt: 1,
            mode: 'forward',
          });
        },
        joinPeer() {},
      };
      service.transport.getConnectionState = (candidateNodeId) => {
        return candidateNodeId ===
          TEST_ADDRESSED_STRICT_CONVERGENCE_REMOTE_NODE_ID ?
          STATE.CONNECTED :
          null;
      };

      service.systemTableCache.applySystemTableChange(
        TABLES.MESSAGE_GROUPS,
        CDC_OPERATION.UPSERT,
        {
          [COLUMN.GROUP_ID]: TEST_ADDRESSED_STRICT_CONVERGENCE_GROUP_ID,
          [COLUMN.LEADER_NODE_ID]:
            TEST_ADDRESSED_STRICT_CONVERGENCE_REMOTE_NODE_ID,
        },
      );
      service.systemTableCache.applySystemTableChange(
        TABLES.SERVICES,
        CDC_OPERATION.UPSERT,
        {
          [COLUMN.SERVICE_ID]:
            TEST_ADDRESSED_STRICT_CONVERGENCE_REMOTE_REPLICA_ID,
          [COLUMN.GROUP_ID]: TEST_ADDRESSED_STRICT_CONVERGENCE_GROUP_ID,
          [COLUMN.NODE_ID]:
            TEST_ADDRESSED_STRICT_CONVERGENCE_REMOTE_NODE_ID,
          [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
          [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
          [COLUMN.ADDRESS]:
            TEST_ADDRESSED_STRICT_CONVERGENCE_REMOTE_ADDRESS,
          [COLUMN.RAFT_ROLE]: RaftRole.LEADER,
          [COLUMN.UPDATED_AT]: Date.now(),
        },
      );

      let repairCalls = 0;
      let deliveryAttempts = 0;
      service.maybeRepairAuthoritativeForwardTopology = async () => {
        repairCalls += 1;
        return false;
      };
      service.transport.deliver = async (address, payload) => {
        deliveryAttempts += 1;
        t.equal(
          address,
          TEST_ADDRESSED_STRICT_CONVERGENCE_REMOTE_ADDRESS,
          'leader-routed strict CDC should still aim at the canonical remote leader target first',
        );
        t.equal(
          payload?.relayDepth,
          1,
          'leader-routed strict CDC should mark the first forward attempt as a relayed hop',
        );
        return {
          acknowledged: true,
          success: false,
          error: MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN,
        };
      };

      await service.proposeCDCCommand({
        type: 'CDC',
        tableName: TABLES.PARTITIONS,
        operation: CDC_OPERATION.UPDATE,
        data: {
          [COLUMN.PARTITION_ID]:
            TEST_ADDRESSED_STRICT_CONVERGENCE_PARTITION_ID,
          [COLUMN.LEADER_NODE_ID]:
            TEST_ADDRESSED_STRICT_CONVERGENCE_REMOTE_NODE_ID,
        },
        timestamp: TEST_ADDRESSED_STRICT_CONVERGENCE_TIMESTAMP,
        causeId: TEST_ADDRESSED_STRICT_CONVERGENCE_CAUSE_ID,
      });

      t.equal(
        repairCalls,
        1,
        'leader-routed strict CDC should still perform one bounded authoritative repair before converging locally',
      );
      t.equal(
        deliveryAttempts,
        1,
        'leader-routed strict CDC should attempt the remote leader once before addressed convergence takes over',
      );
      t.equal(
        service.systemTableCache.get(
          TABLES.PARTITIONS,
          TEST_ADDRESSED_STRICT_CONVERGENCE_PARTITION_ID,
        )?.[COLUMN.LEADER_NODE_ID],
        TEST_ADDRESSED_STRICT_CONVERGENCE_REMOTE_NODE_ID,
        'leader-routed strict CDC should still apply the strict partitions CDC event locally after the bounded leader rejection',
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  'MessageGroupService - leader change demotes stale local leadership without follower event',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    try {
      const service = new MessageGroupService({
        groupId: 'mg-leader-change-demotion',
        replicaId: 'mg-leader-change-demotion-r1',
        nodeId,
        transport: router,
      });

      await service.initialize();
      t.equal(service.role, RaftRole.LEADER, 'single replica should start as leader');
      t.equal(service.leaderId, service.replicaId, 'single replica should start as self leader');
      const retryTimer = setTimeout(() => {}, 10000);
      service.leaderNodeMutationHelper.retryTimer = retryTimer;

      // Regression: liferaft may emit a leader-change notification without a
      // separate follower event when leadership moves away from the local replica.
      service.raft.emit(
        RAFT_EVENT.LEADER_CHANGE,
        'node-2/message-group/mg-leader-change-demotion-r2',
      );

      t.equal(service.role, RaftRole.FOLLOWER, 'leader-change should demote local role');
      t.equal(service.isLeader, false, 'leader-change should clear leader flag');
      t.equal(
        service.leaderId,
        'mg-leader-change-demotion-r2',
        'leader-change should normalize the new leader to a replica id',
      );
      t.equal(
        service.leaderNodeUpdateRetryTimer,
        null,
        'leader-change demotion should clear pending leader-node retry timer',
      );

      await service.shutdown();
    } finally {
      await cleanup();
    }
  },
);

test('MessageGroupService - forward rejection logs bounded leader diagnostics',
  async (t) => {
    const transport = {
      async deliver() {
        return {
          acknowledged: true,
          success: false,
          noHandler: true,
          error: 'No handler for address: remote-node/message-group/mg-forward-diag-r2',
        };
      },
      async initialize() {},
      async shutdown() {},
      setServiceNodeResolver() {},
    };

    const warningLogs = [];
    const service = new MessageGroupService({
      groupId: 'mg-forward-diag',
      replicaId: 'mg-forward-diag-r1',
      nodeId: 'node-forward-diag',
      transport,
    });
    service.logger.warn = (msg, fields) => {
      warningLogs.push({msg, fields});
    };
    service.resolveCDCForwardSelection = () => ({
      strictForwarding: true,
      strictForwardRetryAfterMs: 275,
      targets: [{
        serviceId: 'mg-forward-diag-r2',
        address: 'remote-node/message-group/mg-forward-diag-r2',
      }],
      suppressedCount: 0,
    });
    service.maybeRepairAuthoritativeForwardTopology = async () => false;
    service.shouldRepairForwardTopology = () => false;
    service.shouldSuppressForwardTarget = () => false;

    await t.rejects(
      service.forwardCDCPayloadToLeader(
        {type: 'CDC_PROPAGATION'},
        {
          tableName: TABLES.SERVICES,
          operation: CDC_OPERATION.UPSERT,
          causeId: 'cause-forward-diagnostics',
        },
      ),
      /forward/i,
      'strict forwarding should still fail closed on handler rejection',
    );

    t.equal(warningLogs.length, 1, 'should log one bounded rejection event');
    t.equal(warningLogs[0]?.msg, 'CDC forward to leader rejected');
    t.equal(warningLogs[0]?.fields?.leaderServiceId, 'mg-forward-diag-r2',
      'warning should identify the rejected leader service');
    t.equal(
      warningLogs[0]?.fields?.deliveryRejectedByHandler,
      true,
      'warning should classify handler rejection explicitly',
    );
    t.equal(warningLogs[0]?.fields?.noHandler, true,
      'warning should preserve the no-handler signal');
    t.equal(warningLogs[0]?.fields?.acknowledged, true,
      'warning should preserve delivery acknowledgement state');
    t.equal(warningLogs[0]?.fields?.success, false,
      'warning should preserve delivery success state');
    t.equal(warningLogs[0]?.fields?.strictForwarding, true,
      'warning should indicate strict forwarding mode');
    t.equal(warningLogs[0]?.fields?.strictForwardRetryAfterMs, 275,
      'warning should preserve strict forwarding retry-after');
  });

test('MessageGroupService - buildPeerAddress follows cache updates after relocation', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  try {
    const peerId = 'mg-1-r2';
    const initialAddress = 'peer-node-a/message-group/mg-1-r2';
    const relocatedAddress = 'peer-node-b/message-group/mg-1-r2';

    const service = new MessageGroupService({
      groupId: 'mg-1',
      replicaId: 'mg-1-r1',
      nodeId,
      replicaIds: ['mg-1-r1', 'mg-1-r2'],
      peerAddresses: [`stale-node/message-group/${peerId}`],
      transport: router,
    });

    service.systemTableCache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPSERT, {
      service_id: peerId,
      service_type: SERVICE_TYPE.MESSAGE_GROUP,
      node_id: 'peer-node-a',
      group_id: 'mg-1',
      replica_id: peerId,
      status: SERVICE_STATUS.ACTIVE,
      address: initialAddress,
      updated_at: Date.now(),
    });

    t.equal(
      service.buildPeerAddress(peerId),
      initialAddress,
      'should resolve initial location from services cache',
    );

    service.systemTableCache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPSERT, {
      service_id: peerId,
      node_id: 'peer-node-b',
      address: relocatedAddress,
      updated_at: Date.now() + 1,
    });

    t.equal(
      service.buildPeerAddress(peerId),
      relocatedAddress,
      'should resolve relocated address from refreshed cache entry',
    );
  } finally {
    await cleanup();
  }
});

test('MessageGroupService - buildPeerAddress logs structured diagnostics ' +
  'only when bootstrap hints are explicitly allowed', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  try {
    const peerId = 'mg-1-r2';
    const hintAddress = `seed-node/message-group/${peerId}`;
    const warningLogs = [];

    const service = new MessageGroupService({
      groupId: 'mg-1',
      replicaId: 'mg-1-r1',
      nodeId,
      replicaIds: ['mg-1-r1', 'mg-1-r2'],
      peerAddresses: [hintAddress],
      transport: router,
    });

    const originalWarn = service.logger.warn?.bind(service.logger);
    service.logger.warn = (msg, fields) => {
      warningLogs.push({msg, fields});
      if (originalWarn) {
        return originalWarn(msg, fields);
      }
    };

    t.throws(
      () => service.buildPeerAddress(peerId),
      /Unable to resolve unified peer address/,
      'generic peer resolution should fail closed when only bootstrap hints remain',
    );
    t.equal(
      service.buildPeerAddress(peerId, {allowBootstrapHints: true}),
      hintAddress,
      'explicit join-time resolution may still use the bootstrap hint bridge',
    );
    t.equal(
      service.buildPeerAddress(peerId, {allowBootstrapHints: true}),
      hintAddress,
      'repeated explicit fallback should still resolve via bootstrap hint',
    );
    t.equal(warningLogs.length, 1, 'should emit fallback diagnostics only once per peer');
    t.equal(
      warningLogs[0]?.fields?.resolutionSource,
      'bootstrap_hint',
      'fallback diagnostics should identify bootstrap hint source',
    );
  } finally {
    await cleanup();
  }
});

test(
  'MessageGroupService - buildPeerAddress prefers live raft peer addresses before bootstrap hints',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    try {
      const peerId = 'mg-1-r2';
      const liveAddress = `peer-node-a/message-group/${peerId}`;
      const hintAddress = `seed-node/message-group/${peerId}`;
      const warningLogs = [];

      const service = new MessageGroupService({
        groupId: 'mg-1',
        replicaId: 'mg-1-r1',
        nodeId,
        replicaIds: ['mg-1-r1', 'mg-1-r2'],
        peerAddresses: [hintAddress],
        transport: router,
      });

      service.raft = {
        nodes: [{address: liveAddress}],
      };

      const originalWarn = service.logger.warn?.bind(service.logger);
      service.logger.warn = (msg, fields) => {
        warningLogs.push({msg, fields});
        if (originalWarn) {
          return originalWarn(msg, fields);
        }
      };

      t.equal(
        service.buildPeerAddress(peerId),
        liveAddress,
        'runtime peer location should win before bootstrap hints are considered',
      );
      t.equal(
        warningLogs.length,
        0,
        'live raft peer resolution should not emit bootstrap fallback diagnostics',
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  'MessageGroupService - cache reconciliation refreshes moved peers and joins new replicas',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    try {
      const systemTableCache = new SystemTableCache();
      systemTableCache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.INSERT, {
        service_id: 'mg-1-r1',
        service_type: SERVICE_TYPE.MESSAGE_GROUP,
        node_id: nodeId,
        group_id: 'mg-1',
        replica_id: 'mg-1-r1',
        status: SERVICE_STATUS.ACTIVE,
      });
      systemTableCache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.INSERT, {
        service_id: 'mg-1-r2',
        service_type: SERVICE_TYPE.MESSAGE_GROUP,
        node_id: 'node-new',
        group_id: 'mg-1',
        replica_id: 'mg-1-r2',
        status: SERVICE_STATUS.ACTIVE,
      });

      const joinedAddresses = [];
      const leftAddresses = [];
      const service = new MessageGroupService({
        groupId: 'mg-1',
        replicaId: 'mg-1-r1',
        nodeId,
        replicaIds: ['mg-1-r1', 'mg-1-r2'],
        peerAddresses: ['node-old/message-group/mg-1-r2'],
        transport: router,
      });

      service.raft = {
        nodes: [{address: 'node-old/message-group/mg-1-r2'}],
        leave(address) {
          leftAddresses.push(address);
          this.nodes = this.nodes.filter((node) => node?.address !== address);
        },
      };
      service.raftProvider = {
        joinPeer(_raft, address) {
          joinedAddresses.push(address);
          service.raft.nodes.push({address});
        },
      };

      service.systemTableCache = systemTableCache;
      await new Promise((resolve) => setImmediate(resolve));

      t.equal(
        service.buildPeerAddress('mg-1-r2'),
        'node-new/message-group/mg-1-r2',
        'cache-backed ownership should override stale bootstrap peer hints',
      );
      t.same(
        leftAddresses,
        ['node-old/message-group/mg-1-r2'],
        'stale raft peer address should be replaced when ownership moves',
      );
      t.same(
        joinedAddresses,
        ['node-new/message-group/mg-1-r2'],
        'reconciliation should join the moved peer from cache rows',
      );

      systemTableCache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.INSERT, {
        service_id: 'mg-1-r3',
        service_type: SERVICE_TYPE.MESSAGE_GROUP,
        node_id: 'node-3',
        group_id: 'mg-1',
        replica_id: 'mg-1-r3',
        status: SERVICE_STATUS.ACTIVE,
      });
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));

      t.same(
        joinedAddresses,
        [
          'node-new/message-group/mg-1-r2',
          'node-3/message-group/mg-1-r3',
        ],
        'newly visible peers should be joined from later cache rows',
      );
      t.ok(
        service.replicaIds.includes('mg-1-r3'),
        'replicaIds should expand to include cache-discovered peers',
      );
    } finally {
      await cleanup();
    }
  },
);
