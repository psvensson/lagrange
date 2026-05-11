# Spec-Led Runtime Modularization Publication ACK Follow-Up Sprint

Status: todo. This successor sprint is the handoff from the closed
spec-led runtime modularization sprint after representative rolling-restart
evidence migrated from startup active-gate snapshot coverage to publication ACK
convergence.

## Current Blocker Snapshot

Current package:
`work/packages/todo-20260511-spec-led-runtime-modularization-publication-ack-convergence-publication-published-frontier.md`.

Owner boundary:
`topology_publication_owner / publication_convergence`.

Latest representative evidence:
`test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag.report.json`.

The generated evidence block names frontier `publication_ack_convergence`,
dominant reason `publication_published`, and causal dominant failure class
`publication_ack_blocked`. `active_gate_snapshot_coverage` is downstream until
publication convergence is reduced or migrated.

## Scope Basis

1. Predecessor sprint:
   `work/sprints/archived/done-2026-q2-spec-led-runtime-modularization.md`.
2. Predecessor package:
   `work/packages/done-20260510-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag-frontier.md`.
3. Roadmap Phase `0.1 - Internal Coherence` release-gate closure and runtime
   coherence scope.
4. Edition scope: Community / AGPL repo only.

## Package Queue

1. [Publication ACK Convergence Publication-Published Frontier](../packages/todo-20260511-spec-led-runtime-modularization-publication-ack-convergence-publication-published-frontier.md)
2. [Active Gate Report Schema Alias Deletion](../packages/todo-20260509-spec-led-runtime-modularization-active-gate-report-schema-alias-deletion.md)

## Activation Rules

1. Activate the publication ACK convergence successor first.
2. Before implementation starts, run the required fresh review subagent on the
   closed active-gate publication-lag package, then a separate fix subagent if
   review finds fixes, then a separate implementation subagent.
3. Keep active-gate report schema alias deletion deferred until the
   representative publication frontier is classified.
4. Do not reopen completed workflow-progress or startup active-gate packages
   unless a focused fixture proves direct regression.

## Exit Criteria

1. Representative rolling-restart proof is green or migrates to one fresh
   owner-boundary package with a canonical evidence block.
2. The publication ACK convergence package is closed, superseded with a named
   replacement, or explicitly deferred with proof.
3. Companion diagnostics cleanup remains deferred unless the representative
   proof gate is classified.
4. No Pro or Enterprise feature work enters this sprint.
