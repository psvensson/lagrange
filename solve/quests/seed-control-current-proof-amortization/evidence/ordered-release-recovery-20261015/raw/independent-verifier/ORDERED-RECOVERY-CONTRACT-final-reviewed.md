# Selected mechanism: atomic retirement and recovery disposition

Design for content-bound review only. Production implementation remains HOLD.
Baseline c425ef42e18236ff1187e1112a971588bb02b496. Draft 1 remains preserved;
its split durable handoff is superseded by this smaller mechanism after
independent vetting. No production command below exists yet.

## Choice and protected property

Select RETIRE_AND_APPROVE: one immutable maintenance command carries one
complete recovery APPROVE for the next history generation. At one actual Raft
application position, the existing application transaction advances the history
frontier, retires eligible release results, evaluates that exact APPROVE,
records its exact disposition and the fixed retirement receipt, and advances
the applied position. There is no visible state between retirement and the
APPROVE disposition. There is no durable pending handoff, new queue, permit
service, replicated BEGIN or second release/result authority.

The designated opportunity begins when the runtime accepts this complete parent
command into its sole maintenance custody slot, including its future-result
escrow. Exact retries join that opportunity. It ends only at its authoritative
application disposition or runtime-proven discard of all possible occurrences.
Routine retirement and newly arriving APPROVEs cannot steal its result capacity
or invalidate its generation during that interval. This is a progress property
of a selected request, not a guarantee that every unadmitted caller wins a race.

A genuine release-state, origin, membership or other D2 predicate change can
refuse the child. It cannot strand maintenance waiting for that predicate to
become true. The fixed receipt says retirement applied; that is never an
assertion that APPROVE succeeded. Conditional progress assumes eventual stable
leadership, usable quorum, writable authoritative storage, eventual finite host
operations, bounded scheduler service and (for successful authorization) a
sufficiently stable valid D2 interval. Permanent failure cannot be fixed here.

## Exact identities and proposed bytes

Use the preceding fixed-order canonical JSON/UTF-8 contract and exact unsigned
64-bit decimal strings. No counter wraps. IDs and all strings must meet its
measured encoding caps before custody. Hashes below bind full canonical bytes;
a caller-supplied digest is recomputed, not trusted.

    R = ["partition-release-retire-and-approve/1", partitionId,
         [originIndex, originTerm], fromG, canonicalChildApprove]
    M = SHA256("lagrange/partition-release-retire-and-approve/1\n" + bytes(R))
    K = (partitionId, origin, SHA256(childDomain + bytes(child)))

Child is the complete selected APPROVE: its original nonce/request identity,
origin, historyGeneration=fromG+1, exact expected HELD state and all immutable
transition evidence. It is created as a NEW explicit intent for that generation,
not by retagging an unknown/refused old K. Parent binds every child byte. Parent
is admitted only for current fromG, after recovered-prefix/custody reconciliation;
standalone future-generation child is not admissible. Transport route/session
metadata stays outside canonical identity. TransactionEpoch remains unrelated.
R's entire encoded proposal, including wrapper, must fit 16,384 bytes; the child
cannot consume that whole allowance and then add an uncharged wrapper.

One fixed maintenance cell per active partition origin retains:

    ["partition-release-retirement/2", commandKind, origin, currentG,
     lastM, lastFromG, lastToG,
     actualIndex, actualTerm, childK, childDisposition, childReasonCode,
     childConflictWinner]

commandKind is RETIRE_AND_APPROVE or RETIRE. For pure RETIRE, childK,
childDisposition and childReasonCode use explicit NA tags; no child result is
claimed. INIT uses the separately selected empty-cell representation, never an
applied maintenance receipt.

childConflictWinner is a tagged KNOWN(key), UNAVAILABLE or NA value, never a
null conflating those facts.

The cell is <=4,096 bytes and is the exact bounded parent receipt. The detailed
child result lives in the existing result owner's typed release-result adapter;
it retains canonical child bytes, original disposition and original conflict
winner. Parent and child name the SAME actual log position. No guessed submit
index, future prefix, caller disposition or current winner substitutes for it.
A hash collision assumption is explicit, matching the preceding identity design.
Maximum variant encodings still need the production bytes owner's proof.

## Admission, deterministic transitions and replay

