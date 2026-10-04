/**
 * Ground-truth primitives for scenario topology gates.
 *
 * A scenario gate decides on the fact it names and states what it
 * measured. The two facts every replica/leader/spread gate needs are
 * defined once here and imported, never re-derived per scenario:
 *
 * - an ACTIVE VOTER replica: a `services` row of a partition whose status
 *   is active and whose raft role is a voter role (leader, follower,
 *   candidate). Learners, syncing/pending/creating/removing/failed rows
 *   and rows with no published raft role are not active voters.
 * - a HOST: the Docker provider the harness placed the node on
 *   (`cluster._hostAssignment[nodeIndex]`, stamped on each NodeHandle as
 *   `hostIdentity` when the harness starts it). Two nodes on one provider
 *   are one host. A node id is never a host.
 *
 * What a gate built on these rows can and cannot see: the harness reads
 * the replicated `services` and `partitions` ROWS. No admin or diagnostic
 * read exposes the raft-rs ConfState (committed voters) per group, so a
 * gate here measures service rows, not committed raft membership, and its
 * record says so (MEMBERSHIP_EVIDENCE).
 */

import {SERVICE_STATUS} from '../../../src/constants/service-status.js';
import {SERVICE_TYPE} from '../../../src/constants/service.js';
import {isVoterRaftRole} from '../../../src/raft/replica-voter-readiness.js';

// Module-load captures (the harness tree's ambient-intrinsics rule).
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySome = Function.call.bind(Array.prototype.some);
const arraySort = Function.call.bind(Array.prototype.sort);
const stringToLowerCase = Function.call.bind(String.prototype.toLowerCase);
const setHas = Function.call.bind(Set.prototype.has);
const mapGet = Function.call.bind(Map.prototype.get);

const ZERO = 0;
const ONE = 1;

const HOST_AUTHORITY = 'harness_docker_provider_assignment';

const MEMBERSHIP_EVIDENCE = Object.freeze({
  committedMembershipObserved: false,
  source: 'services_rows',
  statement:
    'measured replicated services/partitions ROWS (status, raft_role, ' +
    'leader_node_id), not committed raft membership: no admin or ' +
    'diagnostic read exposes raft-rs ConfState voters per group',
});

const PARTITION_ROLE = Object.freeze({
  CHILD: 'child',
  PARENT: 'parent',
  UNSPLIT: 'unsplit',
});

// Named unmet facts (R07: a semantic outcome is a named state).
const UNMET_FACT = Object.freeze({
  CHILD_ACTIVE_VOTER_COUNT: 'child_active_voter_count_mismatch',
  CHILD_LEADER_MISSING: 'child_leader_missing',
  CHILD_LEADER_NOT_ACTIVE_VOTER: 'child_leader_not_active_voter',
  CHILD_REPLICA_HOSTS_INSUFFICIENT: 'child_replica_hosts_insufficient',
  CHILD_REPLICA_POLICY_UNKNOWN: 'child_replica_policy_unknown',
  CLUSTER_HOSTS_INSUFFICIENT: 'cluster_hosts_insufficient',
  HOST_IDENTITY_UNKNOWN: 'host_identity_unknown',
  LEADER_HOSTS_INSUFFICIENT: 'leader_hosts_insufficient',
  PARENT_NOT_DISSOLVED: 'parent_not_dissolved',
  SPLIT_CHILDREN_MISSING: 'split_children_missing',
});

function nonEmptyString(value) {
  return typeof value === 'string' && value.length > ZERO ? value : null;
}

function lowerCaseOrEmpty(value) {
  return typeof value === 'string' ? stringToLowerCase(value) : '';
}

/**
 * The one definition of an active voter replica row.
 * @param {Object} row A `services` row.
 * @return {boolean}
 */
function isActiveVoterReplicaRow(row) {
  const serviceType = nonEmptyString(row?.service_type);
  if (serviceType !== null &&
      lowerCaseOrEmpty(serviceType) !== SERVICE_TYPE.PARTITION) {
    return false;
  }
  return lowerCaseOrEmpty(row?.status) === SERVICE_STATUS.ACTIVE &&
    isVoterRaftRole(row?.raft_role);
}

