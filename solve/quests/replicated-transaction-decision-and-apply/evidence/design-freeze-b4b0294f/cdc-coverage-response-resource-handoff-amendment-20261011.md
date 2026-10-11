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

## D15-D20 effective receiver, router-ledger and listener contract

The exact previous subject is preserved at
`evidence/cdc-resource-round8-navigation/subject-997318ab.md`, SHA-256
`997318ab70d6ce4c8409e20e5d7b2f1ea307f364a530ac875775c85c6cad5590`.
This effective section answers D15-D20 together from the round-eight report,
SHA-256
`0833f5d03a7373d370a75780f663557c9ad49550e50c9b5957a98c6e9ead0098`.
It replaces the earlier operative clauses for coverage-lane A/I admission,
turns, ACK/result settlement, native receive overlap and the fourth listener.
The preserved files remain history rather than competing normative text.

The dedicated purpose, ordinary/snapshot isolation, unchanged 128 MiB pool,
eight-root ceiling, lower-then-upper complete units before the first probe,
atomic colocation union, original shared-generation deadline and cadence,
exact idempotent identity, disjoint S/H/C/K/Ps/Pr/Wi/Wo/Wr copies, late-input
MessageRouter custody and actual last-reference release remain authoritative.
The approved caller source at
`2de419483c9b4ce9e3fabc87bb54d93e4afb8817` remains closed.

### D15 and D20: receiver-owned admission through the actual A terminal

`Wbase` remains the same nonborrowable 16 MiB slice of the configured CDC pool:

```text
Aactive = eight receiver-only cells, 448 KiB each = 3.5 MiB
Adrop   = one pre-Socket accept/drop coefficient      = 0.5 MiB
Aaccept = Aactive + Adrop                             = 4 MiB
Iout    = four dial cells, 1.5 MiB each               = 6 MiB
Iin     = four accepted-lane cells, 1.5 MiB each      = 6 MiB
Wbase   = Aaccept + Iout + Iin                        = 16 MiB
```

Each I cell also names one fixed **Ibootstrap phase** for the lower/upper pair
request before that endpoint owns its E unit. Ibootstrap is an alternate use of
the same 1.5 MiB I cell, never an added debit. It owns the fixed request, ACK,
grant/refusal result, their raw/parsed graphs and their actual send/callback
copies. A successful grant transfers every surviving bootstrap reference into
the newly complete E unit's already reserved WiPending/Wo/Wr subcredits before
the first probe or any binary data phase. A refusal or uncertain grant keeps
Ibootstrap and the lane until those fixed references drain or the same-identity
recovery succeeds. Thus a pre-E message has an owner, while bootstrap copies
cannot overlap the later two-L I data peak.

For a remote endpoint the complete E calculation earmarks
`EbootstrapRetained = 1,400 KiB` inside, not in addition to, the unchanged
combined `Ps + Pr + WiPending + Wo + Wr <= 8 MiB` term. Its subordinate message
count includes one pair request, ACK and result window. Cancel reuses that
window only after it drains. The checked E calculation must fit this retained
bootstrap maximum plus every later bounded control/callback population inside
the same 8 MiB term before admission; otherwise it refuses before the pair and
source remains stopped. Colocation opens no lane and consumes no bootstrap
earmark. This makes delayed pair callbacks compatible with immediate first
probe progress without spending the same reservation twice.

A is never sender evidence. An outbound Socket, client handshake and callbacks
start inside local Iout. A receiving node owns each accepted preupgrade Socket,
HTTP parser/request/header/head, bounded rejection and every later callback in
one Aactive cell. Upgrade atomically transfers that population from A into a
free Iin cell. The A cell becomes free only after every A-owned HTTP, write,
Socket and native-close reference has reached its local terminal or has been
atomically adopted by that Iin identity. Native
`server._connections`, `destroy`, semantic refusal and the JavaScript `close`
event alone are projections, not A-release authority.

The existing MessageRouter listener owner uses the public Node server controls
as one synchronous pre-HTTP gate:

1. Before `listen()`, it sets `pauseOnConnect = true`, prepends the A admission
   listener ahead of the HTTP connection listener, sets `maxConnections = 8`
   and uses backlog eight.
2. Node's pinned max-connections branch runs before JavaScript Socket
   construction. An accepted Socket is created paused. The prepended listener
   claims a free A cell before any resume or HTTP parser construction.
3. Claiming the last free A cell synchronously changes the public
   `server.maxConnections` property to `0` before that connection listener
   returns. In the certified Node profile the test is
   `connections >= maxConnections`; zero therefore sends every later accept
   through the pre-Socket close branch even if `_connections` decreases.
4. The value stays zero while any mixture of live or retired A claims occupies
   all eight cells. Only the exact release callback of an A identity may return
   it to `8`, and only when the router is accepting rather than shutting down.
   No native-count event or replacement Socket performs that transition.
5. With at least one A cell free, `maxConnections = 8` remains the independent
   live native ceiling. If eight upgraded/live coverage connections already
   occupy that count, the native gate still drops the next handle. If native
   count has fallen while old A or I identities drain, the typed A/I owner
   counts below remain authoritative.

This removes the D20 free interval. A Socket cannot be constructed after the
last A claim becomes occupied merely because `_destroy` decremented the native
count. The certified Unix server accepts one handle per listener I/O callback;
the last-cell listener sets zero synchronously before another callback. The
pre-Socket max-connection handle and fixed `drop` record are charged to Adrop
through native close. The audited-profile source gate must certify the maximum
current-plus-close Adrop population and its 0.5 MiB coefficient; failure is a
source STOP, never permission to place a constructed Socket or HTTP parser in
Adrop.

Adrop has one native-handle identity, not a queue. The certified Unix loop must
prove the pinned sequence: `uv__server_io` accepts one handle for one listener
I/O callback, Node's max-connections branch calls `clientHandle.close()` before
return, and that closing handle reaches the libuv close-handles phase before a
later poll can deliver another listener callback. No MessageRouter callback
retains the handle. If the actual production libuv loop can overlap two such
drop handles, the one-cell design fails source certification; a sampled usual
count cannot substitute for that proof.

Use owner counts, including retired generations:

```text
A_live + A_retired = A_owned <= 8
Iout_live + Iout_retired      <= 4
Iin_live  + Iin_retired       <= 4
A_owned + Iout_owned + Iin_owned <= 16 Wbase cells
native coverage _connections <= 8 while maxConnections is 8
maxConnections = 0 when accepting and A_owned = 8; shutdown also holds zero
```

The older `Id + Ia + Ap <= 12` live projection is withdrawn. A destroyed old
I lane may retain an I cell while eight separate A cells safely own paused or
refusing Sockets; the byte/count proof is the sixteen typed Wbase cells, not a
native live count. An upgrade succeeds only with a free Iin cell. Otherwise it
returns the fixed refusal and retains A through write, HTTP and close drain.
Old I callbacks cannot free a successor cell.

Iout and Iin never borrow from each other. If nodes A and B each occupy all four
Iout cells with opposing CONNECTING attempts, each still has four Iin cells and
eight receiver A cells. At least four admitted inbound lanes can upgrade and
perform useful pair work. When A is exhausted, already admitted A/I work must
refuse, upgrade or finish and thereby reach an actual release; zero admission
cannot displace it. Excess peers retain durable debt and use the existing
reconcile cadence after a cell release. No listener queue, lease, timer,
auction or retry owner is added.

The complete pair is acquired on the preadmitted coverage lane:

1. The initiator first claims Iout. A local lower endpoint also atomically
   claims the lower complete E unit before dial; a remote lower is not charged
   locally.
2. The receiver claims A before HTTP read, validates fixed version, purpose,
   admission ID, endpoint roles and boot incarnation, then atomically transfers
   A to Iin before constructing the coverage Receiver. Rejection stays in A to
   its last terminal.
3. A local-lower initiator asks the remote upper endpoint for the upper complete
   unit. A local-upper initiator first asks the remote lower endpoint for the
   lower complete unit and only after that exact grant claims its local upper
   unit. Both orders are lower then upper. Colocation atomically claims the
   complete lower-plus-upper union and opens no lane.
4. Before an endpoint has its E unit, its fixed pair request/ACK/result stays in
   Ibootstrap. The granting endpoint first creates its complete unit and then
   transfers all surviving bootstrap custody into it before handing off the
   grant result. A local-upper requester first claims its local complete unit
   after consuming the remote-lower grant, then transfers its local bootstrap
   custody. Only after both transfers leave Ibootstrap empty may either side
   enter the probe/data I phase.
5. Upper refusal retires an already held lower unit after refusal transport
   custody transfers and never probes. If local upper claim fails after a
   remote lower grant, exact cancel/retire uses the same lane and identity;
   it waits for the prior bootstrap window to drain and reuses those fixed
   slots rather than overlapping a second window. Uncertain remote pressure
   persists until exact recovery.
6. Only both complete units authorize the single probe. Duplicate grants and
   replies are idempotent by request, endpoints, roles, reconcile generation,
   admission ID and connection generation.

No primary admission request remains. Ordinary `SERVICE_RESPONSE` traffic on
the primary connection and snapshot bulk admission continue under their
existing limits and owners.

### D16, D18 and D19: audited receive phases and canonical router settlement

A 64 KiB high-water mark remains a backpressure threshold after enqueue and is
not an allocation cap. Public accepted-Socket `onread` construction is not
available, and adapting dial-only `onread` back into ws would create a new
stream bridge. This design uses neither that bridge, a raw parser nor private
Node/ws fields.

The native allocation premise is limited to the audited Linux x64 profile:
Node v22.23.2, libuv 1.51.0 and installed ws 8.21.0. The retained research
manifest SHA-256 is
`9e7db3759806da245390d3a887f32a0f27fe42f54daf910554e078265fe9b730`;
the observed executable SHA-256 is
`3517c2df0b2f8cd7f422b4b8450ef81c6889f08eb03e281d6de9079b15e6a327`.
For this profile:

- Unix TCP asks for one 64 KiB ordinary read backing and performs at most 32
  reads in one loop turn;
- Node allocates the requested managed BackingStore and, for a short read,
  briefly overlaps it with one exact-`nread` copy;
- the HTTP parser owns a 64 KiB buffer and can overlap it with an actual-current
  buffer copy through upgrade;
