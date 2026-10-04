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
 * - a HOST: the MACHINE the harness placed the node on, named only by
 *   declared/observed topology (scenario-host-topology.js: the provider's
 *   declared machine id, else its resolved internal address; nothing
 *   else). Two nodes on one provider, and two providers on one machine,
 *   are one host. It is stamped on each NodeHandle as `hostIdentity` when
 *   the harness starts it. A node id, a provider index or missing
 *   topology is never a host: an unknown host fails closed.
 *
 * Every spread claim states its UNIT (claim.spreadUnit, SPREAD_UNIT):
 * 'host' counts distinct machines by the host authority, 'node' counts
 * distinct node ids (and says host spread was not measured). The gate
 * record and the failure text carry the unit; a claim without one is
 * invalid (spread_unit_invalid).
 *
 * What a gate built on these rows can and cannot see: the harness reads
 * the replicated `services` and `partitions` ROWS. No admin or diagnostic
 * read exposes the raft-rs ConfState (committed voters) per group, so a
 * gate here measures service rows, not committed raft membership, and its
 * record says so (MEMBERSHIP_EVIDENCE).
 *
 * Blind spots of the split claim (rows, polled):
 * (a) a MERGE: its sources and target all read as current partitions, so
 *     a merge-shaped table can satisfy the claim (merge is disabled in the
 *     scenarios that use it);
 * (b) a parent never observed while its row existed, whose row was
 *     re-versioned to the children's version, reads as a child;
 * (c) a parent never observed whose row is already gone: closed here -
 *     ACTIVE replicas of a partition id of the table with no partitions
 *     row are an unmet fact (orphan_active_replicas).
 * (b) and (c) need the first readback after the cutover; the scenario
 * gates poll from before the split.
 */

import {SERVICE_STATUS} from '../../../src/constants/service-status.js';
import {SERVICE_TYPE} from '../../../src/constants/service.js';
import {isVoterRaftRole} from '../../../src/raft/replica-voter-readiness.js';
import {SPREAD_UNIT, isSpreadUnit} from './scenario-host-topology.js';

// Module-load captures (the harness tree's ambient-intrinsics rule).
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySome = Function.call.bind(Array.prototype.some);
const arraySort = Function.call.bind(Array.prototype.sort);
const stringToLowerCase = Function.call.bind(String.prototype.toLowerCase);
const setHas = Function.call.bind(Set.prototype.has);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const mapGet = Function.call.bind(Map.prototype.get);

const ZERO = 0;
const ONE = 1;

// A SPLITTING/MERGING row is mid-transition: never a settled child.
const TRANSITIONAL_PARTITION_STATES = Object.freeze(new Set([
  'splitting',
  'merging',
]));
const TABLE_PARTITION_SEPARATORS = Object.freeze(['-', '_']);

const HOST_AUTHORITY = 'declared_provider_machine_topology';

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
  CHILD_REPLICA_NODES_INSUFFICIENT: 'child_replica_nodes_insufficient',
  CHILD_REPLICA_POLICY_UNKNOWN: 'child_replica_policy_unknown',
  CLUSTER_HOSTS_INSUFFICIENT: 'cluster_hosts_insufficient',
  CLUSTER_NODES_INSUFFICIENT: 'cluster_nodes_insufficient',
  HOST_IDENTITY_UNKNOWN: 'host_identity_unknown',
  LEADER_HOSTS_INSUFFICIENT: 'leader_hosts_insufficient',
  LEADER_NODES_INSUFFICIENT: 'leader_nodes_insufficient',
  ORPHAN_ACTIVE_REPLICAS: 'orphan_active_replicas',
  PARENT_NOT_DISSOLVED: 'parent_not_dissolved',
  PARTITION_TRANSITIONAL: 'partition_transitional',
  READBACK_FAILED: 'readback_failed',
  SPLIT_CHILDREN_MISSING: 'split_children_missing',
  SPREAD_UNIT_INVALID: 'spread_unit_invalid',
});

