---
audience: development
documentClass: planning
---

# TX1 release: query settlement interaction

Status: **fixed settlement lane accepted by parent on 2026-10-11;
minimal release ordering refined below; not implementation or closure**.
Query owner: `review_tx1_query`; partition/release owner: `review_c0_preservation`.
This refines the accepted 2026-10-11 release interaction and query recovery-set
design. It does not reinterpret v10 or modify its eight sealed receipts.

## Why the existing path cannot drain

`sql_transactions` is a normal replicated partition. Its new mutation
admission must close for release, including BEGIN insertion and participant
enlistment. The query owner's ordinary freeze/decision/status gateway UPDATEs
then also close. Exempting a table, SQL prefix, priority or caller boolean
would permit new work through the release fence. Conversely, blocking all
settlement indefinitely makes release recovery depend on the admission it
is supposed to restore.

The existing query row remains the only coordinator ledger. A fixed command
advances an already retained lineage, validated by the query owner at source
and committed apply. It never inserts a transaction, expands its participant
manifest or modifies application data. Committed reads, Raft delivery and
application remain available without a writable table or hydrated cache.

## Canonical query-owned payload

`src/query/distributed/distributed-transaction-settlement.js` owns the closed
union, canonical bytes, result vocabulary and existing-row validator:

```js
{kind: 'FREEZE' | 'DECIDE' | 'PROGRESS',
 transactionId, sessionId, transactionEpoch, participantSetText,
 // DECIDE only:
 decision, decisionText, decisionDigest,
 // PROGRESS only:
 decisionDigest, status}
```

Unknown fields and noncanonical or NULL manifests refuse. Every operation
reads the actual `sql_transactions` row and binds its transaction, session,
epoch and exact canonical retained participant-set bytes. The shared query
manifest and full-record decision codecs are reused, not copied into release.

| Operation | Query predicate and only permitted mutation |
| --- | --- |
| FREEZE | Exact OPEN lineage with no decision becomes FROZEN with the same manifest. TWO_PHASE_COMMIT and frozen count are derived by the owner. Exact already-frozen replay succeeds. No manifest growth or reopening. |
| DECIDE | Exact FROZEN lineage with no decision may record a canonical **ROLLBACK** bound to every retained participant ID. Exact existing COMMIT or ROLLBACK replay returns the recorded decision without changing it. Competing decisions return `already_recorded` and the canonical existing record. **A new COMMIT is refused in this paused lane.** |
| PROGRESS | Exact FROZEN lineage and recorded decision digest permits only owner-defined status progression consistent with that decision. COMMITTING/COMMITTED and ROLLING_BACK/ROLLED_BACK remain hints; they never certify drain. No identity, manifest or decision changes. |

A new COMMIT requires the query owner's durable all-PREPARE evidence, which
currently lives in `sql_transaction_participants`, not the coordinator row.
A transport origin, private enum or payload cannot replace it. The paused
drain therefore chooses ROLLBACK for an undecided complete manifest, without
requiring new PREPARE. It re-drives a recorded COMMIT and never changes it.

An in-flight ordinary COMMIT submission may have an unknown outcome. Pausing
does not convert that into non-admission. The release sequence first waits
for the actual control cohort's admitted proposals and persisted log suffix
to settle, then reads the coordinator row. A lost answer reuses its command
identity and authoritative readback. Only a positively non-admitted source
refusal can skip that reconciliation. The coordinator's existing uncertainty
state is retained until this owner evidence resolves it.

## Partition envelope and production route

Add the fixed application message and committed command
`COORDINATOR_SETTLEMENT`. The message carries only the canonical query
payload; the partition pins a deterministic entry identity from its version
and payload digest. There is no SQL, table selector, permission or arbitrary
mutation patch in the wire command.

The query engine's canonical transaction persistence owner sends this
message through its existing routed partition/message-group transport. It
does not call a local handler or use an admin shortcut. The receiver must be
the actual `sql_transactions` partition leader; the normal leader/tenure,
transport and storage owners still apply. Caller-supplied ownership is not
an authority. The source reads its actual connection synchronously and calls
the query validator before proposing. Missing row/schema, legacy NULL,
manifest conflict, wrong target or unsupported operation refuses typed.

