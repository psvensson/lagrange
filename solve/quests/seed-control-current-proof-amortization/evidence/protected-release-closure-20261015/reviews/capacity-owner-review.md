# Protected HOLD — independent source and design review

Reviewer: `subagent:/root/release_capacity_audit`. Evidence-only follow-on under
`seed-control-current-proof-amortization`; no Quest completion claim.

Baseline: `0c981c7b18eabd11b021d8ddbaccd506a5e1a666` in
`/mnt/data/peter/projects/.worktrees/protected-release-closure-20261015`.
HEAD and clean initial worktree status were checked. Read the actual
AGENTS -> rules -> router order, `quest-subagents.md`, the applicable architecture
owners and every item of all applicable verification templates. The parent's
ownership inventory is explicitly an observation, not a lab/process lease.
This reviewer took no lease and changed no production, test or historical file.
This review file is the only authorized write. No native or trace run occurred.

Initial candidate reviewed:
`solve/quests/seed-control-current-proof-amortization/evidence/protected-release-closure-20261015/PROTECTED-CLOSURE-CONTRACT.md`

SHA256 `6c9a0b6218b5f428c1e37eeda1fb0b434c957f386cb0d8fa459bbf29ab1674bf`.

The immutable preceding ordered contract remains SHA256
`f1357f2f68df9da811b32df22eab3e49d9c6870dfd3f0ed8af608d317297f37e`.
The line references to the new contract below bind the initial candidate.

## Decision and arithmetic

RETIRE_AND_HOLD is a coherent smaller extension of the selected shared M
mechanism. One parent entry can retire eligible release history, evaluate the
immutable HOLD, record parent/child outcomes and advance applied position in
the existing synchronous application transaction. It does not need a new native
occurrence, M slot, future child pool, durable queue or permit authority.

The H-class exchange is correct under the declared conforming active-leader
profile: after retiring eligible old-G retained results, at most Q_H=2 ordinary
pending unique H entitlements remain; one carried H makes at most 3 <= C_H=4.
The future child/key 25,600 and future receipt 4,096 are alternatives within the
same M escrow already charged for APPROVE. Thus the illustrative projection
remains 4,243,456 + 25,600 + 4,096 = 4,273,152 bytes. This is neither a production
limit nor a follower, log, snapshot, physical-byte or whole-runtime bound.

Initial verdict: ACCEPT this atomic direction; HOLD the exact text pending the
two required corrections F1/F2 below. Existing implementation blockers remain.
No new native defect or semantic RED is asserted by this review.

## Current owners and consumed surfaces

S1. `src/node/replica-handler-participant-cutover.js:245-275` owns the current
release attempt. It checks leadership and, only for missing origin, an existing
authorization token (:261-268); it then awaits control release (:269-270) and
raises local PAUSE (:273). `releaseControlOwnerFirst` (:151-181) requires a
successful control-partition CUT_OVER and can return early. This is not a
committed HOLD path. `runParticipantCutover` (:365-387) retains one invocation
per partition but currently joins solely by targetBuildDigest (:371-374).

S2. `src/node/participant-release-authorization-owner.js:26-64` owns invocation
tokens. Its WeakMap records handler, kind, partitionId, targetBuildDigest and
evidence (:27-31); validates compares handler/partition/build (:61-64).
It does NOT currently bind a durable origin, release version, G, M or K, and
cannot be revalidated as a replicated predicate on another process. It must
not become a second committed authorization authority.

S3. `src/partition/partition-participant-transaction-pause.js:193-215` owns
local CLOSED state; :226-233 invalidates local admission from runtime status;
:252-281 owns local reopening. These are D3 facts, not replicated release
effects. `src/node/replica-handler-participant-release.js:197-201` executes local
PAUSE; :244-255 may close locally before returning build mismatch. Neither is
a durable HOLD receipt or rollback of earlier committed work.