function describeHostIdentity(node) {
  const identity = node?.hostIdentity;
  const hostId = nonEmptyString(identity?.hostId);
  if (hostId === null) {
    return null;
  }
  return {
    hostId,
    label: nonEmptyString(identity?.label) || hostId,
    providerIndex: Number.isInteger(identity?.providerIndex) ?
      identity.providerIndex :
      null,
  };
}

/**
 * Index the harness's node -> host authority for the cluster's nodes.
 * @param {Array<Object>} nodes Node handles (`id`, `hostIdentity`).
 * @return {Object} {authority, hostOf(nodeId), nodes, hostIds}
 */
function buildNodeHostIndex(nodes) {
  const byNodeId = new Map();
  const listed = [];
  for (const node of Array.isArray(nodes) ? nodes : []) {
    const nodeId = nonEmptyString(node?.id);
    if (nodeId === null) {
      continue;
    }
    const host = describeHostIdentity(node);
    byNodeId.set(nodeId, host);
    listed.push({host: host?.hostId ?? null, hostLabel: host?.label ?? null,
      nodeId});
  }
  const hostIds = new Set();
  for (const host of byNodeId.values()) {
    if (host !== null) {
      hostIds.add(host.hostId);
    }
  }
  return Object.freeze({
    authority: HOST_AUTHORITY,
    hostIds: arraySort([...hostIds]),
    hostOf: (nodeId) => mapGet(byNodeId, nodeId)?.hostId ?? null,
    labelOf: (nodeId) => mapGet(byNodeId, nodeId)?.label ?? null,
    nodes: listed,
  });
}

/**
 * The one definition of "distinct hosts" for a set of node ids.
 * @param {Array<string>} nodeIds
 * @param {Object} hostIndex From buildNodeHostIndex.
 * @return {{hosts: Array<string>, unknownNodeIds: Array<string>}}
 */
function countDistinctHosts(nodeIds, hostIndex) {
  const hosts = new Set();
  const unknownNodeIds = [];
  for (const nodeId of nodeIds) {
    const host = hostIndex.hostOf(nodeId);
    if (host === null) {
      unknownNodeIds.push(nodeId);
    } else {
      hosts.add(host);
    }
  }
  return {hosts: arraySort([...hosts]), unknownNodeIds};
}

function keyBound(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : String(value);
}

function lowerBoundWithin(inner, outer) {
  if (outer === null) {
    return true;
  }
  return inner !== null && inner >= outer;
}

function upperBoundWithin(inner, outer) {
  if (outer === null) {
    return true;
  }
  return inner !== null && inner <= outer;
}

function rangeWithin(inner, outer) {
  return lowerBoundWithin(
    keyBound(inner?.partition_key_start),
    keyBound(outer?.partition_key_start),
  ) && upperBoundWithin(
    keyBound(inner?.partition_key_end),
    keyBound(outer?.partition_key_end),
  );
}

function isSupersededBy(row, other) {
  return other !== row &&
    other?.table_id === row?.table_id &&
    Number(other?.partition_version) > Number(row?.partition_version) &&
    rangeWithin(other, row);
}

/**
 * Classify a table's partition rows: a row superseded by a higher-version
 * row covering part of its key range is a split PARENT (it lingers in
 * state NORMAL until dissolution); every other row is a current partition
 * (a CHILD once any split is observed, else UNSPLIT).
 * @param {Array<Object>} partitionRows
 * @param {Set<string>} knownParentIds Parents observed on earlier readbacks.
 * @return {{parents: Array<Object>, current: Array<Object>, splitObserved: boolean}}
 */
function classifySplitTopology(partitionRows, knownParentIds = new Set()) {
  const rows = arrayFilter(partitionRows, (row) =>
    nonEmptyString(row?.partition_id) !== null);
  const parents = arrayFilter(rows, (row) =>
    setHas(knownParentIds, row.partition_id) ||
    arraySome(rows, (other) => isSupersededBy(row, other)));
  const parentIds = new Set(arrayMap(parents, (row) => row.partition_id));
  const current = arrayFilter(rows, (row) => !setHas(parentIds, row.partition_id));
  const splitObserved = parents.length > ZERO || knownParentIds.size > ZERO ||
    arraySome(current, (row) => Number(row?.partition_version) > ONE);
  return {current, parentIds, parents, splitObserved};
}

