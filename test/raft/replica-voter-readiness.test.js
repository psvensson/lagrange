import {test} from '../../src/test-helpers/tap.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {
  EXPLICIT_NON_LEADER_RAFT_ROLES,
  LOAD_ROUTABLE_RAFT_ROLES,
  RAFT_ROLES_BY_VOTER_READINESS_SEMANTIC,
  REPAIR_ONLY_RAFT_ROLES,
  VOTER_RAFT_ROLES,
  VOTER_READINESS_SEMANTIC,
  isCatchupLearnerRaftRole,
  isExplicitNonLeaderRaftRole,
  isLoadRoutableRaftRole,
  isRepairOnlyRaftRole,
  isVoterRaftRole,
} from '../../src/raft/replica-voter-readiness.js';

// Red-on-revert pin for the single-owner voter-readiness decision table
// (quest voter-readiness-visibility-single-owner-table). The named rows and
// their DELIBERATE membership differences are the contract: collapsing
// load_routable into quorum_voter (or vice versa) must fail here before any
// consumer drifts.

test('every declared semantic resolves to a frozen role set', (t) => {
  for (const semantic of Object.values(VOTER_READINESS_SEMANTIC)) {
    const roles = RAFT_ROLES_BY_VOTER_READINESS_SEMANTIC.get(semantic);
    t.ok(roles instanceof Set, `${semantic} row exists`);
    t.ok(Object.isFrozen(roles), `${semantic} row is frozen`);
    for (const role of roles) {
      t.ok(
        Object.values(RAFT_ROLE).includes(role),
        `${semantic} member ${role} is a RAFT_ROLE enum value`,
      );
    }
  }
  t.end();
});

test('quorum_voter includes candidate; load_routable excludes it', (t) => {
  t.ok(VOTER_RAFT_ROLES.has(RAFT_ROLE.CANDIDATE),
    'a mid-election candidate is a voting raft member (quorum math counts it)');
  t.notOk(LOAD_ROUTABLE_RAFT_ROLES.has(RAFT_ROLE.CANDIDATE),
    'a mid-election candidate cannot serve load');
  t.ok(LOAD_ROUTABLE_RAFT_ROLES.has(RAFT_ROLE.LEADER));
  t.ok(LOAD_ROUTABLE_RAFT_ROLES.has(RAFT_ROLE.FOLLOWER));
  for (const role of LOAD_ROUTABLE_RAFT_ROLES) {
    t.ok(VOTER_RAFT_ROLES.has(role),
      `load-routable ${role} is also a quorum voter`);
  }
  t.end();
});

test('learner is never a voter and never routable; repair-only is disjoint from load', (t) => {
  t.notOk(VOTER_RAFT_ROLES.has(RAFT_ROLE.LEARNER));
  t.notOk(LOAD_ROUTABLE_RAFT_ROLES.has(RAFT_ROLE.LEARNER));
  t.ok(REPAIR_ONLY_RAFT_ROLES.has(RAFT_ROLE.LEARNER));
  t.ok(REPAIR_ONLY_RAFT_ROLES.has(RAFT_ROLE.CANDIDATE));
  for (const role of REPAIR_ONLY_RAFT_ROLES) {
    t.notOk(LOAD_ROUTABLE_RAFT_ROLES.has(role),
      `repair-only ${role} is not load-routable`);
  }
  t.end();
});

test('explicit non-leader evidence includes every recognized non-leader role',
  (t) => {
    t.same(
      [...EXPLICIT_NON_LEADER_RAFT_ROLES],
      [RAFT_ROLE.FOLLOWER, RAFT_ROLE.CANDIDATE, RAFT_ROLE.LEARNER],
      'the co-located leader-hint override has one declared membership row',
    );
    t.ok(isExplicitNonLeaderRaftRole('FOLLOWER'));
    t.ok(isExplicitNonLeaderRaftRole(RAFT_ROLE.CANDIDATE));
    t.ok(isExplicitNonLeaderRaftRole(RAFT_ROLE.LEARNER));
    t.notOk(isExplicitNonLeaderRaftRole(RAFT_ROLE.LEADER));
    t.notOk(isExplicitNonLeaderRaftRole('unknown'));
    t.notOk(isExplicitNonLeaderRaftRole(null));
    t.end();
  });

test('predicates are fail-closed and case-normalizing', (t) => {
  t.ok(isVoterRaftRole('follower'));
  t.ok(isVoterRaftRole('FOLLOWER'), 'case-normalized');
  t.ok(isVoterRaftRole(RAFT_ROLE.CANDIDATE));
  t.notOk(isVoterRaftRole(RAFT_ROLE.LEARNER));
  t.notOk(isVoterRaftRole(null), 'null is not a voter (fail-closed)');
  t.notOk(isVoterRaftRole(undefined));
  t.notOk(isVoterRaftRole(''), 'empty string is not a voter');
  t.notOk(isVoterRaftRole('voter'),
    'out-of-domain strings are NOT voters — fixtures must use enum values');

  t.ok(isLoadRoutableRaftRole('leader'));
  t.notOk(isLoadRoutableRaftRole('candidate'));
  t.notOk(isLoadRoutableRaftRole(null));

  t.ok(isRepairOnlyRaftRole('candidate'));
  t.ok(isRepairOnlyRaftRole('learner'));
  t.notOk(isRepairOnlyRaftRole('leader'));

  t.ok(isCatchupLearnerRaftRole('learner'));
  t.ok(isCatchupLearnerRaftRole('LEARNER'));
  t.notOk(isCatchupLearnerRaftRole('follower'));
  t.notOk(isCatchupLearnerRaftRole(null),
    'absent role is not a learner (predicates that must be fail-open on ' +
    'missing roles compose !isCatchupLearnerRaftRole)');
  t.end();
});
