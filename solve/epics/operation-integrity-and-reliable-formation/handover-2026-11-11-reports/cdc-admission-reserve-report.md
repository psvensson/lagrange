# CDC retirement reserve (dead-recipient measure 1): writer report, 2026-11-11

Base: HEAD 103f132c1 plus the shared uncommitted tree. No git state was changed.
Everything here is unit or component level. Nothing is lab-measured or independently verified.
The design note section is S3.8, appended to
solve/epics/operation-integrity-and-reliable-formation/cdc-delivery-design-note-2026-11-11.md.

## 0. The ruling's premise does not hold

A lifecycle write never becomes a participant PREPARE. Every lifecycle write is a single-row
UPDATE or DELETE on `nodes` or `services`. Both are one-partition system tables, and system
tables are never split by write tracking (`WRITE_TRACKING_EXCLUDED_TABLES` = every TABLES
value). The engine therefore runs the write as DIRECT_AUTOCOMMIT
(`src/query/sql-query-engine-write-execution.js` `resolveWriteTransactionOwnership`: one
partition statement and no open transaction). `distributedWriteCoordinator.executePlan` sends
it without a transaction identity. The partition proposes it as one ordinary committed write
entry: `buildQueryOperation` makes the operation and `buildPartitionWriteEntry` makes the entry
(type QUERY).

`admitCdcOwedWork` decides that entry at two points: the leader preflight (`partition-service-raft-write-commit.js`
`startPartitionRaftWriteCommit`) and apply (`partition-service-entry-apply-base.js:717`).

The previous writer's hops 7 to 11 (the TX1 decision protocol, `deliverTransactionOperation`,
`sealSession` and `buildPrepareCommand`, and the bytes pin) are therefore not on this path.

What was built instead:
- The class rides the committed write entry.
- The pinned PREPARE bytes are **unchanged**. A field there would be a format with no producer,
  which the no-legacy ruling forbids.
- A classified write whose plan would turn into a participant transaction is **refused typed**
  (`not_direct_write`), so the class is never silently lost.

The owner should confirm this reading of the ruling: the ruling authorised one byte change, and
the change landed on the entry the write actually uses.

## 1. Hop table (lifecycle owner -> admitCdcOwedWork)

The intent is the frozen in-process token `RECIPIENT_RETIREMENT_WRITE`, stored under
`cdcAdmissionIntent`. The wire class is `cdcAdmissionClass: 'recipient_retirement'`; ORDINARY
means the field is absent. Both are defined in the new leaf module
`src/partition/partition-cdc-admission-class.js`.

