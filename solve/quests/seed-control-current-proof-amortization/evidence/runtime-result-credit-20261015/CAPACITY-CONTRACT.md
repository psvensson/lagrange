# Runtime/result custody and retirement decision for review

Status: proposed owner contract; production implementation remains HOLD.
Source baseline: `fb3c09d4a90952ee57bb2de09aa1e0b6cf1f2e9c`.
This packet changes test observation only. It does not implement the interfaces
below or adopt a resource limit. The accepted ROLLBACK evidence, preceding
DECISIONS.md, rejected model and historical witnesses remain unchanged.

## Decision and exact limits of the evidence

Select the existing runtime as command-custody owner, the existing committed
result owner as exact-result/retirement owner, and their existing synchronous
application transaction as the exchange boundary. Do not introduce a capacity
service, a second outcome ledger or a release-owned settlement authority.

The current implementation does **not** establish finite outstanding-command
or retained-history capacity. A concrete source-reachable counterexample is:
admit commands, persist an uncommitted suffix, expire their waiters, admit more
commands while the suffix survives. ProposalQueue frees its slots; consensus
does not discard those entries. Repetition grows the outstanding obligation.
This is a source-derived schedule, not a new native exhaustion measurement.
The locked raft-0.7.0 defaults have no uncommitted-size limit. Its optional
counter would still reset on leadership and release before application; that
counter cannot replace this contract. See runtime audit F1-F8 and exact crate hash.

There is a second live creation route: follower-forwarded MsgPropose. A guard
only around local `port.propose` is insufficient. All new log-entry creation
of profiled application commands must consume the current leader's credit,
including forwarded proposals. Consensus no-ops/configuration progression do
not require release-result slots. Already-ordered replication is a transfer of
custody, not fresh admission.

Native validation of this new accounting is blocked by missing runtime seams
listed below. No missing-symbol test, invented replicated BEGIN, submission
index or abstract checker pass is offered as a semantic RED or implementation
proof. The limited executable size probe uses actual existing canonical readers;
its results and limits are preserved separately.

## Identity, charging and sole ownership

Keep the canonical release request selected in the preceding DECISIONS.md:
`requestId = SHA256(domain + canonicalRequestBytes)`, including its nonce,
origin, historyGeneration G, exact expected release state and transition inputs.
The proposal codec's full encoded command is the measured custody payload.
Retry never regenerates the nonce, expected state, G or admission binding.

The accounting key K is `(partition, durable origin, requestId)`; canonical
contents must match K before joining or replaying. A mismatched supplied hash
is malformed, not another result allocation. Different canonical requests
contending for the same release version have different K and retain their own
applied conflict/refusal results. A loser never borrows the winner's approval.

Keep these separate: transactionId/transactionEpoch; releaseVersion and its
authorization; history G; K; actual log occurrence O `(index, term, payload
digest)`; and local runtime incarnation/generation. O is assigned by consensus,
never predicted at submission. Live pre-core custody has a runtime-local ticket
until O exists; that ticket is not persistent authority. Only the active durable
origin may allocate this partition's capacity. Foreign origins are refused;
unbounded per-client or per-origin quota creation is not permitted.

Two debits are necessary:

* Result entitlement: one maximum future result for each unique admitted K,
  retained through uncertainty and exchanged for the actual exact result.
* Command custody: the encoded request and each still-owned log occurrence.
  Duplicate physical entries do not become free merely because they share K.

Exact pending retries join existing custody before another core call. Exact
retained replay reads its result without proposal or another annotation. Any
legacy or unexpected duplicate occurrence found during recovery is counted;
if it exceeds the selected profile, new admission stays held. It is not erased
to make a count fit. Once the first copy applies, later copies owe no new result
but retain their own command debit until application or proven discard.

