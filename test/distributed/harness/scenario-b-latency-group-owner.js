const arrayFind = Function.call.bind(Array.prototype.find);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayPush = Function.call.bind(Array.prototype.push);
const arraySort = Function.call.bind(Array.prototype.sort);
const objectValues = Object.values;

export const SCENARIO_B_TOPOLOGY_PROFILE = Object.freeze({
  SINGLE_ZONE_RF3: 'single-zone-rf3',
  THREE_ISLAND_FIVE_NODE_RF3: 'three-island-five-node-rf3',
});

export const SCENARIO_B_COORDINATOR_PLACEMENT = Object.freeze({
  COLOCATED_LAGRANGE: 'colocated-lagrange',
  CENTRALIZED_TIDB_COORDINATOR: 'centralized-tidb-coordinator',
  DISTRIBUTED_ISLAND_TIDB_COORDINATORS: 'distributed-island-tidb-coordinators',
});

function resolveNodeGroup(nodes, nodeId) {
  if (nodes && typeof nodes === 'object') {
    if (nodes[nodeId]) {
      const entry = nodes[nodeId];
      return typeof entry === 'string' ? entry : (entry.latencyGroup || entry.group);
    }
    if (Array.isArray(nodes)) {
      const found = arrayFind(nodes, (n) => n.nodeId === nodeId || n.id === nodeId);
      if (found) return found.latencyGroup || found.group;
    }
  }
  throw new RangeError(`Unknown node: ${nodeId}`);
}

function resolveOneWayDelay(matrix, fromGroup, toGroup, intraDelay, interDelay) {
  const key = `${fromGroup}->${toGroup}`;
  if (matrix && typeof matrix === 'object') {
    if (matrix[key] && typeof matrix[key].oneWayDelayMs === 'number') {
      return matrix[key].oneWayDelayMs;
    }
    if (Array.isArray(matrix)) {
      const found = arrayFind(matrix, (l) => l.fromGroup === fromGroup && l.toGroup === toGroup);
      if (found && typeof found.oneWayDelayMs === 'number') return found.oneWayDelayMs;
    }
  }
  return fromGroup === toGroup ? intraDelay : interDelay;
}

export function buildScenarioBLatencyGroupTopology(options = {}) {
  const topologyProfile = options.topologyProfile ||
    SCENARIO_B_TOPOLOGY_PROFILE.THREE_ISLAND_FIVE_NODE_RF3;
  if (!arrayIncludes(objectValues(SCENARIO_B_TOPOLOGY_PROFILE), topologyProfile)) {
    throw new RangeError(`Unknown topologyProfile: ${topologyProfile}`);
  }
  const coordinatorPlacement = options.coordinatorPlacement ||
    SCENARIO_B_COORDINATOR_PLACEMENT.DISTRIBUTED_ISLAND_TIDB_COORDINATORS;
  if (!arrayIncludes(objectValues(SCENARIO_B_COORDINATOR_PLACEMENT), coordinatorPlacement)) {
    throw new RangeError(`Unknown coordinatorPlacement: ${coordinatorPlacement}`);
  }

  const intraIslandRttMs = typeof options.intraIslandRttMs === 'number' ?
    options.intraIslandRttMs : 0.4;
  const interIslandRttMs = typeof options.interIslandRttMs === 'number' ?
    options.interIslandRttMs : 12;
  const intraOneWay = intraIslandRttMs / 2;
  const interOneWay = interIslandRttMs / 2;
  const isSingleZone = topologyProfile === SCENARIO_B_TOPOLOGY_PROFILE.SINGLE_ZONE_RF3;

  const latencyGroups = Object.freeze(
    isSingleZone ? ['island-a'] : ['island-a', 'island-b', 'island-c'],
  );
  const nodeDefs = isSingleZone ?
    [['node-1', 'island-a'], ['node-2', 'island-a'], ['node-3', 'island-a']] :
    [
      ['node-1', 'island-a'], ['node-2', 'island-a'],
      ['node-3', 'island-b'], ['node-4', 'island-b'], ['node-5', 'island-c'],
    ];

  const nodes = [];
  for (let i = 0; i < nodeDefs.length; i += 1) {
    const [nodeId, latencyGroup] = nodeDefs[i];
    const n = Object.freeze({nodeId, latencyGroup, group: latencyGroup});
    arrayPush(nodes, n);
    nodes[nodeId] = n;
  }
  Object.freeze(nodes);

  let coordinatorNodes;
  let distributedCoordinatorFairnessSatisfied = true;
  if (coordinatorPlacement === SCENARIO_B_COORDINATOR_PLACEMENT.COLOCATED_LAGRANGE) {
    coordinatorNodes = Object.freeze(arrayMap(nodes, (n) => n.nodeId));
  } else if (
    coordinatorPlacement === SCENARIO_B_COORDINATOR_PLACEMENT.DISTRIBUTED_ISLAND_TIDB_COORDINATORS
  ) {
    coordinatorNodes = Object.freeze(isSingleZone ? ['node-1'] : ['node-1', 'node-3', 'node-5']);
  } else {
    coordinatorNodes = Object.freeze(['node-1']);
    distributedCoordinatorFairnessSatisfied = isSingleZone;
  }

  const matrix = [];
  for (let i = 0; i < latencyGroups.length; i += 1) {
    for (let j = 0; j < latencyGroups.length; j += 1) {
      const fromGroup = latencyGroups[i];
      const toGroup = latencyGroups[j];
      const crossIsland = fromGroup !== toGroup;
      const oneWayDelayMs = crossIsland ? interOneWay : intraOneWay;
      const rttMs = crossIsland ? interIslandRttMs : intraIslandRttMs;
      const intraSpec = intraIslandRttMs === 0.4 ? 'delay 0.2ms' : `delay ${intraOneWay}ms`;
      const tcNetemSpec = crossIsland ? `delay ${interOneWay}ms` : intraSpec;
      const link = Object.freeze({
        fromGroup, toGroup, crossIsland, oneWayDelayMs, rttMs, tcNetemSpec,
      });
      arrayPush(matrix, link);
      matrix[`${fromGroup}->${toGroup}`] = link;
    }
  }
  Object.freeze(matrix);

  return Object.freeze({
    topologyProfile, coordinatorPlacement, replicationFactor: 3, nodeCount: nodes.length,
    latencyGroupCount: latencyGroups.length, latencyGroups, nodes, coordinatorNodes,
    distributedCoordinatorFairnessSatisfied, netemLinkMatrix: matrix,
    interGroupOneWayDelayMs: isSingleZone ? 0 : interOneWay, intraGroupOneWayDelayMs: intraOneWay,
    intraIslandRttMs, interIslandRttMs,
  });
}

