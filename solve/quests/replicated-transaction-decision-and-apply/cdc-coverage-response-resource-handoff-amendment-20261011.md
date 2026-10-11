# C17 coverage response resource handoff amendment

Status: proposed owner-interaction amendment for independent review before any
transport, page-v2, waiter, or cache source change. It replaces the prior
amendment only. The exact prior bytes are retained at:

`test-output/continuation-20261011/cdc-coverage-response-resource-handoff-amendment-864abf590b82dbc302cfc721c3c26ed0aa1853048bb4fdf0ff529eb72d262207.md`

That retained file has SHA256
`864abf590b82dbc302cfc721c3c26ed0aa1853048bb4fdf0ff529eb72d262207`.
The immediately preceding amendment is retained separately at:

`test-output/continuation-20261011/cdc-coverage-response-resource-handoff-amendment-12824e5047e8000b6eb85aa27c58c557b2683043ea7345d8da837d1d118ab17c.md`

It has SHA256
`12824e5047e8000b6eb85aa27c58c557b2683043ea7345d8da837d1d118ab17c`.
The complete review requiring this revision is
`review-cdc-c17-resource-handoff-round2-checkpoint.md`, SHA256
`22c52c6222b08fd1787ce649967e51973b6135fe44491bf1d7159642695e949d`.
The earlier review remains
`review-cdc-c17-nontransport-and-resource-amendment-marker.md`, SHA256
`c4d9d172dd9d69aa87198d29f1ffe1abb61ceb16f9f92fbb3f18020d2a32ecce`.
The exact nontransport source subject
`d23a0746bf5ee6c9b659d43abe27630d86d38397` remains SOURCE REJECT for
N1. R3-4, R3-5, R3-6 and R3-7 remain supported at that bounded component
scope. R3-1 and R3-2 remain source dependencies.

This amendment supplements only C17 caller coalescing and retained-byte transfer
mechanics in `cdc-continuation-20261011.md`. It does not approve source,
increase a global limit, reuse snapshot transport, add a ledger or scheduler,
or establish normal startup, durable CDC event delivery, original-event
redelivery, lost ACK recovery, transaction activation, snapshot recovery, or
whole-C17 completion.

## Existing owners and the one interaction

The existing owners remain authoritative:

- `cdc-coverage-reconcile-owner.js` owns durable-in-memory table debt, one
  active table generation, bounded retries, cooldown and event wakes.
- `cdc-integration-service-authoritative-catchup.js` owns one captured outer
  deadline across the requested table sequence.
- `CdcCoverageTransferOwner` owns node-local transfer capacity, session count,
  retained byte charges, TTL, diagnostics and capacity-release wakes.
- the partition coverage handler owns authoritative source capture and source
  lifecycle checks.
- the fragment consumer owns recipient decode and its lifecycle binding.
- `SystemTableCache` owns staged mutation, the synchronous visibility swap,
  listener payload construction and queued cache notification.
- `MessageRouter` owns remote wrapping, serialization, WebSocket queueing,
  send completion, socket close and router shutdown.

The interaction answers one question: when a caller joins shared recovery and
when coverage bytes cross source, router, recipient and cache boundaries, which
existing owner retains each reference and charge until its actual last use?

No caller deadline, transfer TTL, CANCEL message, transport ACK, handler return,
cache swap, or listener scheduling is a substitute for another owner's release.

## Three independent lifetimes

### Caller waiter

Every call to `armCdcCoverageReconcile` gets a small owner-minted waiter record
before it may attach to an existing or new debt:

`{waiterId, debtKey, deadlineMs, lifecycleToken, cancelled, resolve, timer, abortUnregister, state}`.

The reconcile owner validates and captures the caller's absolute deadline once.
The catchup owner checks that same deadline before every table. If a prior table
spent the budget, the next table returns the typed caller-spent outcome without
joining an already-running generation.

A debt holds a bounded `Map<waiterId, waiter>`. The proposed narrow bound is an
owner constant, `MAX_WAITERS_PER_DEBT`; it must be fixed and tested before
source adoption. Admission at the bound returns
`cdc_coverage_caller_waiter_capacity` with `deferRetry: true` immediately
and retains no waiter, callback, request or execute closure.

