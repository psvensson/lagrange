import {validate as uuidValidate} from 'uuid';
import {assertCritical} from '../../utils/assert.js';
import {
  ADDRESS,
  COLUMN,
  ENTITY_TYPE,
  HTTP_STATUS,
  NUM,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
  TYPEOF,
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
  BOOTSTRAP_API_SUBSYSTEM,
} from '../bootstrap-api-constants.js';
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

class BootstrapJoinAdmissionOwner {
  constructor(options = {}) {
    this.delegates = options.delegates || {};
    this.moveReplicaAssignmentReservationLock = Promise.resolve();
  }

  getSeedNodeId() {
    return this.delegates.getSeedNodeId?.() || null;
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
    return this.delegates.getBootstrapAdmissionRetryAfterMs?.() || NUM.ZERO;
  }

  hasRemainingBootstrapRequestExecutionBudget(
    timeoutBudget,
    now = Date.now(),
  ) {
    if (!timeoutBudget || typeof timeoutBudget !== TYPEOF.OBJECT) {
      return true;
    }
    return getRemainingBudgetMs(timeoutBudget, {
      now: () => now,
    }) > NUM.ZERO;
  }

  assertBootstrapRequestExecutionBudget(timeoutBudget) {
    if (this.hasRemainingBootstrapRequestExecutionBudget(timeoutBudget)) {
      return;
    }
    const error = new Error(BOOTSTRAP_API_ERROR.BOOTSTRAP_NOT_READY);
    error.statusCode = HTTP_STATUS.SERVICE_UNAVAILABLE;
    error.errorCode = BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY;
    error.retryAfterMs = Math.max(
      NUM.ZERO,
      this.getBootstrapAdmissionRetryAfterMs(),
    );
    throw error;
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

    if (typeof nodeAddress !== TYPEOF.STRING || nodeAddress.length === NUM.ZERO) {
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
      }) || rows[NUM.ZERO] || null;
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
    if (typeof seedNodeId === TYPEOF.STRING &&
        seedNodeId.length > NUM.ZERO) {
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
        replicaCount: group.replicas?.length || NUM.ZERO,
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

  async withMoveReplicaAssignmentReservationLock(action) {
    const previousLock = this.moveReplicaAssignmentReservationLock;
    let releaseLock;
    this.moveReplicaAssignmentReservationLock = new Promise((resolve) => {
      releaseLock = resolve;
    });

    await previousLock;
    try {
      return await action();
    } finally {
      releaseLock();
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
            typeof replicaId === TYPEOF.STRING && replicaId.length > NUM.ZERO,
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
    });
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

    if (partitions.length === NUM.ZERO) {
      return null;
    }

    const partition = partitions[NUM.ZERO];
    const services = systemTableCache.filter(TABLES.SERVICES, (service) =>
      service[COLUMN.PARTITION_ID] === partition[COLUMN.PARTITION_ID] &&
      service[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.PARTITION &&
      service[COLUMN.RAFT_ROLE] === RAFT_ROLE.LEADER &&
      service[COLUMN.STATUS] === SERVICE_STATUS.ACTIVE,
    ) || [];

    if (services.length === NUM.ZERO) {
      return null;
    }

    return {
      partitionId: partition[COLUMN.PARTITION_ID],
      tableName,
      leaderNodeId: services[NUM.ZERO][COLUMN.NODE_ID],
      replicaId: services[NUM.ZERO][COLUMN.REPLICA_ID] ||
        services[NUM.ZERO][COLUMN.SERVICE_ID],
      address: services[NUM.ZERO][COLUMN.ADDRESS],
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
          replica_count: NUM.ZERO,
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

    if (groupsFromServices.size > NUM.ZERO) {
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
