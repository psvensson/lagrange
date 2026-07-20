# Solve report: movielens-observation-watermark-churn-consolidation

**Goal:** The consolidated data-owned authoritative-observation watermark (distinct per-table observation time and cause, gateway-minted complete-table receipts, fail-closed publication) together with causally-explained divergence tolerance lands as one bounded committed source change: reconcileAuthoritativeCacheRows skips and excuses only rows the cache's own causal order proves newer than the authoritative read, so the continuously heartbeat-mutated nodes table publishes complete-table observation evidence under live churn while silently dropped writes, genuinely stale caches, and incomplete reads remain fail-closed; the deterministic dt6 composition proves red-on-revert, the TLA model's ExactEqualityReconcileGate mutant violates eventual schema admission while the fixed spec converges, and the unchanged five-node MovieLens live scenario no longer blocks schema admission in the authoritative-observation seam.

**Class:** product · **Closure:** MEASURED

**Outcome:** EXHAUSTED — 1 frontier(s) parked; human decision needed

**Attempts:** 1

## Links
- spec: solve/epics/service-data-affinity-placement.md
- parent quest: movielens-authoritative-observation-watermark
- plan: solve/epics/self-hosting-circularity-generic-treatment.md

## Scope Pressure
- Changed files: 21
- Change bytes: 125524
- Owner areas: models, scripts/model-tlc.js, src/admin, src/cache, src/control-plane, test/convergence
- Categories: other, runtime, test
- Action: split by owner area before the next attempt (21 files)
- Action: land or separate 6 owner areas: models, scripts/model-tlc.js, src/admin, src/cache, src/control-plane, test/convergence
- Split plan:
  - models: 6 file(s)
  - src/admin: 5 file(s)
  - src/control-plane: 5 file(s)
  - src/cache: 3 file(s)
  - scripts/model-tlc.js: 1 file(s)
  - test/convergence: 1 file(s)
- Signal: broad-source-scope severity=medium
- Signal: large-diff-stack severity=medium

## Frontiers
- **movielens-observation-watermark-churn-consolidation-main** [parked {exhausted}] rung 1, attempts 1, metric 1 -> 1 — Fresh current-HEAD production evidence passes and the sealed authoritative-observation failure is absent; no honest move remains within this stale seal, so a future recurrence must start from a new falsifiable observation rather than another attempt here.

## Findings
- **movielens-observation-watermark-churn-consolidation-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-16T21-56-33-815Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-16T21-56-33-815Z.report.json]
- **movielens-observation-watermark-churn-consolidation-main**: Independent adversarial verification approved this exact consolidated surface (verifier run subagent:a2f9759a1b8c82eb6 examined the identical working tree; this attempt is that tree minus the two admin websocket mock fixture files, which the verifier separately confirmed purely additive and which move to a bounded follow-up). Approval evidence: excusal predicate is exactly the cache's own silent-drop causal order with 7 adversarial probes blocked and only the two intended causally-newer cases excused; gate-1 checks and fail-closed paths unchanged; observation publishes read-time only, never mutation watermark/cause; dt6 51/51 with red-on-revert artifact dt:solve/changes/dt-prove/dt6-authoritative-observation-watermark.test.js-2026-07-16T21-30-09-628Z.json; all three TLC gates met including the ExactEqualityReconcileGate wedge mutant; post-fix live report test-output/reports/movielens-lagrange-service-affinity-live-2026-07-16T21-56-33-815Z.report.json contains zero authoritative_observation or cache_stale_watermark codes with the blocker moved to replica_operations_in_flight; cache-safety-preserved and unchanged-live-contract verified. [subagent:a2f9759a1b8c82eb6]
- **movielens-observation-watermark-churn-consolidation-main**: Live-blocker attribution for the remaining FAIL: forensics of the 21:52 run's durable ledger and service catalog show the residual replica_operations_in_flight=1 is service_definitions-p1's replacement replica, created at 21:55:45 (193s into the run) and genuinely still syncing at admission timeout; 110s of the budget was consumed by two sequential exclusive replica_operations-p1 self-moves before any spread work started. The blocker is owned by formation-ledger-self-move-blocks-cluster-ops (scheduling), not by this quest's observation seam and not by ledger completion continuity (discriminator solved at cc9c5684 rules those out). [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-16T21-56-33-815Z.report.json]
- **movielens-observation-watermark-churn-consolidation-main**: Recurrence witness: the 2026-07-17T08:50 run re-triggered nodes:authoritative_observation_cache_not_reconciled (6 repair failures on the seed before schema-admission timeout), while the 2026-07-16T21:52 run cleared it - the causal-supersession tolerance handles the churn class but a run-timing-dependent divergence class (most plausibly an extra cached nodes key when the authoritative read races membership registration, which gate-1 rejects by design) still wedges some formations, compounded by the sparse transient-repair retry cadence. A follow-up rung needs a deterministic discriminator for the extra-key-during-registration case and a decision whether registration-window divergence is causally explainable or must instead be handled by faster repair retry. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-17T08-50-32-178Z.report.json]
- **movielens-observation-watermark-churn-consolidation-main**: The sealed authoritative-observation schema-admission failure does not reproduce on current HEAD: the fresh unchanged July 20 production five-node Lagrange scenario passes its priority gate, with one scenario passed and none failed. (rules out: Do not spend another live rerun on the stale observation-watermark seal; use deterministic/model evidence for any remaining historical integrity requirement.) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-20T15-41-10-348Z.report.json]
- **movielens-observation-watermark-churn-consolidation-main**: Fresh July 20 TLC evidence binds the model surface: the fixed authoritative-observation composition converges with eventual schema admission over the complete state space, while the exact-equality and mutation-only configurations each observe their expected EventuallySchemaAdmitted counterexample. (rules out: Model coverage is not missing: companion counterexamples are test-output/reports/authoritative-observation-watermark-exact-equality.model.report.json and test-output/reports/authoritative-observation-watermark-mutation-only.model.report.json.) [test-output/reports/authoritative-observation-watermark-fixed.model.report.json]
- **movielens-observation-watermark-churn-consolidation-main**: Independent aggregate verification passed: fail-closed cache reconciliation and receipt integrity, causal-supersession narrowness, admission-window binding, fixed and mutant TLC expectations, DT coverage, unchanged live evidence, and exact 21-path aggregate scope were all rechecked. [subagent:verify_observation_aggregate]
- **movielens-observation-watermark-churn-consolidation-main**: The live cache_stale_watermark symptom recurs intermittently on current HEAD after formation and operation drain have converged, despite the bounded causal-order change and its deterministic/model proofs; the recurrence therefore survives this Quest's patch frame and requires the already-drafted structural per-table version/CAS discriminator. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-20T17-07-46-984Z.report.json]
- **movielens-observation-watermark-churn-consolidation-main**: Independent aggregate verification approved the exact current 21-path watermark/reconciliation delta: only cache-proven causally newer rows are excused, incomplete or silent-drop paths remain fail-closed, mutation and authoritative observation evidence remain distinct, DT6 passes 91 assertions with red-on-revert, and the fixed/mutant TLC expectations hold. The July 20 stale-watermark recurrence is a distinct expired ready-lease attribution gap. [subagent:watermark_aggregate_verify]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-16T22:14:49.749Z | movielens-observation-watermark-churn-consolidation-main | observe | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/movielens-observation-watermark-churn-consolidation/attempt-1.diff |
