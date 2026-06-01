# Quest Rules Canon

This file is retained as a compatibility landmark for tools and readers that
still open `work/RULES.md`. The active repository workflow is the Quest/Solver
system documented by `AGENTS.md`,
`.kiro/steering/workflow-guidelines/solver-quests.md`, and
`docs/solver-runbook.md`.

Archived files under `work/` remain historical evidence. They do not authorize
new execution, closure, or continuation.

## Active Workflow

Use one Quest for every non-trivial problem-solving or implementation effort.
A Quest is an authored file under `solve/quests/<id>.json` with:

- one sealed `doneWhen` predicate;
- one or more `frontiers[]`;
- lower-is-better metric probes for progress;
- optional hard constraints.
- optional Quest-native system and frontier theories recorded in the Solver log.

The Solver owns attempts, findings, progress, and terminal state:

```sh
node scripts/solve.js status --id <id>
node scripts/solve.js step --id <id>
node scripts/solve.js step --id <id> --commit --changeRef diff:<path> --summary "<what changed>"
node scripts/solve.js finding --id <id> --frontier <frontier> --claim "<claim>"
node scripts/solve.js theory list --id <id>
node scripts/solve.js health --id <id>
node scripts/solve.js report --id <id>
```

`npm run work:context` and `npm run work:llm-start` are compatibility aliases
for the Quest context surface.

## Non-Negotiable Rules

1. Do not change `doneWhen` or frontier metrics after declaration.
2. Do not claim solved status without a live `doneWhen` probe returning true.
3. Do not treat a lower metric as closure unless `doneWhen` is satisfied.
4. Do not rely on chat summaries as memory; record durable findings.
5. Do not record an attempt without a resolvable `diff:<path>` changeRef.
6. Do not bypass frozen architecture decisions or guardrails to make proof pass.
7. Do not patch the same stalled frontier indefinitely; climb the finite ladder.
8. Do not delegate terminal-state decisions to workers; Solver projection wins.
9. Do not keep widening or modeling a frontier without selected Quest theory
   evidence.

## Strategy Ladder

Each frontier climbs this ladder when an attempt stalls or violates honesty
checks:

```text
local-fix -> widen-scope -> model -> change-approach -> park
```

Honest metric progress keeps the frontier on its current rung. Parking one
frontier redirects to another open frontier. A Quest is exhausted only when all
frontiers are parked.

## Two-Layer Theory

When local patching stalls, use Quest-native theory events instead of reviving
legacy sprint/package theory state:

```sh
node scripts/solve.js theory system --id <id> ...
node scripts/solve.js theory option --id <id> --frontier <frontier> ...
node scripts/solve.js theory select --id <id> --frontier <frontier> --theory <theory-id>
node scripts/solve.js theory record --id <id> --theory <theory-id> --result supported|falsified|superseded|avoided|stale|needs-rerun ...
node scripts/solve.js health --id <id>
```

System theory explains why the scenario is stuck across owners or invariants.
Frontier theory explains why the next local intervention should move the
selected frontier metric. `widen-scope` and later attempts require selected
frontier theory; the `model` rung also requires active system theory and
`--modelRef` or `--modelNotApplicable`.

## Modeling Rule

Use a model when the frontier involves repeated same-surface failures,
cross-owner causal behavior, lifecycle state, or an architecture decision. A
model-backed route must be visible through one of:

- a contract model binding under `architecture/contracts/`;
- an executable statechart or decision table under `docs/specs/`;
- a TLA+ or property model under `models/`;
- a Quest finding that names the model evidence and what it rules out.

Run the narrowest applicable checks before relying on the model:

```sh
npm run model:decision-tables
npm run model:statecharts
npm run model:contracts
```

## Durable Memory

Durable Quest memory lives in:

- `solve/quests/<id>.json` for the sealed goal;
- `solve/log/<id>.ndjson` for append-only attempts, findings, and terminal
  events;
- `solve/report/<id>.md` for the readable projection;
- `solve/changes/<id>/...` for attempt patch evidence.

`solve/state/` is derived cache and is not workflow memory.

## Validation Surface

Prefer these commands before raw JSON or ad-hoc log slicing:

```sh
npm run quest:context -- --id <id>
npm run solve:status -- --id <id>
npm run solve:probe -- --probe <probe> ...
npm run solve:report -- --id <id>
npm run model:contracts
npm test -- test/path/to/file.test.js
```

Specialized `work:*` analysis commands may still read archived evidence. They
must not be used as the active execution or closure authority for new work.