- ws checks `maxPayload`, `maxFragments` and `maxBufferedChunks` before their
  respective retained pushes and pauses its Socket when Receiver backpressure
  requires it.

Both coverage constructors set `maxPayload = 640 KiB`, `maxFragments = 4`,
`maxBufferedChunks = 16`, `perMessageDeflate = false`, deferred message events
and `autoPong = false`. Coverage exposes no ping/pong send API; inbound
PING/PONG is a fixed protocol violation. A valid HTTP upgrade has empty `head`:
the initiator sends no lane message before open and the acceptor sends none
before IDENTIFY. Nonempty head is rejected under A before Receiver construction.
The HTTP parser/current-buffer phase and the maximum data phase therefore do
not overlap on that endpoint.

#### D18 canonical request window

The coverage lane adapts each bounded service request and its two result
encodings into the existing MessageRouter service interaction. It does not
replace the actual ledgers. Its producer permits one outstanding request
window per lane. Each exact window has the following wire order:

```text
requester                         responder
SERVICE_MESSAGE request N          ->
                                  <- ACK N
                                  <- result N: JSON SERVICE_RESPONSE
                                               or binary CHUNK_RESULT
```

The request always enters the existing SERVICE_MESSAGE branch. That branch
sends ACK before invoking the coverage handler. The handler produces exactly
one result: bounded success/noHandler/error/control uses the ordinary JSON
SERVICE_RESPONSE, while a successful variable CHUNK uses the binary
CHUNK_RESULT encoding carrying the same message ID and result identity. The
sole binary-result adapter validates the fixed header against the already
registered live or retired result identity, constructs the bounded local result
shape and calls the same
`resolveServiceResponseDisposition`/pendingResponses settlement used by JSON
SERVICE_RESPONSE. An orphan reaches that same disposition logic and closes the
lane. The adapter never calls `handleServiceMessage`, never emits an ACK and
never sends variable bytes through the ordinary JSON parser. ACK, JSON
SERVICE_RESPONSE and binary CHUNK_RESULT are terminal dispatch branches and
are never acknowledged, so there is no ACK recursion.

The two existing requester ledgers keep their distinct meanings:

- `pendingMessages[N]` is the delivery/ACK ledger. Exact ACK N settles it and
  allows the already registered result waiter to enter `WAIT_RESULT(N)`. ACK is
  not processing success, does not release E/I/H/Wr, and does not authorize
  request N+1.
- `pendingResponses[N]` is registered before the request send. Exact JSON
  SERVICE_RESPONSE N or exact binary CHUNK_RESULT N settles it. The JSON branch
  carries success, noHandler, handler error and bounded controls; the binary
  branch carries only a validated CHUNK success. Only that locally observed
  result terminal, after exact ACK N has also settled, authorizes the requester
  to submit the next protocol request or let the reconcile owner decide a
  retry/retire outcome. An early result can settle its registered waiter, but
  cannot bypass the delivery/ACK branch.
- A late exact result is consumed by the existing retired-response context. It
  can report the same idempotent completion to the reconcile owner but cannot
  release or authorize a successor lane directly. Orphan, wrong-generation or
  conflicting input closes the exact lane and leaves debt owed.

Semantic window permission and physical send custody are separate local facts.
On the responder, the router atomically records the exact post-result state:
`EXPECT_REQUEST(N+1)` for a successful continuation, or the matching
terminal/refusal/error disposition. It transfers the ACK into preowned Wo and
the exact result frame into preowned Wr or proportional H immediately before
their respective send operations. The peer cannot receive the result before
this local state exists. A synchronous send failure changes the lane to
`RETIRING`; it never rolls the state back. On the requester, receipt and
settlement of exact JSON SERVICE_RESPONSE N or binary CHUNK_RESULT N records
the matching continuation or retry/retire outcome before its continuation
returns. Neither endpoint waits for an unknowable remote callback.

Consequently ACK N's send callback, response N's send callback and request N's
send callback may remain pending after useful semantic progress. Their actual
Buffers/strings/frames stay in their original H/Wr/Wo cells until local
callback, throw or exact connection-close drain. A valid N+1 is accepted even
while those old physical copies remain, and the cumulative control/send
population already reserved by D11-D13 covers that overlap. N+1 consumes its
own preowned subordinate byte/count credit inside the admitted root; if that
bounded credit is temporarily occupied, the existing sender backpressure waits
within the original deadline rather than treating N+1 as a protocol refusal.
An old callback only releases its own identity; it cannot refuse N+1 or release
a new window.

Lost or uncertain settlement uses the existing recovery owners:

1. Missing/rejected ACK or result-ledger timeout marks the exact connection
   generation `RETIRING`, stops new application sends, retains E/I and every
   pending send/input copy, and initiates public lane close.
2. MessageRouter retires the old pending ledgers under their existing late
   contexts and returns one typed retryable outcome to the existing coverage
   reconcile attempt. It does not create a second timer, ledger or retry queue.
3. The reconcile owner uses only the remaining original generation deadline
   and cadence. The same exact request may be redriven only after the old I cell
   reaches receive/send/close drain. A replacement recovers the same uncertain
   lower/upper grant or result by idempotent identity; it does not infer
   refusal, rerun SQL or acquire a duplicate E unit.
4. If an exact late response arrives before old-lane drain, old MessageRouter
   custody consumes it and can cancel the not-yet-started duplicate attempt.
   After drain it is stale input and cannot touch the replacement.
5. Deadline or shutdown retirement follows the same close/drain path. Expiry
   never releases native or send copies and never renews the shared deadline.

This makes retry reachable without returning a fictional strict-turn token and
without requiring two endpoints to know one another's callback unwind.

#### D19 receive boundary and phase maximum

The ws `message` event is after native assembly, so it is not called a
preassembly gate. The allowed public boundary is:

1. At entry to the sole coverage `message` adapter, before router dispatch or
   await, it calls public `ws.pause()` and records the exact
   `(admissionId, connectionGeneration, receiveOrdinal)` token.
2. Before parsing or invoking any async handler, it atomically transfers the
   entire expected assembled backing, every extant Buffer view and the
   emitter's raw alias out of the proportional I assembly slots. A pair message
   received before local E completion enters Ibootstrap. Every later expected
   message enters the already preowned WiPending receive subcredit in the
   admitted E unit. It then validates fixed fields. Binary row bytes copied
   into capture use C; parsed request/result graphs use their measured
   WiPending or Pr subcredit; ACK fields use `pendingMessages`; each real copy
   has its own charge. None of those derived objects releases the original raw
   backing. That backing releases only after both emitter and consumer/handler
   aliases are terminal.
   Primary and snapshot sockets use their existing listeners; only the already
   identified coverage purpose uses this adapter.
3. The adapter resumes only when the local protocol state permits the next
   ACK, JSON/binary result or request phase and the prior native token has
   transferred or reached callback unwind. Pause does not claim to stop ws
   `startLoop(cb)` from consuming bytes already delivered.
4. A second emitter that is not the exact allowed ACK/result/request is never
   parsed by MessageRouter. It records one bounded violation and calls public
   `terminate()` once. All bytes, emitter closures and close-path input already
   created remain charged until their real terminals.

The producer side of the same versioned purpose enforces the finite wire
population before `ws.send`. A reply direction contains ACK followed by exactly
one JSON SERVICE_RESPONSE or binary CHUNK_RESULT and no third application
message. A request direction contains the current bounded SERVICE_MESSAGE plus
at most one already emitted bounded stale/wrong-phase successor; discovery of
that mismatch permits only terminal CLOSE. This is the trusted node-to-node
producer bound already used by the coverage protocol, not a claim about an
arbitrary hostile TCP peer.

For fixed pair bootstrap controls let one complete inbound text population be
at most `2*Lc` for fragment roots plus concat, `2*Lc` for the UTF-16 string, and
`Gc <= 192 KiB` for the parsed graph: 448 KiB total. Let each fixed outbound
request/ACK/result population, including graph, string, frame/socket copies and
callback, be `Bsend <= 320 KiB`. The two endpoint roles have these alternative
maxima inside one I cell:

```text
requester Ibootstrap: two inbound populations + one outbound
                      + current/transient read + Mlane + headers
                    <= 2*448 + 320 + 128 + 48 KiB + 195 bytes
                    <= 1,392 KiB + 195 bytes
responder Ibootstrap: one inbound population + two outbound
                      + current/transient read + Mlane + headers
                    <= 448 + 2*320 + 128 + 48 KiB + 195 bytes
                    <= 1,264 KiB + 195 bytes
```

Both fit the unchanged 1,536 KiB I cell. `Gc` and `Bsend` are source-certified
coefficients. The 1,400 KiB EbootstrapRetained earmark covers the requester
maximum with 7 KiB + 829 bytes of margin. A successful grant must move all
remaining raw/parsed/send references into its complete E unit before leaving
Ibootstrap; otherwise the first probe is forbidden. Refusal/lost-grant
recovery stays in Ibootstrap and therefore cannot coexist with the later binary
phase.

The complete phase relation, rather than a one-emitter assumption, establishes
the bound:

| Phase | I-owned proportional population | Other simultaneous custody |
| --- | --- | --- |
| assemble expected message | socket/Receiver roots and consume output use at most two `L` populations; one current/residual read and one transient short-read backing may overlap | No earlier proportional I input remains; fixed lane graph/arrays are in Mlane |
| expected emitter | assembled Buffer and all aliases transfer atomically from I to the exact preowned WiPending receive subcredit before parsing or async dispatch; derived C, Pr or ledger objects are separately charged | Current and next scheduled ws closures may both exist; they are fixed Mlane objects. The transferred backing is counted once by WiPending, and WiPending cannot release while either the handler or emitter alias remains |
| prior payload plus next assembly | I is free to own the next message's fragmented roots up to `L` and distinct concatenated output up to `L`, even if `startLoop(cb)` scheduled that next delivery before the prior callback returned | The prior contiguous payload up to `L` may still be retained by its async handler and prior emitter closure, but it is charged to the local admitted E unit's existing WiPending subcredit. This is one old downstream `L` plus two new I `L` populations, never three I slots |
| ACK then result already delivered | ACK callback may schedule the result closure before it returns; the fixed raw ACK backing remains in WiPending until that emitter unwinds and can overlap result dispatch | Parsed ACK/result graphs and send callbacks remain in their disjoint PL/Pr/Wr/Wo custody; neither parsed fields nor semantic settlement is treated as raw-backing release |
| next message spans more reads | the prior ws write callback has returned before Receiver drain resumes the Socket, so the old I proportional slots are reusable; the entire next message may consume the same two-`L` assembly bound | The prior downstream Buffer may still exist, but is charged to its preowned downstream owner, not called free |
| unexpected emitter/terminate | the complete unexpected message may already be assembled; a residual frame in the delivered chunk and one successor deferred closure may coexist | `terminate()` stops future admission but does not release these objects; close may provide one final readable population before Receiver finish |
| close drain | rejected assembled data, residual/current/close-fed roots and at most the current plus next deferred closures remain until Receiver, Writable, Socket and close callbacks drain | Old WiPending and H/Wr/Wo copies remain separate and can outlive I semantic retirement |

