# Defect-class recurrence history — Lagrange, 2026-11-11

Read-only research for the lead. No file in the repo was edited, no git state changed, no test run.
Method: keyword greps over solve/quests/*/{quest.json,log.ndjson} (1,107 quests), solve/epics/**,
architecture/**, docs/development/adversarial-risk-review-2026-10-10.md, `git log --all --grep/-S`,
and the lead's memory notes; then the hits were read in context windows. Three parallel research
forks wrote the per-class sections that follow (A/D/E, B/C/G, F/H/I/J); this header is the synthesis.
Counts are **lower bounds**: one occurrence per quest/commit, keyword-found only.

Spot checks by the lead: 5f17f349b (2026-05-24, split of publication-active-gate-handoff-contract) and
ab64fb4f5 (2026-05-29, owner-recovery reentry/drain) dates confirmed; the 08-22 "hot defer loop" is in
solve/quests/release-0-2-verification-v2/log.ndjson. **Correction to the A/D/E section:** it says
`OwnerKeyReconcileQueue` is unchanged since 2026-04-30; `src/workflow/owner-key-reconcile-queue.js`
was last changed 22420f874 (2026-09-15), before that f9b82ded7 (08-25), d29c7d8c8 (08-21). The
substantive point (no progress/input-digest check on self-re-enqueue) was not re-verified against that
history.

## Ranked table (by earlier recurrence)

| Rank | Class | Earlier occurrences (lower bound) | Earlier fixes | Guard that should have caught today's instance | Why it missed | Strongest prevention |
|---|---|---|---|---|---|---|
| 1 | E hold/latch with no clearing event | 24 (05-08 → 11-07) | 3 per-owner event-wake fixes (spread 08-10, participant release 11-02, planner 11-11); rest local | check-hold-engagement-owner.js; unwired-event-census.mjs; write-then-read-projection census; TLA lost-wake | hold-engagement covers only ledger-hold *engagement*; event census checks unlistened events, not holds whose clearing event is never produced; TLA only startup handoff | One hold/latch primitive (reason, clearing events, bound, bound outcome), registered; ban ad-hoc `held`/latch fields; producer-independence check |
| 2 | D unknown outcome dropped / spent wait decides | 22 (06-10 → 11-07) | local; rule exists only as text (authority-and-recovery.md:190, 10-04 ruling "absence never completes a step") | wait-bound-spent.js + ~30 wait-bound-spent tests; fixed-work-bound-census; catch_returns_default ratchet | they make expiry *visible* but encode it as failure; census excludes attempt-count bounds (D4 is 3/3 attempts); ratchet is syntactic | Typed write outcome COMMITTED/REFUSED/UNKNOWN{writeKey}; UNKNOWN resolved only by exact readback or retained; static ban on expiry branch → fail/retire/terminal |
| 3 | A hot loop on unchanged input | 17 (06-11 → 11-02); 08-22 hot defer loop in D1's own owner family, routed, no fix found | all local | none (only the 600 s test timeout caught D1) | queue dedupes by key and backs off only thrown failures; contracts require a wake to *exist*, a wake firing forever satisfies them | No-progress rule in OwnerKeyReconcileQueue: self-enqueue carries input digest or named wake; unchanged digest parks the key on the wake/retryAfterMs and logs once |
| 4 | J legacy/fallback masked a failure | 14+ (05-08 → 11-11); spread_satisfied_in_flight mask fixed locally 4× in 8 days (06-23..30) | mostly local; class fix 10-04 (one-spread-authority), 10-24 deletions | check-no-legacy-naming, fallback-branch census, navigability ratchets, legacy-fallback closure | they did fire on today's new syntax (32 over, 10 unclassified); miss semantic fallbacks (no fallback syntax, compensation sweeps, dead branches, baselined inherited sites); closure checker checks labels + file existence | Total read outcome PRESENT/ABSENT/UNAVAILABLE at the port + check that every call site handles all three; compensation sweeps count each repair as a defect |
| 5 | C classification drift | 13 (04/05 → 11-10), ≥5 in the retry classifier itself (09-23: one text fragment deleted → ~40 call sites non-retryable) | local; 09-23 moved one owner to code-first | CONTROL_PLANE_ERROR_CODE_DECISION table; runtime-grammar-contracts; deferred-outcomes check | table covers only the retry decision, handoff predicate is a second classifier outside it; grammar check is text-only; deferred-outcomes went stale unwired; nothing bans `message.includes` | One decision table per outcome family, every predicate (transient/handoff/reroutable/permanent) derived from it; table-generated test code×predicate; ratchet text matching to 0, rethrows keep errorCode |
| 6 | I re-derived rule / duplicate authority | 11 (07-13 → 11-07) | 4 class-level, each for one rule with its own bespoke census | cache-write callsite guardrail; NODES mutation census | **they did fire on D3**; callsite-based, cannot tell a scratch cache from the node's, whitelisting would be wrong | Owner exports the pure rule (fold/predicate/table); one generic construct-site census (owner classes built only by their composition owner) |
| 7 | G one family member / partial migration | 11 (06-22 → 11-07); ≥8 instances today (schema_operations-p1 omitted from hand-built handoff list → 9.5–22 s leaderless; admin list still omits it; sql_write_operations absent from CRITICAL_TRANSPORT set; detach primary) | one class attempt (08-12 failed-authoritative-read invariant with hand-picked 4-predicate matrix) — today ~35 consumers needed reclassifying | partition-class-owner checker; failed-read test matrix; R18 | checker tracks one critical set + old predicates; matrix hand-enumerated; R18 has no mechanical check | Family membership derived, never hand-listed (ban hand-built partition/table/recipient sets outside the classification owner); new producer state → import-graph consumer list with asserted decision per consumer |
| 8 | F armed once / late-created never attached | 10 (08-10 → 11-11), 4 owners | 2 class-level for one owner each (armPropagationTimer 09-24; subscribe-before-recheck 09-25); 10-24 subscribe-before-hydrate only at partition boundary, group boundary deferred | none (runtime-contracts.md:356-367 states the transfer rule, unchecked) | no listener/subscription census exists | Attach-on-create primitive owned by the creating registry, subscribe before reading the current set; "created after arm" witness per subscriber owner |
| 9 | H unbounded growth pinned by dead/slow consumer | 10 (06-15 → 11-11), 7 owners; `statsByNodeId` never pruned since 09-03 **still open** (projection-readiness-evidence-owner.js:108-121) | 1 class-level for one ledger (CDC D1 reclamation e1d26e0eb) | system-table-retention-budget.js (untracked, created today, declares lifetime only); runtime-contracts.md:528-536 owner/bound/teardown | nothing enforces it for in-memory Maps; no dead-consumer detach rule | Every keyed collection names the lifecycle event that deletes a key, wired from the lifecycle owner; plateau witness under churn; detector for class-field Map with `.set` and no lifecycle-reachable `.delete` |
| 10 | B dead read/check made live | 9 dead reads created, 3 earlier later broke a consumer when revived (D1, D2 are the 4th/5th) | all local | check-constant-member-existence.js (new today, found 40 in src; 1,329 reads unexamined) | it is the *trigger*: code-style.md:91-94 advises "use the owner's existing member or define the member" — revives the read with no consumer review; unused-exports ignores reads; navigability baselines the inherited `??` | Constant objects throw on unknown member in test/dev; checker records a per-site decision delete-or-revive; revive requires consumer census + production-entry test of the newly reachable branch |

B is ranked last by count but it is the **trigger** of today's D1 and D2, and ~38 other constant-member fixes in today's tree have not been checked for the same effect — the most urgent single follow-up.

## Patterns across classes (one page)

**Owners that recur.** Three owners account for most occurrences in every class:
(1) the operation workflow / replica-operation ledger (REPLACE terminalization, ledger self-move hold,
ADD admission latch) — A, D, E, G, H; (2) control-plane membership publication and readiness/planning
(active-gate reconcile, readiness snapshot owner, planner wakes, 52 readiness services) — A, B, E, I, J;
(3) CDC propagation/delivery since the rs-raft R2 line (10-24 obligation ledger, lane wedge, late
subscriber, acceptance_unknown) — C, D, E, F, H, I, J. The rebalancer spread/fence family is fourth
(F, I, J). The same files reappear across months: the 08-22 hot defer loop and today's D1 are in the same
publication owner; the 10-24 "refusing subscriber wedges the lane" and today's terminal `lane.held`
are the same mechanism; the 07-04/07-08/08-22/11-07 spent 60 s voter-ready wait → FAILED is one path
recurring four times.

**Changes that introduce them.** (a) Strengthening a producer (new outcome state, new reason code,
three-state reads) without a consumer census — the B/C/G chain, which then surfaces as A/D/E at the
consumer: D1 = B (revived read) → A (loop); D2 = B → C (handoff predicate) → D (no retry). (b) Refactors
and splits that leave a constant read dead (5f17f349b split, April–May router refactors), later revived
by a "fix the undefined" sweep. (c) Hand-enumerated sets and matrices (partition lists, failed-read test
matrix, bespoke per-rule censuses) that new members never join. (d) Waits added as a timer or attempt
bound instead of a subscription to the clearing event, which later become decisions (D) or wedges (E).
Earlier fixes were overwhelmingly local; where a class fix happened it was per-owner (event wake for
spread, CDC D1 reclamation, 52→1 readiness), so the next owner repeated the class.

**The three highest-leverage class-level repairs.**

1. **A wait/hold/reconcile primitive with named clearing events and a no-progress rule** (covers A, E,
   most of F). Every hold, latch, deferred wait and self-re-enqueue goes through one owner primitive that
   takes {reason, clearing events, input digest, bound, bound outcome}; an unchanged digest parks on the
   named wake; ad-hoc `held`/latch fields and `setTimeout(0)`/setImmediate self-requeues are banned
   statically; a registry check proves each clearing event has a producer independent of the hold.
   Would have prevented: D1 and the 08-22 hot defer loop (same owner), 11-02 handleStaleCompletion
   (~11k re-enqueues in 4 s), 10-04 claim/setTimeout(0) merge loop (1,767 refused writes in 2 s), 09-06
   projection retry against a captured stale route (all A: unchanged-input re-run); the 10-24 and today's
   CDC lane hold, 08-22 ledger-quorum spread hold with no release path, 10-04 in-process hold after a
   failed hold write, 11-07 ADMITTED latch, CL-043, CL-028/036 circular gates (all E: no clearing event
   or a clearing event that depends on the hold); and with "subscribe before reading the set" built in,
   the 10-24 late CDC subscriber (344/600 events missed) and today's attachment listener (F).

2. **Typed outcome vocabularies with one decision table per family, and a total-handling check**
   (covers C, D, the semantic half of J, and the "meaning lost at the next consumer" half of G).
   Write outcomes COMMITTED/REFUSED/UNKNOWN{writeKey}; reads PRESENT/ABSENT/UNAVAILABLE; error codes in
   one table from which every predicate (transient, handoff, reroutable, permanent) is derived; a static
   check that every call site handles every member, that no expiry branch reaches a terminal transition,
   and that src has zero `message.includes`/regex error matching (rethrows keep `errorCode`); a test
   generated from the table asserts every code against every consumer predicate.
   Would have prevented: D2 (handoff predicate outside the retry table); 09-23 B7/F-am (one text fragment
   deleted → ~40 sites non-retryable) and F-aj (unknown outcome rerouted by text → double apply); 07-06
   singular/plural text; 11-05 PROVISIONING_UNAVAILABLE classed permanent; 07-17 thrown read treated as
   absent clearing a pending durable update; 08-10 failed callback read returned as a clean empty;
   08-30 null point read admitting a second self-move; 07-04 → 11-07 spent 60 s voter-ready wait →
   FAILED; D4's attempt bound ending an UNKNOWN; 10-10 review's NO_TRANSACTION read as COMMITTED.

3. **A consumer-census gate on producer changes and on revived reads** (covers B, G, and the census half
   of I). (i) Constant objects frozen with a throwing proxy in test/dev, and the constant-member checker
   changed to require a recorded per-site decision delete-or-revive, where revive demands an import-graph
   consumer list and a production-entry test of the newly reachable branch (correct code-style.md:91-94);
   (ii) when a producer gains an outcome state, the import graph lists every consumer and each must assert
   its decision for that state; (iii) family membership (partition classes, critical tables, recipient
   kinds) is derived from the classification owner, hand-built sets banned; (iv) one generic
   construct-site census replaces per-rule bespoke censuses.
   Would have prevented: D1 and D2's triggers; 7fa4d79ae (10-24, gate made reachable → ~18 base reds);
   1164f49b1 (10-03, `undefined === undefined` matcher); 56ebbedb9 (07-05, undefined constant → poison
   Raft entry); today's schema_operations-p1 omission from the hand-built handoff list (9.5–22 s
   leaderless) and the still-open admin list; `sql_write_operations` missing from the critical transport
   set; the 09-05 null-epoch sibling owner; the 08-12 hand-picked failed-read matrix that today needed
   ~35 consumers reclassified; D3 (an exported pure fold makes the scratch cache unnecessary).

H (retention) is real and recurring but is better served by its own owner (the retention epic plus a
Map `.set`-without-lifecycle-`.delete` detector) than folded into these three; the open `statsByNodeId`
leak (since 09-03) is a direct next action.

## What was not read (union of the forks)

Full quest log bodies (keyword context windows only; first match per quest for A/D/E); solve/changes/**
(not searched); architecture/contracts/** beyond invariants.json and grep hits; epic bodies beyond grep
hits (golden-capability-gold-plating.md, control-plane-truth-local-converged-read.md not read in full);
test/distributed/operational-ground-truth.md (B/C/G fork did not read it); checker bodies (headers only
for most); TLA models; the fixed-work-bound-census table; whether the 07-06, 10-05 and 11-02 growth items
were ever fixed; whether the ~38 other constant-member fixes in today's tree changed behaviour; today's
D2 state in the working tree (reported repaired after the triage, unverified).

---

# Per-class sections (from the research forks)

# Classes A, D, E — recurrence history (fork report, 2026-11-11)

Method: keyword extraction over all `solve/quests/*/log.ndjson` (python/jq helper
`scratchpad/history/ctx.py`, first match per quest), quest statements, the 43-entry
closure ledger `solve/specs/membership-lifecycle-placement-hard-cutover/closure-ledger/CL-*.md`
(STATE headers only), epics `latent-convergence-blocker-census`, `publication-readiness-churn-liveness-closure`,
`self-hosting-circularity-generic-treatment` (front matter + grep), `architecture/runtime-contracts.md`,
`architecture/contracts/{authority-and-recovery,readiness-handoff-liveness,active-gate-convergence}.md` (grep),
`docs/development/adversarial-risk-review-2026-10-10.md` (§Leg A, recovery), `git log --all --grep`,
`git log -S`, memory notes named below. Dates are the first log/commit date of the record.

## Class A — hot loop / livelock: a reconcile, retry or wait re-runs itself on unchanged input

### Earlier occurrences (17 before today)

| Date | Record | What broke / where | Fix | Scope |
|---|---|---|---|---|
| 2026-06-03 | 01d5ea6e2 | rolling-restart live-lock (readiness/dispatch retries) | readiness reserve + bounded retries + lane admission | local |
| 2026-06-11 | CL-008, 0df23df06 | reused in-flight move re-dispatched (rearm) every planning cadence | rearm guard on reuse | local |
| 2026-06-11 | CL-009, 2bfdca120 | outbound backpressure: warn storm + hot-retry of a stillborn replica | per-queue rate limit (sender pacing left open) | local |
| 2026-06-19 | e57f9444c | seed readiness-repair storm via cooldown bypass | floor on cooldown-bypass repairs | local |
| 2026-07-01 | 11e56c028 (rolling-restart-w1-…-unwedge) | delivery-triggered reconnect storm | restored per-target reconnect rate budget | local |
| 2026-07-04 | movielens-affinity-placement-demo | membership reconcile spams "not the control_plane_publications writer" while publications-p1 mid-REPLACE | none recorded for the loop itself | — |
| 2026-07-06 | dc141f50f (TLA model ledger-selfmove-remint), fba0b4778 | operation-ledger self-move re-mint livelock (limit cycle) | fresh-leader authoritative read breaks the cycle | local, modelled |
| 2026-07-15 | transition-mutation-budget-doom-loop (bac22d0c8) | exhausted budget returns a 1 ms timeout → permanent sub-viable retry loop | fail fast on exhausted budget | local |
| 2026-08-09 | raft-committed-prefix-conflict-livelock (788682214) | every heartbeat re-requests a truncation the adapter must refuse | route to snapshot repair exactly once | local |
| 2026-08-11 | user-table-leader-handoff-demotion-pairing-v2 | directed-election 1 ms arm clobbered by heartbeat stream → election livelock | order demotion before election | local |
| 2026-08-22 | release-0-2-verification-v2 (8180d48d2) | **"hot defer loop spamming not-publications-write-leader reconcile decisions"**, readiness_inherited_active_gate_no_progress, RSS growth on 4/7 nodes — same owner family as D1 | routed to "owner-level deterministic reproduction"; no fix found in the records | open/unowned |
| 2026-08-31 | release-0-2-five-node-convergence | ReadinessPlanningSnapshotOwner token-rotation live-lock: build stamped STALE whenever token advanced mid-build, never lands current (88 s) | generation floor / version key quests | local |
| 2026-09-06 | replica-projection-stale-leader-route-resync | projection writes retried forever against captured stale leader metadata | re-resolve route on repeated no-leader | local |
| 2026-09-28 | replica-lifecycle-durable-generation | mg-1 election livelock term 3→202 after leader relocation without transfer | candidate change reverted/reshaped | local |
| 2026-10-04 | zero-liferaft-active-runtime (B3b) | losing merge owner hot-looped claim/setTimeout(0): 1,767 refused writes in 2 s | owner ruling fail-closed; one timer at a live foreign lease | local |
| 2026-11-02 | serve-eligibility-committed-epoch-read | `handleStaleCompletion` re-enqueues a LIVE_VETO rebuild on each setImmediate, ~11k rebuilds/4 s, when the cache lacks a mutation version | test teardown fixed only; production "unreachable" | local (test) |
| 2026-11-02 | participant-release-permanent-refusal | release recovery owner re-drives every RECOVERY_RETRY_MS with the same membership generation | woken only by a committed configuration change | class-shaped for that owner |

Today: D1, `membership-publication-active-gate-reconcile.js` owner-recovery wait re-enqueues
`ACTIVE_GATE_HANDOFF_OWNER_RECONCILE` with the captured `publicationActiveGateHandoff`. The
branch dates from 2026-05-29 (ab64fb4f5 "active-gate owner recovery reentry drain",
bcbfedc29 "owner reconcile wake scheduling route"): designed as a "bounded owner-recovery
wait reentry/drain" under R13, but dead until today's reason-code read made
`pendingRecoveryCount > 0` reachable. (Working tree now carries a comment "The
owner-recovery wait never re-enqueues itself" — an in-flight repair, unverified.)

### Local vs class-level
All 17 fixes were local to the looping site. The only class-shaped fix is
participant-release-permanent-refusal (wake only on the input that can change the
answer), and it is per-owner. The publication/readiness owner family has three
priors (07-04 spam, 08-22 hot defer loop, 08-31 token live-lock) plus the
2026-05/06 rolling-restart CL-001 re-drive work — it is the most recurrent A owner.

### Guards today and why they missed D1
- `OwnerKeyReconcileQueue` (src/workflow/owner-key-reconcile-queue.js, unchanged since
  2026-04-30) dedupes by owner key, caps concurrency and `maxItemsPerDrain`, and backs off
  only *thrown retryable failures*. A successful reconcile that re-enqueues its own key is
  re-run immediately; there is no progress token / input-digest comparison.
- Contracts require liveness, not progress: `active-gate-convergence.md:110` ("a drain or
  wake action stays enabled until those nodes publish") and
  `readiness-handoff-liveness.md` (`durable-transition-has-recoverable-wake`). TLA lost-wake
  configs catch a missing wake; a wake that fires forever satisfies them.
- No static checker covers self re-enqueue (grep of scripts/check-*.js, scripts/checks/*.js
  for re-enqueue/livelock/no-progress: nothing). The only guard that caught D1 was the
  600 s test timeout of `completed-placement-autonomous-progress.test.js`.
- The dead-branch origin (B) made it invisible to every test at HEAD.

### Strongest prevention suggested by history
Owner primitive in `OwnerKeyReconcileQueue`: an enqueue from inside the same key's
reconcile must carry an input digest (or the wake source it waits on); the queue refuses
an immediate re-run when the digest is unchanged and instead parks the key on the named
wake or `retryAfterMs`, emitting one `wait_bound_spent`-style no-progress line. Pair with a
TLA/DT fairness property "every re-run consumes a changed input" (not just "a wake
exists"). This would have stopped D1, 08-22 hot defer loop, 11-02 LIVE_VETO loop, and
the participant-release re-drive.

## Class D — unknown/ambiguous outcome dropped, read as failure/success, or ended by a spent bound; spent waits as decisions

### Earlier occurrences (22 before today)

| Date | Record | What broke / where | Fix | Scope |
|---|---|---|---|---|
| 2026-06-10 | CL-006, da8a5d53d/f18efdb7d | transient join-step timeout treated as fatal, regressed durable join progress | resume-eligible at throw site | local |
| 2026-06-12 | CL-023, 6a7ad7400 | priority-recovery drain ghost-retired REPLACEs (asserted retirements that never happened); new ghost vector found in verification (939c8829c) | drain no longer retires without evidence | local |
| 2026-06-12 | CL-029, 2ba293b77 | target-completion evidence dropped without a retry owner | retain retry owner until applied | local |
| 2026-06-17 | CL-043 | persist-failed surplus REPLACE blocked peer drains forever (no terminal-timeout anchor) | terminalize | local |
| 2026-07-04 | formation-voter-surplus-promotion-deferral-livelock, 70e434e6b | 60 s voter-ready wait spent → failOperation; terminal write reported committed but was not ("persistence ghost") | terminal-transition durability repair | local |
| 2026-07-06 | 064960394 | terminal confirmation read the local copy | leader-pinned authoritative confirmation | local |
| 2026-07-08 | formation-ledger-self-move-blocks-cluster-ops | 13× "did not become voter-ready within 60000ms" → FAILED | — | — |
| 2026-07-15 | movielens-pre-schema-quiescence-live | admin response deadline treated as failure | typed as retryable ambiguous, idempotent replay | local |
| 2026-08-10 | terminal-write-refusal-retry-ownership | refused terminal transition cleared its retry state at entry (obligation dropped) | clearing only after proven commit | class-shaped for workflow terminals |
| 2026-08-10 | partition-callback-read-failure-typed-outcome | failed partition read returned a clean empty result | typed failedPartitions | local |
| 2026-08-10 | learner-promotion-progress-proof | learners promoted on elapsed time (30 s timer), no progress proof | leader-proven progress only | class-shaped for promotion |
| 2026-08-22 | failed-replica-removal-transition-tolerance | ADD voter-ready spent (10 s) → cleanup REMOVE rejected | — | local |
| 2026-08-30 | memory operation-ledger-self-move-hold-fairness | orphan reservation release + null point read admitted a second ledger self-move (absence read as terminal) | release only on positive terminal row | local |
| 2026-08-30 | schema-provisioning-collision-retry-closure | authoritative-not-confirmed collision → terminal FAILED poisoning later CREATEs | classified transient | local |
| 2026-09-23 | raft-rs-single-path-partition-cutover | executor rerouted an unknown outcome by text → double apply (v++) | code-first, client told unknown | local |
| 2026-10-04 | zero-liferaft-active-runtime (B3a) | awaitLease returned silently on NaN; owner ruling "absence never completes a step" | fail-closed | ruling (class) |
| 2026-10-07 | message-group-fresh-identity-membership | lost-answer ADD_LEARNER could disappear | durable pending authority before proposal | local |
| 2026-10-10 | adversarial review §Leg A; replicated-transaction-decision-and-apply | `resolveParticipantCommitMiss` read NO_TRANSACTION as COMMITTED; COMMITTING timeout could enter rollback | immutable decision before fanout | class-shaped for 2PC |
| 2026-11-01 | comparative-benchmark-evidence-repair, learner-host-from-committed-admission | `cdc_committed_acceptance_unknown` 4,838× / 6,771×, rows never reach the cache | handed to CDC D1-D4 owner | deferred |
| 2026-11-02 | replica-admission-from-committed-operation | acceptance_unknown = deferRetry with backoff forever; proposal: owner deadline then permanent typed refusal | handed to CDC owner | deferred |
| 2026-11-02 | fresh-create-failure-after-committed-admission | coordinator FAILs a SYNCING op; deferRetry failure never re-armed | — | local |
| 2026-11-07 | memory formation-add-admission-continuation-gap | learner FAILED on 60 s SYNC_TIMEOUT while its ADD stayed CREATING; PROPOSED read as admitted | open | — |

Today: ~35 consumers reclassified to PRESENT/ABSENT/UNAVAILABLE; "a spent wait never retires
a voter"; D4 (`cdc_committed_acceptance_unknown`, attempts 3/3 on mg-1 publication writes →
UNKNOWN, never settles). D4 has the **same signature** as 11-01/11-02 and was explicitly
deferred to the CDC owner then. The CDC handling has swung between "backoff forever" (E)
and "attempt bound ends it" (D) without an owner that resolves the unknown by exact readback.

### Local vs class-level
Mostly local. The class rule exists as text, not as a primitive:
`authority-and-recovery.md:190` "an unknown outcome is resolved through its existing owner,
not guessed from a timeout or projection"; runtime-contracts §Query Routing "a lost answer
after submission retains the existing owner's retry/unknown-outcome obligation"; owner ruling
2026-10-04 "absence never completes a step". Class-shaped repairs were per-domain
(workflow terminal, promotion, 2PC, fresh-seed SUBMITTED read-back 2026-10-24).

### Guards today and why they missed
- `src/logging/wait-bound-spent.js` ("the one owner of 'a spent wait is a failure, and is
  visible'") + ~30 `*-wait-bound-spent.test.js`: make expiry visible; they encode expiry as
  failure and do not distinguish "unknown, obligation retained" from "failed". Not a static
  census of expiry branches.
- `fixed-work-bound-census` (2026-11-02): regex on `*_TIMEOUT_MS|_DEADLINE_MS|_BUDGET_MS|BOUND_MS`
  constants (30 rows); it explicitly excluded attempt-count bounds (MESSAGE_GROUP_RETRY_MAX_ATTEMPTS)
  — the D4 shape is an attempt bound (3/3).
- Navigability `catch_returns_default` ratchet (baseline 384 sites): syntactic only; fired on
  today's new removal-file sites but cannot see a classifier that maps an unknown to a
  terminal decision.

### Strongest prevention
A typed write-outcome primitive at the write owner (router/CDC/workflow): COMMITTED /
REFUSED / UNKNOWN{writeKey, position?}, where UNKNOWN can only be consumed by
`resolveByReadback(writeKey)` or retained; a static check that an expiry branch
(`reportWaitBoundSpent` call or attempt-counter exhaustion) is never followed in the same
function by a terminal/retire/fail transition. Would have covered CL-023, 07-04 voter-ready
FAILED, 08-30 collision FAILED, 09-23 text reroute, 2PC NO_TRANSACTION, 11-07 learner
FAILED and D4.

## Class E — hold/wait/latch with no clearing event in its lifetime; waits not armed on the clearing event

### Earlier occurrences (24 before today)

| Date | Record | What broke / where | Fix | Scope |
|---|---|---|---|---|
| 2026-05-08 | ef78c22ac | remote dispatch timeout never re-armed | rearm path | local |
| 2026-06-04 | a946b8261 | rolling-restart readiness-starvation deadlock (circular) | broken at two model-verified points | local |
| 2026-06-12 | CL-021/CL-022 | catchup fence denies promotion forever (unprovable snapshot-coverage input) | raft_role wipe fix | local |
| 2026-06-12 | CL-028, 56ee76871 | priority recovery vetoed by the readiness it reopens | bypass | local |
| 2026-06-14 | CL-036, ae4bd82f3 | publications spread gated on readiness gated on publications | exclusion gate | local |
| 2026-06-17 | CL-043 | persist-failed REPLACE blocks peer drains forever | terminalize | local |
| 2026-07-04 | formation-voter-surplus-promotion-deferral-livelock | promotion waits for drain, drain for REPLACE, REPLACE for promotion (168 deferrals) | terminal durability repair | local |
| 2026-07-05 | formation-replace-dispatch-deferred-retry-hold | four REPLACEs pinned in deferred-dispatch hold all run | exhausted (mechanism refuted) | — |
| 2026-07-21 | priority-surplus-remove-authoritative-placement-fence | CREATING ADD exhausted handoff budget, never rearmed | — | local |
| 2026-08-10 | blocked-spread-evaluation-event-wake (d75b01706) | blocked spread slept a flat 70–80 s timer instead of waking on the clearing condition | event wake through the release tracker | class-shaped for spread |
| 2026-08-22 | ledger-quorum-spread-hold-cure-drain-admission(-v2) | quorum-spread hold deferred its own cure: no release path at 2-1-1 | cure set includes drain REMOVE | local |
| 2026-08-25 | CL-044 | formation-barrier hold not covered by the event-wake fix | open at record | local |
| 2026-08-29/30 | memory operation-ledger-self-move-hold-engagement / -fairness | DEFER hold engaged at createOperation 10–14 s before dispatch could clear it; registered holder never dispatch-admissible | engagement moved to dispatch-admissibility (4bc6c1d25) | local |
| 2026-09-03 | memory stored-snapshot-deferred-listener-window | reuse gate keyed on setImmediate listener, not on the clearing version | open (other owner) | — |
| 2026-09-06 | replica-projection-stale-leader-route-resync | projection writes wedged forever behind stale leader metadata | resync | local |
| 2026-09-17 | formation-sim-charged-production-seed-host | host.stop() parked forever on a timer nobody fired | owned clock | local |
| 2026-09-23 | raft-rs-single-path-partition-cutover | runtime owner's enqueue never cleared its tail once a group went async | synchronous readStatus | local |
| 2026-10-04 | zero-liferaft-active-runtime (S2) | failed hold write leaves an in-process hold with no release path | fail-closed ruling | local |
| 2026-10-13 | participant-release-held-recovery-continuation | release stranded while host recovery held the group | bounded continuation on fresh leader observation | local |
| 2026-10-24 | memory cdc-obligation-ledger-unbounded-growth | a refusing subscriber wedges the CDC lane for every subscriber | open (D1-D4 decisions) | — |
| 2026-11-01 | comparative-benchmark-evidence-repair | `partition_write_cutover_paused` on publications-p1 with no release path for 22 min; held CDC obligation lanes | open | — |
| 2026-11-02 | replica-admission-from-committed-operation | acceptance_unknown deferRetry with backoff forever | handed to CDC owner | — |
| 2026-11-07 | memory formation-add-admission-continuation-gap | ADMITTED latched on uncommitted PROPOSED; re-drive process-local, nothing reverts | open → today's work | — |
| 2026-11-11 (earlier today) | fresh-formation-user-table-routability | planner NO_AVAILABLE_NODES with no publication wake (1 s cadence; 1,100–2,250 deferrals/run) | DEFERRED + publication wake | class-shaped for planner |

Today: terminal acknowledgement refusal sets `lane.held` until a leader change (direct
recurrence of the 10-24 "refusing subscriber wedges the lane"); ADMITTED latch; fence.

### Local vs class-level
Overwhelmingly local; three per-owner event-wake repairs (08-10 spread, 11-02 participant
release, 11-11 planner). The class is stated in contracts — `authority-and-recovery.md`
"Recovery must not depend on the condition it restores", review 2026-10-10 "Pair every hold
with a positive case … a system that remains safely stuck has not met its recovery
contract", CL-028/CL-036 "circular-dependency-class-formation-vs-steady-state" — and in the
epic `self-hosting-circularity-generic-treatment` (done), whose static product
`scripts/check-hold-engagement-owner.js` covers only operation-ledger hold *engagement*
re-derivations, not release.

### Guards today and why they missed
- `check-hold-engagement-owner.js`: counts re-derived ledger-hold predicates; nothing about
  whether a hold has a clearing event. CDC `lane.held` and the admission latch are outside its
  table.
- `scripts/census/unwired-event-census.mjs`: finds emitted events with no listener; it does not
  check the inverse (a hold/latch whose clearing event is never emitted or not subscribed).
- `test/cdc/write-then-read-projection-census.test.js` names cache-change waits
  (`OWN_CACHE_CHANGE_WAITS`) but not what clears them.
- TLA lost-wake configs (readiness-handoff-liveness) cover only the startup handoff.

### Strongest prevention
A hold/latch owner primitive: every hold is constructed with (reason, clearing events[],
bound, on-bound outcome) and registers in one registry; a static check refuses a `held`/latch
field set outside the primitive; a DT/unit harness enumerates registered holds and asserts each
clearing event has a producer reachable without the hold's own release (circularity) — the
"paired witness" (refusal + resumed progress) per hold. Would have caught 08-22 no-release hold,
CL-043, 10-24/today's CDC lane hold, 10-04 in-process hold, ADMITTED latch, CL-028/036 circular
gates.

## Ranking (this fork's three classes)
E (24 prior) ≥ D (22 prior) > A (17 prior). All three recur in the same owners:
operation workflow/ledger (REPLACE terminalization, self-move hold), control-plane
membership publication/readiness, and CDC delivery (since 10-24).

## Not read
Full quest logs (only first keyword match per quest extracted); most closure-ledger bodies
beyond STATE headers; epic bodies beyond grep; `solve/changes/**` (not searched);
`fixed-work-bound-census` CENSUS.md table itself; the 2026-05/06 `work/packages/*` docs
(only the two D1-origin package headers); TLA models; memory notes other than those cited.
Occurrence counts are lower bounds from keyword hits (each quest counted once).
# Classes B, C, G: recurrence history (fork report, 2026-11-11)

Read-only. Sources: grep over solve/quests/*/log.ndjson + quest.json (keywords in brief), the
fresh-formation-user-table-routability log entries of 2026-11-10/11, git log -S / --grep on src,
HEAD vs working-tree diffs of the D1/D2 sites, scripts/check-*.js and scripts/checks/* headers,
docs/steering/rules.md, docs/development/code-style.md, architecture/contracts/invariants.json,
memory notes (systemic-not-local, meaning-lost-at-next-consumer, membership-epoch-null-rehydration,
no-legacy-one-version-of-logic, code-navigability-epic).

## Class B — dead check / dead read made live, consumers never reviewed

### Root facts for today's instances (verified in git)
- **D1 trigger.** `src/control-plane/publication-active-gate-handoff-contract-evidence.js`
  `normalizePublicationActiveGateHandoffReasonCodes` read `reason?.[PUBLICATION_ACTIVE_GATE_HANDOFF_FIELD.CODE]`
  and `readinessEntry[FIELD.CODE]`, `readinessEntry[FIELD.REASON]`. `FIELD` has no `CODE` or `REASON`
  member: `CODE` lives in the sibling object `PUBLICATION_ACTIVE_GATE_HANDOFF_READINESS_REASON_FIELD`.
  The read went dead in **5f17f349b (2026-05-24, "refactor: split publication-active-gate-handoff-contract")**:
  before the split the code read `..._READINESS_REASON_FIELD.CODE`; the split rewrote it as `FIELD.CODE`.
  So the `{code}`-shaped reason was invisible for ~5.5 months, `pendingRecoveryCount > 0` was unreachable,
  and the owner-recovery wait branch (which self-re-enqueues) was never executed. Today's rewrite
  (via `collectReasonCodes`) made it live → livelock.
- **D2 trigger.** `isSystemTableOwnerHandoffFailure` in `src/cdc/cdc-integration-service-shared.js`
  compared to `QUERY_ERROR_CODE.ROUTER_CONNECTION_CLOSED`, which `QUERY_ERROR_CODE` never had
  (the same code is spelled three ways in src: `ROUTER_CONNECTION_CLOSED_ERROR_CODE` (transport),
  `QUERY_EXECUTOR_LITERAL.STRING_ROUTER_CONNECTION_CLOSED`, and the dead `QUERY_ERROR_CODE.` one; a second
  dead read of it is at HEAD `cdc-integration-service-owner-rpc-read-execution.js:32`). The dead check dates
  from the April/May refactors (git -S hits e2797b6c8 2026-04-20, d943df3bf 2026-05-06, 9d1f063bb 2026-05-19).
  Today's fix made the "handoff = don't retry" branch live for every transport close/timeout.
  NOTE: the working tree has since removed transport codes from the handoff predicate (now decided by
  `CONTROL_PLANE_ERROR_CODE_DECISION`), i.e. D2 appears repaired after the triage report; not verified here.
- **What made both live:** the new `scripts/checks/check-constant-member-existence.js` (untracked, written
  2026-11-11; census found 40 such reads in src). Its remediation text in `docs/development/code-style.md:91-94`
  is "use the owner's existing member or define the member in its owner module" — i.e. it prescribes making
  the read live, with no step to decide which behaviour (dead or intended) is correct, and no consumer census.
  Reviewer F10 (2026-11-11 12:29) named it ("a constant fix turned a dead read live") and the next attempt
  (12:58) judged the new behaviour "correct by the handoff contract" without following it to the reconcile
  queue — the loop was found only by the hanging admin test.

### Earlier occurrences
1. 2026-05-24 5f17f349b — the D1 dead read itself was created by a mechanical split (the generator half of B: a refactor silently kills a read; nothing notices because the dead branch has no test).
2. 2026-04/05 e2797b6c8 / 9d1f063bb — D2 dead check created in cleanup/refactor commits.
3. 2026-06-22 509f6e46a — publication-active-gate contract again: 8f5bc72a routed the owner-reconcile DEBT path around the normaliser, so derived `reasonCode`/`activeGateCatchupFence` were lost ("Cannot read properties of undefined"); fix: overlay the two derived fields (local).
4. 2026-07-05 56ebbedb9 — a mis-resolved message constant gave `logs.message` undefined → NOT NULL violation committed to Raft → poison entry wedged apply on every replica, retried forever. Fix: coerce at the writer (local); the undefined-constant class was not addressed.
5. 2026-09-12 formation-harness-model-from-contracts — `cache-visibility-wait.js` passed `this.now`, undefined on the service; fell back to Date.now silently (benign, noticed during a time-seam change).
6. 2026-10-03 1164f49b1 — 003a59dc8 removed router literals; `buildDerivedDeliverySource` still referenced them; besides the link error, the branch "would also have matched `undefined === undefined`" for every raft-rs envelope. Fix: delete the dead branch (correct shape: delete, not revive).
7. 2026-10-03 zero-liferaft-active-runtime — harness config-parser copied the deleted `BENCHMARK_GATE_DEFAULTS` (always undefined) into every config; removed.
8. 2026-10-24 retained-seed-original-handoff — wiring 7fa4d79ae made the data-directory-owner gate (added 8b3638233) reachable from `bootstrap()`; test helpers never passed the owner → every preparation step refused; ~18 base reds (3829a3c3b). Consumers of the newly live gate not censused.
9. 2026-11-11 (same day, sibling) — message-group-learner-discovery subtest 12 was a false green at HEAD: `failOperation` threw a TypeError on an undefined readiness service; removing that read made the FAILED write commit (a dead path made live by an unrelated slimming change).
10. 2026-11-11 F11 — `COLUMN.TABLE_NAME` undefined at four admin sites; unexamined constant reads 2,901 → 1,329 after hardening; 1,329 remain unexamined.

Count: 9 earlier/sibling occurrences of the dead half (B-generator), of which 3 (#3, #8, #9) are the "made live and broke a consumer" half; D1/D2 are the 4th and 5th of that half. All earlier fixes local.

### Guards today and why they missed
- `check-constant-member-existence.js` — new today; it *found* both sites. It has no baseline and forces a change, but neither the checker nor code-style.md requires a behaviour decision or consumer review for each revived read. It finds; it does not protect the revival.
- `check-unused-exports.js` — sees unused exports, not reads of non-existent members.
- `check-guideline-navigability` (two_source_fallback_reads / typeof_dual_paths) — the HEAD D1 code `reason?.[CODE] ?? reason?.[REASON_CODE]` is a two-source fallback read but inherited under baseline, so not reported.
- `fallback-branch-census.js` (2026-11-08, V8 coverage) — classifies which side of a fallback runs; has no rule that a site classed `never`/`fallback-only` whose live side changes requires a consumer review; the dead owner-recovery-wait branch in `membership-publication-active-gate-reconcile.js` is a plain `if`, not a detected fallback site.
- ESLint/no type checking — the project is untyped JS, so `X.MISSING` is silent (stated in the checker header).

### Strongest class-level prevention suggested by history
(a) Freeze-and-throw constant objects (a Proxy or a `strictConstants()` owner helper that throws on unknown member reads in test and dev) so a dead read fails at the first execution instead of living for months — would have made 5f17f349b, e2797b6c8, 003a59dc8, 56ebbedb9's constant, BENCHMARK_GATE_DEFAULTS fail their own tests.
(b) A revival protocol bound to the constant-member checker: every fix of a flagged read is classified DELETE (dead behaviour was correct / branch unneeded) or REVIVE; REVIVE requires a named consumer census of the newly reachable branch and a witness test that executes it from the production entry point. Encode as a ratcheted list in the checker's JSON (site → decision → witness) so revivals are reviewed, not incidental.

## Class C — error/outcome classification drift

### Earlier occurrences
1. 2026-04-20…05-19 — D2's dead code compare (above): classification by a code that did not exist, with a text-fragment fallback ("Connection to node … closed") doing the real work — text matching masked the dead code check for 6 months.
2. 2026-06-04 rolling-restart-core-stability — target-fallback critical pending misclassified as control-plane reserve exhaustion (pressure governor); local reclassification.
3. 2026-07-04 formation-voter-surplus-promotion-deferral-livelock — the "even voter count" message text shared by ALL deferral causes; structured reason was REPLICA_COUNT_LIMIT (text vs code).
4. 2026-07-06 formation-ledger-self-move-blocks-cluster-ops — singular 'participant failure' vs plural 'failures' text: "verify isRetryableControlPlaneError classifies both" (text-fragment fragility).
5. 2026-07-07 routed-mutation-silent-ledger-write-loss — readiness-health misclassification under heartbeat-ingest lag (585a36a99: stale heartbeat classed unhealthy while transport-ready).
6. 2026-07-16 movielens-formation-alive-peer-keepalive-liveness — HEARTBEAT_MAINTENANCE misclassified as background by control-plane write health.
7. 2026-08-14 raft-follower-append-sqlite-starvation-relief — TRANSACTION_COMMIT outcome durability misclassified as observation (deferred past the apply transaction).
8. 2026-09-23 raft-rs-single-path-partition-cutover B7/F-am (round 6 REJECT) — A12 deleted the text 'Raft write commit timed out'; an uncensused fifth consumer, `control-plane-error-classification.js` (`RETRYABLE_CONTROL_PLANE_ERROR_FRAGMENTS`, ~40 `isRetryableControlPlaneError` call sites), silently reclassified typed outcome_unknown/commit-deadline answers as NOT retryable. Fix A13 was class-shaped for that owner: write kernel owns `RETRYABLE_WRITE_FAILURE_CODES`, classifier code-first. Same quest F-aj: the executor rerouted outcome_unknown **by text** without entryId → double apply (v++), closed by "outcome_unknown is never reroutable by text".
9. 2026-10-10 f5d538139 (tx1 AD) — kernel answers may-have-committed writes OUTCOME_UNKNOWN; "text-only callers keep HEAD's retry behaviour" — text consumers deliberately left on the old meaning.
10. 2026-10-24 transport C2/C3 (7bf6ceecb, f291aad32, 013979c41) — delivery-outcome builder laundered metadata (`code`→`errorCode`, `message`→`error` aliases, recomputed deferRetry), a FAILED answer could come out DELIVERED; F7: unmigrated flag readers recompute state locally (message-retry-handler.js:284). Class-level for the builder (one owner, idempotence matrix), consumers partly left.
11. 2026-11-05 2f344fde5 / 79088e840 / 9f9e03926 — schema-job poisoning: exact PROVISIONING_UNAVAILABLE classified permanent → FAILED rows; repaired by adding it as transient and collapsing an exact-code + substring OR chain.
12. 2026-11-10 fresh-formation attempt — "strict error classification precedence" in control-plane-error-classification.js and schema-provisioning-job-owner.js.
13. 2026-11-11 transport review — `message_timeout` split into ack/answer/unestablished (R09 supersession; old reason pinned in two sealed records was missed until review); text matching on two timeout texts at 9 sites (8 removed); ~10 sites still match 'No connection to node' / 'No handler registered' / 'Outbound queue' because three rethrow sites drop the code; 31 of 36 QUERY_ERROR_CODE unclassified by code (fail-safe: not retried); ANSWER_TIMEOUT still carries deferRetry read by ~50 consumers; ~42 `isRetryableControlPlaneError` callers not individually audited. D2 is this class: the handoff predicate's members changed while its one consumer kept "handoff ⇒ give up".
14. 2026-11-11 D4 candidate — `cdc_committed_acceptance_unknown` on mg-1 publication writes correlates with the settle failure (classification of unknown outcome; overlaps class D).

Count: 13 earlier occurrences (2026-04 → 2026-11-10), at least 5 in the error-retryability classifier itself (#1, #4, #8, #11, #12). Fixes: mostly local (add a code, add a fragment); two owner-level consolidations (#8 kernel code set 2026-09-23, #10 delivery-outcome builder 2026-10-24) and today's exhaustive `CONTROL_PLANE_ERROR_CODE_DECISION` table.

### Guards today and why they missed
- `CONTROL_PLANE_ERROR_CODE_DECISION` (new today, "exhaustive table bound to the code enumerations") — covers the control-plane retry predicate only. `isSystemTableOwnerHandoffFailure` was a second classifier outside it (duplicate authority, class I), so D2 changed decisions without touching the table. 31/36 query codes not in it.
- `check-runtime-grammar-contracts.js` — required/forbidden source fragments per file; textual, cannot see predicate membership or consumer semantics.
- `check-guideline-deferred-outcomes.js` — its own header records it had gone stale "while the check was not wired into any gate".
- No checker forbids `error.message.includes(...)` / fragment lists; text matching survives in ~10 sites + `CDC_OWNER_HANDOFF_ROUTING_ERROR_FRAGMENTS`.
- Unit tests pinned behaviour by text (`isTransientCdcError('Message timeout')` expected true) — the test pinned the superseded classifier, so it went red as "stale fixture" rather than flagging a consumer.

### Strongest class-level prevention
One classification owner per outcome family with an exhaustive decision table keyed by code (done today for control-plane retry), **plus**: (a) a static ban on message-text matching in src outside the one owner (ratchet from today's count to 0; rethrow sites must preserve `errorCode` — fix the three that drop it); (b) every predicate that partitions codes (handoff / transient / reroutable / permanent) is derived from the one table, never a separate list; (c) a consumer-matrix test: for each code × each consumer predicate, the decision is asserted, generated from the table, so moving a code changes a visible matrix row. History: (a) would have prevented #4, #8 F-aj, #13 text sites and the D2 6-month masking; (b) would have prevented D2 and #8 B7; (c) would have made #11 and D2 visible at change time.

## Class G — rule for one family member, not siblings; partial consumer migration after a contract is strengthened

### Earlier occurrences
1. 2026-06-22 509f6e46a — publication active-gate: the DEBT path (sibling of the normal path) bypassed the normaliser; derived fields lost.
2. 2026-07-13 3cb8a9faa — owner-local deferred progress extended to the ACTIVE transition "the same way the CREATING dispatch already does"; STOPPING listed as the next lever (formation-ledger-self-move-blocks-cluster-ops) — the rule was extended one transition at a time; terminal steps "stay uncovered". Its later removal (2026-11-11 memory: 4 `applyLocalPriorityOperationProgressRow` callers + deferred-local `updateStep` remain after only the PENDING→SENDING arm was removed) repeats the pattern in reverse.
3. 2026-07-13 voter-readiness-owner-migration-rebalancer-batch2 / -control-plane — migration done in batches; `check-voter-readiness-single-owner.js` added as class guard.
4. 2026-07-16 movielens-nodes-priority-recovery-escape / -adverse-ab-rollback-sealed — rule pinned: priority inventory derived from the canonical classification owner, "must not restore a second hand-maintained partition list".
5. 2026-09-05 membership-epoch-null-rehydration — Number(null)→epoch 0 fixed in one decode owner; the sibling defect in the current-epoch owner left unfixed, then fixed by a second micro-quest (0a2585cd9).
6. 2026-09-23 raft-rs cutover B7 — text removed at the producer, fifth consumer uncensused (also C).
7. 2026-10-03 1164f49b1 — literals removed from the router vocabulary, consumer `buildDerivedDeliverySource` not migrated (also B).
8. 2026-10-24 transport C2 F7 — "unmigrated flag readers that recompute state locally" after the delivery-outcome owner was strengthened.
9. 2026-10-24 retained-seed-original-handoff A5 sibling census — same class in `WasmServiceLifecycle.stopReplica` beside the partition fix; REFUSED outcome discarded by all three callers.
10. 2026-11-07 memory (formation-add-admission-continuation-gap) — four-way readiness typeof chain duplicated in three consumers; a6cd65c37 unified the reader.
11. 2026-11-11 (several, same day): `REPLACE_SOURCE_LEADER_HANDOFF_REQUIRED_PARTITION_IDS` hand list omitted schema_operations-p1 → 9.5–22 s leaderless (fixed by deriving from `classifySystemPartition`); `ADMIN_PRIORITY_RECOVERY_PARTITION_IDS` hand list also omits it (L2, open); `sql_write_operations` absent from `CRITICAL_TRANSPORT_CONTROL_PLANE_TABLE_IDS` (owner question); named-target leader handoff built for priority REPLACEs only, made universal by R09 supersession (B2 zombie leader on partitions-p1); CDC detach built for target recipients, not PRIMARY; S1 the inverse (live-quorum check applied to every `TAKES_A_VOTER` member incl. ADD_LEARNER); the external review's five "meaning lost at the next consumer" cases (UNAVAILABLE→absent, DEFERRED→no candidates, CLOSED→drained, two occurrences→one timestamp, leadership-at-dispatch→at-effect); `queryIncompleteOperations` still returns [] on failure after the by-id contract was made three-state.
12. Prior attempt at class-level: 2026-08-12 failed-authoritative-read-admission-invariant — invariant registered (`architecture/contracts/invariants.json` "failed-authoritative-read-admission-verdict") with a verdict-matrix test of 4 hand-picked predicates. Today ~35 consumers needed reclassification for the same invariant; the matrix enumerates predicates by hand, so every new gate (serial gate, remove safety, storage capacity, release fence, step-write resume) was outside it.

Count: 11 dated earlier occurrences + the 2026-08-12 class attempt; today ≥8 instances. Fixes: mostly local; class-level guards exist for four semantics (voter readiness, hold engagement, cure typing, partition class — all 2026-07-13, "Option 5" single-owner tables).

### Guards today and why they missed
- `check-partition-class-owner.js` (2026-07-13) — counts legacy predicates and rebuilt `CRITICAL_SYSTEM_PARTITION_IDS`; a new `new Set([INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.X], ...])` hand list is not detected, so the handoff set omitting schema_operations-p1 and the admin list passed.
- Verdict matrix for failed reads — hand-enumerated rows, not generated from a census of consumers of the read API; new consumers are invisible.
- Single-owner censuses (voter readiness, hold engagement, cure typing) cover their own semantics only; no generic "family" check (e.g. every removal path / every recipient kind / every partition class passes the same gate).
- R18 ("read the owners") is a process rule with no mechanical witness; reviewers approved per-function, the external review found composition defects.

### Strongest class-level prevention
(a) Family membership is derived, never listed: a static check that forbids hand-built Sets/arrays of partition IDs / table IDs / recipient kinds / move types outside their classification owner (extend check-partition-class-owner to any `INITIAL_PARTITION_IDS[...]` or `SYSTEM_TABLE_NAME.*` collection literal). Would have caught the 2026-11-11 handoff list, the admin list, CRITICAL_TRANSPORT list, and the 2026-07-16 hand list.
(b) Contract-strengthening changes carry a generated consumer matrix: when a producer's outcome type gains a state (UNAVAILABLE, DEFERRED, CLOSED, outcome_unknown), a census script lists every call site of the producer (import graph exists) and the test asserts each site's decision per state — the failed-read verdict matrix rebuilt as generated-from-census rather than hand-picked. Would have caught the 35-consumer reclassification, `queryIncompleteOperations`, B7's fifth consumer, C2 F7.
(c) Family-wide gates as one owner function every member passes (today's universal removal leadership gate is the model): a rule built "for priority REPLACEs only" or "for target recipients only" must be justified by a named exclusion in the owner, not by omission.

## What I did not read
- Full log.ndjson of most quests (grep hits only; ~1,100 quests); solve/changes/** diffs; solve/epics/** beyond grep (golden-capability-gold-plating.md, control-plane-truth-local-converged-read.md not read).
- architecture/** other than invariants.json; docs/development reviews other than a grep of adversarial-risk-review-2026-10-10.md.
- The bodies of most checkers (headers only); whether D1 is fixed in the working tree (out of scope); whether the 40 constant-member fixes beyond D1/D2 changed behaviour (not audited — this is the obvious next census).
- test/distributed/operational-ground-truth.md.
# Recurrence history: classes F, H, I, J

Method: python context grep over solve/quests/*/log.ndjson + quest.json (keyword sets per class),
`git log --all -i -E --grep` (oneline, capped), `git log -S` for two symbols, epics
(code-navigability, system-table-retention, control-plane-truth-local-converged-read, legacy.md
head), architecture/runtime-contracts.md, test/distributed/operational-ground-truth.md,
docs/development/adversarial-risk-review-2026-10-10.md (grep only), memory notes listed in the brief.
Dates are the first log/commit date I found; "fix" is from the log or commit subject, not re-verified
in code unless marked "(code-checked)".

