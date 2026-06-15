# WS0 — CDC Ordering / Reorder-Safety Audit

**Date:** 2026-06-15
**Method:** four independent read-only subagent investigations (scope, apply
semantics, healer coverage) + one adversarial verification pass tasked with
*refuting* the negative conclusion. All claims below carry file:line evidence in
the investigation records; key citations inlined.

## Verdict

**FAIL — the overlay is NOT viable as designed.** The gate's three criteria do
not all hold. The design's §4 safety argument rested on transient DELETE
divergence being "healed by the 30 s anti-entropy reconciler"; **that reconciler
is unwired and structurally incapable, and no general healer deletes a resurrected
cache row.** Under the reorder/duplication a spray overlay introduces, dropped or
reordered DELETEs would **permanently diverge** caches across ~18 of the 19
propagated tables.

Per the WS0 contract, **STOP — do not proceed to WS1** until a reliability
substrate is added to the design (see Remediation). This is the gate working as
intended: a fatal-as-designed assumption caught before any code.

## Scope — what the spray would actually carry

The CDC group-propagation path the spray replaces carries a **static, policy-driven
set of 19 system tables** (`internalCachePropagation: true` in
`src/cache/cdc-table-policy.js`), **all three operations** (INSERT/UPDATE/DELETE),
unfiltered by operation:

`nodes, partitions, services, message_groups, tables, schema_migrations, indices,
node_endpoints, service_definitions, service_endpoints, replica_operations,
storage_reservations, control_plane_publications, config, sql_transactions,
sql_transaction_participants, debug_sessions, latency_groups, inter_group_latencies`.

Opt-in is the single `internalCachePropagation` flag; everything downstream
(`CDC_PROPAGATED_TABLES` → `CACHE_HYDRATION_TABLES` →
`shouldAttachPartitionCdcPropagation` → per-table subscriber) derives from it.
The other 14 system tables ride a different mechanism and are out of scope.

## Criterion (a) — no consumer needs operation order beyond convergent state

**PASS (with caveat).** No append-only / op-log consumer was found among the 19
tables; e.g. `transition_history`-style state is read latest-row-wins
(`readPreferredPublicationField`), not replayed. The real risk turned out not to
be op-order at all, but the DELETE and tie semantics below.

## Criterion (b) — DELETE resurrection is transient and healed

**FAIL — permanent for ~18/19 tables.**

- **No tombstone.** `applySystemTableChange` DELETE is a hard `table.delete(key)`;
  a DELETE for an absent key is a silent no-op (`system-table-cache.js:531-552`).
  The only guard is a timestamp check against the *currently present* row — once
  the row is gone, the guard is gone with it.
- **Reorder → permanent resurrection.** A DELETE delivered before its matching
  INSERT/UPDATE leaves no trace; the later INSERT/UPDATE recreates the row
  unconditionally (`:463`, `:473`) and it stays.
- **No healer removes it.** Verified against the doctrine's "absence proves
  nothing":
  - `topology-anti-entropy-reconciler.js` — the one purpose-built full-surface
    sweeper — is **not constructed anywhere in production** (only its own files +
    unit test reference it); it is also enqueue-only and keys off *existing*
    durable rows, so it is structurally incapable of detecting a cache-only
    resurrected row even if wired.
  - CDC authoritative catch-up (wired into join readiness) re-reads every
    propagated table **UPSERT-only** — never deletes
    (`cdc-integration-service-authoritative-catchup.js`).
  - Initial cache hydration is **INSERT-only and does not clear the table first**
    (`cache-hydration-service.js:176-191`) — rejoin does not heal resurrection.
  - No Merkle/digest/version-vector anti-entropy and **no TTL/expiry** exist on
    the cache.
- **Narrow exception (does not save the design):** `services` rows of
  `service_type = message_group` have an *opportunistic* delete-missing healer via
  forward-topology repair (`message-group-forwarding-owner-delivery-methods.js`,
  default reconcile intent resolves to `DELETE_MISSING`). It is scoped to that one
  table+shape and gated on a `FORWARD_LEADER_UNKNOWN` forwarding error — not a
  periodic sweep. Every other table, and `services` rows outside that scope, have
  **no deleting healer**.

