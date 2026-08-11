/**
 * Single owner of the replica voter-readiness semantics (quest
 * voter-readiness-visibility-single-owner-table; epic
 * self-hosting-circularity-generic-treatment, Option 5).
 *
 * "Is this replica a ready voter" was re-derived across the rebalancer, node,
 * partition, control-plane, and admin layers with four independent role-set
 * declarations and three DIFFERENT memberships — the CL-035 defect class
 * (a seed and its consuming gate scoped by two hand-written conditions that
 * disagreed). This module declares each distinct membership as a NAMED row of
 * one decision table; every other module consumes a row or a predicate, never
 * a local role literal. The census analyzer
 * (scripts/check-voter-readiness-single-owner.js, npm run
 * audit:voter-readiness-owner) counts any re-derivation outside this file.
 *
 * The memberships genuinely differ, and that difference is the point of the
 * named rows:
 * - QUORUM_VOTER includes CANDIDATE: a candidate is a voting raft member
 *   (mid-election), so quorum math, safety floors, and promotion guards must
 *   count it.
 * - LOAD_ROUTABLE excludes CANDIDATE: a mid-election replica cannot serve
 *   reads/writes, so admin discovery and load-lane admission must not route
 *   to it.
 * - CATCHUP_LEARNER is the non-voting catch-up member; "not a learner" is the
 *   voter-membership boundary every gate compares against.
 */
import {RAFT_ROLE} from './constants.js';

const stringToLowerCase = Function.call.bind(String.prototype.toLowerCase);
const setHas = Function.call.bind(Set.prototype.has);

const VOTER_READINESS_SEMANTIC = Object.freeze({
  QUORUM_VOTER: 'quorum_voter',
  LOAD_ROUTABLE: 'load_routable',
  REPAIR_ONLY: 'repair_only',
  CATCHUP_LEARNER: 'catchup_learner',
});

const RAFT_ROLES_BY_VOTER_READINESS_SEMANTIC = Object.freeze(new Map([
  [
    VOTER_READINESS_SEMANTIC.QUORUM_VOTER,
    Object.freeze(new Set([
      RAFT_ROLE.LEADER,
      RAFT_ROLE.FOLLOWER,
      RAFT_ROLE.CANDIDATE,
    ])),
  ],
  [
    VOTER_READINESS_SEMANTIC.LOAD_ROUTABLE,
    Object.freeze(new Set([
      RAFT_ROLE.LEADER,
      RAFT_ROLE.FOLLOWER,
    ])),
  ],
  [
    VOTER_READINESS_SEMANTIC.REPAIR_ONLY,
    Object.freeze(new Set([
      RAFT_ROLE.CANDIDATE,
      RAFT_ROLE.LEARNER,
    ])),
  ],
  [
    VOTER_READINESS_SEMANTIC.CATCHUP_LEARNER,
    Object.freeze(new Set([
      RAFT_ROLE.LEARNER,
    ])),
  ],
]));

// Named row aliases — the table rows under their historical consumer names.
// VOTER_RAFT_ROLES moved here from raft/constants.js (where it had already
// unified three drifting copies); the load/repair rows replace the admin and
// replica-state-machine local declarations.
const VOTER_RAFT_ROLES =
  RAFT_ROLES_BY_VOTER_READINESS_SEMANTIC.get(
    VOTER_READINESS_SEMANTIC.QUORUM_VOTER,
  );
const LOAD_ROUTABLE_RAFT_ROLES =
  RAFT_ROLES_BY_VOTER_READINESS_SEMANTIC.get(
    VOTER_READINESS_SEMANTIC.LOAD_ROUTABLE,
  );
const REPAIR_ONLY_RAFT_ROLES =
  RAFT_ROLES_BY_VOTER_READINESS_SEMANTIC.get(
    VOTER_READINESS_SEMANTIC.REPAIR_ONLY,
  );

function normalizeRaftRoleInput(role) {
  return typeof role === 'string' ? stringToLowerCase(role) : null;
}

/**
 * QUORUM_VOTER membership — fail-closed: null/undefined/unknown role strings
 * are NOT voters. Replaces the inline `!role || role === RAFT_ROLE.LEARNER`
 * call-site comparisons (which were fail-open for unknown strings; roles are
 * enum-constrained upstream, so the domains coincide).
 */
function isVoterRaftRole(role) {
  const normalized = normalizeRaftRoleInput(role);
  return normalized !== null && setHas(VOTER_RAFT_ROLES, normalized);
}

function isLoadRoutableRaftRole(role) {
  const normalized = normalizeRaftRoleInput(role);
  return normalized !== null && setHas(LOAD_ROUTABLE_RAFT_ROLES, normalized);
}

function isRepairOnlyRaftRole(role) {
  const normalized = normalizeRaftRoleInput(role);
  return normalized !== null && setHas(REPAIR_ONLY_RAFT_ROLES, normalized);
}

function isCatchupLearnerRaftRole(role) {
  return normalizeRaftRoleInput(role) === RAFT_ROLE.LEARNER;
}

export {
  LOAD_ROUTABLE_RAFT_ROLES,
  RAFT_ROLES_BY_VOTER_READINESS_SEMANTIC,
  REPAIR_ONLY_RAFT_ROLES,
  VOTER_RAFT_ROLES,
  VOTER_READINESS_SEMANTIC,
  isCatchupLearnerRaftRole,
  isLoadRoutableRaftRole,
  isRepairOnlyRaftRole,
  isVoterRaftRole,
};
