# BEGIN uncertain insert resolution proposal

Status: round-seven proposed for independent owner review. No source or
compatibility claim follows from this note.

## Evidence and defect

The production-backed diagnostic is frozen at
`test-output/continuation-20261011/c56-transaction-evidence-matrix/round4-diagnostic/evidence-manifest.sha256`,
SHA-256
`9cddb866431a74eb444b839cdce0a022b9b3baeddde37e2b0cdeac8a7779dfbb`.
Its summary SHA-256 is
`82f08d7ee657115136c26cf04d3debd736429c97299eed614ecaefdca5aa1d06`.

The current insert owner correctly adopts an exact same-creation readback and
hands an advanced same-creation row to normal recovery. It also correctly
re-mints after a producer-confirmed `SQLITE_CONSTRAINT_PRIMARYKEY` collision.
Three other outcomes violate the same identity rule:

- a wrong-key readback and an incomplete same-key readback are treated as a
  collision and re-mint while the first row remains durable;
- a generic error or timeout plus unavailable readback causes
  `DurableWorkflowCoordinator.registerWorkflow` to remove the already-created
  descriptor;
- a retry bound to the first identity then receives `NO_TRANSACTION`, while an
  unrelated later BEGIN can mint a second identity for the same unresolved
  creation attempt.

## Existing owners

No ledger, workflow type or retry scheduler is added.

- `DistributedTransactionCoordinator` remains the owner of BEGIN identity,
  session FIFO, original transaction deadline and normal recovery handoff.
- Its existing `DurableWorkflowCoordinator` remains the one volatile owner of
  the attempted workflow descriptor. `registerWorkflow` already installs the
  candidate before calling `persistWorkflow`; its failure cleanup becomes
  owner-disposition aware instead of always deleting the candidate.
- `SQLQueryEngine`'s transaction persistence methods remain the owner of the
  INSERT, canonical gateway completion result and authoritative readback.
- The control-plane gateway's existing normalized mutation completion and
  authoritative row reader remain the only evidence producers. Error strings,
  generic constraint labels and caller booleans grant no disposition.

## Attempted creation descriptor

The descriptor is built once before the first INSERT and contains the existing
immutable creation identity:

```text
transactionId
sessionId
transactionEpoch
timeoutDeadline
transactionMode
createdAt
```

It also retains the existing initial row bytes, the original top-level deadline
and one creation state:

```text
INSERTING | INSERT_OUTCOME_UNCERTAIN | INSERTED | DEFINITIVELY_REJECTED
```

Status, participant manifest, progress and decision are not creation identity
and may advance after a lost answer. `INSERT_OUTCOME_UNCERTAIN` authorizes no
participant BEGIN/QUERY/PREPARE, enlistment, COMMIT, ROLLBACK or decision write.
It is not exposed by `getTransaction` as an ACTIVE usable transaction. It only
permits reconciliation of the same attempted insertion.

The descriptor is bounded by the existing one-workflow-per-session map and
session FIFO. While it is unresolved, another BEGIN for that session re-enters
this descriptor and cannot mint a second identity. A request carrying
`expectedTransactionId` must match it exactly. A different expected ID is an
identity refusal, not a new BEGIN.

## Producer evidence and classification

The persistence owner captures the gateway result once and resolves its
canonical mutation completion state. The classification is:

1. **Inserted.** Canonical `APPLIED`, or complete authoritative readback of the
   expected key with all six immutable fields equal, establishes the original
   identity. Exact initial bytes enter ACTIVE. A matching advanced row goes to
   the existing normal recovery owner under the same ID; the attempted ACTIVE
   candidate is never installed over it.
2. **Confirmed collision.** Either the canonical producer result specifically
   reports `SQLITE_CONSTRAINT_PRIMARYKEY` for this INSERT, or a complete
   authoritative readback for the **expected transaction key** has all six
   immutable fields present and well typed and at least one differs. Only this
   class may retire the first descriptor and let the existing bounded mint loop
   choose another ID. A generic constraint code is never upgraded to primary-key
   collision.
3. **Definitively rejected without effect.** Only a canonical gateway terminal
   `REJECTED` outcome that says the request was not accepted/applied and has no
   pending visibility or retained attempt may end the descriptor without a row.
   It returns the producer's typed BEGIN failure. `DEFERRED`, `OWNER_NOT_READY`,
   `PENDING_VISIBILITY`, `OBSERVED_STATE_CHANGED`, an unknown/raw result,
   timeout or thrown error are not this class.
4. **Uncertain.** Unavailable readback, multiple rows, wrong-key row, incomplete
   row, accessor/inherited/malformed fields, noncanonical immutable values, or
   any nonterminal/unknown mutation completion retains the same descriptor and
   identity. It returns typed `TRANSACTION_CREATION_UNCERTAIN`, including the
   transaction ID and remaining original deadline, but grants no transaction
   activity.

The authoritative reader must return a typed four-state result for the exact
key: `AVAILABLE`, `MISSING`, `UNAVAILABLE`, or `INVALID`. It must never collapse
wrong-key/incomplete content into a complete conflicting row. Own data is
captured once; all six immutable fields must be present and canonical before
equality or conflict is considered.

`MISSING` is not by itself proof that a timed-out or retained mutation cannot
later apply. It completes “not committed” only when paired with the same gateway
attempt's canonical terminal no-effect disposition, or after that existing
gateway owner proves the attempt is no longer retained/in flight and performs a
read-after-attempt authoritative observation. Otherwise it remains uncertain.

## Re-entry and lifetime

The original BEGIN call returns immediately with the typed uncertain result; it
does not await a new background loop. A later BEGIN on the same session, a retry
with the expected ID, or the existing transaction recovery wake reruns the same
gateway-attempt/readback classifier under the existing session FIFO. It never
resets `timeoutDeadline`, `createdAt`, epoch or identity.

If the original deadline expires while insertion remains uncertain, no new
transaction work starts. The descriptor stays a bounded reconciliation hold
until authoritative insertion disposition is known. If the row exists, normal
recovery owns its recorded state and applies the existing deadline/decision
rules. If terminal no-effect plus authoritative MISSING is proved, the attempt
ends with its typed failure; a later unbound BEGIN is then a genuinely new
creation and may mint a new ID.

Process restart does not promise to preserve an insertion request that never
became durable. The existing durable transaction census recovers a committed
row under the original ID, including advanced state. A bound retry after restart
may perform the exact-key authoritative read before returning `NO_TRANSACTION`:
AVAILABLE adopts/recoveries the original row; exact MISSING says that this boot
has no durable transaction to adopt. UNAVAILABLE/INVALID remain typed uncertain.
No synthetic descriptor or replacement identity is reconstructed from a client
label alone.

## Minimal coordinator change

`DurableWorkflowCoordinator.registerWorkflow` receives an owner-specific error
disposition from its existing `persistWorkflow` callback:

- `REMOVE` preserves current behavior for confirmed collision and definitive
  rejection;
- `RETAIN_UNRESOLVED` keeps the exact candidate already installed in
  `workflowsById` and `workflowsByOwnerKey`, marked
  `INSERT_OUTCOME_UNCERTAIN`.

The default for every other workflow owner remains `REMOVE`. The disposition is
typed and private to the persistence callback; callers cannot request retention.
No second map or recovery queue is introduced. Transaction statement admission,
commit and rollback must treat retained unresolved creation as non-ACTIVE and
route only BEGIN reconciliation through it.

## Required evidence packet

The implementation packet must show attempted descriptor, producer completion,
authoritative readback state, classification and resulting identity for:

1. canonical primary-key collision: first removed, bounded re-mint succeeds;
2. generic terminal rejected/no-effect: no collision classification and no
   hidden second row;
3. timeout or unknown result plus UNAVAILABLE: same descriptor/ID retained,
   same-session BEGIN re-enters it, no second INSERT or participant effect;
4. uncertain INSERT actually committed, exact initial readback: original ID
   becomes ACTIVE;
5. uncertain INSERT committed and advanced: original ID enters ordinary FIFO
   recovery, including the existing nonempty COMMIT control;
6. uncertain INSERT did not commit: MISSING alone holds; terminal no-effect plus
   MISSING retires the attempt without minting in that call;
7. wrong-ID, incomplete same-ID and malformed/accessor readbacks: typed INVALID
   or UNAVAILABLE, no collision and no re-mint;
8. complete expected-key immutable conflict: collision, original foreign row
   byte-identical before/after, bounded re-mint allowed;
9. restart with committed original row recovers it; restart without a durable
   row makes no claim to resurrect the lost request; unavailable restart read
   does not authorize a new identity.

Every case records durable rows before/after and emitted participant/decision
operations. Uncertain and collision paths emit no PREPARE, COMMIT or ROLLBACK
fanout for the attempted descriptor. The approved transaction binding sources
remain frozen until this design receives independent review.

## Round-two bounded correction

The rejected round-one subject is preserved verbatim at
`evidence/design-query-begin-uncertain-insert-resolution-round1-eb52b743.md`,
SHA-256
`eb52b743ac44514150fdcba2f0df3f73e1464818b93d89b0af56e3979a959a02`.
This section answers B1 through B7 in
`review-begin-uncertain-design-cdc56.md`, SHA-256
`814b6550299880637bc3ddbc274b159c69ca4e3cc0abcc97f780c2acd6960e15`.
It supersedes the producer-disposition, reentry, restart and generic
coordinator claims above. It changes no source and adds no transaction ledger,
attempt-query protocol, scheduler or decision state.

### B1. Exact same-insert redelivery is the completion owner

The current gateway cannot answer a later query about an attempt, so this
correction does not require one and never treats its synthesized completion
envelope as no-effect proof. The persistence owner canonicalizes the complete
initial INSERT row once, captures immutable bytes, and supplies the gateway's
existing explicit `idempotencyKey` option. The key is the fixed SHA-256 digest
of a type-pinned tuple
`[sql_transactions-begin-v1, transactionId, canonicalInitialRowBytes]`. It is
an attempt delivery key, not a coalescing key or authority. The descriptor
retains the row bytes and key for its in-process lifetime.

An uncertain reconciliation redelivers that exact INSERT through the same
gateway with the same key and bytes. It does not call `persistWorkflow` as a
new registration and cannot mint an ID. The existing storage primary key and
serialized apply supply the completion order:

- successful apply plus exact-key readback with the same six immutable fields
  establishes the original creation;
- primary-key refusal plus exact-key readback with the same immutable fields
  is the idempotent success of this same creation, including a late first
  attempt winning before redelivery;
- primary-key refusal plus a complete exact-key row whose other five immutable
  fields conflict is the only confirmed foreign collision and permits the
  bounded mint loop; and
- every other answer/read pair remains uncertain. Generic constraint, timeout,
  empty object, inferred APPLIED/REJECTED, wrong-key row and `MISSING` never
  establish collision or no effect.

Thus two live deliveries may race, but both carry the same transaction ID and
identical creation bytes. At most one row is inserted and neither schedule can
authorize a replacement identity. The required latch schedules first-delivery
late apply before and after redelivery, duplicate primary-key response loss,
and wrong-digest/key refusal. This uses the gateway's existing delivery path;
it does not expose its private `heldInstances` or add an attempt-status API.

### B2. One creation-state gate for every transaction consumer

The existing transaction record gains only the state
`INSERT_OUTCOME_UNCERTAIN`; it stays in the existing ID and owner-key maps.
`DistributedTransactionCoordinator` owns one
`admitTransactionCreationState(sessionId, expectedTransactionId, operation)`
decision used by BEGIN, parsed statement admission, read/write helpers,
participant enlistment, write-operation recording, COMMIT, ROLLBACK,
`hasActiveTransaction`, service-lifecycle execution, shutdown, diagnostics,
recovery replay and the periodic recovery sweep.

For this state, BEGIN with the exact expected ID enters the reconciliation
method below. Every other operation returns the same typed
`TRANSACTION_CREATION_UNCERTAIN` answer with that ID; it cannot fall through to
autocommit, emit participant work, freeze a manifest, choose a decision, or
remove the row as expired. `hasActiveTransaction` reports that the session is
occupied while its separate usable-transaction projection is false. The sweep
routes it only to creation reconciliation and never to ordinary undecided
rollback. A caller with a different expected ID is refused as an identity
mismatch.

### B3. One FIFO reentry, existing timer, no invented wake

