# Title

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "todo",
  "opened": "YYYY-MM-DD",
  "lane": "read-review-doc-only",
  "scenario": "none",
  "artifact": "none",
  "playback": "none",
  "owner": "docs_or_governance_owner",
  "boundary": "doc_boundary",
  "dominantReason": "doc_truth_update",
  "currentState": "one-line current state",
  "nextAction": "edit docs and validate diff",
  "stabilityCredit": "local-proof-only",
  "whyHighestLeverageNow": "why this doc update is the highest-leverage truth repair",
  "proof": ["git diff --check -- <files>"],
  "theoryLedgerRefs": [],
  "writeScope": ["path/to/doc.md"],
  "handoffFiles": [],
  "generatedFiles": [],
  "candidateRuntimeFiles": [],
  "commitScope": ["path/to/doc.md", "work/packages/done-YYYYMMDD-slug.md"],
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
