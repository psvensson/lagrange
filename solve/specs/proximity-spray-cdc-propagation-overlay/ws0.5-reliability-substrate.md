# WS0.5 — Overlay Reliability Substrate (per-origin sequencing + gap-fill)

**Status:** Proposed prerequisite for WS1, added after the WS0 FAIL
(`ws0-ordering-audit.md`).
**Pairs with:** Quest `cdc-cache-delete-resurrection` (the system-wide
anti-entropy sweep / latent-bug fix). WS0.5 makes the *overlay* reliable; the
Quest makes the *cache* self-healing. Both must land and WS0's criteria must
re-pass before WS1 is unblocked.

## Problem (from WS0)

Pure convergent-state gossip is insufficient for the 19 propagated tables on two
counts:

- **(b) DELETE reorder → permanent resurrection.** No tombstone; a DELETE applied
  before its matching INSERT is lost and the row is recreated permanently. No
  general healer deletes it.
- **(d) Equal-`updated_at` UPSERT tie → last-delivered-wins divergence.** Reorder
  makes two replicas settle on different field values.

The overlay must therefore deliver each origin's events **reliably and in
per-origin order**, and a backstop must heal genuinely-lost DELETEs.

## Goal

A DELETE is never applied before the INSERT/UPDATE it supersedes from the same
origin; lost events are detected and pulled; and any residual resurrection is
swept. Concretely: a reorder/drop fuzz test (incl. DELETE-before-INSERT and
equal-ms UPSERT ties) converges all replica caches identically, and the WS0
criteria re-pass.

## Verification outcome (2026-06-15) — APPROACH REVISED

Two read-only verification passes resolved the load-bearing assumptions. Both
**ordering**-based foundations are shaky; the recommendation pivots to a
**version-fenced LWW-with-tombstones apply path** instead.

- **Per-node-origin ordering — DEAD.** CDC is emitted by the owning partition's
  current **Raft leader** only (`partition-service-entry-apply-base.js:603` gates
  `generateCDCEvent` on `isLeader`). Across handoff/restart/rebalance the publisher
  changes mid-key-lifecycle (INSERT from node A, DELETE from node B). The only
  monotonic counter (`cdcEventSequenceNumber`) is per-node, resets to 0 on restart,
  and is stripped at the propagation boundary anyway (only `{tableName, operation,
  data}` survive).
- **Per-partition `(partitionId, raftIndex)` ordering — viable but costly and not
  structurally safe.** Assumption 1 (durable leadership-spanning index at the emit
  point) is **FALSE as built**: liferaft discards index/term at
  `emit('commit', entry.command)` (`node_modules/@markwylde/liferaft/index.js:946`);
  the `command` carries only a uuid `entryId`. Threading the real index/term means
  patching the vendored consensus boundary + widening the envelope. Assumption 2
  (one partition per key) is **CONDITIONAL**: true in today's default topology
  (1 system table → 1 fixed `<table>-p1` partition, routed by table name), but only
  5 of ~19 propagated tables are hard-fenced against split (`evaluateSplitCriteria`
  / `PRIORITY_CONTROL_PLANE_TABLE_IDS`), and `evaluateMergeCriteria` is unguarded.

### Recommended approach (A): HLC-versioned LWW + DELETE tombstones

The verification revealed that **ordering is the wrong tool** — both ordering
foundations rest on shaky assumptions. The system already computes a per-write
**HLC** (`entry.timestamp`, `partition-write-kernel.js:34`) that is globally
comparable by design (physical, logical, nodeId tie-break) and there is already
HLC-comparison machinery (`compareSchemaVersions` / `tryParseHLCTimestamp` in
row-merge). The divergence exists only because:
1. the origin HLC is **stripped** at the propagation boundary (so the receiver
   re-mints its own clock), and
2. DELETE keeps **no tombstone**, so a late/lost DELETE cannot fence a resurrecting
   write.

Fix both and the apply path becomes a true **HLC-LWW state CRDT with tombstones**,
which is **order-insensitive** — making the original §4 "pure unordered spray is
safe" goal actually true, with **no per-origin sequencing, buffering, or
gap-ordering machinery**, and **independent of which node/partition emits**
(sidesteps both broken assumptions above). Concretely:
- Carry the origin HLC end-to-end on the propagated envelope (small change to the
  boundary that currently narrows to the triple).
- Compare HLC (not raw `updated_at` ms) in `isStaleForExistingRecord` → fixes the
  equal-ms tie (d).
- On DELETE, retain a **tombstone** keyed by the row key + delete HLC; reject any
  later write with an older HLC; GC tombstones on a bound tied to the sweep → fixes
  resurrection (b), regardless of origin.
- The Quest `cdc-cache-delete-resurrection` sweep is the GC bound + backstop.

