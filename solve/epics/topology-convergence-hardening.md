---
id: topology-convergence-hardening
status: open
proof: deterministic
legacy: true
roadmapRow: RM-0.1-fs-rolling-restart
graduatesTo: membership-lifecycle-placement-hard-cutover
quests:
  - cold-node-authority-reacquisition-pressure
  - executor-active-services-cache-handoff
  - formation-background-release-owner-closure
  - formation-background-release-quiescence-anchor-live
  - formation-joining-ready-phase-fence-live
  - formation-joining-ready-phase-fence
  - formation-priority-spread-authoritative-handoff-closure
  - formation-priority-spread-authoritative-publication-closure
  - formation-priority-spread-without-exclusive-self-move-cost
  - formation-release-priority-observation-owner
  - formation-schema-operation-collision-leader-read-closure
  - membership-publication-drain-determinism
  - movielens-canonical-leader-publication-retained-wake-integrity-migration
  - movielens-raft-peer-cohort-pruning-election-liveness
  - operation-ledger-quorum-authoritative-release
  - operation-workflow-drain-redrive
  - ordinary-placement-ready-lease-candidate-admission
  - priority-placement-completed-topology-observation
  - priority-placement-snapshot-owner-reconciliation
  - replica-projection-stale-leader-route-resync
  - rolling-restart-acknowledged-write-durability-visibility
  - rolling-restart-core-stability
  - rolling-restart-durable-rejoin-formation-barrier
  - rolling-restart-fresh-formation-node-authority-deferred-read
  - rolling-restart-fresh-formation-terminal-add-observation-v2
  - rolling-restart-fresh-formation-terminal-add-observation
  - rolling-restart-handoff-witness-canonical-projection
  - rolling-restart-handoff-witness-projection-v2
  - rolling-restart-handoff-witness-projection
  - rolling-restart-handoff-witness-trap-free-projection
  - rolling-restart-infrastructure-join-progress-witness
  - rolling-restart-leadership-churn-attribution
  - rolling-restart-lifecycle-owner-rebind-recurrence
  - rolling-restart-lifecycle-owner-rebind-scenario-registration
  - rolling-restart-logging-vs-publication-queue-discriminator
  - rolling-restart-outer-reattempt-owner-membership-restoration
  - rolling-restart-pre-handoff-recovery-discriminator
  - rolling-restart-run4-admin-query-backpressure
  - rolling-restart-run4-control-plane-publications-failed-operation-mask
  - rolling-restart-run4-critical-spread
  - rolling-restart-run4-drain-residual
  - rolling-restart-run4-join-runtime-activation-integrity-migration
  - rolling-restart-run4-join-runtime-activation-workflow-integrity-migration
  - rolling-restart-run4-join-runtime-activation
  - rolling-restart-run4-load-admission-backpressure
  - rolling-restart-run4-load-lane-admin-emission
  - rolling-restart-run4-load-lane-owner-reproducer
  - rolling-restart-run4-mixed-priority-context-selection
  - rolling-restart-run4-observer-staleness
  - rolling-restart-run4-operation-drain-owner-progress-token
  - rolling-restart-run4-operation-drain
  - rolling-restart-run4-passfail-discriminator-census
  - rolling-restart-run4-postrebalance-diagnostics-routing
  - rolling-restart-run4-postrebalance-drain-run15
  - rolling-restart-run4-postrebalance-trim-drain
  - rolling-restart-run4-publication-visibility-run2
  - rolling-restart-run4-readiness-analyzer-normalization
  - rolling-restart-run4-readiness-support-evidence
  - rolling-restart-run4-stat-gate-classifier
  - rolling-restart-run4-target-sync-reentry
  - runtime-replica-state-projection-retained-reconcile-integrity-reseal
  - runtime-replica-state-projection-retained-reconcile
  - runtime-service-active-outcome-remote-owner-handoff
  - runtime-service-add-creating-owner-rearm
  - runtime-service-affinity-observer-intent-parity
  - runtime-service-creating-owner-wake-progress-admission
  - runtime-service-handler-executor-outcome-late-binding
  - runtime-service-handoff-budget-rearm-reentry
  - schema-admission-canonical-drain-handoff
  - schema-provisioning-inline-execute-owner-redrive
  - transaction-recovery-poison-row-final-sql-handoff-current-hash-closure-v2
  - transaction-recovery-poison-row-final-sql-handoff-current-hash-closure
  - transaction-recovery-poison-row-final-sql-handoff-live-ab
  - transaction-recovery-poison-row-invariant
  - transaction-recovery-poison-row-live-owner-engagement-v2
  - transaction-recovery-poison-row-live-owner-engagement
authorizes: []
legacyStatus: sharpening
---

# Epic: Topology convergence hardening

## Release-truth correction — 2026-07-20

`rolling-restart-core-stability` is no longer open: the WIP sweep recorded an
operator-decision EXHAUSTED terminal after its residual mechanisms were
superseded or delegated. That decision reduces stale WIP; it does **not** prove
the Phase 0.1 rolling-restart exit criterion. The latest broad harness summary
still has 0/4 representative scenarios green, including rolling restart, and
the latest rolling-restart artifacts predate the July 20 MovieLens milestone.

The current mixed-corpus latent-blocker census is useful for orientation but
not sufficient to select a source fix: it flags late
`published_active_nodes_disagree` / `publication_epochs_disagree` candidates
and a dominant historical priority-recovery workflow class. CL-039 remains a
rare non-binding record and is not promoted from that census. The freshest
controlled evidence is instead the July 20 ordered MovieLens gate's
`cache_stale_watermark` recurrence after formation and spread converged.
Deterministic source tracing now identifies the trigger class as an
absent/expired owner-authored ready lease, not per-table cache version drift;
the missing owner-write/CDC timing witness and next slice are tracked in
`formation-complexity-consolidation.md`.
Rolling-restart release truth remains unproven and needs a newly sealed
representative gate after the selected cache-observation work, not another
attempt inside the exhausted omnibus Quest.

