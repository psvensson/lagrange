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
 * count) declares `{tolerateUnderReplication: '<reason>'}`; the verdict is
 * then `under_replication_tolerated`, carrying the reason and the
 * under-target partitions, never a silent pass. A caller that makes no
 * voter-count claim at all (a quiescence probe) passes an explicit
 * not-claimed verdict with its reason.
 */

import {
  resolveDesiredReplicationFactor,
} from '../../../src/bootstrap/replication-target-authority.js';

// Module-load captures (the harness tree's ambient-intrinsics rule).
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayJoin = Function.call.bind(Array.prototype.join);
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

/**
 * The reason a call site gives for tolerating under-replication, or null.
 * A tolerance without a reason is refused, never read as strict or tolerant.
 * @param {Object} options
 * @return {string|null}
 */
function resolveUnderReplicationToleranceReason(options) {
  const reason = options?.[TOLERANCE_OPTION];
  if (reason === undefined) {
    return null;
  }
  if (typeof reason !== 'string' || reason.length === 0) {
    throw new TypeError(TOLERANCE_OPTION + ' must be a non-empty reason ' +
      'string naming why the call site tolerates partitions below their ' +
      'policy replica target');
  }
  return reason;
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

/**
 * Read the policy targets from the first node that answers.
 * @param {Array<Object>} nodes
 * @param {{preferNodeId?: string}} [options]
 * @return {Promise<Object>} {targets: Map|null, sourceNodeId, error}
 */
async function readPartitionVoterTargets(nodes, options = {}) {
  let error = 'no node exposes a partitions read';
  for (const node of orderReaders(nodes, options.preferNodeId)) {
    try {
      const rows = rowsOf(await node.query(VOTER_TARGET_QUERY));
      return {error: null, sourceNodeId: node.id,
        targets: buildPartitionVoterTargets(rows)};
    } catch (readError) {
      error = String(readError?.message || readError);
    }
  }
  return {error, sourceNodeId: null, targets: null};
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
    return input.toleranceReason ?
      VOTER_TARGET_STATE.TOLERATED :
      VOTER_TARGET_STATE.UNDER_TARGET;
  }
  return VOTER_TARGET_STATE.AT_TARGET;
}

/**
 * The convergence verdict on voters, for the partitions a caller claims.
 * @param {Object} input {expectedPartitionIds: Set, voterCounts: Map,
 *   voterTargets: Map|null, voterCeiling, toleranceReason,
 *   membershipFreezeActive}
 * @return {Object} frozen {state, satisfied, underTarget, overTarget,
 *   overCeiling, evidenceAbsent, voterCeiling, toleranceReason}
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
  return Object.freeze({
    ...findings,
    satisfied: SATISFIED_STATES.has(state),
    state,
    toleranceReason: state === VOTER_TARGET_STATE.TOLERATED ?
      input.toleranceReason :
      null,
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
    toleranceReason: reason, underTarget: [], voterCeiling: null});
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
  resolveUnderReplicationToleranceReason,
};
