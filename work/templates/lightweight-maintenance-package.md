# Title

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "YYYY-MM-DD",
  "lane": "lightweight-maintenance",
  "scenario": "none",
  "artifact": "none",
  "playback": "none",
  "owner": "workflow_or_tooling_owner",
  "boundary": "focused_maintenance_boundary",
  "dominantReason": "maintenance_cleanup",
  "currentState": "one-line current state",
  "nextAction": "focused edit and validation",
  "proof": [
    "focused script or test",
    "git diff --check"
  ],
  "writeScope": [
    "path/to/file"
  ],
  "handoffFiles": [],
  "generatedFiles": [],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "path/to/file",
    "work/packages/active-YYYYMMDD-package.md"
  ],
  "modelFit": {
    "packageClass": "lightweight-maintenance",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "single-boundary-maintenance",
    "escalationTriggers": [
      "runtime ownership changes",
      "shared contract changes",
      "representative scenario evidence changes"
    ]
  }
}
-->

## Why

Describe the focused maintenance concern.

## Lane

- Selected lane: lightweight maintenance
- Why this lane is sufficient:
- Escalate to runtime/scenario lane if:

## Core Logic Brief

- Status: `not-needed` - no runtime, scenario, or shared contract decision changes.

## Scope

In scope:

1. Item

Out of scope:

1. Runtime ownership changes
2. Shared runtime contract changes
3. Representative scenario classification

## Validation

1. Focused script or test:
2. `git diff --check -- <files>`

## Subagent Progress Ledger

Optional for this lane unless the package or user explicitly asks for
subagents. If used, each real subagent appends one checked update after every
completed subtask.

- [ ] Agent <name> (<agent-id>) <role> subtask complete: state; evidence: command/result/files; next: next step or final handoff.

## Closure

- [ ] Focused proof passed.
- [ ] `git diff --check` passed.
- [ ] No runtime owner-boundary or scenario/release-gate obligation was added.
- [ ] Commit and push ledger recorded if this package is closed as `done-...`.
