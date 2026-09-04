# Tasks: Generic live query data plane

Candidate Quest ladder graduated from
[`solve/epics/generic-live-query-data-plane.md`](../../epics/generic-live-query-data-plane.md)
(the version-2 epic keeps the decision memo; executable detail lives here).

## Candidate Quest ladder

### 1. Canonical-plan dependency contract

Make live mode consume an ordinary `SqlCore` plan and expose the minimum
stable dependency description needed by `LiveQueryManager`: tables,
partition footprint and plan-maintenance capability. Remove independent
partition-key/range decisions from `QueryGroup`/`LiveQueryService` wherever the
canonical planner/resolver already owns them.

Falsifier: the same query cannot route to a different partition set merely
because it is live rather than one-shot.

### 2. Direct partition CDC subscription adapter

Replace `SystemTableCache.onCacheChange()` as the generic live-query event source
with selective subscriptions to relevant partition CDC owners. Reuse
`subscribeToCDCWithHandshake()`, stable subscriber ids, replay buffering,
MessageRouter routing, and existing topology owner interactions.

Keep the cache adapter only for the system-table observation cases that truly
consume the cache read model; it must not remain the generic data-plane owner.

Falsifier: a user-table live query on node A receives a write committed on a
remote partition without that table being propagated into every node's
`SystemTableCache`.

### 3. Gap-free snapshot/frontier cutover

Seal the initial-query/stream boundary using existing SQL snapshot/epoch and CDC
handshake/replay primitives. Decide and prove the precise frontier protocol.

Falsifier: continuously write across subscription startup/reconnect and prove no
relevant committed mutation disappears between the initial result and the live
stream. Duplicated internal delivery is acceptable only if the maintained
client result remains correct.

### 4. Result-maintenance split

Retain incremental insert/update/delete maintenance for plans that can be
safely maintained from CDC row events. Add the generic fallback: a relevant
change invalidates an unsupported/complex live plan, normal SQL re-executes it,
and the live owner emits reset/replacement rather than polling or fabricating
an unsafe delta.

Falsifier: a live query that is deliberately outside the first incremental
subset still updates after a remote write with no timer-driven read loop.

### 5. Grouping, lifecycle, topology and recovery

Make canonical query/dependency identity the coalescing key; reference-count
local consumers; update partition subscriptions across split/merge/move/leader
changes through the existing topology owner; and reconnect/resume/reset through
the same live-query owner.

Falsifier: N equivalent local consumers create one distributed subscription
footprint, and a topology change does not require consumers to resubscribe by
physical partition id.

### 6. Generic core/API surface and anti-polling guard

Expose the generic push-backed live query through the appropriate internal /
embedded / protocol adapters without making Admin WebSocket the semantic owner.
Add a regression proof/guard that an idle live subscription performs zero data
reads solely to discover change.

The strongest end-to-end proof should establish a live query, hold it idle long
enough to expose accidental polling, perform one remote committed write, and
observe an unsolicited update. Instrument SELECT/data-read counts so "zero
polls" is measured rather than inferred from code shape.