---------------------------------------------------------------------------------------------------
## F. Listener / subscription armed once over the set existing at arm time (incl. read-then-arm)

Earlier occurrences:
- 2026-08-10 `blocked-spread-evaluation-event-wake` (d75b01706): blocked spread evaluation slept a flat
  70-80 s timer; no wake armed on the clearing edge. Fix: event wake via tracker notify. Local (one owner).
- 2026-08 `formation-release-handoff-closure-v4`: ranked cause (2) "lost wake + PENDING-timeout stale
  fail of a never-attempted self-move". Diagnosed, not class-fixed.
- 2026-09-24 469001d69/12adc944e: CDC group propagation retry timer re-armed after stop (inverse: armed
  past owner lifetime). Fix CLASS-level for that owner: one `armPropagationTimer` primitive refuses when
  stopped.
- 2026-09-25 527771405 REPLACE remove-safety wake: edge-triggered wake lost between read and arm. Fix:
  one permanent readiness-publication subscription, subscribe-before-recheck, level-triggered. Class-level
  for that owner only.
- 2026-10-05 `zero-liferaft-active-runtime`: live-query-group.js:500 unserialized subscription updates
  can skip a re-subscribe (missed subscription). Recorded, not traced to a fix.
- 2026-10-14 c6735aff5: "measured admitted-wake loss during shared reconstruction". Single-owner
  recovery design (WIP).
