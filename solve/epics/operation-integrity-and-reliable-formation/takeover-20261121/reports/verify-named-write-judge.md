# Verification: named-write judge repairs (ab3e4b9af on 23344cddc)

Verifier: independent subagent, 2026-11-21. Read-only: git show / diff / grep at fixed refs and reads of the
retained lab files. Nothing was executed, no test was run, no worktree was written.
Subject: `work/line-regression-causes-20261121` = 0ddf7b00f (witnesses) -> ab3e4b9af (repairs).
Marking: **[V]** verified by reading the named ref/file or the named lab file; **[I]** inferred, not verified.

## Verdict: APPROVE-WITH-CONDITIONS

No safety defect is introduced by ab3e4b9af. The judge at ab3e4b9af is strictly tighter than at the base, and
the unknown answer no longer says "applied". The change is not complete against the project rules (systemic
repair, named states, one version of a shape), and merging it without its companions has a large test-time cost.

Conditions for the merge into the integration line:

1. **C1 (finding 5)** Repair the missed sibling of item 4: `src/partition/managed-split-workflow-state-methods.js:86`
   still reads the undefined `QUERY_ERROR_MSG.TABLE_PARTITION_TARGET_NODE_WAIT_TIMEOUT`. Widen the census test
   from `src/query` to all of `src`.