| Stage | Sole owner / current source | Required debit, transfer and loss recovery |
| --- | --- | --- |
| Canonical input and prospective result | Release bytes/result adapter; proposal codec `src/raft/raft-rs-proposal-codec.js:34` | Measure full immutable bytes and maximum result. Classification is derived from validated command kind, never a caller priority flag. New adapter is required. |
| Pre-core reservation | Runtime admission before `raft-rs-runtime-owner.js:956` tail retention | Atomically claim K, encoded bytes and result entitlement before accepting async custody. Refused-before-custody allocates none. Bound waiting callers separately; no unbounded priority queue. |
| Core-held | Runtime serialized turn, `:1650`, `:1727`; ingress `raft-rs-ingress.js:168` | Recheck role, origin, G and inventory after inbound drain/reconstruction. Gate both local and forwarded creation. No await between final check and core transfer. Ambiguous transfer retains debt as UNKNOWN. |
| Ready-held | Runtime/Ready owner `:1191`; WASM wrapper `lib.rs:562` | Attach actual O and preserve the same debit while Ready is deferred or host persistence fails. Host/native copies are separately physical costs. |
| Durable unapplied suffix | Durable store `raft-rs-durable-store.js:404`, `:422` | Persist first, then publish exact replaced/retained occurrence delta. Release only copies proved discarded; keep K entitlement if any live copy can still apply. Timeout, demotion, ACK and caller error are not discard proofs. |
| Committed, application pending | Runtime `:1099`, `:1136` | Commitment does not free future result capacity. Environmental apply failure keeps the debit and uses existing recovery. |
| Atomic application | `raft-rs-application-transaction-owner.js:51`; committed-result `partition-committed-statement-outcome.js:137` | In one SQLite commit: deterministic effect/refusal, exact result, history state and actual applied position. Rollback changes none. After-commit notifications update a derived view only. |
| Applied result retained | Committed-result owner `:109`, `:288`; typed precedent `partition-coordinator-settlement.js:35` | Transfer future entitlement to retained result without a free-then-reacquire gap. Store original disposition and conflict winner. D4 current authority/eligibility are separate observations. |
| Permitted history retirement | Same result owner, new fixed cell/policy below | Atomically advance G, remove only eligible release history, replace the maintenance receipt and advance applied position. Never delete TX/query obligations or free pending copies. |
| Leadership/process reconstruction | Runtime `:410`, `:877`; durable record `durable-store.js:207` | Before new admission, reconstruct from an exact application image/frontier plus every surviving unapplied occurrence and current live transfer. Missing/unreadable data is HOLD, never zero debt. A current-term ordered boundary must settle the predecessor-prefix ambiguity. |

ProposalQueue (`proposal-queue.js:96`, `:202`) remains waiter owner only.
Transport remains delivery owner. TX1 and QueryEngine alone determine their
obligations and settlement requirements. A runtime credit view is derived
custody, not authority to choose an application result or global decision.

## Concrete conditional logical envelope

The old 5,388,288-byte figure remains preserved sizing arithmetic. For review,
replace separate retained/pending result pools with a **shared entitlement**
invariant: for each class, retained results plus unique pending future results
must not exceed C. Otherwise pending commands can apply into a full history.

| Class | C: retained plus future exact results | Q: outstanding command occurrences |
| --- | ---: | ---: |
| INIT requests (normal lane) | 128 | 32 |
| HOLD | 4 | 2 |
| APPROVE | 8 | 4 |
| RETIRE | one replaceable 4 KiB cell | 1 |

These C/Q values describe the **active leader's release admission projection**,
not every follower's unapplied backlog. They are proposed sizing parameters,
not workload-derived production limits. INIT is the only normal-lane kind in
this closed command family; its large unused headroom is retained from the
earlier sizing proposal, not justified demand or permission for another kind.
Deterministic refusals consume the class of their original command. INIT
activation establishes empty accounting once and must reject or
explicitly inventory incompatible retained state before this profile can apply.
No command chooses its own class. Normal saturation cannot borrow HOLD, APPROVE
or maintenance capacity. TX/query settlement is a separate owner obligation.

