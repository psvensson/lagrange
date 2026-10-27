# U1 v3 addendum: deferred exact-creation hydration

Status: **PROPOSED for independent review; no implementation approval.**

Author: `subagent:/root/u1_inventory_lifecycle`, 2026-10-18.

This append-only clarification extends approved v3 and its D2/D3 addendum
(`6f010cc376fd3ff6bd0d7d07892636967eb3ad343915364f4c80a35c5450c048`,
`401f90a5f09a3056573ee1d8ab8b57cee6135c721355295e0e1506ceb93303ae`). It
addresses ordinary CREATE admission, which initially has only the coordinator
operation/entity/replica envelope and therefore cannot yet match a full wake.

## Admission and hydration order

The handler installs its existing exact canonical gate entry synchronously,
then acknowledges without awaiting a journal dependency. Its existing
deferred execution first obtains the original retained creation through the
manager's journal-only `readRetainedCreation`. No reservation, policy check,
prepare, start or local file operation runs during hydration. Applied inventory
plans and retained memos already holding that validated immutable origin skip
this extra read; their ordinary one resume rereads the authoritative journal.

After the hydration await the handler checks its live lifetime and exact
installed entry object before retaining any result, admitting any effect or
emitting an outcome. A stopped or superseded entry has no further effects.
The original operation ID, logical entity, canonical replica and retained node
must match the captured request. Any full intent, descriptor, binding, request
or resource token supplied by the coordinator must match its corresponding
retained value. Mismatch is CONTENT_CONFLICT with no bound resume. Mutable
request objects are never consulted after admission in place of this capture.

`readRetainedCreation` may add the already-validated intent and explicit
`token: null` to NOT_ADMITTED. This is original journal content, not a grant.
The entry retains that original body solely for dispatch and wake identity;
the manager's ordinary resume remains the only continuation that can retain
an actual admission token and enter physical work. The retained intent is not
replaced by later input or wake content.

## Complete hydration outcome table

| Journal-only answer | Deferred CREATE behavior |
| --- | --- |
| ADMISSION_RETAINED with matching full origin | Retain the exact origin on the installed entry, then call ordinary resume once. Its policy/resource owners still decide progress. |
| NOT_ADMITTED with matching validated intent and token:null | Retain the immutable body as an enqueue-only wake hint, then call ordinary resume once. Admission is read/written by that resume, never taken from a wake. |
| TERMINAL_OPERATION | Use the existing typed terminal CREATE refusal with the observed terminal state and zero physical work; settle any matching retained plan's journal debt. |
| INTENT_NOT_FOUND | Classify the current definition using the existing route. A bound-class definition gets BOUND_ROUTE_REQUIRED; a generic definition keeps the existing generic create fallback. No bound intent is manufactured and no bound resume runs. |
| UNAVAILABLE / UNKNOWN | A bound-class definition gets the existing retryable UNAVAILABLE/UNKNOWN deferral; there is no blind bound resume after failed hydration. The existing generic fallback is preserved for the same unrouted unavailable class. |
| Corrupt or conflicting retained row, invalid lineage or other permanent typed refusal | Emit the existing typed CREATE failure under the original request, preserve any current different memo, and run no bound resume or physical work. |

The additional journal read belongs to hydration of an otherwise unknown
original; it is not a second reservation or resume. Each admitted attempt has
at most one such hydration and at most one ordinary bound resume. A known
inventory origin does not add a hydration read, including an original PENDING
future intent whose native event source does not yet exist.

## Wake and retry consequences

Before hydration there is no exact local wake target: a wake returns
NO_LOCAL_OPERATION, leaves no pending bit and installs no token. In the normal
first-start path legitimate native progress is delivered after hydration,
from inside the resumed physical start. A wake from already-existing physical
work that arrives earlier need not be replayed: the already queued explicit
resume freshly observes the original journal, local genesis and resource
owner through its ordinary continuation. If that attempt remains unavailable,
the original explicit CREATE retry or restart remains the declared trigger.

Once hydrated, full binding and token/request matching use the existing
capture and `matchesInstanceResourceToken` owner. A null-token entry accepts
only a matching immutable-request wake as an enqueue hint; the actual token
is never copied from the wake. All existing R5 unavailable-grant suppression
and record-only RESOURCE_CLOSED behavior remain in force. No new listener,
observer array, scheduler, timer or durable store is introduced.

## Binary additions and fixture adaptation

1. Preserve the immediate-after-first-ACK case as a negative control:
   NO_LOCAL_OPERATION, no bit and one eventual ordinary resume. Adapt its
   positive control to deliver the exact wake from the first runtime start,
   after the real journal hydration, proving recorded/queued behavior without
   accepting an operation ID as identity.
2. Suspend hydration; stop the handler or replace the installed entry; then
   release the read. Assert no memo write, outcome, resume or physical call.
3. Make journal hydration unavailable for a bound request. Assert typed
   deferral, original nonterminal row, zero reserve/prepare/start and released
   gate. Restore the real reader and redeliver the same original request;
   assert one resume with unchanged original intent/token and normal progress.
4. A matching PENDING intent hydrates with token:null. Foreign binding/token
   wakes do nothing; a matching hint never mutates the retained journal/token.
   Include terminal, absent and mismatching-envelope controls with zero bound
   effects and the unchanged generic fallback where specified above.

This deliberately amends the synthetic expectation that any correctly shaped
wake immediately after first ACK is already locally attributable. It preserves
nonblocking admission, exact original identity and the established retry
owners instead of widening identity matching to satisfy that fixture.
