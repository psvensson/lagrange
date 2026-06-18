---
id: latent-convergence-blocker-census
roadmapRow: RM-0.1-fs-rolling-restart
status: sharpening
graduatesTo: topology-convergence-hardening
---

# Epic: Latent convergence-blocker census (parallel deep analysis)

## Intent (the problem this plan solves)

The rolling-restart gate is a **serial, max-frequency oracle**. Each ~40-min N=5
run surfaces only the *single highest-frequency* dominant reason; every other real
blocker is **masked** behind it. So progress has been onion-peeling:

```
publication_epochs_disagree (fixed) → surplus-drain leader-handoff wedge (fixed)
  → leadership-churn / quiescence settle-time → nodeSlotUnavailable → … ?
```

Each fix reveals a "surprising" next blocker that was there all along. Discovering
them one gate at a time is slow (a gate per layer) and noisy (N=5 is within sampling
variance — 3/5 then 1/5 is not a real rate).

**Goal:** stop discovering blockers serially. Use parallel agents to analyze the core
control-plane **and SQL data-plane** logic *below the gate* and enumerate as many
latent blockers as possible at once — each a falsifiable, adversarially-verified
record with a mechanism, a below-gate reproduction design, a fix-risk estimate, and
(crucially) its **masking relationship** (what hides it today / what it will hide next).

This is a *census + ranking* epic, not a fix epic. No production code changes here; the
deliverable is a ranked frontier we then execute one-invariant-at-a-time. Output feeds
`topology-convergence-hardening` + the closure ledger.

## Settled scope & parameters (decided 2026-06-18)

- **Scope: control-plane + SQL data-plane.** The wedge that motivated this already
  spanned both — `sql_transactions`, `sql_transaction_participants`, `sql_write_operations`
  sat at 5/3 surplus alongside `control_plane_publications` and `replica_operations`.
- **Peel depth: until dry, budget-capped.** Keep peeling assume-fixed layers until two
  consecutive iterations surface nothing new OR the token budget cap is hit (see
  *Budget & stop conditions*).

## Why parallel agents (and why this beats more gates)

- A gate shows ONE blocker; N independent analyses surface N at once. The masking that
  makes the gate serial does not constrain static + below-gate analysis.
- The hard-won failure modes of solo analysis (all over the closure ledger / memory) are
  **overclaim** ("regression!" / "0% ever" — later refuted) and **single-lens blindness**.
  Parallelism with *diverse lenses* + a dedicated *adversarial-refutation* stage is the
  direct countermeasure.
- The deterministic substrate exists (DT4 virtual clock, DT5 seeded RNG, DT6 multi-node,
  TLC models). The gate is the FINAL integration check, not the falsifier — candidates can
  be confirmed/killed below it.

## Non-negotiable guardrails (in every agent prompt)

1. **Falsifiable + grounded.** Every candidate cites `file:line` and/or specific report
   evidence. No claim from log-absence ("absence proves nothing").
2. **Mandatory adversarial verification.** Every finder candidate is attacked by a skeptic
   before it enters the frontier. Default to *refuted* under uncertainty.
3. **Classify the failure kind** (the fix differs): `product-bug` · `oracle-over-strictness`
   · `cost-of-correctness/settle-time` · `harness-reliability tax`.
4. **Masked-real vs variance.** N<8 single gates are noise; lean on the *aggregate over all
   reports* + below-gate reproduction, never one run.
5. **Below-gate first.** Pick reproduction by violated-invariant class (TLC = design/liveness;
   fast-check = decision-kernel race; directed chaos via `waitForState` = structural
   precondition; unit = pure logic).
6. **Anti-speculation guard for deep layers** (critical for until-dry). An "assume-fixed"
   layer is a HYPOTHESIS, not a finding. Each must (a) name the *exact* code change assumed,
   (b) trace forward through *real current code*, and (c) carry a `peelDepth` + decaying
   `confidence`. If a layer cannot be grounded in current code (it depends on a fix that does
   not yet exist), park it as `speculative — needs prior fix to materialize` rather than
   asserting it. Deep layers are explicitly labeled and ranked below grounded ones.
