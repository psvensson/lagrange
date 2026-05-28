---
scope: boot
status: manual-pack
always_load: false
source_of_truth: self
canonical_rules: work/RULES.md
last_reviewed: 2026-05-23
---

> **Manual pack — edit here directly.** Load order is owned by [`AGENTS.md`](../../../AGENTS.md). This file covers authority order, lane vocabulary aliases, per-lane first commands, and conflict resolution.

# LLM Boot Contract

## Authority Order

When sources appear to disagree at execution time, follow this three-level order. Lower-numbered authorities always win.

1. **User and developer instructions, and safety limits.** This includes the requested task, the prohibited-actions list, and any explicit user override.
2. **`work/RULES.md` together with `npm run work:context`.** `work/RULES.md` is the canon for lanes, validation phases, proof, scope, and worktree safety. `work:context` names the active blocker, owner boundary, primary domain pack, and active constraints for the current task. These two together define what the current task is and what the rules of engagement are.
3. **Domain packs under `.kiro/steering/llm/*.md`.** Apply only the rules whose tags match the selected lane and whose scope intersects the touched owner boundary. Each rule carries a `(see file:line)` citation; follow that citation only for supporting detail behind the pack rule.

The source-vs-pack distinction is a generator concern, not an execution-time override path. If cited source detail shows the pack is wrong or stale, fix the source and regenerate (`npm run steering:llm:pack`), not selectively prefer source text at runtime. Packs are the canonical LLM execution surface below `work/RULES.md`.

## Lane Vocabulary

