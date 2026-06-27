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
- **Deterministic-first; the gate is a LAST RESORT ONLY.** The PRIMARY evidence
  for every convergence fix is a deterministic in-process reproduction — a
  targeted or fault-injected repro at the layer where the invariant is produced,
  red-on-revert, built BEFORE changing code and kept as the validating proof
  afterward (see the reproduced-before-fix rule in
  [`closure-grammar.md`](../../solve/specs/membership-lifecycle-placement-hard-cutover/closure-grammar.md)
  and the substrate map in
  [`docs/deterministic-directed-testing-plan.md`](../../docs/deterministic-directed-testing-plan.md)).
  A fix is "proven" when a deterministic test demonstrates the mechanism and goes
  red on revert — NOT when a gate happens to pass. If you reach for the docker
  statistical gate (`scripts/rolling-restart-stat-gate.sh`), first write down the
  exact question and why no in-process test can answer it; if you can't, you are
  not ready to gate.
  - **Run a gate ONLY when the claim is irreducibly statistical** and no
    deterministic test can stand in: a true pass-*rate* / variance question, or a
    one-time milestone certification of a landed, already-DT-proven improvement
    against a sealed bar. Mechanism, classification, recovery, and red-on-revert
    are deterministic questions — answer them in-process, never with a gate.
  - **A gate is never the iteration loop.** Do not gate to "see if it helped", to
    discover the next blocker, or to re-confirm a mechanism a DT already shows.
    Each run is non-deterministic and costs ~5–10 min of wall-clock you can't get
    back; a multi-headed run masks every reason but the dominant one.
  - **When a gate is genuinely required, minimize it.** Start at the smallest
    informative N and escalate only when the result forces it (a borderline mixed
    rate, or a rate-promotion verdict where the statistic itself is the claim).
    Never conclude a *rate* from N=1; never default to a large N every iteration.
  - `rolling-restart-core-stability`'s `doneWhen` is the sealed variance-aware
    metric in [`docs/convergence-donewhen-metric.md`](../../docs/convergence-donewhen-metric.md)
    (Wilson 95% lower-bound passRate ≥ `T(N_nodes)` + a hard SAFE floor), NOT
    "3 consecutive PASS". Its convergence axis is met *by construction* at the
    hardware floor, and the passRate baseline is **sealed once** — so a routine
    change costs ZERO gate-hours and is validated deterministically; you spend one
    N≥15 gate only to deliberately certify a latency-tail improvement against the
    sealed bar (and re-seal `T` upward only if the new Wilson lower bound clears
    the old one).
  BEFORE queuing any gate, run `npm run analyze:latent-blockers`: the gate is a
  serial max-frequency oracle that shows only the single dominant reason and masks
  the rest, so do not spend a gate to learn the next layer the corpus already
  reveals.
- **Use the analyzers, not raw-log grep.** Read
  [`test/distributed/harness/README.md`](../../test/distributed/harness/README.md) first,
  then `npm run analyze:distributed-failure -- --report <r>` /
  `analyze:causal-model` / `analyze:topology-convergence` /
  `analyze:priority-recovery-residuals`. For the cross-gate picture — which
  blockers are MASKED behind today's dominant reason, the peel-order, and emerging
  candidates — run `npm run analyze:latent-blockers` over the whole report corpus
  (the deterministic backbone of the latent-blocker census;
  [`solve/epics/latent-convergence-blocker-census.md`](../../solve/epics/latent-convergence-blocker-census.md)).
  Open raw ndjson only after an analyzer has named the owner/edge.
- **Distributed blockers are tracked one invariant at a time.** Follow
  [`solve/specs/membership-lifecycle-placement-hard-cutover/closure-grammar.md`](../../solve/specs/membership-lifecycle-placement-hard-cutover/closure-grammar.md):
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
