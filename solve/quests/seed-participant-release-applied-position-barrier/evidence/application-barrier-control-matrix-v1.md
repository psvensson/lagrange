# Applied-position barrier control matrix V1

Status: read-only verification design. No source, test, fixture, Quest, metadata,
or lab input was changed or run.

## Binding and allocation

- Inspected HEAD:
  `77e091f64fb711fbc5ca40a7915ae85f01a5cf4e`; production is the reviewed
  `ffe35e77d51cbd4ba35fb30518de1307eaaa2eec` source.
- The matrix is bound to
  `solve/quests/seed-participant-release-applied-position-barrier/design.md`,
  the accepted owner review
  `evidence/owner-boundary-design-review-v1.md`, and RPC-lifetime addendum
  `evidence/owner-boundary-design-rpc-lifetime-v1.md`.
- The separately approved native same-promise witness plan V2 owns the real
  three-voter MessageRouter gate, actual N/N/K durable positions, actual
  ENABLE origin, same release promise, and post-release replicated write. This
  matrix does not create another topology, carrier classifier, handler-registry
  gate, durable reader, or release lifecycle fixture. F11 remains the primitive
  step-only application proof
  (`test/raft/raft-rs-backend/multi-replica-runtime-prerequisites.test.js:139-195`).
- Narrow controls should use the existing registered route and controllable
  `PartitionService` owner in
  `test/partition/participant-release-protocol.test.js:104-236`, the actual
  handler/service lifecycle owner in
  `test/node/replica-handler-release-recovery.test.js:123-176`, and the
  existing controllable port subscription/event seam
  (`test/test-helpers/controllable-consensus-port.js:159-164,234-259,277-280`).
  If the committed-membership await gate is needed in both files, extract the
  existing implementation at
  `test/node/replica-handler-release-recovery.test.js:132-143` once into
  `test/partition/partition-release-fixture.js`; do not copy it.

## Minimal matrix