S4. `src/node/replica-handler-release-recovery.js:92-148` owns the current
volatile per-partition pending/running continuation and injected timer. Reconcile
returns on local OPEN (:199), lacks origin (:200-203), or unmeasured build
(:205-209), before runParticipantCutover (:213-215). Dispatch runs at most four
attempts (:220-242). Service and consensus wakes are :244-254. A new closure
phase and maintenance-capacity wake are NEW interactions, not present exports.

S5. `src/raft/raft-rs-runtime-owner.js:961-986` serializes group turns before
synchronous work; :1727-1743 checks persistence, reconstructs and drains inbound
before invoking a command. Proposal :1650-1688 and forwarded ingress
`src/raft/raft-rs-ingress.js:168-196` must share the new M creation claim. The
current Promise tail is not finite custody, admission arbitration or fair class
service. The accepted runtime/store custody gaps remain unchanged.

S6. `src/raft/raft-rs-application-transaction-owner.js:51-99` gives the
application actual index/term and atomically advances applied state (:61-80).
Async application is forbidden. This is the sole transaction owner for both
maintenance variants. `partition-committed-statement-outcome.js:109-145,288-307`
owns current durable result/read/replay; the release adapter/receipt/frontier is
explicitly still proposed. Its typed precedent is
`partition-coordinator-settlement.js:35-44,73-103`.

S7. `src/raft/raft-rs-durable-store.js:404-443` owns Ready persistence and suffix
replacement. Runtime :1069-1133 applies actual entries in order; :1191-1239 owns
Ready custody. New exact occurrence/discard/inventory interfaces remain absent.
No pre-core map miss, caller timeout or ACK proves all copies discarded.

S8. `src/node/participant-release-client.js:36-68,97-140` supplies the existing
request deadline/redirect and delivered/noHandler/result distinction. Recovery
uses existing 1s cadence and 30s attempt budget, but events can accelerate it;
four running attempts do not prove bounded duration. The outer QueryEngine
deadline handoff is still open, not solved by compound HOLD.

S9. `replica-handler-membership-relay.js:36-49,76-86` constructs an empty
registry, wakes registration and relays CONSENSUS_OBSERVED. Partition relay
`partition-service-raft-lifecycle-wiring.js:139-151` emits membership/leader/term.
Ordinary application progress is not currently that recovery relay. A new
capacity/disposition wake must be named as NEW. No existing constructor-scan
defect is claimed.

## All findings and minimal traces

### F1 — Separate local invocation authorization from deterministic HOLD

The contract says origin/request authorization is checked through the existing
authorization owner (:30-33), then includes a legitimate child authorization
predicate failure (:106) and authorized-request checks at application (:115).
S2's owner currently validates a process-local handler/partition/build token,
not the claimed durable request identity. S1 only uses it on missing origin.
The distinction must be explicit.

Counterexample if read literally: producer A has a valid local token; parent is
replicated; replica B has no WeakMap entry for that token. Applying authorization
as the child predicate makes A and B disagree or leaves B unable to apply the
same accepted prefix. Serializing a token object or reason string cannot fix it.

Smallest correction: current release invocation authorization stays at its
producer ingress, under existing fresh/operator/retained-origin rules. The
proposed bytes owner binds the complete immutable parent/child. The application
checks current durable origin, exact expected release state, canonical identity
and supported replicated grammar. Do not add an unspecified local authorization,
measured-build, transport, session or lifecycle predicate to D2. If a new durable
authorization fact is actually required, name that as an unresolved owner
decision instead of claiming S2 already supplies it.

### F2 — Select the actual closure phase handoff and its wake

The initial text chooses closing before the continuation's own opening (:47-58)
but leaves "normal owner wake/retry" and a typed "BUSY" alias unspecified.
Existing S4 has no closure phase and can return while local admission is OPEN;
S1 awaits successful control release before even local PAUSE. A compound HOLD
applier with no build/drain predicate is insufficient if its producer cannot
reach the claim without those opening prerequisites.

