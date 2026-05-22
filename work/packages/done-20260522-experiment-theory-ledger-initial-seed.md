# Experiment Theory Ledger Initial Seed

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-22",
  "lane": "diagnostic-classification",
  "scenario": "none",
  "artifact": "none",
  "playback": "none",
  "owner": "workflow_tooling_owner",
  "boundary": "experiment_theory_seed_memory",
  "dominantReason": "current_frontier_history_needs_indexing",
  "currentState": "Initial seed entries are implemented in the current worktree, with conservative statuses, supersession links, package/artifact citations, and focused ledger validation green.",
  "nextAction": "Formally close this package or preserve it as implemented evidence during the focused commit/closure decision; update entries only when new package or representative evidence changes them.",
  "theoryLedgerRefs": [
    "theory-20260522-experiment-theory-memory",
    "theory-20260522-node-failure-acceptance-hardening",
    "theory-20260522-snapshot-watch-handoff-contract"
  ],
  "stabilityCredit": "instrumentation-only",
  "whyHighestLeverageNow": "This advances the sprint goal of representative stability by indexing current frontier theories after the ledger tooling exists, without inventing historical proof.",
  "proof": [
    "npm run work:context",
    "npm run work:theory-ledger -- validate",
    "git diff --check -- work/theory-ledger.md work/packages/done-20260522-experiment-theory-ledger-initial-seed.md"
  ],
  "writeScope": [
    "work/theory-ledger.md"
  ],
  "handoffFiles": [],
  "generatedFiles": [],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "work/theory-ledger.md",
    "work/packages/done-20260522-experiment-theory-ledger-initial-seed.md"
  ],
  "modelFit": {
    "packageClass": "diagnostic-classification",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "diagnostic-owner-evidence/current-artifact",
    "outputProfile": "small",
    "ambiguityScore": 2,
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "modelFitSplit": {
    "targetExecutionModel": "gpt-5.3-codex",
    "allowedDecisionDepth": "bounded local edit after owner, scope, proof, and forbidden files are named",
    "safeToExecuteWhen": [
      "owner, boundary, write scope, forbidden scope, proof, and kill rule stay as declared",
      "the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence",
      "the first focused proof gives a clear pass, fail, or escalate signal"
    ],
    "splitTriggers": [
      "write scope expands beyond the declared lower-model lane",
      "proof requires forbidden scope, cross-owner reasoning, or architecture route selection",
      "the implementation needs to decide system behavior instead of executing a named local mechanism"
    ],
    "childPackageCandidates": [
      "Prefer mechanical-maintenance for docs/templates/schema-only edits.",
      "Prefer test-only-proof for tests that do not change runtime behavior.",
      "Prefer bounded-experiment for one same-owner hypothesis with inherited context."
    ]
  },
  "classificationEfficiency": {
    "defaultMode": "separate-package-approved",
    "separatePackageReason": "successor-selection",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "npm run work:context",
      "npm run work:theory-ledger -- validate",
      "git diff --check -- work/theory-ledger.md work/packages/done-20260522-experiment-theory-ledger-initial-seed.md"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "rerun-representative-evidence",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them. If the representative route is same-frontier with no reduction or an architecture gap, open an autonomous architecture experiment before more local runtime work."
  },
  "representativeResidual": {
    "status": "classification-only",
    "scenario": "node-failure-rebalance",
    "artifact": "test-output/report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Resume the paused typed snapshot/watch handoff contract package after the ledger sequence closes."
  },
  "predecessor": "work/packages/done-20260522-experiment-theory-ledger-tracker-integration.md",
  "closed": "2026-05-22",
  "commitAndPushLedgerRequired": true
}
-->

## Why

An empty ledger is technically correct but not useful. This package owns a
small, evidence-bounded seed so future agents can immediately see the active
theory chain without rereading every package from the last few days.

## Scope Basis

Current sprint focus: universal owner-contract completion and representative
stability. This is diagnostic-classification memory work after the ledger,
tooling, and tracker integration exist.

## Detailed Execution Contract

1. Seed only active/current sprint theories plus immediate predecessor
   outcomes that have package and artifact links.