2. **C2 (finding 9)** Do not land ab3e4b9af ahead of the fixture migration (or bound the fakes' retry): four
   unmigrated files went from 8.3 s to 1565 s in the after-run, two of them to the 600 s file limit.
3. **C3 (finding 7)** The item-6 witness is red by design. Land it only together with its product edit, and
   that edit must also classify the new code where the admission codes are enumerated.
4. **C4 (findings 2, 3)** Record, with an owner, that UNKNOWN is still not a named outcome: the repaired answer
   has no `outcome`, and four consumers infer one from the missing field.
5. **C5 (finding 1)** Add the zero-participant shape to the judge witness and decide it explicitly: it is the
   one APPLIED verdict without a commit witness.

## Findings

### 1. Judge: one APPLIED without a witness (pre-existing, not in the 31-shape table) [V]
`src/control-plane/control-plane-named-write-outcome.js:116-117` (ab3e4b9af; unchanged from the base):

```
if (participantResults.length === 0) {
  return !attempt.unresolved && result.affectedRows === 0;
}
```

Minimal input, judged APPLIED on a first attempt:
`{success:true, affectedRows:0, partitions:[], mirrorPartitions:[], participantResults:[], idempotencyKey:KEY, operationId:'x'}`.
The coordinator emits exactly this for an UPDATE/DELETE plan with no partition statements
(`distributed-write-coordinator.js:140-160` builds participants only from `options.partitionIds`; `:389-405`
returns success with `affectedRowsField(0)`; `application-database-result.js:164-184` gives `affectedRows: 0`
for an empty set). The owner then reads "applied, 0 rows", which for a CAS UPDATE means "the row changed",
although no partition evaluated the statement. Whether the engine can pass an empty `partitionIds` for a
system table was not established [I].

My enumeration of every APPLIED input at ab3e4b9af [V]:
- A partition answer: `success === true`, `deferRetry !== true`, a consistent count (or the named
  unknown-count replay), `durableCommitWitness` an object, `partitionId` text on the answer, witness partition
  equal to the answer's and to the attempt's, `witness.entryId === deriveParticipantEntryId(key, partition)`,
  `logIndex > 0`, `term > 0`.
- The CDC wrapper `{success:true, committed:true, partitionResult}` whose partition result is one of these.
- A distributed answer with matching non-empty key, an `operationId`, exactly one primary, no mirror, and
  that one participant satisfying the first bullet, with the counts agreeing.
- The zero-participant case above.

Checks asked for:
- One witnessed participant cannot make a multi-participant write APPLIED: every participant must be bound to
  the attempt's single declared partition (`:114-115`) and `:119` requires one primary and no mirror [V].
  The converse is a liveness property: a named write with a mirror participant can never be APPLIED [I: no
  such plan was found for a system table].
- No comparison can still pass on two absent values: I read both files in full; each `===` has a proven-present
  or constant side [V].
- A replayed answer of an earlier attempt under the same key is APPLIED by design: the key is derived from
  name, instance nonce and content digest (`control-plane-write-identity.js` `holdNewInstance`), so the same
  key is the same content [V]. The settled replay carries `changes` and a witness built from the outcome row
  (`partition-committed-statement-outcome.js:290-310`), which the judge accepts [V].

Shapes missing from the author's table (all judged correctly by my reading, none witnessed):
zero participants; `success:false` carrying a valid witness (answers NOT_PROPOSED when it also carries a
refusal code: contradictory evidence resolved toward "not proposed"); `deferRetry:true` with a valid witness;
witness `term` absent/0 and `logIndex` 0/negative/string; right entry on the wrong partition with the answer on
the right one; array answer / array witness; two participants with one witnessed; count mismatch
(`affectedRows !== changes`).

Residual totality gap: `:149-150` recurses into `answer.partitionResult` without a depth bound; a
self-referencing answer (`a.partitionResult = a`) throws RangeError. Not producible by a serialized transport
answer [I]; "never throws" is not literally true.

Not witnessed on a real producer: FAILED and NOT_PROPOSED. The landed guard
`test/query/named-write-real-producer-applied.test.js` has three cases, all APPLIED [V]. A real committed
statement failure or NOT_LEADER refusal reaches the judge as the CDC's thrown error
(`cdc-integration-service-shared.js` `buildSystemTableMutationError`); it is definite only if that error
carries a top-level `partitionId` equal to its single nested failure (`singlePartitionFailureOf`, `:83-89`).
I could not confirm that it does. If it does not, every named write that fails by constraint is re-sent to
its bound.

### 2. The unknown answer has no named outcome; consumers infer one from the missing field [V]
`CONTROL_PLANE_MUTATION_OUTCOME` (`control-plane-system-table-gateway-constants.js:136-143`) has no UNKNOWN.
The repair deletes `outcome`/`completionState` and sets `contractState:'pending'`, `nextAction:'retry'`. What
each reader of the absent `outcome` now does:

| Consumer | With the repaired unknown answer |
|---|---|
| Gateway telemetry, `control-plane-system-table-gateway-telemetry.js:190-193` | counts it as `owner_not_ready` (default for a non-string outcome); before: `applied` |
| Gateway ledger, `...-mutation-submission.js` `executeMutationWithDiagnostics` | `outcome: null`, `success:false`, but `affectedRows` still taken from the carried transport answer |
| `classifyControlPlaneMutationResult` | `known:false, accepted:false, retryable:false, deferred:false, terminal:false, failed:true, applied:false`; before: `known:true, accepted:true` |
| `resolveControlPlaneMutationOutcomeSnapshot` (`...-mutation-contracts.js:160-190`) | `owner_not_ready` |
| Authoritative-row helper, `src/raft/authoritative-row-mutation-vocabulary.js:98-108` | reason `REJECTED` (the default of `let reason`), or `OBSERVED_STATE_CHANGED` when the carried answer has `affectedRows: 0`, because `zeroAffectedRows` is tested first and is not gated by `failed` |
| Join-admission withdrawal, `node-registration-owner-publication-methods.js:136-203` | `accepted:true, success:false, withdrawalDeferred:true` through the pending contract; same report as before |
| Admin route, `admin-owner-operations.js:165-174` | 503 `owner_not_ready` by `deferRetry`; no `mutationOutcome` in the body any more |
| System-metadata owner error, `system-metadata-owner-base.js:60-125` | throws with `deferRetry`; copies neither `failureCode` nor `pendingInstance` from a returned unknown answer |
| Register-service, `service-registration-handoff-owner.js:607-636` | reads the row back; if it does not match, 503 with `errorCode` defaulting to `BOOTSTRAP_NOT_READY` |

The author's claim "no consumer treated an unknown write as acknowledged" holds for the four readers it names
and for the others I read: every one decides on `applied`, `success` or `failed` first [V].
`control-plane-single-row-confirmation.js:16-25`, `nodes-owner.js:103` and `postgres-wire-scale-contract.js:72`
gate their zero-row branch on `failed` [V]. No reader takes `committed:true` alone as acknowledgement
(`membership-publication-coordinator-persist.js:210` also requires `success === true`) [V].
I did not read all ~40 call sites of the classifier line by line; those I skipped use only `.applied` [V by
grep of the flags each site reads].

REJECTED in the authoritative-row helper is a mislabel, not a behavioural defect: no code branches on that
reason, and `resolveMutationFailure` (`authoritative-row-mutation-helper.js:421-437`) schedules a retry for
every non-applied answer [V].

`nextAction:'retry'` drives nothing. Its only reader on a write answer is the join-admission classifier;
retries are decided by `deferRetry` and failure codes in `isRetryableControlPlaneError`
(`control-plane-error-classification.js:247-254, 312-328`) [V].

### 3. Two shapes of UNKNOWN; the repair covers the rare one [V]
`unresolvedAnswer` is used only when the attempt RETURNS an unsettled answer
(`control-plane-write-identity.js` `observedWriteResult`, state ANSWER). A genuine transport unknown is THROWN
by the CDC service, and the thrown path rethrows the error with the receipt symbol only: no `contractState`,
no `nextAction`, no forced `failureCode`, and the error keeps whatever `outcome`/`contractState`/`nextAction`
the CDC service copied onto it (`cdc-integration-service-shared.js:300-330`). The comment "The one shape of an
unresolved named write" overstates it. All 283/659 GCP unknowns are of the thrown shape [I from finding 4's
sample: every sampled line is a participant failure the CDC service throws]. The witness asserts the returned
shape only.