Every waiter terminal path uses one synchronous
`settleCdcCoverageCallerWaiter(debt, expectedWaiter, proposedOutcome)`
operation. Before deleting or clearing anything it captures the current clock
and reads the exact waiter's own cancellation flag, captured deadline,
lifecycle token, pending state and map identity. It classifies in this order:

1. mismatched/non-pending waiter: no effect;
2. cancelled waiter: CANCELLED;
3. stale owner/lifecycle: RETIRED;
4. `now >= waiter.deadlineMs`: SPENT under that caller's original bound;
5. otherwise: the proposed COMPLETE, FAILED, SPENT or RETIRED outcome.

Only then does it delete the exact waiter, clear its timer and abort listener,
null its resolve, request, signal and caller reference fields, and resolve once.
Timer, cancel, generation success/failure and shutdown all call this same
operation. Generation completion cannot report COMPLETE merely because a
delayed waiter timer has not run.

This operation does not retire the debt or generation, invoke source CANCEL,
release any source, recipient, router or notification charge, shorten the
generation deadline, retract an installed fact, or settle another waiter. There
is no per-join `.then` attached to the long `debt.inFlight`; therefore an
expired joiner leaves no closure retained by that promise.

### Shared table attempt

A generation captures one admitted execute closure and its own absolute
generation deadline when `startGeneration` begins. A later joiner never
replaces `debt.execute` for the running generation and never changes that
deadline. The attempt retains only its generation context and source work.

Generation completion calls the synchronous waiter settlement operation for
each still-registered exact waiter. Each caller is classified against its own
deadline/cancellation/lifecycle at that instant; pending map membership is
insufficient. A delayed timer therefore cannot turn an expired caller COMPLETE.
Waiters already removed cannot be renewed or reattached. The shared COMPLETE
result still reaches a current longer caller, and the installed cache fact is
unchanged by the shorter caller's SPENT result.

SPENT or retryable failure leaves the existing debt owed and uses the existing
cooldown and event wake. A valid longer caller does not grant an expired
generation extra time. A later generation is a new bounded attempt under the
existing debt owner. An installed cache fact produced while the shared
generation and `canPublish` fence were current remains installed even if one
caller stopped waiting.

Shutdown retires the owner, settles and clears all caller waiters, retires the
generation, and retains the durable reconciliation obligation for production
reconstruction. It does not declare externally held byte copies released.

### Byte custody

The source root, pre-adoption pair claim, adopted recipient claim, transport
handoff, installed cache state and queued notification are separate custody
states. Each may release only the references it currently owns. Semantic
expiry prevents new work; it never makes a reference held by another owner
free.

## Required joined-caller schedules

The source correction must prove these exact schedules with the real catchup and
reconcile owners.

1. **Short joiner, continuing caller.** Start a long table generation, then
   attach a caller whose deadline is earlier. At the short deadline its waiter,
   timer, abort registration, request and execute references are absent. The
   generation and long waiter remain. One authoritative read remains in flight.
   The long caller later receives the legitimate result.
2. **Both default invocation ordering.** At t=1000 start the default
   `[NODES, SERVICES]` catchup and hold NODES. At t=1050 start default
   `[SERVICES]` and hold SERVICES. At t=31000 the first call finishes NODES
   after its outer deadline and must not attach to the second call's running
   SERVICES generation. The second caller and generation continue to their
   independently captured t=31050 bound.
3. **Delayed timer versus synchronous completion.** A long caller/generation
   remains valid to t=2000 and a short joiner to t=1050. Synchronous decode and
   cache staging run from t=1040 to t=1060 while the short timer is queued.
   Generation completion at t=1060 must synchronously classify the short waiter
   SPENT and the long waiter COMPLETE. The legitimate installed fact remains.
4. **Cancellation before attachment.** A signal already cancelled, or cancelled
   while waiter admission is being decided, leaves no waiter and never starts or
   joins a generation.
5. **Cancellation after attachment.** Removing the exact caller waiter leaves
   the shared attempt and all other waiters unchanged. Completion does not call
   the cancelled caller later.
6. **Bounded admission.** Filling `MAX_WAITERS_PER_DEBT` makes the next caller
   fail typed and immediately without an extra timer, abort callback, execute
   closure or promise reaction. Releasing one waiter wakes no generation by
   itself and allows a later ordinary caller to register.