`reconcileTransactionCreationOwned(sessionId, transactionId)` is the only
reentry. It runs under the existing session FIFO, verifies that both workflow
maps still contain the exact descriptor and uncertain state, redelivers the
same INSERT/key/bytes, performs one authoritative exact-key read, then
revalidates the same object before applying a result. Same-session BEGIN with
the exact expected ID invokes it directly. The existing transaction recovery
timer invokes it when the sweep encounters this state. No gateway-settlement,
read-availability or filesystem event is claimed; there is no new subscriber,
promise registry, timer or retry owner.

Exact creation changes the same object to inserted/ACTIVE. A matching advanced
row first removes that exact uncertain object from both maps and then hands the
captured authoritative row to the existing normal recovery owner without
overwriting a newer owner binding. A foreign immutable conflict removes only
the same object. A foreground BEGIN reconciliation returns the existing
confirmed-collision result to that call's bounded mint loop; a background
sweep mints nothing and leaves a later client BEGIN to start any new creation.
An unavailable/invalid result leaves the descriptor unchanged. A stale
callback after replacement, shutdown or resolution is a typed no-op.

### B4. Honest process-restart boundary

This contract does not claim to reconstruct an INSERT whose only descriptor
and immutable row bytes died with the process. Normal pgwire and application
database session owners create process/connection-scoped random session IDs;
process loss retires that session and its FIFO. A new connection receives a
new session ID and is a different creation domain, not a replacement identity
for the dead BEGIN. The normal adapters never reuse the retired ID merely
because a caller omits `expectedTransactionId`.

After restart, durable census behavior is therefore exact:

- an existing original row is recovered under its original ID, including any
  advanced state;
- `UNAVAILABLE` or `INVALID` remains a typed recovery hold;
- exact `MISSING` means only that this boot has no durable row to recover. It
  never proves the old remote delivery did not apply and never causes recovery
  to mint another ID for the retired session; and
- a lower-level diagnostic call carrying the retired session/expected ID gets
  typed `TRANSACTION_CREATION_UNRECOVERABLE`, not `NO_TRANSACTION`, replay or a
  new BEGIN. A caller cannot recreate the lost immutable row from labels.

The process-loss witness engages the first delivery remotely, exits before its
answer, restarts to an exact MISSING read, then lets the old delivery apply. The
restart mints nothing for the retired session; the late row is discovered by
ordinary durable census and settled under its original ID. This is the stated
liveness ceiling. Cross-process retry of an undurable BEGIN would require a
separately reviewed authenticated client creation receipt or durable attempt
owner and is outside this correction.

### B5. Original deadline and bounded reconciliation work

The first INSERT receives the existing frozen transaction `timeoutBudget` in
gateway options. Foreground same-session reconciliation spends only its
remaining original budget. Expiry closes all transaction activity and
foreground waits but does not delete or decide the uncertain descriptor.

The existing periodic recovery sweep may perform one reconciliation turn after
expiry using the SQL engine's already configured and validated
`queryTimeoutMs` as the control-operation bound. That bound is captured once
per turn and passed to both redelivery and authoritative read; it does not
rewrite `createdAt`, `timeoutDeadline`, epoch or the caller result, and it
cannot authorize transaction work. Safe-integer validation rejects `-0`,
fractions, nonfinite/unsafe values and overflow in the original
`createdAt + transactionBudgetMs`; remaining time is clamped only at the exact
zero boundary. The existing sweep cadence and singleflight remain unchanged.

### B6. Exact-key reader precedes immutable conflict classification

The authoritative reader accepts only an own dense array of length zero or
one, captured with own property descriptors and no iterator/accessor use.
Length zero is `MISSING`; more than one, a hole, accessor, inherited element or
wrong-key row is `INVALID`. It first requires an own primitive
`transaction_id` exactly equal to the requested key. Only then does it capture
the other five immutable fields once and validate them: nonempty primitive
session/mode strings and safe canonical integer epoch/deadline/createdAt values
with no `-0`, fractions, nonfinite or boxed values. Symbols, coercion, polluted
prototypes and getters are refused before equality.

A valid expected-key row with all six fields equal is the same creation. A
valid expected-key row with any of the other five different is a foreign
collision. Wrong ID, incomplete/malformed fields, unavailable read and missing
row are never collisions. Status, participant set, progress and decision may
advance and remain outside this immutable comparison.

### B7. Transaction-owned registration failure policy

`DurableWorkflowCoordinator` receives an injected
`registrationPersistenceFailureDisposition(candidate, capturedFailure)`
policy. Its default for every workflow owner is always `REMOVE`. The
transaction coordinator supplies the only nondefault closure, which recognizes
only the persistence owner's private, once-captured uncertain classification;
transport exception properties and caller booleans cannot request retention.

`RETAIN_UNRESOLVED` is honored only while both coordinator maps still point to
the exact candidate and it is still `INSERT_OUTCOME_UNCERTAIN`. Otherwise the
callback is stale and changes nothing. Resolution under the session FIFO uses
the same exact-object checks: initial insertion mutates that object to ACTIVE;
foreign collision removes it; advanced same-creation removes it before normal
recovery installs the authoritative row; uncertainty retains it. The generic
coordinator gains no transaction state, alternate map or owner-specific default.

### Round-two evidence matrix

Production evidence must use the real gateway and SQLite row, record the
attempted descriptor/key/bytes, captured delivery answer, exact reader state,
classification, both workflow maps, durable rows before/after and emitted
participant/decision operations. It must cover:

1. definitive foreign PK collision and bounded re-mint;
2. generic constraint, timeout and inferred/invalid completion retaining the
   same descriptor and ID;
3. redelivery winning before the late first apply, and late first apply winning
   before redelivery, both converging on one exact row;
4. exact initial and advanced same-creation rows, including nonempty COMMIT
   through normal recovery;
5. wrong ID, incomplete same ID, multiple rows, sparse/accessor/inherited and
   hostile primitive rows, all with no re-mint;
6. expiry plus one bounded sweep reconciliation with no rollback/decision or
   participant fanout;
7. exact-candidate stale callback and recovered-owner replacement races; and
8. remote engagement, process exit, restart MISSING, late original apply and
   zero replacement IDs for the retired session, paired with restart recovery
   when the original row already exists.

The source19 transaction-binding snapshot stays byte-identical. This design
remains held for independent review before any source or test correction.

## Round-three bounded correction

The independently rejected round-two subject is preserved verbatim at
`evidence/design-query-begin-uncertain-insert-resolution-round2-a43e0a4f.md`,
SHA-256
`a43e0a4f5d1e4022277200fb02db6ad23d40165a6e079e85194620da3af37c1b`.
This section answers N1 through N4 in
`review-begin-uncertain-design-round2-cdc56.md`, SHA-256
`6b27140ae6f3a6ea96abe1fe06d085190902304521333ffe70aa475fc53fdc2f`.
It supersedes the round-two reentry, timeout, retention-bound and canonical-row
clauses only. The same-attempt INSERT/read classifier, six immutable creation
fields, mutable advanced-progress handoff, late-first-apply behavior and honest
restart ceiling remain unchanged.

### N1. An unbound BEGIN reenters the raw live-session creation owner

The one BEGIN admission method reads the coordinator's raw
`workflowsByOwnerKey` binding before it considers minting. It does not call the
public `getTransaction` projection, because that projection deliberately hides
an unusable creation hold.

For a BEGIN on one still-live session:

- if `expectedTransactionId` is absent and the raw owner-key binding is the
  exact `INSERT_OUTCOME_UNCERTAIN` descriptor, BEGIN reenters that descriptor's
  reconciliation and returns its original ID or its new typed disposition;
- if an expected ID is present and equals that descriptor's ID, it takes the
  same path;
- if an expected ID differs, it returns the existing identity refusal and does
  not read, deliver, remove or replace the descriptor; and
- only absence of any exact raw binding permits ordinary new-ID creation.

The raw lookup is captured before FIFO enqueue only to select the requested
path, then reread and compared by exact object, session and transaction ID after
the FIFO is acquired and after every await. Replacement, terminal removal or
shutdown makes the stale callback a no-op/refusal. Consequently an ordinary
pgwire BEGIN whose first answer is uncertain stays wire-IDLE, but a second
unadorned BEGIN on the same socket reaches the same descriptor/key/bytes even
though pgwire has no `expectedTransactionId`. Application-database calls with a
new random session remain new creations; no cross-session inference is added.

The required wire witness sends a real BEGIN, loses the INSERT answer, observes
typed uncertainty plus wire IDLE, and sends a second plain BEGIN on the same
socket. It must show one transaction ID, one canonical row/key and no second
mint. Matching explicit ID succeeds through the same path; an explicit wrong
ID refuses without changing the held descriptor.

### N2. One absolute reconciliation turn includes FIFO wait

Every foreground BEGIN reconciliation and recovery-sweep selection captures
`reconciliationDeadlineAtMs` once, before it enqueues on the session FIFO. The
owner obtains the configured query timeout once, validates it as a positive
safe integer, and uses checked addition with the injected clock. While the
original transaction deadline is still live, the turn deadline is the earlier
of that deadline and this control deadline. After original expiry, the control
deadline bounds reconciliation only and grants no transaction activity.

After FIFO acquisition, before exact INSERT redelivery, and again before the
exact-key read, the owner computes positive safe remaining time from that same
absolute deadline. Both gateway calls receive the same deadline-bearing
`timeoutBudget`; neither receives a fresh relative `queryTimeoutMs`. The gateway
therefore recomputes its own remaining time for each call. No remaining time
means typed retained uncertainty and no next call. INSERT success still needs
the evidence required by the existing classifier; budget exhaustion never
manufactures MISSING, collision or terminal no-effect.

The timing witness latches FIFO release, INSERT completion and read start. It
includes queue delay in the one window, proves the read is omitted at zero
remaining time, and proves total elapsed reconciliation cannot become two full
query timeouts. Unsafe, fractional, nonfinite, negative and negative-zero
clocks/budgets refuse before arithmetic or delivery.

### N3. Transaction-owned uncertain-retention reservation

`DistributedTransactionCoordinator` owns one volatile capacity counter; the
generic DWC maps and control-plane write-identity registry are not counted as
capacity. SQL-engine construction supplies three strictly validated immutable
limits from the query-coordinator configuration owner:

```text
maxUncertainTransactionCreations
maxUncertainTransactionCreationCanonicalBytes
maxUncertainCreationSweepPerTurn
```

The production defaults are respectively `100`, `1048576` bytes and `16`.
They are transaction-owner resource defaults, not logical transaction or
participant limits. Constructor overrides support lower deterministic test
pressure; zero, negative, fractional, unsafe, nonfinite, boxed or accessor
values refuse configuration. A future default change is an explicit resource
configuration change and cannot reclassify already retained descriptors.

Before installing the DWC candidate or making the first INSERT, the BEGIN FIFO
builds the exact canonical initial-row bytes and 64-byte lowercase-hex
idempotency key. It synchronously reserves one count plus
`UTF8.byteLength(canonicalInitialRowBytes) + 64` bytes. Both totals must fit in
safe integer arithmetic and remain within both limits. If either reservation
fails, BEGIN returns typed retryable `TRANSACTION_CREATION_PRESSURE` before any
gateway delivery, participant effect, descriptor installation or new identity
exposure. A single descriptor larger than the byte budget receives the same
pre-delivery refusal.

The reservation is stored on and identity-equal to the exact descriptor. It is
released synchronously only when that same descriptor becomes ACTIVE, a
confirmed foreign primary-key collision removes it, a classified terminal
no-effect/removal removes it, or process retirement removes all volatile state.
A collision releases the first reservation; any bounded re-mint must reserve
its new row/key before delivery. Timeout, callback lateness, UNAVAILABLE,
INVALID, MISSING alone, generic constraint and retry exhaustion do not release
an in-process uncertain reservation. Exact-object checks prevent a late result
from releasing a successor's capacity. Process restart makes no claim to retain
an unpersisted request; any durable late row remains ordinary census debt under
the original ID.

Creation-uncertain descriptors join the existing recovery sweep's retryable
defer path. A sweep selects at most
`maxUncertainCreationSweepPerTurn` exact descriptors, in stable transaction-ID
order after a volatile rotating cursor, and still uses each session's FIFO.
An unavailable/pressure result calls the existing `deferRecoverySweep` once
for the turn, with its existing retry-after/exponential cap; it does not create
a timer or per-descriptor promise. Shutdown drops the cursor with the other
volatile state. A later sweep resumes from the next retained ID, so a repeatedly
unavailable first descriptor cannot starve the rest.

