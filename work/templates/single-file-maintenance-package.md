# Title

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "todo",
  "opened": "YYYY-MM-DD",
  "lane": "mechanical-maintenance",
  "scenario": "none",
  "artifact": "none",
  "playback": "none",
  "owner": "workflow_or_tooling_owner",
  "boundary": "single_file_boundary",
  "dominantReason": "single_file_maintenance",
  "currentState": "one-line current state",
  "nextAction": "make the named file change and validate",
  "stabilityCredit": "local-proof-only",
  "whyHighestLeverageNow": "why this one-file edit is the highest-leverage cleanup",
  "proof": ["focused command", "git diff --check -- <file>"],
  "theoryLedgerRefs": [],
  "writeScope": ["path/to/file"],
  "handoffFiles": [],
  "generatedFiles": [],
  "candidateRuntimeFiles": [],
  "commitScope": ["path/to/file", "work/packages/done-YYYYMMDD-slug.md"]
}
-->

## Scope

- In: one named file plus this package file.
- Out: runtime ownership, shared contracts, and adjacent cleanup.

## Validation

1. Focused command:
2. `git diff --check -- <file>`

## Execution Evidence
- [ ] action: implementation; owner: <owner>; files-changed: <file>; validation: <command/result>; outcome: <validated|blocked>.