Deferred ws delivery can schedule the next closure from `startLoop(cb)` while
its predecessor is still on the stack. Receiver's `DEFER_EVENT` state prevents
a third deferred message from being assembled concurrently: the population is
current plus one next closure, not one closure. If the next message needs later
native reads, the preceding write callback and deferred stack have returned
before ws drain permits those reads. If it is already present, it is limited to
the already delivered Receiver population and may reach the full next
fragments-plus-concat P0/P1 peak before the pause takes effect. The old raw
payload is not presumed dead: its physical backing and aliases were transferred
to the existing WiPending downstream owner before parsing or async dispatch, so
they can overlap that next P0/P1 peak without using I twice. The transfer is an
owner move, not a copy: the same backing leaves I exactly once, enters exactly
one WiPending subcredit, and releases only after both the old emitter and
handler aliases are terminal. Any real capture copy, concat, string or parsed
graph is separately charged to C, Pr or its fixed router ledger.

At the old emitter boundary the pinned ws receiver has already replaced its
`_fragments` array, returned from `dataMessage`, and its deferred callback
captures the contiguous `data` value rather than the local fragment array. The
source witness must prove that no old fragment backing remains rooted there in
the certified production V8 artifact. If the old fragments remain rooted, the
old population is two `L` values rather than one and this 1.5 MiB I-cell design
is a source STOP; neither semantic parsing nor the WiPending move may call that
extra backing free.

At an unexpected emitter, the complete bounded message is already the assembled
`L` population; public pause/backpressure has stopped future ordinary reads,
and producer discipline leaves only residual current input and terminal-close
readable bytes. Those roots plus the assembled message fit P0/P1/X. Termination
and close reuse those phase slots; nothing is released merely because the
message was refused.

For one I cell define `L = 640 KiB`, fixed text maximum `Lc = 64 KiB`, binary
header graph `Gh <= 64 KiB` and certified fixed lane metadata
`Mlane <= 48 KiB`. Mlane includes Socket/Receiver/turn objects, sixteen
buffer-array entries, four fragment entries, two pending-ledger entries and two
deferred-emitter closure records. The data phase maximum is:

```text
proportional slot P0                    <= L
proportional slot P1                    <= L
current/residual/close phase X          <= 64 KiB
transient managed read backing          <= 64 KiB
binary header graph or close scratch    <= 64 KiB
fixed lane metadata Mlane               <= 48 KiB
four masked data headers + terminal CLOSE <= 195 bytes
----------------------------------------------------------------
I phase maximum                         <= 1,520 KiB + 195 bytes
I cell                                   = 1,536 KiB
checked margin                           >= 15 KiB + 829 bytes
```

The cell requirement is
`max(Ibootstrap 1,392 KiB + 195 bytes, data 1,520 KiB + 195 bytes)`;
the data phase remains governing. The two phases cannot overlap because the
first probe is forbidden until every successful bootstrap reference has moved
to its complete E unit. A failed bootstrap never enters the data phase.

The labels are phase slots, not a claim that aliases are free. During consume,
P0/P1 are raw roots plus output; during final concat they are fragments plus
assembled output; during refusal/close an older assembled Buffer plus delivered
residual/close roots reuse the same two proportional slots. A shared backing is
counted once while every alias delays its owner's release; a real concat, string
or parsed graph is a separate copy. Across owners the worst successive-message
point is therefore the old transferred `L` in WiPending plus next I P0 and
P1, together with the fixed X/read/Gh/Mlane terms. The old `L` was already
reserved in the acquired recipient E unit and is already present in the
whole-operation `Ps + Pr + WiPending + Wo + Wr` total; it is not another
reservation. A copied C population and parsed Pr/ledger graph remain their own
already budgeted copies. Text remains smaller after its Buffer,
UTF-16 string and bounded parsed graph are included.

A seventeenth Receiver chunk is rejected before array push but remains the
current Writable input through its callback and therefore uses X/Mlane until
drain. A supported 640 KiB/four-frame transfer must be shown on real accepted
and dialed sockets within the sixteen retained entries. More fragmented TCP
arrival is a bounded refusal with durable debt, never an uncounted entry.
Malformed header, oversized payload, late result, wrong purpose, fifth
fragment, extra message and shutdown all follow the same phase table.

The 48 KiB Mlane, 192 KiB bootstrap Gc, 320 KiB bootstrap Bsend, 448 KiB
Aactive, 0.5 MiB Adrop and all S/H/C/K coefficients remain certification
gates. They are fixed count/byte requirements for the pinned artifact, not
typical RSS observations. If any retained graph or native phase exceeds its
cell, source approval stops and returns to the existing owner for a bounded
capacity/copy decision. The pool and supported rows do not move.

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
range and CI `22` selector remain evidence that this choice is unimplemented.
The production stage is `gcr.io/distroless/nodejs22-debian12`; `node:22-slim`
is only the builder and pinning it would not certify the running allocator.
The actual distroless runtime artifact and executable must be immutable and
measured. No existing Node 22 support range is silently reinterpreted or
narrowed by this design.

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

Shutdown first sets MessageRouter shutting-down, sets coverage
`maxConnections = 0` and withdraws the capability so no new dial begins. It
closes the coverage listening handle, prevents new
Aaccept/I binding, terminates or drains coverage sockets, waits for HTTP heads,
ws receivers, pending ledger entries, send callbacks, deferred callbacks and
old-generation close terminals, and only then releases the exact A/I cells and
Wbase. It then closes bulk/snapshot and ordinary listeners through the existing
shutdown owner. Restart reuses the configured stable address but publishes a
new boot/connection generation; no old admission ID or callback can bind or
release the new listener.

### Complete allocation, request and release timeline

| Phase | Simultaneous ownership and locally observable transition | Terminal or next permission |
| --- | --- | --- |
| 0 configure/start | Runtime owner validates the actual production artifact; port owner validates four endpoints; PO withholds 4 MiB A and 12 MiB I; listener starts with `pauseOnConnect=true` and `maxConnections=8` | Mismatch/bind failure unwinds before capability/readiness. Source remains HOLD. |
| 1 initial dial | Initiator claims Iout; local lower also claims its complete lower E unit | Connect failure retains Iout and debt through error/close callback, then existing cadence may retry. |
| 2 accept | Native live gate runs before Socket construction; paused Socket synchronously claims A before HTTP | Claiming the eighth A sets public maxConnections to zero before listener return. Pre-Socket drops use Adrop. |
| 3 HTTP/upgrade | A owns Socket/parser/header/head/rejection; exact admission claims Iin before Receiver creation | Iin atomically adopts every surviving HTTP/Socket reference, then exact A release may restore maxConnections to eight. Refusal keeps A to final drain. |
| 4 complete pair | Fixed pair request/ACK/result lives in Ibootstrap until its local E exists. Local-lower requests remote upper; local-upper requests remote lower then claims local upper; colocation claims the union | Success atomically moves every bootstrap reference into the complete E subcredits. Refusal/cancel retains Ibootstrap through transport drain and retires held lower. No probe until both complete units exist and Ibootstrap is empty. |
| 5 request N | Requester registers both ledgers and transfers the bounded SERVICE_MESSAGE to Wo; receiver I assembles it, pauses at its sole emitter, moves the raw backing to WiPending and separately charges its parsed request graph | Inbound owner transfers ACK N to Wo before handler. ACK callback may remain pending. |
| 6 ACK/result N | ACK settles only `pendingMessages[N]`; handler success/noHandler/error produces one JSON SERVICE_RESPONSE, or successful CHUNK produces one binary CHUNK_RESULT. Before the result's Wr/H send handoff, responder records either `EXPECT_REQUEST(N+1)` or the exact terminal/refusal/error state | Exact JSON or binary result settles `pendingResponses[N]` and authorizes its matching continuation or retry/retire outcome. Old request/ACK/result callbacks keep their own copies but cannot veto a valid N+1. |
| 7 binary transfer windows | Each CHUNK request is one exact request window; its sole result is binary CHUNK_RESULT. Recipient I phase maximum covers result roots/concat/residual/closures; preallocated C/P receives a separately charged verified copy | Raw result backing transfers to WiPending and remains there through emitter/consumer alias terminals. Next ordinal follows exact result settlement, not a remote callback. The result emits no ACK. |
| 8 lost ACK/result | Old ledgers retire under their existing late contexts; lane becomes RETIRING; E/I/send/native claims remain | Router initiates close. Existing reconcile owner may redrive the same identity only after old I drain and within the unchanged deadline/cadence. Exact late result may stop a not-yet-started duplicate. |
| 9 extra/malformed/late input | A complete unexpected message may already be assembled before the sole adapter pauses/terminates; current plus next deferred closure and close-fed roots stay in I | No router parse for disallowed emitter. Receiver/Writable/Socket/close drain is the I terminal; semantic refusal is not release. |
| 10 publication | Decoded immutable row, final cache fence, H/Wr send, old WiPending and Knotify may coexist under their disjoint credits | Cache install does not release native/send/notification custody. Each owner releases its exact identity once. |
| 11 shutdown/restart | maxConnections becomes zero, capability is withdrawn, accepts stop, all A/I/HTTP/ws/ledger/send/deferred/close identities drain | Wbase releases last. Restart uses a new boot/connection generation; old callbacks cannot affect it. |

The same timeline handles probe, OFFER, HELD, CANCEL, capacity refusal and final
completion. Every SERVICE_MESSAGE uses the exact ACK-then-result ledger
sequence; binary CHUNK_RESULT changes only the bounded encoding of the result.
Neither ACK nor semantic result is used as proof of physical callback release.

