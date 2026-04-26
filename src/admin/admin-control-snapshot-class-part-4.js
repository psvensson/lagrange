/**
 * Control snapshot building for the admin WebSocket API.
 *
 * This module owns all control-snapshot diagnostics: leader summary,
 * voter counts, replica operation summary, and CDC telemetry. The parent
 * AdminWebSocketAPI instantiates one AdminControlSnapshot and delegates
 * all control-snapshot-related calls to it.
 *
 * Single-use helpers that exist only for control-snapshot logic live here
 * as module-private functions. Shared helpers are imported from
 * admin-helpers.js.
 */
import {COLUMN, NUM, TYPEOF} from '../constants/index.js';
import {PARTITION_TRANSITION_METADATA_FIELD} from '../partition/partition-constants.js';
import {CONTROL_PLANE_READINESS_DIMENSION} from '../control-plane/control-plane-readiness-constants.js';
import {
  ADMIN_CACHE_DUMP,
} from './admin-constants.js';
import {
  firstStringField,
  uniqueSorted,
} from './admin-helpers.js';
import {
  buildReadinessByNodeId,
} from '../control-plane/active-node-projection.js';
import {
} from '../control-plane/priority-recovery-diagnostics-constants.js';
import {
} from './admin-authoritative-repair-evaluation.js';
import {AdminControlSnapshotPart3} from './admin-control-snapshot-class-part-3.js';
// ── file-local constants ────────────────────────────────────────────────────
const PARTITION_STATE_NORMAL = 'NORMAL';
/**
 * Normalize one arbitrary value to a non-negative integer.
 * @param {*} value
 * @return {number}
 */
// ── AdminControlSnapshot class ──────────────────────────────────────────────
/**
 * Control snapshot builder.
 * Receives all required dependencies via constructor injection.
 * Cross-module callbacks (partition services resolution) are injected
 * as functions so this module has no back-reference to AdminWebSocketAPI.
 */