2. Do not reconstruct old experiments from memory or raw logs.
3. Mark uncertain entries as `needs-rerun` or `stale`; do not overstate them as
   supported.
4. Include supersession links for the recent publication ACK to active-gate
   migration and any current node-failure-rebalance theory if evidence exists.
5. Run `npm run work:context` first and preserve its current blocker as the
   active theory source.
6. Use the ledger tooling for validation before closure.

## Workflow Lane

- Selected lane: `diagnostic-classification`
- Why this lane is sufficient: bounded workflow/tooling scope unless changed.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Status: `not-needed` - no runtime, scenario, or shared contract decision changes.





## Expected Representative Delta

- Baseline artifact: `none`
- Expected delta: The ledger contains a small current-sprint seed with evidence links, conservative statuses, and no invented historical proof.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `none`
- Route owner: `workflow_tooling_owner`
- Route boundary: `experiment_theory_seed_memory`
- Route dominant reason: `current_frontier_history_needs_indexing`
- Route causal outcome: `pending-before-rerun`
- Stop mode: `pending-before-rerun`
- Next lane: `diagnostic-classification`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, and pre-implementation validation.

## Classification Efficiency

- Default mode: `separate-package-approved`
- Separate package reason: `successor-selection`
- Evidence budget: `one-artifact`; `two-or-three-canonical-commands`
- Decision record: Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.
- Successor action: `rerun-representative-evidence`
- Runtime promotion rule: When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them. If the representative route is same-frontier with no reduction or an architecture gap, open an autonomous architecture experiment before more local runtime work.

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

1. work/theory-ledger.md

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `diagnostic-classification`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `diagnostic-owner-evidence/current-artifact`
- Output profile: `small`
- Owned files: `work/theory-ledger.md`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:context`, `npm run work:theory-ledger -- validate`, `git diff --check -- work/theory-ledger.md work/packages/done-20260522-experiment-theory-ledger-initial-seed.md`
- Model ledger advisory: `escalate`

## Model-Fit Split

- Target executor: `gpt-5.3-codex`
- Allowed decision depth: bounded local edit after owner, scope, proof, and forbidden files are named
- Safe to execute when:
1. owner, boundary, write scope, forbidden scope, proof, and kill rule stay as declared
2. the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence
3. the first focused proof gives a clear pass, fail, or escalate signal
- Split or escalate when:
1. write scope expands beyond the declared lower-model lane
2. proof requires forbidden scope, cross-owner reasoning, or architecture route selection
3. the implementation needs to decide system behavior instead of executing a named local mechanism
- Candidate lower-model child packages:
1. Prefer mechanical-maintenance for docs/templates/schema-only edits.
2. Prefer test-only-proof for tests that do not change runtime behavior.
3. Prefer bounded-experiment for one same-owner hypothesis with inherited context.

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use legacy subagent ledgers only when a reopened historical package already uses them.

- [x] implementation: status: validated; evidence: seeded four entries in `work/theory-ledger.md` and wired `theoryLedgerRefs` into ledger and paused runtime packages; ran `npm run work:context`, `npm run work:theory-ledger -- validate`, and `git diff --check -- work/theory-ledger.md work/packages/done-20260522-experiment-theory-ledger-initial-seed.md`; parent revalidated focused proof: yes; next: verification.
- [x] verification-fix: status: validated; evidence: Curie verifier-fixer found no blocking issues and reran `npm run work:theory-ledger -- validate`, targeted ledger tests, and five-package pre-impl validation successfully; changed files: none; parent revalidated focused proof: yes; next: closure decision.
- [x] repair: status: validated; evidence: `npm run work:repair` refreshed generated current-blocker and Current Edge Card after ledger refs landed; parent revalidated focused proof: yes; next: validation.

## Validation

1. npm run work:context
2. npm run work:theory-ledger -- validate
3. git diff --check -- work/theory-ledger.md work/packages/done-20260522-experiment-theory-ledger-initial-seed.md

## Commit And Push Ledger

1. Focused package commit: b23a1ab300cc701eeb459ac1eca84bcdcb534107
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
