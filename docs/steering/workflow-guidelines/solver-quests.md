---
scope: governance
status: canonical
always_load: false
source_of_truth: self
compiled_pack: .kiro/steering/llm/governance.md
parent_index: ../workflow-guidelines/INDEX.md
last_reviewed: 2026-06-01
---

> **Canonical source.** The Solver is the repository work system. Its unit of
> work is a **Quest**: one sealed goal, one append-only event log, measured
> attempts, durable findings, Quest-native theories, and a terminal report. Runbook:
> [`../../../docs/solver-runbook.md`](../../../docs/solver-runbook.md).

# Quest Workflow

## Operating Contract

Use a Quest for non-trivial problem solving and feature implementation.

A Quest must:

1. declare a single sealed `doneWhen` predicate up front;
2. define one or more independent `frontiers[]`;
3. measure progress with lower-is-better probe metrics;
4. record every attempt through the Solver event log;
5. for every Quest-scoped source code change, spawn a subagent verifier before
   audit and git handoff;
6. close only through a Solver terminal state;
7. after audit passes, commit and push every Quest-scoped change.

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

## Quest Anatomy

A Quest lives at `solve/quests/<id>.json` and is authored with:

```sh
node scripts/solve.js new --id <id> --statement "<sealed result>"
```

The file declares:

- `class`: `"product"` (default) or `"process"`. Product goals must be MEASURED
  against a real artifact probe; process goals are scaffolding/decision records
  and may legitimately close on an oracle. This drives report closure labeling,
  the audit closure-strength warning, and the portfolio meta ratio.
- `doneWhen`: the binary victory condition. This is artifact-bound and sealed.
- `frontiers[]`: independent attack surfaces. Each frontier has a priority and
  a metric probe.
- `constraints[]`: optional hard limits the agent must preserve.

Keep `metric` and `doneWhen` separate. A metric is a gradient; only `doneWhen`
can close the Quest.

## Closure Of Cutover Vs Building-Block Quests

Two legitimate Quest shapes have different closure bars; do not conflate them.

- A **cutover Quest** — one whose sealed `doneWhen` is "X is the authoritative owner"
  or "the old path is retired" — closes SOLVED only on evidence the new mechanism is
  ENGAGED and authoritative in a real run (an engagement proof: `analyze:fix-engagement`,
  a red-on-revert directed test, or a trace), not merely that its code or tests exist. A
  flag that leaves the old path live while the new mechanism sits dormant is an
  unfinished cutover, not a closed Quest (see doctrine/owner-boundaries.md §1).
