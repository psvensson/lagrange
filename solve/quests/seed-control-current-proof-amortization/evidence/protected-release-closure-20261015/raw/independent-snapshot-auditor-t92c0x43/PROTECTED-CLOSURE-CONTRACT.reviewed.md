# Protected closure: one maintenance slot, two typed carried operations

Design and verification evidence only, pinned to
`0c981c7b18eabd11b021d8ddbaccd506a5e1a666`. No production command exists here.
The accepted RETIRE_AND_APPROVE contract and its evidence remain unchanged.
This supplement selects **RETIRE_AND_HOLD** for the corresponding closure race.
Production implementation, merge and successor activation/sealing remain HOLD.

## Choice, authority and opportunity

One explicitly typed maintenance command retires eligible release history and
evaluates one immutable HOLD in the same application transaction. It uses the
SAME M slot, fixed receipt, occurrence accounting and future-result escrow as
RETIRE_AND_APPROVE and pure RETIRE. It adds no slot, queue, permit or ledger.
There is no interval in which competing refusals can occupy the child's result
space after retirement but before the carried HOLD is evaluated.

The release continuation (`runCutoverAttempt` in
`src/node/replica-handler-participant-cutover.js:245`) owns legitimate release
intent and the transition from closing to drain/settlement/release. Today it
raises local PAUSE at line 273 and later pauses the observed cohort; it does
NOT submit committed HOLD. That is the existing semantic owner to extend.
The partition admission owner (`raiseParticipantCutoverPause` and
`invalidateParticipantReleaseAdmission` in
`src/partition/partition-participant-transaction-pause.js:204,:229`) owns immediate
local D3 closure. It neither records nor proves committed cohort-wide HOLD.
The runtime owns custody; the committed application owner alone decides HOLD's
result. None derives a neighbor's truth from a cache or missing waiter.

A closure intent has a selected reason from OPERATOR, RECOVERY, COHORT_CHANGE,
BUILD_CHANGE, TOPOLOGY_CHANGE or CAPACITY and an originating release invocation.
Invocation authorization stays at producer ingress. Today the existing release
authorization owner stores handler/partition/target-build tokens in a local
WeakMap and cutover consults it only when origin is missing. It does not bind
M/K/G or constitute replicated proof. D2 checks durable origin, canonical
identity and exact expected state; it MUST NOT consult that WeakMap or a local
authorization boolean. The native command ingress authorization/activation
extension remains explicit prerequisite work; a reason string grants nothing.
This packet does not define all policy events that mandate global closure.
In particular, ordinary admitted staging/PREPARED work and every local D3
invalidation are NOT implicit requests to revoke replicated authorization.
The concrete producer is the closing phase of an already-authorized release
invocation. Other producers must route into that owner with explicit intent.
Durable recovery of an unadmitted operator intent is not invented here.

The protected opportunity begins only when the reconciled runtime synchronously
claims M for the complete immutable command AND its occurrence and result
charges, before retaining bytes across an await. It ends at an authoritative
disposition or proof that every possible occurrence was discarded. Local D3
may close sooner. An unadmitted caller has no committed outcome or M right.

At M free, the existing per-partition release continuation selects its current
closing phase before constructing a new opening or pure-maintenance intent.
Selection and the runtime claim are one synchronous handoff; a failed claim
returns NOT_ADMITTED(MAINTENANCE_BUSY) and leaves the existing owner phase pending.
This is a proposed change to that continuation, not today's
target-build coalescing map and not a second scheduler. Local and forwarded
new M commands go through the same single runtime claim. No caller priority
announcement can preempt an M already owned. This rule makes the continuation's
own OPEN/recovery shortcut unable to skip its closure phase; it does not promise
that every external caller wins M under adversarial independent arrivals.
The protected guarantee is for accepted custody, matching the accepted opening
contract. Stable service of an owned M, not a priority bit, supplies progress.

