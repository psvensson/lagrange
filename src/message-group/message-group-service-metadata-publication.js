/**
 * Message Group Service - metadata publication readiness and authoritative
 * row-mutation helper construction (raft role + leader-node id writes).
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */
import {COLUMN, TABLES} from '../constants/index.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {
  getTrafficReadinessSnapshot,
  isBackgroundWorkReady as isBackgroundWorkLifecycleReady,
  isMetadataPublicationReady as isMetadataPublicationLifecycleReady,
} from '../bootstrap/traffic-readiness-utils.js';
import {AuthoritativeRowMutationHelper} from '../raft/authoritative-row-mutation-helper.js';
import {PRESSURE_WORK_CLASS} from '../control-plane/pressure-governor.js';
import {
  FLUSH_SKIP_DISABLED,
  FLUSH_SKIP_NOT_OWNER,
  FLUSH_SKIP_READY,
  LEADER_NODE_PERSIST_ERROR_MSG,
  MESSAGE_GROUP_SERVICE_LITERAL,
  ROLE_PERSIST_ERROR_MSG,
} from './message-group-service-runtime-support.js';

/**
 * Attach metadata-publication readiness predicates and mutation-helper
 * construction to the MessageGroupService prototype.
 * @param {Function} serviceClass - The MessageGroupService class.
 * @return {void}
 */