This waiter clause is an independently reviewable current-owner correction. It
does not depend on page-v2, router handoff or the resource-credit contract below,
and its approval would not approve those transport changes.

## Binary page and full response preflight

Raw rows and BINARY cursors do not occur in PAGE, OFFER or CHUNK JSON fields.
One canonical `cdc-coverage-page-v2` binary payload contains the lower cursor,
exclusive next cursor or final marker, applied index text, ordered tagged rows
and immutable observation fields. Variable TEXT is length-prefixed UTF-8.
Applied index remains canonical bounded decimal text.

The source session owns the raw cursor and ordinal. Requests carry a bounded
opaque transfer ID, ordinal and prior digest, not the cursor. No SQLite
transaction crosses a network await. Session loss recaptures from the durable
source under a new transfer ID. Coverage idempotency handles an already
installed page.

Every response shape, including OFFER, CHUNK, CANCELLED, REFUSED, duplicate and
error, passes a coverage-specific preflight before construction. The preflight
captures own primitive fields once, rejects accessors/exotics, and computes with
checked safe-integer arithmetic:

- exact JSON escaped UTF-8 bytes and serialized UTF-16 code units for every
  bounded identity, binding, digest, reason and error field;
- base64 characters `4 * ceil(chunkBytes / 3)`;
- fixed JSON keys, punctuation, booleans and bounded decimal digits;
- the actual outer `SERVICE_RESPONSE` fields added by
  `message-router-inbound-dispatch.js`: type, messageId, sourceAddress and
  result or error;
- the result object graph's byte-bearing strings;
- serialized JavaScript string storage;
- UTF-8 WebSocket frame bytes and the conservatively counted library/socket
  frame copy.

The scanner follows JSON string escaping exactly without constructing an
escaped string. Binding strings, transfer ID, messageId and sourceAddress have
explicit positive UTF-8 and escaped-output maxima at admission. The page-v2
codec and router adapter consume those same captured values. A final actual
serialized-length comparison is only an invariant check after reservation; it
is not admission.

Let the raw measured values be:

- `R`: probed SQLite row-prefix and cursor bytes;
- `P`: exact binary page bytes including its frames;
- `Q`: raw chunk bytes;
- `B = 4 * ceil(Q / 3)`: base64 characters;
- `G`: byte-bearing result graph storage from captured fields and B;
- `J8`: exact serialized envelope UTF-8 bytes;
- `J16`: twice its exact serialized UTF-16 code-unit count;
- `F`: conservative WebSocket frame plus socket/library copy bound;
- `M`: fixed object/map metadata charged by the transfer owner;
- `A`: recipient response input, chunk assembly, concatenated page and decoded
  typed-row bytes;
- `Dsrc`, `Drecv`, `Dcache`: fixed-size incremental canonical-digest
  encoder/hash scratch and bounded digest metadata at the named owner;
- `Kstage`: cache candidate maps, cover/suffix/tombstone/revision structures
  and publication array;
- `Knotify`: cloned notification records and queued completion-token metadata.

The four capacity accounts below are disjoint:

- `S = source raw/materialized representations + P + Dsrc + source metadata`;
- `H = G + J16 + J8 + F + transport-handoff metadata`;
- `C = recipient input/chunks + A + Drecv + recipient metadata`;
- `K = Kstage + Knotify + Dcache`.

S never includes H. C never includes K. A byte or count credit appears in
exactly one account. A custody transfer moves an already owned credit between
owners; it does not add the same credit again. The source and consumer formulas
must use measured codec constants and checked sums, not the old ASCII-only
acceptance numbers. The prior 8 MiB figures remain a control and must be
remeasured for the complete page-v2 aggregate before an affordability claim.

`CdcCoverageTransferOwner` refuses before response object/base64/serialization
allocation unless the session already owns H and one pending-data-handoff slot.
Small replies use separately bounded small-reply bytes/count slots in the same
pool. Each source session owns at most one data-handoff slot. No phase may
reinterpret unused S bytes as H or unused C bytes as K.