function describeReplica(row, hostIndex) {
  return {
    activeVoter: isActiveVoterReplicaRow(row),
    host: hostIndex.hostOf(row?.node_id),
    hostLabel: hostIndex.labelOf(row?.node_id),
    nodeId: row?.node_id ?? null,
    raftRole: row?.raft_role ?? null,
    replicaId: row?.replica_id ?? null,
    status: row?.status ?? null,
  };
}

function describePartition(row, role, serviceRows, hostIndex) {
  const replicas = arrayMap(
    arrayFilter(serviceRows, (service) =>
      service?.partition_id === row.partition_id),
    (service) => describeReplica(service, hostIndex),
  );
  const voterNodeIds = arraySort([...new Set(arrayMap(
    arrayFilter(replicas, (replica) => replica.activeVoter),
    (replica) => replica.nodeId,
  ))]);
  const leaderNodeId = nonEmptyString(row?.leader_node_id);
  const policy = Number(row?.replica_count);
  return {
    activeVoterCount: voterNodeIds.length,
    activeVoterHosts: countDistinctHosts(voterNodeIds, hostIndex),
    activeVoterNodeIds: voterNodeIds,
    leader: {
      host: leaderNodeId === null ? null : hostIndex.hostOf(leaderNodeId),
      isActiveVoter: leaderNodeId !== null &&
        arraySome(voterNodeIds, (nodeId) => nodeId === leaderNodeId),
      nodeId: leaderNodeId,
    },
    partitionId: row.partition_id,
    replicaCountPolicy: Number.isInteger(policy) && policy > ZERO ?
      policy :
      null,
    replicas,
    role,
    state: row?.state ?? null,
  };
}

function replicaCountUnmetFacts(child, claim, base) {
  if (claim.requirePolicyReplicaCount !== true) {
    return [];
  }
  if (child.replicaCountPolicy === null) {
    return [{...base, fact: UNMET_FACT.CHILD_REPLICA_POLICY_UNKNOWN}];
  }
  if (child.activeVoterCount !== child.replicaCountPolicy) {
    return [{...base, fact: UNMET_FACT.CHILD_ACTIVE_VOTER_COUNT,
      observed: child.activeVoterCount, required: child.replicaCountPolicy}];
  }
  return [];
}

function leaderUnmetFacts(child, claim, base) {
  if (claim.requireChildLeader !== true) {
    return [];
  }
  if (child.leader.nodeId === null) {
    return [{...base, fact: UNMET_FACT.CHILD_LEADER_MISSING}];
  }
  if (!child.leader.isActiveVoter) {
    return [{...base, fact: UNMET_FACT.CHILD_LEADER_NOT_ACTIVE_VOTER,
      leaderNodeId: child.leader.nodeId}];
  }
  return [];
}

function childUnmetFacts(child, claim) {
  const base = {partitionId: child.partitionId};
  const unmet = replicaCountUnmetFacts(child, claim, base);
  if (child.activeVoterHosts.hosts.length < claim.minReplicaHostsPerChild) {
    unmet.push({...base, fact: UNMET_FACT.CHILD_REPLICA_HOSTS_INSUFFICIENT,
      observed: child.activeVoterHosts.hosts.length,
      required: claim.minReplicaHostsPerChild});
  }
  unmet.push(...leaderUnmetFacts(child, claim, base));
  return unmet;
}

function parentUnmetFacts(parentIds, partitions, serviceRows) {
  const unmet = [];
  for (const parentId of parentIds) {
    const row = arrayFilter(partitions, (entry) =>
      entry.partitionId === parentId)[ZERO] || null;
    const activeReplicas = arrayFilter(serviceRows, (service) =>
      service?.partition_id === parentId &&
      lowerCaseOrEmpty(service?.status) === SERVICE_STATUS.ACTIVE);
    if (row !== null || activeReplicas.length > ZERO) {
      unmet.push({
        activeReplicaCount: activeReplicas.length,
        fact: UNMET_FACT.PARENT_NOT_DISSOLVED,
        leaderNodeId: row?.leader.nodeId ?? null,
        partitionId: parentId,
        rowPresent: row !== null,
      });
    }
  }
  return unmet;
}