## Criterion (c) — stale-backfill mutation is benign

**PASS.** The generic stale path (`applyStaleRowBackfill`) only fills fields that
are currently `null`/`undefined`; it never overwrites a populated field, is
idempotent, and is commutative except first-writer-wins on the *same* null field
(converges to a stable value). The `control_plane_publications` structured merge
is genuinely commutative/idempotent for the convergence-critical state (node-id
sets union at equal revision; higher `publication_epoch` wins deterministically
across revisions; `updated_at = max`, `created_at = min`).

## Criterion (d) — discovered: equal-`updated_at` UPSERT tie

**FAIL (minor, bounded).** Not in the original gate, found during the audit. For
every non-publication table, an exact-millisecond `updated_at` tie makes
`isStaleForExistingRecord` return `false`, so `mergeRecords` applies a
`{...existing, ...incoming}` overwrite — **last-delivered-wins**. Two replicas
receiving the same equal-timestamp pair in different order permanently diverge on
any differing field. Bounded by exact-ms write collisions for the same key;
reorder amplifies reachability. `control_plane_publications` has the same residual
confined to *scalar* fields at equal epoch+timestamp (node-membership stays
convergent).

## Why this also matters beyond the overlay (independent finding)

The DELETE-resurrection gap is **a latent property of the system today**, not only
of the spray. The current grouped/safe CDC path does not guarantee exactly-once
DELETE delivery; a node that misses a DELETE (transient partition, delivery
failure) and later catches up via the **UPSERT-only** catch-up keeps the row
**forever** for ~18 tables. The spray would widen the reorder window, but the
underlying healer gap pre-exists it. **Recommend opening a closure-ledger entry /
Quest for "no anti-entropy loop deletes resurrected cache rows"** independent of
this overlay — it is the kind of permanent-divergence liveness gap the convergence
work has been chasing. (Note the purpose-built `topology-anti-entropy-reconciler`
was *written* for exactly this and never wired in.)

## Remediation — what would make the overlay viable

The overlay cannot assume convergent-state apply is sufficient. It needs a
reliability substrate. Options:

1. **(Recommended, overlay-local) Per-origin sequencing + gap-fill.** Attach a
   monotonic per-origin sequence to each sprayed event; receivers detect gaps and
   pull missing events (this is the Plumtree lazy-IHAVE machinery already slated
   for WS3, pulled forward). Turns the overlay from "pure convergent-state gossip"
   into reliable, per-source-ordered broadcast — fixes **both** DELETE reorder
   (b) and the equal-ms tie (d) without touching the shared apply path used by all
   other subsystems. Lowest blast radius on a convergence-fragile cache.
2. **(System-wide, invasive) DELETE tombstones + version fence** in
   `applySystemTableChange`: retain a tombstone carrying the delete's version;
   reject older resurrecting upserts; GC after a bound. Makes the apply path
   genuinely order-insensitive and *also* fixes the latent existing bug — but
   changes the cache every subsystem depends on. Higher risk.
3. **(Backstop, recommended regardless) A real periodic anti-entropy sweep** that
   deletes cache-only rows absent from authoritative truth, generalizing the
   `services` forward-topology delete-missing pattern to all 19 tables (i.e. wire
   or replace the dead `topology-anti-entropy-reconciler`). Bounds *any*
   resurrection to one sweep interval instead of forever. Worth doing as
   standalone hardening for the independent finding above; complements (1).

**Recommended path:** add a prerequisite workstream **WS0.5 — overlay reliability
substrate** (option 1) *before* WS1, and separately scope option 3 as general
hardening. Re-run WS0's criteria against the amended design before resuming.

## Disposition

- WS0: **FAILED as designed → STOP.** Spec status updated; WS1 blocked on WS0.5.
- New prerequisite: WS0.5 (per-origin sequence + gap-fill).
- Independent recommendation: open a closure-ledger/Quest for the pre-existing
  resurrection healer gap (option 3).