Counterexample A: legitimate closure intent, H history full, local D3 OPEN;
reconcile takes :199 and never constructs H. Counterexample B: same closure
invocation reaches S1, but current-control release is unavailable (:162-179), so
:269-270 returns before closure. Counterexample C: old M is occupied, closure
records a waiting phase, M later applies/discards without a membership/term
change; no selected capacity wake returns that phase to the canonical owner.
These are traces through a proposed composition with present source seams,
not demonstrations that current local PAUSE is a committed-HOLD implementation.

Smallest concrete handoff selection within the existing owners:

1. Install an explicit CLOSING phase synchronously in the existing per-partition
   release invocation before opening-only OPEN/build/control-release/drain
   early exits. It retains one bounded owner invocation identity and typed
   reason, not an unbounded list of requests or a second queue. A reason flag
   from a caller cannot install it without the producer's invocation checks.
2. While another M is known or UNKNOWN, preserve its bytes and charge; closing
   does not preempt it. The phase is unadmitted intent, not a native reservation,
   durable operator ledger or right to replace M. Its normal caller deadline
   may end waiting, but cannot cancel an M subsequently admitted.
3. At free M, the release owner reads exact current origin/release/G and selects
   closing before its own opening/pure-maintenance creation. Construct the new
   canonical child once, then synchronously invoke the same runtime claim.
   No await lies between selection/final validation and claim. Runtime alone
   reserves capacity; its final core handoff still rechecks after inbound work.
4. Use NOT_ADMITTED(MAINTENANCE_BUSY), not a second BUSY vocabulary. This failed
   claim allocates no result/annotation; it preserves the volatile phase under
   its existing budget. An exact previously admitted M is resolved first, not
   regenerated with new G. An earlier unadmitted proposal can end stale/retired;
   a later new intent has a new nonce and is explicitly a different request.
5. Select a NEW runtime capacity/disposition revision after actual application
   or proven discard/reconciliation. It enqueues the existing partition owner;
   the callback is a nudge, not a capacity grant. Current service/consensus wakes
   and existing cadence converge on that same read/claim path. No timer becomes
   a new authority or the sole progression mechanism.
6. Do not join distinct exact request identities merely by targetBuildDigest.
   The existing S1 coalescing is not the new identity contract. Multiple triggers
   may nudge one owner invocation; their answers must identify that invocation's
   actual M/K and cannot claim a distinct caller's request committed.

This is a proposed narrow owner interaction, not present code. Its unadmitted
phase is volatile; cold-loss recovery requires existing recoverable producer
intent or an explicit retry. No new durable queue is authorized. It need not
promise arbitrary external pre-custody fairness, which the packet explicitly
excludes. It must enforce its own CLOSING-first decision and wake honestly.

### F3 — The guarantee is for accepted custody, not arbitrary admission

This is correctly qualified at :41-58 and :178-186. A different unknown M may
retain the slot; a closure caller that never obtained custody is not owed a
committed result. Under eventual stable service, an accepted H obtains HELD,
ALREADY_HELD, exact refusal, or a proved discard endpoint. This does not establish
that every closure caller under adversarial external arrivals obtains M.
Do not close broader pre-custody-fairness or durable-operator-intent questions
using this packet's bounded traces. F2 selects the owner's own progression only.

### F4 — Exact HELD and exact replay must remain separate controls

The initial table is correct and must stay so. H expected APPROVED(v), another
HOLD first changes the tuple to HELD(v+1), then H applies: the request's result is
EXPECTED_STATE_CONFLICT, not ALREADY_HELD or borrowed success. A newly constructed
H with the exact HELD tuple can return ALREADY_HELD without moving releaseVersion
or last-transition position; maintenance still advances G and records H at its
actual parent index. A later APPROVE cannot rewrite that historic result.

Current HELD observation also does not prove an older owned APPROVE is finished.
The accepted M lifecycle must be reconciled before closing intent is refreshed.
Conversely current D3 CLOSED does not prove any committed HOLD. These are required
behavioral controls, not newly reported native failures.