Required phase placement is concrete: on retained origin, resolve existing
custody/result and perform the closing intent before the current OPEN return
in recovery, measured-build/census/drain checks, or `releaseControlOwnerFirst`.
Today cutover awaits that control partition's successful CUT_OVER at lines
269–270 BEFORE raising local PAUSE at 273. That dependency must not gate the
new closing phase. Raise D3 locally at the legitimate closure boundary, then
obtain actual release state/origin through the prefix owner without requiring
the opening census. Missing origin routes to the separate INIT/activation
contract; do not manufacture an initialized authority. Unknown closure remains
in custody resolution. HELD or ALREADY_HELD completes that closing intent;
recovery must not repeatedly retire history because D3 remains closed while
settlement proceeds. A refusal finishes that exact request, not the legitimate
ongoing need; a refreshed NEW intent requires the owner to re-evaluate that need.
This phase placement is selected future behavior, not an existing native proof.

Selected internal handoff (NEW interface, existing owners): the per-partition
release invocation synchronously installs phase CLOSING with its invocation
identity, origin, immutable candidate bytes if constructed, deadline and runtime
generation. Runtime `claimMaintenance` returns JOIN/ticket, exact result,
HISTORY_RETIRED or NOT_ADMITTED plus its custody revision. Distinct exact M/K
must not join merely because today's RUNS targetBuildDigest matches. Runtime
emits `maintenanceCustodyChanged(partitionId,origin,runtimeGeneration,revision)`
after authoritative application/discard/reconstruction changes availability;
the release consumer enqueues its existing partition reconcile. Subscribe then
read/recheck revision around a busy claim so a free-slot edge cannot be lost.
The callback only wakes; it cannot free a charge or authorize closure. Recheck
invocation, hosted service, origin and runtime generation when the queued work
runs, and after any await. Old callbacks/continuations cannot act on replacement
runtime state. Existing bounded retry remains a fallback, not proof of discard.
Deadline expiry ends an unadmitted invocation explicitly; an admitted request
loses only its waiter and remains owned. A new process reconstructs custody
before creating work, but does not resurrect an absent unadmitted invocation.

If older RETIRE/RETIRE_AND_APPROVE/RETIRE_AND_HOLD owns M, finish or authoritatively
discard that exact request first. Its failure does not require a successful
APPROVE. Re-read its outcome and authoritative state before constructing a NEW
closure intent; never retag or overwrite unknown bytes. A previously constructed
unadmitted HOLD can legitimately conflict after that state change. Its own
outcome ends that attempt; a subsequent intent gets a fresh nonce/expected state.

## Canonical bytes and persistent results

Retain the selected fixed-order JSON/UTF-8, bounded strings, exact unsigned
64-bit decimal counters and recomputed hashes. No wrap or Number coercion.

```
H = ["partition-release-retire-and-hold/1", partitionId,
     [originIndex, originTerm], fromG, canonicalChildHold]
M = SHA256("lagrange/partition-release-retire-and-hold/1\n" + bytes(H))
child = ["partition-release-request/1", "HOLD", partitionId, origin,
         nonceHex32, fromG+1,
         [releaseVersion, status, authorizationIdOrNull,
          lastTransitionIndex, lastTransitionTerm], [reasonCode]]
K = child request identity under the existing selected child domain
```

Parent binds every child byte; validate partition/origin/kind/G relationship,
canonical grammar, digest and complete encoded size before custody. Only the
parent is proposed. The child is a NEW explicit next-history-generation intent;
no unknown old request acquires a new G. `transactionEpoch`, release version,
history generation, exact request identity and runtime generation remain distinct.
Routing/session/deadline metadata is not an editable part of canonical contents.

Extend only the accepted fixed receipt's commandKind union to RETIRE_AND_HOLD.
Its format remains the proposed `partition-release-retirement/2`: last M,
from/to G, actual index/term, child K, original disposition/reason and tagged
KNOWN/UNAVAILABLE/NA conflict attribution. Child detailed result is recorded
by the existing committed-result owner's proposed typed release adapter.
Both positions are the ACTUAL parent application position. Retirement applied
does not imply HOLD accepted. D4 reads these recorded outcomes, separately from
current authority and receiver-local D3. A result-schema implementation is new
work; existing generic SQL outcome rows do not already implement these semantics.