- 2026-10-24 `retained-seed-original-handoff` / d562a0839 (CDC D4): a late subscriber got only the
  sliding window, MISSED 344 of 600 events incl. a DELETE. Fix: subscribe-before-hydrate at the
  PARTITION boundary (class-level at that boundary); the GROUP boundary decision was explicitly deferred
  (DESIGN-cdc-d4-hydration-live-handoff-2026-10-26.md:506-516, cited in
  `replica-admission-from-committed-operation`).
- 2026-10 `dynamic-config-startup-owned-initialization`: verifier mutant "w5 CDC subscribed after reads"
  survived; "CDC-after-late-read" never witnessed.
- 2026-11-11 (memo formation-systemic-generators) cdc-group-propagation-routing.js:481-550 skips
  not-yet-targetable recipients; a not-yet-targetable node misses events permanently; joiner sweeps
  raised 12-19 -> 44-52/min as compensation.
- 2026-11-11 `fresh-formation-user-table-routability` CDC finding (3): failed deferred propagation
  attach logged and dropped, no retry (bootstrap-service-replica-registration-methods.js:239-251,
  node-joining-publication-activation.js:330-338); external review F 8.2 same; also "startRecipientDrives
  registers no successor continuation" after a tenure change. Fix today: AWAITING state retried on
  message-group initialized/leaderElected + OWED_WITHOUT_PROPAGATION_SUBSCRIBER log (today's instance).
- 2026-11-11 external review F5: lost wake between sync read (rebalance-loop.js:321) and arm (:385).

Count: 10 earlier/sibling occurrences, 4 owners (rebalancer wakes, CDC propagation, live-query,
startup config). Fixes: 2 class-level-for-one-owner (timer primitive, subscribe-before-hydrate at
partition), the rest local or open.

Guard today: none. architecture/runtime-contracts.md:356-367 requires "a phase-created subscriber ...
transfers to a runtime owner before phase completion" and forbids "tearing down the only live
subscriber", but nothing checks that every service created after startup is attached; no listener /
subscription census exists (grep found none; the raft-rs-lifecycle-retirement-census and
test-resource-classification count resources, not coverage of late members). Why today's CDC attach
was missed: attachment is wired at the bootstrap/join phase call sites, failure is logged-and-dropped,
and no witness creates a service after the subscriber set was built.

Strongest prevention suggested by history: one owner primitive "attach-on-create, level-triggered":
the registry that creates a replica/service is the one that attaches its subscribers (or a
`forEachCurrentAndFuture(set, attach)` primitive that subscribes before reading the current set), plus a
standing witness shape "create after arm" (the D4 subscribe-before-hydrate witness pattern) required for
every subscriber owner. Census: every `.on(`/subscribe call site in src is either inside the creating
owner or registered as a level-triggered subscription.

---------------------------------------------------------------------------------------------------
## H. Unbounded growth pinned by a dead or slow consumer (and unbounded owner-less collections)

Earlier occurrences:
- 2026-06-15 `cdc-cache-delete-resurrection`: dropped/reordered CDC DELETE left permanently
  resurrected cache rows (tombstone retention; fixed with bounded tombstones, 30 s TTL / 1024 per table).
- 2026-07-06 `formation-ledger-self-move-blocks-cluster-ops`: replicaIds/raft.nodes never pruned on
  scale-down (3->1 group classed multi-member). Recorded pre-existing; not fixed there.
- 2026-09-03 `projection-readiness-per-node-generation-granularity-v2` (f2b3916f7): statsByNodeId
  created per per-boot node id, never pruned; entryByNodeId pruned only by invalidateNode, which has
  no src caller. STILL OPEN (code-checked today: projection-readiness-evidence-owner.js:108-121, no
  delete; invalidateNode has no caller outside the file).
- 2026-09-23 memo formation-lane-regressions-rs-raft-root-causes: asyncGenerationIds in
  formation-turn-attribution.js never deleted on destroy (15.9 M entries, 512 MB cap). Fix: bound by
  the live set (local).
- 2026-10-05 `zero-liferaft-active-runtime`: statement outcome table "grows without bound (~120 B/row,
  ~33k rows/h)" until a log-bound quest. Deferred.