- A **building-block Quest** — landing a safe, default-off lever for later validation —
  closes legitimately when its OWN sealed `doneWhen` is met (e.g. "the lever is SAFE and
  engages under a flag-on repro"), provided the flag carries a written promote-or-retire
  condition (see the feature-flag lifecycle in roadmap.md). This preserves the
  deterministic-first / gate-last discipline; the cutover bar above must not block it.

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
It is advisory rather than terminal, but a high-severity signal should usually
produce a finding, a narrower theory, or a split Quest before more code is
changed.

## Regular Commit And Push

A Quest must not accumulate an unrecoverable dirty tree. The Solver commits — and
by default pushes — each Quest's own scope-clean work as it progresses: after a
`step --commit` whose attempt carries a resolved `diff:<path>` changeRef, after
**every measured attempt of an autonomous `run`**, and on every autonomous-run
terminal as a final flush. Each auto-commit refuses when `audit` does not
pass, stages only the Quest's in-scope pathspec (never the dirty-tree shape), and
carries a `Co-Authored-By:` trailer for the agent that drove the loop. It is a
no-op outside a git work
tree, on a non-measuring sample, and when the changeRef does not resolve. Push is
best-effort: a failure is non-fatal and the commit is kept. Suppress pushing with
`--no-push` or `SOLVER_NO_PUSH=1`; throttle volume with `--commit-every N` /
`--push-every N`; disable per-attempt commits with `--no-commit` (the terminal
flush still commits).

For the always-load commit-on-completion default — which also covers ad-hoc,
non-Quest work (finished work is committed, not left pending) — see core.md
"Default Posture: Commit On Completion".

## Convergence Guards

A narrowing Quest can shuffle the same blocker between owners forever and call it
progress. The guards below keep the loop converging instead of oscillating. Each
detector is a pure read-model over the append-only log; the policy that turns a
detection into a gate lives at the call site behind the master
`CONVERGENCE_GUARDS` toggle map (`scripts/solve/constants.js`), so any single
guard can be disabled by flag without code changes and every threshold is a named
constant. Detectors fire only on real recorded events and never touch the sealed
`doneWhen`.

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
  `CONVERGENCE_GUARDS.couplingReconcile`.
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
  where measurement precedes theory. Switchable via
  `CONVERGENCE_GUARDS.harnessMeasurementGate`.

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

For supervised work:

1. Do the work and rerun the relevant harness/probe.
2. `node scripts/solve.js step --id <id> --commit --changeRef diff:<path> --summary "<hypothesis>"`
   measures, validates the attempt, updates the strategy ladder, and records the log
   event synchronously without intermediate pending files or pauses.

For autonomous work:

```sh
node scripts/solve.js run --id <id> --executor agent --yes
```

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

Commit SHAs are useful in release notes, pull requests, or human audit trails,
but they are not Solver truth. A SHA says where code landed; it does not prove
which measured attempt moved the metric. The Solver therefore does not accept
`git:<sha>` as an attempt `changeRef`.

## Source Change Verification

Every Quest that changes source code must spawn a subagent verifier after the
final source diff is ready and before `node scripts/solve.js audit --id <id>`
is used for handoff. The verifier must inspect the Quest intent, touched source
diff, system guidelines, and applicable doctrine. Record the result as a Solver
finding on the active frontier with evidence `subagent:<id>`:

```sh
node scripts/solve.js finding --id <quest> --frontier <frontier> \
  --claim "Subagent verifier approved source changes against Quest intent, system guidelines, and doctrine" \
  --evidence subagent:<id>
```

If the verifier finds issues, fix them or record a finding that explains why the
Quest must continue; do not proceed to git handoff from an unresolved verifier
finding.

## Git Handoff

After `node scripts/solve.js audit --id <id>` passes, commit and push all
Quest-scoped changes before handoff. Include source, tests, docs, steering,
models, the authored Quest file, append-only log, generated report, and
`solve/changes/` artifacts for the Quest.

Do not include unrelated dirty worktree entries from another Quest. If the
worktree is mixed, use explicit pathspecs with `git add <quest-scoped paths>`,
then `git commit -m "<quest>: <summary>"` and `git push`.

`node scripts/solve.js handoff --id <quest>` computes this scope-safe pathspec.
It runs the audit and refuses on failure, derives the in-scope set purely from
the Quest's sealed `solve/` artifacts plus the source/test files named inside its
own diffs, and lists every other dirty file as out-of-scope so it is never
swept in. It is a dry run by default; `--commit` executes the printed
`git add`/`commit`/`push` for the in-scope paths only.

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

Theory result events are likewise durable memory. A measured attempt linked to a
theory records supported, falsified, or needs-rerun learning so failed attempts
still narrow the next move.

## Autonomy Default And Stop Triggers

The default execution posture for a non-trivial Quest is autonomous: the agent
SHOULD drive to SOLVED or EXHAUSTED and MUST treat non-terminal gates (MAX_CYCLES,
THEORY_REQUIRED, recoverable BLOCKED) as resume points, not handoffs. Longer work
SHOULD use `run --keep-alive` so the loop survives those gates.

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
- **EXHAUSTED** (terminal): every frontier is parked and no honest remaining move
  exists. A park is `exhausted` when it had at least one honestly-measured
  sample, or `cannot_measure` when every contributing sample was non-measuring
  (the harness never measured anything — fix the measurement infrastructure, then
  reopen).
- **MAX_CYCLES** (non-terminal): the configured safety bound stopped the loop;
  treat this as a runner configuration problem, not a Quest result.
- **THEORY_REQUIRED** (non-terminal): the selected rung needs system or frontier
  theory before another attempt; record the theory and resume instead of patching
  through it.
- **BLOCKED** (non-terminal): a recoverable precondition gate (scope pressure,
  regression-restore, measurement gap, unrecorded/divergent evidence) stopped the
  current move. The stop is recorded and carries an actionable next command; it
  never closes the Quest.

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
- Override-tagged advisories are **excluded** from soft-first quorum counting, so
  an override never silently spends the quorum ramp.
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
`finding` (with `rulesOut`), a `.kiro/epics/` entry, or a recorded system theory
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
momentum when that chat ends, and `run` itself returns on every NON-terminal stop
(`MAX_CYCLES`, `THEORY_REQUIRED`, a recoverable `BLOCKED`). `run --keep-alive`
wraps the loop in `runSupervised` (`scripts/solve/loop.js`) so the quest keeps
contributing to its append-only memory across those boundaries. It is
decision-aware, never a blind retry:

- **SOLVED / EXHAUSTED**: the honest two-terminal contract — stop and report.
- **measurement park (rr-G / cannot-measure)**: a dead harness cannot self-heal by
  re-running, so the supervisor steps back immediately with
  `supervisor-paused-measurement` and surfaces the harness repair.
- **MAX_CYCLES / THEORY_REQUIRED / recoverable BLOCKED**: the executor can act on
  these, so the loop is restarted.

Two bounds prevent a hot spin: a restart cap (`SUPERVISOR_MAX_RESTARTS`, outcome
`supervisor-budget`) and a stall guard. The stall guard tracks a **durable-progress
cursor** (`durableProgressCount`) that counts only events which change quest state
or add knowledge — a measured attempt, a measuring evidence sample, a finding, any
theory move, a reflection, a park, a reopen — and deliberately excludes the
`gate-decision` noise a hard block appends every cycle. If no durable progress
accrues across `SUPERVISOR_STALL_WINDOW` consecutive restarts it steps back with
`supervisor-stalled`. Every supervisor outcome is NON-terminal: the supervisor
never closes a quest, only honest SOLVED / EXHAUSTED do. It is model/CLI-agnostic —
it only re-invokes the same executor through the generic file contract.

## Known System-Theory Hypothesis (rolling-restart)

For the rolling-restart core-stability quest, repeated coupled-invariant
oscillation (rr-D) between the `publication_converged` / `priority_spread_settled`
family and the families defined in terms of it points to a single shared
admission/readiness knob: the `CoupledAdmission` model shows the two green-ranges
overlap at exactly one value, so single-owner patches bounce forever and only an
atomic cross-owner reconcile converges. This remains a **hypothesis to validate**,
not a settled result: it can only be confirmed once the harness measures again
(the rr-G park exists precisely because a long stretch of samples were
non-measuring). Frame the next system theory around that shared knob, and confirm
it against a measured run rather than the non-measuring noise that motivated it.

## Tracked Versus Regenerable

Track authored Quest files under `solve/quests/`.

Track the append-only event log under `solve/log/` because it is the durable
source of truth for findings, attempts, and terminal state. Track generated
reports under `solve/report/` and attempt change artifacts under
`solve/changes/` when they explain committed work.

Projected state under `solve/state/` is local cache and may be rebuilt from the
Quest plus append-only log. Do not rely on `solve/state/` as durable memory.

## Portfolio And Meta Ratio

The Solver is a means, not the product. Most Quests are easy to author about the
solver, the models, or the process itself; only some attack real product
problems. Left unwatched, scaffolding work quietly dominates the open frontier.

`node scripts/solve.js portfolio` is the cross-quest governance view. It scans
`solve/quests/*.json`, reads each terminal outcome from the log, and prints a
table of id, class, closure kind, outcome, and attempts, plus a summary with the
open `process:product` ratio. This view takes no `--id`.

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