### F5 — Preserve all inherited bounds and explicit exhaustion limits

No replica-local queue/quota/unknown-copy count may participate in deterministic
H application (:115-127). Over-profile custody gates new creation only; accepted
prefix replay continues. This preserves the final correction to the accepted
opening contract. Real storage failure rolls back through S6/S7, not a fabricated
H refusal. Real obligation pins are not deleted to make the exchange green.

The arithmetic excludes follower backlog and maximum-encoding proof. Counter
exhaustion is explicitly outside indefinite progress: max G cannot wrap, and no
admission may invent space by dropping history. Release-version reserved final
H increment does not by itself solve max-G/history saturation. Preserve that
declared migration boundary rather than advertise unconditional safe closure.

### F6 — Native custody/service/recovery remains unimplemented

One shared M plus frozen fields does not establish all-transfer fencing, finite
pre-tail and inbound intake, occurrence association, exact suffix discard,
bounded native restoration, fair actual scheduler service or accepted snapshot
import. These remain inherited S5-S9 dependencies. A guessed submission index,
local pending-map disappearance or source-local serving state cannot supply
them. No native rerun was requested or performed for this design extension.

## Category-complete review

Statuses mean source/design evidence only: COHERENT is not native verification;
CORRECTION is F1/F2; BLOCKED is an explicit inherited implementation dependency.
Every applicable template item is covered below; no first-defect stop.

### Admission / gating — all seven items

A1 CORRECTION/BLOCKED: S1/S2 authorization, F1 and F2 selection use one producer
intent; runtime same M facts govern local/forwarded admission (S5). D2 uses only
replicated facts (S6/F5), not the leader's reservation projection.
A2 CORRECTION: F2 selects NOT_ADMITTED(MAINTENANCE_BUSY); accepted UNKNOWN debt,
retired-unavailable, environmental failure and deterministic conflict remain
different. No deterministic denial is inferred from a transient unreadable row.
A3 COHERENT/BLOCKED: S8 existing budgets remain. The new unadmitted phase cannot
renew budgets; caller timeout cannot cancel admitted native debt. Actual outer
QueryEngine timing is still unproved.
A4 CORRECTION: one canonical reason/result vocabulary crosses producer/runtime;
F1 removes vague child authorization failure and F2 removes BUSY alias. Preserve
accepted malformed/profile/pin/size/retired result classifications.
A5 CORRECTION: F2 names M apply/discard/reconciliation capacity revision -> S4
enqueue -> fresh read/claim. No measured native wake latency exists yet.
A6 COHERENT/BLOCKED: origin/G/exact expected tuple are fresh at claim; role and
inventory recheck after native/host waits; actual prefix governs apply (S5-S7).
A7 COHERENT/UNPROVEN: identify blocked M, partition/origin, runtime incarnation,
current examined boundary and phase. Do not label a waiting closure's K as the
occupying request or display D3 CLOSED as committed success (F2/F4).

### Concurrency / serialization — all five items

C1 CORRECTION/BLOCKED: F2 synchronous phase installation/claim plus S6 durable
backstop, not async row reads. Current S5 tail alone supplies no M capacity.
C2 COHERENT/BLOCKED: final same-turn claim has no await; later core gate rechecks
after actual inbound/reconstruction. S1/S4 existing awaits require the proposed
phase to survive with original identity, not stale borrowed permission.
C3 CORRECTION/BLOCKED: same M claim for RETIRE/H/A, local and forwarded. Distinct
exact requests cannot join by targetBuildDigest (F2). Unknown older owner stays.
C4 CORRECTION/UNPROVEN: S4 timer/service/consensus/capacity wakes converge on the
same partition phase; no independently executing priority loop or duplicate
proposal. Native fair round remains required (F6).
C5 COHERENT/BLOCKED: resource key is active partition/origin M, not caller/reason,
build digest, or per-generation quota. Invocation key and request/occurrence keys
are separate. No new per-trigger quota may multiply the envelope (F2/F6).

