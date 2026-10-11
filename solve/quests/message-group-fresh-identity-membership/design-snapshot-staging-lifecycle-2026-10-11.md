# Snapshot staging lifecycle operation

Date: 2026-10-11  
Author: `subagent:freshmg_implementation_56` (GPT-5.6-sol, high)  
Status: proposed for author-distinct design review; no implementation approval implied  
Quest: `message-group-fresh-identity-membership`

## Source observation

The current FreshMG candidate fails the operation-boundary audit because
`src/raft/snapshot-install.js` imports and constructs
`RaftRsReplicaLifecycleOwner` directly. The call is in
`reconstructStagedRaftRsState` before the receiver-local durable Raft record is
written. This is real lifecycle construction outside its private owner, not a
stale expected-import list.

Current source fingerprints:

| Path | SHA-256 |
| --- | --- |
| `src/raft/snapshot-install.js` | `1412fe0c5e66afb51b17f9911e201a9b45ec781175016e7f81ce76bde73500c1` |
| `src/raft/raft-rs-replica-lifecycle-owner.js` | `206b8e6a8bbceb2afabdb96e14bdeb3553c895f677c57eb97b90fcad04a740ee` |
| `src/raft/raft-rs-lifecycle-administration.js` | `c8e49d822f02fe0976568746ee3e933d4f3ff9084ae703e7f240ea5bd2fb4529` |
| `scripts/checks/raft-rs-operation-boundary-audit.js` | `6fac076239196793ac827952a649add335eba8a2347c11167a1b8c9d2e684089` |
| `test/raft/raft-rs-backend/operation-port-boundary.test.js` | `3f2d3c3939a3b823ad40a591e26a8393befccfe16f94a19d67d54298fbe3f836` |
| `test/raft/raft-rs-backend/replica-image-checkpoint-transfer.test.js` | `65c3acfbc376d3ff0e172b9f28608c8421eaf744c0cef47b32774d88a095e15f` |

The current boundary audit permits lifecycle-owner imports only from the
operation-port constructor, the retirement administration module, and the
lifecycle owner itself. It permits the general retirement administration
surface only from the replica-removal coordinator. Granting either existing
surface to the snapshot installer would widen the wrong capability.

## Owner decision

Add one narrow interaction module:

`src/raft/raft-rs-snapshot-staging-lifecycle-operation.js`

It owns the intersection of snapshot staging, lifecycle row initialization,
install binding, and receiver-local Raft record reconstruction. Its one exported
frozen function accepts immutable staging facts and returns one deeply frozen
result. It never returns a database, durable store, lifecycle owner, constructor,
retirement method, callback, or reusable control object.

The import graph is exact:

1. `snapshot-install.js` may import only this staging operation for lifecycle
   initialization.
2. The staging operation may import only a narrow lifecycle-row initialization
   primitive from `raft-rs-replica-lifecycle-owner.js`.
3. The staging operation may use `RaftRsDurableStore` and the existing install
   binding table contract to form one staging transaction.
4. No other production module may import the staging operation or the narrow
   lifecycle-row primitive.
5. The snapshot installer may not import the lifecycle owner constructor or
   `raft-rs-lifecycle-administration.js`.

The operation-boundary audit records these exact edges and continues rejecting
every other import. This is a structural constraint over the AST import graph,
not an allowlist that excuses lifecycle SQL or constructor access.

## One lifecycle initialization decision

`RaftRsReplicaLifecycleOwner` and the staging interaction share one internal
initialization decision in `raft-rs-replica-lifecycle-owner.js`. The existing
constructor delegates to it; the staging interaction invokes the narrow row
primitive. The decision alone:

1. creates/upgrades the lifecycle table,
2. finds rows by both `(groupId, peerId)` and `(groupId, replicaIdentity)`,
3. refuses an identity collision,
4. refuses a missing lifecycle row when a durable Raft record already exists,
5. preserves an exact ACTIVE row only with caller-supplied existing-generation
   authorization,
6. never revives a RETIRED row,
7. stamps an old unstamped row once, and
8. inserts one new ACTIVE row with one newly minted incarnation only when no
   conflicting row or Raft record exists.