Diagnostics are folded once per sweep/defer window and contain retained count,
reserved canonical bytes, oldest original deadline, selected count, deferred
attempt count/until time and one canonical stop reason. They do not emit one
log per held session per second. The existing unref sweep remains the only
background wake.

The capacity witness configures a low count and byte limit, drives many real
sessions, and proves the first excess BEGIN refuses before delivery. Resolving
one exact descriptor releases exactly its reservation and lets one waiting
new BEGIN reserve. A separate unavailable sweep proves at most the configured
batch runs, one backoff advances, diagnostics fold, all identities remain held,
and deadline expiry releases nothing.

### N4. Canonical domains and complete initial-row bytes

The strict reader and producer use the same canonical validators before any
equality or collision decision:

- `transaction_id` is the exact already-requested primitive 32-character
  lowercase hexadecimal key;
- `session_id` is the captured nonempty primitive own string;
- `transaction_epoch` satisfies existing
  `isCanonicalTransactionEpoch`;
- `transaction_mode` is exactly one value of existing `TRANSACTION_MODE`
  (`AUTOCOMMIT` or `EXPLICIT`);
- `created_at`, `updated_at` and `timeout_deadline` are primitive safe
  nonnegative integers other than negative zero, with
  `updated_at === created_at` for the initial row and
  `timeout_deadline >= created_at`; and
- the remaining initial fields use their existing canonical initial values:
  `status=ACTIVE`, `participant_set_state=OPEN`,
  `participant_set_text` equal to the primitive string `[]`,
  `commit_mode=NOT_SELECTED`,
  `frozen_participant_count=0`, and the three decision fields are null.

The immutable identity comparison remains exactly the six creation fields.
Status, participant set, progress and decision may legitimately advance and
are handed to normal recovery. The complete *attempted initial INSERT bytes*,
however, use this fixed order:

```text
transaction_id, session_id, status, transaction_epoch, timeout_deadline,
transaction_mode, participant_set_state, participant_set_text, commit_mode,
frozen_participant_count, updated_at, decision, decision_text,
decision_digest, created_at
```

Encoding is `sql-transactions-begin-row-v1` plus NUL, followed by each value in
that order. A UTF-8 string is `s<decimal byte length>:<bytes>`, an integer is
`i<canonical base-10 digits>;`, and null is `n;`. No object enumeration,
iterator, locale, coercion or JSON serialization participates. The delivery key
is SHA-256 of `sql-transactions-begin-key-v1` plus NUL, the same encoded
transaction-ID string, then `b<decimal row-byte length>:<row bytes>`.

The fixed vector uses transaction ID `00000000000000000000000000000000`,
session `session-1`, epoch `0`, deadline `1700000030000`, mode `EXPLICIT`,
created/updated `1700000000000`, and the initial constants above. Its row is
183 bytes with SHA-256
`3a203ee75b7404a614e9061d958d3c18eacdbf70ecb6d984f17aec50de67124c`;
the 254-byte key input yields
`d9ff43857c5514ccf70b808cfa2468a018321beeb4c805d234d2ede5cc1ac9a7`.

A wrong mode, noncanonical epoch/ID/timestamp, boxed primitive, accessor,
missing field, wrong encoding or reordered object is `INVALID`, retains the
same descriptor/reservation, and never reaches collision or re-mint. Reordering
an input object's properties while preserving the canonical field values must
produce the vector above because the encoder reads the fixed field list once.

### Round-three proof ceiling

Future evidence must add the real pgwire unbound retry, low-cap many-session
pressure/refusal/release, shared FIFO/INSERT/read deadline, wrong-mode INVALID
and fixed digest vector to the existing late-apply, restart-MISSING, advanced
nonempty-COMMIT, exact-candidate race and before/after durable-row matrix.
Every case records attempted descriptor, reservation, key/bytes, producer/read
classification, durable rows and emitted participant/decision operations.

This amendment changes no source, test, Quest log or runtime. It adds no
durable ledger, attempt-status protocol, retry scheduler or replacement
identity authority. The nineteen reviewed transaction-binding files remain
frozen, and implementation remains held pending independent review of this
exact subject.

## Round-four bounded correction

The independently rejected round-three subject is preserved verbatim at
`evidence/design-query-begin-uncertain-insert-resolution-round3-69f91acc.md`,
SHA-256
`69f91acc2d5a1b69998e9426787ed096c6cdfd6a641e1f1ee9c254da3b696a3a`.
This section answers P1 and P2 in
`review-begin-uncertain-design-round3-cdc56.md`, SHA-256
`1b2fb187a320043daaac1136d6f24fd83bc49516083e99bc795519ab6ca11ad7`,
and makes client loss distinct from process retirement. It supersedes only
N3's allocation/release ordering, N4's shared producer/reader validation, and
the prior request-lifetime wording. N1's exact live-session reentry, N2's
pre-FIFO absolute turn deadline, the six immutable creation fields, the fixed
15-field encoding and digest vectors, and the existing recovery sweep remain.

### P1. Reserve before allocation and release the exact owner once

`DistributedTransactionCoordinator` owns three separate volatile resources:

```text
uncertain creation descriptor count
uncertain creation retained-byte count
attached foreground creation waiter count
```

The existing `maxUncertainTransactionCreations` value bounds both descriptor
count and waiter count, with independent counters; the existing canonical-byte
limit bounds descriptor-owned bytes. This does not make a waiter a transaction
authority. It only bounds foreground request closures while descriptors remain
owned by the coordinator. The existing sweep has no foreground waiter.

Before the first INSERT, while the session FIFO is held, the coordinator:

1. captures each producer field once as an own primitive and validates its
   fixed domain without constructing a row buffer, delivery-key input or DWC
   candidate;
2. obtains each UTF-8 string byte length and each fixed tag/delimiter length,
   then uses checked safe-integer addition to compute the exact canonical-row
   byte length, exact 64-byte lowercase-hex key length and total retained-byte
   charge;
3. atomically reserves one descriptor slot, that exact byte charge and one
   foreground waiter slot; refusal returns
   `TRANSACTION_CREATION_PRESSURE` before row/key/candidate allocation, ID
   exposure or gateway delivery; and
4. only after reservation allocates one canonical 15-field row buffer, streams
   the fixed key prefix, canonical transaction-ID component and row buffer into
   SHA-256, materializes the single 64-byte key string, constructs the compact
   DWC candidate and begins delivery.

The hash owner never materializes a second concatenated key-input buffer.
Any future owner-retained row or key copy must be charged before allocation.
Temporary fixed primitives already owned by the incoming request are not a
second encoded-row allocation. If allocation or candidate installation throws,
the coordinator first clears every partial row/key reference and then releases
the exact never-delivered reservation and waiter token.

The reservation token is identity-equal to its descriptor and has one guarded
release operation. Every release path first synchronously drops the
descriptor's canonical-row buffer, delivery-key string and any attempt-closure
references, and only then decrements the exact byte and count totals:

- an exact initial-row readback clears those references, releases once and
  transitions that same candidate to ACTIVE in the same no-await owner turn;
- a valid same-creation advanced row removes that exact uncertain candidate,
  clears and releases once, then hands the captured authoritative row to
  `SQLQueryEngine.retainAdvancedDistributedTransactionReadback` and the normal
  recovery owner;
- a producer-confirmed foreign primary-key collision or classified terminal
  no-effect removes the exact candidate, clears and releases once before any
  bounded replacement attempt; and
- `SQLQueryEngine.shutdown()` stops the recovery sweep and invokes a narrow
  coordinator process-retirement hook which clears all exact descriptor byte
  references and releases their tokens before the engine becomes unreachable.

Timeout, foreground waiter detachment, socket close, UNAVAILABLE, INVALID,
MISSING alone, generic constraint, retry exhaustion and a stale callback do not
release descriptor capacity. A stale callback cannot release a successor's
token. If normal advanced-row recovery throws after the exact handoff, the
durable row remains ordinary census debt; the released volatile attempt bytes
are not reinstalled and no replacement identity is minted.

A same-session retry of an existing descriptor acquires only a waiter token,
before enqueue, and releases that token on answer, request deadline or client
detach. Waiter pressure returns typed retryable pressure without changing the
descriptor or its original deadline. The low-capacity witnesses must prove:

- an oversized session/row is refused before encoded buffer, key, DWC candidate
  or gateway delivery allocation;
- initial-row success and advanced-row handoff each clear owned bytes before
  one release, with a stale callback unable to double-release; and
- released descriptor and waiter capacity can each be reused independently.

### P2. Producer constants and authoritative reader domains are separate

The attempted INSERT producer requires all 15 ordered columns and the exact
initial mutable constants from N4. That producer validation and fixed encoding
remain unchanged. It is the only place that requires `status=ACTIVE`, an OPEN
empty manifest, `commit_mode=NOT_SELECTED`, zero frozen participants, equal
created/updated timestamps and null decision fields.

The exact-key authoritative reader has a different contract. It first requires
an own dense result array of cardinality zero or one and an own complete
15-column row. It captures each column once without accessors, inheritance,
coercion or iteration. It validates the key and all columns under their general
persisted domains, including advanced transaction status, participant-set,
commit-mode, frozen-count and decision combinations. Malformed, incomplete,
sparse, accessor-backed or domain-invalid mutable state is `INVALID` and
retains the existing descriptor; it is never collision authority.

Only after that complete general-domain validation does the reader compare the
six immutable creation fields:

```text
transaction_id
session_id
transaction_epoch
timeout_deadline
transaction_mode
created_at
```

A valid complete row whose six captured fields differ is a foreign creation
only when the producer supplied the separately required specific primary-key
conflict evidence. A valid row with all six equal is the same creation even if
its other nine fields have advanced. Exact equality with the producer's full
15-field initial values permits the ACTIVE transition. Any other valid
same-creation state is handed, unchanged, to
`recoverFromSystemTables` and the existing participant-census and decision
validation. The reader never requires ACTIVE, `[]`, `NOT_SELECTED`, zero or
null decision fields as a condition for recognizing the six-field creation.
An advanced nonempty COMMIT row must therefore retain its original ID,
participants, prepare coordinates and decision and resume normal recovery.

### Client loss detaches a waiter, not the server recovery obligation

The compact uncertain descriptor, its six immutable fields, canonical initial
content/key, original transaction deadline and exact capacity token are
installed in `DurableWorkflowCoordinator.workflowsById` and
`workflowsByOwnerKey` before the first INSERT can be delivered. Once delivery
may have been accepted, losing its response, exhausting the foreground wait
deadline, or losing the client connection cannot remove that descriptor.

The existing cleanup boundary is kept explicit:

- `PgWireProtocolHandler.destroy()` remains the socket owner and calls
  `PostgresWireAdapter.closeSession()`;
- `PostgresWireAdapter.closeSession()` remains the protocol-session and open
  transaction-block cleanup owner. It calls one new narrow
  `SQLQueryEngine.detachDistributedTransactionCreationWaiter(sessionId)`
  interaction before deleting its session. The coordinator implementation of
  that interaction captures and exact-object checks the current waiter for the
  session and releases only that waiter. It does not call
  `DurableWorkflowCoordinator.removeWorkflow`, release descriptor bytes, or
  classify INSERT outcome;
- the in-flight coordinator turn remains bounded by its already captured
  absolute turn deadline even when its waiter detaches. It may publish a late
  classification to the descriptor, but has no socket to answer; and
- `DistributedTransactionCoordinator.runRecoverySweep`, using the existing
  `loadRecoveryStateForSweep` and `recoverFromSystemTables` path, owns later
  discovery and recovery. A late INSERT first visible after client disconnect
  is adopted under the original ID and enters normal recovery without a client
  callback.

`SQLQueryEngine.shutdown()` is process retirement; a pgwire socket close is
not. Normal process shutdown may clear the volatile descriptor only after the
recovery sweep is stopped, through one proposed
`DistributedTransactionCoordinator.retireUncertainCreationsForProcessShutdown`
hook which performs the P1 reference-drop and exact-token release. The existing
`PgWireProtocolHandler.destroy()` path never calls that process hook. Because an
uncertain BEGIN has not entered a transaction block, its protocol state is
IDLE; close passes `transactionOpen: false` and does not route the obligation
through `rollbackClosedSessionTransaction`.
A crash loses volatile descriptors honestly. Durable rows remain discoverable
by normal startup census under their original ID. This amendment does not claim
that an unpersisted request survives process death and does not correlate a
future process by credentials, SQL text, timing or address.