If even the bounded response cannot reserve its token, the handler throws the
private local `CoverageResponseCapacityDeferred` sentinel before constructing
a result. The coverage-aware router adapter suppresses response construction.
The already bounded requesting side reaches its existing message deadline and
classifies that absence as DEFERRED/capacity, retaining debt. The generic router
does not serialize the sentinel or manufacture an interpolated error. Hard
identity/codec failures use a separately preflighted bounded FAILED response;
they never include the offending variable input.

## Atomic reservation and completing-winner rule

### One debit and credit table

The following table is the only capacity accounting interpretation. “Debit”
means unavailable to every other root while the credit is owned. “Transfer”
changes custody without changing the pool total.

| Transition | S root bytes/count | H response bytes/count | C recipient bytes/count | K publication bytes/count |
| --- | --- | --- | --- | --- |
| remote source admission | debit exact S and maximum one-response H plus one source-session and one data-handoff slot before row materialization | owned unused by source session | none | none |
| remote recipient adoption | unchanged | unchanged | debit exact C and one recipient-session slot before accepting OFFER | debit safe K from current cache revision, offered page byte/row bounds and worst-case changed-row/listener counts before decoding |
| colocated admission | atomically debit S + H + C + K and all four count credits before row materialization | owned unused | owned by pre-adoption pair | owned by pre-adoption pair |
| OFFER or CHUNK send | unchanged | transfer the preowned H credit to exact router send custody; no incremental debit | unchanged | unchanged |
| send terminal, live root | unchanged | return H credit to that same root for the next ordinal | unchanged | unchanged |
| send terminal, retiring root | release S after its last source reference, and release its session slot | release H and data-handoff slot | unchanged | unchanged |
| pair adoption | source keeps S/H; no byte/count change | no change | transfer C custody to exact recipient | transfer K custody to exact recipient |
| synchronous cache admission | unchanged | unchanged | unchanged | compute exact Kactual against the current cache revision before any candidate allocation; require Kactual <= preowned K, then consume Kstage and Knotify subcredits |
| successful swap | unchanged | unchanged | release C after its input/assembly/decoded duplicates are dropped | release Kstage; transfer exact Knotify subcredits to cache queue tokens |
| queued notification terminal | unchanged | unchanged | unchanged | release that exact Knotify token |
| pre-adoption refusal | release S and source count when no H remains | drain/release any exact H | release C | release K |
| post-adoption failure | source follows its own cancel/drain path | external H remains until send terminal | recipient drops actual refs, then releases C | release unallocated/staged K; externally queued Knotify remains until its own terminal |
| shutdown | no new debit; drain each exact owner | router terminally releases each send | recipient drops its refs before release | queued closure/drop hook releases each token |

For remote operation, source admission owns all S+H needed to capture and emit
one bounded ordinal; it never waits for more source-pool bytes. The OFFER carries
bounded page bytes/row count so the recipient computes a safe K against its
current cache by treating every offered row as changed and every listener as
requiring a notification record. Recipient admission owns all C+K needed to
decode and publish if that cache revision remains current. A recipient refusal
returns typed capacity DEFERRED; the source retires its complete S+H unit, and
the same durable debt retries through the existing owner.

For colocated operation, one atomic S+H+C+K admission is sufficient for the
measured unit. There is no later first-time H reservation, so admitted S roots
cannot strand one another before a response. K is an upper bound, not a byte
alias: unused K remains unavailable to competing roots until swap/failure.

The pair remains monotonic:

`PAIR_RESERVED -> ADOPTED -> RETIRING -> RELEASED`.

Before ADOPTED, exact CANCEL, TTL, shutdown or binding refusal may CAS the pair
to RELEASED and release all still-internal credits. Adoption transfers C and K
to the recipient. After ADOPTED, source cancel/TTL/shutdown affects only S/H;
the recipient releases C/K only after dropping or transferring its actual
references. A race has one CAS winner. A late source callback or old recipient
can never release a successor claim.

### Cache growth after the initial probe

K is computed for recipient admission from the current cache revision and
worst-case offered page/listener bounds, then the exact K requirement is
measured synchronously against the latest cache revision immediately before
staging. If Kactual <= K, staging consumes only Kactual in that same turn and
the unused credit stays held until swap/failure. If cache growth makes Kactual
exceed K, no final map, tombstone clone, digest input, publication array or
notification record is allocated.

