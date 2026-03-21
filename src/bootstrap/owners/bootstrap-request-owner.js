import {resolveAdvertisedWebSocketAddress} from
  '../../transport/node-address-resolution.js';
import {
  HTTP_STATUS,
  NUM,
} from '../../constants/index.js';
import {
  BOOTSTRAP_PHASE,
  BOOTSTRAP_PIPELINE_ERROR_CODE,
} from '../bootstrap-constants.js';
import {
  BOOTSTRAP_API_DEFAULT,
  BOOTSTRAP_API_ERROR,
  BOOTSTRAP_API_LOG_MSG,
  BOOTSTRAP_API_PROBE_REASON,
} from '../bootstrap-api-constants.js';

class BootstrapRequestOwner {
  constructor(options = {}) {
    this.delegates = options.delegates || {};
  }

  getLogger() {
    return this.delegates.getLogger?.() || console;
  }

  getSeedNodeId() {
    return this.delegates.getSeedNodeId?.() || null;
  }

  getSeedNodeAddress() {
    return this.delegates.getSeedNodeAddress?.() || null;
  }

  getSeedNodeWsAddress() {
    return this.delegates.getSeedNodeWsAddress?.() || null;
  }

  getWsPort() {
    return this.delegates.getWsPort?.() || null;
  }

  getBootstrapService() {
    return this.delegates.getBootstrapService?.() || null;
  }

  getMaxConcurrentBootstrapRequests() {
    return this.delegates.getMaxConcurrentBootstrapRequests?.() || NUM.ZERO;
  }

  getBootstrapAdmissionRetryAfterMs() {
    return this.delegates.getBootstrapAdmissionRetryAfterMs?.() || NUM.ZERO;
  }

  getInFlightBootstrapRequestCount() {
    return this.delegates.getInFlightBootstrapRequestCount?.() || NUM.ZERO;
  }

  setInFlightBootstrapRequestCount(count) {
    this.delegates.setInFlightBootstrapRequestCount?.(count);
  }

  validateBootstrapRequest(nodeId, nodeAddress) {
    return this.delegates.validateBootstrapRequest?.(nodeId, nodeAddress);
  }

  async checkForConflicts(nodeId, nodeAddress) {
    return this.delegates.checkForConflicts?.(nodeId, nodeAddress);
  }

  async getBlockingMoveReplicaBootstrapAdmissions(now) {
    return this.delegates.getBlockingMoveReplicaBootstrapAdmissions?.(now) || [];
  }

  resolveMoveReplicaBootstrapAdmissionRetryAfterMs(reservation, now) {
    return this.delegates.resolveMoveReplicaBootstrapAdmissionRetryAfterMs?.(
      reservation,
      now,
    ) || NUM.ZERO;
  }

  buildBootstrapNotReadyResponse(options) {
    return this.delegates.buildBootstrapNotReadyResponse?.(options) || {
      success: false,
      error: options?.error,
      code: options?.code,
    };
  }

  async waitForServiceLeaders() {
    return this.delegates.waitForServiceLeaders?.() || {ready: false};
  }

  async determineAndReserveMessageGroupAssignment(nodeId) {
    return this.delegates.determineAndReserveMessageGroupAssignment?.(nodeId);
  }

  getCurrentEpoch() {
    return this.delegates.getCurrentEpoch?.() || null;
  }

  buildBootstrapTopologySnapshotEnvelope(options) {
    return this.delegates.buildBootstrapTopologySnapshotEnvelope?.(options) || {
      systemTableSnapshots: {},
      topologySnapshotMeta: null,
    };
  }

  getClusterConfiguration() {
    return this.delegates.getClusterConfiguration?.() || {};
  }

  getReadyNodes() {
    return this.delegates.getReadyNodes?.() || [];
  }

  getTablePolicies() {
    return this.delegates.getTablePolicies?.() || {};
  }

  getLatencyTopologyHints(nodeId) {
    return this.delegates.getLatencyTopologyHints?.(nodeId) || null;
  }

