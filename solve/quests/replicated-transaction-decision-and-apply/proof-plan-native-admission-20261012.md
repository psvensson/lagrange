# Native partition admission and recovery: bounded continuation

Status: WIP proof work under the existing sealed TX1 Quest; no seal changed,
independent approval, source landing or main integration implied.

Input: published 64b85decf37d58d9c52cabbd95b207ae027bd050. Local recovered
source tree 34af50ee2245c8bd99b0f87e484beb6871d11c3c and test tree
8672c9e4fb158200c69e6b2beec6bc47bab40f32 match that checkpoint exactly.
Local Git parent 7d91de9f is the retained source candidate, not the remote HEAD.

## Existing owners and measured starting failures

The six partition-unreadable-durable-record cases fail their first successful
write before injecting the storage fault. Their fixture initializes Raft but
never submits the existing release owner request. Release admission begins
CLOSED in partition-participant-transaction-pause.js; application writes consume
that owner in partition-service-raft-write-commit.js. Do not bypass either.

transaction-coordinator-group-fixture.js allocates a name-prefixed control
partition, while replica-handler-participant-cutover.js requires
INITIAL_PARTITION_IDS[TABLES.SQL_TRANSACTIONS]. The current native A1-A5 witnesses
therefore stop at current_control_owner_fact rather than reaching transactions.
Use the canonical existing identity and the real ReplicaHandler release route.

Controllable staging and legacy-session witnesses also have retained failures.
They do not certify a genuinely admitted legacy transaction when BEGIN refused.
Historical legacy admission, new participant reservations and the removal map
remain distinct proof obligations. No new legacy entry point is authorized.

## Proof order

1. Preserve original outputs and unchanged source hashes before fixture changes.
2. Repair native fixture composition: actual control PartitionService and
   ReplicaHandler, real membership and release census, one original deadline.
   A missing owner or revoked grant remains a typed refusal; no hand-assigned
   origin, pause removal, private session creation or false readiness fields.
3. Re-run complete native participant and coordinator restart files. Tighten
   positive admission preconditions so a refused BEGIN cannot become a later
   misleading assertion. Coordinator gateway is a local SQLite fixture, not
   replicated system-table persistence: state that evidence ceiling explicitly.
4. Exercise the previously unreachable storage faults after genuine write
   admission. Recovery must resolve the old operation without granting new work
   from an expired/mismatched release projection. Preserve all existing fault,
   no-native-entry, identity, bounded retry and durable-row assertions.
5. Add native L6 refusal and durable PREPARED/restart/expiry witnesses through the
   same fixture when preconditions are real. Exact durable outcomes, committed
   positions, operations and applied index remain the authorities.
6. Source-only controls are required for any production correction. Fixture-only
   controls establish prior setup failure, not a claim that production was fixed.
   Run regression selection and all available static checks; report existing reds.

## Review and exclusions

The operator's 10x elapsed-case tolerance applies; no protocol/caller/retry/seed
budget is extended. No global literal baseline is raised, no historical record
rewritten, and no fresh execution permitted through legacy compatibility paths.
Findings 1/3 of the supplied ownership audit retain their explicit producer /
consumer retirement requirement after real admitted-obligation proof.

Review 5494514281 resolved the snapshot receiver finding but identifies a
separate failed-shutdown / CREATE physical-worker claim continuation gap
(comment 4251078406). Retain that OPEN with the host-cleanup owner; do not absorb
it into a partition/TX1 fixture correction. Old unresolved PR threads are not
independent approval or proof that their old source still exists.

Review scope: admission-gating, recovery-replay, owner-interaction, concurrency-
serialization, harness fidelity. No direct subagent is available; a separate
review must state its real identity and scope, never masquerade as Solver approval.


## Current measured scope and explicit retirement gates

