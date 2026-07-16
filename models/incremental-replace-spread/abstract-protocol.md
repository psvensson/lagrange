# Incremental REPLACE spread — abstract protocol ↔ runtime

Model: `IncrementalReplaceSpread.tla`.
Quest: `movielens-incremental-replace-spread-nonregression`.

The model composes three runtime layers that were previously covered only
separately: the published final spread target, the remove-safety owner, and the
operation-ledger self-move serialization boundary.

| Model | Runtime |
| --- | --- |
| `spread` | distinct nodes in the current authoritative voter-ready service rows |
| `candidateSpread` | distinct nodes after excluding this REPLACE's declared source from those rows |
| `RequiredSpread = 3` | published `priorityPartitionSummary.requiredDistinctNodeCount` |
| `phase = "target_ready"` | REPLACE is `ACTIVE`; the replacement is voter-ready and source removal is next |
| `StartReplace` | the serialized ledger owner admits one count-neutral spread REPLACE |
| `CompleteNonRegressing` | remove safety permits source removal, the workflow terminalizes, and the interlock releases |
| `RequireFinalTargetPerStep` | old `projectedDistinctNodeCount >= requiredDistinctNodeCount` gate |
| non-regression policy | `projectedDistinctNodeCount >= min(currentDistinctNodeCount, requiredDistinctNodeCount)` |

The fixed config proves two serialized moves progress `1 → 2 → 3`, never reduce
spread, and eventually reach the published target. The final-target bug config
exhibits the live `2/3` ownership gap: the first operation cannot complete, so the
second cannot start. The regression-mutant config proves that replacing the final
target with a blanket allow would be unsafe; a `2 → 1` removal violates
`SpreadNeverRegresses`.

This is a focused composition model, not a claim that every cross-layer runtime
interaction is represented in TLA+ or Alloy.
