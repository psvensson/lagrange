# Cutover seed parity: findings recorded in round-2 preparation (2026-09-24)

Recorded by the lead from the implementer's round-2 prep report (the harness refused the subagent a second records file). Not fixed in this unit.

- The owner retry loop returns only its last answer (`src/bootstrap/shared/retryable-control-plane-write.js:72-134`): ordering (iii) ends `not_routed` and loses the earlier OUTCOME_UNKNOWN. Linking it as a cause would change the classifier for every caller: owner decision.
- Join cleanup now retracts a failed joiner only from a pending candidate (`src/bootstrap/join-cleanup-publication-context.js:69`); a joiner already in a PUBLISHED epoch waits for liveness republication. Owner decision: should it also target published membership?
- `src/rebalancer/unified-rebalancer-priority-readiness.js:352-356,480-492` treats the planning answer's ids (the candidate during an OPEN epoch) as published membership and ignores the presence flag; left for the rebalancer owner (affects placement in the formation window).
- Carried over from round 1: write paths that bypass the single CDC `executeSQL` exit (verification-round-1-cdc-findings.md N5); membership-consistency test 2 is load-sensitive on base.
- Decision (b) for membership-consistency test 3 FAILED the owner's rule: without the placement read the reduced witness passes on the broken baseline 4258fdc32 in 2 of 3 runs and is not deterministic on the corrective (stop-at-first-red 10x red at run 2, step 5). Cause: the membership publication owner re-admits a lapsed member (the flap), present on Liferaft 9d85ac283 too (16-19 epochs/s, cadence ~88 ms; rs-raft ~40 ms). Pending the owner's decision.