On a still-live pgwire session, a later ordinary unadorned BEGIN reads the same
raw owner binding and reenters the original ID. A reconnect creates a new
session and an ordinary BEGIN there is a new creation; it does not adopt the
disconnected session's descriptor. The old descriptor remains server-owned
and is recovered or classified by the existing sweep. No hidden client retry
token is added.

Every foreground attempt captures its one absolute wait deadline before FIFO
enqueue. Expiry ends that caller's wait and releases only its waiter. It does
not release descriptor count/bytes, change the original transaction deadline,
or grant a renewed transaction-admission budget. Each background reconciliation
turn captures its existing recovery control deadline before FIFO and remains
bounded by the existing sweep lifecycle, batch limit and defer/backoff. Later
sweeps are owner recovery turns, not renewed client requests. Unresolved
descriptors are never LRU- or age-evicted. Capacity exhaustion during prolonged
uncertainty is the intentional availability tradeoff.

The production wire witness uses an ordinary pgwire client with no hidden
identity option. It proves an uncertain first BEGIN emits an error followed by
`ReadyForQuery(I)`, a subsequent BEGIN on the same live connection reenters the
same ID, and a resolved ACTIVE result changes the wire state to transaction
state so ROLLBACK returns it to idle. A disconnect schedule proves waiter-only
cleanup, late durable visibility and server recovery of the old ID. A reconnect
then uses a new session and a new BEGIN without correlation. The internal
SQLite matrix continues to record descriptor/key/reservation, producer answer,
reader state, durable rows before/after, participant/decision effects and exact
single releases.

### Round-four proof ceiling

This correction changes no source, test, Quest log or runtime. It adds no
ledger, retry scheduler, gateway attempt-status query or replacement identity
owner. The nineteen reviewed transaction-binding files remain frozen. Future
implementation must couple the coordinator capacity/descriptor changes,
private DWC failure disposition, strict persistence reader, engine shutdown
hook, adapter waiter detach and the real wire/SQLite witnesses in one impact
contract before independent source review.

## Round-five bounded correction

The independently rejected round-four subject is preserved verbatim at
`evidence/design-query-begin-uncertain-insert-resolution-round4-d99b8054.md`,
SHA-256
`d99b8054db65bae778164349395a883b436ee30964e849d22eff964ee54ddbdb`.
This section answers B4-1 through B4-3 in
`review-begin-uncertain-design-round4-marker.md`, SHA-256
`1a2f06c29fda4c5c8ffb1f2e4975a44b12f88971cc313f09f7903bf93caa7708`.
It supersedes only the round-four FIFO resource lifetime, resolved-result
delivery and pgwire state claims. The accepted P1 row/key preallocation and
reference-drop ordering, P2 producer-versus-reader split, six immutable
creation fields, original deadlines, one identity and existing recovery sweep
remain unchanged.

### B4-1. Admit retained work before the session FIFO

`DistributedTransactionCoordinator.begin()` reserves a transaction-creation
operation token **before** calling `runTransactionOperation`, for every BEGIN
branch. This includes the first BEGIN, calls racing before the first descriptor
is installed and retries of an existing descriptor. Failure returns
`TRANSACTION_CREATION_PRESSURE` before enqueue, identity generation, encoded
row/key allocation, DWC candidate construction or gateway delivery. The
existing promise-chain FIFO remains the sole execution lane; this adds no queue
or scheduler.

The coordinator's one creation resource owner accounts independently for:

```text
queued-or-running creation operation count
queued-or-running creation retained-byte charge
attached caller count
uncertain descriptor count
uncertain descriptor canonical-byte charge
pending creation-result handoff count and byte charge
```

The configured count is applied separately to operations, attachments,
descriptors and result handoffs. One aggregate retained-byte pool covers every
variable string or byte buffer retained by any of those objects. Before FIFO
enqueue, the operation charge conservatively includes the captured UTF-8
`sessionId`, optional expected transaction ID, invocation ID, absolute turn
deadline and fixed operation-record overhead. A retained reference is charged
as if it were a copy; request ownership or prior allocation does not exempt it.
The operation closure is a fixed record which captures none of the SQL text,
socket, request, authentication state, error object or response callback.
Descriptor row/key bytes are later reserved and allocated in the accepted P1
order. If an operation transfers a reference to a descriptor or handoff, the
aggregate owner upgrades the charge atomically before retaining the reference.

An attached caller has a distinct bounded record keyed by the coordinator's
invocation ID. Deadline or socket loss atomically marks that record detached,
nulls its response/socket/request references, and releases only its attachment
count. `detachDistributedTransactionCreationWaiters(sessionId)` captures the
session's complete own dense invocation-ID set once and detaches every matching
attachment; it is plural and idempotent. It does not release operation,
descriptor or handoff capacity.

The operation token lives until the actual queued or running FIFO reaction has
settled. Client timeout cannot release it. When a detached operation eventually
reaches the head:

1. if gateway delivery never began and no descriptor was installed, it rereads
   the current session binding; with none, it clears its minimal captured
   strings and ends without minting or delivering;
2. if another turn installed the session descriptor or result handoff, it
   exact-object reenters that owner and performs at most the bounded
   reconciliation that the original captured deadline still permits; and
3. if its delivery may have been accepted, it transfers recovery solely to the
   already reserved descriptor before it may stop foreground work.

Every exit first nulls the fixed operation record's captured strings and owner
references, then settles/removes its FIFO reaction, and only then releases its
exact operation count and byte charge. A stale completion cannot release a
successor invocation token. No design claim requires unlinking a native Promise
reaction; the retained reaction remains charged until it runs and settles.
Thus repeated short-lived callers behind a withheld head cannot reuse released
operation capacity while their closures remain queued.

The capacity witness sets low count and byte limits, withholds a real first
INSERT/FIFO head, races initial BEGINs and repeated short-deadline retries, and
detaches all callers. It inspects coordinator operation/attachment/descriptor
counts and charged bytes, proves later calls are refused before enqueue and
delivery, then releases the head. Each retained reaction must clear and release
exactly once; the freed capacity must be reusable, and any delivered uncertain
descriptor must recover under its original identity after disconnect.

### B4-2. Deliver a background-resolved creation exactly once

Creation resolution and delivery to a live pgwire session are separate states
owned by `DistributedTransactionCoordinator`. A resolution completed after its
caller detached or stopped waiting installs one compact bounded
`creationResultBySession` handoff before releasing the descriptor's capacity.
The aggregate owner reserves the handoff count and byte charge first, then
captures the exact session, transaction ID, workflow identity, resolution
revision and one disposition:

```text
ACTIVE_READY | RECOVERY_PENDING | EXPIRED_OR_ENDED
```

`ACTIVE_READY` means the exact initial row became the usable ACTIVE workflow
but its original BEGIN success was not delivered. It is not another BEGIN and
does not authorize user statements while the pgwire session remains idle.
`RECOVERY_PENDING` names a valid same-creation row whose mutable fields already
advanced and was handed unchanged to normal recovery. `EXPIRED_OR_ENDED`
records the exact current timeout or terminal disposition. The handoff has no
independent authority: each consumption rereads the same workflow/ended record
and exact resolution revision under the session FIFO. A stale handoff cannot
reopen or overwrite an advanced transaction.

The attached invocation and handoff use one coordinator-owned delivery CAS:
`WAITING(invocationId) -> DELIVERED` when the original caller accepts the
success, or `WAITING(invocationId) -> HANDOFF_PENDING` when detach wins first.
Only the winning transition owns the result. A late socket callback after
`HANDOFF_PENDING` is inert; a retry cannot consume while the original callback
owns `DELIVERED`. If the aggregate owner cannot reserve handoff count/bytes,
the descriptor and its charged references remain installed and the existing
sweep defers the transition. Resolution is never dropped to make room.

`beginOwned()` checks this exact handoff before its ordinary
`TRANSACTION_ACTIVE` branch. For the same live session:

- an unadorned BEGIN, or one naming the exact expected transaction ID, consumes
  a still-current `ACTIVE_READY` once and returns the original successful BEGIN
  with that ID. Pgwire then enters transaction state normally. It performs no
  INSERT, remint, reset or recovery action;
- an explicit different expected ID is refused and does not consume it;
- `RECOVERY_PENDING` returns the existing typed recovery-incomplete/current
  decision outcome and leaves the wire outside a usable block; and
- `EXPIRED_OR_ENDED`, or an ACTIVE handoff whose current workflow has since
  expired or advanced, returns the exact existing timeout/terminal outcome. It
  never reports a stale successful BEGIN.

After successful consumption, later BEGIN uses the ordinary
`TRANSACTION_ACTIVE` rule. Session close removes only this client-delivery
handoff after nulling its strings and releasing its capacity; the workflow,
durable row and server recovery obligation remain. A reconnect is a new session
domain and cannot consume the old handoff. If a workflow ends before delivery,
the same bounded handoff retains only its terminal disposition until live
session consumption or detach; it is not a second transaction record.

The paired witness holds the session FIFO so that (a) plain retry reconciles the
uncertain descriptor before the sweep and (b) the sweep/late turn installs
`ACTIVE_READY` before plain retry. Both schedules yield one ID, one initial
INSERT and wire transaction state only after the success is delivered. A third
schedule advances or expires the row before consumption and proves the client
gets the exact current disposition without reopening settled work.

### B4-3. Distinguish owner occupancy from an entered protocol block

The coordinator keeps `hasActiveTransaction(sessionId) === true` for an
uncertain creation so ordinary SQL, autocommit, enlistment and decision paths
remain closed. Pgwire outcome selection no longer infers an entered block from
that admission predicate. `withSessionTransactionState` captures an exact own
primitive projection from the coordinator:

```text
NONE | CREATION_PENDING | ENTERED_ACTIVE
```

`CREATION_PENDING` covers an unresolved descriptor and an undelivered creation
result handoff. `ENTERED_ACTIVE` requires the original BEGIN success to have
been delivered/consumed for this live protocol session. This field is an
outcome projection only; it cannot grant transaction authority, change a
workflow, or make coordinator occupancy false.

`resolveFailedStatementOutcome` consumes that exact projection at its existing
engine-to-pgwire boundary. The canonical ordinary-client behavior is:

1. A first BEGIN whose INSERT outcome is uncertain returns
   `TRANSACTION_CREATION_UNCERTAIN` plus `ReadyForQuery(I)`.
2. ROLLBACK while the projection is `CREATION_PENDING` returns the same typed
   retained-creation error plus `ReadyForQuery(I)`. It neither reports
   `NO_TRANSACTION` nor issues a workflow rollback. If the socket previously
   reached `E` under the old outcome rule, this exact ROLLBACK is admitted by
   `PgWireSession`; the same typed answer moves it to `I` because the engine
   proves there is no entered block while retaining the creation obligation.
3. A subsequent plain BEGIN consumes a current `ACTIVE_READY` handoff and
   returns CommandComplete BEGIN plus `ReadyForQuery(T)`, or it reenters the
   same uncertain descriptor and repeats the typed error plus `I`. It never
   reissues the creation identity.
4. Only after successful BEGIN delivery does ordinary ROLLBACK execute the
   existing transaction rollback and return CommandComplete ROLLBACK plus
   `ReadyForQuery(I)`.

A ROLLBACK received while `ACTIVE_READY` is pending still returns the retained
creation-result error and `I`; the client must consume the original BEGIN result
before it can issue an ordinary rollback. This avoids silently rolling back a
transaction block the protocol never entered. COMMIT cannot use this projection
to commit an undelivered creation.

`PostgresWireAdapter.closeSession()` first detaches **all** bounded caller
attachments, independent of the wire state. For an `I` close, no rollback
cleanup runs. For a reachable legacy or racing `E` close, the existing
`rollbackClosedSessionTransaction` may call the engine, but the coordinator's
`CREATION_PENDING` gate returns the typed retained-creation result without
rollback, descriptor removal or token release. The adapter then drops only
session/client delivery state. The existing recovery sweep continues to own the
server obligation. A fully delivered `ENTERED_ACTIVE` close retains the current
best-effort rollback behavior.