export function createScenarioBEdgeAccountingWindow(options = {}) {
  const topology = options.topology;
  if (!topology || typeof topology !== 'object' || !topology.nodes || !topology.latencyGroups) {
    throw new TypeError('topology must be an object with nodes and latencyGroups');
  }
  return {
    windowId: options.windowId || 'scenario-b-measure-window-1',
    topology,
    startedAtMs: typeof options.startedAtMs === 'number' ? options.startedAtMs : 0,
    closed: false,
    transfers: [],
  };
}

export function recordScenarioBShapedEdgeTransfer(windowState, transfer = {}) {
  if (!windowState || windowState.closed === true) {
    throw new Error('Accounting window is closed or invalid');
  }
  const fromGroup = resolveNodeGroup(windowState.topology.nodes, transfer.fromNodeId);
  const toGroup = resolveNodeGroup(windowState.topology.nodes, transfer.toNodeId);
  const crossIsland = fromGroup !== toGroup;
  const intraDelay = (windowState.topology.intraIslandRttMs || 0.4) / 2;
  const interDelay = (windowState.topology.interIslandRttMs || 12) / 2;
  const oneWayDelayMs = resolveOneWayDelay(
    windowState.topology.netemLinkMatrix, fromGroup, toGroup, intraDelay, interDelay,
  );

  const entry = Object.freeze({
    fromNodeId: transfer.fromNodeId, toNodeId: transfer.toNodeId,
    fromGroup, toGroup, directionKey: `${fromGroup}->${toGroup}`,
    crossIsland, packets: Number(transfer.packets ?? 1), bytes: Number(transfer.bytes ?? 0),
    oneWayDelayMs, phase: transfer.phase || 'stage-rpc',
  });
  arrayPush(windowState.transfers, entry);
  return entry;
}

export function closeScenarioBEdgeAccountingWindow(windowState, options = {}) {
  windowState.closed = true;
  const endedAtMs = typeof options.endedAtMs === 'number' ? options.endedAtMs : 1000;
  const completedRequests = typeof options.completedRequests === 'number' ? options.completedRequests : 1;

  let totalPackets = 0;
  let totalBytes = 0;
  let crossIslandPackets = 0;
  let crossIslandBytes = 0;
  let intraIslandPackets = 0;
  let intraIslandBytes = 0;
  const directionMap = Object.create(null);

  const transfers = windowState.transfers || [];
  for (let i = 0; i < transfers.length; i += 1) {
    const t = transfers[i];
    const pkts = Number(t.packets) || 0;
    const b = Number(t.bytes) || 0;
    totalPackets += pkts;
    totalBytes += b;
    if (t.crossIsland) {
      crossIslandPackets += pkts;
      crossIslandBytes += b;
    } else {
      intraIslandPackets += pkts;
      intraIslandBytes += b;
    }
    const key = t.directionKey;
    if (!directionMap[key]) {
      directionMap[key] = {
        directionKey: key, fromGroup: t.fromGroup, toGroup: t.toGroup,
        crossIsland: t.crossIsland, packets: 0, bytes: 0,
      };
    }
    directionMap[key].packets += pkts;
    directionMap[key].bytes += b;
  }

  const crossIslandBytesPerRequest = completedRequests > 0 ?
    crossIslandBytes / completedRequests : 0;
  const crossIslandPacketsPerRequest = completedRequests > 0 ?
    crossIslandPackets / completedRequests : 0;

  const dirKeys = Object.keys(directionMap);
  arraySort(dirKeys, (a, b) => (a < b ? -1 : (a > b ? 1 : 0)));
  const byDirection = Object.freeze(arrayMap(dirKeys, (k) => Object.freeze(directionMap[k])));

  return Object.freeze({
    windowId: windowState.windowId,
    durationMs: Math.max(0, endedAtMs - windowState.startedAtMs),
    completedRequests, totalPackets, totalBytes,
    crossIslandPackets, crossIslandBytes, intraIslandPackets, intraIslandBytes,
    crossIslandBytesPerRequest, crossIslandPacketsPerRequest, byDirection,
  });
}

