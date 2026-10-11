# C17 coverage response resource handoff amendment

Status: proposed owner-interaction amendment for independent review before any
transport, page-v2, pool or cache source change. The caller-only N1/N2 clause
has separate design approval and separately frozen source evidence; this
revision changes only the still-unapproved transport allocation lifecycle. It
replaces the prior amendment only. The exact prior bytes are retained at:

`test-output/continuation-20261011/cdc-coverage-response-resource-handoff-amendment-864abf590b82dbc302cfc721c3c26ed0aa1853048bb4fdf0ff529eb72d262207.md`

That retained file has SHA256
`864abf590b82dbc302cfc721c3c26ed0aa1853048bb4fdf0ff529eb72d262207`.
The immediately preceding amendment is retained separately at:

`test-output/continuation-20261011/cdc-coverage-response-resource-handoff-amendment-12824e5047e8000b6eb85aa27c58c557b2683043ea7345d8da837d1d118ab17c.md`

It has SHA256
`12824e5047e8000b6eb85aa27c58c557b2683043ea7345d8da837d1d118ab17c`.
The immediately preceding D9 subject is retained separately at:

`test-output/continuation-20261011/cdc-coverage-response-resource-handoff-amendment-475490300df5a6f64bfa72d774160ecbab24e578a3e4defb52aec460dd64510b.md`

It has SHA256
`475490300df5a6f64bfa72d774160ecbab24e578a3e4defb52aec460dd64510b`.
Its complete review is
`review-cdc-c17-resource-handoff-round3-checkpoint.md`, SHA256
`620e72722c59ce232868f636b687dc2f952a809ca58ae0d332e7f8e950bf4b49`.
That review approves only the caller N1/N2 design and requires correction D9
for the cross-node `completionClaimant` schedule.
The immediately preceding D10 subject is retained separately at:

`test-output/continuation-20261011/cdc-coverage-response-resource-handoff-amendment-35ad2ff5ee9d19467e89b662aa671a2a578d0fca1a38833c1642e99b97b603ea.md`

It has SHA256
`35ad2ff5ee9d19467e89b662aa671a2a578d0fca1a38833c1642e99b97b603ea`.
Its complete review is
`review-cdc-c17-caller-source-and-resource-round4-checkpoint.md`, SHA256
`d11e6b39a80db53171ded41bb63c1370fa300891c00b5af26514c0d6d1c3b306`.
That review separately approves the five-path caller source correction at
`2de419483c9b4ce9e3fabc87bb54d93e4afb8817`; this amendment does not change or
extend that source approval. It requires the D10 probe custody correction below.
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

The mandatory scalar probe has two additional, disjoint node-local accounts:

- `Ps` is the source result graph, escaped/serialized response, frame/socket
  copy, send token and bounded source probe state while any of those references
  remain live;
- `Pr` is the recipient `SERVICE_RESPONSE` input/result graph and the captured
  scalar binding retained by the reconcile attempt until it is absorbed by a
  data-unit claim or discarded.

`Ps` and `Pr` include their byte and count slots. They are not aliases for H or
C. Receipt does not release Ps, and source callback does not release Pr. The
transfer owner debits each exact term in the pool of the node which holds it.
An atomic custody transfer or upgrade may subtract an old term only when the
same bytes/count cease to exist under the old owner in that operation.

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
- `Ps`: complete bounded source-side probe response custody, including result
  graph, outer envelope strings, serialization, frame/socket copy, send token
  and its fixed source probe state/count;
- `Pr`: complete bounded recipient-side probe input custody, including the
  received response graph, captured scalar binding, fixed attempt reference and
  its input/count token.

The six capacity accounts below are disjoint:

- `S = source raw/materialized representations + P + Dsrc + source metadata`;
- `H = G + J16 + J8 + F + transport-handoff metadata`;
- `C = recipient input/chunks + A + Drecv + recipient metadata`;
- `K = Kstage + Knotify + Dcache`.
- `Ps = source probe output/transport copies + source probe metadata`;
- `Pr = recipient probe input/binding copies + recipient probe metadata`.

S never includes H. C never includes K. Ps never disappears into S/H merely
because the recipient received the probe, and Pr never disappears into C/K
merely because the source callback ran. A byte or count credit appears in
exactly one account. A custody transfer moves an already owned credit between
owners; it does not add the same credit again. The source and consumer formulas
must use measured codec constants and checked sums, not the old ASCII-only
acceptance numbers. The prior 8 MiB figures remain a control and must be
remeasured for the complete page-v2 aggregate, including live Ps/Pr, before an
affordability claim.

`CdcCoverageTransferOwner` refuses before response object/base64/serialization
allocation unless the session already owns H and one pending-data-handoff slot.
Small replies use separately bounded small-reply bytes/count slots in the same
pool. Probe responses additionally create the exact Ps/Pr claims described
below. Each source session owns at most one data-handoff slot. No phase may
reinterpret unused S bytes as H, unused C bytes as K, or a live probe term as
free capacity.

If even the bounded response cannot reserve its token, the handler throws the
private local `CoverageResponseCapacityDeferred` sentinel before constructing
a result. The coverage-aware router adapter suppresses response construction.
The already bounded requesting side reaches its existing message deadline and
classifies that absence as DEFERRED/capacity, retaining debt. The generic router
does not serialize the sentinel or manufacture an interpolated error. Hard
identity/codec failures use a separately preflighted bounded FAILED response;
they never include the offending variable input.

## Atomic reservation and global endpoint order

### One debit and credit table

The following table is the only capacity accounting interpretation. “Debit”
means unavailable to every other root while the credit is owned. “Transfer”
changes custody without changing the pool total.

Ps and Pr are additional live terms on their respective nodes during every
row below. A reservation compares the requested delta against the pool after
including all current Ps/Pr debits. Therefore source admission while a probe
send callback is delayed requires `Ps + S + H` on that source node; recipient
admission while its probe input is retained requires `Pr + C + K`; colocated
admission with both live requires `Ps + Pr + S + H + C + K`. This is accounting
inside the existing configured pool. It neither raises that limit nor calls an
old `S+H+C+K`-only value supported.

| Transition | S root bytes/count | H response bytes/count | C recipient bytes/count | K publication bytes/count |
| --- | --- | --- | --- | --- |
| bounded remote probe | no S debit and no row/page materialization; debit exact Ps in the source pool before result/envelope construction | Ps is released only by actual send callback, synchronous throw, exact socket close or router shutdown | the reconcile attempt preowns maximum Pr before sending the request, then retains only measured Pr for the received input/binding; no C debit yet | none |
| ordered first endpoint, source is lower | debit exact S and maximum one-response H plus one source-session and one data-handoff slot before row materialization | owned unused by source session | none | none |
| ordered first endpoint, recipient is lower | none | none | debit exact C and one recipient-session slot from the exact probe bounds before authorizing materialization | debit safe K from the current cache revision, exact probe page byte/row bounds and worst-case changed-row/listener counts |
| ordered second endpoint | if source is upper, debit exact S+H only after the request carries the lower recipient token identity | same token custody as source-lower | if recipient is upper, debit exact C only after receiving the source-lower OFFER | if recipient is upper, debit safe K from the bound OFFER before decoding |
| colocated admission | atomically debit the S+H+C+K data-unit delta while retaining or exactly transferring every live Ps/Pr byte and count before row materialization | owned unused | owned by pre-adoption pair | owned by pre-adoption pair |
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

Remote operation first obtains a bounded scalar probe through the existing
source handler. The probe binds the already required source scope, applied N,
cell/cursor, ordinal, page byte/row maxima, source and recipient identities and
lifecycle generations. It retains no row, page, base64 or canonical JSON copy.
Before sending the request, the reconcile attempt reserves bounded maximum Pr
in the recipient node's existing pool. This is the input/result envelope bound
known from the fixed probe protocol; refusal occurs before the request and
allocates no response. Before constructing the response, the transfer owner
reserves exact Ps in the source node's pool. The MessageRouter owns that token
from envelope construction through the actual send terminal. On receipt, the
coverage response adapter validates the actual graph against preowned Pr and
shrinks only after dropping unused capacity; it then retains the captured
binding under that same claim.
No SQLite read transaction crosses the network await. A later capture must
reproduce the exact probe binding or return typed DEFERRED/STALE and drain its
own actual custody.

The probe remains one attempt object across the next admission. It has exact
`PROBE_RECEIVED`, `DATA_UNIT_ADMITTED`, `RETIRING` and `RELEASED` states under
the existing reconcile/transfer owners; these are volatile custody states, not
authority or a second progress ledger. Ps and Pr are separate once the response
crosses a node boundary. A source callback releases only Ps. The reconcile
attempt releases Pr only after the captured binding is no longer referenced, or
atomically transfers identical live bytes/count into C when C's formula includes
that exact input. A nonidentical copy remains separately charged.

When the next data-unit admission runs before the probe callback, it includes
live Ps in the source-node comparison and live Pr in the recipient-node
comparison. Adequate configured capacity admits the complete aggregate without
waiting for the callback. Insufficient capacity returns the existing typed
capacity DEFERRED while retaining this exact probe and binding for the existing
in-attempt backoff/capacity-wake continuation. That continuation retries only
the failed atomic data-unit reservation; it does not issue another probe.
Source-local Ps release wakes the existing transfer-pool callback. Across nodes,
the reconcile owner's already bounded backoff timer retries under the original
generation deadline. No ACK, receipt, caller exit or TTL renews that deadline
or releases either probe term.

Both endpoints derive one order from the captured canonical source and
recipient node IDs: unsigned lexicographic comparison of their already bounded
UTF-8 bytes. Equal IDs are colocated. The lower node's complete local unit is
always reserved first and the upper node's unit second:

| Direction | First admission | Second admission |
| --- | --- | --- |
| source node is lower | source S+H, then materialize one OFFER | recipient C+K from that OFFER before decode |
| recipient node is lower | recipient C+K from the exact probe | source S+H only after the request proves the live lower-endpoint token |
| same node | one atomic Ps+Pr+S+H+C+K aggregate comparison, subtracting only exact transferred aliases | none |

The comparison is resource ordering only; it changes no routing, partition or
key comparator. A request carries the opaque first-token ID plus the exact probe
binding. The upper endpoint treats that ID as correlation, not authority: its
existing source or recipient owner revalidates the binding, both endpoint roles,
its own lifecycle and the attempt deadline before debiting. The lower pool owns
the first token and only its exact owner can release it. No pool marker, remote
CAS, coordinator, readiness barrier or durable record is introduced.

Each local unit is self-sufficient after admission. Source S+H can capture and
emit one bounded ordinal without another source-pool debit. Recipient C+K can
decode and publish if its probed cache revision remains current. A second
endpoint refusal returns typed capacity DEFERRED, drains the first unit by its
actual custody paths, and leaves the same durable debt to the existing reconcile
owner. It never holds a first endpoint data unit while waiting through a retry.
Draining that data unit does not discard the exact Pr binding, and cannot
release a Ps still owned by MessageRouter. The next in-attempt continuation
reuses Pr, revalidates all probe facts and retries ordered admission without a
new probe. If Pr itself must be discarded, this attempt terminates; only a later
ordinary generation may obtain a new probe.