7. **No goalpost drift / no silent caps.** If a lens bounds coverage, it says so.

## Uniform candidate-record schema (every finder emits this; enables dedup/merge/rank)

```
{ id, lens, subsystem,
  mechanism,            // one-paragraph, with file:line anchors
  trigger,              // exactly when it fires in the rolling-restart timeline
  failureKind,          // product-bug | oracle-strictness | settle-time | harness-tax
  maskedBy: [ids],      // what currently hides it (often a higher-freq reason)
  masks:    [ids],      // what it will reveal once fixed
  evidence,             // report ids / log refs / source trace
  gateReasonCorrelation,// which dominant/non-dominant gate reason this maps to (or "novel")
  falsifierDesign,      // class + concrete harness (existing repro? DT4/5/6? TLC? new?)
  fixSketch, fixRisk,   // low | med | high (+ why)
  peelDepth,            // 0 = visible now; N = exposed after assuming N layers fixed
  confidence }          // set by Phase 2 adversarial verification
```

## The strategy: parallel lenses + outer peel-until-dry loop

### Phase 0 — Grounding pack (1 agent, first; shared brief)
- umbrella + per-record invariants (`closure-ledger/CL-*.md`);
- current frontier (`solve frontier`, this session's CL-001/CL-043 updates);
- DT substrate map + analyzer inventory (`docs/deterministic-directed-testing-plan.md`,
  `test/distributed/harness/README.md`, `npm run` analyzers);
- **full historical reason distribution** mined from all ~123
  `test-output/reports/*.report.json` — every dominant AND non-dominant reason ever seen,
  with frequency + co-occurrence. This is itself a masked-blocker map.

### Phase 1 — Parallel finders (fan-out; emit candidate records)

- **L1 · Subsystem state-machine deep-reads** (one agent each):
  - *Control-plane:* membership-publication coordinator · rebalancer surplus-drain +
    placement · raft leadership + liferaft · control-plane quiescence oracle ·
    readiness / active-gate · CDC propagation + anti-entropy.
  - *SQL data-plane (added per scope):* SQL write / transaction coordination
    (`sql_transactions`, `sql_transaction_participants`, `sql_write_operations` —
    surplus + commit/participant settle) · data-plane replica placement + min-replica /
    quorum rules (vs the priority-control-plane rules) · query/write routing under
    membership churn.
  Each maps the *rolling-restart* path and marks every wedge / churn / stale / circular point.
- **L2 · Invariant census via the circular-dependency CLASS**
  ([[circular-dependency-class-formation-vs-steady-state]]): for each core invariant, find
  the formation/recovery interleaving where a steady-state invariant goes circular but
  cold-start escapes.
- **L3 · "Assume-fixed" forward simulation (the onion-peeler).** Take each known/just-fixed
  blocker, assume it gone (per guardrail 6), and trace forward to the next thing that gates
  convergence/quiescence. Enumerate predicted layers with `peelDepth`.
- **L4 · Lagging-persisted-vs-live-state census.** The family we keep re-hitting:
  decisions reading a *persisted/CDC-propagated* row (`publication_epoch`, `raft_role`,
  `leader_node_id`, readiness rows) that **lags live state during churn** (variant-D,
  CL-016/035/043). Enumerate *every* gate/decision with this shape, CP and data-plane.
- **L5 · Historical evidence mining.** From Phase 0: for every reason ever seen, when is it
  dominant vs masked and behind what → the "what surfaces next once X clears" map from data.

### Phase 2 — Adversarial verification (fan-out, per candidate)
Each candidate gets ≥1 skeptic (diverse lenses: correctness / safety / does-it-repro /
masked-or-already-fixed / product-vs-oracle). Default-refute under uncertainty; majority-refute
kills; survivors get a `confidence`.

### Phase 3 — Below-gate falsifier design (per survivor)
Design the deterministic reproduction by invariant class; mark reuse-existing-harness
(`npm run repro`, DT4/5/6, TLC) vs needs-new. A candidate not reproducible below-gate is
flagged lower-confidence.

### Phase 4 — Synthesis, ranking, completeness critic
- Dedup across lenses; build the **masking DAG** ("X masks Y masks Z") from `maskedBy`/`masks`.
- Rank by `evidence-strength × doneWhen-leverage × (1/fix-risk)`, with deep/ speculative
  `peelDepth` layers ranked below grounded ones.
- **Completeness critic** (1 agent): which subsystem / interleaving / report class was NOT
  covered? Its gaps seed the next peel iteration.

### Outer loop — peel-until-dry (budget-capped)
Re-run Phases 1–4 with the top-ranked grounded layer marked "assume-fixed" to expose what it
masks. **Stop** when: two consecutive iterations surface no new *grounded* candidate, OR the
token budget cap is reached, OR remaining candidates are all `speculative`. Each iteration
logs what it added and what it deferred (no silent truncation).

## Budget & stop conditions
- Cap total spend with a hard token budget set at launch (the workflow enforces it; once hit,
  no new agents spawn — the loop reports what it covered and what it deferred).
- Per-iteration: finders scale to subsystem count, not unboundedly; the completeness critic
  decides whether another peel iteration is worth it.
- Honest accounting: the final report states layers reached, candidates deferred for budget,
  and coverage gaps — so "until dry" never silently means "until bored".

## Deliverable
A ranked **latent-blocker frontier** (new closure-ledger candidate records + `solve frontier`
update) — each entry the full candidate schema above with verified `confidence` — plus the
masking DAG and an explicit coverage statement (covered / deferred / gaps).

## Execution vehicle

The deterministic backbone (Phase 0 grounding + L5 historical mining) is now an **npm tool**:
`npm run analyze:latent-blockers [-- --markdown|--json]` (`scripts/analyze-latent-blockers.js`),
integrated into the Quest/Solver workflow — registered in the command index (`npm run commands`,
Report-And-Triage group) and the generated `tools-index.md`, with a test suite
(`test/scripts/analyze-latent-blockers.test.js`). It mines the whole report corpus for the masked
distribution the serial gate hides and prints the grounding pack + candidate schema the agent census
consumes. Run it as the cheap pilot before any fan-out.

The L1–L4 agent fan-out + adversarial verify + peel-until-dry is Workflow-shaped (a LARGE token
spend → explicit opt-in); it consumes this tool's output as its Phase-0 brief so the fan-out is not
blind.

### First-run finding (2026-06-18, corpus = 123 runs / 104 gates, overall pass 0.252)
The tool immediately surfaced the masked frontier no single gate shows. By dominance time-centroid
(the onion-peel order), the LATE-surfacing layers — i.e. what fixes keep revealing — are dominated by
the **`priority_recovery_*` workflow/scheduling family** (`…_workflow_progress_transition_deferred`,
`…_rebalancer_handoff_retry_scheduled`, `…_workflow_progress_event_driven`, centroids 0.73–0.99) and
**`publication_missing_active_node` (×14 aggregated, centroid 0.71)**, plus `seed_contact_retrying`
and `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`. Masked-but-never-dominant co-reason:
`operation_drain_progressing` (×7 secondary). This is the data-grounded starting frontier for L1–L4.

## Decision log
- 2026-06-18 — Plan authored after the rolling-restart session exposed the serial-onion-peel
  pattern (epoch-disagree → surplus-drain wedge → settle-time). Intent: parallelize masked-blocker
  discovery below the gate.
- 2026-06-18 — Refined per user: scope = **control-plane + SQL data-plane**; peel depth =
  **until-dry, budget-capped**. Added the data-plane L1 agents, the uniform candidate-record
  schema, the anti-speculation guard for deep layers (guardrail 6), and the budget/stop-condition
  section. Status `drafting` pending go on execution vehicle (pilot vs full workflow).

## Census results — run 1 (2026-06-18)

First parallel census run (workflow `wf_c7be43af-d42`): 68 agents, **54 candidates → 47 refuted,
7 survived** adversarial verification → 6 ranked frontier items (one merge). Bounded first iteration
(finders → verify → synthesize; no peel-until-dry). Raw: `test-output/latent-blocker-census-run1.json`
(build output, not committed).

**Masking DAG head:** `publication_missing_active_node` (gate-dominant ×14) is the single top mask —
it fails the gate first and hides everything beneath. The two product surfaces that FEED it are
ranks 1–2 (coupled: rank2 masks rank1; falsify both before fixing either).

### Ranked frontier

1. **cp-cdc-stale-local-replica-catchup** · product-bug · fixRisk med · peelDepth 0/1 —
   `hydrateCdcPropagatedTablesFromAuthority` (cdc-integration-service-authoritative-catchup.js:94-98)
   calls `executeAuthoritativeSystemTableRead(table, sql, [])` with NO options, so `preferOwnerRpcRead`
   can't be threaded; read-flow.js:282-287/358-364 defaults ANY_REPLICA + local-replica-wins. A rejoined
   node hosting its OWN stale `control_plane_publications` follower serves ITSELF the stale epoch → the
   UPSERT no-ops → never advances. **This is the deeper layer beneath CL-001 variant-D** (7bc38dd9): that
   fix made the catch-up FIRE periodically, but the catch-up READ can still return local-stale. The
   variant-D test passes only because it stubs the read boundary with fresh OWNER_RPC rows
   (membership-publication-deferred-catchup.test.js:57-60) — the bypass that hides this bug. FIX: thread
   `{preferOwnerRpcRead:true}` through hydrate for the publications catch-up (keep local fallback; do NOT
   requireOwnerRpcRead); pressure-govern to avoid CL-012 seed amplification. FALSIFIER: decision-kernel
   stub at `queryLocalAuthoritativeSystemTableRows` returning a LOCAL_PARTITION_REPLICA stale epoch (NOT
   at the read-flow boundary — that's the existing-test bypass).
   > **REFUTED 2026-06-18 (adversarial below-gate trace, HIGH confidence).** The premise "a follower
   > serves ITSELF a stale local DB row" is FALSE. `applyCommittedEntry` runs the row UPSERT on EVERY
   > replica (leader AND follower) with no role gate (partition-service-entry-apply-base.js:619-627); only
   > CDC *event generation* is leader-gated (:628). `executeLocalSystemTableRead` reads that same fresh
   > `this.db`. The variant-D ledger itself says the stale thing is the `systemTableCache`, NOT the local
   > DB (CL-001.md:1206-1207) — the census conflated the two. Both topologies refute the fix: replica node →
   > local DB already fresh → `preferOwnerRpcRead` unneeded; non-replica node → local read `available:false`
   > → flow ALREADY falls through to owner-RPC → no-op. So `{preferOwnerRpcRead:true}` rescues nothing and
   > only adds owner-RPC load (CL-012 risk). The variant-D test DOES stub the path (confirmed) but exercising
   > the real local read would NOT reveal a bug. **The real epoch-disagree mechanism is still OPEN** — next
   > traces (in order): (1) the catch-up read returns a deferral/transport-not-ready early-return on the
   > frozen node so no rows reach `applyAuthoritativeCacheRepair` (read-flow.js:369-402); (2) node not
   > classified as a publications replica AND owner-RPC lane itself failing; (3) `hydrateCdcPropagated...`
   > not actually firing on the steady follower (verify the 7bc38dd9 periodic-driver call site fires for
   > the specific frozen node id). NO falsifier built (would be a fabricated-precondition tautology).
2. **cp-pub-01-readiness-exclude-empties-cohort** · product-bug · fixRisk HIGH · peelDepth 0 —
   `resolvePriorityRecoveryActiveNodeCohort` (active-node-publication-snapshots.js:320) runs
   `excludeUnavailableNodeIds` over the published baseline using readiness-excluded ids; a just-restarted
   process-alive-but-readiness-excluded baseline node is stripped → `published_active_nodes_disagree`, and
   if last baseline node, cohort → []/NONE → `publication_missing_active_node` (CL-001 circular face).
   Flagged as a possible REGRESSION from commit **8f5bc72a** (Jun 18, added readiness exclusion to the
   baseline). FIX: treat publishedBaselineNodeIds as a FLOOR (exclude only on admission-BLOCKED/fenced,
   never readiness-not-yet-eligible-alone during recovery). FALSIFIER: pure-unit on the cohort resolver.
   > **CONFIRMED + FIXED 2026-06-18 (commit 16f10dea, adversarial subagent safety-verify: TRUSTED).**
   > Regression confirmed via `git show 8f5bc72a` (renamed excludeAdmissionBlocked→excludeUnavailable,
   > started unioning readiness-excluded into the published-baseline exclusion). Mechanism confirmed by
   > driving the live resolver. Fix landed in the SAFE-direction REFINED form (not the naive floor-everything,
   > which was MEDIUM-HIGH risk): re-admit a readiness-excluded baseline node ONLY when the projection
   > recorded retention-grace reason `grace_conditions_met_but_excluded` (both liveness conjuncts held =
   > proven live). Transport-dead/stale nodes are NOT floored (would inflate the remove-safety denominator);
   > admission-blocked never floored. Falsifier priority-recovery-cohort-baseline-floor.test.js (red-on-revert
   > 4/8; 2 FLOOR + 2 SAFETY-negative + admission-blocked negative). Note (rank1 REFUTED above): the
   > rank2-masks-rank1 coupling is moot — there is no rank1 fix; this lands alone.
3. **dp-placement-quorum-4** · product-bug · fixRisk med · peelDepth 1 — data-plane (non-critical)
   partitions skip the min-voter quorum guard (operation-workflow-remove-safety-evaluator.js:279-281 gates
   it on isCriticalSystemPartition); `calculateMoves` pushes an unconditional REMOVE(REPLICA_FAILED) that
   the execution path (unified-rebalancer-move-execution.js:391-394) does NOT defer → a transiently-FAILED
   data-plane replica is torn down before its replacement is voter-ready → momentary sub-quorum write-stall.
   FIX: data-plane min-voter-ready guard on the FAILED-removal loop + the line-393 exemption.
4. **CPR-SD-03** · settle-time · fixRisk low — coordinator-created remote-handoff retry sheds at a
   per-target cap of 4 (operation-workflow-coordinator-handoff-retry.js:136-166); in a 5-node restart,
   surplus-drain REPLACEs converge on one recovering target → shed → re-driven only by the 1s checkTimeouts
   sweep (fired 1767× across 255 node logs). Lever: raise cap during recovery / fair-share scheduler.
5. **dp-routing-1-stale-routing-snapshot-recovery-candidates** · settle-time · fixRisk med — query/write
   routing queues leader-recovery candidates from a stale routing snapshot; doesn't re-resolve when
   candidates are exhausted by no_handler/leader-unavailable. Lever: merge-refresh the snapshot in-attempt.
6. **cp-quiescence-oracle-blind-vs-stall-interleaved-undercount** · oracle-strictness · fixRisk low —
   the quiescence oracle can throw a sighted-poll stall over a window that was actually oracle-BLIND →
   false-RED attribution (NOT a convergence blocker). Fix to stop mislabeling, not to converge.

### Recommended execution order
rank1 + rank2 together (coupled, both feed the gate-dominant `publication_missing_active_node`; rank1
is lower-risk and is the deeper variant-D layer) → then rank3 (data-plane correctness) → settle-time
tail (rank4/5) → rank6 (attribution hygiene). Build each below-gate falsifier FIRST.

### Caveats (from the synthesis, kept honest)
Only rank1's CDC read-path was independently re-verified in source this run; the 8f5bc72a regression
diff (rank2), the 1767× shed count (rank4), and the gate-run-3 tail are taken from verdict evidence —
confirm before fixing. Cross-item interaction (does fixing rank2 re-expose rank1 as the binding tail?)
was flagged, not modeled. No peel-until-dry this run (the next, larger iteration).
