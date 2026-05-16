# FoundationDB Style Deterministic Missing Edge Replay

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "todo",
  "opened": "2026-05-16",
  "lane": "scenario-release-gate",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json",
  "playback": "none",
  "owner": "diagnostics_owner",
  "boundary": "deterministic_missing_edge_replay",
  "dominantReason": "representative_reruns_precede_replayable_probe",
  "currentState": "Topology debugging still depends on expensive representative rolling-restart reruns after local fixes. The current track already has extractors and replay-adjacent harness code; this package turns latest frontier evidence into deterministic missing-edge fixtures before broad reruns drive more runtime patches.",
  "nextAction": "Turn latest rolling-restart frontier artifacts into deterministic replay fixtures before any broad representative rerun is used as the next debugging step.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json",
    "node --test test/distributed/harness/__tests__/active-gate-closure-classification.test.js"
  ],
  "writeScope": [],
  "handoffFiles": [
    "test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json",
    "work/tracks/topology-convergence.md"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [
    "scripts/analyze-topology-convergence.js",
    "src/diagnostics/topology-convergence-graph.js",
    "test/distributed/harness/publication-evidence-replay.js",
    "test/distributed/harness/publication-evidence-contract.js",
    "test/distributed/harness/__tests__/active-gate-closure-classification.test.js",
    "test/distributed/harness/__tests__/cluster.test-part-5.js"
  ],
  "commitScope": [],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/current-frontier",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  }
}
-->

## Why

FoundationDB is known for deterministic simulation: failures can be replayed in
a controlled environment before large-scale validation. The local analogue is
not a full simulation framework. The useful idea is replayability: every
repeated release-gate frontier should have a compact deterministic fixture that
reproduces the owner decision and missing edge.

This package makes that rule concrete for topology convergence. A broad
rolling-restart rerun is still the final checkpoint, but it should not be the
next debugging step when a missing-edge fixture can reproduce the current
frontier.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, failure simulations and production
guarantees. External reference: FoundationDB testing docs,
`https://apple.github.io/foundationdb/testing.html`.

## Workflow Lane

- Selected lane: `scenario-release-gate`
- Why this lane is sufficient: this changes validation infrastructure and
  scenario evidence handling, not runtime semantics.
- Escalation trigger to a heavier lane: the replay proves runtime ownership
  semantics must change or adds new runtime contracts.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. Add a fixture generator or documented extractor path that takes a
   representative artifact and writes a compact frontier fixture containing:
   first frontier, owner/boundary, dominant reason, publication convergence,
   active-gate handoff, readiness support, and priority residual witness
   summary.
2. Add a replay test that feeds the fixture into topology convergence
   classification and asserts the same owner, boundary, dominant reason, and
   next action.
3. Add fixture cases for `publication_ack_blocked`,
   `owner_reconcile_pending`, `write_deferred`, and migrated
   `operation_workflow_owner` evidence as they become available.
4. Update package templates or sprint rules to require this fixture before
   repeated full reruns on the same boundary.
5. Preserve raw artifact fallback only when the extractor is insufficient, and
   require the fallback reason in package evidence.

## Out Of Scope

1. Runtime ownership changes.
2. Replacing the distributed harness.
3. Creating a full cluster simulator.
4. Broad JSON slicing as the primary workflow.

## Borrowing Details

What is borrowed:

1. Reproducibility before broad validation.
2. A small deterministic workload or fixture that preserves the failure class.
3. Repeatable proof that a fix changes the intended causal edge.

What is not borrowed:

1. FoundationDB's simulation engine.
2. Randomized fault injection across the whole cluster.
3. Long-running simulation campaigns.

Local implementation shape:

1. Convert representative artifacts into compact JSON fixtures under existing
   harness fixture directories.
2. Replay fixtures through existing topology convergence code rather than new
   parsers.
3. Gate repeated same-frontier packages on replay proof or a recorded reason
   that replay is not yet possible.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: this package file until activation; candidate diagnostics and
  harness files may be promoted only when replay proof is selected.
- Forbidden files: runtime semantic changes, owner admission changes, timeout
  increases, and Pro or Enterprise behavior.
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json`, `node --test test/distributed/harness/__tests__/active-gate-closure-classification.test.js`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json
3. node --test test/distributed/harness/__tests__/active-gate-closure-classification.test.js
