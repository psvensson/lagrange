import {LoggingService} from '../logging/logging-service.js';
import {
  COLUMN,
  NUM,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
  TYPEOF,
} from '../constants/index.js';
import {isNodeRecordReady} from '../node/node-readiness-policy.js';
import {PRESSURE_STATE} from '../rebalancer/storage-capacity-constants.js';
import {
  CONTROL_PLANE_PUBLICATION_MODE,
  CONTROL_PLANE_READINESS_DEFAULT,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_OWNER,
  CONTROL_PLANE_READINESS_REASON,
  CONTROL_PLANE_READINESS_SUBSYSTEM,
  READINESS_SNAPSHOT_KEY,
} from './control-plane-readiness-constants.js';

function buildReason(
  code,
  dimension,
  sourceOwner,
  observedAt,
) {
  return Object.freeze({
    code,
    dimension,
    sourceOwner,
    observedAt,
  });
}

function normalizeIsoTimestamp(nowValue) {
  return new Date(nowValue).toISOString();
}

class ControlPlaneReadinessService {
  /**
   * @param {Object} options
   */
  constructor(options = {}) {
    this.nodeId = options.nodeId || null;
    this.systemTableCache = options.systemTableCache || null;
    this.nodeLifecycleStateMachine = options.nodeLifecycleStateMachine || null;
    this.storageAccountingService = options.storageAccountingService || null;
    this.cdcGroupPropagationService = options.cdcGroupPropagationService || null;
    this.loggedMissingStorageAccountingOwner = false;
    this.loggedMissingPublicationOwner = false;
    this.now = typeof options.now === TYPEOF.FUNCTION ?
      options.now :
      () => Date.now();

    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(CONTROL_PLANE_READINESS_SUBSYSTEM) :
      console;
  }

  /**
   * Build readiness for every known node.
   * @return {Promise<Object[]>}
   */
  async getAllNodeReadiness() {
    const nodeRows = this.getNodeRows();
    const readiness = [];

    for (const nodeRow of nodeRows) {
      const nodeId = nodeRow?.[COLUMN.NODE_ID] || null;
      if (!nodeId) {
        continue;
      }
      readiness.push(await this.getNodeReadiness(nodeId));
    }

    return readiness;
  }

  /**
   * Build readiness for one node.
   * @readModel READINESS_NODE_STATE — READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE
   * @readModel READINESS_SERVICE_STATE — READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE
   * @readModel READINESS_CAPACITY — READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE
   * @param {string} nodeId
   * @return {Promise<Object>}
   */
  async getNodeReadiness(nodeId) {
    const observedAt = normalizeIsoTimestamp(this.now());
    const nodeRow = this.getNodeRow(nodeId);
    const publication = this.getPublicationDiagnostics(observedAt);

    if (!nodeRow) {
      return this.buildMissingNodeReadiness(nodeId, observedAt, publication);
    }

    const lifecycleState = this.getLifecycleState(nodeId, nodeRow);
    const serviceRows = this.getNodeServiceRows(nodeId);
    const capacity = await this.getCapacitySnapshot(nodeId, nodeRow);
    const dimensions = this.buildDimensions({
      nodeRow,
      lifecycleState,
      serviceRows,
      capacity,
      publication,
    });
    const reasons = this.buildReasons({
      dimensions,
      lifecycleState,
      serviceRows,
      capacity,
      publication,
      observedAt,
    });

    return Object.freeze({
      nodeId,
      lifecycleState,
      publication,
      capacity,
      dimensions,
      reasons,
    });
  }

  /**
   * Synchronous readiness snapshot for a single node.
   * Computes all dimensions that do not require async capacity lookup.
   * `placementEligible` is conservatively false when capacity is
   * unavailable synchronously.
   * @param {string} nodeId
   * @return {Object|null} Frozen readiness snapshot or null.
   */
  getNodeReadinessSync(nodeId) {
    const observedAt = normalizeIsoTimestamp(this.now());
    const nodeRow = this.getNodeRow(nodeId);
    const publication = this.getPublicationDiagnostics(observedAt);

    if (!nodeRow) {
      return this.buildMissingNodeReadiness(
        nodeId, observedAt, publication,
      );
    }

    const lifecycleState = this.getLifecycleState(nodeId, nodeRow);
    const serviceRows = this.getNodeServiceRows(nodeId);
    const dimensions = this.buildDimensions({
      nodeRow,
      lifecycleState,
      serviceRows,
      capacity: null,
      publication,
    });
    const reasons = this.buildReasons({
      dimensions,
      lifecycleState,
      serviceRows,
      capacity: null,
      publication,
      observedAt,
    });

    return Object.freeze({
      nodeId,
      lifecycleState,
      publication,
      capacity: null,
      dimensions,
      reasons,
    });
  }

