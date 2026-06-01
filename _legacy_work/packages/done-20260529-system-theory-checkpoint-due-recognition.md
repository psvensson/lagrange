# System Theory Checkpoint Due Recognition

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-29",
    "lane": "lightweight-maintenance",
    "scenario": "none",
    "artifact": "none",
    "playback": "none",
    "owner": "workflow_tooling_owner",
    "boundary": "system_theory_checkpoint_gate",
    "dominantReason": "rederive_checkpoint_not_recognized",
    "currentState": "check-due now reports 0 closed packages since the latest closed systemTheory rederive checkpoint instead of 13 same-day closures from the sprint date stamp.",
    "nextAction": "Close this workflow-tooling package, then resume the non-halting sprint from the selected architecture-continuation route.",
    "predecessor": "work/packages/done-20260529-rolling-restart-active-gate-saturation-checkpoint-system-theory-rederive.md",
    "closed": "2026-05-29"
  },
  "scope": {
    "writeScope": [
      "work/packages/active-20260529-system-theory-checkpoint-due-recognition.md",
      "scripts/work-system-theory-rederive.js",
      "test/scripts/work-system-theory-rederive.test.js",
      "work/RULES.md",
      "work/sprints/active-2026-q2-spec-led-runtime-modularization.md"
    ],
    "handoffFiles": [
      "work/packages/done-20260529-rolling-restart-active-gate-saturation-checkpoint-system-theory-rederive.md",
      "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json"
    ],
    "generatedFiles": [
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md"
    ],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "work/packages/active-20260529-system-theory-checkpoint-due-recognition.md",
      "scripts/work-system-theory-rederive.js",
      "test/scripts/work-system-theory-rederive.test.js",
      "work/RULES.md",
      "work/sprints/active-2026-q2-spec-led-runtime-modularization.md",
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "The non-halting sprint has no active packages, but the periodic rederive gate immediately demands another same-day checkpoint after one just closed."
  },
  "modelFit": {
    "packageClass": "workflow-validator-maintenance",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "workflow-gate-test-and-doc-update",
    "outputProfile": "medium",
    "ambiguityScore": 1,
    "escalationTriggers": [
      "the check-due gate would stop enforcing periodic rederive checkpoints",
      "the change requires runtime source files",
      "the fix changes representative scenario routing"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [],
    "theoryLedger": "no-ledger-update",
    "implementation": {
      "parentRevalidatedFocusedProof": true,
      "filesChanged": [
        "scripts/work-system-theory-rederive.js",
        "test/scripts/work-system-theory-rederive.test.js",
        "work/RULES.md",
        "work/sprints/active-2026-q2-spec-led-runtime-modularization.md",
        "work/packages/active-20260529-system-theory-checkpoint-due-recognition.md"
      ]
    },
    "verificationFix": {
      "parentRevalidatedFocusedProof": true
    },
    "proof": {
      "commands": [
        "regression: npm test -- test/scripts/work-system-theory-rederive.test.js",
        "regression: npm run work:system-theory:rederive -- --check-due --sprint work/sprints/active-2026-q2-spec-led-runtime-modularization.md",
        "supporting: npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12",
        "supporting: git diff --check -- scripts/work-system-theory-rederive.js test/scripts/work-system-theory-rederive.test.js work/RULES.md work/sprints/active-2026-q2-spec-led-runtime-modularization.md work/sprints/current-blocker.json work/sprints/current-blocker.md work/packages/active-20260529-system-theory-checkpoint-due-recognition.md"
      ]
    }
  },
  "theoryLedger": "no-ledger-update",
  "closureSummary": {
    "resultClassification": "reduced",
    "predictionAccuracy": "matched",
    "observedMovement": "check-due now reports 0 closed packages since the latest closed systemTheory rederive instead of 13 same-day closures since the sprint date stamp.",
    "successorReason": "The periodic checkpoint gate remains enforced but no longer blocks the selected architecture-continuation route immediately after a closed checkpoint rederive.",
    "nextOwnerBoundary": "workflow_tooling_owner / system_theory_checkpoint_gate",
    "evidenceArtifact": "work/sprints/active-2026-q2-spec-led-runtime-modularization.md"
  },
  "implementation": {
    "parentRevalidatedFocusedProof": true,
    "filesChanged": [
      "scripts/work-system-theory-rederive.js",
      "test/scripts/work-system-theory-rederive.test.js",
      "work/RULES.md",
      "work/sprints/active-2026-q2-spec-led-runtime-modularization.md",
      "work/packages/active-20260529-system-theory-checkpoint-due-recognition.md"
    ]
  },
  "verificationFix": {
    "parentRevalidatedFocusedProof": true
  },
  "commitAndPushLedgerRequired": true
}
-->