### Feasibility and remaining source gate

The unchanged whole-operation allocation remains conservative if its existing
coefficients are enforced:

```text
Wbase                                      <= 16 MiB
S for one supported >16 MiB row            <= 34 MiB + 2 bytes
H                                            <= 2 MiB
C                                            <= 49 MiB + 3 bytes
K metadata/queue                            <= 16 MiB
Ps + Pr + WiPending + Wo + Wr               <= 8 MiB
----------------------------------------------------------------
colocated completing peak                    < 126 MiB
```

The revised A gate changes lifetime/count ownership but not Wbase bytes. The
revised native phase maximum remains `1,520 KiB + 195 bytes` per I cell. The
supported 8 MiB colocation case has more margin. A remote transfer holds only
its source or recipient subset; both node orders claim the same complete units
lower then upper. Root sessions remain capped at eight, while ACK/result/chunk
ordinals are subordinate tokens inside those roots.

With more than eight peers, at most eight A populations and four accepted Iin
lanes are owned at once; other peers are dropped before Socket construction or
remain charged to their own Iout/debt. Four outbound attempts never consume the
four inbound cells. Retired A and I identities remain visible in owner counts
until their actual terminals, so accept/destroy churn cannot create an
uncredited replacement. Ordinary primary and snapshot traffic retain their
existing parser, connection and payload contracts.

Resource source remains **HOLD**. Approval requires one candidate to enforce
and independently witness:

1. production distroless runtime/executable identity and all pinned native/ws
   semantics, including zero-valued maxConnections behavior;
2. A live/retired count transitions through accept, last-cell zero gate,
   refusal, upgrade, `_destroy`, delayed HTTP/write/native close, exact release
   and immediate replacement, plus the Adrop maximum;
3. actual RI/RD/PL frames and ledgers for success, noHandler and handler error;
   ACK then JSON SERVICE_RESPONSE or binary CHUNK_RESULT; N+1 before old
   callbacks; early result cannot bypass ACK; no ACK recursion;
4. missing ACK, lost result, late result, same-identity recovery, old-lane drain
   and replacement within the original deadline;
5. maximum fragmented input, a prior emitted contiguous payload still retained
   by its async handler, next fragmented roots plus their concat, an extra frame
   in the same native chunk, an unexpected message split across reads, two
   deferred closures, terminate and close-fed remaining bytes, with each owner
   transfer, unique backing, alias terminal and real copy recorded;
6. both remote endpoint orders, opposing four-out/four-in connects, more than
   eight peers, pair grant/refusal/lost-answer Ibootstrap transfer or drain,
   the 1,400 KiB bootstrap earmark plus later controls within the unchanged
   fixed 8 MiB term, colocation, exact/below capacity, 8 MiB and
   greater-than-16-MiB rows, concurrent ordinary SERVICE_RESPONSE, listener
   defaults/overrides, Helm seed/joiner exposure, restart and shutdown.

The measured/certified ceilings remain: Mlane 48 KiB, bootstrap Gc 192 KiB,
bootstrap Bsend 320 KiB, EbootstrapRetained 1,400 KiB within the fixed 8 MiB
term, Aactive 448 KiB, Adrop 0.5 MiB and the prior S/H/C/K populations. If the
profile, phase maximum or any coefficient does not fit, source stops and
returns to the existing owner for an explicit bounded choice. It may not raise
128 MiB, borrow ordinary/snapshot capacity, hide native allocations, add a
parser/retry/ledger owner, narrow the supported row cases or reinterpret a
timeout as release.

### D18-D20 review mapping and cumulative disposition

| Item | Effective disposition |
| --- | --- |
| D1-D8 | Captured envelope, H/continuation, pair CAS, Knotify, canonical comparison, disjoint copies and digest guarantees remain unchanged. |
| D9-D13 | Stable lower/upper order, atomic colocation, Ps/Pr, one probe, old WiPending, control overlap, original deadline and cadence remain. |
| D14 | Dedicated purpose, binary Q and ordinary/snapshot isolation remain. Native ingress is governed by the D19 phase table rather than HWM or a one-emitter assumption. |
| D15 | Receiver-owned first contact and four Iout/four Iin progress remain. D20 replaces native live-count release with live-plus-retired A ownership and the public 8/0 gate. |
| D16 | Audited valid-turn native profile and conditional arithmetic remain. Runtime and numerical coefficients stay source HOLD. |
| D17 | REST+3/override, four-way validation, bind host, Helm/headless exposure and MessageRouter startup/shutdown remain accepted at design level. The actual distroless runtime is the certification target. |
| D18 | Closed at design level by the canonical request, ACK, result and ledger sequence; locally observable semantic permission is independent of physical callback custody; uncertainty retires/drains before same-identity redrive. |
| D19 | Closed at design level by public pause at emitter plus the full successive-assembly/deferred/terminate/close phase maximum. The event is not misrepresented as preassembly admission. |
| D20 | Closed at design level by A-owned live-plus-retired counts and synchronous public maxConnections 8/0 transitions tied only to actual A claim/release. |
| N1/N2 | Caller source `2de419483c9b4ce9e3fabc87bb54d93e4afb8817` remains approved and closed. |

This amendment is design only. It approves no coverage listener, resource,
runtime policy, deployment, test or metadata source and does not reopen caller
or transaction semantics.

## D21 effective Adrop, subordinate-population and runtime-profile correction

The exact round-nine approved subject is retained at
`evidence/cdc-resource-round9-navigation/subject-0c44f474.md`, SHA-256
`0c44f474493dc001385fe623eb7fb8eeed4d445fb84f075fa498887f2da2a130`.
The runtime prerequisite that found the counterexample is retained unchanged
at `evidence/cdc-runtime-allocation-certification-20261011T2100/`:
`certification-report.md` SHA-256
`4af9e5a5325aa76bcb39a0fd10583e902455eb311f6158b8a31ecd270d6c7c56`
and `packet-sha256.txt` SHA-256
`f219ab10bc2910a6895086bb1e56c0514b6a2db429a809928f6b2ae543ed7c82`.

This section is the effective scoped supersession for three premises only:

1. It replaces D20's one-native-handle `Adrop` premise and every timeline or
   gate that relies on a dropped handle closing before another listener
   callback. `Adrop` is now a standing finite batch envelope.
2. It replaces D11-D13/D15's deadline-derived `maxWireMessages` population and
   the unspecified later population inside the fixed 8 MiB term with the
   countable banks below. The deadline and cadence still govern retry time;
   they no longer multiply resident send copies.
3. It replaces D16/D17's illustrative Node 22.23.2 profile choice with the
   release-owned profile contract and supported-profile inventory below. The
   measured v0.2.5 Node 22.22.0 image is evidence, not the future candidate.

All other D1-D20 guarantees remain operative, including the complete E pair
before the first probe, lower-node then upper-node acquisition, atomic
colocation union, actual send-callback/socket-drain release, D18 ACK then
result settlement, D19 receive phases, ordinary/snapshot isolation, the
unchanged 128 MiB/eight-root limits and the supported 8 MiB and
`16 MiB + 1 byte` cases. The approved caller source at
`2de419483c9b4ce9e3fabc87bb54d93e4afb8817` remains closed.

### Standing `Adrop` batch owned before native acceptance

The unchanged Wbase equation is now read as:

```text
Aactive = eight receiver cells, 448 KiB each        = 3.5 MiB
Adrop   = one standing dropped-accept batch envelope = 0.5 MiB
Aaccept = Aactive + Adrop                            = 4 MiB
Iout    = four dial cells, 1.5 MiB each              = 6 MiB
Iin     = four accepted-lane cells, 1.5 MiB each     = 6 MiB
Wbase   = Aaccept + Iout + Iin                       = 16 MiB
```

`Adrop` is one aggregate reservation, not one handle slot and not an
application admission claim. `CdcCoverageTransferOwner` withholds its complete
512 KiB before MessageRouter starts the dedicated listener and keeps it
withheld for the listener's whole lifetime. This preownership covers native
objects created before JavaScript can classify or claim A. It never borrows an
A/I/E cell and is never lent to a live Socket, HTTP parser, ordinary frame,
snapshot transfer or data root.

The certified Linux profile establishes the population before implementation:

1. One `uv__server_io` call accepts at most one descriptor and Node constructs
   one `TCPWrap` before entering `lib/net.js`.
2. The max-connections branch runs before JavaScript `Socket` and HTTP parser
   construction, emits `drop` synchronously, calls `clientHandle.close()` and
   returns.
3. A Linux `epoll_pwait` result contains a watched descriptor at most once.
   The pinned loop has 1,024 event entries and can repoll only while a full
   batch was returned. Its counter starts at 48. The dedicated listener can
   therefore contribute at most one dropped accepted root to each of at most
   48 batches before `uv__io_poll` returns.
4. `uv__run_closing_handles` runs after that poll and before the next poll.
   Thus at most 48 pre-Socket roots are physically live at once. A sampled
   async-hooks count is not used as the proof.

The immutable measurement in
`evidence/cdc-adrop-native-layout-20261011.md` records the actual base layout:
`TCPWrap::SelfSize() = 432` bytes, its embedded `uv_tcp_t = 248` bytes, and the
associated V8 `TCP` object self size is 56 bytes. The profile uses wider hard
charges so allocator and close bookkeeping are not hidden:

```text
48 dropped accepted roots * Droot, Droot <= 8 KiB       <= 384 KiB
one synchronous fixed drop-data/callback graph          <=  16 KiB
shared poll/async/close bookkeeping for the 48 roots     <=  64 KiB
listener terminal-barrier closure and fixed diagnostics <=  16 KiB
---------------------------------------------------------------------
Adrop maximum                                            <= 480 KiB
Adrop reservation                                          512 KiB
margin                                                     32 KiB
```

`Droot` includes the 432-byte native wrapper, the embedded libuv handle, the
56-byte V8 object, actual allocator extent and every per-root async/close
entry. The fixed `drop` graph has only six bounded address/port/family fields.
The sole MessageRouter `drop` observer is synchronous: it may increment fixed
scalar diagnostics but is nonthrowing and may not retain, stringify, log,
enqueue or invoke user code with the address record. Consequently there is one
live drop-data graph even when 48 native roots await the close phase. The
shared and terminal terms include their real arrays/closures; embedded close
links are not charged again as separate roots.

