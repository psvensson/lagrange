# Local leadership tenure claim — abstract protocol ↔ runtime

Model: `LocalLeaderTenureClaim.tla`.
Quest: `local-leadership-tenure-bound-safety-evidence`
(parent `formation-priority-spread-without-exclusive-self-move-cost`).

Models a remove-safety read running concurrently with leadership transitions:
capture, await, merge — with the local election seed, demotion/teardown claim
clearing, successor publication and its CDC delivery, and the equal-version
replay of an old durable row (a FOSSIL naming this node with no claim stamps).

| Model | Runtime |
| --- | --- |
| `WinElection` (claim stamped) | `seedLocalCanonicalLeaderNodeId` + `applyLocalCanonicalLeaderObservation` stamping `leader_claim_node_id` / `leader_claim_raft_term` / `leader_claim_minted_against_updated_at` (local-only annotations, `partition-service-metadata-delivery-methods.js`) with the term from `raft-replica-base.js` `resolveCurrentTermSafe` |
| `LoseTenure` (claim cleared) | the demotion clear (`clearLocalCanonicalLeaderNodeIdIfOwned`), the demoted-replay re-null, and the teardown clear (`clearLocalCanonicalLeaderClaimOnTeardown`, hooked into partition-service shutdown) |
| `ReplayFossil` | an equal-version CDC round-trip of an old durable PARTITIONS row: durable columns cannot carry the claim annotations, so the replayed row names this node WITHOUT a live claim |
| `FinishSafetyRead` / `PreferLocal` | `getCriticalPartitionRowForSafety` merging on the POST-AWAIT cache state; `mergePartitionRowForSafety` firing the preference only on this node's live stamped claim (`priority-publication-safety-rows.js`) |
| `MergeNeverTrustsDeadTenure` | the sealed invariant: a dead tenure is never preferred over an authoritative successor |
| `LiveTenureIsPreferred` | the recognition-tax fix stays effective: a live stamped claim is preferred over the lagging durable leader |

Checked configurations (2026-07-17): `_tenure_bound` (TenureBound=TRUE) holds
both invariants; `_content_based_bug` (TenureBound=FALSE, the pre-fix
precedence) violates `MergeNeverTrustsDeadTenure` via the fossil replay.

Deliberately out of scope: the irreducible not-yet-noticed-demotion window
(the local tenure is still formally live; the independent quorum, spread,
voter-ready, and connectivity floors bound it — see the verifier findings on
the parent quest), multi-partition composition, and concurrent safety reads.