### 4. Retry cost on a real cluster [V from one node log, I for the conclusion]
Layers that re-send one logical write, all under the same key [V by reading]:
- the partition delivery owner inside one attempt;
- the CDC routed-mutation retry;
- `runRetryableControlPlaneWrite` (`retryable-control-plane-write.js:136-195`): default bound 30 s, delays
  100, 200, 400, 800 ms then 1 s, ended early by any non-retryable answer or a success;
- the named instance itself: a new content under the same name first re-delivers the held instance;
- owner loops above it (registration replay, heartbeat next beat, authoritative-row helper).

Two or more of these do retry the same write: one sampled line shows `"deliveries":3` for one entry and CDC
`"attempt":2` in the same failure.

Each re-send is a full named write (gateway, CDC, engine, coordinator, routed delivery to the leader). It is
answered without a new raft entry only when the entry is already settled, from the committed-statement
outcome row (`answerSettledStatement`), which is also what turns the retry into APPLIED and ends it [V by
reading; the in-flight case was not traced].

Counts in `gcp-formation-f580579a5-run1/.playback/report/fresh-formation-user-table-routability/868fba57-93a8-4256-8875-02228afbfe49.log`:

| Count | What |
|---|---|
| 48 | lines with `partition_write_outcome_unknown` |
| 38 | of those are distributed-write failures under a named-instance key (`cpw-<32 hex>`), 36 distinct keys |
| 38 of 38 | are INSERTs into `logs-p1` with "Message timeout" (log persistence through the logs owner) |
| 2 of 36 | keys show a second unknown under the same key, 7.8 s and 8.6 s after the first |
| 0 | spent `controlPlaneWriteRetryTimeoutMs` bounds |
| 1 | spent `cdc_routed_mutation_retry_budget` |
| 260 | "Wait bound spent" lines: 96 direct-delivery retry, 90 message timeout, 55 partition execution deadline, rest other |

Reading: on this node the 30 s loop never ran to its bound, an attempt on the saturated cluster takes about
8 s (so at most about 4 re-sends per unknown, not 34), and every named unknown is a diagnostic log row being
re-sent to a saturated logs partition. The retry loop is a plausible minor contributor to the formation pace
[I]; the spent waits are dominated by transport timeouts [V]. The other two node logs and run 2 were not
counted.

The repair does not change this frequency [V by reading]: a thrown typed unknown was retryable before and
after, the judge is not consulted for it (`settleInstance` short-circuits on a linked unknown), and no real
producer reached the removed TypeError. It does change the frequency for receipt-less answers that used to
throw a plain Error (fail fast) and are now a retryable typed unknown: that is finding 9.