  async handleBootstrapRequest(request, reply) {
    const {nodeId, nodeAddress} = request.body || {};

    this.getLogger().info(BOOTSTRAP_API_LOG_MSG.RECEIVED_BOOTSTRAP_REQUEST, {
      nodeId,
      nodeAddress,
      seedNodeId: this.getSeedNodeId(),
    });

    const validationError =
      this.validateBootstrapRequest(nodeId, nodeAddress);
    if (validationError) {
      this.getLogger().warn(BOOTSTRAP_API_LOG_MSG.VALIDATION_FAILED, {
        nodeId,
        nodeAddress,
        error: validationError,
      });
      reply.code(HTTP_STATUS.BAD_REQUEST);
      return {error: validationError};
    }

    const bootstrapService = this.getBootstrapService();
    if (bootstrapService &&
        bootstrapService.phase !== BOOTSTRAP_PHASE.COMPLETE) {
      reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE);
      return this.buildBootstrapNotReadyResponse({
        error: BOOTSTRAP_API_ERROR.BOOTSTRAP_NOT_READY,
        code: BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY,
        phase: bootstrapService.phase,
        reasonCode: BOOTSTRAP_API_PROBE_REASON.BOOTSTRAP_PHASE_INCOMPLETE,
      });
    }

    const conflictError = await this.checkForConflicts(nodeId, nodeAddress);
    if (conflictError) {
      this.getLogger().warn(BOOTSTRAP_API_LOG_MSG.CONFLICT_DETECTED, {
        nodeId,
        nodeAddress,
        error: conflictError,
      });
      reply.code(HTTP_STATUS.CONFLICT);
      return {error: conflictError};
    }

