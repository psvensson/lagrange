---
epicContractVersion: 2
id: rebalancer-operation-safety-audit-remediation
roadmapRow: null
graduatesTo: null
---

# Rebalancer / operation-lifecycle safety audit remediation

## Intent (why now)

An 18-finding safety audit of the replica-operation lifecycle (rebalancer
admission, storage reservations, remove safety, terminal transitions, cleanup)
was adversarially verified at HEAD: 14 findings confirmed as written, 3
confirmed but softer (9, 10, 13), one headline refuted with mechanics intact
(13's wrong-partition deletion). Several came back *worse* than claimed (7's
fail-open epoch assert, 12's orphaned DB/WAL files, 15's in-memory-only
progress store). Until the Tier-1 data-safety fixes land, any increase in
rebalancer autonomy is unsafe. This epic sequences the remediation; the fixes
themselves live in the linked Quests.

## Options under discussion

- **Sequencing (chosen): verification's tier order, Tier 1 before Tier 2 before
  Tier 3.** Tier-1 items are cheap re-scoping/CAS changes that close the
  worst data-loss paths; ownership leasing (Tier 3) is the largest change and
  is deliberately last because the terminal CAS removes the worst consequence
  of duplicate owners in the meantime.
- **Alternative — lease-first.** Building durable ownership (findings 5/14)
  first would subsume several races but is multi-quest work while the
  one-line-class fixes sit open. Rejected by the verification's own ordering.
- **Tier-3 items 9/10 are NOT Quests** (`??` for `||` at
  `src/node/replica-handler-runtime-metadata-methods.js:164-167` +
  `src/bootstrap/shared/durable-rejoin-partition-restore-planner.js:252`;
  partition-identity cross-check in the remove executor). Bounded one-sitting
  fixes with obvious proofs — do directly and commit, per AGENTS.md's
  threshold.

## Quest map (all link back via links.planDoc)

Tier 1 — data safety:
1. `remove-safety-universal-floor` — finding 1. Extend the remove-safety
   evaluator's universal tier (voter-ready count, min floor, distinct-node
   spread, concurrent-op lock) to non-system partitions; the early return at
   `operation-workflow-remove-safety-evaluator.js:426-430` currently skips it.
2. `replica-operation-terminal-cas` — finding 6 (+10). `completed_at IS NULL`
   on terminal writes; loser adopts winner; terminal-repair timer stands down.
3. `admission-real-size-estimates` — findings 2+16. Thread real `size_bytes`
   into `estimateReplicaBytes` at all three call sites (incl.
   `move-planner.js:358`); the split path's 2×-amplified real-size estimate is
   the in-repo template; one resolved estimate serves admission + reservation.
4. `reservation-fail-closed-dispatch-gate` — findings 3+11. Reservation-create
   failure blocks dispatch; dispatch-time ACTIVE-reservation gate reuses
   `ensureReservationForOperation` (deterministic `res-${operationId}` ID);
   typed terminal-persistence result stops reservation release on the
   unresolved-divergence arm.

Tier 2 — correctness under time and failure:
5. `reservation-expiry-operation-aware` — finding 4. TTL sweep consults
   operation state like the orphan-release arm (KEEP_ACTIVE for non-terminal);
   capacity accounting stops pre-expiring at `expiresAt <= now`.
6. `existing-group-add-topology-guard` — finding 8. Self-only-cohort guard
   extended to ADD on non-fresh partitions; cohort stamping reads authoritative
   rows, not cache.
7. `removed-replica-cleanup-debt-owner` — finding 12. Cleanup retry gets a
   durable owner (debt record and/or startup filesystem sweep);
   `reconcileRemovedReplicaCleanup` becomes reachable; orphan DB/WAL files
   become deletable.
8. `assignment-epoch-fencing` — finding 7. Fail-open epoch assert defers
   instead; epoch carried in executor request for ADD/REPLACE staleness; dead
   step-history epoch gets readers or is deleted.

Tier 3 — structural (sequenced after Tiers 1–2):
9. `operation-ownership-lease-fencing` — findings 5+14. Durable owner
   identity/lease (schema's vestigial `lease_expires_at` column is the
   foothold), orphaned-op adoption, and bounded shutdown join of in-flight
   lanes.
10. `operation-progress-store-persistence` — findings 15+18. Real persistence
    for the rebalancer's `DurableWorkflowCoordinator` progress store (four
    other subsystems show the wiring) or an honest projection rename.

No Quest for finding 10 (shadow-record blast radius only; covered by fix 2),
17 (PlacementTransitionSafetyOwner refactor is sound but fix 1 delivers its
safety substance first — revisit after Tier 1), or 9/13 (direct fixes).

## Open questions

- Reservation renewal (finding 4's full lease protocol) is deferred — is the
  operation-aware sweep sufficient in practice, or do long-running ops need
  explicit renewal? Decide after quest 5 lands from observed expiry incidents.
- Finding 17's single `PlacementTransitionSafetyOwner` (~11 partial sites) —
  revisit once Tier 1 lands; may shrink to consolidating what remains.

## Decision log

- 2026-08-06 — Epic authored from the verified 18-finding audit; adopted the
  verification's tier ordering wholesale; split findings 9/13 out as direct
  fixes per the Quest threshold in AGENTS.md.