The constructor supplies its existing runtime-open authorization for an exact
row in the database it is opening. The staging interaction supplies existing-row
authorization only when the staging database already contains the exact install
binding for the same admitted CREATE attempt. The lifecycle decision remains the
only code that interprets lifecycle row identity and state. The staging
interaction decides only whether the separate install binding proves replay of
this same install.

## Staging database and binding admission

The operation receives:

- the opened `stagingDb`,
- the canonical staging file path,
- the destination replica database path,
- the STAGING marker's install ID and exact CREATE authority,
- the validated checkpoint descriptor,
- the expected receiver replica identity and peer ID.

Before mutation it requires:

1. the opened database filename equals the canonical staging path,
2. the canonical staging path and destination path differ,
3. the staging filename is the install protocol's fixed staging file,
4. the descriptor group, receiver reservation, learner membership, peer ID,
   and replica identity equal the already validated install request, and
5. the binding table is either absent/empty or contains exactly the same
   install ID and CREATE authority.

A live receiver database, a second file, an in-memory database, a sender path,
or a path alias to the destination is refused before any lifecycle or Raft row
mutation. The installer remains the only production caller and passes the path
it just copied and digest-checked. The operation does not open arbitrary paths.

The binding table remains `_raft_snapshot_install_binding`; no new durable
store or authorization row is added. On first staging, absent binding plus
absent lifecycle/Raft rows admits creation. On replay, an exact pre-existing
binding authorizes preservation of the exact ACTIVE lifecycle incarnation.
These states are refused:

- binding absent but lifecycle row present,
- exact binding but lifecycle row absent while any receiver Raft row exists,
- another install ID or CREATE authority,
- another peer or replica identity,
- RETIRED lifecycle row,
- lifecycle row without the exact replay binding,
- a partial/conflicting Raft record.

Thus an active row from a sender, older CREATE, conflicting receiver, retired
incarnation, or malformed payload is never adopted or revived.

## One atomic staging mutation

`RaftRsDurableStore` may create its empty record schema before the mutation.
The interaction then uses that store's `transaction` method so its own write
admission recognizes the transaction. Inside that one SQLite transaction it:

1. validates the existing install binding state,
2. invokes the one lifecycle initialization decision,
3. inserts or verifies the exact install binding,
4. writes applied state and ConfState with the membership generation,
5. writes hard state with receiver-local vote zero, and
6. writes the snapshot boundary with the same configuration generation.

Any refusal or throw rolls back the lifecycle row, binding row, applied state,
hard state, and snapshot row together. Empty schemas may remain in the throwaway
staging copy; no authoritative row may survive alone. The returned result names
the outcome, install ID, receiver identity, lifecycle incarnation, group, and
applied boundary as immutable scalar data only.

## Swap and recovery remain owned by snapshot install

The staging operation cannot rename, delete, clean, recover, or open the live
replica. `snapshot-install.js` retains:

- pre-staging checkpoint identity and digest validation,
- initial `revalidatePhysicalWorker` admission,
- marker creation and durable state,
- the exact `_raft_snapshot_install_binding` checks,
- `commitSnapshotInstall` revalidation at the actual rename,
- pre-install destination digest comparison,
- crash recovery and generation-matched cleanup.

The staged result does not authorize swap. A CREATE authority change, claim
loss, changed destination digest, changed binding, or successor generation still
refuses the actual rename through the current owner path.

## Proof plan

### Boundary and surface

1. `test/raft/raft-rs-backend/operation-port-boundary.test.js` passes with no
   lifecycle-owner import from `snapshot-install.js`.
2. The audit asserts the exact two new edges and rejects mutants where the
   installer imports the constructor, imports retirement administration,
   imports the row primitive directly, or another module imports the staging
   operation.
3. The staging operation's returned object is deeply frozen and exposes no
   database, store, owner, retirement method, constructor, or callback.

### Transaction and file boundary

1. A forced invalid Raft write after lifecycle initialization rolls back every
   lifecycle, binding, applied, hard-state, and snapshot row.
