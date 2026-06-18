---
id: membership-single-owner-cutover
roadmapRow: null
status: discussing
graduatesTo: membership-lifecycle-placement-hard-cutover
---

# Membership single-owner cutover (altitude insight)

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
