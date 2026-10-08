#!/usr/bin/env python3
"""Tests and one subordinate repository transition; no runtime activation."""
import sys
from pathlib import Path
root = Path(sys.argv[1]).resolve()
mode = sys.argv[2]
here = Path(__file__).resolve().parent
if mode == 'tests':
    p = root / 'test/rebalancer/message-group-membership-branch-authorization.test.js'
    s = p.read_text()
    assert 'async function authorizeInitial(' not in s
    p.write_text(s + (here / 'learner-authorization-tests.js').read_text())
    p = root / 'test/integration/message-group-membership-claim-cache.integration.test.js'
    s = p.read_text()
    anchor = "  const learnerFields = {message_group_membership_phase: 'learner_committed',"
    assert s.count(anchor) == 1, 'use corrected shared-seed fixture'
    s = s.replace(anchor, (here / 'learner-authorization-cache.js').read_text() + anchor, 1)
    p.write_text(s)
elif mode == 'source':
    p = root / 'src/rebalancer/replica-operation-message-group-membership-permit.js'
    s = p.read_text()
    old = "const MEMBERSHIP_PHASE = Object.freeze({LEARNER_COMMITTED: 'learner_committed',"
    assert s.count(old) == 1
    s = s.replace(old, "const MEMBERSHIP_PHASE = Object.freeze({LEARNER_REQUESTED: 'learner_requested',\n  LEARNER_IN_FLIGHT: 'learner_proposal_in_flight', LEARNER_COMMITTED: 'learner_committed',", 1)
    old = "const MEMBERSHIP_OBLIGATION = Object.freeze({UNKNOWN: 'unknown'});"
    assert s.count(old) == 1
    s = s.replace(old, "const MEMBERSHIP_OBLIGATION = Object.freeze({INTENT_RECORDED: 'intent_recorded',\n  UNKNOWN: 'unknown'});", 1)
    p.write_text(s)
    p = root / 'src/rebalancer/replica-operation-message-group-membership-owner-claim.js'
    s = p.read_text()
    old = '  MEMBERSHIP_AUTHORIZATION_OUTCOME as OUTCOME} from'
    assert s.count(old) == 1
    s = s.replace(old, '  MEMBERSHIP_PHASE, MEMBERSHIP_OBLIGATION,\n  MEMBERSHIP_AUTHORIZATION_OUTCOME as OUTCOME} from', 1)
    s = s.replace("const INITIAL_PHASE = 'learner_requested';", 'const INITIAL_PHASE = MEMBERSHIP_PHASE.LEARNER_REQUESTED;', 1)
    s = s.replace("const INITIAL_OBLIGATION = 'intent_recorded';", 'const INITIAL_OBLIGATION = MEMBERSHIP_OBLIGATION.INTENT_RECORDED;', 1)
    s = s.replace("const UNRESOLVED_OBLIGATION = 'unknown';", 'const UNRESOLVED_OBLIGATION = MEMBERSHIP_OBLIGATION.UNKNOWN;', 1)
    old = 'export {settleMessageGroupMembershipNonAdmission};'
    assert s.count(old) == 1
    s = s.replace(old, 'export {settleMessageGroupMembershipNonAdmission, membershipRowWhere, neverAuthorized};', 1)
    p.write_text(s)
    p = root / 'src/rebalancer/replica-operation-message-group-membership-authorization.js'
    s = p.read_text()
    old = '  membershipClaimIsLocalAndLive, membershipBootIsCurrent} from'
    assert s.count(old) == 1
    s = s.replace(old, '  membershipClaimIsLocalAndLive, membershipBootIsCurrent,\n  membershipRowWhere, neverAuthorized} from', 1)
    old = '''  if (!membershipClaimIsLocalAndLive(repository, claim, identity) ||
    next.workflowOwnerNodeId !== claim.ownerNodeId ||
    next.proposerNodeId !== repository.nodeId ||
    next.proposerBootIncarnation !== repository.membershipOwnerBootIncarnation ||
    next.workflowOwnerFence !== membershipOwnerClaimFence(claim) ||
    next.membershipLeaseExpiresAt !== claim.expiresAt) {'''
    assert s.count(old) == 1
    s = s.replace(old, '  if (!membershipPermitMatchesHolder(repository, next, claim, identity)) {', 1)
    s += (here / 'learner-authorization.js').read_text()
    p.write_text(s)
    p = root / 'src/rebalancer/replica-operation-repository.js'
    s = p.read_text()
    old = 'import {selectMessageGroupMembershipBranch} from'
    assert s.count(old) == 1
    s = s.replace(old, 'import {selectMessageGroupMembershipBranch, authorizeMessageGroupLearner} from', 1)
    old = '  /** Select a durable membership branch; never directly dispatches Raft. */'
    assert s.count(old) == 1
    s = s.replace(old, '''  /** Record initial learner intent; runtime and CREATE admission remain separate. */
  authorizeMessageGroupLearner(request) {
    return authorizeMessageGroupLearner(this, request);
  }
''' + old, 1)
    p.write_text(s)
else:
    raise ValueError(mode)
print('prepared ' + mode + ' only; no planner/handler/runtime activation')
