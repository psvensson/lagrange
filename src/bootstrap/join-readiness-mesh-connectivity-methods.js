import {NodeService} from '../node/node-service.js';
import {
  COLUMN,
  TABLES,
} from '../constants/index.js';
import {
  normalizeNodeRow,
} from '../control-plane/system-row-normalizers.js';
import {NODE_STATE} from '../constants/node-state.js';
import {CONNECTION_STATE} from '../constants/transport.js';

const LOCAL_STR_SYSTEM_TABLE_CACHE = 'system_table_cache';
const LOCAL_STR_BOOTSTRAP_SNAPSHOT = 'bootstrap_snapshot';
const LOCAL_STR_SYSTEM_TABLE_CACHE_WITH_BOOTSTRAP_SUPPLEMENT =
  'system_table_cache_with_bootstrap_supplement';
const LOCAL_STR_COMMA = ',';

const MESH_CONNECTIVITY_ROW_SELECTION_KIND = Object.freeze({
  CACHE_WITH_BOOTSTRAP_SUPPLEMENT: 'cache_with_bootstrap_supplement',
  SYSTEM_TABLE_CACHE: 'system_table_cache',
  BOOTSTRAP_SNAPSHOT: 'bootstrap_snapshot',
});
const MESH_CONNECTIVITY_ROW_SELECTION_RULES = Object.freeze([
  Object.freeze({
    kind: MESH_CONNECTIVITY_ROW_SELECTION_KIND
      .CACHE_WITH_BOOTSTRAP_SUPPLEMENT,
    source: LOCAL_STR_SYSTEM_TABLE_CACHE_WITH_BOOTSTRAP_SUPPLEMENT,
    matches: (evidence) =>
      evidence.cacheRows.length > 0 &&
      evidence.supplementalBootstrapRows.length > 0,
    resolveRows: (evidence) =>
      evidence.cacheRows.concat(evidence.supplementalBootstrapRows),
    resolveBootstrapSupplementNodeIds: (evidence) =>
      evidence.bootstrapSupplementNodeIds,
  }),
  Object.freeze({
    kind: MESH_CONNECTIVITY_ROW_SELECTION_KIND.SYSTEM_TABLE_CACHE,
    source: LOCAL_STR_SYSTEM_TABLE_CACHE,
    matches: (evidence) => evidence.cacheRows.length > 0,
    resolveRows: (evidence) => evidence.cacheRows,
    resolveBootstrapSupplementNodeIds: () => [],
  }),
  Object.freeze({
    kind: MESH_CONNECTIVITY_ROW_SELECTION_KIND.BOOTSTRAP_SNAPSHOT,
    source: LOCAL_STR_BOOTSTRAP_SNAPSHOT,
    matches: () => true,
    resolveRows: (evidence) => evidence.bootstrapRows,
    resolveBootstrapSupplementNodeIds: () => [],
  }),
]);
const MESH_CONNECTIVITY_BOOTSTRAP_SUPPLEMENT_LIFECYCLE_STATES = new Set([
  NODE_STATE.JOINING,
  CONNECTION_STATE.CONNECTING,
]);

function selectMeshConnectivityRows(evidence) {
  const selectionRule = MESH_CONNECTIVITY_ROW_SELECTION_RULES.find((rule) =>
    rule.matches(evidence),
  );
  return {
    source: selectionRule.source,
    rows: selectionRule.resolveRows(evidence),
    bootstrapSupplementNodeIds:
      selectionRule.resolveBootstrapSupplementNodeIds(evidence),
  };
}

