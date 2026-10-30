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

function resolveTopologyOptions(options) {
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
  return {
    topologyProfile,
    coordinatorPlacement,
    intraIslandRttMs,
    interIslandRttMs,
    intraOneWay: intraIslandRttMs / 2,
    interOneWay: interIslandRttMs / 2,
    isSingleZone: topologyProfile === SCENARIO_B_TOPOLOGY_PROFILE.SINGLE_ZONE_RF3,
  };
}

function buildTopologyNodes(isSingleZone) {
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
  return {latencyGroups, nodes: Object.freeze(nodes)};
}

function resolveCoordinatorNodes(coordinatorPlacement, isSingleZone, nodes) {
  if (coordinatorPlacement === SCENARIO_B_COORDINATOR_PLACEMENT.COLOCATED_LAGRANGE) {
    return {
      coordinatorNodes: Object.freeze(arrayMap(nodes, (n) => n.nodeId)),
      distributedCoordinatorFairnessSatisfied: true,
    };
  }
  if (
    coordinatorPlacement === SCENARIO_B_COORDINATOR_PLACEMENT.DISTRIBUTED_ISLAND_TIDB_COORDINATORS
  ) {
    return {
      coordinatorNodes: Object.freeze(isSingleZone ? ['node-1'] : ['node-1', 'node-3', 'node-5']),
      distributedCoordinatorFairnessSatisfied: true,
    };
  }
  return {
    coordinatorNodes: Object.freeze(['node-1']),
    distributedCoordinatorFairnessSatisfied: isSingleZone,
  };
}

function buildNetemLink(fromGroup, toGroup, delays) {
  const crossIsland = fromGroup !== toGroup;
  const oneWayDelayMs = crossIsland ? delays.interOneWay : delays.intraOneWay;
  const rttMs = crossIsland ? delays.interIslandRttMs : delays.intraIslandRttMs;
  const intraSpec = delays.intraIslandRttMs === 0.4 ? 'delay 0.2ms' : `delay ${delays.intraOneWay}ms`;
  const tcNetemSpec = crossIsland ? `delay ${delays.interOneWay}ms` : intraSpec;
  return Object.freeze({
    fromGroup, toGroup, crossIsland, oneWayDelayMs, rttMs, tcNetemSpec,
  });
}

function buildNetemMatrix(latencyGroups, delays) {
  const matrix = [];
  for (let i = 0; i < latencyGroups.length; i += 1) {
    for (let j = 0; j < latencyGroups.length; j += 1) {
      const fromGroup = latencyGroups[i];
      const toGroup = latencyGroups[j];
      const link = buildNetemLink(fromGroup, toGroup, delays);
      arrayPush(matrix, link);
      matrix[`${fromGroup}->${toGroup}`] = link;
    }
  }
  return Object.freeze(matrix);
}