The production pgwire witness records ErrorResponse code/detail and every
ReadyForQuery status for both paths: uncertain BEGIN -> `I`, unresolved
ROLLBACK -> typed error + `I`, same-session BEGIN -> original ID + `T`, and
ordinary ROLLBACK -> `I`. It repeats from a preexisting `E` state to prove the
narrow ROLLBACK recovery to `I`. A close at both `I` and `E` records the exact
unchanged descriptor/durable row and later sweep recovery. Engine/SQLite
evidence records that neither uncertain ROLLBACK nor close emits participant
ROLLBACK, changes a decision, removes the workflow, or mints a replacement ID.

### Round-five proof ceiling

This is a design-only correction. It changes no source, test, Quest log,
activation/C3 document or runtime. The required implementation is one coupled
change across the existing coordinator FIFO/resource owner, result handoff,
engine outcome projection, pgwire outcome/session and adapter close owners.
It adds no durable ledger, gateway status protocol, retry scheduler or
cross-session identity mechanism. The nineteen independently approved
transaction-binding source files remain byte-identical and frozen pending a
separate reviewed implementation scope.

## Round-six bounded B4-2 correction

The independently rejected round-five subject is preserved verbatim at
`evidence/design-query-begin-uncertain-insert-resolution-round5-44e72047.md`,
SHA-256
`44e72047a3319b020e3c77e3586ef8bcaa0282cd3231ccdd52d74b8028a9f326`.
This section answers R5-1 through R5-3 in
`review-begin-uncertain-design-round5-cdc56.md`, SHA-256
`c6fa50e11e4d55b347e6315b68f0ede424f9d7fb1ef277dfbf6b1ff92fff9b40`.
It supersedes round five B4-2's separate `creationResultBySession` handoff and
its two-state delivery CAS. Round five B4-1 retained-work accounting and B4-3
`NONE | CREATION_PENDING | ENTERED_ACTIVE` projection remain unchanged, as do
the producer/general-reader domains, identity, encoding and deadlines.

### R5-1. One record and one transition envelope

The coordinator does not allocate a second result record after resolving the
INSERT. The existing creation/workflow record remains the sole object and the
existing `workflowsByOwnerKey` session index remains its lookup. Its state
changes in place. A valid advanced row transfers the same token to the existing
ordinary recovery or `endedTransactions` record; it does not create a parallel
result owner.

Before the first INSERT, the accepted P1 calculation also computes the exact
conservative charge of every later representation of that record:

```text
uncertain descriptor row/key/attempt references
live-consumer result entitlement and claim fields
server-recovery-only fields
advanced/ended disposition fields
fixed index and transition scratch overhead
```

The token's admitted byte charge is the maximum complete transition footprint,
including the brief fixed scratch needed to rewrite the record and index. Each
variable string is length-checked once and charged at every simultaneously
retained reference; no transition constructs another encoded row, key input or
copy. This explicit envelope is reserved with the descriptor count before row,
key, DWC candidate or gateway delivery allocation. Pressure refusal therefore
still happens before identity exposure or INSERT. It is not borrowed global
headroom and cannot be consumed by another attempt.

Resolution executes one synchronous no-await owner turn. It captures and
validates the target scalars, checks safe-integer accounting, clears the
descriptor-only row/key/attempt references, rewrites the same record and index,
and reclassifies that exact token. The aggregate charge never increases during
the transition. After the target representation is installed, unused envelope
bytes may be released once; a stale callback cannot release or reclassify a
successor token. Allocation failure before the rewrite leaves the original
descriptor and token intact. No transition waits for additional aggregate
capacity, so a legal descriptor that individually fills the pool, or a cohort
that collectively fills it, can still resolve without an external release.

The accepted B4-1 counts remain separate: the owner atomically decrements the
uncertain-descriptor count and increments the live-result-entitlement count
when the same record changes role. `SERVER_RECOVERY_ONLY` decrements the
descriptor count without consuming a client-entitlement slot. No interval owns
neither count, and no transition temporarily consumes two count slots.

The full-pool witness covers both cases. It verifies unchanged total charge
during each descriptor-to-live-result or descriptor-to-server-recovery rewrite,
forward progress at the exact byte limit, later release of only unused/retired
bytes, and capacity reuse without overcommit or double release.

### R5-2. Complete result and server-side acceptance state machine

The same record owns these delivery states:

```text
WAITING(invocationId, consumerIncarnation)
UNCERTAIN_ANSWERED(consumerIncarnation)
SUCCESS_CLAIMED(acceptanceToken, consumerIncarnation, source)
ENTERED_ACTIVE(consumerIncarnation, transactionId)
SERVER_RECOVERY_ONLY
RECOVERY_PENDING | EXPIRED_OR_ENDED
```

`source` is `DIRECT_FIRST_RESULT` or `RETRY_HANDOFF`. All transitions exact-
object compare the record/token, exact primitive compare the transaction and
session IDs, and compare the consumer incarnation described in R5-3.

When the first coordinator turn produces the normal typed
`TRANSACTION_CREATION_UNCERTAIN` result, it transitions `WAITING` to
`UNCERTAIN_ANSWERED` in the same FIFO turn before returning the engine answer.
The old caller attachment may then release on answer while this smaller live-
consumer entitlement stays in the token's reserved envelope. It is neither an
ACTIVE transaction nor proof that a remote client received bytes. If the
consumer is already retired, the same turn chooses `SERVER_RECOVERY_ONLY`.

An exact initial success returned directly to the first BEGIN changes `WAITING`
to `SUCCESS_CLAIMED(..., DIRECT_FIRST_RESULT)` before leaving the coordinator.
If background reconciliation resolves `UNCERTAIN_ANSWERED` first, the same
record becomes the prior `ACTIVE_READY` semantic state without a new object.
A later plain BEGIN exact-rereads it under the FIFO and changes it to
`SUCCESS_CLAIMED(..., RETRY_HANDOFF)`. Both paths return the same private,
one-use acceptance token with the engine result. The token is not a client
identifier, is not serialized in SQL output and grants no COMMIT, statement or
participant authority.

For pgwire, `PostgresWireAdapter` and `PgWireProtocolHandler` consume that token
through one narrow synchronous
`acceptDistributedBeginForProtocol(sessionId, consumerIncarnation,
acceptanceToken, enterLocalBlock)` interaction. After engine success the
handler:

1. exact-checks its current handler phase, `PgWireSession`, adapter session
   incarnation, statement type, transaction ID and acceptance token;
2. writes CommandComplete. `socket.write()` is only a local enqueue and is not
   called client acknowledgement;
3. without an await or event-loop yield, invokes the interaction. The
   coordinator rechecks the exact claim and current workflow, invokes the
   handler's nonthrowing `enterLocalBlock` to set that exact `PgWireSession` to
   `T` with the transaction ID, then changes the record to `ENTERED_ACTIVE` in
   the same synchronous stack; and
4. only after that accepted transition writes ReadyForQuery(T).

The server-side linearization is step 3: exact coordinator claim consumption
and local `PgWireSession` entry are one non-yielding call. It claims local
protocol acceptance, never remote receipt. If validation refuses before
CommandComplete, no success frame is written and a live retry claim returns to
the prior entitlement. If CommandComplete throws, or acceptance refuses after
CommandComplete was enqueued, the handler sends no ReadyForQuery, retires the
connection and exact-token converts the claim to `SERVER_RECOVERY_ONLY`; it
cannot safely answer a second result on that socket. If local entry throws, the
coordinator does not publish `ENTERED_ACTIVE`, restores the prior entitlement
only for the still-current live incarnation, and the handler closes. A stale
callback cannot enter a replacement session or consume another claim.

If ReadyForQuery write fails after step 3, close observes the exact local `T`
and the accepted token. It uses the existing entered-transaction cleanup path;
no result handoff is recreated. This is intentionally independent of whether
the peer actually received CommandComplete or ReadyForQuery.

The existing outer `_handleSimpleQuery` ReadyForQuery site exact-checks that
the handler is still open and still owns the same `PgWireSession` and adapter
incarnation after `_executeAndSend` returns. A post-CommandComplete acceptance
failure calls `destroy()` and the outer site emits no ErrorResponse or
ReadyForQuery on that retired connection. A refusal before CommandComplete may
use the ordinary typed error path because no success frame was enqueued. This
is a guard on the existing handler call stack, not another result owner.

The direct application consumer has no pgwire block. Its existing
`createApplicationDatabaseExecutionOptions` carries the transaction call's
exact private record/generation incarnation through the in-process SQL request.
After `executeCanonical` receives any BEGIN result, before its current
success/failure branch, `projectBeginTransactionId` or the user callback, it
calls the parallel narrow synchronous
`acceptDistributedBeginForApplication` interaction with the private result or
acceptance token. Success moves the same record to `ENTERED_ACTIVE` for that
application scope; refusal throws before the callback. A typed uncertain answer
confirms the already installed `UNCERTAIN_ANSWERED` entitlement, is translated
to the existing application error, and the scope's `finally` retirement
converts its client entitlement to `SERVER_RECOVERY_ONLY`. No wire state or
remote acknowledgement is invented.

The required protocol witness places deterministic latches after engine
success, before CommandComplete, between CommandComplete and the synchronous
local-T/coordinator transition, and before ReadyForQuery. At every latch it
injects close, stale token and callback failure and records the single record
state, local I/T state, frames written, durable row and emitted transaction
operations. Direct-application cases prove the callback runs only after exact
acceptance and that an uncertain result retains server recovery without a wire
projection.

### R5-3. Exact live consumer incarnation and close arbitration

At pgwire authentication, `PostgresWireAdapter` creates one private exact-
object protocol incarnation, stores it in the authenticated adapter session
record and passes it through a private field of the in-process SQL request.
It is not derived from the session string, credentials or time and is not
serialized. The coordinator captures that exact object before any BEGIN await.
`PgWireProtocolHandler` also binds its `PgWireSession` to the same adapter
incarnation when authentication completes. A replacement session, even with a
reused string, cannot match it.

`PostgresWireAdapter.closeSession()` synchronously calls
`retireDistributedBeginConsumer(sessionId, incarnation)` before deleting its
session record. That owner transition and late resolution run on the same
coordinator state with no await at the final compare-and-rewrite:

- if close wins, the exact incarnation is retired. Late INSERT classification
  may update the workflow and durable recovery state, but rewrites the attempt
  only to `SERVER_RECOVERY_ONLY`, `RECOVERY_PENDING` or
  `EXPIRED_OR_ENDED`; it cannot install client-delivery entitlement;
- if result/claim installation wins, close captures and retires that exact
  token, clears its consumer fields and synchronously reclassifies the same
  record to server recovery. A later handler callback is inert; and
- if step 3 protocol acceptance already won, close sees both the same
  incarnation and `ENTERED_ACTIVE` and follows ordinary entered-block cleanup.

The adapter performs retirement for both wire `I` and legacy/racing `E` before
launching any best-effort rollback. That later rollback call cannot remove an
uncertain creation because B4-3's `CREATION_PENDING` gate remains in force.
For application transactions, the existing transaction-scope `finally` invokes
the same semantic retirement with its exact application record/generation
incarnation. Process retirement remains the distinct shutdown hook from round
four.

The close witness executes `I` and `E` closure immediately before and after
uncertain-answer publication, live-result rewrite, success claim and protocol
acceptance. Every pre-accept close leaves zero client entitlements/claims for
the retired incarnation, one original durable identity and only server-owned
recovery. Every post-accept close uses entered-block cleanup. Repeating the
schedule cannot consume the handoff count or byte pool, and a new incarnation
cannot consume an old token.

### Round-six proof ceiling

This amendment is documentation only. It changes no source, test, Quest log,
activation/C3 document or runtime. It adds no result ledger, remote ACK,
gateway status protocol, retry scheduler or cross-session inference. Future
implementation must change the existing creation/workflow record, aggregate
resource owner, SQL result private token path, pgwire adapter/handler/session
acceptance and application-database scope as one reviewed impact contract.
The nineteen independently approved transaction-binding files remain frozen.

## Round-seven role-neutral count correction