For colocated operation, one atomic S+H+C+K admission is sufficient for the
measured data unit, but the same atomic comparison also includes current Ps and
Pr. If the local adapter transfers one identical response graph rather than
copying it, its once-only transfer changes custody without reducing the debit;
otherwise both copies stay charged. There is no later first-time H reservation,
so admitted S roots cannot strand one another before a response. K is an upper
bound, not a byte alias: unused K remains unavailable to competing roots until
swap/failure.

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
5. set the current reconcile attempt's typed capacity-DEFERRED result before
   the first local pool release can synchronously invoke wake callbacks;
6. leave the reconcile debt owed and let only its existing backoff/capacity-wake
   path start a later ordered attempt.

There is no `completionClaimant`. In particular, a local pool never refuses a
foreign source root merely because a recipient debt previously lost K growth.
All token identity ends when the exact local unit drains. If release occurs
while that debt generation is still executing, the reconcile owner's existing
wake observes `inFlight` and does not start a duplicate; the returned DEFERRED
outcome then arms the existing bounded backoff. If a later release occurs after
backoff registration, the existing pool callback wakes it early. A remote pool
wake is never assumed to cross nodes; the attempt's existing timer is the
correctness path.

The endpoint order supplies the completing winner for the D9 schedule. Let
`X < Y`. Transfer A is source X to recipient Y; transfer B is source Y to
recipient X. Both perform only bounded probes first. A's first unit is S+H in X
and B's first unit is C+K in X. The X pool serializes those ordinary admissions:

- if A wins X, B sends no materialization request to Y; A obtains C+K in the
  otherwise free Y pool and can complete;
- if B wins X, A returns capacity DEFERRED before materialization; B then
  obtains S+H in the otherwise free Y pool and can complete;
- if both first units fit X, Y serializes their second units; the loser drains
  its X unit immediately while the winner has complete units at both endpoints.

Thus no transfer waits while retaining a lower-endpoint unit for a refused
upper-endpoint unit, and two opposite attempts cannot form a cycle with zero
retained bytes. Every admission includes all simultaneously admitted Ps/Pr
terms, including probes for the opposing operation; a capacity configured only
for the old data-only formula is reported as pressure rather than promised
progress. A refused operation drains its data unit but retains only its bounded
exact Pr continuation, so a delayed callback cannot force probe churn. Finite
unrelated pressure may still defer both, and an indefinitely mutating cache has
no liveness claim.

On success the cache owner performs the final `canPublish` check, swaps the
installed coverage fact and transfers Knotify custody before releasing C or
Kstage. Those releases synchronously invoke local pool wakes only after the fact
is observable. Source H/S drain by their actual transport/source terminals.
Consequently a woken loser rechecks installed coverage and cannot race ahead of
the winner's publication. On refusal or failure, the typed attempt state is set
before the first synchronous release, so a callback observes a current retained
debt rather than an unclassified half-release.

If cancel and adoption race, cancellation before adoption releases the pair.
Cancellation after adoption prevents new source work but cannot release
recipient C/K. A cancel after decode retains C/K until candidate disposal. A
cancel after publication never rolls back the cache and cannot release queued
Knotify custody.

### D10 probe custody and executable continuation

The complete probe handoff is one owner interaction:

1. The reconcile attempt reserves maximum Pr before issuing the bounded probe.
   The source handler captures the scalar facts, reserves Ps in
   `CdcCoverageTransferOwner`, and gives its exact once-only token to
   MessageRouter. It constructs no response if Ps cannot be reserved.
2. MessageRouter registers the exact socket/send identity before sending. The
   recipient may receive first. Its coverage response adapter validates the
   input against preowned Pr, shrinks only unused credit, and gives the exact
   captured binding to the active reconcile generation. ACK or receipt changes
   neither token.
3. The reconcile generation applies canonical endpoint order. Each atomic
   reservation includes every still-live probe term in that node's pool. If the
   source is lower it first requests S+H while Ps may still be live, then the
   recipient requests C+K while Pr is live. If the recipient is lower it first
   requests C+K while Pr is live, then requests S+H while Ps may still be live.
   Colocation performs one atomic comparison over all six terms.
4. If both data units fit, the exact Pr bytes are either transferred into C in
   the same atomic operation or remain separately charged until their last
   reference is dropped. Ps remains charged until its real send terminal even
   if OFFER/CHUNK work has begun. No callback releases C, K, S or H.
5. If a data unit does not fit, set the attempt's typed capacity-DEFERRED state
   before releasing any admitted data unit. Drain S/H/C/K by their existing
   paths, retain the exact bounded Pr probe/binding, and retry ordered admission
   from that same probe through the existing generation backoff/capacity wake.
   A delayed Ps terminal may supply a local wake; the cross-node path remains
   the existing timer. The original generation deadline is unchanged.
6. On exact cancel, expiry, lifecycle replacement, stale binding or shutdown,
   prohibit new data admission. Drop the reconcile reference then release Pr
   once. Ps becomes RETIRING but remains charged until callback, synchronous
   throw, exact socket close or router shutdown. A late terminal uses its exact
   token and cannot release a successor probe or data unit.
7. If the send callback runs before the next phase, only Ps is removed and the
   same Pr binding continues immediately. If it runs after the next phase, Ps
   was already included in that admission's high-water and releases normally.
   If it never runs, close/shutdown or the original attempt deadline ends new
   work; no timeout counter pretends the external copy was freed.

The retained probe is bounded by the same generation deadline and lifecycle as
the reconcile attempt. It is not retained across generation retirement. A new
generation may probe again only after the old Pr reference is gone; old Ps may
still drain independently under its exact send token. A stale response cannot
be attached to the successor because request, source scope, N, cell/cursor,
ordinal, source/recipient identity, both lifecycle generations and reconcile
generation all differ or are revalidated.

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
same synchronous turn. A denied growth performs the exact ordered-unit cleanup
above and returns DEFERRED before any candidate allocation.

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
| 1 probe source send | bounded SQLite scalar probe plus Ps result/envelope/frame/send/state bytes and counts; no user row/page/base64 | Ps ends only at callback/throw/close/router shutdown; receipt is not release |
| 1a probe receipt | phase 1 may coexist with Pr response-input/binding bytes and count at the recipient | Pr remains with the exact reconcile attempt; source terminal cannot release it |
| 2 ordered first credit | lower endpoint owns either disjoint S+H or disjoint C+K while all local Ps/Pr remain charged; colocated pair atomically admits Ps+Pr+S+H+C+K | second-endpoint refusal drains this exact data unit but may retain exact Pr for bounded same-probe continuation; no term borrows another |
| 3 ordered second credit and source capture | upper endpoint owns the complementary unit; source capture begins only after its S+H is admitted; at most two raw row/cursor representations and one P under S plus one fixed Dsrc scratch and bounded digest metadata | source retirement only after no external H; first token never waits through a retry |
| 4 OFFER | phase 3 plus one G, J16, J8 and F transferred within H; exactly one data-handoff slot | actual callback/throw/close/shutdown returns H or drains retiring S |
| 5 adoption | source retains S+H; recipient owns C+K and one bounded OFFER/input graph | pre-adoption CAS may release pair; post-adoption owners release separately |
| 6 CHUNK N send | source S/P plus one Q view, B, G, J16, J8 and F within the one H credit | exact transport terminal only; receipt/ACK/handler return insufficient |
| 7 recipient N and held continuation | source may still hold H(N); recipient holds one input B, one decoded Q, partial chunk array and continuation metadata within C; K remains unused | successful copy may drop input B/Q; HELD keeps partial C and retries same ordinal |
| 8 assembly/decode/digest | source S/P; recipient chunk array, one concatenated P, one typed row A and one fixed Drecv scratch under C; K unused | exact recipient failure drops C; source CANCEL drains S/H independently |
| 9 fresh cache preflight | same C objects plus current exact Kactual calculation; no candidate maps yet | Kactual <= K consumes preowned K in same turn; denied growth records typed DEFERRED, drops C/K and retires S/H without a pool marker |
| 10 cache staging | previous map, final map, cover/suffix state, tombstone clone, revision map, publication array, Dcache scratch and notification clones within K, plus recipient P/A in C | failed stage drops exact candidates; successful swap releases Kstage and transfers Knotify tokens |
| 11 queued notification | installed ordinary cache state plus one cloned record and completion token per queued publication in Knotify; C duplicates gone | queued closure finally, schedule failure or shutdown drop hook |
| 12 retired source | any external H remains; S cannot be reused and no new ordinal starts | last exact send terminal releases H then S |
| 13 completion | no caller/source/recipient/handoff/notification transient refs; installed cache fact and durable debt remain | ordinary cache/reconcile lifecycle only |

At every phase the node-local debit is exactly the union of the applicable
disjoint accounts. The maximum is `Ps + Pr + S + H + C + K` when all terms are
colocated; a remote node uses only the terms it actually holds. H is not a slice
inside S, K is not included in C, and probe terms remain present until their
actual terminals or atomic identical-byte transfer. Transfer changes custody
but not the total. A term is subtracted only after its last owner releases it.
The implementation must measure codec/runtime constants, the configured probe
count bound and high-water against this table; it may not claim that Node RSS
equals the variable-data budget or solve the overlap by increasing the limit.

## Deadline, TTL, cancellation and shutdown outcomes

- Caller deadline/cancel: settle only the caller waiter. Debt and byte custody
  are untouched.
- Probe continuation cancel/expiry: release Pr only after dropping its exact
  reconcile reference; Ps drains solely through its registered send terminal.
  No new probe is issued inside the retiring generation.
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
6. one-byte-below complete aggregate capacity refusal before materialization
   and adequate remote/colocated completion with measured Ps+Pr+S+H+C+K terms;
7. real WebSocket probes in both node orders hold each source send callback
   until after the recipient attempts ordered data admission. At the declared
   aggregate boundary the same retained probe completes after callback-before
   and callback-after-next-phase schedules without a second probe; one byte
   below returns typed capacity DEFERRED, preserves debt and releases every
   exact token once. The paired control covers colocation, cancel/expiry, stale
   binding, socket close and a late old callback unable to affect a successor;
8. two individually affordable opposite remote transfers, denied K growth,
   exact cleanup and global lower-then-upper endpoint admission selecting one
   completing transfer with both old units drained;
9. every N+1 request precedes callback N, HELD retains the same transfer and
   partial C, and the multi-chunk row completes within the original attempt;
10. duplicate N, never-released callback, TTL, CANCEL, lifecycle replacement and
   shutdown keep one data token and release only exact custody;
11. local and real WebSocket callback/throw/close/shutdown token release;
12. cancellation before adoption, racing adoption, after decode, after
    publication and after recipient replacement;
13. byte-identical canonical row/cell/observation incremental digests against
    the existing serializer, including the retained 3 MiB NUL expansion case,
    supported 8 MiB colocation and a greater-than-16-MiB row;
14. NUL-valued existing row outside a small page causes no proportional
    `changesBetween` serialization while changed rows retain exact detection;
15. cache notification remains charged after publication and releases only
    after queued run/drop, with installed state retained;
16. multi-page backlog and interruption discard incomplete candidates, recapture
    from the durable source and publish once without another user write.

Impact metadata must add the live transport, caller-waiter and cache-notification
endpoints to `cdc-source-coverage-reconcile-publication`, with actual local and
WebSocket paired witnesses. Source changes require independent review after
these design bytes are approved.

Normal production startup delivery of an already committed CDC obligation and
the exact durable event ACK/lost-response behavior are separate proof
obligations. This amendment makes no acceptance claim for either.

## D11-D13 complete attempt reservation and transport custody

