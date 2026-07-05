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

**Quest or not?** Author a Quest when the work will likely need more than one
measured attempt with evidence, or when it changes an owner-boundary contract.
Below that — a single-sitting fix, doc edit, or mechanical change with an
obvious proof — just do the work and commit it. Authoritative statement:
solver-quests.md "Operating Contract".

The Solver owns work execution:

- `node scripts/solve.js new --id <id> --statement "<sealed result>"` creates a
  Quest draft.
- `node scripts/solve.js step --id <id>` begins a supervised attempt — it pins
  the frontier and prints the rung dossier; it records nothing until you commit.
- `node scripts/solve.js step --id <id> --commit --changeRef diff:<path>`
  records the measured result of that attempt.
- `node scripts/solve.js run --id <id> --executor agent --yes --keep-alive` runs
  the Quest loop to a terminal. The bare `run --id <id>` uses the default `dry`
  executor — a skeleton that makes no real edits — so real autonomous work needs
  `--executor agent --yes` (and `--keep-alive` to survive non-terminal gates).
- `node scripts/solve.js report --id <id>` writes the Quest report.

Archived execution artifacts may remain in the repository, but they are not the
active steering path for new work.

## Where Do I Look?

| If you need... | Read / Run |
| --- | --- |
| Current Quest status | `node scripts/solve.js status --id <id>` |
| Quest report / closure projection | `node scripts/solve.js report --id <id>` |
| Quest process and guardrails | [`docs/steering/workflow-guidelines/solver-quests.md`](docs/steering/workflow-guidelines/solver-quests.md) |
| Solver operator quickstart | [`docs/solver-runbook.md`](docs/solver-runbook.md) |
| Always-active core operating contract | [`docs/steering/llm/core.md`](docs/steering/llm/core.md) |
| Boot, authority, and first commands | [`docs/steering/llm/boot.md`](docs/steering/llm/boot.md) |
| Architecture / owner boundaries / runtime contracts | [`docs/steering/llm/architecture.md`](docs/steering/llm/architecture.md) |
| Test policy / regression / harness rules | [`docs/steering/llm/testing.md`](docs/steering/llm/testing.md) |
| Lint, style, naming policy | [`docs/steering/llm/style.md`](docs/steering/llm/style.md) |
| Roadmap, scope, governance | [`docs/steering/llm/governance.md`](docs/steering/llm/governance.md) |
| Early-stage planning (above specs) | [`solve/epics/`](solve/epics/) — one-page intent/options/open-questions before a spec's sealed `doneWhen` exists |
| Cross-layer planning trace | `node scripts/solve.js trace --row\|--cl\|--spec\|--quest <id>` (joins quests via their `links` block) |
| Rule IDs and source citations | `npm run rule -- --id <ID>` (also `--tag`/`--domain`/free-text); browse [`docs/steering/llm/rules-index.md`](docs/steering/llm/rules-index.md). `rules.json` is generator output, too large to Read whole. |
| Architecture document tree | [`architecture/INDEX.md`](architecture/INDEX.md) |
| An npm tool for a task (before any ad-hoc command) | `npm run commands` (curated quickstart) or [`docs/steering/llm/tools-index.md`](docs/steering/llm/tools-index.md) (generated full index of every script) |

## Operational Ground Truth (distributed work — don't get fooled)

The distributed-work traps that repeatedly cost agents large amounts of time
(stale-code runs, absence-proves-nothing, deterministic-first/gate-last, use the
analyzers, one-invariant-at-a-time closure, research-first, subagent-verify) have a
single canonical home: **[`docs/steering/operational-ground-truth.md`](docs/steering/operational-ground-truth.md)**.
Read it before any distributed-harness or convergence work. The deterministic
in-process substrate (virtual clock, seeded RNG, fault injection) is mapped in
[`docs/deterministic-directed-testing-plan.md`](docs/deterministic-directed-testing-plan.md).
It is not restated here so the two copies cannot drift; see
[`docs/steering/memory-boundary.md`](docs/steering/memory-boundary.md) for the
in-repo-steering vs external-memory split.

## Steering Load Order

1. Read this file (`AGENTS.md`).
2. Read [`docs/steering/llm/core.md`](docs/steering/llm/core.md).
3. Read [`docs/steering/llm/boot.md`](docs/steering/llm/boot.md).
4. Load the smallest relevant domain pack: architecture, testing, style, or
   governance.
5. For non-trivial implementation work, create or select a Quest and let the
   Solver record attempts, findings, state, and terminal report.
6. Consult source steering under [`docs/steering/`](docs/steering/) only for
   cited detail behind a compact-pack rule, or when repairing pack drift and
   regenerating the packs.

The compact packs under [`docs/steering/llm/`](docs/steering/llm/) are the
default LLM execution surface, but each generated domain pack is a priority-ranked
subset (capped per `maxRules`), not the full rule corpus — consult
[`rules-index.md`](docs/steering/llm/rules-index.md) or `npm run rule` for every
rule in a domain. Source steering files under
[`docs/steering/`](docs/steering/) are the canonical inputs used to generate
those packs and add cited detail; they are not a separate runtime override path.

## Workflow Tooling

Prefer these canonical tools before raw JSON, log slicing, or ad-hoc queries:

- **Quest scaffold**: `node scripts/solve.js new --id <id> --statement "<sealed result>"`
- **Quest status**: `node scripts/solve.js status --id <id>`
- **Quest supervised step**: `node scripts/solve.js step --id <id>`
- **Quest autonomous run**: `node scripts/solve.js run --id <id> --executor agent --yes --keep-alive` (bare `run --id <id>` is the no-op `dry` executor)
- **Quest report**: `node scripts/solve.js report --id <id>`
- **Quest probe**: `node scripts/solve.js probe ...`
- **Full command reference**: [`docs/steering/llm/solve-commands.md`](docs/steering/llm/solve-commands.md) (generated; every `solve.js` subcommand)
- **Steering Pack Refresh**: `npm run steering:llm:pack` after editing any
  source listed in `docs/steering/llm-pack.config.json`, including nested
  `docs/steering/**/*.md` files.

## Quest Closure

A Quest is closed only by the Solver's terminal state:

- **SOLVED**: `doneWhen` is satisfied against live evidence.
- **EXHAUSTED**: every frontier has parked without an honest remaining move.

Do not move goalposts mid-Quest. If the task changes, author a new Quest or
record a finding that explains why the current Quest is exhausted.

Two always-on default postures govern how you drive a Quest to that terminal;
this entry point only names them, the authoritative statements are in
[`docs/steering/llm/core.md`](docs/steering/llm/core.md):

- **Autonomy** — drive a non-trivial Quest to a true terminal without pausing;
  stop only on the core.md stop-triggers (Authorization / Goalpost ambiguity /
  EXHAUSTED / Safety). See core.md "Default Posture: Autonomy".
- **Commit on completion** — committing finished, verified work is durably
  authorized; do not wait to be asked. See core.md "Default Posture: Commit On
  Completion".
