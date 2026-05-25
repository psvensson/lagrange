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

When sources appear to disagree, follow this order:

1. User and developer instructions define the requested task and safety limits.
2. `npm run work:context` defines the current active blocker, primary steering pack, owner boundary, and dirty-scope warning.
3. [`work/RULES.md`](../../../work/RULES.md) is the canon for lanes, validation phases, proof, scope, and worktree safety.
4. Source steering files under `.kiro/steering/` provide detailed domain policy
   and win over generated compact packs on conflict. This is authority order,
   not default load order. Source steering can add detail; it does not weaken
   `work/RULES.md`.
5. `.kiro/steering/llm/*.md` files are compact prompt packs and the default LLM
   load surface defined by `AGENTS.md`. Use them to keep rules active in
   memory. Consult source steering or `rules.json` when conflict resolution,
   detailed policy, rule IDs, or source citations are needed.
6. Generated domain packs are not sequential checklists. Apply only the rules relevant to the selected lane and touched boundary.

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

Use `npm run work:lane-picker -- --docs-only|--maintenance|--tests-only|--experiment|--runtime|--scenario` when the lane is not obvious.

## Per-Lane First Commands

These are LLM-specific operational steps. Process semantics for each lane live in [`work/RULES.md#lane-definitions`](../../../work/RULES.md#lane-definitions). Two cross-cutting notes apply to every lane below:

* `npm run work:package:new` requires the `--write` flag to actually create a file on disk; without it the template is printed to stdout only.
* Every lane that closes a package MUST finish with the [Closure Recipe](../../../work/RULES.md#closure-recipe) (work:repair → work:validate --closure → rename active→done → focused commit + push). The lane-specific steps below do not repeat those tail steps.

### `read-doc`

1. `npm run work:context`
2. Read `core.md` and the smallest relevant domain pack.
3. No package required unless implementation truth, roadmap status, or architecture ownership changes.
4. For edits, run `git diff --check -- <files>`.

### `maintenance`

1. `npm run work:context`
2. `npm run work:package:new -- --lane lightweight-maintenance ...` when the change alters workflow, package truth, generated steering, or durable docs.
3. `npm run work:validate -- --entry <package>`
4. `npm run work:validate -- --pre-impl <package>`
5. Run the focused generator, script, or doc proof.
6. Run `git diff --check -- <files>`.

### `proof`

1. `npm run work:context`
2. Use the active package validation surface or create a `test-only-proof` package if no active package owns the proof.
3. Run the focused test/probe before broad suites.
4. Run `npm run work:validate -- --closure <package>` before closing.

### `runtime`

1. `npm run work:context`
2. `npm run work:llm-start`
3. Load `architecture.md` and `testing.md`.
4. Ensure the package has a Core Logic Brief, exact write scope, proof ladder, static guardrail plan, and affected-consumer proof.
5. Run `npm run work:validate -- --pre-impl <package>` before runtime edits.
6. Use implementation plus verifier-fixer evidence before closure.

### `scenario`

1. `npm run work:context`
2. `npm run work:llm-start`
3. Start from canonical evidence tools such as `work:evidence-summary`, `work:scenario-route`, or the focused extractor for the failure class.
4. Load `governance.md`, `architecture.md`, and `testing.md`.
5. Keep the Current Edge Card, causal closure fields, selected owner boundary, and stop mode in view.
6. Prove the missing edge or fixture before broad representative reruns.
7. Use separate verifier-fixer evidence before closure.

## Conflict Rule

If two steering files appear to disagree, do not average them. Follow the Authority Order above. Record the conflict in the package if it changes scope, lane, proof, or stop conditions.