Proposed measured maximum: 16,384 bytes for the **entire encoded proposal**;
24,576 bytes for the complete exact release result including canonical request;
1,024 bytes for its logical key/scalars. Current release row <=16 KiB, fixed
maintenance cell <=4 KiB. The actual encoders must enforce these limits before
new custody and prove every fixed result variant fits. No free-form error stack,
transcript or discharge list may enter the bounded result. Oversize supplied
evidence is not silently truncated. The query owner retains its own discharge.

Under those assumptions, a conservative release-only logical charge is:

```text
(128 + 4 + 8) * (24,576 + 1,024)
  + (32 + 2 + 4 + 1) * 16,384
  + (16 + 4) * 1,024 = 4,243,456 bytes
```

This reserves full future results and separately charges pending command
payloads, so it intentionally overcounts shared bytes. It excludes Raft entry
metadata and physical copies. It is **not a proved current bound or adopted
policy**: the custody interfaces, exact encoder caps, activation and restore
witnesses do not exist. Until they do, the waiter-expiry counterexample defeats
any finite Q inferred from today's process maps.

There is a separate follower-backlog counterexample even if leader admission
is correctly bounded: a healthy majority fills/refuses/retires across many
generations while one lagging follower retains the ordered but unapplied
commands. That follower can accumulate more than 39 **distinct** requests;
these are not merely duplicate copies. It must accept legitimate replication,
not discard it under a new-admission quota. On leadership/recovery, an
over-profile inventory holds new admission while existing ordered application
or the owned snapshot/install path catches up. The arithmetic above supplies
no per-replica backlog or complete-system logical bound. Containing that backlog
and reconstructing without materializing an unbounded log remain explicit
runtime/durable-store/snapshot dependencies. A leader-only gate cannot certify
finite resource use for the complete unit.

Excluded costs have existing owners: runtime/native/transport for memory and
message copies; durable store for retained Raft log; SQLite/application storage
for pages/WAL/free-list space; snapshot owners for image pins/staging/import;
TX/query for participant/coordinator/statement history and token custody; CDC
for delivery obligations. SQL deletion does not reclaim all of those costs.
No bound on total database, snapshot, memory or disk usage is claimed.

## Fixed-cell retirement and the saturated-HELD trace

Select a new internal command in the result owner's command family:

```text
["partition-release-retire/1", partitionId, [originIndex, originTerm], G]
retireId = SHA256("lagrange/partition-release-retire/1\n" + canonicalBytes)
cell = ["partition-release-retirement/1", [originIndex, originTerm], currentG,
        lastRetireIdOrNull, lastFromGOrNull, lastToGOrNull,
        lastAppliedIndexOrNull, lastAppliedTermOrNull]
```

There is exactly one cell per partition's active durable origin, not per G.
Command and cell use the preceding decision's fixed-order canonical JSON,
UTF-8, exact u64 decimal strings, bounded identifiers and no optional fields.
RETIRE has no nonce, caller-selected list, reason string or local predicate.
At exact current G it always advances G once (unless maximum is reached),
even if there are zero eligible rows. A retained NO_ROWS refusal under this
same identity would prevent later progress, so that is not its semantics.
The receipt reports the exact generation transition/position, not an unbounded
list of deleted identities. All positions and counters remain exact u64 text.

The fixed policy retires old release-result rows after G advances, including
current-release-version refusals. Release authority is self-contained in its
current state row; TX1/query rows retain their complete immutable obligation
bindings. A refusal creates neither release authority nor a transaction
obligation, and no subsystem may pin that refusal as its sole obligation proof.
If an actual owner needs such a pin, the policy must be revised before adoption;
the trace below would not be proven. Unresolved TX/query work is never retired.
Historical winner information may become unavailable; it is not replaced with
the current winner. The accepted request's authority remains in the state row.

