import {ControlPlaneReadinessStartupAuthorityHealth} from './control-plane-readiness-startup-authority-health.js';
import {CONTROL_PLANE_READINESS_PLANNING_SHARED as SHARED} from './control-plane-readiness-planning-shared.js';
import {NODE_LIVENESS_SEMANTIC_STATE} from
  './node-liveness-semantic-projection-owner.js';

const {
  COLUMN,
  CONTROL_PLANE_READINESS_DEFAULT,
  CONTROL_PLANE_READINESS_OWNER,
  CONTROL_PLANE_READINESS_REASON,
  LOCAL_STR_12BRF,
  LOCAL_STR_BOOLEAN,
  LOCAL_STR_EMPTY,
  PRESSURE_STATE,
  READINESS_ERROR_MSG,
  RECOVERY_GRACE_MESSAGE_GROUP_SERVICE_STATUSES,
  SERVICE_STATUS,
  SERVICE_TYPE,
  STATE,
  TABLES,
  compactEligibilitySnapshot,
  normalizeLocalQueryTransportEvidence,
} = SHARED;

class ControlPlaneReadinessNodeServiceRows extends
  ControlPlaneReadinessStartupAuthorityHealth {
  async readNodeRows(options = {}) {
    if (
      options.allowAuthoritativeRefresh === true &&
      this.nodesOwner &&
      typeof this.nodesOwner.listNodes === 'function'
    ) {
      const result = await this.nodesOwner.listNodes(options);
      return Array.isArray(result?.rows) ? result.rows : [];
    }
    if (
      this.nodesOwner &&
      typeof this.nodesOwner.listNodesFromCache === 'function'
    ) {
      const result = await this.nodesOwner.listNodesFromCache(options);
      return Array.isArray(result?.rows) ? result.rows : [];
    }
    return this.getNodeRows();
  }

  async readNodeServiceRows(nodeId, options = {}) {
    if (Array.isArray(options.allServiceRows)) {
      return options.allServiceRows.filter(
        (row) => row?.[COLUMN.NODE_ID] === nodeId,
      );
    }
    if (
      options.allowAuthoritativeRefresh === true &&
      this.servicesOwner &&
      typeof this.servicesOwner.listServices === 'function'
    ) {
      const result = await this.servicesOwner.listServices(options);
      return Array.isArray(result?.rows) ?
        result.rows.filter((row) => row?.[COLUMN.NODE_ID] === nodeId) :
        [];
    }
    if (
      this.servicesOwner &&
      typeof this.servicesOwner.listServicesForNodeFromCache ===
        'function'
    ) {
      const result = await this.servicesOwner.listServicesForNodeFromCache(
        nodeId,
        options,
      );
      return Array.isArray(result?.rows) ? result.rows : [];
    }
    return this.getNodeServiceRows(nodeId);
  }

  async readAllNodeServiceRows(options = {}) {
    if (
      options.allowAuthoritativeRefresh === true &&
      this.servicesOwner &&
      typeof this.servicesOwner.listServices === 'function'
    ) {
      const result = await this.servicesOwner.listServices(options);
      return Array.isArray(result?.rows) ? result.rows : [];
    }
    if (
      this.servicesOwner &&
      typeof this.servicesOwner.listServicesFromCache === 'function'
    ) {
      const result = await this.servicesOwner.listServicesFromCache(options);
      return Array.isArray(result?.rows) ? result.rows : [];
    }
    if (
      !this.systemTableCache ||
      typeof this.systemTableCache.getAll !== 'function'
    ) {
      return [];
    }
    return this.systemTableCache.getAll(TABLES.SERVICES) || [];
  }

  getNodeRow(nodeId) {
    if (!this.systemTableCache) {
      return null;
    }
    // Readiness consumes the node row as immutable evidence: the shared
    // deep-frozen row keeps a stable object identity across builds so the
    // projection-readiness normalization cache can reuse it, where a fresh
    // deepClone per call defeated that cache and re-walked the largest
    // per-build input graph every cycle.
    if (typeof this.systemTableCache.getShared === 'function') {
      return this.systemTableCache.getShared(TABLES.NODES, nodeId) || null;
    }
    if (typeof this.systemTableCache.get === 'function') {
      return this.systemTableCache.get(TABLES.NODES, nodeId) || null;
    }

    return this.getNodeRows().find((row) => row?.[COLUMN.NODE_ID] === nodeId) ||
      null;
  }

  getNodeRows() {
    if (
      !this.systemTableCache ||
      typeof this.systemTableCache.getAll !== 'function'
    ) {
      return [];
    }
    return this.systemTableCache.getAll(TABLES.NODES);
  }

  getNodeServiceRows(nodeId) {
    if (!this.systemTableCache) {
      return [];
    }
    if (typeof this.systemTableCache.filter === 'function') {
      return this.systemTableCache.filter(TABLES.SERVICES, (row) => {
        return row?.[COLUMN.NODE_ID] === nodeId;
      });
    }
    if (typeof this.systemTableCache.getAll !== 'function') {
      return [];
    }
    return this.systemTableCache.getAll(TABLES.SERVICES).filter((row) => {
      return row?.[COLUMN.NODE_ID] === nodeId;
    });
  }

  getLifecycleState(nodeId, nodeRow) {
    if (
      nodeId === this.nodeId &&
      this.nodeLifecycleStateMachine &&
      typeof this.nodeLifecycleStateMachine.getState === 'function'
    ) {
      return this.nodeLifecycleStateMachine.getState();
    }
    return nodeRow?.[COLUMN.STATUS] || null;
  }

  async getCapacitySnapshot(nodeId, _nodeRow) {
    if (
      this.storageAccountingService &&
      typeof this.storageAccountingService.getCapacitySnapshotForNode ===
        'function'
    ) {
      return this.storageAccountingService.getCapacitySnapshotForNode(nodeId);
    }

    if (!this.loggedMissingStorageAccountingOwner) {
      this.loggedMissingStorageAccountingOwner = true;
      this.logMissingOwner(
        LOCAL_STR_12BRF,
        CONTROL_PLANE_READINESS_OWNER.STORAGE_ACCOUNTING,
      );
    }

    if (this.strictOwnerDependencies) {
      throw new Error(READINESS_ERROR_MSG.STORAGE_ACCOUNTING_OWNER_REQUIRED);
    }

    return null;
  }

  hasRoutableService(serviceRows) {
    if (serviceRows.length === 0) {
      return true;
    }
    if (
      !serviceRows.some((serviceRow) => {
        return this.hasAddressedService(serviceRow);
      })
    ) {
      return true;
    }
    return serviceRows.some((serviceRow) => {
      return (
        String(serviceRow?.[COLUMN.STATUS] || LOCAL_STR_EMPTY).toLowerCase() ===
          SERVICE_STATUS.ACTIVE &&
        this.hasAddressedService(serviceRow)
      );
    });
  }

  hasWritableControlPlaneService(serviceRows) {
    if (serviceRows.length === 0) {
      return true;
    }
    const hasMessageGroupRows = serviceRows.some((serviceRow) => {
      return serviceRow?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP;
    });
    if (!hasMessageGroupRows) {
      return true;
    }
    if (this.hasActiveAddressedMessageGroupService(serviceRows)) {
      return true;
    }
    return this.hasStartupControlPlaneWriteGrace(serviceRows);
  }

  hasServeEligibleControlPlaneService(serviceRows) {
    if (serviceRows.length === 0) {
      return true;
    }
    const hasMessageGroupRows = serviceRows.some((serviceRow) => {
      return serviceRow?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP;
    });
    if (!hasMessageGroupRows) {
      return true;
    }
    return this.hasActiveAddressedMessageGroupService(serviceRows);
  }

  hasActiveAddressedMessageGroupService(serviceRows) {
    return serviceRows.some((serviceRow) => {
      return (
        serviceRow?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP &&
        String(serviceRow?.[COLUMN.STATUS] || LOCAL_STR_EMPTY).toLowerCase() ===
          SERVICE_STATUS.ACTIVE &&
        this.hasAddressedService(serviceRow)
      );
    });
  }

  hasRecoveryGraceControlPlaneService(serviceRows) {
    if (this.hasWritableControlPlaneService(serviceRows)) {
      return true;
    }
    // A restarted joiner can expose addressed but still-converging message-group
    // service rows before the local replica flips ACTIVE again. Keep recovery
    // admission open so it can finish re-registering through the owner path.
    if (
      !this.hasAddressedMessageGroupServiceWithStatuses(
        serviceRows,
        RECOVERY_GRACE_MESSAGE_GROUP_SERVICE_STATUSES,
      )
    ) {
      return false;
    }
    return this.hasActiveAddressedNonMessageGroupService(serviceRows);
  }

  hasStartupControlPlaneWriteGrace(serviceRows) {
    if (
      !this.hasAddressedMessageGroupServiceWithStatuses(serviceRows, [
        SERVICE_STATUS.STOPPED,
      ])
    ) {
      return false;
    }
    return this.hasActiveAddressedNonMessageGroupService(serviceRows);
  }

  hasAddressedService(serviceRow) {
    return typeof serviceRow?.[COLUMN.ADDRESS] === 'string' &&
      serviceRow[COLUMN.ADDRESS].length > 0;
  }

  hasAddressedMessageGroupServiceWithStatuses(serviceRows, allowedStatuses) {
    if (!Array.isArray(allowedStatuses) || allowedStatuses.length === 0) {
      return false;
    }
    return serviceRows.some((serviceRow) => {
      return (
        serviceRow?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP &&
        allowedStatuses.includes(
          String(serviceRow?.[COLUMN.STATUS] || LOCAL_STR_EMPTY).toLowerCase(),
        ) &&
        this.hasAddressedService(serviceRow)
      );
    });
  }

  hasActiveAddressedNonMessageGroupService(serviceRows) {
    return serviceRows.some((serviceRow) => {
      return (
        serviceRow?.[COLUMN.SERVICE_TYPE] !== SERVICE_TYPE.MESSAGE_GROUP &&
        String(serviceRow?.[COLUMN.STATUS] || LOCAL_STR_EMPTY).toLowerCase() ===
          SERVICE_STATUS.ACTIVE &&
        this.hasAddressedService(serviceRow)
      );
    });
  }

  isLoadReady(nodeRow) {
    const loadValues = [
      Number(nodeRow?.[COLUMN.CPU_USAGE_PERCENT]),
      Number(nodeRow?.[COLUMN.MEMORY_USAGE_PERCENT]),
      Number(nodeRow?.[COLUMN.DISK_USAGE_PERCENT]),
    ];

    return loadValues.every((value) => {
      return !Number.isFinite(value) ||
        value < CONTROL_PLANE_READINESS_DEFAULT.LOAD_READY_MAX_PERCENT;
    });
  }

  isCapacityPlacementEligible(capacity) {
    if (!capacity) {
      return false;
    }
    if (
      !Number.isFinite(Number(capacity.budgetBytes)) ||
      Number(capacity.budgetBytes) <= 0
    ) {
      return false;
    }
    return !CONTROL_PLANE_READINESS_DEFAULT
      .PLACEMENT_BLOCKING_PRESSURE_STATES.includes(
        String(capacity.pressureState || LOCAL_STR_EMPTY),
      );
  }

  getCapacityReasonCode(capacity) {
    if (!capacity) {
      return CONTROL_PLANE_READINESS_REASON.STORAGE_BUDGET_UNAVAILABLE;
    }
    if (
      !Number.isFinite(Number(capacity.budgetBytes)) ||
      Number(capacity.budgetBytes) <= 0
    ) {
      return CONTROL_PLANE_READINESS_REASON.STORAGE_BUDGET_UNAVAILABLE;
    }
    if (capacity.pressureState === PRESSURE_STATE.HARD) {
      return CONTROL_PLANE_READINESS_REASON.STORAGE_PRESSURE_HARD;
    }
    if (capacity.pressureState === PRESSURE_STATE.EXHAUSTED) {
      return CONTROL_PLANE_READINESS_REASON.STORAGE_PRESSURE_EXHAUSTED;
    }
    return null;
  }

  buildClusterMemberHealthDetails(nodeId, nodeRow) {
    const liveness = this.projectNodeLivenessFromRow(
      nodeId,
      nodeRow,
      this.now(),
    );
    const localQueryTransport = this.getLocalQueryTransportEvidence(nodeId);
    const lastHeartbeat = Number(liveness?.heartbeatFreshness?.lastHeartbeatMs);
    const readyLeaseExpiresAt = Number(liveness?.leaseSemantics?.expiresAtMs);
    const projectedAtMs = Number(liveness?.projectedAtMs);
    const heartbeatAgeMs = Number.isFinite(lastHeartbeat) ?
      projectedAtMs - lastHeartbeat :
      null;
    const readyLeaseAgeMs = Number.isFinite(readyLeaseExpiresAt) ?
      projectedAtMs - readyLeaseExpiresAt :
      null;
    const status = liveness?.statusSemantics?.state || null;

    return Object.freeze({
      status,
      rowConnectionState: liveness?.connectionSemantics?.rowState || null,
      routerConnectionState: liveness?.connectionSemantics?.routerState || null,
      transportConnected:
        liveness?.connectionSemantics?.connected === true,
      localQueryTransportState: localQueryTransport?.state || null,
      localQueryTransportReady:
        typeof localQueryTransport?.ready === LOCAL_STR_BOOLEAN ?
          localQueryTransport.ready :
          null,
      localQueryTransportReason: localQueryTransport?.reason || null,
      localQueryTransportReasonCode:
        localQueryTransport?.reasonCode || null,
      localQueryTransportErrorCode:
        localQueryTransport?.errorCode || null,
      localQueryTransportRetryAfterMs:
        Number.isFinite(localQueryTransport?.retryAfterMs) ?
          localQueryTransport.retryAfterMs :
          null,
      lastHeartbeat: Number.isFinite(lastHeartbeat) ? lastHeartbeat : null,
      heartbeatAgeMs: Number.isFinite(heartbeatAgeMs) ? heartbeatAgeMs : null,
      readyLeaseExpiresAt: Number.isFinite(readyLeaseExpiresAt) ?
        readyLeaseExpiresAt :
        null,
      readyLeaseAgeMs:
        Number.isFinite(readyLeaseAgeMs) ? readyLeaseAgeMs : null,
      readyLeaseExplicitlyCleared:
        liveness?.leaseSemantics?.explicitlyCleared === true,
      staleHeartbeatLimitMs: this.clusterMemberStaleHeartbeatMaxAgeMs,
      readyNow: liveness?.readyNow === true,
      readyWhenWritten: liveness?.readyWhenWritten === true,
      clusterMemberHeartbeatFreshness:
        liveness?.heartbeatFreshness?.clusterMembership || null,
      repairHeartbeatFreshness:
        liveness?.repairFreshness?.state || null,
      derivationGraceActive: liveness?.derivationGraceActive === true,
    });
  }

  getLocalQueryTransportEvidence(nodeId) {
    if (nodeId !== this.nodeId) {
      return null;
    }
    if (
      !this.messageRouter ||
      typeof this.messageRouter.getQueryDataPlaneTransportReadiness !==
        'function'
    ) {
      return normalizeLocalQueryTransportEvidence(null);
    }
    return normalizeLocalQueryTransportEvidence(
      this.messageRouter.getQueryDataPlaneTransportReadiness(),
    );
  }

  getNodeTransportState(nodeId, nodeRow) {
    let routerState = null;
    if (
      nodeId &&
      this.messageRouter &&
      typeof this.messageRouter.getConnectionState === 'function'
    ) {
      routerState = String(
        this.messageRouter.getConnectionState(nodeId) || LOCAL_STR_EMPTY,
      ).toLowerCase();
    }

    const rowStateRaw = String(nodeRow?.[COLUMN.CONNECTION_STATE] || '')
      .toLowerCase();
    const normalizedRowState = rowStateRaw.length > 0 ?
      rowStateRaw :
      null;
    const normalizedRouterState =
      typeof routerState === 'string' && routerState.length > 0 ?
        routerState :
        null;

    let connected = false;
    if (normalizedRouterState === STATE.DISCONNECTED) {
      connected = false;
    } else if (
      normalizedRouterState === STATE.CONNECTED ||
      normalizedRouterState === STATE.READY
    ) {
      connected = true;
    } else {
      connected =
        normalizedRowState === STATE.CONNECTED ||
        normalizedRowState === STATE.READY;
    }

    return Object.freeze({
      connected,
      rowState: normalizedRowState,
      routerState: normalizedRouterState,
    });
  }

  isNodeTransportConnected(nodeId, nodeRow) {
    return this.getNodeTransportState(nodeId, nodeRow).connected;
  }

  isRecentHeartbeat(nodeRow) {
    const nodeId = nodeRow?.[COLUMN.NODE_ID] ?? nodeRow?.node_id;
    const projection = this.projectNodeLivenessFromRow(
      nodeId,
      nodeRow,
      this.now(),
    );
    return projection?.heartbeatFreshness?.clusterMembership ===
      NODE_LIVENESS_SEMANTIC_STATE.FRESH;
  }

  isClusterMemberHealthy(nodeId, nodeRow) {
    const projection = this.projectNodeLivenessFromRow(
      nodeId,
      nodeRow,
      this.now(),
    );
    return projection?.clusterMembershipSemantics?.state ===
      NODE_LIVENESS_SEMANTIC_STATE.HEALTHY;
  }

  static compactSnapshotSummary(snapshot, decisionDimension = null) {
    return compactEligibilitySnapshot(snapshot, decisionDimension);
  }
}

export {ControlPlaneReadinessNodeServiceRows};
