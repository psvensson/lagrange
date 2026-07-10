# Solver Runbook

The Solver is the repository work system for solving problems and implementing
features. You author a **Quest**, then either drive supervised attempts or let
the autonomous loop run. Truth comes from probes reading real artifacts, never
from a worker's self-report.

## Concepts

| Piece | Role |
| --- | --- |
| Quest (`solve/quests/<id>.json`) | Declarative plan: `doneWhen`, frontiers, constraints. |
| Frontier | Independent work surface with a lower-is-better metric. |
| Attempt | One recorded try: hypothesis, metric before -> after, changeRef. |
| Finding | Durable knowledge: a claim, optional evidence, optional `rulesOut`. |
| Theory | Durable two-layer reasoning: system theory plus selected frontier theory. |
| Current Blocker | Latest owner/boundary/reason projection from ingested evidence. |
| Scope Pressure | Advisory signal from recorded `diff:<path>` artifacts. |
| Report (`solve/report/<id>.md`) | Read-only projection of the event log and terminal state. |

`doneWhen` is binary terminal success. `metric` is a progress gradient. Keep them
separate: a falling metric never closes a Quest by itself.

The strategy ladder is (canonical definition:
`docs/steering/workflow-guidelines/solver-quests.md` — this runbook restates it
for convenience and defers to that source if they ever diverge):

```text
observe -> local-fix -> widen-scope -> model -> change-approach -> park
```

The ladder opens on `observe`, an instrument-before-patch rung (add measurement
that discriminates explanations before changing source); see
`docs/steering/workflow-guidelines/solver-quests.md` Strategy Ladder for the
canonical definition. Honest progress keeps the rung, a stall climbs it, and
`park` redirects the scheduler to another frontier. The run stops on **SOLVED**
or **EXHAUSTED**.

## Reading The Current Blocker

Use the status, health, and report views before widening a fix:

```sh
node scripts/solve.js status --id <quest>
node scripts/solve.js health --id <quest>
node scripts/solve.js report --id <quest>
```

The Current Blocker card is the active failure surface. It reports the latest
frontier, owner, boundary, dominant reason, selected theory, latest evidence,
and next move. Its `movement` field tells whether the latest evidence left the
blocker `same`, `moved_owner`, `moved_boundary`, `narrowed`, `solved`,
`invalid`, or `unknown`.

Metric movement is still the only product progress, and `doneWhen` is still the
only closure condition. Blocker movement is diagnostic progress: it can justify
recording partial theory support, a fresh owner-path theory, or a finding that a
previous blocker is no longer current.

Scope Pressure appears in `health` and `report`. It scans the Quest's recorded
attempt diffs and flags broad owner areas, large diff stacks, mixed
runtime/workflow changes, and mixed runtime/harness changes. A high-severity
signal is not an automatic failure, but it is a strong prompt to narrow the next
theory, split work, or record why the Quest scope is still honest.

## Authoring A Quest

```sh
node scripts/solve.js new --id my-quest --statement "What done means in one line."
# edit solve/quests/my-quest.json: set doneWhen + each frontier metric probe/args
```

Available probes:

- `scenario-harness`: reads `test-output/reports/*.report.json`.
- `oracle`: file-backed probe for dry runs and tests.

`scenario-harness` args:

```json
{"scenario":"rolling-restart","reportDir":"test-output/reports","consecutive":3,"metric":"priority"}
```

## Supervised Step

Use a supervised step when a human or local agent performs one vertical slice
between measurements.

```sh
# 1. Begin: prints the rung dossier and pins the baseline metric.
node scripts/solve.js step --id rolling-restart

# 2. Do the work, then rerun the harness so fresh evidence exists.

# 3. Commit: validates the patch artifact and records the measured result.
node scripts/solve.js step --id rolling-restart --commit \
  --changeRef diff:path/to.patch --summary "tightened restart backpressure guard"

# Abort a pending step without recording an attempt:
node scripts/solve.js step --id rolling-restart --abort
```

`--changeRef` must resolve to an existing patch artifact:

```text
diff:<path>
```