| Condition / event | Selected rule and authoritative effect |
| --- | --- |
| Current fromG, no M custody, profile reconciled | Runtime reserves one M occurrence, one child future result and one future fixed receipt before async retention. Opportunity obtained. No A slot is required yet. |
| Same M and identical bytes, local or forwarded | Join; no second entitlement or core call. Retained parent replay reads exact cell. |
| Distinct M while slot occupied | NOT_ADMITTED(MAINTENANCE_BUSY), no authoritative result/annotation allocated. Original M, bytes and charge survive timeout/demotion. |
| Routine RETIRE while M is pending | NOT_ADMITTED(MAINTENANCE_BUSY). All maintenance creation uses same slot; no second privileged lane. |
| Competing current-G APPROVE | May use its own ordinary A quota; it cannot touch M escrow. If it changes actual authority before R, child's expected-state check legitimately refuses. Refusals cannot exhaust M. |
| Ordered R, current fromG, supported origin/profile | In ONE transaction advance G, retire eligible old release results, evaluate child D2 against actual preceding application state, write child outcome and any accepted release transition, replace fixed receipt and applied position. Release version changes ONLY for accepted child transition. |
| Child predicate fails | Explicit history retirement still advances G; child exact REFUSED leaves release authority/version unchanged. This is not the rejected unchanged-L-but-spent-release-epoch rule: G is history, never release authority. |
| Environmental failure in that transaction | Roll back G, all deletions, child result, release state, receipt and applied position together; retain command/result debt and existing recovery path. |
| Lost response / exact replay | Read original parent/child results. No new generation, result, annotation or authority effect. |
| Old G occurrence, including stale ordinary work | Consume only as HISTORY_RETIRED, with no authority effect or new result row. Command charge remains until actual apply/discard. Never claim NOT_COMMITTED. |
| Old M equal to retained lastM | Replay that immutable receipt, even if current authority changed. Never recompute child disposition. |
| Different old M | HISTORY_RETIRED / outcome unavailable, never winner success. This is not an exact historical refusal assertion. |
| Future fromG at application or malformed carried identity | Protocol violation / typed recovery HOLD; no mutation. A valid creation gate cannot emit this. |
| G at maximum / unsupported retained profile | No new maintenance admission; explicit recovery/identity-migration gate. No wrap or discard-to-fit. |

Typed validation edge contract (all NEW result-adapter/runtime vocabulary):

| Edge | Selected response |
| --- | --- |
| Before custody: wrong parent/child partition, origin, G relationship, digest or canonical shape | NOT_ADMITTED(MALFORMED_COMPOUND_IDENTITY); no result claim. |
| Before custody: maximum G, unsupported retained profile, real pinned result, excessive reconstructed occurrences | NOT_ADMITTED(GENERATION_EXHAUSTED / PROFILE_UNSUPPORTED / RETIREMENT_PINNED / OVER_PROFILE); ordinary recovery HOLD remains visible. |
| Before custody: whole encoded command exceeds cap | NOT_ADMITTED(COMMAND_TOO_LARGE); no truncation or partial custody. |
| Storage read unavailable, applied boundary inconsistent or unresolved prefix | HOLD(INVENTORY_UNAVAILABLE / PREFIX_UNRESOLVED); retain any existing debt; do not classify as never committed. |
| At committed application: malformed compound identity, future G, unsupported replicated schema/profile or violated replicated retention/pin invariant | HOLD(COMMITTED_PROTOCOL_VIOLATION / PROFILE_UNSUPPORTED / RETIREMENT_PINNED); transaction rolls back, applied position unchanged. These violate replicated contract/format assumptions, not deterministic child refusals. Follower-local custody counts are NOT an application precondition. |
| Exact retained lastM but missing/mismatched child result at current G | HOLD(RESULT_INCONSISTENT); parent receipt is evidence of commitment, not permission to fabricate the detailed child result or reexecute. |
| Different retired M/K with coherent frontier | HISTORY_RETIRED(disposition=UNAVAILABLE); never NOT_COMMITTED, never today's winner. |

The parent-child identity checks include partition, durable origin, exact G+1,
canonical child kind, request digest and complete canonical contents. Receipt and
child result must agree on their original actual index/term and were written
with that entry's applied advance. Their position must be consistent with and
no later than the current applied prefix; later entries advance the watermark
without rewriting historical outcomes. Equality to today's watermark is NOT
required. Read failures
remain distinct from a coherent historical absence. Replicated profile validity,
including no sole-result obligation pins, is an explicit progress assumption.
A follower's local count of retained/unapplied occurrences is not such a fact:
over-profile custody gates NEW creation only. It cannot refuse or stop an
otherwise supported accepted R at application. An actual I/O/unwritable-store
failure may defer application through the existing environmental-failure owner;
an admission quota is not that failure.

