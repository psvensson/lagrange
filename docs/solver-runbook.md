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

# 3. Commit: re-measures and records the attempt.
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

## Recording A Finding

Record durable knowledge so a re-picked frontier does not retry a known dead
end.

```sh
node scripts/solve.js finding --id rolling-restart --frontier rolling-restart-core \
  --claim "retry-on-timeout does not converge under load" \
  --evidence tla:rolling-restart.cfg --rulesOut retry-on-timeout
```

Findings are replayed into future dossiers for the same frontier.

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

## Tracked Versus Regenerable

Commit authored quests under `solve/quests/`.

The append-only log (`solve/log/`), derived state (`solve/state/`), generated
reports (`solve/report/`), and generated change artifacts (`solve/changes/`) are
runtime byproducts and are git-ignored.

## Inspecting A Probe Directly

```sh
node scripts/solve.js probe --probe scenario-harness \
  --scenario rolling-restart --reportDir test-output/reports --consecutive 3
# => { metric, done, evidence, detail:{ runs, verdict } }
```