**This MERGES WS0.5 into the Quest's territory:** the apply-path hardening
(tombstones + HLC-LWW) belongs in the cache layer the Quest already targets. Once
it lands, the overlay needs only the sweep backstop + the carried HLC — the heavy
ordered-delivery substrate below (Alternative B) is unnecessary.

### Keystone verification outcome (2026-06-15) — A is CONDITIONAL on a clock fix

Two passes resolved it. **Approach A is viable but NOT free** — it depends on
fixing a latent HLC bug first. Findings:

- **HLC type + compare: correct.** `src/hlc/hlc-timestamp.js` encodes
  (physical, logical, nodeId); `compare` is a total order; `compareSchemaVersions`
  / `tryParseHLCTimestamp` already consume it. Good.
- **CRUX — cross-leader monotonicity: BROKEN as built.** The HLC `update(remote)`
  merge primitive exists (`hlc-clock-service.js:79-131`) but is called in **exactly
  one place — the message-group messaging path**, NOT the partition Raft apply path.
  `applyCommittedEntry` (`partition-service-entry-apply-base.js:553-672`) never
  calls `hlcClock.update(command.timestamp)`, and `proposeWrite` stamps from a
  private local `now()` (`partition-replication-handler.js:179`). So a new leader B
  whose wall clock is behind old leader A (skew up to `MAX_DRIFT_MS=500ms`, only
  logged, never corrected) can stamp a DELETE with a **lower** HLC than A's earlier
  INSERT → the tombstone fence would wrongly reject the DELETE → **resurrection**.
- **Restart: BROKEN.** The clock constructor seeds from `Date.now()` with no
  persisted high-water mark (`hlc-clock-service.js:25-28`) → can regress after a
  crash.
- **Row carries only wall-clock `updated_at` ms, no HLC.** `updated_at` is
  `Date.now()` (`cdc-integration-service-insert-normalization.js:98-113`). A column
  name `updated_at_hlc` appears in version-candidate lists but is **never written**.
  So the HLC must be carried on the envelope and **stored per-row** (populate
  `updated_at_hlc`) to be comparable at apply time.
- **Carry change is small + isolated.** The origin HLC (`entry.timestamp`) is
  stripped at 4 well-shaped hops (`node-joining-publication-activation.js:655`,
  `seed-runtime-bridge-owner.js:169`, the propagation/delivery layer) and re-minted
  at the receiver (`message-group-service-cdc-propagation-runtime-methods.js:258`),
  which **already consumes `payload.timestamp` if present** — so only the senders
  need to stop stripping. Swapping the generic compare in `isStaleForExistingRecord`
  to HLC is **isolated** from the `nodes` heartbeat-watermark and
  `control_plane_publications` epoch branches (they key on different fields).
- **Tombstone GC bound: finite today (~2s live retry envelope; use ~10s margin)**
  — but **only because the 30s anti-entropy sweep is dead code**. If a sweep is
  revived (recommended — it reconstructs from durable truth), GC policy must become
  **"GC only after the delete is durable,"** not a fixed timer.

**Net:** Approach A requires, in order: (1) **fix the HLC clock**
(merge-on-apply: `applyCommittedEntry` calls `hlcClock.update(incoming)`; +
persist/warm a high-water mark across restart) — this is a latent correctness bug
in its own right; (2) carry the origin HLC end-to-end and store it per-row
(`updated_at_hlc`); (3) HLC compare in `isStaleForExistingRecord`; (4) DELETE
tombstones with a durable-aware GC bound; (5) the anti-entropy sweep backstop. All
bounded and principled, and all touch the cache/clock layer the Quest already
targets — but it is foundational work, not a thin overlay add-on.

> **Independent finding (surface to convergence work):** the HLC does not
> merge-on-apply and resets on restart — so the system's causal ordering currently
> relies silently on wall-clock sync within 500ms, defeating the point of an HLC.
> This is a latent correctness bug that can produce ordering ambiguity and equal-ms
> ties on its own, independent of the overlay. Candidate for its own
> closure-ledger/Quest, or fold into `cdc-cache-delete-resurrection`.

## Alternative B (heavier — ordered delivery; NOT recommended)

Retained for comparison. Superseded by Approach A above because it rests on the
two shaky ordering assumptions and touches the consensus boundary + partition
split/merge policy. Only revisit if HLC-LWW+tombstones (A) proves unworkable.
**If pursued, the "origin" must be the partition Raft log, not the node, and it
requires:** (a) threading `(partitionId, raftIndex, term)` from the liferaft
commit through `generateCDCEvent` into a widened envelope (patch
`emit('commit', …)` at `liferaft/index.js:946`), and (b) hard-fencing all ~19
propagated system tables against split/merge (extend
`PRIORITY_CONTROL_PLANE_TABLE_IDS` / `evaluateSplitCriteria` and guard
`evaluateMergeCriteria`).