## Deterministic transition table

| Input at actual application prefix | Atomic effect / answer |
| --- | --- |
| Valid parent current fromG, exact APPROVED expected tuple | Retire eligible old release results, advance history G, set HELD with releaseVersion+1/auth NULL/actual transition position, record child HELD and fixed parent receipt, advance applied boundary. |
| Valid parent current fromG, exact HELD expected tuple | Same maintenance/result effects; child ALREADY_HELD; no release-version or transition-position change. |
| Expected tuple differs | Maintenance still applies; record exact EXPECTED_STATE_CONFLICT with captured original winner; release state unchanged. No new admission. |
| Matching retained last M and canonical bytes | Original parent/child outcome, no G/version/result allocation. Validate receipt/result consistency and historical position <= current applied boundary. |
| Different old M / K below coherent frontier | HISTORY_RETIRED, historical disposition UNAVAILABLE; not NOT_COMMITTED, not today's winner, never execute fresh. |
| Same supplied identity with different canonical bytes | ID_CONTENT_CONFLICT; original result/custody untouched. Recomputed identity must agree. |
| Distinct M while one may still apply | NOT_ADMITTED(MAINTENANCE_BUSY), no authoritative annotation or result allocation. |
| Environmental atomic-write failure | Roll back history, result deletion, release effect, child result, receipt and applied position; retain custody. |

HOLD has NO PREPARED/staging/drain/query-CLEAR/build-measured predicate. Those
cannot prevent safe closure of new admission. It still has the selected exact
origin, canonical identity and expected-state checks. Producer authorization
remains separate from deterministic D2. No replica-local
queue, timeout, quota debt or D3 fact participates in deterministic application.
Capture bounded conflict attribution from the actual prefix before deletion;
replay never substitutes a newer winner. History G advancing despite child
refusal is the intended maintenance effect, not consumption of release authority.

Retain all accepted edge classifications: malformed compound rejected before
custody; future G, unsupported replicated format, corrupt result/receipt or
violated replicated retention invariant at committed apply is typed recovery
HOLD with no partial application. Actual I/O failure is environmental failure.
Follower-local over-profile accounting cannot refuse or stall a supported
committed command. Release-version exhaustion preserves the selected final
closing increment; max history G is explicit migration HOLD, never wrapping.

The same retirement dependency remains: release authority is self-contained;
TX/query obligations carry their complete necessary bindings. Do not erase a
result that is their sole unresolved proof. If this dependency fails, no claimed
protected progress at that boundary; return RETIREMENT_PINNED before new M
admission. Existing obligations retain their settlement path. Choosing H does
not magically cure pins, unsupported encodings or an unwritable store.

## Custody and recovery, shared by opening and closing

| Stage | Exact charge / owner transition |
| --- | --- |
| Pre-core | Runtime claims (partition, origin, M, canonical digest) plus whole command bytes and future child/receipt reservation; local/forwarded creation uses one gate. |
| Core-held or uncertain forwarding | Keep charge and original bytes; ACK or waiter removal is not discard. Attach actual occurrence (index,term,digest) only when owned evidence exists. |
| Ready-held / deferred host persistence | Same ticket; generation/role loss does not release it. Drain/reconstruct accepted work before new creation. |
| Durable unapplied suffix | Store-owned atomic append/replacement supplies retained and removed occurrences with exact old/new boundary. A committed occurrence cannot be discarded to fit a profile. |
| Applied | One existing application transaction exchanges future-result escrow for child row and parent cell; actual applied position changes in that transaction. Runtime consumes only the applied occurrence's charge. |
| Retained outcome | Result owner keeps exact result until permitted generation retirement; exact retry allocates no new entitlement/annotation. |
| Physical duplicate | Each physical occurrence is separately charged until applied/discarded; all share semantic entitlement and never repeat the release transition. |
| Successor | Creation gated until applied image/frontier, durable suffix, retained Ready/core transfers and current-term prefix ambiguity are reconciled. Absent process map is no proof. |