  /**
   * Resolve publication diagnostics from the canonical publication owner.
   * @param {string} observedAt
   * @return {Object}
   * @private
   */
  getPublicationDiagnostics(observedAt) {
    if (this.cdcGroupPropagationService &&
        typeof this.cdcGroupPropagationService.getPublicationModeDiagnostics ===
          TYPEOF.FUNCTION) {
      return this.cdcGroupPropagationService.getPublicationModeDiagnostics();
    }

    if (!this.loggedMissingPublicationOwner) {
      this.loggedMissingPublicationOwner = true;
      this.logger.error(
        'ControlPlaneReadinessService missing CDC publication owner',
        {
          nodeId: this.nodeId,
          owner: CONTROL_PLANE_READINESS_OWNER.CDC_GROUP_PROPAGATION,
        },
      );
    }

    return Object.freeze({
      currentMode: CONTROL_PLANE_PUBLICATION_MODE.REPAIR_ONLY,
      reasonCode: 'publication_owner_unavailable',
      enteredAt: observedAt,
      recentTransitions: Object.freeze([]),
    });
  }

  /**
   * Build the readiness dimensions.
   * @param {Object} context
   * @return {Object}
   * @private
   */
  buildDimensions(context) {
    const publicationHealthy =
      context.publication.currentMode === CONTROL_PLANE_PUBLICATION_MODE.GROUPED;
    const processAlive =
      !CONTROL_PLANE_READINESS_DEFAULT.NON_RUNNING_PROCESS_STATES.includes(
        String(context.lifecycleState || ''),
      );
    const clusterMemberHealthy = this.isClusterMemberHealthy(context.nodeRow);
    const routingReady = this.hasRoutableService(context.serviceRows);
    const loadReady = this.isLoadReady(context.nodeRow);
    const controlPlaneWritable = clusterMemberHealthy &&
      routingReady &&
      this.hasWritableControlPlaneService(context.serviceRows) &&
      publicationHealthy;
    const placementEligible = processAlive &&
      clusterMemberHealthy &&
      routingReady &&
      loadReady &&
      controlPlaneWritable &&
      publicationHealthy &&
      this.isCapacityPlacementEligible(context.capacity);

    return Object.freeze({
      [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: processAlive,
      [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]:
        clusterMemberHealthy,
      [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]: routingReady,
      [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]: loadReady,
      [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]:
        placementEligible,
      [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]:
        controlPlaneWritable,
      [CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY]:
        publicationHealthy,
    });
  }

  /**
   * Build structured reasons for non-ready dimensions.
   * @param {Object} context
   * @return {Object[]}
   * @private
   */
  buildReasons(context) {
    const reasons = [];
    const dimensions = context.dimensions;

    if (!dimensions.processAlive) {
      reasons.push(buildReason(
        CONTROL_PLANE_READINESS_REASON.PROCESS_NOT_ALIVE,
        CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE,
        CONTROL_PLANE_READINESS_OWNER.NODE_LIFECYCLE,
        context.observedAt,
      ));
    }
    if (!dimensions.clusterMemberHealthy) {
      reasons.push(buildReason(
        CONTROL_PLANE_READINESS_REASON.CLUSTER_MEMBER_UNHEALTHY,
        CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY,
        CONTROL_PLANE_READINESS_OWNER.NODE_LIFECYCLE,
        context.observedAt,
      ));
    }
    if (!dimensions.routingReady) {
      reasons.push(buildReason(
        CONTROL_PLANE_READINESS_REASON.ROUTING_NOT_READY,
        CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY,
        CONTROL_PLANE_READINESS_OWNER.SYSTEM_TABLE_CACHE,
        context.observedAt,
      ));
    }
    if (!dimensions.loadReady) {
      reasons.push(buildReason(
        CONTROL_PLANE_READINESS_REASON.LOAD_NOT_READY,
        CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY,
        CONTROL_PLANE_READINESS_OWNER.SYSTEM_TABLE_CACHE,
        context.observedAt,
      ));
    }
    if (!dimensions.metadataPublicationHealthy) {
      reasons.push(buildReason(
        context.publication.currentMode === CONTROL_PLANE_PUBLICATION_MODE.REPAIR_ONLY ?
          CONTROL_PLANE_READINESS_REASON.METADATA_PUBLICATION_REPAIR_ONLY :
          CONTROL_PLANE_READINESS_REASON.METADATA_PUBLICATION_DEGRADED,
        CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY,
        CONTROL_PLANE_READINESS_OWNER.CDC_GROUP_PROPAGATION,
        context.observedAt,
      ));
    }
    if (!dimensions.controlPlaneWritable) {
      reasons.push(buildReason(
        CONTROL_PLANE_READINESS_REASON.CONTROL_PLANE_WRITE_UNHEALTHY,
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE,
        CONTROL_PLANE_READINESS_OWNER.SYSTEM_TABLE_CACHE,
        context.observedAt,
      ));
    }
    if (!this.isCapacityPlacementEligible(context.capacity)) {
      const code = this.getCapacityReasonCode(context.capacity);
      if (code) {
        reasons.push(buildReason(
          code,
          CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE,
          CONTROL_PLANE_READINESS_OWNER.STORAGE_ACCOUNTING,
          context.observedAt,
        ));
      }
    }

    return Object.freeze(reasons);
  }

  /**
   * Build readiness for a missing node row.
   * @param {string} nodeId
   * @param {string} observedAt
   * @param {Object} publication
   * @return {Object}
   * @private
   */
  buildMissingNodeReadiness(nodeId, observedAt, publication) {
    const dimensions = Object.freeze({
      [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: false,
      [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: false,
      [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]: false,
      [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]: false,
      [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]: false,
      [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: false,
      [CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY]:
        publication.currentMode === CONTROL_PLANE_PUBLICATION_MODE.GROUPED,
    });
    const reasons = Object.freeze([
      buildReason(
        CONTROL_PLANE_READINESS_REASON.NODE_ROW_MISSING,
        CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE,
        CONTROL_PLANE_READINESS_OWNER.SYSTEM_TABLE_CACHE,
        observedAt,
      ),
    ]);

    return Object.freeze({
      nodeId,
      lifecycleState: null,
      publication,
      capacity: null,
      dimensions,
      reasons,
    });
  }

  /**
   * Resolve one node row from cache.
   * @param {string} nodeId
   * @return {Object|null}
   * @private
   */
  getNodeRow(nodeId) {
    if (!this.systemTableCache) {
      return null;
    }
    if (typeof this.systemTableCache.get === TYPEOF.FUNCTION) {
      return this.systemTableCache.get(TABLES.NODES, nodeId) || null;
    }

    return this.getNodeRows().find((row) => row?.[COLUMN.NODE_ID] === nodeId) ||
      null;
  }

  /**
   * Resolve all node rows from cache.
   * @return {Object[]}
   * @private
   */
  getNodeRows() {
    if (!this.systemTableCache ||
        typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION) {
      return [];
    }
    return this.systemTableCache.getAll(TABLES.NODES);
  }

  /**
   * Resolve service rows for one node.
   * @param {string} nodeId
   * @return {Object[]}
   * @private
   */
  getNodeServiceRows(nodeId) {
    if (!this.systemTableCache) {
      return [];
    }
    if (typeof this.systemTableCache.filter === TYPEOF.FUNCTION) {
      return this.systemTableCache.filter(TABLES.SERVICES, (row) => {
        return row?.[COLUMN.NODE_ID] === nodeId;
      });
    }
    if (typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION) {
      return [];
    }
    return this.systemTableCache.getAll(TABLES.SERVICES).filter((row) => {
      return row?.[COLUMN.NODE_ID] === nodeId;
    });
  }

  /**
   * Resolve the canonical lifecycle state for one node.
   * @param {string} nodeId
   * @param {Object} nodeRow
   * @return {string|null}
   * @private
   */
  getLifecycleState(nodeId, nodeRow) {
    if (nodeId === this.nodeId &&
        this.nodeLifecycleStateMachine &&
        typeof this.nodeLifecycleStateMachine.getState === TYPEOF.FUNCTION) {
      return this.nodeLifecycleStateMachine.getState();
    }
    return nodeRow?.[COLUMN.STATUS] || null;
  }

  /**
   * Resolve the storage snapshot for one node.
   * @param {string} nodeId
   * @param {Object} nodeRow
   * @return {Promise<Object|null>}
   * @private
   */
  async getCapacitySnapshot(nodeId, _nodeRow) {
    if (this.storageAccountingService &&
        typeof this.storageAccountingService.getCapacitySnapshotForNode ===
          TYPEOF.FUNCTION) {
      return this.storageAccountingService.getCapacitySnapshotForNode(nodeId);
    }

    if (!this.loggedMissingStorageAccountingOwner) {
      this.loggedMissingStorageAccountingOwner = true;
      this.logger.error(
        'ControlPlaneReadinessService missing storage accounting owner',
        {
          nodeId: this.nodeId,
          owner: CONTROL_PLANE_READINESS_OWNER.STORAGE_ACCOUNTING,
        },
      );
    }

    return null;
  }

  /**
   * Return true when the node has at least one active addressed service.
   * @param {Object[]} serviceRows
   * @return {boolean}
   * @private
   */
  hasRoutableService(serviceRows) {
    if (serviceRows.length === NUM.ZERO) {
      return true;
    }
    if (!serviceRows.some((serviceRow) => {
      return typeof serviceRow?.[COLUMN.ADDRESS] === TYPEOF.STRING &&
        serviceRow[COLUMN.ADDRESS].length > NUM.ZERO;
    })) {
      return true;
    }
    return serviceRows.some((serviceRow) => {
      return String(serviceRow?.[COLUMN.STATUS] || '').toLowerCase() ===
        SERVICE_STATUS.ACTIVE &&
        typeof serviceRow?.[COLUMN.ADDRESS] === TYPEOF.STRING &&
        serviceRow[COLUMN.ADDRESS].length > NUM.ZERO;
    });
  }

  /**
   * Return true when the node has an active message-group control-plane path.
   * @param {Object[]} serviceRows
   * @return {boolean}
   * @private
   */
  hasWritableControlPlaneService(serviceRows) {
    if (serviceRows.length === NUM.ZERO) {
      return true;
    }
    const hasMessageGroupRows = serviceRows.some((serviceRow) => {
      return serviceRow?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP;
    });
    if (!hasMessageGroupRows) {
      return true;
    }
    return serviceRows.some((serviceRow) => {
      return serviceRow?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP &&
        String(serviceRow?.[COLUMN.STATUS] || '').toLowerCase() ===
          SERVICE_STATUS.ACTIVE &&
        typeof serviceRow?.[COLUMN.ADDRESS] === TYPEOF.STRING &&
        serviceRow[COLUMN.ADDRESS].length > NUM.ZERO;
    });
  }

  /**
   * Return true when node resource usage is below the blocking threshold.
   * @param {Object} nodeRow
   * @return {boolean}
   * @private
   */
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

  /**
   * Return true when storage state permits placement.
   * @param {Object|null} capacity
   * @return {boolean}
   * @private
   */
  isCapacityPlacementEligible(capacity) {
    if (!capacity) {
      return false;
    }
    if (!Number.isFinite(Number(capacity.budgetBytes)) ||
        Number(capacity.budgetBytes) <= NUM.ZERO) {
      return false;
    }
    return !CONTROL_PLANE_READINESS_DEFAULT
      .PLACEMENT_BLOCKING_PRESSURE_STATES.includes(
        String(capacity.pressureState || ''),
      );
  }

  /**
   * Map storage state to a stable readiness reason code.
   * @param {Object|null} capacity
   * @return {string|null}
   * @private
   */
  getCapacityReasonCode(capacity) {
    if (!capacity) {
      return CONTROL_PLANE_READINESS_REASON.STORAGE_BUDGET_UNAVAILABLE;
    }
    if (!Number.isFinite(Number(capacity.budgetBytes)) ||
        Number(capacity.budgetBytes) <= NUM.ZERO) {
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

  /**
   * Treat sparse test/bootstrap rows as healthy when lease fields are absent.
   * @param {Object} nodeRow
   * @return {boolean}
   * @private
   */
  isClusterMemberHealthy(nodeRow) {
    const hasLeaseField = Number.isFinite(Number(
      nodeRow?.[COLUMN.READY_LEASE_EXPIRES_AT],
    ));
    const hasStatusField = typeof nodeRow?.[COLUMN.STATUS] === TYPEOF.STRING &&
      nodeRow[COLUMN.STATUS].length > NUM.ZERO;

    if (!hasLeaseField && !hasStatusField) {
      return !!nodeRow;
    }

    return isNodeRecordReady(nodeRow, {
      now: this.now(),
    });
  }

  /**
   * Build a compact snapshot summary suitable for persistence
   * alongside admission, dispatch, and progression decisions.
   *
   * Extracts only the key fields needed for diagnostics linkage
   * without the full verbose snapshot (publication details, capacity
   * breakdown, etc.).
   *
   * @param {Object|null} snapshot - Frozen readiness snapshot from
   *   getNodeReadiness / getNodeReadinessSync.
   * @return {Object|null} Compact frozen summary or null.
   */
  static compactSnapshotSummary(snapshot) {
    if (!snapshot) {
      return null;
    }
    const reasonCodes = Array.isArray(snapshot.reasons) ?
      snapshot.reasons.map((r) => r?.code).filter(Boolean) :
      [];
    return Object.freeze({
      [READINESS_SNAPSHOT_KEY.NODE_ID]: snapshot.nodeId || null,
      [READINESS_SNAPSHOT_KEY.DIMENSIONS]:
        snapshot.dimensions ?
          Object.freeze({...snapshot.dimensions}) :
          null,
      [READINESS_SNAPSHOT_KEY.REASON_CODES]:
        Object.freeze(reasonCodes),
      [READINESS_SNAPSHOT_KEY.LIFECYCLE_STATE]:
        snapshot.lifecycleState || null,
    });
  }
}

export {ControlPlaneReadinessService};
