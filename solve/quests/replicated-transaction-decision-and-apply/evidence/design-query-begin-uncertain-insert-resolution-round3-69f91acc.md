# BEGIN uncertain insert resolution proposal

Status: round-three proposed for independent owner review. No source or
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