The independently rejected round-six subject is preserved verbatim at
`evidence/design-query-begin-uncertain-insert-resolution-round6-07ad9201.md`,
SHA-256
`07ad92019e02aa2bff559778bd1894f6b5e77fcf8639e35a1d70794160761cd1`.
This section answers the sole R6-1 finding in
`review-begin-uncertain-design-round6-cdc56.md`, SHA-256
`6a96493ce9485b73d1eda7288868bab9ca1753117bcddc54f7790f659115989d`.
The accepted maximum byte envelope, result/acceptance state machine, exact
consumer-incarnation arbitration, B4-1 operation/attachment lifetime and B4-3
protocol projection are unchanged.

### One slot across every creation-record role

`maxUncertainTransactionCreations` is the configured maximum number of pending
transaction-creation **records across all roles**, rather than a separate cap
for each role. A clearer implementation name may be
`maxPendingTransactionCreationRecords`, but configuration compatibility keeps
one value and one meaning. The owner reserves exactly one role-neutral slot
before the first INSERT and holds that same slot while the record is any of:

```text
uncertain descriptor
live uncertain-answer or resolved-result entitlement
success claim awaiting protocol/application acceptance
server-recovery-only creation obligation
advanced/ended disposition awaiting live-session consumption
```

Changing role neither acquires nor releases a slot. Descriptor, entitlement,
claim and server-only counts are checked nonnegative safe integers whose sum is
exactly the owned role-neutral slot count; they are diagnostics, not admission
limits. The invariant is checked in the same synchronous owner turn as every
role rewrite. Operation and caller-attachment tokens remain the separate B4-1
resources because their native Promise and client lifetimes are independent.
The round-six maximum byte-envelope token remains paired one-to-one with this
slot.

The slot releases once, after the creation-specific obligation has transferred
completely to an existing ordinary ACTIVE/recovery/ended-transaction owner and
no live consumer result remains, or after an exact terminal/no-effect or
confirmed-collision disposition has been consumed. `ENTERED_ACTIVE` releases
only after the normal transaction owner retains the exact workflow and the
protocol/application acceptance transition has completed. A closed consumer's
`SERVER_RECOVERY_ONLY` record holds its slot until the existing recovery owner
has exact-object accepted the durable row and disposition; disconnect, caller
expiry, unavailable evidence and age never release it. Process retirement uses
the previously specified reference-drop hook and does not claim undurable work
survives a crash.

At a full global slot count, a new creation is refused before INSERT, identity
exposure or descriptor allocation, regardless of the current role mix. An
already admitted record can always change role in place because the slot and
its maximum byte envelope travel with it. Therefore a population full of live
entitlements cannot also admit another descriptor cohort; a mixed population
admitted before saturation may resolve every descriptor without exceeding the
single count or waiting for an unrelated entitlement to retire. This is the
intentional documented capacity tradeoff, not a hidden two-slot multiplier.

### Complete creation transition table

The table is cumulative: “record” means the one coordinator/DWC object, “slot”
means its one role-neutral count token, and “envelope” means the round-six
maximum retained-byte token. Operation/attachment tokens are always the
separate B4-1 resources.

| Transition or schedule | Stable attempt and known durable state | Session entitlement or claim | Retained objects and owner | Exact count/byte release |
| --- | --- | --- | --- | --- |
| Admission before first INSERT | Six immutable fields, fixed 15-field initial bytes and idempotency key are installed; durable effect is not yet known. | `WAITING(invocationId, consumerIncarnation)`. | Coordinator reserves one operation token before FIFO; inside FIFO it reserves one role-neutral record slot plus maximum envelope, then installs the exact DWC record before delivery. | Pressure clears temporary captured inputs and releases the operation/attachment only; no identity is exposed. Admitted slot/envelope remain. |
| Normal uncertain answer | Same ID/bytes/key; producer/read evidence remains unknown, pending, unavailable or invalid. | `WAITING -> UNCERTAIN_ANSWERED`; wire gets typed uncertainty plus `I`, or application gets its typed error. | Same record/slot/envelope; live consumer incarnation retained. Caller attachment releases after the result path accepts the answer; queued/running operation remains charged until settlement. | No record slot or envelope release. Operation and attachment release exactly under B4-1. |
| Retry reaches FIFO before recovery | It exact-rereads the same record and spends only the original captured control deadline; no new INSERT identity. | Still `UNCERTAIN_ANSWERED`, or same record becomes `SUCCESS_CLAIMED(RETRY_HANDOFF)` if its authoritative read now proves initial ACTIVE. | Same record/slot/envelope; retry has its own pre-FIFO operation/attachment tokens. | Retry tokens release after settlement. Record slot/envelope do not change role count or aggregate bytes. |
| Recovery resolves before retry | Authoritative exact initial row is known, or a valid same-creation advanced row is preserved unchanged. | Live exact incarnation retains resolved-result entitlement; advanced/expired state retains its exact typed disposition. A later retry may claim it once. | Same record/slot/envelope rewritten in place; advanced row transfers toward existing recovery/ended owner. | No transition-time slot acquisition. Slot releases only after exact ordinary-owner transfer with no live result, or after live disposition consumption/retirement. |
| Direct first success | Canonical APPLIED or exact initial readback establishes the original row and ID. | `WAITING -> SUCCESS_CLAIMED(DIRECT_FIRST_RESULT)` for pgwire or application. | Same record/slot/envelope plus private one-use acceptance token within the prepaid envelope. | Nothing releases before the appropriate consumer acceptance edge. |
| Protocol or application acceptance | Exact workflow/revision/ID, claim token and consumer incarnation are current; durable row is initial ACTIVE. | Pgwire performs the synchronous CommandComplete/local-T/coordinator transition before Ready; application accepts before projection/callback. State becomes `ENTERED_ACTIVE`. | Normal transaction owner retains the exact workflow; pgwire/application owner retains its local entered-block/scope state. | After both sides of the synchronous acceptance retain their state, creation-only fields are cleared, the one slot/envelope releases once, and ordinary transaction ownership continues. |
| ROLLBACK | While creation is pending, durable state remains uncertain or resolved-but-undelivered; after acceptance it is an ordinary active transaction. | Pending/undelivered ROLLBACK returns typed creation error and `I` without consuming entitlement or emitting rollback. After `ENTERED_ACTIVE`, ordinary ROLLBACK applies. | Pending path keeps same record/slot/envelope. Accepted path is owned by ordinary transaction cleanup. | Pending path releases only its operation/attachment. Ordinary rollback has no creation slot because acceptance already released it. |
| Disconnect at `I`/legacy `E` or after acceptance | Preaccept durable identity/evidence is unchanged; postaccept workflow is ordinary ACTIVE. | Exact incarnation retirement changes preaccept state to `SERVER_RECOVERY_ONLY`; no client entitlement survives. Postaccept close uses entered-block cleanup. | Preaccept same record/slot/envelope stays with coordinator/recovery. Postaccept normal workflow is owned by rollback/timeout recovery. | Preaccept releases attachment/client fields only, not slot/envelope. Slot releases after exact server recovery transfer/terminal. Postaccept has no creation slot to release. |
| Late INSERT/read completion after close | Same original ID/bytes/key; current authoritative row decides initial, advanced, invalid or unavailable. | Retired incarnation can never regain entitlement or claim; state is server-only/recovery/terminal. | Same record/slot/envelope, exact-token checked against close; existing sweep is the only later wake. | No late callback releases a successor. Slot/envelope release only at exact ordinary-owner handoff or terminal disposition. |
| Retained FIFO head and detached retries | A queued operation that never delivered has no durable attempt; a delivered operation points to the one installed record. | Detach removes all caller attachments but never the server record or live result of another invocation. | Each queued native Promise reaction retains its own pre-FIFO operation token/charged minimal record until it actually settles; the creation record has at most one global slot. | Never-delivered queued work clears refs then releases its operation token. Delivered work transfers to the record first. No early reuse of retained-work capacity. |
| Cross-role saturation | A global population of descriptor, entitlement, claim and server-only roles totals exactly the configured slot cap. | Existing live consumers retain their exact states; no role is discarded to admit another. | Each record owns one slot plus one envelope. Role diagnostic counts sum to the cap. | New creation refuses before INSERT. Every admitted record may transition roles at unchanged slot count. When one exact obligation transfers/terminates, its single slot/envelope release permits one new admission. |

### Cumulative evidence packet

The future implementation packet runs the earlier diagnostic and controls in
one coherent byte snapshot: producer-specific PK collision remint, generic
constraint/timeout uncertainty, wrong-key/incomplete/malformed read refusal,
exact initial adoption, advanced nonempty COMMIT recovery, original deadline,
fixed encoding vectors, low pre-FIFO operation/attachment pressure, uncertain
ROLLBACK at `I` and legacy `E`, same-session retry before and after recovery,
application acceptance, protocol latches, disconnect/late completion and stale
incarnation/token negatives.

The added cross-role cases use the same real engine/gateway/SQLite and
pgwire/application consumers. One case fills the global slots entirely with
live entitlements and proves another BEGIN refuses before INSERT. Another
admits a mixed descriptor/entitlement/application cohort up to the cap and
resolves every descriptor through direct success, background resolved result,
application acceptance and server-only recovery without count growth or an
unrelated release. Every case records configured cap, total slots, diagnostic
role counts, exact envelope bytes, durable rows, wire/application result,
participant/decision emissions and single releases. A count-only helper or
manually advanced role is insufficient.

### Round-seven proof ceiling

This correction is documentation only. It changes no source, test, Quest log,
activation/C3 document or runtime. It adds no queue, result object, ledger,
scheduler, remote ACK or cross-session inference. Source implementation remains
held until independent review of this exact subject. The nineteen previously
reviewed transaction-binding files remain frozen.

## Round-eight bounded pre-handoff classification correction

The independently rejected round-five source subject is preserved by the root
checkpoint `082cb60e6d96f17d05f03477c24de247a22be239`. Its review,
`review-begin-uncertain-source-round5-independent.md`, SHA-256
`b4e08617230af527cbb4c66b7e33eb1b4f0d6f77b78010aa5bc23c7effdd2224`,
proved one remaining resource contradiction. The round-seven design preceding
this amendment is preserved verbatim at
`evidence/design-query-begin-uncertain-insert-resolution-round7-3679b87f.md`,
SHA-256
`3679b87f4aeb84fd8d9397aac9f73f686e5fcb990c1e61e86df35e9731f91fa5`.

The rejected source's narrow author correction prepaid the transient descriptor
for a matching initial row and measured `221612 >= 221334` canonical bytes. It
is retained as separate evidence, not accepted source. That correction cannot
close the complete boundary: the current `SELECT *` creation read materializes
and then copies foreign or legitimately advanced mutable fields before the
ordinary recovery owner accepts them. The gateway currently bounds concurrent
requests but does not pass a result-byte bound through
`buildGatewayQueryOptions`. This amendment supersedes only the round-seven
clauses that say BEGIN itself reads or retains a complete authoritative
transaction row. It preserves the six immutable fields, fixed 15-field initial
bytes, exact delivery key, role-neutral record slot, result entitlement,
absolute deadlines, collision rule and all later recovery ownership.

### One authoritative fixed-shape classification snapshot

`SQLQueryEngine.insertDistributedTransactionRowOnce` resolves a non-definitive
INSERT outcome with exactly one authoritative classification statement through
`ControlPlaneSystemTableGateway.readAuthoritativeRows`. It no longer requests
`SELECT *` for the creation decision. The statement selects one fixed-shape
row with these columns only:

```text
attempt_key       exact 64-character original creation delivery key
immutable_match   integer 0 or 1
initial_match     integer 0 or 1
```

The statement addresses `sql_transactions.transaction_id` with the same key
whose INSERT produced the outcome. Its parameters contain the exact attempted
six immutable fields, every value of the fixed 15-field initial row and the
original delivery key. SQL returns `attempt_key` from that bound parameter and
computes both flags from the one row in the one SQLite statement. The gateway's
single-flight identity already includes SQL and all parameters, so a read for
one attempt cannot absorb another attempt's classification. One SQLite
statement supplies one read snapshot; there is no identity read followed by a
mutable-state read inside BEGIN.

The result consumer accepts only a genuine dense one-row array whose record has
exactly the three own data properties above, no accessors, no proxy, no extra or
missing keys, the exact expected key, and primitive integer flags equal to zero
or one. Zero rows means `MISSING`; more than one row, a partial result, a result
budget failure, a malformed flag/key or any non-own shape means `INVALID` or
`UNAVAILABLE` as produced by the existing read owner. None authorizes a new
identity.