Timeout removes a waiter only. Demotion fences continuations without cancelling
M. After apply-before-reply, replay returns recorded HELD/ALREADY_HELD/refusal,
even if authority is now different. Authoritative discard releases only proven
occurrences and frees M only when no possible copy remains. If its bytes are
retained and fromG current, redrive the same M; otherwise explicit unavailable
history or a later new intent, never silent retagging. Cold loss of purely
pre-core bytes cannot imply successful closure. Report proven discard/loud stop
or unresolved custody, and keep local eligibility safely closed as appropriate.

## Exchange arithmetic and conditional progress

Keep illustrative C_H=4,Q_H=2; C_A=8,Q_A=4; Q_M=1 and existing other classes.
One shared M reserves 16,384 encoded whole-command bytes under the prior
projection, one future child result/key <=25,600 and one future receipt <=4,096.
The former result and receipt may coexist with these reservations. H is an
alternative M variant, not another pool or concurrent future child.

```
4,243,456 + 25,600 + 4,096 = 4,273,152 bytes (unchanged)
H exchange: <=2 old ordinary pending H entitlements +1 carried H <=3 <= C_H=4
A exchange: <=4 old ordinary pending A entitlements +1 carried A <=5 <= C_A=8
```

These lemmas assume coherent current-leader inventory, eligible retirement and
bounded encodings. Other-class entitlements are unaffected, not donated. The
extra string variant fits only after the full bytes owner's max-encoding proof;
no production limit is adopted by this arithmetic. It does not bound follower
history, native copies, WAL/pages, log pins, snapshots, TX history or memory.

Under eventual stable leadership, usable quorum, writable storage, finite host
operations, bounded service of accepted work and a sufficiently stable valid
HOLD predicate interval, an admitted H reaches an authoritative disposition.
Its rank progresses from custody resolution through ordering, commitment and
application; alternatively authoritative discard ends that opportunity. New
refusals cannot steal escrow. Routine maintenance cannot own the same M; no log
entry can interleave inside the atomic retirement/child exchange. A real state
change may cause refusal, which completes rather than deadlocks the opportunity.
For closing success the expected APPROVED tuple must remain valid until apply.

The finite runtime round from the accepted contract remains required: one owed
tick and one captured accepted inbound envelope, then admitted maintenance,
HOLD, settlement and ordinary work with finite Ready service and generation
checks. The current recursive drain and Promise tail do not implement it.
This design trace drives stages explicitly; it does not establish native
scheduler service, authoritative discard or prefix reconstruction.

## Implementation and dependency boundary

The accompanying native plan names the existing runtime/store/application/result
interfaces and RED-first witnesses for BOTH directions. No standalone closure
fragment is an accepted release protocol. Complete unit remains release/HOLD ->
ordinary write and local TX1 first-PREPARE binding -> durable outcome/replay,
query delivery, D3/D4, capacity and recovery, with both COMMIT and ROLLBACK.

INIT activation, application-prefix provenance, durable query discharge,
acknowledged larger settlement encodings, supported application image/native
Ready import and outer release-to-QueryEngine deadline handoff remain their
existing owners' prerequisites. Snapshot refs remain 9554f689 (catch-up),
458076e6 (content format), 2384216d (dependency B), 82b54ef9 (diagnostic).
No competing installer or snapshot takeover. Normal post-authorization TX1
activity does not revoke its own release; readiness-to-transition and ongoing
serving conditions remain distinct.

Related-system hints remain the prior packet's RIFL atomic effect/completion
and etcd separate admission/replication domains; they do not supply Lagrange's
missing custody or recovery proofs. No new upstream behavior is assumed here.