- 2026-10-10 adversarial-risk-review RT2 + "Bound diagnostic retention": durable store `journal`
  retains write observations with no production clearer; host memory unaudited.
- 2026-10-24 `retained-seed-original-handoff` (92b163ec0): SEVERE `_cdc_obligations` had no
  retirement; every write a permanent row (logs 360 B/write); also "a refusing subscriber wedges the lane
  for every subscriber". Fix: CDC D1 reclamation e1d26e0eb (2026-10-25) position-based delete inside
  apply (class-level for that ledger) + D2 policy at recording (8fdc79a4a).
- 2026-11-02 `wasi-component-startup-budget` F4: REFUSED entries never evicted (LOW, open).
- 2026-11-11 table-retention census: 22 system tables + 2 partition-internal unbounded
  (replica_operations ~13 KB/row, `removeReplicaOperation` no caller). Epic system-table-retention
  (untracked today) with a lifetime-declaration checker.
- 2026-11-11 today's instance: dead PRIMARY recipient pins the CDC frontier; at 4,096 owed rows it
  refuses the writes that would retire it (fresh-formation log, CDC finding (4)); held recipient's
  dueAtMs never honoured, whole vector re-shipped per commit. Fix today: admission reserve + detach on
  lifecycle evidence + MUST_RELIST at 2,048 rows; detach built for targets, not primary (G).