`partition-service-entry-apply-base.js` adds this message to the single
removal-serving ingress classifier. As with accepted transaction controls,
it may finish existing obligations while removal/release admission is
closed, but counts as active serving work and cannot create new lineage.
Its dispatcher calls a narrow query-settlement request owner. No ordinary
`FORWARD_WRITE`, `SYSTEM_TABLE_WRITE`, SQL or public applyWrite route can
propose this command.

`partition-committed-command-admission.js` recognizes a distinct internal
`COORDINATOR_OWNER` origin and pinned canonical bytes. This enum constrains
code paths; **the actual row validator is the authorization predicate**.
After validation, the request uses `startPartitionRaftWriteCommit`, the same
proposal owner used for already-admitted participant settlement, rather than
the ordinary new-mutation gate.

Committed dispatch calls the query owner again with the actual row inside
`raft-rs-application-transaction-owner.js`'s existing SQLite transaction. Its
fixed CAS, retained command outcome and applied index commit atomically.
Concurrent ordinary enlist/freeze/decision that won earlier is observed in
log order. Deterministic CAS conflict is a retained typed outcome, not a
storage fault; unexpected storage failure rolls back/fails closed under the
existing application contract. No callback runs network I/O inside apply.

## Query drain completion and projections

The read-only query census is
`readTransactionReleaseCensus(database)` in
`src/query/distributed/distributed-transaction-release-census.js`.
Its initial measured source SHA256 is
`ecb98946961fe14b57bf17d2fc47611e2fe4ec14dbba7b3f3530714fe38b8175`.
It returns schema version 2, semantic version `tx1-query-set-v1`, a digest of
all measured rows, and explicit legacy/recoverable IDs. Only an actually
empty table is `clear`; any read/schema fault is `unavailable`. Every NULL or
malformed retained manifest is `held`, regardless of terminal status.

For complete retained manifests, the existing query recovery owner freezes
undecided rows, records bound ROLLBACK through the fixed lane and re-drives
the actual recorded decision to every exact participant. The invocation
collects current terminal participant answers bound to transaction,
participant, decision digest and durable outcome. Timeout, unavailability,
missing participant or nonterminal outcome preserves the obligation.

After an immutable decision exists, `sql_transaction_participants` progress
UPSERTs are optional projections during this drain: omitting them does not
erase participant outcomes or immutable coordinator authority. This is an
explicit parent decision requested by both implementers. Before decision,
normal COMMIT's PREPARE evidence persistence remains mandatory. A stored
PROGRESS terminal hint is never substituted for a participant answer.

Completion is a fresh invocation-bound answer, not a new table, durable
permit or stored completion bit. Its scope contains the release identity,
actual control cohort generation/build, coordinator row-generation digest,
and the exact immutable records/participant outcomes just re-driven. Re-read
the query census after settlement and before answering. Any changed row
generation restarts the read/re-drive under the same bounded invocation.
The consumer must ask this owner while mutation closure still holds; copying
the result into a later process is not authority.

## Accepted minimal ordering: control cohort first

Parent accepted the fixed FREEZE / new bound ROLLBACK / exact recorded
decision replay / consistent PROGRESS lane and omission of decided
participant projection writes. New COMMIT's pre-decision evidence remains
mandatory. Parent rejected global dependent holds and a new release batch.

The actual supported committed predecessor was checked by the query author
at `be99622d6` and candidate `6e091e82`: its transaction payload contains
`type`, `operation`, `sessionId`, `transactionEpoch`, without participant
transaction/participant IDs. The pre-manifest new participant wire exists
in an unlanded inherited draft/proof object, not either supported predecessor.
No additional protocol-version field is justified by that draft alone.

Release `sql_transactions` first. Its actual closed cohort drains admitted
ordinary writes and unknown proposal/log suffixes, then the query owner
reads all retained coordinator rows. Incompatible NULL/malformed rows block
this release. Complete manifests are settled through the accepted fixed
lane and exact participant outcomes. The query owner installs and verifies
the actual durable enforcement that every newly inserted coordinator row
has the canonical empty manifest; ordinary old INSERT cannot create another
NULL row. Existing legacy rows are never retrofitted. This must cover
actual committed SQL execution, recovery/replay and schema mutation, not
just a gateway's claimed version or source-only validator.

Only after that proof may the actual control cohort apply its generation
origin and pass exact replica build/schema/enforcer census. On restart its
execution admission starts closed and repeats current owner checks. Origin
alone does not encode which executable measured an old census; current
measured build and real enforcement are required too. No environment digest,
cache row or prior-process callback substitutes for these facts.