### Recovery / replay — all five items

R1 BLOCKED: accepted custody scan must preserve newer live tickets. Runtime
generation and image/suffix revision fence stale views (S5/S7); phase recovery
cannot overwrite an active different M with a closure preference (F2).
R2 COHERENT/BLOCKED: distinguish live coalescing from cold reconstruction. An
unadmitted volatile closure phase is not a durable obligation; missing M map
never proves discard. Source registration is sound (S4/S9/F3/F6).
R3 COHERENT/UNPROVEN: HOLD deliberately needs no TX drain, but cannot use absent
participant registry as empty/CLEAR or settle any global transaction. Pinned
obligations and existing settlement remain with TX/query (F5).
R4 COHERENT/UNPROVEN: exact parent/child replay before mutation; one S6 transaction
rolls back history/deletion/release/results/receipt/applied together. ALREADY_HELD
has unchanged release tuple, not a second transition (F4).
R5 COHERENT/BLOCKED: retired history is unavailable, not NOT_COMMITTED; missing
claimed child result is RESULT_INCONSISTENT. Unknown occupied M cannot be stolen
or treated as absent (F2/F6).

### Owner interaction — all ten items

O1 CORRECTION: release continuation decides legitimate closing phase; runtime
decides native custody; applier decides deterministic result; result owner
retains it. S2 local token must not compete with D2 (F1).
O2 CORRECTION: F2 selects one typed phase/claim/capacity-wake interaction. Producer
reason is intent, not priority or durable authority. No generic permit subsystem.
O3 UNPROVEN: same witness must show no excess custody/no duplicate effect AND
protected H disposition while authoritative settlement/replication progress.
Atomic capacity alone is not that native witness (F3/F5/F6).
O4 COHERENT/UNPROVEN: unavailable/occupied M first blocks new H; later exact
discard/disposition triggers fresh owner selection. Stale origin/state becomes
its own refusal, never a permanent veto nor retagged request (F2/F4).
O5 COHERENT/BLOCKED: no preemption of unknown M, no additional pool, bounded
coalesced phase and waiters, unchanged budgets. Pre-custody external fairness
is explicitly unpromised. Native intake bounds remain F6.
O6 CORRECTION: F2 names actual capacity revision, fresh read and canonical enqueue.
An ACK or ordinary local OPEN observation cannot discharge the phase.
O7 COHERENT/UNPROVEN: D3 WeakMap, RUNS, pending/running/reported, diagnostics and
future custody cache remain projections. None may derive committed HELD or no
copies from local absence (S2-S9/F1/F2/F4).
O8 UNPROVEN: no A/B or trace run by this reviewer. Future negative must change
behavior: split retirement/H, borrowed ALREADY_HELD, occupied-M steal, local
auth application, or missing capacity wake; not just alter a pass condition.
O9 COHERENT: reuse S1-S9; no raw core bypass, second ledger, replicated staging,
invented CLEAR, timeout increase, force flag, or PAUSE-as-rollback. F1/F2 prevent
the narrower hidden alternatives in this draft.
O10 SOURCE/UNPROVEN: test/shards/impact-contracts.json:599-665 and :1540-1613 map
the runtime/application/release pair and native controls. New production meaning
requires the complete paired contract/registered witness with implementation;
existing entries do not certify the new compound child.

### Retry loops — all seven items