The canonical classifications are:

| `immutable_match` | `initial_match` | Meaning and next owner |
| ---: | ---: | --- |
| 1 | 1 | `EXACT_INITIAL`: the original row and ID are durable; the existing once-only result/acceptance path may report BEGIN success. |
| 1 | 0 | `SAME_CREATION_ADVANCED`: BEGIN records monotonic advanced knowledge and asks the existing recovery owner to reread and accept the current row. No mutable participant or decision bytes enter the BEGIN record. |
| 0 | 0 | `FOREIGN_IDENTITY`: this may authorize reminting only when the original INSERT outcome also carries the existing producer-specific primary-key-collision disposition. Otherwise the attempt remains uncertain. |
| 0 | 1 | `INVALID`: an impossible or fabricated response; retain the exact attempt and refuse. |

`MISSING`, `UNAVAILABLE` and `INVALID` retain the same ID, record slot, envelope,
consumer disposition and existing sweep wake. A generic constraint error,
timeout, transport error, null, missing row or arbitrary mismatch never proves
a primary-key collision. A definitive PK collision without a complete fixed
classification also does not remint.

### SQL equality is the existing JavaScript contract

The statement does not rely on SQLite affinity or caller collation to emulate
JavaScript equality:

- Every expected text column is required to have `typeof(column) = 'text'` and
  compares `CAST(column AS BLOB)` with the UTF-8 bytes of the already validated
  text parameter. This covers `transaction_id`, `session_id`, all status/mode
  fields and the initial `participant_set_text = '[]'` without case folding or
  numeric coercion.
- Every expected numeric column is required to have
  `typeof(column) = 'integer'` and compares with an already validated safe,
  nonnegative integer parameter. The producer has already rejected `-0`,
  fractions, unsafe integers, `NaN` and infinities before INSERT.
- The three initial decision columns use `IS NULL`; text `'null'`, numeric zero
  and missing columns cannot match.
- `initial_match` includes the exact six immutable predicates and every mutable
  initial predicate. The consumer also requires `initial_match <=
  immutable_match`, so a shape-compatible fabricated answer cannot weaken the
  relationship.
- The lookup uses the table's actual primary-key equality to find the row, while
  `immutable_match` separately includes byte-exact `transaction_id`. An
  unexpected collation-equivalent but byte-different row is foreign evidence,
  and still requires the producer-specific PK disposition before reminting.

The generated `sql_transactions` schema declares the key and text columns as
TEXT and epoch/deadline/time/count columns as INTEGER. An implementation witness
executes the statement against the real generated SQLite schema and mutates
type, case, text/blob, null and numeric representations. Hand-built flags are
not classification proof.

### Bounded production allocation and delivery

This interaction adds no configurable logical participant limit and raises no
global limit. The classification result has a source-computed constant maximum:
one 64-byte key, two integer flags, the fixed three property names and the
canonical JSON/result framing used by the query-result budget. The implementation
computes this maximum from the canonical result shape rather than a magic
sample.

The existing gateway query-options owner is expanded only to transport the
already validated per-read `RESULT_MAX_ROWS = 1` and this fixed
`RESULT_MAX_BYTES` from the classification caller. The path is:

```text
SQLQueryEngine creation persistence owner
  -> ControlPlaneSystemTableGateway.readAuthoritativeRows
  -> buildGatewayQueryOptions
  -> CDC authoritative owner RPC or SQL fallback queryOptions
  -> QueryExecutor / partition request resultMaxRows + resultMaxBytes
  -> collectBoundedSqliteRows before accepting a result row
```

The SQLite statement itself emits only fixed columns, so the row object decoded
before `collectBoundedSqliteRows` checks its JSON length is also fixed-size; it
cannot contain a session, participant manifest, decision text or other variable
stored column. Owner-RPC, local-owner and SQL fallback routes consume the same
query options. Any route that cannot carry and enforce both bounds returns typed
`UNAVAILABLE`; it cannot return an unbounded substitute row.

The creation operation token continues to pay for its FIFO promise and caller
attachment. The role-neutral record envelope pays only for the creation record,
initial bytes/key and result entitlement representations that it actually
retains. The query execution owner pays the fixed classification row until the
await returns. The persistence owner validates and reduces it to one enum in
the same turn, clears the row/result reference, and only then releases the query
result lifetime. Failure clears the fixed result and operation-local references;
it never releases the role-neutral record or a live unclaimed result. The
implementation recomputes the round-seven phase census against this new
representation; it does not keep or claim an obsolete full-row/descriptor
scratch merely to make a test green.

### Existing recovery owns advanced mutable bytes after classification

`SAME_CREATION_ADVANCED` carries no participant manifest, decision text or
status projection. It sets the same record's monotonic advanced marker and
invokes the existing `retainAdvancedTransactionReadback` interaction with the
exact attempted identity and current control-turn budget. That interaction's
existing path is:

```text
readDistributedTransactionRecoveryState
  -> authoritative transaction read before
  -> authoritative participant rows
  -> authoritative transaction read after
  -> exact recovery-row fence
  -> transactionRecoveryAuthorityCandidate
  -> acceptAdvancedTransactionCreation
```

The ordinary recovery owner remains responsible for validating the complete
current transaction row, retained manifest, decision and participant progress.
This amendment creates no manifest policy, cap, ledger or alternate reader.
The separate participant-manifest resource work remains responsible for its
allocation policy.

Classification is evidence that the row at its snapshot shared the exact six
immutable creation fields; it is not permission to accept a later row. Before
accepting advanced authority, recovery rereads current state and requires the
same immutable six fields against the still-retained initial descriptor. Its
existing before/participant/after fence must also remain stable. A deletion,
foreign identity, changed immutable field, missing/invalid participant page,
changed fence, unavailability or malformed decision leaves the creation record
held and emits no COMMIT or ROLLBACK. A valid later COMMIT and a manifest member
without a progress row retain the existing behavior: recovery restores that
member as unknown and redrives the recorded COMMIT without shrinking the set or
inventing PREPARE evidence.

The creation slot/envelope releases under the round-seven rule only after the
ordinary recovery or terminal owner has exact-object accepted the debt and no
live client result remains. Advanced classification alone releases nothing.
Disconnect and caller deadline expiry retire only the attachment/consumer
entitlement described earlier; they do not erase the identity or advanced
obligation.

### Corrected phase census

| Phase | Variable bytes owned by BEGIN | Fixed classification bytes | Release / transfer |
| --- | --- | --- | --- |
| Before INSERT | Exact six fields, fixed 15-field initial encoding, delivery key, record/operation/attachment and prepaid result state. | None. | Pressure refuses before row/key/DWC/gateway allocation as already specified. |
| INSERT awaiting answer | Same record and exact initial mutation/key. | None. | Caller detachment releases only its attachment; record remains. |
| Classification query executing | BEGIN retains only its existing record and key; stored session/manifest/decision values are not selected. | One bounded three-field row under row=1 and exact byte cap, owned by query execution. | Invalid/unavailable clears query-local result only and retains creation debt. |
| Exact initial result | Same record becomes resolved/claimable; no second row or ID. | Fixed row reduced to enum, then dropped. | Record releases only after protocol/application acceptance. |
| Same-creation advanced result | Same immutable initial descriptor and monotonic advanced marker; no mutable stored bytes. | Fixed row reduced to enum, then dropped. | Existing recovery owner rereads/validates current complete authority; advanced classification itself releases nothing. |
| Foreign result | Same attempted descriptor remains until collision classification completes. | Fixed row reduced to enum, then dropped. | Remint only for the existing PK-specific collision plus complete `FOREIGN_IDENTITY`; otherwise retain. |
| Recovery accepted | Live result/disposition remains if its consumer is live. | None. | Ordinary recovery/terminal owner receives current complete state; creation charge releases only under the existing no-live-result rule. |

### Decisive implementation witnesses

The next source packet must preserve all earlier cumulative controls and add
production-faithful witnesses for this amendment:

1. Real generated SQLite schema, real gateway and query execution: a lost INSERT
   of the exact initial row returns one bounded classification result, the same
   ID succeeds, the query reports row/byte budget enforcement and the creation
   charge releases only after acceptance.
2. Maximum UTF-8 session and every fixed initial field: source-derived phase
   census covers creation representations and the fixed result independently;
   pressure below either owner bound refuses before the corresponding
   allocation. Default 1 MiB and all global limits remain unchanged.
3. Foreign same-ID rows with very large mutable text: the classification result
   remains fixed-size and materializes none of that text under BEGIN. PK-specific
   collision remints; generic constraint/timeout/missing/null/malformed evidence
   retains the original attempt and never remints.
4. Same-immutable advanced rows with nonempty manifest, large decision text and
   a recorded COMMIT: classification returns only `SAME_CREATION_ADVANCED`;
   current recovery rereads, validates exact immutable identity and fence, then
   emits exactly one COMMIT and zero ROLLBACK. A valid manifest member without a
   progress row is retained and redriven.
5. Change/delete/conflict between classification and recovery reread: recovery
   refuses current authority, keeps the original identity/slot and emits no
   participant decision. A later stable current row releases the hold through
   the same sweep path.
6. Exact SQL-domain mutants: text versus blob, case change, integer versus real,
   `-0`/fraction/unsafe caller inputs, non-null decision fields, duplicate or
   extra result rows/keys, accessors/proxies and impossible flag pairs all
   refuse without getter execution or identity replacement. Valid initial and
   valid advanced controls remain green.
7. Retry-first, recovery-first, timer detachment, disconnect, ROLLBACK,
   application acceptance and actual pg.Client/TCP `I/T/E` controls keep the
   exact original deadlines, consumer incarnation and once-only result claim.

The resource diagnostic records separate maxima for the creation record, its
operation/attachment and the fixed query result. It records actual source
producers and lifetime overlap rather than adding unrelated pools or using a
single session sample. The complete cumulative packet reruns the earlier
30/30, 12/12, ordinary client and COMMIT/no-rollback controls on the exact new
bytes.

### Round-eight proof ceiling

This amendment is documentation only. It changes no production source, test,
metadata, Quest log, activation/C3 or C17 bytes. The preserved narrow B5 author
source remains unapproved and frozen. Implementation is held for independent
review of this exact amendment. It may change the existing creation persistence,
fixed classification result contract and the minimal gateway query-option
transport named above as one reviewed interaction. It may not add a second
transaction/manifest owner, a broad payload policy, a caller-supplied authority
flag, a new scheduler or a global limit increase.

## Round-nine producer, allocation and text-domain correction

This section supersedes only the round-eight classification result, execution
route, allocation census and text equality clauses. The accepted round-seven
creation lifecycle, collision disposition, client handoff, deadline, recovery
and release contracts remain unchanged. The rejected round-eight subject is
preserved verbatim at
`evidence/design-query-begin-uncertain-insert-resolution-round8-56b96438.md`
(SHA-256 `56b96438afe3eb83ee8bd887a517ff239279a0ecdb5526b4f68a00b1f2c6da53`).

### One bounded current-leader classification result

The creation persistence owner issues one internal classification statement
through the existing control-plane gateway. The statement executes on the
current `sql_transactions` partition leader through the existing
`OWNER_RPC_REQUIRED` read mode and required-leader witness. Local CDC row-set
merge, any-replica fallback and SQL-engine fallback are not classification
routes. Their absence is a typed `UNAVAILABLE` result consumed by the existing
creation sweep under the original absolute deadline; it does not authorize a
second reader or a replacement identity.

The fixed result has exactly these own data fields:

```text
transaction_id       exact 32-byte attempted transaction key
attempt_key           exact 64-byte creation delivery key
identity_state        INVALID | SAME | FOREIGN | INPUT_RESERVATION_REQUIRED
initial_match         integer 0 or 1
required_input_bytes  nonnegative safe integer
```

`required_input_bytes` is zero except for
`INPUT_RESERVATION_REQUIRED`. The result is one dense row or no row. More than
one row, an extra/missing/accessor property, a coerced flag, a key mismatch, an
impossible state/flag pair or an unsafe required byte count is `INVALID`. No row
is `MISSING`. A failed current-leader route is `UNAVAILABLE`. These states never
authorize reminting.

