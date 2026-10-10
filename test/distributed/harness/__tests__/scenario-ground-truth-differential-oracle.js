/**
 * Differential oracle for the ground-truth split/spread claims: the OLD
 * single-readback gates (settled-state filter, leader node ids, replica
 * node ids), re-stated verbatim from the pre-ground-truth scenarios, and
 * a seeded generator of random topologies biased towards near-truthful
 * shapes so every claim passes on some of them. A gate may only become
 * stricter: wherever the new claim passes, the old gate must have passed.
 */

// Module-load captures — the harness tree's ambient-intrinsics rule.
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySome = Function.call.bind(Array.prototype.some);
const stringToLowerCase = Function.call.bind(String.prototype.toLowerCase);
const setHas = Function.call.bind(Set.prototype.has);

const DIFFERENTIAL_SEED = 0x5eed2026;
const DIFFERENTIAL_TOPOLOGY_COUNT = 4000;
const NODE_IDS = Object.freeze(['n0', 'n1', 'n2', 'n3', 'n4']);
const TRANSITIONAL_STATES = Object.freeze(new Set(['splitting', 'merging']));
const MIN_PARTITIONS = 2;
const MIN_DISTINCT = 2;

function lower(value) {
  return stringToLowerCase(String(value || ''));
}

function settled(rows) {
  return arrayFilter(rows, (row) => !setHas(TRANSITIONAL_STATES, lower(row?.state)));
}

function leaderNodeIds(rows) {
  return new Set(arrayFilter(arrayMap(rows, (row) => row?.leader_node_id),
    (id) => typeof id === 'string' && id.length > 0));
}

// public-path waitForSplitAndLeaderSpread / user-table waitForLeaderSpread.
function oldLeaderSpread(rows) {
  const current = settled(rows);
  return current.length >= MIN_PARTITIONS &&
    leaderNodeIds(current).size >= MIN_DISTINCT &&
    rows.length === current.length;
}

// user-table waitForManagedSplit.
function oldManagedSplit(rows) {
  const current = settled(rows);
  return current.length >= MIN_PARTITIONS && rows.length === current.length;
}

// user-table waitForReplicaSpreadSupport (every services row, node ids).
function oldReplicaSpread(rows, services) {
  const current = settled(rows);
  if (current.length < MIN_PARTITIONS) {
    return false;
  }
  return !arraySome(current, (row) => new Set(arrayMap(arrayFilter(services,
    (service) => service.partition_id === row.partition_id &&
      typeof service.node_id === 'string' && service.node_id.length > 0),
  (service) => service.node_id)).size < MIN_DISTINCT);
}

const OLD_GATE_BY_CLAIM = Object.freeze({
  leaderSpread: (topology) => oldLeaderSpread(topology.partitions),
  managedSplit: (topology) => oldManagedSplit(topology.partitions),
  publicPathSpread: (topology) => oldLeaderSpread(topology.partitions),
  replicaSpread: (topology) =>
    oldReplicaSpread(topology.partitions, topology.services),
});

function oldGatePasses(claimName, topology) {
  return OLD_GATE_BY_CLAIM[claimName](topology);
}

// Mulberry32, seeded per topology so any failing index replays alone.
function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(random, values) {
  return values[Math.floor(random() * values.length)];
}

function generateNodes(random) {
  const providers = 1 + Math.floor(random() * 4);
  return arrayMap(NODE_IDS, (id, index) => ({
    hostIdentity: random() < 0.03 ? null : {
      hostId: `host:p${index % providers}`,
      label: `p${index % providers}`,
      providerIndex: index % providers,
    },
    id,
  }));
}

function generateChildren(random, truthful) {
  const count = truthful ? 2 : pick(random, [0, 1, 2, 2, 3]);
  const bounds = ['30.0', '60.0'];
  const children = [];
  for (let index = 0; index < count; index += 1) {
    children.push({
      leader_node_id: random() < 0.9 ? pick(random, NODE_IDS) : null,
      partition_id: `t_c${index}`,
      partition_key_end: index === count - 1 ? null : bounds[index],
      partition_key_start: index === 0 ? null : bounds[index - 1],
      partition_version: truthful ? 2 : pick(random, [2, 2, 2, 1]),
      replica_count: truthful ? 3 : pick(random, [3, 3, 2, null]),
      state: truthful && random() < 0.8 ? 'NORMAL' :
        pick(random, ['NORMAL', 'normal', 'SPLITTING', 'merging']),
      table_id: 't',
    });
  }
  return children;
}

function generateServices(random, partitions, truthful) {
  const services = [];
  for (const partition of partitions) {
    for (const nodeId of NODE_IDS) {
      if (random() >= (truthful ? 0.62 : 0.6)) {
        continue;
      }
      services.push({
        node_id: nodeId,
        partition_id: partition.partition_id,
        raft_role: truthful && random() < 0.85 ? 'follower' :
          pick(random, ['follower', 'leader', 'candidate', 'learner', null]),
        replica_id: `${partition.partition_id}-${nodeId}`,
        service_type: 'partition',
        status: truthful && random() < 0.9 ? 'active' :
          pick(random, ['active', 'syncing', 'removing', 'pending', 'failed']),
      });
    }
  }
  return services;
}

/**
 * The index-th topology of the seeded differential corpus.
 * @param {number} index
 * @return {Object} {nodes, partitions, services, knownParentIds}
 */
function generateDifferentialTopology(index) {
  const random = seededRandom(DIFFERENTIAL_SEED + index);
  const truthful = random() < 0.5;
  const parentPresent = random() < (truthful ? 0.2 : 0.4);
  const parent = {
    leader_node_id: pick(random, NODE_IDS),
    partition_id: 't-p1',
    partition_key_end: null,
    partition_key_start: null,
    partition_version: 1,
    replica_count: 3,
    state: pick(random, ['normal', 'NORMAL', 'SPLITTING']),
    table_id: 't',
  };
  const children = generateChildren(random, truthful);
  const partitions = parentPresent ? [parent, ...children] : children;
  const services = generateServices(random, partitions, truthful);
  if (!parentPresent && random() < 0.3) {
    services.push(...generateServices(random, [parent], false));
  }
  return {
    knownParentIds: random() < 0.6 ? ['t-p1'] : [],
    nodes: generateNodes(random),
    partitions,
    services,
  };
}

function differentialTopologyCount() {
  return DIFFERENTIAL_TOPOLOGY_COUNT;
}

export {
  differentialTopologyCount,
  generateDifferentialTopology,
  oldGatePasses,
};