2. A database opened on the destination path is refused when presented as
   staging and its byte digest stays unchanged.
3. Equal/aliased staging and destination paths, `:memory:`, and a noncanonical
   staging filename are refused before mutation.
4. The successful staging database contains exactly one matching binding, one
   ACTIVE receiver lifecycle row, and one internally consistent Raft boundary.

### Incarnation and replay

1. Replaying the same operation against the exact binding preserves the
   incarnation and is byte/idempotence equivalent.
2. A matching ACTIVE row without the exact binding is refused.
3. A RETIRED row, a peer collision, a replica-identity collision, an older or
   different CREATE binding, and a partial existing Raft record are refused and
   unchanged.
4. An anti-vacuous source image begins with a sender lifecycle row; checkpoint
   scrubbing removes it, and staging mints a distinct receiver-local
   incarnation rather than copying the sender's.

### End-to-end install/recovery

1. `test/raft/raft-rs-backend/replica-image-checkpoint-transfer.test.js`
   exercises real v3 producer, payload, staging operation, binding, rename,
   restart read, exact promotion fact, and later-learner replay.
2. Paused-before-swap mutation of CREATE authority, physical claim, destination
   bytes, binding, or successor attempt prevents rename and preserves the live
   receiver.
3. Crash after STAGED and crash after rename retain the current marker/binding
   recovery behavior; only the same admitted install can finish.
4. Same-host focused evidence includes operation boundary, operation
   regression, durable lifecycle, snapshot install, and replica-image transfer
   tests at one exact snapshot.

## Non-claims

This interaction does not approve the whole FreshMG workflow, automatic C3
driver, remote CREATE/status handoff, removal/absence cleanup, five-node
replacement, seed loss, or CDC application-image retention. It repairs one
private lifecycle boundary in the v3 raft-rs replica-image staging path.

## Revision after author-distinct review 026ab506

This revision supersedes the physical-path, concurrency, outcome, recovery,
input, and impact claims above. The narrow owner split and one SQLite
transaction remain unchanged. Implementation remains held for a second
author-distinct design judgment.

### Existing serialization and artifact acquisition

The CREATE owner already supplies both required identities; this change does
not add a generic lock or durable ledger.

1. The operation ledger's unique `target_claim_key` is the durable uniqueness
   claim for a runtime-service target `(entityId, replicaId)`. The message-group
   target replica ID determines the destination database and checkpoint root.
   A different operation cannot durably claim that same target.
2. `ReplicaCreateAdmissionOwner.claimPhysicalWorker` grants one physical
   worker for the exact admitted operation in one live owner, and
   `revalidatePhysicalWorker` fences its boot incarnation and exact evidence.
   Retained work first takes over the same durable operation and evidence.
3. The learner-join owner refuses before descriptor acquisition when the
   destination file, marker, or staging file already exists. A fresh request
   may therefore acquire only an entirely absent target generation.
4. The marker becomes the install artifact's exclusive acquisition point.
   Fresh raft-rs CREATE staging creates the absent STAGING marker without
   replacement. If creation loses because a marker exists, it reads that
   marker and returns the exact existing-generation disposition; it never
   removes or replaces the staging bytes. Only generation-matched cleanup may
   remove them. Request, retained takeover, and boot recovery therefore
   converge on the marker's install ID instead of minting a second install.

The process owner is the sole repository writer for that target generation.
This contract does not claim protection against an unrelated host process
mutating the same data directory behind the process owner's back. It proves
that every repository request, retained recovery, cleanup, and boot recovery
uses the durable target claim, physical claim, and exact marker generation.
The binding is the crash backstop after staging; it is not a substitute for
those owners.

Staging remains nonauthoritative. After the last asynchronous physical-claim
revalidation, marker acquisition, payload copy, identity checks, and the
staging SQLite transaction form one synchronous segment. A boot takeover or
authority change during it can leave discardable staging bytes, but the old
worker cannot swap them: `commitSnapshotInstall` performs the current-boot and
operation-row reads last and then synchronously checks authority, admission
basis, destination digest, marker, and binding before rename.