function assignMetadataPublication(serviceClass) {
  Object.assign(serviceClass.prototype, {
    isMetadataPublicationReady() {
      if (!this.metadataPublicationReadinessState) {
        return true;
      }
      return isMetadataPublicationLifecycleReady(
        this.metadataPublicationReadinessState,
      );
    },
    isMetadataPublicationConvergenceWindowOpen() {
      return this.isMetadataPublicationReady() && !this.isBackgroundWorkReady();
    },
    isBackgroundWorkReady() {
      return isBackgroundWorkLifecycleReady(
        this.metadataPublicationReadinessState,
      );
    },
    /**
     * Resolve whether this message group's rebalancer should hold
     * leadership.
     *
     * Policy (mirrors PartitionService): background-work readiness gates
     * rebalancer-leadership ACQUISITION; raft leadership (leader replica)
     * gates RETENTION. Once a rebalancer has acquired leadership while the
     * node was ready, a transient node-wide readiness dip (the shared
     * metadata-publication readiness state re-entering a degraded phase
     * during control-plane recovery) must NOT demote it while this group
     * still holds raft leadership — otherwise every group's rebalancer
     * flaps in lockstep with the single shared readiness object. A
     * draining/shutting-down node still demotes (drain is terminal).
     *
     * @return {boolean} Desired rebalancer leadership state.
     */
    resolveRebalancerLeadership() {
      if (!this.isLeaderReplica()) {
        return false;
      }
      if (this.isBackgroundWorkReady()) {
        return true;
      }
      const rebalancer = this.rebalancer;
      if (
        !rebalancer ||
        rebalancer.isLeader !== true ||
        rebalancer.isShuttingDown === true
      ) {
        return false;
      }
      const snapshot = getTrafficReadinessSnapshot(
        this.metadataPublicationReadinessState,
      );
      if (snapshot && snapshot.draining === true) {
        return false;
      }
      return true;
    },
    handleMetadataPublicationReadinessTransition() {
      this.maybeInitializeRebalancer({readinessTransitionOnly: true});
      if (!this.isMetadataPublicationReady()) {
        return;
      }
      this.flushRoleUpdate().catch((error) => {
        this.logger.warn(
          MESSAGE_GROUP_SERVICE_LITERAL.FAILED_TO_FLUSH_DEFERRED_MESSAGE_GROUP_ROLE_UPDATE,
          {
            groupId: this.groupId,
            replicaId: this.replicaId,
            error: error.message,
          },
        );
      });
      this.flushLeaderNodeUpdate().catch((error) => {
        this.logger.warn(
          MESSAGE_GROUP_SERVICE_LITERAL.FAILED_TO_FLUSH_DEFERRED_MESSAGE_GROUP_LEADER_UPDATE,
          {
            groupId: this.groupId,
            replicaId: this.replicaId,
            error: error.message,
          },
        );
      });
    },
    createRoleMutationHelper() {
      return new AuthoritativeRowMutationHelper({
        tableName: SYSTEM_TABLE_NAME.SERVICES,
        buildWhereClause: (_role, context = {}) => {
          const whereClause = {[COLUMN.SERVICE_ID]: this.replicaId};
          const cachedRow = context.cachedRow;
          if (
            typeof cachedRow?.raft_role === 'string' &&
            cachedRow.raft_role.length > 0
          ) {
            whereClause.raft_role = cachedRow.raft_role;
          }
          if (Number.isFinite(cachedRow?.updated_at)) {
            whereClause.updated_at = cachedRow.updated_at;
          }
          return whereClause;
        },
        buildUpdateData: (role, updatedAt) => ({
          raft_role: role,
          updated_at: updatedAt,
        }),
        buildUpdateOptions: () => ({
          deliveryPriority: MESSAGE_GROUP_SERVICE_LITERAL.BACKGROUND,
          workClass: PRESSURE_WORK_CLASS.BACKGROUND,
          routingReadinessDimension:
            this.getMetadataPublicationReadinessDimension(),
        }),
        buildExpectedCacheFields: (role) => ({raft_role: role}),
        prepareFlush: () => ({
          skip: !this.publishRoleMetadata,
          clearPending: !this.publishRoleMetadata,
          reason: !this.publishRoleMetadata ?
            FLUSH_SKIP_DISABLED :
            FLUSH_SKIP_READY,
        }),
        readRowFromCache: (systemTableCache) =>
          systemTableCache?.get?.(TABLES.SERVICES, this.replicaId) || null,
        readValueFromCache: (systemTableCache) => {
          const cached = systemTableCache?.get?.(
            TABLES.SERVICES,
            this.replicaId,
          );
          return cached?.raft_role || null;
        },
        isWriteReady: () => this.isServicesLeaderAvailable(),
        systemTableCache: this.systemTableCache,
        cdcIntegrationService: this.cdcIntegrationService,
        onAsyncError: (error, context = {}) => {
          this.logger.warn(ROLE_PERSIST_ERROR_MSG, {
            groupId: this.groupId,
            replicaId: this.replicaId,
            role: context.value ?? this.pendingRoleUpdate,
            error: error.message,
          });
        },
      });
    },
    createLeaderNodeMutationHelper() {
      return new AuthoritativeRowMutationHelper({
        tableName: SYSTEM_TABLE_NAME.MESSAGE_GROUPS,
        buildWhereClause: (_leaderNodeId, context = {}) => {
          const whereClause = {[COLUMN.GROUP_ID]: this.groupId};
          const cachedRow = context.cachedRow;
          if (
            typeof cachedRow?.[COLUMN.LEADER_NODE_ID] === 'string' &&
            cachedRow[COLUMN.LEADER_NODE_ID].length > 0
          ) {
            whereClause[COLUMN.LEADER_NODE_ID] =
              cachedRow[COLUMN.LEADER_NODE_ID];
          }
          if (Number.isFinite(cachedRow?.[COLUMN.UPDATED_AT])) {
            whereClause[COLUMN.UPDATED_AT] = cachedRow[COLUMN.UPDATED_AT];
          }
          return whereClause;
        },
        buildUpdateData: (leaderNodeId, updatedAt) => ({
          [COLUMN.LEADER_NODE_ID]: leaderNodeId,
          [COLUMN.UPDATED_AT]: updatedAt,
        }),
        buildUpdateOptions: () => ({
          deliveryPriority: this.getMetadataPublicationDeliveryPriority(),
          routingReadinessDimension:
            this.getMetadataPublicationReadinessDimension(),
        }),
        buildExpectedCacheFields: (leaderNodeId) => ({
          [COLUMN.LEADER_NODE_ID]: leaderNodeId,
        }),
        readRowFromCache: (systemTableCache) =>
          systemTableCache?.get?.(TABLES.MESSAGE_GROUPS, this.groupId) || null,
        readValueFromCache: (systemTableCache) => {
          const cached = systemTableCache?.get?.(
            TABLES.MESSAGE_GROUPS,
            this.groupId,
          );
          return cached?.[COLUMN.LEADER_NODE_ID] || null;
        },
        prepareFlush: () => ({
          skip: !this.publishLeaderNodeMetadata || !this.isLeader,
          clearPending: !this.publishLeaderNodeMetadata || !this.isLeader,
          reason: !this.publishLeaderNodeMetadata ?
            FLUSH_SKIP_DISABLED :
            !this.isLeader ?
              FLUSH_SKIP_NOT_OWNER :
              FLUSH_SKIP_READY,
        }),
        isWriteReady: () => this.isMessageGroupsLeaderAvailable(),
        systemTableCache: this.systemTableCache,
        cdcIntegrationService: this.cdcIntegrationService,
        onAsyncError: (error, context = {}) => {
          this.logger.warn(LEADER_NODE_PERSIST_ERROR_MSG, {
            groupId: this.groupId,
            replicaId: this.replicaId,
            leaderNodeId: context.value ?? this.pendingLeaderNodeUpdate,
            error: error.message,
          });
        },
      });
    },
  });
}

export {assignMetadataPublication};
