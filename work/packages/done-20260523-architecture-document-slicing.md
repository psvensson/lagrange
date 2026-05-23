# Architecture Document Slicing

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-23",
    "closed": "2026-05-23",
    "lane": "mechanical-maintenance",
    "scenario": "none",
    "artifact": "none",
    "playback": "none",
    "owner": "steering_governance_owner",
    "boundary": "architecture_index",
    "currentState": "New package scaffolded from the shared work-package schema.",
    "nextAction": "Slice root architecture document into under-500-line domain files, add architecture/INDEX.md, and update steering entrypoint pointers.",
    "dominantReason": "architecture_surface_too_large"
  },
  "scope": {
    "writeScope": [
      "architecture.md",
      "architecture/INDEX.md",
      "architecture/README.md",
      "architecture/overview.md",
      "architecture/runtime-lifecycle.md",
      "architecture/control-plane.md",
      "architecture/runtime-components.md",
      "architecture/postgres-wire.md",
      "architecture/query-runtime.md",
      "architecture/bootstrap.md",
      "architecture/rebalance.md",
      "architecture/archived-patterns.md",
      "scripts/check-architecture-slices.js",
      "test/scripts/check-architecture-slices.test.js",
      "package.json",
      "AGENTS.md",
      ".kiro/steering/llm/README.md",
      ".kiro/steering/architecture.md"
    ],
    "handoffFiles": [],
    "generatedFiles": [],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "architecture.md",
      "architecture/INDEX.md",
      "architecture/README.md",
      "architecture/overview.md",
      "architecture/runtime-lifecycle.md",
      "architecture/control-plane.md",
      "architecture/runtime-components.md",
      "architecture/postgres-wire.md",
      "architecture/query-runtime.md",
      "architecture/bootstrap.md",
      "architecture/rebalance.md",
      "architecture/archived-patterns.md",
      "scripts/check-architecture-slices.js",
      "test/scripts/check-architecture-slices.test.js",
      "package.json",
      "AGENTS.md",
      ".kiro/steering/llm/README.md",
      ".kiro/steering/architecture.md",
      "work/packages/done-20260523-architecture-document-slicing.md"
    ]
  },
  "gates": {
    "whyHighestLeverageNow": "This package advances the active sprint goal of workflow steering core logic hardening by shrinking the canonical architecture surface before oversized test splitting, making owner-boundary lookup cheaper for both LLM and human reviewers.",
    "stabilityCredit": "local-proof-only"
  },
  "modelFit": {
    "packageClass": "mechanical-maintenance",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "leaf-slice",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [],
    "proof": {
      "commands": [
        "npm run audit:architecture-slices",
        "npm test -- test/scripts/check-architecture-slices.test.js",
        "git diff --check -- architecture.md architecture/INDEX.md architecture/README.md architecture/overview.md architecture/runtime-lifecycle.md architecture/control-plane.md architecture/runtime-components.md architecture/postgres-wire.md architecture/query-runtime.md architecture/bootstrap.md architecture/rebalance.md architecture/archived-patterns.md scripts/check-architecture-slices.js test/scripts/check-architecture-slices.test.js package.json AGENTS.md .kiro/steering/llm/README.md .kiro/steering/architecture.md work/packages/done-20260523-architecture-document-slicing.md"
      ]
    }
  }
}
-->

## Why

State the focused concern and why this package owns it.

## Scope Basis

Approved maintenance scope or roadmap row.

## Workflow Lane

- Selected lane: `mechanical-maintenance`
- Why this lane is sufficient: bounded workflow/tooling scope unless changed.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Status: `not-needed` - no runtime, scenario, or shared contract decision changes.





## Expected Representative Delta

- Baseline artifact: `none`
- Expected delta: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `none`
- Route owner: `steering_governance_owner`
- Route boundary: `architecture_index`
- Route dominant reason: `architecture_surface_too_large`
- Route causal outcome: `pending-before-rerun`
- Stop mode: `pending-before-rerun`
- Next lane: `mechanical-maintenance`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, and pre-implementation validation.

## Classification Efficiency

- Default mode: `inline-gate-default`
- Separate package reason: `not-needed-inline-gate`
- Evidence budget: `one-artifact`; `two-or-three-canonical-commands`
- Decision record: Keep classification inside the package unless route truth changes.
- Successor action: `update-current-package`
- Runtime promotion rule: Stable owner/boundary routes move to runtime-owner-boundary work.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## Workflow Acceleration Contract

1. Use `npm run work:advance -- --check` before adding more package prose; it combines doctor, subagent-next, and entry/pre-implementation validation.
2. Keep the durable proof ladder to 3-5 commands by default: prefer `npm run work:scenario-route -- <artifact>` for representative routing, one focused test or extractor, and validation. Add static guardrails only when implementation files changed.
3. If this package only changes package, sprint, tracker, or ledger files, the next pass must run representative evidence, close as classification-only, open a concrete bug package, or open/select an autonomous architecture experiment. Human gates are only for blocked/contradictory evidence.
4. Once an architecture gate has a selected route, do not open another gate unless fresh canonical evidence contradicts the selected route.
5. For bounded experiments, move quickly inside the inherited owner boundary, but do not merge without the stated focused proof and canonical evidence movement.

## In Scope