const SPREAD_FACT = Object.freeze({
  [SPREAD_UNIT.HOST]: Object.freeze({
    childReplicas: UNMET_FACT.CHILD_REPLICA_HOSTS_INSUFFICIENT,
    cluster: UNMET_FACT.CLUSTER_HOSTS_INSUFFICIENT,
    leaders: UNMET_FACT.LEADER_HOSTS_INSUFFICIENT,
  }),
  [SPREAD_UNIT.NODE]: Object.freeze({
    childReplicas: UNMET_FACT.CHILD_REPLICA_NODES_INSUFFICIENT,
    cluster: UNMET_FACT.CLUSTER_NODES_INSUFFICIENT,
    leaders: UNMET_FACT.LEADER_NODES_INSUFFICIENT,
  }),
});

const SPREAD_UNIT_STATEMENT = Object.freeze({
  [SPREAD_UNIT.HOST]: 'spread unit: host (distinct machines by the ' +
    'declared provider machine topology)',
  [SPREAD_UNIT.NODE]: 'spread unit: node (distinct node ids; host spread ' +
    'NOT measured)',
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
    source: nonEmptyString(identity?.source),
    providerIndex: Number.isInteger(identity?.providerIndex) ?
      identity.providerIndex :
      null,
  };
}

const HOST_IDENTITY_ABSENT = 'host_identity_absent';

