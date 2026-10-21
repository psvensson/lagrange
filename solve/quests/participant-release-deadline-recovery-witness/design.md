# Participant release deadline and recovery witness

Status: independently approved witness scope; no implementation or runtime verdict.

Candidate: `be93c7e5d9a76a39e76a530c93715521b2281356`; its production source
matches `be25caa5f0c3612feec662d4feaa9ba28f8f34df`.
The original-entry measurement is retained under
`solve/quests/seed-control-authority-first-divergence/evidence/measurement-2026-10-20.md`.
It demonstrated a dependent ENABLE refused before dispatch after the shared
deadline, following successful control release. It did not demonstrate
automatic recovery for an absent origin.

## Scope and existing sealed obligations

The passive diagnostic seal cannot admit scheduling or loss injection.
`participant-release-held-recovery-continuation` covers an existing origin and
canonical host-held status, not no-origin fresh seed. The original seed budget,
applied-position, once-per-cohort and current-control proof seals remain intact.
This child owns native boundary witnesses and their discriminating controls.
It does not authorize production repair or replace original full startup proof.

The fixture extraction has one writer, this lane. Root consumes the mechanical
patch and then owns new provenance tests in the original protocol test file.
This lane's behavioral tests live in
`test/partition/participant-release-deadline-recovery.test.js`.

## Consumed surfaces

| Surface | Current source and use |
| --- | --- |
| Real protocol fixture | `test/partition/participant-release-protocol.test.js:171-258` constructs actual PartitionService, native SQLite, ReplicaHandler and registered release route; transport hop only is in process. Extract once without weakening existing assertions/order/cleanup. |
| Clock and request budget | `src/time/time-source.js:98-185` existing VirtualTimeSource; `src/node/participant-release-client.js:36-49,107-121` calculates remaining budget and refuses before deliver. Inject only the handler clock through its existing constructor option. |
| Initial authority | `src/node/participant-release-authorization-owner.js:26-64` issues exact handler/partition/build-bound capabilities; `src/node/replica-handler-participant-cutover.js:260-270` refuses absent origin without one. |
| Actual release order | `src/node/replica-handler-participant-cutover.js:151-180,269-350` proves control, pauses, inspects, enables, observes applied position, obtains the final census and current control proof, then resumes. |
| Durable commit | `src/partition/partition-participant-transaction-request.js:690-726` submits origin; `src/partition/partition-participant-transaction-apply.js:554-579` applies it; `src/raft/raft-rs-application-transaction-owner.js:61-98` couples application and applied progress transaction, with proposer completion after commit. |
| Existing recovery continuation | `src/node/replica-handler-release-recovery.js:190-240` requires current leader, existing origin and measured build; a failed entered cutover schedules RECOVERY_RETRY_MS. Absent origin returns OPERATOR_REQUIRED without automatic release. |
| Actual restart wakes | `src/node/replica-handler-membership-relay.js:45-117` registry set/replacement and service CONSENSUS_OBSERVED produce wakes, not permission. Recovery subscribes at `src/node/replica-handler-release-recovery.js:244-254`. |
| Exact final admission | `src/partition/partition-participant-transaction-pause.js` owns admission generation, current service/handler/registry checks and OPEN; tests consume its exported read-only admission view. |
| Retained recreation | Existing protocol test `:261-284` recreates the same SQLite path with `durableRecordBootstrap()` and the original factory, then follows real registry/election recovery. |

## Complete operations

| Trigger | Current facts | Permitted effect and commit | Loss/restart | Remaining obligation |
| --- | --- | --- | --- | --- |
| Explicit authorized release; dependent PAUSE settles at original deadline | Real current control leader/origin, measured build, current dependent generation and complete one-member cohort | Control origin may already commit; dependent ENABLE must not be delivered after deadline | No dependent origin exists. Expiry does not erase control origin or create a dependent origin | Dependent remains closed. The release/authorization owners require a legitimate new authorized request |
| Retry without an origin or authorization | Current dependent is still paused; no durable origin and no capability | OPERATOR_REQUIRED; no ENABLE, no origin, no OPEN | Registry/consensus wake cannot become fresh-storage authority | Explicit operator or fresh-storage owner supplies legitimate authority |
| New operator request | Actual authorization owner issues exact current partition/build/handler capability | Existing full cutover commits dependent origin and opens only after full current proof | Subsequent retry preserves origin identity | Existing release owner alone opens admission |
| Real ENABLE commits but its response is lost; intact dependent restart while control is unavailable | Same durable dependent origin, new service generation, actual current leader; no current control proof | Recovery refuses CURRENT_CONTROL_OWNER and retains the existing retry | Registry wakes survive dropped actual dependent consensus notifications; no explicit dependent release after refusal | Native/store owners retain files; release recovery owes reconsideration and final resume owns OPEN |
| Control is recreated from its same durable file and becomes current leader | Current control and dependent facts are re-read; old origin alone grants nothing | Existing retry runs the same cutover, preserving exact origin and opening only current registered service | No manufactured dependent event, Raft polling or second algorithm | All tracked services and queued work settle through fixture cleanup; cleanup failure retains directory |

