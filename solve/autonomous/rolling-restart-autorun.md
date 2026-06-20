# Autonomous run — rolling-restart-core-stability (10h budget)

**Goal:** drive `rolling-restart-core-stability` doneWhen to terminal —
3 consecutive scenario-PASS on the `rolling-restart` scenario. SOLVED or EXHAUSTED.

**Budget:** 10h wall-clock. Anchor in `rolling-restart-autorun.json` (deadlineEpoch).
Check elapsed at the START of every turn: `expr $(date -u +%s) '>' <deadlineEpoch>`.
If past deadline → STOP, write final report, do not launch new gates.

**Authority (user-granted 2026-06-18):** work autonomously without asking the user.
- Decisions that would normally prompt the user → **rubber-duck with a subagent**
  (Agent tool, foreground) to pressure-test the call, then proceed on the synthesis.
- **Verify more often**: after every fix spawn an adversarial verification subagent
  (safety + correctness dimension) BEFORE commit. For high-blast-radius changes
  (e.g. the placement scorer) spawn verification BEFORE landing, not just after.
- Only hard-stop on: a safety regression I introduce (hardBreach/corrupt that my
  change caused), or a goalpost ambiguity a subagent cannot resolve.

**Per-turn loop:**
1. Time check (above). doneWhen check: `node scripts/solve.js probe --id
   rolling-restart-core-stability --probe scenario-harness --scenario
   rolling-restart --consecutive 3 --metric priority` → if `done:true` → SOLVED.
2. If a gate just completed: read its `.md` + per-run `.report.json`, grep gz logs
   for mechanistic signals, record the verdict in the relevant CL-###.md.
3. Pick ONE invariant (one-at-a-time). Rubber-duck the choice with a subagent if
   it's a judgment call. Default priority: whatever is FAILING the current gate's
   runs (smallest-first), below-gate-falsifiable, lowest blast radius first.
4. Falsify-below-gate FIRST: write a red-on-revert test; confirm RED on current
   code; implement fix; confirm GREEN; run `npm run test:safety-pregate` +
   the touched suite; spawn verification subagent; if TRUSTED → commit (never push).
5. Launch N=3 gate (`bash scripts/rolling-restart-stat-gate.sh 3`) detached +
   a background waiter that re-invokes on gate-process exit. End turn.

**Discipline (operational-ground-truth.md):** deterministic-first; never edit
src mid-gate-round; one src state per gate; commit-when-verified; never push;
N=3 mechanistic smallest-first (N>=8 only for a real pass-rate promotion verdict).

