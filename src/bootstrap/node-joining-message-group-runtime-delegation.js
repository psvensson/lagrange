import {NODE_JOINING_SERVICE_SHARED} from './node-joining-service-shared.js';
import {NodeJoiningReplicaDescriptorCoordination} from './node-joining-replica-descriptor-coordination.js';

const {
  COLUMN,
  ControlPlaneMessageType,
  DEFAULT_NODE_CAPABILITIES,
  NODE_JOINING_SERVICE_LITERAL,
  NodeService,
  SERVICE_DESCRIPTOR_FIELD,
  SERVICE_LIFECYCLE_STATE,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
  UNIFIED_SERVICE_TYPE,
  activateMessageGroupServiceRows,
  activatePartitionServiceRows,
  assertCritical,
  formatReplicatedServiceAddress,
  getControlPlaneMessageRequiredTables,
} = NODE_JOINING_SERVICE_SHARED;

const JOIN_MESSAGE_GROUP_SERVICE_REGISTRATION_OPTION = Object.freeze({
  PREFER_CONTROL_PLANE_UPSERT: 'preferControlPlaneUpsert',
});

class NodeJoiningMessageGroupRuntimeDelegation extends NodeJoiningReplicaDescriptorCoordination {
  async createJoinPartitionReplica(context) {
    const definition = context?.definition || {};
    const directOptions = context?.replicaOptions || null;
    const serviceId =
      directOptions?.replicaId ||
      definition[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID];
    const options =
      directOptions ||
      this.resolveJoinReplicaOptions(serviceId, UNIFIED_SERVICE_TYPE.PARTITION);
    const existingPartition = this.partitionServices.get(options.replicaId);
    if (existingPartition && existingPartition.initialized !== false) {
      return {status: SERVICE_LIFECYCLE_STATE.CREATED};
    }
    if (existingPartition) {
      await this.stopJoinPartitionReplica(
        {
          [SERVICE_DESCRIPTOR_FIELD.SERVICE_ID]: options.replicaId,
          [SERVICE_DESCRIPTOR_FIELD.REPLICA_ID]: options.replicaId,
        },
        {replicaOptions: options},
      );
    }
    if (options.createDelayMs > 0) {
      await this.sleep(options.createDelayMs);
    }
    await this.createJoinLocalPartitionService(options);
    return {status: SERVICE_LIFECYCLE_STATE.CREATED};
  }
  /**
   * Unified lifecycle start hook for join partition replicas.
   * @param {Object} replicaHandle
   * @param {Object} context
   * @return {Promise<Object>}
   * @private
   */
  async startJoinPartitionReplica(replicaHandle, context) {
    const directOptions = context?.replicaOptions || null;
    const serviceId =
      directOptions?.replicaId ||
      replicaHandle[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID] ||
      replicaHandle[SERVICE_DESCRIPTOR_FIELD.REPLICA_ID];
    const options =
      directOptions ||
      this.resolveJoinReplicaOptions(serviceId, UNIFIED_SERVICE_TYPE.PARTITION);
    const partition = this.partitionServices.get(options.replicaId);
    assertCritical(
      partition,
      `Join partition replica ${options.replicaId} missing at start`,
    );
    if (
      !options.deferElection &&
      typeof partition.startElection === 'function'
    ) {
      partition.startElection();
    }
    return {
      status: SERVICE_LIFECYCLE_STATE.RUNNING,
      deferred: Boolean(options.deferElection),
    };
  }
  /**
   * Unified lifecycle stop hook for join partition replicas.
   * @param {Object} replicaHandle
   * @param {Object} context
   * @return {Promise<Object>}
   * @private
   */
  async stopJoinPartitionReplica(replicaHandle, context) {
    const directOptions = context?.replicaOptions || null;
    const serviceId =
      directOptions?.replicaId ||
      replicaHandle[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID] ||
      replicaHandle[SERVICE_DESCRIPTOR_FIELD.REPLICA_ID];
    const options =
      directOptions ||
      this.resolveJoinReplicaOptions(serviceId, UNIFIED_SERVICE_TYPE.PARTITION);
    const partition = this.partitionServices.get(options.replicaId);
    if (!partition) {
      return {status: SERVICE_LIFECYCLE_STATE.STOPPED};
    }
    if (typeof partition.shutdown === 'function') {
      await partition.shutdown();
    }
    const unifiedAddress =
      typeof partition.getUnifiedAddress === 'function' ?
        partition.getUnifiedAddress() :
        formatReplicatedServiceAddress(
          SERVICE_TYPE.PARTITION,
          this.nodeId,
          options.replicaId,
        );
    this.messageRouter?.unregister?.(unifiedAddress);
    this.partitionServices.delete(options.replicaId);
    this.replicaHandler?.localServices?.delete?.(options.replicaId);
    this.replicaHandler?.localReplicas?.delete?.(options.replicaId);
    return {status: SERVICE_LIFECYCLE_STATE.STOPPED};
  }
  /**
   * Unified lifecycle start hook for join message-group replicas.
   * @param {Object} replicaHandle
   * @param {Object} _context
   * @return {Promise<Object>}
   * @private
   */
  async startJoinMessageGroupReplica(replicaHandle, _context) {
    return this.createMessageGroupPhase.startJoinMessageGroupReplica(
      replicaHandle,
      _context,
    );
  }
  /**
   * Unified lifecycle stop hook for join message-group replicas.
   * @param {Object} replicaHandle
   * @param {Object} _context
   * @return {Promise<Object>}
   * @private
   */
  async stopJoinMessageGroupReplica(replicaHandle, _context) {
    return this.createMessageGroupPhase.stopJoinMessageGroupReplica(
      replicaHandle,
      _context,
    );
  }
  /**
   * Compatibility shim for deferred self-hosted join elections.
   * Replica create/start ownership remains in unified lifecycle adapters.
   * @param {string} groupId - Message group ID.
   * @return {void}
   * @private
   */
  startDeferredJoinMessageGroupElections(groupId) {
    return this.createMessageGroupPhase.startDeferredJoinMessageGroupElections(
      groupId,
    );
  }
  /**
   * Phase 3a: Create self-hosted message group (3 replicas on this node).
   * Requirements: 8.3 - Services created AFTER self-connection established.
   * @param {Object} assignment - Assignment instructions.
   * @return {Promise<void>}
   * @private
   */
  async phaseCreateSelfHostedMessageGroup(assignment) {
    return this.createMessageGroupPhase.phaseCreateSelfHostedMessageGroup(
      assignment,
    );
  }
  /**
   * Get the leader message group service for sending lifecycle messages.
   * Returns the first local ingress-ready leader, or an ingress-ready relay
   * replica when the leader is remote.
   * @return {Object|null} Message group service or null.
   * @private
   */
  resolveOperationalMessageGroupSelection(options = {}) {
    const requiredTables =
      Array.isArray(options.requiredTables) && options.requiredTables.length > 0 ?
        options.requiredTables :
        getControlPlaneMessageRequiredTables(
          ControlPlaneMessageType.NODE_STATE_UPDATE,
        );
    return this.messageGroupSelectionOwner.resolveOperationalMessageGroupSelection(
      {...options, requiredTables},
    );
  }
  /**
   * Resolve the local message-group transport used for query/data-plane
   * participation. This deliberately avoids control-plane metadata-ingress
   * gating so bootstrap reads can proceed during join convergence.
   * @return {Object}
   * @private
   */
  resolveQueryTransportMessageGroupSelection() {
    return this.messageGroupSelectionOwner.resolveQueryTransportMessageGroupSelection();
  }
  /**
   * Resolve operational ingress after authoritative strict-forward repair for
   * system-table CDC during join convergence.
   * @param {Object} [options]
   * @param {Array<string>} [options.requiredTables]
   * @return {Promise<Object>}
   * @private
   */
  async resolveOperationalMessageGroupSelectionAsync(options = {}) {
    const requiredTables =
      Array.isArray(options.requiredTables) && options.requiredTables.length > 0 ?
        options.requiredTables :
        getControlPlaneMessageRequiredTables(
          ControlPlaneMessageType.NODE_STATE_UPDATE,
        );
    return this.messageGroupSelectionOwner.resolveOperationalMessageGroupSelectionAsync(
      {...options, requiredTables},
    );
  }
  /**
   * Get the operational message-group service for sending lifecycle messages.
   * Returns the first local ingress-ready leader, or an ingress-ready relay
   * replica when the leader is remote.
   * @param {Object} [options]
   * @param {Array<string>} [options.requiredTables]
   * @return {Object|null} Message group service or null.
   * @private
   */
  getLeaderMessageGroupService(options = {}) {
    return this.resolveOperationalMessageGroupSelection(options).service;
  }
  buildMessageGroupOwnerNotReadyError(selection = {}, options = {}) {
    return this.messageGroupSelectionOwner.buildMessageGroupOwnerNotReadyError(
      selection,
      options,
    );
  }
  /**
   * Resolve the message-group service to use for partition CDC propagation.
   * Prefers the current operational ingress and falls back to the captured
   * subscription ingress when it still satisfies metadata-ingress readiness.
   * @param {Object|null} preferredMessageGroupService
   * @param {Object} [options]
   * @param {Array<string>} [options.requiredTables]
   * @return {Promise<Object|null>}
   */
  async resolveCdcPropagationMessageGroup(
    preferredMessageGroupService,
    options = {},
  ) {
    const selection = await this.resolveOperationalMessageGroupSelectionAsync({
      requiredTables: Array.isArray(options.requiredTables) ?
        options.requiredTables :
        [],
      preferredService: preferredMessageGroupService,
      reuseCapturedIngress: true,
    });
    return selection.service || null;
  }
  /**
   * Enforce single-owner invariant before starting a local message-group replica.
   * Unauthorized duplicate startup must fail fast.
   * @param {string} replicaId
   * @return {void}
   * @private
   */
  assertReplicaStartupOwnership(replicaId) {
    return this.joinMessageGroupRuntimeOwner.assertReplicaStartupOwnership(
      replicaId,
    );
  }
  /**
   * Phase 3b: Join existing message group by moving a replica.
   * Requirements: 8.3 - Services created AFTER self-connection established.
   * @param {Object} assignment - Assignment instructions.
   * @return {Promise<void>}
   * @private
   */
  async phaseJoinExistingMessageGroup(assignment) {
    return this.joinMessageGroupRuntimeOwner.phaseJoinExistingMessageGroup(
      assignment,
    );
  }
  /**
   * Register a message group service in the cluster's services table.
   * This ensures other nodes can discover this replica.
   * @param {string} groupId - Message group ID.
   * @param {string} replicaId - Replica ID.
   * @param {MessageGroupService} service - The message group service.
   * @return {Promise<void>}
   * @private
   */
  async registerMessageGroupService(groupId, replicaId, service, options = {}) {
    return this.createMessageGroupPhase.registerMessageGroupService(
      groupId,
      replicaId,
      service,
      options,
    );
  }
  hasPublishedLocalServiceEndpoints() {
    const systemTableCache = NodeService.getInstance().getSystemTableCache();
    const localEndpointRows =
      systemTableCache?.filter?.(
        TABLES.SERVICE_ENDPOINTS,
        (row) => row?.[COLUMN.NODE_ID] === this.nodeId,
      ) ||
      (systemTableCache?.getAll?.(TABLES.SERVICE_ENDPOINTS) || []).filter(
        (row) => row?.[COLUMN.NODE_ID] === this.nodeId,
      );
    return localEndpointRows.length > 0;
  }
  getRegisteredJoinNodeId() {
    const systemTableCache = NodeService.getInstance().getSystemTableCache();
    const nodeRow = systemTableCache?.get?.(TABLES.NODES, this.nodeId);
    return nodeRow ? this.nodeId : null;
  }
  async activateMessageGroupServiceRows() {
    return activateMessageGroupServiceRows({
      nodeId: this.nodeId,
      activateReplica: async ({groupId, replicaId, service}) => {
        await this.registerMessageGroupService(groupId, replicaId, service, {
          status: SERVICE_STATUS.ACTIVE,
          [JOIN_MESSAGE_GROUP_SERVICE_REGISTRATION_OPTION
            .PREFER_CONTROL_PLANE_UPSERT]: true,
        });
      },
      messageRouter: this.messageRouter,
      deferTransientFailures: true,
      onDeferredActivation: ({groupId, replicaId, error}) => {
        this.logger.warn(
          NODE_JOINING_SERVICE_LITERAL
            .DEFERRING_JOIN_MESSAGE_GROUP_SERVICE_ROW_ACTIVATION,
          {
            nodeId: this.nodeId,
            groupId,
            replicaId,
            error: error?.message || String(error),
          },
        );
      },
      messageGroupServiceHandler: this.messageGroupServiceHandler,
      endpointsPublished: this.hasPublishedLocalServiceEndpoints(),
      messageGroupServices: this.messageGroupServices,
    });
  }
  async activateJoinPartitionServiceRows(replicaIds = null) {
    const partitionServices =
      replicaIds == null ?
        this.partitionServices :
        new Map(
          replicaIds
            .map((replicaId) => [
              replicaId,
              this.partitionServices.get(replicaId),
            ])
            .filter(([, service]) => service != null),
        );
    return activatePartitionServiceRows({
      nodeId: this.nodeId,
      systemTableWriter: this.createCdcIntegrationService(),
      messageRouter: this.messageRouter,
      deferTransientFailures: true,
      onDeferredActivation: ({partitionId, replicaId, error}) => {
        this.logger.warn(
          NODE_JOINING_SERVICE_LITERAL.DEFERRING_JOIN_PARTITION_SERVICE_ROW_ACTIVATION,
          {
            nodeId: this.nodeId,
            partitionId,
            replicaId,
            error: error?.message || String(error),
          },
        );
      },
      partitionServices,
    });
  }
  startJoinOpportunisticBackfill() {
    return this.querySystemStatePhase.startJoinOpportunisticBackfill();
  }
  /**
   * Persist metadata required for CREATE_SELF_HOSTED joins.
   * Ensures message_groups and per-replica services rows are present before
   * join can complete successfully.
   * @return {Promise<void>}
   * @private
   */
  async registerCreateSelfHostedMetadata() {
    return this.createMessageGroupPhase.registerCreateSelfHostedMetadata();
  }
  /**
   * Phase 3: Wait for message group leadership establishment.
   * @return {Promise<void>}
   * @private
   */
  async phaseWaitForLeadership() {
    return this.waitForLeadershipPhase.phaseWaitForLeadership();
  }
  /**
   * Build bootstrap payload for IDENTIFY message.
   * @return {Object|null} Identify bootstrap payload.
   * @private
   */
  getIdentifyBootstrapPayload() {
    if (!this.bootstrapResponse) {
      return null;
    }
    return {
      seedNodeId: this.seedNodeId,
      seedNodeWsAddress: this.seedNodeWsAddress,
      messageGroupAssignment: this.bootstrapResponse.messageGroupAssignment,
      partitionLeaders: this.bootstrapResponse.partitionLeaders,
      latencyTopologyHints: this.bootstrapResponse.latencyTopologyHints,
      clusterConfig: this.bootstrapResponse.clusterConfig,
      timestamp: this.bootstrapResponse.timestamp,
    };
  }
  /**
   * Get the default node capabilities for control plane registration.
   * @return {Array<string>} Capabilities list.
   * @private
   */
  getNodeCapabilities() {
    return [...DEFAULT_NODE_CAPABILITIES];
  }
  /**
   * Resolve the control plane message target address.
   * Prefer authoritative services-table metadata. Bootstrap peer hints are
   * used only when authoritative metadata is not yet available.
   * @param {Object} [options] - Resolution options.
   * @param {boolean} [options.allowBootstrapHints=true] - Allow hint fallback.
   * @param {boolean} [options.allowSelfTarget=false] - Allow local message-group targets.
   * @return {string|null} Target address or null.
   * @private
   */
  resolveControlPlaneTargetAddress(options = {}) {
    return (
      this.resolveControlPlaneTargetAddressCandidates(options)[0] || null
    );
  }
  /**
   * Resolve ordered control-plane target candidates.
   * Prefer local authoritative ingress, then remote authoritative ingress,
   * then bootstrap hints as a last resort.
   * @param {Object} [options] - Resolution options.
   * @param {boolean} [options.allowBootstrapHints=true] - Allow hint fallback.
   * @param {boolean} [options.allowSelfTarget=false] - Allow local targets.
   * @return {Array<string>} Ordered unique target addresses.
   * @private
   */
  resolveControlPlaneTargetAddressCandidates(options = {}) {
    return this.controlPlaneKernelIngress.resolveTargetCandidates(options);
  }
  /**
   * Send a NODE_STATE_UPDATE control-plane message through the current
   * authoritative target address.
   * @param {Object} options - Node state payload.
   * @param {string} options.state - Node connection state.
   * @param {Array<string>|string} [options.capabilities] - Node capabilities.
   * @param {number} [options.heartbeatAt] - Heartbeat timestamp.
   * @param {number} [options.readyLeaseExpiresAt] - Lease expiry timestamp.
   * @param {boolean} [options.heartbeatOnly] - Set for liveness-only updates.
   * @param {Object} [options.nodeRow] - Full node row payload.
   * @return {Promise<void>}
   * @private
   */
}

export {NodeJoiningMessageGroupRuntimeDelegation};