`FOREIGN` means every stored immutable creation field is independently
canonical and at least one differs from the attempted immutable six. It is
distinct from a false equality predicate. `INVALID` includes a stored BLOB in a
text field, an empty or noncanonical text identity, an invalid transaction ID,
an unknown transaction mode, a negative/fractional/unsafe epoch or timestamp,
and `timeout_deadline < created_at`. `SAME` means all six immutable fields are
canonical and byte/numeric equal. `initial_match=1` is legal only with `SAME`
and additionally requires the exact initial values for all nine mutable fields.
`SAME,0` is the existing advanced-state handoff.

Only the already existing pair of evidence permits reminting:

1. the mutation producer reports the specific primary-key collision; and
2. this authoritative classification returns complete `FOREIGN`.

A generic constraint, missing/null/malformed response, `INVALID`,
`INPUT_RESERVATION_REQUIRED`, `MISSING` or `UNAVAILABLE` retains the original
identity. A malformed durable row therefore cannot be reclassified as a valid
foreign creation merely because equality returned false.

### Metadata-first native evaluation and exact reservation upgrade

The statement is one SQLite snapshot. Its outer, ordered `CASE` branches first
inspect storage class and metadata-only byte lengths. The deployed SQLite
bytecode must show `typeof` and `octet_length(column)` metadata reads before an
ordinary `Column`/`Cast` or the private bounded predicate. The statement never
uses `length(text)` as its byte guard.

The only variable stored immutable field is `session_id`. If its metadata byte
length exceeds the classification input reservation stamped on the request,
the statement returns `INPUT_RESERVATION_REQUIRED` and that exact length without
loading, casting or decoding the value. The record remains held. On a later
turn the existing role-neutral creation resource owner atomically upgrades the
same record reservation by the checked difference. Failure to upgrade is typed
creation pressure. The existing rotating sweep cursor retries it; fresh BEGIN
admission cannot consume bytes already reserved by the record. There is no
waiter promise, new queue, scheduler or ledger. A value larger than the current
configured pool remains retained pressure with its required byte count and may
resume after the existing resource configuration is raised and the engine is
restarted. It is never classified as corruption or foreign merely for size.

After the exact upgrade, a private deterministic classification predicate may
load at most the reserved number of bytes. It receives the stored immutable
text as BLOB bytes, validates the canonical UTF-8 scalar domain below, validates
the fixed numeric and enum domains, and performs exact byte/numeric comparison.
The mutable initial-state predicates are also ordered: type and
`octet_length` must equal each fixed literal length before a BLOB comparison.
Thus an advanced multi-megabyte participant manifest or decision is never
loaded by BEGIN; `participant_set_text` with a byte length other than two
short-circuits before comparing with `[]`, and decision columns are tested only
with `IS NULL`.

The private predicate is registered by the existing partition SQLite owner on
the same database handle used by remote query execution. It has no mutation,
transaction or decision authority. Statement admission permits it only for the
owner-minted creation-classification contract, whose exact SQL, result schema,
attempt key, current-leader read authority and bounds are built by the creation
persistence owner. An ordinary SQL caller cannot select the private predicate
or mint the contract. This is a bounded query-production primitive, not a new
transaction reader or a caller-supplied authority flag.

### Explicit canonical text supersession

The round-eight claim that every JavaScript string has identical native SQLite
text equality is withdrawn. Before the first INSERT allocation, the creation
contract now requires each attempted identity text field to be a nonempty
Unicode scalar-value string: no unpaired UTF-16 surrogate is admitted. The
check captures the primitive once and scans code units without coercion. This
is an explicit producer-domain supersession; it is not inferred from a digest,
SQLite affinity or a later replacement character.

The native boundary binds the accepted scalar string as its canonical UTF-8
bytes. The private predicate receives stored text through
`CAST(column AS BLOB)`, rejects a byte sequence that a fatal UTF-8 decoder does
not accept as Unicode scalar values, then compares the original bytes exactly.
It never compares driver replacement strings. Embedded NUL, valid supplementary
characters and other valid multibyte text remain supported. The following are
distinct and both invalid: stored U+FFFD versus attempted unpaired U+D800, and
stored native bytes `ED A0 80` versus any attempted scalar string. Existing
rows outside this explicit domain are preserved and held as `INVALID`; they are
not deleted, rewritten or used to authorize reminting.

Transaction IDs remain exact lower-case 32-hex text; transaction modes remain
the existing finite enum; numbers remain nonnegative safe integers excluding
negative zero. The initial-row delivery key continues to hash the same
canonical 15-field encoding. This amendment changes no decision digest,
participant identity or delivery-key algorithm.

### Actual request, transport and result owners

The owner-RPC route uses the existing gateway, CDC authoritative-read owner,
QueryExecutor, message router and partition remote-query handler. The exact
handoff is:

```text
creation persistence owner
  -> ControlPlaneSystemTableGateway.readAuthoritativeRows
     (OWNER_RPC_REQUIRED, leader REQUIRED, explicit fixed coalescing key)
  -> CDC executeAuthoritativeOwnerRpcRead
  -> QueryExecutor.executeOnPartition
  -> message-router QUERY request to the current leader
  -> PartitionService.handleRemoteQuery on the leader-owned SQLite handle
  -> one bounded classification statement
  -> fixed result row and required-leader witness
```

The explicit coalescing key is the fixed delivery key, so gateway single-flight
identity does not serialize the variable parameter array. The frozen read
authority remains part of that key. `buildGatewayQueryOptions` carries the
validated lower-case `resultMaxRows=1`, exact fixed `resultMaxBytes`, original
timeout budget and cancellation token. QueryExecutor stamps those fields on
the QUERY request; `handleRemoteQuery` passes them to the existing query-result
collector. The owner-RPC response is consumed directly. It is not passed
through `mergeAuthoritativeSystemTableRowSets`, so a fixed classification row
cannot be discarded for lacking an ordinary table repair row. SQL fallback is
disabled for this read authority.

The result row includes `transaction_id` so its source table/key binding is
explicit, but that field does not make local CDC merge an authorized route.
The response is accepted only with the current leader witness already enforced
by the owner-RPC read contract. A late response after cancellation, deadline or
generation change cannot install classification state; the existing record and
next sweep remain the only recovery authority.

### Complete classification allocation census

The creation record preallocation is extended before FIFO admission by a
checked `classificationRequestCharge` derived from the captured immutable six
and fixed SQL/result contract. It covers the maximum simultaneously retained
request graph on the originating process:

- parameter-array and query/request object roots;
- the exact JSON-escaped byte length of the scalar session and fixed framing,
  computed by a nonallocating code-unit scan;
- the outbound serialized message string and UTF-8 frame copy;
- the expected-text native UTF-8 conversion and SQLite `SQLITE_TRANSIENT` copy;
- the fixed result object, strict own-data capture and state enum; and
- one transition scratch representation while the result is reduced.

Existing record strings referenced by the parameter array are aliases and are
not charged again as copied string bodies. JSON, frame, parsed/native strings
and SQLite transient bytes are distinct copies and are charged separately. The
message router owns its bounded frame and pending-response entry; the serving
QueryExecutor/PartitionService pressure and result owners admit one request
whose stamped input reservation and output cap were already checked. The
serving native step refuses before `Column`/`Cast` if the stored input exceeds
that reservation. It cannot silently spend the WebSocket implementation's
larger generic payload ceiling as BEGIN capacity.

The record keeps this prepaid request charge across retry-first and sweep-first
turns. One execution borrows it; overlapping execution for the same exact
record is forbidden by the existing creation state/generation check. Request
completion clears parameter, request, frame/native and result references in
that order before the prepaid portion becomes available to the next turn. A
timeout, cancellation, disconnect or late completion retires only the current
request/attachment; it does not release the record reservation or original
identity. A successful exact or advanced handoff releases the charge only under
the accepted round-seven no-live-result/owner-accepted rule.

The stored-value upgrade is separate from the known request charge. It adds the
exact stored BLOB/decoder/native scratch overlap reported by the metadata phase,
using checked arithmetic and the same role-neutral record token. On completion
the extra upgrade is dropped before the next turn; the base record/request
charge remains until the record itself may release. This staged upgrade prevents
both an unbounded native step and a full-pool deadlock caused by reserving the
global maximum for every record.

### Advanced recovery remains the current-state owner

`SAME,0` stores only the monotonic advanced marker on the same creation record.
It does not retain a manifest, decision, status projection or classification
row. The existing ordinary recovery owner performs the transaction-before,
participants, transaction-after and recovery-fence read under its separately
reviewed resource contract. It revalidates all six immutable fields against the
original descriptor and requires an unchanged fence before
`acceptAdvancedTransactionCreation`.

If the row changes from `SAME` to foreign, becomes malformed, disappears, or a
participant page is missing/unavailable/foreign, recovery holds the original
identity and emits neither COMMIT nor ROLLBACK. A stable recorded COMMIT keeps
its original prepare coordinates and redrives exactly one COMMIT, including
when a manifest member has no progress row. Classification never materializes
or shrinks that manifest.

### Round-nine decisive feasibility and implementation witnesses

The bounded packet must instantiate the exact SQL and private predicate on the
installed SQLite/better-sqlite3 build and retain its `EXPLAIN` program. It must
show all of the following on production owners rather than fixture-supplied
flags:

The design-feasibility instantiation is preserved at
`evidence/begin-round9-classification-feasibility.json` (SHA-256
`d152760498062037c344df8f14b3be297624595f2618ac28df990d3e9c6f4f88`).
Against installed SQLite 3.49.2 it records fixed 198-byte canonical result rows,
separate valid initial/foreign and malformed outcomes, fatal invalid-UTF-8
refusal, embedded-NUL and supplementary-character positives, and an 8 MiB
stored session that returns a 204-byte reservation-required row with zero
private-predicate calls under a 1024-byte input reservation. Raising that exact
reservation lets the predicate run once over the recorded 8,388,640 input
bytes. This is design feasibility only: the production registration,
statement-admission, route and aggregate-pressure owners remain implementation
obligations.

1. Valid initial, same-immutable advanced and valid foreign rows produce the
   four distinct fixed outcomes above. Negative epoch, unknown mode, BLOB text,
   invalid UTF-8 and impossible result tuples are `INVALID`; only valid foreign
   plus the real PK disposition remints.
2. An eight-megabyte stored session with a smaller stamped reservation returns
   the fixed `INPUT_RESERVATION_REQUIRED` row without invoking the private
   predicate or executing an ordinary stored-value `Column`/`Cast`. After an
   exact same-record reservation upgrade, the predicate runs once and returns a
   canonical state. Insufficient aggregate capacity retains typed pressure and
   the rotating sweep later retries after bytes release.
3. The resource trace independently derives the JSON escape length, remote
   message/frame, parsed/native binding, SQLite transient, stored BLOB/decoder,
   fixed result and transition scratch lifetimes for maximum valid UTF-8 and
   control-heavy strings. It proves no allocation precedes its matching
   reservation and no alias is charged as a copied body.
4. The real current-leader owner-RPC path carries the original deadline,
   cancellation and lower-case result caps, returns the fixed row without CDC
   merge, and refuses local/follower/fallback results. Transport unavailable
   then available releases the hold through the existing sweep.
5. U+FFFD, unpaired UTF-16, invalid stored UTF-8, embedded NUL, supplementary
   characters, text/BLOB, integer/real and case mutants establish the explicit
   domain. Valid NUL and multibyte strings remain positive controls.
6. A large advanced manifest and recorded COMMIT never enter the classification
   result. Recovery rereads and fences them through the existing owner, retains
   a missing progress member, emits one COMMIT and zero ROLLBACK, and refuses a
   row changed between classification and recovery.
7. All earlier retry/sweep, exact-key/no-remint, pressure, disconnect,
   shutdown, ApplicationDatabase acceptance and real pg.Client `I/T/E`
   controls run on the same bytes. The evidence reports component scope while
   normal startup remains independently gated.

### Round-nine proof ceiling

This is a documentation and feasibility correction only. Production source,
tests, metadata, Quest log, activation/C3 and C17 remain held. The narrow B5
source/test correction remains separately frozen and unapproved. Implementation
requires author-distinct approval of this exact supplement and then a combined
review of every touched prior-BEGIN, gateway, CDC, query transport, partition
SQLite and statement-admission path. It may not introduce a second durable
creation owner, a participant-manifest policy, a broad payload protocol, a new
scheduler/ledger, a raw database escape or a global limit increase.