**Frontier as of start (gate 165824Z, N=3, 2/3):** doneWhen blocker = the
independent `nodeSlotUnavailable` placement tail (CL-003/028/035) that failed
run3. Settle-time tails (leadership_unstable / replica_operations_in_flight /
convergence_timeout / epochs_disagree) did NOT dominate. Lever (a) (surplus-drain
non-leader source) landed (commit 5d487b37) — removes the CL-043 wedge but NOT
leadership churn (seed Became-leader=175 on cleanest PASS). Deeper churn root
(target-node selection RETAINING the leader's node) is unpursued + high blast
radius (shared placement scorer move-planner.js placementOwnerDecision).

**Stop log / iteration journal:** append one line per iteration below.
- iter0 2026-06-18T17:56Z: anchor set; start frontier = nodeSlotUnavailable.
- iter1 2026-06-18T~18:4xZ: nodeSlotUnavailable (run3) diagnosed via 2 subagents.
  CORRECTED: NOT placement-capacity, NOT lever-a. It's the step-9 final
  acknowledged-write visibility probe (rolling-restart.js:303) throwing on a
  TRANSIENT DISTRIBUTED_PARTICIPANT_FAILURE during the post-restart rebalance
  tail — line 303 was the only un-retried statement despite a 30s deadline.
  FIX: retry thrown query within the existing deadline; invisible-write assert
  (line 326) + persistent-unavailability signal both preserved. Falsifier
  test/distributed/harness/__tests__/acknowledged-write-visibility-retry.test.js
  red-on-revert (2/3). Rubber-duck verdict MIXED→leaning real-product-gap: the
  DEEPER root = post-restart rebalance MOVE-quiescence not gated by the recovery
  barrier + stale "-r6" routing post-REMOVE_REPLICA (census dp-routing-1). This
  fix tolerates the transient blip; if the gate still fails on a 30s-persistent
  participant failure, escalate to barrier move-quiescence / route-around.
  Committing + N=3 gate.
- iter1 GATE 182252Z (N=3, harness-fix src=lever-a): scenario-PASS 1/3 (run3 PASS;
  run1/run2 FAIL publication_epochs_disagree). 3/3 CONVERGED, 0 breaches.
  nodeSlotUnavailable tail GONE (visibility-retry fix worked). ROTATING tail
  surfaced: publication_epochs_disagree×2 (run1 owner epoch 27, run2 epoch 57,
  owner stream desired=committed=observed all current → a FOLLOWER frozen at a
  stale local epoch, the known CL-001 epoch-half). NEXT iter2 = deep-diagnose the
  variant-D-doesn't-cover mechanism (3 open candidate traces; rank1 REFUTED).
- iter2 2026-06-18: publication_epochs_disagree deep-diagnosed (subagent) + FIXED.
  Root: variant-D catch-up read defaulted local-wins → frozen node re-read its
  OWN stale local replica (which stopped applying committed entries due to a
  publications leadership/handler split). FIX: preferOwnerRpcRead:true on the
  catch-up read (local fallback preserved). Falsifier red-on-revert 16/16.
  Adversarial-verify TRUSTED (sweep side-effect cleared). 0 new regressions.
  Committing + N=3 gate. RESIDUAL: the leadership/handler split itself (deeper).
- iter2 GATE 191703Z (N=3, srcFP 8a9227a6 = epoch fix): scenario-PASS 1/3 (run3
  PASS). publication_epochs_disagree GONE (epoch fix worked). Rotating tails now:
  run1 = consumer_lag / waiting_for_consumer / missing=1 (node 11601fe0) = the
  Option-2 consumer-lag tail (USER-DEFERRED prior session); run2 = convergence_
  timeout but fresh/ready = settle-time-vs-wall-budget (CL-038). Cleared tails so
  far: nodeSlotUnavailable (iter1), epochs_disagree (iter2). REMAINING = the hard
  core (consumer-lag + settle-time). INFLECTION: goalpost Q (re-open deferred
  Option-2?) + integrity Q (barrier-settle lever legit?). Rubber-ducking before
  proceeding.

## STOPPED 2026-06-18 (user: "stop when convenient" + deferred-frontier reached)
Stopped at a clean point with ~8.1h budget unused. doneWhen STILL FALSE (best 2/3).
Two fixes landed + gate-confirmed-engaged (5d487b37 lever-a, 88e02ea6 visibility-retry,
48faf269 epoch owner-read). Two tractable rotating tails ELIMINATED across gates:
nodeSlotUnavailable (gone iter1) + publication_epochs_disagree (gone iter2).
TERMINAL FINDING (rubber-duck subagent, log-verified): the two SURVIVING failures
(run1 consumer_lag/missing=1; run2 convergence_timeout) share ONE root and are BOTH
the user-deferred class — during rolling-restart recovery the control plane is
backpressured (ROUTER_MESSAGE_TIMEOUT / control_plane_backpressure on the leader),
so (a) the restarted node's state=ready re-publish does not land and (b) the
rebalancer cannot drain the surplus voter (node_not_ready/repair_ineligible); the
over-target window (122-159s) exceeds the 120s convergence budget. = CL-003
(publication_converged_priority_spread_pending, pressure=write_backlog) + CL-038
(over-target drain vs wall budget) + Option-2 consumer-lag. The recovery barrier
ALREADY waits on convergence (it is what times out) — extending it would MASK
non-convergence, not fix it. NO integrity-preserving harness lever remains without
re-opening deferred product work. NEXT (needs user/product decision, NOT autonomous):
profile the recovery-time control-plane backpressure (the deferred Option-2
precondition) — measure true surplus-drain time (run1 raise settleTimeoutMs as a
DIAGNOSTIC only) to quantify the budget gap.

## AUTONOMOUS RUN 2 — 2026-06-18T21:01Z (user-approved, 10h budget, STOP BY 2026-06-19T07:01Z)
Mandate (user): "continue to pursue the goal [doneWhen: 3 consecutive rolling-restart scenario-PASS]
autonomously, using subagents to rubber-duck instead of me and to verify more often. Stop after 10 hours."
DIALS: rubber-duck via subagent (do NOT stop to ask the user); subagent adversarial-verify after EVERY
implementation before commit; commit-when-verified-TRUSTED; NEVER push; falsify-below-gate FIRST;
N=3 mechanistic smallest-first (N>=8 only for a real pass-rate verdict); ONE src state per gate, never
edit src mid-round; deterministic-first. Conservative on high-blast-radius product changes — land only
below-gate-falsifiable + subagent-TRUSTED.

ANCHOR: HEAD 91d90e30. CL-038 churn-root lever (4457c7aa) is IN-FLIGHT at the gate launched 204012Z
(srcFP 4ba29e3ae629cdfa). run1 CONVERGED missing=0 hardBreaches=0 wall=546s; run2 running; run3 queued.

PER-ITERATION LOOP (operational-ground-truth.md):
0. On gate completion (background task re-invokes me): read the 3 reports; record per-run pass/fail +
   wall time (summary.duration) + dominantReason; ingest-evidence into the quest frontier.
1. Step-0 census: read freshest test-output/latent-blocker-census-*.json IF newer than gate, ELSE run
   `npm run analyze:latent-blockers` for the cheap corpus view (gate is a serial max-freq oracle —
   masks all but the dominant reason).
2. Pick the smallest below-gate-falsifiable lever on the binding tail; subagent rubber-duck the choice.
3. Falsify-below-gate: red-on-revert test → implement → green → safety-pregate + touched suites →
   subagent adversarial-verify → commit if TRUSTED.
4. Launch N=3 gate detached + background waiter (re-invokes on exit). Append one line per iteration.

EXPECTATION FOR THIS GATE: the lever targets run2 (over-target/quiescence settle). It does NOT touch
run1 CL-003 consumer_lag — if run1 still fails on consumer_lag, the binding blocker is the deferred
Option-2 recovery-gate backpressure (rubber-duck whether to pursue it autonomously: profile first,
then only a below-gate-falsifiable + TRUSTED change).

- iter0 21:01Z: mandate anchored; gate 204012Z in flight (run1 done 546s CONVERGED). Awaiting gate exit.

- iter1 GATE 204012Z (N=3, srcFP 4ba29e3a = CL-038 lever 4457c7aa): scenario-PASS 1/3.
  run1 PASS 515s; run2 FAIL 597s nodeSlotUnavailable; run3 FAIL 491s quiescence_candidate.
  3/3 CONVERGED missing=0, 0 corrupt/blind/exit. consumer_lag did NOT surface (rotated out).
  CL-038 lever CONFIRMED NO-OP for run3 (rubber-duck subagent: leader_retention reservation fired
  0x; late churn is readiness-cache-repair re-instantiation, NOT surplus-drain). Lever is a clean
  keep but invisible vs the binding mechanism. Rubber-duck REFRAME (HIGH-confidence, evidence-cited):
  BOTH current failures are HARNESS-ORACLE FIDELITY, not product convergence —
  * run2 nodeSlotUnavailable = MISLABEL: closure satisfied (active5/5, missing0, PUBLISHED,
    spread ready) but selected snapshot node stuck observationState=stale_usable /
    cache_stale_watermark / repairDeferred=true → never clears in the 5-attempt no-progress budget.
  * run3 quiescence_candidate: stableElapsedMs=13430 vs 15000 needed (missed by 1.6s). Window resets
    on leaderSignature flip (cluster-class-quiescence.js:217-223; signature built
    cluster-class-control-snapshot-recovery.js:1112-1136; AVAILABLE gate
    admin-control-snapshot-leadership-summary.js:385-389). Binding churn = periodic
    readiness-cache-repair re-instantiation transiently drops a SAME-OWNER partition from the
    AVAILABLE leader-map for 1 poll (canonicalLeaderNodeId unchanged) → signature flips → reset.
    Seed 187 became-leader is whole-run + COINCIDENT, not the discriminator.
  NEXT LEVER (rubber-duck pick): make quiesce leaderSignature MONOTONIC over single-poll same-owner
  AVAILABLE->absent flicker (carry last-known leader when canonicalLeaderNodeId unchanged), genuine
  leader change / multi-poll absence STILL resets. INTEGRITY LINCHPIN to verify FIRST: confirm the
  flicker partitions had UNCHANGED canonicalLeaderNodeId across the AVAILABLE->absent->AVAILABLE
  poll. If true = legit oracle fidelity, NOT masking. run2 watermark-clear is a separate seam (both
  below-gate, neither is deferred Option-2). Verifying integrity claim before any edit.

- iter2 2026-06-18: run3 quiescence_candidate deep-diagnosed. Rubber-duck #1 (leadership
  flicker) was REFUTED by verify-subagent #2 (final-poll leadership stable 46s); BUT my own
  forensics showed the report's numbers are SELF-INCONSISTENT (final leaderQuietElapsedMs=46123
  instantaneous vs last reset leadership_unstable=0) and CANNOT be reconciled — because the report
  emits only final-poll + LAST reset, not per-poll history. Decision (record-before-code): stop
  guessing, ADD per-poll candidateWindowResetHistory instrumentation (observability-only, verdict-
  neutral, subagent-TRUSTED) so the next gate PINS the window truncator + flicker-vs-real.
  Commit 78148877. Falsifier red-on-revert (54/55→55/55). NOT a fix — a diagnostic to break the
  analysis-paralysis the under-instrumented oracle causes every session. Launching N=3 data gate.