The artifact profile must prove `Droot <= 8 KiB`, drop graph `<= 16 KiB` and
shared plus terminal values `<= 80 KiB` from the selected executable,
allocator and V8 bytes. The observed 488-byte base is evidence for that check,
not permission to assume the remaining values. A profile exceeding any cap is
unsupported for coverage and stops before listener construction; the 512 KiB
cell and 16 MiB Wbase do not grow.

No per-drop release is fabricated. Node does not expose the pre-Socket handle
to MessageRouter, so the aggregate `Adrop` reservation remains held while the
listener can accept. Each actual native root reaches the pinned libuv close
phase, but that terminal only reduces the population inside the standing
envelope. During shutdown MessageRouter first withdraws the capability and
closes the listening handle, drains all A/I connections, awaits the server's
actual close terminal, and then crosses one refed public `setImmediate`
barrier. The barrier's check phase is in a later loop turn; with the listener
closed no new accept can occur, and the preceding turn's closing-handle phase
has completed. Only then may the transfer owner release the aggregate Adrop
term with the rest of Wbase. Drop emission, `_connections` decrement and a
Socket `close` projection never release it.

The public `maxConnections = 8/0` A gate remains as D20 specifies. Its purpose
is to prevent a constructed Socket after all eight A cells are owned. It does
not establish the Adrop byte/count bound and does not need to stop the listener
between drops. This correction therefore adds no listener family, raw parser,
private-field mutation, retry owner or arbitrary port.

### One fixed 8 MiB bank with executable subordinate counts

The semantic term remains exactly 8 MiB per admitted root. Its byte maxima are:

```text
Bsend = one fixed outbound graph/string/frame/socket/callback population
                                                              <= 320 KiB
Frecv = max(fixed text Buffer+UTF-16+graph, binary raw+header)
       = max(448 KiB, 640 KiB + 64 KiB)                       <= 704 KiB
Pr    = one retained parsed probe graph                       <= 192 KiB
Fmeta = fixed turn/ledger/late/close/deadline metadata        <= 512 KiB
EbootstrapRetained for a remote endpoint                    <= 1,400 KiB
```

`Bsend`, `Frecv`, `Pr` and `Fmeta` are real disjoint
populations. A Buffer and its aliases are one backing whose release waits for
all aliases; a concat, UTF-16 string, parsed graph, frame or socket copy is a
separate charged value. `Frecv` includes the raw `WiPending` backing and its
bounded parsed/header graph. A copied row remains C, and a binary send remains
H. `Ps` occupies a source `Bsend` slot; `Wo` and `Wr` occupy their own
`Bsend` slots. These labels retain their semantic owners even though the
physical fixed-send bank enforces their aggregate count.

The producer and MessageRouter enforce this one local-attempt population:

| Population | Source role | Recipient role | Colocated union |
| --- | ---: | ---: | ---: |
| callback-owned fixed sends (`Bsend`) | 4 | 4 | 8 |
| transferred inbound populations (`Frecv`) | 2 | 2 | 4 |
| retained `Pr` graph | 0 | 1 | 1 |
| `Fmeta` bank | shared role bank | shared role bank | one deduplicated bank |
| retained bootstrap | one 1,400 KiB earmark | one 1,400 KiB earmark | 0 |

The source role's four send slots are two atomic ACK/fixed-result pairs: one
older pair may remain callback-owned while one current pair is emitted. Before
sending ACK, the responder claims both fixed slots, or one fixed ACK slot plus
the already preowned H result slot. It can therefore always emit the one
result promised by ACK. The recipient role uses at most a previous and current
request slot plus one terminal/control slot; its fourth slot is the
preacquired completion margin. No locally valid send begins without its own
slot.

The source's two receive slots cover the current request and the one already
scheduled successor allowed by D19. The recipient's two slots cover ACK and
the exact JSON or binary result. Semantic permission for N+1 may be recorded
while an old send callback remains, but the local producer waits for the
required physical slot. The requester also waits until the prior ACK/result
raw receive slots reach emitter/consumer unwind before emitting N+1. Waiting
uses the original shared-generation deadline and existing reconcile wake; it
does not turn a valid N+1 into refusal. A third application emitter terminates
the lane under D19 and remains charged in I close scratch rather than creating
a fifth receive slot.

`Fmeta` has at most eight send-credit records, four receive-credit records,
four `pendingMessages` entries, four `pendingResponses` entries, four retired
late contexts, two endpoint turn records, two close records and two existing
deadline/cadence wake records. It also covers the bounded terminal CLOSE
frames and fixed aggregate diagnostics. Every record carries the existing
bounded request/endpoints/roles/boot/admission/connection-generation/ordinal
identity. No payload, row, arbitrary error text, address record or per-retry
history can enter Fmeta.

Physical release, rather than semantic settlement, returns a bank slot:

- a send slot releases on its exact ws callback, synchronous throw or exact
  generation close/drain;
- a receive slot releases after both emitter and consumer/handler aliases are
  terminal, with derived copies separately charged;
- a retired late context releases only after the old lane's response/close
  terminal;
- a deadline retires the lane but releases none of these values by itself.

At most two protocol windows can therefore overlap physically. If callbacks
never arrive, the bank fills, new sends wait, the original deadline retires
the lane, and same-identity redrive waits for the old I/send/late drain. The
30-second/100-millisecond cadence may cause many sequential attempts but
cannot create 300 simultaneous `Bsend` copies.

The byte proof is strict and leaves unused space:

```text
remote endpoint:
  bootstrap 1,400 + 4*Bsend 1,280 + 2*Frecv 1,408
  + Pr 192 + Fmeta 512                              = 4,792 KiB
  fixed term                                        = 8,192 KiB
  margin                                            = 3,400 KiB

colocated atomic source+recipient union:
  no bootstrap + 8*Bsend 2,560 + 4*Frecv 2,816
  + Pr 192 + one Fmeta 512                          = 6,080 KiB
  fixed term                                        = 8,192 KiB
  margin                                            = 2,112 KiB
```

Both remote node orders use the same role banks after the complete lower then
upper E acquisition. Colocation reserves the single deduplicated union before
the probe. More than eight compliant peers cannot add subordinate populations:
only eight root sessions are admitted, and excess peers retain debt under the
existing cadence. For an admitted root, pressure waits within these preowned
slots and cannot consume an ordinary or snapshot budget.

The whole-pool arithmetic remains:

```text
8 MiB row:       Wbase 16 + S 18 + H 2 + C 25 + K 16 + fixed 8 = 85 MiB
16 MiB + 1 byte: Wbase 16 + S (34 MiB + 2 B) + H 2
                 + C (49 MiB + 3 B) + K 16 + fixed 8
                                                               = 125 MiB + 5 B
```

Thus both supported cases can be admitted under 128 MiB; the correction does
not rely on always refusing them. The unused fixed-bank margin cannot enlarge
S/H/C/K, Wbase, a row limit or an ordinary/snapshot message.

### Existing release/runtime owner profile proposal

The release workflow remains artifact-policy/publication-receipt owner. The
existing runtime-provenance measurement remains the boot owner. MessageRouter
only consumes that owner's typed result before Wbase/listener construction; it
does not implement a second provenance check.

The owner publishes one versioned `coverage-runtime-profile/1` for every
distribution form that is to advertise coverage:

| Supported form | Profile binding |
| --- | --- |
| OCI/Helm | immutable final OCI digest -> embedded profile-manifest digest in the existing external release receipt |
| SEA executable | SEA executable digest -> embedded/adjacent profile-manifest digest in the SEA build receipt |
| source/npm and lab | exact `process.execPath` digest, Node/V8/libuv tuple, repository/lock/dependency digest and native-profile digest in the existing build/lab provenance receipt |

The broad Node 22+/npm/source, SEA and Docker/Helm contracts remain inventory;
none is silently relabeled as certified. Each form that must perform coverage
recovery receives its own exact profile. An arbitrary compatible Node 22
binary may continue ordinary and snapshot behavior, but cannot advertise the
versioned coverage capability until the existing build/runtime owner has
certified its exact bytes. The current immutable v0.2.5 image is only the
measurement baseline above. A future rs-raft candidate needs a new receipt and
profile bound to its own final artifact.

The profile manifest contains:

- revision, artifact kind, executable path/size/SHA/build ID,
  `process.versions`, OS/architecture/libc and immutable base identity;
- repository/source, package-lock and installed dependency digests, plus ws
  version and exact receiver/websocket file hashes;
- Node/libuv source archive identities bound by the build owner to the
  executable, and the native constants used by the proof: poll array 1,024,
  repoll count 48, `TCPWrap` 432, embedded `uv_tcp_t` 248, V8 TCP object 56,
  and the attested Droot/drop/shared caps;
- the versioned receive-profile fields and the design ceilings for Aactive,
  I, Mlane, Gc, Bsend, Frecv, Fmeta, S, H, C and K.

The two bindings stay noncircular. Immutable builder and runtime bases are
named by digest in the build. The in-artifact manifest can bind all local
bytes but cannot contain the final OCI digest. After push, the existing release
receipt binds that final digest to the embedded manifest digest. Source/npm,
lab and SEA receipts bind their own final executable instead. Copying an
environment value is not byte measurement; the current distroless image's
missing `/app/package-lock.json` must be repaired by embedding the lock digest
or packaging the lock for the existing provenance owner.

At startup the existing provenance owner verifies the local profile before
MessageRouter allocates Wbase or binds the coverage endpoint. Mismatch returns
a typed `COVERAGE_RUNTIME_UNCERTIFIED`; MessageRouter withholds only the
coverage listener/capability. Ordinary transport and snapshot startup remain
under their current contracts. The existing coverage reconcile/recovery owner
keeps affected CDC debt and prevents only the dependent partition/role from
publishing transaction-serving state. This creates no new global readiness
barrier and no cycle in which coverage is needed to verify the runtime.

One operator policy decision remains explicit: a deployment profile may mark
coverage recovery required. For such a profile, the existing release/deployment
admission must reject an uncertified image/SEA/source receipt before rollout;
runtime does not force an uncertified node ready. A profile that does not
require coverage may start its currently supported ordinary/snapshot surfaces,
but cannot host or publish a partition whose recovery owes this coverage debt.
The release/runtime owner must choose and record that requirement per supported
distribution; MessageRouter cannot infer it from Docker, Helm, Node version or
an open port.