1. architecture.md
2. architecture/INDEX.md
3. architecture/README.md
4. architecture/overview.md
5. architecture/runtime-lifecycle.md
6. architecture/control-plane.md
7. architecture/runtime-components.md
8. architecture/postgres-wire.md
9. architecture/query-runtime.md
10. architecture/bootstrap.md
11. architecture/rebalance.md
12. architecture/archived-patterns.md
13. scripts/check-architecture-slices.js
14. test/scripts/check-architecture-slices.test.js
15. package.json
16. AGENTS.md
17. .kiro/steering/llm/README.md
18. .kiro/steering/architecture.md

## Out Of Scope

1. src/
2. test/distributed/
3. test/rebalancer/

## Model Fit

- Package class: `mechanical-maintenance`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Output profile: `medium`
- Owned files: `architecture.md`, `architecture/INDEX.md`, `architecture/README.md`, `architecture/overview.md`, `architecture/runtime-lifecycle.md`, `architecture/control-plane.md`, `architecture/runtime-components.md`, `architecture/postgres-wire.md`, `architecture/query-runtime.md`, `architecture/bootstrap.md`, `architecture/rebalance.md`, `architecture/archived-patterns.md`, `scripts/check-architecture-slices.js`, `test/scripts/check-architecture-slices.test.js`, `package.json`, `AGENTS.md`, `.kiro/steering/llm/README.md`, `.kiro/steering/architecture.md`
- Forbidden files: `src/`, `test/distributed/`, `test/rebalancer/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run audit:architecture-slices`, `npm test -- test/scripts/check-architecture-slices.test.js`, `git diff --check -- architecture.md architecture/INDEX.md architecture/README.md architecture/overview.md architecture/runtime-lifecycle.md architecture/control-plane.md architecture/runtime-components.md architecture/postgres-wire.md architecture/query-runtime.md architecture/bootstrap.md architecture/rebalance.md architecture/archived-patterns.md scripts/check-architecture-slices.js test/scripts/check-architecture-slices.test.js package.json AGENTS.md .kiro/steering/llm/README.md .kiro/steering/architecture.md work/packages/done-20260523-architecture-document-slicing.md`
- Model ledger advisory: `escalate`

## Model-Fit Split

- Target executor: `gpt-5.3-codex-spark`
- Allowed decision depth: mechanical edits only; no behavior or ownership decisions
- Safe to execute when:
1. owner, boundary, write scope, forbidden scope, proof, and kill rule stay as declared
2. the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence
3. the first focused proof gives a clear pass, fail, or escalate signal
- Split or escalate when:
1. write scope expands beyond the declared lower-model lane
2. proof requires forbidden scope, cross-owner reasoning, or architecture route selection
3. the implementation needs to decide system behavior instead of executing a named local mechanism
- Candidate lower-model child packages:
1. Keep docs/templates/schema metadata edits in this Spark-safe package.
2. Split any runtime or test behavior into a separate package before execution.

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use the compact five-field shape for new evidence lines.

- [x] action: implementation; owner: steering_governance_owner; files-changed: architecture.md, architecture/INDEX.md, architecture/README.md, architecture/overview.md, architecture/runtime-lifecycle.md, architecture/control-plane.md, architecture/runtime-components.md, architecture/postgres-wire.md, architecture/query-runtime.md, architecture/bootstrap.md, architecture/rebalance.md, architecture/archived-patterns.md, scripts/check-architecture-slices.js, test/scripts/check-architecture-slices.test.js, package.json, AGENTS.md, .kiro/steering/llm/README.md, .kiro/steering/architecture.md, work/packages/done-20260523-architecture-document-slicing.md; validation: `npm run audit:architecture-slices` pass, `npm test -- test/scripts/check-architecture-slices.test.js` pass 10/10, scoped `git diff --check` pass, parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: steering_governance_owner; files-changed: none; validation: verifier-fixer ran package doctor, pre-impl validation, `npm run audit:architecture-slices`, `npm test -- test/scripts/check-architecture-slices.test.js`, and scoped `git diff --check`, all pass, parent revalidated focused proof: yes; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: none; validation: current package stayed todo until closure; no generated handoff repair required; outcome: not-needed.

## Theory Ledger Update

- no ledger update: package slices documentation and adds a structural checker only, with no runtime theory or representative evidence change.

## Commit And Push Ledger

- Focused package commit: `623b5138d5f9abcdea64cf214cebbe2253f8de86`
- Pushed to: origin/codex/pending-ack-eligibility-filter
- Commit contains only package-owned files/package-status/allowed sprint handoff: yes

## Validation

1. npm run audit:architecture-slices
2. npm test -- test/scripts/check-architecture-slices.test.js
3. git diff --check -- architecture.md architecture/INDEX.md architecture/README.md architecture/overview.md architecture/runtime-lifecycle.md architecture/control-plane.md architecture/runtime-components.md architecture/postgres-wire.md architecture/query-runtime.md architecture/bootstrap.md architecture/rebalance.md architecture/archived-patterns.md scripts/check-architecture-slices.js test/scripts/check-architecture-slices.test.js package.json AGENTS.md .kiro/steering/llm/README.md .kiro/steering/architecture.md work/packages/done-20260523-architecture-document-slicing.md