### 1. Per-origin sequence + epoch

Each origin stamps every sprayed event with `{originNodeId, originEpoch,
originSeq}`:
- `originSeq` — monotonic counter, incremented per event the origin sprays.
- `originEpoch` — the origin's incarnation (bumped on restart, so a reset
  `originSeq` is not confused with old sequence numbers). Source it from an
  existing incarnation/boot id if one exists; otherwise mint one at boot.

### 2. Receiver: in-order apply per origin (fixes reorder — case b-reorder, d)

Each receiver tracks `expectedSeq[originNodeId, originEpoch]` = highest
contiguous applied seq + 1. On receive:
- `seq < expected` → duplicate/old → drop (dedup LRU already covers this).
- `seq === expected` → apply via the existing `applyCDCEvent`; then drain any
  buffered contiguous successors; advance `expected`.
- `seq > expected` → **buffer** in a bounded per-origin reorder buffer; do **not**
  apply yet. This is what prevents a DELETE (seq N) from landing before its
  INSERT (seq N-1).
- `originEpoch` newer than tracked → reset `expected`, drop the buffer, trigger
  authoritative catch-up for that origin (§4).

Per-origin total order also resolves the equal-ms UPSERT tie (d): two replicas
apply the same origin's events in identical seq order, so `mergeRecords`
overwrites converge.

### 3. Gap detection + pull repair (fixes lost events — case b-drop)

A buffered gap that does not fill within `proximity.gapFillTimeoutMs` indicates a
*lost* event, not mere reorder. Repair via the Plumtree lazy layer (pulled
forward from WS3):
- Peers periodically advertise the `(originNodeId, originEpoch, seqRange)` they
  hold (lazy IHAVE).
- A node missing `seq` sends a GRAFT/pull to a peer advertising it; the peer
  replays the event(s). Apply pulled events through the same in-order path.
- Bound: pull retries capped; on exhaustion, fall back to authoritative catch-up
  for that origin/table (§4).

### 4. Fallback: authoritative catch-up + sweep backstop

- **Per-origin catch-up:** on epoch change, buffer overflow, or pull exhaustion,
  re-read the affected table(s) from the authoritative owner path (the existing
  `cdc-integration-service-authoritative-catchup` mechanism) and reset state.
  Note: catch-up is **UPSERT-only** today — it does not remove a resurrected row,
  which is why the sweep below is required.
- **Anti-entropy sweep (delivered by Quest `cdc-cache-delete-resurrection`):** a
  periodic sweep that deletes cache-only rows absent from authoritative truth,
  generalizing the `services` forward-topology delete-missing pattern to all 19
  tables (wire or replace the dead `topology-anti-entropy-reconciler`). This is
  the final backstop that bounds *any* residual resurrection to one sweep interval
  — and independently fixes the pre-existing latent bug regardless of the overlay.

## What fixes what

| WS0 failure | Fixed by |
|---|---|
| (b) DELETE before INSERT (reorder) | §2 in-order per-origin apply |
| (b) DELETE genuinely lost (drop) | §3 gap-fill pull → §4 sweep backstop |
| (d) equal-ms UPSERT tie | §2 per-origin total order |

## Integration

- Sequence stamping: in `ProximitySprayService.propagate` (WS1) at the origin.
- Reorder buffer + in-order apply + epoch handling: in the receive handler
  `handleProximitySprayMessage` (WS1), reusing the dedup LRU.
- IHAVE/GRAFT pull: the WS3 lazy layer, implemented here instead of WS3.
- Sweep: the separate Quest; WS0.5 depends on it as the safety net.
- Config additions: `proximity.gapFillTimeoutMs`, `proximity.reorderBufferMax`,
  `proximity.ihaveIntervalMs`, `proximity.pullRetryMax`.

## doneWhen (WS0.5)

A deterministic reorder/drop fuzz harness over the apply+overlay path shows all
replicas converge identically for: DELETE-before-INSERT, lost DELETE, duplicate
delivery, and equal-ms UPSERT ties — and the WS0 audit criteria (b) and (d)
re-pass. Only then is WS1 unblocked.

## Open questions

1. Single-owner-per-key (verify FIRST — §"Load-bearing assumption").
2. Origin epoch source — reuse an existing boot/incarnation id, or mint one?
3. Buffer sizing vs. expected reorder window under the spray's `maxHops`.
4. Interaction with the existing per-partition CDC ordering — is there already a
   sequence on CDC events we can reuse as `originSeq` rather than minting a new
   one? Check the CDC event envelope before adding a field.