Exact owner changes requiring approval are:

1. digest-pin builder/runtime bases and add the profile-manifest composition to
   the existing release, SEA, source/npm and lab receipts;
2. bind executable bytes to exact Node/libuv source and record the native
   layout/allocator attestation before a profile becomes coverage-capable;
3. make the existing runtime-provenance owner verify the manifest for its
   distribution form and return the typed certification result;
4. make existing deployment admission enforce its declared coverage-required
   policy and deploy OCI images by immutable digest;
5. let MessageRouter consume that result before only the coverage Wbase/bind/
   capability path, while the existing reconcile/publication owners retain
   debt and partition publication authority.

No new provenance store, startup coordinator, retry framework, readiness
owner or global support restriction is introduced.

### Noncircular certification and source HOLD

The gates split by when their evidence can exist:

**Before coverage transport implementation:** the release/runtime owners must
approve the profile composition and supported-form policy; a selected future
candidate profile must bind exact executable/source/dependency bytes and prove
the 48-root Adrop count plus the `8/16/64/16 KiB` envelope components above.
These facts depend on the runtime artifact and existing release machinery, not
on a coverage adapter. Failure keeps the coverage listener absent.

**On a later implementation candidate:** object/copy census verifies
`Aactive <= 448 KiB`, `Mlane <= 48 KiB`, `Gc <= 192 KiB`,
`Bsend <= 320 KiB`, `Frecv <= 704 KiB`, `Fmeta <= 512 KiB` and the existing
S/H/C/K ceilings. Tests must hold callbacks and receive aliases to reach all
declared counts, including old/current windows, bootstrap overlap, late result,
terminate and close drain. These coefficients cannot be measured on code that
does not yet exist; the hard caps and refusal behavior are already fixed here.
An implementation that exceeds them stops and returns to the existing owner
for a real-copy reduction or explicit contract decision.

Product transport, deployment and runtime-policy source remain held until an
independent review accepts this scoped supersession. A future failure may not
increase 128 MiB, enlarge Wbase or the fixed term, shrink the supported rows,
borrow ordinary/snapshot capacity, count native allocations as free, or revive
the one-handle premise.

### Corrected compact ownership timeline

| Phase | Simultaneous ownership | Locally observable transition |
| --- | --- | --- |
| profile/start | Existing provenance owner validates the exact distribution receipt; transfer owner withholds 16 MiB Wbase including standing 512 KiB Adrop | Certified result permits the dedicated bind/capability; typed uncertified result withholds it and leaves existing dependent debt |
| accept/drop | At most eight A cells own constructed paused Sockets; pre-Socket max-connection roots use the standing 48-root Adrop envelope | `drop` retains no record; native close phase reduces its physical population, but reservation remains |
| complete pair | Ibootstrap owns one bounded pair window; both full E units are acquired lower then upper | Surviving bootstrap references move into the 1,400 KiB earmark before the one probe |
| request/ACK/result | Source/recipient role banks own at most four sends and two receives each; responder reserves ACK/result capacity before ACK | ACK settles only PL; exact JSON/binary result settles RD; valid N+1 waits for physical credits without refusal |
| transfer/late input | S/H/C/K remain disjoint; old raw result stays in Frecv/WiPending while next native I phase uses its own slots | Actual emitter/consumer and send callback/close terminals release exact credits; timeout alone releases nothing |
| retry/close | Old I, send and late contexts retain their bank slots; no replacement lane uses them | Existing reconcile cadence redrives only after exact old drain and within the unchanged generation deadline |
| shutdown | Capability is withdrawn; listener, A/I, ledgers, callbacks and native close roots drain while Wbase remains held | Server close plus later public immediate barrier proves no Adrop root remains; Wbase releases once |

### D21 correction mapping

| Failed prerequisite | Effective replacement | Remaining acceptance |
| --- | --- | --- |
| one Adrop native identity | standing 48-root, 480 KiB maximum inside the unchanged 512 KiB aggregate; Wbase owns it before listen through the post-close barrier | selected artifact must attest the conservative root/record/shared sizes and exact Node/libuv source binding |
| cadence-derived or unspecified fixed population | four-send/two-receive role banks, eight/four colocated union, one Pr and one Fmeta; remote 4,792 KiB and colocated 6,080 KiB | later candidate must enforce actual callback/alias terminals and remain within each fixed coefficient |
| developer Node 22.23.2 treated as the target | per-distribution `coverage-runtime-profile/1` under existing release and boot-provenance owners | operator records which supported forms require coverage; the future candidate, not v0.2.5, supplies the final immutable profile |
| implementation-dependent coefficients required before code exists | runtime/native facts close before transport work; adapter copy/object coefficients close on the later candidate against already fixed ceilings | any overrun is a STOP and owner decision, never a silent coefficient or pool change |

This is a design correction only. It does not approve product source, tests,
runtime policy, deployment changes, metadata or publication, and it does not
reopen the closed caller or transaction semantics.

## D22-D23 effective shutdown terminal and supported-profile correction

The exact D21 subject is retained by the round-ten review as
`subject-0d725dc4.md`, SHA-256
`0d725dc43b55eaaa4af10fe1b3eae809f96bbfabfeebef0d25e053be5cf06399`.
The complete independent report has SHA-256
`81881308e0b4fc2ac4161cf3ae051d94591fc5a636a05d6e0750d7b705d5310e`.
Its diagnostic directory is
`test-output/continuation-20261011/cdc-c17-round10-review` in the retained
rs-raft candidate worktree. `diagnostic-sha256.txt` has SHA-256
`576baff8ee80da5bc83cde5bf351cd2d18a859eb34fdab5a3c86df631a81a2f6`,
`navigation.json` has SHA-256
`94ecff53f842f1c23c994733f078c77d73bd8a4b6eac8ca8e6c2b691b4b397f4`,
`commands-and-results.md` has SHA-256
`0689546e204c62da873751756439d67d2841ee1152f0e8fcb75c0aefc26024c9`,
and the official Node-source `native/manifest.json` has SHA-256
`481b017d885a77e51898096a72ebe5c4ee651c0f7c019683cd4bbf1fbb6f8271`.

This section supersedes only two D21 clauses:

1. The single `setImmediate` after a server `close` projection is withdrawn.
   The shutdown owner uses the two-check terminal below and retains all native,
   destroy and barrier custody through its real handoff and unwind.
2. A release/platform profile may not declare an existing required recovery
   workflow optional. The profile inventory and mismatch policy below replace
   D21's unconstrained required/optional choice.

The standing 48-root Adrop population, its 480 KiB maximum inside the unchanged
512 KiB reservation, the 4,792/6,080 KiB fixed banks, complete lower-then-upper
pair, ACK/result interaction, D19 receive phases, ordinary/snapshot isolation,
128 MiB/eight-root limits and supported row cases remain operative. Future
adapter coefficients remain later source gates. The caller source at
`2de419483c9b4ce9e3fabc87bb54d93e4afb8817` remains closed.

### D22: final native custody through every shutdown entry phase

The round-ten diagnostic uses the exact measured Node 22.22.0 executable and a
separate client. When shutdown is requested from the drop callback's microtask,
the observed order is:

```text
drop -> shutdown-request -> server-close -> first-immediate -> second-immediate
```

At the first immediate, the heap still has one 432-byte
`Node / TCPSocketWrap` and one 432-byte `Node / TCPServerWrap`. At the nested
second immediate it has neither. This follows the pinned loop: JavaScript check
callbacks run before `uv__run_closing_handles`; a new immediate scheduled by
the first immediate cannot run in that same check phase. The closing-handle
phase therefore occurs before the nested immediate. Native async-destroy
immediates created by that close run before the later JavaScript immediate in
the selected Node profile. Server `close`, `_connections == 0`, Socket `close`
and async-hooks destroy notification remain projections rather than release
authority.

MessageRouter's existing idempotent shutdown operation owns one coverage drain
record keyed by boot and listener generation. Later shutdown calls await that
same record. It has these states; they are phases of the existing operation,
not a second lifecycle framework:

```text
accepting -> quiescing -> draining -> first-check -> second-check
          -> shutdown-owner handoff -> released
```

The phase rules are:

1. `quiescing` synchronously withdraws the coverage capability, prevents new
   dial/admission, sets the public max-connections gate to zero when a server
   exists, and requests listener close. A startup error, partial bind or normal
   shutdown all enter this same operation once Wbase has been withheld.
2. `draining` waits for both sides of the actual ownership graph: the listener
   has produced its close/error terminal, and every A, Iout, Iin, receiver,
   HTTP head/write, pending/late ledger, send callback, deferred emitter and
   connection-generation close reference is at zero or has transferred to its
   named downstream owner. A shutdown timeout may report pressure but cannot
   release Wbase or authorize a successor.
3. After those conditions hold, the owner schedules a refed first public
   immediate. It retains Wbase and performs no release. Its only transition is
   to schedule the refed nested second immediate for the same generation.
4. The nested second immediate executes after at least one closing-handle phase
   following the first callback. The selected runtime profile also proves that
   native async-destroy bookkeeping from that phase runs before this JavaScript
   callback. The callback verifies the unchanged generation and drain counts;
   it does not itself return Wbase.
5. The second callback signals the existing shutdown continuation and returns.
   Its `Immediate` record, callback closure and stack aliases are still owned
   until that return. Only the existing MessageRouter shutdown continuation,
   reached after the callback unwind, may perform the once-only Wbase release.
   The small completion record and any terminal scheduler bookkeeping transfer
   atomically from Adrop's terminal term to the already existing MessageRouter
   shutdown-operation and Node Environment scheduler custody for that final
   continuation; neither can be used for traffic or admission. On continuation
   return, MessageRouter releases its record. Node Environment releases its
   numeric async-destroy entry through its existing native-immediate owner.

The certified Node timers implementation is part of that terminal premise.
The reviewed Node v22.22.0 source is
`https://raw.githubusercontent.com/nodejs/node/v22.22.0/lib/internal/timers.js`,
SHA-256
`c0cb11238d8f10aba653926c9c0ee28aa7f49593100de7f013ffd61b9fa45c42`;
the selected artifact profile must bind its equivalent executable source.
`processImmediate` removes the running list from the public queue, marks the
Immediate destroyed, and in its `finally` clears `_onImmediate`, emits only the
numeric async-destroy identity when hooks exist, and advances the outstanding
queue. The awaited shutdown continuation cannot resume until the second
callback and `processImmediate` have returned to the microtask checkpoint.
Therefore the callback closure and Immediate queue link are gone before Wbase
release; a possible remaining destroy identity has already transferred to the
Node Environment native-immediate owner. The selected profile must bind these
exact timer/native-immediate semantics. A runtime with different ordering is
`COVERAGE_RUNTIME_UNCERTIFIED` before listen.

