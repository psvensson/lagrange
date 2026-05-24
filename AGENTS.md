# AGENTS

Welcome, developer or AI agent. This repository operates under a strict, validated workflow driven by automated tools and rules.

This file is the **single entry point** for steering. It is the only document that prescribes a load order. All other steering files describe their own scope; none of them re-declare the boot sequence.

## Where Do I Look?

| If you need… | Read |
| --- | --- |
| Current task / active blocker / owner / scope | Run `npm run work:context` |
| Process, lanes, validator phases, proof rules | [`work/RULES.md`](work/RULES.md) |
| Always-active core operating contract (must-not + rules) | [`.kiro/steering/llm/core.md`](.kiro/steering/llm/core.md) |
| Lane vocabulary aliases and per-lane first commands | [`.kiro/steering/llm/boot.md`](.kiro/steering/llm/boot.md) |
| Architecture / owner boundaries / runtime contracts | [`.kiro/steering/llm/architecture.md`](.kiro/steering/llm/architecture.md) |
| Test policy / regression / harness rules | [`.kiro/steering/llm/testing.md`](.kiro/steering/llm/testing.md) |
| Lint, style, naming policy | [`.kiro/steering/llm/style.md`](.kiro/steering/llm/style.md) |
| Roadmap, scope, governance | [`.kiro/steering/llm/governance.md`](.kiro/steering/llm/governance.md) |
| Rule IDs and source citations | [`.kiro/steering/llm/rules.json`](.kiro/steering/llm/rules.json) |
| Architecture document tree | [`architecture/INDEX.md`](architecture/INDEX.md) |

## Steering Load Order

1. Read this file (`AGENTS.md`).
2. Run `npm run work:context` for any non-trivial task. It names the active blocker, owner, primary domain pack, and active constraints.
3. Read [`.kiro/steering/llm/core.md`](.kiro/steering/llm/core.md) — always-load operating contract and must-not checklist.
4. Read [`.kiro/steering/llm/boot.md`](.kiro/steering/llm/boot.md) — lane vocabulary and per-lane first commands.
5. Load the primary domain pack named by `work:context` (architecture, testing, style, or governance).
6. Consult source steering under [`.kiro/steering/`](.kiro/steering/) only when a compact pack identifies which detailed policy matters, or when rule IDs are needed (use `rules.json`).

For the canonical rules of process, lanes, validators, proof, scope, and worktree safety, see [`work/RULES.md`](work/RULES.md). Steering files under `.kiro/steering/` add domain detail; they never weaken `work/RULES.md`.

## Workflow Tooling

Prefer these canonical tools before raw JSON, log slicing, or ad-hoc queries:

* **Handoff & Context**: `npm run work:context`
* **Command Index**: `npm run work:help`
* **Detailed Context**: `npm run work:llm-start`
* **Validation**: `npm run work:validate -- --entry|--pre-impl|--closure`
* **Repair**: `npm run work:repair`
* **Evidence Extractor**: `npm run work:evidence-summary -- <artifact>`
* **Steering Pack Refresh**: `npm run steering:llm:pack` (after editing `.kiro/steering/*.md` sources)

## Package Ceremony

Ensure your active package in `work/packages/` complies with validator rules. Use the lightest valid lane defined in [`work/RULES.md`](work/RULES.md#lane-definitions) and execute closure atomically (renaming to `done-*`, updating `current-blocker`, running validations, committing, and pushing together).
