---
id: generic-live-query-data-plane
status: superseded
proof: deterministic
legacy: true
roadmapRow: null
graduatesTo: null
quests: []
authorizes: []
legacyStatus: null
---

# Generic live query data plane

## Intent (why now)

Lagrange already contains most of the ingredients for scalable reactive data:
partition CDC, subscription handshake/replay, `LiveQueryManager`, `QueryGroup`,
`LIVE SELECT`, client fan-out, and topology-change handling. The missing piece is
ownership coherence. The current live-query startup path is centered on
`SystemTableCache.onCacheChange()`, while higher layers such as Images can fall
back to pull/history observation. That invites duplicated change propagation and
polling precisely where Lagrange already has a distributed event substrate.

The target contract is now documented in
[`architecture/live-query-data-plane.md`](../../architecture/live-query-data-plane.md).
The planning milestone is Phase 0.3 Queryable Core in the
[AGPL feature map](../../docs/steering/agpl-feature-map.md#phase-03--queryable-core).
This epic exists to turn that documented
contract into a sequence of implementation Quests without creating a parallel
query engine, CDC system, cache, or UI-specific watcher.

## Architecture constraints inherited from the documentation

These are not options for implementation Quests:

1. **No polling for distributed change detection.** Steady-state repeated
   SELECT/read/history/head checks are forbidden. Timers may own lease expiry,
   retry, recovery, or bounded reconciliation only.
2. **`SqlCore` keeps SQL ownership.** Live queries reuse the canonical parse,
   plan, execution, merge, and partition-resolution semantics. Existing
   live-query predicate/range code may be reused only after it is made
   subordinate to that plan; it may not remain a second SQL semantics owner.
3. **`PartitionService` CDC is the committed change source.** Reuse the existing
   subscriber handshake, buffer, replay, and event identity/continuity paths.
4. **Propagation is selective.** Generic user-table changes are routed only to
   nodes with relevant live interest; they are not broadcast cluster-wide like
   small cache-propagated control-plane tables.
5. **`LiveQueryManager` owns live subscription lifecycle and coalescing.** One
   equivalent node-local interest should create one distributed subscription
   footprint, regardless of how many local consumers share it.
6. **Snapshot + stream is gap-free.** Startup/reconnect must close the race
   between initial query result and CDC following. If exact delta continuation
   cannot be proved, reset to a fresh snapshot rather than silently losing a
   mutation.
7. **Any query may be live before every query is incrementally maintainable.**
   Safe simple plans can emit row deltas; other relevant CDC changes trigger
   normal query re-execution/reset. Both are event driven.

## Current implementation material to reuse

- `src/live-query/live-query-manager.js` — node-local subscription/group owner
  candidate and client fan-out.
- `src/live-query/live-query-group.js` — current grouping, partition-interest,
  and row-change evaluation material; duplicated routing/predicate semantics
  must be removed or delegated.
- `src/live-query/live-query-service.js` — `LIVE SELECT` parsing and predicate
  helpers; SQL semantics must converge on the canonical query path.
- `src/live-query/live-query-startup-wiring.js` — current cache-backed adapter;
  useful compatibility seam, not the generic application-data transport.
- `src/partition/partition-cdc-delivery.js` and `subscribeToCDCWithHandshake()`
  — existing subscription, buffering, replay, readiness, and stable subscriber
  machinery.
- `MessageRouter` and current CDC routing — transport substrate; do not invent a
  live-query transport beside it.
- partition-topology notifications already consumed by `LiveQueryManager` —
  preserve the owner interaction while replacing local partition/range policy
  with canonical resolver output.

## Candidate Quest ladder

The six-quest ladder (canonical-plan dependency contract, direct partition
CDC subscription adapter, gap-free snapshot/frontier cutover,
result-maintenance split, grouping/lifecycle/topology/recovery, generic
core/API surface with the anti-polling guard) is executable detail and lives
in [`solve/specs/generic-live-query-data-plane/tasks.md`](../specs/generic-live-query-data-plane/tasks.md).

## First acceptance consumer

Core should prove the mechanism with an ordinary application table before any
Images/Object Environment integration is required for completion. A primary-key
or narrow single-table query is the preferred first consumer because its
partition dependency is unambiguous and makes selective routing easy to
falsify.

After that proof, `lagrange-images` should be able to replace history polling
with a live query over its authoritative storage rows, while retaining Images'
own authorization/invalidation/reread semantics. The Object Environment should
then declare live interest from visible presentations rather than owning a
distributed watcher. Those are downstream acceptance consumers, not additional
core propagation owners.

## Options under discussion

- **Snapshot/frontier protocol:** subscribe-and-buffer before snapshot vs an
  explicit SQL read-epoch/frontier handoff. Choose the smallest protocol that
  gives a falsifiable no-gap guarantee using existing owners.
- **Client event shape:** canonical `snapshot/insert/update/delete/reset` vs a
  smaller `snapshot/change/reset` internal contract with adapter-specific row
  deltas. The semantic requirement is correctness, not preserving the current
  Admin WebSocket wire shape.
- **Distributed subscription placement:** connect the requesting node directly
  to each relevant partition leader vs introduce an intermediate query-group
  routing owner. Default lean is direct reuse of existing partition CDC/message
  routing unless evidence shows a missing scalability owner.

## Open questions

- What exact query-plan artifact should expose live dependencies without making
  `LiveQueryManager` inspect planner internals or duplicate partition routing?
- Which current SQL snapshot/epoch token can anchor the initial result to the CDC
  frontier, and where is the single owner of that handoff?
- What event identity/cursor is sufficient for resume and dedupe across leader
  failover and partition topology transitions?
- Which simple SELECT plan shapes form the first explicitly supported
  incremental-maintenance subset before the reset/re-execute fallback takes
  over?

## Decision log

- 2026-09-04 — Direction established: generic live queries are a core data-plane
  primitive, not an Images/Object Environment polling feature. Visible/selected
  state in higher layers may create transient live interest, but core owns
  distributed propagation.
- 2026-09-04 — Reuse decision: extend the existing live-query + partition CDC +
  MessageRouter owners. Do not add a cache layer or a second change-delivery
  subsystem.
- 2026-09-04 — Polling decision: steady-state distributed change detection by
  polling is forbidden, including as a temporary implementation mode. Complex
  queries may re-execute only when a pushed relevant change invalidates them.
- 2026-09-04 — Documentation contract recorded in
  `architecture/live-query-data-plane.md`; this epic must remain subordinate to
  that owner map and the Phase 0.3 roadmap direction.
