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
