import {registerQuorumConditionedRemoveSafetyTailMoreTests} from './quorum-conditioned-remove-safety-tail-more-test-cases.js';
import {
  runReplacementElectionNudgeScenario,
} from './quorum-conditioned-remove-safety-tail-fixture-builders.js';

export function registerQuorumConditionedRemoveSafetyTailElectionRetargeting(context) {
  const {test} = context;

  // SUPERSEDED (R09) by the owner decision of 2026-09-25 (approved REPLACE
  // design, amendment-1 step 2), quest replace-source-removal-owner: the
  // tests that stood here pinned the CL-043 completed-election authorization
  // (BR11) and the H-B' replacement-leader retarget. A REPLACE's leadership
  // is now decided from a fresh read of its target replica's own port, and
  // its only handoff is one named-target attempt. The corrected contract is
  // witnessed in test/rebalancer/replace-named-handoff-attempt.test.js, whose
  // header lists every superseded test by name.

  test('RebalanceCoordinator - authoritative service rows with missing raft_role preserve cached follower evidence while waiting for leader ownership',
    async (t) => {
      await runReplacementElectionNudgeScenario(context, t, {
        authoritativeSourceRaftRole: null,
        evidenceLabel: 'cached follower evidence despite a missing authoritative raft_role',
      });
    });

  registerQuorumConditionedRemoveSafetyTailMoreTests(context);
}