// One node of the record's nodeHosts: its host, or why it has none.
function describeListedNode(nodeId, node, host) {
  if (host === null) {
    return {host: null,
      hostLabel: nonEmptyString(node?.hostIdentity?.label),
      hostMissingReason: nonEmptyString(node?.hostIdentity?.missingReason) ||
        HOST_IDENTITY_ABSENT,
      hostSource: null, nodeId};
  }
  return {host: host.hostId, hostLabel: host.label, hostMissingReason: null,
    hostSource: host.source, nodeId};
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
    listed.push(describeListedNode(nodeId, node, host));
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

// The members a spread count counts, in the claim's unit.
function replicaSpreadMembers(child, unit) {
  return unit === SPREAD_UNIT.HOST ?
    child.activeVoterHosts.hosts :
    child.activeVoterNodeIds;
}

function childUnmetFacts(child, claim) {
  const base = {partitionId: child.partitionId};
  const unmet = replicaCountUnmetFacts(child, claim, base);
  if (isSpreadUnit(claim.spreadUnit)) {
    const members = replicaSpreadMembers(child, claim.spreadUnit);
    if (members.length < claim.minReplicaSpreadPerChild) {
      unmet.push({...base,
        fact: SPREAD_FACT[claim.spreadUnit].childReplicas,
        observed: members.length, required: claim.minReplicaSpreadPerChild,
        unit: claim.spreadUnit});
    }
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

function hostIdentityUnmetFacts(partitions, children, claim) {
  if (claim.spreadUnit !== SPREAD_UNIT.HOST) {
    return [];
  }
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

function transitionalUnmetFacts(partitions) {
  const unmet = [];
  for (const partition of partitions) {
    if (setHas(TRANSITIONAL_PARTITION_STATES, lowerCaseOrEmpty(partition.state))) {
      unmet.push({fact: UNMET_FACT.PARTITION_TRANSITIONAL,
        partitionId: partition.partitionId, state: partition.state});
    }
  }
  return unmet;
}

function belongsToTables(partitionId, tableIds) {
  for (const tableId of tableIds) {
    if (partitionId === tableId) {
      return true;
    }
    for (const separator of TABLE_PARTITION_SEPARATORS) {
      if (stringStartsWith(partitionId, tableId + separator)) {
        return true;
      }
    }
  }
  return false;
}

// Blind spot (c): ACTIVE replicas of one of the table's partition ids
// that has no partitions row and was never observed as a parent.
function tableAndRowIdsOf(partitionRows) {
  const tableIds = new Set();
  const rowIds = new Set();
  for (const row of partitionRows) {
    const tableId = nonEmptyString(row?.table_id);
    if (tableId !== null) {
      tableIds.add(tableId);
    }
    rowIds.add(row?.partition_id);
  }
  return {rowIds, tableIds};
}

function orphanPartitionIdOf(service, ids, knownParentIds) {
  const partitionId = nonEmptyString(service?.partition_id);
  if (partitionId === null || setHas(ids.rowIds, partitionId) ||
      setHas(knownParentIds, partitionId) ||
      lowerCaseOrEmpty(service?.status) !== SERVICE_STATUS.ACTIVE) {
    return null;
  }
  return belongsToTables(partitionId, ids.tableIds) ? partitionId : null;
}

function orphanUnmetFacts(partitionRows, knownParentIds, serviceRows) {
  const ids = tableAndRowIdsOf(partitionRows);
  const counts = new Map();
  for (const service of serviceRows) {
    const partitionId = orphanPartitionIdOf(service, ids, knownParentIds);
    if (partitionId !== null) {
      counts.set(partitionId, (mapGet(counts, partitionId) || ZERO) + ONE);
    }
  }
  return arrayMap(arraySort([...counts.keys()]), (partitionId) => ({
    activeReplicaCount: mapGet(counts, partitionId),
    fact: UNMET_FACT.ORPHAN_ACTIVE_REPLICAS,
    partitionId,
  }));
}

// The record shows what a parent dissolved BY ROWS still has: its
// leftover replica rows of any status (a removing replica may still run).
function parentResidualReplicas(parentIds, partitions, serviceRows,
  hostIndex) {
  const residual = [];
  for (const parentId of arraySort([...parentIds])) {
    if (arraySome(partitions, (entry) => entry.partitionId === parentId)) {
      continue;
    }
    const replicas = arrayMap(arrayFilter(serviceRows, (service) =>
      service?.partition_id === parentId),
    (service) => describeReplica(service, hostIndex));
    if (replicas.length > ZERO) {
      residual.push({partitionId: parentId, replicas});
    }
  }
  return residual;
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

function leaderNodesOf(children) {
  const nodes = new Set();
  for (const child of children) {
    if (child.leader.nodeId !== null) {
      nodes.add(child.leader.nodeId);
    }
  }
  return arraySort([...nodes]);
}

// The leader spread in the claim's unit (null members for an invalid unit).
function leaderSpreadOf(children, unit) {
  if (!isSpreadUnit(unit)) {
    return {members: [], unit: unit ?? null};
  }
  return {
    members: unit === SPREAD_UNIT.HOST ?
      leaderHostsOf(children) :
      leaderNodesOf(children),
    unit,
  };
}

function spreadUnmetFacts(claim, leaderSpread) {
  if (!isSpreadUnit(claim.spreadUnit)) {
    return [{fact: UNMET_FACT.SPREAD_UNIT_INVALID,
      unit: claim.spreadUnit ?? null}];
  }
  if (leaderSpread.members.length >= claim.minDistinctLeaders) {
    return [];
  }
  const entry = {fact: SPREAD_FACT[claim.spreadUnit].leaders,
    observed: leaderSpread.members.length,
    required: claim.minDistinctLeaders, unit: claim.spreadUnit};
  if (claim.spreadUnit === SPREAD_UNIT.HOST) {
    entry.leaderHosts = leaderSpread.members;
  } else {
    entry.leaderNodes = leaderSpread.members;
  }
  return [entry];
}

/**
 * Evaluate the completed-split + spread claim on ONE ground-truth
 * readback.
 * @param {Object} input
 * @param {Array<Object>} input.partitionRows The table's partitions rows.
 * @param {Array<Object>} input.serviceRows `services` rows.
 * @param {Object} input.hostIndex From buildNodeHostIndex.
 * @param {Set<string>} input.knownParentIds Mutated: parents seen so far.
 * @param {Object} input.claim {spreadUnit, minChildren,
 *   minReplicaSpreadPerChild, minDistinctLeaders, requireParentDissolved,
 *   requireChildLeader, requirePolicyReplicaCount} - every condition is
 *   explicit in the claim, the spread counts in `spreadUnit`.
 * @return {Object} {satisfied, unmet, partitions, leaderSpread,
 *   leaderHosts, fingerprint}
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
  const leaderSpread = leaderSpreadOf(children, claim.spreadUnit);
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
  unmet.push(...spreadUnmetFacts(claim, leaderSpread));
  unmet.push(...hostIdentityUnmetFacts(partitions, children, claim));
  unmet.push(...transitionalUnmetFacts(partitions));
  unmet.push(...orphanUnmetFacts(partitionRows, knownParentIds, serviceRows));
  return {
    fingerprint: JSON.stringify(arrayMap(partitions, (entry) => [
      entry.partitionId, entry.role, entry.leader.nodeId,
      entry.activeVoterNodeIds,
    ])),
    leaderHosts,
    leaderSpread,
    parentIdsObserved: arraySort([...knownParentIds]),
    parentResidualReplicas: parentResidualReplicas(
      knownParentIds, partitions, serviceRows, hostIndex),
    partitions,
    satisfied: unmet.length === ZERO,
    unmet,
  };
}

function describeUnmetFact(entry) {
  const details = [];
  for (const key of ['partitionId', 'state', 'unit', 'observed', 'required',
    'leaderNodeId', 'activeReplicaCount', 'leaderHosts', 'leaderNodes',
    'nodeIds', 'error']) {
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

// A readback (or its onReadback hook) threw: the outcome so far, with the
// error as a named unmet fact, rides on the error for the gate record.
function attachFailedOutcome(error, state, startedAtMs, now) {
  const message = String(error?.message || error);
  const evaluation = state.evaluation || {};
  const outcome = {
    elapsedMs: now() - startedAtMs,
    error: message,
    evaluation: {...evaluation, unmet: [...(evaluation.unmet || []),
      {error: message, fact: UNMET_FACT.READBACK_FAILED}]},
    passed: false,
    readbacks: state.readbacks,
    stableReadbacks: ZERO,
    unmetTally: Object.fromEntries(state.tally),
  };
  if (error && typeof error === 'object') {
    try {
      error.groundTruthOutcome = outcome;
    } catch (_frozen) {
      // A frozen error still propagates; the caller records what it can.
    }
  }
  return outcome;
}

async function pollOnce(state, options) {
  state.evaluation = options.evaluate(await options.readback());
  state.readbacks += ONE;
  tallyUnmetFacts(state.tally, state.evaluation.unmet);
  if (state.evaluation.satisfied) {
    state.streak = state.evaluation.fingerprint === state.streakFingerprint ?
      state.streak + ONE :
      ONE;
    state.streakFingerprint = state.evaluation.fingerprint;
  } else {
    state.streak = ZERO;
    state.streakFingerprint = null;
  }
  if (options.onReadback) {
    await options.onReadback(state.evaluation);
  }
}

/**
 * Poll a ground-truth claim until it holds on N consecutive readbacks
 * with an identical fingerprint, or the budget is spent. Stability is
 * the FULL claim holding on every one of those readbacks; any unmet
 * readback resets the streak. A readback (or onReadback) that throws
 * rethrows with `error.groundTruthOutcome`, the failed outcome so far.
 * @param {Object} options
 * @return {Promise<Object>} {passed, evaluation, readbacks, elapsedMs,
 *   unmetTally, stableReadbacks}
 */
async function pollGroundTruthClaim(options) {
  const {stableReadbacksRequired, budgetMs, pollMs, sleep, now} = options;
  const startedAtMs = now();
  const state = {evaluation: null, readbacks: ZERO, streak: ZERO,
    streakFingerprint: null, tally: new Map()};
  try {
    while (now() - startedAtMs < budgetMs) {
      await pollOnce(state, options);
      if (state.streak >= stableReadbacksRequired) {
        break;
      }
      await sleep(pollMs);
    }
  } catch (error) {
    attachFailedOutcome(error, state, startedAtMs, now);
    throw error;
  }
  return {
    elapsedMs: now() - startedAtMs,
    evaluation: state.evaluation,
    passed: state.streak >= stableReadbacksRequired,
    readbacks: state.readbacks,
    stableReadbacks: state.streak,
    unmetTally: Object.fromEntries(state.tally),
  };
}

/**
 * The structured record a gate emits for pass AND fail.
 * @param {Object} input
 * @return {Object}
 */
// The spread a record states, always with its unit (null = invalid claim).
function recordSpread(evaluation, claim) {
  return {
    leaderSpread: evaluation.leaderSpread ||
      {members: [], unit: claim?.spreadUnit ?? null},
    spreadUnit: claim?.spreadUnit ?? null,
  };
}

function buildGateRecord({gate, claim, hostIndex, outcome, budgetMs,
  stableReadbacksRequired}) {
  const evaluation = outcome.evaluation || {};
  return {
    ...recordSpread(evaluation, claim),
    budgetMs,
    claim,
    elapsedMs: outcome.elapsedMs,
    error: outcome.error || null,
    gate,
    hostAuthority: hostIndex.authority,
    leaderHosts: evaluation.leaderHosts || [],
    membershipEvidence: MEMBERSHIP_EVIDENCE,
    nodeHosts: hostIndex.nodes,
    parentIdsObserved: evaluation.parentIdsObserved || [],
    parentResidualReplicas: evaluation.parentResidualReplicas || [],
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
  const unit = SPREAD_UNIT_STATEMENT[record.spreadUnit] ||
    `${UNMET_FACT.SPREAD_UNIT_INVALID} (${JSON.stringify(record.spreadUnit)})`;
  return `${record.gate} not met within ${record.budgetMs}ms ` +
    `(${record.readbacks} readbacks, ${record.stableReadbacks}/` +
    `${record.stableReadbacksRequired} stable; ${unit}; ` +
    `${MEMBERSHIP_EVIDENCE.statement}; hosts by ` +
    `${record.hostAuthority}): last readback unmet: ${last || 'none'}; ` +
    `unmet across readbacks: ${tally || 'none'}`;
}

/**
 * A claim that needs more distinct hosts (or nodes) than the cluster has
 * cannot be proven on this topology; the gate says so instead of waiting.
 * In the host unit a node with no host identity leaves the cluster's host
 * count unknown, which fails closed.
 * @param {Object} hostIndex
 * @param {Object} claim {spreadUnit, minDistinctLeaders,
 *   minReplicaSpreadPerChild}
 * @return {Object|null} The unmet fact, or null.
 */
function clusterSpreadShortfall(hostIndex, claim) {
  if (!isSpreadUnit(claim.spreadUnit)) {
    return {fact: UNMET_FACT.SPREAD_UNIT_INVALID,
      unit: claim.spreadUnit ?? null};
  }
  const required = Math.max(claim.minDistinctLeaders,
    claim.minReplicaSpreadPerChild);
  if (required <= ONE) {
    return null;
  }
  const unknown = arrayFilter(hostIndex.nodes, (node) => node.host === null);
  if (claim.spreadUnit === SPREAD_UNIT.HOST && unknown.length > ZERO) {
    return {fact: UNMET_FACT.HOST_IDENTITY_UNKNOWN,
      nodeIds: arrayMap(unknown, (node) => node.nodeId), required,
      unit: claim.spreadUnit};
  }
  const observed = claim.spreadUnit === SPREAD_UNIT.HOST ?
    hostIndex.hostIds.length :
    hostIndex.nodes.length;
  if (observed >= required) {
    return null;
  }
  return {fact: SPREAD_FACT[claim.spreadUnit].cluster, observed, required,
    unit: claim.spreadUnit};
}

export {
  HOST_AUTHORITY,
  PARTITION_ROLE,
  UNMET_FACT,
  buildGateRecord,
  buildNodeHostIndex,
  clusterSpreadShortfall,
  countDistinctHosts,
  describeGateFailure,
  evaluateSplitSpreadClaim,
  isActiveVoterReplicaRow,
  pollGroundTruthClaim,
};