Commit SHAs are not attempt proof. They can be mentioned in external audit
notes after code lands, but the Solver only trusts probes and resolvable
attempt artifacts.

Use the atomic attempt path only when the Solver should own the command
execution and measure before and after in one process:

```sh
node scripts/solve.js attempt --id rolling-restart --frontier rolling-restart-core \
  --changeRef diff:solve/changes/rolling-restart/core.diff \
  --summary "tightened restart backpressure guard" -- npm test -- test/path.test.js
```

## Recording A Finding

Record durable knowledge so a re-picked frontier does not retry a known dead
end.

```sh
node scripts/solve.js finding --id rolling-restart --frontier rolling-restart-core \
  --claim "retry-on-timeout does not converge under load" \
  --evidence tla:rolling-restart.cfg --rulesOut retry-on-timeout
```

Findings are replayed into future dossiers for the same frontier.

## Recording Quest Theories

Use Quest-native theories when a frontier stalls, a fix crosses owner/layer
boundaries, or a model route is due. Do not revive sprint/package theory state
as active authority; archived theory ledger entries can only be imported as
archive memory.

Before recording theories for architecture, owner-boundary, core-system,
lifecycle, handoff, invariant, Alloy, TLA+, or statechart work, inspect:

```sh
npm run quest:context -- --id <quest>
node scripts/solve.js health --id <quest>
```

If they print **Model Guidance**, use `npm run model:contracts` as the theory
discriminator. At the model rung, pass the printed `modelRef` when committing
the attempt unless a finding explains why the architecture model is not
applicable:

```sh
node scripts/solve.js step --id <quest> --commit \
  --changeRef diff:path/to.patch --summary "..." \
  --modelRef model:architecture/contracts/core-system-logic.md
```

System theory explains why the whole scenario is stuck:

```sh
node scripts/solve.js theory system --id rolling-restart \
  --theory theory-rolling-system \
  --problem "active gate stalls across owners" \
  --evidence test-output/reports/rolling-restart.report.json \
  --success "rolling-restart passes the sealed doneWhen" \
  --mechanism coupled_invariants \
  --owner startup_active_gate_owner \
  --missing-edge "cross-owner publication discriminator" \
  --discriminator "npm run model:contracts" \
  --stable-fact "representative metric stayed flat" \
  --changed-fact "frontier climbed to model rung"
```

Frontier theory explains the next local intervention:

```sh
node scripts/solve.js theory option --id rolling-restart \
  --frontier rolling-restart-main \
  --theory theory-fresh-observation \
  --layer observation \
  --mechanism observation_gap \
  --intervention "capture fresh owner evidence" \
  --expected-movement "priority metric decreases" \
  --negative-result "same metric falsifies observation-only fix" \
  --discriminator "npm run analyze:topology-convergence -- <report>" \
  --promotion "fresh owner evidence identifies a source path" \
  --rejection "fresh evidence keeps the same blocker" \
  --owner startup_active_gate_owner \
  --boundary publication_visibility \
  --caller-role startup_active_gate_observer \
  --missing-transition "observer wakes after publication handoff" \
  --owned-fix-path src/bootstrap \
  --tail-consumer cluster_startup

node scripts/solve.js theory select --id rolling-restart \
  --frontier rolling-restart-main --theory theory-fresh-observation
```

Owner-path fields are optional for simple local work. Add them whenever the
Current Blocker identifies an owner/boundary path; they let the Solver detect
when later evidence has made the selected theory stale.

Record learning explicitly when a discriminator or attempt settles a theory:

```sh
node scripts/solve.js theory record --id rolling-restart \
  --theory theory-fresh-observation --result falsified \
  --evidence test-output/reports/rolling-restart.report.json
```

Supported results are `active`, `supported`, `falsified`, `superseded`,
`avoided`, `stale`, and `needs-rerun`.

When an attempt does not move the metric but does move the blocker, split the
scenario outcome from the theory outcome:

```sh
node scripts/solve.js theory record --id rolling-restart \
  --theory theory-fresh-observation --result supported \
  --scenario-outcome failed \
  --theory-outcome partial \
  --blocker-movement moved_boundary \
  --diagnostic-movement "publication visibility moved to workflow progress" \
  --evidence test-output/reports/rolling-restart.report.json
```