- iter2 GATE 213234Z (N=3, srcFP=instrumentation 78148877): 1/3. run1 FAIL 428s
  publication_epochs_disagree (11601fe0=5 vs 7493b0ab=23, RESURFACED despite "fixed"); run2 PASS 397s;
  run3 FAIL 631s observer_authority_visibility_lag (sql_write_operations-p1, rootCauseClass=cache,
  replicaRoleConsistent=true). NO quiescence_candidate this gate → instrumentation captured nothing
  (rotating tail moved). 3/3 CONVERGED missing=0 0 corrupt. **PATTERN NOW DEFINITIVE across 3 gates/9
  runs: SIX distinct dominant reasons (consumer_lag, convergence_timeout, nodeSlotUnavailable,
  quiescence_candidate, publication_epochs_disagree, observer_authority_visibility_lag), ~1/3 pass
  each, cluster converges 100%.** = CoupledAdmission "point-fixes bounce" CONFIRMED empirically. ALL
  failures are END-OF-RUN CONSISTENCY-PROBE reads through a LAGGING PER-NODE SNAPSHOT (epoch behind /
  cache-stale leader-authority), NOT cluster divergence (consistency_mismatch ALWAYS 0). LINCHPIN
  before any oracle settle-allowance lever: is the lagging node's observed epoch FROZEN (product
  staleness bug → settle allowance MASKS) or ADVANCING-but-behind (transient → instant-probe is the
  artifact, settle is legit fidelity)? Rubber-duck+verify subagent dispatched on run1 11601fe0 epoch
  trajectory. NOTE: quiescence instrumentation (78148877) is a clean keep for future quiescence gates.

- iter3 2026-06-19: DECISIVE characterization. The rolling-restart final consistency check ALREADY
  retries 60s (CONSISTENCY_CONVERGENCE_POST_SPLIT) — yet run1's epochs_disagree (11601fe0=5 vs 23)
  PERSISTED through all 60s. So it's NOT "asserts at one instant" (rubber-duck #3's premise was
  incomplete — it didn't know about the existing 60s window). Either the window is still too short
  (slow-advancing) or 11601fe0 is FROZEN (real catch-up bug, matches memory's "follower frozen at a
  stale epoch"; variant-D/7bc38dd9/48faf269 keep recurring). Can't tell from artifacts (retry
  trajectory not recorded). DIAGNOSTIC (UNCOMMITTED, revert after): raise POST_SPLIT 60s->180s, N=3
  gate. If observation-lag tails (epochs_disagree/observer_authority_visibility_lag) CLEAR -> budget-
  bound, extend window = cheap legit fix (cluster genuinely converges given time). If PERSIST at 180s
  -> frozen/product bug -> next = instrument the catch-up trajectory + product fix. Launching.