Atomic microsteps: validate parent fromG at the real pre-entry applied prefix.
Capture any bounded conflict attribution needed from authoritative state/retained
facts there. Within the SAME transaction, retire and set G=fromG+1; child history
validation then sees this new G. Child release-state/membership/query checks see
the real pre-entry facts, which history retirement does not change. Child and
parent have one actual position, not two synthetic prefixes. If the original
conflict winner can be established at evaluation, persist KNOWN(key); if relevant
history is unavailable, persist UNAVAILABLE; use NA where no winner applies.
Afterward replay never substitutes a current winner for that immutable value.

A distinct same-generation maintenance candidate cannot legitimately obtain the
single slot while its predecessor may still apply. This requires reconstruction
of core/Ready/durable custody and a current-term applied-prefix barrier; today's
process map does NOT establish it. A competing command discovered in retained
history is counted, blocks new creation if over profile, and is applied in order:
first advances G, later old candidate receives HISTORY_RETIRED/unavailable.
It never borrows the winner's receipt. This defensive behavior does not certify
that the admission contract held or provide an exact result that was not kept.

Pure RETIRE may use this same M slot when no protected compound request exists;
it has the prior fixed-cell semantics. Once R has custody it cannot overtake R.
If an older retirement already owns M, R has not yet obtained the opportunity.
The existing continuation submits R directly when saturated; it does not first
submit a pure RETIRE then race for A capacity. A pending maintenance slot cannot
be replaced by an arriving maintenance request, even one claiming higher priority.

Necessary HOLD and authoritative settlement keep their own owners/lanes and are
not gated on child's validity. HOLD can legitimately change child's expected
state; R still finishes with a refusal. A full HOLD result history can wait for
this finite maintenance application to reclaim eligible history, not for an
APPROVE success. This does NOT yet prove nonstarvable closure: after retirement,
competing refused HOLDs can fill H before a needed HOLD takes capacity. The
existing release continuation/runtime owners still owe a concrete OPEN-state
retirement wake and protected closure result exchange. That residual closure
contract is an implementation blocker, not a reason to extend this packet into
a second command design silently. No deadline/lease requires unsafe forced release. Replication,
configuration, ticks and catch-up never consume a new release-request entitlement.

## Custody and exchange

| Stage | Sole owner and selected invariant |
| --- | --- |
| Pre-core | Runtime reserves M and both future results before tail/async retention. One identity, immutable bytes. Bounded waiter joins are separate. |
| Core accepted / unknown transfer | Runtime retains ticket until actual occurrence (index, term, digest) is known; ambiguity is UNKNOWN, not release. |
| Ready held | Same occurrence charge survives send awaits, host persistence deferral and runtime demotion. |
| Durable suffix | Store persists first, then supplies exact retained/replaced occurrence delta. Only proven-discarded occurrences release command debit. |
| Committed unapplied | Result escrow remains. No caller timeout, ACK, commit notification or removed waiter frees it. |
| Atomic application | Existing transaction exchanges child escrow for one detailed A result and future parent receipt for fixed cell; consumes command occurrence. No free/reacquire gap. |
| Duplicate physical copy | Independently charged through its own apply/discard, even though semantic result entitlement is shared. It replays cell/result or observes retirement, never applies authority twice. |
| Successor | New creation held until exact image/frontier plus all surviving suffix/core/Ready transfers are inventoried and current-term prefix ambiguity is settled. No live-map miss proves absence. |

Before ordering: loss may end a purely local reservation only after that runtime
and all possible forwarding/transfer paths are proved fenced or classified;
otherwise UNKNOWN. After durable append: replay or exact suffix replacement,
not caller memory, decides debt. After commit before apply: successor applies
R and obtains both outcomes atomically. After apply before reply: exact replay
reads receipt/result. A proven-discarded R may be retried with its SAME bytes if
fromG is still current; if later retirement superseded it, return unavailable.
A new generation requires explicit new intent. No automatic retag.

## Finite logical projection and resource limits

