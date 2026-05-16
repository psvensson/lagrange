# Topology Sprint Handoff Hygiene

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-16",
  "lane": "lightweight-maintenance",
  "scenario": "none",
  "artifact": "none",
  "playback": "none",
  "owner": "workflow_tooling_owner",
  "boundary": "sprint_handoff_integrity",
  "dominantReason": "stale_handoff_and_dirty_scope_risk",
  "currentState": "Recent topology work carried stale current-blocker scope fields, large dirty scope, and sprint/package text that could lag canonical extractor output. This maintenance package makes tracker state mechanically trustworthy before the next runtime package activates.",
  "nextAction": "Make tracker state, scope fields, and dirty-scope separation mechanically verifiable before the next topology runtime package activates.",
  "proof": [
    "npm run work:current-blocker -- --write",
    "npm run work:validate -- --pre-impl",
    "npm run work:dirty-scope",
    "git diff --check -- work/sprints/current-blocker.md work/sprints/current-blocker.json work/tracks/topology-convergence.md"
  ],
  "writeScope": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/tracks/topology-convergence.md",
    "work/sprints/active-2026-q2-topology-convergence-systems-pattern-hardening.md",
    "work/sprints/todo-2026-q2-topology-convergence-systems-pattern-hardening.md",
    "work/packages/active-20260516-topology-sprint-handoff-hygiene.md",
    "work/packages/todo-20260516-topology-sprint-handoff-hygiene.md"
  ],
  "handoffFiles": [
    "work/sprints/done-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/packages/done-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-remaining-targets.md"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/tracks/topology-convergence.md",
    "work/sprints/active-2026-q2-topology-convergence-systems-pattern-hardening.md",
    "work/sprints/todo-2026-q2-topology-convergence-systems-pattern-hardening.md",
    "work/packages/active-20260516-topology-sprint-handoff-hygiene.md",
    "work/packages/todo-20260516-topology-sprint-handoff-hygiene.md"
  ],
  "modelFit": {
    "packageClass": "bounded-implementation",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "leaf-slice",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond tracker handoff/status files",
      "a frozen decision must be reopened"
    ]
  }
}
-->

## Why

The topology release gate has been moving between close owner boundaries. That
is manageable only if the handoff files are exact. This package is a small
workflow slice that removes ambiguity before the next runtime package starts:
current blocker files must be regenerated, extractor output must match sprint
text, and dirty scope must be separable into one focused package commit.

## Scope Basis

Approved workflow maintenance under `work/README.md` and the topology track.
No runtime behavior changes are allowed.

## Workflow Lane

- Selected lane: `lightweight-maintenance`
- Why this lane is sufficient: only tracker state, handoff text, and dirty
  scope reporting may change.
- Escalation trigger to a heavier lane: any proposed runtime, test behavior, or
  scenario classification change.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. Run `npm run work:current-blocker -- --write` after the current active
   package records its final artifact.
2. Run `npm run work:validate -- --pre-impl` and fix stale scope fields,
   missing metadata, or invalid package status.
3. Run `npm run work:dirty-scope`; record package-owned, tracker-generated,
   and unrelated dirty files in the active handoff.
4. Reconcile sprint and track text with canonical extractors when counts,
   owner boundary, or next action drift.
5. Split or defer unrelated dirty entries before any focused package commit.

## Out Of Scope

1. Runtime ownership changes.
2. Representative reruns.
3. Changing package lane, owner, or boundary without package doctor guidance.

## Borrowed Pattern Hook

- FoundationDB pattern: proof precedes action. Local analogue: a package cannot
  move from handoff to runtime edit while `work:validate` or dirty-scope
  separation is red.
- TiKV/PD pattern: operators have explicit status. Local analogue: each package
  records whether it is pending, active, migrated, reduced, or closed only in
  the package filename and metadata, not in side narratives.

## Acceptance

1. `work:validate -- --pre-impl` is green for the active package.
2. `work:dirty-scope` shows unrelated dirty files are excluded from the next
   focused package commit.
3. `work/sprints/current-blocker.md` and `.json` match the latest active
   package metadata.
4. Any mismatch between canonical extractor counts and sprint prose is resolved
   in favor of extractor output.

## Model Fit

- Package class: `bounded-implementation`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Output profile: `medium`
- Owned files: `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/tracks/topology-convergence.md`, the systems-pattern sprint status rename files, and this package's status rename files.
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond tracker handoff/status files, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:current-blocker -- --write`, `npm run work:validate -- --pre-impl`, `npm run work:dirty-scope`, `git diff --check -- work/sprints/current-blocker.md work/sprints/current-blocker.json work/tracks/topology-convergence.md`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:current-blocker -- --write
2. npm run work:validate -- --pre-impl
3. npm run work:dirty-scope
4. git diff --check -- work/sprints/current-blocker.md work/sprints/current-blocker.json work/tracks/topology-convergence.md