function hostIdentityUnmetFacts(partitions, children) {
  const unknown = new Set();
  for (const partition of partitions) {
    for (const nodeId of partition.activeVoterHosts.unknownNodeIds) {
      unknown.add(nodeId);
    }
  }
  for (const child of children) {
    if (child.leader.nodeId !== null && child.leader.host === null) {
      unknown.add(child.leader.nodeId);
    }
  }
  return unknown.size === ZERO ? [] : [{
    fact: UNMET_FACT.HOST_IDENTITY_UNKNOWN,
    nodeIds: arraySort([...unknown]),
  }];
}

function leaderHostsOf(children) {
  const hosts = new Set();
  for (const child of children) {
    if (child.leader.host !== null) {
      hosts.add(child.leader.host);
    }
  }
  return arraySort([...hosts]);
}

/**
 * Evaluate the completed-split + spread claim on ONE ground-truth
 * readback.
 * @param {Object} input
 * @param {Array<Object>} input.partitionRows The table's partitions rows.
 * @param {Array<Object>} input.serviceRows `services` rows.
 * @param {Object} input.hostIndex From buildNodeHostIndex.
 * @param {Set<string>} input.knownParentIds Mutated: parents seen so far.
 * @param {Object} input.claim {minChildren, minReplicaHostsPerChild,
 *   minDistinctLeaderHosts, requireParentDissolved, requireChildLeader,
 *   requirePolicyReplicaCount} - every condition is explicit in the claim.
 * @return {Object} {satisfied, unmet, partitions, leaderHosts, fingerprint}
 */
function evaluateSplitSpreadClaim({
  partitionRows, serviceRows, hostIndex, knownParentIds, claim,
}) {
  const topology = classifySplitTopology(partitionRows, knownParentIds);
  for (const parentId of topology.parentIds) {
    knownParentIds.add(parentId);
  }
  const childRole = topology.splitObserved ?
    PARTITION_ROLE.CHILD :
    PARTITION_ROLE.UNSPLIT;
  const children = arrayMap(topology.current, (row) =>
    describePartition(row, childRole, serviceRows, hostIndex));
  const parents = arrayMap(topology.parents, (row) =>
    describePartition(row, PARTITION_ROLE.PARENT, serviceRows, hostIndex));
  const partitions = [...parents, ...children];
  const leaderHosts = leaderHostsOf(children);
  const unmet = [];
  if (!topology.splitObserved || children.length < claim.minChildren) {
    unmet.push({fact: UNMET_FACT.SPLIT_CHILDREN_MISSING,
      observed: topology.splitObserved ? children.length : ZERO,
      required: claim.minChildren});
  }
  if (claim.requireParentDissolved) {
    unmet.push(...parentUnmetFacts(knownParentIds, partitions, serviceRows));
  }
  for (const child of children) {
    unmet.push(...childUnmetFacts(child, claim));
  }
  if (leaderHosts.length < claim.minDistinctLeaderHosts) {
    unmet.push({fact: UNMET_FACT.LEADER_HOSTS_INSUFFICIENT,
      leaderHosts, observed: leaderHosts.length,
      required: claim.minDistinctLeaderHosts});
  }
  unmet.push(...hostIdentityUnmetFacts(partitions, children));
  return {
    fingerprint: JSON.stringify(arrayMap(partitions, (entry) => [
      entry.partitionId, entry.role, entry.leader.nodeId,
      entry.activeVoterNodeIds,
    ])),
    leaderHosts,
    parentIdsObserved: arraySort([...knownParentIds]),
    partitions,
    satisfied: unmet.length === ZERO,
    unmet,
  };
}

function describeUnmetFact(entry) {
  const details = [];
  for (const key of ['partitionId', 'observed', 'required', 'leaderNodeId',
    'activeReplicaCount', 'leaderHosts', 'nodeIds']) {
    if (entry[key] !== undefined && entry[key] !== null) {
      details.push(`${key}=${JSON.stringify(entry[key])}`);
    }
  }
  return details.length === ZERO ?
    entry.fact :
    `${entry.fact}(${details.join(' ')})`;
}

function tallyUnmetFacts(tally, unmet) {
  const seen = new Set();
  for (const entry of unmet) {
    if (!setHas(seen, entry.fact)) {
      seen.add(entry.fact);
      tally.set(entry.fact, (mapGet(tally, entry.fact) || ZERO) + ONE);
    }
  }
}