### Fresh physical file protocol

The lifecycle operation no longer accepts a caller-opened database or asserts
that path-string equality proves file identity. The installer derives the
fixed staging path internally from the deterministic target checkpoint root.
For a fresh raft-rs CREATE it requires the destination and staging path to be
absent, copies the authenticated checkpoint payload with exclusive creation,
and captures `lstat` `{dev, ino, mode, nlink}` for the newly created regular
file. Symlinks and a link count other than one are refused. The destination is
checked absent at the same points.

The narrow operation receives the canonical fixed path plus the captured
device/inode tuple, opens that file itself, and checks with `lstat` before open,
immediately after open, and after the transaction/close that the same regular
single-link file remains at the path. This is sufficient under the existing
sole-writer process-owner contract: the file was created rather than linked,
has one link, and no repository writer can replace it while the physical
claim owns the exact marker generation. Any mismatch is a conflict and no swap
occurs. Tests use real symlink, hardlink, pre-existing-file, and path-replacement
mutants. They do not describe a stronger adversarial-filesystem guarantee than
the repository runtime owns.

### Captured input and exact result union

The exported staging operation accepts one plain record produced privately by
`snapshot-install.js`; it does not revalidate the entire public checkpoint
format. Before opening SQLite it captures own data descriptors once and builds
an internal null-prototype scalar/array snapshot. It rejects inherited,
accessor, proxy-observed, boxed, exotic, sparse, accessor-indexed, inherited-
index, iterator-dependent, and oversized values. It consumes arrays by own
dense indexes and never by a caller iterator. Only captured primitives reach
path, JSON, SQLite, or comparison operations.

The captured facts are: canonical staging path; captured device/inode; install
ID; exact already validated CREATE install authority; exact descriptor version,
group, applied index/term, membership generation and ConfState; exact bounded
peer reservations including learner and promotion admissions; receiver peer
and replica identity; and pre-install destination digest. Strings must be
primitive and nonempty where required. Numeric values must match the existing
format owner's safe-integer envelope and reject `NaN`, infinities, unsafe
integers, negatives where invalid, and `-0`. ConfState and reservations retain
the checkpoint owner's existing cardinality bounds. The implementation pins
only intrinsics this capture uses (`Object.getOwnPropertyDescriptor`, own-key
and array-index reads, numeric predicates, freeze, and the required path/file
calls); prototype mutation cannot change the decision.

The operation returns exactly one deeply frozen scalar union:

* `STAGED_INITIALIZED`: new receiver lifecycle and complete Raft boundary were
  atomically written.
* `STAGED_REPLAY`: the exact binding, receiver ACTIVE incarnation, and complete
  Raft boundary already matched and were preserved.
* `DEFERRED`: `sqlite_busy`, `sqlite_io`, or `artifact_owner_temporarily_unavailable`.
* `CONFLICT`: one of `input_invalid`, `file_identity_mismatch`,
  `destination_present_or_changed`, `binding_absent_with_rows`,
  `binding_extra_or_mismatch`, `lifecycle_retired_or_colliding`,
  `raft_schema_or_record_partial`, `database_unreadable_or_corrupt`, or
  `authority_or_marker_mismatch`.

Each result also names install ID, expected and observed receiver/peer when
readable, marker generation, binding state, lifecycle conflict class, exact
missing/contradictory table or row, captured file device/inode, and destination
digest observation. These are diagnostics. No result authorizes rename.
The installer exhaustively maps INITIALIZED/REPLAY to continued staging,
DEFERRED to a thrown existing CREATE-deferred error with `deferRetry=true`, and
CONFLICT to `INSTALL_STATE_CONFLICT`; it has no boolean or truthy fallback.

### Existing retry and budget owner

No staging timer or new budget is introduced. Temporary owner-RPC/boot
authority loss before staging retains the exact CREATE operation and is
redriven by its existing retained CREATE takeover. A crash or deferred result
after marker acquisition is redriven by the current-boot takeover followed by
`recoverPendingSnapshotInstall`. Claim acquisition, owner-RPC recovery, exact
generation cleanup completion, and boot invocation of recovery are the wake
events; a timer is not the correctness owner.

