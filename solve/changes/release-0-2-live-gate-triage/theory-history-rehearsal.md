# Theory-history rehearsal for CL-044 (formation-barrier / priority-spread-cure / readiness-circularity / planner-pacing)

Read-only research pass, 2026-08-25, before any CL-044 fix design. Sources: the
closure ledger (all placement-priority-spread / joining-readiness entries),
`solve/theory-ledger.md`, the two canonical research memos, 13 quest logs, git
archaeology on the reverted legs, the five hot-path source files at HEAD, and
`docs/steering/findings/`. Every claim cites file:line, commit, or log-line.

Operator directive honored: assume the problem is sneakier and more systemic
than it looks; the refuted theories are recorded with the same weight as the
proved ones. The repo's own doctrine for this exact moment is
`docs/steering/operational-ground-truth.md:181-206` ("a series of refutals is a
signal to widen research, not to invent a cleverer variant") and its exemplar is
`solve/changes/formation-ledger-self-move-blocks-cluster-ops/research-SYNTHESIS.md`.

---

## A. Theory table

Verdicts: **proved-and-held** (landed, engagement/gate-proven, never reverted),
**refuted** (killed by evidence before or after build), **shipped-then-reverted**
(green DT, live regression or dead precondition), **open** (recorded, undecided).

### A.1 Pre-closure-ledger era (theory-ledger.md, May-June 2026)

| # | Theory | Where recorded | Verdict | Deciding evidence |
|---|--------|----------------|---------|-------------------|
| 1 | Priority-spread timeout is an ACK gap / rebalancer starvation / subscriber init delay (triage stub) | `solve/theory-ledger.md:153` (theory-20260525-priority-spread-triage-stub) | superseded | Frontier migrated to active-gate snapshot coverage; the whole spread class later moved to the closure ledger (run4-analysis.md:130 "superseded by the closure ledger") |
| 2 | Restarted-node admin surface never binds / seed websocket cleanup / logger CPU starvation / rebalancer outbound saturation (4 candidate mechanisms) | theory-ledger.md:223,279,265,293 | refuted (status `avoided`/`superseded`) | Fresh representative routing repeatedly selected `operation_workflow_owner / workflow_progress` instead; ledger records "do not patch X unless a fresh artifact reselects it" |
| 3 | Active-gate oscillation is unbounded owner re-entry; bounding re-entry (AllowUnboundedReentry=FALSE) converges | theory-ledger.md:516-560 (theory-20260530-active-gate-bounded-reentry-*) | **proved-and-held** | TLC: bounded route converges, unbounded oscillates; 300-run model-to-real binding; representative rerun moved past the oscillation (`test-output/reports/active-gate-tlc-route.model.report.json`) |
| 4 | Rebalancer-handoff `priority_recovery_event_driven_wait` stalls because events are missed; backpressure does NOT drain autonomously → needs a scheduling-layer retry timer | theory-ledger.md:558 + :808 (theory-20260601-...-drain-escalation: "enqueued=false, retryAfterMs=0") | proved (as diagnosis) | This is the recorded ancestry of today's fixed-cadence fallback timers. NOTE: the June conclusion was "timer as safety net", and the repo has since layered event wakes ON TOP; CL-044 is the third round of the same lesson at a different gate |
| 5 | Repeated local active-gate runtime patches will fix snapshot coverage | theory-ledger.md:390-515 (runtimePromotionGuard entries) | refuted as a CLASS | `runtimePromotionGuard.state=blocked`, `saturated_history_requires_non_repeated_source_contract`, loopHealth=exhausted — the workflow itself started refusing same-mechanism-repeat patches. This is the earliest recorded institutional defense against solution ping-pong |

### A.2 Closure-ledger era (June 2026) — the spread/readiness circularity class

| # | Theory | Where | Verdict | Deciding evidence |
|---|--------|-------|---------|-------------------|
| 6 | CL-021 sub-mode (B): "the harness never consumes the handoff contract — diagnostic-only" | CL-021, corrected in CL-022 | **refuted** | CL-022.md:79-87: consumption chain proven load-bearing in mode=load (`applyLoadReadinessAdmissionGate:364` forces allActive=false) |
| 7 | CL-022 emptiness is (a) ready-lease gating in resolveActiveNodeViews, or (b) owner-truth merge not engaging | CL-022.md:59-69 | **both refuted** | Pinning subagent repro'd through the real resolvers (CL-022.md:151-168): real root = field-name contract break at the serve-path rebuild boundary (`Active` infix dropped, part-1.js:610-627); fix 2a3b3c2b translates the dialect at the boundary, never weakens the fence |
| 8 | CL-028: priority recovery actuation admission-vetoed by the readiness it reopens (circular class instance) | CL-028.md | proved (narrowed) | 131408Z-run3 log chain; first named instance of `[[circular-dependency-class-formation-vs-steady-state]]` on the admission side |
| 9 | CL-035: replacement replicas are learners (not election-eligible), hence handoff wedge | CL-043.md:177-185 ("CL-035 LEARNER HYPOTHESIS") | **refuted** | replicas were voter-ready `raft_role:follower` (198 samples); real lever = leader-TRANSFER completion, later fixed via completed-election evidence (f85135a8) |
| 10 | CL-036: publications spread wedged because the readiness-quorum gate unconditionally excludes publications from the quorum escape; conditional relaxation via the ALREADY-EXISTING `shouldRequireFullControlPlanePublicationEndpointVisibility()` is safe | CL-036.md:51-69 | **proved-and-held (guarded)** — with a recorded INERTNESS caveat | Gate 20260614T181442Z: node_ready_lease_incomplete deferrals 39→0/0/0/4; BUT the adversarial verifier recorded (CL-036.md:95-101): "the escape opens ONLY when the published summary itself declares spread satisfied — **the fix is INERT exactly when the summary still shows the gap**". That inertness is precisely what run 4 hit (run4-analysis.md:92-101) |
| 11 | CL-038 candidate #1: operationId churn defeats handoff evidence | CL-038.md:231-235 | **refuted** | operationId f3e902b0 stable across all re-dispatches (CL-038.md:124-128 CORRECTION) |
| 12 | CL-038 original "Open Nuance": completedLeaderHandoffEvidence is null | CL-038.md:122-128 | **refuted (mechanism mislabeled)** | Evidence IS recorded; it is simply not an input to `sourceRemovalLeadershipSafe`; sole binding constraint = stale `partitionRow.leader_node_id` |
| 13 | CL-038 fix: source-row-absent ⇒ handoff moot ⇒ SAFE (`sourceReplicaRemoved` disjunct) | CL-038.md:85-105 | **proved-and-held (guarded)** | Gate 20260615T071437Z: "Replica not found for leader handoff" 11→0 in all runs, real handoffs still occur, wall p50 470→370s |
| 14 | leadership_unstable is CL-039/CL-034 raft election timing | CL-043.md:45-48 | **refuted** | Churn window: ZERO candidate/vote/term events on all 5 nodes, raft term flat; churn = rebalancer-scheduler setLeader thrash driven by readiness oscillation |
| 15 | CL-043: a persist-failed REPLACE counts as "active" forever in the concurrent-op quorum gate (no terminal-timeout anchor) | CL-043.md:11-33 | **proved (fix-landed)** | Fix shares the reaper's ONE staleness definition (`isConcurrentOperationStalePastStepTimeout`); falsifier red-on-revert; safety argument: the gate is a serialization guard, quorum protected independently (CL-043.md:117-122) |
| 16 | CL-043 levers: (a) surplus drain prefers non-leader sources; churn-root lever: retain the leader's node in the target cohort | CL-043.md:262-333, CL-038.md:11-38 | proved-and-held below-gate | Lever (a): WAIT_REPLACEMENT_LEADER_OWNERSHIP 602→0; honest limit recorded: "removes the WEDGE, not the CHURN" (CL-043.md:321-326) |

### A.3 July 2026 — the self-move limit cycle and the three reverted legs

| # | Theory | Where | Verdict | Deciding evidence |
|---|--------|-------|---------|-------------------|
| 17 | Path A-D, F (flap damping, hysteresis variants, view completeness, completed-replace credit) | eval-path-*.md under `solve/changes/formation-ledger-self-move-blocks-cluster-ops/` (committed in fba0b477) | **refuted pre-build** | Each adversarially killed for a different reason — the recorded "series of refutals" trigger |
| 18 | Path H: self-revert / bounded-re-entry deadband (CRDB undo-simulation + our own active-gate wheel) | research-SYNTHESIS.md:16-68 + UPDATE | **refuted (NO-GO, HIGH)** | "You cannot build a deadband on a lying sensor": the undo-check runs on the SAME stale view; the active-gate wheel's load-bearing part was a freshness fence, not a rule-table deadband (research-SYNTHESIS.md:72-89) |
| 19 | Path E-cheap: fresh-leader authoritative SERVICES-row count read breaks the cycle | commit fba0b477 (2026-07-06) | **shipped-then-reverted** (96a0917f) | Green DT, live run-6 REGRESSION: driver was count-NEUTRAL REPLACE re-mint, not stale-LOW count; the fix only RAISED counts → thrash 5→34 (6.8x), completions -55%; "DT-proven but binding-observable-unmoved" trap (research-SYNTHESIS.md:107-132) |
| 20 | Stranded ACTIVE participant tx across raft step-down is the ledger wedge source; roll it back on the step-down edge | commit a9344058 (2026-07-06) | **shipped-then-reverted** (066bf78d) | "precondition never occurs live" — the DT's injected seam state is unreachable on the live path (operational-ground-truth.md:169-178, hard trigger 3) |
| 21 | Arm-2: diverged participant-failure mutation should be repaired advance-now instead of deferred | commit 1ce80391 (2026-07-07) | **shipped-then-reverted** (692c9dbb) | Unit-green + DT-proven + 5417 tests green, yet ~14x participant-failure storm aborted 2/2 live runs. Source of the binding hotpath A/B rule (`docs/steering/findings/2026-07-10-hotpath-failure-fix-needs-aggregate-live-validation.md`) |
| 22 | formation-ledger-quorum-spread-first: dependent admissions must hold (typed `operation_ledger_quorum_concentrated`) while the ledger quorum is concentrated and spread is actionable; concentration evidence must also feed the planner so the cure is always planned | `solve/log/formation-ledger-quorum-spread-first.ndjson` | **proved-and-held** | DT 20/20 red-on-revert; LIVE run-23: hold FIRED and RELEASED, completions 2→19 vs run-22's frozen 3 |
| 23 | formation-ledger-spread-completion-self-move-interlock-deadlock Leg A: interlock blocks on a stale bookkeeping GHOST (terminal authoritatively, STOPPING in cache) after mid-drain leadership handoff | its log | **proved-and-held** | Fix c7a3bf19-pattern: cache-bypassing owner-RPC re-verify drops the ghost, genuine in-flight still blocks; DT 4/4, scenario 3x PASS |
| 24 | Leg C: count-based approximations of the spurious over-target ADD (3 variants: occupiedCount-only; deficitEffective+inFlightReplace; min(surplus, drainPhase)) | same log, Leg C finding | **all three refuted** | Each broke a different existing regression test under adversarial verification — root was voter-VISIBILITY, split to successor |
| 25 | formation-ledger-post-spread-voter-visibility-latency: durable raft_role write silently lost to a three-writer provenance tangle (CL-035 seed defeats the CAS-guarded helper) | its log (LEG-A ROOT CAUSE) | **implemented+verified, then live-REFUTED as the binding demo mechanism** — quest EXHAUSTED | run-28 failed IDENTICALLY (same 11 CDC drops, same deferral counts): "My voter-visibility fix moved NO live observable." Then a forensics subagent refuted the solver's OWN exhaust framing (the "62 deferral" count was a cross-partition miscount; the once-per-formation defer was CORRECT run-20/22 behavior) |
| 26 | readiness-formation-liveness-circularity-closure: the readiness trust cutover deadlocks a lone seed (`all_services_filtered_by_readiness`) via three rings (attempt clocks in the live veto; cadence flips; expired lease routed through the filtered partition) | its log | **proved-and-held** | Bisected to 5d60eb451; three coupled fixes (pin semantic state only; canonical reason.codes; evidence-absent-only fail-open to known raft leader) verified across nine categories, 826 assertions; lone-seed QUERY_OK |
| 27 | Broad NODES membership in the priority set fixes formation liveness | inherited-rulesout in `formation-liveness-dependency-serial-planner.ndjson` | **refuted** | 3-4 final in-flight ops vs 2/2 reverted, 5622 vs 1711 level-50 events — aggregate regression |
| 28 | formation-liveness-dependency-serial-planner: nodes-p1 stays non-priority; one serial fail-closed goal-state owner emits ≤1 formation move/tick | its log | proved (engaged), quest exhausted on a DIFFERENT boundary | 5-of-5 probes at e85b031c; residual honestly delegated to the `cache_stale_watermark` snapshot-freshness class (also CL-022's Task-28 note) |

### A.4 August 2026 — the formation-certification arc and the current fix train

| # | Theory | Where | Verdict | Deciding evidence |
|---|--------|-------|---------|-------------------|
| 29 | Barrier oscillation (formation-barrier-spread-release-oscillation): Link A ledger-write self-dependency (spread-op progress writes route through the six unspread tables themselves) + Link B STOPPING observation never escalates | RESEARCH.md:49-71 + quest log | **proved-and-held** | DT reproduced the exact live signature; ablations proved links bind independently; "barrier itself has no bug — untouched". First verifier round REJECTED on shard-census grounds (out-of-bar), fixed and approved |
| 30 | over-target-cap-spread-cure-wipe: the over-target ADD cap unconditionally wipes the open spread cure (`addMoves.length=0` at move-planner-move-calculation-methods.js:423) | quest log | **proved-and-held** | Decision-table retention (`retain_spread_cure_adds`); **observed WORKING in run 4** (run4-analysis.md:52, `overTargetCapAddDecision=retain_spread_cure_adds`) |
| 31 | priority-spread-cure-add-hold-exemption: planner retains the cure ADD but the admission hold refuses it unconditionally — a static coupled-invariant deadlock (700x hold vs 718x retain, one pair per cycle) | quest log | **proved-and-held** | Hold now mirrors `isEngagedPrioritySpreadCureMove` one step earlier; red-on-revert exact |
| 32 | spread-cure-at-target-minting-gap: the cure declines SILENTLY in its own target state (exact-state classifier requires naturalReplaceCount>=1 plus five exact equalities); three phase-blind seams count drain-phase/terminal rows as in-flight creations | quest log | **proved-and-held** | addTransitional narrowing; live fix-run passed schema admission where both same-day clean-HEAD controls failed; explicitly compared to TiKV PD issue 6559 ("exact-state escape rule missing a neighboring composite state") |
| 33 | blocked-spread-evaluation-event-wake: parked blocked-branch entities have NO wake edge; wake through existing owners on stable release | quest log + d75b01706 + DECISIONS.md | **proved-and-held — but honestly scoped NARROW** | Landed 2026-08-10. IMPORTANT honest scoping in the attempt record itself: in the verifying run ec-q6 the live binder was NOT this timer (evaluations continued 1-5s; 216/218 ADDs skipped `operation_ledger_self_move_in_flight` because burst ops never terminalized). The wake is REAL and LATENT — it removes post-release dead time (~230s→~75s worst case, DECISIONS.md:204-210) — and does NOT cover the cold-formation open-gap parked state (see §C) |
| 34 | ledger-quorum-spread-hold-cure-drain-admission (v1→v2): the quorum-spread hold defers its own documented cure (the fenced standalone-safe surplus REMOVE); the `ledger_surplus_drain` capability was honored only at a zero-READY projection | v1 exhausted, v2 solved | **proved-and-held** | v2: capability honored regardless of READY count so "the engaged hold's own withheld joiner leases can no longer starve the drain it waits for"; doctrine-§18 interaction contract with decision table + TLC `HoldEventuallyReleases` sealed at 319ccf7fa. **This is the closest structural precedent for CL-044**: a hold whose release path was starved by the hold's own subjects |
| 35 | operation-ledger-self-move-waiter-fairness (v1 exhausted → v2/v3 solved): a disruptive self-move waiting on incumbents is overtaken forever by newer dependent admissions; durable PENDING intent + fail-closed OWNER_RPC idle proof | logs v1/v2 | **proved-and-held** (after 3 verifier rejections in v1: empty-observation collapse; complexity ratchet 1839; red-on-revert not proving the mechanism) | TLC: fixed protocol converges, admission-only protocol starves |
| 36 | formation-ledger-spread-voter-ready-readiness-closure (the certification mega-arc): joiner wedge = readiness-denial of barrier-held joiners; then a five-round seed CPU-storm chase | 217KB log | mixed: carve-outs + memo keystone **proved**; several sub-theories self-refuted along the way | (a) evidence-absent carve-out at the voter-ready floor and placement-target filter: proved, verifier-approved; (b) memoization rounds 1-4 each provably eliminated their target cost in harness yet the live run STILL failed — until the ROUND-5 KEYSTONE: the epoch probe compared live row vs cached CANDIDATE (next epoch by construction) and silently disabled every memo. Formation bar crossed (41.9s→2.69s max gap arc); (c) then exposed that a prior "pass" was VM speed, not fix efficacy (1258 builds/gap-second); (d) terminal findings: ledger surplus-drain leaves STALE ACTUALS (terminal REMOVE, ACTIVE services rows survive) wedging the quorum-spread hold forever (~50% repro) — the direct ancestor of quest #34 and of `replica-retirement-terminal-actuals-coherence` |
| 37 | operation-ledger-quorum-authoritative-release: coordinator-local cache keeps the hold engaged after physical spread; release must require leader-pinned OWNER_RPC evidence | its log | **proved below-gate; quest EXHAUSTED on an adjacent residual** | Verifier REJECTED round 1 (OWNER_RPC_PREFERRED could fall back to any local replica — closed-authority violation); approved with OWNER_RPC_REQUIRED. Park reason names the adjacent residual: post-handoff destructive stale-superset REMOVE (a new leader removing r1 from a stale 4-row view, regressing placement to 2 replicas) |
| 38 | priority-surplus-remove-authoritative-placement-fence: non-failed priority REMOVE persists only on strict services-owner proof (source is current active voter, over target, monotonic-safe) | its log | **proved-and-held; quest EXHAUSTED on the next residual** | Verifier rejection round: byte-identical duplicate rows silently deduplicated could authorize deletion — duplicates now defer. Park names the next residual: runtime-service ADD stuck CREATING with exhausted remote-handoff budget and no rearm |
| 39 | formation-grace-parallel-start-hardening: 15s bounded retention of the last COMPLETE placement observation across transient evidence-absent reads; parallel joiner starts; 60s window restored | its log | **proved-and-held** | Verifier attack refuted: grace can at most hold the barrier out of the observation-REGRESSION state; SATISFIED still requires the live drain-leg read — fail-closed preserved |
| 40 | run-4 (CL-044) candidate owner: partition-leader-role-publication-visibility (leadership end-state B) | run4-analysis.md:139-144 | **refuted for this blocker** | Binding chain contains no leader-identity misread; cure operations did execute; per-node gap budget passed |
| 41 | run-4 candidate owner: CL-022/Task-28 `cache_stale_watermark` staleness class | run4-analysis.md:119-122 | **refuted for this run** | Zero stuck cache_stale_watermark reasons in run 4 (it was the 2026-08-21 surface symptom, a repair-trigger not a blocker) |
| 42 | CL-044 itself: joiner READY-lease hold release path (cure actuation at event cadence + no circular blocker classification) slower than its own 120s fail-closed budget | CL-044.md, run4-analysis.md | **open — record-before-code** | Run 4 immutable archive; run 1 green same HEAD (racy entry, deterministic-given-state stall); GCP 7-node soak corroboration (`priority_recovery_actuation_state_action_required`, eligible_but_no_operation_created, wait mode event_driven, create_recovery_operation never actuated) |

---

## B. Fix-class scorecard

### Classes that HELD (repeatedly, across independent quests)

1. **Single-owner cutover / authoritative-read-at-the-decision-point** (the
   ReadIndex-shaped cut (a)): interlock ghost re-verify (c7a3bf19 pattern, #23),
   OWNER_RPC_REQUIRED hold release (#37), strict owner-evidence REMOVE fence
   (#38), CL-022's provable-input fix. The verifier bar is strict: fallback to
   non-owner replicas gets REJECTED (#37 round 1).
2. **Shared staleness/eligibility definition instead of a second local notion**:
   CL-043's gate reusing the reaper's ONE staleness definition (#15); the hold
   exemption mirroring `isEngagedPrioritySpreadCureMove` (#31); the shared
   evidence-absent classifier module with exactly two consumers (#36a).
3. **Finish the half-wired mechanism, never a parallel path**: CL-036 wired the
   ALREADY-EXISTING conditional (`shouldRequireFull...`) into the second gate
   (#10); CL-022 translated the dialect at the rebuild boundary rather than
   weakening the fence (#7); doctrine at operational-ground-truth.md:134-147.
4. **Event-wake THROUGH existing owners** (no new timer/queue/listener):
   d75b01706 (#33) — held precisely because it reused the tracker, the owner
   reconcile-queue ingress, and the visibility cache, honored CL-020's
   listener-cost contract, and left the stability window and fallback timers
   untouched.
5. **Decision-table + TLC-modeled interaction contracts** (doctrine §18):
   bounded re-entry (#3), `HoldEventuallyReleases` (#34), durable-waiter
   fairness (#35). Every recent hold/fairness fix in this class landed WITH a
   model artifact and survived.
6. **Typed capability/exemption minted by the owner and honored by the
   consumer regardless of projection state**: `ledger_surplus_drain` honored at
   any READY count (#34) — the direct cure for "the hold's own subjects starve
   the release path", which is CL-044's failureClass.
7. **Retention decision tables instead of unconditional wipes**: over-target cap
   retention (#30, observed working in run 4), addTransitional phase typing (#32).
8. **Identity/memo closure keyed on floored generations** for CPU storms (#36b)
   — but only after the round-5 COMPLETE CALLER CENSUS; single-site iteration
   through a storm burned five checkpoints first.
9. **Non-leader-source preference / leader retention in placement** (#16) —
   count-invariant ordering changes with subagent-verified set parity.

### Classes that BOUNCED (never ship these shapes again without new evidence)

1. **Freshness/count input tweaks computed from the lagging sensor**: E-cheap
   (fba0b477 → 96a0917f). A DT with an injected always-fresh gateway proves a
   mechanism that need not be the driver ("DT-proven but binding-observable-
   unmoved").
2. **Deadbands built on the lying sensor**: Path H NO-GO — the undo-simulation
   and the in-flight-coverage read both inherit the stale view
   (research-SYNTHESIS.md:72-89).
3. **Precondition-never-live DT legs**: a9344058 → 066bf78d. A green DT on an
   injected seam proves the test, not the fix. Binding rule: precondition
   witness BEFORE commit (operational-ground-truth.md:169-178).
4. **Defer→advance-now conversion on a hot failure path without live A/B**:
   1ce80391 → 692c9dbb (14x participant-failure storm). Binding rule:
   `docs/steering/findings/2026-07-10-hotpath-failure-fix-needs-aggregate-live-validation.md`
   — N≥2 fixed vs N≥2 reverted back-to-back on the same machine.
5. **Broadening a classification set to buy liveness**: broad NODES priority
   classification (#27) — aggregate regression; the surviving fix was the
   NARROW serial owner (#28).
6. **Count-based approximations of a placement/visibility truth**: three
   variants refuted in one quest (#24).
7. **Local timer tweaks / weakening budgets**: no quest in this class ever
   shipped a "make the timer shorter / the budget longer" product fix; the one
   deadline change that landed was a HARNESS calibration (schema gate 180→480s)
   and passed only after a goalpost-moving audit (#36 keystone follow-up).
   The stability window itself is a recorded oscillation cure ("Flapping has
   prior solutions") and is contractually untouchable (§D.1).
8. **Same-mechanism-repeat local patches**: institutionally blocked since May
   (runtimePromotionGuard, #5); the modern equivalent is the operator's
   ping-pong warning.

---

## C. The event-wake gap: why d75b01706 does not reach the run-4 parked state

The wake machinery, at current HEAD:

- **The only notify edge is stable release.**
  `notifyBackgroundPrioritySpreadStableRelease(scope)` is called from exactly
  one place: `resolveBackgroundPrioritySpreadStableRelease()` when
  `stableElapsedMs >= requiredStableMs` flips `tracker.active -> false`
  (`src/rebalancer/background-priority-spread-release-tracker.js:240-244`).
  There is no notify on operation-terminal, placement-eligibility, node-ready,
  or authority-state edges.
- **While the spread gap is open, the release can never resolve.** Every
  evaluation that sees an open gap calls
  `observeBackgroundPrioritySpreadBlocked` first
  (`rebalancer-priority-recovery-planning-gate-methods.js:246-249`), which
  re-arms the tracker (resets `clearObservedAtMs` — DECISIONS.md:30-32 pins
  this). In run 4 the gap stayed open ~2.5 minutes, so the tracker was armed
  the whole time and the wake could not fire even once. The wake covers
  "fence released after the 70s window", not "a new cure opportunity appeared
  while the gap is open" — which is exactly CL-044's obligation.
- **Both registration sites are unreachable for priority partitions.** The
  wake is registered only in the two DEFER branches:
  the blocked branch at `...planning-gate-methods.js:275` (before the flat
  `getBackgroundPrioritySpreadReleaseDelayMs()` at :276-277) and the
  stabilizing branch at :207. Priority partitions exit earlier with
  `REBALANCE_PLANNING_GATE_NOT_APPLICABLE` in both branches (:250-251 blocked;
  :204-205 cleared). So the wake's registrants are exclusively NON-priority
  (ordinary/background) entities — the ones waiting for the cure to finish.
  **The wake accelerates the aftermath of the cure, never the cure itself.**
- **The event edges the quest statement relied on exclude the entities that
  are parked in run 4's state.** The intended chain (DECISIONS.md:66-74) is:
  edge → priority-partition evaluation (event-driven) → shared-fence advance →
  stable release → wake → parked ordinary entity. The event edges themselves
  are priority-gated three times over:
  1. `bindPriorityRecoveryVisibilityCacheListener` early-returns unless
     `this.isControlPlanePriorityPartition() === true`
     (`unified-rebalancer-priority-recovery-coordination.js:110-117`), so
     non-priority entities have NO cache listener at all;
  2. every `shouldEnqueue` predicate ANDs `evidence.priorityPartition`
     (coordination.js:188-192 coordinator progress; :218-221 rebind;
     `priority-recovery-visibility-decision.js:163-168` visibility);
  3. the visibility decision additionally requires
     `operationPartitionMatches` (:130,136) — partition A's cure ADD reaching
     terminal does not wake partition B's evaluation even when both are
     priority; only coordinator progress events accept any
     `operationPriorityPartition` (:191), and those exist only on the node
     hosting the coordinator and still require `isLeader`.
- **The gate that actually paced run 4's cure has no wake at all.** The
  priority partitions' own planning passed the spread fence (NOT_APPLICABLE)
  and then deferred at the TOPOLOGY_SETTLING gate:
  `resolveTopologySettlingPlanningGateDecision`
  (`rebalancer-planning-gate-methods.js:409-444`) schedules
  `increaseCurrentInterval(WAIT)` — the multiplicative backoff observed as
   delayMs 5000 → 75000 (x39) → 120000 (x38) — and registers NOTHING. Its
  blocker is `buildTransitionalNodeBlocker`
  (`unified-rebalancer-critical-topology-methods.js:144-172`) returning
  `NODE_READY_LEASE_INCOMPLETE` for the barrier-holding joiners, with the
  CL-036 escape ANDed out at :154-158 by
  `!shouldRequireFullControlPlanePublicationEndpointVisibility()` — which for
  the publications partition returns true whenever
  `priorityRecoveryActive` (`unified-rebalancer-control-plane-readiness-methods.js:396-401`),
  i.e. by construction during cold-formation spread recovery. The flat
  [70000,80000)ms blocked-branch sleep (:276-277, delay law at
  `unified-rebalancer-policy-scheduler-methods.js:208-217` = stable window
  70000 + jitter [0,10000)) additionally parks every ordinary entity.

**Finishing vs parallel path.** Extending the wake is legitimately
"finishing a half-wired mechanism" in the doctrine's sense — with one honest
caveat. The quest statement CLAIMED "placement-eligibility/operation-terminal
edges already surfaced by the priority-recovery visibility cache reach parked
entities"; the code shows they reach only priority entities, and only for
their own partition's operations, and the wake itself fires only at stable
release. So the mechanism the statement described is half-wired for exactly
the cold-formation state: the registry, the merge-on-ownership-transfer, the
reconcile-queue ingress, and the typed `PRIORITY_SPREAD_RELEASE_WAKE` reason
all exist and are the right owners to ride. What is missing is (1) a wake
edge for the CURE ACTUATOR (the settle-gate deferral path registers nothing),
and (2) an in-gap notify condition (eligibility/terminal edges) distinct from
the stable-release flip — neither of which may touch the 70s window law.
Building a second tracker, a new listener registry, or a shorter timer would
be the forbidden parallel path; adding a notify edge to the SAME tracker/owner
and a registration in the settle-gate defer branch is the finishing move.
(The remaining design question — whether the settle-gate's circular
classification must change too — is §E.3/§E.4; a wake that re-enqueues into
an unchanged `NODE_READY_LEASE_INCOMPLETE` deferral wakes into a wall.)

**The recorded fail-closed floor (verbatim obligations):** the event-wake
quest sealed: "the stable-window semantics of the release tracker (70s
post-clear stability) are a recorded oscillation cure and must not be
weakened — the wake replaces dead TIMER time after release, never the
stability window itself; fixed-cadence fallback timers remain as the safety
net" (quest statement, log line 1; repeated in CL-044.md:52-55). The window
law: release requires the FULL continuous-clear interval
(`getBackgroundPrioritySpreadStableWindowMs` =
max(criticalCheckDelay, periodicCheckInterval 60000) + observation handoff
10000 = 70000ms, `unified-rebalancer-policy-scheduler-methods.js:176-198`);
any blocked or in-flight observation re-arms with zero residual credit;
per-entity jitter staggers the deferred cohort (a RECURRING synchronized
cadence is forbidden; a one-shot wake burst per window is the recorded
accepted shape, DECISIONS.md:104-126).

---

## D. Constraint inventory — what a CL-044 fix must NOT weaken

1. **The 70s stability window** (§C above). Wakes replace dead timer time,
   never the window; fallback timers stay armed. Pinned by
   `test/rebalancer/blocked-spread-release-event-wake.test.js` (receipt
   `stability-window-and-fallback-preserved`) and the delay-law pins in
   `test/rebalancer/unified-rebalancer-planning-gate-decisions-test-cases.js`.
2. **Barrier fail-closed semantics**: the joiner barrier latches once the
   cohort condition holds (`hasSufficientOperationLedgerFormationCohort`,
   `node-joining-operation-ledger-formation-readiness.js:169-179`), releases
   only on `startupAuthorityReady === true`, and THROWS retryable at
   `priorityPlacementFormationTimeoutMs` = 120s
   (`node-joining-constants.js:37`; :264-266) — "fails closed on timeout
   rather than opening ACTIVE over incomplete/concentrated evidence"
   (:207-216 doc comment). The two-node bypass, sequential-single-node
   growth, and durable-rejoin guards stay fail-closed (RESEARCH.md:98-99).
   CL-044's invariant is that the RELEASE PATH fits the budget — not that the
   budget grows or the latch weakens.
3. **The CL-036 guard**: the publications quorum escape must stay CLOSED while
   a publication is OPEN or recovery is active
   (`cl-036-publications-quorum-escape.test.js`, red-on-revert, with
   companion negatives proving it is not over-relaxed; CL-036.md:80-84).
   CL-036's open question #1 stands: publications is the membership-authority
   partition; "just add publications to the escape" was ruled likely UNSAFE
   (CL-036.md:166-170). Any CL-044 change to `buildTransitionalNodeBlocker`
   must preserve the OPEN-publication/recovery-active strictness for the
   publications partition specifically.
4. **Quorum-spread hold policy stack**: run-20 exclusive self-move
   serialization, run-22 quorum-spread-first ordering, the
   `ledger_surplus_drain` capability contract with TLC
   `HoldEventuallyReleases` (sealed 319ccf7fa), and the durable self-move
   waiter fairness protocol (v2/v3) are all sealed invariants that recent
   quests explicitly carried unchanged ("run-20 exclusivity, run-22 quorum
   spread, emergency ADD, remove safety, topology fences, numeric budgets ...
   remain unchanged" — waiter-fairness statement).
5. **Remove-safety lanes**: the concurrent-op gate is a serialization guard —
   quorum is protected INDEPENDENTLY by the minReplicaCount floor,
   published-membership safety, effective-voter-ready, and peer-ping checks
   (CL-043.md:117-122); the priority-surplus REMOVE fence fails closed on
   unavailable/mismatched/duplicate owner evidence (#38); CL-035 voter-ready
   visibility and CL-038's source-present-and-leader non-weakening test stay
   green. No CL-044 change may make a barrier-holding joiner count as
   REMOVE-safe capacity it does not have.
6. **CL-020 listener-cost contract**: no new per-entity cache listeners; event
   decisions must be cheap (the pre-filter before the planning re-derive).
7. **The settle gate is a planning-deferral gate, not a commit point** — its
   sole consumer is `resolveTopologySettlingPlanningGateDecision`; commits
   stay behind CL-028 admission + CL-035 move-safety (CL-036.md:88-94). A
   relaxation there lets the planner RUN; it must not become an implicit
   admission relaxation.
8. **Hotpath aggregate-live-validation rule** (binding, operator directive):
   the blocked-branch scheduling, settle-gate deferral, and barrier retry are
   hot failure-handling paths under formation churn — a fix here requires the
   N≥2 fixed vs N≥2 reverted live A/B comparing error counts on the touched
   path, and must not convert a defer into advance-now work without it
   (`docs/steering/findings/2026-07-10-hotpath-failure-fix-needs-aggregate-live-validation.md`).
9. **Precondition witness before commit** for any fix whose theory depends on
   a live precondition (operational-ground-truth.md:169-178) — CL-044's
   falsifier design (headless planner-loop + barrier seam, fake clock, plus
   the staggered-joiner live witness, CL-044.md:44-51) is exactly that
   witness and must run through the REAL seam.
10. **Reuse comparison is part of the deliverable**: REUSED vs EXTENDED vs NEW,
    with wiring-state proof for anything claimed half-built
    (`2026-07-10-reuse-comparison-before-new-machinery.md`).
11. **Formation-certification sealed terms**: 60s five-node bar, 3000ms named
    gap ceiling, fingerprint identity, natural teardown (formation-grace quest
    statement); the 15s placement-observation grace with fresh-read-wins.
12. **CL-022's meta-rule**: never let an unprovable/empty input act as (or be
    papered over into) a silent denial or a silent pass — fix the input's
    provability at the boundary, keep fail-closed admission intact.
13. **Doctrine §18 / "Interactions need owners too"** (operator memory): this
    is a cross-owner seam (bootstrap joining-readiness x rebalancer-leader
    cure planning, CL-044.md:10-11); the fix must land with an owned
    interaction-contract artifact (decision table / TLC model) encoding
    "every hold has a reachable release path" for THIS hold, the way
    `ledger-quorum-spread-hold-cure-drain-admission-v2` did for the admission
    hold.

---

## E. Open questions the fix design must answer before sealing scope

1. **Which half is binding at which scale?** Run 4's verdict says pacing is
   binding and circular classification aggravating (run4-analysis.md:185-192),
   but the GCP 7-node soak red shows the same owner with
   `eligible_but_no_operation_created` and `create_recovery_operation` never
   actuated — is that the settle-gate deferral, the blocked-branch timer, or
   an operation-creation gate? The falsifier must discriminate the two halves
   independently (CL-044.md:44-51 already demands assertions (a) and (b)
   separately) and cover the 7-node no-op-created shape.
2. **Pin the exact parked evaluation per gate.** CL-044 attributes the cure
   pacing to the blocked branch (`...planning-gate-methods.js:277` via the
   policy-scheduler delay law), but at HEAD that branch is unreachable for
   priority partitions (:250-251), while the settle gate produced the logged
   75000/120000ms deferrals. Before extending the wake, prove WHICH entity
   consumed which defer in run 4's dead windows (zgrep the archived logs for
   WAIT_CONTROL_PLANE_PRIORITY vs WAIT_TOPOLOGY_SETTLING per entity) — fixing
   the wrong branch is this class's signature failure mode (#19, #25).
3. **Do the visibility edges even fire in the parked state?** If the priority
   entities WERE re-enqueued on their own cure-op terminals (the
   `operationPartitionMatches` predicate allows own-partition terminals) and
   still deferred at the settle gate, then an event-wake extension alone
   wakes into an unchanged `NODE_READY_LEASE_INCOMPLETE` wall — the
   classification half is then load-bearing, not aggravating. Conversely, if
   edges never fired (e.g. rebalancer-leader entity not the operation's
   partition), the wake half is load-bearing. This decides fix ordering.
4. **What is the SAFE shape of the classification fix?** Candidate from
   CL-044's falsifier: a pre-ready barrier-holding joiner that is a valid
   spread TARGET must not be a `NODE_READY_LEASE_INCOMPLETE` planning blocker
   for the partition whose cure would target it. This echoes CL-036's open
   question #2 ("a weaker control-plane-replica-hostable readiness for spread
   TARGET eligibility") and the proved evidence-absent carve-out class (#36a)
   — but it must not reopen CL-036's publication-authority window (§D.3) and
   must stay a carve-out with substantive denials strict (the proved shape),
   never a broad reclassification (the bounced shape, #27).
5. **Where does the in-gap wake edge live?** Options through existing owners:
   (a) notify the tracker's registry on placement-eligibility/operation-
   terminal edges (second notify condition on the SAME scope); (b) register
   the settle-gate defer branch into the SAME registry; (c) extend the
   visibility-decision predicates to enqueue the cure-owning entity on the
   authority flip / joiner-eligibility edge. Which of these is "finishing"
   and which silently mints a second release authority? (The tracker must
   remain the single release owner — DECISIONS.md:211-213.)
6. **Does anything need the barrier side to change at all?** The barrier's
   subjects being accepted as placement targets already works (run 4: cure
   ADDs completed ON node-3, run4-analysis.md:50-51). The deeper circularity
   — the authority flip latching joiners whose own leases are the cure's
   settle-gate blockers — should be dissolved on the rebalancer side; any
   barrier-side change risks the fail-closed floor (§D.2). If the design
   touches barrier timing, it must answer why the release-path fix is
   insufficient.
7. **Re-latch behavior on rejoin**: run 4's joiners re-latched the same
   `recovery_pending` within ~300ms of teardown (attempt 2/4,
   `preserveForResume=true`). Should the fix also make the rejoin re-read
   participate in the same event cadence (a joiner-side wake on authority
   transitions is already the barrier's poll loop at 500ms — probably
   sufficient), or is joiner-side polling already fast enough that only the
   authority's own transition latency matters?
8. **Validation battery**: the fix touches a formation hot path → (i) the
   headless fake-clock falsifier through the REAL planner loop + barrier seam
   (no injected always-fresh seams — the E-cheap trap); (ii) red-on-revert;
   (iii) engagement witness on the live path; (iv) the staggered-joiner live
   witness (deterministically losing side of the flip); (v) the N≥2/N≥2
   fixed-vs-reverted A/B per §D.8; (vi) adversarial subagent verification
   with the sweep-timer + formation-circularity templates (the event-wake
   quest's templates) and the oscillation attack: prove the new wake cannot
   re-introduce the pre-tracker flapping (wake fires at most once per
   eligibility edge; window law untouched).
9. **Scorecard check before build** (ping-pong guard): the chosen design must
   state which HELD class it belongs to (§B: event-wake-through-owners +
   carve-out-with-strict-negatives + §18 contract) and why it is not one of
   the BOUNCED shapes (not a timer tweak, not a broadened classification, not
   a deadband on the cache, not a precondition-never-live DT). If the design
   cannot name its class, stop and widen research per
   operational-ground-truth.md:181-206.
