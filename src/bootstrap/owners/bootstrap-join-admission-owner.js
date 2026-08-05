import {validate as uuidValidate} from 'uuid';
import {assertCritical} from '../../utils/assert.js';
import {
  ADDRESS,
  COLUMN,
  ENTITY_TYPE,
  HTTP_STATUS,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../constants/index.js';
import {NODE_STATE} from '../../constants/node-state.js';
import {RAFT_ROLE} from '../../raft/constants.js';
import {AuthoritativeControlPlaneView} from
  '../../control-plane/authoritative-control-plane-view.js';
import {
  isBootJoinRejoinMembershipOwnerOutcome,
  isMembershipOwnerRestartReentryOutcome,
} from '../../control-plane/membership-lifecycle-controller.js';
import {MessageGroupAssignment} from '../message-group-assignment.js';
import {
  BOOTSTRAP_ASSIGNMENT_STRATEGY,
  BOOTSTRAP_PIPELINE_ERROR_CODE,
} from '../bootstrap-constants.js';
import {
  BOOTSTRAP_API_ERROR,
  BOOTSTRAP_API_LOG_MSG,
  BOOTSTRAP_API_PROBE_REASON,
  BOOTSTRAP_API_SUBSYSTEM,
} from '../bootstrap-api-constants.js';
import {
  CLUSTER_ID_MATCH_STATE,
  classifyClusterIdMatch,
} from '../cluster-identity-constants.js';
import {getRemainingBudgetMs} from '../../control-plane/timeout-budget.js';

const BootstrapStrategy = BOOTSTRAP_ASSIGNMENT_STRATEGY;

const REJOIN_TERMINAL_STATES = Object.freeze(new Set([
  NODE_STATE.STOPPED,
  NODE_STATE.FAILED,
  NODE_STATE.SHUTTING_DOWN,
]));
const NODE_ROW_FIELD = Object.freeze({
  NODE_ADDRESS: 'node_address',
});
const REJOIN_AUTHORITY_SOURCE = Object.freeze({
  LOCAL_CACHE_RESTART_REENTRY: 'local_cache_restart_reentry',
});
const MOVE_REPLICA_ASSIGNMENT_LOCK_WAIT_OUTCOME = Object.freeze({
  ACQUIRED: 'acquired',
  BUDGET_EXHAUSTED: 'budget_exhausted',
});

class BootstrapJoinAdmissionOwner {
  constructor(options = {}) {
    this.delegates = options.delegates || {};
    this.moveReplicaAssignmentReservationLock = Promise.resolve();
  }

  getSeedNodeId() {
    return this.delegates.getSeedNodeId?.() || null;
  }

  getClusterId() {
    return this.delegates.getClusterId?.() || null;
  }

  getSeedNodeAddress() {
    return this.delegates.getSeedNodeAddress?.() || null;
  }

  getSystemTableCache() {
    return this.delegates.getSystemTableCache?.() || null;
  }

  getLogger() {
    return this.delegates.getLogger?.() || console;
  }

  getCdcIntegrationService() {
    return this.delegates.getCdcIntegrationService?.() || null;
  }

  getMessageRouter() {
    return this.delegates.getMessageRouter?.() || null;
  }

  getAuthoritativeControlPlaneViewInstance() {
    return this.delegates.getAuthoritativeControlPlaneViewInstance?.() || null;
  }

  setAuthoritativeControlPlaneViewInstance(view) {
    this.delegates.setAuthoritativeControlPlaneViewInstance?.(view || null);
  }

  getBootstrapAuthoritativeTableRows(tableName) {
    return this.delegates.getBootstrapAuthoritativeTableRows?.(tableName) || [];
  }

  getBootstrapAdmissionTableRows(tableName) {
    const rows =
      this.delegates.getBootstrapAdmissionTableRows?.(tableName) || null;
    return Array.isArray(rows) ?
      rows :
      this.getBootstrapAuthoritativeTableRows(tableName);
  }

  async expireMoveReplicaAssignmentReservations(options = {}) {
    return this.delegates.expireMoveReplicaAssignmentReservations?.(options);
  }

  async getActiveMoveReplicaAssignmentReservations(options = {}) {
    return this.delegates.getActiveMoveReplicaAssignmentReservations?.(
      options,
    ) || [];
  }

  async getBlockingMoveReplicaBootstrapAdmissions(now = Date.now()) {
    return this.delegates.getBlockingMoveReplicaBootstrapAdmissions?.(now) || [];
  }

  async getMoveReplicaBootstrapExclusionReservations(
    now = Date.now(),
    options = {},
  ) {
    return this.delegates.getMoveReplicaBootstrapExclusionReservations?.(
      now,
      options,
    ) || [];
  }

  async reserveMoveReplicaAssignment(targetNodeId, assignment, options = {}) {
    return this.delegates.reserveMoveReplicaAssignment?.(
      targetNodeId,
      assignment,
      options,
    );
  }

  getBootstrapAdmissionRetryAfterMs() {
    return this.delegates.getBootstrapAdmissionRetryAfterMs?.() || 0;
  }

  hasRemainingBootstrapRequestExecutionBudget(
    timeoutBudget,
    now = Date.now(),
  ) {
    if (!timeoutBudget || typeof timeoutBudget !== 'object') {
      return true;
    }
    return getRemainingBudgetMs(timeoutBudget, {
      now: () => now,
    }) > 0;
  }

  assertBootstrapRequestExecutionBudget(timeoutBudget) {
    if (this.hasRemainingBootstrapRequestExecutionBudget(timeoutBudget)) {
      return;
    }
    throw this.createBootstrapRequestExecutionBudgetExhaustedError();
  }

  createBootstrapRequestExecutionBudgetExhaustedError() {
    const error = new Error(BOOTSTRAP_API_ERROR.BOOTSTRAP_NOT_READY);
    error.statusCode = HTTP_STATUS.SERVICE_UNAVAILABLE;
    error.errorCode = BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY;
    error.reasonCode =
      BOOTSTRAP_API_PROBE_REASON
        .BOOTSTRAP_REQUEST_EXECUTION_BUDGET_EXHAUSTED;
    error.retryAfterMs = Math.max(
      0,
      this.getBootstrapAdmissionRetryAfterMs(),
    );
    return error;
  }

  validateBootstrapRequest(nodeId, nodeAddress) {
    if (!nodeId) {
      return BOOTSTRAP_API_ERROR.NODE_ID_REQUIRED;
    }

    if (!uuidValidate(nodeId)) {
      return BOOTSTRAP_API_ERROR.NODE_ID_INVALID;
    }

    if (!nodeAddress) {
      return BOOTSTRAP_API_ERROR.NODE_ADDRESS_REQUIRED;
    }

    if (typeof nodeAddress !== 'string' || nodeAddress.length === 0) {
      return BOOTSTRAP_API_ERROR.NODE_ADDRESS_INVALID;
    }

    return null;
  }

  async checkForConflicts(nodeId, nodeAddress, options = {}) {
    const nodeIdAlreadyRegistered = BOOTSTRAP_API_ERROR.NODE_ID_ALREADY_REGISTERED;
    const nodeAddressInUse = BOOTSTRAP_API_ERROR.NODE_ADDRESS_IN_USE;
    const systemTableCache = assertCritical(
      this.getSystemTableCache(),
      BOOTSTRAP_API_ERROR.SYSTEM_TABLE_CACHE_REQUIRED,
    );

    if (nodeId === this.getSeedNodeId()) {
      return BOOTSTRAP_API_ERROR.SEED_NODE_ID_CONFLICT;
    }

    if (nodeAddress === this.getSeedNodeAddress()) {
      return BOOTSTRAP_API_ERROR.SEED_NODE_ADDRESS_CONFLICT;
    }

    // Cluster-identity fence: a request that positively names a DIFFERENT
    // cluster is refused with the typed 409 terminal rejection. A request
    // without expectedClusterId (pre-identity joiner) is accepted by the
    // explicit compatibility policy — the bootstrap response stamps it with
    // this cluster's id — and never silently "matches".
    const clusterIdMatch = classifyClusterIdMatch(
      this.getClusterId(),
      options.expectedClusterId,
    );
    if (clusterIdMatch === CLUSTER_ID_MATCH_STATE.MISMATCH) {
      this.getLogger().warn(BOOTSTRAP_API_LOG_MSG.CONFLICT_DETECTED, {
        nodeId,
        nodeAddress,
        error: BOOTSTRAP_API_ERROR.CLUSTER_ID_MISMATCH,
      });
      return BOOTSTRAP_API_ERROR.CLUSTER_ID_MISMATCH;
    }

    const existingNode = systemTableCache.get(TABLES.NODES, nodeId);
    if (existingNode) {
      if (this.isDurableRejoinSameAddressEvidence(
        existingNode,
        nodeAddress,
        options,
      )) {
        this.getLogger().info(
          BOOTSTRAP_API_LOG_MSG.IDEMPOTENT_NODE_REJOIN_ALLOWED,
          {
            nodeId,
            nodeAddress,
            authoritativeOverride:
              REJOIN_AUTHORITY_SOURCE.LOCAL_CACHE_RESTART_REENTRY,
          },
        );
        return null;
      }
      const authoritativeExistingNode =
        await this.readAuthoritativeNodeRow(nodeId);
      const effectiveExistingNode =
        authoritativeExistingNode.available ?
          authoritativeExistingNode.row :
          existingNode;
      const existingNodeAddress =
        this.getNodeAddressFromRecord(effectiveExistingNode);
      if (existingNodeAddress === nodeAddress) {
        this.getLogger().info(
          BOOTSTRAP_API_LOG_MSG.IDEMPOTENT_NODE_REJOIN_ALLOWED,
          {
            nodeId,
            nodeAddress,
            authoritativeOverride:
              authoritativeExistingNode.available === true,
          },
        );
        return null;
      }
      if (effectiveExistingNode && !this.isNodeDead(effectiveExistingNode)) {
        return nodeIdAlreadyRegistered(nodeId);
      }
      this.getLogger().info(BOOTSTRAP_API_LOG_MSG.STALE_NODE_REJOIN_ALLOWED, {
        nodeId,
        existingStatus:
          effectiveExistingNode?.[COLUMN.STATUS] ?? null,
        existingLease:
          effectiveExistingNode?.[COLUMN.READY_LEASE_EXPIRES_AT] ?? null,
        authoritativeOverride:
          authoritativeExistingNode.available === true,
      });
    }

    const allNodes = systemTableCache.getAll(TABLES.NODES) || [];
    for (const node of allNodes) {
      if (this.getNodeAddressFromRecord(node) === nodeAddress &&
          node[COLUMN.NODE_ID] !== nodeId &&
          !this.isNodeDead(node)) {
        return nodeAddressInUse(nodeAddress);
      }
    }

    return null;
  }

  isDurableRejoinSameAddressEvidence(existingNode, nodeAddress, options = {}) {
    if (!isBootJoinRejoinMembershipOwnerOutcome(
      options.membershipOwnerOutcome,
    ) ||
      !isMembershipOwnerRestartReentryOutcome({
        membershipOwnerOutcome: options.membershipOwnerOutcome,
      })) {
      return false;
    }
    return this.getNodeAddressFromRecord(existingNode) === nodeAddress;
  }

  getNodeAddressFromRecord(nodeRecord) {
    return nodeRecord?.[COLUMN.NODE_ADDRESS] ??
      nodeRecord?.[NODE_ROW_FIELD.NODE_ADDRESS] ??
      null;
  }

  isNodeDead(nodeRecord) {
    const status = nodeRecord[COLUMN.STATUS];
    if (REJOIN_TERMINAL_STATES.has(status)) {
      return true;
    }
    const leaseExpiry = Number(
      nodeRecord[COLUMN.READY_LEASE_EXPIRES_AT],
    );
    if (Number.isFinite(leaseExpiry) && leaseExpiry <= Date.now()) {
      return true;
    }
    return false;
  }

  async readAuthoritativeNodeRow(nodeId) {
    const view = this.getAuthoritativeControlPlaneView();
    if (!view?.canRead()) {
      return {
        available: false,
        row: null,
      };
    }

    try {
      const result = await view.readRows(
        TABLES.NODES,
        `SELECT * FROM ${TABLES.NODES} WHERE ${COLUMN.NODE_ID} = ?`,
        [nodeId],
      );
      if (result?.success !== true) {
        return {
          available: false,
          row: null,
        };
      }
      const rows = Array.isArray(result.rows) ? result.rows : [];
      const row = rows.find((candidate) => {
        return candidate?.[COLUMN.NODE_ID] === nodeId ||
          candidate?.node_id === nodeId;
      }) || rows[0] || null;
      return {
        available: true,
        row,
      };
    } catch (_error) {
      return {
        available: false,
        row: null,
      };
    }
  }

  getAuthoritativeControlPlaneView() {
    const existingView = this.getAuthoritativeControlPlaneViewInstance();
    if (existingView) {
      return existingView;
    }
    const cdcIntegrationService = this.getCdcIntegrationService();
    if (!cdcIntegrationService) {
      return null;
    }
    const view = new AuthoritativeControlPlaneView({
      nodeId: this.getSeedNodeId() || BOOTSTRAP_API_SUBSYSTEM,
      cdcIntegrationService,
      messageRouter: this.getMessageRouter(),
    });
    this.setAuthoritativeControlPlaneViewInstance(view);
    return view;
  }

  determineMessageGroupAssignment(newNodeId, options = {}) {
    const messageGroups = this.getMessageGroups();
    const excludedSourceNodeIds = new Set(
      options.excludedSourceNodeIds instanceof Set ?
        options.excludedSourceNodeIds :
        [],
    );

    const seedNodeId = this.getSeedNodeId();
    if (typeof seedNodeId === 'string' &&
        seedNodeId.length > 0) {
      for (const group of messageGroups) {
        for (const replica of group?.replicas || []) {
          const replicaNodeId = replica?.node_id;
          if (!replicaNodeId || replicaNodeId === seedNodeId) {
            continue;
          }
          excludedSourceNodeIds.add(replicaNodeId);
        }
      }
    }

    this.getLogger().info(BOOTSTRAP_API_LOG_MSG.JOIN_ASSIGNMENT, {
      newNodeId,
      messageGroupCount: messageGroups.length,
      excludedSourceNodeCount: excludedSourceNodeIds.size,
      messageGroups: messageGroups.map((group) => ({
        groupId: group.group_id,
        replicaCount: group.replicas?.length || 0,
        replicas: group.replicas?.map((replica) => ({
          replicaId: replica.replica_id,
          nodeId: replica.node_id,
          address: replica.address,
        })),
      })),
    });

    const assignment = new MessageGroupAssignment({
      seedNodeAddress: this.getSeedNodeAddress(),
    }).determineAssignment(
      newNodeId,
      messageGroups,
      {
        allowRejoinSingleOwnedGroup:
          isMembershipOwnerRestartReentryOutcome({
            membershipOwnerOutcome: options.membershipOwnerOutcome,
            startupMode: options.startupMode,
          }),
        excludedReplicaIds: options.excludedReplicaIds,
        excludedSourceNodeIds,
      },
    );

    return this.augmentAssignmentWithPeerAddresses(assignment, messageGroups);
  }

  async waitForMoveReplicaAssignmentReservationLock(
    previousLock,
    timeoutBudget,
  ) {
    if (!timeoutBudget || typeof timeoutBudget !== 'object') {
      await previousLock;
      return MOVE_REPLICA_ASSIGNMENT_LOCK_WAIT_OUTCOME.ACQUIRED;
    }

    const remainingBudgetMs = getRemainingBudgetMs(timeoutBudget);
    if (remainingBudgetMs <= 0) {
      return MOVE_REPLICA_ASSIGNMENT_LOCK_WAIT_OUTCOME.BUDGET_EXHAUSTED;
    }

    let clearBudgetTimer = () => {};
    const lockAcquired = previousLock.then(() =>
      MOVE_REPLICA_ASSIGNMENT_LOCK_WAIT_OUTCOME.ACQUIRED,
    );
    const budgetExhausted = new Promise((resolve) => {
      const budgetTimer = setTimeout(
        () => resolve(
          MOVE_REPLICA_ASSIGNMENT_LOCK_WAIT_OUTCOME.BUDGET_EXHAUSTED,
        ),
        remainingBudgetMs,
      );
      clearBudgetTimer = () => clearTimeout(budgetTimer);
    });
    const outcome = await Promise.race([lockAcquired, budgetExhausted]);
    clearBudgetTimer();
    return outcome;
  }

  async withMoveReplicaAssignmentReservationLock(action, options = {}) {
    const previousLock = this.moveReplicaAssignmentReservationLock;
    let releaseLock;
    this.moveReplicaAssignmentReservationLock = new Promise((resolve) => {
      releaseLock = resolve;
    });

    let lockAcquired = false;
    try {
      const lockWaitOutcome =
        await this.waitForMoveReplicaAssignmentReservationLock(
          previousLock,
          options.timeoutBudget,
        );
      if (lockWaitOutcome ===
          MOVE_REPLICA_ASSIGNMENT_LOCK_WAIT_OUTCOME.BUDGET_EXHAUSTED) {
        throw this.createBootstrapRequestExecutionBudgetExhaustedError();
      }
      this.assertBootstrapRequestExecutionBudget(options.timeoutBudget);
      lockAcquired = true;
      return await action();
    } finally {
      if (lockAcquired) {
        releaseLock();
      } else {
        previousLock.then(releaseLock, releaseLock);
      }
    }
  }

  async determineAndReserveMessageGroupAssignment(newNodeId, options = {}) {
    return this.withMoveReplicaAssignmentReservationLock(async () => {
      const durableRejoinAssignment =
        this.tryResolveDurableRejoinExistingMessageGroupAssignment(
          newNodeId,
          options,
        );
      if (durableRejoinAssignment) {
        return durableRejoinAssignment;
      }

      await this.expireMoveReplicaAssignmentReservations(options);
      const activeReservations =
        await this.getActiveMoveReplicaAssignmentReservations(options);
      const exclusionReservations =
        await this.getMoveReplicaBootstrapExclusionReservations(
          Date.now(),
          options,
        );
      this.assertBootstrapRequestExecutionBudget(options.timeoutBudget);
      const excludedReplicaIds = new Set(
        [...activeReservations, ...exclusionReservations]
          .map((reservation) => reservation?.replicaId)
          .filter((replicaId) =>
            typeof replicaId === 'string' && replicaId.length > 0,
          ),
      );
      const assignment = this.determineMessageGroupAssignment(newNodeId, {
        excludedReplicaIds,
        startupMode: options.startupMode,
        membershipOwnerOutcome: options.membershipOwnerOutcome,
      });

      if (assignment.strategy !== BootstrapStrategy.MOVE_REPLICA) {
        return assignment;
      }

      this.assertBootstrapRequestExecutionBudget(options.timeoutBudget);
      const reservation = await this.reserveMoveReplicaAssignment(
        newNodeId,
        assignment,
        options,
      );
      return {
        ...assignment,
        assignmentId: reservation.assignmentId,
        assignmentLeaseExpiresAt: reservation.leaseExpiresAt,
      };
    }, options);
  }

  tryResolveDurableRejoinExistingMessageGroupAssignment(
    newNodeId,
    options = {},
  ) {
    if (
      !isMembershipOwnerRestartReentryOutcome({
        membershipOwnerOutcome: options.membershipOwnerOutcome,
        startupMode: options.startupMode,
      })
    ) {
      return null;
    }

    const assignment = this.determineMessageGroupAssignment(newNodeId, {
      startupMode: options.startupMode,
      membershipOwnerOutcome: options.membershipOwnerOutcome,
    });
    if (
      assignment?.strategy === BootstrapStrategy.MOVE_REPLICA ||
      assignment?.reuseExistingGroup !== true
    ) {
      return null;
    }
    return assignment;
  }

  augmentAssignmentWithPeerAddresses(assignment, messageGroups) {
    if (assignment.strategy === BootstrapStrategy.MOVE_REPLICA) {
      const group = messageGroups.find(
        (candidate) => candidate.group_id === assignment.groupId,
      );
      const replicas = group?.replicas || [];
      const peerAddresses = replicas.map((replica) =>
        `${replica.node_id}${ADDRESS.SEPARATOR}${ENTITY_TYPE.MESSAGE_GROUP}` +
        `${ADDRESS.SEPARATOR}${replica.replica_id}`,
      );

      this.getLogger().info(BOOTSTRAP_API_LOG_MSG.JOIN_MOVABLE_REPLICA, {
        groupId: assignment.groupId,
        sourceNodeId: assignment.sourceNodeId,
        replicaToMove: assignment.replicaToMove,
        peerIds: assignment.existingPeerIds,
        peerAddresses,
        replicaAddresses: assignment.replicaAddresses,
      });

      return {
        ...assignment,
        peerAddresses,
      };
    }

    if (assignment.reuseExistingGroup === true) {
      const group = messageGroups.find(
        (candidate) => candidate.group_id === assignment.groupId,
      );
      const replicas = group?.replicas || [];
      return {
        ...assignment,
        existingPeerIds: replicas.map((replica) => replica.replica_id),
        replicaAddresses: replicas.map((replica) => replica.address),
        peerAddresses: replicas.map((replica) =>
          `${replica.node_id}${ADDRESS.SEPARATOR}${ENTITY_TYPE.MESSAGE_GROUP}` +
          `${ADDRESS.SEPARATOR}${replica.replica_id}`,
        ),
        replicaNodeMap: Object.fromEntries(
          replicas.map((replica) => [replica.replica_id, replica.node_id]),
        ),
      };
    }

    return assignment;
  }

  getLeaderPartitionForTable(tableName) {
    const systemTableCache = assertCritical(
      this.getSystemTableCache(),
      BOOTSTRAP_API_ERROR.SYSTEM_TABLE_CACHE_REQUIRED,
    );

    const partitions = systemTableCache.filter(TABLES.PARTITIONS, (partition) =>
      partition.table_id === tableName || partition.table_name === tableName,
    ) || [];

    if (partitions.length === 0) {
      return null;
    }

    const partition = partitions[0];
    const services = systemTableCache.filter(TABLES.SERVICES, (service) =>
      service[COLUMN.PARTITION_ID] === partition[COLUMN.PARTITION_ID] &&
      service[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.PARTITION &&
      service[COLUMN.RAFT_ROLE] === RAFT_ROLE.LEADER &&
      service[COLUMN.STATUS] === SERVICE_STATUS.ACTIVE,
    ) || [];

    if (services.length === 0) {
      return null;
    }

    return {
      partitionId: partition[COLUMN.PARTITION_ID],
      tableName,
      leaderNodeId: services[0][COLUMN.NODE_ID],
      replicaId: services[0][COLUMN.REPLICA_ID] ||
        services[0][COLUMN.SERVICE_ID],
      address: services[0][COLUMN.ADDRESS],
    };
  }

  getMessageGroups() {
    const services = this.getBootstrapAdmissionTableRows(TABLES.SERVICES);
    const messageGroupServices = services.filter((service) =>
      service[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP,
    );

    const groupsFromServices = new Map();
    for (const service of messageGroupServices) {
      const groupId = service[COLUMN.GROUP_ID];
      if (!groupId) {
        continue;
      }

      if (!groupsFromServices.has(groupId)) {
        groupsFromServices.set(groupId, {
          group_id: groupId,
          replicas: [],
          replica_count: 0,
        });
      }

      const group = groupsFromServices.get(groupId);
      group.replicas.push({
        replica_id: service[COLUMN.REPLICA_ID] || service[COLUMN.SERVICE_ID],
        node_id: service[COLUMN.NODE_ID],
        address: service[COLUMN.ADDRESS],
        raft_role: service[COLUMN.RAFT_ROLE],
      });
      group.replica_count = group.replicas.length;
    }

    if (groupsFromServices.size > 0) {
      return Array.from(groupsFromServices.values());
    }

    const cachedGroups =
      this.getBootstrapAdmissionTableRows(TABLES.MESSAGE_GROUPS);

    return cachedGroups.map((group) => {
      const replicas = messageGroupServices
        .filter((service) =>
          service[COLUMN.GROUP_ID] === group[COLUMN.GROUP_ID],
        )
        .map((service) => ({
          replica_id: service[COLUMN.REPLICA_ID] || service[COLUMN.SERVICE_ID],
          node_id: service[COLUMN.NODE_ID],
          address: service[COLUMN.ADDRESS],
          raft_role: service[COLUMN.RAFT_ROLE],
        }));

      return {
        ...group,
        replicas,
      };
    });
  }
}

export {BootstrapJoinAdmissionOwner};
