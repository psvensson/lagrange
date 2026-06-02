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
| Report (`solve/report/<id>.md`) | Read-only projection of the event log and terminal state. |

`doneWhen` is binary terminal success. `metric` is a progress gradient. Keep them
separate: a falling metric never closes a Quest by itself.

The strategy ladder is:

```text
local-fix -> widen-scope -> model -> change-approach -> park
```

Honest progress keeps the rung, a stall climbs it, and `park` redirects the
scheduler to another frontier. The run stops on **SOLVED** or **EXHAUSTED**.

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
  --rejection "fresh evidence keeps the same blocker"

node scripts/solve.js theory select --id rolling-restart \
  --frontier rolling-restart-main --theory theory-fresh-observation
```

Record learning explicitly when a discriminator or attempt settles a theory:

```sh
node scripts/solve.js theory record --id rolling-restart \
  --theory theory-fresh-observation --result falsified \
  --evidence test-output/reports/rolling-restart.report.json
```

Supported results are `active`, `supported`, `falsified`, `superseded`,
`avoided`, `stale`, and `needs-rerun`.

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

## Autonomous Run

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