| # | Hop (file:line) | How the class is carried | Pick-list? | Killing test |
|---|---|---|---|---|
| 1 | Lifecycle owners (section 2) | spread `RECIPIENT_RETIREMENT_WRITE_OPTIONS` into the write options | - | hops#6, witness |
| 2 | `SystemMetadataOwnerBase.executeMutation` (owners/system-metadata-owner-base.js:417) | `buildMutationOptions` spreads the options; the executor spreads `mutationOptions` | no (spread) | hops#6 (NodesOwner) |
| 3 | gateway `buildGatewayWriteOptions` (control-plane-system-table-gateway-options.js:191) | `copyOption(..., CDC_ADMISSION_INTENT_FIELD)` added deliberately | **yes** | hops#3, witness |
| 3b | gateway coalescing (…-request-coalescing.js:24, 217, 238, 245) | SINGLE_FLIGHT and REPLACE_PENDING keys include the class, so a retirement write never joins or replaces an ordinary one | key | hops#3 |
| 3c | gateway SQL fallback (`executeSqlMutationFallback`) | passes `writeOptions` whole | no | by reading |
| 4 | CDC `insert/update/upsert/deleteSystemTableRow` executeSQL option lists (cdc-integration-service-mutation-operations.js:258, 433; cdc-integration-service-mutations.js:107, 231) | field added to all 4 lists | **yes x4** | hops#1, witness (update) |
| 4b | CDC single-flight key (cdc-integration-service-coalesced-mutation.js:54) | class added to the key | key | hops#1 |
| 5 | `executeSQL` -> writeRouter -> `executeSQLViaQueryEngine` | options passed through | no | - |
| 6 | `executeSQLViaQueryEngine` `baseQueryOptions` (cdc-routed-mutation-readiness.js:548) | intent copied into every engine attempt; a forged intent is refused first (:381) | **yes** | hops#2, witness |
| 6b | local-leader leg `localLegWriteIdentity` (cdc-routed-mutation-readiness.js:137) | wire class added to the leg's partition options | **yes** | hops#2 |
| 7 | engine entry `resolveClientStatementRefusal` (sql-statement-ingress.js:141) | validates the class; refuses client, raw or forged values | - | hops#5 |
| 8 | `buildRoutedWriteExecutionOptions` (sql-query-engine-write-execution.js:137) | intent -> wire class (the one conversion) | **yes** | hops#5, witness |
| 8b | `runOwnedWriteStatement` (sql-query-engine-write-execution.js:549) | not DIRECT_AUTOCOMMIT -> typed refusal | - | hops#5 |
| 9 | `createParticipantExecutionOptions` -> queryExecutor `executeUpdate`/`executeOnPartitions` | spread | no | witness |
| 10 | `createDefaultPartitionRequestBuilder` (query-executor-partition-request-builders.js:114) | stamps `request.cdcAdmissionClass` | **yes** | hops#4, witness |
| 11 | partition `executeRemoteQuery` (partition-service-remote-query-methods.js:139) | field added to the `executeQuery` option list | **yes** | reserve#3, witness |
| 12 | partition `resolveNonReadQueryRefusal` (partition-service-write-metrics-base.js) | refuses a client class or an invalid value | - | reserve#3 |
| 13 | `buildQueryOperation` (partition-service-write-metrics-base.js:77) | wire class -> operation, then the committed entry (`buildPartitionWriteEntry` spreads it; a follower's FORWARD_WRITE carries the whole entry) | **yes** | reserve#1, reserve#3 |
| 14 | `admitCdcOwedWork` via `committedCdcAdmissionClassOf` (partition-cdc-owed-admission.js:93) | the one decode | - | reserve#1, reserve#2 |

Test names: "hops" is test/cdc/cdc-admission-class-hops.test.js (7 tests). "reserve" is
test/partition/partition-cdc-retirement-reserve.test.js (3 tests). "witness" is
test/partition/partition-cdc-retirement-reserve-witness.test.js (1 test).

## 2. Lifecycle owners that set it

These owners set the class, by typed intent at the transition owner:
- `MessageGroupServiceRowOwner` `persistMessageGroupActivation`: the ACTIVE->STOPPED transition
  of a message-group replica (message-group-service-row-owner.js:266).
  - Callers that reach it: the handler stop path and the rebalancer source retirement
    (`replica-operation-message-group-removal.js` `executeSourceRetirementCleanup`).
- `MessageGroupServiceRowOwner.removeReplica`: deletes the staged STOPPED row (message-group-service-row-owner.js:586).
- `applyNodeTerminalTransition`: passes the fragment to its `write(where, retirementOptions)`
  (node-terminal-transition-fence.js:146). Both callers spread it:
  - graceful shutdown (heartbeat-service-lifecycle-methods.js:549);
  - failed-join withdrawal (node-registration-owner-publication-methods.js:608 -> :525).
- Stranded-join reaper `LeaseService.reapStrandedJoiningRows` (lease-service.js:531).
- `NodesOwner.removeTerminalNode`: the intent is spread last, so a caller cannot drop it (nodes-owner.js:101).

No message_groups retirement writer exists in src. Nothing writes message_groups
status retired/inactive, so that branch of `readRecipientGroupLifecycle` has no producer. This is
a finding, not a change.

## 3. Format change and R09 supersession text

- **Committed write entry** (QUERY / SQL commands): one optional field is added,
  `cdcAdmissionClass`, present only as `recipient_retirement`.
  - Absence means ORDINARY. This is the format's definition, not a fallback: every entry written
    before the field existed was ordinary, so it decodes to exactly what it was.
  - There is one decoder (`committedCdcAdmissionClassOf`), and it gives the same answer on every
    replica.
  - A participant command never carries a class. The decoder returns ORDINARY for anything that
    is not a committed SQL command (reserve#1 asserts this for a PREPARE).
- **Old entries in a live log.** Rolling upgrade is unsupported on 0.x
  (docs/current-capabilities-and-limitations.md:156). The raft-rs closeout ruling (memory
  2026-10-04) declared in-place upgrade from the reused-identity builds unsupported. However,
  the TX1 envelope ruling has committed entries from an earlier build applied as carried. Old
  entries can therefore exist and need no second path.
- **Participant PREPARE bytes** (`partition-participant-transaction-bytes.js`): **not changed**.
  - Its pin test (`partition-participant-transaction-apply.test.js` "admits every participant
    command type only ... in its pinned byte form") is unchanged and still green.
- **R09 texts** (in design note S3.8.2):
  - "S3.6: system-table lifecycle writes reach the partition as TX1 PREPARE commands" is
    withdrawn. They are DIRECT_AUTOCOMMIT committed write entries. The PREPARE byte format is not
    changed.
  - The committed write entry gains the optional `cdcAdmissionClass`, present only as
    `recipient_retirement`.
  - OWED_MAX_EVENTS is the capacity of ORDINARY writes. The ledger bound is OWED_MAX_EVENTS +
    OWED_RETIREMENT_RESERVE_EVENTS, and the extra rows are only for RECIPIENT_RETIREMENT writes.
  - S3.4 ledger bound restated to match.

## 4. Enforcement

- **Engine entry** (every `executeQuery`): the following are refused typed
  `cdc_admission_class_refused` before anything executes:
  - a client statement that carries a class or intent (`client_ingress`);
  - a raw class value or a forged intent (`not_owner_intent`).
- **Client SqlRequest entry** (`buildClientRequestQueryOptions`): a request that names a class
  carries the claim to the entry, which refuses it.
  - The canonical `createSqlRequest` never carries one. This is asserted.
  - Witness: hops#5. A SqlRequest carrying the class gets `client_ingress`.
- **CDC routed write**: a forged intent is refused before the local leg (hops#2).
- **Partition**: refuses a carried class on a client-ingress statement and any value other than
  `recipient_retirement` (reserve#3).
  - A client write to a system table is refused earlier by the existing system-table ingress rule.
- **Census test** (hops#7): only the class module and the five lifecycle-owner modules name the
  token.
- **Limit**: an in-process module could still import the token. The census test is the guard
  against that, not the language.

## 5. Bounds

- **Admission rule**:
  - ORDINARY: admitted while owed + required <= 4096; otherwise `partition_write_cdc_capacity`,
    unchanged.
  - RECIPIENT_RETIREMENT: also admitted up to 4096 + 256, as ADMITTED_FROM_RESERVE. The leader's
    preflight logs info "...admitted from the retirement reserve" with
    `{owed, required, tableName, admissionClass, reserveEvents, owedMaxEvents}`.
  - Past 4096 + 256: `partition_write_cdc_retirement_reserve_exhausted`. It is retryable
    (`deferRetry`) and in RETRYABLE_WRITE_FAILURE_CODES and the reroutable texts. A warn is
    logged. The named state is RESERVE_EXHAUSTED.
- **Is 256 justified?**
  - Each committed lifecycle statement owes exactly 1 ledger row (`recordCommittedStatementCdc`).
  - One replica retirement costs 2 rows on the services partition: STOPPED, then the removal.
  - A node's own terminal transition costs 1 row on the nodes partition, plus 1 if it is
    removed.
  - So 256 covers 128 replica retirements (about 42 three-replica groups) per partition between
    two acknowledgement drains.
- **Retiring several recipients at once.** Retiring nodes that host more than 128 replicas
  between drains exhausts the reserve. What then:
  - The remaining writes are refused typed, and their owners retry. The rebalancer, handler and
    reaper all see a deferRetry answer.
  - The ones already admitted carry the evidence the lane detaches on.
  - What clears the state is acknowledgements draining. Under a held acknowledgement path (5b)
    nothing clears it until a leader change.
- **Determinism**: admission is evaluated before proposal on the leader (conservative) and again
  at apply on every replica (authoritative):
  - partition-service-raft-write-commit.js `startPartitionRaftWriteCommit`;
  - partition-service-entry-apply-base.js:717;
  - partition-participant-transaction-apply.js:331.

  Apply reads only the replicated ledger count and the entry's own field. Witness: reserve#1, a
  retirement entry and an old-format ordinary entry applied on two replicas give identical owed
  counts.

## 6. The other two ways to the cap (no fix in my files; findings)

| Cause | Event that clears it | Armed? | Reserve consumable | Operator sees |
|---|---|---|---|---|
| NO_PROPAGATION_SUBSCRIBER | attachment retry: an MG service init or leader-election event, or a lane drive with owed rows and no subscriber | yes. `once` listeners are placed on the MG services present at arm time. Every committed write drives the lane, including a reserve write, which therefore also wakes the attachment | yes (256) | warn "CDC obligations owed ... no propagation subscriber" once per tenure with owed; AWAITING warns; drive state |
| FLUSH PROPOSER_UNAVAILABLE | a proposer registered | yes: lane retry timer | yes | warn per flush |
| FLUSH OUTCOME_UNKNOWN | ledger reconciliation, or tenure end | yes: retry timer | yes | warn ACKNOWLEDGEMENTS_REFUSED |
| FLUSH REFUSED, non-terminal | retry | yes | yes | warn |
| FLUSH REFUSED, terminal (UNKNOWN_EVENT, ENTRY_MISMATCH, POSITION_MISMATCH, BYTES_INVALID, IDENTITY_MISMATCH) or refused pre-proposal | **none within the tenure**: `lane.held` is set (partition-cdc-obligation-delivery.js:207, :273). Only a new lane (leader change) clears it | **no** | yes, then RESERVE_EXHAUSTED until a leader change | one warn; diagnostics `acknowledgementHeld` |
| FLUSH NOT_LEADER | the new leader's lane | election | n/a here | debug |
| DRIVE ACKNOWLEDGEMENT_BACKPRESSURE | next flush or retry | yes | yes | backpressure report |

Findings for the CDC delivery owner. These are outside my files, so I did not change them:
1. A terminal `lane.held` has no clearing event within a tenure, so the ledger can fill to the
   cap plus the reserve and stay there until a leader change.
2. The deferred attachment only listens to MG services that existed when it armed. A
   message-group service created later does not wake it; only a committed write does, and at
   capacity only a reserve write commits.

## 7. Witnesses and proofs

- **reserve#1**: at 4096, a direct partition write is refused CDC_CAPACITY and proposes nothing.
  Then the retirement write:
  - is proposed with its class, commits on 2 replicas, and leaves owed at 4097 on both;
  - the RESERVE_USED log carries owed 4096, table, class and required 1.

  Further checks: an old-format entry applied at the cap leaves both replicas unchanged, and a
  PREPARE decodes ORDINARY.
- **reserve#2**: 256 retirement entries are admitted exactly. The 257th committed entry is
  consumed without effect. A retirement write is refused `..._reserve_exhausted` (deferRetry,
  retryable), nothing is proposed, and a warn is logged.
- **reserve#3**: partition refusals. A client class on a user table gives `client_ingress`, an
  invalid value gives `invalid_value`, and nothing is proposed. The remote QUERY hop carries the
  class, and an ordinary entry has no field.
- **hops#1-7**: section 1.
- **witness** (one test, about 7 s). Production entry point and real lifecycle owner:
  - Path: `MessageGroupServiceRowOwner.updateReplicaStatus(STOPPED)` -> real gateway -> real
    CDCIntegrationService -> real SQLQueryEngine, QueryExecutor and write coordinator -> real
    rs-raft `services` lone leader (unknown-outcome-surface fixture, cdc mode).
  - Port substitutes: the recipient answers, the sender cache, and a lifecycle read port that
    answers from the leader's own committed rows with a leader witness.
  - Sequence:
    1. The ledger fills to 4096 with no subscriber.
    2. An ordinary write is refused `partition_write_cdc_capacity`.
    3. The retirement write commits through the reserve (owed 4097, RESERVE_USED logged, the
       class seen on the partition entry).
    4. The propagation subscriber attaches with a dead target group that never confirms.
    5. The lane asks the lifecycle owner, reads the STOPPED row, and the group becomes
       DETACHED{lifecycle}.
    6. Acknowledgements commit, owed drops below 4096, and an ordinary write succeeds.

    No restart and no manual step.
- **Deviation from the brief's chain.** The brief's chain starts "a dead recipient pins the
  frontier -> the partition reaches capacity". That cannot happen with measure 3 in place: a dead
  *target* group above RELIST_LAG_ROWS (2048) becomes MUST_RELIST and the ledger reclaims past it
  (S3-D). The cap is reached only by:
  - no subscriber (the witness's cause);
  - stalled acknowledgements;
  - a dead primary recipient, which is never detached.

  In the witness the group is released by the lifecycle read. That read is asked because the
  group is MUST_RELIST (owed > 2048), so DETACHED and MUST_RELIST both apply. DETACHED is not the
  sole cause of reclamation at the cap. The reserve's guarantee is that the retirement commits at
  the cap.
- **Before-failure proof**:
  The decisive hunks were reverted in place, then restored; a guard checked for concurrent edits and none occurred:
  - `partition-cdc-owed-admission.js` and `partition-service-raft-write-commit.js` were set to their HEAD versions;
  - their diff against HEAD is mine alone.

  The witness then fails at the retiring write. The real lifecycle owner's STOPPED write does not commit at
  capacity: the CDC routed write retries for about 37 s, then the owner answers `ACTIVATION_OWNER_DEFERRED`,
  and the replica row stays ACTIVE.
  - I did not capture the partition's refusal code inside that chain. The retry is consistent with the
    retryable `partition_write_cdc_capacity` answer that reserve#1 asserts directly for an ordinary write at the
    cap, but this run does not show the code itself.
  - A scratch-copy run (rsync of src/test/scripts/vendor) could not start the lone rs-raft leader:
    `resumeFixtureParticipantAdmission` failed on `configurationKey`. This is an environment gap of the copy,
    not of the change, and the same fixture passes in the tree.
- **Mutations** (each safety line reverted alone, then the named files run):

27 of 27 killed. Each mutation was run alone; the named file failed.

| Mutation | Killing test |
|---|---|
| M1 reserve capacity = OWED_MAX | reserve, witness |
| M2 reserve has no upper bound | reserve |
| M3 decode ignores the command type | reserve |
| M4 ordinary admitted from the reserve | reserve |
| M5a partition client refusal removed | reserve |
| M5b partition invalid-value refusal removed | reserve |
| M6 remote query option list drops the class | reserve, witness |
| M7 entry builder drops the class | reserve |
| M8 request builder drops the class | hops, witness |
| M9 engine write options drop the class | hops, witness |
| M10 engine entry refusal removed | hops |
| M11 client claim not carried to the entry | hops |
| M12 non-direct refusal removed | hops |
| M13 CDC update / M13b insert / M13c delete / M13d upsert option lists | hops (and witness for update) |
| M14 CDC engine-attempt options drop the intent | hops, witness |
| M15 local leg drops the class | hops |
| M16 forged-intent refusal before the local leg removed | hops |
| M17 gateway option list drops the intent | hops, witness |
| M18 gateway coalescing key ignores the class | hops |
| M19 CDC single-flight key ignores the class | hops |
| M20 MG STOPPED intent removed | hops, witness |
| M21 MG removal intent removed | hops |
| M22 node fence passes nothing | hops |
| M23 shutdown caller drops it | hops |
| M24 withdrawal caller drops it | hops |
| M25 reaper intent removed | hops |
| M26 removeTerminalNode intent removed | hops |
| M27 reserve log removed | reserve, witness |

The runner is /tmp/claude-1000/-mnt-data-peter-projects-lagrange/4ac552d4-1d88-45c0-b4a5-c74f61767a37/scratchpad/mut/run.py.
M13b was rerun alone because the runner's first pattern for it was ambiguous.

## 8. Test runs (each file alone, nice 15, thermal-gated)

- New tests, all green and eslint-clean:
  - test/partition/partition-cdc-retirement-reserve.test.js (3 tests);
  - test/partition/partition-cdc-retirement-reserve-witness.test.js (1 test, about 7 s);
  - test/cdc/cdc-admission-class-hops.test.js (7 tests).
- Existing directly affected tests, each run alone, all green (23):
  - partition: partition-write-kernel, write-path-epoch-fencing, partition-cdc-prepared-capacity,
    partition-participant-transaction-apply (the pinned-byte-form test, unchanged),
    partition-cdc-recipient-isolation, partition-write-typed-releases, partition-cdc-source-relist;
  - query: partition-write-answer-consumers, sql-query-engine-system-table-write-admission,
    system-table-ingress-boundary-adversarial, sql-statement-refusals,
    query-executor-durable-commit-witness, execute-request;
  - control-plane: node-terminal-transition-fence, node-terminal-removal, system-metadata-owner-modules,
    heartbeat-memory-trend-reporter-and-shutdown, incarnation-reuse-cross-owner-anchor,
    control-plane-system-table-gateway;
  - message-group: message-group-service-row-owner, message-group-replace-removal-fence;
  - cdc: cdc-integration-service-mutations-and-epoch, cdc-integration-service.
- eslint is clean on all 23 touched source files and the 3 new test files.

## 9. Needs a lab run (integration owner)

- The broad suite. I ran only directly affected files.
- `npm run test:metadata:refresh`. It must classify the 3 new test files; they are not in
  test/shards/*.json, which are generated. Then `npm run audit:shards`.
- `npm run test:static`. The file-size, complexity and unused-export ratchets were not run here;
  the new module adds exports used across layers.
- `test/partition/partition-cdc-owed-admission-native.test.js` (native RF3, 4096 writes). It is
  directly affected by the admission change, but I did not run it locally because of its size.
- Formation soak: grep the RESERVE_USED and RESERVE_EXHAUSTED lines and the partition
  `acknowledgementHeld` diagnostics. Expected: none in a healthy run.

## 10. Left / open

1. Owner confirmation of section 0: the class is on the committed write entry, and the PREPARE
   is unchanged.
2. The two CDC-delivery findings in section 6: terminal `lane.held`, and attachment listeners
   fixed at arm time.
3. There is no message_groups retirement writer, so that RETIRED evidence branch has no producer.
4. Bootstrap direct-write mode (`executeSQLDirectToLocalPartition`) carries no class. Seed
   bootstrap does no lifecycle retirement, but this is not witnessed.
5. A coordinator-recovered transaction carries no class. Only multi-partition plans would need
   one, and those are refused.
6. Independent verification is owed.

## 11. Files touched

- **New**:
  - src/partition/partition-cdc-admission-class.js
  - test/partition/partition-cdc-retirement-reserve.test.js
  - test/partition/partition-cdc-retirement-reserve-witness.test.js
  - test/cdc/cdc-admission-class-hops.test.js
- **Partition** (src/partition/):
  - partition-cdc-owed-admission.js: the reserve, the decode and the log;
  - partition-write-kernel.js: new code, which is retryable;
  - partition-service-raft-write-commit.js: the preflight log;
  - partition-service-remote-query-methods.js: one option line. The hydration-image hunk in this file
    belongs to the other writer and was not touched;
  - partition-service-write-metrics-base.js.
- **Errors**: src/constants/errors.js (new text, added to the reroutable texts).
- **Query** (src/query/): sql-statement-ingress.js, sql-query-engine-request-dispatch.js,
  sql-query-engine-write-execution.js, query-executor-partition-request-builders.js.
- **CDC** (src/cdc/): cdc-integration-service-mutation-operations.js, cdc-integration-service-mutations.js,
  cdc-integration-service-coalesced-mutation.js, cdc-routed-mutation-readiness.js.
- **Control plane** (src/control-plane/): control-plane-system-table-gateway-options.js,
  control-plane-system-table-gateway-request-coalescing.js, node-terminal-transition-fence.js,
  heartbeat-service-lifecycle-methods.js, lease-service.js, owners/nodes-owner.js.
- **Other src**: src/bootstrap/shared/node-registration-owner-publication-methods.js,
  src/message-group/message-group-service-row-owner.js.
- **Design note**: section S3.8 appended.
- **Not touched**: partition-participant-transaction-bytes.js and its pin test.