### 5. Item 4 is not systemic: one undefined message member remains [V]
`src/partition/managed-split-workflow-state-methods.js:86` builds its timeout error with
`message: QUERY_ERROR_MSG.TABLE_PARTITION_TARGET_NODE_WAIT_TIMEOUT`. That member exists only in
`QUERY_LOG_MSG` (`src/query/query-constants.js:343`; `QUERY_ERROR_MSG` is lines 132-276). Same defect as the
repaired one, in the managed split workflow, untouched.

Method: every `QUERY_ERROR_MSG.<NAME>` under `src` at ab3e4b9af (83 distinct names) against the keys defined in
lines 132-276: exactly one undefined name, this one. The author's census is correct as worded (`src/query`
only) and the three added members exist and are referenced (`distributed-write-coordinator.js:505`,
`sql-query-engine-write-failure-methods.js:284`, `sql-query-engine-provisioning-admission-methods.js:290`).
Destructured or computed accesses are not covered by my grep.

Minor: `PRIMARY_KEY_REQUIRED` ("An INSERT row must carry its primary key...") is thrown for three causes at
`:504-509`: a table with no declared primary key, a missing composite key value, and zero or several known
partitions. The text names only the second.

### 6. Item 5 (`deferRetry` preserved): no regression found [V]
The builder has one caller, `service-registration-handoff-owner.js:639` (through the delegate at
`bootstrap-api.js:313`). Only an error that already says `deferRetry === true` changes status. One other
refusal on the same route changes from 500 to 503: "Replica cleanup is in progress" (`:612-617`, sets
`deferRetry` itself). I found no non-retryable failure that becomes retryable. The 503 body comes from the
same `buildBootstrapControlPlaneQueryError` as the other retryable answers, so it is typed the same way; its
code falls back to `BOOTSTRAP_NOT_READY` when the cause carries none.

### 7. Item 6 hand-off edit is incomplete, and its stated reason is wrong [V]
- The author says the clearing-trigger table does not enumerate `PLACEMENT_ADMISSION_ERROR`. It does:
  `replica-placement-owner-constants.js:177-178` at ab3e4b9af (OWNER_UNAVAILABLE, REPAIR_PENDING).
- On `work/placement-outcome-format-20261121` (ce2d8e18f74f) `replica-placement-owner-constants.js:170-198`
  declares `PLACEMENT_DEFINITE_ANSWER_CODES` with every admission error, including the sibling coordinator-side
  refusal `REMOVE_INTENT_UNSCOPED`, under the rule "A code reachable on the admission path that is in neither
  declaration is a defect". `REPLICA_IDENTITY_NOT_ADMITTED` must be added there as DEFINITE.
- `placement-admission-attempt.js:14-19` (`STATIC_PRE_PROPOSAL_FAILURE_CODES`) lists the same sibling. The
  throw at `rebalance-coordinator-operation-creation-support.js:528` passes no answer, so this set is not
  consulted for it today [V]; whether the new code belongs there is the owner's call.
- No consumer branches on the thrown BYTES code specifically, so the two-line edit is behaviour-neutral at
  ab3e4b9af [V by grep of the member and its literal].
- `test/rebalancer/placement-explicit-replica-refusal-code.test.js` is red at ab3e4b9af by design.

### 8. Item 3 (bootstrap window) [V for what I read, I for the rest]
- Window as stated: `seed-registration-phase.js:126` to `seed-cache-hydration-phase.js:278`
  (`swapSystemTableWriter` at `seed-registration-phase.js:719-739`) [V].
- Registration writes go through `BootstrapSystemTableWriter` straight to the CDC service
  (`system-table-writer.js:14-50`); dynamic configuration is seeded with `useDirectCdcMutations: true`
  (`seed-registration-phase.js:540-548`). Neither passes the named path [V].
- Log persistence, the largest source of named writes in the GCP log, starts only after readiness
  (`entrypoint-runtime-shutdown-lifecycle.js:92-112`) [V].
- Bootstrap mode is a flag on the shared CDC service, so the claim depends on no other owner writing through
  a gateway during the window. I did not verify the heartbeat, registration and latency owners' start
  points; that part rests on the author's reading [I].