export function evaluateScenarioBLatencyGroupDecisionCost(options = {}) {
  const topology = options.topology;
  if (!topology || typeof topology !== 'object') {
    throw new TypeError('options.topology is required');
  }
  const topologyProfile = topology.topologyProfile;
  if (!arrayIncludes(objectValues(SCENARIO_B_TOPOLOGY_PROFILE), topologyProfile)) {
    throw new RangeError(`Unknown topologyProfile: ${topologyProfile}`);
  }
  const coordinatorPlacement = topology.coordinatorPlacement;
  if (!arrayIncludes(objectValues(SCENARIO_B_COORDINATOR_PLACEMENT), coordinatorPlacement)) {
    throw new RangeError(`Unknown coordinatorPlacement: ${coordinatorPlacement}`);
  }

  const shape = options.shape || 'sequential';
  const stageCount = typeof options.stageCount === 'number' ? options.stageCount : 3;
  const candidateRowsPerStage = typeof options.candidateRowsPerStage === 'number' ?
    options.candidateRowsPerStage : 16;
  const rowBytes = typeof options.rowBytes === 'number' ? options.rowBytes : 256;
  const decisionPayloadBytes = typeof options.decisionPayloadBytes === 'number' ?
    options.decisionPayloadBytes : 384;
  const isSingleZone = topologyProfile === SCENARIO_B_TOPOLOGY_PROFILE.SINGLE_ZONE_RF3;

  const oneWayDelayMs = typeof topology.interGroupOneWayDelayMs === 'number' && !isSingleZone ?
    topology.interGroupOneWayDelayMs :
    ((topology.interIslandRttMs || 12) / 2);

  const remoteStages = shape === 'local-only' ?
    0 : (shape === 'one-remote-stage' ? 1 : Math.max(1, stageCount - 1));

  let crossIslandHops = 0;
  let crossIslandBytesTransferred = 0;
  let estimatedNetworkDelayMs = 0;

  if (isSingleZone) {
    crossIslandHops = 0;
    crossIslandBytesTransferred = 0;
    estimatedNetworkDelayMs = 0;
  } else if (coordinatorPlacement === SCENARIO_B_COORDINATOR_PLACEMENT.COLOCATED_LAGRANGE) {
    if (shape !== 'local-only') {
      crossIslandHops = remoteStages;
      crossIslandBytesTransferred = remoteStages * 96;
      estimatedNetworkDelayMs = crossIslandHops * oneWayDelayMs;
    }
  } else if (
    coordinatorPlacement === SCENARIO_B_COORDINATOR_PLACEMENT.DISTRIBUTED_ISLAND_TIDB_COORDINATORS
  ) {
    if (shape !== 'local-only') {
      crossIslandHops = remoteStages * 2;
      crossIslandBytesTransferred = remoteStages * (candidateRowsPerStage * rowBytes);
      estimatedNetworkDelayMs = crossIslandHops * oneWayDelayMs;
    }
  } else if (
    coordinatorPlacement === SCENARIO_B_COORDINATOR_PLACEMENT.CENTRALIZED_TIDB_COORDINATOR
  ) {
    if (shape === 'local-only') {
      crossIslandHops = 1;
      crossIslandBytesTransferred = decisionPayloadBytes;
      estimatedNetworkDelayMs = oneWayDelayMs;
    } else {
      crossIslandHops = remoteStages * 2 + 1;
      const stageBatchBytes = remoteStages * (candidateRowsPerStage * rowBytes);
      crossIslandBytesTransferred = stageBatchBytes + decisionPayloadBytes;
      estimatedNetworkDelayMs = crossIslandHops * oneWayDelayMs;
    }
  }

  return Object.freeze({
    topologyProfile, coordinatorPlacement, shape,
    distributedCoordinatorFairnessSatisfied: topology.distributedCoordinatorFairnessSatisfied,
    crossIslandHops, crossIslandBytesTransferred, estimatedNetworkDelayMs,
    compactFinalDecisionBytes: decisionPayloadBytes,
  });
}