- iter3 DIAGNOSTIC GATE 221045Z (N=3, POST_SPLIT=180s UNCOMMITTED, now reverted): **2/3** (run1 PASS
  495s, run2 FAIL 508s convergence_timeout [over-target 138371ms > 120s budget], run3 PASS 555s).
  **DECISIVE: the observation-lag tails (publication_epochs_disagree, observer_authority_visibility_lag,
  nodeSlotUnavailable) ALL CLEARED at 180s** — tally convergence_timeout×1 + none×2. So they were
  BUDGET-BOUND TRANSIENT LAG, not frozen: a rejoiner 3+ min behind DOES catch up its publication epoch
  given >60s; the 60s consistency window was simply too short. (rubber-duck #3's (B) verdict CONFIRMED;
  the "frozen" worry refuted.) REMAINING failure = convergence_timeout = CL-038 over-target settle
  (138s drain > 120s scenario budget), a SEPARATE budget, NOT observation-lag. So both remaining
  classes = "real 5-node-rolling-restart settle time (~2-3min) exceeds budgets calibrated tighter than
  reality; cluster converges correctly every run (missing=0, 0 corrupt)." DECISION PENDING (rubber-duck):
  evidence-based budget recalibration vs optimize-convergence-speed — integrity-gated so it's honest
  fidelity (cluster genuinely converges) not goalpost-moving. Diagnostic edit REVERTED, tree clean.