The immutable D10 subject is retained at
`evidence/cdc-coverage-response-resource-handoff-amendment-round5-25f149bd.md`,
SHA-256
`25f149bdc3b1db073149fe5d73909e27d58c0682502844e679c77c13708195d4`.
This section answers D11 through D13 in
`review-cdc-c17-resource-round5-checkpoint.md`, SHA-256
`88be444a311b7b7d5d7e985bac9b53599b84b171bd2e8c79f609ea1433dc9ff3`.
It is the authoritative allocation/acquisition/release timeline and supersedes
the earlier debit table, probe-first admission and six-term peak wherever they
conflict. D10's exact one-probe identity, no-reprobe continuation and fixed
generation deadline remain. The independently approved caller source at
`2de419483c9b4ce9e3fabc87bb54d93e4afb8817` is unchanged.

### Complete terms and bounded wire population

`S`, `H`, `C`, `K`, `Ps` and `Pr` retain their meanings above. Three disjoint
wire terms complete the resource graph:

- `Wi` is inbound custody acquired before a coverage frame is turned into a
  JavaScript string, parsed object or result graph. It has disjoint
  `WiIngress` raw-frame/string/parser scratch and `WiPending` exact expected or
  late-response custody. Together they cover the parsed wrapper/result graph,
  pending-response binding and input count slots even while ingress and an
  older retained result coexist. Separate measured subcredits cover probe,
  OFFER/CHUNK and small control inputs.
- `Wo` is bounded outbound request and transport-ACK custody: captured request
  graph, serialization/string/frame/socket copies, pending-request metadata,
  send token and count slot. It excludes probe output `Ps`, data response `H`
  and small response `Wr`.
- `Wr` is bounded small-response custody for `HELD_ORDINAL_DEFERRED`, capacity
  refusal, stale/session-missing, CANCELLED, FAILED and other canonical control
  results. It includes result graph, outer envelope, serialization, frame/socket
  copies, send token and count slot. It never borrows externally held `H`.

The complete response preflight already defined in this document supplies the
per-message byte maxima for all three terms. The existing reconcile generation
supplies the fixed absolute deadline and positive retry cadence. Construction
derives, with checked safe-integer arithmetic:

```text
maxChunks = ceil(maxPageCanonicalBytes / CHUNK_BYTES)
maxHeldAttempts = messages possible under the unchanged positive backoff
                  before the fixed generation deadline
maxWireMessages = probe + OFFER + chunks + bounded held/refusal/error/cancel
                  attempts + their request/ACK wrappers
```

These are resource counts, not logical row or participant caps. They cannot
extend the deadline, add attempts, or make an oversized row supported. `Wo`,
`Wi` and `Wr` reserve the worst-case simultaneous copies when callbacks for all
already emitted bounded control messages are delayed until close. Exact defaults,
per-envelope coefficients and the resulting count/byte high-water remain
measurement gates. Unsafe arithmetic or an invalid zero/unbounded cadence is a
loud configuration error.

`CdcCoverageTransferOwner` keeps these subcredits inside the existing node
pool. A configured nonborrowable `Wbase` slice covers only the bounded
reservation/admission exchange and `WiIngress` scratch for the maximum admitted
coverage sessions. Every semantic `Wr`, `Wo` and `WiPending` term belongs to an
attempt unit below. Wbase is subtracted from the same configured byte and
session limits; it is not additional capacity or a global limit increase.
Data/probe claims cannot consume it. An excess, not-yet-admitted attempt waits
or receives typed pressure through the existing reconcile deadline. Once an
attempt is admitted, its own Wr/Wo/WiPending capacity cannot suppress its only
HELD/refusal/error continuation.

### Reserve a completing attempt before the first probe

The reconcile owner already knows the bounded source node, recipient node,
scope and configured supported maxima before the scalar probe. It derives two
conservative local units:

```text
Esource = Ps + S + H + source-side WiPending/input + source-side Wo
          + source-side Wr
Erecipient = Pr + C + K + recipient-side WiPending/input + recipient-side Wo
             + recipient-side Wr
```

Each unit includes byte and count maxima for its role and the complete wire
population above. `Wi + Pr` and `Wi + C` are both included where parser input
and the retained binding/data copy may coexist. Identical bytes may be
transferred only in the same atomic owner operation after the old reference is
dropped. Otherwise both remain charged.

The pre-probe route identifies where to reserve; it is not coverage authority.
The scalar probe must still validate the exact source/recipient lifecycles,
scope, applied N and bounds. A stale or redirected route retires both units and
reenters the existing routing/reconcile path without reading a variable row.

The existing reconcile owner acquires these units before sending the probe. It
uses the canonical unsigned BINARY node-ID order already specified above:

1. Atomically reserve the complete lower-node unit in that node's existing
   `CdcCoverageTransferOwner` pool.
2. Request the complete upper-node unit using the preowned bounded admission
   request/receive/reply subcredits. Refusal records typed capacity pressure and
   releases the lower unit immediately; no probe or variable row was read.
3. Only after both units exist may the one scalar probe be sent. The probe may
   narrow measured use inside the units, but the unused credit remains owned
   until the attempt can no longer require it. No later phase performs a first
   debit for data, parser input, HELD or error output.

Colocation performs one atomic union reservation for `Esource + Erecipient`,
subtracting only proven aliases transferred in that same operation. It counts
all simultaneously live source and recipient copies. Remote reservations keep
the units in their actual node pools; credit never crosses nodes.

This ordering removes probe-only capacity claimants. A retained probe exists
only while the same attempt still owns both complete units and can therefore
finish without another pool acquisition. If an upper reservation refuses, the
lower unit is released before backoff and no probe exists to retain. If a later
semantic stale/unavailable result makes the attempt retryable, it either keeps
both complete units with the exact probe under the original deadline or drops
the probe and both units before an ordinary retry. It never keeps `Pr` alone
while asking the pool later to discover completion headroom.

For two opposite remote transfers, both acquire the same lower node first. The
node-local atomic debit in `CdcCoverageTransferOwner` admits one complete unit;
the loser holds no unit on the upper node. The winner then obtains the free
upper unit and can complete. With more nodes, every attempt acquires in the same
strict total order and releases its lower unit on any upper refusal, so no
capacity cycle is retained. Existing single-flight reconciliation, pool release
wakes and bounded backoff retry refused attempts; no completion claimant,
coordinator, durable record, scheduler or timer is added. Under stable facts and
capacity sufficient for one complete pair, this permits a completing winner.

Multiple finite probes are therefore honest: each is backed by a complete
pair, or it was never sent. Old externally owned transport tokens from a
retired attempt remain debited and may create real resource pressure; they are
never called free completion capacity.

### Per-node allocation, handoff and release table

The table below is the only current accounting interpretation. “Transfer”
moves an already debited subcredit and its exact token; “release” requires the
last reference and terminal named here.

| Phase / message | Source-node ownership | Recipient-node ownership | Permitted transition or terminal |
| --- | --- | --- | --- |
| Attempt admission | Full `Esource`, including all source `Wi/Wo/Wr` counts; no row or response object | Full `Erecipient`, including all recipient `Wi/Wo/Wr` counts; no page/candidate | Lower then upper; upper refusal releases lower before retry. Colocation is one atomic union. |
| Probe request | Source `Wi(probe-request)` covers raw frame, string, parse and request graph; source ACK uses `Wo(ack)` | Recipient `Wo(probe-request)` covers graph through actual send; `Wi(probe-response)` is already owned before send | Request send callback/throw/close releases only its `Wo`; ACK receipt/drop releases its exact `Wi`, never probe debt. |
| Probe response | `Ps` transfers to router before construction and remains through result/envelope/frame/socket terminal | `Wi(probe-response)` covers parse before waiter lookup; captured result transfers to `Pr` only after the input copy is dropped, or both stay charged | Response receipt does not release `Ps`. Callback/throw/exact close/router shutdown releases `Ps`. Parse/drop releases `Wi`; retained binding releases/transfers `Pr`. |
| OFFER request/response | Request input uses source `Wi`; OFFER output transfers preowned `H` to router | Request output uses recipient `Wo`; `Wi(data-response)` is owned before OFFER arrival and may coexist with `C` | OFFER callback/throw/close returns `H` to live S or drains retiring S. Parse/drop releases `Wi`; adoption transfers decoded/input custody into C only atomically. |
| CHUNK N request/response | Request input uses source `Wi`; one data response owns the one `H` handoff | Request output uses recipient `Wo`; `Wi(data-response)` covers parse while partial chunks and decoded Q remain in C | ACK, handler return and recipient receipt release neither H nor C. H returns only at actual send terminal. Successful copy drops exact Wi/input duplicates. |
| N+1 while H(N) is held | Incoming request consumes its preowned source `Wi`; `HELD_ORDINAL_DEFERRED` transfers one preowned `Wr` slot while H remains debited | Outgoing request uses `Wo`; control result parses inside preowned `Wi(control-response)` while C/Pr/K remain | No new data H. Delayed H and Wr callbacks coexist within Esource. Control parse/drop releases Wi; Wr ends only at callback/throw/exact close/shutdown. |
| Capacity/refusal/stale/error/CANCELLED | Request input and ACK use preowned Wi/Wo; canonical bounded control result uses Wr | Pending request and response parse use preowned Wo/Wi; no offending variable text is reflected | Typed outcome is deliverable for every admitted attempt. Hard failure retires semantic work only after its response custody transfers; pressure retains durable debt. |
| CANCEL request / ACK | Source request input and bounded ACK/control output use Wi/Wr/Wo as measured | Recipient request output and ACK/control input use Wo/Wi | CANCEL prevents new source work; it never releases external H/Ps/Wr or adopted C/K. ACK proves neither delivery nor reference release. |
| Decode/assembly | S/P and any external H stay source-owned | C owns input chunks, assembly, decoded rows and Drecv; K remains preowned; Wi for the current frame coexists until its parser graph drops | Failure drops actual C refs then releases C. Source drains independently through CANCEL and transport terminals. |
| Cache staging/swap | Source terms unchanged | C plus Kstage/Knotify/Dcache and current cache rows; queued notification result/token is Knotify | Exact current preflight precedes allocation. Swap transfers notification custody before C/Kstage release. Queue run/drop/shutdown releases each Knotify token. |
| Semantic cancel, generation expiry or replacement | No new work; unused S/H/W subcredits release only if never transferred. External Ps/H/Wr stay with router | Drop Pr/C/K refs actually held. Outstanding Wi response claims transfer to router late-input custody rather than release | Deadline/TTL/cancel does not prove absence of a future frame. Durable debt remains. |
| Late old input | No authority change; source send token may already have terminated | Exact old `Wi` covers frame-to-string, JSON parse, classification and drop despite no current waiter | Drop releases only old Wi. It cannot attach to or debit the successor. Malformed/foreign remains inert and typed/logged. |
| Exact connection close / router shutdown | After the exact connection generation closes and router drops queued frame/send references, release its Ps/H/Wr/Wo tokens once | The same proof releases outstanding Wi/pending-response tokens once | “Close observed” is insufficient until owner confirms queued/buffered references are gone. Old callbacks use exact tokens and cannot release successor credit. |
| Complete semantic result | Installed cache fact may remain while external router/notification tokens drain | Reconcile result settles; unused reservation credit releases, Knotify and late Wi remain with their actual owners | Semantic completion is not a resource terminal. Final pool release occurs when every transferred token reaches its named terminal. |

### Transport-owned receive lifetime

