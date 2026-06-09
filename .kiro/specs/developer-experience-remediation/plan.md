# Developer-Experience Remediation Plan

## Why this exists

A single chronic convergence bug (rolling-restart membership publication) took ~12
hours to investigate and is *still* not cleanly localized. Very little of that time
was spent on the bug's logic; most went to fighting the environment: stale code
running silently, diagnostics that never appeared, non-deterministic repro, and
ambiguity about which object/loop/instance was even live. This plan fixes the
*systemic* reasons work here is slow, using that investigation as the evidence base.
Each item lists the concrete evidence, the fix, rough effort (S/M/L), and the payoff.

Ordered by leverage. The first three are about **being able to observe and trust
what the system does** — without them, every other fix is unverifiable.

---

## P0-1 — Observability: full, retrievable logs + a convergence decision trace

**Evidence.** The persisted playback bundle is a sparse curated sample — ~50 log
lines for a 400s node run, and the `control-plane-setup` and `membership-publication`
subsystems I instrumented **do not appear in it at all**. Full container logs are
ephemeral (containers are removed after each run). Net: I could not tell whether
`startOwnerMembershipDriver`/`driveOwnerMembershipReconcile` ever ran — "0
occurrences in the bundle" is uninformative because the bundle drops most output.
Multiple runs were spent solely trying to *see* a value.

**Fix.**
1. Persist the **full** per-node stdout/stderr per run to disk (gzip) before the
   container is removed, keyed by run id — not just the curated allowlist bundle.
   Keep the curated bundle as the *summary*, but make the raw log retrievable.
2. Add a first-class, **always-captured convergence/leadership decision trace**: a
   dedicated structured channel that records, per tick, who the node thinks is the
   `control_plane_publications` leader, `missingPublishedCount`, why a reconcile was
   deferred/driven, and the driver's outcome. Never sampled out; queryable per run.
3. A `--debug-logs`/env switch that disables curation (capture everything) for an
   investigation run.

**Effort.** M. **Payoff.** "Did this code run?" becomes a 5-second query instead of
an 8-minute run that answers nothing. This single item would have removed the
majority of this session's wall-clock.

---

## P0-2 — Trustworthy runs: kill the stale-process trap

**Evidence.** Reusable containers + a live `src/` bind-mount + Node's import-once-at-
boot means a run silently executes whatever `src/` existed when the process *first*
booted. Several runs I analyzed had node processes from **06:25** while the code/diags
under test were committed at **08:22** — so "0 diagnostics" meant "the diagnostics
weren't in the running code," not "the code path is dead." I drew a wrong conclusion
("driver is inert") from this before catching it.

**Fix.**
1. Stamp every run's `run-status.json`/bundle with the **git hash + mtime of the
   `src/` the node processes actually booted from** (read at process start, emitted
   in the first log line). Make a mismatch vs the working tree a loud warning.
2. Default correctness-sensitive runs to **fresh processes** — recreate reuse
   containers when `src/` changed (hash the mounted tree), or make `--no-fast-local`
   the default for the stat-gate. Keep reuse as an explicit opt-in for speed.

**Effort.** S–M. **Payoff.** Every measurement provably reflects the current code.
No more silent stale-code conclusions.

---

## P0-3 — Reproducibility: a seeded/deterministic convergence harness

**Evidence.** The same scenario yields CONVERGED / SLOW / STALLED across identical
runs (0–4 missing), and the gate fired 288× in one run and 0× in the next. A bug
that won't reproduce can't be cleanly fixed or verified; N=5 binomial noise made
60% vs 80% indistinguishable.

**Fix.** A deterministic-simulation mode for the control plane (seeded scheduler +
injected faults, FoundationDB/TigerBeetle/Antithesis-style), or at minimum seeded
ordering + record/replay of the restart timing, so a given seed reproduces a given
outcome. Pair with the existing statistical gate (`scripts/rolling-restart-stat-gate.sh`)
for the non-deterministic real harness.

**Effort.** L. **Payoff.** Failures become reproducible; fixes become provable
instead of "the distribution looked better."

---

## P1-1 — An explicit always-on "liveness" lifecycle phase

