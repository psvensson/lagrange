# Operational Ground Truth (distributed work — don't get fooled)

This is the **single canonical home** for the distributed-work traps. `AGENTS.md`
points here rather than restating them, and the external auto-memory must link here
rather than duplicate them (see [`memory-boundary.md`](memory-boundary.md)).

These traps repeatedly cost agents large amounts of time. Internalize them before
any distributed-harness or convergence work:

- **Runs can silently execute STALE code.** The fast-local Docker harness reuses
  containers and bind-mounts `src/` read-only; Node imports modules once at boot,
  so a reused container keeps running OLD source. Force fresh containers
  (`docker ps -aq --filter name=ddb-test-reuse- | xargs -r docker rm -f`) and
  confirm the boot `SRC_FINGERPRINT` self-check
  ([`src/diagnostics/source-fingerprint.js`](../../src/diagnostics/source-fingerprint.js))
  matches your commit before trusting any result.
- **Absence proves nothing.** The playback bundle is a sparse curated sample — a
  missing log line does NOT mean the code did not run. Ground truth is the full
  per-node logs under `test-output/reports/.playback/<run>/.full-logs/`.
- **Deterministic-first, gate-last.** Reproduce a convergence failure
  deterministically in-process BEFORE changing code — build a targeted or
  fault-injected repro at the layer where the invariant is produced (see the
  reproduced-before-fix rule in
  [`closure-grammar.md`](../specs/membership-lifecycle-placement-hard-cutover/closure-grammar.md)
  and the substrate map in
  [`docs/deterministic-directed-testing-plan.md`](../../docs/deterministic-directed-testing-plan.md)).
  The docker statistical gate (`scripts/rolling-restart-stat-gate.sh`) is
  non-deterministic and expensive (each run is ~5–10 min): it is last-resort
  certification of a landed fix, NOT the iteration loop. **Start with the lowest N
  that could answer the question and escalate only when the result forces it.**
  Each run costs wall-clock you can't get back, so the burden is on justifying a
  LARGER N, never a smaller one. Concretely:
  - **Default to the smallest informative N, usually N=3.** N=3 is not merely a
    probe — `rolling-restart-core-stability`'s `doneWhen` is *3 consecutive
    scenario-PASS*, so a clean N=3 (3/3) literally satisfies closure (confirm with
    `solve.js probe`). A single hard breach, corruption, or clean mechanistic
    confirmation is also conclusive at N=1–3 — stop early; more runs add nothing.
  - **Escalate ONLY when the small run is genuinely inconclusive** — e.g. a
    borderline/mixed pass rate (2/3) where you need to tell variance from signal,
    or a convergence-*rate* promotion verdict where the statistic itself is the
    claim. Then, and only then, go to N≥8.
  - Never conclude a *rate* from N=1, and never default to N=8 every iteration —
    both are sampling errors, one optimistic, one wasteful. Match the sample size
    to the question, smallest-first.
  BEFORE queuing a gate, run `npm run analyze:latent-blockers`: the gate is a
  serial max-frequency oracle that shows only the single dominant reason and masks
  the rest, so do not spend a ~40-min gate to learn the next layer the corpus
  already reveals.
- **Use the analyzers, not raw-log grep.** Read
  [`test/distributed/harness/README.md`](../../test/distributed/harness/README.md) first,
  then `npm run analyze:distributed-failure -- --report <r>` /
  `analyze:causal-model` / `analyze:topology-convergence` /
  `analyze:priority-recovery-residuals`. For the cross-gate picture — which
  blockers are MASKED behind today's dominant reason, the peel-order, and emerging
  candidates — run `npm run analyze:latent-blockers` over the whole report corpus
  (the deterministic backbone of the latent-blocker census;
  [`solve/epics/latent-convergence-blocker-census.md`](../epics/latent-convergence-blocker-census.md)).
  Open raw ndjson only after an analyzer has named the owner/edge.
- **Distributed blockers are tracked one invariant at a time.** Follow
  [`solve/specs/membership-lifecycle-placement-hard-cutover/closure-grammar.md`](../specs/membership-lifecycle-placement-hard-cutover/closure-grammar.md):
  record the first violated invariant BEFORE changing code. Records live per-file
  under `closure-ledger/CL-###.md`; `closure-ledger.md` is the index.
  - **…but one-invariant-at-a-time fails when the invariants are COUPLED.** If
    single-frontier patches keep flipping one family green and another red — the
    rotating dominant reason, the whack-a-mole — you are not making progress, you
    are bouncing a coupling. The `CoupledAdmission` TLA+ model
    (`models/readiness-starvation/`) proves it: when two green-ranges overlap at one
    shared knob, single-owner patches bounce forever and only an *atomic cross-owner
    reconcile* converges. The Solver detects this (`coupled-invariant-oscillation`,
    guards rr-D/rr-F) and forces the system-theory/model rung plus an **altitude
    (framing) reflection** (`reflect --altitude`). When you see it, stop patching and
    zoom to architecture altitude: question the Quest's altitude, the modeling
    strategy, and whether truth is diffuse across owners — then EXHAUST-and-pivot if
    the lever is out of the current Quest's scope (see solver-quests.md "Mandatory
    Step-Back Reflection Turn").
- **Research existing mechanisms first — and verify they are WIRED, not half-built.**
  Before writing new machinery, search for an existing owner-boundary solution —
  parallel machinery has been built here by accident. But an existing mechanism may be
  HALF-WIRED, and looks intentional: a *hollow intent recorder* whose old path is still
  authoritative, a *projection of a projection* with no single owner, an *escape hatch*
  that quietly bypasses the guard, or evidence/state that is *computed but never
  consumed*. Before concluding a mechanism is missing, AND before building anything
  alongside an existing one, prove its wiring state — that it is the sole authority and
  actually fires — with an engagement analyzer (e.g. `analyze:fix-engagement` for
  distributed drive paths), a red-on-revert deterministic/directed test, or a code trace.
  When a mechanism is half-wired, the fix is to FINISH it to authority (retire the old
  path, close the bypass, consume the evidence), NEVER to add a parallel path around it.
- **Independently verify after implementing.** After a change, have a separate
  subagent independently verify it before relying on or reporting it.
