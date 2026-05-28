# Rolling Restart Active Gate Snapshot Coverage Post Stale Cache Route

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "superseded",
  "intent": {
    "opened": "2026-05-27",
    "lane": "diagnostic-classification",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-active-gate-owner-reconcile-retry-20260528T040351Z.report.json",
    "playback": "none",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "currentState": "Superseded by the mechanism-first active-gate evidence after retry cadence and owner-reconcile artifacts narrowed the blocker.",
    "nextAction": "Use work/sprints/active-2026-q2-rolling-restart-mechanism-first-recovery.md."
  },
  "scope": {
    "writeScope": [],
    "handoffFiles": [
      "test-output/reports/rolling-restart-active-gate-owner-reconcile-retry-20260528T040351Z.report.json"
    ],
    "generatedFiles": [],
    "candidateRuntimeFiles": [],
    "commitScope": []
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "Historical record only; the current first frontier is owned by the active mechanism-first sprint."
  },
  "modelFit": {
    "packageClass": "superseded-handoff",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "historical-record",
    "outputProfile": "small",
    "ambiguityScore": 1,
    "escalationTriggers": [
      "do not reactivate this package"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [],
    "theoryLedger": "no-ledger-update",
    "proof": {
      "commands": [
        "falsifier: npm run work:validate -- --pre-impl work/packages/done-20260528-rolling-restart-owner-reconcile-admission-runtime.md",
        "regression: npm run work:validate -- --entry work/packages/done-20260528-rolling-restart-owner-reconcile-admission-runtime.md"
      ]
    }
  }
}
-->

## Sunset Note

This stale classifier is superseded. The active successor sprint is
`work/sprints/active-2026-q2-rolling-restart-mechanism-first-recovery.md`.
Do not reopen this package from the old post-stale-cache artifact.

## Theory Justification

The older restarted-node admin surface, active-gate evidence capture,
control-snapshot authority recovery, snapshot-watch fixture, and snapshot-watch
handoff theories are not repeated because the current mechanism-first evidence
instead selects owner-reconcile admission/enqueue/wake from the latest active
gate artifact.