Count: 10 occurrences across 7 owners; one class-level fix (CDC D1 reclamation), one class-level
declaration (today's retention epic, uncommitted), the rest local or open. The 2026-09-03 map is still
unpruned 69 days later.

Guard today: scripts/checks/system-table-retention-budget.js (UNTRACKED, created 2026-11-11) covers only
tables in TABLES and only a declared lifetime class; it says nothing about a consumer pinning a bound.
architecture/runtime-contracts.md:528-536 requires "runtime collections have owner, bound,
expiry/teardown rule, and diagnostic surface" and forbids unbounded in-flight work; no checker enforces it
for in-memory Maps. The navigability detector `identity_keyed_module_state` counts module-level maps only
(baseline ratchet), not instance Maps like statsByNodeId. Why today's was missed: the CDC lane bound
(4,096) existed but its release depended on the slow consumer; no rule requires a bounded ledger to name
the event that retires a dead consumer.

Strongest prevention: a contract + check "every bound names its eviction authority": any per-key Map /
ledger / owed set keyed by node, recipient, replica or operation must declare (a) its bound, (b) the
lifecycle event that removes a key (node removed, recipient detached, replica retired), wired from the
lifecycle owner, and (c) a plateau witness under churn. Pair it with the retention-declaration checker
extended from tables to owner-held collections (detector: `new Map()` in a class field + `.set(` with no
reachable `.delete(` from a lifecycle event).

---------------------------------------------------------------------------------------------------
## I. Consumer re-deriving an owner's rule locally; duplicate authorities

Earlier occurrences:
- 2026-07-13 `voter-readiness-visibility-single-owner-table` + child
  `voter-readiness-owner-critical-partition-set-home`: "is this replica voter-ready" answered by many
  local predicates; three re-derivation sites of the critical-partition set. Fix CLASS-level: one decision
  table + scripts/check-voter-readiness-single-owner.js census with a
  `critical_partition_set_local_declaration` detector.
- 2026-07-13 `hold-engagement-single-owner-table`: same pattern for operation-ledger holds;
  scripts/check-hold-engagement-owner.js (baseline 10 sites). Class-level per rule.
- 2026-07-17 `formation-priority-spread-without-exclusive-self-move-cost`: AuthoritativeRowMutationHelper
  re-derived the row from an owner-local merged-cache seed when the authoritative read threw (also J/C).
- 2026-08-04 epic control-plane-truth-local-converged-read: three consumers (deficit detector, planning
  gate, spread fence) each read the same stale funnel and derived phantom state. Superseded, cut not landed
  (per memo formation-systemic-generators).
- 2026-08-31 `replication-target-authority-v2`: 11 behaviour-changing desired-RF consumers with
  divergent authorities (policy row vs table-policy fallback vs planner target), numerically masked.
- 2026-09-04 `single-readiness-owner` (57a13555e): 52 ControlPlaneReadinessService instances -> 1.
  Class-level for that service.
- 2026-10-04 one-spread-authority (3b5fe7b5e, 2dfe2cc2f, d6199308f): "the census alone answers is it
  spread"; operation credit, a latch and a synthesized summary deleted. Class-level.
- 2026-10-24 rs-raft R2 (memo no-legacy-one-version-of-logic): sliding window = second CDC catch-up
  owner beside the ledger (deleted 06e3cfcf7); hand-written test doubles restating owner contracts;
  "two censuses of one concern"; LOG_PRESSURE_MESSAGE_FRAGMENT duplicates ROUTER_LOG_MSG.
- 2026-11-07 memo formation-add-admission-continuation-gap: four-way readiness typeof chain duplicated in
  three consumers (promotion methods, repository visibility methods, unified-rebalancer-available-nodes).
- 2026-11-11 fresh-formation log: one propagation subscriber per message-group service -> identical
  vectors per subscriber ("suspected duplicate authority"); fixed today to one per replica.
- 2026-11-11 D3 (today): seed-cache-hydration-cdc-subscription.js:45-62 (introduced in today's
  uncommitted diff, code-checked) builds `new SystemTableCache()` and calls applySystemTableChange to
  compute the predecessor row, i.e. re-implements the cache merge outside its owner.

Count: 11 occurrences; 4 class-level fixes for specific rules (voter readiness, hold engagement,
readiness service, spread authority), each with its own bespoke census script; no generic mechanism.

Guards today and why: test/config/system-cache-write-callsite-guardrails.test.js (since 2026-02-17) and
the NODES-mutation census in test/control-plane/heartbeat-memory-trend.test.js (2026-02-16) DID fire on
D3 - they work. They fire on the call, not on the meaning, so they cannot tell a scratch cache from the
node's cache; the risk is a whitelist entry (persisting-reds report correctly refused that). The
runtime-contracts.md:222-227 forbidden list ("ad-hoc Maps ... that cache system data outside the
declared owner") covers it in prose. The per-rule owner censuses (check-voter-readiness-single-owner,
check-hold-engagement-owner, check-step-coverage-owner, check-partition-class-owner,
check-operation-dispatch-completion-owner) only cover the rules they were written for.
test/cdc/write-then-read-projection-census.test.js (2026-11-02) covers cache waits, not folds.

Strongest prevention: owners export the pure rule (fold/merge, predicate, decision table) as a function,
and the census rule becomes "the owner class may be constructed only by its composition owner" (a
construct-site census for SystemTableCache, ControlPlaneReadinessService etc., generalising the 52->1
fix) - so the only way to reuse a rule is to call the exported pure function. One generic
single-owner-constructor checker replaces adding a bespoke census per rule.

---------------------------------------------------------------------------------------------------
## J. Legacy / fallback / compatibility paths that masked a failure or kept a second path alive

Earlier occurrences (selection; "legacy" appears in 952 quest dirs, "fallback" in 302, mostly as
refusals "no legacy path"):
- 2026-05-08 196e57f3d: delete legacy mutation readiness convergence path.
- 2026-06-23 9248d4d93: "genuine under-spread masked by optimistic recovery sign-off"
  (spread_satisfied_in_flight). Fix 59034031f default-OFF staleness guard flag (local), then 3aad76314
  (06-29) stall-scoped un-mask, 40efc7b74 (06-30) drain-redrive, and
  `rolling-restart-run4-control-plane-publications-failed-operation-mask` (06-30): a failed operation
  masked as spread_satisfied_in_flight. Same mask fixed 4 times locally; class fix came 2026-10-04
  (one-spread-authority deleted the synthesized summary).
- 2026-07-05 136aebbcc: durable raft_role write masked by the CL-035 local seed.
- 2026-07-06 b8ccbf846: orphan-tx leadership race "silently greened".
- 2026-07-17 `formation-priority-spread-without-exclusive-self-move-cost`: a thrown authoritative read
  treated as capability absence, fell back to the local merged-cache seed and cleared the pending durable
  update as "cache-visibility-gap-recovered" - the same "unavailable read as absent" that today's
  external review names first.
- 2026-08-31 `replication-target-authority-v2`: table-policy fallback numerically masked an RF authority
  divergence (all 3s).
- 2026-09-20/23 memos no-committed-raft-membership, systemic-not-local-fixes: liferaft join/leave were
  local unreplicated edits; legacy log consumers kept a second durable log alive. Fixed by the rs-raft
  cutover (class-level, deletion).
- 2026-10-24 rs-raft R2: CDC table policy applied only on the dead legacy receiver path, so the live
  durable owner recorded obligations for suppressed tables (growth, H); volatile CDC branch (deleted
  6f1562cfb D1e); legacy WebSocketTransport inline ACK and `code`->`errorCode` alias (removed c5c8267cf).
  Owner directive "only one version of any logic".
- 2026-11-07 memo: `|| ACTIVE` default inert on real rows; typeof readiness chains (also I).
- 2026-11-10 `repository-legacy-fallback-closure` (103f132c1) landed; same-day post-landing review:
  the checker validates labels, reasons and witness file existence across only 3 runtime directories, not
  removal or executed proofs; snake/camel alias readers remained in admin-control-snapshot diagnostics.
- 2026-11-11 today: `handleRecovery` had no production caller (deleted with its fail-on-restart
  decisions); three "CDC catch-up repaired cache rows" sweeps compensate delivery loss (>=28 compensation
  mechanisms; catch-up cadence retuned 5 times 5000->30000->5000->400 ms per memo); transport text
  matchers behind three rethrow sites that drop the error code (deferred; also C).

Count: >=14 distinct masking incidents with consequences; the spread mask alone recurred 4x in 8 days
before a class fix 3 months later.

Guards today: check-no-legacy-naming.js (2026-07-02, names only); fallback-branch-census.js + coverage
census (2026-11-09, V8 coverage classes never/primary-only/fallback-only/both); check-guideline-navigability
(2026-11-08, count ratchets: two_source_fallback_reads 1956, typeof_dual_paths 544, catch_returns_default
387, legacy_term_identifiers 4284 at baseline); check-repository-legacy-fallback-closure.js (2026-11-10).
They DID fire on today's tree (navigability 32 over baseline, closure 10 unclassified new sites), so they
catch new syntax. They cannot catch the harmful kind: a semantic fallback with no fallback syntax
(a catch that maps UNAVAILABLE to "absent" through a normal return, a compensation sweep, a dead
`handleRecovery`), and inherited sites are baselined. "Lack of execution never proves a branch dead"
(dead-fallback-retirement) - coverage tells you reachability, not meaning.

Strongest prevention: make outcome vocabularies total at the port (PRESENT / ABSENT / UNAVAILABLE, the
three-state contract built today) and forbid collapsing UNAVAILABLE in a consumer: a static check on
the by-id/list read ports that every call site switches on all three states (no truthiness test on the
result), plus a "compensation sweep must log and count each repair as a defect" rule so a repair path
is a measured alarm (today's "zero repaired-rows warnings, then delete the sweeps") rather than a
silent second path.

---------------------------------------------------------------------------------------------------
## Cross-class notes for the lead
- CDC propagation/delivery recurs in F, H, I and J (10-24 and 11-11 both): late subscriber, unbounded
  ledger, second catch-up owner, dead-path policy, dead recipient. It is the single most repeated owner
  across these four classes.
- Rebalancer spread/readiness recurs in F (wakes), I (spread/voter readiness authorities), J (spread mask).
- The common introducer is a strengthened or new producer whose consumers were not censused (the
  10-24 rs-raft R2 and today's work both), i.e. classes B/G upstream.

## Not read
Full bodies of most quest logs (only regex windows); solve/changes/**; epics other than those named;
architecture/contracts/**; the full adversarial review (grep only); the CDC design note beside today's
handover; the D4 hydration design doc; the 2026-11-11 CDC writer reports; any src beyond the two
code-checks noted. Fix status of the 2026-07-06, 2026-10-05 and 2026-11-02 items was not traced.