`WiPending` is acquired before request send for every expected probe,
OFFER/CHUNK and control response. The pending-response owner registers it
against the exact socket/connection generation. Separately, the router's
nonborrowable wire slice owns enough `WiIngress` slots for the configured
simultaneous admitted sessions. On raw-frame delivery the router checks the
frame byte length and takes WiIngress before creating a JavaScript string or
calling `JSON.parse`; the message ID is not falsely assumed known before
parsing. After the bounded parse, a matching frame atomically transfers its
actual graph from WiIngress to its already debited WiPending and releases the
unused/scratch difference only after the old references are dropped. A
different message is classified and dropped inside WiIngress, then releases
only WiIngress; it cannot consume or release the expected response's WiPending.
The full pending binding is exact request ID, socket/connection generation,
source and recipient node/lifecycle identities, reconcile generation and
response kind. These fields are correlation for custody, never source or cache
authority.

When the semantic waiter or generation retires first, it drops `Pr/C` as
applicable but transfers outstanding `Wi` to the existing MessageRouter pending
response/late-response owner. The token persists until exactly one of:

- the response arrives, is parsed inside the debit, classified, dropped or
  handed on, and all input references are gone;
- a synchronous receive refusal proves no input reference was created; or
- the exact connection generation closes or router shutdown drains its queued
  frames and parser/pending-ledger references.

Waiter timeout, generation expiry, transfer TTL, source send callback, receipt,
ACK and source CANCEL are not terminals. Thus an old authorized probe response
after cancellation uses its own retained Wi, is rejected semantically, and
cannot consume a successor's credit. A recipient-upper OFFER similarly arrives
inside preowned `Wi(data-response)` before C admission/transfer; parsing never
precedes its debit.

If a response never arrives and the exact connection never closes, its bounded
Wi remains real pressure. The fixed session/request counts prevent unbounded
retention; a later attempt receives typed pressure and durable debt remains.
No timeout fabricates a transport terminal merely to make progress.

### Control continuation while H is external

Every admitted attempt owns enough `Wr` bytes and count slots for the maximum
simultaneous small results derivable from the existing deadline/cadence and
message-count bounds. It also owns the matching requester `Wi` and request
`Wo` terms. Therefore `N+1` arriving while `H(N)` is externally held always
has one preowned `HELD_ORDINAL_DEFERRED` path. The source constructs no second
data graph, transfers one Wr slot, and retains H(N). The recipient parses the
control reply inside Wi, retains its C/K/session/ordinal, and reenters through
the existing reconcile backoff/capacity wake under the original deadline.

A control reply received before its source callback is expected: Wi may release
after parse while Wr remains externally debited. Repeated HELD results can have
delayed callbacks simultaneously only up to the precomputed attempt count, all
charged in Wr. When that bound or the original deadline is spent, no new
request is issued; the attempt returns the existing typed deferred/spent result
and retires semantically while external tokens drain. Adequate admitted
capacity never suppresses a required continuation reply, and insufficient
capacity refuses the complete pair before the probe.

### Completion argument and required proof

For a supported attempt, all bytes/counts needed for one probe, a complete
source/recipient data unit, every permitted wrapper/control overlap and queued
publication result are owned before the probe. No later capacity acquisition
can strand it. Canonical lower-then-upper acquisition ensures opposite remote
attempts cannot each retain a resource needed by the other's winner; the loser
holds nothing after upper refusal. Colocation uses one atomic union. The only
remaining waits are semantic/transport events already bounded by the same
generation deadline, while external copies retain honest custody beyond that
semantic bound if necessary.

Future source proof must use real local and WebSocket routes and measure this
complete graph:

1. both node orders and colocation at the exact complete byte/count boundary,
   with several finite attempts and all probe callbacks drained, must select an
   affordable winner and complete; one byte or count below refuses before the
   probe and retains debt;
2. delay a probe response beyond generation retirement and admit a successor;
   old Wi must cover parse/drop, remain inert and release only on drop or exact
   close, never from timeout or the old source callback;
3. deliver a recipient-upper OFFER before its send callback and prove preowned
   Wi covers parse while C and H retain their separate custody;
4. hold probe Ps and H(N), request N+1, receive the HELD result before its Wr
   callback, repeat within the bounded count, release callbacks in both orders
   and complete the same transfer before the unchanged generation deadline;
5. repeat with HELD/error/ACK/control callbacks delayed through cancel, expiry,
   stale binding and shutdown. No-response/callback-never-runs keeps exact
   tokens until connection close; actual close drains and releases once;
6. retain the cumulative NUL, canonical digest, cache-growth, notification,
   greater-than-16-MiB row, multi-page, conflict/replay and incomplete-coverage
   controls already required above.

Measured defaults and high-water must include this colocation union, and the
role-appropriate subset on each remote node:

```text
Wbase + S + H + C + K + Ps + Pr + WiPending + Wo + Wr
```

WiIngress is charged inside Wbase and is never silently duplicated or omitted.
This is a design contract only. It adds no coordinator, scheduler, store,
timer, cache authority, snapshot shortcut, deadline renewal or global limit
increase. Source, tests, metadata, normal startup, original event delivery and
lost-ACK acceptance remain unapproved.

## D14 shared native receive admission and dispatch correction

The exact D11-D13 subject above is retained at
`evidence/cdc-coverage-response-resource-handoff-amendment-round6-ab37ab32.md`,
SHA-256
`ab37ab327409e5d173c3be858c26814c6bc94286b48a511d0fa7145798df1dfa`.
This section answers the one grouped D14 finding in
`evidence/review-cdc-c17-resource-round6-checkpoint.md`, SHA-256
`932be14d42109cc0408671fc52718d91248ee8d8518bbfd431b21c85954e705b`.
It supersedes only the contradictory D11-D13 statements that place
`WiIngress` after native assembly, send variable CHUNK data as base64 in an
ordinary `SERVICE_RESPONSE`, or drop every nonmatching message at the common
router entry. The complete lower-then-upper units, atomic colocation union,
disjoint S/H/C/K/Ps/Pr/WiPending/Wo/Wr copies, fixed generation deadline,
bounded cadence, exact idempotent acquisition, lost-answer recovery and
router custody after semantic retirement remain authoritative.

### Owner decision and exact STOP boundary

`MessageRouter` remains the only transport owner. It owns connection
admission, WebSocket construction, native receive buffers, classification,
dispatch, send completion, connection close and shutdown. The existing
`CdcCoverageTransferOwner` remains the only CDC byte/count/session admission
owner. It debits the unchanged 128 MiB/eight-root-session node pool and lends
exact resource tokens to MessageRouter; it does not parse frames or decide
delivery. The reconcile owner remains the only retry/debt owner. No snapshot
owner, new ledger, scheduler, timer or budget owner is introduced.

The current primary WebSocket cannot implement this contract. Its server and
client receivers are constructed with ws 8.21.0's 100 MiB defaults before
`MessageRouter` sees `type` or `messageId`. The existing bulk IDENTIFY fork is
also too late to change the already constructed server receiver, and its one
peer-keyed snapshot offer watcher and transfer-socket `pendingFrames` are not a
CDC admission boundary. Checking `Buffer.length`, taking a pool token, or
changing `_receiver` after `message` would all occur after proportional native
allocation.

The bounded choice is therefore a **MessageRouter-owned CDC coverage lane**
on a dedicated bounded listener, classified during the HTTP/WebSocket upgrade
before ws constructs a Receiver. It remains the same TCP/WebSocket transport
family and ws parser; the separate listener is required so its connection,
header and read-ahead bounds do not become limits on the primary or snapshot
listeners.
It reuses the existing generic bulk connection mechanics -- a separate
per-peer socket, exact boot identity, single ordered send chain, bounded
pending sends and callback/close ownership -- under a distinct typed purpose.
It does not reuse snapshot descriptors, progress markers, staging, retry,
offer routing or semantic authority. Generic connection construction and close
logic are shared rather than copied.

If the server cannot select the CDC receiver and its public ws constructor
options before `WebSocket#setSocket` creates the Receiver, this design is a
STOP. The alternatives -- lowering the primary 100 MiB ceiling, charging every
ordinary message to the CDC pool, mutating ws private fields after upgrade or
writing a second raw WebSocket parser -- are not authorized by this amendment.

Future owner scope for this contract is limited to the current interaction:

- MessageRouter server/dial/upgrade, inbound dispatch, exact close/shutdown,
  transport vocabulary and the generic bulk connection constructor;
- `CdcCoverageTransferOwner`, coverage reconcile/protocol/fragment/source
  adapters and their current cache publication consumer;
- the existing `cdc-source-coverage-reconcile-publication` impact contract,
  extended with the prelane exchange, CDC lane receive lifetime and ordinary
  response isolation endpoints.

No ordinary service, snapshot-transfer, activation, transaction, readiness or
cache authority is added to that scope.

### Wire compatibility, purpose isolation and prelane admission

The lane has one versioned handshake protocol, for example
`lagrange-cdc-coverage-v1`, and one typed purpose `cdc-coverage`. The exact
spelling becomes an owner constant before source work. The HTTP upgrade path
or subprotocol carries only a bounded opaque admission ID and version. It is
correlation, never source, cache or transaction authority. The first
WebSocket frame is a bounded IDENTIFY carrying the existing node ID, node
address and issued boot incarnation plus the same purpose/admission ID. The
existing external-admission and boot-incarnation fences run before adoption.
A stale incarnation, wrong purpose, wrong version or unknown admission ID
closes that socket without touching the primary peer record.

The generic transfer registry is keyed by
`(peerNodeId, purpose, connectionGeneration)`, not peer alone. Snapshot stays
under its existing `bulk`/snapshot purpose, offer watcher, progress marker and
one connection record. Coverage stays under `cdc-coverage`, its own exact
admission token and no durable transfer marker. Replacing or closing one
purpose cannot evict the other or the ordinary primary connection. A peer
without the versioned CDC lane returns typed incompatibility and leaves CDC
debt owed; there is no fallback that sends variable coverage data on the
primary socket.

The versioned capability advertised in the existing bounded node identity
metadata includes the coverage listener address and version. Its fixed field
maxima are part of A. An older peer has no such capability and therefore takes
the typed incompatibility path above. It never guesses a port or sends a probe
to the primary or snapshot listener.

Complete-pair acquisition must not depend on a lane that exists only after the
pair is granted. `Wbase` is therefore withheld from the same configured CDC
pool at owner construction and has two nonborrowable populations:

1. eight fixed-size **A slots**, one per possible root admission, for the
   primary-router lower/upper reservation request, response, retry and retire
   exchange, followed sequentially by the pre-upgrade HTTP request/rejection,
   including bounded native Buffer, string, parsed graph, pending-response
   binding, socket/request object and send copies;
2. eight fixed-size **I slots**, one per possible admitted root, for CDC HTTP
   upgrade/IDENTIFY and the maximum native ingress overlap below.

The number eight is the existing root-session ceiling. A root is one admitted
coverage transfer. Its probe, OFFER, chunks, HELD replies, ACKs and other wire
messages consume subordinate count tokens inside its E unit; they are not
additional roots and cannot consume a ninth A or I slot.

Before the first probe, the reconcile owner reserves the lower complete E
unit locally, then uses one A slot to request the upper complete E unit through
the ordinary primary MessageRouter. The request/reply schemas and escaped
fields have fixed maxima and are preflighted before send. The primary router
continues to dispatch unrelated ordinary traffic normally; Wbase charges only
the actual admission exchange copies, not the primary socket's unrelated
messages or its global 100 MiB limit.