The CREATE workflow owns the one-minute CREATING step and five-minute SYNCING
step budgets. Learner catch-up's thirty seconds begins only after install and
open, so staging cannot reset or consume repeated catch-up windows. A
DEFERRED result must preserve the original operation timestamps and remaining
workflow budget. Once that budget is spent, normal CREATE failure/cleanup owns
the terminal result. Identity, retirement, contradictory rows, corrupt bytes,
and foreign marker/binding remain permanent conflicts and are never polled into
success. Current code paths that do not yet map these exact dispositions are
part of this bounded implementation and its behavior tests.

### Complete durable-state decision

The shared lifecycle initializer defines “any durable Raft record” as any row
or schema evidence in `_raft_rs_log`, `_raft_rs_hard_state`,
`_raft_rs_applied_state`, or `_raft_rs_snapshot`. Snapshot-only evidence counts.
Only the scrubbed first-stage shape may mint: absent/empty exact binding,
absent lifecycle row, and complete empty Raft schemas. Missing one Raft table,
malformed binding schema, extra binding rows, any receiver Raft row without
the lifecycle row, or any partial record is conflict. Unreadable and corrupt
are distinct from absent and can only be DEFERRED for an IO class explicitly
classified retryable; they never prove empty, replay, or installed.

Exact replay requires one matching binding row, one matching ACTIVE lifecycle
row and incarnation, and all three receiver boundary rows: applied state with
ConfState and membership generation, hard state with term/commit/vote zero,
and snapshot metadata with exact index/term/ConfState/generation. RETIRED,
sender, older-attempt, peer/identity collision, or missing-row state is not
repaired.

The post-rename witness is strengthened to read the exact install binding,
ACTIVE receiver lifecycle row, applied state, hard state, snapshot metadata,
peer reservations, promotion facts, and checkpoint descriptor. Every field
must match the marker and descriptor, including receiver identity/incarnation,
applied index/term, membership generation, ConfState, hard-state commit and
zero vote, and exact snapshot metadata. `resolvePendingSnapshotInstall` may
clear STAGED/INSTALLED only on that witness. A failed read remains conflict.
The subsequent active open still goes through the lifecycle constructor and
durable-store read; neither post-rename projection grants runtime entry.

### Writer and handoff inventory

* `snapshot-checkpoint-store.js` creates, scrubs, seals, and publishes the
  source payload/descriptor; it never writes receiver-local lifecycle or Raft
  rows.
* `message-group-learner-join.js` consumes the recorded ADD fact and producer
  descriptor, derives the deterministic target, and invokes install under the
  existing physical claim. It never edits install artifacts directly.
* `replica-create-admission-owner.js` and `replica-create-process-owner.js` own
  durable CREATE admission, target/operation evidence, the sole physical
  worker, takeover, final operation-row revalidation, and synchronous swap.
* `snapshot-install.js` owns marker acquisition, exclusive copy, binding
  generation, rename, generation-matched recovery, and cleanup. Every cleanup
  callback rechecks marker authority after its await and before removal.
* the new staging operation owns only physical-file verification and the one
  staging transaction. `raft-rs-replica-lifecycle-owner.js` owns the shared
  lifecycle decision; `raft-rs-durable-store.js` owns the Raft schemas/rows.
* `partition-service-raft-init-base.js` invokes boot recovery before opening
  the destination and then consumes the complete post-rename witness. It
  cannot initialize around a marker conflict.

Late work carries exact operation ID, attempt token/sequence,
`replicaCreatedAt`, target claim, marker install ID, and captured destination
identity. After any await, cleanup/recovery re-reads the marker and refuses a
different generation. Shutdown releases the in-process claim only after its
worker settles; successor cleanup cannot remove foreign generation artifacts.

### Boundary attacks and timed proof

