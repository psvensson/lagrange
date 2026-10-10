/**
 * The voter-target authority of every harness convergence verdict.
 *
 * Callers used to pass ONE number, `targetVoterCount`, and it meant two
 * things: the replica count a partition must REACH, and the CEILING that
 * bounds over-replication (node-join-under-load passes max(3, nodes),
 * diag-admin-discovery 7, postgres preflight target + skew). Read as a
 * ceiling only, a partition at 1 of 3 voters "converged". They are now two
 * inputs:
 * - the POLICY TARGET: each partition's own desired replication factor,
 *   decoded by the production authority (resolveDesiredReplicationFactor)
 *   from that partition's persisted `partitions` row, read harness-side
 *   over SQL; no row or no usable replica_count = no target (absent
 *   evidence, never a default);
 * - the CEILING: the caller's `targetVoterCount` (alias `voterCeiling`),
 *   which still only bounds over-replication.
 *
 * Verdict: converged <=> every claimed partition has exactly its policy
 * target of voters, and no more than the ceiling. Named unmet states:
 * under_target_voters, over_target_voters, over_ceiling_voters,
 * voter_target_evidence_absent. A call site that legitimately tolerates
 * under-replication (a node is down, the survivors cannot hold the policy
 * count) declares `{tolerateUnderReplication: {reason, minVoters}}`: the
 * reason, and the voter FLOOR its situation implies (two survivors of a
 * three-node cluster: 2). Every under-target partition at or above the
 * floor gives `under_replication_tolerated`, carrying the reason, the floor
 * and the under-target partitions, never a silent pass; any partition below
 * the floor stays `under_target_voters`. A tolerance without a reason or
 * without a floor is refused (it throws). A caller that makes no
 * voter-count claim at all (a quiescence probe) passes an explicit
 * not-claimed verdict with its reason.
 */

import {
  resolveDesiredReplicationFactor,
} from '../../../src/bootstrap/replication-target-authority.js';

// Module-load captures (the harness tree's ambient-intrinsics rule).
const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayJoin = Function.call.bind(Array.prototype.join);
const arraySort = Function.call.bind(Array.prototype.sort);
const stringTrim = Function.call.bind(String.prototype.trim);

const VOTER_TARGET_STATE = Object.freeze({
  AT_TARGET: 'voters_at_target',
  EVIDENCE_ABSENT: 'voter_target_evidence_absent',
  NOT_CLAIMED: 'voter_target_not_claimed',
  OVER_CEILING: 'over_ceiling_voters',
  OVER_TARGET: 'over_target_voters',
  OVER_TARGET_MEMBERSHIP_FROZEN: 'over_target_voters_membership_frozen',
  TOLERATED: 'under_replication_tolerated',
  UNDER_TARGET: 'under_target_voters',
});

const SATISFIED_STATES = Object.freeze(new Set([
  VOTER_TARGET_STATE.AT_TARGET,
  VOTER_TARGET_STATE.NOT_CLAIMED,
  VOTER_TARGET_STATE.OVER_TARGET_MEMBERSHIP_FROZEN,
  VOTER_TARGET_STATE.TOLERATED,
]));

const TOLERANCE_OPTION = 'tolerateUnderReplication';
const VOTER_TARGET_QUERY =
  'SELECT partition_id, replica_count FROM partitions';
const ABSENT_VOTER_COUNT = 0;
const MIN_TOLERATED_VOTERS = 1;

function refuseTolerance(detail) {
  throw new TypeError(TOLERANCE_OPTION + ' must be {reason, minVoters}: a ' +
    'non-empty reason string naming why the call site tolerates partitions ' +
    'below their policy replica target, and the positive integer voter ' +
    'floor that situation implies (' + detail + ')');
}

/**
 * The under-replication a call site tolerates, or null. A tolerance without
 * a reason or without a declared voter floor is refused, never read as
 * strict or as tolerant at any deficit.
 * @param {Object} options
 * @return {?{reason: string, minVoters: number}}
 */
function resolveUnderReplicationTolerance(options) {
  const tolerance = options?.[TOLERANCE_OPTION];
  if (tolerance === undefined) {
    return null;
  }
  if (tolerance === null || typeof tolerance !== 'object') {
    refuseTolerance('no voter floor declared');
  }
  const {reason, minVoters} = tolerance;
  if (typeof reason !== 'string' || reason.length === 0) {
    refuseTolerance('no reason');
  }
  if (!Number.isSafeInteger(minVoters) || minVoters < MIN_TOLERATED_VOTERS) {
    refuseTolerance('minVoters ' + String(minVoters));
  }
  return Object.freeze({minVoters, reason});
}

