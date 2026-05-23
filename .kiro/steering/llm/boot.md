# LLM Boot Contract

Use this file after `AGENTS.md` and `.kiro/steering/llm/README.md`. It resolves
steering precedence, load order, lane vocabulary, and first commands for LLM
agents.

## Authority Order

1. User and developer instructions define the requested task and safety limits.
2. `npm run work:context` defines the current active blocker, primary steering
   pack, owner boundary, and dirty-scope warning.
3. `work/RULES.md` is the workflow and coding-rule canon for lanes, validation
   phases, proof, scope, and worktree safety.
4. Source steering files under `.kiro/steering/` provide detailed domain policy.
   They can add detail, but they do not weaken `work/RULES.md`.
5. `.kiro/steering/llm/*.md` files are compact prompt packs. Use them to keep
   rules active in memory, then consult `rules.json` only when rule IDs or
   source citations are needed.
6. Generated domain packs are not sequential checklists. Apply only the rules
   relevant to the selected lane and touched boundary.

## Load Order

1. Read `AGENTS.md`, `.kiro/steering/llm/README.md`, and this boot contract.
2. Run `npm run work:context` for all non-trivial work.
3. Load `.kiro/steering/llm/core.md`.
4. Load the primary domain pack named by `work:context`.
5. Add secondary packs only when the task needs them:
   - `architecture.md`: runtime, control-plane, bootstrap, join, recovery,
     rebalance, lifecycle, owner-boundary, or shared-contract work.
   - `testing.md`: new tests, bug regressions, validation policy, harness work,
     release-gate proof, or affected-consumer proof.
   - `style.md`: lint, formatting, naming, scalar, or file-size policy.
   - `governance.md`: roadmap scope, package/sprint state, edition boundaries,
     route selection, or work-tracker truth.
6. Use source steering detail only for the touched boundary after the compact
   packs identify which detailed policy matters.

## Lane Vocabulary

| Canonical lane | Accepted aliases | Use when |
| --- | --- | --- |
| `read-doc` | `read-review-doc-only` | Answering, review, explanatory docs, or no implementation truth change. |
| `maintenance` | `mechanical-maintenance`, `lightweight-maintenance` | Bounded docs, templates, package metadata, generated steering, or tooling cleanup. |
| `proof` | `test-only-proof`, `diagnostic-classification` | Tests, validation evidence, or diagnostic classification change without runtime behavior change. |
| `experiment` | `bounded-experiment`, `fast-spike` | A bounded hypothesis or probe decides the next owner/action. |
| `runtime` | `single-file-runtime`, `runtime-owner-boundary` | Runtime behavior, owner contracts, shared metadata, diagnostics grammar, or affected consumers can change. |
| `scenario` | `scenario-release-gate`, `causal-escalation` | Distributed, integration, load, release-gate, repeated same-frontier, or causal-closure work. |

Use `npm run work:lane-picker -- --docs-only|--maintenance|--tests-only|--experiment|--runtime|--scenario`
when the lane is not obvious.

## Per-Lane First Commands

### `read-doc`

1. `npm run work:context`
2. Read `core.md` and the smallest relevant domain pack.
3. No package is required unless implementation truth, roadmap status, or
   architecture ownership changes.
4. For edits, run `git diff --check -- <files>`.

### `maintenance`

1. `npm run work:context`
2. `npm run work:package:new -- --lane lightweight-maintenance ...` when the
   change alters workflow, package truth, generated steering, or durable docs.
3. `npm run work:validate -- --entry <package>`
4. `npm run work:validate -- --pre-impl <package>`
5. Run the focused generator, script, or doc proof.
6. Run `git diff --check -- <files>`.

### `proof`

1. `npm run work:context`
2. Use the active package validation surface or create a `test-only-proof`
   package if no active package owns the proof.
3. Run the focused test/probe before broad suites.
4. Run `npm run work:validate -- --closure <package>` before closing.

### `runtime`

1. `npm run work:context`
2. `npm run work:llm-start`
3. Load `architecture.md` and `testing.md`.
4. Ensure the package has a Core Logic Brief, exact write scope, proof ladder,
   static guardrail plan, and affected-consumer proof.
5. Run `npm run work:validate -- --pre-impl <package>` before runtime edits.
6. Use implementation plus verifier-fixer evidence before closure.

### `scenario`

1. `npm run work:context`
2. `npm run work:llm-start`
3. Start from canonical evidence tools such as `work:evidence-summary`,
   `work:scenario-route`, or the focused extractor for the failure class.
4. Load `governance.md`, `architecture.md`, and `testing.md`.
5. Keep the Current Edge Card, causal closure fields, selected owner boundary,
   and stop mode in view.
6. Prove the missing edge or fixture before broad representative reruns.
7. Use separate verifier-fixer evidence before closure.

## Conflict Rule

If two steering files appear to disagree, do not average them. Follow this
order:

1. Current user/developer instructions.
2. `work:context` current state and active package metadata.
3. `work/RULES.md` for process and coding constraints.
4. Source steering detail for the relevant domain.
5. LLM pack summaries and `rules.json` IDs.

Record the conflict in the package if it changes scope, lane, proof, or stop
conditions.
