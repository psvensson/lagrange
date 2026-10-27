---
audience: development
documentClass: evidence
---

# MG source occurrence and committed delivery: proposed interaction contract

Status: **PROPOSED FOR INDEPENDENT DESIGN REVIEW**. Author:
`subagent:/root/mg_delivery_design`, 2026-10-23. This dossier is read-only
research against `f5fb317bebc3dc074f3d8d4102122ba4ddb94ecc`; it adds no source,
test, receipt, seal, log, native or lab result. Current continuation steering is
`origin/main` at `240dfaaac22402f5ba8f80dbe5df520e8a450644`. The root is the
integration owner and sole production writer of the current observer increment.

The owning Quest remains `retained-seed-original-handoff`; the epic remains
`raft-rs-full-cutover`. This proposes its next bounded source-to-MG interaction,
after the approved observer contract, not another recovery architecture. The
eight sealed predicates, approved R1/R2 corrections, both startup holds, and
the independent source/native/lab gates are unchanged.

## Claim and non-claim

A durable source event may become eligible for the existing source
`CDC_DELIVERED` command only after every subscriber responsible for that event
returns the existing canonical committed CDC outcome for that exact event.
The topology subscriber must first obtain committed outcomes from its selected
source MG and every required target group in its delivery wave. Native append,
transport ACK, local/provisional cache population, ordinary callback return,
diagnostic ledger indices and content equality are insufficient.

The durable source ledger remains the recovery authority. The normal source
delivery owner retries the same owed occurrence after lost answers, leader loss
and restart. A duplicate recipient native occurrence is legal; no new durable
dedup ledger, receipt store, controller or event identity schema is proposed.
This contract proves delivery acceptance, not historical proof that an old
source ACK was correctly authorized, subscriber membership across topology
changes, global exactly-once effects, retained-prefix compaction, public
startup, activation, handoff or release readiness.

## Current complete operation and first causal divergences

The following source anchors are from the named base, before implementation.
They identify existing owners rather than granting authority to the dossier.

| Stage | Existing owner and source anchor | Current evidence / correction needed |
| --- | --- | --- |
| SQL to durable source debt | `partition-service-entry-apply-base.js:622-658`; `partition-cdc-obligation.js:123-156` | Application result, first statement outcome, generation and canonical event debt are written with native applied advancement. Use the actual write builder; do not recreate CDC from later row contents. |
| Source occurrence envelope | `partition-cdc-obligation-delivery.js:170-180` | `eventOf` emits ledger eventKey, entryId, sourceLogIndex and sourceOrdinal, plus original event JSON. Preserve them through every boundary. |
| Source delivery and ACK eligibility | `partition-cdc-delivery.js:441-484`; `partition-cdc-obligation-delivery.js:457-476` | Undefined or ordinary success passes. Wrapper records delivery, and obligation lane acknowledges every non-provisional return. These are actual causal gates, not merely diagnostic omissions. |
| Production subscriber | `bootstrap/shared/partition-cdc-propagation-subscriber.js:188-230` | Awaits propagation and discards its result; afterPropagation runs regardless of returned semantic success. Return the canonical result and run completion-only hooks only on committed success. |
| Seed and joining bridges | `bootstrap/owners/seed-runtime-bridge-owner.js:199-216`; `bootstrap/node-joining-publication-activation.js:718-729` | Rebuild table/operation/data and drop the source envelope. Both production paths must consume the envelope owner. |
| Topology source and target wave | `topology/cdc-group-propagation-service.js:192-316,404-454` | Source apply result is discarded. Grouped/safe paths recreate three-field events. Overall success currently follows zero recorded target failures. |
| Topology batching and retry | `topology/cdc-group-propagation-delivery-methods.js:159-173,199-235,350-390,476-555,670-770` | Immediate and background maps coalesce by row key and retain only data; normalizer and payload construction drop identity/timestamp. `deliverToTargets` tests acknowledged only. Existing retry keys must not be mistaken for durable eventKey. |
| MG single/batch forwarding | `message-group-forwarding-owner-delivery-methods.js:355-437,441-501,503-752` | Rebuilds events, may invent timestamps, and discards successful remote response. Addressed local convergence returns an untyped local-success boolean. |
| MG recipient and normalization | `message-group-service-cdc-propagation-runtime-methods.js:1-236,251-274` | Single/batch handlers discard apply/forward answers and return transport-shaped success. Normalizer filters malformed members and loses source identity. |
| MG native route | `message-group-service-cdc-replication-runtime-methods.js:140-301,308-398`; `message-group-proposal-routing.js:115-125,205-252` | RF1/local strict ingress can bypass native proposal. Leader may populate cache before proposing. The port success is append-only; route retry discards its actual result. |
| Native committed application | `message-group-service-raft-timing.js:35-81,187-205`; `raft-rs-application-transaction-owner.js:40-99` | Actual callback supplies native index/term and afterCommit/afterRollback. This is the recipient completion seam. Existing application projects fields and invents a single-event timestamp if absent. |
| Transport return | `transport/message-router-pending-response-ledger.js:508-523`; `transport/message-router-delivery-behaviors.js:222-268` | The service-result path preserves arbitrary handler fields and returns its final result. The correction should consume this contract, not add a second transport completion protocol. |
| Source ACK persistence | `partition-cdc-obligation-delivery.js:289-426`; `partition-cdc-obligation.js:206-224` | Current lane preserves exact pending ACK command across uncertainty. Applying its pinned source groups is the only delivered-flag mutation. Preserve this separation. |

All source paths above are relative to `src/`. The complete consumer census
includes initial hydration, replica registration and joining subscription
factories (`bootstrap/phases/seed-cache-hydration-cdc-subscription.js:62-109`,
`bootstrap/bootstrap-service-replica-registration-methods.js:206-236`,
`bootstrap/node-joining-publication-activation.js:306-325`). All use the same
subscriber factory and must be tested through it.

## Existing canonical contracts to consume

`cdc/cdc-event-envelope.js:4-35` owns copying timestamp, sourcePartition,
sourceReplica, eventKey, entryId, sourceLogIndex, sourceOrdinal, sourceScope,
causeId and replayOnly. `partition/cdc-event-buffer.js:38-46` owns durable
identity `[durable-tag, sourcePartition, eventKey]`; its `:62-65` already
forbids row-content coalescing of a durable event. Apply that same distinction
in topology/retry/transport replacement instead of inventing another key.

`cdc/cdc-delivery-outcome.js:20-118` owns semantic event digest, vector wait
identity, committed/provisional outcome construction and validation. Its
committed receipt binds sourcePartition/eventKey/eventDigest and recipient
groupId/logIndex/term. Diagnostic causeId and replayOnly do not change the
effect; source index/ordinal/scope and original timestamp do. The existing
validator requires exactly one receipt per distinct expected durable binding,
and rejects missing/extra/duplicate receipts. Use it at every consumer.

The envelope owner must explicitly validate a supplied durable source position
and preserve it; silently omitting an unsafe position from the semantic digest
is not allowed. The current delivery producer uses safe numeric source
positions. Preserve that supported representation; do not convert native
decimal positions unsafely. Unsupported positions are unavailable at the
boundary, never rounded or assigned a new identity. `sourceScope` is checked
by `cdc/cdc-source-scope-evidence.js:22-58` when present. It names logical
partition/table/range/version, not original allocation or physical incarnation.
Those identities remain with original preparation and native lifecycle owners.

## Proposed recipient completion mechanism

The existing MG service owns a bounded transient wait for its native committed
application; no general recovery controller is created. The mechanism does
not exist in the base and must be added to that owner as part of this unit.
Reuse `partition/proposal-queue.js:31-216` as the existing bounded waiter
mechanism, including its owned capacity/backpressure and injected timer
clearing, rather than copying its queue algorithm or adding a durable store.
MG policy converts its queue releases to `CDC_COMPLETION.UNKNOWN` and
capacity refusal to `CDC_COMPLETION.BACKPRESSURE`.

1. Capture one immutable semantic event vector with the envelope owner before
   the first await. Reject a malformed member or duplicate durable identity
   with different content before local application/proposal. Never filter a
   durable batch down to apparent success. Plain cache-only events retain
   their separately existing semantics; they cannot satisfy durable debt.
2. For durable events requiring committed acceptance, register the bounded
   waiter under `cdcCommitWaitIdentity(events)` before the local proposal.
   Capture the exact service object, port/lifetime, expected group and original
   absolute expiry. Registration must precede synchronous RF1 application.
   A duplicate active vector receives a retaining typed outcome, not another
   waiter with a renewed deadline or an invented result.
