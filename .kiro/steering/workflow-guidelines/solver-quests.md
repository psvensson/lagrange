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
author a new Quest with the corrected `doneWhen`.

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

## Metric Validity And Invalid Samples

A metric is only meaningful when it was read from a run that actually measured
something. A scenario-harness run whose verdict is `BLOCK_EVIDENCE_INCOMPLETE`
(reason `execution_incomplete_or_metrics_missing`) did not validate anything, so
the probe reports `metric: null` with `invalidSample: true` rather than a
misleading `0`. An invalid sample is an honest no-measurement: it never counts as
progress, never satisfies `doneWhen`, breaks the consecutive-pass streak, and
climbs the strategy ladder like any other stall. Never treat a blocked or
incomplete run as a metric floor.

When a frontier has already parked and its ladder climb to the park rung
included one or more invalid samples, the `ladder exhausted without metric
movement` verdict rests partly on untrustworthy data. Reopen it with
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
carries the `Co-authored-by: Copilot` trailer. It is a no-op outside a git work
tree, on a non-measuring sample, and when the changeRef does not resolve. Push is
best-effort: a failure is non-fatal and the commit is kept. Suppress pushing with
`--no-push` or `SOLVER_NO_PUSH=1`; throttle volume with `--commit-every N` /
`--push-every N`; disable per-attempt commits with `--no-commit` (the terminal
flush still commits).

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
node scripts/solve.js theory record --id <id> --theory <theory-id> --result supported|falsified|superseded|avoided|stale|needs-rerun ...
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
2. `node scripts/solve.js step --id <id> --changeRef diff:<path> --summary "<hypothesis>"`
   measures, validates the attempt, updates the strategy ladder, and records the log
   event synchronously without intermediate pending files or pauses.

For autonomous work:

```sh
node scripts/solve.js run --id <id> --executor agent --yes
```

The agent executor writes a request dossier, runs the configured command, and
reads back `{changeRef, summary, notes?}`. The agent reports only what changed.
Truth always comes from the post-attempt probe measurement.

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

`node scripts/solve.js report --id <id>` is the closure projection. It is a pure
read of the event log and derived state.

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