Retain prior illustrative C_INIT=128,Q_INIT=32; C_HOLD=4,Q_HOLD=2;
C_APPROVE=8,Q_APPROVE=4; Q_M=1. Add an explicit independent M future-child
entitlement of 24,576+1,024 bytes and future receipt allowance of 4,096 bytes.
This is not a second A command: only the parent proposal is charged. Prior
receipt may still occupy its cell while the future receipt is reserved.

    prior conditional projection 4,243,456
    + child future result/key 25,600 + future fixed receipt 4,096
    = 4,273,152 bytes

This remains arithmetic, not adopted production capacity or a complete-system
bound. Required exchange lemma: in a conforming current leader, at most four
unique ordinary A commands are pending (Q_A=4). Once eligible retained old-G A
rows are retired, at most four pending entitlements remain; adding one child
result needs at most five of eight A entitlements. Those old-G pending commands
remain charged until apply/discard and cannot apply fresh authority. An exact
physical duplicate consumes Q but not another entitlement. HOLD/INIT pending
entitlements similarly survive their class retirement.

The <=5 exchange lemma belongs ONLY to the conforming active-leader admission
projection, never a follower-local predicate for deterministic application.
A lagging follower can have many future-result obligations while replaying this
same R; carry that over-profile debt and continue ordered application. Do not
wait for later entries to free credits before applying their predecessor R.
This packet does not claim a finite follower-memory bound.

If old result rows are pinned by a real obligation, a NEW-admission inventory is
over profile, or newly supplied encodings exceed caps, the admission lemma does
not apply. Do not delete obligations or accept NEW R assuming room. Return typed profile/retention HOLD and name the
owner dependency. The selected policy requires current release authority to be
self-contained and TX/query obligations to retain their own complete bindings;
no unresolved obligation may depend solely on a retired release-result row.
Existing acknowledged larger TX/query obligations retain settlement outside this
release budget. No global bound follows from one nonterminal TX participant.

Follower backlog is a different resource: majority may advance many generations
while a follower retains every unapplied command. Incoming replication is not
fresh admission. Count/replay that history; do not quota-drop it. New creation on
over-profile promotion stays held while owned apply/snapshot catch-up runs.
Current runtime inbound push and whole-log restore lack the selected bounds; the store uses
.all() and native MemStorage restore materializes all entries. Bounded intake,
chunked reconstruction/native storage and snapshot catch-up remain concrete
runtime/store/snapshot dependencies. WAL/pages/log pins/native copies and TX/CDC
history have their own owners; this packet does not redesign their total quotas.

## Conditional progress and scheduling decision

No fairness of client arrival is assumed to allocate A after retirement: child
already travels inside R and obtains its result before any next log entry can
apply. Once M is admitted, rank is (unresolved ownership, not ordered, committed
not applied, disposition). After finite failures and prefix reconciliation, a
finite number of already-owned predecessor operations drains; R reaches order,
commit and application if its bytes remain in authoritative custody. A proven
discard may instead end this opportunity. If original bytes remain with the
existing release continuation, it may redrive that exact M; if a cold loss
removed purely pre-core bytes and the runtime proves no possible occurrence,
report terminal discard/loud stop. Eventual fresh intent is a separate owner
obligation; do not claim that a request whose bytes were lost must apply.
Competitors cannot grow that predecessor set ahead of R
or take M escrow. No applied RETIRE can occur between its retirement and child.
A legitimate refusal finishes the opportunity. Later valid intent is a new R/K.

Select bounded service in the EXISTING per-group runtime: each scheduler round
services at most one item from each nonempty lane in fixed cyclic order:
consensus, maintenance, HOLD, settlement, ordinary. In the consensus lane
service one owed tick AND ONE captured already-owned inbound envelope (when
present), draining each finite Ready operation before the next item; arrivals cannot extend that batch. Recheck role/generation
immediately before core transfer after that consensus work. The release lanes retain only
their admitted bounded custody; they are not new unbounded waiter queues.
Ordinary/TX/query settlement custody and encoding bounds remain their existing
owners' separate unresolved interfaces; this round rule does not prove them. One round
therefore offers M service despite continuous ingress. This is an operation-count
rule, not a timeout increase or a claim of wall-clock bounds. Fairness still
assumes every individual native/host operation eventually returns.

Current drainInbound recursively drains until empty and current Promise tail is
not this scheduler. Both need one owned runtime change before progress can be
claimed natively. Core membership/commit progression retains required ordering;
batching must never discard accepted inbound work. Physical input buffering and
safe transport backpressure need their separate bounded-intake interface.