The unchanged Adrop arithmetic explicitly includes the terminal mechanism:

```text
48 Droot values                                             <= 384 KiB
one synchronous drop graph                                 <=  16 KiB
native poll/close/async-destroy shared bookkeeping          <=  64 KiB
two Immediate records/closures + completion handoff record <=  16 KiB
---------------------------------------------------------------------
standing maximum                                           <= 480 KiB
reservation                                                  512 KiB
margin                                                        32 KiB
```

The 16 KiB terminal term includes both scheduled Immediate objects, both
callbacks, the generation/drain state, the completion promise/record and the
exact handoffs into the existing shutdown continuation and Node Environment
destroy queue. Nothing in that term is called free at second-callback entry.
The handoffs are required because an executing callback cannot prove its own
return. MessageRouter's handoff is bounded to one record per shutdown and has
no queue; Node's handoff is one bounded numeric destroy entry per terminal
Immediate under the profile's 64 KiB shared cap. The MessageRouter record
cannot overlap a successor listener generation because restart/listen is
forbidden until that record reaches `released`. The Node-owned scalar may
outlive that point, but it has no Wbase backing and carries no transfer release,
admission or generation authority; its overlap cannot duplicate transfer
capacity.

All entry phases converge on the same terminal:

| Shutdown entry | Custody before the first check |
| --- | --- |
| Wbase withheld, listen never invoked | No listener/native root exists; cancel construction and use the same two-check operation before releasing the standing reservation |
| bind/listen pending | Retain Wbase through bind callback or error, close any constructed handle, then drain and cross both checks |
| listening with no A/I | Close listener; dropped/server native roots and destroy bookkeeping remain Adrop through both checks |
| listening with live or retired A/I | Close listener, drain every exact A/I/send/receive/HTTP generation first, then cross both checks |
| startup failure after coverage bind | Withdraw the unpublished capability, close coverage and any later-started server under their existing owners, then run this coverage terminal |
| repeated shutdown or restart request | Await the same generation record; no duplicate checks, release or successor claim is created |

If scheduling either refed immediate throws or the certified phase ordering is
not present, Wbase remains owned and shutdown reports a hard runtime-profile
failure. Process termination may let the operating system reclaim memory, but
is not an in-process release or capacity wake. No A/I/E/root admission waiter
is notified until the post-unwind continuation has completed the once-only
release.

The future native witness must retain the diagnostic's positive distinction:
one dropped and server wrapper at the first immediate, zero at the second. It
also covers shutdown before listen, during bind, with empty A/I, with held
HTTP/ws/send/deferred callbacks, repeated shutdown and restart. Each case must
show the two Immediate records and completion handoff, pending native destroy
bookkeeping, one release and no successor using the old generation. This is a
later source witness, not a demand for an unimplemented adapter before design
approval.

### D23: profiles preserve every existing required recovery workflow

`coverage-runtime-profile/1` remains owned by the existing release/platform
and boot-provenance surfaces. Its inventory is based on existing product and
deployment promises, never on a MessageRouter choice:

| Existing delivery surface | Required profile treatment |
| --- | --- |
| published npm/source node service | Each platform/runtime combination that the existing platform owner supports for node startup, restart and CDC/cache recovery must have an exact executable/source/dependency profile before release acceptance |
| published SEA node executable | Each supported SEA artifact/platform digest must carry a matching profile in the existing build/release receipt |
| Docker image deployed by Helm | The final immutable OCI digest and embedded manifest must be certified together; the chart cannot qualify a different or mutable image for the required recovery workflow |
| canonical lab/release candidate | The exact executable, source, dependencies and platform receipt must match a certified profile; lab evidence certifies only that exact candidate and does not widen public platform support |
| existing non-server tool or explicitly non-recovery mode | It needs no coverage profile only when the current platform owner already excludes node recovery from that mode |

The package `engines.node >=22.12.0` field remains an installation/runtime
floor. It is not evidence that every future Node patch, libc, operating system
or architecture satisfies the native allocation profile. The release/platform
owner selects and records the concrete supported profile matrix. That owner
may make a separate explicit support-contract change through its own authority,
but this transport design cannot narrow the matrix, convert an existing
recovery-capable mode to ordinary-only, or call an uncertified required
workflow acceptable.

For every currently advertised delivery form whose node may start without
current debt and later restart with durable CDC/cache coverage work, coverage
certification is required before that form's rs-raft release/readiness
acceptance. If any required form lacks a selected profile, the candidate
release is stopped for that form. It is not published as a partially capable
replacement and is not made to pass by marking recovery optional. The v0.2.5
image remains measurement evidence only; it cannot satisfy a future candidate
profile. No new feature flag or deployment value may disable an advertised
required recovery workflow to qualify this candidate.

At boot the existing provenance owner returns one typed local result before
Wbase/listen. A required-profile mismatch remains
`COVERAGE_RUNTIME_UNCERTIFIED`: the coverage capability is absent, the durable
obligation remains owed and the existing startup/recovery owner applies its
existing HOLD/readiness rule. MessageRouter neither decides whether the form
is required nor publishes a weaker ready state. Ordinary or snapshot startup
without coverage is permitted only when the preexisting platform contract
already permits that exact non-recovery mode. This correction creates no new
optional mode, global readiness owner or dependency on the CDC cache to verify
local runtime bytes.

The release/platform decision required before implementation is concrete:

1. enumerate the current supported node delivery forms and platform/runtime
   combinations that promise startup, restart and CDC/cache recovery;
2. select an exact artifact-bound profile for every such combination, or stop
   that form's rs-raft candidate release until the existing support-contract
   owner explicitly changes the promise;
3. bind npm/source, SEA and OCI/Helm receipts as D21 specifies, and distinguish
   exact lab certification from public release support;
4. make the existing boot-provenance result carry the selected profile identity
   and required-workflow disposition to existing startup/recovery consumers;
5. preserve typed HOLD and durable debt on mismatch without primary/snapshot
   fallback, force-readiness or MessageRouter policy inference.

This is a release/platform owner choice about concrete profiles, not permission
to downgrade a required recovery workflow. The fixed Adrop/profile facts close
before transport implementation; Aactive/Mlane/Gc/Bsend/Frecv/Fmeta/S/H/C/K
measurements still close against their fixed ceilings on the future adapter.

### D22-D23 complete allocation and final-release timeline

| Phase | Complete ownership | Transition or terminal |
| --- | --- | --- |
| release/profile | Existing release owner binds every required delivery form to an exact candidate profile; boot provenance verifies local bytes | Unsupported required form stops release; local mismatch returns typed HOLD before Wbase/listen |
| Wbase/listen | Transfer owner withholds all 16 MiB, including standing Adrop and both terminal checks, before listener construction | Bind failure enters the same shutdown record; no partial release |
| accept/transfer | Adrop owns up to 48 pre-Socket roots; A/I and complete E banks own their disjoint live/retired HTTP/ws/send/receive/semantic copies | Existing D15-D21 acquisition, ACK/result and physical-credit rules apply |
| quiesce/drain | Capability is withdrawn; listener close is requested; all old A/I/E/send/receive/native identities remain charged | Server/Socket close projections and timeout release nothing; exact downstream transfers and drains finish first |
| first check | Wbase owns native wrappers and destroy bookkeeping; its terminal term preowns both barrier records, with the first record executing | First callback allocates the second record from that preowned term for the same generation and returns without release |
| native terminal | Pinned close phase deletes detached native wrappers; pinned native-immediate phase drains their destroy bookkeeping | These phases occur before the nested JavaScript immediate for the certified profile |
| second check | Wbase still owns the second callback and completion record; generation and zero-drain facts are revalidated | Callback signals completion and returns; it cannot release its own executing references |
| final handoff/release | After `processImmediate` returns, the exact completion record is in existing MessageRouter shutdown-operation custody and any scalar destroy ID is in Node Environment native-immediate custody | Existing shutdown continuation releases Wbase once and then its completion record; Node drains its scalar under the certified scheduler. The scalar is outside transfer ownership and carries no release capability; restart may allocate a new generation only after the once-only Wbase release |

### D22-D23 correction mapping and HOLD

| Finding | Effective correction | Remaining source gate |
| --- | --- | --- |
| D22 first immediate precedes native close | two nested public immediates after listener and A/I drain; second callback only signals, and post-unwind shutdown continuation performs once release | exact profile attests close/native-immediate order and future witness covers every entry phase and terminal reference |
| D23 optional label could remove required recovery | every currently supported recovery-capable delivery form requires a concrete certified profile before its release/readiness acceptance | release/platform owner records the exact supported matrix and future candidate receipts; arbitrary Node floor is not certification |
| accepted D21 population | 48-root standing Adrop and 4,792/6,080 KiB fixed banks remain unchanged | conservative native caps close preimplementation; adapter coefficients close on implemented source |
| accepted prior scope | complete pair, both node orders, colocation, old fragments, actual callback release, ordinary/snapshot isolation and caller 2de remain | cumulative source, startup/recovery and merge witnesses remain HOLD |

Product transport, runtime policy, release/deployment source, tests, metadata,
publication and merge remain unapproved. This section changes no pool, row,
deadline, retry, caller or transaction semantics.

## D24 effective scheduler-record custody correction

The exact D22-D23 subject is retained by the round-eleven review as
`subject-ce9e463c.md`, SHA-256
`ce9e463cdfa829c1e5fd83ec49bde87fca0258d615b87b72582b46048ce23201`.
The complete independent report has SHA-256
`24c5c10ad6a0cd4ef9f39b8637b9e1777a6b9a70f0b24d40d1d4fe370c0797d`.
Its diagnostic directory is
`test-output/continuation-20261011/cdc-c17-round11-review` in the retained
rs-raft candidate worktree. `diagnostic-sha256.txt` has SHA-256
`a2d93b3c6a7b22467974445ac2d559b7d1fc6f02b276dbf167cf46d5ac029585`
and `navigation.json` has SHA-256
`ff182302edce4df95a66f44d39f88b98658882da8accfbd424196d68113c25e7`.