Use `scenarioOutcome=invalid` and `theoryOutcome=needs-rerun` when the evidence
sample did not measure. Use `theoryOutcome=falsified` when the same blocker
recurs after a valid measurement. Use `theoryOutcome=supported` only when the
metric improved or `doneWhen` passed.

The supervised step gate and autonomous loop preflight enforce theory only when
it becomes valuable:

- `local-fix`: theory optional.
- `widen-scope`: selected frontier theory required.
- `model`: selected frontier theory, active system theory, and `--modelRef` or
  `--modelNotApplicable` required.
- `change-approach`: selected frontier theory remains required; model evidence
  is not required unless this rung is explicitly returning to a model test.

Inspect the current theory and loop-health state with:

```sh
node scripts/solve.js theory list --id rolling-restart
node scripts/solve.js health --id rolling-restart
node scripts/solve.js theory card --evidence test-output/reports/rolling-restart.report.json
```

If `health` prints `selected-theory-stale`, do one of these before another
widened/model/change-approach attempt:

- record the selected theory result with the latest evidence and movement;
- select a fresh frontier theory whose owner/boundary matches the Current
  Blocker;
- record a finding explaining why the current evidence should not retire the
  selected theory.

## Quest Audit

Audit a Quest before relying on its closure projection:

```sh
node scripts/solve.js audit --id rolling-restart
```

The audit is Quest-generic. It rejects unresolved or mis-scoped change artifacts,
missing evidence fingerprints, blocked theory reuse, metric-zero-but-not-done
closures without later theory learning, stale reports, and fresh probe evidence
that has not been recorded.

For an existing Quest that predates the strict audit rules, preserve the old log
as archive memory and append a strict-audit baseline before resuming:

```sh
node scripts/solve.js upgrade --id rolling-restart \
  --reason "baseline pre-hardening history before restart"
```

The upgrade command records a `quest-upgraded` event, ingests the latest fresh
probe evidence when available, and regenerates the report. Audit rules remain
strict for all events after the baseline.

## Reopening A Parked Frontier

A frontier parks when the strategy ladder reaches the park rung without metric
movement. If that climb counted any non-measuring sample — a blocked or
incomplete harness run that the metric-validity probe now reports as
`invalidSample` / `metric: null` — the exhaustion verdict is not trustworthy.
Reopen the frontier so the Solver can take fresh, honestly-measured attempts:

```sh
node scripts/solve.js reopen --id rolling-restart \
  --reason "park climb included an execution_incomplete sample; verdict untrusted"
```

The `--frontier <id>` flag is optional when the Quest has a single parked
frontier. The reopen is evidence-gated: it is refused unless at least one
contributing attempt re-classifies as a non-measuring sample, so an honestly
measured park is never reopened. It leaves `doneWhen` and the frontier metric
unchanged (no goalpost movement), keeps the original `park` event in the log,
preserves `parkedCount`, and resets the frontier to the first rung.

### Cannot-Measure Versus Exhausted Parks

A park is classified by why the ladder stopped. If the contributing attempts
produced at least one honestly-measured sample but the metric never moved, the
park is `exhausted` — no honest move remains. If every contributing attempt was
non-measuring (the harness never produced a valid measurement), the park is
`cannot_measure` — the measurement infrastructure is broken, not the solution
space. `status`, `health`, `report`, and `portfolio` show the distinction and a
`cannot_measure` park points the operator at fixing the harness, then reopening.

Reopens are bounded and recorded. The frontier projection tracks `reopenCount`
(shown by `status`, `health`, and `portfolio`). A second reopen is refused while
nothing has changed since the last reopen — re-running an unchanged harness can
only reproduce the same non-measuring loop. For a `cannot_measure` park the
refusal points at fixing the harness; for any park, changing the source or the
attempt evidence allows the reopen again.

## Source Change Verification

Every Quest that changes source code must spawn a subagent verifier after the
final source diff is ready and before audit/git handoff. Ask the verifier to
check the Quest intent, touched source diff, system guidelines, and applicable
doctrine. Then record the review as a Solver finding:

```sh
node scripts/solve.js finding --id <quest> --frontier <frontier> \
  --claim "Subagent verifier approved source changes against Quest intent, system guidelines, and doctrine" \
  --evidence subagent:<id>
```

For Quests with the `source-change-subagent-verification` constraint, audit
fails after source-code patch artifacts until this later verifier finding is in
the log.

## Git Handoff

After `node scripts/solve.js audit --id <quest>` passes, commit the
Quest-scoped changes before handing the work off. Include the authored Quest
file, append-only log, generated report, `solve/changes/` attempt artifact, and
all source, test, docs, steering, and model files changed for that Quest.

Do not commit unrelated dirty worktree entries from another Quest. If the
worktree is mixed, use explicit pathspecs.

The `handoff` command computes the scope-safe pathspec for you. It runs the
audit (and refuses on failure), derives the in-scope set purely from the Quest's
own sealed artifacts — its `solve/quests`, `solve/log`, `solve/report`,
`solve/state`, and `solve/changes/<id>` paths plus the source/test files named
inside that Quest's diffs — and explicitly lists every other dirty file as
out-of-scope so it is never swept in:

```sh
# Dry run by default: prints in-scope, out-of-scope, and the exact git commands.
node scripts/solve.js handoff --id <quest>

# Execute the printed git add/commit for the in-scope paths only (never pushes):
node scripts/solve.js handoff --id <quest> --commit
```

If you prefer to drive git by hand, mirror the in-scope list manually:

```sh
git status --short
git add <quest-scoped paths>
git commit -m "<quest>: <summary>"
```

Do not push automatically: pushing is a separate, outward-facing action that
stays an Authorization stop-trigger unless the user has durably authorized it.

This git handoff does not replace Solver proof. Attempt proof remains the
recorded `diff:<path>` changeRef plus live probe evidence; the commit makes the
completed Quest durable in the local repository.

## Regular Commit (No Push)

A Quest should not accumulate an unrecoverable dirty tree. The Solver commits
each Quest's own scope-clean work as it progresses, so a single bad
`git checkout` can never lose it. This happens automatically:

- after a supervised `node scripts/solve.js step --id <quest> --commit` whose
  attempt carries a resolved `diff:<path>` changeRef,
- after every verified, scope-clean measured attempt of an autonomous `run` (a
  squashable `checkpoint(quest):` commit, not only at the terminal), so a long
  narrowing Quest leaves a per-attempt trail of rollback points instead of
  stacking dozens of attempts in one dirty tree, and
- on every autonomous-run terminal (`SOLVED` or `EXHAUSTED`) as a final flush.

Each auto-commit obeys the same rules as `handoff`: it refuses when its gate is
not met (the mid-quest checkpoint gate requires the attempt's source change to be
subagent-verified; the terminal gate additionally requires the Quest to have
finished without errors — a scope-clean commit of dishonest evidence is still
dishonest), stages only the Quest's in-scope pathspec (never the dirty-tree
shape), and carries a `Co-Authored-By:` trailer attributing the agent that drove
the loop (default: the Claude trailer; override via `solve/config.json`
`coauthorTrailer`). It is a no-op outside a git work tree, on a non-measuring
sample, and when the attempt's `changeRef` does not resolve.

The Solver never pushes — no subcommand, loop, or handoff runs `git push`.
Throttle the per-attempt volume with `--commit-every N`, or disable per-attempt
commits entirely with `--no-commit` (the terminal flush still commits):

```sh
node scripts/solve.js run --id <quest> --commit-every 3
node scripts/solve.js run --id <quest> --no-commit
```

## Convergence Guards

A narrowing Quest can otherwise shuffle the same blocker between owners forever
and call it progress. Guards keep the loop honest and converging. **This is a
summary; the canonical and complete guard list — including the invariant
ledger, coupled-invariant oscillation, the coupled-reconcile gate, the
regression-restore gate, the scope-pressure terminal bound, gradient
refinement, and the harness-not-measuring gate — lives in
`docs/steering/workflow-guidelines/solver-quests.md` §Convergence Guards**,
which wins on any divergence. Representative examples:

- **Oscillation detection.** Returning the frontier to a previously-abandoned
  blocker is classified `oscillating` — never theory support — and climbs the
  ladder instead of patching the same cycle again.
- **Invariant ratchet.** Dropping a previously-green sub-invariant records a
  `regression` violation and the attempt does not count as progress.
- **Distance metric.** A Quest may opt into the `metric: "distance"` gradient
  so the ladder steers on a real gradient instead of a flapping 0/1.
- **Streak-aware next move.** A metric at 0 with a consecutive-clean-runs
  `doneWhen` routes the next move to the streak proof, not another theory.
- **Measured promotion only.** A theory is promoted exclusively by a measured
  post-patch evidence report; a subagent approval finding may inform but never
  promote.

## Autonomous Run

The canonical autonomous invocation:

```sh
node scripts/solve.js run --id <id> --executor agent --yes --keep-alive
```

- `--executor agent`: the real-edit executor (the default `dry` executor is a
  no-op skeleton).
- `--yes`: non-interactive confirmation that the agent executor may edit the
  tree.
- `--keep-alive`: survives non-terminal stops (MAX_CYCLES, THEORY_REQUIRED,
  recoverable BLOCKED) via the supervisor — without it the run returns at the
  first non-terminal stop, which reads as a stall.

```sh
node scripts/solve.js run --id my-quest
node scripts/solve.js status --id my-quest
node scripts/solve.js report --id my-quest
```

`run --executor dry` is the default skeleton/test executor. The generic
model-agnostic agent executor performs real edits and is gated:

```sh
# solve/config.json
# { "agentCommand": "scripts/solve/agent-adapter.example.sh {requestFile} {responseFile}",
#   "timeoutMs": 600000 }

node scripts/solve.js run --id my-quest --executor agent --yes --max 20
```

The Solver writes a JSON dossier to `{requestFile}` and exports
`SOLVE_REQUEST_FILE`. It runs `agentCommand`, then reads a JSON response from
`{responseFile}` / `SOLVE_RESPONSE_FILE`:

```json
{"changeRef":"diff:path/to.patch","summary":"what changed","notes":"optional"}
```

The agent reports only what it did. `doneWhen` and metric movement are
re-measured from artifacts after the command exits. Timeout, non-zero exit, or
malformed response is recorded as a no-op attempt and the ladder escalates.
If the selected rung needs theory, autonomous run stops at `theory-required`
before invoking the executor; record or select the missing theory, then resume.

## Other Operator Commands

One line each; see `docs/steering/llm/solve-commands.md` and
`docs/steering/workflow-guidelines/solver-quests.md` for detail:

- `reflect --altitude` — record a frame-questioning reflection (no attempt, no
  metric claim); prerequisite for an operator park.
- `override` — recorded-reason bypass of one overridable heuristic guard
  (never honesty/integrity invariants).
- `park` — operator decision terminal: park a frontier as `exhausted` with
  `provenance: operator` (requires a prior altitude reflection and `--reason`).
- `step-pending` — print the pending supervised step (the pinned baseline
  awaiting a commit) as JSON.
- `handoff --checkpoint` — squashable mid-quest save via the scope-safe
  pathspec.
- Soft-first quorum — inferential theory gates soften to advisories until
  `GUARD_QUORUM` occurrences since last progress; autonomous loop only (see
  solver-quests.md "Soft-first / quorum before escalation").

## Tracked Versus Regenerable

Commit authored quests under `solve/quests/`.

Commit the append-only log under `solve/log/`; it is durable Quest memory and
the source for attempts, findings, and terminal state. Commit generated reports
under `solve/report/` and attempt diffs under `solve/changes/` when they explain
work that moved a metric or closed a Quest.

`solve/state/` is derived cache and remains git-ignored.

## Inspecting A Probe Directly

```sh
node scripts/solve.js probe --probe scenario-harness \
  --scenario rolling-restart --reportDir test-output/reports --consecutive 3
# => { metric, done, evidence, detail:{ runs, verdict } }
```
