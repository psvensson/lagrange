import {COLUMN, STATE, TABLES} from '../constants/index.js';
import {TRANSPORT_EVENT} from '../constants/transport.js';
import {NodeLivenessSemanticProjectionOwner} from
  './node-liveness-semantic-projection-owner.js';
import {copyStrictOwnDataRecord} from '../utils/strict-own-data.js';
import {compareNodeHeartbeatWatermarks} from
  '../node/node-readiness-policy.js';

const arrayPrototypeIncludes = Function.call.bind(Array.prototype.includes);
const objectDefineProperties = Object.defineProperties;
const objectEntries = Object.entries;
const objectFromEntries = Object.fromEntries;
const objectFreeze = Object.freeze;

const CONNECTED_TRANSPORT_STATE = String(STATE.CONNECTED).toLowerCase();
const NODE_LIVENESS_TRANSPORT_EVENTS = objectFreeze([
  TRANSPORT_EVENT.CONNECTION_ESTABLISHED,
  TRANSPORT_EVENT.CONNECTION_CLOSED,
  TRANSPORT_EVENT.NODE_CONNECTED,
]);

const LIVENESS_SOURCE_TABLES = objectFreeze([
  TABLES.NODES,
  TABLES.SERVICES,
  TABLES.NODE_ENDPOINTS,
]);

const controlPlaneReadinessNodeLivenessMethods = {
  refreshNodeLivenessSourceSubscriptions() {
    unsubscribeNodeLivenessTransportSource(this);
    const router = this.messageRouter;
    if (!router || typeof router.on !== 'function') return;
    const listener = (event = {}) => {
      const nodeId = typeof event.nodeId === 'string' ? event.nodeId : '';
      if (nodeId) {
        this.nodeLivenessSemanticProjectionOwner
          ?.recordNodeSourceChange(nodeId);
      }
    };
    for (let index = 0; index < NODE_LIVENESS_TRANSPORT_EVENTS.length;
      index += 1) {
      router.on(NODE_LIVENESS_TRANSPORT_EVENTS[index], listener);
    }
    this.nodeLivenessTransportSource = router;
    this.nodeLivenessTransportSourceListener = listener;
  },

  shutdownNodeLivenessSemanticProjectionOwner() {
    unsubscribeNodeLivenessTransportSource(this);
    this.nodeLivenessSemanticProjectionOwner?.shutdown();
  },

  projectNodeLiveness(nodeId, nowMs = this.now()) {
    return this.nodeLivenessSemanticProjectionOwner?.projectNodeLiveness(
      nodeId,
      nowMs,
    ) || null;
  },

  buildNodeLivenessSourceEvidence(nodeId, nodeRow = this.getNodeRow(nodeId)) {
    const transport = this.getNodeTransportState(nodeId, nodeRow);
    const reporter = nodeId === this.nodeId ?
      this.getHeartbeatPublicationDiagnostics() : null;
    return {
      localReporterConsecutiveFailures: reporter?.consecutiveFailures,
      localReporterLastFailureAtMs: reporter?.lastFailureAtMs,
      localReporterLastFailureStage: reporter?.lastFailureStage,
      localReporterLastSuccessAtMs: reporter?.lastSuccessAtMs,
      localReporterPublicationPath: reporter?.publicationPath,
      nodeRow,
      rowConnectionState: transport.rowState,
      routerConnectionState: transport.routerState,
      routerTransportConnected:
        transport.routerState === CONNECTED_TRANSPORT_STATE,
      transportConnected: transport.connected,
    };
  },

  projectNodeLivenessFromRow(nodeId, nodeRow, nowMs = this.now()) {
    return this.nodeLivenessSemanticProjectionOwner
      ?.projectNodeLivenessFromEvidence(
        nodeId,
        this.buildNodeLivenessSourceEvidence(nodeId, nodeRow),
        nowMs,
      ) || null;
  },

  getNodeLivenessGeneration(nodeId, nowMs = this.now()) {
    return this.nodeLivenessSemanticProjectionOwner
      ?.getNodeLivenessGeneration(nodeId, nowMs) || 0;
  },

  getNodeLivenessSemanticIdentity(nodeId, nowMs = this.now()) {
    return this.nodeLivenessSemanticProjectionOwner
      ?.getNodeLivenessSemanticIdentity(nodeId, nowMs) || null;
  },

  getNodeLivenessProjectionsSync(nodeRows = [], nowMs = this.now()) {
    return this.nodeLivenessSemanticProjectionOwner
      ?.getNodeLivenessProjections(nodeRows, nowMs) || objectFreeze({});
  },
};

function unsubscribeNodeLivenessTransportSource(service) {
  const router = service.nodeLivenessTransportSource;
  const listener = service.nodeLivenessTransportSourceListener;
  if (router && listener && typeof router.off === 'function') {
    for (let index = 0; index < NODE_LIVENESS_TRANSPORT_EVENTS.length;
      index += 1) {
      router.off(NODE_LIVENESS_TRANSPORT_EVENTS[index], listener);
    }
  }
  service.nodeLivenessTransportSource = null;
  service.nodeLivenessTransportSourceListener = null;
}

