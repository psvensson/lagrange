---
id: membership-single-owner-cutover
roadmapRow: null
status: resolved
graduatesTo: membership-lifecycle-placement-hard-cutover
---

# Membership single-owner cutover (altitude insight)

> # 🚦 OUTCOME 2026-07-01 — THESIS REFUTED AS A LEVER (status: resolved). READ FIRST.
>
> The "active-membership truth has no owner / collapse the 7-source projection" thesis below was
> **falsified by deterministic implementation**: the projection's ~7 input sources are ESSENTIAL
> evidence integration (presence→trim, recovery cohort, ACK orchestration, epoch monotonicity, freeze
> safety), NOT accidental race-papering. "Delete the projection" is a proven dead end — an owner-rule
> equivalence test + an N=8 convergence gate PASSED, but making the minimal rule default-on broke ~45
> coordinator tests of intended transient orchestration; the minimal rule structurally lacks the
> presence evidence the projection integrates. Levers #2 (delete readiness guards) and #3 (rebalancer
> triad consolidation) were likewise refuted on contact.
>
> The REAL win that came out of this line: the FD-protocol upgrade — a named **SWIM+Lifeguard failure
> detector**, SHIPPED default-on (opt-out) commit `b1434fe0` after an N=8 gate (~5x pass rate,
> node-exits eliminated), graduated into the `membership-lifecycle-placement-hard-cutover` spec (§5
> step 3). Step 1 (always-on liveness phase) evolved into the PROCESS_ALIVE occupancy guard (`4700a47b`).
>
> **Do NOT re-open "single-owner cutover / delete the projection" as fresh work.** The Options and
> Decision log below are retained as the historical altitude insight that (usefully) motivated the FD
> upgrade — they are NOT a live plan. External-memory refutation trail:
> `membership-single-owner-cutover-plan` (~/.claude memory).

## Intent (why now)

Captured from a 2026-06-18 architecture-altitude review (three parallel audits of
the formal models, the core control-plane logic, and the structural arrangement).
The audits converged on one root cause behind the long-running rolling-restart
whack-a-mole:

> **Active-membership truth has no owner.** It is *computed*, freshly, from ~7
> input sources by `resolveActiveNodeViews()` (`active-node-projection.js`),
> reconciled across 4 competing authority rules
> (`evaluateProjectionReadinessDimensions`), and consumed by ~20 call sites. The
> single owner that was *designed* to fix this —
> `membership-lifecycle-controller.js` — was never made the actual writer.

That one fact shows up at every altitude: as the rotating gate blocker at runtime
(`publication_epochs_disagree` → `topology_progress_blocked` are facets of "diffuse
membership did not agree"), as 3 confirmed circular formation-vs-steady-state
dependencies in code, and as a proliferation of one-facet-per-CL TLA specs.

The decisive point: `CoupledAdmission.tla` is a model-checked proof that
single-frontier patches on a shared knob bounce one family green/another red, and
that *only an atomic whole-system reconcile converges*. The 1-line-fix-per-gate
loop provably cannot close a coupled system — so the lever is the cutover, not the
next patch.

## Options under discussion

- **Step 1 (cheap, reversible) — always-on liveness phase.** Published-baseline
  members stay active whenever the process is alive + transport-connected,
  regardless of recovery/spread state (`active-node-projection.js`
  `shouldAllowLivenessFallbackProjection`). Lowest-risk probe; directly attacks the
  rotating blocker. If it moves the gate, it validates the whole diagnosis.
- **Step 2 — finish the single-owner cutover.** Make
  `membership-lifecycle-controller` the only writer; collapse the 7-source
  projection to readiness-evidence + published-baseline. This is the atomic
  cross-owner reconcile CoupledAdmission says is required. Graduates into the
  existing `membership-lifecycle-placement-hard-cutover` spec.
- **Step 3 — decouple publication readiness from spread completion**
  (`control-plane-mutation-readiness.js` `PUBLISHED_CONVERGENCE_DECISION_RULES`).

## Open questions

- Does the always-on liveness phase move the gate on its own, or only in
  combination with the publication-readiness decoupling?
- Scope/risk of making `membership-lifecycle-controller` the sole writer while the
  ~20 existing consumers are migrated to observe-not-rederive.

## Decision log

- 2026-06-18 — Insight captured via [[architecture-altitude-review]]. Recommended
  sequence: liveness-phase probe → single-owner cutover → publication decoupling.
  Do NOT keep landing 1-line gate fixes (CoupledAdmission proves they cannot
  converge a coupled system).
