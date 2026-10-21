---
audience: development
documentClass: current
---

# Original handoff: lower SQL submission correspondence

Date: 2026-10-21. Author: root. Read-only product examination at
`393f411ca09449898465cc3cb7320c03fba2aba8`; the accompanying input manifest
binds the inspected files. This resolves part of pre-source review item3,
not the whole new contract or a native witness. No source or test changed.

The existing local mutation sink already refuses unreplicated writes after
the partition's durable generation origin exists. Therefore the CDC fallback
branch alone does not establish a reachable second physical mutation in the
proposed post-release handoff. The new unit must preserve complete release and
measure the origin on every actual fallback target before claiming that
protection covers its operation.

## Existing call and commit spine

1. `seed-startup-plan.js:34-45` acquires CDC, state machine, SQL and the handler,
   then awaits `releaseSeedParticipantCohorts` before invoking registration.
   The release method (`bootstrap-service-seed-workflow.js:276-330`) selects
   each distinct partition, control first, and fails unless each returns
   CUT_OVER under the original shared deadline. It does not treat the map,
   the number of completed phases, or elapsed time as release evidence.
2. The existing row owners build the SERVICES birth and call
   `insertSystemTableRow` once. Partition registration catches the insert
   failure and resolves it by an authoritative row read; this does not
   reissue the INSERT. Its present match predicate only checks that
   created_at is an integer, so it still needs the new contract's exact
   reserved-birth comparison. Neither that predicate nor the process-local
   registration WeakSet is cold original-allocation authority.
3. `cdc-integration-service-mutation-operations.js:221-341` prepares the row,
   builds INSERT SQL inside its coalesced invocation, and calls executeSQL.
   `cdc-integration-service-lifecycle.js:284-309` delegates through the
   existing write router with terminal shutdown handling. Bootstrap mode
   selects the existing direct strategy; it is not the steady-state SQL
   router's retry algorithm.
4. `cdc-routed-mutation-readiness.js:276-277` deliberately ignores its options
   argument when entering `executeBootstrapDirectSql`. That method
   (`cdc-bootstrap-direct-sql.js:47-176`) selects the target partition,
   invokes executeQuery once on the selected Raft lane, and on a failed or
   thrown answer tries executeLocalQuery on candidates. Do not assume a
   caller's idempotencyKey, entryId or queryTimeoutMs reaches the partition
   through this bootstrap route.
5. `PartitionService.executeQuery` constructs a QUERY operation and calls
   proposeWrite for a mutation (`partition-service-write-metrics-base.js:
   60-139`). `buildPartitionWriteEntry` mints an entryId only if absent
   (`partition-write-kernel.js:236-254`); forwarding carries that built entry.
   applyWrite keeps its entry identity and observes pending/settled outcomes
   before proposing (`partition-service-write-metrics-base.js:621-681`).
   Port deferral and prepared-work parking stay under the existing commit
   owner's identity; these are not permission for a new original INSERT.
6. The actual committed application runs the SQL and records its outcome,
   CDC obligation and generation advance, scheduling response settlement
   after commit (`partition-service-entry-apply-base.js:617-670`).
   `raft-rs-application-transaction-owner.js:51-99` encloses application and
   applied-state advancement in the store transaction and runs afterCommit
   effects afterwards. This identifies the existing owner and transaction
   boundary; source reading is not a new power-loss or native I/O proof.

## The fallback's lower physical fence

`executeLocalQuery` calls `unreplicatedLocalMutationRefusal` after statement
admission and before `runAdmittedPartitionStatement`, with no intervening
await (`partition-service-write-metrics-base.js:157-201`). The existing owner
`partition-local-mutation-admission.js:26-32` reads the target's own origin.
A non-null origin returns UNREPLICATED_LOCAL_MUTATION. Without an origin, a
cutover pause returns CUTOVER_PAUSED. Neither refusal executes the statement.

The origin reader (`partition-participant-transaction-store.js:85-108`) reads
the generation row; missing or unreadable storage throws instead of becoming
permission. A present origin remains a fence after OPEN. It is not a lease,
a cached row, or the caller's phase flag. Final release census validation
requires matching applied origins for all actual members
(`partition-participant-release-contract.js:123-193`); the pre-origin ENABLE
phase uses a different explicitly named admission extent.

Consequently, for an actual target with its origin committed, a lost Raft
answer can enter the CDC fallback branch but cannot mutate through that local
sink. The branch can still replace the visible original error with a local
refusal. The new row owner must therefore retain its exact submitted identity
and reconcile the authoritative row; it cannot interpret the fallback error
as proof the first append did not commit or rearm UNUSED. This note does not
establish safety for a pre-origin target or authorize bypassing release to
reach registration earlier.

## Consequences for the proposed bounded interaction

- Consume the existing original birth right before invoking the actual lower
  submission. Preserve the same live invocation through waits, result loss
  and cleanup; an unavailable answer leaves SUBMITTED debt. Exact row
  reconciliation, not a fresh INSERT, resolves its same-live unknown outcome.
- Keep complete real release before the selected registration effects.
  Record every selected target and its physical generation/origin, including
  any target the fallback loop can select. A leader-only or sampled map
  observation does not prove every sink is fenced.
- Do not introduce a new CDC writer or remove the existing fallback based
  solely on this source review. The actual post-origin protection belongs
  to the partition local-mutation owner. Any separate pre-origin defect
  needs its own complete-operation witness and scope decision.
- Before production approval, freeze a witness that loses the actual native
  SERVICES/CONFIG commit response through this route, measures any attempted
  fallback and the sink's refusal, then resolves only the exact committed
  identity through the existing authoritative reader. A forged result,
  generic startup error or assertion about an unentered branch is insufficient.
  Subsequent cold SUBMITTED remains the separately specified HOLD.

`partition-participant-release-admission.test.js` already exercises the local
sink, but its helper applies an origin using a controllable port
(`participant-transaction-fixture.js:416-450`). That component test is useful
correspondence, not evidence that public startup reached the native lost-answer
schedule. No such new execution was performed for this note. The actual public
baseline, remaining mutation/activation cut, ingress gates, issuance/abort
serialization and independent implementation review remain prerequisites.