function createNodeLivenessSemanticProjectionOwner(service, options = {}) {
  return options.nodeLivenessSemanticProjectionOwner ||
    new NodeLivenessSemanticProjectionOwner({
      localNodeId: service.nodeId,
      timeSource: service.timeSource,
      now: service.now,
      setTimeoutFn: service.setTimeoutFn,
      clearTimeoutFn: service.clearTimeoutFn,
      thresholds: {
        clusterMemberStaleHeartbeatMs:
          service.clusterMemberStaleHeartbeatMaxAgeMs,
        repairStaleHeartbeatMs:
          service.authoritativeReadinessRepairStaleHeartbeatMaxAgeMs,
      },
      readNodeEvidence: (nodeId) =>
        service.buildNodeLivenessSourceEvidence(nodeId),
    });
}

function installControlPlaneReadinessNodeLivenessMethods(prototype) {
  objectDefineProperties(
    prototype,
    objectFromEntries(
      objectEntries(controlPlaneReadinessNodeLivenessMethods)
        .map(([name, value]) => [name, {
          configurable: true,
          value,
          writable: true,
        }]),
    ),
  );
}

function buildStoredLivenessNodeRow(snapshot) {
  const evidence = snapshot.nodeEvidence || {};
  const nodeRow = {
    [COLUMN.NODE_ID]: snapshot.nodeId || null,
    [COLUMN.STATUS]: evidence.status,
    [COLUMN.CONNECTION_STATE]: evidence.rowConnectionState,
    [COLUMN.LAST_HEARTBEAT]: evidence.lastHeartbeat,
  };
  if (Number.isFinite(evidence.readyLeaseExpiresAt) ||
      evidence.readyLeaseExplicitlyCleared === true) {
    nodeRow[COLUMN.READY_LEASE_EXPIRES_AT] =
      evidence.readyLeaseExpiresAt;
  }
  return nodeRow;
}

function matchesStoredNodeLiveness(snapshot, current) {
  if (!current) return false;
  const evidence = snapshot.nodeEvidence || {};
  const dimensions = snapshot.dimensions || {};
  return evidence.readyNow === current.readyNow &&
    evidence.clusterMemberHeartbeatFreshness ===
      current.heartbeatFreshness.clusterMembership &&
    evidence.repairHeartbeatFreshness === current.repairFreshness.state &&
    evidence.derivationGraceActive === current.derivationGraceActive &&
    dimensions.clusterMemberHealthy ===
      current.clusterMembershipSemantics.healthy;
}

function shouldUseStoredLivenessRow(snapshot, storedRow, currentRow) {
  if (!currentRow) return false;
  const evidence = snapshot.nodeEvidence || {};
  const currentStatus = currentRow[COLUMN.STATUS] ?? currentRow.status ?? null;
  const currentConnection = currentRow[COLUMN.CONNECTION_STATE] ??
    currentRow.connection_state ?? null;
  if (currentStatus !== (evidence.status ?? null) ||
      currentConnection !== (evidence.rowConnectionState ?? null)) {
    return false;
  }
  return compareNodeHeartbeatWatermarks(currentRow, storedRow) > 0;
}

function isStoredNodeLivenessCurrent(service, snapshot, nowMs) {
  const owner = service.nodeLivenessSemanticProjectionOwner;
  if (!owner || !snapshot) return false;
  const storedRow = buildStoredLivenessNodeRow(snapshot);
  const currentRow = service.getNodeRow(snapshot.nodeId);
  const nodeRow = shouldUseStoredLivenessRow(
    snapshot,
    storedRow,
    currentRow,
  ) ? storedRow : currentRow;
  const current = owner.projectNodeLivenessFromEvidence(
    snapshot.nodeId || null,
    service.buildNodeLivenessSourceEvidence(snapshot.nodeId, nodeRow),
    nowMs,
  );
  return matchesStoredNodeLiveness(snapshot, current);
}

function recordNodeLivenessSourceChange(service, tableName, record) {
  if (!arrayPrototypeIncludes(LIVENESS_SOURCE_TABLES, tableName)) return;
  const source = copyStrictOwnDataRecord(record) || {};
  const candidateNodeId = source[COLUMN.NODE_ID] ?? source.node_id ?? '';
  const changedNodeId = typeof candidateNodeId === 'string' ?
    candidateNodeId : '';
  if (changedNodeId) {
    service.nodeLivenessSemanticProjectionOwner
      ?.recordNodeSourceChange(changedNodeId);
    return;
  }
  service.nodeLivenessSemanticProjectionOwner?.recordAllSourceChanges();
}

export {
  createNodeLivenessSemanticProjectionOwner,
  installControlPlaneReadinessNodeLivenessMethods,
  isStoredNodeLivenessCurrent,
  recordNodeLivenessSourceChange,
};
