const BOOTSTRAP_API_REPLICA_OPERATION_FIELD = Object.freeze({
  COMPLETED_AT: 'completed_at',
  ENTITY_ID: 'entity_id',
  ENTITY_TYPE: 'entity_type',
  ERROR_MESSAGE: 'error_message',
  LEASE_EXPIRES_AT: 'lease_expires_at',
  OPERATION_ID: 'operation_id',
  PARTITION_ID: 'partition_id',
  REPLICA_ID: 'replica_id',
  SOURCE_NODE_ID: 'source_node_id',
  STATUS: 'status',
  STEPS_HISTORY: 'steps_history',
  TARGET_NODE_ID: 'target_node_id',
  TYPE: 'type',
  UPDATED_AT: 'updated_at',
  WORKFLOW_STEP: 'workflow_step',
});

const BOOTSTRAP_API_HANDOFF_ERROR_MSG = Object.freeze({
  PERSIST_HANDOFF_OPERATION:
    'Failed to persist MOVE_REPLICA handoff operation',
  UPDATE_HANDOFF_OPERATION:
    'Failed to update MOVE_REPLICA handoff operation',
});

function createBootstrapApiRuntimeMethods(options = {}) {
  const bootstrapApiCloseErrorCode = options.bootstrapApiCloseErrorCode;
  const bootstrapApiError = options.bootstrapApiError || {};
  const bootstrapApiLogMsg = options.bootstrapApiLogMsg || {};
  const num = options.num || {};
  const tables = options.tables || {};
  const typeofToken = options.typeofToken || {};

  return {
    async getMoveReplicaAssignmentReservationById(assignmentId) {
      return this.moveReplicaAssignmentOwner
        .getMoveReplicaAssignmentReservationById(assignmentId);
    },

    async validateMoveReplicaAssignmentToken(serviceData) {
      return this.moveReplicaAssignmentOwner
        .validateMoveReplicaAssignmentToken(serviceData);
    },

    shouldRenewMoveReplicaAssignmentReservation(
      reservation,
      now = Date.now(),
    ) {
      return this.moveReplicaAssignmentOwner
        .shouldRenewMoveReplicaAssignmentReservation(reservation, now);
    },

    async renewMoveReplicaAssignmentReservation(reservation, options = {}) {
      return this.moveReplicaAssignmentOwner
        .renewMoveReplicaAssignmentReservation(reservation, options);
    },

    isMoveReplicaAssignmentSourceReplicaPresentLocally(reservation) {
      return this.moveReplicaAssignmentOwner
        .isMoveReplicaAssignmentSourceReplicaPresentLocally(reservation);
    },

    evaluateMoveReplicaAssignmentReservationOwnership(
      reservation,
      now = Date.now(),
    ) {
      return this.moveReplicaAssignmentOwner
        .evaluateMoveReplicaAssignmentReservationOwnership(reservation, now);
    },

    canReviveExpiredMoveReplicaAssignmentReservation(reservation) {
      return this.moveReplicaAssignmentOwner
        .canReviveExpiredMoveReplicaAssignmentReservation(reservation);
    },

    hasViableMoveReplicaAssignmentSource(reservation, now = Date.now()) {
      return this.moveReplicaAssignmentOwner
        .hasViableMoveReplicaAssignmentSource(reservation, now);
    },

    getMoveReplicaAssignmentReservationInvalidationReason(
      reservation,
      now = Date.now(),
    ) {
      return this.moveReplicaAssignmentOwner
        .getMoveReplicaAssignmentReservationInvalidationReason(
          reservation,
          now,
        );
    },

    shouldReconcileMoveReplicaAssignmentReservationToCommitted(
      reservation,
      now = Date.now(),
    ) {
      return this.moveReplicaAssignmentOwner
        .shouldReconcileMoveReplicaAssignmentReservationToCommitted(
          reservation,
          now,
        );
    },

    assertSingleOwnerReplicaRegistration(serviceData, assignmentContext) {
      return this.moveReplicaHandoffOwner
        .assertSingleOwnerReplicaRegistration(serviceData, assignmentContext);
    },

    isCanonicalGroupHomeNode(groupId, nodeId) {
      return this.moveReplicaHandoffOwner
        .isCanonicalGroupHomeNode(groupId, nodeId);
    },

    buildReplicaOperationMutationRow(operationContext) {
      return {
        [BOOTSTRAP_API_REPLICA_OPERATION_FIELD.OPERATION_ID]:
          operationContext.operationId,
        [BOOTSTRAP_API_REPLICA_OPERATION_FIELD.TYPE]:
          operationContext.type,
        [BOOTSTRAP_API_REPLICA_OPERATION_FIELD.PARTITION_ID]:
          operationContext.partitionId,
        [BOOTSTRAP_API_REPLICA_OPERATION_FIELD.REPLICA_ID]:
          operationContext.replicaId,
        [BOOTSTRAP_API_REPLICA_OPERATION_FIELD.SOURCE_NODE_ID]:
          operationContext.sourceNodeId,
        [BOOTSTRAP_API_REPLICA_OPERATION_FIELD.TARGET_NODE_ID]:
          operationContext.targetNodeId,
        [BOOTSTRAP_API_REPLICA_OPERATION_FIELD.STATUS]:
          operationContext.status,
        [BOOTSTRAP_API_REPLICA_OPERATION_FIELD.WORKFLOW_STEP]:
          operationContext.workflowStep,
        created_at: operationContext.createdAt,
        [BOOTSTRAP_API_REPLICA_OPERATION_FIELD.UPDATED_AT]:
          operationContext.updatedAt,
        [BOOTSTRAP_API_REPLICA_OPERATION_FIELD.COMPLETED_AT]:
          operationContext.completedAt,
        [BOOTSTRAP_API_REPLICA_OPERATION_FIELD.LEASE_EXPIRES_AT]:
          operationContext.leaseExpiresAt ?? null,
        [BOOTSTRAP_API_REPLICA_OPERATION_FIELD.ERROR_MESSAGE]:
          operationContext.errorMessage,
        [BOOTSTRAP_API_REPLICA_OPERATION_FIELD.STEPS_HISTORY]:
          JSON.stringify(operationContext.stepsHistory || []),
        [BOOTSTRAP_API_REPLICA_OPERATION_FIELD.ENTITY_TYPE]:
          operationContext.entityType,
        [BOOTSTRAP_API_REPLICA_OPERATION_FIELD.ENTITY_ID]:
          operationContext.entityId,
      };
    },

    buildReplicaOperationMutationData(operationContext) {
      return {
        [BOOTSTRAP_API_REPLICA_OPERATION_FIELD.STATUS]:
          operationContext.status,
        [BOOTSTRAP_API_REPLICA_OPERATION_FIELD.WORKFLOW_STEP]:
          operationContext.workflowStep,
        [BOOTSTRAP_API_REPLICA_OPERATION_FIELD.UPDATED_AT]:
          operationContext.updatedAt,
        [BOOTSTRAP_API_REPLICA_OPERATION_FIELD.COMPLETED_AT]:
          operationContext.completedAt,
        [BOOTSTRAP_API_REPLICA_OPERATION_FIELD.LEASE_EXPIRES_AT]:
          operationContext.leaseExpiresAt ?? null,
        [BOOTSTRAP_API_REPLICA_OPERATION_FIELD.ERROR_MESSAGE]:
          operationContext.errorMessage,
        [BOOTSTRAP_API_REPLICA_OPERATION_FIELD.STEPS_HISTORY]:
          JSON.stringify(operationContext.stepsHistory || []),
      };
    },

    async insertMoveReplicaHandoffOperation(handoffContext) {
      const result = await this.executeBootstrapControlPlaneMutation({
        operation: 'insert',
        tableName: tables.REPLICA_OPERATIONS,
        row: this.buildReplicaOperationMutationRow(handoffContext),
      });
      if (!result.success) {
        throw this.buildBootstrapControlPlaneQueryError(
          result,
          BOOTSTRAP_API_HANDOFF_ERROR_MSG.PERSIST_HANDOFF_OPERATION,
        );
      }
    },

    async updateMoveReplicaHandoffOperation(handoffContext) {
      const result = await this.executeBootstrapControlPlaneMutation({
        operation: 'update',
        tableName: tables.REPLICA_OPERATIONS,
        whereClause: {
          operation_id: handoffContext.operationId,
        },
        data: this.buildReplicaOperationMutationData(handoffContext),
      });
      if (!result.success) {
        throw this.buildBootstrapControlPlaneQueryError(
          result,
          BOOTSTRAP_API_HANDOFF_ERROR_MSG.UPDATE_HANDOFF_OPERATION,
        );
      }
    },

    async startMoveReplicaHandoff(serviceData, assignmentContext = null) {
      if (!this.isMoveReplicaHandoffRequest(serviceData)) {
        return null;
      }
      return this.moveReplicaHandoffOwner
        .startMoveReplicaHandoff(serviceData, assignmentContext);
    },

    async executeMoveReplicaHandoffPhase(
      handoffContext,
      phase,
      workflowStep,
      status,
      executor,
    ) {
      return this.moveReplicaHandoffOwner
        .executeMoveReplicaHandoffPhase(
          handoffContext,
          phase,
          workflowStep,
          status,
          executor,
        );
    },

    verifyMoveReplicaHandoffTarget(handoffContext, serviceData) {
      return this.moveReplicaHandoffOwner
        .verifyMoveReplicaHandoffTarget(handoffContext, serviceData);
    },

    async completeMoveReplicaHandoff(handoffContext) {
      return this.moveReplicaHandoffOwner
        .completeMoveReplicaHandoff(handoffContext);
    },

    async failMoveReplicaHandoff(handoffContext, error) {
      return this.moveReplicaHandoffOwner
        .failMoveReplicaHandoff(handoffContext, error);
    },

    async removeLocalSourceReplicaForMoveReplica(serviceData) {
      return this.moveReplicaHandoffOwner
        .removeLocalSourceReplicaForMoveReplica(serviceData);
    },

    getLeaderPartitionForTable(tableName) {
      return this.bootstrapJoinAdmissionOwner
        .getLeaderPartitionForTable(tableName);
    },

    validateBootstrapRequest(nodeId, nodeAddress) {
      return this.bootstrapJoinAdmissionOwner
        .validateBootstrapRequest(nodeId, nodeAddress);
    },

    async checkForConflicts(nodeId, nodeAddress, options) {
      return this.bootstrapJoinAdmissionOwner
        .checkForConflicts(nodeId, nodeAddress, options);
    },

    _isNodeDead(nodeRecord) {
      return this.bootstrapJoinAdmissionOwner.isNodeDead(nodeRecord);
    },

    async readAuthoritativeNodeRow(nodeId) {
      return this.bootstrapJoinAdmissionOwner
        .readAuthoritativeNodeRow(nodeId);
    },

    getAuthoritativeControlPlaneView() {
      return this.bootstrapJoinAdmissionOwner
        .getAuthoritativeControlPlaneView();
    },

    determineMessageGroupAssignment(newNodeId, options = {}) {
      return this.bootstrapJoinAdmissionOwner
        .determineMessageGroupAssignment(newNodeId, options);
    },

    async withMoveReplicaAssignmentReservationLock(action) {
      return this.bootstrapJoinAdmissionOwner
        .withMoveReplicaAssignmentReservationLock(action);
    },

    async determineAndReserveMessageGroupAssignment(
      newNodeId,
      options = {},
    ) {
      return this.bootstrapJoinAdmissionOwner
        .determineAndReserveMessageGroupAssignment(newNodeId, options);
    },

    normalizeMoveReplicaAssignmentReservationRow(row) {
      return this.moveReplicaAssignmentOwner
        .normalizeMoveReplicaAssignmentReservationRow(row);
    },

    async getActiveMoveReplicaAssignmentReservations() {
      return this.moveReplicaAssignmentOwner
        .getActiveMoveReplicaAssignmentReservations();
    },

    async getBlockingMoveReplicaBootstrapAdmissions(now = Date.now()) {
      return this.moveReplicaAssignmentOwner
        .getBlockingMoveReplicaBootstrapAdmissions(now);
    },

    isMoveReplicaBootstrapAdmissionBlocked(
      reservation,
      now = Date.now(),
    ) {
      return this.moveReplicaAssignmentOwner
        .isMoveReplicaBootstrapAdmissionBlocked(reservation, now);
    },

    isMoveReplicaAssignmentReservationOpen(
      reservation,
      now = Date.now(),
    ) {
      return this.moveReplicaAssignmentOwner
        .isMoveReplicaAssignmentReservationOpen(reservation, now);
    },

    isCommittedMoveReplicaHandoffStabilizing(
      reservation,
      now = Date.now(),
    ) {
      return this.moveReplicaAssignmentOwner
        .isCommittedMoveReplicaHandoffStabilizing(reservation, now);
    },

    isMoveReplicaAssignmentTargetReady(
      reservation,
      now = Date.now(),
    ) {
      return this.moveReplicaAssignmentOwner
        .isMoveReplicaAssignmentTargetReady(reservation, now);
    },

    resolveMoveReplicaBootstrapAdmissionRetryAfterMs(
      reservation,
      now = Date.now(),
    ) {
      return this.moveReplicaAssignmentOwner
        .resolveMoveReplicaBootstrapAdmissionRetryAfterMs(
          reservation,
          now,
        );
    },

    isMoveReplicaAssignmentReservationActive(reservation, now = Date.now()) {
      return this.moveReplicaAssignmentOwner
        .isMoveReplicaAssignmentReservationActive(reservation, now);
    },

    async expireMoveReplicaAssignmentReservations() {
      return this.moveReplicaAssignmentOwner
        .expireMoveReplicaAssignmentReservations();
    },

    startMoveReplicaAssignmentSweep() {
      if (!this.ownsMoveReplicaAssignmentLifecycle) {
        return;
      }
      if (
        this.moveReplicaAssignmentSweepTimer ||
        this.moveReplicaAssignmentSweepIntervalMs <= num.ZERO
      ) {
        return;
      }

      this.moveReplicaAssignmentSweepTimer = setInterval(() => {
        void this.expireMoveReplicaAssignmentReservations().catch((error) => {
          this.logger.warn(
            bootstrapApiLogMsg.MOVE_REPLICA_ASSIGNMENT_SWEEP_FAILED,
            {error: error.message},
          );
        });
      }, this.moveReplicaAssignmentSweepIntervalMs);

      if (
        typeof this.moveReplicaAssignmentSweepTimer.unref ===
          typeofToken.FUNCTION
      ) {
        this.moveReplicaAssignmentSweepTimer.unref();
      }
    },

    stopMoveReplicaAssignmentSweep() {
      if (!this.moveReplicaAssignmentSweepTimer) {
        return;
      }
      clearInterval(this.moveReplicaAssignmentSweepTimer);
      this.moveReplicaAssignmentSweepTimer = null;
    },

    async reserveMoveReplicaAssignment(targetNodeId, assignment) {
      return this.moveReplicaAssignmentOwner
        .reserveMoveReplicaAssignment(targetNodeId, assignment);
    },

    async markMoveReplicaAssignmentReservationTerminal(
      assignmentId,
      status,
      workflowStep,
      errorMessage = null,
    ) {
      return this.moveReplicaAssignmentOwner
        .markMoveReplicaAssignmentReservationTerminal(
          assignmentId,
          status,
          workflowStep,
          errorMessage,
        );
    },

    async reconcileMoveReplicaAssignmentReservationToCommitted(
      reservation,
      now = Date.now(),
    ) {
      return this.moveReplicaAssignmentOwner
        .reconcileMoveReplicaAssignmentReservationToCommitted(
          reservation,
          now,
        );
    },

    augmentAssignmentWithPeerAddresses(assignment, messageGroups) {
      return this.bootstrapJoinAdmissionOwner
        .augmentAssignmentWithPeerAddresses(assignment, messageGroups);
    },

    async waitForPartitionLeaders() {
      return this.serviceLeaderReadinessOwner.waitForPartitionLeaders();
    },

    getMessageGroups() {
      return this.bootstrapJoinAdmissionOwner.getMessageGroups();
    },

    getBootstrapAuthoritativeTableRows(tableName) {
      return this.bootstrapTopologySnapshotOwner
        .getBootstrapAuthoritativeTableRows(tableName);
    },

    getBootstrapAdmissionTableRows(tableName) {
      const systemTableCache = this.getSystemTableCache();
      const cacheRows =
        typeof systemTableCache?.getAll === typeofToken.FUNCTION ?
          systemTableCache.getAll(tableName) || [] :
          [];
      const rows = this.bootstrapTopologySnapshotOwner
        .resolveBootstrapResponseTopologySnapshotRows(tableName, cacheRows);
      return Array.isArray(rows) ? rows : [];
    },

    buildSystemTableSnapshots() {
      return this.bootstrapTopologySnapshotOwner
        .buildSystemTableSnapshots();
    },

    buildBootstrapTopologySnapshotEnvelope(options = {}) {
      return this.bootstrapTopologySnapshotOwner
        .buildBootstrapTopologySnapshotEnvelope(options);
    },

    buildBootstrapResponseTopologySnapshotEnvelope(options = {}) {
      return this.bootstrapTopologySnapshotOwner
        .buildBootstrapResponseTopologySnapshotEnvelope(options);
    },

    resolveAuthoritativeSystemTableSnapshotRows(tableName, cacheRows = []) {
      return this.bootstrapTopologySnapshotOwner
        .resolveAuthoritativeSystemTableSnapshotRows(tableName, cacheRows);
    },

    queryLocalAuthoritativePartitionRowSets(tableName) {
      return this.bootstrapTopologySnapshotOwner
        .queryLocalAuthoritativePartitionRowSets(tableName);
    },

    mergeAuthoritativeSystemTableRowSets(tableName, rowSets) {
      return this.bootstrapTopologySnapshotOwner
        .mergeAuthoritativeSystemTableRowSets(tableName, rowSets);
    },

    isAuthoritativeSnapshotRowNewer(candidate, existing) {
      return this.bootstrapTopologySnapshotOwner
        .isAuthoritativeSnapshotRowNewer(candidate, existing);
    },

    getLatencyTopologyHints(nodeId) {
      return this.bootstrapTopologySnapshotOwner
        .getLatencyTopologyHints(nodeId);
    },

    getMissingServiceLeaders() {
      return this.serviceLeaderReadinessOwner.getMissingServiceLeaders();
    },

    getLeaderReadinessPartitionSets() {
      return this.serviceLeaderReadinessOwner.getLeaderReadinessPartitionSets();
    },

    getLeaderReadinessPartitionSetsForTables(requiredTablesList = []) {
      return this.serviceLeaderReadinessOwner
        .getLeaderReadinessPartitionSetsForTables(requiredTablesList);
    },

    filterMissingRequiredPartitionIds(partitionIds = [], requiredTablesList) {
      return this.serviceLeaderReadinessOwner
        .filterMissingRequiredPartitionIds(partitionIds, requiredTablesList);
    },

    getCachedLeaderMetadataByServiceType(serviceType, idColumn) {
      return this.serviceLeaderReadinessOwner
        .getCachedLeaderMetadataByServiceType(serviceType, idColumn);
    },

    isLiveServiceLeader(service) {
      return this.serviceLeaderReadinessOwner.isLiveServiceLeader(service);
    },

    normalizeLeaderStatusForRequiredTables(
      missing = {},
      requiredTablesList,
    ) {
      return this.serviceLeaderReadinessOwner
        .normalizeLeaderStatusForRequiredTables(missing, requiredTablesList);
    },

    getBlockingLeaderStatusForReadiness(missing = {}) {
      return this.serviceLeaderReadinessOwner
        .getBlockingLeaderStatusForReadiness(missing);
    },

    async waitForServiceLeaders(options = {}) {
      return this.serviceLeaderReadinessOwner.waitForServiceLeaders(options);
    },

    countMissingLeaderInfo(missing) {
      return this.serviceLeaderReadinessOwner.countMissingLeaderInfo(missing);
    },

    getSystemPartitionLeaders() {
      return this.serviceLeaderReadinessOwner.getSystemPartitionLeaders();
    },

    getReadyNodes(options = {}) {
      return this.bootstrapClusterViewOwner.getReadyNodes(options);
    },

    getTablePolicies() {
      return this.bootstrapClusterViewOwner.getTablePolicies();
    },

    getCurrentEpoch() {
      return this.bootstrapClusterViewOwner.getCurrentEpoch();
    },

    getClusterConfiguration() {
      return this.bootstrapClusterViewOwner.getClusterConfiguration();
    },

    getClusterState() {
      return this.bootstrapClusterViewOwner.getClusterState();
    },

    updateNodeStatus(_nodeId, _status) {
      this.logger.error(bootstrapApiLogMsg.UPDATE_NODE_STATUS_UNSUPPORTED);
      throw new Error(bootstrapApiError.UPDATE_NODE_STATUS_UNSUPPORTED);
    },

    getFastify() {
      return this.fastify;
    },

    getReplicaHandler() {
      return this.replicaHandler;
    },

    isInitialized() {
      return this.initialized;
    },

    async shutdown() {
      this.stopMoveReplicaAssignmentSweep();
      const wasInitialized = this.initialized === true;
      const hadFastify = Boolean(this.fastify);
      const serverListening = this.fastify?.server?.listening === true;

      if (this.fastify) {
        const server = this.fastify.server;
        if (
          server &&
          typeof server.closeAllConnections === typeofToken.FUNCTION
        ) {
          server.closeAllConnections();
        }
        await this.fastify.close();
        if (server && typeof server.close === typeofToken.FUNCTION) {
          await new Promise((resolve) => {
            server.close((error) => {
              if (error && error.code !== bootstrapApiCloseErrorCode) {
                this.logger.warn(
                  bootstrapApiLogMsg.SERVER_CLOSE_ERROR,
                  {error: error.message},
                );
              }
              resolve();
            });
          });
        }
        if (server && typeof server.unref === typeofToken.FUNCTION) {
          server.unref();
        }
        this.fastify = null;
      }

      this.initialized = false;

      this.logger.info(bootstrapApiLogMsg.SHUTDOWN, {
        seedNodeId: this.seedNodeId,
        wasInitialized,
        hadFastify,
        serverListening,
      });
    },
  };
}

export {createBootstrapApiRuntimeMethods};
