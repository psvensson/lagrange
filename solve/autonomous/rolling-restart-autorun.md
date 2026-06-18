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
