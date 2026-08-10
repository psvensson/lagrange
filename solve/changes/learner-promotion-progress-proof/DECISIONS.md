# learner-promotion-progress-proof — design decisions

Status: IMPLEMENTED. doneWhen probe green (scenario-harness,
learner-promotion-progress-proof, consecutive 3, metric priority ->
done:true, metric 0; latest evidence
test-output/reports/learner-promotion-progress-proof-2026-08-10T08-54-06-479Z.report.json,
produced by the final tree). Red-on-revert demonstrated: temporarily
reintroducing time-only promotion (unconditional becomeFollower before the
proof gate) fails the scenario deterministically (lagging learner promotes;
stale-term/epoch invalidation sub-tests go red); restoring the mechanism
returns it green.

## Sealed statement (quest)

A partition learner becomes a voter only after the current leader proves the
learner has applied through a safe promotion index for the current term and
membership epoch; time is only a retry/backoff input; snapshot-installed and
log-caught-up learners use the same progress contract; stale leaders and
membership changes invalidate the proof; promotion cannot reduce quorum
safety or exceed the target voter count.

## Verified current mechanism

- `src/partition/partition-service-learner-promotion-methods.js`
  `checkLearnerPromotion()` — the ONLY live promotion authority (only the
  partition service ever assigns `RaftRole.LEARNER`, in
  `partition-service-raft-init-base.js:512`). Gates: leader-identity
  discovery + quorum-shape (target count with replacement/critical/priority
  overflow budgets, even-voter avoidance). No progress condition. 30s
  INITIAL_DELAY, 1s DEFERRED_RECHECK.
- `src/raft/raft-replica-base.js` `checkLearnerPromotion()` — DORMANT:
  zero production callers of `scheduleLearnerPromotion`, and no code path
  ever sets a RaftReplicaBase-family replica to LEARNER (verified by grep;
  sole subclass `wasm-service-replica.js` never touches it). It is a
  parallel time-only promotion authority in waiting.
- Leader-side progress: none. `src/raft/liferaft.js` discards the
  per-follower `APPEND_ACK {term, index}` after batch dedupe
  (`inflightBatchByAddress`, cleared on state change). Base liferaft acks
  EVERY saved entry (single at index.js:326, batch tail at liferaft.js:523),
  so a complete progress signal already flows to the leader with
  `packet.address` identifying the follower.
- Snapshot install: receiver-side only (`orchestrateSnapshotCatchupInstall`
  recreates the service); the leader learns nothing directly — but the
  recreated learner resumes acking from `lastIncludedIndex` on the next
  append/catch-up traffic, so leader-observed acks cover snapshot-installed
  learners with no special case.

## Prior art (directive-mandated; what we reuse)

1. **etcd/raft learner promotion** — etcd promotes a learner when the
   leader-tracked `Match` for the learner is close enough to the leader's
   own progress (`isLearnerReady`: learner Match vs leader match). We adopt
   the same named wheel, tightened to the sealed statement: grant only when
   leader-tracked learner match >= the leader's committedIndex captured at
   proof time (a fixed catch-up target per evaluation, the Raft §4.2.1
   catch-up-round shape). The proof source is the LEADER's own observation
   (append acks), never learner self-report — a learner-supplied index is
   not part of the grant predicate at all.
2. **Closure ledger** — CL-003 (learner fails voter-ready within 60s;
   backpressure-capped catch-up) and CL-009 (BACKGROUND append fan-out
   skipped under per-source backpressure: catch-up "slow, never broken")
   record the empirical class: timer-based promotion either fires before
   catch-up (unsafe) or the timer is structurally mistimed. CL-042
   (election restriction, empty-log last-term) is the promoted-too-early
   voter hazard this quest closes at the membership level.
3. **models/exact-election-evidence-same-turn** —
   `ExactCompletedEvidenceCannotBeRetargeted` /
   `RemovalUsesCanonicalOwnerAndInterlock` prove the shape "evidence minted
   for one (owner, turn) must not authorize a different one"; our proof is
   bound to (leaderId, term, membershipEpoch) and re-validated after the
   round trip, fail-closed on any drift. models/leadership-failback
   (`EventuallyClosed`) motivates the loud, bounded retry loop.