T1 CORRECTION: F2 capacity revision plus existing S4 enqueue/timer must fire or
report typed stop. Waiting phase must not suppress every other wake.
T2 BLOCKED: unavailable owner/custody stays UNKNOWN under an existing bounded
attempt; debt cannot be expired to bound a loop. Cold unadmitted intent may need
an explicit caller retry, not a fictitious persistent queue (F2/F6).
T3 CORRECTION: cover OPEN/build/control-release/no-leader/missing-origin/budget,
timer registration failure, service replacement and shutdown. None silently
turns pending closure into success; native custody survives waiter exits.
T4 CORRECTION: F2 avoids waiting for successful opening/control release to form
closure. Unknown old M remains a genuine dependency, not one skipped to escape
the circle. Atomic child removes result-space refill between retirement/H.
T5 BLOCKED: S4 four attempts and one partition key do not bound every wait or
transport buffer. Events accelerate the nominal 1s cadence. No maximum storm
rate is claimed without new intake and join bounds (F6).
T6 COHERENT/UNPROVEN: late success replays the same M/K; a lost response cannot
mint a new child nonce or add a row. Exact held/conflict results remain F4.
T7 COHERENT/UNPROVEN: real application/discard changes custody; transport ACK or
local D3 CLOSED does not reset request work forever (S8/F4).

### Formation / circularity — all five items

F-C1 CORRECTION: S1 control release and S4 build/OPEN precede present producer
entry. F2 new closing phase must not depend on those opening prerequisites.
Origin/identity/quorum/storage remain real required owners, not bypassed.
F-C2 CORRECTION: S9 service/consensus plus NEW capacity revision re-drive the same
phase; no sole CDC visibility or polling fallback. No current startup bug claim.
F-C3 COHERENT/BLOCKED: ordinary work keeps its chosen fencing path; new intent can
be not admitted under the existing budget; old obligations and replica catch-up
are not dropped. Need same-pressure native witness (F5/F6).
F-C4 BLOCKED: only logical arithmetic is known. No end-to-end closure interval or
tightest-client margin is measured; eventual finite operations are conditional
assumptions, not timeout promises. No timeout change is authorized.
F-C5 COHERENT: same native/application owners, no local hold mutation presented
as global fencing, no release-owned COMMIT/ROLLBACK, no parallel snapshot path.

### Harness fidelity — all six items

H1 UNPROVEN: no native/test run here. A missing RETIRE_AND_HOLD symbol, fixture
composition failure, or timeout before custody is not semantic RED.
H2 UNPROVEN: new ordering traces must model proposed mechanism honestly and
remain supplementary; existing native port fixture lacks full release/TX/query.
H3 UNPROVEN: preserve actual stage/expiry order; no compressed timeout can let
ordinary wait absorb the supposed protected path. Native fair service unproved.
H4 COHERENT/UNPROVEN: freeze full parent/child, origin/G/release tuple/nonce/reason
and real position. Explicitly mutate each; transactionEpoch is unrelated. One
new enum alternative must not silently inherit an APPROVE-only condition.
H5 UNPROVEN: require actual H saturation plus Q_H pending work, an occupied M,
stale then fresh state, exact HELD, old retired bytes and settlement. Empty rows
or a vacant slot alone cannot prove the intended frontier.
H6 UNPROVEN: no live observable/run is certified. Future evidence must bind
actual SQLite effects/outcomes/applied positions and admission at exact refs;
model counts and static hashes are not native or multi-host certification.

### Transport / delivery — all five applicable items

D1 SOURCE/UNPROVEN: S8 distinguishes delivered/noHandler/result. ACK cannot free
unknown M or prove HELD. Preserve ACK:true/noHandler:true negative.
D2 COHERENT/UNPROVEN: waiter retirement cannot cancel actual M debt or the only
owner capacity wake; new closure intent is not a retag of late old bytes (F2).
D3 CORRECTION: canonical BUSY/UNKNOWN/retired/applied shapes must traverse S8;
no new alias or arbitrary local auth refusal may change transport retry meaning.
D4 BLOCKED: existing deadlines remain, but whole QueryEngine/host wait bounds
are not proven by this proposal. Unreadable is typed, never fabricated success.
D5 UNPROVEN: no mock introduced. Future router witness must honor real registration,
redirect/timeout/noHandler semantics; a fake immediate reply cannot prove F2.

