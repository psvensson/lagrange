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
> attempts, durable findings, and a terminal report. Runbook:
> [`../../../docs/solver-runbook.md`](../../../docs/solver-runbook.md).

# Quest Workflow

## Operating Contract

Use a Quest for non-trivial problem solving and feature implementation.

A Quest must:

1. declare a single sealed `doneWhen` predicate up front;
2. define one or more independent `frontiers[]`;
3. measure progress with lower-is-better probe metrics;
4. record every attempt through the Solver event log;
5. close only through a Solver terminal state.

Do not move goalposts in place. If the goal is wrong, record the finding and
author a new Quest with the corrected `doneWhen`.

## Quest Anatomy

A Quest lives at `solve/quests/<id>.json` and is authored with:

```sh
node scripts/solve.js new --id <id> --statement "<sealed result>"
```

The file declares:

- `doneWhen`: the binary victory condition. This is artifact-bound and sealed.
- `frontiers[]`: independent attack surfaces. Each frontier has a priority and
  a metric probe.
- `constraints[]`: optional hard limits the agent must preserve.

Keep `metric` and `doneWhen` separate. A metric is a gradient; only `doneWhen`
can close the Quest.

## Attempt Flow

For supervised work:

1. `node scripts/solve.js step --id <id>` prints the current frontier dossier
   and pins the before metric.
2. Do the work and rerun the relevant harness/probe.
3. `node scripts/solve.js step --id <id> --commit --changeRef diff:<path>`
   re-measures, validates the attempt, updates the ladder, and records the log
   event.

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

## Strategy Ladder

Each frontier climbs a finite ladder when it stalls:

```text
local-fix -> widen-scope -> model -> change-approach -> park
```

Honest measured progress keeps the current rung. A stall or honesty violation
climbs one rung. When a frontier reaches `park`, the scheduler redirects to the
next open frontier. A finite ladder prevents unbounded local patch loops.

## Findings Log

Use `node scripts/solve.js finding` to record durable knowledge:

- a claim learned during the Quest;
- optional evidence for the claim;
- optional `rulesOut` text for approaches that should not be retried.

Findings are replayed into future dossiers for the same frontier. They replace
ad-hoc memory and chat-only handoff notes.

## Terminal Conditions

A Quest run ends in exactly one terminal result:

- **SOLVED**: `doneWhen` is satisfied against live evidence.
- **EXHAUSTED**: every frontier is parked and no honest remaining move exists.
- **MAX_CYCLES**: the configured safety bound stopped the loop; treat this as a
  runner configuration problem, not a Quest result.

`node scripts/solve.js report --id <id>` is the closure projection. It is a pure
read of the event log and derived state.

## Tracked Versus Regenerable

Track authored Quest files under `solve/quests/`.

The append-only log, projected state, generated reports, and generated change
artifacts live under `solve/{log,state,report,changes}/`. These are
regenerable runtime artifacts and are git-ignored.

## User-Facing Vocabulary

Use these terms consistently:

- **Quest**: the bounded unit of work.
- **Frontier**: an independent attack surface within a Quest.
- **Attempt**: one measured try against a frontier.
- **Finding**: durable knowledge learned during the Quest.
- **Report**: the Solver's terminal or in-progress projection.
- **Solver**: the tooling under `scripts/solve.js` and `scripts/solve/`.
