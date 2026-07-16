# Authoritative observation watermark — abstract protocol ↔ runtime

Model: `AuthoritativeObservationWatermark.tla`.
Quest: `movielens-authoritative-observation-watermark`.

This focused model composes a failed-read retry, successful complete
authoritative reads, unchanged/confirmed-empty reconciliation, separate
observation-evidence publication, ordered mutation/observation timestamps,
newest-evidence selection, age-based freshness classification, and schema
admission.

| Model | Runtime |
| --- | --- |
| `FailInitialAuthoritativeRead` / `RequestRepairRetry` | `AdminServiceDiscovery.ensureAuthoritativeDiscoveryCacheRepair` fails closed on incomplete reads and permits a later bounded repair attempt |
| `CompleteAuthoritativeRead` | the canonical gateway validates `SELECT *`, rejects partial/failure evidence, and mints the complete-table observation receipt consumed by `AdminServiceDiscovery.readAuthoritativeSystemTableRows` |
| `ReconcileAuthoritativeTruth` | `ControlPlaneSystemTableGateway.reconcileAuthoritativeCacheRows` compares authoritative rows with the local cache without fabricating a CDC mutation; a cached row the cache's own causal order proves newer than the read is explained divergence and cannot block reconciliation |
| `mutationWatermarkAt` / `AdvanceIndependentMutation` | `SystemTableCache.lastAppliedAtMsByTableName`; no-op reconciliation leaves it unchanged, while a genuinely later CDC event may advance it independently — including between the authoritative read and its reconcile (the live nodes heartbeat churn interleaving) |
| `ExactEqualityReconcileGate` mutant | the pre-fix verify required post-apply cache == read-snapshot equality, so a continuously mutated table (nodes heartbeats) could never publish observation evidence and schema admission wedged at `authoritative_observation_cache_not_reconciled` |
| `observationCandidateAt` / `observationWatermarkAt` | the gateway-owned read completion time and `SystemTableCache.recordAuthoritativeObservation` publication remain distinct from mutation time |
| `SelectNewestFreshnessEvidence` | `AdminPreflightSnapshot.buildPreflightCacheFreshnessSummary` selects `max(mutation, authoritative observation)`, records its source, and compares its age with the freshness bound |
| `AdmitSchema` | the MovieLens schema-admission gate accepts a fresh control snapshot |

The fixed configuration proves that authoritative observation does not invent a
mutation, only a reconciled complete read can publish, the selected timestamp is
always the newest available evidence (including a later independent mutation),
freshness matches its age, and successful unchanged/empty repair eventually
admits schema. The mutation-only mutant keeps the old stale mutation timestamp
when no independent CDC event arrives and violates eventual admission after a
successful no-op repair. The exact-equality mutant refuses to reconcile while
an independent mutation is newer than the read snapshot and violates eventual
admission whenever churn interleaves with the repair — the live five-node
`nodes` heartbeat wedge.

This is intentionally not a claim that every interaction between repository
layers is modeled in TLA+ or Alloy.