The fixture composes the real canonical sql_transactions-p1 control service,
ReplicaHandler recipient/recovery owners and operator release request. Both
partition storage tests and the three-replica TX1 group use this one fixture.
It supplies caches/loopback transport as declared inputs, not production cluster
formation or automatic seed-release certification. The participant databases and
Raft group are real; the coordinator gateway remains one in-memory SQLite double.
Reconstructing that coordinator engine is not process loss or replication of its
system tables. CDC checks read durable obligations, not downstream delivery.

A settled prefix must reach every live replica within the existing budget.
Intentionally stopped replica files are inspected separately and must catch up
after actual reopening. An expired wait cannot be discarded as successful settle.
A restored native runtime does not by itself restore application release; the
storage witnesses await the existing owner's revalidation before new writes.
The underlying durable-read phase and no-entry checks remain distinct from the
application-level CUTOVER_PAUSED refusal. Those two old expected error surfaces
are explicitly aligned to the already-current release-first contract.

Retirement is still a deliverable, not the inference that green coexistence is
permanent architecture. Inventory against the input source:

| Responsibility | Existing producer and consumers | Required deletion/retention gate |
| --- | --- | --- |
| Fresh legacy execution | partition-service-entry-apply-base.js: handleTransactionMessage / executeTransactionControl; partition-service-transaction-base.js: beginTransaction / prepareTransaction / commitTransaction / rollbackTransaction | Prove exactly which historical requests were admitted. Post-origin fresh legacy BEGIN stays forbidden, including after terminal new-protocol decisions. Do not reopen a legacy window to repair a test. |
| Legacy commit and CDC | partition-service-transaction-base.js local COMMIT, marker proposal, buffered-change publication, retained outcome reader | Settle each accepted/uncertain old obligation through its original owner before retiring writers. Preserve historical outcome/replay decoding for retained records; never reinterpret absent new rows as an old terminal result. |
| Legacy prepared reconstruction | reconstructPreparedState, preparedTransactions / activeTransactions / preparedStateLostSessions; entry replay and lifecycle-drain readers | Enumerate every retained marker/log reader and destructive-reopen consumer. Remove the complete interaction only after historical obligations are closed; do not leave readers reporting false emptiness after deleting the producer. |
| Old expiration | collectExpiredPreparedSessions / collectExpiredActiveSessions / runPreparedStateHoldTimeoutSweep; enforcePreparedStateHoldTimeouts also invokes the separate participant hold owner | Delete only the old sweep and its timer/diagnostic consumers with legacy retirement. Preserve participant hold reporting and durable PREPARED reservation until a correctly bound decision. Shared wrapper naming does not make the two protocols one authority. |
| Connection contamination | noteLegacySessionServed and participant-transaction-connection.js stamps; release facts and lifecycle reopen | Fresh participant admission requires the existing clean-connection rule. Legacy-map absence alone is not proof that the connection never served legacy work. Keep negative contamination witnesses through retirement. |
| New transaction authority | partition-participant-transaction-request/store/apply plus the coordinator's bound decision path | Durable participant rows, native committed/applied positions and exact identities alone authorize new PREPARE/decision/recovery. L6 controls cannot release or manufacture outcomes from old maps. |

The retained legacy-responsibility-callers.txt is an inspection aid, not a new
runtime registry. This continuation does not delete any production responsibility,
modify a seal, supply an approving review or claim historical legacy admission.
The new native L6 witness proves the current post-cutover side: legacy controls,
legacy outcome absence and expiry cannot settle a real durable PREPARED row,
including after a genuine replica restart. Its exactly-once terminal effect is
then obtained only from the existing recorded decision.

Nine wider controllable-fixture failures remain in three unchanged files:
partition-participant-transaction-apply (2), staging (4), and legacy-session-
statement-admission (3). Current closed-release prerequisites contradict several
old setup assumptions; the old L6 inverse case ignores the refused legacy BEGIN.
The nullable-outcome case's contamination setup never stages either. These
observations do not waive any test or prove historical migration; each needs
explicit stronger witness/supersession under the existing Quest before landing.
