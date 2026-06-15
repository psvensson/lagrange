# AGENTS

Welcome, developer or AI agent. This project uses the **Quest** workflow for
problem solving and feature implementation.

This file is the **single entry point** for steering. It is the only document
that prescribes a load order. Other steering files describe their own scope;
none of them re-declare the boot sequence.

> This is the **LLM Project Operating System** — a portable, domain-neutral
> starter. Files banner-marked `Method kernel` are the reusable mechanism; files
> banner-marked `EXAMPLE` carry placeholder content you replace for your project.

## Working Model

The unit of non-trivial work is a **Quest**. A Quest is a sealed, declarative
goal under `solve/quests/<id>.json` (the Solver data store, created on first
`solve new`); attempts, findings, state, and reports are derived from the Solver
event log. See [`docs/quest-store.md`](docs/quest-store.md) for the store layout.

The Solver owns work execution:

- `node tooling/solve.js new --id <id>` creates a Quest draft.
- `node tooling/solve.js step --id <id>` starts a supervised attempt.
- `node tooling/solve.js step --id <id> --commit --changeRef diff:<path>`
  records the measured result of that attempt.
- `node tooling/solve.js run --id <id>` runs the Quest loop to a terminal.
- `node tooling/solve.js report --id <id>` writes the Quest report.

## Where Do I Look?

| If you need... | Read / Run |
| --- | --- |
| Current Quest status | `node tooling/solve.js status --id <id>` |
| Quest report / closure projection | `node tooling/solve.js report --id <id>` |
| Quest process and guardrails | [`steering/workflow/solver-quests.md`](steering/workflow/solver-quests.md) |
| Solver operator quickstart | [`docs/solver-runbook.md`](docs/solver-runbook.md) |
| Always-active core operating contract | [`steering/packs/core.md`](steering/packs/core.md) |
| Boot, authority, and first commands | [`steering/packs/boot.md`](steering/packs/boot.md) |
| Architecture / owner boundaries / contracts | [`steering/packs/architecture.md`](steering/packs/architecture.md) |
| Test policy / regression / harness rules | [`steering/packs/testing.md`](steering/packs/testing.md) |
| Lint, style, naming policy | [`steering/packs/style.md`](steering/packs/style.md) |
| Roadmap, scope, governance | [`steering/packs/governance.md`](steering/packs/governance.md) |
| Rule IDs and source citations | [`steering/packs/rules.json`](steering/packs/rules.json) |
| One-invariant-at-a-time debugging | [`ledger/closure-grammar.md`](ledger/closure-grammar.md) |

## Operational Ground Truth (don't get fooled)

These are portable traps that repeatedly cost agents time on any non-trivial
project. Internalize them before relying on a result:

- **Runs can silently execute STALE code or config.** Caches, reused
  containers, daemons that loaded a module once, watch processes serving an old
  build — confirm the thing you are testing is the thing you changed (a build
  fingerprint, a fresh process, a cache bust) before trusting any result.
- **Absence proves nothing.** A missing log line does not mean the code did not
  run; a curated sample is not the full record. Check the authoritative source,
  not a convenience view.
- **Non-deterministic outcomes need statistics, not a single run.** For any
  flaky or load-dependent behavior, never conclude from one observation; repeat
  until the signal is stable.
- **Use first-class diagnostics, not raw-log grep.** Build and run an analyzer
  that names the owner/edge of a failure; open raw logs only after it has
  pointed you somewhere.
- **Track blockers one invariant at a time.** Use
  [`ledger/closure-grammar.md`](ledger/closure-grammar.md): record the first
  violated invariant BEFORE changing code. Records live per-file under
  [`ledger/records/CL-###.md`](ledger/records); [`ledger/INDEX.md`](ledger/INDEX.md)
  is the index.
- **Two standing defaults:** research existing mechanisms before writing new
  ones (parallel machinery gets built by accident); and after implementing, have
  a separate subagent independently verify the change before relying on it (see
  [`steering/workflow/subagents.md`](steering/workflow/subagents.md)).

## Steering Load Order

1. Read this file (`AGENTS.md`).
2. Read [`steering/packs/core.md`](steering/packs/core.md).
3. Read [`steering/packs/boot.md`](steering/packs/boot.md).
4. Load the smallest relevant domain pack: architecture, testing, style, or
   governance.
5. For non-trivial implementation work, create or select a Quest and let the
   Solver record attempts, findings, state, and terminal report.
6. Consult source steering under [`steering/`](steering/) only for cited detail
   behind a compact-pack rule, or when repairing pack drift and regenerating the
   packs.

The compact packs under [`steering/packs/`](steering/packs/) are the default LLM
execution surface. Source steering files under [`steering/`](steering/) are the
canonical inputs used to generate those packs; they are not a separate runtime
override path.

## Workflow Tooling

Prefer these canonical tools before raw JSON, log slicing, or ad-hoc queries:

- **Quest scaffold**: `node tooling/solve.js new --id <id>`
- **Quest status**: `node tooling/solve.js status --id <id>`
- **Quest supervised step**: `node tooling/solve.js step --id <id>`
- **Quest autonomous run**: `node tooling/solve.js run --id <id>`
- **Quest report**: `node tooling/solve.js report --id <id>`
- **Quest probe**: `node tooling/solve.js probe ...`
- **Steering Pack Refresh**: `npm run steering:llm:pack` after editing any
  source listed in [`steering/pack.config.json`](steering/pack.config.json),
  including nested `steering/**/*.md` files.

## Quest Closure

A Quest is closed only by the Solver's terminal state:

- **SOLVED**: `doneWhen` is satisfied against live evidence.
- **EXHAUSTED**: every frontier has parked without an honest remaining move.

Do not move goalposts mid-Quest. If the task changes, author a new Quest or
record a finding that explains why the current Quest is exhausted.