function createJoinReadinessMeshConnectivityMethods(options = {}) {
  const meshIneligibleNodeStates =
    options.meshIneligibleNodeStates || new Set();
  const meshConnectedOrInFlightStates =
    options.meshConnectedOrInFlightStates || new Set();

  return {
    /**
     * Resolve one node id from a mesh-connectivity row shape.
     * @param {Object|null} row
     * @return {string}
     */
    resolveMeshConnectivityNodeId(row) {
      return normalizeNodeRow(row).nodeId;
    },

    /**
     * Resolve one node status from a mesh-connectivity row shape.
     * @param {Object|null} row
     * @return {string}
     */
    resolveMeshConnectivityNodeStatus(row) {
      return normalizeNodeRow(row).status;
    },

    /**
     * Resolve lifecycle-state tokens relevant to peer mesh eligibility.
     * @param {Object|null} row
     * @return {string[]}
     */
    resolveMeshConnectivityLifecycleTokens(row) {
      return Array.from(new Set([
        row?.[COLUMN.STATUS],
        row?.status,
        row?.[COLUMN.CONNECTION_STATE],
        row?.connection_state,
        row?.connectionState,
      ].map((value) => {
        return String(value || '').toLowerCase();
      }).filter((value) => value.length > 0)));
    },

    /**
     * Determine whether a node row should participate in mesh reconciliation.
     * @param {Object|null} row
     * @return {boolean}
     */
    isMeshEligibleNodeRow(row) {
      const nodeId = this.resolveMeshConnectivityNodeId(row);
      if (nodeId.length === 0) {
        return false;
      }

      const lifecycleTokens =
        this.resolveMeshConnectivityLifecycleTokens(row);
      if (lifecycleTokens.length === 0) {
        return true;
      }

      return !lifecycleTokens.some((token) => {
        return meshIneligibleNodeStates.has(token);
      });
    },

    /**
     * Determine whether a bootstrap row may supplement active membership.
     * @param {Object|null} row
     * @return {boolean}
     */
    isBootstrapMeshSupplementalNodeRow(row) {
      return this.resolveMeshConnectivityLifecycleTokens(row).some((token) =>
        MESH_CONNECTIVITY_BOOTSTRAP_SUPPLEMENT_LIFECYCLE_STATES.has(token),
      );
    },

    /**
     * Resolve bootstrap rows that can safely participate in mesh connectivity.
     * @param {Object|null} bootstrapResponse
     * @param {Set<string>} bootstrapActiveNodeIds
     * @return {Object[]}
     */
    resolveBootstrapMeshConnectivityNodeRows(
      bootstrapResponse,
      bootstrapActiveNodeIds,
    ) {
      return Array.isArray(bootstrapResponse?.systemTableSnapshots?.nodes) ?
        bootstrapResponse.systemTableSnapshots.nodes.filter((row) => {
          const nodeId = this.resolveMeshConnectivityNodeId(row);
          const belongsToPublishedActiveSet =
            bootstrapActiveNodeIds.size === 0 ||
            (
              nodeId.length > 0 &&
              bootstrapActiveNodeIds.has(nodeId)
            );
          return (
            belongsToPublishedActiveSet ||
            this.isBootstrapMeshSupplementalNodeRow(row)
          ) &&
            this.isMeshEligibleNodeRow(row);
        }) :
        [];
    },

    /**
     * Resolve bootstrap rows that fill gaps in a partial cache membership view.
     * @param {Object[]} cacheRows
     * @param {Object[]} bootstrapRows
     * @return {{rows: Object[], nodeIds: string[]}}
     */
    resolveBootstrapMeshConnectivitySupplement(cacheRows, bootstrapRows) {
      const cacheNodeIds = new Set(cacheRows.map((row) =>
        this.resolveMeshConnectivityNodeId(row),
      ).filter((nodeId) => nodeId.length > 0));
      const supplementalRows = bootstrapRows.filter((row) => {
        const nodeId = this.resolveMeshConnectivityNodeId(row);
        return nodeId.length > 0 && !cacheNodeIds.has(nodeId);
      });
      const supplementalNodeIds = supplementalRows.map((row) =>
        this.resolveMeshConnectivityNodeId(row),
      );
      return {
        rows: supplementalRows,
        nodeIds: supplementalNodeIds,
      };
    },

    /**
     * Resolve node rows used for mesh connectivity.
     * @return {{source: string, rows: Object[]}}
     */
    resolveMeshConnectivityNodeRows() {
      const bootstrapActiveNodeIds = new Set(
        this.resolveBootstrapTopologySnapshotActiveNodeIds(),
      );
      const bootstrapResponse = this.delegates.getBootstrapResponse();
      const bootstrapRows = this.resolveBootstrapMeshConnectivityNodeRows(
        bootstrapResponse,
        bootstrapActiveNodeIds,
      );
      const systemTableCache =
        NodeService.getInstance().getSystemTableCache();
      let cacheRows = [];
      if (
        systemTableCache &&
        typeof systemTableCache.getAll === 'function'
      ) {
        cacheRows =
          (systemTableCache.getAll(TABLES.NODES) || []).filter((row) => {
            return this.isMeshEligibleNodeRow(row);
          });
      }

      const bootstrapSupplement =
        this.resolveBootstrapMeshConnectivitySupplement(
          cacheRows,
          bootstrapRows,
        );
      return selectMeshConnectivityRows({
        cacheRows,
        bootstrapRows,
        supplementalBootstrapRows: bootstrapSupplement.rows,
        bootstrapSupplementNodeIds: bootstrapSupplement.nodeIds,
      });
    },

    /**
     * Build a stable mesh-membership signature for connection reconciliation.
     * @param {Array<Object>} nodeRows
     * @return {string}
     */
    buildClusterMeshSignature(nodeRows) {
      if (!Array.isArray(nodeRows) || nodeRows.length === 0) {
        return '';
      }

      const members = nodeRows
        .map((row) => {
          const nodeId = this.resolveMeshConnectivityNodeId(row);
          if (
            nodeId.length === 0 ||
            nodeId === this.nodeId ||
            !this.isMeshEligibleNodeRow(row)
          ) {
            return null;
          }
          const nodeAddress = String(
            row?.[COLUMN.NODE_ADDRESS] ||
              row?.node_address ||
              row?.nodeAddress ||
              '',
          );
          const lifecycleSignature =
            this.resolveMeshConnectivityLifecycleTokens(row)
              .sort()
              .join('+');
          return `${nodeId}|${nodeAddress}|${lifecycleSignature}`;
        })
        .filter(Boolean)
        .sort();

      return members.join(LOCAL_STR_COMMA);
    },

    /**
     * Determine whether steady-state READY heartbeats need mesh reconciliation.
     * @return {boolean}
     */
    shouldReconnectClusterMesh() {
      const messageRouter = this.delegates.getMessageRouter();
      if (!messageRouter) {
        return false;
      }

      const {rows: nodesSnapshot} = this.resolveMeshConnectivityNodeRows();
      if (
        !Array.isArray(nodesSnapshot) ||
        nodesSnapshot.length === 0
      ) {
        return false;
      }

      const signature = this.buildClusterMeshSignature(nodesSnapshot);
      if (signature !== this.lastClusterMeshSignature) {
        return true;
      }

      const hasConnectionState =
        typeof messageRouter.getConnectionState === 'function';
      if (!hasConnectionState) {
        return false;
      }

      return nodesSnapshot.some((node) => {
        const nodeId = this.resolveMeshConnectivityNodeId(node);
        return nodeId.length > 0 &&
          nodeId !== this.nodeId &&
          !meshConnectedOrInFlightStates.has(
            messageRouter.getConnectionState(nodeId),
          );
      });
    },
  };
}

export {createJoinReadinessMeshConnectivityMethods};