Existing release continuation constructs and submits this ONE command through
existing delivery. Startup registration, consensus changes and recovery use the
same custody reconciliation path; no second durable handoff debt exists to scan.
Read exact result/custody before regenerating intent. No D3 OPEN/census early
return may erase an unknown R. The current APPLIED_PROGRESS relay gap may inform a future existing-owner wake
integration; this atomic choice does not require a durable handoff scan or new
relay merely to repair draft 1. Current construction starts with an empty
registry and registration wakes recovery; no existing startup defect is claimed. Fresh attempts
still need real D0 inputs. D3 remains local serving eligibility; normal admitted
TX1 staging/PREPARED work does not revoke its own release. Deadline handoff to
QueryEngine remains open and separate.

## Source ownership and implementation seams

| Existing owner/function at baseline | Required extension; current evidence/limitation |
| --- | --- |
| replica-handler-release-recovery.js createParticipantReleaseRecovery/reconcile (:95,:189); participant-cutover runCutoverAttempt (:247) | Construct R once from new intent; resolve existing custody/result before refresh. Existing early checks do not implement this. |
| raft-rs-proposal-codec.js encode proposal (:34), release bytes adapter | Canonical parent/child and whole proposal size; parent binds child; no submission index. NEW command/schema. |
| raft-rs-runtime-owner.js enqueue (:956), proposal (:1650), drainInbound (:1691), perform (:1727), enqueueStep (:1950); raft-rs-ingress.js (:168) | One local/forwarded admission gate, M custody across loss, finite scheduler/intake. NEW interfaces; current waiter maps insufficient. |
| raft-rs-runtime-owner.js Ready (:1191), apply (:1099/:1136) | Attach actual occurrence, preserve deferred Ready debt; native controls below establish only existing behavior. |
| raft-rs-durable-store.js readDurableRecord (:207), persistReady (:404), suffix replacement (:422) | Exact replacement delta, bounded reconstruction and current-term prefix inventory; missing typed custody proof today. |
| raft-rs-application-transaction-owner.js applyCommittedEntryTransaction (:51) | Single synchronous transaction already owns effect + applied boundary; add parent/child exchange there through application callback. No new transaction owner. |
| partition-committed-statement-outcome.js read/record/replay (:109,:137,:288) | Typed release adapter owns exact child result and fixed receipt/frontier; not an unrelated competing ledger. NEW persistent schema, not unchanged behavior. |
| snapshot application/native-import owners | Same exact application image must include data, TX obligations, release state, outcomes/frontier/receipt; native accepted Ready and atomic import. No release-specific installer. |

Proposed internal interfaces: classifyCompoundRelease(bytes)->{M,K,fromG,childG,
commandBytes,maxChildResult,maxReceipt}; reserveMaintenance(requirement)->JOIN /
RESULT / RETIRED / NOT_ADMITTED / custodyTicket; reconcileCustody(imageBoundary,
actualOccurrences,authoritativeDiscardDelta,currentTermBarrier)->inventory or
HOLD; applyRetireAndApprove(command,actualPosition)->atomic parent+child results;
serviceAdmittedTurn()->bounded existing-owner round. Names are proposals, not
existing exports. Runtime determines custody, application determines outcomes,
release determines legitimate intent, TX/query determine settlement, snapshot
owner determines image import. No owner decides a neighbor's truth.

## Smallest later implementation increment and acceptance boundary

First proposed reviewed increment: native custody/ordering seams and typed
compound command through the existing runtime/store/application/result owners,
with RED tests for timeout-late-commit, forwarded duplicates, suffix discard,
leader reconstruction, saturated history and atomic refusal/approval. It must
include the finite runtime service rule and exact result exchange; implementing
only a spare slot is insufficient. It is an increment within the complete
partition release unit, not an independently certified/landable protocol.

The complete unit still includes INIT/HOLD, ordinary-write and local-TX1 binding
capture and sealing/redirect/unknown retry, first PREPARE fencing, exact PREPARED
and terminal replay, authoritative ROLLBACK AND COMMIT settlement, D3/D4,
prefix provenance, durable query discharge, activation, capacity and owned
snapshot/native import. Those dependencies remain HOLD pending exact owner
contracts and witnesses. The previously accepted local-PAUSE ROLLBACK control
and recorder are unchanged. No full lab campaign, merge or successor seal here.