3. Keep existing retry counts, backoff and computeCdcProposeTimeoutMs. The
   captured per-attempt budget covers append plus applied completion, rather
   than adding another full wait after append. The encompassing original
   delivery deadline does not restart at forwarding, batching or late joins.
   Stop new submissions when it is spent. Use the current retry/transport
   lifetime, not a second periodic poll. Absolute-deadline plumbing is part of
   the same caller/recipient change; it must be verified, not assumed from a
   relative timeout at each hop.
4. RF1 must obtain native committed application for durable success. The
   existing permitted strict/local metadata-ingress path may populate its
   projection as before and return `buildProvisionalCdcOutcome`; it cannot
   mint a committed receipt or discharge debt. This preserves the formation
   escape from circular readiness without pretending it is commitment.
5. The committed command keeps the full copied envelope. Its application
   consumes the same captured semantics without timestamp synthesis or batch
   filtering. The normal cache application remains in its existing owner.
   Register receipt settlement only in `effects.afterCommit` with the native
   `{index, term}` and actual service.groupId. Do not use operationLedger.index,
   proposal return, cache dedup result or CDCAPPLIED event as proof.
6. One isolated afterCommit effect builds and validates the entire committed
   vector outcome, then settles an exact current waiter. Check its synchronous
   deadline and service lifetime at settlement, not just whether its timer
   callback ran. afterRollback yields no receipt. Unrelated notification errors
   cannot starve settlement, and settlement cannot reverse native commitment.
7. A follower forward returns the exact remote outcome, validated against the
   intended group and vector. `routeMessageGroupCommand` must retain its route
   answer; generic MESSAGE/ACK routing still only promises its existing append
   contract. CDC owns the additional applied-completion interpretation.
8. Service shutdown/replacement stops admission synchronously and settles only
   that service's waiters unknown before releasing the exact port/database.
   Late effects cannot settle a successor's waiter. Removing a waiter releases
   only transient response custody, never native history or source debt.

A lost reply needs no durable MG outcome index: redelivery of the same source
event may propose another exact native occurrence and receive that occurrence's
real afterCommit receipt. In-memory dedup may avoid repeated projection work,
but cannot answer commitment without an actual committed occurrence. Recipient
restart loses all waiters and diagnostic state; the source remains owed until
the source ACK itself commits.

## Propagation and source-gate integration

The selected source MG identity comes from the actual selected service. If a
grouped routing projection supplies a different sourceGroupId, retain debt and
return unavailable; do not bless the mismatch by validating against the
projection. Each target's expected group is captured in the current topology
wave. Rerouting changes address, not the target group whose receipt is owed.
Unresolved original targets survive safe-fanout recovery. Newly discovered
targets and permanent topology-membership policy remain the topology owner's
existing responsibility, not a new CDC ledger in this unit.

Every single/batch, grouped/safe, immediate/background, follower relay and
addressed-local branch carries `copyCdcEvent`/metadata through unchanged.
Durable events are keyed by the existing durable occurrence identity. Distinct
same-row occurrences never replace each other. Exact duplicate events may share
work only if every attached caller receives its own exact result within its
original deadline. The bounded initial choice may simply refuse sharing and
let source retry; no ambiguous callback-success coalescing is allowed.

`cache/cdc-propagation-delivery-profile.js:158-191,233-249` is another relevant
boundary: row-based replacePendingKey must be disabled or source-identity-bound
for durable events before normalized profile metadata drops eventKey. Ordinary
row-coalescing policy remains owned there. Background retry entries retain the
full copied envelope; reaching their existing retry bound does not settle the
source callback successfully. The durable source lane still owns eventual
redelivery, using its existing cadence and current-tenure checks.

For a durable target wave, `isCommittedCdcDelivery(answer, events, target.groupId)`
is the success predicate. A valid provisional transport response remains
provisional. Empty, malformed, noHandler, error-bearing, wrong-group and merely
acknowledged responses remain failures with their actual outcomes retained.
The source local answer uses `isCommittedCdcOutcome` because no transport ACK is
required there. `completeCdcPropagation` combines the exact source answer and
the validated target-failure population; a zero-target wave still requires its
source MG's actual committed answer. Error/unknown must never be lost when
wrapping results through buildLatencyCdcPropagationResult or the subscriber.

For durable events, the source wrapper, buffered/sliding handshake and
obligation driver each require the canonical committed result before advancing
their own delivered tracking. A valid provisional result may allow the bounded
scan to deliver later formation metadata while retaining the current debt.
Undefined, ordinary success or any other noncanonical answer does not enter the
ACK batch. Keep the current lane/tenure/subscriber-set checks before and after
await. A table-mismatching callback is not an acknowledgment; the subscription
owner must select the event's responsible subscriber, or report invalid input.
Diagnostic-only observers must not silently acquire durable ACK authority.

## Typed failure and lifecycle table

Use existing `CDC_COMPLETION` values and owned transport/native refusals. Add
named subreasons to that owner only when necessary for a discriminator; do not
invent caller-local truthiness rules.

| Edge | Caller outcome | Retained obligation / wake |
| --- | --- | --- |
| Empty durable batch, malformed envelope, identity/content collision, unsupported numeric position | INVALID; unsafe representation may be explicit unavailable subreason | No native proposal or source ACK. Existing source debt stays. |
| Provisional local hydration, native participation not yet available | PROVISIONAL, exact cdcProvisional bindings | Source's bounded provisional scan/retry revisits; no delivered flag. |
| Wait capacity exhausted or duplicate active vector without independent waiter capacity | BACKPRESSURE, existing retry hint | No new proposal; existing caller/waiter and source ledger retain work. |
| Append accepted, commit/application absent or deadline spent | UNKNOWN | No cancellation/truncation. Source retries same occurrence; original deadline not extended. |
| Native apply rolls back, host failure, port refused | UNKNOWN or owned refusal with cause | No receipt; ordinary native recovery retains committed history. |
| Wrong group, digest, index/term, extra/missing receipt, noHandler or ACK-only reply | INVALID/UNKNOWN as appropriate; transport details preserved | No source ACK; exact target remains in failed set. |
| Router disconnect, lost result, source tenure/subscriber set changed, recipient shutdown/replacement | UNKNOWN / existing current-lane refusal | Old response cannot settle current lane or successor; source ledger persists. |
| Valid current afterCommit receipt for every required target | Canonical committed success | ACK eligible only; source row remains owed until canonical CDC_DELIVERED applies. |
| Source ACK append accepted but answer lost | Existing ACK OUTCOME_UNKNOWN | Retry the identical pending ACK command; reopen reads source ledger. |

## Cached-view and authority audit

- Source lane pending/scan/commands are tenure-local bookkeeping. Reset drops
  these projections and rereads durable ledger debt; reset never marks delivered.
- MG cache and CDCHandler.processedEventIds are projections, including possible
  pre-commit population. Cache application/dedup/notification is never receipt
  authority. Native applied advancement and afterCommit are the completion cut.
- MG operationLedger remains diagnostic. Its local index is never used in a
  committed receipt or cross-member retained classification.
- Topology grouped/safe targets are current routing input. They cannot change
  source occurrence identity, erase failed captured targets or prove historical
  delivery. An address retry preserves the expected target group.
- New transient MG waiters have bounded capacity, original expiry and exact
  service lifetime. Deletion/shutdown closes only wait custody. There is no
  cache of approvals, indefinite result map or startup authority bit.
- The source's event_json and pinned ACK command remain the durable owners. This
  proposal does not add another stored explanation of their obligation.

## Required native and integration evidence

Keep each negative paired with the same engaged positive. Register the new
interaction and witnesses in impact contracts and regenerate metadata using
the repository commands. The following are proof requirements, not executed
results:

1. Real source PartitionService QUERY through executeQuery/proposeWrite creates
   a canonical row, HLC and nonempty owed obligation. Use real recipient RF1
   and RF3 MessageGroupService/native ports and a real MessageRouter handler.
   Record exact source event, recipient retained command/index/term/apply,
   returned receipt, source ACK and first delivered index/term.
2. Hold the actual recipient native commit carrier after append. Source has
   no ACK proposal/delivered flag while the native suffix is local or committed
   pending application. Release the carrier/application; exact receipt then
   enables source ACK, and only its actual apply sets delivered. Demonstrate
   the hold was engaged with the expected native bytes, not a setup failure.