The A message is necessarily classified only after the primary router parses
it. Its preassembly enforcement is the sole trusted node-to-node producer: the
admission send adapter must own the A token and pass exact envelope preflight
before it calls the ordinary send path. The permanently withheld eight A slots
cover that bounded population on the receiver even before type is known. This
does not claim that A bounds an unrelated ordinary frame on the same socket.
Arbitrary peer bytes remain outside the repository's trusted-private-network
contract; adding them would require a separate primary-router resource design.

The upper reservation is exact-idempotent on the existing attempt, lower/upper
node, role, reconcile generation and admission ID. A repeated request returns
the same grant/refusal and never creates a second root. A lost grant response
is redriven by the existing reconcile retry under the original deadline and A
slot. It is never read as refusal. Upper refusal sends its bounded response,
then the lower unit releases before retry and no probe or CDC lane exists. If
the deadline or shutdown wins after an uncertain grant, exact retirement is
redriven; the volatile unadopted upper token remains real pressure until that
retirement or its existing bounded TTL. No new retry loop is created.

The root's A slot does not move to HTTP while a reservation request, response,
retry send, pending binding, native receive callback or deferred parser closure
can still reference the exchange. Normal grant/refusal releases those copies
only after the actual send callback and receive callback-unwind terminal. A
lost response keeps the same A binding across redrive. Thus the primary
exchange and pre-upgrade populations never spend the same 512 KiB slot at the
same time.

Only after both complete units exist does each endpoint atomically bind one I
slot to the exact admission ID and connection generation. The dial request has
one method, one fixed path, one subprotocol value, at most 4 KiB of total
producer header bytes and one bounded client request graph. The dedicated HTTP
server is constructed with `maxHeaderSize = 16 KiB` on the pinned Node runtime,
one eight-connection accept ceiling and an eight-entry listen backlog. Those
are coverage-listener limits only. The client explicitly requests a 64 KiB
socket high-water mark; the dedicated server explicitly uses the same 64 KiB
socket high-water mark. The server validates the admission ID and available
prebound I slot in the HTTP upgrade handler **before** constructing the
coverage WebSocket. An
exhausted, missing, stale or duplicate claim receives a bounded rejection and
the socket closes before a coverage Receiver or application frame exists.
HTTP request/header/head buffers, the client handshake graph and the bounded
rejection write remain in the A/I debit until their callbacks and request/socket
references are gone. A successful upgrade atomically transfers that debit into
the connection's I slot; it does not release and reacquire capacity between
HTTP parsing and ws construction.

The primary and snapshot HTTP maximum header sizes remain unchanged. One root
may own exactly one local coverage endpoint -- accepted or dialed -- and at
most one CONNECTING or OPEN socket at a time. Across local roots the sum of
I-bound accepted and dialed coverage endpoints is at most eight. Independently,
the listener can hold at most eight A-bound prevalidation sockets, so even
eight live outbound endpoints plus eight simultaneous stale or malformed
inbound attempts have an explicit maximum of sixteen local coverage sockets.
Before the dedicated server resumes a newly accepted socket, MessageRouter
synchronously binds a free A slot; without one it destroys the still-paused
socket and emits no HTTP rejection body. The slot owns that socket, request
parser and header graph
through validation, then transfers them atomically to the exact I slot or
keeps them through bounded rejection close. A lost handshake
cannot redial concurrently: it first reaches exact error/close drain or keeps
the same I slot as honest pressure. Duplicate server upgrades for one admission
ID lose the atomic bind and are rejected before Receiver construction. Hence at
most eight local coverage Receivers, eight A-bound inbound request graphs and
eight I-bound outbound client request graphs exist despite subordinate
wire-token count. The last client graph is part of its I slot and releases on
upgrade callback unwind. The primary and snapshot listener counts and payload
support are unchanged.

Both accepted and dialed coverage sockets are constructed with the same public
ws 8.21.0 options:

- `maxPayload = L`, with `L <= 640 KiB`;
- `maxFragments = 4` so a real fragmented input is accepted but a fifth
  fragment closes before entering the fragment array;
- `maxBufferedChunks = 16`, whose array metadata is included in I;
- `perMessageDeflate = false`, so no hidden compressed and inflated copies;
- deferred message delivery, so no second message callback runs in the same
  native turn.

The coverage protocol is stop-and-wait on this lane. At most one application
message is being assembled per connection; the only permitted read-ahead is a
fixed ACK/response/WebSocket-control burst included in R. Queued Wo/H/Wr send
graphs remain charged, but the lane writer does not pass another application
frame to `ws.send` until the prior protocol turn permits it. A sender cadence
that can exceed R is invalid before the lane opens.

The installed ws 8.21.0 receiver copies all three public values into Receiver
at `setSocket`. It checks cumulative payload length immediately after the
frame header and before retaining that frame payload; it checks fragment count
before pushing the next fragment and buffered-chunk count before pushing the
next receiver chunk. These are real pre-push checks. The buffered-chunk option
does not bound bytes in the Node Writable queue. I therefore separately
includes the dedicated socket/HTTP `head`, the one `_write` in progress, the
Writable backpressure queue and socket read-ahead inside R. The client and
server socket high-water marks above must be installed before either socket is
resumed, and startup rejects a runtime whose public constructed values exceed
64 KiB each or whose measured aggregate can exceed R. Merely observing today's
typical chunk size is not enforcement. Source work stops if that public
Node/ws construction seam cannot enforce R.

The lane's variable frame is a binary page-v2 CHUNK: at most the existing
512 KiB `Q` plus a bounded binary header, below L. OFFER, request, HELD,
refusal, FAILED, CANCEL and ACK controls are text frames no larger than
64 KiB after exact escaping. The binary header carries the existing bounded
request/transfer/reconcile identities, ordinal, byte length and digest. This
changes only CHUNK transport encoding: page-v2 bytes and all semantic digest
bytes remain identical. It removes base64/J16 amplification for the variable
chunk without changing supported row size. Sender preflight, its Wo/H token
and the receiver constructor limit independently reject an oversized frame
before proportional application allocation.

### Native and application copy bound

For one I slot define checked safe-integer maxima:

```text
L       = maximum ws message payload (<= 640 KiB)
Lc      = maximum escaped control payload (<= 64 KiB)
R       = enforced HTTP-head/socket/receiver read-ahead bytes (<= 128 KiB)
Mf      = fixed fragment/chunk-array and callback metadata (<= 64 KiB)
Gh      = fixed decoded binary-header graph (<= 64 KiB)
Gc      = maximum parsed control graph storage (<= 2 * Lc + Mf)

Ibinary = fragment roots L + assembled Buffer L + R + Gh + Mf
Itext   = fragment roots Lc + assembled Buffer Lc
          + UTF-16 string 2*Lc + parsed graph Gc + R + Mf
Islot   = max(Ibinary, Itext, handshake/IDENTIFY/rejection peak)
```

With the ceilings above, the owner reserves `Islot = 1.5 MiB`; the full eight
I slots consume 12 MiB. Eight A exchanges, including primary parse/send and
HTTP upgrade objects not already inside I, consume at most 4 MiB. Thus Wbase
is a 16 MiB nonborrowable slice inside, not in addition to, the unchanged
128 MiB pool. Unsafe arithmetic, a larger captured field, an unbounded header,
R above 128 KiB or a runtime coefficient above Islot is a configuration/startup
error. It is not permission to increase the pool, reduce ordinary limits or
silently omit a copy.

For fragmented input ws may retain the fragment roots and allocate a full
concatenated Buffer. For a text control, `data.toString()` and `JSON.parse`
add the string and parsed graph while both native Buffer populations can still
exist. With deferred delivery, ws's scheduled emission closure also holds the
assembled Buffer and local fragment variable during the application callback.
All are explicitly inside I. `MessageRouter` does not call them free when its
handler returns.

Each message gets one exact native token
`(admissionId, connectionGeneration, receiveOrdinal)`. Dispatch records one
pending terminal, then schedules its release on the microtask after the ws
`message` callback has fully unwound. At that boundary the receiver has reset
its fragment state, the deferred emitter closure has returned, and handler
locals have dropped Buffer/string/graph references. If a downstream consumer
retains the assembled binary Buffer or parsed result, the same operation
transfers that exact object and its measured subcredit into the already owned
WiPending/C/Pr claim; it releases only I scratch and fragment/read-ahead
credit. A copy remains charged in both accounts until the old reference is
dropped. Queueing a microtask, handler return, ACK or semantic settlement alone
is not release proof.

The consumer allocation is also made executable rather than relying on a
hidden chunk array. It preallocates one admitted P buffer, copies each verified
binary Q directly into its final offset, and drops the current Wi Buffer before
requesting the next ordinal. At completion P coexists with the decoded typed
row A. The source reads admitted large TEXT as bounded SQLite BLOB buffers,
encodes once into P and drops the raw buffers; it does not materialize a second
whole escaped string. Cache staging transfers the immutable decoded row object
into the final map and notification records reference that same immutable row;
they do not deep-clone its proportional strings. Every actual deviation is an
additional C/K/S copy and must fit the same preowned unit.

### Classify, dispatch and release

Handshake purpose is the preassembly demultiplexer. Ordinary IDENTIFY,
PING/PONG, ACK, SERVICE_RESPONSE and SERVICE_MESSAGE frames remain on the
primary connection and execute the existing common parser and pending ledger.
Snapshot frames remain on the snapshot bulk purpose. Neither population is
charged to Wbase or subject to L. Conversely, after the CDC lane IDENTIFY no
ordinary or snapshot message is valid on that lane.

Coverage controls are parsed under I, validated as own canonical records and
then dispatched through the existing MessageRouter service handler and pending
response ledger. A live exact response atomically transfers its retained graph
from I to the already debited WiPending, Pr or C. A retired exact response uses
the old router-owned WiPending token, is classified by the existing retired
pending-response owner and drops without touching a successor. An orphan,
wrong kind or ordinary-looking message on the CDC lane is a protocol violation:
it is logged with bounded fields, the lane closes, semantic debt remains and I
releases only after native unwind/drain. That rule cannot drop an ordinary
message because ordinary send APIs never select the CDC purpose; a simultaneous
ordinary SERVICE_RESPONSE on the primary connection still settles its own
waiter normally.

Binary CHUNK validation reads the fixed header before allocating or copying Q,
checks exact pending request, connection/admission generation, source and
recipient lifecycle, transfer ID, ordinal, declared length and digest shape,
then requires the remaining bytes to equal that length. Only then may it copy
into preallocated P. A malformed header, length/digest mismatch, fifth
fragment, buffered-chunk-count excess or payload above L closes the exact lane.
No offending variable value is reflected in a response. Native bytes already
received stay in I until receiver error/close and callback-unwind proof; the
unread remainder is never assigned to C.

### Complete receive and release timeline

