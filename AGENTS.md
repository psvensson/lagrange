# AGENTS

Welcome, developer or AI agent. This repository uses the **Quest** workflow for
problem solving and feature implementation.

This file is the **single entry point** for steering. It is the only document
that prescribes a load order. Other steering files describe their own scope;
none of them re-declare the boot sequence.

## Working Model

The unit of non-trivial work is a **Quest**. A Quest is a sealed, declarative
goal under `solve/quests/<id>.json`; attempts, findings, state, and reports are
derived from the Solver event log.

The Solver owns work execution:

- `node scripts/solve.js new --id <id>` creates a Quest draft.
- `node scripts/solve.js step --id <id>` starts a supervised attempt.
- `node scripts/solve.js step --id <id> --commit --changeRef diff:<path>`
  records the measured result of that attempt.
- `node scripts/solve.js run --id <id>` runs the Quest loop to a terminal.
- `node scripts/solve.js report --id <id>` writes the Quest report.

Archived execution artifacts may remain in the repository, but they are not the
active steering path for new work.

## Where Do I Look?

| If you need... | Read / Run |
| --- | --- |
| Current Quest status | `node scripts/solve.js status --id <id>` |
| Quest report / closure projection | `node scripts/solve.js report --id <id>` |
| Quest process and guardrails | [`.kiro/steering/workflow-guidelines/solver-quests.md`](.kiro/steering/workflow-guidelines/solver-quests.md) |
| Solver operator quickstart | [`docs/solver-runbook.md`](docs/solver-runbook.md) |
| Always-active core operating contract | [`.kiro/steering/llm/core.md`](.kiro/steering/llm/core.md) |
| Boot, authority, and first commands | [`.kiro/steering/llm/boot.md`](.kiro/steering/llm/boot.md) |
| Architecture / owner boundaries / runtime contracts | [`.kiro/steering/llm/architecture.md`](.kiro/steering/llm/architecture.md) |
| Test policy / regression / harness rules | [`.kiro/steering/llm/testing.md`](.kiro/steering/llm/testing.md) |
| Lint, style, naming policy | [`.kiro/steering/llm/style.md`](.kiro/steering/llm/style.md) |
| Roadmap, scope, governance | [`.kiro/steering/llm/governance.md`](.kiro/steering/llm/governance.md) |
| Rule IDs and source citations | [`.kiro/steering/llm/rules.json`](.kiro/steering/llm/rules.json) |
| Architecture document tree | [`architecture/INDEX.md`](architecture/INDEX.md) |

## Steering Load Order

1. Read this file (`AGENTS.md`).
2. Read [`.kiro/steering/llm/core.md`](.kiro/steering/llm/core.md).
3. Read [`.kiro/steering/llm/boot.md`](.kiro/steering/llm/boot.md).
4. Load the smallest relevant domain pack: architecture, testing, style, or
   governance.
5. For non-trivial implementation work, create or select a Quest and let the
   Solver record attempts, findings, state, and terminal report.
6. Consult source steering under [`.kiro/steering/`](.kiro/steering/) only for
   cited detail behind a compact-pack rule, or when repairing pack drift and
   regenerating the packs.

The compact packs under [`.kiro/steering/llm/`](.kiro/steering/llm/) are the
default LLM execution surface. Source steering files under
[`.kiro/steering/`](.kiro/steering/) are the canonical inputs used to generate
those packs and add cited detail; they are not a separate runtime override path.

## Workflow Tooling

Prefer these canonical tools before raw JSON, log slicing, or ad-hoc queries:

- **Quest scaffold**: `node scripts/solve.js new --id <id>`
- **Quest status**: `node scripts/solve.js status --id <id>`
- **Quest supervised step**: `node scripts/solve.js step --id <id>`
- **Quest autonomous run**: `node scripts/solve.js run --id <id>`
- **Quest report**: `node scripts/solve.js report --id <id>`
- **Quest probe**: `node scripts/solve.js probe ...`
- **Steering Pack Refresh**: `npm run steering:llm:pack` after editing any
  source listed in `.kiro/steering/llm-pack.config.json`, including nested
  `.kiro/steering/**/*.md` files.

## Quest Closure

A Quest is closed only by the Solver's terminal state:

- **SOLVED**: `doneWhen` is satisfied against live evidence.
- **EXHAUSTED**: every frontier has parked without an honest remaining move.

Do not move goalposts mid-Quest. If the task changes, author a new Quest or
record a finding that explains why the current Quest is exhausted.