### Sweep / timer — all five applicable items

W1 SOURCE/UNPROVEN: S4 uses injected clock/unref; new phase uses that same owner,
not an extra timer or independent replay loop.
W2 COHERENT/BLOCKED: runtime checks role/incarnation before core; producer validates
its invocation; timer never gains transaction rollback authority (F1/F6).
W3 COHERENT/BLOCKED: clear stale volatile phases safely on lifecycle loss while
native debt persists; cold loss cannot turn an unadmitted intent into HELD (F3).
W4 COHERENT/BLOCKED: no new lease/timeout expires accepted work. No measured
native service window or global recovery lifetime is claimed.
W5 CORRECTION/BLOCKED: F2 removes closure's opening-dependent producer gate;
accepted finite inbound/tick round still requires implementation (S5/F6).

## Design-note sections

Consumed surfaces: S1-S9 distinguish current owners from NEW phase/claim/wake,
compound command, result adapter and persistent receipt. No present capability
is inferred merely from a proposed interface name.

Typed failure edges: preserve accepted invalid-size/identity/origin/profile/pin,
future/retired/unknown/storage failures. F1 removes unselected local authorization
at apply; F2 selects canonical BUSY and phase lifecycle consequences. No result
is promised before successful custody; no UNKNOWN request is retagged.

Cached-view audit: S2 token WeakMap, S3 admission WeakMap, S1 RUNS, S4
pending/running/reported, runtime status/Ready projections and future result
inventory. Invocation authorization stays local; origin and exact result come
from their owners. Service/runtime incarnation changes fence stale continuations.
Application/custody revisions invalidate capacity views; wakes cause fresh reads.

Identity anchors: exact origin, history G, releaseVersion/status/auth/transition
position, nonce, canonical M/K, runtime incarnation and native occurrence remain
distinct. A moved origin or G cannot adopt new authority. Exact replay and current
authority/D3 observation are different facts. Parent/child share one actual entry.

## Required controls for the subsequent exact contract

1. H history full while APPROVED, two ordinary H pending, real M_H acceptance;
   atomic retirement then exact HELD with no intermediate refill opportunity.
2. Exact HELD -> ALREADY_HELD with unchanged release tuple and real new result
   position; stale expected APPROVED -> conflict despite currently closed state.
3. Occupied unknown M_A, closure intent arrives, no preemption; old disposition
   or proven discard wakes the same owner, refreshes explicit new intent, then H.
4. OPEN shortcut, missing measured build, or unavailable control release cannot
   skip a valid new CLOSING phase; invalid invocation still cannot claim capacity.
5. Local authorization-token absence on another replica cannot change D2;
   canonical parent/child origin/state/identity mutations do change behavior.
6. Lost reply, replay after reopening, retired child, late old forwarding,
   rollback during atomic apply and restart at each custody stage.
7. Hold old prefix on a lagging follower with >Q_H future debt, then apply the
   same supported M_H; local pressure cannot change result or block its prefix.
8. Keep authoritative TX COMMIT/ROLLBACK settlement and consensus ticks progressing
   under pressure; no missing-symbol RED or fabricated CLEAR controls.

## Source identities

`056e5be750c4862fb8b869187904671b8da4690032033a9effcda01d2d0c2e7c`
`src/node/participant-release-authorization-owner.js`

`901a2c01d2966f0b000f8225b802cfec4e6f8e68c81d88cac5e19c8ca0920abd`
`src/node/replica-handler-participant-cutover.js`

`d3ddafe1710e8d709f9c1a80c5a0cec5940d4b9fd6b2d0cef6cb6771c4cd5b0d`
`src/node/replica-handler-release-recovery.js`

`59218cb79149bb98f9dd8fe60e0d3f888752bb2fdd43a03c5001fdc02feb24c8`
`src/partition/partition-participant-transaction-pause.js`

`a560a052bf9b470a2046009555162b60669c340d86274fca9c74126fc8fbd01b`
`src/raft/raft-rs-runtime-owner.js`