class AdminControlSnapshotPart4 extends AdminControlSnapshotPart3 {
  evaluateConnectedNodeCoverageGap(nodeRows = []) {
    if (
      !this.messageRouter ||
      typeof this.messageRouter.getConnectedNodes !== TYPEOF.FUNCTION
    ) {
      return Object.freeze({
        hasCoverageGap: false,
        missingNodeIds: Object.freeze([]),
      });
    }
    const observedNodeIds = new Set();
    for (const nodeRow of Array.isArray(nodeRows) ? nodeRows : []) {
      const nodeId = firstStringField(
        nodeRow,
        COLUMN.NODE_ID,
        'node_id',
        'nodeId',
        'id',
      );
      if (nodeId) {
        observedNodeIds.add(nodeId);
      }
    }
    const connectedNodeIds = uniqueSorted(
      (this.messageRouter.getConnectedNodes() || []).filter(
        (nodeId) =>
          typeof nodeId === TYPEOF.STRING &&
          nodeId.length > NUM.ZERO &&
          nodeId !== this.nodeId,
      ),
    );
    const missingNodeIds = connectedNodeIds.filter(
      (nodeId) => !observedNodeIds.has(nodeId),
    );
    return Object.freeze({
      hasCoverageGap: missingNodeIds.length > NUM.ZERO,
      missingNodeIds: Object.freeze(missingNodeIds),
    });
  }
  evaluateActiveNodeProjectionCoverageGap(options = {}) {
    const nodeRows = Array.isArray(options.nodeRows) ?
      options.nodeRows :
      ADMIN_CACHE_DUMP.EMPTY;
    const serviceRows = Array.isArray(options.serviceRows) ?
      options.serviceRows :
      ADMIN_CACHE_DUMP.EMPTY;
    const nodeEndpointRows = Array.isArray(options.nodeEndpointRows) ?
      options.nodeEndpointRows :
      ADMIN_CACHE_DUMP.EMPTY;
    const readinessByNodeId = buildReadinessByNodeId({
      readinessByNodeId:
        options.controlPlaneDiagnostics?.readinessByNodeId || null,
    });
    const activeNodeViews = this.resolveControlSnapshotNodeViews(
      nodeRows,
      serviceRows,
      nodeEndpointRows,
      options.controlPlaneDiagnostics || null,
    );
    const activeNodeIds = new Set(activeNodeViews.projectedActiveNodeIds);
    const visibleNodeIds = new Set();
    for (const [nodeId, readinessEntry] of Object.entries(
      readinessByNodeId || {},
    )) {
      const readinessDimensions =
        readinessEntry?.dimensions &&
        typeof readinessEntry.dimensions === TYPEOF.OBJECT ?
          readinessEntry.dimensions :
          null;
      if (
        !readinessDimensions ||
        readinessDimensions[
          CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY
        ] !== true
      ) {
        continue;
      }
      visibleNodeIds.add(nodeId);
    }
    for (const endpointRow of nodeEndpointRows) {
      if (!this.isActiveWebSocketEndpoint(endpointRow)) {
        continue;
      }
      const nodeId = firstStringField(
        endpointRow,
        COLUMN.NODE_ID,
        'node_id',
        'nodeId',
      );
      if (nodeId) {
        visibleNodeIds.add(nodeId);
      }
    }
    if (
      this.messageRouter &&
      typeof this.messageRouter.getConnectedNodes === TYPEOF.FUNCTION
    ) {
      for (const nodeId of this.messageRouter.getConnectedNodes() || []) {
        if (typeof nodeId === TYPEOF.STRING && nodeId.length > NUM.ZERO) {
          visibleNodeIds.add(nodeId);
        }
      }
    }
    const missingNodeIds = uniqueSorted(
      [...visibleNodeIds].filter((nodeId) => !activeNodeIds.has(nodeId)),
    );
    return Object.freeze({
      hasCoverageGap: missingNodeIds.length > NUM.ZERO,
      missingNodeIds: Object.freeze(missingNodeIds),
    });
  }
  /**
   * Detect local partition-topology gaps that indicate stale cache
   * state for control snapshot consumers.
   * @param {Array<Object>} tableRows
   * @param {Array<Object>} partitionRows
   * @return {boolean}
   * @private
   */
  hasControlSnapshotPartitionTopologyGap(tableRows, partitionRows) {
    const normalizedTableRows = Array.isArray(tableRows) ?
      tableRows :
      ADMIN_CACHE_DUMP.EMPTY;
    const normalizedPartitionRows = Array.isArray(partitionRows) ?
      partitionRows :
      ADMIN_CACHE_DUMP.EMPTY;
    if (
      normalizedTableRows.length === NUM.ZERO ||
      normalizedPartitionRows.length === NUM.ZERO
    ) {
      return false;
    }
    const partitionIds = new Set();
    const activePartitionCountByTableVersion = new Map();
    for (const partitionRow of normalizedPartitionRows) {
      const partitionId = firstStringField(
        partitionRow,
        COLUMN.PARTITION_ID,
        'id',
      );
      if (partitionId) {
        partitionIds.add(partitionId);
      }
      const tableId = firstStringField(partitionRow, COLUMN.TABLE_ID);
      const partitionVersion = Number(
        partitionRow?.partition_version ?? partitionRow?.partitionVersion,
      );
      if (
        !tableId ||
        !Number.isInteger(partitionVersion) ||
        partitionVersion < NUM.ONE
      ) {
        continue;
      }
      const state = String(
        partitionRow?.state ??
          partitionRow?.partition_state ??
          PARTITION_STATE_NORMAL,
      ).toUpperCase();
      if (state !== PARTITION_STATE_NORMAL) {
        continue;
      }
      const key = `${tableId}:${partitionVersion}`;
      activePartitionCountByTableVersion.set(
        key,
        (activePartitionCountByTableVersion.get(key) || NUM.ZERO) + NUM.ONE,
      );
    }
    for (const tableRow of normalizedTableRows) {
      const tableId = firstStringField(tableRow, COLUMN.TABLE_ID, 'id');
      if (!tableId) {
        continue;
      }
      const activePartitionVersion = Number(
        tableRow?.active_partition_version ?? tableRow?.activePartitionVersion,
      );
      const expectedPartitionCount = Number(
        tableRow?.partition_count ?? tableRow?.partitionCount,
      );
      if (
        Number.isInteger(activePartitionVersion) &&
        activePartitionVersion >= NUM.ONE &&
        Number.isInteger(expectedPartitionCount) &&
        expectedPartitionCount > NUM.ZERO
      ) {
        const key = `${tableId}:${activePartitionVersion}`;
        const observedPartitionCount =
          activePartitionCountByTableVersion.get(key) || NUM.ZERO;
        if (observedPartitionCount !== expectedPartitionCount) {
          return true;
        }
      }
      const transitionMetadata = this.parseWorkflowTransitionMetadata(tableRow);
      const targetPartitionIds = Array.isArray(
        transitionMetadata?.[
          PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS
        ],
      ) ?
        transitionMetadata[
          PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS
        ] :
        ADMIN_CACHE_DUMP.EMPTY;
      for (const targetPartitionId of targetPartitionIds) {
        const normalizedTargetPartitionId = String(targetPartitionId || '');
        if (!normalizedTargetPartitionId) {
          continue;
        }
        if (!partitionIds.has(normalizedTargetPartitionId)) {
          return true;
        }
      }
    }
    return false;
  }
}
export {AdminControlSnapshotPart4};
