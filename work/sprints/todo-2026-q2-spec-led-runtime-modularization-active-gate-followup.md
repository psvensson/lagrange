# Spec-Led Runtime Modularization Active-Gate Follow-Up Sprint

Status: todo. This successor sprint follows the publication ACK convergence
closure after representative proof migrated back to startup active-gate snapshot
coverage.

## Current Blocker Snapshot

Current package:
`work/packages/todo-20260511-spec-led-runtime-modularization-active-gate-snapshot-coverage-post-publication-ack-frontier.md`.

Owner boundary:
`startup_active_gate_owner / snapshot_coverage`.

Latest representative evidence:
`test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag.report.json`.

The representative first frontier is `active_gate_snapshot_coverage`, dominant
reason `active_gate_timed_out`, with active node count `3`, expected node count
`5`, inactive node count `2`, and snapshot coverage `3/5`.

## Scope Basis

1. Predecessor sprint:
   `work/sprints/archived/done-2026-q2-spec-led-runtime-modularization-publication-ack-followup.md`.
2. Predecessor package:
   `work/packages/done-20260511-spec-led-runtime-modularization-publication-ack-convergence-publication-published-frontier.md`.
3. Roadmap Phase `0.1 - Internal Coherence` release-gate closure and runtime
   coherence scope.
4. Edition scope: Community / AGPL repo only.

## Package Queue

1. [Active-Gate Snapshot Coverage Post-Publication-ACK Frontier](../packages/todo-20260511-spec-led-runtime-modularization-active-gate-snapshot-coverage-post-publication-ack-frontier.md)
2. [Active Gate Report Schema Alias Deletion](../packages/todo-20260509-spec-led-runtime-modularization-active-gate-report-schema-alias-deletion.md)

## Activation Rules

1. Review the closed publication ACK package before activating the successor.
2. Keep active-gate report schema alias deletion deferred until the
   representative active-gate frontier is classified.
3. Do not reopen publication ACK convergence unless focused proof shows a direct
   regression from the predecessor closure.
4. Do not implement Pro or Enterprise features.

## Exit Criteria

1. Representative rolling-restart proof is green or migrates to one fresh
   owner-boundary package with a canonical evidence block.
2. The active-gate snapshot coverage package is closed, superseded with a named
   replacement, or explicitly deferred with proof.
3. Companion diagnostics cleanup remains deferred unless the representative
   proof gate is classified.
4. No Pro or Enterprise feature work enters this sprint.