## Why

The checkpoint rederive closed and pushed, but the periodic rederive gate still
requires another rederive before any successor package can activate. The gate is
still doing a date-only same-day count, so it cannot distinguish packages closed
before the latest rederive from packages closed after it.

## Scope

- In: `work:system-theory:rederive --check-due` logic, its focused test, and the rule text that describes the gate.
- Out: runtime source files, representative route classification, sprint success criteria, and weakening the periodic checkpoint threshold.

## Workflow Lane

- Selected lane: `lightweight-maintenance`
- Why this lane is sufficient: this is a bounded workflow-tooling correction with a focused unit test and CLI probe.
- Escalation trigger to a heavier lane: the fix changes runtime ownership, scenario routing, or the sprint success condition.

## Gate Contract

- Preserve the periodic checkpoint guard.
- Prefer the latest closed system-theory rederive package linked by the active sprint when it is newer than the sprint date stamp.
- Fall back to the existing date-only count when no closed rederive package can be identified.
- Keep the gate nonzero only when enough packages closed after the effective checkpoint.

## Validation

1. `npm test -- test/scripts/work-system-theory-rederive.test.js`
2. `npm run work:system-theory:rederive -- --check-due --sprint work/sprints/active-2026-q2-spec-led-runtime-modularization.md`
3. `npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12`
4. `git diff --check -- scripts/work-system-theory-rederive.js test/scripts/work-system-theory-rederive.test.js work/RULES.md work/sprints/active-2026-q2-spec-led-runtime-modularization.md work/sprints/current-blocker.json work/sprints/current-blocker.md work/packages/active-20260529-system-theory-checkpoint-due-recognition.md`

## Execution Evidence

- [x] action: implementation; owner: workflow_tooling_owner; files-changed: scripts/work-system-theory-rederive.js,test/scripts/work-system-theory-rederive.test.js,work/RULES.md,work/sprints/active-2026-q2-spec-led-runtime-modularization.md,work/packages/active-20260529-system-theory-checkpoint-due-recognition.md; validation: npm test -- test/scripts/work-system-theory-rederive.test.js; npm run work:system-theory:rederive -- --check-due --sprint work/sprints/active-2026-q2-spec-led-runtime-modularization.md; npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12; npm run work:test:regression; parent revalidated focused proof: yes; outcome: validated - check-due now counts from the latest closed sprint-linked rederive checkpoint when available and falls back to date-prefix counting otherwise.
- [x] action: verification-fix; owner: workflow_tooling_owner; files-changed: work/packages/active-20260529-system-theory-checkpoint-due-recognition.md,scripts/work-system-theory-rederive.js,test/scripts/work-system-theory-rederive.test.js,work/RULES.md,work/sprints/active-2026-q2-spec-led-runtime-modularization.md,work/sprints/current-blocker.json,work/sprints/current-blocker.md; validation: npm run work:validate -- --entry work/packages/active-20260529-system-theory-checkpoint-due-recognition.md; npm run work:validate -- --pre-impl work/packages/active-20260529-system-theory-checkpoint-due-recognition.md; git diff --check -- scripts/work-system-theory-rederive.js test/scripts/work-system-theory-rederive.test.js work/RULES.md work/sprints/active-2026-q2-spec-led-runtime-modularization.md work/sprints/current-blocker.json work/sprints/current-blocker.md work/packages/active-20260529-system-theory-checkpoint-due-recognition.md; npm run work:advance -- --check; parent revalidated focused proof: yes; outcome: validated - entry, pre-implementation, whitespace, and package doctor checks passed after implementation.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json,work/sprints/current-blocker.md,work/sprints/active-2026-q2-spec-led-runtime-modularization.md; validation: npm run work:repair; outcome: validated - generated current-blocker handoff and sprint current edge card refreshed.

## Commit And Push Ledger

1. Focused package commit: 90a186434acb8e4caa30e426c22e03a4e2ba1162
2. Push target: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
4. Pushed: yes 2026-05-29T12:20:07.454Z
