# Exact-incarnation native history at opening

Status: bounded WIP, not independently accepted or landed. Input source is the
current PR117 candidate 5833c254, published unchanged at 0d9d3600. Local mirror
is reconstructed from retained source and patches, not that Git commit.

## Complete owner interaction

The existing lifecycle row gains native_history_state with NEVER_OPENED and
ESTABLISHED values; legacy NULL is UNKNOWN. This is not a copy of current native
rows: it records the monotonic fact that an incarnation once obtained a durable
native opening, which must survive deletion of the native rows themselves.
Only the lifecycle owner writes it. The operation port supplies exact-incarnation
read/write closures to the existing runtime; no public caller sets this fact.

New lifecycle allocation writes NEVER_OPENED. Runtime admission first reads the
native record through its store and the lifecycle fact through its owner. The
existing opening predicate still enforces the host IDENTITY_EXISTED and bootstrap
mode. With no native record, ESTABLISHED or UNKNOWN refuses RESEED_REQUIRED
before create_node; a current NEVER_OPENED allocation may proceed only when the
existing bootstrap/host predicates also permit it. Unavailable reads remain
typed host failures; invalid identity/state cannot become NEVER_OPENED.

Fresh create_node has no published port, role callbacks or delivered messages.
Its initial applied/configuration row and the exact-incarnation ESTABLISHED
write use one SYNCED transaction through the existing durable store. Failure
rolls back both. The runtime remains unservable and refuses its opening. A
crash before commit leaves NEVER_OPENED and no accepted participation; a crash
after commit leaves both. A legacy intact record can establish the witness
under a synced commit before native reconstruction; legacy absence fails closed.

Snapshot staging is an authorized imported history, not a fresh genesis grant.
Its lifecycle operation marks the private staged incarnation ESTABLISHED before
returning; a failed stage is never published. This does not resolve the separate
receiver-database validation finding 4247979520. The snapshot owner retains that
open obligation and all CREATE, marker and atomic swap guards.

## Source surfaces

- src/raft/raft-rs-replica-lifecycle-owner.js: constructor owns schema/allocation;
  prepareReplicaLifecycleForSnapshot owns private staged lifecycle creation.
- src/raft/raft-rs-runtime-owner.js: readOpeningRecord,
  openingParticipationRefusal, openGroupInCurrentRuntime and factory cleanup.
- src/raft/raft-rs-durable-store.js: transaction(work, SYNCED) and
  putBootstrapAppliedState define the actual commit boundary.
- src/raft/raft-rs-operation-port.js: the sole lifecycle/runtime composition.
- src/raft/raft-rs-participation-gate.js: openingWithoutRecordRefusal preserves
  the original host/bootstrap predicates alongside the owner-supplied fact.

## Failure, identity and lifetime

The fact is anchored to group, peer, replica identity and incarnation. Updates
require exact active row and known predecessor history value. Missing or foreign
row, write failure and unreadable record remain refusals, not idempotent success.
No current-history decision comes from application rows, cached status or another
service's row. Retired rows never reopen. Host external prior-existence remains
necessary for complete database-file loss; this unit does not claim whole-file
loss safety when every local witness is lost and the host supplies no fact.

The only view is the synchronous opening observation, revalidated at the exact
write. It cannot authorize after an await. No new retry clock or coordinator.
A failed unpublished native node retains a release obligation with its runtime;
recovery never publishes a port or membership callback from that failure.

## Required witnesses

Retain the ordinary failing WASM loss assertion and intact service control. Add
real port/SQLite witnesses for failed bootstrap write rollback and retry, a
refused pre-native opening, legacy intact/unknown history, exact identity,
unavailable history read, deferred identity acknowledgement, imported history,
and genuine separate-process cold restart. Preserve baseline and source-only
revert failures with unchanged tests; no setup failure counts as a safety red.
Selected native/service regression and impact tests must run on the same
candidate. All seven external ownership findings retain their existing
dispositions; cleanup masking, receiver snapshot state and transaction migration
are open separate obligations, not silently absorbed or declared fixed.

## Explicit witness evolution after first measured candidate

The old durable-commit-sync witness classified bootstrap as unconditionally
NORMAL-cost work. That was correct before bootstrap carried this new durable
local-history fact. This narrow performance clause is superseded: bootstrap
and its establishment fact require one FULL commit; ordinary application and
non-must-sync Ready work retain NORMAL. The observer recognizes the actual
bootstrap statement inside its transaction, and the successor asserts exactly
one such commit per replica. It does not exempt all non-persist transactions.

The deliberate raw-runtime lifecycle-bypass mutant now supplies a forged
ESTABLISHED history fact; it intentionally bypasses the owner like before.
Its original disruptive-term and retired-real-port refusal assertions remain
unchanged. A fixture failure due to missing new private callbacks does not
count as a safety refusal or a proof against the mutant.