/**
 * Policy targets from `partitions` rows, by the production decoder.
 * @param {Array<Object>} partitionRows
 * @return {Map<string, number>} partitionId -> desired voters (declared only)
 */
function buildPartitionVoterTargets(partitionRows) {
  const targets = new Map();
  for (const row of Array.isArray(partitionRows) ? partitionRows : []) {
    const partitionId = stringTrim(String(row?.partition_id || ''));
    const target = resolveDesiredReplicationFactor(row).replicationFactor;
    if (partitionId.length > 0 && target > 0) {
      targets.set(partitionId, target);
    }
  }
  return targets;
}

function rowsOf(result) {
  if (Array.isArray(result)) {
    return result;
  }
  return Array.isArray(result?.rows) ? result.rows : [];
}

function orderReaders(nodes, preferNodeId) {
  const readers = arrayFilter(Array.isArray(nodes) ? nodes : [],
    (node) => typeof node?.query === 'function');
  return [
    ...arrayFilter(readers, (node) => node.id === preferNodeId),
    ...arrayFilter(readers, (node) => node.id !== preferNodeId),
  ];
}

// Every partition id the policy read returned, with or without a usable
// target, so a row outside the claimed set can be named.
function partitionIdsOfRows(partitionRows) {
  const ids = new Set();
  for (const row of partitionRows) {
    const partitionId = stringTrim(String(row?.partition_id || ''));
    if (partitionId.length > 0) {
      ids.add(partitionId);
    }
  }
  return arraySort([...ids]);
}

/**
 * Read the policy targets from the first node that answers.
 * @param {Array<Object>} nodes
 * @param {{preferNodeId?: string}} [options]
 * @return {Promise<Object>} {targets: Map|null, partitionIds: string[]|null,
 *   sourceNodeId, error}
 */
async function readPartitionVoterTargets(nodes, options = {}) {
  let error = 'no node exposes a partitions read';
  for (const node of orderReaders(nodes, options.preferNodeId)) {
    try {
      const rows = rowsOf(await node.query(VOTER_TARGET_QUERY));
      return {error: null, partitionIds: partitionIdsOfRows(rows),
        sourceNodeId: node.id, targets: buildPartitionVoterTargets(rows)};
    } catch (readError) {
      error = String(readError?.message || readError);
    }
  }
  return {error, partitionIds: null, sourceNodeId: null, targets: null};
}

function finiteCeiling(value) {
  return Number.isFinite(value) && value > 0 ? value : Infinity;
}

function voterCountOf(voterCounts, partitionId) {
  const count = voterCounts instanceof Map ?
    voterCounts.get(partitionId) :
    undefined;
  return Number.isFinite(count) ? count : ABSENT_VOTER_COUNT;
}

function collectPartitionFindings(input) {
  const findings = {evidenceAbsent: [], overCeiling: [], overTarget: [],
    underTarget: []};
  const ceiling = finiteCeiling(input.voterCeiling);
  for (const partitionId of [...input.expectedPartitionIds].sort()) {
    const voters = voterCountOf(input.voterCounts, partitionId);
    const target = input.voterTargets instanceof Map ?
      input.voterTargets.get(partitionId) :
      undefined;
    const entry = {partitionId, target: target ?? null, voters};
    if (voters > ceiling) {
      findings.overCeiling.push(entry);
    } else if (target === undefined) {
      findings.evidenceAbsent.push(entry);
    } else if (voters < target) {
      findings.underTarget.push(entry);
    } else if (voters > target) {
      findings.overTarget.push(entry);
    }
  }
  return findings;
}

// Tolerated only when the call site declared a tolerance and every
// under-target partition holds at least its declared voter floor.
function isToleratedUnderReplication(underTarget, tolerance) {
  if (!tolerance) {
    return false;
  }
  return arrayEvery(underTarget,
    (entry) => entry.voters >= tolerance.minVoters);
}

// Every partition the policy read knows (a target, or a row without one).
function collectPolicyPartitionIds(input) {
  const known = new Set(input.policyPartitionIds || []);
  if (input.voterTargets instanceof Map) {
    for (const partitionId of input.voterTargets.keys()) {
      known.add(partitionId);
    }
  }
  return arraySort([...known]);
}

// Partitions the policy read knows that the caller did not claim: named in
// the record, never silently dropped.
function collectUnclaimedPartitionIds(input) {
  return arrayFilter(collectPolicyPartitionIds(input),
    (partitionId) => !input.expectedPartitionIds.has(partitionId));
}