4. **Membership epoch authority** — reuse the snapshot-catchup identity
   epoch (`buildSnapshotCatchupIdentityFromCache` →
   `selectLatestPublishedMembershipEpoch` over cached
   `control_plane_publications` rows, 0 at bootstrap;
   `src/raft/snapshot-catchup.js:111`). One epoch author for snapshots and
   promotion proofs; no second epoch definition.
5. **Request/response channel** — the existing application-message switch
   (`handleApplicationMessage` in `partition-service-entry-apply-base.js`);
   `transport.deliver()` returns the remote handler's result (same channel
   as FORWARD_WRITE/QUERY/TRANSACTION). No new transport machinery.
6. **Catch-up fence vocabulary** — typed decision/reason enums following
   `publication-active-gate-handoff-contract-constants.js`
   (PROMOTION_ALLOWED/DENIED, evidence AVAILABLE/STALE/UNAVAILABLE shape).
7. **Recorded unwired seam** — `src/rebalancer/replica-inventory.js`
   `replicationStateByReplicaId` expects `{promotable, matchIndex}` with no
   producer; this quest creates the leader-side matchIndex truth it was
   waiting for. Wiring the inventory consumer is OUT of this quest's scope
   (promotion authority must stay single); recorded as follow-up.

## Design

**Safe promotion index** := the leader's committedIndex read at proof
evaluation time, while the leader's liferaft state is LEADER in its current
term. Justification: (a) fixed target per evaluation — no moving-goalpost
chase (Raft §4.2.1); (b) the committed prefix is exactly what a correct
voter must hold so counting its vote can never roll back a committed entry
(election-restriction safety, CL-042); (c) matches etcd's Match-vs-leader
progress predicate. "Applied through": the grant predicate is
leader-observed learner match >= safePromotionIndex, where match is the
index the learner has durably SAVED (acked); the same append packet that
carries the leader's commitIndex applies the entries synchronously on the
learner (commit apply is same-turn in liferaft), and the checkpoint
invariant `appliedIndex === committedIndex` holds at every boundary — the
same operationalization etcd uses (Match-based, not state-machine-lag
based).

**Progress tracking (raft layer, replication-progress owner):**
`liferaft.js` records `followerMatchIndexByAddress` (max acked index per
follower address) at the existing APPEND_ACK interception point, cleared on
RAFT_STATE_CHANGE_EVENT exactly like `inflightBatchByAddress` — so retained
progress was all observed during the leader's current uninterrupted tenure
(term-scoped by construction; a stale leader's map dies with its
leadership). Accessor exported from liferaft.js.

**Proof contract (new module `src/raft/learner-promotion-progress.js`):**
pure decision functions, single decision table each:
- `evaluateLearnerPromotionProof(facts)` (leader side): refuse NOT_LEADER /
  TERM_UNAVAILABLE / EPOCH_UNAVAILABLE / EPOCH_MISMATCH / PROGRESS_BEHIND;
  grant carries `{term, membershipEpoch, safePromotionIndex,
  learnerMatchIndex}`. Missing progress evidence reads as match 0 —
  fail-closed for any non-empty committed prefix, trivially granted only
  when there is nothing to apply (formation-empty-log case, which is what
  makes formation ADDs promote in ~1s instead of 30s).