## Witnesses and typed failure edges

1. At the original dependent PAUSE transport reply, the wrapper calls original
   delivery once, waits for its genuine OBSERVED answer, then advances the
   existing injected handler clock to that request's unchanged deadline.
   The caller must receive `UNAVAILABLE / RELEASE_DEADLINE / ENABLE`, with no
   delivered dependent ENABLE, no dependent origin and CLOSED admission.
   The genuine earlier control origin remains unchanged.
2. A new unprivileged RELEASE on that dependent uses a live request budget and
   must produce `OPERATOR_REQUIRED / FRESH_STORAGE_OR_OPERATOR_AUTHORITY`;
   it does not reuse the expired deadline and fail too early. The expired
   request itself is not renewed. A separate authorized operator request must
   then succeed through the actual release owner, retaining the control origin.
3. Independently, drop exactly one genuine dependent ENABLE answer after its
   real route completes and the durable origin is present. The injected
   transport error passes through the original canonical delivery classifier;
   the test never fabricates a release answer. The client must return
   `UNAVAILABLE / REPLICA_RELEASE_REPLY`, with the origin intact and
   admission still closed. Recreate the dependent from that file while the
   control service is shut down. Suppress only its actual consensus
   notification emissions during initialization/campaign and require a positive
   dropped-event count. Run the already scheduled registry wake. Require the
   actual recovery report `UNAVAILABLE / CURRENT_CONTROL_OWNER` before restoring
   control, and require CLOSED admission throughout that refusal.
4. Recreate control from its existing file and real native election. Advance
   only the handler's ordinary retry clock; do not directly release the
   dependent, call its Raft status or manufacture its event. After advancing
   the scheduled due timer, a bounded native admission/progress assertion must
   prove the existing retry reopens the exact replacement, retaining its origin
   and permitting a normal SQL write once; an unresolved wait cannot hang.

Setup failure is unresolved, not an expected safety refusal. An absent actual
PAUSE, absent committed ENABLE, zero suppressed notifications, wrong recipient,
missing recovery report or leaked operation makes the witness red. Timer
advancement is a deterministic schedule control, not a physical latency result.
The original 3000ms seed budget is used for the deadline case; other requests
consume existing BOUND.DRAIN_DEADLINE_MS without changing production constants.

## Targeted semantic negatives

Root runs isolated source mutations with identical approved witness bytes.
Candidate negatives are removal of the client pre-dispatch deadline guard,
removal of the no-origin authorization gate, and removal of the existing
post-refusal recovery enqueue. Each must fail its named behavioral assertion
after owner engagement. A missing symbol, setup failure or generic timeout is
not a useful negative. All mutation source is excluded from composition.

## Cached-view and identity audit

No runtime cache or authority is added. The fixture's empty system cache is the
same existing protocol boundary fixture; it is not evidence of remote routing
or current global topology. Local real leaders supply the selected routes.
Captured request/answer/event counts and logs only assert engagement, never
grant release. The time source controls scheduling and deadlines, not facts.

Origins are read from the existing SQLite owner and compared structurally
before/after. Retained recreation pins node, partition, replica and file path.
Current build comes from runtimeBuildProvenance. Membership, term, lifecycle
incarnation, admission generation and release identity come from the real
owners; no test synthesizes or edits them. A stale original service cannot
serve as the recovery success: assert exact new registry object and origin,
then the real SQL entry. No production source modification is proposed.

## Review and validation

Review all applicable categories: admission gating, recovery/replay, retries,
transport delivery, timers, concurrency, formation circularity, harness
fidelity and the registered runtime/application owner interaction.
Attack each consumed surface, typed failure edge, cached view and identity
anchor. Enumerate every finding with a source/test evidence path.

Before native measurement, independently review exact harness bytes, including
single original delivery, finite one-shot faults, Promise/error custody,
clock/deadline domains, notification engagement and cleanup. Root owns
exact-commit locked-lab execution and same-host semantic controls. Existing
protocol and recovery suites remain regression controls. New JavaScript must
pass strict cyclomatic/cognitive checks; no baseline changes.

Independent design review: `subagent:/root/control_source_review` approved all
nine declared categories for witness-only sealing and implementation. Concrete
test bytes still require review before measurement. Cleanup must retain both
old and replacement service custody, and observer/restoration errors must be
aggregated with any primary assertion or native cleanup failure.

Safety, recovery progress and resource/performance verdicts are separate.
Single-member same-process native persistence proves neither multi-member
quorum nor cross-host crash behavior, fresh-seed producer authorization,
uninstrumented startup timing, physical storage loss or complete cutover.