Denied growth retires that bounded unit precisely:

1. mark the exact recipient claim RETIRING;
2. discard its partial chunks, concatenated page and decoded row, then release C;
3. release unused K;
4. send exact source CANCEL; S retires after any external H drains;
5. leave the reconcile debt owed and register its existing capacity wake;
6. mark this debt as the pool's one `completionClaimant`.

A completionClaimant is a volatile exact debt/generation/binding marker inside
each existing node pool, not a ledger or scheduler. While it is live, that pool
refuses new coverage root admissions from other debts. The existing reconcile
owner is woken by C/K/S/H release and is the only owner that starts the next
attempt. On a remote refusal, the recipient pool marks that debt as claimant and
the source releases its self-sufficient S+H unit; if later source admission is
also contended, the source pool marks the same exact debt as its local claimant.
No pool holds a partial unit waiting for a credit from the other pool.

The claimant re-probes and reserves S+H at the source and C+K at the
recipient, or atomically S+H+C+K when colocated. Each local marker clears on
its successful complete-unit admission, attempt deadline, lifecycle replacement
or shutdown. This rule chooses a completing hydration winner within every
contended pool using existing release wakes. Ordinary CDC cache mutations remain
authoritative and can still make a bounded attempt defer again. No claim of an
executed runtime deadlock or progress under an indefinitely mutating table is
made.

If cancel and adoption race, cancellation before adoption releases the pair.
Cancellation after adoption prevents new source work but cannot release
recipient C/K. A cancel after decode retains C/K until candidate disposal. A
cancel after publication never rolls back the cache and cannot release queued
Knotify custody.

## Per-ordinal transport custody and continuation

A source session has exactly one `responseCustody` cell:

`EMPTY | HELD(transferId, ordinal, token, sendIdentity)`.

Before subarray, base64 conversion or response construction, the source changes
EMPTY to HELD and transfers its preowned H credit into a
`ServiceResponseResourceHandoff`. The local-only handoff contains the ordinary
wire result, captured envelope measurement and opaque idempotent release token.
It carries no semantic or delivery authority.

MessageRouter unwraps it, constructs the measured envelope, serializes under the
live token, and registers exact socket/send identity before `ws.send`. Only the
send callback, synchronous throw, exact socket close or router shutdown releases
transport custody. Exact release returns H and the data-handoff slot to a live
root, or frees them and then S when the root is retiring. Handler return,
transport ACK and recipient settlement are insufficient.

Receipt of chunk N does not clear source HELD(N). If the recipient requests
N+1 or duplicates N before the callback, the source returns the bounded typed
result:

`HELD_ORDINAL_DEFERRED(transferId, heldOrdinal, requestedOrdinal, retryAfterMs)`.

It creates no second data token or base64. Its binding, transfer and ordinals
must match the current session; otherwise the result is SESSION_MISSING or hard
identity failure, which follows the ordinary recapture path.

The actual fragment consumer treats HELD_ORDINAL_DEFERRED as continuation,
not transfer failure:

1. retain the exact consumer session, adopted C/K credit, validated OFFER,
   partial chunk array and next requested ordinal;
2. do not call source CANCEL and do not release the consumer in `finally`;
3. ask the existing reconcile attempt context to wait for the smaller of the
   bounded retryAfter and remaining original generation time;
4. the context uses the reconcile owner's existing injected-clock backoff and
   capacity wake, with no second timer owner or recovery loop;
5. recheck transfer binding, recipient lifecycle, exact consumer session and
   original generation deadline;
6. request the same ordinal again. Only a successful chunk increments ordinal.

A source-side pool wake can reach a colocated attempt directly. Across nodes the
bounded existing retry timer provides the receiving-side reentry; source
diagnostics are not treated as a remote wake. The caller deadline is not
renewed, the shared attempt deadline is not extended, and partial chunks remain
charged in C throughout. If the attempt expires, lifecycle changes, the session
is missing, or the source returns contradictory identity, the consumer drops
its actual references, releases C/K as applicable, sends best-effort exact
CANCEL and returns the existing typed outcome so durable debt can recapture.

