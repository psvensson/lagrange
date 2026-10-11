# BEGIN uncertain insert resolution proposal

Status: round-four proposed for independent owner review. No source or
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