## Intent (why now)

Phase 0.1 ("Internal Coherence") is gated on one thing the capability checklist
cannot show: the topology control plane must actually *converge* under rolling
restart, not merely have the harness that tests it. The `Rolling restart tests`
row (`RM-0.1-fs-rolling-restart`) is ✅ as a capability, but its live truth — does
a restarted cluster republish membership and settle with no priority items — is
still red. This epic is the direction home for that push: it ties the open
convergence Quests to the active closure-ledger records they must close, so
"where we are going next" is legible without reassembling it from memory files.

## Active work (the live frontier)

The historical coupled heads were worked to terminal, and
`rolling-restart-core-stability` is EXHAUSTED by operator decision. It is not the
current binding goal and must not be reopened. The next product Quest is a
newly sealed representative rolling-restart gate after
`formation-complexity-consolidation.md` closes the selected cache-observation
precondition. `membership-publication-drain-determinism` and the owner-model
Quests remain solved mechanism evidence, not release certification.

> **(historical 2026-06-23 sub-frontier — SUPERSEDED by the update above):**
> [`convergence-timeout-leadership-settle.md`](convergence-timeout-leadership-settle.md) — after the
> slow-rejoiner remove-safety wedge was resolved (R1+R3 promoted default-ON, gate
> `stat-gate-20260623T164130Z` SAFE 3/3), rolling-restart scenario-PASS peeled to two coupled heads:
> `leadership_unstable` (rebalancer-leadership lockstep flap) + `convergence_timeout` (control-plane
> write/establishment readiness-budget burn).

Historical mechanism Quests (see `npm run overview` / `solve trace`):

- `rolling-restart-core-stability` — EXHAUSTED omnibus predecessor; never a
  current release terminal.
- `membership-publication-drain-determinism` — deterministic, self-rescheduling
  publication drain (PublicationConvergence model property). Closes `CL-001`.

Owner-model Quests that formalize the four semantic owners this depends on
(spec `core-topology-control-plane-rewrite`): `model-owner-transition-recoverable-wake`,
`model-readiness-handoff-liveness`, `model-projection-freshness-epoch-fencing`,
`model-owner-trace-validation`, `model-bounded-retry-exit-routing` — all SOLVED;
they bound the design space this convergence work executes against.

## Successor SLO contract

The fresh representative Quest must bind its result to a named hardware class,
node count, workload, failure schedule, and clean-start protocol. It reports
pass rate with a confidence interval, failure-class distribution, and p50/p95
convergence time; it never closes from one run or a longer timeout. Correctness
and acknowledged-write durability stay hard gates.

`solve/specs/metastable-convergence-resilience/` is historical mechanism input,
not current causal authority. Its stale persistent-feature-flag requirement is
removed in the planning refresh. Temporary experiment controls must be promoted
or deleted within the landing session.

## Where to start each session

Before queuing a gate or diagnosing the next blocker, run `npm run analyze:latent-blockers`
— it mines the whole report corpus for the masked blocker distribution the serial gate
hides (peel-order + emerging candidates). It is the deterministic backbone of the
`latent-convergence-blocker-census` epic (which graduates into this one); use it as the
cheap pilot that grounds the frontier before any expensive fan-out or gate.

## Open questions

- Is `CL-039` (publication write-substrate / control-plane raft leadership) a
  separate frontier under this epic, or the same invariant as `CL-001`? The
  rolling-restart log cites `CL-001/004/030`; memory flags `CL-039` as the binding
  tail. Resolve before adding it to `closesCL`.
- Does this epic graduate fully into `membership-lifecycle-placement-hard-cutover`,
  or does the owner-model half belong under `core-topology-control-plane-rewrite`?

## Decision log

- 2026-08-01 — The final-SQL handoff candidate is independently approved at
  current fingerprint `214f84db...`; its stale rejection is fully decomposed,
  but the parent Quest honestly exhausted at its lifetime scope bound instead
  of taking a fourth override. The first inheritance successor then exposed a
  Solver receipt-rebinding defect and was parked; commit `3049df7fe` repairs and
  regression-tests that mechanism. The bounded
  `transaction-recovery-poison-row-final-sql-handoff-current-hash-closure-v2`
  Quest owns only the one-path current-vehicle identity guard and terminal
  handoff. After it lands, `rolling-restart-representative-certification` owns
  one current-source N>=15 hardware-relative Wilson/safety-floor release window,
  not another mechanism-patch loop.
- 2026-07-31 — Selected `cold-node-authority-reacquisition-pressure` from the
  seed-refresh Quest's live validation. It owns restart/bootstrap authority
  consumption under pressure; `CL-021` active-gate snapshot coverage and the
  separate statistical release terminal remain downstream.
- 2026-07-25 — Removed the exhausted omnibus Quest from the active-goal list and
  selected a fresh, hardware-relative statistical terminal after the current
  cache-observation prerequisite. Linked scale certification requirements at
  `solve/specs/large-scale-data-plane-certification/requirements.md`.
- 2026-06-18 — Epic authored as the direction surface for the rolling-restart
  convergence push; quests linked to specs + closure records in the same pass
  (links backfill). Status `sharpening`: goal is sharp, the `closesCL` set for the
  publication tail is not yet settled.
