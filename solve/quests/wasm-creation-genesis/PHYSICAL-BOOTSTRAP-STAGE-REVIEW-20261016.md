# Next connection: admitted physical bootstrap, review scope

Base: PR130 / 609f35524a40d3f7ce8ee6c5a2fdfe89c0859203.
The next dependency to prove is the actual WASM opening, before upper layers
may interpret it as completion. Use the existing lifecycle, opening transaction,
writer-state, peer identity and metadata owners. Consume an actual retained
manager preparation plus authoritative exact-token resolution; do not reserve
or invent authority inside the receiver.

Planned code: one admitted entrypoint on WasmServiceLifecycle, shared physical
identity derivation in runtime-service-replica-identity, common B and local
ADMITTED record in the existing application DB opening transaction before writer
metadata and port/transport. Writer INIT and committed apply bind the stored
common root. Native group and peer routes include incarnation and do not need
ACTIVE cache rows. Held bootstrap returns BOOTSTRAPPED_HELD and has no endpoint,
port allocation, user traffic, timer execution or metadata ACTIVE publication.
Closing actual native/KV resources writes local RETIRED before closing the DB;
this increment will not report metadata CLOSED or grant successor permission.

Review decision before production edits: acceptable bounded implementation
boundary under existing R2, but NOT complete creation/genesis acceptance. No
new runtime backend, scheduler, journal, live-grant cache, generic activation,
W07/F1 interpretation, shared snapshot installer or release rule. Keep upper
manager automatic CREATE and recovery activation held until lower grant and
joined lifetime integration are also implemented. Existing unbound diagnostic
fixtures are historical dependencies, not new bound-route fallbacks.

Tests before source: actual retained preparation and real metadata owners with
explicit SQLite read/journal adapters; real physical filesystem, port/mirror
owners and native RF3 with controlled transport and VirtualTimeSource. Assert
common root/token/qualified identity; no allocation/endpoint while held; live
metadata refusal has no disk/registration effect; old INIT before first new INIT
cannot pick incarnation; proper INIT actually applies across RF3. Declare raw
native/SQLite evidence separately from replicated metadata and host-level
process exclusion. No full native guest execution or multi-host proof claim.

## Author review before frozen local-lab candidate

The first diagnostic run proved an actual three-peer native group and matching
INIT receipt, but retained-start refusal escaped the normal typed start result.
The existing start owner now reports a refusal and never successful bootstrap
when initialize fails or stop overtakes it. The first missing-method baseline
and the initial unengaged cleanup fixture typo remain separate apparatus evidence.
A supplemental test initially expected uppercase STOPPED instead of the existing
lowercase owned state. That assertion now imports the existing state constant;
its first failure is an apparatus correction, not a source-safety negative.

Review found a real retirement gap: the native/database release tail could write
local RETIRED and close the file after the activity owner failed. A new witness
first failed FAILED_ACTIVITY_RELEASED_DATABASE_CUSTODY. A second schedule then
exposed a failed opening's already-running cleanup ignoring a later failed stop:
OVERTAKEN_STARTUP_CLEANUP_RELEASED_DATABASE. Release now consumes the lifecycle
owner's live outstanding activity-failure record just before local retirement,
not a stale per-call cleanup result. Only successful exact activity teardown
clears this record. Null and undefined failures remain represented by a record,
not mistaken for no failure. Native/borrowed-KV teardown is still attempted;
file custody and ADMITTED are retained until the remaining owner succeeds.

The added retained-image tests consume a real SQLite backup after closing all
old handles. Removing the native rows cannot silently re-found retained common
identity; copying the file cannot transplant its receiver-local canonical path.
These are disclosed storage faults, not actual process or power-loss claims.

The final test bytes will be frozen before source-only mutation and private-lab
measurement. Local diagnostic results do not substitute for those measurements.
The full ordinary manager/adapter/rebalancer handoff remains held: callers must
not convert BOOTSTRAPPED_HELD into RUNNING/COMPLETED. Artifact content verification,
upstream selection-request durability, serving grant/local PUBLISHED, metadata
CLOSED reconciliation, retained-published restart without metadata, and the
replicated-metadata/process-loss/physical-multi-host milestone remain open.

The final pre-lab review also froze the captured opening object and its property
on the actual replica using the existing bounded JSON and deep-freeze owners.
Neither mutation of the caller's original request nor mutation/replacement of
the returned replica's opening can change the root between creation and start.
The first immutability witness failed before this correction and passes after it.

Quality changes consume the existing KV-table-name owner instead of the earlier
inline copy, and remove a redundant derived group-ID field. The group/peer map
has one identity producer. The unbound opening result is explicitly tagged;
ordinary unbound execution is retained in its existing path, not falsely counted
as admitted R2 activation. The full production handoff must still exclude any
old unbound route for services moved onto the new selected-instance protocol.