The operation audit retains its global lifecycle SQL/write census and permits
only installer -> staging operation and staging operation -> narrow lifecycle
primitive. Mutants cover constructor/admin/primitive imports by installer,
other staging-operation/primitive importers, alternate lifecycle SQL,
exported DB/store/control objects, and RETIRED revival.

Real tests preserve this order: claim and descriptor await; marker acquisition;
exclusive copy; staging transaction; STAGED marker; final authoritative row
read; synchronous rename; cleanup. Hooks pause at each boundary so a competing
takeover, generation cleanup, shutdown, or destination mutation acts in the
same order as production. Compressed clocks keep the original CREATE deadline;
chunks/retries do not reset it. The decisive positive uses
`requestSnapshotInstall`, real file-backed SQLite, exact authority/basis fields,
real v3 descriptor and source lifecycle scrub, receiver-local incarnation,
rename, restart, and later-learner leadership. Rollback injects after lifecycle,
binding, and at least one Raft write and proves every authoritative row absent.

### Impact registration

Add impact contract `raft-rs-snapshot-staging-lifecycle` with coupled endpoints:

* `checkpoint-install-create-authority`: `snapshot-checkpoint-store.js`,
  `snapshot-install.js`, `message-group-learner-join.js`,
  `replica-create-admission-owner.js`, and `replica-create-process-owner.js`.
* `receiver-lifecycle-and-raft-reconstruction`:
  `raft-rs-snapshot-staging-lifecycle-operation.js`,
  `raft-rs-replica-lifecycle-owner.js`, `raft-rs-durable-store.js`, and
  `partition-service-raft-init-base.js`.

Witnesses are operation-port-boundary, lifecycle durable-generation,
snapshot-install transition/restart, the real replica-image transfer/restart/
later-learner test, and hostile staging-seam tests. The implementation updates
`test/shards/impact-contracts.json` and runs the primary, resource, subsystem,
selection-golden, and change-proof generators. Resource classification follows
the actual neighboring file-backed install tests and generator policy; it is
not declared ordinary by this note. Any new integration witness is measured in
its generated lane before proof is claimed. Treatment fingerprints distinguish
the inherited constructor-import red, positive initial stage/replay/install,
recoverable authority/IO deferral, and permanent identity/retirement/partial-
record conflicts.

## Round-two revision after review 2e483271

This section supersedes the four bounded points identified by the second
author-distinct review of subject `5fe67e03421c023560afc83a256f2d4c5279c8795b1f7d8b03bead9564d9f99c`.
All other round-one revision mechanics remain. Implementation is still held for
targeted author-distinct approval.

### Finite canonical descriptor, with no invented membership cap

The staging operation does not impose a peer-reservation or ConfState
cardinality maximum. The current checkpoint format owner has none, and permanent
peer reservations may legitimately grow across fresh replacements. This Quest
does not prune that history, lower the accepted domain, or add a protocol cap.

`readCheckpoint` remains the only descriptor parser and format validator. A
successful result is a finite in-memory canonical JSON value whose exact v3
shape, decimal peer values, uniqueness, reservation-to-configuration coverage,
authentic promotion facts, and payload digest have already been checked. The
private installer snapshots that validated value and passes only its captured
plain data to the staging operation. The staging seam performs one linear dense
own-index copy and validation of the finite arrays and never invokes caller
iterators or coercion. Sparse, inherited-index, accessor-index, proxy, boxed,
or non-array direct seam inputs remain invalid. There is no “oversized array”
staging result, maximum, or maximum-plus-one test because no such protocol
maximum exists.

Descriptor-file retained-byte admission, if later required, belongs coherently
to checkpoint producer/read storage and must preserve adequate configured
capacity progress for permanent history; it is not introduced as a hidden
staging permission in this boundary repair. The decisive test uses the largest
real producer-owned reservation history fixture already supported and proves
the staging seam neither truncates nor prunes it. A mutant that introduces an
arbitrary shorter staging cap must fail.

### One initializer with private source-owned modes

`raft-rs-replica-lifecycle-owner.js` owns two narrow entry points over one
private initialization decision. The discriminants are private symbols in that
module and are never accepted from caller data, exported, serialized, or
represented by a public boolean:

1. The `RaftRsReplicaLifecycleOwner` constructor calls the decision in
   `RUNTIME_OPEN` mode. It preserves current bootstrap semantics: absent
   lifecycle plus no durable Raft rows may mint the runtime row whether the
   store schemas are absent or complete and empty. Empty schemas do not confer
   snapshot authority. Existing runtime identity/collision/retirement rules
   remain unchanged.
2. The narrow exported staging-row primitive calls the same decision in
   `AUTHENTICATED_SNAPSHOT_STAGE` mode. The operation-boundary audit permits
   only the staging operation to import it. That wrapper is reached only after
   exact v3 checkpoint validation, target reservation match, current physical
   claim revalidation, exact exclusive marker acquisition, authenticated payload
   copy/digest, captured physical file identity, and binding observation.

For first staging, the authenticated mode requires the exact binding table to
be absent/empty, lifecycle row absent, all four Raft store tables present with
their complete expected schemas, and no group row in log, hard, applied, or
snapshot. It mints one receiver lifecycle row inside the operation's transaction.
For replay, it requires the exact binding plus matching ACTIVE receiver row and
complete applied/hard/snapshot boundary; it preserves the incarnation. Either
mode refuses snapshot-only rows, a missing/extra/malformed table, partial rows,
foreign binding, sender lifecycle, collision, and RETIRED state. The mode does
not decide binding validity; the staging operation supplies the already checked
first-stage or exact-replay classification to the one lifecycle decision.

Tests prove normal new runtime bootstrap with absent schemas and with complete
empty schemas, authenticated scrubbed first-stage creation, exact replay, and
mode-swap mutants. The runtime constructor cannot import or invoke the staging
wrapper; the staging operation cannot invoke runtime construction. Both paths
must obtain identical identity/collision/retirement decisions from the shared
private function.

### Concrete host-wide sole-writer owner

`src/storage/data-directory-process-owner.js` is part of the authority and
writer inventory. Runtime startup acquires its
`.lagrange-data-directory-owner.sqlite` `BEGIN EXCLUSIVE` ownership before any
replica access, holds it throughout staging/install/open, and releases it only
during runtime shutdown. A second Lagrange process receives
`DATA_DIRECTORY_ALREADY_OWNED` before replica access. The existing real
child-process witness is `data-directory ownership fences a second process
before replica access` in
`test/node/replica-lifecycle-durable-generation.test.js`.

The staging physical-file proof is explicitly conditional on that exact owner
remaining held, plus the operation-ledger target claim, current physical worker,
and marker generation. Add `data-directory-process-owner.js` to the
`checkpoint-install-create-authority` impact endpoint and add the child
contender test to the contract witnesses and canonical focused lane. No second
lock or ledger is added.

### Finite SQLite outcome classifier

Replace `sqlite_io` in the result union with exact `sqlite_busy_or_locked`.
Only SQLite codes `SQLITE_BUSY` and `SQLITE_LOCKED` map to `DEFERRED`. The
operation preserves the marker/binding generation, closes every handle in
`finally`, reports the exact code, and returns to the existing retained CREATE
owner. Handle release, current-boot retained takeover, and boot invocation of
`recoverPendingSnapshotInstall` are the finite release/redrive events, all under
the original CREATING/SYNCING deadline and operation timestamps.

`SQLITE_CORRUPT`, `SQLITE_NOTADB`, every `SQLITE_IOERR` base or extended code,
malformed schema/row, permission/path failures, foreign binding, and unknown
errors are `CONFLICT` and loud. They never default to retry, empty first stage,
or installed state. Non-SQLite owner-RPC/boot unavailability remains the existing
pre-staging CREATE deferral and is not reclassified by this operation.

Tests inject each BUSY/LOCKED code through the real operation-to-installer-to-
CREATE mapping, release the held handle and prove exact reentry without deadline
extension. Separate CORRUPT, NOTADB, IOERR, permission, malformed, and unknown
mutants prove permanent conflict and no polling. The result schema and consumer
switch enumerate every code; absence of a recognized code is terminal.