| Phase | Actual simultaneous ownership | Exact transition or terminal |
| --- | --- | --- |
| 0 Wbase construction | Eight A slots and eight I slots, 16 MiB total, unavailable to data roots | Exists before any root or primary admission message; released only when the transfer owner and router have both shut down and every bound callback/socket is drained. |
| 1 lower reservation | Lower full E unit plus one A exchange token; no probe, row or coverage socket | Local atomic debit. Opposite transfers use the same node ordering. |
| 2 upper request/reply | Lower E; primary sender frame/socket copy; receiver fragments/assembled Buffer/string/parsed admission graph; upper exact E on grant; bounded reply and pending binding | All admission copies are A. Refusal/lost-grant/retry follows exact idempotent identity. Upper refusal releases lower after reply custody transfers. |
| 3 CDC upgrade | Both E units; dial header/client graph; server HTTP request/header/head; prebound I slots | Server validates token before Receiver construction. Reject drains HTTP/socket refs. Success transfers A/upgrade custody to exact connection I without a gap. |
| 4 IDENTIFY | I owns bounded native fragments, assembled Buffer, string, parsed graph and deferred emitter closure | Existing admission/incarnation fences adopt or close. Native scratch releases after callback-unwind microtask, not on handler return. |
| 5 probe/OFFER/control | Complete units remain; exact Wo/H/Wr sender custody; receiver I may coexist with WiPending/Pr/C and source callbacks | Parsed exact graph transfers only into its preowned pending/consumer claim. Ordinary primary responses dispatch independently. |
| 6 fragmented binary CHUNK | Source S/P and possible H send copy; recipient I owns fragments + assembled Buffer + read-ahead + closure while preallocated C/P and earlier bytes remain | Header/length/digest validates before copy. Copy into final P, drop input, then microtask transfers/releases exact native credit. Next request is not emitted before this terminal. |
| 7 late/unmatched input | Old router WiPending plus current I; successor E/WiPending remains separate | Exact late response consumes old token and drops. Orphan/wrong-purpose closes lane. Waiter expiry and source callback release neither I nor old WiPending. |
| 8 semantic completion | Installed cache fact may coexist with H/Wr send, old WiPending, Knotify and connection I | Unused E credit releases; external tokens drain under their owners. Semantic completion is not socket/native release. |
| 9 close/shutdown | Receiver fragments/buffers, HTTP head, deferred callbacks, pending graphs and sends remain charged if still referenced | Stop new frames, detach consumers, drain/error receiver and pending ledger, run callback-unwind terminals, then release each exact token once. Close observation alone is insufficient. |

Socket error before any application frame releases no semantic obligation. A
synchronous upgrade/send refusal releases only objects proven uncreated. If a
response never arrives and the exact lane never closes, its WiPending and lane
slot remain honest pressure. Shutdown first prevents new admission, then drains
coverage lanes, then primary admission exchanges, and only then releases Wbase.
An old callback or close is keyed to its connection generation and cannot
release a replacement lane, root or waiter.

### Conservative feasibility in the unchanged pool

The constructor ceilings make the native term finite before source
measurement. They also leave a conservative completing unit inside the current
pool. Let `P8 = 8 MiB`, and let the required large-row control be one page-v2
payload of `Pbig = 16 MiB + 1 byte`. For the allocation plan above, checked
ceilings are:

```text
Wbase                         <= 16 MiB
S (raw BLOB + one encoded P)  <= 2*Pbig + 2*Q + 1 MiB  <= 34 MiB + 2 bytes
H (one binary send overlap)   <= 2 MiB
C (one P + worst 2*P row)     <= 3*Pbig + 1 MiB        <= 49 MiB + 3 bytes
K metadata/queue structures   <= 16 MiB
Ps+Pr+WiPending+Wo+Wr fixed
  probe/control population    <= 8 MiB
--------------------------------------------------------------------------
colocated conservative peak   < 126 MiB
```

K's 16 MiB is transient maps/atoms/queue metadata; the proportional decoded
row is transferred from C and shared immutably by the installed map and
notification record, not copied and called free. H excludes the source P
subarray alias but includes every actual frame/socket copy. Wbase includes all
eight native slots even though the large pair may be the only byte-affordable
root. The remaining margin is not available to justify an omitted runtime
coefficient.

Substituting P8 lowers S to at most 18 MiB and C to at most 25 MiB, so the
supported 8 MiB colocation control has more than the large-row margin. A remote
transfer holds only its source or recipient role subset at each node and is no
larger. Both remote node orders reserve these same role totals lower then upper;
colocation reserves their union atomically. The root-session ceiling remains
eight, while subordinate wire-message tokens are finite counts inside the
admitted unit. No limit is raised and no supported ordinary frame is narrowed.

The 34/49/16/8 MiB ceilings are obligations on the implementation, not claims
about the current source. Before source approval, measured page framing,
SQLite/V8 string width, object/map metadata, ws fragment/concat behavior,
socket read-ahead, send copies and control-message count must be at or below
them on the pinned runtime. If any measured coefficient exceeds its ceiling,
the source is refused and the owner must reduce a real copy or return for an
explicit capacity/contract decision. It may not raise 128 MiB, reduce the
8 MiB or greater-than-16-MiB controls, relabel native allocation as free, or
borrow ordinary/snapshot capacity.

### Required paired evidence

The future source candidate must exercise the actual public ws constructors
and one interaction, not a stub:

1. inspect both accepted and dialed coverage Receivers before data and prove
   L, fragment count, buffered-chunk count, compression and enforced R; show
   the primary 100 MiB behavior and snapshot purpose remain unchanged;
2. hold a fragmented binary CHUNK so fragment roots, concatenated Buffer,
   deferred emitter closure, recipient P and source callback overlap; observe
   I until callback unwind and exactly-once transfer/release afterward;
3. run a coverage response and an ordinary primary SERVICE_RESPONSE
   concurrently; each settles only its own waiter, while a wrong-purpose frame
   closes only the CDC lane;
4. cover A/I exhaustion, malformed/oversized/fifth-fragment input, unknown or
   stale admission, lost upper grant/reply, late input after generation
   retirement, exact close and router shutdown without successor-token reuse;
5. repeat complete lower/upper acquisition in both node orders and colocation,
   one byte and one count below refusal, supported 8 MiB, `16 MiB + 1 byte`,
   N+1-before-callback-N and the bounded HELD/error/ACK overlap, all under the
   unchanged deadline, cadence, 128 MiB and eight-root ceilings;
6. prove snapshot offer routing/progress markers and ordinary connection
   adoption/close are unaffected, and update the existing owner-impact witness
   rather than creating a second transport interaction contract.

This is still design only. It does not approve transport, coverage, cache,
metadata or test source, and does not reopen the closed caller correction at
`2de419483c9b4ce9e3fabc87bb54d93e4afb8817`.

## D15-D17 receiver conservation, native profile HOLD and listener-owner correction

The exact D14 subject above is preserved at
`evidence/cdc-coverage-response-resource-handoff-amendment-round7-cb751525.md`,
SHA-256
`cb751525eb7772fc36203b6fa6aecea2b895cd1aa5e714437bb2e2db4143bc38`.
This section answers the complete grouped findings in
`review-cdc-c17-resource-round7-checkpoint.md`, SHA-256
`467259864cc8627b5dcb4262bb3f0f484671751e2fecdd788533dc35f7943107`.
It supersedes only these D14 clauses:

- pair admission no longer uses an A-backed request on the ordinary primary
  connection;
- A is receiver-only coverage-listener admission, never a sender credit;
- the 64 KiB high-water marks do not establish R; the audited native profile
  and strict lane turn below establish the only proposed bound, while source
  remains HOLD until those constraints are enforced;
- the coverage listener is a fourth endpoint of the existing listener-port
  owner and production deployment contract, not an independently chosen
  MessageRouter port.

The dedicated purpose, ordinary/snapshot isolation, unchanged 128 MiB pool and
eight-root ceiling, complete lower-then-upper units before the first probe,
atomic colocation union, fixed shared-generation deadline/cadence, exact
idempotent acquisition, disjoint copy ownership and actual last-reference
release remain authoritative. The approved caller source at
`2de419483c9b4ce9e3fabc87bb54d93e4afb8817` remains closed.

### D15: receiver-owned admission and whole-pair acquisition

`Wbase` retains the same 16 MiB total, but its populations have a corrected,
non-overlapping meaning:

```text
Aactive = eight receiver-only pre-HTTP cells, 448 KiB each = 3.5 MiB
Adrop   = one receiver-only dropped-handle/record reserve = 0.5 MiB
Aaccept = Aactive + Adrop = 4 MiB
Ilane   = eight local dialed/accepted lane cells, 1.5 MiB each = 12 MiB
Wbase   = Aaccept + Ilane = 16 MiB
```

Ilane is statically partitioned into four `Iout` dial cells and four `Iin`
accepted cells. Neither direction borrows the other's cells, including while a
connect, refusal, close or late callback is unresolved. The partition changes
concurrent lane direction, not the eight-root limit or any byte/message size;
additional same-direction attempts retain durable debt and do not construct a
Socket until a direction cell drains.

An outbound peer never spends its local Aaccept cell as evidence of capacity at
another node. Its client request graph, dial socket and connection attempt are
charged to its local Ilane cell. The receiving node's Aaccept population alone
backs accepted Socket, HTTP parser/request/header/head, bounded rejection and
pre-upgrade callbacks. A successful upgrade atomically moves the accepted
socket from that Aaccept cell into a free local Ilane cell; only after every A
reference drains may the A cell admit another socket. No sender and receiver
claim names the same bytes.

The dedicated coverage HTTP server is the public preparse count gate. The
existing MessageRouter listener owner constructs it, sets the inherited public
`net.Server.pauseOnConnect = true` before `listen()`, prepends its admission
`connection` listener before any application listener, sets
`maxConnections = 8`, and listens with backlog eight. In pinned Node 22,
`net.Server` checks `maxConnections` before constructing the JavaScript Socket.
For an admitted handle it constructs the Socket paused, then emits
`connection`. The prepended owner listener binds one of the already withheld
Aaccept cells while the socket is still paused. The HTTP connection listener
may create its fixed parser only inside that claim. MessageRouter resumes the
socket only after the claim is recorded.

When eight accepted connections already exist, the Node server closes the next
native client handle in the max-connection branch before constructing a
JavaScript Socket, HTTP parser or readable Buffer. The pinned Unix libuv
`uv__server_io` performs one accept per listener I/O callback; `Adrop` is
reserved even when all eight Aactive cells are bound and owns that current
fixed handle plus bounded `drop` record through native close. The eight-entry
listen backlog is an OS connection-queue setting, not application byte credit
and not part of the 128 MiB proof. Adrop's fixed native coefficient must be
verified before source approval. A
dropped dial remains charged to the caller's Ilane cell until its connect
error/close callback drains. It keeps CDC debt and uses the existing reconcile
cadence and original deadline; the listener creates no queue, lease, timer or
retry owner.

This is receiver conservation rather than a postparse guard: the ninth
compliant peer cannot allocate a ninth Socket/request/message population at the
target. It can make bounded progress only after one admitted connection reaches
close/drain and frees the target count. More than eight peers can therefore
contend truthfully: up to eight target connections are admitted, up to four
accepted lanes can be upgraded concurrently, all other dialers retain local
Ilane pressure, and completed roots make capacity available. An
ordinary `SERVICE_RESPONSE` on the primary connection is outside these cells
and continues through the existing parser and pending ledger.

The opposing-direction conservation is explicit. Let `Id` be locally dialed
I lanes, `Ia` accepted lanes already transferred into I, and `Ap` accepted
paused/pre-upgrade sockets still in Aactive. The owner enforces, before each
transition:

```text
Id      <= 4                 (nonborrowable local Iout cells)
Ia      <= 4                 (nonborrowable local Iin cells)
Id + Ia <= 8                 (all local Ilane cells)
Ia + Ap <= 8                 (coverage server maxConnections)
Ap      <= 8                 (receiver Aactive cells)
Id + Ia + Ap <= 12           (local coverage Sockets)
```