- "Loses idempotence": inside one call the lane itself re-executes. When the raft lane fails or throws,
  including after the entry was proposed, `cdc-bootstrap-direct-sql.js:139-178` runs the same SQL directly on
  the local replica, outside raft, under no key. That is a second execution of one write and a fallback path
  (project rule). A second ENTRY is therefore possible in practice; a duplicate ROW is not for tables with a
  primary key (the second INSERT fails or the upsert is idempotent) [I: I did not check every bootstrap
  table's key or what the callers do with that failure].

### 9. Unmigrated fakes are now slow instead of failing fast [V]
Same four files, probe run at b07094a76 versus after-run at ab3e4b9af (`test-results.ndjson` of each):

| File | Before | After |
|---|---|---|
| control-plane/service-instance-creation-cas | 2.1 s, 31 assertions | 600.0 s (file limit), 2 assertions |
| runtime/service-runtime-consensus-publication | 1.9 s, 16 assertions | 600.0 s (file limit), 11 assertions |
| integration/control-plane-postgres-wire-scale | 1.5 s, 27 assertions | 121.5 s, 13 assertions |
| wasm-service/bound-remove-physical-operation | 2.8 s | 243.5 s |

The after-run log has 59 "Wait bound spent" lines, 54 of them `controlPlaneWriteRetryTimeoutMs` with
`boundMs:30000, attempts:34`, which confirms the author's 34-attempts figure. The PG-wire route spends the
30 s bound several times in sequence inside one operator request (three spent bounds logged, 121.5 s total),
so the bound stacks across an owner's sequential writes. The same file then fails a second case with an
unhandled `TypeError: The database connection is not open` (the `.err` file), a side effect of the long first
case. The author counts about 23 red files on these fakes, 14 on one fixture; at up to 600 s each this is
hours of serial lab time and fewer assertions executed per file. It is correct product behaviour and a real
cost to the corpus budget.

### 10. `write-exactly-once-property` is an unmigrated test of an intended contract [V]
d471620a9 ("Require a canonical system participant before named write delivery") added the refusal in
`runControlPlaneWrite` for a named write whose route has no declared system partition, and pinned it in the
same commit: `test/query/write-identity-instance.test.js`, case "exact-case user SQL cannot spend the named
system write path", asserts `CONTROL_PLANE_NAMED_WRITE_SCOPE_REQUIRED`. The property test issues its "named
birth" writes with `writeIdentity` through `gateway.executeQuery` on `USER_TABLE`
(`write-exactly-once-property.test.js:55, 193-198`); the lab log shows that refusal text for those writes
(`lr-s2-guards-before-0ddf7b00f-1`, log lines 34 onward). Not a product regression. Consequence: named
instances have no exactly-once check under random faults until the test moves to a system table.

## Lab claims confirmed by sha, file and case [V]

- Red-before at 0ddf7b00f (`lr-s2-red-0ddf7b00f-1`): four red, one green.
  `named-write-outcome-total` shows three `reading 'partitionId'` throws, one `reading 'committed'`, one
  missing-attempt throw and one `applied` for the keyless distributed shape; case 2 fails on `outcome:
  'applied'`. `provisioning-deadline-error-message` 3 of 3 red. `register-service-retryable-refusal` red with
  500. `placement-explicit-replica-refusal-code` red. `named-write-real-producer-applied` green.
- Guards before (`lr-s2-guards-before-0ddf7b00f-1`): 7 of 8 green; `write-exactly-once-property` red.
- After at ab3e4b9af (`lr-s2-after-ab3e4b9af-1`): 13 of 23 green. The ten red files and their states match the
  author's table: heartbeat-memory-trend, create-table-quorum, placement-explicit (by design),
  write-exactly-once-property, service-instance-creation-cas (600 s), service-runtime-consensus-publication
  (600 s), node-registration-idempotency, bootstrap-api, postgres-wire-scale (121 s),
  bound-remove-physical-operation (243 s).

## Author claims I could not confirm

- That a real committed statement failure or pre-proposal refusal is judged FAILED / NOT_PROPOSED through the
  CDC thrown error (finding 1, last paragraph).
- That no named write runs in the bootstrap window, beyond the registration phase and log persistence
  (finding 8).
- The 283 and 659 totals: I counted one node log of run 1 (48).
- "No consumer acted on the stale applied", for the classifier call sites I checked by grep only.
- That no production planner sends `replicaId` on a partition ADD (item 6): not examined.
