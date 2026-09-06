# Operational Ground Truth (distributed work — don't get fooled)

This file is the **single canonical home** for the distributed-work traps.
The [`owner router`](../../docs/steering/router.md) routes distributed-harness
and convergence work here rather than restating the traps, and external memory
must link to this file rather than duplicate them (R25 in
[`rules.md`](../../docs/steering/rules.md)).

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
- **Cite immutable artifacts, not mutable active directories.** Findings that
  cite live/demo logs by `file:line` rot silently when the runner's fixed
  active directory (e.g. `data/examples/service-data-affinity-demo/`) is wiped
  by the next run — and bounded archives age out. Every finding that cites a
  live artifact must name an immutable run identity (the timestamped archive
  path, a per-run report dir, or a copied excerpt under `solve/changes/<quest>/`);
  if the runner only has a mutable active dir, archive it (or copy the cited
  slices) before the next run and cite that. Subagents reading a shared active
  dir must first confirm the artifact's mtime/run-window matches the run they
  were asked about.
- **Deterministic-first; a live statistical run is a LAST RESORT ONLY.** The PRIMARY evidence
  for every convergence fix is a deterministic in-process reproduction — a
  targeted or fault-injected repro at the layer where the invariant is produced,
  red-on-revert, built BEFORE changing code and kept as the validating proof
  afterward (see the reproduced-before-fix rule in
  [`closure-grammar.md`](../../solve/specs/membership-lifecycle-placement-hard-cutover/closure-grammar.md)
  and the substrate map in
  [`docs/deterministic-directed-testing-plan.md`](../../docs/deterministic-directed-testing-plan.md)).
  A fix is "proven" when a deterministic test demonstrates the mechanism and goes
  red on revert — NOT when a live statistical run happens to pass. If you reach
  for `scripts/rolling-restart-stat-gate.sh`, first write down the
  exact question and why no in-process test can answer it; if you can't, you are
  not ready for the live run. The runnable preflight is
  `npm run gate:preflight -- --question "<exact question>" --why-not-deterministic "<one-liner>"`
  — it refuses without both answers, runs the `analyze:latent-blockers` census,
  and prints the N-calibration table plus the three allowed statistical-run categories.
  - **Run the live harness ONLY when the claim is irreducibly statistical** and no
    deterministic test can stand in. Three named cases qualify: (1) a true
    pass-*rate* / variance question; (2) a one-time milestone certification of a
    landed, already-DT-proven improvement against a sealed bar; (3) **hot
    failure-path aggregate A/B validation** — a change to a hot failure-handling
    path ships only with a controlled live A/B of N≥2 runs fixed vs N≥2 runs
    reverted; this IS an irreducibly-statistical claim, so it is an allowed live-run use, and
    the `analyze:latent-blockers` pre-step below applies to it like any other
    live run. Mechanism, classification, recovery, and red-on-revert are
    deterministic questions — answer them in-process, never with a statistical run.
  - **A live statistical run is never the iteration loop.** Do not run one to "see if it helped", to
    discover the next blocker, or to re-confirm a mechanism a DT already shows.
    Each run is non-deterministic and costs ~5–10 min of wall-clock you can't get
    back; a multi-headed run masks every reason but the dominant one.
  - **Target-not-reached is non-discriminating.** A measuring product run that
    fails before the target precondition/path/observable engages keeps its outer
    `FAIL` and any valid scenario metric or regression, but neither confirms nor
    refutes the target theory. Record the target `not_reached` / `needs-rerun`,
    ingest and route the newly dominant blocker, and do not rerun unchanged just
    to fish for engagement. If the target engages and a later phase fails, retain
    the immutable target-phase witness while preserving and routing the outer
    `FAIL`. Only a broken or disconnected harness is globally invalid and
    non-measuring. An `explained` regression-resolution finding may discharge
    restore ordering; it must cite the immutable failure and cannot rewrite the
    report verdict, metric, or `doneWhen`.
  - **When a live statistical run is genuinely required, minimize it.** Start at the smallest
    informative N and escalate only when the result forces it (a borderline mixed
    rate, or a rate-promotion verdict where the statistic itself is the claim).
    Never conclude a *rate* from N=1; never default to a large N every iteration.
    A mechanistic "does it engage?" question is not statistical and has no live
    N: answer it with one deterministic engagement witness. For genuinely
    statistical questions, calibrate N to the claim:
    | Question | N |
    | --- | --- |
    | Rate or variance verdict | N≥8 |
    | Sealed-bar certification | N≥15 (the one-time certification in the sealed-metric bullet below) |
  - `rolling-restart-core-stability`'s `doneWhen` is the sealed variance-aware
    metric in [`docs/convergence-donewhen-metric.md`](../../docs/convergence-donewhen-metric.md)
    (Wilson 95% lower-bound passRate ≥ `T(N_nodes)` + a hard SAFE floor), NOT
    "3 consecutive PASS". Its convergence axis is met *by construction* at the
    hardware floor, and the passRate baseline is **sealed once** — so a routine
    change costs ZERO live-run hours and is validated deterministically; you spend one
    N≥15 run only to deliberately certify a latency-tail improvement against the
    sealed bar (and re-seal `T` upward only if the new Wilson lower bound clears
    the old one).
  BEFORE queuing any live statistical run, run `npm run analyze:latent-blockers`:
  that run is a
  serial max-frequency oracle that shows only the single dominant reason and masks
  the rest, so do not spend a live run to learn the next layer the corpus already
  reveals.
