# Reconnaissance for replica-membership-model-reduction (2026-09-20)

**Status: reconnaissance by reading, not proof.** Two read-only passes over
`src` (byte-identical between 49c0b6d0f and 3dd08cb25), made to inform the
statement and brief of the read-only quest `replica-membership-model-reduction`.
Nothing was run, driven or changed. Claims are cited file:line and marked READ
or INFERRED by their authors; under R19 none of this is a measurement, and the
quest must drive what matters. It proposes no repair and no abstraction.

- `transition-state.md` - production structures carrying a membership change;
  the membership views; the durable replica operation against the conceptual
  identity (present / derivable / absent); operation phases; the one-operation
  invariant; creators, deciders and detectors; status read as membership
  authority.
- `version-domains.md` - the single candidate membership generation worked
  outward from the operation boundary; creation-time recording; execution-time
  checks; restart and leader change; the partition-shape domain; an appendix of
  partial material from the abandoned repository-wide census.

## Verified by the lead against src (2026-09-20)

1. There is no committed Raft membership. `@markwylde/liferaft` `join()` /
   `leave()` push to and splice a local in-memory `nodes` array; `majority()` is
   `ceil(nodes.length / 2) + 1` over that local array. `src/raft` holds no
   configuration index, joint configuration or replicated configuration change.
2. Production edits that peer set per node: `raftNode.join(peerAddress)`
   (`src/raft/liferaft-provider.js:259`) and `raft.leave(address)`
   (`src/partition/partition-service-raft-peer-cache-reconciliation.js:164,294`),
   reconciled from cached `services` rows; a row is a peer unless its status is
   FAILED, REMOVING or REMOVED (`:77-87`), so SYNCING is a peer.
3. `idx_control_plane_publications_kind_epoch` is declared without
   `unique: true` (`src/bootstrap/system-table-runtime-schema-definitions.js`);
   the stopped audit's inventory called it unique.
4. The priority-recovery follow-up REPLACE is guarded only by
   `inventory.accounting.activeCount > targetReplicaCount`
   (`src/rebalancer/unified-rebalancer-follow-up-move.js:640-647`), whose own
   comment says an occupied SYNCING row may still need the replacement cure; it
   carries no unresolved-operation predicate, and target selection excludes
   pending target nodes (`:518-527`).
5. `surplusVoterCount = Math.max(activeCount, activeVoterCount)`
   (`src/rebalancer/move-planner-move-calculation-methods.js:424-427`): two
   censuses reconciled by a maximum.
6. The durable operation record takes no reason; a REPLACE's source replica id
   is JSON inside the first history entry (`src/rebalancer/replica-status.js`).

Everything else in the two files is the authors' reading, unverified by the
lead.

## Bearing on the binding direction

The direction's minimal model names `CommittedMembership` and a generation Raft
exposes (sections 7, 13, 19). Neither exists in production today, which is the
direction's own stop condition "Raft membership generation cannot provide the
necessary stale-operation fence". Reported to the owner 2026-09-20; the quest
is unsealed pending that judgment.