| Control | Existing proof and its limit | Smallest additional case/assertions |
| --- | --- | --- |
| Overall deadline versus observation/RPC deadline | Client timeout is currently computed at `src/node/participant-release-client.js:21-45`; already-spent overall requests return `UNAVAILABLE/release_deadline` at `:35-38`. The cutover and recipient independently retain the overall fence at `src/node/replica-handler-participant-cutover.js:203-207` and `src/node/replica-handler-participant-release.js:82-87`. There is no focused test of the new carried observation deadline or the RPC-only outcome. | Add one table-driven registered-route case to `participant-release-protocol.test.js` using its existing in-process transport and `VirtualTimeSource`: (a) a 30s overall deadline yields the existing 5s delivery timeout and the same absolute `observationDeadlineAtMs`; expiry at that boundary returns `UNAVAILABLE/replica_release_reply/message_timeout`, leaves admission closed, removes the subscription/timer/record, and permits a fresh later observation; (b) an overall deadline shorter than 5s carries that exact earlier deadline and expires as `UNAVAILABLE/release_deadline`; (c) an already-expired overall deadline performs zero delivery. Assert the original request deadline/identity fields are unchanged in every answer. |
| Queue delay consumes the RPC window | The RPC addendum requires the sender and receiver to use the existing client-budget operation and forbids a fresh receiver window. No current test measures arrival delay. | In the same client case, wrap the existing transport delivery once, capture its original arguments, advance the shared virtual clock before invoking the exact saved delivery, and then delegate unchanged. Assert the delivered timeout and carried absolute deadline came from the sender's one clock sample, the receiver has only the remainder, and expiry occurs at the carried boundary rather than arrival plus 5s. This wrapper delays only dispatch; it does not answer, classify, or inspect release facts. |
| Matching duplicate joins and cannot renew | Existing cutover RUNS coverage proves same-build callers share one whole attempt and a mixed build cannot join (`participant-release-protocol.test.js:398-473`). It does not cover the subordinate per-replica observation record. | Add a registered `OBSERVE_APPLIED_POSITION` case in the same file. Hold the canonical facts read at the existing committed-membership await. Send two identical requests and prove one facts read, one listener, one timer, one stored settlement, and identical typed answers. Send the second request after part of the original budget has elapsed and prove both expire at the starter's exact boundary. A conflicting origin/attempt/generation request must settle typed without replacing, shortening, or renewing the starter. After starter cleanup, a fresh request must engage a new facts read. Do not assert only JavaScript promise identity through router wrappers; assert the owned effects and exact deadline. |
| Wake arriving during asynchronous facts read is retained | `readParticipantReleaseFacts` awaits build and committed membership before its status/application observation (`src/partition/partition-participant-release-facts.js:85-114`). Existing shutdown tests gate that same await, but no existing test proves subscribe-before-read plus a dirty wake. | Reuse the single extracted committed-membership gate with a controllable recipient. Begin the observation below its canonical watermark, wait for the first facts read to enter the gate, publish exactly one `RAFT_EVENT.APPLIED_PROGRESS` through the existing port event seam while the read is in flight, advance the port's canonical current applied observation, and release the gate. Require exactly one retained refresh after the first read, success only from that reread, and zero listeners/timers afterward. Add the paired publish-before-first-read case: because subscription precedes read, either the first current read observes completion or the retained wake causes one refresh; it must never wait to deadline. Do not invoke the observer callback directly or add a second status/facts loop. |
| Handler shutdown entry and cancellation | Existing actual-handler tests prove shutdown begun during an awaited final RESUME facts read cannot reopen admission (`replica-handler-release-recovery.test.js:215-254`). Current handler cleanup sets `shuttingDown` before awaiting recovery/tasks (`src/node/replica-runtime-cleanup-custody.js:82-100`). Neither proves the new observation map is synchronously cancelled before those awaits. | Extend the existing `withActualHandler` suite, not a new lifecycle fixture. Hold an active observation in committed-membership facts, begin actual `handler.shutdown()`, and require its route result to settle `STALE`, admission to remain CLOSED, and its listener/timer/record to be gone **before** releasing the held facts continuation. Then release the gate only for complete teardown. This proves cancellation breaks the shutdown/task wait cycle rather than merely noticing shutdown after the await. |
| Service shutdown entry wake | Existing actual-service case sets `isShutdown` during awaited RESUME facts, but releases facts before awaiting the refusal (`replica-handler-release-recovery.test.js:256-286`). The current end-only SHUTDOWN event is emitted after asynchronous cleanup (`src/partition/partition-service-lifecycle-methods.js:159-170,215-219`). | Beside that case, hold observation facts, call actual `leader.shutdown()`, and require the new `SHUTDOWN_STARTED` edge to settle the observation `STALE` and detach it while the facts gate is still held. Assert the event is observed only after `isShutdown === true` and `shutdownSettlement` exists. Release the gate and await shutdown in independent cleanup. This is an ordering assertion on the real owner, not a fabricated shutdown flag. |
| Generation, term, configuration, and replacement change | Final RESUME already checks the current generation/status immediately before OPEN (`partition-participant-transaction-pause.js:69-104`). Existing recovery tests cover service replacement during awaited facts (`replica-handler-release-recovery.test.js:668-706`) and mixed target build is refused (`participant-release-protocol.test.js:294-300`). No case binds the new observation's post-await validation. | Use one table-driven recipient test with the same facts gate. After registration, mutate one existing controllable owner fact per subcase: term; runtime/lifecycle generation; configuration/membership generation. Emit only the corresponding existing owner wake where one exists, release facts, and require typed `STALE`, CLOSED admission, and resource cleanup. Add one actual `replaceLocalReplicaService` subcase by extending the existing replacement test; the old observation cannot consume the successor's wake or delete a successor record. A changed build stays the existing `BUILD_MISMATCH`, not STALE. |
| Older origin and unrelated accepted work | The full classifier treats applied position as only one field: accepted work must be empty and applied/commit/last equal (`partition-participant-release-facts.js:46-65`), and query state precedes origin in `partition-participant-release-contract.js:115-137`. The current registered real-drain test already has a previously released durable origin plus one actual pending SQL proposal and proves `DRAIN_PENDING`, the exact canonical work tuple, one shared attempt, and later healing (`participant-release-protocol.test.js:354-493`). The native same-promise witness separately owns real follower N/N/K publication lag. | Do not build another native topology. Strengthen the existing real-drain test with two assertions: the stored durable origin remains the earlier origin throughout the pending proposal, and the refusal's canonical work still names that unrelated proposal while admission remains CLOSED. In the new observation-recipient table, show that reaching an older valid origin watermark returns only OBSERVED facts even when a later canonical work position exists; then exercise the existing full release route and require its canonical final/earlier work check to return `DRAIN_PENDING`. If the controllable fixture cannot express distinct applied/commit/last without fabricating a non-owner state, leave this last combination to the native same-promise witness plus the existing real-drain test rather than adding a fake index setter. |
| Final current-control-owner refusal | Current protocol tests prove missing control fact refuses before origin and a remotely routed current fact succeeds (`participant-release-protocol.test.js:276-292`). The production owner deliberately runs the same control check again after final census and before RESUME (`replica-handler-participant-cutover.js:298-304`); that second check is not engaged by existing tests. | Extend the existing protocol fixture's real control service. Hold the new observation action after ENABLE, retire the actual control service/handler through its lifecycle while the dependent stays paused, then complete the observation. The same cutover attempt must return `UNAVAILABLE/current_control_owner_fact` from the final check, carry the dependent release identity, propose no second origin, and never RESUME. A paired unchanged-control case remains CUT_OVER. Do not inject a control answer or wrap `releaseControlOwnerFirst`. |
| Final query proof/refusal | Legacy/held query refusal is covered before ENABLE by `participant-release-protocol.test.js:327-352`; proof construction/term binding and settlement refusal are covered by `test/query/transaction-release-settlement.test.js:61-114`. Production rebuilds the proof from the fresh final local census at `replica-handler-participant-cutover.js:283-297`. No current test changes a real query owner between the pre-ENABLE proof and final census. | Keep the final query path as an explicit gap until there is an existing-owner schedule that can retain a real already-accepted coordinator settlement across the observation boundary. The smallest valid added case is in the existing participant protocol fixture: a real accepted SQL-transactions settlement is held by its existing proposal/application owner, the pre-ENABLE settlement/proof is observed, it completes or changes lineage while OBSERVE is pending, and the fresh final census must either rebuild a valid proof or return `QUERY_DRAIN_PENDING`; RESUME must not run. Direct SQLite row edits, a fabricated `queryCensus`, or replacing `settleTransactionReleaseRows` would only mirror the classifier and are not valid. If no current fixture seam can place that actual accepted work after the pre-proof without violating PAUSE, retain the source-order/static obligation and require independent implementation review rather than claiming behavioral coverage. |