export function buildScenarioBLatencyGroupTopology(options = {}) {
  const opts = resolveTopologyOptions(options);
  const {latencyGroups, nodes} = buildTopologyNodes(opts.isSingleZone);
  const {
    coordinatorNodes,
    distributedCoordinatorFairnessSatisfied,
  } = resolveCoordinatorNodes(opts.coordinatorPlacement, opts.isSingleZone, nodes);
  const netemLinkMatrix = buildNetemMatrix(latencyGroups, opts);

  return Object.freeze({
    topologyProfile: opts.topologyProfile,
    coordinatorPlacement: opts.coordinatorPlacement,
    replicationFactor: 3,
    nodeCount: nodes.length,
    latencyGroupCount: latencyGroups.length,
    latencyGroups,
    nodes,
    coordinatorNodes,
    distributedCoordinatorFairnessSatisfied,
    netemLinkMatrix,
    interGroupOneWayDelayMs: opts.isSingleZone ? 0 : opts.interOneWay,
    intraGroupOneWayDelayMs: opts.intraOneWay,
    intraIslandRttMs: opts.intraIslandRttMs,
    interIslandRttMs: opts.interIslandRttMs,
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

function resolveDecisionCostParams(options) {
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

  return {
    topology,
    topologyProfile,
    coordinatorPlacement,
    shape,
    stageCount,
    candidateRowsPerStage,
    rowBytes,
    decisionPayloadBytes,
    isSingleZone,
  };
}

function resolveOneWayDelayMs(topology, isSingleZone) {
  if (typeof topology.interGroupOneWayDelayMs === 'number' && !isSingleZone) {
    return topology.interGroupOneWayDelayMs;
  }
  return (topology.interIslandRttMs || 12) / 2;
}

function resolveRemoteStages(shape, stageCount) {
  if (shape === 'local-only') return 0;
  if (shape === 'one-remote-stage') return 1;
  return Math.max(1, stageCount - 1);
}

function computePlacementCost(placement, shape, remoteStages, context) {
  const {candidateRowsPerStage, rowBytes, decisionPayloadBytes, oneWayDelayMs} = context;
  if (placement === SCENARIO_B_COORDINATOR_PLACEMENT.COLOCATED_LAGRANGE) {
    if (shape === 'local-only') return {hops: 0, bytes: 0, delayMs: 0};
    const hops = remoteStages;
    return {hops, bytes: remoteStages * 96, delayMs: hops * oneWayDelayMs};
  }
  if (placement === SCENARIO_B_COORDINATOR_PLACEMENT.DISTRIBUTED_ISLAND_TIDB_COORDINATORS) {
    if (shape === 'local-only') return {hops: 0, bytes: 0, delayMs: 0};
    const hops = remoteStages * 2;
    const bytes = remoteStages * (candidateRowsPerStage * rowBytes);
    return {hops, bytes, delayMs: hops * oneWayDelayMs};
  }
  if (placement === SCENARIO_B_COORDINATOR_PLACEMENT.CENTRALIZED_TIDB_COORDINATOR) {
    if (shape === 'local-only') {
      return {hops: 1, bytes: decisionPayloadBytes, delayMs: oneWayDelayMs};
    }
    const hops = remoteStages * 2 + 1;
    const stageBatchBytes = remoteStages * (candidateRowsPerStage * rowBytes);
    const bytes = stageBatchBytes + decisionPayloadBytes;
    return {hops, bytes, delayMs: hops * oneWayDelayMs};
  }
  return {hops: 0, bytes: 0, delayMs: 0};
}

function computeCrossIslandDecisionCost(params, remoteStages, oneWayDelayMs) {
  if (params.isSingleZone) {
    return {crossIslandHops: 0, crossIslandBytesTransferred: 0, estimatedNetworkDelayMs: 0};
  }
  const cost = computePlacementCost(params.coordinatorPlacement, params.shape, remoteStages, {
    candidateRowsPerStage: params.candidateRowsPerStage,
    rowBytes: params.rowBytes,
    decisionPayloadBytes: params.decisionPayloadBytes,
    oneWayDelayMs,
  });
  return {
    crossIslandHops: cost.hops,
    crossIslandBytesTransferred: cost.bytes,
    estimatedNetworkDelayMs: cost.delayMs,
  };
}

export function evaluateScenarioBLatencyGroupDecisionCost(options = {}) {
  const params = resolveDecisionCostParams(options);
  const oneWayDelayMs = resolveOneWayDelayMs(params.topology, params.isSingleZone);
  const remoteStages = resolveRemoteStages(params.shape, params.stageCount);
  const cost = computeCrossIslandDecisionCost(params, remoteStages, oneWayDelayMs);

  return Object.freeze({
    topologyProfile: params.topologyProfile,
    coordinatorPlacement: params.coordinatorPlacement,
    shape: params.shape,
    distributedCoordinatorFairnessSatisfied:
      params.topology.distributedCoordinatorFairnessSatisfied,
    crossIslandHops: cost.crossIslandHops,
    crossIslandBytesTransferred: cost.crossIslandBytesTransferred,
    estimatedNetworkDelayMs: cost.estimatedNetworkDelayMs,
    compactFinalDecisionBytes: params.decisionPayloadBytes,
  });
}