Exact last-RETIRE replay returns the fixed receipt without allocation. Once a
later retirement replaces it, an older request receives HISTORY_RETIRED. The
frontier preserves non-reexecution, not perpetual exact historical answers.
Retained ordinary results still replay exactly. Missing result at G older than
the frontier is HISTORY_RETIRED, never NOT_COMMITTED. An unknown old request
cannot be retagged; new work requires an explicitly new immutable request.

Retirement may overtake a pre-core or unapplied old-G release request. Its
command debit remains until known discard/application; at later application
the frontier forbids any authority effect and another result allocation.
This is explicit invalidation of unestablished release requests, not rollback
of committed work or settlement cancellation. Future-G bytes are not admitted;
future-G committed bytes fail closed as a protocol violation, as in the prior
decision. Max G never wraps; identity migration remains a separate owner gate.

Required nonstarvable execution trace, conditional on the new interfaces:

1. HELD(v), eight retained APPROVE refusals, A entitlement full. Prerequisites
   later become valid. Normal and HOLD histories may also be saturated.
2. The existing release continuation requests canonical RETIRE(G). It claims
   the independent maintenance command slot and uses the existing fixed cell;
   it does not require D3 OPEN, an ordinary result row or a free APPROVE slot.
3. Runtime accepts it through the same ordered path. A bounded scheduler in
   the existing runtime gives occupied maintenance/HOLD/settlement lanes service
   independently of normal admission; ticks and replication also keep progressing.
   Exact duplicates join. A timed-out first attempt retains this one slot and
   its identity until apply or authoritative discard, including leader loss.
4. One application commit advances G, removes eligible refusals, replaces the
   receipt and applied boundary. Crash before commit restores all old state;
   crash after commit restores all new state. Lost notification cannot free
   twice or cause another generation transition.
5. The existing bounded release continuation captures a **new** APPROVE at
   G+1 and exact HELD(v), receives a freed A entitlement, and validates all D2
   predicates at its actual application prefix. Approval consumes the next
   release version only if those predicates hold. Old refused bytes stay retired.

This trace demonstrates a candidate without a self-consuming result pool. It
is not yet a native progress proof. Three residual scheduling cases are explicit:
(a) an unknown old maintenance command requires runtime suffix resolution;
(b) competing APPROVEs can repeatedly win newly freed admission. A bounded,
fair admission continuation in the existing release/runtime owners is required
for an already waiting recovery attempt, including reconstruction; arbitrary
new calls must not repeatedly jump it. (c) Even fair admission is insufficient:
`admit APPROVE(G+1) -> RETIRE(G+1) overtakes it -> APPROVE applies as retired`.
Repeating at G+2 gives every attempt application service but no authorization.
The interaction must protect ordered progress through application, including
retirement scheduling and recovery, not merely allocate an admission slot.
That ordered-progress/fairness/custody interface
is **not currently available**, and this packet does not invent a durable queue
or declare a reserve alone sufficient. Without it the adversarial schedule
`RETIRE -> competing refusals fill A -> recovery APPROVE backpressured` repeats.
The overtaking trace is a second independent progress blocker. These are
concrete remaining blockers to unconditional nonstarvation, not a
reason to increase A. The complete implementation cannot be approved until it
selects and witnesses this interaction or a smaller equivalent protocol.

Liveness also assumes a usable quorum, writable authoritative storage and
eventual runtime/application service. Permanent disk failure, missing image,
unsupported retained origin or counter exhaustion yields typed HOLD. Queue
capacity does not fix a transport operation that never returns; the already
identified outer-release/QueryEngine deadline handoff remains open.

## Proposed internal interfaces and missing proof

Names here describe semantic signatures, not present or approved exports.
Keep them internal to the existing operation/runtime/application owners.

