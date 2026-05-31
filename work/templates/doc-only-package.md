# Title

<!-- work-package
{
  "schema": "work-package-v2",
  "intent": {
    "lane": "read-review-doc-only",
    "scenario": "none",
    "artifact": "none",
    "playback": "none",
    "owner": "docs_or_governance_owner",
    "boundary": "doc_boundary",
    "dominantReason": "doc_truth_update",
    "currentState": "one-line current state",
    "nextAction": "edit docs and validate diff"
  },
  "scope": {
    "writeScope": ["path/to/doc.md"],
    "handoffFiles": [],
    "generatedFiles": [],
    "candidateRuntimeFiles": []
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "why this doc update is the highest-leverage truth repair"
  },
  "modelFit": {
    "packageClass": "documentation-only",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "leaf-slice",
    "outputProfile": "small",
    "ambiguityScore": 1,
    "escalationTriggers": ["doc edit changes runtime ownership or scope"]
  },
  "execution": {
    "theoryLedgerRefs": [],
    "proof": {
      "commands": ["git diff --check -- <files>"]
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

- In: doc truth, links, spelling, or package prose.
- Out: runtime, tests, scripts, roadmap status, and owner decisions.

## Validation

1. `git diff --check -- <files>`

## Execution Evidence

- [ ] action: implementation; owner: <owner>; files-changed: <paths>; validation: <command/result>; outcome: <validated|blocked>.