The mandatory positive schedule withholds callback N until after the recipient
has received N and requested N+1. The held result keeps the same transfer alive;
the existing attempt wait resumes N+1 after callback N releases H. Repeat for
every ordinal and complete the multi-chunk transfer within the original attempt
deadline. Separate controls cover callback never released, TTL, caller cancel,
generation expiry and shutdown.

The local router path uses the same custody transition. It releases H only after
transferring the response value to the caller; adopted C already charges the
caller-held input.

## Cache comparison, publication and notification custody

`changesBetween` stops serializing rows. Its cache-owned comparator is:

1. if previous and final are the same object, unchanged;
2. otherwise validate both as canonical rows for the captured live domain;
3. compare the bounded schema column list in order using direct primitive
   equality consistent with the admitted SQLite codec: null, TEXT, INTEGER and
   REAL;
4. reject rather than compare a row with a missing/extra column, unsupported
   type or noncanonical numeric value.

The domain validator already owns the schema/column set. TEXT comparison does
not allocate an escaped copy, so an unchanged NUL-valued row outside the
incoming cell takes the identity fast path and allocates no proportional
string. Changed NUL data is charged as raw UTF-8 and typed-row storage, never
as two `JSON.stringify` escape strings. Same-N semantic digest conflict and
suffix retention remain separate existing checks.

Before cache staging, the cache owner measures the fresh exact K requirement
over the current revision, table entries, cover/suffix atoms, tombstones,
expected changes, digest scratch and listener count. It compares that amount to
the recipient's already debited K credit before cloning final maps, tombstones,
emission rows or metadata. A fit consumes the Kstage/Knotify subcredits in the
same synchronous turn. A denied growth performs the exact completing-claimant
cleanup above and returns DEFERRED before any candidate allocation.

During publication the simultaneously live cache objects are counted as:

- one previous table map referencing existing rows;
- one final candidate map referencing unchanged rows and admitted replacement
  row objects;
- one staged coverage/suffix state;
- one tombstone clone and key-revision map;
- one publication array;
- one cloned notification record per changed row, shared by synchronous apply
  listeners and the deferred listener closure;
- the adopted recipient's decoded row and assembly until installation returns.

The synchronous `canPublish` fence checks the still-current shared generation,
lifecycle and generation deadline immediately before swap. The swap transfers
the final map and staged coverage/tombstone/revision state to
`SystemTableCache`. A later caller timeout cannot retract it.

For each publication, the cache transfers the notification-record portion of K
to a cache-owned, once-only completion token before it calls
`scheduleCacheChangeNotification`. The scheduled closure holds that token and
the one cloned record. Its `finally` releases both after all deferred listeners
return or throw. If scheduling throws, the cache releases the token immediately,
logs the existing publication failure and retains the installed fact. If cache
shutdown drops queued work, the scheduler's drop hook releases the exact token.
A late closure compares its token identity only; it cannot release a newer
notification, suffix or recipient claim.

The adopted consumer releases assembly, payload, decoded-row and staging
charges only after installation returns and all ownership transfers above have
completed. It does not count listener scheduling as release. The persistent
installed map is ordinary cache-owned state after swap; the transfer pool
charge covers only transient duplicate/staging and queued notification copies.
No callback rolls back or reclassifies installed coverage.

## Byte-identical canonical digest encoding

Page-v2 changes wire row framing only. It does not change the sealed semantic
digest bytes. Source and recipient/cache continue to compute exactly the
current `digest({key,row})`, coverage-cell and observation objects with sorted
own string keys, dense array order, current scalar spelling and the
`sha256:` prefix.

The digest owner adds a bounded incremental mode to the existing
`canonical-json-data.js` serializer. It uses the same pinned admission
predicates, key sort, number spelling and JSON string escaping as
`serializeJsonData(..., {sortKeys:true})`, but feeds bounded chunks directly
to one SHA-256 state. String escaping is scanned and emitted into a fixed-size
scratch buffer; a NUL emits the same six canonical bytes without constructing a
six-times expanded whole string. Object keys, row-digest result strings and the
bounded observation row-digest array remain explicit metadata charged to Dsrc
or Dcache. The complete canonical serialization string is never retained.

