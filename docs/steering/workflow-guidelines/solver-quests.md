---
scope: governance
status: canonical
always_load: false
source_of_truth: self
compiled_pack: docs/steering/llm/governance.md
parent_index: ../workflow-guidelines/INDEX.md
last_reviewed: 2026-07-24
---

> **Canonical source.** The Solver is the repository work system. Its unit of
> work is a **Quest**: one sealed goal, one append-only event log, measured
> attempts, durable findings, Quest-native theories, and a terminal state. Runbook:
> [`../../../docs/development/solver-runbook.md`](../../../docs/development/solver-runbook.md).

# Quest Workflow

## Operating Contract

Use a Quest for non-trivial problem solving and feature implementation. The
threshold: author a Quest when the work will likely need **more than one
measured attempt with evidence**, or when it **changes an owner-boundary
contract** (recorded under `architecture/` or in an active spec — changing the
contract, not merely editing owner-owned code). Below that threshold — a
single-sitting fix, doc edit, or mechanical change with an obvious proof — do
the work directly and commit it (core.md "Default Posture: Commit On
Completion"); the Solver records nothing. A Quest is also required up front for
live/distributed work, cross-session investigation, or competing interventions,
because those shapes need durable evidence even when the first patch succeeds.

Direct work is progressive, not a loophole. If it produces a failed measurement,
expands beyond the original bounded owner scope, or yields a durable finding that
must survive handoff, stop before a second evidence-bearing intervention and
author a Quest. Link the earlier evidence as provenance; do not backdate it as a
Quest attempt. A one-patch deterministic fix remains direct even when the code is
important, provided it does not change an owner-boundary contract.

A Quest must:

1. declare a single sealed `doneWhen` predicate up front;
2. define one or more independent `frontiers[]`;
3. measure progress with lower-is-better probe metrics;
4. record every attempt through the Solver event log;
5. accumulate version 2 source attempts into one exact landing candidate; review
   it only at an explicit durability boundary, then approve the complete aggregate
   scope before terminal handoff (legacy version 1 attempts keep their old rules);
6. close only through a Solver terminal state;
7. after audit passes, commit every Quest-scoped change (the Solver never
   pushes; see "Regular Commit (No Push)" below).

Do not move goalposts in place. If the goal is wrong, record the finding and
author a new Quest with the corrected `doneWhen`. (Sharpening a frontier metric
within the same sealed `doneWhen` is not moving goalposts; see "Gradient
refinement of the sealed metric" below.)

Terms used below — Quest, frontier, attempt, finding, theory, `doneWhen`, park,
owner, sealed — are defined in core.md's canonical "Vocabulary" glossary and in
the "User-Facing Vocabulary" section at the end of this file. For the full command
surface beyond the primary workflow commands shown here — including `frontier`,
`trace`, `promote-finding`, `ingest-evidence`, and the supervised `step` /
`step --commit` / `step --abort` phases — run `npm run commands` or invoke
`node scripts/solve.js` with no arguments to list the subcommands.

### Primary operator surface

The normal Quest workflow has three verbs:

1. `solve start --id <id>` runs doctor, optionally creates a linked draft when
   authoring flags are present, lints it, and returns the stable structured next
   action. It is read-only for an existing Quest and never seals or begins work.
2. `solve continue --id <id>` executes only structured `begin-step`,
   `commit-step`, or replacement equivalents. Here `commit-step` means record
   the measured attempt in the event log; it does not create a Git commit. An
   attempt-record action requires exactly one explicit `--changeRef` or
   `--auto-diff` plus `--summary`. It MUST NOT parse or execute the
   human-rendered action value, and it stops on every judgment, verification,
   checkpoint, audit-repair, or terminal action.
3. `solve land --id <id> --verifier <id> --verdict approve|reject
   --fingerprint <sha256>` validates the verdict against current terminal bytes
   and constructs the receipt server-side. Rejection records the fail-closed
   candidate verdict and never commits. Approval records the aggregate receipt,
   applies the full audit and scope-safe handoff, commits when eligible, and
   never pushes.

The stable `next` projection carries both the legacy display `type`/`value` and
machine `code`/`payload`. Automation MUST dispatch only on `code` and validated
payload. `new`, `lint`, `next`, `step`, `finding`, `audit`, `checkpoint`, and
`handoff` remain component commands for diagnostics and exceptional workflows;
their availability does not add required routine steps.

## Quest Anatomy

A Quest lives at `solve/quests/<id>.json` and is authored with:

```sh
node scripts/solve.js new --id <id> --statement "<sealed result>" \
  --spec-ref <spec-or-plan-reference>
node scripts/solve.js lint --id <id>
```

The file declares:

- `authoringContractVersion`: absent means legacy; new drafts use version 1.
- `class`: `"product"` (default) or `"process"`. Product goals must be MEASURED
  against a real artifact probe; process goals are scaffolding/decision records
  and may legitimately close on an oracle. This drives report closure labeling,
  the audit closure-strength warning, and the portfolio meta ratio.
- `doneWhen`: the binary victory condition. This is artifact-bound and sealed.
- `frontiers[]`: independent attack surfaces. Each frontier has a priority and
  a metric probe.
- `constraints[]`: optional hard limits the agent must preserve. In version 1,
  each entry has non-empty `id` and `statement` strings.
- `links`: planning references authored with `--plan-doc`, `--parent-quest`,
  `--roadmap-row`, `--spec-ref`, and repeatable `--closes-cl` flags.

Keep `metric` and `doneWhen` separate. A metric is a gradient; only `doneWhen`
can close the Quest.

A Quest statement is a sealed **result predicate**, not a causal theory. Do
not embed a diagnosed ROOT narrative in the statement: put causal roots,
suspected mechanisms, and next-leg rationale in findings, `planDoc`, or
Quest-native theory records, where they stay falsifiable. When a root is
falsified mid-Quest, record the superseding finding — never edit the sealed
statement or `doneWhen`. (Precedent: the
`formation-ledger-self-move-blocks-cluster-ops` statement sealed a ROOT that
run-artifact forensics falsified twice while its mechanism-agnostic `doneWhen`
stayed valid; the sealed root biased two wrong legs.)

Product quests must carry at least one planning link at creation: `planDoc`
for the epic/spec page they advance, `parentQuest` for quest lineage, or
`closesCL`/`specRef`/`roadmapRow` where applicable. An unlinked product quest
is invisible to `trace`/`frontier` and is a defect to backfill before handoff.

### Successor Quests (park-and-pivot lineage)

When a quest is drafted as the successor of a parked/exhausted one, the same
statement-is-a-result-predicate rule applies with a specific division of
content — do not carry the lineage's narrative into the new seal:

- **Statement** = the sealed result predicate + oracle only.
- **Dead levers** (the lineage's vetted-dead list) = day-0 `rulesOut` findings
  on the new quest, not statement prose. Use
  `solve.js new --inherit-rulesout-from <parentQuest>` to copy them from the
  parent's log; they then render in the report/ladder and replay in every rung
  dossier, and the draft-time retread check dedups against them.
- **Hypotheses** = theory records (falsifiable, supersedable), never fields of
  the sealed file.
- **Prior art / evidence trail** = `links` (`parentQuest`, `planDoc`), where
  `trace` can join it.

`new` stamps `links.draftedAtCommit` and prints retread warnings when the
statement cites files or CL ids touched by a recent `revert(...)` commit —
treat such a warning as a mandatory confirm-not-the-reverted-lever check
before the first rung. Because a successor is sealed against the PARENT's
evidence, the seal-freshness advisory will demand a `repro-on-head` finding
(`solve.js finding --kind repro-on-head ...`) once `src/` drifts: reproduce
the sealed symptom on current HEAD before spending any disambiguation rung —
a symptom already fixed in the meantime exhausts the quest immediately.

Drafting is not sealing. The first `step`, `attempt`, or `run` validates the
versioned authoring contract before it appends the declaration. Version 1 seals
the authoring version, statement, class, constraints, `doneWhen`, frontier
identities, and frontier metrics. A lint failure leaves no declaration or
pending state. `new --force` cannot overwrite any Quest with log history;
author a successor instead. `solve lint --all` is the read-only legacy census
and never rewrites historical Quest files, logs, declarations, or outcomes.
The portfolio projects a saved, non-terminal Quest with no `quest-declared`
event as `draft`, not active open work. Drafts remain visible and separately
tallied, but do not enter the active open-work ratio or downstream frontier
views. Declaration advances the portfolio-local stage to `active`; a solved or
exhausted projection is `terminal`. These stages do not add or rewrite a
store-level Quest status.

### Closure Fidelity (live-visible classes)

Within MEASURED closures there are fidelity tiers: deterministic guard
reports, live gate/demo reports, and model-checker reports all land in
`test-output/reports/`. A green deterministic guard with red-on-revert proof
binds the test to the CODE; it does not bind the fix to the LIVE mechanism —
affinity-demo runs 25 and 26 each refuted a quest whose guard evidence was
green (the fixture modeled a healthier seam than reality). Therefore, when
authoring a quest whose defect class is visible in a live surface (demo,
gate, operator-facing behavior), the statement MUST name the live binding
observable ("the demo's CREATE TABLE succeeds", "run-N shows zero X"), and
the closure claim must record a live-validation finding naming which run and
which observable — before downstream work relies on the closure. The audit
surfaces a closure-fidelity warning when a product quest closes on
non-`live` evidence; answer it in the closing finding rather than ignoring
it.

## Closure Of Cutover Vs Building-Block Quests

Two legitimate Quest shapes have different closure bars; do not conflate them.

- A **cutover Quest** — one whose sealed `doneWhen` is "X is the authoritative owner"
  or "the old path is retired" — closes SOLVED only on evidence the new mechanism is
  ENGAGED and authoritative in a real run (an engagement proof: `analyze:fix-engagement`,
  a red-on-revert directed test, or a trace), not merely that its code or tests exist. A
  flag that leaves the old path live while the new mechanism sits dormant is an
  unfinished cutover, not a closed Quest (see doctrine/owner-boundaries.md §1).
- A **building-block Quest** — landing a safe mechanism validated behind a
  temporary lever — closes legitimately when its OWN sealed `doneWhen` is met
  (e.g. "the lever is SAFE and engages under a flag-on repro"); the cutover bar
  above must not block it. But the validation flag is a within-session scaffold
  only: before the session that landed it ends, the lever is either promoted
  (baked in unconditionally, flag deleted) or removed with its functionality —
  NO flag survives the session (see the feature-flag lifecycle in roadmap.md).
  The Quest may close on its own `doneWhen`; the flag may not outlive the
  session.

## Metric Validity And Invalid Samples

A metric is only meaningful when it was read from a run that actually measured
something. A scenario-harness run whose verdict is `BLOCK_EVIDENCE_INCOMPLETE`
(reason `execution_incomplete_or_metrics_missing`) did not validate anything, so
the probe reports `metric: null` with `invalidSample: true` rather than a
misleading `0`. An invalid sample is an honest no-measurement: it never counts as
progress, never satisfies `doneWhen`, and breaks the consecutive-pass streak.
Crucially, it does **not** climb the strategy ladder. Climbing a rung is a
response to a measured stall — a trustworthy observation that the current
strategy failed — so a sample the harness could not measure is not evidence of
anything and must not advance the ladder toward an `exhausted` park it never
earned. Instead the rung is **held and retried**, and an advisory diagnostic
finding is recorded pointing at the harness. The retry is bounded by
`CANNOT_MEASURE_RETRY_BUDGET`: once that many consecutive samples on a frontier
fail to measure, the frontier parks as `cannot_measure` (a harness verdict),
never as `exhausted`. A single measuring sample resets the consecutive-failure
run. Never treat a blocked or incomplete run as a metric floor.

When a frontier has already parked as `cannot_measure` (its samples never
measured), the verdict rests on untrustworthy data. Reopen it with
`node scripts/solve.js reopen --id <quest> --frontier <id> --reason "..."`. The
reopen is evidence-gated: it is refused unless at least one contributing attempt
re-classifies as a non-measuring sample (so an honest park is never reopened),
it leaves `doneWhen` and the frontier metric untouched (no goalpost movement),
keeps the park event in the append-only log, preserves `parkedCount` so the
scheduler still de-prioritizes a chronic parker, and returns the frontier to the
first rung for fresh, honestly-measured attempts.

A park is further classified by its cause. An `exhausted` park had at least one
honestly-measured sample but the metric never moved — no honest move remains. A
`cannot_measure` park had only non-measuring samples — the harness itself never
produced a valid measurement, so the fix is the measurement infrastructure, not
the solution space. `status`, `health`, `report`, and `portfolio` show the
distinction. Reopens are bounded and recorded: the frontier tracks `reopenCount`,
and a second reopen is refused while nothing has changed since the last reopen —
re-running an unchanged harness only reproduces the same non-measuring loop. Fix
the harness (or change the attempt evidence) before reopening again, so reopen and
park can never oscillate forever.

A measuring product `FAIL` is not an invalid sample merely because it happened
before the theory's target phase engaged. Preserve the outer verdict and metric,
record the target as `not_reached` / `needs-rerun`, and route the newly dominant
blocker; the run neither confirms nor refutes that target theory. When the target
does engage before a later product failure, retain its immutable phase witness
for comparison while preserving and routing the outer `FAIL`. Only a genuinely
broken or disconnected harness is globally invalid/non-measuring. A later
`regression-resolution` finding with resolution `explained` may discharge the
restore sequencing obligation, but it never rewrites the report verdict, metric,
or `doneWhen`; it must cite the immutable failure and route the actual defect.
See operational-ground-truth.md "Target-not-reached is non-discriminating."

## Scenario Runner Location

A Quest's scenario runner (the script that calls `runGuardTestScenarios` from
`scripts/checks/guard-test-scenario-runner.js`) lives under `scripts/` — author
new ones in `scripts/checks/`. Never place a runner under `test/`: knip's entry
patterns cover `scripts/**` but not `test/**` runners, so a `test/`-located
runner is flagged as an unused file and blocks the push gate. Do not copy the
runner path from an old verification receipt; receipts are history, not policy.

## Current Blocker And Diagnostic Movement

`status`, `health`, and `report` project a **Current Blocker** from the latest
ingested evidence for the active frontier. The card names the owner, boundary,
dominant reason, latest evidence artifact, selected theory, stale-theory reason
when present, and the next move the Solver expects. Treat this as the active
failure surface. Older blockers remain useful only as findings or "no longer
current" context.

Every evidence ingestion classifies blocker movement:

- `same`: the same owner/boundary/reason remains.
- `moved_owner`: the blocker crossed to a different owner.
- `moved_boundary`: the owner stayed stable but the boundary changed.
- `narrowed`: the owner/boundary stayed stable while reason, root-cause class,
  or mechanism changed.
- `solved`: the evidence satisfies `doneWhen`.
- `invalid`: the latest sample did not measure a valid metric.
- `unknown`: evidence changed, but not along a recognized owner path.

The Current Blocker card is built ONLY from structured evidence-ingestion
fields and selected theories — `status` does not parse finding prose. A
resume-critical result (a newly pinned binding head, a decided next move) must
therefore leave a structured resume surface: ingest evidence carrying
owner/boundary/reason/mechanism/nextAction, or select/record a frontier theory
whose owner path names the current head. A binding head recorded only inside a
prose finding claim leaves the card empty (`movement: no_evidence`) and forces
the next session to reconstruct state from raw log archaeology.

An ingestion records one structured `evidence-ingested` event. That event is the
durable receipt for the artifact, metric, verdict, owner, boundary, and blocker
movement; ingestion does not mirror it into a generated finding. Record a
separate explicit finding only when an operator or agent learned a durable
conclusion that should be replayed independently of the evidence fields.

The movement classification is recorded on evidence, attempts, and theory
results as `blockerMovement` / `diagnosticMovement`. It gives credit for useful
diagnostic progress without pretending that the Quest moved closer to closure:
metric movement remains the only product progress, and `doneWhen` remains the
only closure predicate.

A theory result records two outcomes:

- `scenarioOutcome`: what happened to the measured scenario (`improved`,
  `failed`, `invalid`, or `done`).
- `theoryOutcome`: what the attempt taught about the theory (`supported`,
  `partial`, `falsified`, or `needs-rerun`).

When a metric does not improve but the blocker moves owner, boundary, or
mechanism, the selected theory may be recorded as `supported` with
`theoryOutcome=partial`. This keeps the theory selectable as useful diagnostic
learning while making the report clear that the scenario itself is still not
solved.

Selected frontier theories are stale when later evidence changes the current
blocker after selection and no theory result has recorded that learning, or when
the selected theory's owner/boundary no longer matches the latest evidence.
`health`, supervised `step`, and autonomous preflight then stop widened work with
the next action: record the old theory result or select a fresh frontier theory.
Do not keep patching under a theory whose owner path is no longer current.

`health` and `report` also project **Scope Pressure** from the Quest's recorded
`diff:<path>` attempt artifacts. Scope pressure flags broad owner areas, large
diff stacks, mixed runtime/workflow changes, and mixed runtime/harness changes.
The diagnostic retains every changed path and raw byte count, while terminal
admission excludes only the fixed allowlist of deterministic generated boards
and packed steering projections. The authored inputs for those generated
projections remain counted and their freshness gates still fail closed;
mechanical output size must not force a fake owner split.
Scope pressure is advisory rather than terminal, but a high-severity signal
should usually produce a finding, a narrower theory, or a split Quest before
more code is changed.

## Regular Commit (No Push)

A Quest must not accumulate an unrecoverable dirty tree, but recording an
attempt or finding MUST NOT commit as a side effect. Routine accepted attempts
stay uncheckpointed. At a real durability boundary, review the one current
landing candidate and persist it explicitly with a named reason:

```sh
node scripts/solve.js checkpoint --id <quest> \
  --reason <handoff|risky-tree|long-running|milestone>
```

The candidate is the current Git delta from one common recorded base across the
sorted union of every uncheckpointed version 2 attempt path. Checkpoint refuses
partial coverage, byte/base drift, unreceipted hitchhikers, or a missing exact
candidate approval, then records the durability reason in the commit body and
commits only Quest scope. Terminal handoff separately requires full aggregate
composition approval and audit. Version 1 receipts retain their historical
per-attempt checkpoint behavior.

The Solver NEVER pushes: no subcommand, loop, or handoff runs `git push`
(`autoCommitQuest` and `handoff` are commit-only). Pushing is a separate,
outward-facing action — for Quest and ad-hoc work alike, a never-before-authorized
push remains an Authorization stop-trigger and MUST NOT be performed
automatically; commit, do not push, unless the user has durably authorized
pushing. For the always-load commit-on-completion default — which also covers
ad-hoc, non-Quest work (finished work is committed, not left pending) — see
core.md "Default Posture: Commit On Completion".

## Convergence Guards

A narrowing Quest can shuffle the same blocker between owners forever and call it
progress. The guards below keep the loop converging instead of oscillating. Each
detector is a pure read-model over the append-only log; the policy that turns a
detection into a gate lives at the call site behind the master
`CONVERGENCE_GUARDS` policy map (`scripts/solve/constants.js`), and every
threshold is a named constant. The `CONVERGENCE_GUARDS` map is a source-owned
compile-time policy surface, not a runtime flag or Quest-local override:
changing it is a reviewed code and guardrail change, and a guard MUST NOT be
disabled to make proof pass. Detectors fire only on real recorded events and
never touch the sealed `doneWhen`.

- **Oscillation detection**: returning the frontier to a previously-abandoned
  blocker (owner / boundary / dominantReason) is classified `oscillating`, never
  theory support, and is treated as a stall that climbs the ladder. Surfaced as
  the high-severity `blocker-oscillation` health signal.
- **Invariant ratchet**: each measured report feeds a per-frontier high-water
  mark of satisfied sub-invariants. Dropping a previously-green invariant records
  a `regression` violation, does not count as progress, and keeps the offending
  diff committed for bisection.
- **Distance metric**: an opt-in `metric: "distance"` frontier gradient — a
  lower-is-better weighted sum of priority items, missing publications, pending
  spread, distinct failing invariants, and the remaining clean-run streak — so
  the ladder steers on a gradient, not a flapping 0/1. When the single-run metric
  hits 0 but `doneWhen` needs N consecutive clean runs, health routes the next
  move to the consecutive proof rather than a new theory.
- **Measured promotion only**: a theory is promoted exclusively by a measured
  post-patch evidence report; a subagent approval finding may inform but never
  promote. Audit flags any selected theory approved by a finding with no later
  measured report.
- **Invariant ledger**: `projectInvariantLedger` folds the log into the live
  per-invariant state — green high-water, currently-green, currently-red, and the
  sets regressed or restored this run — and is the shared foundation the
  coupled-oscillation and regression-restore guards read from.
- **Coupled-invariant oscillation**: when regressions repeatedly bounce between
  two or more *disjoint families* of sub-invariants (each frontier patch flips one
  family red, e.g. cluster A `publication_converged`/`priority_spread_settled`
  versus cluster B which is defined in terms of A), single-frontier patching can
  whack-a-mole forever while every local metric reads 0. `detectCoupledOscillation`
  groups `regressed` label sets into disjoint families by transitive intersection
  and flags `coupled` once the swap count crosses `COUPLED_OSC_SWAP_THRESHOLD`.
  This forces the **system-theory rung** (and, by keyword, the model rung) rather
  than another frontier patch, surfaced as the `coupled-invariant-oscillation`
  health signal. The `CoupledAdmission` TLA+ model
  (`models/readiness-starvation/`) is the discriminator: a single shared knob makes
  the two green-ranges overlap at exactly one value, single-frontier patches bounce
  forever (`EventuallySteady` violated), and only an atomic reconcile that satisfies
  both families at once converges.
- **Coupled-reconcile gate (rr-F)**: detecting the coupling above is not enough —
  the rr-D escalation is discharged the moment a system theory merely *exists*, after
  which the Solver could patch a single owner again and let the partner family
  re-break. rr-F closes that hole. Once a coupling is detected and a coupled family is
  still red in the invariant ledger, `couplingReconcileStatus` reports `pending` and
  the next *begin*-phase move is pinned to an **atomic cross-owner reconcile**: a
  single measured run that leaves **every** coupled family green together, or a finding
  that explicitly accepts the coupling. A single-owner local fix that greens only one
  family is denied progress credit (`coupledLocalFixBlocked` force-stalls it so it
  climbs toward the system-theory/model rung instead of banking whack-a-mole). Because
  the detector reads the whole append-only history, the obligation persists across the
  entire coupling episode, not just the run that first tripped it. Switchable via
  the source-owned `CONVERGENCE_GUARDS.couplingReconcile` policy; it is not a
  runtime escape hatch.
- **Regression-restore gate**: once a measured run records an invariant
  regression, the very next *begin*-phase move is pinned to restoring (or
  recording a finding that explains) the dropped invariant before any new theory
  is allowed — a regression cannot be left behind as collateral while the loop
  chases a fresh blocker. `regressionRestoreStatus` reports `pending` until a
  later finding or a restoring measured report clears it; surfaced as
  `regression-restore-required`.
- **Scope-pressure terminal bound**: scope pressure is advisory until the changed
  in-scope file count crosses `SCOPE_PRESSURE_FILE_LIMIT`, at which point the
  begin-phase gate refuses to open a new frontier patch and routes to consolidation
  or an honest park — a Quest cannot converge by accreting an unbounded blast
  radius. `scopeTerminalStatus` carries the bound; surfaced as
  `scope-pressure-terminal`.
- **Gradient refinement of the sealed metric**: a frontier metric may be sharpened
  from the scalar `priority` count to the composite `distance` gradient (or any
  pair drawn from `GRADIENT_REFINEMENT_METRICS`) *without* tripping the
  goalpost-immutability check, provided the probe and every other metric arg are
  byte-identical. The refinement is strictly harder to satisfy and leaves the
  sealed `doneWhen` untouched (see `isGradientRefinement`), so steering the ladder
  on a sharper gradient is never punished as moving the goalposts.
- **Harness-not-measuring gate (rr-G)**: a run that did not measure the system under
  test — a dead or disconnected harness, recorded as an invalid sample with a null
  metric — is noise, not evidence. When the trailing frontier samples are a run of such
  non-measuring samples, the measurement *apparatus*, not the system, is broken, and
  continuing to edit source only chases that noise. `harnessNotMeasuringStatus` counts the
  trailing run of consecutive non-measuring frontier samples (newest-first, stopping at the
  first real measurement); once it reaches `HARNESS_NONMEASURING_PARK_THRESHOLD` health
  emits the existing `cannot-measure` signal, which routes through
  `CONTINUATION_BLOCKED_MEASUREMENT` to a **resumable measurement park** (never exhaustion;
  auto-reopens on a fresh measured sample). Its next-move text *outranks* a theory demand —
  you cannot form or falsify a theory without measurement — mirroring `CODE_PRECEDENCE`
  where measurement precedes theory. The source-owned
  `CONVERGENCE_GUARDS.harnessMeasurementGate` policy is not a runtime escape
  hatch.

## Closure Strength

Closure provenance is derived purely from the sealed `doneWhen.probe`:

- **MEASURED**: `doneWhen` read a real artifact probe (e.g. `scenario-harness`).
  Convergence was observed against external evidence.
- **DECISION**: `doneWhen` read a hand-authored `oracle` file. The closure is a
  recorded decision/process judgement, not a measurement.

Both are legitimate, but a `product`-class Quest that closes on a DECISION is a
closure-strength mismatch: the audit surfaces it as a warning. Reports label the
banner `SOLVED (MEASURED)` or `SOLVED (DECISION)` so a reader can always tell
asserted closures from measured ones.

## Two-Layer Theory

Use Quest-native theories when a frontier stalls, when the work crosses owner or
layer boundaries, or when the strategy ladder reaches the model rung.

For architecture, owner-boundary, core-system, lifecycle, handoff, invariant,
Alloy, TLA+, or statechart work, inspect `npm run quest:context -- --id <id>`
or `node scripts/solve.js health --id <id>` before recording theories. If the
output prints **Model Guidance**, use `npm run model:contracts` as the theory
discriminator and pass the printed `modelRef` on model-rung attempts unless a
finding explains why the architecture model is not applicable.

The two layers are:

- **System theory**: why the scenario is stuck across owners, phases,
  invariants, or feedback loops.
- **Frontier theory**: why the next local intervention should move the selected
  frontier metric.

The active command surface is:

```sh
node scripts/solve.js theory system --id <id> ...
node scripts/solve.js theory option --id <id> --frontier <frontier> ...
node scripts/solve.js theory select --id <id> --frontier <frontier> --theory <theory-id>
node scripts/solve.js theory record --id <id> --theory <theory-id> --result active|supported|falsified|superseded|avoided|stale|needs-rerun ...
node scripts/solve.js theory card --evidence <artifact>
node scripts/solve.js health --id <id>
```

Frontier theories should name their owner path when the evidence exposes one:

```sh
node scripts/solve.js theory option --id <id> --frontier <frontier> \
  --layer ownership --mechanism operation_workflow_owner \
  --intervention "advance persisted recovery operations" \
  --expected-movement "current blocker moves from workflow_progress to completion" \
  --negative-result "same operation workflow blocker remains" \
  --discriminator "npm run model:contracts && <scenario probe>" \
  --promotion "owner/boundary evidence changes or doneWhen passes" \
  --rejection "same owner/boundary/reason recurs" \
  --owner operation_workflow_owner \
  --boundary workflow_progress \
  --caller-role startup_active_gate_owner \
  --missing-transition "pending recovery operation is advanced after restart" \
  --owned-fix-path src/rebalancer \
  --tail-consumer startup_active_gate_owner
```

Record results with the scenario/theory split and movement fields when an
attempt changed what the Quest now knows:

```sh
node scripts/solve.js theory record --id <id> --theory <theory-id> \
  --result supported \
  --scenario-outcome failed \
  --theory-outcome partial \
  --blocker-movement moved_boundary \
  --diagnostic-movement "owner stayed stable; boundary moved to workflow_progress" \
  --evidence test-output/reports/<scenario>.report.json
```

Do not revive sprint/package theory state as active authority. The archived
theory ledger may be imported only as archive memory; imported archive theories
cannot be selected for implementation until fresh Quest evidence reselects a
frontier theory.

The Solver enforces theory in supervised steps and autonomous loop preflight
only where it removes repeated local patching:

- `observe`: theory optional; instrument before patching.
- `local-fix`: theory optional.
- `widen-scope`: selected frontier theory required.
- `model`: selected frontier theory, active system theory, and `--modelRef` or
  `--modelNotApplicable` required.
- `change-approach`: selected frontier theory remains required; model evidence
  is not required unless this rung explicitly returns to a model test.

## Attempt Flow

`start` / `continue` is the default operator path. A configured agent executor
may still use autonomous `run`; supervised `step` is the component form used by
the façade and remains useful for diagnostics.

For autonomous work:

```sh
node scripts/solve.js run --id <id> --executor agent --yes --keep-alive
```

`--keep-alive` lets an autonomous agent continue across a progress-bearing
MAX_CYCLES boundary. Judgment and repair stops such as THEORY_REQUIRED,
recoverable BLOCKED, and measurement repair always return once with a typed next
action for the external driver. The optional `--max <N>` caps cycles per run;
reaching it raises the resumable MAX_CYCLES gate, not a terminal closure (omit it
to use the default cap). `--max-restarts <N>` bounds progress-bearing supervisor
replays. Retired `--commit-every`, `--stall-window`, and `--no-commit` options are
rejected rather than silently ignored.

For supervised work, one attempt is a three-phase flow:

1. **Begin**: `node scripts/solve.js step --id <id>` pins the frontier, prints
   the rung dossier, and writes the pending-attempt baseline to
   `solve/state/<id>.pending.json`. Nothing is recorded in the event log yet.
2. **Work**: do the work and rerun the relevant harness/probe so fresh evidence
   exists.
3. **Record attempt**: `node scripts/solve.js step --id <id> --commit --changeRef
   diff:<path> --summary "<hypothesis>"` measures against the pinned baseline,
   validates the attempt, updates the strategy ladder, records the log event,
   and clears the pending file. The historical `--commit` flag commits only the
   attempt record as one synchronous log append; it never creates a Git commit.
   `step --abort` discards the pending attempt without recording anything;
   beginning a second step while one is pending is an error (record or abort it
   first).

The agent executor writes a request dossier, runs the configured command, and
reads back `{changeRef, summary, notes?}`. The agent reports only what changed.
Truth always comes from the post-attempt probe measurement.

## Parallel-First Execution

Independent work within a Quest SHOULD run concurrently: batch independent reads,
fan out read-only research subagents, and verify independent findings with
concurrent verifiers rather than serially. Broad mechanical sweeps SHOULD use the
Workflow harness to pipeline the work-list.

Work MUST be serialized only when one step's output feeds another, or when workers
would mutate the same files; in the latter case workers MUST be isolated (worktrees)
or their writes ordered. Parallelism MUST NOT be applied to the proof path: subagent
verification before handoff, measured theory promotion, and one-Quest-per-commit
remain serial. Parallel Quest execution on one owner boundary remains allowed only
under disjoint file/owner scope or a single owning closure plan (see
`doctrine/decision-experiments.md`).

## Evidence And Change References

`changeRef` is an evidence pointer for one attempt. It must be a resolvable
patch artifact:

```text
diff:<path>
```

The concrete incantation for one attempt:

```sh
git diff --binary --full-index --no-ext-diff <base> -- <quest-paths> \
  > solve/changes/<questId>/attempt-<n>.diff
node scripts/solve.js step --id <questId> --commit \
  --changeRef diff:solve/changes/<questId>/attempt-<n>.diff --summary "..."
```

The artifact must live under `solve/changes/<questId>/`, end in `.diff`, and
contain a unified hunk — the change-artifact inspector enforces all three
machine-side. Alternatively, `step --commit --auto-diff` captures the
working-tree diff since step begin into
`solve/changes/<questId>/attempt-<n>.diff` and records the changeRef in one
move (an explicit `--changeRef` takes precedence).

The canonical diff does not silently omit new files. Mark an intended untracked
path with `git add -N <path>` before capture; verification otherwise refuses the
untracked path rather than approving an incomplete delta.

Commit SHAs are useful in release notes, pull requests, or human audit trails,
but they are not Solver truth. A SHA says where code landed; it does not prove
which measured attempt moved the metric. The Solver therefore does not accept
`git:<sha>` as an attempt `changeRef`.

For a source-changing attempt whose proof depends on a live/distributed
precondition, the attempt evidence must include a **precondition/engagement
witness** before `step --commit`: an `analyze:fix-engagement` /
`analyze:precondition-recurrence` result, a red-on-revert directed test
through the real seam, or a code trace proving the live path reaches the
changed code. A green DT on an injected seam is not sufficient on its own —
two wrong legs on this repo (fba0b477/96a0917f, a9344058/066bf78d) shipped on
green DTs whose precondition never occurs live. Pure refactors and
building-block DTs without a live-precondition theory are exempt.

## Source Change Verification

New Quests use verification contract v2. Every source-changing attempt still
records its Git base and exact patch identity, but exploratory attempts require
no individual approval. Their current bytes accumulate into one landing
candidate. Existing version 1 Quests and receipts preserve their original
per-attempt behavior.

Before review at an explicit durability boundary, run:

```sh
npm run audit:attempt-preflight
node scripts/solve.js checkpoint --id <quest> --dry-run \
  --reason <handoff|risky-tree|long-running|milestone>
```

The attempt preflight covers file-size thresholds, STYLE-0012 vocabulary, the
step-coverage owner census, and the whole-repo test-duplication ratchet. The
first two checks and the duplication ratchet are ratcheted and must be green
(the duplication scan is whole-tree, so an unrelated in-flight file can inflate
its count — read its per-file listing before attributing the excess to the
candidate). The census is absolute and may carry inherited drift: compare its
listed sites against the same command on the attempt's Git base — any NEW site
means the attempt is not ready for verification. The duplication ratchet runs
here, at the review boundary, deliberately NOT at attempt seal: it is a
whole-repo, cross-file scan (~90s) and the attempt-seal static gate is reserved
for cheap changed-path checkers.

The dry run applies the real narrow checkpoint gate to a copied exact-candidate
approval. Its dossier contains the common base, current fingerprint, complete
path/source-path unions, attempt range, unresolved rejection obligations,
aggregate context, and every applicable template. `next` does not prescribe
checkpoint or verification for routine version 2 attempts; it keeps advancing
work until terminal or an operator explicitly requests a durability boundary.

The verifier must inspect that complete manifest, the exact patch, Quest seal,
relevant steering, proof receipts, and every applicable checklist in the first
pass. Do not drip-feed another applicable checklist after a verdict. For a
cross-category diff, use the union of matching templates without unrelated
checklist theater. A red-on-revert receipt is behavioral evidence only when the
reverted run reaches and fails the named assertion through the intended
mechanism; apply
[`harness-fidelity.md`](../verification-templates/harness-fidelity.md), not exit
status alone. Record an exact candidate approval on the active frontier:

```sh
node scripts/solve.js finding --id <quest> --frontier <frontier> \
  --kind verifier-approval \
  --claim "Independent verification passed" \
  --evidence subagent:<id> \
  --verification-scope candidate \
  --verification-fingerprint sha256:<candidate-fingerprint>
```

One version 2 approval covers the exact current union; later byte, base, path, or
attempt drift invalidates it. Historical attempts without the contract retain
the legacy prose matcher, and version 1 attempts retain exact per-attempt
approval. `step --commit` prints
`suggested verification template: <path>` when the change diff matches an
attack checklist under
[`docs/steering/verification-templates/`](../verification-templates/INDEX.md);
include every applicable suggested template in the verifier's initial prompt.

When the independent verifier rejects a version 2 candidate, record that verdict
instead of fabricating an approval — and record it with its category-complete
finding list. A pointer-only claim (`rejected (subagent:<id>)`) satisfies every
downstream consumer mechanically while carrying zero durable content; the
recording commands refuse it:

```sh
node scripts/solve.js finding --id <quest> --frontier <frontier> \
  --kind verifier-rejection \
  --claim "Independent verification rejected this exact candidate" \
  --finding "adversarial-js-intrinsics: inherited toJSON changed the canonical digest" \
  --finding "correctness: paired result values were never compared" \
  --evidence subagent:<id> \
  --verification-scope candidate \
  --verification-fingerprint sha256:<candidate-fingerprint>
```

(`solve land --verdict reject` takes the same repeatable `--finding` flag.)
Each entry is `<category>: <summary>`; categories are kebab-case slugs,
normally verification-template categories. When the quest declaration seals a
`verificationTemplates` array, those categories are the rejection bar: a
category outside the bar is accepted once as `out-of-bar:<slug>` (a real
defect is never waived), and repeating it requires widening the sealed bar
first with `solve amend --kind verification-bar-expansion --template <slug>
--evidence <verifier reference>`. Requirements discovered at verification time
move into the declaration instead of extending an unbounded rejection
sequence.

A rejection is fail-closed and cannot be reversed by approving the rejected
bytes later. It is resolved when a later source attempt produces a
same-base, different-fingerprint candidate whose paths are a superset of the
rejected union — or, path-by-path, through recorded decomposition: `solve
decompose-rejection --id <quest> [--from-quest <successorId>]` records an
append-only `rejection-decomposition` event when an exactly approved candidate
(this quest's current one, or a successor quest's receipt that still matches
current bytes at an acceptable base) covers a subset of the rejected paths.
The standing obligation shrinks to the uncovered remainder, so splitting an
oversized rejected candidate into bounded quests no longer makes its rejection
impossible to discharge (the collision that previously forced scope-gate
overrides). Recording a
structured rejection reopens a terminal Quest and its solved frontier so the
replacement step rendered by `next` is executable. Until replacement or full
recorded coverage,
checkpoint and terminal handoff remain blocked; `next` asks for the replacement
attempt or its fingerprint, never for dishonest approval of the rejected one.
Aggregate verification still covers the final source delta across the complete
attempt path union.

After three distinct rejected candidates on one frontier with no intervening
approval (or full decomposition discharge), every attempt-sealing path —
`solve attempt`, `step --commit`, and the autonomous loop — gates further
attempts (recorded-reason override available): iterate no further under an
unsealed bar — decompose the standing rejection or author a successor quest
that seals `verificationTemplates` (measured 2026-07-27: a quest burned 14
rejection rounds where its sealed-bar successor landed in 2 attempts). The
supervised sealing paths also run a changed-path static gate (ESLint plus the
literal-guideline audit) before sealing, so machine-checkable violations
never spend a verifier round. Out-of-bar markers are append-only evidence,
not a loophole: each distinct slug passes once, every use is durably
recorded, and a repeat needs the bar-expansion amendment — which requires the
category to be a catalogued verification template.

An attempt whose recorded `workspaceBaseCommit` is a well-formed commit id that
no longer resolves — an unpushed local commit discarded with its working copy —
is classified `base_unreachable` by every consumer that resolves the recorded
base against the repository, and no consumer surfaces raw Git errors for the
condition. The same-base rule assumes the recorded base still exists; when the
base is `base_unreachable` the same invariant transfers to a reachable base:
the rejection is resolved only by a later same-frontier attempt or candidate at
a reachable base whose paths cover every rejected source path and which carries
its own later exact independent approval. There is no operator waiver for the
`base_unreachable` condition — every resolution path runs through fresh
independent verification of current bytes. A `base_unreachable` receipt leaves
live recompute and ancestry scope because its exact delta can never be
recomputed, while the attempt stays visibly reported in the verification
dossier and never counts as verification. The landing candidate and the
terminal aggregate anchor at a reachable recorded base while keeping every
recorded attempt path inside the reviewed union, so dead-base content stays
under independent review; when no reachable recorded base exists both report a
typed actionable problem that names the required covering attempt. The
reproducibility of recorded artifact bytes from reachable commits may be
measured with `checkpoint --dry-run --probe-reproducibility`, which reports the
candidate count and scan bound and never names a substitute base, because
fingerprint reproduction identifies an equivalence class of commits rather
than a provenance (823 of 2926 reachable commits reproduced one sampled
attempt's fingerprint on this repository).

At terminal, recompute the aggregate fingerprint from the earliest contracted
base through current Git content over every version 2 changed path (version 1
keeps its historical source-path rule). Aggregate approval is always mandatory.
`both` deduplicates candidate and aggregate review only when base, path union,
attempt range, and fingerprint are exactly identical. Any later attempt,
artifact tamper, or in-scope edit invalidates the approval.

## Git Handoff

After `node scripts/solve.js audit --id <id>` passes, commit all Quest-scoped
changes before handoff. Include source, tests, docs, steering, models, the
authored Quest file, append-only log, and `solve/changes/` artifacts for the
Quest. Ordinary reports are ignored on-demand projections and are not handoff
scope.

Do not include unrelated dirty worktree entries from another Quest. If the
worktree is mixed, use explicit pathspecs with `git add <quest-scoped paths>`,
then `git commit -m "<quest>: <summary>"`. Do not push (see "Regular Commit
(No Push)" above).

`node scripts/solve.js handoff --id <quest>` computes this scope-safe pathspec.
The `handoff` command requires a terminal, a passing full audit, aggregate
approval when source changed, and scope-pressure admission. It derives the in-scope
set purely from the Quest's sealed `solve/` artifacts plus the source/test files
named inside its own diffs, and lists every other dirty file as out-of-scope so
unrelated work is never swept in. The `handoff` command is a dry run by default;
`--commit` executes the printed `git add`/`commit` for the in-scope paths only
(it never pushes).

## Strategy Ladder

Each frontier climbs a finite ladder when it stalls:

```text
observe -> local-fix -> widen-scope -> model -> change-approach -> park
```

Honest measured progress keeps the current rung. A stall or honesty violation
climbs one rung. When a frontier reaches `park`, the scheduler redirects to the
next open frontier. A finite ladder prevents unbounded local patch loops.

The ladder opens on `observe`, an instrument-before-patch rung. A frontier's
first move is to add measurement — logging, a diagnostic counter, a probe — that
discriminates between competing explanations, before any source is changed to
"fix" a blocker that is not yet understood. `observe` carries no theory
requirement, the same as `local-fix`. This rung exists so the Solver reaches the
same instrument-first discipline a careful human applies: see the mechanism
before patching it.

A flat attempt whose non-empty before/after evidence fingerprints are exactly
equal is recorded as `attemptClassification=receipt-only`. It proves that a
source revision was attempted, but contains no fresh measurement, so it holds
the rung and does not advance the supervised runner's durable-progress cursor.
This exception applies only to valid, integrity-accepted flat samples. Fresh
flat evidence still climbs, as do attempts with missing identities; honesty,
regression, oscillation, coupled-owner, node-exit, and theory-gate failures keep
their existing violation or force-stall behavior.

### Falsification As Progress

An attempt that does not move the metric is normally a stall that climbs the
ladder. But an attempt that *discriminates a hypothesis* — confirming or refuting
a named theory against real evidence — is genuine investigative progress, even
when the product metric is unchanged. Such an attempt **holds** the current rung
instead of climbing toward `park`.

An attempt earns this investigative credit only when all of the following hold:
it made no product progress, it carries no honesty violation, its sample is
valid (it actually measured), it records a `discrimination` of `confirmed` or
`refuted`, it names the theory it discriminated, and that theory has not already
been credited on this frontier. Confirming or refuting a hypothesis is recorded
as a `supported` / `falsified` theory result, so a refutation is durable
knowledge that rules an approach out — not a wasted attempt.

Confirmed or refuted discrimination additionally requires evidence that reached
the target precondition/path/observable. A product failure before target
engagement is `not_reached` / `needs-rerun`, not a theory verdict; apply
operational-ground-truth.md "Target-not-reached is non-discriminating."

Credit is finite. A per-frontier investigation budget (`INVESTIGATION_BUDGET`)
caps how many distinct theories can hold a rung before the ladder resumes
climbing, so investigation can never become its own infinite loop. A confirmed or
refuted discrimination is investigative progress only; it never satisfies
`doneWhen` and never substitutes for measured product progress.

## Findings Log

Use `node scripts/solve.js finding` to record durable knowledge:

- a claim learned during the Quest;
- optional evidence for the claim;
- optional `rulesOut` text for approaches that should not be retried.

Findings are replayed into future dossiers for the same frontier. They replace
ad-hoc memory and chat-only handoff notes.

When a finding materially falsifies or constrains ANOTHER declared quest's
premise, route it: record a finding on the affected quest too (until a
dedicated route command exists, `node scripts/solve.js finding --id
<affected-quest> ...` works cross-quest), with a backlink to the source
quest's evidence. Do not edit the sibling's sealed goal in place — the routed
finding is evidence for the sibling's own next step or exhaustion, decided
there. Unrouted falsifications rot: the sibling quest starts later on a
premise this quest already disproved.

Theory result events are likewise durable memory. A measured attempt linked to a
theory records supported, falsified, or needs-rerun learning so failed attempts
still narrow the next move.

## Autonomy Default And Stop Triggers

The default execution posture for a non-trivial Quest is autonomous: the agent
SHOULD drive to SOLVED or EXHAUSTED and MUST treat non-terminal stops
(MAX_CYCLES, THEORY_REQUIRED, recoverable BLOCKED) as resume points, not closure.
Longer work SHOULD use `run --keep-alive` to replay progress-bearing MAX_CYCLES;
the external driver executes typed actions returned by judgment or repair stops.

The agent MUST stop and request user input only on one of the four canonical
core.md stop triggers: (1) Authorization — an unauthorized irreversible or
outward-facing action; (2) Goalpost ambiguity — a genuinely undetermined success
condition that no repo default resolves; (3) EXHAUSTED — no honest remaining move;
(4) Safety / scope — a destructive boundary or work outside the sealed Quest scope.
For any other open choice the agent MUST pick a sensible default, record a finding,
and continue rather than pause.

## Terminal And Blocking Conditions

A Quest run can end in one terminal result or stop at a non-terminal gate. Only
two results are TRUE terminals that close a Quest; every other stop is a
recoverable gate that leaves the Quest open and resumable:

- **SOLVED** (terminal): `doneWhen` is satisfied against live evidence.
- **EXHAUSTED** (terminal): every frontier is parked **as `exhausted`**, either
  by the finite strategy ladder (measured — the frontier had at least one
  honestly-measured sample and no honest remaining move exists) or by a
  recorded operator decision (`provenance: operator`, requiring a prior
  altitude reflection and a `--reason`; see "Operator park" below).
  A `cannot_measure` park (every contributing sample was non-measuring; the
  harness never measured anything) does NOT count toward this terminal: it is a
  resumable measurement park, so a Quest with any `cannot_measure` park stays
  open — fix the measurement infrastructure, then reopen (see closure.md
  "EXHAUSTED").
- **MAX_CYCLES** (non-terminal): the configured safety bound stopped the loop;
  treat this as a runner configuration problem, not a Quest result.
- **THEORY_REQUIRED** (non-terminal): the selected rung needs system or frontier
  theory before another attempt; record the theory and resume instead of patching
  through it.
- **BLOCKED** (non-terminal): a recoverable precondition gate (scope pressure,
  regression-restore, measurement gap, unrecorded/divergent evidence) stopped the
  current move. The stop is recorded and carries an actionable next command; it
  never closes the Quest.

### Operator park (decision terminal)

The autonomous loop can only reach a park by climbing the strategy ladder on
measured attempts. When an altitude reflection concludes EXHAUST-AND-PIVOT —
the frame itself is refuted, or the sealed symptom no longer exists on HEAD —
there is no honest remaining move *within the seal*, and no measured sample can
prove that. For that case:

```sh
node scripts/solve.js park --id <id> [--frontier <f>] --reason "<why no honest remaining move exists>"
```

parks the frontier as kind `exhausted` with `provenance: 'operator'`. Guards:
the command refuses without a prior `reflect --altitude` on the quest (the
frame-questioning note is the evidence the decision cites), `--reason` is
required, a pending supervised step must be committed or aborted first, and no
measured sample is required. When the operator park leaves every frontier
parked as `exhausted`, the quest-level EXHAUSTED terminal is appended too, so
`status`/`report`/`frontier` project the true terminal.

Provenance honesty (mirroring CLOSURE_MEASURED vs CLOSURE_DECISION): a ladder
park is a MEASURED verdict and carries no provenance field; an operator park is
a recorded DECISION and carries `provenance: 'operator'` plus a pointer to the
sanctioning altitude reflection, so a reader can never mistake one for the
other.

Park kind × provenance, and what each means for quest closure:

| | Ladder (measured) | Operator (decision) |
| --- | --- | --- |
| `exhausted` | Honestly-measured samples, metric never moved; counts toward the EXHAUSTED terminal. | Recorded exhaust-and-pivot decision (`provenance: operator`); counts toward the EXHAUSTED terminal. |
| `cannot_measure` | Harness verdict — only non-measuring samples; never closes a quest (resumable measurement park; fix the harness, then `reopen`). | Does not exist — the operator park always records kind `exhausted` (`cannot_measure` parks never close a quest). |

### Graded Guard Response

A guard never silently halts a run. Every blocking continuation is mapped,
through a reversible config table, to one of five graded dispositions (softest to
hardest) and the decision is recorded as a `gate-decision` event:

- **advisory**: annotate (finding/health signal) and continue.
- **reroute**: force a specific next move (e.g. change-approach for scope
  pressure, restore-or-explain for a regression) and continue.
- **explore**: open a bounded free-explore rung. A missing theory maps here:
  the run keeps thinking but must exit on an artifact (a falsifiable theory),
  not on metric movement. Bounded by `EXPLORE_BUDGET` distinct explore
  gate-decisions since the frontier last made progress.
- **park-resumable**: park a single frontier; the Quest stays resumable and other
  frontiers continue; it auto-reopens on fresh evidence. An explore rung whose
  budget is spent downgrades to park-resumable so the loop converges instead of
  re-stopping forever.
- **terminal**: reserved strictly for SOLVED and honest EXHAUSTED. An unmapped or
  deliberately terminal-mapped block is the only thing that may hard-fail.

Flip any continuation-code mapping to `terminal` to restore the original
"guard → stop" behaviour for that code. The mapping lives in
`scripts/solve/continuation.js` (`CONTINUATION_DISPOSITIONS`) and is resolved by
`scripts/solve/gate.js`.

### Soft-first / quorum before escalation

An inferential theory gate (a plain "produce a falsifiable theory" block) is not
hard-escalated on its first corroborating occurrence inside the **autonomous run
loop**. While fewer than `GUARD_QUORUM` advisories have been recorded for that
gate's continuation code since the frontier last made progress, the gate is
softened to an `advisory` `gate-decision` and the loop makes a real,
executor-backed attempt instead of stopping on sight. Once the quorum is reached
the gate resolves to its real disposition (`explore`, then `park-resumable`).
An honest metric improvement resets the ramp (the counter keys off the last
progress, mirroring `EXPLORE_BUDGET`).

This applies **only** to the autonomous loop (callers opt in via
`context.softFirst`); a supervised single `step`/`attempt` still reports the gate
to its operator immediately. Within one autonomous cycle the same condition can be
seen by both the pre-attempt health gate and the readiness gate that precedes the
harness. Exactly **one** advisory is recorded per cycle: whichever gate fires first
records it, and the second observes that advisory
(`softAdvisoryRecordedThisCycle`) and reuses it without double-counting toward the
quorum. The health gate is what records the advisory for a model-evidence block,
because the begin-phase readiness gate does not check model evidence.

Soft-first is **excluded** for convergence-forcing problems so they still pin
their corrective move on first sight: coupled-invariant oscillation /
system-theory-after-stall (rr-D) and coupled-invariant reconcile (rr-F). Every
non-theory code (regression/scope/measurement/data-integrity) also keeps its
immediate disposition. The model-contract evidence nudge is **not** excluded
(P5b): it is soft-eligible so the model rung gets the same bounded ramp to attempt
to PRODUCE model evidence instead of stopping on first sight — the hard
requirement is still enforced at commit time by the audit (`auditModelEvidence`:
real model/architecture changes need a `modelRef` or a later model-evidence
finding). Set `GUARD_QUORUM=0` to disable soft-first entirely and restore the
"stop on first theory gate" behaviour.

## Recorded-Reason Override Escape Hatch

Soft guards exist to keep the Quest honest, not to trap it. When a frontier is
genuinely blocked by an *overridable* guard but the operator (or agent) has a
defensible reason to proceed anyway, they may record an explicit override
instead of being halted:

```
node scripts/solve.js override --id <id> --frontier <fid> \
  --guard theory|scope --reason "<why proceeding is justified>"
```

Semantics:

- An override authorizes **exactly one** subsequent bypass of the named guard on
  that frontier. The gate records an `ADVISORY` decision tagged with the reason
  and continues; the next time the same condition recurs, the guard applies
  again unless a fresh override is recorded.
- Overrides are **reset by honest progress**: the consumed/recorded accounting is
  measured since `lastProgressIndex`, mirroring `EXPLORE_BUDGET` and
  `GUARD_QUORUM`. Real movement clears the slate.
- Only **overridable** continuation codes are accepted: `BLOCKED_THEORY` and
  `BLOCKED_SCOPE`. The command **refuses** to override honesty/integrity
  invariants — regression-restore, measurement, unrecorded-evidence, and
  metric-projection guards cannot be bypassed this way.
- Override-tagged advisories are **excluded** from soft-first quorum counting
  (the `GUARD_QUORUM` advisory ramp described under "Soft-first / quorum before
  escalation", which counts the advisories recorded since the frontier last made
  progress before a softened gate hard-escalates), so an override never silently
  spends that quorum ramp.
- A reason is **mandatory** (`--reason` non-empty); the override is itself a
  recorded event (`guard-override`) in the append-only log, so every bypass is
  auditable.

The override changes the *response* to a recorded signal; it never mutates a
detector verdict, threshold, or `doneWhen`.

## Mandatory Step-Back Reflection Turn

Long-running agents drift or oscillate. A reflection turn is a bounded, pure
"think" cycle — no attempt, no metric movement claimed — that forces the agent
to step back and re-read its own situation:

```
node scripts/solve.js reflect --id <id> --note "<text>" [--frontier <fid>] [--altitude]
```

(`--note` is mandatory: it is the recorded artifact, so `reflect` refuses a
missing or blank note.)

There are two reflection **kinds**, recorded on the `EVENT_REFLECTION` event as
`kind: "micro"` or `kind: "altitude"`. The loop checks **altitude first** (it
outranks a within-frame reframe), then micro; either one, when due, records the
event and **skips that cycle's gate and attempt**.

**Micro reflection** (`reflectionDue`) — the within-frame step-back: re-read the
situation *inside* the sealed Quest. Triggers:

- **scope-pressure**: a `scope-pressure-terminal` signal is live.
- **cadence**: `REFLECTION_INTERVAL` (default 5) attempts have elapsed since the
  last reflection.

**Altitude (framing) reflection** (`altitudeReflectionDue`) — the step-back that
questions the **frame itself**: is this Quest at the right altitude, are the
formal models / harness pulling their weight, is the code arranged to be reasoned
about, should this Quest continue or honestly EXHAUST and pivot. Triggers:

- **oscillation**: a `coupled-invariant-oscillation` signal is live — a bouncing
  coupling is the canonical "the frame, not the next fix, is wrong" signal, so it
  routes to *altitude*, not micro.
- **altitude-cadence**: `ALTITUDE_REFLECTION_INTERVAL` (default 20) attempts have
  elapsed since the last *altitude* reflection (a coarse, rarer beat than micro).
- **on-demand**: an operator or agent runs `reflect --altitude` (recorded with
  `trigger: "on-demand"`).

An altitude reflection's prompt demands the insight be **captured durably** — a
`finding` (with `rulesOut`), a `solve/epics/` entry, or a recorded system theory
— so a structural insight cannot evaporate in chat. EXHAUST-and-pivot to a
higher-altitude Quest/epic is a **legitimate, encouraged outcome** of an altitude
reflection; questioning a Quest's altitude is not moving its goalposts (see the
Must-Not list in `core.md`).

The production reflection path runs only when the executor exposes a `reflect()`
method (the generic filesystem request/response contract, request
`kind:'reflection'`); dry/test executors without `reflect()` are unaffected, so
the reflection turn never perturbs the deterministic test suite. A reflection
that times out or returns no note is still recorded (the cadence resets) — the
event simply carries no text. A supervised driver sees the same conditions as the
read-only `reflection-due` / `altitude-reflection-due` advisories
(`scripts/solve/advisories.js`).

Reflection is additive and reversible: it produces a recorded note and resets a
cadence counter; it never changes a verdict, threshold, or `doneWhen`.

`node scripts/solve.js report --id <id>` is the closure projection. It is a pure
read of the event log and derived state.

## Workflow Advisories For Supervised Drivers

The autonomous run loop *acts* on the conditions above: it runs the reflection
turn and honors a recorded override. A supervised driver — a human, or any agent
that drives the Solver through individual subcommands rather than `run` — never
goes through that loop, so without help those features only ever benefit a
single autonomous run, and an agent's out-of-band work (source edits, harness
runs) is lost at restart because it was never written to the append-only log.

To keep that progress in quest memory, the read-only diagnostic commands
`status`, `step`, `health`, and `report` surface non-blocking **advisories** (see
`scripts/solve/advisories.js`). Each names a move that is available and the exact
command to take it; recording the move stays an explicit operator action.

- **evidence-unrecorded**: a fresh probe/harness measurement is newer than quest
  memory. Run the printed `ingest-evidence` command so the measurement becomes
  durable quest memory rather than living only in source changes.
- **reflection-due**: a micro step-back reflection is due (`scope-pressure` /
  `cadence` triggers). Run the printed `reflect` command to record a falsifiable
  reframing.
- **altitude-reflection-due**: a framing reflection is due (`oscillation` /
  `altitude-cadence` triggers). Run the printed `reflect --altitude` command, look
  up and out (right-altitude / models / arrangement / pivot-or-continue), and land
  the answer durably as a finding, an epic, or a system theory.
- **override-available**: the current block is a soft, overridable guard (theory
  or scope). If there is a falsifiable reason to proceed, run the printed
  `override` command to authorize one recorded-reason bypass.
- **harness-invalid**: the harness has stopped measuring (a run of consecutive
  non-measuring samples — see rr-G). The measurement apparatus, not the system, is
  broken; fix the harness before crediting or chasing these runs. The park is
  resumable and auto-reopens on a fresh measured sample.

Advisories are read-only and never block; they fire on the same conditions the
autonomous loop acts on, so supervised and autonomous drivers converge on the
same recorded memory.

## Keep-Alive Supervisor

A long-running quest used to die when one driver session ended: an external agent
that drives the Solver through individual subcommands in a single chat loses all
momentum when that chat ends. `run --keep-alive` wraps the loop in
`runSupervised` (`scripts/solve/loop.js`) and automatically crosses only a
progress-bearing MAX_CYCLES boundary. It is decision-aware:

- **SOLVED / EXHAUSTED**: the honest two-terminal contract — stop and report.
- **measurement park (rr-G / cannot-measure)**: a dead harness cannot self-heal by
  re-running, so the supervisor steps back immediately with
  `supervisor-paused-measurement` and surfaces the harness repair.
- **MAX_CYCLES**: restart only when the just-finished invocation added durable
  progress; otherwise return the unchanged stop once.
- **THEORY_REQUIRED / recoverable BLOCKED**: return the typed judgment action to
  the external driver once; do not replay it inside the supervisor.

A restart cap (`SUPERVISOR_MAX_RESTARTS`, outcome `supervisor-budget`) prevents a
hot spin. The **durable-progress cursor** (`durableProgressCount`) counts only
events that change quest state or add durable knowledge: a measured attempt, a
measuring evidence sample, a finding, a system-theory declaration, a reflection,
a park, or a solve. It deliberately excludes gate-decision/violation noise,
per-frontier theory bookkeeping, and frontier reopens. The supervisor replays
only a MAX_CYCLES stop that advanced this cursor. THEORY_REQUIRED, measurement
repair, recoverable BLOCKED, and unchanged MAX_CYCLES return exactly once with
their typed next action intact. Every supervisor outcome is non-terminal: only
honest SOLVED / EXHAUSTED close a Quest.

## Worked Examples

Quest-specific snapshots are not canon. The former rolling-restart system-theory
example now lives under
[`docs/case-studies/rolling-restart-system-theory.md`](../../case-studies/rolling-restart-system-theory.md)
so stale execution state cannot masquerade as an active steering rule.

## Tracked Versus Regenerable

Track authored Quest files under `solve/quests/`.

Track the append-only event log under `solve/log/` because it is the durable
source of truth for findings, attempts, and terminal state. Track exact attempt
change artifacts under `solve/changes/` and non-regenerable evidence under
`solve/report/`.

Projected state under `solve/state/` is local cache and may be rebuilt from the
Quest plus append-only log. Ordinary `solve/report/<quest-id>.md` files with a
matching declaration and log, plus the generated `OVERVIEW.generated.md`, are
likewise ignored local projections. Generate either on demand. The presence,
mtime, or bytes of ignored projections MUST NOT gate `next`, audit, checkpoint,
or terminal handoff.

Files under `solve/report/` that cannot be reconstructed from one Quest
declaration and event log remain durable evidence. A projection-retention
migration MUST classify exact paths before removal, record base commit, byte
count, and SHA-256 for removed and retained files, and preserve every unmatched
or nested report artifact. Historical root digests ignore ordinary regenerated
reports but continue to bind retained evidence.

## Ledger Consistency

Summary metadata drifts from content unless it is derived or refreshed in the same
edit as the body. An audit (2026-07-01) found stale epic `status:` fields, quests
recorded solved whose oracle-probe target was missing, and oracle verdicts marked
done with no terminal state recorded. Version 2 epics remove the duplicated status
authority: `overview` derives their work stage from links and Quest state, while
human decisions remain dated decision-log entries.

Rule: when you advance a quest's outcome, update its oracle/state terminal in the
SAME change. When an epic decision changes, record the dated decision and its
explicit target link; never mirror linked-work progress into a version 2 `status:`.

Rung completion is recorded in the spec ladder (`tasks.md`, auto-flipped by the
terminal landing when the quest's `specRef` names a ladder row) and in the quest
log — the epic decision log records decisions only. A per-rung "SOLVED" paragraph
restating the landing is progress mirroring in prose: it duplicates three derived
surfaces, drifts the moment a landing is amended, and is what pushed the
2026-07-26 snapshot epic over its own 150-line planning bound. One line naming
the changed decision (a reframed pass criterion, an answered open question) is
the ceiling; outcomes live in the projections.

`npm run solve:consistency` ([`scripts/solve/ledger-consistency.js`](../../../scripts/solve/ledger-consistency.js))
gates the machine-checkable half:

- version 2 epics carry no `status:`, contain `## Decision log`, and remain within
  the 150-line planning bound; unknown contract versions fail closed, while
  legacy epics retain their historical status field without driving `overview`;
- a quest recorded `solved` whose `doneWhen` is an oracle probe has that oracle file
  present (else `solve status` re-reads it as undecided);
- oracle-`done` vs recorded-terminal-state and latent unclosable oracle probes are
  surfaced as warnings.

Derived epic stage keys ONLY on explicit planning references and projected Quest
state — never on status or decision-log prose. The consistency gate separately
checks structural contract fields and the presence of the exact decision-log
heading; it never interprets the entry text. A body that merely *mentions* a
terminal outcome about a sub-lever does not make the epic terminal (keyword
scraping was verified to be a false-positive machine). Judgment-level acceptance
stays a human concern; the check enforces only invariants that cannot be
legitimately violated.

## Portfolio And Meta Ratio

The Solver is a means, not the product. Most Quests are easy to author about the
solver, the models, or the process itself; only some attack real product
problems. Left unwatched, scaffolding work quietly dominates the open frontier.

`node scripts/solve.js portfolio` is the cross-quest governance view. It scans
`solve/quests/*.json`, reads each terminal outcome from the log, and prints a
table of id, class, closure kind, portfolio-local stage, outcome, and attempts,
plus a summary with separate draft and active-open counts and the active open
`process:product` ratio. The top-down overview likewise renders drafts separately
instead of mislabeling them as terminal. This view takes no `--id`.

Governance guidance: process Quests are scaffolding. A healthy portfolio keeps
product Quests as the majority of *open* work. A rising open `process:product`
ratio, or a cluster of `product` Quests closing on DECISION, is a signal to
re-balance toward measured product outcomes rather than self-graded meta-work.

## User-Facing Vocabulary

Use these terms consistently:

- **Quest**: the bounded unit of work.
- **Frontier**: an independent attack surface within a Quest.
- **Attempt**: one measured try against a frontier.
- **Finding**: durable knowledge learned during the Quest.
- **Theory**: system-level or frontier-level causal explanation tested by
  discriminators and attempts.
- **Report**: the Solver's terminal or in-progress projection.
- **Solver**: the tooling under `scripts/solve.js` and `scripts/solve/`.