| Proposed seam | Owner and exact input/output | Required witness / blocker |
| --- | --- | --- |
| `classifyReleaseCustody(encodedCommand)` | Release bytes/result adapter -> immutable `{K, G, class, payloadBytes, maxResultBytes}`; canonical mismatch is NOT_ADMITTED | Complete encoding caps; trusted peer forwarded path must use the same classification. |
| `admitCommandCustody(requirement)` | Runtime -> JOIN, RETAINED_RESULT, HISTORY_RETIRED, NOT_ADMITTED(reason), or one generation-bound ticket | Before any async retention; bound callers/queues; test waiter timeout plus late commit and simultaneous exact retry. |
| `transferToCore(ticket)` | Runtime within current serialized leader turn -> native custody or proven pre-core refusal; ambiguity is UNKNOWN | Local and forwarded MsgPropose, role change while queued, deferred Ready, failed host persistence. No generic live Raft object exposed. |
| `reconcileCustody(boundary, occurrences, replacementDelta)` | Runtime/store -> exact surviving projection at applied index/term/origin/G | Actual suffix replacement, duplicate copies, restart, current-term prefix barrier. A stale scan cannot replace newer live custody. |
| `applyReleaseResultOrRetirement(command, actualPosition)` | Result/application owners -> atomic state/result/frontier/applied exchange | Rollback before commit; crash after commit before notification; retired old-G suffix; exact/conflicting replay. |
| `observeCreditProgress(requirement)` | Existing release queue/runtime -> coalesced wake, then re-read authoritative inventory | Existing retry deadline, bounded retained waiter, fair ordered recovery progress through application, no INSPECT loop or grant-on-wake. Competition and retirement overtaking across loss remain unresolved. |
| `restoreCreditInventory(applicationImage, suffix)` | Existing snapshot/application/runtime owners -> reconstructed inventory or typed HOLD | Same accepted image boundary as data/TX/release/results/frontier; native accepted Ready and atomic import. Existing v1 peer-only checkpoint cannot prove this. |

Typed distinctions must reach the existing callers: NOT_ADMITTED/backpressure
is safe to retry under its original budget; UNKNOWN retains custody; a retained
result is immutable; HISTORY_RETIRED cannot establish noncommitment; unreadable
inventory, ambiguous transfer or incompatible profile is HOLD. An environmental
application failure rolls back and retains debt. None grants serving authority.

## Settlement and the D3 clarification

TX1's actual staging ceiling is 256 operations and 1,048,576 operations-JSON
bytes. It does not bound the nested PREPARE or global DECISION. The current
canonical manifest/decision readers have no participant-count ceiling, and
some identity fields have no byte ceiling. The pure probe accepts 4,096
participants (458,841-byte COMMIT decision), a 65,536-byte ID and a 65,536-byte
digest. These are parser measurements, not claims about normal producers or
a native cluster of that size. Normal transaction IDs and produced digests
already have stronger constraints; preserve those instead of weakening them.

The one-nonterminal-participant rule does not bound a global manifest: enlist
N partitions, prepare one participant at each, deliver the same O(N) decision
to each. Serial terminal transactions also accumulate retained participant
operations, operation outcomes and query history without an owned retirement
path. One SQL operation can affect many rows. No global physical or settlement
bound follows from staging. See settlement audit F1-F6 and raw encoding probe.

Required TX/query inputs: QueryEngine measures/reserves eventual closure before
durable enlistment (participant-set.js:32), freezes the exact manifest/profile,
and remains sole global decision owner. Participant request/apply owners reserve
complete PREPARE plus terminal decision/result requirements before creating a
new durable obligation, with the same profile checked deterministically. These
are new byte fields and recovery obligations, not existing guarantees. A
conditional profile of at most 64 participants, raw UTF-8 partitionId <=256
bytes, transactionId exactly 32 lowercase ASCII hex characters and preparedDigest
exactly 64 lowercase ASCII hex characters gives manifest <=199,233 bytes and
decision <=105,115 bytes; it is a partial encoding calculation, **not a
selected production limit**, and still excludes other command/frame fields.

