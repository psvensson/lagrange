---
scope: governance
status: canonical
always_load: false
source_of_truth: self
compiled_pack: .kiro/steering/llm/governance.md
parent_index: ../workflow-guidelines/INDEX.md
last_reviewed: 2026-05-23
---

> **Canonical source.** Static drift ledger, post-rerun decision gate. Index: [`INDEX.md`](INDEX.md).

# Workflow — Validators & Drift

## Static Drift Ledger

Every active package touching runtime, control-plane, harness, diagnostics,
admin, or shared test infrastructure records static guardrail status.

Before implementation, record relevant guardrails:

- decision-boundary guideline audit
- runtime-grammar audit when runtime meaning is touched
- metadata gateway or owner-ingress audit for system-table reads/writes
- scalar/literal audit for material runtime edits
- dependency cycle and complexity ratchets for broad refactors

The ledger distinguishes:

1. inherited repo-wide debt outside the package boundary
2. inherited debt in write-scope files
3. new debt introduced by the package
4. debt removed by the package

Do not close if relevant guardrail counts increase. Do not hide failures by
weakening scripts, expanding allowlists, renaming files out of scan scope, or
moving code into test-only paths.

Any new allowlist, suppression, or accepted-boundary entry names owner, reason,
expiry or follow-on, and the guardrail that fails after removal.

## Post-Rerun Decision Gate

Every representative rerun produces a routing decision before more package work
starts. Run `npm run work:package:route-after-rerun -- --artifact <artifact>
...` and record the result in successor package metadata as `rerunDecision`.

Required `rerunDecision` fields:

1. `sourceArtifact`
2. `routeOwner`
3. `routeBoundary`
4. `routeDominantReason`
5. `routeCausalOutcome`
6. `stopMode`
7. `nextLane`
8. `expectedDelta`
9. `requiredRefreshCommands`

`requiredRefreshCommands` must cite route-after-rerun, Sprint Strategy Brief
update, Current Edge Card update, current-blocker regeneration, and
pre-implementation validation. Closure or migration is not complete while the
active package, sprint brief, Current Edge Card, and generated
`current-blocker.json` disagree.

Packages must state the expected representative delta before implementation:
what metric, owner, boundary, dominant reason, or route is expected to change.
Focused local proof and representative proof are different proof classes. Local
proof can justify a bounded patch; representative proof requires a fresh rerun
or route-after-rerun result.

If the rerun is same-frontier with no concrete metric or shape reduction, stop
local patching and open/select an autonomous architecture experiment before
another implementation package. Human escalation is an exception for
contradictory, policy-blocked, credential-blocked, or unavailable evidence.