function decideVoterTargetState(findings, input) {
  if (input.expectedPartitionIds.size === 0 ||
      !(input.voterTargets instanceof Map) ||
      findings.evidenceAbsent.length > 0) {
    return VOTER_TARGET_STATE.EVIDENCE_ABSENT;
  }
  if (findings.overCeiling.length > 0) {
    return VOTER_TARGET_STATE.OVER_CEILING;
  }
  if (findings.overTarget.length > 0) {
    // Trimming is frozen by the membership freeze: the over-target state is
    // named, never hidden, and it does not block (the ceiling still does).
    return input.membershipFreezeActive === true ?
      VOTER_TARGET_STATE.OVER_TARGET_MEMBERSHIP_FROZEN :
      VOTER_TARGET_STATE.OVER_TARGET;
  }
  if (findings.underTarget.length > 0) {
    return isToleratedUnderReplication(findings.underTarget, input.tolerance) ?
      VOTER_TARGET_STATE.TOLERATED :
      VOTER_TARGET_STATE.UNDER_TARGET;
  }
  return VOTER_TARGET_STATE.AT_TARGET;
}

/**
 * The convergence verdict on voters, for the partitions a caller claims.
 * @param {Object} input {expectedPartitionIds: Set, voterCounts: Map,
 *   voterTargets: Map|null, voterCeiling, tolerance: ?{reason, minVoters}
 *   (from resolveUnderReplicationTolerance), membershipFreezeActive,
 *   policyPartitionIds?: every partition id the policy read returned}
 * @return {Object} frozen {state, satisfied, underTarget, overTarget,
 *   overCeiling, evidenceAbsent, voterCeiling, toleranceReason,
 *   toleranceMinVoters, unclaimedPartitionIds, claimedPartitionIds,
 *   policyPartitionIds}
 */
function classifyVoterTargets(input) {
  const normalized = {
    ...input,
    expectedPartitionIds: input.expectedPartitionIds instanceof Set ?
      input.expectedPartitionIds :
      new Set(input.expectedPartitionIds || []),
  };
  const findings = collectPartitionFindings(normalized);
  const state = decideVoterTargetState(findings, normalized);
  const tolerated = state === VOTER_TARGET_STATE.TOLERATED;
  return Object.freeze({
    ...findings,
    // The two sets the verdict covers: what it judged, and everything the
    // authoritative partitions read returned (certification compares them).
    claimedPartitionIds: arraySort([...normalized.expectedPartitionIds]),
    policyPartitionIds: collectPolicyPartitionIds(normalized),
    satisfied: SATISFIED_STATES.has(state),
    state,
    toleranceMinVoters: tolerated ? input.tolerance.minVoters : null,
    toleranceReason: tolerated ? input.tolerance.reason : null,
    unclaimedPartitionIds: collectUnclaimedPartitionIds(normalized),
    voterCeiling: Number.isFinite(input.voterCeiling) ?
      input.voterCeiling :
      null,
  });
}

/**
 * The explicit verdict of a caller that makes no voter-count claim.
 * @param {string} reason
 * @return {Object}
 */
function buildUnclaimedVoterTargetVerdict(reason) {
  return Object.freeze({evidenceAbsent: [], overCeiling: [], overTarget: [],
    satisfied: true, state: VOTER_TARGET_STATE.NOT_CLAIMED,
    toleranceMinVoters: null, toleranceReason: reason,
    unclaimedPartitionIds: [], underTarget: [], voterCeiling: null});
}

/**
 * One line naming an unmet verdict, for timeout messages.
 * @param {Object} verdict
 * @return {string}
 */
function describeVoterTargetVerdict(verdict) {
  if (!verdict) {
    return VOTER_TARGET_STATE.EVIDENCE_ABSENT;
  }
  const list = (entries) => arrayJoin(arrayMap(entries, (entry) =>
    `${entry.partitionId}=${entry.voters}/${entry.target ?? '?'}`), ',');
  const parts = [verdict.state];
  for (const key of ['underTarget', 'overTarget', 'overCeiling',
    'evidenceAbsent']) {
    if (verdict[key]?.length > 0) {
      parts.push(`${key}[${list(verdict[key])}]`);
    }
  }
  if (verdict.unclaimedPartitionIds?.length > 0) {
    parts.push(`unclaimed[${arrayJoin(verdict.unclaimedPartitionIds, ',')}]`);
  }
  if (Number.isFinite(verdict.toleranceMinVoters)) {
    parts.push(`minVoters=${verdict.toleranceMinVoters}`);
  }
  if (verdict.toleranceReason) {
    parts.push(`reason=${verdict.toleranceReason}`);
  }
  return parts.join(' ');
}

export {
  TOLERANCE_OPTION,
  VOTER_TARGET_STATE,
  buildPartitionVoterTargets,
  buildUnclaimedVoterTargetVerdict,
  classifyVoterTargets,
  describeVoterTargetVerdict,
  readPartitionVoterTargets,
  resolveUnderReplicationTolerance,
};