    const now = Date.now();
    const blockingMoveReplicaAdmissions =
      await this.getBlockingMoveReplicaBootstrapAdmissions(now);
    if (blockingMoveReplicaAdmissions.length > NUM.ZERO) {
      const blockingReservation = blockingMoveReplicaAdmissions[NUM.ZERO];
      const retryAfterMs =
        this.resolveMoveReplicaBootstrapAdmissionRetryAfterMs(
          blockingReservation,
          now,
        );
      this.getLogger().warn(BOOTSTRAP_API_LOG_MSG.BOOTSTRAP_ADMISSION_DEFERRED, {
        nodeId,
        nodeAddress,
        seedNodeId: this.getSeedNodeId(),
        admissionBlock: 'move_replica_handoff_stabilizing',
        assignmentId: blockingReservation.assignmentId,
        replicaId: blockingReservation.replicaId,
        groupId: blockingReservation.groupId || null,
        sourceNodeId: blockingReservation.sourceNodeId || null,
        targetNodeId: blockingReservation.targetNodeId,
        retryAfterMs,
      });
      reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE);
      return this.buildBootstrapNotReadyResponse({
        error: BOOTSTRAP_API_ERROR.BOOTSTRAP_NOT_READY,
        code: BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY,
        reasonCode:
          BOOTSTRAP_API_PROBE_REASON.MOVE_REPLICA_HANDOFF_STABILIZING,
        retryAfterMs,
      });
    }

    if (this.getInFlightBootstrapRequestCount() >=
        this.getMaxConcurrentBootstrapRequests()) {
      this.getLogger().warn(BOOTSTRAP_API_LOG_MSG.BOOTSTRAP_ADMISSION_DEFERRED, {
        nodeId,
        nodeAddress,
        seedNodeId: this.getSeedNodeId(),
        inFlightBootstrapRequests: this.getInFlightBootstrapRequestCount(),
        maxConcurrentBootstrapRequests:
          this.getMaxConcurrentBootstrapRequests(),
        retryAfterMs: this.getBootstrapAdmissionRetryAfterMs(),
      });
      reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE);
      return this.buildBootstrapNotReadyResponse({
        error: BOOTSTRAP_API_ERROR.BOOTSTRAP_NOT_READY,
        code: BOOTSTRAP_PIPELINE_ERROR_CODE.BOOTSTRAP_NOT_READY,
        reasonCode: BOOTSTRAP_API_PROBE_REASON.JOIN_ADMISSION_BACKPRESSURED,
        retryAfterMs: this.getBootstrapAdmissionRetryAfterMs(),
      });
    }

    this.setInFlightBootstrapRequestCount(
      this.getInFlightBootstrapRequestCount() + NUM.ONE,
    );
    try {
      const leaderStatus = await this.waitForServiceLeaders();
      if (!leaderStatus.ready) {
        this.getLogger().warn(BOOTSTRAP_API_LOG_MSG.LEADERS_NOT_READY, {
          nodeId,
          missingPartitionLeaders: leaderStatus.missingPartitionLeaders,
          missingMessageGroupLeaders: leaderStatus.missingMessageGroupLeaders,
          missingPartitionLeaderNodes: leaderStatus.missingPartitionLeaderNodes,
          missingMessageGroupLeaderNodes:
            leaderStatus.missingMessageGroupLeaderNodes,
        });
        reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE);
        return this.buildBootstrapNotReadyResponse({
          error: BOOTSTRAP_API_ERROR.BOOTSTRAP_NOT_READY,
          code: BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE,
          reasonCode: BOOTSTRAP_PIPELINE_ERROR_CODE.LEADER_METADATA_INCOMPLETE,
          leaderReadiness: leaderStatus,
        });
      }

      const assignment =
        await this.determineAndReserveMessageGroupAssignment(nodeId);
      const currentEpoch = this.getCurrentEpoch();
      const {
        systemTableSnapshots,
        topologySnapshotMeta,
      } = this.buildBootstrapTopologySnapshotEnvelope({
        currentEpoch,
      });
      const clusterConfig = this.getClusterConfiguration();
      const readyNodes = this.getReadyNodes();

      this.getLogger().info(BOOTSTRAP_API_LOG_MSG.READY_NODES_FOR_BOOTSTRAP, {
        nodeId,
        readyNodesCount: readyNodes.length,
        readyNodes,
        seedNodeId: this.getSeedNodeId(),
      });

      const tablePolicies = this.getTablePolicies();
      const latencyTopologyHints = this.getLatencyTopologyHints(nodeId);
      const seedNodeWsAddress = resolveAdvertisedWebSocketAddress({
        advertisedAddress: this.getSeedNodeWsAddress(),
        nodeAddress: this.getSeedNodeAddress() ||
          BOOTSTRAP_API_DEFAULT.WS_HOST,
        wsPort: this.getWsPort() || null,
      });

      const response = {
        success: true,
        seedNodeId: this.getSeedNodeId(),
        seedNodeAddress: this.getSeedNodeAddress(),
        seedNodeWsAddress,
        messageGroupAssignment: assignment,
        systemTableSnapshots,
        topologySnapshotMeta,
        readyNodes,
        tablePolicies,
        currentEpoch,
        latencyTopologyHints,
        clusterConfig,
        leaderReadiness: {
          ready: leaderStatus.ready === true,
          missingPartitionLeaders: leaderStatus.missingPartitionLeaders || [],
          missingPartitionLeaderNodes:
            leaderStatus.missingPartitionLeaderNodes || [],
          missingPartitionLeaderAddresses:
            leaderStatus.missingPartitionLeaderAddresses || [],
          missingMessageGroupLeaders:
            leaderStatus.missingMessageGroupLeaders || [],
          missingMessageGroupLeaderNodes:
            leaderStatus.missingMessageGroupLeaderNodes || [],
          missingMessageGroupLeaderAddresses:
            leaderStatus.missingMessageGroupLeaderAddresses || [],
        },
        timestamp: Date.now(),
      };

      this.getLogger().info(BOOTSTRAP_API_LOG_MSG.RESPONSE_PREPARED, {
        nodeId,
        strategy: assignment.strategy,
        groupId: assignment.groupId,
      });

      return response;
    } catch (error) {
      this.getLogger().error(BOOTSTRAP_API_LOG_MSG.BOOTSTRAP_FAILED, {
        nodeId,
        nodeAddress,
        error: error.message,
        stack: error.stack,
      });
      reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      throw error;
    } finally {
      this.setInFlightBootstrapRequestCount(
        Math.max(
          NUM.ZERO,
          this.getInFlightBootstrapRequestCount() - NUM.ONE,
        ),
      );
    }
  }
}

export {BootstrapRequestOwner};
