---
scope: governance
status: canonical
always_load: false
source_of_truth: self
compiled_pack: .kiro/steering/llm/governance.md
parent_index: ../workflow-guidelines/INDEX.md
last_reviewed: 2026-05-23
---

> **Canonical source.** Workflow lanes, lane requirements, sprint entry & width limits, lifecycle progress grammar. Index: [`INDEX.md`](INDEX.md).

# Workflow — Lanes & Lifecycle

## Workflow Lanes

Choose the lightest lane that protects the current boundary.

| Lane | Use For | Required Proof | May Omit |
| --- | --- | --- | --- |
| Read/review/doc-only | Questions, reviews, explanatory docs, typo fixes, generated steering pack refreshes | clear answer or focused doc diff; `git diff --check` for edits | work package, sub-agents, causal ledger, representative rerun |
| Lightweight maintenance | Small tooling, docs-as-process, templates, low-risk internal cleanup | focused test or script plus `git diff --check`; package only when tracker truth changes | causal ledger, scenario rerun, sub-agent ledger unless package declares it |
| Runtime owner-boundary | Runtime/control-plane/shared contract changes | active package, owner contract, guardrail preflight/closure, focused owner tests, affected consumers | representative scenario only when no scenario drove the work |
| Scenario/release-gate | Distributed, integration, load, or release-gate blockers | active package, sequential sub-agents, causal closure ledger, missing-edge probe, representative proof | none of the scenario ledger fields |
| Causal escalation | Repeated scenario failures after local reductions or classification | causal-analysis package with phase model, causal graph, timeout/budget review, invariant review, taxonomy, stop conditions | runtime patch unless the analysis explicitly authorizes it |

Lane selection rules:

1. Prefer read/review/doc-only for analysis that does not change implementation
   truth.
2. Prefer lightweight maintenance for process, template, or tooling cleanup
   that cannot change runtime behavior.
3. Escalate to runtime owner-boundary when the change can alter ownership,
   shared contracts, guardrails, runtime behavior, or affected consumers.
4. Escalate to scenario/release-gate when the work is driven by a failing
   representative artifact or must prove what that scenario does next.
5. Escalate to causal analysis when repeated local fixes or classifications do
   not make the representative gate pass.
6. Escalate to causal analysis when the representative frontier returns to a
   recently closed related owner boundary or alternates between two related
   owner boundaries.
7. When lane choice is ambiguous, record why the lighter lane is sufficient or
   use the heavier lane.

## Lane Requirements

### Read/Review/Doc-Only Lane

Use the read/review/doc-only lane when the task does not change runtime code,
package status, roadmap truth, architecture owner maps, or validation
obligations.

Required:

1. Load enough steering context to answer accurately.
2. Keep edits focused on explanatory or generated documentation.
3. Run `git diff --check` for file edits.

Not required unless the task changes implementation truth:

- active work package
- sub-agent sequencing ledger
- static drift ledger
- causal closure ledger
- representative scenario proof

### Lightweight Maintenance Lane

Use the lightweight maintenance lane for small internal docs, workflow,
template, and tooling changes that do not change runtime ownership or shared
runtime contracts.

Required:

1. Name the focused maintenance concern.
2. Keep the diff confined to that concern.
3. Run the focused script or test for any changed tooling.
4. Run `git diff --check`.
5. Use a package only when work-tracker truth or package templates require a
   durable execution record.

May omit:

- scenario causal closure ledger
- representative rerun
- sub-agent sequencing, unless the work package declares the runtime/scenario
  lane or the user explicitly requires it

## LLM Sprint Entry And Width Limits

LLM-driven sprint work keeps architectural width small.

Required workflow:

1. Run `npm run work:context` before non-trivial package implementation.
2. Use `npm run work:llm-start` when the next step needs a fuller startup
   bundle with package doctor suggestions, dirty scope, model-ledger summary,
   and representative evidence summary.
3. Use the handoff's current blocker, first files, proof ladder, commands, and
   dirty-worktree summary as the starting point.
4. Keep one representative gate per sprint and at most one package owning the
   current representative re-entry gate.
5. Keep one primary owner and boundary per active scenario-driven package.
6. Split work when guardrail cleanup, runtime behavior, presentation, or
   roadmap truth repair are separate boundaries.
7. After two material blocker migrations inside one package, close the gate or
   split a contraction package around the current owner contract.
8. Broad representative reruns are acceptance proof only after owner fixtures,
   focused owner tests, and affected presentation tests are green.
9. Frontier oscillation across related packages starts from a causal-escalation
   package, not another local owner-boundary runtime patch.

## Lifecycle Progress Grammar

Packages touching startup, join, rejoin, readiness, admission, recovery,
convergence, rebalancing, or other lifecycle progression declare a progress
grammar.

Required fields:

1. canonical state or outcome vocabulary
2. meaning of blocked, deferred, retryable, terminal, and ready states
3. blocker or reason-code vocabulary
4. evidence precedence when storage, cache, transport, and runtime witnesses
   disagree
5. explicit axes when the concern has more than one dimension

Diagnostics, admin, harness, and reporting surfaces reuse the grammar or
declare a bounded view role. If readers still infer progress from existence,
local booleans, or logs after the package lands, the package is not done.