This section supersedes only D22's claim that the awaited shutdown continuation
necessarily runs after `processImmediate` has returned, its scalar-only final
handoff, and the corresponding final timeline row. Every earlier per-listener
reference to returning or releasing all of Wbase now means the once-only
`Wlistener` return below; `Rterminal` is continuously retained. The two public
checks remain the native close boundary. D23 remains closed at design scope.
The standing 48-root population, fixed subordinate banks, complete-pair order,
ACK/result interaction, receive phases, original pool and supported row
equations remain unchanged. The caller source at
`2de419483c9b4ce9e3fabc87bb54d93e4afb8817` remains closed.

### Actual residual graph and its existing owners

The selected Node source detaches the current Immediate list from the public
queue, then invokes `runNextTicks` between callbacks. If the second coverage
callback settles the shutdown promise and an ordinary companion Immediate
follows it, the shutdown continuation can run inside that checkpoint while
`processImmediate` is still on the stack. At that point the second callback is
cleared, but these references can coexist:

1. Node's `prevImmediate` stack slot retains the executed second coverage
   `Immediate`; that object retains its already allocated `_idleNext` pointer
   to the ordinary companion;
2. Node's current-list and `immediate` stack slots retain the companion and the
   rest of the detached ordinary list;
3. the MessageRouter shutdown continuation retains its completion Promise/
   reaction, generation/drain record and the transfer release capability; and
4. when async destroy hooks exist, Node's destroy queue retains the coverage
   Immediate's scalar async ID.

The round-eleven diagnostic observes exactly the first item at the continuation:
one marked 136-byte instrumented `Immediate` with `_onImmediate` cleared and
`_idleNext` pointing to the companion. Its stack contains `runNextTicks` and
`processImmediate`. The marked record is absent at the later control. The
136-byte value identifies the mechanism and is not a production coefficient.

Physical and semantic ownership stay with existing owners. Node Environment
owns the detached-list nodes, scheduler stack slots and destroy queue.
MessageRouter owns one shutdown generation and its completion reaction.
`CdcCoverageTransferOwner` owns the bytes and the only capacity-release token.
The ordinary companion and later ordinary-list nodes remain charged to their
existing scheduler/caller contracts: the coverage-attributed byte is the
pointer field in its own Immediate record. At the observed checkpoint Node's
current `immediate` slot independently retains the companion, so the coverage
link does not make the ordinary list a second CDC allocation.

### Standing terminal subreserve

D22's already preowned 16 KiB terminal term becomes `Rterminal`, a node-lifetime
subreserve of the existing 16 MiB Wbase claim. This is a lifecycle split in the
existing transfer owner, not a new pool, session, store, scheduler or root
token:

```text
Wbase while a listener generation is active
  = Wlistener (16 MiB - 16 KiB) + Rterminal (16 KiB)

retained base ownership after that generation returns listener capacity
  = Rterminal (16 KiB), still retained by the same node-pool owner
```

The first coverage activation withholds the complete 16 MiB atomically.
`Rterminal` is never placed on a free list and never produces a wake between
listener generations. A successor reserves only `Wlistener`; together its
listener claim and the standing `Rterminal` are the same 16 MiB Wbase already
used by every whole-pool equation. `Rterminal` is infrastructure and consumes
neither one of the eight root-session identities nor a subordinate wire token.
It cannot be borrowed by row data, ordinary traffic or snapshot transfer. It is
never returned to the transfer pool during the Node Environment's lifetime,
even when no endpoint or wake is currently registered: absence of a current
waiter does not prove that a later in-process successor cannot start. The Node
Environment/process teardown reclaims it with the rest of the process and emits
no pool wake.

The selected runtime profile and future implementation must prove this complete
maximum inside the existing 16 KiB term:

| Terminal population that can coexist | Count bound | Byte ceiling |
| --- | ---: | ---: |
| coverage `Immediate` records, including callback/cleared-callback fields, async symbols and their own list links | 2 | 4 KiB |
| MessageRouter shutdown generation/completion Promise/reaction records | 2 | 8 KiB |
| coverage-attributed `processImmediate`/`runNextTicks` stack and list alias slots, at most two scalar destroy IDs, and the fixed transfer handoff descriptor | one active alias set | 4 KiB |
| **Total** | finite population above | **16 KiB** |

The two-Immediate maximum covers the worst real overlap: the old second record
can remain on the executing list while a synchronous release wake queues the
successor generation's first check. The successor cannot execute that first
check or create its nested second check until the old `processImmediate` has
finished. At first-check entry the old executed record and its stack/list aliases
are therefore terminal; the bank changes generations before the new callback
allocates its nested second record. Repeated shutdown calls share one generation
record. A third shutdown generation cannot reach a check while the successor
still owns `Wlistener`. Thus two coverage Immediate records and two completion
records are conservative simultaneous maxima, independent of the number of
ordinary companion callbacks.

The 4/8/4 KiB subdivisions are hard design ceilings, not values inferred from
the 136-byte diagnostic. Exact shallow objects, retained coverage closures,
Promise reactions and coverage-attributable aliases must be measured on the
selected artifact and must fit both their subdivision and aggregate ceiling.
An overrun is a source STOP requiring a real-copy reduction or owner decision;
it cannot increase the pool, Wbase or the terminal term.

### Atomic terminal transfer before the synchronous wake

The second check still only validates the generation/drain facts and settles
the existing completion. Its awaited continuation may run either after
`processImmediate` or at the demonstrated between-callback checkpoint. It uses
one compare-and-transfer operation on the existing Wbase claim. Under the
`CdcCoverageTransferOwner` mutation that operation, in this order:

1. matches the exact boot, listener generation, Wbase claim and shutdown record,
   and refuses a stale or already transferred call;
2. writes the MessageRouter record as `terminal-transferred`, consumes its sole
   Wlistener release capability, and replaces every transport/resource pointer
   exposed to later callers with a fixed terminal result;
3. records in `Rterminal` the old generation plus the actual occupied
   Immediate/list/stack/completion/destroy categories and count, while Node and
   MessageRouter retain the physical references named above;
4. reduces the pool's retained byte count by exactly `Wlistener`, leaving the
   16 KiB `Rterminal` continuously held; and only then
5. invokes the existing transfer-owner wake callbacks synchronously.

There is no free interval between steps 3 and 4. A wake that immediately starts
or stops a successor sees the old generation terminal, cannot acquire its
release token, and reserves only the new `Wlistener`. It may queue one new first
check into the unused second Immediate slot. The old continuation performs no
pool or generation mutation after the wake; it returns through Node's actual
list and Promise machinery. External callers may retain the settled shutdown
Promise under the ordinary call contract, but the fixed terminal result contains
no Wbase token, transport graph or successor authority.

No callback is added to discover the old callback's return. If no successor
ever runs a first check, the conservative old descriptor can remain in the
standing bank without growing or withholding another root session. If a
successor later reaches its existing first check, that entry itself proves that
the prior `processImmediate` invocation and old stack/list aliases have ended;
MessageRouter supplies that phase fact to the existing transfer owner, which
replaces the old fixed descriptor with the current generation's descriptor
without returning capacity or firing a wake. Node independently drains its
scalar async ID under its certified scheduler contract.

If the exact transfer fails, its identity has changed, or any count/byte ceiling
would be exceeded, Wlistener remains owned, no wake runs and restart remains
blocked. A shutdown timeout, callback settlement, cleared `_onImmediate`,
server/Socket close or async-destroy notification cannot bypass this operation.

### Corrected whole release and successor timeline

| Phase | Complete custody | Capacity/restart effect |
| --- | --- | --- |
| active generation | Existing owner holds `Wlistener + Rterminal = 16 MiB`; A/I/E/native and terminal slots retain their exact identities | No successor listener generation can acquire Wlistener |
| drain and first check | MessageRouter drains all A/I/HTTP/ws/ledger/send/emitter references; Wbase still holds native and terminal capacity | Timeout or close projection releases nothing |
| native boundary | First check queues the nested second; the intervening native close and native-immediate phases retire the detached TCP roots | Second check may run only after this boundary; D22 remains operative |
| second callback | `Rterminal` owns capacity for the executing second record and completion; callback settles once and returns | No capacity changes and no wake runs |
| continuation checkpoint | Old second Immediate/list/stack aliases, completion reaction and possible destroy ID remain physically owned as above | Exact compare-and-transfer installs `terminal-transferred` and its bounded descriptor before release |
| Wlistener return | Transfer owner retains `Rterminal`, consumes the old release token, subtracts only Wlistener, then synchronously calls existing wakes | A successor may reserve Wlistener immediately, but cannot mutate or release the old generation |
| successor overlap | At most the old second record and a queued new first record, plus their two completion records, occupy the standing 16 KiB | New first-check entry proves the old scheduler aliases ended before it can allocate new second check; no third barrier or recursive callback |
| process owner teardown | Standing bank has no traffic authority and no population growth; it remains reserved across listener generations and endpoint-free intervals | It is never returned to an in-process waiter; Node Environment/process teardown reclaims it with the remaining scheduler state |

The whole supported equations remain `85 MiB` for the 8 MiB row and
`125 MiB + 5 B` for one 16 MiB-plus-one-byte event: active
`Wlistener + Rterminal` is exactly the existing 16 MiB Wbase, never an added
16 KiB. The 48-root 480 KiB Adrop maximum remains inside 512 KiB, and the remote
4,792 KiB and colocated 6,080 KiB subordinate banks remain inside the same
8 MiB fixed term.

### D24 source gate and retained scope

The future source witness must run the round-eleven ordinary-companion schedule
and show: the residual record at the continuation; exact category/count/byte
occupancy; terminal state and consumed old token before the transfer owner's
synchronous wake; a wake that starts and immediately stops a successor; at most
the declared two/two population; one Wlistener return; no stale release of the
successor; and unchanged pool arithmetic. It must also retain D22's positive
first/second native-wrapper distinction and every shutdown entry phase.

This is a design correction only. Product transport, runtime policy,
release/deployment source, tests, metadata, publication and merge remain HOLD.
It introduces no scheduler, ledger, retry owner, timing barrier, global cap,
pool increase, ordinary/snapshot borrowing or support downgrade. D23 and caller
2de remain closed.