Canonical lane definitions and requirements live in [`work/RULES.md#lane-definitions`](../../../work/RULES.md#lane-definitions). The aliases table below exists only so LLM agents recognize accepted synonyms when reading existing packages.

| Canonical lane | Accepted aliases | Use when |
| --- | --- | --- |
| `read-doc` | `read-review-doc-only` | Answering, review, explanatory docs, or no implementation truth change. |
| `maintenance` | `mechanical-maintenance`, `lightweight-maintenance` | Bounded docs, templates, package metadata, generated steering, or tooling cleanup. |
| `proof` | `test-only-proof`, `diagnostic-classification` | Tests, validation evidence, or diagnostic classification change without runtime behavior change. |
| `experiment` | `bounded-experiment`, `fast-spike` | A bounded hypothesis or probe decides the next owner/action. |
| `runtime` | `single-file-runtime`, `runtime-owner-boundary` | Runtime behavior, owner contracts, shared metadata, diagnostics grammar, or affected consumers can change. |
| `scenario` | `scenario-release-gate`, `causal-escalation` | Distributed, integration, load, release-gate, repeated same-frontier, or causal-closure work. |
| `discovery` | `discovery` | Lateral analysis, exploratory scans, or route selection without runtime, test, or script writes. |

Use `npm run work:lane-picker -- --docs-only|--maintenance|--tests-only|--experiment|--runtime|--scenario|--discovery` when the lane is not obvious.

## Per-Lane First Commands

These are LLM-specific operational steps. Process semantics for each lane live in [`work/RULES.md#lane-definitions`](../../../work/RULES.md#lane-definitions). Two cross-cutting notes apply to every lane below:

* `npm run work:package:new` requires the `--write` flag to actually create a file on disk; without it the template is printed to stdout only.
* Every lane that closes a package finishes with the same automated **Closure Tail** documented at the end of this section. The lane blocks below point to that tail so an LLM reading a single lane sees the closure path without manual rename steps.
* Sprint queue mutations (inserting a new package, renumbering, or superseding an entry) follow [Sprint Queue Maintenance](../../../work/RULES.md#sprint-queue-maintenance); the active sprint file then joins that package's commit scope.

### `read-doc`

1. `npm run work:context`
2. Read `core.md` and the smallest relevant domain pack.
3. No package required unless implementation truth, roadmap scope/state, or architecture ownership changes.
4. For edits, run `git diff --check -- <files>`.
5. **If a package was created**, finish with the closure tail (see below).

### `maintenance`

1. `npm run work:context`
2. `npm run work:package:new -- --write --lane lightweight-maintenance ...` when the change alters workflow, package truth, generated steering, or durable docs.
3. `npm run work:validate -- --entry <package>`
4. `npm run work:validate -- --pre-impl <package>`
5. Run the focused generator, script, or doc proof.
6. Run `git diff --check -- <files>`.
7. Finish with the closure tail (see below).

### `proof`

1. `npm run work:context`
2. Use the active package validation surface or create a `test-only-proof` package with `--write` if no active package owns the proof.
3. If a package was created, run `npm run work:validate -- --entry <package>` and `npm run work:validate -- --pre-impl <package>`.
4. Run the focused test/probe before broad suites.
5. Finish with the closure tail (see below).

### `discovery`

1. `npm run work:context`
2. Create or use a `discovery` package only when the route selection changes durable package, sprint, tracker, or ledger truth.
3. Keep `writeScope` restricted to package files, sprint files, and `work/theory-ledger.md`; no runtime, test, or script writes.
4. Record the Discovery Gate discriminator and selected route before promoting implementation work.
5. If a package was created, run `npm run work:validate -- --entry <package>` and finish with the closure tail (see below).

### `runtime`

1. `npm run work:context`
2. `npm run work:llm-start`
3. Load `architecture.md` and `testing.md`.
4. Ensure the package has a Core Logic Brief, exact write scope, proof ladder, static guardrail plan, and affected-consumer proof.
5. Run `npm run work:validate -- --entry <package>`, then `npm run work:validate -- --pre-impl <package>` before runtime edits.
6. Use a new real `freshness-review` subagent before implementation; only checked `decision: fresh` evidence gates runtime edits.
7. Use implementation plus verifier-fixer evidence before closure.
8. Finish with the closure tail (see below).

### `scenario`

1. `npm run work:context`
2. `npm run work:llm-start`
3. Start from canonical evidence tools such as `work:evidence-summary`, `work:scenario-route`, or the focused extractor for the failure class.
4. Load `governance.md`, `architecture.md`, and `testing.md`.
5. Keep the Current Edge Card, causal closure fields, selected owner boundary, and stop mode in view.
6. Run `npm run work:validate -- --entry <package>`, then `npm run work:validate -- --pre-impl <package>` before runtime or scenario edits.
7. Use a new real `freshness-review` subagent before implementation; only checked `decision: fresh` evidence gates runtime or scenario edits.
8. Prove the missing edge or fixture before broad representative reruns.
9. Use separate verifier-fixer evidence before closure.
10. Finish with the closure tail (see below).

### Closure Tail (every lane)

Every lane that closes a package ends with these four steps in order. They are the LLM-facing surface of the canonical [Closure Recipe](../../../work/RULES.md#closure-recipe); follow that recipe for the exact command shapes and evidence grammar.

1. Fill structured `execution.*` metadata or checked `## Execution Evidence` with replayable proof.
2. `npm run work:repair` — refresh generated current-blocker and sprint handoff files before closure.
3. `npm run work:close <package>` — runs closure validation, renames `active-*` or `todo-*` to `done-*`, flips status, rewrites sprint refs, renumbers the sprint queue, refreshes current-blocker state, stages only commit-scope plus tracker-generated handoff files, and creates the focused local close commit.
4. Push the focused close commit with `npm run work:sprint:push -- <git-push-args>` before starting the next package. If `npm run work:sprint:remaining` reports zero packages left after the push, use `npm run work:sprint:advance -- --dry-run` and then `--write` to close the sprint in a separate focused transaction.

## Conflict Rule and Escape Hatch

If two steering files or instructions appear to disagree at execution time, do not average them or compromise. Follow the three-level Authority Order above: **User Instructions and Safety Limits (Level 1)** always outrank **`work/RULES.md` + `work:context` (Level 2)**, which outrank **Domain Packs (Level 3)**.

When a Level 1 user instruction explicitly overrides or contradicts a Level 2 or Level 3 constraint:
1. **Document the Contradiction:** You MUST record the exact contradiction and override in the active package under a dedicated `## Override Log` section.
2. **Escalate/Confirm Safety Limits:** If the override weakens core safety bounds (e.g. bypassing validators, deleting/disabling guardrails, or modifying frozen decisions), you MUST explicitly ask the user for confirmation in the chat before executing the action.
3. **Domain Pack Fix:** If a domain pack rule itself is outdated or incorrect, the canonical path is to edit its source file under `.kiro/steering/` and run `npm run steering:llm:pack` to regenerate the pack. Do not silently bypass or drift from rules.