Every other group consumes that control-owner release fact through the
existing lifecycle/read interaction, then uses its own complete local
session/PREPARED/proposal/log drain, actual reopen, rowid census, origin and
replica census. It need not freshly settle all unrelated new-protocol query
rows or hold global query admission while releasing. After the control
release, a supported old producer cannot persist the new transaction it
must create before sending participant work. Any delayed supported old
wire is permanently refused by each participant's applied origin. Existing
local debt still blocks that participant's release; old exact PREPARED
settlement remains available. New-protocol obligations retain the complete
manifest and immutable decision owner.

Required boundary tests: old INSERT after control release refuses on every
replica; old INSERT admitted before pause is observed before control census;
lost old INSERT/decision answer cannot disappear behind pause; delayed
legacy BEGIN/statement after target origin refuses; concurrent new-protocol
transactions after control resume cannot create legacy debt in a still
closed target. An old control executable or missing enforcer cannot supply
the required owner fact. A restarted control owner must reconstruct before
another group's release consumes it.

## Rejected broader alternative, retained for decision history

The current release identity names one partition. A per-partition pause is
insufficient to hold the global query census stable: another concurrent
release could resume `sql_transactions`, allowing BEGIN/enlist after the
census. Checking a historical gate generation or a reply boolean would not
prevent that race. There is currently no global query producer fence.

The smallest proposed extension is **within the existing sql_transactions
cohort's lifecycle admission owner**: retain bounded, volatile release holds
keyed by exact release identity/attempt while the query drain invocation is
active. A close result supplies the actual current cohort stamps. Resume of
that cohort must refuse while any exact dependent release hold is live;
held control reads and the fixed settlement lane remain available. The
dependent release releases its hold only after its own resume or a typed
abandonment that leaves its group closed. Replacing any control cohort
generation invalidates the invocation; restart defaults closed and re-reads
current obligations. No timer expires a hold into permission.

Parent **rejected this global-hold design before implementation** in favor
of the control-cohort-first ordering above. The global current-row census
would not itself prevent a future incompatible producer from inserting a
new row, so it does not replace the actual new-row enforcer. No hold map or
new global coordinator/store is authorized or implemented.

Legacy NULL reconciliation is also still an explicit outstanding obligation.
Empty local participant tables or old terminal hints do not prove that an
incomplete old coordinator set owed nothing elsewhere. Neither deleting the
row nor filling `[]` is allowed. These rows remain held until the existing
legacy drain/session owners supply actual exclusion/discharge evidence.

## Required proof matrix

1. Paused new BEGIN, INSERT, enlist, arbitrary UPDATE and app-table writes
   remain refused; fixed existing-lineage rollback/replay makes progress.
2. Wrong target, missing/NULL/malformed row, wrong session/epoch/manifest,
   unknown fields and new COMMIT refuse before consensus.
3. Source validation succeeds, another enlist/decision wins first: committed
   CAS refuses or follows the winning decision without mutation of lineage.
4. Lost accepted ordinary COMMIT answer then pause: recorded COMMIT is
   re-driven; an unresolved log suffix never permits alternate rollback.
5. Duplicate command/restart/lost reply preserves exactly one decision and
   the same durable typed result, including conflict.
6. Fault fixed CAS, outcome write or applied-index write: the existing SQLite
   transaction commits all or none; recovery replays deterministically.
7. Drop all decided participant projection writes: exact terminal participant
   replies still finish drain; forge terminal status only: drain stays held.
8. A participant unavailable/unknown after recorded COMMIT stays owed; retry
   uses the recorded complete manifest and never projection membership.
9. Change coordinator rows, control cohort generation/build or enforcement
   during its own census: no control release. Other groups require the
   exact current control-owner fact and local debt census; a global hold is
   not part of this contract.
10. Real fresh seed reads empty version-2 sql_transactions through the early
    production lifecycle/read route before any registration write or cache
    hydration. Existing valid retained rows settle through the same route.
11. Legacy NULL with terminal hint, absent local participant rows or restarted
    query engine remains explicit held; a separate legacy discharge witness
    is required before full release readiness.

Exact source hashes, categorized focused witnesses and locked three-replica
production-path proof remain required. This proposal claims none of them.
