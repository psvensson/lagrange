# AGENTS

Welcome, developer or AI agent. This repository uses the **Quest** workflow for
problem solving and feature implementation.

This file is the **single entry point** for steering. It is the only document
that prescribes a load order. Other steering files describe their own scope;
none of them re-declare the boot sequence.

## Routing Decision

The unit of non-trivial work is a **Quest**. A Quest is a sealed, declarative
goal under `solve/quests/<id>.json`; attempts, findings, state, and reports are
derived from the Solver event log.

**Quest or not?** Author a Quest when the work will likely need more than one
measured attempt with evidence, or when it changes an owner-boundary contract.
Below that — a single-sitting fix, doc edit, or mechanical change with an
obvious proof — just do the work and commit it. Authoritative statement:
solver-quests.md "Operating Contract".

For a Quest, use [`boot.md`](docs/steering/llm/boot.md) as the executable
quickstart. The primary operator surface is three verbs: `solve start`,
`solve continue`, and `solve land`. Component commands remain available for
diagnostics and exceptional operations; the entry point does not duplicate them.

## Where Do I Look?

| If you need... | Read / Run |
| --- | --- |
| First executable action | [`docs/steering/llm/boot.md`](docs/steering/llm/boot.md) |
| Start or resume a Quest | `node scripts/solve.js start --id <id>` |
| Execute its safe next step | `node scripts/solve.js continue --id <id>` |
| Record a verdict and land | `node scripts/solve.js land --id <id> ...` |
| Quest process and guardrails | [`docs/steering/workflow-guidelines/solver-quests.md`](docs/steering/workflow-guidelines/solver-quests.md) |
| Solver operator quickstart | [`docs/development/solver-runbook.md`](docs/development/solver-runbook.md) |
| Always-active core operating contract | [`docs/steering/llm/core.md`](docs/steering/llm/core.md) |
| Boot, authority, and first commands | [`docs/steering/llm/boot.md`](docs/steering/llm/boot.md) |
| Architecture / owner boundaries / runtime contracts | [`docs/steering/llm/architecture.md`](docs/steering/llm/architecture.md) |
| Test policy / regression / harness rules | [`docs/steering/llm/testing.md`](docs/steering/llm/testing.md) |
| Lint, style, naming policy | [`docs/steering/llm/style.md`](docs/steering/llm/style.md) |
| Roadmap, scope, governance | [`docs/steering/llm/governance.md`](docs/steering/llm/governance.md) |
| Detailed AGPL feature scope and sequence | [`docs/steering/agpl-feature-map.md`](docs/steering/agpl-feature-map.md) — direct-load when changing scope or resolving a `roadmapRow` |
| Optional early-stage planning | [`solve/epics/`](solve/epics/) — bounded decision memos only when unresolved cross-Quest options need durable discussion |
| Cross-layer planning trace | `node scripts/solve.js trace --row\|--cl\|--spec\|--quest <id>` (joins quests via their `links` block) |
| Rule IDs and source citations | `npm run rule -- --id <ID>` (also `--tag`/`--domain`/free-text); browse [`docs/steering/llm/rules-index.md`](docs/steering/llm/rules-index.md). `rules.json` is generator output, too large to Read whole. |
| Architecture document tree | [`architecture/INDEX.md`](architecture/INDEX.md) |
| An npm tool for a task (before any ad-hoc command) | `npm run commands` (curated quickstart) or [`docs/steering/llm/tools-index.md`](docs/steering/llm/tools-index.md) (generated full index of every script) |
| Attack checklists for adversarial verification (by change category) | [`docs/steering/verification-templates/`](docs/steering/verification-templates/INDEX.md) |

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
in-repo-steering vs external-memory split and
[`docs/steering/audience-boundary.md`](docs/steering/audience-boundary.md) for
the human/development/agent documentation zones.

## Steering Load Order

1. Read this file (`AGENTS.md`).
2. Read [`docs/steering/llm/core.md`](docs/steering/llm/core.md).
3. Read [`docs/steering/llm/boot.md`](docs/steering/llm/boot.md).
4. Load the smallest relevant domain pack(s): architecture, testing, style, or
   governance. Cross-cutting work loads each relevant pack, not just one.
5. Follow `boot.md` for the first executable action; let the Solver own Quest
   attempts, findings, verification, and terminal handoff. Reports are optional
   on-demand projections of that durable state.
6. Consult source steering under [`docs/steering/`](docs/steering/) only for
   cited detail behind a compact-pack rule, or when repairing pack drift and
   regenerating the packs.

The four generated domain packs under [`docs/steering/llm/`](docs/steering/llm/)
are complete selective surfaces: load only the relevant domains, knowing every
packed rule for that domain is present. The pack manifest assigns every configured
source an explicit `packed`, `direct-load`, or `reference-only` role. Source
steering adds cited detail; it is not a separate runtime override path.

## Generated Surfaces

The generated full command reference is
[`solve-commands.md`](docs/steering/llm/solve-commands.md). Run
`npm run steering:llm:pack` after editing a configured steering source; the
generator checks source roles, complete domain coverage, and command drift.
