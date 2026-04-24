import { CLUSTER_SEGMENT_5 } from "./cluster-segment-5.js";
const {
  CLUSTER_READINESS_MODE_STARTUP,
  CLUSTER_STAGE_SETUP_CLUSTER_ACTIVE,
  CLUSTER_STAGE_SETUP_CLUSTER_WAITING_ACTIVE,
  CLUSTER_STAGE_SETUP_SEED_BOOTSTRAP_READY,
  CLUSTER_STAGE_SETUP_SEED_BOOTSTRAP_WAITING,
  STARTUP_GATE_STATE,
} = CLUSTER_SEGMENT_5;

/**
 * Distribute node indices across Docker hosts in round-robin
 * fashion, respecting the nodesPerHost limit.
 */
function distributeNodes(size, providers, nodesPerHost) {
  const hostCount = providers.length;
  const perHostCount = new Array(hostCount).fill(0);
  const assignment = [];

  let hostIdx = 0;
  for (let i = 0; i < size; i++) {
    let assigned = false;
    for (let attempt = 0; attempt < hostCount; attempt++) {
      const candidate = (hostIdx + attempt) % hostCount;
      if (perHostCount[candidate] < nodesPerHost) {
        assignment.push(candidate);
        perHostCount[candidate]++;
        hostIdx = (candidate + 1) % hostCount;
        assigned = true;
        break;
      }
    }
    if (!assigned) {
      break;
    }
  }

  return assignment;
}

/**
 * Unified startup readiness gate.
 * Drives startup readiness through deterministic states:
 * seed_live -> seed_join_ready -> cluster_active.
 */
class StartupGate {
  /**
   * @param {Cluster} cluster
   * @param {NodeHandle} seedNode
   * @param {string} seedNodeId
   */
  constructor(cluster, seedNode, seedNodeId) {
    this._cluster = cluster;
    this._seedNode = seedNode;
    this._seedNodeId = seedNodeId;
    this._state = STARTUP_GATE_STATE.SEED_LIVE;
  }

  getState() {
    return this._state;
  }

  /**
   * Wait until seed bootstrap endpoint is join-ready.
   * @returns {Promise<void>}
   */
  async waitForSeedJoinReady() {
    this._cluster._recordClusterStage(
      CLUSTER_STAGE_SETUP_SEED_BOOTSTRAP_WAITING,
      {
        nodeId: this._seedNodeId,
        startupGateState: this._state,
      },
    );
    await this._cluster._waitForBootstrapApi(this._seedNode);
    this._state = STARTUP_GATE_STATE.SEED_JOIN_READY;
    this._cluster._recordClusterStage(
      CLUSTER_STAGE_SETUP_SEED_BOOTSTRAP_READY,
      {
        nodeId: this._seedNodeId,
        startupGateState: this._state,
      },
    );
  }

  /**
   * Wait until all cluster nodes are ACTIVE.
   * @param {number} expectedNodeCount
   * @returns {Promise<void>}
   */
  async waitForClusterActive(expectedNodeCount) {
    if (this._state !== STARTUP_GATE_STATE.SEED_JOIN_READY) {
      throw new Error(
        "Startup gate state violation: expected " +
          STARTUP_GATE_STATE.SEED_JOIN_READY +
          " before cluster-active wait, got " +
          this._state,
      );
    }

    this._cluster._recordClusterStage(
      CLUSTER_STAGE_SETUP_CLUSTER_WAITING_ACTIVE,
      {
        expectedNodeCount,
        startupGateState: this._state,
      },
    );
    const activeGate = await this._cluster._waitForAllActive({
      mode: CLUSTER_READINESS_MODE_STARTUP,
    });
    this._state = STARTUP_GATE_STATE.CLUSTER_ACTIVE;
    this._cluster._recordClusterStage(CLUSTER_STAGE_SETUP_CLUSTER_ACTIVE, {
      nodeCount: this._cluster._nodes.size,
      startupGateState: this._state,
      ...(activeGate ? {activeGate} : {}),
    });
  }
}

export const CLUSTER_SEGMENT_6 = {
  ...CLUSTER_SEGMENT_5,
  distributeNodes,
  StartupGate,
};
