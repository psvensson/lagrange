# Title

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "todo",
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
  "stabilityCredit": "local-proof-only",
  "whyHighestLeverageNow": "why this maintenance slice is highest leverage now",
  "proof": ["focused script or test", "git diff --check -- <files>"],
  "theoryLedgerRefs": [],
  "writeScope": ["path/to/file"],
  "handoffFiles": [],
  "generatedFiles": [],
  "candidateRuntimeFiles": [],
  "commitScope": ["path/to/file", "work/packages/done-YYYYMMDD-slug.md"]
}
-->

## Scope

- In: one bounded tooling, template, test, or package-truth slice.
- Out: runtime ownership, shared contracts, representative scenario routing.

## Validation

1. Focused script or test:
2. `git diff --check -- <files>`

## Execution Evidence
- [ ] action: implementation; owner: <owner>; files-changed: <paths>; validation: <command/result>; outcome: <validated|blocked>.