The incremental encoder is accepted only with byte-for-byte and digest equality
against the existing serializer across current sourceScope, cell, row and
observation shapes, including empty/Unicode/NUL strings, key ordering, numeric
edges admitted by the existing codec and maximum page row count. Source page
capture charges Dsrc before row/cell/observation hashing. Recipient verification
charges Drecv for wire/page digest work and K includes Dcache before canonical
row/cell/observation verification. If the required scratch/metadata credit does
not fit, the owner refuses before encoding.

This is an allocation change under the canonical digest owner, not a digest
version transition. Same-N replay/conflict, coverage cell IDs, source/recipient
observation equality, cursor/absence authority and suffix UPSERT/DELETE
semantics retain their current digest values. Any future change to those bytes
would require a separate explicit versioned compatibility contract.

## Complete allocation and release timeline

The following list is the required single timeline. “Count” means distinct
simultaneously retained byte-bearing object graphs, with fixed metadata M also
charged. Aliases and Buffer subarrays do not count as freed objects while their
root remains live.

| Phase | Simultaneously retained byte-bearing objects | Debit and permitted release |
| --- | --- | --- |
| 0 caller admission | one waiter record, timer and at most one abort registration per admitted caller | caller map bound; exact synchronous settlement only |
| 1 probe | bounded SQLite scalar probe plus fixed counters; no user row/page/base64 | fixed probe allowance ends after checked sizing |
| 2 complete credit | remote source owns disjoint S+H; remote recipient later owns disjoint C+K; colocated pair atomically owns S+H+C+K; exact session/handoff/publication counts are preowned | pre-adoption refusal may release internal credits; no term borrows another |
| 3 source capture | at most two raw row/cursor representations and one P under S; one fixed Dsrc scratch and bounded digest metadata; H remains unused | source retirement only after no external H |
| 4 OFFER | phase 3 plus one G, J16, J8 and F transferred within H; exactly one data-handoff slot | actual callback/throw/close/shutdown returns H or drains retiring S |
| 5 adoption | source retains S+H; recipient owns C+K and one bounded OFFER/input graph | pre-adoption CAS may release pair; post-adoption owners release separately |
| 6 CHUNK N send | source S/P plus one Q view, B, G, J16, J8 and F within the one H credit | exact transport terminal only; receipt/ACK/handler return insufficient |
| 7 recipient N and held continuation | source may still hold H(N); recipient holds one input B, one decoded Q, partial chunk array and continuation metadata within C; K remains unused | successful copy may drop input B/Q; HELD keeps partial C and retries same ordinal |
| 8 assembly/decode/digest | source S/P; recipient chunk array, one concatenated P, one typed row A and one fixed Drecv scratch under C; K unused | exact recipient failure drops C; source CANCEL drains S/H independently |
| 9 fresh cache preflight | same C objects plus current exact Kactual calculation; no candidate maps yet | Kactual <= K consumes preowned K in same turn; denied growth drops C/K, retires S/H and records one completionClaimant |
| 10 cache staging | previous map, final map, cover/suffix state, tombstone clone, revision map, publication array, Dcache scratch and notification clones within K, plus recipient P/A in C | failed stage drops exact candidates; successful swap releases Kstage and transfers Knotify tokens |
| 11 queued notification | installed ordinary cache state plus one cloned record and completion token per queued publication in Knotify; C duplicates gone | queued closure finally, schedule failure or shutdown drop hook |
| 12 retired source | any external H remains; S cannot be reused and no new ordinal starts | last exact send terminal releases H then S |
| 13 completion | no caller/source/recipient/handoff/notification transient refs; installed cache fact and durable debt remain | ordinary cache/reconcile lifecycle only |

At every phase the node-local debit is exactly the union of the applicable
disjoint accounts. The maximum is `S + H + C + K`; H is not a slice counted
inside S, and K is not included in C. Transfer changes custody but not the
total. A term is subtracted only after its last owner releases it. The
implementation must measure codec/runtime constants and show high-water against
this table; it may not claim that Node RSS equals the variable-data budget.

## Deadline, TTL, cancellation and shutdown outcomes

- Caller deadline/cancel: settle only the caller waiter. Debt and byte custody
  are untouched.
- Generation deadline: prohibit new semantic attempts and publication; retire
  generation-owned work. External custody drains by its actual release paths.