/**
 * Poll a ground-truth claim until it holds on N consecutive readbacks
 * with an identical fingerprint, or the budget is spent. Stability is
 * the FULL claim holding on every one of those readbacks; a transient
 * satisfying readback resets nothing but its own streak.
 * @param {Object} options
 * @return {Promise<Object>} {passed, evaluation, readbacks, elapsedMs,
 *   unmetTally, stableReadbacks}
 */
async function pollGroundTruthClaim({
  readback, evaluate, stableReadbacksRequired, budgetMs, pollMs, sleep, now,
  onReadback = null,
}) {
  const startedAtMs = now();
  const tally = new Map();
  let readbacks = ZERO;
  let streak = ZERO;
  let streakFingerprint = null;
  let evaluation = null;
  while (now() - startedAtMs < budgetMs) {
    evaluation = evaluate(await readback());
    readbacks += ONE;
    tallyUnmetFacts(tally, evaluation.unmet);
    if (evaluation.satisfied) {
      streak = evaluation.fingerprint === streakFingerprint ? streak + ONE : ONE;
      streakFingerprint = evaluation.fingerprint;
    } else {
      streak = ZERO;
      streakFingerprint = null;
    }
    if (onReadback !== null) {
      await onReadback(evaluation);
    }
    if (streak >= stableReadbacksRequired) {
      break;
    }
    await sleep(pollMs);
  }
  return {
    elapsedMs: now() - startedAtMs,
    evaluation,
    passed: streak >= stableReadbacksRequired,
    readbacks,
    stableReadbacks: streak,
    unmetTally: Object.fromEntries(tally),
  };
}

/**
 * The structured record a gate emits for pass AND fail.
 * @param {Object} input
 * @return {Object}
 */
function buildGateRecord({gate, claim, hostIndex, outcome, budgetMs,
  stableReadbacksRequired}) {
  const evaluation = outcome.evaluation || {};
  return {
    budgetMs,
    claim,
    elapsedMs: outcome.elapsedMs,
    gate,
    hostAuthority: hostIndex.authority,
    leaderHosts: evaluation.leaderHosts || [],
    membershipEvidence: MEMBERSHIP_EVIDENCE,
    nodeHosts: hostIndex.nodes,
    parentIdsObserved: evaluation.parentIdsObserved || [],
    partitions: evaluation.partitions || [],
    passed: outcome.passed,
    readbacks: outcome.readbacks,
    stableReadbacks: outcome.stableReadbacks,
    stableReadbacksRequired,
    unmet: evaluation.unmet || [],
    unmetTally: outcome.unmetTally,
  };
}

/**
 * The human-readable statement of what a failing gate measured.
 * @param {Object} record From buildGateRecord.
 * @return {string}
 */
function describeGateFailure(record) {
  const last = arrayMap(record.unmet, describeUnmetFact).join('; ');
  const tally = arrayMap(Object.keys(record.unmetTally), (fact) =>
    `${fact} x${record.unmetTally[fact]}`).join(', ');
  return `${record.gate} not met within ${record.budgetMs}ms ` +
    `(${record.readbacks} readbacks, ${record.stableReadbacks}/` +
    `${record.stableReadbacksRequired} stable; ` +
    `${MEMBERSHIP_EVIDENCE.statement}; hosts by ` +
    `${record.hostAuthority}): last readback unmet: ${last || 'none'}; ` +
    `unmet across readbacks: ${tally || 'none'}`;
}

/**
 * A claim that needs more distinct hosts than the cluster has cannot be
 * proven on this topology; the gate says so instead of waiting.
 * @param {Object} hostIndex
 * @param {number} requiredHosts
 * @return {Object|null} The unmet fact, or null.
 */
function clusterHostShortfall(hostIndex, requiredHosts) {
  if (hostIndex.hostIds.length >= requiredHosts) {
    return null;
  }
  return {
    fact: UNMET_FACT.CLUSTER_HOSTS_INSUFFICIENT,
    observed: hostIndex.hostIds.length,
    required: requiredHosts,
  };
}

export {
  HOST_AUTHORITY,
  PARTITION_ROLE,
  UNMET_FACT,
  buildGateRecord,
  buildNodeHostIndex,
  clusterHostShortfall,
  countDistinctHosts,
  describeGateFailure,
  evaluateSplitSpreadClaim,
  isActiveVoterReplicaRow,
  pollGroundTruthClaim,
};