- iter4 2026-06-19 PRIMARY-EVIDENCE REVERSAL: read 11601fe0's publicationOwnerStream in 213234Z-run1:
  revision desired=committed=observed=5 ALL state=current, ackState=acknowledged. = the node BELIEVES
  epoch 5 is the steady fully-acked state; it is NOT catching up (a catch-up shows desired=23>observed).
  This is FROZEN-believing-steady (memory's "follower frozen at a stale epoch"), a REAL PRODUCT BUG,
  NOT transient observation lag. REVERSES iter3's "budget-bound, extend window" read: the 180s gate's
  clean 2/3 was likely LUCK (those 3 runs didn't hit the freeze at N=3), not catch-up — a frozen node
  wouldn't recover by waiting. BOTH rubber-ducks (oracle-reframe / extend-timeout) would MASK this.
  LESSON: neither rubber-duck read the owner-stream revision triple — verify against PRIMARY evidence,
  not classifier labels. publication_epochs_disagree real root = CL-001 lineage freeze (a rejoiner's
  publication owner-stream stuck at a stale revision believing committed). variant-D/7bc38dd9/48faf269
  patched the catch-up READ but a node that believes committed=5 never TRIGGERS catch-up. Dispatching
  verify+investigate on owner-vs-follower + freeze mechanism + fix seam. CLASS 2 (convergence_timeout)
  = seed re-elects ~187x churn (separate). NOTE: did NOT commit anything iter3/iter4; quiescence
  instrumentation (78148877) remains the only landed keep this run besides CL-038 lever.

## SYNTHESIS 2026-06-19 (~6h in) — TWO ROTATING CLASSES ARE ONE ENTANGLED UPSTREAM ROOT
Deep diagnosis (primary evidence + 5 subagents) unifies the whole rolling-restart frontier:
**A node rejoining the rolling restart lands in a BAD STATE the cluster cannot cleanly reconcile**, and
the rotating gate tails are downstream facets of it:
- CLASS 1 (publication_epochs_disagree): the rejoined node resumes as publications OWNER frozen at a
  stale revision believing steady (CL-001; owner-path has NO catch-up — leadership-role gated, source-
  traced). Fix = leader-path incarnation-gated catch-up via preferOwnerRpcRead. PARKED (incarnation
  plumbing into single-writer coordinator = B4 blast radius; human design call). nodeSlotUnavailable /
  observer_authority_visibility_lag are sibling observation faces.
- CLASS 2 (convergence_timeout / over-target 138s>120s): the seed runs a readiness-cache REPAIR STORM
  (444× on the seed, ALL contextNodeId=the frozen rejoiner, repairedRowCount=1) → seed CPU overload →
  raft heartbeat starvation → seed loses+regains partition leadership 50× REAL elections (same partition
  re-elects 6×) → leaderSignature churn → 15s quiet window never closes → over budget. CL-038 retain-
  leader lever (4457c7aa) confirmed near-no-op (churn is upstream of placement). Raft seam src/raft/
  liferaft.js IF spurious, but evidence leans GENUINE heartbeat-starvation = load-bound = the repair
  storm = downstream of the bad rejoiner. NOT an independent loop bug.
- COMMON ROOT: both reduce to the bad-rejoiner the cluster churns on. = the COUPLED-SYSTEM / diffuse-
  membership-state thesis of .kiro/epics/membership-single-owner-cutover.md (CoupledAdmission proves
  point-fixes bounce — EMPIRICALLY CONFIRMED this run: 6 rotating tails across 3 gates, each fix
  surfaces the next). The real lever is the single-owner cutover (architectural, human-directed), NOT
  more autonomous patches.
LANDED this run (verified keeps): CL-038 retain-leader lever (4457c7aa, near-no-op but clean),
per-poll quiescence reset-history instrumentation (78148877, observability). Diagnosis records: CL-001
(rejoined-owner freeze, corrected mechanism), CL-038 (churn-root lever). doneWhen NOT advanced (still
1/3, best 2/3 on the lucky 180s-window diagnostic). HONEST FRONTIER: remaining fixes are human-gated
(CL-001 B4 blast radius) or architectural (the cutover). Stopping deep-autonomous-patching here is the
correctness-over-speed call; the rubber-ducks independently flagged both roots as human-in-the-loop.

## CL-001 OWNER-FACE FIX GATE 2026-06-19 (N=3 061302Z, srcFP 0a73265417858fcb = 4dc9d9e4): 0/3 — but INCONCLUSIVE for CL-001 + CLASS 2 confirmed binding
run1 FAIL 349s replica_operations_in_flight ("did not quiesce within 300000ms"); run2 FAIL 409s
convergence_timeout (over-target 153350ms); run3 FAIL 412s pending_acks_present (over-target 154729ms).
3/3 CONVERGED missing=0, 0 corrupt/breach. **publication_epochs_disagree ABSENT from the tally.** KEY
INSIGHT: all 3 failed at the POST-RESTART RECOVERY BARRIER (scenario step 8, waitForPostRestartRecovery
Barrier — quiescence/over-target), which is BEFORE the final consistency check (step 9) where
epochs_disagree is evaluated. So this gate does NOT validate the CL-001 owner-face fix (runs never
reached step 9); the below-gate OWNER FACE falsifier remains the load-bearing proof. It DOES prove
**CLASS 2 (over-target/quiescence settle) gates EARLIER than CLASS 1** — until the cluster quiesces
within the recovery-barrier budget, runs never reach the publication check. So CLASS 2 is the immediate
priority. Over-target 153-155s is within historical range (122-159s) = NOT a regression from the owner
fix (which only adds a cooldown-gated owner-RPC AFTER missing=0/steady, not during the churny over-target
window). CLASS 2 root (prior investigation): readiness-cache repair storm → seed load → raft heartbeat
starvation → leader churn → 15s quiet window never closes → over-target > 120s. NEXT = CLASS 2 decision
(human product-bar): is the 120s budget right vs the system's real ~150s settle, OR confirm the raft
re-election is spurious (autonomously-fixable) vs genuine-starvation (load-bound/high-blast-radius)?

---

## AUTONOMOUS RUN 3 — 2026-06-19T21:48Z (fresh 10h, deadline 2026-06-20T07:48Z)
Mandate (user, this session): run the N=8 gate now that BOTH operation-drain transport heads are fixed
below-gate, then drive doneWhen autonomously for 10h using SUBAGENTS to rubber-duck/verify (not the user).
Same discipline as run 2 (deterministic-first, one-invariant-at-a-time, falsify-below-gate, verify-via-subagent,
commit-when-verified never push, smallest-first N=3 / N>=8 only for a rate verdict).

PRE-RUN STATE (this session, both committed on main):
- 97f55323 SELF-dispatch: self-owned coordinator handoff short-circuits to in-process dispatchOperation lane
  instead of a failing transport self-send during the restart init window.
- 40928ba2 B-INCOMING: late dispatch SERVICE_RESPONSE (delivery confirmation) was absorbed after its waiter
  retired → coordinator re-drove a DUPLICATE; fix = opaque responseContext + TRANSPORT_EVENT.LATE_RESPONSE_HONORED
  → owner stops the duplicate re-drive. Both below-gate verified (falsifier red-on-revert, transport 1442/1442,
  rebalancer/safety-pregate/DT6 green, subagent TRUSTED), NEITHER gate-validated.

- iter0 2026-06-19T21:48Z: anchor reset to fresh 10h. Launched N=8 gate (bash scripts/rolling-restart-stat-gate.sh 8,
  NO_PROGRESS_MAX_ELAPSED_MS=900000) detached → test-output/autorun-gate-n8.log. PURPOSE: quantify whether removing
  the two transport confounds moved per-run PASS rate off the operation-drain stall. While it runs (~1hr): refresh
  the corpus view (npm run analyze:latent-blockers) + re-ground the LOAD-ROOT operation-drain diagnosis so the next
  diagnostic is ready if the gate doesn't move the needle.

- iter1 2026-06-19T23:0xZ: GATE 214831Z (N=8, srcFP 059f08d3 = SELF 97f55323 + B-INCOMING 40928ba2).
  **8/8 CONVERGED missing=0, 0 corrupt/breach/oracleBlind/nodeExit/stale (cluster SAFE every run). passRate 3/8
  (runs 2,5,8 PASS). doneWhen=false.** Walls p50 548 / p95 695. RESULT: the operation-drain transport head
  LARGELY CLEARED — operation_drain_stalled only 1/8 (run3), and convergence_timeout + publication_missing_active_node
  (the prior 5/6 binding reasons) GONE. Both transport fixes are CONFIRMED KEEPS. Frontier ONION-PEELED to the
  CL-001 publication family: publication_epochs_disagree x2 (run1,run6 — MOST FREQUENT new dominant),
  published_active_nodes_disagree x1 (run7), + leadership_unstable x1 (run4, raft churn). NEXT (smallest-first,
  most-frequent failing reason) = publication_epochs_disagree — a rejoined publications follower frozen at a stale
  epoch believing steady (CL-001; variant-D 7bc38dd9 + owner-face 4dc9d9e4 were supposed to fix it but it RESURFACES).
  Extract run1/run6 mechanistic evidence (frozen node + epoch gap) → rubber-duck diagnosis with subagent → falsify-below-gate.

- iter2 2026-06-20T~00:0xZ: Targeted publication_epochs_disagree (most-frequent new dominant, 2/8). Extracted exact
  signal: a 2-EPOCH skew between seed 7493b0ab and rejoiner 11601fe0, NON-MONOTONIC (run1 rejoiner LAGS 18v20;
  run6 rejoiner AHEAD 13v11 — the leader-reference seed lagged + was `not-owner` at sample time). Rubber-duck
  subagent (deep log+source mine) → LEANS ORACLE-FIDELITY (sampling skew during fast epoch churn ~1/5-20s vs 15s
  consistency wait; a frozen-stale node can't be AHEAD), but COULD NOT PROVE it (rejoiner incarnation-2 live epoch
  not in captured gz logs). run7 published_active_nodes_disagree = SAME family (lagging node carries a subset
  published-active set). DECISION: relaxing the consistency oracle is the HIGHEST-blast-radius change (it's the
  PASS/FAIL judge) → do NOT relax on "leans" without proof. INSTRUMENT FIRST (committed d1de030f, verdict-neutral,
  oracle suite 61/61): waitForConsistencyConvergence now records the per-poll per-node publicationEpoch timeline →
  error.diagnostics.consistencyPollHistory → report. Launched instrumented N=4 gate (buaik6fq8). NEXT on exit: read
  consistencyPollHistory on the failing publication-family run(s) — if the lagging node's epoch ADVANCES across
  polls (closes) = oracle-fidelity → fix the oracle (bounded monotonic skew tolerance + subset-consistent
  published-active sets + anchor refEpoch on MAX, seam assertions-consistency-comparison.js:789/814); if PINNED =
  product frozen-node → fix the catch-up. Oracle fix is unit-falsifiable below-gate (assertConsistencyFromSnapshots).

- iter3 2026-06-20T~01:0xZ: Instrumented N=4 gate 232002Z (srcFP 059f08d3, instrumentation is test/ so fingerprint
  unchanged): 1/4 PASS (run4). Did NOT reproduce epochs_disagree this sample (multi-headed rotation): run1
  quiescence_candidate, run2 observer_authority_visibility_lag, run3 convergence_timeout. Combined N8+N4 = 4/12 PASS
  (0.33) across ~7 distinct modes. KEY: the instrumentation WORKS — run2 pollHistory (4 polls) showed publication
  epochs ROCK-SOLID (all 36/5 throughout); run2 failed on PARTITION-LEADER-AUTHORITY mismatch that PERSISTED the
  full 15s+ window (force-repair didn't close it) with rejoiner 11601fe0 transiently unobservable at t+45s. So NOT
  every consistency head is trivially-closing sampling-skew — observer_authority_visibility_lag leans
  genuine-visibility-lag/product, while epochs_disagree leans oracle-fidelity (still unproven — not reproduced).
  Heads have DIFFERENT root classes. DECISION: launched larger N=6 instrumented gate to capture the epochs_disagree
  timeline + rubber-duck the STRATEGY (oracle-fidelity vs per-head product vs structural cutover) with a subagent in
  parallel before committing to any oracle (PASS/FAIL judge) change.

- iter4 2026-06-20T~01:1xZ: STRATEGY rubber-duck (skeptical-architect subagent) on the multi-headed frontier.
  VERDICT = Option C (principled SETTLE BARRIER), explicitly NOT A (oracle tolerance) and NOT B (per-head fixes).
  PRINCIPLE: gate WHEN the oracle samples, never relax WHAT equality means. Wait for a fixed point (every node's
  publicationEpoch unchanged across K>=2 polls spanning >=1 propagation RTT + leadership map identical/conflict-free
  + inFlightCount==0 + leaderQuiet holds), THEN run the EXISTING exact oracle unchanged. Non-masking: if no fixed
  point in budget -> honest convergence_timeout (a real liveness failure), not a misleading consistency mismatch.
  Why C>A: A ("tolerate monotonically-nested skew while epochs advance") passes DURING liveness = exactly when a
  transient split-brain is indistinguishable from healthy skew; advancing-epoch proves liveness NOT agreement.
  Why C>B: corpus shows epochs_disagree "fixed" repeatedly + resurfaces = signature of sampling a MOVING TARGET,
  not a code defect. UNIFYING ROOT: epochs_disagree + published_active_nodes_disagree + observer_authority_visibility_lag
  = one phenomenon (rejoiner snapshot lags the post-restart propagation tail) -> stop-barrier fixes all 3 at once;
  leadership_unstable/convergence_timeout are NOT sampling artifacts (barrier converts them to honest timeouts).
  DECISIVE FALSIFIER (free, data on disk): read consistencyPollHistory on the sampling-head failures -> if lagging
  epochs were ADVANCING-toward-agreement at timeout = C wins (just needed to stop); if PINNED/frozen = real product
  bug = pivot to D (membership-single-owner cutover). RISK the subagent flagged: C only helps if a fixed point
  EXISTS within budget; N=12/7-heads is statistically thin. NEXT: N=6 instrumented gate (bqqpwkq13) running to
  capture the epochs_disagree poll-timeline -> read it -> confirm C-vs-D -> build the stop-barrier if C.

- iter5 2026-06-20T~02:0xZ: Instrumented N=6 gate 235527Z: 1/6 PASS. CAPTURED the epochs_disagree poll-timeline
  (run3) — DECISIVE for C-vs-D. Timeline: t+6s 4 nodes@19 + ebc4aa0b@17; **t+11.8s ALL 5 nodes @ epoch 19
  (FULL epoch agreement!)**; t+46s only 3 nodes observed (35a891b8@17, 11601fe0@19, ebc4aa0b@17) w/ a 34s poll-gap;
  t+79s 7493b0ab@11(!) — epochs read BACKWARD + nodes dropping out. INTERPRETATION: epochs CONVERGE (not pinned →
  NOT a frozen-node product bug, D refuted), then the oracle keeps polling into a DEGRADED-OBSERVABILITY window
  (missing nodes, 34s blocking admin reads, stale/regressed epoch reads) and reports a misleading final
  "11 vs 19". The clean t+11.8s poll (epochs all 19) STILL failed the oracle — on a NON-epoch dimension my
  instrumentation couldn't see. Also N=6 had convergence_timeout x2 (over-target 154-162s) + NODE_EXIT x2
  (run5 35a891b8, run6 11601fe0 — joiner exitCode=1, CL-030 drain-timeout lineage, NOT my changes, intermittent,
  0 in prior 12 runs). Combined 18 runs srcFP 059f08d3: 6 PASS (0.33). DECISION: the ONE missing fact (what fails
  at the clean-epoch poll) determines the precise C fix → enhanced instrumentation (committed 4c0e67dc, verdict-
  neutral, oracle 61/61) to record per-poll mismatch reasonCode + node pair. Diagnostic N=6 gate bsp9ex0vi running.
  DESIGN (defensible C barrier, pending reasonCode confirm): waitForConsistencyConvergence should not report a
  failure from an UNSTABLE (epochs changing) or UNDER-OBSERVED (missing nodes) poll — keep waiting to a hard cap;
  report the last STABLE+FULLY-OBSERVABLE mismatch (genuine divergence) or an honest "did not stabilize" timeout.
  Non-masking (exact equality preserved). OPEN RISK: may relabel not raise PASS rate if clean window never holds
  (churn root); reasonCode data resolves whether clean-window failures are transient-snapshot (fixable) or real churn.

- iter6 2026-06-20T~03:0xZ: DECISIVE PIVOT C->D. Enhanced-instrumentation N=6 gate 005922Z (1/6 PASS) captured TWO
  epochs_disagree timelines with FULL observability (n=5 every poll, fast polls — no degradation this time):
  **run3: ebc4aa0b PINNED at epoch 7 for the ENTIRE 64s window while all 4 others sit at 11 (never advances).
  run6: 35a891b8 PINNED at epoch 5 for 66s while others at 9.** This is a GENUINELY FROZEN FOLLOWER = D (product
  bug), NOT C (oracle-fidelity). The subagent's own falsifier: "PINNED across all polls while others moved = real
  frozen-node product bug." My earlier run3 read (235527Z) was CONFOUNDED by snapshot degradation in that run; the
  clean 005922Z data settles it. INSTRUMENT-FIRST PAID OFF: it stopped me shipping a C/A oracle-relaxation that
  would have MASKED a real frozen-node bug. Per-poll reason: starts observer_snapshot_repair_deferred (oracle's own
  force-repair DEFERRED on the frozen node) -> publication_epochs_disagree. Gap is consistently ~4 epochs; frozen
  node differs per run (ebc4aa0b, 35a891b8 — whichever lands frozen post-restart, NOT always the rejoiner). variant-D
  catch-up (7bc38dd9, refreshDeferredPublicationsCacheFromAuthority on periodic !isLeader branch, 5s cooldown -> ~12
  attempts in 60s) is NOT advancing these nodes. KEEP both instrumentation commits (verdict-neutral, valuable).
  NEXT: diagnose WHY the frozen node never catches up (3 candidate mechanisms: catch-up read defers/early-returns;
  node not classified as publications replica + owner-RPC failing; periodic driver doesn't fire for that node id) ->
  rubber-duck w/ subagent on the frozen node's logs + catch-up source -> below-gate falsifier -> fix.

- iter7 2026-06-20T~03:3xZ: ROOT CAUSE PINNED (subagent, evidence-chained). The variant-D catch-up RUNS every ~5s
  tick on the frozen node's !isLeader branch (32x, NOT cadence/gating) and READS SUCCESSFULLY — but the owner-RPC
  read passes preferLeader=FALSE (AUTHORITATIVE_OWNER_RPC_READ_PREFER_LEADER=false, cdc-integration-service-owner-
  rpc-read-execution.js:32,:363), so it SELF-SERVES the frozen node's OWN stale local control_plane_publications
  replica (the node HOSTS publications replicas) and applies rowsApplied:17 rowsSwept:0 = a stable STALE set, max
  epoch = frozen epoch. The node's ownerStream reads desired=committed=observed=7 acked/current = it sincerely
  believes 7 is fully committed (REPLICA-DB-stale, not just cache-stale). FIX (HIGH conf): thread preferLeader:true
  through refreshDeferredPublicationsCacheFromAuthority's owner-RPC read (coordinator-reconcile.js:279-288) so it
  reads the LEADER's fresh epoch, NOT a stale local replica. Thread the option (don't globally flip the const) =
  narrow blast radius. CRUX TO VERIFY BEFORE CODING: the leader 7493b0ab is deniedByNodeId serve-lane w/
  PRIORITY_CONTROL_PLANE_RECOVERY_PENDING -> leader-pin only works if the read uses a dimension the recovery-gated
  leader still passes (subagent says catch-up uses CONTROL_PLANE_RECOVERY_ELIGIBLE @ :332-334 -> verify it reaches
  the leader). Blast radius: read-only/leader-routing-only, never writes/promotes/trims (B4 untouched); fail-soft
  local fallback exists (read-flow.js:445-453). Below-gate falsifiable (assert preferLeader===true + stub topology
  {leader=11,local=7} -> returned max epoch 11; red-on-revert serves 7).

- iter8 2026-06-20T~04:0xZ: FIX LANDED f4e920d6 — variant-D publications catch-up now pins the owner-RPC read to
  the LEADER (preferOwnerRpcReadLeader threaded through hydrate -> executeAuthoritativeOwnerRpcRead -> executeOnPartition
  5th arg). Root: preferOwnerRpcRead alone routes to "an owner" with preferLeader=false -> frozen node self-serves
  its OWN stale local publications replica (no-op apply) -> frozen forever. Fix reads THE leader (holds authoritative
  epoch; recovery-eligible dimension lets a SERVE-denied recovery-pending leader still serve). Falsifier red-on-revert
  (preferLeader=true threads to executeOnPartition); variant-D test updated; cdc read 138/138; safety-pregate 99/99;
  lint. Subagent adversarial-verify TRUSTED-WITH-NOTES: MAKE-OR-BREAK = YES (controlPlaneRecoveryEligible orthogonal
  to SERVE_ELIGIBLE; leader candidate filtered by recovery-eligible dimension, no separate SERVE re-check; pinned by
  query-executor-executeonpartition-leader-resolution.test.js:135-173). Narrow blast radius (default false for all
  other owner-RPC callers); fail-soft local fallback preserved (no regression if leader unreachable). RESIDUAL NOTE:
  targets the FOLLOWER-frozen case (observed: ebc4aa0b was isLeader:false/not-owner); an OWNER-FACE-frozen node (node
  wrongly retains publications leadership w/ frozen local replica) would need a separate fix — NOT observed; watch for
  it in the gate. Launching validation N=6 gate (srcFP changed) to confirm publication_epochs_disagree -> 0 + read
  pass rate. Instrumentation still in -> if any node still freezes, the poll-timeline will show it.

- iter9 2026-06-20T~05:0xZ: VALIDATION GATE 021312Z (N=6, srcFP 10757a8f = leader-pin fix f4e920d6).
  **publication_epochs_disagree = 0/6 — ELIMINATED** (no consistency-mismatch failures at all; all runs polls=-).
  passRate 3/6 (runs 1,4,6 PASS) — up from 3/8. The leader-pin fix CONFIRMED KEEP: frozen-follower epoch head GONE.
  Frontier peeled to: replica_operations_in_flight x2 (run2/run3, "Control plane did not quiesce within 300000ms"
  attempts=184/133) + nodeSlotUnavailable x1 (run5, acknowledged writes missing = placement CL-003 lineage).
  SESSION ARC: 3 fixes landed (SELF transport 97f55323, B-INCOMING transport 40928ba2, leader-pin catch-up f4e920d6)
  moved passRate ~17-33% -> 50% and cleared the publication + operation-drain-transport heads. doneWhen still false
  (need 3 CONSECUTIVE; 1P 2F 3F 4P 5F 6P = no streak). NEXT head = replica_operations_in_flight (control-plane
  quiescence never holds) — CL-038/043/census-run2 lineage (surplus-drain + raft leadership churn resets the quiet
  window). Extract run2/run3 diagnostics (effectiveInFlightCount, leadership churn, which partitions) to decide
  tractable-orphan vs deep-churn-root (latter = high-blast-radius/deferred).

- iter10 2026-06-20T~05:3xZ: Diagnosed replica_operations_in_flight (subagent, log+source). VERDICT = TRACTABLE,
  it's the SELF-dispatch no_handler wedge AGAIN but on a DIFFERENT path than my SELF fix 97f55323. The 2
  effectiveInFlight REPLACE ops (control_plane_publications-p1 f6517036, sql_transaction_participants-p1 3fd9a8dc)
  are ORPHANED: target replica DID finish (ACTIVE), but stuck in SOURCE-REMOVAL — the source-removal dispatch is a
  SELF-send (op targets the coordinator node itself) over the loopback websocket -> transportReasonCode:no_handler
  -> 13x deferred -> never terminalizes -> effectiveInFlight=2 forever (leadership QUIET 62-161s, NOT churn).
  My 97f55323 short-circuited the WAKE path (dispatchSelfOwnedCoordinatorCreatedHandoff); the EXECUTE_ACTIVE_REPLACE
  source-removal path (executeOperationInternal via executeOperationFromReconcilePath, dispatch-execution.js:462) has
  NO self short-circuit -> still self-sends over ws. Reconciler f95f3c98 REACHES it but loops on the un-completable
  self-send. = exactly commit 1b057457's "right fix is rebalancer/lifecycle gating not transport". FIX SEAM:
  executeOperationInternal — when isReplaceRemoveDispatchPhase && dispatch target===this.nodeId, route source-removal
  in-process on the owner lane (mirror dispatchSelfOwnedCoordinatorCreatedHandoff) instead of messageRouter.deliver
  to self ws. Low blast radius (one dispatch lane), below-gate falsifiable (REPLACE@ACTIVE self src/target + router
  no_handler -> assert in-process dispatch + terminalizes REMOVED, red-on-revert). NOT the deep root, NOT census-run3
  rank1 (that's persisted_not_dispatched/DISPATCH_PENDING). NEXT: research executeOperationInternal seam -> implement.

- iter11 2026-06-20T~06:0xZ: Pinned the source-removal self-send PARADOX (ebc4aa0b run2 log). The REMOVE_REPLICA
  source-removal targets ${sourceNodeId}/service/replica-handler (OPERATION_HANDLER[PARTITION]='replica-handler',
  NOT replica-dispatch — so the subagent's "owner lane" seam was WRONG). At 02:26:07-08 the self-sends return
  transportDeliveryState=delivered + transportReasonCode=no_handler + targetConnectionState=connected +
  ws://127.0.0.1:8082 + targetConnectionIsIncoming=false — YET ReplicaHandler was REGISTERED at
  ebc4aa0b/service/replica-handler from 02:20:32 until unregister 02:26:09 (~2s AFTER the sends). PARADOX: handler
  registered, but self-send went over the loopback ws (deliverRemote, NOT in-process deliverLocal) and receive-side
  returned no_handler. Hypothesis: address/incarnation mismatch (operation.sourceNodeId vs the registered
  this.nodeId address) makes deliverLocal's handler lookup miss -> falls through to deliverRemote -> no_handler. This
  is a DEEPER transport-addressing puzzle than "handler late". Launching a focused investigation to pin whether it's
  a deliverLocal-bypass / address-mismatch self-send bug with a clean low-risk fix, or a deep transport bug (then
  consolidate). SESSION WINS SO FAR: 3 verified fixes (97f55323, 40928ba2, f4e920d6) moved passRate ~17-33%->50%,
  eliminated publication-epoch head + cleared operation-drain-transport head. doneWhen still false.