- `validateLearnerPromotionProofResponse(observation)` (learner side):
  refuse ROLE_NOT_LEARNER (incl. shutdown/restart between proof and
  promotion — proof state is never persisted, so a restart re-derives from
  scratch by construction) / PROOF_NOT_GRANTED / LEADER_CHANGED /
  EPOCH_CHANGED / STALE_PROOF_TERM (proof.term < learner's current term).

**Promotion owner (partition service) — unchanged authority, new necessary
condition:** `checkLearnerPromotion()` keeps every existing gate in order
(leader discovery → quorum-shape gates), then LAST requests the proof from
the discovered leader over the application-message channel
(`LEARNER_PROMOTION_PROOF` message; leader-side handler gathers facts and
answers with the module's typed outcome), then re-validates
leader/epoch/role freshness after the round trip, and only then
`becomeFollower()`. Every refusal logs LEARNER_PROMOTION_DEFERRED with the
typed reason and reschedules DEFERRED_RECHECK — time is only the retry
cadence. The method becomes async; the timer callback catches and
reschedules on unexpected errors (loud, never a dead retry).

**Time demoted to retry input:** INITIAL_DELAY now resolves to
`learnerCatchUpCheckIntervalMs` (1s) — the 30s stability delay and the 5s
priority-recovery/formation fast-path delays existed only because the
promotion condition was time; with a progress proof the first check may run
as soon as a leader can answer. `isPriorityControlPlaneFormationLearnerPromotion`
(the formation special-case) is deleted as superseded — its docblock's
~10s activation-gate budget is now met structurally (proof RPC is one
round trip). `LEARNER_PROMOTION_DELAY_MS` / priority-recovery delay
constants and fields are removed with it.

**Dormant raft-layer promotion path retired:** raft-replica-base's
scheduleLearnerPromotion/checkLearnerPromotion (+ timer/fields/constants)
are deleted, not extended — zero callers, no LEARNER source, and keeping a
second, time-only promotion authority alive contradicts the sealed
statement and the existing-owner-reuse constraint (ground truth: finish or
retire, never parallel). The raft layer's role in the contract is
replication-progress truth + proof evaluation.

**Quorum safety:** the quorum-shape gate block is byte-identical and runs
before the proof; the proof is strictly AND-ed. No gate weakened; voter
counting/target/even-voter behavior unchanged.

**Attack coverage mapping (constraint `attack-coverage`):**
- slow learner past old timer → PROGRESS_BEHIND refusal test
- snapshot install still applying → no acks yet → match unavailable →
  refused; post-install acks satisfy the same predicate (one contract)
- leader change after proof collection → LEADER_CHANGED / STALE_PROOF_TERM
- membership epoch change → EPOCH_MISMATCH (leader) / EPOCH_CHANGED
  (learner revalidation)
- learner reporting future/stale index → not an input: grant uses only
  leader-observed acks; the request carries no self-reported index
- restart between proof and promotion → in-memory only, re-derived
- even-voter / target-count pressure → existing gates, regression-tested
- priority control-plane partition behavior → overflow-budget gates
  unchanged, regression-tested

## Evidence plan

- Deterministic red-on-revert tests: liferaft match-index tracking;
  proof-contract decision tables; partition-level lagging/caught-up/
  invalidation through the REAL message channel; existing promotion tests
  updated (proof stubbed only where the unit under test is a quorum gate).
- Named scenario `learner-promotion-progress-proof`: five-replica recovery
  scenario driving real PartitionServices over the loopback transport
  (fidelity: in-process deterministic guard, honest `fidelity` stamp);
  standalone runner `scripts/run-learner-promotion-progress-proof-scenarios.js`
  writing the probe-conform report; blocked/infra-failed runs emit
  verdictReason `execution_incomplete_or_metrics_missing` (the
  NON_MEASURING_VERDICT_REASONS member) so the probe skips them.
- doneWhen: `solve.js probe --probe scenario-harness --scenario
  learner-promotion-progress-proof --consecutive 3 --metric priority`.

## Implementation deltas discovered during build

- **Term 0 is a legitimate live term.** A single-replica bootstrap leader
  that never ran an election serves at term 0 (raft-init assigns LEADER by
  `raft.change`, no vote). The proof binds to non-negative terms; requiring
  a positive term deadlocked the real stable-join fixture.
- **Leader-side progress probe (liveness closure).** An exactly-caught-up
  IDLE learner (the snapshot-installed shape: full log, no traffic) never
  acks on pure heartbeats, so the leader would hold zero progress evidence
  forever — a refuse-loop livelock (retry-loops template item 4 /
  leadership-failback EventuallyClosed). On a PROGRESS_BEHIND refusal the
  leader re-sends its last log entry to that learner (fire-and-forget,
  bounded by the learner's 1s retry cadence): a caught-up learner does a
  same-identity save and acks (evidence materializes); a lagging learner
  append-fails into the EXISTING catch-up batching. No new retry machinery.
- **Dormant raft-replica-base path retired, tests updated:** the
  base-class shutdown test no longer asserts a learnerPromotionTimer.
- **Existing tests updated, not weakened:** promotion-asserting quorum-gate
  unit tests stub ONLY the transport hop
  (`checkLearnerPromotionWithGrantedProof` /
  `stubGrantedLearnerPromotionProof` in partition-service-test-support.js);
  the real evaluator and validator still run. The five-node scenario runs
  the full chain with zero stubbing.
- **Benchmark budget floor localized:** the postgres-baseline harness used
  the 30s promotion-delay constant as a preload budget floor; that floor is
  now a local named constant there (BENCHMARK_LEARNER_CATCHUP_BUDGET_MS),
  keeping the historical worst-case allowance.

## Independent verification (constraint source-change-subagent-verification)

An adversarial verifier subagent (armed with the quest's four templates:
admission-gating, recovery-replay, retry-loops, sweep-timer) reviewed the
full diff, re-ran the focused tests (4/4 green) and the doneWhen probe
(PASS), and returned **Approve, no MUST-FIX**. Dispositions:

- **Fixed in this quest** (was SHOULD-FIX finding 3): `recordFollowerMatchIndex`
  now requires `packet.term === raft.term`, so a delayed cross-tenure ack
  can never survive the state-change clear as progress evidence; regression
  test added ("an ack from a different term is never recorded",
  test/raft/liferaft-follower-match-index.test.js).
- **Recorded follow-up** (SHOULD-FIX finding 2, PRE-EXISTING, outside this
  diff): the LEADER lifecycle event is not suppressed for joining learners
  (`wireReplicaLifecycleEvents` default `shouldIgnoreLeaderEvent: () => false`;
  partition wiring passes only the FOLLOWER/CANDIDATE suppression), so a
  joining learner that somehow wins an election would assume leadership
  without a promotion proof. Narrow reachability (appends re-arm the
  election timeout; vote broadcast precedes the suppressed CANDIDATE
  cleanup). Recommended fix: gate the LEADER event (or
  `applyReplicaLeadership`) on `!isCatchupLearnerRaftRole` while
  `isJoiningExistingGroup`. Deliberately NOT patched here: election-path
  wiring changes have formation-wide blast radius and the behavior predates
  this quest.
- Notes accepted: the promotion check timer remains a native interval
  (injectable via `learnerCatchUpCheckIntervalMs`; DT scenarios drive the
  guard directly — sweep-timer template deviation is pre-existing pattern);
  the runner duplicates the non-measuring reason literal rather than
  importing scripts/solve/constants.js (scripts/ -> scripts/solve import is
  fine to tighten later); quorum-shape counts are read one RPC round trip
  before promotion (dwarfed by the cache-lag races the gates already
  tolerate).

## Live-run observation

Not run (optional). The doneWhen evidence is the deterministic scenario;
the boot-throughput effect on the 3-node examples catalog is left for Q1's
next live baseline run to observe (formation ADD learners should now
promote on the first 1s retry tick instead of the 30s floor).

## Pre-existing failures observed (NOT caused by this quest; verified at
## clean HEAD in a scratch worktree)

- `test/integration/critical-partition-learner-safety.integration.test.js`
  fails 6/7 identically at clean HEAD 6a67d26c3 (REMOVE admission returns
  "self-move in flight" instead of the learner-safety refusal).
- `npm run test:complexity` is over baseline at clean HEAD (1846 > 1842);
  the working tree adds +4 from Q1's dirty public-path files and -3 from
  the co-session's staged rebalancer files (net 1847). This quest's files
  contribute NET ZERO violations (per-file diff against the HEAD report).
- Voter-readiness single-owner census reports 1 pre-existing site
  (move-planner-move-calculation-methods.js:274), identical at clean HEAD.

## Boundaries honored

No commits; no edits to solve/log/**, solve/quests/**, Q1-dirty files
(test/distributed/harness/* dirty entries, public-path-* scenarios,
in-flight rebalancer/operation-workflow files).