Dial reserves Iout before constructing the client Socket. Accept consumes A
before HTTP read. Upgrade is one atomic `A -> Iin` CAS: it succeeds only if
`Ia < 4`, increments Ia and releases A after HTTP callback drain; otherwise
it sends the bounded refusal and closes entirely under A. Therefore eight
prevalidation sockets may coexist with four outbound lanes but only four may
upgrade; four accepted Iin lanes never consume the four Iout cells; and every
mixed split obeys all inequalities.
An old generation occupies its I term until exact close drain, so a replacement
cannot use semantic retirement to exceed the equations.

The partition removes opposing-connect livelock. If nodes A and B each have
four Iout cells occupied by CONNECTING attempts, each still has four reserved
Iin cells. Each can accept and upgrade the other's attempts; admitted work
therefore reaches pair acquisition instead of both sides refusing in lockstep.
With more peers, at least the four accepted lanes per target can perform useful
work while excess dialers remain charged locally. Completion drains exact Iin
and Iout cells, and the existing reconcile cadence selects later attempts; no
new fairness timer, connection auction or retry queue is introduced.

The pair reservation moves entirely onto this preadmitted coverage connection.
No primary admission request or response remains:

1. The reconcile initiator first binds one local Iout cell. If it owns the
   stable lower endpoint, it also atomically acquires the lower complete E unit
   before dialing. If the lower endpoint is remote, it has no E unit yet.
2. The remote listener admits the paused socket under Aaccept, validates the
   fixed version, admission ID, endpoint roles and boot incarnation, then must
   bind a remote Iin cell before constructing a coverage Receiver. Refusal
   keeps Aaccept through the actual bounded HTTP write callback and socket
   drain. Success transfers Aaccept to Ilane without a free interval.
3. If the initiator owns the lower endpoint, its first exact lane control asks
   the remote upper endpoint to acquire the upper complete E unit. If the
   initiator is upper, its first exact lane control asks the remote lower
   endpoint to acquire the lower complete E unit; only after that exact grant
   does it acquire its local upper complete E unit. Thus a reconcile recipient
   that is upper can acquire a remote source/lower unit without pretending the
   remote pool was debited locally.
4. A remote refusal releases an already held lower unit, after the refusal's
   transport custody drains, without a probe. If local upper acquisition fails
   after a remote lower grant, the exact cancel/retire is sent on the same lane;
   the remote lower remains honest pressure until that terminal is received or
   recovered by the existing idempotent reconcile redrive. Colocation still
   atomically acquires the lower-plus-upper union and does not open a lane.
5. Only the exact lower grant followed by the exact upper grant creates the
   complete pair. Only then may the single probe be emitted.

A duplicate reservation on the same connection and generation returns the same
exact grant/refusal under the already charged Ilane/control population. A lost
answer is redriven on that connection. A replacement connection is forbidden
until the old generation's receive, send and close callbacks have drained; its
idempotent request may then recover the same uncertain remote grant. Late old
answers remain in the old MessageRouter WiPending/Ilane custody and cannot
release or authorize the replacement. Physical duplicate input is therefore
counted even when it cannot create a duplicate semantic root.

### D16: audited native receive profile and explicit source HOLD

The earlier inference that two 64 KiB high-water marks derive
`R <= 128 KiB` is withdrawn. A high-water mark is a backpressure threshold
after enqueue and is not part of the proof below.

The public `net.Socket({onread: {buffer, callback}})` option was examined as a
possible fixed-buffer seam. A dialed ws client can supply a public
`createConnection` function that constructs such a Socket. The callback,
however, receives bytes instead of Node's Readable path, so adapting it back to
ws would require a new stream bridge. More importantly, public `net.Server`
constructs accepted Sockets itself and has no accepted-socket constructor or
`onread` option. Retrofitting `onread` requires the private accepted handle.
The design therefore does not use `onread`, a bridge or private fields.

A complete bound is instead available only as an **audited native receive
profile**, which is an explicit runtime/deployment compatibility change rather
than a claim about every runtime allowed by the current `>=22.12.0` package
engine range. The reviewed profile is the official Node v22.23.2 build with
libuv 1.51.0 and installed ws 8.21.0 on Linux x64. The retained research
manifest is
`evidence/cdc-native-allocation-research-20261011T1950/research-manifest.json`,
SHA-256
`9e7db3759806da245390d3a887f32a0f27fe42f54daf910554e078265fe9b730`;
the observed executable SHA-256 is
`3517c2df0b2f8cd7f422b4b8450ef81c6889f08eb03e281d6de9079b15e6a327`.
Its pinned, license-retained sources establish:

1. libuv 1.51.0's Unix TCP read loop calls the allocation callback with exactly
   64 KiB and performs no more than 32 reads in one loop turn;
2. Node's ordinary stream listener forwards that suggestion to
   `Environment::allocate_managed_buffer`, which allocates an exact-size
   BackingStore; for a short read `EmitToJSStreamListener::OnStreamRead`
   allocates an exact-`nread` BackingStore, copies into it, and retains at most
   one additional 64 KiB managed read backing until the synchronous JS read
   callback returns;
3. Node's HTTP parser listener uses one 64 KiB parser buffer, or one 64 KiB
   malloc buffer while the shared parser buffer is in use, and releases/resets
   that read buffer at its scope terminal; its upgrade `GetCurrentBuffer`
   copies only the actual current `nread` bytes;
4. ws 8.21.0 applies `maxPayload`, `maxFragments` and
   `maxBufferedChunks` before their respective pushes, pauses the Socket after
   `Receiver.write()` returns false, and retains the already described input
   while a deferred message event is pending.

Relying on pinned implementation is different from mutating private fields.
MessageRouter uses only public Node/http/ws construction and pause APIs. The
native-source facts above are part of the certified artifact profile and must
be re-reviewed for any Node, libuv, ws, platform or build change.

The transport owner supplies the missing burst relation, and the receiver
enforces it before MessageRouter dispatch. Coverage is one **lane-wide
half-duplex application turn**, not one turn independently in each direction:

- exactly one application message may be passed to `ws.send` for the turn;
- a binary turn has at most four fragments and total payload `L <= 640 KiB`;
  a text/control turn has one frame and payload `Lc <= 64 KiB`;
- `autoPong = false` on accepted and dialed ws constructors; coverage code does
  not expose `ping()` or `pong()` and treats either inbound opcode as a protocol
  violation;
- before the exact turn release, the only additional wire frame permitted from
  that sender is one terminal CLOSE with payload at most 125 bytes;
- the exact response to a request is its receipt and is the next lane turn. A
  one-way message instead receives one fixed receipt-only ACK as that next
  turn. The receipt is emitted only after the receive terminal below and
  cannot share the preceding sender's turn. A receipt-only ACK is never itself
  acknowledged: after its send terminal and peer receive-callback unwind, the
  lane token returns to the prior sender. Pair reservation, probe, OFFER,
  HELD, retry and ordinal messages obey the same token; none is an exempt
  burst.

The sender adapter owns the lane turn before its first `ws.send`, counts frame
payload and fragmentation, and refuses a second send call while the peer owns
the next response/receipt turn. A request/response terminal or the terminal
receipt-only ACK returns the token; terminal close retires it. This is the
producer stop before native allocation. It uses the existing MessageRouter
send chain and reconcile cadence; it is not another queue, timer or retry
owner.

The accepted and dialed coverage WebSockets also install one synchronous
lane-admission adapter as their sole ws `message` listener. On the first
expected emitter it atomically changes the lane from `receiving` to
`receive-occupied` before returning, then calls the existing MessageRouter
input entry with exactly that Buffer. A second emitter while occupied never
reaches a separate router listener: the adapter does not convert it to string,
parse, correlate, queue it as WiPending or create a router microtask. The gate
records one fixed protocol violation, calls the public `terminate()` operation
once and synchronously drops every later view emitted from the already
delivered native chunk. It does not drop ordinary traffic: the handshake has
already classified this as the dedicated coverage purpose, while primary and
snapshot WebSockets retain their existing listeners and contracts. Socket
`pause()` is not the enforcement claim, because it cannot stop ws from
resuming `startLoop(cb)` over bytes already delivered.

For the binary maximum, the complete permitted incoming wire population before
release is:

```text
application payload                         <= L = 640 KiB
four masked WebSocket frame headers         <= 4 * 14 = 56 bytes
one terminal masked CLOSE frame             <= 14 + 125 = 139 bytes
Twire                                       <= L + 195 bytes
```

The same bound covers an unmasked direction because its frame headers are
smaller. A control turn is strictly smaller. The initiator cannot send its
first WebSocket turn until the HTTP 101/open terminal, and the acceptor cannot
send an application frame before exact IDENTIFY, so a valid upgrade has
`head.length === 0`. A nonempty `head` is rejected under Aaccept before
Receiver construction. Thus HTTP input never coalesces with the first ws turn.
The 64 KiB HTTP parser allocation and its at-most-64-KiB current-buffer copy
remain in Aaccept
for an accepted endpoint and in the handshake phase of Ilane for a dialed
endpoint; neither overlaps that endpoint's maximum data-phase population.

For one valid data turn, every retained ordinary Socket backing root after its
read callback has total length at most `Twire`: full reads retain one exact
64 KiB root and a short read retains an exact-`nread` root. During the current
read callback there can additionally be one transient 64 KiB managed backing.
There is no permitted next application frame. The optional CLOSE and all
frame-header bytes are the 195 bytes already included in `Twire`. The ws
Writable's current and queued views alias those same roots; they are not called
free, but they are not additional backing allocations.

No read-count inference is made from `Twire`. The pre-push
`maxBufferedChunks = 16` check bounds retained ws input-array entries. If TCP
segmentation would require a seventeenth entry, that seventeenth current input
and its callback metadata are charged before the typed close/refusal and are
never pushed. Likewise, if a peer sends bytes after its permitted message, one
current native read of at most 64 KiB may coexist with the complete message
and is charged as `Xcurrent` below. The current managed backing and, for a
short read, its transient 64 KiB source copy are both retained through callback
unwind. The source witness must demonstrate the supported 640 KiB/four-frame
turn over real accepted and dialed sockets within sixteen retained entries;
more fragmented transport delivery is a bounded refusal, never an uncounted
seventeenth root.

When ws concatenates four fragments, the roots covering at most `Twire` can
coexist with one assembled Buffer of at most L. After the message event, ws may
call `startLoop(cb)` before the router microtask. For a compliant turn it sees
only the already counted CLOSE. For stale, malformed or hostile extra input,
the synchronous lane gate rejects every second emitter without parse or
deferred router work; at most one ws deferred-emitter closure exists because
the Receiver processes its Writable serially. The residual current root is
`Xcurrent`, and no further native read is admitted after synchronous
termination. The close/error path retains that counted population until its
callbacks drain. Release waits for all of:

1. the ws message callback returns;
2. ws's enclosing deferred emitter calls `startLoop(cb)` and returns;
3. a queued MessageRouter microtask observes no retained downstream reference;
4. any CLOSE/error Receiver callback and Socket read/write close callback
   drains.

If the application keeps the assembled Buffer or decoded graph, exact custody
moves into preowned WiPending/C/Pr before I scratch is released. An alias never
releases its backing root. Old and replacement generations keep distinct I
cells until their own terminals.