- Source session TTL: prevent new OFFER/CHUNK, release unused root bytes, mark
  roots with HELD handoffs retiring, and never release adopted recipient claims.
- Recipient deadline/lifecycle replacement: prohibit publication, drop its
  actual decode/staging refs, then release the exact adopted claim. It cannot
  release a transport handoff.
- Cache notification completion/drop: release only the exact notification
  token; installed cache state remains.
- Router shutdown: stop new handoffs, close/drain registered sends and release
  every exact transport token once.
- Service shutdown: retire caller waiters/generations, then invoke the existing
  source, recipient, router and cache owner shutdown paths. “Shutdown started”
  alone is not proof that socket or notification references are gone.

Malformed identity and codec input is FAILED. Capacity, held ordinal,
temporarily unavailable route and caller-waiter saturation are DEFERRED with a
bounded retryAfter where a reply token exists. A missing response because even a
small token could not be admitted maps through the existing request deadline to
DEFERRED. None of these outcomes marks hydration complete or discharges a
durable CDC delivery obligation.

## Recovery and retained controls

This amendment keeps the independently reviewed dispositions:

- R3-4: final publication fence remains immediately before the synchronous
  cache swap.
- R3-5: descriptor/source discovery remains CRITICAL; OFFER/CHUNK payload
  remains BACKGROUND/BULK.
- R3-6: diagnostics enumerate actual pool holds and owner identity.
- R3-7: applied index remains canonical bounded decimal text with type and
  length checked before regex/BigInt.

It also keeps the cumulative negatives and controls for incomplete partition
sets, unavailable authority, partial/contradictory absence, same-N conflicting
bytes, exact same-N replay, suffix UPSERT/DELETE retention, stale publication,
session loss/recapture, capacity refusal and canonical applied-index text.
R3-1/R3-2 remain unimplemented until this contract is independently approved.

A missing/unreadable source fact never certifies empty coverage. A callback
after replacement releases only its exact resource token. Durable source debt
remains owed across caller exit, transfer interruption, session TTL and normal
startup until the existing reconcile owner establishes complete coverage.

## Required paired evidence before source approval

One candidate must provide semantic controls for all of these:

1. joined short caller expires and releases its references while a longer
   caller and shared read continue;
2. both-default multitable t=31000/t=31050 ordering;
3. delayed caller timer behind synchronous completion: short caller SPENT,
   long caller COMPLETE, installed fact retained;
4. cancellation before/after waiter attachment, waiter-cap refusal, no per-join
   promise closure and shutdown cleanup;
5. exact OFFER/CHUNK/refusal/error outer-envelope preflight including escaping,
   messageId and sourceAddress;
6. one-byte-below full-unit capacity refusal before materialization and adequate
   remote/colocated completion with measured S+H+C+K;
7. two individually affordable competing units, denied K growth, exact cleanup
   and the completionClaimant selecting one completing retry;
8. every N+1 request precedes callback N, HELD retains the same transfer and
   partial C, and the multi-chunk row completes within the original attempt;
9. duplicate N, never-released callback, TTL, CANCEL, lifecycle replacement and
   shutdown keep one data token and release only exact custody;
10. local and real WebSocket callback/throw/close/shutdown token release;
11. cancellation before adoption, racing adoption, after decode, after
    publication and after recipient replacement;
12. byte-identical canonical row/cell/observation incremental digests against
    the existing serializer, including the retained 3 MiB NUL expansion case,
    supported 8 MiB colocation and a greater-than-16-MiB row;
13. NUL-valued existing row outside a small page causes no proportional
    `changesBetween` serialization while changed rows retain exact detection;
14. cache notification remains charged after publication and releases only
    after queued run/drop, with installed state retained;
15. multi-page backlog and interruption discard incomplete candidates, recapture
    from the durable source and publish once without another user write.

Impact metadata must add the live transport, caller-waiter and cache-notification
endpoints to `cdc-source-coverage-reconcile-publication`, with actual local and
WebSocket paired witnesses. Source changes require independent review after
these design bytes are approved.

Normal production startup delivery of an already committed CDC obligation and
the exact durable event ACK/lost-response behavior are separate proof
obligations. This amendment makes no acceptance claim for either.
