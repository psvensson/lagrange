---
audience: agent
documentClass: planning
status: proposed
---

# Admission and participant-release lifetime proposal

Prepared 20 November 2026 under [operation integrity](../operation-integrity-and-reliable-formation.md)
for programme item 03, with the completed-growth authority finding assigned to
item 04. Inspected source is `candidate/reconciliation-20261119` at
`6c0bdff11f24e32459178e9d2c0d9f563e7cd790`, rule-set revision 5. This is a
source investigation and successor proposal, not a sealed implementation unit,
runtime reproduction, execution receipt or formation acceptance. No test or lab
run was launched for this note. Existing receipts and historical seals remain
unchanged.

For current execution, the integration summary records the composed RELEASE
budget, the managed CREATE replacement tests and the physical missing replies.
CREATE and RELEASE have managed caller-lifetime evidence on later sources.
The remaining recovery work includes proving that temporary loss of operation
or target visibility preserves the correct incarnation and that cleanup of an
earlier callback cannot clear its successor. The integration owner records the
originals, the failed controls and the current test selection in the
[core integration handoff](../operation-integrity-and-reliable-formation.md#core-integration-handoff-21-november-2026).
The census below describes the planning commit.

Loaded instructions were AGENTS, rules, router, Quest workflow, authority and
recovery, and investigation/navigation skills. Source navigation used direct
reads and Git inspection; no successful Serena invocation is claimed. The
integration owner coordinates the changing interaction and independent review.

## Decision, authority and boundaries

The decision is how an admission/release caller exhausts its original budget
while interruptible work is stopped, possibly committed effects retain their
existing recovery owner, and late continuations cannot act on a replacement
service or attempt. `ReplicaHandler`, the partition admission owner, participant
cutover and participant-release recovery retain their distinct authorities.
The transport owns delivery resources; committed operation and membership
owners remain the authority for admission. A timed-out caller is not evidence
that a proposal did not commit.

Proposed scope is the following finite CREATE/admission/release interaction,
its real construction and affected witnesses. It does not close the remaining
item 03 census of operation lanes, merge workers, bulk transport or public
query/transaction adapters. Those remain with their existing owners. Item 02's
[strict outcome proposal](strict-operation-outcomes.md) supplies the validated
terminal/progress contract before dependent release of operation obligations.
No alternate admission algorithm, compatibility result, retry scheduler or
second recovery ledger is proposed.

## Credit and recurrence history

The candidate already checks learner-admission expiry before drive and after
await, bounds each waiter-side drive, cleans its race timer and handles late
rejection. Its boundary witnesses deserve credit. The completed-growth census
also supplies durable evidence while service-role publication lags. Neither
repair establishes the wider lifetime or authority scope by itself.

| Existing record | Contract to preserve and original evidence ceiling |
| --- | --- |
| [participant-release-completion-owner](../../quests/participant-release-completion-owner/quest.json), sealed at `92ae06ef40df6610cb2163edd7d6476cd65bb3ef` | One canonical completion loop for fresh seed/CREATE retains trigger, authorization, caller clock and original deadline. Nested control/operator requests remain single attempt plus permitted redirect. No budget renewal or timeout increase. Consume its recorded fresh-CREATE authorization supersession; a new design must explicitly reconcile any changed contract rather than silently overriding the seal. |
| [participant-release-deadline-recovery-witness](../../quests/participant-release-deadline-recovery-witness/quest.json), terminal solved 26 October | Real PartitionService/native SQLite shows pre-ENABLE expiry preserving origin and closed admission, absent-origin refusal, and lost ENABLE/restart recovery through the existing retry when control authority returns. This is a single-process owner witness, not cross-host latency, full seed, TX1 or formation proof. |
| [participant-release-held-recovery-continuation](../../quests/participant-release-held-recovery-continuation/quest.json), terminal solved 26 October | Typed host-held status retains one existing recovery continuation; a fresh actual leader observation is still required. Replacement/shutdown cannot reopen stale admission. Preserve the existing retry/healthy bounds and event-driven ordinary follower behavior. |
| [replica-admission-from-committed-operation](../../quests/replica-admission-from-committed-operation/quest.json), terminal solved 3 November | Admission comes from the answering leader's committed operation and current native membership authority. A cached projection, notification or successful delivery is not a substitute. |
| [replica-create-timeout-replay-custody](../../quests/replica-create-timeout-replay-custody/quest.json), sealed at `340e34e484c04bb2badacfc97b5aa34aedf5c74a` | Preserve the narrow same-operation replay/attempt-rotation seam after materialized PENDING timeout. Terminal completion, cleanup, CLOSED admission, changed incarnation and wrong identity cannot resurrect. Original component construction includes a native factory double. Later logs record a focused native lab run, while the receipt remains failed and broad composition was red; this note grants no new acceptance. |

These records establish a recurring boundary family: response waiting, effect
authority and retained recovery are different lifetimes. They do not establish
that the new source findings reproduce the same physical failure. Before calling
a regression, compare the discriminating witness on the current and relevant
predecessor content under the same managed substrate, preserving the first red.

## Ownership and budget census at the planning commit

Paths are relative to `src/`; line numbers refer to the inspected candidate.

| Boundary and actual path | Budget/identity | Effect, retained owner, wake and cleanup |
| --- | --- | --- |
| First CREATE admission: `node/replica-handler-create-methods.js:494–515` -> `partitionService.requestReplicaAdmission` | First delivery is awaited before CREATE computes `createStartedAt + syncTimeoutMs` and enters the new waiter. Operation, partition and replica identity travel to admission. | A durable SYNCING fact already exists. The first request is not bounded by the new waiter; retain existing CREATE replay custody when effect authority is uncertain. |
| Admission resource owner: `partition/partition-replica-admission.js:592–667`, `requestReplicaAdmission`, `driveReplicaAdmission`, delivery | Stores a PENDING request; delivery uses promotion-proof timeout, without the caller's CREATE budget/signal. Shutdown is checked before await. | The drive mutates its captured request after awaits without rechecking current request/service identity at that point. Leader admission validates committed operation at `:374–407`; membership/leadership redrive is at `:416–430`. Learner promotion cadence (`partition-service-learner-promotion-methods.js:405–430`) owns a further retry path. Enumerate concurrent initial/waiter/cadence drives before changing cancellation. |
| Bounded admission waiter: `node/replica-handler-voter-readiness-methods.js:76–95,439–512` | Original absolute deadline, entry and post-drive expiry checks, current-service check. | Bounds caller waiting and cleans timer; the underlying drive can continue. Late rejection handling prevents an unhandled rejection but does not cancel transport, settle a durable effect or fence resource-owner mutation. |
| Release client: `node/participant-release-client.js:38–52,111–183` | Each action, including outer RELEASE, uses `min(5000ms, deadline-now)`. Completion retains the same request/deadline and existing retry cadence; routing permits one leader redirect. | Delivery timeout yields unavailable/unknown answer, not evidence of no cutover effect. The completion owner interprets attempts; nested control remains a single request under its existing contract. |
| Release orchestrator: `node/replica-handler-participant-cutover.js:213–239,321–465` | Sequential control-owner and cohort steps share request authority/deadline. `RUNS` coalesces by handler, partition and target build. | Concurrent same-build requests join the same run; they do not each start a fresh pause. `joinParticipantCutover` awaits that run without a joiner's own deadline. The run map clears in `finally` only when the underlying run settles. A hung owner await can retain the slot. |
| Recipient RESUME: `node/replica-handler-participant-release.js:374–392` -> `partition/partition-participant-transaction-pause.js:254–282` | Route checks deadline before awaits; OPEN checks current handler/service/lifecycle/membership after reading facts. | Current identity fencing deserves credit. There is no post-facts deadline check before OPEN in this path; holding facts across expiry is the discriminating schedule. OPEN emits the existing `WRITE_PATH_RELEASED` event. |
| Existing-origin recovery: `node/replica-handler-release-recovery.js:199–234,261–317` | Current hosted service, leader, durable origin and build required. A recovery attempt uses its own existing 30000ms drain budget; retry is 1000ms. | Existing pending/running maps, registry/consensus events and retry own continuation. A caller expiry cannot erase committed origin. Shutdown removes subscriptions/timer, clears pending and awaits running promises; a never-settling run can strand shutdown. Prove bounded teardown without transferring effect authority to a new loop. |

`TimeSource.now()` uses `Date.now()` (`time/time-source.js:40–41`); these
deadline calculations are epoch milliseconds, not process-local monotonic
timestamps. The release request carries the absolute deadline to other hosts.
Diagnostic clock validation detects some invalid observations; it does not prove
a cross-host clock conversion or skew allowance. Any change must explicitly
retain or replace the existing wire-clock contract through its owner. Never
compare a local monotonic instant directly with a persisted/network epoch value.

The outer 5000ms timeout and multiple sequential steps are a source-visible
budget mismatch candidate. Increasing the timeout alone does not repair first
admission ownership, joiner bounds, late mutation or retained recovery. The
completion seal prohibits an unexplained increase; first establish the owner
contract, clock treatment and discriminating trace.

## Public query and local MessageGroup grant

The transport owner declares one caller budget in
[runtime contracts](../../../architecture/runtime-contracts.md#timeout-and-invariant-rules).
At integration `8a3e8ff32`, `QueryExecutor` calculates the remaining execution
budget for the next candidate. `MessageRouter.deliver` creates that attempt's
local lifetime. `buildQueryTransportSendOptions` forwards its original
duration to the local MessageGroup, which calls the same router again with a
new wire ID and starts another full duration. By then the outer deadline has
already been running. Expiry of the outer caller can precede actual retirement
of the inner ACK waiter.

This narrow item 03 successor carries the exact router-owned lifetime and its
abort signal through local options, from `buildQueryTransportSendOptions`
through `resolveTransportDeliveryOptions` into the existing `deliver` call.
The router validates the lifetime belongs to itself. The MessageGroup still
owns its envelope identity and one direct-only attempt. The router still
owns the exact inner waiter, the local handler boundary, and the remote
write callback and outbound slot. Expiry prohibits further submission and
retires pending waits. Already submitted bytes retain callback custody and
an uncertain write retains its existing operation identity. The existing
wire envelope and its receiver retain their existing clock and delivery
contracts. A separate incoming request or application forwarder has its own
invocation and does not receive this process-local lifetime as payload.

The witness-only pin `43f3f5865dec91c184d658cfc78f8f9ed9ea0624` retains the
old production path. It exercises real routers, a MessageGroup and a TCP
WebSocket, with virtual time controlling dispatch before and after the caller
deadline. It observes the same wire ID at the target and in the caller's ACK
map, and holds the raw write callback across expiry. This source finding
does not explain the seconds-long late receipt in the retained physical run:
the three q12 outer and wire retirements were within two milliseconds of
one another. Managed baseline, repair and independent review are pending.

## Recovered originals and remaining physical attribution

The integration owner recovered task-3804 and task-3823 originals and verified
their retained archive; see the [custody review](adoption-review-20261120.md#original-evidence-custody)
and the evidence-and-candidate-binding Quest log. Task-3823's report records
`control_snapshot_read_failed` in its final first-unmet predicate and confirms
cleanup of all three trial containers. This is a failed physical formation run, not
accepted formation. Task-3804's original output confirms 18 passing files and
1,428 assertions, but lacks the executed source/runtime/host binding needed for
current applicability.

Read-only attribution on 20 November inspected the top-level task-3823 playback
members, excluding the archived `.previous-*` runs. The report and playback
archive hashes were rechecked against the retained manifest:
`48d8f5dbffbbe02768b6bbf427c31793c70d5450fe91023e566ec2d7d99f4538`
and `48104b8d8dd00f9488c5542c99a4172946940dcbfee5a6e445d5e16d860a84ac`,
respectively. This analysis changes no original output or acceptance result.
The following timestamps are UTC on 20 November; node abbreviations identify
the three full IDs in the original report.

| Retained observation | Supported inference and limit |
| --- | --- |
| The three node logs contain 71 distinct `wait_bound_spent` message IDs with `deliverySource: message:participant_release`, each `repeats:0`: seed `eed1d027` emits 21, `08f85935` emits 19, `71a63fa6` emits 31. Their timestamps span 17:19:50.604 to 17:27:53.870. | The timeout-record count is confirmed. Only 38 target the seed, 30 target `08f85935`, and three target `71a63fa6`. Records omit action, partition, operation and cutover-run identity; `responseContext` is null. They do not prove 71 outer ACTION.RELEASE retries to the leader. |
| No run-start/join/pause-generation events were identified in those node logs; `joinedAttempt` is absent. | The retained observations cannot count fresh cutovers versus joined requests or reconstruct a control-partition pause interval. Absence of a marker does not prove absence of the action. |
| `snapshots.ndjson:95` first records REMOVE `pl-call_activation_leases-p1-389-0`, created 17:20:47.376. Nearby snapshot 17:20:47.828 shows its ACTIVE learner on `08f85935`, whose node remains ACTIVE/ready but has lease expiry 17:20:32.068. A later snapshot renews the lease. | Removal and an expired lease observation coincide. The operation's dispatch history records `planning_snapshot_refresh_pending`, not the exact placement decision input. |
| `snapshots.ndjson:100` first records REMOVE `pl-code-p1-458-0`, created 17:21:22.924. Snapshot 17:21:25.314 shows its ACTIVE learner on the same node and lease expiry 17:21:22.190; the next sample renews the lease. | This supports investigating the same eligibility boundary; the creation timestamp differs from the handover's 17:21:35. Sampling does not establish the exact authority read used to admit REMOVE. |
| `08f85935-540e-45cd-b1af-06af4a0e5d3f.log:1793–1795` records a rejected `nodes-p1` UPDATE with `partition_write_cutover_paused` and `committed:false` at 17:19:39.751–756. Membership-publication reconcile reads later time out at 17:20:23.384, 28.373, 33.386, 38.374 and 17:21:08.434, 13.456, 18.453, 23.444. | A real cutover pause rejected a node-row write; later read/reconcile failures overlap the lease/removal periods. These are not correlated heartbeat-write lifecycle and `sql_transactions-p1` pause records, so the proposed causal chain remains unproved. |
| The formation report records four seed snapshot-lane timeouts of 15000ms, at formation offsets 365985, 382243, 399494 and 428483ms. Earlier polls already fail spread and operation-quiet predicates. | `firstUnmet` is the final ordered predicate, not the earliest chronological failure. Preserve all failed predicates; the 33/36 narrative cannot replace them. The 420000ms acceptance bound remains unchanged. |
| The report verdict is `BLOCK_EVIDENCE_INCOMPLETE`, reason `log_window_coverage_incomplete`; its coverage summary reports 6271023 withheld bytes and all three nodes incomplete. Its separate capture-completeness records are true. | Capture completion and admitted failure-window coverage are different claims. This note does not reconstruct or override that coverage verdict from the playback files. |

The handover's 33/36 partition count, repeated control-pause attribution and
causal durations have not been independently established by this bounded
analysis. Remaining work is causal attribution and full execution admission,
not recovery of the originals. Custody verification alone does not establish
the causal explanation or qualify source/runtime applicability. Item 03 needs
action/run/join/pause identity, item 04 needs each removal's authoritative
eligibility input, and item 09 retains snapshot-query and evidence-coverage
diagnosis. No quantified time-saving estimate follows from these observations.

In particular, an outer timeout followed by a retry cannot alone demonstrate a
new pause: `RUNS` joins an active same-build attempt. Attribute each pause to a
newly started run, a nested control cutover or another actual caller, with phase,
operation, partition, build and attempt identity. The source does classify an
ACTIVE learner excluded from eligible hosts as DEAD_LEARNER
(`replica-placement-owner-deficits.js:190–192,397–414`); it does not prove that
control pauses caused the reported heartbeat delay or quantify its cost.

## Item 04: completed-growth evidence scope

`rebalancer/replica-placement-owner.js:227–238` collects promoted replica IDs
from completed ACTIVE GROWTH_PROMOTE rows into a global set, consumed by partition
classification at `:550–574` and `:738–742`.
`replica-placement-owner-deficits.js:141–150` treats a matching learner as a
follower. `partition/partition-placement-admission-decision.js:54–79` projects
the promotion IDs without generation identity.

This compensates for delayed role publication, but the inspected set does not
bind the evidence to the current partition/generation or retire it after later
membership removal/projection catch-up. Historical completion must not become
permanent membership authority. ReplicaPlacementOwner and the committed
membership/repository owners must determine the identity/retirement contract
under item 04; this note does not select a speculative cache expiration rule.
Consume item 02's validated durable terminal meaning before treating a row as
settled evidence.

## Related-system lessons and limits

The official [gRPC deadline guide](https://grpc.io/docs/guides/deadlines/)
separates the client's wait bound from stopping server-spawned activity. Its
propagation model deducts elapsed time from a timeout to avoid relying on aligned
host clocks. That is a useful design comparison, not evidence that Lagrange's
absolute-deadline wire contract already has that property.

The [gRPC cancellation guide](https://grpc.io/docs/guides/cancellation/)
requires application handlers to cooperate in stopping work; cancellation is
not general interruption of application code. Lagrange uses its own transport,
native membership and durable operation owners. A signal or Promise race here
cannot retract a committed admission or origin; interruptible delivery cleanup
and retained-effect recovery need separate proofs.

The [gRPC status contract](https://grpc.io/docs/guides/status-codes/)
explicitly permits a deadline error even when a state-changing operation
succeeded. The analogous Lagrange question is answered by its committed operation,
membership and origin records, not by transport status. These primary sources
support the distinctions; they do not certify a Lagrange implementation or
authorize adopting a new framework.

The November 20 formation failure shows why sharing an in-flight read and
retaining a successful answer have different lifetimes. The target froze
the rejection of an authoritative startup read. A single target refusal then
reached thirteen separate placement operations. Go's singleflight API
shares the outcome of one concurrent call among its waiters. Lagrange also
requires the first successful pre-admission token snapshot to stay frozen
for the handler's lifetime. A failed read leaves that obligation with the
existing CREATE recovery owner. [Go singleflight contract](https://pkg.go.dev/golang.org/x/sync/singleflight)

A READY lease can lapse while a node is still processing other work.
CockroachDB's documented rebalancing design distinguishes temporary
unavailability from the evidence it uses to retire a replica. Lagrange's
placement witness in `replica-placement-owner-core.test.js` explicitly
requires DEAD_LEARNER removal for an expired lease. The placement owner
must reconcile that contract with the observed transient expiry before
changing retirement policy. The November 20 startup refusal has direct
operation-bound evidence. Its connection to the earlier lease dips remains
unproved. [CockroachDB repair design](https://www.cockroachlabs.com/blog/automated-rebalance-and-repair/)

## Witnesses proposed at the planning baseline

The November 20 proposal identified these cases for the existing Quest
route, using native constructors, repository SQL and the managed lab.
Substitute delivery timing, clock and failure boundaries; do not replace the
authority being proved. The existing release witness and CREATE replay fixtures
are starting points, with their construction ceilings retained explicitly.

| Proposed discriminating witness | Positive behavior and known-bad control |
| --- | --- |
| Hold the first CREATE admission delivery, then let the caller budget expire | Caller settles under the original budget; retained operation remains recoverable. Release the old delivery after replacement and prove no mutation/effect on the new incarnation. Bypassing the first-delivery budget or removing its post-await fence must fail. |
| Join one active release with a shorter-budget caller | One cutover continues under its actual owner while that caller stops waiting on time. Prove no extra pause/ENABLE and no origin deletion when the joiner leaves. Removing coalescing or ignoring the joiner's budget must fail separately. |
| Hold RESUME facts across expiry and change service/attempt identity | No late OPEN under expired or replaced authority; a later currently authorized recovery can progress through the same owner. Removing each deadline/identity fence must fail its engaged schedule. |
| Lose ENABLE reply, reconstruct owners, and hold a required control clearing event | Durable origin survives; dependent admission cannot progress before the event, then progresses through existing recovery when it clears. Include never-settling delivery, shutdown and bounded timer/listener/run-slot occupancy. Preserve the prior native deadline/recovery controls. |
| Reconstruct placement from real completed-growth SQL with delayed/reordered projection | No duplicate promotion during legitimate lag, and later removal, wrong partition or replacement generation exposes the genuine deficit. The unscoped historical ID set must fail the relevant negative without weakening ordinary growth progress. |

Collect original request/run IDs, observer, exact source/tree, runtime/native
artifacts, topology, phase outputs and resource observations in the existing
Quest/evidence owner. No run is submitted by this note. Independent tests may run
in parallel only through managed resource/thermal placement and independent
scopes; one author owns the coupled admission/release contract and shared tests.
Do not reset runner concurrency, fabricate a successful receipt or retry away the
first failure. Complete task-3823 causal attribution and execution applicability
from the recovered originals in parallel with this preparation.

Stop the bounded implementation only after these applicable owner paths and
negative/reconstruction witnesses pass independent review and affected gates.
This note itself stops at the source census and proposal. Item 09 still owns
three consecutive physical formation successes on tv-dator, adam-laptop and
adams-gamla within the original 420-second predicate, plus its separate drain,
smoke and composed service obligations. No component result closes those gates.