- **Use the analyzers, not raw-log grep.** Read
  [`test/distributed/harness/README.md`](../../test/distributed/harness/README.md) first,
  then `npm run analyze:distributed-failure -- --report <r>` /
  `analyze:causal-model` / `analyze:topology-convergence` /
  `analyze:priority-recovery-residuals`. For the cross-run picture — which
  blockers are MASKED behind today's dominant reason, the peel-order, and emerging
  candidates — run `npm run analyze:latent-blockers` over the whole report corpus
  (the deterministic backbone of the latent-blocker census;
  [`solve/epics/latent-convergence-blocker-census.md`](../../solve/epics/latent-convergence-blocker-census.md)).
  Open raw ndjson only after an analyzer has named the owner/edge.
- **Cross-owner seams have owned contracts — argue against them first.**
  Convergence bugs cluster at interactions between individually-correct owners
  (R02 in [`rules.md`](../../docs/steering/rules.md)). Before
  changing any hold, fence, admission lane, or cure classification, read its
  decision table under `docs/specs/decision-tables/` and the matching TLC
  model family in [`models/CL-INDEX.md`](../../models/CL-INDEX.md); an engaged
  hold, gate, or fence must always have a reachable release path.
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
- **Three hard triggers the research-first rule MUST fire on (learned the expensive
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
     the theory findings in `solve/quests/<id>/log.ndjson` (the v1 ledger was folded into `solve/quests/theory-ledger/`) and the
     [`closure-ledger.md`](../../solve/specs/membership-lifecycle-placement-hard-cutover/closure-ledger.md)
     index FIRST. The recorded theory/closure usually names the owner, the intended
     mechanism, and the refuted fixes; a bespoke patch written without that lookup
     re-derives (or contradicts) settled work. The fix write-up must state what it
     reuses or finishes, or why nothing recorded applies.
  3. **Source fix whose theory depends on a live precondition → precondition
     witness BEFORE commit.** A green DT on an injected seam proves the test,
     not the fix: two wrong legs (fba0b477/96a0917f, a9344058/066bf78d) each
     shipped on a green DT whose precondition never occurs on the live path and
     were reverted after costly live runs. Before committing such a fix, record
     an engagement/precondition witness — `analyze:fix-engagement`,
     `analyze:precondition-recurrence`, a red-on-revert directed test through
     the REAL seam, or a code trace proving the live path reaches the change
     (see solver-quests.md "Evidence And Change References").
- **A SERIES OF REFUTALS is a signal to widen research, not to invent a cleverer
  variant.** When several candidate fixes have each been adversarially killed for a
  *different* reason (the whack-a-mole / rotating-dominant-residual / coupled-invariant
  signature above), the likeliest truth is that the whole fix *class* is wrong — and the
  phenomenon is almost always one the field (and often this repo) has already named and
  solved. Before committing effort to the next bespoke variant, STOP and triangulate prior
  art across THREE sources, in this order, capturing each in the change dir as a cited
  report:
  1. **This codebase's own history** — grep `git log`, the theory findings in `solve/quests/*/log.ndjson`,
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
  the research synthesis note of quest formation-ledger-self-move-blocks-cluster-ops (archived in the solve-v1 evidence bundle, see `solve/epics/solve-v2/solve-v1-archive.manifest.json`).
- **Independently verify after implementing.** After a change, have a separate
  subagent independently verify it before relying on or reporting it. Arm the
  verifier with the attack checklist matching the change category from
  [`verification-templates/INDEX.md`](../../docs/development/verification-templates/INDEX.md).