Already acknowledged larger obligations retain exact authoritative settlement.
Query/TX owners must inventory their actual canonical bytes, maintain measured
custody and bound concurrent deliveries while new work is backpressured. Release
budgets cannot refuse their DECISION. If one retained encoding cannot fit the
supported path, return its measured requirement and an explicit settlement
capacity blocker; do not truncate, alter the decision, delete its row or invent
a parallel transport. There is presently no proved universal reserve for the
unbounded existing grammar. COMMIT coverage remains distinct from ROLLBACK.

D3 phase clarification: local staging/drain is a **transition-readiness check**
when reopening, not an ongoing invariant that normal admitted TX1 activity
must preserve. OPEN -> legitimate BEGIN/staging/PREPARED/queued work does not
revoke that work's own release. Actual current `pause.js:218-232` invalidates
OPEN on lifecycle/runtime/term/leaderId/configuration/membership changes; it
deliberately omits staging/drain. In the proposed contract, explicit HOLD and
stale immutable admission tokens fence new work; these new protocol checks
are not implemented. D3 never changes deterministic already-committed effects.

## Preserved dependencies and complete implementation acceptance matrix

The snapshot direction remains the existing application-image/native-import
work, not a new installer. Preserved refs: `9554f689ef1fd4560e23ed8ca4f386266539f83f`,
`458076e64b4e36ac1525f93f6daa41bbf3fadc5c`,
`2384216d16d11dc6d62a682ffef192dc944a7a15`, and preservation diagnostic
`82b54ef9b7c8d6be9f2d6450cbc5e6713ade00af`.
Their old worktree/process observations are not leases; no snapshot work is
taken over. The prior SNAPSHOT-DECISION.md remains the exact dependency record.
It must bind application data, TX obligations, release state, outcomes and G
to one actual applied boundary, then native accepted Ready plus atomic import.
Receiver-local identity/eligibility and volatile credits are reconstructed.

Open owners: runtime application-prefix membership provenance; application
contract/image provenance; QueryEngine durable discharge and token custody;
fresh/retained INIT activation; runtime/result custody and fair retirement
admission; TX/query complete settlement profile and legacy inventory. Capacity
consumes their facts; it does not acquire their semantic decisions.

| Complete future unit / RED-first witness | Status in this packet |
| --- | --- |
| First PREPARE and ordinary write cross committed HOLD and later APPROVE with original binding | Existing local-PAUSE RED retained; committed-HOLD protocol absent. |
| Durable PREPARE/terminal replay validates transactionEpoch and proper phase identity | Existing mismatch RED retained; no repair here. |
| ROLLBACK settlement -> real QueryEngine discharge -> local reauthorization | Accepted old whole-file baseline preserved; recorder-only checkpoint rerun recorded separately. |
| COMMIT settlement/application/CDC and exact terminal replay while new admission held | Required separate existing COMMIT fixture composition; ROLLBACK does not certify it. |
| Timeout/duplicate/leader loss/forwarded proposal/deferred Ready/suffix discard accounting | Required runtime-native W1-W4 in the custody audit; seams currently absent. |
| Saturated refusal history -> retirement -> fair reauthorization, with crash/replay at every exchange | Fixed-cell candidate plus explicit fairness/custody blocker; no native green claimed. |
| Snapshot/install/replay preserves same boundary and starts with receiver-local eligibility closed | Existing snapshot dependency; restart or serialize size is insufficient. |
| D4 exact request result, current authority and local eligibility remain separate | Prior selected result adapter; required exact conflict and retired-history witnesses. |

The eventual implementation unit remains one complete partition-level
release/HOLD -> ordinary-write/first-PREPARE -> durable-outcome/replay path,
including query delivery, D3/D4, capacity and recovery. Reviewed increments
are possible, but no fragment is a working release protocol or independently
landable on focused greens. Stop here for content-bound owner review.