The existing 1.5 MiB Ilane ceiling now has a source-derived meaning. D16
narrows D14's provisional 64 KiB `Mf` allowance to an enforced 48 KiB
`Mlane` cap covering all fixed Socket/Receiver/turn/fragment-array/callback
objects, including the current refused entry. This changes no payload, row or
four-fragment support:

```text
fragment/current/queued roots     <= L + 195 bytes
assembled/consume output          <= L
refused or post-turn Xcurrent      <= 64 KiB
transient managed read backing    <= 64 KiB
binary header graph Gh             <= 64 KiB
fixed lane metadata Mlane          <= 48 KiB
----------------------------------------------------
binary refusal maximum             <= 1,520 KiB + 195 bytes
Ilane                               = 1,536 KiB
remaining checked margin           >= 15 KiB + 829 bytes
```

The two `L` populations cover both proportional peaks: raw/fragment inputs
while `consume()` constructs a fragment, and fragments while final concat
constructs the assembled Buffer. `Xcurrent` covers a residual or violating
tail already delivered in the same native read; it is not mislabeled as free
because the sender was noncompliant. On paths without such a tail that slot is
unused. The 48 KiB `Mlane` cap is a required certified coefficient derived from
the fixed object and entry counts, not a typical heap measurement. If the
retained-graph census for the pinned artifact exceeds it, that artifact cannot
be certified and startup remains refused; runtime traffic never allocates the
graph first and asks the pool to forgive an excess afterward.

The text path is smaller even with the assembled Buffer, UTF-16 string and
bounded parsed graph. Each 448 KiB Aactive cell separately covers its one 64 KiB
HTTP parser read buffer, upgrade current-buffer copy no larger than 64 KiB
(the valid header is at most 16 KiB and valid `head` is empty), paused
Socket/request/parser graphs and bounded rejection write. Adrop separately owns
the pre-Socket native handle and bounded drop record at exhausted admission.
Nothing in this derivation uses the high-water mark as an allocation cap.

This is an executable bound only if the audited profile is an enforced owner
contract. The current repository does not yet enforce it: `package.json`
accepts other Node 22 builds and `node:22-slim` can move between patch/runtime
implementations. Therefore resource source remains **HOLD** until the existing
runtime and deployment owners choose and record the profile, pin the production
image by immutable digest, use the exact runtime in CI/source evidence, and
fail startup before binding/publishing the coverage listener when
`process.versions.node`, `process.versions.uv`, platform/architecture or the
certified artifact identity differs. Unsupported runtime refusal leaves CDC
debt owed and prevents readiness that depends on recovery; it does not disable
only accounting while continuing traffic.

A different supported runtime can replace this profile only after the same
native allocation, HTTP parser, turn reentry and close-drain proof fits the
unchanged 1.5 MiB Ilane cell. No measurement of typical chunks, HWM assertion,
raw parser, private ws mutation, new native framework, larger Wbase/pool or
smaller supported row can satisfy this HOLD.

### D17: fourth endpoint under the existing listener-port owner

The coverage endpoint is added to `src/config/listener-port-model.js`; it is not
chosen inside MessageRouter. The existing four-port resolution becomes:

```text
REST API                 explicit or 8080
admin WebSocket           explicit or REST + 1
transport WebSocket       explicit or REST + 2
CDC coverage WebSocket    explicit or REST + 3
```

The canonical configuration key is `node.cdcCoverageWsPort`, the environment
name is `CDC_COVERAGE_WS_PORT`, and the chart value is
`node.cdcCoverageWsPort`. All four values must be integers from 1 through 65535
and pairwise distinct. An explicit coverage override avoids evaluating an
unused overflowing REST+3 derivation, matching the existing override rule. Its
bind host is the existing transport WebSocket host; it has no independent
fallback host. Address derivation replaces only the REST port with the resolved
coverage port and preserves the stable advertised hostname and ws/wss scheme.

The existing configuration manager resolves and validates the fourth port in
the same atomic port model before MessageRouter construction. Command/help and
document consumers use that canonical model. Helm mirrors the same default,
overflow and four-way collision checks; passes `CDC_COVERAGE_WS_PORT`; declares
one `cdc-coverage-ws` container port; and exposes that named port on the
headless Service. `publishNotReadyAddresses: true` continues to make the stable
per-pod DNS endpoint reachable during recovery before readiness. Seed and
joiner StatefulSets consume the shared helper, so neither invents a port.

The audited receive profile is also a production dependency of this listener,
not an ambient developer-machine assumption. The existing runtime/image owners
must either make Linux x64 Node v22.23.2/libuv 1.51.0 and the certified
executable/container digest the coverage-capable artifact, or certify another
profile with the same bound. Helm may expose the port only for that artifact.
Configuration/startup compares the running profile with the artifact's
immutable expected identity before Wbase/listener construction and fails the
coverage-dependent node startup on mismatch. The current broad package engine
range remains evidence that this choice is unimplemented; it is not silently
reinterpreted as already supporting coverage on every allowed Node 22 build.

Startup and publication remain owned by MessageRouter's existing server
lifecycle:

1. Configuration validates the certified runtime/artifact profile and resolves
   all four endpoints before any bind.
2. MessageRouter constructs Wbase and the stopped/paused coverage listener,
   binds it, installs its admission handlers and awaits `listening`.
3. Only after that bind succeeds may it start the ordinary transport listener,
   establish self transport and publish the versioned coverage capability with
   the resolved advertised address and current boot/connection generation.
4. A coverage bind/collision failure fails router initialization and closes any
   listener already started. A later ordinary/self-start failure withdraws the
   unpublished capability and closes the coverage listener. No readiness fact
   may be published from a partial start.
5. An older peer or a peer without the capability retains typed CDC debt. A
   temporarily stopped listener produces the same retryable unavailable result;
   neither condition falls back to the primary or snapshot lane.

Shutdown first sets MessageRouter shutting-down and withdraws the capability so
no new dial begins. It closes the coverage listening handle, prevents new
Aaccept/I binding, terminates or drains coverage sockets, waits for HTTP heads,
ws receivers, pending ledger entries, send callbacks, deferred callbacks and
old-generation close terminals, and only then releases the exact A/I cells and
Wbase. It then closes bulk/snapshot and ordinary listeners through the existing
shutdown owner. Restart reuses the configured stable address but publishes a
new boot/connection generation; no old admission ID or callback can bind or
release the new listener.

### Complete corrected interaction and current gate

| Phase | Conserved ownership and action | Terminal or gate |
| --- | --- | --- |
| 0 configure/start | Existing runtime/deployment owner validates the certified native profile; port owner validates four distinct ports; PO withholds 4 MiB Aaccept plus 12 MiB Ilane; MessageRouter binds paused coverage listener before publishing capability | Runtime mismatch or bind failure unwinds startup; no capability/readiness is published. Current source is HOLD until profile enforcement exists. |
| 1 initial dial | Initiator binds one local Iout cell; if local is lower, it also acquires lower E | Dial failure retains debt until connect/error callback drains, then existing cadence may retry. |
| 2 receiver admission | `maxConnections=8` gates before JS Socket; admitted Socket is born paused and bound to receiver Aaccept before HTTP reads | Ninth peer is dropped before Socket/parser/Buffer; accepted refusal holds A through write/close drain. |
| 3 upgrade | Fixed HTTP/version/incarnation/admission fields validate under A; `head` must be empty; accepted endpoint atomically acquires Iin before Receiver construction | A releases only after transfer and all HTTP refs drain. Audited-profile source enforcement is required before resume. |
| 4 whole pair | Local-lower path asks remote upper; remote-lower path reserves remote lower then local upper; colocation takes atomic union | Refusal/cancel releases lower after transport custody; no probe exists until both full units exist. |
| 5 single probe | Ps/Pr and both complete E units are already owned | Upper refusal never reaches this phase; original deadline/cadence remains. |
| 6 full transfer | Audited Ilane owns native roots, fragments, assembled Buffer, possible 64 KiB refused/post-turn current input, transient 64 KiB backing, emitter/close overlap and exact turn state; S/H/C/K/Wi/Wo/Wr remain disjoint | One application message plus optional terminal CLOSE; exact response or receipt-only ACK occupies the next turn and returns the token only at its terminal. |
| 7 publication | Preallocated P becomes decoded immutable row; cache final fence installs exact fact; notification shares the immutable record | Semantic success releases neither late WiPending nor native/send/notification holds. |
| 8 last release | Late exact input transfers/drops under old MessageRouter custody; sends drain; emitter/close callbacks unwind; Knotify runs/drops | Each identity releases once; old generation cannot release successor A/I/E. Wbase releases only after router shutdown drain. |

Both node orders use the same receiver admission: the reconcile initiator may
own lower or upper, but remote contact always enters the target through its
Aaccept gate. Colocation uses no socket and reserves the exact role union. With
nine or more compliant peers, at most eight accepted connections exist at the
target and at most four concurrently upgrade into the reserved Iin partition;
refused/dropped dialers retain their own Ilane/debt and cannot consume target
parsers. Even when both nodes fill all four Iout cells, their four Iin cells
remain available, so an admitted connection can reserve a pair and finish.
This establishes count conservation and useful progress as admitted roots
finish. Byte feasibility for the native lane is
derived only for the audited profile and strict turn relation above.
Whole-operation feasibility remains source HOLD until that profile and the
existing S/H/C/K implementation coefficients are enforced; no constant is
raised to manufacture a pass.

### Cumulative decision matrix and required evidence

| Item | Effective disposition after this section |
| --- | --- |
| D1-D8 | Envelope arithmetic, H/continuation, exact pair CAS, Knotify, canonical comparison, disjoint S/H/C/K and digest clauses remain unchanged. |
| D9-D10 | Stable lower-then-upper acquisition, colocation union, Ps/Pr and one probe remain; the first remote acquisition now uses receiver-admitted lane control. |
| D11-D13 | Old WiPending, exact late-input custody, control/refusal/ACK overlap, original deadline and bounded cadence remain. |
| D14 | Dedicated purpose before Receiver, ordinary/snapshot isolation, binary Q and exact native lifetime categories remain; HWM is removed as proof and replaced by the D16 audited allocation/turn derivation. |
| D15 | Closed at design level by receiver-only Aaccept, pre-HTTP paused admission, max-eight accepted population and lane-based pair reservation in both node orders. |
| D16 | Design bound exists only for the audited Linux x64 Node v22.23.2/libuv 1.51.0/ws 8.21.0 artifact and strict half-duplex turn. Source remains HOLD because the repository currently permits unprofiled runtimes and does not enforce the turn/profile contract. |
| D17 | Closed at design level by the existing listener-port/configuration/Helm/headless/MessageRouter startup-shutdown owner path. |
| N1/N2 | Caller source `2de419...` remains approved and closed; no caller/shared deadline is changed. |

A future source review must first enforce and independently verify the D16
audited profile and turn bound in the existing Ilane cell. The cumulative witness then
must include: more than eight compliant peer dialers; one admitted completion;
a refused and duplicate reservation; lost grant and delayed send/close
callbacks; remote-lower and remote-upper acquisition; colocation; concurrent
ordinary `SERVICE_RESPONSE`; exact-capacity and below-capacity counts;
strict half-duplex maximum binary turn plus optional terminal CLOSE and a
receipt-only ACK in its separate next turn; unique backing roots, HTTP head,
current/queued/refused input, old/new emitter and close drain; 8 MiB
and greater-than-16-MiB supported rows; port override/default/collision/bind
failure; seed/joiner Helm exposure; restart and shutdown withdrawal. These are
future evidence gates, not source or deployment approval in this amendment.