**Evidence.** *Every* recovery host was dead during the stall because it was gated
behind metadata-publication readiness — the very progress it was meant to create:
heartbeat `start()` is behind `waitForMetadataPublicationReadiness`; rebalancer
`setLeader` is behind `isBackgroundWorkReady()`. This "gated behind the progress it
creates" trap was the single hardest part of the whole investigation.

**Fix.** A documented lifecycle phase for **loops that must run to *break* a stall**,
started unconditionally at node startup, before and independent of readiness gates.
A clear, obvious home for liveness drivers (and a rule: liveness loops never gate on
readiness).

**Effort.** M. **Payoff.** "Where does an always-on recovery loop go?" becomes
obvious; the trap can't recur.

---

## P1-2 — One authoritative leadership accessor

**Evidence.** Leadership/ownership is represented ≥5 ways that lag differently:
cache `leader_node_id`, services `raft_role`, in-memory `partitionService.isLeader`,
`rebalancer.isLeader`, and the per-node reconcile-queue owner-key. The entire
"predicate staleness" saga (cache flickering false on the real leader) was me
discovering these don't agree.

**Fix.** A single `isLeaderOf(partitionId)` / `leaderNodeIdOf(partitionId)` accessor
that reads the **in-memory Raft role** (authoritative, never lags); treat all cache
copies as *derived* and never the basis for "should I act." Route every owner check
through it.

**Effort.** M. **Payoff.** No more leadership-source archaeology; predicates are
reliable by construction.

---

## P2-1 — One composition root / "which instance is live" guarantee

**Evidence.** The convergence bug I'm *still* localizing is "is the coordinator the
interval started on the same instance the runtime uses?" — unanswerable because
construction/wiring is spread across `control-plane-setup`, the seed/join paths, the
readiness service, and `entrypoint-runtime-admin-composition`. There's no way to ask
"give me the live coordinator."

**Fix.** A single composition root (or a small service registry) that owns the live
singletons and is the one place they're constructed/wired; a `getLive(X)` accessor.
Document the wiring map.

**Effort.** M–L. **Payoff.** "Which instance runs at runtime?" is answerable; orphan-
instance bugs (like this one) become impossible.

---

## P2-2 — Clearer class/stage organization

**Evidence.** Two parallel `stage` families — `…-class-stage-1/2/3.js` (the class
chain) and `…-stage-1/2/3/4.js` (helpers + the exported class) — plus the runtime
class re-exported from `stage-4`. Figuring out which class the runtime instantiates
and where to add a method took real, repeated effort.

**Fix.** Consolidate, or add a one-line header to each stage file ("runtime class =
X; extends chain = …; helpers live in …"), and a module-level doc for each
multi-stage subsystem.

**Effort.** S (docs) / L (consolidation). **Payoff.** Faster orientation; fewer
"wrong class" edits.

---

## P2-3 — Level-triggered owner reconciler pattern

**Evidence.** Membership reconcile is **edge-triggered** (events fire on the
recovering nodes), so triggers land on the wrong node and die during the stall. The
whole fix was an attempt to bolt on a level-triggered loop ("am I owner? actual ≠
desired? converge").

**Fix.** A reusable **level-triggered reconciler** base (Kubernetes-controller style:
periodic re-check of desired vs actual on the owner, work-queue + backoff), hosted on
the always-on phase (P1-1). Migrate membership publication to it.

**Effort.** L. **Payoff.** An entire class of liveness/stall bugs becomes structurally
impossible.

---

## Sequencing

1. **P0-1 + P0-2 first, together** — observability + run-trust. They are the
   prerequisite to verifying *anything* (including finishing the original bug). Cheap
   relative to their payoff.
2. **P0-3** — reproducibility, so fixes are provable.
3. **P1-1 + P1-2** — the two architectural fixes that would have made the original
   bug a few obvious lines (always-on phase + authoritative leadership).
4. **P2-1 / P2-2 / P2-3** — composition root, organization, and the level-triggered
   pattern; larger, longer-horizon structural improvements.

The original convergence bug should be re-investigated *after* P0-1/P0-2 land — with
trustworthy, observable runs, localizing it should take minutes, not a day.