## Cross-cutting assertions

Every added recipient case should assert the same invariants instead of growing
parallel fixtures:

1. the response retains the actual request's release/partition/action identity
   through `releaseAnswer`; no observer result grants RESUMED or OPEN;
2. the canonical facts reader is the only status/membership/application
   observation; event payload is never treated as completion;
3. admission remains CLOSED for every deadline, stale, shutdown, work, query,
   or control refusal;
4. listener, timer, and observation record counts return to zero on success,
   timeout, conflict, replacement, service shutdown, and handler shutdown;
5. a stale callback cannot remove a fresh successor observation;
6. the existing overall RUNS promise/deadline, seed retry policy, transport
   classifier, pause/resume guard, and final `releaseCensusDefect` are called,
   not reimplemented in the test.

## Concrete proof gaps

1. No existing focused test separates RPC-only `message_timeout` from overall
   `release_deadline`, or proves queue delay consumes the carried window.
2. Whole-cutover RUNS joining is covered; per-replica observation joining,
   conflict handling, nonrenewal, and successor-safe cleanup are not.
3. No existing test proves a publication wake retained during an asynchronous
   canonical facts read.
4. Existing shutdown/replacement tests protect final RESUME, but do not prove
   observation cancellation settles before held facts or handler cleanup waits.
5. Term/generation/configuration changes have no post-await observation test.
6. Existing work and query/control tests exercise canonical refusals, but only
   the work test currently has real accepted-work ownership. The final
   post-observation control recheck needs one actual lifecycle case; the final
   query-proof race lacks an honest existing fixture schedule and must not be
   simulated with raw rows or copied classification.

This matrix is planning input only. It neither authorizes production changes
nor claims the native same-promise, startup, corpus, or main receipts.