3. Lose recipient answer after real apply; crash/reopen source and recipient;
   redeliver the same eventKey/timestamp/position/data. A new native occurrence
   may commit, but no new source SQL event is fabricated. Lose source ACK result
   separately and show exact ACK retry/idempotence and first ACK provenance.
4. Exercise actual seed and joining bridge/subscriber composition; grouped and
   safe fanout; single and batch; follower relay; no-target source group;
   wrong-group, noHandler, transport ACK-only, undefined and ordinary success.
   Return the response through the real router's result boundary, not an
   always-success transport stub.
5. Two distinct source occurrences with identical row values must survive
   immediate batching, retry map and replacePending handling. Mixed valid and
   malformed batch refuses the entire durable batch. Wrong digest/index/ordinal,
   duplicate/missing/extra receipts and missing timestamp stay owed.
6. Provisional startup hydration admits later metadata in the bounded source
   scan while preserving earlier debt; later real native receipt drains it.
   RF1 cannot report committed success merely by local apply. No timeout,
   retry count, public 30000ms budget or cadence increase is used to pass.
7. Force recipient apply rollback after cache population, delayed deadline timer,
   shutdown during response, port/service replacement and source tenure change.
   No stale waiter settles a new lifetime; no receipt is minted on rollback;
   timers clear on their creating clock and wait queues return to zero.
8. Re-run existing source obligation O1-O19, bootstrap subscriber, topology
   stop/retry/closure, MG forwarding/replication and real MG native suites.
   Adapt fixtures through owned contracts where needed; do not replace real
   committed completion with a forged receipt to satisfy the decisive witness.

Useful existing witnesses include `test/partition/partition-cdc-obligation.test.js`,
`test/bootstrap/partition-cdc-propagation-subscriber.test.js`,
`test/topology/cdc-group-propagation-service.test.js`,
`test/message-group/message-group-service-raft-replication-and-cdc.test.js`,
`test/message-group/message-group-service-strict-cdc-forward-routing.test.js`
and `test/raft/raft-rs-backend/message-group-on-raft-rs.test.js`. The last already
constructs real MG services, durable files and router and reads native facts
independently. Existing test shapes alone are not applicability proof.

Freeze source bytes, run the registered native/integration cone on a locked lab
worker, record worker/job/head/counts/failures, complete applicable static and
metadata gates, and obtain independent source review. Compare the predecessor
on the same host before attributing a newly observed regression.

## Historical and comparative evidence

The earlier `runtime-ordering-completion-consumer-proof/evidence/closeout/`
`MG-FIRST-RESULT-CLASSIFICATION.md` records frozen
`5a3cdc71854c7d97d2e3b688258b73c19dd0c6e4` on tv-dator. Its first native custody
test failed before recipient proposal because its direct INSERT fixture omitted
the structured data and HLC the actual producer supplies. The retained source
debt was real, but successful propagation/ACK/loss/replay were unexecuted. Keep
that failure; use the actual write builder in the new paired witness. It must
not be relabeled as demonstrated custody loss.

The Oct 11 TX1 `evidence/review-checkpoint-cdc-retry-correction.md` separately
records a lost retry after transient ledger read failure, a discarded rejecting
Promise child and referenced timers. Its bounded correction did not prove
production startup or MG committed delivery. It gives concrete regression
controls: recovery after one read fault without new traffic, exact unknown ACK
retry, same-tenure checks and no unowned timer/Promise tail. Current source has
not been certified by merely reading that historical approval.

Git history attributes the existing envelope/outcome helpers to
`4151a3ab4cf3859651507d2f575a49754deb8f61`, explicitly labeled an ephemeral
exact-byte proof snapshot, not reviewed/landed. Their presence is useful code
ownership, not evidence that the whole delivery path already uses them.

Primary sources consulted 2026-10-23 provide comparable failure semantics:

- [etcd Raft integration contract](https://github.com/etcd-io/raft/blob/main/doc.go)
  separates proposing from committed-entry application and explicitly permits
  reproposal after an uncertain timeout.
- [HashiCorp Raft Apply](https://github.com/hashicorp/raft/blob/main/docs/apply.md)
  completes the client future after FSM application, supporting the chosen
  application-completion cut rather than append acknowledgment.
- [RabbitMQ reliability](https://www.rabbitmq.com/docs/reliability) distinguishes
  transport delivery from application responsibility and requires duplicate-safe
  processing after lost confirmations.
- [Debezium recovery FAQ](https://debezium.io/documentation/faq/) explains replay
  from the last recorded source offset after crashes; duplicate delivery is
  compatible with retained debt and does not justify content-based discharge.

These are design inspiration, not imported authority or release proof.

## Dependency order and remaining gates

1. Finish and independently verify the current read-only observer. Its explicit
   content-only MG UNAVAILABLE remains correct while this interaction is absent.
2. Independently review this complete interaction and settle its exact timeout,
   lifecycle, subscriber applicability and queue composition before source.
3. One author implements the envelope, recipient completion and return/ACK gates
   as one interaction. A separate worker can prepare native witness fixtures
   against the reviewed seam; independent review and static/history investigation
   can run in parallel. Separate files do not justify two simultaneous authors
   changing this same interaction. Register and prove each integrated candidate.
4. Then compose cross-member original classification: retained recipient event
   must match the exact source native statement/outcome/obligation and declared
   cohort, not just sourceScope/content. Match all three native ranges without
   requiring commit==applied. Existing historical delivered flags alone do not
   prove a recipient occurrence. Missing or compacted recipient/source provenance
   stays UNAVAILABLE; contrary readable provenance stays CONTRARY. The observer
   never creates a missing receipt, rewinds delivered flags or replays SQL.
5. Preserve R2 replay/exclusion separation: native MG cache population can occur,
   but ordinary role publishers, transition resumers, retiring-source ACK sinks
   and rebalance acquisition must still consume their actual original-mode
   exclusions before/after scheduling. A correct CDC receipt does not authorize
   these effects. R1 protected ACTIVE/foundation/TRANSFERRED custody, exact
   shutdown, whole-cohort final revalidation and two-start public witness remain
   separate implementation/proof work.

No receipt, startup continuation, protected activation, durable transfer,
composed two-start acceptance, Quest closure, merge, certification or publication
is claimed by this proposed design.

## Proposed correction answering independent F1-F4, 2026-10-23

Status: **PROPOSED FOR INDEPENDENT DESIGN DELTA REVIEW**, not approval or
implementation. This append answers the independent MG review SHA256
`a9ec0ee41b4af3cd78bcc9d287251d20a1a1988623d456e6892d4a055c98dbaf`.
It supersedes the earlier deadline wording, optional shared/background durable
custody, unconditional addressed-local preference, and unchanged use of the weak
local-result validator. The original source census, identity/native cuts and
R1/R2 exclusions remain binding. No production/test file or lab job is part of
this correction.

### F1: bounded invocations, persistent source debt, separate clock domains

There is no existing lifetime expiry of a durable source occurrence. Neither
the source scan tail nor its retry delay creates one. `deliverObligation` in
`partition-cdc-obligation-delivery.js` will create **one response budget per
invocation**, before the first responsible subscriber's readiness/handler await.
The buffered/sliding paths use that same policy at `deliverCDCEventToSubscriber`
when there is no enclosing obligation invocation. They do not create a fresh
budget for each nested call or each subscriber in the same obligation attempt.

The configured invocation limit is the smaller of the existing
`messageGroup.deliveryTimeoutMs` and `transport.messageTimeoutMs` values, both
currently 5000ms by their configuration owners. Read them before asynchronous
MG selection; absence of a selected MG cannot postpone the budget's start.
An explicitly supplied live caller budget can only shorten this invocation.
The existing public startup/operation bound remains 30000ms where applicable;
it is not reset by CDC and is not a lifetime limit on committed source debt.
A later durable retry after that public caller has ended belongs to the source
delivery owner, not to a revived public request.

Use `control-plane/timeout-budget.js`'s `createTimeoutBudget`,
`createChildTimeoutBudget` and `getRemainingBudgetMs` for arithmetic, with the
creating owner's explicit `now` function. Do not use the query-options helper
which grants a minimum timeout after exhaustion. The source invocation uses
`delivery.owner.timeSource`; MG uses its existing service time source; topology
uses its injected `nowFn`. Timer set/clear uses the same owner that armed it.
An expiry is private to that clock domain, never an HLC or a wire timestamp.

| Boundary | Exact propagation and enforcement |
| --- | --- |
| Subscriber selection/readiness and beforePropagation | Receive the source invocation context; check its remaining time and current lane before and after each await. A spent budget cannot reach source MG submission. Selection uses the existing timeout/cancellation seam where available; otherwise retire the expired caller, retain the unresolved callback in the existing source flight, and gate its eventual continuation before any effect. |
| Same-process source MG/topology | Carry the parent's remaining-time/currentness operation, not its absolute number interpreted through another injected clock. Each child's local grant is `min(parent remaining, existing local limit)` and the parent remains a synchronous settlement/effect gate. |
| Topology batching, retry sleep, safe fallback | Consume the same invocation budget. This initial durable policy has no background or immediate batching residence (F2). Existing foreground attempt counts and backoff values remain maxima; do not start a delay/new send that cannot fit the remaining grant, and recheck after the delay. Non-durable batching behavior is unchanged. |
| Transport queue and target delivery | Pass `timeoutMs` equal to the current remaining grant and the existing cancellation signal to `transport.deliver`. The sender owns a deadline covering queue residence, connection wait and response, not only the response timer after dispatch. Recheck at actual queued dispatch and at fulfillment; the pending-response owner must not accept a late fulfillment merely because its timer callback was delayed. |
| Remote handler and further forwarding | Carry only a bounded **remaining duration** in transient request options. At receive, capture one new local child budget no larger than that duration and the receiver's existing local limit. Debit processing/backoff from that grant before any further hop; never send the original full duration again. Do not persist these options in the CDC event, event digest, native command or source ledger. |
| MG append plus applied-completion wait | The child grant is capped by the unchanged `computeCdcProposeTimeoutMs(attemptBudget)`. Append and afterCommit consume this one grant; append success does not start another full timer. ProposalQueue stores the exact waiter/lifetime; MG arms and checks the deadline. Both success and failure settlement recheck it synchronously. |
| Source result and ACK eligibility | The source checks its original invocation deadline, lane and subscriber set after the complete result arrives and immediately before ACK eligibility. A late valid receipt is evidence of a possible remote effect, not success for an expired source invocation. |

The sender always enforces its own expiry, including time on the wire. The
receiver cannot infer network transit duration or compare a foreign absolute
deadline without a clock-synchronization contract. The decreasing-duration
handoff therefore bounds a separate admitted remote invocation; it is **not** a
claim of synchronized distributed cancellation. An upstream timeout can leave
that remote invocation's effect unknown. Each owner forbids new submissions and
retries after **its own** grant expires; already admitted native work can still
commit. A late receiver cannot make the expired sender succeed, and a receiver
must not create an unbounded retry tail to compensate for the missing sender.
No new clock synchronization, cancellation journal or recovery protocol is
introduced to pretend otherwise.

On expiry, retire only this response waiter, cancel queued local delivery through
the existing signal contract, and retain admitted child-operation accounting
until those operations settle or the existing owner closes them. Do not mark
debt delivered, truncate native work or release a successor's waiter. The normal
source `scheduleDeliveryRetry`/provisional scan later creates a new bounded
invocation for the **same** source event. Its retry count/cadence, pending ACK
identity and persistence are unchanged; an expired invocation is never renewed.

Response expiry does not release unclosed callback custody. The existing source
single-flight drive remains occupied for unresolved selection/subscriber cleanup,
as F2's active wave remains occupied for unresolved target cleanup. Do not allow
retry timers to accumulate detached copies of an event or a growing list of
callers behind that stalled work. A replacement invocation starts only after
the prior locally owned work has settled or the responsible owner has actually
closed it. Attach terminal rejection handlers when acquiring that work, not
after racing its deadline. An unclosable dependency is explicit unresolved
custody, not permission to invent another dispatcher. This is distinct from an
already-dispatched remote request whose local transport response custody has
closed: its possible remote effect remains unknown, with no local callback or
resource left to justify an unbounded retention map.

Required paired proof adds different sender/topology/MG clock origins; time
spent in subscriber selection, queueing and backoff; exact-zero remaining time;
a fulfillment delivered after expiry with its timer callback deliberately held;
a late real native commit; and a later source-owned retry completing the same
debt. Include delayed wire receipt: it may have an unknown remote effect, but
cannot succeed for the expired sender. Show every old waiter remains settled
unknown and all armed timers clear on their creating clock.

### F2: admission/accounting before topology takes durable custody

Choose a deliberately bounded initial policy in the existing
`CDCGroupPropagationService`: **one active durable propagation wave per service,
one calling invocation, no duplicate caller sharing, and no durable background
retry custody**. A wave includes source MG work, target work, safe fallback and
remaining in-flight cleanup. Its active registry entry remains reachable until
all of those owned operations are settled; removing the immediate entry before
awaiting delivery is forbidden for durable work. Another caller, including an
exact duplicate, receives canonical BACKPRESSURE and the existing retry hint.
It is not attached to a resolver list, queued off to the side, or reported as
delivered. Source ledger ownership makes refusing this extra custody safe.

The admission cut is synchronous, before cloning the payload, before first await
and before proposing to the source MG. Capture/validate the complete vector and
target obligations there, including the union a permitted safe fallback can
require. The selected initial limits are:

- Pending durable waves: zero. Active durable waves: one. Attached source
  callers: one. Background durable events/timers: zero. A stopped or occupied
  service refuses admission without retaining the new caller/payload.
- Distinct events in the admitted vector: at most the existing resolved
  `immediateBatchMaxEvents` (default 64). This is now an admission bound for the
  durable vector, not a claim that the old 64-event flush threshold bounded its
  maps. Mixed/oversized input is refused as a whole; never silently split away
  an event and answer its original vector successful.
- Captured target descriptors/results: at most
  `TRANSPORT_DEFAULT.OUTBOUND_QUEUE_MAX_PENDING` (64). This reuses the existing
  pending delivery capacity as a conservative finite fanout admission policy;
  it does not grant transport queue space. Larger target populations receive
  a named retaining capacity refusal before any source proposal.
- Retained serialized event, routing and bounded failure/result payload charge:
  at most `PARTICIPANT_TRANSACTION_REPLAY_BOUND.MAX_BYTES` (1 MiB) for the wave.
  This explicitly adopts the existing replicated-operation payload allowance
  as a conservative transient-work ceiling, not as a claim that every CDC event
  was already limited to a participant session. Oversized input stays durable
  and gets a named payload-capacity refusal; no truncation, source mutation or
  success. Broader payload/fanout capability requires an explicit later owner
  decision; do not hide this finite initial limit behind indefinite progress
  claims. Prove the required original-seed payloads/targets fit it.
- Concurrent outbound target calls in that wave: at most the actual router's
  `outboundQueueMaxConcurrent` (default 32), subject to its existing per-target
  queue/pressure owner. Build each dispatch payload only when this window has
  a slot. Share one immutable event vector inside the topology owner; retain
  at most one bounded reply per captured target. Count duplicate encoded copies
  while a child transport call owns them. Thus payload residency attributable
  to the wave is bounded by `(1 + active dispatch slots) * 1 MiB`, plus bounded
  receipt/target metadata already charged to the wave, rather than an unbounded
  number of flushed waves each retaining the vector.

These are initial topology admission policy derived from existing finite
capacities, not changes to source event identity, producer admission, transport
priority reserves or timers. Put the derived policy in the topology constants
owner using imports from the named bound owners; do not scatter copied numbers.
The recipient's ProposalQueue capacity is an additional downstream bound, never
the justification for upstream residency. Its immutable vectors are bounded by
the same payload admission before enqueuing; its count remains the existing
ProposalQueue capacity, with no second persistent store.

Byte counting belongs with the envelope owner's immutable JSON capture. It
must stop at the allowance before allocating an unbounded serialized copy;
reject cyclic/accessor/non-data input through the existing canonical-data
contract. Count the full retained envelope and target/error data, not just row
data or event count. A scalar/counter reservation is taken before asynchronous
ownership, and construction exceptions release that exact reservation. A reply
that would exceed remaining diagnostic/receipt allowance becomes a bounded
typed unknown result; it cannot erase earlier target failures or mint success.

Traffic-deferred, duplicate, full, stopped and pre-admission expired calls return
retaining outcomes without adding durable entries to either topology retry map.
An admitted wave encountering pressure may use its unchanged bounded foreground
retries within F1; on exhaustion it returns the exact unresolved target set and
leaves eventual redelivery to the source. It never schedules durable work through
`scheduleDeferredDeliveryEvents` or `scheduleBackgroundRetry`. Non-durable
cache-only behavior remains with those existing methods.

Account release is exact: pending reservation on capture failure; caller slot
when its response settles; payload/dispatch charges only as the corresponding
owned work settles or is canceled/closed; wave registry slot last, after all
child finalizers. Caller expiry is not proof a pending transport/recipient
operation has stopped, so it cannot immediately free the slot for overlapping
waves. Shutdown closes admission synchronously, retires the caller unknown,
uses existing cancellation/close owners and retains failed cleanup custody.
No detached promise, timer or callback may retain an uncharged event. A newer
wave cannot be cleared by an old finalizer; cleanup checks exact entry identity.

Required pressure proof measures the counters and actual retained entries/
payloads through sustained same-row/distinct-occurrence arrivals, many exact
duplicate callers, an attempted second flush while the first target is slow,
traffic deferral, timeout and shutdown. Refused calls cause zero source-MG
proposals and zero background entries; source debt remains owed. Release the
first target, then retry the refused source occurrences through the ordinary
ledger path and obtain real committed receipts. Preserve each failed captured
target through safe fallback; a changed routing projection cannot empty that
obligation set.

### F3: provisional ingress can reach native commit while still a follower

The canonical predicate stays in `MessageGroupForwardingOwner`'s
`resolveCdcIngressDecision`/`shouldUseCanonicalLocalIngressForStrictCDC`
interaction. Its order for durable events changes: actual current local Raft
leader admission first; a fresh owned native leader/peer route second;
provisional addressed/convergence hydration only if neither can admit native
delivery. Addressed/relayed flags alone cannot outrank an available native route.
`localIngress` remains a projection-only disposition, never an enduring event
mark or a reason for processed-event dedup to skip a subsequent native proposal.

Read the current operation port's group observation, including resolved
`leaderId`, peer identity/address, configuration/runtime generation, incarnation,
participation and refusal state (`raft-rs-status-observation.js`). Bind it to
the captured target group and this live service/port. Adapt the existing
`resolveLiveLeaderForwardTarget`/`resolveLivePeerAddressFromConsensus` owner to
consume that observation coherently; the mutable `service.leaderId` or a cache
row alone is not a stronger native-route fact. Cache/hints may help resolve an
address under their existing rules but never override a conflicting live
leader/peer binding or the original-mode participation gate.

When the addressed replica is still a healthy follower, forward the complete
event vector to that owned leader under the existing forward route and F1/F2
bounds. This is a **terminal native-commit request** for the captured group,
named in the forwarding owner's request context, not a new event identity or
native command kind. The recipient either is the admitted current leader and
uses normal proposal/afterCommit, or answers typed retaining unavailability.
It must not restart cache-based target selection or forward that terminal
request back to the follower. No extra hop allowance is created:
`CDC_FORWARD_MAX_RELAY_DEPTH` remains 2 and every send increments the existing
depth. An already exhausted relay stays provisional/unknown until the source's
next bounded invocation starts its ordinary route again; it does not reset the
depth inside the old request.

Recheck port lifetime/participation and native target binding immediately before
dispatch/proposal. Leadership changing after that cut yields the existing
retryable native/routing refusal, not a receipt and not a relay loop. Any next
attempt uses fresh owned observation within the remaining original invocation
grant and unchanged retry policy. A response's alternative leader hint is only
a hint. Wrong-group or stale competing cache leaders cannot make this terminal
route succeed. Grouped-to-safe fallback may choose another eligible address
for the same required group; it cannot exchange the group or forget its debt.

The observable release is newly usable native leader/peer/participation evidence
on a later `resolveCdcIngressDecision`, while the addressed replica still reports
FOLLOWER. Existing leader/peer changes update that observation; existing
provisional source scan completion and `scheduleDeliveryRetry` supply the wake.
No new polling loop, traffic-trigger requirement or indefinite local-ingress
cache is introduced. Target suppression and topology repair retain their current
cadences and reevaluate the fresh binding when the existing suppression expires.

The decisive witness first requires real provisional metadata hydration to
advance formation, then exposes a healthy owned leader route without electing
the addressed replica. Through the same shared subscriber and actual router,
the next owned source retry must produce an exact recipient native occurrence,
afterCommit receipt and committed source ACK. Retain stale competing cache
targets, safe fanout and a pressure episode in this witness. With the old
always-local addressed predicate, the required native occurrence/ACK must remain
absent despite those same healthy native facts. R2 publication/exclusion sinks
remain closed as applicable; hydration/receipt does not grant activation.

### F4: one canonical local semantic contract, composed with transport

Tighten `cdc-delivery-outcome.js:isCommittedCdcOutcome` itself. Its required core
remains `success === true` and one exact committed receipt for each distinct
expected durable binding, with expected group and valid native position. A local
call needs no transport ACK field. A receipt-bearing answer is nevertheless
invalid if it also asserts failure, provisional ingress, deferral or an
unresolved target. The same owner defines and validates these optional fields:

- `error`, `errorCode`, `reasonCode`: absent or null only on committed success;
  reject nonempty errors even when `status` is not `completed`. Unexpected
  malformed/empty-string error variants are not silently normalized to success.
- `deferRetry`, `noHandler`: absent or boolean false only. `retryAfterMs`: absent
  or null only; no retry hint accompanies final committed success.
- `cdcProvisional`: absent. `deliveryFailures`: absent or an empty array.
  `deliveryState`: absent or the transport owner's DELIVERED state. A supplied
  `acknowledged` may only be true, but its absence remains valid locally.
- Descriptive metadata allowed by the existing wrappers is named and typed in
  this owner: `messageId`, `correlationId`, `requestId`, `operationId`, `causeId`;
  sourceGroupId/groupId, tableName/operation/eventCount;
  strategy/mode/targetGroupCount/fallbackReason/fallbackStrategy/timestamp;
  responseType; and `status` from the existing successful transport/MG/topology
  status values (`completed`, `delivered`, LATENCY_CDC_PROPAGATED and
  LATENCY_CDC_BATCH_PROPAGATED). These fields cannot override the required
  semantic core. Unknown semantic/status claims are invalid, not diagnostics.
  Adding another metadata field requires updating this single owner and its
  round-trip witness, not dropping fields at one wrapper to make it pass.

`isCommittedCdcDelivery` continues to compose this exact local predicate with
`classifyTransportDeliveryOutcome`/`isDeliveredTransportDeliveryOutcome`.
Transport consumers still require processing acknowledgment and no transport
failure. Do not require local callers to counterfeit an ACK, and do not make a
second local gate by invoking the transport predicate with fabricated fields.
Provisional validation must likewise reject a mixed committed/provisional answer;
it is not a fallback which launders an invalid committed claim into acceptance.

`completeCdcPropagation` must validate the original source answer and captured
target failures before constructing output. It may not erase `error`/defer/
noHandler fields and reuse the stripped receipts. The MG result builder, shared
subscriber, source wrapper, sliding handshake and obligation driver all preserve
the outcome through the canonical owner, including contradictory evidence on
failure. A zero-target wave still asks this same source predicate. Completion-
only hooks and all source-delivery tracking remain behind it.

Proof adds a canonical local committed positive with no transport fields, then
one variant per conflicting field and a wrong-type variant. Run those through
the actual local source result, zero-target composition, shared subscriber,
sliding handshake and obligation driver; all conflicts retain the exact debt and
submit no ACK. Repeat through the real router so transport metadata round trips
without weakening the local gate. Include valid remote committed delivery,
provisional, ordinary success, ACK-only and wrong-group controls.

### Delta implementation order and unchanged acceptance boundary

Review F1-F4 as one interaction before production edits. Implement envelope and
canonical outcome corrections first, then source invocation/return plumbing,
accounted topology admission, terminal native forwarding and exact afterCommit
waiter settlement together. Independent witness preparation and source review
can run in parallel; they do not authorize independent competing writers of
these same boundaries. Update the actual impact contract/coupled witnesses and
run exact-candidate locked lab proof after source approval.

None of the new time/capacity/routing policy is opening authority or a second
eventual-delivery owner. Cross-member original classification still needs exact
source statement/outcome/obligation/recipient-native correspondence over all
retained ranges, final cohort revalidation and honest unavailable historical
provenance. Protected activation, R1 durable ACTIVE/TRANSFERRED custody, R2
callback/sink fencing, two-start public acceptance and the remaining release/
publication gates remain separate and unsatisfied.

## Residual F2 correction: bound concurrent custody, preserve the accepted domain

Status: **PROPOSED FOR INDEPENDENT F2 DELTA REVIEW**. This append answers the
review at SHA256
`76f9e6b1a79af7a8f0727b8b183fcc7c55a21d8f15a73110b24d73fd4af6069e`.
Its source observations were rechecked at
`68633168ef17759fec954e6ef66b4ccb0d671bc7`. It supersedes F2's proposed 1 MiB
wave/recipient ceiling, 64-event input ceiling, 64-total-target ceiling and
fixed-byte memory claim. F1's response deadlines and cleanup, F3's native
forwarding transition, F4's canonical result rule and all original identity/
native cuts remain in force. No code, runtime result or approval is supplied.

### Applicable source domain and the separate transport limit

There is no established ordinary-SQL admission bound corresponding to those
three borrowed capacities:

- `partition-cdc-obligation.js:123-135` serializes the actual ordinary statement
  event; `partition-cdc-obligation-constants.js:88-103` stores it in an unrestricted
  `event_json TEXT` column. Neither applies the participant session's 1 MiB
  operation-replay bound. The proposal codec at
  `raft/raft-rs-proposal-codec.js:34-50` likewise supplies no such payload cap.
- `topology/cdc-group-propagation-routing.js:96-139,165-235` constructs targets
  from the applicable topology population, without a total-64 limit. Router
  pending capacity bounds queued calls, not the required target population.
- The immediate 64-event setting is a batching trigger, not proof that an
  already accepted durable vector can be rejected at delivery. This correction
  adds no event-count cap and never drops or splits off a vector member and
  then reports the original vector complete.

The existing source and wire domains are themselves not proven equal. Ordinary
router server/dial paths omit `maxPayload`
(`transport/message-router-server-lifecycle.js:104-110`,
`transport/message-router-connection-lifecycle-methods.js:314`), while the
installed `ws` implementation defaults to 104857600 received bytes per complete
message (`node_modules/ws/lib/websocket-server.js:74` and
`node_modules/ws/lib/websocket.js:675`). Ordinary sends serialize a complete
SERVICE_MESSAGE (`transport/message-router-delivery-behaviors.js:689`). That is
a bound on the full encoded wire message, not a 100 MiB row-data allowance:
envelopes and the native peer representation also occupy bytes; the native
binding base64-encodes entry data (`vendor/raft-rs-wasm/src/lib.rs:1179-1184`).
The separate bulk-transfer channel does not carry ordinary CDC requests.

Record this as the distinct **accepted-source / wire-domain owner finding** for
the partition admission and transport owners. No source-bound end-to-end payload
domain has been established merely by SQLite's compiled maximum, V8's maximum
string size, or a successful source commit. This package must retain an event
whose actual transport/native path cannot carry it and report the actual
unavailable/unknown outcome; it cannot call immutable oversize temporary queue
pressure, grant success, truncate it or change its identity. Universal delivery
of every SQLite-sized accepted row is explicitly unproved. Resolving that
pre-existing mismatch requires its own owner decision and proof; this correction
does not change transport limits, producer admission, timers or wire protocols.

### Corrected concurrent-custody policy

Keep one active durable topology wave, one attached caller, zero pending waves,
zero shared callers, and zero durable immediate/background retry entries per
topology service. Reserve that slot synchronously before copying an input,
capturing targets, awaiting selection or proposing to the source MG. Refuse a
second caller as temporary BACKPRESSURE without retaining it. Its release
condition is the first wave's actual local cleanup, not a change to immutable
payload bytes or deletion of required targets.

An admitted wave borrows one owner-captured immutable event/vector; each target
envelope references that same local value. It captures the complete required
target set, including the existing safe-fallback obligations, once for that
operation. Neither the vector size nor total target count is compared against
1 MiB or 64. A malformed vector remains invalid as a whole under the envelope
owner's existing data/identity contract. There is no smaller original-only
delivery domain selected by `sourceScope` or by a seed fixture fitting a cap.

Dispatch targets through a finite window no larger than the actual router's
`outboundQueueMaxConcurrent` (default 32), subject to its existing per-node
admission. Create each encoded request only after a window slot is available;
never pre-encode one payload for every target. Preserve each required group ID
while resolving a current address. A safe route may repair an address; it cannot
erase an unresolved captured group. No target is marked complete by being
outside the current dispatch window. F1 still bounds each admitted invocation
and all foreground retry/backoff within it.

The correct memory statement is parameterized by accepted work: one captured
input and its representation costs, at most the dispatch-window count of active
encoded request/reply working sets, and metadata for the actual captured target
population. It is **not a uniform fixed-byte bound independent of input size or
fanout**. Account the source string, decoded immutable value, canonical digest
working set, native codec copy and transport-owned copies where their actual
owners retain them. Reuse the immutable capture and semantic binding within a
wave instead of serializing it for every comparison. Receipt/diagnostic state
stores validated bindings and finite typed failure information, not arbitrary
reply payloads or repeated event bodies. Actual target/identity string lengths
remain part of the charge, not an assumed fixed-size metadata unit.

The recipient's existing ProposalQueue bounds the number of admitted waiters;
the previously proposed 1 MiB recipient input ceiling is withdrawn. Queue
reservation precedes immutable capture. Each admitted waiter's actual vector/
codec working set remains charged until its real finalizers close it. No new
uniform recipient-memory claim follows from a count-only queue. Allocation or
encoding failure is retaining failure, never a successful partial vector.
Source/native accepted work and native history are not freed by retiring the
response waiter.

The source lane must also stop preloading up to 256 complete `event_json` values
across delivery awaits. `readOwedCdcObligations` currently uses `.all` with that
page size (`partition-cdc-obligation-ledger.js:124-139`). Reuse its positional
read with one payload at a time, releasing the SQLite read before awaiting a
subscriber. Keep the existing 256-row scheduling quantum, finite captured tail,
log/ordinal cursor, provisional scan and retry cadence. A drive can visit that
many rows without retaining that many payloads simultaneously. Do not keep a
SQLite iterator/transaction open across network waits or create a new source
payload cache. A lost local response can reread the unchanged durable event.

All F1/F2 cleanup rules still apply: an expired caller does not free retained
raw-send callbacks, queued closures or native waiters. The topology slot is
released only after its locally owned children settle or close; exact entry
identity fences old finalizers. There is no background topology redrive after
release and no detached payload tail whose custody is unaccounted.

### Large fanout progresses across bounded source invocations

Windowing alone is insufficient if every 5s attempt starts again at target one.
The source owner therefore retains **one current-obligation progress cell in
its existing tenure-bound lane**, not a topology retry map or a durable receipt
store. This is a proposed addition to `createCdcObligationLane`, whose current
single-flight and tenure reset are at
`partition-cdc-obligation-delivery.js:83-107,119-155,590-613`. The sole persistent
authority remains `_cdc_obligations` and the existing committed CDC_DELIVERED.

The cell holds the existing exact event/vector binding, source lane tenure,
responsible subscriber identities, selected source group, captured required
groups, validated native receipts and a fair cursor over unfinished work. It
does not hold event JSON, caller resolvers, promises, an independent timer or a
new wire identity. Its count is at most one per existing live source lane;
metadata size follows that obligation's actual subscriber/target population.
Completed subscriber answers may be retained under the same exact binding, so
the shared response budget does not force a retry to repeat a completed earlier
subscriber before reaching later ones. A changed responsible subscriber set or
ended tenure invalidates that transient progress and replays from the ledger.

Carry private progress operations alongside the F1 invocation context through
the actual subscriber factory and seed/join bridges. They are local operations
owned by the source lane; they are not fields in an event, digest, native command
or remote request. All production durable-ledger paths in the original census
must carry them. An external caller cannot create ACK eligibility by supplying
an event property or claiming an original source scope. Direct MG calls still
return their complete canonical vector outcome and own no source ACK.

The transition is exact:

1. A fresh source invocation verifies the current owed row and binding, obtains
   its unchanged F1 budget, and acquires the topology wave. Capture the source
   group/required target identities before the first native effect. On resume,
   reuse that captured obligation set; a new routing projection cannot shrink
   it. Actual topology membership changes remain with their existing owner.
2. Dispatch unfinished targets fairly within the window and remaining budget.
   A failed/provisional target does not monopolize the first slot of every
   attempt while later required targets remain unvisited. Address changes keep
   the group binding. Each delivered target result is validated in full by F4
   before extracting its exact native receipt into the source-owned cell.
3. Record progress only while that invocation's original deadline, source
   tenure, subscriber and operation identity are current. Late valid receipts
   remain unknown for the expired attempt and do not update the cell. Partial
   committed receipts observed while it was live may survive its later expiry;
   they are actual historical native facts, not an extension of its caller.
   Unknown, merely acknowledged and provisional results never complete a target.
4. At budget exhaustion, settle that caller unknown, cancel/close locally owned
   work, then release the topology wave. Retain only the cell's binding/receipt/
   scheduling metadata. The existing source retry timer later starts a **new**
   invocation for the same debt. It rereads the full event once and resumes
   unfinished work. Neither the old deadline nor a remote grant is renewed.
5. A live invocation may return canonical committed success only after its
   selected source MG, every captured required target and every responsible
   subscriber have exact validated committed evidence. It rechecks lane,
   subscriber set and deadline before ACK eligibility. A partial window never
   answers full-vector success. Only then does the event enter the unchanged
   pending ACK batch; the progress cell can be released because that existing
   owner now holds its ACK custody. Only actual CDC_DELIVERED apply changes the
   ledger's delivered flag.

F1 remains a bound on each response/dispatch invocation, not on the persistent
debt's total delivery lifetime. For a stable finite target set whose individual
complete deliveries fit a live invocation after temporary pressure ends,
validated progress prevents repeated prefixes from permanently consuming every
budget. This conditional progress claim is source-bound; it does not assume
that an arbitrarily large single native/transport operation completes in 5s.
Continuous topology churn, unavailable recipients, or the wire-domain mismatch
above do not satisfy its premise and are not reported delivered.

The cell consumes **no topology capacity between invocations**. It must not
prevent the existing canonical provisional outcome from advancing the scan to
later formation metadata. On such an outcome discard the current cell's
optimization and preserve the existing provisional rescan; its debt stays owed.
Unvisited/unknown targets cannot be reclassified provisional to make that scan
advance. Provisional hydration and the later native route remain F3's distinct
steps. The actual original-seed witness must show that later required metadata
still reaches those steps while this progress mechanism is enabled.

On shutdown, replacement or tenure loss, drop the transient progress only after
fencing its private callbacks; keep any unclosed active child custody with its
existing owner. A new tenure/restart reconstructs owed work from the source
ledger, recaptures the existing topology/subscriber obligations and may produce
duplicate actual recipient native occurrences. This supplies no historical
target-membership ledger and no proof about target requirements across a lost
tenure; those remain the original contract's explicit exclusions. An old cell
cannot clear a successor's wave or turn a new binding into completion.

### Finite proof additions and dependency order

The independent implementation/native witnesses must add the following paired
cases to the existing F1/F3/F4 and identity tests:

- Commit ordinary SQL that produces actual owed CDC payloads below and above
  the withdrawn 1 MiB limit, both within the exercised real wire/native domain.
  Deliver the unchanged events through the actual source/subscriber/router/MG
  owners and prove source ACK apply. Restoring the rejected hard-cap predicate
  must strand the larger positive and fail the same acceptance assertion.
- Capture more than 64 actual required target identities and more than one
  dispatch window. Hold temporary pressure, then release it without altering
  the event or deleting targets. Measure active copies/dispatches and complete
  every required target. Include a finite fanout deliberately taking multiple
  source invocation budgets, so starting every retry from the first target fails
  while the source-owned progress reaches the final ACK.
- Expire a partially completed wave with timer callbacks delayed. Only receipts
  observed before actual expiry may survive; late native effects remain unknown.
  Verify no caller/payload/transport closure is retained in the between-attempt
  cell and no topology background entries/timers are created.
- Preserve a failed target across safe fallback and a route projection that
  omits it. Exercise responsible-subscriber change, tenure change, restart and
  service replacement; drop transient progress and replay exact ledger debt.
  Whole-vector receipt validation and source ACK must remain mandatory.
- Keep the addressed follower provisional witness engaged while later formation
  metadata is owed. Verify provisional scan/retry remains reachable, then obtain
  actual native receipts after F3's owned leader observation changes. A progress
  cell holding topology capacity between attempts is a negative control.
- Bound source hydration to one full event at a time while the drive visits its
  unchanged finite page, and account real codec/transport copies while slow
  sends are owned. Exercise an over-64 valid input vector at the canonical MG
  boundary; no member may disappear under the old flush threshold.

Review this F2 correction with the accepted F1/F3/F4 wording before production
edits. Implement source context/progress and one-at-a-time hydration together
with topology window/copy accounting, then compose the already required native
completion and strict result gates. Independent witness construction and source
review can proceed in parallel under distinct file ownership. Exact-candidate
locked-lab proof follows source approval; no proof here resolves the distinct
wire-domain finding, historical cross-member classification, R1/R2 activation/
transfer exclusions, composed two-start acceptance, Quest closure or release.

## F2-P correction: aggregate provisional coverage solely to release the scan

Status: **PROPOSED FOR INDEPENDENT F2-P DELTA REVIEW**. This append answers the
complete residual finding at review SHA256
`dc4d7ce541fd479e37430969ed5cec2129f5f88eb133b99f369e5093ecd31061`.
It supplements the source-owned progress cell above; the previous 931 lines,
SHA256 `8da8cd11afe98640e422dca314cb7d204088dbae488222fd2557db446f73426f`,
are preserved. The accepted hard-cap withdrawal, representation accounting,
dispatch windows, F1/F3/F4 and native/ACK cuts remain binding. This is a proposed
design correction, with no production/test edit or runtime proof.

### One cell, two different predicates

The existing source lane's one current-obligation cell also retains **typed
provisional coverage**. This is evidence that the exact recipient/subscriber
accepted provisional ingress during a live invocation; it is not a native
receipt, a claim that a remote cache is still populated, or delivery completion.
It exists only to decide whether the existing scan may move past this still-owed
event and deliver the later metadata that native completion needs.

For each responsible subscriber, the cell tracks its actual object/callback and
wrapper lifetime, not just its textual subscriber ID. The topology subscriber's
branch contains its selected source-MG group and the complete captured required
target-group set. An unvisited subscriber, an unselected source service or an
uncaptured target set is explicitly uncovered; absence of a branch is not an
empty successful population. Its obligations are the source-MG result and each
captured target result for the **entire exact event vector**. Another subscriber
is covered only by its own canonical full-vector outcome, never by a different
subscriber's group result or by the fact that it was called.

Each such leaf has exactly one of these states in the same source-owned cell:

| State | Evidence required | May authorize source ACK? |
| --- | --- | --- |
| UNCOVERED | No accepted evidence; includes unvisited, unknown, timeout, mismatch, generic success, noHandler and ACK-only. | No. |
| PROVISIONAL_COVERAGE | The existing canonical provisional validator accepted the complete exact vector and intended recipient/subscriber binding while that invocation was live. | No. |
| NATIVE_COMMITTED | The existing canonical committed validator accepted the complete exact vector and actual native group/index/term receipts while that invocation was live. | Only as part of complete native coverage of every obligation. |

This replaces no native predicate. The previous statement that provisional
results never complete a target means **never complete it for native delivery
or ACK**. They now cover it for the weaker, separate scan-release predicate.
A native observation may replace a provisional tag only after actual native
afterCommit evidence passes the full existing validator. No cursor position,
elapsed time, complete provisional set or later cache contents promotes a tag.

Store a tag and its binding to the cell's existing vector/obligation identity,
plus the already specified native receipts where present. Do not store raw
responses, event bodies, repeated binding arrays for every attempt, timestamps
as authority, callers, promises or a history of observations. There is at most
one current tag per captured leaf and one derived state per responsible
subscriber, in the same one-obligation cell. Its metadata cost follows the
actual captured subscriber/target population already accounted in F2. There is
no second map of owed events, independent timer, expiry lease or durable store.

### Validation, currentness and invalidation

Use `cdc/cdc-delivery-outcome.js` as the sole semantic validation/composition
owner. A local provisional call uses its local predicate and needs no fabricated
transport ACK. A remote provisional observation also passes the existing
transport-aware provisional predicate. F4's rejection of contradictory
committed/provisional/error claims applies before extracting the tag. A partial,
extra, duplicate, wrong-event or wrong-digest vector supplies no coverage.

Bind each target observation to the exact outstanding dispatch and captured
group, not to whichever array slot happens to be visited. Preserve the actual
recipient's existing `groupId` result metadata from the MG owner and validate it
against that expected group in the existing provisional semantic owner; never
fill it with the caller's expected value after receipt. The local source result
is bound to its actual selected service/group. This requires preserving and
checking existing group metadata through the same MG result builder and relay
paths as native outcomes. It adds no source identity field or new response
protocol. A wrong or missing group binding is uncovered, even if its event
binding otherwise matches. For non-topology subscribers, the exact invoking
subscriber/lifetime supplies the responsible-consumer binding; it cannot claim
another subscriber's coverage.

The cell and every private update operation are bound to the exact source
delivery owner and lane tenure, event/vector binding, responsible subscriber
objects/lifetimes, topology owner, selected source-MG service/group and captured
required group set. Before accepting an observation, check that context and
the **creating invocation's** F1 remaining-time/currentness operation. Check it
again before consuming a complete coverage set. Timer callback delay does not
extend this condition. An answer observed after actual expiry supplies no tag,
cannot update a successor's cell and cannot revise its expired caller's UNKNOWN.

A provisional observation accepted while its invocation was live may remain in
the cell after that caller expires, just as a pre-expiry native receipt may.
This preserves a historical ingress observation for a later bounded invocation;
it does not renew the caller or assert a continuing remote cache lease. There
is no attempt-duration TTL on accumulated coverage that would force an
arbitrarily large finite set to fit one response budget after all.

Source tenure loss, shutdown or replacement; replacement of the responsible
subscriber/wrapper, local topology owner or selected source-MG owner; changed
event binding; or an authoritative change of the captured obligation set
invalidates reuse of its provisional coverage. Same-text IDs are insufficient.
Fence old private operations synchronously. A route projection omitting a
required group neither authorizes a smaller set nor covers that group. Address
repair preserves its obligation identity; an observed target service/route
lifetime replacement invalidates that leaf's weak coverage and requires a new
valid observation from the newly selected route. It does not erase the group.

Remote replacement not exposed by the existing owners cannot be inferred from
a timestamp or a foreign clock. Accordingly, complete weak coverage asserts
only that the required provisional ingress observations occurred in this
source-owned operation, not that every remote incarnation remains alive at the
scan-release instant. Observed replacement is invalidated as above; unobserved
remote loss cannot become ACK authority because weak coverage is never a native
receipt and is discarded at scan release. Normal owed-debt replay must obtain
new actual native results. No extra remote lease, polling or recovery protocol
is introduced to claim a stronger property.

Invalidating the cell does **not** release child custody. F1's actual cleanup
guard belongs to the existing delivery owner and spans lane resets: a new
tenure cannot hydrate a replacement event or start an overlapping owned callback
while the old local send/selection/subscriber work is still unclosed. The old
operation is fenced and charged until its responsible owner settles/closes it;
only then may a new lane acquire the next invocation. Discarded optimization
state is never mistaken for cancellation of a native or remote effect.

### Exact aggregation and source-scan transition

Private source context carries the cell's observation/update operations through
the actual subscriber and seed/join bridges. The semantic owner creates and
composes validated coverage; the source lane alone stores it. These are local
operations, not caller-supplied `cdcProvisional` event properties or a new wire
continuation token. The existing `completeCdcPropagation` and source subscriber
composition must consume this exact source-owned coverage instead of demanding
that every required provisional answer arrive in one invocation.

1. Each fresh invocation rereads the unchanged owed event and checks the cell's
   current context. Fair scheduling prioritizes **uncovered** leaves and
   responsible subscribers across attempts. Already validated weak coverage
   need not be re-obtained before an unvisited branch can run. In particular,
   the source must not restart every attempt at a partially covered first
   subscriber while later subscribers remain unvisited. All dispatch remains
   under the existing one-wave/window/F1 response and cleanup bounds.
2. Incomplete coverage remains UNKNOWN, including a partial set consisting
   entirely of valid provisional answers. Before its expiry, record each exact
   validated leaf; after expiry, retire that caller UNKNOWN, close its local
   children and release topology capacity. Only metadata remains for the
   existing source retry. Never infer that undispatched groups are provisional.
3. For a topology subscriber, every source/target leaf must be either
   PROVISIONAL_COVERAGE or NATIVE_COMMITTED before the subscriber is covered.
   If all are native, its ordinary committed result remains available; if any
   are provisional, it is covered **only provisionally**. Aggregate the actual
   responsible subscriber set by the same rule. An uncovered subscriber makes
   the whole source event UNKNOWN, regardless of other subscribers' results.
4. A **live** invocation with complete coverage and at least one provisional
   obligation may construct the existing canonical provisional result for the
   complete event/vector via `buildProvisionalCdcOutcome`. Recheck deadline,
   current cell, subscriber set and bindings immediately before returning it.
   Use the existing source retry policy/hint; old remote hints are not new
   deadlines. If the previous caller expired after collecting the last valid
   observation but before this transition, only a new live invocation may
   perform it. The expired caller stays UNKNOWN. No new network await or full
   recipient re-poll is required merely to compose already validated coverage.
5. That canonical provisional result enters the existing `DRIVE.PROVISIONAL`
   path: set the scan's provisional flag, advance its log/ordinal cursor and
   permit later owed metadata in the unchanged finite scan to run. Count this
   as a visited row under the existing 256-row work quantum, not as a delivered
   row. Do not increment native-delivered tracking, run completion-only hooks,
   enqueue a source ACK, or change `delivered` in SQLite.
6. At that scan-release transition, fence the cell's remaining operations and
   discard **all** of that event's optimization state, including weak tags and
   any native receipts accumulated alongside them. Actual local child cleanup
   must finish before the next event hydrates; no topology slot is held between
   completed invocations. The original event remains owed. At the captured
   tail, the existing provisional retry/rescan starts from the durable ledger
   with a fresh cell; it does not resume old weak coverage.
7. After later metadata makes F3's owned native route usable, this fresh redrive
   must obtain actual source and target native receipts. Only complete native
   coverage of every responsible subscriber can enter the existing pending ACK
   owner, and only committed CDC_DELIVERED apply marks the source row delivered.
   A provisional scan pass never manufactures a receipt or changes this cut.

This supplies a finite release for the review's stable finite provisional
population: if each uncovered branch can return its canonical provisional
observation in a live invocation, bounded fair attempts eventually cover the
whole captured set without requiring it to fit one budget. The source can then
reach later metadata while keeping the first occurrence owed. This is a scan
progress claim under those stated conditions, not a new durable-delivery owner
or a promise of native completion while a recipient remains unavailable.

### One composite paired witness

The required witness is a single source-owned operation sequence, through the
real source ledger, subscriber factory, topology, forwarding, canonical outcome
and native application owners:

1. Commit first owed occurrence A and later required formation metadata B in
   the same source scan. Use more captured targets than one dispatch window
   and enough controlled, individually live provisional deliveries to require
   more than one unchanged source invocation budget. Include several actual
   responsible subscribers so the last one cannot be reached by repeatedly
   restarting the first. Keep an addressed recipient FOLLOWER whose native
   route is not yet usable and which needs provisional hydration before B.
2. Across multiple attempts, obtain real canonical provisional coverage for
   every required source/target/subscriber binding. Assert each expired caller
   remains UNKNOWN, active waves/copies obey their bounds, topology has no
   background entries, and A remains owed with zero source ACK proposals.
   Then observe a new live invocation produce the canonical aggregate
   PROVISIONAL result, release the source cursor and discard the entire cell.
3. Observe B delivered through that released source scan. Expose F3's actual
   owned native leader/peer route while the addressed recipient remains
   FOLLOWER; keep stale cache hints and the pressure/safe-fallback controls
   engaged. Redrive A from its unchanged ledger identity with fresh progress,
   obtain complete actual native afterCommit receipts, and only then observe
   the source CDC_DELIVERED command apply and set A delivered.
4. In the same composed setup, remove only the weak-coverage accumulation/
   aggregation transition. Every bounded partial attempt must stay UNKNOWN,
   B must remain unreachable behind A, and the final native/source-ACK
   acceptance assertion must fail. Small provisional and separate large native
   positives do not substitute for this negative.

Paired boundary negatives additionally withhold one required target or final
subscriber, return the right event from a wrong group, change a vector member,
and deliver a valid provisional answer after actual expiry while its timer
callback is delayed. None may fill the missing leaf, release the scan or ACK.
Restore each exact live binding and obtain scan release without changing A or
removing a target. Replace a subscriber with the same textual ID, replace the
selected source/topology service, and change tenure while cleanup is held:
coverage must invalidate, old callbacks must not mutate a new cell, and no new
hydration may overlap the retained old local work. Include a valid local
provisional answer with no transport ACK and its real-router counterpart.

Independent review remains the next gate. The source changes and composite
native witnesses above are unimplemented and unexecuted here. All accepted
F1/F3/F4 provisions, the distinct wire-domain finding, cross-member historical
classification, R1/R2 exclusions and remaining startup/release gates stay
separate; this append grants none of their approvals.
