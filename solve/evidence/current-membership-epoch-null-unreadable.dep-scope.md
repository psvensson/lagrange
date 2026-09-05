# DEP-SCOPE — current membership epoch: NULL is unreadable, never epoch 0

Tree: `.claude/worktrees/current-membership-epoch-null-unreadable` @ `b2f732d0d` (origin/main after `membership-epoch-null-rehydration`).

## Demonstrated defect (deterministic probe on the real readiness service)

| Latest publication | planning answer `publishedPlanningEpoch` | `getCurrentPublishedMembershipEpochSync` before | after |
| --- | --- | --- | --- |
| none | `undefined` | `null` | `null` |
| ESTABLISHING epoch 1 | `null` | **`0`** | `null` |
| PUBLISHED epoch 1 | `1` | `1` | `1` |

`recovery-protocol-snapshot.js:659` sets `publishedPlanningEpoch: null` unless
the publication is PUBLISHED with an integer epoch. The readiness owner's read
(`control-plane-readiness-publication-planning-snapshot.js:530`) decoded it
with `Number(null)` (=0), which passed `isInteger && >= 0`. Consequence in
the cold-formation window (first publication establishing): the planner
stamps moves with epoch 0, the creation fence compares 0 === 0 and persists
bound-0 operations, and the dispatch fence later fails any still-pending one
as "Stale dispatch for published membership epoch 0; current epoch is N".
This is the second route to the live message repaired by the sibling quest.

## Contract

```text
publishedPlanningEpoch null / undefined  -> current epoch UNREADABLE (null)
                                            planner: no stamp (unbound moves)
                                            creation fence: MEMBERSHIP_EPOCH_UNAVAILABLE deferral
                                            dispatch fence: DEFERRED_RETRY_PENDING
PUBLISHED integer N >= 0                 -> current epoch N (zero stays zero)
anything else                            -> UNREADABLE (fail closed by deferral)
```

Published epochs are minted `|| 1`, so 0 never occurs live, but the reader
keeps 0 faithful rather than as a sentinel.

## Readers (src) of the current-epoch surface

| Site | Class | Before | After |
| --- | --- | --- | --- |
| `control-plane-readiness-publication-planning-snapshot.js` getCurrentPublishedMembershipEpochSync | owner read | `Number(...)` | `readPublishedMembershipEpoch` |
| same file, buildMembershipPublicationDiagnostics publicationEpoch | owner diagnostics decode feeding the planning answer | `Number(row.epoch)` + isFinite | reader, `?? protocolSnapshot.publicationEpoch` |
| `operation-workflow-dispatch-epoch-gate.js` current side | consumer normalize | local `Number(...)` | reader |
| `rebalance-coordinator-owner-delegation-methods.js` getCurrentPublishedMembershipEpoch | consumer passthrough (`isInteger` check) | — | unchanged |
| `unified-rebalancer-rebalance-loop.js` resolvePublishedMembershipPlanningEpoch | consumer passthrough | — | unchanged |
| `recovery-protocol-snapshot.js`, `membership-publication-candidate-derivation.js`, `projection-readiness-evidence(-source).js` | producers / carry | — | unchanged |

Single reader: `src/control-plane/published-membership-epoch-reading.js`.
`C7-single-reader-inventory` pins the classification.

## Same class, other owners (recorded, NOT changed)

- `control-plane-readiness-priority-recovery-planning.js:321,328`
  `getPriorityRecoveryPlanningPublicationEpoch` /
  `...DecisionSnapshotsPublicationEpoch`: `Number(snapshot?.publicationEpoch)`
  → 0 for an absent epoch. These feed priority-recovery snapshot merge
  comparisons (direct vs provided vs retained), a different decision surface
  with `??` chains that depend on the current null/0 behaviour. Needs its own
  contract analysis before changing.
- `membership-epoch-contract.js buildMembershipEpochValue`: `Number(null)` →
  AVAILABLE 0 for publication rows (publication-row owner).
- `publication-recovery-evidence.js`, `active-node-publication-snapshots.js`:
  `Number(x) || 0` evidence comparisons where 0 is a deliberate "none" floor.

## Receipts

C1–C7 in `test/control-plane/current-membership-epoch-null-unreadable.test.js`,
driven through the real `ControlPlaneReadinessService`, the real
`UnifiedRebalancer` planning read, the real `RebalanceCoordinator` creation
fence, and the real dispatch lane (`wireEpochDispatchProbe`; only reservation,
delivery, and node-readiness admission are stubbed, never the epoch read or
comparison). Mutation controls in
`solve/evidence/current-membership-epoch-null-unreadable.mutations.json`.
