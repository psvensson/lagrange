# Operational Ground Truth (distributed work — don't get fooled)

This file is the **single canonical home** for the distributed-work traps.
The [`owner router`](../../docs/steering/router.md) routes distributed-harness
and convergence work here rather than restating the traps, and external memory
must link to this file rather than duplicate them (R25 in
[`rules.md`](../../docs/steering/rules.md)).

Use these checks for the actual distributed claim being investigated. Separate
bounded repair completion, representative public WASI service success, and full
stable-core/release acceptance as defined in
[`release-gate.md`](../guidelines/release-gate.md). A different scenario blocker
can remain open while a sound causal repair closes; preserve both verdicts.

Report safety, recovery progress after finite failures clear, and resource
behavior separately. Name the real entry path, owners, configuration, source,
dependencies, and physical fault domains. Source traces and contract hypotheses
are useful inputs, but must be labeled separately from measured execution.


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
- **Deterministic-first; a statistical gate is a last resort.** Start a
  convergence repair with a targeted or fault-injected reproduction at the real
  owner seam, built before the fix and retained as regression proof. Use
  deterministic execution for mechanisms and orderings it can faithfully
  represent (see the reproduced-before-fix rule in
  [`closure-grammar.md`](../../solve/specs/membership-lifecycle-placement-hard-cutover/closure-grammar.md)
  and the substrate map in
  [`docs/deterministic-directed-testing-plan.md`](../../docs/deterministic-directed-testing-plan.md)).
  A red-on-revert witness must fail at the intended behavioral assertion, not
  setup or import. A passing live sample alone does not prove the repair's cause.
  Necessary native, physical-fault, and real public-service evidence remain
  separate proof layers; the statistical restriction below does not prohibit
  them. If a behavior cannot be represented faithfully in-process, preserve the
  actual failing witness and record that ceiling. If you reach
  for `scripts/rolling-restart-stat-gate.sh`, first write down the
  exact question and why no in-process test can answer it; if you can't, you are
  not ready for the live run. The runnable preflight is
  `npm run gate:preflight -- --question "<exact question>" --why-not-deterministic "<one-liner>"`
  — it refuses without both answers, runs the `analyze:latent-blockers` census,
  and prints the N-calibration table plus the three allowed statistical-run categories.
  - **Run a statistical gate only when the claim needs statistical evidence**
    and no deterministic test can stand in. Three named cases qualify: (1) a true
    pass-*rate* / variance question; (2) a one-time milestone certification of a
    landed, already-DT-proven improvement against a sealed bar; (3) **hot
    failure-path aggregate A/B validation** — a change to a hot failure-handling
    path ships only with a controlled live A/B of N≥2 runs fixed vs N≥2 runs
    reverted; this IS an irreducibly-statistical claim, so it is an allowed live-run use, and
    the `analyze:latent-blockers` pre-step below applies to it like any other
    statistical run. Mechanism, classification, recovery ordering, and
    red-on-revert questions belong in-process when faithfully representable;
    a statistical sample does not establish those mechanisms.
  - **A live statistical run is never the iteration loop.** Do not run one to "see if it helped", to
    discover the next blocker, or to re-confirm a mechanism a DT already shows.
    Retain all measured failures; a run with several causes can expose only the
    first blocker while masking the target path. Use existing artifacts and
    a discriminating witness before spending another broad run.
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
    A mechanistic "does it engage?" question has no statistical N: use a
    deterministic engagement witness at the real seam where possible, plus the
    native or physical evidence required by the actual claim. For genuinely
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
    mechanism repair does not require a new statistical campaign solely to
    repeat that baseline. Required native, physical, and release evidence still
    applies. Spend the N≥15 certification campaign when deliberately certifying
    a latency-tail improvement against the sealed bar, and re-seal `T` upward
    only if the new Wilson lower bound clears the old one. The current v2
    `scenario-harness` probe reports legacy `sealed-bar` and `distance` metrics
    as non-measuring; that is a tooling gap to route, never permission to replace
    the sealed metric with a weaker streak or claim certification.
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
- **Bound the causal repair and check coupled obligations together.** Record
  the first violated invariant before changing code. Membership-lifecycle work
  uses its existing
  [`closure grammar`](../../solve/specs/membership-lifecycle-placement-hard-cutover/closure-grammar.md)
  and per-file ledger; ordinary work uses its existing Quest finding. Do not
  create another ledger. When adjacent fixes alternate which invariant fails,
  reassess the shared assumption and interaction with the current author,
  reviewer, and integration owner. Relevant models can expose a coupling, but a
  model proves its stated assumptions, not every production path. Choose a
  bounded interaction repair when evidence warrants it; do not force an
  architecture stage or retired `reflect` command merely because blockers moved.
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
  When a mechanism is partly wired, compare completing its existing path with
  safely excluding the capability from the supported envelope. Exclusion must
  cover public, internal, background, and restart reachability, refusal before
  admission, and retained obligations. A bypass around the same decision owner
  or a new test-only product mode is not a valid shortcut.
- **Check known causes before paying for another broad run:**
  1. **Trace a previously unexercised service path.** Before its first broad
     debug run, trace the bounded request-to-result chain through real entry
     points, factories, registries, subscriptions, and durable effects. Name
     missing links and separate observed wiring from assumptions. Establish
     enough engagement to make the intended run informative; this does not
     require an inventory of unrelated architecture.
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
- **Repeated refutation prompts a causal reassessment.** When the same
  assumption survives several unsuccessful variants, use existing records to
  identify what was actually refuted before trying another variant. Consult
  relevant code history, comparable systems, or primary research when they can
  resolve the uncertainty. Record the useful result in the existing finding or
  design note. No fixed number of external sources, new research report, or
  larger architecture task is required by a failure count. Retain valid
  independently complete repairs while choosing the next discriminating action.
- **Retain failures and name the execution owner.** Product, fixture/harness,
  verifier, and execution-unavailable outcomes are distinct. Keep the first
  failure, the target-engagement verdict, and the outer scenario result. Remote
  runs follow [`home-lab.md`](../../docs/development/home-lab.md): record actual
  request, queue/admission, execution, terminal artifact, and cleanup stages as
  exposed by the service. Waiting requires an actual request, result source,
  and continuation owner or supported resumption mechanism; ending a turn does
  not establish background polling.
- **Independently verify after implementing.** After a change, have a separate
  subagent independently verify it before relying on or reporting it. Arm the
  verifier with the attack checklist matching the change category from
  [`verification-templates/INDEX.md`](../../docs/development/verification-templates/INDEX.md).
