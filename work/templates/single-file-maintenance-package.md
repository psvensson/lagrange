# Title

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "todo",
  "intent": {
    "opened": "YYYY-MM-DD",
    "lane": "mechanical-maintenance",
    "scenario": "none",
    "artifact": "none",
    "playback": "none",
    "owner": "workflow_or_tooling_owner",
    "boundary": "single_file_boundary",
    "dominantReason": "single_file_maintenance",
    "currentState": "one-line current state",
    "nextAction": "make the named file change and validate"
  },
  "scope": {
    "writeScope": ["path/to/file"],
    "handoffFiles": [],
    "generatedFiles": [],
    "candidateRuntimeFiles": [],
    "commitScope": ["path/to/file", "work/packages/done-YYYYMMDD-slug.md"]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "why this one-file edit is the highest-leverage cleanup"
  },
  "modelFit": {
    "packageClass": "mechanical-maintenance",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "leaf-slice",
    "outputProfile": "small",
    "ambiguityScore": 1,
    "escalationTriggers": ["scope expands beyond one named file"]
  },
  "execution": {
    "theoryLedgerRefs": [],
    "proof": {
      "commands": ["focused command", "git diff --check -- <file>"]
    }
  },
  "closureSummary": {
    "resultClassification": "pending-before-probe",
    "predictionAccuracy": "pending-before-observation",
    "observedMovement": "pending closure",
    "successorReason": "pending closure",
    "nextOwnerBoundary": "pending closure",
    "evidenceArtifact": "pending closure"
  }
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
