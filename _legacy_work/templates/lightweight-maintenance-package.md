# Title

<!-- work-package
{
  "schema": "work-package-v2",
  "intent": {
    "lane": "lightweight-maintenance",
    "scenario": "none",
    "artifact": "none",
    "playback": "none",
    "owner": "workflow_or_tooling_owner",
    "boundary": "focused_maintenance_boundary",
    "dominantReason": "maintenance_cleanup",
    "currentState": "one-line current state",
    "nextAction": "focused edit and validation"
  },
  "scope": {
    "writeScope": [
      "path/to/file"
    ],
    "handoffFiles": [],
    "generatedFiles": [],
    "candidateRuntimeFiles": []
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "why this maintenance slice is highest leverage now"
  },
  "modelFit": {
    "packageClass": "bounded-implementation",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "leaf-slice",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [],
    "proof": [
      "regression: focused script or test",
      "supporting: git diff --check -- <files>"
    ]
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

- In: one bounded tooling, template, test, or package-truth slice.
- Out: runtime ownership, shared contracts, representative scenario routing.

## Validation

1. Focused script or test:
2. `git diff --check -- <files>`

## Execution Evidence
- [ ] action: implementation; owner: <owner>; files-changed: <paths>; validation: <command/result>; outcome: <validated|blocked>.
