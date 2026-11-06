import {copyDenseOwnDataRecordArray} from '../utils/strict-own-data.js';
import {SERVE_ELIGIBILITY_STATE} from '../control-plane/serve-eligibility-owner.js';
import {indexCommittedNodeRows} from '../control-plane/committed-node-rows.js';
import {
  NODE_LIVENESS_SEMANTIC_STATE,
  normalizeSemanticNowMs,
  projectNodeLivenessSemantics,
} from '../control-plane/node-liveness-semantic-projection.js';

const MapConstructor = Map;
const mapPrototypeGet = Function.call.bind(Map.prototype.get);
const mapPrototypeSet = Function.call.bind(Map.prototype.set);
const mapPrototypeKeys = Function.call.bind(Map.prototype.keys);
const arrayFrom = Array.from;
const arrayPrototypeSort = Function.call.bind(Array.prototype.sort);
const arrayPrototypePush = Function.call.bind(Array.prototype.push);
const objectFreeze = Object.freeze;
const jsonStringify = JSON.stringify;

const COMMITTED_NODE_FLOOR_REASON = objectFreeze({
  OWNER_UNAVAILABLE: 'committed_node_owner_unavailable',
  READ_UNAVAILABLE: 'committed_node_read_unavailable',
  ROWS_UNAVAILABLE: 'committed_node_rows_unavailable',
  TIME_UNAVAILABLE: 'committed_node_time_unavailable',
  REFERENCED_NODE_UNAVAILABLE: 'committed_referenced_node_unavailable',
});
const EMPTY_NODE_LEVEL = objectFreeze([]);

function unavailable(reason) {
  return objectFreeze({state: SERVE_ELIGIBILITY_STATE.UNAVAILABLE, reason,
    nodeSemanticsById: null, level: EMPTY_NODE_LEVEL});
}

function hasKnownNodeLiveness(projection) {
  return projection?.statusSemantics.valid === true &&
    projection.leaseSemantics.state !== NODE_LIVENESS_SEMANTIC_STATE.UNKNOWN &&
    projection.leaseSemantics.state !== NODE_LIVENESS_SEMANTIC_STATE.INVALID;
}

// A synchronous sample of the existing committed answer. For wakes this is
// comparison state only. A floor evaluation always refreshes through the owner
// first, then captures its clock; no saved sample grants a later effect.
function sampleCommittedNodeFloor(owner) {
  const service = owner.controlPlaneReadinessService;
  if (typeof service?.answerCommittedNodes !== 'function') {
    return unavailable(COMMITTED_NODE_FLOOR_REASON.OWNER_UNAVAILABLE);
  }
  let nowMs;
  try {
    nowMs = normalizeSemanticNowMs(owner.resolveTimeoutCheckNowMs());
  } catch (error) {
    return objectFreeze({...unavailable(COMMITTED_NODE_FLOOR_REASON.TIME_UNAVAILABLE),
      error});
  }
  const answer = service.answerCommittedNodes();
  if (answer?.state !== SERVE_ELIGIBILITY_STATE.READY) {
    return unavailable(COMMITTED_NODE_FLOOR_REASON.READ_UNAVAILABLE);
  }
  const nodes = indexCommittedNodeRows(answer.nodeRows);
  if (nodes === null || nodes.size === 0) {
    return unavailable(COMMITTED_NODE_FLOOR_REASON.ROWS_UNAVAILABLE);
  }
  const nodeSemanticsById = new MapConstructor();
  const level = [];
  const nodeIds = arrayPrototypeSort(arrayFrom(mapPrototypeKeys(nodes)));
  for (let index = 0; index < nodeIds.length; index++) {
    const nodeId = nodeIds[index];
    const {projection} = projectNodeLivenessSemantics({
      nodeRow: mapPrototypeGet(nodes, nodeId), nowMs,
    });
    mapPrototypeSet(nodeSemanticsById, nodeId, projection);
    arrayPrototypePush(level, [nodeId, projection.statusSemantics.state,
      projection.leaseSemantics.state, projection.readyNow]);
  }
  return objectFreeze({state: SERVE_ELIGIBILITY_STATE.READY,
    nodeSemanticsById, level});
}

async function readCommittedNodeFloor(owner, replicaRows) {
  const service = owner.controlPlaneReadinessService;
  if (typeof service?.readServeEligibility !== 'function') {
    return unavailable(COMMITTED_NODE_FLOOR_REASON.OWNER_UNAVAILABLE);
  }
  try {
    await service.readServeEligibility();
  } catch (error) {
    return objectFreeze({...unavailable(COMMITTED_NODE_FLOOR_REASON.READ_UNAVAILABLE),
      error});
  }
  const sample = sampleCommittedNodeFloor(owner);
  if (sample.state !== SERVE_ELIGIBILITY_STATE.READY) return sample;
  const references = copyDenseOwnDataRecordArray(replicaRows);
  if (references === null || references.length === 0) {
    return unavailable(COMMITTED_NODE_FLOOR_REASON.REFERENCED_NODE_UNAVAILABLE);
  }
  // Every returned replica is a required reference, including a malformed
  // source. Never filter it away into the non-countable-source SAFE branch.
  // Operation sourceNodeId names the initiator for ordinary REMOVE; it is
  // not an additional voter in this partition's floor.
  for (let index = 0; index < references.length; index++) {
    const projection = mapPrototypeGet(sample.nodeSemanticsById, references[index].node_id);
    if (!hasKnownNodeLiveness(projection)) {
      return unavailable(COMMITTED_NODE_FLOOR_REASON.REFERENCED_NODE_UNAVAILABLE);
    }
  }
  return sample;
}

function committedNodeFloorLevel(owner) {
  const sample = sampleCommittedNodeFloor(owner);
  return jsonStringify([sample.state, sample.reason ?? null, sample.level]);
}

export {readCommittedNodeFloor, committedNodeFloorLevel};
