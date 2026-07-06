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
- **Two hard triggers the research-first rule MUST fire on (learned the expensive
  way — the affinity demo paid one 10-minute live run per half-wired link it could
  have found in a single audit):**
  1. **Never-exercised path → full-chain engagement audit UP FRONT.** Before the
     first live/iterative debug run of a path that has never executed end-to-end in
     a real cluster (a first demo, a first cutover, a first engagement of a
     "designed" flow), trace the ENTIRE intended chain in one pass — every
     setter/registry/projection/subscription the design mentions — and list which
     links have zero production callers. Fix or scope them BEFORE the first run.
     One code-trace pass costs minutes; discovering the same links serially through
     live-run failures costs a run each (the demo found FOUR on one path: an
     unassembled handler map, a reconcile never triggered on change, a
     field-name contract break, and an unwired state projection).
  2. **Failure matches a known class → ledger lookup BEFORE the fix.** When a live
     failure's signature matches a recorded class — `budget_exceeded` starvation,
     join-exits-instead-of-degrading, a gate rejecting on a stale view while fresher
     evidence exists, formation-vs-steady-state circularity — grep
     [`solve/theory-ledger.md`](../../solve/theory-ledger.md) and the
     [`closure-ledger.md`](../../solve/specs/membership-lifecycle-placement-hard-cutover/closure-ledger.md)
     index FIRST. The recorded theory/closure usually names the owner, the intended
     mechanism, and the refuted fixes; a bespoke patch written without that lookup
     re-derives (or contradicts) settled work. The fix write-up must state what it
     reuses or finishes, or why nothing recorded applies.
- **A SERIES OF REFUTALS is a signal to widen research, not to invent a cleverer
  variant.** When several candidate fixes have each been adversarially killed for a
  *different* reason (the whack-a-mole / rotating-dominant-residual / coupled-invariant
  signature above), the likeliest truth is that the whole fix *class* is wrong — and the
  phenomenon is almost always one the field (and often this repo) has already named and
  solved. Before committing effort to the next bespoke variant, STOP and triangulate prior
  art across THREE sources, in this order, capturing each in the change dir as a cited
  report:
  1. **This codebase's own history** — grep `git log`, [`solve/theory-ledger.md`](../../solve/theory-ledger.md),
     the per-file closure ledger, and external memory for a prior fix to the same *class*
     (not just the same symptom). Parallel machinery gets built here by accident; a shipped
     TLA+-modeled fix for the identical oscillation shape may already exist.
  2. **Comparable production systems** — how do CockroachDB, TiKV/PD, etcd/raft, Consul,
     KRaft, Kubernetes solve this class? The canonical mechanism usually has a name (a
     ReadIndex/lease freshness read, a self-revert/undo-simulation deadband, Pre-Vote,
     learner-first membership, an HPA stabilization window). Adopt the named wheel instead
     of hand-rolling a worse one.
  3. **Theory / papers** — reduce the bug to its canonical form (e.g. relay input + lagging
     sensor + no-deadband discrete decision = a relay-feedback limit cycle) so you can see
     the *independent cuts* that each break it, and pick the cut with the best precedent —
     not the first patch that moves a metric.
  This pass is cheap relative to one live gate run and routinely reveals that the surviving
  bespoke path (a) reinvents a wheel the repo lacks raw materials for, while a cheaper,
  better-precedented cut already exists. Fold the result into the coupled-invariant
  step-back reflection above; the exemplar is
  [`solve/changes/formation-ledger-self-move-blocks-cluster-ops/research-SYNTHESIS.md`](../../solve/changes/formation-ledger-self-move-blocks-cluster-ops/research-SYNTHESIS.md).
- **Independently verify after implementing.** After a change, have a separate
  subagent independently verify it before relying on or reporting it.