`f12ff39650a0c221212168129f24ff070b563bd3c65cb1498572af7e3642f6aa`
`src/raft/raft-rs-application-transaction-owner.js`

Preserve the accepted opening contract, rejected predecessors and native
witnesses. Successor unsealed/unactivated; shared-control-wave HELD;
Runner/TAP PARKED; PR122 rejected. Stop at content-bound independent review.

## Final content-bound correction review

Reviewed final `PROTECTED-CLOSURE-CONTRACT.md` SHA256:
`58acf8cfdde0f6f2fb055c78e243ab8c4832e4971b2425889e995f87c4ec09d2`.
The complete revised document was read. The original review above remains
unchanged; this section records the corrections and final judgment.

**F1 is resolved for the design checkpoint.** Lines 30-38 now accurately
identify S2's local WeakMap scope and S1's missing-origin-only use. Invocation
authorization stays at producer ingress. D2 checks durable origin, canonical
identity and exact expected state, and explicitly cannot consult a local token
or authorization boolean. The new command-ingress authorization/activation
extension is called out as prerequisite work. The transition table no longer
invents a child authorization-failure predicate. This supplies no new replicated
permit or competing authorization owner.

**F2 is resolved for the selected owner interaction.** Lines 65-96 explicitly
place CLOSING before the current OPEN/build/census/drain/control-release exits,
with missing origin routed to INIT rather than manufactured state. The existing
per-partition invocation owns the new phase and its identity, original bytes
when constructed, deadline and runtime generation. Its synchronous handoff
uses the same runtime claim and canonical NOT_ADMITTED(MAINTENANCE_BUSY).
Distinct exact requests cannot join by targetBuildDigest.

The new `maintenanceCustodyChanged(partitionId,origin,runtimeGeneration,revision)`
boundary is explicitly a proposed runtime-owned notification after actual
application/discard/reconstruction, consumed by the existing partition reconcile.
Subscribe/read/recheck closes the missed-free-edge race. Queued work rechecks
invocation, hosted service, origin and runtime generation, including after
awaits; the callback does not free capacity or grant authority. Existing cadence
is a fallback, not discard proof. Admitted custody outlives caller expiry;
unadmitted invocation expiry is explicit and no cold-process durable intent is
invented. Native lifecycle/wake/reconstruction proof remains required, especially
that a stale phase cannot act on or indefinitely veto a replacement runtime.

HELD or ALREADY_HELD terminates the exact carried request's closing phase, not
an eternal guarantee about current authority. Lines 133-135 keep its recorded
result distinct from current authority and local D3. The phase does not keep
retiring merely because local admission remains closed during settlement.
Refusal completes the exact request; any ongoing legitimate closure need is
re-evaluated as a new explicit intent. Unknown occupied M is never displaced.

F3-F6 remain correctly qualified. The protected opportunity starts at accepted
M custody; this is not a promise of arbitrary external pre-custody fairness or
durable recovery of an unadmitted operator intent. Shared M accounting and the
H <=3 of4 exchange preserve the same conditional 4,273,152-byte projection.
Exact HELD, stale expected state, retired history, original winner attribution,
immutable replay and follower-local pressure distinctions remain intact.

All applicable checklist results above carry forward through these F1/F2
resolutions. They remain design/source judgments: no missing native proof is
converted to verified behavior. No further defect was found in this bounded
correction pass.

**Final verdict: ACCEPT this exact protected-HOLD design as an owner-decision
and evidence checkpoint. Production implementation, complete release-protocol
acceptance, successor activation/sealing and merge remain HOLD.** Native custody,
all-transfer fencing, finite intake/service/restoration, max encodings, application
snapshot/import, complete settlement and deadline dependencies are unchanged.

This reviewer did not run, independently certify or use claimed pass counts
from the separate executable ordering traces or native fixtures. Those retain
their own exact-content independent evidence and limits.
